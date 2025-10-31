/**
 * Format Processor - Type Definitions
 *
 * Shared types for format preprocessing before OCR.
 */
/**
 * A single processed page ready for OCR
 */
export interface ProcessedPage {
    /** 1-indexed page number for user display */
    pageNumber: number;
    /** Base64-encoded JPEG image data */
    base64: string;
    /** Output MIME type (always JPEG after preprocessing) */
    mime: 'image/jpeg';
    /** Image width in pixels */
    width: number;
    /** Image height in pixels */
    height: number;
    /** Original format before conversion (e.g., 'image/tiff', 'application/pdf') */
    originalFormat?: string;
}
/**
 * Result of format preprocessing
 */
export interface PreprocessResult {
    /** Array of processed pages */
    pages: ProcessedPage[];
    /** Total number of pages extracted */
    totalPages: number;
    /** Processing time in milliseconds */
    processingTimeMs: number;
    /** Original format of the input file */
    originalFormat: string;
    /** Whether format conversion was applied */
    conversionApplied: boolean;
}
/**
 * Configuration options for format processor
 */
export interface FormatProcessorConfig {
    /** Maximum width for downscaling (default: 1600px) */
    maxWidth?: number;
    /** JPEG quality setting 1-100 (default: 85) */
    jpegQuality?: number;
    /** Correlation ID for logging */
    correlationId?: string;
}
//# sourceMappingURL=types.d.ts.map