# Format Conversion Batch Size Optimization Study

**Status:** PLANNING
**Date Created:** November 8, 2025
**Purpose:** Optimize PDF-to-JPEG format conversion performance via batched parallel processing

---

## Problem Statement

**Current Bottleneck:** Format conversion dominates total job time at 87% (309 seconds out of 356 seconds for 142-page documents).

**Current Implementation:**
- **Unbatched parallel processing**: Processes ALL pages simultaneously via `Promise.allSettled()`
- **Memory risk**: 142+ Sharp instances loaded at once can cause thrashing
- **No batch size control**: Cannot tune parallelism vs memory tradeoff

**Previous Test Results (512 MB RAM):**
- Sequential equivalent: 194 seconds (1.37s per page)
- Unbatched parallel: 146 seconds (25% faster, but caused 9% overall job slowdown due to memory pressure)

**With 2 GB RAM:**
- Unbatched parallel may work for 142 pages
- But scaling to 240+ pages requires batching
- Batched parallel provides predictable memory usage

---

## Optimization Strategy

**Approach:** Batched parallel processing (same pattern as OCR optimization)

**Implementation Plan:**
1. Add `FORMAT_BATCH_SIZE` environment variable
2. Modify `pdf-processor.ts` to process pages in batches (like OCR does)
3. Track batch-level metrics (timing, memory usage)
4. Test batch sizes: 10, 20, 30, 40
5. Select optimal batch size for production

**Expected Performance:**
- Current: 194 seconds (sequential-equivalent on 142 pages)
- Target: 10-15 seconds (92-95% faster)
- Calculation: 7 batches × 1.5 sec/batch ≈ 10.5 seconds

---

## Literature Review: Image Processing Parallelization

### Sharp.js Performance Characteristics

**Memory Usage:**
- Each Sharp instance: ~3-5 MB for JPEG processing
- Batch size 20: ~60-100 MB memory footprint
- Batch size 40: ~120-200 MB memory footprint
- Safe for 2 GB RAM with batch sizes up to 50

**Concurrency Best Practices:**
- Sharp is CPU-bound (JPEG encoding/decoding)
- Optimal concurrency: 1.5-2x CPU core count
- For 1 vCPU: Batch size 10-20 recommended
- Higher batch sizes provide diminishing returns on single-core systems

