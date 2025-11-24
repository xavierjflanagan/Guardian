# Pass 0.5 Hypothesis Tests - Overview

**Purpose:** Validate Pass 0.5 encounter discovery functionality through systematic testing

**Status:** Test suite created, execution pending

---

## Test Suite Structure

Each test follows Pass 1's proven methodology:

1. **Hypothesis** - What we expect the system to do
2. **Test Design** - Sample file selection and test parameters
3. **Validation Queries** - SQL queries to verify results
4. **Success Criteria** - Clear pass/fail thresholds
5. **Results** - Actual outcomes and analysis

---

## Planned Tests

### Test 01: End-to-End Validation
**File:** [test-01-end-to-end-validation.md](./test-01-end-to-end-validation.md)

**Objective:** Validate complete Pass 0.5 pipeline from OCR to manifest creation

**Key Validations:**
- Encounter discovery accuracy
- Manifest structure correctness
- Database writes (atomic transaction)
- Idempotency (safe retries)
- Pass 1/2 manifest loading

**Sample:** Single-page GP visit letter (simple case)

---

### Test 02: Multi-Encounter Document (Pending)
**Objective:** Validate multiple encounters in single document with non-overlapping page ranges

**Key Validations:**
- Multiple encounter detection
- Page range normalization
- Non-overlapping validation
- Encounter type classification

**Sample:** Multi-page hospital discharge summary (3+ encounters)

---

### Test 03: Edge Cases (Pending)
**Objective:** Test inverted page ranges, low OCR confidence, ambiguous dates

**Key Validations:**
- Inverted range normalization
- Type validation (invalid encounterType rejection)
- Low confidence handling
- Planned vs pseudo classification

**Sample:** Complex referral letter with multiple appointments

---

### Test 04: Cost and Performance (Pending)
**Objective:** Measure actual production costs and processing times

**Key Validations:**
- GPT-4o Vision token usage
- Processing time breakdown
- Cost per document
- Comparison to target metrics

**Sample:** Representative sample of 10 documents

---

## Success Criteria (Global)

**Functional:**
- ✅ Manifest created in shell_file_manifests table
- ✅ healthcare_encounters records pre-created with UUIDs
- ✅ pass05_encounter_metrics populated
- ✅ shell_files.pass_0_5_completed = TRUE
- ✅ Idempotency check works (retry returns existing manifest)

**Quality:**
- ✅ Encounter detection confidence ≥ 0.85
- ✅ Page ranges non-overlapping (Phase 1 requirement)
- ✅ encounterType valid (matches EncounterType union)

**Performance:**
- ✅ Processing time < 10 seconds per document
- ✅ Cost < $0.05 per document

---

## Validation Query Template

```sql
-- 1. Verify manifest exists
SELECT manifest_id, total_encounters_found, ai_cost_usd, processing_time_ms
FROM shell_file_manifests
WHERE shell_file_id = 'test-file-uuid';

-- 2. Verify encounters pre-created
SELECT id, encounter_type, is_real_world_visit, encounter_date, page_ranges
FROM healthcare_encounters
WHERE primary_shell_file_id = 'test-file-uuid';

-- 3. Verify metrics populated
SELECT encounters_detected, real_world_encounters, planned_encounters, pseudo_encounters
FROM pass05_encounter_metrics
WHERE shell_file_id = 'test-file-uuid';

-- 4. Verify completion flag
SELECT pass_0_5_completed, pass_0_5_completed_at
FROM shell_files
WHERE id = 'test-file-uuid';

-- 5. Verify atomic transaction (all 3 tables written or none)
SELECT
  (SELECT COUNT(*) FROM shell_file_manifests WHERE shell_file_id = 'test-file-uuid') as manifest_count,
  (SELECT COUNT(*) FROM pass05_encounter_metrics WHERE shell_file_id = 'test-file-uuid') as metrics_count,
  (SELECT pass_0_5_completed FROM shell_files WHERE id = 'test-file-uuid') as completion_flag;
-- Expected: All 3 values present (1, 1, TRUE) or all missing (0, 0, FALSE/NULL)
```

---

## Test Execution Workflow

1. **Prepare:** Upload sample file to Supabase Storage
2. **Trigger:** Enqueue Pass 0.5 job via Edge Function
3. **Monitor:** Watch job_queue for completion
4. **Validate:** Run validation queries
5. **Document:** Record results in test file
6. **Cleanup:** Mark test complete, archive results

---

## Current Status

**Tests Defined:** 4
**Tests Executed:** 0
**Tests Passed:** 0
**Tests Failed:** 0

**Next:** Execute Test 01 (end-to-end validation)

---

**Last Updated:** October 30, 2025
