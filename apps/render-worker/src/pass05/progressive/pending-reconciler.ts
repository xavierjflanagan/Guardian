/**
 * Pending Encounter Reconciler - Strategy A
 *
 * Purpose: Convert pending encounters to final healthcare_encounters after all chunks complete.
 *
 * Strategy A Flow:
 * 1. ALL encounters become pendings during chunk processing (no direct finals)
 * 2. After all chunks complete, reconciliation groups pendings by cascade_id
 * 3. Position data merged: first chunk's start + last chunk's end
 * 4. Identifiers, quality tier calculated, and final encounter created via atomic RPC
 *
 * Source: 08-RECONCILIATION-STRATEGY-V2.md
 * Complexity: VERY HIGH
 */

import {
  getPendingsByStatus,
  reconcilePendingsToFinal,
  getChunkResultsForSession,
  updateAggregatedBatchingAnalysis,
  completeCascadeChain,
  supabase
} from './database';

/**
 * Pick best value from array of nullable strings
 * Migration 58: Helper for identity field merging
 *
 * Prefers non-null, non-empty values.
 * For multiple non-empty values, picks longest (more information = better).
 *
 * @param values - Array of nullable strings from multiple pending encounters
 * @returns Best value or null if all are null/empty
 */
function pickBestValue(values: (string | null)[]): string | null {
  const nonNull = values.filter((v): v is string => v !== null && v.trim() !== '');
  if (nonNull.length === 0) return null;
  if (nonNull.length === 1) return nonNull[0];

  // Pick longest value (more information = better)
  return nonNull.reduce((best, current) =>
    current.length > best.length ? current : best
  );
}

/**
 * Normalize date string to ISO format (YYYY-MM-DD)
 * Migration 58: Helper for date field normalization
 *
 * Handles mixed formats: "November 14, 1965", "11/14/1965", etc.
 * Required for PostgreSQL DATE casting in reconcile_pending_to_final RPC.
 *
 * @param dateString - Date string in any parseable format
 * @returns ISO date string (YYYY-MM-DD) or null if unparseable
 */
function normalizeDateToISO(dateString: string | null): string | null {
  if (!dateString) return null;

  try {
    const parsed = new Date(dateString);
    if (isNaN(parsed.getTime())) return null;

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  } catch (error) {
    console.warn('[Identity] Failed to parse date:', dateString, error);
    return null;
  }
}

/**
 * Main reconciliation entry point
 *
 * Called by session-manager.ts after all chunks complete.
 * Groups pendings by cascade_id, merges position data, creates final encounters.
 *
 * @param sessionId - UUID of progressive session
 * @param shellFileId - UUID of shell file
 * @param patientId - UUID of patient (from session)
 * @param totalPages - Total pages in document (for batching analysis)
 * @returns Array of final encounter UUIDs created
 */
