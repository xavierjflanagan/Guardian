/**
 * PDF Page Extraction Processor
 *
 * Extracts all pages from multi-page PDF files and converts them to JPEG.
 * Uses Poppler (via node-poppler) for PDF rendering.
 */
import type { ProcessedPage } from './types';
/**
 * Extract all pages from a PDF file
 *
 * @param base64Pdf - Base64-encoded PDF data
 * @param maxWidth - Optional maximum width for downscaling (default: 1600)
 * @param quality - JPEG quality 1-100 (default: from JPEG_QUALITY env var or 75)
 * @param correlationId - Optional correlation ID for logging
 * @returns Array of processed pages
 */
export declare function extractPdfPages(base64Pdf: string, maxWidth?: number, quality?: number, correlationId?: string): Promise<ProcessedPage[]>;
//# sourceMappingURL=pdf-processor.d.ts.map