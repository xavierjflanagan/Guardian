# patient_medications Bridge Schema (Source) - Pass 2

**Status:** ✅ Created from Migration 08
**Database Source:** /current_schema/03_clinical_core.sql (lines 782-844)
**Last Updated:** 1 October 2025 (Migration 08 alignment)
**Priority:** HIGH - Medication tracking with prescription details and status management

## Database Table Structure

```sql
-- Patient medications (enhanced for V3)
-- Migration 08: This table HAS patient_id column (denormalized for performance)
CREATE TABLE IF NOT EXISTS patient_medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE, -- Migration 08: Required hub reference

    -- Medication identification
    medication_name TEXT NOT NULL,
    generic_name TEXT,
    brand_name TEXT,

    -- Note: medication_reference_id FK column removed in migration 06 (vestigial cleanup)
    -- Medical codes now assigned via medical_code_assignments table
    rxnorm_code TEXT,
    pbs_code TEXT,
    atc_code TEXT,

    -- Prescription details
    strength TEXT,
    dosage_form TEXT,
    prescribed_dose TEXT,
    frequency TEXT,
    route TEXT,
    duration_prescribed INTERVAL,

    -- Clinical context
    indication TEXT,
    prescribing_provider TEXT,
    prescription_date DATE,
    start_date DATE,
    end_date DATE,

    -- Status and compliance
    status TEXT DEFAULT 'active' CHECK (status IN (
        'active', 'completed', 'discontinued', 'on_hold', 'cancelled'
    )),
    adherence_notes TEXT,

    -- Source information
    source_shell_file_id UUID REFERENCES shell_files(id),
    confidence_score NUMERIC(3,2) DEFAULT 1.0,

    -- AI Processing Integration (V3)
    ai_extracted BOOLEAN DEFAULT FALSE,
    ai_confidence NUMERIC(4,3) CHECK (ai_confidence BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    drug_interaction_checked BOOLEAN DEFAULT FALSE,

    -- Clinical notes
    notes TEXT,
    clinical_context JSONB DEFAULT '{}',

    -- Lifecycle
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    archived_at TIMESTAMPTZ,

    -- Migration 08: Composite FK ensures patient_id consistency with parent event
    CONSTRAINT patient_medications_event_patient_fk FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);

-- Migration 08: Event reference index for efficient joins
CREATE INDEX IF NOT EXISTS idx_patient_medications_event_id ON patient_medications(event_id);
```

## AI Extraction Requirements for Pass 2

Extract medication records from medical documents including prescription details, dosing, and clinical context.

### Required Fields

```typescript
interface PatientMedicationsExtraction {
  // REQUIRED FIELDS
  patient_id: string;                      // UUID - from shell file processing context
  event_id: string;                        // UUID - references parent patient_clinical_events record (Migration 08)
  medication_name: string;                 // Medication name (generic or brand)

  // MEDICATION IDENTIFICATION (OPTIONAL)
  generic_name?: string;                   // Generic/non-proprietary name
  brand_name?: string;                     // Brand/trade name
  rxnorm_code?: string;                    // RxNorm code (via medical_code_assignments)
  pbs_code?: string;                       // PBS code (Australian)
  atc_code?: string;                       // Anatomical Therapeutic Chemical code

  // PRESCRIPTION DETAILS (OPTIONAL)
  strength?: string;                       // "10 mg", "500 mg", "20 mg/mL"
  dosage_form?: string;                    // "tablet", "capsule", "liquid", "injection"
  prescribed_dose?: string;                // "1 tablet", "5 mL", "2 capsules"
  frequency?: string;                      // "daily", "twice daily", "as needed"
  route?: string;                          // "oral", "topical", "intravenous"
  duration_prescribed?: string;            // INTERVAL - "30 days", "3 months"

  // CLINICAL CONTEXT (OPTIONAL)
  indication?: string;                     // Reason for prescription
  prescribing_provider?: string;           // Provider name
  prescription_date?: string;              // ISO 8601 DATE format
  start_date?: string;                     // ISO 8601 DATE format
  end_date?: string;                       // ISO 8601 DATE format

  // STATUS AND COMPLIANCE (OPTIONAL)
  status?: 'active' | 'completed' | 'discontinued' | 'on_hold' | 'cancelled';
  adherence_notes?: string;                // Notes on patient adherence

  // SOURCE AND QUALITY (OPTIONAL)
  source_shell_file_id?: string;           // UUID - source document reference
  confidence_score?: number;               // 0.00-1.00 (2 decimal places)

  // AI PROCESSING METADATA
  ai_extracted: boolean;                   // Always true for AI-extracted medications
  ai_confidence: number;                   // 0.000-1.000 (3 decimal places)
  requires_review: boolean;                // True if confidence below threshold or safety concerns
  drug_interaction_checked?: boolean;      // Whether drug interactions were checked

  // CLINICAL NOTES (OPTIONAL)
  notes?: string;                          // Additional clinical notes
  clinical_context?: object;               // JSONB - additional structured context
}
```

## Medication Status Values

- **active**: Currently being taken
- **completed**: Course of treatment finished
- **discontinued**: Stopped before completion
- **on_hold**: Temporarily suspended
- **cancelled**: Prescription cancelled/never started

## Example Extractions

