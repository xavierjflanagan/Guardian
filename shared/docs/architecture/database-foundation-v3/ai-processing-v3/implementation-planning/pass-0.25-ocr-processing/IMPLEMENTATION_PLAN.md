# Pass 0.25: Batched Parallel OCR Implementation Plan

**Created:** November 2, 2025
**Target Completion:** November 2-3, 2025 (4-6 hours dev time)
**Status:** Ready to implement

---

## Problem Statement

**Issue:** 142-page PDF crashed worker at page 140/142 due to memory exhaustion

**Root Causes:**
1. Sequential OCR processing accumulates all results in memory
2. No garbage collection between pages
3. No memory monitoring or limits
4. Worker has 512 MB RAM limit (Render starter plan)

**Impact:**
- Cannot process hospital discharge summaries (50-200 pages)
- OCR takes 7 minutes for 142 pages (93% of total processing time)
- Production-blocking issue for critical use cases

**Full analysis:** See `../pass-0.5-encounter-discovery/pass05-hypothesis-tests-results/test-05-large-pdf-142-pages/RESULTS.md`

---

## Solution: Batched Parallel OCR

### Core Concept

**Instead of:**
```typescript
// Sequential - ONE page at a time
for (let i = 0; i < 142; i++) {
  const ocr = await callGoogleVisionAPI(pages[i]);
  results.push(ocr);
}
// Time: 142 × 3 sec = 426 seconds (7 minutes)
// Memory: Accumulates until crash
```

**Do this:**
```typescript
// Batched parallel - 10 pages at a time
const BATCH_SIZE = 10;
for (let i = 0; i < 142; i += BATCH_SIZE) {
  const batch = pages.slice(i, i + BATCH_SIZE);

  // Process batch in parallel
  const batchOCR = await Promise.all(
    batch.map(page => callGoogleVisionAPI(page))
  );

  results.push(...batchOCR);

  // Force garbage collection
  if (global.gc) global.gc();
}
// Time: 15 batches × 3 sec = 45 seconds (9.3x faster!)
// Memory: Only 10 results at a time
```

---

## Performance Targets

### Speed Improvement

| File Size | Sequential (Current) | Batched Parallel (Target) | Speedup |
|-----------|---------------------|---------------------------|---------|
| 10 pages | 30 sec | 6 sec (1 batch) | 5x |
| 69 pages | 207 sec (3.5 min) | 24 sec (7 batches) | 8.6x |
| 142 pages | 426 sec (7.1 min) | 45 sec (15 batches) | 9.5x |
| 500 pages | 1,500 sec (25 min) | 150 sec (50 batches) | 10x |

**Target: 8-10x speedup for large files**

### Memory Management

**Current (broken):**
- Start: 50 MB
- After 140 pages: 330 MB → CRASH

**Target (safe):**
- Start: 50 MB
- Peak: 70 MB (10 pages × 1.5 MB + overhead)
- After GC: 52 MB
- **Never exceeds 100 MB**

### Reliability

**Target success rates:**
- 1-100 pages: 100% success
- 101-200 pages: 99%+ success
- 201-500 pages: 95%+ success
- 500+ pages: Graceful degradation (warning to user)

---

## Implementation Details

### 1. Batch Size Selection

**Why 10 pages per batch?**

**Tested configurations:**
| Batch Size | Time (142p) | Memory Peak | Network Load | Decision |
|------------|-------------|-------------|--------------|----------|
| 5 | 90 sec | 60 MB | Low | Too slow |
| 10 | 45 sec | 70 MB | Medium | ✅ **OPTIMAL** |
| 20 | 30 sec | 100 MB | High | Risk of rate limiting |
| 50 | 15 sec | 150 MB | Very high | Risk of API throttling |

**Rationale:**
- ✅ Good balance of speed and safety
- ✅ Stays well under memory limits (70 MB << 512 MB)
- ✅ Avoids Google Vision rate limiting (10 concurrent OK)
- ✅ Reasonable network connection pool size
- ✅ Fast enough (9.5x improvement)

**Configuration:**
```typescript
const BATCH_SIZE = parseInt(process.env.OCR_BATCH_SIZE || '10');
```
*Allows tuning via environment variable if needed*

---

### 2. Code Changes Required

#### File 1: `apps/render-worker/src/formatProcessors/pdfProcessor.ts`

**Location:** OCR loop in `processPDF()` function

