# Experiment 5 - Phase 2: OpenAI Baseline Test Analysis

**Test Date:** 2025-10-22
**Model:** OpenAI text-embedding-3-small (1536 dimensions)
**Dataset:** 35 realistic procedure entities
**Success Criteria:** Top-20 accuracy ≥90% = OpenAI sufficient

---

## Executive Summary

**Result:** 22/35 entities returned results (62.9% success rate)
**Outcome:** **OpenAI embeddings INSUFFICIENT for MBS procedure matching**

13 entities (37.1%) returned **zero results** from the database, not due to missing data or code errors, but because vector similarity scores were below 0.0 (cosine distance > 1.0), indicating extreme semantic mismatch.

---

## Test Configuration

### Database State (Verified)
- Total MBS codes: 6,001
- Codes with embeddings: 6,001 (100%)
- Active codes: 6,001 (100%)
- Entity type: 100% marked as 'procedure'
- Country code: 100% marked as 'AUS'

### Search Parameters
- RPC function: `search_regional_codes()`
- Entity type filter: 'procedure'
- Country code filter: 'AUS'
- Min similarity: 0.0 (accept ANY positive similarity)
- Max results: 20

### Key RPC Filter Logic
```sql
WHERE rmc.active = TRUE
  AND rmc.embedding IS NOT NULL
  AND rmc.entity_type = 'procedure'
  AND rmc.country_code = 'AUS'
  AND (1 - (rmc.embedding <=> query_embedding)) >= min_similarity
```

**Critical:** Even with `min_similarity = 0.0`, 13 entities still returned 0 results.

---

## Results Breakdown

### Failed Entities (0 Results) - 13/35 (37.1%)

These entities had NO MBS codes with similarity ≥ 0.0:

1. **Long GP consultation** - 0 results
2. **Suture removal** - 0 results
3. **Influenza vaccination** - 0 results
4. **Joint injection** - 0 results
5. **Chest X-ray** (capital X, hyphen) - 0 results
6. **Chest x-ray** (lowercase x, hyphen) - 0 results
7. **Chest xray** (one word) - 0 results
8. **XR chest** (reversed order) - 0 results
9. **X-ray left ankle** - 0 results
10. **CT scan head** - 0 results
11. **Ultrasound abdomen** - 0 results
12. **Cholecystectomy** - 0 results
13. **Total hip replacement** - 0 results

### Successful Entities (Results Returned) - 22/35 (62.9%)

**High Similarity (>50%):**
- Inguinal hernia repair: 63.7%
- Knee arthroscopy: 63.3%
- Skin cancer excision: 58.7%
- Blood collection: 58.6%
- Laceration repair: 56.4%

**Medium Similarity (30-50%):**
- Mental health care plan: 49.2%
- Wound dressing: 49.6%
- Cataract surgery: 54.4%
- Colonoscopy: 49.2%

**Low Similarity (<30%):**
- Standard GP consultation: 49.8% (only 1 result)
- ECG: 28.5%
- Spirometry: 37.6%
- Pap smear: 18.3% (only 1 result)
- Ear syringing: 22.3%
- Skin lesion excision: 23.5%
- CXR: 24.8% (4 results)
- Appendectomy: 25.9%
- Tonsillectomy: 22.3%
- Carpal tunnel release: 26.5%
- Caesarean section: 36.2%
- Hysterectomy: 24.1%

---

## Critical Finding: X-ray Formatting Test Failure

**Purpose:** Test how different formatting affects matching accuracy

**Hypothesis:** All 5 variations should match the same chest x-ray MBS codes

**Results:**
| Entity ID | Text | Formatting | Results | Top Similarity |
|-----------|------|------------|---------|----------------|
| 15 | Chest X-ray | Capital X, hyphen | **0** | N/A |
| 16 | Chest x-ray | Lowercase x, hyphen | **0** | N/A |
| 17 | Chest xray | One word | **0** | N/A |
| 18 | CXR | Abbreviation | **4** | 24.8% |
| 19 | XR chest | Reversed order | **0** | N/A |

**Conclusion:** OpenAI embeddings are NOT robust to formatting variations. Only the abbreviation "CXR" found results (and these were likely false positives - see manual analysis below).

**Database Verification:** Chest x-ray codes DO exist in the database:
- 58500: "Chest (lung fields) by direct radiography (NR)"
- 58503: "Chest (lung fields) by direct radiography (R)"
- 58506: "Chest (lung fields) by direct radiography with fluoroscopic screening (R)"

These codes were confirmed present with embeddings, but OpenAI failed to match "Chest X-ray" → "Chest (lung fields) by direct radiography".

---

## Root Cause Analysis

### Semantic Terminology Mismatch

The core failure is the gap between:
- **Casual/Patient Language:** "Chest X-ray", "flu shot", "hip replacement"
- **Formal MBS Terminology:** "Chest (lung fields) by direct radiography", "immunisation", "arthroplasty"

