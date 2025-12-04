# patient_treatments Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Tier 3 priority table
**Step A Rationale:** Non-medication, non-surgical therapeutic interventions (PT, OT, radiation, dialysis, wound care). Falls between procedures and medications.
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** RANGE-BASED - Treatment course has start/end dates with sessions
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Stores therapeutic treatments that are not medications or surgical procedures - physical therapy, occupational therapy, radiation therapy, dialysis, wound care, infusions, and other therapeutic interventions. These are ongoing treatments with sessions/courses.

---

## Pass 2 AI Output Schema

```typescript
interface Pass2TreatmentsOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim treatment text

  // REQUIRED - Spatial reference
  y_anchor_start: number;
  y_anchor_end?: number;

  // REQUIRED - Treatment identification
  treatment_name_verbatim: string;      // Exactly as stated
  treatment_type?: 'physical_therapy' | 'occupational_therapy' | 'speech_therapy' |
                   'radiation' | 'chemotherapy' | 'dialysis' | 'infusion' |
                   'wound_care' | 'respiratory_therapy' | 'phototherapy' |
                   'cardiac_rehab' | 'pulmonary_rehab' | 'other';

  // OPTIONAL - Treatment details
  target_condition?: string;            // Condition being treated
  body_site?: string;                   // Location of treatment
  laterality?: 'left' | 'right' | 'bilateral';

  // OPTIONAL - Schedule
  frequency?: string;                   // "3x/week", "daily", "q2weeks"
  duration_per_session?: string;        // "30 minutes", "4 hours"
  total_sessions?: number;              // Total planned sessions
  sessions_completed?: number;          // Sessions completed so far

  // OPTIONAL - Dates
  start_date?: string;                  // ISO date when treatment started
  end_date?: string;                    // ISO date when treatment ended/planned to end

  // OPTIONAL - Provider/facility
  treating_provider?: string;           // Therapist/specialist name
  treating_facility?: string;           // Facility name

  // OPTIONAL - Status
  treatment_status?: 'active' | 'completed' | 'discontinued' | 'on_hold';

  // OPTIONAL - Response
  response_to_treatment?: string;       // How patient is responding
}
```

---

## Example Extractions

### Example 1: Physical Therapy
Document text: "PT: 3x/week for 6 weeks, knee strengthening post-TKR"

```json
{
  "source_text_verbatim": "PT: 3x/week for 6 weeks, knee strengthening post-TKR",
  "y_anchor_start": 712,
  "treatment_name_verbatim": "PT knee strengthening",
  "treatment_type": "physical_therapy",
  "target_condition": "post-TKR",
  "body_site": "knee",
  "frequency": "3x/week",
  "total_sessions": 18,
  "treatment_status": "active"
}
```

### Example 2: Dialysis
Document text: "Hemodialysis MWF at DaVita, 4 hour sessions, started 03/2024"

```json
{
  "source_text_verbatim": "Hemodialysis MWF at DaVita, 4 hour sessions, started 03/2024",
  "y_anchor_start": 728,
  "treatment_name_verbatim": "Hemodialysis",
  "treatment_type": "dialysis",
  "target_condition": "ESRD",
  "frequency": "MWF",
  "duration_per_session": "4 hours",
  "treating_facility": "DaVita",
  "start_date": "2024-03",
  "treatment_status": "active"
}
```

### Example 3: Radiation Therapy
Document text: "XRT to right breast, 30 fractions completed, 3 remaining. Tolerated well."

```json
{
  "source_text_verbatim": "XRT to right breast, 30 fractions completed, 3 remaining. Tolerated well.",
  "y_anchor_start": 744,
  "treatment_name_verbatim": "XRT to right breast",
  "treatment_type": "radiation",
  "target_condition": "breast cancer",
  "body_site": "breast",
  "laterality": "right",
  "total_sessions": 33,
  "sessions_completed": 30,
  "treatment_status": "active",
  "response_to_treatment": "Tolerated well"
}
```

### Example 4: Wound Care
Document text: "Wound care: Wet-to-dry dressing changes BID to left heel ulcer"

