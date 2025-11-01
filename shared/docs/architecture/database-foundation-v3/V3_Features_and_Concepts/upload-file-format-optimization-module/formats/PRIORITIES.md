# Format Implementation Priorities

**Purpose:** Risk-impact matrix and implementation prioritization for file format support
**Status:** Active - Guiding Phase 2-6 development
**Last Updated:** November 1, 2025

---

## Executive Summary

**Priority Ranking Based on Risk-Impact Analysis:**

| Rank | Format | User Volume | Business Impact | Implementation | Phase | Status |
|------|--------|------------|-----------------|----------------|-------|--------|
| P0 | PDF (multi-page) | 60-70% | 93-99% data loss | 90 min | 2 | 🔄 In Progress |
| P0 | HEIC/HEIF | 5-8% | Complete failure | 30 min | 3 | ⏳ This session |
| P1 | DOCX/XLSX | 3-5% | Clinical data loss | 2-3 hours | 4 | 📅 Next week |
| P2 | ZIP/RAR | 2-3% | Workflow broken | 2-3 hours | 5 | 📅 Future |
| P3 | Modern (AVIF, etc.) | 2-4% | Future-proofing | 3-4 hours | 6 | 📅 Future |

**Coverage Progress:**
- ✅ Phase 1: 75% coverage (TIFF complete)
- 🔄 Phase 2: 85% coverage (PDF in progress)
- ⏳ Phase 3: 88% coverage (HEIC this session)
- 📅 Phases 4-6: 95%+ coverage (future)

---

## Risk-Impact Matrix

### Scoring Methodology

**Impact Score (1-10):**
- Business disruption severity
- Data loss potential
- User experience degradation
- Competitive disadvantage

**Probability Score (1-10):**
- Based on upload volume percentage
- User workflow frequency
- Market share of affected devices

**Risk Score = Impact × Probability**

### Format Risk Analysis

| Format | Impact | Probability | Risk Score | Priority | Justification |
|--------|--------|------------|-----------|----------|---------------|
| **PDF Multi-Page** | 10 | 7 | **70** | **P0** | Dominant format, massive data loss |
| **HEIC** | 10 | 6 | **60** | **P0** | Core feature broken for iPhone users |
| **DOCX/XLSX** | 8 | 4 | **32** | **P1** | Clinical data loss, provider workflows |
| **ZIP/RAR** | 6 | 3 | **18** | **P2** | Bulk upload workflows affected |
| **TIFF** | 8 | 2 | **16** | **P0** | ✅ Complete (Phase 1) |
| **Modern** | 4 | 3 | **12** | **P3** | Future-proofing, low current impact |

---

## Phase 2: PDF Multi-Page Support (P0 - CRITICAL)

### Business Justification

**Why Critical:**
- Represents 60-70% of upload volume
- Multi-page PDFs are the standard for medical reports
- Current system only processes first page → 93-99% data loss
- Blocking 57% of baseline validation tests

**User Impact:**
```yaml
affected_documents:
  - "142-page Hospital Discharge Summaries"
  - "15-page Office Visit Reports"
  - "9-11 page Emergency Department Records"
  - "Multi-page Lab Results"

current_failure:
  pages_processed: 1
  pages_lost: "All pages after page 1"
  clinical_data_loss: "93-99%"

business_consequences:
  - "Incomplete medical records → Legal liability"
  - "Users think upload worked but data is missing"
  - "Compliance issues (HIPAA, Australian Privacy Act)"
  - "Complete breakdown of Pass 0.5 baseline testing"
```

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

### Implementation Estimate

**Time Breakdown:**
- Research libraries: 15 min
- Install & configure: 10 min
- Implement extractPdfPages: 30 min
- Integration testing: 20 min
- Deploy & validation: 15 min
- **Total: 90 minutes**

**Confidence: HIGH** (same pattern as TIFF Phase 1)

---

## Phase 3: HEIC/HEIF Support (P0 - CRITICAL)

### Business Justification

