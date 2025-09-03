-- ========================================
-- DEBUG AUDIT LOGGING ISSUE
-- ========================================
-- Purpose: Identify why log_audit_event is not creating records

-- Step 1: Check if audit_log table exists and its structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'audit_log' 
ORDER BY ordinal_position;

-- Step 2: Check if log_audit_event function exists  
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_name = 'log_audit_event';

-- Step 3: Test direct audit_log insert to see if table works
INSERT INTO audit_log (
    table_name, record_id, operation, new_values, 
    changed_by, reason, compliance_category
) VALUES (
    'test_table', 
    gen_random_uuid(), 
    'INSERT', 
    jsonb_build_object('test', 'direct insert'),
    NULL, -- changed_by will be service_role or null
    'Debug test - direct insert',
    'audit_system'
) RETURNING id, table_name, reason, changed_at;

-- Step 4: Test log_audit_event function call
SELECT log_audit_event(
    'test_table',
    gen_random_uuid()::text,
    'INSERT',
    NULL,
    jsonb_build_object('test', 'function call'),
    'Debug test - function call',
    'audit_system',
    NULL
);

-- Step 5: Check if any audit records exist at all
SELECT COUNT(*) as total_audit_records FROM audit_log;

-- Step 6: Show recent audit records if any exist
SELECT 
    id, table_name, operation, reason, changed_at, changed_by
FROM audit_log 
ORDER BY changed_at DESC 
LIMIT 5;