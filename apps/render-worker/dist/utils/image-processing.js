"use strict";
/**
 * Image Processing Utilities
 * Created: 2025-10-06
 * Purpose: Optimize images before sending to AI models
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downscaleImage = downscaleImage;
exports.estimateTokenReduction = estimateTokenReduction;
const sharp_1 = __importDefault(require("sharp"));
/**
 * Downscale and compress an image to reduce token usage
 *
 * @param base64Data - Base64 encoded image data
 * @param maxWidth - Maximum width in pixels (default: 1600)
 * @param quality - JPEG quality 0-100 (default: 75)
 * @returns Optimized base64 encoded image
 */
async function downscaleImage(base64Data, maxWidth = 1600, quality = 75) {
    try {
        // Convert base64 to buffer
        const buffer = Buffer.from(base64Data, 'base64');
        // Get image metadata to check current dimensions
        const metadata = await (0, sharp_1.default)(buffer).metadata();
        const originalWidth = metadata.width || 0;
        const originalHeight = metadata.height || 0;
        console.log(`[ImageProcessing] Original dimensions: ${originalWidth}x${originalHeight}`);
        // If image is already smaller than maxWidth, just compress it
        if (originalWidth <= maxWidth) {
            console.log(`[ImageProcessing] Image already optimal size, compressing only`);
            const compressed = await (0, sharp_1.default)(buffer)
                .jpeg({ quality })
                .toBuffer();
            const compressionRatio = ((1 - compressed.length / buffer.length) * 100).toFixed(1);
            console.log(`[ImageProcessing] Compressed: ${buffer.length} → ${compressed.length} bytes (${compressionRatio}% reduction)`);
            return compressed.toString('base64');
        }
        // Resize and compress
        const resized = await (0, sharp_1.default)(buffer)
            .resize(maxWidth, null, {
            withoutEnlargement: true,
            fit: 'inside'
        })
            .jpeg({ quality })
            .toBuffer();
        const newMetadata = await (0, sharp_1.default)(resized).metadata();
        const reductionRatio = ((1 - resized.length / buffer.length) * 100).toFixed(1);
        console.log(`[ImageProcessing] Resized: ${originalWidth}x${originalHeight} → ${newMetadata.width}x${newMetadata.height}`);
        console.log(`[ImageProcessing] Size reduction: ${buffer.length} → ${resized.length} bytes (${reductionRatio}% reduction)`);
        return resized.toString('base64');
    }
    catch (error) {
        console.error('[ImageProcessing] Error processing image:', error);
        // On error, return original image
        console.warn('[ImageProcessing] Returning original image due to processing error');
        return base64Data;
    }
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