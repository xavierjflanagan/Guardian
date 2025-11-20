# Migration 58-59 Implementation Plan
## Strategy A Data Quality Fixes

**Created:** 2025-11-21
**Status:** Ready for Review (Touchpoint 1)

---

## Overview

This document provides the complete implementation plan for Migrations 58 and 59, which address 10 data quality issues identified in `STRATEGY-A-DATA-QUALITY-AUDIT.md`. The implementation follows the two-touchpoint migration workflow defined in `migration_history/README.md`.

## Two-Touchpoint Workflow

### Touchpoint 1: Research + Create Script (CURRENT)
- Verified current system behavior via database queries
- Researched RPC signatures and table structures
- Created complete migration scripts (58 and 59)
- Identified TypeScript changes required
- **Ready for:** Human review + second AI bot review

### Touchpoint 2: Execute + Finalize (AFTER REVIEW)
- Apply feedback from reviews
- Execute migrations via `mcp__supabase__apply_migration()`
- Update source of truth schemas
- Update TypeScript files
- Update bridge schemas if needed
- Mark migration headers complete

---

## Migration 58: Extend Metrics RPC and Add Identity Extraction

**File:** `migration_history/2025-11-21_58_extend_metrics_rpc_and_add_identity_extraction.sql`

**Addresses Issues:**
- Issue #10: Metrics RPC Incomplete (HIGH)
- Issue #8: Patient Identity Not Copied (HIGH)

### Part 1: Extend update_strategy_a_metrics RPC

**Current State:**
- RPC populates 7 of 23 fields in `pass05_encounter_metrics`
- Fields populated: encounters_detected, real_world_encounters, pseudo_encounters, pendings_total, cascades_total, orphans_total, chunk_count
- Fields missing: 16 metrics remain NULL/zero

**Changes:**
1. Add 14 new DECLARE variables for missing metrics
2. Add 5 new SQL queries to fetch:
   - Token counts from `pass05_progressive_sessions`
   - Quality metrics from `healthcare_encounters`
   - OCR confidence from `pass05_chunk_results`
   - Performance metrics from `pass05_progressive_sessions`
   - Processing time calculation from chunk timestamps
3. Extend UPDATE statement to populate all 23 fields

**Fields Now Populated:**
- Token metrics: input_tokens, output_tokens, total_tokens
- Cost metrics: ai_cost_usd
- Quality metrics: ocr_average_confidence, encounter_confidence_average, encounter_types_found
- Performance metrics: processing_time_ms, ai_model_used, total_pages, batching_required

### Part 2: Extend reconcile_pending_to_final RPC

**Current State:**
- RPC creates `healthcare_encounters` from pending encounters
- Identity fields (patient_full_name, patient_date_of_birth, patient_address, chief_complaint) not extracted from JSONB

**Changes:**
1. Add 4 identity columns to INSERT column list
2. Add 4 identity field extractions to SELECT statement:
   - `(p_encounter_data->>'patient_full_name')::TEXT`
   - `(p_encounter_data->>'patient_date_of_birth')::DATE`
   - `(p_encounter_data->>'patient_address')::TEXT`
   - `(p_encounter_data->>'chief_complaint')::TEXT`

**Prerequisite:** TypeScript must add these fields to `encounterData` JSONB before calling RPC

---

## Migration 59: Add Cascade Counter and Fix Chunk Timestamps

**File:** `migration_history/2025-11-21_59_add_cascade_counter_and_fix_chunk_timestamps.sql`

**Addresses Issues:**
- Issue #4: total_cascades Always Zero (MEDIUM)
- Issue #5: Chunk Timestamps NULL (LOW)
- Issue #6: Session Timestamps NULL (LOW)

### Part 1: Create increment_session_total_cascades RPC

**Current State:**
- `pass05_progressive_sessions.total_cascades` always 0
- No mechanism to increment counter when cascades created

**Changes:**
1. Create new RPC function `increment_session_total_cascades(p_session_id UUID)`
2. Atomically increments `total_cascades` field
3. Returns new count value
4. Throws error if session not found

**Usage Pattern:**
```typescript
// Call after creating new cascade
await supabase.rpc('increment_session_total_cascades', {
  p_session_id: sessionId
});
```

