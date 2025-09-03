-- Test RPC job enqueuing and verify audit logging
-- This will show us if enqueue_job_v3 actually creates audit records

-- Step 1: Clear any existing test jobs
DELETE FROM job_queue WHERE job_name = 'Audit Test Job RPC';

-- Step 2: Enqueue a job via RPC (this should trigger audit logging)
SELECT 
    job_id,
    scheduled_at
FROM enqueue_job_v3(
    'shell_file_processing',                    
    'Audit Test Job RPC',                     
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

-- Step 3: Immediately check if audit record was created
SELECT 
    id,
    table_name,
    operation,
    new_values->>'job_type' as job_type,
    new_values->>'job_id' as job_id,
    reason,
    changed_at
FROM audit_log 
WHERE table_name = 'job_queue'
   AND changed_at > NOW() - INTERVAL '1 minute'
ORDER BY changed_at DESC;

-- Step 4: Also check if the job was actually created
SELECT 
    id,
    job_type,
    job_name,
    created_at
FROM job_queue 
WHERE job_name = 'Audit Test Job RPC';