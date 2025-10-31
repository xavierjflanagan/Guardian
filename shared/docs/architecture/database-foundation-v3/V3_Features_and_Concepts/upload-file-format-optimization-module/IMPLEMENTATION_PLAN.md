# Format Optimization Module - Implementation Plan

**Status:** Phase 1 COMPLETE ✅ | Phase 2 Ready | Phase 3 Pending
**Phase 1 Completed:** October 31, 2025
**Est. Total Time:** 2-3 hours (Phase 1 only)
**Priority:** HIGH (blocking Pass 0.5 testing)

---

## Phase 1: TIFF Support (COMPLETE ✅)

**Priority:** CRITICAL - Blocking all multi-page testing
**Est. Time:** 60-90 minutes
**Actual Time:** ~90 minutes
**Blocks:** Pass 0.5 baseline validation, multi-page document testing
**Completed:** October 31, 2025 at 12:08 PM
**Test Result:** SUCCESS - 2 encounters detected from 2-page TIFF

### Tasks:

#### 1. Create Module Structure (5 minutes)
- [x] Create `apps/render-worker/src/utils/format-processor/` folder
- [x] Create `index.ts` (main entry point)
- [x] Create `types.ts` (shared types)
- [x] Create `tiff-processor.ts` (TIFF extraction)
- [ ] Create `__tests__/` folder for unit tests (deferred)

#### 2. Implement Core Types (10 minutes)
**File:** `types.ts`

- [x] Define `ProcessedPage` interface
- [x] Define `PreprocessResult` interface
- [x] Define `FormatProcessorConfig` interface
- [x] Add JSDoc comments

#### 3. Implement TIFF Processor (30 minutes)
**File:** `tiff-processor.ts`

- [x] Import Sharp library
- [x] Implement `extractTiffPages()` function
  - [x] Decode base64 to buffer
  - [x] Use Sharp to get metadata (page count)
  - [x] Loop through pages
  - [x] Extract each page with Sharp `{ page: i }`
  - [x] Convert to JPEG with quality setting
  - [x] Build ProcessedPage array
- [x] Add logging (page count, dimensions, timing)
- [x] Add error handling

#### 4. Implement Main Entry Point (15 minutes)
**File:** `index.ts`

- [x] Import processors
- [x] Implement `preprocessForOCR()` function
  - [x] Route by MIME type
  - [x] Call tiffProcessor for `image/tiff`
  - [x] Pass through JPEG/PNG as-is
  - [x] Throw error for unsupported formats
- [x] Add timing and logging
- [x] Export public API

#### 5. Integrate with Worker (20 minutes)
**File:** `apps/render-worker/src/worker.ts`

- [x] Import `preprocessForOCR` from format-processor
- [x] Find OCR integration point (around line 507-622)
- [x] Replace single OCR call with:
  - [x] Call `preprocessForOCR(base64, mimeType)`
  - [x] Loop through pages
  - [x] Call OCR for each page
  - [x] Combine OCR results
- [x] Build multi-page ocrResult structure
- [x] Add logging for multi-page processing

#### 6. Update OCR Result Combination (15 minutes)
**File:** `apps/render-worker/src/worker.ts`

- [x] Inline OCR page building (no separate helper needed)
- [x] Extract text from all pages via spatial_mapping
- [x] Build normalized bounding boxes for each page
- [x] Preserve OCR confidence per page
- [x] Track total page count in result

#### 7. Test with Real File (10 minutes)

- [x] Deploy worker to Render.com (commit 5f605b9)
- [x] Upload `Xavier_combined_2page_medication_and_lab.tiff`
- [x] Verify 2 encounters detected (medication + lab) ✅
- [x] Check manifest has `totalPages: 2` ✅
- [x] Verify page ranges: [[1,1]] and [[2,2]] ✅

**Test Results:**
- Job ID: ba831c89-0662-4fa4-bc80-da833a4d1e5b
- Status: COMPLETED
- Processing time: 47 seconds
- Encounter 1: pseudo_medication_list (page 1, confidence 0.94)
- Encounter 2: pseudo_lab_report (page 2, confidence 0.96)

#### 8. Document & Commit (5 minutes)

- [x] Commit with message: "feat: Implement Phase 1 - TIFF Multi-Page Support"
- [ ] Update test results document

---

## Phase 2: PDF Support (Next Session)

**Priority:** HIGH - Blocking 90% of test files
**Est. Time:** 90-120 minutes
**Blocks:** All PDF-based testing

### Research Tasks (Before Implementation):

#### PDF Library Selection (30 minutes)
- [ ] Research `pdf-lib` vs `pdf-parse` vs `pdfjs-dist`
- [ ] Test page rendering capabilities
- [ ] Check bundle size impact
- [ ] Verify browser vs Node.js compatibility
- [ ] Decision: Which library to use?

### Implementation Tasks:

#### 1. Install PDF Library (5 minutes)
- [ ] `npm install pdf-lib` (or chosen library)
- [ ] Update package.json
- [ ] Update pnpm-lock.yaml

#### 2. Implement PDF Processor (45 minutes)
**File:** `pdf-processor.ts`

