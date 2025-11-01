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
//# sourceMappingURL=ocr-persistence.d.ts.map