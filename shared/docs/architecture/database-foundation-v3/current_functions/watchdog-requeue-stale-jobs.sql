-- ============================================================================
-- Database Function: Watchdog Cron - Requeue Stale Jobs
-- Location: current_functions/watchdog-requeue-stale-jobs.sql
-- Status: NOT ACTIVE - Requires Supabase Pro plan for pg_cron
-- Current Approach: Manual requeue using SQL in 00_enable_pg_cron.sql
-- ============================================================================
--
-- DECISION: Staying on free tier during pre-launch phase
--
-- MANUAL WORKAROUND (USE THIS NOW):
-- See: 00_enable_pg_cron.sql for the simple manual requeue SQL
--
-- Quick manual requeue:
-- UPDATE job_queue SET status='pending', lock_acquired_at=NULL,
-- heartbeat_at=NULL, retry_count=retry_count+1, scheduled_at=NOW()
-- WHERE status='processing' AND heartbeat_at < NOW() - INTERVAL '2 minutes';
--
-- This file contains the FUTURE automated watchdog for when we upgrade to Pro.
-- ============================================================================

-- ============================================================================
-- STEP 1: Create Requeue Function
-- ============================================================================

CREATE OR REPLACE FUNCTION requeue_stale_jobs()
RETURNS TABLE(
  requeued_count INTEGER,
  failed_count INTEGER
) AS $$
DECLARE
  v_requeued_count INTEGER;
  v_failed_count INTEGER;
BEGIN
  -- Requeue jobs with stale heartbeats (older than 2 minutes)
  -- Add jitter (0-30 seconds) to prevent thundering herd when many jobs requeue at once
  WITH requeued AS (
    UPDATE job_queue
    SET
      status = 'pending',
      lock_acquired_at = NULL,
      heartbeat_at = NULL,
      last_error = 'Stale heartbeat detected - auto-requeued by watchdog at ' || NOW(),
      retry_count = retry_count + 1,
      scheduled_at = NOW() + (INTERVAL '1 second' * (random() * 30)::int),  -- Jitter: 0-30s delay
      updated_at = NOW()
    WHERE status = 'processing'
      AND heartbeat_at < NOW() - INTERVAL '2 minutes'
      AND retry_count < max_retries
    RETURNING id
  )
  SELECT COUNT(*) INTO v_requeued_count FROM requeued;

  -- Mark jobs that exceeded max retries as failed
  WITH failed AS (
    UPDATE job_queue
    SET
      status = 'failed',
      lock_acquired_at = NULL,
      heartbeat_at = NULL,
      last_error = 'Exceeded max retries after stale heartbeat - marked failed by watchdog at ' || NOW(),
      updated_at = NOW()
    WHERE status = 'processing'
      AND heartbeat_at < NOW() - INTERVAL '2 minutes'
      AND retry_count >= max_retries
    RETURNING id
  )
  SELECT COUNT(*) INTO v_failed_count FROM failed;

  -- Return counts
  RETURN QUERY SELECT v_requeued_count, v_failed_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 2: Schedule Cron Job (Runs Every Minute)
-- ============================================================================

-- First, unschedule if exists (idempotent)
SELECT cron.unschedule('requeue-stale-jobs')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'requeue-stale-jobs'
);

-- Schedule the watchdog to run every minute
SELECT cron.schedule(
  'requeue-stale-jobs',           -- Job name
  '* * * * *',                    -- Every minute (cron expression)
  'SELECT requeue_stale_jobs();'  -- SQL to execute
);

-- ============================================================================
-- STEP 3: Verify Setup
-- ============================================================================

-- Check the function exists
SELECT
  proname as function_name,
  pg_get_functiondef(oid) as definition
FROM pg_proc
WHERE proname = 'requeue_stale_jobs';

-- Check the cron job is scheduled
SELECT
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname = 'requeue-stale-jobs';

-- ============================================================================
-- Testing & Monitoring
-- ============================================================================

-- Manually test the function
SELECT * FROM requeue_stale_jobs();
-- Expected output: (requeued_count, failed_count)

-- View recent cron job runs
SELECT
  jobid,
  runid,
  job_pid,
  database,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'requeue-stale-jobs')
ORDER BY start_time DESC
LIMIT 10;

-- ============================================================================
-- How to Remove (If Needed)
-- ============================================================================

-- Unschedule the cron job
-- SELECT cron.unschedule('requeue-stale-jobs');

-- Drop the function
-- DROP FUNCTION IF EXISTS requeue_stale_jobs();

-- ============================================================================
-- Expected Behavior
-- ============================================================================
-- Every minute, the watchdog will:
-- 1. Find jobs with status='processing' AND heartbeat_at older than 2 minutes
-- 2. If retry_count < max_retries: Requeue the job (set status='pending')
-- 3. If retry_count >= max_retries: Mark as failed (set status='failed')
-- 4. Return counts of requeued and failed jobs

-- ============================================================================
-- Stale Job Detection Parameters
-- ============================================================================
-- Heartbeat timeout: 2 minutes
--   - Worker should update heartbeat every ~10-30 seconds
--   - If no heartbeat for 2 minutes, job is considered stale
--   - TODO: Make configurable via system_configuration table
--
-- Retry behavior:
--   - Jobs under max_retries: Requeued for retry with jitter (0-30s delay)
--   - Jobs at/over max_retries: Marked as permanently failed
--   - Jitter prevents thundering herd if many jobs requeue simultaneously
--
-- Watchdog frequency: Every 1 minute
--   - Balances responsiveness with database load
--   - Could increase to 30s for faster recovery in production
--
-- Performance:
--   - Uses idx_job_queue_heartbeat index for fast queries
--   - Complementary to worker's longer timeout reclaim logic
