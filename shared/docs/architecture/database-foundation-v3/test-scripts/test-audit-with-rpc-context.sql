-- Test audit logging with the exact same context as RPC functions
-- This will help identify what's different between working test and failing RPC

-- Get the job_id that was just created
WITH recent_job AS (
    SELECT id, created_at 
    FROM job_queue 
    WHERE job_name = 'Audit Test Job RPC' 
    ORDER BY created_at DESC 
    LIMIT 1
)
-- Test log_audit_event with the EXACT same parameters as enqueue_job_v3
SELECT log_audit_event(
    'job_queue',
    (SELECT id::text FROM recent_job),
    'INSERT',
    NULL,
    jsonb_build_object(
        'job_type', 'shell_file_processing', 
        'job_id', (SELECT id FROM recent_job), 
        'scheduled_at', (SELECT created_at FROM recent_job)
    ),
    'Job enqueued with correlation tracking',
    'system',
    NULL -- p_patient_id (NULL for system operations)
) as audit_result;

-- Check if this manual call created an audit record
SELECT 
    id,
    table_name,
    operation,
    reason,
    changed_at
FROM audit_log 
WHERE table_name = 'job_queue'
   AND changed_at > NOW() - INTERVAL '2 minutes'
ORDER BY changed_at DESC;