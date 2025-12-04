# Experiment 3: Pure SapBERT Top-K Validation

**Date:** October 22, 2025
**Status:** Ready to execute (awaiting embedding completion)

## Objective

Test if pure SapBERT vector search achieves >95% accuracy for correct code in top-20 results, eliminating need for hybrid lexical+vector approach.

## Hypothesis

**Null hypothesis:** SapBERT's 75.3% top-1 accuracy translates to >95% top-20 accuracy, making hybrid retrieval unnecessary.

**Rationale:**
- Experiment 2 measured top-1 accuracy (75.3%)
- Pass 1.5 goal: Correct code in top-10 to top-20 candidates (for Pass 2 AI selection)
- Medical-domain SapBERT may rank correct codes highly even when not #1

## Test Design

### Test Set
- 40 validated medications from Experiment 2 (ground truth established)
- File: `experiment-2/test-data/final-40-entities.json`

### Metrics
Measure for each query:
1. **Top-1 accuracy** (baseline: 75.3% from Experiment 2)
2. **Top-5 accuracy** (target: >90%)
3. **Top-10 accuracy** (target: >95%)
4. **Top-20 accuracy** (target: >95%)

### Method
```sql
SELECT
  code_value,
  display_name,
  1 - (sapbert_embedding <=> query_embedding) as similarity_score
FROM regional_medical_codes
WHERE code_system = 'pbs'
  AND sapbert_embedding IS NOT NULL
ORDER BY sapbert_embedding <=> query_embedding
LIMIT 20;
```

### Success Criteria

**Pure SapBERT is sufficient if:**
- Top-20 accuracy ≥ 95% (correct code in top-20 for 38+/40 queries)
- Top-10 accuracy ≥ 90% (correct code in top-10 for 36+/40 queries)

**Hybrid retrieval needed if:**
- Top-20 accuracy < 95%
- Systematic failures (e.g., all combinations rank higher than standalone)

### Failure Analysis

For each top-20 miss, document:
- Query medication
- Actual top-20 results
- Why correct code missing (wrong drug class? dose? form?)
- Would lexical filtering have helped or hurt?

## Decision Tree

```
Top-20 accuracy ≥ 95%
  → Use pure SapBERT, skip hybrid
  → Simpler implementation, fewer failure modes
  → Avoids lexical filtering risks (synonyms, brand names, typos)

Top-20 accuracy 90-95%
  → Expand test to 100 medications
  → Analyze failure patterns
  → Re-evaluate

Top-20 accuracy < 90%
  → Implement hybrid retrieval
  → Accept lexical filtering trade-offs
```

## Risks of Hybrid Approach

**For medications:**
- Filters out brand names (Panadol → paracetamol miss)
- Regional variations (acetaminophen vs paracetamol)
- Typos despite pg_trgm fuzzy matching

**For procedures/conditions (CRITICAL):**
- Medical synonyms have zero lexical overlap
- Examples: "cholecystectomy" vs "gallbladder removal", "MI" vs "heart attack", "SLE" vs "lupus"
- Lexical filtering would destroy recall for procedures/conditions

**Conclusion:** If pure SapBERT works for medications, it's the ONLY viable approach for procedures/conditions.

## Implementation

**Script location:** `pass1.5-testing/experiment-3-pure-sapbert-top-k-validation/validate-pure-sapbert.ts`

**Dependencies:**
- SapBERT embeddings: 98.48% complete (218/14,382 remaining as of 2025-10-22 04:40 UTC)
- Test data: `experiment-2/test-data/final-40-entities.json`

**Execution:**
```bash
npx tsx pass1.5-testing/experiment-3-pure-sapbert-top-k-validation/validate-pure-sapbert.ts
```

## Output

**Results file:** `results/top-k-accuracy-results.json`

**Format:**
```json
{
  "summary": {
    "top1_accuracy": 0.753,
    "top5_accuracy": 0.XXX,
    "top10_accuracy": 0.XXX,
    "top20_accuracy": 0.XXX,
    "total_queries": 40
  },
  "failures": [
    {
      "query": "Amoxicillin 500mg",
      "expected_code": "PBS:1234X",
      "top20_codes": [...],
      "correct_rank": null,
      "analysis": "..."
    }
  ]
}
```

## Timeline

- Setup: 15 minutes (create validation script)
- Execution: 5 minutes (40 queries × vector search)
- Analysis: 15 minutes (review failures)
- **Total: ~35 minutes**

## Next Steps Based on Results

**If successful (≥95% top-20):**
1. Update MASTER-PLAN to use pure SapBERT
2. Skip hybrid retrieval implementation
3. Create IVFFLAT index on sapbert_embedding
4. Proceed to Pass 2 integration testing

**If unsuccessful (<95% top-20):**
1. Analyze failure patterns
2. Design hybrid retrieval strategy
3. Implement lexical+vector approach
4. Re-validate with hybrid

---

**Key Insight:** We should validate the simpler approach (pure vector) before adding complexity (hybrid). Experiment 2 measured the wrong metric (top-1 vs top-20) for our use case.
