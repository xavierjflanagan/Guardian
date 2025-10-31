/**
 * TIFF Page Extraction Processor
 *
 * Extracts all pages from multi-page TIFF files and converts them to JPEG.
 * Uses Sharp library for image processing.
 */

import sharp from 'sharp';
import type { ProcessedPage } from './types';

/**
 * Extract all pages from a multi-page TIFF file
 *
 * @param base64Tiff - Base64-encoded TIFF data
 * @param maxWidth - Optional maximum width for downscaling (default: 1600)
 * @param quality - JPEG quality 1-100 (default: 85)
 * @param correlationId - Optional correlation ID for logging
 * @returns Array of processed pages
 */
export async function extractTiffPages(
  base64Tiff: string,
  maxWidth = 1600,
  quality = 85,
  correlationId?: string
): Promise<ProcessedPage[]> {
  const startTime = Date.now();

  // Step 1: Decode base64 to buffer
  const buffer = Buffer.from(base64Tiff, 'base64');

  // Step 2: Load TIFF and get metadata
  const image = sharp(buffer);
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

  // Step 4: Extract each page
  const pages: ProcessedPage[] = [];

  for (let i = 0; i < pageCount; i++) {
    const pageStartTime = Date.now();

    console.log(`[TIFF Processor] Extracting page ${i + 1}/${pageCount}`, {
      correlationId,
      pageNumber: i + 1,
    });

    // Load specific page from TIFF
    const pageImage = sharp(buffer, { page: i });

    // Get page metadata
    const pageMeta = await pageImage.metadata();

    // Build processing pipeline
    let pipeline = pageImage;

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
    const jpegMeta = await sharp(jpegBuffer).metadata();

    const pageProcessingTime = Date.now() - pageStartTime;

    console.log(`[TIFF Processor] Page ${i + 1} processed`, {
      correlationId,
      pageNumber: i + 1,
      outputWidth: jpegMeta.width,
      outputHeight: jpegMeta.height,
      outputSizeBytes: jpegBuffer.length,
      processingTimeMs: pageProcessingTime,
    });

    // Store processed page
    pages.push({
      pageNumber: i + 1, // 1-indexed for user display
      base64: jpegBuffer.toString('base64'),
      mime: 'image/jpeg',
      width: jpegMeta.width || 0,
      height: jpegMeta.height || 0,
      originalFormat: 'image/tiff',
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
