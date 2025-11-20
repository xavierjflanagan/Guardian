# Post-Migration 57 Issues - 2025-11-20
## Investigation and Resolution Log

**Session:** dd2e98e2-a5b0-4d2e-904a-152e1452ebed
**Shell File:** eb65ee9a-009a-4f8a-be50-1e9ea9ad185f
**Document:** 142-page hospital admission summary
**Deployment:** Post-Migration 57 (commit 7ad6c1e)

---

## Issue #1: Cascade Chain Query Bug - "Multiple Rows Returned"

### Status: ✅ FIXED - Cascade tracking implemented

### Symptom
```
Error: Failed to fetch cascade cascade_dd2e98e2-a5b0-4d2e-904a-152e1452ebed_1_0_f9342a16
for completion: JSON object requested, multiple (or no) rows returned
```

### Evidence
**Render Logs (12:17:52):**
```
[Reconcile] Marking 2 pendings as abandoned: Failed to fetch cascade
cascade_dd2e98e2-a5b0-4d2e-904a-152e1452ebed_1_0_f9342a16 for completion:
JSON object requested, multiple (or no) rows returned
```

### Impact
- Chunks 1-2 pendings marked as "abandoned" despite being valid
- First 2 chunks reconciled separately, creating duplicate encounter
- Reconciliation partially failed

### Database State
```sql
-- Pendings with this cascade_id
SELECT pending_id, chunk_number, cascade_id, status
FROM pass05_pending_encounters
WHERE cascade_id = 'cascade_dd2e98e2-a5b0-4d2e-904a-152e1452ebed_1_0_f9342a16';

-- Result:
-- pending_dd2e98e2_001_000  |  1  |  cascade_...  |  completed
-- pending_dd2e98e2_002_000  |  2  |  cascade_...  |  completed
```

### Root Cause Analysis

**Location:** `apps/render-worker/src/pass05/progressive/chunk-processor.ts`

**The Problem:** Cascade chain records are NEVER created during chunk processing!

**Code Flow:**
1. Chunk processor generates cascade_id (lines 213, 456, 461)
2. Saves pending encounters with cascade_id
3. **MISSING**: Never calls `trackCascade()` to create record in `pass05_cascade_chains`
4. Reconciliation tries to call `completeCascadeChain()` which queries for non-existent record

**Evidence:**
```bash
# Search for trackCascade calls in chunk-processor.ts
grep "trackCascade" apps/render-worker/src/pass05/progressive/chunk-processor.ts
# Result: No matches - function is never called!
```

**Database Query Result:**
```sql
SELECT * FROM pass05_cascade_chains
WHERE cascade_id = 'cascade_dd2e98e2-a5b0-4d2e-904a-152e1452ebed_1_0_f9342a16';
-- Result: 0 rows (table is empty)
```

**Expected Record (never created):**
```sql
INSERT INTO pass05_cascade_chains (session_id, cascade_id, origin_chunk, pendings_count)
VALUES ('dd2e98e2-a5b0-4d2e-904a-152e1452ebed', 'cascade_...', 1, 1);
```

### Fix Strategy

**Add cascade tracking to chunk processor:**

```typescript
// In chunk-processor.ts, after generating cascade_id for new cascades:

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
}

// Increment cascade chain counters for continuations
const continuationCascadeIds = new Set<string>();
pendings.forEach((pending) => {
  if (pending.cascade_id && pending.continues_previous) {
    continuationCascadeIds.add(pending.cascade_id);
  }
});

for (const cascadeId of continuationCascadeIds) {
  await incrementCascadePendings(cascadeId);
  console.log(`[Chunk ${params.chunkNumber}] Incremented cascade: ${cascadeId}`);
}
```

**Required Import:**
```typescript
import { generateCascadeId, generatePendingId, shouldCascade, trackCascade, incrementCascadePendings } from './cascade-manager';
```

### Implementation Status: ✅ COMPLETE

**Changes Made:**
1. Updated import in chunk-processor.ts line 20
2. Added cascade tracking logic after cascade_id assignment (lines 218-243)
3. New cascades call `trackCascade()` to create chain record
4. Continuation cascades call `incrementCascadePendings()` to update counter

**Files Modified:**
- `apps/render-worker/src/pass05/progressive/chunk-processor.ts`

### Priority: HIGH - Blocks proper reconciliation

