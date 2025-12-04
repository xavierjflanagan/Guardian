# patient_medications Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** KEEP - Primary clinical spoke table for medications
**Step A Rationale:** Core spoke table in hub-and-spoke architecture. Pass 2 discovers and extracts medications from documents.
**Step B Sync:** Verified against 03_clinical_core.sql lines 933-995 - MATCHED (with proposed schema changes below)
**Step C Columns:** Complete - See "Pass 2 AI Output Schema" section below
**Step D Temporal:** POINT-IN-TIME - Each medication record is a document extraction snapshot
**Last Triage Update:** 2025-12-04
**Original Created:** 1 October 2025 (Migration 08 alignment)

**Database Source:** /current_schema/03_clinical_core.sql (lines 933-995)
**Priority:** HIGH - Medication tracking with prescription details

---

## Triage Summary

### What Pass 2 AI Outputs (Token-Optimized)

The AI outputs **only clinical content**. Server adds IDs, context references, and timestamps.

```typescript
interface Pass2MedicationOutput {
  // REQUIRED - Medication identification
  source_text_verbatim: string;         // Full verbatim line from document (e.g., "Metformin 500mg BD")
  medication_name: string;              // Clean drug name only, normalized spelling (e.g., "Metformin")

  // REQUIRED - Spatial reference (zone approach for multi-line prescriptions)
  y_anchor_start: number;               // Y coordinate of first line - required
  y_anchor_end?: number;                // Y coordinate of last line - optional, only for multi-line entries

  // OPTIONAL - Drug naming (ONLY if explicitly stated in document - Pass 2.5 enriches via medical code lookup)
  generic_name?: string;                // Generic/non-proprietary name - only if document explicitly states it
  brand_name?: string;                  // Brand/trade name - only if document explicitly states it

  // OPTIONAL - Prescription details (only if stated in document)
  strength?: string;                    // "10 mg", "500 mg", "20 mg/mL"
  dosage_form?: string;                 // "tablet", "capsule", "liquid", "injection", "cream"
  prescribed_dose?: string;             // "1 tablet", "5 mL", "2 capsules"
  frequency?: string;                   // "daily", "twice daily", "PRN", "Q8H"
  route?: string;                       // "oral", "topical", "intravenous", "subcutaneous"
  duration_prescribed?: string;         // Must be valid PostgreSQL INTERVAL: "7 days", "30 days", "3 months", "2 weeks"

  // OPTIONAL - Repeats (Australian PBS context, only if documented)
  repeats_authorized?: number;          // Number of repeats on script (e.g., 5)
  repeats_remaining?: number;           // Repeats remaining (e.g., 3)

  // OPTIONAL - Clinical context (only if stated in document)
  indication?: string;                  // Reason for prescription (e.g., "Hypertension")
  prescribing_provider?: string;        // Provider name
  prescription_date?: string;           // ISO date - when prescribed
  start_date?: string;                  // ISO date - when started taking
  end_date?: string;                    // ISO date - when stopped/completed

  // OPTIONAL - Status (only if document indicates)
  status?: 'active' | 'completed' | 'discontinued' | 'on_hold' | 'cancelled';

  // OPTIONAL - Safety limits (especially for PRN medications)
  max_daily_dose?: string;              // Safety cap: "max 8 tablets/day", "max 4g/24hrs"

  // OPTIONAL - Dispensing/pharmacy info (if documented)
  dispensed_date?: string;              // ISO date - when dispensed (different from prescription_date)
  dispensed_quantity?: string;          // "60 tablets", "1 box", "100mL"
  dispensing_pharmacy?: string;         // Pharmacy name/location

  // OPTIONAL - Discontinuation details
  reason_stopped?: string;              // Why discontinued (clinical reason, separate from adherence)

  // OPTIONAL - Patient instructions
  instructions?: string;                // "Take with food", "Avoid grapefruit", "Do not crush"

  // OPTIONAL - Compliance/adherence (if documented)
  adherence_notes?: string;             // Compliance information from document

  // OPTIONAL - Extraction context
  extraction_context?: string;          // Where/how mentioned: "Listed in Current Medications section"

  // OPTIONAL - Additional notes
  notes?: string;                       // Any other relevant clinical notes
}
```

