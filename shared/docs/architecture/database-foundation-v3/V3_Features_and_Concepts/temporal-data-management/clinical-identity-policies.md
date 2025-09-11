# Clinical Identity Policies

**Status**: Complete Implementation Specification  
**Purpose**: Define what makes clinical entities "the same" for safe deduplication across different entity types

## Overview

Clinical identity policies ensure that only medically equivalent entities are merged during deduplication. These policies assume medical codes have been assigned by the **medical-code-resolution** system and focus purely on identity determination logic for safe deduplication.

**Critical Dependencies**:
- Medical code assignment from [`../medical-code-resolution/code-hierarchy-selection.md`](../medical-code-resolution/code-hierarchy-selection.md)
- Vague medication handling from [`../medical-code-resolution/vague-medication-handling.md`](../medical-code-resolution/vague-medication-handling.md)
- Temporal precedence from [`./temporal-conflict-resolution.md`](./temporal-conflict-resolution.md)
- Supersession logic from [`./deduplication-framework.md`](./deduplication-framework.md)

## Identity Determination Framework

### Core Principle

**Identity policies answer**: "Given medical codes and clinical attributes, when are two entities the same?"

**NOT concerned with**: How medical codes are assigned (handled by medical-code-resolution system)

**Key Focus Areas**:
1. Identity key generation from available codes
2. Safety rules preventing unsafe merging
3. Composite fallback strategies when codes unavailable
4. Special case handling (missing information, vague mentions)

## Medication Identity Policy

### Identity Key Generation Logic

**Assumes**: Medical codes have been assigned by [`../medical-code-resolution/code-hierarchy-selection.md`](../medical-code-resolution/code-hierarchy-selection.md)

```typescript
interface MedicationIdentityInput {
  // Assigned by medical-code-resolution system
  rxnorm_scd?: string;          // Preferred: Semantic Clinical Drug
  rxnorm_sbd?: string;          // Alternative: Semantic Branded Drug
  pbs_item_code?: string;       // Australian PBS code
  atc_code?: string;            // Vague medication class code
  
  // Extracted attributes for composite fallback
  ingredient_name?: string;
  strength?: string;
  dose_form?: string;
  route?: string;
  
  // Metadata for identity decisions
  code_confidence: number;      // From medical-code-resolution
  is_vague_mention: boolean;    // From vague-medication-handling
  extracted_text_hash: string;  // For conservative fallback
}

function generateMedicationIdentityKey(medication: MedicationIdentityInput): string {
  // Priority 1: Use assigned medical codes (from medical-code-resolution)
  if (medication.rxnorm_scd && medication.code_confidence > 0.8) {
    return `rxnorm_scd:${medication.rxnorm_scd}`;
  }
  
  if (medication.rxnorm_sbd && medication.code_confidence > 0.8) {
    return `rxnorm_sbd:${medication.rxnorm_sbd}`;
  }
  
  if (medication.pbs_item_code && medication.code_confidence > 0.8) {
    return `pbs:${medication.pbs_item_code}`;
  }
  
  // Priority 2: Vague medication class (from vague-medication-handling)
  if (medication.atc_code && medication.is_vague_mention) {
    return `atc:${medication.atc_code}`;
  }
  
  // Priority 3: Composite identity (when codes unavailable but attributes extracted)
  if (medication.ingredient_name && medication.strength && medication.dose_form) {
    // Include dose_form for safety (different forms = different clinical effects)
    const composite = [
      medication.ingredient_name.toLowerCase(),
      medication.strength,
      medication.dose_form.toLowerCase(),
      medication.route?.toLowerCase() || 'unspecified'
    ].join(':');
    
    return `composite:${composite}`;
  }
  
  // Priority 4: Conservative fallback (prevent unsafe merging)
  // Each mention gets unique identity when insufficient information
  return `fallback:${medication.id}:${medication.extracted_text_hash}`;
}
```

