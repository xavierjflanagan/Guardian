import type { ProcessedPage } from '../format-processor/types';
export interface StorageResult {
    path: string;
    checksum: string;
    bytes: number;
}
export interface ProcessedImageMetadata {
    folderPath: string;
    pages: Array<{
        pageNumber: number;
        path: string;
        checksum: string;
        bytes: number;
    }>;
    combinedChecksum: string;
    totalBytes: number;
}
/**
 * Store processed JPEG pages in Supabase Storage before OCR
 *
 * Storage path: {patientId}/{shellFileId}-processed/page-{n}.jpg
 *
 * @param supabase - Supabase client with storage permissions
 * @param patientId - Patient UUID (for RLS path construction)
 * @param shellFileId - Shell file UUID
 * @param pages - Array of ProcessedPage objects from format processor
 * @param correlationId - Optional correlation ID for logging
 * @returns Metadata for stored images (paths, checksums, sizes)
 */
export declare function storeProcessedImages(supabase: any, // Accepting any SupabaseClient type to avoid type conflicts
patientId: string, shellFileId: string, pages: ProcessedPage[], correlationId?: string): Promise<ProcessedImageMetadata>;
//# sourceMappingURL=store-processed-images.d.ts.map