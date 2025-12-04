# patient_observations Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** KEEP (but needs refinement)
**Step A Rationale:** Primary spoke for lab results, physical findings, and assessment scores. NOT for vital signs (use patient_vitals instead). Needs database migration to add y_anchor, source_text_verbatim, observation_name, specimen_type, body_site, and potentially patient_id for consistency.
**Step B Sync:** Verified against 03_clinical_core.sql lines 434-466 | GAPS: Missing y_anchor, missing source_text_verbatim, observation_type should exclude 'vital_sign'
**Step C Columns:** DONE - See Column Audit section below
**Step D Temporal:** POINT-IN-TIME - Lab results and findings are snapshots; value at time T is forever that value
**Last Triage Update:** 2025-12-04
**Original Created:** 30 September 2025

---

## Triage Summary

### What This Table IS For
- **Lab results** - Blood tests, urinalysis, cultures, chemistry panels
- **Physical findings** - Clinical observations from physical examination
- **Assessment scores** - Standardized tools (PHQ-9, MMSE, GCS, pain scales)

### What This Table is NOT For
- **Vital signs** - Use `patient_vitals` instead (dedicated spoke table)

### Critical Issues Found

| Issue | Severity | Resolution |
|-------|----------|------------|
| `observation_type` includes 'vital_sign' | HIGH | Remove from enum - vitals go to patient_vitals |
| No `patient_id` column | MEDIUM | Inconsistent with other spokes - consider adding |
| No `y_anchor` column | HIGH | Add for click-through spatial reference |
| No `source_text_verbatim` column | HIGH | Add for raw text display |
| Schema expects AI to output `event_id` | HIGH | Strategy-A: Server adds IDs, not AI |

### Proposed Schema Changes (Pending Migration)

```sql
-- Add columns for Strategy-A alignment
ALTER TABLE patient_observations ADD COLUMN y_anchor INTEGER;
ALTER TABLE patient_observations ADD COLUMN source_text_verbatim TEXT;
-- Optional: Add patient_id for consistency with other spokes
-- ALTER TABLE patient_observations ADD COLUMN patient_id UUID REFERENCES user_profiles(id);

-- Update observation_type enum to remove 'vital_sign'
-- This requires migration: current constraint is TEXT with no CHECK
```

---

**Database Source:** /current_schema/03_clinical_core.sql (lines 434-466)
**Priority:** HIGH - Observation details for information gathering events (labs, physical findings, assessments)

## Database Table Structure

```sql
-- Migration 08: This table has NO patient_id column - derives it through event_id → patient_clinical_events
CREATE TABLE IF NOT EXISTS patient_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE, -- Migration 08: Required hub reference

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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration 08: Event reference index for efficient joins
CREATE INDEX IF NOT EXISTS idx_patient_observations_event_id ON patient_observations(event_id);
```

## AI Extraction Requirements for Pass 2 (Strategy-A)

Extract detailed observation data from medical documents for information gathering events. This table handles **lab results, physical findings, and assessment scores** - NOT vital signs.

### Strategy-A Token Optimization

**AI outputs ONLY clinical content. Server adds:**
- All UUIDs (id, event_id, patient_id)
- ai_extracted (always true)
- ai_confidence (from processing metadata)
- requires_review (derived from confidence threshold)
- created_at, updated_at timestamps

### Pass 2 AI Output Interface

```typescript
interface Pass2ObservationsOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;           // Full verbatim text from document

  // REQUIRED - Spatial reference
  y_anchor: number;                       // Y coordinate of the line - required for click-through

  // REQUIRED - Classification (NO 'vital_sign' - use patient_vitals)
  observation_type: 'lab_result' | 'physical_finding' | 'assessment_score';

  // REQUIRED - Observation name/description
  observation_name: string;               // "Hemoglobin A1c", "Heart sounds", "PHQ-9 Score"

  // MEASUREMENT VALUES (at least one required)
  value_text?: string;                    // Original extracted text value (e.g., "7.2%")
  value_numeric?: number;                 // Normalized numeric value (e.g., 7.2)
  value_secondary?: number;               // For paired values (rarely used for observations)
  value_boolean?: boolean;                // For yes/no findings (e.g., "murmur present")
  unit?: string;                          // Measurement unit (e.g., "%", "mg/dL")

  // REFERENCE RANGES (OPTIONAL - only if stated in document)
  reference_range_text?: string;          // Human-readable range from document
  reference_range_low?: number;           // Lower bound if numeric
  reference_range_high?: number;          // Upper bound if numeric
  interpretation?: 'normal' | 'high' | 'low' | 'critical' | 'abnormal';

  // ASSESSMENT SPECIFIC (OPTIONAL - only for assessment_score type)
  assessment_tool?: string;               // Standardized tool name: 'PHQ-9', 'MMSE', 'GCS'
  score_max?: number;                     // Maximum possible score (e.g., 27 for PHQ-9)

  // OPTIONAL - Additional context
  specimen_type?: string;                 // For lab results: "blood", "urine", "swab"
  body_site?: string;                     // For physical findings: "left lower lobe", "right deltoid"
  notes?: string;                         // Any other relevant clinical notes from document
}
```

