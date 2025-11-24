# A/B Testing Results

**Status:** NOT YET STARTED
**Purpose:** Compare Pass 0.5 prompt strategies after baseline validation complete

---

## Overview

This directory will contain A/B testing results comparing three Pass 0.5 strategies:

1. **Baseline (Current):** Phase 2 improved prompt with Document Unity Analysis
   - File: `apps/render-worker/src/pass05/aiPrompts.ts`
   - Target Accuracy: 70-80%
   - Strategy: `PASS_05_STRATEGY=ocr` (default)

2. **OCR-Optimized:** Text pattern-focused prompt
   - File: `apps/render-worker/src/pass05/aiPromptsOCR.ts`
   - Target Accuracy: 85-90%
   - Strategy: `PASS_05_STRATEGY=ocr_optimized`

3. **Vision (Future):** Image-based analysis
   - File: `apps/render-worker/src/pass05/aiPromptsVision.ts`
   - Target Accuracy: 95%+
   - Strategy: `PASS_05_STRATEGY=vision`
   - Status: Infrastructure not implemented

---

## Prerequisites

Before A/B testing can begin:
- ✅ Baseline validation must be complete (`baseline-validation/RESULTS.md`)
- ✅ Baseline accuracy established as benchmark
- ✅ Test files identified and prepared
- ⏳ OCR-optimized strategy deployed to Render.com
- ❌ Vision strategy infrastructure (requires image loading)

---

## A/B Testing Plan

### Test Methodology

**Same Files, Different Strategies:**
1. Upload same medical records with baseline strategy
2. Record results (encounter count, types, accuracy)
3. Deploy OCR-optimized strategy (`PASS_05_STRATEGY=ocr_optimized`)
4. Re-upload same files
5. Compare results side-by-side

**Test Files (from baseline validation):**
- 142-page Hospital Encounter (batching test)
- 11-document multi-upload (boundary detection)
- 15-page Office Visit (unified document)
- Emergency summaries (real visit detection)
- Medication photo (pseudo-encounter)

### Comparison Metrics

| Metric | Baseline | OCR-Optimized | Vision | Winner |
|--------|----------|---------------|--------|--------|
| Encounter Detection Accuracy | TBD | TBD | TBD | TBD |
| False Positive Rate | TBD | TBD | TBD | TBD |
| False Negative Rate | TBD | TBD | TBD | TBD |
| Batching Accuracy | TBD | TBD | TBD | TBD |
| Avg Processing Time | TBD | TBD | TBD | TBD |
| Token Cost (per document) | TBD | TBD | TBD | TBD |
| Timeline Test Accuracy | TBD | TBD | TBD | TBD |

### Success Criteria

**Deploy Winner if:**
- Accuracy improvement ≥10% over baseline
- No increase in false positives
- Processing time acceptable (<90s per document)
- Cost increase justified by accuracy gains

**Keep Baseline if:**
- Minimal accuracy improvement (<5%)
- Increased false positives
- Significant cost increase without accuracy gain

---

## Future Files

When A/B testing begins, this directory will contain:

1. **AB_TESTING_RESULTS.md** - Side-by-side comparison of all strategies
2. **DECISION.md** - Final decision on which strategy to deploy
3. **METRICS_ANALYSIS.md** - Detailed statistical analysis
4. **COST_BENEFIT_ANALYSIS.md** - Token cost vs accuracy trade-offs

---

**Last Updated:** October 31, 2025
**Status:** Awaiting baseline validation completion
