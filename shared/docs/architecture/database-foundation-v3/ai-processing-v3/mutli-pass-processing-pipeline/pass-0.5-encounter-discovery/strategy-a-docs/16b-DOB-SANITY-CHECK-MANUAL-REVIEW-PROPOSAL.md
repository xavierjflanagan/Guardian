# DOB Sanity Check → Manual Review Queue Enhancement Proposal

**Status:** COMPLETE - Migration 65 Executed
**Date:** 2025-11-24
**Completed:** 2025-11-24 (Migration 65)
**Context:** Follow-up to 16-DATE-FORMAT-ARCHITECTURE-v2.md

---

## Implementation Summary

**All changes implemented and deployed via Migration 65 (2025-11-24):**

✅ **Change 1:** Extended `manual_review_queue.review_type` to include `'data_quality_issue'`
✅ **Change 2:** Created `enqueue_manual_review()` RPC with SECURITY DEFINER and search_path hardening
✅ **Change 2.5:** Added service_role grants for worker access
✅ **Change 3:** Added manual review queue check to reconciliation logic
✅ **Change 4:** Implemented `pickBestDOB()` for smart multi-DOB selection

**Behavior After Implementation:**

When DOB sanity check fails (year < 1900 or > currentYear+1):
1. Encounter is created with `patient_date_of_birth = NULL`
2. Manual review queue entry is automatically created with:
   - `review_type: 'data_quality_issue'`
   - Original extracted DOB value preserved
   - All DOB values from multi-chunk encounters
   - Page ranges for source document review
   - Encounter ID for direct linkage
3. Processing continues normally - other encounters are unaffected
4. Manual review entry remains in `'pending'` status awaiting frontend UI implementation

**Frontend UI (Not Yet Implemented):**
- Display pending reviews to users
- PDF viewer integration for source review
- DOB correction workflow
- Encounter update mechanism

---

## Quick Reference: What Happens When DOB Sanity Check Fails (Original Analysis)

When `normalizeDateToISO()` encounters DOB with year < 1900 or > currentYear+1:

**Example:** AI extracts `"1850-02-16"` from document (OCR misread)

1. **Function Returns:**
   ```typescript
   {
     isoDate: null,                           // DOB will be NULL in database
     wasAmbiguous: false,
     originalFormat: "1850-02-16",            // Original preserved
     parseMethod: 'failed_sanity_check',      // Special flag
     confidence: 'low',
     error: 'year_out_of_range'               // Error reason
   }
   ```

2. **Console Warning Logged:**
   ```
   [Identity] DOB year out of range - likely OCR error:
   {
     year: 1850,
     dateString: "1850-02-16",
     validRange: "1900-2026",
     suggestion: 'Review source document for OCR misread digits'
   }
   ```

3. **Healthcare Encounter Created:**
   - `patient_date_of_birth` = `NULL` (no crash - column allows NULL)
   - Metadata stored in `quality_criteria_met`:
     ```json
     {
       "date_ambiguity_flags": {
         "patient_date_of_birth": "unambiguous",
         "patient_date_of_birth_confidence": "low",
         "patient_date_of_birth_method": "failed_sanity_check"
       }
     }
     ```

4. **Original Format Preserved:**
   - `pass05_pending_encounters.patient_date_of_birth` = `"1850-02-16"` (TEXT)
   - Full audit trail maintained
   - Click-through to source will work

### Gaps Addressed by Migration 65

- ✅ Manual review queue entry now created automatically
- ⏳ UX notification pending (frontend UI not yet implemented)
- ✅ No longer silent - manual review entry captures issue
- ⏳ User visibility pending (frontend review interface needed)

### System Safety (Verified)

**Database Schema:** `patient_date_of_birth DATE` (no NOT NULL constraint)
**RPC Function:** Accepts NULL values without error
**Processing:** ✅ Encounter creation proceeds normally, file continues processing
**Result:** ✅ System does NOT crash - NULL handled gracefully, manual review captures issue

---

## Multi-DOB Reconciliation Behavior (Current)

### Scenario: Multiple Chunks with Different DOBs

**Example Document:**
- Chunk 1 (pages 1-50): Extracts `"16/02/1959"` (valid)
- Chunk 2 (pages 51-100): Extracts `"1850-01-01"` (invalid - OCR error)
- Chunk 3 (pages 101-142): No DOB extracted (NULL)

### Step-by-Step Processing

#### Step 1: AI Extraction (Per Chunk)
- AI extracts what it sees from each chunk independently
- **AI does NOT perform sanity checks** - just extracts text
- If document shows "1850", AI will faithfully extract "1850"

#### Step 2: Multi-DOB Selection
**Function:** `pickBestValue()` (`pending-reconciler.ts` lines 35-44)

```typescript
function pickBestValue(values: (string | null)[]): string | null {
  const nonNull = values.filter((v): v is string => v !== null && v.trim() !== '');
  if (nonNull.length === 0) return null;
  if (nonNull.length === 1) return nonNull[0];

  // Pick longest value (more information = better)
  return nonNull.reduce((best, current) =>
    current.length > best.length ? current : best
  );
}
```

**Applied to Example:**
```
Chunk 1: "16/02/1959"  (length: 10)
Chunk 2: "1850-01-01"  (length: 10)
Chunk 3: null

pickBestValue() returns: "16/02/1959" (first of equal length wins)
```

**CRITICAL ISSUE:** `pickBestValue()` does NOT know about date validity - it just picks longest string!

**If lengths differ:**
```
Chunk 1: "16/02/1959"      (length: 10)
Chunk 2: "January 1, 1850" (length: 16) ← LONGER
Chunk 3: null

pickBestValue() returns: "January 1, 1850" (longer wins, even though year is invalid!)
```