### Special Case Handling

#### Use Case 1: Missing Dose/Frequency in Newer Document

**Scenario**: 
- Existing entity: "Lisinopril 10mg daily" (complete information)
- New entity: "Patient on Lisinopril" (missing dose/frequency)

**Identity Determination**:
```typescript
function handleMissingInformation(
  existingEntity: MedicationIdentityInput,
  newEntity: MedicationIdentityInput
): IdentityComparison {
  
  // Both have same RxNorm SCD - same medication identity
  if (existingEntity.rxnorm_scd === newEntity.rxnorm_scd && existingEntity.rxnorm_scd) {
    return {
      identity_match: true,
      identity_key: `rxnorm_scd:${existingEntity.rxnorm_scd}`,
      deduplication_behavior: 'temporal_precedence_applies',
      information_completeness: {
        existing_complete: true,
        new_incomplete: true,
        reasoning: 'Newer document supersedes despite missing details - context preserved in narrative'
      }
    };
  }
  
  // Composite comparison when codes match but attributes differ
  if (existingEntity.ingredient_name === newEntity.ingredient_name) {
    return {
      identity_match: true,
      identity_key: `ingredient:${existingEntity.ingredient_name}`,
      deduplication_behavior: 'temporal_precedence_applies',
      safety_note: 'Same ingredient identified - temporal precedence determines current state'
    };
  }
  
  return { identity_match: false };
}
```

#### Use Case 2: Vague Medication Mentions

**Scenario**: "Patient started on steroids yesterday"

**Identity Strategy**: 
```typescript
function handleVagueMedicationIdentity(
  vagueEntity: MedicationIdentityInput
): VagueMedicationIdentity {
  
  // ATC code assigned by vague-medication-handling system
  if (vagueEntity.atc_code && vagueEntity.is_vague_mention) {
    return {
      identity_key: `atc:${vagueEntity.atc_code}`, // e.g., "atc:H02AB"
      deduplication_behavior: 'merge_with_same_class_mentions',
      safety_considerations: [
        'requires_tapering', 'infection_risk', 'blood_sugar_monitoring'
      ],
      narrative_context: 'Systemic corticosteroid therapy - class-level tracking',
      clinical_clarification_needed: true
    };
  }
  
  // Conservative approach for unclear vague mentions
  return {
    identity_key: `vague:${vagueEntity.id}:${vagueEntity.extracted_text_hash}`,
    deduplication_behavior: 'keep_separate_for_safety',
    requires_clinical_review: true
  };
}
```

### Medication Identity Safety Rules

#### Safety Rule 1: Combination vs Monotherapy Distinction
```typescript
// NEVER merge combination drugs with monotherapies
const identityExamples = {
  lisinopril_mono: "rxnorm_scd:314076",        // Lisinopril 10mg alone
  lisinopril_hctz: "rxnorm_scd:314077",        // Lisinopril 10mg + HCTZ 12.5mg
  // These must have DIFFERENT identity keys
};

function validateCombinationTherapy(medication: MedicationEntity): boolean {
  // Check for multiple active ingredients
  const ingredients = extractActiveIngredients(medication.substance_name);
  
  if (ingredients.length > 1) {
    // Mark as combination therapy - requires specific SCD
    medication.is_combination_therapy = true;
    medication.identity_requirements = 'rxnorm_scd_required';
    return true;
  }
  
  return false;
}
```

#### Safety Rule 2: Route and Form Specificity (Critical for Safety)
```typescript
// Different routes/forms = different identities (safety critical)
const routeFormExamples = {
  hydrocortisone_oral: "rxnorm_scd:5492",      // Hydrocortisone oral tablet
  hydrocortisone_topical: "rxnorm_scd:1659229", // Hydrocortisone 1% cream
  // MUST NOT merge - clinically distinct
};

function enforceRouteFormDistinction(
  med1: MedicationEntity, 
  med2: MedicationEntity
): boolean {
  
  // Same ingredient but different route/form
  if (med1.ingredient_name === med2.ingredient_name) {
    if (med1.route !== med2.route || med1.dose_form !== med2.dose_form) {
      return false; // Cannot merge - clinically distinct
    }
  }
  
  return true; // Safe to consider for merging
}
```

