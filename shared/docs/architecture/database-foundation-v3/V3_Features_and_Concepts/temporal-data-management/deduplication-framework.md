# Deduplication Framework

**Status**: Complete Implementation Specification  
**Purpose**: Define the core logic for identifying and handling duplicate clinical entities across multiple document uploads

## Overview

The deduplication framework ensures that Exora maintains a single "current" row per clinical entity (that is destined for the user facing side) while preserving complete historical context. This system operates deterministically using medical codes and temporal precedence, requiring no AI decision-making.

**Key Dependencies**:
- Medical codes from [`../medical-code-resolution/embedding-based-code-matching.md`](../medical-code-resolution/embedding-based-code-matching.md)
- Clinical identity policies from [`./clinical-identity-policies.md`](./clinical-identity-policies.md)
- Temporal conflict resolution from [`./temporal-conflict-resolution.md`](./temporal-conflict-resolution.md)

## Core Deduplication Architecture

### Medical Code-Based Grouping

The foundation of deduplication relies on accurate medical code assignment from the **medical-code-resolution** system:

```typescript
// Post-Pass 2 Processing Pipeline
const deduplicationWorkflow = async (clinicalEvents: ClinicalEvent[]) => {
  // 1. Group by clinical identity (requires medical codes)
  const groupedEntities = groupByClinicalIdentity(clinicalEvents);
  
  // 2. Apply temporal analysis within each group
  for (const group of groupedEntities) {
    await applySupersessionLogic(group);
  }
  
  // 3. Update database with supersession chains
  await persistSupersessionDecisions(groupedEntities);
};
```

**Dependencies**:
- **Medical Code Assignment**: See [`../medical-code-resolution/pass1-to-pass2-enhancement.md`](../medical-code-resolution/pass1-to-pass2-enhancement.md) for code accuracy requirements
- **Clinical Identity Keys**: Defined in [`./clinical-identity-policies.md`](./clinical-identity-policies.md)

### Four Deterministic Supersession Types

#### 1. EXACT_DUPLICATE
**Logic**: All significant fields identical between records
```sql
-- Example: Same medication in discharge summary and GP letter
WHERE old.rxnorm_scd = new.rxnorm_scd 
  AND old.dose_amount = new.dose_amount
  AND old.frequency = new.frequency
  AND old.route = new.route
```
**Action**: Mark older record as superseded
**Reason**: `"exact_duplicate_consolidated"`

#### 2. PARAMETER_CHANGE
**Logic**: Same clinical entity with modified parameters
```sql
-- Example: Lisinopril dose change 10mg → 20mg
WHERE old.rxnorm_scd = new.rxnorm_scd 
  AND (old.dose_amount != new.dose_amount 
       OR old.frequency != new.frequency)
```
**Action**: Mark older record as superseded
**Reason**: `"parameter_change:dose_10mg_to_20mg"` or specific change type

#### 3. STATUS_CHANGE  
**Logic**: Same entity with different clinical status
```sql
-- Example: Active medication → Discontinued
WHERE old.rxnorm_scd = new.rxnorm_scd
  AND old.status != new.status
```
**Action**: Mark older record as superseded
**Reason**: `"status_change:active_to_discontinued"`

#### 4. TEMPORAL_ONLY (Failsafe)
**Logic**: Same entity, newer clinical date, unclear specific change
```sql
-- When other supersession types don't apply but temporal precedence exists
WHERE old.clinical_identity_key = new.clinical_identity_key
  AND new.clinical_effective_date > old.clinical_effective_date
```
**Action**: Mark older record as superseded (temporal precedence failsafe)
**Reason**: `"temporal_supersession"`

## Implementation Architecture

### Post-Processing Engine

Runs immediately after Pass 2 completes, before Pass 3 narrative creation:

```typescript
// Post-Pass 2 Normalization Function
export async function normalizeClinicaTakientities(
  shellFileId: string,
  clinicalEvents: Pass2Output[]
): Promise<NormalizationResult> {
  
  // 1. Load existing patient entities for comparison
  const existingEntities = await loadPatientEntities(patientId);
  
  // 2. Group new + existing by clinical identity
  const groupedForAnalysis = await groupByClinicalIdentity([
    ...existingEntities,
    ...clinicalEvents
  ]);
  
  // 3. Apply deterministic supersession logic
  const supersessionDecisions = await Promise.all(
    groupedForAnalysis.map(group => analyzeSupersession(group))
  );
  
  // 4. Execute database updates atomically
  return await executeSupersessionChain(supersessionDecisions);
}
```

### Clinical Identity Grouping

**Reference**: [`./clinical-identity-policies.md`](./clinical-identity-policies.md) for detailed identity rules

