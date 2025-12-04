# patient_conditions Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** KEEP - Primary clinical spoke table for conditions/diagnoses
**Step A Rationale:** Core spoke table in hub-and-spoke architecture. Pass 2 discovers and extracts medical conditions from documents.
**Step B Sync:** Verified against 03_clinical_core.sql lines 695-748 - MATCHED (with proposed schema changes below)
**Step C Columns:** Complete - See "Pass 2 AI Output Schema" section below
**Last Triage Update:** 2025-12-04 (zone approach + verbatim_text_vertices)
**Original Created:** 1 October 2025 (Migration 08 alignment)

**Database Source:** /current_schema/03_clinical_core.sql (lines 695-748)
**Priority:** HIGH - Medical conditions/diagnoses extraction

---

## Triage Summary

### What Pass 2 AI Outputs (Token-Optimized)

The AI outputs **only clinical content**. Server adds IDs, context references, and timestamps.

```typescript
interface Pass2ConditionOutput {
  // REQUIRED - Clinical content
  condition_name_verbatim: string;     // Verbatim text from document (e.g., "DM2", "?coeliac")
  condition_name_normalized: string;   // AI's proper clinical term (e.g., "Type 2 Diabetes Mellitus")

  // REQUIRED - Spatial reference (zone approach for multi-line entries)
  y_anchor_start: number;              // Y coordinate of first line - required
  y_anchor_end?: number;               // Y coordinate of last line - optional, only for multi-line entries

  // REQUIRED - Diagnosis certainty
  diagnosis_certainty: 'confirmed' | 'suspected';  // Default 'confirmed' unless uncertainty language present

  // OPTIONAL - Extraction context
  extraction_context?: string;         // Where/how mentioned: "Listed in Past Medical History section"

  // OPTIONAL - Clinical details (only if explicitly stated in document)
  severity?: 'mild' | 'moderate' | 'severe' | 'critical';  // ONLY if document states it
  status?: 'active' | 'resolved' | 'inactive' | 'remission' | 'relapse';

  // OPTIONAL - Temporal (only if document states dates)
  onset_date?: string;                 // ISO date - when condition started
  diagnosed_date?: string;             // ISO date - when formally diagnosed
  resolved_date?: string;              // ISO date - when resolved/abated

  // OPTIONAL - Provider info
  diagnosed_by?: string;               // Free text provider name

  // OPTIONAL - Supporting evidence
  diagnosis_evidence?: string;         // Free text: "Confirmed by Hb 8.2 g/dL on 14 April 2025"

  // OPTIONAL - Additional notes
  notes?: string;                      // Any other relevant clinical notes
}
```

### Bounding Box Derivation (Post-Pass 2)

Pass 2 outputs `y_anchor_start` (and optionally `y_anchor_end` for multi-line entries) to minimize tokens. The precise 4-vertex bounding box for the verbatim text is derived post-Pass 2 by a server-side algorithm that:
1. Takes `condition_name_verbatim` + `y_anchor_start` + `y_anchor_end`
2. Searches within that Y-zone in enhanced-xy-OCR data
3. Finds the matching verbatim text span
4. Extracts the 4 vertices (top-left, top-right, bottom-left, bottom-right) from word-level OCR data
5. Stores result in `verbatim_text_vertices` column

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
| `shell_file_id` | From batch context | Source document reference |
| `verbatim_text_vertices` | Post-Pass 2 algorithm | 4 vertices for precise highlight rendering |
| `created_at` | NOW() | Server timestamp |
| `updated_at` | NOW() | Server timestamp |

### Columns NOT Used by Pass 2

| Column | Reason | Future |
|--------|--------|--------|
| `primary_narrative_id` | Pass 3 feature | Narrative generation |
| `ai_confidence` | Research shows LLM confidence poorly calibrated | REMOVE in migration |
| `requires_review` | Meaningless without reliable confidence | REMOVE in migration |
| `confidence_score` | Legacy field, redundant | REMOVE in migration |
| `ai_extracted` | All Pass 2 records are AI-extracted | REMOVE in migration |
| `clinical_context` JSONB | Replaced by `extraction_context` TEXT | REMOVE in migration |

### Medical Codes - Handled by Pass 2.5 Only

Medical codes are **not stored inline** on the conditions table. Pass 2.5 Agentic Waterfall assigns codes and writes to the `medical_code_assignments` table with FK reference to the hub event_id.

