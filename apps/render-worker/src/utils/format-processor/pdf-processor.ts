/**
 * PDF Page Extraction Processor
 *
 * Extracts all pages from multi-page PDF files and converts them to JPEG.
 * Uses Poppler (via node-poppler) for PDF rendering.
 */

import { Poppler } from 'node-poppler';
// MEMORY OPTIMIZATION: Lazy load Sharp only when needed (saves ~60MB at startup)
// import sharp from 'sharp';  // OLD: Eager load
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { ProcessedPage } from './types';

// Lazy loader for Sharp - only loads when first PDF is processed
let sharpInstance: typeof import('sharp') | null = null;
async function getSharp() {
  if (!sharpInstance) {
    sharpInstance = (await import('sharp')).default;
  }
  return sharpInstance;
}

// JPEG optimization configuration from environment variables
const JPEG_QUALITY = parseInt(process.env.JPEG_QUALITY || '75', 10);
const JPEG_CHROMA_SUBSAMPLING = (process.env.JPEG_CHROMA_SUBSAMPLING || '4:2:0') as '4:4:4' | '4:2:2' | '4:2:0';

// Validate JPEG quality range
if (JPEG_QUALITY < 1 || JPEG_QUALITY > 100) {
  console.warn(`[PDF Processor] Invalid JPEG_QUALITY=${JPEG_QUALITY}, using default 75`);
}

// Log configuration on module load
console.log(`[PDF Processor] JPEG Configuration:`, {
  quality: JPEG_QUALITY,
  chromaSubsampling: JPEG_CHROMA_SUBSAMPLING,
  source: process.env.JPEG_QUALITY ? 'environment' : 'default',
});

/**
 * Extract all pages from a PDF file
 *
 * @param base64Pdf - Base64-encoded PDF data
 * @param maxWidth - Optional maximum width for downscaling (default: 1600)
 * @param quality - JPEG quality 1-100 (default: from JPEG_QUALITY env var or 75)
 * @param correlationId - Optional correlation ID for logging
 * @returns Array of processed pages
 */
