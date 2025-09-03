-- Diagnose why log_audit_event fails with job data
-- We'll test with incrementally similar data to isolate the issue

-- Test 1: Simple test (we know this works)
SELECT 'Test 1 - Simple' as test_name, 
       log_audit_event('test_table', gen_random_uuid()::text, 'INSERT', NULL, jsonb_build_object('test', 'simple'), 'Simple test', 'audit_system', NULL) as result;

-- Test 2: Use job_queue table name (might be a permission issue)
SELECT 'Test 2 - job_queue table' as test_name,
       log_audit_event('job_queue', gen_random_uuid()::text, 'INSERT', NULL, jsonb_build_object('test', 'job_queue'), 'Job queue test', 'audit_system', NULL) as result;

-- Test 3: Use actual job UUID
WITH recent_job AS (
    SELECT id FROM job_queue WHERE job_name = 'Audit Test Job RPC' ORDER BY created_at DESC LIMIT 1
)
SELECT 'Test 3 - Real job UUID' as test_name,
       log_audit_event('test_table', (SELECT id::text FROM recent_job), 'INSERT', NULL, jsonb_build_object('test', 'real_uuid'), 'Real UUID test', 'audit_system', NULL) as result;

-- Test 4: Use job_queue + real UUID
WITH recent_job AS (
    SELECT id FROM job_queue WHERE job_name = 'Audit Test Job RPC' ORDER BY created_at DESC LIMIT 1
)
SELECT 'Test 4 - job_queue + real UUID' as test_name,
       log_audit_event('job_queue', (SELECT id::text FROM recent_job), 'INSERT', NULL, jsonb_build_object('test', 'combined'), 'Combined test', 'audit_system', NULL) as result;

-- Test 5: Use exact job payload structure
WITH recent_job AS (
    SELECT id, created_at FROM job_queue WHERE job_name = 'Audit Test Job RPC' ORDER BY created_at DESC LIMIT 1
)
SELECT 'Test 5 - Exact payload' as test_name,
       log_audit_event('job_queue', (SELECT id::text FROM recent_job), 'INSERT', NULL, 
           jsonb_build_object('job_type', 'shell_file_processing', 'job_id', (SELECT id FROM recent_job), 'scheduled_at', (SELECT created_at FROM recent_job)), 
           'Job enqueued with correlation tracking', 'system', NULL) as result;