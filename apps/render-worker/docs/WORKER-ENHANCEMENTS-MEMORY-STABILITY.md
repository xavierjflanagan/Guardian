# Render Worker Enhancements: Memory Stability & Performance

**Date Created:** 2025-11-03
**Status:** Planning
**Priority:** HIGH - Memory crashes blocking production use
**Owner:** Infrastructure

---

## Executive Summary

The Render worker is experiencing memory exhaustion causing crashes and stuck jobs. Root cause analysis reveals:
1. **Accumulated memory over time** - worker doesn't clean up after each job
2. **High concurrency setting** (50 jobs) exceeds available RAM (512MB)
3. **Large file processing** (21MB TIFF, 142-page PDFs) triggers crashes on memory-constrained workers

**Impact:** Jobs crash on first attempt, succeed on retry after worker restart (fresh memory)

---

## Problem Analysis

### Memory Leak Pattern Discovered

**Observation:**
- Worker instance `1762143289945` ran for 2.5 hours (04:21 → 06:53)
- Processed multiple small files successfully
- Crashed when attempting large file (TIFF or 142-page PDF)
- NEW worker instance `1762153220973` started at 07:08
- Fresh worker processed SAME large file successfully

**Conclusion:** Memory accumulates over time, not garbage collected between jobs

### Memory Budget Analysis

```
Render Starter Plan: 512MB RAM
Node.js base overhead: ~50MB
Available for jobs: ~462MB

Current config: WORKER_CONCURRENCY=50
Available per job: 462MB ÷ 50 = ~9MB per job

Actual need per large file:
- File buffer in memory: 2-25MB
- OCR processing: 5-10MB per page
- AI request/response: 2-5MB
- Pass 0.5 + Pass 1 combined: 20-50MB

Result: Memory exhaustion after processing multiple jobs
```

---

## Enhancement Plan

### Priority Levels
- **P0 (CRITICAL):** Blocks production, implement immediately
- **P1 (HIGH):** Improves stability, implement this week
- **P2 (MEDIUM):** Prevents future issues, implement this sprint
- **P3 (LOW):** Nice-to-have, implement when capacity allows

---

## P0: CRITICAL - Immediate Fixes (TODAY)

### 1. Reduce Worker Concurrency
**Time:** 5 minutes
**Effort:** Trivial (environment variable change)
**Risk:** None (only reduces throughput)
**Status:** ⏳ PENDING USER ACTION

**Implementation:**
```bash
# Render Dashboard → Exora Health service → Environment
WORKER_CONCURRENCY=5  # Down from 50
```

**ACTION REQUIRED:**
User needs to manually change this in Render dashboard:
1. Go to https://dashboard.render.com
2. Find "Exora Health" service
3. Click → Environment tab
4. Find or add `WORKER_CONCURRENCY`
5. Change value to `5`
6. Click Save (triggers auto-redeploy)

**Calculation:**
```
512MB RAM - 50MB Node.js = 462MB available
462MB ÷ 5 jobs = 92MB per job
Safe for 21MB TIFF + processing overhead
```

**Testing:**
1. Change env var in Render dashboard
2. Trigger deploy (or wait for auto-redeploy)
3. Re-upload 142-page PDF + 21MB TIFF
4. Monitor for crashes over 24 hours

**Expected Result:** Jobs take longer to start but DON'T CRASH

**Trade-off:** Queue depth increases (5 concurrent vs 50), but stability improves

---

### 2. Add Explicit Garbage Collection After Each Job
**Time:** 30-60 minutes
**Effort:** Low (add cleanup code)
**Risk:** Low (improves stability)
**Status:** ✅ IMPLEMENTED (2025-11-03)

**Files Modified:**
- `apps/render-worker/src/worker.ts` (lines 537-545, 1392-1426)