**Rationale:**
- Conditions may have multiple codes (ICD-10 + SNOMED)
- Codes are a separate concern from extraction
- Avoids dual source of truth
- `medical_code_assignments` table designed for this purpose

---

## Proposed Schema Changes (Pending Migration)

Based on Phase 1 triage analysis, the following schema changes are recommended:

### ADD Columns

| Column | Type | Purpose |
|--------|------|---------|
| `condition_name_verbatim` | TEXT NOT NULL | Verbatim text from document (audit trail) |
| `y_anchor_start` | INTEGER NOT NULL | Y coordinate of first line (zone approach) |
| `y_anchor_end` | INTEGER | Y coordinate of last line (only for multi-line entries) |
| `verbatim_text_vertices` | JSONB | 4 vertices for precise highlight of verbatim text (server-computed) |
| `diagnosis_certainty` | TEXT NOT NULL DEFAULT 'confirmed' CHECK (diagnosis_certainty IN ('confirmed', 'suspected')) | Whether condition is confirmed or suspected/query |
| `extraction_context` | TEXT | Where/how condition was mentioned in document |
| `diagnosis_evidence` | TEXT | Free text describing what confirmed diagnosis (if stated) |

### RENAME Columns

| Old | New | Reason |
|-----|-----|--------|
| `condition_name` | `condition_name_normalized` | Clarity - this is the AI-normalized term |

### REMOVE Columns

| Column | Reason |
|--------|--------|
| `condition_code` | Use `medical_code_assignments` table only (Pass 2.5) |
| `condition_system` | Use `medical_code_assignments` table only (Pass 2.5) |
| `ai_confidence` | LLM confidence scores are poorly calibrated (23-46% calibration per research) |
| `requires_review` | Meaningless without reliable confidence |
| `confidence_score` | Legacy, redundant |
| `ai_extracted` | Redundant - all Pass 2 records are AI-extracted by definition |
| `clinical_context` JSONB | Replaced by simpler `extraction_context` TEXT |

---

## Diagnosis Certainty

A key field distinguishing confirmed conditions from suspected/query conditions.

### Values

| Value | When to Use | Examples |
|-------|-------------|----------|
| `confirmed` | Condition stated as fact, no uncertainty language | "Type 2 Diabetes", "Hypertension", "Asthma" |
| `suspected` | Any uncertainty qualifier present | "?Coeliac", "Possible PE", "Query bipolar", "Probable ADHD", "Rule out MI" |

### AI Rules for `diagnosis_certainty`

1. **Default is `confirmed`** - most conditions in PMH lists are stated as fact
2. **Use `suspected` if ANY uncertainty language present:**
   - Question mark: "?PE", "?coeliac disease"
   - Possible/probable: "possible pneumonia", "probable migraine"
   - Query: "query lymphoma"
   - Suspected: "suspected appendicitis"
   - Rule out: "rule out MI" (still investigating)
   - Differential: "differential includes..."
   - Likely: "likely viral infection"
3. **If unsure, default to `confirmed`** - err on side of treating as real

### Examples

| Document Text | diagnosis_certainty |
|---------------|---------------------|
| "Type 2 Diabetes" | confirmed |
| "PMH: Hypertension, GORD, Asthma" | confirmed (all three) |
| "?Coeliac disease" | suspected |
| "Possible pulmonary embolism" | suspected |
| "Query bipolar disorder" | suspected |
| "Probable ADHD" | suspected |
| "Rule out MI" | suspected |
| "Metformin for diabetes" | confirmed |
| "Depression" | confirmed |

### Why No "Excluded" Value?

We don't track conditions that were ruled out / excluded. A condition only appears on a patient's profile if they have it (confirmed) or might have it (suspected). "Patient doesn't have PE" is not useful to store.

---

## AI Extraction Rules

### MUST Follow

1. **Verbatim text preservation**: Always capture exact text from document in `condition_name_verbatim`
2. **Normalization**: Provide proper clinical terminology in `condition_name_normalized`
3. **Certainty assessment**: Mark `suspected` if ANY uncertainty language present, otherwise `confirmed`
4. **No inference**: Only extract what is explicitly stated in the document
5. **Severity discipline**: Only populate `severity` if document explicitly states it (e.g., "severe asthma"). Do NOT infer severity.
6. **NULL is valid**: If information is not present, leave field NULL. Frontend displays "Unknown" appropriately.

### Extraction Context Examples

