# patient_immunizations Bridge Schema (Source) - Pass 2

**Triage Status:** DONE (Xavier reviewed 2025-12-04)
**Step A Decision:** KEEP
**Step A Rationale:** Primary spoke for ALL vaccination records. This is the dedicated immunization table - patient_interventions should NOT have 'vaccination' type.
**Step B Sync:** Verified against 03_clinical_core.sql lines 868-928 | SIGNIFICANT CHANGES NEEDED - See Column Audit
**Step C Columns:** DONE - Major cleanup required (remove legacy columns, add extracted_codes)
**Step D Temporal:** POINT-IN-TIME - Vaccination on date X is forever vaccination on date X
**Last Triage Update:** 2025-12-04 (Xavier + assistant review)
**Original Created:** 1 October 2025

---

## Triage Summary

### What This Table IS For
- **ALL vaccination records** - Flu shots, COVID vaccines, childhood immunizations, travel vaccines, boosters
- **Complete immunization history** - Dose numbers, lot numbers, manufacturers, administration sites
- **Extracted codes** - Codes found IN the document text (separate from Pass 2.5 assigned codes)

### What This Table is NOT For
- Procedures involving injections that are NOT vaccines (use patient_interventions)
- Medications (use patient_medications)
- **Assigned medical codes** - These go in `medical_code_assignments` table (Pass 2.5)

### Table Completeness Assessment

This table has good bones but needs cleanup:
- `patient_id` column (denormalized for RLS) - KEEP
- `anatomical_site` - KEEP
- `administration_date` - KEEP but make NULLABLE (see Date Handling)
- Healthcare coding fields - REMOVE (move to medical_code_assignments)
- Confidence/review fields - REMOVE (legacy, not useful)

### Critical Changes Required

| Issue | Severity | Resolution |
|-------|----------|------------|
| No `y_anchor_start`/`y_anchor_end` columns | HIGH | ADD zone approach for click-through spatial reference |
| No `source_text_verbatim` column | HIGH | ADD for raw text display |
| No `extracted_codes` column | HIGH | ADD JSONB array for codes found in document |
| 6 separate code columns | MEDIUM | REMOVE - use medical_code_assignments table |
| `administration_date` is NOT NULL | MEDIUM | Make NULLABLE - only populate if explicit |
| Legacy confidence/review columns | MEDIUM | REMOVE - not useful per research |
| `archived_at` column | LOW | REMOVE - not using soft deletes |

---

**Database Source:** /current_schema/03_clinical_core.sql (lines 868-928)
**Priority:** CRITICAL - Vaccination records and immunization history tracking

## Database Table Structure

```sql
-- Patient immunizations and vaccination records
-- Migration 08: This table HAS patient_id column (denormalized for performance)
CREATE TABLE IF NOT EXISTS patient_immunizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE, -- Migration 08: Required hub reference

    -- Immunization Details
    vaccine_name TEXT NOT NULL, -- "COVID-19 mRNA vaccine", "Influenza vaccine"
    vaccine_type TEXT, -- "mRNA", "inactivated", "live attenuated", "subunit"
    manufacturer TEXT, -- "Pfizer-BioNTech", "Moderna", "Johnson & Johnson"
    lot_number TEXT,
    expiration_date DATE,

    -- Administration Details
    dose_number INTEGER, -- 1st dose, 2nd dose, booster
    dose_amount NUMERIC(6,3), -- Amount in mL
    route_of_administration TEXT, -- "intramuscular", "intranasal", "oral"
    anatomical_site TEXT, -- "left deltoid", "right deltoid", "anterolateral thigh"

    -- Healthcare Standards Integration (V3)
    snomed_code TEXT, -- SNOMED-CT vaccine codes
    cpt_code TEXT, -- CPT administration codes (90686, 90688, etc.)
    cvx_code TEXT, -- CDC vaccine codes (CVX codes)
    ndc_code TEXT, -- National Drug Code

    -- Australian healthcare specifics
    acir_code TEXT, -- Australian Childhood Immunisation Register codes
    pbs_item_code TEXT, -- PBS item codes for funded vaccines

    -- Clinical Context
    indication TEXT, -- "routine immunization", "travel", "occupational exposure"
    contraindications TEXT[], -- Array of contraindications if any
    adverse_reactions TEXT[], -- Any reported adverse reactions

    -- Provider Information
    administered_by TEXT, -- Healthcare provider name
    administering_facility TEXT, -- Facility name
    administration_date TIMESTAMPTZ NOT NULL,

    -- Data Quality and Provenance (V3)
    coding_confidence NUMERIC(4,3) CHECK (coding_confidence BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    source_shell_file_id UUID REFERENCES shell_files(id),

    -- AI Processing Integration
    ai_extracted BOOLEAN DEFAULT FALSE,
    ai_confidence NUMERIC(4,3) CHECK (ai_confidence BETWEEN 0 AND 1),
    clinical_validation_status TEXT DEFAULT 'pending' CHECK (clinical_validation_status IN (
        'pending', 'validated', 'requires_review', 'rejected'
    )),

    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    archived_at TIMESTAMPTZ,

    -- Migration 08: Composite FK ensures patient_id consistency with parent event
    CONSTRAINT patient_immunizations_event_patient_fk FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);

-- Migration 08: Event reference index for efficient joins
CREATE INDEX IF NOT EXISTS idx_patient_immunizations_event_id ON patient_immunizations(event_id);
```