### Observation Type Classification

| Type | What It Is | Examples | What It's NOT |
|------|-----------|----------|---------------|
| `lab_result` | Tests requiring laboratory analysis | HbA1c, CBC, lipid panel, urinalysis | Vital signs, physical exam findings |
| `physical_finding` | Observations from physical examination | Heart murmur, breath sounds, rash | Lab tests, vital signs |
| `assessment_score` | Standardized screening/assessment tools | PHQ-9, MMSE, Glasgow Coma Scale | Free-text clinical notes |

### Why NOT 'vital_sign'?

Vital signs have their own dedicated spoke table (`patient_vitals`) because:
1. **Different data structure** - Vitals have specific measurement patterns (BP has systolic/diastolic, temp has C/F)
2. **Different display requirements** - Vitals are often charted over time
3. **Higher frequency** - Vitals appear in almost every encounter
4. **Simpler extraction** - Vitals have standardized formats

If Pass 2 encounters a vital sign, it routes to `patient_vitals`, not `patient_observations`.

## Observation Type Classification Guide (Strategy-A)

### lab_result
Laboratory test results requiring analysis:
- **Blood tests:** HbA1c, CBC, lipid panel, BMP, CMP, liver function, thyroid panel
- **Urine tests:** Urinalysis, urine culture, microalbumin
- **Microbiology:** Cultures, sensitivities, swabs
- **Chemistry panels:** Electrolytes, kidney function, glucose
- **Hormone levels:** TSH, T4, cortisol, testosterone
- **Tumor markers:** PSA, CA-125, CEA

### physical_finding
Clinical observations from physical examination:
- **Cardiovascular:** Heart sounds (murmur, S3/S4), peripheral pulses, edema
- **Respiratory:** Breath sounds (crackles, wheezes), percussion findings
- **Abdominal:** Bowel sounds, organomegaly, tenderness location
- **Neurological:** Reflexes, cranial nerve findings, motor/sensory exam
- **Musculoskeletal:** Range of motion, joint findings, gait
- **Skin:** Rashes, lesions, wound descriptions
- **HEENT:** Pupil responses, tympanic membrane, throat findings

### assessment_score
Standardized screening and assessment tools with defined scoring:
- **Mental health:** PHQ-9, GAD-7, AUDIT-C, CAGE, Columbia Suicide Severity Rating
- **Cognitive:** MMSE, MoCA, Clock Drawing Test
- **Trauma/Emergency:** Glasgow Coma Scale, APGAR, Trauma Score
- **Pain:** Visual Analog Scale (VAS), Numeric Rating Scale (NRS)
- **Functional:** Barthel Index, Karnofsky Performance Status, ECOG
- **Fall risk:** Morse Fall Scale, Hendrich II
- **Nutrition:** MNA, MUST

### NOT for this table (vital_sign REMOVED)
The following should go to `patient_vitals` instead:
- Blood pressure, heart rate, temperature, respiratory rate
- Oxygen saturation (SpO2), weight, height, BMI

---

## Example Extractions (Strategy-A Format)

### Example 1: HbA1c Lab Result
**Source text:** "HbA1c: 7.2% (Normal: <5.7%)"

```json
{
  "source_text_verbatim": "HbA1c: 7.2% (Normal: <5.7%)",
  "y_anchor": 342,
  "observation_type": "lab_result",
  "observation_name": "Hemoglobin A1c",
  "value_text": "7.2%",
  "value_numeric": 7.2,
  "unit": "%",
  "reference_range_text": "Normal: <5.7%",
  "reference_range_high": 5.7,
  "interpretation": "high",
  "specimen_type": "blood"
}
```

