-- =============================================================================
-- COMPREHENSIVE FIX: All issues in 08_job_coordination.sql
-- =============================================================================
-- Problems Found:
-- 1. Ambiguous column references in claim_next_job_v3 RETURNING clause
-- 2. pg_sleep causing timeouts (already removed)
-- 3. Undefined jitter_delay variable still referenced after removal
-- 4. REVOKE/GRANT statements using wrong function signatures
-- =============================================================================

-- Drop and recreate claim_next_job_v3 with ALL fixes
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
        retry_count = retry_count + 1,
        scheduled_at = NOW() + INTERVAL '5 seconds',  -- FIXED: Use fixed 5 second delay instead of undefined jitter_delay
        error_details = COALESCE(error_details, '{}'::jsonb) || jsonb_build_object(
            'error_type', 'worker_timeout',
            'original_worker', worker_id,
            'timeout_at', NOW()
            -- REMOVED: 'reclaim_jitter_seconds' with undefined variable
        )
    WHERE status = 'processing'
    AND heartbeat_at < timeout_threshold
    AND retry_count < max_retries;
    
    -- Move permanently failed jobs to dead letter queue
    UPDATE job_queue SET
        status = 'failed',
        dead_letter_at = NOW(),
        error_details = COALESCE(error_details, '{}'::jsonb) || jsonb_build_object(
            'dead_letter_reason', 'exceeded_max_retries_after_timeout',
            'final_worker', worker_id,
            'dead_lettered_at', NOW()
        )
    WHERE status = 'processing'
    AND heartbeat_at < timeout_threshold
    AND retry_count >= max_retries;
    
    -- Claim next available job
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
    -- CRITICAL: Must fully qualify ALL columns with aliases to avoid ambiguity
    RETURNING 
        job_queue.id AS job_id,
        job_queue.job_type AS job_type,
        job_queue.job_payload AS job_payload,
        job_queue.retry_count AS retry_count;
END;
$$;

-- Fix REVOKE statements to use correct function signatures
-- Note: PostgreSQL requires exact parameter types in REVOKE/GRANT statements
REVOKE EXECUTE ON FUNCTION claim_next_job_v3(text, text[], text[]) FROM PUBLIC;

-- Fix GRANT statements to use correct function signatures  
GRANT EXECUTE ON FUNCTION claim_next_job_v3(text, text[], text[]) TO service_role;

-- Note: The function signature for REVOKE/GRANT doesn't change even though
-- we renamed parameters inside the function. PostgreSQL tracks by types, not names.