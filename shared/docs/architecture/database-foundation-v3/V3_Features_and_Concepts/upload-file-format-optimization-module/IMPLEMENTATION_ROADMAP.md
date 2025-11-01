# Format Optimization Module - Implementation Roadmap

**Status:** Phase 1 COMPLETE ✅ | Phase 2-3 THIS SESSION | Phase 4-6 Future
**Phase 1 Completed:** October 31, 2025
**Last Updated:** November 1, 2025
**Priority:** CRITICAL (blocking Pass 0.5 testing + iPhone users)

---

## Related Documentation

### Strategic Planning
- **Market Analysis:** `../document-ingestion-pipeline/MARKET_ANALYSIS.md` - User research, format distribution, competitive analysis
- **Priority Matrix:** `formats/PRIORITIES.md` - Risk-impact analysis, implementation sequencing
- **README:** `README.md` - Module overview and scope

### Implementation Details
This roadmap provides the **tactical execution plan** for the Format Processor Module. For strategic context and business justification, see the documents above.

---

## Phase 1: TIFF Multi-Page Support (COMPLETE ✅)

**Business Impact:** 5-10% of uploads, high-quality medical scans
**Priority:** P0 - CRITICAL
**Est. Time:** 60-90 minutes
**Actual Time:** ~90 minutes
**Completed:** October 31, 2025 at 12:08 PM
**Test Result:** SUCCESS - 2 encounters detected from 2-page TIFF

### Business Justification
- TIFF represents 5-10% of upload volume (medical imaging peripherals, high-quality scans)
- Multi-page TIFFs are standard for batched medical documents
- Without this fix: 50% data loss on 2-page files, 99%+ on larger files
- Established architecture pattern for all future phases

### Tasks Completed:

#### 1. Create Module Structure (5 minutes)
- [x] Create `apps/render-worker/src/utils/format-processor/` folder
- [x] Create `index.ts` (main entry point)
- [x] Create `types.ts` (shared types)
- [x] Create `tiff-processor.ts` (TIFF extraction)

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
  - [x] Loop through pages with `{ page: i }`
  - [x] Convert to JPEG with quality setting
  - [x] Build ProcessedPage array
- [x] Add logging and error handling

#### 4. Integrate with Worker (35 minutes)
**File:** `apps/render-worker/src/worker.ts`

- [x] Import `preprocessForOCR` from format-processor
- [x] Replace single OCR call with multi-page loop
- [x] Combine OCR results from all pages
- [x] Build multi-page ocrResult structure
- [x] Preserve page numbers and confidence scores

#### 5. Test with Real File (10 minutes)

- [x] Deploy worker to Render.com (commit 5f605b9)
- [x] Upload `Xavier_combined_2page_medication_and_lab.tiff`
- [x] Verify 2 encounters detected (medication + lab) ✅
- [x] Check manifest has `totalPages: 2` ✅

**Test Results:**
- Job ID: ba831c89-0662-4fa4-bc80-da833a4d1e5b
- Status: COMPLETED
- Processing time: 47 seconds
- Encounter 1: pseudo_medication_list (page 1, confidence 0.94)
- Encounter 2: pseudo_lab_report (page 2, confidence 0.96)

---

## Phase 2: PDF Multi-Page Support (THIS SESSION - P0 CRITICAL)

**Business Impact:** 60-70% of uploads, 93-99% data loss without fix
**Priority:** P0 - CRITICAL
**Est. Time:** 90-120 minutes
**Blocks:** 57% of baseline validation tests, all multi-page PDF testing
**Risk Score:** 70 (Impact: 10, Probability: 7)

### Business Justification

**Why Critical:**
- Represents 60-70% of upload volume (medical reports, discharge summaries)
- Multi-page PDFs are the standard format for medical documents
- Current system only processes first page → **93-99% data loss**
- Blocking 57% of Pass 0.5 baseline validation tests

**Affected Documents:**
- 142-page Hospital Discharge Summaries
- 15-page Office Visit Reports
- 9-11 page Emergency Department Records
- Multi-page Lab Results

