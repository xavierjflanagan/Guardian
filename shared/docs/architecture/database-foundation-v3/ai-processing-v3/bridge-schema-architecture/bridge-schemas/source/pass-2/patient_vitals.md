# patient_vitals Bridge Schema (Source) - Pass 2

**Status:** ✅ Recreated from database source of truth
**Database Source:** /current_schema/03_clinical_core.sql (lines 628-670)
**Temporal Columns:** Added via migration 02 (lines 989-1072)
**Last Updated:** 30 September 2025
**Priority:** CRITICAL - Vital signs measurements with JSONB flexible value storage

## Database Table Structure

```sql
CREATE TABLE IF NOT EXISTS patient_vitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

    -- Measurement details
    vital_type TEXT NOT NULL CHECK (vital_type IN (
        'blood_pressure', 'heart_rate', 'temperature', 'respiratory_rate',
        'oxygen_saturation', 'weight', 'height', 'bmi', 'blood_glucose', 'other'
    )),

    -- Values (using JSONB for flexibility with different measurement types)
    measurement_value JSONB NOT NULL, -- e.g., {"systolic": 120, "diastolic": 80} for BP
    unit TEXT NOT NULL, -- 'mmHg', 'bpm', 'F', 'C', 'kg', 'lbs', etc.

    -- Context
    measurement_date TIMESTAMPTZ NOT NULL,
    measurement_method TEXT, -- 'manual', 'automated', 'self_reported'
    body_position TEXT, -- 'sitting', 'standing', 'lying'

    -- Source information
    measured_by TEXT, -- Provider, patient, device
    source_shell_file_id UUID REFERENCES shell_files(id),
    device_info JSONB, -- Device manufacturer, model, etc.

    -- Clinical context
    clinical_context TEXT, -- 'routine_visit', 'emergency', 'home_monitoring'
    notes TEXT,

    -- Quality indicators
    confidence_score NUMERIC(3,2) DEFAULT 1.0,
    is_abnormal BOOLEAN DEFAULT FALSE,
    reference_range JSONB, -- Normal ranges for this measurement

    -- V3 AI Processing enhancements
    ai_extracted BOOLEAN DEFAULT FALSE,
    ai_confidence NUMERIC(4,3) CHECK (ai_confidence BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,

    -- Temporal Management (from migration 02, lines 989-1072)
    clinical_event_id UUID REFERENCES patient_clinical_events(id),
    primary_narrative_id UUID REFERENCES clinical_narratives(id),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ NULL,
    superseded_by_record_id UUID REFERENCES patient_vitals(id) ON DELETE SET NULL,
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

Extract vital signs measurements from medical documents with flexible JSONB value storage.

### Required Fields

```typescript
interface PatientVitalsExtraction {
  // REQUIRED FIELDS
  patient_id: string;                      // UUID - from shell file processing context
  vital_type: 'blood_pressure' | 'heart_rate' | 'temperature' | 'respiratory_rate' |
              'oxygen_saturation' | 'weight' | 'height' | 'bmi' | 'blood_glucose' | 'other';
  measurement_value: object;               // JSONB - flexible structure based on vital_type
  unit: string;                            // Measurement unit
  measurement_date: string;                // ISO 8601 TIMESTAMPTZ format

  // CONTEXT FIELDS (OPTIONAL)
  measurement_method?: string;             // How measurement was taken
  body_position?: string;                  // Patient position during measurement
  measured_by?: string;                    // Who/what took the measurement
  source_shell_file_id?: string;           // UUID - source document reference
  device_info?: object;                    // JSONB - device details
  clinical_context?: string;               // Clinical context of measurement
  notes?: string;                          // Additional notes

  // QUALITY INDICATORS (OPTIONAL)
  confidence_score?: number;               // 0.00-1.00 (2 decimal places)
  is_abnormal?: boolean;                   // Whether value is abnormal
  reference_range?: object;                // JSONB - normal ranges

