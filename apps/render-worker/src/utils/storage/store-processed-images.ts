import { createHash } from 'crypto';
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
export async function storeProcessedImages(
  supabase: any, // Accepting any SupabaseClient type to avoid type conflicts
  patientId: string,
  shellFileId: string,
  pages: ProcessedPage[],
  correlationId?: string
): Promise<ProcessedImageMetadata> {
  const folderPath = `${patientId}/${shellFileId}-processed`;
  const storedPages: ProcessedImageMetadata['pages'] = [];
  const checksums: string[] = [];
  let totalBytes = 0;

  console.log(
    `[${correlationId}] Storing ${pages.length} processed images to ${folderPath}/`
  );

  for (const page of pages) {
    // Skip pages with errors (no base64 data)
    if (!page.base64) {
      console.warn(
        `[${correlationId}] Skipping page ${page.pageNumber} - no data`
      );
      continue;
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(page.base64, 'base64');
    const bytes = buffer.length;
    totalBytes += bytes;

    // Calculate SHA-256 checksum
    const checksum = createHash('sha256').update(buffer).digest('hex');
    checksums.push(checksum);

    // Storage path for this page
    const pagePath = `${folderPath}/page-${page.pageNumber}.jpg`;

    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from('medical-docs')
      .upload(pagePath, buffer, {
        contentType: 'image/jpeg',
        upsert: true, // Idempotent (reprocessing overwrites)
      });

    if (error) {
      console.error(
        `[${correlationId}] Failed to store page ${page.pageNumber}:`,
        error
      );
      throw new Error(
        `Failed to store processed image page ${page.pageNumber}: ${error.message}`
      );
    }

    storedPages.push({
      pageNumber: page.pageNumber,
      path: pagePath,
      checksum,
      bytes,
    });

    console.log(
      `[${correlationId}] Stored page ${page.pageNumber}: ${(bytes / 1024).toFixed(1)} KB (${pagePath})`
    );
  }

  // Combined checksum (hash of all page hashes concatenated)
  const combinedChecksum = createHash('sha256')
    .update(checksums.join(''))
    .digest('hex');

  console.log(
    `[${correlationId}] Stored ${storedPages.length} images, ` +
      `${(totalBytes / 1024 / 1024).toFixed(2)} MB total, ` +
      `checksum: ${combinedChecksum.slice(0, 8)}...`
  );

  return {
    folderPath,
    pages: storedPages,
    combinedChecksum,
    totalBytes,
  };
}
