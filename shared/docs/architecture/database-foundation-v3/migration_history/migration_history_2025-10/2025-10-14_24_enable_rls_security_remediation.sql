-- ============================================================================
-- Migration: Enable Row Level Security (RLS) on Tables Missing Protection
-- Date: 2025-10-14
-- Number: 24
-- Issue: 19 RLS security errors detected by Supabase Security Advisor
--
-- PROBLEM:
-- Security Advisor detected 19 tables with disabled Row Level Security:
-- - clinical_narratives: Has policy defined but RLS disabled
-- - user_account_archival: Service-only table, no RLS
-- - provider_access_log + 13 partitions: Audit logs, no RLS
-- - spatial_ref_sys: PostGIS reference table, no RLS
--
-- SOLUTION:
-- Enable and force RLS on all affected tables. Add permissive read policy
-- to spatial_ref_sys. This blocks client access to service-only tables while
-- allowing service role (BYPASSRLS) to continue working.
--
-- AFFECTED TABLES:
-- - clinical_narratives (has existing policy)
-- - user_account_archival (service-only)
-- - provider_access_log (parent partition table)
-- - provider_access_log_2025_q1 through 2027_q4 (13 partitions)
-- - spatial_ref_sys (PostGIS reference)
--
-- CONTEXT:
-- Pre-launch with 2+ months until real users. Zero production risk.
-- Enables security best practices before user onboarding.
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/01_foundations.sql (Line 169: user_account_archival)
--   [X] current_schema/03_clinical_core.sql (Line 243: clinical_narratives)
--   [X] current_schema/05_healthcare_journey.sql (Line 301: provider_access_log + partitions)
--   [X] current_schema/06_security.sql (Added spatial_ref_sys exclusion note)
--
-- DOWNSTREAM UPDATES:
--   [X] No bridge schema changes required (RLS is infrastructure)
--   [X] No TypeScript type changes required
--
-- EXECUTION DATE: 2025-10-14
-- EXECUTION NOTE: spatial_ref_sys excluded due to PostGIS ownership constraints
-- ============================================================================

-- Pre-flight check: Show current RLS status
DO $$
BEGIN
  RAISE NOTICE '=== PRE-MIGRATION RLS STATUS ===';
END $$;

SELECT
  tablename,
  CASE WHEN rowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as current_rls_status,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies pp
    WHERE pp.schemaname = 'public' AND pp.tablename = pt.tablename
  ) THEN 'YES' ELSE 'NO' END as has_policies
FROM pg_tables pt
WHERE schemaname = 'public'
  AND (
    tablename IN ('clinical_narratives', 'user_account_archival', 'spatial_ref_sys', 'provider_access_log')
    OR tablename LIKE 'provider_access_log_%'
  )
ORDER BY tablename;

-- ============================================================================
-- MAIN MIGRATION: Enable RLS on all affected tables
-- ============================================================================

DO $$
DECLARE
  r record;
  tables_processed INTEGER := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== ENABLING RLS ON AFFECTED TABLES ===';
  RAISE NOTICE '';

  -- Enable RLS on all problematic tables
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND (
        tablename IN ('clinical_narratives', 'user_account_archival', 'spatial_ref_sys', 'provider_access_log')
        OR tablename LIKE 'provider_access_log_%'
      )
  LOOP
    -- Enable RLS
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', r.schemaname, r.tablename);

    -- Force RLS (except spatial_ref_sys)
    -- Note: FORCE RLS applies to table owners, but BYPASSRLS roles (like Supabase service role) still bypass
    IF r.tablename != 'spatial_ref_sys' THEN
      EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY;', r.schemaname, r.tablename);
      RAISE NOTICE 'Enabled and forced RLS on: %.%', r.schemaname, r.tablename;
    ELSE
      RAISE NOTICE 'Enabled RLS (not forced) on: %.%', r.schemaname, r.tablename;
    END IF;

    tables_processed := tables_processed + 1;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE 'Processed % tables', tables_processed;
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- Add permissive read policy for spatial_ref_sys (PostGIS reference table)
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '=== CREATING SPATIAL_REF_SYS POLICY ===';

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'spatial_ref_sys') THEN
    -- Drop existing policy if it exists
    DROP POLICY IF EXISTS spatial_ref_sys_public_read ON public.spatial_ref_sys;

    -- Create permissive read policy (authenticated and anon only)
    CREATE POLICY spatial_ref_sys_public_read
      ON public.spatial_ref_sys FOR SELECT
      TO authenticated, anon
      USING (true);

    RAISE NOTICE 'Created public read policy for spatial_ref_sys';
  ELSE
    RAISE NOTICE 'spatial_ref_sys table not found, skipping policy creation';
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== POST-MIGRATION VERIFICATION ===';
  RAISE NOTICE '';
END $$;

-- Verify RLS is enabled and forced
SELECT
  tablename,
  CASE WHEN pc.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as rls_status,
  CASE WHEN pc.relforcerowsecurity THEN 'FORCED' ELSE 'NOT FORCED' END as force_status,
  COUNT(pp.policyname) as policy_count
FROM pg_tables pt
JOIN pg_class pc ON pc.relname = pt.tablename
JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = pt.schemaname
LEFT JOIN pg_policies pp ON pp.schemaname = pt.schemaname AND pp.tablename = pt.tablename
WHERE pt.schemaname = 'public'
  AND (
    pt.tablename IN ('clinical_narratives', 'user_account_archival', 'spatial_ref_sys', 'provider_access_log')
    OR pt.tablename LIKE 'provider_access_log_%'
  )
GROUP BY pt.tablename, pc.relrowsecurity, pc.relforcerowsecurity
ORDER BY pt.tablename;

-- Verify spatial_ref_sys policy exists
SELECT
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'spatial_ref_sys';

-- ============================================================================
-- EXPECTED RESULTS:
-- - All tables show RLS: ENABLED
-- - All tables (except spatial_ref_sys) show FORCE: FORCED
-- - clinical_narratives: 1 policy (existing clinical_narratives_profile_access)
-- - provider_access_log parent: 2 existing policies
-- - spatial_ref_sys: 1 policy (spatial_ref_sys_public_read)
-- - All partition tables: 0 policies (inherit from usage via parent)
-- - user_account_archival: 0 policies (service-only)
-- ============================================================================

-- ============================================================================
-- ROLLBACK SCRIPT (if needed - run manually)
-- ============================================================================
/*
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND rowsecurity = true
      AND (
        tablename IN ('clinical_narratives', 'user_account_archival', 'spatial_ref_sys', 'provider_access_log')
        OR tablename LIKE 'provider_access_log_%'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY;', r.schemaname, r.tablename);
    RAISE NOTICE 'Disabled RLS on %.%', r.schemaname, r.tablename;
  END LOOP;
END $$;

-- Drop spatial_ref_sys policy
DROP POLICY IF EXISTS spatial_ref_sys_public_read ON public.spatial_ref_sys;
*/