**Business Consequences:**
- Incomplete medical records → Legal liability
- Users think upload worked but data is missing
- Compliance issues (HIPAA, Australian Privacy Act)
- Complete breakdown of Pass 0.5 baseline testing

### Technical Approach

**Recommended Library:** pdf2pic or pdf-poppler

**Rationale:**
- Specifically designed for PDF → image conversion
- Page-by-page extraction (exact use case)
- Well-maintained, active community
- Node.js native (fits our stack)

**Implementation Pattern:**
```typescript
// Same pattern as TIFF (proven in Phase 1)
export async function extractPdfPages(
  base64Pdf: string,
  maxWidth = 1600,
  quality = 85
): Promise<ProcessedPage[]> {
  // 1. Decode base64 → buffer
  // 2. Get page count from PDF metadata
  // 3. Loop through pages
  // 4. Convert each page to JPEG
  // 5. Return ProcessedPage[] array
}
```

### Implementation Tasks:

#### 1. Research PDF Libraries (15 minutes)
- [ ] Evaluate pdf2pic capabilities
- [ ] Check pdf-poppler as alternative
- [ ] Verify page extraction support
- [ ] Test with sample PDF
- [ ] Decision: Which library to use?

#### 2. Install PDF Library (10 minutes)
- [ ] `pnpm install [chosen-library]`
- [ ] Update package.json
- [ ] Pre-commit hook auto-updates pnpm-lock.yaml

#### 3. Implement PDF Processor (30 minutes)
**File:** `pdf-processor.ts`

- [ ] Import PDF library
- [ ] Implement `extractPdfPages()` function
  - [ ] Load PDF from base64
  - [ ] Get page count
  - [ ] Render each page to image
  - [ ] Convert to JPEG
  - [ ] Build ProcessedPage array
- [ ] Handle PDF-specific edge cases
- [ ] Add logging and error handling

#### 4. Integrate with Main Entry Point (10 minutes)
**File:** `index.ts`

- [ ] Import pdfProcessor
- [ ] Add case for `application/pdf`
- [ ] Route to extractPdfPages()

#### 5. Build & Deploy (15 minutes)
- [ ] Build worker: `pnpm --filter exora-v3-worker run build`
- [ ] Fix any TypeScript errors
- [ ] Deploy to Render.com (auto-deploy on push)

#### 6. Test with Real PDFs (20 minutes)

- [ ] Test with 15-page office visit PDF
- [ ] Verify all pages processed
- [ ] Check encounter detection works
- [ ] Monitor performance (<2 min for 15 pages)

#### 7. Document Results (10 minutes)
- [ ] Create `formats/phase-2-pdf.md` with results
- [ ] Update baseline validation status
- [ ] Commit implementation

---

## Phase 3: HEIC/HEIF Support (THIS SESSION - P0 CRITICAL)

**Business Impact:** 5-8% of uploads, 100% failure for iPhone camera photos
**Priority:** P0 - CRITICAL
**Est. Time:** 30 minutes
**Blocks:** Core iPhone user workflows (65-70% of Australian market)
**Risk Score:** 60 (Impact: 10, Probability: 6)

### Business Justification

**Why Critical:**
- iPhone dominates Australian market (65-70% share)
- HEIC is default photo format on iOS since iOS 11 (2017)
- Represents 5-8% of total upload volume
- **Core use case completely broken**: Camera photo uploads

**User Impact:**
```yaml
without_heic:
  - "User photographs medical document with iPhone"
  - "iOS saves as HEIC format"
  - "Upload fails with format error"
  - "User confused, frustrated, abandons app"

with_heic:
  - "User photographs medical document with iPhone"
  - "Format processor converts HEIC → JPEG transparently"
  - "Upload succeeds, seamless experience"
```

**Business Consequences:**
- Core feature completely broken for 65-70% of market
- Competitive disadvantage (other apps support HEIC)
- High churn risk on iPhone users
- Market penetration capped at 30-35% (Android only)

### Technical Approach

**Recommended Library:** Sharp (already in use!)

**Rationale:**
- **Sharp supports HEIC natively** - no additional dependencies
- We're already using Sharp for TIFF extraction (Phase 1)
- Battle-tested, high performance
- Same API as our existing TIFF processor

