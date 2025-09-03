-- ========================================
-- V3 AUDIT LOGGING VALIDATION TEST
-- ========================================
-- Purpose: Test audit logging and correlation IDs
-- Expected: Audit events are logged with proper correlation

-- Step 1: Check recent audit events from our V3 pipeline test
SELECT 
    id,
    table_name,
    record_id,
    operation,  -- FIXED: correct column name
    new_values->>'job_type' as job_type,  -- FIXED: new_values not changed_data
    new_values->>'job_id' as job_id,
    reason,  -- FIXED: reason not description
    changed_by,  -- FIXED: changed_by not performed_by
    patient_id,
    changed_at  -- FIXED: changed_at not created_at
FROM audit_log 
WHERE reason LIKE '%correlation%' 
   OR new_values->>'job_id' IS NOT NULL
ORDER BY changed_at DESC 
LIMIT 10;

-- Step 2: Check for job queue audit events specifically
SELECT 
    id,
    table_name,
    operation,  -- FIXED: operation not operation_type
    new_values,  -- FIXED: new_values not changed_data
    reason,  -- FIXED: reason not description
    changed_at  -- FIXED: changed_at not created_at
FROM audit_log 
WHERE table_name = 'job_queue'
ORDER BY changed_at DESC 
LIMIT 5;

-- Step 3: Verify our test job has audit trail
-- Replace with the job_id from our successful test: 554ea6c2-f5e1-4453-ad8a-6670e933a68a
SELECT 
    id,
    table_name,
    operation,  -- FIXED: operation not operation_type
    new_values,  -- FIXED: new_values not changed_data
    reason,  -- FIXED: reason not description
    changed_at  -- FIXED: changed_at not created_at
FROM audit_log 
WHERE new_values->>'job_id' = '554ea6c2-f5e1-4453-ad8a-6670e933a68a'
ORDER BY changed_at DESC;