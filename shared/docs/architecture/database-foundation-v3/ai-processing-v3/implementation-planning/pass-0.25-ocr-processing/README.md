# Pass 0.25: OCR Processing Module

**Created:** November 2, 2025
**Status:** Batched Parallel OCR implementation in progress
**Purpose:** Convert medical document images to machine-readable text

---

## Overview

Pass 0.25 is the OCR (Optical Character Recognition) component that sits between file format processing and Pass 0.5 encounter discovery. It extracts text from scanned documents, photos, and image-based PDFs using Google Cloud Vision API.

**Pipeline Position:**
```
Upload → Format Processor → Pass 0.25 (OCR) → Pass 0.5 → Pass 1 → Pass 2
                              ↑ YOU ARE HERE
```

---

## Current Status

### What's Working ✅
- OCR for files up to ~69 pages
- Google Cloud Vision integration
- High accuracy (95-97% confidence)
- All image formats supported (JPEG, PNG, TIFF, HEIC)

### What's Broken ❌
- Files >100 pages cause worker crash
- Sequential processing (1 page at a time)
- Memory exhaustion on large files
- **Blocks production use of hospital discharge summaries (50-200 pages)**

### What We're Fixing 🔧
- Implementing batched parallel OCR (10 pages at a time)
- Expected: 9.5x speedup, 79% memory reduction
- Timeline: November 2-3, 2025
- See `IMPLEMENTATION_PLAN.md` for details

---

## Quick Links

### For Understanding OCR
- **START HERE:** `ARCHITECTURE_CURRENT_STATE.md` - How OCR works today
- `performance/BOTTLENECK_ANALYSIS.md` - Why OCR is the slowest component
- `testing/TEST_PLAN.md` - How we test OCR

### For Implementation
- **DOING NOW:** `IMPLEMENTATION_PLAN.md` - Batched parallel OCR plan
- `testing/performance-benchmarks/sequential-baseline.md` - Current performance
- `performance/METRICS_TRACKING.md` - What we measure

### For Future Planning
- `FUTURE_SCALING_OPTIONS.md` - How to scale when needed
- `performance/OPTIMIZATION_HISTORY.md` - What we've optimized
- `testing/TEST_PLAN.md` - Testing strategy

---

## Problem Summary

**Issue:** 142-page PDF crashed worker at page 140/142

**Root Cause:** Sequential OCR processing
- Processes 1 page at a time
- Accumulates all OCR results in memory
- Worker has 512 MB RAM limit
- Crashes when memory exhausted (~140 pages)

**Impact:**
- Cannot process hospital discharge summaries (50-200 pages)
- OCR takes 7 minutes for 142 pages (too slow)
- Production-blocking issue

**Solution:** Batched Parallel OCR
- Process 10 pages at a time in parallel
- Force garbage collection between batches
- Expected: 45 seconds for 142 pages (9.5x faster)
- Expected: 70 MB peak memory (79% reduction)

---

## Architecture at a Glance

### Current (Sequential - Broken)
```typescript
// Process pages one at a time
for (let i = 0; i < 142; i++) {
  const ocr = await callGoogleVisionAPI(pages[i]);
  results.push(ocr); // Accumulates in memory
}
// Time: 142 × 3 sec = 426 sec (7 minutes)
// Memory: 330 MB → CRASH
```

### Target (Batched Parallel - In Progress)
```typescript
// Process 10 pages at a time in parallel
const BATCH_SIZE = 10;
for (let i = 0; i < 142; i += BATCH_SIZE) {
  const batch = pages.slice(i, i + BATCH_SIZE);

  // Parallel processing within batch
  const batchResults = await Promise.all(
    batch.map(page => callGoogleVisionAPI(page))
  );

  results.push(...batchResults);

  if (global.gc) global.gc(); // Force garbage collection
}
// Time: 15 batches × 3 sec = 45 sec
// Memory: 70 MB peak (controlled)
```

---

