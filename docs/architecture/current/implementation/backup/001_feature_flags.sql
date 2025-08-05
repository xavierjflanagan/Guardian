-- Feature Flags Infrastructure Implementation
-- Guardian v7 Implementation - Step 1
-- File: 001_feature_flags.sql

BEGIN;

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
    USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND (
                auth.users.raw_user_meta_data->>'role' = 'admin'
                OR auth.users.email LIKE '%@guardian-admin.com'
            )
        )
    );

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
    USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND (
                auth.users.raw_user_meta_data->>'role' IN ('admin', 'developer')
                OR auth.users.email LIKE '%@guardian-admin.com'
            )
        )
    );

-- Create audit trigger for feature flags (using system audit infrastructure)
CREATE OR REPLACE FUNCTION audit_feature_flags_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Log feature flag changes using system audit function
    PERFORM log_audit_event(
        'feature_flags',
        COALESCE(NEW.feature_name, OLD.feature_name),
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        'Feature flag configuration change',
        'feature_flag'
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_audit_feature_flags
    AFTER INSERT OR UPDATE OR DELETE ON feature_flags
    FOR EACH ROW EXECUTE FUNCTION audit_feature_flags_changes();

-- Verify feature flags deployment
DO $$
DECLARE
    feature_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO feature_count FROM feature_flags;
    
    IF feature_count < 12 THEN
        RAISE EXCEPTION 'Feature flags deployment incomplete. Expected 12+ flags, found %', feature_count;
    END IF;
    
    RAISE NOTICE 'Feature flags deployment successful. % flags created.', feature_count;
END;
$$;

COMMIT;

-- Success message
\echo 'Feature flags infrastructure deployed successfully!'
\echo 'Next step: Run 001_multi_profile_management.sql'