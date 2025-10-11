/**
 * OCR Persistence Utility
 * Handles storage and indexing of OCR results for reuse across retries and passes
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { calculateSHA256 } from './checksum';
import { retryStorageDownload, retryStorageUpload } from './retry';
import { createLogger, maskPatientId } from './logger';

export interface OCRPage {
  page_number: number;
  size: { width_px: number; height_px: number };
  lines: Array<{
    text: string;
    bbox: { x: number; y: number; w: number; h: number };
    bbox_norm: { x: number; y: number; w: number; h: number };
    confidence: number;
    reading_order: number;
  }>;
  tables: Array<{
    bbox: { x: number; y: number; w: number; h: number };
    bbox_norm: { x: number; y: number; w: number; h: number };
    rows: number;
    columns: number;
    confidence: number;
  }>;
  provider: string;
  processing_time_ms: number;
}

interface OCRManifest {
  shell_file_id: string;
  provider: string;
  version: string;
  page_count: number;
  total_bytes: number;
  checksum: string;
  // METADATA FOR REUSE: Store processed dimensions for unambiguous bbox normalization
  processed_width_px?: number;   // Actual width used for normalization
  processed_height_px?: number;  // Actual height used for normalization
  processing_metadata?: {
    downscaling_applied: boolean;
    original_dimensions_available: boolean;
    normalization_valid: boolean;
  };
  pages: Array<{
    page_number: number;
    artifact_path: string;
    bytes: number;
    width_px: number;
    height_px: number;
  }>;
  created_at: string;
}

export async function persistOCRArtifacts(
  supabase: SupabaseClient,
  shellFileId: string,
  patientId: string,  // Uses patient_id to match storage pattern
  ocrResult: any,
  fileChecksum: string,
  correlationId?: string
): Promise<void> {
  const startTime = Date.now();
  const logger = createLogger({
    context: 'ocr-persistence',
    correlation_id: correlationId,
  });

  const basePath = `${patientId}/${shellFileId}-ocr`;
  
  // Build page artifacts
  const pageArtifacts = ocrResult.pages.map((page: any, idx: number) => ({
    page_number: idx + 1,
    artifact_path: `page-${idx + 1}.json`,
    bytes: JSON.stringify(page).length,
    width_px: page.size?.width_px || 0,
    height_px: page.size?.height_px || 0
  }));

  // Create manifest
  const manifest: OCRManifest = {
    shell_file_id: shellFileId,
    provider: 'google_vision',
    version: 'v1.2024.10',
    page_count: ocrResult.pages.length,
    total_bytes: pageArtifacts.reduce((sum: number, p: any) => sum + p.bytes, 0),
    checksum: await calculateSHA256(Buffer.from(JSON.stringify(ocrResult))),
    // CRITICAL: Store processed dimensions for unambiguous bbox normalization
    processed_width_px: ocrResult.pages[0]?.size?.width_px || 0,
    processed_height_px: ocrResult.pages[0]?.size?.height_px || 0,
    processing_metadata: {
      downscaling_applied: !!(ocrResult.pages[0]?.size?.width_px && ocrResult.pages[0]?.size?.height_px),
      original_dimensions_available: true,
      normalization_valid: !!(ocrResult.pages[0]?.size?.width_px && ocrResult.pages[0]?.size?.height_px)
    },
    pages: pageArtifacts,
    created_at: new Date().toISOString()
  };

  // Order of operations: pages → manifest → database
  // This ensures manifest isn't corrupted if DB write fails
  
  // 1. Upload page artifacts with retry logic
  for (let i = 0; i < ocrResult.pages.length; i++) {
    const result = await retryStorageUpload(async () => {
      return await supabase.storage
        .from('medical-docs')
        .upload(
          `${basePath}/page-${i + 1}.json`,
          JSON.stringify(ocrResult.pages[i], null, 2),
          {
            contentType: 'application/json',
            upsert: true // Idempotent
          }
        );
    });

    if (result.error) {
      const error: any = new Error(`Failed to upload OCR page ${i + 1}: ${result.error.message}`);
      error.status = 500;
      logger.error('Failed to upload OCR page', error, {
        shell_file_id: shellFileId,
        patient_id_masked: maskPatientId(patientId),
        page_number: i + 1,
      });
      throw error;
    }
  }

  // 2. Upload manifest with retry logic
  const manifestResult = await retryStorageUpload(async () => {
    return await supabase.storage
      .from('medical-docs')
      .upload(
        `${basePath}/manifest.json`,
        JSON.stringify(manifest, null, 2),
        {
          contentType: 'application/json',
          upsert: true // Idempotent
        }
      );
  });

  if (manifestResult.error) {
    const error: any = new Error(`Failed to upload OCR manifest: ${manifestResult.error.message}`);
    error.status = 500;
    logger.error('Failed to upload OCR manifest', error, {
      shell_file_id: shellFileId,
      patient_id_masked: maskPatientId(patientId),
    });
    throw error;
  }

  // 3. Upsert database index (idempotent)
  const { error: dbError } = await supabase
    .from('ocr_artifacts')
    .upsert({
      shell_file_id: shellFileId,
      manifest_path: `${basePath}/manifest.json`,
      provider: 'google_vision',
      artifact_version: 'v1.2024.10',
      file_checksum: fileChecksum,
      checksum: manifest.checksum,
      pages: ocrResult.pages.length,
      bytes: manifest.total_bytes,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'shell_file_id'
    });

  if (dbError) {
    logger.error('Failed to update database index', dbError as Error, {
      shell_file_id: shellFileId,
      patient_id_masked: maskPatientId(patientId),
    });
    throw dbError;
  }

  const duration_ms = Date.now() - startTime;
  logger.info('OCR artifacts persisted successfully', {
    shell_file_id: shellFileId,
    patient_id_masked: maskPatientId(patientId),
    page_count: ocrResult.pages.length,
    total_bytes: manifest.total_bytes,
    duration_ms,
  });
}

export async function loadOCRArtifacts(
  supabase: SupabaseClient,
  shellFileId: string,
  correlationId?: string
): Promise<any | null> {
  const startTime = Date.now();
  const logger = createLogger({
    context: 'ocr-persistence',
    correlation_id: correlationId,
  });

  // Check if OCR artifacts exist
  const { data: artifactIndex, error: indexError } = await supabase
    .from('ocr_artifacts')
    .select('manifest_path, file_checksum, pages')
    .eq('shell_file_id', shellFileId)
    .single();

  if (indexError || !artifactIndex) {
    return null; // No artifacts found
  }

  // Load manifest with retry logic
  const manifestResult = await retryStorageDownload(async () => {
    return await supabase.storage
      .from('medical-docs')
      .download(artifactIndex.manifest_path);
  });

  if (manifestResult.error || !manifestResult.data) {
    logger.warn('Failed to load OCR manifest', {
      shell_file_id: shellFileId,
      error_message: manifestResult.error?.message,
    });
    return null;
  }

  const manifestData = manifestResult.data;
  
  const manifest = JSON.parse(await manifestData.text()) as OCRManifest;
  
  // Reconstruct OCR result from artifacts with retry logic
  const ocrResult = { pages: [] as any[] };
  for (const page of manifest.pages) {
    const pagePath = artifactIndex.manifest_path.replace('manifest.json', page.artifact_path);

    const pageResult = await retryStorageDownload(async () => {
      return await supabase.storage
        .from('medical-docs')
        .download(pagePath);
    });

    if (pageResult.error || !pageResult.data) {
      logger.warn('Failed to load OCR page', {
        shell_file_id: shellFileId,
        page_number: page.page_number,
        error_message: pageResult.error?.message,
      });
      return null; // If any page fails, return null to trigger fresh OCR
    }

    ocrResult.pages.push(JSON.parse(await pageResult.data.text()));
  }

  const duration_ms = Date.now() - startTime;
  logger.info('OCR artifacts loaded successfully', {
    shell_file_id: shellFileId,
    page_count: ocrResult.pages.length,
    duration_ms,
  });
  return ocrResult;
}