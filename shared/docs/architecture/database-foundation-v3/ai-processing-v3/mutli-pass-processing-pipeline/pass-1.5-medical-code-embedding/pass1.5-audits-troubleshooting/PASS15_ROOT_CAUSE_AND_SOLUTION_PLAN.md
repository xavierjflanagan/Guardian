# Pass 1.5 Root Cause Analysis & Solution Plan

**Date:** 2025-10-19
**Investigation Duration:** Full day session
**Status:** ROOT CAUSE CONFIRMED - Ready for Phase 1 Implementation
**Severity:** CRITICAL - System not operational for production use

Core Objective Clarification
- You're absolutely right - Pass 1.5's job is simple: Provide 10-20 relevant medical code candidates to Pass 2 for final selection. It's a filtering/retrieval problem, not a precision matching problem.

## Part 1: Investigation Timeline & Summary

### Morning: Initial Discovery
- Tested Pass 1.5 vector search with "Metformin 500mg"
- Result: ❌ Returned "Felodipine 2.5mg" as top match (wrong medication)
- Hypothesis: Vector search fundamentally broken
- Created `CRITICAL_VECTOR_SEARCH_FAILURE_ANALYSIS.md`

### Midday: Infrastructure Fix
- Discovered char(1) truncation bug in `search_regional_codes()` RPC function
- `country_code_filter character` defaults to `char(1)`, truncating 'AUS' → 'A'
- Applied migration `2025-10-19_29_fix_search_regional_codes_char_type_bug.sql`
- Result: ✅ RPC returns results instead of zero
- But: ❌ Results are WRONG (same Felodipine issue persists)

### Afternoon: RPC Investigation
- User intervention: "Test via RPC function, not direct SQL"
- Tested real Pass 1 entities via RPC (Metformin, Perindopril, Cholecystectomy)
- All failed: wrong results or zero results
- Intern hypothesis: "RPC function is correct, problem is embedding input strategy"

### Evening: Truth Test Validation
- Ran intern's recommended truth test
- Used MBS 20706's own embedding as query → ✅ 100% similarity match
- **Conclusion:** RPC works perfectly, embedding mismatch is the root cause

### Key Finding
The char(3) fix solved the **infrastructure bug** (zero results) but exposed the **semantic quality bug** (wrong results due to embedding input mismatch).

### Critical Contributors
- **User:** Caught premature "operational" declaration, insisted on RPC testing
- **Intern:** Identified RPC is not the problem, recommended truth test methodology
- **2nd AI Bot:** Confirmed embedding text mismatch, recommended normalization strategy

---

## Part 2: Root Cause Analysis

### Confirmed Root Cause: Embedding Input Mismatch

**Problem:** Database embeddings and clinical query embeddings exist in different semantic spaces.

### Evidence 1: Database Embedding Source

**What was embedded in the database:**

**MBS 20706 (Cholecystectomy procedure):**
```
display_name: "Initiation of the management of anaesthesia for laparoscopic
               procedures in the upper abdomen, including laparoscopic
               cholecystectomy, other than a service to which another item
               in this Subgroup applies (H) (7 basic units)"
               [221 characters]

search_text:  "MBS 20706 T10 Initiation of the management of anaesthesia for
               laparoscopic procedures in the upper abdomen, including
               laparoscopic cholecystectomy, other than a service to which
               another item in this Subgroup applies (H) (7 basic units)"
               [235 characters - includes "MBS 20706 T10" prefix]

Embedded text: search_text (with billing code prefix and regulatory prose)
```

**PBS Metformin (medication):**
```
display_name: "Metformin Tablet (extended release) containing metformin
               hydrochloride 1 g"
               [74 characters]

search_text:  "Metformin Tablet (extended release) containing metformin
               hydrochloride 1 g Diaformin XR 1000"
               [92 characters - includes brand name]

Embedded text: search_text (with brand name "Diaformin XR 1000")
```

### Evidence 2: Clinical Query Text

**What Pass 1 extracts from documents:**
- `"Current Medication: Metformin 500mg twice daily"`
- `"Current Medication: Perindopril 4mg once daily"`
- `"Cholecystectomy"`

**Characteristics:**
- Clean, concise, patient-facing language
- No billing codes or regulatory prose
- No brand names
- Simple dosage format ("500mg" not "1 g")
- Procedure names only (not administrative descriptions)

### Evidence 3: Real Test Results

| Clinical Query | Expected | Actual Top Result | Similarity | Status |
|----------------|----------|-------------------|------------|--------|
| "Metformin 500mg twice daily" | PBS metformin codes | Felodipine Tablet 2.5mg | 44.1% | ❌ WRONG |
| "Perindopril 4mg once daily" | PBS perindopril codes | Oxybutynin Transdermal 36mg | 34.4% | ❌ WRONG |
| "Cholecystectomy" | MBS cholecystectomy codes | (Zero results) | N/A | ❌ FAIL |

### Evidence 4: Truth Test (RPC Validation)

