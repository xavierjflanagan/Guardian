# patient_clinical_events Bridge Schema (Source) - Pass 2

**Status:** ✅ Recreated from database source of truth
**Database Source:** /current_schema/03_clinical_core.sql (lines 280-351)
**Last Updated:** 30 September 2025
**Priority:** CRITICAL - Central clinical events hub with O3 two-axis classification

## Database Table Structure

```sql
CREATE TABLE patient_clinical_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    encounter_id UUID, -- FK constraint added later via ALTER TABLE (see 03_clinical_core.sql:1313-1320)

    -- DUAL REFERENCE SYSTEM
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    narrative_id UUID REFERENCES clinical_narratives(id) ON DELETE SET NULL,

    -- O3 Two-Axis Classification
    activity_type TEXT NOT NULL CHECK (activity_type IN ('observation', 'intervention')),
    clinical_purposes TEXT[] NOT NULL,

    -- Event Details
    event_name TEXT NOT NULL,
    method TEXT,
    body_site TEXT,

    -- Healthcare Standards Integration
    snomed_code TEXT,
    loinc_code TEXT,
    cpt_code TEXT,
    icd10_code TEXT,

    -- Timing and Context
    event_date TIMESTAMPTZ NOT NULL,
    performed_by TEXT,
    facility_name TEXT,
    service_date DATE,

    -- AI Processing Integration
    ai_extracted BOOLEAN DEFAULT FALSE,
    ai_confidence NUMERIC(4,3) CHECK (ai_confidence BETWEEN 0 AND 1),
    ai_model_version TEXT DEFAULT 'v3',
    entity_id TEXT,
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    ai_processing_version TEXT DEFAULT 'v3',
    entity_extraction_completed BOOLEAN DEFAULT FALSE,
    clinical_data_extracted BOOLEAN DEFAULT FALSE,
    requires_manual_review BOOLEAN DEFAULT FALSE,
    ai_confidence_scores JSONB DEFAULT '{}',

    -- AI-Generated File Intelligence
    ai_document_summary TEXT,
    ai_file_purpose TEXT,
    ai_key_findings TEXT[],
    ai_file_confidence NUMERIC(3,2) CHECK (ai_file_confidence BETWEEN 0 AND 1),

    -- Medical Coding Integration
    coding_confidence NUMERIC(4,3) CHECK (coding_confidence BETWEEN 0 AND 1),
    coding_method TEXT DEFAULT 'automated_ai' CHECK (coding_method IN ('automated_ai', 'manual_verification', 'hybrid_validation')),

    -- Security and Compliance
    contains_phi BOOLEAN DEFAULT TRUE,
    encryption_key_id TEXT,
    retention_period INTERVAL DEFAULT '7 years',

    -- Audit and Lifecycle
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_reason TEXT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ
);
```

## AI Extraction Requirements for Pass 2

Extract comprehensive clinical event data with O3 two-axis classification:

### Required Fields

```typescript
interface PatientClinicalEventsExtraction {
  // REQUIRED FIELDS
  patient_id: string;                      // UUID - from shell file processing context
  shell_file_id: string;                   // UUID - source document reference
  activity_type: 'observation' | 'intervention';  // O3 axis 1: What type of activity
  clinical_purposes: string[];             // O3 axis 2: Why it was done (array)
  event_name: string;                      // Clear description of the clinical event
  event_date: string;                      // ISO 8601 TIMESTAMPTZ format

  // OPTIONAL CONTEXT FIELDS
  encounter_id?: string;                   // UUID if part of a healthcare encounter
  narrative_id?: string;                   // UUID if part of clinical narrative (Pass 3)
  method?: string;                         // How the event was performed
  body_site?: string;                      // Anatomical location
  performed_by?: string;                   // Healthcare provider name
  facility_name?: string;                  // Where event occurred
  service_date?: string;                   // ISO 8601 DATE format (if different from event_date)

  // HEALTHCARE CODING (OPTIONAL)
  snomed_code?: string;                    // SNOMED CT code
  loinc_code?: string;                     // LOINC code for observations
  cpt_code?: string;                       // CPT procedure code
  icd10_code?: string;                     // ICD-10 diagnosis code

  // AI PROCESSING METADATA
  ai_extracted: boolean;                   // Always true for AI-extracted events
  ai_confidence: number;                   // 0.000-1.000 (3 decimal places)
  ai_model_version: string;                // Default: 'v3'
  entity_id?: string;                      // Links to Pass 1 entity detection
  confidence_score?: number;               // 0.000-1.000 (3 decimal places)
  requires_review: boolean;                // True if confidence below threshold
  ai_processing_version: string;           // Default: 'v3'
  entity_extraction_completed: boolean;    // Pass 1 completion status
  clinical_data_extracted: boolean;        // Pass 2 completion status
  requires_manual_review: boolean;         // Escalation flag
  ai_confidence_scores?: object;           // JSONB with detailed confidence scores

  // AI FILE INTELLIGENCE (OPTIONAL)
  ai_document_summary?: string;            // Overall document summary
  ai_file_purpose?: string;                // Document purpose assessment
  ai_key_findings?: string[];              // Key findings array
  ai_file_confidence?: number;             // 0.00-1.00 (2 decimal places)

  // MEDICAL CODING METADATA
  coding_confidence?: number;              // 0.000-1.000 (3 decimal places)
  coding_method?: 'automated_ai' | 'manual_verification' | 'hybrid_validation';

  // SECURITY AND COMPLIANCE
  contains_phi?: boolean;                  // Default: true
  retention_period?: string;               // PostgreSQL INTERVAL (default: '7 years')
}
```

