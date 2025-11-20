/**
 * Task 1: Healthcare Encounter Discovery - STRATEGY A (V11)
 *
 * STRATEGY A (V11):
 * - ALL documents use progressive mode (no page threshold)
 * - Cascade-based encounter continuity
 * - All encounters created as "pendings" first, reconciled later
 * - Uses aiPrompts.v11.ts via chunk-processor.ts
 */

import { GoogleCloudVisionOCR, EncounterMetadata, PageAssignment } from './types';
import { processDocumentProgressively } from './progressive/session-manager';

export interface EncounterDiscoveryInput {
  shellFileId: string;
  patientId: string;
  ocrOutput: GoogleCloudVisionOCR;
  pageCount: number;
}

export interface EncounterDiscoveryOutput {
  success: boolean;
  encounters?: EncounterMetadata[];
  page_assignments?: PageAssignment[];
  error?: string;
  aiModel: string;
  aiCostUsd: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * STRATEGY A (v11): Extract healthcare encounters using universal progressive mode
 *
 * All documents (1-1000+ pages) use the same progressive pipeline:
 * - Chunks documents into 50-page batches
 * - Processes each chunk with aiPrompts.v11 (cascade-aware)
 * - Creates pending encounters during processing
 * - Reconciles all pendings after all chunks complete
 */
export async function discoverEncounters(
  input: EncounterDiscoveryInput
): Promise<EncounterDiscoveryOutput> {

  try {
    console.log(`[Pass 0.5] STRATEGY A (v11): Universal progressive mode for ${input.pageCount} pages`);

    const progressiveResult = await processDocumentProgressively(
      input.shellFileId,
      input.patientId,
      input.ocrOutput.fullTextAnnotation.pages
    );

    return {
      success: true,
      encounters: [], // Strategy A: Encounters written to DB, query healthcare_encounters to retrieve
      page_assignments: [], // Strategy A: Handled by reconciliation, query pass05_page_assignments
      aiModel: progressiveResult.aiModel,
      aiCostUsd: progressiveResult.totalCost,
      inputTokens: progressiveResult.totalInputTokens,
      outputTokens: progressiveResult.totalOutputTokens
    };

  } catch (error) {
    console.error('[Pass 0.5] Encounter discovery error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      aiModel: 'unknown',
      aiCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0
    };
  }
}
