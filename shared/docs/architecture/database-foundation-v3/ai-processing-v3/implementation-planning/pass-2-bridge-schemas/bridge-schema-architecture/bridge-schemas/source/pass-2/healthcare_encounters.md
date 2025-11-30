# healthcare_encounters Bridge Schema (Source) - Pass 2

**Status:** ✅ Recreated from database source of truth
**Database Source:** /current_schema/03_clinical_core.sql (lines 435-473)
**Temporal Columns:** YES - This table HAS temporal management columns (confirmed in migration line 192)
**Last Updated:** 30 September 2025
**Priority:** CRITICAL - Healthcare encounters and provider visits

## Database Table Structure

```sql
CREATE TABLE IF NOT EXISTS healthcare_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

    -- Encounter Classification
    encounter_type TEXT NOT NULL, -- 'outpatient', 'inpatient', 'emergency', 'specialist', 'telehealth', 'diagnostic'
    encounter_date TIMESTAMPTZ,

    -- Provider and Facility Information
    provider_name TEXT,
    provider_type TEXT, -- 'primary_care', 'specialist', 'hospital', 'urgent_care'
    facility_name TEXT,
    specialty TEXT, -- 'cardiology', 'dermatology', 'family_medicine'

    -- Clinical Context
    chief_complaint TEXT, -- Patient's main concern
    summary TEXT, -- Visit summary
    clinical_impression TEXT, -- Provider's assessment
    plan TEXT, -- Treatment plan

    -- Administrative
    visit_duration_minutes INTEGER,
    billing_codes TEXT[], -- CPT codes for billing

    -- File Links
    primary_shell_file_id UUID REFERENCES shell_files(id),
    related_shell_file_ids UUID[] DEFAULT '{}',

    -- V3 AI Processing Integration
    ai_extracted BOOLEAN DEFAULT FALSE,
    ai_confidence NUMERIC(4,3) CHECK (ai_confidence BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,

    -- Quality and Audit
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Temporal Management Columns

**IMPORTANT**: This table HAS temporal management columns added via migration 02 (line 192):

```sql
-- Temporal management columns (from migration 02)
clinical_event_id UUID REFERENCES patient_clinical_events(id),
primary_narrative_id UUID REFERENCES clinical_narratives(id),
valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
valid_to TIMESTAMPTZ NULL,
superseded_by_record_id UUID REFERENCES healthcare_encounters(id) ON DELETE SET NULL,
supersession_reason TEXT,
is_current BOOLEAN GENERATED ALWAYS AS (valid_to IS NULL) STORED,
clinical_effective_date DATE,
date_confidence TEXT CHECK (date_confidence IN ('high', 'medium', 'low', 'conflicted')),
extracted_dates JSONB DEFAULT '[]'::jsonb,
date_source TEXT CHECK (date_source IN ('clinical_content', 'document_date', 'file_metadata', 'upload_timestamp', 'user_provided')),
date_conflicts JSONB DEFAULT '[]'::jsonb,
date_resolution_reason TEXT,
clinical_identity_key TEXT
```

## AI Extraction Requirements for Pass 2

Extract healthcare encounter information from medical documents (visit notes, discharge summaries, clinic records).

### Required Fields

```typescript
interface HealthcareEncountersExtraction {
  // REQUIRED FIELDS
  patient_id: string;                      // UUID - from shell file processing context
  encounter_type: string;                  // NOT NULL - see encounter types below

  // CORE ENCOUNTER DETAILS (OPTIONAL BUT RECOMMENDED)
  encounter_date?: string;                 // ISO 8601 TIMESTAMPTZ format
  provider_name?: string;                  // Healthcare provider name
  provider_type?: string;                  // Provider classification
  facility_name?: string;                  // Healthcare facility name
  specialty?: string;                      // Medical specialty

  // CLINICAL CONTENT (OPTIONAL)
  chief_complaint?: string;                // Patient's main concern
  summary?: string;                        // Visit summary
  clinical_impression?: string;            // Provider's assessment
  plan?: string;                           // Treatment plan

  // ADMINISTRATIVE (OPTIONAL)
  visit_duration_minutes?: number;         // Duration in minutes
  billing_codes?: string[];                // CPT/MBS codes (array)

  // FILE LINKS (OPTIONAL)
  primary_shell_file_id?: string;          // UUID - primary source document
  related_shell_file_ids?: string[];       // UUID array - related documents

