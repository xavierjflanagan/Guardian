# Format Optimization Module - Test Plan

**Purpose:** Comprehensive testing strategy for format processor module
**Test Files Location:** `sample-medical-records/`

---

## Test Files Inventory

### Currently Working (Baseline - No Format Processor Needed):

| File | Format | Pages | Status | Use Case |
|------|--------|-------|--------|----------|
| Xavier_medication_box_IMG_6161.jpeg | JPEG | 1 | ✅ Works | Single-page image baseline |
| Xavier_lab_report_IMG_5637.jpeg | JPEG | 1 | ✅ Works | Single-page image baseline |
| BP2025060246784 - first 2 page version V5.jpeg | JPEG | 1 | ✅ Works | GP summary baseline |

### Blocked by Format Processor (Phase 1 - TIFF):

| File | Format | Pages | Status | Expected After Fix |
|------|--------|-------|--------|-------------------|
| Xavier_combined_2page_medication_and_lab.tiff | TIFF | 2 | ❌ Only page 1 | 2 encounters detected |

### Blocked by Format Processor (Phase 2 - PDF):

| File | Format | Pages | Status | Use Case |
|------|--------|-------|--------|----------|
| 006_Emma_Thompson_Hospital_Encounter_Summary.pdf | PDF | 142 | ❌ Failed | Large file batching test |
| 002_Sarah_Chen_Office_Visit_Summary.pdf | PDF | 15 | ❌ Failed | Multi-page unified document |
| 002_Sarah_Chen_Emergency_Summary.pdf | PDF | 9 | ❌ Failed | Real-world visit detection |
| 003_Michael_Rodriguez_Emergency_Summary.pdf | PDF | 11 | ❌ Failed | Real-world visit detection |
| 002_Sarah_Chen_Hospital_Encounter_Summary.pdf | PDF | 69 | ❌ Failed | Large batching test |
| All Patient 001-006 PDFs | PDF | Various | ❌ All failed | Multi-document uploads |

### Blocked by Format Processor (Phase 3 - HEIC):

| File | Format | Pages | Status | Use Case |
|------|--------|-------|--------|----------|
| IMG_6161.heic | HEIC | 1 | ❌ Failed | iPhone photo upload |

---

## Phase 1: TIFF Testing

### Test 1.1: Multi-Page TIFF Extraction

**File:** `Xavier_combined_2page_medication_and_lab.tiff`
**Pages:** 2 (medication box + lab report)
**Current Result:** Only page 1 processed
**Expected After Fix:** Both pages processed

**Test Steps:**
1. Upload TIFF file via portal
2. Monitor job_queue for completion
3. Check shell_file_manifests for results

**Success Criteria:**
- ✅ `totalPages: 2` in manifest
- ✅ 2 encounters detected:
  - Encounter 1: `pseudo_medication_list` page [[1,1]]
  - Encounter 2: `pseudo_lab_report` page [[2,2]]
- ✅ Both encounter texts contain relevant content
- ✅ OCR confidence > 0.90 for both pages
- ✅ Processing time < 60 seconds

**Validation Queries:**
```sql
-- Check manifest
SELECT
  shell_file_id,
  encounter_count,
  total_pages,
  encounters_json
FROM shell_file_manifests
WHERE shell_file_id = '<test_id>';

-- Check Pass 0.5 metrics
SELECT *
FROM pass05_encounter_metrics
WHERE shell_file_id = '<test_id>';
```

### Test 1.2: Single-Page TIFF (Edge Case)

**Purpose:** Ensure single-page TIFFs still work
**File:** Convert Xavier_medication_box to TIFF (create test file)
**Expected:** Works identically to JPEG

### Test 1.3: Large Multi-Page TIFF

**Purpose:** Performance testing
**File:** Create 10-page TIFF from multiple JPEGs
**Expected:** All 10 pages processed, time < 2 minutes

### Test 1.4: Corrupted TIFF

**Purpose:** Error handling
**File:** Intentionally corrupt TIFF file
**Expected:** Graceful error, clear error message

---

## Phase 2: PDF Testing

### Test 2.1: Small Multi-Page PDF

**File:** `002_Sarah_Chen_Office_Visit_Summary.pdf` (15 pages)
**Purpose:** Basic PDF extraction validation
**Expected:**
- All 15 pages extracted
- 1 encounter detected (unified document)
- Page range: [[1,15]]

### Test 2.2: Large Multi-Page PDF (Critical Test)

**File:** `006_Emma_Thompson_Hospital_Encounter_Summary.pdf` (142 pages)
**Purpose:** Stress test, batching validation
**Expected:**
- All 142 pages extracted
- 1 encounter detected: `inpatient_encounter`
- `requires_batching: true`
- ~9-10 batch boundaries calculated
- Processing time < 5 minutes

**Performance Benchmarks:**
- Page extraction: < 300ms per page
- Total extraction: < 1 minute
- OCR processing: < 3 minutes
- Total: < 5 minutes

### Test 2.3: Multi-Document PDF Upload

**File:** Patient 002 - All 11 PDFs uploaded together
**Purpose:** Document boundary detection
**Expected:**
- 11 separate manifests created
- Mix of real visits and pseudo-encounters
- No false merging
- No false splitting

### Test 2.4: Emergency Department PDFs

