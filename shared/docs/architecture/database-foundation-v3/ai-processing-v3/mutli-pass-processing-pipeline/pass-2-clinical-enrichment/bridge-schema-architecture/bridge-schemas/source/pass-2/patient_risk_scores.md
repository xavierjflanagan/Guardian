# patient_risk_scores Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Tier 2 priority table
**Step A Rationale:** Calculated risk assessments (Framingham, ASCVD, Wells, CHA2DS2-VASc). Distinct from clinical scales (PHQ-9) and direct measurements.
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** POINT-IN-TIME - Risk score calculated at specific point in time
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Stores clinical risk assessment scores - calculated predictions of future events or outcomes. These are algorithmic calculations based on multiple inputs, distinct from patient-reported scales (PHQ-9) or direct clinical measurements.

---

## Pass 2 AI Output Schema

```typescript
interface Pass2RiskScoresOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim risk score text

  // REQUIRED - Spatial reference
  y_anchor_start: number;
  y_anchor_end?: number;

  // REQUIRED - Score identification
  score_name_verbatim: string;          // Exactly as stated
  score_name_normalized?: 'framingham' | 'ascvd' | 'wells_dvt' | 'wells_pe' |
                          'cha2ds2_vasc' | 'hasbled' | 'meld' | 'child_pugh' |
                          'apache' | 'sofa' | 'curb65' | 'timi' | 'heart' |
                          'chads2' | 'perc' | 'geneva' | 'other';

  // REQUIRED - Score value
  score_value: number | string;         // Numeric or category result

  // OPTIONAL - Risk interpretation
  risk_category?: 'low' | 'intermediate' | 'high' | 'very_high';
  risk_percentage?: number;             // Percentage risk if calculated
  risk_timeframe?: string;              // "10-year", "30-day", etc.

  // OPTIONAL - Score components (if listed)
  component_values?: Record<string, number | string>;  // Individual inputs used

  // OPTIONAL - Calculation date
  calculated_date?: string;             // ISO date when calculated

  // OPTIONAL - Clinical action
  recommended_action?: string;          // Treatment recommendation based on score
}
```

---

## Example Extractions

### Example 1: ASCVD Risk Score
Document text: "10-year ASCVD risk: 12.5% (intermediate risk)"

```json
{
  "source_text_verbatim": "10-year ASCVD risk: 12.5% (intermediate risk)",
  "y_anchor_start": 445,
  "score_name_verbatim": "10-year ASCVD risk",
  "score_name_normalized": "ascvd",
  "score_value": 12.5,
  "risk_category": "intermediate",
  "risk_percentage": 12.5,
  "risk_timeframe": "10-year"
}
```

### Example 2: CHA2DS2-VASc Score
Document text: "CHA2DS2-VASc score: 4 (high stroke risk, anticoagulation recommended)"

```json
{
  "source_text_verbatim": "CHA2DS2-VASc score: 4 (high stroke risk, anticoagulation recommended)",
  "y_anchor_start": 461,
  "score_name_verbatim": "CHA2DS2-VASc score",
  "score_name_normalized": "cha2ds2_vasc",
  "score_value": 4,
  "risk_category": "high",
  "recommended_action": "anticoagulation recommended"
}
```

### Example 3: Wells Score for DVT
Document text: "Wells DVT score: 3 points - moderate probability, recommend D-dimer"

```json
{
  "source_text_verbatim": "Wells DVT score: 3 points - moderate probability, recommend D-dimer",
  "y_anchor_start": 477,
  "score_name_verbatim": "Wells DVT score",
  "score_name_normalized": "wells_dvt",
  "score_value": 3,
  "risk_category": "intermediate",
  "recommended_action": "recommend D-dimer"
}
```

### Example 4: Framingham with Components
Document text: "Framingham 10-yr CHD risk: 18% (Age 65, TC 240, HDL 42, SBP 145, smoker, no DM)"