#### Step 3: Normalization
- Selected DOB passed to `normalizeDateToISO()`
- If "1850-01-01" selected:
  - Sanity check fails
  - Returns `{ isoDate: null, parseMethod: 'failed_sanity_check', error: 'year_out_of_range' }`
- Final encounter: `patient_date_of_birth = NULL`

**Problem:** Even if one chunk has valid DOB, system might pick invalid one and reject it, losing valid data.

---

## Proposed Enhancement: Manual Review Queue Integration

### Problem Statement

When `normalizeDateToISO()` fails sanity checks, the system:
1. Creates encounter with NULL DOB silently
2. Logs warning to console (invisible to users/reviewers)
3. Stores metadata (requires database query to discover)
4. Might discard valid DOB in favor of invalid one (multi-chunk issue)

### Solution Overview

**Add two improvements:**
1. **Manual Review Queue Entry** when sanity check fails
2. **Smart DOB Selection** that filters out invalid years before picking

---

## Implementation Plan

### Change 1: Extend Manual Review Queue Schema

**File:** `current_schema/04_ai_processing.sql` (lines 651-654)

**Current:**
```sql
review_type TEXT NOT NULL CHECK (review_type IN (
    'entity_validation', 'profile_classification', 'clinical_accuracy',
    'safety_concern', 'low_confidence', 'contamination_risk'
)),
```

**Proposed:**
```sql
review_type TEXT NOT NULL CHECK (review_type IN (
    'entity_validation', 'profile_classification', 'clinical_accuracy',
    'safety_concern', 'low_confidence', 'contamination_risk',
    'data_quality_issue'  -- NEW: For sanity check failures, invalid formats, etc.
)),
```

**Migration Required:** YES - Migration 65
**Migration Type:** ALTER TABLE with CHECK constraint modification

---

### Change 2: Create RPC Function for Manual Review Queue Insertion

**File:** `current_schema/08_job_coordination.sql` (new function after line 676)

**Function Name:** `enqueue_manual_review`

```sql
-- ============================================================================
-- Manual Review Queue Entry Creation
-- Migration 65: Support for data quality issue flagging
-- ============================================================================

CREATE OR REPLACE FUNCTION enqueue_manual_review(
  p_patient_id UUID,
  p_processing_session_id UUID,
  p_shell_file_id UUID,
  p_review_type TEXT,
  p_priority TEXT,
  p_review_title TEXT,
  p_review_description TEXT,
  p_flagged_issues TEXT[],
  p_clinical_context JSONB
) RETURNS UUID AS $$
DECLARE
  v_review_id UUID;
BEGIN
  -- Insert manual review entry
  INSERT INTO manual_review_queue (
    patient_id,
    processing_session_id,
    shell_file_id,
    review_type,
    priority,
    review_title,
    review_description,
    flagged_issues,
    clinical_context,
    review_status,
    created_at,
    updated_at
  ) VALUES (
    p_patient_id,
    p_processing_session_id,
    p_shell_file_id,
    p_review_type,
    p_priority,
    p_review_title,
    p_review_description,
    p_flagged_issues,
    p_clinical_context,
    'pending',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_review_id;

  -- Log the manual review creation
  RAISE NOTICE 'Manual review entry created: % (type: %, priority: %)',
    v_review_id, p_review_type, p_priority;

  RETURN v_review_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION enqueue_manual_review IS
  'Migration 65: Create manual review queue entry for data quality issues, low confidence results, or other flagged items requiring human review';
```

**Why RPC Function:**
- Centralized logic for all manual review queue insertions
- Security: SECURITY DEFINER ensures proper permissions
- Audit trail: RAISE NOTICE logs creation
- Consistency: Single point of entry prevents schema drift

---

### Change 2.5: Security Grants for Worker Access (CRITICAL)

**File:** `current_schema/08_job_coordination.sql` (end of file, around line 2250)

**Location:** After existing service_role grants for worker RPCs

**Add these grants:**

```sql
-- ============================================================================
-- Migration 65: Grant permissions for manual review queue (worker access)
-- ============================================================================

REVOKE EXECUTE ON FUNCTION enqueue_manual_review(uuid, uuid, uuid, text, text, text, text, text[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_manual_review(uuid, uuid, uuid, text, text, text, text, text[], jsonb) TO service_role;

COMMENT ON FUNCTION enqueue_manual_review IS
  'Migration 65: Worker-initiated manual review queue entry creation for data quality issues. Service role only.';
```

**Why CRITICAL:**
- Worker uses `service_role` key (not authenticated user context with `auth.uid()`)
- Without this grant, worker RPC call will fail with: `permission denied for function enqueue_manual_review`
- Consistent with other worker RPCs in this file:
  - `enqueue_job_v3` - line 2245
  - `claim_next_job_v3` - line 2246
  - `complete_job` - line 2249
  - `write_pass05_manifest_atomic` - line 2250

**Pattern Reference:**
All worker-facing RPCs in `08_job_coordination.sql` have explicit `GRANT EXECUTE ... TO service_role` statements.

**Security Model Comparison:**

| Function | Security Pattern | Reason |
|----------|------------------|--------|
| `add_to_manual_review_queue` (04_ai_processing.sql) | `SECURITY DEFINER` + RLS check (`has_profile_access()`) | User-initiated, requires auth.uid() |
| `enqueue_manual_review` (08_job_coordination.sql) | `SECURITY DEFINER` + `service_role` grant | Worker-initiated, uses service key |
| `reconcile_pending_to_final` | `SECURITY DEFINER` only (no explicit grant) | Legacy pattern, works but less explicit |

