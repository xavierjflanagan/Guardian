# patient_allergies Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** KEEP - Primary clinical spoke table for allergies/adverse reactions
**Step A Rationale:** Core spoke table in hub-and-spoke architecture. Safety-critical data that Pass 2 discovers and extracts.
**Step B Sync:** Verified against 03_clinical_core.sql lines 750-805 - MATCHED (with proposed schema changes below)
**Step C Columns:** Complete - See "Pass 2 AI Output Schema" section below
**Step D Temporal:** POINT-IN-TIME - Each allergy record is a document extraction snapshot
**Last Triage Update:** 2025-12-04
**Original Created:** 1 October 2025 (Migration 08 alignment)

**Database Source:** /current_schema/03_clinical_core.sql (lines 750-805)
**Priority:** CRITICAL - Safety-critical allergy and adverse reaction tracking

---

## Triage Summary

### What Pass 2 AI Outputs (Token-Optimized)

The AI outputs **only clinical content**. Server adds IDs, context references, and timestamps.

```typescript
interface Pass2AllergyOutput {
  // REQUIRED - Allergen identification
  source_text_verbatim: string;         // Full verbatim line from document (e.g., "PCN allergy - anaphylaxis 2019")
  allergen_name: string;                // Clean allergen name only, normalized spelling (e.g., "Penicillin")

  // REQUIRED - Spatial reference
  y_anchor_start: number;               // Y coordinate of first line - required
  y_anchor_end?: number;                // Y coordinate of last line - optional, only for multi-line entries

  // OPTIONAL - Allergen classification (only if document indicates)
  allergen_type?: 'medication' | 'food' | 'environmental' | 'contact' | 'other';

  // OPTIONAL - Reaction details (only if stated in document)
  reaction_type?: 'allergic' | 'intolerance' | 'adverse_effect' | 'unknown';
  severity?: 'mild' | 'moderate' | 'severe' | 'life_threatening';
  reaction_description?: string;        // Free text description of reaction
  symptoms?: string[];                  // Array of specific symptoms
  onset_description?: string;           // "immediate", "delayed", "within 30 minutes"

  // OPTIONAL - Anaphylaxis history (CRITICAL - only if explicitly stated)
  anaphylaxis_history?: boolean;        // TRUE only if document explicitly mentions anaphylaxis/anaphylactic reaction

  // OPTIONAL - Temporal context (only if explicitly stated in document)
  onset_date?: string;                  // ISO date - when allergy first identified/occurred (year-only OK: "2019" -> "2019-01-01")
  last_reaction_date?: string;          // ISO date - most recent known reaction (clinically critical for risk assessment)
  last_reaction_description?: string;   // What happened in most recent reaction (e.g., "Accidentally ate peanut butter, hives and throat swelling")

  // OPTIONAL - Verification info (if documented)
  verified_by?: string;                 // Provider who verified
  verified_date?: string;               // ISO date

  // OPTIONAL - Status (only if document indicates)
  status?: 'active' | 'inactive' | 'resolved' | 'entered_in_error';

  // OPTIONAL - Extraction context
  extraction_context?: string;          // Where/how mentioned: "Listed in Allergies section"

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

### Columns NOT Used by Pass 2

| Column | Reason | Future |
|--------|--------|--------|
| `allergen_code` | Medical codes via Pass 2.5 only | REMOVE in migration |
| `ai_confidence` | Research shows LLM confidence poorly calibrated (23-46%) | REMOVE in migration |
| `requires_review` | Meaningless without reliable confidence | REMOVE in migration |
| `confidence_score` | Legacy field, redundant | REMOVE in migration |
| `ai_extracted` | All Pass 2 records are AI-extracted | REMOVE in migration |

### Medical Codes - Handled by Pass 2.5 Only

Medical codes are **not stored inline** on the allergies table. Pass 2.5 Agentic Waterfall assigns codes and writes to the `medical_code_assignments` table with FK reference to the hub event_id.

**Rationale:**
- Allergens may have multiple codes (RxNorm + UNII)
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
| `anaphylaxis_history` | BOOLEAN | NO | TRUE only if document explicitly states anaphylaxis history |
| `onset_date` | DATE | NO | When allergy first identified/occurred (year-only allowed: store as YYYY-01-01) |
| `last_reaction_date` | DATE | NO | Most recent known reaction - clinically critical for risk assessment |
| `last_reaction_description` | TEXT | NO | What happened in most recent reaction (distinct from general reaction_description) |
| `extraction_context` | TEXT | NO | Where/how mentioned in document |
| `notes` | TEXT | NO | Additional clinical notes (if not already present) |

### Columns to RENAME

*No columns to rename.* The existing `allergen_name` column is kept as-is (clean allergen name only, normalized spelling).

### Columns to REMOVE

| Column | Type | Reason |
|--------|------|--------|
| `allergen_code` | TEXT | Pass 2.5 only via medical_code_assignments |
| `ai_confidence` | NUMERIC(4,3) | LLM confidence poorly calibrated |
| `requires_review` | BOOLEAN | Meaningless without reliable confidence |
| `confidence_score` | NUMERIC(3,2) | Legacy, redundant |
| `ai_extracted` | BOOLEAN | All Pass 2 records are AI-extracted |

---

## Enum Values

### Allergen Type (5 values)

| Value | Description | Example |
|-------|-------------|---------|
| `medication` | Drug or medication allergy | Penicillin, Sulfa drugs |
| `food` | Food allergy | Peanuts, Shellfish, Eggs |
| `environmental` | Environmental allergens | Pollen, Dust mites, Mold |
| `contact` | Contact allergens | Latex, Nickel, Certain soaps |
| `other` | Other allergens | Bee stings, Contrast dye |

### Reaction Type (4 values)

| Value | Description | When to Use |
|-------|-------------|-------------|
| `allergic` | True allergic reaction (IgE-mediated) | Anaphylaxis, hives, angioedema |
| `intolerance` | Non-allergic intolerance | Lactose intolerance, drug intolerance |
| `adverse_effect` | Adverse drug effect | Side effects (nausea from medication) |
| `unknown` | Unknown mechanism | When reaction type is unclear |

### Severity (4 values)

| Value | Description | Clinical Implication |
|-------|-------------|---------------------|
| `mild` | Minor symptoms | No intervention needed |
| `moderate` | Noticeable symptoms | May require treatment |
| `severe` | Significant symptoms | Requires treatment |
| `life_threatening` | Anaphylaxis risk | Emergency intervention required |

### Status (4 values)

| Value | Description | When to Use |
|-------|-------------|-------------|
| `active` | Current known allergy | Default for most allergies |
| `inactive` | Previously reactive, no longer | Tolerance developed |
| `resolved` | Allergy resolved over time | Often childhood allergies |
| `entered_in_error` | Incorrectly recorded | Data correction |

---

## Example Extractions

### Example 1: Medication Allergy (Simple)
Document text: "Allergies: Penicillin"

```json
{
  "source_text_verbatim": "Allergies: Penicillin",
  "allergen_name": "Penicillin",
  "y_anchor_start": 145.2,
  "allergen_type": "medication",
  "extraction_context": "Allergies section header"
}
```

### Example 2: Medication Allergy with Anaphylaxis History
Document text: "ALLERGIES: PCN - anaphylaxis, severe"

```json
{
  "source_text_verbatim": "ALLERGIES: PCN - anaphylaxis, severe",
  "allergen_name": "Penicillin",
  "y_anchor_start": 203.8,
  "allergen_type": "medication",
  "reaction_type": "allergic",
  "severity": "life_threatening",
  "anaphylaxis_history": true,
  "reaction_description": "Anaphylaxis",
  "onset_description": "immediate",
  "status": "active",
  "extraction_context": "Allergies section"
}
```

**Note:** `anaphylaxis_history` is set to `true` because the document explicitly mentions "anaphylaxis". This is the critical flag clinicians look for when assessing allergy severity and making prescribing decisions.

### Example 3: Food Allergy with Symptoms (No Anaphylaxis Mentioned)
Document text: "Peanut allergy - hives, facial swelling, difficulty breathing"

```json
{
  "source_text_verbatim": "Peanut allergy - hives, facial swelling, difficulty breathing",
  "allergen_name": "Peanuts",
  "y_anchor_start": 312.5,
  "allergen_type": "food",
  "reaction_type": "allergic",
  "severity": "severe",
  "symptoms": ["hives", "facial swelling", "difficulty breathing"],
  "status": "active",
  "extraction_context": "Patient history section"
}
```

**Note:** Even though symptoms suggest potential anaphylaxis, `anaphylaxis_history` is NOT set because the document doesn't explicitly use the word "anaphylaxis". We extract only what is stated, not what is implied.

### Example 4: Drug Intolerance (Not True Allergy)
Document text: "Metformin intolerance - GI upset"

```json
{
  "source_text_verbatim": "Metformin intolerance - GI upset",
  "allergen_name": "Metformin",
  "y_anchor_start": 456.9,
  "allergen_type": "medication",
  "reaction_type": "intolerance",
  "severity": "mild",
  "reaction_description": "Gastrointestinal upset",
  "status": "active",
  "extraction_context": "Drug intolerances list"
}
```

### Example 5: Environmental Allergy
Document text: "Seasonal allergies - hay fever, requires antihistamines during spring"

```json
{
  "source_text_verbatim": "Seasonal allergies - hay fever, requires antihistamines during spring",
  "allergen_name": "Seasonal Pollen",
  "y_anchor_start": 578.3,
  "allergen_type": "environmental",
  "reaction_type": "allergic",
  "severity": "mild",
  "symptoms": ["rhinitis", "watery eyes", "sneezing"],
  "notes": "Requires antihistamines during spring",
  "extraction_context": "Medical history section"
}
```

### Example 6: Contact Allergy
Document text: "Latex allergy - contact dermatitis"

```json
{
  "source_text_verbatim": "Latex allergy - contact dermatitis",
  "allergen_name": "Latex",
  "y_anchor_start": 623.1,
  "allergen_type": "contact",
  "reaction_type": "allergic",
  "severity": "moderate",
  "reaction_description": "Contact dermatitis",
  "status": "active",
  "extraction_context": "Allergies list"
}
```

### Example 7: NKDA (No Known Drug Allergies)
Document text: "Allergies: NKDA"

**Note:** Pass 2 should NOT create an allergy record for NKDA. This is absence of data, not presence of an allergy. The frontend/UI should handle the display of "No Known Drug Allergies" separately.

### Example 8: Anaphylaxis with Temporal Context
Document text: "Bee sting allergy - anaphylactic shock 2021, required EpiPen"

```json
{
  "source_text_verbatim": "Bee sting allergy - anaphylactic shock 2021, required EpiPen",
  "allergen_name": "Bee venom",
  "y_anchor_start": 712.4,
  "allergen_type": "other",
  "reaction_type": "allergic",
  "severity": "life_threatening",
  "anaphylaxis_history": true,
  "last_reaction_date": "2021-01-01",
  "last_reaction_description": "Anaphylactic shock requiring EpiPen",
  "status": "active",
  "extraction_context": "Allergies section"
}
```

**Note:** `anaphylaxis_history` is triggered by: "anaphylaxis", "anaphylactic", "anaphylactic shock", "required epinephrine/EpiPen/adrenaline". The `last_reaction_date` is set to "2021-01-01" (year-only precision) because document states "2021".

### Example 9: Food Allergy with Full Temporal History
Document text: "Peanut allergy since childhood (first reaction age 3, 1995). Last reaction 2022 - accidentally ate peanut butter sandwich, severe hives and throat swelling within minutes."

```json
{
  "source_text_verbatim": "Peanut allergy since childhood (first reaction age 3, 1995). Last reaction 2022 - accidentally ate peanut butter sandwich, severe hives and throat swelling within minutes.",
  "allergen_name": "Peanuts",
  "y_anchor_start": 834.2,
  "y_anchor_end": 856.8,
  "allergen_type": "food",
  "reaction_type": "allergic",
  "severity": "severe",
  "symptoms": ["hives", "throat swelling"],
  "onset_description": "immediate",
  "onset_date": "1995-01-01",
  "last_reaction_date": "2022-01-01",
  "last_reaction_description": "Accidentally ate peanut butter sandwich, severe hives and throat swelling within minutes",
  "status": "active",
  "extraction_context": "Medical history section"
}
```

**Note:** This example demonstrates the full temporal context:
- `onset_date`: When allergy was first identified (1995, childhood)
- `last_reaction_date`: Most recent reaction (2022) - confirms allergy is still active
- `last_reaction_description`: Specific details of most recent event - clinically valuable for risk assessment

The 2022 last reaction date tells clinicians this is a **currently active** allergy, not a historical childhood allergy that may have resolved.

### Example 10: Childhood Allergy with No Recent Reactions
Document text: "Penicillin allergy - rash as a child (1985), no known reactions since"

```json
{
  "source_text_verbatim": "Penicillin allergy - rash as a child (1985), no known reactions since",
  "allergen_name": "Penicillin",
  "y_anchor_start": 912.5,
  "allergen_type": "medication",
  "reaction_type": "allergic",
  "severity": "mild",
  "reaction_description": "Rash",
  "onset_date": "1985-01-01",
  "last_reaction_date": "1985-01-01",
  "notes": "No known reactions since childhood",
  "status": "active",
  "extraction_context": "Allergies section"
}
```

**Note:** `last_reaction_date` matching `onset_date` (1985) with note "no known reactions since" tells clinicians this allergy hasn't been triggered in ~40 years. This context is valuable for clinical decision-making - a clinician might consider formal allergy testing if penicillin is clinically needed.

---

## Database Constraint Notes

- **Composite FK constraint**: `(event_id, patient_id) -> patient_clinical_events(id, patient_id)` enforces patient_id consistency with parent event
- **FK to parent event**: `event_id` has ON DELETE CASCADE
- **allergen_type CHECK constraint**: Database enforces 5 specific values
- **reaction_type CHECK constraint**: Database enforces 4 specific values
- **severity CHECK constraint**: Database enforces 4 specific values
- **status CHECK constraint**: Database enforces 4 specific values with default 'active'
- **NOT NULL constraints**: patient_id, event_id, allergen_name, status (with default)
- **TEXT[] array**: symptoms is PostgreSQL array type
- **Optional shell_file reference**: source_shell_file_id is optional FK (can be NULL)
- **Index optimization**: `idx_patient_allergies_event_id` ensures efficient JOINs to parent events

---

## Notes

- **Allergen name handling**: `source_text_verbatim` stores full verbatim line (for audit/traceability), `allergen_name` stores clean allergen name only with normalized spelling (for clinical grouping/searching)
- **Y-anchor zone**: Use `y_anchor_start` for single-line entries. Add `y_anchor_end` for multi-line allergy entries to capture the full block for click-through.
- **Abbreviation expansion**: AI should expand common abbreviations (PCN -> Penicillin, ASA -> Aspirin)
- **NKDA handling**: "No Known Drug Allergies" does NOT create a record - it's absence of data
- **Severity inference**: If document says "severe allergy" or "anaphylaxis", set severity appropriately
- **Anaphylaxis history**: Set `anaphylaxis_history: true` ONLY when document explicitly mentions: "anaphylaxis", "anaphylactic reaction", "anaphylactic shock", "required epinephrine/EpiPen/adrenaline". Do NOT infer from symptoms alone.
- **Temporal fields - extraction rules**:
  - `onset_date`: Only populate if document explicitly states when allergy was first identified (e.g., "since 1995", "since childhood"). Year-only precision allowed - store as YYYY-01-01.
  - `last_reaction_date`: Only populate if document explicitly states most recent reaction date. This is **clinically critical** - tells clinicians if allergy is still active or historical.
  - `last_reaction_description`: Specific details of the most recent reaction event. Different from `reaction_description` which is the typical/general reaction pattern.
  - **Year-only display**: Frontend should display year-only dates appropriately (e.g., "2019" not "January 1, 2019").
- **reaction_description vs last_reaction_description**: `reaction_description` is the typical reaction pattern (e.g., "hives, swelling"). `last_reaction_description` is what happened in the most recent specific incident (e.g., "Accidentally ate peanut butter sandwich, hives and throat swelling within minutes").
- **Cross-reactivity**: Notes field can capture cross-reactivity information (e.g., "Also avoid cephalosporins")
- **Safety-critical**: Allergy data is safety-critical - frontend should prominently display life_threatening allergies and anaphylaxis_history = true