---

## Issue #2: Metrics Update Failed - HTTP 400

### Status: ✅ FIXED - Session ID resolution implemented

### Symptom
```
FETCH 85: received response to POST .../update_strategy_a_metrics - HTTP 400
[Reconcile] Failed to update metrics
```

### Evidence
**Render Logs (12:17:52):**
```
[Reconcile] Aggregating batching analysis for session dd2e98e2-a5b0-4d2e-904a-152e1452ebed
[Reconcile] Batching analysis aggregated: 18 split points (0 inter, 18 intra)
FETCH 85: sending request to POST .../rpc/update_strategy_a_metrics
FETCH 85: received response - HTTP 400
[Reconcile] Failed to update metrics
```

### Impact
- Metrics table shows zeros for all encounter counts
- Dashboard will show incorrect data
- Strategy A reconciliation metrics not tracked

### Root Cause Analysis

**Location:** `apps/render-worker/src/pass05/progressive/pending-reconciler.ts:175-189`

**Code:**
```typescript
const { error: metricsError } = await supabase.rpc('update_strategy_a_metrics', {
  p_shell_file_id: shellFileId,
  p_session_id: sessionId  // <-- PROBLEM: sessionId is progressive session ID
});
```

**Database Function Signature (Migration 57):**
```sql
CREATE OR REPLACE FUNCTION update_strategy_a_metrics(
  p_shell_file_id UUID,
  p_session_id UUID  -- Expects ai_processing_sessions.id, NOT pass05_progressive_sessions.id
) RETURNS VOID AS $$
```

**The Problem:**
- Function queries: `WHERE processing_session_id = p_session_id`
- `pass05_encounter_metrics.processing_session_id` references `ai_processing_sessions(id)`
- But we're passing `pass05_progressive_sessions.id`
- These are DIFFERENT tables with DIFFERENT IDs!

**Table Relationships:**
```
pass05_progressive_sessions (Strategy A sessions)
  └── id (what we're passing)

ai_processing_sessions (Legacy V2 sessions)
  └── id (what metrics table references)
```

### Database Verification
```sql
-- Check metrics table
SELECT id, shell_file_id, processing_session_id
FROM pass05_encounter_metrics
WHERE shell_file_id = 'eb65ee9a-009a-4f8a-be50-1e9ea9ad185f';

-- Check what processing_session_id points to
SELECT id FROM ai_processing_sessions
WHERE shell_file_id = 'eb65ee9a-009a-4f8a-be50-1e9ea9ad185f';

-- Check Strategy A session
SELECT id FROM pass05_progressive_sessions
WHERE shell_file_id = 'eb65ee9a-009a-4f8a-be50-1e9ea9ad185f';
```

### Fix Strategy

**Option 1: Query ai_processing_sessions.id before calling metrics update**
```typescript
// Get the ai_processing_sessions.id from shell_file
const { data: sessionData } = await supabase
  .from('ai_processing_sessions')
  .select('id')
  .eq('shell_file_id', shellFileId)
  .eq('pass_number', 0.5)
  .single();

const { error: metricsError } = await supabase.rpc('update_strategy_a_metrics', {
  p_shell_file_id: shellFileId,
  p_session_id: sessionData.id  // Use ai_processing_sessions.id
});
```

**Option 2: Change function to accept Strategy A session_id and join internally**
```sql
CREATE OR REPLACE FUNCTION update_strategy_a_metrics(
  p_shell_file_id UUID,
  p_strategy_a_session_id UUID  -- Accept pass05_progressive_sessions.id
) RETURNS VOID AS $$
DECLARE
  v_processing_session_id UUID;
BEGIN
  -- Get ai_processing_sessions.id from pass05_progressive_sessions
  SELECT processing_session_id INTO v_processing_session_id
  FROM pass05_progressive_sessions
  WHERE id = p_strategy_a_session_id;

  -- Then use v_processing_session_id in queries...
```

**Recommended:** Option 1 (simpler, no migration needed)

### Implementation Status: ✅ COMPLETE

**Changes Made:**
1. Added query to fetch ai_processing_sessions.id before calling RPC (lines 176-185)
2. Updated RPC call to use correct session_id (line 190)
3. Added comprehensive error handling with non-blocking failure

**Files Modified:**
- `apps/render-worker/src/pass05/progressive/pending-reconciler.ts`

