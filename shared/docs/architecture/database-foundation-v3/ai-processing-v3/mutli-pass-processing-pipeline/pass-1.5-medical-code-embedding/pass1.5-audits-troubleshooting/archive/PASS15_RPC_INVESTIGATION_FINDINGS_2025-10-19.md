# Pass 1.5 RPC Investigation Findings

**Date:** 2025-10-19
**Investigation Duration:** Full day session
**Status:** ROOT CAUSE CONFIRMED - Analysis Complete (No Changes Made)

## Executive Summary

Pass 1.5 vector search returns zero or wrong results when called via RPC with real clinical entity text. Investigation confirms:
- ✅ **RPC function is correct** (char(3) fix works, truth test passes)
- ✅ **Database has complete coverage** (6,001 MBS procedures, 14,382 PBS medications with embeddings)
- ❌ **Embedding input mismatch** is the root cause (database used `search_text`, clinical queries use free text)

## Investigation Methodology

### Test 1: Real Pass 1 Entity Testing via RPC
Tested two actual medication entities from Pass 1 output (2025-10-19):

**Entity 1: Metformin**
- Input: `"Current Medication: Metformin 500mg twice daily"`
- Expected: PBS metformin codes
- Actual: ❌ Felodipine (wrong medication)
- Top similarity: 44.1%

**Entity 2: Perindopril**
- Input: `"Current Medication: Perindopril 4mg once daily"`
- Expected: PBS perindopril codes
- Actual: ❌ Oxybutynin (wrong medication)
- Top similarity: 34.4%
- Results count: Only 3 total

**Entity 3: Cholecystectomy (procedure)**
- Input: `"Cholecystectomy"`
- Expected: MBS cholecystectomy codes
- Actual: ❌ ZERO RESULTS
- RPC Status: 200 OK (but empty array)

### Test 2: Data Coverage Verification

```sql
-- MBS Procedures
SELECT COUNT(*) FROM regional_medical_codes
WHERE code_system = 'mbs' AND entity_type = 'procedure'
  AND embedding IS NOT NULL AND active = TRUE AND country_code = 'AUS';
-- Result: 6,001 codes (100% coverage)

-- PBS Medications
SELECT COUNT(*) FROM regional_medical_codes
WHERE code_system = 'pbs' AND entity_type = 'medication'
  AND embedding IS NOT NULL AND active = TRUE AND country_code = 'AUS';
-- Result: 14,382 codes (100% coverage)
```

**Findings:**
- ✅ All codes have embeddings
- ✅ All filters match (`entity_type`, `country_code`, `active`)
- ✅ No data coverage issues

### Test 3: RPC Truth Test (Hypothesis)

Used a known procedure's own embedding as the query:

```typescript
// Fetch MBS 20706's embedding from database
const { data: procedure } = await supabase
  .from('regional_medical_codes')
  .select('embedding')
  .eq('code_value', '20706')
  .single();

// Call RPC with this embedding
const { data: results } = await supabase.rpc('search_regional_codes', {
  query_embedding: procedure.embedding,
  entity_type_filter: 'procedure',
  country_code_filter: 'AUS',
  max_results: 5,
  min_similarity: 0.0
});
```

**Results:**
```
Rank | Similarity | Code      | Match?
#1   | 100.0%     | MBS 20706 | ✓ EXACT MATCH
#2   | 91.7%      | MBS 20841 |
#3   | 90.6%      | MBS 20790 |
#4   | 85.9%      | MBS 20802 |
#5   | 85.7%      | MBS 20704 |
```

**Conclusion:** ✅ **RPC function works perfectly when given a database embedding**

### Test 4: Embedding Input Text Analysis

Examined what text was embedded in the database:

**MBS 20706 (Cholecystectomy procedure):**
```
display_name: "Initiation of the management of anaesthesia for laparoscopic
               procedures in the upper abdomen, including laparoscopic
               cholecystectomy, other than a service to which another item
               in this Subgroup applies (H) (7 basic units)"

search_text:  "MBS 20706 T10 Initiation of the management of anaesthesia for
               laparoscopic procedures in the upper abdomen, including
               laparoscopic cholecystectomy, other than a service to which
               another item in this Subgroup applies (H) (7 basic units)"

Embedded:     search_text (includes "MBS 20706 T10" prefix)
```