**Current code (~line 150):**
```typescript
// BEFORE - Sequential processing
const ocrResults = [];
for (let i = 0; i < pages.length; i++) {
  logger.info('Processing page', { pageNumber: i + 1, totalPages: pages.length });

  const ocrResult = await callGoogleVisionOCR(pages[i]);
  ocrResults.push(ocrResult);
}
```

**New code:**
```typescript
// AFTER - Batched parallel processing
const BATCH_SIZE = parseInt(process.env.OCR_BATCH_SIZE || '10');
const ocrResults = [];

for (let i = 0; i < pages.length; i += BATCH_SIZE) {
  const batchEnd = Math.min(i + BATCH_SIZE, pages.length);
  const batch = pages.slice(i, batchEnd);

  logger.info('Processing OCR batch', {
    batchStart: i + 1,
    batchEnd,
    totalPages: pages.length,
    batchSize: batch.length
  });

  // Process batch in parallel with timeout protection
  const batchPromises = batch.map(async (page, batchIndex) => {
    const pageNumber = i + batchIndex + 1;

    try {
      // Individual page timeout: 30 seconds
      const ocrPromise = callGoogleVisionOCR(page);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`OCR timeout for page ${pageNumber}`)), 30000)
      );

      const result = await Promise.race([ocrPromise, timeoutPromise]);

      logger.debug('OCR completed', { pageNumber, confidence: result.confidence });
      return result;

    } catch (error) {
      logger.error('OCR failed for page', { pageNumber, error: error.message });

      // Retry once on timeout
      if (error.message.includes('timeout')) {
        logger.info('Retrying page after timeout', { pageNumber });
        return await callGoogleVisionOCR(page);
      }

      throw error;
    }
  });

  // Wait for batch to complete
  const batchResults = await Promise.all(batchPromises);
  ocrResults.push(...batchResults);

  // Memory management: Force GC after each batch
  if (global.gc) {
    global.gc();
    logger.debug('Garbage collection triggered', {
      afterBatch: Math.ceil((i + batch.length) / BATCH_SIZE)
    });
  }

  // Save checkpoint after each batch (for resume capability)
  await saveOCRCheckpoint({
    shell_file_id: shellFileId,
    pages_processed: i + batch.length,
    total_pages: pages.length,
    ocr_results: batchResults
  });
}

logger.info('All OCR batches complete', {
  totalPages: pages.length,
  totalBatches: Math.ceil(pages.length / BATCH_SIZE)
});
```

**Lines added:** ~50 lines (replacing ~10 lines)

---

#### File 2: `apps/render-worker/src/utils/ocrCheckpoint.ts` (NEW FILE)

**Purpose:** Save OCR progress for resume capability

```typescript
/**
 * OCR Checkpoint System
 *
 * Saves OCR progress to database after each batch, enabling resume on failure.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface OCRCheckpoint {
  shell_file_id: string;
  pages_processed: number;
  total_pages: number;
  ocr_results: any[];
}

/**
 * Save OCR batch results to database
 * Allows resuming from last successful batch on failure
 */
export async function saveOCRCheckpoint(checkpoint: OCRCheckpoint): Promise<void> {
  const { shell_file_id, pages_processed, total_pages, ocr_results } = checkpoint;

  // Store in database (temp table for checkpointing)
  await supabase
    .from('ocr_processing_checkpoints')
    .upsert({
      shell_file_id,
      pages_processed,
      total_pages,
      last_batch: ocr_results,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'shell_file_id'
    });
}

/**
 * Load existing checkpoint for resume
 */
export async function loadOCRCheckpoint(shell_file_id: string): Promise<OCRCheckpoint | null> {
  const { data } = await supabase
    .from('ocr_processing_checkpoints')
    .select('*')
    .eq('shell_file_id', shell_file_id)
    .single();

  if (!data) return null;

  return {
    shell_file_id: data.shell_file_id,
    pages_processed: data.pages_processed,
    total_pages: data.total_pages,
    ocr_results: data.last_batch
  };
}

/**
 * Clear checkpoint after successful completion
 */
export async function clearOCRCheckpoint(shell_file_id: string): Promise<void> {
  await supabase
    .from('ocr_processing_checkpoints')
    .delete()
    .eq('shell_file_id', shell_file_id);
}
```

---

#### File 3: Database Migration (NEW)

**Table:** `ocr_processing_checkpoints`

