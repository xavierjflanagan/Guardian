# Rabbit Hunt Report - November 20, 2025
## Pass05 Strategy A v11 Pre-Production Bug Hunt

**Hunt Date:** November 20, 2025
**Hunter:** Claude (AI Assistant)
**Request:** "Find any other rabbits like this, as if there is one rabbit in the garden there are usually more"
**Method:** Systematic verification of all active pass05 code against database schema
**Status:** 🔴 CRITICAL ISSUES FOUND - DEPLOYMENT BLOCKED

---

## Executive Summary

**Total Rabbits Found:** 6 critical issues (2 fixed, 4 unfixed)
**Files Affected:** 3 locations (`pending-reconciler.ts`, `database.ts`, `reconcile_pending_to_final` RPC)
**Impact:** System failed production test - multiple cascade failures
**Priority:** PRODUCTION BLOCKER - System completely non-functional

**Production Test Status:** ❌ FAILED (Job: b70820df-b271-4da4-a809-d84acfdab232)
- Session: 644bfbd9-b781-4891-916a-d51caf12ceda
- Document: 3 pages, 1 chunk
- Failure Point: Reconciliation phase
- Errors: 2 runtime crashes

---

## Rabbit #1: Database Column Name Mismatch (FIXED ✅)

**File:** `apps/render-worker/src/pass05/progressive/database.ts`
**Lines:** 264, 272, 376, 384
**Status:** ✅ FIXED (Commit 29a5401)
**Severity:** CRITICAL

### Issue
Code wrote to non-existent column names:
```typescript
// WRONG:
start_text_marker: pending.start_text_marker,  // Column is 'start_marker'
end_text_marker: pending.end_text_marker,      // Column is 'end_marker'
```

### Fix Applied
```typescript
// CORRECT:
start_marker: pending.start_text_marker,  // Maps TS field to DB column
end_marker: pending.end_text_marker,      // Maps TS field to DB column
```

### Verification
- Database schema checked: Columns are `start_marker` and `end_marker`
- Fix applied in 4 locations (2 insert operations)
- Would have caused runtime error on first pending insert

---

## Rabbit #2: Non-existent Column Reference (FIXED ✅)

**File:** `apps/render-worker/src/pass05/progressive/session-manager.ts`
**Line:** 176
**Status:** ✅ FIXED (Commit 6c9441f)
**Severity:** CRITICAL

### Issue
Code tried to write to non-existent column:
```typescript
// WRONG:
.update({
  pass_0_5_completed: true,
  pass_0_5_progressive: true,  // ❌ Column doesn't exist
  pass_0_5_version: 'v11-strategy-a',
})
```

### Fix Applied
```typescript
// CORRECT:
.update({
  pass_0_5_completed: true,
  pass_0_5_version: 'v11-strategy-a',
  status: 'completed',
})
```

### Verification
- Database schema checked: No `pass_0_5_progressive` column exists
- Column unnecessary (all documents use progressive mode in Strategy A)
- Would have caused runtime error during shell_files update

---

## Rabbit #3: JSONB Field Access Pattern Mismatch (🔴 UNFIXED)

**File:** `apps/render-worker/src/pass05/progressive/pending-reconciler.ts`
**Lines:** 93-99, 125, 250
**Status:** 🔴 CRITICAL - REQUIRES FIX
**Severity:** BLOCKING

### Issue
Code accesses fields as top-level properties when they are stored in `encounter_data` JSONB column.

### Database Schema Analysis

**`pass05_pending_encounters` table structure:**

**Top-level columns (✅ can access directly):**
- `confidence`
- `encounter_start_date`
- `encounter_end_date`
- `facility_name`
- `is_real_world_visit`
- `provider_name`
- `patient_full_name`
- `patient_date_of_birth`

**In `encounter_data` JSONB (❌ must access via `.encounter_data`):**
- `encounter_type`
- `encounter_timeframe_status`
- `summary`
- `diagnoses`, `procedures`, `chief_complaint`, `department`, `provider_role`, `disposition`

