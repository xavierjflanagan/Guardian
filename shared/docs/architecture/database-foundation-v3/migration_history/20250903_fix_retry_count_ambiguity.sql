-- =============================================================================
-- FIX: Remaining ambiguity in retry_count reference
-- =============================================================================
-- Problem: retry_count in WHERE clause is ambiguous
-- Solution: Qualify with job_queue prefix
-- Created: 2025-09-03
-- =============================================================================

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
    
    -- First, reclaim timed-out jobs (heartbeat expired)
    UPDATE job_queue SET
        status = 'pending',
        worker_id = NULL,
        started_at = NULL,
        heartbeat_at = NULL,
        job_queue.retry_count = job_queue.retry_count + 1,  -- FIXED: Qualify both sides
        scheduled_at = NOW() + INTERVAL '5 seconds',
        error_details = COALESCE(error_details, '{}'::jsonb) || jsonb_build_object(
            'error_type', 'worker_timeout',
            'original_worker', job_queue.worker_id,  -- FIXED: Qualify
            'timeout_at', NOW()
        )
    WHERE status = 'processing'
    AND heartbeat_at < timeout_threshold
    AND job_queue.retry_count < job_queue.max_retries;  -- FIXED: Qualify both
    
    -- Move permanently failed jobs to dead letter queue
    UPDATE job_queue SET
        status = 'failed',
        dead_letter_at = NOW(),
        error_details = COALESCE(error_details, '{}'::jsonb) || jsonb_build_object(
            'dead_letter_reason', 'exceeded_max_retries_after_timeout',
            'final_worker', job_queue.worker_id,  -- FIXED: Qualify
            'dead_lettered_at', NOW()
        )
    WHERE status = 'processing'
    AND heartbeat_at < timeout_threshold
    AND job_queue.retry_count >= job_queue.max_retries;  -- FIXED: Qualify both
    
    -- Claim next available job
    RETURN QUERY
    UPDATE job_queue 
    SET 
        status = 'processing',
        started_at = NOW(),
        worker_id = p_worker_id,
        heartbeat_at = heartbeat_expiry
    WHERE id = (
        SELECT jq.id FROM job_queue jq  -- FIXED: Use alias to avoid confusion
        WHERE jq.status = 'pending' 
        AND jq.scheduled_at <= NOW()
        AND (p_job_types IS NULL OR jq.job_type = ANY(p_job_types))
        AND (p_job_lanes IS NULL OR jq.job_lane = ANY(p_job_lanes))
        ORDER BY jq.priority DESC, jq.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    -- FIXED: Fully qualify ALL columns with aliases to avoid any ambiguity
    RETURNING 
        job_queue.id AS job_id,
        job_queue.job_type AS job_type,
        job_queue.job_payload AS job_payload,
        job_queue.retry_count AS retry_count;
END;
$$;