# Temporal Conflict Resolution

**Status**: Complete Implementation Specification  
**Purpose**: Define the date hierarchy and precedence rules for resolving conflicting temporal information in healthcare documents

## Overview

Healthcare documents contain multiple types of dates that may conflict. This framework provides deterministic rules for resolving temporal conflicts while preserving clinical timeline accuracy and maintaining complete audit trails.

**Key Integration Points**:
- Used by [`./deduplication-framework.md`](./deduplication-framework.md) for supersession decisions
- Supports [`./clinical-identity-policies.md`](./clinical-identity-policies.md) temporal matching
- Integrates with [`../universal-date-format-management.md`](../universal-date-format-management.md) for date normalization
- Referenced by [`../implementation-planning/database-schema-migrations.md`](../implementation-planning/database-schema-migrations.md)

## Date Hierarchy Framework

### Primary Date Sources (In Order of Preference)

#### 1. Explicit Clinical Dates (Highest Priority)
**Source**: Extracted from document content by Pass 2 AI processing  
**Examples**: 
- "Started Lisinopril on January 15, 2024"
- "Surgery performed March 3, 2024"
- "Lab drawn 2024-02-20"

**Confidence**: `'high'` when clearly stated, `'medium'` when inferred

#### 2. Document Dates (Secondary)
**Source**: Date information from the medical document itself  
**Examples**:
- Letter date on medical correspondence
- Report date on lab results
- Visit date on discharge summaries

**Confidence**: `'medium'` for formal medical documents, `'low'` for informal notes

#### 3. File Metadata Dates (Tertiary)
**Source**: File creation/modification timestamps  
**Examples**:
- PDF creation date
- Image capture timestamp
- Document scan date

**Confidence**: `'low'` due to potential technical modifications

#### 4. Upload Timestamp (Fallback)
**Source**: When file was uploaded to Exora  
**Usage**: Final fallback when no other dates available  
**Confidence**: `'low'` with clear provenance marking

## Date Extraction and Storage Schema

### Database Fields for Temporal Tracking

**Reference**: [`../implementation-planning/database-schema-migrations.md`](../implementation-planning/database-schema-migrations.md) for complete migration scripts

```sql
-- Required fields for ALL clinical entity tables
ALTER TABLE patient_clinical_events ADD COLUMN
  -- Primary clinical date (resolved)
  clinical_effective_date DATE NOT NULL,
  
  -- All extracted dates for audit
  extracted_dates JSONB DEFAULT '[]',
  
  -- Date confidence and source
  date_confidence TEXT CHECK (date_confidence IN ('high', 'medium', 'low', 'conflicted')),
  date_source TEXT CHECK (date_source IN ('clinical_content', 'document_date', 'file_metadata', 'upload_timestamp', 'user_provided')),
  
  -- Conflict resolution metadata
  date_conflicts JSONB DEFAULT '[]',
  date_resolution_reason TEXT,
  
  -- System dates
  created_at TIMESTAMP DEFAULT NOW(),
  shell_file_upload_date TIMESTAMP NOT NULL;
```

### Date Storage Format

**Note**: All dates are normalized by [`../universal-date-format-management.md`](../universal-date-format-management.md) before temporal analysis.

```typescript
interface DateExtraction {
  extracted_dates: {
    source: 'clinical_content' | 'document_date' | 'file_metadata' | 'upload_timestamp';
    date_value: string; // Always ISO format after universal processing
    confidence: number; // 0.0 to 1.0
    extraction_method: string;
    context: string; // Surrounding text for clinical dates
    
    // Integration with Universal Date Format Management
    universal_format_result: {
      original_format: string;
      detected_format: string;
      format_confidence: number;
      ambiguity_flags: string[];
      document_origin: string;
    };
  }[];
  
  date_conflicts?: {
    conflicting_dates: string[];
    resolution_applied: string;
    resolution_reason: string;
    confidence_after_resolution: number;
    format_normalization_notes?: string; // Notes on format conversion issues
  }[];
}
```

