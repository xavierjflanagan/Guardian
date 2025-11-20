/**
 * Database Integration for Progressive Refinement
 * Handles all database operations for progressive sessions
 *
 * Strategy A Updates:
 * - Insert pending encounters with 39 new Strategy A fields
 * - Insert pending identifiers (medical IDs)
 * - Query cascade chains for reconciliation
 * - Batch inserts for performance
 */

import { createClient } from '@supabase/supabase-js';
import {
  ProgressiveSession,
  HandoffPackage,
  PendingEncounter,
  CascadeChain
} from './types';
import { ParsedIdentifier } from './identifier-extractor';

export const supabase = createClient(
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
 *
 * UPDATED for Strategy A (Migration 47):
 * - Renamed: handoff_received → cascade_context_received
 * - Renamed: handoff_generated → cascade_package_sent
 * - Deleted: encounters_started, encounters_completed, encounters_continued
 * - Added: pendings_created, cascading_count, cascade_ids, continues_count
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
  confidence: number;
  cascadeContextReceived: any | null;  // Renamed from handoffReceived
  cascadePackageSent: any;             // Renamed from handoffGenerated
  pendingsCreated: number;             // New Strategy A field
  cascadingCount: number;              // New Strategy A field
  cascadeIds: string[];                // New Strategy A field
  continuesCount: number;              // New Strategy A field
  aiResponseRaw: any;
  processingTimeMs: number;
  pageSeparationAnalysis?: any;        // Optional batching analysis (Migration 47)
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
      confidence_score: params.confidence,
      cascade_context_received: params.cascadeContextReceived,  // Strategy A column name
      cascade_package_sent: params.cascadePackageSent,          // Strategy A column name
      pendings_created: params.pendingsCreated,                 // Strategy A field
      cascading_count: params.cascadingCount,                   // Strategy A field
      cascade_ids: params.cascadeIds,                           // Strategy A field
      continues_count: params.continuesCount,                   // Strategy A field
      page_separation_analysis: params.pageSeparationAnalysis,  // Strategy A field (optional)
      processing_time_ms: params.processingTimeMs,
      ai_response_raw: params.aiResponseRaw
    });

  if (error) {
    throw new Error(`Failed to save chunk results: ${error.message}`);
  }
}

// ============================================================================
// DEPRECATED LEGACY FUNCTIONS (Pre-Strategy A)
// These functions use renamed/deleted columns and are replaced by V3 functions below.
// DO NOT USE - kept for reference during migration only.
// ============================================================================

/**
 * @deprecated Use insertPendingEncounterV3() instead
 * LEGACY: Uses renamed columns (temp_encounter_id, chunk_started, partial_data, etc.)
 */
// export async function savePendingEncounter() - REMOVED

/**
 * @deprecated Query pass05_pending_encounters directly with correct column names
 * LEGACY: Uses renamed columns (temp_encounter_id, chunk_last_seen, etc.)
 */
// export async function getPendingEncounters() - REMOVED

/**
 * @deprecated Use direct Supabase update with reconciled_to/reconciled_at
 * LEGACY: Uses completed_encounter_id and completed_at (renamed in Migration 48)
 */
// export async function markPendingEncounterCompleted() - REMOVED

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

// ============================================================================
// STRATEGY A: NEW HELPER FUNCTIONS
// ============================================================================

/**
 * Insert pending encounter with all Strategy A fields
 *
 * Replaces savePendingEncounter() for Strategy A implementation.
 *
 * CRITICAL FIELDS (NOT NULL):
 * - chunk_number: Which chunk created this pending
 * - encounter_data: Raw AI output stored as jsonb (contains encounter_type, summary, etc.)
 *
 * IMPORTANT: encounter_type, summary, encounter_timeframe_status are stored INSIDE
 * encounter_data jsonb, not as separate columns. Only identity/position/cascade
 * fields have their own columns for querying efficiency.
 *
 * @param sessionId - UUID of progressive session
 * @param chunkNumber - Which chunk created this (1-indexed)
 * @param pending - Complete pending encounter with Strategy A fields
 * @returns Inserted pending_id
 */