### Part 2: Timestamp Fixes (TypeScript Only)

**Current State:**
- `pass05_chunk_results.started_at` and `completed_at` are NULL
- `pass05_progressive_sessions.started_at` and `completed_at` are NULL
- Columns exist but not populated by TypeScript

**Changes:** No SQL changes needed - TypeScript fixes only

---

## TypeScript Changes Required

### File 1: `apps/render-worker/src/pass05/progressive/pending-reconciler.ts`

**Purpose:** Add identity merging logic before calling `reconcile_pending_to_final` RPC

**Changes:**

1. Add helper function `pickBestValue()`:
```typescript
/**
 * Pick best value from array of nullable strings
 * Prefers non-null, non-empty values
 * For multiple non-empty values, picks longest
 */
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

2. Add helper function `normalizeDateToISO()`:
```typescript
/**
 * Normalize date string to ISO format (YYYY-MM-DD)
 * Handles mixed formats: "November 14, 1965", "11/14/1965", etc.
 * Returns null if unparseable
 */
function normalizeDateToISO(dateString: string | null): string | null {
  if (!dateString) return null;

  try {
    const parsed = new Date(dateString);
    if (isNaN(parsed.getTime())) return null;

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  } catch (error) {
    console.warn('[Identity] Failed to parse date:', dateString, error);
    return null;
  }
}
```

3. Extend `encounterData` JSONB construction (in `reconcilePendingsToFinal` function):
```typescript
const encounterData = {
  // ... existing fields ...

  // Migration 58: Add identity fields
  patient_full_name: pickBestValue(groupPendings.map(p => p.patient_full_name)),
  patient_date_of_birth: normalizeDateToISO(
    pickBestValue(groupPendings.map(p => p.patient_date_of_birth))
  ),
  patient_address: pickBestValue(groupPendings.map(p => p.patient_address)),
  chief_complaint: firstPending.encounter_data?.chief_complaint || null,
};

console.log('[Reconcile] Identity merged:', {
  patient_full_name: encounterData.patient_full_name,
  patient_date_of_birth: encounterData.patient_date_of_birth,
  patient_address: encounterData.patient_address,
  chief_complaint: encounterData.chief_complaint
});
```

**Location:** Around line 100-150 (in the cascade group reconciliation loop)

---

### File 2: `apps/render-worker/src/pass05/progressive/chunk-processor.ts`

**Purpose:**
1. Call cascade counter RPC when new cascades created
2. Add timestamp capture for chunk processing

**Changes:**

1. Add cascade counter calls (after cascade tracking block, around line 243):
```typescript
// Track new cascades in database
const newCascadeIds = new Set<string>();
pendings.forEach((pending) => {
  if (pending.cascade_id && !pending.continues_previous) {
    newCascadeIds.add(pending.cascade_id);
  }
});

// Create cascade chain records for new cascades
for (const cascadeId of newCascadeIds) {
  await trackCascade(cascadeId, params.sessionId, params.chunkNumber);
  console.log(`[Chunk ${params.chunkNumber}] Tracked new cascade: ${cascadeId}`);

  // Migration 59: Increment session total_cascades counter
  const { data: newCount, error: counterError } = await supabase.rpc(
    'increment_session_total_cascades',
    { p_session_id: params.sessionId }
  );

  if (counterError) {
    console.error(`[Chunk ${params.chunkNumber}] Failed to increment cascade counter:`, counterError);
  } else {
    console.log(`[Chunk ${params.chunkNumber}] Session total_cascades now: ${newCount}`);
  }
}
```

2. Add chunk timestamp capture (at start and end of `processChunk` function):
```typescript
export async function processChunk(params: ChunkProcessorParams): Promise<ChunkResult> {
  const startTime = Date.now(); // Migration 59: Capture start time

  try {
    // ... existing chunk processing logic ...

    const endTime = Date.now(); // Migration 59: Capture end time
    const processingTimeMs = endTime - startTime;

    // Write chunk result with timestamps
    const { error: resultError } = await supabase
      .from('pass05_chunk_results')
      .insert({
        session_id: params.sessionId,
        chunk_number: params.chunkNumber,
        // ... existing fields ...
        started_at: new Date(startTime).toISOString(), // Migration 59: Add timestamp
        completed_at: new Date(endTime).toISOString(), // Migration 59: Add timestamp
        processing_time_ms: processingTimeMs
      });

    console.log(`[Chunk ${params.chunkNumber}] Completed in ${processingTimeMs}ms`);

  } catch (error) {
    const endTime = Date.now();
    console.error(`[Chunk ${params.chunkNumber}] Failed after ${endTime - startTime}ms:`, error);
    throw error;
  }
}
```

3. Add session timestamp updates (in session management code):
```typescript
// At session start (when creating pass05_progressive_sessions record)
const { data: session, error: sessionError } = await supabase
  .from('pass05_progressive_sessions')
  .insert({
    shell_file_id: shellFileId,
    strategy_version: 'strategy_a',
    started_at: new Date().toISOString(), // Migration 59: Add timestamp
    // ... other fields
  })
  .select()
  .single();