## Conflict Resolution Algorithm

### Primary Date Resolution Function

```typescript
function resolveClinicalDate(
  extractedDates: DateExtraction[],
  shellFileContext: ShellFileMetadata
): ResolvedDate {
  
  // 1. Filter and validate all dates
  const validDates = extractedDates.filter(date => isValidDate(date.date_value));
  
  // 2. Apply hierarchy-based selection
  const hierarchyResult = applyDateHierarchy(validDates, shellFileContext);
  
  // 3. Handle conflicts within same hierarchy level
  if (hierarchyResult.conflicts.length > 0) {
    return resolveConflictsWithinLevel(hierarchyResult);
  }
  
  // 4. Return resolved date with metadata
  return {
    clinical_effective_date: hierarchyResult.selectedDate,
    date_confidence: hierarchyResult.confidence,
    date_source: hierarchyResult.source,
    resolution_metadata: hierarchyResult.metadata
  };
}
```

### Hierarchy-Based Selection Logic

```typescript
function applyDateHierarchy(
  dates: DateExtraction[],
  shellFileContext: ShellFileMetadata
): HierarchyResult {
  
  // Priority 1: Explicit clinical dates from content
  const clinicalDates = dates.filter(d => d.source === 'clinical_content');
  if (clinicalDates.length === 1) {
    return { selectedDate: clinicalDates[0], confidence: 'high', conflicts: [] };
  }
  if (clinicalDates.length > 1) {
    return { conflicts: clinicalDates, needsResolution: true };
  }
  
  // Priority 2: Document dates
  const documentDates = dates.filter(d => d.source === 'document_date');
  if (documentDates.length === 1) {
    return { selectedDate: documentDates[0], confidence: 'medium', conflicts: [] };
  }
  if (documentDates.length > 1) {
    return { conflicts: documentDates, needsResolution: true };
  }
  
  // Priority 3: File metadata dates
  const metadataDates = dates.filter(d => d.source === 'file_metadata');
  if (metadataDates.length >= 1) {
    // Use earliest metadata date (likely creation)
    const earliest = metadataDates.sort((a, b) => 
      new Date(a.date_value).getTime() - new Date(b.date_value).getTime()
    )[0];
    return { selectedDate: earliest, confidence: 'low', conflicts: [] };
  }
  
  // Priority 4: Upload timestamp (fallback)
  return {
    selectedDate: { 
      date_value: shellFileContext.upload_timestamp,
      source: 'upload_timestamp'
    },
    confidence: 'low',
    conflicts: []
  };
}
```

### Conflict Resolution Within Same Level

```typescript
function resolveConflictsWithinLevel(
  conflictResult: HierarchyResult
): ResolvedDate {
  
  const conflicts = conflictResult.conflicts;
  
  // Strategy 1: Use highest confidence date
  const highestConfidence = conflicts.reduce((max, current) => 
    current.confidence > max.confidence ? current : max
  );
  
  if (highestConfidence.confidence > 0.8) {
    return {
      clinical_effective_date: highestConfidence.date_value,
      date_confidence: 'medium', // Reduced due to conflict
      resolution_reason: 'highest_confidence_selected',
      date_conflicts: conflicts.map(c => c.date_value)
    };
  }
  
  // Strategy 2: Clinical reasoning for medical dates
  if (conflicts[0].source === 'clinical_content') {
    return resolveClinicalDateConflicts(conflicts);
  }
  
  // Strategy 3: Conservative approach - use earliest date
  const earliestDate = conflicts.reduce((earliest, current) => 
    new Date(current.date_value) < new Date(earliest.date_value) ? current : earliest
  );
  
  return {
    clinical_effective_date: earliestDate.date_value,
    date_confidence: 'conflicted',
    resolution_reason: 'earliest_date_conservative',
    date_conflicts: conflicts.map(c => c.date_value)
  };
}
```

