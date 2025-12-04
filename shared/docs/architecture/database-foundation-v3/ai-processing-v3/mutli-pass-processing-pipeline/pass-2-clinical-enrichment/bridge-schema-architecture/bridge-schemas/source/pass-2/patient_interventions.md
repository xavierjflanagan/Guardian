# patient_interventions Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** KEEP (but needs refinement)
**Step A Rationale:** Primary spoke for procedures, surgeries, therapies, and in-encounter treatments. NOT for ongoing prescriptions (use patient_medications) or vaccination records (use patient_immunizations). Needs clarification on medication_admin vs vaccination types.
**Step B Sync:** Verified against 03_clinical_core.sql lines 473-510 | GAPS: Missing y_anchor, missing source_text_verbatim, missing intervention_name, missing body_site
**Step C Columns:** DONE - See Column Audit section below
**Step D Temporal:** POINT-IN-TIME - Procedures and treatments are point-in-time events; surgery on date X is forever surgery on date X
**Last Triage Update:** 2025-12-04
**Original Created:** 30 September 2025

---

## Triage Summary

### What This Table IS For
- **Minor procedures** - Wart removal, skin biopsy, joint injection, suturing
- **Surgeries** - Appendectomy, arthroscopy, C-section, dental extraction
- **Therapies** - Physical therapy session, occupational therapy, counseling session
- **In-encounter medication administration** - IV antibiotics during ER visit, sedation during procedure

### What This Table is NOT For
- **Ongoing prescriptions** - Use `patient_medications` instead (Lisinopril 10mg daily)
- **Vaccination records** - Use `patient_immunizations` instead (flu shot record)

### Table Overlap Clarification

| Entity Type | Goes To | Example |
|-------------|---------|---------|
| "Take Lisinopril 10mg daily" | patient_medications | Ongoing prescription |
| "Given IV Rocephin 1g during visit" | patient_interventions | In-encounter administration |
| "Flu vaccine administered today" | patient_immunizations | Vaccination record |
| "Arthroscopic knee surgery performed" | patient_interventions | Surgical procedure |
| "Physical therapy session completed" | patient_interventions | Therapy session |

### Critical Issues Found

| Issue | Severity | Resolution |
|-------|----------|------------|
| No `patient_id` column | MEDIUM | Inconsistent with other spokes - consider adding |
| No `y_anchor` column | HIGH | Add for click-through spatial reference |
| No `source_text_verbatim` column | HIGH | Add for raw text display |
| No `intervention_name` column | HIGH | Need human-readable name |
| No `body_site` column | HIGH | Procedures need anatomical location |
| `vaccination` type overlaps with patient_immunizations | MEDIUM | Clarify when to use each |
| `medication_admin` type overlaps with patient_medications | MEDIUM | Clarify: in-encounter only |
| Schema expects AI to output `event_id` | HIGH | Strategy-A: Server adds IDs, not AI |

### Proposed Schema Changes (Pending Migration)

```sql
-- Add columns for Strategy-A alignment
ALTER TABLE patient_interventions ADD COLUMN y_anchor INTEGER;
ALTER TABLE patient_interventions ADD COLUMN source_text_verbatim TEXT;
ALTER TABLE patient_interventions ADD COLUMN intervention_name TEXT;
ALTER TABLE patient_interventions ADD COLUMN body_site TEXT;
ALTER TABLE patient_interventions ADD COLUMN intervention_date DATE; -- If explicitly stated
-- Optional: Add patient_id for consistency with other spokes
-- ALTER TABLE patient_interventions ADD COLUMN patient_id UUID REFERENCES user_profiles(id);
```

---

**Database Source:** /current_schema/03_clinical_core.sql (lines 473-510)
**Priority:** HIGH - Intervention details for action events (procedures, surgeries, treatments, therapy)

## Database Table Structure

