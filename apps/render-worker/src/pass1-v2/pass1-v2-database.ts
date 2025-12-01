/**
 * Pass 1 Strategy-A Database Operations
 *
 * Created: 2025-11-29
 * Purpose: Database operations for observability tables
 * Reference: 05-hierarchical-observability-system.md Section 8
 *
 * Tables written to:
 * - pass1_encounter_results: Per-encounter processing tracking
 * - pass1_batch_results: Per-batch processing with retry tracking
 * - pass1_bridge_schema_zones: Y-coordinate ranges per schema type
 * - pass1_entity_detections: Minimal entity storage
 * - pass1_entity_metrics: Session-level metrics
 * - ai_processing_sessions: Pass status updates
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  EncounterResultRecord,
  BatchResultRecord,
  EntityDetectionRecord,
  BridgeSchemaZoneRecord,
  Pass1MetricsUpdate,
  Pass1SessionStatus,
  Pass1Entity,
  AttemptRecord,
  EncounterData
} from './pass1-v2-types';
import { schemaTypeMatchesEntityType } from './pass1-v2-prompt';
import { loadEnhancedOCR_Y } from '../utils/ocr-persistence';

// =============================================================================
// ENCOUNTER RESULT OPERATIONS
// =============================================================================

/**
 * Create encounter result record at start of processing
 *
 * @param supabase - Supabase client
 * @param data - Encounter result data
 * @returns Created record ID
 */
export async function createEncounterResult(
  supabase: SupabaseClient,
  data: Partial<EncounterResultRecord>
): Promise<string> {
  const { data: result, error } = await supabase
    .from('pass1_encounter_results')
    .insert({
      shell_file_id: data.shell_file_id,
      healthcare_encounter_id: data.healthcare_encounter_id,
      processing_session_id: data.processing_session_id,
      patient_id: data.patient_id,
      page_count: data.page_count,
      batching_used: data.batching_used ?? false,
      batches_total: data.batches_total ?? 1,
      status: 'pending',
      batches_succeeded: 0,
      batches_failed: 0,
      total_retries_used: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_entities_detected: 0,
      total_zones_detected: 0,
      started_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create encounter result: ${error.message}`);
  }

  return result.id;
}

/**
 * Update encounter result status
 *
 * @param supabase - Supabase client
 * @param id - Encounter result ID
 * @param updates - Fields to update
 */
export async function updateEncounterResult(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<EncounterResultRecord>
): Promise<void> {
  const { error } = await supabase
    .from('pass1_encounter_results')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update encounter result: ${error.message}`);
  }
}

/**
 * Aggregate batch results to encounter result
 *
 * @param supabase - Supabase client
 * @param encounterResultId - Encounter result ID
 */
