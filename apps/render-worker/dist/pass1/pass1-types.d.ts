/**
 * Pass 1 Entity Detection - Type Definitions
 * Created: 2025-10-03
 * Purpose: TypeScript interfaces for Pass 1 entity detection processing
 */
export type EntityCategory = 'clinical_event' | 'healthcare_context' | 'document_structure';
export type ClinicalEventSubtype = 'vital_sign' | 'lab_result' | 'physical_finding' | 'symptom' | 'medication' | 'procedure' | 'immunization' | 'diagnosis' | 'allergy' | 'healthcare_encounter' | 'clinical_other';
export type HealthcareContextSubtype = 'patient_identifier' | 'provider_identifier' | 'facility_identifier' | 'appointment' | 'referral' | 'care_coordination' | 'insurance_information' | 'billing_code' | 'authorization' | 'healthcare_context_other';
export type DocumentStructureSubtype = 'header' | 'footer' | 'logo' | 'page_marker' | 'signature_line' | 'watermark' | 'form_structure' | 'document_structure_other';
export type EntitySubtype = ClinicalEventSubtype | HealthcareContextSubtype | DocumentStructureSubtype;
export type ProcessingPriority = 'highest' | 'high' | 'medium' | 'low' | 'logging_only';
export type SpatialMappingSource = 'ocr_exact' | 'ocr_approximate' | 'ai_estimated' | 'none';
export interface SpatialElement {
    text: string;
    page_number: number;
    bounding_box: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    line_number: number;
    word_index: number;
    confidence: number;
}
export interface AIProcessingJobPayload {
    shell_file_id: string;
    patient_id: string;
    storage_path: string;
    mime_type: string;
    file_size_bytes: number;
    uploaded_filename: string;
    correlation_id: string;
}
export interface Pass1Input {
    shell_file_id: string;
    patient_id: string;
    processing_session_id: string;
    raw_file: {
        file_data: string;
        file_type: string;
        filename: string;
        file_size: number;
    };
    ocr_spatial_data: {
        extracted_text: string;
        spatial_mapping: SpatialElement[];
        ocr_confidence: number;
        processing_time_ms: number;
        ocr_provider: string;
    };
    document_metadata: {
        filename: string;
        file_type: string;
        page_count: number;
        upload_timestamp: string;
    };
}
export interface EntityDetectionResult {
    entity_id: string;
    original_text: string;
    classification: {
        entity_category: EntityCategory;
        entity_subtype: EntitySubtype;
        confidence: number;
    };
    visual_interpretation: {
        ai_sees: string;
        formatting_context: string;
        visual_quality: string;
        ai_confidence: number;
    };
    ocr_cross_reference: {
        ocr_text: string | null;
        ocr_confidence: number | null;
        ai_ocr_agreement: number | boolean;
        discrepancy_type: string | null;
        discrepancy_notes: string | null;
    };
    spatial_information: {
        page_number: number;
        bounding_box: {
            x: number;
            y: number;
            width: number;
            height: number;
        } | null;
        unique_marker: string;
        location_context: string;
        spatial_source: SpatialMappingSource;
    };
    quality_indicators: {
        detection_confidence: number;
        classification_confidence: number;
        cross_validation_score: number;
        requires_manual_review: boolean;
    };
}
export interface Pass1AIResponse {
    processing_metadata: {
        model_used: string;
        vision_processing: boolean;
        processing_time_seconds: number;
        token_usage: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
            image_tokens?: number;
        };
        cost_estimate: number;
        confidence_metrics: {
            overall_confidence: number;
            visual_interpretation_confidence: number;
            category_confidence: {
                clinical_event: number;
                healthcare_context: number;
                document_structure: number;
            };
        };
    };
    entities: EntityDetectionResult[];
    document_coverage: {
        total_content_processed: number;
        content_classified: number;
        coverage_percentage: number;
        unclassified_segments: string[];
        visual_quality_score: number;
    };
    cross_validation_results: {
        ai_ocr_agreement_score: number;
        high_discrepancy_count: number;
        ocr_missed_entities: number;
        ai_missed_ocr_text: number;
        spatial_mapping_success_rate: number;
    };
    quality_assessment: {
        completeness_score: number;
        classification_confidence: number;
        cross_validation_score: number;
        requires_manual_review: boolean;
        quality_flags: string[];
    };
    profile_safety: {
        patient_identity_confidence: number;
        age_appropriateness_score: number;
        safety_flags: string[];
        requires_identity_verification: boolean;
    };
}
export interface EntityAuditRecord {
    shell_file_id: string;
    patient_id: string;
    processing_session_id: string;
    entity_id: string;
    original_text: string;
    entity_category: EntityCategory;
    entity_subtype: EntitySubtype;
    unique_marker: string;
    location_context: string;
    spatial_bbox: Record<string, any> | null;
    page_number: number;
    pass1_confidence: number;
    requires_schemas: string[];
    processing_priority: ProcessingPriority;
    pass2_status: 'pending' | 'skipped';
    ai_visual_interpretation: string;
    visual_formatting_context: string;
    ai_visual_confidence: number;
    visual_quality_assessment: string;
    ocr_reference_text: string | null;
    ocr_confidence: number | null;
    ocr_provider: string;
    ai_ocr_agreement_score: number;
    spatial_mapping_source: SpatialMappingSource;
    discrepancy_type: string | null;
    discrepancy_notes: string | null;
    validation_flags?: string[];
    cross_validation_score: number;
    manual_review_required: boolean;
    profile_verification_confidence?: number;
    compliance_flags?: string[];
    created_at?: string;
    updated_at?: string;
}
export interface AIProcessingSessionRecord {
    id?: string;
    patient_id: string;
    shell_file_id: string;
    session_type: 'shell_file_processing' | 'entity_extraction';
    session_status: 'initiated' | 'processing' | 'completed' | 'failed';
    ai_model_name: string;
    model_config: Record<string, any>;
    processing_mode: 'automated' | 'human_guided';
    workflow_step: 'entity_detection';
    total_steps: number;
    completed_steps: number;
    overall_confidence?: number;
    requires_human_review: boolean;
    quality_score?: number;
    processing_started_at: string;
    processing_completed_at?: string;
    total_processing_time?: string;
    created_at?: string;
    updated_at?: string;
}
export interface ProfileClassificationAuditRecord {
    processing_session_id: string;
    shell_file_id: string;
    recommended_profile_type: 'self' | 'child' | 'adult_dependent' | 'pet';
    profile_confidence?: number;
    identity_extraction_results?: Record<string, any>;
    contamination_risk_score?: number;
    contamination_checks_performed?: Record<string, any>;
    contamination_warnings?: string[];
    cross_profile_risk_detected: boolean;
    identity_consistency_score?: number;
    identity_markers_found?: string[];
    age_indicators?: string[];
    relationship_indicators?: string[];
    medicare_number_detected: boolean;
    healthcare_identifier_type?: string;
    healthcare_provider_context?: string;
    classification_reasoning?: string;
    manual_review_required: boolean;
    reviewed_by_user: boolean;
    final_profile_assignment?: 'self' | 'child' | 'adult_dependent' | 'pet';
    medical_appropriateness_score?: number;
    age_appropriateness_validated: boolean;
    safety_flags?: string[];
    ai_model_used: string;
    validation_method: 'automated' | 'human_guided' | 'manual_review';
    created_at?: string;
    updated_at?: string;
}
export interface Pass1EntityMetricsRecord {
    profile_id: string;
    shell_file_id: string;
    processing_session_id: string;
    entities_detected: number;
    processing_time_ms: number;
    vision_model_used: string;
    ocr_model_used?: string;
    ocr_agreement_average?: number;
    confidence_distribution?: Record<string, number>;
    entity_types_found?: string[];
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    ocr_pages_processed?: number;
    user_agent?: string;
    ip_address?: string;
    created_at?: string;
}
export interface ShellFileUpdateFields {
    status?: string;
    processing_started_at?: string;
    processing_completed_at?: string;
    file_type?: string;
    confidence_score?: number;
    extracted_text?: string;
    ocr_confidence?: number;
    page_count?: number;
    processing_cost_estimate?: number;
    processing_duration_seconds?: number;
    language_detected?: string;
    provider_name?: string;
    facility_name?: string;
}
export interface AIConfidenceScoringRecord {
    processing_session_id: string;
    shell_file_id: string;
    patient_id: string;
    entity_id: string;
    pass1_detection_confidence: number;
    pass1_classification_confidence: number;
    pass1_cross_validation_score: number;
    pass1_overall_confidence: number;
    confidence_factors?: Record<string, any>;
    uncertainty_sources?: string[];
    confidence_trend?: string;
    historical_comparison?: Record<string, any>;
    created_at?: string;
}
export interface ManualReviewQueueRecord {
    patient_id: string;
    processing_session_id: string;
    shell_file_id: string;
    review_type: 'entity_validation' | 'profile_classification' | 'clinical_accuracy' | 'safety_concern' | 'low_confidence' | 'contamination_risk';
    priority: 'low' | 'normal' | 'high' | 'urgent' | 'critical';
    ai_confidence_score?: number;
    ai_concerns?: string[];
    flagged_issues?: string[];
    review_title: string;
    review_description: string;
    ai_suggestions?: string;
    clinical_context?: Record<string, any>;
    assigned_reviewer?: string;
    assigned_at?: string;
    estimated_review_time?: string;
    review_status: 'pending';
    created_at?: string;
}
export interface Pass1ProcessingResult {
    success: boolean;
    processing_session_id: string;
    shell_file_id: string;
    patient_id: string;
    total_entities_detected: number;
    entities_by_category: {
        clinical_event: number;
        healthcare_context: number;
        document_structure: number;
    };
    records_created: {
        entity_audit: number;
        ai_sessions: number;
        shell_files_updated: number;
        profile_classification: number;
        entity_metrics: number;
        confidence_scoring: number;
        manual_review_queue: number;
    };
    processing_time_seconds: number;
    cost_estimate: number;
    quality_metrics: {
        overall_confidence: number;
        ai_ocr_agreement: number;
        manual_review_required_count: number;
    };
    pass2_entities_queued: number;
    error?: string;
    retry_recommended?: boolean;
}
export interface Pass1Config {
    openai_api_key: string;
    model: string;
    temperature: number;
    max_tokens: number;
    confidence_threshold: number;
}
export interface ProcessingSessionMetadata {
    shell_file_id: string;
    patient_id: string;
    processing_session_id: string;
    model_used: string;
    vision_processing: boolean;
    ocr_provider: string;
    started_at: string;
}
//# sourceMappingURL=pass1-types.d.ts.map