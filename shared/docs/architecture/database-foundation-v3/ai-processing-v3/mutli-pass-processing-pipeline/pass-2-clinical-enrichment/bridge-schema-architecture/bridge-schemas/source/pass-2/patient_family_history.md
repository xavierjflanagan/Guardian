# patient_family_history Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Tier 1 priority table
**Step A Rationale:** Data about relatives (not patient). Unique fields: relationship, family_side, degree_of_relation, age at onset. Critical for risk assessment.
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** POINT-IN-TIME - Family history is documented fact at time of extraction
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Stores family medical history - information about the patient's relatives' health conditions. This is fundamentally different from other clinical tables because it contains data about OTHER PEOPLE, not the patient.

**Key Insight:** One row per relative-condition combination. If "Mother: breast cancer and diabetes", create two rows.

---

## Pass 2 AI Output Schema

The AI outputs **only clinical content**. Server adds IDs, context references, and timestamps.

```typescript
interface Pass2FamilyHistoryOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim line from document

  // REQUIRED - Spatial reference
  y_anchor_start: number;               // Y coordinate of first line
  y_anchor_end?: number;                // Y coordinate of last line (if multi-line)

  // REQUIRED - Relationship
  relationship: string;                 // mother, father, sibling, grandparent, aunt, uncle, cousin

  // OPTIONAL - Relationship detail
  relationship_detail?: string;         // "maternal grandmother", "half-brother", "paternal uncle"
  family_side?: 'maternal' | 'paternal' | 'both' | 'unknown';
  degree_of_relation?: 'first_degree' | 'second_degree' | 'other' | 'unknown';

  // REQUIRED - Condition
  condition_name_verbatim: string;      // Exactly as stated in document
  condition_name_normalized?: string;   // Standardized condition name (if obvious)

  // OPTIONAL - Clinical context
  relative_age_at_onset?: number;       // Age when condition appeared
  relative_current_status?: 'alive' | 'deceased' | 'unknown';
  relative_age_at_death?: number;       // If deceased

  // OPTIONAL - Notes
  notes?: string;                       // Additional context from document
}
```

---

## Example Extractions

### Example 1: Simple Family History
Document text: "Mother: breast cancer age 52"

```json
{
  "source_text_verbatim": "Mother: breast cancer age 52",
  "y_anchor_start": 312,
  "relationship": "mother",
  "family_side": "maternal",
  "degree_of_relation": "first_degree",
  "condition_name_verbatim": "breast cancer",
  "relative_age_at_onset": 52
}
```

### Example 2: Deceased Relative
Document text: "Father: MI age 55, deceased age 60"

```json
{
  "source_text_verbatim": "Father: MI age 55, deceased age 60",
  "y_anchor_start": 328,
  "relationship": "father",
  "family_side": "paternal",
  "degree_of_relation": "first_degree",
  "condition_name_verbatim": "MI",
  "condition_name_normalized": "myocardial infarction",
  "relative_age_at_onset": 55,
  "relative_current_status": "deceased",
  "relative_age_at_death": 60
}
```

### Example 3: Extended Family with Detail
Document text: "Maternal grandmother: dementia in her 70s"

```json
{
  "source_text_verbatim": "Maternal grandmother: dementia in her 70s",
  "y_anchor_start": 344,
  "relationship": "grandparent",
  "relationship_detail": "maternal grandmother",
  "family_side": "maternal",
  "degree_of_relation": "second_degree",
  "condition_name_verbatim": "dementia",
  "notes": "onset in her 70s"
}
```

### Example 4: Multiple Conditions Same Relative
Document text: "Mother: diabetes and hypertension"

Creates TWO rows:
```json
[
  {
    "source_text_verbatim": "Mother: diabetes",
    "y_anchor_start": 360,
    "relationship": "mother",
    "family_side": "maternal",
    "degree_of_relation": "first_degree",
    "condition_name_verbatim": "diabetes"
  },
  {
    "source_text_verbatim": "Mother: hypertension",
    "y_anchor_start": 360,
    "relationship": "mother",
    "family_side": "maternal",
    "degree_of_relation": "first_degree",
    "condition_name_verbatim": "hypertension"
  }
]
```

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

## Relationship Enum Reference

| Value | Description | Example |
|-------|-------------|---------|
| `mother` | Biological mother | First degree, maternal |
| `father` | Biological father | First degree, paternal |
| `sibling` | Brother or sister | First degree |
| `grandparent` | Grandmother or grandfather | Second degree |
| `aunt` | Aunt | Second degree |
| `uncle` | Uncle | Second degree |
| `cousin` | First cousin | Second degree or other |
| `child` | Son or daughter | First degree |
| `half_sibling` | Half-brother or half-sister | First degree |
| `other` | Other relationship | Use relationship_detail |

---

## Degree of Relation Reference

| Value | Includes | Clinical Significance |
|-------|----------|----------------------|
| `first_degree` | Parents, siblings, children | Highest genetic risk |
| `second_degree` | Grandparents, aunts, uncles, half-siblings, nieces, nephews | Moderate genetic risk |
| `other` | Cousins, great-grandparents, etc. | Lower genetic risk |
| `unknown` | Relationship not clear | Flag for review |

---

## Database Schema (Target)

```sql
CREATE TABLE patient_family_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Relationship
    relationship TEXT NOT NULL,
    relationship_detail TEXT,
    family_side TEXT CHECK (family_side IN ('maternal', 'paternal', 'both', 'unknown')),
    degree_of_relation TEXT CHECK (degree_of_relation IN ('first_degree', 'second_degree', 'other', 'unknown')),

    -- Condition
    condition_name_verbatim TEXT NOT NULL,
    condition_name_normalized TEXT,

    -- Clinical context
    relative_age_at_onset INTEGER,
    relative_current_status TEXT CHECK (relative_current_status IN ('alive', 'deceased', 'unknown')),
    relative_age_at_death INTEGER,

    -- Notes
    notes TEXT,

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_family_history_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);
```

---

## Notes

- **One row per condition:** If a relative has multiple conditions, create multiple rows
- **family_side derivation:** AI should infer from relationship (mother = maternal, father = paternal) unless explicitly stated otherwise
- **degree_of_relation:** AI should classify based on relationship type
- **Age handling:** Extract exact numbers only - don't infer from vague descriptions like "elderly"
- **No normalization required:** condition_name_normalized is optional - AI can provide if obvious mapping exists

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
