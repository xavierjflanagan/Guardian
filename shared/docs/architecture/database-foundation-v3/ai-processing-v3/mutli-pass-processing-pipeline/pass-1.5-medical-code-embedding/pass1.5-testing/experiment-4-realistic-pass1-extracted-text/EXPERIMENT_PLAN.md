# Experiment 4: Realistic Pass 1 Extracted Text Validation

**Date:** October 22, 2025
**Status:** Ready to execute

## Objective

**EXPLORATORY DISCOVERY TEST:** Run SapBERT vector search with realistic medication text as extracted by Pass 1, observe top-20 results with similarity scores, and manually evaluate match quality.

**This is NOT an automated pass/fail test** - it's discovery to see what actually ranks where.

## Problem with Experiment 3

**Experiment 3 tested:** Vague queries like "Amoxicillin" expecting specific product "Amoxicillin 500mg capsule"
**Problem:** Arbitrary - dozens of amoxicillin products exist, why expect 500mg specifically?
**Result:** 55% top-20 accuracy but test was fundamentally flawed

## What This Experiment Tests

**Realistic Pass 1 → Pass 1.5 workflow:**
1. Medical document contains: "Amoxicillin 500mg capsules"
2. Pass 1 OCR + entity extraction outputs: "Amoxicillin 500mg capsules"
3. Pass 1.5 embeds that text with SapBERT
4. Pass 1.5 searches PBS codes via vector similarity
5. Check: Is correct PBS code in top-20 results?

## Test Design

### Test Set: 15 Realistic Medications

**10 Generic name medications:**
1. Amoxicillin 500mg capsules
2. Paracetamol 500mg
3. Atorvastatin 20mg
4. Metformin 500mg tablets
5. Aspirin 100mg
6. Omeprazole 20mg capsules
7. Panadol Osteo (brand name for paracetamol 665mg MR)
8. Salbutamol inhaler
9. Clopidogrel 75mg
10. Atenolol 50mg tablets

**5 Brand name medications (paired with generics above):**
11. Amoxil 500mg → Same PBS code as #1
12. Lipitor 20mg → Same PBS code as #3
13. Diabex 500mg → Same PBS code as #4
14. Ventolin → Same PBS code as #8
15. Plavix 75mg → Same PBS code as #9

### Output

For each of 15 medications, display:
- **Query text:** The realistic Pass 1 extracted text
- **Reference code:** For manual comparison (not used for automated validation)
- **Top-20 results:** Ranked by similarity with scores shown as percentages
  - Format: `#1: Amoxicillin Capsule 500mg (as trihydrate) - 87.3%`
  - Format: `#2: Amoxicillin Capsule 250mg (as trihydrate) - 82.1%`

### Manual Evaluation Questions

After reviewing results, answer:
1. **Are any reasonable matches in top-20?**
2. **What's ranking highest and why?**
3. **Does dose/form information help matching?**
4. **Do brand names map to correct generic ingredients?**
5. **What patterns emerge in similarity scores?**
6. **Where does pure SapBERT fail?**

### Method

```sql
-- For each medication query text
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

## Comparison: Experiment 3 vs Experiment 4

| Aspect | Experiment 3 (Flawed) | Experiment 4 (Fixed) |
|--------|----------------------|---------------------|
| Query | "Amoxicillin" | "Amoxicillin 500mg capsules" |
| Expected result | Arbitrary 500mg capsule | Specific 500mg capsule (matches query) |
| Test validity | Invalid (no dose/form in query) | Valid (realistic Pass 1 output) |
| What it measures | Can it guess formulation? | Can it match realistic text? |

## Expected Outcomes

**Hypothesis:** SapBERT will perform significantly better with realistic queries because:
1. Queries include dose/form information (not just drug name)
2. Expected results align with query specificity
3. Tests actual Pass 1 → Pass 1.5 use case

**Prediction:**
- Top-20 accuracy: **85-95%** (vs 55% in Experiment 3)
- Brand name matching: **70-90%** (SapBERT may have learned brand associations)

**Key questions:**
1. Does including dose/form improve matching?
2. Can SapBERT handle brand → generic mapping?
3. Is pure SapBERT sufficient, or do we still need hybrid retrieval?

## Decision Tree

```
Top-20 accuracy ≥ 95%
  → Pure SapBERT is sufficient
  → Skip hybrid retrieval implementation
  → Proceed to Pass 2 integration

Top-20 accuracy 85-95%
  → SapBERT is promising but needs help
  → Implement lightweight lexical pre-filtering
  → Focus on brand name edge cases

Top-20 accuracy < 85%
  → Implement full hybrid retrieval (70% lexical + 30% vector)
  → As originally planned in PASS-1.5-MASTER-PLAN
```

## Implementation

**Test data:** `test-data/realistic-15-medications.json`
**Validation script:** `validate-realistic-pass1-text.ts`
**Database:** 99.42% of PBS codes have SapBERT embeddings (14,298/14,382)

**Execution:**
```bash
npx tsx validate-realistic-pass1-text.ts
```

## Output

**Results file:** `results/realistic-text-validation-results.json`

**Format:**
```json
{
  "summary": {
    "total_queries": 15,
    "top1_accuracy": 0.XXX,
    "top5_accuracy": 0.XXX,
    "top10_accuracy": 0.XXX,
    "top20_accuracy": 0.XXX,
    "brand_generic_comparison": {
      "total_pairs": 5,
      "brand_success_rate": 0.XXX,
      "generic_success_rate": 0.XXX
    }
  },
  "results": [...]
}
```

## Timeline

- Setup: Already complete (test data created)
- Execution: ~5-10 minutes (15 queries × HuggingFace API + vector search)
- Analysis: ~15 minutes

---

**Key Improvement:** This experiment tests the REAL Pass 1 → Pass 1.5 workflow with realistic extracted text, fixing the fundamental methodology flaw from Experiment 3.
