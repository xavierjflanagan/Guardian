# 01 - Medical Code Assignment Architecture

**Created:** 2025-12-02
**Status:** Design
**Owner:** Xavier
**Related:** Pass 2.5 (Post-Pass 2 Medical Code Assignment)

---

## Overview

Medical code assignment occurs **after Pass 2** in a dedicated **Pass 2.5** module. Pass 2 focuses purely on clinical entity extraction and enrichment, outputting entities with vacant medical codes. Pass 2.5 then assigns codes using an **Agentic Waterfall Decision Process**.

### Why Post-Pass 2?

The original design had Pass 1/1.5 prepare medical code shortlists before Pass 2. This approach had problems:
- **Token bloat**: Shortlists explode Pass 2 input token volumes
- **Accuracy risk**: Shortlist might not contain the correct code
- **Wasted work**: Many entities may match existing patient codes (no shortlist needed)

By moving code assignment to after Pass 2, we:
- Keep Pass 2 focused on extraction (simpler, more accurate)
- Use Pass 2's enriched output (aliases, context) for better matching
- Only hit expensive universal library when cheaper tiers fail

---

## The Agentic Waterfall Decision Process

Pass 2.5 assigns medical codes via a **3-tier waterfall** where an AI model acts as a **judge** at each tier. The AI doesn't just accept similarity scores - it applies clinical reasoning to accept or reject candidates.

```
Pass 2 Output: Enriched clinical entity (no medical code)
        |
        v
+------------------+
|   TIER 1         |  Patient's existing codes
|   PRIMARY        |  (cheapest, most relevant)
+------------------+
        |
   AI: "Match?" -- YES --> Assign existing code, DONE
        |
        NO
        v
+------------------+
|   TIER 2         |  Exora Internal Cache
|   SECONDARY      |  (curated, graduated codes)
+------------------+
        |
   AI: "Match?" -- YES --> Assign cached code, DONE
        |
        NO
        v
+------------------+
|   TIER 3         |  Universal Medical Codes
|   TERTIARY       |  (SNOMED, RxNorm, LOINC)
+------------------+
        |
   AI: "Match?" -- YES --> Assign code, GRADUATE to cache, DONE
        |
        NO
        v
+------------------+
|   FALLBACK       |  AI creates Exora-originated code
|   EXORA CODE     |  (flagged for review)
+------------------+
```

---

## Tier Details

### Tier 1: Primary (Patient History Match)

**Purpose:** Check if this entity matches something already in the patient's record.

**Input to AI:**
- The enriched entity from Pass 2 (original text, aliases, context)
- ALL existing medical codes of that entity subtype for this patient

**Example:**
```
Entity: "High Blood Pressure" (condition)
Patient's existing conditions:
  - Hypertension (SNOMED:38341003)
  - Type 2 Diabetes (SNOMED:44054006)
  - Asthma (SNOMED:195967001)

AI Decision: "High Blood Pressure matches Hypertension. Use SNOMED:38341003."
```

