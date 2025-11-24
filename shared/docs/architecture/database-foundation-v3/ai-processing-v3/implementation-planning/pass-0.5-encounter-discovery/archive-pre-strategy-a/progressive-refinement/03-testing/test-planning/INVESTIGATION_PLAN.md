# Pass 0.5 Testing Investigation Plan

**Date:** 2025-11-10
**Analyst:** Claude Code
**Scope:** 5 production tests of manifest-free architecture with progressive refinement

---

## Test Files Identified (Chronological Order)

| Test | Shell File ID | Pages | Created | Mode | Completed | Version | OCR Conf | Status |
|------|---------------|-------|---------|------|-----------|---------|----------|--------|
| 1 | `3683bea9-adf2-45af-b259-f85a2f8b4a79` | 3 | 08:10:22 | Standard | ✅ TRUE | v2.9 | 0.97 | ✅ Success |
| 2 | `8a2db550-881c-46b4-bd1b-d987ecd03a01` | 20 | 08:11:32 | Standard | ❌ FALSE | NULL | NULL | ❌ Failed |
| 3 | `8b02f50f-846b-4a6d-8053-5079000f0597` | 71 | 08:13:24 | Standard | ✅ TRUE | v2.9 | 0.97 | ✅ Success |
| 4 | `71254c6a-81f9-4b34-b2fd-05a8ce47d873` | 142 | 08:19:43 | Progressive | ✅ TRUE | v2.10 | 0.97 | ⚠️ Handoff issues |
| 5 | `62c1a644-4e64-4e28-aa58-3548cb45e27c` | 219 | 08:28:18 | Progressive | ✅ TRUE | v2.10 | 0.97 | ⚠️ No encounters |

---

## Complete Table Inventory (11 Tables, 2 Views)

### Core Pass 0.5 Tables (4)
1. **shell_files** - Main file tracking with Migration 45 columns
2. **healthcare_encounters** - Extracted encounters
3. **pass05_encounter_metrics** - Processing metrics (cost, time, tokens)
4. **pass05_page_assignments** - Page-level encounter assignments (Migration 45)

### Progressive Processing Tables (4)
5. **pass05_progressive_sessions** - Session tracking for chunked processing
6. **pass05_chunk_results** - Individual chunk processing results
7. **pass05_pending_encounters** - Encounters awaiting completion across chunks
8. **pass05_progressive_performance** (VIEW) - Performance metrics aggregation

### Supporting Tables (3)
9. **job_queue** - Worker job status and errors
10. **shell_file_manifests** - Old manifest table (should be empty for new tests)
11. **shell_file_synthesis_results** - Pass 3 results (future)

### Backward Compatibility (1)
12. **shell_file_manifests_v2** (VIEW) - Migration 45 backward-compatible view

### Not Relevant (1)
13. **shell_file_synthesis_results** - Pass 3 only, not relevant for Pass 0.5

---

## Investigation Stages

### Stage 1: Data Collection & Planning ✅
- [X] Identify all relevant tables (13 discovered)
- [X] Find 5 test shell_file IDs in chronological order
- [X] Create investigation plan structure
- [ ] Create table schema reference document
- [ ] Create test result file templates

### Stage 2: Systematic Analysis (Per Test)
For each test (in chronological order):
1. Query all relevant tables
2. Document findings in test result file
3. Identify issues and anomalies
4. Compare actual vs expected behavior

### Stage 3: Cross-Test Analysis
1. Identify patterns across tests
2. Root cause analysis for failures
3. Progressive handoff quality assessment
4. Migration 45 effectiveness evaluation

### Stage 4: Recommendations
1. Bug fixes required
2. Code improvements
3. Prompt adjustments (if needed)
4. Monitoring recommendations

---

## Enhanced Analysis Approach Per Test

Each test will follow a **forensic investigation structure** with these phases:

### Phase 1: Pre-Flight Check (Before Pass 0.5)
Verify prerequisites were met before Pass 0.5 execution:
- OCR completion status
- Image processing completion
- Job creation timestamp
- Worker claim timestamp
- Pre-Pass 0.5 errors

### Phase 2: Pass 0.5 Execution Timeline
Trace exact execution with millisecond precision:
- Job claimed → Pass 0.5 started → Chunks processed (if progressive) → Pass 0.5 completed
- Worker ID that processed
- Memory/CPU usage (if available from job_queue)
- Actual duration vs estimated duration

### Phase 3: Data Flow Verification
Input → Processing → Output integrity check:
- OCR pages received → AI processing → Encounters written
- Token counts (input/output) alignment with expectations
- Cost calculation accuracy
- Where did data get lost or corrupted?

