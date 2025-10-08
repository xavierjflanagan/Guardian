-- =============================================================================
-- MIGRATION: Remove Duplicate log_audit_event Function (Healthcare Compliance)
-- =============================================================================
-- Date: 2025-09-03 14:00:00
-- Purpose: Remove conflicting 7-parameter log_audit_event function 
-- Issue: Two function definitions prevent audit logging (HIPAA compliance violation)
-- Impact: Enables healthcare audit logging for patient data operations
-- 
-- DEPENDENCIES: Requires 20250903_fix_log_audit_event_parameter_mismatch.sql applied first
-- 
-- INVESTIGATION RESULTS:
-- - Current state: 2 log_audit_event functions exist (7-param and 8-param versions)
-- - RPC functions call with 8 parameters but PostgreSQL can't resolve which function
-- - Result: Silent audit logging failure (HIPAA compliance violation)
-- - Solution: Keep correct 8-parameter V3 version, remove old 7-parameter version
-- 
-- SAFETY ANALYSIS:
-- - Only affects log_audit_event function resolution
-- - All current calls use 8 parameters (V3 standard)  
-- - 7-parameter version is legacy and unused
-- - No dependent functions will break (all use 8-param signature)
-- 
-- ROLLBACK PLAN: Restore 7-parameter function if needed (preserved in git history)
-- =============================================================================

-- Step 1: Verify current state (2 functions should exist)
DO $$
DECLARE
    function_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO function_count 
    FROM information_schema.routines 
    WHERE routine_name = 'log_audit_event';
    
    IF function_count != 2 THEN
        RAISE EXCEPTION 'MIGRATION PRECONDITION FAILED: Expected 2 log_audit_event functions, found %', function_count;
    END IF;
    
    RAISE NOTICE 'PRECONDITION CHECK: Found % log_audit_event functions (expected)', function_count;
END $$;

-- Step 2: Document both function signatures for audit trail
SELECT 
    'BEFORE MIGRATION - Function signatures:' as audit_info,
    r.specific_name,
    COUNT(p.parameter_name) as parameter_count,
    STRING_AGG(
        COALESCE(p.parameter_name, 'NO_PARAMS') || ' ' || COALESCE(p.data_type, 'NO_TYPE'), 
        ', ' ORDER BY p.ordinal_position
    ) as signature
FROM information_schema.routines r
LEFT JOIN information_schema.parameters p ON r.specific_name = p.specific_name
WHERE r.routine_name = 'log_audit_event'
GROUP BY r.specific_name, r.routine_name
ORDER BY COUNT(p.parameter_name) DESC;

-- Step 3: Remove old 7-parameter function (safe - legacy version)
-- This specific DROP statement targets only the 7-parameter version
DROP FUNCTION IF EXISTS log_audit_event(text, text, text, jsonb, jsonb, text, text);

-- Step 4: Verify only one function remains (the correct 8-parameter V3 version)
DO $$
DECLARE
    function_count INTEGER;
    param_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO function_count 
    FROM information_schema.routines 
    WHERE routine_name = 'log_audit_event';
    
    IF function_count != 1 THEN
        RAISE EXCEPTION 'MIGRATION VERIFICATION FAILED: Expected 1 log_audit_event function, found %', function_count;
    END IF;
    
    -- Verify the remaining function has 8 parameters (V3 standard)
    SELECT COUNT(p.parameter_name) INTO param_count
    FROM information_schema.routines r
    LEFT JOIN information_schema.parameters p ON r.specific_name = p.specific_name
    WHERE r.routine_name = 'log_audit_event'
    GROUP BY r.specific_name;
    
    IF param_count != 8 THEN
        RAISE EXCEPTION 'MIGRATION VERIFICATION FAILED: Expected 8-parameter function, found %-parameter function', param_count;
    END IF;
    
    RAISE NOTICE 'MIGRATION SUCCESS: Single 8-parameter log_audit_event function confirmed';
END $$;

-- Step 5: Test that audit logging now works (healthcare compliance verification)
DO $$
DECLARE
    audit_result UUID;
BEGIN
    SELECT log_audit_event(
        'test_migration',
        gen_random_uuid()::text,
        'INSERT',
        NULL::jsonb,
        jsonb_build_object('migration_test', true, 'timestamp', NOW()),
        'Migration verification test',
        'audit_system',
        NULL::uuid
    ) INTO audit_result;
    
    IF audit_result IS NULL THEN
        RAISE EXCEPTION 'MIGRATION VERIFICATION FAILED: Audit logging still returns NULL';
    END IF;
    
    RAISE NOTICE 'HEALTHCARE COMPLIANCE VERIFIED: Audit logging functional (audit_id: %)', audit_result;
END $$;

-- Step 6: Clean up test record
DELETE FROM audit_log WHERE reason = 'Migration verification test';

-- Migration completion confirmation
SELECT 
    'MIGRATION COMPLETED SUCCESSFULLY' as status,
    'Healthcare audit logging restored - HIPAA compliance enabled' as impact,
    NOW() as completed_at;