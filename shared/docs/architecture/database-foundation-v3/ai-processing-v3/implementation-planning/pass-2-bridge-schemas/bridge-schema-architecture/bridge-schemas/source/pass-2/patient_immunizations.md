# patient_immunizations Bridge Schema (Source) - Pass 2

**Status:** ✅ Created from Migration 08
**Database Source:** /current_schema/03_clinical_core.sql (lines 717-778)
**Last Updated:** 1 October 2025 (Migration 08 alignment)
**Priority:** CRITICAL - Vaccination records and immunization history tracking

## Database Table Structure

```sql
-- Patient immunizations and vaccination records
-- Migration 08: This table HAS patient_id column (denormalized for performance)
CREATE TABLE IF NOT EXISTS patient_immunizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE, -- Migration 08: Required hub reference

    -- Immunization Details
    vaccine_name TEXT NOT NULL, -- "COVID-19 mRNA vaccine", "Influenza vaccine"
    vaccine_type TEXT, -- "mRNA", "inactivated", "live attenuated", "subunit"
    manufacturer TEXT, -- "Pfizer-BioNTech", "Moderna", "Johnson & Johnson"
    lot_number TEXT,
    expiration_date DATE,

    -- Administration Details
    dose_number INTEGER, -- 1st dose, 2nd dose, booster
    dose_amount NUMERIC(6,3), -- Amount in mL
    route_of_administration TEXT, -- "intramuscular", "intranasal", "oral"
    anatomical_site TEXT, -- "left deltoid", "right deltoid", "anterolateral thigh"

    -- Healthcare Standards Integration (V3)
    snomed_code TEXT, -- SNOMED-CT vaccine codes
    cpt_code TEXT, -- CPT administration codes (90686, 90688, etc.)
    cvx_code TEXT, -- CDC vaccine codes (CVX codes)
    ndc_code TEXT, -- National Drug Code

    -- Australian healthcare specifics
    acir_code TEXT, -- Australian Childhood Immunisation Register codes
    pbs_item_code TEXT, -- PBS item codes for funded vaccines

    -- Clinical Context
    indication TEXT, -- "routine immunization", "travel", "occupational exposure"
    contraindications TEXT[], -- Array of contraindications if any
    adverse_reactions TEXT[], -- Any reported adverse reactions

    -- Provider Information
    administered_by TEXT, -- Healthcare provider name
    administering_facility TEXT, -- Facility name
    administration_date TIMESTAMPTZ NOT NULL,

    -- Data Quality and Provenance (V3)
    coding_confidence NUMERIC(4,3) CHECK (coding_confidence BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    source_shell_file_id UUID REFERENCES shell_files(id),

    -- AI Processing Integration
    ai_extracted BOOLEAN DEFAULT FALSE,
    ai_confidence NUMERIC(4,3) CHECK (ai_confidence BETWEEN 0 AND 1),
    clinical_validation_status TEXT DEFAULT 'pending' CHECK (clinical_validation_status IN (
        'pending', 'validated', 'requires_review', 'rejected'
    )),

    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    archived_at TIMESTAMPTZ,

    -- Migration 08: Composite FK ensures patient_id consistency with parent event
    CONSTRAINT patient_immunizations_event_patient_fk FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);

-- Migration 08: Event reference index for efficient joins
CREATE INDEX IF NOT EXISTS idx_patient_immunizations_event_id ON patient_immunizations(event_id);
```

## AI Extraction Requirements for Pass 2

Extract immunization and vaccination records from medical documents including vaccine details, administration information, and healthcare coding standards.

### Required Fields