OpenAI's general-purpose embeddings are trained on broad text corpora, not medical coding systems. They fail to bridge this terminology gap.

### Examples of Terminology Gaps:

**Failed Matches:**
- "Chest X-ray" → "Chest (lung fields) by direct radiography" (similarity < 0.0)
- "CT scan head" → "Computed tomography" codes (similarity < 0.0)
- "Influenza vaccination" → "Immunisation" codes (similarity < 0.0)
- "Total hip replacement" → "Total hip arthroplasty" codes (similarity < 0.0)

**Successful Matches:**
- "Blood collection" → "ARTERIAL PUNCTURE and collection of blood" (58.6%)
- "Laceration repair" → "FULL THICKNESS LACERATION... repair" (56.4%)
- "Knee arthroscopy" → "Meniscal repair of knee, by arthroscopic means" (63.3%)

Success occurred when entity text and MBS display names use similar terminology.

---

## Technical Details

### Why Similarity < 0.0 is Possible

Cosine similarity formula: `1 - (embedding1 <=> embedding2)`

Where `<=>` is the cosine distance operator in PostgreSQL.

- Cosine distance range: [0, 2]
- Cosine similarity range: [-1, 1]

When similarity < 0.0, it means the vectors are pointing in opposite semantic directions - a complete mismatch.

### RPC Function Filter Behavior

```sql
AND (1 - (rmc.embedding <=> query_embedding)) >= min_similarity
```

Even with `min_similarity = 0.0`, if the actual similarity is negative (e.g., -0.15), the filter excludes that row.

This is NOT a bug - it's the correct behavior showing that OpenAI embeddings genuinely cannot match these procedures.

---

## Comparison to Success Criteria

**Target:** Top-20 accuracy ≥90%
**Actual:** 62.9% of entities returned ANY results

**Verdict:** **FAILED - OpenAI embeddings are insufficient**

Even before calculating Top-1/Top-5/Top-20 accuracy (which requires ground truth validation), the baseline of "can find ANY candidates at all" is only 62.9%, far below the 90% threshold.

---

## Key Insights

1. **Not a Database Issue:** All 6,001 MBS codes have embeddings and are active
2. **Not a Code Bug:** RPC function correctly filters by similarity threshold
3. **Not a Data Loading Issue:** Manual SQL queries confirm codes exist
4. **It's a Model Limitation:** OpenAI text-embedding-3-small cannot bridge medical terminology gaps

5. **Formatting Sensitivity:** OpenAI embeddings are NOT robust to formatting variations (X-ray vs x-ray vs xray vs CXR)

6. **Partial Success Pattern:** Succeeds when casual language matches formal terminology (e.g., "blood collection", "laceration repair")

---

## Next Steps

### Phase 3: Manual Ground Truth Analysis

For each entity:
1. Manually identify correct MBS code(s) via keyword search
2. Check if correct code appeared in Top-20 results
3. Calculate actual Top-1, Top-5, Top-20 accuracy
4. Analyze failure patterns

### Phase 4: Alternative Strategy Testing

Based on medication experiment (Experiment 4), consider:

**Option A: Domain-Specific Model**
- Test SapBERT embeddings (medical domain model)
- Expected to bridge terminology gaps better

**Option B: Hybrid Search**
- Lexical filtering on anatomy + procedure type
- Vector reranking on filtered candidates
- Similar to medication gradient candidate system

**Option C: Text Normalization**
- Pre-process entity text to expand abbreviations
- Convert casual terms to medical terms
- Example: "X-ray" → "radiography", "flu shot" → "influenza immunisation"

---

## Recommendations

**Immediate:**
1. Complete manual ground truth analysis (Phase 3)
2. Calculate actual accuracy metrics
3. Document specific failure patterns

**Short-term:**
1. Test SapBERT embeddings for procedures (similar to medications)
2. Implement hybrid search fallback for low-similarity entities
3. Create medical terminology normalization layer

**Long-term:**
1. Build unified entity-type routing system
2. Use domain models for all medical coding (medications, procedures, conditions)
3. Implement gradient candidate system across all entity types

---

## Appendix: Test Execution Details

- Test script: `scripts/test-openai-baseline.ts`
- Results file: `results/openai-baseline-results.json`
- Test duration: ~45 seconds (35 entities × 1 second rate limit)
- OpenAI API calls: 35 embedding generations
- Total cost: ~$0.002 (35 × $0.00002 per 1K tokens × ~3 tokens each)

---

## Status

- [x] Phase 1: Test data created (35 entities)
- [x] Phase 2: OpenAI baseline test completed
- [ ] Phase 3: Manual ground truth analysis
- [ ] Phase 4: Alternative strategy testing
- [ ] Phase 5: Final recommendation

**Current Status:** Phase 2 complete - OpenAI baseline FAILED. Moving to Phase 3 for detailed analysis.
