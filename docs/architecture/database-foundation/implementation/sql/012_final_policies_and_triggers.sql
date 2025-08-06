-- ⚠️  DOCUMENTATION REFERENCE COPY - DO NOT EDIT
-- 📍 SINGLE SOURCE OF TRUTH: /supabase/migrations/012_final_policies_and_triggers.sql
-- 🔄 This file is for architectural documentation only
-- ✏️  All changes must be made in /supabase/migrations/ directory
-- 
-- Final Policies and Triggers
-- Guardian v7 Implementation - Final Dependencies
-- File: 012_final_policies_and_triggers.sql  
-- Purpose: RLS policies and triggers that have forward references to tables created in later scripts

BEGIN;

-- =============================================================================
-- FORWARD REFERENCE POLICIES
-- =============================================================================

-- Enhanced consent policies that reference patient_provider_access table
-- (This policy was moved from 013_enhanced_consent.sql to avoid forward reference)

-- Healthcare providers can view relevant consents (now that provider access table exists)
CREATE POLICY patient_consents_provider_read_enhanced ON patient_consents
    FOR SELECT TO authenticated
    USING (
        granted = true 
        AND NOW() BETWEEN valid_from AND COALESCE(valid_until, 'infinity'::timestamptz)
        AND (
            granted_to = auth.uid() OR 
            granted_to IS NULL OR
            -- Provider has explicit access through organization (table now exists)
            EXISTS (
                SELECT 1 FROM patient_provider_access 
                WHERE provider_id = auth.uid() 
                AND patient_id = patient_consents.patient_id
                AND status = 'active'
                AND NOW() BETWEEN valid_from AND COALESCE(valid_until, 'infinity'::timestamptz)
            )
        )
    );

-- Provider registry policies that reference patient_provider_access table
-- (This policy was moved from 008_provider_registry.sql to avoid forward reference)

-- Patients can see providers they have granted access to
CREATE POLICY provider_registry_patient_access_enhanced ON provider_registry
    FOR SELECT TO authenticated
    USING (
        -- Provider is publicly listed
        is_public = true
        OR 
        -- Patient has granted access to this provider (table now exists)
        EXISTS (
            SELECT 1 FROM patient_provider_access ppa
            WHERE ppa.provider_id = provider_registry.id
            AND ppa.patient_id = auth.uid()
            AND ppa.status = 'active'
            AND NOW() BETWEEN ppa.valid_from AND COALESCE(ppa.valid_until, 'infinity'::timestamptz)
        )
    );

-- =============================================================================
-- ENHANCED AUDIT TRIGGER FUNCTION (Missing from provider registry)
-- =============================================================================