## AI Extraction Requirements for Pass 2 (Strategy-A)

Extract immunization and vaccination records from medical documents. This is the PRIMARY and ONLY table for vaccination data - patient_interventions should NOT handle vaccinations.

### Strategy-A Token Optimization

**AI outputs ONLY clinical content. Server adds:**
- All UUIDs (id, event_id, patient_id, source_shell_file_id)
- created_at, updated_at timestamps

**Two Types of Medical Codes (IMPORTANT):**

| Code Type | Where Stored | Who Adds | Purpose |
|-----------|--------------|----------|---------|
| **Extracted codes** | `extracted_codes` JSONB on this table | Pass 2 AI | Codes found IN the document text (for audit + Pass 2.5 hints) |
| **Assigned codes** | `medical_code_assignments` table | Pass 2.5 Agentic Waterfall | Canonical codes for dedupe/temporal logic |

If a document says "CVX: 208" or "SNOMED: 871875005", the AI extracts that to `extracted_codes`. Pass 2.5 later verifies/assigns the canonical code.

### Pass 2 AI Output Interface

```typescript
interface Pass2ImmunizationsOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;           // Full verbatim text from document

  // REQUIRED - Spatial reference (zone approach for multi-line immunization records)
  y_anchor_start: number;                 // Y coordinate of first line - required
  y_anchor_end?: number;                  // Y coordinate of last line - optional, only for multi-line entries

  // REQUIRED - Vaccine identification
  vaccine_name: string;                   // "COVID-19 vaccine", "Influenza vaccine", "Tdap"

  // OPTIONAL - Administration date (ONLY if explicitly stated in document)
  administration_date?: string;           // ISO date - see Date Handling section

  // OPTIONAL - Immunization details
  vaccine_type?: string;                  // "mRNA", "inactivated", "live attenuated", "subunit"
  manufacturer?: string;                  // "Pfizer", "Moderna", "Sanofi Pasteur"
  lot_number?: string;                    // Vaccine lot number if stated
  expiration_date?: string;               // ISO date - vaccine expiry if stated on card/printout

  // OPTIONAL - Administration details
  dose_number?: number;                   // 1, 2, 3, or booster number
  dose_amount?: number;                   // Amount in mL (e.g., 0.3, 0.5)
  route_of_administration?: string;       // "intramuscular", "intranasal", "oral", "subcutaneous"
  anatomical_site?: string;               // "left deltoid", "right deltoid", "anterolateral thigh"

  // OPTIONAL - Codes found IN the document (for Pass 2.5 hints)
  extracted_codes?: Array<{
    code: string;                         // "208", "871875005", "90471"
    code_system: string;                  // "CVX", "SNOMED-CT", "CPT", "NDC", "ACIR", "PBS"
  }>;

  // OPTIONAL - Clinical context
  indication?: string;                    // "routine immunization", "travel", "occupational"
  adverse_reactions?: string[];           // Array if any reactions reported

  // OPTIONAL - Provider information
  administered_by?: string;               // Provider name if stated
  administering_facility?: string;        // Facility name if stated

  // OPTIONAL - Notes (extra context)
  notes?: string;                         // "fifth COVID booster", "series complete", etc.
}
```

### What Server Adds (Context Injection)