export async function extractPdfPages(
  base64Pdf: string,
  maxWidth = 1600,
  quality = JPEG_QUALITY,
  correlationId?: string
): Promise<ProcessedPage[]> {
  const startTime = Date.now();
  const sessionId = randomUUID();

  // Create temp directory for this extraction session
  const tempDir = join(tmpdir(), `pdf-extract-${sessionId}`);
  await fs.mkdir(tempDir, { recursive: true });

  let tempPdfPath: string | undefined;
  const tempImagePaths: string[] = [];

  try {
    // Step 1: Write PDF buffer to temp file
    const pdfBuffer = Buffer.from(base64Pdf, 'base64');
    tempPdfPath = join(tempDir, 'input.pdf');
    await fs.writeFile(tempPdfPath, pdfBuffer);

    console.log(`[PDF Processor] Starting PDF extraction`, {
      correlationId,
      sessionId,
      pdfSizeBytes: pdfBuffer.length,
    });

    // Step 2: Initialize Poppler and extract pages
    const poppler = new Poppler();
    const outputPrefix = join(tempDir, 'page');

    // Use pdfToPpm with JPEG output for page-by-page extraction
    const options = {
      jpegFile: true, // Output as JPEG
      singleFile: false, // Generate separate files per page
      resolutionXYAxis: 200, // 200 DPI for good quality
    };

    console.log(`[PDF Processor] Calling Poppler pdfToPpm`, {
      correlationId,
      sessionId,
      options,
    });

    // Extract pages (poppler generates files: page-1.jpg, page-2.jpg, etc.)
    await poppler.pdfToPpm(tempPdfPath, outputPrefix, options);

    // Step 3: Find all generated page files
    const dirEntries = await fs.readdir(tempDir);
    const pageFiles = dirEntries
      .filter((name) => name.startsWith('page-') && name.endsWith('.jpg'))
      .sort((a, b) => {
        // Extract page numbers from filenames (page-1.jpg, page-2.jpg, etc.)
        const numA = parseInt(a.match(/page-(\d+)/)?.[1] || '0', 10);
        const numB = parseInt(b.match(/page-(\d+)/)?.[1] || '0', 10);
        return numA - numB;
      });

    if (pageFiles.length === 0) {
      throw new Error('No pages extracted from PDF');
    }

    console.log(`[PDF Processor] Extracted ${pageFiles.length} pages`, {
      correlationId,
      sessionId,
      pageCount: pageFiles.length,
    });

    // Step 4: Process all extracted pages in parallel (with per-page error handling)
    console.log(`[PDF Processor] Starting parallel page processing`, {
      correlationId,
      sessionId,
      pageCount: pageFiles.length,
    });

    // Build list of page paths for cleanup
    pageFiles.forEach((pageFile) => {
      tempImagePaths.push(join(tempDir, pageFile));
    });

    // Process all pages in parallel using Promise.allSettled
    const pageProcessingStartTime = Date.now();
    const pagePromises = pageFiles.map(async (pageFile, index) => {
      const pagePath = join(tempDir, pageFile);
      const pageStartTime = Date.now();
      const pageNumber = index + 1;

      console.log(`[PDF Processor] Processing page ${pageNumber}/${pageFiles.length}`, {
        correlationId,
        sessionId,
        pageNumber,
        filename: pageFile,
      });

      try {
        // Read the extracted JPEG
        const pageBuffer = await fs.readFile(pagePath);

        // Load with Sharp for potential downscaling (lazy loaded)
        const sharp = await getSharp();
        const pageImage = sharp(pageBuffer);
        const pageMeta = await pageImage.metadata();

        // Build processing pipeline with EXIF auto-rotation
        let pipeline = pageImage.rotate(); // Auto-rotate using EXIF orientation

        // Optional: Downscale if needed
        if (maxWidth && pageMeta.width && pageMeta.width > maxWidth) {
          console.log(`[PDF Processor] Downscaling page ${pageNumber} from ${pageMeta.width}px to ${maxWidth}px`, {
            correlationId,
            sessionId,
            pageNumber,
            originalWidth: pageMeta.width,
            targetWidth: maxWidth,
          });

          pipeline = pipeline.resize({
            width: maxWidth,
            withoutEnlargement: true,
            kernel: 'lanczos3', // High-quality resampling
          });
        }

        // Convert to JPEG with specified quality
        const jpegBuffer = await pipeline
          .jpeg({
            quality,
            chromaSubsampling: JPEG_CHROMA_SUBSAMPLING,
            mozjpeg: true, // Better compression
          })
          .toBuffer();

        // Get final dimensions
        const jpegMeta = await sharp(jpegBuffer).metadata();

        const pageProcessingTime = Date.now() - pageStartTime;

        console.log(`[PDF Processor] Page ${pageNumber} processed`, {
          correlationId,
          sessionId,
          pageNumber,
          outputWidth: jpegMeta.width,
          outputHeight: jpegMeta.height,
          outputSizeBytes: jpegBuffer.length,
          jpegQuality: quality,
          chromaSubsampling: JPEG_CHROMA_SUBSAMPLING,
          processingTimeMs: pageProcessingTime,
        });

        // Return successfully processed page
        return {
          pageNumber,
          base64: jpegBuffer.toString('base64'),
          mime: 'image/jpeg',
          width: jpegMeta.width || 0,
          height: jpegMeta.height || 0,
          originalFormat: 'application/pdf',
        } as ProcessedPage;
      } catch (pageError) {
        // Page processing failed - return error page
        console.error(`[PDF Processor] Page ${pageNumber} failed`, {
          correlationId,
          sessionId,
          pageNumber,
          error: pageError instanceof Error ? pageError.message : String(pageError),
        });

        return {
          pageNumber,
          base64: null,
          mime: 'image/jpeg',
          width: 0,
          height: 0,
          originalFormat: 'application/pdf',
          error: {
            message: pageError instanceof Error ? pageError.message : String(pageError),
            code: 'PAGE_PROCESSING_FAILED',
            details: pageError,
          },
        } as ProcessedPage;
      }
    });

    // Wait for all page processing to complete
    const pageResults = await Promise.allSettled(pagePromises);
    const pageProcessingTotalTime = Date.now() - pageProcessingStartTime;

    console.log(`[PDF Processor] Parallel page processing complete`, {
      correlationId,
      sessionId,
      totalPages: pageResults.length,
      totalProcessingTimeMs: pageProcessingTotalTime,
      averageTimePerPageMs: Math.round(pageProcessingTotalTime / pageResults.length),
    });

    // Extract pages and errors from results
    const pages: ProcessedPage[] = [];
    const pageErrors: Array<{ pageNumber: number; error: string }> = [];

    pageResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        pages.push(result.value);
        // Check if page has error (processing failed but Promise fulfilled)
        if (result.value.error) {
          pageErrors.push({
            pageNumber: index + 1,
            error: result.value.error.message,
          });
        }
      } else {
        // Promise rejected (should not happen with try/catch, but handle anyway)
        const pageNumber = index + 1;
        console.error(`[PDF Processor] Page ${pageNumber} Promise rejected`, {
          correlationId,
          sessionId,
          pageNumber,
          error: result.reason,
        });

        pages.push({
          pageNumber,
          base64: null,
          mime: 'image/jpeg',
          width: 0,
          height: 0,
          originalFormat: 'application/pdf',
          error: {
            message: String(result.reason),
            code: 'PAGE_PROCESSING_FAILED',
            details: result.reason,
          },
        });

        pageErrors.push({
          pageNumber,
          error: String(result.reason),
        });
      }
    });

    // Check if ALL pages failed
    const successfulPages = pages.filter(p => p.base64).length;
    if (successfulPages === 0) {
      throw new Error(
        `All ${pageFiles.length} pages failed to process. ` +
        `First error: ${pageErrors[0]?.error || 'Unknown'}`
      );
    }

    // Log partial success if some pages failed
    if (pageErrors.length > 0) {
      console.warn(`[PDF Processor] Partial success: ${successfulPages}/${pageFiles.length} pages processed`, {
        correlationId,
        sessionId,
        successfulPages,
        failedPages: pageErrors.length,
        failedPageNumbers: pageErrors.map(e => e.pageNumber).join(', '),
      });
    }

    const totalTime = Date.now() - startTime;

    console.log(`[PDF Processor] Extraction complete`, {
      correlationId,
      sessionId,
      totalPages: pages.length,
      totalProcessingTimeMs: totalTime,
      averageTimePerPageMs: Math.round(totalTime / pages.length),
    });

    return pages;
  } catch (error) {
    console.error(`[PDF Processor] Extraction failed`, {
      correlationId,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    // Step 5: Clean up temp files
    try {
      console.log(`[PDF Processor] Cleaning up temp files`, {
        correlationId,
        sessionId,
        fileCount: tempImagePaths.length + (tempPdfPath ? 1 : 0),
      });

      // Delete temp PDF
      if (tempPdfPath) {
        await fs.unlink(tempPdfPath).catch(() => {
          // Ignore errors (file might not exist)
        });
      }

      // Delete temp images
      for (const imagePath of tempImagePaths) {
        await fs.unlink(imagePath).catch(() => {
          // Ignore errors
        });
      }

      // Remove temp directory
      await fs.rmdir(tempDir).catch(() => {
        // Ignore errors (directory might not be empty)
      });

      console.log(`[PDF Processor] Cleanup complete`, {
        correlationId,
        sessionId,
      });
    } catch (cleanupError) {
      console.warn(`[PDF Processor] Cleanup warning`, {
        correlationId,
        sessionId,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
      // Don't throw on cleanup errors
    }
  }
}