**Implementation:**
```typescript
// worker.ts:537-545 - Added cleanup call in finally block
} finally {
  // Remove from active jobs
  this.activeJobs.delete(jobId);

  // P0 FIX: Explicit memory cleanup after each job
  // Purpose: Prevent memory accumulation over time (multi-pass processing uses 70-85MB per large file)
  // Context: Memory leak pattern discovered 2025-11-03 - worker accumulates memory until OOM crash
  await this.cleanupJobMemory(jobId);
}

// worker.ts:1392-1426 - New cleanupJobMemory method
private async cleanupJobMemory(jobId: string) {
  try {
    // Log memory before cleanup
    const beforeMemory = process.memoryUsage();
    const beforeHeapMB = Math.round(beforeMemory.heapUsed / 1024 / 1024);

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      const afterMemory = process.memoryUsage();
      const afterHeapMB = Math.round(afterMemory.heapUsed / 1024 / 1024);
      const freedMB = beforeHeapMB - afterHeapMB;

      this.logger.info('Memory cleanup completed', {
        job_id: jobId,
        heap_before_mb: beforeHeapMB,
        heap_after_mb: afterHeapMB,
        freed_mb: freedMB,
      });
    } else {
      this.logger.warn('Garbage collection not available - run Node with --expose-gc flag', {
        job_id: jobId,
        heap_used_mb: beforeHeapMB,
      });
    }
  } catch (error) {
    // Don't fail the job if cleanup fails
    this.logger.error('Memory cleanup failed', error as Error, { job_id: jobId });
  }
}
```

**Update Render start command:**
**Status:** ✅ IMPLEMENTED (2025-11-03)

```json
// package.json:8
{
  "scripts": {
    "start": "node --expose-gc --max-old-space-size=450 dist/worker.js"
  }
}
```

**Files Modified:**
- `apps/render-worker/package.json` (line 8)

**Changes:**
- Added `--max-old-space-size=450` flag (was already using `--expose-gc`)
- Limits heap to 450MB (62MB safety margin for 512MB RAM)

**Flags explained:**
- `--expose-gc`: Allows manual garbage collection via `global.gc()` ✅
- `--max-old-space-size=450`: Limits heap to 450MB (prevents OOM crashes) ✅

**Testing:**
1. Deploy changes ⏳ PENDING
2. Process 10 consecutive large files ⏳ PENDING
3. Monitor memory usage (should not accumulate) ⏳ PENDING

---

## P1: HIGH - This Week

### 3. Add Memory Monitoring
**Time:** 1-2 hours
**Effort:** Low-Medium (logging + monitoring)
**Risk:** None (monitoring only)

**File:** `apps/render-worker/src/monitoring/memory-monitor.ts` (NEW)

**Implementation:**
```typescript
// memory-monitor.ts
export class MemoryMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly WARNING_THRESHOLD = 0.85; // 85% heap usage
  private readonly CRITICAL_THRESHOLD = 0.95; // 95% heap usage

  start(intervalMs: number = 30000) {
    this.intervalId = setInterval(() => {
      this.checkMemory();
    }, intervalMs);

    console.log(`[MEMORY MONITOR] Started - checking every ${intervalMs/1000}s`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private checkMemory() {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    const heapPercent = (usage.heapUsed / usage.heapTotal);

    // Always log current state
    console.log(
      `[MEMORY] Heap: ${heapUsedMB}/${heapTotalMB}MB (${Math.round(heapPercent * 100)}%), ` +
      `RSS: ${rssMB}MB`
    );

    // Warn at 85%
    if (heapPercent > this.WARNING_THRESHOLD) {
      console.warn(
        `[MEMORY WARNING] Heap usage at ${Math.round(heapPercent * 100)}% - ` +
        `approaching limit`
      );
    }

    // Critical at 95%
    if (heapPercent > this.CRITICAL_THRESHOLD) {
      console.error(
        `[MEMORY CRITICAL] Heap usage at ${Math.round(heapPercent * 100)}% - ` +
        `forcing GC and reducing concurrency`
      );

      // Force GC
      if (global.gc) {
        global.gc();
        console.log('[MEMORY] Forced garbage collection');
      }

      // TODO: Temporarily reduce concurrency or pause job claiming
    }

    // Log to metrics table (optional)
    this.logToDatabase(heapUsedMB, heapTotalMB, rssMB);
  }

  private async logToDatabase(heapUsed: number, heapTotal: number, rss: number) {
    // Optional: Log to worker_memory_metrics table for long-term analysis
    // This helps identify memory leak patterns over days/weeks
  }
}

// In main worker file
import { MemoryMonitor } from './monitoring/memory-monitor';

const memoryMonitor = new MemoryMonitor();
memoryMonitor.start(30000); // Check every 30 seconds
```

**Benefits:**
- Real-time visibility into memory usage
- Proactive warnings before crashes
- Historical data for leak analysis

---

### 4. Upgrade Render Instance to Standard
**Time:** 5 minutes
**Effort:** Trivial (dashboard change)
**Risk:** None (more resources)
**Cost:** +$18/month ($7 → $25)

**Why:**
- Current: 512MB RAM (insufficient)
- Standard: 2GB RAM (4x more memory)
- Allows `WORKER_CONCURRENCY=20` instead of 5