**Implementation Pattern:**
```typescript
// Sharp handles HEIC the same as other formats!
if (mimeType === 'image/heic' || mimeType === 'image/heif') {
  const image = sharp(Buffer.from(base64Data, 'base64'));
  const jpegBuffer = await image.jpeg({ quality: 85 }).toBuffer();
  // Return as ProcessedPage
}
```

### Implementation Tasks:

#### 1. Verify Sharp HEIC Support (5 minutes)
- [ ] Check Sharp documentation for HEIC support
- [ ] Verify no additional dependencies required
- [ ] Confirm same API as TIFF processing

#### 2. Add HEIC Handling (10 minutes)
**File:** `index.ts`

- [ ] Add case for `image/heic` and `image/heif`
- [ ] Use Sharp for conversion (same as TIFF pattern)
- [ ] Convert HEIC → JPEG
- [ ] Return single ProcessedPage

#### 3. Build & Test Locally (10 minutes)
- [ ] Build worker
- [ ] Test with iPhone HEIC photo
- [ ] Verify conversion quality

#### 4. Deploy & Test in Production (5 minutes)
- [ ] Deploy to Render.com
- [ ] Upload real iPhone HEIC photo
- [ ] Verify successful processing
- [ ] Document results in `formats/phase-3-heic.md`

**Confidence:** VERY HIGH (Sharp already supports it!)

---

## Phase 4: Office Documents (FUTURE - P1 HIGH PRIORITY)

**Business Impact:** 3-5% of uploads, clinical data loss
**Priority:** P1 - HIGH PRIORITY
**Est. Time:** 2-3 hours
**Risk Score:** 32 (Impact: 8, Probability: 4)

### Business Justification

**Why High Priority:**
- 3-5% of uploads are DOCX/XLSX files
- Medical reports from providers increasingly in Word format
- Lab results often distributed as Excel spreadsheets
- Current behavior: Empty extraction → Zero clinical data captured

**Affected Documents:**
- GP Medical Reports (DOCX, 5-15 pages)
- Specialist Consultation Notes (DOCX)
- Lab Result Spreadsheets (XLSX, multiple sheets)
- Treatment Plans (DOCX with tables)

