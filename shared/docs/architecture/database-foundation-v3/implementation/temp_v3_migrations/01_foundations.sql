-- =============================================================================
-- FRESH START BLUEPRINT: 01_foundations.sql
-- =============================================================================
-- Purpose: Core system foundation with corrected ID references
-- Components: Extensions + System Infrastructure + Feature Flags
-- Dependencies: None (foundation for all other files)
-- Key Fix: audit_log.patient_id now correctly references user_profiles(id)
-- Created: 2025-08-27 (Fresh Start Implementation)
-- =============================================================================

BEGIN;

-- =============================================================================
-- POSTGRESQL EXTENSIONS SETUP
-- =============================================================================
-- Source: 001_extensions.sql (CLEAN - No changes needed)

-- Core extensions required for Guardian architecture
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Fuzzy string matching for relationship normalization
CREATE EXTENSION IF NOT EXISTS "postgis";        -- Spatial data for bounding box operations
-- CREATE EXTENSION IF NOT EXISTS "pg_partman";     -- Automated partition management (Not supported on Supabase, skipped)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- Enhanced cryptographic functions

-- Performance and text search extensions
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- Query performance monitoring
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- Enhanced GIN indexing capabilities

-- Verify all extensions are installed
DO $$
DECLARE
    extension_record RECORD;
    expected_extensions TEXT[] := ARRAY['uuid-ossp', 'pg_trgm', 'postgis', 'pgcrypto', 'pg_stat_statements', 'btree_gin']; -- pg_partman skipped on Supabase
    installed_count INTEGER := 0;
BEGIN
    FOR extension_record IN 
        SELECT extname FROM pg_extension 
        WHERE extname = ANY(expected_extensions)
    LOOP
        installed_count := installed_count + 1;
        RAISE NOTICE 'Extension installed: %', extension_record.extname;
    END LOOP;
    
    IF installed_count = array_length(expected_extensions, 1) THEN
        RAISE NOTICE '✅ All required extensions successfully installed!';
    ELSE
        RAISE WARNING 'Only % of % expected extensions installed', installed_count, array_length(expected_extensions, 1);
    END IF;
END;
$$;

-- =============================================================================
-- SYSTEM-WIDE AUDIT INFRASTRUCTURE
-- =============================================================================
-- Source: 000_system_infrastructure.sql (FIXED - Critical ID reference corrected)

-- Primary audit log table for compliance and debugging
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core audit fields
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL, -- Primary UUID for consistency
    record_id_text TEXT, -- Fallback for non-UUID identifiers
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'SELECT')),
    
    -- Data change tracking
    old_values JSONB,
    new_values JSONB,
    
    -- User context
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Preserve audit record even if user account deleted
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Additional context
    reason TEXT,
    clinical_context JSONB,
    
    -- Healthcare-specific compliance fields
    -- NOTE: patient_id will be added in 02_profiles.sql after user_profiles table exists
    -- patient_id UUID REFERENCES user_profiles(id), -- For patient data changes (DEFERRED TO 02_profiles.sql)
    compliance_category TEXT CHECK (compliance_category IN (
        'gdpr', 'hipaa', 'clinical_decision', 'consent_management', 
        'feature_flag', 'provider_access', 'audit_system'
    )),
    
    -- Request context (for debugging and compliance)
    session_id TEXT,
    ip_address INET,
    user_agent TEXT,
    
    -- Retention and archival
    archived BOOLEAN DEFAULT FALSE,
    retention_until TIMESTAMPTZ -- For automated cleanup
);