### Bounding Box Derivation (Post-Pass 2)

Pass 2 outputs `y_anchor_start` (required) and optionally `y_anchor_end` for multi-line entries. The precise 4-vertex bounding box for the verbatim text is derived post-Pass 2 by a server-side algorithm that:
1. Takes `source_text_verbatim` + `y_anchor_start` (and `y_anchor_end` if present)
2. Searches within that Y-zone in enhanced-xy-OCR data
3. Finds the matching verbatim text span
4. Extracts the 4 vertices (top-left, top-right, bottom-left, bottom-right) from word-level OCR data
5. Stores result in `verbatim_text_vertices` column

**Zone approach rationale:** Medications often span multiple lines (e.g., drug name on line 1, dosing instructions on line 2). The y_anchor_start/y_anchor_end zone captures the full medication entry for accurate click-through functionality.

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
| `verbatim_text_vertices` | Post-Pass 2 algorithm | 4 vertices for precise highlight rendering |
| `created_at` | NOW() | Server timestamp |
| `updated_at` | NOW() | Server timestamp |

**Note:** Server does NOT inject `prescription_date`, `start_date`, or `end_date`. These remain NULL unless AI extracted them from explicit document statements.

---

### Date Handling (CRITICAL)

**Medications have complex date semantics. This section defines how dates are handled.**

#### Date Fields (AI Extracted - Only If Explicitly Stated)

| Field | Meaning | Example Source Text |
|-------|---------|---------------------|
| `prescription_date` | When the medication was prescribed | "Prescribed 15/09/2025" |
| `start_date` | When patient started taking it | "Started taking on 01/10/2025" |
| `end_date` | When patient stopped taking it | "Ceased 20/08/2025" |
| `dispensed_date` | When pharmacy filled the script | "Dispensed 03/12/2025" |

**These fields are ONLY populated if the document explicitly states the date.** If not stated, they remain NULL.

#### "Last Documented" Date (Derived from Encounter)

The "last documented" date is NOT stored on the medication record. It is **derived** from the source encounter:

```typescript
function getMedicationLastDocumented(medication: Medication): Date | null {
  const encounter = getEncounter(medication.source_encounter_id);
  return encounter?.encounter_start_date || null;
}
```

This tells us: "When was this medication last mentioned in a document?"

#### What We NEVER Do

| Forbidden Action | Why |
|------------------|-----|
| Assign encounter date as `prescription_date` | Encounter date != when medication was prescribed |
| Assign encounter date as `start_date` | Encounter date != when patient started taking it |
| Use file upload date for any medication date | Upload date is when user uploaded, not clinical date |
| Use document print date for medication dates | Print date may be years after medication was prescribed |
| Infer dates from medication names or context | No clinical inference - only explicit document statements |

#### The GP Letter Problem (Why This Matters)

**Scenario:** User uploads a GP summary letter from 2020. The letter lists "Metformin 500mg BD" in the medication history section. The medication was actually started in 2015.

**Wrong approach:** Assign `prescription_date: 2020-01-15` (the letter date)
**Correct approach:**
- `prescription_date`: NULL (not explicitly stated)
- `start_date`: NULL (not explicitly stated)
- Source encounter has `encounter_start_date: 2020-01-15`
- Display shows: "Metformin 500mg BD | Last documented: Jan 2020"

The user/provider knows the medication was mentioned in a 2020 document, but we don't falsely claim it was prescribed in 2020.

#### Display Logic for Frontend