export async function insertPendingEncounterV3(
  sessionId: string,
  chunkNumber: number,
  pending: PendingEncounter
): Promise<string> {
  // Build encounter_data jsonb from encounter core fields
  const encounterData = {
    encounter_type: pending.encounter_type,
    encounter_timeframe_status: pending.encounter_timeframe_status,
    summary: pending.summary,
    confidence: pending.confidence,
    // Clinical fields (V11 additions)
    diagnoses: pending.diagnoses || [],
    procedures: pending.procedures || [],
    chief_complaint: pending.chief_complaint || null,
    department: pending.department || null,
    provider_role: pending.provider_role || null,
    disposition: pending.disposition || null,
  };

  const { data, error } = await supabase
    .from('pass05_pending_encounters')
    .insert({
      // Core IDs (REQUIRED)
      session_id: sessionId,
      pending_id: pending.pending_id,
      chunk_number: chunkNumber,  // REQUIRED - which chunk created this
      encounter_data: encounterData,  // REQUIRED - raw AI output as jsonb

      // Cascade fields
      cascade_id: pending.cascade_id,
      is_cascading: pending.is_cascading,
      continues_previous: pending.continues_previous,
      expected_continuation: pending.expected_continuation || null,

      // Position fields (17 total - V11 adds marker + context + region)
      start_page: pending.start_page,
      start_boundary_type: pending.start_boundary_type,
      start_text_marker: pending.start_text_marker,
      start_marker_context: pending.start_marker_context,
      start_region_hint: pending.start_region_hint,
      start_text_y_top: pending.start_text_y_top,
      start_text_height: pending.start_text_height,
      start_y: pending.start_y,
      end_page: pending.end_page,
      end_boundary_type: pending.end_boundary_type,
      end_text_marker: pending.end_text_marker,
      end_marker_context: pending.end_marker_context,
      end_region_hint: pending.end_region_hint,
      end_text_y_top: pending.end_text_y_top,
      end_text_height: pending.end_text_height,
      end_y: pending.end_y,
      position_confidence: pending.position_confidence,

      // Page ranges
      page_ranges: pending.page_ranges,

      // Identity fields
      patient_full_name: pending.patient_full_name,
      patient_date_of_birth: pending.patient_date_of_birth,
      patient_address: pending.patient_address,
      patient_phone: pending.patient_phone,

      // Provider/facility (separate columns for querying)
      provider_name: pending.provider_name,
      facility_name: pending.facility_name,
      encounter_start_date: pending.encounter_start_date,
      encounter_end_date: pending.encounter_end_date,

      // Classification fields
      matched_profile_id: pending.matched_profile_id,
      match_confidence: pending.match_confidence,
      match_status: pending.match_status,
      is_orphan_identity: pending.is_orphan_identity,

      // Quality field
      data_quality_tier: pending.data_quality_tier,

      // Source metadata
      encounter_source: pending.encounter_source,
      created_by_user_id: pending.created_by_user_id,

      // Confidence
      confidence: pending.confidence,

      // Status
      status: 'pending'
    })
    .select('pending_id')
    .single();

  if (error) {
    throw new Error(`Failed to insert pending encounter: ${error.message}`);
  }

  return data.pending_id;
}

/**
 * Batch insert pending encounters
 *
 * Optimized for inserting multiple encounters at once (e.g., all encounters in a chunk).
 * Uses single database transaction for atomicity.
 *
 * @param sessionId - UUID of progressive session
 * @param chunkNumber - Which chunk created these (1-indexed)
 * @param pendings - Array of pending encounters
 * @returns Array of inserted pending_ids
 */