#### Safety Rule 3: Conservative Fallback Explanation

**When triggered**: `fallback:${medication.id}:${medication.extracted_text_hash}`

```typescript
// This creates a unique identity that NEVER merges with anything
const conservativeFallback = {
  identity_key: `fallback:abc123:def789hash`,
  meaning: 'Insufficient information for safe identity determination',
  deduplication_behavior: 'no_merging_allowed',
  clinical_impact: 'Each mention preserved separately until clarification',
  
  triggers: [
    'medical_code_confidence < 0.5',
    'no_medical_codes_assigned', 
    'insufficient_clinical_attributes',
    'unclear_medication_reference'
  ],
  
  example_scenarios: [
    'Document mentions "some medication" with no specifics',
    'Illegible handwriting with unclear medication name',
    'Foreign medication name not in code databases'
  ]
};
```

#### Safety Rule 4: Brand vs Generic Equivalency
```typescript
function handleBrandGenericEquivalency(
  medication: MedicationEntity
): IdentityResolution {
  
  // Generic name takes precedence for identity
  if (medication.rxnorm_scd) {
    // SCD codes are already normalized to generic
    return {
      identity_key: `rxnorm_scd:${medication.rxnorm_scd}`,
      brand_preserved: medication.brand_name, // Preserve for display
      generic_normalized: true
    };
  }
  
  // Handle Australian brand names
  if (medication.pbs_item_code) {
    return {
      identity_key: `pbs:${medication.pbs_item_code}`,
      local_brand_handling: true
    };
  }
  
  // Conservative approach for unclear brand/generic status
  return {
    identity_key: `brand_specific:${medication.id}`,
    requires_manual_review: true
  };
}
```

## Condition Identity Policy

### Identity Key Generation for Conditions

**Assumes**: SNOMED/ICD codes assigned by [`../medical-code-resolution/code-hierarchy-selection.md`](../medical-code-resolution/code-hierarchy-selection.md)

```typescript
interface ConditionIdentityInput {
  // Assigned by medical-code-resolution system
  snomed_concept_id?: string;    // "44054006" = Type 2 diabetes mellitus
  icd10_code?: string;          // "E11" = Type 2 diabetes mellitus  
  icd10_am_code?: string;       // Australian modification
  
  // For identity determination
  condition_name: string;       // Original extracted text
  code_confidence: number;      // From medical-code-resolution
  extracted_text_hash: string;  // For conservative fallback
}

function generateConditionIdentityKey(condition: ConditionIdentityInput): string {
  
  // Priority 1: Use assigned SNOMED code (preferred)
  if (condition.snomed_concept_id && condition.code_confidence > 0.8) {
    return `snomed:${condition.snomed_concept_id}`;
  }
  
  // Priority 2: Australian ICD-10-AM (local healthcare context)
  if (condition.icd10_am_code && condition.code_confidence > 0.8) {
    return `icd10_am:${condition.icd10_am_code}`;
  }
  
  // Priority 3: International ICD-10
  if (condition.icd10_code && condition.code_confidence > 0.8) {
    return `icd10:${condition.icd10_code}`;
  }
  
  // Priority 4: Normalized condition name (when codes unavailable)
  const normalizedName = normalizeConditionName(condition.condition_name);
  return `normalized:${normalizedName}`;
  
  // Priority 5: Conservative fallback
  return `fallback:${condition.id}:${condition.extracted_text_hash}`;
}
```

### Condition Identity Special Cases

#### Synonym Recognition