**Why Critical:**
- iPhone dominates Australian market (65-70%)
- HEIC is default photo format on iOS since iOS 11 (2017)
- Represents 5-8% of total upload volume
- Core use case broken: Camera photo uploads

**User Impact:**
```yaml
affected_workflow: "iPhone Camera Document Capture"
user_experience:
  without_heic:
    - "User photographs medical document with iPhone"
    - "iOS saves as HEIC format"
    - "Upload fails with format error"
    - "User confused, frustrated, abandons app"

  with_heic:
    - "User photographs medical document with iPhone"
    - "Format processor converts HEIC → JPEG transparently"
    - "Upload succeeds, seamless experience"
    - "User continues engagement"

business_consequences:
  - "Core feature completely broken for 65-70% of market"
  - "Competitive disadvantage (other apps support HEIC)"
  - "High churn risk on iPhone users"
  - "Market penetration capped at 30-35% (Android only)"
```

### Technical Approach

**Recommended Library:** Sharp (already in use!)

**Rationale:**
- **Sharp supports HEIC natively** - no additional dependencies
- We're already using Sharp for TIFF extraction
- Battle-tested, high performance
- Same API as our existing TIFF processor

**Implementation Pattern:**
```typescript
// Sharp handles HEIC the same as other formats
if (mimeType === 'image/heic' || mimeType === 'image/heif') {
  // Sharp can decode HEIC directly!
  const image = sharp(Buffer.from(base64Data, 'base64'));
  const jpegBuffer = await image.jpeg({ quality: 85 }).toBuffer();
  // Return as ProcessedPage
}
```

### Implementation Estimate

**Time Breakdown:**
- Verify Sharp HEIC support: 5 min
- Add HEIC handling: 10 min
- Test with iPhone photo: 10 min
- Deploy & validation: 5 min
- **Total: 30 minutes**

**Confidence: VERY HIGH** (Sharp already supports it!)

---

## Phase 4: Office Documents (P1 - HIGH PRIORITY)

### Business Justification

**Why High Priority:**
- 3-5% of uploads are DOCX/XLSX files
- Medical reports from providers increasingly in Word format
- Lab results often distributed as Excel spreadsheets
- Current behavior: Empty extraction → Zero clinical data captured

**User Impact:**
```yaml
affected_documents:
  - "GP Medical Reports (DOCX, 5-15 pages)"
  - "Specialist Consultation Notes (DOCX)"
  - "Lab Result Spreadsheets (XLSX, multiple sheets)"
  - "Treatment Plans (DOCX with tables)"

current_failure:
  text_extracted: "Empty string"
  clinical_data_captured: "0%"
  user_awareness: "Low (appears to process successfully)"

business_consequences:
  - "Silent clinical data loss (users don't realize)"
  - "Incomplete medical records"
  - "Provider workflows broken (can't share Word docs)"
  - "Competitive disadvantage vs apps with Office support"
```

### Technical Approach

**Recommended Libraries:**
- **DOCX:** mammoth (simple text extraction)
- **XLSX:** xlsx (SheetJS - industry standard)

**Rationale:**
- Mammoth: Clean text extraction, preserves structure
- SheetJS: Battle-tested, handles complex spreadsheets
- Both are pure JavaScript (no native dependencies)

**Implementation Pattern:**
```typescript
// Different pattern - text extraction, not image conversion
export async function extractOfficeDocumentText(
  base64Doc: string,
  mimeType: string
): Promise<ExtractedText> {
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    // DOCX extraction
    return await extractDocxText(base64Doc);
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    // XLSX extraction
    return await extractXlsxText(base64Doc);
  }
}
```

### Implementation Estimate

**Time Breakdown:**
- Research libraries: 20 min
- Install & configure: 15 min
- Implement DOCX extraction: 45 min
- Implement XLSX extraction: 45 min
- Integration with NLP pipeline: 30 min
- Testing: 30 min
- **Total: 2-3 hours**

**Confidence: MEDIUM** (new pattern, different from image conversion)

