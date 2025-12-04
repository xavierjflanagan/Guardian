# patient_vitals Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** KEEP - Primary clinical spoke table for vital signs
**Step A Rationale:** Core spoke table in hub-and-spoke architecture. Pass 2 discovers and extracts vital signs from documents.
**Step B Sync:** Verified against 03_clinical_core.sql lines 809-846 - MATCHED (with proposed schema changes below)
**Step C Columns:** Complete - See "Pass 2 AI Output Schema" section below
**Step D Temporal:** POINT-IN-TIME - Each vital measurement is a document extraction snapshot
**Last Triage Update:** 2025-12-04
**Original Created:** 30 September 2025 (Migration 08 alignment)

**Database Source:** /current_schema/03_clinical_core.sql (lines 809-846)
**Priority:** CRITICAL - Vital signs measurements with JSONB flexible value storage

---

## Triage Summary

### What Pass 2 AI Outputs (Token-Optimized)

The AI outputs **only clinical content**. Server adds IDs, context references, and timestamps.

```typescript
interface Pass2VitalsOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim line from document (e.g., "BP 120/80")

  // REQUIRED - Spatial reference (zone approach)
  y_anchor_start: number;               // Y coordinate of first line - required
  y_anchor_end?: number;                // Y coordinate of last line - optional, only for multi-line entries

  // REQUIRED - Vital classification (8 values - no 'other', no 'blood_glucose')
  vital_type: 'blood_pressure' | 'heart_rate' | 'temperature' | 'respiratory_rate' |
              'oxygen_saturation' | 'weight' | 'height' | 'bmi';

  // REQUIRED - Measurement
  measurement_value: object;            // JSONB - structure depends on vital_type (see patterns below)

  // CONDITIONAL - Unit (only output if ambiguous - see Unit Handling section)
  unit?: string;                        // Only for temp (C/F), weight (kg/lbs), height (cm/m/ft/in)

  // OPTIONAL - Measurement date (only if explicitly stated next to the vital)
  measurement_date?: string;            // ISO date - ONLY if document explicitly states date for this vital

  // OPTIONAL - Context (only if stated in document)
  measurement_site?: string;            // WHERE on body: "oral", "left arm", "arterial line", "rectal", etc.
  body_position?: 'sitting' | 'standing' | 'lying' | 'supine';  // Patient position during measurement
  measurement_method?: 'manual' | 'automated' | 'self_reported';
  measured_by?: string;                 // Provider name or "patient" or device name

  // OPTIONAL - Abnormality flag (only if document explicitly indicates)
  is_abnormal?: boolean;                // TRUE only if document explicitly states abnormal/elevated/low

  // OPTIONAL - Additional notes
  notes?: string;                       // Any other relevant clinical notes from document
}
```

### Measurement Value JSONB Patterns

**Blood Pressure** (paired values):
```json
{"systolic": 120, "diastolic": 80}
```

**Single Value Vitals** (all others):
```json
{"value": 72}
```

| Vital Type | measurement_value Pattern | Default Unit | AI Outputs Unit? |
|------------|---------------------------|--------------|------------------|
| `blood_pressure` | `{"systolic": X, "diastolic": Y}` | mmHg | NO - server adds |
| `heart_rate` | `{"value": X}` | bpm | NO - server adds |
| `respiratory_rate` | `{"value": X}` | breaths/min | NO - server adds |
| `oxygen_saturation` | `{"value": X}` | % | NO - server adds |
| `bmi` | `{"value": X}` | kg/m2 | NO - server adds |
| `temperature` | `{"value": X}` | - | YES - ambiguous (C or F) |
| `weight` | `{"value": X}` | - | YES - ambiguous (kg, lbs, g) |
| `height` | `{"value": X}` | - | YES - ambiguous (cm, m, ft, in) |

---

### Unit Handling (Token Optimization)

**Principle:** AI should NOT waste tokens outputting units that are universally assumed.

**Universally Assumed Units (AI does NOT output - server adds post-AI):**
| Vital Type | Default Unit | Rationale |
|------------|--------------|-----------|
| blood_pressure | mmHg | Only unit ever used clinically |
| heart_rate | bpm | Always beats per minute |
| respiratory_rate | breaths/min | Always breaths per minute |
| oxygen_saturation | % | Always percentage |
| bmi | kg/m2 | Standard definition |

