# Sequential OCR Baseline Performance

**Date:** October-November 2025
**Implementation:** Sequential processing (1 page at a time)
**Status:** DEPRECATED - Replaced by batched parallel OCR (Nov 2025)

---

## Purpose

This document records baseline performance metrics for sequential OCR processing. These metrics are used to measure the improvement from batched parallel OCR optimization.

---

## Test Results

### Test 1: Small File (2 pages)
**File:** Xavier_combined_2page_medication_and_lab.tiff
**Date:** November 1, 2025

**Results:**
- Pages: 2
- OCR time: 6 seconds
- Time per page: 3.0 seconds
- Memory peak: 54 MB
- Success: ✅

---

### Test 2: Small PDF (8 pages)
**File:** Sample Patient ED Note pdf.pdf
**Date:** November 1, 2025

**Results:**
- Pages: 8
- OCR time: 24 seconds
- Time per page: 3.0 seconds
- Memory peak: 62 MB
- Success: ✅

---

### Test 3: Medium PDF (69 pages)
**File:** 002_Sarah_Chen_Hospital_Encounter_Summary.pdf
**Date:** November 1, 2025

**Results:**
- Pages: 69
- OCR time: 207 seconds (3 minutes 27 seconds)
- Time per page: 3.0 seconds average
- Memory peak: 150 MB
- OCR confidence: 0.96
- Success: ✅

**Notes:**
- Largest file that completed successfully
- Memory usage concerning (150 MB for 69 pages)
- Linear time growth (69 × 3 sec = 207 sec)

---

### Test 4: Large PDF (142 pages) - FAILURE
**File:** 006_Emma_Thompson_Hospital_Encounter_Summary.pdf
**Date:** November 2, 2025

**Results:**
- Pages: 142
- OCR time: 420 seconds before crash (7 minutes)
- Pages completed: 139/142 (97.9%)
- Failure point: Page 140
- Memory peak: 330 MB (estimated, before crash)
- Success: ❌ CRASHED

**Failure details:**
- Worker exceeded 512 MB memory limit
- Render automatically restarted worker
- All OCR progress lost (139 successful pages discarded)

**Root cause:**
- Sequential processing accumulates all OCR results in memory
- 139 pages × ~1.5 MB per page = ~210 MB + overhead
- Memory fragmentation and heap growth pushed over 512 MB limit
- No garbage collection between pages

---

## Performance Characteristics

### Time Complexity
**Linear with page count:** O(n)
```
2 pages:   6 sec   (3.0 sec/page)
8 pages:   24 sec  (3.0 sec/page)
69 pages:  207 sec (3.0 sec/page)
142 pages: 420 sec (3.0 sec/page) - before crash
```

**Projection:**
- 200 pages: 600 seconds (10 minutes)
- 500 pages: 1,500 seconds (25 minutes)

---

### Memory Growth
**Linear with page count:** O(n)
```
2 pages:   54 MB   (~27 MB/page baseline + overhead)
8 pages:   62 MB   (~7.75 MB/page incremental)
69 pages:  150 MB  (~2.17 MB/page incremental)
142 pages: 330 MB  (~2.32 MB/page incremental) - crashed
```

**Memory per page:**
- Baseline (worker): ~50 MB
- Per OCR result: ~1.5-2 MB (varies by text density)
- Estimated crash threshold: ~140-150 pages

---

### CPU Utilization
**Very low** - worker idle most of the time

```
Time breakdown per page:
- Network request setup: 0.2 sec
- Waiting for Google API: 2.5 sec (CPU idle)
- Response processing: 0.3 sec
Total: 3.0 sec

CPU usage: <20% (worker waiting for I/O)
```

**Opportunity:** CPU is idle, could process multiple pages in parallel

---

## Bottleneck Analysis

### Primary Bottleneck: Sequential Processing

**Why it's slow:**
1. One page at a time (no parallelization)
2. Worker waits for each API response before starting next
3. Network latency multiplied by page count
4. CPU idle 90% of the time

