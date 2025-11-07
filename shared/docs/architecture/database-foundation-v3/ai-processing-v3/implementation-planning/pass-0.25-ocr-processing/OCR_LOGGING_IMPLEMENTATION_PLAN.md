# OCR Processing Logging Implementation Plan

**Date:** November 7, 2025
**Purpose:** Comprehensive logging and metrics for OCR processing to enable troubleshooting, performance monitoring, and cost tracking

---

## Current Problem

**Issue:** No visibility into OCR processing performance
- Cannot see batch-level timing
- Cannot identify which batches are slow/failing
- Cannot calculate actual OCR cost
- Cannot verify if batch size changes improve performance
- Cannot debug memory issues during OCR

**Example:** Recent 142-page job took 328 seconds total, but we can only estimate ~79 seconds for OCR by subtraction. We need exact timing.

---

## Solution: Three-Tier Logging Architecture

### Tier 1: Render.com Application Logs (Real-time Debugging)
**Purpose:** Live troubleshooting via Render dashboard
**Retention:** 7 days
**Cost:** Free (included in plan)

### Tier 2: Supabase Metrics Table (Historical Analysis)
**Purpose:** Long-term performance tracking and cost analysis
**Retention:** Permanent
**Cost:** Minimal (few KB per job)

### Tier 3: Summary Metrics in Existing Tables (Quick Access)
**Purpose:** Dashboard display and job completion tracking
**Retention:** Permanent
**Cost:** Zero (uses existing tables)

---

## Implementation Phases

### Phase 1: Application Logging (Quick Win - 30 minutes)

**Goal:** Add structured logs to worker.ts for immediate visibility in Render dashboard

**What to Log:**

#### 1.1 OCR Session Start
```typescript
this.logger.info('OCR processing session started', {
  shell_file_id,
  correlation_id,
  total_pages: validPages.length,
  batch_size: BATCH_SIZE,
  total_batches: Math.ceil(validPages.length / BATCH_SIZE),
  ocr_provider: 'google_vision',
  timestamp: new Date().toISOString()
});
```

#### 1.2 Batch Start (Per Batch)
```typescript
this.logger.info('OCR batch started', {
  shell_file_id,
  correlation_id,
  batch_number: batchNumber,
  total_batches: totalBatches,
  batch_size: batch.length,
  pages_in_batch: batch.map(p => p.pageNumber).join(','), // e.g., "1,2,3,4,5"
  memory_before_mb: Math.round(memBefore.rss / 1024 / 1024),
  timestamp: new Date().toISOString()
});
```

#### 1.3 Batch Complete (Per Batch)
```typescript
this.logger.info('OCR batch completed', {
  shell_file_id,
  correlation_id,
  batch_number: batchNumber,
  total_batches: totalBatches,
  batch_size: batch.length,
  processing_time_ms: batchProcessingTime,
  successful_pages: successfulPages.length,
  failed_pages: failedPages.length,
  failed_page_numbers: failedPages.map(p => p.pageNumber).join(','),
  average_confidence: avgConfidence.toFixed(4),
  memory_after_mb: Math.round(memAfter.rss / 1024 / 1024),
  memory_delta_mb: Math.round((memAfter.rss - memBefore.rss) / 1024 / 1024),
  timestamp: new Date().toISOString()
});
```

#### 1.4 OCR Session Complete (Summary)
```typescript
this.logger.info('OCR processing session completed', {
  shell_file_id,
  correlation_id,
  total_pages: validPages.length,
  total_batches: batchCount,
  batch_size: BATCH_SIZE,
  total_processing_time_ms: totalOCRTime,
  average_batch_time_ms: Math.round(totalOCRTime / batchCount),
  average_page_time_ms: Math.round(totalOCRTime / validPages.length),
  successful_pages: totalSuccessfulPages,
  failed_pages: totalFailedPages,
  failed_page_numbers: allFailedPageNumbers.join(','),
  average_confidence: overallAvgConfidence.toFixed(4),
  total_text_length: totalTextLength,
  peak_memory_mb: peakMemoryMB,
  memory_freed_mb: freedMemoryMB,
  timestamp: new Date().toISOString()
});
```

