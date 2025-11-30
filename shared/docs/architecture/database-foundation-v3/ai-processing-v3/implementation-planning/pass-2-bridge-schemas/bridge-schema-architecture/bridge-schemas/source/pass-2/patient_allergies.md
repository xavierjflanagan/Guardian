# patient_allergies Bridge Schema (Source) - Pass 2

**Status:** ✅ Created from Migration 08
**Database Source:** /current_schema/03_clinical_core.sql (lines 601-654)
**Last Updated:** 1 October 2025 (Migration 08 alignment)
**Priority:** CRITICAL - Safety-critical allergy and adverse reaction tracking

## Database Table Structure

```sql
-- Patient allergies and adverse reactions
-- Migration 08: This table HAS patient_id column (denormalized for performance)
CREATE TABLE IF NOT EXISTS patient_allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE, -- Migration 08: Required hub reference

    -- Allergen details
    allergen_name TEXT NOT NULL,
    allergen_type TEXT CHECK (allergen_type IN (
        'medication', 'food', 'environmental', 'contact', 'other'
    )),
    allergen_code TEXT, -- RxNorm, UNII, etc.

    -- Note: medication_reference_id FK column removed in migration 06 (vestigial cleanup)
    -- Medical codes now assigned via medical_code_assignments table

    -- Reaction details
    reaction_type TEXT CHECK (reaction_type IN (
        'allergic', 'intolerance', 'adverse_effect', 'unknown'
    )),
    severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe', 'life_threatening')),
    reaction_description TEXT,

    -- Clinical information
    symptoms TEXT[],
    onset_description TEXT, -- 'immediate', 'delayed', etc.

    -- Source and verification
    source_shell_file_id UUID REFERENCES shell_files(id),
    verified_by TEXT, -- Provider name
    verified_date DATE,
    confidence_score NUMERIC(3,2) DEFAULT 1.0,

    -- V3 AI Processing enhancements
    ai_extracted BOOLEAN DEFAULT FALSE,
    ai_confidence NUMERIC(4,3) CHECK (ai_confidence BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,

    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'inactive', 'resolved', 'entered_in_error'
    )),

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,

    -- Migration 08: Composite FK ensures patient_id consistency with parent event
    CONSTRAINT patient_allergies_event_patient_fk FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);

-- Migration 08: Event reference index for efficient joins
CREATE INDEX IF NOT EXISTS idx_patient_allergies_event_id ON patient_allergies(event_id);
```

## AI Extraction Requirements for Pass 2

Extract allergy and adverse reaction information from medical documents including allergen details, reaction type, severity, and symptoms.

### Required Fields

```typescript
interface PatientAllergiesExtraction {
  // REQUIRED FIELDS
  patient_id: string;                      // UUID - from shell file processing context
  event_id: string;                        // UUID - references parent patient_clinical_events record (Migration 08)
  allergen_name: string;                   // Name of allergen

  // ALLERGEN CLASSIFICATION (OPTIONAL)
  allergen_type?: 'medication' | 'food' | 'environmental' | 'contact' | 'other';
  allergen_code?: string;                  // RxNorm, UNII, or other code

  // REACTION DETAILS (OPTIONAL)
  reaction_type?: 'allergic' | 'intolerance' | 'adverse_effect' | 'unknown';
  severity?: 'mild' | 'moderate' | 'severe' | 'life_threatening';
  reaction_description?: string;           // Description of allergic reaction

  // CLINICAL INFORMATION (OPTIONAL)
  symptoms?: string[];                     // Array of symptoms
  onset_description?: string;              // 'immediate', 'delayed', etc.

  // SOURCE AND VERIFICATION (OPTIONAL)
  source_shell_file_id?: string;           // UUID - source document reference
  verified_by?: string;                    // Provider who verified allergy
  verified_date?: string;                  // ISO 8601 DATE format
  confidence_score?: number;               // 0.00-1.00 (2 decimal places)

  // AI PROCESSING METADATA
  ai_extracted: boolean;                   // Always true for AI-extracted allergies
  ai_confidence: number;                   // 0.000-1.000 (3 decimal places)
  requires_review: boolean;                // True if confidence below threshold or safety concerns

  // STATUS (OPTIONAL)
  status?: 'active' | 'inactive' | 'resolved' | 'entered_in_error';  // Default: 'active'
}
```

## Allergen Type Values

- **medication**: Drug or medication allergy
- **food**: Food allergy
- **environmental**: Environmental allergens (pollen, dust, mold, etc.)
- **contact**: Contact allergens (latex, chemicals, etc.)
- **other**: Other allergens not categorized above

## Reaction Type Values

- **allergic**: True allergic reaction (IgE-mediated)
- **intolerance**: Food or drug intolerance (non-allergic)
- **adverse_effect**: Adverse drug effect
- **unknown**: Unknown mechanism

## Severity Values

- **mild**: Minor symptoms, no intervention needed
- **moderate**: Noticeable symptoms, may require treatment
- **severe**: Significant symptoms, requires treatment
- **life_threatening**: Anaphylaxis or severe reaction requiring emergency intervention

## Status Values

- **active**: Current known allergy
- **inactive**: Previously had allergy, no longer reactive
- **resolved**: Allergy resolved over time
- **entered_in_error**: Incorrectly entered allergy

## Example Extractions

### Example 1: Severe Medication Allergy
```json
{
  "patient_id": "uuid-from-context",
  "event_id": "uuid-of-parent-clinical-event",
  "allergen_name": "Penicillin",
  "allergen_type": "medication",
  "reaction_type": "allergic",
  "severity": "severe",
  "reaction_description": "Anaphylactic reaction with difficulty breathing and hives",
  "symptoms": ["hives", "difficulty breathing", "swelling", "rapid heart rate"],
  "onset_description": "immediate",
  "verified_by": "Dr. Sarah Johnson",
  "verified_date": "2025-09-30",
  "status": "active",
  "source_shell_file_id": "uuid-from-context",
  "ai_extracted": true,
  "ai_confidence": 0.950,
  "requires_review": true
}
```

