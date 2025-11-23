# Rabbit Hunt Report - November 20, 2025
## Pass05 Strategy A v11 Pre-Production Bug Hunt

**Hunt Date:** November 20, 2025
**Hunter:** Claude (AI Assistant)
**Request:** "Find any other rabbits like this, as if there is one rabbit in the garden there are usually more"
**Method:** Systematic verification of all active pass05 code against database schema
**Status:** ✅ CORE FUNCTIONAL - HIGH PRIORITY IMPROVEMENTS NEEDED

---

## Executive Summary

**Total Rabbits Found:** 22 issues (ALL FIXED ✅)
**Files Affected:** 6 locations (`pending-reconciler.ts`, `database.ts`, `reconcile_pending_to_final` RPC, `chunk-processor.ts`, `session-manager.ts`, `index.ts`)
**Impact:** Core system fully operational - all audit trails and metrics complete
**Priority:** COMPLETE - All issues resolved via Migrations 58 & 59

**Production Test Status:** ✅ FULLY OPERATIONAL (Session: 1fe015a5-b7fa-4e07-83c6-966847ba855b)
- Document: 142 pages, 3 chunks
- Result: 1 final encounter created successfully from 3 pending encounters
- All Issues Fixed: ✅ Timestamps populated, ✅ Metrics complete, ✅ Tracking fields complete

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

## Rabbit #3: JSONB Field Access Pattern Mismatch (✅ FIXED)

**File:** `apps/render-worker/src/pass05/progressive/pending-reconciler.ts`
**Lines:** 93-99, 125, 250
**Status:** ✅ FIXED (Date TBD)
**Severity:** Was CRITICAL - Now resolved

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

## Rabbit #4: Missing Field in encounter_data JSONB (✅ FIXED)

**File:** `apps/render-worker/src/pass05/progressive/database.ts`
**Function:** `insertPendingEncounterV3`
**Lines:** 233-248
**Status:** ✅ FIXED (Date TBD)
**Severity:** Was CRITICAL - Now resolved

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

## Rabbit #5: RPC Column Name Mismatch (✅ FIXED)

**File:** Database RPC function `reconcile_pending_to_final`
**Status:** ✅ FIXED (Migration 53)
**Severity:** Was CRITICAL - Now resolved
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

## Rabbit #6: Unsafe Array Access in Batching Analysis (✅ FIXED)

**File:** `apps/render-worker/src/pass05/progressive/pending-reconciler.ts`
**Lines:** 524-527
**Status:** ✅ FIXED (Date TBD)
**Severity:** Was CRITICAL - Now resolved
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

---

## Rabbit #7: Rabbit reserved for future use

---

## Rabbit #8: JSONB Array to PostgreSQL Array Conversion (✅ FIXED)

**File:** Database RPC function `reconcile_pending_to_final` (Migration 54, then Migration 55)
**Status:** ✅ FIXED (Migrations 54 & 55 - 2025-11-20)
**Severity:** CRITICAL - Blocked all reconciliations
**Evidence:** Session a1775405-30ec-4e6e-9f3d-7834c1376cb8

### Issue
PostgreSQL cannot cast JSONB arrays directly to INTEGER[][] type. Two attempts were needed:

**First Attempt (Migration 54):** Changed `->` to `->>`
- Error: "malformed array literal: \"[[1, 100]]\""
- Root cause: `->>` gives JSON format text `"[[1,100]]"` but PostgreSQL expects `{{1,100}}`

**Second Attempt (Migration 55):** Used `jsonb_array_elements()` to properly convert
- Success: Converts JSONB arrays to PostgreSQL array format

### Fix Applied (Migration 55)
```sql
-- CORRECT: Properly convert JSONB array to INTEGER[][]
(SELECT ARRAY(
  SELECT ARRAY[(elem->0)::INTEGER, (elem->1)::INTEGER]
  FROM jsonb_array_elements(p_encounter_data->'page_ranges') AS elem
))
```

### Verification
- Tested with sample data: `{"page_ranges": [[1, 10], [20, 30]]}`
- Output: `{{1,10},{20,30}}` ✅

---

## Rabbit #9: Type Mismatch in Page Assignments Update (✅ FIXED)

**File:** Database RPC function `reconcile_pending_to_final` (Migration 56)
**Status:** ✅ FIXED (Migration 56 - 2025-11-20)
**Severity:** CRITICAL - Blocked page assignment updates
**Evidence:** Session b18955d5-f0fc-4710-bbfa-d6ea0eaace5c
**Error:** "operator does not exist: text = uuid"

### Issue
Line 176 tried to compare TEXT column with UUID[] array:
```sql
-- WRONG:
WHERE pending_id = ANY(p_pending_ids)
-- Compared: pass05_page_assignments.pending_id (TEXT) with p_pending_ids (UUID[])
```

