-- ========================================
-- AUDIT LOGGING DIAGNOSTIC QUERIES
-- ========================================
-- Purpose: Investigate why audit logging returned no rows

-- Step 1: Check if audit_log table has ANY data at all
SELECT COUNT(*) as total_audit_records FROM audit_log;

-- Step 2: Show the most recent audit entries (any table)
SELECT 
    id,
    table_name,
    operation,
    reason,
    changed_at
FROM audit_log 
ORDER BY changed_at DESC 
LIMIT 5;

-- Step 3: Check if audit_log table exists and has correct structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'audit_log' 
ORDER BY ordinal_position;

-- Step 4: Check recent job_queue entries to see if they exist
SELECT 
    id,
    job_name,
    status,
    created_at
FROM job_queue 
WHERE job_name = 'V3 Pipeline Test Job'
ORDER BY created_at DESC 
LIMIT 3;