### Affected Code Sections

#### Location 1: Lines 93-99 (Building final encounter data)
```typescript
// CURRENT (WRONG):
const encounterData = {
  encounter_type: firstPending.encounter_type,                    // ❌ Will be undefined
  encounter_start_date: firstPending.encounter_start_date,        // ✅ Correct (top-level)
  encounter_end_date: firstPending.encounter_end_date,            // ✅ Correct (top-level)
  encounter_timeframe_status: firstPending.encounter_timeframe_status,  // ❌ Will be undefined
  date_source: firstPending.date_source,                          // ❌ See Rabbit #4
  provider_name: firstPending.provider_name,                      // ✅ Correct (top-level)
  facility_name: firstPending.facility_name,                      // ✅ Correct (top-level)
  // ... position fields (all correct - top-level columns)
  summary: firstPending.summary,                                  // ❌ Will be undefined (line 125)
  is_real_world_visit: firstPending.is_real_world_visit,         // ✅ Correct (top-level)
};
```

#### Location 2: Line 250 (Validation logic)
```typescript
// CURRENT (WRONG):
const encounterTypes = new Set(pendings.map(p => p.encounter_type));  // ❌ Will be undefined
```

### Required Fix

#### Fix 1: Lines 93-99, 125
```typescript
// CORRECT:
const encounterData = {
  encounter_type: firstPending.encounter_data?.encounter_type || 'unknown',
  encounter_start_date: firstPending.encounter_start_date,
  encounter_end_date: firstPending.encounter_end_date,
  encounter_timeframe_status: firstPending.encounter_data?.encounter_timeframe_status || 'completed',
  date_source: firstPending.encounter_data?.date_source || 'ai_extracted',  // After Rabbit #4 fixed
  provider_name: firstPending.provider_name,
  facility_name: firstPending.facility_name,
  // ... position fields (unchanged)
  summary: firstPending.encounter_data?.summary || null,
  is_real_world_visit: firstPending.is_real_world_visit,
};
```

#### Fix 2: Line 250
```typescript
// CORRECT:
const encounterTypes = new Set(
  pendings.map(p => p.encounter_data?.encounter_type || 'unknown')
);
```

### Impact
- **Runtime:** NULL/undefined values passed to `reconcile_pending_to_final` RPC
- **Result:** Reconciliation will fail with constraint violations or create invalid encounters
- **Detection:** First test document will fail during reconciliation phase

---

## Rabbit #4: Missing Field in encounter_data JSONB (🔴 UNFIXED)

**File:** `apps/render-worker/src/pass05/progressive/database.ts`
**Function:** `insertPendingEncounterV3`
**Lines:** 233-248
**Status:** 🔴 CRITICAL - REQUIRES FIX
**Severity:** BLOCKING

### Issue
The field `date_source` is accessed by `pending-reconciler.ts` but never stored in `encounter_data` JSONB.

### Current Code (database.ts:233-248)
```typescript
// Build encounter_data jsonb from encounter core fields
const encounterData = {
  encounter_type: pending.encounter_type,
  encounter_timeframe_status: pending.encounter_timeframe_status,
  summary: pending.summary,
  confidence: pending.confidence,
  // Clinical fields (V11 additions)
  diagnoses: pending.diagnoses || [],
  procedures: pending.procedures || [],
  chief_complaint: pending.chief_complaint || null,
  department: pending.department || null,
  provider_role: pending.provider_role || null,
  disposition: pending.disposition || null,
  // ❌ date_source is MISSING!
};
```

### Required Fix
```typescript
// CORRECT:
const encounterData = {
  encounter_type: pending.encounter_type,
  encounter_timeframe_status: pending.encounter_timeframe_status,
  date_source: pending.date_source || 'ai_extracted',  // ✅ ADD THIS
  summary: pending.summary,
  confidence: pending.confidence,
  // Clinical fields (V11 additions)
  diagnoses: pending.diagnoses || [],
  procedures: pending.procedures || [],
  chief_complaint: pending.chief_complaint || null,
  department: pending.department || null,
  provider_role: pending.provider_role || null,
  disposition: pending.disposition || null,
};
```

