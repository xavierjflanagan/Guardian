-- =============================================================================
-- HOTFIX: Fix ambiguous column references in claim_next_job_v3 function
-- =============================================================================
-- Problem: Parameter names conflict with column names causing ambiguity (worker_id, retry_count)
-- Solution: Rename function parameters with p_ prefix to follow Supabase conventions
-- Status: APPLIED to database and source file updated
-- Created: 2025-09-03
-- 
-- Files updated:
-- - apps/render-worker/src/worker.ts (updated to use p_ prefixed parameters)
-- - shared/docs/architecture/database-foundation-v3/current_schema/08_job_coordination.sql (to be updated after applying)
-- 
-- This is the FINAL version after removing incorrect attempts
-- =============================================================================

-- Drop existing function first (required to change parameter names)
DROP FUNCTION IF EXISTS claim_next_job_v3(text, text[], text[]);

-- Recreate with properly named parameters
CREATE OR REPLACE FUNCTION claim_next_job_v3(
    p_worker_id text,  -- Renamed to avoid conflict with job_queue.worker_id column
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
    jitter_max INTEGER;
    jitter_delay INTEGER;
BEGIN
    -- Get timeout as INTEGER then derive TIMESTAMPTZ
    SELECT (config_value #>> '{}')::INTEGER INTO timeout_seconds FROM system_configuration WHERE config_key = 'worker.timeout_seconds';
    SELECT (config_value #>> '{}')::INTEGER INTO heartbeat_interval FROM system_configuration WHERE config_key = 'worker.heartbeat_interval_seconds';
    SELECT (config_value #>> '{}')::INTEGER INTO jitter_max FROM system_configuration WHERE config_key = 'worker.reclaim_jitter_max_seconds';
    
    -- Fallback to defaults if config not found
    timeout_seconds := COALESCE(timeout_seconds, 300);
    timeout_threshold := NOW() - INTERVAL '1 second' * timeout_seconds;
    heartbeat_interval := COALESCE(heartbeat_interval, 30);
    heartbeat_expiry := NOW() + (heartbeat_interval || ' seconds')::INTERVAL;
    jitter_max := COALESCE(jitter_max, 60);
    
    -- Add jitter to prevent thundering herd
    IF jitter_max > 0 THEN
        jitter_delay := floor(random() * jitter_max * 1000)::INTEGER;
        PERFORM pg_sleep(jitter_delay / 1000.0);
    END IF;
    
    -- Reclaim abandoned jobs
    UPDATE job_queue 
    SET status = 'pending', 
        worker_id = NULL, 
        started_at = NULL,
        heartbeat_at = NULL
    WHERE status = 'processing'
    AND heartbeat_at < timeout_threshold;
    
    -- Move jobs to dead letter queue if max retries exceeded
    UPDATE job_queue 
    SET status = 'failed', 
        completed_at = NOW()
    WHERE status = 'processing'
    AND heartbeat_at < timeout_threshold
    AND retry_count >= max_retries;
    
    -- Claim next available job
    RETURN QUERY
    UPDATE job_queue 
    SET 
        status = 'processing',
        started_at = NOW(),
        worker_id = p_worker_id,  -- Now uses p_ prefix
        heartbeat_at = heartbeat_expiry
    WHERE id = (
        SELECT id FROM job_queue 
        WHERE status = 'pending' 
        AND scheduled_at <= NOW()
        AND (p_job_types IS NULL OR job_type = ANY(p_job_types))  -- Now uses p_ prefix
        AND (p_job_lanes IS NULL OR job_lane = ANY(p_job_lanes))  -- Now uses p_ prefix
        ORDER BY priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    -- Qualify column names in RETURNING to be explicit
    RETURNING job_queue.id, job_queue.job_type, job_queue.job_payload, job_queue.retry_count;
END;
$$;