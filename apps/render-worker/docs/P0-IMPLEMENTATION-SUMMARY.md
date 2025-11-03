# P0 Memory Stability Fixes - Implementation Summary

**Date:** 2025-11-03
**Status:** Code Complete - Pending Deployment
**Time Spent:** ~1.5 hours

---

## What Was Fixed

### Root Cause Discovery

**Memory Leak Pattern:**
- Worker accumulates memory over time (70-85MB per large file job)
- After 2.5 hours of operation, worker OOM crashes on large files
- Fresh worker (post-restart) processes same file successfully

**Why Multi-Pass Makes It Worse:**
Currently only Pass 0.5 runs (Pass 1 temporarily disabled for testing).
When all passes are enabled, memory accumulates:
```
File load: 20MB
+ Pass 0.5 OCR: +30MB
+ Pass 1 Vision AI: +20MB
+ Pass 2 Clinical: +15MB (future)
= 85MB per large file
```

With concurrency=50: 85MB × 50 = **4.25GB needed** (but only 512MB available) ❌

---

## Code Changes Implemented

### 1. Added Garbage Collection After Each Job ✅

**File:** `apps/render-worker/src/worker.ts`

**Lines 537-545:** Added cleanup call in `processJob()` finally block
```typescript
} finally {
  // Remove from active jobs
  this.activeJobs.delete(jobId);

  // P0 FIX: Explicit memory cleanup
  await this.cleanupJobMemory(jobId);
}
```