export async function batchInsertPendingEncountersV3(
  sessionId: string,
  chunkNumber: number,
  pendings: PendingEncounter[]
): Promise<string[]> {
  if (pendings.length === 0) {
    return [];
  }

  const rows = pendings.map(pending => {
    // Build encounter_data jsonb
    const encounterData = {
      encounter_type: pending.encounter_type,
      encounter_timeframe_status: pending.encounter_timeframe_status,
      summary: pending.summary,
      confidence: pending.confidence,
      // Clinical fields (V11 additions)
      diagnoses: pending.diagnoses || [],
      procedures: pending.procedures || [],
      chief_complaint: pending.chief_complaint || null,
      department: pending.department || null,
      provider_role: pending.provider_role || null,
      disposition: pending.disposition || null,
    };

    return {
      // Core IDs (REQUIRED)
      session_id: sessionId,
      pending_id: pending.pending_id,
      chunk_number: chunkNumber,  // REQUIRED
      encounter_data: encounterData,  // REQUIRED

      // Cascade fields
      cascade_id: pending.cascade_id,
      is_cascading: pending.is_cascading,
      continues_previous: pending.continues_previous,
      expected_continuation: pending.expected_continuation || null,

      // Position fields (17 total - V11 adds marker + context + region)
      start_page: pending.start_page,
      start_boundary_type: pending.start_boundary_type,
      start_text_marker: pending.start_text_marker,
      start_marker_context: pending.start_marker_context,
      start_region_hint: pending.start_region_hint,
      start_text_y_top: pending.start_text_y_top,
      start_text_height: pending.start_text_height,
      start_y: pending.start_y,
      end_page: pending.end_page,
      end_boundary_type: pending.end_boundary_type,
      end_text_marker: pending.end_text_marker,
      end_marker_context: pending.end_marker_context,
      end_region_hint: pending.end_region_hint,
      end_text_y_top: pending.end_text_y_top,
      end_text_height: pending.end_text_height,
      end_y: pending.end_y,
      position_confidence: pending.position_confidence,

      // Page ranges
      page_ranges: pending.page_ranges,

      // Identity fields
      patient_full_name: pending.patient_full_name,
      patient_date_of_birth: pending.patient_date_of_birth,
      patient_address: pending.patient_address,
      patient_phone: pending.patient_phone,

      // Provider/facility
      provider_name: pending.provider_name,
      facility_name: pending.facility_name,
      encounter_start_date: pending.encounter_start_date,
      encounter_end_date: pending.encounter_end_date,

      // Classification fields
      matched_profile_id: pending.matched_profile_id,
      match_confidence: pending.match_confidence,
      match_status: pending.match_status,
      is_orphan_identity: pending.is_orphan_identity,

      // Quality field
      data_quality_tier: pending.data_quality_tier,

      // Source metadata
      encounter_source: pending.encounter_source,
      created_by_user_id: pending.created_by_user_id,

      // Confidence
      confidence: pending.confidence,

      // Status
      status: 'pending'
    };
  });

  const { data, error } = await supabase
    .from('pass05_pending_encounters')
    .insert(rows)
    .select('pending_id');

  if (error) {
    throw new Error(`Failed to batch insert pending encounters: ${error.message}`);
  }

  return (data || []).map(row => row.pending_id);
}

/**
 * Insert pending encounter identifiers
 *
 * Stores medical identifiers (MRN, Medicare, Insurance) in separate table.
 * Links to pending encounter via (session_id, pending_id).
 *
 * NOTE: normalized_value is NOT stored in database (only in ParsedIdentifier for in-memory use).
 * The table only has: identifier_type, identifier_value, issuing_organization, detected_context.
 *
 * @param sessionId - UUID of progressive session
 * @param pendingId - Pending encounter ID
 * @param identifiers - Array of parsed identifiers from identifier-extractor
 */
export async function insertPendingIdentifiers(
  sessionId: string,
  pendingId: string,
  identifiers: ParsedIdentifier[]
): Promise<void> {
  if (identifiers.length === 0) {
    return; // No identifiers to insert
  }

  const rows = identifiers.map(id => ({
    session_id: sessionId,
    pending_id: pendingId,
    identifier_type: id.identifier_type,
    identifier_value: id.identifier_value,
    issuing_organization: id.issuing_organization,
    detected_context: id.detected_context
    // NOTE: normalized_value NOT included - column doesn't exist in database
  }));

  const { error } = await supabase
    .from('pass05_pending_encounter_identifiers')
    .insert(rows);

  if (error) {
    throw new Error(`Failed to insert pending identifiers: ${error.message}`);
  }
}

/**
 * Batch insert identifiers for multiple pending encounters
 *
 * Optimized for inserting all identifiers from a chunk at once.
 *
 * @param sessionId - UUID of progressive session
 * @param identifiersByPending - Map of pending_id to identifiers array
 */