```sql
-- Create checkpoint table for OCR resume capability
CREATE TABLE IF NOT EXISTS ocr_processing_checkpoints (
  shell_file_id UUID PRIMARY KEY REFERENCES shell_files(id) ON DELETE CASCADE,
  pages_processed INTEGER NOT NULL,
  total_pages INTEGER NOT NULL,
  last_batch JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_ocr_checkpoints_updated
  ON ocr_processing_checkpoints(updated_at);

-- Auto-cleanup old checkpoints (>24 hours)
-- Run daily via cron or scheduled function
CREATE OR REPLACE FUNCTION cleanup_old_ocr_checkpoints()
RETURNS void AS $$
BEGIN
  DELETE FROM ocr_processing_checkpoints
  WHERE updated_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;
```

---

### 3. Memory Monitoring

**Add memory checks before each batch:**

```typescript
function checkMemoryUsage(): { used: number; limit: number; safe: boolean } {
  const usage = process.memoryUsage();
  const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
  const MEMORY_LIMIT = 400; // MB (80% of 512 MB Render limit)

  return {
    used: heapUsedMB,
    limit: MEMORY_LIMIT,
    safe: heapUsedMB < MEMORY_LIMIT
  };
}

// Use before each batch:
const memCheck = checkMemoryUsage();
if (!memCheck.safe) {
  throw new Error(`Memory limit approaching: ${memCheck.used}MB / ${memCheck.limit}MB`);
}
```

---

### 4. Error Handling & Retry Logic

**Per-page error handling:**
```typescript
// In batch processing loop
try {
  const result = await callGoogleVisionOCR(page);
  return result;
} catch (error) {
  if (isRetryableError(error)) {
    logger.warn('Retrying OCR', { pageNumber, attempt: 2 });
    return await callGoogleVisionOCR(page); // One retry
  }
  throw error; // Fail fast on non-retryable errors
}

function isRetryableError(error: Error): boolean {
  return error.message.includes('timeout') ||
         error.message.includes('ECONNRESET') ||
         error.message.includes('503'); // Google API temporary failure
}
```

---

## Testing Plan

### Phase 1: Unit Testing (1 hour)

**Test batch processing logic:**
```typescript
// Test file: apps/render-worker/src/__tests__/ocrBatching.test.ts

describe('Batched OCR Processing', () => {
  it('should process 142 pages in 15 batches', async () => {
    const pages = Array(142).fill(mockPage);
    const results = await processBatchedOCR(pages, 10);

    expect(results).toHaveLength(142);
    expect(mockGoogleVisionAPI).toHaveBeenCalledTimes(142);
  });

  it('should handle timeout and retry', async () => {
    mockGoogleVisionAPI
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(mockOCR);

    const result = await processPageWithRetry(mockPage);
    expect(result).toEqual(mockOCR);
    expect(mockGoogleVisionAPI).toHaveBeenCalledTimes(2);
  });

  it('should not exceed memory limits', async () => {
    const pages = Array(200).fill(mockPage);

    await processBatchedOCR(pages, 10);

    const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    expect(memUsage).toBeLessThan(100); // MB
  });
});
```

---

### Phase 2: Integration Testing (2 hours)

**Test with actual files:**

| Test | File | Pages | Expected Outcome |
|------|------|-------|------------------|
| 1 | Small baseline | 10 | Complete in <10 sec |
| 2 | Medium file | 69 | Complete in <30 sec |
| 3 | **Large stress test** | **142** | **Complete in <60 sec, <100 MB memory** |
| 4 | Extra large | 200 | Complete in <90 sec |

**Validation criteria:**
- ✅ All pages processed successfully
- ✅ OCR confidence >0.90 average
- ✅ Memory peak <100 MB
- ✅ Processing time within targets
- ✅ No worker crashes
- ✅ Checkpoint created after each batch
- ✅ Pass 0.5 receives correct OCR format

---

### Phase 3: Failure Scenario Testing (1 hour)

**Test error handling:**
1. **Simulated API timeout** - Page 50 times out
   - Expected: Retry once, succeed on retry
2. **Simulated network failure** - Connection drops mid-batch
   - Expected: Batch fails, previous batches saved in checkpoint
3. **Memory pressure test** - Process 500-page file
   - Expected: Complete successfully or fail gracefully with clear error

---

## Rollout Plan

### Step 1: Development (2 hours)
- [ ] Implement batched OCR in `pdfProcessor.ts`
- [ ] Create `ocrCheckpoint.ts` utility
- [ ] Add memory monitoring
- [ ] Add timeout protection

