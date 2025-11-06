# Memory Baseline Investigation - 430MB Idle Issue

**Date:** 2025-11-06
**Investigator:** Claude Code
**Status:** Investigation Complete - Awaiting Review
**Priority:** CRITICAL - Blocking production uploads

---

## Problem Statement

Render.com worker is crashing with OOM (Out of Memory) errors despite having P0 memory fixes deployed (Nov 3rd):
- ✅ Garbage collection enabled (`--expose-gc`)
- ✅ Heap limit set (`--max-old-space-size=450`)
- ✅ WORKER_CONCURRENCY=3 configured

**Symptom:** Worker baseline idle memory is **430MB** (84% of 512MB limit), leaving only **82MB** for job processing.

**Result:** Any job processing pushes memory from 430MB → 520MB+, exceeding 512MB limit → Render kills process → "worker_timeout" errors.

---

## Investigation Findings

### 1. Memory Metrics from Render.com (Instance: wqnvc)

```
Memory Timeline (2025-11-06):
01:42  137MB   Worker started
01:43  426MB   Job processing started (83% of limit)
01:44  434MB   Steady state (85%)
02:23  451MB   Peak before crash (88%)
02:30  521MB   EXCEEDED 512MB LIMIT ← OOM Kill
02:31  445MB   Worker recovered/restarted
```

**Baseline idle memory: 430MB (should be ~150MB)**

---

### 2. Dependency Analysis

#### Node Modules Disk Usage:
```bash
16MB    @img (Sharp + libvips)
10MB    @babel
9.1MB   @esbuild
8.6MB   @typescript-eslint
4.1MB   caniuse-lite
4.1MB   @supabase
3.3MB   @types
2.9MB   handlebars
1.3MB   uglify-js
1.1MB   ajv
```

#### Current Build Command (Render.com):
```bash
pnpm install --frozen-lockfile
```

**ISSUE:** Missing `--prod` flag = installs devDependencies in production!

---

### 3. Runtime Imports (Loaded at Startup)

#### From `worker.ts`:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';  // ~20-30MB
import express from 'express';                                         // ~10-15MB
import { Pass1EntityDetector } from './pass1';                         // ~20-30MB
import { runPass05 } from './pass05';                                  // ~15-20MB
import { preprocessForOCR } from './utils/format-processor';           // Loads Sharp!
```

#### From `format-processor/index.ts` (Line 22):
```typescript
import sharp from 'sharp';  // TOP-LEVEL IMPORT = ~50-80MB at startup
```

**ISSUE:** Sharp is eagerly loaded even when no jobs are running. It includes:
- libvips native C++ bindings
- Image processing codecs
- Color space libraries

#### Sharp is also imported in:
- `format-processor/pdf-processor.ts:9`
- `format-processor/tiff-processor.ts` (not verified but likely)
- `utils/image-processing.ts` (not verified but likely)

---

### 4. Memory Budget Breakdown (Estimated)

```
ACTUAL (Observed):
Total idle memory: 430MB

THEORETICAL (Expected):
Node.js base:       50MB
Supabase client:    25MB
OpenAI SDK:         20MB
Express server:     12MB
Pass1/Pass05:       25MB
Sharp (eager):      60MB
DevDependencies:    50MB (Jest, TypeScript, ESLint, Babel)
Buffers/overhead:   50MB
───────────────────────
TOTAL:             292MB

