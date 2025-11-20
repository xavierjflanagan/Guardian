# Comprehensive Progressive Mode Analysis
**Date:** 2025-11-11
**Status:** Investigation Complete - Implementation Plan Required

## Executive Summary

Progressive mode has THREE CRITICAL ISSUES that must be resolved systematically:

1. **P0 SCHEMA BUG**: Broken unique constraint references non-existent column
2. **P0 OCR EXTRACTION**: Text extraction working after commit a7cd1b0 (blocks now have text)
3. **P1 SCHEMA INCONSISTENCY**: camelCase vs snake_case mismatch between prompt and parser

## Issue 1: Broken Database Constraint (P0 - BLOCKS ALL TESTING)

### Root Cause
Migration `2025-10-30_34_pass_0_5_infrastructure.sql:123` creates constraint:
```sql
ALTER TABLE healthcare_encounters
  ADD CONSTRAINT unique_encounter_per_shell_file
  UNIQUE (patient_id, primary_shell_file_id, encounter_type, encounter_date, page_ranges);
```

**Problem:** Column `encounter_date` DOES NOT EXIST in healthcare_encounters table.

**Actual columns:** `encounter_start_date` and `encounter_date_end` (migration line 95)

### Evidence
```
Error: column "encounter_date" does not exist
Context: UPSERT onConflict parameter or constraint validation
```

### Impact
- BLOCKS all progressive mode testing
- INSERT/UPSERT operations fail with column error
- Cannot persist any encounters successfully

### Fix Required
**Option A (Recommended):** Drop and recreate constraint with correct column:
```sql
ALTER TABLE healthcare_encounters DROP CONSTRAINT unique_encounter_per_shell_file;
ALTER TABLE healthcare_encounters
  ADD CONSTRAINT unique_encounter_per_shell_file
  UNIQUE (patient_id, primary_shell_file_id, encounter_type, encounter_start_date, page_ranges);
```

**Option B:** Add `encounter_date` as computed column:
```sql
ALTER TABLE healthcare_encounters
  ADD COLUMN encounter_date TIMESTAMPTZ GENERATED ALWAYS AS (encounter_start_date) STORED;
```

**Recommendation:** Option A - use actual column name

## Issue 2: OCR Text Extraction Status (P0 - RESOLVED)

### Current Status: WORKING ✓

**Fix Applied:** Commit a7cd1b0
- worker.ts:1206 now includes `text: line.text` in blocks
- chunk-processor.ts:315-318 extracts from `blocks[].text`

### Verification from Render Logs
```
[DEBUG] First page keys: [ 'width', 'height', 'confidence', 'blocks' ]
[DEBUG] blocks structure contains text field
```

**Test needed:** Re-run after fixing Issue #1 to confirm encounters extracted successfully

## Issue 3: Schema Inconsistency (P1 - DESIGN NEEDED)

### GPT-5 Review Finding
Progressive prompts output snake_case but parser expects camelCase, causing field drops.

**Evidence from code:**

**prompts.ts:97-137** - Defines snake_case schema:
```json
{
  "encounters": [{
    "status": "complete",
    "temp_id": "encounter_temp_001",
    "encounter_type": "Emergency Department Visit",
    "encounter_start_date": "2024-03-15"
  }]
}
```

**chunk-processor.ts:224-236** - Claims camelCase:
```typescript
/**
 * ARCHITECTURE CHANGE: Now uses v2.9 base prompt which outputs camelCase natively.
 * Progressive addons don't change the schema, so no normalization needed.
 */
```

**chunk-processor.ts:260-271** - Actually reads snake_case:
```typescript
tempId: enc.encounter_id,  // Uses snake_case
encounterType: enc.encounterType,  // Uses camelCase
```

### Impact
- Silent field drops if model outputs different casing than expected
- Unpredictable behavior depending on which schema AI follows
- Makes debugging extremely difficult

### Fix Options

