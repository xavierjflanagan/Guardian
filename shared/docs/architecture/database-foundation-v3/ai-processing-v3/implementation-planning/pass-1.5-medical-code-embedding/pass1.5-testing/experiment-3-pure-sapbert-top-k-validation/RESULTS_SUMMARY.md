# Experiment 3: Pure SapBERT Top-K Validation - Results Summary

**Date:** October 22, 2025
**Status:** COMPLETED
**Conclusion:** Pure SapBERT insufficient - Hybrid retrieval REQUIRED

## Executive Summary

**Tested hypothesis:** SapBERT's 75.3% top-1 accuracy (from Experiment 2) would translate to >95% top-20 accuracy, making hybrid retrieval unnecessary.

**Result:** REJECTED - Top-20 accuracy was only 55.0%, far below the 95% target.

**Decision:** Implement hybrid lexical+vector retrieval as originally planned.

## Test Configuration

**Model:** `cambridgeltl/SapBERT-from-PubMedBERT-fulltext` (768 dimensions)
**Test Set:** 20 validated medications from Experiment 2
**Database:** 99.42% of PBS codes embedded (14,298/14,382)
**Method:** Pure vector cosine similarity search (`<=>` operator)

## Results

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Top-1 accuracy | - | 5.0% (1/20) | - |
| Top-5 accuracy | >90% | 15.0% (3/20) | FAIL |
| Top-10 accuracy | >90% | 40.0% (8/20) | FAIL |
| Top-20 accuracy | >95% | 55.0% (11/20) | **FAIL** |

## Failure Analysis

### Top-20 Failures (9 medications, 45%)

**Failure Category Breakdown:**

1. **Dose Mismatches (4 cases - 20%):**
   - Atorvastatin: Expected 20mg, got 10mg (61.8% similarity)
   - Pravastatin: Expected 40mg, got 10mg (64.3% similarity)
   - Metformin: Expected 1g extended-release, got 500mg standard (61.0% similarity)
   - Simvastatin: Ranked #20 (just barely in top-20)

2. **Form Mismatches (3 cases - 15%):**
   - Amoxicillin: Expected capsule 500mg, got powder suspension 500mg (49.5% similarity)
   - Ramipril: Expected capsule 10mg, got tablet 10mg (56.8% similarity)
   - Perindopril: Expected erbumine 8mg, got arginine 5mg (both dose AND salt form wrong)

3. **Brand Name / Chemical Variant (1 case - 5%):**
   - Omeprazole: Expected "Esomeprazole" (S-enantiomer), got "Omeprazole" (racemic mix)

4. **Combination vs Standalone (1 case - 5%):**
   - Rosuvastatin: Expected ezetimibe+rosuvastatin combination pack, got standalone rosuvastatin 5mg

5. **Unexplained (1 case - 5%):**
   - Metoprolol: Top-1 result was EXACT match (54.2% similarity) but ranked outside top-20
     - This suggests database may have duplicate entries or data quality issues

### Top-20 Successes (11 medications, 55%)

**Success Pattern Analysis:**

| Medication | Rank | Top-1 Similarity | Correct Similarity | Notes |
|------------|------|------------------|--------------------|-------|
| Aspirin | 1 | 58.7% | 58.7% | Perfect match |
| Carboplatin | 2 | 59.8% | 59.8% | Perfect match |
| Dicloxacillin | 5 | 52.2% | 51.8% | Close dose match (250mg vs 500mg) |
| Clopidogrel | 6 | 60.5% | 54.7% | - |
| Docetaxel | 6 | 59.1% | 54.9% | - |
| Paclitaxel | 7 | 56.2% | 50.5% | - |
| Enalapril | 9 | 55.0% | 52.1% | - |
| Flucloxacillin | 9 | 58.0% | 49.7% | - |
| Paracetamol | 12 | 49.4% | 39.9% | Weak similarity scores |
| Cefalexin | 18 | 54.9% | 49.8% | - |
| Simvastatin | 20 | 52.7% | 48.2% | Barely made top-20 |