**Note**: Synonym mapping ("SLE" → "systemic lupus erythematosus") is handled by [`../medical-code-resolution/embedding-based-code-matching.md`](../medical-code-resolution/embedding-based-code-matching.md). Identity policies focus on using the resulting codes for identity determination.

#### Hierarchical Condition Relationships

**Identity Decision**: More specific conditions supersede general ones when both refer to the same clinical entity.

```typescript
function determineConditionHierarchy(
  condition1: ConditionIdentityInput,
  condition2: ConditionIdentityInput
): HierarchyIdentityDecision {
  
  // Example: "Diabetes mellitus" (general) vs "Type 2 diabetes mellitus" (specific)
  // Both get different SNOMED codes, but may represent same clinical reality
  
  if (condition1.snomed_concept_id && condition2.snomed_concept_id) {
    const hierarchyRelation = checkSNOMEDHierarchy(
      condition1.snomed_concept_id,
      condition2.snomed_concept_id
    );
    
    if (hierarchyRelation.is_parent_child) {
      return {
        identity_relationship: 'hierarchical_supersession_applies',
        more_specific_wins: true,
        identity_keys_different: true, // Each gets own identity
        deduplication_logic: 'temporal_precedence_with_specificity_preference',
        reasoning: 'More specific diagnosis supersedes general when clinically the same entity'
      };
    }
  }
  
  // Different conditions - separate identities
  return {
    identity_relationship: 'separate_conditions',
    deduplication_logic: 'no_supersession'
  };
}
```

## Allergy Identity Policy

### Substance-Based Identity Framework

**Key Principle**: Identity based on **substance only**, not reaction type or severity.

```typescript
interface AllergyIdentityInput {
  // Assigned by medical-code-resolution system
  snomed_substance_id?: string;  // "387517004" = Penicillin
  
  // For identity determination
  allergen_name: string;        // "Penicillin", "Shellfish", etc.
  code_confidence: number;
  
  // NOT part of identity (same substance can have different reactions)
  reaction_type?: string;       // "rash", "anaphylaxis"
  severity?: string;           // "mild", "moderate", "severe"
  
  extracted_text_hash: string;
}

function generateAllergyIdentityKey(allergy: AllergyIdentityInput): string {
  
  // Identity is based on SUBSTANCE only, not reaction details
  if (allergy.snomed_substance_id && allergy.code_confidence > 0.8) {
    return `snomed_substance:${allergy.snomed_substance_id}`;
  }
  
  // Normalize substance name when codes unavailable
  const normalizedSubstance = normalizeAllergenName(allergy.allergen_name);
  return `substance:${normalizedSubstance}`;
}

function handleAllergySeverityUpdates(
  existing: AllergyIdentityInput,
  new: AllergyIdentityInput
): AllergyIdentityDecision {
  
  // Same substance identity - reaction details can be updated via supersession
  if (existing.snomed_substance_id === new.snomed_substance_id) {
    return {
      identity_match: true,
      identity_key: `snomed_substance:${existing.snomed_substance_id}`,
      deduplication_behavior: 'merge_with_severity_precedence',
      reasoning: 'Same allergen substance - reaction details updated through temporal precedence'
    };
  }
  
  // Different substances - separate identities
  return {
    identity_match: false,
    deduplication_behavior: 'separate_allergen_records'
  };
}
```

#### Cross-Reactivity Groups (Identity Safety Consideration)

**Important**: Cross-reactive substances maintain **separate identities** for clinical safety.

