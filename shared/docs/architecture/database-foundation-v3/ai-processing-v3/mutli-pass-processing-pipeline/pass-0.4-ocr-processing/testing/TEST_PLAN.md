# Pass 0.25: OCR Processing Test Plan

**Created:** November 2, 2025
**Purpose:** Comprehensive testing strategy for OCR component
**Scope:** Sequential OCR (baseline), Batched Parallel OCR (new), Future scaling

---

## Test Objectives

### Primary Goals
1. Validate batched parallel OCR fixes 142-page crash
2. Measure performance improvement (target: 8-10x speedup)
3. Verify memory usage stays under limits (<100 MB peak)
4. Ensure no regressions on small files (1-69 pages)
5. Test fault tolerance (timeouts, retries, checkpoints)

### Secondary Goals
1. Discover maximum file size capacity
2. Benchmark concurrent upload handling
3. Validate API cost expectations
4. Test OCR quality consistency

---

## Test Environment

### Infrastructure
- **Worker:** Render.com "Exora Health" service (starter plan, 512 MB RAM)
- **Database:** Supabase PostgreSQL
- **Storage:** Supabase Storage (medical-docs bucket)
- **OCR API:** Google Cloud Vision (Document Text Detection)

### Test Files Location
```
sample-medical-records/
├── patient-001/
│   ├── Xavier_combined_2page_medication_and_lab.tiff (2 pages)
│   └── Xavier_medication_box_IMG_6161.jpeg (1 page)
├── patient-002/
│   ├── Sample Patient ED Note pdf.pdf (8 pages)
│   ├── 002_Sarah_Chen_Hospital_Encounter_Summary.pdf (69 pages)
│   └── 006_Emma_Thompson_Hospital_Encounter_Summary.pdf (142 pages)
└── test-files/
    ├── 100-page-test.pdf (to be created)
    ├── 200-page-test.pdf (to be created)
    └── 500-page-stress-test.pdf (to be created)
```

---

## Test Categories

### Category 1: Baseline Tests (Sequential OCR - Current State)

**Purpose:** Document current performance before batched parallel

| Test ID | File | Pages | Expected Time | Expected Memory | Status |
|---------|------|-------|---------------|-----------------|--------|
| SEQ-01 | 1-page JPEG | 1 | 3 sec | 52 MB | ✅ Baseline |
| SEQ-02 | 2-page TIFF | 2 | 6 sec | 54 MB | ✅ Completed (Oct 31) |
| SEQ-03 | 8-page PDF | 8 | 24 sec | 62 MB | ✅ Completed (Nov 1) |
| SEQ-04 | 69-page PDF | 69 | 207 sec (3.5 min) | 150 MB | ✅ Completed (Nov 1) |
| SEQ-05 | 142-page PDF | 142 | 426 sec (7.1 min) | 330 MB | ❌ **CRASHED** (Nov 2) |

**Results location:** `test-results/2025-11-02-sequential-ocr-failure.md`

---

### Category 2: Batched Parallel OCR Tests (New Implementation)

**Purpose:** Validate batched parallel fixes issues and improves performance

#### Test 2.1: Small File Validation (No Regression)
**Objective:** Ensure batched parallel doesn't break small files

| Test ID | File | Pages | Expected Time | Expected Memory | Pass Criteria |
|---------|------|-------|---------------|-----------------|---------------|
| BATCH-01 | 1-page JPEG | 1 | <5 sec | <60 MB | Same or better than sequential |
| BATCH-02 | 2-page TIFF | 2 | <8 sec | <60 MB | Same or better than sequential |
| BATCH-03 | 8-page PDF | 8 | <10 sec | <70 MB | 2-3x faster than sequential |

**Success Criteria:**
- ✅ All files process successfully
- ✅ OCR confidence >0.90 average
- ✅ Pass 0.5 receives correct format
- ✅ No errors or warnings
- ✅ Time same or better than sequential

---

#### Test 2.2: Medium File Performance
**Objective:** Validate performance improvement on known-working files

| Test ID | File | Pages | Sequential Time | Target Time | Speedup Target |
|---------|------|-------|-----------------|-------------|----------------|
| BATCH-04 | 69-page PDF | 69 | 207 sec (3.5 min) | <30 sec | 7x |

**Success Criteria:**
- ✅ Completes in <30 seconds
- ✅ Memory peak <100 MB
- ✅ OCR confidence matches baseline (0.96 avg)
- ✅ All 69 pages processed
- ✅ No checkpoint errors

**Validation:**
```sql
-- Check Pass 0.25 metrics
SELECT
  total_pages,
  ocr_average_confidence,
  ocr_processing_time_ms,
  memory_peak_mb
FROM pass025_ocr_metrics
WHERE shell_file_id = '<test-id>';

-- Expected results:
-- total_pages: 69
-- ocr_average_confidence: 0.96
-- ocr_processing_time_ms: <30000
-- memory_peak_mb: <100
```

---

#### Test 2.3: Large File Stress Test (Critical)
**Objective:** Validate 142-page file completes without crash

