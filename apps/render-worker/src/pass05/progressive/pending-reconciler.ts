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

  // Write to healthcare_encounters table
  const { data: inserted, error } = await supabase
    .from('healthcare_encounters')
    .insert({
      patient_id: pending.sessionId, // Will be replaced with actual patient_id via session lookup
      encounter_type: partial.encounterType,
      encounter_start_date: partial.dateRange?.start,
      encounter_end_date: partial.dateRange?.end,
      encounter_timeframe_status: partial.encounterTimeframeStatus || 'unknown_end_date',
      date_source: partial.dateSource || 'ai_extracted',
      provider_name: partial.provider,
      facility: partial.facility,
      page_ranges: partial.pageRanges || [],
      confidence: pending.confidence || 0.5,
      summary: partial.summary,
      source: 'pass05_progressive'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert reconciled encounter: ${error.message}`);
  }

  // Mark pending encounter as completed
  await markPendingEncounterCompleted(pending.id, inserted.id);

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
