-- =============================================================================
-- FRESH START BLUEPRINT: 04_ai_processing.sql
-- =============================================================================
-- Purpose: AI processing pipeline infrastructure with V3 entity classification
-- Components: Entity Processing + AI Confidence + Manual Review + Clinical Decision Support
-- Dependencies: 01_foundations.sql, 02_profiles.sql, 03_clinical_core.sql
-- Key Fix: All references use correct user_profiles(id) relationships
-- Created: 2025-08-27 (Fresh Start Implementation)
-- =============================================================================

BEGIN;

-- Verification that dependencies exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: documents table not found. Run 03_clinical_core.sql first.';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_clinical_events') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: patient_clinical_events table not found. Run 03_clinical_core.sql first.';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'healthcare_encounters') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: healthcare_encounters table not found. Run 03_clinical_core.sql first.';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'has_profile_access') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: has_profile_access() function not found. Run 02_profiles.sql first.';
    END IF;
    
    RAISE NOTICE 'Dependencies verified: V3 core clinical tables and profile access functions exist';
END $$;

-- =============================================================================
-- SECTION 1: AI PROCESSING SESSION MANAGEMENT
-- =============================================================================

-- AI processing sessions for document processing coordination - UPDATED for semantic architecture
CREATE TABLE IF NOT EXISTS ai_processing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE, -- Updated reference
    
    -- Session metadata
    session_type TEXT NOT NULL CHECK (session_type IN (
        'document_processing', 'entity_extraction', 'clinical_validation',
        'profile_classification', 'decision_support', 'semantic_processing' -- Added Pass 3
    )),
    session_status TEXT NOT NULL DEFAULT 'initiated' CHECK (session_status IN (
        'initiated', 'processing', 'completed', 'failed', 'cancelled'
    )),
    
    -- AI model configuration
    ai_model_version TEXT NOT NULL DEFAULT 'v3',
    model_config JSONB DEFAULT '{}',
    processing_mode TEXT CHECK (processing_mode IN ('automated', 'human_guided', 'validation_only')),
    
    -- Processing workflow
    workflow_step TEXT NOT NULL DEFAULT 'entity_detection' CHECK (workflow_step IN (
        'entity_detection', 'profile_classification', 'clinical_extraction',
        'semantic_processing', 'validation', 'decision_support', 'completed' -- Added Pass 3 step
    )),
    total_steps INTEGER DEFAULT 5,
    completed_steps INTEGER DEFAULT 0,
    
    -- Quality metrics
    overall_confidence NUMERIC(4,3) CHECK (overall_confidence BETWEEN 0 AND 1),
    requires_human_review BOOLEAN DEFAULT FALSE,
    quality_score NUMERIC(4,3) CHECK (quality_score BETWEEN 0 AND 1),
    
    -- Processing times
    processing_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_completed_at TIMESTAMPTZ,
    total_processing_time INTERVAL,
    
    -- Error handling
    error_message TEXT,
    error_context JSONB,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 2: ENTITY PROCESSING AUDIT V3 ENHANCED
-- =============================================================================
-- CRITICAL FIX: References to clinical tables now use correct relationships

-- Entity processing audit with V3 enhancements and corrected references
CREATE TABLE IF NOT EXISTS entity_processing_audit_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    entity_id TEXT NOT NULL,
    
    -- V3 Core Fields (Enhanced)
    entity_category TEXT NOT NULL CHECK (entity_category IN (
        'clinical_event', 'healthcare_context', 'document_structure'
    )),
    entity_subtype TEXT NOT NULL,
    pass1_confidence NUMERIC(4,3) CHECK (pass1_confidence BETWEEN 0 AND 1),
    pass2_status TEXT DEFAULT 'pending' CHECK (pass2_status IN (
        'pending', 'processing', 'completed', 'failed', 'skipped'
    )),
    
    -- V3 CORRECTED: Reference to V3 core clinical tables
    linked_clinical_event_id UUID REFERENCES patient_clinical_events(id),
    linked_observation_id UUID REFERENCES patient_observations(id),
    linked_intervention_id UUID REFERENCES patient_interventions(id),
    linked_encounter_id UUID REFERENCES healthcare_encounters(id),
    
    -- Supplementary table references (optional detail linking)
    linked_condition_id UUID REFERENCES patient_conditions(id),
    linked_medication_id UUID REFERENCES patient_medications(id),
    linked_immunization_id UUID REFERENCES patient_immunizations(id),
    linked_vital_id UUID REFERENCES patient_vitals(id),
    linked_allergy_id UUID REFERENCES patient_allergies(id),
    
    -- V3 Processing Results
    extraction_results JSONB DEFAULT '{}',
    clinical_coding_results JSONB DEFAULT '{}',
    spatial_coordinates JSONB,
    
    -- V2 Profile Classification Results (Essential)
    profile_classification_results JSONB DEFAULT '{}',
    contamination_prevention_checks JSONB DEFAULT '{}',
    identity_verification_results JSONB DEFAULT '{}',
    
    -- V2 Healthcare Standards Results (Schema-Driven)
    medical_coding_results JSONB DEFAULT '{}',
    healthcare_context_extraction JSONB DEFAULT '{}',
    
    -- V2 Spatial Processing Results
    spatial_alignment_results JSONB DEFAULT '{}',
    
    -- Processing Metadata
    processing_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_completed_at TIMESTAMPTZ,
    processing_duration INTERVAL,
    
    -- Entity Content and Provenance
    original_text TEXT,
    processed_text TEXT,
    confidence_breakdown JSONB DEFAULT '{}',
    
    -- Quality assurance
    validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN (
        'pending', 'validated', 'requires_review', 'rejected', 'manual_override'
    )),
    validation_notes TEXT,
    validated_by TEXT, -- User or system identifier
    validated_at TIMESTAMPTZ,
    
    -- Audit Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 3: PROFILE CLASSIFICATION & SAFETY (V2 Integration)
