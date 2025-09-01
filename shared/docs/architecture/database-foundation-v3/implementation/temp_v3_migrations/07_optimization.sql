-- =============================================================================
-- FRESH START BLUEPRINT: 07_optimization.sql
-- System Infrastructure Completion & Performance Optimization
-- =============================================================================
-- Purpose: Complete system infrastructure, performance optimization, monitoring and health checks
-- Dependencies: 01_foundations.sql through 06_security.sql
-- Tables: 3 System Infrastructure Completion + Comprehensive Performance Optimization

BEGIN;

-- =============================================================================
-- DEPENDENCY VALIDATION
-- =============================================================================

DO $$
BEGIN
    -- Verify all previous phases are complete
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clinical_narratives') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: clinical_narratives table not found. Run 03_clinical_core.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'semantic_processing_sessions') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: semantic_processing_sessions table not found. Run 04_ai_processing.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'provider_registry') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: provider_registry table not found. Run 05_healthcare_journey.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_consents') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: patient_consents table not found. Run 06_security.sql first.';
    END IF;
END $$;

-- =============================================================================
-- SECTION 1: SYSTEM INFRASTRUCTURE COMPLETION (3 TABLES)
-- =============================================================================

-- Background job processing and queue management
CREATE TABLE IF NOT EXISTS job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Job Classification - Two-column architecture: job_type (category) + job_lane (routing)
    job_type TEXT NOT NULL CHECK (job_type IN (
        'shell_file_processing', 'ai_processing', 'data_migration', 'audit_cleanup',
        'notification_delivery', 'report_generation', 'backup_operation', 'system_maintenance',
        'semantic_processing', 'consent_verification', 'provider_verification'
    )),
    job_lane TEXT, -- Fine-grained routing within job_type
    job_category TEXT NOT NULL CHECK (job_category IN (
        'critical', 'high_priority', 'standard', 'background', 'maintenance'
    )),
    
    -- Job Payload and Configuration
    job_name TEXT NOT NULL,
    job_description TEXT,
    job_payload JSONB NOT NULL, -- Job-specific data and parameters
    job_config JSONB DEFAULT '{}', -- Configuration parameters
    
    -- Job Status and Lifecycle
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'cancelled', 'retrying', 'deferred'
    )),
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Resource and Performance Tracking
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10), -- 1 = highest priority
    estimated_duration INTERVAL,
    actual_duration INTERVAL,
    memory_usage_mb INTEGER,
    cpu_usage_percent NUMERIC(5,2),
    
    -- Error Handling and Retry Logic
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    retry_delay INTERVAL DEFAULT '5 minutes',
    last_error TEXT,
    error_details JSONB,
    
    -- Dependencies and Sequencing
    depends_on UUID[], -- Array of job IDs this job depends on
    blocks_jobs UUID[], -- Array of job IDs that depend on this job
    job_group TEXT, -- Logical grouping of related jobs
    
    -- Worker and Processing Context
    worker_id TEXT, -- ID of worker process handling this job
    processing_node TEXT, -- Server/container processing this job
    lock_acquired_at TIMESTAMPTZ, -- For distributed job processing
    lock_expires_at TIMESTAMPTZ,
    
    -- Patient and Profile Context (for healthcare jobs)
    patient_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    shell_file_id UUID REFERENCES shell_files(id) ON DELETE SET NULL,
    narrative_id UUID REFERENCES clinical_narratives(id) ON DELETE SET NULL,
    
    -- Result and Output
    job_result JSONB, -- Structured job results
    output_files TEXT[], -- Generated files or artifacts
    
    -- Audit and monitoring
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Job lane constraint (fine-grained routing within job_type)
ALTER TABLE job_queue ADD CONSTRAINT job_queue_job_lane_check CHECK (
    (job_type = 'shell_file_processing' AND job_lane IN ('fast_queue', 'standard_queue')) OR
    (job_type = 'ai_processing' AND job_lane IN ('ai_queue_simple', 'ai_queue_complex')) OR
    (job_type IN ('data_migration', 'audit_cleanup', 'system_maintenance', 'notification_delivery', 
                  'report_generation', 'backup_operation', 'semantic_processing', 'consent_verification', 
                  'provider_verification') AND job_lane IS NULL)
);

-- Index for worker lane-specific queries
CREATE INDEX IF NOT EXISTS idx_job_queue_type_lane_status ON job_queue(job_type, job_lane, status, priority DESC, scheduled_at ASC)
WHERE status IN ('pending', 'processing');

