-- ========================================
-- DIRECT AUDIT LOGGING TEST
-- ========================================
-- Purpose: Test if log_audit_event function works directly

-- Step 1: Test direct audit logging call
SELECT log_audit_event(
    'test_table',
    gen_random_uuid()::text,
    'INSERT', 
    NULL,
    '{"test": "direct_audit_call"}'::jsonb,
    'Direct audit test from SQL editor',
    'audit_system',
    NULL
);

-- Step 2: Check if it got logged
SELECT 
    id,
    table_name,
    operation,
    new_values,
    reason,
    changed_at
FROM audit_log 
WHERE table_name = 'test_table'
ORDER BY changed_at DESC 
LIMIT 3;