# patient_symptoms Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Tier 1 priority table
**Step A Rationale:** EXPRESSED observations (patient-reported), not clinically detected. Blob approach preserves patient voice with minimal normalization.
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** POINT-IN-TIME - Symptom is documented fact at time of extraction
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Stores patient-reported symptoms - what the patient SAYS, not what the clinician FINDS. Uses a blob approach to preserve the patient's exact language with minimal normalization.

**Key Insight:** Symptoms represent subjective patient reports. Physical findings (what clinician detects) go to `patient_physical_findings`. The distinction is WHO reports it.

---

## Pass 2 AI Output Schema

```typescript
interface Pass2SymptomsOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim symptom description

  // REQUIRED - Spatial reference
  y_anchor_start: number;
  y_anchor_end?: number;

  // REQUIRED - Primary symptom blob
  symptom_description_verbatim: string; // Exactly as stated - the primary blob

  // OPTIONAL - Categorization (minimal normalization)
  symptom_category?: 'pain' | 'fatigue' | 'respiratory' | 'gastrointestinal' |
                     'neurological' | 'cardiovascular' | 'musculoskeletal' |
                     'dermatological' | 'psychiatric' | 'constitutional' | 'other';

  // OPTIONAL - As-stated qualifiers (preserve patient language)
  reported_severity?: string;           // "severe", "mild", "10/10" - as stated
  onset_description?: string;           // "3 weeks ago", "sudden", "gradual" - as stated
  duration_description?: string;        // "constant", "comes and goes", "2 hours" - as stated
  associated_factors?: string;          // "worse with eating", "better with rest" - as stated
  body_location_verbatim?: string;      // "behind my eyes", "left side of chest" - as stated

  // OPTIONAL - Chief complaint flag
  is_chief_complaint?: boolean;         // Primary reason for visit
}
```

---

## Example Extractions

### Example 1: Chief Complaint
Document text: "CC: Chest pain, sharp, worse with breathing x 2 days"

```json
{
  "source_text_verbatim": "CC: Chest pain, sharp, worse with breathing x 2 days",
  "y_anchor_start": 145,
  "symptom_description_verbatim": "Chest pain, sharp, worse with breathing x 2 days",
  "symptom_category": "cardiovascular",
  "body_location_verbatim": "chest",
  "reported_severity": "sharp",
  "duration_description": "x 2 days",
  "associated_factors": "worse with breathing",
  "is_chief_complaint": true
}
```

### Example 2: Fatigue
Document text: "Feeling tired all the time for 3 weeks, can't get through the day"

```json
{
  "source_text_verbatim": "Feeling tired all the time for 3 weeks, can't get through the day",
  "y_anchor_start": 189,
  "symptom_description_verbatim": "Feeling tired all the time for 3 weeks, can't get through the day",
  "symptom_category": "fatigue",
  "onset_description": "for 3 weeks",
  "duration_description": "constant"
}
```

### Example 3: Headache with Location
Document text: "Headache behind my eyes, throbbing, started yesterday morning"

```json
{
  "source_text_verbatim": "Headache behind my eyes, throbbing, started yesterday morning",
  "y_anchor_start": 205,
  "symptom_description_verbatim": "Headache behind my eyes, throbbing, started yesterday morning",
  "symptom_category": "neurological",
  "body_location_verbatim": "behind my eyes",
  "reported_severity": "throbbing",
  "onset_description": "started yesterday morning"
}
```

### Example 4: GI Symptoms
Document text: "Nausea and vomiting after meals, unable to keep food down"

```json
{
  "source_text_verbatim": "Nausea and vomiting after meals, unable to keep food down",
  "y_anchor_start": 221,
  "symptom_description_verbatim": "Nausea and vomiting after meals, unable to keep food down",
  "symptom_category": "gastrointestinal",
  "associated_factors": "after meals"
}
```

### Example 5: Pain Scale
Document text: "Back pain 8/10, radiating to left leg"

```json
{
  "source_text_verbatim": "Back pain 8/10, radiating to left leg",
  "y_anchor_start": 237,
  "symptom_description_verbatim": "Back pain 8/10, radiating to left leg",
  "symptom_category": "pain",
  "body_location_verbatim": "back, radiating to left leg",
  "reported_severity": "8/10"
}
```

---

## Symptom Category Reference

| Category | Examples |
|----------|----------|
| `pain` | Headache, chest pain, abdominal pain, back pain |
| `fatigue` | Tiredness, weakness, exhaustion, malaise |
| `respiratory` | Cough, shortness of breath, wheezing |
| `gastrointestinal` | Nausea, vomiting, diarrhea, constipation |
| `neurological` | Dizziness, numbness, tingling, seizure |
| `cardiovascular` | Palpitations, chest tightness, swelling |
| `musculoskeletal` | Joint pain, muscle aches, stiffness |
| `dermatological` | Rash, itching, skin changes |
| `psychiatric` | Anxiety, depression, insomnia |
| `constitutional` | Fever, chills, night sweats, weight loss |
| `other` | Doesn't fit above categories |

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
CREATE TABLE patient_symptoms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Primary blob
    symptom_description_verbatim TEXT NOT NULL,

    -- Minimal categorization
    symptom_category TEXT CHECK (symptom_category IN (
        'pain', 'fatigue', 'respiratory', 'gastrointestinal', 'neurological',
        'cardiovascular', 'musculoskeletal', 'dermatological', 'psychiatric',
        'constitutional', 'other'
    )),

    -- As-stated qualifiers
    reported_severity TEXT,
    onset_description TEXT,
    duration_description TEXT,
    associated_factors TEXT,
    body_location_verbatim TEXT,

    -- Chief complaint flag
    is_chief_complaint BOOLEAN DEFAULT FALSE,

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_symptoms_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);
```

---

## Pass 3 Integration

Pass 3 creates narrative links between symptoms and conditions:

```
Pass 2 extracts:
  - Symptom: "chest pain, worse with exertion"  -> patient_symptoms

Pass 3 creates:
  - Narrative: "Cardiac Workup"
  - Link: symptom -> narrative (relationship_type: "triggered_by")
  - Link: condition (CAD) -> narrative (relationship_type: "diagnosis")
```

The symptom record itself does NOT reference the condition. The connection is made through `narrative_event_links`.

---

## Notes

- **Blob approach:** `symptom_description_verbatim` is the primary field - preserve exact patient language
- **No normalization required:** Keep severity, onset, duration as free text - don't try to parse
- **Chief complaint flag:** Mark as `is_chief_complaint: true` if explicitly stated as CC or reason for visit
- **Symptom vs Finding:** Patient says "I have chest pain" = symptom. Doctor hears "crackles" = physical finding
- **Multiple symptoms:** If document lists multiple symptoms, create separate rows for each

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Pass 3 Integration:** `08-PASS3-NARRATIVE-INTEGRATION.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
