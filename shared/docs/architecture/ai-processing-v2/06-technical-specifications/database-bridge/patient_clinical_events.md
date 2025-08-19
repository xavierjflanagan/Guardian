# patient_clinical_events Bridge Specification

**Database Table:** `patient_clinical_events`  
**AI Component:** o3-classifier  
**Purpose:** Bridge document for populating Guardian's central clinical events table using O3's two-axis model  
**Reference:** [005_clinical_events_core.sql](../../../../database-foundation/implementation/sql/005_clinical_events_core.sql)

---

## Table Overview

The `patient_clinical_events` table is the **core foundation** of Guardian's clinical data architecture. Every medical fact extracted from documents must be classified and stored in this table using O3's two-axis classification model.

**Critical Requirement:** This is the PRIMARY table that AI processing must populate. Without correct population of this table, no other clinical functionality works.

---

## Schema Reference

```sql
CREATE TABLE patient_clinical_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    encounter_id UUID REFERENCES healthcare_encounters(id),
    
    -- O3's Two-Axis Classification System (REQUIRED)
    activity_type TEXT NOT NULL CHECK (activity_type IN ('observation', 'intervention')),
    clinical_purposes TEXT[] NOT NULL, -- ['screening', 'diagnostic', 'therapeutic', 'monitoring', 'preventive']
    
    -- Event Details (REQUIRED)
    event_name TEXT NOT NULL, -- "Blood Pressure Measurement", "Wart Cryotherapy"
    method TEXT, -- 'physical_exam', 'laboratory', 'imaging', 'injection'
    body_site TEXT, -- 'left_ear', 'chest', 'left_hand'
    
    -- Healthcare Standards Integration (HIGHLY RECOMMENDED)
    snomed_code TEXT, -- SNOMED CT codes
    loinc_code TEXT, -- LOINC codes for observations/labs
    cpt_code TEXT, -- CPT codes for procedures
    
    -- Timing and Context
    event_date TIMESTAMPTZ NOT NULL,
    performed_by TEXT, -- Healthcare provider
    
    -- Quality and Provenance (REQUIRED)
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    source_document_id UUID REFERENCES documents(id),
    
    -- Audit fields
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## AI Output to Database Field Mapping

### Required AI Output Format

```typescript
interface ClinicalEventExtraction {
  // O3 Classification (REQUIRED)
  activity_type: 'observation' | 'intervention';
  clinical_purposes: Array<'screening' | 'diagnostic' | 'therapeutic' | 'monitoring' | 'preventive'>;
  event_name: string; // Descriptive, specific name
  
  // Event Details (RECOMMENDED)
  method?: string;
  body_site?: string;
  performed_by?: string;
  event_date: string; // ISO datetime
  
  // Healthcare Standards (HIGHLY RECOMMENDED)
  snomed_code?: string;
  loinc_code?: string;
  cpt_code?: string;
  
  // Quality Metadata (REQUIRED)
  confidence_score: number; // 0.0 - 1.0
  source_text: string; // Original text from document
}
```

### Database Field Population

```yaml
database_field_mapping:
  # Core O3 Classification
  activity_type:
    source: ai_output.activity_type
    validation: must_be_observation_or_intervention
    required: true
    
  clinical_purposes:
    source: ai_output.clinical_purposes
    validation: array_not_empty, valid_purposes_only
    required: true
    database_type: "TEXT[]"
    
  event_name:
    source: ai_output.event_name
    validation: descriptive_not_generic, min_length_5
    required: true
    examples: ["Blood Pressure Measurement", "Influenza Vaccination", "Complete Blood Count"]
    
  # Event Context
  method:
    source: ai_output.method
    validation: valid_method_values
    valid_values: ["physical_exam", "laboratory", "imaging", "injection", "surgery", "assessment_tool"]
    
  body_site:
    source: ai_output.body_site
    validation: anatomical_location
    examples: ["left_arm", "chest", "left_ear", "abdomen"]
    
  # Healthcare Standards
  snomed_code:
    source: ai_output.snomed_code
    validation: valid_snomed_format
    pattern: "^[0-9]+$"
    lookup_required: true
    
  loinc_code:
    source: ai_output.loinc_code  
    validation: valid_loinc_format
    pattern: "^[0-9]+-[0-9]$"
    lookup_required: true
    
  cpt_code:
    source: ai_output.cpt_code
    validation: valid_cpt_format
    pattern: "^[0-9]{5}$"
    lookup_required: true
    
  # Metadata
  confidence_score:
    source: ai_output.confidence_score
    validation: between_0_and_1
    required: true
    
  requires_review:
    source: calculated
    logic: confidence_score < 0.8 OR critical_safety_flags