**Why Primary First:**
- Preserves timeline continuity (same code across encounters)
- Cheapest tier (patient history is small)
- Most clinically relevant (it's the same patient)

**If No Match:** AI explicitly says "No match in patient history" and proceeds to Tier 2.

---

### Tier 2: Secondary (Exora Internal Cache Match)

**Purpose:** Check against Exora's curated internal library of "graduated" codes - codes that have been used before across any patient.

**Preparation:**
- Vector search (lexical + semantic) against graduated codes
- Filter by entity subtype
- Return top ~10 candidates

**Input to AI:**
- The enriched entity from Pass 2
- Top 10 shortlisted candidates from internal cache

**Example:**
```
Entity: "Essential HTN" (condition)
Shortlisted candidates:
  1. Essential Hypertension (SNOMED:59621000) - similarity: 0.94
  2. Hypertensive disorder (SNOMED:38341003) - similarity: 0.89
  3. Hypotension (SNOMED:45007003) - similarity: 0.85
  ...

AI Decision: "Essential HTN matches Essential Hypertension. Use SNOMED:59621000."
```

**Why AI Judge Matters Here:**
- Vector search gave "Hypotension" a high score (similar spelling)
- AI knows Hypotension is the **opposite** of Hypertension
- Clinical reasoning prevents dangerous mismatches

**If No Match:** AI says "No suitable match in internal cache" and proceeds to Tier 3.

---

### Tier 3: Tertiary (Universal Library Discovery)

**Purpose:** Search the full universal medical code libraries (SNOMED, RxNorm, LOINC) for the best match.

**Preparation:**
- Vector search against `universal_medical_codes` table
- Filter by entity subtype and code source
- Return top ~20 candidates

**Input to AI:**
- The enriched entity from Pass 2
- Top 20 shortlisted candidates from universal library

**AI Task:** Select the most accurate standard code from the candidates.

**Post-Selection Action:**
- Assign the selected code to the entity
- **Graduate the code** to the internal cache (mark `is_exora_cached = true`)
- This ensures future entities matching this code hit Tier 2 instead

**The "Discovery Tax":**
- First patient with a novel condition pays the Tier 3 cost
- All subsequent patients match in Tier 2 (cheaper, faster)
- Over time, Tier 3 usage decreases as the cache grows

---

### Fallback: Exora-Originated Codes

**Purpose:** Handle cases where the AI cannot find an acceptable match in any tier.

**When This Happens:**
- Unusual conditions not yet in standard libraries
- Region-specific medications not in RxNorm
- Compound/combination entities that don't map cleanly
- Typos or non-standard terminology in source documents

**AI Action:**
- Create a new code with source `exora`
- Assign a unique identifier (e.g., `EXORA:000001`)
- Include AI's reasoning for why no standard code matched
- Flag for potential human review

**Future Reconciliation:**
- When standard libraries update, Exora codes can be reviewed
- If a matching standard code is added, Exora code can be deprecated and linked

---

## Entity Subtype Batching

Pass 2.5 processes entities in **batches by subtype**:

| Subtype | Examples |
|---------|----------|
| condition | Hypertension, Diabetes, Asthma |
| medication | Metformin, Lisinopril, Aspirin |
| procedure | Blood draw, X-ray, Surgery |
| lab_result | HbA1c, Creatinine, TSH |
| vital_sign | Blood pressure, Heart rate, Temperature |
| allergy | Penicillin, Peanuts, Latex |

**Why Batch by Subtype:**
1. **Tier 1** needs all existing codes of that subtype for the patient
2. **Tier 2 & 3** filter the code library by subtype before vector search
3. Reduces search space and improves match quality

---

## Database Schema

### Universal Medical Codes Table

The existing `universal_medical_codes` table is extended with graduation tracking:

```sql
ALTER TABLE universal_medical_codes ADD COLUMN IF NOT EXISTS
  is_exora_cached BOOLEAN DEFAULT false;

ALTER TABLE universal_medical_codes ADD COLUMN IF NOT EXISTS
  first_cached_at TIMESTAMPTZ;

ALTER TABLE universal_medical_codes ADD COLUMN IF NOT EXISTS
  cache_usage_count INTEGER DEFAULT 0;

ALTER TABLE universal_medical_codes ADD COLUMN IF NOT EXISTS
  code_source TEXT NOT NULL DEFAULT 'snomed';
  -- Values: 'snomed', 'rxnorm', 'loinc', 'exora'

-- Index for Tier 2 queries
CREATE INDEX IF NOT EXISTS idx_universal_codes_cached
  ON universal_medical_codes (entity_type, is_exora_cached)
  WHERE is_exora_cached = true;
```

### Column Definitions

| Column | Type | Purpose |
|--------|------|---------|
| `is_exora_cached` | boolean | Whether this code has "graduated" to the internal cache |
| `first_cached_at` | timestamp | When this code was first used/graduated |
| `cache_usage_count` | integer | How many times this code has been matched (analytics + AI context) |
| `code_source` | text | Origin: 'snomed', 'rxnorm', 'loinc', or 'exora' |

### Using cache_usage_count as AI Context

The `cache_usage_count` column tracks how often a code has been matched. This can be provided to the AI as **contextual metadata** (not as a ranking signal).

**How to use it:**
- Include in candidate data sent to AI: "This code has been used 500 times across Exora"
- Helps AI understand: "This is a well-established match" vs "This would be a novel selection"
- Useful for tie-breaker situations where similarity scores are close

**How NOT to use it:**
- Do not use as a multiplier in similarity scoring (biases toward common conditions)
- Do not let it override clinical reasoning (rare diseases still need accurate codes)
- Do not create self-reinforcing loops (early wrong matches shouldn't perpetuate)

**Example AI input:**
```
Candidates:
  1. Essential Hypertension (SNOMED:59621000) - similarity: 0.91, usage: 847 times
  2. Hypertensive Heart Disease (SNOMED:64715009) - similarity: 0.89, usage: 312 times
  3. Renovascular Hypertension (SNOMED:38481006) - similarity: 0.88, usage: 23 times
```

The AI can factor in that Code 1 is both the highest similarity AND most commonly matched, but retains the ability to select Code 3 if the clinical context specifically indicates renovascular origin.

### Exora-Originated Codes

When the AI creates a new code:

```sql
INSERT INTO universal_medical_codes (
  code,
  code_source,
  entity_type,
  display_name,
  description,
  is_exora_cached,
  first_cached_at,
  cache_usage_count,
  created_by_ai,
  ai_reasoning
) VALUES (
  'EXORA:000001',
  'exora',
  'condition',
  'Chronic Regional Pain Syndrome Type III',
  'AI-generated: No matching SNOMED code found for patient-described condition',
  true,
  NOW(),
  1,
  true,
  'Patient document describes a variant of CRPS not matching standard Type I or Type II definitions...'
);
```

---

## Why AI Judge > Pure Vector Search

Vector/semantic search is powerful but lacks clinical reasoning:

| Scenario | Vector Search | AI Judge |
|----------|---------------|----------|
| "Hypotension" vs "Hypertension" | High similarity (0.85+) | Knows they're opposites |
| "Type II DM" vs "Type 2 Diabetes" | May score lower than expected | Knows they're identical |
| "Essential HTN" vs "Hypertensive Heart Disease" | Similar scores | Knows one is a subset of the other |
| Negated context ("No diabetes") | Ignores context | Understands negation |

The AI applies **clinical reasoning** that similarity scores cannot:
- Understanding of medical terminology
- Recognition of abbreviations and aliases
- Awareness of hierarchical relationships (parent/child conditions)
- Context awareness (what the document is actually saying)

---

## Exact Match Bypass (Pre-Waterfall Optimization)

Before entering the Agentic Waterfall, a computational check can bypass Pass 2.5 entirely for exact text matches.

### When Bypass Applies

If the entity's `original_text` is a **literal, case-insensitive, letter-for-letter match** with an existing entity in the patient's record of the same subtype, directly assign the existing code.

**Example:**
```
Pass 2 output: "Metformin 500mg" (medication)
Patient's existing: "Metformin 500mg" (medication, code: RxNorm:860975)

Result: Direct assign RxNorm:860975, skip Pass 2.5 entirely
```

### Why This Works

- The original entity already went through Pass 2.5 validation when first encountered
- If the text is exactly the same, there's no ambiguity
- Saves an API call for repeat mentions of the same entity

### Guardrails

| Rule | Reason |
|------|--------|
| Tier 1 only | Only bypass against patient's own codes, not internal cache or universal library |
| Same subtype | "BP" as vital_sign vs "BP" as abbreviation for something else |
| Minimum length | Consider requiring 5+ characters to avoid false matches on short abbreviations |
| Audit logging | Log all bypasses for traceability |

### Implementation

```typescript
// Pre-Pass 2.5 check
function checkExactMatchBypass(
  entity: EnrichedEntity,
  patientEntities: PatientEntity[]
): { bypass: true; code: string } | { bypass: false } {

  const exactMatch = patientEntities.find(
    existing =>
      existing.entity_subtype === entity.entity_subtype &&
      existing.original_text.toLowerCase().trim() ===
        entity.original_text.toLowerCase().trim() &&
      existing.original_text.length >= 5  // Minimum length guard
  );

  if (exactMatch) {
    // Log the bypass
    logBypass({
      entity_id: entity.id,
      matched_entity_id: exactMatch.id,
      matched_code: exactMatch.medical_code,
      reason: 'exact_text_match'
    });

    return { bypass: true, code: exactMatch.medical_code };
  }

  return { bypass: false };
}
```

### Flow with Bypass

```
Pass 2 Output: Enriched entity
        |
        v
+------------------+
|  EXACT MATCH     |  Computational check (no AI)
|  BYPASS CHECK    |
+------------------+
        |
   Exact match? -- YES --> Assign code, DONE (skip Pass 2.5)
        |
        NO
        v
+------------------+
|   TIER 1         |  (Continue to Agentic Waterfall)
|   PRIMARY        |
+------------------+
        ...
```

---

## Processing Flow

### Per Entity Flow

```
0. Check for exact text match bypass (computational, no AI)
   - If exact match found: assign code, DONE

1. Receive enriched entity from Pass 2
   - original_text: "High BP"
   - aliases: ["High Blood Pressure", "Elevated BP"]
   - entity_subtype: "condition"
   - context: "Patient history of High BP, currently controlled with medication"

2. Tier 1: Primary Match
   - Query: All condition codes for this patient_id
   - AI reviews patient's existing conditions
   - Decision: Match / No Match

3. Tier 2: Secondary Match (if Tier 1 = No Match)
   - Vector search: graduated condition codes
   - AI reviews top 10 candidates
   - Decision: Match / No Match

4. Tier 3: Tertiary Match (if Tier 2 = No Match)
   - Vector search: universal condition codes
   - AI reviews top 20 candidates
   - Decision: Match / Create Exora Code

5. Graduation (if Tier 3 matched)
   - Update universal_medical_codes: is_exora_cached = true

6. Output: Entity with assigned medical code
```

### Batch Processing Flow

```
Pass 2 Output: 15 clinical entities (mixed subtypes)
        |
        v
Group by subtype:
  - 5 conditions
  - 6 medications
  - 4 lab_results
        |
        v
Process condition batch:
  - Tier 1: Check against patient's existing conditions
  - Tier 2/3: As needed for unmatched entities
        |
        v
Process medication batch:
  - Tier 1: Check against patient's existing medications
  - Tier 2/3: As needed for unmatched entities
        |
        v
Process lab_result batch:
  - Tier 1: Check against patient's existing lab types
  - Tier 2/3: As needed for unmatched entities
        |
        v
All entities now have medical codes assigned
```

---

## API Call Structure

Each tier is a separate AI API call (for now):

### Tier 1 API Call
```
Input:
  - Entity: { original_text, aliases, context, subtype }
  - Patient codes: [ { code, display_name, source } ... ] (all of this subtype)

Output:
  - match: boolean
  - matched_code: string | null
  - reasoning: string
```

### Tier 2 API Call
```
Input:
  - Entity: { original_text, aliases, context, subtype }
  - Candidates: [ { code, display_name, source, similarity_score } ... ] (top 10)

Output:
  - match: boolean
  - matched_code: string | null
  - reasoning: string
```

### Tier 3 API Call
```
Input:
  - Entity: { original_text, aliases, context, subtype }
  - Candidates: [ { code, display_name, source, similarity_score } ... ] (top 20)

Output:
  - match: boolean
  - matched_code: string | null
  - create_exora_code: boolean
  - exora_code_details: { display_name, description } | null
  - reasoning: string
```

### Future Optimization: Combined Tier Call

In future, we may combine all 3 tiers into a single API call:

```
Input:
  - Entity: { original_text, aliases, context, subtype }
  - Tier 1 candidates: Patient's existing codes
  - Tier 2 candidates: Top 10 from internal cache
  - Tier 3 candidates: Top 20 from universal library

Output:
  - selected_tier: 1 | 2 | 3 | 'exora'
  - matched_code: string
  - reasoning: string
```

This reduces API calls but increases input token volume. Deferred until we have performance data.

---

## Cache Growth Dynamics

Over time, the internal cache (Tier 2) grows and Tier 3 usage decreases:

```
Month 1:
  - 80% Tier 3 (discovery)
  - 15% Tier 1 (patient matches)
  - 5% Tier 2 (cache hits)

Month 6:
  - 30% Tier 3
  - 40% Tier 1
  - 30% Tier 2

Month 12+:
  - 10% Tier 3 (rare/unusual codes only)
  - 50% Tier 1
  - 40% Tier 2
```

The system becomes **cheaper and faster** as it processes more documents.

---

## Summary

| Aspect | Design Decision |
|--------|-----------------|
| **When** | After Pass 2 (Pass 2.5) |
| **How** | Agentic Waterfall: AI judges at each tier |
| **Tier 1** | Patient's existing codes (cheapest, most relevant) |
| **Tier 2** | Exora internal cache (graduated codes) |
| **Tier 3** | Universal library (SNOMED, RxNorm, LOINC) |
| **Fallback** | AI creates Exora-originated code |
| **Batching** | By entity subtype |
| **Database** | Single table with graduation columns |
| **Cache growth** | Tier 3 matches graduate to Tier 2 |

---

## Open Questions

1. **Tier combination**: Should we test combining tiers into single API calls for efficiency?
2. **Exora code review**: What's the workflow for human review of AI-generated codes?
3. **Code deprecation**: How do we handle when an Exora code gets a standard equivalent?
4. **Confidence thresholds**: Should vector search have minimum similarity thresholds before presenting to AI?

---

**Next Steps:**
- Design Pass 2 bridge schema architecture
- Define Pass 2 output schema (what Pass 2.5 needs from Pass 2)
- Implement vector search infrastructure for Tier 2/3 shortlisting