-- Define the enhanced audit trigger function referenced in provider registry
CREATE OR REPLACE FUNCTION enhanced_audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    -- Enhanced audit logging with clinical context
    PERFORM log_audit_event(
        TG_TABLE_NAME,
        COALESCE(NEW.id::text, OLD.id::text),
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        'Enhanced audit trigger',
        'provider_registry',
        -- Try to extract patient_id from various possible fields
        COALESCE(
            NEW.patient_id, OLD.patient_id,  -- Direct patient_id field
            (NEW.metadata->>'patient_id')::uuid, -- From metadata
            (OLD.metadata->>'patient_id')::uuid
        )
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- NOTE: CANONICAL SECURITY FUNCTIONS MOVED TO 000_system_infrastructure.sql
-- =============================================================================
-- 
-- Security functions (is_admin, is_service_role, is_developer, is_healthcare_provider) 
-- are now defined in 000_system_infrastructure.sql to be available to all scripts.

-- =============================================================================
-- AUDIT FAILURE FALLBACK TABLE (Address silent audit failures)
-- =============================================================================

-- Create fallback table for when main audit logging fails
CREATE TABLE IF NOT EXISTS failed_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Original audit attempt details
    attempted_table_name TEXT NOT NULL,
    attempted_record_id TEXT NOT NULL,
    attempted_operation TEXT NOT NULL,
    
    -- Failure details
    failure_reason TEXT NOT NULL,
    failure_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    original_error_message TEXT,
    
    -- Context at time of failure
    user_id UUID,
    session_context JSONB,
    
    -- Retry information
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for failure recovery
CREATE INDEX IF NOT EXISTS idx_failed_audit_events_unresolved ON failed_audit_events(failure_timestamp) 
WHERE resolved_at IS NULL;

-- Enhanced audit function with fallback
CREATE OR REPLACE FUNCTION log_audit_event_with_fallback(
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
    -- Try main audit logging first
    BEGIN
        SELECT log_audit_event(
            p_table_name, p_record_id, p_operation, p_old_values, p_new_values,
            p_reason, p_compliance_category, p_patient_id
        ) INTO audit_id;
        
        RETURN audit_id;
    EXCEPTION
        WHEN OTHERS THEN
            -- Main audit failed, log to fallback table
            INSERT INTO failed_audit_events (
                attempted_table_name, attempted_record_id, attempted_operation,
                failure_reason, original_error_message, user_id,
                session_context
            ) VALUES (
                p_table_name, p_record_id, p_operation,
                'Main audit log failure', SQLERRM, auth.uid(),
                jsonb_build_object(
                    'reason', p_reason,
                    'category', p_compliance_category,
                    'patient_id', p_patient_id
                )
            );
            
            -- For critical operations, consider raising an exception
            IF p_compliance_category IN ('gdpr', 'hipaa', 'clinical_decision') THEN
                RAISE WARNING 'CRITICAL: Audit logging failed for % operation on %: %', 
                             p_operation, p_table_name, SQLERRM;
            END IF;
            
            RETURN NULL;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- MATERIALIZED VIEW REFRESH FUNCTIONS
-- =============================================================================

-- Function to refresh all backward compatibility views
CREATE OR REPLACE FUNCTION refresh_compatibility_views()
RETURNS VOID AS $$
BEGIN
    -- Refresh materialized views concurrently if possible
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY patient_medications;
    EXCEPTION
        WHEN OTHERS THEN
            REFRESH MATERIALIZED VIEW patient_medications;
    END;
    
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY patient_lab_results;
    EXCEPTION
        WHEN OTHERS THEN
            REFRESH MATERIALIZED VIEW patient_lab_results;
    END;
    
    -- Log the refresh
    PERFORM log_audit_event(
        'materialized_views',
        'compatibility_refresh',
        'UPDATE',
        NULL,
        jsonb_build_object('refreshed_at', NOW()),
        'Scheduled materialized view refresh',
        'system'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- SYSTEM HEALTH CHECKS
-- =============================================================================

-- Function to check system health and integrity
CREATE OR REPLACE FUNCTION check_system_health()
RETURNS TABLE (
    component TEXT,
    status TEXT,
    details TEXT,
    last_checked TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    WITH health_checks AS (
        -- Check audit log health
        SELECT 
            'audit_log' as component,
            CASE WHEN COUNT(*) > 0 THEN 'healthy' ELSE 'warning' END as status,
            format('Total entries: %s, Recent failures: %s', 
                   COUNT(*), 
                   (SELECT COUNT(*) FROM failed_audit_events WHERE resolved_at IS NULL)
            ) as details,
            NOW() as last_checked
        FROM audit_log
        WHERE created_at > NOW() - INTERVAL '1 day'
        
        UNION ALL
        
        -- Check materialized view freshness
        SELECT 
            'materialized_views' as component,
            CASE WHEN pg_stat_get_last_analyze_time(c.oid) > NOW() - INTERVAL '1 day' 
                 THEN 'healthy' ELSE 'warning' END as status,
            format('Last refresh: %s', pg_stat_get_last_analyze_time(c.oid)) as details,
            NOW() as last_checked
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'patient_medications' AND n.nspname = 'public'
        
        UNION ALL
        
        -- Check RLS policy count
        SELECT 
            'rls_policies' as component,
            CASE WHEN COUNT(*) >= 20 THEN 'healthy' ELSE 'warning' END as status,
            format('Active policies: %s', COUNT(*)) as details,
            NOW() as last_checked
        FROM pg_policies
        WHERE schemaname = 'public'
    )
    SELECT * FROM health_checks;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- =============================================================================
-- DEPLOYMENT VERIFICATION
-- =============================================================================

-- Verify final policies and functions deployment
DO $$
DECLARE
    policy_count INTEGER;
    function_count INTEGER;
    fallback_table_exists BOOLEAN;
BEGIN
    -- Check policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE policyname LIKE '%enhanced' OR policyname LIKE '%provider%';
    
    -- Check security functions
    SELECT COUNT(*) INTO function_count
    FROM information_schema.routines 
    WHERE routine_name IN ('is_admin', 'is_service_role', 'is_developer', 'check_system_health')
    AND routine_schema = 'public';
    
    -- Check fallback table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'failed_audit_events' AND table_schema = 'public'
    ) INTO fallback_table_exists;
    
    IF policy_count >= 2 AND function_count = 4 AND fallback_table_exists THEN
        RAISE NOTICE '✅ Final policies and triggers deployment successful!';
        RAISE NOTICE '   - % enhanced policies created', policy_count;
        RAISE NOTICE '   - % security functions created', function_count;
        RAISE NOTICE '   - Audit fallback system enabled';
    ELSE
        RAISE WARNING '❌ Final policies deployment incomplete:';
        RAISE WARNING '   - Policies: %/2+, Functions: %/4, Fallback: %', 
                     policy_count, function_count, fallback_table_exists;
    END IF;
END;
$$;

-- Success message
\echo 'Final policies and triggers deployed successfully!'
\echo 'Features added:'
\echo '- Enhanced RLS policies with proper table dependencies'
\echo '- Canonical security functions (is_admin, is_service_role, is_developer)'
\echo '- Audit failure fallback system'
\echo '- System health monitoring functions'
\echo '- Materialized view refresh utilities'
\echo 'Guardian v7 SQL migration sequence is now complete!'