```typescript
function getMedicationDisplayDate(medication: Medication): DisplayDate {
  // Priority 1: Explicit prescription date (most specific)
  if (medication.prescription_date) {
    return { date: medication.prescription_date, label: "Prescribed", confidence: "explicit" };
  }

  // Priority 2: Explicit start date
  if (medication.start_date) {
    return { date: medication.start_date, label: "Started", confidence: "explicit" };
  }

  // Priority 3: Dispensed date (implies recent use)
  if (medication.dispensed_date) {
    return { date: medication.dispensed_date, label: "Dispensed", confidence: "explicit" };
  }

  // Priority 4: Source encounter date (when we last saw this medication)
  const encounter = getEncounter(medication.source_encounter_id);
  if (encounter?.encounter_start_date) {
    return { date: encounter.encounter_start_date, label: "Last documented", confidence: "derived" };
  }

  // Priority 5: No date available
  return { date: null, label: "Date unknown", confidence: "none" };
}
```

#### Manual Input Encounters and Recency

When a user confirms "still taking this medication", the system:

1. Creates a **manual input encounter** with `encounter_start_date` = NOW()
2. The medication's `source_encounter_id` is updated to point to this new encounter
3. The "last documented" date is now current
4. The original `prescription_date`/`start_date` remain NULL (unless user provides them)

This is handled by the AI-orchestrated manual input system (see `13-MANUAL-ENCOUNTERS-FUTURE.md`), where user confirmations generate progress notes that flow through the normal encounter pipeline.

**Result:** The medication now shows "Last documented: Today" even though we still don't know when it was originally prescribed.

---

### Columns NOT Used by Pass 2

| Column | Reason | Future |
|--------|--------|--------|
| `rxnorm_code` | Medical codes via Pass 2.5 only | REMOVE in migration |
| `pbs_code` | Medical codes via Pass 2.5 only | REMOVE in migration |
| `atc_code` | Medical codes via Pass 2.5 only | REMOVE in migration |
| `ai_confidence` | Research shows LLM confidence poorly calibrated (23-46%) | REMOVE in migration |
| `requires_review` | Meaningless without reliable confidence | REMOVE in migration |
| `confidence_score` | Legacy field, redundant | REMOVE in migration |
| `ai_extracted` | All Pass 2 records are AI-extracted | REMOVE in migration |
| `drug_interaction_checked` | Future feature, not Pass 2 scope | REMOVE in migration |
| `clinical_context` JSONB | Replaced by `extraction_context` TEXT | REMOVE in migration |

### Medical Codes - Handled by Pass 2.5 Only

Medical codes are **not stored inline** on the medications table. Pass 2.5 Agentic Waterfall assigns codes and writes to the `medical_code_assignments` table with FK reference to the hub event_id.

**Rationale:**
- Medications may have multiple codes (RxNorm + PBS + ATC)
- Codes are a separate concern from extraction
- Avoids dual source of truth
- `medical_code_assignments` table designed for this purpose

---

## Proposed Schema Changes (Future Migration)

### Columns to ADD

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `source_text_verbatim` | TEXT | YES | Full verbatim line from document (for audit/traceability) |
| `y_anchor_start` | INTEGER | YES | Y coordinate of first line (zone approach) |
| `y_anchor_end` | INTEGER | NO | Y coordinate of last line (only for multi-line entries) |
| `verbatim_text_vertices` | JSONB | NO | 4 vertices for precise highlight of verbatim text (server-computed) |
| `extraction_context` | TEXT | NO | Where/how mentioned in document |
| `max_daily_dose` | TEXT | NO | Safety cap for PRN meds: "max 8 tablets/day" |
| `dispensed_date` | DATE | NO | When medication was dispensed |
| `dispensed_quantity` | TEXT | NO | Quantity dispensed: "60 tablets", "100mL" |
| `dispensing_pharmacy` | TEXT | NO | Pharmacy name/location |
| `reason_stopped` | TEXT | NO | Clinical reason for discontinuation |
| `instructions` | TEXT | NO | Patient instructions: "Take with food" |
| `repeats_authorized` | INTEGER | NO | Number of repeats on script (Australian PBS) |
| `repeats_remaining` | INTEGER | NO | Repeats remaining (if documented) |

