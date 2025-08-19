-- System Infrastructure Setup
-- Guardian v7 Implementation - Foundation
-- File: 000_system_infrastructure.sql
-- Purpose: Core system tables required by multiple domain scripts

BEGIN;

-- =============================================================================
-- SYSTEM-WIDE AUDIT INFRASTRUCTURE
-- =============================================================================

-- Primary audit log table for compliance and debugging
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core audit fields
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL, -- Can store UUID or other identifier types
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'SELECT')),
    
    -- Data change tracking
    old_values JSONB,
    new_values JSONB,
    
    -- User context
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Additional context
    reason TEXT,
    clinical_context JSONB,
    
    -- Healthcare-specific compliance fields
    patient_id UUID REFERENCES auth.users(id), -- For patient data changes
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
CREATE INDEX IF NOT EXISTS idx_audit_log_patient ON audit_log(patient_id) WHERE patient_id IS NOT NULL;
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
    target_user_id UUID REFERENCES auth.users(id),
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
    updated_by UUID REFERENCES auth.users(id)
);

-- System configuration indexes
CREATE INDEX IF NOT EXISTS idx_system_configuration_type ON system_configuration(config_type);
CREATE INDEX IF NOT EXISTS idx_system_configuration_sensitive ON system_configuration(is_sensitive) WHERE is_sensitive = TRUE;

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on all system tables
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_configuration ENABLE ROW LEVEL SECURITY;

-- Audit log policies (admin read, system write)
CREATE POLICY audit_log_admin_read ON audit_log
    FOR SELECT TO authenticated
    USING (
        -- Users can see their own audit entries
        changed_by = auth.uid() 
        OR patient_id = auth.uid()
        -- Admins can see all (when we implement admin role)
        OR EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND (
                auth.users.raw_user_meta_data->>'role' = 'admin' 
                OR auth.users.email LIKE '%@guardian-admin.com'
            )
        )
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
        OR EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND (
                auth.users.raw_user_meta_data->>'role' = target_role
                OR auth.users.raw_user_meta_data->>'role' = 'admin'
                OR auth.users.email LIKE '%@guardian-admin.com'
            )
        )
    );

-- System configuration policies (admin only)
CREATE POLICY system_configuration_admin_access ON system_configuration
    FOR ALL TO authenticated
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

-- =============================================================================
-- SYSTEM UTILITY FUNCTIONS
-- =============================================================================

-- Generic audit logging function
CREATE OR REPLACE FUNCTION log_audit_event(
    p_table_name TEXT,
    p_record_id TEXT,
    p_operation TEXT,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_compliance_category TEXT DEFAULT NULL,
    p_patient_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    audit_id UUID;
BEGIN
    INSERT INTO audit_log (
        table_name, record_id, operation, old_values, new_values,
        changed_by, reason, compliance_category, patient_id,
        session_id, ip_address, user_agent
    ) VALUES (
        p_table_name, p_record_id, p_operation, p_old_values, p_new_values,
        auth.uid(), p_reason, p_compliance_category, p_patient_id,
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

COMMIT;

-- =============================================================================
-- DEPLOYMENT VERIFICATION
-- =============================================================================

-- Verify system infrastructure deployment
DO $$
DECLARE
    table_count INTEGER;
    function_count INTEGER;
    config_count INTEGER;
BEGIN
    -- Check tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_name IN ('audit_log', 'system_notifications', 'system_configuration')
    AND table_schema = 'public';
    
    -- Check functions
    SELECT COUNT(*) INTO function_count
    FROM information_schema.routines 
    WHERE routine_name IN ('log_audit_event', 'create_system_notification', 'update_updated_at_column')
    AND routine_schema = 'public';
    
    -- Check configuration
    SELECT COUNT(*) INTO config_count FROM system_configuration;
    
    IF table_count = 3 AND function_count = 3 AND config_count >= 6 THEN
        RAISE NOTICE '✅ System infrastructure deployment successful!';
        RAISE NOTICE '   - % system tables created', table_count;
        RAISE NOTICE '   - % utility functions created', function_count;
        RAISE NOTICE '   - % configuration entries loaded', config_count;
    ELSE
        RAISE WARNING '❌ System infrastructure deployment incomplete:';
        RAISE WARNING '   - Tables: %/3, Functions: %/3, Config: %/6', 
                     table_count, function_count, config_count;
    END IF;
END;
$$;

-- Success message
\echo 'System infrastructure deployed successfully!'
\echo 'Components available:'
\echo '- audit_log: System-wide audit trail'
\echo '- system_notifications: Internal notification system'  
\echo '- system_configuration: Application configuration'
\echo '- Utility functions for logging and notifications'
\echo 'Next step: Run 000_extensions.sql'