-- Comprehensive audit system status check
-- Find out why log_audit_event suddenly stopped working

-- 1. Check current audit_log table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'audit_log' 
ORDER BY ordinal_position;

-- 2. Check audit_log table permissions
SELECT 
    table_name,
    privilege_type,
    grantee,
    is_grantable
FROM information_schema.table_privileges 
WHERE table_name = 'audit_log';

-- 3. Try a minimal direct insert to audit_log table
INSERT INTO audit_log (
    table_name, 
    record_id, 
    operation
) VALUES (
    'debug_test', 
    gen_random_uuid(), 
    'INSERT'
) RETURNING id, table_name, changed_at;

-- 4. Check if log_audit_event function has SECURITY DEFINER
SELECT 
    routine_name,
    security_type
FROM information_schema.routines 
WHERE routine_name = 'log_audit_event';

-- 5. Test log_audit_event with minimal parameters
SELECT log_audit_event('minimal_test', gen_random_uuid()::text, 'INSERT') as minimal_test_result;