**Files:**
- `002_Sarah_Chen_Emergency_Summary.pdf` (9 pages)
- `003_Michael_Rodriguez_Emergency_Summary.pdf` (11 pages)
- `003_Michael_Rodriguez_Emergency_Summary_(1).pdf` (10 pages)

**Purpose:** Real-world visit detection
**Expected:** All classified as `emergency_encounter`

---

## Phase 3: HEIC Testing

### Test 3.1: iPhone HEIC Photo

**File:** `IMG_6161.heic` (medication box)
**Current Result:** 400 error (unsupported format) or OCR failure
**Expected After Fix:**
- Converts to JPEG successfully
- 1 encounter: `pseudo_medication_list`
- Quality preserved
- Processing time < 2 seconds

### Test 3.2: HEIF Variant

**File:** Create HEIF test file
**Expected:** Works identically to HEIC

---

## Integration Testing

### Test I.1: End-to-End Worker Flow

**Test:** Upload 2-page TIFF → Worker → Pass 0.5 → Manifest

**Steps:**
1. Upload file
2. Worker claims job
3. Preprocesses format (extracts pages)
4. Runs OCR on each page
5. Combines OCR results
6. Pass 0.5 analyzes combined OCR
7. Writes manifest

**Verify at Each Step:**
- Format processor logs
- OCR logs (2 separate calls)
- Pass 0.5 logs
- Manifest correctness

### Test I.2: Pass 0.5 Multi-Page Logic

**Test:** Does Pass 0.5 correctly handle multi-page OCR input?

**Scenarios:**
- 2-page TIFF with 2 encounters (should detect both)
- 15-page PDF with 1 encounter (should not over-segment)
- 142-page PDF with 1 encounter (should batch correctly)

### Test I.3: Backwards Compatibility

**Test:** Single-page files still work

**Files to Re-Test:**
- Single JPEG (medication box)
- Single JPEG (lab report)
- Single PNG (if available)

**Expected:** No regression, all work as before

---

## Performance Testing

### Test P.1: Memory Usage

**Test Files:**
- 2-page TIFF (~20MB)
- 142-page PDF (~2.5MB)

**Measure:**
- Peak memory usage during extraction
- Memory released after processing
- No memory leaks

**Targets:**
- 2-page TIFF: < 100MB peak
- 142-page PDF: < 500MB peak

### Test P.2: Processing Time

**Benchmarks:**

| File | Pages | Target Time | Current Time | After Fix |
|------|-------|-------------|--------------|-----------|
| 2-page TIFF | 2 | < 60s | ~40s (1 page) | TBD |
| 15-page PDF | 15 | < 90s | Failed | TBD |
| 142-page PDF | 142 | < 300s | Failed | TBD |

### Test P.3: Parallel Processing

**Test:** Upload 3 files simultaneously
**Expected:** All process without blocking each other

---

## Error Handling Testing

### Test E.1: Unsupported Format

**Input:** Upload .docx file
**Expected:** Clear error message, no crash

### Test E.2: Corrupted File

**Input:** Corrupted TIFF/PDF
**Expected:** Graceful failure, partial results if possible

### Test E.3: Empty File

**Input:** 0-byte file
**Expected:** Clear error, no crash

### Test E.4: Extremely Large File

**Input:** 1000-page PDF
**Expected:** Process successfully or fail gracefully with size limit error

---

## Regression Testing

After each phase, re-test all previous functionality:

**Regression Suite:**
1. Single-page JPEG ✓
2. Single-page PNG ✓
3. Multi-page TIFF (Phase 1) ✓
4. Multi-page PDF (Phase 2) ✓
5. HEIC photos (Phase 3) ✓

---

## Test Data Generation

### Creating Additional Test Files:

**Multi-Page TIFFs:**
```bash
# Combine JPEGs into TIFF
magick image1.jpg image2.jpg image3.jpg -compress lzw output.tiff
```

**Corrupted Files:**
```bash
# Truncate file to create corruption
head -c 1000 valid.tiff > corrupted.tiff
```

**Large Test Files:**
```bash
# Create 100-page TIFF from single image
magick -clone 0-99 image.jpg output-100page.tiff
```

---

## Automated Testing Script

### Future Enhancement:

**Script:** `scripts/test-format-processor.ts`

```typescript
// Automated test runner
// - Uploads all test files
// - Monitors processing
// - Validates results
// - Generates report

Usage:
npm run test:format-processor
```

---

## Test Results Documentation

### Template for Each Test:

```markdown
## Test: [Name]

**File:** [filename]
**Date:** [date]
**Result:** PASS/FAIL

### Expected:
- [expectations]

### Actual:
- [actual results]

### Issues Found:
- [any issues]

### Performance:
- Processing time: Xs
- Memory usage: XMB
```

---

## Success Criteria

### Phase 1 Complete When:
- ✅ All TIFF tests pass
- ✅ No regression in single-page files
- ✅ Performance acceptable

### Phase 2 Complete When:
- ✅ All PDF tests pass
- ✅ 142-page file processes successfully
- ✅ All baseline validation tests unblocked

### Phase 3 Complete When:
- ✅ All HEIC tests pass
- ✅ iPhone uploads work
- ✅ No regression in previous phases

---

**Last Updated:** October 31, 2025
**Status:** Test plan complete, ready for execution after implementation
