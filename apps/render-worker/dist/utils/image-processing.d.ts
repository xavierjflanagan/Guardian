/**
 * Image Processing Utilities - Phase 2: Format-Preserving Downscaling
 * Created: 2025-10-06, Enhanced: 2025-10-10
 * Purpose: Optimize images before OCR while preserving format and quality
 */
/**
 * Phase 2: Format-preserving downscaling with comprehensive format support
 *
 * @param b64 - Base64 encoded image data
 * @param mime - MIME type of the image
 * @param maxWidth - Maximum width in pixels (default: 1600)
 * @param quality - Quality for lossy formats (default: 78)
 * @returns Processed image with dimensions and output MIME type
 */
export declare function downscaleImageBase64(b64: string, mime: string, maxWidth?: number, quality?: number): Promise<{
    b64: string;
    width: number;
    height: number;
    outMime: string;
}>;
/**
 * Legacy function for backward compatibility
 * @deprecated Use downscaleImageBase64 for Phase 2+ implementations
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