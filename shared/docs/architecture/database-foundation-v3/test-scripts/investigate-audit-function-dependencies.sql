-- =============================================================================
-- INVESTIGATION: Audit Function Dependencies and Impact Analysis
-- =============================================================================
-- Before dropping any function, we need to understand what depends on it
-- This prevents breaking existing functionality

-- 1. Check what functions call log_audit_event (dependency analysis)
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_definition ILIKE '%log_audit_event%'
    AND routine_name != 'log_audit_event'
ORDER BY routine_name;

-- 2. Get exact signatures of both functions to understand the difference
SELECT 
    r.specific_name,
    r.routine_name,
    STRING_AGG(
        p.parameter_name || ' ' || p.data_type || 
        CASE WHEN p.parameter_default IS NOT NULL THEN ' DEFAULT ' || p.parameter_default ELSE '' END,
        ', ' ORDER BY p.ordinal_position
    ) as full_signature
FROM information_schema.routines r
LEFT JOIN information_schema.parameters p ON r.specific_name = p.specific_name
WHERE r.routine_name = 'log_audit_event'
GROUP BY r.specific_name, r.routine_name
ORDER BY r.specific_name;

-- 3. Check if any RLS policies reference log_audit_event
SELECT 
    schemaname,
    tablename,
    policyname,
    qual
FROM pg_policies 
WHERE qual ILIKE '%log_audit_event%';

-- 4. Check if any triggers use log_audit_event
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE action_statement ILIKE '%log_audit_event%';

-- 5. Show recent audit_log records to understand current usage patterns
SELECT 
    table_name,
    operation,
    reason,
    compliance_category,
    changed_at,
    COUNT(*) as record_count
FROM audit_log 
WHERE changed_at > NOW() - INTERVAL '1 day'
GROUP BY table_name, operation, reason, compliance_category, changed_at
ORDER BY changed_at DESC
LIMIT 10;