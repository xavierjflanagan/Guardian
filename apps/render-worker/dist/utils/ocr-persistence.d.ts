/**
 * OCR Persistence Utility
 * Handles storage and indexing of OCR results for reuse across retries and passes
 */
import { SupabaseClient } from '@supabase/supabase-js';
import type { ProcessedImageMetadata } from './storage/store-processed-images';
export interface OCRPage {
    page_number: number;
    size: {
        width_px: number;
        height_px: number;
    };
    lines: Array<{
        text: string;
        bbox: {
            x: number;
            y: number;
            w: number;
            h: number;
        };
        bbox_norm: {
            x: number;
            y: number;
            w: number;
            h: number;
        };
        confidence: number;
        reading_order: number;
    }>;
    tables: Array<{
        bbox: {
            x: number;
            y: number;
            w: number;
            h: number;
        };
        bbox_norm: {
            x: number;
            y: number;
            w: number;
            h: number;
        };
        rows: number;
        columns: number;
        confidence: number;
    }>;
    provider: string;
    processing_time_ms: number;
}
export declare function persistOCRArtifacts(supabase: SupabaseClient, shellFileId: string, patientId: string, // Uses patient_id to match storage pattern
ocrResult: any, fileChecksum: string, processedImageMetadata?: ProcessedImageMetadata, // NEW: Optional processed image metadata
correlationId?: string): Promise<void>;
export declare function loadOCRArtifacts(supabase: SupabaseClient, shellFileId: string, correlationId?: string): Promise<any | null>;
/**
 * Store enhanced OCR format permanently for reuse across all passes
 *
 * Phase 1 Implementation: Enhanced OCR Storage
 * Stores V12 enhanced OCR format with inline coordinates to Supabase Storage
 *
 * @param supabase Supabase client
 * @param patientId Patient ID (for storage path)
 * @param shellFileId Shell file ID
 * @param enhancedOCRText Enhanced OCR text in V12 format
 * @param correlationId Optional correlation ID for logging
 */
export declare function storeEnhancedOCR(supabase: SupabaseClient, patientId: string, shellFileId: string, enhancedOCRText: string, correlationId?: string): Promise<void>;
/**
 * Load enhanced OCR format from storage
 *
 * Phase 1 Implementation: Enhanced OCR Loading
 * Loads V12 enhanced OCR format from Supabase Storage for reuse across passes
 *
 * @param supabase Supabase client
 * @param patientId Patient ID (for storage path)
 * @param shellFileId Shell file ID
 * @param correlationId Optional correlation ID for logging
 * @returns Enhanced OCR text or null if not found
 */
export declare function loadEnhancedOCR(supabase: SupabaseClient, patientId: string, shellFileId: string, correlationId?: string): Promise<string | null>;
/**
 * Store Y-Only enhanced OCR format for Pass 0.5
 *
 * Y-Only format: [Y:###] text text text (no X-coordinates)
 * Pass 0.5 only needs Y-coordinates for encounter boundary positioning.
 * This reduces token usage by ~80% compared to full XY format.
 *
 * @param supabase Supabase client
 * @param patientId Patient ID (for storage path)
 * @param shellFileId Shell file ID
 * @param enhancedOCRText Enhanced OCR text in Y-only format
 * @param correlationId Optional correlation ID for logging
 */
export declare function storeEnhancedOCR_Y(supabase: SupabaseClient, patientId: string, shellFileId: string, enhancedOCRText: string, correlationId?: string): Promise<void>;
/**
 * Load Y-Only enhanced OCR format for Pass 0.5
 *
 * Falls back to legacy enhanced-ocr.txt if enhanced-ocr-y.txt not found
 * (for backward compatibility with documents processed before dual format)
 *
 * @param supabase Supabase client
 * @param patientId Patient ID (for storage path)
 * @param shellFileId Shell file ID
 * @param correlationId Optional correlation ID for logging
 * @returns Enhanced OCR text or null if not found
 */
export declare function loadEnhancedOCR_Y(supabase: SupabaseClient, patientId: string, shellFileId: string, correlationId?: string): Promise<string | null>;
/**
 * Store XY enhanced OCR format for Pass 1/2
 *
 * XY format: [Y:###] text (x:###) | text (x:###) (full coordinates)
 * Pass 1/2 need X-coordinates for clinical entity bounding boxes and table structure.
 *
 * @param supabase Supabase client
 * @param patientId Patient ID (for storage path)
 * @param shellFileId Shell file ID
 * @param enhancedOCRText Enhanced OCR text in XY format
 * @param correlationId Optional correlation ID for logging
 */
export declare function storeEnhancedOCR_XY(supabase: SupabaseClient, patientId: string, shellFileId: string, enhancedOCRText: string, correlationId?: string): Promise<void>;
/**
 * Load XY enhanced OCR format for Pass 1/2
 *
 * Falls back to legacy enhanced-ocr.txt if enhanced-ocr-xy.txt not found
 *
 * @param supabase Supabase client
 * @param patientId Patient ID (for storage path)
 * @param shellFileId Shell file ID
 * @param correlationId Optional correlation ID for logging
 * @returns Enhanced OCR text or null if not found
 */
export declare function loadEnhancedOCR_XY(supabase: SupabaseClient, patientId: string, shellFileId: string, correlationId?: string): Promise<string | null>;
/**
 * Store raw Google Cloud Vision response for debugging
 *
 * Phase 4 Implementation: Raw GCV Storage (Optional)
 * Stores complete GCV response for debugging and future metadata extraction
 * Files are deleted after 30 days via Supabase Storage lifecycle policy
 *
 * @param supabase Supabase client
 * @param patientId Patient ID (for storage path)
 * @param shellFileId Shell file ID
 * @param gcvResponse Complete Google Cloud Vision API response
 * @param correlationId Optional correlation ID for logging
 */
export declare function storeRawGCV(supabase: SupabaseClient, patientId: string, shellFileId: string, gcvResponse: any, correlationId?: string): Promise<void>;
//# sourceMappingURL=ocr-persistence.d.ts.map