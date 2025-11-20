# v2.7 Integration Guide

**Date:** 2025-11-05
**Status:** READY FOR TESTING
**Integration Method:** Environment variable version switching

---

## What Was Done

### Files Created/Modified:

1. **Created:** `aiPrompts.v2.7.ts`
   - v2.7 optimized prompt adapted for worker
   - Includes document information injection (page count, OCR confidence)
   - Same function signature as v2.4 for compatibility

2. **Modified:** `encounterDiscovery.ts`
   - Added `PASS_05_VERSION` environment variable support
   - Imports both v2.4 and v2.7 prompt builders
   - Intelligent selection based on env var

3. **Untouched:** `aiPrompts.ts` (v2.4)
   - Current production prompt remains unchanged
   - Safe rollback available

---

## How to Use

### Test v2.7 (Recommended for Testing):
```bash
export PASS_05_VERSION=v2.7
npm run worker
```

### Revert to v2.4 (Default - Current Production):
```bash
unset PASS_05_VERSION
# OR
export PASS_05_VERSION=v2.4
npm run worker
```

### Combined with Strategy (if using OCR optimized):
```bash
export PASS_05_STRATEGY=ocr_optimized  # Uses aiPromptsOCR.ts
export PASS_05_VERSION=v2.7           # Ignored (ocr_optimized has own prompt)
```

---

## Environment Variable Behavior

### PASS_05_VERSION
- **Default:** `v2.4` (if not set)
- **Options:** `v2.4` | `v2.7`
- **Applies to:** Only when `PASS_05_STRATEGY=ocr` (or unset)

### PASS_05_STRATEGY
- **Default:** `ocr` (if not set)
- **Options:** `ocr` | `ocr_optimized` | `vision`
- **Priority:** If set to `ocr_optimized`, version is ignored

### Decision Matrix:

| PASS_05_STRATEGY | PASS_05_VERSION | Prompt Used |
|-----------------|-----------------|-------------|
| (unset) | (unset) | v2.4 (current production) |
| (unset) | v2.7 | v2.7 (optimized) |
| ocr | (unset) | v2.4 |
| ocr | v2.7 | v2.7 |
| ocr_optimized | (any) | OCR optimized (ignores version) |

---

## Testing Workflow

### Step 1: Deploy Worker with v2.7 Support
```bash
# Commit and push changes
git add apps/render-worker/src/pass05/aiPrompts.v2.7.ts
git add apps/render-worker/src/pass05/encounterDiscovery.ts
git commit -m "feat(pass05): Add v2.7 optimized prompt with environment variable switching"
git push

# Render.com will auto-deploy
```

### Step 2: Set Environment Variable on Render.com
1. Go to Render.com dashboard
2. Select "Exora Health" worker service
3. Environment → Add Environment Variable
4. Key: `PASS_05_VERSION`
5. Value: `v2.7`
6. Save (will trigger redeploy)

### Step 3: Upload Test Files
Upload in this order:
1. **Frankenstein file** (critical boundary test)
2. **TIFF lab report** (date extraction test)
3. **Admin summary** (single encounter test)

### Step 4: Check Results
Compare v2.7 results against expected:
- Check logs: `[Pass 0.5] Using strategy: ocr, version: v2.7`
- Verify encounter detection
- Verify boundary pages
- Verify date extraction

### Step 5: Decide
**If v2.7 passes all tests:**
- Keep `PASS_05_VERSION=v2.7` in production
- Update documentation

**If v2.7 fails critical tests:**
- Change to `PASS_05_VERSION=v2.4` (instant rollback)
- Implement Option A (add 5 critical items)
- Create v2.8 and test again

---

## Logging

When worker starts, you'll see:
```
[Pass 0.5] Using strategy: ocr, version: v2.7
```

This confirms which prompt is being used.

---

## Comparison Testing (Optional)

To compare v2.4 vs v2.7 side-by-side:

### Upload same file twice with different versions:

**Test 1: Upload with v2.4**
```bash
# On Render.com: Set PASS_05_VERSION=v2.4
# Upload file
# Record: encounters detected, boundaries, dates
```

**Test 2: Upload with v2.7**
```bash
# On Render.com: Set PASS_05_VERSION=v2.7
# Upload SAME file
# Record: encounters detected, boundaries, dates
```

**Compare Results:**
- Number of encounters should match
- Boundary pages should match
- Encounter types should match
- Confidence scores can vary slightly
- Summaries can vary in wording

---

## Safety Features

### 1. Backward Compatibility
- Default behavior unchanged (v2.4)
- No breaking changes to API
- Same JSON output structure

### 2. Easy Rollback
- Single environment variable change
- No code changes needed
- Instant reversion

### 3. No Data Loss Risk
- Both versions use same database schema
- Same field names
- Same validation logic

---

## What Changed in v2.7

**Optimizations:**
- Timeline Test moved to top
- Examples moved early
- Consolidated redundant sections
- Removed duplicate DO NOT lists
- ~500 token reduction (11%)

**Bug Fixes:**
- Lab reports with dates → timeline-worthy (v2.4 fix preserved)
- Planned encounters → isRealWorldVisit: false (v2.7 fix)
- Date precision → YYYY-MM or YYYY-MM-DD (v2.7 fix)
- Page assignment → no "skip pages" contradiction (v2.7 fix)

**Schema Alignment:**
- All field names match types.ts
- All encounter types from EncounterType union
- encounter_id consistency enforced

**What Was Removed (Potential Risk):**
- Boundary detection priority list (1-9 weighted system)
- Document header vs metadata distinction details
- Pattern D example (Frankenstein test scenario)
- Metadata patterns A/B/C examples
- Confidence <0.50 reconsider note

---

## Known Risks

### HIGH RISK:
- **Frankenstein file boundary detection** may fail without priority list and Pattern D
- If boundary detected at wrong page → implement Option A

### MEDIUM RISK:
- **Metadata page assignment** may be less accurate without patterns
- **Very low confidence** encounters without <0.50 guardrail

### LOW RISK:
- Simple single-document files should work fine
- Basic pseudo-encounter logic preserved

---

## Next Steps After Testing

### If All Tests Pass:
1. Keep v2.7 in production
2. Monitor next 10-20 uploads
3. Consider Phase 2 optimization

### If Frankenstein Fails:
1. Revert to v2.4 immediately
2. Create v2.8 with 5 critical items added back
3. Re-test

### If Mixed Results:
1. Document specific failures
2. Share results for analysis
3. Targeted fixes for v2.8

---

## Deployment Checklist

Before deploying v2.7 to production:

- [ ] Code committed and pushed to main
- [ ] Render.com auto-deployed successfully
- [ ] Environment variable `PASS_05_VERSION=v2.7` set
- [ ] Worker logs show correct version
- [ ] Frankenstein file test completed
- [ ] TIFF lab report test completed
- [ ] Admin summary test completed
- [ ] Results documented
- [ ] Decision made (keep v2.7 or rollback/fix)

---

## Contact

If you encounter issues or unexpected behavior:
1. Check worker logs for version confirmation
2. Compare results against v2.4 baseline
3. Document specific failures
4. Consult TESTING_PLAN_v2.7.md for expected behavior
5. Review CROSS_CHECK_v2.7_vs_ORIGINAL.md for known missing items

---

## Summary

**Integration is COMPLETE and READY FOR TESTING.**

- v2.7 prompt available via `PASS_05_VERSION=v2.7`
- v2.4 remains default (safe)
- Easy rollback via environment variable
- No code changes needed to switch versions

**Test with real files and report results!**