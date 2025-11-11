# Progressive Mode Comprehensive Fix Plan
**Date:** 2025-11-11
**Approach:** Fix existing implementation (not rewrite)
**Estimated Effort:** 8-12 hours of focused work

## Phase 0: Preparation (1 hour)

### 0.1 Create Test Data
Create controlled test files for validation:
- 3-page file with 1 encounter (standard mode baseline)
- 120-page file with 3 encounters (progressive mode)
- 220-page file with 5 encounters (stress test)

### 0.2 Document Expected Behavior
For each test file, document:
- Expected encounter count and types
- Expected page assignments
- Expected confidence scores
- Expected token usage

### 0.3 Set Up Debugging Environment
- Enable comprehensive logging
- Set up Render log streaming
- Prepare SQL queries for validation

## Phase 1: Database Schema Fixes (2 hours)

### 1.1 Fix Healthcare Encounters Constraint

**Problem:** Constraint references non-existent `encounter_date` column

**Current State:**
```sql
-- BROKEN
UNIQUE (patient_id, primary_shell_file_id, encounter_type, encounter_date, page_ranges)
```

**Fix Migration:**
```sql
-- Migration: 2025-11-11_46_fix_encounter_constraint.sql
BEGIN;

-- Drop broken constraint
ALTER TABLE healthcare_encounters
DROP CONSTRAINT IF EXISTS unique_encounter_per_shell_file;

-- Add correct constraint using actual column
ALTER TABLE healthcare_encounters
ADD CONSTRAINT unique_encounter_per_shell_file
UNIQUE (patient_id, primary_shell_file_id, encounter_type, encounter_start_date, page_ranges);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_healthcare_encounters_lookup
ON healthcare_encounters(primary_shell_file_id, encounter_type, encounter_start_date);

COMMIT;
```

### 1.2 Verify All Table Structures

Check and document actual columns for:
- healthcare_encounters
- pass05_progressive_sessions
- pass05_chunk_results
- pass05_pending_encounters
- pass05_page_assignments

## Phase 2: Schema Unification (3 hours)

### 2.1 Decision: Unify on camelCase

**Rationale:**
- v2.9 base prompt uses camelCase
- TypeScript interfaces use camelCase
- Reduces transformation layers

### 2.2 Update Progressive Prompts

**File:** `apps/render-worker/src/pass05/progressive/prompts.ts`

**Change FROM (snake_case):**
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

**Change TO (camelCase):**
```json
{
  "encounters": [{
    "status": "complete",
    "tempId": "encounter_temp_001",
    "encounterType": "Emergency Department Visit",
    "encounterStartDate": "2024-03-15"
  }]
}
```

### 2.3 Update Parser

**File:** `apps/render-worker/src/pass05/progressive/chunk-processor.ts`

Ensure parser reads camelCase consistently:
```typescript
function parseProgressiveResponse(content: any) {
  // Validate structure
  if (!content.encounters || !Array.isArray(content.encounters)) {
    throw new Error('Invalid response: missing encounters array');
  }

  return {
    encounters: content.encounters.map(enc => ({
      status: enc.status,
      tempId: enc.tempId,  // camelCase
      encounterType: enc.encounterType,  // camelCase
      encounterStartDate: enc.encounterStartDate,  // camelCase
      // ... etc
    })),
    pageAssignments: content.pageAssignments || [],
    activeContext: content.activeContext
  };
}
```

### 2.4 Update Database Mapping

Ensure consistent mapping from camelCase to snake_case for database:
```typescript
const dbRecord = {
  patient_id: params.patientId,
  primary_shell_file_id: params.shellFileId,
  encounter_type: enc.encounterType,  // camelCase source
  encounter_start_date: enc.encounterStartDate,  // camelCase source
  // ... etc
};
```

## Phase 3: Duplicate Encounter Handling (1 hour)

### 3.1 Implement Proper Deduplication

**Strategy:** First encounter wins, log duplicates

```typescript
// In chunk-processor.ts
const { data: inserted, error: insertError } = await supabase
  .from('healthcare_encounters')
  .insert(dbRecord)
  .select()
  .single();

if (insertError) {
  // Check for duplicate constraint violation
  if (insertError.code === '23505') {
    console.log(`[Chunk ${params.chunkNumber}] Duplicate encounter detected - already exists from earlier chunk`);

    // Fetch existing encounter for consistency
    const { data: existing } = await supabase
      .from('healthcare_encounters')
      .select('*')
      .match({
        patient_id: dbRecord.patient_id,
        primary_shell_file_id: dbRecord.primary_shell_file_id,
        encounter_type: dbRecord.encounter_type,
        encounter_start_date: dbRecord.encounter_start_date
      })
      .single();

    if (existing) {
      // Use existing encounter
      encounter = mapToEncounterMetadata(existing);
      completedEncounters.push(encounter);
    }
    continue;
  }
  throw insertError;
}
```

## Phase 4: Missing Features (2 hours)

