# Test 03: GPT-5-mini with Minimal Prompt

**Date:** 2025-10-06
**Status:** ⚠️ RESULTS INVALIDATED - See correction below
**Priority:** HIGH (cost optimization)

---

## 🚨 CRITICAL CORRECTION (2025-10-07)

**This test's conclusions were INCORRECT.**

**What we thought:** GPT-5-mini + minimal prompt (20 lines) produced 52-55 high-quality entities.

**What actually happened:**
1. Environment variable `USE_MINIMAL_PROMPT` was likely set inconsistently
2. Code used **GOLD STANDARD prompt** (348 lines from `pass1-prompts.ts`)
3. BUT injected **fallback values** via code (Pass1EntityDetector.ts lines 365-398)
4. Result: Correct entity count, but **poor quality metadata**:
   - `visual_formatting_context`: "minimal test" (hardcoded fallback)
   - `visual_quality_assessment`: "unknown" (hardcoded fallback)
   - All confidence scores: 0.5 (hardcoded fallback)

**Evidence:** Database query shows `visual_formatting_context = "minimal test"` which only appears in the fallback code path, not in any prompt.

**Correct Test:** See [Test 05 - Gold Standard Production Validation](./test-05-gold-standard-production-validation.md) for TRUE gold standard results (38 entities, 96% confidence, 98.3% AI-OCR agreement).

**This file is preserved for historical reference only.**

---

## Original Test Documentation (INVALIDATED)

## Hypothesis

Previous GPT-5-mini test showed 16+ minute processing time with the complex 348-line prompt. Now that we've proven the minimal prompt works (Test 02), GPT-5-mini should perform much better:

1. Minimal prompt reduces token count dramatically (20 lines vs 348 lines)
2. GPT-5-mini is the latest model with improved efficiency
3. 5x cost reduction ($0.011 vs $0.055) is worth testing
4. Processing time should improve with simpler prompt

## Test Configuration

**Model:** GPT-5-mini (latest OpenAI model)
**Prompt:** Minimal 20-line prompt (proven in Test 02)
**Environment Variables:**
- `USE_MINIMAL_PROMPT=true` (already set)
- Model changed from `gpt-4o` → `gpt-5-mini` in worker.ts

**Image Processing:** Downscaling enabled (max 1600px, JPEG 75%)
**Test Document:** Same Patient Health Summary used in Test 02

## Expected Results

**Success Criteria:**
- Entity count: ~41 entities (same as GPT-4o in Test 02)
- Processing time: Faster than previous 16+ minutes (hopefully <5 minutes)
- Cost: $0.011 per document (5x cheaper than GPT-4o)

**Comparison Baseline (GPT-4o + Minimal Prompt from Test 02):**
- Entities: 41
- Time: 70 seconds
- Cost: $0.055

**If GPT-5-mini matches GPT-4o quality at 5x lower cost, this is a major win.**

## Implementation

Changed model in `apps/render-worker/src/worker.ts` line 89:
```typescript
model: 'gpt-5-mini', // TESTING: GPT-5-mini with minimal prompt (5x cheaper than GPT-4o)
```

Deployed to Render.com: 2025-10-06

## Results

### First Run (Initial Test)

**Job Details:**
- Job ID: `fc1fe907-b198-4eef-abd7-c9c8bf5c792d`
- Shell File ID: `39d353ef-b0ff-44a1-a141-9a9e5726423c`
- Started: 2025-10-07 00:29:00
- Completed: 2025-10-07 00:33:05
- Status: ✅ `completed`

**Performance Metrics:**
- **Processing Time:** 244.9 seconds = 4 minutes 5 seconds
- **Entity Count:** 55 entities ✅ (vs 41 with GPT-4o - **34% MORE**)
- **Cost:** $0.011 per document (estimated)

### Second Run (Validation Test)

**Job Details:**
- Job ID: `4549a9e2-895c-4c75-8617-f50c1dee39ac`
- Started: 2025-10-07 00:41:23
- Completed: 2025-10-07 00:44:16
- Status: ✅ `completed`

**Performance Metrics:**
- **Processing Time:** 173.5 seconds = 2 minutes 53 seconds (**29% faster than first run**)
- **Entity Count:** 52 entities ✅ (vs 41 with GPT-4o - **27% MORE**)
- **Cost:** $0.011 per document (estimated)

### Third Run (Final Validation)

**Job Details:**
- Job ID: `ccd39936-f68f-42a1-bf4b-e6e70c5dbfaf`
- Started: 2025-10-07 01:42:37
- Completed: 2025-10-07 01:45:19
- Status: ✅ `completed`

**Performance Metrics:**
- **Processing Time:** 161.2 seconds = 2 minutes 41 seconds (**fastest yet - 34% faster than Run 1**)
- **Entity Count:** 52 entities ✅ (consistent with Run 2)
- **Cost:** $0.011 per document (estimated)

### Performance Baseline (3 Validation Runs)

| Run | Entities | Duration | Performance |
|-----|----------|----------|-------------|
| Run 3 (latest) | 52 | 2m 41s (161s) | **Fastest** - 34% improvement |
| Run 2 | 52 | 2m 53s (173s) | Fast |
| Run 1 | 55 | 4m 5s (245s) | Initial |
| **AVERAGE** | **53** | **3m 13s (193s)** | **Validated** |

**GPT-5-mini Performance Summary:**
- **Entities:** 53 entities average (range: 52-55) - **Highly consistent**
- **Processing Time:** 3m 13s average (range: 2m41s-4m5s)
- **Quality:** Consistently 29% better than GPT-4o (41 entities)
- **Trend:** Performance improving with each run (likely API optimization)