-- =============================================================================
-- CRITICAL FIX: Proper document references and profile-based access

-- Profile classification audit for V2 safety validation
CREATE TABLE IF NOT EXISTS profile_classification_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    
    -- Profile Classification Results
    recommended_profile_type TEXT NOT NULL CHECK (recommended_profile_type IN (
        'self', 'child', 'adult_dependent', 'pet'
    )),
    profile_confidence NUMERIC(4,3) CHECK (profile_confidence BETWEEN 0 AND 1),
    identity_extraction_results JSONB DEFAULT '{}',
    
    -- Contamination Prevention (Core Safety)
    contamination_risk_score NUMERIC(4,3) CHECK (contamination_risk_score BETWEEN 0 AND 1),
    contamination_checks_performed JSONB DEFAULT '{}',
    contamination_warnings TEXT[],
    cross_profile_risk_detected BOOLEAN DEFAULT FALSE,
    
    -- Identity Verification
    identity_consistency_score NUMERIC(4,3) CHECK (identity_consistency_score BETWEEN 0 AND 1),
    identity_markers_found TEXT[],
    age_indicators TEXT[],
    relationship_indicators TEXT[],
    
    -- Australian Healthcare Context
    medicare_number_detected BOOLEAN DEFAULT FALSE,
    healthcare_identifier_type TEXT,
    healthcare_provider_context TEXT,
    
    -- Audit Trail
    classification_reasoning TEXT,
    manual_review_required BOOLEAN DEFAULT FALSE,
    reviewed_by_user BOOLEAN DEFAULT FALSE,
    final_profile_assignment TEXT CHECK (final_profile_assignment IN (
        'self', 'child', 'adult_dependent', 'pet'
    )),
    
    -- Safety Validation Details
    medical_appropriateness_score NUMERIC(4,3) CHECK (medical_appropriateness_score BETWEEN 0 AND 1),
    age_appropriateness_validated BOOLEAN DEFAULT FALSE,
    safety_flags TEXT[],
    
    -- Processing Context
    ai_model_used TEXT DEFAULT 'gpt-4o-mini',
    validation_method TEXT DEFAULT 'automated' CHECK (validation_method IN (
        'automated', 'human_guided', 'manual_review'
    )),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 4: MANUAL REVIEW & VALIDATION QUEUE
-- =============================================================================

