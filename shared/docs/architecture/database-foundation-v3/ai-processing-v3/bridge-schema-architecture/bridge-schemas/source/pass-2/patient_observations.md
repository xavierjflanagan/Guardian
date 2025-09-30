# patient_observations Bridge Schema (Source) - Pass 2

**Status:** ✅ Recreated from database source of truth
**Database Source:** /current_schema/03_clinical_core.sql (lines 363-395)
**Temporal Columns:** Added via migration 02 (lines 989-1072)
**Last Updated:** 30 September 2025
**Priority:** HIGH - Observation details for information gathering events (vital signs, labs, assessments)

## Database Table Structure

```sql
CREATE TABLE IF NOT EXISTS patient_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE,

    -- Classification
    observation_type TEXT NOT NULL, -- 'vital_sign', 'lab_result', 'physical_finding', 'assessment_score'

    -- Measurement Values (flexible value storage)
    value_text TEXT, -- Original extracted text value
    value_numeric NUMERIC, -- Normalized numeric value
    value_secondary NUMERIC, -- For paired values like BP (systolic/diastolic)
    value_boolean BOOLEAN, -- For yes/no findings
    unit TEXT, -- Measurement unit

    -- Reference Ranges and Interpretation
    reference_range_text TEXT, -- "Normal: 120-140 mg/dL"
    reference_range_low NUMERIC,
    reference_range_high NUMERIC,
    interpretation TEXT CHECK (interpretation IN ('normal', 'high', 'low', 'critical', 'abnormal')),

    -- Assessment/Screening Specific Fields
    assessment_tool TEXT, -- 'MMSE', 'PHQ-9', 'Glasgow Coma Scale'
    score_max NUMERIC, -- Maximum possible score (e.g., 30 for MMSE)

    -- V3 AI Processing Integration
    ai_extracted BOOLEAN DEFAULT FALSE,
    ai_confidence NUMERIC(4,3) CHECK (ai_confidence BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Temporal Management (from migration 02, lines 989-1072)
    clinical_event_id UUID REFERENCES patient_clinical_events(id),
    primary_narrative_id UUID REFERENCES clinical_narratives(id),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ NULL,
    superseded_by_record_id UUID REFERENCES patient_observations(id) ON DELETE SET NULL,
    supersession_reason TEXT,
    is_current BOOLEAN GENERATED ALWAYS AS (valid_to IS NULL) STORED,
    clinical_effective_date DATE,
    date_confidence TEXT CHECK (date_confidence IN ('high', 'medium', 'low', 'conflicted')),
    extracted_dates JSONB DEFAULT '[]'::jsonb,
    date_source TEXT CHECK (date_source IN ('clinical_content', 'document_date', 'file_metadata', 'upload_timestamp', 'user_provided')),
    date_conflicts JSONB DEFAULT '[]'::jsonb,
    date_resolution_reason TEXT,
    clinical_identity_key TEXT
);
```

## AI Extraction Requirements for Pass 2

Extract detailed observation data from medical documents for information gathering events (vital signs, lab results, physical findings, assessment scores).

### Required Fields

```typescript
interface PatientObservationsExtraction {
  // REQUIRED FIELDS
  event_id: string;                        // UUID - references parent patient_clinical_events record
  observation_type: 'vital_sign' | 'lab_result' | 'physical_finding' | 'assessment_score';

  // MEASUREMENT VALUES (at least one required)
  value_text?: string;                     // Original extracted text value
  value_numeric?: number;                  // Normalized numeric value
  value_secondary?: number;                // For paired values (e.g., BP systolic/diastolic)
  value_boolean?: boolean;                 // For yes/no findings
  unit?: string;                           // Measurement unit

  // REFERENCE RANGES (OPTIONAL)
  reference_range_text?: string;           // Human-readable range
  reference_range_low?: number;            // Lower bound
  reference_range_high?: number;           // Upper bound
  interpretation?: 'normal' | 'high' | 'low' | 'critical' | 'abnormal';

  // ASSESSMENT SPECIFIC (OPTIONAL)
  assessment_tool?: string;                // Name of assessment tool (e.g., 'PHQ-9')
  score_max?: number;                      // Maximum possible score

  // AI PROCESSING METADATA
  ai_extracted: boolean;                   // Always true for AI-extracted observations
  ai_confidence: number;                   // 0.000-1.000 (3 decimal places)
  requires_review: boolean;                // True if confidence below threshold

  // TEMPORAL DATA MANAGEMENT (OPTIONAL for Pass 2)
  clinical_event_id?: string;              // UUID - links to patient_clinical_events
  primary_narrative_id?: string;           // UUID - links to clinical_narratives (Pass 3)
  clinical_effective_date?: string;        // ISO 8601 DATE
  date_confidence?: 'high' | 'medium' | 'low' | 'conflicted';
  extracted_dates?: object[];              // JSONB array of date extraction attempts
  date_source?: 'clinical_content' | 'document_date' | 'file_metadata' | 'upload_timestamp' | 'user_provided';
  date_conflicts?: object[];               // JSONB array of conflicting dates
  date_resolution_reason?: string;         // Why this date was chosen
  clinical_identity_key?: string;          // Deduplication fingerprint
}
```

## Observation Type Classification Guide

### vital_sign
Physiological measurements and vital signs:
- Blood pressure (systolic/diastolic)
- Heart rate / pulse
- Body temperature
- Respiratory rate
- Oxygen saturation (SpO2)
- Weight, height, BMI

### lab_result
Laboratory test results:
- Blood tests (glucose, cholesterol, hemoglobin, etc.)
- Urine tests
- Microbiology cultures
- Chemistry panels
- Hormone levels

