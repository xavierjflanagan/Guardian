# Implementation Checklist - Pass 0.5 Hotfixes

**Status:** Pre-Launch
**Total Bugs:** 6 (1 P0, 4 P1, 1 P2)
**Estimated Time:** 1-2 weeks

---

## Hotfix 1: Disable v2.10 Progressive Mode

**Priority:** P0 - CATASTROPHIC
**Time:** 5 minutes
**Risk:** Low

### Tasks
- [ ] Open `apps/render-worker/src/pass05/encounterDiscovery.ts`
- [ ] Find line ~47-59 (progressive mode check)
- [ ] Replace `processDocumentProgressively()` call with `throw new Error()`
- [ ] Error message should explain v2.10 is broken
- [ ] Save file

### Build & Deploy
- [ ] `cd apps/render-worker`
- [ ] `pnpm run build`
- [ ] Verify dist/ updated: `ls -la dist/pass05/encounterDiscovery.js`
- [ ] `git add src/pass05/encounterDiscovery.ts dist/`
- [ ] `git commit -m "EMERGENCY: Disable v2.10 progressive mode - returns zero encounters"`
- [ ] `git push`
- [ ] Wait for Render.com auto-deploy
- [ ] Check Render logs for successful deploy

### Validation
- [ ] Upload 101-page test document
- [ ] Verify job fails with clear error message
- [ ] Check `shell_files.pass_0_5_error` contains message
- [ ] Verify no silent failure

**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

---

## Hotfix 2A: Add Metrics Table Write

**Priority:** P1 - CRITICAL
**Time:** 20 minutes
**Risk:** Medium

### Tasks
- [ ] Open `apps/render-worker/src/pass05/manifestBuilder.ts`
- [ ] Find `parseEncounterResponse` function
- [ ] Locate where encounters are written to `healthcare_encounters`
- [ ] Add metrics calculation code after encounter writes
- [ ] Add `supabase.from('pass05_encounter_metrics').insert()` call
- [ ] Add error handling for metrics write failure
- [ ] Add console.log for success/failure

### Function Signature Updates
- [ ] Update `parseEncounterResponse` parameters to include:
  - [ ] `processingTimeMs: number`
  - [ ] `aiModel: string`
  - [ ] `inputTokens: number`
  - [ ] `outputTokens: number`
  - [ ] `aiCostUsd: number`
  - [ ] `ocrConfidence: number`
- [ ] Update call sites to pass new parameters

### Code to Add
```typescript
// Calculate metrics
const realWorldCount = encounters.filter(e => e.is_real_world_visit).length;
const pseudoCount = encounters.filter(e => !e.is_real_world_visit).length;
const avgConfidence = encounters.length > 0
  ? encounters.reduce((sum, e) => sum + (e.pass_0_5_confidence || 0), 0) / encounters.length
  : 0;
const encounterTypes = [...new Set(encounters.map(e => e.encounter_type))];

const { error: metricsError } = await supabase
  .from('pass05_encounter_metrics')
  .insert({
    shell_file_id: shellFileId,
    patient_id: patientId,
    encounters_detected: encounters.length,
    real_world_encounters: realWorldCount,
    pseudo_encounters: pseudoCount,
    processing_time_ms: processingTimeMs,
    ai_model_used: aiModel,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    ai_cost_usd: aiCostUsd,
    encounter_confidence_average: avgConfidence,
    encounter_types_found: encounterTypes,
    total_pages: totalPages,
    ocr_average_confidence: ocrConfidence
  });

if (metricsError) {
  console.error('[Pass 0.5] Failed to write metrics:', metricsError);
  throw new Error(`Failed to write metrics: ${metricsError.message}`);
}
```

**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

---

## Hotfix 2B: Add Page Assignments Write

**Priority:** P1 - CRITICAL
**Time:** 15 minutes
**Risk:** Medium

### Tasks
- [ ] Same file: `apps/render-worker/src/pass05/manifestBuilder.ts`
- [ ] Same location: After metrics write
- [ ] Add page assignments write code
- [ ] Handle case where `pageAssignments` is undefined/empty
- [ ] Add error handling (non-fatal - just warn)
- [ ] Add console.log for success/skip

