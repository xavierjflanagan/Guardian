/**
 * OCR Persistence Utility
 * Handles storage and indexing of OCR results for reuse across retries and passes
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { calculateSHA256 } from './checksum';

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
  fileChecksum: string
): Promise<void> {
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
  
  // 1. Upload page artifacts
  for (let i = 0; i < ocrResult.pages.length; i++) {
    const { error } = await supabase.storage
      .from('medical-docs')
      .upload(
        `${basePath}/page-${i + 1}.json`,
        JSON.stringify(ocrResult.pages[i], null, 2),
        {
          contentType: 'application/json',
          upsert: true // Idempotent
        }
      );
    
    if (error) {
      console.error(`[OCR Persistence] Failed to upload page ${i + 1}:`, error);
      throw error;
    }
  }

  // 2. Upload manifest
  const { error: manifestError } = await supabase.storage
    .from('medical-docs')
    .upload(
      `${basePath}/manifest.json`,
      JSON.stringify(manifest, null, 2),
      {
        contentType: 'application/json',
        upsert: true // Idempotent
      }
    );

  if (manifestError) {
    console.error('[OCR Persistence] Failed to upload manifest:', manifestError);
    throw manifestError;
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
    console.error('[OCR Persistence] Failed to update database index:', dbError);
    throw dbError;
  }

  console.log(`[OCR Persistence] Successfully persisted ${ocrResult.pages.length} pages for shell_file ${shellFileId}`);
}

export async function loadOCRArtifacts(
  supabase: SupabaseClient,
  shellFileId: string
): Promise<any | null> {
  // Check if OCR artifacts exist
  const { data: artifactIndex, error: indexError } = await supabase
    .from('ocr_artifacts')
    .select('manifest_path, file_checksum, pages')
    .eq('shell_file_id', shellFileId)
    .single();

  if (indexError || !artifactIndex) {
    return null; // No artifacts found
  }

  // Load manifest
  const { data: manifestData, error: manifestError } = await supabase.storage
    .from('medical-docs')
    .download(artifactIndex.manifest_path);
  
  if (manifestError || !manifestData) {
    console.warn(`[OCR Persistence] Failed to load manifest for ${shellFileId}:`, manifestError);
    return null;
  }
  
  const manifest = JSON.parse(await manifestData.text()) as OCRManifest;
  
  // Reconstruct OCR result from artifacts
  const ocrResult = { pages: [] as any[] };
  for (const page of manifest.pages) {
    const pagePath = artifactIndex.manifest_path.replace('manifest.json', page.artifact_path);
    const { data: pageData, error: pageError } = await supabase.storage
      .from('medical-docs')
      .download(pagePath);
    
    if (pageError || !pageData) {
      console.warn(`[OCR Persistence] Failed to load page ${page.page_number} for ${shellFileId}:`, pageError);
      return null; // If any page fails, return null to trigger fresh OCR
    }
    
    ocrResult.pages.push(JSON.parse(await pageData.text()));
  }

  console.log(`[OCR Persistence] Successfully loaded ${ocrResult.pages.length} pages for shell_file ${shellFileId}`);
  return ocrResult;
}