**Option A: Unify on camelCase (GPT recommendation)**
- Update prompts.ts to specify camelCase output
- Aligns with v2.9 base prompt
- Cleaner long-term

**Option B: Unify on snake_case**
- Update parser to read snake_case consistently
- Update all field references
- More work but matches current prompt

**Option C: Normalize at boundary**
- Keep prompts snake_case
- Add normalization layer in parser
- Most flexible but adds complexity

**Recommendation:** Option A - unify on camelCase to match v2.9

## Cross-Cutting Issues from GPT Review

### 1. Missing shell_files Finalization
**Location:** session-manager.ts
**Issue:** Progressive completion doesn't update shell_files with:
- `pass_0_5_completed = true`
- `pass_0_5_progressive = true`
- `pass_0_5_version`
- `ocr_average_confidence`

**Impact:** No way to know progressive mode succeeded

**Fix:** Add shell_files update after `finalizeProgressiveSession()`

### 2. Missing Confidence Score Tracking
**Location:** database.ts:114-133
**Issue:** `pass05_chunk_results` insert doesn't populate `confidence_score` column

**Impact:** Cannot track quality metrics or trigger manual review

**Fix:** Add `confidence_score: params.confidence` to insert

### 3. Page Assignment Persistence
**Location:** session-manager.ts
**Issue:** Page assignments returned but not persisted to `pass05_page_assignments` table

**Impact:** Lose granular page-to-encounter mapping

**Fix:** Determine if persistence should happen in session-manager or is handled elsewhere

### 4. RPC Dependency Risk
**Location:** database.ts
**Issue:** Relies on RPCs (`update_progressive_session_progress`, `finalize_progressive_session`) without fallback

**Impact:** If RPCs missing/broken, progressive mode fails silently

**Fix:** Add graceful fallback with direct table updates

## Implementation Plan

### Phase 1: Critical Fixes (BLOCKING)
1. **Fix database constraint** (Issue #1)
   - Create migration to drop/recreate with `encounter_start_date`
   - Test with simple INSERT
   - Verify constraint works correctly

2. **Test OCR extraction** (Issue #2 verification)
   - Re-upload 142-page file
   - Confirm encounters extracted
   - Validate text content in encounters

### Phase 2: Schema Unification (HIGH PRIORITY)
3. **Unify on camelCase** (Issue #3)
   - Update prompts.ts schema to camelCase
   - Remove conflicting snake_case references
   - Update parser to expect camelCase consistently
   - Test with sample file

### Phase 3: Quality Improvements (MEDIUM PRIORITY)
4. **Add shell_files finalization**
5. **Add confidence_score tracking**
6. **Add page assignment persistence**
7. **Add RPC fallbacks**

## Testing Strategy

### Test 1: Constraint Fix Validation
- Upload 3-page file (standard mode)
- Verify constraint allows insert
- Upload same file again
- Verify constraint prevents duplicate

### Test 2: Progressive Mode End-to-End
- Upload 142-page file
- Verify chunking (should see 3 chunks)
- Verify encounters extracted (expect >1 real encounter)
- Check encounter content quality
- Validate page assignments

### Test 3: Schema Consistency
- Check all 3 chunks return consistent schema
- Verify no field drops
- Validate encounter merging works

## Next Steps

**IMMEDIATE:**
1. User approval of fix strategy for Issue #1 (constraint)
2. Create migration script
3. Deploy and test

**AFTER CONSTRAINT FIX:**
4. Re-test 142-page file
5. Address schema consistency
6. Implement quality improvements

## Questions for User

1. **Constraint fix:** Option A (rename to encounter_start_date) or Option B (add computed column)?
2. **Schema unification:** Proceed with camelCase (Option A)?
3. **Testing scope:** Fix constraint and re-test immediately, or plan all fixes first?

---

**Prepared by:** Claude Code
**Status:** Awaiting user decision on implementation approach
