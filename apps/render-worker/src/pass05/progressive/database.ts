/**
 * Database Integration for Progressive Refinement
 * Handles all database operations for progressive sessions
 */

import { createClient } from '@supabase/supabase-js';
import { ProgressiveSession, HandoffPackage, PendingEncounterRecord } from './types';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Initialize a new progressive processing session
 */
export async function initializeProgressiveSession(
  shellFileId: string,
  patientId: string,
  totalPages: number,
  chunkSize: number
): Promise<ProgressiveSession> {
  const totalChunks = Math.ceil(totalPages / chunkSize);

  const { data, error } = await supabase
    .from('pass05_progressive_sessions')
    .insert({
      shell_file_id: shellFileId,
      patient_id: patientId,
      total_pages: totalPages,
      chunk_size: chunkSize,
      total_chunks: totalChunks,
      current_chunk: 0,
      processing_status: 'initialized'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to initialize progressive session: ${error.message}`);
  }

  return {
    id: data.id,
    shellFileId: data.shell_file_id,
    patientId: data.patient_id,
    totalPages: data.total_pages,
    chunkSize: data.chunk_size,
    totalChunks: data.total_chunks,
    currentChunk: data.current_chunk
  };
}

/**
 * Update session progress after processing a chunk
 */
export async function updateSessionProgress(
  sessionId: string,
  chunkNumber: number,
  handoffPackage: HandoffPackage
): Promise<void> {
  const { error } = await supabase.rpc('update_progressive_session_progress', {
    p_session_id: sessionId,
    p_chunk_number: chunkNumber,
    p_handoff_package: handoffPackage
  });

  if (error) {
    throw new Error(`Failed to update session progress: ${error.message}`);
  }
}

/**
 * Mark session as failed
 */
export async function markSessionFailed(
  sessionId: string,
  errorMessage: string
): Promise<void> {
  const { error } = await supabase
    .from('pass05_progressive_sessions')
    .update({
      processing_status: 'failed',
      review_reasons: [errorMessage],
      requires_manual_review: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId);

  if (error) {
    throw new Error(`Failed to mark session as failed: ${error.message}`);
  }
}

/**
 * Save chunk processing results
 */
export async function saveChunkResults(params: {
  sessionId: string;
  chunkNumber: number;
  pageStart: number;
  pageEnd: number;
  aiModel: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  handoffReceived: HandoffPackage | null;
  handoffGenerated: HandoffPackage;
  encountersCompleted: number;
  encountersPending: number;
  aiResponseRaw: any;
  processingTimeMs: number;
}): Promise<void> {
  const { error } = await supabase
    .from('pass05_chunk_results')
    .insert({
      session_id: params.sessionId,
      chunk_number: params.chunkNumber,
      page_start: params.pageStart,
      page_end: params.pageEnd,
      processing_status: 'completed',
      ai_model_used: params.aiModel,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      ai_cost_usd: params.cost,
      handoff_received: params.handoffReceived,
      handoff_generated: params.handoffGenerated,
      encounters_started: params.encountersCompleted,
      encounters_completed: params.encountersCompleted,
      encounters_continued: params.encountersPending > 0 ? 1 : 0,
      processing_time_ms: params.processingTimeMs,
      ai_response_raw: params.aiResponseRaw
    });

  if (error) {
    throw new Error(`Failed to save chunk results: ${error.message}`);
  }
}

/**
 * Save or update a pending encounter
 */
export async function savePendingEncounter(
  sessionId: string,
  pending: NonNullable<HandoffPackage['pendingEncounter']>,
  chunkNumber: number  // FIXED: Pass actual chunk number instead of calculating
): Promise<void> {
  // Try to update existing first, then insert if not found
  const { data: existing } = await supabase
    .from('pass05_pending_encounters')
    .select('id, page_ranges')
    .eq('session_id', sessionId)
    .eq('temp_encounter_id', pending.tempId)
    .single();

  if (existing) {
    // Update existing pending encounter
    // TIER 2 FIX: Track chunk_last_seen and accumulate page_ranges
    const updatedPageRanges = [...(existing.page_ranges || []), pending.startPage];

    const { error } = await supabase
      .from('pass05_pending_encounters')
      .update({
        chunk_last_seen: chunkNumber,  // TIER 2 FIX: Track which chunk last saw this
        partial_data: pending.partialData,
        page_ranges: updatedPageRanges,  // TIER 2 FIX: Accumulate page numbers
        last_seen_context: pending.lastSeenContext,
        expected_continuation: pending.expectedContinuation,
        confidence: pending.confidence,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);

    if (error) {
      throw new Error(`Failed to update pending encounter: ${error.message}`);
    }
  } else {
    // Insert new pending encounter
    const { error } = await supabase
      .from('pass05_pending_encounters')
      .insert({
        session_id: sessionId,
        temp_encounter_id: pending.tempId,
        chunk_started: chunkNumber,  // FIXED: Use actual chunk number, not calculated
        chunk_last_seen: chunkNumber,  // TIER 2 FIX: Track last seen chunk
        partial_data: pending.partialData,
        page_ranges: [pending.startPage],  // TIER 2 FIX: Initialize page ranges array
        last_seen_context: pending.lastSeenContext,
        expected_continuation: pending.expectedContinuation,
        confidence: pending.confidence,
        status: 'pending'
      });

    if (error) {
      throw new Error(`Failed to save pending encounter: ${error.message}`);
    }
  }
}

/**
 * Get all pending encounters for a session
 */
export async function getPendingEncounters(
  sessionId: string
): Promise<PendingEncounterRecord[]> {
  const { data, error } = await supabase
    .from('pass05_pending_encounters')
    .select('*')
    .eq('session_id', sessionId)
    .eq('status', 'pending');

  if (error) {
    throw new Error(`Failed to get pending encounters: ${error.message}`);
  }

  return (data || []).map(row => ({
    id: row.id,
    sessionId: row.session_id,
    tempEncounterId: row.temp_encounter_id,
    chunkStarted: row.chunk_started,
    chunkLastSeen: row.chunk_last_seen,
    partialData: row.partial_data,
    pageRanges: row.page_ranges || [],
    lastSeenContext: row.last_seen_context,
    expectedContinuation: row.expected_continuation,
    status: row.status,
    completedEncounterId: row.completed_encounter_id,
    confidence: row.confidence,
    requiresReview: row.requires_review
  }));
}

/**
 * Mark a pending encounter as completed
 */
export async function markPendingEncounterCompleted(
  pendingId: string,
  completedEncounterId: string
): Promise<void> {
  const { error } = await supabase
    .from('pass05_pending_encounters')
    .update({
      status: 'completed',
      completed_encounter_id: completedEncounterId,
      completed_at: new Date().toISOString()
    })
    .eq('id', pendingId);

  if (error) {
    throw new Error(`Failed to mark pending encounter as completed: ${error.message}`);
  }
}

/**
 * Finalize progressive session
 */
export async function finalizeProgressiveSession(
  sessionId: string
): Promise<void> {
  const { error } = await supabase.rpc('finalize_progressive_session', {
    p_session_id: sessionId
  });

  if (error) {
    throw new Error(`Failed to finalize progressive session: ${error.message}`);
  }
}
