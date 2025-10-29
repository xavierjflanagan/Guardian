/**
 * Pass 0.5: Healthcare Encounter Discovery
 * Main Entry Point
 *
 * PHASE 1 MVP: Task 1 only (encounter discovery)
 * - Runs for ALL uploads (even 1-page files)
 * - Skips batching analysis if <18 pages
 *
 * PHASE 2 (Future): Task 1 + Task 2 (batching for ≥18 pages)
 */

import { createClient } from '@supabase/supabase-js';
import { Pass05Input, Pass05Output, ShellFileManifest, GoogleCloudVisionOCR } from './types';
import { discoverEncounters } from './encounterDiscovery';
import { writeManifestToDatabase } from './databaseWriter';

// Re-export types for worker integration
export type { Pass05Input, Pass05Output } from './types';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function runPass05(input: Pass05Input): Promise<Pass05Output> {
  const startTime = Date.now();

  try {
    // IDEMPOTENCY CHECK: Return early if already processed
    const { data: existingManifest } = await supabase
      .from('shell_file_manifests')
      .select('manifest_id, manifest_data, processing_time_ms, ai_model_used, ai_cost_usd')
      .eq('shell_file_id', input.shellFileId)
      .single();

    if (existingManifest) {
      console.log(`[Pass 0.5] Shell file ${input.shellFileId} already processed, returning existing result`);

      // Safe to return early: Transaction wrapper (write_pass05_manifest_atomic) ensures
      // if manifest exists, metrics and shell_files completion flags MUST also exist.
      // All 3 writes happen atomically - no partial failures possible.
      return {
        success: true,
        manifest: existingManifest.manifest_data,
        processingTimeMs: existingManifest.processing_time_ms || 0,
        aiCostUsd: existingManifest.ai_cost_usd || 0,
        aiModel: existingManifest.ai_model_used
      };
    }

    // Phase 1 MVP: Check page count threshold
    if (input.pageCount >= 18) {
      // Files ≥18 pages: Fail gracefully (batching not yet implemented)
      return {
        success: false,
        error: 'File too large for Phase 1 MVP. Batching implementation pending. Maximum 17 pages.',
        processingTimeMs: Date.now() - startTime,
        aiCostUsd: 0,
        aiModel: 'n/a'
      };
    }

    // TASK 1: Encounter Discovery (always runs for <18 pages)
    const encounterResult = await discoverEncounters({
      shellFileId: input.shellFileId,
      patientId: input.patientId,
      ocrOutput: input.ocrOutput,
      pageCount: input.pageCount
    });

    if (!encounterResult.success) {
      return {
        success: false,
        error: encounterResult.error,
        processingTimeMs: Date.now() - startTime,
        aiCostUsd: encounterResult.aiCostUsd,
        aiModel: encounterResult.aiModel
      };
    }

    // Build manifest (Task 1 only - no batching)
    const manifest: ShellFileManifest = {
      shellFileId: input.shellFileId,
      patientId: input.patientId,
      totalPages: input.pageCount,
      ocrAverageConfidence: calculateAverageConfidence(input.ocrOutput),
      encounters: encounterResult.encounters!,
      batching: null  // Phase 1: always null
    };

    // Write manifest and encounters to database
    await writeManifestToDatabase({
      manifest,
      aiModel: encounterResult.aiModel,
      aiCostUsd: encounterResult.aiCostUsd,
      processingTimeMs: Date.now() - startTime,
      inputTokens: encounterResult.inputTokens,
      outputTokens: encounterResult.outputTokens,
      processingSessionId: input.processingSessionId  // Passed from job coordinator
    });

    return {
      success: true,
      manifest,
      processingTimeMs: Date.now() - startTime,
      aiCostUsd: encounterResult.aiCostUsd,
      aiModel: encounterResult.aiModel
    };

  } catch (error) {
    console.error('[Pass 0.5] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: Date.now() - startTime,
      aiCostUsd: 0,
      aiModel: 'n/a'
    };
  }
}

function calculateAverageConfidence(ocrOutput: GoogleCloudVisionOCR): number {
  const confidences = ocrOutput.fullTextAnnotation.pages.map(p => p.confidence);
  if (confidences.length === 0) return 0;
  return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
}