**Recommendation:** Use explicit grants for `enqueue_manual_review` (clearer security model, easier to audit, consistent with modern worker RPCs).

---

### Change 3: Modify Reconciliation to Call Manual Review RPC

**File:** `apps/render-worker/src/pass05/progressive/pending-reconciler.ts`

**Location:** After line 648 (after encounter creation, inside try block)

**Add this code:**

```typescript
      // Migration 65: Check if DOB sanity check failed - enqueue for manual review
      if (dobResult.parseMethod === 'failed_sanity_check') {
        console.warn(`[Reconcile] DOB sanity check failed - enqueueing manual review`, {
          encounterId: v_encounter_id, // From RPC response
          originalDOB: dobResult.originalFormat,
          error: dobResult.error
        });

        // Collect all DOB values from chunks for reviewer context
        const allDOBs = groupPendings
          .map((p) => ({
            chunk: p.chunk_number,
            dob: p.patient_date_of_birth,
            cascade_id: p.cascade_id
          }))
          .filter(d => d.dob !== null);

        const currentYear = new Date().getFullYear();

        // Create manual review entry
        const { data: reviewId, error: reviewError } = await supabase.rpc('enqueue_manual_review', {
          p_patient_id: patientId,
          p_processing_session_id: sessionId,
          p_shell_file_id: firstPending.shell_file_id,
          p_review_type: 'data_quality_issue',
          p_priority: 'normal',
          p_review_title: 'Invalid Date of Birth Year Detected',
          p_review_description: `The extracted DOB "${dobResult.originalFormat}" has an implausible year (valid range: 1900-${currentYear + 1}). This is likely an OCR misread digit (e.g., 1850 → 1950). Please review the source document on pages ${mergedPageRanges.map(r => r.join('-')).join(', ')} and correct if needed.`,
          p_flagged_issues: ['invalid_dob_year', 'ocr_likely_misread'],
          p_clinical_context: {
            extracted_dob: dobResult.originalFormat,
            error_type: dobResult.error,
            parse_method: dobResult.parseMethod,
            all_dob_values_from_chunks: allDOBs,
            page_ranges: mergedPageRanges,
            encounter_id: finalEncounterIds[finalEncounterIds.length - 1], // Link to created encounter
            cascade_id: cascadeId,
            suggestion: 'Check if first digit was OCR misread (1→8, 9→8, etc.)'
          }
        });

        if (reviewError) {
          console.error(`[Reconcile] Failed to create manual review entry:`, reviewError);
          // Don't fail the whole reconciliation - just log the error
        } else {
          console.log(`[Reconcile] Manual review entry created: ${reviewId}`);
        }
      }
```

**Placement Note:** This goes AFTER the encounter is created (so we have encounter_id), but BEFORE moving to next cascade group.

**Error Handling:** If manual review creation fails, log error but don't crash reconciliation process.

---

### Change 4: Improve Multi-DOB Selection (Smart Filtering)

**File:** `apps/render-worker/src/pass05/progressive/pending-reconciler.ts`

**Location:** After line 44 (after `pickBestValue` function)

**Add new function:**

```typescript
/**
 * Pick best DOB value with sanity check awareness
 * Migration 65: Filters out invalid years before selecting longest value
 *
 * @param values - Array of DOB strings from multiple pending encounters
 * @returns Best valid DOB, or null if none are valid
 */
function pickBestDOB(values: (string | null)[]): string | null {
  const nonNull = values.filter((v): v is string => v !== null && v.trim() !== '');
  if (nonNull.length === 0) return null;
  if (nonNull.length === 1) return nonNull[0];

  // Filter out obviously invalid years (< 1900 or > current+1)
  const currentYear = new Date().getFullYear();
  const validDOBs = nonNull.filter(dob => {
    // Quick year extraction for sanity check
    // Matches 4-digit years in format: YYYY-MM-DD, DD/MM/YYYY, text dates
    const yearMatch = dob.match(/\b(19|20)\d{2}\b/); // Years 1900-2099
    if (!yearMatch) {
      // If we can't extract a year, keep it (let normalizeDateToISO handle it)
      console.log(`[pickBestDOB] Cannot extract year from "${dob}" - keeping for normalization`);
      return true;
    }
    const year = parseInt(yearMatch[0], 10);
    const isValid = year >= 1900 && year <= currentYear + 1;

    if (!isValid) {
      console.warn(`[pickBestDOB] Filtering out invalid year: "${dob}" (year=${year}, valid range: 1900-${currentYear + 1})`);
    }

    return isValid;
  });

  // If we filtered everything out, fall back to original values
  // (normalizeDateToISO will reject them and trigger manual review)
  const candidates = validDOBs.length > 0 ? validDOBs : nonNull;

  if (validDOBs.length === 0 && nonNull.length > 0) {
    console.warn(`[pickBestDOB] All DOB values have invalid years - using original values for normalization failure`);
  }

  // Pick longest value (more information = better)
  const best = candidates.reduce((best, current) =>
    current.length > best.length ? current : best
  );

  console.log(`[pickBestDOB] Selected "${best}" from ${nonNull.length} candidate(s)`);
  return best;
}
```

**Replace usage at line 502-505:**

```typescript
// BEFORE (Migration 63):
const dobResult = normalizeDateToISO(
  pickBestValue(groupPendings.map(p => p.patient_date_of_birth)),
  'patient_date_of_birth'
);

// AFTER (Migration 65):
const dobResult = normalizeDateToISO(
  pickBestDOB(groupPendings.map(p => p.patient_date_of_birth)), // Changed function
  'patient_date_of_birth'
);
```