```sql
-- Medication Identity Example
CREATE OR REPLACE FUNCTION get_medication_identity_key(
  p_rxnorm_scd TEXT,
  p_route TEXT,
  p_dose_form TEXT
) RETURNS TEXT AS $$
BEGIN
  -- Use SCD-level identity when available
  IF p_rxnorm_scd IS NOT NULL THEN
    RETURN 'rxnorm_scd:' || p_rxnorm_scd;
  END IF;
  
  -- Fallback to composite key
  RETURN 'composite:' || COALESCE(p_route, 'unknown') || 
         ':' || COALESCE(p_dose_form, 'unknown');
END;
$$ LANGUAGE plpgsql;
```

### Database Schema for Temporal Tracking

**Reference**: [`../implementation-planning/database-schema-migrations.md`](../implementation-planning/database-schema-migrations.md) for complete migration scripts

```sql
-- Required fields for ALL clinical entity tables
ALTER TABLE patient_medications ADD COLUMN
  valid_from TIMESTAMP NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMP NULL,
  superseded_by_record_id UUID REFERENCES patient_medications(id),
  supersession_reason TEXT,
  is_current BOOLEAN GENERATED ALWAYS AS (valid_to IS NULL) STORED,
  clinical_identity_key TEXT,
  clinical_effective_date DATE,
  date_confidence TEXT CHECK (date_confidence IN ('high', 'medium', 'low', 'conflicted'));

-- Performance index for current records
CREATE INDEX idx_medications_current ON patient_medications (patient_id, is_current) 
  WHERE is_current = true;

-- Index for supersession chains
CREATE INDEX idx_medications_supersession ON patient_medications (superseded_by_record_id);
```

## Supersession Decision Functions

### Temporal Precedence Analysis

**Reference**: [`./temporal-conflict-resolution.md`](./temporal-conflict-resolution.md) for date hierarchy details

```typescript
function determineSupersession(
  existingEntity: ClinicalEntity, 
  newEntity: ClinicalEntity
): SupersessionDecision {
  
  // 1. Check for exact duplication
  if (areExactDuplicates(existingEntity, newEntity)) {
    return {
      type: 'EXACT_DUPLICATE',
      supersede: existingEntity.id,
      reason: 'exact_duplicate_consolidated',
      confidence: 1.0
    };
  }
  
  // 2. Check for parameter changes
  const parameterChange = detectParameterChange(existingEntity, newEntity);
  if (parameterChange.detected) {
    return {
      type: 'PARAMETER_CHANGE',
      supersede: existingEntity.id,
      reason: `parameter_change:${parameterChange.description}`,
      confidence: 0.95
    };
  }
  
  // 3. Check for status changes
  if (existingEntity.status !== newEntity.status) {
    return {
      type: 'STATUS_CHANGE', 
      supersede: existingEntity.id,
      reason: `status_change:${existingEntity.status}_to_${newEntity.status}`,
      confidence: 0.90
    };
  }
  
  // 4. Apply temporal precedence (failsafe)
  if (newEntity.clinical_effective_date > existingEntity.clinical_effective_date) {
    return {
      type: 'TEMPORAL_ONLY',
      supersede: existingEntity.id,
      reason: 'temporal_supersession',
      confidence: 0.75
    };
  }
  
  // 5. No supersession needed
  return { type: 'NO_SUPERSESSION' };
}
```

## Safety Guarantees and Audit Trail

### Complete Provenance Preservation

