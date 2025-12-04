# patient_social_history Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Tier 1 priority table
**Step A Rationale:** Unique data fields per category (tobacco, alcohol, substances, occupation). Single table with type enum + JSONB for type-specific fields.
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** TEMPORAL - Social history changes over time (smoker -> former smoker)
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Stores social and behavioral history that affects health - smoking, alcohol, substance use, occupation, living situation, etc. Uses a single table with `social_history_type` enum and JSONB for type-specific structured data.

---

## Pass 2 AI Output Schema

```typescript
interface Pass2SocialHistoryOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim line from document

  // REQUIRED - Spatial reference
  y_anchor_start: number;
  y_anchor_end?: number;

  // REQUIRED - Classification
  social_history_type: 'tobacco_use' | 'alcohol_use' | 'substance_use' | 'occupation' |
                       'living_situation' | 'exercise' | 'diet' | 'sleep' |
                       'sexual_history' | 'other';

  // REQUIRED - Status
  status: 'current' | 'former' | 'never' | 'unknown';

  // REQUIRED - Description
  description_verbatim: string;         // Exactly as stated
  description_normalized?: string;      // Standardized if applicable

  // OPTIONAL - Quantification
  quantity?: string;                    // "1 pack/day", "2-3 drinks/week"
  duration?: string;                    // "20 years", "since 2010"
  quit_date?: string;                   // ISO date if applicable

  // OPTIONAL - Type-specific structured data
  type_specific_data?: object;          // JSONB - structure depends on social_history_type
}
```

---

## Type-Specific Data Patterns

### tobacco_use
```json
{
  "product_type": "cigarettes",
  "pack_years": 20,
  "packs_per_day": 1,
  "start_year": 2000,
  "quit_year": 2020
}
```

### alcohol_use
```json
{
  "beverage_type": "beer",
  "drinks_per_week": 3,
  "pattern": "social",
  "binge_frequency": "rarely"
}
```

### substance_use
```json
{
  "substance_name": "marijuana",
  "route": "smoked",
  "frequency": "weekly",
  "last_use_date": "2024-03-10"
}
```

### occupation
```json
{
  "job_title": "construction worker",
  "industry": "construction",
  "exposures": ["asbestos", "silica"],
  "years_in_role": 10,
  "retired": false
}
```

### living_situation
```json
{
  "housing_type": "house",
  "lives_alone": true,
  "marital_status": "single",
  "dependents": 0,
  "caregiver_available": false
}
```

---

## Example Extractions

### Example 1: Tobacco Use (Current)
Document text: "Smoking: 1 pack/day x 20 years"

```json
{
  "source_text_verbatim": "Smoking: 1 pack/day x 20 years",
  "y_anchor_start": 245,
  "social_history_type": "tobacco_use",
  "status": "current",
  "description_verbatim": "1 pack/day x 20 years",
  "quantity": "1 pack/day",
  "duration": "20 years",
  "type_specific_data": {
    "product_type": "cigarettes",
    "pack_years": 20,
    "packs_per_day": 1
  }
}
```

### Example 2: Tobacco Use (Former)
Document text: "Former smoker, quit 2015 after 30 pack-years"

```json
{
  "source_text_verbatim": "Former smoker, quit 2015 after 30 pack-years",
  "y_anchor_start": 261,
  "social_history_type": "tobacco_use",
  "status": "former",
  "description_verbatim": "quit 2015 after 30 pack-years",
  "quit_date": "2015-01-01",
  "type_specific_data": {
    "product_type": "cigarettes",
    "pack_years": 30,
    "quit_year": 2015
  }
}
```

### Example 3: Alcohol Use
Document text: "Alcohol: 2-3 beers/week, social drinker"

```json
{
  "source_text_verbatim": "Alcohol: 2-3 beers/week, social drinker",
  "y_anchor_start": 277,
  "social_history_type": "alcohol_use",
  "status": "current",
  "description_verbatim": "2-3 beers/week, social drinker",
  "quantity": "2-3 beers/week",
  "type_specific_data": {
    "beverage_type": "beer",
    "drinks_per_week": 3,
    "pattern": "social"
  }
}
```

### Example 4: Occupation with Exposure
Document text: "Occupation: construction worker (asbestos exposure)"

```json
{
  "source_text_verbatim": "Occupation: construction worker (asbestos exposure)",
  "y_anchor_start": 293,
  "social_history_type": "occupation",
  "status": "current",
  "description_verbatim": "construction worker (asbestos exposure)",
  "type_specific_data": {
    "job_title": "construction worker",
    "industry": "construction",
    "exposures": ["asbestos"]
  }
}
```

### Example 5: Living Situation
Document text: "Lives alone, single, no family support nearby"

```json
{
  "source_text_verbatim": "Lives alone, single, no family support nearby",
  "y_anchor_start": 309,
  "social_history_type": "living_situation",
  "status": "current",
  "description_verbatim": "Lives alone, single, no family support nearby",
  "type_specific_data": {
    "lives_alone": true,
    "marital_status": "single",
    "caregiver_available": false
  }
}
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

## Database Schema (Target)

```sql
CREATE TABLE patient_social_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Classification
    social_history_type TEXT NOT NULL CHECK (social_history_type IN (
        'tobacco_use', 'alcohol_use', 'substance_use', 'occupation',
        'living_situation', 'exercise', 'diet', 'sleep', 'sexual_history', 'other'
    )),
    status TEXT NOT NULL CHECK (status IN ('current', 'former', 'never', 'unknown')),

    -- Description
    description_verbatim TEXT NOT NULL,
    description_normalized TEXT,

    -- Quantification
    quantity TEXT,
    duration TEXT,
    quit_date DATE,

    -- Type-specific data
    type_specific_data JSONB,

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_social_history_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);
```

---

## Notes

- **Temporal tracking:** Social history is one of the few tables that may need `valid_from`/`valid_to` for state changes (current smoker -> former smoker)
- **type_specific_data flexibility:** JSONB allows storing category-specific structured data without schema explosion
- **Pack-years calculation:** AI should extract pack-years if stated, but NOT calculate from packs/day x years
- **Quit dates:** Extract exact date if stated, year only if that's all available (use YYYY-01-01)
- **Occupation exposures:** Array field to capture multiple occupational hazards

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