### Fix Applied (Migration 56)
```sql
-- CORRECT: Use subquery to match TEXT pending_id with UUID[] p_pending_ids
UPDATE pass05_page_assignments
SET
  encounter_id = v_encounter_id,
  reconciled_at = NOW()
WHERE pending_id IN (
  SELECT pending_id
  FROM pass05_pending_encounters
  WHERE id = ANY(p_pending_ids)
);
```

---

## Rabbit #10: Cascade Inheritance Logic Ordering (✅ FIXED)

**File:** `apps/render-worker/src/pass05/progressive/chunk-processor.ts`
**Lines:** 418-440
**Status:** ✅ FIXED (Commit TBD - 2025-11-20)
**Severity:** HIGH - Created multiple encounters instead of one
**Evidence:** Session 0426b428-8e9d-4681-8b3a-3c2910714a9b (3 encounters created instead of 1)

### Issue
Code required BOTH `is_cascading` AND `continues_previous` for cascade_id inheritance:
```typescript
// WRONG:
if (enc.is_cascading) {
  if (enc.continues_previous && cascadeContexts.length > 0) {
    // Inherit cascade_id
```

But AI prompt says continuation that ENDS has `is_cascading: false`, so chunks 2-3 never inherited cascade_id.

### Fix Applied
```typescript
// CORRECT: Check continues_previous FIRST (regardless of is_cascading)
if (enc.continues_previous && cascadeContexts.length > 0) {
  // CONTINUATION: Inherit cascade_id from previous chunk
  const matchingCascade = cascadeContexts.find(ctx => ctx.encounter_type === enc.encounter_type);

  if (matchingCascade) {
    cascade_id = matchingCascade.cascade_id;
    console.log(`[Parse V11] Encounter ${index} continues cascade ${cascade_id} from previous chunk (is_cascading: ${enc.is_cascading})`);
  }
} else if (enc.is_cascading) {
  // NEW CASCADE: Generate new cascade_id starting in this chunk
  cascade_id = generateCascadeId(sessionId, chunkNumber, index, enc.encounter_type);
}
```

### Impact
- Before: Chunks 2-3 had `cascade_id: NULL`, reconciled separately → 3 final encounters
- After: All chunks share same cascade_id → 1 final encounter ✅

---

## Rabbit #11: Metrics Written Before Reconciliation (✅ FIXED)

**File:** `apps/render-worker/src/pass05/index.ts`
**Line:** ~157
**Status:** ✅ FIXED (Migration 58 - 2025-11-21)
**Severity:** Was HIGH - Dashboard showed 0 encounters despite successful processing
**Evidence:** Session 1fe015a5-b7fa-4e07-83c6-966847ba855b

### Issue
Metrics are written BEFORE reconciliation completes:
```typescript
// Line ~157 (WRONG):
await writeMetrics(encounters, ...);  // encounters.length = 0 in progressive mode
```

### Expected Values
- encounters_detected: 1 (not 0)
- real_world_encounters: 1 (not 0)
- pseudo_encounters: 0
- pendings_total: 3
- cascades_total: 1
- orphans_total: 0
- chunk_count: 3

### Fix Applied (Migration 58)
Extended `update_strategy_a_metrics` RPC to populate all 23 metric fields including token counts, costs, OCR confidence, and encounter counts. Metrics now correctly reflect final reconciliation results.

---

## Rabbit #12: Implicit Cascades Missing cascade_id (✅ FIXED)

**File:** `apps/render-worker/src/pass05/progressive/chunk-processor.ts`
**Lines:** 196-216
**Status:** ✅ FIXED (Commit TBD - 2025-11-20)
**Severity:** HIGH - Created 2 encounters instead of 1
**Evidence:** Session bab35449-0cff-4406-9ad2-5a35f3ade8d8

### Issue
Encounter ending at page 50 (chunk boundary) but AI said `is_cascading: false`. The `shouldCascade()` function correctly detected it, but cascade_id was only assigned during handoff building (after persistence).

Result: Chunk 1 had `cascade_id: NULL` in database, chunks 2-3 got "implicit_pending_xxx" cascade_id.

### Fix Applied
Assign cascade_id BEFORE persistence:
```typescript
// FIX: Assign cascade_ids to encounters that will cascade BEFORE persisting
pendings.forEach((pending, index) => {
  if (!pending.cascade_id && shouldCascade(
    {
      is_cascading: pending.is_cascading,
      end_boundary_type: pending.end_boundary_type,
      end_page: pending.end_page,
      encounter_type: pending.encounter_type
    },
    params.chunkNumber,
    params.totalChunks,
    params.pageRange[1]
  )) {
    // This encounter will cascade but doesn't have cascade_id yet
    pending.cascade_id = generateCascadeId(params.sessionId, params.chunkNumber, index, pending.encounter_type);
    console.log(`[Chunk ${params.chunkNumber}] Generated cascade_id for implicit cascade: ${pending.pending_id} → ${pending.cascade_id}`);
  }
});
```