```

---

## SQL Insertion Patterns

### Standard Single Event Insert

```sql
INSERT INTO patient_clinical_events (
    patient_id,
    activity_type,
    clinical_purposes,
    event_name,
    method,
    body_site,
    snomed_code,
    loinc_code,
    event_date,
    performed_by,
    confidence_score,
    source_document_id,
    requires_review
) VALUES (
    $1::UUID,                    -- patient_id from context
    $2::TEXT,                    -- activity_type from AI
    $3::TEXT[],                  -- clinical_purposes array from AI
    $4::TEXT,                    -- event_name from AI
    $5::TEXT,                    -- method from AI (nullable)
    $6::TEXT,                    -- body_site from AI (nullable)
    $7::TEXT,                    -- snomed_code from AI (nullable)
    $8::TEXT,                    -- loinc_code from AI (nullable)
    $9::TIMESTAMPTZ,             -- event_date from AI
    $10::TEXT,                   -- performed_by from AI (nullable)
    $11::NUMERIC,                -- confidence_score from AI
    $12::UUID,                   -- source_document_id from context
    $13::BOOLEAN                 -- requires_review (calculated)
) RETURNING id;
```

### Batch Insert for Multiple Events

```sql
INSERT INTO patient_clinical_events (
    patient_id, activity_type, clinical_purposes, event_name, 
    confidence_score, source_document_id, event_date
) 
SELECT 
    $1::UUID as patient_id,
    events.activity_type::TEXT,
    string_to_array(events.clinical_purposes, ',')::TEXT[],
    events.event_name::TEXT,
    events.confidence_score::NUMERIC,
    $2::UUID as source_document_id,
    events.event_date::TIMESTAMPTZ
