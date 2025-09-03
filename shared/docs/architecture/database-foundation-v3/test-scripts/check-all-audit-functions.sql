-- Find all log_audit_event function versions
-- This will show us why the function calls are ambiguous

-- 1. Get all log_audit_event functions and their signatures
SELECT 
    routine_name,
    specific_name,
    routine_type,
    data_type as return_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_name = 'log_audit_event'
ORDER BY specific_name;

-- 2. Get detailed parameter info for each version
SELECT 
    r.specific_name,
    r.routine_name,
    p.parameter_name,
    p.data_type,
    p.parameter_mode,
    p.ordinal_position
FROM information_schema.routines r
JOIN information_schema.parameters p ON r.specific_name = p.specific_name
WHERE r.routine_name = 'log_audit_event'
ORDER BY r.specific_name, p.ordinal_position;

-- 3. Count how many versions exist
SELECT COUNT(*) as total_log_audit_event_functions
FROM information_schema.routines 
WHERE routine_name = 'log_audit_event';