**Lines 1392-1426:** New `cleanupJobMemory()` method
- Logs memory before/after garbage collection
- Forces GC via `global.gc()` if available
- Logs freed memory for monitoring
- Gracefully handles GC failures (doesn't fail job)

**Benefits:**
- Prevents memory accumulation between jobs
- Provides visibility into memory usage (logs freed MB)
- Catches cases where GC isn't available (warns)

---

### 2. Updated Node.js Startup Flags ✅

**File:** `apps/render-worker/package.json`

**Line 8:** Updated `start` script
```json
"start": "node --expose-gc --max-old-space-size=450 dist/worker.js"
```

**Changes:**
- ✅ `--expose-gc` (already present) - enables `global.gc()`
- ✅ `--max-old-space-size=450` (NEW) - hard limit heap to 450MB

**Benefits:**
- Prevents heap from exceeding 450MB (62MB safety margin)
- Forces earlier garbage collection (more aggressive cleanup)
- Crashes with clear OOM error instead of silent hang

---

### 3. Code Build ✅

**Command:** `npm run build` in `apps/render-worker/`

**Result:** ✅ Build successful, no TypeScript errors

**Output Files:**
- `apps/render-worker/dist/worker.js` (updated)
- All dependencies intact

---

## Pending Actions

### 1. User Must Change WORKER_CONCURRENCY in Render Dashboard ⏳

**Why User Must Do This:**
- Claude Code cannot access Render dashboard
- Requires manual login and configuration change

**Steps:**
1. Go to https://dashboard.render.com
2. Select "Exora Health" service
3. Click **Environment** tab
4. Find or add `WORKER_CONCURRENCY`
5. Change value from `50` to `5`
6. Click **Save** (triggers auto-redeploy)

**Why 5 is the Right Number:**
```
512MB RAM total
- 50MB Node.js base
= 462MB available
÷ 5 concurrent jobs
= 92MB per job

Actual need (multi-pass): 70-85MB per large file
Result: Fits comfortably with headroom ✅
```

---

### 2. Deploy to Render ⏳

**After user changes WORKER_CONCURRENCY:**

Render will auto-redeploy with the new code because the env var change triggers a deploy.

**OR manually trigger deploy:**
```bash
git add apps/render-worker/
git commit -m "feat(worker): Add P0 memory stability fixes

- Add explicit garbage collection after each job
- Limit heap size to 450MB for safety
- Log memory usage before/after GC
- Prevent memory accumulation over time

Fixes OOM crashes with large files after 2.5+ hours operation"

git push origin main  # Triggers Render auto-deploy
```

---

### 3. Testing After Deployment ⏳

**Test Plan:**

**Test 1: Verify GC is working**
```bash
# Check Render logs after deploying
# Should see lines like:
[MEMORY] Memory cleanup completed
  heap_before_mb: 245
  heap_after_mb: 187
  freed_mb: 58
```

**Test 2: Re-upload crash files**
1. Upload 21MB TIFF file
2. Upload 142-page PDF
3. Both should complete successfully
4. Check Render logs for memory cleanup messages

**Test 3: Stress test (10 consecutive large files)**
1. Upload 10 files rapidly (mix of sizes)
2. Monitor queue depth (should process 5 at a time)
3. Check memory doesn't accumulate over time
4. All should complete without crashes

**Test 4: Long-running stability (24-hour soak test)**
1. Leave worker running for 24 hours
2. Upload files periodically throughout day
3. Verify no memory-related crashes
4. Check that worker doesn't need manual restarts

**Success Criteria:**
- ✅ Zero OOM crashes over 24 hours
- ✅ Memory freed after each job (logs show positive freed_mb)
- ✅ Large files process successfully
- ✅ Worker can run indefinitely without restart

---

## Memory Budget Analysis

### Current Reality (Pass 0.5 Only)
```
Small file (5MB, 10 pages):
  File: 5MB + Pass 0.5: 15MB = 20MB total
  5 concurrent: 100MB (safe ✅)

Large file (21MB TIFF, 2 pages):
  File: 21MB + Pass 0.5: 30MB = 51MB total
  5 concurrent: 255MB (safe ✅)

XL file (142 pages, 2.5MB):
  File: 2.5MB + Pass 0.5: 45MB = 47.5MB total
  5 concurrent: 237MB (safe ✅)
```

### Future Reality (All Passes Enabled)
```
Large file (21MB TIFF):
  File: 21MB
  + Pass 0.5: 30MB
  + Pass 1: 20MB
  + Pass 2: 15MB
  = 86MB total
  5 concurrent: 430MB (safe ✅)

XL file (142 pages):
  File: 2.5MB
  + Pass 0.5: 45MB
  + Pass 1: 25MB
  + Pass 2: 15MB
  = 87.5MB total
  5 concurrent: 437MB (safe ✅)
```

**Conclusion:** Concurrency=5 is safe for multi-pass processing ✅

---

## Monitoring Checklist

After deployment, monitor these metrics:

### Render Dashboard
- [ ] CPU usage (should stay < 80%)
- [ ] Memory usage (should stay < 450MB)
- [ ] Restart events (should be zero unplanned restarts)
- [ ] Health check status (should be green)

### Render Logs
- [ ] Look for "Memory cleanup completed" messages
- [ ] Check freed_mb values (should be positive)
- [ ] Watch for "Garbage collection not available" warnings (should be none)
- [ ] Monitor job processing times (shouldn't increase over time)

### Supabase Database
- [ ] Query for jobs stuck in processing (should be zero)
- [ ] Check retry_count distribution (should be low)
- [ ] Monitor dead_letter_at (should have no new entries)

### Email Alerts
- [ ] No more "memory limit exceeded" emails from Render
- [ ] No customer complaints about stuck uploads

---

## Rollback Plan

If issues arise after deployment:

**Immediate Rollback (< 5 minutes):**
1. Render Dashboard → Exora Health → Settings
2. Click "Rollback" to previous deployment
3. Or: Change `WORKER_CONCURRENCY` back to `50`

**Code Rollback:**
```bash
git revert HEAD
git push origin main
```

**Symptoms Requiring Rollback:**
- Jobs taking > 15 minutes to start (queue depth too high)
- GC causing visible processing delays
- Memory warnings still appearing in logs

---

## Next Steps After P0

Once P0 is stable (24-48 hours without issues):

### Week 2: P1 Enhancements
1. Add memory monitoring (2 hours)
2. Upgrade to Standard instance OR add 2nd worker ($14-25/month)
3. Increase concurrency to 10-20

### Week 3-4: P2 Optimizations
1. Auto-restart after N jobs (3 hours)
2. Streaming for large files (6 hours)
3. File size validation (1 hour)

### Future: P3 Nice-to-Haves
1. Queue prioritization by file size
2. Health check endpoint
3. Metrics dashboard

---

## Questions for User

1. **Should we deploy P0 immediately or wait for your review?**
   - Code is ready to deploy
   - Just needs `WORKER_CONCURRENCY=5` env var change

2. **When should we schedule P1 enhancements?**
   - Memory monitoring (2 hours)
   - Instance upgrade decision

3. **Budget for Standard instance ($18/month extra)?**
   - 4x memory = handle more concurrency
   - Or stick with multiple Starter instances?

4. **Long-term scaling strategy?**
   - Horizontal (multiple small workers) vs Vertical (one big worker)

---

## Files Modified

1. `apps/render-worker/src/worker.ts`
   - Lines 537-545: Added cleanup call
   - Lines 1392-1426: New cleanupJobMemory method

2. `apps/render-worker/package.json`
   - Line 8: Updated start script with heap limit

3. `apps/render-worker/dist/worker.js`
   - Rebuilt with new code

4. `apps/render-worker/docs/WORKER-ENHANCEMENTS-MEMORY-STABILITY.md`
   - Updated with implementation status

5. `apps/render-worker/docs/P0-IMPLEMENTATION-SUMMARY.md`
   - This file (new)

---

## Git Commit Message (Ready to Use)

```
feat(worker): Add P0 memory stability fixes

Root cause: Worker accumulates memory over time (70-85MB per large
file job). After 2.5 hours operation, worker OOM crashes on large
files. Fresh worker processes same file successfully.

Solution:
- Add explicit garbage collection after each job
- Limit heap size to 450MB (safety margin for 512MB RAM)
- Log memory usage before/after GC for monitoring
- Reduce concurrency from 50 to 5 (awaiting env var change)

Memory budget (multi-pass):
- Large file: 85MB × 5 concurrent = 425MB (fits in 462MB available)
- Concurrency=5 is optimal for stability

Fixes:
- OOM crashes with 21MB TIFF files
- OOM crashes with 142-page PDFs
- Memory accumulation pattern over 2.5+ hours

Testing:
- Build successful
- TypeScript compilation clean
- Awaiting deployment and 24-hour soak test

Files modified:
- apps/render-worker/src/worker.ts (cleanup logic)
- apps/render-worker/package.json (Node.js flags)

Refs:
- test-07-regression-tests/MEMORY-ISSUE-ROOT-CAUSE-AND-FIXES.md
- apps/render-worker/docs/WORKER-ENHANCEMENTS-MEMORY-STABILITY.md
- apps/render-worker/docs/P0-IMPLEMENTATION-SUMMARY.md
```
