# patient_scores_scales Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Tier 3 priority table
**Step A Rationale:** Clinical assessment scales (PHQ-9, GAD-7, MMSE) distinct from risk scores (calculated predictions) and vitals (direct measurements).
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** POINT-IN-TIME - Scale administered at specific point in time
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Stores clinical assessment scale results - standardized questionnaires and functional assessments used to measure patient status. These are distinct from risk scores (algorithmic predictions) and include depression scales, cognitive assessments, functional status, and quality of life measures.

---

## Pass 2 AI Output Schema

```typescript
interface Pass2ScoresScalesOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim scale result

  // REQUIRED - Spatial reference
  y_anchor_start: number;
  y_anchor_end?: number;

  // REQUIRED - Scale identification
  scale_name_verbatim: string;          // Exactly as stated
  scale_name_normalized?: 'phq9' | 'phq2' | 'gad7' | 'mmse' | 'moca' |
                          'gds' | 'bdi' | 'audit' | 'cage' | 'karnofsky' |
                          'ecog' | 'barthel' | 'adl' | 'iadl' | 'falls_risk' |
                          'braden' | 'morse' | 'pain_scale' | 'vas' | 'other';

  // OPTIONAL - Scale category
  scale_category?: 'mental_health' | 'cognitive' | 'functional' | 'pain' |
                   'substance_use' | 'fall_risk' | 'wound_risk' | 'quality_of_life' | 'other';

  // REQUIRED - Score
  total_score: number;
  max_possible_score?: number;

  // OPTIONAL - Interpretation
  severity_interpretation?: string;     // "mild", "moderate", "severe" - as stated
  clinical_interpretation?: string;     // Full interpretation text

  // OPTIONAL - Individual items (if listed)
  item_scores?: Record<string, number>; // Individual question scores

  // OPTIONAL - Administration
  administered_date?: string;           // ISO date when administered
  administered_by?: string;             // Who administered (if stated)
}
```

---

## Example Extractions

### Example 1: PHQ-9 Depression Screen
Document text: "PHQ-9: 15 (moderately severe depression)"

```json
{
  "source_text_verbatim": "PHQ-9: 15 (moderately severe depression)",
  "y_anchor_start": 612,
  "scale_name_verbatim": "PHQ-9",
  "scale_name_normalized": "phq9",
  "scale_category": "mental_health",
  "total_score": 15,
  "max_possible_score": 27,
  "severity_interpretation": "moderately severe",
  "clinical_interpretation": "moderately severe depression"
}
```

### Example 2: MMSE Cognitive Assessment
Document text: "MMSE score: 22/30, suggests mild cognitive impairment"

```json
{
  "source_text_verbatim": "MMSE score: 22/30, suggests mild cognitive impairment",
  "y_anchor_start": 628,
  "scale_name_verbatim": "MMSE",
  "scale_name_normalized": "mmse",
  "scale_category": "cognitive",
  "total_score": 22,
  "max_possible_score": 30,
  "clinical_interpretation": "suggests mild cognitive impairment"
}
```

### Example 3: GAD-7 Anxiety Scale
Document text: "GAD-7: 12 - moderate anxiety, consider treatment"

```json
{
  "source_text_verbatim": "GAD-7: 12 - moderate anxiety, consider treatment",
  "y_anchor_start": 644,
  "scale_name_verbatim": "GAD-7",
  "scale_name_normalized": "gad7",
  "scale_category": "mental_health",
  "total_score": 12,
  "max_possible_score": 21,
  "severity_interpretation": "moderate",
  "clinical_interpretation": "moderate anxiety, consider treatment"
}
```

### Example 4: Karnofsky Performance Status
Document text: "Karnofsky 70% - cares for self, unable to carry on normal activity"

```json
{
  "source_text_verbatim": "Karnofsky 70% - cares for self, unable to carry on normal activity",
  "y_anchor_start": 660,
  "scale_name_verbatim": "Karnofsky",
  "scale_name_normalized": "karnofsky",
  "scale_category": "functional",
  "total_score": 70,
  "max_possible_score": 100,
  "clinical_interpretation": "cares for self, unable to carry on normal activity"
}
```

