# Rabbit Hunt Report - November 20, 2025
## Pass05 Strategy A v11 Pre-Production Bug Hunt

**Hunt Date:** November 20, 2025
**Hunter:** Claude (AI Assistant)
**Request:** "Find any other rabbits like this, as if there is one rabbit in the garden there are usually more"
**Method:** Systematic verification of all active pass05 code against database schema
**Status:** ✅ CORE FUNCTIONAL - HIGH PRIORITY IMPROVEMENTS NEEDED

---

## Executive Summary

**Total Rabbits Found:** 13 issues (7 critical fixed, 6 high/medium priority unfixed)
**Files Affected:** 6 locations (`pending-reconciler.ts`, `database.ts`, `reconcile_pending_to_final` RPC, `chunk-processor.ts`, `session-manager.ts`, `index.ts`)
**Impact:** Core system functional - reconciliation working, but missing audit trails and metrics
**Priority:** HIGH PRIORITY - Audit trail and metrics tracking incomplete

**Production Test Status:** ✅ PASSING (Session: 1fe015a5-b7fa-4e07-83c6-966847ba855b)
- Document: 142 pages, 3 chunks
- Result: 1 final encounter created successfully from 3 pending encounters
- Remaining Issues: Missing timestamps, incomplete metrics, tracking gaps

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

## Rabbit #11: Metrics Written Before Reconciliation (🔴 UNFIXED)

**File:** `apps/render-worker/src/pass05/index.ts`
**Line:** ~157
**Status:** 🔴 HIGH PRIORITY - Metrics showing zeros
**Severity:** HIGH - Dashboard shows 0 encounters despite successful processing
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

### Required Fix
Update metrics AFTER reconciliation completes with final encounter counts.

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

#### Rabbit #14: Missing reconciled_at Timestamp (Pending Encounters)

**Table:** `pass05_pending_encounters`
**Column:** `reconciled_at`
**Status:** 🔴 HIGH PRIORITY
**Impact:** No audit trail of when pendings were reconciled

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

**Fix Required:**
```sql
-- ADD:
reconciled_at = NOW()
```

---

#### Rabbit #15: Missing reconciled_from_pendings (Final Encounter)

**Table:** `healthcare_encounters`
**Column:** `reconciled_from_pendings`
**Status:** 🔴 HIGH PRIORITY
**Impact:** Can't trace which pendings created which final encounter

**Issue:**
Reconciliation RPC receives `p_pending_ids UUID[]` but doesn't store them in final encounter.

**Fix Required:**
Add to INSERT statement:
```sql
reconciled_from_pendings = p_pending_ids
```

---

#### Rabbit #16: Missing chunk_count (Final Encounter)

**Table:** `healthcare_encounters`
**Column:** `chunk_count`
**Status:** 🔴 HIGH PRIORITY
**Impact:** Can't see how many chunks contributed to encounter

**Current Value:** Shows 1, should be 3

**Fix Required:**
Count distinct chunk_number from p_pending_ids:
```sql
chunk_count = (
  SELECT COUNT(DISTINCT chunk_number)
  FROM pass05_pending_encounters
  WHERE id = ANY(p_pending_ids)
)
```

---

#### Rabbit #17: Missing Migration 49 Metrics

**Table:** `pass05_encounter_metrics`
**Columns:** `pendings_total`, `cascades_total`, `orphans_total`, `chunk_count`
**Status:** 🔴 HIGH PRIORITY
**Impact:** Strategy A reconciliation metrics not tracked

**Current Values:** All NULL

**Expected Values:**
- pendings_total: 3
- cascades_total: 1
- orphans_total: 0
- chunk_count: 3

**Fix Required:**
Update metrics table after reconciliation completes.

---

### Medium Priority Tracking Issues

#### Rabbit #18: Missing total_cascades (Session)

**Table:** `pass05_progressive_sessions`
**Column:** `total_cascades`
**Status:** ⚠️ MEDIUM PRIORITY
**Impact:** Session doesn't show cascade count

**Current Value:** 0, should be 1

**Fix Required:**
Update session-manager.ts to increment when cascade_id assigned.

---

#### Rabbit #19: Missing reconciliation_completed_at (Session)

**Table:** `pass05_progressive_sessions`
**Column:** `reconciliation_completed_at`
**Status:** ⚠️ MEDIUM PRIORITY
**Impact:** No timestamp for when session reconciliation finished

**Current Value:** NULL

**Fix Required:**
Update pass05_progressive_sessions after reconciliation completes.

---

#### Rabbit #20: Missing started_at/completed_at (Chunk Results)

**Table:** `pass05_chunk_results`
**Columns:** `started_at`, `completed_at`
**Status:** ⚠️ MEDIUM PRIORITY
**Impact:** Can't analyze chunk timing patterns

**Current Values:** NULL (despite processing_time_ms being populated)

**Fix Required:**
Update database.ts `recordChunkResult()` to include timestamps.

---

#### Rabbit #21: Missing completed_at (Final Encounter)

**Table:** `healthcare_encounters`
**Column:** `completed_at`
**Status:** ⚠️ MEDIUM PRIORITY
**Impact:** No completion timestamp for encounters

**Current Value:** NULL

**Design Question:** When is an encounter "completed"?
- At reconciliation time (when final encounter created)?
- After downstream passes (Pass 1, Pass 2) extract data from it?

**Fix Required:** Define completion semantics, then implement timestamp.

---

#### Rabbit #22: cascade_id NULL in healthcare_encounters (Design Question)

**Table:** `healthcare_encounters`
**Column:** `cascade_id`
**Status:** ⚠️ DESIGN QUESTION
**Impact:** Can't directly query final encounter's source cascade

**Current Value:** NULL

**Analysis:**
- Final encounter WAS created from cascade (cascade_id: "cascade_1_0_hospital_admission")
- But healthcare_encounters.cascade_id is NULL
- Can be queried via: `SELECT cascade_id FROM pass05_pending_encounters WHERE reconciled_to = <encounter_id>`

**User Decision:** "If we can easily insert cascade_id into the healthcare_encounter column then lets. But if instead it can be served with sql queries then whats the point in adding it into every row."

**Recommendation:** Add it to RPC - it's a single line:
```sql
cascade_id = (SELECT cascade_id FROM pass05_pending_encounters WHERE id = p_pending_ids[1])
```

---

## Updated Deployment Status

**CURRENT STATUS:** ✅ CORE SYSTEM FUNCTIONAL - HIGH PRIORITY IMPROVEMENTS NEEDED

**Production Test Results (Session: 1fe015a5-b7fa-4e07-83c6-966847ba855b):**
- ✅ 142-page document processed successfully
- ✅ 3 chunks processed
- ✅ 3 pending encounters created
- ✅ 1 final encounter reconciled correctly
- ✅ All cascade logic working
- ⚠️ Missing audit trail timestamps
- ⚠️ Metrics showing zeros
- ⚠️ Incomplete tracking fields

**Required Actions:**
1. Fix Rabbit #11 (metrics written before reconciliation)
2. Fix Rabbit #14-#17 (high priority audit trail gaps) - Migration 57
3. Fix Rabbit #18-#21 (medium priority tracking gaps) - Code updates
4. Review Rabbit #22 (cascade_id design question) - User decision required
5. Test fixes with sample document
6. Deploy to Render.com

**Estimated Fix Time:** 2-3 hours
**Testing Time:** 30 minutes
**Total Time to Complete:** 2.5-3.5 hours

---

**End of Rabbit Hunt Report**
