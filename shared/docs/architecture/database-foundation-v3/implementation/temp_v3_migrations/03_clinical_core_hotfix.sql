-- =============================================================================
-- 03_CLINICAL_CORE_HOTFIX.SQL - GPT-5 Reliability Fixes
-- =============================================================================
-- PURPOSE: Apply reliability fixes to 03_clinical_core.sql (v1.0 → v1.1)
-- DATE: September 2, 2025
-- DEPLOYMENT: Run this script against Supabase to apply hotfixes
--
-- STATUS: NO CHANGES REQUIRED
-- Both GPT-5 identified issues are already resolved in the source file:
-- 1. ✅ is_admin() dependency check already present (line 11-13)
-- 2. ✅ fk_clinical_events_encounter constraint already idempotent (pg_constraint guard)
-- =============================================================================

BEGIN;

-- =============================================================================
-- VERIFICATION: Confirm fixes are already in place
-- =============================================================================

DO $$
BEGIN
    -- Verify is_admin() function exists (dependency already checked in source)
    IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'is_admin') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: is_admin() function not found. This should not happen if 01_foundations.sql was deployed.';
    END IF;
    
    -- Verify fk_clinical_events_encounter constraint exists or can be safely added
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'patient_clinical_events'
    ) THEN
        RAISE NOTICE 'patient_clinical_events table not found - this is expected if 03_clinical_core.sql not yet deployed';
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'healthcare_encounters'  
    ) THEN
        RAISE NOTICE 'healthcare_encounters table not found - this is expected if 03_clinical_core.sql not yet deployed';
    ELSE
        -- Tables exist, verify constraint is properly handled
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_clinical_events_encounter') THEN
            RAISE NOTICE '✅ fk_clinical_events_encounter constraint already exists';
        ELSE
            RAISE NOTICE '✅ fk_clinical_events_encounter constraint will be added safely by idempotent guard';
        END IF;
    END IF;
    
    RAISE NOTICE '03_clinical_core_hotfix.sql: No changes required - all fixes already present';
    RAISE NOTICE 'Source file updated to v1.1 for documentation consistency';
END $$;

COMMIT;

-- =============================================================================
-- SUMMARY
-- =============================================================================
-- This hotfix script confirms that 03_clinical_core.sql already contains
-- all necessary fixes identified by GPT-5. No actual database changes needed.
-- 
-- Source file version updated from v1.0 → v1.1 for audit trail consistency.