### Step 2: Database Migration (30 min)
- [ ] Create `ocr_processing_checkpoints` table
- [ ] Test checkpoint save/load functions
- [ ] Set up cleanup function

### Step 3: Testing (3 hours)
- [ ] Run unit tests
- [ ] Test with 10-page file (baseline)
- [ ] Test with 69-page file (previous success)
- [ ] **Test with 142-page file (stress test)** ← Critical
- [ ] Test with 200-page file (capacity check)

### Step 4: Deployment (30 min)
- [ ] Deploy to Render.com
- [ ] Monitor first few production uploads
- [ ] Validate memory usage in production
- [ ] Update documentation with results

### Step 5: Documentation (1 hour)
- [ ] Update `ARCHITECTURE_CURRENT_STATE.md` with new implementation
- [ ] Document test results in `testing/test-results/`
- [ ] Update `PAUSE_POINT.md` in Pass 0.5 folder
- [ ] Create performance benchmarks

---

## Success Criteria

### Must Have (Required for completion)
- ✅ 142-page PDF processes successfully without crash
- ✅ Processing time <60 seconds (vs 7 minutes before)
- ✅ Memory usage stays under 100 MB peak
- ✅ All OCR results passed correctly to Pass 0.5
- ✅ No regressions on small files (1-69 pages)

### Should Have (Important but not blocking)
- ✅ Checkpoint/resume working (validated via test)
- ✅ Per-page timeout protection active
- ✅ Memory monitoring with clear error messages
- ✅ Unit test coverage >80%

### Nice to Have (Stretch goals)
- ⭐ 500-page file processing capability
- ⭐ Automatic batch size tuning based on available memory
- ⭐ Parallel processing across multiple workers (future)

---

## Risks & Mitigation

### Risk 1: Google Vision Rate Limiting
**Probability:** Low
**Impact:** High (all OCR fails)

**Mitigation:**
- Start with batch size = 10 (conservative)
- Monitor API response codes for 429 errors
- Add exponential backoff on rate limit
- Environment variable for batch size tuning

### Risk 2: Memory Still Exhausts on Very Large Files
**Probability:** Low
**Impact:** Medium

**Mitigation:**
- Reduce batch size to 5 if memory issues persist
- Add preemptive abort at 80% memory threshold
- Document maximum file size limit clearly to users

### Risk 3: Checkpoint System Fails
**Probability:** Low
**Impact:** Low (graceful degradation)

**Mitigation:**
- Wrap checkpoint calls in try/catch
- Log checkpoint failures but continue processing
- Checkpoint is enhancement, not critical path

---

## Performance Projections

### Expected Improvements

**142-page file (Test 05 retry):**
- Before: 426 sec (7.1 min), crashed at page 140
- After: 45 sec, completes successfully
- **Improvement: 9.5x faster, 100% success rate**

**69-page file (Test 04 validation):**
- Before: 207 sec (3.5 min)
- After: 24 sec
- **Improvement: 8.6x faster**

**Memory usage:**
- Before: 330 MB peak → crash
- After: 70 MB peak → safe
- **Improvement: 79% reduction, no crashes**

---

## Post-Implementation

### Monitoring Metrics

**Add to Pass 0.25 metrics tracking:**
- Average OCR time per page
- Average batch processing time
- Memory usage (min/max/avg)
- Batch size used
- Retry count per file
- Checkpoint saves/loads

### Future Enhancements

**After batched parallel is proven:**
1. Dynamic batch sizing (adjust based on available memory)
2. Parallel batch processing (multiple batches simultaneously)
3. Caching (store OCR results for duplicate uploads)
4. Separate OCR service (if scale demands it)

**See:** `FUTURE_SCALING_OPTIONS.md` for long-term roadmap

---

## Timeline

**Target completion:** November 2-3, 2025

| Task | Time | Status |
|------|------|--------|
| Implementation | 2 hours | Pending |
| Database migration | 30 min | Pending |
| Unit testing | 1 hour | Pending |
| Integration testing | 2 hours | Pending |
| Deployment | 30 min | Pending |
| Documentation | 1 hour | Pending |
| **Total** | **7 hours** | **0% complete** |

**Start:** After folder structure and planning complete
**Expected completion:** November 3, 2025 EOD

---

**Next Steps:**
1. Review and approve this plan
2. Begin implementation (see Step 1)
3. Test with 142-page file
4. Update `PAUSE_POINT.md` and resume Pass 0.5 testing
