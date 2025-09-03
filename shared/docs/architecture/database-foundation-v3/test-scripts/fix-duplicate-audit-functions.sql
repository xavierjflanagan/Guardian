-- Fix duplicate log_audit_event functions for healthcare compliance
-- This will resolve the audit logging failure in RPC functions

-- First, let's see the signatures of both versions
SELECT 
    r.specific_name,
    r.routine_name,
    STRING_AGG(
        p.parameter_name || ' ' || p.data_type, 
        ', ' ORDER BY p.ordinal_position
    ) as parameters
FROM information_schema.routines r
LEFT JOIN information_schema.parameters p ON r.specific_name = p.specific_name
WHERE r.routine_name = 'log_audit_event'
GROUP BY r.specific_name, r.routine_name
ORDER BY r.specific_name;

-- Check which version matches our V3 schema (8 parameters)
-- Expected: p_table_name, p_record_id, p_operation, p_old_values, p_new_values, p_reason, p_compliance_category, p_patient_id
SELECT 
    r.specific_name,
    COUNT(p.parameter_name) as parameter_count
FROM information_schema.routines r
LEFT JOIN information_schema.parameters p ON r.specific_name = p.specific_name
WHERE r.routine_name = 'log_audit_event'
GROUP BY r.specific_name
ORDER BY parameter_count DESC;