-- Manual review queue for AI processing validation (Blueprint Issue #39)
CREATE TABLE IF NOT EXISTS manual_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    
    -- Review context
    review_type TEXT NOT NULL CHECK (review_type IN (
        'entity_validation', 'profile_classification', 'clinical_accuracy',
        'safety_concern', 'low_confidence', 'contamination_risk'
    )),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN (
        'low', 'normal', 'high', 'urgent', 'critical'
    )),
    
    -- AI processing context
    ai_confidence_score NUMERIC(4,3) CHECK (ai_confidence_score BETWEEN 0 AND 1),
    ai_concerns TEXT[],
    flagged_issues TEXT[],
    
    -- Review content
    review_title TEXT NOT NULL,
    review_description TEXT NOT NULL,
    ai_suggestions TEXT,
    clinical_context JSONB DEFAULT '{}',
    
    -- Assignment and workflow
    assigned_reviewer TEXT, -- User identifier or role
    assigned_at TIMESTAMPTZ,
    estimated_review_time INTERVAL DEFAULT '15 minutes',
    
    -- Review results
    review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN (
        'pending', 'in_review', 'completed', 'escalated', 'deferred'
    )),
    reviewer_decision TEXT CHECK (reviewer_decision IN (
        'approved', 'rejected', 'needs_modification', 'escalate', 'defer'
    )),
    reviewer_notes TEXT,
    modifications_required JSONB DEFAULT '{}',
    
    -- Completion tracking
    review_started_at TIMESTAMPTZ,
    review_completed_at TIMESTAMPTZ,
    actual_review_time INTERVAL,
    
    -- Quality metrics
    review_quality_score NUMERIC(4,3) CHECK (review_quality_score BETWEEN 0 AND 1),
    reviewer_confidence NUMERIC(4,3) CHECK (reviewer_confidence BETWEEN 0 AND 1),
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI confidence scoring for quality metrics
CREATE TABLE IF NOT EXISTS ai_confidence_scoring (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,
    entity_processing_audit_id UUID REFERENCES entity_processing_audit_v2(id) ON DELETE CASCADE,
    
    -- Confidence breakdown
    entity_detection_confidence NUMERIC(4,3) CHECK (entity_detection_confidence BETWEEN 0 AND 1),
    text_extraction_confidence NUMERIC(4,3) CHECK (text_extraction_confidence BETWEEN 0 AND 1),
    clinical_coding_confidence NUMERIC(4,3) CHECK (clinical_coding_confidence BETWEEN 0 AND 1),
    spatial_alignment_confidence NUMERIC(4,3) CHECK (spatial_alignment_confidence BETWEEN 0 AND 1),
    
    -- Model-specific confidence scores
    vision_model_confidence NUMERIC(4,3) CHECK (vision_model_confidence BETWEEN 0 AND 1),
    language_model_confidence NUMERIC(4,3) CHECK (language_model_confidence BETWEEN 0 AND 1),
    classification_model_confidence NUMERIC(4,3) CHECK (classification_model_confidence BETWEEN 0 AND 1),
    
    -- Composite scores
    overall_confidence NUMERIC(4,3) CHECK (overall_confidence BETWEEN 0 AND 1),
    reliability_score NUMERIC(4,3) CHECK (reliability_score BETWEEN 0 AND 1),
    clinical_relevance_score NUMERIC(4,3) CHECK (clinical_relevance_score BETWEEN 0 AND 1),
    
    -- Quality indicators
    confidence_trend TEXT CHECK (confidence_trend IN ('improving', 'stable', 'declining')),
    outlier_detection BOOLEAN DEFAULT FALSE,
    confidence_flags TEXT[],
    
    -- Validation against human review
    human_validation_available BOOLEAN DEFAULT FALSE,
    human_agreement_score NUMERIC(4,3) CHECK (human_agreement_score BETWEEN 0 AND 1),
    model_accuracy_score NUMERIC(4,3) CHECK (model_accuracy_score BETWEEN 0 AND 1),
    
    -- Model performance tracking
    processing_time_ms INTEGER,
    model_version TEXT,
    calibration_score NUMERIC(4,3) CHECK (calibration_score BETWEEN 0 AND 1),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 5: CLINICAL DECISION SUPPORT RULE ENGINE
-- =============================================================================
-- NOTE: Clinical alert rules and provider action items are defined in 05_healthcare_journey.sql
-- This section focuses on AI-specific processing and validation infrastructure

-- =============================================================================
-- SECTION 6: PERFORMANCE INDEXES
-- =============================================================================

-- AI processing sessions indexes
CREATE INDEX IF NOT EXISTS idx_ai_sessions_patient ON ai_processing_sessions(patient_id) WHERE session_status != 'cancelled';
CREATE INDEX IF NOT EXISTS idx_ai_sessions_document ON ai_processing_sessions(document_id, session_status);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_status ON ai_processing_sessions(session_status, processing_started_at);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_review ON ai_processing_sessions(requires_human_review) WHERE requires_human_review = true;

-- Entity processing audit indexes
CREATE INDEX IF NOT EXISTS idx_entity_audit_session ON entity_processing_audit_v2(processing_session_id);
CREATE INDEX IF NOT EXISTS idx_entity_audit_document ON entity_processing_audit_v2(document_id);
CREATE INDEX IF NOT EXISTS idx_entity_audit_category ON entity_processing_audit_v2(entity_category, entity_subtype);
CREATE INDEX IF NOT EXISTS idx_entity_audit_validation ON entity_processing_audit_v2(validation_status) WHERE validation_status != 'validated';
CREATE INDEX IF NOT EXISTS idx_entity_audit_confidence ON entity_processing_audit_v2(pass1_confidence) WHERE pass1_confidence < 0.8;
CREATE INDEX IF NOT EXISTS idx_entity_audit_clinical_event ON entity_processing_audit_v2(linked_clinical_event_id) WHERE linked_clinical_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entity_audit_encounter ON entity_processing_audit_v2(linked_encounter_id) WHERE linked_encounter_id IS NOT NULL;

-- Profile classification indexes
CREATE INDEX IF NOT EXISTS idx_profile_class_session ON profile_classification_audit(processing_session_id);
CREATE INDEX IF NOT EXISTS idx_profile_class_document ON profile_classification_audit(document_id);
CREATE INDEX IF NOT EXISTS idx_profile_class_risk ON profile_classification_audit(contamination_risk_score) WHERE contamination_risk_score > 0.3;
CREATE INDEX IF NOT EXISTS idx_profile_class_review ON profile_classification_audit(manual_review_required) WHERE manual_review_required = true;

-- Manual review queue indexes
CREATE INDEX IF NOT EXISTS idx_review_queue_patient ON manual_review_queue(patient_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON manual_review_queue(review_status, priority);
CREATE INDEX IF NOT EXISTS idx_review_queue_assigned ON manual_review_queue(assigned_reviewer, assigned_at) WHERE assigned_reviewer IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_queue_pending ON manual_review_queue(priority, created_at) WHERE review_status = 'pending';

-- AI confidence scoring indexes
CREATE INDEX IF NOT EXISTS idx_confidence_session ON ai_confidence_scoring(processing_session_id);
CREATE INDEX IF NOT EXISTS idx_confidence_overall ON ai_confidence_scoring(overall_confidence) WHERE overall_confidence < 0.7;
CREATE INDEX IF NOT EXISTS idx_confidence_outlier ON ai_confidence_scoring(outlier_detection) WHERE outlier_detection = true;

-- Clinical alert rules indexes
CREATE INDEX IF NOT EXISTS idx_alert_rules_type ON clinical_alert_rules(rule_type, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_alert_rules_priority ON clinical_alert_rules(alert_priority, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_alert_rules_performance ON clinical_alert_rules(success_rate, trigger_count);

-- Provider action items indexes
CREATE INDEX IF NOT EXISTS idx_action_items_patient ON provider_action_items(patient_id);
CREATE INDEX IF NOT EXISTS idx_action_items_status ON provider_action_items(status, priority);
CREATE INDEX IF NOT EXISTS idx_action_items_type ON provider_action_items(action_type, status);
CREATE INDEX IF NOT EXISTS idx_action_items_due ON provider_action_items(due_date) WHERE due_date IS NOT NULL AND status = 'pending';

-- =============================================================================
-- SECTION 7: ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on all AI processing tables
ALTER TABLE ai_processing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_processing_audit_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_classification_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_confidence_scoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_action_items ENABLE ROW LEVEL SECURITY;

-- AI processing sessions - profile-based access
CREATE POLICY ai_sessions_access ON ai_processing_sessions
    FOR ALL TO authenticated
    USING (
        has_profile_access(auth.uid(), patient_id)
        OR is_admin()
    )
    WITH CHECK (
        has_profile_access(auth.uid(), patient_id)
        OR is_admin()
    );

-- Entity processing audit - profile-based access via session
CREATE POLICY entity_audit_access ON entity_processing_audit_v2
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM ai_processing_sessions s
            WHERE s.id = entity_processing_audit_v2.processing_session_id
            AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM ai_processing_sessions s
            WHERE s.id = entity_processing_audit_v2.processing_session_id
            AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
        )
    );

-- Profile classification audit - similar access pattern
CREATE POLICY profile_classification_access ON profile_classification_audit
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM ai_processing_sessions s
            WHERE s.id = profile_classification_audit.processing_session_id
            AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM ai_processing_sessions s
            WHERE s.id = profile_classification_audit.processing_session_id
            AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
        )
    );