---

## Rabbit #13: AI Prompt Ambiguity for Cascading Detection (✅ FIXED)

**File:** `apps/render-worker/src/pass05/aiPrompts.v11.ts`
**Lines:** 128-134
**Status:** ✅ FIXED (Commit TBD - 2025-11-20)
**Severity:** MEDIUM - AI not setting is_cascading correctly
**Evidence:** Chunk 1 had `is_cascading: false` despite ending at page 50 (chunk boundary)

### Issue
Prompt said "extends beyond current chunk" - ambiguous. AI interpreted as "goes PAST the last page", so encounter ending AT page 50 (not PAST it) → `is_cascading: false`.

### Fix Applied
Made prompt explicit and concrete:
```typescript
An encounter is **cascading** if it reaches or extends past the LAST page of this chunk:
- **This chunk contains pages ${pageRange[0]} to ${pageRange[1]}**
- **If encounter ends at page ${pageRange[1]} (last page) OR LATER → Set \`is_cascading: true\`**
- Set \`expected_continuation\`: What you expect in next chunk (e.g., "discharge_summary", "lab_results")
- Set \`cascade_context\`: Brief note about continuation state

**Why:** An encounter ending at the chunk's last page likely continues into the next chunk. Mark it as cascading so the system can link it with continuation data from the next chunk.
```

### Verification
Session 1fe015a5-b7fa-4e07-83c6-966847ba855b: Chunk 1 now correctly has `is_cascading: TRUE` ✅

---

## NEW RABBITS: Audit Trail and Metrics Tracking Gaps (🔴 UNFIXED)

**Discovery Date:** 2025-11-20 (Post-successful reconciliation analysis)
**Method:** Systematic NULL value analysis across all Strategy A tables
**Status:** 🔴 HIGH/MEDIUM PRIORITY - Incomplete tracking

### High Priority Audit Trail Issues

#### Rabbit #14: Missing reconciled_at Timestamp (Pending Encounters) - ✅ FIXED

**Table:** `pass05_pending_encounters`
**Column:** `reconciled_at`
**Status:** ✅ FIXED (Migration 58 - 2025-11-21)
**Impact:** Was HIGH - No audit trail of when pendings were reconciled

**Issue:**
Migration 56 reconciliation RPC updates `status` and `reconciled_to` but not `reconciled_at`:
```sql
-- CURRENT (INCOMPLETE):
UPDATE pass05_pending_encounters
SET
  status = 'completed',
  reconciled_to = v_encounter_id,
  updated_at = NOW()
WHERE id = v_pending_id;
```

**Fix Applied (Migration 58):**
```sql
-- ADDED:
reconciled_at = NOW()
```
RPC now sets timestamp when pendings are reconciled to final encounter.

---

#### Rabbit #15: Missing reconciled_from_pendings (Final Encounter) - ✅ FIXED

**Table:** `healthcare_encounters`
**Column:** `reconciled_from_pendings`
**Status:** ✅ FIXED (Migration 58 - 2025-11-21)
**Impact:** Was HIGH - Can't trace which pendings created which final encounter

**Issue:**
Reconciliation RPC receives `p_pending_ids UUID[]` but doesn't store them in final encounter.

**Fix Applied (Migration 58):**
Added to INSERT statement:
```sql
reconciled_from_pendings = p_pending_ids
```
Final encounter now stores array of pending IDs that created it.

---

#### Rabbit #16: Missing chunk_count (Final Encounter) - ✅ FIXED

**Table:** `healthcare_encounters`
**Column:** `chunk_count`
**Status:** ✅ FIXED (Migration 58 - 2025-11-21)
**Impact:** Was HIGH - Can't see how many chunks contributed to encounter

**Previous Value:** Showed 1, should be 3

**Fix Applied (Migration 58):**
Count distinct chunk_number from p_pending_ids:
```sql
chunk_count = (
  SELECT COUNT(DISTINCT chunk_number)
  FROM pass05_pending_encounters
  WHERE id = ANY(p_pending_ids)
)
```
Final encounter now accurately reflects number of chunks that contributed to it.

---

#### Rabbit #17: Missing Migration 49 Metrics - ✅ FIXED

**Table:** `pass05_encounter_metrics`
**Columns:** `pendings_total`, `cascades_total`, `orphans_total`, `chunk_count`, plus 16 additional metric fields
**Status:** ✅ FIXED (Migration 58 - 2025-11-21)
**Impact:** Was HIGH - Strategy A reconciliation metrics not tracked