### Example 5: Morse Fall Risk
Document text: "Morse Fall Scale: 55 (high fall risk) - implement fall precautions"

```json
{
  "source_text_verbatim": "Morse Fall Scale: 55 (high fall risk) - implement fall precautions",
  "y_anchor_start": 676,
  "scale_name_verbatim": "Morse Fall Scale",
  "scale_name_normalized": "morse",
  "scale_category": "fall_risk",
  "total_score": 55,
  "severity_interpretation": "high",
  "clinical_interpretation": "high fall risk - implement fall precautions"
}
```

### Example 6: AUDIT Alcohol Screen
Document text: "AUDIT-C: 6 - positive screen for alcohol use disorder"

```json
{
  "source_text_verbatim": "AUDIT-C: 6 - positive screen for alcohol use disorder",
  "y_anchor_start": 692,
  "scale_name_verbatim": "AUDIT-C",
  "scale_name_normalized": "audit",
  "scale_category": "substance_use",
  "total_score": 6,
  "clinical_interpretation": "positive screen for alcohol use disorder"
}
```

---

## Common Scales Reference

| Scale | Category | Score Range | Purpose |
|-------|----------|-------------|---------|
| `phq9` | Mental Health | 0-27 | Depression severity |
| `phq2` | Mental Health | 0-6 | Depression screening |
| `gad7` | Mental Health | 0-21 | Anxiety severity |
| `mmse` | Cognitive | 0-30 | Cognitive impairment |
| `moca` | Cognitive | 0-30 | Mild cognitive impairment |
| `gds` | Mental Health | 0-15/30 | Geriatric depression |
| `audit` | Substance Use | 0-40 | Alcohol use screening |
| `cage` | Substance Use | 0-4 | Alcohol dependence |
| `karnofsky` | Functional | 0-100 | Performance status |
| `ecog` | Functional | 0-5 | Performance status |
| `barthel` | Functional | 0-100 | ADL independence |
| `braden` | Wound Risk | 6-23 | Pressure ulcer risk |
| `morse` | Fall Risk | 0-125 | Fall risk assessment |

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
CREATE TABLE patient_scores_scales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Scale identification
    scale_name_verbatim TEXT NOT NULL,
    scale_name_normalized TEXT CHECK (scale_name_normalized IN (
        'phq9', 'phq2', 'gad7', 'mmse', 'moca', 'gds', 'bdi',
        'audit', 'cage', 'karnofsky', 'ecog', 'barthel', 'adl',
        'iadl', 'falls_risk', 'braden', 'morse', 'pain_scale', 'vas', 'other'
    )),
    scale_category TEXT CHECK (scale_category IN (
        'mental_health', 'cognitive', 'functional', 'pain',
        'substance_use', 'fall_risk', 'wound_risk', 'quality_of_life', 'other'
    )),

    -- Score
    total_score NUMERIC NOT NULL,
    max_possible_score NUMERIC,

    -- Interpretation
    severity_interpretation TEXT,
    clinical_interpretation TEXT,

    -- Individual items
    item_scores JSONB,

    -- Administration
    administered_date DATE,
    administered_by TEXT,

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_scores_scales_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);
```

---

## Clinical Scales vs Risk Scores

| Clinical Scales (this table) | Risk Scores (patient_risk_scores) |
|------------------------------|-----------------------------------|
| Patient questionnaire/assessment | Algorithmic calculation |
| Current state measurement | Future event prediction |
| Direct patient input | Multiple data inputs |
| Examples: PHQ-9, MMSE, Karnofsky | Examples: ASCVD, Wells, MELD |

---

## Notes

- **Questionnaire vs Calculation:** Scales are patient-reported or clinician-observed; risk scores are calculated
- **Max score context:** Always capture max_possible_score when stated for proper interpretation
- **Severity mapping:** Use standardized severity_interpretation when document states it
- **Item-level data:** If individual question scores listed, capture in item_scores JSONB
- **Serial tracking:** Scales are often repeated - each administration gets its own row

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Risk Scores (contrast):** `patient_risk_scores.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