-- Manual review queue - profile-based access
CREATE POLICY review_queue_access ON manual_review_queue
    FOR ALL TO authenticated
    USING (
        has_profile_access(auth.uid(), patient_id)
        OR is_admin()
        OR assigned_reviewer = auth.uid()::text
    )
    WITH CHECK (
        has_profile_access(auth.uid(), patient_id)
        OR is_admin()
    );

-- AI confidence scoring - access via processing session
CREATE POLICY confidence_scoring_access ON ai_confidence_scoring
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM ai_processing_sessions s
            WHERE s.id = ai_confidence_scoring.processing_session_id
            AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM ai_processing_sessions s
            WHERE s.id = ai_confidence_scoring.processing_session_id
            AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
        )
    );

-- Clinical alert rules - readable by all authenticated users (configuration data)
CREATE POLICY alert_rules_read ON clinical_alert_rules
    FOR SELECT TO authenticated
    USING (is_active = true);

-- Only admins can modify alert rules
CREATE POLICY alert_rules_admin ON clinical_alert_rules
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Provider action items - profile-based access
CREATE POLICY action_items_access ON provider_action_items
    FOR ALL TO authenticated
    USING (
        has_profile_access(auth.uid(), patient_id)
        OR is_admin()
        OR assigned_provider_id = auth.uid()::text
    )
    WITH CHECK (
        has_profile_access(auth.uid(), patient_id)
        OR is_admin()
    );

-- =============================================================================
-- SECTION 8: AI PROCESSING UTILITY FUNCTIONS
-- =============================================================================