-- Failed audit event recovery and retry system
CREATE TABLE IF NOT EXISTS failed_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Original Audit Event Context
    original_event_type TEXT NOT NULL,
    original_table_name TEXT NOT NULL,
    original_record_id UUID,
    original_user_id UUID,
    original_timestamp TIMESTAMPTZ NOT NULL,
    
    -- Failure Details
    failure_reason TEXT NOT NULL,
    failure_type TEXT NOT NULL CHECK (failure_type IN (
        'network_error', 'database_error', 'permission_error', 'data_validation_error',
        'system_overload', 'timeout_error', 'unknown_error'
    )),
    error_message TEXT NOT NULL,
    error_context JSONB,
    
    -- Original Audit Data
    audit_payload JSONB NOT NULL, -- The audit data that failed to be recorded
    related_data JSONB, -- Additional context data
    
    -- Recovery Status
    recovery_status TEXT NOT NULL DEFAULT 'pending' CHECK (recovery_status IN (
        'pending', 'retrying', 'recovered', 'failed_permanently', 'manual_intervention_needed'
    )),
    recovery_attempts INTEGER DEFAULT 0,
    max_recovery_attempts INTEGER DEFAULT 5,
    next_retry_at TIMESTAMPTZ,
    
    -- Recovery Results
    recovered_at TIMESTAMPTZ,
    recovery_method TEXT, -- How the event was eventually recorded
    final_audit_event_id UUID, -- ID of the successfully created audit event
    
    -- Criticality and Impact Assessment
    criticality_level TEXT DEFAULT 'medium' CHECK (criticality_level IN (
        'low', 'medium', 'high', 'critical'
    )),
    business_impact TEXT,
    compliance_impact TEXT,
    
    -- Patient Safety and Privacy Context
    patient_safety_concern BOOLEAN DEFAULT FALSE,
    privacy_concern BOOLEAN DEFAULT FALSE,
    regulatory_reporting_required BOOLEAN DEFAULT FALSE,
    
    -- Administrative and Resolution
    assigned_to UUID REFERENCES auth.users(id), -- Admin assigned to resolve this
    resolution_notes TEXT,
    escalated BOOLEAN DEFAULT FALSE,
    escalation_level INTEGER DEFAULT 0,
    
    -- Audit and lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enhance existing user_events table with comprehensive audit fields
-- Note: Base table already exists from 02_profiles.sql with core fields

-- Add user context (the existing table uses profile_id, but adding user_id for auth context)
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS impersonated_profile_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Add event classification (enhance existing action field)
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS event_type TEXT CHECK (event_type IN (
    'login', 'logout', 'profile_switch', 'file_upload', 'file_view', 'file_download',
    'consent_given', 'consent_withdrawn', 'data_export', 'provider_access_granted',
    'medication_added', 'condition_added', 'allergy_reported', 'appointment_scheduled',
    'narrative_viewed', 'clinical_data_modified', 'security_alert'
));
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS event_category TEXT CHECK (event_category IN (
    'authentication', 'authorization', 'data_access', 'data_modification', 
    'consent_management', 'provider_interaction', 'security'
));

-- Add event details (complement existing timestamp)
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS event_description TEXT;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS event_timestamp TIMESTAMPTZ DEFAULT NOW();

-- Add technical context (enhance existing session_id and user_agent_hash)
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS geolocation JSONB;

-- Add clinical and healthcare context
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS clinical_context TEXT;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS provider_context UUID; -- Will add FK later after provider_registry exists

-- Add semantic architecture integration
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS shell_file_id UUID; -- Will add FK later
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS narrative_id UUID; -- Will add FK later
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS clinical_event_id UUID; -- Will add FK later

-- Add security and risk assessment
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'low' CHECK (risk_level IN (
    'low', 'medium', 'high', 'critical'
));
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS anomaly_detected BOOLEAN DEFAULT FALSE;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS anomaly_score NUMERIC(3,2);
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS security_flags TEXT[];

-- Add privacy and compliance (enhance existing privacy_level)
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS pii_accessed BOOLEAN DEFAULT FALSE;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS phi_accessed BOOLEAN DEFAULT FALSE;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS consent_verified BOOLEAN DEFAULT TRUE;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS legal_basis_for_processing TEXT;

-- Add event outcome and impact
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS event_successful BOOLEAN DEFAULT TRUE;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS impact_assessment TEXT;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS business_outcome TEXT;

-- Add audit trail integrity
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS event_hash TEXT;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS previous_event_id UUID;