**Code Location:** `apps/render-worker/src/worker.ts` in the OCR processing section

**Benefits:**
- Immediate visibility in Render dashboard
- Can filter logs by correlation_id or shell_file_id
- See exact timing for each batch
- Identify slow batches or pages

---

### Phase 2: Database Metrics Table (Medium Effort - 2 hours)

**Goal:** Create permanent metrics storage for historical analysis

#### 2.1 Create Migration

**File:** `shared/docs/architecture/database-foundation-v3/migration_history/2025-11-07_XX_ocr_processing_metrics.sql`

**Schema Design Notes:**
- **Array columns with NOT NULL defaults**: Prevents null pointer issues in analysis queries
- **Composite index**: Optimizes time-series queries per file (common dashboard pattern)
- **RLS policy**: Uses V3 `get_accessible_profiles()` function (not deprecated `get_allowed_patient_ids()`)
- **Environment tracking**: Distinguishes staging vs production metrics for accurate analysis
- **App version tracking**: Enables debugging version-specific performance issues
- **Worker ID tracking**: Identifies which worker instance processed the job (distributed troubleshooting)
- **Retry count tracking**: Tracks OCR retry attempts (foundation for future retry logic)
- **Per-page cost**: Enables dashboard display without recalculation

```sql
-- OCR Processing Metrics Table
-- Stores batch-level and session-level metrics for OCR processing
-- Enables performance tracking, cost analysis, and optimization

CREATE TABLE IF NOT EXISTS ocr_processing_metrics (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- References
  shell_file_id UUID REFERENCES shell_files(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Correlation
  correlation_id TEXT NOT NULL,

  -- Batch configuration
  batch_size INTEGER NOT NULL,
  total_batches INTEGER NOT NULL,
  total_pages INTEGER NOT NULL,

  -- Timing (all in milliseconds)
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  processing_time_ms INTEGER NOT NULL,
  average_batch_time_ms NUMERIC(10,2),
  average_page_time_ms NUMERIC(10,2),

  -- Individual batch timings (array for analysis)
  batch_times_ms INTEGER[] NOT NULL DEFAULT '{}',

  -- Success/failure tracking
  successful_pages INTEGER NOT NULL DEFAULT 0,
  failed_pages INTEGER NOT NULL DEFAULT 0,
  failed_page_numbers INTEGER[] NOT NULL DEFAULT '{}',

  -- Quality metrics
  average_confidence NUMERIC(5,4), -- e.g., 0.9745
  total_text_length INTEGER,

  -- Resource usage
  peak_memory_mb INTEGER,
  memory_freed_mb INTEGER,

  -- Cost estimation
  estimated_cost_usd NUMERIC(10,6), -- Google Vision pricing (total session cost)
  estimated_cost_per_page_usd NUMERIC(10,6), -- Per-page cost for dashboard display

  -- Provider info
  ocr_provider TEXT DEFAULT 'google_vision',

  -- Deployment context
  environment TEXT, -- 'staging' or 'production'
  app_version TEXT, -- Git commit SHA or version tag
  worker_id TEXT,   -- Which worker instance processed this

  -- Retry tracking
  retry_count INTEGER DEFAULT 0,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_ocr_metrics_shell_file ON ocr_processing_metrics(shell_file_id);
CREATE INDEX idx_ocr_metrics_correlation ON ocr_processing_metrics(correlation_id);
CREATE INDEX idx_ocr_metrics_created_at ON ocr_processing_metrics(created_at DESC);
CREATE INDEX idx_ocr_metrics_patient_id ON ocr_processing_metrics(patient_id);

-- Performance query index (batch size analysis)
CREATE INDEX idx_ocr_metrics_batch_perf ON ocr_processing_metrics(batch_size, average_page_time_ms);

-- Composite index for time-series queries per file
CREATE INDEX idx_ocr_metrics_shell_file_created_at ON ocr_processing_metrics(shell_file_id, created_at DESC);

-- RLS Policy (users can only see their own metrics)
ALTER TABLE ocr_processing_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own OCR metrics"
  ON ocr_processing_metrics
  FOR SELECT
  USING (
    patient_id IN (
      SELECT profile_id FROM get_accessible_profiles(auth.uid())
    )
  );

-- Service role can do anything (for worker inserts)
CREATE POLICY "Service role full access to OCR metrics"
  ON ocr_processing_metrics
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Grant access
GRANT SELECT ON ocr_processing_metrics TO authenticated;
GRANT ALL ON ocr_processing_metrics TO service_role;

COMMENT ON TABLE ocr_processing_metrics IS 'OCR processing performance and cost metrics';
COMMENT ON COLUMN ocr_processing_metrics.batch_times_ms IS 'Array of individual batch processing times for distribution analysis';
COMMENT ON COLUMN ocr_processing_metrics.estimated_cost_usd IS 'Estimated Google Cloud Vision API cost based on page count (total session cost)';
COMMENT ON COLUMN ocr_processing_metrics.estimated_cost_per_page_usd IS 'Average cost per page for dashboard display and budget tracking';
COMMENT ON COLUMN ocr_processing_metrics.environment IS 'Deployment environment where processing occurred (staging or production)';
COMMENT ON COLUMN ocr_processing_metrics.app_version IS 'Application version (Git commit SHA or tag) for debugging version-specific issues';
COMMENT ON COLUMN ocr_processing_metrics.worker_id IS 'Worker instance identifier for distributed processing troubleshooting';
COMMENT ON COLUMN ocr_processing_metrics.retry_count IS 'Number of retry attempts for this OCR session (0 for first attempt)';
```