**Example timeline for 10 pages:**
```
Sequential (current):
Page 1: 0-3 sec
Page 2: 3-6 sec
Page 3: 6-9 sec
...
Page 10: 27-30 sec
Total: 30 seconds

Parallel (potential):
Pages 1-10: All start at 0 sec, all finish by 3 sec
Total: 3 seconds (10x faster!)
```

---

### Secondary Bottleneck: Memory Accumulation

**Why it crashes:**
1. All OCR results stored in array
2. No garbage collection between pages
3. Memory grows linearly with page count
4. Reaches 512 MB limit at ~140 pages

**Solution needed:**
- Process in batches
- Force GC between batches
- Or stream results to database

---

## Comparison: Sequential vs Target (Batched Parallel)

| Metric | Sequential (Current) | Batched Parallel (Target) | Improvement |
|--------|----------------------|---------------------------|-------------|
| **69 pages** |  |  |  |
| Time | 207 sec (3.5 min) | 24 sec | 8.6x faster |
| Memory | 150 MB | 70 MB | 53% reduction |
| **142 pages** |  |  |  |
| Time | 420 sec (crashed) | 45 sec | 9.3x faster |
| Memory | 330 MB (crashed) | 70 MB | 79% reduction |
| **200 pages** |  |  |  |
| Time | Would crash | 60 sec | Cannot compare |
| Memory | Would crash | 70 MB | Enables processing |

---

## Why Sequential Was Chosen Initially

**MVP Rationale (October 2025):**
1. **Simplicity** - Easiest to implement
2. **Quick development** - Get something working fast
3. **Assumed small files** - Expected 1-20 page documents
4. **Unknown limits** - Didn't know where system would break

**What we learned:**
- Real hospital records are 50-200 pages (not 1-20)
- Memory is the limiting factor (not tokens)
- Sequential wastes CPU resources (idle waiting for API)
- Parallelization is straightforward for I/O-bound operations

---

## Lessons Learned

### 1. Test With Realistic Data
- MVP assumptions (1-20 pages) were wrong
- Real medical records (hospital discharge summaries) are 50-200 pages
- Always test with production-realistic workloads

### 2. Monitor Resource Usage
- Memory usage wasn't monitored initially
- Crash revealed memory limits
- Should track memory from day 1

### 3. I/O-Bound Operations Can Be Parallelized
- Worker CPU was idle 90% of time
- External API calls don't block CPU
- Batched parallel processing is obvious solution in hindsight

### 4. Node.js Memory Management
- Node.js doesn't aggressively GC by default
- Must manually trigger with `global.gc()`
- Memory can accumulate even for short-lived objects

---

## Baseline Metrics Summary

**For 69-page file (largest successful):**
```json
{
  "implementation": "sequential",
  "file": "002_Sarah_Chen_Hospital_Encounter_Summary.pdf",
  "pages": 69,
  "ocr_time_ms": 207000,
  "time_per_page_ms": 3000,
  "memory_peak_mb": 150,
  "ocr_confidence": 0.96,
  "success_rate": 100,
  "cost_usd": 0.1035
}
```

**For 142-page file (failed):**
```json
{
  "implementation": "sequential",
  "file": "006_Emma_Thompson_Hospital_Encounter_Summary.pdf",
  "pages": 142,
  "pages_completed": 139,
  "ocr_time_before_crash_ms": 420000,
  "time_per_page_ms": 3000,
  "memory_peak_mb": 330,
  "success_rate": 0,
  "failure_reason": "memory_exhaustion",
  "cost_wasted_usd": 0.2085
}
```

---

## Replacement

**Sequential OCR deprecated:** November 2, 2025
**Replaced by:** Batched Parallel OCR (see `batched-parallel-results.md`)

**Migration:**
- All existing code updated
- No backward compatibility needed
- Batched parallel is strictly superior

---

**Related Documentation:**
- `../test-results/2025-11-02-sequential-ocr-failure.md` - Detailed failure analysis
- `batched-parallel-results.md` - New baseline after optimization
- `../../IMPLEMENTATION_PLAN.md` - How batched parallel works
