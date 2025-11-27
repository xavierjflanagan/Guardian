/**
 * Pass 1 Entity Detection - Public API
 * Created: 2025-10-03
 * Updated: 2025-11-28 - Added OCR-only mode exports (Strategy-A)
 * Purpose: Clean exports for Pass 1 module
 */
export { Pass1EntityDetector } from './Pass1EntityDetector';
export type { AIProcessingJobPayload, Pass1Input, Pass1InputOCROnly, // NEW: OCR-only input type (Strategy-A)
Pass1ProcessingResult, Pass1AIResponse, Pass1Config, EntityDetectionResult, EntityAuditRecord, AIProcessingSessionRecord, ProfileClassificationAuditRecord, Pass1EntityMetricsRecord, ShellFileUpdateFields, AIConfidenceScoringRecord, ManualReviewQueueRecord, EntityCategory, EntitySubtype, ClinicalEventSubtype, HealthcareContextSubtype, DocumentStructureSubtype, ProcessingPriority, SpatialMappingSource, SpatialElement, ProcessingSessionMetadata, } from './pass1-types';
export { assignEntitySchemas, determineProcessingPriority, assessEnrichmentComplexity, requiresPass2Enrichment, getUniqueSchemas, validateSchemaMapping, ENTITY_SCHEMA_MAPPING, } from './pass1-schema-mapping';
export { translateAIOutputToDatabase, batchEntityRecords, validateEntityRecord, validateRecordBatch, generateRecordStatistics, formatRecordSummary, } from './pass1-translation';
export { generatePass1ClassificationPrompt, generatePass1ClassificationPromptOCROnly, // NEW: OCR-only prompt (Strategy-A)
PASS1_SYSTEM_MESSAGE, PASS1_SYSTEM_MESSAGE_OCR_ONLY, } from './pass1-prompts';
export { buildPass1DatabaseRecords, buildPass1DatabaseRecordsOCROnly, // NEW: OCR-only builder (Strategy-A)
type Pass1DatabaseRecords, } from './pass1-database-builder';
//# sourceMappingURL=index.d.ts.map