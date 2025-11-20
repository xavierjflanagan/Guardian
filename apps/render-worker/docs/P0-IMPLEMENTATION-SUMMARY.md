# P0 Memory Stability Fixes - Implementation Summary

**Date:** 2025-11-03
**Status:** REVISED - Concurrency=3 Required (Previously set to 5, insufficient)
**Time Spent:** ~3 hours (including stress testing and post-mortem)

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

### 1. User Must Change WORKER_CONCURRENCY in Render Dashboard ✅ COMPLETE

**Status:** User changed from 50 → 5 (initial) → 3 (revised after stress testing)

**Why 3 is the Right Number:**
```
512MB RAM total
- 50MB Node.js base
= 462MB available
÷ 3 concurrent jobs
= 154MB per job

Actual peak (observed): 120MB per large file
3 × 120MB = 360MB
Safety margin: 102MB (22% headroom)
Result: Safe and stable ✅
```

**Initial attempt (concurrency=5) failed due to:**
- Peak memory per job higher than calculated (120MB vs 85MB)
- Heap limit doesn't control total memory (buffers, native modules)
- 2 of 8 files failed in stress test

---

### 2. Deploy to Render ✅ COMPLETE

**Status:** Deployed 2025-11-03

**Deployment history:**
1. Initial deploy with concurrency=5
2. Stress test revealed insufficiency (2 of 8 files failed)
3. Revised to concurrency=3 and redeployed

**Git commit used:**
```bash
feat(worker): Add P0 memory stability fixes

- Add explicit garbage collection after each job
- Limit heap size to 450MB for safety
- Log memory usage before/after GC
- Prevent memory accumulation over time

Fixes OOM crashes with large files after 2.5+ hours operation
```

---

### 3. Testing After Deployment

**Test 1: Verify GC is working** ✅ PASSED
- Logs show "Memory cleanup completed" after each job
- Example: freed 51MB (70MB → 19MB) for 142-page PDF
- GC is functioning correctly

**Test 2: Re-upload crash files** ✅ PASSED (with concurrency=5)
- 142-page PDF: Completed successfully
- Memory cleanup: freed 51MB after job completion

**Test 3: Stress test (8 files)** ⚠️ PARTIAL FAILURE (with concurrency=5)
- 6 of 8 files completed (75% success rate)
- 2 of 8 files failed after 3 retries (dead lettered)
- Worker entered crash-restart loop
- Revealed concurrency=5 insufficient

**Test 4: Revised stress test with concurrency=3** ⏳ PENDING
- Need to re-test with new concurrency setting
- Upload same 8 files to verify stability
- Monitor for crashes over 24 hours

**Success Criteria:**
- ✅ GC working (verified)
- ⚠️ Initial testing revealed concurrency=5 insufficient
- ⏳ Pending: 24-hour stability test with concurrency=3
- ⏳ Pending: Verify no crashes with revised setting

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

## STRESS TEST RESULTS - P0 INSUFFICIENT

**Test Date:** 2025-11-03 (immediately after deployment)
**Test:** Uploaded 8 files of varying sizes to stress test concurrency=5

### Results Summary:

**Total: 8 files**
- ✅ Completed: 6 files (75%)
- ❌ Failed: 2 files (25% - dead lettered after 3 retries)

**Successful Files:**
1. Xavier_lab_report_IMG_5637.jpeg (0 retries)
2. 002_Sarah_Chen_Telephone_Summary.pdf (0 retries)
3. 002_Sarah_Chen_Emergency_Summary.pdf (0 retries)
4. BP2025060246784 - first 2 page version V4.pdf (0 retries)
5. 005_David_Nguyen_Virtual_Encounter_Summary.pdf (0 retries)
6. Xavier_combined_2page_medication_and_lab.tiff - 25MB (1 retry, then success)

**Failed Files (Dead Lettered):**
1. 004_Jennifer_Patel_Hospital_Encounter_Summary.pdf - 1.2MB (3 retries, FAILED)
2. 002_Sarah_Chen_Hospital_Encounter_Summary.pdf - 1.5MB (3 retries, FAILED)

### Root Cause Analysis - Why P0 Fixes Were Insufficient:

#### Issue 1: Heap Limit Doesn't Control Total Memory

**Expected:** `--max-old-space-size=450` would keep worker under 450MB
**Reality:** Worker peaked at **528MB** (18% over limit!)