**Previous Values:** All NULL

**Expected Values:**
- pendings_total: 3
- cascades_total: 1
- orphans_total: 0
- chunk_count: 3

**Fix Applied (Migration 58):**
Extended `update_strategy_a_metrics` RPC to populate all 23 metric fields after reconciliation completes, including token counts, costs, OCR confidence, processing time, and encounter statistics.

---

### Medium Priority Tracking Issues

#### Rabbit #18: Missing total_cascades (Session) - ✅ FIXED

**Table:** `pass05_progressive_sessions`
**Column:** `total_cascades`
**Status:** ✅ FIXED (Migration 59 - 2025-11-21)
**Impact:** Was MEDIUM - Session didn't show cascade count

**Previous Value:** 0, should be 1

**Fix Applied (Migration 59):**
Created `increment_session_total_cascades` RPC for atomic counter updates. chunk-processor.ts now calls this RPC when new cascade_id is assigned.

---

#### Rabbit #19: Missing reconciliation_completed_at (Session) - ✅ FIXED

**Table:** `pass05_progressive_sessions`
**Column:** `reconciliation_completed_at`
**Status:** ✅ FIXED (Migration 59 - 2025-11-21)
**Impact:** Was MEDIUM - No timestamp for when session reconciliation finished

**Previous Value:** NULL

**Fix Applied (Migration 59):**
TypeScript code updated in pending-reconciler.ts to set reconciliation_completed_at after reconciliation completes.

---

#### Rabbit #20: Missing started_at/completed_at (Chunk Results) - ✅ FIXED

**Table:** `pass05_chunk_results`
**Columns:** `started_at`, `completed_at`
**Status:** ✅ FIXED (Migration 59 - 2025-11-21)
**Impact:** Was MEDIUM - Can't analyze chunk timing patterns

**Previous Values:** NULL (despite processing_time_ms being populated)

**Fix Applied (Migration 59):**
TypeScript code updated in chunk-processor.ts to capture timestamps at chunk start and completion, then pass to database.ts `recordChunkResult()`.

---

#### Rabbit #21: Missing completed_at (Final Encounter) - ✅ FIXED

**Table:** `healthcare_encounters`
**Column:** `completed_at`
**Status:** ✅ FIXED (Migration 58 - 2025-11-21)
**Impact:** Was MEDIUM - No completion timestamp for encounters

**Previous Value:** NULL

**Design Question Resolved:** Encounter is "completed" at reconciliation time (when final encounter created from pendings).

**Fix Applied (Migration 58):**
RPC now sets `completed_at = NOW()` when creating final encounter from reconciled pendings.

---

#### Rabbit #22: cascade_id NULL in healthcare_encounters - ✅ FIXED

**Table:** `healthcare_encounters`
**Column:** `cascade_id`
**Status:** ✅ FIXED (Migration 58 - 2025-11-21)
**Impact:** Was MEDIUM - Can't directly query final encounter's source cascade

**Previous Value:** NULL

**Analysis:**
- Final encounter WAS created from cascade (cascade_id: "cascade_1_0_hospital_admission")
- But healthcare_encounters.cascade_id was NULL
- Previously required join: `SELECT cascade_id FROM pass05_pending_encounters WHERE reconciled_to = <encounter_id>`

**User Decision:** "If we can easily insert cascade_id into the healthcare_encounter column then lets."

**Fix Applied (Migration 58):**
Added to RPC INSERT statement:
```sql
cascade_id = (SELECT cascade_id FROM pass05_pending_encounters WHERE id = p_pending_ids[1])
```
Final encounter now stores cascade_id directly for easy querying.

---

## Updated Deployment Status

**CURRENT STATUS:** ✅ ALL RABBITS FIXED - SYSTEM FULLY OPERATIONAL

**Production Test Results (Session: 1fe015a5-b7fa-4e07-83c6-966847ba855b):**
- ✅ 142-page document processed successfully
- ✅ 3 chunks processed
- ✅ 3 pending encounters created
- ✅ 1 final encounter reconciled correctly
- ✅ All cascade logic working
- ✅ Audit trail timestamps fixed (Migration 58 & 59)
- ✅ Metrics fully populated (Migration 58)
- ✅ All tracking fields complete (Migration 58 & 59)

**Actions Completed:**
1. ✅ Fixed Rabbit #11 (metrics RPC extended - Migration 58)
2. ✅ Fixed Rabbit #14-#17 (audit trail gaps - Migration 58)
3. ✅ Fixed Rabbit #18-#21 (tracking gaps - Migration 59 + TypeScript updates)
4. ✅ Fixed Rabbit #22 (cascade_id now stored - Migration 58)
5. ✅ Tested with production documents
6. ✅ Deployed to Render.com

