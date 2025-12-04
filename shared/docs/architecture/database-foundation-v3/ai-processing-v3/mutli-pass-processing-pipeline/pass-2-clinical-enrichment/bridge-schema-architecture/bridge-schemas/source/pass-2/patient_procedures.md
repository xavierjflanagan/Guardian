# patient_procedures Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Tier 1 priority table
**Step A Rationale:** High billing importance with unique fields (approach, anesthesia, complications, performing provider). Previously in patient_interventions.
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** POINT-IN-TIME - Procedure is a documented event at a specific time
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Stores medical and surgical procedures - surgeries, biopsies, catheterizations, endoscopies, and other procedural interventions. Separated from generic interventions due to unique fields and high billing/coding importance.

---

## Pass 2 AI Output Schema

```typescript
interface Pass2ProceduresOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim procedure description

  // REQUIRED - Spatial reference
  y_anchor_start: number;
  y_anchor_end?: number;

  // REQUIRED - Procedure identification
  procedure_name_verbatim: string;      // Exactly as stated
  procedure_name_normalized?: string;   // Standardized name (if obvious)

  // OPTIONAL - Classification
  procedure_type?: 'surgical' | 'diagnostic' | 'therapeutic' | 'biopsy';

  // OPTIONAL - Location
  body_site?: string;                   // Anatomical location
  laterality?: 'left' | 'right' | 'bilateral';

  // OPTIONAL - Technique
  approach?: string;                    // laparoscopic, open, percutaneous, endoscopic, etc.
  anesthesia_type?: 'general' | 'local' | 'sedation' | 'regional' | 'none';

  // OPTIONAL - Results
  findings?: string;                    // Operative/procedure findings
  complications?: string;               // If any stated
  outcome?: 'successful' | 'incomplete' | 'aborted' | 'converted';

  // OPTIONAL - Provider/facility
  performing_provider?: string;         // Surgeon/proceduralist name
  performing_facility?: string;         // Hospital/clinic name

  // OPTIONAL - Coding
  cpt_code?: string;                    // CPT code if printed in document

  // OPTIONAL - Date
  procedure_datetime?: string;          // ISO datetime when performed
}
```

---

## Example Extractions

### Example 1: Laparoscopic Surgery
Document text: "Laparoscopic cholecystectomy, uncomplicated"

```json
{
  "source_text_verbatim": "Laparoscopic cholecystectomy, uncomplicated",
  "y_anchor_start": 634,
  "procedure_name_verbatim": "Laparoscopic cholecystectomy",
  "procedure_type": "surgical",
  "body_site": "gallbladder",
  "approach": "laparoscopic",
  "outcome": "successful",
  "complications": null
}
```

### Example 2: Colonoscopy with Findings
Document text: "Colonoscopy with polypectomy x2, 2 sessile polyps removed from ascending colon"

```json
{
  "source_text_verbatim": "Colonoscopy with polypectomy x2, 2 sessile polyps removed from ascending colon",
  "y_anchor_start": 650,
  "procedure_name_verbatim": "Colonoscopy with polypectomy",
  "procedure_type": "diagnostic",
  "body_site": "ascending colon",
  "approach": "endoscopic",
  "findings": "2 sessile polyps removed"
}
```

### Example 3: Cardiac Catheterization
Document text: "Cardiac catheterization via right femoral approach, Dr. Smith, General Hospital"

```json
{
  "source_text_verbatim": "Cardiac catheterization via right femoral approach, Dr. Smith, General Hospital",
  "y_anchor_start": 666,
  "procedure_name_verbatim": "Cardiac catheterization",
  "procedure_type": "diagnostic",
  "body_site": "heart",
  "approach": "percutaneous",
  "laterality": "right",
  "performing_provider": "Dr. Smith",
  "performing_facility": "General Hospital"
}
```

### Example 4: Joint Replacement
Document text: "Left total knee arthroplasty under general anesthesia, 06/15/2024"

```json
{
  "source_text_verbatim": "Left total knee arthroplasty under general anesthesia, 06/15/2024",
  "y_anchor_start": 682,
  "procedure_name_verbatim": "Left total knee arthroplasty",
  "procedure_name_normalized": "Total knee replacement",
  "procedure_type": "surgical",
  "body_site": "knee",
  "laterality": "left",
  "anesthesia_type": "general",
  "procedure_datetime": "2024-06-15"
}
```

### Example 5: Biopsy
Document text: "CT-guided liver biopsy, 2cm lesion segment 7, specimen sent to pathology"

```json
{
  "source_text_verbatim": "CT-guided liver biopsy, 2cm lesion segment 7, specimen sent to pathology",
  "y_anchor_start": 698,
  "procedure_name_verbatim": "CT-guided liver biopsy",
  "procedure_type": "biopsy",
  "body_site": "liver segment 7",
  "approach": "percutaneous",
  "findings": "2cm lesion, specimen sent to pathology"
}
```

### Example 6: Converted Procedure
Document text: "Attempted laparoscopic appendectomy, converted to open due to adhesions"

```json
{
  "source_text_verbatim": "Attempted laparoscopic appendectomy, converted to open due to adhesions",
  "y_anchor_start": 714,
  "procedure_name_verbatim": "Laparoscopic appendectomy converted to open",
  "procedure_type": "surgical",
  "body_site": "appendix",
  "approach": "open",
  "outcome": "converted",
  "complications": "adhesions requiring conversion"
}
```

---

## Approach Reference

| Approach | Description |
|----------|-------------|
| `open` | Traditional surgical incision |
| `laparoscopic` | Minimally invasive, camera-guided |
| `robotic` | Robot-assisted surgery |
| `endoscopic` | Using endoscope (colonoscopy, EGD, bronchoscopy) |
| `percutaneous` | Through skin (needle, catheter) |
| `transcatheter` | Through blood vessel (TAVR, stent) |
| `arthroscopic` | Joint scope |

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
CREATE TABLE patient_procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Procedure identification
    procedure_name_verbatim TEXT NOT NULL,
    procedure_name_normalized TEXT,
    procedure_type TEXT CHECK (procedure_type IN ('surgical', 'diagnostic', 'therapeutic', 'biopsy')),

    -- Location
    body_site TEXT,
    laterality TEXT CHECK (laterality IN ('left', 'right', 'bilateral')),

    -- Technique
    approach TEXT,
    anesthesia_type TEXT CHECK (anesthesia_type IN ('general', 'local', 'sedation', 'regional', 'none')),

    -- Results
    findings TEXT,
    complications TEXT,
    outcome TEXT CHECK (outcome IN ('successful', 'incomplete', 'aborted', 'converted')),

    -- Provider/facility
    performing_provider TEXT,
    performing_facility TEXT,

    -- Coding
    cpt_code TEXT,

    -- Date
    procedure_datetime TIMESTAMPTZ,

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_procedures_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);
```

---

## Notes

- **Provider on spoke, not hub:** `performing_provider` and `performing_facility` belong here, NOT on the hub (lean hub principle)
- **Approach matters:** Laparoscopic vs open affects billing, recovery, complications
- **Converted procedures:** Use `outcome: "converted"` when procedure changed approach mid-operation
- **CPT codes:** Only extract if printed in document - don't infer
- **Date handling:** Extract procedure_datetime if stated - don't infer from encounter date

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
