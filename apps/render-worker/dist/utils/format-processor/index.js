"use strict";
/**
 * Format Processor - Main Entry Point
 *
 * Pre-processes files before OCR to handle multi-page formats and conversions.
 *
 * PROBLEM:
 * - Google Cloud Vision OCR only processes the first page of multi-page files
 * - Multi-page TIFFs lose all pages after page 1 (discovered Oct 31, 2025)
 * - PDFs can't be sent directly to Vision API
 *
 * SOLUTION:
 * - Extract all pages from multi-page formats (TIFF, PDF)
 * - Convert each page to JPEG
 * - Return array of pages for OCR processing
 * - Worker sends each page separately to OCR, then combines results
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.preprocessForOCR = preprocessForOCR;
const tiff_processor_1 = require("./tiff-processor");
const pdf_processor_1 = require("./pdf-processor");
/**
 * Preprocess a file for OCR
 *
 * Routes to appropriate processor based on MIME type:
 * - Multi-page TIFF → Extract pages, convert to JPEG (Phase 1 ✅)
 * - Multi-page PDF → Extract pages, convert to JPEG (Phase 2 ✅)
 * - Single-page JPEG/PNG → Pass through (no conversion needed)
 * - HEIC → Convert to JPEG (Phase 3 - not yet implemented)
 *
 * @param base64Data - Base64-encoded file data
 * @param mimeType - MIME type of the file
 * @param config - Optional configuration
 * @returns Preprocessed pages ready for OCR
 */
async function preprocessForOCR(base64Data, mimeType, config) {
    const startTime = Date.now();
    const correlationId = config?.correlationId;
    console.log('[Format Processor] Starting preprocessing', {
        correlationId,
        mimeType,
        hasConfig: !!config,
    });
    // Phase 1: TIFF Support (IMPLEMENTED)
    if (mimeType === 'image/tiff' || mimeType === 'image/tif') {
        const pages = await (0, tiff_processor_1.extractTiffPages)(base64Data, config?.maxWidth, config?.jpegQuality, correlationId);
        return {
            pages,
            totalPages: pages.length,
            processingTimeMs: Date.now() - startTime,
            originalFormat: mimeType,
            conversionApplied: true,
        };
    }
    // Phase 2: PDF Support (IMPLEMENTED)
    if (mimeType === 'application/pdf') {
        const pages = await (0, pdf_processor_1.extractPdfPages)(base64Data, config?.maxWidth, config?.jpegQuality, correlationId);
        return {
            pages,
            totalPages: pages.length,
            processingTimeMs: Date.now() - startTime,
            originalFormat: mimeType,
            conversionApplied: true,
        };
    }
    // Phase 3: HEIC/HEIF Support (NOT YET IMPLEMENTED)
    if (mimeType === 'image/heic' || mimeType === 'image/heif') {
        throw new Error('HEIC/HEIF format not yet supported. Phase 3 implementation pending. ' +
            'See: shared/docs/.../upload-file-format-optimization-module/IMPLEMENTATION_PLAN.md');
    }
    // Pass-through for already-supported single-page formats
    if (mimeType === 'image/jpeg' ||
        mimeType === 'image/jpg' ||
        mimeType === 'image/png' ||
        mimeType === 'image/gif' ||
        mimeType === 'image/bmp' ||
        mimeType === 'image/webp') {
        console.log('[Format Processor] Pass-through (no conversion needed)', {
            correlationId,
            mimeType,
            processingTimeMs: Date.now() - startTime,
        });
        // Return as-is (single page, no conversion)
        return {
            pages: [
                {
                    pageNumber: 1,
                    base64: base64Data,
                    mime: 'image/jpeg', // Note: We claim JPEG even if it's PNG/etc for simplicity
                    width: 0, // Unknown (not extracted)
                    height: 0, // Unknown (not extracted)
                    originalFormat: mimeType,
                },
            ],
            totalPages: 1,
            processingTimeMs: Date.now() - startTime,
            originalFormat: mimeType,
            conversionApplied: false,
        };
    }
    // Unsupported format
    throw new Error(`Unsupported format for OCR preprocessing: ${mimeType}. ` +
        `Supported formats: TIFF (Phase 1 ✅), PDF (Phase 2 ✅), JPEG, PNG, GIF, BMP, WebP. ` +
        `Coming soon: HEIC/HEIF (Phase 3).`);
}
//# sourceMappingURL=index.js.map