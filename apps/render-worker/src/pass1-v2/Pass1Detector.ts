/**
 * Pass 1 Strategy-A Detector
 *
 * Created: 2025-11-29
 * Purpose: Main orchestrator for OCR-based entity detection
 * Reference: PASS1-STRATEGY-A-MASTER.md Section 4
 *
 * Architecture:
 * - processShellFile(): Entry point, processes encounters in parallel
 * - processEncounter(): Retry-until-complete pattern for batches
 * - processBatch(): Single OpenAI API call with parsing
 *
 * Key Design Decisions:
 * - Two-level parallelism: encounters parallel, batches parallel within encounter
 * - Retry-until-complete: failed batches retry while successful wait in memory
 * - Transient error preservation: track retry history even on eventual success
 * - Y-markers added dynamically at prompt time (not stored in DB)
 */

import pLimit from 'p-limit';
import { SupabaseClient } from '@supabase/supabase-js';

import {
  getSelectedModelForPass,
  AIProviderFactory,
  BaseAIProvider,
  ModelDefinition
} from '../shared/ai';

import {
  Pass1Config,
  Pass1ShellFileInput,
  Pass1Result,
  EncounterData,
  EncounterProcessingResult,
  BatchDefinition,
  BatchState,
  BatchProcessingResult,
  Pass1AIResponse,
  AttemptRecord,
  DEFAULT_PASS1_CONFIG
} from './pass1-v2-types';

import {
  classifyError,
  isRetryable,
  calculateBackoffDelay,
  buildErrorContext,
  getErrorMessage,
  ErrorCode
} from './pass1-v2-error-handler';

import {
  buildBatchPrompt,
  estimatePromptTokens
} from './pass1-v2-prompt';

import {
  parsePass1Response,
  mergeBatchResults
} from './pass1-v2-output-parser';

import {
  splitEncounterIntoBatches,
  getBatchStatistics
} from './pass1-v2-batching';

import {
  createEncounterResult,
  updateEncounterResult,
  createBatchResult,
  markBatchProcessing,
  markBatchSucceeded,
  markBatchFailed,
  insertBridgeSchemaZones,
  buildEntityRecordsWithZones,
  insertEntityDetections,
  updateSessionPass1Status,
  updatePass1Metrics,
  loadEncountersForShellFile,
  updateShellFileStatus
} from './pass1-v2-database';

// =============================================================================
// PASS 1 DETECTOR CLASS
// =============================================================================

/**
 * Pass 1 Strategy-A Entity Detector
 *
 * Processes medical documents to detect clinical entities using OCR text.
 * Implements hierarchical observability with encounter and batch level tracking.
 */
export class Pass1Detector {
  private provider: BaseAIProvider;
  private model: ModelDefinition;
  private supabase: SupabaseClient;
  private config: Pass1Config;
  private limit: ReturnType<typeof pLimit>;

  constructor(
    supabase: SupabaseClient,
    config?: Partial<Pass1Config>
  ) {
    this.supabase = supabase;
    this.config = {
      ...DEFAULT_PASS1_CONFIG,
      ...config
    } as Pass1Config;

    // Get model from environment variable toggles (shared AI provider system)
    this.model = getSelectedModelForPass('PASS_1');
    this.provider = AIProviderFactory.createProvider(this.model);

    this.limit = pLimit(this.config.concurrency_limit);
  }

  // ===========================================================================
  // MAIN ENTRY POINT
  // ===========================================================================