Good `extraction_context` values:
- "Listed in Past Medical History section"
- "Mentioned as reason for Metformin prescription"
- "Documented in Problem List"
- "Referenced in specialist referral letter"
- "Noted in discharge summary diagnoses"

### Diagnosis Evidence Examples

Good `diagnosis_evidence` values (only if stated in document):
- "Confirmed by Hb 8.2 g/dL on 14 April 2025"
- "Diagnosed via cardiac catheterization showing triple vessel disease"
- "Confirmed by positive ANA and clinical presentation"
- NULL (if no supporting evidence mentioned)

---

## Entity Linking Strategy

### Diagnostic Evidence (Handled by Pass 2)

When a document explicitly states what confirmed a diagnosis, capture in `diagnosis_evidence` as free text. This is the "zoomed-in" context for this specific condition.

### Ongoing Monitoring Links (Deferred to Frontend)

Links between conditions and ongoing observations (e.g., HbA1c tracking for diabetes) are NOT captured at extraction time. The frontend can infer these relationships based on:
- Same encounter context
- Temporal proximity
- Clinical logic

This avoids complex cross-entity linking infrastructure and keeps Pass 2 focused on extraction.

### Future Enhancement: Observation-to-Condition Links

If needed later, observations could optionally reference a `related_condition_id` when the document explicitly states the relationship (e.g., "BP taken for hypertension management"). This is a many-to-1 pattern (observations reference conditions, not vice versa).

---

## Conditions vs Pseudo-Conditions

Past medical events (fractured tibia 12 years ago, motor vehicle accident) are handled as conditions with:
- `status: 'resolved'`
- `diagnosis_certainty: 'confirmed'`
- Appropriate `extraction_context` (e.g., "Listed in Past Medical History")

Frontend UX can differentiate display based on status and context. No separate `condition_category` field needed for MVP.

---

## Current Database Table Structure

```sql
-- CURRENT SCHEMA (pending migration changes above)
CREATE TABLE IF NOT EXISTS patient_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE,

    -- Source reference
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    primary_narrative_id UUID REFERENCES clinical_narratives(id) ON DELETE SET NULL, -- Pass 3 feature

    -- Condition details (pending changes: rename condition_name, add condition_name_original, add diagnosis_certainty)
    condition_name TEXT NOT NULL,
    condition_code TEXT,                -- REMOVE: use medical_code_assignments table
    condition_system TEXT CHECK (condition_system IN ('icd10', 'snomed', 'custom')), -- REMOVE: use medical_code_assignments table

    -- Clinical context
    severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe', 'critical')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'resolved', 'inactive', 'remission', 'relapse'
    )),

    -- Temporal information
    onset_date DATE,
    diagnosed_date DATE,
    resolved_date DATE,

    -- Source information
    diagnosed_by TEXT,
    confidence_score NUMERIC(3,2) DEFAULT 1.0, -- REMOVE

    -- V3 AI Processing (REMOVE all)
    ai_extracted BOOLEAN DEFAULT FALSE,        -- REMOVE
    ai_confidence NUMERIC(4,3) CHECK (ai_confidence BETWEEN 0 AND 1), -- REMOVE
    requires_review BOOLEAN DEFAULT FALSE,     -- REMOVE

    -- Clinical notes
    notes TEXT,
    clinical_context JSONB DEFAULT '{}',       -- REMOVE: replace with extraction_context TEXT

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,

    -- Composite FK ensures patient_id consistency
    CONSTRAINT patient_conditions_event_patient_fk FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_patient_conditions_event_id ON patient_conditions(event_id);
```

---

## Example Pass 2 Output

### Example 1: Confirmed Chronic Condition from PMH List

```json
{
  "condition_name_verbatim": "DM2",
  "condition_name_normalized": "Type 2 Diabetes Mellitus",
  "y_anchor_start": 342,
  "diagnosis_certainty": "confirmed",
  "extraction_context": "Listed in Past Medical History section",
  "status": "active",
  "onset_date": "2020-03-15",
  "diagnosed_date": "2020-03-20",
  "diagnosed_by": "Dr. Sarah Johnson"
}
```
**Note:** Single-line entry - only `y_anchor_start` needed.

### Example 2: Suspected Condition (Query)

```json
{
  "condition_name_verbatim": "?coeliac disease",
  "condition_name_normalized": "Coeliac Disease",
  "y_anchor_start": 412,
  "diagnosis_certainty": "suspected",
  "extraction_context": "Listed in Problem List with query marker",
  "status": "active",
  "notes": "Awaiting gastroscopy and biopsy"
}
```
**Note:** Single-line entry - only `y_anchor_start` needed.