- [ ] Import PDF library
- [ ] Implement `extractPages()` function
  - [ ] Load PDF from base64
  - [ ] Get page count
  - [ ] Render each page to image
  - [ ] Convert to JPEG
  - [ ] Build ProcessedPage array
- [ ] Handle PDF-specific edge cases
- [ ] Add logging and error handling

#### 3. Integrate with Main Entry Point (10 minutes)
**File:** `index.ts`

- [ ] Import pdfProcessor
- [ ] Add case for `application/pdf`
- [ ] Test with sample PDF

#### 4. Test with Real PDFs (20 minutes)

- [ ] Test with 142-page hospital encounter
- [ ] Test with 15-page office visit
- [ ] Test with multi-document upload (11 PDFs)
- [ ] Verify all pages processed
- [ ] Check performance (<5 minutes for 142 pages)

#### 5. Performance Optimization (15 minutes)

- [ ] Profile memory usage
- [ ] Implement streaming if needed
- [ ] Add progress logging for large files

---

## Phase 3: HEIC/HEIF Support (Future)

**Priority:** MEDIUM - iPhone photo uploads
**Est. Time:** 60-90 minutes
**Blocks:** iPhone user uploads

### Research Tasks:

#### HEIC Library Selection (30 minutes)
- [ ] Research `heic-convert` vs `libheif` bindings
- [ ] Check platform compatibility (Mac, Linux, Windows)
- [ ] Test conversion quality
- [ ] Verify installation complexity
- [ ] Decision: Which library to use?

### Implementation Tasks:

#### 1. Install HEIC Library (10 minutes)
- [ ] Install chosen library
- [ ] May require system dependencies (libheif)
- [ ] Test installation on Render.com (Docker)

#### 2. Implement HEIC Processor (30 minutes)
**File:** `heic-processor.ts`

- [ ] Import HEIC library
- [ ] Implement `convertToJpeg()` function
  - [ ] Decode HEIC from base64
  - [ ] Convert to JPEG
  - [ ] Return single ProcessedPage
- [ ] Handle HEIF variant
- [ ] Add error handling

#### 3. Integrate & Test (15 minutes)

- [ ] Add to main entry point
- [ ] Test with iPhone photo
- [ ] Verify quality preservation

---

## Phase 4: Office Documents (Future - Low Priority)

**Priority:** LOW - Nice-to-have
**Est. Time:** TBD
**Blocks:** Nothing critical

### Considerations:
- Word/Excel have native text (not images)
- Different extraction approach needed
- May want text-only extraction (no OCR)
- Consider using Mammoth.js (Word) or xlsx (Excel)

---

## Testing Strategy

### Unit Tests (Per Phase):
- [ ] Test single-page file
- [ ] Test multi-page file (2, 10, 100 pages)
- [ ] Test corrupted file (error handling)
- [ ] Test unsupported format
- [ ] Test memory usage with large files

### Integration Tests:
- [ ] Real test files from sample-medical-records
- [ ] End-to-end worker processing
- [ ] Verify Pass 0.5 encounter detection
- [ ] Performance benchmarking

---

## Rollout Plan

### Phase 1 (Tonight):
1. Implement TIFF processor
2. Deploy to Render.com
3. Test with 2-page TIFF
4. Validate 2 encounters detected
5. Document results

### Phase 2 (Tomorrow):
1. Research PDF libraries
2. Implement PDF processor
3. Deploy to Render.com
4. Test with 142-page PDF
5. Complete baseline validation testing

### Phase 3 (Future):
1. Research HEIC libraries
2. Implement HEIC processor
3. Test with iPhone photos

---

## Success Criteria

### Phase 1 Complete When:
- ✅ 2-page TIFF detects 2 encounters
- ✅ Each encounter has correct page ranges
- ✅ totalPages = 2 in manifest
- ✅ No data loss
- ✅ Tests pass

### Phase 2 Complete When:
- ✅ 142-page PDF processes all pages
- ✅ Multi-document PDFs work
- ✅ All baseline validation tests pass
- ✅ Performance acceptable (<5 min for 142 pages)

### Phase 3 Complete When:
- ✅ HEIC photos upload successfully
- ✅ Quality preserved
- ✅ Works on all platforms

---

## Risks & Mitigation

### Risk 1: Sharp doesn't support multi-page TIFF extraction
**Mitigation:** Research confirmed Sharp supports `{ page: i }` parameter ✓

### Risk 2: PDF rendering too slow
**Mitigation:** Implement progress logging, consider parallel processing

### Risk 3: HEIC requires system dependencies on Render.com
**Mitigation:** Test Docker installation, may need custom build

### Risk 4: Memory issues with 142-page file
**Mitigation:** Process pages one-at-a-time (streaming), don't load all at once

---

## Dependencies

### Already Installed:
- Sharp (TIFF, JPEG, PNG) ✓

### Need to Install (Phase 2):
- PDF library (TBD after research)

### Need to Install (Phase 3):
- HEIC library (TBD after research)

---

## Rollback Plan

If Phase 1 breaks production:
1. Revert commit
2. Disable format processor feature flag
3. Fall back to original (broken) TIFF handling
4. Fix issues offline, redeploy when stable

---

**Last Updated:** October 31, 2025
**Next Action:** Begin Phase 1 Task 1 (Create Module Structure)
