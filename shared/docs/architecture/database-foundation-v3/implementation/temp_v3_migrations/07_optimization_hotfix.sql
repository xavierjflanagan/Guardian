-- =============================================================================
-- 07_OPTIMIZATION_HOTFIX.SQL - GPT-5 Security Hardening
-- =============================================================================
-- PURPOSE: Apply security fixes to 07_optimization.sql (v1.0 → v1.1)
-- DATE: September 2, 2025
-- DEPLOYMENT: Run this script against Supabase to apply hotfixes
--
-- FIXES APPLIED:
-- 1. Enable RLS on failed_audit_events table (sensitive audit data)
-- 2. Add admin-only access policy for failed_audit_events
-- =============================================================================

BEGIN;

-- =============================================================================
-- VERIFICATION: Confirm dependencies exist before attempting security updates
-- =============================================================================

DO $$
BEGIN
    -- Verify is_admin() function exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'is_admin') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: is_admin() function not found. Run 01_foundations.sql first.';
    END IF;
    
    -- Verify failed_audit_events table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'failed_audit_events') THEN
        RAISE NOTICE 'failed_audit_events table not found - this is expected if 07_optimization.sql not yet deployed';
        RETURN;
    END IF;
    
    RAISE NOTICE 'All dependency checks passed, proceeding with security hardening';
END $$;

-- =============================================================================
-- FIX 1: Enable RLS on failed_audit_events table (sensitive by nature)
-- =============================================================================

-- Enable Row Level Security on failed_audit_events
ALTER TABLE failed_audit_events ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- FIX 2: Add admin-only access policy for failed_audit_events
-- =============================================================================

-- Create admin-only access policy
DROP POLICY IF EXISTS failed_audit_events_admin_only ON failed_audit_events;
CREATE POLICY failed_audit_events_admin_only ON failed_audit_events
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
    -- Verify RLS is enabled
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'failed_audit_events' 
        AND n.nspname = 'public'
        AND c.relrowsecurity = true
    ) THEN
        RAISE NOTICE '✅ RLS enabled on failed_audit_events';
    ELSE
        RAISE WARNING '❌ RLS not enabled on failed_audit_events';
    END IF;
    
    -- Verify policy exists
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'failed_audit_events'
        AND policyname = 'failed_audit_events_admin_only'
    ) THEN
        RAISE NOTICE '✅ Admin-only policy created for failed_audit_events';
    ELSE
        RAISE WARNING '❌ Admin-only policy not found for failed_audit_events';
    END IF;
    
    RAISE NOTICE '07_optimization_hotfix.sql completed successfully';
    RAISE NOTICE 'Applied fixes: RLS enablement and admin-only access policy';
    RAISE NOTICE 'Source file updated to v1.1 for future deployments';
END $$;