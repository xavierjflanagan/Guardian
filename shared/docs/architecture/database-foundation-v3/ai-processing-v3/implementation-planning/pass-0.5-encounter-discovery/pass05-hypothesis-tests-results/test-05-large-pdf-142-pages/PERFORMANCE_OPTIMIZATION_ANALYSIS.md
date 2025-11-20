# Performance Optimization Analysis - Test 05 (142-Page PDF)

**Created:** November 2, 2025
**Status:** Analysis complete, optimization proposals ready
**Purpose:** Answer critical questions about batch sizes, image resolution, and next optimization steps

---

## Question 1: Why not smaller batches? (5 vs 10 pages)

### Current Implementation: Batch Size = 10

**Rationale for 10 pages per batch:**

1. **Network Parallelization Sweet Spot**
   - Google Vision API latency: ~3 seconds per page
   - 10 parallel requests = 10× throughput without overwhelming network
   - Provider rate limiting: 10 requests/sec typically safe

2. **Memory Management**
   - Each page base64: ~700 KB
   - 10 pages in memory: ~7 MB (manageable)
   - Total batches for 142 pages: 15 batches
   - Peak memory: ~70 MB controlled

3. **Error Granularity**
   - If batch fails, only 10 pages retry (not 5, not 20)
   - Reasonable failure blast radius
   - Quick recovery time

### Proposed: Batch Size = 5

**Arguments FOR smaller batches (5 pages):**

1. **Lower Memory Footprint**
   - 5 pages × 700 KB = ~3.5 MB (vs 7 MB)
   - Better for 512 MB worker limit
   - More aggressive GC opportunities (30 batches vs 15)

2. **Finer Error Recovery**
   - Smaller failure blast radius (5 pages vs 10)
   - Faster retry for failed batches
   - More frequent checkpointing opportunities

3. **Better Progress Visibility**
   - 30 batches = more granular progress updates
   - Heartbeat every ~3 seconds (vs ~6 seconds)
   - Better user experience

**Arguments AGAINST smaller batches (5 pages):**

1. **Overhead Multiplication**
   - 30 batches vs 15 batches = 2× batch loop overhead
   - More GC calls = CPU time wasted
   - More Promise.allSettled() overhead
   - Each batch adds ~200ms overhead

2. **No Performance Gain**
   - Network I/O bound (not CPU or memory)
   - 5 parallel vs 10 parallel = same 3-sec API latency
   - **Total time: ~85 sec for both** (30 batches × 3 sec ≈ 15 batches × 6 sec)

3. **Complexity Without Benefit**
   - More batches = more logging noise
   - More opportunities for batch transition bugs
   - No meaningful improvement

### My Recommendation: KEEP batch size = 10

**Why:**
- **Performance:** No speed improvement from 5→10 (still network I/O bound)
- **Memory:** 70 MB peak is safe (well under 480 MB threshold)
- **Simplicity:** Fewer batches = cleaner logs, fewer state transitions
- **Reliability:** 10 pages proven to work (Test 05 success)

**When to reduce to 5:**
- If we hit memory issues (not happening)
- If Google Vision rate limits us (not happening)
- If we need finer error recovery (not a current problem)

**Better optimization:** Focus on PDF extraction parallelization (60% time savings potential)

---

## Question 2: Image Resolution & Downstream AI Impact

### Current Pipeline Investigation

**Where Downscaling Happens:**

```
File Upload
    ↓
📁 PDF Extraction (Poppler) - apps/render-worker/src/utils/format-processor/pdf-processor.ts
    ↓
    Extract at 200 DPI → Raw JPEG pages (~2000px wide)
    ↓
🎨 Downscaling (Sharp) - pdf-processor.ts lines 125-138
    ↓
    IF width > 1600px:
        Resize to 1600px (lanczos3 resampling)
    ELSE:
        Keep original size
    ↓
    JPEG compression (quality 85, mozjpeg)
    ↓
📤 Output: JPEG @ max 1600px width (base64)
    ↓
🔍 OCR Processing (Google Vision) - worker.ts line 578+
    ↓
    Input: JPEG @ 1600px
    Process: Text extraction
    Output: OCR JSON (text + bounding boxes)
    ↓
🤖 Pass 0.5 (GPT-5-mini) - worker.ts
    ↓
    Input: OCR text only (NOT images)
    Process: Encounter discovery
    Output: Encounter boundaries
    ↓
✅ Future Pass 1 (GPT-4o Vision) - NOT YET IMPLEMENTED
    ↓
    Input: JPEG @ 1600px (WILL receive images)
    Process: Entity detection
    Output: Clinical entities
```

### Key Finding: Downscaling is INSIDE PDF Processor