  // AI PROCESSING METADATA
  ai_extracted: boolean;                   // Always true for AI-extracted vitals
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

## Vital Type & Measurement Value Structure Guide

### blood_pressure
```json
{
  "vital_type": "blood_pressure",
  "measurement_value": {"systolic": 120, "diastolic": 80},
  "unit": "mmHg"
}
```

### heart_rate
```json
{
  "vital_type": "heart_rate",
  "measurement_value": {"bpm": 72},
  "unit": "bpm"
}
```

### temperature
```json
{
  "vital_type": "temperature",
  "measurement_value": {"degrees": 98.6},
  "unit": "F"
}
```

### respiratory_rate
```json
{
  "vital_type": "respiratory_rate",
  "measurement_value": {"breaths_per_minute": 16},
  "unit": "breaths/min"
}
```

### oxygen_saturation
```json
{
  "vital_type": "oxygen_saturation",
  "measurement_value": {"percentage": 98},
  "unit": "%"
}
```

### weight
```json
{
  "vital_type": "weight",
  "measurement_value": {"value": 70.5},
  "unit": "kg"
}
```

### height
```json
{
  "vital_type": "height",
  "measurement_value": {"value": 175},
  "unit": "cm"
}
```

### bmi
```json
{
  "vital_type": "bmi",
  "measurement_value": {"value": 23.0},
  "unit": "kg/m2"
}
```

### blood_glucose
```json
{
  "vital_type": "blood_glucose",
  "measurement_value": {"value": 95},
  "unit": "mg/dL"
}
```

## Example Extractions

### Example 1: Blood Pressure
```json
{
  "patient_id": "uuid-from-context",
  "vital_type": "blood_pressure",
  "measurement_value": {"systolic": 120, "diastolic": 80},
  "unit": "mmHg",
  "measurement_date": "2025-09-30T14:30:00Z",
  "measurement_method": "automated",
  "body_position": "sitting",
  "measured_by": "Nurse Williams",
  "source_shell_file_id": "uuid-from-context",
  "clinical_context": "routine_visit",
  "is_abnormal": false,
  "reference_range": {"systolic": {"low": 90, "high": 120}, "diastolic": {"low": 60, "high": 80}},
  "ai_extracted": true,
  "ai_confidence": 0.950,
  "requires_review": false,
  "clinical_event_id": "uuid-of-parent-clinical-event",
  "clinical_effective_date": "2025-09-30",
  "date_confidence": "high",
  "date_source": "clinical_content"
}
```

### Example 2: Temperature
```json
{
  "patient_id": "uuid-from-context",
  "vital_type": "temperature",
  "measurement_value": {"degrees": 98.6},
  "unit": "F",
  "measurement_date": "2025-09-30T10:00:00Z",
  "measurement_method": "automated",
  "measured_by": "Dr. Johnson",
  "source_shell_file_id": "uuid-from-context",
  "is_abnormal": false,
  "ai_extracted": true,
  "ai_confidence": 0.920,
  "requires_review": false
}
```

### Example 3: Weight
```json
{
  "patient_id": "uuid-from-context",
  "vital_type": "weight",
  "measurement_value": {"value": 70.5},
  "unit": "kg",
  "measurement_date": "2025-09-30T09:00:00Z",
  "measurement_method": "manual",
  "source_shell_file_id": "uuid-from-context",
  "clinical_context": "routine_visit",
  "ai_extracted": true,
  "ai_confidence": 0.890,
  "requires_review": false
}
```

### Example 4: Oxygen Saturation with Device Info
```json
{
  "patient_id": "uuid-from-context",
  "vital_type": "oxygen_saturation",
  "measurement_value": {"percentage": 98},
  "unit": "%",
  "measurement_date": "2025-09-30T11:30:00Z",
  "measurement_method": "automated",
  "device_info": {"manufacturer": "Masimo", "model": "MightySat", "serial": "12345"},
  "source_shell_file_id": "uuid-from-context",
  "is_abnormal": false,
  "ai_extracted": true,
  "ai_confidence": 0.910,
  "requires_review": false
}
```

## Critical Notes

1. **JSONB Flexibility**: `measurement_value` is JSONB to accommodate different vital sign structures
2. **Blood Pressure Structure**: Use `{"systolic": X, "diastolic": Y}` format consistently
3. **Patient ID Required**: Unlike patient_observations/patient_interventions, this table references patient_id directly (not via event_id)
4. **Source File Reference**: `source_shell_file_id` is optional but recommended for provenance tracking
5. **Numeric Precision**: `ai_confidence` uses 3 decimals (0.000-1.000), `confidence_score` uses 2 decimals (0.00-1.00)
6. **Vital Type Enum**: Must be one of 10 values (blood_pressure, heart_rate, temperature, respiratory_rate, oxygen_saturation, weight, height, bmi, blood_glucose, other)
7. **Temporal Columns**: This table HAS temporal management columns (added via migration 02, lines 989-1072)
8. **JSONB Fields**: `measurement_value`, `device_info`, `reference_range`, `extracted_dates`, and `date_conflicts` are all JSONB
9. **Unit Requirement**: Unit is NOT NULL - must always be provided

## Measurement Value JSONB Patterns

**Simple Values** (single number):
- heart_rate, temperature, weight, height, bmi, blood_glucose, respiratory_rate, oxygen_saturation
- Pattern: `{"value": X}` or `{"[specific_key]": X}`

**Paired Values** (multiple numbers):
- blood_pressure only
- Pattern: `{"systolic": X, "diastolic": Y}`

## Schema Validation Checklist

- [ ] `patient_id` is a valid UUID
- [ ] `vital_type` is one of the 10 allowed values
- [ ] `measurement_value` is valid JSONB object
- [ ] `measurement_value` structure matches vital_type (e.g., BP has systolic/diastolic)
- [ ] `unit` is provided (NOT NULL)
- [ ] `measurement_date` is valid TIMESTAMPTZ format
- [ ] `ai_confidence` is between 0.000 and 1.000 with 3 decimal places
- [ ] `confidence_score` (if provided) is between 0.00 and 1.00 with 2 decimal places
- [ ] `date_confidence` (if provided) is one of: 'high', 'medium', 'low', 'conflicted'
- [ ] `date_source` (if provided) is one of: 'clinical_content', 'document_date', 'file_metadata', 'upload_timestamp', 'user_provided'
- [ ] All JSONB fields are valid JSON objects

## Database Constraint Notes

- **CHECK constraint on vital_type**: Database enforces one of 10 specific values
- **NOT NULL constraints**: patient_id, vital_type, measurement_value, unit, measurement_date are all required
- **Temporal self-reference**: `superseded_by_record_id` references patient_vitals(id) for version tracking
- **Generated column**: `is_current` is automatically computed as `(valid_to IS NULL)`, cannot be manually set
- **JSONB flexibility**: measurement_value, device_info, and reference_range are schema-less JSONB for flexibility
- **Optional shell_file reference**: source_shell_file_id is optional FK (can be NULL)