MISSING: 138MB unaccounted for!
```

**Conclusion:** The 430MB baseline suggests heavy libraries are being loaded eagerly + devDependencies deployed to production.

---

## Root Causes Identified

### Root Cause 1: DevDependencies Deployed to Production (HIGH IMPACT)

**Evidence:**
- Build command: `pnpm install --frozen-lockfile` (no `--prod` flag)
- DevDependencies include: Jest, TypeScript, ESLint, Babel, ts-jest, @typescript-eslint/*
- These are NEVER used in production runtime

**Memory Impact:** ~50MB runtime memory
**Fix Complexity:** LOW (1-line config change)
**Risk:** NONE (devDependencies not needed at runtime)

---

### Root Cause 2: Sharp Loaded Eagerly (HIGH IMPACT)

**Evidence:**
- Line 22 of `format-processor/index.ts`: `import sharp from 'sharp';` (top-level)
- Sharp loaded at worker startup, not when first job runs
- Includes libvips (native C++ library) + all image codecs

**Memory Impact:** ~60MB runtime memory
**Fix Complexity:** MEDIUM (require code changes + testing)
**Risk:** MEDIUM (async imports can introduce bugs if not tested)

---

### Root Cause 3: WORKER_CONCURRENCY Default Too High

**Evidence:**
- Line 42 of `worker.ts`: `maxConcurrentJobs: parseInt(process.env.WORKER_CONCURRENCY || '50')`
- Default is 50, but Render env var set to 3
- If env var missing/misconfigured, falls back to 50

**Memory Impact:** Indirect (affects job processing, not baseline)
**Fix Complexity:** LOW (change default value)
**Risk:** LOW

---

## Proposed Solutions

### Solution 1: Fix Build Command (CRITICAL - ~50MB savings)

**Change Render.com build command from:**
```bash
pnpm install --frozen-lockfile
```

**To:**
```bash
pnpm install --frozen-lockfile --prod
```

**Pros:**
- Immediate ~50MB memory savings
- Zero code changes required
- Zero runtime impact (devDependencies never used)
- Standard production best practice
- Can deploy in < 5 minutes

**Cons:**
- None identified

**Risk Level:** NONE
**Estimated Savings:** 50MB
**Implementation Time:** 5 minutes
**Recommendation:** ✅ IMPLEMENT IMMEDIATELY

---

### Solution 2: Lazy Load Sharp (~60MB savings)

**Convert Sharp from eager to lazy import:**

**Current (Eager):**
```typescript
// format-processor/index.ts:22
import sharp from 'sharp';  // Loads at startup

// Later in code:
const metadata = await sharp(buffer).metadata();
```

**Proposed (Lazy):**
```typescript
// format-processor/index.ts:22
// import sharp from 'sharp';  // Removed

// Add lazy loader:
let sharpInstance: typeof import('sharp') | null = null;
async function getSharp() {
  if (!sharpInstance) {
    sharpInstance = (await import('sharp')).default;
  }
  return sharpInstance;
}