### Verification
- `healthcare_encounters` table has `date_source` as top-level column ✅
- `pending-reconciler.ts` tries to access `firstPending.date_source` (line 97) ❌
- Value will be lost during pending creation, then NULL during reconciliation

### Impact
- **Data Loss:** `date_source` field lost during pending insertion
- **Result:** Final encounters will have NULL date_source (should be 'ai_extracted')
- **Compliance:** May violate data provenance tracking requirements

---

## Additional Finding: chunk-processor.ts Field Access (✅ VERIFIED SAFE)

**File:** `apps/render-worker/src/pass05/progressive/chunk-processor.ts`
**Lines:** 214-218, 258, 310-318
**Status:** ✅ NO ISSUE

### Analysis
Code accesses pending encounter fields as top-level properties:
```typescript
pending.facility_name
pending.provider_name
pending.encounter_type
pending.encounter_start_date
pending.summary
```

### Why This Is Safe
These are **in-memory TypeScript objects** created by `parseV11Response()` (lines 438-514), NOT database records. The `PendingEncounter` interface has all fields as top-level properties. When written to database, `database.ts` correctly maps fields to either top-level columns or `encounter_data` JSONB.

**Conclusion:** No fix required.

---

## Itemized To-Do List

### Priority 0: PRODUCTION FAILURES (Fix immediately)

