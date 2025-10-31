# Format Optimization Module - Technical Architecture

**Module Name:** Format Processor
**Location:** `apps/render-worker/src/utils/format-processor/`
**Purpose:** Convert any input format → OCR-compatible format (JPEG pages)

---

## Core Design Principle

**Single preprocessing layer** before OCR that handles all format conversions transparently.

### Design Goals:
1. **Transparent** - Worker doesn't need to know about format details
2. **Extensible** - Easy to add new format processors
3. **Type-safe** - Full TypeScript type coverage
4. **Testable** - Each processor independently testable
5. **Efficient** - Stream processing for large files

---

## Module Structure

```
apps/render-worker/src/utils/format-processor/
├── index.ts                  # Main entry point, exports preprocessForOCR()
├── tiff-processor.ts         # TIFF page extraction (Phase 1)
├── pdf-processor.ts          # PDF page extraction (Phase 2)
├── heic-processor.ts         # HEIC → JPEG conversion (Phase 3)
├── types.ts                  # Shared TypeScript types
└── __tests__/                # Unit tests
    ├── tiff-processor.test.ts
    ├── pdf-processor.test.ts
    └── heic-processor.test.ts
```

---

## Core Types

```typescript
/**
 * Represents a single processed page ready for OCR
 */
export interface ProcessedPage {
  pageNumber: number;        // 1-indexed page number
  base64: string;            // JPEG base64 data
  mime: 'image/jpeg';        // Always JPEG for OCR compatibility
  width: number;             // Image dimensions
  height: number;
  originalFormat?: string;   // Original MIME type for logging
}

/**
 * Result of format preprocessing
 */
export interface PreprocessResult {
  pages: ProcessedPage[];
  totalPages: number;
  processingTimeMs: number;
  originalFormat: string;
  conversionApplied: boolean;
}

/**
 * Configuration for format processing
 */
export interface FormatProcessorConfig {
  maxWidth?: number;         // Max width for downscaling (default: 1600)
  jpegQuality?: number;      // JPEG quality (default: 85)
  correlationId?: string;    // For logging
}
```

---

## Main Entry Point

### `index.ts`

```typescript
import { tiffProcessor } from './tiff-processor';
import { pdfProcessor } from './pdf-processor';
import { heicProcessor } from './heic-processor';
import { ProcessedPage, PreprocessResult, FormatProcessorConfig } from './types';

/**
 * Main preprocessing function called by worker before OCR
 *
 * @param base64 - Base64 encoded file data
 * @param mimeType - MIME type of input file
 * @param config - Optional configuration
 * @returns Array of processed pages ready for OCR
 */
export async function preprocessForOCR(
  base64: string,
  mimeType: string,
  config?: FormatProcessorConfig
): Promise<PreprocessResult> {

  const startTime = Date.now();

  // Route to appropriate processor based on MIME type
  let pages: ProcessedPage[];
  let conversionApplied = false;

  if (mimeType === 'image/tiff') {
    pages = await tiffProcessor.extractPages(base64, config);
    conversionApplied = true;
  }
  else if (mimeType === 'application/pdf') {
    pages = await pdfProcessor.extractPages(base64, config);
    conversionApplied = true;
  }
  else if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    pages = await heicProcessor.convertToJpeg(base64, config);
    conversionApplied = true;
  }
  else if (mimeType === 'image/jpeg' || mimeType === 'image/png') {
    // Single-page formats - pass through as-is
    pages = [{
      pageNumber: 1,
      base64,
      mime: 'image/jpeg',
      width: 0,   // Dimensions will be set by OCR if needed
      height: 0,
      originalFormat: mimeType
    }];
  }
  else {
    throw new Error(`Unsupported format for OCR: ${mimeType}`);
  }

  return {
    pages,
    totalPages: pages.length,
    processingTimeMs: Date.now() - startTime,
    originalFormat: mimeType,
    conversionApplied
  };
}
```

---

## Phase 1: TIFF Processor

### `tiff-processor.ts`

```typescript
import sharp from 'sharp';
import { ProcessedPage, FormatProcessorConfig } from './types';
import { createLogger } from '../logger';

export const tiffProcessor = {

  /**
   * Extract all pages from multi-page TIFF and convert to JPEG
   */
  async extractPages(
    base64Tiff: string,
    config?: FormatProcessorConfig
  ): Promise<ProcessedPage[]> {

    const logger = createLogger({
      context: 'tiff-processor',
      correlation_id: config?.correlationId
    });

    const buffer = Buffer.from(base64Tiff, 'base64');

    // Get TIFF metadata to detect page count
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const pageCount = metadata.pages || 1;

    logger.info('Processing TIFF file', {
      pageCount,
      width: metadata.width,
      height: metadata.height
    });

    const pages: ProcessedPage[] = [];

    // Extract each page
    for (let i = 0; i < pageCount; i++) {
      const pageImage = sharp(buffer, { page: i });

      // Convert to JPEG with optional downscaling
      let pipeline = pageImage;

      if (config?.maxWidth) {
        pipeline = pipeline.resize({
          width: config.maxWidth,
          withoutEnlargement: true,
          kernel: 'lanczos3'
        });
      }

      const jpegBuffer = await pipeline
        .jpeg({ quality: config?.jpegQuality || 85 })
        .toBuffer();

      const jpegMeta = await sharp(jpegBuffer).metadata();

      pages.push({
        pageNumber: i + 1,  // 1-indexed
        base64: jpegBuffer.toString('base64'),
        mime: 'image/jpeg',
        width: jpegMeta.width || 0,
        height: jpegMeta.height || 0,
        originalFormat: 'image/tiff'
      });

      logger.debug(`Extracted TIFF page ${i + 1}/${pageCount}`, {
        width: jpegMeta.width,
        height: jpegMeta.height,
        sizeBytes: jpegBuffer.length
      });
    }

    return pages;
  }
};
```