| Field | Source | Notes |
|-------|--------|-------|
| `id` | gen_random_uuid() | Spoke record UUID |
| `patient_id` | From encounter context | Denormalized for RLS |
| `event_id` | From hub record just created | Links to patient_clinical_events |
| `source_shell_file_id` | From batch context | Denormalized for query performance |
| `verbatim_text_vertices` | Post-Pass 2 algorithm | 4 vertices for precise highlight rendering |
| `created_at` | NOW() | Server timestamp |
| `updated_at` | NOW() | Server timestamp |

### Bounding Box Derivation (Post-Pass 2)

Pass 2 outputs `y_anchor_start` (required) and optionally `y_anchor_end` for multi-line entries. The precise 4-vertex bounding box for the verbatim text is derived post-Pass 2 by a server-side algorithm that:
1. Takes `source_text_verbatim` + `y_anchor_start` (and `y_anchor_end` if present)
2. Searches within that Y-zone in enhanced-xy-OCR data
3. Finds the matching verbatim text span
4. Extracts the 4 vertices (top-left, top-right, bottom-left, bottom-right) from word-level OCR data
5. Stores result in `verbatim_text_vertices` column

**Why pre-compute vertices:**
- Fast frontend rendering (no runtime OCR lookup)
- Auditable/testable (stored data can be validated)
- Works offline (no dependency on OCR data at display time)

### What Pass 2 Does NOT Handle

| Concern | Why Not | Where It Goes |
|---------|---------|---------------|
| Assigned medical codes | System assignment, not extraction | `medical_code_assignments` table (Pass 2.5) |
| Contraindications | Patient-level, not vaccination-level | Patient allergies/conditions tables |
| Validation workflow | Infrastructure concern | `manual_review_queue` table |

## Vaccine Type Values

- **mRNA**: mRNA vaccines (e.g., COVID-19 Pfizer, Moderna)
- **inactivated**: Inactivated virus vaccines (e.g., flu shots, polio)
- **live attenuated**: Live but weakened virus vaccines (e.g., MMR, varicella)
- **subunit**: Subunit, recombinant, or conjugate vaccines (e.g., HPV, hepatitis B)

## Example Extractions (Strategy-A Format)

### Example 1: COVID-19 Vaccination (Single Line)
**Source text:** "COVID-19 vaccine (Pfizer) dose 2 administered in left deltoid. Lot #EW0182. No adverse reactions."

```json
{
  "source_text_verbatim": "COVID-19 vaccine (Pfizer) dose 2 administered in left deltoid. Lot #EW0182. No adverse reactions.",
  "y_anchor_start": 234,
  "vaccine_name": "COVID-19 vaccine",
  "vaccine_type": "mRNA",
  "manufacturer": "Pfizer",
  "lot_number": "EW0182",
  "dose_number": 2,
  "route_of_administration": "intramuscular",
  "anatomical_site": "left deltoid",
  "indication": "routine immunization"
}
```
**Note:** Single-line entry - only `y_anchor_start` needed, no `y_anchor_end`.

### Example 2: Influenza Vaccination with Date
**Source text:** "Flu vaccine 2025 administered 15/04/2025. Quadrivalent, IM right deltoid. Dr. Chen."

```json
{
  "source_text_verbatim": "Flu vaccine 2025 administered 15/04/2025. Quadrivalent, IM right deltoid. Dr. Chen.",
  "y_anchor_start": 156,
  "vaccine_name": "Influenza vaccine, quadrivalent",
  "vaccine_type": "inactivated",
  "administration_date": "2025-04-15",
  "route_of_administration": "intramuscular",
  "anatomical_site": "right deltoid",
  "administered_by": "Dr. Chen",
  "indication": "routine immunization"
}
```

### Example 3: Travel Vaccination with Adverse Reaction
**Source text:** "Yellow fever vaccine given for travel to Brazil. Patient reported mild fever and injection site soreness next day."

```json
{
  "source_text_verbatim": "Yellow fever vaccine given for travel to Brazil. Patient reported mild fever and injection site soreness next day.",
  "y_anchor_start": 312,
  "vaccine_name": "Yellow Fever vaccine",
  "vaccine_type": "live attenuated",
  "indication": "travel",
  "adverse_reactions": ["mild fever", "injection site soreness"],
  "notes": "travel to Brazil"
}
```
**Note:** Single-line entry - only `y_anchor_start` needed, no `y_anchor_end`.