export async function reconcilePendingEncounters(
  sessionId: string,
  shellFileId: string,
  patientId: string,
  totalPages: number
): Promise<string[]> {
  console.log(`[Reconcile] Starting reconciliation for session ${sessionId}`);

  // STEP 1: Session guard validation
  await validateSessionReadyForReconciliation(sessionId);

  // STEP 2: Fetch all pending encounters
  const pendings = await getPendingsByStatus(sessionId, 'pending');

  if (pendings.length === 0) {
    console.log(`[Reconcile] No pending encounters to reconcile`);
    return [];
  }

  console.log(`[Reconcile] Found ${pendings.length} pending encounters`);

  // STEP 3: Group by cascade_id
  const cascadeGroups = groupPendingsByCascade(pendings);
  console.log(`[Reconcile] Grouped into ${cascadeGroups.size} cascades`);

  const finalEncounterIds: string[] = [];

  // STEP 4: Process each cascade group
  for (const [cascadeId, groupPendings] of cascadeGroups) {
    try {
      console.log(`[Reconcile] Processing cascade ${cascadeId || 'null'} (${groupPendings.length} pendings)`);

      // Validate cascade group
      const validation = validateCascadeGroup(groupPendings);
      if (!validation.valid) {
        console.error(`[Reconcile] Cascade ${cascadeId} validation failed:`, validation.errors);
        await markCascadeAsAbandoned(groupPendings, validation.errors.join('; '));
        continue;
      }

      // Merge position data (17 fields)
      const mergedPosition = mergePositionData(groupPendings);

      // Merge page ranges
      const mergedPageRanges = mergePageRanges(
        groupPendings.flatMap(p => p.page_ranges || [])
      );

      // Get clinical data from first pending (should be consistent across cascade)
      const firstPending = groupPendings.sort((a, b) => a.chunk_number - b.chunk_number)[0];

      // Calculate quality tier
      const qualityData = calculateQualityTier(firstPending);

      // Build encounter data JSONB for RPC
      // Rabbit #3 fix: Access JSONB fields correctly
      const encounterData = {
        encounter_type: firstPending.encounter_data?.encounter_type || 'unknown',
        encounter_start_date: firstPending.encounter_start_date,  // Top-level column
        encounter_end_date: firstPending.encounter_end_date,      // Top-level column
        encounter_timeframe_status: firstPending.encounter_data?.encounter_timeframe_status || 'completed',
        date_source: firstPending.encounter_data?.date_source || 'ai_extracted',
        provider_name: firstPending.provider_name,                // Top-level column
        facility_name: firstPending.facility_name,                // Top-level column

        // Position data (17 fields from mergePositionData)
        start_page: mergedPosition.start_page,
        start_boundary_type: mergedPosition.start_boundary_type,
        start_text_marker: mergedPosition.start_text_marker,
        start_marker_context: mergedPosition.start_marker_context,
        start_region_hint: mergedPosition.start_region_hint,
        start_text_y_top: mergedPosition.start_text_y_top,
        start_text_height: mergedPosition.start_text_height,
        start_y: mergedPosition.start_y,

        end_page: mergedPosition.end_page,
        end_boundary_type: mergedPosition.end_boundary_type,
        end_text_marker: mergedPosition.end_text_marker,
        end_marker_context: mergedPosition.end_marker_context,
        end_region_hint: mergedPosition.end_region_hint,
        end_text_y_top: mergedPosition.end_text_y_top,
        end_text_height: mergedPosition.end_text_height,
        end_y: mergedPosition.end_y,

        position_confidence: mergedPosition.position_confidence,

        // Page ranges and metadata
        page_ranges: mergedPageRanges,
        pass_0_5_confidence: firstPending.confidence,             // Top-level column
        summary: firstPending.encounter_data?.summary || null,     // Rabbit #3: From JSONB
        is_real_world_visit: firstPending.is_real_world_visit,   // Top-level column

        // Quality tier (from calculation)
        data_quality_tier: qualityData.tier,
        quality_criteria_met: qualityData.criteria,

        // Encounter source metadata (5 fields)
        encounter_source: 'shell_file',
        created_by_user_id: firstPending.created_by_user_id,
        manual_created_by: null,
        api_source_name: null,
        api_import_date: null,

        // Migration 58: Identity fields (merged from all pendings in cascade)
        patient_full_name: pickBestValue(groupPendings.map(p => p.patient_full_name)),
        patient_date_of_birth: normalizeDateToISO(
          pickBestValue(groupPendings.map(p => p.patient_date_of_birth))
        ),
        patient_address: pickBestValue(groupPendings.map(p => p.patient_address)),
        chief_complaint: firstPending.encounter_data?.chief_complaint || null
      };

      console.log('[Reconcile] Identity merged:', {
        patient_full_name: encounterData.patient_full_name,
        patient_date_of_birth: encounterData.patient_date_of_birth,
        patient_address: encounterData.patient_address,
        chief_complaint: encounterData.chief_complaint
      });

      // Call atomic RPC to create final encounter
      const pendingIds = groupPendings.map(p => p.id);
      const finalEncounterId = await reconcilePendingsToFinal(
        pendingIds,
        patientId,
        shellFileId,
        encounterData
      );

      console.log(`[Reconcile] Created final encounter ${finalEncounterId} from ${pendingIds.length} pendings`);

      // Complete cascade chain tracking (if cascading encounter)
      if (cascadeId) {
        const lastChunk = Math.max(...groupPendings.map(p => p.chunk_number));
        await completeCascadeChain(cascadeId, lastChunk, finalEncounterId, pendingIds.length);
        console.log(`[Reconcile] Completed cascade chain ${cascadeId}`);
      }

      finalEncounterIds.push(finalEncounterId);

    } catch (error) {
      console.error(`[Reconcile] Error processing cascade ${cascadeId}:`, error);
      await markCascadeAsAbandoned(
        groupPendings,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // STEP 5: Aggregate batching analysis to shell_files
  await aggregateBatchingAnalysis(sessionId, shellFileId, totalPages);

  // STEP 6: Update metrics after reconciliation (Migration 60: Decoupled from ai_processing_sessions)
  try {
    // Migration 60: RPC is now self-contained - only needs shell_file_id
    // The function will self-heal (create metrics record if missing) and query pass05_progressive_sessions
    const { error: metricsError } = await supabase.rpc('update_strategy_a_metrics', {
      p_shell_file_id: shellFileId
      // Migration 60: p_session_id parameter removed (kept as optional DEFAULT NULL for backward compat)
    });

    if (metricsError) {
      console.error(`[Reconcile] Failed to update metrics:`, metricsError);
      // Don't throw - metrics update failure shouldn't block reconciliation success
    } else {
      console.log(`[Reconcile] Updated Strategy A metrics successfully`);
    }
  } catch (error) {
    console.error(`[Reconcile] Exception updating metrics:`, error);
    // Don't throw - metrics update failure shouldn't block reconciliation success
  }

  console.log(`[Reconcile] Reconciliation complete: ${finalEncounterIds.length} final encounters created`);

  return finalEncounterIds;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Session guard validation
 *
 * Ensures session is ready for reconciliation:
 * - All chunks have completed
 * - Session processing_status is appropriate
 *
 * @throws Error if session not ready
 */
async function validateSessionReadyForReconciliation(sessionId: string): Promise<void> {
  // Fetch session metadata
  const { data: session, error: sessionError } = await supabase
    .from('pass05_progressive_sessions')
    .select('processing_status, total_chunks')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error(`Session ${sessionId} not found: ${sessionError?.message || 'unknown'}`);
  }

  // Check all chunks completed
  const { count: completedCount, error: countError } = await supabase
    .from('pass05_chunk_results')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('processing_status', 'completed');

  if (countError) {
    throw new Error(`Failed to count completed chunks: ${countError.message}`);
  }

  if (completedCount !== session.total_chunks) {
    throw new Error(
      `Premature reconciliation attempted: ${completedCount}/${session.total_chunks} chunks completed`
    );
  }

  console.log(`[Reconcile] Session guard passed: ${completedCount}/${session.total_chunks} chunks completed`);
}

/**
 * Validate cascade group before reconciliation
 *
 * Checks:
 * - All pendings have same cascade_id
 * - All pendings have same encounter_type
 * - Chunk numbers are sequential (no gaps)
 * - Page ranges don't overlap incorrectly
 *
 * @param pendings - Pendings in cascade group
 * @returns Validation result with errors
 */
function validateCascadeGroup(
  pendings: any[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (pendings.length === 0) {
    return { valid: false, errors: ['Empty cascade group'] };
  }

  // Check 1: All have same cascade_id
  const cascadeIds = new Set(pendings.map(p => p.cascade_id));
  if (cascadeIds.size > 1) {
    errors.push(`Multiple cascade IDs: ${Array.from(cascadeIds).join(', ')}`);
  }

  // Check 2: All have same encounter_type
  // Rabbit #3: Access from encounter_data JSONB
  const encounterTypes = new Set(
    pendings.map(p => p.encounter_data?.encounter_type || 'unknown')
  );
  if (encounterTypes.size > 1) {
    errors.push(`Multiple encounter types: ${Array.from(encounterTypes).join(', ')}`);
  }

  // Check 3: Sequential chunk numbers (if cascading)
  if (pendings.length > 1) {
    const sorted = pendings.slice().sort((a, b) => a.chunk_number - b.chunk_number);
    const chunkNumbers = sorted.map(p => p.chunk_number);

    for (let i = 1; i < chunkNumbers.length; i++) {
      if (chunkNumbers[i] !== chunkNumbers[i - 1] + 1) {
        errors.push(`Chunk gap: ${chunkNumbers[i - 1]} -> ${chunkNumbers[i]}`);
      }
    }

    // Check 4: Page ranges don't overlap incorrectly
    for (let i = 1; i < sorted.length; i++) {
      const prevEndPage = sorted[i - 1].end_page;
      const currStartPage = sorted[i].start_page;

      if (currStartPage < prevEndPage) {
        errors.push(
          `Page overlap: Chunk ${sorted[i - 1].chunk_number} ends at ${prevEndPage}, ` +
          `Chunk ${sorted[i].chunk_number} starts at ${currStartPage}`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// GROUPING HELPERS
// ============================================================================

/**
 * Group pending encounters by cascade_id
 *
 * Non-cascading encounters have cascade_id = null, each gets own group.
 *
 * @param pendings - All pending encounters for session
 * @returns Map of cascade_id -> pending array
 */
function groupPendingsByCascade(pendings: any[]): Map<string | null, any[]> {
  const groups = new Map<string | null, any[]>();

  for (const pending of pendings) {
    const cascadeId = pending.cascade_id || null;

    // Non-cascading encounters (cascade_id = null) each get own group
    // Use pending_id as unique key for non-cascading
    const key = cascadeId || pending.pending_id;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(pending);
  }

  return groups;
}

// ============================================================================
// POSITION MERGING HELPERS
// ============================================================================

/**
 * Merge position data from cascade group
 *
 * Logic:
 * - Start position: Take from FIRST chunk (earliest encounter start)
 * - End position: Take from LAST chunk (latest encounter end)
 * - Position confidence: Weighted average by page count
 *
 * Reference: 08-RECONCILIATION-STRATEGY-V2.md lines 62-139
 *
 * @param pendings - Sorted pending encounters in cascade
 * @returns Merged position data (17 fields)
 */
function mergePositionData(pendings: any[]): any {
  // Sort by chunk number
  const sorted = pendings.slice().sort((a, b) => a.chunk_number - b.chunk_number);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Calculate weighted average confidence
  let totalConfidenceWeighted = 0;
  let totalPages = 0;

  for (const pending of sorted) {
    const pageCount = (pending.end_page - pending.start_page + 1) || 1;
    totalConfidenceWeighted += (pending.position_confidence || 0.5) * pageCount;
    totalPages += pageCount;
  }

  const avgConfidence = totalPages > 0 ? totalConfidenceWeighted / totalPages : 0.5;

  return {
    // Start position (from FIRST chunk)
    start_page: first.start_page,
    start_boundary_type: first.start_boundary_type,
    start_text_marker: first.start_text_marker,
    start_marker_context: first.start_marker_context,
    start_region_hint: first.start_region_hint,
    start_text_y_top: first.start_text_y_top,
    start_text_height: first.start_text_height,
    start_y: first.start_y,

    // End position (from LAST chunk)
    end_page: last.end_page,
    end_boundary_type: last.end_boundary_type,
    end_text_marker: last.end_text_marker,
    end_marker_context: last.end_marker_context,
    end_region_hint: last.end_region_hint,
    end_text_y_top: last.end_text_y_top,
    end_text_height: last.end_text_height,
    end_y: last.end_y,

    // Weighted average confidence
    position_confidence: avgConfidence
  };
}

/**
 * Merge overlapping or adjacent page ranges
 *
 * Preserved from original pending-reconciler.ts (lines 130-153).
 * This logic is correct for Strategy A.
 *
 * @param ranges - Array of [start, end] page ranges
 * @returns Merged page ranges
 */
function mergePageRanges(ranges: number[][]): number[][] {
  if (ranges.length === 0) return [];

  // Sort by start page
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);

  const merged: number[][] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    // Check if ranges overlap or are adjacent
    if (current[0] <= last[1] + 1) {
      // Merge: extend the last range to cover current
      last[1] = Math.max(last[1], current[1]);
    } else {
      // No overlap: add as new range
      merged.push(current);
    }
  }

  return merged;
}

// ============================================================================
// QUALITY TIER HELPERS
// ============================================================================

/**
 * Calculate quality tier for encounter
 *
 * Criteria:
 * - Criteria A: Patient identity (full name + DOB from document)
 * - Criteria B: Provider/facility (provider OR facility + encounter date)
 * - Criteria C: Healthcare professional verification (manual or API)
 *
 * Tier Logic:
 * - IF Criteria C met → VERIFIED
 * - ELSE IF Criteria A AND Criteria B → HIGH
 * - ELSE IF Criteria A (but NOT Criteria B) → MEDIUM
 * - ELSE → LOW
 *
 * Reference: 11-DATA-QUALITY-SYSTEM.md lines 30-53
 *
 * @param pending - First pending in cascade (clinical data source)
 * @returns Quality tier and criteria met JSONB
 */
function calculateQualityTier(pending: any): {
  tier: 'low' | 'medium' | 'high' | 'verified';
  criteria: any;
} {
  // Criteria A: Patient identity confirmed
  const criteriaA = !!(
    pending.patient_full_name &&
    pending.patient_date_of_birth
  );

  // Criteria B: Provider/facility details confirmed
  const criteriaB = !!(
    (pending.provider_name || pending.facility_name) &&
    pending.encounter_start_date
  );

  // Criteria C: Healthcare professional verification
  // For uploaded shell_files, this is always false (no manual verification yet)
  // Future: Check manual_created_by or api_source_name
  const criteriaC = false;

  // Calculate tier
  let tier: 'low' | 'medium' | 'high' | 'verified';

  if (criteriaC) {
    tier = 'verified';
  } else if (criteriaA && criteriaB) {
    tier = 'high';
  } else if (criteriaA) {
    tier = 'medium';
  } else {
    tier = 'low';
  }

  return {
    tier,
    criteria: {
      criteria_a: criteriaA,
      criteria_b: criteriaB,
      criteria_c: criteriaC
    }
  };
}

// ============================================================================
// BATCHING ANALYSIS HELPERS
// ============================================================================

/**
 * Aggregate batching analysis from all chunks
 *
 * Combines page_separation_analysis from all chunks into shell_files.page_separation_analysis.
 * Sorts safe split points, calculates summary statistics.
 *
 * Reference: 08-RECONCILIATION-STRATEGY-V2.md lines 182-284
 *
 * @param sessionId - UUID of progressive session
 * @param shellFileId - UUID of shell file
 * @param totalPages - Total pages in document
 */
async function aggregateBatchingAnalysis(
  sessionId: string,
  shellFileId: string,
  totalPages: number
): Promise<void> {
  console.log(`[Reconcile] Aggregating batching analysis for session ${sessionId}`);

  // Fetch all chunk results
  const chunkResults = await getChunkResultsForSession(sessionId);

  if (chunkResults.length === 0) {
    console.warn(`[Reconcile] No chunk results found for batching analysis`);
    return;
  }

  // Combine all safe split points
  const allSplitPoints: any[] = [];

  for (const chunk of chunkResults) {
    const analysis = chunk.page_separation_analysis;
    if (analysis?.safe_split_points) {
      allSplitPoints.push(...analysis.safe_split_points);
    }
  }

  // Check if we have any split points before processing
  if (allSplitPoints.length === 0) {
    console.log(`[Reconcile] No split points to aggregate`);
    return;
  }

  // Sort by page number with null-safe access (Rabbit #6 fix)
  allSplitPoints.sort((a, b) => {
    const pageA = a.split_type === 'inter_page'
      ? (a.between_pages?.[0] ?? a.page ?? 0)
      : (a.page ?? 0);
    const pageB = b.split_type === 'inter_page'
      ? (b.between_pages?.[0] ?? b.page ?? 0)
      : (b.page ?? 0);
    return pageA - pageB;
  });

  // Calculate summary statistics
  const interPageCount = allSplitPoints.filter(s => s.split_type === 'inter_page').length;
  const intraPageCount = allSplitPoints.filter(s => s.split_type === 'intra_page').length;
  const avgConfidence = allSplitPoints.length > 0
    ? allSplitPoints.reduce((sum, s) => sum + (s.confidence || 0), 0) / allSplitPoints.length
    : 0;

  // Build final analysis
  const finalAnalysis = {
    version: '2.0',
    total_pages: totalPages,
    analysis_date: new Date().toISOString(),
    safe_split_points: allSplitPoints,
    summary: {
      total_splits: allSplitPoints.length,
      inter_page_splits: interPageCount,
      intra_page_splits: intraPageCount,
      avg_confidence: avgConfidence,
      pages_per_split: totalPages / (allSplitPoints.length || 1)
    }
  };

  // Store in shell_files
  await updateAggregatedBatchingAnalysis(shellFileId, finalAnalysis);

  console.log(
    `[Reconcile] Batching analysis aggregated: ${allSplitPoints.length} split points ` +
    `(${interPageCount} inter, ${intraPageCount} intra)`
  );
}

// ============================================================================
// ERROR HANDLING HELPERS
// ============================================================================

/**
 * Mark entire cascade as abandoned
 *
 * Called when cascade validation fails or reconciliation errors occur.
 * Marks all pendings as 'abandoned' with review reason.
 *
 * @param pendings - Pendings in failed cascade
 * @param reason - Error reason
 */
async function markCascadeAsAbandoned(
  pendings: any[],
  reason: string
): Promise<void> {
  console.error(`[Reconcile] Marking ${pendings.length} pendings as abandoned: ${reason}`);

  for (const pending of pendings) {
    const { error } = await supabase
      .from('pass05_pending_encounters')
      .update({
        status: 'abandoned',
        requires_review: true,
        review_reason: `Reconciliation failed: ${reason}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', pending.id);

    if (error) {
      console.error(`[Reconcile] Failed to mark pending ${pending.id} as abandoned:`, error);
    }
  }
}