**Completion Date:** 2025-11-21 (Migrations 58 & 59 executed)

---

---

## NEW RABBITS: Post-Launch Bug Discovery (November 22, 2025)

**Discovery Date:** 2025-11-23
**Discovery Method:** Manual production testing with 3-page and 142-page files
**Hunter:** Xavier + Claude AI Assistant
**Status:** 🔴 UNFIXED - Multiple reconciliation bugs identified

---

### Rabbit #23: Page Separation Analysis Output Failure - 🔴 CRITICAL

**Component:** AI Prompt V11 `page_separation_analysis` output
**Status:** 🔴 UNFIXED - Feature completely non-functional
**Severity:** CRITICAL - Do NOT use this feature for any decisions
**Evidence:**
- 3-page file: Session be3bb1bb-f994-4dd2-9fb9-6fd931018df4
- 142-page file: Session 505886de-f967-45da-909a-e8bb393dc322

#### Issue

AI outputs "safe split points" that would break content continuity and orphan related content.

**3-Page File Analysis:**
```json
"page_separation_analysis": {
  "safe_split_points": [
    {"page": 2, "split_type": "inter_page", "confidence": 1.0},
    {"page": 3, "split_type": "inter_page", "confidence": 1.0}
  ]
}
```

**Actual PDF Content:**
- Page 1: Active Past History section **starts** (entries from 10/2016, 04/10/2016)
- Page 2: Active Past History **continues** (entries from 27/12/2020), then Immunisations section starts mid-page
- Page 3: Prescriptions section

**The Problem:**
- AI says "safe to split between pages 1-2" (page 2 split point)
- Reality: This would orphan the second half of Active Past History list. The items on Page 2 (e.g., "27/12/2020...") would be separated from the "Active Past History" header on Page 1.
- The list is semantically continuous - splitting it creates isolated no-context islands.

#### Root Cause Analysis (Investigation Findings)

Review of `aiPrompts.v11.ts` (Section 7) reveals the prompt logic is **too permissive** and lacks **negative constraints**.

1.  **Permissive "Safe" Criteria:** The prompt defines a safe split as: *"Mark as SAFE when content after split can be understood with just encounter context"*.
    *   *Why this fails:* The AI likely interprets a list item on Page 2 (e.g., "Diabetes Type 2") as "understandable" on its own. It fails to recognize that the *header* ("Active Past History") is a critical context anchor located on Page 1.

2.  **Missing Negative Constraints:** The prompt does *not* explicitly forbid splitting:
    *   Mid-sentence or mid-paragraph (implied but not enforced).
    *   **Mid-list:** This is the specific failure mode here.
    *   **Mid-table:** Likely a future failure mode.

3.  **Ambiguity Resolution:**
    *   The prompt *does* specify: *"For inter_page splits: Use the page number AFTER the split"*.
    *   Therefore, output `page: 2` correctly means "Start of Page 2" (Split 1|2). The AI isn't confused about the page number, it's confused about the *safety* of the split.

#### Required Fixes (Proposal for V12 Prompt)

To fix this, we must move from "Permissive Guidelines" to "Strict Rules" in Section 7 of the prompt.

**1. Add "Forbidden Split" Rules (Inter-Page Safety):**
> **NEVER mark a split point if:**
> - A sentence or paragraph continues from the previous page.
> - A **list or table** continues from the previous page (unless the new page repeats the header).
> - The content on the new page depends on a section header from the previous page to be understood.

**2. Enforce "Fresh Start" Criterion:**
> **A split is ONLY safe if the top of the new page starts with:**
> - A new Document Title (e.g., "DISCHARGE SUMMARY").
> - A new Section Header (e.g., "PLAN", "IMAGING RESULTS").
> - A clear Date Header (e.g., "Progress Note - 2024/05/12").

**3. Force Intra-Page Discovery (CRITICAL GAP):**
Current performance shows ZERO intra-page splits, which is statistically impossible for large files.
> **You MUST scan every page for mid-page transitions.**
> **Mark an intra-page split IMMEDIATELY BEFORE:**
> - A new Date Header starts mid-page.
> - A new Clinical Section Title appears mid-page.
> - A horizontal separator or "End of Report" footer is followed by new content.

**4. Clarify Output Schema:**
Rename `page` to `starts_at_page` or `split_before_page` in the JSON output to remove any human ambiguity during debugging.

**5. Prompt Tuning:**
Change the "Safe Split Criteria" to explicitly mention **"Semantic Continuity"**:
> *"Safe means the content is **semantically self-contained**. If Page 2 is a list of medications but the header 'Current Medications' is on Page 1, this is NOT A SAFE SPLIT."*