```sql
-- Migration 08: This table has NO patient_id column - derives it through event_id → patient_clinical_events
CREATE TABLE IF NOT EXISTS patient_interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE, -- Migration 08: Required hub reference

    -- Classification
    intervention_type TEXT NOT NULL,

    -- Substance/Medication Details (for drugs, vaccines, etc.)
    substance_name TEXT, -- "Influenza A Vaccine", "Lidocaine", "Atorvastatin"
    manufacturer TEXT,
    lot_number TEXT,
    dose_amount NUMERIC,
    dose_unit TEXT,
    route TEXT, -- 'oral', 'intramuscular', 'topical', 'intravenous'
    frequency TEXT, -- 'daily', 'twice_daily', 'as_needed'

    -- Procedure/Surgery Details
    technique TEXT, -- 'cryotherapy', 'excision', 'injection', 'suture'
    equipment_used TEXT, -- "Liquid nitrogen", "10-blade scalpel"

    -- Outcomes
    immediate_outcome TEXT, -- 'successful', 'partial', 'complications'
    complications TEXT, -- Description of any complications
    followup_required BOOLEAN DEFAULT FALSE,
    followup_instructions TEXT,

    -- V3 AI Processing Integration
    ai_extracted BOOLEAN DEFAULT FALSE,
    ai_confidence NUMERIC(4,3) CHECK (ai_confidence BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration 08: Event reference index for efficient joins
CREATE INDEX IF NOT EXISTS idx_patient_interventions_event_id ON patient_interventions(event_id);
```

## AI Extraction Requirements for Pass 2 (Strategy-A)

Extract detailed intervention data from medical documents for ACTION events - procedures, surgeries, therapies, and in-encounter treatments.

### Strategy-A Token Optimization

**AI outputs ONLY clinical content. Server adds:**
- All UUIDs (id, event_id, patient_id)
- ai_extracted (always true)
- ai_confidence (from processing metadata)
- requires_review (derived from confidence threshold)
- created_at, updated_at timestamps

### Pass 2 AI Output Interface

```typescript
interface Pass2InterventionsOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;           // Full verbatim text from document

  // REQUIRED - Spatial reference
  y_anchor: number;                       // Y coordinate of the line - required for click-through

  // REQUIRED - Classification
  intervention_type: 'minor_procedure' | 'surgery' | 'therapy' | 'in_encounter_treatment';

  // REQUIRED - Human-readable name
  intervention_name: string;              // "Knee Arthroscopy", "Cryotherapy Wart Removal", "Physical Therapy Session"

  // OPTIONAL - Body site (for procedures/surgeries)
  body_site?: string;                     // "right knee", "left forearm", "lower back"

  // OPTIONAL - Substance details (for in_encounter_treatment)
  substance_name?: string;                // "Ceftriaxone", "Propofol", "Lidocaine"
  dose_amount?: number;                   // 1, 2, 100
  dose_unit?: string;                     // "g", "mg", "mL"
  route?: string;                         // "IV", "IM", "topical", "inhalation"

  // OPTIONAL - Technique details (for procedures/surgeries)
  technique?: string;                     // "cryotherapy", "arthroscopy", "excision", "laparoscopic"
  equipment_used?: string;                // "Liquid nitrogen", "10mm trocar"

  // OPTIONAL - Outcomes
  immediate_outcome?: string;             // "successful", "completed", "partial", "aborted"
  complications?: string;                 // "minor bleeding", "post-op swelling"

  // OPTIONAL - Follow-up
  followup_required?: boolean;            // true if document mentions follow-up needed
  followup_instructions?: string;         // "Return in 2 weeks", "Physical therapy starting week 2"

  // OPTIONAL - Intervention date (only if explicitly stated)
  intervention_date?: string;             // ISO date - ONLY if document explicitly states date

  // OPTIONAL - Duration
  duration_minutes?: number;              // Procedure duration if stated

  // OPTIONAL - Provider
  performed_by?: string;                  // "Dr. Smith", "physical therapist"

  // OPTIONAL - Notes
  notes?: string;                         // Any other relevant clinical notes
}
```

### Intervention Type Classification (Updated for Strategy-A)