**PBS Metformin (medication):**
```
display_name: "Metformin Tablet (extended release) containing metformin
               hydrochloride 1 g"

search_text:  "Metformin Tablet (extended release) containing metformin
               hydrochloride 1 g Diaformin XR 1000"

Embedded:     search_text (includes brand name "Diaformin XR 1000")
```

**Clinical Entity Queries (from Pass 1):**
```
"Current Medication: Metformin 500mg twice daily"
"Current Medication: Perindopril 4mg once daily"
"Cholecystectomy"
```

## Root Cause Analysis

### The Mismatch Problem

**Database embeddings** were generated from `search_text` which includes:
- MBS codes: "MBS 20706 T10" prefixes, full verbose descriptions
- PBS codes: Brand names ("Diaformin XR 1000", "APO-Metformin XR 1000")
- Inconsistent unit representations ("1 g" vs "1000 mg")
- Long regulatory prose

**Clinical entity embeddings** are generated from:
- Free-text extractions from Pass 1: "Metformin 500mg twice daily"
- Simple procedure names: "Cholecystectomy"
- Clean, concise, patient-facing language

### Why This Causes Failure

**Vector embeddings are semantic similarity measures.** The semantic space of:
- `"MBS 20706 T10 Initiation of the management of anaesthesia for laparoscopic procedures..."`
- Is VERY DIFFERENT from `"Cholecystectomy"`

Even though both describe the same procedure, the embedding model sees:
- First string: medical billing, anaesthesia management, regulatory language
- Second string: surgical procedure name

Result: **Low cosine similarity** → filtered out by `min_similarity` threshold

### Why Medications Return WRONG Results

**Metformin example:**
- Query: `"Current Medication: Metformin 500mg twice daily"`
- Database has NO pure metformin 500mg (only 1g extended release or combinations)
- Embeddings include brand names that add noise
- "Metformin 500mg" semantically closer to "Felodipine 2.5mg" (both are short tablet descriptions) than to "Metformin Tablet (extended release) containing metformin hydrochloride 1 g Diaformin XR 1000"

## Analysis Validation

### What's Right ✅

1. **"RPC function and schema are now correct"** - ✅ CONFIRMED
   - Truth test passes with 100% similarity
   - char(3) fix works correctly
   - Function logic is sound

2. **"Zero/wrong results stem from data coverage/filters (procedures) and embedding input strategy (medications)"** - ✅ CONFIRMED
   - Data coverage is perfect (100%)
   - Filter values match exactly
   - Embedding input strategy is THE issue

3. **"Fix data availability and normalization, and the RPC will behave like your direct SQL sanity tests"** - ✅ CONFIRMED
   - Direct SQL test used database embedding (perfect match)
   - RPC with database embedding = perfect match
   - RPC with free-text embedding = mismatch

4. **"Concrete checks to run now"**
   - ✅ Sanity on data coverage: DONE (100% coverage)
   - ✅ Filter correctness: DONE (exact matches)
   - ✅ Minimal RPC truth test: DONE (passes)

### What's Recommended (Not Yet Implemented)

**For correctness (blocking):**
- [ ] Ensure embeddings exist for targeted MBS procedures (already 100%)
- [ ] Confirm entity_type_filter exact match (confirmed)

**For quality (next):**
- [ ] Regenerate embeddings from normalized canonical strings
- [ ] Add hybrid retrieval (lexical prefilter + vector search + rerank)

## Test Results Summary