#### Impact
- **Current:** Feature output is stored in `pass05_chunk_results.page_separation_analysis`.
- **Action:** **DO NOT USE** this feature until the prompt is updated and validated against the "Active Past History" edge case.


---

### Rabbit #24: Date Format Architecture (DD/MM/YYYY vs MM/DD/YYYY) - 🔴 HIGH

**Component:** TypeScript `normalizeDateToISO()` function + date handling architecture
**Status:** 🔴 UNFIXED - Comprehensive fix designed, awaiting implementation
**Severity:** HIGH - Patient identity data loss for international date formats
**Full Documentation:** See `16-DATE-FORMAT-ARCHITECTURE.md` for complete analysis

#### Quick Summary

**The Problem:**
- JavaScript `new Date()` assumes MM/DD/YYYY for slash-separated dates
- Australian/international dates (DD/MM/YYYY) fail when day > 12
- Example: `"16/02/1959"` → tries month 16 → NaN → NULL in database

**Affected Fields:**
- `patient_date_of_birth` (currently broken for DD/MM/YYYY)
- `encounter_start_date` (not normalized, potential future failure)
- `encounter_end_date` (not normalized, potential future failure)

**Evidence:**
- Vincent Cheers (3-page): `"16/02/1959"` → NULL ❌
- Emma Thompson (142-page): `"11/14/1965"` → `"1965-11-14"` ✅

**Industry Research Complete:**
- Database schema already correct (TIMESTAMPTZ, DATE types align with ISO 8601)
- Best practice confirmed: Store ISO 8601, display in user locale
- Fix required in application layer only (no schema changes)

**Immediate Actions (Designed, Ready for Implementation):**
1. Replace `normalizeDateToISO()` with 115-line smart parser
2. Expand normalization to encounter dates
3. Test with both date formats
4. Deploy to Render.com worker

**Implementation Specification:**
- Complete function replacement code in `16-DATE-FORMAT-ARCHITECTURE.md`
- Test cases provided
- Testing strategy defined
- Future enhancements documented (user locale preferences)

---

### Rabbit #25: Missing Date Waterfall Hierarchy for Pseudo Encounters - 🔴 HIGH

**Component:** `pending-reconciler.ts`, `session-manager.ts`
**Status:** 🔴 UNFIXED - Never ported from Standard Mode to Strategy A
**Severity:** HIGH - Pseudo encounters have NULL dates instead of file metadata fallback
**Related:** Rabbit #24 (date normalization), Migration 42 (v2.9 date_source field)

#### Issue

The **date waterfall hierarchy** for pseudo encounters exists in legacy Standard Mode but was **never ported** to progressive Strategy A reconciler. Pseudo encounters without AI-extracted dates should fall back to file metadata, then upload date.

**Expected Behavior (v2.9 spec):**
```typescript
// For pseudo encounters (is_real_world_visit = false):
if (aiExtractedDate) {
  date_source = 'ai_extracted';
} else if (shell_files.created_at) {
  date_source = 'file_metadata';  // Use file creation timestamp
} else {
  date_source = 'upload_date';    // Last resort: current date
}
```

**Current Broken Behavior:**
```typescript
// pending-reconciler.ts:488
date_source: firstPending.encounter_data?.date_source || 'ai_extracted',
// Always defaults to 'ai_extracted' even when encounter_start_date is NULL!
```

#### Evidence

**Vincent Cheers 3-page Patient Health Summary:**
- Document type: Patient Health Summary (pseudo encounter, no specific visit date)
- AI extraction: `encounter_start_date: null` (correct - summary has no encounter date)
- **BUG:** Final encounter has `encounter_start_date: NULL` ❌
- **Expected:** Should use `shell_files.created_at` → `'2025-11-23'`
- **BUG:** `date_source: 'ai_extracted'` ❌
- **Expected:** `date_source: 'file_metadata'`

#### Root Cause

Standard Mode had this logic (`manifestBuilder.ts:245-258`) but it was never ported to progressive reconciler.

#### Suggested Fix

**Files to modify:**

1. **session-manager.ts:141** - Fetch file metadata and pass to reconciler:
```typescript
// Query shell_files.created_at before calling reconciler
const { data: shellFile } = await supabase
  .from('shell_files')
  .select('created_at')
  .eq('id', shellFileId)
  .single();

const fileCreatedAt = shellFile?.created_at ? new Date(shellFile.created_at) : null;

const finalEncounterIds = await reconcilePendingEncounters(
  session.id,
  shellFileId,
  patientId,
  totalPages,
  fileCreatedAt  // NEW PARAMETER
);
```

2. **pending-reconciler.ts:410** - Update function signature:
```typescript
export async function reconcilePendingEncounters(
  sessionId: string,
  shellFileId: string,
  patientId: string,
  totalPages: number,
  fileCreatedAt: Date | null  // NEW PARAMETER
): Promise<string[]>
```

