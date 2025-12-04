# patient_travel_history Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Tier 1 priority table
**Step A Rationale:** Data about PLACES, not conditions. Critical for infectious disease differential (endemic areas). Unique fields: destination, dates, purpose, exposures.
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** POINT-IN-TIME - Travel is a documented fact at time of extraction
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Stores travel history relevant to medical care - destinations visited, potential exposures, and timing. Critical for infectious disease evaluation and public health tracking.

---

## Pass 2 AI Output Schema

```typescript
interface Pass2TravelHistoryOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim line from document

  // REQUIRED - Spatial reference
  y_anchor_start: number;
  y_anchor_end?: number;

  // REQUIRED - Destination
  destination: string;                  // Country or region visited

  // OPTIONAL - Destination detail
  destination_detail?: string;          // Specific area (rural, urban, specific region)

  // OPTIONAL - Dates
  travel_start_date?: string;           // ISO date when travel began
  travel_end_date?: string;             // ISO date when travel ended

  // OPTIONAL - Purpose
  travel_purpose?: 'vacation' | 'work' | 'immigration' | 'military' | 'residency' | 'family_visit' | 'other';

  // OPTIONAL - Exposures
  exposures?: string[];                 // Array of potential exposures

  // OPTIONAL - Notes
  notes_verbatim?: string;              // Additional context
}
```

---

## Example Extractions

### Example 1: Recent Travel
Document text: "Recent travel to Thailand (2 weeks ago)"

```json
{
  "source_text_verbatim": "Recent travel to Thailand (2 weeks ago)",
  "y_anchor_start": 412,
  "destination": "Thailand",
  "travel_purpose": "vacation",
  "notes_verbatim": "2 weeks ago"
}
```

### Example 2: Travel with Exposures
Document text: "Visited rural India, ate street food, swam in freshwater"

```json
{
  "source_text_verbatim": "Visited rural India, ate street food, swam in freshwater",
  "y_anchor_start": 428,
  "destination": "India",
  "destination_detail": "rural",
  "exposures": ["street food", "freshwater swimming"],
  "travel_purpose": "vacation"
}
```

### Example 3: Cruise Ship
Document text: "Caribbean cruise, GI symptoms on return"

```json
{
  "source_text_verbatim": "Caribbean cruise, GI symptoms on return",
  "y_anchor_start": 444,
  "destination": "Caribbean",
  "destination_detail": "cruise ship",
  "exposures": ["cruise ship"],
  "notes_verbatim": "GI symptoms on return"
}
```

### Example 4: Work Travel with Dates
Document text: "Business trip to Nigeria, June 1-15, 2024"

```json
{
  "source_text_verbatim": "Business trip to Nigeria, June 1-15, 2024",
  "y_anchor_start": 460,
  "destination": "Nigeria",
  "travel_start_date": "2024-06-01",
  "travel_end_date": "2024-06-15",
  "travel_purpose": "work"
}
```

### Example 5: Immigration/Residency
Document text: "Immigrated from Somalia in 2022"

```json
{
  "source_text_verbatim": "Immigrated from Somalia in 2022",
  "y_anchor_start": 476,
  "destination": "Somalia",
  "travel_purpose": "immigration",
  "notes_verbatim": "immigrated in 2022"
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
CREATE TABLE patient_travel_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Destination
    destination TEXT NOT NULL,
    destination_detail TEXT,

    -- Dates
    travel_start_date DATE,
    travel_end_date DATE,

    -- Purpose
    travel_purpose TEXT CHECK (travel_purpose IN (
        'vacation', 'work', 'immigration', 'military', 'residency', 'family_visit', 'other'
    )),

    -- Exposures
    exposures TEXT[],

    -- Notes
    notes_verbatim TEXT,

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_travel_history_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);
```

---

## Common Exposures Reference

| Exposure | Relevant Diseases |
|----------|-------------------|
| `freshwater swimming` | Schistosomiasis, leptospirosis |
| `raw/undercooked food` | Hepatitis A, typhoid, parasites |
| `street food` | Traveler's diarrhea, typhoid |
| `mosquito exposure` | Malaria, dengue, Zika, chikungunya |
| `animal contact` | Rabies, Q fever |
| `cave exploration` | Histoplasmosis, rabies |
| `sexual contact` | HIV, STIs |
| `healthcare exposure` | HIV, hepatitis B/C |
| `cruise ship` | Norovirus, respiratory infections |
| `refugee camp` | TB, measles, various |

---

## Notes

- **Destination format:** Use country name when possible; use region for multi-country areas (e.g., "Southeast Asia")
- **Date inference:** Only extract dates explicitly stated - don't calculate "2 weeks ago" to actual dates
- **Exposures array:** Capture all mentioned potential exposures as separate array elements
- **Immigration vs travel:** Immigration/residency indicates prolonged exposure; vacation indicates brief
- **Endemic disease relevance:** This data is critical for infectious disease differential diagnosis

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