// At session completion (after reconciliation completes)
const { error: updateError } = await supabase
  .from('pass05_progressive_sessions')
  .update({
    completed_at: new Date().toISOString(), // Migration 59: Add timestamp
    reconciliation_completed_at: new Date().toISOString()
  })
  .eq('id', sessionId);
```

---

## Source of Truth Schema Updates

After migration execution, update these files:

### File 1: `current_schema/08_job_coordination.sql`

**Line 694-750:** Replace `update_strategy_a_metrics` function with Migration 58 version

**Line 526-664:** Replace `reconcile_pending_to_final` function with Migration 58 version

**After line 750:** Add `increment_session_total_cascades` function from Migration 59

---

## Testing Checklist

### Pre-Migration Testing (Touchpoint 1)

- [ ] Verify SQL syntax is correct (dry-run in SQL editor)
- [ ] Check RPC function signatures match current system
- [ ] Confirm all referenced tables and columns exist
- [ ] Review TypeScript changes for correctness
- [ ] Validate date normalization logic handles edge cases

### Post-Migration Testing (Touchpoint 2)

#### Test 1: Metrics RPC Extension
- [ ] Upload new document (142-page hospital admission)
- [ ] Query `pass05_encounter_metrics` for latest record
- [ ] Verify all 23 fields populated (not NULL/zero)
- [ ] Check: input_tokens > 0, output_tokens > 0, total_tokens > 0
- [ ] Check: ai_cost_usd > 0
- [ ] Check: ocr_average_confidence between 0.00 and 1.00
- [ ] Check: encounter_confidence_average between 0.00 and 1.00
- [ ] Check: encounter_types_found is non-empty array
- [ ] Check: processing_time_ms > 0
- [ ] Check: ai_model_used is not 'unknown'
- [ ] Check: total_pages matches document page count
- [ ] Check: batching_required is TRUE for Strategy A

#### Test 2: Identity Extraction
- [ ] Upload document with patient identity data
- [ ] Query `healthcare_encounters` for latest pass_0_5 record
- [ ] Verify: patient_full_name is populated
- [ ] Verify: patient_date_of_birth is DATE format (YYYY-MM-DD)
- [ ] Verify: patient_address is populated
- [ ] Verify: chief_complaint is populated (if present in pendings)
- [ ] Verify: pickBestValue chose longest/best value from multiple pendings

#### Test 3: Cascade Counter
- [ ] Upload document that creates cascades (142-page admission)
- [ ] Query `pass05_progressive_sessions` for latest record
- [ ] Verify: total_cascades > 0 (should be 1 for 142-page doc)
- [ ] Verify: total_cascades matches count in `pass05_cascade_chains`
- [ ] Check logs for "Session total_cascades now: X" messages

#### Test 4: Chunk Timestamps
- [ ] Upload any document
- [ ] Query `pass05_chunk_results` for latest records
- [ ] Verify: started_at is not NULL for all chunks
- [ ] Verify: completed_at is not NULL for all chunks
- [ ] Verify: completed_at > started_at
- [ ] Calculate: (completed_at - started_at) should be reasonable duration

#### Test 5: Session Timestamps
- [ ] Upload any document
- [ ] Query `pass05_progressive_sessions` for latest record
- [ ] Verify: started_at is not NULL
- [ ] Verify: completed_at is not NULL
- [ ] Verify: reconciliation_completed_at is not NULL
- [ ] Verify: completed_at > started_at
- [ ] Verify: reconciliation_completed_at >= completed_at

### Integration Testing

- [ ] Re-upload the original 142-page hospital admission document
- [ ] Verify all 10 issues from STRATEGY-A-DATA-QUALITY-AUDIT.md are resolved
- [ ] Check: 3 pendings reconcile to 1 final encounter (not 2)
- [ ] Check: No "abandoned" pendings
- [ ] Check: No cascade chain query errors
- [ ] Check: Metrics HTTP 400 error does not occur
- [ ] Check: All table columns populated correctly

---

## Rollback Plan

### If Migration 58 Fails:
1. Re-run Migration 57 SQL for both functions to revert changes
2. Remove identity field additions from TypeScript
3. Document failure reason for investigation

### If Migration 59 Fails:
1. Drop the `increment_session_total_cascades` function:
   ```sql
   DROP FUNCTION IF EXISTS increment_session_total_cascades(UUID);
   ```
2. Remove RPC calls from TypeScript
3. Remove timestamp captures from TypeScript

### If TypeScript Changes Cause Issues:
1. Revert TypeScript commits
2. Database changes remain (backward compatible)
3. Identity fields and counter will remain NULL until TypeScript fixed

---

## Deployment Strategy

### Phase 1: Database Migrations (Low Risk)
1. Execute Migration 58 via Supabase MCP
2. Execute Migration 59 via Supabase MCP
3. Verify migrations applied successfully
4. Update source of truth schemas

### Phase 2: TypeScript Changes (Medium Risk)
1. Deploy pending-reconciler.ts changes
2. Deploy chunk-processor.ts changes
3. Monitor logs for errors
4. Test with single document upload

### Phase 3: Validation (High Confidence)
1. Run complete testing checklist
2. Upload multiple test documents
3. Verify all 10 issues resolved
4. Mark migration headers complete

---

## Success Criteria

All 10 issues from STRATEGY-A-DATA-QUALITY-AUDIT.md must be resolved:

1. Issue #1: Reconciliation log table (CORRECT - by design)
2. Issue #2: Identity/classification tables (CORRECT - future work)
3. Issue #3: Identity merging metrics (CORRECT - future work)
4. Issue #4: total_cascades counter (FIXED by Migration 59)
5. Issue #5: Chunk timestamps (FIXED by TypeScript)
6. Issue #6: Session timestamps (FIXED by TypeScript)
7. Issue #7: Reconciled_from_pendings (CORRECT - accurate)
8. Issue #8: Patient identity not copied (FIXED by Migration 58)
9. Issue #9: Orphans count logic (CORRECT - by design)
10. Issue #10: Metrics RPC incomplete (FIXED by Migration 58)

**Definition of Done:**
- All HIGH priority issues resolved (Issues #8, #10)
- All MEDIUM priority issues resolved (Issue #4)
- All LOW priority issues resolved or documented as correct (Issues #5, #6)
- Complete test suite passes
- Production upload completes without errors
- Metrics dashboard shows accurate data

---

## Review Questions for Human + Second AI Bot

1. **SQL Correctness:** Are the RPC function signatures and logic correct?
2. **Type Safety:** Are the JSONB extractions and PostgreSQL casts correct?
3. **Performance:** Will the additional queries in update_strategy_a_metrics cause performance issues?
4. **Error Handling:** Should we add more error handling in the RPCs?
5. **TypeScript Integration:** Are the helper functions (pickBestValue, normalizeDateToISO) robust?
6. **Date Parsing:** Will normalizeDateToISO handle all date formats from AI responses?
7. **Atomicity:** Are the cascade counter increments atomic and safe?
8. **Timestamp Precision:** Should we use `NOW()` or `Date.now()` for consistency?
9. **Logging:** Is the logging sufficient for debugging?
10. **Migration Numbering:** Confirmed last migration is 57, so 58 and 59 are correct?

---

## Status: READY FOR REVIEW

This implementation plan is now ready for:
1. Human review
2. Second AI bot review
3. Feedback incorporation
4. Execution (Touchpoint 2)