### Example 2: Food Allergy
```json
{
  "patient_id": "uuid-from-context",
  "event_id": "uuid-of-parent-clinical-event",
  "allergen_name": "Peanuts",
  "allergen_type": "food",
  "reaction_type": "allergic",
  "severity": "moderate",
  "reaction_description": "Hives and gastrointestinal upset",
  "symptoms": ["hives", "nausea", "vomiting", "abdominal pain"],
  "onset_description": "delayed (1-2 hours)",
  "status": "active",
  "ai_extracted": true,
  "ai_confidence": 0.920,
  "requires_review": false
}
```

### Example 3: Environmental Allergy
```json
{
  "patient_id": "uuid-from-context",
  "event_id": "uuid-of-parent-clinical-event",
  "allergen_name": "Seasonal Pollen",
  "allergen_type": "environmental",
  "reaction_type": "allergic",
  "severity": "mild",
  "reaction_description": "Seasonal rhinitis and watery eyes",
  "symptoms": ["sneezing", "runny nose", "itchy eyes"],
  "onset_description": "seasonal",
  "status": "active",
  "ai_extracted": true,
  "ai_confidence": 0.880,
  "requires_review": false
}
```

## Critical Notes

1. **Migration 08 - HAS patient_id Column**: This table DOES have a `patient_id` column (denormalized for RLS performance). The composite FK ensures patient_id consistency with the parent event.

2. **Parent Relationship**: `event_id` MUST reference a valid `patient_clinical_events` record. This is a NOT NULL requirement enforced by Migration 08.

3. **Composite FK Integrity**: The composite foreign key `(event_id, patient_id) → patient_clinical_events(id, patient_id)` ensures that the denormalized patient_id matches the patient_id of the parent event.

4. **Safety-Critical**: Allergies are SAFETY-CRITICAL data. Always set `requires_review=true` for severe or life-threatening allergies, regardless of ai_confidence.

5. **Allergen Type CHECK Constraint**: Database enforces 5 allergen_type values: 'medication', 'food', 'environmental', 'contact', 'other'.

6. **Reaction Type CHECK Constraint**: Database enforces 4 reaction_type values: 'allergic', 'intolerance', 'adverse_effect', 'unknown'.

7. **Severity CHECK Constraint**: Database enforces 4 severity values: 'mild', 'moderate', 'severe', 'life_threatening'.

8. **Status CHECK Constraint**: Database enforces 4 status values: 'active', 'inactive', 'resolved', 'entered_in_error'. Default is 'active'.

9. **Symptoms Array**: `symptoms` is a PostgreSQL TEXT[] array field. Extract all mentioned symptoms as array elements.

10. **Numeric Precision**: `ai_confidence` uses 3 decimals (0.000-1.000), `confidence_score` uses 2 decimals (0.00-1.00).

11. **Required Fields**: Only 3 NOT NULL fields: patient_id, event_id, allergen_name. Status has default 'active'.

12. **Medical Codes**: The `medication_reference_id` FK column was removed in migration 06. Medical codes are assigned via `medical_code_assignments` table, though `allergen_code` can be stored directly.

13. **Index for Performance**: `idx_patient_allergies_event_id` index added in Migration 08 for efficient JOINs through the hub-and-spoke architecture.

## Schema Validation Checklist

- [ ] `patient_id` is a valid UUID (from context)
- [ ] `event_id` references a valid patient_clinical_events record (NOT NULL)
- [ ] `allergen_name` is provided (NOT NULL)
- [ ] `allergen_type` (if provided) is one of: 'medication', 'food', 'environmental', 'contact', 'other'
- [ ] `reaction_type` (if provided) is one of: 'allergic', 'intolerance', 'adverse_effect', 'unknown'
- [ ] `severity` (if provided) is one of: 'mild', 'moderate', 'severe', 'life_threatening'
- [ ] `status` is one of: 'active', 'inactive', 'resolved', 'entered_in_error' (has default 'active')
- [ ] `symptoms` (if provided) is a valid PostgreSQL TEXT[] array
- [ ] `ai_confidence` is between 0.000 and 1.000 with 3 decimal places
- [ ] `confidence_score` (if provided) is between 0.00 and 1.00 with 2 decimal places
- [ ] `verified_date` (if provided) is valid ISO 8601 DATE format
- [ ] For severe or life-threatening allergies: `requires_review = true`

## Database Constraint Notes

- **HAS patient_id column**: This table has patient_id (denormalized for RLS performance)
- **Composite FK constraint**: `(event_id, patient_id) → patient_clinical_events(id, patient_id)` enforces patient_id consistency with parent event (Migration 08)
- **FK to parent event**: `event_id` has ON DELETE CASCADE - if parent clinical event is deleted, this allergy is automatically deleted
- **allergen_type CHECK constraint**: Database enforces 5 specific values
- **reaction_type CHECK constraint**: Database enforces 4 specific values
- **severity CHECK constraint**: Database enforces 4 specific values
- **status CHECK constraint**: Database enforces 4 specific values with default 'active'
- **NOT NULL constraints**: patient_id, event_id, allergen_name, status (with default), created_at, updated_at are required
- **TEXT[] array**: symptoms is PostgreSQL array type
- **Optional shell_file reference**: source_shell_file_id is optional FK (can be NULL)
- **Index optimization**: `idx_patient_allergies_event_id` ensures efficient JOINs to parent events
- **medication_reference_id removed**: This FK column was removed in migration 06