**Ambiguous Units (AI MUST output if stated, NULL if not stated):**
| Vital Type | Possible Units | Rule |
|------------|----------------|------|
| temperature | C, F | MUST extract - huge clinical difference (37C vs 37F) |
| weight | kg, lbs, g | MUST extract - significant difference |
| height | cm, m, ft, in | MUST extract - significant difference |

**Post-AI Server Logic:**
1. If AI provided unit, use it verbatim
2. If AI did not provide unit AND vital_type has default unit, insert default
3. If AI did not provide unit AND vital_type is ambiguous, leave NULL (requires review)

### Bounding Box Derivation (Post-Pass 2)

Pass 2 outputs `y_anchor_start` (required) and optionally `y_anchor_end` for multi-line entries. The precise 4-vertex bounding box for the verbatim text is derived post-Pass 2 by a server-side algorithm that:
1. Takes `source_text_verbatim` + `y_anchor_start` (and `y_anchor_end` if present)
2. Searches within that Y-zone in enhanced-xy-OCR data
3. Finds the matching verbatim text span
4. Extracts the 4 vertices (top-left, top-right, bottom-left, bottom-right) from word-level OCR data
5. Stores result in `verbatim_text_vertices` column

**Note:** Most vitals are single-line, so only `y_anchor_start` is needed. Use `y_anchor_end` for rare multi-line vital entries.

**Why pre-compute vertices:**
- Fast frontend rendering (no runtime OCR lookup)
- Auditable/testable (stored data can be validated)
- Works offline (no dependency on OCR data at display time)

This approach was proven in Pass 0.5 and Pass 1 for word height derivation.

### What Server Adds (Context Injection)

| Field | Source | Notes |
|-------|--------|-------|
| `id` | gen_random_uuid() | Spoke record UUID |
| `patient_id` | From encounter context | Denormalized for RLS |
| `event_id` | From hub record just created | Links to patient_clinical_events |
| `source_shell_file_id` | From batch context | Source document reference |
| `unit` | Default unit lookup (if AI did not provide) | Only for universally-assumed units |
| `verbatim_text_vertices` | Post-Pass 2 algorithm | 4 vertices for precise highlight rendering |
| `measurement_date` | See Date Handling section | Strict rules apply |
| `created_at` | NOW() | Server timestamp |
| `updated_at` | NOW() | Server timestamp |

---

### Date Handling (CRITICAL)

**Vitals are point-in-time measurements. Date accuracy is critical.**

**Date derivation hierarchy (in order):**
1. **Explicit date next to vital** - AI extracts if stated (rare)
2. **Encounter-level date** - If vital is within an encounter section (progress note, consultation), server derives from encounter context
3. **No date determinable** - Leave `measurement_date` as NULL

**NEVER use:**
- File upload date
- Document print date from metadata
- Any guessed or extrapolated date

**Why this matters:**
A vital sign without a date is clinically meaningless for trending. However, it's better to have NULL than a wrong date. Frontend can:
- Hide NULL-dated vitals from timeline views
- Show them in a "Date Unknown" section for user review

**Difference from Medications:**
Unlike medications (which may have ongoing validity), vitals are instantaneous measurements. A BP reading from an unknown date cannot be trended against other readings.

### Columns NOT Used by Pass 2

| Column | Reason | Future |
|--------|--------|--------|
| `ai_confidence` | Research shows LLM confidence poorly calibrated (23-46%) | REMOVE in migration |
| `requires_review` | Meaningless without reliable confidence | REMOVE in migration |
| `confidence_score` | Legacy field, redundant | REMOVE in migration |
| `ai_extracted` | All Pass 2 records are AI-extracted | REMOVE in migration |
| `device_info` | Rarely present in medical documents, over-engineered | REMOVE in migration |
| `reference_range` | Clinical decision support, not extraction | REMOVE in migration |

---

## Proposed Schema Changes (Future Migration)

### Columns to ADD

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `source_text_verbatim` | TEXT | YES | Full verbatim line from document (for audit/traceability) |
| `y_anchor_start` | INTEGER | YES | Y coordinate of first line (zone approach) |
| `y_anchor_end` | INTEGER | NO | Y coordinate of last line (only for multi-line entries) |
| `verbatim_text_vertices` | JSONB | NO | 4 vertices for precise highlight of verbatim text (server-computed) |
| `measurement_site` | TEXT | NO | WHERE on body measurement was taken (e.g., "oral", "left arm", "arterial line", "rectal", "axillary") |

