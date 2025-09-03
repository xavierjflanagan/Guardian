-- Check for job-related audit records specifically
SELECT 
    id,
    table_name,
    operation,
    new_values->>'job_type' as job_type,
    new_values->>'job_id' as job_id,
    reason,
    changed_at,
    changed_by
FROM audit_log 
WHERE table_name = 'job_queue'
   OR reason ILIKE '%job%'
   OR reason ILIKE '%correlation%'
ORDER BY changed_at DESC 
LIMIT 10;

-- Also check total count of job_queue audit records
SELECT COUNT(*) as job_queue_audit_count 
FROM audit_log 
WHERE table_name = 'job_queue';