### Example 1: Active Prescription with Full Details
```json
{
  "patient_id": "uuid-from-context",
  "event_id": "uuid-of-parent-clinical-event",
  "medication_name": "Lisinopril",
  "generic_name": "Lisinopril",
  "brand_name": "Prinivil",
  "strength": "10 mg",
  "dosage_form": "tablet",
  "prescribed_dose": "1 tablet",
  "frequency": "daily",
  "route": "oral",
  "indication": "Hypertension",
  "prescribing_provider": "Dr. Sarah Johnson",
  "prescription_date": "2025-09-30",
  "start_date": "2025-09-30",
  "status": "active",
  "source_shell_file_id": "uuid-from-context",
  "ai_extracted": true,
  "ai_confidence": 0.920,
  "requires_review": false
}
```

### Example 2: Discontinued Medication
```json
{
  "patient_id": "uuid-from-context",
  "event_id": "uuid-of-parent-clinical-event",
  "medication_name": "Metformin",
  "generic_name": "Metformin hydrochloride",
  "strength": "500 mg",
  "dosage_form": "tablet",
  "prescribed_dose": "2 tablets",
  "frequency": "twice daily",
  "route": "oral",
  "indication": "Type 2 diabetes",
  "start_date": "2024-06-15",
  "end_date": "2025-08-20",
  "status": "discontinued",
  "adherence_notes": "Discontinued due to gastrointestinal side effects",
  "ai_extracted": true,
  "ai_confidence": 0.880,
  "requires_review": true
}
```

### Example 3: As-Needed Medication
```json
{
  "patient_id": "uuid-from-context",
  "event_id": "uuid-of-parent-clinical-event",
  "medication_name": "Acetaminophen",
  "generic_name": "Paracetamol",
  "brand_name": "Tylenol",
  "strength": "500 mg",
  "dosage_form": "tablet",
  "prescribed_dose": "1-2 tablets",
  "frequency": "as needed (max 8 tablets/day)",
  "route": "oral",
  "indication": "Pain relief",
  "status": "active",
  "ai_extracted": true,
  "ai_confidence": 0.950,
  "requires_review": false
}
```

## Critical Notes

1. **Migration 08 - HAS patient_id Column**: This table DOES have a `patient_id` column (denormalized for RLS performance). The composite FK ensures patient_id consistency with the parent event.

2. **Parent Relationship**: `event_id` MUST reference a valid `patient_clinical_events` record. This is a NOT NULL requirement enforced by Migration 08.

3. **Composite FK Integrity**: The composite foreign key `(event_id, patient_id) → patient_clinical_events(id, patient_id)` ensures that the denormalized patient_id matches the patient_id of the parent event.

4. **Medical Codes**: The `medication_reference_id` FK column was removed in migration 06. Medical codes (rxnorm_code, pbs_code, atc_code) are now assigned via the `medical_code_assignments` table.

5. **Status CHECK Constraint**: Database enforces 5 status values: 'active', 'completed', 'discontinued', 'on_hold', 'cancelled'.

6. **Numeric Precision**: `ai_confidence` uses 3 decimals (0.000-1.000), `confidence_score` uses 2 decimals (0.00-1.00).

7. **Duration Format**: `duration_prescribed` is PostgreSQL INTERVAL type (e.g., "30 days", "3 months").

8. **Required Fields**: Only 3 NOT NULL fields: patient_id, event_id, medication_name.

9. **JSONB Field**: `clinical_context` is JSONB with default empty object '{}'.

10. **Safety-Critical**: Medications are safety-critical - set `requires_review=true` if `ai_confidence < 0.900` or if there are any dosing ambiguities.

11. **Index for Performance**: `idx_patient_medications_event_id` index added in Migration 08 for efficient JOINs through the hub-and-spoke architecture.

## Schema Validation Checklist

- [ ] `patient_id` is a valid UUID (from context)
- [ ] `event_id` references a valid patient_clinical_events record (NOT NULL)
- [ ] `medication_name` is provided (NOT NULL)
- [ ] `status` (if provided) is one of: 'active', 'completed', 'discontinued', 'on_hold', 'cancelled'
- [ ] `ai_confidence` is between 0.000 and 1.000 with 3 decimal places
- [ ] `confidence_score` (if provided) is between 0.00 and 1.00 with 2 decimal places
- [ ] `duration_prescribed` (if provided) is valid PostgreSQL INTERVAL format
- [ ] `clinical_context` (if provided) is valid JSONB
- [ ] For safety-critical medications: `ai_confidence >= 0.900` OR `requires_review = true`

## Database Constraint Notes

- **HAS patient_id column**: This table has patient_id (denormalized for RLS performance)
- **Composite FK constraint**: `(event_id, patient_id) → patient_clinical_events(id, patient_id)` enforces patient_id consistency with parent event (Migration 08)
- **FK to parent event**: `event_id` has ON DELETE CASCADE - if parent clinical event is deleted, this medication is automatically deleted
- **status CHECK constraint**: Database enforces 5 specific values
- **NOT NULL constraints**: patient_id, event_id, medication_name are required
- **JSONB field**: clinical_context is schema-less JSONB for flexibility (default '{}')
- **Optional shell_file reference**: source_shell_file_id is optional FK (can be NULL)
- **Index optimization**: `idx_patient_medications_event_id` ensures efficient JOINs to parent events
- **medication_reference_id removed**: This FK column was removed in migration 06