### Columns to RENAME

*No columns to rename.*

### Columns to REMOVE

| Column | Type | Reason |
|--------|------|--------|
| `ai_confidence` | NUMERIC(4,3) | LLM confidence poorly calibrated |
| `requires_review` | BOOLEAN | Meaningless without reliable confidence |
| `confidence_score` | NUMERIC(3,2) | Legacy, redundant |
| `ai_extracted` | BOOLEAN | All Pass 2 records are AI-extracted |
| `device_info` | JSONB | Over-engineered, rarely present in documents |
| `reference_range` | JSONB | Clinical decision support, not extraction concern |

---

## Vital Type Enum (8 values)

| Value | Description | Common Document Text | Default Unit |
|-------|-------------|---------------------|--------------|
| `blood_pressure` | Blood pressure (systolic/diastolic) | BP 120/80, Blood Pressure: 130/85 | mmHg |
| `heart_rate` | Heart rate / pulse | HR 72, Pulse: 80, P 68 | bpm |
| `temperature` | Body temperature | Temp 37.2C, Temperature: 98.6F | AMBIGUOUS |
| `respiratory_rate` | Breathing rate | RR 16, Resp: 18/min | breaths/min |
| `oxygen_saturation` | SpO2 / oxygen saturation | SpO2 98%, O2 Sat: 96%, Sats 97% | % |
| `weight` | Body weight | Wt 70kg, Weight: 154 lbs | AMBIGUOUS |
| `height` | Height/stature | Ht 175cm, Height: 5'10" | AMBIGUOUS |
| `bmi` | Body mass index | BMI 23.5, BMI: 28.1 | kg/m2 |

**Removed types:**
- `blood_glucose` - This is a lab result, belongs in `patient_observations` with `observation_type: 'lab_result'`
- `other` - Too vague. If a measurement doesn't fit these 8 types, it belongs in `patient_observations`

**Future expansion:**
- `head_circumference` - Can be added for pediatric-specific schema

---

## Measurement Site Reference

`measurement_site` is a free-text field capturing WHERE on the body a vital was measured. This is clinically significant because readings can vary by site.

| Vital Type | Common Measurement Sites | Clinical Significance |
|------------|-------------------------|----------------------|
| `temperature` | oral, rectal, axillary, tympanic, temporal artery, esophageal | Rectal ~0.5-1.0F higher than oral; Axillary ~0.5-1.0F lower than oral |
| `blood_pressure` | left arm, right arm, left leg, right leg, arterial line, wrist | Leg BP can be 10-20 mmHg higher than arm; A-line often differs from cuff |
| `oxygen_saturation` | finger, toe, earlobe, forehead | Peripheral sites may read lower in poor perfusion |
| `heart_rate` | radial, carotid, apical, arterial line | Apical vs peripheral may differ in arrhythmias |

**Extraction Rule:** Only extract `measurement_site` if explicitly stated in the document. Do NOT assume or infer.

---

## Example Extractions

### Example 1: Blood Pressure (Simple - No Unit Output)
Document text: "BP 120/80 mmHg"

```json
{
  "source_text_verbatim": "BP 120/80 mmHg",
  "y_anchor": 245.5,
  "vital_type": "blood_pressure",
  "measurement_value": {"systolic": 120, "diastolic": 80}
}
```
**Note:** AI does NOT output `unit` for blood_pressure - server adds "mmHg" automatically.

### Example 2: Multiple Vitals (Token-Optimized Output)
Document text: "Vitals: BP 135/88, HR 76, Temp 37.1C, SpO2 98%"