### Example 4: Childhood Vaccination (Historical)
**Source text:** "Immunization history: MMR x2, Varicella x1, DTaP x5 (series complete)"

```json
[
  {
    "source_text_verbatim": "MMR x2",
    "y_anchor_start": 89,
    "vaccine_name": "MMR vaccine",
    "vaccine_type": "live attenuated",
    "dose_number": 2,
    "notes": "series complete"
  },
  {
    "source_text_verbatim": "Varicella x1",
    "y_anchor_start": 89,
    "vaccine_name": "Varicella vaccine",
    "vaccine_type": "live attenuated",
    "dose_number": 1,
    "notes": "series complete"
  },
  {
    "source_text_verbatim": "DTaP x5",
    "y_anchor_start": 89,
    "vaccine_name": "DTaP vaccine",
    "vaccine_type": "inactivated",
    "dose_number": 5,
    "notes": "series complete"
  }
]
```
**Note:** No `administration_date` because historical records rarely have explicit dates. Frontend displays "Documented: [encounter date]". All three vaccines share the same `y_anchor_start` because they appear on the same line.

### Example 5: Vaccination with Codes in Document
**Source text:** "COVID-19 vaccine (Pfizer Comirnaty) CVX: 208, SNOMED: 1119349007. Administered 15/03/2024."

```json
{
  "source_text_verbatim": "COVID-19 vaccine (Pfizer Comirnaty) CVX: 208, SNOMED: 1119349007. Administered 15/03/2024.",
  "y_anchor_start": 423,
  "vaccine_name": "COVID-19 vaccine (Comirnaty)",
  "vaccine_type": "mRNA",
  "manufacturer": "Pfizer",
  "administration_date": "2024-03-15",
  "extracted_codes": [
    {"code": "208", "code_system": "CVX"},
    {"code": "1119349007", "code_system": "SNOMED-CT"}
  ]
}
```
**Note:** Codes found IN the document are extracted to `extracted_codes`. Pass 2.5 will verify and assign canonical codes to `medical_code_assignments` table. Single-line entry - only `y_anchor_start` needed.

### Example 6: Multi-Line Vaccination Record (Zone Approach)
**Source text (spans 3 lines):**
```
COVID-19 Vaccine - Pfizer BioNTech Comirnaty
Dose 2 of 2, Lot #FF8832, Exp: 2024-06-30
Given IM left deltoid by Dr. Martinez at City Clinic
```

```json
{
  "source_text_verbatim": "COVID-19 Vaccine - Pfizer BioNTech Comirnaty\nDose 2 of 2, Lot #FF8832, Exp: 2024-06-30\nGiven IM left deltoid by Dr. Martinez at City Clinic",
  "y_anchor_start": 150,
  "y_anchor_end": 178,
  "vaccine_name": "COVID-19 vaccine (Comirnaty)",
  "vaccine_type": "mRNA",
  "manufacturer": "Pfizer BioNTech",
  "dose_number": 2,
  "lot_number": "FF8832",
  "expiration_date": "2024-06-30",
  "route_of_administration": "intramuscular",
  "anatomical_site": "left deltoid",
  "administered_by": "Dr. Martinez",
  "administering_facility": "City Clinic"
}
```
**Note:** Multi-line entry - uses both `y_anchor_start` (first line at Y=150) and `y_anchor_end` (last line at Y=178). Click-through highlights the entire zone.

---

## Date Handling (CRITICAL)

**Vaccinations are point-in-time. Date accuracy is critical.**

This follows the same pattern as medications - see `patient_medications.md` for detailed rationale.

### Date Fields

| Field | Meaning | AI Extracts? | Example Source Text |
|-------|---------|--------------|---------------------|
| `administration_date` | When the vaccine was given | ONLY if explicit | "Flu shot 15/04/2025" |

**This field is NULLABLE.** Only populate if the document explicitly states the date.

### "Documented Date" (Derived from Encounter)

The "documented date" is NOT stored on the immunization record. It is **derived** from the source encounter:

```typescript
function getDocumentedDate(immunization: PatientImmunization): Date | null {
  const encounter = await getEncounterById(immunization.event_id);
  return encounter?.encounter_start_date || null;
}
```

This tells us: "When was this immunization last mentioned in a document?"

### What We NEVER Do

