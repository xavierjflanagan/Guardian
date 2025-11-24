# Memory Exhaustion Root Cause and Fixes

**Date:** 2025-11-03
**Issue:** Render worker exceeding memory limit, causing crashes and stuck jobs
**Root Cause:** `WORKER_CONCURRENCY=50` with insufficient RAM on Render Starter plan

---

## Problem Analysis

### Render Email Alert
```
Web Service Exora Health exceeded its memory limit

An instance of your Web Service Exora Health exceeded its memory limit,
which triggered an automatic restart. While restarting, the instance was
temporarily unavailable.

This might have been caused by:
- A memory leak in your application
- A spike in incoming traffic
- An undersized instance type for your use case
```

### Root Cause: Worker Concurrency Too High

**Current Configuration:**
- `WORKER_CONCURRENCY=50` (processing 50 jobs simultaneously)
- Render instance type: Likely **Starter** (512MB RAM)

**Memory Math:**
```
512MB RAM ÷ 50 concurrent jobs = ~10MB per job

Actual memory need per large file job:
- PDF/TIFF file in memory: 2-20MB
- OCR processing buffers: 5-10MB per page
- AI request/response: 2-5MB
- Node.js base overhead: ~50MB
- Per-job overhead: ~5-10MB
TOTAL: 30-50MB per job (for large files)

With 50 concurrent jobs: 1.5-2.5GB RAM needed
Available: 512MB RAM
DEFICIT: 1-2GB (causes crashes)
```

### Why Both Tests Crashed
1. **21MB TIFF (2 pages):** Uncompressed TIFF = 10.5MB per page in memory
2. **142-page PDF (2.5MB):** 142 pages × OCR processing = high memory usage
3. Both exceeded the ~10MB per-job budget
4. Worker crashed → Render restarted → heartbeats stopped → jobs stuck

### Why This Is NEW
Possible reasons:
1. Recently increased file sizes being uploaded
2. Pass 0.5 v2.3 page-by-page processing uses more memory
3. Concurrent large file uploads
4. Changed OCR provider (Google Cloud Vision vs AWS Textract)

---

## Solutions (Priority Order)

### Solution 1: REDUCE WORKER CONCURRENCY (Immediate Fix)
**Impact:** Prevents crashes with current Render plan
**Effort:** 5 minutes

**Calculation:**
```
Target: 50MB per job (safe for large files)
Available RAM: 512MB
Node.js base: -50MB
Usable: 462MB
Safe concurrency: 462MB ÷ 50MB = ~9 jobs

Recommended: WORKER_CONCURRENCY=5
- Conservative for large files
- Allows 100MB per job
- Leaves headroom for memory spikes
```

**Implementation:**
```bash
# Update Render environment variable
WORKER_CONCURRENCY=5  # Down from 50
```

**Trade-off:**
- Jobs process slower (5 at a time vs 50)
- But they DON'T CRASH
- Better to process slowly than crash repeatedly

---

### Solution 2: UPGRADE RENDER INSTANCE (Recommended Long-term)
**Impact:** Allows higher concurrency without crashes
**Effort:** 2 minutes, costs ~$7-25/month more

**Render Plan Comparison:**
| Plan | RAM | CPU | Cost/month | Recommended Concurrency |
|------|-----|-----|------------|------------------------|
| Starter | 512MB | 0.5 CPU | $7 | 5 jobs |
| Standard | 2GB | 1 CPU | $25 | 20 jobs |
| Pro | 4GB | 2 CPU | $85 | 40 jobs |

**Recommendation:** Upgrade to **Standard** ($25/month)
- 2GB RAM = 4x current capacity
- Can handle 20 concurrent jobs safely
- Better performance for 142-page PDFs
- Allows future growth

**Implementation:**
1. Go to Render dashboard
2. Select "Exora Health" service
3. Settings → Instance Type → Standard
4. Update `WORKER_CONCURRENCY=20`

---

### Solution 3: IMPLEMENT MEMORY MONITORING (Proactive)
**Impact:** Detect memory issues before crashes
**Effort:** 30 minutes

**Add to worker:**
```typescript
// At top of main worker file
const memoryMonitor = setInterval(() => {
  const usage = process.memoryUsage();
  const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
  const rssMB = Math.round(usage.rss / 1024 / 1024);

  console.log(`[MEMORY] Heap: ${heapUsedMB}/${heapTotalMB}MB, RSS: ${rssMB}MB`);

  // Alert if approaching limits
  if (heapUsedMB > heapTotalMB * 0.9) {
    console.error(`[MEMORY WARNING] Heap usage at ${Math.round(heapUsedMB/heapTotalMB*100)}%`);
  }

  // Force garbage collection if available
  if (global.gc && heapUsedMB > heapTotalMB * 0.85) {
    console.log('[MEMORY] Forcing garbage collection');
    global.gc();
  }
}, 30000); // Every 30 seconds
```