**Implementation:**
1. Render Dashboard → Exora Health service
2. Settings → Instance Type → Standard ($25/month)
3. Update `WORKER_CONCURRENCY=20`
4. Deploy

**ROI:**
- 4x throughput increase (5 → 20 concurrent jobs)
- Eliminates memory crashes
- Cost: $18/month = less than 1 hour of dev time

---

## P2: MEDIUM - This Sprint (Next 1-2 Weeks)

### 5. Implement Auto-Restart After N Jobs
**Time:** 2-3 hours
**Effort:** Medium (graceful shutdown logic)
**Risk:** Low (improves long-term stability)

**Purpose:** Prevent memory accumulation by restarting worker proactively

**File:** `apps/render-worker/src/workers/auto-restart.ts` (NEW)

**Implementation:**
```typescript
// auto-restart.ts
export class AutoRestartManager {
  private jobsProcessed = 0;
  private startTime = Date.now();
  private readonly MAX_JOBS = parseInt(process.env.RESTART_AFTER_JOBS || '100', 10);
  private readonly MAX_UPTIME_HOURS = parseInt(process.env.RESTART_AFTER_HOURS || '12', 10);

  async checkShouldRestart(): Promise<boolean> {
    const uptimeHours = (Date.now() - this.startTime) / (1000 * 60 * 60);

    // Restart after N jobs
    if (this.jobsProcessed >= this.MAX_JOBS) {
      console.log(
        `[AUTO-RESTART] Processed ${this.jobsProcessed} jobs - ` +
        `restarting for memory hygiene`
      );
      return true;
    }

    // Restart after X hours
    if (uptimeHours >= this.MAX_UPTIME_HOURS) {
      console.log(
        `[AUTO-RESTART] Uptime ${uptimeHours.toFixed(1)} hours - ` +
        `restarting for memory hygiene`
      );
      return true;
    }

    return false;
  }

  incrementJobCount() {
    this.jobsProcessed++;
  }

  async gracefulRestart() {
    console.log('[AUTO-RESTART] Initiating graceful restart...');

    // 1. Stop claiming new jobs
    console.log('[AUTO-RESTART] Stopped claiming new jobs');

    // 2. Wait for current jobs to complete (timeout 5 minutes)
    await this.waitForJobCompletion(300000);

    // 3. Close database connections
    await this.closeConnections();

    // 4. Exit process - Render will restart automatically
    console.log('[AUTO-RESTART] Exiting process - Render will restart');
    process.exit(0);
  }

  private async waitForJobCompletion(timeoutMs: number) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const activeJobs = await getActiveJobCount(); // Your implementation
      if (activeJobs === 0) {
        console.log('[AUTO-RESTART] All jobs completed');
        return;
      }
      console.log(`[AUTO-RESTART] Waiting for ${activeJobs} jobs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5s
    }
    console.warn('[AUTO-RESTART] Timeout waiting for jobs - forcing restart');
  }

  private async closeConnections() {
    // Close Supabase connections, etc.
    console.log('[AUTO-RESTART] Closing database connections');
  }
}

// In main worker loop
import { AutoRestartManager } from './workers/auto-restart';

const restartManager = new AutoRestartManager();

async function workerLoop() {
  while (true) {
    const job = await claimNextJob();
    if (job) {
      await processJob(job);
      restartManager.incrementJobCount();
    }

    // Check if should restart
    if (await restartManager.checkShouldRestart()) {
      await restartManager.gracefulRestart();
      // Will exit here - Render restarts worker automatically
    }

    await sleep(5000);
  }
}
```

**Configuration (Render env vars):**
```bash
RESTART_AFTER_JOBS=100    # Restart after 100 jobs processed
RESTART_AFTER_HOURS=12    # Or after 12 hours uptime
```

**Benefits:**
- Prevents long-running memory accumulation
- Graceful shutdown (completes current jobs)
- Automatic restart by Render
- Fresh memory every 12 hours or 100 jobs

---

### 6. Optimize Large File Processing (Streaming)
**Time:** 4-6 hours
**Effort:** High (refactor file handling)
**Risk:** Medium (requires testing)

**Problem:** Loading entire 21MB TIFF into memory at once

**Solution:** Stream file processing where possible

**File:** `apps/render-worker/src/services/file-processor.ts`

**Current (BAD):**
```typescript
// Loads entire file into memory
const fileBuffer = await fs.readFile(filePath);
const ocrResult = await processOCR(fileBuffer);
```

**Improved (GOOD):**
```typescript
// Stream file in chunks
const fileStream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 }); // 1MB chunks
const ocrResult = await processOCRStream(fileStream);

