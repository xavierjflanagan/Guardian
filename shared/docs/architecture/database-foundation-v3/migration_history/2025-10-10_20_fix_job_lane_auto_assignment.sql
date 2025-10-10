-- ============================================================================
-- Migration: Fix Job Lane Auto-Assignment in enqueue_job_v3 Function
-- Date: 2025-10-10
-- Issue: NULL job_lane values preventing worker from claiming jobs
--
-- PROBLEM:
--   After removing p_job_lane parameter from enqueue_job_v3 RPC calls to fix
--   Edge Function 500 errors, the function no longer sets job_lane values.
--   This results in NULL job_lane for new jobs, which prevents the worker
--   from claiming and processing them since the worker filters by specific
--   lane values ('ai_queue_simple', 'standard_queue', etc.).
--
-- SOLUTION:
--   Update enqueue_job_v3 function to automatically assign job_lane based on
--   job_type. This maintains backward compatibility while fixing the immediate
--   issue. Auto-assignment rules:
--   - 'ai_processing' -> 'ai_queue_simple'
--   - 'shell_file_processing' -> 'standard_queue'
--   - Other types remain NULL (as designed)
--
-- AFFECTED TABLES:
--   - job_queue (indirectly - affects future insertions)
--
-- AFFECTED FUNCTIONS:
--   - enqueue_job_v3() - modified to auto-assign lanes
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/08_job_coordination.sql
--      - Lines 601-692: Updated enqueue_job_v3 function definition with auto-assignment
--
-- SCHEMA DOCUMENTATION UPDATED:
--   [X] No bridge schema changes needed (function signature unchanged for external callers)
--
-- MIGRATION EXECUTED:
--   [X] Applied to Supabase on 2025-10-10 via MCP
--   [X] Verified existing NULL job_lanes fixed (0 remaining)
--   [X] Confirmed function security hardening applied
--
-- MIGRATION STRATEGY:
--   Single-step function replacement using DROP and CREATE (PostgreSQL requirement)
-- ============================================================================

-- Update enqueue_job_v3 function to auto-assign job_lane based on job_type
CREATE OR REPLACE FUNCTION enqueue_job_v3(
    job_type text,
    job_name text,
    job_payload jsonb,
    job_category text,
    priority integer,
    p_scheduled_at timestamptz,
    OUT job_id uuid,
    OUT scheduled_at timestamptz
)
RETURNS RECORD
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- Security: Prevent search_path injection
AS $$
DECLARE
    allowed_types text[] := ARRAY['shell_file_processing', 'ai_processing', 'data_migration', 'audit_cleanup', 
                                  'system_maintenance', 'notification_delivery', 'report_generation', 'backup_operation',
                                  'semantic_processing', 'consent_verification', 'provider_verification'];
    v_job_lane text;
    backpressure_delay INTEGER := 0;
    rate_limit_config RECORD;