### Columns to RENAME

*No columns to rename.* The existing `medication_name` column is kept as-is (clean drug name only, normalized spelling).

### Columns to REMOVE

| Column | Type | Reason |
|--------|------|--------|
| `rxnorm_code` | TEXT | Pass 2.5 only via medical_code_assignments |
| `pbs_code` | TEXT | Pass 2.5 only via medical_code_assignments |
| `atc_code` | TEXT | Pass 2.5 only via medical_code_assignments |
| `ai_confidence` | NUMERIC(4,3) | LLM confidence poorly calibrated |
| `requires_review` | BOOLEAN | Meaningless without reliable confidence |
| `confidence_score` | NUMERIC(3,2) | Legacy, redundant |
| `ai_extracted` | BOOLEAN | All Pass 2 records are AI-extracted |
| `drug_interaction_checked` | BOOLEAN | Future feature, not Pass 2 scope |
| `clinical_context` | JSONB | Replaced by extraction_context TEXT |

---

## Status Values

Database enforces CHECK constraint with 5 values:

| Status | Meaning | When to Use |
|--------|---------|-------------|
| `active` | Currently being taken | Default for medications listed as "current" |
| `completed` | Course finished as planned | Full treatment course completed |
| `discontinued` | Stopped early | Stopped due to side effects, inefficacy, etc. |
| `on_hold` | Temporarily paused | Temporarily suspended (e.g., pre-surgery) |
| `cancelled` | Never started | Prescription cancelled before starting |

---

## Example Extractions

### Example 1: Simple Current Medication List Item
Document text: "Metformin 500mg twice daily"

```json
{
  "source_text_verbatim": "Metformin 500mg twice daily",
  "medication_name": "Metformin",
  "y_anchor_start": 245.5,
  "strength": "500 mg",
  "dosage_form": "tablet",
  "frequency": "twice daily",
  "route": "oral",
  "extraction_context": "Listed in Current Medications section"
}
```

### Example 2: Prescription with Full Details
Document text: "Lisinopril 10mg daily for hypertension, prescribed by Dr. Johnson on 15/09/2025"

```json
{
  "source_text_verbatim": "Lisinopril 10mg daily for hypertension, prescribed by Dr. Johnson on 15/09/2025",
  "medication_name": "Lisinopril",
  "y_anchor_start": 312.8,
  "strength": "10 mg",
  "dosage_form": "tablet",
  "prescribed_dose": "1 tablet",
  "frequency": "daily",
  "route": "oral",
  "indication": "Hypertension",
  "prescribing_provider": "Dr. Johnson",
  "prescription_date": "2025-09-15",
  "start_date": "2025-09-15",
  "status": "active",
  "extraction_context": "From Prescriptions section"
}
```

**Note:** `generic_name` and `brand_name` are NOT included because the document doesn't explicitly state them. Pass 2.5 will enrich with authoritative generic/brand names via medical code lookup.

### Example 3: Discontinued Medication
Document text: "Discontinued: Metformin 500mg BD - GI side effects (stopped 20/08/2025)"

```json
{
  "source_text_verbatim": "Discontinued: Metformin 500mg BD - GI side effects (stopped 20/08/2025)",
  "medication_name": "Metformin",
  "y_anchor_start": 156.2,
  "strength": "500 mg",
  "dosage_form": "tablet",
  "prescribed_dose": "1 tablet",
  "frequency": "twice daily",
  "route": "oral",
  "end_date": "2025-08-20",
  "status": "discontinued",
  "reason_stopped": "Gastrointestinal side effects",
  "extraction_context": "From Discontinued Medications list"
}
```

### Example 4: PRN (As-Needed) Medication
Document text: "Paracetamol 500mg 1-2 tabs PRN for pain (max 8/day)"