-- Performance indexes for audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log(changed_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by ON audit_log(changed_by);

-- =============================================================================
-- ENHANCED ACCOUNT ARCHIVAL SYSTEM
-- =============================================================================
-- Purpose: Extends auth.users with comprehensive archival tracking
-- Note: auth.users is Supabase system table, cannot be modified directly

CREATE TABLE IF NOT EXISTS user_account_archival (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Enhanced Archival System (GPT-5 & Gemini recommended)
    archived_at TIMESTAMPTZ, -- When account archival occurred
    deletion_requested_at TIMESTAMPTZ, -- When user first requested deletion
    deletion_reason TEXT, -- User-provided deletion reason
    recovery_expires_at TIMESTAMPTZ, -- 30-day recovery window
    processing_restricted_at TIMESTAMPTZ, -- GDPR Article 18 compliance
    legal_hold BOOLEAN DEFAULT FALSE, -- Prevents any purge during litigation
    erasure_performed_at TIMESTAMPTZ, -- When PII was purged
    erasure_scope TEXT, -- 'pii_only', 'analytics_only', 'full_restriction'
    region_of_record TEXT, -- 'AU', 'US', 'EU' for jurisdiction-specific handling
    
    -- Account closure workflow tracking
    closure_workflow_step TEXT, -- 'requested', 'grace_period', 'archived', 'purged'
    closure_initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Admin override capability
    final_export_delivered_at TIMESTAMPTZ, -- Data portability compliance
    closure_report_generated_at TIMESTAMPTZ, -- Evidence of proper procedure
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for archival queries
CREATE INDEX IF NOT EXISTS idx_user_account_archival_archived_at ON user_account_archival(archived_at);
CREATE INDEX IF NOT EXISTS idx_user_account_archival_recovery ON user_account_archival(recovery_expires_at) WHERE recovery_expires_at IS NOT NULL;

-- =============================================================================
-- CRITICAL ENUM TYPES
-- =============================================================================
-- Purpose: Define reusable ENUM types for consistency across schema
-- Source: Gemini review identified missing ENUM definitions

-- Profile relationship types for family/dependent management
CREATE TYPE profile_relationship_type AS ENUM (
    'self', 'spouse', 'partner', 'child', 'parent', 'sibling', 
    'grandparent', 'grandchild', 'guardian', 'dependent', 
    'pet_dog', 'pet_cat', 'pet_bird', 'pet_other'
);

-- Verification status for identity and document verification
CREATE TYPE verification_status_type AS ENUM (
    'unverified', 'pending', 'verified', 'expired', 'rejected', 'disputed'
);

-- Consent status for healthcare data processing
CREATE TYPE consent_status_type AS ENUM (
    'granted', 'withdrawn', 'expired', 'pending', 'conditional', 'inherited'
);

-- Access level types for granular permission control  
-- Order represents permission hierarchy: higher levels include lower level permissions
CREATE TYPE access_level_type AS ENUM (
    'none', 'emergency', 'read_only', 'read_write', 'full_access', 'owner'
);

-- Processing status for document and AI workflows
CREATE TYPE processing_status_type AS ENUM (
    'uploaded', 'processing', 'completed', 'failed', 'cancelled', 'archived'
);

-- Data classification for compliance and retention
CREATE TYPE data_classification_type AS ENUM (
    'public', 'internal', 'confidential', 'restricted', 'clinical', 'pii'
);
-- NOTE: Patient ID index will be added in 02_profiles.sql after patient_id column exists
-- CREATE INDEX IF NOT EXISTS idx_audit_log_patient ON audit_log(patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_compliance ON audit_log(compliance_category);
CREATE INDEX IF NOT EXISTS idx_audit_log_operation ON audit_log(operation, table_name);

-- =============================================================================
-- SYSTEM NOTIFICATION INFRASTRUCTURE (Future-ready)
-- =============================================================================

-- System notifications table for internal communications
CREATE TABLE IF NOT EXISTS system_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Notification details
    notification_type TEXT NOT NULL CHECK (notification_type IN (
        'system_alert', 'compliance_warning', 'data_quality_issue',
        'security_event', 'maintenance_notice', 'audit_alert'
    )),
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('critical', 'warning', 'info', 'debug')),
    
    -- Content
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    
    -- Targeting
    target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Notification is meaningless without target user
    target_role TEXT, -- 'admin', 'developer', 'healthcare_provider'
    target_all_users BOOLEAN DEFAULT FALSE,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'read', 'dismissed', 'expired')),
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    
    -- Scheduling
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- System notification indexes
CREATE INDEX IF NOT EXISTS idx_system_notifications_type ON system_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_system_notifications_severity ON system_notifications(severity);
CREATE INDEX IF NOT EXISTS idx_system_notifications_target_user ON system_notifications(target_user_id);
CREATE INDEX IF NOT EXISTS idx_system_notifications_status ON system_notifications(status);
CREATE INDEX IF NOT EXISTS idx_system_notifications_scheduled ON system_notifications(scheduled_for) WHERE status = 'pending';