| Type | What It Is | Examples | NOT This |
|------|-----------|----------|----------|
| `minor_procedure` | Office-based procedures, local anesthesia | Wart removal, skin biopsy, joint injection, suturing | Surgeries requiring OR |
| `surgery` | Surgical procedures requiring OR/surgical suite | Appendectomy, arthroscopy, C-section | Minor office procedures |
| `therapy` | Non-pharmaceutical therapeutic sessions | PT session, OT session, counseling session | Ongoing prescription therapy |
| `in_encounter_treatment` | Medication administered during encounter | IV antibiotics, procedural sedation, nebulizer treatment | Ongoing prescriptions (use patient_medications) |

### Why Remove 'medication_admin' and 'vaccination'?

**Problem:** Overlap with dedicated spoke tables causes confusion.

**Solution:**
- `medication_admin` RENAMED to `in_encounter_treatment` - clarifies it's for point-in-time administrations during an encounter, NOT ongoing prescriptions
- `vaccination` REMOVED - all vaccination records go to `patient_immunizations` table

**Routing Rules:**
| Document Text | Route To | Why |
|--------------|----------|-----|
| "Take Lisinopril 10mg daily" | patient_medications | Ongoing prescription |
| "Given IV Rocephin 1g during ER visit" | patient_interventions (in_encounter_treatment) | Point-in-time administration |
| "Administered flu vaccine, lot #U3476AA" | patient_immunizations | Vaccination record |
| "Knee arthroscopy performed" | patient_interventions (surgery) | Surgical procedure |

## Intervention Type Classification Guide (Strategy-A)

### minor_procedure
Office-based medical procedures (typically local anesthesia):
- **Skin:** Wart removal (cryotherapy, excision), mole removal, skin biopsy, abscess I&D
- **Musculoskeletal:** Joint injection (cortisone, hyaluronic acid), trigger point injection
- **Wound care:** Suturing, wound debridement, staple removal
- **GI:** Hemorrhoid banding, anoscopy
- **ENT:** Cerumen removal, nasal cautery
- **IV access:** IV placement, central line placement (bedside)

### surgery
Surgical procedures requiring OR or surgical suite:
- **Orthopedic:** Arthroscopy, joint replacement, fracture fixation
- **General:** Appendectomy, cholecystectomy, hernia repair
- **Cardiothoracic:** CABG, valve replacement, pacemaker insertion
- **OB/GYN:** C-section, hysterectomy, D&C
- **Neurosurgery:** Craniotomy, laminectomy, spinal fusion
- **Dental surgery:** Wisdom tooth extraction, implant placement
- **Endoscopic:** Colonoscopy with polypectomy, ERCP

### therapy
Therapeutic sessions (non-pharmaceutical):
- **Physical therapy:** PT session, gait training, strengthening exercises
- **Occupational therapy:** OT session, ADL training, hand therapy
- **Speech therapy:** Speech-language pathology session
- **Mental health:** Counseling session, CBT session, DBT session
- **Oncology treatments:** Chemotherapy infusion, radiation therapy session
- **Respiratory:** Pulmonary rehabilitation session
- **Cardiac:** Cardiac rehabilitation session

### in_encounter_treatment
Medications/substances administered DURING an encounter (NOT ongoing prescriptions):
- **IV medications:** IV antibiotics, IV fluids, IV pain medication
- **Procedural:** Procedural sedation, local anesthesia injection
- **Emergency:** Epinephrine administration, naloxone administration
- **Respiratory:** Nebulizer treatment, supplemental oxygen
- **Diagnostic:** Contrast injection for imaging

---

## Example Extractions (Strategy-A Format)

### Example 1: Minor Procedure - Wart Removal
**Source text:** "Performed cryotherapy to plantar wart on left heel using liquid nitrogen. Pt tolerated well. Follow up in 2 weeks."