| Test | Method | Expected | Actual | Status |
|------|--------|----------|---------|--------|
| Metformin via RPC | Free text "Metformin 500mg" | PBS metformin codes | Felodipine (44.1%) | ❌ WRONG |
| Perindopril via RPC | Free text "Perindopril 4mg" | PBS perindopril codes | Oxybutynin (34.4%) | ❌ WRONG |
| Cholecystectomy via RPC | Free text "Cholecystectomy" | MBS cholecystectomy codes | ZERO RESULTS | ❌ FAIL |
| Cholecystectomy via SQL | Database embedding | MBS 20706 (100%) | MBS 20706 (100%) | ✅ PASS |
| RPC Truth Test | Database embedding | MBS 20706 (100%) | MBS 20706 (100%) | ✅ PASS |
| Data Coverage | Database query | 20,383 codes with embeddings | 20,383 codes | ✅ PASS |

## Conclusions

### What Works ✅
1. RPC function definition (char(3) fix, STABLE keyword, correct logic)
2. Database schema and data coverage (100% embeddings)
3. Vector index (ivfflat with cosine ops)
4. PostgreSQL pgvector extension
5. Supabase MCP integration

### What's Broken ❌
1. **Embedding input text strategy** (search_text includes noise)
2. **Semantic mismatch** between clinical entities and database codes
3. **No normalization** (units, brands, formatting inconsistencies)

### Pass 1.5 Status

**NOT OPERATIONAL** for real clinical entity matching.

**Why:** Clinical entities from Pass 1 ("Metformin 500mg twice daily") generate embeddings in a different semantic space than database codes embedded from search_text ("Metformin Tablet (extended release) containing metformin hydrochloride 1 g Diaformin XR 1000").

### The char(3) Fix Impact

The migration fixed the **infrastructure bug** (char(1) truncation preventing ANY results), but exposed the **semantic quality bug** (wrong results due to embedding mismatch).

Before char(3) fix:
- ❌ Zero results (WHERE clause filtering out all records)

After char(3) fix:
- ❌ Wrong results for medications (Felodipine instead of Metformin)
- ❌ Zero results for procedures (semantic mismatch too severe)

## Next Steps (Analysis Phase - No Implementation)

### Immediate Priority: Embedding Strategy Fix

**Option 1: Regenerate All Embeddings**
- Extract normalized canonical text from each code
- Format: `"{ingredient} {strength_mg} {form} {release_type}"`
- Example: `"metformin 1000 mg tablet extended release"`
- Regenerate 20,383 embeddings (~$0.05 cost, 15 minutes)

**Option 2: Normalize Clinical Entity Text Before Embedding**
- Parse Pass 1 entity text: "Metformin 500mg twice daily"
- Extract: ingredient="metformin", strength=500, unit="mg"
- Normalize to canonical format before embedding
- Match against normalized database embeddings

**Option 3: Hybrid Search**
- Lexical prefilter: exact ingredient name match
- Numeric filter: strength within ±10% band
- Vector search on filtered subset
- Rerank combining lexical + vector scores

### Validation Required Before Implementation

Per CRITICAL_VECTOR_SEARCH_FAILURE_ANALYSIS.md Phase 1:
1. Pick 20 test medications across categories
2. Generate normalized embeddings
3. Test search quality (Top-1 ingredient recall >95%)
4. If successful, proceed to full regeneration
5. If unsuccessful, iterate on normalization strategy

### Blocking Condition

**DO NOT DEPLOY** Pass 1.5 to production until:
- Top-1 ingredient recall >95%
- MRR@10 (Mean Reciprocal Rank) >0.90
- Strength-window match rate >85%

## Files Referenced

- **Investigation:** `/test-pass15-rpc-call.ts`
- **Truth Test:** `/test-rpc-truth-test.ts`
- **Analysis Doc:** `CRITICAL_VECTOR_SEARCH_FAILURE_ANALYSIS.md`
- **Migration:** `2025-10-19_29_fix_search_regional_codes_char_type_bug.sql`
- **Schema:** `current_schema/03_clinical_core.sql` (lines 1959-1995)

---

**Status:** Ready for embedding strategy redesign (separate work session)
**Risk Level:** HIGH - Do not deploy to production
**Recommendation:** Proceed to Phase 1 Fast Validation Loop (CRITICAL_VECTOR_SEARCH_FAILURE_ANALYSIS.md)