### Code to Add
```typescript
if (pageAssignments && pageAssignments.length > 0) {
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
    console.warn('[Pass 0.5] Continuing despite page assignment failure');
  } else {
    console.log(`[Pass 0.5] Wrote ${pageAssignments.length} page assignments`);
  }
} else {
  console.log('[Pass 0.5] No page assignments to write');
}
```

**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

---

## Hotfix 2C: Add Shell File Finalization

**Priority:** P1 - CRITICAL
**Time:** 10 minutes
**Risk:** Low

### Tasks
- [ ] Open `apps/render-worker/src/pass05/index.ts`
- [ ] Find end of `runPass05` function (before final return)
- [ ] Calculate `processingDuration`
- [ ] Add `supabase.from('shell_files').update()` call
- [ ] Update: status, processing_completed_at, pass_0_5_completed_at, processing_duration_seconds
- [ ] Add error handling (non-fatal - just warn)
- [ ] Save file

### Code to Add
```typescript
const processingTimeMs = Date.now() - startTime;
const processingDuration = Math.floor(processingTimeMs / 1000);

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
  console.warn('[Pass 0.5] Encounters written but status update failed');
}
```

**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

---

## Hotfix 2: Build & Deploy (All Database Writes)

### Build
- [ ] `cd apps/render-worker`
- [ ] `pnpm run build`
- [ ] Verify compiled code contains new tables:
  - [ ] `grep -r "pass05_encounter_metrics" dist/pass05/` (should find matches)
  - [ ] `grep -r "pass05_page_assignments" dist/pass05/` (should find matches)

### Deploy
- [ ] `git add src/pass05/manifestBuilder.ts src/pass05/index.ts dist/`
- [ ] `git status` (verify both src and dist changed)
- [ ] `git commit -m "fix(pass05): Add metrics, page assignments, and shell file finalization"`
- [ ] `git push`
- [ ] Wait for Render.com deploy
- [ ] Check Render logs for errors

### Validation (Test 1: 3 pages)
- [ ] Re-upload Test 1 document
- [ ] Query: `SELECT * FROM pass05_encounter_metrics WHERE shell_file_id = 'TEST_1_ID'`
  - [ ] Verify 1 row exists
  - [ ] Verify encounters_detected = 1
  - [ ] Verify ai_model_used populated
  - [ ] Verify costs/tokens populated
- [ ] Query: `SELECT COUNT(*) FROM pass05_page_assignments WHERE shell_file_id = 'TEST_1_ID'`
  - [ ] Verify count = 3 (pages 1, 2, 3)
- [ ] Query: `SELECT status, pass_0_5_completed_at, processing_completed_at, processing_duration_seconds FROM shell_files WHERE id = 'TEST_1_ID'`
  - [ ] Verify status = 'completed'
  - [ ] Verify pass_0_5_completed_at IS NOT NULL
  - [ ] Verify processing_completed_at IS NOT NULL
  - [ ] Verify processing_duration_seconds > 0

**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

---

## Hotfix 3: Add Error Handling

**Priority:** P1 - CRITICAL
**Time:** 10 minutes
**Risk:** Low

### Tasks
- [ ] Open `apps/render-worker/src/pass05/index.ts`
- [ ] Wrap entire `runPass05` function body in try-catch
- [ ] In catch block: update shell_files with error
- [ ] Set status = 'failed', pass_0_5_error = error message
- [ ] Add nested try-catch for shell file update (in case that fails too)
- [ ] Return failure response
- [ ] Save file