#### 2.2 Add Database Write to Worker

**Location:** `apps/render-worker/src/worker.ts` in the OCR completion handler

```typescript
// After OCR processing completes, write metrics to database
try {
  const totalCost = calculateGoogleVisionCost(validPages.length);
  const costPerPage = totalCost / validPages.length;

  const { error: metricsError } = await this.supabase
    .from('ocr_processing_metrics')
    .insert({
      shell_file_id: payload.shell_file_id,
      patient_id: payload.patient_id,
      correlation_id: correlationId,
      batch_size: BATCH_SIZE,
      total_batches: batchTimings.length,
      total_pages: validPages.length,
      started_at: ocrStartTime,
      completed_at: new Date(),
      processing_time_ms: totalOCRTime,
      average_batch_time_ms: batchTimings.reduce((a, b) => a + b, 0) / batchTimings.length,
      average_page_time_ms: totalOCRTime / validPages.length,
      batch_times_ms: batchTimings, // Store all batch times for analysis
      successful_pages: successfulPageCount,
      failed_pages: failedPageCount,
      failed_page_numbers: failedPageNumbers,
      average_confidence: avgConfidence,
      total_text_length: totalTextLength,
      peak_memory_mb: peakMemoryMB,
      memory_freed_mb: freedMemoryMB,
      estimated_cost_usd: totalCost,
      estimated_cost_per_page_usd: costPerPage,
      ocr_provider: 'google_vision',
      environment: process.env.APP_ENV || 'staging',
      app_version: process.env.RENDER_GIT_COMMIT || 'local-dev',
      worker_id: process.env.WORKER_ID || 'unknown',
      retry_count: 0 // TODO: Track actual retry count when retry logic is implemented
    });

  if (metricsError) {
    this.logger.error('Failed to write OCR metrics', metricsError, {
      shell_file_id: payload.shell_file_id,
      correlation_id: correlationId
    });
  }
} catch (metricsError) {
  // Non-critical - don't fail the job
  this.logger.warn('OCR metrics write failed (non-critical)', {
    shell_file_id: payload.shell_file_id,
    error: metricsError
  });
}
```

#### 2.3 Cost Calculation Function

```typescript
/**
 * Calculate estimated Google Cloud Vision API cost
 * Pricing (as of Nov 2025):
 * - First 1,000 pages/month: FREE
 * - 1,001 - 5,000,000: $1.50 per 1,000 pages
 *
 * NOTE: This is simplified - actual cost depends on monthly volume
 */
function calculateGoogleVisionCost(pageCount: number): number {
  const PRICE_PER_1K_PAGES = 1.50;

  // Simplified: assume we're past free tier
  return (pageCount / 1000) * PRICE_PER_1K_PAGES;
}
```