```json
{
  "source_text_verbatim": "Performed cryotherapy to plantar wart on left heel using liquid nitrogen. Pt tolerated well. Follow up in 2 weeks.",
  "y_anchor": 234,
  "intervention_type": "minor_procedure",
  "intervention_name": "Cryotherapy Wart Removal",
  "body_site": "left heel",
  "technique": "cryotherapy",
  "equipment_used": "liquid nitrogen",
  "immediate_outcome": "successful",
  "followup_required": true,
  "followup_instructions": "Follow up in 2 weeks"
}
```

### Example 2: Surgery - Knee Arthroscopy
**Source text:** "Right knee arthroscopy with partial medial meniscectomy performed under general anesthesia. No complications. Duration 45 minutes."

```json
{
  "source_text_verbatim": "Right knee arthroscopy with partial medial meniscectomy performed under general anesthesia. No complications. Duration 45 minutes.",
  "y_anchor": 89,
  "intervention_type": "surgery",
  "intervention_name": "Knee Arthroscopy with Partial Meniscectomy",
  "body_site": "right knee",
  "technique": "arthroscopy",
  "immediate_outcome": "successful",
  "duration_minutes": 45,
  "notes": "general anesthesia, no complications"
}
```

### Example 3: Therapy Session
**Source text:** "Physical therapy session - focused on quadriceps strengthening and ROM exercises for post-op knee. Patient progressing well. Continue weekly PT."

```json
{
  "source_text_verbatim": "Physical therapy session - focused on quadriceps strengthening and ROM exercises for post-op knee. Patient progressing well. Continue weekly PT.",
  "y_anchor": 156,
  "intervention_type": "therapy",
  "intervention_name": "Physical Therapy Session",
  "body_site": "knee",
  "technique": "strengthening and ROM exercises",
  "immediate_outcome": "successful",
  "followup_required": true,
  "followup_instructions": "Continue weekly PT",
  "notes": "post-op knee rehabilitation"
}
```

### Example 4: In-Encounter Treatment - IV Antibiotics
**Source text:** "Administered Ceftriaxone 1g IV for suspected UTI. Patient to be observed for 30 minutes for adverse reaction."

```json
{
  "source_text_verbatim": "Administered Ceftriaxone 1g IV for suspected UTI. Patient to be observed for 30 minutes for adverse reaction.",
  "y_anchor": 312,
  "intervention_type": "in_encounter_treatment",
  "intervention_name": "IV Ceftriaxone Administration",
  "substance_name": "Ceftriaxone",
  "dose_amount": 1,
  "dose_unit": "g",
  "route": "IV",
  "notes": "for suspected UTI, observed 30 minutes"
}
```

### Example 5: Counseling Session
**Source text:** "CBT session #4 - worked on cognitive restructuring techniques for anxiety. Patient reports improvement in sleep. Next session in 1 week."

```json
{
  "source_text_verbatim": "CBT session #4 - worked on cognitive restructuring techniques for anxiety. Patient reports improvement in sleep. Next session in 1 week.",
  "y_anchor": 445,
  "intervention_type": "therapy",
  "intervention_name": "Cognitive Behavioral Therapy Session",
  "technique": "cognitive restructuring",
  "immediate_outcome": "successful",
  "followup_required": true,
  "followup_instructions": "Next session in 1 week",
  "notes": "session #4, patient reports sleep improvement"
}
```

---

## Date Handling (CRITICAL)

**Interventions are point-in-time. Date accuracy is critical.**

**Date derivation hierarchy:**
1. **Explicit procedure date** - AI extracts if stated (e.g., "Surgery performed 15/11/2025")
2. **Encounter-level date** - Server derives from `source_encounter.encounter_start_date`
3. **No guessing** - Never infer dates from context

**intervention_date field usage:**
- ONLY populate if document explicitly states the date
- For procedures within a progress note, the encounter date applies
- Server adds encounter context at write time

---

## Column Audit (Phase 1 Step C)

### Current Database Columns (03_clinical_core.sql lines 473-510)

