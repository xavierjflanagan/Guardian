# Upload File Format Optimization Module

**Status:** Phase 1 Complete, Phase 2-3 In Progress
**Created:** October 31, 2025
**Last Updated:** November 1, 2025
**Purpose:** Pre-OCR format conversion for multi-page and non-standard formats

---

## Documentation Architecture

### Tactical vs Strategic Documentation

This module is the **tactical implementation layer** of Guardian's document processing system:

**Tactical Layer (This Module):**
- Format conversion and preprocessing (TIFF, PDF, HEIC → JPEG)
- OCR optimization and page extraction
- Implementation details and technical specifications

**Strategic Layer:**
- **Document Ingestion Pipeline:** `../document-ingestion-pipeline/` - Market analysis, user workflows, business justification
- **Market Research:** `../document-ingestion-pipeline/MARKET_ANALYSIS.md` - Format distribution, competitive analysis, iPhone market data
- **Implementation Priorities:** `formats/PRIORITIES.md` - Risk-impact matrix, phased rollout plan

For strategic context and business rationale, see the strategic layer documentation above. This README focuses on technical implementation.

---

## Problem Statement

Google Cloud Vision `images:annotate` API has critical limitations:
- **Only processes first page** of multi-page TIFFs
- **Cannot process PDFs** directly
- **Does not support HEIC/HEIF** formats (iPhone photos)

This causes **critical data loss** in production:
- 2-page document → 50% data loss
- 142-page document → 99.3% data loss
- HEIC uploads → 100% failure rate

---

## Discovery Event

**When:** October 31, 2025 during Pass 0.5 baseline testing
**Test File:** `Xavier_combined_2page_medication_and_lab.tiff` (2 pages)
**Expected Result:** 2 encounters detected (medication + lab report)
**Actual Result:** 1 encounter detected (medication only)
**Root Cause:** Google Cloud Vision only returned OCR for page 1

**Impact:** Without this fix, multi-page documents silently lose data after first page.

---

## Solution

Build **Format Processor Module** that converts all input formats → OCR-compatible format (JPEG pages)

### Key Features:
1. **Multi-page extraction** - TIFF, PDF support
2. **Format conversion** - HEIC → JPEG
3. **Single interface** - One preprocessing layer before OCR
4. **Page tracking** - Each page tagged with page number
5. **Memory efficient** - Stream processing for large files

---

## Scope

### Phase 1: TIFF Multi-Page Support (COMPLETE ✅)
- Extract TIFF pages using Sharp library
- Convert each page to JPEG base64
- Integrate with worker OCR pipeline
- **Result:** 2-page TIFF correctly detected 2 encounters (October 31, 2025)

### Phase 2: PDF Multi-Page Support (THIS SESSION - P0)
- Extract PDF pages using pdf2pic or pdf-poppler
- Same output format as TIFF
- **Business Impact:** 60-70% of uploads, 93-99% data loss without fix
- **Blocks:** 57% of baseline validation tests

### Phase 3: HEIC/HEIF Support (THIS SESSION - P0)
- Convert HEIC → JPEG using Sharp (already supports HEIC natively!)
- **Business Impact:** 5-8% of uploads, 65-70% of Australian market (iPhone users)
- **Blocks:** Core camera photo upload workflow
- **Implementation:** 30 minutes (Sharp handles it natively)

### Phase 4: Office Documents (FUTURE - P1)
- DOCX/XLSX text extraction (mammoth, xlsx libraries)
- **Business Impact:** 3-5% of uploads, clinical data loss
- **Estimate:** 2-3 hours

### Phase 5: Archive Formats (FUTURE - P2)
- ZIP/RAR extraction and batch processing
- **Business Impact:** 2-3% of uploads, bulk workflow optimization
- **Estimate:** 2-3 hours

### Phase 6: Modern Formats (FUTURE - P3)
- AVIF, JPEG-XL, quality enhancements
- **Business Impact:** 2-4% of uploads, future-proofing
- **Estimate:** 3-4 hours

**See `formats/PRIORITIES.md` for detailed risk-impact analysis and implementation sequencing.**

---

## Architecture

### Module Location
`apps/render-worker/src/utils/format-processor/`

### Module Structure
```
format-processor/
├── index.ts              # Main entry point
├── tiff-processor.ts     # TIFF page extraction
├── pdf-processor.ts      # PDF page extraction (future)
├── heic-processor.ts     # HEIC conversion (future)
└── types.ts              # Shared types
```

### Integration Point
```typescript
// Worker calls this BEFORE OCR
const pages = await preprocessForOCR(base64, mimeType);

// Then sends each page to OCR
for (const page of pages) {
  const ocrResult = await processWithGoogleVisionOCR(page.base64);
  // Combine results with page numbers
}
```

---

## Related Documentation

### Strategic Context
- **Market Analysis:** `../document-ingestion-pipeline/MARKET_ANALYSIS.md` - User research, format distribution, competitive positioning
- **Priority Matrix:** `formats/PRIORITIES.md` - Risk-impact scoring, business justification, phased rollout

### Tactical Implementation
- **Implementation Roadmap:** `IMPLEMENTATION_ROADMAP.md` - Detailed task breakdown and execution plan
- **Test Files:** `sample-medical-records/patient-001-xavier-flanagan/` - Real-world test documents

---

## Test Files Available

### Working Now (Baseline)
- Single-page JPEG: `Xavier_medication_box_IMG_6161.jpeg` ✓
- Single-page JPEG: `Xavier_lab_report_IMG_5637.jpeg` ✓

### Blocked by This Module
- 2-page TIFF: `Xavier_combined_2page_medication_and_lab.tiff` ❌
- 142-page PDF: `006_Emma_Thompson_Hospital_Encounter_Summary.pdf` ❌
- All other PDF test files (Patient 001-006) ❌
- iPhone HEIC: `IMG_6161.heic` ❌

---

## Current Status

**Phase 1 (TIFF):** ✅ COMPLETE (October 31, 2025) - 2 encounters detected from 2-page TIFF
**Phase 2 (PDF):** 🔄 IN PROGRESS (This session) - Unblocking 57% of baseline tests
**Phase 3 (HEIC):** ⏳ THIS SESSION (30 min implementation) - Critical for iPhone users
**Phase 4-6:** 📅 FUTURE - Office docs, archives, modern formats

**Coverage Progress:**
- ✅ Phase 1: 75% coverage (TIFF complete)
- 🔄 Phase 2: 85% coverage target (PDF in progress)
- ⏳ Phase 3: 88% coverage target (HEIC this session)
- 📅 Phases 4-6: 95%+ coverage goal (future)

---

**Last Updated:** November 1, 2025
**Next Step:** Begin Phase 2 - Research PDF libraries (pdf2pic vs pdf-poppler)
**Session Goal:** Complete PDF + HEIC support in 2 hours