**References:**
- Sharp GitHub Issues: [Parallel processing recommendations](https://github.com/lovell/sharp/issues/2578)
- Node.js Sharp docs: Memory management section

### PDF Processing with Poppler

**Current Implementation:**
- Poppler `pdfToPpm` extracts ALL pages sequentially (cannot be parallelized)
- Poppler → JPEG conversion happens in single pass
- Bottleneck is Sharp processing (JPEG optimization), not Poppler extraction

**Optimization Opportunity:**
- Poppler extraction: ~5-10 seconds (cannot optimize)
- Sharp processing: 184 seconds (CAN optimize via batching)
- Focus optimization on Sharp pipeline

---

## Infrastructure Constraints

**Render.com Worker Configuration:**
- Instance Type: Standard
- CPU: 1 vCPU
- RAM: 2 GB
- Worker Concurrency: 3 jobs simultaneously
- Worker Timeout: 600 seconds (10 minutes)

**Memory Budget (2 GB RAM, 3 concurrent jobs):**
- Per-job memory budget: ~666 MB (2 GB / 3 jobs)
- OCR peak memory: 463 MB (batch size 20, 142 pages)
- Format conversion should stay under 400 MB for safety

**Batch Size Safety Margins:**
- Batch size 10: ~50 MB (safe)
- Batch size 20: ~100 MB (safe)
- Batch size 30: ~150 MB (safe)
- Batch size 40: ~200 MB (acceptable)
- Batch size 50: ~250 MB (approaching limit)

**Recommendation:** Test batch sizes 10, 20, 30 to find optimal speed/memory balance.

---

## Testing Plan

### Phase 1: Implement Batched Parallel Processing

**Code Changes Required:**
1. Add `FORMAT_BATCH_SIZE` environment variable to `.env`
2. Modify `pdf-processor.ts:extractPdfPages()` to process pages in batches
3. Add batch-level logging (similar to OCR logging)
4. Implement batch time tracking array

**Estimated Implementation Time:** 1-2 hours

---

### Phase 2: Batch Size Testing (142-Page Document)

**Test Document:** Same 142-page PDF used for OCR testing
**Test Batch Sizes:** 10, 20, 30

**Metrics to Capture:**
- Total format conversion time (wall clock)
- Average batch processing time
- Average page processing time
- Peak memory usage (if measurable)
- Total Sharp instances created

**Success Criteria:**
- Processing time <20 seconds (90% faster than 194s baseline)
- Memory usage <400 MB peak
- No quality degradation
- Stable across multiple runs

---

### Phase 3: Stress Testing (240-Page Document)

**Test Document:** User-provided 240-page PDF
**Purpose:** Validate batch size scales to larger documents
**Batch Size:** Winner from Phase 2

**Success Criteria:**
- No memory-related failures
- Processing time scales linearly (expected: ~33 seconds for 240 pages)
- No worker timeout (<600 seconds total job time)

---

## Metrics Tracking Design

### Option 1: Extend `ocr_processing_metrics` Table

**Approach:** Add format conversion columns to existing table

**Pros:**
- Single source of truth for document processing metrics
- Simple JOIN for combined OCR + format conversion analysis
- No duplicate shell_file_id foreign keys

**Cons:**
- Table becomes wider (already 23 columns)
- Mixing concerns (OCR vs format conversion)

**Columns to Add:**
```sql
-- Format conversion timing
format_conversion_time_ms INTEGER,
format_avg_batch_time_ms NUMERIC(10,2),
format_avg_page_time_ms NUMERIC(10,2),
format_batch_times_ms INTEGER[],
format_batch_size INTEGER,
format_total_batches INTEGER,

-- Format conversion quality
format_successful_pages INTEGER,
format_failed_pages INTEGER,
format_total_output_bytes BIGINT,
```

---

### Option 2: Create Separate `format_processing_metrics` Table

**Approach:** Dedicated table for format conversion metrics

**Pros:**
- Separation of concerns (cleaner schema)
- Independent optimization (different indexes needed)
- Easier to deprecate if format conversion becomes unnecessary

**Cons:**
- Requires JOIN to correlate with OCR metrics
- Duplicate foreign keys (shell_file_id, patient_id)
- More complex queries for full document processing analysis

**Schema:**
```sql
CREATE TABLE format_processing_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  correlation_id TEXT NOT NULL UNIQUE,

  -- Batch configuration
  batch_size INTEGER NOT NULL,
  total_batches INTEGER NOT NULL,
  total_pages INTEGER NOT NULL,

  -- Timing metrics (milliseconds)
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  processing_time_ms INTEGER NOT NULL,
  average_batch_time_ms NUMERIC(10,2),
  average_page_time_ms NUMERIC(10,2),
  batch_times_ms INTEGER[] NOT NULL DEFAULT '{}',

  -- Success/failure tracking
  successful_pages INTEGER NOT NULL DEFAULT 0,
  failed_pages INTEGER NOT NULL DEFAULT 0,
  failed_page_numbers INTEGER[] NOT NULL DEFAULT '{}',

  -- Output metrics
  total_output_bytes BIGINT,
  average_page_size_bytes INTEGER,

  -- Resource usage
  peak_memory_mb INTEGER,

  -- Deployment context
  environment TEXT,
  app_version TEXT,
  worker_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_format_timing CHECK (completed_at >= started_at)
);
```

---

### Recommendation: Option 1 (Extend Existing Table)

**Rationale:**
- Format conversion and OCR are tightly coupled (same job, sequential pipeline)
- Always processed together (no standalone format conversion)
- Simpler queries (no JOIN required)
- Easier to compare format vs OCR contribution to total job time

**Migration:** Create Migration 44 to add format conversion columns to `ocr_processing_metrics`

---

## Implementation Checklist

**Pre-Testing Setup:**
- [ ] Implement batched parallel processing in `pdf-processor.ts`
- [ ] Add `FORMAT_BATCH_SIZE` environment variable
- [ ] Add batch-level logging
- [ ] Create Migration 44 (extend ocr_processing_metrics table)
- [ ] Update worker.ts to write format conversion metrics

**Testing Phase:**
- [ ] Test batch size 10 (142-page document)
- [ ] Test batch size 20 (142-page document)
- [ ] Test batch size 30 (142-page document)
- [ ] Compare results and select winner
- [ ] Validate winner with 240-page document

**Production Deployment:**
- [ ] Deploy selected batch size to Render.com
- [ ] Update README.md with format conversion performance characteristics
- [ ] Update this document with final results

---

## Expected Results

**Baseline (Sequential-Equivalent):**
- 142 pages: 194 seconds
- Per-page time: 1.37 seconds
- Memory: Safe (sequential processing)

**Predicted (Batched Parallel, Batch Size 20):**
- 142 pages: 10-15 seconds (92-95% faster)
- Per-batch time: 1.5 seconds
- 7 batches total
- Memory: ~100 MB (safe)
- Total job time improvement: 356s → 172s (52% faster)

**Quality:**
- No degradation expected (JPEG optimization already tuned)
- Same output as current unbatched parallel implementation

---

## Risks and Mitigations

**Risk 1: Batch Size Too Small**
- **Impact:** Minimal speedup (sequential-like performance)
- **Mitigation:** Test multiple batch sizes (10, 20, 30)

**Risk 2: Batch Size Too Large**
- **Impact:** Memory pressure, potential thrashing
- **Mitigation:** Stay within safe memory limits (<400 MB)

**Risk 3: Implementation Complexity**
- **Impact:** Bugs, regressions
- **Mitigation:** Follow proven OCR batching pattern

**Risk 4: Diminishing Returns**
- **Impact:** Higher batch sizes provide minimal additional speedup
- **Mitigation:** Test logarithmic batch size increases, select best value

---

## Success Criteria

- Format conversion processing time <20 seconds for 142-page documents
- Memory usage <400 MB peak
- No quality degradation (same JPEG output)
- Batch size tunable via environment variable
- Metrics captured in database for ongoing analysis
- Scales to 240+ page documents without failure

---

**Next Steps:**
1. Review and approve this plan
2. Implement batched parallel processing
3. Create Migration 44 (extend ocr_processing_metrics)
4. Execute testing plan with 142-page document
5. Validate with 240-page stress test
6. Deploy to production

---

**Last Updated:** November 8, 2025
**Status:** Awaiting approval to proceed with implementation