### Example 3: New Diagnosis with Evidence

```json
{
  "condition_name_verbatim": "iron deficiency anemia",
  "condition_name_normalized": "Iron Deficiency Anemia",
  "y_anchor_start": 518,
  "diagnosis_certainty": "confirmed",
  "extraction_context": "New diagnosis documented in consultation letter",
  "status": "active",
  "diagnosed_date": "2025-11-28",
  "diagnosed_by": "Dr. Michael Chen, Haematologist",
  "diagnosis_evidence": "Confirmed by Hb 8.2 g/dL and ferritin 12 ng/mL on 25 November 2025",
  "notes": "Referred for iron infusion therapy"
}
```
**Note:** Single-line entry - only `y_anchor_start` needed.

### Example 4: Resolved Past Medical Event

```json
{
  "condition_name_verbatim": "fractured left tibia 2012",
  "condition_name_normalized": "Left Tibial Fracture",
  "y_anchor_start": 156,
  "diagnosis_certainty": "confirmed",
  "extraction_context": "Listed in Past Medical History section",
  "status": "resolved",
  "onset_date": "2012-06-01",
  "resolved_date": "2012-09-01"
}
```
**Note:** Single-line entry - only `y_anchor_start` needed.

### Example 5: Condition with Explicit Severity

```json
{
  "condition_name_verbatim": "severe persistent asthma",
  "condition_name_normalized": "Severe Persistent Asthma",
  "y_anchor_start": 234,
  "diagnosis_certainty": "confirmed",
  "extraction_context": "Documented in Problem List",
  "severity": "severe",
  "status": "active",
  "diagnosed_date": "2018-04-10",
  "diagnosed_by": "Dr. Rebecca Wong, Respiratory Physician"
}
```
**Note:** Single-line entry - only `y_anchor_start` needed.

### Example 6: Suspected Condition from Differential

```json
{
  "condition_name_verbatim": "possible pulmonary embolism",
  "condition_name_normalized": "Pulmonary Embolism",
  "y_anchor_start": 678,
  "diagnosis_certainty": "suspected",
  "extraction_context": "Listed in differential diagnosis in ED assessment",
  "status": "active",
  "notes": "CTPA ordered"
}
```
**Note:** Single-line entry - only `y_anchor_start` needed.

### Example 7: Multi-Line Condition Entry (Zone Approach)
**Source text (spans 2 lines):**
```
Type 2 Diabetes Mellitus with peripheral neuropathy
- Diet controlled, last HbA1c 6.8%
```

```json
{
  "condition_name_verbatim": "Type 2 Diabetes Mellitus with peripheral neuropathy",
  "condition_name_normalized": "Type 2 Diabetes Mellitus with Diabetic Peripheral Neuropathy",
  "y_anchor_start": 245,
  "y_anchor_end": 267,
  "diagnosis_certainty": "confirmed",
  "extraction_context": "Documented in Problem List with management notes",
  "status": "active",
  "notes": "Diet controlled, last HbA1c 6.8%"
}
```
**Note:** Multi-line entry - uses both `y_anchor_start` (first line at Y=245) and `y_anchor_end` (last line at Y=267). Server computes `verbatim_text_vertices` to highlight just "Type 2 Diabetes Mellitus with peripheral neuropathy" within this zone.

---

## Severity Values

Only extract if **explicitly stated** in document:

- **mild**: "mild allergic reaction", "mild asthma"
- **moderate**: "moderate depression", "moderate COPD"
- **severe**: "severe persistent asthma", "severe anemia"
- **critical**: "critical aortic stenosis"

If severity not stated, leave NULL. Do NOT infer.

---

## Status Values

- **active**: Currently ongoing condition
- **resolved**: Condition fully resolved (includes past medical events)
- **inactive**: Not currently symptomatic but not fully resolved
- **remission**: Temporary improvement of chronic condition
- **relapse**: Return of previously resolved/remission condition

Default is 'active' if not specified.

**Note:** `status` captures clinical state. `diagnosis_certainty` captures documentary certainty. They are orthogonal - a condition can be `suspected` + `active` (possible current PE) or `confirmed` + `resolved` (past fracture).

---

## Date Field Guidance

