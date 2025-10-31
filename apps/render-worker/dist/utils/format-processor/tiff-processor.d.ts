/**
 * TIFF Page Extraction Processor
 *
 * Extracts all pages from multi-page TIFF files and converts them to JPEG.
 * Uses Sharp library for image processing.
 */
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
export declare function extractTiffPages(base64Tiff: string, maxWidth?: number, quality?: number, correlationId?: string): Promise<ProcessedPage[]>;
//# sourceMappingURL=tiff-processor.d.ts.map