**Test:** Used MBS 20706's database embedding as query
**Result:**
```
Rank | Similarity | Code      | Display Name
#1   | 100.0%     | MBS 20706 | Initiation of management of anaesthesia... (EXACT MATCH)
#2   | 91.7%      | MBS 20841 | Initiation of management of anaesthesia for bowel resection...
#3   | 90.6%      | MBS 20790 | Initiation of management of anaesthesia for peritoneal cavity...
#4   | 85.9%      | MBS 20802 | Initiation of management of anaesthesia for lipectomy...
#5   | 85.7%      | MBS 20704 | Initiation of management of anaesthesia for microvascular...
```

**Conclusion:** ✅ RPC function works perfectly when given a database embedding

### Why Semantic Mismatch Occurs

**Vector embeddings measure semantic similarity.** The model sees:

**Query:** `"Cholecystectomy"`
- Semantic space: surgical procedure, gallbladder removal, operative technique

**Database:** `"MBS 20706 T10 Initiation of management of anaesthesia for laparoscopic procedures..."`
- Semantic space: medical billing, anaesthesia administration, regulatory compliance

**Result:** Low cosine similarity (< 30%) → filtered out by min_similarity threshold → zero results

**Query:** `"Metformin 500mg twice daily"`
- Semantic space: oral diabetes medication, specific dosage

**Database:** `"Metformin Tablet (extended release) containing metformin hydrochloride 1 g Diaformin XR 1000"`
- Semantic space: extended-release formulation, chemical compound, brand name
- No 500mg pure metformin exists (only 1g extended release or combinations)

**Result:** Semantically closer to `"Felodipine 2.5mg"` (both short tablet descriptions) than to the verbose, brand-heavy metformin entry

### Additional Issues

1. **Unit inconsistency:** "1 g" vs "1000 mg" vs "500mg"
2. **Brand name noise:** "Diaformin XR 1000", "APO-Metformin XR 1000", "METEX XR"
3. **Combination products:** Metformin + Alogliptin vs pure metformin
4. **Dosage mismatch:** Query "500mg" but database only has 1000mg extended release
5. **Billing code prefixes:** "MBS 20706 T10" adds irrelevant billing semantics

---

## Part 3: What Works / What's Broken

### Infrastructure: WORKING ✅

1. **RPC Function**
   - char(3) fix applied correctly
   - STABLE keyword for query planner optimization
   - Truth test passes with 100% similarity
   - Function logic is sound

2. **Database Coverage**
   - 6,001 MBS procedures with embeddings (100%)
   - 14,382 PBS medications with embeddings (100%)
   - All codes: `active = TRUE`, `country_code = 'AUS'`
   - Filter values match exactly

3. **PostgreSQL Infrastructure**
   - pgvector extension operational
   - ivfflat index exists with correct operator class (`vector_cosine_ops`)
   - Index actively used (1,389 reads/fetches)
   - Cosine distance operator `<=>` syntax correct

4. **OpenAI Integration**
   - text-embedding-3-small model generating 1536-dimensional vectors
   - API calls successful
   - Embedding generation consistent

### Semantic Quality: BROKEN ❌

1. **Embedding Input Strategy**
   - Database uses `search_text` field (includes noise)
   - Clinical queries use free-text extractions (clean)
   - Result: Different semantic spaces

2. **Text Normalization**
   - No unit canonicalization (g ↔ mg ↔ mcg)
   - No brand name removal
   - No ingredient extraction
   - No dosage form standardization

3. **Search Accuracy**
   - Medications: Returns wrong ingredients
   - Procedures: Returns zero results
   - Top-1 ingredient recall: ~0% (unacceptable)

### Pass 1.5 System Status

**NOT OPERATIONAL** for production use.

**Risk:** Wrong medical codes could affect patient care decisions.

**Blocking Issue:** Embedding input mismatch prevents correct code matching.

---

## Part 4: Solution Strategy

Based on root cause confirmation and 2nd AI bot validation, implement the following 6-phase approach:

### Phase 0: Quick Baseline Test ✅ COMPLETED

