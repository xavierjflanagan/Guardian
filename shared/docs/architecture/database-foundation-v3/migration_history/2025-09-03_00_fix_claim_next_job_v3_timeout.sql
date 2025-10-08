-- =============================================================================
-- HOTFIX: Fix statement timeout in claim_next_job_v3 function
-- =============================================================================
-- Problem: Function uses pg_sleep with up to 60 second delay causing timeouts
-- Solution: Remove pg_sleep entirely - jitter not needed for job claiming
-- Created: 2025-09-03
-- =============================================================================

-- First, update the default jitter config to something reasonable
UPDATE system_configuration 
SET config_value = '1'  -- 1 second max jitter instead of 60
WHERE config_key = 'worker.reclaim_jitter_max_seconds';

-- Drop and recreate the function without the problematic pg_sleep
DROP FUNCTION IF EXISTS claim_next_job_v3(text, text[], text[]);

CREATE OR REPLACE FUNCTION claim_next_job_v3(
    p_worker_id text,
    p_job_types text[] default null,
    p_job_lanes text[] default null
)
RETURNS TABLE(job_id uuid, job_type text, job_payload jsonb, retry_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    timeout_seconds INTEGER;
    timeout_threshold TIMESTAMPTZ;
    heartbeat_interval INTEGER;
    heartbeat_expiry TIMESTAMPTZ;
BEGIN
    -- Get timeout configuration
    SELECT (config_value #>> '{}')::INTEGER INTO timeout_seconds 
    FROM system_configuration 
    WHERE config_key = 'worker.timeout_seconds';
    
    SELECT (config_value #>> '{}')::INTEGER INTO heartbeat_interval 
    FROM system_configuration 
    WHERE config_key = 'worker.heartbeat_interval_seconds';
    
    -- Fallback to defaults if config not found
    timeout_seconds := COALESCE(timeout_seconds, 300);
    timeout_threshold := NOW() - INTERVAL '1 second' * timeout_seconds;
    heartbeat_interval := COALESCE(heartbeat_interval, 30);
    heartbeat_expiry := NOW() + (heartbeat_interval || ' seconds')::INTERVAL;
    
    -- REMOVED: pg_sleep with jitter - not needed for claiming jobs
    -- Jitter should be on the client side between polls, not during claim
    
    -- Cleanup stale jobs first (no worker assigned or heartbeat expired)
    UPDATE job_queue 
    SET status = 'pending', 
        worker_id = NULL, 
        started_at = NULL,
        heartbeat_at = NULL
    WHERE status = 'processing' 
    AND (
        worker_id IS NULL 
        OR heartbeat_at < timeout_threshold
    );
    
    -- Atomic claim: update and return in one operation
    RETURN QUERY
    UPDATE job_queue 
    SET 
        status = 'processing',
        started_at = NOW(),
        worker_id = p_worker_id,
        heartbeat_at = heartbeat_expiry
    WHERE id = (
        SELECT id FROM job_queue 
        WHERE status = 'pending' 
        AND scheduled_at <= NOW()
        AND (p_job_types IS NULL OR job_type = ANY(p_job_types))
        AND (p_job_lanes IS NULL OR job_lane = ANY(p_job_lanes))
        ORDER BY priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING job_queue.id, job_queue.job_type, job_queue.job_payload, job_queue.retry_count;
END;
$$;