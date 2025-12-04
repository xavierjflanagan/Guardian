# patient_lab_results Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Tier 1 priority table
**Step A Rationale:** Highest volume observation type with unique fields (LOINC, reference ranges, specimen type, panel grouping). Previously in patient_observations.
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** POINT-IN-TIME - Lab result is a snapshot at collection/result time
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Stores laboratory test results - the highest volume clinical data type. Separated from generic observations due to unique fields like LOINC codes, reference ranges, specimen types, and panel groupings.

---

## Pass 2 AI Output Schema

```typescript
interface Pass2LabResultsOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim line from document

  // REQUIRED - Spatial reference
  y_anchor_start: number;
  y_anchor_end?: number;

  // REQUIRED - Test identification
  test_name_verbatim: string;           // Exactly as stated
  test_name_normalized?: string;        // Standardized test name (if obvious)

  // OPTIONAL - Panel grouping
  panel_name?: string;                  // CMP, CBC, Lipid Panel, etc.

  // OPTIONAL - LOINC code (only if printed in document)
  loinc_code?: string;

  // REQUIRED - Result (one or both)
  value_numeric?: number;               // Numeric result
  value_text?: string;                  // Text result (positive/negative, reactive, etc.)

  // OPTIONAL - Unit (only if stated - see unit handling)
  unit?: string;

  // OPTIONAL - Reference range
  reference_range_low?: number;
  reference_range_high?: number;

  // OPTIONAL - Interpretation
  interpretation?: 'normal' | 'high' | 'low' | 'critical' | 'abnormal';

  // OPTIONAL - Result status
  result_status?: 'final' | 'preliminary' | 'corrected' | 'amended';

  // OPTIONAL - Specimen info
  specimen_type?: string;               // blood, urine, CSF, etc.

  // OPTIONAL - Dates
  collection_datetime?: string;         // When specimen collected
  result_datetime?: string;             // When result reported

  // OPTIONAL - Lab info
  performing_lab?: string;              // Lab name if stated
}
```

---

## Example Extractions

### Example 1: Simple Numeric Result
Document text: "Hemoglobin: 7.2 g/dL (L) [ref: 12.0-16.0]"

```json
{
  "source_text_verbatim": "Hemoglobin: 7.2 g/dL (L) [ref: 12.0-16.0]",
  "y_anchor_start": 512,
  "test_name_verbatim": "Hemoglobin",
  "value_numeric": 7.2,
  "unit": "g/dL",
  "reference_range_low": 12.0,
  "reference_range_high": 16.0,
  "interpretation": "low"
}
```

### Example 2: Panel Result
Document text: "CMP - Glucose: 126 mg/dL (H), Creatinine: 1.2 mg/dL"

```json
[
  {
    "source_text_verbatim": "Glucose: 126 mg/dL (H)",
    "y_anchor_start": 528,
    "test_name_verbatim": "Glucose",
    "panel_name": "CMP",
    "value_numeric": 126,
    "unit": "mg/dL",
    "interpretation": "high"
  },
  {
    "source_text_verbatim": "Creatinine: 1.2 mg/dL",
    "y_anchor_start": 528,
    "test_name_verbatim": "Creatinine",
    "panel_name": "CMP",
    "value_numeric": 1.2,
    "unit": "mg/dL",
    "interpretation": "normal"
  }
]
```

### Example 3: Text Result
Document text: "COVID-19 PCR: Positive"

```json
{
  "source_text_verbatim": "COVID-19 PCR: Positive",
  "y_anchor_start": 544,
  "test_name_verbatim": "COVID-19 PCR",
  "value_text": "Positive",
  "interpretation": "abnormal"
}
```

### Example 4: Result with Status
Document text: "HbA1c: 8.2% (above goal) - PRELIMINARY"

```json
{
  "source_text_verbatim": "HbA1c: 8.2% (above goal) - PRELIMINARY",
  "y_anchor_start": 560,
  "test_name_verbatim": "HbA1c",
  "value_numeric": 8.2,
  "unit": "%",
  "interpretation": "high",
  "result_status": "preliminary"
}
```

### Example 5: CBC with Differential
Document text: "CBC - WBC: 12,500/uL (H), RBC: 4.5 M/uL, Plt: 250 K/uL"

```json
[
  {
    "source_text_verbatim": "WBC: 12,500/uL (H)",
    "y_anchor_start": 576,
    "test_name_verbatim": "WBC",
    "panel_name": "CBC",
    "value_numeric": 12500,
    "unit": "/uL",
    "interpretation": "high"
  },
  {
    "source_text_verbatim": "RBC: 4.5 M/uL",
    "y_anchor_start": 576,
    "test_name_verbatim": "RBC",
    "panel_name": "CBC",
    "value_numeric": 4.5,
    "unit": "M/uL"
  },
  {
    "source_text_verbatim": "Plt: 250 K/uL",
    "y_anchor_start": 576,
    "test_name_verbatim": "Plt",
    "test_name_normalized": "Platelets",
    "panel_name": "CBC",
    "value_numeric": 250,
    "unit": "K/uL"
  }
]
```

---

## Common Panel Names

| Panel | Components |
|-------|------------|
| `CBC` | Complete Blood Count (WBC, RBC, Hgb, Hct, Plt, MCV, MCH, MCHC) |
| `CMP` | Comprehensive Metabolic Panel (Glucose, BUN, Cr, Na, K, Cl, CO2, Ca, Protein, Albumin, Bilirubin, ALP, AST, ALT) |
| `BMP` | Basic Metabolic Panel (subset of CMP) |
| `Lipid Panel` | Total Cholesterol, LDL, HDL, Triglycerides |
| `LFT` | Liver Function Tests (AST, ALT, ALP, Bilirubin, Albumin) |
| `TFT` | Thyroid Function Tests (TSH, T3, T4, Free T4) |
| `Coag Panel` | PT, INR, PTT |
| `UA` | Urinalysis |

---

## What Server Adds

| Field | Source |
|-------|--------|
| `id` | gen_random_uuid() |
| `patient_id` | From encounter context |
| `event_id` | From hub record just created |
| `verbatim_text_vertices` | Post-Pass 2 algorithm |
| `created_at` | NOW() |

---

## Database Schema (Target)

```sql
CREATE TABLE patient_lab_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Test identification
    test_name_verbatim TEXT NOT NULL,
    test_name_normalized TEXT,
    panel_name TEXT,
    loinc_code TEXT,

    -- Result
    value_numeric NUMERIC,
    value_text TEXT,
    unit TEXT,

    -- Reference range
    reference_range_low NUMERIC,
    reference_range_high NUMERIC,

    -- Interpretation
    interpretation TEXT CHECK (interpretation IN ('normal', 'high', 'low', 'critical', 'abnormal')),
    result_status TEXT CHECK (result_status IN ('final', 'preliminary', 'corrected', 'amended')),

    -- Specimen
    specimen_type TEXT,

    -- Dates
    collection_datetime TIMESTAMPTZ,
    result_datetime TIMESTAMPTZ,

    -- Lab info
    performing_lab TEXT,

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_lab_results_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE,
    CONSTRAINT lab_results_has_value CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL)
);
```

---

## Notes

- **One row per test:** Each individual test component gets its own row, even if part of a panel
- **Panel grouping:** `panel_name` links related tests for display purposes
- **Unit handling:** Extract unit if stated - server does NOT add defaults for lab results
- **Interpretation flags:** Only mark interpretation if document explicitly states (H), (L), "abnormal", etc.
- **result_status:** Clinically critical - preliminary results may change
- **LOINC codes:** Only extract if printed in document - don't infer

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