  /**
   * Process all encounters in a shell file
   *
   * @param input - Shell file input with IDs
   * @returns Processing result
   */
  async processShellFile(input: Pass1ShellFileInput): Promise<Pass1Result> {
    const startTime = Date.now();
    const { shell_file_id, patient_id, processing_session_id } = input;

    console.log(`[Pass1] Starting shell file ${shell_file_id} (zones: ${this.config.include_zones_in_prompt ? 'enabled' : 'DISABLED'})`);

    // Update session status to processing
    await updateSessionPass1Status(this.supabase, processing_session_id, 'processing');

    // Load all encounters for this shell file
    const encounters = await loadEncountersForShellFile(
      this.supabase,
      shell_file_id,
      patient_id
    );

    if (encounters.length === 0) {
      console.log(`[Pass1] No encounters found for shell file ${shell_file_id}`);
      await updateSessionPass1Status(this.supabase, processing_session_id, 'skipped');
      return {
        success: true,
        shellFileId: shell_file_id,
        sessionId: processing_session_id,
        encountersProcessed: 0,
        encountersSucceeded: 0,
        encountersFailed: 0,
        totalEntities: 0,
        totalZones: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalDurationMs: Date.now() - startTime
      };
    }

    console.log(`[Pass1] Found ${encounters.length} encounters to process (concurrency: ${this.config.concurrency_limit})`);

    // Process encounters in parallel
    // CRITICAL: Use separate limiter for encounters to avoid deadlock with batch-level this.limit
    const encounterLimit = pLimit(this.config.concurrency_limit);

    const encounterPromises = encounters.map(encounter =>
      encounterLimit(() => this.processEncounter(encounter, processing_session_id))
    );

    const results = await Promise.all(encounterPromises);

    // Aggregate results from parallel processing
    let totalEntities = 0;
    let totalZones = 0;
    let totalInputTokens = 0;  // Note: remains 0 (pre-existing behavior - tokens tracked per batch in DB)
    let totalOutputTokens = 0; // Note: remains 0 (pre-existing behavior)

    for (const result of results) {
      if (result.success) {
        totalEntities += result.entitiesDetected;
        totalZones += result.zonesDetected;
      }
    }

    // Calculate aggregates
    const totalDurationMs = Date.now() - startTime;
    const encountersSucceeded = results.filter(r => r.success).length;
    const encountersFailed = results.filter(r => !r.success).length;
    const totalRetries = results.reduce((sum, r) => sum + r.totalRetries, 0);

    // Determine overall success (all encounters must succeed)
    const success = encountersFailed === 0;
    const failedResult = results.find(r => !r.success);

    // Update session and metrics
    const finalStatus = success ? 'completed' : 'failed';
    await updateSessionPass1Status(this.supabase, processing_session_id, finalStatus);

    await updatePass1Metrics(
      this.supabase,
      { shell_file_id, patient_id, processing_session_id },
      {
        ai_model_used: this.model.modelId,
        encounters_total: encounters.length,
        encounters_succeeded: encountersSucceeded,
        encounters_failed: encountersFailed,
        batches_total: results.reduce((sum, r) => sum + r.batchCount, 0),
        batches_succeeded: results.filter(r => r.success).reduce((sum, r) => sum + r.batchCount, 0),
        total_retries_used: totalRetries,
        failure_encounter_id: failedResult?.encounterId,
        error_code: failedResult?.errorCode,
        error_summary: failedResult?.error,
        entities_detected: totalEntities,
        processing_time_ms: totalDurationMs,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        total_tokens: totalInputTokens + totalOutputTokens
      }
    );

    // Update shell file status
    await updateShellFileStatus(
      this.supabase,
      shell_file_id,
      success ? 'pass1_complete' : 'failed'
    );

    console.log(`[Pass1] Completed shell file ${shell_file_id}: ${encountersSucceeded}/${encounters.length} succeeded`);

    return {
      success,
      shellFileId: shell_file_id,
      sessionId: processing_session_id,
      encountersProcessed: encounters.length,
      encountersSucceeded,
      encountersFailed,
      totalEntities,
      totalZones,
      totalInputTokens,
      totalOutputTokens,
      totalDurationMs,
      failedEncounterId: failedResult?.encounterId,
      errorCode: failedResult?.errorCode,
      errorSummary: failedResult?.error
    };
  }

  // ===========================================================================
  // ENCOUNTER PROCESSING
  // ===========================================================================

