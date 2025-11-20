# Emergency Hotfix Plan - Pass 0.5 Critical Bugs

**Date Created:** 2025-11-10
**Status:** Pre-Launch - Safe to Fix Without User Impact
**Priority:** P0 (Catastrophic) + P1 (Critical) bugs must be fixed before launch

---

## Overview

5 production tests revealed 1 catastrophic bug and 4 critical bugs that make the system non-functional. Since we're pre-launch with no users, we can fix these systematically without rushing.

**Bugs to Fix:**
- P0: v2.10 progressive prompt returns zero encounters
- P1: Missing metrics table writes
- P1: Missing page assignments writes
- P1: Incomplete shell file finalization
- P1: No error handling on failures
- P2: v2.9 page range overlaps (optional, can improve later)

---

## Part 1: Emergency Disable v2.10 (IMMEDIATE)

**Why First:** Prevents silent failures on large documents
**Time:** 5 minutes
**Risk:** Low - just disables broken feature

### Files to Edit

**File:** `apps/render-worker/src/pass05/encounterDiscovery.ts`

**Location:** Around line 47-59 (where progressive mode check happens)

**Change:**
```typescript
// BEFORE (current code):
if (shouldUseProgressiveMode(input.pageCount)) {
    console.log(`[Pass 0.5] Document has ${input.pageCount} pages, using progressive mode`);
    const progressiveResult = await processDocumentProgressively(...);
    // ...
}

// AFTER (emergency disable):
if (shouldUseProgressiveMode(input.pageCount)) {
    throw new Error(
        `[Pass 0.5] PROGRESSIVE MODE DISABLED - v2.10 prompt returns zero encounters. ` +
        `Document has ${input.pageCount} pages which exceeds 100-page threshold. ` +
        `v2.10 investigation required before re-enabling. ` +
        `Temporary workaround: Manually split document or wait for v2.10 fix.`
    );
}
```

### Build and Deploy
```bash
cd apps/render-worker
pnpm run build
git add src/pass05/encounterDiscovery.ts dist/
git commit -m "EMERGENCY: Disable v2.10 progressive mode - returns zero encounters"
git push
```