### physical_finding
Clinical observations from physical examinations:
- Skin conditions
- Breath sounds
- Heart sounds
- Reflexes
- Range of motion
- Palpation findings

### assessment_score
Standardized assessment tool results:
- PHQ-9 (depression screening)
- MMSE (cognitive function)
- Glasgow Coma Scale
- Pain scale scores
- Functional assessment scores

## Example Extractions

### Example 1: Blood Pressure Reading (Vital Sign)
```json
{
  "event_id": "uuid-of-parent-clinical-event",
  "observation_type": "vital_sign",
  "value_numeric": 120,
  "value_secondary": 80,
  "unit": "mmHg",
  "reference_range_text": "Normal: <120/<80 mmHg",
  "reference_range_low": 90,
  "reference_range_high": 120,
  "interpretation": "normal",
  "ai_extracted": true,
  "ai_confidence": 0.950,
  "requires_review": false,
  "clinical_event_id": "uuid-of-parent-clinical-event",
  "clinical_effective_date": "2025-09-30",
  "date_confidence": "high",
  "date_source": "clinical_content"
}
```

### Example 2: Glucose Lab Result
```json
{
  "event_id": "uuid-of-parent-clinical-event",
  "observation_type": "lab_result",
  "value_text": "95 mg/dL",
  "value_numeric": 95,
  "unit": "mg/dL",
  "reference_range_text": "Normal: 70-100 mg/dL",
  "reference_range_low": 70,
  "reference_range_high": 100,
  "interpretation": "normal",
  "ai_extracted": true,
  "ai_confidence": 0.920,
  "requires_review": false,
  "clinical_event_id": "uuid-of-parent-clinical-event",
  "clinical_effective_date": "2025-09-30",
  "date_confidence": "high"
}
```

### Example 3: PHQ-9 Assessment Score
```json
{
  "event_id": "uuid-of-parent-clinical-event",
  "observation_type": "assessment_score",
  "assessment_tool": "PHQ-9",
  "value_numeric": 8,
  "score_max": 27,
  "interpretation": "normal",
  "reference_range_text": "0-4: minimal, 5-9: mild, 10-14: moderate",
  "ai_extracted": true,
  "ai_confidence": 0.880,
  "requires_review": false,
  "clinical_event_id": "uuid-of-parent-clinical-event"
}
```

### Example 4: Physical Finding (Boolean)
```json
{
  "event_id": "uuid-of-parent-clinical-event",
  "observation_type": "physical_finding",
  "value_text": "Rash present on left forearm",
  "value_boolean": true,
  "ai_extracted": true,
  "ai_confidence": 0.850,
  "requires_review": true,
  "clinical_event_id": "uuid-of-parent-clinical-event"
}
```

## Critical Notes

1. **Parent Relationship**: `event_id` MUST reference a valid `patient_clinical_events` record (the parent clinical event)
2. **Value Flexibility**: At least ONE value field must be populated (value_text, value_numeric, value_secondary, or value_boolean)
3. **Paired Values**: Use `value_numeric` and `value_secondary` for paired measurements like blood pressure (120/80)
4. **Unit Requirement**: If `value_numeric` is provided, `unit` should typically be provided as well
5. **Numeric Precision**: `ai_confidence` uses 3 decimals (0.000-1.000), but `value_numeric`, `value_secondary`, `reference_range_low`, `reference_range_high`, and `score_max` use generic NUMERIC (no specific precision)
6. **Interpretation Enum**: Must be one of: 'normal', 'high', 'low', 'critical', 'abnormal'
7. **Temporal Columns**: This table HAS temporal management columns (added via migration 02, lines 989-1072)
8. **Deduplication**: Use `clinical_identity_key` for identifying duplicate observations across multiple uploads
9. **JSONB Fields**: `extracted_dates` and `date_conflicts` are JSONB arrays

## Observation Type Selection Logic

- **Vital signs**: Routine measurements taken during clinical visits (BP, HR, temp, weight)
- **Lab results**: Tests requiring laboratory analysis (blood work, cultures, chemistry panels)
- **Physical findings**: Observations made during physical examination (no lab or equipment needed)
- **Assessment scores**: Standardized tools with defined scoring systems (PHQ-9, MMSE, pain scales)

## Schema Validation Checklist

- [ ] `event_id` references a valid patient_clinical_events record
- [ ] `observation_type` is one of: 'vital_sign', 'lab_result', 'physical_finding', 'assessment_score'
- [ ] At least ONE value field is populated
- [ ] If `value_numeric` is provided, `unit` should typically be included
- [ ] `interpretation` (if provided) is one of: 'normal', 'high', 'low', 'critical', 'abnormal'
- [ ] `ai_confidence` is between 0.000 and 1.000 with 3 decimal places
- [ ] `date_confidence` (if provided) is one of: 'high', 'medium', 'low', 'conflicted'
- [ ] `date_source` (if provided) is one of: 'clinical_content', 'document_date', 'file_metadata', 'upload_timestamp', 'user_provided'
- [ ] JSONB fields are valid JSON objects/arrays

## Database Constraint Notes

- **FK to parent event**: `event_id` has ON DELETE CASCADE - if parent clinical event is deleted, this observation is automatically deleted
- **Temporal self-reference**: `superseded_by_record_id` references patient_observations(id) for version tracking
- **Generated column**: `is_current` is automatically computed as `(valid_to IS NULL)`, cannot be manually set
- **Flexible value storage**: Multiple value columns allow storing different data types for different observation types