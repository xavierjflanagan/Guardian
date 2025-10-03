/**
 * Pass 1 Database Builder - Creates ALL Pass 1 Database Records
 * Created: 2025-10-03
 * Purpose: Build complete Pass 1 database records for all 7 tables per bridge schemas
 *
 * Pass 1 writes to 7 tables:
 * 1. ai_processing_sessions (CREATE)
 * 2. entity_processing_audit (CREATE multiple)
 * 3. shell_files (UPDATE)
 * 4. profile_classification_audit (CREATE)
 * 5. pass1_entity_metrics (CREATE)
 * 6. ai_confidence_scoring (CREATE multiple, optional)
 * 7. manual_review_queue (CREATE multiple, optional)
 */

import {
  Pass1AIResponse,
  Pass1Input,
  ProcessingSessionMetadata,
  AIProcessingSessionRecord,
  ProfileClassificationAuditRecord,
  Pass1EntityMetricsRecord,
  ShellFileUpdateFields,
  AIConfidenceScoringRecord,
  ManualReviewQueueRecord,
  EntityAuditRecord,
} from './pass1-types';

// =============================================================================
// COMPLETE PASS 1 DATABASE RECORDS
// =============================================================================

export interface Pass1DatabaseRecords {
  // 1. Session coordination (1 record)
  ai_processing_session: AIProcessingSessionRecord;

  // 2. Entity audit trail (N records - one per entity)
  entity_processing_audit: EntityAuditRecord[];

  // 3. Shell file updates (1 update)
  shell_file_updates: ShellFileUpdateFields;

  // 4. Profile classification (1 record)
  profile_classification_audit: ProfileClassificationAuditRecord;

  // 5. Metrics (1 record)
  pass1_entity_metrics: Pass1EntityMetricsRecord;

  // 6. Confidence scoring (N records - optional, for low-confidence entities)
  ai_confidence_scoring: AIConfidenceScoringRecord[];

  // 7. Manual review queue (N records - optional, for flagged entities)
  manual_review_queue: ManualReviewQueueRecord[];
}

// =============================================================================
// MAIN BUILDER FUNCTION
// =============================================================================

/**
 * Build complete Pass 1 database records from AI response
 */
export function buildPass1DatabaseRecords(
  input: Pass1Input,
  aiResponse: Pass1AIResponse,
  sessionMetadata: ProcessingSessionMetadata,
  entityAuditRecords: EntityAuditRecord[]
): Pass1DatabaseRecords {
  const startTime = Date.now();

  // 1. Build ai_processing_sessions record
  const aiProcessingSession = buildAIProcessingSessionRecord(
    input,
    aiResponse,
    sessionMetadata
  );

  // 2. Entity audit records (already built by translation layer)
  const entityProcessingAudit = entityAuditRecords;

  // 3. Build shell_files updates
  const shellFileUpdates = buildShellFileUpdates(input, aiResponse, sessionMetadata);

  // 4. Build profile_classification_audit record
  const profileClassificationAudit = buildProfileClassificationAudit(
    input,
    aiResponse,
    sessionMetadata
  );

  // 5. Build pass1_entity_metrics record
  const pass1EntityMetrics = buildPass1EntityMetrics(
    input,
    aiResponse,
    sessionMetadata,
    entityAuditRecords,
    Date.now() - startTime
  );

  // 6. Build ai_confidence_scoring records (optional - only for low confidence)
  const aiConfidenceScoring = buildAIConfidenceScoringRecords(
    input,
    aiResponse,
    sessionMetadata,
    entityAuditRecords
  );

  // 7. Build manual_review_queue records (optional - only for flagged entities)
  const manualReviewQueue = buildManualReviewQueueRecords(
    input,
    aiResponse,
    sessionMetadata,
    entityAuditRecords
  );

  return {
    ai_processing_session: aiProcessingSession,
    entity_processing_audit: entityProcessingAudit,
    shell_file_updates: shellFileUpdates,
    profile_classification_audit: profileClassificationAudit,
    pass1_entity_metrics: pass1EntityMetrics,
    ai_confidence_scoring: aiConfidenceScoring,
    manual_review_queue: manualReviewQueue,
  };
}

// =============================================================================
// 1. AI PROCESSING SESSIONS
// =============================================================================