```json
{
  "source_text_verbatim": "Paracetamol 500mg 1-2 tabs PRN for pain (max 8/day)",
  "medication_name": "Paracetamol",
  "y_anchor_start": 423.1,
  "strength": "500 mg",
  "dosage_form": "tablet",
  "prescribed_dose": "1-2 tablets",
  "frequency": "as needed",
  "route": "oral",
  "indication": "Pain relief",
  "max_daily_dose": "max 8 tablets/day",
  "status": "active",
  "extraction_context": "Current Medications list"
}
```

**Note:** `generic_name` and `brand_name` are NOT included - Pass 2.5 enriches via medical code lookup.

### Example 5: Topical Medication
Document text: "Apply Betamethasone 0.05% cream to affected areas BD"

```json
{
  "source_text_verbatim": "Apply Betamethasone 0.05% cream to affected areas BD",
  "medication_name": "Betamethasone",
  "y_anchor_start": 567.9,
  "strength": "0.05%",
  "dosage_form": "cream",
  "frequency": "twice daily",
  "route": "topical",
  "instructions": "Apply to affected areas",
  "extraction_context": "Treatment Plan section"
}
```

**Note:** `medication_name` is just "Betamethasone" (the drug name). Pass 2.5 enriches with the specific salt form (e.g., "Betamethasone valerate") via medical code lookup.

### Example 6: Medication from Hospital Discharge Summary
Document text: "Discharge Medications: Aspirin 100mg daily (continue indefinitely), Atorvastatin 40mg nocte"

```json
[
  {
    "source_text_verbatim": "Aspirin 100mg daily (continue indefinitely)",
    "medication_name": "Aspirin",
    "y_anchor_start": 890.3,
    "strength": "100 mg",
    "dosage_form": "tablet",
    "frequency": "daily",
    "route": "oral",
    "notes": "Continue indefinitely",
    "extraction_context": "Discharge Medications list"
  },
  {
    "source_text_verbatim": "Atorvastatin 40mg nocte",
    "medication_name": "Atorvastatin",
    "y_anchor_start": 905.7,
    "strength": "40 mg",
    "dosage_form": "tablet",
    "frequency": "at night",
    "route": "oral",
    "extraction_context": "Discharge Medications list"
  }
]
```

### Example 7: Multi-Line Prescription with Dispensing Info (Y-Anchor Zone)
Document text (spans 3 lines):
```
Line 1: "Rx: Amoxicillin 500mg TDS x 7 days"
Line 2: "Take with food. Qty: 21 capsules."
Line 3: "Dispensed 03/12/2025 at Chemist Warehouse Bondi Junction"
```

```json
{
  "source_text_verbatim": "Rx: Amoxicillin 500mg TDS x 7 days - Take with food. Qty: 21 capsules. Dispensed 03/12/2025 at Chemist Warehouse Bondi Junction",
  "medication_name": "Amoxicillin",
  "y_anchor_start": 134.6,
  "y_anchor_end": 178.2,
  "strength": "500 mg",
  "dosage_form": "capsule",
  "prescribed_dose": "1 capsule",
  "frequency": "three times daily",
  "route": "oral",
  "duration_prescribed": "7 days",
  "instructions": "Take with food",
  "dispensed_date": "2025-12-03",
  "dispensed_quantity": "21 capsules",
  "dispensing_pharmacy": "Chemist Warehouse Bondi Junction",
  "status": "active",
  "extraction_context": "Prescription document"
}
```

**Note:** This example demonstrates the y-anchor zone approach. `y_anchor_start` is the Y coordinate of line 1, `y_anchor_end` is the Y coordinate of line 3. This allows click-through to highlight the full prescription block.

---

## Database Constraint Notes