### 4.1 Update shell_files on Completion

**File:** `apps/render-worker/src/pass05/progressive/session-manager.ts`

Add after `finalizeProgressiveSession`:
```typescript
// Update shell_files with completion status
const avgConfidence = allEncounters.reduce((sum, e) => sum + e.confidence, 0) / allEncounters.length;

await supabase
  .from('shell_files')
  .update({
    pass_0_5_completed: true,
    pass_0_5_progressive: true,
    pass_0_5_version: 'v2.9-progressive',
    pass_0_5_confidence: avgConfidence,
    status: 'completed',
    processing_completed_at: new Date().toISOString()
  })
  .eq('id', shellFileId);
```

### 4.2 Track Confidence Scores

**File:** `apps/render-worker/src/pass05/progressive/database.ts`

Add to chunk results:
```typescript
confidence_score: params.confidence,
```

### 4.3 Persist Page Assignments

**File:** `apps/render-worker/src/pass05/progressive/session-manager.ts`

After reconciliation:
```typescript
// Persist page assignments
if (allPageAssignments.length > 0) {
  const assignmentRecords = allPageAssignments.map(pa => ({
    shell_file_id: shellFileId,
    page_num: pa.page,
    encounter_id: pa.encounter_id,
    justification: pa.justification
  }));

  await supabase
    .from('pass05_page_assignments')
    .insert(assignmentRecords);
}
```

## Phase 5: Comprehensive Testing (2 hours)

### 5.1 Unit Tests

Create test files for:
- `extractTextFromPages` with various OCR structures
- `parseProgressiveResponse` with various AI outputs
- `buildHandoffPackage` with edge cases
- Duplicate encounter handling

### 5.2 Integration Test Script

```typescript
// test-progressive-mode.ts
async function testProgressiveMode() {
  // 1. Upload test file
  const fileId = await uploadTestFile('120-pages.pdf');

  // 2. Wait for processing
  await waitForCompletion(fileId);

  // 3. Validate results
  const encounters = await getEncounters(fileId);
  assert(encounters.length === 3, 'Should find 3 encounters');

  const sessions = await getProgressiveSessions(fileId);
  assert(sessions[0].total_chunks === 3, 'Should have 3 chunks');

  const shellFile = await getShellFile(fileId);
  assert(shellFile.pass_0_5_completed === true);
  assert(shellFile.pass_0_5_progressive === true);
}
```

### 5.3 Manual Validation Checklist

For each test file:
- [ ] Chunks created correctly
- [ ] Handoff packages transferred
- [ ] Encounters extracted with correct content
- [ ] No duplicate errors
- [ ] Page assignments recorded
- [ ] Confidence scores tracked
- [ ] Shell file updated
- [ ] Metrics accurate

## Phase 6: Monitoring & Logging (1 hour)

### 6.1 Add Comprehensive Logging

Add structured logging at each step:
```typescript
logger.info('Progressive chunk processing', {
  session_id: sessionId,
  chunk_number: chunkNum,
  pages_in_chunk: chunkPages.length,
  ocr_chars_extracted: fullText.length,
  handoff_received: !!handoffPackage,
  encounters_found: result.completedEncounters.length
});
```

### 6.2 Add Quality Gates

```typescript
// Detect quality issues
if (totalEncounters === 0 && totalPages > 50) {
  reviewReasons.push('No encounters found in large document');
}

if (avgConfidence < 0.5) {
  reviewReasons.push('Low average confidence score');
}

if (pseudoEncounterRatio > 0.8) {
  reviewReasons.push('High ratio of pseudo encounters');
}
```

## Implementation Order

**Day 1 (4-6 hours):**
1. Phase 0: Preparation
2. Phase 1: Database fixes
3. Phase 2: Schema unification
4. Test with 120-page file

**Day 2 (4-6 hours):**
5. Phase 3: Duplicate handling
6. Phase 4: Missing features
7. Phase 5: Testing
8. Phase 6: Monitoring

## Success Criteria

Progressive mode is considered fixed when:
1. 120-page test file processes without errors
2. All expected encounters are extracted with correct content
3. No duplicate constraint violations
4. Shell file shows completion status
5. Page assignments are persisted
6. Confidence scores are tracked
7. Handoff between chunks works correctly
8. 220-page stress test completes successfully

## Risk Mitigation

1. **Create rollback plan:** Tag current commit before changes
2. **Test in isolation:** Use test shell_file_ids that won't affect production
3. **Incremental deployment:** Deploy each phase separately
4. **Monitor closely:** Watch Render logs during each test
5. **Have fallback:** Keep standard mode threshold at 100 during testing

## Questions Before Starting

1. Do you agree with camelCase unification?
2. Should we create synthetic test files or use real documents?
3. What's acceptable processing time for 200+ page documents?
4. Should failed chunks trigger automatic retry?
5. What confidence threshold should trigger manual review?

---

**Next Step:** Review this plan, get approval, then execute Phase 0 (Preparation)