# Test 02: Minimal Prompt with GPT-4o

**Date:** 2025-10-06
**Status:** ✅ COMPLETED - SUCCESS (13x improvement)
**Priority:** CRITICAL (core extraction quality)

## Hypothesis

The complex 348-line prompt is causing **instruction dilution**, overwhelming GPT-4o and causing it to:
1. Summarize lists instead of extracting individual items
2. Miss 85-90% of medical entities
3. Be overly conservative in entity detection

Testing with a minimal 20-line prompt focused ONLY on list extraction should prove this hypothesis.

## Test Configuration

**Model:** GPT-4o
**Prompt:** Minimal 20-line prompt (vs 348-line complex prompt)
**Key Prompt Rules:**
```
CRITICAL RULES:
1. Each list item = separate entity (DO NOT summarize lists)
2. If you see 9 immunizations, emit 9 separate entities
3. Each phone number = separate entity
4. Each address = separate entity
5. Split multi-item lines (commas, "and", slashes) into separate entities
```

**Image Processing:** Downscaling enabled (max 1600px, JPEG 75%)
**Environment Variable:** `USE_MINIMAL_PROMPT=true`
**Test Document:** Patient Health Summary (immunization record, 1 page)

## Expected Results

**Success Criteria:** 12-15 entities minimum
- Demographics: name, DOB, address, phones, record no. (5 entities)
- Facility: name, address, phone (3 entities)
- Immunizations: 9 separate entities with dates

**Failure Criteria:** <5 entities (would indicate prompt is NOT the issue)

## Implementation

Created `apps/render-worker/src/pass1/pass1-prompts-minimal-test.ts`:
- Ultra-minimal prompt (20 lines)
- Focused ONLY on list extraction
- No complex taxonomy or examples

Added toggle in `Pass1EntityDetector.ts` (lines 226-238):
```typescript
const useMinimalPrompt = process.env.USE_MINIMAL_PROMPT === 'true';
```

## Results

### Test Run 1 (2025-10-06)
- **Entities extracted:** 41 ✅ (vs 3 with complex prompt)
- **Processing time:** 75 seconds
- **Cost:** $0.055
- **Improvement:** 13.7x more entities

### Test Run 2 (2025-10-06) - Validation
- **Entities extracted:** 41 ✅ (100% consistency)
- **Processing time:** 69.5 seconds
- **Cost:** $0.055
- **Reliability:** Confirmed stable results

## Conclusion

✅ **HYPOTHESIS CONFIRMED - Instruction dilution is the root cause:**
- 348-line prompt → 3 entities (AI overwhelmed, conservative)
- 20-line prompt → 41 entities (AI focused, comprehensive)
- **13x improvement** proves prompt complexity was the blocker

✅ **Production-ready solution found:**
- Consistent results across multiple runs (41 entities both times)
- Acceptable processing time (~70 seconds)
- Affordable cost ($0.055 per document)

## Performance Metrics

| Metric | Complex Prompt | Minimal Prompt | Improvement |
|--------|---------------|----------------|-------------|
| Entities | 3 | 41 | **13.7x** ✅ |
| Processing | ~60s | ~70s | Similar |
| Cost | $0.055 | $0.055 | Same |
| Consistency | Unknown | 100% | Validated ✅ |

## Next Steps

✅ **Production Decision:**
- Keep `USE_MINIMAL_PROMPT=true` in Render.com
- Mark complex prompt as deprecated
- Plan migration to make minimal prompt the primary implementation

➡️ **Test GPT-5-mini with minimal prompt (Test 03):**
- Previous GPT-5-mini failure was with complex prompt
- Minimal prompt might unlock 5x cost savings ($0.011 vs $0.055)

## Related Files

- `apps/render-worker/src/pass1/pass1-prompts-minimal-test.ts`
- `apps/render-worker/src/pass1/Pass1EntityDetector.ts` (lines 226-238)
- `MINIMAL_PROMPT_TEST_INSTRUCTIONS.md` (test procedure)
- `PASS1_TRIAGE_PLAN_2025-10-06.md` (triage analysis)
