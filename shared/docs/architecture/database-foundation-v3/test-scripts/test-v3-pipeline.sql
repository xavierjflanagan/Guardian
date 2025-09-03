-- ========================================
-- V3 END-TO-END PIPELINE TEST SCRIPT
-- ========================================
-- Run this in your Supabase SQL Editor
-- Expected: Job gets enqueued, claimed by worker, processed, and completed

-- Step 1: Clean up any existing test data  
DELETE FROM job_queue WHERE job_name = 'V3 Pipeline Test Job';
DELETE FROM shell_files WHERE id = '123e4567-e89b-12d3-a456-426614174000';

-- Step 1.5: Find an existing patient_id or show available ones
-- REPLACE the patient_id below with a real one from your user_profiles table!
-- Run this query first to see available patient IDs:
-- SELECT id, display_name, profile_type FROM user_profiles WHERE profile_type = 'patient' LIMIT 5;

-- Step 2: Create a test shell_files record (simulates document upload)
INSERT INTO shell_files (
    id,
    patient_id, 
    filename,
    original_filename,
    storage_path,
    file_size_bytes,
    mime_type,
    status,
    created_at
) VALUES (
    '123e4567-e89b-12d3-a456-426614174000',
    '550e8400-e29b-41d4-a716-446655440000',  -- Real patient_id from user_profiles
    'test-document.pdf',
    'test-document.pdf',
    'medical-docs/test-patient-456/test-document.pdf',
    1024000,  -- 1MB
    'application/pdf',
    'uploaded',
    NOW()
);

-- Step 3: Enqueue a job for the worker to process
SELECT enqueue_job_v3(
    'shell_file_processing',                    -- job_type
    'V3 Pipeline Test Job',                     -- job_name  
    jsonb_build_object(
        'shell_file_id', '123e4567-e89b-12d3-a456-426614174000',
        'patient_id', '550e8400-e29b-41d4-a716-446655440000',
        'estimated_tokens', 1000,
        'test_mode', true,
        'job_lane', 'standard_queue'
    ),                                          -- job_payload
    'standard',                                 -- job_category (FIXED: use valid category)
    5,                                          -- priority
    NOW()                                       -- scheduled_at
);

-- Step 4: Check job was enqueued
SELECT 
    id,
    job_type,
    job_name,
    status,
    priority,
    scheduled_at,
    job_payload->>'shell_file_id' as shell_file_id,
    job_payload->>'patient_id' as patient_id
FROM job_queue 
WHERE job_name = 'V3 Pipeline Test Job';

-- Step 5: Monitor job processing (run this repeatedly)
-- You should see: pending -> processing -> completed
SELECT 
    'JOB STATUS' as type,
    id,
    status,
    worker_id,
    started_at,
    heartbeat_at,
    completed_at,
    retry_count,
    (job_payload->>'shell_file_id')::text as shell_file_id
FROM job_queue 
WHERE job_name = 'V3 Pipeline Test Job'

UNION ALL

SELECT 
    'SHELL FILE STATUS' as type,
    id,
    status,
    NULL as worker_id,
    NULL as started_at,
    NULL as heartbeat_at,
    processing_completed_at,
    NULL as retry_count,
    NULL as shell_file_id
FROM shell_files 
WHERE id = '123e4567-e89b-12d3-a456-426614174000'

ORDER BY type DESC;

-- Expected Results:
-- 1. Job starts as 'pending'
-- 2. Worker claims it (status -> 'processing', worker_id assigned, heartbeat_at updated)
-- 3. Worker processes for ~2 seconds (simulation delay)
-- 4. Job completes (status -> 'completed', completed_at timestamp)
-- 5. Shell file status changes from 'uploaded' -> 'completed'