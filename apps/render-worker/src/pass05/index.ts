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

    // HOTFIX 2A: Create AI processing session (required for metrics table foreign key)
    const { data: session, error: sessionError } = await supabase
      .from('ai_processing_sessions')
      .insert({
        shell_file_id: input.shellFileId,
        patient_id: input.patientId,
        session_type: 'pass_0_5_encounter_discovery',
        session_status: 'completed',
        ai_model_name: encounterResult.aiModel,
        processing_mode: 'standard', // vs 'progressive'
        workflow_step: 'encounter_discovery',
        total_steps: 1,
        completed_steps: 1,
        processing_started_at: new Date(startTime).toISOString(),
        processing_completed_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (sessionError || !session) {
      console.error('[Pass 0.5] Failed to create AI processing session:', sessionError);
      throw new Error(`Failed to create AI processing session: ${sessionError?.message}`);
    }

    console.log(`[Pass 0.5] Created AI processing session: ${session.id}`);

    // HOTFIX 2A: Write encounter metrics for cost tracking and performance monitoring
    const encounters = encounterResult.encounters!;
    const realWorldCount = encounters.filter(e => e.isRealWorldVisit).length;
    const pseudoCount = encounters.filter(e => !e.isRealWorldVisit).length;
    const plannedCount = encounters.filter(e =>
      e.encounterType.startsWith('planned_')
    ).length;
    const avgConfidence = encounters.length > 0
      ? encounters.reduce((sum, e) => sum + (e.confidence || 0), 0) / encounters.length
      : 0;
    const encounterTypes = [...new Set(encounters.map(e => e.encounterType))];

    const { error: metricsError } = await supabase
      .from('pass05_encounter_metrics')
      .insert({
        shell_file_id: input.shellFileId,
        patient_id: input.patientId,
        processing_session_id: session.id, // FIX: Include required session_id
        encounters_detected: encounters.length,
        real_world_encounters: realWorldCount,
        pseudo_encounters: pseudoCount,
        planned_encounters: plannedCount,
        processing_time_ms: Date.now() - startTime,
        ai_model_used: encounterResult.aiModel,
        input_tokens: encounterResult.inputTokens,
        output_tokens: encounterResult.outputTokens,
        total_tokens: encounterResult.inputTokens + encounterResult.outputTokens,
        ai_cost_usd: encounterResult.aiCostUsd,
        encounter_confidence_average: avgConfidence,
        encounter_types_found: encounterTypes,
        total_pages: input.pageCount,
        ocr_average_confidence: calculateAverageConfidence(input.ocrOutput)
      });

    if (metricsError) {
      console.error('[Pass 0.5] Failed to write encounter metrics:', metricsError);
      throw new Error(`Failed to write encounter metrics: ${metricsError.message}`);
    }

    console.log(`[Pass 0.5] Wrote metrics: ${encounters.length} encounters, $${encounterResult.aiCostUsd.toFixed(4)} cost`);

    // HOTFIX 2B: Write page assignments (v2.3 feature)
    if (encounterResult.page_assignments && encounterResult.page_assignments.length > 0) {
      console.log(`[Pass 0.5] Writing ${encounterResult.page_assignments.length} page assignments`);

      const assignmentsData = encounterResult.page_assignments.map(pa => ({
        shell_file_id: input.shellFileId,
        page_num: pa.page,
        encounter_id: pa.encounter_id,
        justification: pa.justification
      }));

      const { error: assignmentsError } = await supabase
        .from('pass05_page_assignments')
        .insert(assignmentsData);

      if (assignmentsError) {
        console.error('[Pass 0.5] Failed to write page assignments:', assignmentsError);
        // Don't throw - page assignments are supplementary data
        console.warn('[Pass 0.5] Continuing despite page assignment write failure');
      } else {
        console.log(`[Pass 0.5] Successfully wrote ${encounterResult.page_assignments.length} page assignments`);
      }
    } else {
      console.log('[Pass 0.5] No page assignments in AI response (v2.3 feature not used)');
    }

    // HOTFIX 2C: Finalize shell_file with complete status and timestamps
    const processingTimeMs = Date.now() - startTime;
    const processingDuration = Math.floor(processingTimeMs / 1000);

    const { error: finalizeError } = await supabase
      .from('shell_files')
      .update({
        status: 'completed',
        processing_completed_at: new Date().toISOString(),
        pass_0_5_completed_at: new Date().toISOString(),
        processing_duration_seconds: processingDuration
      })
      .eq('id', input.shellFileId);

    if (finalizeError) {
      console.error('[Pass 0.5] Failed to finalize shell file:', finalizeError);
      // Don't throw - encounters are already written, this is just status update
      console.warn('[Pass 0.5] Shell file finalization failed but encounters written successfully');
    }

    return {
      success: true,
      manifest,
      processingTimeMs,
      aiCostUsd: encounterResult.aiCostUsd,
      aiModel: encounterResult.aiModel
    };

  } catch (error) {
    console.error('[Pass 0.5] Unexpected error:', error);

    // HOTFIX 3: Update shell_file with error on failure
    try {
      await supabase
        .from('shell_files')
        .update({
          status: 'failed',
          pass_0_5_error: error instanceof Error ? error.message : 'Unknown error',
          pass_0_5_completed: false,
          processing_completed_at: new Date().toISOString()
        })
        .eq('id', input.shellFileId);
    } catch (updateError) {
      console.error('[Pass 0.5] Failed to update shell file with error:', updateError);
    }

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