```json
{
  "source_text_verbatim": "Framingham 10-yr CHD risk: 18% (Age 65, TC 240, HDL 42, SBP 145, smoker, no DM)",
  "y_anchor_start": 493,
  "score_name_verbatim": "Framingham 10-yr CHD risk",
  "score_name_normalized": "framingham",
  "score_value": 18,
  "risk_percentage": 18,
  "risk_timeframe": "10-year",
  "risk_category": "high",
  "component_values": {
    "age": 65,
    "total_cholesterol": 240,
    "hdl": 42,
    "systolic_bp": 145,
    "smoker": true,
    "diabetes": false
  }
}
```

### Example 5: MELD Score
Document text: "MELD score: 22, listed for liver transplant evaluation"

```json
{
  "source_text_verbatim": "MELD score: 22, listed for liver transplant evaluation",
  "y_anchor_start": 509,
  "score_name_verbatim": "MELD score",
  "score_name_normalized": "meld",
  "score_value": 22,
  "risk_category": "high",
  "recommended_action": "listed for liver transplant evaluation"
}
```

---

## Common Risk Scores Reference

| Score | Purpose | Range |
|-------|---------|-------|
| `framingham` | 10-year cardiovascular disease risk | 0-100% |
| `ascvd` | 10-year atherosclerotic CVD risk | 0-100% |
| `wells_dvt` | DVT probability | 0-9 points |
| `wells_pe` | PE probability | 0-12.5 points |
| `cha2ds2_vasc` | Stroke risk in AFib | 0-9 points |
| `hasbled` | Bleeding risk on anticoagulation | 0-9 points |
| `meld` | Liver disease severity | 6-40 |
| `child_pugh` | Cirrhosis severity | A/B/C |
| `curb65` | Pneumonia severity | 0-5 points |
| `timi` | ACS risk stratification | 0-7 points |
| `heart` | Chest pain risk assessment | 0-10 points |

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
CREATE TABLE patient_risk_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Score identification
    score_name_verbatim TEXT NOT NULL,
    score_name_normalized TEXT CHECK (score_name_normalized IN (
        'framingham', 'ascvd', 'wells_dvt', 'wells_pe', 'cha2ds2_vasc',
        'hasbled', 'meld', 'child_pugh', 'apache', 'sofa', 'curb65',
        'timi', 'heart', 'chads2', 'perc', 'geneva', 'other'
    )),

    -- Score value
    score_value_numeric NUMERIC,
    score_value_text TEXT,

    -- Risk interpretation
    risk_category TEXT CHECK (risk_category IN ('low', 'intermediate', 'high', 'very_high')),
    risk_percentage NUMERIC,
    risk_timeframe TEXT,

    -- Components
    component_values JSONB,

    -- Date
    calculated_date DATE,

    -- Clinical action
    recommended_action TEXT,

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_risk_scores_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE,
    CONSTRAINT risk_scores_has_value CHECK (score_value_numeric IS NOT NULL OR score_value_text IS NOT NULL)
);
```

---

## Risk Score vs Clinical Scale

| Risk Score (this table) | Clinical Scale (patient_scores_scales) |
|-------------------------|----------------------------------------|
| Calculated prediction | Patient response or measurement |
| Future event probability | Current state assessment |
| Algorithm-based | Questionnaire or observation |
| Examples: ASCVD, Wells, MELD | Examples: PHQ-9, MMSE, Karnofsky |

---

## Notes

- **Calculated vs Reported:** Risk scores are algorithmic calculations, not patient-reported outcomes
- **Component tracking:** When individual inputs are listed, capture in component_values JSONB
- **Timeframe matters:** 10-year risk is different from 30-day risk - always capture timeframe
- **Clinical actions:** Include recommended interventions based on score thresholds
- **Score versions:** Some scores have multiple versions (MELD vs MELD-Na) - preserve exact name

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Clinical Scales (contrast):** `patient_scores_scales.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