// Later in code:
const sharp = await getSharp();  // Loads on first use
const metadata = await sharp(buffer).metadata();
```

**Files Requiring Changes:**
1. `format-processor/index.ts` (3 usages)
2. `format-processor/pdf-processor.ts` (2 usages)
3. `format-processor/tiff-processor.ts` (unknown count - needs verification)
4. `utils/image-processing.ts` (unknown count - needs verification)

**Pros:**
- ~60MB memory savings at idle
- Sharp only loaded when first image processed
- No impact on worker startup time
- Standard pattern for heavy dependencies

**Cons:**
- Requires code changes in 4+ files
- Slightly more complex code (async import)
- Needs thorough testing (async can introduce timing bugs)
- First job that uses Sharp will be ~100ms slower (one-time import cost)

**Risk Level:** MEDIUM
**Estimated Savings:** 60MB
**Implementation Time:** 30-60 minutes (coding + testing)
**Recommendation:** ⚠️ CONSIDER AFTER SOLUTION 1

---

### Solution 3: Fix WORKER_CONCURRENCY Default

**Change default from 50 → 3:**

**Current:**
```typescript
// worker.ts:42
maxConcurrentJobs: parseInt(process.env.WORKER_CONCURRENCY || '50')
```

**Proposed:**
```typescript
// worker.ts:42
maxConcurrentJobs: parseInt(process.env.WORKER_CONCURRENCY || '3')
```

**Pros:**
- Safety net if env var misconfigured
- Aligns with current production setting (3)
- One-line change

**Cons:**
- Doesn't save baseline memory
- Only helps if env var fails to load (rare)

**Risk Level:** NONE
**Estimated Savings:** 0MB (baseline), prevents issues if env var missing
**Implementation Time:** 2 minutes
**Recommendation:** ✅ IMPLEMENT (Low-hanging fruit)

---

### Solution 4: Upgrade Render Plan (ALTERNATIVE)

**Upgrade from Starter → Standard:**
- Current: 512MB RAM ($7/month)
- Upgraded: 2GB RAM ($25/month)

**Pros:**
- 4x memory (2GB vs 512MB)
- Immediate fix (no code changes)
- Allows higher concurrency (3 → 10+ jobs)
- Future-proof for Pass 2/3 implementation

**Cons:**
- $18/month extra cost ($216/year)
- Doesn't solve root cause (still wastes memory)
- Not addressing the technical debt

**Risk Level:** NONE
**Cost:** $18/month extra
**Implementation Time:** 5 minutes (dashboard change)
**Recommendation:** ⚠️ FALLBACK if Solutions 1-3 insufficient

---

## Recommended Implementation Plan

### Phase 1: Immediate Fixes (Today - 10 minutes)

**Priority 1A:** Fix build command
- Update Render.com: `pnpm install --frozen-lockfile --prod`
- Expected savings: 50MB
- Redeploy worker
- Monitor baseline memory (should drop to ~380MB)

**Priority 1B:** Fix WORKER_CONCURRENCY default
- Change default from 50 → 3 in worker.ts
- Deploy with 1A
- Safety net against env var failures

**Expected Result After Phase 1:**
```
Current baseline: 430MB (84% of 512MB)
After Phase 1:    ~380MB (74% of 512MB)
Available for jobs: 132MB (vs 82MB currently)
Improvement: 60% more headroom ✅
```

---

### Phase 2: Optional Optimizations (This Week - 1 hour)

**Priority 2A:** Lazy load Sharp (if Phase 1 insufficient)
- Implement lazy loading pattern
- Test with all file types (PDF, TIFF, JPEG, HEIC)
- Expected savings: 60MB
- New baseline: ~320MB (62% of 512MB)

**Expected Result After Phase 2:**
```
After Phase 2:    ~320MB (62% of 512MB)
Available for jobs: 192MB (vs 82MB currently)
Improvement: 134% more headroom ✅
```

---

### Phase 3: Monitoring (Ongoing)

**After each phase:**
1. Check Render.com metrics for baseline memory
2. Upload test file (21MB TIFF)
3. Monitor peak memory during processing
4. Verify no OOM crashes
5. Check job success rate

**Success Criteria:**
- ✅ Baseline idle memory < 350MB (68% of 512MB)
- ✅ Peak memory during job < 500MB (97% of 512MB)
- ✅ No OOM crashes over 24 hours
- ✅ All test uploads complete successfully

---

## Questions for Discussion

1. **Should we implement Phase 1 immediately?** (10 min effort, 50MB savings, zero risk)

2. **Should we implement Phase 2 (lazy Sharp)?** (1 hour effort, 60MB savings, medium risk)

3. **If Phase 1+2 insufficient, upgrade to Standard plan?** ($18/month, 4x memory, zero risk)

4. **Any concerns about the lazy loading pattern for Sharp?**

5. **Should we investigate the missing 138MB** before making changes? (Could be other heavy libraries)

---

## Open Questions / Further Investigation

1. **What accounts for the missing 138MB?**
   - Current theory: Multiple instances of heavy libraries
   - Could investigate with heap snapshot tool
   - Lower priority if Phase 1+2 solve the problem

2. **Are there other eagerly-loaded heavy dependencies?**
   - OpenAI SDK: Could it be lazy loaded?
   - Supabase client: Used immediately, can't lazy load
   - Poppler: Used by pdf-processor, already lazy via import chain

3. **Should we add memory monitoring at startup?**
   - Log memory usage after each major import
   - Helps identify heavy dependencies
   - Can add to next iteration

---

## Next Steps

**Awaiting User Decision:**
- [ ] Review investigation findings
- [ ] Approve Phase 1 implementation (build command + default concurrency)
- [ ] Decide on Phase 2 (lazy Sharp loading)
- [ ] Decide on fallback (upgrade to Standard plan if needed)

**After Approval:**
1. Update Render.com build command
2. Update worker.ts default concurrency
3. Deploy to production
4. Monitor memory metrics
5. Run test uploads
6. Report results

---

**Status:** Ready for review and decision
**Created:** 2025-11-06
**Last Updated:** 2025-11-06