BEGIN
    -- Validate job_type
    IF NOT (job_type = ANY(allowed_types)) THEN
        RAISE EXCEPTION 'Invalid job_type. Allowed: %', allowed_types;
    END IF;
    
    -- Auto-assign job_lane based on job_type (NEW: fixes NULL lane issue)
    v_job_lane := COALESCE(
        job_payload->>'job_lane',  -- Check if explicitly provided in payload
        CASE 
            WHEN job_type = 'ai_processing' THEN 'ai_queue_simple'
            WHEN job_type = 'shell_file_processing' THEN 'standard_queue'
            ELSE NULL
        END
    );
    
    -- Validate job_lane combinations
    IF job_type = 'shell_file_processing' AND v_job_lane NOT IN ('fast_queue', 'standard_queue') THEN
        RAISE EXCEPTION 'shell_file_processing requires job_lane: fast_queue or standard_queue';
    ELSIF job_type = 'ai_processing' AND v_job_lane NOT IN ('ai_queue_simple', 'ai_queue_complex') THEN
        RAISE EXCEPTION 'ai_processing requires job_lane: ai_queue_simple or ai_queue_complex';
    ELSIF job_type IN ('data_migration', 'audit_cleanup', 'system_maintenance', 'notification_delivery', 'report_generation', 'backup_operation', 'semantic_processing', 'consent_verification', 'provider_verification') AND v_job_lane IS NOT NULL THEN
        RAISE EXCEPTION 'job_type % should not have job_lane', job_type;
    END IF;
    
    IF job_payload IS NULL OR job_payload = '{}'::jsonb THEN
        RAISE EXCEPTION 'job_payload cannot be empty';
    END IF;
    
    -- Add token estimate to job payload for proper tracking
    job_payload := job_payload || jsonb_build_object('estimated_tokens', COALESCE((job_payload->>'estimated_tokens')::INTEGER, 1000));
    
    -- Defensive backpressure query (hardcoded provider/endpoint for MVP)
    IF job_type = 'ai_processing' THEN
        SELECT backpressure_delay_seconds INTO backpressure_delay
        FROM api_rate_limits 
        WHERE provider_name = 'openai' 
        AND api_endpoint = 'gpt-4o-mini'
        AND status = 'active'
        AND (current_requests_minute::float / NULLIF(requests_per_minute, 0)) > backpressure_threshold;
        
        -- NULL-safe handling
        backpressure_delay := COALESCE(backpressure_delay, 0);
        
        IF backpressure_delay > 0 THEN
            p_scheduled_at := p_scheduled_at + (backpressure_delay || ' seconds')::INTERVAL;
        END IF;
    END IF;
    
    -- Insert job with auto-assigned lane
    INSERT INTO job_queue (job_type, job_lane, job_name, job_payload, job_category, priority, scheduled_at)
    VALUES (job_type, v_job_lane, job_name, job_payload, job_category, priority, p_scheduled_at)
    RETURNING id INTO job_id;
    
    -- Audit logging
    PERFORM log_audit_event(
        'job_queue',
        job_id::text,
        'INSERT',
        NULL,
        jsonb_build_object('job_type', job_type, 'job_lane', v_job_lane, 'job_id', job_id, 'scheduled_at', p_scheduled_at),
        'Job enqueued with auto-assigned lane',
        'system',
        NULL -- p_patient_id (NULL for system operations)
    );
    
    scheduled_at := p_scheduled_at;
    RETURN;
END;
$$;

-- Security: Lock down function execution to service role only (defense-in-depth)
REVOKE EXECUTE ON FUNCTION enqueue_job_v3(text, text, jsonb, text, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_job_v3(text, text, jsonb, text, integer, timestamptz) TO service_role;

-- ============================================================================
-- Fix Existing NULL job_lane Records
-- ============================================================================

-- Update existing jobs with NULL job_lane to proper values based on job_type
UPDATE job_queue 
SET job_lane = CASE 
    WHEN job_type = 'ai_processing' THEN 'ai_queue_simple'
    WHEN job_type = 'shell_file_processing' THEN 'standard_queue'
    ELSE job_lane -- Leave other types unchanged
END
WHERE job_lane IS NULL 
AND job_type IN ('ai_processing', 'shell_file_processing')
AND status IN ('pending', 'processing'); -- Only update active jobs

-- ============================================================================
-- Verification Queries
-- ============================================================================
-- Verify function was updated correctly
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_name = 'enqueue_job_v3' 
AND routine_schema = 'public';

-- Check for remaining NULL job_lanes that should have values
SELECT id, job_type, job_lane, status, created_at
FROM job_queue
WHERE job_lane IS NULL 
AND job_type IN ('ai_processing', 'shell_file_processing')
AND status IN ('pending', 'processing')
ORDER BY created_at DESC
LIMIT 10;

-- Verify recent job assignments
SELECT id, job_type, job_lane, status, created_at
FROM job_queue
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- Rollback Script (If Needed)
-- ============================================================================
/*
-- This rollback would restore the previous version without auto-assignment
-- NOTE: You would need to copy the previous function definition here
-- Since we're fixing a bug, rollback is unlikely to be needed
-- But if required, you could restore the previous version that accepted p_job_lane

CREATE OR REPLACE FUNCTION enqueue_job_v3(
    -- [Previous function signature and body would go here]
);

-- Reset any job_lane values set by this migration back to NULL
UPDATE job_queue 
SET job_lane = NULL
WHERE job_lane IN ('ai_queue_simple', 'standard_queue')
AND created_at > '2025-10-10 00:00:00'::timestamptz; -- Adjust timestamp as needed
*/