---

## Phase 5: Archive Formats (P2 - MEDIUM PRIORITY)

### Business Justification

**Why Medium Priority:**
- 2-3% of uploads are ZIP/RAR archives
- Healthcare providers often send bulk records as ZIP
- Enables "one-click" batch upload workflows
- Current behavior: Single file rejection

**User Impact:**
```yaml
affected_workflows:
  - "Provider sends complete medical history as ZIP"
  - "User downloads multi-year health records package"
  - "Bulk upload of related documents"

current_failure:
  upload_result: "Rejected (unsupported format)"
  user_workaround: "Manual extraction → Individual uploads"
  friction: "High (tedious, error-prone)"

business_impact:
  - "Bulk upload workflows completely broken"
  - "User friction for high-value use case"
  - "Competitive disadvantage (other apps support ZIP)"
```

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

**Time Breakdown:**
- Research & install: 20 min
- Implement extraction: 45 min
- Security scanning: 30 min
- Multi-file coordination: 45 min
- Testing: 30 min
- **Total: 2-3 hours**

**Confidence: MEDIUM** (recursive processing, resource management)

---

## Phase 6: Modern Formats + Quality (P3 - LOW PRIORITY)

### Business Justification

**Why Low Priority:**
- 2-4% of current uploads
- Future-proofing investment
- Quality enhancement improves OCR accuracy
- Can be deferred without major business impact

**Components:**
```yaml
modern_formats:
  - "AVIF (next-gen image format)"
  - "JPEG-XL (improved compression)"
  - "Animated WebP (extract first frame)"

quality_enhancements:
  - "Resolution checks (< 150 DPI)"
  - "Blur detection"
  - "Auto brightness/contrast"
  - "Skew correction"
  - "Noise reduction"
```

### Implementation Estimate

**Total: 3-4 hours** (can be split across multiple sessions)

---

## Implementation Dependencies

### Phase Dependencies Graph

```
Phase 1 (TIFF) ✅ COMPLETE
    ↓
Phase 2 (PDF) 🔄 IN PROGRESS
    ↓
Phase 3 (HEIC) ⏳ THIS SESSION
    ↓
Phase 4 (Office) 📅 NEXT WEEK
    ↓
Phase 5 (Archive) 📅 FUTURE
    ↓
Phase 6 (Modern) 📅 FUTURE
```

**No blocking dependencies between phases 2-6** - could theoretically implement in any order, but business impact drives sequence.

---

## Success Metrics

### Coverage Goals

```yaml
phase_1_actual: "75% coverage (TIFF complete)"
phase_2_target: "85% coverage (+ PDF)"
phase_3_target: "88% coverage (+ HEIC)"
phase_4_target: "92% coverage (+ Office docs)"
phase_5_target: "95% coverage (+ Archives)"
ultimate_goal: "98%+ coverage"
```

### Business Impact Metrics

```yaml
upload_success_rate:
  phase_1: "75%"
  phase_2_target: "85%"
  phase_3_target: "88%"
  ultimate_target: "98%+"

data_completeness:
  phase_1: "50% (TIFF pages preserved)"
  phase_2_target: "85% (PDF pages preserved)"
  ultimate_target: "98%+ (all formats complete)"

user_satisfaction:
  target: "> 4.5/5 stars"
  measurement: "App reviews + user surveys"
```

---

## Decision Log

**November 1, 2025:** Revised priorities based on V2 market analysis
- Moved HEIC from Phase 6 → Phase 3 (P0 critical)
- Justified by iPhone market share (65-70%) and Sharp library capability
- Decision: Implement in same session as PDF (low effort, high impact)

**October 31, 2025:** Phase 1 (TIFF) completed successfully
- 2-page TIFF correctly detected 2 encounters
- Validated extraction → conversion → OCR → combine pattern
- Established architecture foundation for all future phases

---

**Document Status:** Active - Driving current implementation priorities
**Next Review:** After Phase 3 completion (re-evaluate Phase 4-6 order)