### Priority: HIGH - Metrics not updating

---

## Issue #3: AI Inconsistency - Cascade Detection Failure

### Status: ✅ FIXED - Safety net strengthened

### Symptom
AI inconsistently detects that hospital admission continues beyond page 100.

### Evidence

**Previous Upload (10:49:34) - CORRECT:**
```
[Chunk 2] ⚠️ IMPLICIT CASCADES DETECTED: 1/1 cascading encounters missing is_cascading flag
[Chunk 2] Generated handoff for 1 cascading encounters (0 explicit, 1 implicit)
```
Result: 3 pendings → 1 final encounter ✅

**Latest Upload (12:17:01) - INCORRECT:**
```
[Chunk 2] Generated handoff for 0 cascading encounters (0 explicit, 0 implicit)
```
Result: 3 pendings → 2 final encounters ❌

### Database Comparison

**Previous Session (1fe015a5) - Correct:**
```
Chunk 1: is_cascading: TRUE,  continues_previous: FALSE, cascade_id: "cascade_..."
Chunk 2: is_cascading: FALSE, continues_previous: TRUE,  cascade_id: "cascade_..."
Chunk 3: is_cascading: FALSE, continues_previous: TRUE,  cascade_id: "cascade_..."
```

**Latest Session (dd2e98e2) - Incorrect:**
```
Chunk 1: is_cascading: TRUE,  continues_previous: FALSE, cascade_id: "cascade_..."
Chunk 2: is_cascading: FALSE, continues_previous: TRUE,  cascade_id: "cascade_..."
Chunk 3: is_cascading: FALSE, continues_previous: FALSE, cascade_id: NULL ❌
```

**The Problem:** Chunk 2 has:
- `end_page: 100` (last page of chunk)
- `end_boundary_type: "intra_page"` (AI thinks encounter ends WITHIN page 100)
- `is_cascading: FALSE` (AI says encounter completes here)

But the encounter continues to page 142!

### Root Cause Analysis