| Test ID | File | Pages | Sequential Result | Target Time | Target Memory |
|---------|------|-------|-------------------|-------------|---------------|
| BATCH-05 | **142-page PDF** | **142** | **CRASHED at page 140** | **<60 sec** | **<100 MB** |

**This is the PRIMARY test - success unblocks production!**

**Success Criteria:**
- ✅ **Completes successfully (no crash)**
- ✅ All 142 pages processed
- ✅ Processing time <60 seconds
- ✅ Memory peak <100 MB
- ✅ OCR confidence >0.90 average
- ✅ 15 batches processed (142 pages ÷ 10 per batch)
- ✅ Checkpoint saved after each batch
- ✅ Pass 0.5 runs successfully with OCR output

**Validation Queries:**
```sql
-- 1. Check shell file completion
SELECT
  id,
  original_filename,
  file_size_bytes,
  created_at
FROM shell_files
WHERE id = '<test-id>';

-- 2. Check Pass 0.25 metrics
SELECT
  total_pages,
  ocr_average_confidence,
  ocr_processing_time_ms,
  memory_peak_mb,
  batch_count,
  batch_size
FROM pass025_ocr_metrics
WHERE shell_file_id = '<test-id>';

-- 3. Check Pass 0.5 results
SELECT
  total_encounters_found,
  encounters_json,
  processing_time_ms
FROM shell_file_manifests
WHERE shell_file_id = '<test-id>';

-- 4. Check job completion
SELECT
  status,
  completed_at,
  actual_duration
FROM job_queue
WHERE job_payload->>'shell_file_id' = '<test-id>';
```

**Expected Results:**
```json
{
  "pass025_metrics": {
    "total_pages": 142,
    "ocr_average_confidence": 0.95,
    "ocr_processing_time_ms": 45000,  // ~45 seconds
    "memory_peak_mb": 70,
    "batch_count": 15,
    "batch_size": 10
  },
  "pass05_results": {
    "total_encounters_found": 1,
    "encounter_type": "inpatient_encounter",
    "confidence": 0.95
  },
  "job_status": "completed"
}
```

---

#### Test 2.4: Extra Large File Capacity
**Objective:** Discover new maximum file size limit

| Test ID | File | Pages | Target Time | Target Memory | Notes |
|---------|------|-------|-------------|---------------|-------|
| BATCH-06 | 200-page PDF | 200 | <90 sec | <100 MB | Stretch capacity |
| BATCH-07 | 500-page PDF | 500 | <4 min | <100 MB | Maximum capacity test |

**Success Criteria:**
- ✅ Processes without crash
- ✅ Memory stays under 100 MB
- ✅ Time: ~(pages ÷ 10) × 3 seconds
- ❌ **If fails:** Document failure point, adjust batch size

**If 500-page file fails:**
- Try reducing batch size to 5
- Try reducing batch size to 3
- Document new maximum capacity

---

### Category 3: Fault Tolerance Tests

**Purpose:** Validate error handling, timeouts, retry logic

#### Test 3.1: API Timeout Simulation
**Method:** Mock Google Vision API to delay response >30 seconds

**Expected Behavior:**
- ⏱️ Page times out after 30 seconds
- 🔄 Retry triggered automatically
- ✅ Succeeds on retry
- 📝 Logged as warning, not error

**Validation:**
```
Check logs for:
"OCR timeout for page X"
"Retrying page X after timeout"
"OCR completed for page X" (on retry)
```

---

#### Test 3.2: Checkpoint Resume Test
**Method:** Manually kill worker after batch 5 completes

**Setup:**
1. Start processing 142-page file
2. Wait for batch 5 to complete (50 pages)
3. Kill worker process
4. Restart worker
5. Verify resume from page 51

**Expected Behavior:**
- ✅ Checkpoint saved after batch 5 (50 pages)
- ✅ Worker restarts and detects checkpoint
- ✅ Resumes from page 51 (not page 1)
- ✅ Completes remaining 92 pages
- ✅ Final result has all 142 pages

**Note:** This test validates checkpoint system is working, but current implementation may restart from page 1 (checkpoint resume is enhancement, not critical path).

---

#### Test 3.3: Partial Batch Failure
**Method:** Mock Google Vision API to fail on page 75

**Expected Behavior:**
- ✅ Batches 1-7 complete successfully (70 pages)
- ❌ Batch 8 fails on page 75
- 🔄 Retry triggered for page 75
- ❌ If retry fails, entire job fails gracefully
- 📝 Error logged with clear message
- ✅ Previous batches saved in checkpoint

**Validation:**
```
Check logs for:
"OCR failed for page 75: [error message]"
"Retrying page 75..."
"Job failed at page 75 after retry" (if retry also fails)
```

---

### Category 4: Concurrency Tests

**Purpose:** Test multiple simultaneous uploads

#### Test 4.1: Two Concurrent Uploads
**Method:** Upload 2 files simultaneously

**Files:**
- Patient A: 69-page PDF
- Patient B: 8-page PDF

