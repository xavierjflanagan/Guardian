-- =============================================================================
-- Migration 00: Add Heartbeat Index for Job Queue Monitoring
-- Date: 2025-09-03
-- Purpose: Optimize queries that find stale/timed-out jobs
-- =============================================================================
--
-- PROBLEM:
--   - Watchdog and reclaim queries scan entire job_queue table
--   - Looking for jobs with stale heartbeats is slow without index
--   - Performance degrades as job_queue grows
--
-- SOLUTION:
--   - Add partial index on heartbeat_at WHERE status = 'processing'
--   - Only indexes actively processing jobs (small subset)
--   - Optimizes: watchdog requeue, worker reclaim, monitoring queries
--
-- SOURCE OF TRUTH SCHEMA:
--   ✅ current_schema/07_optimization.sql
--      - Line 380: CREATE INDEX idx_job_queue_heartbeat
--
-- IMPACT:
--   - Query performance: O(n) table scan → O(log n) index lookup
--   - Watchdog can run every minute without performance penalty
--   - Prevents table scan when checking for expired heartbeats
-- =============================================================================

-- Add partial index for efficient heartbeat timeout queries
CREATE INDEX IF NOT EXISTS idx_job_queue_heartbeat 
ON job_queue(heartbeat_at) 
WHERE status = 'processing';

-- This index specifically helps this query in claim_next_job_v3:
-- WHERE status = 'processing' AND heartbeat_at < timeout_threshold