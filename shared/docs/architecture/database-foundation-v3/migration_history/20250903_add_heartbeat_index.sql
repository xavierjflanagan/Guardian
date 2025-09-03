-- =============================================================================
-- PERFORMANCE OPTIMIZATION: Add index for heartbeat monitoring
-- =============================================================================
-- Purpose: Optimize the reclaim query that finds timed-out jobs
-- Impact: Prevents table scan when looking for expired heartbeats
-- Created: 2025-09-03
-- =============================================================================

-- Add partial index for efficient heartbeat timeout queries
CREATE INDEX IF NOT EXISTS idx_job_queue_heartbeat 
ON job_queue(heartbeat_at) 
WHERE status = 'processing';

-- This index specifically helps this query in claim_next_job_v3:
-- WHERE status = 'processing' AND heartbeat_at < timeout_threshold