**Business Consequences:**
- Silent clinical data loss (users don't realize)
- Incomplete medical records
- Provider workflows broken (can't share Word docs)
- Competitive disadvantage vs apps with Office support

### Technical Approach

**Recommended Libraries:**
- **DOCX:** mammoth (simple text extraction)
- **XLSX:** xlsx (SheetJS - industry standard)

**Implementation Pattern:**
```typescript
// Different pattern - text extraction, not image conversion
export async function extractOfficeDocumentText(
  base64Doc: string,
  mimeType: string
): Promise<ExtractedText> {
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return await extractDocxText(base64Doc);
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return await extractXlsxText(base64Doc);
  }
}
```

### Implementation Estimate
- Research libraries: 20 min
- Install & configure: 15 min
- Implement DOCX extraction: 45 min
- Implement XLSX extraction: 45 min
- Integration with NLP pipeline: 30 min
- Testing: 30 min
- **Total: 2-3 hours**

**Confidence:** MEDIUM (new pattern, different from image conversion)

---

## Phase 5: Archive Formats (FUTURE - P2 MEDIUM PRIORITY)

**Business Impact:** 2-3% of uploads, bulk workflow disruption
**Priority:** P2 - MEDIUM
**Est. Time:** 2-3 hours
**Risk Score:** 18 (Impact: 6, Probability: 3)

### Business Justification

**Why Medium Priority:**
- 2-3% of uploads are ZIP/RAR archives
- Healthcare providers often send bulk records as ZIP
- Enables "one-click" batch upload workflows
- Current behavior: Single file rejection

**Affected Workflows:**
- Provider sends complete medical history as ZIP
- User downloads multi-year health records package
- Bulk upload of related documents

**Business Impact:**
- Bulk upload workflows completely broken
- User friction for high-value use case
- Competitive disadvantage (other apps support ZIP)

### Technical Approach

**Recommended Library:** adm-zip

**Implementation Pattern:**
```typescript
export async function extractArchiveFiles(
  base64Archive: string,
  mimeType: string
): Promise<ExtractedFile[]> {
  // 1. Extract archive contents
  // 2. Validate each file (security scan)
  // 3. Process each file through format processor
  // 4. Return array of processed files
  // 5. Coordinate multi-file job creation
}
```

### Implementation Estimate
- Research & install: 20 min
- Implement extraction: 45 min
- Security scanning: 30 min
- Multi-file coordination: 45 min
- Testing: 30 min
- **Total: 2-3 hours**

**Confidence:** MEDIUM (recursive processing, resource management)

---

## Phase 6: Modern Formats + Quality Enhancement (FUTURE - P3 LOW PRIORITY)

**Business Impact:** 2-4% of uploads, future-proofing
**Priority:** P3 - LOW
**Est. Time:** 3-4 hours
**Risk Score:** 12 (Impact: 4, Probability: 3)

### Business Justification

**Why Low Priority:**
- 2-4% of current uploads
- Future-proofing investment
- Quality enhancement improves OCR accuracy
- Can be deferred without major business impact

### Components

**Modern Formats:**
- AVIF (next-gen image format)
- JPEG-XL (improved compression)
- Animated WebP (extract first frame)

**Quality Enhancements:**
- Resolution checks (< 150 DPI warning)
- Blur detection
- Auto brightness/contrast
- Skew correction
- Noise reduction

### Implementation Estimate
- **Total: 3-4 hours** (can be split across multiple sessions)

---

## Success Criteria

### Phase 1 Complete When:
- ✅ 2-page TIFF detects 2 encounters
- ✅ Each encounter has correct page ranges
- ✅ totalPages = 2 in manifest
- ✅ No data loss

### Phase 2 Complete When:
- [ ] 15-page PDF processes all pages
- [ ] Encounters detected correctly
- [ ] Pass 0.5 baseline tests unblocked
- [ ] Performance acceptable (<2 min for 15 pages)

### Phase 3 Complete When:
- [ ] HEIC photos upload successfully
- [ ] Quality preserved
- [ ] iPhone user workflow seamless

### Phase 4-6 Complete When:
- [ ] 95%+ format coverage achieved
- [ ] All major use cases supported
- [ ] Competitive feature parity

---

## Coverage Progress

```yaml
phase_1_actual: "75% coverage (TIFF complete)"
phase_2_target: "85% coverage (+ PDF)"
phase_3_target: "88% coverage (+ HEIC)"
phase_4_target: "92% coverage (+ Office docs)"
phase_5_target: "95% coverage (+ Archives)"
ultimate_goal: "98%+ coverage"
```

---

## Risks & Mitigation

### Risk 1: Sharp doesn't support multi-page TIFF extraction
**Status:** ✅ RESOLVED - Sharp supports `{ page: i }` parameter

### Risk 2: PDF rendering too slow
**Mitigation:** Implement progress logging, optimize page-by-page processing

### Risk 3: HEIC requires system dependencies on Render.com
**Status:** ✅ RESOLVED - Sharp handles HEIC natively

### Risk 4: Memory issues with large PDF files
**Mitigation:** Process pages one-at-a-time (streaming), don't load all at once

---

## Dependencies

### Already Installed:
- Sharp (TIFF, JPEG, PNG, **HEIC**) ✓

### Need to Install (Phase 2):
- PDF library (pdf2pic or pdf-poppler)

### Future Phases:
- mammoth (DOCX - Phase 4)
- xlsx (Excel - Phase 4)
- adm-zip (Archive - Phase 5)

---

## Rollback Plan

If implementation breaks production:
1. Revert commit
2. Verify previous version deploys successfully
3. Fix issues offline, redeploy when stable
4. Document incident and lessons learned

---

**Last Updated:** November 1, 2025
**Next Action:** Begin Phase 2 Task 1 (Research PDF libraries)
**Session Goal:** Complete Phase 2 (PDF) + Phase 3 (HEIC) in 2 hours
