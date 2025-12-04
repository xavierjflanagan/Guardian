# Test 03: OCR vs. Vision Strategy Evaluation

**Status:** IMPLEMENTED - Ready for A/B Testing
**Date:** October 30, 2025
**Context:** Strategic evaluation following Test 02 false positive issues

---

## Purpose

Evaluate three prompt strategies for Pass 0.5 encounter discovery:
1. Current (OCR baseline) - 70-80% accuracy with Phase 2 improvements
2. OCR-optimized - Target 85-90% accuracy
3. Vision - Target 95%+ accuracy (infrastructure not yet implemented)

## Key Architectural Insight

**Pass 0.5 cannot run in parallel with Pass 1** due to batching dependency:

```
Sequential Requirement:
Pass 0.5 Task 1: Encounter Discovery (30s)
    ↓
Pass 0.5 Task 2: Batch Planning (30s) ← MUST complete before Pass 1
    ↓
Pass 1: Entity Detection with batch boundaries
```

Pass 0.5 Task 2 determines WHERE to split large files into batches. Pass 1 needs these batch boundaries before it can start processing.

## Implementation Complete

### Files Created:
1. **`apps/render-worker/src/pass05/aiPromptsOCR.ts`** - OCR-optimized (186 lines)
2. **`apps/render-worker/src/pass05/aiPromptsVision.ts`** - Vision-optimized (261 lines)
3. **`apps/render-worker/src/pass05/encounterDiscovery.ts`** - Strategy switching logic

### Strategy Selection:
Set via `PASS_05_STRATEGY` environment variable on Render.com:
- `ocr` (default): Current baseline with Phase 2 improvements
- `ocr_optimized`: Text pattern-focused approach
- `vision`: Not yet implemented (requires image loading)

## Files in This Test

- **STRATEGY_ANALYSIS.md** - Complete strategic analysis with implementation notes
- **README.md** - This file (test overview)

## Next Steps

1. ✅ Create `aiPromptsOCR.ts` - COMPLETE
2. ✅ Create `aiPromptsVision.ts` - COMPLETE
3. ✅ Add strategy switching to `encounterDiscovery.ts` - COMPLETE
4. **Test Phase 2 baseline** - Re-upload V5 file
5. **A/B test OCR-optimized** - Deploy with `PASS_05_STRATEGY=ocr_optimized`
6. **Compare results** - Accuracy, false positives, cost
7. **Deploy winner** - Based on test results

## Related Tests

- **Test 01:** Integration & constraint fixes
- **Test 02:** End-to-end production flow (revealed false positive issue)
- **Test 03:** Strategy optimization (this test - IMPLEMENTED)