| Column | Type | Current | Strategy-A Change |
|--------|------|---------|-------------------|
| id | UUID | Keep | Server-generated |
| event_id | UUID NOT NULL | Keep | Server-assigned |
| intervention_type | TEXT NOT NULL | Update | Remove 'medication_admin', 'vaccination'; Add 'in_encounter_treatment' |
| substance_name | TEXT | Keep | For in_encounter_treatment |
| manufacturer | TEXT | Keep | Rarely used |
| lot_number | TEXT | Keep | Rarely used |
| dose_amount | NUMERIC | Keep | For in_encounter_treatment |
| dose_unit | TEXT | Keep | For in_encounter_treatment |
| route | TEXT | Keep | For in_encounter_treatment |
| frequency | TEXT | Remove? | Not applicable to point-in-time interventions |
| technique | TEXT | Keep | For procedures/surgeries |
| equipment_used | TEXT | Keep | For procedures |
| immediate_outcome | TEXT | Keep | AI extracts |
| complications | TEXT | Keep | AI extracts if stated |
| followup_required | BOOLEAN | Keep | AI extracts |
| followup_instructions | TEXT | Keep | AI extracts |
| ai_extracted | BOOLEAN | Keep | Server-assigned (always true) |
| ai_confidence | NUMERIC(4,3) | Keep | Server-assigned |
| requires_review | BOOLEAN | Keep | Server-derived from confidence |
| created_at | TIMESTAMPTZ | Keep | Server-generated |
| updated_at | TIMESTAMPTZ | Keep | Server-generated |

### Columns to ADD (Migration Required)

| Column | Type | Purpose |
|--------|------|---------|
| source_text_verbatim | TEXT | Raw text from document for display |
| y_anchor | INTEGER | Y coordinate for click-through |
| intervention_name | TEXT | Human-readable name (e.g., "Knee Arthroscopy") |
| body_site | TEXT | Anatomical location (e.g., "right knee") |
| intervention_date | DATE | Only if explicitly stated in document |
| duration_minutes | INTEGER | Procedure duration if stated |
| performed_by | TEXT | Provider who performed intervention |

### patient_id Column Discussion

**Current state:** No patient_id column - derives through event_id -> hub

**Inconsistency:** Other spoke tables (vitals, medications, allergies, conditions) HAVE patient_id

**Recommendation:** ADD patient_id for consistency with other spokes

---

## Critical Notes (Strategy-A Updates)

1. **NO 'vaccination' type**: All vaccinations go to `patient_immunizations` table.

2. **'medication_admin' renamed to 'in_encounter_treatment'**: Clarifies this is for point-in-time administrations DURING an encounter, not ongoing prescriptions.

3. **Token Optimization**: AI outputs only clinical content. Server adds all IDs, confidence, and timestamps.

4. **y_anchor Required**: Every intervention needs spatial reference for document click-through.

5. **source_text_verbatim Required**: Every intervention needs raw text for display and audit trail.

6. **intervention_name Required**: Human-readable name for display (e.g., "Knee Arthroscopy" not just "surgery").

7. **body_site Important**: For procedures and surgeries, anatomical location is critical.

8. **Index for Performance**: `idx_patient_interventions_event_id` ensures efficient JOINs.

---

## Schema Validation Checklist (Strategy-A)

- [ ] `source_text_verbatim` is populated (raw text from document)
- [ ] `y_anchor` is populated (spatial reference)
- [ ] `intervention_type` is one of: 'minor_procedure', 'surgery', 'therapy', 'in_encounter_treatment'
- [ ] `intervention_name` provides human-readable description
- [ ] For 'minor_procedure' and 'surgery': `body_site` should be provided
- [ ] For 'in_encounter_treatment': `substance_name` should be provided
- [ ] If `dose_amount` is provided, `dose_unit` should be provided
- [ ] `followup_required` is boolean (true/false)

---

## Database Constraint Notes (Current State)

- **NO patient_id column**: Patient ID derived through `event_id -> patient_clinical_events` (Migration 08)
- **FK to parent event**: `event_id` has ON DELETE CASCADE
- **No CHECK on intervention_type**: Currently TEXT with no enum constraint
- **Index**: `idx_patient_interventions_event_id` for efficient JOINs