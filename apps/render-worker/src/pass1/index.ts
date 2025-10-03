/**
 * Pass 1 Entity Detection - Public API
 * Created: 2025-10-03
 * Purpose: Clean exports for Pass 1 module
 */

// Main class
export { Pass1EntityDetector } from './Pass1EntityDetector';

// Types
export type {
  // Input/Output types
  Pass1Input,
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
  PASS1_SYSTEM_MESSAGE,
} from './pass1-prompts';

// Database builder
export {
  buildPass1DatabaseRecords,
  type Pass1DatabaseRecords,
} from './pass1-database-builder';
