/**
 * Pass 1 Translation Layer - AI Output to Database Format
 * Created: 2025-10-03
 * Purpose: PURE CODE FUNCTION (no AI) that flattens nested AI JSON to flat database columns
 *
 * This is the "wasteful but necessary" translation layer that converts:
 * - Nested AI response JSON → Flat database table columns
 * - Adds metadata and session context
 * - Prepares records for batch insertion into entity_processing_audit
 */
import { Pass1AIResponse, EntityAuditRecord, ProcessingSessionMetadata } from './pass1-types';
/**
 * Truncate text field to maximum length with ellipsis
 *
 * Phase 5 Optimization 2: Server-side truncation enforcement for defense in depth.
 * The AI is instructed to keep these fields under 120 chars, but this provides
 * a safety net in case AI behavior changes or different models are used.
 *
 * @param text - Text to truncate (can be null)
 * @param maxLength - Maximum length (default 120)
 * @returns Truncated text with ellipsis if needed, or null if input is null
 */
export declare function truncateTextField(text: string | null, maxLength?: number): string | null;
/**
 * Normalize entity_category to match database constraint
 *
 * AI sometimes returns variations:
 * - "CLINICAL_EVENTS" (uppercase, plural) → "clinical_event"
 * - "clinical_events" (lowercase, plural) → "clinical_event"
 * - "DOCUMENT_STRUCTURE" → "document_structure"
 * - "HEALTHCARE_CONTEXT" → "healthcare_context"
 *
 * Database constraint expects: 'clinical_event', 'healthcare_context', 'document_structure'
 *
 * @param category - Raw category string from AI (may have wrong case or plural)
 * @returns Normalized category matching database constraint
 */
export declare function normalizeEntityCategory(category: string): 'clinical_event' | 'healthcare_context' | 'document_structure';
/**
 * Translates AI response to database-ready format
 *
 * This function:
 * 1. Flattens nested AI JSON structures
 * 2. Adds session metadata
 * 3. Assigns schemas for Pass 2
 * 4. Sets processing priority
 * 5. Initializes Pass 2 status
 *
 * @param aiResponse - The complete response from GPT5-mini
 * @param sessionMetadata - Processing session context
 * @returns Array of database-ready records for entity_processing_audit table
 */
export declare function translateAIOutputToDatabase(aiResponse: Pass1AIResponse, sessionMetadata: ProcessingSessionMetadata): EntityAuditRecord[];
/**
 * Split entity records into batches for database insertion
 *
 * @param records - All entity audit records
 * @param batchSize - Maximum records per batch (default 100)
 * @returns Array of record batches
 */
export declare function batchEntityRecords(records: EntityAuditRecord[], batchSize?: number): EntityAuditRecord[][];
/**
 * Validate that a translated record has all required fields
 *
 * @param record - Entity audit record to validate
 * @returns Validation result with any missing fields
 */
export declare function validateEntityRecord(record: EntityAuditRecord): {
    valid: boolean;
    errors: string[];
};
/**
 * Validate all records in a batch
 *
 * @param records - Array of entity audit records
 * @returns Summary of validation results
 */
export declare function validateRecordBatch(records: EntityAuditRecord[]): {
    valid: boolean;
    totalRecords: number;
    invalidRecords: number;
    errors: Array<{
        recordIndex: number;
        entityId: string;
        errors: string[];
    }>;
};
/**
 * Generate statistics about translated records
 *
 * @param records - Array of entity audit records
 * @returns Statistical summary
 */
export declare function generateRecordStatistics(records: EntityAuditRecord[]): {
    total_entities: number;
    by_category: Record<string, number>;
    by_priority: Record<string, number>;
    pass2_pending: number;
    pass2_skipped: number;
    manual_review_required: number;
    average_confidence: number;
    average_ai_ocr_agreement: number;
};
/**
 * Create a human-readable summary of a translated record (for debugging)
 *
 * @param record - Entity audit record
 * @returns Formatted string summary
 */
export declare function formatRecordSummary(record: EntityAuditRecord): string;
//# sourceMappingURL=pass1-translation.d.ts.map