### Code to Add
```typescript
export async function runPass05(input: Pass05Input): Promise<Pass05Output> {
  const startTime = Date.now();

  try {
    // ... existing code ...

  } catch (error) {
    console.error('[Pass 0.5] Unexpected error:', error);

    // Update shell file with error
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

### Build & Deploy
- [ ] `cd apps/render-worker`
- [ ] `pnpm run build`
- [ ] `git add src/pass05/index.ts dist/`
- [ ] `git commit -m "fix(pass05): Add error handling to update shell_files on failure"`
- [ ] `git push`
- [ ] Wait for Render.com deploy

### Validation (Test 2: 20 pages with overlap)
- [ ] Re-upload Test 2 document (should fail with page range overlap)
- [ ] Query: `SELECT status, pass_0_5_error, pass_0_5_completed FROM shell_files WHERE id = 'TEST_2_ID'`
  - [ ] Verify status = 'failed'
  - [ ] Verify pass_0_5_error contains "Page range overlap" message
  - [ ] Verify pass_0_5_completed = FALSE
  - [ ] Verify NOT stuck in "processing"

**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

---

## Comprehensive Re-Testing (All 5 Tests)

### Test 1: 3 Pages, Standard Mode
**Expected:** COMPLETE SUCCESS

- [ ] Upload document
- [ ] Wait for processing
- [ ] Query shell_files:
  - [ ] status = 'completed'
  - [ ] pass_0_5_completed = TRUE
  - [ ] pass_0_5_version = 'v2.9'
  - [ ] pass_0_5_progressive = FALSE
  - [ ] pass_0_5_completed_at NOT NULL
  - [ ] processing_completed_at NOT NULL
  - [ ] processing_duration_seconds > 0
- [ ] Query healthcare_encounters:
  - [ ] COUNT = 1
  - [ ] encounter_type = 'pseudo_admin_summary'
- [ ] Query pass05_encounter_metrics:
  - [ ] COUNT = 1
  - [ ] encounters_detected = 1
  - [ ] ai_model_used populated
  - [ ] input_tokens > 0
  - [ ] output_tokens > 0
  - [ ] ai_cost_usd > 0
- [ ] Query pass05_page_assignments:
  - [ ] COUNT = 3
  - [ ] Pages 1, 2, 3 all assigned

**Result:** ⬜ Pass | ⬜ Fail (details: _____________)

---

### Test 2: 20 Pages, Standard Mode (Overlap Issue)
**Expected:** GRACEFUL FAILURE

- [ ] Upload document
- [ ] Wait for processing
- [ ] Query shell_files:
  - [ ] status = 'failed'
  - [ ] pass_0_5_completed = FALSE
  - [ ] pass_0_5_error contains "Page range overlap" or similar
  - [ ] processing_completed_at NOT NULL
- [ ] Query healthcare_encounters:
  - [ ] COUNT = 0 (correct - validation failed)
- [ ] Query pass05_encounter_metrics:
  - [ ] COUNT = 0 (correct - didn't complete)
- [ ] Query pass05_page_assignments:
  - [ ] COUNT = 0 (correct - didn't complete)

**Result:** ⬜ Pass | ⬜ Fail (details: _____________)

---

### Test 3: 71 Pages, Standard Mode
**Expected:** COMPLETE SUCCESS

- [ ] Upload document
- [ ] Wait for processing
- [ ] Query shell_files:
  - [ ] status = 'completed'
  - [ ] pass_0_5_completed = TRUE
  - [ ] All timestamps populated
- [ ] Query healthcare_encounters:
  - [ ] COUNT = 3
  - [ ] Types: inpatient, planned_specialist_consultation, planned_gp_appointment
- [ ] Query pass05_encounter_metrics:
  - [ ] COUNT = 1
  - [ ] encounters_detected = 3
  - [ ] real_world_encounters = 1
  - [ ] pseudo_encounters = 2
- [ ] Query pass05_page_assignments:
  - [ ] COUNT = 71 (all pages assigned)

**Result:** ⬜ Pass | ⬜ Fail (details: _____________)

---

### Test 4: 142 Pages, Progressive Mode (Disabled)
**Expected:** CLEAR ERROR MESSAGE

- [ ] Upload document
- [ ] Wait for processing
- [ ] Query shell_files:
  - [ ] status = 'failed'
  - [ ] pass_0_5_error contains "PROGRESSIVE MODE DISABLED" or similar
  - [ ] Error message explains v2.10 broken
  - [ ] Error message suggests workaround
- [ ] Query healthcare_encounters:
  - [ ] COUNT = 0 (correct - progressive disabled)

**Result:** ⬜ Pass | ⬜ Fail (details: _____________)

---

### Test 5: 219 Pages, Progressive Mode (Disabled)
**Expected:** CLEAR ERROR MESSAGE

- [ ] Same as Test 4
- [ ] Verify error message clear and actionable

**Result:** ⬜ Pass | ⬜ Fail (details: _____________)

---

## Post-Hotfix: v2.10 Investigation

**Priority:** P0 but can be done after hotfixes deployed
**Estimated Time:** 4-8 hours

### Investigation Tasks

- [ ] Create investigation document: `04-fixes/fixes-applied/post-hotfix-v2.10-investigation.md`
- [ ] Find all v2.10 related files:
  - [ ] `find apps/render-worker/src/pass05 -name "*v2.10*"`
  - [ ] `find apps/render-worker/src/pass05 -name "*compositional*"`
- [ ] Read v2.10 prompt files
- [ ] Document prompt structure in investigation file
- [ ] Compare with v2.9 prompt structure
- [ ] Identify differences

### Testing v2.10 in Isolation

- [ ] Create test script: `apps/render-worker/src/pass05/test-v2.10.ts`
- [ ] Load 50 pages of OCR from Test 4
- [ ] Build v2.10 prompt manually
- [ ] Send to OpenAI API directly
- [ ] Examine raw response
- [ ] Document findings

### Root Cause Analysis

- [ ] Why does AI return `{"encounters": []}`?
- [ ] Is JSON schema wrong?
- [ ] Are instructions missing for chunked mode?
- [ ] Is prompt too strict/cautious?
- [ ] Is compositional assembly broken?

### Decision: Fix Strategy

Choose one:
- [ ] **Option A:** Fix v2.10 prompt
  - [ ] Identify exact issue
  - [ ] Patch prompt
  - [ ] Test with 50-page chunk
  - [ ] Test with full 142-page document
- [ ] **Option B:** Create v2.9-progressive
  - [ ] Copy v2.9 prompt
  - [ ] Add chunking support
  - [ ] Add handoff instructions
  - [ ] Test with 142-page document
- [ ] **Option C:** Abandon progressive mode
  - [ ] Use v2.9 for all documents
  - [ ] Raise page limit to 200+
  - [ ] Accept higher token costs

### Implementation

- [ ] Implement chosen fix strategy
- [ ] Test with Test 4 (142 pages)
- [ ] Test with Test 5 (219 pages)
- [ ] Verify encounters detected
- [ ] Verify handoffs meaningful
- [ ] Verify pending encounters reconciled
- [ ] Document in investigation file

### Re-Enable Progressive Mode

- [ ] Remove emergency disable from `encounterDiscovery.ts`
- [ ] Deploy
- [ ] Re-test Test 4 and Test 5
- [ ] Verify COMPLETE SUCCESS (not zero encounters)
- [ ] Mark v2.10 investigation complete

**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

---

## Optional: v2.9 Prompt Improvement

**Priority:** P2 - Can wait
**Estimated Time:** 2 hours

### Tasks

- [ ] Open `apps/render-worker/src/pass05/aiPrompts.v2.9.ts`
- [ ] Find CRITICAL RULES section
- [ ] Add explicit non-overlapping constraint instructions
- [ ] Add examples of correct vs incorrect page ranges
- [ ] Add guidance for edge cases
- [ ] Save file

### Deploy

- [ ] `pnpm run build`
- [ ] `git add src/pass05/aiPrompts.v2.9.ts dist/`
- [ ] `git commit -m "improve(pass05): Add explicit non-overlapping constraint to v2.9 prompt"`
- [ ] `git push`

### Validation

- [ ] Re-upload Test 2 (previously failed with overlap)
- [ ] Verify no overlap error
- [ ] Verify encounters created successfully
- [ ] Query healthcare_encounters COUNT > 0

**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

---

## Final Sign-Off

### All Hotfixes Complete When:
- [ ] Hotfix 1 deployed and verified (v2.10 disabled)
- [ ] Hotfix 2 deployed and verified (database writes)
- [ ] Hotfix 3 deployed and verified (error handling)
- [ ] All 5 tests re-run with expected results
- [ ] No files stuck in "processing"
- [ ] All database tables populated correctly
- [ ] Error messages clear and actionable

### System Production-Ready When:
- [ ] All hotfixes complete
- [ ] v2.10 investigation complete
- [ ] Progressive mode working OR gracefully disabled with clear messaging
- [ ] Documentation updated
- [ ] Test suite passes

**Signed Off By:** ________________
**Date:** ________________
