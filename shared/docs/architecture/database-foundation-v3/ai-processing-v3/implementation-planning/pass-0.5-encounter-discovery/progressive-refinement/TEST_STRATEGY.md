# Progressive Mode Test Strategy
**Date:** 2025-11-11
**Purpose:** Systematic validation of progressive mode fixes

## Test File Requirements

### Synthetic Test Files (Controlled Testing)
We'll create synthetic test files with known content for predictable validation:

#### Test File 1: Small Control (3 pages)
- **Purpose:** Verify standard mode still works (baseline)
- **Content:** Single emergency department encounter
- **Expected:** 1 encounter extracted, no chunking
- **Validation:** Confirms we didn't break standard mode

#### Test File 2: Progressive Trigger (120 pages)
- **Purpose:** Test basic progressive mode (3 chunks of 40 pages)
- **Content Structure:**
  - Pages 1-40: Emergency encounter (complete)
  - Pages 41-80: Hospital admission (spans boundary)
  - Pages 81-120: Follow-up visits
- **Expected:** 3 encounters, handoff between chunks 2-3
- **Validation:** Core progressive functionality

#### Test File 3: Stress Test (220 pages)
- **Purpose:** Test large document handling
- **Content Structure:**
  - 5 distinct encounters
  - 2 encounters spanning chunk boundaries
  - Mix of encounter types
- **Expected:** 5 chunks, 5 encounters, 2 handoffs
- **Validation:** Scalability and memory handling

## Validation Checklist

### Per Test File Validation

#### 1. Pre-Processing Checks
- [ ] File uploaded successfully
- [ ] OCR completed without errors
- [ ] Job claimed from queue
- [ ] Progressive mode triggered (>100 pages)

#### 2. Chunking Validation
- [ ] Correct number of chunks created
- [ ] Chunk boundaries align (50 pages each)
- [ ] Session record created in `pass05_progressive_sessions`
- [ ] Each chunk has entry in `pass05_chunk_results`

#### 3. OCR Extraction Validation
```sql
-- Verify OCR text extraction working
SELECT
  session_id,
  chunk_number,
  LENGTH(ai_response_raw::text) as response_length,
  (ai_response_raw::json->'encounters')::json as encounters
FROM pass05_chunk_results
WHERE session_id = ?
ORDER BY chunk_number;
```

#### 4. Encounter Extraction Validation
```sql
-- Check encounters were persisted
SELECT
  encounter_type,
  encounter_start_date,
  page_ranges,
  pass_0_5_confidence,
  summary
FROM healthcare_encounters
WHERE primary_shell_file_id = ?
ORDER BY encounter_start_date;
```

#### 5. Handoff Validation
```sql
-- Verify handoff between chunks
SELECT
  chunk_number,
  handoff_received,
  handoff_generated,
  encounters_completed,
  encounters_continued
FROM pass05_chunk_results
WHERE session_id = ?
ORDER BY chunk_number;
```

#### 6. Duplicate Prevention
```sql
-- Ensure no duplicate encounters
SELECT
  encounter_type,
  encounter_start_date,
  COUNT(*) as count
FROM healthcare_encounters
WHERE primary_shell_file_id = ?
GROUP BY encounter_type, encounter_start_date
HAVING COUNT(*) > 1;
```

#### 7. Shell File Completion
```sql
-- Verify shell_files updated
SELECT
  pass_0_5_completed,
  pass_0_5_progressive,
  pass_0_5_version,
  pass_0_5_confidence,
  status
FROM shell_files
WHERE id = ?;
```

#### 8. Page Assignments
```sql
-- Check page assignments persisted
SELECT
  page_num,
  encounter_id,
  justification
FROM pass05_page_assignments
WHERE shell_file_id = ?
ORDER BY page_num;
```

#### 9. Quality Metrics
```sql
-- Review quality indicators
SELECT
  s.total_chunks,
  s.total_encounters_found,
  s.processing_status,
  s.requires_manual_review,
  s.review_reasons,
  AVG(c.confidence_score) as avg_confidence
FROM pass05_progressive_sessions s
JOIN pass05_chunk_results c ON s.id = c.session_id
WHERE s.id = ?
GROUP BY s.id;
```

## Automated Test Script