export async function batchInsertPendingIdentifiers(
  sessionId: string,
  identifiersByPending: Map<string, ParsedIdentifier[]>
): Promise<void> {
  const allRows: any[] = [];

  for (const [pendingId, identifiers] of identifiersByPending.entries()) {
    for (const id of identifiers) {
      allRows.push({
        session_id: sessionId,
        pending_id: pendingId,
        identifier_type: id.identifier_type,
        identifier_value: id.identifier_value,
        issuing_organization: id.issuing_organization,
        detected_context: id.detected_context
        // NOTE: normalized_value NOT included - column doesn't exist in database
      });
    }
  }

  if (allRows.length === 0) {
    return; // No identifiers to insert
  }

  const { error } = await supabase
    .from('pass05_pending_encounter_identifiers')
    .insert(allRows);

  if (error) {
    throw new Error(`Failed to batch insert pending identifiers: ${error.message}`);
  }
}

/**
 * Batch insert page assignments for pending encounters
 *
 * Maps pages to pending encounters during chunk processing.
 * Later reconciled to final encounter_id during reconciliation.
 *
 * @param sessionId - UUID of progressive session
 * @param shellFileId - UUID of shell file
 * @param chunkNumber - Current chunk number
 * @param pageAssignments - Array of page assignment records
 */
export async function batchInsertPageAssignments(
  sessionId: string,
  shellFileId: string,
  chunkNumber: number,
  pageAssignments: Array<{
    pending_id: string;
    cascade_id: string | null;
    page_num: number;
    justification: string;
  }>
): Promise<void> {
  if (pageAssignments.length === 0) {
    return; // No assignments to insert
  }

  const rows = pageAssignments.map(assignment => ({
    shell_file_id: shellFileId,
    page_num: assignment.page_num,
    session_id: sessionId,
    pending_id: assignment.pending_id,
    encounter_id: null, // Will be set during reconciliation
    reconciled_at: null, // Will be set during reconciliation
    chunk_number: chunkNumber,
    cascade_id: assignment.cascade_id,
    justification: assignment.justification
  }));

  const { error } = await supabase
    .from('pass05_page_assignments')
    .insert(rows);

  if (error) {
    throw new Error(`Failed to batch insert page assignments: ${error.message}`);
  }
}

/**
 * Update shell_files.page_separation_analysis with extracted coordinates
 *
 * This stores the safe split points for downstream Pass 1/2 batching optimization.
 * Should be called AFTER coordinate extraction completes.
 *
 * @param shellFileId - UUID of shell file
 * @param pageSeparationAnalysis - Complete analysis with extracted coordinates
 */
export async function updatePageSeparationAnalysis(
  shellFileId: string,
  pageSeparationAnalysis: any
): Promise<void> {
  const { error } = await supabase
    .from('shell_files')
    .update({ page_separation_analysis: pageSeparationAnalysis })
    .eq('id', shellFileId);

  if (error) {
    throw new Error(`Failed to update page_separation_analysis: ${error.message}`);
  }
}

/**
 * Track new cascade chain (DEBT-002)
 *
 * Creates a new cascade chain record when a cascading encounter is first detected.
 * Moved from cascade-manager.ts per DEBT-002 refactor.
 *
 * @param cascadeId - Unique cascade identifier
 * @param sessionId - UUID of progressive session
 * @param originChunk - Chunk number where cascade started (1-indexed)
 */
export async function trackCascadeChain(
  cascadeId: string,
  sessionId: string,
  originChunk: number
): Promise<void> {
  const { error } = await supabase
    .from('pass05_cascade_chains')
    .insert({
      session_id: sessionId,
      cascade_id: cascadeId,
      origin_chunk: originChunk,
      last_chunk: null,
      final_encounter_id: null,
      pendings_count: 1,
      created_at: new Date().toISOString(),
      completed_at: null
    });

  if (error) {
    throw new Error(`Failed to track cascade ${cascadeId}: ${error.message}`);
  }
}

/**
 * Increment pending count for existing cascade (atomic via RPC)
 *
 * Called when a continuation encounter is detected in a subsequent chunk.
 * Moved from cascade-manager.ts per DEBT-002 refactor.
 *
 * Updated in Week 4-5 to use increment_cascade_pending_count RPC for atomic increment
 * (Migration 52 Issue #4). Replaces previous fetch+update pattern.
 *
 * @param cascadeId - Unique cascade identifier
 * @throws Error if cascade not found or database update fails
 */