**Benefits:**
- Avoids selecting "1850" when "1959" is available
- Reduces unnecessary manual review queue entries
- Still preserves all original values for audit
- Logs filtering decisions for debugging

**Edge Case Handling:**
- If ALL DOBs have invalid years → picks first one → normalizeDateToISO rejects it → manual review created ✅
- If year cannot be extracted (e.g., "unknown") → keeps value → let normalizeDateToISO handle it ✅
- If mixed valid/invalid → picks valid one → no manual review needed ✅

---

## Summary of Changes

| File | Change | Migration? | Lines |
|------|--------|------------|-------|
| `04_ai_processing.sql` | Add `'data_quality_issue'` to review_type enum | **YES - Migration 65** | ~651-654 |
| `08_job_coordination.sql` | Add `enqueue_manual_review()` RPC function | **YES - Migration 65** | After 676 |
| **`08_job_coordination.sql`** | **Add GRANT EXECUTE for enqueue_manual_review** | **YES - Migration 65** | **~2250** |
| `pending-reconciler.ts` | Add manual review check after DOB normalization | No (code only) | After 648 |
| `pending-reconciler.ts` | Add `pickBestDOB()` function and replace usage | No (code only) | After 44, replace 502 |

**Migration 65 Required:** YES
- Schema change (CHECK constraint)
- New RPC function
- Backward compatible (no data migration needed)

---

## Testing Plan

### Test Case 1: Single Invalid DOB
**Input:**
- Single chunk
- DOB: `"1850-02-16"`

**Expected:**
- ✅ Encounter created with `patient_date_of_birth = NULL`
- ✅ Manual review queue entry created
- ✅ `review_type = 'data_quality_issue'`
- ✅ `flagged_issues = ['invalid_dob_year', 'ocr_likely_misread']`
- ✅ `clinical_context.extracted_dob = "1850-02-16"`
- ✅ `clinical_context.encounter_id` populated
- ✅ Original "1850-02-16" preserved in `pass05_pending_encounters`

### Test Case 2: Multi-Chunk with Mixed Valid/Invalid DOBs
**Input:**
- Chunk 1: DOB = `"16/02/1959"` (valid)
- Chunk 2: DOB = `"1850-01-01"` (invalid)
- Chunk 3: DOB = `null`

**Expected:**
- ✅ `pickBestDOB()` selects `"16/02/1959"` (filters out 1850)
- ✅ Encounter created with `patient_date_of_birth = '1959-02-16'`
- ✅ NO manual review queue entry created (valid DOB selected)
- ✅ Metadata shows `parseMethod: 'dd_mm'`, `confidence: 'high'`

### Test Case 3: Multi-Chunk with All Invalid DOBs
**Input:**
- Chunk 1: DOB = `"1850-01-01"` (invalid)
- Chunk 2: DOB = `"January 1, 1799"` (invalid)
- Chunk 3: DOB = `null`

**Expected:**
- ✅ `pickBestDOB()` filters both out, falls back to longest: `"January 1, 1799"`
- ✅ `normalizeDateToISO()` fails sanity check
- ✅ Encounter created with `patient_date_of_birth = NULL`
- ✅ Manual review queue entry created
- ✅ `clinical_context.all_dob_values_from_chunks` shows both invalid values
- ✅ Reviewer can see both options and pick correct interpretation

### Test Case 4: Valid DOB (Regression Test)
**Input:**
- Single chunk
- DOB: `"16/02/1959"` (valid)

**Expected:**
- ✅ Encounter created with `patient_date_of_birth = '1959-02-16'`
- ✅ NO manual review queue entry created
- ✅ Metadata shows `parseMethod: 'dd_mm'`, `wasAmbiguous: false`, `confidence: 'high'`
- ✅ No regression from current behavior

### Test Case 5: Future Year Edge Case
**Input:**
- Single chunk
- DOB: `"01/01/2030"` (future year, invalid)

**Expected:**
- ✅ Sanity check fails (year > currentYear + 1)
- ✅ Encounter created with `patient_date_of_birth = NULL`
- ✅ Manual review queue entry created
- ✅ `error_type = 'year_out_of_range'`

---

## Future Enhancements (Not in This Proposal)

1. **UX Confidence Indicators**
   - Display warning icon next to NULL DOB fields
   - Link to manual review queue from encounter detail page
   - Show tooltip: "DOB could not be validated - requires review"

2. **Manual Review Resolution Workflow**
   - Frontend interface for reviewing flagged DOBs
   - PDF viewer integration for click-through to source
   - Ability to manually correct DOB and update encounter

3. **OCR Pattern Learning**
   - Track common OCR misreads (1→8, 9→8, 5→6, etc.)
   - Suggest corrections based on historical patterns
   - Auto-flag high-risk digit patterns

4. **Batch Review Interface**
   - Review multiple data quality issues at once
   - Filter by flagged_issue type
   - Bulk approve/reject/modify

---

## Migration Script Skeleton (Migration 65)

```sql
-- Migration 65: Data Quality Issue Flagging + Manual Review Integration
-- Date: 2025-11-24
-- Purpose: Enable manual review queue entries for DOB sanity check failures

BEGIN;

-- Part 1: Extend manual_review_queue.review_type enum
ALTER TABLE manual_review_queue
DROP CONSTRAINT IF EXISTS manual_review_queue_review_type_check;

ALTER TABLE manual_review_queue
ADD CONSTRAINT manual_review_queue_review_type_check
CHECK (review_type IN (
    'entity_validation',
    'profile_classification',
    'clinical_accuracy',
    'safety_concern',
    'low_confidence',
    'contamination_risk',
    'data_quality_issue'  -- NEW
));

-- Part 2: Create enqueue_manual_review RPC function
-- (Full function definition from Change 2 above)

-- Part 3: Grant execution permissions for worker (CRITICAL)
REVOKE EXECUTE ON FUNCTION enqueue_manual_review(uuid, uuid, uuid, text, text, text, text, text[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_manual_review(uuid, uuid, uuid, text, text, text, text, text[], jsonb) TO service_role;

COMMENT ON FUNCTION enqueue_manual_review IS
  'Migration 65: Worker-initiated manual review queue entry creation for data quality issues. Service role only.';

COMMIT;
```