function buildAIProcessingSessionRecord(
  input: Pass1Input,
  aiResponse: Pass1AIResponse,
  sessionMetadata: ProcessingSessionMetadata
): AIProcessingSessionRecord {
  return {
    id: input.processing_session_id,
    patient_id: input.patient_id,
    shell_file_id: input.shell_file_id,
    session_type: 'entity_extraction',
    session_status: 'completed',
    ai_model_version: sessionMetadata.model_used,
    model_config: {
      temperature: 0.1,
      max_tokens: 4000,
      vision_enabled: true,
      ocr_cross_validation: true,
    },
    processing_mode: 'automated',
    workflow_step: 'entity_detection',
    total_steps: 2, // Pass 1 + Pass 2
    completed_steps: 1, // Pass 1 done
    overall_confidence: aiResponse.processing_metadata.confidence_metrics.overall_confidence,
    requires_human_review: aiResponse.quality_assessment.requires_manual_review,
    quality_score: aiResponse.quality_assessment.completeness_score,
    processing_started_at: sessionMetadata.started_at,
    processing_completed_at: new Date().toISOString(),
    total_processing_time: `${aiResponse.processing_metadata.processing_time_seconds} seconds`,
  };
}

// =============================================================================
// 3. SHELL FILES UPDATES
// =============================================================================

function buildShellFileUpdates(
  input: Pass1Input,
  aiResponse: Pass1AIResponse,
  sessionMetadata: ProcessingSessionMetadata
): ShellFileUpdateFields {
  return {
    status: 'pass1_complete',
    processing_started_at: sessionMetadata.started_at,
    processing_completed_at: new Date().toISOString(),
    file_type: 'medical_record', // Could be enhanced with document type detection
    confidence_score: aiResponse.processing_metadata.confidence_metrics.overall_confidence,
    extracted_text: input.ocr_spatial_data.extracted_text,
    ocr_confidence: input.ocr_spatial_data.ocr_confidence,
    page_count: input.document_metadata.page_count,
    processing_cost_estimate: aiResponse.processing_metadata.cost_estimate,
    processing_duration_seconds: Math.ceil(aiResponse.processing_metadata.processing_time_seconds),
    language_detected: 'en', // Could be enhanced with language detection
  };
}

// =============================================================================
// 4. PROFILE CLASSIFICATION AUDIT
// =============================================================================

function buildProfileClassificationAudit(
  input: Pass1Input,
  aiResponse: Pass1AIResponse,
  sessionMetadata: ProcessingSessionMetadata
): ProfileClassificationAuditRecord {
  return {
    processing_session_id: input.processing_session_id,
    shell_file_id: input.shell_file_id,
    recommended_profile_type: 'self', // Default - could be enhanced with actual classification
    profile_confidence: aiResponse.profile_safety.patient_identity_confidence,
    identity_extraction_results: {
      identity_confidence: aiResponse.profile_safety.patient_identity_confidence,
      age_appropriateness: aiResponse.profile_safety.age_appropriateness_score,
    },
    contamination_risk_score: 1.0 - aiResponse.profile_safety.patient_identity_confidence,
    contamination_checks_performed: {
      identity_verification: true,
      age_appropriateness_check: true,
      cross_profile_check: true,
    },
    contamination_warnings: aiResponse.profile_safety.safety_flags,
    cross_profile_risk_detected: aiResponse.profile_safety.requires_identity_verification,
    identity_consistency_score: aiResponse.profile_safety.patient_identity_confidence,
    identity_markers_found: [],
    age_indicators: [],
    relationship_indicators: [],
    medicare_number_detected: false,
    classification_reasoning: 'Pass 1 automated profile classification based on document content analysis',
    manual_review_required: aiResponse.profile_safety.requires_identity_verification,
    reviewed_by_user: false,
    medical_appropriateness_score: aiResponse.profile_safety.age_appropriateness_score,
    age_appropriateness_validated: aiResponse.profile_safety.age_appropriateness_score > 0.8,
    safety_flags: aiResponse.profile_safety.safety_flags,
    ai_model_used: sessionMetadata.model_used,
    validation_method: 'automated',
  };
}

// =============================================================================
// 5. PASS1 ENTITY METRICS
// =============================================================================

function buildPass1EntityMetrics(
  input: Pass1Input,
  aiResponse: Pass1AIResponse,
  sessionMetadata: ProcessingSessionMetadata,
  entityAuditRecords: EntityAuditRecord[],
  processingTimeMs: number
): Pass1EntityMetricsRecord {
  // Calculate confidence distribution
  const confidenceDistribution = calculateConfidenceDistribution(entityAuditRecords);

  // Get unique entity types
  const entityTypesFound = [
    ...new Set(entityAuditRecords.map((e) => e.entity_subtype)),
  ];

  return {
    profile_id: input.patient_id,
    shell_file_id: input.shell_file_id,
    processing_session_id: input.processing_session_id,
    entities_detected: aiResponse.entities.length,
    processing_time_ms: processingTimeMs,
    vision_model_used: sessionMetadata.model_used,
    ocr_model_used: sessionMetadata.ocr_provider,
    ocr_agreement_average: aiResponse.cross_validation_results.ai_ocr_agreement_score,
    confidence_distribution: confidenceDistribution,
    entity_types_found: entityTypesFound,
    vision_tokens_used: aiResponse.processing_metadata.token_usage.total_tokens,
    ocr_pages_processed: input.document_metadata.page_count,
    cost_usd: aiResponse.processing_metadata.cost_estimate,
  };
}

