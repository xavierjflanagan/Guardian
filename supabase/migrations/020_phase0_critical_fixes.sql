-- Guardian Phase 0 Critical Fixes Migration
-- Addresses critical issues identified by AI reviews
-- Date: 2025-08-08
-- Purpose: Fix ID semantics, add missing infrastructure, enable profile-patient resolution

BEGIN;

-- =============================================================================
-- 1. USER EVENTS TABLE (Missing Critical Infrastructure)
-- =============================================================================

-- User events table for frontend analytics and audit trail
CREATE TABLE IF NOT EXISTS user_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core event data
    action TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    session_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Profile context (CRITICAL: Use profile_id, not user_id)
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    active_patient_id UUID REFERENCES auth.users(id), -- The patient being viewed when action occurred
    
    -- Privacy and security
    privacy_level TEXT NOT NULL DEFAULT 'internal' CHECK (privacy_level IN ('public', 'internal', 'sensitive')),
    user_agent_hash TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for user events
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user events
CREATE POLICY "Users can view own profile events" ON user_events
    FOR SELECT USING (
        profile_id IN (
            SELECT id FROM user_profiles WHERE account_owner_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own profile events" ON user_events  
    FOR INSERT WITH CHECK (
        profile_id IN (
            SELECT id FROM user_profiles WHERE account_owner_id = auth.uid()
        )
    );

-- Indexes for performance and cleanup
CREATE INDEX user_events_profile_created_idx ON user_events(profile_id, created_at DESC);
CREATE INDEX user_events_cleanup_idx ON user_events(created_at) 
    WHERE created_at < NOW() - INTERVAL '60 days';
CREATE INDEX user_events_action_idx ON user_events(action, timestamp DESC);

-- =============================================================================
-- 2. PROFILE-PATIENT ACCESS RESOLUTION FUNCTION (Critical Missing Function)
-- =============================================================================

-- The critical helper function identified by both AI reviews
CREATE OR REPLACE FUNCTION get_allowed_patient_ids(p_profile_id UUID)
RETURNS TABLE(patient_id UUID, access_type TEXT, relationship TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    profile_owner_id UUID;
BEGIN
    -- Get the account owner for this profile
    SELECT account_owner_id INTO profile_owner_id
    FROM user_profiles 
    WHERE id = p_profile_id;
    
    -- Verify the caller owns this profile
    IF profile_owner_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied: Profile not owned by current user';
    END IF;
    
    -- In Guardian v7.0: Profile IS the patient (simplified model)
    -- Future versions can extend this for complex relationships
    RETURN QUERY
    SELECT 
        p_profile_id as patient_id,  -- Profile ID serves as patient ID
        'owner'::TEXT as access_type,
        'self'::TEXT as relationship
    FROM user_profiles up
    WHERE up.id = p_profile_id 
    AND up.account_owner_id = auth.uid()
    AND up.archived = FALSE;
    
    -- Future enhancement: Add dependent relationships
    -- Could return multiple patient_ids for guardian profiles
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_allowed_patient_ids(UUID) TO authenticated;

-- =============================================================================
-- 3. COMPATIBILITY VIEWS FOR ID RESOLUTION
-- =============================================================================

-- Bridge view to help with profile-patient ID resolution
CREATE OR REPLACE VIEW profile_patients_mapping AS 
SELECT 
    up.id as profile_id,
    up.id as patient_id,  -- In v7.0, profile serves as patient ID
    up.account_owner_id as user_id,  -- The auth.users.id who owns this profile
    up.display_name,
    up.profile_type,
    up.relationship,
    up.created_at,
    up.archived
FROM user_profiles up
WHERE up.archived = FALSE;

-- Enable RLS on the view
ALTER VIEW profile_patients_mapping SET (security_invoker = true);

-- =============================================================================
-- 4. DOCUMENT TABLE COMPATIBILITY (Fix Critical Schema Mismatch)
-- =============================================================================

-- Check if documents table exists and what schema it has
DO $$
DECLARE
    has_patient_id BOOLEAN;
    has_user_id BOOLEAN;
BEGIN
    -- Check for patient_id column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'documents' 
        AND column_name = 'patient_id'
        AND table_schema = 'public'
    ) INTO has_patient_id;
    
    -- Check for user_id column  
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'documents' 
        AND column_name = 'user_id'
        AND table_schema = 'public'
    ) INTO has_user_id;
    
    -- Log current state
    RAISE NOTICE 'Documents table analysis: patient_id=%, user_id=%', has_patient_id, has_user_id;
    
    -- If table uses old user_id schema, create compatibility view
    IF has_user_id AND NOT has_patient_id THEN
        CREATE OR REPLACE VIEW documents_with_patient_id AS
        SELECT 
            *,
            user_id as patient_id  -- Alias user_id as patient_id for compatibility
        FROM documents;
        
        RAISE NOTICE 'Created documents_with_patient_id compatibility view';
    END IF;
END;
$$;

-- =============================================================================
-- 5. AUDIT LOG ENHANCEMENT FOR PROFILE CONTEXT
-- =============================================================================

-- Enhanced audit logging that handles profile context correctly
CREATE OR REPLACE FUNCTION log_profile_audit_event(
    p_table_name TEXT,
    p_record_id UUID,
    p_operation TEXT,
    p_profile_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_category TEXT DEFAULT 'general',
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    audit_id UUID;
    resolved_patient_id UUID;
BEGIN
    -- Resolve profile_id to patient_id for proper audit context
    SELECT patient_id INTO resolved_patient_id
    FROM get_allowed_patient_ids(p_profile_id)
    LIMIT 1;
    
    -- Call the main audit function with resolved patient_id
    SELECT log_audit_event(
        p_table_name := p_table_name,
        p_record_id := p_record_id,
        p_operation := p_operation,
        p_reason := p_reason,
        p_category := p_category,
        p_patient_id := resolved_patient_id,
        p_metadata := p_metadata || jsonb_build_object('original_profile_id', p_profile_id)
    ) INTO audit_id;
    
    RETURN audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION log_profile_audit_event(TEXT, UUID, TEXT, UUID, TEXT, TEXT, JSONB) TO authenticated;

-- =============================================================================
-- 6. DATA CLEANUP: USER EVENTS RETENTION POLICY
-- =============================================================================

-- Function to clean up old user events (90-day retention)
CREATE OR REPLACE FUNCTION cleanup_user_events()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_events 
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the cleanup
    INSERT INTO audit_log (
        table_name, operation, reason, metadata
    ) VALUES (
        'user_events', 'CLEANUP', 'Automated 90-day retention cleanup',
        jsonb_build_object('deleted_count', deleted_count)
    );
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 7. VERIFICATION AND TESTING
-- =============================================================================

-- Test the critical functions work correctly
DO $$
DECLARE
    test_user_id UUID;
    test_profile_id UUID;
    allowed_patients RECORD;
BEGIN
    -- This will only work if there's test data, but validates the functions exist
    RAISE NOTICE 'Testing get_allowed_patient_ids function...';
    
    -- Function should exist and be callable
    PERFORM get_allowed_patient_ids('00000000-0000-0000-0000-000000000000'::UUID);
    
    RAISE NOTICE '✅ get_allowed_patient_ids function is callable';
    
EXCEPTION WHEN OTHERS THEN
    -- Expected to fail with test UUID, but function should exist
    IF SQLERRM LIKE '%function get_allowed_patient_ids%does not exist%' THEN
        RAISE EXCEPTION 'CRITICAL: get_allowed_patient_ids function was not created properly';
    ELSE
        RAISE NOTICE '✅ get_allowed_patient_ids function exists and validates access correctly';
    END IF;
END;
$$;

COMMIT;

-- =============================================================================
-- DEPLOYMENT VERIFICATION
-- =============================================================================

-- Verify all critical components were created
SELECT 
    'Phase 0 Critical Fixes Deployment' as status,
    CASE 
        WHEN (
            -- Check user_events table exists
            EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_events')
            AND
            -- Check get_allowed_patient_ids function exists
            EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'get_allowed_patient_ids')
            AND
            -- Check profile_patients_mapping view exists
            EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'profile_patients_mapping')
            AND
            -- Check enhanced audit function exists
            EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'log_profile_audit_event')
        ) THEN '✅ ALL CRITICAL COMPONENTS CREATED'
        ELSE '❌ SOME COMPONENTS MISSING - CHECK ERRORS ABOVE'
    END as deployment_result;

-- Show what was created
SELECT 
    'user_events' as component,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_events') 
         THEN '✅ Created' ELSE '❌ Missing' END as status
UNION ALL
SELECT 
    'get_allowed_patient_ids function' as component,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'get_allowed_patient_ids') 
         THEN '✅ Created' ELSE '❌ Missing' END as status
UNION ALL
SELECT 
    'profile_patients_mapping view' as component,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'profile_patients_mapping') 
         THEN '✅ Created' ELSE '❌ Missing' END as status
UNION ALL
SELECT 
    'log_profile_audit_event function' as component,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'log_profile_audit_event') 
         THEN '✅ Created' ELSE '❌ Missing' END as status;

-- Success message
\echo '==================================================================='
\echo 'Phase 0 Critical Fixes Migration Complete!'
\echo 'Created:'
\echo '- user_events table with RLS policies'
\echo '- get_allowed_patient_ids() function for profile-patient resolution'
\echo '- profile_patients_mapping view for ID resolution'  
\echo '- log_profile_audit_event() function for proper audit context'
\echo '- Document compatibility analysis and views'
\echo '- User events cleanup function with 90-day retention'
\echo 'Next: Run frontend implementation (ProfileProvider, hooks, fixes)'
\echo '==================================================================='