| Field | Meaning | Example | If Unknown |
|-------|---------|---------|------------|
| `onset_date` | When symptoms/condition started | "Migraines started June 2025" | NULL |
| `diagnosed_date` | When formally diagnosed | "Diagnosed with migraine August 2025" | NULL |
| `resolved_date` | When condition resolved/abated | "Bronchitis resolved September 2025" | NULL |

**Encounter date** is inherited context (from hub record), not stored on this table. Frontend displays "Added to health profile on [encounter_date]" separately.

---

## Database Constraint Notes

- **Composite FK constraint**: `(event_id, patient_id)` ensures patient_id consistency with parent hub record
- **Hub dependency**: `event_id` is NOT NULL - every condition must have a parent clinical event
- **Source tracking**: `shell_file_id` is NOT NULL - every condition must reference its source document
- **Status default**: 'active' if not specified
- **Diagnosis certainty default**: 'confirmed' if not specified
- **Severity CHECK**: 4 values enforced by database
- **Status CHECK**: 5 values enforced by database
- **Diagnosis certainty CHECK**: 2 values enforced by database

---

## Schema Validation Checklist (Pass 2 Output)

- [ ] `condition_name_verbatim` is provided (verbatim from document)
- [ ] `condition_name_normalized` is provided (proper clinical term)
- [ ] `y_anchor_start` is provided (spatial reference - first line Y coordinate)
- [ ] `y_anchor_end` is provided if multi-line entry (last line Y coordinate)
- [ ] `diagnosis_certainty` is 'confirmed' or 'suspected'
- [ ] `severity` (if provided) is explicitly stated in document, not inferred
- [ ] `status` is one of: 'active', 'resolved', 'inactive', 'remission', 'relapse'
- [ ] All date fields (if provided) are valid ISO 8601 DATE format
- [ ] `extraction_context` describes where/how condition was mentioned

## Schema Validation Checklist (Server Post-Processing)

- [ ] `verbatim_text_vertices` is computed from OCR data using `condition_name_verbatim` + zone coordinates

---

## Related Documentation

- **Hub table**: `patient_clinical_events` bridge schema
- **Medical codes**: Handled by Pass 2.5 Agentic Waterfall via `medical_code_assignments` table
- **Narrative linking**: Pass 3 feature
- **O3 classification**: Activity type 'observation' or 'intervention' determined at hub level
- **Bounding box derivation**: Post-Pass 2 function computes `verbatim_text_vertices` from zone + verbatim text + OCR data

---

Xavier's Notes on condition clinical entity extraction - 3rd December 2025
1. Verbatim text vs proper formal name
  - AI should output the verbatim text of the condition clinical entity it is extracting (stored in `condition_name_verbatim`), as well as provide what it believes to be the proper name of the condition (stored in `condition_name_normalized`).
2. Clinical context
  - would be useful, and i imagine this being: 'extracted from past medical history list of conditions' or 'mentioned as patietn condition within doctors letter' or 'listed as reason for why patietn is taking metformin' etc - I guess we have to wonder and imagine the condition showing up on the patients dashbaord in their condition list and when you click on it you want some immediate info as to the context of how it has ended up on this list; you would see the encounter info summary from which the condition resided, then you would see the more indepth clincial context that is int he actual conditions table for this extracted clinical entity. As every clincial entity will have its own 'zoomed in' clinical context as well as the 'zoomed out' encoutner context.
3. Condition date information:
  - The types of 'dates' that could be applied to a conditiona are;
      - Onset date
        - Is the same as diagnosed? I feel like diagnosed is too specific, but onset covers more bases. But diagnosed woudl be good to have too as they can mean different things, as diagnossi has an official verified aspect to it. E.g., migraine onset was June 2025 but the daignosis of migraine was made August 2025
        - if onset date is not mentioned anywhere it should be left NULL by the AI And that 'null' information should propogate up tot he front end as 'onset date unknown'
      - Diagnosis date
        - if diagnosis date is not mentioned it should be left NULL by the AI. And that 'null' information should propogate up tot he front end as 'diagnosis date unknown'
      - encounter date data (inherited)
        - encounter date, file metadata date, file upload date, in that order or priortiy.
        - Each condition (and every clinical entity for that matter) will automatically inherit (or have the option of inheriting) the date of the encounter within which it resides - this is the zoomed out info.
  - each of those three date types should be attached to the condition for ultimate condition date context, where the encounter date data is specified as 'added to health profile on', where as the other two are more literally onset and diagnosis date.