```sql
-- Audit table for all supersession decisions
CREATE TABLE clinical_entity_supersession_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES user_profiles(id),
  superseded_entity_id UUID NOT NULL,
  superseding_entity_id UUID NOT NULL,
  supersession_type TEXT NOT NULL,
  supersession_reason TEXT NOT NULL,
  confidence_score DECIMAL(3,2),
  shell_file_trigger UUID REFERENCES shell_files(id),
  decision_metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Error Handling and Edge Cases

```typescript
// Safe supersession with rollback capability
async function executeSupersessionChain(
  decisions: SupersessionDecision[]
): Promise<SupersessionResult> {
  
  const transaction = await db.begin();
  
  try {
    // Validate all decisions before execution
    await validateSupersessionDecisions(decisions);
    
    // Execute supersessions atomically
    for (const decision of decisions) {
      await applySupersession(decision, transaction);
      await logSupersessionAudit(decision, transaction);
    }
    
    await transaction.commit();
    return { success: true, decisionsApplied: decisions.length };
    
  } catch (error) {
    await transaction.rollback();
    
    // Log error for investigation
    await logSupersessionError(decisions, error);
    
    return { 
      success: false, 
      error: error.message,
      fallbackStrategy: 'TEMPORAL_ONLY_CONSERVATIVE'
    };
  }
}
```

## Integration with Medical Code Resolution

**Critical Dependency**: Accurate medical code assignment from the **medical-code-resolution** system is essential for safe deduplication.

### Medical Code Requirements

**Reference**: [`../medical-code-resolution/embedding-based-code-matching.md`](../medical-code-resolution/embedding-based-code-matching.md)

1. **95%+ Code Assignment Rate**: Deduplication relies on consistent medical coding
2. **Appropriate Granularity**: Must use SCD/SBD level codes, not ingredient-level
3. **Australian Specificity**: PBS/MBS codes for local healthcare compliance
4. **Confidence Scoring**: Low-confidence codes trigger conservative deduplication

### Fallback for Missing Codes

```typescript
// When medical codes unavailable, use conservative identity
function createFallbackIdentityKey(entity: ClinicalEntity): string {
  if (entity.medical_codes.confidence < 0.7) {
    // Conservative: create unique identity to prevent unsafe merging
    return `fallback:${entity.id}:${entity.extracted_text_hash}`;
  }
  
  // Use available partial codes with caution
  return `partial:${entity.entity_type}:${entity.normalized_name}`;
}
```

## Frontend Query Patterns

### Current State Queries (Primary Use Case)

```sql
-- Get all active medications for patient dashboard
SELECT m.*, mr.generic_name, mr.drug_class
FROM patient_medications m
LEFT JOIN medication_reference mr ON mr.rxnorm_scd = m.rxnorm_scd
WHERE m.patient_id = $1 
  AND m.is_current = true  -- Uses generated column
ORDER BY m.start_date DESC;
```

### Historical Analysis Queries

```sql
-- Get complete medication history for clinical review
SELECT 
  m.*,
  m.supersession_reason,
  superseding.medication_name as superseded_by,
  superseding.clinical_effective_date as superseded_date
FROM patient_medications m
LEFT JOIN patient_medications superseding 
  ON superseding.id = m.superseded_by_record_id
WHERE m.patient_id = $1 
  AND m.clinical_identity_key = $2
ORDER BY m.clinical_effective_date DESC;
```

## Performance Optimization

**Reference**: [`../implementation-planning/performance-optimization-targets.md`](../implementation-planning/performance-optimization-targets.md)

### Indexing Strategy
- **Current record queries**: Partial index on `is_current = true`
- **Identity grouping**: Index on `clinical_identity_key`
- **Temporal queries**: Composite index on `(patient_id, clinical_effective_date)`
- **Supersession chains**: Index on `superseded_by_record_id`

### Response Time Targets
- **Current medication list**: < 100ms (clinical workflow)
- **Historical analysis**: < 500ms (comprehensive review)
- **Deduplication processing**: < 2s per document (background)

## User Edit Integration

### Dashboard Edit Workflow

When users edit clinical data through the dashboard:

```typescript
async function handleUserEdit(
  patientId: string,
  editData: UserClinicalEdit
): Promise<void> {
  
  // 1. Create pseudo clinical event with user context
  const userGeneratedEvent = {
    ...editData,
    source: 'user_generated',
    shell_file_id: null,
    clinical_effective_date: editData.effective_date || new Date(),
    date_confidence: editData.effective_date ? 'high' : 'low'
  };
  
  // 2. Process through same deduplication pipeline
  await normalizeClinicaEntities(null, [userGeneratedEvent]);
  
  // 3. Update related narratives
  await updateAffectedNarratives(patientId, userGeneratedEvent);
}
```

## Success Criteria

### Technical Validation
- **95%+ deduplication accuracy** for duplicate clinical entities
- **<1% false positive rate** on entity merging
- **100% historical data preservation** through supersession chains
- **Sub-second response times** for current state queries

### Clinical Safety
- **Zero unsafe merging** of clinically distinct entities
- **Complete audit trail** for all supersession decisions
- **Deterministic outcomes** requiring no manual review
- **Regulatory compliance** with healthcare data standards

## Next Steps

1. **Implement medical code resolution**: Complete [`../medical-code-resolution/embedding-based-code-matching.md`](../medical-code-resolution/embedding-based-code-matching.md)
2. **Define clinical identity policies**: Finalize [`./clinical-identity-policies.md`](./clinical-identity-policies.md)
3. **Create database migrations**: Execute [`../implementation-planning/database-schema-migrations.md`](../implementation-planning/database-schema-migrations.md)
4. **Build post-processing engine**: Implement the normalization functions
5. **Integrate with narrative system**: Connect to [`../narrative-architecture/narrative-versioning-supersession.md`](../narrative-architecture/narrative-versioning-supersession.md)

This framework provides the foundation for V4's temporal data management while ensuring clinical safety and regulatory compliance.