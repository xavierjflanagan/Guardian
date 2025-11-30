# patient_interventions Bridge Schema (Source) - Pass 2

**Status:** ✅ Updated for Migration 08
**Database Source:** /current_schema/03_clinical_core.sql (lines 407-446)
**Last Updated:** 30 September 2025 (Migration 08 alignment)
**Priority:** HIGH - Intervention details for action events (medications, procedures, treatments, therapy)

## Database Table Structure

```sql
-- Migration 08: This table has NO patient_id column - derives it through event_id → patient_clinical_events
CREATE TABLE IF NOT EXISTS patient_interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE, -- Migration 08: Required hub reference

    -- Classification
    intervention_type TEXT NOT NULL,

    -- Substance/Medication Details (for drugs, vaccines, etc.)
    substance_name TEXT, -- "Influenza A Vaccine", "Lidocaine", "Atorvastatin"
    manufacturer TEXT,
    lot_number TEXT,
    dose_amount NUMERIC,
    dose_unit TEXT,
    route TEXT, -- 'oral', 'intramuscular', 'topical', 'intravenous'
    frequency TEXT, -- 'daily', 'twice_daily', 'as_needed'

    -- Procedure/Surgery Details
    technique TEXT, -- 'cryotherapy', 'excision', 'injection', 'suture'
    equipment_used TEXT, -- "Liquid nitrogen", "10-blade scalpel"

    -- Outcomes
    immediate_outcome TEXT, -- 'successful', 'partial', 'complications'
    complications TEXT, -- Description of any complications
    followup_required BOOLEAN DEFAULT FALSE,
    followup_instructions TEXT,

    -- V3 AI Processing Integration
    ai_extracted BOOLEAN DEFAULT FALSE,
    ai_confidence NUMERIC(4,3) CHECK (ai_confidence BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration 08: Event reference index for efficient joins
CREATE INDEX IF NOT EXISTS idx_patient_interventions_event_id ON patient_interventions(event_id);
```

## AI Extraction Requirements for Pass 2

Extract detailed intervention data from medical documents for action events (medications, vaccinations, procedures, surgeries, therapies).

### Required Fields

```typescript
interface PatientInterventionsExtraction {
  // REQUIRED FIELDS
  event_id: string;                        // UUID - references parent patient_clinical_events record
  intervention_type: 'medication_admin' | 'vaccination' | 'minor_procedure' | 'surgery' | 'therapy';

  // SUBSTANCE/MEDICATION DETAILS (contextual based on intervention_type)
  substance_name?: string;                 // Name of drug, vaccine, or substance
  manufacturer?: string;                   // Manufacturer name
  lot_number?: string;                     // Lot/batch number for traceability
  dose_amount?: number;                    // Dosage amount (numeric)
  dose_unit?: string;                      // Unit (mg, mL, units, etc.)
  route?: string;                          // Administration route
  frequency?: string;                      // Frequency of administration

  // TECHNIQUE AND EQUIPMENT (contextual for procedures)
  technique?: string;                      // Procedure technique used
  equipment_used?: string;                 // Equipment or tools used

  // OUTCOMES AND FOLLOW-UP
  immediate_outcome?: string;              // Outcome of intervention
  complications?: string;                  // Any complications that occurred
  followup_required?: boolean;             // Whether follow-up is needed
  followup_instructions?: string;          // Follow-up care instructions

  // AI PROCESSING METADATA
  ai_extracted: boolean;                   // Always true for AI-extracted interventions
  ai_confidence: number;                   // 0.000-1.000 (3 decimal places)
  requires_review: boolean;                // True if confidence below threshold
}
```

## Intervention Type Classification Guide

### medication_admin
Medication administration or prescription:
- Oral medications (pills, tablets, capsules)
- Injectable medications
- Topical medications
- Inhalers, nebulizers
- Patches, suppositories

### vaccination
Immunization administration:
- Flu shot, COVID-19 vaccine
- Childhood vaccinations
- Travel vaccines
- Boosters

### minor_procedure
Minor medical procedures:
- Wart removal (cryotherapy, excision)
- Skin biopsy
- Wound care, suturing
- Joint injections
- IV placement

### surgery
Surgical interventions:
- Outpatient surgery
- Inpatient surgery
- Dental surgery
- Endoscopic procedures

### therapy
Therapeutic interventions:
- Physical therapy
- Occupational therapy
- Speech therapy
- Counseling/psychotherapy
- Radiation therapy, chemotherapy

## Example Extractions

### Example 1: Medication Administration
```json
{
  "event_id": "uuid-of-parent-clinical-event",
  "intervention_type": "medication_admin",
  "substance_name": "Lisinopril",
  "dose_amount": 10,
  "dose_unit": "mg",
  "route": "oral",
  "frequency": "daily",
  "immediate_outcome": "successful",
  "followup_required": false,
  "ai_extracted": true,
  "ai_confidence": 0.920,
  "requires_review": false
}
```