```json
[
  {
    "source_text_verbatim": "BP 135/88",
    "y_anchor": 312.8,
    "vital_type": "blood_pressure",
    "measurement_value": {"systolic": 135, "diastolic": 88},
    "is_abnormal": true
  },
  {
    "source_text_verbatim": "HR 76",
    "y_anchor": 312.8,
    "vital_type": "heart_rate",
    "measurement_value": {"value": 76}
  },
  {
    "source_text_verbatim": "Temp 37.1C",
    "y_anchor": 312.8,
    "vital_type": "temperature",
    "measurement_value": {"value": 37.1},
    "unit": "C"
  },
  {
    "source_text_verbatim": "SpO2 98%",
    "y_anchor": 312.8,
    "vital_type": "oxygen_saturation",
    "measurement_value": {"value": 98}
  }
]
```
**Note:** Only temperature outputs `unit` (ambiguous). BP, HR, SpO2 do not - server adds defaults.

### Example 3: Weight with Body Position
Document text: "Weight: 72.5 kg (sitting)"

```json
{
  "source_text_verbatim": "Weight: 72.5 kg (sitting)",
  "y_anchor": 456.2,
  "vital_type": "weight",
  "measurement_value": {"value": 72.5},
  "unit": "kg",
  "body_position": "sitting"
}
```
**Note:** Weight unit is ambiguous (kg vs lbs), so AI MUST output it.

### Example 4: Abnormal Vital Explicitly Marked
Document text: "BP 180/110 - ELEVATED"

```json
{
  "source_text_verbatim": "BP 180/110 - ELEVATED",
  "y_anchor": 534.7,
  "vital_type": "blood_pressure",
  "measurement_value": {"systolic": 180, "diastolic": 110},
  "is_abnormal": true,
  "notes": "Documented as elevated"
}
```
**Note:** `is_abnormal: true` because document explicitly states "ELEVATED". We do NOT infer abnormality from values alone.

### Example 5: Temperature with Measurement Site
Document text: "Temp 101.2F (oral)"

```json
{
  "source_text_verbatim": "Temp 101.2F (oral)",
  "y_anchor": 623.1,
  "vital_type": "temperature",
  "measurement_value": {"value": 101.2},
  "unit": "F",
  "measurement_site": "oral"
}
```
**Note:** `measurement_site` captures WHERE the temperature was taken (oral, rectal, axillary, tympanic, temporal). This is distinct from `body_position` (patient posture).

### Example 6: Blood Pressure with Measurement Site (Arterial Line)
Document text: "A-line BP 118/72"

```json
{
  "source_text_verbatim": "A-line BP 118/72",
  "y_anchor": 678.3,
  "vital_type": "blood_pressure",
  "measurement_value": {"systolic": 118, "diastolic": 72},
  "measurement_site": "arterial line"
}
```
**Note:** `measurement_site` distinguishes arterial line readings from cuff readings. Common BP sites: "left arm", "right arm", "left leg", "right leg", "arterial line", "wrist".

### Example 7: Orthostatic Blood Pressures (Heart Failure Patient)
Document text: "Orthostatic BP: Lying 140/90, Sitting 135/88, Standing 118/72"

```json
[
  {
    "source_text_verbatim": "Lying 140/90",
    "y_anchor": 712.4,
    "vital_type": "blood_pressure",
    "measurement_value": {"systolic": 140, "diastolic": 90},
    "body_position": "lying",
    "notes": "Orthostatic assessment"
  },
  {
    "source_text_verbatim": "Sitting 135/88",
    "y_anchor": 712.4,
    "vital_type": "blood_pressure",
    "measurement_value": {"systolic": 135, "diastolic": 88},
    "body_position": "sitting",
    "notes": "Orthostatic assessment"
  },
  {
    "source_text_verbatim": "Standing 118/72",
    "y_anchor": 712.4,
    "vital_type": "blood_pressure",
    "measurement_value": {"systolic": 118, "diastolic": 72},
    "body_position": "standing",
    "notes": "Orthostatic assessment"
  }
]
```
**Note:** Each position is a separate entry with `body_position` specified (patient posture). Systolic/diastolic remain paired within each entry.

### Example 8: Height and Weight (Ambiguous Units)
Document text: "Ht: 175cm, Wt: 78kg, BMI: 25.5"

```json
[
  {
    "source_text_verbatim": "Ht: 175cm",
    "y_anchor": 834.2,
    "vital_type": "height",
    "measurement_value": {"value": 175},
    "unit": "cm"
  },
  {
    "source_text_verbatim": "Wt: 78kg",
    "y_anchor": 834.2,
    "vital_type": "weight",
    "measurement_value": {"value": 78},
    "unit": "kg"
  },
  {
    "source_text_verbatim": "BMI: 25.5",
    "y_anchor": 834.2,
    "vital_type": "bmi",
    "measurement_value": {"value": 25.5}
  }
]
```
**Note:** Height and weight output units (ambiguous). BMI does not - server adds "kg/m2".