```typescript
function handleCrossReactivityIdentity(allergy: AllergyIdentityInput): CrossReactivityIdentityDecision {
  
  // Example: "Shellfish" (general) vs "Shrimp" (specific)
  // These get DIFFERENT identities even though clinically related
  
  const crossReactivityExamples = {
    // Each substance gets separate identity for safety
    penicillins: {
      "penicillin": "snomed_substance:387517004",
      "amoxicillin": "snomed_substance:27658006", 
      "ampicillin": "snomed_substance:387170002"
      // Different identities - no merging even though cross-reactive
    },
    
    shellfish: {
      "shellfish": "substance:shellfish_general",
      "shrimp": "snomed_substance:226760005",
      "crab": "snomed_substance:226758002"
      // Separate identities for specific vs general allergens
    }
  };
  
  return {
    identity_approach: 'separate_identities_for_safety',
    clinical_reasoning: 'Cross-reactive substances need individual tracking for precise allergy management',
    deduplication_behavior: 'no_merging_across_related_substances',
    clinical_decision_support: 'System can alert on cross-reactivity without merging identities'
  };
}
```

## Procedure Identity Policy

### Point-in-Time Identity Framework

**Key Principle**: Procedures are point-in-time events. **Date is CRITICAL** for identity.

```typescript
interface ProcedureIdentityInput {
  // Assigned by medical-code-resolution system  
  snomed_procedure_id?: string;  // "80146002" = Appendectomy
  mbs_item_number?: string;      // Australian Medicare Benefits Schedule
  cpt_code?: string;            // Common Procedural Terminology
  
  // CRITICAL for identity determination
  procedure_date: Date;         // Same procedure + same date = likely duplicate
  laterality?: 'left' | 'right' | 'bilateral';
  anatomical_site?: string;
  
  // Metadata
  code_confidence: number;
  extracted_text_hash: string;
}

function generateProcedureIdentityKey(procedure: ProcedureIdentityInput): string {
  
  // Procedure identity MUST include date (point-in-time events)
  if (procedure.snomed_procedure_id && procedure.code_confidence > 0.8) {
    return `snomed_procedure:${procedure.snomed_procedure_id}:${procedure.procedure_date}`;
  }
  
  if (procedure.mbs_item_number && procedure.code_confidence > 0.8) {
    return `mbs:${procedure.mbs_item_number}:${procedure.procedure_date}`;
  }
  
  // Conservative fallback includes date
  return `procedure:${procedure.procedure_date}:${procedure.extracted_text_hash}`;
}
```

#### Procedure Identity Decision Rules

```typescript
function determineProcedureIdentityMatch(
  procedure1: ProcedureIdentityInput,
  procedure2: ProcedureIdentityInput
): ProcedureIdentityDecision {
  
  // Rule 1: Same procedure + same date = likely duplicate/confirmation
  if (procedure1.snomed_procedure_id === procedure2.snomed_procedure_id &&
      isSameDate(procedure1.procedure_date, procedure2.procedure_date)) {
    
    return {
      identity_match: true,
      identity_key: `snomed_procedure:${procedure1.snomed_procedure_id}:${procedure1.procedure_date}`,
      deduplication_behavior: 'confirmation_merge',
      reasoning: 'Same procedure on same date - likely multiple documents confirming same event'
    };
  }
  
  // Rule 2: Same procedure + different dates = separate procedures
  if (procedure1.snomed_procedure_id === procedure2.snomed_procedure_id &&
      !isSameDate(procedure1.procedure_date, procedure2.procedure_date)) {
    
    return {
      identity_match: false,
      reasoning: 'Same procedure type on different dates - separate medical events',
      deduplication_behavior: 'maintain_separate_records'
    };
  }
  
  // Rule 3: Different laterality = separate procedures (even same date)
  if (procedure1.laterality !== procedure2.laterality && 
      procedure1.laterality && procedure2.laterality) {
    
    return {
      identity_match: false,
      reasoning: 'Different anatomical sides - separate procedures',
      safety_note: 'Left vs right procedures must be tracked separately'
    };
  }
  
  // Rule 4: Different procedure codes = different identities
  return {
    identity_match: false,
    reasoning: 'Different procedures - separate identities'
  };
}
```

#### Australian MBS Code Identity Handling

**Note**: MBS codes assigned by [`../medical-code-resolution/code-hierarchy-selection.md`](../medical-code-resolution/code-hierarchy-selection.md). Identity policy uses assigned codes to create unique procedure identities including date for point-in-time distinction.