**Benefits:**
- Query historical performance trends
- Analyze batch size effectiveness
- Calculate actual OCR costs per month
- Identify performance regressions
- Generate performance reports

**Example Queries:**

```sql
-- Average OCR time per page by batch size
SELECT
  batch_size,
  COUNT(*) as jobs,
  AVG(average_page_time_ms) as avg_page_ms,
  AVG(average_confidence) as avg_confidence
FROM ocr_processing_metrics
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY batch_size
ORDER BY batch_size;

-- Total OCR cost this month
SELECT
  SUM(estimated_cost_usd) as total_cost,
  SUM(total_pages) as total_pages,
  COUNT(*) as total_jobs
FROM ocr_processing_metrics
WHERE created_at >= DATE_TRUNC('month', NOW());

-- Slowest OCR jobs (troubleshooting)
SELECT
  shell_file_id,
  total_pages,
  processing_time_ms,
  average_page_time_ms,
  failed_pages,
  created_at
FROM ocr_processing_metrics
ORDER BY average_page_time_ms DESC
LIMIT 10;
```

---

### Phase 3: Update Existing Tables (Low Effort - 30 minutes)

**Goal:** Add OCR summary to shell_files table for quick dashboard access

#### 3.1 Add Columns to shell_files

**Migration:**
```sql
-- Add OCR processing summary columns to shell_files
ALTER TABLE shell_files
  ADD COLUMN IF NOT EXISTS ocr_processing_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS ocr_page_count INTEGER,
  ADD COLUMN IF NOT EXISTS ocr_average_confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS ocr_failed_pages INTEGER,
  ADD COLUMN IF NOT EXISTS ocr_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN shell_files.ocr_processing_time_ms IS 'Total OCR processing time in milliseconds';
COMMENT ON COLUMN shell_files.ocr_page_count IS 'Number of pages processed by OCR';
COMMENT ON COLUMN shell_files.ocr_average_confidence IS 'Average OCR confidence score';
COMMENT ON COLUMN shell_files.ocr_failed_pages IS 'Number of pages that failed OCR';
COMMENT ON COLUMN shell_files.ocr_completed_at IS 'When OCR processing completed';
```

#### 3.2 Update Worker to Write Summary

**Location:** `apps/render-worker/src/worker.ts` in the OCR completion handler

```typescript
// Update shell_files with OCR summary
await this.supabase
  .from('shell_files')
  .update({
    ocr_processing_time_ms: totalOCRTime,
    ocr_page_count: validPages.length,
    ocr_average_confidence: avgConfidence,
    ocr_failed_pages: failedPageCount,
    ocr_completed_at: new Date().toISOString()
  })
  .eq('id', payload.shell_file_id);
```

**Benefits:**
- Quick access to OCR status in dashboard
- No need to join with metrics table for basic info
- Can show "OCR took 45 seconds" in UI

---

## Rollout Plan

### Step 1: Phase 1 Only (Today)
- Add application logging to worker.ts
- Deploy to Render
- Test with 142-page document
- Verify logs appear in Render dashboard
- **Effort:** 30 minutes
- **Risk:** Low (just logging)

### Step 2: Phase 2 (Tomorrow)
- Create migration for ocr_processing_metrics table
- Execute migration via Supabase MCP (`mcp__supabase__apply_migration` tool)
  - **NOTE:** This project uses MCP-based migrations, NOT Supabase CLI
  - See `migration_history/README.md` for migration procedure
- Add database write to worker
- Deploy to Render
- Test with 142-page document
- Verify metrics written to database
- **Effort:** 2 hours
- **Risk:** Low (non-critical writes)

### Step 3: Phase 3 (Day After)
- Add columns to shell_files
- Execute migration
- Update worker to write summary
- Deploy to Render
- Test end-to-end
- **Effort:** 30 minutes
- **Risk:** Low (backward compatible)

---

## Monitoring and Alerting (Future)

Once logging is in place, we can add:

### Performance Alerts
- Alert if average_page_time_ms > 500ms (slow OCR)
- Alert if failed_pages > 5% of total_pages
- Alert if peak_memory_mb > 1500 (approaching limit)

### Cost Alerts
- Alert if monthly OCR cost > $100
- Alert if cost_per_page > $0.002 (higher than expected)

