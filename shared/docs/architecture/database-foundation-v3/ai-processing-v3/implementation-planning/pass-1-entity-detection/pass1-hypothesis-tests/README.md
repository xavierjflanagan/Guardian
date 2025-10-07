# Pass 1 Entity Detection - Hypothesis Tests

**Purpose:** Document systematic testing of Pass 1 entity extraction quality, performance, and cost optimization.

## Test Overview

| Test | Hypothesis | Status | Result | Impact |
|------|-----------|--------|--------|--------|
| [Test 01](./test-01-image-downscaling.md) | Image downscaling reduces tokens | ✅ Success | 35.8% reduction | Performance optimization |
| [Test 02](./test-02-minimal-prompt-gpt4o.md) | Minimal prompt solves under-extraction | ✅ Success | 13x improvement (3→41 entities) | **CRITICAL** - Core quality fix |
| [Test 03](./test-03-gpt5-mini-minimal-prompt.md) | GPT-5-mini cheaper with minimal prompt | ✅ Success | **30% better + 80% cheaper!** (validated 2 runs) | **PRODUCTION WINNER** |

## Problem Statement

Pass 1 entity detection was only extracting 3 entities from documents that should yield 15+ entities (85-90% data loss). This made the product non-functional.

## Root Cause Analysis

**Identified:** Instruction dilution from complex 348-line prompt

**Evidence:**
- Complex prompt (348 lines) → 3 entities
- Minimal prompt (20 lines) → 41 entities
- 13.7x improvement proves prompt complexity was the blocker

## Key Learnings

### ✅ What Worked

1. **Image Downscaling (Test 01)**
   - 35.8% file size reduction
   - Lower token usage
   - No quality degradation
   - **Keep in production**

2. **Minimal Prompt Approach (Test 02)**
   - 13x entity extraction improvement
   - Focused instructions beat verbose taxonomy
   - Simple rules work better than complex examples
   - **Production-ready solution**

### ❌ What Didn't Work

1. **Complex 348-line Prompt**
   - Overwhelmed AI with too many instructions
   - Caused conservative extraction behavior
   - List summarization instead of item-by-item extraction
   - **Deprecated - do not use**

2. **GPT-5-mini with Complex Prompt (previous test)**
   - 16+ minute processing time
   - Not a fair test of model capability
   - Re-testing with minimal prompt (Test 03)

## Testing Methodology

### Test Document

**Standard:** Patient Health Summary (immunization record)
- 1 page
- Expected entities: 15+ (demographics, facility, 9 immunizations)
- Used consistently across all tests for comparison

### Success Criteria

- **Entity count:** 12+ entities minimum (ideally 15+)
- **Processing time:** <5 minutes acceptable for background jobs
- **Cost:** <$0.10 per document acceptable for production
- **Consistency:** Results must be reproducible across runs

### Evaluation Process

1. Upload test document
2. Wait for processing completion
3. Query `entity_processing_audit` table for entity count
4. Check `job_queue` table for timing
5. Review Render.com logs for detailed breakdown
6. Calculate cost based on token usage
7. Compare against baseline (GPT-4o + complex prompt = 3 entities)

## Current Production Configuration

**Model:** GPT-5-mini (Test 03 winner - better quality + cheaper!)
**Prompt:** Minimal 20-line prompt
**Environment:** `USE_MINIMAL_PROMPT=true`
**Image Processing:** Downscaling enabled (1600px, JPEG 75%)
**Performance:** 53.5 entities avg in 3.5 minutes at $0.011/doc (validated across 2 runs)

## Completed Tests Summary

### Test 03: GPT-5-mini + Minimal Prompt ✅ WINNER
- **Goal:** Achieve same quality (41 entities) at 5x lower cost
- **Result:** EXCEEDED - 53.5 entities avg (30% better) at 80% lower cost
- **Validation:** 2 runs confirmed consistency (52-55 entities, 2m53s-4m5s)
- **Decision:** **Switch to GPT-5-mini in production**

### Future Tests (Optional)

- **Test 04:** GPT-4o-mini with minimal prompt (balance cost/quality)
- **Test 05:** Page-by-page processing for multi-page documents
- **Test 06:** Parallel page processing for speed optimization

## Related Documentation

- [MINIMAL_PROMPT_TEST_INSTRUCTIONS.md](/MINIMAL_PROMPT_TEST_INSTRUCTIONS.md) - Test procedure
- [PASS1_TRIAGE_PLAN_2025-10-06.md](/PASS1_TRIAGE_PLAN_2025-10-06.md) - Triage analysis
- [GPT5_REVIEW_ANALYSIS.md](/GPT5_REVIEW_ANALYSIS.md) - Architecture review

## Metrics Dashboard

### Entity Extraction Quality

| Configuration | Entities | Expected | % Coverage |
|---------------|----------|----------|-----------|
| GPT-4o + Complex Prompt | 3 | 15+ | 20% ❌ |
| GPT-4o + Minimal Prompt | 41 | 15+ | 273% ✅ |
| **GPT-5-mini + Minimal Prompt** | **53.5 avg** (52-55) | 15+ | **357%** ✅✅ **WINNER**|

### Cost Analysis

| Model | Prompt | Cost/Doc | Entities | Cost per Entity |
|-------|--------|----------|----------|-----------------|
| GPT-4o | Complex | $0.055 | 3 | $0.018 ❌ |
| GPT-4o | Minimal | $0.055 | 41 | $0.001 ✅ |
| **GPT-5-mini** | **Minimal** | **$0.011** | **53.5 avg** | **$0.0002** ✅✅ **WINNER** |

### Performance Benchmarks

| Configuration | Processing Time | Acceptable? |
|---------------|----------------|-------------|
| GPT-4o + Complex Prompt | ~60s | ✅ Yes |
| GPT-4o + Minimal Prompt | ~70s | ✅ Yes (fastest) |
| GPT-5-mini + Complex Prompt | 16+ min | ❌ No |
| **GPT-5-mini + Minimal Prompt** | **3m 29s avg** (2m53s-4m5s) | ✅ **Yes** (best quality+cost) |

---

**Last Updated:** 2025-10-07
**Status:** ✅ Testing complete - GPT-5-mini selected for production

## Final Recommendation

**SWITCH TO GPT-5-mini** for production Pass 1 entity detection:

**Why:**
- ✅ 30% better quality (53.5 avg vs 41 entities) - validated across 2 runs
- ✅ 80% cost savings ($0.011 vs $0.055 per document)
- ✅ 3.5-minute avg processing time acceptable for background jobs
- ✅ Minimal prompt validated on latest model
- ✅ Consistent performance: 52-55 entities, 2m53s-4m5s range

**ROI at scale:**
- 1,000 docs: Save $44/month
- 10,000 docs: Save $440/month
- 100,000 docs: Save $4,400/month

**Action:** Keep `model: 'gpt-5-mini'` in production worker configuration
