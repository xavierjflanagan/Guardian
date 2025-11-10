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

  // Write to healthcare_encounters table with correct patient_id and shell_file_id
  const { data: inserted, error } = await supabase
    .from('healthcare_encounters')
    .insert({
      patient_id: session.patient_id,  // FIXED: Use actual patient_id from session
      primary_shell_file_id: session.shell_file_id,  // FIXED: Required for finalize aggregation
      encounter_type: partial.encounterType,
      encounter_start_date: partial.dateRange?.start,
      encounter_date_end: partial.dateRange?.end,  // FIXED: Schema uses encounter_date_end not encounter_end_date
      encounter_timeframe_status: partial.encounterTimeframeStatus || 'unknown_end_date',
      date_source: partial.dateSource || 'ai_extracted',
      provider_name: partial.provider,  // FIXED: Schema uses provider_name not provider
      facility_name: partial.facility,  // FIXED: Schema uses facility_name not facility
      page_ranges: partial.pageRanges || [],
      pass_0_5_confidence: pending.confidence || 0.5,  // FIXED: Schema uses pass_0_5_confidence not confidence
      summary: partial.summary,
      identified_in_pass: 'pass_0_5',  // Standardized label (matches manifestBuilder)
      source_method: 'ai_pass_0_5'  // FIXED: Must match CHECK constraint (ai_pass_0_5, ai_pass_2, manual_entry, import)
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
