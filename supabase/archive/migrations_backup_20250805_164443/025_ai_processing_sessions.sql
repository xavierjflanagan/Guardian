-- Guardian v7: AI Processing Foundation (Minimal MLOps)
-- Migration: 025_ai_processing_sessions.sql
-- Purpose: External API processing tracking for healthcare compliance
-- Date: 2025-08-04
-- Implements: Gemini-Claude Collaborative Synthesis v7.2

-- AI processing sessions for external API tracking
CREATE TABLE ai_processing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id),
    user_id UUID NOT NULL REFERENCES auth.users(id), -- Direct user attribution
    profile_id UUID REFERENCES user_profiles(id), -- Multi-profile support
    
    -- External API tracking (OpenAI GPT-4o Mini, Google Cloud Vision)
    processing_pipeline JSONB NOT NULL,
    -- Example: {
    --   "ocr": {"service": "google_vision", "api_version": "v1", "features": ["TEXT_DETECTION"]},
    --   "llm": {"service": "openai", "model": "gpt-4o-mini", "version": "2024-07-18"},
    --   "cost_estimate": {"ocr_usd": 0.15, "llm_usd": 0.85, "total_usd": 1.00}
    -- }
    
    -- Performance and quality metrics
    api_costs_usd NUMERIC(10,4),        -- Cost attribution for external APIs
    processing_duration_ms INTEGER,     -- Performance monitoring
    confidence_scores JSONB,            -- AI confidence metrics per extraction
    quality_metrics JSONB,              -- Accuracy, completeness scores
    
    -- Error handling and retry logic
    error_details JSONB,                -- API errors, rate limits, timeouts
    retry_count INTEGER DEFAULT 0,
    retry_strategy TEXT,                -- 'exponential_backoff', 'immediate', 'manual'
    
    -- Processing status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- Audit and compliance
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link clinical extractions to processing sessions for traceability
-- This provides the critical healthcare compliance requirement: "What AI system extracted this clinical data?"
ALTER TABLE clinical_fact_sources 
ADD COLUMN processing_session_id UUID REFERENCES ai_processing_sessions(id);

-- AI processing error tracking for operational monitoring
CREATE TABLE ai_processing_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id),
    document_id UUID NOT NULL REFERENCES documents(id),
    
    -- Error classification
    error_type TEXT NOT NULL, -- 'api_timeout', 'rate_limit', 'parsing_error', 'insufficient_confidence'
    error_message TEXT NOT NULL,
    error_context JSONB, -- Full error response, stack trace, API response
    
    -- Resolution tracking
    resolved_at TIMESTAMPTZ,
    resolution_method TEXT, -- 'retry_successful', 'manual_intervention', 'alternative_api'
    resolution_notes TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Processing session performance tracking
CREATE TABLE ai_processing_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Daily aggregates
    total_sessions INTEGER DEFAULT 0,
    successful_sessions INTEGER DEFAULT 0,
    failed_sessions INTEGER DEFAULT 0,
    
    -- Performance metrics
    avg_processing_time_ms INTEGER,
    p95_processing_time_ms INTEGER,
    total_api_cost_usd NUMERIC(10,2),
    
    -- Quality metrics
    avg_confidence_score NUMERIC(3,2),
    manual_review_rate NUMERIC(3,2), -- Percentage requiring human review
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Policies for AI Processing

-- User isolation for AI processing sessions
ALTER TABLE ai_processing_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_processing_isolation ON ai_processing_sessions
    FOR ALL USING (user_id = auth.uid());

-- User isolation for processing errors  
ALTER TABLE ai_processing_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_processing_errors_isolation ON ai_processing_errors
    FOR ALL USING (
        document_id IN (
            SELECT id FROM documents WHERE user_id = auth.uid()
        )
    );

-- Metrics are system-wide (admin access only)
ALTER TABLE ai_processing_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_processing_metrics_admin_only ON ai_processing_metrics
    FOR ALL USING (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin')
    );

-- AI Processing Utility Functions

-- Create processing session for document
CREATE OR REPLACE FUNCTION create_ai_processing_session(
    p_document_id UUID,
    p_processing_pipeline JSONB,
    p_user_id UUID DEFAULT auth.uid(),
    p_profile_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    session_id UUID;
BEGIN
    INSERT INTO ai_processing_sessions (
        document_id, user_id, profile_id, processing_pipeline, status
    ) VALUES (
        p_document_id, p_user_id, p_profile_id, p_processing_pipeline, 'pending'
    ) RETURNING id INTO session_id;
    
    RETURN session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update processing session with results
CREATE OR REPLACE FUNCTION complete_ai_processing_session(
    p_session_id UUID,
    p_confidence_scores JSONB,
    p_api_costs_usd NUMERIC,
    p_processing_duration_ms INTEGER,
    p_status TEXT DEFAULT 'completed'
) RETURNS VOID AS $$
BEGIN
    UPDATE ai_processing_sessions SET
        confidence_scores = p_confidence_scores,
        api_costs_usd = p_api_costs_usd,
        processing_duration_ms = p_processing_duration_ms,
        status = p_status,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record processing error
CREATE OR REPLACE FUNCTION record_ai_processing_error(
    p_session_id UUID,
    p_error_type TEXT,
    p_error_message TEXT,
    p_error_context JSONB DEFAULT '{}'
) RETURNS VOID AS $$
DECLARE
    doc_id UUID;
BEGIN
    -- Get document ID from session
    SELECT document_id INTO doc_id 
    FROM ai_processing_sessions 
    WHERE id = p_session_id;
    
    -- Record error
    INSERT INTO ai_processing_errors (
        processing_session_id, document_id, error_type, error_message, error_context
    ) VALUES (
        p_session_id, doc_id, p_error_type, p_error_message, p_error_context
    );
    
    -- Update session status
    UPDATE ai_processing_sessions SET
        status = 'failed',
        retry_count = retry_count + 1,
        updated_at = NOW()
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Indexes for performance
CREATE INDEX idx_ai_processing_sessions_user_id ON ai_processing_sessions(user_id);
CREATE INDEX idx_ai_processing_sessions_document_id ON ai_processing_sessions(document_id);
CREATE INDEX idx_ai_processing_sessions_status ON ai_processing_sessions(status);
CREATE INDEX idx_ai_processing_sessions_created_at ON ai_processing_sessions(created_at);

CREATE INDEX idx_ai_processing_errors_session_id ON ai_processing_errors(processing_session_id);
CREATE INDEX idx_ai_processing_errors_error_type ON ai_processing_errors(error_type);

CREATE INDEX idx_ai_processing_metrics_date ON ai_processing_metrics(date);

-- Updated at trigger
CREATE TRIGGER update_ai_processing_sessions_updated_at
    BEFORE UPDATE ON ai_processing_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE ai_processing_sessions IS 'Tracks external API usage for AI processing with healthcare compliance traceability';
COMMENT ON TABLE ai_processing_errors IS 'Operational monitoring of AI processing failures and resolutions';
COMMENT ON TABLE ai_processing_metrics IS 'Daily aggregated metrics for AI processing performance and cost tracking';

COMMENT ON COLUMN ai_processing_sessions.processing_pipeline IS 'JSONB containing API service details, versions, and cost estimates';
COMMENT ON COLUMN ai_processing_sessions.api_costs_usd IS 'Total cost in USD for external API calls in this session';
COMMENT ON COLUMN clinical_fact_sources.processing_session_id IS 'Links clinical extractions to the AI processing session that created them';