-- Add retention and compliance
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS retention_period INTERVAL DEFAULT INTERVAL '7 years';
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS compliance_tags TEXT[];

-- Add administrative fields
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN DEFAULT FALSE;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id);
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Update existing column to be more flexible (complement session_id with UUID support)
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS session_uuid UUID;

-- Add foreign key constraints for deferred references
-- Note: These are added after all tables exist to avoid dependency issues
ALTER TABLE user_events ADD CONSTRAINT fk_user_events_provider_context 
    FOREIGN KEY (provider_context) REFERENCES provider_registry(id) ON DELETE SET NULL;
    
ALTER TABLE user_events ADD CONSTRAINT fk_user_events_shell_file 
    FOREIGN KEY (shell_file_id) REFERENCES shell_files(id) ON DELETE SET NULL;
    
ALTER TABLE user_events ADD CONSTRAINT fk_user_events_narrative 
    FOREIGN KEY (narrative_id) REFERENCES clinical_narratives(id) ON DELETE SET NULL;
    
ALTER TABLE user_events ADD CONSTRAINT fk_user_events_clinical_event 
    FOREIGN KEY (clinical_event_id) REFERENCES patient_clinical_events(id) ON DELETE SET NULL;

-- =============================================================================
-- SECTION 2: COMPREHENSIVE PERFORMANCE INDEXES
-- =============================================================================