  /**
   * Process a single encounter with retry-until-complete pattern
   *
   * @param encounter - Encounter data
   * @param sessionId - Processing session ID
   * @returns Encounter processing result
   */
  async processEncounter(
    encounter: EncounterData,
    sessionId: string
  ): Promise<EncounterProcessingResult> {
    const startTime = Date.now();
    console.log(`[Pass1] Processing encounter ${encounter.id} (${encounter.page_count} pages)`);

    // Split into batches
    const batches = splitEncounterIntoBatches(encounter);
    const stats = getBatchStatistics(batches);
    console.log(`[Pass1] Split into ${stats.batchCount} batches (avg ${stats.avgPagesPerBatch.toFixed(1)} pages/batch)`);

    // Create encounter result record
    const encounterResultId = await createEncounterResult(this.supabase, {
      shell_file_id: encounter.shell_file_id,
      healthcare_encounter_id: encounter.id,
      processing_session_id: sessionId,
      patient_id: encounter.patient_id,
      page_count: encounter.page_count,
      batching_used: batches.length > 1,
      batches_total: batches.length,
      status: 'processing',
      batches_succeeded: 0,
      batches_failed: 0,
      total_retries_used: 0,
      started_at: new Date().toISOString(),
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_entities_detected: 0,
      total_zones_detected: 0
    });

    // Initialize batch states
    const batchStates: BatchState[] = await Promise.all(
      batches.map(async (batch, index) => {
        const batchResultId = await createBatchResult(this.supabase, {
          healthcare_encounter_id: encounter.id,
          pass1_encounter_result_id: encounterResultId,
          processing_session_id: sessionId,
          batch_index: index,
          page_range_start: batch.pageRangeStart,
          page_range_end: batch.pageRangeEnd,
          status: 'pending',
          attempt_count: 0,
          max_attempts: this.config.max_retries,
          had_transient_failure: false
        });

        return {
          index,
          batch,
          status: 'pending' as const,
          attempt: 0,
          result: null,
          errors: [],
          batchResultId
        };
      })
    );

    // Retry-until-complete loop
    let allComplete = false;
    let totalRetries = 0;

    while (!allComplete) {
      // Find pending batches
      const pendingBatches = batchStates.filter(
        bs => bs.status === 'pending' || bs.status === 'processing'
      );

      if (pendingBatches.length === 0) {
        allComplete = true;
        break;
      }

      // Process pending batches in parallel (with concurrency limit)
      const batchPromises = pendingBatches.map(batchState =>
        this.limit(() => this.processBatchWithRetry(batchState, batches.length))
      );

      await Promise.all(batchPromises);

      // Check for permanent failures
      const failedBatches = batchStates.filter(bs => bs.status === 'failed');
      if (failedBatches.length > 0) {
        // At least one batch permanently failed
        const firstFailure = failedBatches[0];
        const lastError = firstFailure.errors[firstFailure.errors.length - 1];

        await updateEncounterResult(this.supabase, encounterResultId, {
          status: 'failed',
          completed_at: new Date().toISOString(),
          total_duration_ms: Date.now() - startTime,
          batches_succeeded: batchStates.filter(bs => bs.status === 'succeeded').length,
          batches_failed: failedBatches.length,
          total_retries_used: totalRetries,
          failure_batch_index: firstFailure.index,
          error_code: lastError?.error_code || 'INTERNAL_ERROR',
          error_summary: lastError?.error_message || 'Unknown error'
        });

        return {
          success: false,
          encounterId: encounter.id,
          encounterResultId,
          entitiesDetected: 0,
          zonesDetected: 0,
          batchCount: batches.length,
          totalRetries,
          durationMs: Date.now() - startTime,
          error: lastError?.error_message || 'Batch processing failed',
          errorCode: lastError?.error_code || 'INTERNAL_ERROR'
        };
      }

      // Count retries this round
      totalRetries += pendingBatches.filter(bs => bs.attempt > 1).length;

      // Check if all succeeded
      allComplete = batchStates.every(bs => bs.status === 'succeeded');
    }

    // All batches succeeded - merge results
    const successfulResults = batchStates
      .filter(bs => bs.result !== null)
      .map(bs => bs.result!.parsed);

    const mergedResponse = mergeBatchResults(successfulResults);

    // Save entities and zones
    await this.saveEncounterResults(
      encounter,
      sessionId,
      encounterResultId,
      mergedResponse,
      batchStates
    );

    // Calculate totals
    const totalInputTokens = batchStates.reduce(
      (sum, bs) => sum + (bs.result?.inputTokens || 0), 0
    );
    const totalOutputTokens = batchStates.reduce(
      (sum, bs) => sum + (bs.result?.outputTokens || 0), 0
    );

    // Update encounter result
    await updateEncounterResult(this.supabase, encounterResultId, {
      status: 'succeeded',
      completed_at: new Date().toISOString(),
      total_duration_ms: Date.now() - startTime,
      batches_succeeded: batches.length,
      batches_failed: 0,
      total_retries_used: totalRetries,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_entities_detected: mergedResponse.entities.length,
      total_zones_detected: mergedResponse.bridge_schema_zones.length
    });

    console.log(`[Pass1] Encounter ${encounter.id} complete: ${mergedResponse.entities.length} entities, ${mergedResponse.bridge_schema_zones.length} zones`);

    return {
      success: true,
      encounterId: encounter.id,
      encounterResultId,
      entitiesDetected: mergedResponse.entities.length,
      zonesDetected: mergedResponse.bridge_schema_zones.length,
      batchCount: batches.length,
      totalRetries,
      durationMs: Date.now() - startTime
    };
  }