  // AI PROCESSING METADATA
  ai_extracted: boolean;                   // Always true for AI-extracted encounters
  ai_confidence: number;                   // 0.000-1.000 (3 decimal places)
  requires_review: boolean;                // True if confidence below threshold

  // QUALITY INDICATORS (OPTIONAL)
  confidence_score?: number;               // 0.000-1.000 (3 decimal places)
  archived?: boolean;                      // Default false

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

## Encounter Type Classification

The encounter_type field is NOT NULL and describes the setting/context of the healthcare visit:

| Encounter Type | Description | Examples |
|----------------|-------------|----------|
| outpatient | Standard clinic/office visit | Regular check-up, follow-up appointment |
| inpatient | Hospital admission with overnight stay | Surgery, serious illness treatment |
| emergency | Emergency department visit | ER visit, urgent medical need |
| specialist | Visit to medical specialist | Cardiologist, dermatologist, oncologist |
| telehealth | Virtual/remote consultation | Video call, phone consultation |
| diagnostic | Visit focused on testing/imaging | Lab work, X-ray, MRI, screening |

## Provider Type Classification

Optional classification of the healthcare provider:

| Provider Type | Description |
|---------------|-------------|
| primary_care | General practitioner, family doctor |
| specialist | Specialist physician (cardiologist, dermatologist, etc.) |
| hospital | Hospital-based care team |
| urgent_care | Urgent care or walk-in clinic |

## Example Extractions

### Example 1: Outpatient Visit with Full Details
```json
{
  "patient_id": "uuid-from-context",
  "encounter_type": "outpatient",
  "encounter_date": "2025-09-30T14:00:00Z",
  "provider_name": "Dr. Sarah Johnson",
  "provider_type": "primary_care",
  "facility_name": "Melbourne Family Medical Centre",
  "specialty": "family_medicine",
  "chief_complaint": "Annual physical examination",
  "summary": "Routine annual check-up. Patient reports feeling well. No new concerns.",
  "clinical_impression": "Healthy adult with well-controlled hypertension",
  "plan": "Continue current medications. Follow-up in 12 months.",
  "visit_duration_minutes": 30,
  "billing_codes": ["23", "73"],
  "primary_shell_file_id": "uuid-from-context",
  "ai_extracted": true,
  "ai_confidence": 0.920,
  "requires_review": false,
  "confidence_score": 0.920,
  "clinical_effective_date": "2025-09-30",
  "date_confidence": "high",
  "date_source": "clinical_content"
}
```

### Example 2: Specialist Visit
```json
{
  "patient_id": "uuid-from-context",
  "encounter_type": "specialist",
  "encounter_date": "2025-09-15T10:30:00Z",
  "provider_name": "Dr. Michael Chen",
  "provider_type": "specialist",
  "facility_name": "Sydney Heart Clinic",
  "specialty": "cardiology",
  "chief_complaint": "Follow-up for hypertension management",
  "summary": "Patient's blood pressure remains elevated despite medication adjustments",
  "clinical_impression": "Resistant hypertension, recommend additional testing",
  "plan": "Order echocardiogram, adjust medication regimen",
  "visit_duration_minutes": 45,
  "primary_shell_file_id": "uuid-from-context",
  "ai_extracted": true,
  "ai_confidence": 0.890,
  "requires_review": false,
  "clinical_effective_date": "2025-09-15",
  "date_confidence": "high"
}
```

### Example 3: Emergency Visit
```json
{
  "patient_id": "uuid-from-context",
  "encounter_type": "emergency",
  "encounter_date": "2025-09-20T03:15:00Z",
  "provider_name": "Dr. Lisa Wong",
  "provider_type": "hospital",
  "facility_name": "Royal Brisbane Emergency Department",
  "chief_complaint": "Severe chest pain",
  "summary": "Patient presented with acute chest pain. ECG performed, cardiac markers ordered.",
  "clinical_impression": "Rule out myocardial infarction",
  "plan": "Admitted for observation, cardiology consult ordered",
  "visit_duration_minutes": 180,
  "primary_shell_file_id": "uuid-from-context",
  "ai_extracted": true,
  "ai_confidence": 0.950,
  "requires_review": false,
  "clinical_effective_date": "2025-09-20",
  "date_confidence": "high"
}
```

### Example 4: Telehealth Consultation
```json
{
  "patient_id": "uuid-from-context",
  "encounter_type": "telehealth",
  "encounter_date": "2025-09-25T16:00:00Z",
  "provider_name": "Dr. Emma Taylor",
  "provider_type": "primary_care",
  "specialty": "family_medicine",
  "chief_complaint": "Upper respiratory symptoms",
  "summary": "Video consultation for cough and congestion",
  "clinical_impression": "Viral upper respiratory infection",
  "plan": "Symptomatic treatment, follow up if symptoms worsen",
  "visit_duration_minutes": 15,
  "primary_shell_file_id": "uuid-from-context",
  "ai_extracted": true,
  "ai_confidence": 0.880,
  "requires_review": false,
  "clinical_effective_date": "2025-09-25",
  "date_confidence": "high"
}
```

### Example 5: Diagnostic Encounter
```json
{
  "patient_id": "uuid-from-context",
  "encounter_type": "diagnostic",
  "encounter_date": "2025-09-28T09:00:00Z",
  "facility_name": "Melbourne Imaging Centre",
  "specialty": "radiology",
  "chief_complaint": "Scheduled chest X-ray",
  "summary": "Routine chest X-ray as ordered by primary care physician",
  "visit_duration_minutes": 20,
  "billing_codes": ["58100"],
  "primary_shell_file_id": "uuid-from-context",
  "ai_extracted": true,
  "ai_confidence": 0.910,
  "requires_review": false,
  "clinical_effective_date": "2025-09-28",
  "date_confidence": "high"
}
```

## Critical Notes

1. **Required Field**: encounter_type is NOT NULL - must be provided
2. **Encounter Date**: Use encounter_date (TIMESTAMPTZ) for when the visit occurred
3. **Text Arrays**: billing_codes and related_shell_file_ids are TEXT[] arrays
4. **Numeric Precision**: ai_confidence and confidence_score use NUMERIC(4,3) = 0.000-1.000 (3 decimal places)
5. **Clinical Content Fields**: chief_complaint, summary, clinical_impression, and plan capture narrative clinical information
6. **HAS Temporal Columns**: This table includes temporal management columns for versioning and deduplication
7. **Shell File References**: Can link to primary and multiple related shell files
8. **Archived Flag**: NOT NULL boolean, defaults to FALSE
9. **Provider vs Facility**: provider_name is individual, facility_name is institution

## Encounter Type Selection Guide

Use this guide to select the most appropriate encounter_type:

- **Document says "office visit", "clinic appointment"** → outpatient
- **Document says "admitted to hospital", "inpatient stay"** → inpatient
- **Document says "ER visit", "emergency department"** → emergency
- **Document mentions specific specialist** (cardiologist, dermatologist) → specialist
- **Document says "telemedicine", "video visit", "phone consultation"** → telehealth
- **Document is lab report, imaging report, screening** → diagnostic

## Schema Validation Checklist

- [ ] `patient_id` is a valid UUID
- [ ] `encounter_type` is NOT NULL (one of 6 values)
- [ ] `encounter_date` (if provided) is valid TIMESTAMPTZ format
- [ ] `billing_codes` (if provided) is TEXT[] array format
- [ ] `related_shell_file_ids` (if provided) is UUID[] array format
- [ ] `ai_confidence` is between 0.000 and 1.000 with 3 decimal places
- [ ] `confidence_score` (if provided) is between 0.000 and 1.000 with 3 decimal places
- [ ] `archived` is boolean (defaults to false)
- [ ] `date_confidence` (if provided) is one of: 'high', 'medium', 'low', 'conflicted'
- [ ] `date_source` (if provided) is one of: 'clinical_content', 'document_date', 'file_metadata', 'upload_timestamp', 'user_provided'

## Database Constraint Notes

- **FK constraint**: patient_id references user_profiles(id) ON DELETE CASCADE
- **FK constraint**: primary_shell_file_id references shell_files(id)
- **NOT NULL fields**: patient_id, encounter_type, archived, created_at, updated_at
- **CHECK constraints**: ai_confidence BETWEEN 0 AND 1, confidence_score BETWEEN 0 AND 1
- **DEFAULT values**: archived=FALSE, ai_extracted=FALSE, requires_review=FALSE
- **Temporal columns**: valid_from, valid_to, clinical_identity_key, etc. (from migration 02)
- **Generated column**: is_current = (valid_to IS NULL) - automatically computed
- **Temporal self-reference**: superseded_by_record_id references healthcare_encounters(id)