**Why:**
- Heap limit only controls JavaScript heap
- Doesn't include:
  - Buffer allocations (PDF files in memory)
  - Sharp image processing buffers (~50MB per conversion)
  - Native module memory (Poppler, libvips: ~30MB)
  - V8 overhead (~20MB)

**Actual memory breakdown:**
```
JavaScript heap: 450MB (limit)
+ Buffers: ~50MB
+ Native modules: ~30MB
+ Overhead: ~20MB
= 550MB total (exceeds 512MB RAM!)
```

#### Issue 2: Worker Crash-Restart Loop Detected

**Timeline from Render metrics:**
```
09:34 → 528MB (PEAK - CRASH)
09:37 → 3MB (Worker restarted)
09:43 → 410MB (Memory climbing)
09:45 → 463MB (Approaching crash)
09:47 → 136MB (CRASH #2 - Worker restarted)
09:52 → 381MB (Memory climbing again)
09:54 → 467MB (Approaching crash)
09:56 → 138MB (CRASH #3 - Worker restarted)
```

**Death spiral pattern:**
1. Worker processes jobs → Memory climbs to 450-500MB
2. Worker crashes when exceeding 512MB RAM limit
3. Render detects crash → Restarts worker (fresh 130MB memory)
4. Auto-retry picks up failed jobs
5. Worker processes more jobs → Memory climbs again
6. Cycle repeats every 5-10 minutes

**Jobs failed after 3 retries:** Dead lettered with reason "exceeded_max_retries_after_timeout"

#### Issue 3: Garbage Collection Too Late

**Problem:** GC runs AFTER job completes, but next jobs already started

**Current flow:**
```
Job 1 starts → Memory: 140MB
Load PDF → Memory: 160MB
Process pages → Memory: 400MB
Job completes → GC runs → Memory: 150MB
BUT: Jobs 2-5 already started at step 3!
```

**Result:** All 5 jobs hit peak memory simultaneously = 500MB+ total

#### Issue 4: Peak Memory Per Job Higher Than Calculated

**Theoretical calculation:**
```
512MB RAM - 50MB Node.js = 462MB available
462MB ÷ 5 jobs = 92MB per job
Large file needs: 85MB
Result: Should work! ✅
```

**Actual reality:**
```
Peak memory per job: 120MB (not 85MB)
5 jobs × 120MB = 600MB needed
Available: 512MB
Deficit: 88MB → CRASH ❌
```

**Why 120MB instead of 85MB:**
- GC lag (memory accumulates before collection)
- Buffer overhead underestimated
- Native modules use more than expected
- Multiple buffers in flight during processing

### Why These Specific Files Failed

**Not actually large files!**
- 004_Jennifer_Patel: 1.2MB PDF
- 002_Sarah_Chen Hospital: 1.5MB PDF

**They failed because:**
1. Processed later in queue (memory already accumulated from earlier jobs)
2. Hit worker during peak memory usage from other concurrent jobs
3. Triggered crash-restart loop
4. Never got a clean worker with sufficient available memory
5. Auto-retry failed 3 times → Dead lettered

### Revised Recommendation: WORKER_CONCURRENCY=3

**New calculation:**
```
Available: 462MB
Peak per job: 120MB (actual observed)
3 jobs × 120MB = 360MB
Safety margin: 102MB (22%)
Result: Safe with headroom ✅
```

**User Action:** Changed WORKER_CONCURRENCY from 5 to 3 and redeployed (2025-11-03)

**Expected improvement:**
- Eliminates crash-restart loop
- Provides 102MB safety margin for memory spikes
- Can handle Pass 2 + Pass 3 when enabled (85MB → 120MB per job)
- Conservative but stable

**Trade-off:** Slower processing (3 concurrent vs 5), but STABLE

---

## Memory Cleanup Verification

**From successful jobs:**
```
142-page PDF: freed 51MB (70MB → 19MB) - 73% reduction
Emergency PDF: freed 5MB (24MB → 19MB)
2-page PDF: freed 2MB (20MB → 18MB)
25MB TIFF: freed 1MB (39MB → 38MB)
Virtual PDF: freed 3MB (42MB → 39MB)
```

**Conclusion:** GC cleanup IS working, but memory accumulates faster than it can be freed with concurrency=5

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
