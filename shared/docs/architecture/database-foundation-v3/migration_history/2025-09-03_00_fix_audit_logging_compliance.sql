-- =============================================================================
-- MIGRATION: Fix Healthcare Compliance - Enable Audit Logging in RPC Functions
-- =============================================================================
-- Date: 2025-09-03 13:00:00
-- Purpose: Ensure enqueue_job_v3 and complete_job functions call log_audit_event
-- Issue: RPC functions not creating audit trails (HIPAA/healthcare compliance violation)
-- Impact: Enables required healthcare audit logging for patient data operations
-- 
-- SOURCE FILES: NO CHANGES NEEDED (already correct in current_schema/08_job_coordination.sql)
-- 
-- DEPLOYMENT STATUS: ⏳ Ready for deployment
-- =============================================================================

-- Update enqueue_job_v3 function to include audit logging (healthcare compliance)
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
BEGIN
    -- Validation
    IF NOT (job_type = ANY(allowed_types)) THEN
        RAISE EXCEPTION 'Invalid job_type. Allowed: %', allowed_types;
    END IF;
    
    IF job_payload IS NULL OR job_payload = '{}'::jsonb THEN
        RAISE EXCEPTION 'job_payload cannot be empty';
    END IF;
    
    -- Insert job
    INSERT INTO job_queue (job_type, job_lane, job_name, job_payload, job_category, priority, scheduled_at)
    VALUES (job_type, p_job_lane, job_name, job_payload, job_category, priority, p_scheduled_at)
    RETURNING id INTO job_id;
    
    -- HEALTHCARE COMPLIANCE: Audit logging for all job operations
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

-- Update complete_job function to include audit logging (healthcare compliance)
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
    UPDATE job_queue SET
        status = 'completed',
        completed_at = NOW(),
        job_result = p_job_result,
        updated_at = NOW()
    WHERE id = p_job_id 
    AND worker_id = p_worker_id
    AND status = 'processing';
    
    -- HEALTHCARE COMPLIANCE: Audit logging for job completion
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

-- Ensure proper permissions
REVOKE EXECUTE ON FUNCTION enqueue_job_v3(text, text, jsonb, text, int, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION complete_job(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_job_v3(text, text, jsonb, text, int, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION complete_job(uuid, text, jsonb) TO service_role;