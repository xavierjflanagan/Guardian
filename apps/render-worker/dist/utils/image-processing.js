"use strict";
/**
 * Image Processing Utilities - Phase 2: Format-Preserving Downscaling
 * Created: 2025-10-06, Enhanced: 2025-10-10
 * Purpose: Optimize images before OCR while preserving format and quality
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downscaleImageBase64 = downscaleImageBase64;
exports.downscaleImage = downscaleImage;
exports.estimateTokenReduction = estimateTokenReduction;
const sharp_1 = __importDefault(require("sharp"));
const logger_1 = require("./logger");
/**
 * Phase 2: Format-preserving downscaling with comprehensive format support
 *
 * @param b64 - Base64 encoded image data
 * @param mime - MIME type of the image
 * @param maxWidth - Maximum width in pixels (default: 1600)
 * @param quality - Quality for lossy formats (default: 78)
 * @param correlationId - Optional correlation ID for request tracing
 * @returns Processed image with dimensions and output MIME type
 */
async function downscaleImageBase64(b64, mime, maxWidth = 1600, quality = 78, correlationId) {
    const startTime = Date.now();
    const logger = (0, logger_1.createLogger)({
        context: 'image-processing',
        correlation_id: correlationId,
    });
    // PDF handling - skip downscaling, let OCR handle directly
    if (mime === 'application/pdf') {
        logger.info('PDF detected - skipping downscaling (OCR handles directly)', {
            mime,
            decision: 'skip_downscaling',
            reason: 'pdf_native_ocr',
        });
        return { b64, width: 0, height: 0, outMime: mime };
    }
    // DICOM not supported for OCR
    if (mime === 'application/dicom') {
        throw new Error('DICOM files not supported for OCR processing');
    }
    // HEIC: Not supported by Google Cloud Vision (Phase 3+ will add conversion)
    if (mime === 'image/heic' || mime === 'image/heif') {
        throw new Error('HEIC/HEIF files not yet supported. Format conversion planned for Phase 3 (post-Phase 2). Timeline: 2-3 weeks after Phase 2 completion.');
    }
    // Office documents: Future text extraction support
    if (mime.startsWith('application/vnd.openxmlformats') ||
        mime === 'application/msword' ||
        mime === 'application/vnd.ms-excel') {
        throw new Error('Office document processing planned for Phase 4. Timeline: 4-6 weeks after Phase 2 completion.');
    }
    // Archive formats: Future bulk processing support
    if (mime === 'application/zip' || mime === 'application/x-rar-compressed') {
        throw new Error('Archive processing planned for Phase 5. Timeline: 8-10 weeks after Phase 2 completion.');
    }
    const buf = Buffer.from(b64, 'base64');
    const img = (0, sharp_1.default)(buf, { failOn: 'none' }).rotate(); // Respect EXIF
    const meta = await img.metadata();
    // Guard against missing dimensions
    if (!meta.width || !meta.height) {
        logger.warn('Missing dimensions - skipping downscaling', {
            mime,
            decision: 'skip_downscaling',
            reason: 'missing_dimensions',
        });
        return { b64, width: 0, height: 0, outMime: mime };
    }
    // GUARDRAIL: Skip if not larger than target
    if (meta.width <= maxWidth) {
        logger.info('Image within target size - skipping downscaling', {
            mime,
            original_width_px: meta.width,
            original_height_px: meta.height,
            max_width_px: maxWidth,
            decision: 'skip_downscaling',
            reason: 'within_target_size',
        });
        return { b64, width: meta.width, height: meta.height, outMime: mime };
    }
    // GUARDRAIL: Skip multi-page formats (let OCR handle natively)
    if (mime === 'image/tiff' || mime === 'application/pdf') {
        logger.info('Multi-page format - skipping downscaling (OCR handles natively)', {
            mime,
            original_width_px: meta.width,
            original_height_px: meta.height,
            decision: 'skip_downscaling',
            reason: 'multi_page_format',
        });
        return { b64, width: meta.width, height: meta.height, outMime: mime };
    }
    // Format-specific processing
    try {
        if (mime === 'image/jpeg') {
            const out = await img.resize({ width: maxWidth, withoutEnlargement: true, kernel: 'lanczos3' })
                .jpeg({ quality, chromaSubsampling: '4:4:4', mozjpeg: true })
                .toBuffer();
            const outMeta = await (0, sharp_1.default)(out).metadata();
            const duration_ms = Date.now() - startTime;
            const originalSize = Buffer.byteLength(b64, 'base64');
            const optimizedSize = out.length;
            const sizeReduction = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
            logger.info('Image downscaled successfully', {
                mime,
                original_width_px: meta.width,
                original_height_px: meta.height,
                output_width_px: outMeta.width || 0,
                output_height_px: outMeta.height || 0,
                original_size_bytes: originalSize,
                optimized_size_bytes: optimizedSize,
                size_reduction_pct: parseFloat(sizeReduction),
                quality,
                duration_ms,
            });
            return { b64: out.toString('base64'), width: outMeta.width || 0, height: outMeta.height || 0, outMime: 'image/jpeg' };
        }
        if (mime === 'image/png') {
            const out = await img.resize({ width: maxWidth, withoutEnlargement: true, kernel: 'lanczos3' })
                .png({ compressionLevel: 9, palette: true })
                .toBuffer();
            const outMeta = await (0, sharp_1.default)(out).metadata();
            const duration_ms = Date.now() - startTime;
            const originalSize = Buffer.byteLength(b64, 'base64');
            const optimizedSize = out.length;
            const sizeReduction = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
            logger.info('Image downscaled successfully', {
                mime,
                original_width_px: meta.width,
                original_height_px: meta.height,
                output_width_px: outMeta.width || 0,
                output_height_px: outMeta.height || 0,
                original_size_bytes: originalSize,
                optimized_size_bytes: optimizedSize,
                size_reduction_pct: parseFloat(sizeReduction),
                duration_ms,
            });
            return { b64: out.toString('base64'), width: outMeta.width || 0, height: outMeta.height || 0, outMime: 'image/png' };
        }
        // WebP support (lossless for medical documents)
        if (mime === 'image/webp') {
            const out = await img.resize({ width: maxWidth, withoutEnlargement: true, kernel: 'lanczos3' })
                .webp({ lossless: true })
                .toBuffer();
            const outMeta = await (0, sharp_1.default)(out).metadata();
            const duration_ms = Date.now() - startTime;
            const originalSize = Buffer.byteLength(b64, 'base64');
            const optimizedSize = out.length;
            const sizeReduction = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
            logger.info('Image downscaled successfully', {
                mime,
                original_width_px: meta.width,
                original_height_px: meta.height,
                output_width_px: outMeta.width || 0,
                output_height_px: outMeta.height || 0,
                original_size_bytes: originalSize,
                optimized_size_bytes: optimizedSize,
                size_reduction_pct: parseFloat(sizeReduction),
                duration_ms,
            });
            return { b64: out.toString('base64'), width: outMeta.width || 0, height: outMeta.height || 0, outMime: 'image/webp' };
        }
        // NOTE: Multi-page TIFF handling moved to earlier guardrail check
        // Unknown format: skip processing
        logger.warn('Unknown format - skipping downscaling', {
            mime,
            decision: 'skip_downscaling',
            reason: 'unknown_format',
        });
        return { b64, width: meta.width, height: meta.height, outMime: mime };
    }
    catch (error) {
        logger.error('Error processing image - falling back to original', error, {
            mime,
            original_width_px: meta.width,
            original_height_px: meta.height,
        });
        // Fallback to original
        return { b64, width: meta.width || 0, height: meta.height || 0, outMime: mime };
    }
}
/**
 * Legacy function for backward compatibility
 * @deprecated Use downscaleImageBase64 for Phase 2+ implementations
 */
async function downscaleImage(base64Data, maxWidth = 1600, quality = 75) {
    const logger = (0, logger_1.createLogger)({
        context: 'image-processing',
    });
    logger.warn('Using legacy downscaleImage - consider upgrading to downscaleImageBase64', {
        function: 'downscaleImage',
        recommendation: 'use_downscaleImageBase64',
    });
    const result = await downscaleImageBase64(base64Data, 'image/jpeg', maxWidth, quality);
    return result.b64;
}
/**
 * Estimate token reduction from image optimization
 *
 * @param originalSize - Original file size in bytes
 * @param optimizedSize - Optimized file size in bytes
 * @returns Estimated token reduction percentage
 */
function estimateTokenReduction(originalSize, optimizedSize) {
    // Rough approximation: token count is proportional to file size
    return ((1 - optimizedSize / originalSize) * 100);
}
//# sourceMappingURL=image-processing.js.map