## Performance Targets

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| **69-page file** |  |  |  |
| Time | 207 sec (3.5 min) | 24 sec | 8.6x faster |
| Memory | 150 MB | 70 MB | 53% less |
| **142-page file** |  |  |  |
| Time | 420 sec (crashed) | 45 sec | 9.3x faster |
| Memory | 330 MB (crashed) | 70 MB | 79% less |
| Success | ❌ Crash | ✅ Success | Unblocks production |

---

## Technology Stack

**OCR Engine:** Google Cloud Vision API
- Model: Document Text Detection
- Accuracy: 95-97% confidence for medical docs
- Cost: $1.50 per 1,000 pages (~$0.0015 per page)
- Speed: ~3 seconds per page

**Why Google Vision?**
- 85-90% cheaper than AWS Textract
- Better accuracy than self-hosted Tesseract
- Faster than alternatives
- Proven reliability

---

## Key Metrics

### What We Track
- **Time per page:** Target <3 seconds
- **Total OCR time:** Target <60 sec for 142 pages
- **Memory peak:** Target <100 MB
- **OCR confidence:** Target >90%
- **Success rate:** Target >99%
- **Cost per page:** Target $0.0015

### Where We Track It
- Database table: `pass025_ocr_metrics`
- See `performance/METRICS_TRACKING.md` for details
- Dashboard queries in `METRICS_TRACKING.md`

---

## Testing Strategy

### Current Test Status
- ✅ Small files (1-10 pages): All passing
- ✅ Medium files (50-69 pages): All passing
- ❌ Large files (142 pages): FAILED (sequential OCR)
- ⏳ Large files (142 pages): Pending (batched parallel OCR)

### Test Coverage
- Unit tests: OCR batch processing logic
- Integration tests: End-to-end with real files
- Performance tests: Time, memory, cost tracking
- Failure scenarios: Timeouts, retries, checkpoints

**See:** `testing/TEST_PLAN.md` for comprehensive test strategy

---

## Scaling Path

### Current State (Pre-Launch)
- 1 worker instance, $7/month
- Batched parallel OCR (10 pages at a time)
- Handles 1-10 concurrent users
- Sufficient for pre-launch

### When to Scale

**Add more worker instances (Option A):**
- Trigger: >20 concurrent users
- Cost: $7/month per instance
- Scaling: Linear (3 instances = 3x capacity)

**Separate OCR service (Option B):**
- Trigger: >100 concurrent users
- Cost: $105/month
- Scaling: Maximum parallelization

**See:** `FUTURE_SCALING_OPTIONS.md` for detailed scaling plans

---

## Implementation Timeline

**Day 1 (Nov 2):** Planning complete ✅
- Created Pass 0.25 folder structure
- Documented architecture, implementation plan, future options
- Created testing and performance tracking docs

**Day 2 (Nov 2-3):** Implementation
- Implement batched parallel OCR
- Add memory monitoring
- Add timeout protection
- Add checkpoint/resume

**Day 3 (Nov 3):** Testing
- Test with 142-page file
- Validate memory usage
- Confirm performance improvement

**Day 4 (Nov 3):** Resume Pass 0.5 Testing
- Mark Test 05 as PASS
- Continue with Test 06, 07, etc.

---

## Success Criteria

### Must Achieve
- ✅ 142-page file completes without crash
- ✅ Processing time <60 seconds
- ✅ Memory peak <100 MB
- ✅ No regressions on small files

### Monitoring After Deployment
- Track avg time per page (alert if >5 sec)
- Track memory usage (alert if >300 MB)
- Track success rate (alert if <95%)
- Track cost per page (alert if >$0.002)

---

## Documentation Structure