## Clinical Date Conflict Resolution

### Medical Context-Aware Resolution

```typescript
function resolveClinicalDateConflicts(
  clinicalDates: DateExtraction[]
): ResolvedDate {
  
  // Analyze clinical context for date resolution
  for (const date of clinicalDates) {
    const context = date.context.toLowerCase();
    
    // Prioritize specific clinical actions
    if (context.includes('started') || context.includes('prescribed')) {
      return {
        clinical_effective_date: date.date_value,
        date_confidence: 'medium',
        resolution_reason: 'clinical_action_prioritized',
        context_used: date.context
      };
    }
    
    // Prioritize procedure dates
    if (context.includes('surgery') || context.includes('procedure')) {
      return {
        clinical_effective_date: date.date_value,
        date_confidence: 'medium',
        resolution_reason: 'procedure_date_prioritized'
      };
    }
  }
  
  // Fallback to chronological order
  const chronological = clinicalDates.sort((a, b) => 
    new Date(a.date_value).getTime() - new Date(b.date_value).getTime()
  );
  
  return {
    clinical_effective_date: chronological[0].date_value,
    date_confidence: 'conflicted',
    resolution_reason: 'chronological_earliest',
    date_conflicts: clinicalDates.map(d => d.date_value)
  };
}
```

## Integration with Deduplication Framework

### Temporal Precedence for Supersession

**Reference**: [`./deduplication-framework.md`](./deduplication-framework.md) supersession logic

```typescript
function compareTemporalPrecedence(
  entity1: ClinicalEntity,
  entity2: ClinicalEntity
): TemporalComparison {
  
  // 1. Compare clinical effective dates
  const date1 = new Date(entity1.clinical_effective_date);
  const date2 = new Date(entity2.clinical_effective_date);
  
  if (date1.getTime() !== date2.getTime()) {
    return {
      hasTemporalPrecedence: date2 > date1,
      precedenceReason: 'clinical_effective_date',
      confidence: Math.min(entity1.date_confidence_numeric, entity2.date_confidence_numeric)
    };
  }
  
  // 2. If dates equal, compare date confidence
  if (entity1.date_confidence !== entity2.date_confidence) {
    const confidenceOrder = { 'high': 3, 'medium': 2, 'low': 1, 'conflicted': 0 };
    return {
      hasTemporalPrecedence: confidenceOrder[entity2.date_confidence] > confidenceOrder[entity1.date_confidence],
      precedenceReason: 'date_confidence_higher',
      confidence: 0.7
    };
  }
  
  // 3. If still tied, use upload sequence as tiebreaker
  return {
    hasTemporalPrecedence: entity2.shell_file_upload_date > entity1.shell_file_upload_date,
    precedenceReason: 'upload_sequence_tiebreaker',
    confidence: 0.5
  };
}
```

## Edge Case Handling

### Scenario 1: Outdated Documents Uploaded Later

**Problem**: User uploads older medical records after newer ones  
**Example**: 
- Upload 1 (Jan 1, 2025): Discharge summary - "Lisinopril discontinued Dec 2024"
- Upload 2 (Jan 2, 2025): Old GP letter from Nov 2024 - "Patient on Lisinopril 10mg daily"

**Resolution**:
```typescript
function handleOutdatedDocuments(
  existingEntity: ClinicalEntity,
  newEntity: ClinicalEntity
): SupersessionDecision {
  
  // Compare clinical dates, not upload dates
  if (newEntity.clinical_effective_date < existingEntity.clinical_effective_date) {
    return {
      type: 'TEMPORAL_ONLY',
      supersede: newEntity.id, // Supersede the older clinical information
      reason: 'clinically_outdated_information',
      confidence: 0.8,
      temporal_note: `New upload (${newEntity.clinical_effective_date}) predates existing (${existingEntity.clinical_effective_date})`
    };
  }
  
  // Standard temporal precedence applies
  return standardTemporalPrecedence(existingEntity, newEntity);
}
```