// Clear buffer after each page
for (const page of pages) {
  const pageBuffer = await extractPage(file, page);
  const ocrResult = await processOCR(pageBuffer);
  await saveToDatabase(ocrResult);

  // Immediately free memory
  pageBuffer = null;
  if (global.gc && page % 10 === 0) {
    global.gc(); // GC every 10 pages
  }
}
```

**Benefits:**
- Reduces peak memory usage by 70-80%
- Allows processing of 100+ page files
- More resilient to memory spikes

**Trade-offs:**
- More complex code
- Slightly slower (due to chunking overhead)
- Requires thorough testing

---

### 7. Add File Size Limits and Warnings
**Time:** 1 hour
**Effort:** Low (validation logic)
**Risk:** None (safety checks)

**File:** `apps/render-worker/src/services/file-validator.ts` (NEW)

**Implementation:**
```typescript
// file-validator.ts
export class FileValidator {
  private readonly WARN_SIZE_MB = 10;
  private readonly MAX_SIZE_MB = 50;
  private readonly WARN_PAGES = 50;
  private readonly MAX_PAGES = 200;

  async validate(file: { size: number; pageCount?: number; filename: string }) {
    const sizeMB = file.size / (1024 * 1024);

    // Hard limit: reject files over 50MB
    if (sizeMB > this.MAX_SIZE_MB) {
      throw new Error(
        `File too large: ${sizeMB.toFixed(1)}MB exceeds ${this.MAX_SIZE_MB}MB limit. ` +
        `Please split into smaller files.`
      );
    }

    // Hard limit: reject files over 200 pages
    if (file.pageCount && file.pageCount > this.MAX_PAGES) {
      throw new Error(
        `File has too many pages: ${file.pageCount} exceeds ${this.MAX_PAGES} limit. ` +
        `Please split into smaller files.`
      );
    }

    // Warning: large file, process carefully
    if (sizeMB > this.WARN_SIZE_MB) {
      console.warn(
        `[FILE SIZE WARNING] Large file detected: ${file.filename} ` +
        `(${sizeMB.toFixed(1)}MB) - using conservative memory settings`
      );
      return { isLarge: true, size: sizeMB };
    }

    // Warning: many pages, process carefully
    if (file.pageCount && file.pageCount > this.WARN_PAGES) {
      console.warn(
        `[FILE SIZE WARNING] Many pages detected: ${file.filename} ` +
        `(${file.pageCount} pages) - using conservative memory settings`
      );
      return { isLarge: true, pages: file.pageCount };
    }

    return { isLarge: false };
  }
}

// In job processor
const validator = new FileValidator();
const validation = await validator.validate(fileInfo);

if (validation.isLarge) {
  // Use more conservative memory settings
  // e.g., force GC after each page, process synchronously
}
```

**Benefits:**
- Prevents obviously problematic files
- User-facing error messages (split files)
- Conservative processing for large files

---

## P3: LOW - Future Enhancements

### 8. Implement Queue Prioritization by File Size
**Time:** 3-4 hours
**Effort:** Medium (queue management logic)

**Strategy:** Process small files with high concurrency, large files single-threaded

**Database Migration:**
```sql
-- Add file size category to job_queue
ALTER TABLE job_queue ADD COLUMN file_size_category TEXT
GENERATED ALWAYS AS (
  CASE
    WHEN file_size_bytes < 5000000 THEN 'small'     -- < 5MB
    WHEN file_size_bytes < 20000000 THEN 'medium'   -- < 20MB
    ELSE 'large'                                     -- >= 20MB
  END
) STORED;

CREATE INDEX idx_job_queue_size_category ON job_queue(file_size_category, status);
```

**Worker Logic:**
```typescript
// Separate concurrency limits by file size
const CONCURRENCY_BY_SIZE = {
  small: 15,   // 15 concurrent small files
  medium: 5,   // 5 concurrent medium files
  large: 1     // 1 large file at a time
};

// Claim jobs based on available slots per category
async function claimNextJob() {
  const category = getAvailableCategory(); // Which category has free slots?
  return await claimNextJobByCategory(category);
}
```

---

### 9. Add Worker Health Checks and Auto-Recovery
**Time:** 2-3 hours
**Effort:** Medium (health check endpoint)

**Implementation:**
```typescript
// health-check.ts
import express from 'express';

const app = express();