---

## Phase 2: PDF Processor (Future)

### `pdf-processor.ts`

```typescript
// Placeholder - to be implemented

import { ProcessedPage, FormatProcessorConfig } from './types';

export const pdfProcessor = {

  async extractPages(
    base64Pdf: string,
    config?: FormatProcessorConfig
  ): Promise<ProcessedPage[]> {

    // TODO: Implement using pdf-lib or pdf-parse
    // 1. Load PDF from base64
    // 2. Iterate through pages
    // 3. Render each page to image
    // 4. Convert to JPEG
    // 5. Return ProcessedPage array

    throw new Error('PDF processing not yet implemented');
  }
};
```

---

## Phase 3: HEIC Processor (Future)

### `heic-processor.ts`

```typescript
// Placeholder - to be implemented

import { ProcessedPage, FormatProcessorConfig } from './types';

export const heicProcessor = {

  async convertToJpeg(
    base64Heic: string,
    config?: FormatProcessorConfig
  ): Promise<ProcessedPage[]> {

    // TODO: Implement using libheif or convert library
    // 1. Decode HEIC from base64
    // 2. Convert to JPEG
    // 3. Return single-page ProcessedPage array

    throw new Error('HEIC conversion not yet implemented');
  }
};
```

---

## Integration with Worker

### Current Worker Flow (Broken):
```typescript
// worker.ts - BEFORE
const ocrResult = await processWithGoogleVisionOCR(base64, mimeType);
// Problem: Only processes first page of TIFF/PDF
```

### New Worker Flow (Fixed):
```typescript
// worker.ts - AFTER
import { preprocessForOCR } from './utils/format-processor';

// Step 1: Preprocess format (extract pages if needed)
const preprocessed = await preprocessForOCR(base64, mimeType, {
  maxWidth: 1600,
  jpegQuality: 85,
  correlationId: this.logger['correlation_id']
});

// Step 2: Process each page through OCR
const ocrPages: OCRPageResult[] = [];

for (const page of preprocessed.pages) {
  const pageOCR = await processWithGoogleVisionOCR(
    page.base64,
    'image/jpeg'  // Always JPEG after preprocessing
  );

  ocrPages.push({
    pageNumber: page.pageNumber,
    ocrResult: pageOCR
  });
}

// Step 3: Combine OCR results with correct page numbers
const combinedOCR = combineOCRPages(ocrPages);
```

---

## Dependencies

### Existing (Already in project):
- `sharp` - TIFF, JPEG, PNG processing ✓

### New (Phase 2):
- `pdf-lib` or `pdf-parse` - PDF page extraction
- Need to research which is better for page rendering

### New (Phase 3):
- `libheif` or `heic-convert` - HEIC conversion
- Platform-specific installation challenges

---

## Performance Considerations

### Memory Management:
- **Stream processing** for large files (>50MB)
- **Page-by-page extraction** (not all at once)
- **Buffer reuse** where possible

### Time Budget:
- TIFF page extraction: ~200ms per page
- PDF page extraction: ~300ms per page (estimated)
- HEIC conversion: ~500ms (estimated)

### Example (142-page PDF):
- Extraction: 142 pages × 300ms = 42.6 seconds
- This is acceptable vs data loss

---

## Error Handling

### Graceful Degradation:
1. If page extraction fails → log error, return pages processed so far
2. If conversion fails → fallback to original format (may fail at OCR)
3. If unsupported format → throw clear error message

### Logging:
- Log page count detected
- Log each page extraction
- Log total processing time
- Log any errors with page numbers

---

## Testing Strategy

### Unit Tests:
- Test each processor independently
- Mock Sharp/PDF library calls
- Test edge cases (1-page, 100+ pages, corrupted files)

### Integration Tests:
- Real test files (Xavier's 2-page TIFF)
- Real 142-page PDF
- Real HEIC iPhone photo

### Performance Tests:
- Measure extraction time vs file size
- Memory usage profiling

---

**Last Updated:** October 31, 2025
**Status:** Architecture complete, ready for implementation