## Composite Identity Key Implementation

### Database Schema Integration

**Reference**: [`../implementation-planning/database-schema-migrations.md`](../implementation-planning/database-schema-migrations.md)

```sql
-- Add identity key columns to all clinical entity tables
ALTER TABLE patient_medications ADD COLUMN
  clinical_identity_key TEXT GENERATED ALWAYS AS (
    CASE 
      WHEN rxnorm_scd IS NOT NULL THEN 'rxnorm_scd:' || rxnorm_scd
      WHEN rxnorm_sbd IS NOT NULL THEN 'rxnorm_sbd:' || rxnorm_sbd
      WHEN ingredient_name IS NOT NULL AND strength IS NOT NULL 
        THEN 'composite:' || LOWER(ingredient_name) || ':' || strength || ':' || COALESCE(LOWER(dose_form), 'unknown')
      ELSE 'fallback:' || id::text
    END
  ) STORED;

ALTER TABLE patient_conditions ADD COLUMN
  clinical_identity_key TEXT GENERATED ALWAYS AS (
    CASE
      WHEN snomed_concept_id IS NOT NULL THEN 'snomed:' || snomed_concept_id
      WHEN icd10_am_code IS NOT NULL THEN 'icd10_am:' || icd10_am_code
      WHEN icd10_code IS NOT NULL THEN 'icd10:' || icd10_code
      ELSE 'normalized:' || LOWER(TRIM(condition_name))
    END
  ) STORED;

ALTER TABLE patient_allergies ADD COLUMN
  clinical_identity_key TEXT GENERATED ALWAYS AS (
    CASE
      WHEN snomed_substance_id IS NOT NULL THEN 'snomed_substance:' || snomed_substance_id
      ELSE 'substance:' || LOWER(TRIM(allergen_name))
    END
  ) STORED;

-- Procedures include date in identity for point-in-time distinction
ALTER TABLE patient_interventions ADD COLUMN
  clinical_identity_key TEXT GENERATED ALWAYS AS (
    CASE
      WHEN snomed_procedure_id IS NOT NULL AND intervention_type = 'procedure'
        THEN 'snomed_procedure:' || snomed_procedure_id || ':' || COALESCE(procedure_date::text, 'unknown_date')
      WHEN mbs_item_number IS NOT NULL
        THEN 'mbs:' || mbs_item_number || ':' || COALESCE(procedure_date::text, 'unknown_date')
      ELSE 'intervention:' || id::text
    END
  ) STORED;
```

### Performance Optimization

```sql
-- Indexes for identity-based grouping
CREATE INDEX idx_medications_identity ON patient_medications (clinical_identity_key, patient_id);
CREATE INDEX idx_conditions_identity ON patient_conditions (clinical_identity_key, patient_id);
CREATE INDEX idx_allergies_identity ON patient_allergies (clinical_identity_key, patient_id);
CREATE INDEX idx_procedures_identity ON patient_interventions (clinical_identity_key, patient_id)
  WHERE intervention_type IN ('procedure', 'surgery');
```

## Safety Considerations and Validation

### Identity Validation Framework

```typescript
function validateClinicalIdentity(
  entity: ClinicalEntity,
  proposedIdentityKey: string
): IdentityValidation {
  
  // Safety check 1: Ensure medical code confidence meets threshold
  if (entity.medical_code_confidence < 0.7) {
    return {
      validation_result: 'CONSERVATIVE_FALLBACK',
      reason: 'Low medical code confidence - prevent unsafe merging',
      fallback_identity: `conservative:${entity.id}`,
      requires_manual_review: true
    };
  }
  
  // Safety check 2: Validate identity consistency within patient
  const existingIdentities = await getExistingIdentitiesForPatient(
    entity.patient_id, 
    entity.entity_type
  );
  
  const potentialConflicts = existingIdentities.filter(existing => 
    proposedIdentityKey === existing.clinical_identity_key
  );
  
  if (potentialConflicts.length > 0) {
    return {
      validation_result: 'IDENTITY_CONFLICT_DETECTED',
      conflicting_entities: potentialConflicts,
      requires_deduplication_analysis: true
    };
  }
  
  // Safety check 3: Cross-reference with clinical decision support rules
  const cdsValidation = await validateAgainstCDSRules(entity, proposedIdentityKey);
  
  return {
    validation_result: 'IDENTITY_VALID',
    identity_key: proposedIdentityKey,
    confidence: entity.medical_code_confidence,
    cds_validation: cdsValidation
  };
}
```

