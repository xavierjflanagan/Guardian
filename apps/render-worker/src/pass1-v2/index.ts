/**
 * Pass 1 Strategy-A Module Exports
 *
 * Created: 2025-11-29
 * Purpose: Public API for Pass 1 entity detection
 * Reference: PASS1-STRATEGY-A-MASTER.md
 *
 * Model Selection:
 * Set ONE of these env vars in Render.com to select the AI model:
 *   - PASS_1_USE_GPT5=true        (highest quality)
 *   - PASS_1_USE_GPT5_MINI=true   (good balance)
 *   - PASS_1_USE_GPT5_NANO=true   (cheapest)
 *   - PASS_1_USE_GEMINI_2_5_FLASH=true  (Google alternative)
 *
 * See shared/ai/models/model-registry.ts for full model list.
 *
 * Usage:
 * ```typescript
 * import { createPass1Detector, Pass1ShellFileInput } from './pass1-v2';
 *
 * const detector = createPass1Detector(supabase);
 *
 * const result = await detector.processShellFile({
 *   shell_file_id: 'xxx',
 *   patient_id: 'yyy',
 *   processing_session_id: 'zzz'
 * });
 * ```
 */

// =============================================================================
// MAIN EXPORTS
// =============================================================================

// Detector class and factory
export { Pass1Detector, createPass1Detector } from './Pass1Detector';

// =============================================================================
// TYPE EXPORTS
// =============================================================================

// Core types
export type {
  Pass1EntityType,
  SafeSplitType,
  SafeSplitPoint,
  BoundaryType,
  Pass1Entity,
  Pass1BridgeSchemaZone,
  Pass1AIResponse
} from './pass1-v2-types';

// Input types
export type {
  Pass1ShellFileInput,
  EncounterData,
  BatchDefinition
} from './pass1-v2-types';

// Result types
export type {
  Pass1Result,
  EncounterProcessingResult,
  BatchProcessingResult
} from './pass1-v2-types';

// Database record types
export type {
  EncounterResultRecord,
  BatchResultRecord,
  EntityDetectionRecord,
  BridgeSchemaZoneRecord,
  AttemptRecord
} from './pass1-v2-types';

// Configuration types
export type { Pass1Config, Pass1MetricsUpdate, Pass1SessionStatus } from './pass1-v2-types';

// Constants
export { VALID_ENTITY_TYPES, DEFAULT_PASS1_CONFIG } from './pass1-v2-types';

// =============================================================================
// ERROR HANDLING EXPORTS
// =============================================================================

export type { ErrorCode } from './pass1-v2-error-handler';
export {
  classifyError,
  isRetryable,
  isErrorRetryable,
  calculateBackoffDelay,
  getErrorMessage,
  buildErrorContext
} from './pass1-v2-error-handler';

// =============================================================================
// UTILITY EXPORTS (for testing/advanced use)
// =============================================================================

// Prompt utilities
export {
  buildPass1Prompt,
  buildBatchPrompt,
  estimateTokens,
  estimatePromptTokens,
  PASS1_SYSTEM_MESSAGE,
  ENTITY_TO_SCHEMA_TYPE
} from './pass1-v2-prompt';

// Parser utilities
export {
  parsePass1Response,
  mergeBatchResults,
  extractJsonFromResponse,
  hasEntities,
  hasZones,
  getResponseSummary,
  ParseError
} from './pass1-v2-output-parser';

// Batching utilities
export {
  splitEncounterIntoBatches,
  createSingleBatch,
  needsBatching,
  needsForcedSplitting,
  sliceOcrText,
  extractPageBoundaries,
  getBatchStatistics,
  MIN_PAGES_PER_BATCH,
  MAX_PAGES_PER_BATCH,
  HARD_CEILING_PAGES
} from './pass1-v2-batching';

// Database utilities (for testing/advanced use)
export type { Pass1Context } from './pass1-v2-database';
export {
  createEncounterResult,
  updateEncounterResult,
  createBatchResult,
  markBatchProcessing,
  markBatchSucceeded,
  markBatchFailed,
  insertEntityDetections,
  insertBridgeSchemaZones,
  findMatchingZone,
  buildEntityRecordsWithZones,
  updateSessionPass1Status,
  updatePass1Metrics,
  loadEncountersForShellFile,
  updateShellFileStatus,
  sliceOcrTextToEncounter,
  INTRA_PAGE_BOUNDARY_BUFFER
} from './pass1-v2-database';