- **Composite FK constraint**: `(event_id, patient_id) -> patient_clinical_events(id, patient_id)` enforces patient_id consistency with parent event
- **FK to parent event**: `event_id` has ON DELETE CASCADE
- **status CHECK constraint**: Database enforces 5 specific values
- **NOT NULL constraints**: patient_id, event_id, medication_name are required
- **Optional shell_file reference**: source_shell_file_id is optional FK (can be NULL)
- **Index optimization**: `idx_patient_medications_event_id` ensures efficient JOINs to parent events

---

## Notes

- **Medication name handling**: `source_text_verbatim` stores full verbatim line (for audit/traceability), `medication_name` stores clean drug name only with normalized spelling (for clinical grouping/searching)
- **Generic/brand names**: Only populate if explicitly stated in document. Pass 2.5 enriches with authoritative names via medical code lookup.
- **Y-anchor zone**: Use `y_anchor_start` for single-line entries. Add `y_anchor_end` for multi-line prescriptions to capture the full medication block for click-through.
- **Frequency standardization**: AI should normalize common patterns (BD -> twice daily, TDS -> three times daily, QID -> four times daily)
- **Duration handling**: Must output valid PostgreSQL INTERVAL format ("7 days", "30 days", "3 months", "2 weeks")
- **PRN in frequency**: PRN/as-needed is captured in frequency field (e.g., "as needed", "PRN", "when required")
- **Max dose safety**: Always extract max daily dose limits for PRN medications - this is safety-critical information
- **Dispensing vs prescription dates**: `dispensed_date` is when pharmacy filled script; `prescription_date` is when doctor wrote it
- **Instructions vs notes**: `instructions` is patient-facing directions; `notes` is other clinical information
- **reason_stopped vs adherence_notes**: `reason_stopped` is clinical reason (side effects, ineffective); `adherence_notes` is compliance issues
- **Repeats (Australian PBS)**: Extract repeats_authorized and repeats_remaining when explicitly stated (e.g., "Qty 30, Rpts 5")

## Derivation Rules (Not Clinical Inference)

These are **pharmaceutical/documentary standards**, not clinical judgment:

| Rule | Type | Rationale |
|------|------|-----------|
| **Route from dosage form** | Pharmaceutical standard | tablet/capsule -> oral, cream/ointment -> topical, injection -> parenteral. This is pharmaceutical fact, not clinical inference. |
| **Status from section heading** | Documentary context | Medication under "Current Medications" heading -> status 'active'. This is document structure interpretation, not clinical inference. |

**What we do NOT infer:**
- Clinical indication from medication name (no "Metformin -> patient has diabetes")
- Severity or urgency
- Interactions or contraindications
- Any clinical judgment about the medication's appropriateness

---

## Pass 2.5 Handoff

Pass 2.5 performs medical code assignment using the Agentic Waterfall. To enable accurate code lookup, Pass 2 outputs **structured fields** rather than a single string.

### What Pass 2.5 Receives

| Field | Purpose | Example |
|-------|---------|---------|
| `medication_name` | Primary lookup key (clean drug name) | "Metformin" |
| `strength` | Disambiguates formulation | "500 mg" |
| `dosage_form` | Disambiguates formulation | "tablet" |
| `route` | Disambiguates formulation | "oral" |

### Why Structured Fields

**Problem:** A single string like "Metformin 500mg BD" contains:
- Drug name (needed for lookup)
- Dosage info (useful for disambiguation)
- Frequency (not relevant for code lookup)

**Solution:** Pass 2 extracts each component into separate fields. Pass 2.5 uses the combination of `medication_name` + `strength` + `dosage_form` + `route` to perform accurate RxNorm/PBS/ATC lookup.

### What Pass 2.5 Enriches

After code assignment, Pass 2.5 can enrich the medication record with authoritative data:

| Enrichment | Source | Example |
|------------|--------|---------|
| `generic_name` | RxNorm lookup | "Metformin hydrochloride" |
| `brand_name` | RxNorm lookup | "Glucophage" |
| Medical codes | medical_code_assignments table | RxNorm, PBS, ATC codes |

This approach ensures generic/brand names come from authoritative medical code libraries rather than AI inference.
