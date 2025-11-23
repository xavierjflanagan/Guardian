/**
 * Progressive Session Manager - Strategy A
 * Orchestrates multi-chunk processing for large documents
 *
 * STRATEGY A (V11) RECONCILIATION FLOW:
 * 1. Process all chunks sequentially (create pendings, no finals)
 * 2. After all chunks complete → call reconcilePendingEncounters()
 * 3. Reconciliation groups by cascade_id, merges position data, creates finals
 * 4. Call finalizeSessionMetrics() RPC for atomic session finalization
 *
 * Key Difference from v2.9:
 * - NO completed encounters during chunk processing
 * - ALL reconciliation happens AFTER all chunks complete
 * - Uses atomic RPCs for data integrity
 */

import { HandoffPackage, ChunkParams } from './types';
import { OCRPage } from '../types';
import {
  initializeProgressiveSession,
  updateSessionProgress,
  markSessionFailed,
  finalizeSessionMetrics,
  supabase
} from './database';
import { processChunk } from './chunk-processor';
import { reconcilePendingEncounters } from './pending-reconciler';

const CHUNK_SIZE = 50; // Pages per chunk

/**
 * Progressive processing result
 */
export interface ProgressiveResult {
  finalEncounters: string[]; // Array of encounter UUIDs created
  sessionId: string;
  totalChunks: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalPendingsCreated: number; // Strategy A: Track pendings created
  requiresManualReview: boolean;
  reviewReasons: string[];
  aiModel: string;
}

/**
 * Process large document progressively
 *
 * Strategy A Flow:
 * 1. Initialize session
 * 2. Process chunks sequentially (creates pendings only)
 * 3. After all chunks → reconcile pendings to finals
 * 4. Finalize session metrics via RPC
 * 5. Update shell_files completion status
 *
 * @param shellFileId - UUID of shell file being processed
 * @param patientId - UUID of patient (from session context)
 * @param pages - OCR pages for entire document
 * @returns Progressive result with final encounters and metrics
 */
