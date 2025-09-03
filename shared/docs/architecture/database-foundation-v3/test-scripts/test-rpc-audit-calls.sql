-- ========================================
-- TEST RPC AUDIT CALLS DIRECTLY
-- ========================================
-- Purpose: Test if enqueue_job_v3 and complete_job actually call audit logging

-- Step 1: Clean up any existing test job
DELETE FROM job_queue WHERE job_name = 'Audit Test Job';

-- Step 2: Create a simple test job to trigger audit logging
SELECT enqueue_job_v3(
    'shell_file_processing',                    
    'Audit Test Job',                     
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

-- Step 3: Check if enqueue_job_v3 created audit records
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
   AND reason LIKE '%correlation%'
ORDER BY changed_at DESC 
LIMIT 5;