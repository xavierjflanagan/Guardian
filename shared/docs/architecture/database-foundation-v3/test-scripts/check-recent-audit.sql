-- Check if ANY recent audit records exist (last 5 minutes)
SELECT 
    id,
    table_name,
    operation,
    new_values,
    reason,
    changed_at
FROM audit_log 
WHERE changed_at > NOW() - INTERVAL '5 minutes'
ORDER BY changed_at DESC;