  // ===========================================================================
  // BATCH PROCESSING
  // ===========================================================================

  /**
   * Process a single batch with retry logic
   * Updates batchState in place
   *
   * @param batchState - Batch state to process
   * @param totalBatches - Total number of batches
   */
  private async processBatchWithRetry(
    batchState: BatchState,
    totalBatches: number
  ): Promise<void> {
    const { batch, batchResultId } = batchState;

    while (batchState.attempt < this.config.max_retries) {
      batchState.attempt++;
      batchState.status = 'processing';

      await markBatchProcessing(this.supabase, batchResultId!, batchState.attempt);

      try {
        const result = await this.processBatch(batch, totalBatches);

        // Success
        batchState.status = 'succeeded';
        batchState.result = {
          ...result,
          batchResultId: batchResultId!
        };

        await markBatchSucceeded(this.supabase, batchResultId!, {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          durationMs: result.durationMs,
          entitiesDetected: result.parsed.entities.length,
          zonesDetected: result.parsed.bridge_schema_zones.length,
          hadTransientFailure: batchState.errors.length > 0,
          transientErrorHistory: batchState.errors.length > 0 ? batchState.errors : undefined
        });

        return;
      } catch (error) {
        const errorCode = classifyError(error);
        const errorMessage = (error as Error).message || 'Unknown error';

        // Record this attempt
        const attemptRecord: AttemptRecord = {
          attempt: batchState.attempt,
          error_code: errorCode,
          error_message: errorMessage,
          timestamp: new Date().toISOString()
        };

        if (isRetryable(errorCode) && batchState.attempt < this.config.max_retries) {
          // Transient error - will retry
          const delay = calculateBackoffDelay(batchState.attempt);
          attemptRecord.retry_delay_ms = delay;
          batchState.errors.push(attemptRecord);

          console.log(`[Pass1] Batch ${batch.index} attempt ${batchState.attempt} failed (${errorCode}), retrying in ${delay}ms`);
          await this.sleep(delay);
        } else {
          // Permanent failure or max retries exceeded
          batchState.errors.push(attemptRecord);
          batchState.status = 'failed';

          const finalErrorCode = batchState.attempt >= this.config.max_retries
            ? 'MAX_RETRIES_EXCEEDED'
            : errorCode;

          await markBatchFailed(this.supabase, batchResultId!, {
            errorCode: finalErrorCode,
            errorMessage: getErrorMessage(finalErrorCode as ErrorCode, errorMessage),
            errorContext: buildErrorContext(error, finalErrorCode as ErrorCode, batchState.errors)
          });

          console.log(`[Pass1] Batch ${batch.index} permanently failed: ${finalErrorCode}`);
          return;
        }
      }
    }
  }

