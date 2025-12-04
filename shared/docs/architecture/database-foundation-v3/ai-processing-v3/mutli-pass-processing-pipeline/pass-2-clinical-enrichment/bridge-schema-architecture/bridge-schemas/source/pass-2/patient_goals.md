# patient_goals Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Tier 2 priority table
**Step A Rationale:** Patient health goals with target values and progress tracking. Distinct from care plans (provider-driven) and different structure than conditions/symptoms.
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** RANGE-BASED - Goal has target date and progress over time
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Stores patient health goals - specific, measurable objectives for health improvement. These are patient-centered targets distinct from provider care plans. Examples: weight loss goals, A1C targets, blood pressure goals, smoking cessation.

---

## Pass 2 AI Output Schema

```typescript
interface Pass2GoalsOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim goal text

  // REQUIRED - Spatial reference
  y_anchor_start: number;
  y_anchor_end?: number;

  // REQUIRED - Goal description
  goal_description_verbatim: string;    // Exactly as stated

  // OPTIONAL - Goal category
  goal_category?: 'weight' | 'blood_pressure' | 'blood_sugar' | 'cholesterol' |
                  'smoking' | 'exercise' | 'diet' | 'medication_adherence' |
                  'mental_health' | 'functional' | 'pain_management' | 'other';

  // OPTIONAL - Target values
  target_value?: number;
  target_unit?: string;
  baseline_value?: number;
  current_value?: number;

  // OPTIONAL - Progress
  goal_status?: 'active' | 'achieved' | 'not_achieved' | 'discontinued' | 'modified';
  progress_percentage?: number;

  // OPTIONAL - Timeframe
  target_date?: string;                 // ISO date for goal achievement
  set_date?: string;                    // When goal was established

  // OPTIONAL - Context
  related_condition?: string;           // Condition this goal addresses
  barriers_identified?: string;         // Obstacles to achieving goal
}
```

---

## Example Extractions

### Example 1: Weight Loss Goal
Document text: "Goal: Lose 20 lbs by June 2025, current weight 210 lbs, target 190 lbs"

```json
{
  "source_text_verbatim": "Goal: Lose 20 lbs by June 2025, current weight 210 lbs, target 190 lbs",
  "y_anchor_start": 356,
  "goal_description_verbatim": "Lose 20 lbs by June 2025",
  "goal_category": "weight",
  "target_value": 190,
  "target_unit": "lbs",
  "baseline_value": 210,
  "current_value": 210,
  "goal_status": "active",
  "target_date": "2025-06-01"
}
```

### Example 2: A1C Goal
Document text: "Diabetes goal: A1C < 7.0% within 3 months, currently 8.2%"

```json
{
  "source_text_verbatim": "Diabetes goal: A1C < 7.0% within 3 months, currently 8.2%",
  "y_anchor_start": 372,
  "goal_description_verbatim": "A1C < 7.0% within 3 months",
  "goal_category": "blood_sugar",
  "target_value": 7.0,
  "target_unit": "%",
  "current_value": 8.2,
  "goal_status": "active",
  "related_condition": "diabetes"
}
```

### Example 3: Blood Pressure Goal - Achieved
Document text: "BP goal achieved: Target <130/80, now averaging 125/78"

```json
{
  "source_text_verbatim": "BP goal achieved: Target <130/80, now averaging 125/78",
  "y_anchor_start": 388,
  "goal_description_verbatim": "Target BP <130/80",
  "goal_category": "blood_pressure",
  "target_value": 130,
  "target_unit": "mmHg systolic",
  "current_value": 125,
  "goal_status": "achieved",
  "related_condition": "hypertension"
}
```

### Example 4: Smoking Cessation Goal
Document text: "Smoking cessation goal set 01/2024, quit date target 03/01/2024"

```json
{
  "source_text_verbatim": "Smoking cessation goal set 01/2024, quit date target 03/01/2024",
  "y_anchor_start": 404,
  "goal_description_verbatim": "Smoking cessation",
  "goal_category": "smoking",
  "goal_status": "active",
  "set_date": "2024-01",
  "target_date": "2024-03-01"
}
```

### Example 5: Functional Goal with Barriers
Document text: "Goal: Walk 30 min daily. Barriers: knee pain, work schedule"

```json
{
  "source_text_verbatim": "Goal: Walk 30 min daily. Barriers: knee pain, work schedule",
  "y_anchor_start": 420,
  "goal_description_verbatim": "Walk 30 min daily",
  "goal_category": "exercise",
  "target_value": 30,
  "target_unit": "minutes",
  "goal_status": "active",
  "barriers_identified": "knee pain, work schedule"
}
```

---

## Goal Category Reference

| Category | Examples |
|----------|----------|
| `weight` | Weight loss, BMI targets |
| `blood_pressure` | BP control goals |
| `blood_sugar` | A1C, fasting glucose targets |
| `cholesterol` | LDL, total cholesterol targets |
| `smoking` | Cessation, reduction goals |
| `exercise` | Activity frequency, duration targets |
| `diet` | Nutritional goals, sodium reduction |
| `medication_adherence` | Taking meds as prescribed |
| `mental_health` | Depression, anxiety management |
| `functional` | ADL independence, mobility |
| `pain_management` | Pain level targets |

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
CREATE TABLE patient_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Goal description
    goal_description_verbatim TEXT NOT NULL,

    -- Category
    goal_category TEXT CHECK (goal_category IN (
        'weight', 'blood_pressure', 'blood_sugar', 'cholesterol',
        'smoking', 'exercise', 'diet', 'medication_adherence',
        'mental_health', 'functional', 'pain_management', 'other'
    )),

    -- Target values
    target_value NUMERIC,
    target_unit TEXT,
    baseline_value NUMERIC,
    current_value NUMERIC,

    -- Progress
    goal_status TEXT CHECK (goal_status IN (
        'active', 'achieved', 'not_achieved', 'discontinued', 'modified'
    )),
    progress_percentage NUMERIC,

    -- Timeframe
    target_date DATE,
    set_date DATE,

    -- Context
    related_condition TEXT,
    barriers_identified TEXT,

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_goals_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);
```

---

## Goals vs Care Plans

| Goals (this table) | Care Plans (patient_care_plans) |
|--------------------|--------------------------------|
| Patient-centered objectives | Provider-driven action plans |
| Specific measurable targets | Comprehensive treatment approach |
| Single focus area | Multi-faceted interventions |
| Examples: "Lose 20 lbs" | Examples: "Diabetes Management Plan" |

---

## Notes

- **SMART goals:** Goals should be Specific, Measurable, Achievable, Relevant, Time-bound
- **Baseline tracking:** Capture starting values when available for progress measurement
- **Status updates:** Goals evolve - track achieved, modified, discontinued states
- **Barrier identification:** Document obstacles to help with care planning
- **Condition linkage:** Related condition helps contextualize the goal

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Care Plans (related):** `patient_care_plans.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
