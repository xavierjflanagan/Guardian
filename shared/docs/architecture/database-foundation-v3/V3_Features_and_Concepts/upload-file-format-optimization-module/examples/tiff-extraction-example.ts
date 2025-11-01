/**
 * TIFF Page Extraction - Example Implementation
 *
 * This is a prototype/example showing how TIFF page extraction will work.
 * Not final implementation - for planning purposes only.
 */

import sharp from 'sharp';

interface ProcessedPage {
  pageNumber: number;
  base64: string;
  mime: 'image/jpeg';
  width: number;
  height: number;
  originalFormat?: string;
}

/**
 * Extract all pages from multi-page TIFF and convert to JPEG
 *
 * @param base64Tiff - Base64 encoded TIFF data
 * @param maxWidth - Optional max width for downscaling
 * @param quality - JPEG quality (1-100)
 * @returns Array of processed pages
 */
export async function extractTiffPages(
  base64Tiff: string,
  maxWidth = 1600,
  quality = 85
): Promise<ProcessedPage[]> {

  // Step 1: Decode base64 to buffer
  const buffer = Buffer.from(base64Tiff, 'base64');

  // Step 2: Use Sharp to load TIFF and get metadata
  const image = sharp(buffer);
  const metadata = await image.metadata();

  // Step 3: Get page count (defaults to 1 for single-page)
  const pageCount = metadata.pages || 1;

  console.log(`TIFF has ${pageCount} pages`);

  // Step 4: Extract each page
  const pages: ProcessedPage[] = [];

  for (let i = 0; i < pageCount; i++) {
    console.log(`Extracting page ${i + 1}/${pageCount}...`);

    // Load specific page from TIFF
    const pageImage = sharp(buffer, { page: i });

    // Optional: Downscale if needed
    let pipeline = pageImage;
    if (maxWidth) {
      pipeline = pipeline.resize({
        width: maxWidth,
        withoutEnlargement: true,
        kernel: 'lanczos3'  // High-quality resampling
      });
    }

    // Convert to JPEG
    const jpegBuffer = await pipeline
      .jpeg({
        quality,
        chromaSubsampling: '4:4:4',  // Best quality
        mozjpeg: true                // Better compression
      })
      .toBuffer();

    // Get dimensions of output JPEG
    const jpegMeta = await sharp(jpegBuffer).metadata();

    // Store processed page
    pages.push({
      pageNumber: i + 1,  // 1-indexed for user display
      base64: jpegBuffer.toString('base64'),
      mime: 'image/jpeg',
      width: jpegMeta.width || 0,
      height: jpegMeta.height || 0,
      originalFormat: 'image/tiff'
    });

    console.log(`Page ${i + 1}: ${jpegMeta.width}x${jpegMeta.height}, ${jpegBuffer.length} bytes`);
  }

  return pages;
}

/**
 * Example usage:
 */
async function exampleUsage() {
  // Assume we have a 2-page TIFF as base64
  const base64Tiff = '...'; // From file upload

  // Extract pages
  const pages = await extractTiffPages(base64Tiff);

  console.log(`Extracted ${pages.length} pages`);

  // Now send each page to OCR
  for (const page of pages) {
    console.log(`Processing page ${page.pageNumber}...`);
    // await processWithGoogleVisionOCR(page.base64, 'image/jpeg');
  }
}

/**
 * Test case: Xavier's 2-page TIFF
 *
 * Input: Xavier_combined_2page_medication_and_lab.tiff
 * - Page 1: 1827x2533 (medication box)
 * - Page 2: 3024x4032 (lab report)
 *
 * Expected output:
 * [
 *   {
 *     pageNumber: 1,
 *     base64: '...',
 *     mime: 'image/jpeg',
 *     width: 1600,
 *     height: 2218,
 *     originalFormat: 'image/tiff'
 *   },
 *   {
 *     pageNumber: 2,
 *     base64: '...',
 *     mime: 'image/jpeg',
 *     width: 1600,
 *     height: 2133,
 *     originalFormat: 'image/tiff'
 *   }
 * ]
 */