---

## Database Constraint Notes

- **Composite FK constraint**: `(event_id, patient_id) -> patient_clinical_events(id, patient_id)` enforces patient_id consistency with parent event
- **FK to parent event**: `event_id` has ON DELETE CASCADE
- **vital_type CHECK constraint**: Database enforces 8 specific values (blood_pressure, heart_rate, temperature, respiratory_rate, oxygen_saturation, weight, height, bmi)
- **NOT NULL constraints**: patient_id, event_id, vital_type, measurement_value
- **NULLABLE**: unit (server may add default), measurement_date (may be unknown)
- **JSONB flexibility**: measurement_value is schema-less JSONB for flexibility with different vital types
- **Optional shell_file reference**: source_shell_file_id is optional FK (can be NULL)
- **Index optimization**: `idx_patient_vitals_event_id` ensures efficient JOINs to parent events

---

## Verbatim vs Interpreted Extraction

**VERBATIM (extract exactly as written - no changes):**
| Field | Rule |
|-------|------|
| `source_text_verbatim` | Exact text from document |
| `measurement_value` | Exact numbers from document |
| `unit` | Exact unit from document (if stated) |
| `measurement_date` | Exact date from document (if stated next to vital) |

**AI CLASSIFICATION (AI interprets/normalizes):**
| Field | Rule |
|-------|------|
| `vital_type` | AI classifies "BP" as `blood_pressure`, "Temp" as `temperature`, etc. |
| `measurement_site` | AI extracts WHERE on body (e.g., "oral", "left arm", "arterial line", "rectal") |
| `body_position` | AI extracts patient posture (e.g., "standing", "sitting", "supine") |
| `measurement_method` | AI can infer from context (e.g., "automated" for device readings) |

**NO INFERENCE ALLOWED:**
- AI must NOT calculate BMI from height/weight
- AI must NOT determine if a value is "abnormal" based on reference ranges (only if document says so)
- AI must NOT assume units for ambiguous vital types (temperature, weight, height)
- AI must NOT guess dates from file metadata

---

## Notes

- **Source text handling**: `source_text_verbatim` stores the exact text for that specific vital (e.g., "BP 120/80"), not the entire vitals line if multiple vitals are on one line
- **Y-anchor for multiple vitals**: When multiple vitals appear on the same line, they share the same `y_anchor` but each has its own `source_text_verbatim`
- **Unit handling**: See "Unit Handling" section - server adds defaults for universally-assumed units
- **measurement_date handling**: See "Date Handling" section - strict rules, NEVER use file metadata
- **is_abnormal flag**: Only set to `true` if document explicitly indicates abnormality (e.g., "elevated", "low", "abnormal", "high"). Do NOT infer from values.
- **Blood pressure structure**: Always use `{"systolic": X, "diastolic": Y}` format for blood_pressure vital_type. Orthostatic BPs are separate entries with different `body_position`
- **Temperature units**: AMBIGUOUS - AI must extract unit if stated, leave NULL if not stated
- **Measurement site**: WHERE on body the measurement was taken. Free-text to accommodate different vital types:
  - Temperature: "oral", "rectal", "axillary", "tympanic", "temporal artery", "esophageal"
  - Blood pressure: "left arm", "right arm", "left leg", "right leg", "arterial line", "wrist"
  - Other vitals: Use as appropriate (e.g., "finger" for pulse ox)
- **Body position**: Patient posture during measurement - only extract if explicitly stated (e.g., "sitting BP", "standing", "supine")
- **measurement_site vs body_position**: These are DIFFERENT concepts:
  - `measurement_site` = WHERE on body (anatomical location)
  - `body_position` = HOW patient was positioned (posture)
  - Example: "Right arm BP, patient sitting" -> `measurement_site: "right arm"`, `body_position: "sitting"`
- **Unit conversion for display**: Storage uses original units. Unit conversion (C/F, kg/lbs) is a frontend display concern via user preference setting, not extraction concern