### Validation
Upload a 101-page document and verify:
- [ ] Job fails with clear error message about progressive mode disabled
- [ ] Error message stored in shell_files.pass_0_5_error
- [ ] No silent failure (doesn't appear successful)

---

## Part 2: Add Missing Database Writes (CRITICAL)

**Why:** Core functionality - without this, no metrics or page assignments
**Time:** 30-45 minutes
**Risk:** Medium - adding new database writes

### Fix 2A: Add Metrics Table Write

**File:** `apps/render-worker/src/pass05/manifestBuilder.ts`

**Location:** After encounters are written (likely in `parseEncounterResponse` function)

**Add this code:**
```typescript
// After writing encounters to healthcare_encounters table
// ADD METRICS WRITE:

interface MetricsData {
  shell_file_id: string;
  patient_id: string;
  encounters_detected: number;
  real_world_encounters: number;
  pseudo_encounters: number;
  processing_time_ms: number;
  ai_model_used: string;
  input_tokens: number;
  output_tokens: number;
  ai_cost_usd: number;
  encounter_confidence_average: number;
  encounter_types_found: string[];
  total_pages: number;
  ocr_average_confidence: number;
}

// Calculate metrics
const realWorldCount = encounters.filter(e => e.is_real_world_visit).length;
const pseudoCount = encounters.filter(e => !e.is_real_world_visit).length;
const avgConfidence = encounters.length > 0
  ? encounters.reduce((sum, e) => sum + (e.pass_0_5_confidence || 0), 0) / encounters.length
  : 0;
const encounterTypes = [...new Set(encounters.map(e => e.encounter_type))];

const metricsData: MetricsData = {
  shell_file_id: shellFileId,
  patient_id: patientId,
  encounters_detected: encounters.length,
  real_world_encounters: realWorldCount,
  pseudo_encounters: pseudoCount,
  processing_time_ms: processingTimeMs, // Need to pass this in
  ai_model_used: aiModel, // Need to pass this in
  input_tokens: inputTokens, // Need to pass this in
  output_tokens: outputTokens, // Need to pass this in
  ai_cost_usd: aiCostUsd, // Need to pass this in
  encounter_confidence_average: avgConfidence,
  encounter_types_found: encounterTypes,
  total_pages: totalPages, // Need to pass this in
  ocr_average_confidence: ocrConfidence // Need to pass this in
};

const { error: metricsError } = await supabase
  .from('pass05_encounter_metrics')
  .insert(metricsData);

if (metricsError) {
  console.error('[Pass 0.5] Failed to write encounter metrics:', metricsError);
  throw new Error(`Failed to write encounter metrics: ${metricsError.message}`);
}

console.log(`[Pass 0.5] Wrote metrics: ${encounters.length} encounters, $${aiCostUsd} cost`);
```

**Function Signature Changes Needed:**

`parseEncounterResponse` likely needs additional parameters:
```typescript
async function parseEncounterResponse(
  aiResponse: string,
  ocrOutput: GoogleCloudVisionOCR,
  patientId: string,
  shellFileId: string,
  totalPages: number,
  // ADD THESE:
  processingTimeMs: number,
  aiModel: string,
  inputTokens: number,
  outputTokens: number,
  aiCostUsd: number,
  ocrConfidence: number
): Promise<ParsedEncounterResponse>
```

### Fix 2B: Add Page Assignments Write

**File:** `apps/render-worker/src/pass05/manifestBuilder.ts`

**Location:** Same place as metrics write (after encounters written)

**Add this code:**
```typescript
// After writing encounters and metrics
// ADD PAGE ASSIGNMENTS WRITE:

if (pageAssignments && pageAssignments.length > 0) {
  console.log(`[Pass 0.5] Writing ${pageAssignments.length} page assignments`);

  const assignmentsData = pageAssignments.map(pa => ({
    shell_file_id: shellFileId,
    page_num: pa.page,
    encounter_id: pa.encounter_id,
    justification: pa.justification
  }));

  const { error: assignmentsError } = await supabase
    .from('pass05_page_assignments')
    .insert(assignmentsData);

  if (assignmentsError) {
    console.error('[Pass 0.5] Failed to write page assignments:', assignmentsError);
    // Don't throw - page assignments are supplementary data
    // Log warning but continue
    console.warn('[Pass 0.5] Continuing despite page assignment write failure');
  } else {
    console.log(`[Pass 0.5] Successfully wrote ${pageAssignments.length} page assignments`);
  }
} else {
  console.log('[Pass 0.5] No page assignments in AI response (v2.3 feature not used)');
}
```

### Fix 2C: Add Shell File Finalization

**File:** `apps/render-worker/src/pass05/index.ts`

**Location:** End of `runPass05` function, after manifest is built

**Replace:**
```typescript
// CURRENT (incomplete):
// Just returns manifest, doesn't update shell file

// NEW (complete finalization):
return {
  success: true,
  manifest,
  processingTimeMs: Date.now() - startTime,
  aiCostUsd: encounterResult.aiCostUsd,
  aiModel: encounterResult.aiModel
};
```

**With:**
```typescript
const processingTimeMs = Date.now() - startTime;
const processingDuration = Math.floor(processingTimeMs / 1000);

// FINALIZE SHELL FILE
const { error: finalizeError } = await supabase
  .from('shell_files')
  .update({
    status: 'completed',
    processing_completed_at: new Date().toISOString(),
    pass_0_5_completed_at: new Date().toISOString(),
    processing_duration_seconds: processingDuration
  })
  .eq('id', input.shellFileId);

if (finalizeError) {
  console.error('[Pass 0.5] Failed to finalize shell file:', finalizeError);
  // Don't throw - encounters are already written, this is just status update
  console.warn('[Pass 0.5] Shell file finalization failed but encounters written successfully');
}

return {
  success: true,
  manifest,
  processingTimeMs,
  aiCostUsd: encounterResult.aiCostUsd,
  aiModel: encounterResult.aiModel
};
```

### Build and Deploy
```bash
cd apps/render-worker
pnpm run build

# Verify compiled code contains new table names
grep -r "pass05_encounter_metrics" dist/pass05/
grep -r "pass05_page_assignments" dist/pass05/

# Should see matches now (previously returned nothing)

git add src/pass05/ dist/
git commit -m "fix(pass05): Add metrics and page assignments database writes, finalize shell files"
git push
```

### Validation
Re-upload Test 1 (3-page file) and verify:
- [ ] `pass05_encounter_metrics` has 1 row with correct data
- [ ] `pass05_page_assignments` has 3 rows (pages 1, 2, 3)
- [ ] `shell_files.status = 'completed'`
- [ ] `shell_files.processing_completed_at` has timestamp
- [ ] `shell_files.pass_0_5_completed_at` has timestamp
- [ ] `shell_files.processing_duration_seconds` has value

---

## Part 3: Add Error Handling (CRITICAL)

**Why:** Failed jobs should update shell_files with error message
**Time:** 15 minutes
**Risk:** Low - just adding error handling

### File to Edit

**File:** `apps/render-worker/src/pass05/index.ts`

**Location:** Wrap entire `runPass05` function in try-catch

**Change:**
```typescript
export async function runPass05(input: Pass05Input): Promise<Pass05Output> {
  const startTime = Date.now();

  try {
    // ... existing code ...

  } catch (error) {
    console.error('[Pass 0.5] Unexpected error:', error);

    // UPDATE SHELL FILE WITH ERROR
    try {
      await supabase
        .from('shell_files')
        .update({
          status: 'failed',
          pass_0_5_error: error instanceof Error ? error.message : 'Unknown error',
          pass_0_5_completed: false,
          processing_completed_at: new Date().toISOString()
        })
        .eq('id', input.shellFileId);
    } catch (updateError) {
      console.error('[Pass 0.5] Failed to update shell file with error:', updateError);
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: Date.now() - startTime,
      aiCostUsd: 0,
      aiModel: 'n/a'
    };
  }
}
```

### Build and Deploy
```bash
cd apps/render-worker
pnpm run build
git add src/pass05/index.ts dist/
git commit -m "fix(pass05): Add error handling to update shell_files on failure"
git push
```

### Validation
Upload Test 2 (20-page file with overlap issue) and verify:
- [ ] Job fails as expected (page range overlap)
- [ ] `shell_files.status = 'failed'`
- [ ] `shell_files.pass_0_5_error` contains error message
- [ ] `shell_files.processing_completed_at` has timestamp
- [ ] File no longer stuck in "processing" limbo

---

## Part 4: Post-Hotfix Validation (MANDATORY)

After all hotfixes deployed, re-test all 5 documents:

### Test 1 (3 pages) - Expected: COMPLETE SUCCESS
- [ ] 1 encounter created
- [ ] 1 row in pass05_encounter_metrics
- [ ] 3 rows in pass05_page_assignments
- [ ] shell_files.status = 'completed'
- [ ] All timestamps populated

### Test 2 (20 pages) - Expected: GRACEFUL FAILURE
- [ ] 0 encounters (validation fails)
- [ ] shell_files.status = 'failed'
- [ ] shell_files.pass_0_5_error has clear message
- [ ] Not stuck in "processing"

### Test 3 (71 pages) - Expected: COMPLETE SUCCESS
- [ ] 3 encounters created
- [ ] 1 row in pass05_encounter_metrics
- [ ] 71 rows in pass05_page_assignments
- [ ] shell_files.status = 'completed'

### Test 4 (142 pages) - Expected: CLEAR ERROR
- [ ] Job fails with "progressive mode disabled" message
- [ ] shell_files.status = 'failed'
- [ ] shell_files.pass_0_5_error explains why
- [ ] Error message actionable for user

### Test 5 (219 pages) - Expected: CLEAR ERROR
- [ ] Same as Test 4
- [ ] Clear error about progressive mode

---

## Part 5: v2.10 Investigation (POST-HOTFIX)

**Priority:** P0 but can be done after hotfixes
**Why:** Need progressive mode for large documents eventually

### Investigation Steps

1. **Read v2.10 Prompt Files**
   ```bash
   cd apps/render-worker/src/pass05
   find . -name "*v2.10*" -o -name "*compositional*"
   # Read all v2.10-related files
   ```

2. **Compare with v2.9**
   - What's different in prompt structure?
   - Is JSON schema different?
   - Are instructions for chunked mode missing?

3. **Test v2.10 in Isolation**
   - Create standalone test script
   - Use 50 pages of OCR from Test 4
   - Send to v2.10 prompt directly
   - Examine raw AI response
   - Why does it return `{"encounters": []}`?

4. **Options After Investigation**
   - **Option A:** Fix v2.10 (if issue is simple)
   - **Option B:** Create v2.9-progressive (adapt v2.9 for chunking)
   - **Option C:** Abandon v2.10, use v2.9 for all documents (raise page limit)

### Create Investigation File
Document findings in: `04-fixes/fixes-applied/post-hotfix-v2.10-investigation.md`

---

## Part 6: v2.9 Prompt Improvement (OPTIONAL)

**Priority:** P2 - Can wait
**Why:** Reduce page range overlap failures

### File to Edit

**File:** `apps/render-worker/src/pass05/aiPrompts.v2.9.ts`

**Change:** Add explicit non-overlapping constraint section

**Location:** Early in prompt, in CRITICAL RULES section

**Add:**
```typescript
**CRITICAL PHASE 1 CONSTRAINT - NON-OVERLAPPING PAGE RANGES:**

Each page MUST be assigned to EXACTLY ONE encounter. Page ranges MUST NEVER overlap.

✅ CORRECT Examples:
- Encounter 1: pages [1,3], Encounter 2: pages [4,7]
- Encounter 1: pages [1,10], Encounter 2: pages [11,15]

❌ INCORRECT Examples:
- Encounter 1: pages [1,4], Encounter 2: pages [4,7] ← Page 4 overlaps!
- Encounter 1: pages [1,5], Encounter 2: pages [3,8] ← Pages 3,4,5 overlap!

Handling Edge Cases:
- Transition pages (between encounters) → Assign to encounter they INTRODUCE
- Summary pages → Assign to encounter they SUMMARIZE
- Mixed content pages → Assign to encounter with MOST content on that page
- Continuation pages → Assign to the encounter being CONTINUED

If unsure which encounter owns a page, assign to the PRIMARY encounter and note uncertainty in confidence score.
```

### Validation
Re-test Test 2 (20-page file) and verify:
- [ ] No page range overlap error
- [ ] Encounters created successfully
- [ ] Page ranges valid and complete

---

## Deployment Checklist

### Before Each Deploy
- [ ] Run TypeScript compilation: `pnpm run build`
- [ ] Verify dist/ directory updated (check file timestamps)
- [ ] Grep verify new code in dist/: `grep "pass05_encounter_metrics" dist/pass05/`
- [ ] Git status shows both src/ and dist/ changes
- [ ] Commit message descriptive

### After Each Deploy
- [ ] Wait for Render.com auto-deploy (check dashboard)
- [ ] Check Render logs for startup errors
- [ ] Run validation test for that fix
- [ ] Document results in fixes-applied/

### Final Validation (All Fixes)
- [ ] All 5 tests run successfully or fail gracefully
- [ ] No silent failures
- [ ] All database tables populated correctly
- [ ] No files stuck in "processing"
- [ ] Error messages helpful and actionable

---

## Timeline Estimate (Pre-Launch)

Since no users affected, can take methodical approach:

**Day 1: Emergency Disable (1 hour)**
- Disable v2.10
- Deploy
- Test

**Day 2: Database Writes (2-3 hours)**
- Add metrics write
- Add page assignments write
- Add finalization
- Deploy
- Comprehensive testing

**Day 3: Error Handling + Validation (2 hours)**
- Add error handling
- Deploy
- Re-test all 5 documents
- Document results

**Day 4-5: v2.10 Investigation (4-8 hours)**
- Read v2.10 code
- Test in isolation
- Determine fix strategy
- Implement fix or workaround
- Test with 142-page and 219-page documents

**Day 6: v2.9 Improvements (2 hours, optional)**
- Improve non-overlapping instructions
- Test with problematic documents

**Total: 1-2 weeks** for thorough fix + testing + documentation

---

## Success Criteria

### System is Production-Ready When:
- [ ] Tests 1 & 3 succeed completely (encounters + metrics + page assignments)
- [ ] Test 2 fails gracefully with clear error message
- [ ] Tests 4 & 5 either succeed (v2.10 fixed) or fail gracefully (progressive disabled)
- [ ] All database tables populated correctly
- [ ] No files stuck in "processing"
- [ ] Cost tracking working (metrics table)
- [ ] Page assignments working (v2.3 feature)
- [ ] Error messages helpful
- [ ] Documentation updated

### Ready to Enable Progressive Mode When:
- [ ] v2.10 investigation complete
- [ ] v2.10 fixed OR v2.9-progressive created
- [ ] Tests 4 & 5 produce encounters (not zero)
- [ ] Handoffs meaningful between chunks
- [ ] Pending encounters reconciled correctly
- [ ] Total cost reasonable (<$1 for 200-page document)

---

## Next Steps

1. Review this plan
2. Execute Part 1 (disable v2.10)
3. Execute Part 2 (database writes)
4. Execute Part 3 (error handling)
5. Validate all fixes with 5 tests
6. Investigate v2.10 (Part 5)
7. Decide on progressive mode strategy
8. Update documentation
9. Mark system as production-ready