## O3 Two-Axis Classification Guide

### Axis 1: Activity Type
- `observation`: Information gathering (vital signs, lab results, assessments, physical exams)
- `intervention`: Actions taken (medications, procedures, treatments, surgeries)

### Axis 2: Clinical Purposes (Array - Multiple Allowed)
- `screening`: Routine health checks, preventive testing
- `diagnostic`: Tests or exams to diagnose a condition
- `therapeutic`: Treatments aimed at curing or managing disease
- `monitoring`: Tracking existing conditions or treatment effectiveness
- `preventive`: Actions to prevent future health issues

## Example Extractions

### Example 1: Blood Pressure Measurement
```json
{
  "patient_id": "uuid-from-context",
  "shell_file_id": "uuid-from-context",
  "activity_type": "observation",
  "clinical_purposes": ["monitoring", "diagnostic"],
  "event_name": "Blood Pressure Measurement",
  "method": "physical_exam",
  "body_site": "left_arm",
  "event_date": "2025-09-30T14:30:00Z",
  "performed_by": "Dr. Sarah Johnson",
  "facility_name": "City Medical Center",
  "snomed_code": "75367002",
  "ai_extracted": true,
  "ai_confidence": 0.960,
  "ai_model_version": "v3",
  "entity_extraction_completed": true,
  "clinical_data_extracted": true,
  "requires_review": false,
  "requires_manual_review": false,
  "contains_phi": true
}
```

### Example 2: Medication Administration
```json
{
  "patient_id": "uuid-from-context",
  "shell_file_id": "uuid-from-context",
  "activity_type": "intervention",
  "clinical_purposes": ["therapeutic", "monitoring"],
  "event_name": "Lisinopril 10mg Administration",
  "method": "medication_administration",
  "event_date": "2025-09-30T09:00:00Z",
  "performed_by": "Nurse Williams",
  "facility_name": "Community Health Clinic",
  "snomed_code": "386873009",
  "ai_extracted": true,
  "ai_confidence": 0.875,
  "ai_model_version": "v3",
  "requires_review": true,
  "requires_manual_review": false,
  "coding_method": "automated_ai",
  "coding_confidence": 0.850
}
```

## Critical Notes

1. **Required vs Optional**: Only 6 fields are strictly required - ensure AI always provides these
2. **UUID References**: `patient_id` and `shell_file_id` come from processing context, not extraction
3. **Numeric Precision**: `ai_confidence` and `confidence_score` use 3 decimals (0.000-1.000), `ai_file_confidence` uses 2 decimals (0.00-1.00)
4. **Arrays**: `clinical_purposes` and `ai_key_findings` are TEXT[] arrays
5. **JSONB Fields**: `ai_confidence_scores` is a JSONB object
6. **Narrative Linking**: `narrative_id` is NULL until Pass 3 semantic processing
7. **Temporal Management NOT on This Table**: Migration 02 temporal columns (valid_from, valid_to, is_current, clinical_identity_key, etc.) are applied to specialized clinical tables (patient_medications, patient_conditions, patient_allergies, patient_vitals, patient_immunizations, patient_interventions, patient_observations, healthcare_encounters, healthcare_timeline_events) but NOT to patient_clinical_events hub table (see 03_clinical_core.sql:989-1072)

## Schema Validation Checklist

- [ ] `activity_type` is one of: 'observation' or 'intervention'
- [ ] `clinical_purposes` is an array with at least one value (logical requirement for AI extraction, not DB-enforced)
- [ ] `event_date` is valid TIMESTAMPTZ format
- [ ] All confidence scores are between 0 and 1
- [ ] UUID fields reference valid records
- [ ] Arrays are properly formatted as PostgreSQL TEXT[]
- [ ] JSONB fields are valid JSON objects

## Database Constraint Notes

- **`clinical_purposes` array**: The database only enforces `NOT NULL`, which allows empty arrays. However, for Pass 2 extraction, AI should always provide at least one clinical purpose. This is a logical requirement, not a database constraint.
- **`encounter_id` FK**: The foreign key constraint to `healthcare_encounters(id)` is added via `ALTER TABLE` after both tables are created (see 03_clinical_core.sql:1313-1320) to avoid forward reference issues.