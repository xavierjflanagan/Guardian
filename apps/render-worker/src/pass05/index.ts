/**
 * Pass 0.5: Healthcare Encounter Discovery
 * Main Entry Point
 *
 * PURPOSE:
 * 1. Review ENTIRE document (all pages)
 * 2. Detect and classify encounters
 * 3. Determine batch separation points for downstream processing
 *
 * CURRENT IMPLEMENTATION:
 * - Processes files of any size (no hardcoded page limit)
 * - Batch boundary detection: Not yet implemented (returns null)
 * - GPT-5 token limit: Unknown (testing in progress)
 *
 * FUTURE CONSIDERATION (100+ page files):
 * - If file exceeds GPT-5 input token limit, may need "pre-batching"
 * - Pre-batching would split file BEFORE Pass 0.5 (rough cuts)
 * - Then Pass 0.5 runs on each pre-batch to determine real batch boundaries
 * - Without pre-batching, very large files may fail at GPT-5 token ceiling
 */

import { createClient } from '@supabase/supabase-js';
import { Pass05Input, Pass05Output, ShellFileManifest, GoogleCloudVisionOCR } from './types';
import { discoverEncounters } from './encounterDiscovery';
// Migration 45: databaseWriter.ts removed - manifest-free architecture

// Re-export types for worker integration
export type { Pass05Input, Pass05Output } from './types';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function runPass05(input: Pass05Input): Promise<Pass05Output> {
  const startTime = Date.now();

  try {
    // Migration 45: IDEMPOTENCY CHECK - Query shell_files instead of manifest table
    const { data: shellFile } = await supabase
      .from('shell_files')
      .select('pass_0_5_completed, pass_0_5_version, pass_0_5_progressive')
      .eq('id', input.shellFileId)
      .single();

    if (shellFile?.pass_0_5_completed) {
      console.log(`[Pass 0.5] Shell file ${input.shellFileId} already processed, returning existing result`);

      // Build output from distributed data (encounters + metrics)
      const { data: encounters } = await supabase
        .from('healthcare_encounters')
        .select('*')
        .eq('primary_shell_file_id', input.shellFileId);

      const { data: metrics } = await supabase
        .from('pass05_encounter_metrics')
        .select('processing_time_ms, ai_cost_usd, ai_model_used')
        .eq('shell_file_id', input.shellFileId)
        .single();

      // Build manifest for backward compatibility
      const manifest: ShellFileManifest = {
        shellFileId: input.shellFileId,
        patientId: input.patientId,
        totalPages: input.pageCount,
        ocrAverageConfidence: calculateAverageConfidence(input.ocrOutput),
        encounters: encounters || [],
        page_assignments: [], // Would need separate query if needed
        batching: null
      };

      return {
        success: true,
        manifest,
        processingTimeMs: metrics?.processing_time_ms || 0,
        aiCostUsd: metrics?.ai_cost_usd || 0,
        aiModel: metrics?.ai_model_used || shellFile.pass_0_5_version || 'unknown'
      };
    }

    // TASK 1: Encounter Discovery (runs for all file sizes)
    // Note: GPT-5 token limit will organically reveal itself through testing
    // If very large files (100+ pages) fail, implement pre-batching strategy
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

    // Migration 45: Build manifest for backward compatibility (no database write needed)
    // Encounters already written by manifestBuilder, shell_files updated by finalizeShellFile()
    const manifest: ShellFileManifest = {
      shellFileId: input.shellFileId,
      patientId: input.patientId,
      totalPages: input.pageCount,
      ocrAverageConfidence: calculateAverageConfidence(input.ocrOutput),
      encounters: encounterResult.encounters!,
      page_assignments: encounterResult.page_assignments,  // v2.3: Include if present
      batching: null  // Phase 1: always null
    };

    // Migration 45: No manifest write - data already in normalized tables
    // - Encounters: written by manifestBuilder in parseEncounterResponse()
    // - Metrics: written by manifestBuilder
    // - Shell file metadata: updated by finalizeShellFile() in encounterDiscovery.ts

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
