-- =============================================================================
-- INCREASE WORKER TIMEOUT FOR GPT-5 AI PROCESSING
-- =============================================================================
-- Date: October 6, 2025
-- Status: ✅ DEPLOYED - Source of truth updated in 08_job_coordination.sql
--
-- Problem: GPT-5 vision processing takes 10-15 minutes for complex medical docs
--          Current 5-minute timeout causes jobs to fail with worker_timeout error
-- Solution: Increase timeout from 300s (5min) → 1800s (30min)
--
-- Root Cause Analysis:
-- - Job 26cd2686-5abe-47b4-9174-e49e96caf66b timed out after ~17 minutes
-- - GPT-5 vision API is significantly slower than GPT-4o for complex documents
-- - 2-page medical document with detailed entity extraction needs extended processing time
--
-- Impact: Allows AI processing jobs to complete without timeout failures
-- Source of Truth: Updated in current_schema/08_job_coordination.sql line 482
-- =============================================================================

BEGIN;

-- Update worker timeout configuration
UPDATE system_configuration
SET config_value = '1800'::jsonb,  -- 30 minutes (was 300 = 5 minutes)
    updated_at = NOW()
WHERE config_key = 'worker.timeout_seconds';

-- Verify the update
DO $$
DECLARE
    current_timeout INTEGER;
BEGIN
    SELECT (config_value #>> '{}')::INTEGER INTO current_timeout
    FROM system_configuration
    WHERE config_key = 'worker.timeout_seconds';

    IF current_timeout = 1800 THEN
        RAISE NOTICE 'SUCCESS: Worker timeout updated to 1800 seconds (30 minutes)';
    ELSE
        RAISE EXCEPTION 'FAILED: Worker timeout is % seconds, expected 1800', current_timeout;
    END IF;
END $$;

COMMIT;

-- =============================================================================
-- DEPLOYMENT NOTES
-- =============================================================================
-- 1. Run this migration in Supabase SQL Editor
-- 2. No worker restart required - timeout is checked on each job claim
-- 3. Active jobs will continue with old timeout; new jobs use new timeout
-- 4. Monitor job_queue.error_details for 'worker_timeout' errors
--
-- Rollback (if needed):
-- UPDATE system_configuration SET config_value = '300'::jsonb WHERE config_key = 'worker.timeout_seconds';
-- =============================================================================
