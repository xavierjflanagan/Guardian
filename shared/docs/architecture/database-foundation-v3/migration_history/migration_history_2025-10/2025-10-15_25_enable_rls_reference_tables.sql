-- ============================================================================
-- Migration: Enable RLS on Reference and System Tables
-- Date: 2025-10-15
-- Number: 25
-- Issue: 3 additional RLS security errors detected after Migration 24
--
-- PROBLEM:
-- Security Advisor detected 3 more tables with disabled Row Level Security:
-- - migration_08_backfill_audit: Service-only audit table
-- - universal_medical_codes: Public reference data (SNOMED, LOINC, RxNorm)
-- - regional_medical_codes: Public reference data (PBS, MBS, ICD-10-AM, etc.)
--
-- SOLUTION:
-- Enable and force RLS on service-only table (migration_08_backfill_audit).
-- Enable RLS with permissive read policies on reference tables to allow
-- authenticated users to access medical code data for auto-completion and
-- clinical data entry.
--
-- AFFECTED TABLES:
-- - migration_08_backfill_audit (service-only, no policies needed)
-- - universal_medical_codes (reference data, needs public read policy)
-- - regional_medical_codes (reference data, needs public read policy)
--
-- CONTEXT:
-- Pre-launch with 2+ months until real users. Zero production risk.
-- Reference tables contain no patient data - only medical code definitions.
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/03_clinical_core.sql (Line 1262: universal_medical_codes)
--   [X] current_schema/03_clinical_core.sql (Line 1296: regional_medical_codes)
--   [X] current_schema/03_clinical_core.sql (Line 1984: migration_08_backfill_audit)
--   [X] current_schema/06_security.sql (Added reference table RLS policies at line 687)
--
-- DOWNSTREAM UPDATES:
--   [X] No bridge schema changes required (RLS is infrastructure)
--   [X] No TypeScript type changes required
--   [X] Updated RLS security remediation doc (shared/docs/architecture/security/RLS-security-remediation-2025-10.md)
--
-- EXECUTION DATE: 2025-10-15
-- ============================================================================

-- Pre-flight check: Show current RLS status
DO $$
BEGIN
  RAISE NOTICE '=== PRE-MIGRATION RLS STATUS ===';
END $$;

SELECT
  pt.tablename,
  CASE WHEN pt.rowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as current_rls_status,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies pp
    WHERE pp.schemaname = 'public' AND pp.tablename = pt.tablename
  ) THEN 'YES' ELSE 'NO' END as has_policies
FROM pg_tables pt
WHERE schemaname = 'public'
  AND tablename IN ('migration_08_backfill_audit', 'universal_medical_codes', 'regional_medical_codes')
ORDER BY pt.tablename;

-- ============================================================================
-- MAIN MIGRATION: Enable RLS on all affected tables
-- ============================================================================

DO $$
DECLARE
  tables_processed INTEGER := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== ENABLING RLS ON REFERENCE AND SYSTEM TABLES ===';
  RAISE NOTICE '';

  -- Enable RLS on migration_08_backfill_audit (service-only)
  ALTER TABLE public.migration_08_backfill_audit ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.migration_08_backfill_audit FORCE ROW LEVEL SECURITY;
  RAISE NOTICE 'Enabled and forced RLS on: migration_08_backfill_audit (service-only)';
  tables_processed := tables_processed + 1;

  -- Enable RLS on universal_medical_codes (reference data)
  ALTER TABLE public.universal_medical_codes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.universal_medical_codes FORCE ROW LEVEL SECURITY;
  RAISE NOTICE 'Enabled and forced RLS on: universal_medical_codes (reference data)';
  tables_processed := tables_processed + 1;

  -- Enable RLS on regional_medical_codes (reference data)
  ALTER TABLE public.regional_medical_codes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.regional_medical_codes FORCE ROW LEVEL SECURITY;
  RAISE NOTICE 'Enabled and forced RLS on: regional_medical_codes (reference data)';
  tables_processed := tables_processed + 1;

  RAISE NOTICE '';
  RAISE NOTICE 'Processed % tables', tables_processed;
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- Add permissive read policies for reference tables
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '=== CREATING REFERENCE TABLE POLICIES ===';

  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS universal_medical_codes_public_read ON public.universal_medical_codes;
  DROP POLICY IF EXISTS regional_medical_codes_public_read ON public.regional_medical_codes;

  -- Create permissive read policy for universal_medical_codes
  -- Allows authenticated users to access medical code reference data
  CREATE POLICY universal_medical_codes_public_read
    ON public.universal_medical_codes FOR SELECT
    TO authenticated
    USING (true);

  RAISE NOTICE 'Created public read policy for universal_medical_codes';

  -- Create permissive read policy for regional_medical_codes
  -- Allows authenticated users to access regional medical code reference data
  CREATE POLICY regional_medical_codes_public_read
    ON public.regional_medical_codes FOR SELECT
    TO authenticated
    USING (true);

  RAISE NOTICE 'Created public read policy for regional_medical_codes';

  -- Note: migration_08_backfill_audit has no policies (service-only table)
  RAISE NOTICE 'No policies needed for migration_08_backfill_audit (service-only)';
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
  pt.tablename,
  CASE WHEN pc.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as rls_status,
  CASE WHEN pc.relforcerowsecurity THEN 'FORCED' ELSE 'NOT FORCED' END as force_status,
  COUNT(pp.policyname) as policy_count
FROM pg_tables pt
JOIN pg_class pc ON pc.relname = pt.tablename
JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = pt.schemaname
LEFT JOIN pg_policies pp ON pp.schemaname = pt.schemaname AND pp.tablename = pt.tablename
WHERE pt.schemaname = 'public'
  AND pt.tablename IN ('migration_08_backfill_audit', 'universal_medical_codes', 'regional_medical_codes')
GROUP BY pt.tablename, pc.relrowsecurity, pc.relforcerowsecurity
ORDER BY pt.tablename;

-- Verify reference table policies exist
SELECT
  policyname,
  tablename,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('universal_medical_codes', 'regional_medical_codes')
ORDER BY tablename, policyname;

-- ============================================================================
-- EXPECTED RESULTS:
-- - All 3 tables show RLS: ENABLED, FORCE: FORCED
-- - universal_medical_codes: 1 policy (universal_medical_codes_public_read)
-- - regional_medical_codes: 1 policy (regional_medical_codes_public_read)
-- - migration_08_backfill_audit: 0 policies (service-only)
-- ============================================================================

-- ============================================================================
-- ROLLBACK SCRIPT (if needed - run manually)
-- ============================================================================
/*
DO $$
BEGIN
  -- Disable RLS on all three tables
  ALTER TABLE public.migration_08_backfill_audit DISABLE ROW LEVEL SECURITY;
  ALTER TABLE public.universal_medical_codes DISABLE ROW LEVEL SECURITY;
  ALTER TABLE public.regional_medical_codes DISABLE ROW LEVEL SECURITY;

  RAISE NOTICE 'Disabled RLS on all three tables';
END $$;

-- Drop reference table policies
DROP POLICY IF EXISTS universal_medical_codes_public_read ON public.universal_medical_codes;
DROP POLICY IF EXISTS regional_medical_codes_public_read ON public.regional_medical_codes;
*/