```typescript
interface PatientImmunizationsExtraction {
  // REQUIRED FIELDS
  patient_id: string;                      // UUID - from shell file processing context
  event_id: string;                        // UUID - references parent patient_clinical_events record (Migration 08)
  vaccine_name: string;                    // Name of vaccine
  administration_date: string;             // ISO 8601 TIMESTAMPTZ format

  // IMMUNIZATION DETAILS (OPTIONAL)
  vaccine_type?: string;                   // "mRNA", "inactivated", "live attenuated", "subunit"
  manufacturer?: string;                   // Vaccine manufacturer
  lot_number?: string;                     // Vaccine lot number
  expiration_date?: string;                // ISO 8601 DATE format

  // ADMINISTRATION DETAILS (OPTIONAL)
  dose_number?: number;                    // 1st dose, 2nd dose, booster
  dose_amount?: number;                    // Amount in mL (6,3 precision)
  route_of_administration?: string;        // "intramuscular", "intranasal", "oral"
  anatomical_site?: string;                // "left deltoid", "right deltoid", etc.

  // HEALTHCARE STANDARDS CODES (OPTIONAL)
  snomed_code?: string;                    // SNOMED-CT vaccine codes
  cpt_code?: string;                       // CPT administration codes
  cvx_code?: string;                       // CDC vaccine codes (CVX)
  ndc_code?: string;                       // National Drug Code
  acir_code?: string;                      // Australian Childhood Immunisation Register
  pbs_item_code?: string;                  // PBS item codes for funded vaccines

  // CLINICAL CONTEXT (OPTIONAL)
  indication?: string;                     // "routine immunization", "travel", "occupational exposure"
  contraindications?: string[];            // Array of contraindications
  adverse_reactions?: string[];            // Array of adverse reactions

  // PROVIDER INFORMATION (OPTIONAL)
  administered_by?: string;                // Healthcare provider name
  administering_facility?: string;         // Facility name

  // DATA QUALITY (OPTIONAL)
  coding_confidence?: number;              // 0.000-1.000 (3 decimal places)
  source_shell_file_id?: string;           // UUID - source document reference

  // AI PROCESSING METADATA
  ai_extracted: boolean;                   // Always true for AI-extracted immunizations
  ai_confidence: number;                   // 0.000-1.000 (3 decimal places)
  requires_review: boolean;                // True if confidence below threshold or data quality concerns
  clinical_validation_status?: 'pending' | 'validated' | 'requires_review' | 'rejected'; // Default: 'pending'
}
```

## Vaccine Type Values

- **mRNA**: mRNA vaccines (e.g., COVID-19 Pfizer, Moderna)
- **inactivated**: Inactivated virus vaccines (e.g., flu shots, polio)
- **live attenuated**: Live but weakened virus vaccines (e.g., MMR, varicella)
- **subunit**: Subunit, recombinant, or conjugate vaccines (e.g., HPV, hepatitis B)

## Clinical Validation Status Values

- **pending**: Awaiting clinical validation (default)
- **validated**: Clinically validated and confirmed
- **requires_review**: Needs human review due to data quality or safety concerns
- **rejected**: Rejected during validation process

## Example Extractions

### Example 1: COVID-19 Vaccination with Full Details
```json
{
  "patient_id": "uuid-from-context",
  "event_id": "uuid-of-parent-clinical-event",
  "vaccine_name": "COVID-19 mRNA vaccine",
  "vaccine_type": "mRNA",
  "manufacturer": "Pfizer-BioNTech",
  "lot_number": "EW0182",
  "expiration_date": "2026-03-31",
  "dose_number": 2,
  "dose_amount": 0.3,
  "route_of_administration": "intramuscular",
  "anatomical_site": "left deltoid",
  "cvx_code": "208",
  "cpt_code": "91300",
  "indication": "routine immunization",
  "administered_by": "Nurse Sarah Williams, RN",
  "administering_facility": "City Health Clinic",
  "administration_date": "2025-09-30T10:30:00Z",
  "source_shell_file_id": "uuid-from-context",
  "ai_extracted": true,
  "ai_confidence": 0.950,
  "requires_review": false,
  "clinical_validation_status": "pending"
}
```

### Example 2: Influenza Vaccination
```json
{
  "patient_id": "uuid-from-context",
  "event_id": "uuid-of-parent-clinical-event",
  "vaccine_name": "Influenza vaccine, quadrivalent",
  "vaccine_type": "inactivated",
  "manufacturer": "Seqirus",
  "dose_number": 1,
  "route_of_administration": "intramuscular",
  "anatomical_site": "right deltoid",
  "cvx_code": "150",
  "indication": "routine immunization",
  "administered_by": "Dr. Michael Chen",
  "administration_date": "2025-04-15T14:00:00Z",
  "ai_extracted": true,
  "ai_confidence": 0.920,
  "requires_review": false,
  "clinical_validation_status": "pending"
}
```

### Example 3: Travel Vaccination with Adverse Reaction
```json
{
  "patient_id": "uuid-from-context",
  "event_id": "uuid-of-parent-clinical-event",
  "vaccine_name": "Yellow Fever vaccine",
  "vaccine_type": "live attenuated",
  "manufacturer": "Sanofi Pasteur",
  "lot_number": "YF12345",
  "dose_number": 1,
  "dose_amount": 0.5,
  "route_of_administration": "subcutaneous",
  "anatomical_site": "left upper arm",
  "cvx_code": "37",
  "indication": "travel to endemic region",
  "adverse_reactions": ["mild fever", "injection site soreness"],
  "administered_by": "Travel Clinic Nurse",
  "administering_facility": "International Travel Health Center",
  "administration_date": "2025-08-10T09:00:00Z",
  "ai_extracted": true,
  "ai_confidence": 0.880,
  "requires_review": true,
  "clinical_validation_status": "requires_review"
}
```