| Forbidden Action | Why |
|------------------|-----|
| Assign encounter date as `administration_date` | Encounter date != when vaccine was given |
| Use file upload date for any immunization date | Upload date is when user uploaded, not clinical date |
| Use document print date for immunization dates | Print date may be years after vaccination |
| Infer dates from vaccine names or context | No clinical inference - only explicit document statements |

### The Immunization History Problem (Why This Matters)

**Scenario:** User uploads a GP summary letter from 2020. The letter lists "COVID-19 vaccine (Pfizer) dose 2" in the immunization history section. The vaccine was actually administered in 2021.

**Wrong approach:** Assign `administration_date: 2020-01-15` (the letter date)
**Correct approach:**
- `administration_date`: NULL (not explicitly stated in this document)
- Source encounter has `encounter_start_date: 2020-01-15`
- Display shows: "COVID-19 vaccine dose 2 | Documented: Jan 2020"

The user/provider knows the vaccine was mentioned in a 2020 document, but we don't falsely claim it was administered in 2020.

### Display Logic for Frontend

```typescript
function getImmunizationDisplayDate(immunization: PatientImmunization): DisplayDate {
  if (immunization.administration_date) {
    return { date: immunization.administration_date, label: "Administered", explicit: true };
  }

  const documented = await getDocumentedDate(immunization);
  if (documented) {
    return { date: documented, label: "Documented", explicit: false };
  }

  return { date: null, label: "Date unknown", explicit: false };
}
```

---

## Column Audit (Phase 1 Step C)

### Current Database Columns (03_clinical_core.sql lines 868-928)

| Column | Type | Decision | Rationale |
|--------|------|----------|-----------|
| id | UUID | KEEP | Server-generated |
| patient_id | UUID NOT NULL | KEEP | Denormalized for RLS |
| event_id | UUID NOT NULL | KEEP | Links to hub |
| vaccine_name | TEXT NOT NULL | KEEP | AI extracts |
| vaccine_type | TEXT | KEEP | AI extracts if stated |
| manufacturer | TEXT | KEEP | AI extracts if stated |
| lot_number | TEXT | KEEP | AI extracts if stated |
| expiration_date | DATE | KEEP | AI extracts if stated (on vaccine cards) |
| dose_number | INTEGER | KEEP | AI extracts if stated |
| dose_amount | NUMERIC(6,3) | KEEP | AI extracts if stated |
| route_of_administration | TEXT | KEEP | AI extracts if stated |
| anatomical_site | TEXT | KEEP | AI extracts if stated |
| snomed_code | TEXT | **REMOVE** | Move to medical_code_assignments |
| cpt_code | TEXT | **REMOVE** | Move to medical_code_assignments |
| cvx_code | TEXT | **REMOVE** | Move to medical_code_assignments |
| ndc_code | TEXT | **REMOVE** | Move to medical_code_assignments |
| acir_code | TEXT | **REMOVE** | Move to medical_code_assignments |
| pbs_item_code | TEXT | **REMOVE** | Move to medical_code_assignments |
| indication | TEXT | KEEP | AI extracts if stated |
| contraindications | TEXT[] | KEEP | Patient-level context |
| adverse_reactions | TEXT[] | KEEP | AI extracts if stated |
| administered_by | TEXT | KEEP | AI extracts if stated |
| administering_facility | TEXT | KEEP | AI extracts if stated |
| administration_date | TIMESTAMPTZ NOT NULL | **MODIFY** | Make NULLABLE - only if explicit |
| coding_confidence | NUMERIC(4,3) | **REMOVE** | Belongs in medical_code_assignments |
| requires_review | BOOLEAN | **REMOVE** | Legacy, not useful |
| source_shell_file_id | UUID | KEEP | Denormalized for query performance |
| ai_extracted | BOOLEAN | **REMOVE** | Always true, adds no info |
| ai_confidence | NUMERIC(4,3) | **REMOVE** | LLM confidence poorly calibrated |
| clinical_validation_status | TEXT | **REMOVE** | Belongs in manual_review_queue |
| created_at | TIMESTAMPTZ | KEEP | Server-generated |
| updated_at | TIMESTAMPTZ | KEEP | Server-generated |
| archived_at | TIMESTAMPTZ | **REMOVE** | Not using soft deletes |

### Columns to ADD (Migration Required)

