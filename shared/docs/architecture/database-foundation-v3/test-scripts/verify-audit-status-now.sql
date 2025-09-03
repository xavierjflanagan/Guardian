-- Verify current audit logging status - something may have been fixed

-- Test 1: Create a new job via RPC and check for audit record immediately
SELECT 'TESTING CURRENT AUDIT STATUS' as status;

-- Clean previous test jobs  
DELETE FROM job_queue WHERE job_name LIKE 'Final Audit Test%';

-- Enqueue job via RPC
SELECT 
    job_id,
    scheduled_at,
    'Job created via RPC' as test_status
FROM enqueue_job_v3(
    'shell_file_processing',                    
    'Final Audit Test Job',                     
    jsonb_build_object(
        'shell_file_id', gen_random_uuid(),
        'patient_id', '550e8400-e29b-41d4-a716-446655440000',
        'estimated_tokens', 100,
        'test_mode', true,
        'job_lane', 'standard_queue'
    ),                                          
    'standard',                                 
    5,                                          
    NOW()                                       
);

-- Immediately check for corresponding audit record
SELECT 
    'AUDIT VERIFICATION' as check_type,
    id,
    table_name,
    operation,
    new_values->>'job_type' as job_type,
    new_values->>'job_id' as job_id,
    reason,
    changed_at
FROM audit_log 
WHERE table_name = 'job_queue'
   AND changed_at > NOW() - INTERVAL '30 seconds'
ORDER BY changed_at DESC;

-- Check total job_queue audit count
SELECT 'TOTAL JOB QUEUE AUDITS' as metric, COUNT(*) as total_count
FROM audit_log 
WHERE table_name = 'job_queue';