### Phase 4: Cross-Table Consistency Validation
Verify data consistency across tables:
```sql
-- Data consistency check
SELECT
  sf.id as shell_file_id,
  sf.pass_0_5_completed,
  sf.pass_0_5_version,
  sf.pass_0_5_progressive,
  COUNT(DISTINCT he.id) as actual_encounters_in_db,
  m.encounters_detected as reported_in_metrics,
  COUNT(DISTINCT pa.page_num) as pages_with_assignments,
  sf.page_count as total_pages
FROM shell_files sf
LEFT JOIN healthcare_encounters he ON he.primary_shell_file_id = sf.id
LEFT JOIN pass05_encounter_metrics m ON m.shell_file_id = sf.id
LEFT JOIN pass05_page_assignments pa ON pa.shell_file_id = sf.id
WHERE sf.id = '[SHELL_FILE_ID]'
GROUP BY sf.id, sf.pass_0_5_completed, sf.pass_0_5_version,
         sf.pass_0_5_progressive, m.encounters_detected, sf.page_count;
```

### Phase 5: Progressive Mode Forensics (Tests 4 & 5 Only)
Deep analysis of chunk-by-chunk processing:

**Chunk Timeline Analysis:**
```sql
-- Chunk execution timeline
SELECT
  chunk_number,
  page_start,
  page_end,
  processing_status,
  started_at,
  completed_at,
  EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_seconds,
  processing_time_ms,
  encounters_started,
  encounters_completed,
  encounters_continued,
  confidence_score
FROM pass05_chunk_results
WHERE session_id = '[SESSION_ID]'
ORDER BY chunk_number;
```

**Handoff Quality Analysis:**
```sql
-- Handoff quality metrics
SELECT
  chunk_number,
  jsonb_array_length(COALESCE(handoff_received->'pendingEncounter', '[]'::jsonb)) as received_pending,
  jsonb_array_length(COALESCE(handoff_generated->'pendingEncounter', '[]'::jsonb)) as generated_pending,
  length(COALESCE(handoff_received->>'context', '')) as received_context_length,
  length(COALESCE(handoff_generated->>'context', '')) as generated_context_length,
  handoff_received,
  handoff_generated
FROM pass05_chunk_results
WHERE session_id = '[SESSION_ID]'
ORDER BY chunk_number;
```

**Pending Encounter Lifecycle:**
```sql
-- Track pending encounters from creation to resolution
SELECT
  temp_encounter_id,
  chunk_started,
  chunk_last_seen,
  status,
  page_ranges,
  last_seen_context,
  expected_continuation,
  completed_encounter_id,
  completed_at,
  confidence,
  requires_review,
  partial_data
FROM pass05_pending_encounters
WHERE session_id = '[SESSION_ID]'
ORDER BY chunk_started, temp_encounter_id;
```

### Phase 6: Root Cause Hypothesis Testing
For each identified issue, test specific hypotheses:
- **Test 2 Failure:** Pre-Pass 0.5 error vs Pass 0.5 code error
- **Test 4 Handoff Issues:** Context truncation vs semantic loss vs field corruption
- **Test 5 No Encounters:** Handoff failure vs AI prompt failure vs reconciliation failure

---

## Standard Queries for All Tests

**1. shell_files**
```sql
SELECT id, page_count, status, pass_0_5_completed, pass_0_5_version,
       pass_0_5_progressive, ocr_average_confidence, created_at,
       processing_completed_at, processing_error
FROM shell_files WHERE id = '[SHELL_FILE_ID]';
```

**2. healthcare_encounters**
```sql
SELECT id, encounter_type, encounter_start_date, encounter_date_end,
       is_real_world_visit, confidence, page_ranges, identified_in_pass,
       source_method, provider_name, facility_name, summary
FROM healthcare_encounters WHERE primary_shell_file_id = '[SHELL_FILE_ID]';
```

**3. pass05_encounter_metrics**
```sql
SELECT * FROM pass05_encounter_metrics WHERE shell_file_id = '[SHELL_FILE_ID]';
```

**4. pass05_page_assignments**
```sql
SELECT page_num, encounter_id, justification
FROM pass05_page_assignments WHERE shell_file_id = '[SHELL_FILE_ID]'
ORDER BY page_num;
```

**5. job_queue**
```sql
SELECT id, job_type, status, error_message, created_at, claimed_at, completed_at
FROM job_queue WHERE payload->>'shellFileId' = '[SHELL_FILE_ID]'
ORDER BY created_at;
```