FROM jsonb_to_recordset($3::JSONB) AS events(
    activity_type TEXT,
    clinical_purposes TEXT,
    event_name TEXT,
    confidence_score NUMERIC,
    event_date TIMESTAMPTZ
)
RETURNING id, event_name;
```

---

## Validation Rules

### Pre-Insert AI Output Validation

```typescript
function validateClinicalEventExtraction(extraction: ClinicalEventExtraction): ValidationResult {
  const errors: string[] = [];
  
  // Required fields
  if (!extraction.activity_type) {
    errors.push("activity_type is required");
  }
  if (!['observation', 'intervention'].includes(extraction.activity_type)) {
    errors.push("activity_type must be 'observation' or 'intervention'");
  }
  
  if (!extraction.clinical_purposes || extraction.clinical_purposes.length === 0) {
    errors.push("clinical_purposes array cannot be empty");
  }
  
  const validPurposes = ['screening', 'diagnostic', 'therapeutic', 'monitoring', 'preventive'];
  const invalidPurposes = extraction.clinical_purposes.filter(p => !validPurposes.includes(p));
  if (invalidPurposes.length > 0) {
    errors.push(`Invalid clinical purposes: ${invalidPurposes.join(', ')}`);
  }
  
  if (!extraction.event_name || extraction.event_name.length < 5) {
    errors.push("event_name must be descriptive (min 5 characters)");
  }
  
  if (extraction.confidence_score < 0 || extraction.confidence_score > 1) {
    errors.push("confidence_score must be between 0 and 1");
  }
  
  // Healthcare code validation
  if (extraction.snomed_code && !/^[0-9]+$/.test(extraction.snomed_code)) {
    errors.push("snomed_code must be numeric");
  }
  
  if (extraction.loinc_code && !/^[0-9]+-[0-9]+$/.test(extraction.loinc_code)) {
    errors.push("loinc_code must match pattern XXXXX-X");
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}
```

### Database Constraint Validation

```sql
-- Check constraints automatically enforced by database
ALTER TABLE patient_clinical_events 
ADD CONSTRAINT check_activity_type 
CHECK (activity_type IN ('observation', 'intervention'));

ALTER TABLE patient_clinical_events 
ADD CONSTRAINT check_clinical_purposes_not_empty 
CHECK (array_length(clinical_purposes, 1) > 0);

ALTER TABLE patient_clinical_events 
ADD CONSTRAINT check_confidence_score_range 
CHECK (confidence_score BETWEEN 0 AND 1);

ALTER TABLE patient_clinical_events 
ADD CONSTRAINT check_event_name_length 
CHECK (length(event_name) >= 5);
```

---

## Quality & Safety Rules

### Confidence Thresholds

```yaml
confidence_handling:
  high_confidence: 
    range: ">= 0.8"
    action: "auto_insert"
    requires_review: false
    
  medium_confidence:
    range: "0.6 - 0.79"
    action: "insert_with_flag"
    requires_review: true
    
  low_confidence:
    range: "< 0.6"
    action: "queue_manual_review"
    requires_review: true
    auto_insert: false
```

### Safety Critical Events

```yaml
safety_critical_patterns:
  medication_interventions:
    confidence_threshold: 0.9
    mandatory_fields: [substance_name, dose_amount, route]
    safety_checks: [therapeutic_range, contraindications]
    
  allergy_observations:
    confidence_threshold: 0.95
    mandatory_review: true
    safety_flags: [severity_assessment, cross_allergies]
    
  critical_lab_values:
    confidence_threshold: 0.85
    range_validation: required
    abnormal_flag_logic: automatic
```

---

## Error Handling

### Common Insertion Errors

```typescript
enum ClinicalEventInsertionError {
  INVALID_ACTIVITY_TYPE = "activity_type must be observation or intervention",
  EMPTY_CLINICAL_PURPOSES = "clinical_purposes cannot be empty",
  INVALID_CONFIDENCE_SCORE = "confidence_score must be between 0 and 1",
  MISSING_PATIENT_ID = "patient_id is required",
  FOREIGN_KEY_VIOLATION = "referenced record does not exist",
  DUPLICATE_EVENT = "event already exists for this document"
}
```

### Error Recovery Strategies

```yaml
error_recovery:
  validation_failures:
    strategy: "log_and_skip"
    action: "continue_processing_other_facts"
    notification: "alert_quality_team"
    
  foreign_key_violations:
    strategy: "create_parent_record_if_safe"
    fallback: "queue_for_manual_resolution"
    
  confidence_too_low:
    strategy: "queue_manual_review"
    preserve_extraction: true
    human_review_required: true
```

---

## Performance Optimization

### Batch Processing

```sql
-- Optimized batch insert using COPY
COPY patient_clinical_events (
  patient_id, activity_type, clinical_purposes, event_name, 
  confidence_score, source_document_id, event_date
) FROM STDIN WITH (FORMAT csv, HEADER true);
```

### Index Usage

```sql
-- Ensure queries use these indexes for performance
-- Patient-based queries
SELECT * FROM patient_clinical_events 
WHERE patient_id = $1 AND archived IS NOT TRUE;
-- Uses: idx_patient_clinical_events_patient

-- Activity type filtering  
SELECT * FROM patient_clinical_events 
WHERE activity_type = 'observation' AND archived IS NOT TRUE;
-- Uses: idx_patient_clinical_events_type

-- Clinical purpose searches
SELECT * FROM patient_clinical_events 
WHERE 'diagnostic' = ANY(clinical_purposes) AND archived IS NOT TRUE;
-- Uses: idx_patient_clinical_events_purposes (GIN index)
```

---

## Testing & Validation

### Unit Tests Required

```typescript
describe('patient_clinical_events insertion', () => {
  test('should insert valid observation event', async () => {
    const extraction: ClinicalEventExtraction = {
      activity_type: 'observation',
      clinical_purposes: ['diagnostic'],
      event_name: 'Complete Blood Count',
      method: 'laboratory',
      confidence_score: 0.92,
      source_text: 'CBC results show normal values',
      event_date: '2024-07-15T10:00:00Z'
    };
    
    const result = await insertClinicalEvent(extraction);
    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();
  });
  
  test('should reject invalid activity_type', async () => {
    const extraction = {
      activity_type: 'invalid_type', // Invalid
      clinical_purposes: ['diagnostic'],
      event_name: 'Test Event',
      confidence_score: 0.8
    };
    
    await expect(insertClinicalEvent(extraction)).rejects.toThrow();
  });
});
```

---

*This bridge specification ensures that AI processing correctly populates the central patient_clinical_events table, which is the foundation for all other clinical functionality in Guardian.*