### Example 2: Complete Blood Count with Multiple Values
**Source text:** "CBC: WBC 8.2, Hgb 12.4, Plt 245 (all normal)"

```json
[
  {
    "source_text_verbatim": "WBC 8.2",
    "y_anchor": 156,
    "observation_type": "lab_result",
    "observation_name": "White Blood Cell Count",
    "value_numeric": 8.2,
    "unit": "x10^9/L",
    "interpretation": "normal",
    "specimen_type": "blood"
  },
  {
    "source_text_verbatim": "Hgb 12.4",
    "y_anchor": 156,
    "observation_type": "lab_result",
    "observation_name": "Hemoglobin",
    "value_numeric": 12.4,
    "unit": "g/dL",
    "interpretation": "normal",
    "specimen_type": "blood"
  },
  {
    "source_text_verbatim": "Plt 245",
    "y_anchor": 156,
    "observation_type": "lab_result",
    "observation_name": "Platelet Count",
    "value_numeric": 245,
    "unit": "x10^9/L",
    "interpretation": "normal",
    "specimen_type": "blood"
  }
]
```

### Example 3: PHQ-9 Assessment Score
**Source text:** "PHQ-9 Score: 12/27 - moderate depression"

```json
{
  "source_text_verbatim": "PHQ-9 Score: 12/27 - moderate depression",
  "y_anchor": 89,
  "observation_type": "assessment_score",
  "observation_name": "PHQ-9 Depression Screening",
  "assessment_tool": "PHQ-9",
  "value_numeric": 12,
  "score_max": 27,
  "interpretation": "abnormal",
  "reference_range_text": "0-4: minimal, 5-9: mild, 10-14: moderate, 15-19: moderately severe, 20-27: severe",
  "notes": "moderate depression"
}
```

### Example 4: Physical Finding (Boolean)
**Source text:** "Heart: Regular rhythm, grade II/VI systolic murmur at apex"

```json
{
  "source_text_verbatim": "Heart: Regular rhythm, grade II/VI systolic murmur at apex",
  "y_anchor": 445,
  "observation_type": "physical_finding",
  "observation_name": "Systolic Heart Murmur",
  "value_text": "grade II/VI systolic murmur",
  "value_boolean": true,
  "body_site": "apex",
  "notes": "Regular rhythm"
}
```

### Example 5: Physical Finding (Negative/Absent)
**Source text:** "Lungs: Clear to auscultation bilaterally, no wheezes or crackles"

```json
{
  "source_text_verbatim": "Lungs: Clear to auscultation bilaterally, no wheezes or crackles",
  "y_anchor": 467,
  "observation_type": "physical_finding",
  "observation_name": "Lung Auscultation",
  "value_text": "Clear to auscultation bilaterally",
  "value_boolean": false,
  "body_site": "bilateral lungs",
  "notes": "no wheezes or crackles"
}
```

### Example 6: Glasgow Coma Scale
**Source text:** "GCS 15 (E4 V5 M6) - patient alert and oriented"

```json
{
  "source_text_verbatim": "GCS 15 (E4 V5 M6) - patient alert and oriented",
  "y_anchor": 234,
  "observation_type": "assessment_score",
  "observation_name": "Glasgow Coma Scale",
  "assessment_tool": "GCS",
  "value_text": "E4 V5 M6",
  "value_numeric": 15,
  "score_max": 15,
  "interpretation": "normal",
  "notes": "patient alert and oriented"
}
```

---

## Unit Handling

### Lab Result Units
Unlike vitals, lab result units are NOT universally standardized. AI MUST extract the unit from the document.

**Common lab units to extract:**
| Test Type | Common Units |
|-----------|-------------|
| Blood glucose | mg/dL, mmol/L |
| HbA1c | % |
| Cholesterol | mg/dL, mmol/L |
| Hemoglobin | g/dL, g/L |
| White blood cells | x10^9/L, cells/mcL |
| Platelets | x10^9/L, cells/mcL |
| Creatinine | mg/dL, umol/L |
| eGFR | mL/min/1.73m2 |

**Rule:** If the document states a unit, extract it. If no unit stated, leave `unit` as NULL.

---

## Date Handling (CRITICAL)

**Observations are point-in-time. Date accuracy is critical.**

**Date derivation hierarchy:**
1. **Encounter-level date** - Server derives from `source_encounter.encounter_start_date`
2. **Lab collection date** - If explicitly stated, extract to `notes` field
3. **No explicit date on observation record** - Unlike medications, observations don't have their own date fields

