-- =============================================================================
-- MIGRATION: Fix log_audit_event Parameter Mismatch
-- =============================================================================
-- Date: 2025-09-03
-- Issue: Function signature ambiguity - enqueue_job_v3 and complete_job calling with 7 params instead of 8
-- Error: "function log_audit_event(unknown, text, unknown, unknown, jsonb, unknown, unknown) is not unique"
-- Root Cause: Missing 8th parameter (p_patient_id) in function calls
-- Solution: Update both functions to include NULL as 8th parameter for system operations
-- =============================================================================

-- Fix 1: Update enqueue_job_v3 function with correct 8-parameter call
CREATE OR REPLACE FUNCTION enqueue_job_v3(
    job_type text,           
    job_name text,
    job_payload jsonb,
    job_category text default 'standard',
    priority int default 5,
    p_scheduled_at timestamptz default now()
) RETURNS TABLE(job_id uuid, scheduled_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    job_id uuid;
    allowed_types text[] := ARRAY['shell_file_processing', 'ai_processing', 'data_migration', 'audit_cleanup', 
                                  'system_maintenance', 'notification_delivery', 'report_generation', 'backup_operation',
                                  'semantic_processing', 'consent_verification', 'provider_verification'];
    p_job_lane text := job_payload->>'job_lane';
    backpressure_delay INTEGER := 0;
    rate_limit_config RECORD;
BEGIN
    -- Two-column validation
    -- Validate job_type
    IF NOT (job_type = ANY(allowed_types)) THEN
        RAISE EXCEPTION 'Invalid job_type. Allowed: %', allowed_types;
    END IF;
    
    -- Validate job_lane combinations
    IF job_type = 'shell_file_processing' AND p_job_lane NOT IN ('fast_queue', 'standard_queue') THEN
        RAISE EXCEPTION 'shell_file_processing requires job_lane: fast_queue or standard_queue';
    ELSIF job_type = 'ai_processing' AND p_job_lane NOT IN ('ai_queue_simple', 'ai_queue_complex') THEN
        RAISE EXCEPTION 'ai_processing requires job_lane: ai_queue_simple or ai_queue_complex';
    ELSIF job_type IN ('data_migration', 'audit_cleanup', 'system_maintenance', 'notification_delivery', 'report_generation', 'backup_operation', 'semantic_processing', 'consent_verification', 'provider_verification') AND p_job_lane IS NOT NULL THEN
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
    
    -- Insert job with potential backpressure delay
    INSERT INTO job_queue (job_type, job_lane, job_name, job_payload, job_category, priority, scheduled_at)
    VALUES (job_type, p_job_lane, job_name, job_payload, job_category, priority, p_scheduled_at)
    RETURNING id INTO job_id;
    
    -- FIXED: Added 8th parameter (p_patient_id as NULL for system operations)
    PERFORM log_audit_event(
        'job_queue',
        job_id::text,
        'INSERT',
        NULL,
        jsonb_build_object('job_type', job_type, 'job_id', job_id, 'scheduled_at', p_scheduled_at),
        'Job enqueued with correlation tracking',
        'system',
        NULL -- p_patient_id (NULL for system operations)
    );
    
    RETURN QUERY SELECT job_id, p_scheduled_at;
END;
$$;

-- Fix 2: Update complete_job function with correct 8-parameter call
CREATE OR REPLACE FUNCTION complete_job(
    p_job_id uuid,
    p_worker_id text,
    p_job_result jsonb default null
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Update job to completed status with atomic operation
    UPDATE job_queue SET
        status = 'completed',
        completed_at = NOW(),
        result_data = p_job_result,
        worker_id = p_worker_id,
        execution_duration = NOW() - started_at
    WHERE id = p_job_id 
    AND worker_id = p_worker_id
    AND status = 'processing';
    
    -- FIXED: Added 8th parameter (p_patient_id as NULL for system operations)
    PERFORM log_audit_event(
        'job_queue',
        p_job_id::text,
        'UPDATE',
        NULL,
        jsonb_build_object('status', 'completed', 'job_id', p_job_id, 'worker_id', p_worker_id),
        'Job completed successfully',
        'system',
        NULL -- p_patient_id (NULL for system operations)
    );
    
    RETURN FOUND;
END;
$$;

-- Verification
SELECT 'Migration applied successfully. Test shell-file-processor-v3 Edge Function to verify.' as status;