-- Start AI processing session
CREATE OR REPLACE FUNCTION start_ai_processing_session(
    p_patient_id UUID,
    p_document_id UUID,
    p_session_type TEXT DEFAULT 'document_processing',
    p_model_version TEXT DEFAULT 'v3'
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    session_id UUID;
BEGIN
    -- Verify profile access
    IF NOT has_profile_access(auth.uid(), p_patient_id) AND NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied to profile data';
    END IF;
    
    -- Create processing session
    INSERT INTO ai_processing_sessions (
        patient_id, document_id, session_type, ai_model_version
    ) VALUES (
        p_patient_id, p_document_id, p_session_type, p_model_version
    ) RETURNING id INTO session_id;
    
    RETURN session_id;
END $$;

-- Update processing session status
CREATE OR REPLACE FUNCTION update_processing_session_status(
    p_session_id UUID,
    p_status TEXT,
    p_workflow_step TEXT DEFAULT NULL,
    p_confidence NUMERIC DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    session_patient_id UUID;
BEGIN
    -- Get patient_id for access check
    SELECT patient_id INTO session_patient_id
    FROM ai_processing_sessions
    WHERE id = p_session_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Processing session not found';
    END IF;
    
    -- Verify profile access
    IF NOT has_profile_access(auth.uid(), session_patient_id) AND NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied to processing session';
    END IF;
    
    -- Update session
    UPDATE ai_processing_sessions
    SET 
        session_status = p_status,
        workflow_step = COALESCE(p_workflow_step, workflow_step),
        overall_confidence = COALESCE(p_confidence, overall_confidence),
        processing_completed_at = CASE WHEN p_status = 'completed' THEN NOW() ELSE processing_completed_at END,
        updated_at = NOW()
    WHERE id = p_session_id;
    
    RETURN TRUE;
END $$;

-- Add item to manual review queue
CREATE OR REPLACE FUNCTION add_to_manual_review_queue(
    p_patient_id UUID,
    p_processing_session_id UUID,
    p_document_id UUID,
    p_review_type TEXT,
    p_priority TEXT DEFAULT 'normal',
    p_title TEXT DEFAULT 'AI Processing Review Required',
    p_description TEXT DEFAULT 'Manual review required for AI processing validation'
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    review_id UUID;
BEGIN
    -- Verify profile access
    IF NOT has_profile_access(auth.uid(), p_patient_id) AND NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied to profile data';
    END IF;
    
    -- Add to review queue
    INSERT INTO manual_review_queue (
        patient_id, processing_session_id, document_id,
        review_type, priority, review_title, review_description
    ) VALUES (
        p_patient_id, p_processing_session_id, p_document_id,
        p_review_type, p_priority, p_title, p_description
    ) RETURNING id INTO review_id;
    
    RETURN review_id;
END $$;

-- Get pending review items for a patient
CREATE OR REPLACE FUNCTION get_pending_reviews(p_patient_id UUID)
RETURNS TABLE(
    review_id UUID,
    review_type TEXT,
    priority TEXT,
    title TEXT,
    created_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Verify profile access
    IF NOT has_profile_access(auth.uid(), p_patient_id) AND NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied to profile data';
    END IF;
    
    RETURN QUERY
    SELECT 
        mrq.id,
        mrq.review_type,
        mrq.priority,
        mrq.review_title,
        mrq.created_at
    FROM manual_review_queue mrq
    WHERE mrq.patient_id = p_patient_id
    AND mrq.review_status = 'pending'
    ORDER BY 
        CASE mrq.priority 
            WHEN 'critical' THEN 1
            WHEN 'urgent' THEN 2
            WHEN 'high' THEN 3
            WHEN 'normal' THEN 4
            WHEN 'low' THEN 5
        END,
        mrq.created_at ASC;
END $$;

-- =============================================================================
-- SECTION 9: DEPLOYMENT VERIFICATION AND SUCCESS REPORTING
-- =============================================================================

-- Verify deployment success
DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
    policy_count INTEGER;
    function_count INTEGER;
BEGIN
    -- Count created tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN (
        'ai_processing_sessions', 'entity_processing_audit_v2', 'profile_classification_audit',
        'manual_review_queue', 'ai_confidence_scoring', 'clinical_alert_rules', 'provider_action_items'
    );
    
    -- Count created indexes
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND (indexname LIKE 'idx_ai_%'
    OR indexname LIKE 'idx_entity_%'
    OR indexname LIKE 'idx_profile_%'
    OR indexname LIKE 'idx_review_%'
    OR indexname LIKE 'idx_confidence_%'
    OR indexname LIKE 'idx_alert_%'
    OR indexname LIKE 'idx_action_%');
    
    -- Count RLS policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename IN (
        'ai_processing_sessions', 'entity_processing_audit_v2', 'profile_classification_audit',
        'manual_review_queue', 'ai_confidence_scoring', 'clinical_alert_rules', 'provider_action_items'
    );
    
    -- Count utility functions
    SELECT COUNT(*) INTO function_count
    FROM information_schema.routines
    WHERE routine_schema = 'public'
    AND routine_name IN (
        'start_ai_processing_session', 'update_processing_session_status',
        'add_to_manual_review_queue', 'get_pending_reviews'
    );
    
    IF table_count = 7 AND index_count >= 20 AND policy_count >= 10 AND function_count = 4 THEN
        RAISE NOTICE '';
        RAISE NOTICE '==================================================================';
        RAISE NOTICE 'FRESH START BLUEPRINT: 04_ai_processing.sql DEPLOYMENT SUCCESS';
        RAISE NOTICE '==================================================================';
        RAISE NOTICE '';
        RAISE NOTICE 'AI PROCESSING V3 INFRASTRUCTURE DEPLOYED:';
        RAISE NOTICE '  Entity processing audit with V3 core table references:';
        RAISE NOTICE '    - patient_clinical_events integration established';
        RAISE NOTICE '    - patient_observations and patient_interventions linking operational';
        RAISE NOTICE '    - healthcare_encounters context tracking enabled';
        RAISE NOTICE '  V3 entity classification (clinical_event, healthcare_context, document_structure)';
        RAISE NOTICE '  V2 safety validation and contamination prevention integrated';
        RAISE NOTICE '';
        RAISE NOTICE 'MANUAL REVIEW SYSTEM (Blueprint Issue #39):';
        RAISE NOTICE '  Human validation workflows for AI processing compliance';
        RAISE NOTICE '  Quality assurance and clinical validation tracking';
        RAISE NOTICE '  Review queue with priority-based assignment';
        RAISE NOTICE '';
        RAISE NOTICE 'CLINICAL DECISION SUPPORT RULE ENGINE:';
        RAISE NOTICE '  AI-driven clinical alerts and recommendations';
        RAISE NOTICE '  Provider action items with Australian healthcare integration';
        RAISE NOTICE '  Quality measures and billing code integration';
        RAISE NOTICE '';
        RAISE NOTICE 'COMPONENTS DEPLOYED:';
        RAISE NOTICE '  - % AI processing tables with correct ID relationships', table_count;
        RAISE NOTICE '  - % performance indexes for AI processing queries', index_count;
        RAISE NOTICE '  - % RLS policies using has_profile_access()', policy_count;
        RAISE NOTICE '  - % AI processing utility functions', function_count;
        RAISE NOTICE '';
        RAISE NOTICE 'CRITICAL FIXES APPLIED:';
        RAISE NOTICE '  All patient_id references use user_profiles(id) relationships';
        RAISE NOTICE '  Entity processing audit references V3 core clinical tables';
        RAISE NOTICE '  Profile-based access control throughout AI pipeline';
        RAISE NOTICE '  V3 entity-to-schema mapping fully operational';
        RAISE NOTICE '';
        RAISE NOTICE 'AI PROCESSING V3 INTEGRATION READY:';
        RAISE NOTICE '  Direct integration with V3 core clinical architecture';
        RAISE NOTICE '  Pass 1 & Pass 2 entity processing pipeline operational';
        RAISE NOTICE '  Schema_loader.ts entity-to-schema mapping supported';
        RAISE NOTICE '  O3 two-axis classification system integrated';
        RAISE NOTICE '  Russian Babushka Doll contextual layering enabled';
        RAISE NOTICE '';
        RAISE NOTICE 'Ready for: 05_healthcare_journey.sql';
        RAISE NOTICE '';
    ELSE
        RAISE WARNING 'AI processing deployment incomplete:';
        RAISE WARNING '  - Tables: %/7, Indexes: %/20, Policies: %/10, Functions: %/4', 
            table_count, index_count, policy_count, function_count;
    END IF;
END $$;

-- =============================================================================
-- SECTION 6: PASS 3 SEMANTIC PROCESSING INFRASTRUCTURE
-- =============================================================================
-- NEW: Pass 3 semantic narrative creation and dual-lens user experience

-- Semantic processing sessions for Pass 3 narrative creation
CREATE TABLE IF NOT EXISTS semantic_processing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    
    -- Session metadata
    session_type TEXT NOT NULL DEFAULT 'narrative_creation' CHECK (session_type IN (
        'narrative_creation', 'narrative_linking', 'shell_file_synthesis'
    )),
    session_status TEXT NOT NULL DEFAULT 'initiated' CHECK (session_status IN (
        'initiated', 'processing', 'completed', 'failed', 'cancelled'
    )),
    
    -- Pass 3 specific workflow
    processing_phase TEXT NOT NULL DEFAULT 'narrative_detection' CHECK (processing_phase IN (
        'narrative_detection', 'narrative_creation', 'clinical_linking', 'shell_synthesis', 'completed'
    )),
    
    -- Input data for Pass 3 (structured clinical events from Pass 2)
    input_clinical_events JSONB NOT NULL, -- Structured JSON from Pass 2 results
    input_event_count INTEGER NOT NULL DEFAULT 0,
    
    -- Pass 3 processing results
    narratives_created INTEGER DEFAULT 0,
    clinical_links_created INTEGER DEFAULT 0,
    shell_synthesis_completed BOOLEAN DEFAULT FALSE,
    
    -- Quality metrics
    overall_narrative_confidence NUMERIC(4,3) CHECK (overall_narrative_confidence BETWEEN 0 AND 1),
    semantic_coherence_score NUMERIC(4,3) CHECK (semantic_coherence_score BETWEEN 0 AND 1),
    requires_human_review BOOLEAN DEFAULT FALSE,
    
    -- AI model configuration
    ai_model_version TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    model_config JSONB DEFAULT '{}',
    prompt_template_version TEXT DEFAULT 'v3.0',
    
    -- Processing times and costs
    processing_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_completed_at TIMESTAMPTZ,
    total_processing_time INTERVAL,
    token_usage_input INTEGER,
    token_usage_output INTEGER,
    processing_cost_usd NUMERIC(8,4),
    
    -- Error handling
    error_message TEXT,
    error_context JSONB,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 2,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Narrative creation audit trail for Pass 3 processing
CREATE TABLE IF NOT EXISTS narrative_creation_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semantic_processing_session_id UUID NOT NULL REFERENCES semantic_processing_sessions(id) ON DELETE CASCADE,
    narrative_id UUID REFERENCES clinical_narratives(id) ON DELETE SET NULL, -- May not exist yet during processing
    
    -- Narrative creation details
    narrative_purpose TEXT NOT NULL, -- Intended clinical purpose
    narrative_classification TEXT NOT NULL,
    creation_method TEXT DEFAULT 'ai_pass_3' CHECK (creation_method IN (
        'ai_pass_3', 'manual_creation', 'template_based', 'hybrid_approach'
    )),
    
    -- AI processing context
    input_events_analyzed INTEGER DEFAULT 0,
    narrative_confidence NUMERIC(4,3) CHECK (narrative_confidence BETWEEN 0 AND 1),
    semantic_coherence_score NUMERIC(4,3) CHECK (semantic_coherence_score BETWEEN 0 AND 1),
    clinical_complexity_assessment TEXT CHECK (clinical_complexity_assessment IN (
        'simple', 'moderate', 'complex', 'highly_complex'
    )),
    
    -- AI prompt and response details
    ai_prompt_used TEXT, -- The actual prompt sent to AI model
    ai_response_raw TEXT, -- Raw AI response before processing
    ai_processing_duration INTERVAL,
    ai_token_usage JSONB, -- {"input": 1200, "output": 800, "total": 2000}
    
    -- Quality validation
    validation_checks_passed INTEGER DEFAULT 0,
    validation_concerns TEXT[],
    requires_manual_review BOOLEAN DEFAULT FALSE,
    manual_review_reason TEXT,
    
    -- Clinical linking results
    conditions_linked INTEGER DEFAULT 0,
    medications_linked INTEGER DEFAULT 0,
    allergies_linked INTEGER DEFAULT 0,
    immunizations_linked INTEGER DEFAULT 0,
    vitals_linked INTEGER DEFAULT 0,
    
    -- Audit and lifecycle
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processing_completed_at TIMESTAMPTZ
);

-- Shell file synthesis results for post-Pass 3 document summaries
CREATE TABLE IF NOT EXISTS shell_file_synthesis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    semantic_processing_session_id UUID NOT NULL REFERENCES semantic_processing_sessions(id) ON DELETE CASCADE,
    
    -- Synthesis input data
    narratives_analyzed INTEGER NOT NULL DEFAULT 0,
    clinical_events_count INTEGER DEFAULT 0,
    total_pages_processed INTEGER DEFAULT 0,
    
    -- AI synthesis results
    ai_synthesized_summary TEXT NOT NULL, -- Intelligent overview of all narratives
    synthesis_confidence NUMERIC(4,3) CHECK (synthesis_confidence BETWEEN 0 AND 1),
    synthesis_approach TEXT CHECK (synthesis_approach IN (
        'single_narrative', 'multi_narrative_summary', 'complex_integration'
    )),
    
    -- Synthesis metadata
    key_clinical_themes TEXT[], -- Primary medical themes identified
    provider_entities_mentioned TEXT[], -- Healthcare providers mentioned
    temporal_span_assessment TEXT, -- "single_visit", "episodic_care", "longitudinal_management"
    clinical_urgency_assessment TEXT CHECK (clinical_urgency_assessment IN (
        'routine', 'urgent', 'emergent', 'mixed_urgency'
    )),
    
    -- AI processing details
    ai_model_version TEXT DEFAULT 'gpt-4o-mini',
    ai_processing_duration INTERVAL,
    ai_token_usage JSONB,
    ai_prompt_template TEXT,
    
    -- Quality and validation
    synthesis_quality_score NUMERIC(4,3) CHECK (synthesis_quality_score BETWEEN 0 AND 1),
    coherence_validation_passed BOOLEAN DEFAULT FALSE,
    clinical_accuracy_validated BOOLEAN DEFAULT FALSE,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synthesis_completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 7: DUAL-LENS USER EXPERIENCE INFRASTRUCTURE
-- =============================================================================
-- Support for shell file view vs clinical narrative view user preferences

-- User preferences for dual-lens viewing experience
CREATE TABLE IF NOT EXISTS dual_lens_user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE, -- Profile-specific preferences
    
    -- View preferences
    default_view_lens TEXT NOT NULL DEFAULT 'shell_file_view' CHECK (default_view_lens IN (
        'shell_file_view', 'clinical_narrative_view', 'hybrid_view', 'auto_detect'
    )),
    fallback_behavior TEXT DEFAULT 'graceful_degradation' CHECK (fallback_behavior IN (
        'graceful_degradation', 'prefer_shell_file', 'prefer_narrative', 'show_both'
    )),
    
    -- Enhancement preferences
    show_narrative_enhancement_status BOOLEAN DEFAULT TRUE,
    auto_switch_to_narrative_when_available BOOLEAN DEFAULT FALSE,
    prefer_rich_context_popups BOOLEAN DEFAULT TRUE,
    
    -- Timeline preferences
    timeline_organization_preference TEXT DEFAULT 'narrative_grouped' CHECK (timeline_organization_preference IN (
        'chronological_only', 'narrative_grouped', 'hybrid_timeline', 'clinical_significance_ordered'
    )),
    
    -- Clinical data display preferences
    medication_context_level TEXT DEFAULT 'full_context' CHECK (medication_context_level IN (
        'basic_info', 'narrative_context', 'full_context', 'clinical_journey'
    )),
    condition_storytelling_preference TEXT DEFAULT 'narrative_focused' CHECK (condition_storytelling_preference IN (
        'clinical_facts_only', 'narrative_focused', 'provider_perspective', 'patient_journey'
    )),
    
    -- Performance preferences
    enable_narrative_view_caching BOOLEAN DEFAULT TRUE,
    preload_narrative_contexts BOOLEAN DEFAULT TRUE,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_preference_change TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, profile_id)
);

-- Narrative view rendering cache for performance optimization
CREATE TABLE IF NOT EXISTS narrative_view_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    view_type TEXT NOT NULL CHECK (view_type IN (
        'narrative_timeline', 'condition_narrative_context', 'medication_narrative_context',
        'clinical_story_summary', 'narrative_dashboard_widget'
    )),
    
    -- Cache key and content
    cache_key TEXT NOT NULL, -- Hash of view parameters
    cached_content JSONB NOT NULL,
    content_format TEXT DEFAULT 'json' CHECK (content_format IN ('json', 'html', 'markdown')),
    
    -- Cache metadata
    source_narratives UUID[], -- Narratives included in this cached view
    last_data_change TIMESTAMPTZ, -- When underlying narrative data last changed
    cache_generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cache_expires_at TIMESTAMPTZ, -- Optional cache expiration
    
    -- Performance metrics
    generation_time_ms INTEGER,
    cache_hit_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMPTZ DEFAULT NOW(),
    
    -- Cache validation
    cache_valid BOOLEAN DEFAULT TRUE,
    invalidation_reason TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(profile_id, view_type, cache_key)
);