  /**
   * Process a single batch (one OpenAI API call)
   *
   * @param batch - Batch definition
   * @param totalBatches - Total batch count
   * @returns Batch processing result
   */
  private async processBatch(
    batch: BatchDefinition,
    totalBatches: number
  ): Promise<Omit<BatchProcessingResult, 'batchResultId'>> {
    const startTime = Date.now();

    // Build prompt
    const { system, user } = buildBatchPrompt(
      batch.ocrTextSlice,
      batch.pageRangeStart,
      batch.pageRangeEnd,
      batch.index,
      totalBatches,
      this.config.include_zones_in_prompt
    );

    // Estimate tokens for logging
    const estimatedTokens = estimatePromptTokens(batch.ocrTextSlice);
    console.log(`[Pass1] Batch ${batch.index}: ~${estimatedTokens} input tokens (${this.model.displayName})`);

    // Call AI provider (handles both OpenAI and Google)
    // Note: Don't pass maxOutputTokens - let provider use model's full capacity (128K for GPT-5)
    const response = await this.provider.generateJSON(user, {
      systemMessage: system
    });

    if (!response.content) {
      throw new Error('Empty response from AI');
    }

    // Parse response
    const parsed = parsePass1Response(response.content);

    const durationMs = Date.now() - startTime;
    const inputTokens = response.inputTokens;
    const outputTokens = response.outputTokens;

    console.log(`[Pass1] Batch ${batch.index}: ${parsed.entities.length} entities, ${parsed.bridge_schema_zones.length} zones in ${durationMs}ms (cost: $${response.cost.toFixed(4)})`);

    return {
      success: true,
      parsed,
      inputTokens,
      outputTokens,
      durationMs
    };
  }

  // ===========================================================================
  // RESULT SAVING
  // ===========================================================================

  /**
   * Save merged encounter results to database
   *
   * @param encounter - Encounter data
   * @param sessionId - Processing session ID
   * @param _encounterResultId - Encounter result record ID (reserved for future linking)
   * @param response - Merged AI response
   * @param _batchStates - Batch states for reference (reserved for future use)
   */
  private async saveEncounterResults(
    encounter: EncounterData,
    sessionId: string,
    _encounterResultId: string,
    response: Pass1AIResponse,
    _batchStates: BatchState[]
  ): Promise<void> {
    // Insert bridge schema zones first (to get IDs for linking)
    const zoneRecords = response.bridge_schema_zones.map(zone => ({
      healthcare_encounter_id: encounter.id,
      processing_session_id: sessionId,
      schema_type: zone.schema_type,
      page_number: zone.page_number,
      y_start: zone.y_start,
      y_end: zone.y_end
    }));

    const insertedZones = await insertBridgeSchemaZones(this.supabase, zoneRecords);

    // Build entity records with zone linking
    const entityRecords = buildEntityRecordsWithZones(
      response.entities,
      insertedZones,
      {
        healthcare_encounter_id: encounter.id,
        shell_file_id: encounter.shell_file_id,
        patient_id: encounter.patient_id,
        processing_session_id: sessionId
      }
    );

    // Insert entities
    await insertEntityDetections(this.supabase, entityRecords);

    console.log(`[Pass1] Saved ${entityRecords.length} entities, ${insertedZones.length} zones for encounter ${encounter.id}`);
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a Pass1Detector instance
 *
 * Model is selected via environment variables (PASS_1_USE_GPT5, etc.)
 * See shared/ai/models/model-registry.ts for available models.
 *
 * @param supabase - Supabase client
 * @param config - Optional configuration overrides
 * @returns Pass1Detector instance
 */
export function createPass1Detector(
  supabase: SupabaseClient,
  config?: Partial<Pass1Config>
): Pass1Detector {
  return new Pass1Detector(supabase, config);
}