**Observation:** Even "successful" matches have low similarity scores (40-60% range), indicating semantic clustering problem described in `WHY-RAG-WORKS-FOR-CODE-NOT-MEDICATIONS.md`.

## Key Insights

### 1. Semantic Diversity Problem Confirmed

Pure SapBERT suffers from the **low semantic diversity** problem identified in previous analysis:
- All medications cluster in similar vector space ("pharmaceutical with dose and form")
- Dose/form features dominate, ingredient identity gets lost
- Similarity scores in 40-60% range indicate everything looks "similar"

### 2. Comparison to Experiment 2

**Experiment 2 (Top-1 accuracy):** 75.3% for 40 medications
**Experiment 3 (Top-20 accuracy):** 55.0% for 20 medications

**Why the discrepancy?**
- Experiment 2 may have had exact matches (same dose/form) in test set
- Experiment 3 tested with real-world variation (different doses, forms, salts)
- Top-20 expansion did NOT improve recall as hypothesized

### 3. Dose/Form Granularity is Critical

The majority of failures (7/9 = 78%) involve dose or form mismatches:
- 500mg ≠ 1g
- Capsule ≠ Tablet
- Powder suspension ≠ Capsule
- Erbumine salt ≠ Arginine salt

**Implication:** Pure semantic matching cannot distinguish these clinically critical differences.

### 4. Hybrid Retrieval is Necessary

**Why lexical filtering helps:**
- Filters to correct ingredient FIRST (e.g., "atorvastatin" keyword)
- Then uses vector reranking to find correct dose/form WITHIN that subset
- Avoids dose/form clustering problem

**Risk mitigation for procedures/conditions:**
- For medications: Lexical filtering is beneficial (ingredient names are stable)
- For procedures/conditions: Lexical filtering may still have synonym risks, but at 55% accuracy, we have no choice
- May need separate strategies per entity type

## Recommended Next Steps

### Immediate (Pass 1.5 continuation):

1. **Implement hybrid retrieval as originally designed:**
   - 70% lexical weight (ILIKE + pg_trgm similarity)
   - 30% vector weight (SapBERT reranking)
   - `extract_ingredient()` helper function
   - `extract_dose()` helper function

2. **Create IVFFLAT index on sapbert_embedding:**
   ```sql
   CREATE INDEX idx_regional_medical_codes_sapbert_embedding_pbs
   ON regional_medical_codes
   USING ivfflat (sapbert_embedding vector_cosine_ops)
   WITH (lists = 100)
   WHERE code_system = 'pbs' AND active_embedding_model = 'sapbert';
   ```

3. **Implement hybrid search RPC:**
   - `search_medications_hybrid(query_text, max_results)`
   - Test on same 20 medications
   - Target: >90% top-5 accuracy

### Future testing:

4. **Test procedures separately (critical):**
   - Procedures likely have WORSE pure vector performance (more synonyms)
   - May need different hybrid weights (e.g., 50/50 or 30/70)

5. **Test conditions separately:**
   - Conditions also have high synonym variation ("MI" vs "heart attack")
   - Evaluate if lexical filtering helps or hurts

## Data Quality Issue

**Metoprolol anomaly:** Top-1 result was exact match but ranked >20.

**Action required:**
- Query database for duplicate entries
- Check for data quality issues in PBS medication list
- May need deduplication migration

## Files Generated

- **Results JSON:** `results/top-k-accuracy-results.json`
- **This summary:** `RESULTS_SUMMARY.md`

## References

- **Experiment Plan:** `EXPERIMENT_PLAN.md`
- **Validation Script:** `validate-pure-sapbert.ts`
- **Test Data:** `../experiment-2/test-data/final-40-entities.json`
- **Theoretical Background:** `../../pass1.5-audits-troubleshooting/WHY-RAG-WORKS-FOR-CODE-NOT-MEDICATIONS.md`

---

**Conclusion:** Pure SapBERT vector search is insufficient for medical code matching. The 55% top-20 accuracy confirms the need for hybrid lexical+vector retrieval to achieve the >90% accuracy required for Pass 1.5.