**Expected Behavior:**
- ✅ Both files process successfully
- ✅ No interference between jobs
- ✅ Patient B likely finishes first (smaller file)
- ✅ Database isolation maintained

---

#### Test 4.2: Five Concurrent Uploads
**Method:** Upload 5 files within 1 minute

**Files:**
- 3× 69-page PDFs
- 2× 142-page PDFs

**Expected Behavior (1 worker instance):**
- 🔄 Files queue up (processed sequentially)
- ✅ First file: Starts immediately
- ⏳ Files 2-5: Wait in queue
- ✅ All complete within 10 minutes
- ❌ **If queue wait >2 minutes, recommend scaling to 2-3 instances**

---

### Category 5: Performance Benchmarking

**Purpose:** Collect metrics for optimization decisions

#### Test 5.1: Cost Analysis
**Measure:**
- OCR API cost per page
- Processing time per page
- Total cost per file size

**Test files:**
- 10-page: Measure cost
- 50-page: Measure cost
- 100-page: Measure cost
- 142-page: Measure cost

**Expected costs:**
- Per page: $0.0015
- 10 pages: $0.015
- 50 pages: $0.075
- 100 pages: $0.15
- 142 pages: $0.213

---

#### Test 5.2: Memory Profiling
**Measure:**
- Baseline memory
- Per-batch memory increase
- Peak memory per file size
- Memory after GC

**Method:**
```typescript
// In worker code
console.log('Memory before batch:', process.memoryUsage());
await processBatch();
console.log('Memory after batch:', process.memoryUsage());
if (global.gc) global.gc();
console.log('Memory after GC:', process.memoryUsage());
```

**Create chart:** Memory usage vs file size

---

## Test Execution Procedure

### Pre-Test Checklist
- [ ] Deploy batched parallel OCR code to Render
- [ ] Verify database migration applied (ocr_processing_checkpoints table)
- [ ] Confirm Google Cloud Vision API key valid
- [ ] Clear any stuck jobs from queue
- [ ] Enable Node.js garbage collection flag: `--expose-gc`

### Test Execution Order

**Phase 1: Baseline (if not already documented)**
1. Run SEQ-01 through SEQ-04
2. Document sequential performance
3. Save results for comparison

**Phase 2: Validation**
1. Run BATCH-01, BATCH-02, BATCH-03 (no regression)
2. Verify small files still work
3. If any fail, fix before proceeding

**Phase 3: Critical Test**
1. Run BATCH-05 (142-page stress test)
2. **This is make-or-break test**
3. If fails, debug and retry
4. If succeeds, proceed to Phase 4

**Phase 4: Capacity Discovery**
1. Run BATCH-06 (200-page)
2. Run BATCH-07 (500-page)
3. Document maximum capacity

**Phase 5: Fault Tolerance**
1. Run Test 3.1 (timeout simulation)
2. Run Test 3.2 (checkpoint resume)
3. Run Test 3.3 (partial failure)

**Phase 6: Concurrency**
1. Run Test 4.1 (2 concurrent)
2. Run Test 4.2 (5 concurrent)
3. Recommend scaling if needed

---

## Test Results Documentation

### For Each Test, Record:

**File:** `test-results/2025-11-0X-[test-name].md`

```markdown
# Test [ID]: [Name]

**Date:** [Date]
**File:** [Filename]
**Pages:** [X]
**Status:** PASS / FAIL

## Results

**Performance:**
- Processing time: X seconds
- Time per page: X seconds
- Memory peak: X MB
- Batch count: X
- Batch size: X

**OCR Quality:**
- Average confidence: X.XX
- Min confidence: X.XX
- Max confidence: X.XX
- Pages with low confidence (<0.80): X

**Database Records:**
[Include query results]

## Issues Found

[None / List of issues]

## Notes

[Any observations]
```

---

## Success Metrics Summary

### Must Pass (Critical)
- ✅ BATCH-05: 142-page file completes without crash
- ✅ Memory stays under 100 MB
- ✅ Processing time <60 seconds
- ✅ No regressions on small files

### Should Pass (Important)
- ✅ BATCH-06: 200-page file completes
- ✅ Timeout handling works
- ✅ Checkpoint save/load works
- ✅ Cost expectations met

### Nice to Have (Stretch)
- ⭐ BATCH-07: 500-page file completes
- ⭐ Checkpoint resume tested
- ⭐ Concurrent uploads handle gracefully

---

## Rollback Plan

**If batched parallel fails worse than sequential:**
1. Revert code changes
2. Redeploy sequential OCR
3. Document failure reasons
4. Redesign approach

**If batched parallel works but has issues:**
1. Keep batched parallel deployed
2. Reduce batch size (10 → 5)
3. Add more monitoring
4. Iterate on fixes

---

**Next Steps:**
1. Complete implementation (see `IMPLEMENTATION_PLAN.md`)
2. Execute test plan
3. Document results in `test-results/`
4. Update `PAUSE_POINT.md` and resume Pass 0.5 testing