export async function processDocumentProgressively(
  shellFileId: string,
  patientId: string,
  pages: OCRPage[]
): Promise<ProgressiveResult> {
  const totalPages = pages.length;

  // STEP 1: Initialize progressive session
  const session = await initializeProgressiveSession(
    shellFileId,
    patientId,
    totalPages,
    CHUNK_SIZE
  );

  console.log(
    `[Progressive] Started session ${session.id} for ${totalPages} pages (${session.totalChunks} chunks)`
  );

  let cascadePackage: HandoffPackage | null = null;
  const reviewReasons: string[] = [];
  let aiModel = '';

  try {
    // STEP 2: Process chunks sequentially
    for (let chunkNum = 1; chunkNum <= session.totalChunks; chunkNum++) {
      // Calculate chunk boundaries (1-based page numbering)
      const startIdx = (chunkNum - 1) * CHUNK_SIZE;
      const endIdx = Math.min(startIdx + CHUNK_SIZE, totalPages);
      const chunkPages = pages.slice(startIdx, endIdx);

      const pageStart = startIdx + 1; // Convert to 1-based
      const pageEnd = endIdx;

      console.log(
        `[Progressive] Processing chunk ${chunkNum}/${session.totalChunks} (pages ${pageStart}-${pageEnd})`
      );

      const chunkParams: ChunkParams = {
        sessionId: session.id,
        chunkNumber: chunkNum,
        totalChunks: session.totalChunks,
        pages: chunkPages,
        pageRange: [pageStart, pageEnd],
        totalPages,
        handoffReceived: cascadePackage,
        patientId,
        shellFileId
      };

      const result = await processChunk(chunkParams);

      // Track AI model used
      aiModel = result.metrics.aiModel;

      // Low confidence warning
      if (result.metrics.confidence < 0.7) {
        reviewReasons.push(
          `Chunk ${chunkNum} low confidence: ${result.metrics.confidence.toFixed(2)}`
        );
      }

      // Update session progress with cascade package
      cascadePackage = result.handoffGenerated;
      if (cascadePackage) {
        await updateSessionProgress(session.id, chunkNum, cascadePackage);
      }

      console.log(
        `[Progressive] Chunk ${chunkNum} complete, ` +
        `${result.metrics.cost.toFixed(4)} USD`
      );
    }

    console.log(`[Progressive] All chunks complete.`);

    // STEP 3: Reconcile pending encounters to final encounters
    console.log(`[Progressive] Starting reconciliation...`);

    // Migration 64: Fetch file metadata for date waterfall hierarchy
    const { data: shellFile } = await supabase
      .from('shell_files')
      .select('created_at')
      .eq('id', shellFileId)
      .single();

    const fileCreatedAt = shellFile?.created_at ? new Date(shellFile.created_at) : null;

    if (fileCreatedAt) {
      console.log(`[Progressive] File created at: ${fileCreatedAt.toISOString()}`);
    } else {
      console.warn(`[Progressive] No file created_at timestamp available - will use upload_date fallback`);
    }

    const finalEncounterIds = await reconcilePendingEncounters(
      session.id,
      shellFileId,
      patientId,
      totalPages,
      fileCreatedAt  // Migration 64: Pass file timestamp for date waterfall
    );

    console.log(
      `[Progressive] Reconciliation complete: ${finalEncounterIds.length} final encounters created`
    );

    // Update session with reconciliation completion timestamp (Rabbit #19 - Migration 57)
    const { error: updateError } = await supabase
      .from('pass05_progressive_sessions')
      .update({
        reconciliation_completed_at: new Date().toISOString()
      })
      .eq('id', session.id);

    if (updateError) {
      console.error(`[Progressive] Failed to update reconciliation_completed_at:`, updateError);
    }

    // STEP 4: Finalize session metrics via atomic RPC
    console.log(`[Progressive] Finalizing session metrics...`);

    const sessionMetrics = await finalizeSessionMetrics(session.id);

    console.log(
      `[Progressive] Session metrics finalized: ` +
      `${sessionMetrics.final_encounters} encounters, ` +
      `${sessionMetrics.total_pendings_created} pendings processed, ` +
      `$${sessionMetrics.total_cost_usd.toFixed(4)}`
    );

    // Check for unresolved pendings (requires manual review)
    if (sessionMetrics.requires_review) {
      reviewReasons.push(
        `${sessionMetrics.pending_count} pending encounters not reconciled (requires manual review)`
      );
    }

    // STEP 5: Update shell_files with completion status
    const { error: shellUpdateError } = await supabase
      .from('shell_files')
      .update({
        pass_0_5_completed: true,
        pass_0_5_version: 'v11-strategy-a',
        status: 'completed',
        processing_completed_at: new Date().toISOString()
      })
      .eq('id', shellFileId);

    if (shellUpdateError) {
      console.error(
        `[Progressive] Failed to update shell_files: ${shellUpdateError.message}`
      );
      // Don't throw - non-critical
    }

    console.log(
      `[Progressive] Session ${session.id} complete: ` +
      `${finalEncounterIds.length} final encounters, ` +
      `$${sessionMetrics.total_cost_usd.toFixed(4)}`
    );

    return {
      finalEncounters: finalEncounterIds,
      sessionId: session.id,
      totalChunks: session.totalChunks,
      totalCost: sessionMetrics.total_cost_usd,
      totalInputTokens: 0, // TODO: Get from session metrics if needed
      totalOutputTokens: 0, // TODO: Get from session metrics if needed
      totalPendingsCreated: sessionMetrics.total_pendings_created,
      requiresManualReview: reviewReasons.length > 0 || sessionMetrics.requires_review,
      reviewReasons,
      aiModel
    };

  } catch (error) {
    // Mark session as failed
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Progressive] Session ${session.id} failed:`, errorMessage);

    await markSessionFailed(session.id, errorMessage);

    throw new Error(`Progressive session ${session.id} failed: ${errorMessage}`);
  }
}
