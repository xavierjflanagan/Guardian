/**
 * Image Processing Utilities
 * Created: 2025-10-06
 * Purpose: Optimize images before sending to AI models
 */

import sharp from 'sharp';

/**
 * Downscale and compress an image to reduce token usage
 *
 * @param base64Data - Base64 encoded image data
 * @param maxWidth - Maximum width in pixels (default: 1600)
 * @param quality - JPEG quality 0-100 (default: 75)
 * @returns Optimized base64 encoded image
 */
export async function downscaleImage(
  base64Data: string,
  maxWidth: number = 1600,
  quality: number = 75
): Promise<string> {
  try {
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Get image metadata to check current dimensions
    const metadata = await sharp(buffer).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    console.log(`[ImageProcessing] Original dimensions: ${originalWidth}x${originalHeight}`);

    // If image is already smaller than maxWidth, just compress it
    if (originalWidth <= maxWidth) {
      console.log(`[ImageProcessing] Image already optimal size, compressing only`);
      const compressed = await sharp(buffer)
        .jpeg({ quality })
        .toBuffer();

      const compressionRatio = ((1 - compressed.length / buffer.length) * 100).toFixed(1);
      console.log(`[ImageProcessing] Compressed: ${buffer.length} → ${compressed.length} bytes (${compressionRatio}% reduction)`);

      return compressed.toString('base64');
    }

    // Resize and compress
    const resized = await sharp(buffer)
      .resize(maxWidth, null, {
        withoutEnlargement: true,
        fit: 'inside'
      })
      .jpeg({ quality })
      .toBuffer();

    const newMetadata = await sharp(resized).metadata();
    const reductionRatio = ((1 - resized.length / buffer.length) * 100).toFixed(1);

    console.log(`[ImageProcessing] Resized: ${originalWidth}x${originalHeight} → ${newMetadata.width}x${newMetadata.height}`);
    console.log(`[ImageProcessing] Size reduction: ${buffer.length} → ${resized.length} bytes (${reductionRatio}% reduction)`);

    return resized.toString('base64');
  } catch (error) {
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
export function estimateTokenReduction(originalSize: number, optimizedSize: number): number {
  // Rough approximation: token count is proportional to file size
  return ((1 - optimizedSize / originalSize) * 100);
}
