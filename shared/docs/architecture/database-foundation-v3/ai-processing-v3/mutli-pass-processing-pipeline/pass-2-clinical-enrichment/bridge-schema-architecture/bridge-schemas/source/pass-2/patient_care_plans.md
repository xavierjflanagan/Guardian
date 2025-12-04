# patient_care_plans Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Tier 2 priority table
**Step A Rationale:** Comprehensive treatment plans with multiple interventions, timelines, responsible parties. Distinct from individual goals or treatments.
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** RANGE-BASED - Care plan has start date and ongoing or end date
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Stores comprehensive care plans - provider-driven coordinated treatment approaches for managing conditions. These are multi-faceted plans involving medications, therapies, lifestyle changes, and follow-up schedules. Distinct from individual patient goals.

---

## Pass 2 AI Output Schema

```typescript
interface Pass2CarePlansOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim care plan text

  // REQUIRED - Spatial reference
  y_anchor_start: number;
  y_anchor_end?: number;

  // REQUIRED - Plan identification
  plan_name_verbatim: string;           // Exactly as stated
  plan_type?: 'disease_management' | 'preventive' | 'post_surgical' | 'rehabilitation' |
              'palliative' | 'chronic_care' | 'discharge' | 'transition' | 'other';

  // OPTIONAL - Target condition
  target_condition?: string;            // Condition being managed

  // OPTIONAL - Plan status
  plan_status?: 'active' | 'completed' | 'on_hold' | 'discontinued';

  // OPTIONAL - Dates
  start_date?: string;                  // ISO date when plan started
  end_date?: string;                    // ISO date when plan ended/expected to end
  review_date?: string;                 // Next review date

  // OPTIONAL - Plan components (summarized)
  medications_component?: string;       // Medication aspects of plan
  therapy_component?: string;           // Therapy/rehab aspects
  lifestyle_component?: string;         // Diet/exercise/behavioral aspects
  monitoring_component?: string;        // Tests/follow-up aspects

  // OPTIONAL - Care team
  primary_provider?: string;            // Lead provider for plan
  care_team_members?: string[];         // Other involved providers

  // OPTIONAL - Patient instructions
  patient_instructions?: string;        // Instructions given to patient
}
```

---

## Example Extractions

### Example 1: Diabetes Management Plan
Document text: "Diabetes Care Plan: Metformin 1000mg BID, A1C q3months, nutrition consult, foot exams q6months"

```json
{
  "source_text_verbatim": "Diabetes Care Plan: Metformin 1000mg BID, A1C q3months, nutrition consult, foot exams q6months",
  "y_anchor_start": 523,
  "plan_name_verbatim": "Diabetes Care Plan",
  "plan_type": "disease_management",
  "target_condition": "diabetes",
  "plan_status": "active",
  "medications_component": "Metformin 1000mg BID",
  "monitoring_component": "A1C q3months, foot exams q6months",
  "lifestyle_component": "nutrition consult"
}
```

### Example 2: Post-Surgical Care Plan
Document text: "Post-op Plan: Knee replacement rehab - PT 3x/week x 6 weeks, pain management, weight bearing as tolerated. Follow-up 2 weeks."

```json
{
  "source_text_verbatim": "Post-op Plan: Knee replacement rehab - PT 3x/week x 6 weeks, pain management, weight bearing as tolerated. Follow-up 2 weeks.",
  "y_anchor_start": 539,
  "plan_name_verbatim": "Knee replacement rehab",
  "plan_type": "post_surgical",
  "target_condition": "s/p knee replacement",
  "plan_status": "active",
  "therapy_component": "PT 3x/week x 6 weeks",
  "medications_component": "pain management",
  "patient_instructions": "weight bearing as tolerated",
  "review_date": "2 weeks"
}
```

### Example 3: Heart Failure Management
Document text: "CHF Management Plan (Dr. Smith): Daily weights, fluid restriction 2L, lasix 40mg, low sodium diet, cardiology f/u monthly"

