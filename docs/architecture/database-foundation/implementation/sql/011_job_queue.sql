-- ⚠️  DOCUMENTATION REFERENCE COPY - DO NOT EDIT
-- 📍 SINGLE SOURCE OF TRUTH: /supabase/migrations/011_job_queue.sql
-- 🔄 This file is for architectural documentation only
-- ✏️  All changes must be made in /supabase/migrations/ directory
-- 
-- 009_job_queue.sql
-- Job Queue for Hybrid Infrastructure (Supabase + Render)
-- Enables background processing without Edge Function time limits

-- Create job queue table
CREATE TABLE IF NOT EXISTS job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT,
    result JSONB,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    worker_id TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Add indexes for efficient queries
    CONSTRAINT valid_priority CHECK (priority >= -100 AND priority <= 100)
);

-- Create indexes for efficient polling and filtering
CREATE INDEX idx_queue_status_priority ON job_queue(status, priority DESC, scheduled_for, created_at);
CREATE INDEX idx_queue_type_status ON job_queue(type, status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_queue_created_by ON job_queue(created_by);
CREATE INDEX idx_queue_scheduled ON job_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_queue_processing_timeout ON job_queue(started_at) WHERE status = 'processing';

-- Enable RLS
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own jobs
CREATE POLICY "Users can view own jobs" ON job_queue
    FOR SELECT USING (
        auth.uid() = created_by
    );

-- Users can create certain job types
CREATE POLICY "Users can create allowed jobs" ON job_queue
    FOR INSERT WITH CHECK (
        auth.uid() = created_by AND
        type IN ('process_document', 'generate_report', 'export_data')
    );

-- Service role has full access
CREATE POLICY "Service role full access" ON job_queue
    FOR ALL USING (
        is_service_role()
    );

-- Job status tracking function
CREATE OR REPLACE FUNCTION update_job_status(
    p_job_id UUID,
    p_status TEXT,
    p_error TEXT DEFAULT NULL,
    p_result JSONB DEFAULT NULL
) RETURNS job_queue AS $$
DECLARE
    v_job job_queue;
BEGIN
    UPDATE job_queue
    SET 
        status = p_status,
        started_at = CASE 
            WHEN p_status = 'processing' THEN COALESCE(started_at, NOW())
            ELSE started_at
        END,
        completed_at = CASE 
            WHEN p_status IN ('completed', 'failed', 'cancelled') THEN NOW()
            ELSE completed_at
        END,
        error = COALESCE(p_error, error),
        result = COALESCE(p_result, result)
    WHERE id = p_job_id
    RETURNING * INTO v_job;
    
    RETURN v_job;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to claim a job for processing
CREATE OR REPLACE FUNCTION claim_next_job(
    p_job_types TEXT[] DEFAULT NULL,
    p_worker_id TEXT DEFAULT NULL
) RETURNS job_queue AS $$
DECLARE
    v_job job_queue;
BEGIN
    -- Use advisory lock to prevent race conditions
    PERFORM pg_advisory_xact_lock(hashtext('job_queue_claim'));
    
    -- Find and claim the next available job
    UPDATE job_queue
    SET 
        status = 'processing',
        started_at = NOW(),
        worker_id = p_worker_id,
        retry_count = retry_count + 1
    WHERE id = (
        SELECT id
        FROM job_queue
        WHERE 
            status = 'pending'
            AND scheduled_for <= NOW()
            AND retry_count < max_retries
            AND (p_job_types IS NULL OR type = ANY(p_job_types))
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING * INTO v_job;
    
    RETURN v_job;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to retry failed jobs
CREATE OR REPLACE FUNCTION retry_failed_job(
    p_job_id UUID,
    p_delay INTERVAL DEFAULT '5 minutes'
) RETURNS job_queue AS $$
DECLARE
    v_job job_queue;
BEGIN
    UPDATE job_queue
    SET 
        status = 'pending',
        scheduled_for = NOW() + p_delay,
        error = NULL,
        started_at = NULL,
        completed_at = NULL,
        worker_id = NULL
    WHERE 
        id = p_job_id 
        AND status = 'failed'
        AND retry_count < max_retries
    RETURNING * INTO v_job;
    
    RETURN v_job;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to enqueue a new job
CREATE OR REPLACE FUNCTION enqueue_job(
    p_type TEXT,
    p_payload JSONB,
    p_priority INTEGER DEFAULT 0,
    p_scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    p_metadata JSONB DEFAULT '{}'
) RETURNS job_queue AS $$
DECLARE
    v_job job_queue;
BEGIN
    INSERT INTO job_queue (
        type,
        payload,
        priority,
        scheduled_for,
        created_by,
        metadata
    ) VALUES (
        p_type,
        p_payload,
        p_priority,
        p_scheduled_for,
        auth.uid(),
        p_metadata
    )
    RETURNING * INTO v_job;
    
    RETURN v_job;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup old completed jobs (run via pg_cron)
CREATE OR REPLACE FUNCTION cleanup_old_jobs(
    p_days INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM job_queue
    WHERE 
        status IN ('completed', 'cancelled')
        AND completed_at < NOW() - (p_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- Document processing specific job helpers
CREATE OR REPLACE FUNCTION enqueue_document_processing(
    p_document_id UUID,
    p_priority INTEGER DEFAULT 0
) RETURNS job_queue AS $$
BEGIN
    RETURN enqueue_job(
        'process_document',
        jsonb_build_object(
            'document_id', p_document_id,
            'timestamp', NOW()
        ),
        p_priority
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION update_job_status TO authenticated;
GRANT EXECUTE ON FUNCTION enqueue_job TO authenticated;
GRANT EXECUTE ON FUNCTION enqueue_document_processing TO authenticated;
GRANT EXECUTE ON FUNCTION claim_next_job TO service_role;
GRANT EXECUTE ON FUNCTION retry_failed_job TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_jobs TO service_role;

-- Example: Schedule cleanup via pg_cron (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-completed-jobs', '0 2 * * *', 'SELECT cleanup_old_jobs(30);');