### Scenario 2: Missing Date Information

```typescript
function handleMissingDates(
  entity: ClinicalEntity,
  shellFileContext: ShellFileMetadata
): DateAssignment {
  
  // Use shell file upload date as fallback
  return {
    clinical_effective_date: shellFileContext.upload_date,
    date_confidence: 'low',
    date_source: 'upload_timestamp',
    resolution_reason: 'no_clinical_date_available',
    requires_user_review: true
  };
}
```

### Scenario 3: User-Provided Date Corrections

**Reference**: User edit integration from [`./deduplication-framework.md`](./deduplication-framework.md)

```typescript
function handleUserDateCorrection(
  userEdit: UserClinicalEdit,
  existingEntity: ClinicalEntity
): DateCorrectionResult {
  
  // User-provided dates get high confidence
  const correctedEntity = {
    ...existingEntity,
    clinical_effective_date: userEdit.corrected_date,
    date_confidence: 'high',
    date_source: 'user_provided',
    date_correction_metadata: {
      original_date: existingEntity.clinical_effective_date,
      corrected_by_user: userEdit.user_id,
      correction_timestamp: new Date().toISOString(),
      correction_reason: userEdit.reason
    }
  };
  
  // Process through standard deduplication pipeline
  return processUserCorrection(correctedEntity);
}
```

## Integration with Universal Date Format Management

### Date Normalization Dependencies

**Critical**: All date processing in temporal conflict resolution assumes dates have been **normalized to ISO format** by the [`../universal-date-format-management.md`](../universal-date-format-management.md) system.

```typescript
// Temporal resolution operates on pre-normalized dates
interface NormalizedDateInput {
  iso_date: string;              // Output from Universal Date Management
  source: DateSource;
  confidence: number;            // Combined extraction + format confidence
  original_context: string;
  
  // Metadata from universal normalization
  format_metadata: {
    original_format: string;
    detected_format: string;
    document_origin: string;
    ambiguity_flags: string[];
    alternative_interpretations?: string[];
  };
}

function processTemporalConflicts(
  normalizedDates: NormalizedDateInput[]
): TemporalResolution {
  
  // Focus on WHICH date to use, not HOW to interpret raw dates
  // Universal Date Management has already handled format interpretation
  
  return applyDateHierarchy(normalizedDates, shellFileContext);
}
```

### Format Confidence Integration

```typescript
function incorporateFormatConfidence(
  dateExtraction: NormalizedDateInput
): AdjustedConfidence {
  
  // Combine extraction confidence with format detection confidence
  const extractionConfidence = dateExtraction.confidence;
  const formatConfidence = dateExtraction.format_metadata.format_confidence;
  
  // Conservative approach: use the lower confidence
  const combinedConfidence = Math.min(extractionConfidence, formatConfidence);
  
  // Apply penalties for ambiguity flags
  let adjustedConfidence = combinedConfidence;
  if (dateExtraction.format_metadata.ambiguity_flags.includes('format_ambiguous')) {
    adjustedConfidence *= 0.8;
  }
  if (dateExtraction.format_metadata.ambiguity_flags.includes('low_confidence_origin')) {
    adjustedConfidence *= 0.9;
  }
  
  return {
    final_confidence: adjustedConfidence,
    confidence_components: {
      extraction: extractionConfidence,
      format_detection: formatConfidence,
      ambiguity_penalty: combinedConfidence - adjustedConfidence
    },
    requires_user_verification: adjustedConfidence < 0.7
  };
}
```

## Audit Trail and Compliance

### Complete Date Decision Logging

