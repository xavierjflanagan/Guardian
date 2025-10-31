# Upload File Format Optimization Module

**Status:** Planning Phase
**Created:** October 31, 2025
**Purpose:** Pre-OCR format conversion for multi-page and non-standard formats

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

### Phase 1: TIFF Support (Immediate)
- Extract TIFF pages using Sharp library
- Convert each page to JPEG base64
- Integrate with worker OCR pipeline
- **Blocks:** Pass 0.5 testing

### Phase 2: PDF Support (Next)
- Extract PDF pages using pdf-lib or pdf-parse
- Same output format as TIFF
- **Blocks:** 90% of test files (all sample medical records)

### Phase 3: HEIC/HEIF Support (Future)
- Convert HEIC → JPEG using libheif
- **Blocks:** iPhone photo uploads

### Phase 4: Office Documents (Future)
- Word/Excel text extraction
- Nice-to-have feature

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

- **Architecture:** `ARCHITECTURE.md` - Technical design details
- **Implementation Plan:** `IMPLEMENTATION_PLAN.md` - Step-by-step tasks
- **Test Plan:** `TEST_PLAN.md` - Testing strategy and test files
- **Code Examples:** `examples/` - Prototype code and usage examples

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

**Phase 1 (TIFF):** Planning complete, ready for implementation
**Phase 2 (PDF):** Awaiting Phase 1 completion
**Phase 3 (HEIC):** Future roadmap

---

**Last Updated:** October 31, 2025
**Next Step:** Review architecture and begin Phase 1 implementation