### Dashboard Metrics
- OCR processing time trend (last 30 days)
- Average confidence score trend
- Batch size effectiveness comparison
- Total OCR cost this month

---

## Testing Plan

### Test 1: Batch Size 20 (Current)
- Upload 142-page document
- Check Render logs for all batch timings
- Verify database metrics written correctly
- Calculate actual OCR time from logs

### Test 2: Batch Size 5 (Next)
- Change OCR_BATCH_SIZE to 5
- Upload same 142-page document
- Compare performance vs batch size 20
- Analyze logs for any bottlenecks

### Test 3: Large Document (Stress Test)
- Upload 300+ page document
- Verify all batches complete successfully
- Check memory usage doesn't exceed limits
- Confirm cost calculation is accurate

---

## Success Criteria

**Phase 1 Complete When:**
- Can see exact OCR timing in Render logs
- Can identify which batches are slow
- Can see memory usage per batch
- Can troubleshoot failed pages

**Phase 2 Complete When:**
- Can query historical OCR performance from database
- Can calculate monthly OCR costs
- Can compare batch size effectiveness
- Can generate performance reports

**Phase 3 Complete When:**
- Dashboard shows OCR timing for each file
- Users can see OCR confidence in UI
- Quick access to OCR status without complex queries

---

## Example Log Output

**What we'll see in Render dashboard after Phase 1:**

```
[INFO] OCR processing session started {
  shell_file_id: "6d9614ef-855d-4566-a802-70927a3f6e75",
  correlation_id: "85988456-8123-4566-9395-529024ade503",
  total_pages: 142,
  batch_size: 20,
  total_batches: 8,
  ocr_provider: "google_vision",
  timestamp: "2025-11-07T02:38:31.000Z"
}

[INFO] OCR batch started {
  batch_number: 1,
  total_batches: 8,
  batch_size: 20,
  pages_in_batch: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20",
  memory_before_mb: 250,
  timestamp: "2025-11-07T02:38:31.500Z"
}

[INFO] OCR batch completed {
  batch_number: 1,
  total_batches: 8,
  processing_time_ms: 4500,
  successful_pages: 20,
  failed_pages: 0,
  average_confidence: "0.9745",
  memory_after_mb: 280,
  memory_delta_mb: 30,
  timestamp: "2025-11-07T02:38:36.000Z"
}

... (repeat for batches 2-8)

[INFO] OCR processing session completed {
  total_pages: 142,
  total_batches: 8,
  total_processing_time_ms: 36000,
  average_batch_time_ms: 4500,
  average_page_time_ms: 253,
  successful_pages: 142,
  failed_pages: 0,
  average_confidence: "0.9732",
  peak_memory_mb: 320,
  timestamp: "2025-11-07T02:39:07.000Z"
}
```

---

## Cost-Benefit Analysis

**Development Time:**
- Phase 1: 30 minutes
- Phase 2: 2 hours
- Phase 3: 30 minutes
- **Total:** 3 hours

**Benefits:**
- Save 2-4 hours per week on troubleshooting
- Identify optimal batch size (potential 30-50% OCR speedup)
- Track OCR costs accurately (budget planning)
- Detect performance regressions immediately
- Better user experience (show processing status)

**ROI:** Positive within first week

---

## Approval Checklist

Before implementing, confirm:

- [x] Logging structure is comprehensive enough
- [x] Database schema captures all needed metrics
- [x] RLS policies are correct (uses V3 `get_accessible_profiles()`)
- [x] Cost calculation formula is accurate
- [x] Rollout plan is acceptable
- [x] No concerns about database storage costs
- [x] No concerns about log volume in Render
- [x] Array columns have NOT NULL defaults
- [x] Composite index for time-series queries included
- [x] Environment, app_version, worker_id tracking included
- [x] Per-page cost calculation included
- [x] Migration uses MCP approach (not CLI)

---

## Next Steps After Approval

1. Implement Phase 1 (application logging)
2. Test with batch size 5 to compare performance
3. Create migration for Phase 2 (metrics table)
4. Deploy and validate all three phases
5. Create dashboard queries for monitoring
6. Document how to use metrics for optimization