| Column | Type | Required | Purpose |
|--------|------|----------|---------|
| source_text_verbatim | TEXT | YES | Raw text from document for display and audit |
| y_anchor_start | INTEGER | YES | Y coordinate of first line (zone approach) |
| y_anchor_end | INTEGER | NO | Y coordinate of last line (only for multi-line entries) |
| verbatim_text_vertices | JSONB | NO | 4 vertices for precise highlight of verbatim text (server-computed) |
| extracted_codes | JSONB | NO | Array of {code, code_system} for codes found IN document |

### Columns to REMOVE (Migration Required)

| Column | Type | Reason |
|--------|------|--------|
| snomed_code | TEXT | Move to medical_code_assignments (Pass 2.5) |
| cpt_code | TEXT | Move to medical_code_assignments (Pass 2.5) |
| cvx_code | TEXT | Move to medical_code_assignments (Pass 2.5) |
| ndc_code | TEXT | Move to medical_code_assignments (Pass 2.5) |
| acir_code | TEXT | Move to medical_code_assignments (Pass 2.5) |
| pbs_item_code | TEXT | Move to medical_code_assignments (Pass 2.5) |
| coding_confidence | NUMERIC(4,3) | Belongs in medical_code_assignments |
| requires_review | BOOLEAN | Legacy, not useful |
| ai_extracted | BOOLEAN | Always true, adds no information |
| ai_confidence | NUMERIC(4,3) | LLM confidence poorly calibrated (23-46%) |
| clinical_validation_status | TEXT | Belongs in manual_review_queue |
| archived_at | TIMESTAMPTZ | Not using soft deletes |

### Columns to MODIFY (Migration Required)

| Column | Current | New | Reason |
|--------|---------|-----|--------|
| administration_date | TIMESTAMPTZ NOT NULL | TIMESTAMPTZ (nullable) | Only populate if explicitly stated in document |

---

## Critical Notes (Strategy-A Updates)

1. **HAS patient_id Column**: This table DOES have `patient_id` (denormalized for RLS performance), consistent with other main spokes.

2. **Composite FK Integrity**: The composite foreign key `(event_id, patient_id)` ensures patient_id consistency with the parent event.

3. **Token Optimization**: AI outputs only clinical content. Server adds all IDs and timestamps.

4. **Two Types of Codes**:
   - **Extracted codes** (Pass 2): Codes found IN document text -> `extracted_codes` JSONB on this table
   - **Assigned codes** (Pass 2.5): Canonical codes for dedupe/temporal -> `medical_code_assignments` table

5. **y_anchor_start Required**: Every immunization needs spatial reference for document click-through. Use `y_anchor_end` for multi-line entries.

6. **source_text_verbatim Required**: Every immunization needs raw text for display and audit trail.

7. **administration_date is NULLABLE**: Only populate if document explicitly states the date. Display logic uses encounter date as fallback.

8. **Index for Performance**: `idx_patient_immunizations_event_id` ensures efficient JOINs.

9. **Adverse Reactions Flagging**: When AI extracts adverse_reactions, server should consider flagging for manual_review_queue (implementation detail).

---

## Schema Validation Checklist (Strategy-A)

- [ ] `source_text_verbatim` is populated (raw text from document)
- [ ] `y_anchor_start` is populated (spatial reference - first line Y coordinate)
- [ ] `y_anchor_end` is populated if multi-line entry (last line Y coordinate)
- [ ] `vaccine_name` is provided
- [ ] `administration_date` (if provided) is valid ISO date - ONLY if explicitly stated
- [ ] `vaccine_type` (if provided) is one of: 'mRNA', 'inactivated', 'live attenuated', 'subunit'
- [ ] `adverse_reactions` (if provided) is an array of strings
- [ ] `extracted_codes` (if provided) is array of {code, code_system} objects
- [ ] `expiration_date` (if provided) is valid ISO date

---

## Database Constraint Notes (Post-Migration)

- **HAS patient_id column**: Denormalized for RLS performance
- **Composite FK constraint**: `(event_id, patient_id)` enforces consistency with parent event
- **FK to parent event**: `event_id` has ON DELETE CASCADE
- **NOT NULL constraints**: patient_id, event_id, vaccine_name (administration_date is NOW NULLABLE)
- **TEXT[] arrays**: contraindications and adverse_reactions
- **JSONB column**: extracted_codes (array of {code, code_system})
- **Index**: `idx_patient_immunizations_event_id` for efficient JOINs
- **REMOVED constraints**: clinical_validation_status CHECK (column removed)