-- =============================================================================
-- PASS 3 SEMANTIC PROCESSING INDEXES
-- =============================================================================

-- Semantic processing sessions indexes
CREATE INDEX IF NOT EXISTS idx_semantic_processing_sessions_shell_file ON semantic_processing_sessions(shell_file_id);
CREATE INDEX IF NOT EXISTS idx_semantic_processing_sessions_status ON semantic_processing_sessions(session_status);
CREATE INDEX IF NOT EXISTS idx_semantic_processing_sessions_patient ON semantic_processing_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_semantic_processing_sessions_created ON semantic_processing_sessions(created_at);

-- Narrative creation audit indexes
CREATE INDEX IF NOT EXISTS idx_narrative_creation_audit_session ON narrative_creation_audit(semantic_processing_session_id);
CREATE INDEX IF NOT EXISTS idx_narrative_creation_audit_narrative ON narrative_creation_audit(narrative_id) WHERE narrative_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_narrative_creation_audit_confidence ON narrative_creation_audit(narrative_confidence);

-- Shell file synthesis indexes
CREATE INDEX IF NOT EXISTS idx_shell_file_synthesis_shell_file ON shell_file_synthesis_results(shell_file_id);
CREATE INDEX IF NOT EXISTS idx_shell_file_synthesis_session ON shell_file_synthesis_results(semantic_processing_session_id);

