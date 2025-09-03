-- Compare deployed log_audit_event function with expected schema
-- Check if the function signature or definition has changed

-- Get current deployed function signature
SELECT 
    routine_name,
    routine_type,
    data_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_name = 'log_audit_event'
AND routine_type = 'FUNCTION';

-- Check function parameters specifically
SELECT 
    parameter_name,
    data_type,
    parameter_mode,
    ordinal_position
FROM information_schema.parameters
WHERE specific_name IN (
    SELECT specific_name 
    FROM information_schema.routines 
    WHERE routine_name = 'log_audit_event'
)
ORDER BY ordinal_position;

-- Test if the function even exists and is callable
SELECT EXISTS(
    SELECT 1 FROM information_schema.routines 
    WHERE routine_name = 'log_audit_event' 
    AND routine_type = 'FUNCTION'
) as function_exists;