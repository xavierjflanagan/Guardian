-- =============================================================================
-- FIX: Update complete_job function to use correct column name
-- =============================================================================
-- Problem: complete_job function references result_data instead of job_result
-- Solution: Recreate function with correct column name
-- Created: 2025-09-03
-- =============================================================================

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
        job_result = p_job_result,  -- FIXED: Use job_result not result_data
        updated_at = NOW()
    WHERE id = p_job_id 
    AND worker_id = p_worker_id
    AND status = 'processing';
    
    -- Audit logging
    PERFORM log_audit_event(
        'job_queue',
        p_job_id::text,
        'UPDATE',
        NULL,
        jsonb_build_object('status', 'completed', 'job_id', p_job_id, 'worker_id', p_worker_id),
        'Job completed successfully',
        'system',
        NULL
    );
    
    RETURN FOUND;
END;
$$;