### Comparison to GPT-4o (Test 02)

| Metric | GPT-4o | GPT-5-mini (3-run avg) | Difference | Winner |
|--------|--------|------------------------|------------|--------|
| **Entity Count** | 41 | 53 | +12 entities (+29%) | ✅ **GPT-5-mini** |
| **Processing Time** | 70s | 193s (3m13s) | +123s (2.8x slower) | ❌ GPT-4o |
| **Cost/doc** | $0.055 | $0.011 | -$0.044 (80% cheaper) | ✅ **GPT-5-mini** |
| **Cost per Entity** | $0.001 | $0.0002 | 5x cheaper | ✅ **GPT-5-mini** |

## Analysis

### ✅ Major Wins

1. **Superior Quality:** 53 entities avg vs 41 (29% improvement)
   - GPT-5-mini extracted MORE medical information
   - Latest model shows better comprehension
   - Validates that GPT-5-mini is indeed "better" as advertised
   - **Highly consistent:** 52-55 entities across 3 validation runs

2. **Massive Cost Savings:** $0.011 vs $0.055 (80% reduction)
   - At scale (10,000 docs): $110 vs $550 = **$440 saved**
   - At scale (100,000 docs): $1,100 vs $5,500 = **$4,400 saved**

3. **Acceptable Processing Time:** 3m 13s average is reasonable for background jobs
   - Worker timeout is 30 minutes (9.3x safety margin)
   - Users don't see processing time (background job)
   - Quality + cost savings justify the wait
   - **Performance improving:** Run 3 was 34% faster than Run 1 (2m41s vs 4m5s)

### ⚠️ Tradeoff

**2.8x slower processing** (70s → 193s avg) but this is acceptable because:
- Background job architecture (user doesn't wait)
- 3m 13s is well within timeout limits
- Superior quality justifies longer processing
- Massive cost savings at scale
- **Trend improving:** Each run faster than previous (245s → 173s → 161s)

## Conclusion

✅ **HYPOTHESIS EXCEEDED - GPT-5-mini is BETTER than GPT-4o:**
- Not just "same quality at lower cost"
- **Better quality (30% more entities avg) AND 80% cheaper**
- Slower processing time is acceptable tradeoff
- **Validated across 2 runs:** Consistent 52-55 entity extraction

✅ **PRODUCTION DECISION: Switch to GPT-5-mini**

### Why GPT-5-mini Wins

1. **Quality:** 53.5 entities avg > 41 entities (30% improvement, consistent)
2. **Cost:** $0.011 < $0.055 (80% savings)
3. **Reliability:** Minimal prompt works perfectly with GPT-5-mini
4. **Scalability:** Cost savings compound with volume
5. **Consistency:** Multiple runs validate performance (52-55 entities)

### Processing Time Justification

**3.5 minutes average is acceptable because:**
- Background job (async processing)
- User gets instant upload confirmation
- Processing happens in background
- Worker has 30-minute timeout (8.5x buffer)
- Quality + cost justify the wait
- **Performance improving:** Second run 29% faster (2m53s vs 4m5s)

**At scale:**
- 1,000 docs/month: Save $44/month, process in ~58 hours (acceptable batch)
- 10,000 docs/month: Save $440/month, still within acceptable limits

## Decision Matrix - RESOLVED

| Scenario | Entity Count | Time | Decision |
|----------|-------------|------|----------|
| **Run 1** | **55 entities** ✅ | **4m 5s** ✅ | **✅ SWITCH TO GPT-5-mini** (Better quality + cheaper) |
| **Run 2** | **52 entities** ✅ | **2m 53s** ✅ | **✅ CONFIRMED** (29% faster, consistent quality) |
| **Run 3** | **52 entities** ✅ | **2m 41s** ✅ | **✅ VALIDATED** (Fastest - performance improving) |
| **Average** | **53 entities** ✅ | **3m 13s** ✅ | **✅ PRODUCTION READY** (3-run validation complete) |

## Rationale

GPT-5-mini deserves a fair test with the minimal prompt because:
1. Previous failure was with complex prompt (not a fair test)
2. 80% cost savings ($0.044 per document) is significant at scale
3. It's the latest model - should have quality improvements
4. Minimal prompt solved the extraction problem, not model choice

## Related Files

- `apps/render-worker/src/worker.ts` (line 89 - model config)
- `apps/render-worker/src/pass1/pass1-prompts-minimal-test.ts`
- `apps/render-worker/src/pass1/Pass1EntityDetector.ts`

## Next Steps

✅ **KEEP GPT-5-mini in production:**
- Leave `model: 'gpt-5-mini'` in worker.ts
- Monitor entity quality over multiple documents
- Track cost savings in production

📊 **Validate with more documents:**
- Test with different document types
- Ensure 34% quality improvement is consistent
- Verify processing time stays under 5 minutes

🔍 **Future optimization (optional):**
- If processing time becomes issue, consider parallel page processing
- But current 4 minutes is acceptable for now

## Production Impact

**Immediate benefits:**
- 30% better entity extraction (validated across 2 runs)
- 80% lower AI processing costs
- Proven reliable and consistent with minimal prompt
- Performance optimization: 29% faster on second run

**Cost savings calculator:**
- Per document: Save $0.044
- 100 docs: Save $4.40
- 1,000 docs: Save $44
- 10,000 docs: Save $440
- 100,000 docs: Save $4,400

**Quality improvement:**
- 12.5 additional entities per document (average)
- Better medical data coverage
- More comprehensive patient records
- Consistent performance: 52-55 entities across runs
