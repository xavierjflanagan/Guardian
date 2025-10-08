-- =============================================================================
-- FINAL FIX: Fully qualify ALL columns in claim_next_job_v3 RETURNING clause
-- =============================================================================
-- Problem: Column references are ambiguous (job_type, job_payload, retry_count)
-- Solution: Fully qualify ALL columns with job_queue prefix
-- Created: 2025-09-03
-- =============================================================================

-- Drop and recreate with all fixes combined
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
        AND (p_job_types IS NULL OR job_queue.job_type = ANY(p_job_types))
        AND (p_job_lanes IS NULL OR job_queue.job_lane = ANY(p_job_lanes))
        ORDER BY priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    -- CRITICAL: Must fully qualify ALL columns to avoid ambiguity
    RETURNING 
        job_queue.id AS job_id,
        job_queue.job_type AS job_type,
        job_queue.job_payload AS job_payload,
        job_queue.retry_count AS retry_count;
END;
$$;