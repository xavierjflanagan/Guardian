# patient_physical_findings Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Tier 2 priority table
**Step A Rationale:** Physical exam findings with unique gradation systems. Distinct from vitals (numeric) and symptoms (patient-reported).
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** POINT-IN-TIME - Physical finding is documented at time of exam
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Stores physical examination findings - what the CLINICIAN detects, not what the patient reports. Distinct from vitals (numeric measurements) and symptoms (patient-reported). Includes gradation systems like +1/+4 edema or grade 3/6 murmur.

**Key Insight:** Physical findings are objective observations by healthcare providers. Symptoms (patient_symptoms) are subjective reports from patients.

---

## Pass 2 AI Output Schema

```typescript
interface Pass2PhysicalFindingsOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim finding description

  // REQUIRED - Spatial reference
  y_anchor_start: number;
  y_anchor_end?: number;

  // REQUIRED - Finding
  finding_verbatim: string;             // Exactly as stated

  // OPTIONAL - Categorization
  system?: 'cardiovascular' | 'respiratory' | 'gastrointestinal' | 'neurological' |
           'musculoskeletal' | 'dermatological' | 'heent' | 'genitourinary' |
           'psychiatric' | 'general' | 'other';

  // OPTIONAL - Location
  body_site?: string;                   // Specific anatomical location
  laterality?: 'left' | 'right' | 'bilateral';

  // OPTIONAL - Gradation
  finding_normalized?: string;          // Standardized finding name
  severity_grade?: string;              // +1, +2, grade 3/6, etc.
  is_normal?: boolean;                  // Normal finding vs abnormal
}
```

---

## Example Extractions

### Example 1: Cardiac Murmur
Document text: "Heart: Grade 3/6 systolic murmur, left sternal border"

```json
{
  "source_text_verbatim": "Heart: Grade 3/6 systolic murmur, left sternal border",
  "y_anchor_start": 845,
  "system": "cardiovascular",
  "body_site": "left sternal border",
  "finding_verbatim": "Grade 3/6 systolic murmur",
  "finding_normalized": "systolic murmur",
  "severity_grade": "3/6",
  "is_normal": false
}
```

### Example 2: Lung Findings
Document text: "Lungs: Crackles bilateral bases, decreased breath sounds right lower lobe"

```json
[
  {
    "source_text_verbatim": "Crackles bilateral bases",
    "y_anchor_start": 861,
    "system": "respiratory",
    "body_site": "lung bases",
    "laterality": "bilateral",
    "finding_verbatim": "Crackles bilateral bases",
    "finding_normalized": "crackles",
    "is_normal": false
  },
  {
    "source_text_verbatim": "decreased breath sounds right lower lobe",
    "y_anchor_start": 861,
    "system": "respiratory",
    "body_site": "right lower lobe",
    "laterality": "right",
    "finding_verbatim": "decreased breath sounds",
    "is_normal": false
  }
]
```

### Example 3: Edema with Grade
Document text: "Extremities: 2+ pitting edema bilateral lower"

```json
{
  "source_text_verbatim": "Extremities: 2+ pitting edema bilateral lower",
  "y_anchor_start": 877,
  "system": "cardiovascular",
  "body_site": "lower extremities",
  "laterality": "bilateral",
  "finding_verbatim": "2+ pitting edema",
  "finding_normalized": "pitting edema",
  "severity_grade": "2+",
  "is_normal": false
}
```

### Example 4: Normal Finding
Document text: "Abdomen: Soft, non-tender, no masses"

```json
{
  "source_text_verbatim": "Abdomen: Soft, non-tender, no masses",
  "y_anchor_start": 893,
  "system": "gastrointestinal",
  "body_site": "abdomen",
  "finding_verbatim": "Soft, non-tender, no masses",
  "is_normal": true
}
```

### Example 5: Neurological Exam
Document text: "Neuro: 4/5 strength left grip, decreased sensation left arm"

```json
[
  {
    "source_text_verbatim": "4/5 strength left grip",
    "y_anchor_start": 909,
    "system": "neurological",
    "body_site": "left hand",
    "laterality": "left",
    "finding_verbatim": "4/5 strength left grip",
    "finding_normalized": "decreased grip strength",
    "severity_grade": "4/5",
    "is_normal": false
  },
  {
    "source_text_verbatim": "decreased sensation left arm",
    "y_anchor_start": 909,
    "system": "neurological",
    "body_site": "left arm",
    "laterality": "left",
    "finding_verbatim": "decreased sensation",
    "is_normal": false
  }
]
```

---

## Body System Reference

| System | Examples |
|--------|----------|
| `cardiovascular` | Heart sounds, murmurs, edema, JVD, pulses |
| `respiratory` | Breath sounds, crackles, wheezes, chest expansion |
| `gastrointestinal` | Bowel sounds, tenderness, masses, hepatomegaly |
| `neurological` | Strength, sensation, reflexes, cranial nerves |
| `musculoskeletal` | ROM, swelling, deformity, tenderness |
| `dermatological` | Rashes, lesions, wounds, turgor |
| `heent` | Eyes, ears, nose, throat, lymph nodes |
| `genitourinary` | Costovertebral angle tenderness, prostate |
| `psychiatric` | Affect, orientation, mood |
| `general` | General appearance, distress level |

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
CREATE TABLE patient_physical_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Finding
    finding_verbatim TEXT NOT NULL,
    finding_normalized TEXT,

    -- Categorization
    system TEXT CHECK (system IN (
        'cardiovascular', 'respiratory', 'gastrointestinal', 'neurological',
        'musculoskeletal', 'dermatological', 'heent', 'genitourinary',
        'psychiatric', 'general', 'other'
    )),

    -- Location
    body_site TEXT,
    laterality TEXT CHECK (laterality IN ('left', 'right', 'bilateral')),

    -- Gradation
    severity_grade TEXT,
    is_normal BOOLEAN,

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_physical_findings_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);
```

---

## Common Gradation Systems

| Finding Type | Scale | Examples |
|--------------|-------|----------|
| Murmurs | 1-6 | "Grade 2/6", "Grade 4/6" |
| Edema | 0-4+ | "1+", "2+", "3+" |
| Reflexes | 0-4+ | "2+", "3+", "absent" |
| Strength | 0-5 | "4/5", "5/5", "0/5" |
| Pulses | 0-4+ | "2+", "diminished", "absent" |

---

## Notes

- **Finding vs Symptom:** Clinician detects = physical finding. Patient reports = symptom.
- **is_normal flag:** TRUE for documented normal findings (important for medicolegal purposes)
- **Severity grades:** Preserve exact notation (+1, 1+, grade 2/6 - don't normalize)
- **Multiple findings per line:** Physical exams often have multiple findings per body system line - create separate rows
- **System-specific organization:** Physical exams are typically organized by body system

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Patient Symptoms (contrast):** `patient_symptoms.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