```json
{
  "source_text_verbatim": "Wound care: Wet-to-dry dressing changes BID to left heel ulcer",
  "y_anchor_start": 760,
  "treatment_name_verbatim": "Wet-to-dry dressing changes",
  "treatment_type": "wound_care",
  "target_condition": "heel ulcer",
  "body_site": "heel",
  "laterality": "left",
  "frequency": "BID",
  "treatment_status": "active"
}
```

### Example 5: Cardiac Rehab
Document text: "Cardiac rehab phase 2: 36 sessions, 12 completed, improving exercise tolerance"

```json
{
  "source_text_verbatim": "Cardiac rehab phase 2: 36 sessions, 12 completed, improving exercise tolerance",
  "y_anchor_start": 776,
  "treatment_name_verbatim": "Cardiac rehab phase 2",
  "treatment_type": "cardiac_rehab",
  "target_condition": "post-MI",
  "total_sessions": 36,
  "sessions_completed": 12,
  "treatment_status": "active",
  "response_to_treatment": "improving exercise tolerance"
}
```

### Example 6: IV Infusion
Document text: "Remicade infusion q8weeks, last infusion 10/15/2024, next due 12/10/2024"

```json
{
  "source_text_verbatim": "Remicade infusion q8weeks, last infusion 10/15/2024, next due 12/10/2024",
  "y_anchor_start": 792,
  "treatment_name_verbatim": "Remicade infusion",
  "treatment_type": "infusion",
  "target_condition": "Crohn's disease",
  "frequency": "q8weeks",
  "treatment_status": "active"
}
```

---

## Treatment Type Reference

| Type | Examples |
|------|----------|
| `physical_therapy` | Strengthening, ROM, gait training |
| `occupational_therapy` | ADL training, fine motor skills |
| `speech_therapy` | Swallowing therapy, speech rehab |
| `radiation` | XRT, IMRT, brachytherapy |
| `chemotherapy` | IV chemo, oral chemo (as treatment course) |
| `dialysis` | Hemodialysis, peritoneal dialysis |
| `infusion` | IV medications, biologics |
| `wound_care` | Dressing changes, wound VAC |
| `respiratory_therapy` | Nebulizer treatments, chest PT |
| `phototherapy` | UV therapy, light therapy |
| `cardiac_rehab` | Exercise program post-cardiac event |
| `pulmonary_rehab` | Exercise program for lung disease |

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
CREATE TABLE patient_treatments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Treatment identification
    treatment_name_verbatim TEXT NOT NULL,
    treatment_type TEXT CHECK (treatment_type IN (
        'physical_therapy', 'occupational_therapy', 'speech_therapy',
        'radiation', 'chemotherapy', 'dialysis', 'infusion', 'wound_care',
        'respiratory_therapy', 'phototherapy', 'cardiac_rehab', 'pulmonary_rehab', 'other'
    )),

    -- Target
    target_condition TEXT,
    body_site TEXT,
    laterality TEXT CHECK (laterality IN ('left', 'right', 'bilateral')),

    -- Schedule
    frequency TEXT,
    duration_per_session TEXT,
    total_sessions INTEGER,
    sessions_completed INTEGER,

    -- Dates
    start_date DATE,
    end_date DATE,

    -- Provider/facility
    treating_provider TEXT,
    treating_facility TEXT,

    -- Status
    treatment_status TEXT CHECK (treatment_status IN (
        'active', 'completed', 'discontinued', 'on_hold'
    )),

    -- Response
    response_to_treatment TEXT,

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_treatments_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);
```

---

## Treatments vs Procedures vs Medications

| Treatments (this table) | Procedures | Medications |
|-------------------------|------------|-------------|
| Ongoing therapeutic courses | Single events | Drug administrations |
| Multiple sessions over time | One-time interventions | Dosing schedules |
| Non-surgical, non-drug | Surgical/diagnostic | Pharmacological |
| Examples: PT, dialysis, XRT | Examples: Surgery, biopsy | Examples: Metformin, Lisinopril |

---

## Notes

- **Session tracking:** Track both total_sessions and sessions_completed for progress monitoring
- **Frequency notation:** Preserve exact notation ("3x/week", "MWF", "q8weeks")
- **Response tracking:** Capture how patient is responding to treatment
- **Treatment vs Procedure:** Dialysis session = treatment; fistula creation = procedure
- **Infusions:** Some infusions are treatments (Remicade), others are medications - use context

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Procedures (contrast):** `patient_procedures.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