- [ ] **TODO-0A:** Fix RPC column names in database (Rabbit #5) - **PRODUCTION BLOCKER**
  - [ ] Locate `reconcile_pending_to_final` RPC function in database
  - [ ] Change `start_text_marker` → `start_marker`
  - [ ] Change `end_text_marker` → `end_marker`
  - [ ] Test RPC with sample data
  - [ ] Verify no other RPC functions have same issue

- [ ] **TODO-0B:** Fix unsafe array access in pending-reconciler.ts (Rabbit #6) - **PRODUCTION BLOCKER**
  - [ ] Update lines 522-529 with null-safe access
  - [ ] Add `between_pages?.[0]` optional chaining
  - [ ] Add fallback values `?? a.page ?? 0`
  - [ ] Add empty array check before sort
  - [ ] Test with malformed split point data

### Priority 1: BLOCKING BUGS (Must fix before deployment)

- [ ] **TODO-1:** Fix `pending-reconciler.ts` JSONB access pattern (Rabbit #3)
  - [ ] Update line 93: `firstPending.encounter_data.encounter_type`
  - [ ] Update line 96: `firstPending.encounter_data.encounter_timeframe_status`
  - [ ] Update line 97: `firstPending.encounter_data.date_source` (after TODO-2)
  - [ ] Update line 125: `firstPending.encounter_data.summary`
  - [ ] Update line 250: `p.encounter_data.encounter_type` in map function
  - [ ] Add null-safe access with `?.` operator and fallback values
  - [ ] Test with actual database query to verify JSONB structure

- [ ] **TODO-2:** Add `date_source` to `encounter_data` JSONB in `database.ts` (Rabbit #4)
  - [ ] Update `insertPendingEncounterV3` function (line 233-248)
  - [ ] Add `date_source: pending.date_source || 'ai_extracted'` to encounterData object
  - [ ] Verify field exists in `PendingEncounter` TypeScript type
  - [ ] Test pending insertion writes date_source correctly

- [ ] **TODO-3:** Verify reconciliation RPC accepts encounter_data structure
  - [ ] Check `reconcile_pending_to_final` RPC function signature
  - [ ] Confirm it expects fields from encounter_data JSONB
  - [ ] Test reconciliation with sample data

- [ ] **TODO-4:** Add integration test for pending → final reconciliation
  - [ ] Create test pending with encounter_data JSONB
  - [ ] Call reconciliation function
  - [ ] Verify final encounter has all fields populated correctly
  - [ ] Verify date_source propagates to final encounter

### Priority 2: Post-Fix Verification

- [ ] **TODO-5:** Run full pass05 test on 10-page sample document
  - [ ] Verify chunk processing creates pendings correctly
  - [ ] Verify encounter_data JSONB has all expected fields
  - [ ] Verify reconciliation creates final encounters
  - [ ] Verify all fields match expected values

- [ ] **TODO-6:** Database schema documentation update
  - [ ] Document which fields are in encounter_data JSONB
  - [ ] Document which fields are top-level columns
  - [ ] Add comments to `insertPendingEncounterV3` explaining mapping
  - [ ] Update bridge schemas if needed

### Priority 3: Technical Debt Prevention

- [ ] **TODO-7:** Add TypeScript type safety for JSONB access
  - [ ] Create type for database pending record structure
  - [ ] Separate from in-memory `PendingEncounter` type
  - [ ] Use branded types to prevent mixing in-memory vs DB types

- [ ] **TODO-8:** Add database schema validation tests
  - [ ] Test all database operations against actual schema
  - [ ] Verify column names match code expectations
  - [ ] Catch schema drift issues early

---

## Files Verified Clean (No Issues Found)

✅ `apps/render-worker/src/pass05/encounterDiscovery.ts`
✅ `apps/render-worker/src/pass05/progressive/chunk-processor.ts`
✅ `apps/render-worker/src/pass05/progressive/cascade-manager.ts`
✅ `apps/render-worker/src/pass05/progressive/handoff-builder.ts`
✅ `apps/render-worker/src/pass05/providers/openai-provider.ts`
✅ `apps/render-worker/src/pass05/progressive/coordinate-extractor.ts`
✅ `apps/render-worker/src/pass05/progressive/identifier-extractor.ts`
✅ `apps/render-worker/src/pass05/progressive/post-processor.ts`
✅ `apps/render-worker/src/pass05/progressive/session-manager.ts` (after fix)
✅ `apps/render-worker/src/pass05/progressive/database.ts` (after marker fix, pending date_source fix)

---

## Verification Methodology

1. **Import Verification:** Checked all imports point to existing files with correct paths
2. **Database Schema Validation:** Queried actual database for column names and types
3. **RPC Function Verification:** Confirmed all RPC functions exist in database
4. **Field Access Pattern Analysis:** Compared code field access against database schema
5. **JSONB Structure Validation:** Verified JSONB column contents match code expectations

---

## Independent Review Confirmation

**Reviewer:** Second AI Assistant
**Review Date:** November 20, 2025
**Verdict:** AGREES with findings

### Review Highlights
- Confirmed database schema vs. access pattern mismatch
- Confirmed `encounter_data` JSONB structure
- Identified additional data loss issue with `date_source`
- Conclusion: "Requires immediate remediation before successful execution"

---

## Rabbit #5: RPC Column Name Mismatch (🔴 PRODUCTION FAILURE)

**File:** Database RPC function `reconcile_pending_to_final`
**Status:** 🔴 CRITICAL - CAUSING PRODUCTION FAILURES
**Severity:** BLOCKING
**Evidence:** Production logs from job b70820df-b271-4da4-a809-d84acfdab232

### Issue
RPC function tries to insert columns with wrong names into `healthcare_encounters` table:
```
"Error: Failed to reconcile pendings to final: column \"start_text_marker\" of relation \"healthcare_encounters\" does not exist"
```

### Root Cause
The RPC function `reconcile_pending_to_final` uses `start_text_marker` and `end_text_marker` column names, but the actual database columns are named `start_marker` and `end_marker`.

### Database Schema Verification
Checked `healthcare_encounters` table - confirmed columns are:
- `start_marker` (NOT start_text_marker)
- `end_marker` (NOT end_text_marker)

### Required Fix
Update the `reconcile_pending_to_final` RPC function to use correct column names:
```sql
-- WRONG (current):
INSERT INTO healthcare_encounters (
  ...
  start_text_marker,
  end_text_marker,
  ...
)

-- CORRECT:
INSERT INTO healthcare_encounters (
  ...
  start_marker,
  end_marker,
  ...
)
```

### Impact
- **Runtime:** All reconciliation attempts fail
- **Result:** No final encounters created, all documents fail processing
- **Detection:** First production test failed with this error

---

## Rabbit #6: Unsafe Array Access in Batching Analysis (🔴 PRODUCTION CRASH)

**File:** `apps/render-worker/src/pass05/progressive/pending-reconciler.ts`
**Lines:** 524-527
**Status:** 🔴 CRITICAL - CAUSING CRASHES
**Severity:** BLOCKING
**Evidence:** Production logs from session 644bfbd9-b781-4891-916a-d51caf12ceda

### Issue
Code assumes `inter_page` split points have `between_pages` array without null safety:
```typescript
// Line 522-529 (WRONG):
allSplitPoints.sort((a, b) => {
  const pageA = a.split_type === 'inter_page'
    ? a.between_pages[0]  // ❌ Crashes if between_pages is undefined
    : a.page;
  const pageB = b.split_type === 'inter_page'
    ? b.between_pages[0]  // ❌ Crashes if between_pages is undefined
    : b.page;
  return pageA - pageB;
});
```

### Error Message
```
"Cannot read properties of undefined (reading '0')"
```

### Root Cause
If `page_separation_analysis` from chunk results has malformed split points (missing `between_pages` for inter_page type), the sort function crashes.

### Required Fix
Add null-safe access with fallback:
```typescript
// CORRECT:
allSplitPoints.sort((a, b) => {
  const pageA = a.split_type === 'inter_page'
    ? (a.between_pages?.[0] ?? a.page ?? 0)
    : (a.page ?? 0);
  const pageB = b.split_type === 'inter_page'
    ? (b.between_pages?.[0] ?? b.page ?? 0)
    : (b.page ?? 0);
  return pageA - pageB;
});
```

### Additional Safety
Should also check if `allSplitPoints` is empty before sorting:
```typescript
// Add before sort:
if (allSplitPoints.length === 0) {
  console.log(`[Reconcile] No split points to aggregate`);
  return;
}
```

### Impact
- **Runtime:** Session crashes after reconciliation error
- **Result:** Progressive session marked as failed
- **Detection:** Second error in same production test

---

## Deployment Status

**CURRENT STATUS:** 🔴 BLOCKED - MULTIPLE PRODUCTION FAILURES

**Production Test Results (Job: b70820df-b271-4da4-a809-d84acfdab232):**
- ❌ Reconciliation failed: RPC column name mismatch (Rabbit #5)
- ❌ Session crashed: Unsafe array access (Rabbit #6)
- ❌ Would have failed: JSONB access pattern (Rabbit #3)
- ❌ Would have failed: Missing date_source (Rabbit #4)

**Required Actions:**
1. Fix Rabbit #5 (RPC column names in database)
2. Fix Rabbit #6 (null-safe array access)
3. Fix Rabbit #3 (pending-reconciler.ts JSONB access)
4. Fix Rabbit #4 (database.ts date_source field)
5. Test fixes with sample document
6. Re-deploy to Render.com
7. Run production test

**Estimated Fix Time:** 60-90 minutes
**Testing Time:** 15-30 minutes
**Total Time to Unblock:** 1.5-2 hours

---

## Lessons Learned

1. **Schema Documentation:** Need explicit documentation of JSONB column structure
2. **Type Safety:** TypeScript types should match database structure, not just in-memory structure
3. **Integration Testing:** Need tests that exercise full pipeline including database round-trips
4. **Systematic Verification:** "Rabbit hunting" approach caught issues that would have caused production failures

---

## Next Steps

1. Create Git branch: `fix/rabbit-hunt-2025-11-20`
2. Apply fixes for TODO-1 and TODO-2
3. Commit with descriptive message referencing this document
4. Test locally if possible
5. Deploy to Render.com
6. Run integration test
7. Document results in this file

---

**End of Rabbit Hunt Report**