### Example 2: Vaccination
```json
{
  "event_id": "uuid-of-parent-clinical-event",
  "intervention_type": "vaccination",
  "substance_name": "Influenza A Vaccine",
  "manufacturer": "Sanofi Pasteur",
  "lot_number": "U3476AA",
  "dose_amount": 0.5,
  "dose_unit": "mL",
  "route": "intramuscular",
  "immediate_outcome": "successful",
  "complications": "None",
  "followup_required": false,
  "ai_extracted": true,
  "ai_confidence": 0.950,
  "requires_review": false,
}
```

### Example 3: Minor Procedure (Wart Removal)
```json
{
  "event_id": "uuid-of-parent-clinical-event",
  "intervention_type": "minor_procedure",
  "technique": "cryotherapy",
  "equipment_used": "Liquid nitrogen",
  "immediate_outcome": "successful",
  "followup_required": true,
  "followup_instructions": "Return in 2 weeks to assess healing",
  "ai_extracted": true,
  "ai_confidence": 0.880,
  "requires_review": false
}
```

### Example 4: Surgery
```json
{
  "event_id": "uuid-of-parent-clinical-event",
  "intervention_type": "surgery",
  "technique": "arthroscopy",
  "equipment_used": "Arthroscopic camera and instruments",
  "immediate_outcome": "successful",
  "complications": "Minor post-operative swelling",
  "followup_required": true,
  "followup_instructions": "Physical therapy starting week 2, follow-up appointment in 6 weeks",
  "ai_extracted": true,
  "ai_confidence": 0.850,
  "requires_review": true
}
```

### Example 5: Therapy
```json
{
  "event_id": "uuid-of-parent-clinical-event",
  "intervention_type": "therapy",
  "technique": "cognitive_behavioral_therapy",
  "immediate_outcome": "successful",
  "followup_required": true,
  "followup_instructions": "Weekly sessions for 8 weeks",
  "ai_extracted": true,
  "ai_confidence": 0.800,
  "requires_review": false
}
```

## Critical Notes

1. **Migration 08 - NO patient_id Column**: This table does NOT have a `patient_id` column. Patient ID is derived through the relationship: `patient_interventions.event_id → patient_clinical_events.patient_id`. This is a key architectural design for hub-and-spoke enforcement.

2. **Parent Relationship**: `event_id` MUST reference a valid `patient_clinical_events` record with `activity_type='intervention'`. This is a NOT NULL requirement enforced by the database.

3. **Contextual Fields**: Different intervention types use different fields:
   - medication/vaccine: substance_name, dosage, route, frequency, manufacturer, lot_number
   - procedure/surgery: technique, equipment_used
   - therapy: technique (therapy type)

4. **Safety-Critical**: Medications and vaccinations are safety-critical - set `requires_review=true` if `ai_confidence < 0.900`

5. **Numeric Precision**: `ai_confidence` uses 3 decimals (0.000-1.000)

6. **Route Examples**: 'oral', 'intramuscular', 'topical', 'intravenous', 'subcutaneous', 'transdermal', 'inhalation'

7. **Frequency Examples**: 'daily', 'twice_daily', 'three_times_daily', 'as_needed', 'every_4_hours', 'weekly'

8. **Status Values**: 'active', 'completed', 'discontinued', 'planned'

9. **Index for Performance**: `idx_patient_interventions_event_id` index added in Migration 08 for efficient JOINs through the hub-and-spoke architecture.

## Intervention Type Selection Logic

- **medication_admin**: Any drug administration (prescription or OTC)
- **vaccination**: Specifically immunizations and vaccines
- **minor_procedure**: Office-based procedures, typically done under local anesthesia
- **surgery**: Surgical procedures requiring OR or surgical suite
- **therapy**: Non-pharmaceutical therapeutic interventions (PT, OT, counseling)

## Schema Validation Checklist

- [ ] `event_id` references a valid patient_clinical_events record (NOT NULL requirement)
- [ ] `intervention_type` is one of: 'medication_admin', 'vaccination', 'minor_procedure', 'surgery', 'therapy'
- [ ] For medication_admin/vaccination: `substance_name` should be provided
- [ ] For minor_procedure/surgery/therapy: `technique` should be provided
- [ ] If `dose_amount` is provided, `dose_unit` should be provided
- [ ] `ai_confidence` is between 0.000 and 1.000 with 3 decimal places
- [ ] `followup_required` is boolean (true/false)

## Database Constraint Notes

- **NO patient_id column**: Patient ID is NOT stored on this table - it is derived through `event_id → patient_clinical_events → patient_id` relationship (Migration 08 hub-and-spoke architecture)
- **FK to parent event**: `event_id` has ON DELETE CASCADE - if parent clinical event is deleted, this intervention is automatically deleted
- **intervention_type values**: Use extraction values: 'medication_admin', 'vaccination', 'minor_procedure', 'surgery', 'therapy' (database does not enforce CHECK constraint)
- **Dose fields**: Use separate `dose_amount` (NUMERIC) and `dose_unit` (TEXT) fields
- **Flexible field usage**: Different intervention_type values use different fields (contextual field importance)
- **Index optimization**: `idx_patient_interventions_event_id` ensures efficient JOINs to parent events