3. **pending-reconciler.ts:478** - Add date waterfall logic AFTER date normalization:
```typescript
// Migration 64: Date waterfall hierarchy for pseudo encounters
let finalStartDate: string | null;
let finalEndDate: string | null;
let finalDateSource: 'ai_extracted' | 'file_metadata' | 'upload_date';

if (firstPending.is_real_world_visit) {
  // Branch A: Real-world encounters - use AI dates
  finalStartDate = startDateResult.isoDate;
  finalEndDate = endDateResult.isoDate;
  finalDateSource = 'ai_extracted';
} else {
  // Branch B: Pseudo encounters - waterfall fallback
  if (startDateResult.isoDate) {
    finalStartDate = startDateResult.isoDate;
    finalDateSource = 'ai_extracted';
  } else if (fileCreatedAt) {
    finalStartDate = fileCreatedAt.toISOString().split('T')[0];
    finalDateSource = 'file_metadata';
  } else {
    finalStartDate = new Date().toISOString().split('T')[0];
    finalDateSource = 'upload_date';
  }
  finalEndDate = finalStartDate;  // Pseudo: start = end
}
```

4. **pending-reconciler.ts:483** - Use waterfall results in encounterData:
```typescript
const encounterData = {
  encounter_type: firstPending.encounter_data?.encounter_type || 'unknown',
  encounter_start_date: finalStartDate,    // Migration 64
  encounter_end_date: finalEndDate,        // Migration 64
  encounter_timeframe_status: firstPending.is_real_world_visit
    ? (firstPending.encounter_data?.encounter_timeframe_status || 'completed')
    : 'completed',
  date_source: finalDateSource,  // Migration 64
  // ... rest
```

**Database Impact:** None - `date_source` column already exists with correct check constraint.

**Test Cases:**
- Pseudo encounter with NULL AI date → use file created_at
- Pseudo encounter with AI date → use AI date
- Real-world visit → always use AI date

**Reference:** Legacy implementation in `manifestBuilder.ts:245-258`, v2.9 spec `INTEGRATION_GUIDE_v2.9.md:150-164`

---

### Rabbit #26: Medical Identifiers Not Reconciled - 🔴 HIGH

**Tables:** `healthcare_encounter_identifiers`, `pass05_pending_encounter_identifiers`
**Status:** 🔴 UNFIXED
**Severity:** HIGH - MRN and medical identifiers completely lost during reconciliation
**Evidence:** Both identifier tables are **completely empty** despite MRNs present in source documents

#### Issue

Medical identifiers (MRN, patient IDs, etc.) are NOT being transferred from pending encounters to final encounters.

**3-Page File:**
- AI extracted: `medical_identifiers: [{"identifier_type": "MRN", "identifier_value": "MD", ...}]`
- Expected in `pass05_pending_encounter_identifiers`: 1 row (MRN: MD)
- **Actual:** 0 rows ❌

**142-Page File:**
- Document contains patient MRN/ID (user confirmed presence)
- Expected in `healthcare_encounter_identifiers`: At least 1 row
- **Actual:** 0 rows ❌

#### Database Verification

```sql
-- Check pending identifiers table
SELECT COUNT(*) FROM pass05_pending_encounter_identifiers;
-- Result: 0  ❌

-- Check final encounter identifiers table
SELECT COUNT(*) FROM healthcare_encounter_identifiers;
-- Result: 0  ❌
```

#### Root Cause Analysis

**Two possible failure points:**

**Failure Point 1: Chunk Processor → Pending Identifiers**
- AI outputs `medical_identifiers` array in response
- `chunk-processor.ts` parses AI response
- `database.ts` should insert into `pass05_pending_encounter_identifiers`
- **Hypothesis:** Identifiers never written to pending table

**Failure Point 2: Reconciliation RPC → Final Identifiers**
- `reconcile_pending_to_final` RPC should copy identifiers from pending → final
- **Hypothesis:** RPC doesn't transfer identifiers at all

#### Required Investigation

1. Check if AI is outputting `medical_identifiers` in response:
   ```sql
   SELECT ai_response_raw::json->'encounters'->0->'medical_identifiers'
   FROM pass05_chunk_results
   WHERE session_id = 'be3bb1bb-f994-4dd2-9fb9-6fd931018df4';
   ```

2. Check if `chunk-processor.ts` extracts medical_identifiers from AI response

3. Check if `database.ts` has function to insert into `pass05_pending_encounter_identifiers`

4. Check if `reconcile_pending_to_final` RPC copies identifiers to `healthcare_encounter_identifiers`

#### Expected Behavior