```
pass-0.25-ocr-processing/
├── README.md (THIS FILE)
│   └── Overview and quick links
│
├── ARCHITECTURE_CURRENT_STATE.md
│   └── How OCR works today, why it's broken
│
├── IMPLEMENTATION_PLAN.md
│   └── Batched parallel OCR implementation (DOING NOW)
│
├── FUTURE_SCALING_OPTIONS.md
│   └── Multi-instance, separate service, microservices
│
├── testing/
│   ├── TEST_PLAN.md
│   │   └── Comprehensive testing strategy
│   ├── test-results/
│   │   └── Individual test documentation
│   └── performance-benchmarks/
│       ├── sequential-baseline.md (deprecated)
│       └── batched-parallel-results.md (to be created)
│
└── performance/
    ├── METRICS_TRACKING.md
    │   └── What we measure and why
    ├── BOTTLENECK_ANALYSIS.md
    │   └── Why OCR is the slowest component
    └── OPTIMIZATION_HISTORY.md
        └── Chronicle of improvements
```

---

## Related Documentation

### Pass 0.5 Testing
- `../pass-0.5-encounter-discovery/pass05-hypothesis-tests-results/PAUSE_POINT.md`
  - Why Pass 0.5 testing is paused
  - What tests are pending
  - When we resume

### Test Results
- `../pass-0.5-encounter-discovery/pass05-hypothesis-tests-results/test-05-large-pdf-142-pages/`
  - Detailed 142-page crash analysis
  - Root cause investigation
  - Recommendations

---

## Quick Commands

### Check OCR Performance
```sql
-- Last 10 processed files
SELECT
  original_filename,
  total_pages,
  ocr_processing_time_ms / 1000.0 as ocr_time_sec,
  memory_peak_mb,
  ocr_average_confidence
FROM pass025_ocr_metrics m
JOIN shell_files s ON m.shell_file_id = s.id
ORDER BY m.created_at DESC
LIMIT 10;
```

### Monitor Memory Usage
```sql
-- Files with high memory usage
SELECT
  shell_file_id,
  total_pages,
  memory_peak_mb,
  memory_peak_mb / total_pages as mb_per_page
FROM pass025_ocr_metrics
WHERE memory_peak_mb > 200
ORDER BY memory_peak_mb DESC;
```

### Track Performance Trends
```sql
-- Daily OCR performance
SELECT
  DATE(created_at) as date,
  COUNT(*) as files_processed,
  AVG(ocr_processing_time_ms / 1000.0) as avg_time_sec,
  AVG(memory_peak_mb) as avg_memory_mb,
  AVG(ocr_average_confidence) as avg_confidence
FROM pass025_ocr_metrics
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 7;
```

---

## FAQs

**Q: Why is OCR the slowest part of the pipeline?**
A: OCR requires external API calls (Google Vision) which take 2-3 seconds per page due to network latency and server-side processing. See `performance/BOTTLENECK_ANALYSIS.md` for details.

**Q: Can we use a faster OCR service?**
A: Alternatives (AWS Textract, Tesseract) are either more expensive, less accurate, or both. Google Vision is the best balance of cost, accuracy, and speed for medical documents.

**Q: Why not process all 142 pages in parallel at once?**
A: Memory limits (512 MB worker) and API rate limiting. Batching 10 at a time balances speed vs safety.

**Q: What happens if a page fails OCR?**
A: Retry once automatically. If retry fails, entire job fails with clear error message. Future enhancement: partial success mode.

**Q: How much does OCR cost?**
A: $0.0015 per page ($1.50 per 1,000 pages). A 142-page file costs $0.213. Very affordable.

---

## Contact & Support

**For questions about:**
- Architecture: See `ARCHITECTURE_CURRENT_STATE.md`
- Implementation: See `IMPLEMENTATION_PLAN.md`
- Testing: See `testing/TEST_PLAN.md`
- Scaling: See `FUTURE_SCALING_OPTIONS.md`

**For urgent issues:**
- Check Render logs for worker errors
- Check `pass025_ocr_metrics` table for failures
- See `METRICS_TRACKING.md` for debugging queries

---

**Last Updated:** November 2, 2025
**Next Review:** November 3, 2025 (after batched parallel OCR deployed)
**Status:** Optimization in progress, resume Pass 0.5 testing soon