```typescript
// test-progressive-mode.ts
import { createClient } from '@supabase/supabase-js';

interface TestCase {
  name: string;
  filePath: string;
  expectedChunks: number;
  expectedEncounters: number;
  expectedHandoffs: number;
}

async function runProgressiveTest(testCase: TestCase) {
  console.log(`Running test: ${testCase.name}`);

  // 1. Upload file
  const fileId = await uploadTestFile(testCase.filePath);
  console.log(`File uploaded: ${fileId}`);

  // 2. Wait for completion (with timeout)
  const completed = await waitForCompletion(fileId, 300000); // 5 min timeout
  if (!completed) {
    throw new Error(`Test ${testCase.name} timed out`);
  }

  // 3. Run validation queries
  const results = {
    chunks: await countChunks(fileId),
    encounters: await countEncounters(fileId),
    handoffs: await countHandoffs(fileId),
    duplicates: await checkDuplicates(fileId),
    shellFileComplete: await checkShellFileStatus(fileId),
    confidence: await getAverageConfidence(fileId)
  };

  // 4. Assert expectations
  assert(results.chunks === testCase.expectedChunks,
    `Expected ${testCase.expectedChunks} chunks, got ${results.chunks}`);

  assert(results.encounters === testCase.expectedEncounters,
    `Expected ${testCase.expectedEncounters} encounters, got ${results.encounters}`);

  assert(results.handoffs === testCase.expectedHandoffs,
    `Expected ${testCase.expectedHandoffs} handoffs, got ${results.handoffs}`);

  assert(results.duplicates === 0,
    `Found ${results.duplicates} duplicate encounters`);

  assert(results.shellFileComplete === true,
    'Shell file not marked complete');

  assert(results.confidence > 0.7,
    `Low confidence score: ${results.confidence}`);

  console.log(`Test ${testCase.name} PASSED`);
  return results;
}

// Run all tests
async function runAllTests() {
  const tests: TestCase[] = [
    {
      name: 'Small Control (3 pages)',
      filePath: 'test-files/3-pages.pdf',
      expectedChunks: 0, // Standard mode
      expectedEncounters: 1,
      expectedHandoffs: 0
    },
    {
      name: 'Progressive Basic (120 pages)',
      filePath: 'test-files/120-pages.pdf',
      expectedChunks: 3,
      expectedEncounters: 3,
      expectedHandoffs: 1
    },
    {
      name: 'Progressive Stress (220 pages)',
      filePath: 'test-files/220-pages.pdf',
      expectedChunks: 5,
      expectedEncounters: 5,
      expectedHandoffs: 2
    }
  ];

  for (const test of tests) {
    try {
      await runProgressiveTest(test);
    } catch (error) {
      console.error(`Test ${test.name} FAILED:`, error);
      process.exit(1);
    }
  }

  console.log('All tests passed!');
}
```

## Manual Testing Protocol

### Phase 1: Constraint Fix Test
1. Deploy migration 46
2. Upload 3-page test file
3. Verify no constraint errors
4. Re-upload same file
5. Verify duplicate prevention works

### Phase 2: Schema Unification Test
1. Deploy updated prompts.ts with camelCase
2. Deploy updated chunk-processor.ts parser
3. Upload 120-page test file
4. Verify all fields extracted correctly
5. Check no field drops in database

### Phase 3: End-to-End Test
1. Upload 220-page test file
2. Monitor Render logs in real-time
3. Track each chunk completion
4. Verify handoffs work
5. Check final encounter count
6. Validate confidence scores

## Success Criteria

Progressive mode is considered WORKING when:

1. **No Errors:** All test files process without errors
2. **Content Extraction:** OCR text successfully extracted (non-empty)
3. **Encounter Quality:** Expected encounters found with correct content
4. **No Duplicates:** Constraint prevents duplicate encounters
5. **Handoff Success:** Context transfers between chunks
6. **Completion Status:** shell_files marked complete with metadata
7. **Page Assignments:** All pages assigned to encounters
8. **Confidence Tracking:** Scores tracked and averaged
9. **Performance:** 220-page file completes in <5 minutes
10. **Manual Review:** Appropriate cases flagged for review

## Monitoring During Tests

### Render.com Logs
```bash
# Watch worker logs
render logs --service exora-health --tail
```

### SQL Monitoring Queries
```sql
-- Real-time progress
SELECT
  chunk_number,
  processing_status,
  encounters_completed,
  processing_time_ms
FROM pass05_chunk_results
WHERE session_id = (
  SELECT id FROM pass05_progressive_sessions
  ORDER BY created_at DESC LIMIT 1
)
ORDER BY chunk_number;
```

## Rollback Plan

If critical issues discovered:
1. Set progressive threshold back to 1000 (effectively disabled)
2. Document specific failure points
3. Revert code changes in isolated commits
4. Re-assess fix vs rewrite decision with new information