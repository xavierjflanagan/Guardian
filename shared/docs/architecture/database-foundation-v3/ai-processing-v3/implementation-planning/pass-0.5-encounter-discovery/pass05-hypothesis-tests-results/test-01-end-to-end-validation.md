# Test 01: Pass 0.5 End-to-End Validation

**Date:** October 30, 2025
**Status:** PENDING EXECUTION
**Objective:** Validate complete Pass 0.5 pipeline from OCR input to manifest creation

---

## Hypothesis

**Given:** A single-page GP visit letter with clear encounter information (provider, date, facility)
**When:** Pass 0.5 processes the document
**Then:**
1. AI detects 1 healthcare encounter with confidence ≥ 0.85
2. Manifest created in `shell_file_manifests` table with correct structure
3. `healthcare_encounters` record pre-created with UUID
4. `pass05_encounter_metrics` populated with correct counts
5. `shell_files.pass_0_5_completed` set to TRUE
6. All 4 database writes succeed atomically (no partial failures)
7. Retry returns existing manifest (idempotency)

---

## Test Design

### Sample File Selection

**File Type:** Single-page PDF
**Content:** GP appointment letter
**Expected Encounter:**
- Type: `gp_appointment`
- Real-world visit: `true`
- Provider: Present
- Facility: Present
- Date: Clear and unambiguous
- Page range: `[[1, 1]]`

### Test Parameters

```typescript
{
  shellFileId: "test-01-uuid",
  patientId: "test-patient-uuid",
  pageCount: 1,
  ocrOutput: { /* Google Cloud Vision output */ },
  processingSessionId: "test-session-01-uuid"
}
```

---

## Validation Queries

### 1. Verify Manifest Structure

```sql
SELECT
  manifest_id,
  shell_file_id,
  patient_id,
  total_pages,
  total_encounters_found,
  ocr_average_confidence,
  batching_required,
  batch_count,
  manifest_data,
  ai_model_used,
  ai_cost_usd,
  processing_time_ms,
  created_at
FROM shell_file_manifests
WHERE shell_file_id = 'test-01-uuid';
```

**Expected:**
- `total_encounters_found` = 1
- `batching_required` = FALSE (Phase 1)
- `batch_count` = 1
- `manifest_data` is valid JSONB with encounters array
- `ai_model_used` = 'gpt-4o' or similar
- `ai_cost_usd` > 0
- `processing_time_ms` > 0

### 2. Verify Encounter Pre-Creation

```sql
SELECT
  id,
  patient_id,
  encounter_type,
  is_real_world_visit,
  encounter_date,
  encounter_date_end,
  provider_name,
  facility_name,
  primary_shell_file_id,
  page_ranges,
  identified_in_pass,
  pass_0_5_confidence,
  created_at
FROM healthcare_encounters
WHERE primary_shell_file_id = 'test-01-uuid';
```

**Expected:**
- 1 record returned
- `encounter_type` = 'gp_appointment'
- `is_real_world_visit` = TRUE
- `encounter_date` is valid ISO date
- `provider_name` IS NOT NULL
- `facility_name` IS NOT NULL
- `page_ranges` = [[1, 1]]
- `identified_in_pass` = 'pass_0_5'
- `pass_0_5_confidence` ≥ 0.85

### 3. Verify Metrics Populated

```sql
SELECT
  id,
  patient_id,
  shell_file_id,
  processing_session_id,
  encounters_detected,
  real_world_encounters,
  planned_encounters,
  pseudo_encounters,
  processing_time_ms,
  ai_model_used,
  input_tokens,
  output_tokens,
  total_tokens,
  ocr_average_confidence,
  encounter_confidence_average,
  encounter_types_found,
  total_pages,
  pages_per_encounter,
  batching_required,
  batch_count,
  created_at
FROM pass05_encounter_metrics
WHERE shell_file_id = 'test-01-uuid'
  AND processing_session_id = 'test-session-01-uuid';
```

**Expected:**
- `encounters_detected` = 1
- `real_world_encounters` = 1
- `planned_encounters` = 0
- `pseudo_encounters` = 0
- `encounter_types_found` = ['gp_appointment']
- `total_pages` = 1
- `pages_per_encounter` = 1.0
- `batching_required` = FALSE

### 4. Verify Completion Flag

```sql
SELECT
  id,
  pass_0_5_completed,
  pass_0_5_completed_at
FROM shell_files
WHERE id = 'test-01-uuid';
```

**Expected:**
- `pass_0_5_completed` = TRUE
- `pass_0_5_completed_at` IS NOT NULL

### 5. Verify Atomic Transaction

```sql
SELECT
  (SELECT COUNT(*) FROM shell_file_manifests WHERE shell_file_id = 'test-01-uuid') as manifest_count,
  (SELECT COUNT(*) FROM pass05_encounter_metrics WHERE shell_file_id = 'test-01-uuid') as metrics_count,
  (SELECT pass_0_5_completed FROM shell_files WHERE id = 'test-01-uuid') as completion_flag;
```

**Expected:** All 3 present (1, 1, TRUE) - proves atomic transaction worked

### 6. Test Idempotency (Retry)

```sql
-- Before retry: Record manifest_id
SELECT manifest_id, created_at FROM shell_file_manifests WHERE shell_file_id = 'test-01-uuid';

-- Trigger Pass 0.5 again with same shell_file_id

-- After retry: Verify same manifest_id returned
SELECT manifest_id, created_at FROM shell_file_manifests WHERE shell_file_id = 'test-01-uuid';
```

**Expected:**
- `manifest_id` unchanged
- `created_at` unchanged
- No duplicate records
- Early return log: "[Pass 0.5] Shell file {id} already processed, returning existing result"

---

## Success Criteria

**Critical (Must Pass):**
- ✅ Manifest exists with correct structure
- ✅ Encounter pre-created in healthcare_encounters table
- ✅ Metrics populated in pass05_encounter_metrics
- ✅ shell_files.pass_0_5_completed = TRUE
- ✅ Atomic transaction verified (all 3 writes or none)
- ✅ Idempotency works (retry returns existing manifest)

**Quality (Should Pass):**
- ✅ Encounter detection confidence ≥ 0.85
- ✅ encounterType matches expected (gp_appointment)
- ✅ Provider and facility extracted correctly
- ✅ Date parsed correctly

**Performance (Target):**
- ✅ Processing time < 10 seconds
- ✅ Cost < $0.05 per document

---

## Test Results

**Execution Date:** PENDING
**Pass/Fail:** PENDING

### Actual Results

**Manifest:**
```json
// Paste actual manifest_data JSON here after test execution
```

**Encounter:**
```json
// Paste actual healthcare_encounters record here
```

**Metrics:**
```json
// Paste actual pass05_encounter_metrics record here
```

**Performance:**
- Processing time: ___ ms
- AI cost: $___
- Input tokens: ___
- Output tokens: ___

### Issues Found

(None or list any issues discovered)

### Recommendations

(Any improvements or follow-up actions)

---

## Test Execution Checklist

- [ ] Upload sample file to Supabase Storage
- [ ] Create shell_files record
- [ ] Enqueue Pass 0.5 job via `enqueue_job_v3()` RPC
- [ ] Monitor job_queue for completion
- [ ] Run all 6 validation queries
- [ ] Document results above
- [ ] Test idempotency (retry)
- [ ] Mark test PASSED or FAILED
- [ ] Archive results

---

**Last Updated:** October 30, 2025
**Test Owner:** Exora Health Development Team
