# Strategy A Data Quality Audit - Post-Migration 57

**Date:** November 20, 2025 (Updated: November 21, 2025)
**Job Run:** shell_file_id `cf622295-4def-4246-b143-920a31b2d9a8`
**Session:** 340c0dae-1533-478b-840e-6bc7ec1dded5
**Document:** 142-page hospital admission summary
**Processing:** 3 chunks (50/50/42 pages), 3 pending encounters, 1 final encounter

**UPDATE (Nov 21):** Audit reviewed and corrected based on independent code investigation. Severity levels and fix strategies updated to align with actual RPC-based architecture.

---

## Executive Summary

**Overall Status:** MIXED - Core reconciliation working correctly, but data quality and metrics population issues found.

**Critical Findings:**
- Core reconciliation: Working correctly (3 pendings → 1 final) ✅
- Cascade tracking: Working correctly (Issue #1 fixed) ✅
- Identity extraction: AI extracted patient data, but NOT copied to final encounter ❌
- Metrics tracking: Incomplete - only 7 of ~23 fields populated ⚠️
- Classification/audit systems: Not implemented yet (expected) ⏳
- Chunk timestamps: Missing (metadata available but not saved) ⚠️

**Fix Priority:**
1. HIGH: Extend metrics RPC to populate remaining 16 fields (tokens, quality, timing)
2. HIGH: Implement identity merging through RPC architecture (patient name, DOB, address)
3. MEDIUM: Add cascade counter increment
4. MEDIUM: Populate chunk timestamps (started_at, completed_at)
5. LOW: Implement identity/classification systems (future work)

---

## Table 1: pass05_progressive_sessions

**Record Count:** 1 record
**Table Purpose:** Track progressive processing session metadata

### Column Analysis

| Column | Expected Value | Actual Value | Status | Notes |
|--------|---------------|--------------|--------|-------|
| **id** | UUID | `340c0dae...` | ✅ Correct | Session ID properly set |
| **shell_file_id** | UUID ref | `cf622295...` | ✅ Correct | Links to shell_files |
| **patient_id** | UUID ref | `d1dbe18c...` | ✅ Correct | Patient properly set |
| **total_pages** | 142 | 142 | ✅ Correct | Matches document |
| **chunk_size** | 50 | 50 | ✅ Correct | Expected chunk size |
| **total_chunks** | 3 | 3 | ✅ Correct | ceil(142/50) = 3 |
| **current_chunk** | 3 | 2 | ⚠️ Minor | Shows chunk 2 but all 3 completed |
| **processing_status** | "completed" | "completed" | ✅ Correct | Session finished |
| **current_handoff_package** | Last cascade context | Has cascade context | ✅ Correct | Contains chunk 2 handoff |
| **total_pendings_created** | 3 | 3 | ✅ Correct | One pending per chunk |
| **requires_manual_review** | false | false | ✅ Correct | No review needed |
| **review_reasons** | NULL | NULL | ✅ Correct | No issues flagged |
| **average_confidence** | ~1.00 | "1.00" | ✅ Correct | High AI confidence |
| **started_at** | timestamp | `2025-11-20 21:12:28...` | ✅ Correct | Session start time |
| **completed_at** | timestamp | `2025-11-20 21:15:50...` | ✅ Correct | Session end time |
| **total_processing_time** | ~3min 22sec | `00:03:22.097475` | ✅ Correct | Accurate duration |
| **total_ai_calls** | 3 | 3 | ✅ Correct | One AI call per chunk |
| **total_input_tokens** | ~127k | 127,283 | ✅ Correct | Summed from chunks |
| **total_output_tokens** | ~10k | 10,044 | ✅ Correct | Summed from chunks |
| **total_cost_usd** | ~$0.0125 | "0.0125" | ✅ Correct | Accurate cost tracking |
| **created_at** | timestamp | `2025-11-20 21:12:28...` | ✅ Correct | Session creation |
| **updated_at** | timestamp | `2025-11-20 21:15:50...` | ✅ Correct | Last update |
| **total_cascades** | 1 | 0 | ❌ INCORRECT | Should be 1 (one cascade chain created) |
| **strategy_version** | "A-v1" | "A-v1" | ✅ Correct | Strategy A version |
| **reconciliation_completed_at** | timestamp | `2025-11-20 21:15:50.688+00` | ✅ Correct | Reconciliation timestamp |
| **final_encounter_count** | 1 | 1 | ✅ Correct | One final encounter created |

### Issues Found

#### Issue #5: total_cascades = 0 (Should be 1)

**Severity:** MEDIUM
**Impact:** Metrics reporting incorrect cascade count

**Root Cause:**
- Column exists (Migration 57) but never incremented
- Code creates cascade chains but doesn't update session counter
- Location: `apps/render-worker/src/pass05/progressive/chunk-processor.ts` (lines 218-243)

**Current Code:**
```typescript
// After trackCascade() call - NO counter increment
for (const cascadeId of newCascadeIds) {
  await trackCascade(cascadeId, params.sessionId, params.chunkNumber);
  console.log(`[Chunk ${params.chunkNumber}] ✓ Tracked new cascade chain: ${cascadeId}`);
  // MISSING: Increment total_cascades counter
}
```

**Fix Plan (Option A - Preferred):**

**Step 1: Create RPC Function**
```sql
-- Location: shared/docs/architecture/database-foundation-v3/current_schema/08_job_coordination.sql
-- Add after other RPC functions

CREATE OR REPLACE FUNCTION increment_session_total_cascades(
  p_session_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE pass05_progressive_sessions
  SET total_cascades = total_cascades + 1
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_session_total_cascades IS
  'Increments total_cascades counter for a progressive session when a new cascade chain is created.';
```

**Step 2: Call RPC from Chunk Processor**
```typescript
// Location: apps/render-worker/src/pass05/progressive/chunk-processor.ts:218-243
// Update the cascade tracking loop

for (const cascadeId of newCascadeIds) {
  await trackCascade(cascadeId, params.sessionId, params.chunkNumber);

  // NEW: Increment session cascade counter
  const { error: counterError } = await supabase.rpc('increment_session_total_cascades', {
    p_session_id: params.sessionId
  });

  if (counterError) {
    console.error(`[Chunk ${params.chunkNumber}] Failed to increment cascade counter:`, counterError);
    // Don't throw - counter failure shouldn't block processing
  }

  console.log(`[Chunk ${params.chunkNumber}] ✓ Tracked new cascade chain: ${cascadeId}`);
}
```

**Alternative (Option B - Simpler, not atomic):**
```typescript
// Read-modify-write pattern (no RPC needed, but not atomic)
const { data: session } = await supabase
  .from('pass05_progressive_sessions')
  .select('total_cascades')
  .eq('id', params.sessionId)
  .single();

await supabase
  .from('pass05_progressive_sessions')
  .update({ total_cascades: (session.total_cascades || 0) + 1 })
  .eq('id', params.sessionId);
```

**Testing:**
1. Process multi-cascade document (2+ separate encounters)
2. Verify `pass05_progressive_sessions.total_cascades` matches cascade count
3. Verify `pass05_cascade_chains` has matching number of records

**Priority:** MEDIUM - Nice to have for metrics dashboard accuracy

---

## Table 2: pass05_chunk_results

**Record Count:** 3 records (one per chunk)
**Table Purpose:** Per-chunk processing metrics and AI response data

### Column Analysis (Chunk 1 Example)

| Column | Expected Value | Actual Value | Status | Notes |
|--------|---------------|--------------|--------|-------|
| **id** | UUID | `cccb6f9a...` | ✅ Correct | Chunk result ID |
| **session_id** | UUID ref | `340c0dae...` | ✅ Correct | Links to session |
| **chunk_number** | 1 | 1 | ✅ Correct | First chunk |
| **page_start** | 1 | 1 | ✅ Correct | Chunk starts page 1 |
| **page_end** | 50 | 50 | ✅ Correct | Chunk ends page 50 |
| **processing_status** | "completed" | "completed" | ✅ Correct | Chunk finished |
| **started_at** | timestamp | NULL | ❌ INCORRECT | Should have AI call start time |
| **completed_at** | timestamp | NULL | ❌ INCORRECT | Should have AI call end time |
| **processing_time_ms** | ~62k ms | 62,809 | ✅ Correct | Duration tracked correctly |
| **ai_model_used** | "gemini-2.5-pro" | "gemini-2.5-pro" | ✅ Correct | Correct model name |
| **input_tokens** | ~46k | 46,860 | ✅ Correct | Chunk 1 input tokens |
| **output_tokens** | ~4.7k | 4,736 | ✅ Correct | Chunk 1 output tokens |
| **ai_cost_usd** | ~$0.0049 | "0.0049" | ✅ Correct | Accurate cost |
| **cascade_context_received** | NULL | NULL | ✅ Correct | First chunk, no handoff |
| **cascade_package_sent** | Array w/ cascade | Has cascade data | ✅ Correct | Handoff to chunk 2 |
| **confidence_score** | ~1.00 | "1.00" | ✅ Correct | High confidence |
| **ocr_average_confidence** | NULL | NULL | ✅ Correct | OCR not used |
| **error_message** | NULL | NULL | ✅ Correct | No errors |
| **error_context** | NULL | NULL | ✅ Correct | No error details |
| **retry_count** | 0 | 0 | ✅ Correct | No retries needed |
| **ai_response_raw** | JSON string | Full AI response | ✅ Correct | Complete AI JSON |
| **created_at** | timestamp | `2025-11-20 21:13:31...` | ✅ Correct | Record creation |
| **pendings_created** | 1 | 1 | ✅ Correct | One pending from chunk 1 |
| **cascading_count** | 1 | 1 | ✅ Correct | One cascading encounter |
| **cascade_ids** | Array w/ 1 ID | `["cascade_340c0..."]` | ✅ Correct | Cascade ID tracked |
| **continues_count** | 0 | 0 | ✅ Correct | No continuations in chunk 1 |
| **page_separation_analysis** | JSONB object | Has split points | ✅ Correct | Batching analysis present |

### Issues Found

#### Issue #6: started_at and completed_at are NULL

**Severity:** MEDIUM
**Impact:** Cannot track exact AI API call timestamps per chunk

**Root Cause:**
- Columns exist (Migration 57) but never populated
- Code tracks `processing_time_ms` but doesn't save timestamps
- Location: `apps/render-worker/src/pass05/progressive/chunk-processor.ts` (AI call section)

**Fix Plan:**

```typescript
// Location: apps/render-worker/src/pass05/progressive/chunk-processor.ts
// Update AI call section (around line where callAI() is invoked)

// Capture start time
const startTime = Date.now();
const startedAt = new Date(startTime).toISOString();

console.log(`[Chunk ${params.chunkNumber}] Calling AI model...`);

// Make AI call
const aiResponse = await callAI(...);

// Capture end time
const endTime = Date.now();
const completedAt = new Date(endTime).toISOString();
const processingTimeMs = endTime - startTime;  // Direct calculation

// Insert chunk_results with timestamps
const { data: chunkResult, error: insertError } = await supabase
  .from('pass05_chunk_results')
  .insert({
    session_id: params.sessionId,
    chunk_number: params.chunkNumber,
    page_start: params.pageRange[0],
    page_end: params.pageRange[1],
    processing_status: 'completed',
    started_at: startedAt,           // NEW
    completed_at: completedAt,       // NEW
    processing_time_ms: processingTimeMs,
    ai_model_used: 'gemini-2.5-pro',
    // ... other fields ...
  })
  .select()
  .single();
```

**Key Implementation Details:**
- Use `Date.now()` for efficient time tracking (not `Date.parse()`)
- Calculate `processingTimeMs` directly from numeric delta
- Store ISO strings for `started_at` and `completed_at`

**Testing:**
1. Process any document
2. Verify `pass05_chunk_results.started_at` and `completed_at` are not NULL
3. Verify `processing_time_ms` matches `completed_at - started_at` (within milliseconds)

**Priority:** MEDIUM - Useful for debugging AI latency issues and performance monitoring

---

## Table 3: pass05_reconciliation_log

**Record Count:** 0 records (EMPTY)
**Table Purpose:** Audit trail for reconciliation decisions

### Expected vs Actual

**Expected:** 1-2 records per cascade group showing reconciliation decisions
**Actual:** 0 records (completely empty)

### Analysis

**Is This Expected?** ⚠️ UNCLEAR - Depends on implementation phase

The table design document describes this as an "audit reconciliation decisions" table. Current code analysis shows:

**Code Investigation:**
- Searched `pending-reconciler.ts` - NO calls to insert into `pass05_reconciliation_log`
- Table exists in schema but not used in code
- Likely intended for future manual reconciliation or conflict resolution features

**Recommendation:** Not a bug - table exists for future use. Consider implementing if reconciliation audit trail is needed:

```typescript
// Future implementation example (not required now)
// Location: apps/render-worker/src/pass05/progressive/pending-reconciler.ts

// After successful reconciliation
await supabase
  .from('pass05_reconciliation_log')
  .insert({
    session_id: sessionId,
    cascade_id: cascadeId,
    reconciliation_method: 'cascade',
    pendings_reconciled: groupPendings.length,
    final_encounter_id: finalEncounterId,
    reconciled_at: new Date().toISOString(),
    notes: `Reconciled ${groupPendings.length} pendings to final encounter`
  });
```

**Priority:** LOW - Not blocking, useful for future audit trail features

---

## Table 4: pass05_pending_encounters

**Record Count:** 3 records (one per chunk)
**Table Purpose:** Temporary pending encounters before reconciliation

### Column Analysis (All 3 Pendings)

| Column | Expected | Chunk 1 | Chunk 2 | Chunk 3 | Status | Notes |
|--------|----------|---------|---------|---------|--------|-------|
| **pending_id** | Unique IDs | `pending_...001_000` | `pending_...002_000` | `pending_...003_000` | ✅ Correct | Deterministic IDs |
| **chunk_number** | 1, 2, 3 | 1 | 2 | 3 | ✅ Correct | Chunk sequence |
| **continues_previous** | F, T, T | false | true | true | ✅ Correct | Cascade continuation flags |
| **is_cascading** | T, F, F | true | false | false | ✅ Correct | Only chunk 1 cascades to 2 |
| **cascade_id** | Same ID | `cascade_340c0...` | `cascade_340c0...` | `cascade_340c0...` | ✅ Correct | All share cascade ID |
| **start_page** | 1, 51, 101 | 1 | 51 | 101 | ✅ Correct | Chunk boundaries |
| **end_page** | 50, 100, 142 | 50 | 100 | 142 | ✅ Correct | Chunk boundaries |
| **start_boundary_type** | "inter_page" | "inter_page" | "inter_page" | "inter_page" | ✅ Correct | Clean page boundaries |
| **end_boundary_type** | "inter_page" | "inter_page" | "inter_page" | "inter_page" | ✅ Correct | Clean page boundaries |
| **position_confidence** | ~1.0 | "1" | "1" | "1" | ✅ Correct | High confidence |
| **patient_full_name** | "Emma Thompson" | "Emma Thompson" | "Emma Thompson" | "Emma Emma THOMPSON" | ⚠️ Variation | Chunk 3 has duplicate first name |
| **patient_date_of_birth** | "Nov 14, 1965" | "November 14, 1965" | "11/14/1965" | "November 14, 1965" | ⚠️ Variation | Different formats |
| **patient_address** | Address or NULL | NULL | "Allentown, Lehigh County" | "123 Collins Street..." | ⚠️ Variation | Chunk 1 missing address |
| **patient_phone** | Phone or NULL | NULL | NULL | "+61-3-9999-0001" | ⚠️ Variation | Only chunk 3 has phone |
| **provider_name** | Provider name | "Patrick Callaghan, DO" | "Douglas S Prechtel, DO" | "Mark John HOSAK, MD; ..." | ⚠️ Variation | Different providers per chunk |
| **facility_name** | Facility name | "St. Luke's Hospital - Allentown Campus" | "St. Luke's Hospital" | "St. Luke's Hospital Allentown East" | ⚠️ Variation | Different facility names |
| **encounter_start_date** | "2022-11-29" | "2022-11-29" | "2022-11-29" | "2022-11-29" | ✅ Correct | Consistent date |
| **encounter_end_date** | "2022-12-07" | "2022-12-07" | "2022-12-07" | "2022-12-07" | ✅ Correct | Consistent date |
| **is_real_world_visit** | true | true | true | true | ✅ Correct | Real hospital admission |
| **matched_profile_id** | NULL (not implemented) | NULL | NULL | NULL | ✅ Expected | Classification not built yet |
| **match_confidence** | NULL | NULL | NULL | NULL | ✅ Expected | Classification not built yet |
| **match_status** | NULL | NULL | NULL | NULL | ✅ Expected | Classification not built yet |
| **is_orphan_identity** | false | false | false | false | ✅ Expected | Classification not built yet |
| **data_quality_tier** | NULL (not implemented) | NULL | NULL | NULL | ✅ Expected | Quality calc not built yet |
| **quality_criteria_met** | NULL | NULL | NULL | NULL | ✅ Expected | Quality calc not built yet |
| **status** | "completed" | "completed" | "completed" | "completed" | ✅ Correct | All reconciled |
| **reconciled_to** | Same encounter ID | `2a0c0cc2...` | `2a0c0cc2...` | `2a0c0cc2...` | ✅ Correct | All point to final |
| **reconciled_at** | Same timestamp | `2025-11-20 21:15:49...` | `2025-11-20 21:15:49...` | `2025-11-20 21:15:49...` | ✅ Correct | Reconciled together |

### Issues Found

#### Issue #7: Patient Identity Variations Across Chunks

**Severity:** LOW - Expected AI Behavior
**Impact:** Final encounter must merge/deduplicate identity data

**Root Cause:**
- Different pages in document contain different identity details
- Chunk 1: Basic patient name, no address
- Chunk 2: Patient address (partial), different provider
- Chunk 3: Full address, phone number, multiple providers

**Analysis:** This is **EXPECTED BEHAVIOR**. AI extracts what it sees on each chunk's pages. The reconciliation logic is designed to merge this data intelligently. Identity variations are resolved during reconciliation.

**No Fix Needed** - This demonstrates the system working as designed. See Issue #8 for how this data should be merged into the final encounter.

---

## Table 5: pass05_page_assignments

**Record Count:** 142 records (one per page)
**Table Purpose:** Map each page to its pending encounter

### Sample Analysis (Pages 1-10)

| Column | Expected | Actual | Status | Notes |
|--------|----------|--------|--------|-------|
| **shell_file_id** | Same for all | `cf622295...` | ✅ Correct | All pages reference same document |
| **session_id** | Same for all | `340c0dae...` | ✅ Correct | All in same session |
| **page_num** | 1-142 | 1-142 | ✅ Correct | Complete page coverage |
| **pending_id** | Changes at chunk boundaries | `pending_...001_000` (pages 1-50), `pending_...002_000` (pages 51-100), `pending_...003_000` (pages 101-142) | ✅ Correct | Proper chunk mapping |
| **encounter_id** | Same for all | `2a0c0cc2...` | ✅ Correct | All pages map to final encounter |
| **cascade_id** | Same for all | `cascade_340c0...` | ✅ Correct | All part of same cascade |
| **chunk_number** | 1, 2, or 3 | 1 (pages 1-50), 2 (pages 51-100), 3 (pages 101-142) | ✅ Correct | Proper chunk assignments |
| **is_partial** | false | false | ✅ Correct | Complete encounter, not partial |
| **justification** | Encounter description | "hospital_admission (2022-11-29)" | ✅ Correct | Clear justification |
| **reconciled_at** | timestamp | `2025-11-20 21:15:49...` | ✅ Correct | Reconciliation timestamp |
| **created_at** | timestamp | `2025-11-20 21:13:31...` | ✅ Correct | Initial creation |

### Analysis

**Status:** ✅ ALL CORRECT

All 142 pages properly mapped to:
- Correct pending_id (chunk-specific)
- Correct encounter_id (final encounter)
- Correct cascade_id (shared cascade chain)
- Correct chunk_number (1, 2, or 3)
- Proper justification text

**No Issues Found**

---

## Table 6: pass05_cascade_chains

**Record Count:** 1 record
**Table Purpose:** Track cascade chain from origin to completion

### Column Analysis

| Column | Expected Value | Actual Value | Status | Notes |
|--------|---------------|--------------|--------|-------|
| **cascade_id** | Unique cascade ID | `cascade_340c0dae-1533-478b-840e-6bc7ec1dded5_1_0_5b6d1523` | ✅ Correct | Deterministic ID format |
| **session_id** | Session UUID | `340c0dae...` | ✅ Correct | Links to session |
| **origin_chunk** | 1 | 1 | ✅ Correct | Cascade started in chunk 1 |
| **last_chunk** | 3 | 3 | ✅ Correct | Cascade ended in chunk 3 |
| **pendings_count** | 3 | 3 | ✅ Correct | Three pendings in cascade |
| **final_encounter_id** | Final encounter UUID | `2a0c0cc2-687f-4cfc-ad27-ec4dff1131df` | ✅ Correct | Links to final encounter |
| **completed_at** | timestamp | `2025-11-20 21:15:50.375+00` | ✅ Correct | Cascade completion time |
| **created_at** | timestamp | `2025-11-20 21:13:31...` | ✅ Correct | Cascade creation time |

### Analysis

**Status:** ✅ ALL CORRECT

This table is working perfectly after Issue #1 fix (Migration 57 Rabbit #8). Previously this table was empty causing "multiple rows returned" errors. Now it properly tracks:
- Origin chunk (1)
- Completion chunk (3)
- Total pendings (3)
- Final encounter link
- Timestamps

**No Issues Found**

---

## Table 7: healthcare_encounters

**Record Count:** 1 record (final reconciled encounter)
**Table Purpose:** Final healthcare encounters after reconciliation

### Column Analysis

| Column | Expected Value | Actual Value | Status | Notes |
|--------|---------------|--------------|--------|-------|
| **id** | UUID | `2a0c0cc2-687f-4cfc-ad27-ec4dff1131df` | ✅ Correct | Final encounter ID |
| **patient_id** | Patient UUID | `d1dbe18c-afc2-421f-bd58-145ddb48cbca` | ✅ Correct | Correct patient |
| **source_shell_file_id** | Shell file UUID | `cf622295-4def-4246-b143-920a31b2d9a8` | ✅ Correct | Source document |
| **encounter_type** | "hospital_admission" | "hospital_admission" | ✅ Correct | Correct type |
| **encounter_start_date** | "2022-11-29" | "2022-11-29 00:00:00+00" | ✅ Correct | Start date |
| **encounter_end_date** | "2022-12-07" | "2022-12-07 00:00:00+00" | ✅ Correct | End date |
| **start_page** | 1 | 1 | ✅ Correct | First page |
| **end_page** | 142 | 142 | ✅ Correct | Last page |
| **patient_full_name** | "Emma Thompson" | NULL | ❌ INCORRECT | Should have patient name |
| **patient_date_of_birth** | "November 14, 1965" | NULL | ❌ INCORRECT | Should have DOB |
| **patient_address** | Address | NULL | ❌ INCORRECT | Should have address |
| **provider_name** | Provider name | "Patrick Callaghan, DO" | ✅ Correct | Has provider |
| **facility_name** | Facility name | "St. Luke's Hospital - Allentown Campus" | ✅ Correct | Has facility |
| **chief_complaint** | Complaint | NULL | ⚠️ Missing | Could copy from pending |
| **is_real_world_visit** | true | true | ✅ Correct | Real hospital visit |
| **completed_at** | timestamp | `2025-11-20 21:15:49.896111+00` | ✅ Correct | Encounter completion |
| **reconciled_from_pendings** | 3 | 3 | ✅ Correct | Merged from 3 pendings |
| **chunk_count** | 3 | 3 | ✅ Correct | Spanned 3 chunks |
| **cascade_id** | Cascade ID | `cascade_340c0...` | ✅ Correct | Cascade ID preserved |
| **created_at** | timestamp | `2025-11-20 21:15:49.896111+00` | ✅ Correct | Record creation |

### Issues Found

#### Issue #8: Patient Identity Columns Are NULL (HIGH PRIORITY)

**Severity:** HIGH
**Impact:** Final encounter missing patient name, DOB, address - critical clinical data lost

**Root Cause:**
- Patient identity extracted correctly in all 3 pending encounters
- Reconciliation code builds `encounterData` JSONB but doesn't include identity fields
- RPC `reconcile_pending_to_final` doesn't extract identity fields from JSONB
- **Architecture Constraint:** All writes to `healthcare_encounters` MUST go through the RPC

**Evidence:**
```javascript
// From pending encounters (CORRECT - AI extracted data):
Chunk 1: patient_full_name: "Emma Thompson", patient_date_of_birth: "November 14, 1965"
Chunk 2: patient_full_name: "Emma Thompson", patient_date_of_birth: "11/14/1965", patient_address: "Allentown..."
Chunk 3: patient_full_name: "Emma Emma THOMPSON", patient_date_of_birth: "November 14, 1965", patient_address: "123 Collins Street..."

// From final encounter (INCORRECT - identity lost):
patient_full_name: NULL
patient_date_of_birth: NULL
patient_address: NULL
```

**Fix Plan (2-Step Process - Must Work Through RPC):**

**STEP 1: Add Identity Merging to TypeScript**
```typescript
// Location: apps/render-worker/src/pass05/progressive/pending-reconciler.ts

// Add helper functions BEFORE reconcilePendingEncounters()

/**
 * Pick best value from array of strings (longest, most complete)
 */
function pickBestValue(values: (string | null)[]): string | null {
  const nonNull = values.filter((v): v is string => v !== null && v.trim() !== '');

  if (nonNull.length === 0) return null;
  if (nonNull.length === 1) return nonNull[0];

  // Prefer longest value (likely most complete)
  return nonNull.reduce((best, current) =>
    current.length > best.length ? current : best
  );
}

/**
 * Normalize date string to ISO format (YYYY-MM-DD) for PostgreSQL DATE casting
 */
function normalizeDateToISO(dateString: string | null): string | null {
  if (!dateString) return null;

  try {
    // Handle various formats:
    // "November 14, 1965" -> 1965-11-14
    // "11/14/1965" -> 1965-11-14
    // "1965-11-14" -> 1965-11-14 (already ISO)

    const parsed = new Date(dateString);
    if (isNaN(parsed.getTime())) return null;

    // Format as YYYY-MM-DD
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error(`Failed to normalize date: ${dateString}`, error);
    return null;
  }
}

// Update reconcilePendingEncounters() function (lines 91-139)
// Add identity fields to encounterData JSONB

const encounterData = {
  encounter_type: firstPending.encounter_data?.encounter_type || 'unknown',
  encounter_start_date: firstPending.encounter_start_date,
  encounter_end_date: firstPending.encounter_end_date,
  encounter_timeframe_status: firstPending.encounter_data?.encounter_timeframe_status || 'completed',
  date_source: firstPending.encounter_data?.date_source || 'ai_extracted',
  provider_name: firstPending.provider_name,
  facility_name: firstPending.facility_name,

  // NEW: Merge identity fields from all pendings
  patient_full_name: pickBestValue(groupPendings.map(p => p.patient_full_name)),
  patient_date_of_birth: normalizeDateToISO(
    pickBestValue(groupPendings.map(p => p.patient_date_of_birth))
  ),
  patient_address: pickBestValue(groupPendings.map(p => p.patient_address)),
  chief_complaint: firstPending.encounter_data?.chief_complaint || null,

  // Position data (17 fields from mergePositionData)
  start_page: mergedPosition.start_page,
  // ... rest of existing fields ...
};
```

**STEP 2: Extend RPC to Extract Identity Fields**
```sql
-- Location: shared/docs/architecture/database-foundation-v3/current_schema/08_job_coordination.sql
-- Update reconcile_pending_to_final function (lines 526-664)

CREATE OR REPLACE FUNCTION reconcile_pending_to_final(
  p_pending_ids UUID[],
  p_patient_id UUID,
  p_shell_file_id UUID,
  p_encounter_data JSONB
) RETURNS UUID AS $$
DECLARE
  v_encounter_id UUID;
  v_pending_id UUID;
  v_cascade_id TEXT;
BEGIN
  SELECT cascade_id INTO v_cascade_id
  FROM pass05_pending_encounters
  WHERE id = p_pending_ids[1];

  -- Insert final encounter atomically
  INSERT INTO healthcare_encounters (
    patient_id,
    source_shell_file_id,
    encounter_type,
    encounter_start_date,
    encounter_end_date,
    encounter_timeframe_status,
    date_source,
    provider_name,
    facility_name,

    -- NEW: Add identity columns
    patient_full_name,
    patient_date_of_birth,
    patient_address,
    chief_complaint,

    -- Position data (existing)
    start_page,
    start_boundary_type,
    start_marker,
    start_marker_context,
    start_region_hint,
    start_text_y_top,
    start_text_height,
    start_y,
    end_page,
    end_boundary_type,
    end_marker,
    end_marker_context,
    end_region_hint,
    end_text_y_top,
    end_text_height,
    end_y,
    position_confidence,

    -- Metadata (existing)
    page_ranges,
    pass_0_5_confidence,
    summary,
    identified_in_pass,
    source_method,
    is_real_world_visit,
    data_quality_tier,
    quality_criteria_met,
    quality_calculation_date,
    encounter_source,
    created_by_user_id,
    reconciled_from_pendings,
    chunk_count,
    cascade_id,
    completed_at
  )
  SELECT
    p_patient_id,
    p_shell_file_id,
    (p_encounter_data->>'encounter_type')::VARCHAR,
    (p_encounter_data->>'encounter_start_date')::TIMESTAMPTZ,
    (p_encounter_data->>'encounter_end_date')::TIMESTAMPTZ,
    (p_encounter_data->>'encounter_timeframe_status')::VARCHAR,
    (p_encounter_data->>'date_source')::VARCHAR,
    (p_encounter_data->>'provider_name')::VARCHAR,
    (p_encounter_data->>'facility_name')::VARCHAR,

    -- NEW: Extract identity fields from JSONB
    (p_encounter_data->>'patient_full_name')::TEXT,
    (p_encounter_data->>'patient_date_of_birth')::DATE,  -- Requires ISO format (YYYY-MM-DD)
    (p_encounter_data->>'patient_address')::TEXT,
    (p_encounter_data->>'chief_complaint')::TEXT,

    -- Position data (existing)
    (p_encounter_data->>'start_page')::INTEGER,
    (p_encounter_data->>'start_boundary_type')::VARCHAR,
    (p_encounter_data->>'start_text_marker')::VARCHAR,
    (p_encounter_data->>'start_marker_context')::VARCHAR,
    (p_encounter_data->>'start_region_hint')::VARCHAR,
    (p_encounter_data->>'start_text_y_top')::INTEGER,
    (p_encounter_data->>'start_text_height')::INTEGER,
    (p_encounter_data->>'start_y')::INTEGER,
    (p_encounter_data->>'end_page')::INTEGER,
    (p_encounter_data->>'end_boundary_type')::VARCHAR,
    (p_encounter_data->>'end_text_marker')::VARCHAR,
    (p_encounter_data->>'end_marker_context')::VARCHAR,
    (p_encounter_data->>'end_region_hint')::VARCHAR,
    (p_encounter_data->>'end_text_y_top')::INTEGER,
    (p_encounter_data->>'end_text_height')::INTEGER,
    (p_encounter_data->>'end_y')::INTEGER,
    (p_encounter_data->>'position_confidence')::NUMERIC,

    -- Metadata (existing)
    (SELECT ARRAY(
      SELECT ARRAY[(elem->0)::INTEGER, (elem->1)::INTEGER]
      FROM jsonb_array_elements(p_encounter_data->'page_ranges') AS elem
    )),
    (p_encounter_data->>'pass_0_5_confidence')::NUMERIC,
    (p_encounter_data->>'summary')::TEXT,
    'pass_0_5'::VARCHAR,
    'ai_pass_0_5'::VARCHAR,
    (p_encounter_data->>'is_real_world_visit')::BOOLEAN,
    (p_encounter_data->>'data_quality_tier')::VARCHAR,
    (p_encounter_data->'quality_criteria_met')::JSONB,
    NOW(),
    'shell_file'::VARCHAR,
    (p_encounter_data->>'created_by_user_id')::UUID,
    cardinality(p_pending_ids),
    (SELECT COUNT(DISTINCT chunk_number)
     FROM pass05_pending_encounters
     WHERE id = ANY(p_pending_ids)),
    v_cascade_id,
    NOW()
  RETURNING id INTO v_encounter_id;

  -- (Rest of function unchanged - mark pendings complete, update page assignments)

  RETURN v_encounter_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reconcile_pending_to_final IS
  'Atomically converts pending encounters to final encounter. Inserts into healthcare_encounters,
   marks pendings as completed, and updates page assignments. All operations succeed or fail together.
   Returns final encounter ID. (Migrations 52-57: various fixes, Migration 58: identity field extraction)';
```

**Critical Implementation Notes:**
1. Date normalization is REQUIRED - RPC casts to `::DATE` which needs ISO format (YYYY-MM-DD)
2. Must handle mixed date formats from AI: "November 14, 1965", "11/14/1965", etc.
3. `pickBestValue()` should prefer longest/most complete value
4. All writes MUST go through RPC - no direct Supabase inserts to healthcare_encounters

**Testing:**
1. Process 142-page document
2. Verify `healthcare_encounters.patient_full_name` = "Emma Thompson" (or best variant)
3. Verify `healthcare_encounters.patient_date_of_birth` = "1965-11-14" (ISO format)
4. Verify `healthcare_encounters.patient_address` = longest address from chunks
5. Verify `healthcare_encounters.chief_complaint` is populated

**Priority:** HIGH - Patient identity is critical clinical data

#### Issue #9: chief_complaint is NULL

**Severity:** LOW
**Impact:** Missing useful clinical context

**Root Cause:**
- Pending encounters have chief_complaint in encounter_data JSONB
- Not copied to final encounter during reconciliation

**Fix:** Included in Issue #8 fix (identity merging)

**Priority:** LOW - Nice to have, but not critical

---

## Table 8: pass05_encounter_metrics

**Record Count:** 1 record
**Table Purpose:** Aggregate metrics for the entire Pass 0.5 processing

### Column Analysis

| Column | Expected Value | Actual Value | Status | Notes |
|--------|---------------|--------------|--------|-------|
| **id** | UUID | `3ef27004...` | ✅ Correct | Metrics record ID |
| **patient_id** | Patient UUID | `d1dbe18c...` | ✅ Correct | Correct patient |
| **shell_file_id** | Shell file UUID | `cf622295...` | ✅ Correct | Correct document |
| **processing_session_id** | ai_processing_sessions.id | `018a52f2...` | ✅ Correct | Correct session (after Issue #2 fix) |
| **encounters_detected** | 1 | 0 | ❌ INCORRECT | Should be 1 (updated by RPC) |
| **real_world_encounters** | 1 | 0 | ❌ INCORRECT | Should be 1 (updated by RPC) |
| **pseudo_encounters** | 0 | 0 | ✅ Correct | No pseudo encounters (updated by RPC) |
| **processing_time_ms** | ~202k | 202,310 | ✅ Correct | Total processing time |
| **processing_time_seconds** | ~202 | "202.31" | ✅ Correct | Time in seconds |
| **ai_model_used** | "gemini-2.5-pro" | "gemini-2.5-pro" | ✅ Correct | Correct model |
| **input_tokens** | 127,283 | 0 | ❌ NOT UPDATED | Should be 127,283 (NOT in RPC scope) |
| **output_tokens** | 10,044 | 0 | ❌ NOT UPDATED | Should be 10,044 (NOT in RPC scope) |
| **total_tokens** | 137,327 | 0 | ❌ NOT UPDATED | Should be 137,327 (NOT in RPC scope) |
| **ocr_average_confidence** | ~0.97 | "0.97" | ✅ Correct | OCR confidence |
| **encounter_confidence_average** | ~1.00 | "0.00" | ❌ NOT UPDATED | Should be ~1.00 (NOT in RPC scope) |
| **encounter_types_found** | ["hospital_admission"] | [] | ❌ NOT UPDATED | Should have encounter type (NOT in RPC scope) |
| **total_pages** | 142 | 142 | ✅ Correct | Total pages |
| **created_at** | timestamp | `2025-11-20 21:15:50...` | ✅ Correct | Metrics creation |
| **planned_encounters** | 0 | 0 | ✅ Correct | No planned encounters |
| **ai_cost_usd** | ~$0.0125 | "0.012500" | ✅ Correct | Total AI cost |
| **pendings_total** | 3 | NULL | ❌ INCORRECT | Should be 3 (updated by RPC but showing NULL?) |
| **cascades_total** | 1 | NULL | ❌ INCORRECT | Should be 1 (updated by RPC but showing NULL?) |
| **orphans_total** | 0 | NULL | ⚠️ Expected | No orphans (updated by RPC) |
| **reconciliation_time_ms** | ~300ms | NULL | ❌ NOT UPDATED | Should have reconciliation time (NOT in RPC scope) |
| **reconciliation_method** | "cascade" | NULL | ❌ NOT UPDATED | Should be "cascade" (NOT in RPC scope) |
| **chunk_count** | 3 | NULL | ❌ INCORRECT | Should be 3 (updated by RPC but showing NULL?) |
| **avg_chunk_time_ms** | ~67k | NULL | ❌ NOT UPDATED | Average chunk processing time (NOT in RPC scope) |
| **max_chunk_time_ms** | ~98k | NULL | ❌ NOT UPDATED | Max chunk processing time (NOT in RPC scope) |
| **pages_with_multi_encounters** | 0 | NULL | ⚠️ Expected | No multi-encounter pages (NOT in RPC scope) |
| **position_confidence_avg** | ~1.00 | NULL | ❌ NOT UPDATED | Should be ~1.00 (NOT in RPC scope) |
| **encounters_with_patient_name** | 1 | 0 | ❌ NOT UPDATED | Should be 1 (NOT in RPC scope, also blocked by Issue #8) |
| **encounters_with_dob** | 1 | 0 | ❌ NOT UPDATED | Should be 1 (NOT in RPC scope, also blocked by Issue #8) |
| **encounters_with_provider** | 1 | 0 | ❌ NOT UPDATED | Should be 1 (NOT in RPC scope) |
| **encounters_with_facility** | 1 | 0 | ❌ NOT UPDATED | Should be 1 (NOT in RPC scope) |
| **encounters_high_quality** | 1 | 0 | ❌ NOT UPDATED | Should be 1 (NOT in RPC scope) |
| **encounters_low_quality** | 0 | 0 | ✅ Correct | No low quality encounters (NOT in RPC scope) |

### Issues Found

#### Issue #10: Metrics RPC Incomplete (HIGH PRIORITY)

**Severity:** HIGH (revised from CRITICAL)
**Impact:** Dashboard metrics incomplete - 16 of ~23 fields not populated

**Root Cause (CORRECTED):**
The `update_strategy_a_metrics` RPC function (Migration 57) works correctly for its designed scope, but only updates **7 fields**:
- encounters_detected, real_world_encounters, pseudo_encounters
- pendings_total, cascades_total, orphans_total, chunk_count

The remaining **~16 fields** were never added to the RPC function:
- Token counts (input_tokens, output_tokens, total_tokens)
- Quality metrics (encounter_confidence_average, encounter_types_found, encounters_with_*)
- Timing metrics (avg_chunk_time_ms, max_chunk_time_ms, reconciliation_time_ms)
- Position metrics (position_confidence_avg)

**Evidence from Code:**
```sql
-- From 08_job_coordination.sql:735-744
UPDATE pass05_encounter_metrics
SET
  encounters_detected = v_final_encounters_count,           -- ✅ Works
  real_world_encounters = v_real_world_count,              -- ✅ Works
  pseudo_encounters = v_pseudo_count,                      -- ✅ Works
  pendings_total = v_pendings_total,                       -- ✅ Works
  cascades_total = v_cascades_total,                       -- ✅ Works
  orphans_total = v_orphans_total,                         -- ✅ Works
  chunk_count = v_chunk_count                              -- ✅ Works
  -- MISSING: No updates for tokens, quality, timing, etc. -- ❌ Not implemented
WHERE id = v_metrics_id;
```

**Fix Plan: Extend RPC Function**

```sql
-- Location: shared/docs/architecture/database-foundation-v3/current_schema/08_job_coordination.sql
-- Replace existing update_strategy_a_metrics function (lines 694-750)

CREATE OR REPLACE FUNCTION update_strategy_a_metrics(
  p_shell_file_id UUID,
  p_session_id UUID  -- This is ai_processing_sessions.id (fixed in Issue #2)
) RETURNS VOID AS $$
DECLARE
  v_metrics_id UUID;

  -- Existing variables (Migration 57)
  v_pendings_total INTEGER;
  v_cascades_total INTEGER;
  v_orphans_total INTEGER;
  v_chunk_count INTEGER;
  v_final_encounters_count INTEGER;
  v_real_world_count INTEGER;
  v_pseudo_count INTEGER;

  -- NEW variables for extended metrics
  v_strategy_a_session_id UUID;
  v_total_input_tokens INTEGER;
  v_total_output_tokens INTEGER;
  v_total_tokens INTEGER;
  v_encounter_confidence_avg NUMERIC;
  v_encounter_types TEXT[];
  v_avg_chunk_time_ms NUMERIC;
  v_max_chunk_time_ms INTEGER;
  v_position_confidence_avg NUMERIC;
  v_encounters_with_name INTEGER;
  v_encounters_with_dob INTEGER;
  v_encounters_with_provider INTEGER;
  v_encounters_with_facility INTEGER;
  v_encounters_high_quality INTEGER;
BEGIN
  -- Get metrics record ID
  SELECT id INTO v_metrics_id
  FROM pass05_encounter_metrics
  WHERE shell_file_id = p_shell_file_id
    AND processing_session_id = p_session_id;

  IF v_metrics_id IS NULL THEN
    RAISE EXCEPTION 'No metrics record found for shell_file_id: %', p_shell_file_id;
  END IF;

  -- Get Strategy A session ID for querying Strategy A tables
  SELECT id INTO v_strategy_a_session_id
  FROM pass05_progressive_sessions
  WHERE shell_file_id = p_shell_file_id;

  -- EXISTING QUERIES (Migration 57 - works correctly)
  SELECT
    COUNT(*),
    COUNT(DISTINCT cascade_id) FILTER (WHERE cascade_id IS NOT NULL),
    COUNT(*) FILTER (WHERE status = 'pending'),
    (SELECT MAX(chunk_number) FROM pass05_chunk_results WHERE session_id = v_strategy_a_session_id)
  INTO v_pendings_total, v_cascades_total, v_orphans_total, v_chunk_count
  FROM pass05_pending_encounters
  WHERE session_id = v_strategy_a_session_id;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_real_world_visit = TRUE),
    COUNT(*) FILTER (WHERE is_real_world_visit = FALSE)
  INTO v_final_encounters_count, v_real_world_count, v_pseudo_count
  FROM healthcare_encounters
  WHERE source_shell_file_id = p_shell_file_id
    AND identified_in_pass = 'pass_0_5';

  -- NEW QUERY 1: Token counts from progressive session
  SELECT
    total_input_tokens,
    total_output_tokens,
    (total_input_tokens + total_output_tokens)
  INTO v_total_input_tokens, v_total_output_tokens, v_total_tokens
  FROM pass05_progressive_sessions
  WHERE id = v_strategy_a_session_id;

  -- NEW QUERY 2: Quality metrics from final encounters
  SELECT
    AVG(pass_0_5_confidence),
    ARRAY_AGG(DISTINCT encounter_type) FILTER (WHERE encounter_type IS NOT NULL),
    COUNT(*) FILTER (WHERE patient_full_name IS NOT NULL),
    COUNT(*) FILTER (WHERE patient_date_of_birth IS NOT NULL),
    COUNT(*) FILTER (WHERE provider_name IS NOT NULL),
    COUNT(*) FILTER (WHERE facility_name IS NOT NULL),
    COUNT(*) FILTER (WHERE data_quality_tier IN ('high', 'verified'))
  INTO
    v_encounter_confidence_avg,
    v_encounter_types,
    v_encounters_with_name,
    v_encounters_with_dob,
    v_encounters_with_provider,
    v_encounters_with_facility,
    v_encounters_high_quality
  FROM healthcare_encounters
  WHERE source_shell_file_id = p_shell_file_id
    AND identified_in_pass = 'pass_0_5';

  -- NEW QUERY 3: Timing metrics from chunk results
  SELECT
    AVG(processing_time_ms),
    MAX(processing_time_ms)
  INTO v_avg_chunk_time_ms, v_max_chunk_time_ms
  FROM pass05_chunk_results
  WHERE session_id = v_strategy_a_session_id;

  -- NEW QUERY 4: Position confidence average from pendings
  SELECT AVG(position_confidence::NUMERIC)
  INTO v_position_confidence_avg
  FROM pass05_pending_encounters
  WHERE session_id = v_strategy_a_session_id
    AND position_confidence IS NOT NULL;

  -- UPDATE: All metrics (existing + new)
  UPDATE pass05_encounter_metrics
  SET
    -- Existing (Migration 57)
    encounters_detected = v_final_encounters_count,
    real_world_encounters = v_real_world_count,
    pseudo_encounters = v_pseudo_count,
    pendings_total = v_pendings_total,
    cascades_total = v_cascades_total,
    orphans_total = v_orphans_total,
    chunk_count = v_chunk_count,

    -- NEW: Token counts
    input_tokens = v_total_input_tokens,
    output_tokens = v_total_output_tokens,
    total_tokens = v_total_tokens,

    -- NEW: Quality metrics
    encounter_confidence_average = v_encounter_confidence_avg,
    encounter_types_found = v_encounter_types,
    encounters_with_patient_name = v_encounters_with_name,
    encounters_with_dob = v_encounters_with_dob,
    encounters_with_provider = v_encounters_with_provider,
    encounters_with_facility = v_encounters_with_facility,
    encounters_high_quality = v_encounters_high_quality,

    -- NEW: Timing metrics
    avg_chunk_time_ms = v_avg_chunk_time_ms,
    max_chunk_time_ms = v_max_chunk_time_ms,

    -- NEW: Position metrics
    position_confidence_avg = v_position_confidence_avg
  WHERE id = v_metrics_id;

  RAISE NOTICE 'Updated metrics: % encounters (% real-world, % pseudo) from % pendings, % cascades, % chunks, % tokens',
    v_final_encounters_count, v_real_world_count, v_pseudo_count,
    v_pendings_total, v_cascades_total, v_chunk_count, v_total_tokens;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_strategy_a_metrics IS
  'Migration 57: Updates pass05_encounter_metrics after Strategy A reconciliation completes.
   Migration 58: Extended to populate all metrics fields including tokens, quality, timing, and position confidence.
   Populates pendings_total, cascades_total, chunk_count, token counts, quality metrics, timing metrics,
   and corrects encounter counts that were written as zeros before reconciliation.';
```

**Additional Considerations:**
- `reconciliation_time_ms` and `reconciliation_method` could be added by tracking timing in pending-reconciler.ts
- `pages_with_multi_encounters` may require additional analysis logic (not critical)

**Testing:**
1. Process 142-page document
2. Verify all metrics populated:
   - encounters_detected = 1 ✅
   - input_tokens = 127,283 ✅
   - output_tokens = 10,044 ✅
   - total_tokens = 137,327 ✅
   - encounter_confidence_average = ~1.00 ✅
   - encounter_types_found = ["hospital_admission"] ✅
   - pendings_total = 3 ✅
   - cascades_total = 1 ✅
   - chunk_count = 3 ✅
   - avg_chunk_time_ms = ~67k ✅
   - max_chunk_time_ms = ~98k ✅
   - encounters_with_provider = 1 ✅
   - encounters_with_facility = 1 ✅

**Priority:** HIGH - Dashboard showing incomplete data, but not completely broken

---

## Table 9-12: Identity & Classification Tables

**Tables:** healthcare_encounter_identifiers, pass05_pending_encounter_identifiers, profile_classification_audit, orphan_identities

**Record Count:** 0 records (EMPTY) for all tables
**Table Purpose:** Identity extraction and profile classification systems

### Analysis

**Is This Expected?** ✅ YES - Systems not yet implemented

**Evidence:**
- Table schemas exist in database (Migration 57, Files 10-12 from design doc)
- AI extracts identity data (MRN, insurance IDs) in chunk results
- Code does NOT copy identifiers to these tables
- This is **FUTURE WORK**, not a bug

**Example of Extracted Data (Not Saved):**
```json
// From pass05_chunk_results.ai_response_raw (chunk 1)
"medical_identifiers": [
  {
    "identifier_type": "MRN",
    "identifier_value": "E1453920",
    "issuing_organization": "Melbourne Health Network",
    "detected_context": "Patient - ID : E1453920"
  },
  {
    "identifier_type": "MRN",
    "identifier_value": "941345207",
    "issuing_organization": "St. Luke's Hospital",
    "detected_context": "MRN : 941345207"
  }
]
```

**Future Implementation Plan:**
1. Extract `medical_identifiers` from AI response during chunk processing
2. Insert into `pass05_pending_encounter_identifiers` table
3. During reconciliation, merge identifiers and insert into `healthcare_encounter_identifiers`
4. Implement profile classification logic to match identities to user profiles
5. Create orphan records for unmatched identities
6. Add audit trail entries to `profile_classification_audit`

**Priority:** LOW - Future feature, not blocking current functionality

---

## Summary of Issues

### HIGH Priority (Fix Immediately)

**Issue #10: Metrics RPC Incomplete**
- **Location:** Database function `update_strategy_a_metrics()` (08_job_coordination.sql:694-750)
- **Impact:** 16 of ~23 metrics fields not populated
- **Fix:** Extend RPC to query and populate: token counts, quality metrics, timing metrics, position confidence
- **Complexity:** Medium - Add 4 new queries to existing function

**Issue #8: Patient Identity Not Copied to Final Encounter**
- **Location:**
  - TypeScript: `apps/render-worker/src/pass05/progressive/pending-reconciler.ts:91-139`
  - Database: `08_job_coordination.sql:526-664` (reconcile_pending_to_final RPC)
- **Impact:** Final encounter missing patient name, DOB, address
- **Fix:**
  - Step 1: Add helper functions (pickBestValue, normalizeDateToISO) and merge identity in encounterData JSONB
  - Step 2: Extend RPC to extract identity fields from JSONB
- **Complexity:** Medium-High - Two-step process, date normalization required

### MEDIUM Priority (Fix Soon)

**Issue #5: total_cascades Counter Not Incremented**
- **Location:** `apps/render-worker/src/pass05/progressive/chunk-processor.ts:218-243`
- **Impact:** Session shows 0 cascades instead of actual count
- **Fix:** Create RPC function `increment_session_total_cascades()` and call after trackCascade()
- **Complexity:** Low - Simple counter increment

**Issue #6: Chunk Timestamps Missing (started_at, completed_at)**
- **Location:** `apps/render-worker/src/pass05/progressive/chunk-processor.ts` (AI call section)
- **Impact:** Cannot track exact AI API call timing per chunk
- **Fix:** Capture timestamps using Date.now() pattern, insert to chunk_results
- **Complexity:** Low - Add timestamp capture around AI call

### LOW Priority (Nice to Have)

**Issue #9: chief_complaint Not Copied**
- **Fix:** Included in Issue #8 fix (identity merging)

**Issue #7: Patient Identity Variations**
- **Status:** Expected behavior - demonstrates system working as designed
- **No fix needed** - Resolved by reconciliation

### Future Work (Not Bugs)

**Identity & Classification Tables (Issues Future-1 to Future-4)**
- **Tables:** healthcare_encounter_identifiers, pass05_pending_encounter_identifiers, profile_classification_audit, orphan_identities
- **Status:** Table schemas exist, implementation pending
- **Priority:** LOW - Part of future classification features (Files 10-12 from design doc)

**Reconciliation Log (Issue Future-5)**
- **Table:** pass05_reconciliation_log
- **Status:** Empty, may be for future audit trail
- **Priority:** LOW - Not blocking, useful for debugging

---

## Fix Implementation Order

### Phase 1: Critical Data Quality (Immediate)

**Migration 58: Extend Metrics RPC & Add Identity Extraction**

1. **Extend update_strategy_a_metrics RPC** (Issue #10)
   - Add token count queries from pass05_progressive_sessions
   - Add quality metrics queries from healthcare_encounters
   - Add timing metrics queries from pass05_chunk_results
   - Add position confidence query from pass05_pending_encounters
   - Update SET clause to populate all 16 additional fields

2. **Implement Identity Merging Helpers** (Issue #8 - Step 1)
   - Create `pickBestValue()` function in pending-reconciler.ts
   - Create `normalizeDateToISO()` function to handle date format variations
   - Add identity fields to encounterData JSONB object
   - Test date normalization with "November 14, 1965", "11/14/1965" formats

3. **Extend reconcile_pending_to_final RPC** (Issue #8 - Step 2)
   - Add identity columns to INSERT statement
   - Add identity field extraction from JSONB in SELECT
   - Update function comment to document change
   - Test with 142-page document

**Testing Checklist (Phase 1):**
- [ ] Metrics: encounters_detected = 1 (not 0)
- [ ] Metrics: real_world_encounters = 1 (not 0)
- [ ] Metrics: input_tokens = 127,283 (not 0)
- [ ] Metrics: output_tokens = 10,044 (not 0)
- [ ] Metrics: total_tokens = 137,327 (not 0)
- [ ] Metrics: encounter_confidence_average != 0
- [ ] Metrics: encounter_types_found = ["hospital_admission"]
- [ ] Metrics: pendings_total = 3 (not NULL)
- [ ] Metrics: cascades_total = 1 (not NULL)
- [ ] Metrics: chunk_count = 3 (not NULL)
- [ ] Metrics: avg_chunk_time_ms != NULL
- [ ] Metrics: max_chunk_time_ms != NULL
- [ ] Metrics: encounters_with_provider = 1
- [ ] Metrics: encounters_with_facility = 1
- [ ] Final encounter: patient_full_name = "Emma Thompson" (or best variant)
- [ ] Final encounter: patient_date_of_birth = "1965-11-14" (ISO format)
- [ ] Final encounter: patient_address != NULL
- [ ] Final encounter: chief_complaint != NULL

### Phase 2: Metrics Completeness (Next Sprint)

**Migration 59: Cascade Counter & Chunk Timestamps**

4. **Create Cascade Counter RPC** (Issue #5)
   - Create `increment_session_total_cascades(p_session_id UUID)` function
   - Add to 08_job_coordination.sql

5. **Call Counter from Chunk Processor** (Issue #5)
   - Update chunk-processor.ts trackCascade loop
   - Add RPC call after trackCascade()
   - Add error handling (non-blocking)

6. **Fix Chunk Timestamps** (Issue #6)
   - Capture startTime = Date.now() before AI call
   - Capture endTime = Date.now() after AI call
   - Convert to ISO strings for database storage
   - Insert started_at and completed_at to chunk_results record
   - Verify processingTimeMs = endTime - startTime

**Testing Checklist (Phase 2):**
- [ ] Session: total_cascades = 1 (not 0)
- [ ] Chunk results: started_at != NULL (all 3 chunks)
- [ ] Chunk results: completed_at != NULL (all 3 chunks)
- [ ] Chunk results: timestamps match processing_time_ms

### Phase 3: Future Features (Backlog)

7. **Implement Identity Extraction System** (Future Work)
   - Extract medical_identifiers from AI response
   - Populate pass05_pending_encounter_identifiers during chunk processing
   - Merge identifiers during reconciliation
   - Populate healthcare_encounter_identifiers
   - Implement profile classification matching
   - Create orphan identity records for unknowns
   - Add audit trail to profile_classification_audit

8. **Add Reconciliation Logging** (Future Work)
   - Insert records to pass05_reconciliation_log after each cascade reconciliation
   - Track reconciliation method, timing, and outcomes

---

## Architecture Compliance Notes

**Critical Architectural Constraints:**

1. **All healthcare_encounters writes MUST go through RPC**
   - Direct Supabase inserts are NOT allowed
   - Use `reconcile_pending_to_final(pending_ids, patient_id, shell_file_id, encounter_data JSONB)`
   - All data must be in JSONB parameter

2. **RPC functions are the source of truth for data consistency**
   - Atomic operations ensure data integrity
   - All related updates (pendings, page_assignments) happen in single transaction
   - Failed operations roll back completely

3. **JSONB parameter pattern**
   - All dynamic encounter data passed as JSONB to RPC
   - RPC extracts and casts fields to proper types
   - Allows flexible schema without RPC signature changes

4. **Date format requirements**
   - PostgreSQL `::DATE` cast requires ISO format (YYYY-MM-DD)
   - TypeScript must normalize dates before passing to RPC
   - Handle variations: "November 14, 1965", "11/14/1965", "1965-11-14"

---

## Conclusion

**Core System:** Working correctly - reconciliation successful (3 pendings → 1 final encounter, cascade tracking operational) ✅

**Data Quality:** Mixed results - reconciliation logic solid but data population incomplete:
- Identity data extracted but not merged to final encounter ❌
- Metrics partially populated (7 of ~23 fields) ⚠️
- Timestamps not captured ⚠️

**Next Steps:**
1. Create Migration 58: Extend metrics RPC, implement identity merging (HIGH priority)
2. Create Migration 59: Add cascade counter, fix timestamps (MEDIUM priority)
3. Plan identity/classification system implementation (FUTURE work)

**Key Lessons:**
- Verify actual code paths and architectural constraints before proposing fixes
- Distinguish between "broken" (incorrect implementation) vs "incomplete" (partial implementation)
- All healthcare_encounters writes must respect RPC architecture
- Test with actual document processing to verify fixes