app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    activeJobs: getActiveJobCount(),
    timestamp: new Date().toISOString()
  };

  // Unhealthy if memory critical
  const heapPercent = health.memory.heapUsed / health.memory.heapTotal;
  if (heapPercent > 0.95) {
    health.status = 'unhealthy';
    res.status(503).json(health);
  } else {
    res.status(200).json(health);
  }
});

app.listen(process.env.HEALTH_CHECK_PORT || 10000);
```

**Render Configuration:**
Configure health check endpoint in Render dashboard to auto-restart unhealthy workers.

---

## Implementation Timeline

### Week 1 (Immediate)
- [ ] **Day 1:** Reduce `WORKER_CONCURRENCY` to 5 (5 min)
- [ ] **Day 1:** Add explicit garbage collection (1 hour)
- [ ] **Day 1:** Deploy and test (2 hours)
- [ ] **Day 2:** Add memory monitoring (2 hours)
- [ ] **Day 3:** Upgrade to Standard instance + increase concurrency to 20 (30 min)

**Total: ~5-6 hours** spread over 3 days

### Week 2 (High Priority)
- [ ] Auto-restart after N jobs (3 hours)
- [ ] File size validation and limits (1 hour)
- [ ] Testing and monitoring (2 hours)

**Total: ~6 hours**

### Week 3-4 (Medium Priority)
- [ ] Optimize large file processing with streaming (6 hours)
- [ ] Comprehensive testing with 100+ page files (3 hours)

**Total: ~9 hours**

### Future (Low Priority)
- [ ] Queue prioritization by file size (4 hours)
- [ ] Health check endpoint (3 hours)

**Total: ~7 hours**

---

## Total Effort Summary

| Priority | Effort | Timeline | Impact |
|----------|--------|----------|--------|
| **P0 (Critical)** | 5-6 hours | Week 1 | Eliminates crashes |
| **P1 (High)** | 6 hours | Week 2 | Improves stability |
| **P2 (Medium)** | 9 hours | Week 3-4 | Long-term health |
| **P3 (Low)** | 7 hours | Future | Optimization |
| **TOTAL** | **27-28 hours** | 4 weeks | Production-ready |

---

## If We Wanted to Do It Now

**Bare Minimum (P0 only):**
- 5-6 hours total
- Eliminates crashes
- Makes worker production-stable

**Recommended (P0 + P1):**
- 11-12 hours total (1.5 days)
- Eliminates crashes
- Adds monitoring and auto-recovery
- Sets foundation for long-term stability

**Complete (P0 + P1 + P2):**
- 20-21 hours total (2.5-3 days)
- Production-grade stability
- Handles edge cases
- Optimized for large files

---

## Testing Strategy

### After Each Enhancement:
1. **Upload test files:**
   - 21MB TIFF (known crash case)
   - 142-page PDF (known crash case)
   - 10 consecutive 20-page PDFs (memory accumulation test)

2. **Monitor logs for:**
   - Memory usage trends
   - GC invocations
   - Crash events
   - Worker restart events

3. **Verify:**
   - Jobs complete successfully
   - No stuck jobs with dead heartbeats
   - Memory usage remains stable over time

4. **Load test:**
   - Upload 50 files rapidly
   - Monitor queue depth
   - Verify all complete within reasonable time

---

## Success Metrics

1. **Zero memory-related crashes** over 7-day period
2. **Memory usage stable** (doesn't increase over time)
3. **Job success rate > 99%** (excluding user error)
4. **Average job retry rate < 5%**
5. **Worker uptime > 99.5%** (excluding planned restarts)

---

## Rollback Plan

If enhancements cause issues:
1. **Revert concurrency:** Set back to 50 (or find middle ground like 10)
2. **Disable auto-restart:** Remove restart logic
3. **Disable aggressive GC:** May slow down job processing
4. **Monitor closely:** 24-hour observation period

---

## Questions for Discussion

1. Should we implement P0 immediately (today) or wait for review?
2. Budget for Standard instance upgrade ($18/month)? Worth the 4x performance?
3. File size limits: 50MB max reasonable? Or should we support larger?
4. Auto-restart interval: 100 jobs or 12 hours - which is better?
5. Should we add database table for worker metrics (long-term analysis)?

---

## Next Steps

1. **User approval** for P0 critical fixes
2. **Deploy P0** to production (5-6 hours)
3. **Monitor for 48 hours** to confirm stability
4. **Schedule P1** implementation (Week 2)
5. **Review metrics** after 1 week, adjust strategy if needed