**Run Node.js with GC flags:**
```bash
node --expose-gc --max-old-space-size=450 dist/index.js
```

---

### Solution 4: OPTIMIZE LARGE FILE PROCESSING (Long-term)
**Impact:** Reduces memory per job
**Effort:** 2-4 hours

**Strategies:**
1. **Stream large files instead of loading entirely:**
   ```typescript
   // Instead of: const buffer = await fs.readFile(path)
   // Use: const stream = fs.createReadStream(path)
   ```

2. **Process pages in batches:**
   ```typescript
   // Instead of: await processAllPages(pages)
   // Use: for (const batch of chunks(pages, 10)) await processBatch(batch)
   ```

3. **Clear buffers after processing:**
   ```typescript
   let ocrResult = await processOCR(page);
   await writeToDatabase(ocrResult);
   ocrResult = null; // Clear reference
   if (global.gc) global.gc(); // Suggest collection
   ```

4. **Add file size limits:**
   ```typescript
   if (fileSizeMB > 50) {
     throw new Error('File too large for concurrent processing');
   }
   ```

---

### Solution 5: IMPLEMENT QUEUE PRIORITIZATION (Nice-to-have)
**Impact:** Process small files quickly, large files carefully
**Effort:** 1 hour

**Strategy:**
- Small files (< 5MB): High priority, high concurrency
- Large files (> 20MB): Low priority, single-threaded

**Implementation:**
Add to `job_queue` table:
```sql
file_size_category TEXT GENERATED ALWAYS AS (
  CASE
    WHEN file_size_bytes < 5000000 THEN 'small'
    WHEN file_size_bytes < 20000000 THEN 'medium'
    ELSE 'large'
  END
) STORED;
```

Update worker to claim by category:
```typescript
const concurrency = {
  small: 15,
  medium: 5,
  large: 1
};
```

---

## Recommended Action Plan

### IMMEDIATE (Today)
1. **Reduce concurrency to 5** via Render environment variables
2. **Deploy change** (no code changes needed)
3. **Monitor for crashes** over next 24 hours

### SHORT-TERM (This Week)
4. **Upgrade to Standard plan** ($25/month) if crashes stop
5. **Increase concurrency to 20** after upgrade
6. **Add memory monitoring** to worker code

### LONG-TERM (Next Sprint)
7. **Optimize large file processing** (streaming, batching)
8. **Implement queue prioritization** by file size
9. **Add integration tests** for large files (> 100 pages)

---

## Testing the Fix

### After Reducing Concurrency to 5:
1. Re-upload 142-page PDF
2. Upload 21MB TIFF
3. Monitor Render logs for memory warnings
4. Check if jobs complete without crashes

### Expected Results:
- Jobs take longer to start (queue depth increases)
- But they COMPLETE without crashing
- No more Render memory limit emails

### If Still Crashing:
- Reduce to `WORKER_CONCURRENCY=3`
- Or upgrade Render instance immediately

---

## Why 5-Minute Timeout Was a Bandaid

**User's correct observation:**
> "that reduction to 5 mins wasnt a solution to the root cause it was just a bandaid"

**Analysis:**
- **5-minute timeout** helps jobs recover FASTER after crashes
- But it doesn't PREVENT the crashes
- Root cause: Worker running out of memory due to high concurrency

**Proper fixes:**
1. Reduce concurrency (prevents crashes)
2. Upgrade instance (more memory)
3. Optimize code (use less memory per job)

**5-minute timeout remains useful:**
- Helps recovery when crashes DO occur
- Good safety net for transient issues
- But not a substitute for fixing memory issue

---

## Cost Analysis

| Solution | One-time Cost | Monthly Cost | Crash Prevention |
|----------|---------------|--------------|------------------|
| Reduce concurrency | $0 | $0 | High |
| Upgrade to Standard | $0 | +$18 | Very High |
| Add monitoring | 2 hours dev | $0 | N/A (detection only) |
| Optimize code | 8 hours dev | $0 | Medium |

**Recommendation:** Reduce concurrency NOW (free), upgrade to Standard this week ($18/month).

---

## Full Implementation Plan

See comprehensive enhancement plan with code examples and timeline:
**`apps/render-worker/docs/WORKER-ENHANCEMENTS-MEMORY-STABILITY.md`**

Includes:
- All P0/P1/P2/P3 enhancements
- Code implementation examples
- 27-hour total effort breakdown
- Testing strategy
- Success metrics