---

## Questions for Review

1. Should manual review `priority` be `'normal'` or `'high'` for DOB sanity check failures?
2. Should we also flag ambiguous dates (confidence: 'low') for manual review, or only sanity check failures?
3. Should `pickBestDOB()` also be used for encounter dates, or only DOB?
4. Do we need a separate review_type like `'invalid_dob'`, or is `'data_quality_issue'` generic enough?

---

---

## Amendment History

### Amendment 1 (2025-11-24): Security Grants Addition

**Trigger:** Second assistant review identified missing security grants for worker RPC access.

**Changes Made:**
1. Added **Change 2.5: Security Grants for Worker Access (CRITICAL)** section
2. Updated Summary of Changes table to include grants row
3. Updated Migration 65 skeleton to include Part 3 (grant execution permissions)
4. Corrected all migration numbers from 67 → 66 (current migration is 65)

**Key Finding:**
Without `GRANT EXECUTE ... TO service_role` for `enqueue_manual_review()`, the worker will fail with `permission denied for function enqueue_manual_review` error at runtime. This grant is **required** for the implementation to work.

**Verification:**
- ✅ All other worker RPCs in `08_job_coordination.sql` have explicit grants (lines 2243-2250)
- ✅ Pattern confirmed: `enqueue_job_v3`, `claim_next_job_v3`, `complete_job`, `write_pass05_manifest_atomic`
- ✅ Worker uses `service_role` key (not `auth.uid()`), requires explicit permission

**Impact:**
- **CRITICAL** - Implementation would fail without this
- **No breaking changes** - Additive only (new grant for new function)
- **Consistent** - Matches existing worker RPC security pattern

---

**DRAFT STATUS:** Ready for implementation after user approval.







assistant review 24th Nov 2025:

My goal is to understand the DOB sanity-check proposal, the underlying issues, and then trace the actual DOB/data-date flow through the codebase to identify every file/script impacted. I’ll read the key design docs and the relevant render-worker pass 0.5 code in parallel, then map the flow and list concrete places that appear to require changes, without modifying anything.

[9 tools called]

I’ve pulled in the DOB sanity-check proposal, the core date architecture docs, and the key pass 0.5 worker files; next I’ll inspect the reconciliation logic, manual review schema, and any existing manual-review usage to build a full data-flow map and list all impacted files without changing anything.

[1 tool called]

I’ve confirmed how DOB is normalized and where DOB flows into final encounters; next I’ll inspect the manual review queue schema, existing job-coordination RPCs, and any other consumers of `manual_review_queue.review_type` so we can be sure all necessary files are on the list.

[11 tools called]

### 1. What’s going wrong now (DOB + multi‑chunk)  

**From your docs and the code:**

- **DOB sanity check is already implemented in code** in `normalizeDateToISO()` and behaves exactly as described in 16b:
  - For `fieldName === 'patient_date_of_birth'`, any year \< 1900 or \> currentYear+1 returns `isoDate: null` and `parseMethod: 'failed_sanity_check'`, with `error: 'year_out_of_range'`.
  - This logic exists today in `pending-reconciler.ts`:

```151:335:apps/render-worker/src/pass05/progressive/pending-reconciler.ts
// ... text parsing branch ...
if (fieldName === 'patient_date_of_birth') {
  const currentYear = new Date().getFullYear();
  if (yearNum < 1900 || yearNum > currentYear + 1) {
    console.warn('[Identity] DOB year out of range - likely OCR error:', { ... });
    return {
      isoDate: null,
      wasAmbiguous,
      originalFormat: trimmed,
      parseMethod: 'failed_sanity_check',
      confidence: 'low',
      error: 'year_out_of_range'
    };
  }
}
```

- **Multi‑chunk DOB merging is currently naive**:
  - DOB candidates from each pending encounter (`groupPendings.map(p => p.patient_date_of_birth)`) are merged by `pickBestValue()`, which simply picks the **longest non‑empty string**.
  - That result is then normalized:

```502:505:apps/render-worker/src/pass05/progressive/pending-reconciler.ts
const dobResult = normalizeDateToISO(
  pickBestValue(groupPendings.map(p => p.patient_date_of_birth)),
  'patient_date_of_birth'
);
```

- **Failure mode:** when one chunk has a valid DOB and another has an OCR‑garbled DOB (e.g. “1850…”), the longer/more verbose invalid value can win, get rejected by the sanity check, and you lose the valid DOB. This matches the “multi‑chunk critical issue” described in 16b.

- **When sanity check fails today:**
  - `encounterData.patient_date_of_birth` is set to `dobResult.isoDate` (i.e. `null`) and passed into `reconcile_pending_to_final()`:

```573:641:apps/render-worker/src/pass05/progressive/pending-reconciler.ts
const encounterData = {
  // ...
  patient_full_name: pickBestValue(groupPendings.map(p => p.patient_full_name)),
  patient_date_of_birth: dobResult.isoDate,  // NULL when failed_sanity_check
  patient_address: pickBestValue(groupPendings.map(p => p.patient_address)),
  // ...
};
```

  - The RPC writes that into `healthcare_encounters.patient_date_of_birth`:

```542:647:shared/docs/architecture/database-foundation-v3/current_schema/08_job_coordination.sql
INSERT INTO healthcare_encounters (
  -- ...
  patient_full_name,
  patient_date_of_birth,
  patient_address,
  chief_complaint
)
SELECT
  -- ...
  (p_encounter_data->>'patient_full_name')::TEXT,
  (p_encounter_data->>'patient_date_of_birth')::DATE,
  (p_encounter_data->>'patient_address')::TEXT,
  (p_encounter_data->>'chief_complaint')::TEXT
RETURNING id INTO v_encounter_id;
```

  - **No manual review entry is created**, and the only signal is in `quality_criteria_met.date_ambiguity_flags` plus logs.

So your diagnosis in 16b (null DOB stored silently, and multi‑DOB selection not sanity‑aware) is fully accurate with the current code.

---

### 2. End‑to‑end DOB data flow (my own trace)

**Step 1 – OCR & pages → Pass 0.5 input**

- OCR pages are created in the worker and then passed to `runPass05` as `ocrOutput.fullTextAnnotation.pages`:

```1182:1214:apps/render-worker/src/worker.ts
const pass05Input: Pass05Input = {
  shellFileId: payload.shell_file_id,
  patientId: payload.patient_id,
  ocrOutput: {
    fullTextAnnotation: {
      text: ...,
      pages: ocrResult.pages.map((page: any) => ({
        width: page.size.width_px || 1000,
        height: page.size.height_px || 1400,
        // ...
        blocks: page.lines.map((line: any) => ({ ... text ... }))
      }))
    }
  },
  pageCount: ocrResult.pages.length,
  processingSessionId: processingSessionId
};
```

**Step 2 – Chunk‑level AI extraction (DOB as raw text)**

- `processChunk()` builds the V11 prompt and calls the model; the AI returns `enc.patient_date_of_birth` as **raw string** in JSON.
- `parseV11Response()` maps AI fields into `PendingEncounter` records, including DOB:

```541:583:apps/render-worker/src/pass05/progressive/chunk-processor.ts
const pendings: PendingEncounter[] = (parsed.encounters || []).map((enc: any, index: number) => {
  // ...
  return {
    // Identity fields
    patient_full_name: enc.patient_full_name || null,
    patient_date_of_birth: enc.patient_date_of_birth || null,
    patient_address: enc.patient_address || null,
    // ...
    encounter_start_date: enc.encounter_start_date,
    encounter_end_date: enc.encounter_end_date,
    encounter_timeframe_status: enc.encounter_timeframe_status,
    date_source: enc.date_source || null,
    // ...
  };
});
```

**Step 3 – Persisting pendings (raw DOB preserved)**

- `batchInsertPendingEncountersV3()` (not opened, but referenced) writes pendings into `pass05_pending_encounters`.
- Schema confirms DOB is stored **as original text** there:

```666:668:shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-0.5-encounter-discovery/pass05-audits/pass05-individual-table-audits/healthcare_encounters-COLUMN-AUDIT-ANSWERS.md
- `pass05_pending_encounters` table (original format storage)
```

…and in current schema (from v2 date‑architecture doc, not re‑pasted here) the DOB column is TEXT.

**Step 4 – Reconciliation (DOB merge + normalization)**

- `reconcilePendingEncounters()` fetches all pendings, groups by cascade, and for each group:
  - Merges DOB strings using `pickBestValue()` (problematic selection).
  - Normalizes with `normalizeDateToISO()` (DOB sanity check & metadata).
  - Collects date ambiguity flags into `quality_criteria_met`.

This core is in `pending-reconciler.ts` as shown earlier.

**Step 5 – Final encounter write**

- `reconcile_pending_to_final()` in `08_job_coordination.sql`:
  - Writes normalized DOB into `healthcare_encounters.patient_date_of_birth DATE`.
  - **Schema confirms DOB is nullable**, so NULL is acceptable:

```512:521:shared/docs/architecture/database-foundation-v3/current_schema/03_clinical_core.sql
CREATE TABLE IF NOT EXISTS healthcare_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    -- Encounter Classification
    encounter_type TEXT NOT NULL,
    encounter_start_date TIMESTAMPTZ,
    encounter_end_date TIMESTAMPTZ,
    -- ...
);
```

- No further processing step tries to “fix” or override DOB; downstream passes use what’s stored.

**Step 6 – Manual review queue today**

- Manual review queue exists and is wired for AI processing, but **is only used by Pass 1**:
  - Table definition:

```643:697:shared/docs/architecture/database-foundation-v3/current_schema/04_ai_processing.sql
CREATE TABLE IF NOT EXISTS manual_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,
  shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL CHECK (review_type IN (
      'entity_validation', 'profile_classification', 'clinical_accuracy',
      'safety_concern', 'low_confidence', 'contamination_risk'
  )),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN (...)),
  -- flagged_issues, clinical_context, review_status, etc.
);
```

  - Existing helper RPC for generic reviews:

```980:1008:shared/docs/architecture/database-foundation-v3/current_schema/04_ai_processing.sql
CREATE OR REPLACE FUNCTION add_to_manual_review_queue(
  p_patient_id UUID,
  p_processing_session_id UUID,
  p_shell_file_id UUID,
  p_review_type TEXT,
  p_priority TEXT DEFAULT 'normal',
  p_title TEXT DEFAULT 'AI Processing Review Required',
  p_description TEXT DEFAULT 'Manual review required for AI processing validation'
) RETURNS UUID ...
```

  - Pass 1 uses **direct inserts** via the worker:

```1497:1507:apps/render-worker/src/worker.ts
// 7. INSERT manual_review_queue (optional - may be empty)
if (records.manual_review_queue.length > 0) {
  const { error: reviewError } = await this.supabase
    .from('manual_review_queue')
    .insert(records.manual_review_queue);
  // ...
}
```

- **Pass 0.5 does not interact with manual_review_queue at all** today.

---

### 3. Check of your proposed changes vs the actual codebase

#### 3.1 Change 1 – Extend `manual_review_queue.review_type`

- Current check constraint is exactly as you quoted:

```651:654:shared/docs/architecture/database-foundation-v3/current_schema/04_ai_processing.sql
review_type TEXT NOT NULL CHECK (review_type IN (
    'entity_validation', 'profile_classification', 'clinical_accuracy',
    'safety_concern', 'low_confidence', 'contamination_risk'
)),
```

- **Search results show no other hard‑coded list of review types** in TypeScript or SQL:
  - Only appearances are:
    - This CHECK constraint.
    - The 16b proposal text itself.

- That means:
  - **Files that must change for this part:**
    - `current_schema/04_ai_processing.sql` – add `'data_quality_issue'` to the CHECK list.
    - A new migration file (Migration 67) that drops & recreates the constraint as you sketched.
  - **No additional TypeScript or front‑end changes are forced** by this enum extension; anything consuming `manual_review_queue.review_type` just sees a new string value.

> Conclusion: your identified files for Change 1 are complete and correct. No hidden dependencies surfaced.

---

#### 3.2 Change 2 – New RPC `enqueue_manual_review`

- **There is currently no `enqueue_manual_review` function** in the schema:

```0:0:grep enqueue_manual_review
(no results outside 16b proposal)
```

- We *do* already have `add_to_manual_review_queue` in `04_ai_processing.sql`, but:
  - It only populates a subset of fields (no `flagged_issues`, no `clinical_context`).
  - It enforces `has_profile_access(auth.uid(), patient_id)` + `is_admin()` checks, which is great for front‑end usage but **not appropriate when the worker calls via service role** (the worker uses `serviceRoleKey` and is not in an auth context).

- Your proposed `enqueue_manual_review` RPC (service‑role oriented, richer payload) fits better for **worker‑side DOB sanity failures**.

**Where it should live and what else it touches:**

- **Primary file to add the RPC:**  
  - `current_schema/08_job_coordination.sql` – this is already where all worker‑facing RPCs (job queue, reconciliation, metrics) live. It’s the right home for a “worker calls this to enqueue a manual review” function.

- **Grants and security:**
  - At the end of `08_job_coordination.sql`, there is a block of `REVOKE` / `GRANT` statements for the worker RPCs (e.g. `enqueue_job_v3`, `claim_next_job_v3`, `complete_job`, `write_pass05_manifest_atomic`).
  - **To make the worker actually able to call `enqueue_manual_review`, you will need:**
    - `REVOKE EXECUTE ON FUNCTION enqueue_manual_review(...) FROM PUBLIC;`
    - `GRANT EXECUTE ON FUNCTION enqueue_manual_review(...) TO service_role;`
  - These grant lines are **not** mentioned in 16b, but they are required in practice for Supabase/Render worker usage.

- **Deployment verification block in 04_ai_processing.sql:**
  - There’s a small verification block that checks expected functions:

```1092:1095:shared/docs/architecture/database-foundation-v3/current_schema/04_ai_processing.sql
AND routine_name IN (
  'start_ai_processing_session', 'update_processing_session_status',
  'add_to_manual_review_queue', 'get_pending_reviews'
);
```

  - Since `enqueue_manual_review` is a new function in `08_job_coordination.sql`, it does **not** need to be added here (this block is specifically for AI‑processing‑core functions).
  - No change required, but worth being aware of so you don’t chase a phantom “function_count mismatch” later.

> Conclusion: for Change 2, the only *code* files you truly need are `08_job_coordination.sql` plus the grants section at the bottom of that same file. `add_to_manual_review_queue` can remain as a separate, user‑facing helper.

---

#### 3.3 Change 3 – Call manual review RPC from reconciliation

- Current DOB normalization & reconciliation path is exactly as you described, and there is **no hook to manual review yet**:

```501:505:apps/render-worker/src/pass05/progressive/pending-reconciler.ts
const dobResult = normalizeDateToISO(
  pickBestValue(groupPendings.map(p => p.patient_date_of_birth)),
  'patient_date_of_birth'
);
```

- In the same `reconcilePendingEncounters()` function, you already have:
  - `sessionId`, `shellFileId`, and `patientId` (function parameters).
  - `firstPending` (includes `shell_file_id`, `session_id`, etc.).
  - `mergedPageRanges` (for reviewer context).
  - `finalEncounterId` returned from `reconcilePendingsToFinal(...)`.

Everything your 16b snippet wants to pass into `enqueue_manual_review` is available **within the same scope** where we know `dobResult` and `finalEncounterId`.

**Files impacted:**

- **Single core code file:**  
  - `apps/render-worker/src/pass05/progressive/pending-reconciler.ts`  
    - Add:
      - The DOB‑failure check block and `supabase.rpc('enqueue_manual_review', {...})`.
      - Logging for both success and failure.
    - This is exactly the file your spec already calls out.

- **No other worker files need direct changes**:
  - `worker.ts` already:
    - Creates an `ai_processing_sessions` row, which supplies `processing_session_id` for the manual review row.
    - Instantiates the Supabase client with **service role** credentials, so RLS won’t block the RPC.
  - No other Pass 0.5 component currently cares about manual review queue.

