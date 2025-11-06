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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.preprocessForOCR = preprocessForOCR;
const tiff_processor_1 = require("./tiff-processor");
const pdf_processor_1 = require("./pdf-processor");
const heic_convert_1 = __importDefault(require("heic-convert"));
// MEMORY OPTIMIZATION: Lazy load Sharp only when needed (saves ~60MB at startup)
// import sharp from 'sharp';  // OLD: Eager load
// Lazy loader for Sharp - only loads when first image processing is needed
let sharpInstance = null;
async function getSharp() {
    if (!sharpInstance) {
        sharpInstance = (await Promise.resolve().then(() => __importStar(require('sharp')))).default;
    }
    return sharpInstance;
}
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
            successfulPages: pages.filter(p => p.base64).length,
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
            successfulPages: pages.filter(p => p.base64).length,
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
            // Extract dimensions from converted JPEG using Sharp (lazy loaded)
            const sharp = await getSharp();
            const jpegMeta = await sharp(jpegBuffer).metadata();
            const heicProcessingTime = Date.now() - heicStartTime;
            console.log('[Format Processor] HEIC conversion complete', {
                correlationId,
                inputSizeBytes: heicBuffer.length,
                outputSizeBytes: jpegBuffer.length,
                dimensions: `${jpegMeta.width}x${jpegMeta.height}`,
                processingTimeMs: heicProcessingTime,
            });
            // Return as single-page JPEG
            return {
                pages: [
                    {
                        pageNumber: 1,
                        base64: jpegBuffer.toString('base64'),
                        mime: 'image/jpeg',
                        width: jpegMeta.width || 0, // Real dimensions from metadata
                        height: jpegMeta.height || 0, // Real dimensions from metadata
                        originalFormat: mimeType,
                    },
                ],
                totalPages: 1,
                successfulPages: 1,
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
        console.log('[Format Processor] Processing single-page image', {
            correlationId,
            mimeType,
        });
        try {
            // Decode base64 to buffer
            const buffer = Buffer.from(base64Data, 'base64');
            // Process through Sharp for EXIF auto-rotation, optimization, and dimension extraction (lazy loaded)
            const sharp = await getSharp();
            const pipeline = sharp(buffer)
                .rotate() // Auto-rotate using EXIF orientation (critical for iPhone photos)
                .resize(config?.maxWidth || 1600, null, {
                fit: 'inside',
                withoutEnlargement: true,
            })
                .jpeg({ quality: config?.jpegQuality || 85 });
            const optimizedBuffer = await pipeline.toBuffer();
            const metadata = await sharp(optimizedBuffer).metadata();
            console.log('[Format Processor] Image processing complete', {
                correlationId,
                inputSizeBytes: buffer.length,
                outputSizeBytes: optimizedBuffer.length,
                dimensions: `${metadata.width}x${metadata.height}`,
                processingTimeMs: Date.now() - startTime,
            });
            // Return processed JPEG with metadata
            return {
                pages: [
                    {
                        pageNumber: 1,
                        base64: optimizedBuffer.toString('base64'),
                        mime: 'image/jpeg',
                        width: metadata.width || 0,
                        height: metadata.height || 0,
                        originalFormat: mimeType,
                    },
                ],
                totalPages: 1,
                successfulPages: 1,
                processingTimeMs: Date.now() - startTime,
                originalFormat: mimeType,
                conversionApplied: mimeType !== 'image/jpeg' && mimeType !== 'image/jpg',
            };
        }
        catch (error) {
            console.error('[Format Processor] Image processing failed', {
                correlationId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw new Error(`Image processing failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // Unsupported format
    throw new Error(`Unsupported format for OCR preprocessing: ${mimeType}. ` +
        `Supported formats: TIFF (Phase 1 ✅), PDF (Phase 2 ✅), JPEG, PNG, GIF, BMP, WebP. ` +
        `Coming soon: HEIC/HEIF (Phase 3).`);
}
//# sourceMappingURL=index.js.map