function calculateConfidenceDistribution(
  entityAuditRecords: EntityAuditRecord[]
): Record<string, number> {
  const distribution = { high: 0, medium: 0, low: 0 };

  for (const entity of entityAuditRecords) {
    if (entity.pass1_confidence >= 0.8) {
      distribution.high++;
    } else if (entity.pass1_confidence >= 0.6) {
      distribution.medium++;
    } else {
      distribution.low++;
    }
  }

  return distribution;
}

// =============================================================================
// 6. AI CONFIDENCE SCORING (Optional - low confidence entities)
// =============================================================================

function buildAIConfidenceScoringRecords(
  input: Pass1Input,
  _aiResponse: Pass1AIResponse,
  _sessionMetadata: ProcessingSessionMetadata,
  entityAuditRecords: EntityAuditRecord[]
): AIConfidenceScoringRecord[] {
  const records: AIConfidenceScoringRecord[] = [];

  // Only create records for entities with confidence < 0.8
  for (const entity of entityAuditRecords) {
    if (entity.pass1_confidence < 0.8) {
      records.push({
        processing_session_id: input.processing_session_id,
        shell_file_id: input.shell_file_id,
        patient_id: input.patient_id,
        entity_id: entity.entity_id,
        pass1_detection_confidence: entity.pass1_confidence,
        pass1_classification_confidence: entity.pass1_confidence,
        pass1_cross_validation_score: entity.cross_validation_score,
        pass1_overall_confidence: entity.pass1_confidence,
        confidence_factors: {
          visual_confidence: entity.ai_visual_confidence,
          ocr_confidence: entity.ocr_confidence,
          ai_ocr_agreement: entity.ai_ocr_agreement_score,
        },
        uncertainty_sources: [
          ...(entity.discrepancy_type ? [`AI-OCR discrepancy: ${entity.discrepancy_type}`] : []),
          ...(entity.ai_visual_confidence < 0.8 ? ['Low visual confidence'] : []),
          ...(entity.ocr_confidence && entity.ocr_confidence < 0.8 ? ['Low OCR confidence'] : []),
        ],
        confidence_trend: 'stable',
      });
    }
  }

  return records;
}

// =============================================================================
// 7. MANUAL REVIEW QUEUE (Optional - flagged entities)
// =============================================================================

function buildManualReviewQueueRecords(
  input: Pass1Input,
  _aiResponse: Pass1AIResponse,
  _sessionMetadata: ProcessingSessionMetadata,
  entityAuditRecords: EntityAuditRecord[]
): ManualReviewQueueRecord[] {
  const records: ManualReviewQueueRecord[] = [];

  // Create review items for entities requiring manual review
  for (const entity of entityAuditRecords) {
    if (entity.manual_review_required) {
      const priority = determinePriority(entity);
      const reviewType = determineReviewType(entity);

      records.push({
        patient_id: input.patient_id,
        processing_session_id: input.processing_session_id,
        shell_file_id: input.shell_file_id,
        review_type: reviewType,
        priority: priority,
        ai_confidence_score: entity.pass1_confidence,
        ai_concerns: [
          ...(entity.discrepancy_type ? [`AI-OCR discrepancy: ${entity.discrepancy_type}`] : []),
          ...(entity.pass1_confidence < 0.6 ? ['Low detection confidence'] : []),
        ],
        flagged_issues: [],
        review_title: `Low Confidence Entity: ${entity.entity_subtype}`,
        review_description: `Entity "${entity.original_text}" detected with ${(entity.pass1_confidence * 100).toFixed(0)}% confidence. Manual review recommended.`,
        ai_suggestions: `Verify the classification of this entity and confirm the extracted text is accurate.`,
        clinical_context: {
          entity_id: entity.entity_id,
          entity_category: entity.entity_category,
          entity_subtype: entity.entity_subtype,
          original_text: entity.original_text,
          location: entity.location_context,
        },
        review_status: 'pending',
      });
    }
  }

  return records;
}

function determinePriority(
  entity: EntityAuditRecord
): 'low' | 'normal' | 'high' | 'urgent' | 'critical' {
  if (entity.processing_priority === 'highest') return 'critical';
  if (entity.processing_priority === 'high') return 'high';
  if (entity.processing_priority === 'medium') return 'normal';
  return 'low';
}

function determineReviewType(
  entity: EntityAuditRecord
): 'entity_validation' | 'profile_classification' | 'clinical_accuracy' | 'safety_concern' | 'low_confidence' | 'contamination_risk' {
  if (entity.pass1_confidence < 0.6) return 'low_confidence';
  if (entity.discrepancy_type) return 'entity_validation';
  if (entity.processing_priority === 'highest') return 'safety_concern';
  return 'entity_validation';
}
