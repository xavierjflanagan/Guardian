-- =============================================================================
-- HEALTHCARE COMPLIANCE FIX: Remove Duplicate log_audit_event Function
-- =============================================================================
-- Issue: Multiple log_audit_event functions causing audit logging failures
-- Impact: HIPAA compliance violation - RPC functions can't log audit trails
-- Solution: Drop the old 7-parameter version, keep the correct 8-parameter V3 version
-- =============================================================================

-- Verify the signatures before removal
SELECT 
    r.specific_name,
    STRING_AGG(
        COALESCE(p.parameter_name, 'NO_PARAMS') || ' ' || COALESCE(p.data_type, 'NO_TYPE'), 
        ', ' ORDER BY p.ordinal_position
    ) as parameters
FROM information_schema.routines r
LEFT JOIN information_schema.parameters p ON r.specific_name = p.specific_name
WHERE r.routine_name = 'log_audit_event'
GROUP BY r.specific_name, r.routine_name
ORDER BY r.specific_name;

-- Drop the old 7-parameter function (log_audit_event_58985)
-- This will resolve the function ambiguity and restore audit logging
DROP FUNCTION IF EXISTS log_audit_event(text, text, text, jsonb, jsonb, text, text);

-- Verify only one function remains
SELECT COUNT(*) as remaining_log_audit_event_functions
FROM information_schema.routines 
WHERE routine_name = 'log_audit_event';

-- Test that audit logging now works
SELECT log_audit_event(
    'test_table',
    gen_random_uuid()::text,
    'INSERT',
    NULL::jsonb,
    jsonb_build_object('test', 'function_fixed'),
    'Testing after duplicate removal',
    'audit_system',
    NULL::uuid
) as audit_test_result;