export async function incrementCascadePendingCount(
  cascadeId: string
): Promise<void> {
  const { error } = await supabase
    .rpc('increment_cascade_pending_count', {
      p_cascade_id: cascadeId
    });

  if (error) {
    throw new Error(`Failed to increment cascade pending count: ${error.message}`);
  }
}

/**
 * Get cascade chain by ID
 *
 * Used during reconciliation to track cascade metadata.
 *
 * @param cascadeId - Unique cascade identifier
 * @returns Cascade chain record or null if not found
 */
export async function getCascadeChainById(
  cascadeId: string
): Promise<CascadeChain | null> {
  const { data, error } = await supabase
    .from('pass05_cascade_chains')
    .select('*')
    .eq('cascade_id', cascadeId)
    .single();

  if (error) {
    // Not found is OK (return null)
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get cascade chain: ${error.message}`);
  }

  return data as CascadeChain;
}

/**
 * Complete cascade after reconciliation (DEBT-002)
 *
 * Updates cascade chain with final encounter ID and completion metadata.
 * Validates pendingsCount matches tracked count before updating.
 * Moved from cascade-manager.ts per DEBT-002 refactor.
 *
 * @param cascadeId - Unique cascade identifier
 * @param lastChunk - Chunk number where cascade ended (1-indexed)
 * @param finalEncounterId - UUID of final healthcare_encounter
 * @param pendingsCount - Number of pendings in this cascade (for validation)
 */
export async function completeCascadeChain(
  cascadeId: string,
  lastChunk: number,
  finalEncounterId: string,
  pendingsCount: number
): Promise<void> {
  // Fetch current chain to validate
  const { data: chain, error: fetchError } = await supabase
    .from('pass05_cascade_chains')
    .select('pendings_count, origin_chunk')
    .eq('cascade_id', cascadeId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch cascade ${cascadeId} for completion: ${fetchError.message}`);
  }

  // Validate: caller's count should match or exceed tracked count
  const trackedCount = chain.pendings_count || 1;
  if (pendingsCount < trackedCount) {
    throw new Error(
      `Cascade ${cascadeId} completion validation failed: ` +
      `caller reports ${pendingsCount} pendings but chain tracked ${trackedCount}. ` +
      `This indicates missing pendings in reconciliation.`
    );
  }

  // Validate: lastChunk should be >= origin_chunk
  if (lastChunk < chain.origin_chunk) {
    throw new Error(
      `Cascade ${cascadeId} completion validation failed: ` +
      `lastChunk ${lastChunk} cannot be before origin_chunk ${chain.origin_chunk}`
    );
  }

  // Update cascade with final data
  const { error: updateError } = await supabase
    .from('pass05_cascade_chains')
    .update({
      last_chunk: lastChunk,
      final_encounter_id: finalEncounterId,
      pendings_count: pendingsCount,
      completed_at: new Date().toISOString()
    })
    .eq('cascade_id', cascadeId);

  if (updateError) {
    throw new Error(`Failed to complete cascade ${cascadeId}: ${updateError.message}`);
  }
}

/**
 * Get all incomplete cascades for a session
 *
 * Used by reconciliation to find cascades needing completion.
 * Incomplete cascades have final_encounter_id = NULL.
 *
 * @param sessionId - UUID of progressive session
 * @returns Array of incomplete cascade chains
 */
export async function getIncompleteCascades(
  sessionId: string
): Promise<CascadeChain[]> {
  const { data, error } = await supabase
    .from('pass05_cascade_chains')
    .select('*')
    .eq('session_id', sessionId)
    .is('final_encounter_id', null)
    .order('origin_chunk', { ascending: true });

  if (error) {
    throw new Error(`Failed to get incomplete cascades: ${error.message}`);
  }

  return (data || []) as CascadeChain[];
}

// ============================================================================
// RECONCILIATION HELPERS (Week 4-5)
// ============================================================================

/**
 * Get all pending encounters for a session with specific status
 *
 * Used by reconciliation to fetch all pendings that need to be converted to finals.
 *
 * @param sessionId - UUID of progressive session
 * @param status - Pending status filter ('pending', 'completed', 'abandoned')
 * @returns Array of pending encounter records
 */
