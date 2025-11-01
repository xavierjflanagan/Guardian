/**
 * Format Processor - Main Entry Point
 *
 * Pre-processes files before OCR to handle multi-page formats and conversions.
 *
 * PROBLEM:
 * - Google Cloud Vision OCR only processes the first page of multi-page files
 * - Multi-page TIFFs lose all pages after page 1 (discovered Oct 31, 2025)
 * - PDFs can't be sent directly to Vision API
 *
 * SOLUTION:
 * - Extract all pages from multi-page formats (TIFF, PDF)
 * - Convert each page to JPEG
 * - Return array of pages for OCR processing
 * - Worker sends each page separately to OCR, then combines results
 */
import type { ProcessedPage, PreprocessResult, FormatProcessorConfig } from './types';
/**
 * Preprocess a file for OCR
 *
 * Routes to appropriate processor based on MIME type:
 * - Multi-page TIFF → Extract pages, convert to JPEG (Phase 1 ✅)
 * - Multi-page PDF → Extract pages, convert to JPEG (Phase 2 ✅)
 * - Single-page JPEG/PNG → Pass through (no conversion needed)
 * - HEIC → Convert to JPEG (Phase 3 - not yet implemented)
 *
 * @param base64Data - Base64-encoded file data
 * @param mimeType - MIME type of the file
 * @param config - Optional configuration
 * @returns Preprocessed pages ready for OCR
 */
export declare function preprocessForOCR(base64Data: string, mimeType: string, config?: FormatProcessorConfig): Promise<PreprocessResult>;
export type { ProcessedPage, PreprocessResult, FormatProcessorConfig };
//# sourceMappingURL=index.d.ts.map