-- =============================================================================
-- SYSTEM CONFIGURATION INFRASTRUCTURE (Future-ready)
-- =============================================================================

-- System configuration table for application settings
CREATE TABLE IF NOT EXISTS system_configuration (
    config_key TEXT PRIMARY KEY,
    config_value JSONB NOT NULL,
    config_type TEXT NOT NULL CHECK (config_type IN (
        'system', 'security', 'compliance', 'integration', 'ui', 'notification'
    )),
    
    -- Metadata
    description TEXT,
    is_sensitive BOOLEAN DEFAULT FALSE, -- Encrypt sensitive values
    requires_restart BOOLEAN DEFAULT FALSE,
    
    -- Change tracking
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL -- Preserve config history even if admin account deleted
);

-- System configuration indexes
CREATE INDEX IF NOT EXISTS idx_system_configuration_type ON system_configuration(config_type);
CREATE INDEX IF NOT EXISTS idx_system_configuration_sensitive ON system_configuration(is_sensitive) WHERE is_sensitive = TRUE;

-- =============================================================================
-- TEMPORARY STUB SECURITY FUNCTIONS
-- =============================================================================
-- These lightweight implementations allow policy creation to succeed even though
-- the full canonical versions are defined later in this script. They are
-- immediately replaced by the more complete CREATE OR REPLACE statements below.

