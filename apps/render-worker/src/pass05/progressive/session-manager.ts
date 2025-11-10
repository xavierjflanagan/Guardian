/**
 * Progressive Session Manager
 * Orchestrates multi-chunk processing for large documents
 */

import { HandoffPackage, ChunkParams } from './types';
import { OCRPage, EncounterMetadata, PageAssignment } from '../types';
import {
  initializeProgressiveSession,
  updateSessionProgress,
  markSessionFailed,
  finalizeProgressiveSession,
  getPendingEncounters
} from './database';
import { processChunk } from './chunk-processor';
import { reconcilePendingEncounters } from './pending-reconciler';

const CHUNK_SIZE = 50; // Pages per chunk
const PAGE_THRESHOLD = 100; // Switch to progressive mode above this

/**
 * Determine if document requires progressive processing
 * Migration 45: Automatic based on page count (no environment variable)
 */
export function shouldUseProgressiveMode(totalPages: number): boolean {
  return totalPages > PAGE_THRESHOLD;
}

/**
 * Progressive processing result
 */
export interface ProgressiveResult {
  encounters: EncounterMetadata[];
  pageAssignments: PageAssignment[];
  sessionId: string;
  totalChunks: number;
  totalCost: number;
  totalInputTokens: number;  // FIXED: Track separately for accurate reporting
  totalOutputTokens: number;  // FIXED: Track separately for accurate reporting
  requiresManualReview: boolean;
  reviewReasons: string[];
  aiModel: string; // Migration 45: AI model used for processing
}

/**
 * Process large document progressively
 */
export async function processDocumentProgressively(
  shellFileId: string,
  patientId: string,
  pages: OCRPage[]
): Promise<ProgressiveResult> {
  const totalPages = pages.length;

  // Initialize session
  const session = await initializeProgressiveSession(
    shellFileId,
    patientId,
    totalPages,
    CHUNK_SIZE
  );

  console.log(`[Progressive] Started session ${session.id} for ${totalPages} pages (${session.totalChunks} chunks)`);

  const allEncounters: EncounterMetadata[] = [];
  const allPageAssignments: PageAssignment[] = [];
  let handoffPackage: HandoffPackage | null = null;
  let totalCost = 0;
  let totalInputTokens = 0;  // FIXED: Track separately
  let totalOutputTokens = 0;  // FIXED: Track separately
  const reviewReasons: string[] = [];
  let aiModel = ''; // Migration 45: Track model used

  try {
    // Process chunks sequentially
    for (let chunkNum = 1; chunkNum <= session.totalChunks; chunkNum++) {
      const startIdx = (chunkNum - 1) * CHUNK_SIZE;
      const endIdx = Math.min(startIdx + CHUNK_SIZE, totalPages);
      const chunkPages = pages.slice(startIdx, endIdx);

      console.log(`[Progressive] Processing chunk ${chunkNum}/${session.totalChunks} (pages ${startIdx + 1}-${endIdx})`);

      const chunkParams: ChunkParams = {
        sessionId: session.id,
        chunkNumber: chunkNum,
        totalChunks: session.totalChunks,
        pages: chunkPages,
        pageRange: [startIdx, endIdx],
        totalPages,
        handoffReceived: handoffPackage,
        patientId,
        shellFileId
      };

      const result = await processChunk(chunkParams);

      // Accumulate completed encounters and page assignments
      allEncounters.push(...result.completedEncounters);
      allPageAssignments.push(...result.completedPageAssignments);

      // Track metrics
      totalCost += result.metrics.cost;
      totalInputTokens += result.metrics.inputTokens;  // FIXED: Track separately
      totalOutputTokens += result.metrics.outputTokens;  // FIXED: Track separately
      aiModel = result.metrics.aiModel; // Migration 45: Capture model used

      // Low confidence warning
      if (result.metrics.confidence < 0.7) {
        reviewReasons.push(`Chunk ${chunkNum} low confidence: ${result.metrics.confidence}`);
      }

      // Update session progress
      handoffPackage = result.handoffGenerated;
      await updateSessionProgress(session.id, chunkNum, handoffPackage);

      console.log(`[Progressive] Chunk ${chunkNum} complete: ${result.completedEncounters.length} encounters, ${result.metrics.cost.toFixed(4)} USD`);
    }

    // Reconcile any pending encounters
    console.log(`[Progressive] Reconciling pending encounters...`);
    const pendingRecords = await getPendingEncounters(session.id);

    if (pendingRecords.length > 0) {
      const reconciledEncounters = await reconcilePendingEncounters(
        session.id,
        pendingRecords,
        allEncounters
      );

      allEncounters.push(...reconciledEncounters);
      console.log(`[Progressive] Reconciled ${reconciledEncounters.length} pending encounters`);
    }

    // Finalize session
    await finalizeProgressiveSession(session.id);

    console.log(`[Progressive] Session ${session.id} complete: ${allEncounters.length} total encounters, ${totalCost.toFixed(4)} USD`);

    return {
      encounters: allEncounters,
      pageAssignments: allPageAssignments,
      sessionId: session.id,
      totalChunks: session.totalChunks,
      totalCost,
      totalInputTokens,  // FIXED: Return actual values
      totalOutputTokens,  // FIXED: Return actual values
      requiresManualReview: reviewReasons.length > 0,
      reviewReasons,
      aiModel // Migration 45: Return model used
    };

  } catch (error) {
    // Mark session as failed
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Progressive] Session ${session.id} failed:`, errorMessage);

    await markSessionFailed(session.id, errorMessage);

    throw new Error(`Progressive session ${session.id} failed: ${errorMessage}`);
  }
}
