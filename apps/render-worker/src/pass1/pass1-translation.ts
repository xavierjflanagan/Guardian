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

import {
  Pass1AIResponse,
  EntityAuditRecord,
  ProcessingSessionMetadata,
} from './pass1-types';
import { assignEntitySchemas, determineProcessingPriority } from './pass1-schema-mapping';

// =============================================================================
// TEXT FIELD TRUNCATION HELPER
// =============================================================================

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
export function truncateTextField(text: string | null, maxLength: number = 120): string | null {
  if (text === null || text === undefined) {
    return null;
  }

  if (text.length <= maxLength) {
    return text;
  }

  // Truncate and add ellipsis
  return text.substring(0, maxLength - 3) + '...';
}

// =============================================================================
// MAIN TRANSLATION FUNCTION
// =============================================================================

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
 * @param aiResponse - The complete response from GPT-4o Vision
 * @param sessionMetadata - Processing session context
 * @returns Array of database-ready records for entity_processing_audit table
 */
export function translateAIOutputToDatabase(
  aiResponse: Pass1AIResponse,
  sessionMetadata: ProcessingSessionMetadata
): EntityAuditRecord[] {
  return aiResponse.entities.map((entity) => {
    // Assign schemas based on entity subtype
    const requiredSchemas = assignEntitySchemas(entity.classification.entity_subtype);

    // Determine processing priority
    const priority = determineProcessingPriority(
      entity.classification.entity_category,
      entity.classification.entity_subtype
    );

    // Determine if Pass 2 should skip this entity (document_structure)
    const skipPass2 = entity.classification.entity_category === 'document_structure';

    // Build the flattened database record
    const record: EntityAuditRecord = {
      // =========================================================================
      // PRIMARY REFERENCES
      // =========================================================================
      shell_file_id: sessionMetadata.shell_file_id,
      patient_id: sessionMetadata.patient_id,
      processing_session_id: sessionMetadata.processing_session_id,

      // =========================================================================
      // ENTITY IDENTITY (Direct mappings from AI)
      // =========================================================================
      entity_id: entity.entity_id,
      original_text: entity.original_text,
      entity_category: entity.classification.entity_category,
      entity_subtype: entity.classification.entity_subtype,

      // =========================================================================
      // SPATIAL AND CONTEXT INFORMATION (Direct mappings with safety guards)
      // =========================================================================
      unique_marker: entity.spatial_information?.unique_marker || '',
      location_context: entity.spatial_information?.location_context || '',
      spatial_bbox: entity.spatial_information?.bounding_box || null, // JSONB in database
      page_number: entity.spatial_information?.page_number || 1,

      // =========================================================================
      // PASS 1 PROCESSING RESULTS (Computed + Direct with safety guards)
      // =========================================================================
      pass1_confidence: entity.classification?.confidence || 0,
      requires_schemas: requiredSchemas,
      processing_priority: priority,

      // =========================================================================
      // PASS 2 COORDINATION (Initialized by Pass 1)
      // =========================================================================
      pass2_status: skipPass2 ? 'skipped' : 'pending',

      // =========================================================================
      // AI MODEL METADATA (From session + response with safety guards)
      // =========================================================================
      // REMOVED (Migration 16): pass1_model_used (use JOIN to pass1_entity_metrics)
      // REMOVED (Migration 16): pass1_vision_processing (use JOIN to pass1_entity_metrics)
      // REMOVED (Migration 17): pass1_token_usage (use JOIN to pass1_entity_metrics.total_tokens)
      // REMOVED (Migration 17): pass1_image_tokens (deprecated, always 0)
      // REMOVED (Migration 17): pass1_cost_estimate (calculate on-demand from token breakdown)

      // =========================================================================
      // DUAL-INPUT PROCESSING METADATA (FLATTENED with safety guards + TRUNCATION)
      // =========================================================================
      ai_visual_interpretation: truncateTextField(entity.visual_interpretation?.ai_sees || '', 120),
      visual_formatting_context: truncateTextField(entity.visual_interpretation?.formatting_context || '', 120),
      ai_visual_confidence: entity.visual_interpretation?.ai_confidence || 0,
      visual_quality_assessment: entity.visual_interpretation?.visual_quality || '',

      // =========================================================================
      // OCR CROSS-REFERENCE DATA (FLATTENED with safety guards + TRUNCATION)
      // =========================================================================
      ocr_reference_text: truncateTextField(entity.ocr_cross_reference?.ocr_text || null, 120),
      ocr_confidence: entity.ocr_cross_reference?.ocr_confidence || null,
      ocr_provider: sessionMetadata.ocr_provider,
      ai_ocr_agreement_score: entity.ocr_cross_reference?.ai_ocr_agreement || 0,
      spatial_mapping_source: entity.spatial_information?.spatial_source || 'none',

      // =========================================================================
      // DISCREPANCY TRACKING (FLATTENED with safety guards + TRUNCATION)
      // =========================================================================
      discrepancy_type: entity.ocr_cross_reference?.discrepancy_type || null,
      discrepancy_notes: truncateTextField(entity.ocr_cross_reference?.discrepancy_notes || null, 120),

      // =========================================================================
      // QUALITY AND VALIDATION METADATA (FLATTENED with safety guards)
      // =========================================================================
      validation_flags: aiResponse.quality_assessment?.quality_flags || [],
      cross_validation_score: entity.quality_indicators?.cross_validation_score || 0,
      manual_review_required: entity.quality_indicators?.requires_manual_review || false,

      // =========================================================================
      // PROFILE SAFETY AND COMPLIANCE (From document-level assessment)
      // =========================================================================
      profile_verification_confidence: aiResponse.profile_safety?.patient_identity_confidence ?? 0,
      compliance_flags: aiResponse.profile_safety?.safety_flags || [],

      // =========================================================================
      // TIMESTAMPS (Handled by database defaults)
      // =========================================================================
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return record;
  });
}

// =============================================================================
// BATCH PROCESSING HELPERS
// =============================================================================

/**
 * Split entity records into batches for database insertion
 *
 * @param records - All entity audit records
 * @param batchSize - Maximum records per batch (default 100)
 * @returns Array of record batches
 */
export function batchEntityRecords(
  records: EntityAuditRecord[],
  batchSize: number = 100
): EntityAuditRecord[][] {
  const batches: EntityAuditRecord[][] = [];

  for (let i = 0; i < records.length; i += batchSize) {
    batches.push(records.slice(i, i + batchSize));
  }

  return batches;
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate that a translated record has all required fields
 *
 * @param record - Entity audit record to validate
 * @returns Validation result with any missing fields
 */
export function validateEntityRecord(record: EntityAuditRecord): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Required string fields
  const requiredStrings: Array<keyof EntityAuditRecord> = [
    'shell_file_id',
    'patient_id',
    'processing_session_id',
    'entity_id',
    'original_text',
    'entity_category',
    'entity_subtype',
    'unique_marker',
    'location_context',
    'ocr_provider',
    'spatial_mapping_source',
    'ai_visual_interpretation',
    'visual_formatting_context',
    'visual_quality_assessment',
  ];

  for (const field of requiredStrings) {
    if (!record[field] || (typeof record[field] === 'string' && record[field].trim() === '')) {
      // Defensive fallback for original_text if missing
      if (field === 'original_text' && !record[field]) {
        record[field] = '[text not extracted]';
        console.warn(`[Pass1] Missing original_text for entity ${record.entity_id}, using fallback`);
        // Continue to next field since we've fixed this one
        continue;
      } else {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Required number fields
  const requiredNumbers: Array<keyof EntityAuditRecord> = [
    'pass1_confidence',
    'page_number',
    'ai_visual_confidence',
    'ai_ocr_agreement_score',
    'cross_validation_score',
  ];

  for (const field of requiredNumbers) {
    if (typeof record[field] !== 'number') {
      errors.push(`Invalid or missing number field: ${field}`);
    }
  }

  // Required arrays
  if (!Array.isArray(record.requires_schemas)) {
    errors.push('Invalid requires_schemas: must be array');
  }

  // Confidence score validation (0.0 - 1.0)
  if (record.pass1_confidence < 0 || record.pass1_confidence > 1) {
    errors.push(`Invalid pass1_confidence: ${record.pass1_confidence} (must be 0.0-1.0)`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate all records in a batch
 *
 * @param records - Array of entity audit records
 * @returns Summary of validation results
 */
export function validateRecordBatch(records: EntityAuditRecord[]): {
  valid: boolean;
  totalRecords: number;
  invalidRecords: number;
  errors: Array<{ recordIndex: number; entityId: string; errors: string[] }>;
} {
  const allErrors: Array<{ recordIndex: number; entityId: string; errors: string[] }> = [];

  records.forEach((record, index) => {
    const validation = validateEntityRecord(record);
    if (!validation.valid) {
      allErrors.push({
        recordIndex: index,
        entityId: record.entity_id,
        errors: validation.errors,
      });
    }
  });

  return {
    valid: allErrors.length === 0,
    totalRecords: records.length,
    invalidRecords: allErrors.length,
    errors: allErrors,
  };
}

// =============================================================================
// STATISTICS HELPERS
// =============================================================================

/**
 * Generate statistics about translated records
 *
 * @param records - Array of entity audit records
 * @returns Statistical summary
 */
export function generateRecordStatistics(records: EntityAuditRecord[]): {
  total_entities: number;
  by_category: Record<string, number>;
  by_priority: Record<string, number>;
  pass2_pending: number;
  pass2_skipped: number;
  manual_review_required: number;
  average_confidence: number;
  average_ai_ocr_agreement: number;
} {
  const byCategory: Record<string, number> = {
    clinical_event: 0,
    healthcare_context: 0,
    document_structure: 0,
  };

  const byPriority: Record<string, number> = {
    highest: 0,
    high: 0,
    medium: 0,
    low: 0,
    logging_only: 0,
  };

  let pass2Pending = 0;
  let pass2Skipped = 0;
  let manualReviewRequired = 0;
  let totalConfidence = 0;
  let totalAgreement = 0;

  for (const record of records) {
    byCategory[record.entity_category]++;
    byPriority[record.processing_priority]++;

    if (record.pass2_status === 'pending') pass2Pending++;
    if (record.pass2_status === 'skipped') pass2Skipped++;
    if (record.manual_review_required) manualReviewRequired++;

    totalConfidence += record.pass1_confidence;
    totalAgreement += record.ai_ocr_agreement_score;
  }

  return {
    total_entities: records.length,
    by_category: byCategory,
    by_priority: byPriority,
    pass2_pending: pass2Pending,
    pass2_skipped: pass2Skipped,
    manual_review_required: manualReviewRequired,
    average_confidence: records.length > 0 ? totalConfidence / records.length : 0,
    average_ai_ocr_agreement: records.length > 0 ? totalAgreement / records.length : 0,
  };
}

// =============================================================================
// DEBUG HELPERS
// =============================================================================

/**
 * Create a human-readable summary of a translated record (for debugging)
 *
 * @param record - Entity audit record
 * @returns Formatted string summary
 */
export function formatRecordSummary(record: EntityAuditRecord): string {
  return `
Entity: ${record.entity_id}
Text: "${record.original_text}"
Category: ${record.entity_category} / ${record.entity_subtype}
Confidence: ${(record.pass1_confidence * 100).toFixed(1)}%
AI-OCR Agreement: ${(record.ai_ocr_agreement_score * 100).toFixed(1)}%
Location: Page ${record.page_number}, ${record.location_context}
Schemas Required: ${record.requires_schemas.join(', ') || 'none'}
Priority: ${record.processing_priority}
Pass 2 Status: ${record.pass2_status}
Manual Review: ${record.manual_review_required ? 'YES' : 'NO'}
`.trim();
}