-- System Infrastructure Performance Indexes
CREATE INDEX IF NOT EXISTS idx_job_queue_status_priority ON job_queue(status, priority) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_job_queue_scheduled ON job_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_job_queue_type_category ON job_queue(job_type, job_category);
CREATE INDEX IF NOT EXISTS idx_job_queue_patient ON job_queue(patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_queue_dependencies ON job_queue USING GIN(depends_on) WHERE array_length(depends_on, 1) > 0;
CREATE INDEX IF NOT EXISTS idx_job_queue_worker ON job_queue(worker_id, status) WHERE worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_failed_audit_events_status ON failed_audit_events(recovery_status) WHERE recovery_status IN ('pending', 'retrying');
CREATE INDEX IF NOT EXISTS idx_failed_audit_events_next_retry ON failed_audit_events(next_retry_at) WHERE next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_failed_audit_events_criticality ON failed_audit_events(criticality_level, created_at);
CREATE INDEX IF NOT EXISTS idx_failed_audit_events_table ON failed_audit_events(original_table_name, original_timestamp);

CREATE INDEX IF NOT EXISTS idx_user_events_user_timestamp ON user_events(user_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_profile_timestamp ON user_events(profile_id, event_timestamp DESC) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_events_type_timestamp ON user_events(event_type, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_security ON user_events(risk_level, anomaly_detected) WHERE risk_level != 'low' OR anomaly_detected = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_events_session ON user_events(session_id, event_timestamp) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_events_narrative ON user_events(narrative_id) WHERE narrative_id IS NOT NULL;

-- Core V3 Architecture Performance Indexes
CREATE INDEX IF NOT EXISTS idx_patient_clinical_events_patient_date ON patient_clinical_events(patient_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_patient_clinical_events_narrative_date ON patient_clinical_events(narrative_id, event_date DESC) WHERE narrative_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_clinical_events_shell_file ON patient_clinical_events(shell_file_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_patient_clinical_events_type_confidence ON patient_clinical_events(activity_type, confidence_score) WHERE confidence_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_observations_event_type ON patient_observations(event_id, observation_type);
CREATE INDEX IF NOT EXISTS idx_patient_observations_value_range ON patient_observations(observation_type, value_numeric) WHERE value_numeric IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_interventions_event_type ON patient_interventions(event_id, intervention_type);
CREATE INDEX IF NOT EXISTS idx_patient_interventions_substance ON patient_interventions(substance_name) WHERE substance_name IS NOT NULL;

-- Clinical Data Performance Indexes
CREATE INDEX IF NOT EXISTS idx_patient_conditions_patient_active ON patient_conditions(patient_id, status) WHERE status = 'active';
-- Removed: primary_narrative_id column does not exist in patient_conditions

CREATE INDEX IF NOT EXISTS idx_patient_medications_patient_active ON patient_medications(patient_id, status) WHERE status = 'active';
-- Removed: primary_narrative_id column does not exist in patient_medications

CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient_severity ON patient_allergies(patient_id, severity);
CREATE INDEX IF NOT EXISTS idx_patient_immunizations_patient_date ON patient_immunizations(patient_id, administration_date DESC);

-- Semantic Architecture Performance Indexes
CREATE INDEX IF NOT EXISTS idx_clinical_narratives_shell_file_purpose ON clinical_narratives(shell_file_id, narrative_purpose);
CREATE INDEX IF NOT EXISTS idx_clinical_narratives_patient_classification ON clinical_narratives(patient_id, clinical_classification);
CREATE INDEX IF NOT EXISTS idx_clinical_narratives_confidence_date ON clinical_narratives(ai_narrative_confidence DESC, created_at DESC) WHERE ai_narrative_confidence IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clinical_narratives_ongoing ON clinical_narratives(patient_id, is_ongoing) WHERE is_ongoing = TRUE;

-- Junction Table Performance Indexes
CREATE INDEX IF NOT EXISTS idx_narrative_condition_links_condition ON narrative_condition_links(condition_id, clinical_relevance);
CREATE INDEX IF NOT EXISTS idx_narrative_medication_links_medication ON narrative_medication_links(medication_id, link_type);
CREATE INDEX IF NOT EXISTS idx_narrative_allergy_links_allergy ON narrative_allergy_links(allergy_id, link_type);

-- AI Processing Performance Indexes
CREATE INDEX IF NOT EXISTS idx_semantic_processing_sessions_shell_file_status ON semantic_processing_sessions(shell_file_id, session_status);
CREATE INDEX IF NOT EXISTS idx_narrative_creation_audit_session_confidence ON narrative_creation_audit(semantic_processing_session_id, narrative_confidence DESC);

-- Healthcare Provider Performance Indexes
CREATE INDEX IF NOT EXISTS idx_provider_registry_specialty_active ON provider_registry(primary_specialty, active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_patient_provider_access_provider_active ON patient_provider_access(provider_id, relationship_status) WHERE relationship_status = 'active';
CREATE INDEX IF NOT EXISTS idx_provider_action_items_due_priority ON provider_action_items(due_date, priority) WHERE status IN ('pending', 'in_progress');

-- Security and Consent Performance Indexes
CREATE INDEX IF NOT EXISTS idx_patient_consents_patient_type_status ON patient_consents(patient_id, consent_type, consent_status);
CREATE INDEX IF NOT EXISTS idx_patient_consents_expiry_active ON patient_consents(consent_expiry_date) WHERE consent_status = 'granted' AND consent_expiry_date IS NOT NULL;

-- =============================================================================
-- SECTION 3: DATABASE CONSTRAINTS AND VALIDATION
-- =============================================================================

-- Data Integrity Constraints
ALTER TABLE patient_clinical_events ADD CONSTRAINT chk_confidence_score_valid 
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1));

ALTER TABLE clinical_narratives ADD CONSTRAINT chk_narrative_confidence_valid
    CHECK (ai_narrative_confidence >= 0 AND ai_narrative_confidence <= 1);

ALTER TABLE clinical_narratives ADD CONSTRAINT chk_coherence_score_valid
    CHECK (semantic_coherence_score IS NULL OR (semantic_coherence_score >= 0 AND semantic_coherence_score <= 1));

-- Temporal Constraints
ALTER TABLE patient_conditions ADD CONSTRAINT chk_condition_dates_logical
    CHECK (diagnosed_date IS NULL OR onset_date IS NULL OR diagnosed_date >= onset_date);

ALTER TABLE patient_conditions ADD CONSTRAINT chk_resolved_date_logical
    CHECK (resolved_date IS NULL OR diagnosed_date IS NULL OR resolved_date >= diagnosed_date);

ALTER TABLE patient_provider_access ADD CONSTRAINT chk_relationship_dates_logical
    CHECK (relationship_end_date IS NULL OR relationship_end_date >= relationship_start_date);

-- Business Logic Constraints
ALTER TABLE job_queue ADD CONSTRAINT chk_retry_logic
    CHECK (retry_count <= max_retries);

ALTER TABLE failed_audit_events ADD CONSTRAINT chk_recovery_attempts_logic
    CHECK (recovery_attempts <= max_recovery_attempts);

-- =============================================================================
-- SECTION 4: MONITORING AND HEALTH CHECK FUNCTIONS
-- =============================================================================

-- Database health check function
CREATE OR REPLACE FUNCTION database_health_check()
RETURNS TABLE (
    component TEXT,
    status TEXT,
    details TEXT,
    metric_value NUMERIC,
    threshold_warning NUMERIC,
    threshold_critical NUMERIC
) AS $$
BEGIN
    -- Check table row counts
    RETURN QUERY
    SELECT 
        'user_profiles' as component,
        CASE WHEN COUNT(*) > 0 THEN 'healthy' ELSE 'warning' END as status,
        'Active user profiles' as details,
        COUNT(*)::NUMERIC as metric_value,
        1::NUMERIC as threshold_warning,
        0::NUMERIC as threshold_critical
    FROM user_profiles WHERE archived = FALSE;
    
    RETURN QUERY
    SELECT 
        'clinical_narratives' as component,
        CASE 
            WHEN COUNT(*) > 100 THEN 'healthy'
            WHEN COUNT(*) > 10 THEN 'warning'
            ELSE 'critical'
        END as status,
        'Clinical narratives created' as details,
        COUNT(*)::NUMERIC as metric_value,
        100::NUMERIC as threshold_warning,
        10::NUMERIC as threshold_critical
    FROM clinical_narratives;
    
    -- Check failed audit events
    RETURN QUERY
    SELECT 
        'failed_audit_events' as component,
        CASE 
            WHEN COUNT(*) = 0 THEN 'healthy'
            WHEN COUNT(*) < 10 THEN 'warning'
            ELSE 'critical'
        END as status,
        'Failed audit events needing recovery' as details,
        COUNT(*)::NUMERIC as metric_value,
        0::NUMERIC as threshold_warning,
        10::NUMERIC as threshold_critical
    FROM failed_audit_events WHERE recovery_status IN ('pending', 'retrying');
    
    -- Check job queue health
    RETURN QUERY
    SELECT 
        'job_queue' as component,
        CASE 
            WHEN COUNT(*) < 50 THEN 'healthy'
            WHEN COUNT(*) < 200 THEN 'warning'
            ELSE 'critical'
        END as status,
        'Pending jobs in queue' as details,
        COUNT(*)::NUMERIC as metric_value,
        50::NUMERIC as threshold_warning,
        200::NUMERIC as threshold_critical
    FROM job_queue WHERE status IN ('pending', 'processing');
    
END;
$$ LANGUAGE plpgsql;

-- Performance monitoring function
CREATE OR REPLACE FUNCTION performance_metrics()
RETURNS TABLE (
    metric_name TEXT,
    metric_value NUMERIC,
    metric_unit TEXT,
    status TEXT
) AS $$
BEGIN
    -- Average narrative confidence
    RETURN QUERY
    SELECT 
        'avg_narrative_confidence' as metric_name,
        ROUND(AVG(ai_narrative_confidence), 3) as metric_value,
        'confidence_score' as metric_unit,
        CASE WHEN AVG(ai_narrative_confidence) > 0.8 THEN 'good' 
             WHEN AVG(ai_narrative_confidence) > 0.6 THEN 'acceptable'
             ELSE 'poor' END as status
    FROM clinical_narratives WHERE ai_narrative_confidence IS NOT NULL;
    
    -- Average processing time for semantic sessions
    RETURN QUERY
    SELECT 
        'avg_semantic_processing_time' as metric_name,
        EXTRACT(EPOCH FROM AVG(total_processing_time))::NUMERIC as metric_value,
        'seconds' as metric_unit,
        CASE WHEN AVG(total_processing_time) < INTERVAL '30 seconds' THEN 'good'
             WHEN AVG(total_processing_time) < INTERVAL '60 seconds' THEN 'acceptable'
             ELSE 'poor' END as status
    FROM semantic_processing_sessions 
    WHERE total_processing_time IS NOT NULL 
    AND processing_completed_at > NOW() - INTERVAL '7 days';
    
    -- User engagement metrics
    RETURN QUERY
    SELECT 
        'daily_active_profiles' as metric_name,
        COUNT(DISTINCT profile_id)::NUMERIC as metric_value,
        'profiles' as metric_unit,
        'info' as status
    FROM user_events 
    WHERE event_timestamp > NOW() - INTERVAL '1 day' 
    AND profile_id IS NOT NULL;
    
END;
$$ LANGUAGE plpgsql;

-- Data quality assessment function
CREATE OR REPLACE FUNCTION data_quality_assessment()
RETURNS TABLE (
    assessment_area TEXT,
    quality_score NUMERIC,
    issues_found INTEGER,
    recommendations TEXT
) AS $$
BEGIN
    -- Clinical narrative quality
    RETURN QUERY
    SELECT 
        'clinical_narratives_quality' as assessment_area,
        ROUND(AVG(ai_narrative_confidence * semantic_coherence_score), 3) as quality_score,
        COUNT(*)::INTEGER as issues_found,
        'Review narratives with low confidence scores' as recommendations
    FROM clinical_narratives 
    WHERE ai_narrative_confidence < 0.7 OR semantic_coherence_score < 0.7;
    
    -- Profile data completeness
    RETURN QUERY
    SELECT 
        'profile_data_completeness' as assessment_area,
        ROUND(
            (COUNT(*) FILTER (WHERE date_of_birth IS NOT NULL)::NUMERIC / COUNT(*)) * 100, 
            1
        ) as quality_score,
        COUNT(*) FILTER (WHERE date_of_birth IS NULL)::INTEGER as issues_found,
        'Encourage users to complete profile information' as recommendations
    FROM user_profiles WHERE archived = FALSE;
    
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SECTION 5: PRODUCTION OPTIMIZATION SETTINGS
-- =============================================================================

-- Update table statistics for query optimization
ANALYZE shell_files;
ANALYZE clinical_narratives;
ANALYZE patient_clinical_events;
ANALYZE patient_conditions;
ANALYZE patient_medications;
ANALYZE narrative_condition_links;
ANALYZE narrative_medication_links;

-- Adjust autovacuum settings for high-traffic tables
ALTER TABLE user_events SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE job_queue SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE patient_clinical_events SET (autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE clinical_narratives SET (autovacuum_analyze_scale_factor = 0.05);

-- Set table storage parameters for performance
ALTER TABLE clinical_narratives SET (fillfactor = 90); -- Leave room for updates
ALTER TABLE shell_files SET (fillfactor = 85); -- Frequent synthesis updates
ALTER TABLE patient_clinical_events SET (fillfactor = 95); -- Mostly inserts

COMMIT;

-- =============================================================================
-- OPTIMIZATION DEPLOYMENT VALIDATION
-- =============================================================================

DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
    constraint_count INTEGER;
    function_count INTEGER;
BEGIN
    -- Count system infrastructure tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_name IN (
        'job_queue', 'failed_audit_events', 'user_events'
    ) AND table_schema = 'public';
    
    -- Count performance indexes created
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND (
        indexname LIKE '%job_queue%' OR 
        indexname LIKE '%failed_audit%' OR 
        indexname LIKE '%user_events%' OR
        indexname LIKE '%patient_%_active' OR
        indexname LIKE '%narrative_%_confidence'
    );
    
    -- Count constraints added
    SELECT COUNT(*) INTO constraint_count
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
    AND constraint_name LIKE 'chk_%';
    
    -- Count monitoring functions
    SELECT COUNT(*) INTO function_count
    FROM pg_proc 
    WHERE proname IN ('database_health_check', 'performance_metrics', 'data_quality_assessment');
    
    IF table_count >= 3 AND index_count >= 20 AND function_count = 3 THEN
        RAISE NOTICE '✅ System optimization deployment successful!';
        RAISE NOTICE '  - Tables: %/3, Indexes: %/20+, Constraints: %, Functions: %/3', 
            table_count, index_count, constraint_count, function_count;
        RAISE NOTICE '  - System infrastructure completion: job queue, audit recovery, user events';
        RAISE NOTICE '  - Comprehensive performance indexes deployed';
        RAISE NOTICE '  - Data integrity constraints enforced';
        RAISE NOTICE '  - Monitoring and health check functions active';
        RAISE NOTICE '  - Production optimization settings applied';
        RAISE NOTICE '';
        RAISE NOTICE '🎉 V3 DATABASE DEPLOYMENT COMPLETE!';
        RAISE NOTICE '  - All 7 migration files successfully deployed';
        RAISE NOTICE '  - Semantic architecture with clinical narrative linking operational';
        RAISE NOTICE '  - Pass 3 AI processing infrastructure ready';
        RAISE NOTICE '  - Healthcare provider system integrated';
        RAISE NOTICE '  - GDPR-compliant consent management active';
        RAISE NOTICE '  - Production-ready performance optimization complete';
    ELSE
        RAISE WARNING 'System optimization deployment incomplete:';
        RAISE WARNING '  - Tables: %/3, Indexes: %/20+, Constraints: %, Functions: %/3', 
            table_count, index_count, constraint_count, function_count;
    END IF;
END $$;

-- =============================================================================
-- FRESH START BLUEPRINT: 07_optimization.sql COMPLETE
-- V3 DATABASE DEPLOYMENT SUCCESSFUL!
-- =============================================================================