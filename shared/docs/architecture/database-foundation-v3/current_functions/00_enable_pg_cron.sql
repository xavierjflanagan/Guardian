-- ============================================================================
-- DEPRECATED: pg_cron Extension Setup
-- Status: NOT USED - Requires Supabase Pro plan ($25/mo)
-- Current Approach: Manual requeue when needed (free tier compatible)
-- ============================================================================
--
-- DECISION: Stay on free tier, manually requeue stale jobs during pre-launch
--
-- This file is kept for future reference when we upgrade to Pro tier.
-- When upgraded, run this to enable pg_cron for automated watchdog.
--
-- ============================================================================

-- Enable the pg_cron extension (REQUIRES PRO PLAN)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Verify it's enabled
-- SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- ============================================================================
-- CURRENT MANUAL APPROACH (Free Tier):
-- ============================================================================
-- When you detect a stale job (heartbeat >2 minutes old), run this SQL:

-- Manual Requeue of Stale Jobs:
/*
UPDATE job_queue
SET
  status = 'pending',
  lock_acquired_at = NULL,
  heartbeat_at = NULL,
  last_error = 'Manually requeued - stale heartbeat detected at ' || NOW(),
  retry_count = retry_count + 1,
  scheduled_at = NOW()
WHERE status = 'processing'
  AND heartbeat_at < NOW() - INTERVAL '2 minutes'
  AND retry_count < max_retries;

-- Check results:
SELECT
  id,
  job_type,
  status,
  retry_count,
  last_error,
  heartbeat_at
FROM job_queue
WHERE status = 'processing' OR updated_at > NOW() - INTERVAL '5 minutes'
ORDER BY updated_at DESC;
*/

-- ============================================================================
-- Future: When Upgraded to Pro
-- ============================================================================
-- 1. Uncomment and run: CREATE EXTENSION IF NOT EXISTS pg_cron;
-- 2. Run: watchdog-requeue-stale-jobs.sql (automated cron-based requeue)
-- ============================================================================