### Conservative Approaches for Uncertainty

```typescript
function handleUncertainIdentity(entity: ClinicalEntity): ConservativeIdentity {
  
  // When in doubt, err on the side of safety
  if (entity.medical_code_confidence < 0.5 || !entity.medical_codes) {
    return {
      identity_strategy: 'UNIQUE_IDENTITY',
      identity_key: `uncertain:${entity.id}:${entity.extracted_text_hash}`,
      rationale: 'Insufficient confidence for safe merging',
      manual_review_required: true,
      
      // Preserve all extracted information for manual review
      extracted_context: {
        original_text: entity.source_text,
        extraction_confidence: entity.extraction_confidence,
        medical_code_attempts: entity.medical_code_attempts
      }
    };
  }
  
  return { proceed_with_standard_identity: true };
}
```

## Audit Trail for Identity Decisions

### Complete Identity Decision Logging

```sql
CREATE TABLE clinical_identity_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES user_profiles(id),
  clinical_entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  
  -- Identity decision
  clinical_identity_key TEXT NOT NULL,
  identity_method TEXT NOT NULL,
  identity_confidence DECIMAL(3,2),
  
  -- Medical code basis
  medical_codes_used JSONB,
  code_confidence_scores JSONB,
  
  -- Validation results
  safety_checks_passed JSONB,
  conservative_measures_applied JSONB,
  
  -- Audit metadata
  created_at TIMESTAMP DEFAULT NOW(),
  processing_version TEXT,
  shell_file_context UUID REFERENCES shell_files(id)
);
```

## Success Criteria

### Clinical Safety Validation
- **Zero unsafe entity merging** across all clinical entity types
- **95%+ identity accuracy** based on medical code validation
- **Conservative fallback** for uncertain or low-confidence cases
- **Complete audit trail** for all identity decisions

### Performance Requirements
- **Sub-50ms identity key generation** for real-time processing
- **Efficient grouping queries** using indexed identity keys
- **Scalable to 100,000+ entities per patient** with consistent performance

### Regulatory Compliance
- **Australian healthcare code integration** (PBS, MBS, SNOMED-AU)
- **Privacy Act 1988 compliance** for identity decision logging
- **Clinical decision support integration** for safety validation

## Integration Points

### Deduplication Framework Integration
**Reference**: [`./deduplication-framework.md`](./deduplication-framework.md)

The clinical identity policies provide the foundation for all deduplication decisions. Identity keys determine which entities are compared, while supersession logic determines which entity remains active.

### Medical Code Resolution Dependency
**Reference**: [`../medical-code-resolution/embedding-based-code-matching.md`](../medical-code-resolution/embedding-based-code-matching.md)

Accurate medical code assignment is critical for safe identity determination. The embedding-based code matching system must achieve 95%+ accuracy for the identity policies to function safely.

### Temporal Conflict Resolution Integration
**Reference**: [`./temporal-conflict-resolution.md`](./temporal-conflict-resolution.md)

When entities share the same clinical identity, temporal precedence rules determine which version supersedes others, ensuring clinical timeline accuracy.

This comprehensive identity policy framework ensures that V4's deduplication system operates safely while maintaining clinical accuracy and regulatory compliance.