## Critical Notes

1. **Migration 08 - HAS patient_id Column**: This table DOES have a `patient_id` column (denormalized for RLS performance). The composite FK ensures patient_id consistency with the parent event.

2. **Parent Relationship**: `event_id` MUST reference a valid `patient_clinical_events` record. This is a NOT NULL requirement enforced by Migration 08.

3. **Composite FK Integrity**: The composite foreign key `(event_id, patient_id) → patient_clinical_events(id, patient_id)` ensures that the denormalized patient_id matches the patient_id of the parent event.

4. **Required Fields**: Only 4 NOT NULL fields: patient_id, event_id, vaccine_name, administration_date.

5. **Clinical Validation Status CHECK Constraint**: Database enforces 4 clinical_validation_status values: 'pending', 'validated', 'requires_review', 'rejected'. Default is 'pending'.

6. **TEXT[] Arrays**: Both `contraindications` and `adverse_reactions` are PostgreSQL TEXT[] array fields. Extract all mentioned items as array elements.

7. **Numeric Precision**:
   - `dose_amount` uses NUMERIC(6,3) - 6 total digits, 3 decimal places (e.g., 0.300, 1.500)
   - `ai_confidence` and `coding_confidence` use NUMERIC(4,3) - 0.000-1.000 range

8. **TIMESTAMPTZ vs DATE**:
   - `administration_date` is TIMESTAMPTZ (includes time and timezone)
   - `expiration_date` is DATE (date only, no time)

9. **Healthcare Coding Standards**: Multiple coding systems supported:
   - **SNOMED-CT**: International standardized medical terminology
   - **CPT**: Current Procedural Terminology for administration codes
   - **CVX**: CDC vaccine codes (standard in US)
   - **NDC**: National Drug Code for vaccine products
   - **ACIR**: Australian Childhood Immunisation Register codes
   - **PBS**: Australian Pharmaceutical Benefits Scheme item codes

10. **Australian Healthcare Specifics**: `acir_code` and `pbs_item_code` fields specifically for Australian healthcare system integration.

11. **Safety-Critical**: Immunizations are safety-critical data. Set `requires_review=true` for:
    - Any adverse reactions reported
    - Ambiguous vaccine identification
    - Missing critical administration details
    - ai_confidence < 0.900

12. **Index for Performance**: `idx_patient_immunizations_event_id` index added in Migration 08 for efficient JOINs through the hub-and-spoke architecture.

## Schema Validation Checklist

- [ ] `patient_id` is a valid UUID (from context)
- [ ] `event_id` references a valid patient_clinical_events record (NOT NULL)
- [ ] `vaccine_name` is provided (NOT NULL)
- [ ] `administration_date` is valid ISO 8601 TIMESTAMPTZ format (NOT NULL)
- [ ] `clinical_validation_status` (if provided) is one of: 'pending', 'validated', 'requires_review', 'rejected'
- [ ] `contraindications` (if provided) is a valid PostgreSQL TEXT[] array
- [ ] `adverse_reactions` (if provided) is a valid PostgreSQL TEXT[] array
- [ ] `dose_amount` (if provided) has max 6 digits with 3 decimal places
- [ ] `ai_confidence` is between 0.000 and 1.000 with 3 decimal places
- [ ] `coding_confidence` (if provided) is between 0.000 and 1.000 with 3 decimal places
- [ ] `expiration_date` (if provided) is valid ISO 8601 DATE format
- [ ] For immunizations with adverse reactions: `requires_review = true`

## Database Constraint Notes

- **HAS patient_id column**: This table has patient_id (denormalized for RLS performance)
- **Composite FK constraint**: `(event_id, patient_id) → patient_clinical_events(id, patient_id)` enforces patient_id consistency with parent event (Migration 08)
- **FK to parent event**: `event_id` has ON DELETE CASCADE - if parent clinical event is deleted, this immunization is automatically deleted
- **clinical_validation_status CHECK constraint**: Database enforces 4 specific values with default 'pending'
- **NOT NULL constraints**: patient_id, event_id, vaccine_name, administration_date are required
- **TEXT[] arrays**: contraindications and adverse_reactions are PostgreSQL array types
- **Optional shell_file reference**: source_shell_file_id is optional FK (can be NULL)
- **Index optimization**: `idx_patient_immunizations_event_id` ensures efficient JOINs to parent events
- **TIMESTAMPTZ fields**: administration_date, created_at, updated_at, archived_at include timezone information
