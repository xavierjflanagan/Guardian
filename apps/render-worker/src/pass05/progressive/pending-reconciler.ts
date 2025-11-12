/**
 * Pending Encounter Reconciler
 * Completes encounters that spanned multiple chunks
 */

import { PendingEncounterRecord } from './types';
import { EncounterMetadata } from '../types';
import { markPendingEncounterCompleted } from './database';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Reconcile pending encounters at end of progressive session
 */
export async function reconcilePendingEncounters(
  _sessionId: string,
  pendingRecords: PendingEncounterRecord[],
  _completedEncounters: EncounterMetadata[]
): Promise<EncounterMetadata[]> {
  const reconciledEncounters: EncounterMetadata[] = [];

  console.log(`[Reconcile] Processing ${pendingRecords.length} pending encounters`);

  for (const pending of pendingRecords) {
    try {
      // Try to complete this pending encounter
      const encounter = await completePendingEncounter(pending, _completedEncounters);

      if (encounter) {
        reconciledEncounters.push(encounter);
        console.log(`[Reconcile] Completed pending encounter ${pending.tempEncounterId}`);
      } else {
        console.warn(`[Reconcile] Could not complete pending encounter ${pending.tempEncounterId}, marking for review`);
        await markPendingForReview(pending.id, 'Unable to complete encounter from partial data');
      }
    } catch (error) {
      console.error(`[Reconcile] Error reconciling ${pending.tempEncounterId}:`, error);
      await markPendingForReview(
        pending.id,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return reconciledEncounters;
}

/**
 * FIX 2A: Merge page ranges from all chunks for each final encounter
 * Called AFTER reconciliation completes to consolidate page ranges
 */
export async function mergePageRangesForAllEncounters(sessionId: string): Promise<void> {
  console.log(`[Fix 2A] Merging page ranges for session ${sessionId}`);

  // Get all completed pendings grouped by final encounter
  const { data: completedPendings, error: fetchError } = await supabase
    .from('pass05_pending_encounters')
    .select('completed_encounter_id, partial_data, page_ranges')
    .eq('session_id', sessionId)
    .eq('status', 'completed')
    .not('completed_encounter_id', 'is', null);

  if (fetchError) {
    console.error(`[Fix 2A] Failed to fetch completed pendings: ${fetchError.message}`);
    return;
  }

  if (!completedPendings || completedPendings.length === 0) {
    console.log(`[Fix 2A] No completed pendings to merge`);
    return;
  }

  // Group by final encounter ID
  const encounterGroups = new Map<string, any[]>();
  for (const pending of completedPendings) {
    const finalId = pending.completed_encounter_id;
    if (!encounterGroups.has(finalId)) {
      encounterGroups.set(finalId, []);
    }
    encounterGroups.get(finalId)!.push(pending);
  }

  console.log(`[Fix 2A] Found ${encounterGroups.size} unique final encounters to update`);

  // Merge page ranges for EACH final encounter
  for (const [finalEncounterId, pendings] of encounterGroups) {
    const allPageRanges: number[][] = [];

    for (const p of pendings) {
      // Check both locations for page ranges
      const ranges = p.partial_data?.pageRanges || p.page_ranges || [];
      if (Array.isArray(ranges) && ranges.length > 0) {
        allPageRanges.push(...ranges);
      }
    }

    if (allPageRanges.length === 0) {
      console.warn(`[Fix 2A] No page ranges found for encounter ${finalEncounterId}`);
      continue;
    }

    // Merge overlapping/adjacent ranges
    const mergedRanges = mergePageRanges(allPageRanges);

    console.log(`[Fix 2A] Encounter ${finalEncounterId}: ${allPageRanges.length} ranges -> ${mergedRanges.length} merged ranges`);

    // Update the final encounter with merged ranges
    const { error: updateError } = await supabase
      .from('healthcare_encounters')
      .update({ page_ranges: mergedRanges })
      .eq('id', finalEncounterId);

    if (updateError) {
      console.error(`[Fix 2A] Failed to update encounter ${finalEncounterId}: ${updateError.message}`);
    }
  }

  console.log(`[Fix 2A] Page range merging complete`);
}

/**
 * Helper: Merge overlapping or adjacent page ranges
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

/**
 * Try to complete a pending encounter
 */
async function completePendingEncounter(
  pending: PendingEncounterRecord,
  _completedEncounters: EncounterMetadata[]
): Promise<EncounterMetadata | null> {
  const partial = pending.partialData;

  // Validate we have minimum required fields
  if (!isEncounterComplete(partial)) {
    console.warn(`[Reconcile] Pending encounter ${pending.tempEncounterId} missing required fields`);
    return null;
  }

  // CRITICAL FIX: Lookup patient_id and shell_file_id from session
  const { data: session, error: sessionError } = await supabase
    .from('pass05_progressive_sessions')
    .select('patient_id, shell_file_id')
    .eq('id', pending.sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error(`Failed to lookup session ${pending.sessionId}: ${sessionError?.message || 'Not found'}`);
  }

  // Build complete encounter from partial data
  const encounter: any = {
    encounterId: '',
    encounterType: partial.encounterType,
    dateRange: partial.dateRange,
    encounterTimeframeStatus: partial.encounterTimeframeStatus || 'unknown_end_date',
    dateSource: partial.dateSource || 'ai_extracted',
    provider: partial.provider,
    facility: partial.facility,
    pageRanges: partial.pageRanges || [],
    confidence: pending.confidence || 0.5,
    summary: partial.summary,
    spatialBounds: [],
    isRealWorldVisit: true
  };

  // CRITICAL FIX: Check if encounter already exists before inserting
  // This prevents duplicates when chunks have already finalized encounters
  const { data: existing, error: existingError } = await supabase
    .from('healthcare_encounters')
    .select('id')
    .eq('patient_id', session.patient_id)
    .eq('primary_shell_file_id', session.shell_file_id)
    .eq('encounter_type', partial.encounterType)
    .eq('encounter_start_date', partial.dateRange?.start)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check for existing encounter: ${existingError.message}`);
  }

  // If encounter already exists, skip insertion and use existing ID
  if (existing) {
    console.log(`[Reconcile] Encounter already exists (ID: ${existing.id}), skipping insertion`);
    await markPendingEncounterCompleted(pending.id, existing.id);
    encounter.encounterId = existing.id;
    return encounter;
  }

  // Insert new encounter only if it doesn't exist
  const { data: inserted, error } = await supabase
    .from('healthcare_encounters')
    .insert({
      patient_id: session.patient_id,
      primary_shell_file_id: session.shell_file_id,
      encounter_type: partial.encounterType,
      encounter_start_date: partial.dateRange?.start,
      encounter_date_end: partial.dateRange?.end,
      encounter_timeframe_status: partial.encounterTimeframeStatus || 'unknown_end_date',
      date_source: partial.dateSource || 'ai_extracted',
      provider_name: partial.provider,
      facility_name: partial.facility,
      page_ranges: partial.pageRanges || [],
      pass_0_5_confidence: pending.confidence || 0.5,
      summary: partial.summary,
      identified_in_pass: 'pass_0_5',
      source_method: 'ai_pass_0_5'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert reconciled encounter: ${error.message}`);
  }

  // Mark pending encounter as completed
  await markPendingEncounterCompleted(pending.id, inserted.id);

  // Set the encounter ID in the return object
  encounter.encounterId = inserted.id;

  return encounter;
}

/**
 * Check if encounter has all required fields
 */
function isEncounterComplete(data: any): boolean {
  return !!(
    data.encounterType &&
    data.dateRange?.start &&
    data.provider &&
    data.pageRanges?.length > 0
  );
}

/**
 * Mark pending encounter as requiring manual review
 */
async function markPendingForReview(pendingId: string, _reason: string): Promise<void> {
  const { error } = await supabase
    .from('pass05_pending_encounters')
    .update({
      requires_review: true,
      status: 'abandoned',
      updated_at: new Date().toISOString()
    })
    .eq('id', pendingId);

  if (error) {
    console.error(`Failed to mark pending encounter for review:`, error);
  }
}

/**
 * FIX 2B: Update page assignments to map temp IDs to final encounter IDs
 * Called AFTER reconciliation completes
 */
export async function updatePageAssignmentsAfterReconciliation(
  sessionId: string,
  shellFileId: string
): Promise<void> {
  console.log(`[Fix 2B] Updating page assignments for session ${sessionId}`);

  // Get all completed pendings with their temp IDs and final encounter IDs
  const { data: completedPendings, error: fetchError } = await supabase
    .from('pass05_pending_encounters')
    .select('temp_encounter_id, completed_encounter_id')
    .eq('session_id', sessionId)
    .eq('status', 'completed')
    .not('completed_encounter_id', 'is', null);

  if (fetchError) {
    console.error(`[Fix 2B] Failed to fetch completed pendings: ${fetchError.message}`);
    return;
  }

  if (!completedPendings || completedPendings.length === 0) {
    console.log(`[Fix 2B] No completed pendings to update page assignments for`);
    return;
  }

  // Group by final encounter ID to handle multi-encounter sessions
  const encounterGroups = new Map<string, string[]>();
  for (const pending of completedPendings) {
    const finalId = pending.completed_encounter_id;
    const tempId = pending.temp_encounter_id;

    if (!encounterGroups.has(finalId)) {
      encounterGroups.set(finalId, []);
    }
    encounterGroups.get(finalId)!.push(tempId);
  }

  console.log(`[Fix 2B] Found ${encounterGroups.size} final encounters with temp IDs to update`);

  // Update page assignments for each final encounter group
  for (const [finalEncounterId, tempIds] of encounterGroups) {
    console.log(`[Fix 2B] Updating ${tempIds.length} temp IDs -> ${finalEncounterId}`);

    const { error: updateError } = await supabase
      .from('pass05_page_assignments')
      .update({ encounter_id: finalEncounterId })
      .eq('shell_file_id', shellFileId)
      .in('encounter_id', tempIds);

    if (updateError) {
      console.error(`[Fix 2B] Failed to update page assignments for encounter ${finalEncounterId}: ${updateError.message}`);
    } else {
      console.log(`[Fix 2B] Successfully updated page assignments for ${tempIds.join(', ')} -> ${finalEncounterId}`);
    }
  }

  // Handle chunk-level temp IDs (enc-001, enc-002, etc.)
  // Only safe when exactly one final encounter exists
  if (encounterGroups.size === 1) {
    const singleFinalId = Array.from(encounterGroups.keys())[0];

    console.log(`[Fix 2B] Updating chunk-level enc-* temp IDs -> ${singleFinalId}`);

    const { error: encUpdateError } = await supabase
      .from('pass05_page_assignments')
      .update({ encounter_id: singleFinalId })
      .eq('shell_file_id', shellFileId)
      .like('encounter_id', 'enc-%');

    if (encUpdateError) {
      console.error(`[Fix 2B] Failed to update enc-* temp IDs: ${encUpdateError.message}`);
    } else {
      console.log(`[Fix 2B] Successfully updated enc-* temp IDs -> ${singleFinalId}`);
    }
  } else {
    console.warn(`[Fix 2B] Multiple final encounters (${encounterGroups.size}) - cannot safely update enc-* temp IDs without mapping`);
  }

  console.log(`[Fix 2B] Page assignment updates complete`);
}

/**
 * FIX 2C: Recalculate session-level encounter metrics after reconciliation
 * Updates the actual encounter count (encounters_detected, real_world_encounters)
 * Called AFTER reconciliation completes
 */
export async function recalculateEncounterMetrics(
  sessionId: string,
  shellFileId: string
): Promise<void> {
  console.log(`[Fix 2C] Recalculating encounter metrics for session ${sessionId}`);

  // Get all completed pendings with their final encounter IDs
  const { data: completedPendings, error: fetchError } = await supabase
    .from('pass05_pending_encounters')
    .select('completed_encounter_id')
    .eq('session_id', sessionId)
    .eq('status', 'completed')
    .not('completed_encounter_id', 'is', null);

  if (fetchError) {
    console.error(`[Fix 2C] Failed to fetch completed pendings: ${fetchError.message}`);
    return;
  }

  // Count unique final encounter IDs
  const finalEncounterIds = completedPendings && completedPendings.length > 0
    ? [...new Set(completedPendings.map(p => p.completed_encounter_id))]
    : [];

  const actualEncounterCount = finalEncounterIds.length;

  console.log(`[Fix 2C] Session has ${actualEncounterCount} actual encounter(s) after reconciliation`);

  // Update session-level metrics in pass05_encounter_metrics
  // This corrects the "3 encounters" bug to show the actual count (e.g., 1)
  const { error: updateError } = await supabase
    .from('pass05_encounter_metrics')
    .update({
      encounters_detected: actualEncounterCount,
      real_world_encounters: actualEncounterCount,
      updated_at: new Date().toISOString()
    })
    .eq('shell_file_id', shellFileId);

  if (updateError) {
    console.error(`[Fix 2C] Failed to update encounter metrics: ${updateError.message}`);
  } else {
    console.log(`[Fix 2C] Updated metrics: encounters_detected = ${actualEncounterCount}, real_world_encounters = ${actualEncounterCount}`);
  }

  console.log(`[Fix 2C] Metrics recalculation complete`);
}
