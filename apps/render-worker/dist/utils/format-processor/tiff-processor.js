"use strict";
/**
 * TIFF Page Extraction Processor
 *
 * Extracts all pages from multi-page TIFF files and converts them to JPEG.
 * Uses Sharp library for image processing.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTiffPages = extractTiffPages;
const sharp_1 = __importDefault(require("sharp"));
/**
 * Extract all pages from a multi-page TIFF file
 *
 * @param base64Tiff - Base64-encoded TIFF data
 * @param maxWidth - Optional maximum width for downscaling (default: 1600)
 * @param quality - JPEG quality 1-100 (default: 85)
 * @param correlationId - Optional correlation ID for logging
 * @returns Array of processed pages
 */
async function extractTiffPages(base64Tiff, maxWidth = 1600, quality = 85, correlationId) {
    const startTime = Date.now();
    // Step 1: Decode base64 to buffer
    const buffer = Buffer.from(base64Tiff, 'base64');
    // Step 2: Load TIFF and get metadata
    const image = (0, sharp_1.default)(buffer);
    const metadata = await image.metadata();
    // Step 3: Get page count (defaults to 1 for single-page TIFF)
    const pageCount = metadata.pages || 1;
    console.log(`[TIFF Processor] Processing ${pageCount} pages from TIFF`, {
        correlationId,
        pageCount,
        originalFormat: metadata.format,
        originalWidth: metadata.width,
        originalHeight: metadata.height,
    });
    // Step 4: Extract each page (with per-page error handling)
    const pages = [];
    const pageErrors = [];
    for (let i = 0; i < pageCount; i++) {
        const pageNumber = i + 1;
        const pageStartTime = Date.now();
        console.log(`[TIFF Processor] Extracting page ${pageNumber}/${pageCount}`, {
            correlationId,
            pageNumber,
        });
        try {
            // Load specific page from TIFF
            const pageImage = (0, sharp_1.default)(buffer, { page: i });
            // Get page metadata
            const pageMeta = await pageImage.metadata();
            // Build processing pipeline with EXIF auto-rotation
            let pipeline = pageImage.rotate(); // Auto-rotate using EXIF orientation
            // Optional: Downscale if needed
            if (maxWidth && pageMeta.width && pageMeta.width > maxWidth) {
                pipeline = pipeline.resize({
                    width: maxWidth,
                    withoutEnlargement: true,
                    kernel: 'lanczos3', // High-quality resampling
                });
            }
            // Convert to JPEG
            const jpegBuffer = await pipeline
                .jpeg({
                quality,
                chromaSubsampling: '4:4:4', // Best quality
                mozjpeg: true, // Better compression
            })
                .toBuffer();
            // Get dimensions of output JPEG
            const jpegMeta = await (0, sharp_1.default)(jpegBuffer).metadata();
            const pageProcessingTime = Date.now() - pageStartTime;
            console.log(`[TIFF Processor] Page ${pageNumber} processed`, {
                correlationId,
                pageNumber,
                outputWidth: jpegMeta.width,
                outputHeight: jpegMeta.height,
                outputSizeBytes: jpegBuffer.length,
                processingTimeMs: pageProcessingTime,
            });
            // Store successfully processed page
            pages.push({
                pageNumber, // 1-indexed for user display
                base64: jpegBuffer.toString('base64'),
                mime: 'image/jpeg',
                width: jpegMeta.width || 0,
                height: jpegMeta.height || 0,
                originalFormat: 'image/tiff',
            });
        }
        catch (pageError) {
            // Page processing failed - add error page
            console.error(`[TIFF Processor] Page ${pageNumber} failed`, {
                correlationId,
                pageNumber,
                error: pageError instanceof Error ? pageError.message : String(pageError),
            });
            pages.push({
                pageNumber,
                base64: null,
                mime: 'image/jpeg',
                width: 0,
                height: 0,
                originalFormat: 'image/tiff',
                error: {
                    message: pageError instanceof Error ? pageError.message : String(pageError),
                    code: 'PAGE_PROCESSING_FAILED',
                    details: pageError,
                },
            });
            pageErrors.push({
                pageNumber,
                error: pageError instanceof Error ? pageError.message : String(pageError),
            });
        }
    }
    // Check if ALL pages failed
    const successfulPages = pages.filter(p => p.base64).length;
    if (successfulPages === 0) {
        throw new Error(`All ${pageCount} pages failed to process. ` +
            `First error: ${pageErrors[0]?.error || 'Unknown'}`);
    }
    // Log partial success if some pages failed
    if (pageErrors.length > 0) {
        console.warn(`[TIFF Processor] Partial success: ${successfulPages}/${pageCount} pages processed`, {
            correlationId,
            successfulPages,
            failedPages: pageErrors.length,
            failedPageNumbers: pageErrors.map(e => e.pageNumber).join(', '),
        });
    }
    const totalTime = Date.now() - startTime;
    console.log(`[TIFF Processor] Extraction complete`, {
        correlationId,
        totalPages: pageCount,
        totalProcessingTimeMs: totalTime,
        averageTimePerPageMs: Math.round(totalTime / pageCount),
    });
    return pages;
}
//# sourceMappingURL=tiff-processor.js.map