**6. shell_file_manifests** (should be empty)
```sql
SELECT COUNT(*) FROM shell_file_manifests WHERE shell_file_id = '[SHELL_FILE_ID]';
```

**7. shell_file_manifests_v2** (backward compatibility check)
```sql
SELECT manifest_id, total_encounters_found, pass_0_5_version,
       processing_time_ms, ai_model_used
FROM shell_file_manifests_v2 WHERE shell_file_id = '[SHELL_FILE_ID]';
```

### For Progressive Tests Only (Tests 4 & 5)

**8. pass05_progressive_sessions**
```sql
SELECT id, total_pages, chunk_size, total_chunks, current_chunk, status,
       created_at, completed_at, error_message
FROM pass05_progressive_sessions WHERE shell_file_id = '[SHELL_FILE_ID]';
```

**9. pass05_chunk_results**
```sql
SELECT session_id, chunk_number, completed_encounters_count,
       pending_encounter_id, handoff_generated, input_tokens, output_tokens,
       cost, confidence, processing_time_ms, created_at
FROM pass05_chunk_results WHERE session_id = '[SESSION_ID]'
ORDER BY chunk_number;
```

**10. pass05_pending_encounters**
```sql
SELECT id, session_id, temp_encounter_id, encounter_data, status,
       created_at, resolved_at, resolved_to_encounter_id
FROM pass05_pending_encounters WHERE session_id = '[SESSION_ID]'
ORDER BY created_at;
```

**11. pass05_progressive_performance** (VIEW)
```sql
SELECT * FROM pass05_progressive_performance WHERE shell_file_id = '[SHELL_FILE_ID]';
```

---

## Key Questions to Answer

### General (All Tests)
1. Did Migration 45 columns populate correctly?
2. Are encounters being written to healthcare_encounters?
3. Are metrics being written to pass05_encounter_metrics?
4. Is the backward-compatible view working?
5. Are page assignments being created (v2.3 feature)?

### Standard Mode (Tests 1, 2, 3)
1. Why did Test 2 (20 pages) fail?
2. Did finalizeShellFile() execute correctly?
3. Are all expected encounters detected?

### Progressive Mode (Tests 4, 5)
1. Is progressive mode triggering correctly (>100 pages)?
2. Are chunks being created properly?
3. **CRITICAL:** Why are handoff messages not useful?
4. **CRITICAL:** Why did Test 5 (219 pages) produce no encounters?
5. Are pending encounters being resolved?
6. Is the reconciliation process working?

### Migration 45 Validation
1. Are manifest writes eliminated (old table empty)?
2. Is data in proper normalized tables?
3. Is the view aggregating correctly?
4. Is RLS protecting page_assignments?

---

## Expected Outcomes

### Test 1 (3 pages, standard) - ✅ Success Expected
- Should use standard mode (v2.9)
- Should complete quickly
- Should find encounters (medical document)
- Migration 45 columns should populate

### Test 2 (20 pages, standard) - ❌ Failed - INVESTIGATE
- Should use standard mode (v2.9)
- **Why did it fail?** Check job_queue errors
- **Did it even start Pass 0.5?**

### Test 3 (71 pages, standard) - ✅ Success Expected
- Should use standard mode (v2.9)
- Should complete successfully
- Larger test of standard mode

### Test 4 (142 pages, progressive) - ⚠️ Partial Success
- Should trigger progressive mode (>100 pages)
- Should use v2.10
- Should create 3 chunks (50 pages each)
- **ISSUE:** Handoff messages not useful
- **INVESTIGATE:** Handoff quality in pass05_chunk_results

### Test 5 (219 pages, progressive) - ⚠️ Completed but No Encounters
- Should trigger progressive mode
- Should create 5 chunks
- **CRITICAL ISSUE:** No encounters found
- **INVESTIGATE:** Chunk results, handoffs, pending encounters
- **HYPOTHESIS:** Handoff context loss causing all encounters to fail

---

## Next Steps

1. Create TABLE_SCHEMA_REFERENCE.md with all column details
2. Create test result file templates
3. Begin systematic analysis starting with Test 1
4. Progress through tests in chronological order
5. Compile cross-test analysis
6. Deliver recommendations

---

## Success Criteria for Investigation

- All 5 tests fully analyzed with data from all relevant tables
- Root cause identified for Test 2 failure
- Root cause identified for Test 4 handoff issues
- Root cause identified for Test 5 zero encounters
- Actionable fixes documented
- Migration 45 effectiveness assessed
