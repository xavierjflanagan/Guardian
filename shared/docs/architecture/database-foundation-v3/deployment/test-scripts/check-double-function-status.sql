-- Check if we still have the double function issue
SELECT COUNT(*) as total_log_audit_event_functions
FROM information_schema.routines 
WHERE routine_name = 'log_audit_event';

-- Show both function signatures
SELECT 
    r.specific_name,
    COUNT(p.parameter_name) as parameter_count,
    STRING_AGG(
        COALESCE(p.parameter_name, 'NO_PARAMS') || ' ' || COALESCE(p.data_type, 'NO_TYPE'), 
        ', ' ORDER BY p.ordinal_position
    ) as signature
FROM information_schema.routines r
LEFT JOIN information_schema.parameters p ON r.specific_name = p.specific_name
WHERE r.routine_name = 'log_audit_event'
GROUP BY r.specific_name
ORDER BY COUNT(p.parameter_name) DESC;