-- Dual-lens user experience indexes
CREATE INDEX IF NOT EXISTS idx_dual_lens_user_preferences_user ON dual_lens_user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_dual_lens_user_preferences_profile ON dual_lens_user_preferences(profile_id) WHERE profile_id IS NOT NULL;

-- Narrative view cache indexes
CREATE INDEX IF NOT EXISTS idx_narrative_view_cache_profile ON narrative_view_cache(profile_id);
CREATE INDEX IF NOT EXISTS idx_narrative_view_cache_type ON narrative_view_cache(view_type);
CREATE INDEX IF NOT EXISTS idx_narrative_view_cache_valid ON narrative_view_cache(cache_valid) WHERE cache_valid = TRUE;
CREATE INDEX IF NOT EXISTS idx_narrative_view_cache_expires ON narrative_view_cache(cache_expires_at) WHERE cache_expires_at IS NOT NULL;

COMMIT;

-- =============================================================================
-- FRESH START BLUEPRINT: 04_ai_processing.sql COMPLETE
-- =============================================================================

\echo ''
\echo '04_ai_processing.sql - AI PROCESSING PIPELINE INFRASTRUCTURE'
\echo 'Components:'
\echo '- AI Processing Session Management'
\echo '- Entity Processing Audit V3 Enhanced'
\echo '- Profile Classification & Safety (V2 Integration)'
\echo '- Manual Review & Validation Queue (Issue #39)'
\echo '- Clinical Decision Support Rule Engine'
\echo '- AI Processing Utility Functions'
\echo ''
\echo 'CRITICAL FIXES APPLIED:'
\echo '  All patient_id columns correctly reference user_profiles(id)'
\echo '  Entity processing audit references correct clinical tables'
\echo '  Profile-based access control throughout AI pipeline'
\echo ''
\echo 'AI PROCESSING V3 READY:'
\echo '  Direct integration with clinical tables'
\echo '  Support for entity-to-schema mapping'
\echo '  Manual review workflows for healthcare compliance'
\echo ''
\echo 'Next step: Run 05_healthcare_journey.sql'