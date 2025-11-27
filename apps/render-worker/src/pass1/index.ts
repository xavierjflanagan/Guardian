/**
 * Pass 1 Entity Detection - Public API
 * Created: 2025-10-03
 * Updated: 2025-11-28 - Added OCR-only mode exports (Strategy-A)
 * Purpose: Clean exports for Pass 1 module
 */

// Main class
export { Pass1EntityDetector } from './Pass1EntityDetector';

// Types
export type {
  // Job payload types
  AIProcessingJobPayload,
  // Input/Output types
  Pass1Input,
  Pass1InputOCROnly,  // NEW: OCR-only input type (Strategy-A)
  Pass1ProcessingResult,
  Pass1AIResponse,
  Pass1Config,

  // Entity types
  EntityDetectionResult,
  EntityAuditRecord,

  // Additional database record types (7 tables)
  AIProcessingSessionRecord,
  ProfileClassificationAuditRecord,
  Pass1EntityMetricsRecord,
  ShellFileUpdateFields,
  AIConfidenceScoringRecord,
  ManualReviewQueueRecord,

  // Classification types
  EntityCategory,
  EntitySubtype,
  ClinicalEventSubtype,
  HealthcareContextSubtype,
  DocumentStructureSubtype,
  ProcessingPriority,
  SpatialMappingSource,

  // Helper types
  SpatialElement,
  ProcessingSessionMetadata,
} from './pass1-types';

// Schema mapping functions
export {
  assignEntitySchemas,
  determineProcessingPriority,
  assessEnrichmentComplexity,
  requiresPass2Enrichment,
  getUniqueSchemas,
  validateSchemaMapping,
  ENTITY_SCHEMA_MAPPING,
} from './pass1-schema-mapping';

// Translation functions
export {
  translateAIOutputToDatabase,
  batchEntityRecords,
  validateEntityRecord,
  validateRecordBatch,
  generateRecordStatistics,
  formatRecordSummary,
} from './pass1-translation';

// Prompt functions (if needed externally)
export {
  generatePass1ClassificationPrompt,
  generatePass1ClassificationPromptOCROnly,  // NEW: OCR-only prompt (Strategy-A)
  PASS1_SYSTEM_MESSAGE,
  PASS1_SYSTEM_MESSAGE_OCR_ONLY,  // NEW: OCR-only system message (Strategy-A)
} from './pass1-prompts';

// Database builder
export {
  buildPass1DatabaseRecords,
  buildPass1DatabaseRecordsOCROnly,  // NEW: OCR-only builder (Strategy-A)
  type Pass1DatabaseRecords,
} from './pass1-database-builder';