**Why no date field?**
- Observations are always tied to an encounter
- The encounter provides the temporal context
- Lab collection date vs report date is complex - better handled via notes

---

## Column Audit (Phase 1 Step C)

### Current Database Columns (03_clinical_core.sql lines 434-466)

| Column | Type | Current | Strategy-A Change |
|--------|------|---------|-------------------|
| id | UUID | Keep | Server-generated |
| event_id | UUID NOT NULL | Keep | Server-assigned |
| observation_type | TEXT NOT NULL | Update | Remove 'vital_sign' from enum |
| value_text | TEXT | Keep | AI extracts |
| value_numeric | NUMERIC | Keep | AI extracts |
| value_secondary | NUMERIC | Keep | Rarely used for observations |
| value_boolean | BOOLEAN | Keep | For present/absent findings |
| unit | TEXT | Keep | AI extracts (required for lab_result) |
| reference_range_text | TEXT | Keep | AI extracts if stated |
| reference_range_low | NUMERIC | Keep | AI extracts if stated |
| reference_range_high | NUMERIC | Keep | AI extracts if stated |
| interpretation | TEXT CHECK | Keep | AI extracts if stated |
| assessment_tool | TEXT | Keep | For assessment_score type |
| score_max | NUMERIC | Keep | For assessment_score type |
| ai_extracted | BOOLEAN | Keep | Server-assigned (always true) |
| ai_confidence | NUMERIC(4,3) | Keep | Server-assigned |
| requires_review | BOOLEAN | Keep | Server-derived from confidence |
| created_at | TIMESTAMPTZ | Keep | Server-generated |
| updated_at | TIMESTAMPTZ | Keep | Server-generated |

### Columns to ADD (Migration Required)

| Column | Type | Purpose |
|--------|------|---------|
| source_text_verbatim | TEXT | Raw text from document for display |
| y_anchor | INTEGER | Y coordinate for click-through |
| observation_name | TEXT | Human-readable name (e.g., "Hemoglobin A1c") |
| specimen_type | TEXT | For lab_result: blood, urine, swab |
| body_site | TEXT | For physical_finding: location of finding |

### patient_id Column Discussion

**Current state:** No patient_id column - derives through event_id -> hub

**Inconsistency:** All other spoke tables (vitals, medications, allergies, conditions) HAVE patient_id with composite FK

**Decision needed:** Add patient_id for consistency, or keep as-is for architectural purity?

**Recommendation:** ADD patient_id for:
1. Consistency with other spokes
2. Simpler RLS policies
3. Faster queries without hub JOIN

---

## Critical Notes (Strategy-A Updates)

1. **NO 'vital_sign' observation_type**: Vital signs go to `patient_vitals` table, not here.

2. **Token Optimization**: AI outputs only clinical content. Server adds all IDs, confidence, and timestamps.

3. **Value Flexibility**: At least ONE value field must be populated (value_text, value_numeric, or value_boolean).

4. **Unit Required for Labs**: If `observation_type` is 'lab_result' and `value_numeric` is provided, `unit` should be included.

5. **Interpretation Enum**: 'normal', 'high', 'low', 'critical', 'abnormal' - extract only if document explicitly states.

6. **y_anchor Required**: Every observation needs spatial reference for document click-through.

7. **source_text_verbatim Required**: Every observation needs raw text for display and audit trail.

---

## Schema Validation Checklist (Strategy-A)

- [ ] `source_text_verbatim` is populated (raw text from document)
- [ ] `y_anchor` is populated (spatial reference)
- [ ] `observation_type` is one of: 'lab_result', 'physical_finding', 'assessment_score' (NOT 'vital_sign')
- [ ] `observation_name` provides human-readable description
- [ ] At least ONE value field is populated (value_text, value_numeric, or value_boolean)
- [ ] For 'lab_result' with value_numeric, `unit` should be included
- [ ] For 'assessment_score', `assessment_tool` and `score_max` should be included
- [ ] `interpretation` (if provided) is one of: 'normal', 'high', 'low', 'critical', 'abnormal'

---

## Database Constraint Notes (Current State)

- **NO patient_id column**: Patient ID derived through `event_id -> patient_clinical_events` (Migration 08)
- **FK to parent event**: `event_id` has ON DELETE CASCADE
- **No CHECK on observation_type**: Currently TEXT with no enum constraint
- **Index**: `idx_patient_observations_event_id` for efficient JOINs