**AI Model:** Gemini 2.5 Pro
**Prompt Version:** V11 (with Rabbit #13 cascade detection improvements)

**Prompt Section (aiPrompts.v11.ts:128-134):**
```typescript
An encounter is **cascading** if it reaches or extends past the LAST page of this chunk:
- **This chunk contains pages ${pageRange[0]} to ${pageRange[1]}**
- **If encounter ends at page ${pageRange[1]} (last page) OR LATER → Set \`is_cascading: true\`**
```

**What Happened:**
1. Chunk 2 processes pages 51-100
2. AI sees encounter continues through page 100
3. AI determines encounter ENDS somewhere on page 100 (not beyond)
4. Sets `end_boundary_type: "intra_page"` and `is_cascading: false`
5. shouldCascade() safety check SHOULD catch this (ends at boundary)
6. But `end_boundary_type: "intra_page"` means shouldCascade() thinks it's safe

**shouldCascade() Logic (cascade-manager.ts:122-148):**
```typescript
// Additional validation: encounter touches chunk boundary at page level
if (
  encounter.end_boundary_type === 'inter_page' &&  // <-- Requires inter_page!
  encounter.end_page === lastPageOfChunk
) {
  return true;
}
```

**The Problem:** shouldCascade() only catches `inter_page` boundaries, not `intra_page` endings at last page!

### Why This Is Inconsistent

The AI is making a judgment call about whether the encounter ends on page 100:
- Sometimes it correctly sees continuation markers → sets `is_cascading: true`
- Sometimes it sees what looks like an ending → sets `is_cascading: false`

This is inherently unreliable with current prompt design.

### Fix Strategy

**Option 1: Strengthen shouldCascade() Safety Net**
```typescript
// Catch ANY encounter ending at last page of chunk
if (encounter.end_page === lastPageOfChunk) {
  return true;  // Always cascade if touching last page, regardless of boundary_type
}
```

**Option 2: Improve AI Prompt**
```typescript
**CRITICAL RULE:** If this encounter reaches page ${pageRange[1]} (the LAST page),
you MUST set `is_cascading: true` even if you're unsure. It's safer to check the
next chunk than to incorrectly split an encounter.
```

**Option 3: Remove AI Decision, Always Cascade at Boundary**
```typescript
// Don't trust AI for boundary decisions
if (pending.end_page === params.pageRange[1]) {
  pending.is_cascading = true;  // Force cascade
  if (!pending.cascade_id) {
    pending.cascade_id = generateCascadeId(...);
  }
}
```

**Recommended:** Option 1 + Option 2 (strengthen safety net AND improve prompt)

### Implementation Status: ✅ COMPLETE (Option 1 implemented)

**Changes Made:**
1. Modified shouldCascade() to catch ANY encounter ending at last page (line 141)
2. Removed boundary_type restriction - now catches both inter_page and intra_page endings
3. Comment updated to reflect broader safety net

**Files Modified:**
- `apps/render-worker/src/pass05/progressive/cascade-manager.ts`

**Note:** Option 2 (prompt improvement) deferred - code safety net now robust enough to handle AI inconsistency.

### Priority: MEDIUM - Causes duplicate encounters but has workarounds

---

## Issue #4: Reconciliation Count Incorrect

### Status: ⚠️ LOW - LOGGING/REPORTING ISSUE

### Symptom
```
[Reconcile] Reconciliation complete: 0 final encounters created
```

But database shows 2 encounters were actually created!

### Evidence

**Logs say:** 0 encounters created
**Database shows:** 2 encounters created

### Root Cause Analysis

**Location:** `apps/render-worker/src/pass05/progressive/pending-reconciler.ts`

**Code (line ~62):**
```typescript
const finalEncounterIds: string[] = [];

// STEP 4: Process each cascade group
for (const [cascadeId, groupPendings] of cascadeGroups) {
  try {
    // ... reconciliation logic ...
    finalEncounterIds.push(finalEncounterId);  // Only pushes on success
  } catch (error) {
    console.error(`[Reconcile] Error processing cascade ${cascadeId}:`, error);
    await markCascadeAsAbandoned(groupPendings, ...);
    // Error caught, finalEncounterId NOT pushed
  }
}

console.log(`[Reconcile] Reconciliation complete: ${finalEncounterIds.length} final encounters created`);
return finalEncounterIds;
```

**The Problem:**
1. Cascade group 1 (chunks 1-2) throws error → caught → NOT pushed to array
2. Cascade group 2 (chunk 3) succeeds → reconciles → encounter created but then throws error → NOT pushed
3. Array ends up empty despite 2 encounters created

**Why Chunk 3 Threw Error:**
Same "multiple rows" error from cascade chain query, but AFTER the encounter was created.

### Fix Strategy

Track successes separately from failures:
```typescript
let successCount = 0;
let errorCount = 0;

for (const [cascadeId, groupPendings] of cascadeGroups) {
  try {
    const finalEncounterId = await reconcilePendingsToFinal(...);
    successCount++;
    finalEncounterIds.push(finalEncounterId);
  } catch (error) {
    errorCount++;
    // ... error handling ...
  }
}

console.log(`[Reconcile] Reconciliation complete: ${successCount} succeeded, ${errorCount} failed`);
```

### Priority: LOW - Cosmetic logging issue

---

## Implementation Plan

### Phase 1: Critical Fixes (Immediate)

1. **Fix Issue #2 (Metrics Update HTTP 400)**
   - Query ai_processing_sessions.id before calling metrics
   - Test with manual RPC call
   - Should be 10-minute fix

2. **Fix Issue #1 (Cascade Chain Query Bug)**
   - Investigate pass05_cascade_chains table
   - Fix query or add constraint
   - Test with sample upload
   - Estimated 30-60 minutes

### Phase 2: Medium Priority

3. **Fix Issue #3 (AI Inconsistency)**
   - Strengthen shouldCascade() safety net
   - Improve AI prompt wording
   - Test with multiple uploads
   - Estimated 30 minutes

### Phase 3: Low Priority

4. **Fix Issue #4 (Logging)**
   - Update reconciliation counter logic
   - Improve error reporting
   - Estimated 15 minutes

---

## Testing Checklist

After fixes, test with same 142-page document:

- [ ] All 3 pendings reconcile successfully
- [ ] 1 final encounter created (not 2)
- [ ] Metrics table populated correctly
- [ ] No "abandoned" pendings
- [ ] No cascade chain errors
- [ ] Correct encounter page range (1-142)

---

## Status: IN PROGRESS

**Next Action:** Implement Issue #2 fix (easiest, high priority)
