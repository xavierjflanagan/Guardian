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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.preprocessForOCR = preprocessForOCR;
const tiff_processor_1 = require("./tiff-processor");
const pdf_processor_1 = require("./pdf-processor");
const heic_convert_1 = __importDefault(require("heic-convert"));
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
    // Phase 3: HEIC/HEIF Support (IMPLEMENTED)
    if (mimeType === 'image/heic' || mimeType === 'image/heif') {
        console.log('[Format Processor] Converting HEIC to JPEG', {
            correlationId,
            mimeType,
        });
        const heicStartTime = Date.now();
        try {
            // Decode base64 to buffer
            const heicBuffer = Buffer.from(base64Data, 'base64');
            // Convert HEIC to JPEG using heic-convert (pure JavaScript)
            // Note: Type definitions say ArrayBufferLike, but runtime requires iterable (Uint8Array)
            const jpegArrayBuffer = await (0, heic_convert_1.default)({
                buffer: new Uint8Array(heicBuffer),
                format: 'JPEG',
                quality: config?.jpegQuality || 0.85, // 0-1 scale (converts from 0-100)
            });
            // Wrap ArrayBuffer in Node.js Buffer for convenience methods
            const jpegBuffer = Buffer.from(jpegArrayBuffer);
            const heicProcessingTime = Date.now() - heicStartTime;
            console.log('[Format Processor] HEIC conversion complete', {
                correlationId,
                inputSizeBytes: heicBuffer.length,
                outputSizeBytes: jpegBuffer.length,
                processingTimeMs: heicProcessingTime,
            });
            // Return as single-page JPEG
            return {
                pages: [
                    {
                        pageNumber: 1,
                        base64: jpegBuffer.toString('base64'),
                        mime: 'image/jpeg',
                        width: 0, // Unknown (heic-convert doesn't provide dimensions)
                        height: 0, // Unknown
                        originalFormat: mimeType,
                    },
                ],
                totalPages: 1,
                processingTimeMs: Date.now() - startTime,
                originalFormat: mimeType,
                conversionApplied: true,
            };
        }
        catch (error) {
            console.error('[Format Processor] HEIC conversion failed', {
                correlationId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw new Error(`HEIC conversion failed: ${error instanceof Error ? error.message : String(error)}`);
        }
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