```sql
-- Audit table for all temporal decisions
CREATE TABLE temporal_resolution_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES user_profiles(id),
  clinical_entity_id UUID NOT NULL,
  shell_file_id UUID NOT NULL REFERENCES shell_files(id),
  
  -- Original date extraction
  extracted_dates JSONB NOT NULL,
  
  -- Resolution decision
  resolved_date DATE NOT NULL,
  date_confidence TEXT NOT NULL,
  date_source TEXT NOT NULL,
  resolution_algorithm TEXT NOT NULL,
  
  -- Conflict information
  date_conflicts JSONB DEFAULT '[]',
  resolution_reason TEXT,
  
  -- Audit metadata
  created_at TIMESTAMP DEFAULT NOW(),
  processing_version TEXT
);
```

### Privacy Act 1988 Compliance

```typescript
function logTemporalDecision(
  decision: TemporalResolution,
  auditContext: AuditContext
): Promise<void> {
  
  // Log decision with privacy-compliant metadata
  return auditLogger.logTemporalResolution({
    patient_id: decision.patient_id,
    decision_summary: decision.resolution_reason,
    confidence_level: decision.date_confidence,
    
    // Exclude PII from audit logs
    extracted_dates_count: decision.extracted_dates.length,
    conflicts_resolved_count: decision.date_conflicts?.length || 0,
    
    // Compliance metadata
    processing_location: 'Australia',
    data_residency_compliant: true,
    retention_policy: '7_years_healthcare_records'
  });
}
```

## Performance Optimization

**Reference**: [`../implementation-planning/performance-optimization-targets.md`](../implementation-planning/performance-optimization-targets.md)

### Indexing for Temporal Queries

```sql
-- Optimize temporal precedence queries
CREATE INDEX idx_clinical_events_temporal ON patient_clinical_events 
  (patient_id, clinical_effective_date DESC, date_confidence);

-- Optimize conflict resolution queries  
CREATE INDEX idx_date_conflicts ON patient_clinical_events 
  USING GIN (date_conflicts) WHERE date_conflicts IS NOT NULL;

-- Optimize supersession temporal comparison
CREATE INDEX idx_temporal_supersession ON patient_clinical_events 
  (clinical_identity_key, clinical_effective_date DESC, is_current);
```

### Caching Temporal Decisions

```typescript
// Cache frequently accessed temporal comparisons
const temporalCache = new Map<string, TemporalComparison>();

function getCachedTemporalComparison(
  entity1: ClinicalEntity,
  entity2: ClinicalEntity
): TemporalComparison | null {
  
  const cacheKey = `${entity1.id}:${entity2.id}:temporal`;
  return temporalCache.get(cacheKey) || null;
}
```

## Success Criteria

### Technical Validation
- **95%+ accurate date extraction** from clinical documents
- **Deterministic conflict resolution** requiring no manual intervention
- **Complete audit trail** for all temporal decisions
- **Sub-100ms response time** for temporal precedence queries

### Clinical Safety
- **Preserve clinical timeline integrity** across all document uploads
- **Handle contradictory dates** without data loss
- **Support user corrections** while maintaining audit compliance
- **Australian healthcare compliance** with Privacy Act requirements

## Implementation Timeline

**Reference**: [`../implementation-planning/v4-implementation-roadmap.md`](../implementation-planning/v4-implementation-roadmap.md)

### Phase 1: Date Extraction Enhancement (Week 1)
- Enhance Pass 2 AI processing for multi-date extraction
- Implement date hierarchy classification
- Add temporal metadata storage fields

### Phase 2: Conflict Resolution Engine (Week 2)
- Build deterministic conflict resolution algorithms
- Implement temporal precedence comparison functions
- Create audit logging infrastructure

### Phase 3: Deduplication Integration (Week 3)
- Integrate with supersession decision engine
- Add temporal precedence to deduplication framework
- Implement user correction workflows

This temporal conflict resolution framework ensures that V4's sophisticated deduplication system operates on accurate, well-resolved clinical dates while maintaining complete auditability and clinical safety.