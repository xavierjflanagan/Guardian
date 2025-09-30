# patient_interventions Bridge Schema (Source) - Pass 2

**Status:** ✅ Recreated from database source of truth
**Database Source:** /current_schema/03_clinical_core.sql (lines 398-432)
**Temporal Columns:** Added via migration 02 (lines 989-1072)
**Last Updated:** 30 September 2025
**Priority:** HIGH - Intervention details for action events (medications, procedures, treatments, therapy)

## Database Table Structure

```sql
CREATE TABLE IF NOT EXISTS patient_interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE,

    -- Classification
    intervention_type TEXT NOT NULL, -- 'medication_admin', 'vaccination', 'minor_procedure', 'surgery', 'therapy'

    -- Substance/Medication Details (for drugs, vaccines, etc.)
    substance_name TEXT, -- "Influenza A Vaccine", "Lidocaine", "Atorvastatin"
    manufacturer TEXT,
    lot_number TEXT,
    dose_amount NUMERIC,
    dose_unit TEXT,
    route TEXT, -- 'oral', 'intramuscular', 'topical', 'intravenous'
    frequency TEXT, -- 'daily', 'twice_daily', 'as_needed'

    -- Technique and Equipment
    technique TEXT, -- 'cryotherapy', 'excision', 'injection', 'suture'
    equipment_used TEXT, -- "Liquid nitrogen", "10-blade scalpel"

    -- Outcomes and Follow-up
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Temporal Management (from migration 02, lines 989-1072)
    clinical_event_id UUID REFERENCES patient_clinical_events(id),
    primary_narrative_id UUID REFERENCES clinical_narratives(id),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ NULL,
    superseded_by_record_id UUID REFERENCES patient_interventions(id) ON DELETE SET NULL,
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
  "requires_review": false,
  "clinical_event_id": "uuid-of-parent-clinical-event",
  "clinical_effective_date": "2025-09-30",
  "date_confidence": "high",
  "date_source": "clinical_content"
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
  "clinical_event_id": "uuid-of-parent-clinical-event",
  "clinical_effective_date": "2025-09-30",
  "date_confidence": "high"
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
  "requires_review": false,
  "clinical_event_id": "uuid-of-parent-clinical-event"
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
  "requires_review": true,
  "clinical_event_id": "uuid-of-parent-clinical-event"
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
  "requires_review": false,
  "clinical_event_id": "uuid-of-parent-clinical-event"
}
```

## Critical Notes

1. **Parent Relationship**: `event_id` MUST reference a valid `patient_clinical_events` record with activity_type='intervention'
2. **Contextual Fields**: Different intervention types use different fields:
   - medication_admin/vaccination: substance_name, dose_amount, dose_unit, route, frequency
   - minor_procedure/surgery: technique, equipment_used
   - therapy: technique (therapy type)
3. **Safety-Critical**: Medications and vaccinations are safety-critical - set requires_review=true if ai_confidence < 0.900
4. **Numeric Precision**: `ai_confidence` uses 3 decimals (0.000-1.000), but `dose_amount` uses generic NUMERIC (no specific precision)
5. **Route Examples**: 'oral', 'intramuscular', 'topical', 'intravenous', 'subcutaneous', 'transdermal', 'inhalation'
6. **Frequency Examples**: 'daily', 'twice_daily', 'three_times_daily', 'as_needed', 'every_4_hours', 'weekly'
7. **Temporal Columns**: This table HAS temporal management columns (added via migration 02, lines 989-1072)
8. **Deduplication**: Use `clinical_identity_key` for identifying duplicate interventions across multiple uploads
9. **JSONB Fields**: `extracted_dates` and `date_conflicts` are JSONB arrays

## Intervention Type Selection Logic

- **medication_admin**: Any drug administration (prescription or OTC)
- **vaccination**: Specifically immunizations and vaccines
- **minor_procedure**: Office-based procedures, typically done under local anesthesia
- **surgery**: Surgical procedures requiring OR or surgical suite
- **therapy**: Non-pharmaceutical therapeutic interventions (PT, OT, counseling)

## Schema Validation Checklist

- [ ] `event_id` references a valid patient_clinical_events record
- [ ] `intervention_type` is one of: 'medication_admin', 'vaccination', 'minor_procedure', 'surgery', 'therapy'
- [ ] For medication_admin/vaccination: `substance_name` should be provided
- [ ] For minor_procedure/surgery: `technique` should be provided
- [ ] `ai_confidence` is between 0.000 and 1.000 with 3 decimal places
- [ ] `followup_required` is boolean (true/false)
- [ ] `date_confidence` (if provided) is one of: 'high', 'medium', 'low', 'conflicted'
- [ ] `date_source` (if provided) is one of: 'clinical_content', 'document_date', 'file_metadata', 'upload_timestamp', 'user_provided'
- [ ] JSONB fields are valid JSON objects/arrays

## Database Constraint Notes

- **FK to parent event**: `event_id` has ON DELETE CASCADE - if parent clinical event is deleted, this intervention is automatically deleted
- **Temporal self-reference**: `superseded_by_record_id` references patient_interventions(id) for version tracking
- **Generated column**: `is_current` is automatically computed as `(valid_to IS NULL)`, cannot be manually set
- **No CHECK constraints on text fields**: intervention_type values are documented but not DB-enforced (allows flexibility)
- **Flexible medication fields**: dose_amount is NUMERIC without specific precision to accommodate various medication doses