**Result:** 40% success rate (2/5 medications found in top 20)
- Metformin, Paracetamol: Failed (similarity 54-55%, below 60% threshold)
- Perindopril: Failed (matched wrong drug)
- Atorvastatin, Amoxicillin: Success (80%+, position #1)

**Root Cause Confirmed:** Embedding mismatch - verbose database text vs clean clinical queries

**Details:** See `SESSION-PLAN-2025-10-20.md` for full baseline results

---

### Phase 1: Fast Validation Loop (1-2 hours)

**Objective:** Prove normalized embedding text fixes the issue BEFORE full regeneration

**Step 1: Inspect Current Data (15 min)**
```sql
-- Compare search_text vs display_name for sample medications
SELECT
  code_value,
  display_name,
  search_text,
  LENGTH(display_name) as display_len,
  LENGTH(search_text) as search_len
FROM regional_medical_codes
WHERE display_name ILIKE '%metformin%'
  AND code_system = 'pbs'
  AND display_name NOT ILIKE '%+%'  -- Exclude combinations
ORDER BY display_name
LIMIT 20;
```

**Step 2: Design Normalization Function (30 min)**

**Core Principle:** Extract only the essential clinical information for semantic matching

**For Medications:**
- Extract active ingredient(s) only (lowercase, no brands)
- Standardize strength to mg (convert g→mg, mcg→mg)
- Include dosage form (tablet/capsule/liquid/injection)
- Include release type if specified (immediate/extended/delayed)
- **EXCLUDE:** brand names, PBS codes, restrictions, li_item_id, pricing

**For Procedures:**
- Extract procedure name and anatomical site
- **EXCLUDE:** MBS codes, billing units, regulatory prose, anesthesia management details

**Example Transformations:**

| Original (search_text) | Normalized | Reasoning |
|------------------------|------------|-----------|
| `Metformin Tablet (extended release) containing metformin hydrochloride 1 g Diaformin XR 1000` | `metformin 1000 mg tablet extended release` | Removed brand "Diaformin XR", salt "hydrochloride", standardized g→mg, kept explicit release type |
| `MBS 20706 T10 Initiation of management of anaesthesia for laparoscopic procedures in the upper abdomen, including laparoscopic cholecystectomy...` | `laparoscopic cholecystectomy upper abdomen` | Removed MBS code, billing details, anesthesia management prose |
| `Perindopril Tablet 4 mg (as erbumine)` | `perindopril 4 mg tablet` | Removed salt "erbumine", omitted release type (not explicitly stated) |

**Step 3: Test Sample (20 test cases, 30 min)**

Pick 20 medications across categories:
- Metformin variants (mono + combos)
- Perindopril variants (2mg, 4mg, 8mg)
- Amlodipine variants
- Common antibiotics (amoxicillin, ciprofloxacin)
- Common statins (atorvastatin, rosuvastatin)

Generate normalized strings and re-embed via OpenAI API.
- Cost: ~$0.0004 (negligible)
- Time: 2-3 minutes for 20 codes

**Step 4: Vector Search Validation (15 min)**

Test normalized embeddings with real Pass 1 queries:
```typescript
// Normalize clinical query
const query = "Current Medication: Metformin 500mg twice daily";
const normalized = normalizeClinicalQuery(query);
// Result: "metformin 500 mg tablet immediate release"

// Generate embedding
const embedding = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: normalized
});

// Search against test codes with normalized embeddings
const results = await searchNormalizedCodes(embedding.data[0].embedding);
```

**Expected Outcome:**
- Correct ingredient in top 20: >95% (critical - must be in candidate list)
- Correct ingredient in top 10: >85%
- Correct ingredient in top 5: >70%
- Average similarity score for correct match: >60%

**Decision Gate:**
- ✅ If correct ingredient consistently in top 20 → Proceed to Phase 2
- ❌ If metrics poor → Iterate on normalization strategy
- **Remember:** Pass 2 AI will select from these candidates, so position #15 is acceptable if the code is present

---

### Phase 2: Normalized Embedding Implementation

**Database Schema Updates:**
```sql
-- Add normalized_text column (store canonical string for reproducibility)
ALTER TABLE regional_medical_codes
ADD COLUMN normalized_embedding_text TEXT;

ALTER TABLE universal_medical_codes
ADD COLUMN normalized_embedding_text TEXT;

-- Index for debugging and verification
CREATE INDEX idx_regional_normalized_text
ON regional_medical_codes(normalized_embedding_text);

-- Track regeneration batch
UPDATE regional_medical_codes
SET embedding_batch_id = 'normalized_v1_2025-10-19'
WHERE normalized_embedding_text IS NOT NULL;
```

**Normalization Function (TypeScript):**
```typescript
interface NormalizedMedicationText {
  ingredients: string[];        // lowercase canonical names
  strengths: number[];          // all in mg (normalized from g, mcg)
  dosageForm: string;           // tablet|capsule|liquid|injection|patch|etc
  releaseType?: string;         // immediate|extended|delayed (only if explicitly stated)
}

/**
 * IMPORTANT NORMALIZATION CONSIDERATIONS:
 *
 * Salt/Strength Handling:
 * - Different salt forms have different molecular weights
 * - Example: Perindopril erbumine 4mg ≠ Perindopril arginine 4mg (different equivalence)
 * - For Phase 1, we preserve strength AS-IS from source data
 * - Pass 2 AI will handle salt equivalence decisions
 * - Future: Consider de-emphasizing strength in similarity scoring if issues arise
 *
 * Release Type:
 * - ONLY include if explicitly stated in source data
 * - DO NOT default to "immediate" - this adds false information
 * - Better to omit than guess incorrectly
 */
function normalizeMedicationText(
  displayName: string,
  searchText: string
): string {
  // 1. Extract ingredient names (remove brands, but keep salts for now)
  const ingredients = extractIngredients(displayName);

  // 2. Normalize units (g→mg, mcg→mg, IU→mg where possible)
  // WARNING: Preserves strength as-is; salt conversion is Pass 2's responsibility
  const strengths = extractAndNormalizeStrengths(displayName);

  // 3. Standardize dosage form
  const dosageForm = normalizeDosageForm(displayName);

  // 4. Identify release type (ONLY if explicitly stated)
  const releaseType = extractReleaseType(displayName); // Returns null if not explicit

  // 5. Build canonical string
  const parts = [
    ingredients.join(' '),
    strengths.map(s => `${s} mg`).join(' '),
    dosageForm,
    releaseType  // Only included if explicitly stated
  ].filter(Boolean);

  return parts.join(' ').toLowerCase();
}

function normalizeProcedureText(
  displayName: string,
  searchText: string
): string {
  // 1. Remove billing code prefixes (MBS XXXXX, T10, etc)
  let text = searchText.replace(/^MBS \d+ T\d+\s*/, '');

  // 2. Extract key procedure terms (surgical keywords, anatomical sites)
  const procedureTerms = extractProcedureKeywords(text);

  // 3. Remove regulatory prose
  text = removeRegulatoryProse(text);

  // 4. Build canonical string
  return procedureTerms.join(' ').toLowerCase();
}
```

**Regeneration Script:**
```bash
# Generate normalized embeddings for all 20,383 codes
npx tsx regenerate-embeddings-normalized.ts \
  --code-systems=pbs,mbs \
  --batch-size=100 \
  --batch-id=normalized_v1_2025-10-19

# Cost estimate: ~$0.05 (20,383 codes × $0.0000025 per code)
# Time estimate: 10-15 minutes (rate limited to ~30 req/sec)
```

**Migration Required:**
```sql
-- Migration: 2025-10-XX_30_add_normalized_embedding_text.sql

-- Enable unaccent extension for accent-insensitive text matching
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Add normalized_embedding_text column
ALTER TABLE regional_medical_codes
ADD COLUMN normalized_embedding_text TEXT;

ALTER TABLE universal_medical_codes
ADD COLUMN normalized_embedding_text TEXT;

-- Create indexes for debugging and verification
CREATE INDEX idx_regional_normalized_text
ON regional_medical_codes(normalized_embedding_text);

CREATE INDEX idx_universal_normalized_text
ON universal_medical_codes(normalized_embedding_text);
```

---

### Phase 3: Combined Retrieval Implementation

**Objective:** Combine vector search with lexical search for maximum recall

**Strategy:** ALWAYS combine both methods (not fallback - true combination)

**Why Combined Approach:**
- **Vector search:** Catches semantic variations ("gall bladder removal" → "cholecystectomy")
- **Lexical search:** Ensures exact ingredient matches aren't missed
- **Redundancy:** Improves recall and robustness
- **Safety net:** If one method fails, the other provides coverage

**Retrieval Process:**
1. **Vector search:** Get top 10 candidates by embedding similarity
2. **Lexical search:** Get top 10 candidates by ingredient/procedure name match
3. **Combine:** Merge both result sets
4. **Deduplicate:** Remove duplicate codes
5. **Rerank:** Sort by combined score (70% vector + 30% lexical)
6. **Return:** Final list of 15-20 unique candidates

**Database Enhancement:**
```sql
-- Add GIN index for lexical text search
CREATE INDEX idx_regional_display_name_gin
ON regional_medical_codes USING gin(to_tsvector('english', display_name));

CREATE INDEX idx_regional_normalized_text_gin
ON regional_medical_codes USING gin(to_tsvector('english', normalized_embedding_text));
```

**Combined Search Function:**
```sql
CREATE OR REPLACE FUNCTION search_regional_codes_combined(
  p_query_text TEXT,
  p_query_embedding VECTOR(1536),
  p_entity_type VARCHAR(20),
  p_country_code CHAR(3),
  p_max_results INTEGER DEFAULT 20,
  p_min_similarity REAL DEFAULT 0.60
) RETURNS TABLE(
  code_system VARCHAR(20),
  code_value VARCHAR(50),
  display_name TEXT,
  search_text TEXT,
  similarity_score REAL,
  lexical_score REAL,
  combined_score REAL,
  retrieval_method TEXT,
  entity_type VARCHAR(20),
  country_code CHAR(3),
  authority_required BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    -- Vector search: Get top 10 by embedding similarity
    SELECT
      rmc.code_system,
      rmc.code_value,
      rmc.display_name,
      rmc.search_text,
      (1 - (rmc.embedding <=> p_query_embedding))::REAL as similarity_score,
      rmc.entity_type,
      rmc.country_code,
      rmc.authority_required,
      'vector'::TEXT as retrieval_method
    FROM regional_medical_codes rmc
    WHERE rmc.active = TRUE
      AND rmc.embedding IS NOT NULL
      AND (p_entity_type IS NULL OR rmc.entity_type = p_entity_type)
      AND (p_country_code IS NULL OR rmc.country_code = p_country_code)
      AND (1 - (rmc.embedding <=> p_query_embedding)) >= p_min_similarity
    ORDER BY rmc.embedding <=> p_query_embedding
    LIMIT 10
  ),
  lexical_results AS (
    -- Lexical search: Get top 10 by text match (ALWAYS run, not fallback)
    SELECT
      rmc.code_system,
      rmc.code_value,
      rmc.display_name,
      rmc.search_text,
      0.0::REAL as similarity_score,  -- Will be computed in final select
      rmc.entity_type,
      rmc.country_code,
      rmc.authority_required,
      'lexical'::TEXT as retrieval_method
    FROM regional_medical_codes rmc
    WHERE rmc.active = TRUE
      AND (p_entity_type IS NULL OR rmc.entity_type = p_entity_type)
      AND (p_country_code IS NULL OR rmc.country_code = p_country_code)
      AND (
        to_tsvector('english', unaccent(COALESCE(rmc.normalized_embedding_text, rmc.display_name))) @@
        plainto_tsquery('english', unaccent(p_query_text))
      )
    ORDER BY ts_rank(
      to_tsvector('english', unaccent(COALESCE(rmc.normalized_embedding_text, rmc.display_name))),
      plainto_tsquery('english', unaccent(p_query_text))
    ) DESC
    LIMIT 10
  ),
  combined_deduped AS (
    -- Combine both result sets and deduplicate
    SELECT DISTINCT ON (code_value, code_system)
      code_system,
      code_value,
      display_name,
      search_text,
      similarity_score,
      entity_type,
      country_code,
      authority_required,
      retrieval_method
    FROM (
      SELECT * FROM vector_results
      UNION ALL
      SELECT * FROM lexical_results
    ) combined
  )
  -- Compute final scores and rerank
  SELECT
    r.code_system,
    r.code_value,
    r.display_name,
    r.search_text,
    COALESCE(r.similarity_score,
      (1 - (rmc.embedding <=> p_query_embedding))::REAL,
      0.0::REAL
    ) as similarity_score,
    ts_rank(
      to_tsvector('english', unaccent(COALESCE(rmc.normalized_embedding_text, rmc.display_name))),
      plainto_tsquery('english', unaccent(p_query_text))
    )::REAL as lexical_score,
    (
      COALESCE(r.similarity_score, (1 - (rmc.embedding <=> p_query_embedding))::REAL, 0.0) * 0.7 +
      ts_rank(to_tsvector('english', unaccent(COALESCE(rmc.normalized_embedding_text, r.display_name))),
              plainto_tsquery('english', unaccent(p_query_text))) * 0.3
    )::REAL as combined_score,
    r.retrieval_method,
    r.entity_type,
    r.country_code,
    r.authority_required
  FROM combined_deduped r
  LEFT JOIN regional_medical_codes rmc ON r.code_value = rmc.code_value AND r.code_system = rmc.code_system
  ORDER BY combined_score DESC
  LIMIT p_max_results;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_temp, public;
```

**TypeScript Integration:**
```typescript
async function retrieveCodeCandidatesForEntity(
  entityText: string,
  entityType: string
): Promise<CodeCandidate[]> {
  // Normalize clinical query
  const normalizedQuery = normalizeClinicalQuery(entityText, entityType);

  // Generate embedding
  const embedding = await generateEmbedding(normalizedQuery);

  // Call combined search function
  const results = await supabase.rpc('search_regional_codes_combined', {
    p_query_text: normalizedQuery,
    p_query_embedding: embedding,
    p_entity_type: entityType,
    p_country_code: 'AUS',
    p_max_results: 20,
    p_min_similarity: 0.60
  });

  return results.data;
}
```

---

### Phase 4: Validation Gates (CRITICAL - DO NOT SKIP)

**Gold Standard Test Set:**

Create 50-100 common medications with manually verified correct codes:
- Diabetes medications (metformin, insulin, etc.)
- Hypertension medications (perindopril, amlodipine, etc.)
- Antibiotics (amoxicillin, ciprofloxacin, etc.)
- Statins (atorvastatin, simvastatin, etc.)
- Pain medications (paracetamol, ibuprofen, etc.)

**Success Metrics (Adjusted for Combined Retrieval):**

**CRITICAL:** Remember that Pass 2 AI will select from these candidates. The goal is ensuring the correct code is IN the candidate list, not necessarily #1.

| Metric | Threshold | Description | Why This Matters |
|--------|-----------|-------------|------------------|
| **Correct code in top 20** | **>99%** | Correct code present anywhere in candidate list | **BLOCKING METRIC** - Pass 2 can't select if not present |
| Correct code in top 10 | >95% | Correct code in first half of candidates | Pass 2 efficiency - less tokens to process |
| Correct code in top 5 | >85% | Correct code highly ranked | Optimal - reduces Pass 2 cognitive load |
| Top-1 exact match | >70% | Correct code is #1 result | Nice to have, not critical |
| False positive rate | <10% | Completely wrong ingredient in top 5 | Safety check - shouldn't pollute too much |

**Testing Script:**
```typescript
interface TestCase {
  query: string;
  expectedCodeValue?: string;        // Exact code match (preferred)
  expectedIngredient?: string;       // Fallback ingredient match
  expectedCodeSystem: 'mbs' | 'pbs';
  description: string;
}

const goldStandardTests: TestCase[] = [
  {
    query: "Metformin 500mg twice daily",
    expectedIngredient: "metformin",  // Use ingredient for now, upgrade to code_value later
    expectedCodeSystem: 'pbs',
    description: "Common diabetes medication"
  },
  {
    query: "Perindopril 4mg once daily",
    expectedIngredient: "perindopril",
    expectedCodeSystem: 'pbs',
    description: "ACE inhibitor for blood pressure"
  },
  // ... 48-98 more test cases
];

/**
 * Helper: Normalize ingredient name for comparison
 * Handles: case, whitespace, accents, common variations
 */
function normalizeIngredient(text: string): string {
  return text
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();
}

async function validateSearchQuality(tests: TestCase[]): Promise<Metrics> {
  let inTop20 = 0;
  let inTop10 = 0;
  let inTop5 = 0;
  let top1Correct = 0;
  let falsePositives = 0;

  for (const test of tests) {
    const results = await retrieveCodeCandidatesForEntity(
      test.query,
      test.expectedCodeSystem === 'pbs' ? 'medication' : 'procedure'
    );

    // Find position of correct answer - UNAMBIGUOUS MATCHING
    let correctPosition = -1;

    if (test.expectedCodeValue) {
      // Preferred: Exact code_value match
      correctPosition = results.findIndex(r =>
        r.codeSystem === test.expectedCodeSystem &&
        r.codeValue === test.expectedCodeValue
      );
    } else if (test.expectedIngredient) {
      // Fallback: Normalized ingredient match (less brittle than raw substring)
      const normalizedExpected = normalizeIngredient(test.expectedIngredient);
      correctPosition = results.findIndex(r => {
        const normalizedDisplay = normalizeIngredient(r.displayName);
        return normalizedDisplay.includes(normalizedExpected);
      });
    }

    // Track position-based metrics
    if (correctPosition >= 0 && correctPosition < 20) inTop20++;
    if (correctPosition >= 0 && correctPosition < 10) inTop10++;
    if (correctPosition >= 0 && correctPosition < 5) inTop5++;
    if (correctPosition === 0) top1Correct++;

    // Check for false positives (wrong ingredient in top 5)
    if (test.expectedIngredient) {
      const normalizedExpected = normalizeIngredient(test.expectedIngredient);
      const top5 = results.slice(0, 5);
      const hasFalsePositive = top5.some(r => {
        const normalizedDisplay = normalizeIngredient(r.displayName);
        return !normalizedDisplay.includes(normalizedExpected) &&
               !isRelatedIngredient(normalizedDisplay, normalizedExpected);
      });
      if (hasFalsePositive) falsePositives++;
    }
  }

  return {
    inTop20Rate: inTop20 / tests.length,
    inTop10Rate: inTop10 / tests.length,
    inTop5Rate: inTop5 / tests.length,
    top1Recall: top1Correct / tests.length,
    falsePositiveRate: falsePositives / tests.length
  };
}
```

**Blocking Condition:**

**If "Correct code in top 20" < 99%:**
- ❌ **DO NOT DEPLOY** to production
- Investigate failure cases (which medications/procedures are failing?)
- Iterate on normalization strategy
- Consider entity-type-specific optimizations
- Re-run validation until threshold met

**All other metrics can be optimized post-deployment** - as long as the correct code is in the candidate list, Pass 2 will find it.

---

### Phase 5: Production Deployment

**Pre-Deployment Checklist:**
- [ ] Phase 4 validation metrics met all thresholds
- [ ] Gold standard test set passes
- [ ] Backup current embeddings (keep for 30 days)
- [ ] Migration scripts reviewed and approved
- [ ] Rollback plan documented

**Deployment Steps:**

1. **Backup Current State**
```sql
-- Backup current embeddings
CREATE TABLE regional_medical_codes_backup_20251019 AS
SELECT * FROM regional_medical_codes;

-- Mark old batch
UPDATE regional_medical_codes
SET embedding_batch_id = 'search_text_v0_backup'
WHERE embedding_batch_id IS NULL;
```

2. **Regenerate All Embeddings**
```bash
# Generate normalized embeddings for all 20,383 codes
npx tsx regenerate-embeddings-normalized.ts \
  --code-systems=pbs,mbs \
  --batch-id=normalized_v1_production \
  --confirm-production
```

3. **Update Tracking Metadata**
```sql
UPDATE regional_medical_codes
SET
  embedding_batch_id = 'normalized_v1_production',
  embedding_generated_at = NOW()
WHERE normalized_embedding_text IS NOT NULL;
```

4. **Rebuild IVFFLAT Index (if needed)**
```sql
-- Only if normalized embeddings significantly change vector distribution
DROP INDEX IF EXISTS idx_regional_codes_vector;

CREATE INDEX idx_regional_codes_vector
ON regional_medical_codes USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 1000);

-- Verify index created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'regional_medical_codes'
  AND indexname = 'idx_regional_codes_vector';
```

5. **Deploy Hybrid Search Function**
```sql
-- Apply migration with hybrid search function
-- (See Phase 3 for function definition)
```

6. **Monitor Search Quality Metrics**

Track for 7 days:
- Search query volume
- Average similarity scores
- Top-1 ingredient recall (production data)
- User feedback on incorrect matches
- API error rates

**Rollback Plan:**

If production issues occur:
```sql
-- Restore old embeddings
UPDATE regional_medical_codes rmc
SET embedding = backup.embedding
FROM regional_medical_codes_backup_20251019 backup
WHERE rmc.id = backup.id;

-- Revert batch ID
UPDATE regional_medical_codes
SET embedding_batch_id = 'search_text_v0_backup';

-- Rebuild index with old embeddings
REINDEX INDEX idx_regional_codes_vector;
```

---

## Part 5: Immediate Next Steps

### Action Items (Before Phase 1 Execution)

1. **Remove Unauthorized Function** (Medium Priority)
   - [ ] Create migration: `2025-10-XX_30_remove_unauthorized_search_function.sql`
   - [ ] Drop `search_regional_codes_fixed()` function
   - [ ] Verify function removed via Supabase MCP
   - [ ] Update migration header complete

2. **Prepare Phase 1 Environment** (High Priority)
   - [ ] Create test data set (20 medications across categories)
   - [ ] Design normalization function (TypeScript)
   - [ ] Set up OpenAI API rate limiting (30 req/sec)
   - [ ] Create validation script for test embeddings

3. **Documentation Updates** (Medium Priority)
   - [X] Consolidate investigation files (this document)
   - [X] Archive `CRITICAL_VECTOR_SEARCH_FAILURE_ANALYSIS.md`
   - [X] Archive `PASS15_RPC_INVESTIGATION_FINDINGS.md`
   - [ ] Update test_04 to reflect RPC vs SQL distinction


### Phase 1 Execution Plan (Next Session)


**Session Outline:**
1. Design normalization function (30 min)
2. Generate 20 test cases with normalized embeddings (30 min)
3. Test vector search with normalized embeddings (15 min)
4. Analyze results and calculate metrics (15 min)
5. Decision: Proceed to Phase 2 or iterate on normalization

**Success Criteria:**
- Top-1 ingredient recall >80% for test set
- Average similarity score >60% for correct matches
- Zero completely wrong ingredients in top 5

**Failure Handling:**
- If metrics poor, iterate on normalization strategy
- Try different canonical formats
- Consider procedure-specific vs medication-specific normalization
- Re-test before proceeding to Phase 2

---

## Appendix A: Test Results Summary

### Real Pass 1 Entity Tests via RPC

| Test | Clinical Query | Expected | Actual Top Result | Similarity | Results Count | Status |
|------|----------------|----------|-------------------|------------|---------------|--------|
| Medication 1 | "Current Medication: Metformin 500mg twice daily" | PBS metformin codes | Felodipine Tablet 2.5mg | 44.1% | 10 | ❌ WRONG |
| Medication 2 | "Current Medication: Perindopril 4mg once daily" | PBS perindopril codes | Oxybutynin Transdermal 36mg | 34.4% | 3 | ❌ WRONG |
| Procedure 1 | "Cholecystectomy" | MBS cholecystectomy codes | (No results) | N/A | 0 | ❌ FAIL |

### Truth Test (RPC Validation)

| Test | Query Type | Expected | Actual Top Result | Similarity | Status |
|------|-----------|----------|-------------------|------------|--------|
| MBS 20706 | Database embedding | MBS 20706 (self) | MBS 20706 | 100.0% | ✅ PASS |

### Database Coverage Verification

| Code System | Entity Type | Total Codes | With Embeddings | Active | AUS | Coverage |
|-------------|-------------|-------------|-----------------|--------|-----|----------|
| MBS | procedure | 6,001 | 6,001 | 6,001 | 6,001 | 100% |
| PBS | medication | 14,382 | 14,382 | 14,382 | 14,382 | 100% |

---

## Appendix B: 2nd AI Bot Peer Review

**Date:** 2025-10-19
**Reviewer:** Independent AI analysis (2nd opinion requested by user)
**Confidence:** 95% that embedding text mismatch is primary fault

### Key Confirmations

✅ **Root Cause:** Embedding text mismatch is the primary fault
- Brand-heavy search_text reduces semantic signal
- Dosage normalization issues (g ↔ mg ↔ mcg)
- Combination products vs mono-ingredient mismatch

✅ **Solution Priority:** Fix embedding inputs FIRST, hybrid search SECOND, index tuning LAST
- Normalized embeddings are foundation
- Hybrid search is safety net
- Index tuning premature until embeddings fixed

✅ **Fast Validation:** 1-2 hour test loop with 20 medications before full regeneration
- Proves concept before expensive regeneration
- Allows iteration on normalization strategy
- Low cost, low risk validation

### Additional Insights

**Unit Canonicalization:**
- Emphasized importance of lossless g↔mg, mcg↔mg normalization
- Avoid information loss during conversion
- Store original units in metadata for debugging

**Combination Products:**
- Mono-ingredient queries should still retrieve combination products
- Rerank to prefer mono-ingredient matches
- Don't completely filter out combos (may be clinically relevant)

**Two-Track Embeddings:**
- Suggested storing two embeddings per code:
  - Canonical embedding (normalized text)
  - Full-context embedding (original search_text)
- **Decision:** DEFERRED as premature optimization
- Evaluate AFTER single normalized approach tested

**IVFFLAT Tuning:**
- Recommended tuning `lists` parameter proportional to sqrt(N)
- For 20,383 codes: `lists = sqrt(20383) ≈ 143` (currently 1000)
- Adjust `probes` parameter for recall vs speed tradeoff
- **Decision:** DEFERRED until normalized embeddings tested
- Index likely fine, not the bottleneck

**Prefiltering by Entity Type:**
- Already implemented via existing WHERE clauses in RPC
- No additional work needed

### Recommendations Adopted

1. ✅ Normalized canonical string format (ingredient + strength + form + release)
2. ✅ Hybrid retrieval with lexical/fuzzy fallback
3. ✅ Fast validation loop (20 test cases) before full regeneration
4. ✅ Gold standard test set with blocking deployment gates
5. ✅ Unit normalization consistency (lossless g↔mg conversion)

### Recommendations Deferred/Modified

- ⏸️ Two-track embeddings: Evaluate AFTER single normalized approach tested
- ⏸️ IVFFLAT rebuild: Only if normalized embeddings don't fix issue (index likely fine)
- ✅ Prefiltering by entity_type: Already implemented via existing WHERE clauses

**Consensus:** Proceed with Phase 1 Fast Validation Loop

---

## Appendix C: Acknowledgments

### Critical Contributors

**User (Project Owner):**
- Caught misleading test
- Insisted on testing via RPC function (not bypassing with direct SQL)
- Pushed for real Pass 1 entity testing (exposed actual production behavior)
- Identified that RPC function is correct (not the problem)
- Confirmed embedding input strategy as root cause
- Provided concrete next steps (normalization + hybrid search)

### Lessons Learned

1. **Test the actual production code path** - Direct SQL tests can be misleading
2. **Validate results, not just functionality** - Returning results ≠ returning CORRECT results
3. **Truth tests are critical** - Using database's own data as query validates infrastructure
4. **Semantic space matters** - Billing text vs clinical text are semantically different
5. **Fast validation before big changes** - Test with 20 codes before regenerating 20,383

---

## Document Status

**Key Changes (2025-10-20 Initial Update):**
1. **Added Phase 0:** Quick baseline test (30 min) to measure current failure rate
2. **Simplified Phase 1:** Clearer normalization rules focusing on essential clinical information
3. **Enhanced Phase 3:** Changed from "fallback" to true combined retrieval (vector + lexical always)
4. **Realistic Metrics (Phase 4):**
   - Primary goal: Correct code in top 20 (>99%) - BLOCKING METRIC
   - Adjusted expectations: Pass 2 AI will select from candidates, position #15 is acceptable
   - Top-1 recall lowered to >70% (nice to have, not critical)
5. **Added TypeScript integration examples** for combined search function

**Critical Fixes (2025-10-20 After Second Opinion Review #1):**
1. **SQL Bug Fixed (Line 585):** Changed `r.normalized_embedding_text` → `rmc.normalized_embedding_text`
   - Bug: CTE `combined_deduped` doesn't include `normalized_embedding_text` in select list
   - Fix: Use joined table `rmc.normalized_embedding_text` instead
2. **Security Hardening (Line 602):** Changed `search_path = public, pg_temp` → `search_path = pg_temp, public`
   - Prevents schema injection attacks in SECURITY DEFINER functions
3. **Added unaccent Extension (Phase 2 Migration):** Enables accent-insensitive text matching
   - Handles "Paracétamol" → "Paracetamol" matching
4. **Salt/Strength Warning (Phase 2):** Added documentation about molecular weight equivalence issues
   - Example: Perindopril erbumine 4mg ≠ Perindopril arginine 4mg
   - Decision: Keep strength in embeddings, let Pass 2 AI handle equivalence
5. **Release Type Fix (Phase 1 Example):** Removed incorrect "immediate release" default
   - Only include release type if explicitly stated in source data
   - Better to omit than assert incorrectly
6. **Metric Consistency (Line 877):** Updated stakeholder communication to reference correct blocking metric
   - Changed from "Top-1 recall >95%" to "correct code in top 20 >99%"

**Essential Changes (2025-10-20 After Second Opinion Review #2):**
1. **Use unaccent in Queries (Lines 567-568, 571-572, 605-606, 610-611):** Applied unaccent to BOTH sides of text search
   - Updated lexical search: `to_tsvector('english', unaccent(...))` and `plainto_tsquery('english', unaccent(p_query_text))`
   - Extension alone does nothing - this directly boosts lexical recall
   - Handles: "Paracétamol" matches "paracetamol", accent variations
2. **Unambiguous Validation Matching (Lines 678-775):** Changed from substring to structured matching
   - Preferred: Match by `code_system + code_value` (exact)
   - Fallback: Normalized ingredient matching (accent-insensitive, case-insensitive)
   - Added `normalizeIngredient()` helper function
   - Makes "99% in top 20" metric trustworthy
3. **Updated Test Interface (Lines 678-684):** Added structured test case fields
   - `expectedCodeValue` (preferred for exact matching)
   - `expectedIngredient` (fallback for ingredient matching)
   - `description` (for test documentation)

**Still Pending (Conditional - Based on Phase 4 Results):**
- Min-similarity threshold review (keep 0.60 for now, lower to 0.40 if Phase 4 shows misses)

**Core Philosophy:**
- Fix embeddings FIRST (they are the root cause)
- Test incrementally (20 → 100 → all)
- Combine vector + lexical for robustness
- Pass 1.5's job: Get correct code IN the list (Pass 2 will select the best one)

**Next Update:** After Phase 0 baseline test completion

**Related Documents:**
- Migration: `2025-10-19_29_fix_search_regional_codes_char_type_bug.sql`
- Schema: `current_schema/03_clinical_core.sql` (lines 1959-1995)
- Test: `test_04_char_type_truncation_fix.md`