export async function aggregateBatchesToEncounter(
  supabase: SupabaseClient,
  encounterResultId: string
): Promise<void> {
  // Fetch all batch results for this encounter
  const { data: batches, error: fetchError } = await supabase
    .from('pass1_batch_results')
    .select('status, attempt_count, entities_detected, zones_detected, input_tokens, output_tokens, duration_ms, error_code, batch_index')
    .eq('pass1_encounter_result_id', encounterResultId);

  if (fetchError) {
    throw new Error(`Failed to fetch batch results: ${fetchError.message}`);
  }

  if (!batches || batches.length === 0) {
    return;
  }

  // Calculate aggregates
  const succeeded = batches.filter(b => b.status === 'succeeded').length;
  const failed = batches.filter(b => b.status === 'failed').length;
  const totalRetries = batches.reduce((sum, b) => sum + (b.attempt_count || 0), 0) - batches.length; // Subtract initial attempts
  const totalEntities = batches.reduce((sum, b) => sum + (b.entities_detected || 0), 0);
  const totalZones = batches.reduce((sum, b) => sum + (b.zones_detected || 0), 0);
  const totalInputTokens = batches.reduce((sum, b) => sum + (b.input_tokens || 0), 0);
  const totalOutputTokens = batches.reduce((sum, b) => sum + (b.output_tokens || 0), 0);
  const totalDuration = batches.reduce((sum, b) => sum + (b.duration_ms || 0), 0);

  // Find first failed batch if any
  const failedBatch = batches.find(b => b.status === 'failed');
  const allSucceeded = failed === 0;

  // Update encounter result
  const { error: updateError } = await supabase
    .from('pass1_encounter_results')
    .update({
      status: allSucceeded ? 'succeeded' : 'failed',
      batches_succeeded: succeeded,
      batches_failed: failed,
      total_retries_used: Math.max(0, totalRetries),
      total_entities_detected: totalEntities,
      total_zones_detected: totalZones,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_duration_ms: totalDuration,
      failure_batch_index: failedBatch?.batch_index,
      error_code: failedBatch?.error_code,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', encounterResultId);

  if (updateError) {
    throw new Error(`Failed to aggregate batch results: ${updateError.message}`);
  }
}

// =============================================================================
// BATCH RESULT OPERATIONS
// =============================================================================

/**
 * Create batch result record at start of batch processing
 *
 * @param supabase - Supabase client
 * @param data - Batch result data
 * @returns Created record ID
 */
export async function createBatchResult(
  supabase: SupabaseClient,
  data: Partial<BatchResultRecord>
): Promise<string> {
  const { data: result, error } = await supabase
    .from('pass1_batch_results')
    .insert({
      healthcare_encounter_id: data.healthcare_encounter_id,
      pass1_encounter_result_id: data.pass1_encounter_result_id,
      processing_session_id: data.processing_session_id,
      batch_index: data.batch_index,
      page_range_start: data.page_range_start,
      page_range_end: data.page_range_end,
      status: 'pending',
      attempt_count: 0,
      max_attempts: data.max_attempts ?? 3,
      had_transient_failure: false
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create batch result: ${error.message}`);
  }

  return result.id;
}

/**
 * Update batch result (on processing start, success, or failure)
 *
 * @param supabase - Supabase client
 * @param id - Batch result ID
 * @param updates - Fields to update
 */
export async function updateBatchResult(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<BatchResultRecord>
): Promise<void> {
  const { error } = await supabase
    .from('pass1_batch_results')
    .update(updates)
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update batch result: ${error.message}`);
  }
}

/**
 * Mark batch as processing (increment attempt count)
 *
 * @param supabase - Supabase client
 * @param id - Batch result ID
 * @param attempt - Current attempt number
 */
export async function markBatchProcessing(
  supabase: SupabaseClient,
  id: string,
  attempt: number
): Promise<void> {
  await updateBatchResult(supabase, id, {
    status: 'processing',
    attempt_count: attempt,
    started_at: new Date().toISOString()
  });
}

/**
 * Mark batch as succeeded
 *
 * @param supabase - Supabase client
 * @param id - Batch result ID
 * @param data - Success data (tokens, entities, etc.)
 */
export async function markBatchSucceeded(
  supabase: SupabaseClient,
  id: string,
  data: {
    inputTokens: number;
    outputTokens: number;
    entitiesDetected: number;
    zonesDetected: number;
    durationMs: number;
    aiModel?: string;
    hadTransientFailure: boolean;
    transientErrorHistory?: AttemptRecord[];
  }
): Promise<void> {
  const updateData: Partial<BatchResultRecord> = {
    status: 'succeeded',
    completed_at: new Date().toISOString(),
    duration_ms: data.durationMs,
    input_tokens: data.inputTokens,
    output_tokens: data.outputTokens,
    entities_detected: data.entitiesDetected,
    zones_detected: data.zonesDetected,
    had_transient_failure: data.hadTransientFailure,
    transient_error_history: data.transientErrorHistory
  };

  if (data.aiModel) {
    updateData.ai_model_used = data.aiModel;
  }

  await updateBatchResult(supabase, id, updateData);
}

/**
 * Mark batch as failed
 *
 * @param supabase - Supabase client
 * @param id - Batch result ID
 * @param errorCode - Standardized error code
 * @param errorMessage - Human-readable error message
 * @param errorContext - Additional error context
 */
export async function markBatchFailed(
  supabase: SupabaseClient,
  id: string,
  data: {
    errorCode: string;
    errorMessage: string;
    errorContext?: Record<string, any>;
  }
): Promise<void> {
  await updateBatchResult(supabase, id, {
    status: 'failed',
    completed_at: new Date().toISOString(),
    error_code: data.errorCode,
    error_message: data.errorMessage,
    error_context: data.errorContext
  });
}

// =============================================================================
// ENTITY DETECTION OPERATIONS
// =============================================================================

/**
 * Insert entity detections
 *
 * @param supabase - Supabase client
 * @param records - Entity detection records
 */
export async function insertEntityDetections(
  supabase: SupabaseClient,
  records: EntityDetectionRecord[]
): Promise<void> {
  if (records.length === 0) {
    return;
  }

  const { error } = await supabase
    .from('pass1_entity_detections')
    .insert(records);

  if (error) {
    throw new Error(`Failed to insert entity detections: ${error.message}`);
  }
}

// =============================================================================
// BRIDGE SCHEMA ZONE OPERATIONS
// =============================================================================

/**
 * Inserted zone with ID
 */
export interface InsertedZone extends BridgeSchemaZoneRecord {
  id: string;
}

/**
 * Insert bridge schema zones and return inserted records with IDs
 *
 * @param supabase - Supabase client
 * @param zones - Zone records to insert
 * @returns Inserted zones with generated IDs
 */
export async function insertBridgeSchemaZones(
  supabase: SupabaseClient,
  zones: Omit<BridgeSchemaZoneRecord, 'id'>[]
): Promise<InsertedZone[]> {
  if (zones.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('pass1_bridge_schema_zones')
    .insert(zones)
    .select('id, healthcare_encounter_id, processing_session_id, schema_type, page_number, y_start, y_end');

  if (error) {
    throw new Error(`Failed to insert bridge schema zones: ${error.message}`);
  }

  return data as InsertedZone[];
}

// =============================================================================
// ZONE-ENTITY LINKING
// =============================================================================

/**
 * Find matching zone for an entity based on page and Y-coordinate overlap
 * From PASS1-STRATEGY-A-MASTER.md Section 4.6
 *
 * @param entity - Entity to find zone for
 * @param zones - Available zones
 * @returns Zone ID or undefined
 */
export function findMatchingZone(
  entity: Pass1Entity,
  zones: InsertedZone[]
): string | undefined {
  if (entity.y_coordinate === null) {
    return undefined;
  }

  // Find zones that match page and contain entity's Y-coordinate
  const candidates = zones.filter(z =>
    z.page_number === entity.page_number &&
    entity.y_coordinate !== null &&
    entity.y_coordinate >= z.y_start &&
    entity.y_coordinate <= z.y_end
  );

  if (candidates.length === 0) {
    return undefined;
  }

  if (candidates.length === 1) {
    return candidates[0].id;
  }

  // Multiple overlapping zones - prefer zone whose schema_type matches entity_type
  const typeMatch = candidates.find(z =>
    schemaTypeMatchesEntityType(z.schema_type, entity.entity_type)
  );

  return typeMatch?.id ?? candidates[0].id;
}

/**
 * Build entity detection records with zone linking
 *
 * @param entities - Parsed entities
 * @param insertedZones - Zones with IDs
 * @param context - Processing context
 * @returns Entity detection records ready for insertion
 */
export function buildEntityRecordsWithZones(
  entities: Pass1Entity[],
  insertedZones: InsertedZone[],
  context: {
    healthcare_encounter_id: string;
    shell_file_id: string;
    patient_id: string;
    processing_session_id: string;
  }
): EntityDetectionRecord[] {
  return entities.map((entity, index) => ({
    healthcare_encounter_id: context.healthcare_encounter_id,
    shell_file_id: context.shell_file_id,
    patient_id: context.patient_id,
    processing_session_id: context.processing_session_id,
    entity_sequence: index + 1,
    original_text: entity.original_text,
    entity_type: entity.entity_type,
    aliases: entity.aliases,
    y_coordinate: entity.y_coordinate,
    page_number: entity.page_number,
    bridge_schema_zone_id: findMatchingZone(entity, insertedZones)
  }));
}

// =============================================================================
// SESSION-LEVEL OPERATIONS
// =============================================================================

/**
 * Update ai_processing_sessions.pass1_status
 *
 * @param supabase - Supabase client
 * @param sessionId - Processing session ID
 * @param status - New pass1 status
 */
export async function updateSessionPass1Status(
  supabase: SupabaseClient,
  sessionId: string,
  status: Pass1SessionStatus
): Promise<void> {
  const { error } = await supabase
    .from('ai_processing_sessions')
    .update({
      pass1_status: status,
      workflow_step: status === 'processing' ? 'entity_detection' : undefined,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId);

  if (error) {
    throw new Error(`Failed to update session pass1_status: ${error.message}`);
  }
}

// =============================================================================
// PASS 1 CONTEXT TYPE
// =============================================================================

/**
 * Context required for all Pass 1 database operations
 * These are always available from the entry point (processShellFile)
 * and must be passed explicitly - no optional fallbacks.
 */
export interface Pass1Context {
  shell_file_id: string;
  patient_id: string;
  processing_session_id: string;
}

export async function updatePass1Metrics(
  supabase: SupabaseClient,
  context: Pass1Context,
  metrics: Pass1MetricsUpdate
): Promise<void> {
  const { error } = await supabase
    .from('pass1_entity_metrics')
    .insert({
      profile_id: context.patient_id,
      shell_file_id: context.shell_file_id,
      processing_session_id: context.processing_session_id,
      entities_detected: metrics.entities_detected,
      processing_time_ms: metrics.processing_time_ms,
      ai_model_used: metrics.ai_model_used,
      input_tokens: metrics.input_tokens,
      output_tokens: metrics.output_tokens,
      total_tokens: metrics.total_tokens,
      encounters_total: metrics.encounters_total,
      encounters_succeeded: metrics.encounters_succeeded,
      encounters_failed: metrics.encounters_failed,
      batches_total: metrics.batches_total,
      batches_succeeded: metrics.batches_succeeded,
      total_retries_used: metrics.total_retries_used,
      failure_encounter_id: metrics.failure_encounter_id,
      error_code: metrics.error_code,
      error_summary: metrics.error_summary
    });

  if (error) {
    throw new Error(`Failed to insert pass1_entity_metrics: ${error.message}`);
  }
}

// =============================================================================
// ENCOUNTER LOADING
// =============================================================================

/**
 * Buffer zone for intra-page boundaries (Y-units)
 * Prevents cutting off entities at exact boundary due to OCR variance
 * Configurable - default 150 covers ~3-4 lines of text
 */
export const INTRA_PAGE_BOUNDARY_BUFFER = 150;

/**
 * Slice OCR text to encounter boundaries with Y-coordinate support
 *
 * Handles intra-page boundaries by filtering lines based on Y-coordinates.
 * OCR text format: "[Y:###] text content" per line, with "--- PAGE N START/END ---" markers.
 *
 * @param fullOcrText - Complete OCR text for all pages
 * @param startPage - Encounter start page (1-indexed)
 * @param endPage - Encounter end page (1-indexed)
 * @param startBoundaryType - 'page_start' or 'intra_page'
 * @param endBoundaryType - 'page_end' or 'intra_page'
 * @param startY - Y-coordinate for intra-page start (with buffer applied)
 * @param endY - Y-coordinate for intra-page end (with buffer applied)
 * @returns Sliced OCR text for the encounter
 */
export function sliceOcrTextToEncounter(
  fullOcrText: string,
  startPage: number,
  endPage: number,
  startBoundaryType: string,
  endBoundaryType: string,
  startY: number | null,
  endY: number | null
): string {
  const lines = fullOcrText.split('\n');
  const resultLines: string[] = [];

  let currentPage = 0;
  let inEncounterPages = false;

  // Apply buffer to Y boundaries
  const effectiveStartY = startY !== null ? startY - INTRA_PAGE_BOUNDARY_BUFFER : null;
  const effectiveEndY = endY !== null ? endY + INTRA_PAGE_BOUNDARY_BUFFER : null;

  for (const line of lines) {
    // Check for page markers
    const pageStartMatch = line.match(/---\s*PAGE\s*(\d+)\s*START\s*---/i);
    const pageEndMatch = line.match(/---\s*PAGE\s*(\d+)\s*END\s*---/i);

    if (pageStartMatch) {
      currentPage = parseInt(pageStartMatch[1], 10);
      inEncounterPages = currentPage >= startPage && currentPage <= endPage;

      // Include page marker if we're in encounter range
      if (inEncounterPages) {
        resultLines.push(line);
      }
      continue;
    }

    if (pageEndMatch) {
      const markerPage = parseInt(pageEndMatch[1], 10);
      // Include page end marker if we're in encounter range
      if (markerPage >= startPage && markerPage <= endPage) {
        resultLines.push(line);
      }
      continue;
    }

    // Skip lines outside encounter page range
    if (!inEncounterPages) {
      continue;
    }

    // Extract Y-coordinate from line: [Y:###] text
    const yMatch = line.match(/^\[Y:(\d+)\]/);

    if (!yMatch) {
      // Line without Y-coordinate (empty line, header, etc.) - include if in page range
      resultLines.push(line);
      continue;
    }

    const lineY = parseInt(yMatch[1], 10);

    // Apply Y-coordinate filtering for boundary pages

    // Start page with intra-page boundary: exclude lines BEFORE startY
    if (currentPage === startPage && startBoundaryType === 'intra_page' && effectiveStartY !== null) {
      if (lineY < effectiveStartY) {
        continue; // Skip lines before the start boundary
      }
    }

    // End page with intra-page boundary: exclude lines AFTER endY
    if (currentPage === endPage && endBoundaryType === 'intra_page' && effectiveEndY !== null) {
      if (lineY > effectiveEndY) {
        continue; // Skip lines after the end boundary
      }
    }

    // Line passes all filters - include it
    resultLines.push(line);
  }

  return resultLines.join('\n');
}

/**
 * Load encounters for a shell file
 *
 * @param supabase - Supabase client
 * @param shellFileId - Shell file ID
 * @param patientId - Patient ID for storage path
 * @returns Array of encounter data with properly sliced OCR text
 */
export async function loadEncountersForShellFile(
  supabase: SupabaseClient,
  shellFileId: string,
  patientId: string
): Promise<EncounterData[]> {
  // Load encounters with boundary fields
  const { data: encounters, error: encError } = await supabase
    .from('healthcare_encounters')
    .select('id, patient_id, start_page, end_page, start_boundary_type, end_boundary_type, start_y, end_y, safe_split_points')
    .eq('source_shell_file_id', shellFileId)
    .order('start_page', { ascending: true });

  if (encError) {
    throw new Error(`Failed to load encounters: ${encError.message}`);
  }

  if (!encounters || encounters.length === 0) {
    return [];
  }

  // Load enhanced OCR text from Supabase Storage (Y-only format)
  // This is pre-formatted with [Y:###] markers by ocr-formatter.ts
  const fullOcrText = await loadEnhancedOCR_Y(supabase, patientId, shellFileId);

  if (!fullOcrText) {
    throw new Error(`No enhanced OCR text found for shell file ${shellFileId}`);
  }

  // Map to EncounterData with properly sliced OCR text per encounter
  return encounters.map(enc => {
    // Determine boundary types (default to page boundaries if not set)
    const startBoundaryType = enc.start_boundary_type || 'page_start';
    const endBoundaryType = enc.end_boundary_type || 'page_end';

    // Slice OCR text to this encounter's boundaries
    const slicedOcrText = sliceOcrTextToEncounter(
      fullOcrText,
      enc.start_page,
      enc.end_page,
      startBoundaryType,
      endBoundaryType,
      enc.start_y,
      enc.end_y
    );

    return {
      id: enc.id,
      shell_file_id: shellFileId,
      patient_id: enc.patient_id || patientId,
      start_page: enc.start_page,
      end_page: enc.end_page,
      page_count: enc.end_page - enc.start_page + 1,
      start_boundary_type: startBoundaryType as EncounterData['start_boundary_type'],
      end_boundary_type: endBoundaryType as EncounterData['end_boundary_type'],
      start_y: enc.start_y,
      end_y: enc.end_y,
      safe_split_points: enc.safe_split_points || [],
      enhanced_ocr_text: slicedOcrText
    };
  });
}

// NOTE: Enhanced OCR text is loaded from Supabase Storage via loadEnhancedOCR_Y()
// from ocr-persistence.ts, not from a database column. The storage location is:
// medical-docs/{patient_id}/{shell_file_id}-ocr/enhanced-ocr-y.txt

/**
 * Update shell_files status to pass1_complete
 *
 * @param supabase - Supabase client
 * @param shellFileId - Shell file ID
 */
export async function updateShellFileStatus(
  supabase: SupabaseClient,
  shellFileId: string,
  status: string = 'pass1_complete'
): Promise<void> {
  const { error } = await supabase
    .from('shell_files')
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', shellFileId);

  if (error) {
    throw new Error(`Failed to update shell_file status: ${error.message}`);
  }
}