**Location:** `apps/render-worker/src/utils/format-processor/pdf-processor.ts`

**Code:** Lines 125-138
```typescript
// Optional: Downscale if needed
if (maxWidth && pageMeta.width && pageMeta.width > maxWidth) {
  console.log(`[PDF Processor] Downscaling page ${pageNumber} from ${pageMeta.width}px to ${maxWidth}px`, {
    correlationId,
    sessionId,
    pageNumber,
    originalWidth: pageMeta.width,
    targetWidth: maxWidth,
  });

  pipeline = pipeline.resize({
    width: maxWidth,
    withoutEnlargement: true,
    kernel: 'lanczos3', // High-quality resampling
  });
}
```

**Default maxWidth:** 1600 (passed from `worker.ts` line 526)

**Timing:** AFTER Poppler extraction, BEFORE OCR

### Downstream AI Impact Analysis

| AI Model | Current Input | Min Resolution | Optimal Resolution | Impact of Reduction |
|----------|---------------|----------------|-------------------|---------------------|
| **Google Vision OCR** | 1600px JPEG | 600-800px | 1200-1600px | ⚠️ Accuracy may degrade <1200px |
| **Pass 0.5 (GPT-5)** | OCR text only | N/A | N/A | ✅ No impact (doesn't see images) |
| **Future Pass 1 (GPT-4o)** | 1600px JPEG | 1200px+ | 1400-1600px | ⚠️ Entity detection needs detail |

### Resolution Testing Recommendations

**Test 1: 1400px (Safe Reduction)**
- Expected time savings: ~20-25 seconds (10-12%)
- Risk: LOW - Well within acceptable range for OCR
- Test: Retry 142-page file with `maxWidth: 1400`
- Validate: Compare OCR confidence (target: >95%)

**Test 2: 1200px (Aggressive Reduction)**
- Expected time savings: ~30-40 seconds (13-17%)
- Risk: MEDIUM - May degrade OCR on small text
- Test: Retry 142-page file with `maxWidth: 1200`
- Validate: Compare OCR confidence (target: >93%)

**Test 3: 1000px (Too Aggressive)**
- Expected time savings: ~40-50 seconds (17-20%)
- Risk: HIGH - Likely OCR accuracy degradation
- Test: NOT RECOMMENDED unless Test 2 shows no degradation
- Concern: Future Pass 1 entity detection will struggle

### My Recommendation: Test 1400px First

**Why 1400px is the sweet spot:**

1. **Sufficient for OCR**
   - Google Vision works well at 1200-1600px
   - Medical documents: 1400px preserves text clarity
   - Minimal risk to OCR confidence

2. **Sufficient for Future Pass 1**
   - GPT-4o Vision: 1400px adequate for entity detection
   - Preserves chart/diagram details
   - Bounding box precision maintained

3. **Measurable Performance Gain**
   - ~20-25 seconds saved (10-12% improvement)
   - Low risk, moderate reward
   - Easy to roll back if issues arise

**Testing Protocol:**

1. **Baseline:** Re-run 142-page file at 1600px
   - Record OCR confidence per page
   - Record total processing time
   - Establish baseline quality

2. **Test:** Run 142-page file at 1400px
   - Compare OCR confidence (expect >95%)
   - Measure time savings
   - Visual inspection of OCR quality

3. **Decision:**
   - If confidence >95%: Deploy 1400px
   - If confidence 93-95%: Consider acceptable tradeoff
   - If confidence <93%: Stick with 1600px

---

## Question 3: Where to Document Performance Optimization?

### Proposed Documentation Structure

**Option 1: Create New Optimization Module Folder** ⭐ RECOMMENDED

```
pass-0.25-ocr-processing/
└── performance/
    ├── OPTIMIZATION_PLAN.md (NEW)
    │   └── PDF extraction parallelization roadmap
    │   └── Image resolution testing plan
    │   └── OCR batch size analysis
    │   └── Storage upload optimization
    │
    └── BOTTLENECK_ANALYSIS.md (exists)
        └── Links to OPTIMIZATION_PLAN.md
```

**Rationale:**
- Performance optimization is a DEDICATED workstream
- Separate from testing (Pass 0.5 hypothesis tests)
- Centralized location for all optimization work
- Clear separation: Testing vs Optimization

**Option 2: Add to Test 05 Folder**

```
test-05-large-pdf-142-pages/
├── RESULTS.md (updated ✅)
├── README.md
└── PERFORMANCE_OPTIMIZATION_ANALYSIS.md (THIS FILE - NEW)
```

**Rationale:**
- Optimization stems from Test 05 findings
- All related docs in one place
- Easier to cross-reference test results

**Option 3: Update PAUSE_POINT.md** ❌ NOT RECOMMENDED

**Why NOT:**
- PAUSE_POINT.md is temporary (testing paused)
- Should be archived once testing resumes
- Optimization is ongoing, not a pause reason

### My Recommendation: Hybrid Approach

1. **Keep THIS file here** (`test-05-large-pdf-142-pages/PERFORMANCE_OPTIMIZATION_ANALYSIS.md`)
   - Documents analysis from Test 05 results
   - Answers batch size and resolution questions
   - Historical record tied to test

2. **Create new optimization plan** (`pass-0.25-ocr-processing/performance/OPTIMIZATION_PLAN.md`)
   - Action-oriented roadmap
   - Implementation timeline
   - Links back to this analysis

3. **Update PAUSE_POINT.md** to mark Test 05 PASSED
   - Remove "Wait for deployment" status
   - Change to "Resume testing - Test 06"
   - Link to optimization work separately

---

## Next Steps: Implementation Priorities

### PRIORITY 1: Parallel PDF Extraction (HIGH IMPACT)

**Goal:** Reduce PDF extraction from 180 sec → 30 sec (6x faster)

**Approach:** Batch process PDF pages like OCR batching

**Estimated Total Time:** 300 sec → 150 sec (50% faster overall)

**Implementation:**
1. Modify `pdf-processor.ts` to extract pages in batches of 5-10
2. Use `Promise.all()` for parallel Sharp processing
3. Monitor memory usage (Poppler may spawn multiple processes)
4. Test with 142-page file

**Risk:** MEDIUM (Poppler multi-process memory usage unknown)

### PRIORITY 2: Resolution Testing (MEDIUM IMPACT)

**Goal:** Reduce image processing time by 10-13%

**Approach:** Test 1400px, validate OCR quality

**Estimated Total Time:** 300 sec → 270 sec (10% faster)

**Implementation:**
1. Change `maxWidth: 1600` → `maxWidth: 1400` in worker.ts line 526
2. Re-run Test 05 (142-page file)
3. Compare OCR confidence scores
4. If >95% confidence: Deploy, else revert

**Risk:** LOW (easy rollback, minimal downside)

### PRIORITY 3: OCR Batch Size Testing (LOW IMPACT)

**Goal:** Determine if larger batches improve throughput

**Approach:** Test batch size 15 (vs current 10)

**Estimated Total Time:** Minimal change (network I/O bound)

**Implementation:**
1. Change `BATCH_SIZE: 10` → `BATCH_SIZE: 15`
2. Monitor memory usage
3. Measure time improvement (likely minimal)

**Risk:** LOW (easily revert if memory issues)

---

## Summary & Answers

### Q1: Why not batch size 5 instead of 10?

**Answer:** **No performance benefit.**

- Network I/O bound (Google Vision API latency is the bottleneck)
- 5 vs 10 = same ~3 sec per batch (both network limited)
- 10 pages = fewer batches, less overhead, cleaner logs
- **Recommendation: KEEP batch size = 10**

### Q2: Image downscaling - where & when? Impact on downstream AI?

**Answer:** **Downscaling happens INSIDE PDF processor, AFTER Poppler extraction, BEFORE OCR.**

**Pipeline:**
```
PDF → Poppler (200 DPI) → Sharp downscale (1600px) → OCR → Pass 0.5
```

**Downstream impact:**
- Google Vision OCR: Safe down to 1200px, optimal 1400-1600px
- Pass 0.5 (GPT-5): No impact (receives text only)
- Future Pass 1 (GPT-4o Vision): Needs 1200px+ for entity detection

**Recommendation: Test 1400px** (10-12% time savings, low risk)

### Q3: Where to document performance optimization?

**Answer:** **Hybrid approach - multiple locations.**

1. **This file** (`PERFORMANCE_OPTIMIZATION_ANALYSIS.md` in `test-05-large-pdf-142-pages/`)
   - Analysis tied to Test 05 results
   - Answers specific questions

2. **New file** (`OPTIMIZATION_PLAN.md` in `pass-0.25-ocr-processing/performance/`)
   - Action-oriented roadmap
   - Implementation timeline
   - Links to this analysis

3. **Update PAUSE_POINT.md**
   - Mark Test 05 as PASSED
   - Update status to resume testing

---

## Recommendations Summary

1. ✅ **Keep OCR batch size = 10** (no benefit from smaller)
2. ✅ **Test image resolution 1400px** (10-12% time savings, low risk)
3. ✅ **Prioritize PDF extraction parallelization** (50% time savings potential)
4. ✅ **Document in hybrid approach** (test folder + performance module)
5. ✅ **Resume Pass 0.5 testing** (Test 06: Frankenstein multi-encounter)

---

**Next Action:** Implement Priority 1 (Parallel PDF extraction) for maximum impact