```json
{
  "source_text_verbatim": "CHF Management Plan (Dr. Smith): Daily weights, fluid restriction 2L, lasix 40mg, low sodium diet, cardiology f/u monthly",
  "y_anchor_start": 555,
  "plan_name_verbatim": "CHF Management Plan",
  "plan_type": "chronic_care",
  "target_condition": "heart failure",
  "plan_status": "active",
  "primary_provider": "Dr. Smith",
  "medications_component": "lasix 40mg",
  "monitoring_component": "Daily weights, cardiology f/u monthly",
  "lifestyle_component": "fluid restriction 2L, low sodium diet"
}
```

### Example 4: Discharge Plan
Document text: "Discharge Plan: Home with home health, wound care daily, antibiotics x 10 days, follow-up PCP 1 week"

```json
{
  "source_text_verbatim": "Discharge Plan: Home with home health, wound care daily, antibiotics x 10 days, follow-up PCP 1 week",
  "y_anchor_start": 571,
  "plan_name_verbatim": "Discharge Plan",
  "plan_type": "discharge",
  "plan_status": "active",
  "medications_component": "antibiotics x 10 days",
  "therapy_component": "wound care daily",
  "monitoring_component": "follow-up PCP 1 week",
  "care_team_members": ["home health"]
}
```

### Example 5: Palliative Care Plan
Document text: "Palliative Care Plan: Comfort measures, pain control with morphine prn, hospice referral, family meeting scheduled"

```json
{
  "source_text_verbatim": "Palliative Care Plan: Comfort measures, pain control with morphine prn, hospice referral, family meeting scheduled",
  "y_anchor_start": 587,
  "plan_name_verbatim": "Palliative Care Plan",
  "plan_type": "palliative",
  "plan_status": "active",
  "medications_component": "morphine prn",
  "patient_instructions": "comfort measures",
  "care_team_members": ["hospice"]
}
```

---

## Plan Type Reference

| Type | Description |
|------|-------------|
| `disease_management` | Ongoing management of chronic condition |
| `preventive` | Prevention-focused (cancer screening, vaccinations) |
| `post_surgical` | Post-operative recovery plan |
| `rehabilitation` | Recovery from injury/illness |
| `palliative` | Comfort and quality of life focus |
| `chronic_care` | Long-term chronic disease management |
| `discharge` | Hospital discharge instructions |
| `transition` | Care transition (facility to home, etc.) |

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
CREATE TABLE patient_care_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Plan identification
    plan_name_verbatim TEXT NOT NULL,
    plan_type TEXT CHECK (plan_type IN (
        'disease_management', 'preventive', 'post_surgical', 'rehabilitation',
        'palliative', 'chronic_care', 'discharge', 'transition', 'other'
    )),

    -- Target condition
    target_condition TEXT,

    -- Status
    plan_status TEXT CHECK (plan_status IN ('active', 'completed', 'on_hold', 'discontinued')),

    -- Dates
    start_date DATE,
    end_date DATE,
    review_date DATE,

    -- Plan components
    medications_component TEXT,
    therapy_component TEXT,
    lifestyle_component TEXT,
    monitoring_component TEXT,

    -- Care team
    primary_provider TEXT,
    care_team_members TEXT[],

    -- Patient instructions
    patient_instructions TEXT,

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_care_plans_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);
```

---

## Care Plans vs Goals

| Care Plans (this table) | Goals (patient_goals) |
|-------------------------|----------------------|
| Provider-driven comprehensive plans | Patient-centered specific targets |
| Multiple intervention components | Single measurable objective |
| Care team coordination | Individual focus |
| Examples: "Diabetes Management Plan" | Examples: "A1C < 7%" |

---

## Notes

- **Plan components:** Break down plans into medication, therapy, lifestyle, and monitoring components when possible
- **Care team tracking:** Document all providers involved for care coordination
- **Status tracking:** Plans evolve - track active, on hold, completed, discontinued
- **Review dates:** Capture next review date for continuity of care
- **Multi-line extraction:** Care plans often span multiple lines - use y_anchor_end

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Goals (related):** `patient_goals.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