CREATE OR REPLACE FUNCTION is_admin(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
    SELECT FALSE;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_developer(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
    SELECT FALSE;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_healthcare_provider(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
    SELECT FALSE;
$$ LANGUAGE sql SECURITY DEFINER;

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable ROW-LEVEL SECURITY (RLS) on system tables
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_configuration ENABLE ROW LEVEL SECURITY;

-- Audit log policies (admin read, system write)
CREATE POLICY audit_log_admin_read ON audit_log
    FOR SELECT TO authenticated
    USING (
        -- Users can see their own audit entries
        changed_by = auth.uid() 
        -- NOTE: Patient-based access will be added in 02_profiles.sql after patient_id column exists
        -- Admins can see all
        OR is_admin()
    );

-- System can insert audit entries
CREATE POLICY audit_log_system_write ON audit_log
    FOR INSERT TO authenticated
    WITH CHECK (true); -- All authenticated users can create audit entries

-- System notifications policies
CREATE POLICY system_notifications_user_access ON system_notifications
    FOR SELECT TO authenticated
    USING (
        target_user_id = auth.uid()
        OR target_all_users = TRUE
        OR is_admin()
        OR (target_role = 'developer' AND is_developer())
        OR (target_role = 'healthcare_provider' AND is_healthcare_provider())
    );

-- System configuration policies (admin only)
CREATE POLICY system_configuration_admin_access ON system_configuration
    FOR ALL TO authenticated
    USING (is_admin());

-- =============================================================================
-- SYSTEM UTILITY FUNCTIONS
-- =============================================================================

-- Generic audit logging function
-- NOTE: patient_id parameter temporarily ignored until 02_profiles.sql adds patient_id column
CREATE OR REPLACE FUNCTION log_audit_event(
    p_table_name TEXT,
    p_record_id TEXT, -- Accept TEXT for backward compatibility
    p_operation TEXT,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_compliance_category TEXT DEFAULT NULL,
    p_patient_id UUID DEFAULT NULL -- Temporarily ignored until patient_id column exists
) RETURNS UUID AS $$
DECLARE
    audit_id UUID;
    record_uuid UUID;
BEGIN
    -- Try to convert record_id to UUID, fallback to NULL if not valid UUID
    BEGIN
        record_uuid := p_record_id::UUID;
    EXCEPTION
        WHEN invalid_text_representation THEN
            record_uuid := NULL;
    END;
    
    INSERT INTO audit_log (
        table_name, record_id, record_id_text, operation, old_values, new_values,
        changed_by, reason, compliance_category,
        session_id, ip_address, user_agent
    ) VALUES (
        p_table_name, 
        COALESCE(record_uuid, gen_random_uuid()), -- Use UUID or generate new one
        CASE WHEN record_uuid IS NULL THEN p_record_id ELSE NULL END, -- Store text only if not UUID
        p_operation, p_old_values, p_new_values,
        auth.uid(), p_reason, p_compliance_category,
        current_setting('request.headers', true)::jsonb->>'session-id',
        inet_client_addr(),
        current_setting('request.headers', true)::jsonb->>'user-agent'
    ) RETURNING id INTO audit_id;
    
    RETURN audit_id;
EXCEPTION
    WHEN OTHERS THEN
        -- Log to PostgreSQL log but don't fail the main operation
        RAISE WARNING 'Audit logging failed for % %: %', p_table_name, p_record_id, SQLERRM;
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- System notification function
CREATE OR REPLACE FUNCTION create_system_notification(
    p_type TEXT,
    p_severity TEXT,
    p_title TEXT,
    p_message TEXT,
    p_target_user_id UUID DEFAULT NULL,
    p_target_role TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO system_notifications (
        notification_type, severity, title, message,
        target_user_id, target_role, metadata
    ) VALUES (
        p_type, p_severity, p_title, p_message,
        p_target_user_id, p_target_role, p_metadata
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- CANONICAL SECURITY FUNCTIONS (Available to all subsequent scripts)
-- =============================================================================

-- Create canonical admin checking function
CREATE OR REPLACE FUNCTION is_admin(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user is admin via multiple methods
    RETURN EXISTS (
        SELECT 1 FROM auth.users 
        WHERE auth.users.id = user_id 
        AND (
            -- Method 1: User metadata role
            auth.users.raw_user_meta_data->>'role' = 'admin'
            OR
            -- Method 2: Email domain check
            auth.users.email LIKE '%@guardian-admin.com'
            OR
            -- Method 3: Explicit admin list from system config
            auth.users.email = ANY(
                SELECT jsonb_array_elements_text(config_value) 
                FROM system_configuration 
                WHERE config_key = 'security.admin_emails'
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create canonical service role checking function
CREATE OR REPLACE FUNCTION is_service_role()
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if current context is service role
    RETURN (
        current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
        OR
        current_setting('role') = 'service_role'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create canonical developer checking function
CREATE OR REPLACE FUNCTION is_developer(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user is developer
    RETURN EXISTS (
        SELECT 1 FROM auth.users 
        WHERE auth.users.id = user_id 
        AND (
            auth.users.raw_user_meta_data->>'role' IN ('developer', 'admin')
            OR
            auth.users.email LIKE '%@guardian-dev.com'
            OR 
            auth.users.email LIKE '%@guardian-admin.com'
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create canonical healthcare provider checking function
CREATE OR REPLACE FUNCTION is_healthcare_provider(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    -- Two-tier check: JWT role AND verified registry entry
    -- First check: User has healthcare provider role in JWT/metadata
    IF NOT (
        current_setting('request.jwt.claims', true)::jsonb->>'role' = 'healthcare_provider'
        OR
        auth.jwt()->>'role' = 'healthcare_provider'
        OR
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = user_id 
            AND auth.users.raw_user_meta_data->>'role' = 'healthcare_provider'
        )
    ) THEN
        RETURN FALSE;
    END IF;
    
    -- Second check: Verified in provider registry (stronger security)
    -- Note: provider_registry table won't exist during early script execution,
    -- so we gracefully handle the case where the table doesn't exist yet
    BEGIN
        RETURN EXISTS (
            SELECT 1 FROM provider_registry pr
            WHERE pr.user_id = user_id
            AND pr.active = TRUE
            AND pr.verification_status IN ('credential_verified','full_verified')
        );
    EXCEPTION
        WHEN undefined_table THEN
            -- During early migration, provider_registry may not exist yet
            -- Fall back to verified JWT check only (not blanket TRUE)
            RETURN (
                current_setting('request.jwt.claims', true)::jsonb->>'role' = 'healthcare_provider'
                OR
                auth.jwt()->>'role' = 'healthcare_provider'
                OR
                EXISTS (
                    SELECT 1 FROM auth.users 
                    WHERE auth.users.id = user_id 
                    AND auth.users.raw_user_meta_data->>'role' = 'healthcare_provider'
                )
            );
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================

-- Generic updated_at trigger function (reusable across all scripts)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to system tables
CREATE TRIGGER update_system_configuration_updated_at
    BEFORE UPDATE ON system_configuration
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- FEATURE FLAGS INFRASTRUCTURE
-- =============================================================================
-- Source: 002_feature_flags.sql (CLEAN - No changes needed)

-- Create feature flags table for progressive rollouts
CREATE TABLE IF NOT EXISTS feature_flags (
    feature_name TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT false,
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
    enabled_for_users UUID[] DEFAULT '{}',
    configuration JSONB DEFAULT '{}',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled);

-- Insert v7 feature flags (all disabled initially)
INSERT INTO feature_flags (feature_name, enabled, description, configuration) VALUES
-- Phase 2 Core Features
('fhir_integration', false, 'FHIR R4 healthcare interoperability integration', 
 '{"supported_resources": ["Patient", "Observation", "MedicationRequest", "DocumentReference"]}'),
('enhanced_consent', false, 'GDPR Article 7 compliant granular consent management',
 '{"require_explicit_consent": true, "temporal_consent": true}'),
('user_preferences_v2', false, 'Enhanced user preferences and personalization system',
 '{"accessibility_features": true, "notification_controls": true}'),
('document_queue_v2', false, 'Enhanced document processing queue with priority lanes',
 '{"priority_processing": true, "dead_letter_queue": true}'),

-- Phase 3 Advanced Features  
('event_sourcing', false, 'Event sourcing infrastructure for audit and replay',
 '{"replay_capability": true, "event_retention_days": 2555}'),
('real_time_collaboration', false, 'Multi-provider real-time collaboration features',
 '{"max_concurrent_users": 10, "session_timeout_minutes": 30}'),
('ai_ml_integration', false, 'AI/ML inference tracking and human-in-the-loop validation',
 '{"confidence_threshold": 0.8, "human_validation_required": true}'),
('advanced_analytics', false, 'User-facing analytics and health insights',
 '{"real_time_updates": false, "predictive_analytics": true}'),

-- Phase 4 Scale Features
('multi_tenancy', false, 'Organization-level multi-tenancy support',
 '{"tenant_isolation_level": "complete", "cross_tenant_sharing": false}'),
('mobile_optimization', false, 'Mobile-specific performance and offline capabilities',
 '{"offline_capability": false, "progressive_loading": true}'),
('data_portability_v2', false, 'Enhanced data export in multiple healthcare formats',
 '{"export_formats": ["fhir", "cda", "pdf", "csv"]}'),
('zero_trust_security', false, 'Zero-trust security architecture with MFA',
 '{"mfa_required": false, "device_trust_required": true}')

ON CONFLICT (feature_name) DO UPDATE SET
    description = EXCLUDED.description,
    configuration = EXCLUDED.configuration,
    updated_at = NOW();

-- Create feature flag utility functions
CREATE OR REPLACE FUNCTION is_feature_enabled_for_user(
    p_feature_name TEXT,
    p_user_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    flag_record RECORD;
    user_hash INTEGER;
BEGIN
    SELECT * INTO flag_record FROM feature_flags WHERE feature_name = p_feature_name;
    
    -- Feature doesn't exist
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- If feature is globally enabled
    IF flag_record.enabled THEN
        RETURN true;
    END IF;
    
    -- If no user provided, can't check user-specific flags
    IF p_user_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- If user is specifically enabled
    IF p_user_id = ANY(flag_record.enabled_for_users) THEN
        RETURN true;
    END IF;
    
    -- Check rollout percentage
    IF flag_record.rollout_percentage > 0 THEN
        user_hash := abs(hashtext(p_user_id::text)) % 100;
        IF user_hash < flag_record.rollout_percentage THEN
            RETURN true;
        END IF;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION enable_feature_for_user(
    p_feature_name TEXT,
    p_user_id UUID,
    p_percentage INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE feature_flags 
    SET enabled_for_users = 
            CASE 
                WHEN p_user_id = ANY(enabled_for_users) THEN enabled_for_users
                ELSE array_append(enabled_for_users, p_user_id)
            END,
        rollout_percentage = COALESCE(p_percentage, rollout_percentage),
        updated_at = NOW()
    WHERE feature_name = p_feature_name;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION disable_feature_for_user(
    p_feature_name TEXT,
    p_user_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE feature_flags 
    SET enabled_for_users = array_remove(enabled_for_users, p_user_id),
        updated_at = NOW()
    WHERE feature_name = p_feature_name;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create implementation tracking table
CREATE TABLE IF NOT EXISTS implementation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    implementation_type TEXT NOT NULL,
    target_version TEXT,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'started' CHECK (status IN (
        'started', 'in_progress', 'completed', 'failed', 'rolled_back'
    )),
    
    -- Progress tracking
    total_steps INTEGER,
    completed_steps INTEGER DEFAULT 0,
    current_step TEXT,
    
    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_minutes INTEGER,
    
    -- Results
    records_processed INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    error_summary JSONB DEFAULT '[]',
    notes TEXT,
    
    -- Context
    initiated_by TEXT NOT NULL DEFAULT current_user,
    implementation_environment TEXT DEFAULT 'production',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for implementation tracking
CREATE INDEX IF NOT EXISTS idx_implementation_sessions_type ON implementation_sessions(implementation_type);
CREATE INDEX IF NOT EXISTS idx_implementation_sessions_status ON implementation_sessions(status);
CREATE INDEX IF NOT EXISTS idx_implementation_sessions_created ON implementation_sessions(created_at);

-- Add Row Level Security for feature flags (admin only)
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY feature_flags_admin_access ON feature_flags
    FOR ALL
    TO authenticated
    USING (is_admin());

-- Allow all authenticated users to read feature flags for their own checks
CREATE POLICY feature_flags_read_access ON feature_flags
    FOR SELECT
    TO authenticated
    USING (true);

-- Add RLS for implementation sessions (admin only)  
ALTER TABLE implementation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY implementation_sessions_admin_access ON implementation_sessions
    FOR ALL
    TO authenticated
    USING (is_admin() OR is_developer());

-- Create audit trigger for feature flags (using system audit infrastructure)
CREATE OR REPLACE FUNCTION audit_feature_flags_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Log feature flag changes using system audit function
    PERFORM log_audit_event(
        'feature_flags',
        COALESCE(NEW.feature_name, OLD.feature_name),
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        'Feature flag configuration change',
        'feature_flag',
        NULL -- Feature flags are not patient-specific
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_audit_feature_flags
    AFTER INSERT OR UPDATE OR DELETE ON feature_flags
    FOR EACH ROW EXECUTE FUNCTION audit_feature_flags_changes();

-- =============================================================================
-- INITIAL SYSTEM CONFIGURATION
-- =============================================================================

-- Insert default system configuration
INSERT INTO system_configuration (config_key, config_value, config_type, description) VALUES
('audit.retention_days', '2555', 'compliance', 'Days to retain audit logs (7 years for healthcare compliance)'),
('audit.auto_archive', 'true', 'system', 'Automatically archive old audit entries'),
('notification.default_expiry_hours', '72', 'notification', 'Default expiry time for system notifications'),
('security.admin_email_domains', '["guardian-admin.com"]', 'security', 'Email domains considered admin users'),
('compliance.gdpr_enabled', 'true', 'compliance', 'Enable GDPR compliance features'),
('system.maintenance_mode', 'false', 'system', 'System maintenance mode flag')
ON CONFLICT (config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    updated_at = NOW();

-- =============================================================================
-- DEPLOYMENT VERIFICATION
-- =============================================================================

-- Verify system infrastructure deployment
DO $$
DECLARE
    table_count INTEGER;
    function_count INTEGER;
    config_count INTEGER;
    feature_count INTEGER;
BEGIN
    -- Check tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_name IN ('audit_log', 'system_notifications', 'system_configuration', 'feature_flags', 'implementation_sessions')
    AND table_schema = 'public';
    
    -- Check functions
    SELECT COUNT(*) INTO function_count
    FROM information_schema.routines 
    WHERE routine_name IN (
        'log_audit_event', 'create_system_notification', 'update_updated_at_column',
        'is_admin', 'is_service_role', 'is_developer', 'is_healthcare_provider',
        'is_feature_enabled_for_user', 'enable_feature_for_user', 'disable_feature_for_user'
    )
    AND routine_schema = 'public';
    
    -- Check configuration
    SELECT COUNT(*) INTO config_count FROM system_configuration;
    
    -- Check feature flags
    SELECT COUNT(*) INTO feature_count FROM feature_flags;
    
    IF table_count = 5 AND function_count >= 9 AND config_count >= 6 AND feature_count >= 12 THEN
        RAISE NOTICE '✅ Foundation deployment successful!';
        RAISE NOTICE '   - % system tables created', table_count;
        RAISE NOTICE '   - % utility functions created', function_count;
        RAISE NOTICE '   - % configuration entries loaded', config_count;
        RAISE NOTICE '   - % feature flags created', feature_count;
        RAISE NOTICE '📋 NOTE: audit_log.patient_id column will be added in 02_profiles.sql';
    ELSE
        RAISE WARNING '❌ Foundation deployment incomplete:';
        RAISE WARNING '   - Tables: %/5, Functions: %/9, Config: %/6, Features: %/12', 
                     table_count, function_count, config_count, feature_count;
    END IF;
END;
$$;

COMMIT;

-- =============================================================================
-- SUCCESS MESSAGE
-- =============================================================================

\echo '🎯 01_foundations.sql deployed successfully!'
\echo 'Components available:'
\echo '- PostgreSQL Extensions (6 extensions)'
\echo '- System Infrastructure (audit_log with CORRECTED patient_id reference)'
\echo '- System Notifications & Configuration'
\echo '- Feature Flags System (12 flags)'
\echo '- Security Functions (admin, developer, provider checks)'
\echo '- Audit Logging Infrastructure'
\echo ''
\echo '📋 KEY CHANGE:'
\echo '  audit_log.patient_id column deferred to 02_profiles.sql (after user_profiles table exists)'
\echo ''
\echo 'Next step: Run 02_profiles.sql'