export async function getPendingsByStatus(
  sessionId: string,
  status: 'pending' | 'completed' | 'abandoned'
): Promise<any[]> {
  const { data, error } = await supabase
    .from('pass05_pending_encounters')
    .select('*')
    .eq('session_id', sessionId)
    .eq('status', status)
    .order('chunk_number', { ascending: true })
    .order('pending_id', { ascending: true });

  if (error) {
    throw new Error(`Failed to get pending encounters: ${error.message}`);
  }

  return data || [];
}

/**
 * Reconcile pending encounters to final encounter (atomic via RPC)
 *
 * Calls reconcile_pending_to_final RPC which atomically:
 * - Inserts final encounter into healthcare_encounters
 * - Marks all pendings as completed
 * - Updates page assignments with final encounter ID
 *
 * @param pendingIds - Array of pending encounter UUIDs to merge
 * @param patientId - Patient UUID for final encounter
 * @param shellFileId - Shell file UUID for final encounter
 * @param encounterData - All encounter fields as JSONB
 * @returns UUID of created final encounter
 */
export async function reconcilePendingsToFinal(
  pendingIds: string[],
  patientId: string,
  shellFileId: string,
  encounterData: any
): Promise<string> {
  const { data, error } = await supabase
    .rpc('reconcile_pending_to_final', {
      p_pending_ids: pendingIds,
      p_patient_id: patientId,
      p_shell_file_id: shellFileId,
      p_encounter_data: encounterData
    });

  if (error) {
    throw new Error(`Failed to reconcile pendings to final: ${error.message}`);
  }

  return data as string;
}

/**
 * Fetch all chunk results for batching analysis aggregation
 *
 * Used by reconciliation to aggregate page_separation_analysis from all chunks
 * into shell_files.page_separation_analysis.
 *
 * @param sessionId - UUID of progressive session
 * @returns Array of chunk results with page_separation_analysis
 */
export async function getChunkResultsForSession(
  sessionId: string
): Promise<Array<{ chunk_number: number; page_separation_analysis: any }>> {
  const { data, error } = await supabase
    .from('pass05_chunk_results')
    .select('chunk_number, page_separation_analysis')
    .eq('session_id', sessionId)
    .order('chunk_number', { ascending: true });

  if (error) {
    throw new Error(`Failed to get chunk results: ${error.message}`);
  }

  return data || [];
}

/**
 * Update shell_files with aggregated batching analysis
 *
 * Stores final page_separation_analysis with all safe split points from all chunks.
 * Called by reconciliation after merging split points.
 *
 * NOTE: updatePageSeparationAnalysis() already exists (database.ts:569), but this
 * is a more specific helper for reconciliation's aggregated analysis.
 *
 * @param shellFileId - UUID of shell file
 * @param aggregatedAnalysis - Combined page_separation_analysis from all chunks
 */
export async function updateAggregatedBatchingAnalysis(
  shellFileId: string,
  aggregatedAnalysis: any
): Promise<void> {
  const { error } = await supabase
    .from('shell_files')
    .update({ page_separation_analysis: aggregatedAnalysis })
    .eq('id', shellFileId);

  if (error) {
    throw new Error(`Failed to update aggregated batching analysis: ${error.message}`);
  }
}

/**
 * Finalize session metrics after reconciliation (atomic via RPC)
 *
 * Calls finalize_session_metrics RPC which atomically:
 * - Counts final encounters created
 * - Counts any unresolved pendings (flags for review)
 * - Aggregates chunk metrics (tokens, cost, confidence)
 * - Updates pass05_progressive_sessions with final metrics
 *
 * @param sessionId - UUID of progressive session
 * @returns Metrics summary (final_encounters, pending_count, total_cost, etc.)
 */
export async function finalizeSessionMetrics(
  sessionId: string
): Promise<{
  final_encounters: number;
  pending_count: number;
  total_pendings_created: number;
  total_cost_usd: number;
  requires_review: boolean;
}> {
  const { data, error } = await supabase
    .rpc('finalize_session_metrics', {
      p_session_id: sessionId
    });

  if (error) {
    throw new Error(`Failed to finalize session metrics: ${error.message}`);
  }

  return data as any;
}