**For 3-page file:**
```sql
-- pass05_pending_encounter_identifiers
pending_id: <uuid>
identifier_type: "MRN"
identifier_value: "MD"
issuing_organization: NULL

-- After reconciliation → healthcare_encounter_identifiers
encounter_id: <final_encounter_uuid>
identifier_type: "MRN"
identifier_value: "MD"
issuing_organization: NULL
```

**For 142-page file:**
```sql
-- Should have MRN extracted from document
-- Should appear in both pending and final identifier tables
```

---

### Rabbit #26: Provider/Facility Names Missing in Final Encounter - 🔴 MEDIUM

**Table:** `healthcare_encounters`
**Status:** 🔴 PARTIALLY WORKING - 142p file works, 3p file doesn't
**Severity:** MEDIUM - Provider/facility data reconciliation inconsistent

#### Issue

Provider and facility names are reconciling inconsistently between files.

**3-Page File (Vincent Cheers):**
```sql
-- Pending encounter:
provider_name: NULL
facility_name: "South Coast Medical 2841 Pt Nepean Rd Blairgowrie 3942"

-- Final encounter:
provider_name: NULL  ✅ (No provider in source, expected NULL)
facility_name: "South Coast Medical 2841 Pt Nepean Rd Blairgowrie 3942"  ✅
```

**142-Page File (Emma Thompson):**
```sql
-- Pending encounters (3 pendings with different providers):
provider_name: "Patrick Callaghan, DO"
provider_name: "Douglas S Prechtel, DO"
provider_name: "Mark John HOSAK MD"

-- Final encounter:
provider_name: "Patrick Callaghan, DO"  ✅ (First pending's provider)
facility_name: "St. Luke's Hospital - Allentown Campus"  ✅
```

#### Analysis

**Provider Reconciliation Logic:**
The RPC appears to use **first pending's provider** when reconciling multiple pendings with different providers. This is reasonable, but should be documented.

**Potential Issue:**
If all 3 pending encounters are from the SAME hospital admission (cascade chain), they should all have the **same provider** ideally. The fact that they have different providers suggests:
1. AI extracted different attending physicians from different sections of the document
2. The "primary provider" logic needs to be smarter (e.g., pick the provider with most pages/confidence)

**Status:** This is working but may not be optimal. Not a bug per se, but worth reviewing the reconciliation strategy for multi-provider encounters.

---

### Rabbit #27: Patient Address Not Reconciled for 3-Page File - 🔴 MEDIUM

**Table:** `healthcare_encounters`
**Status:** 🔴 UNFIXED
**Severity:** MEDIUM - Address data loss for some files

#### Issue

Patient address reconciliation is inconsistent.

**3-Page File:**
```sql
-- Pending encounter:
patient_address: "PO Box 96 Mc Crae 3938"

-- Final encounter:
patient_address: "PO Box 96 Mc Crae 3938"  ✅ (Reconciled correctly)
```

**142-Page File:**
```sql
-- Pending encounters:
patient_address: NULL (Pending 1)
patient_address: NULL (Pending 2)
patient_address: "123 Collins Street Melbourne Melbourne , VIC 3000 USA" (Pending 3)

-- Final encounter:
patient_address: "123 Collins Street Melbourne Melbourne , VIC 3000 USA"  ✅
```

#### Analysis

Address reconciliation appears to work when present. The RPC likely uses:
- First non-NULL address from pending encounters
- If all NULL, final encounter gets NULL

**Status:** Working as designed, but worth noting that partial address data across pendings is reconciled correctly.

---

## Summary of New Rabbits (November 22, 2025)

| Rabbit | Component | Severity | Status | Impact |
|--------|-----------|----------|--------|--------|
| #23 | Page separation analysis | CRITICAL | 🔴 UNFIXED | Feature completely broken - do NOT use |
| #24 | DOB reconciliation (DD/MM/YYYY) | HIGH | 🔴 UNFIXED | Patient identity data loss for international dates |
| #25 | Medical identifiers not reconciled | HIGH | 🔴 UNFIXED | MRN/patient ID completely lost |
| #26 | Provider/facility reconciliation | MEDIUM | ⚠️ REVIEW | Works but may not be optimal for multi-provider |
| #27 | Patient address reconciliation | MEDIUM | ✅ WORKING | Correctly handles NULL/non-NULL addresses |

### Priority Fixes Needed

**Immediate (Before Pass 2 Development):**
1. **Rabbit #23:** Investigate and fix page separation analysis prompt/logic
2. **Rabbit #24:** Enhance DOB parser for international date formats
3. **Rabbit #25:** Fix medical identifiers pipeline (chunk processor → pending → final)

**Medium Priority:**
4. **Rabbit #26:** Review multi-provider reconciliation strategy
5. Extend date format fixes to ALL date fields in reconciler

---

**End of Rabbit Hunt Report**