3. diagnosis context
      - ? if the uplaoded file / encounter is the oriignal source of a new diagnosis, then we definitly should be capturing that information somehow
      - but how far do we go in terms of information, and wont that ifnormation be stored elesewhere a lot of the time int eh form of other clincial entities? For example, hb lab test result confirms diagnosis of anemia and that is crucial to the condition context and a doctor would want to know that ifnormation.
      - So we need a systme to link clinical entities between types such as the anemia and hb test result
      - But how? Can the AI do thi? And how would it? We would need to give it the tools/instructions to link clincial entities that it is extracting. my first thoguhts are that it would need to apply codes to the entities it is extracting and then link those codes via a relationship link column
      - We may need to be speciific in that we just state that for a condition diagnosis seciton, the AI has the option of inserting the 'observation' (from the observation table) clincial entity that led to the diagnosis.
      - So does that mean instead of a vague 'diagnosis context' section we be more specific and say something like 'diagnosis cause' or 'reason for diagnosis' . and if the ai cant see any data it just leaves it null. But if it there is some information it adds it as free text such as "diagnostic lab test result, hb XXX on 14th April 2025). and then we have a nother column for Diagnosis observation link ID: and the AI can inoput the observation clincial entity ID (providing we get the AI to assign made up ID to each clincial enttiy such as e21, whcih is later replaced by our system as a formal proper long ID).
4. We want to know who diagnosed it, so this would likely be free text; Dr so and so.
5. temporal status information:
  - we want to know start date info (onset and diagnosis info) but we also will need to have end date info columns, such as resolved date (able to be NULL)
6. Conditions vs pseudo conditions
  - there are typical conditions such as diabetes, migraine, anemia, but then there are psuedo like conditions that arent really conditions but rather past medical history events such as a fractured tibia 12 years ago, or a motor vehicle accident in the past - so im wondering hwo we deal with these? I guess they would by default be given the status of 'resolved' and then we can do what we like with them on the frontend for UX. But Is it okay if this is the only way we differentiate these types of pseudo condition which are more closely described as past medical events? Any ideas? Any other of these interesting edge case scenarios you can think of?
7. Severity:
  - Wont be needed that often, but for certain conditions it would be good to have severity information. But Im worried that the AI is goign to make its own clincial jusdgemnet and severity assertion (which it definitly shouldnt do). Or that it will just make up shit to fill it.
8. Condition additional information:
  - We need a way for the AI to output crucial additional information about the condition if it is presented alongisde the condition. Maybe that just goes into the clinical context column thats already been mentioned.
  - BUT, is the additional ifnirmation going to be covered and documented by the observational table of clinical entities and the interventional table of clinical entities? And if so, how will this info show up to be displayed alognside/under the condition when a user or provider digs deeper on the frontend UX. Just like with a inter-linking between diagnostic lab test entity and the diagnosed contiion entity iteself, the obs and interventions direclty related to that condition could link to a condition to which they are relevant to...? Or should we have it the other way round, where the condition has a link ot observation entity ID's and intervention entity IDs? It sounds like a 1 to many situation where we either have all the 'many' referencing the one condition id or we have the one condition id referecning ALL the many obs and int IDs....?
  - I think there are actually two requirement feature here that we need to split:
    - There is the condition diagnosis related information: observation entities that need to be linked in to the condition as they are evidence of the new diagnosis (such as the lab test that was diagnostic, or the diagnostic obs signs and symptoms) - maybe these should only be filled out if the condition is truly beeing diagnosed by that uplaoded file.
    - And there is the ongoing obs and intervention entities that are tracked and monitored and performed ongoing for that diagnosis, and these would be more fitting to be linked in the many to one direction (if the ai detects this to be the case) - eg every time a BP is recored and mentioned that its beeing taken for management of the patients hypertnesion, it is linked to the condition of hypertension. Every time hba1c, glucose, is recorded it is linked to diabetes condition (if the uploaded file states that that is what the tests are for - teh AI should never be deducing, only extracting clincial entities adn additional information that is stated as a link)
    - The front end can link up obs in support of conditions on the UX, so we dont need to (and we shouldnt) get the AI to determine these links out of thin air unless the uploaded file is stating the relationship specificlly.
9. Get rid of confidence scores all together, i dont think theres any research supporting their use or accuracy / benefit. And Hence does that mean by default we also get rid of 'requires_review' too?
