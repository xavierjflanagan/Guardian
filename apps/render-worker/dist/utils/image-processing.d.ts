/**
 * Image Processing Utilities
 * Created: 2025-10-06
 * Purpose: Optimize images before sending to AI models
 */
/**
 * Downscale and compress an image to reduce token usage
 *
 * @param base64Data - Base64 encoded image data
 * @param maxWidth - Maximum width in pixels (default: 1600)
 * @param quality - JPEG quality 0-100 (default: 75)
 * @returns Optimized base64 encoded image
 */
export declare function downscaleImage(base64Data: string, maxWidth?: number, quality?: number): Promise<string>;
/**
 * Estimate token reduction from image optimization
 *
 * @param originalSize - Original file size in bytes
 * @param optimizedSize - Optimized file size in bytes
 * @returns Estimated token reduction percentage
 */
export declare function estimateTokenReduction(originalSize: number, optimizedSize: number): number;
//# sourceMappingURL=image-processing.d.ts.map