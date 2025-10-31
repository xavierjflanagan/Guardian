# Format Optimization Module - Implementation Plan

**Status:** Ready for Implementation
**Est. Total Time:** 2-3 hours (Phase 1 only)
**Priority:** HIGH (blocking Pass 0.5 testing)

---

## Phase 1: TIFF Support (Immediate)

**Priority:** CRITICAL - Blocking all multi-page testing
**Est. Time:** 60-90 minutes
**Blocks:** Pass 0.5 baseline validation, multi-page document testing

### Tasks:

#### 1. Create Module Structure (5 minutes)
- [ ] Create `apps/render-worker/src/utils/format-processor/` folder
- [ ] Create `index.ts` (main entry point)
- [ ] Create `types.ts` (shared types)
- [ ] Create `tiff-processor.ts` (TIFF extraction)
- [ ] Create `__tests__/` folder for unit tests

#### 2. Implement Core Types (10 minutes)
**File:** `types.ts`

- [ ] Define `ProcessedPage` interface
- [ ] Define `PreprocessResult` interface
- [ ] Define `FormatProcessorConfig` interface
- [ ] Add JSDoc comments

#### 3. Implement TIFF Processor (30 minutes)
**File:** `tiff-processor.ts`

- [ ] Import Sharp library
- [ ] Implement `extractPages()` function
  - [ ] Decode base64 to buffer
  - [ ] Use Sharp to get metadata (page count)
  - [ ] Loop through pages
  - [ ] Extract each page with Sharp `{ page: i }`
  - [ ] Convert to JPEG with quality setting
  - [ ] Build ProcessedPage array
- [ ] Add logging (page count, dimensions, timing)
- [ ] Add error handling

#### 4. Implement Main Entry Point (15 minutes)
**File:** `index.ts`

- [ ] Import processors
- [ ] Implement `preprocessForOCR()` function
  - [ ] Route by MIME type
  - [ ] Call tiffProcessor for `image/tiff`
  - [ ] Pass through JPEG/PNG as-is
  - [ ] Throw error for unsupported formats
- [ ] Add timing and logging
- [ ] Export public API

#### 5. Integrate with Worker (20 minutes)
**File:** `apps/render-worker/src/worker.ts`

- [ ] Import `preprocessForOCR` from format-processor
- [ ] Find OCR integration point (around line 500-530)
- [ ] Replace single OCR call with:
  - [ ] Call `preprocessForOCR(base64, mimeType)`
  - [ ] Loop through pages
  - [ ] Call OCR for each page
  - [ ] Combine OCR results
- [ ] Update `processWithGoogleVisionOCR` to handle page arrays
- [ ] Add logging for multi-page processing

#### 6. Update OCR Result Combination (15 minutes)
**File:** `apps/render-worker/src/worker.ts`

- [ ] Create `combineOCRPages()` helper function
- [ ] Concatenate fullTextAnnotation.text from all pages
- [ ] Merge spatial_mapping with correct page numbers
- [ ] Average OCR confidence across pages
- [ ] Track total page count

#### 7. Test with Real File (10 minutes)

- [ ] Deploy worker to Render.com
- [ ] Upload `Xavier_combined_2page_medication_and_lab.tiff`
- [ ] Verify 2 encounters detected (medication + lab)
- [ ] Check manifest has `totalPages: 2`
- [ ] Verify page ranges: [[1,1]] and [[2,2]]

#### 8. Document & Commit (5 minutes)

- [ ] Update worker README with format processor info
- [ ] Commit with message: "feat: Add TIFF multi-page support - Format Processor Phase 1"
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