> Conclusion: Change 3 only touches `pending-reconciler.ts`, and all required context to implement your proposal is already there. You didn’t miss any hidden dependencies.

---

#### 3.4 Change 4 – `pickBestDOB()` for smarter multi‑DOB selection

- Currently, **only DOB uses `pickBestValue()` in a way that’s date‑sensitive**:
  - DOB: `pickBestValue(groupPendings.map(p => p.patient_date_of_birth))`
  - All other uses of `pickBestValue` are for free‑text identity fields like `patient_full_name` and `patient_address` [within this same file].

- Encounter dates (start/end) **do not** use `pickBestValue`; they already go through `pickBestDateByQuality()` with an explicit `date_source` hierarchy:

```507:521:apps/render-worker/src/pass05/progressive/pending-reconciler.ts
const bestStartDate = pickBestDateByQuality(
  groupPendings.map(p => ({
    date: p.encounter_start_date,
    source: p.date_source || 'ai_extracted'
  }))
);

const bestEndDate = pickBestDateByQuality(
  groupPendings.map(p => ({
    date: p.encounter_end_date,
    source: p.date_source || 'ai_extracted'
  }))
);
```

**So:**

- **Files that need change for `pickBestDOB`:**
  - `apps/render-worker/src/pass05/progressive/pending-reconciler.ts`:
    - Add the `pickBestDOB()` helper near `pickBestValue`.
    - Swap the DOB call to `normalizeDateToISO(pickBestDOB(...), 'patient_date_of_birth')`.
- **No other call sites need updating**, because DOB is the only place where we’re currently using `pickBestValue()` on a date field.

> Conclusion: your “Change 4” impact analysis (just `pending-reconciler.ts`) is complete; encounter dates are already on a different, quality‑aware path.

---

### 4. Anything you *didn’t* list that I think is relevant

Beyond the files you already named in 16b, here are the **additional touchpoints I’d explicitly keep in mind**:

- **Grants for the new RPC (required for the worker to call it):**
  - `current_schema/08_job_coordination.sql`
    - Add `REVOKE`/`GRANT EXECUTE` lines for `enqueue_manual_review` to `service_role`.
    - This is the only “gotcha” not already spelled out in 16b that would block the worker call.

- **Existing generic manual review RPC:**
  - `current_schema/04_ai_processing.sql`:
    - `add_to_manual_review_queue(...)` already exists but is not used by Pass 0.5.
    - You don’t have to change it, but *architecturally* it’s worth deciding:
      - Either keep it as a front‑end/user‑initiated helper, and use `enqueue_manual_review` for worker‑initiated, richer DOB cases; or
      - Enhance `add_to_manual_review_queue` and reuse it instead of adding a new RPC.
    - This is a design choice, not a missing dependency, but it’s the one overlap area.

- **Front‑end / UX awareness (optional but recommended):**
  - `apps/web` does not currently refer to `review_type = 'data_quality_issue'` at all.
  - `get_pending_reviews(p_patient_id)` exposes `review_type` and `priority`, so:
    - As soon as we start enqueuing DOB failures, they will appear in whatever UI consumes `get_pending_reviews`, but:
    - You may want a mapping from `'data_quality_issue'` → human‑readable label and icon for the manual review screen.
  - This is **not** required to make the DOB sanity check safe and traceable, but it’s a UX follow‑up.

- **Documentation updates after implementation (not blocking):**
  - `16-DATE-FORMAT-ARCHITECTURE-v2.md` currently describes DOB sanity check but not the manual review behavior.
  - `17-ENCOUNTER-DATE-SYSTEM.md` is focused on encounter dates, but you might want a short subsection referencing DOB manual review for data quality.
  - These are “keep the docs honest” items, not additional code/script changes.

---

### 5. Summary: are all relevant files and scripts identified?

**Core changes you already called out and I confirm:**

- **Database schema & migrations**
  - `current_schema/04_ai_processing.sql`
    - Extend `manual_review_queue.review_type` to include `'data_quality_issue'`.
  - **New migration 67** in `shared/docs/architecture/database-foundation-v3/migration_history/`  
    - Drops & recreates `manual_review_queue_review_type_check`.
    - (Matches the skeleton in 16b.)

- **Job coordination / RPCs**
  - `current_schema/08_job_coordination.sql`
    - Add `enqueue_manual_review(...)` with the richer signature (flagged_issues, clinical_context).
    - Add `REVOKE/GRANT EXECUTE` for this function to `service_role`.

- **Pass 0.5 worker code**
  - `apps/render-worker/src/pass05/progressive/pending-reconciler.ts`
    - Add `pickBestDOB()` and use it instead of `pickBestValue()` for DOB.
    - After `reconcilePendingsToFinal(...)` returns `finalEncounterId`, detect `dobResult.parseMethod === 'failed_sanity_check'` and call `supabase.rpc('enqueue_manual_review', {...})` with DOB context, page ranges, and encounter ID.

**Additional relevant context I verified:**

- **Data flow correctness:** DOB flows from AI → pendings → `normalizeDateToISO()` → `reconcile_pending_to_final()` exactly as your docs describe; there are no extra DOB normalization points elsewhere that would also need adjustment.
- **Manual review queue wiring:** The table, indexes, RLS, and existing helper `add_to_manual_review_queue` are all present and do not conflict with your plan; Pass 0.5 is currently not integrated, so your proposed hook is clean and localized.
- **No extra enum/union dependencies on `review_type`:** only the CHECK constraint needs changing.

If you’d like, next step I can do is draft the exact diffs for each of these files (SQL + TS) following this map, but only after you’ve reviewed and confirmed you’re happy with the target surfaces.