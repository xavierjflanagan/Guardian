# patient_imaging_results Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Tier 2 priority table
**Step A Rationale:** Unique fields (modality, body region, impression, technique). Distinct from lab results - no reference ranges, different structure.
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** POINT-IN-TIME - Imaging study is a snapshot at time performed
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Stores imaging study results - X-rays, CT scans, MRIs, ultrasounds, and other radiological studies. Distinct from lab results due to unique fields like modality, impression, and comparison to prior studies.

---

## Pass 2 AI Output Schema

```typescript
interface Pass2ImagingResultsOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim imaging description

  // REQUIRED - Spatial reference
  y_anchor_start: number;
  y_anchor_end?: number;

  // REQUIRED - Study identification
  imaging_modality: 'xray' | 'ct' | 'mri' | 'ultrasound' | 'pet' | 'mammogram' |
                    'dexa' | 'fluoroscopy' | 'nuclear' | 'angiography' | 'other';
  body_region: string;                  // Chest, abdomen, brain, spine, etc.

  // OPTIONAL - Study details
  study_name_verbatim?: string;         // Exactly as stated
  technique?: string;                   // With/without contrast, views, etc.

  // OPTIONAL - Results
  findings_verbatim?: string;           // Full findings text
  impression?: string;                  // Radiologist impression/conclusion

  // OPTIONAL - Comparison
  comparison?: string;                  // Prior studies compared

  // OPTIONAL - Provider/facility
  performing_radiologist?: string;      // If stated
  performing_facility?: string;         // Imaging center name

  // OPTIONAL - Date
  study_datetime?: string;              // ISO datetime when performed
}
```

---

## Example Extractions

### Example 1: Chest X-ray
Document text: "CXR: No acute cardiopulmonary process. Heart size normal."

```json
{
  "source_text_verbatim": "CXR: No acute cardiopulmonary process. Heart size normal.",
  "y_anchor_start": 756,
  "imaging_modality": "xray",
  "body_region": "chest",
  "study_name_verbatim": "CXR",
  "findings_verbatim": "No acute cardiopulmonary process. Heart size normal.",
  "impression": "No acute cardiopulmonary process"
}
```

### Example 2: CT with Finding
Document text: "CT Abdomen/Pelvis with contrast: 3cm hepatic lesion segment 6, recommend MRI for characterization"

```json
{
  "source_text_verbatim": "CT Abdomen/Pelvis with contrast: 3cm hepatic lesion segment 6, recommend MRI for characterization",
  "y_anchor_start": 772,
  "imaging_modality": "ct",
  "body_region": "abdomen/pelvis",
  "study_name_verbatim": "CT Abdomen/Pelvis",
  "technique": "with contrast",
  "findings_verbatim": "3cm hepatic lesion segment 6",
  "impression": "3cm hepatic lesion, recommend MRI for characterization"
}
```

### Example 3: MRI Brain
Document text: "MRI Brain without contrast: No acute intracranial abnormality. Stable chronic microvascular ischemic changes."

```json
{
  "source_text_verbatim": "MRI Brain without contrast: No acute intracranial abnormality. Stable chronic microvascular ischemic changes.",
  "y_anchor_start": 788,
  "imaging_modality": "mri",
  "body_region": "brain",
  "study_name_verbatim": "MRI Brain",
  "technique": "without contrast",
  "findings_verbatim": "No acute intracranial abnormality. Stable chronic microvascular ischemic changes.",
  "impression": "No acute intracranial abnormality"
}
```

### Example 4: Ultrasound with Comparison
Document text: "Renal US: Unchanged bilateral renal cysts compared to 2023. No hydronephrosis."

```json
{
  "source_text_verbatim": "Renal US: Unchanged bilateral renal cysts compared to 2023. No hydronephrosis.",
  "y_anchor_start": 804,
  "imaging_modality": "ultrasound",
  "body_region": "kidneys",
  "study_name_verbatim": "Renal US",
  "findings_verbatim": "Unchanged bilateral renal cysts. No hydronephrosis.",
  "comparison": "compared to 2023",
  "impression": "Unchanged bilateral renal cysts"
}
```

---

## Imaging Modality Reference

| Modality | Description | Common Studies |
|----------|-------------|----------------|
| `xray` | Plain radiograph | CXR, KUB, extremity films |
| `ct` | Computed tomography | CT head, CT chest, CT abdomen |
| `mri` | Magnetic resonance imaging | MRI brain, MRI spine, MRI knee |
| `ultrasound` | Sonography | Abdominal US, renal US, echo |
| `pet` | Positron emission tomography | PET/CT for oncology |
| `mammogram` | Breast imaging | Screening/diagnostic mammogram |
| `dexa` | Bone density scan | DEXA for osteoporosis |
| `fluoroscopy` | Real-time X-ray | Barium swallow, VCUG |
| `nuclear` | Nuclear medicine | Bone scan, thyroid uptake |
| `angiography` | Vascular imaging | Coronary angio, peripheral angio |

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
CREATE TABLE patient_imaging_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Study identification
    imaging_modality TEXT NOT NULL CHECK (imaging_modality IN (
        'xray', 'ct', 'mri', 'ultrasound', 'pet', 'mammogram',
        'dexa', 'fluoroscopy', 'nuclear', 'angiography', 'other'
    )),
    body_region TEXT NOT NULL,
    study_name_verbatim TEXT,

    -- Technique
    technique TEXT,

    -- Results
    findings_verbatim TEXT,
    impression TEXT,

    -- Comparison
    comparison TEXT,

    -- Provider/facility
    performing_radiologist TEXT,
    performing_facility TEXT,

    -- Date
    study_datetime TIMESTAMPTZ,

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_imaging_results_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);
```

---

## Notes

- **Impression is key:** The radiologist's impression/conclusion is the clinically actionable summary
- **Findings vs Impression:** Findings are detailed observations; impression is the conclusion
- **Comparison studies:** Capture prior study references for tracking changes over time
- **Technique matters:** "with contrast" vs "without contrast" is clinically significant
- **Multi-line entries:** Radiology reports can span many lines - use y_anchor_end

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
