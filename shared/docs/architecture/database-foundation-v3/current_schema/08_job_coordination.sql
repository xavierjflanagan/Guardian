-- =============================================================================
-- 08_JOB_COORDINATION.SQL - V3 Production Scalability & Render.com Worker Coordination
-- =============================================================================
-- VERSION: 1.2 (MIGRATION 2025-11-18: Strategy A Progressive Processing Updates - Migration 47)
--   - UPDATED pass05_progressive_sessions: Deleted total_encounters_found/completed, renamed total_encounters_pending → total_pendings_created
--   - UPDATED pass05_progressive_sessions: Added total_cascades, strategy_version, reconciliation_completed_at, final_encounter_count
--   - UPDATED pass05_chunk_results: Deleted encounters_started/completed/continued
--   - UPDATED pass05_chunk_results: Renamed handoff_received/handoff_generated → cascade_context_received/cascade_package_sent
--   - UPDATED pass05_chunk_results: Added pendings_created, cascading_count, cascade_ids, continues_count, page_separation_analysis
--   - DELETED pass05_progressive_performance view (replaced by pass05_encounter_metrics)
--   - NOTE: finalize_progressive_session RPC shown here is FIXED version (Migration 52), but live Supabase RPC is BROKEN until Migration 52 executes
--
-- VERSION: 1.1 (MIGRATION 2025-09-30: Pass-Specific Metrics Restructuring)
--   - Removed usage_events table (replaced with pass-specific metrics)
--   - Added 4 new pass-specific metrics tables (pass1_entity_metrics, pass2_clinical_metrics, pass3_narrative_metrics, ai_processing_summary)
--   - Updated tracking functions to use new metrics architecture
-- Purpose: Complete V3 job coordination system with API rate limiting, worker coordination, and business analytics foundation
-- Architecture: Render.com worker integration + vendor-agnostic API rate limiting + usage analytics + subscription billing foundation
-- Dependencies: 01_foundations.sql through 07_optimization.sql (complete V3 schema stack required)
-- 
-- DESIGN DECISIONS:
-- - V3 job coordination: Enhanced job queue with heartbeat monitoring, dead letter queues, and worker coordination
-- - Vendor-agnostic API rate limiting: Multi-provider API quota management with backpressure and atomic operations
-- - Render.com worker integration: Complete RPC interface for exora-v3-worker service coordination
-- - Business analytics foundation: Usage tracking for early adopter insights and subscription billing preparation
-- - Production scalability: 1000+ user capacity with atomic operations preventing race conditions
-- - User analytics infrastructure: Early adopter behavior tracking with privacy-compliant data collection  
-- - Subscription billing foundation: Usage metering and billing cycle tracking for future monetization
-- - Healthcare compliance: Audit-compliant job processing with correlation IDs and complete traceability
-- 
-- KEY INFRASTRUCTURE COMPONENTS:
-- API Rate Limiting System:
--   - api_rate_limits table with multi-provider configuration
--   - user_usage_tracking table for billing cycle management
--   - subscription_plans table for future billing integration
-- 
-- V3 Job Coordination Functions (10 functions):
-- API Management:
--   - acquire_api_capacity(), release_api_capacity() - Atomic API quota management
-- Job Lifecycle:
--   - enqueue_job_v3(), claim_next_job_v3() - Worker coordination with heartbeat monitoring
--   - update_job_heartbeat(), reschedule_job(), complete_job() - Production job lifecycle management
-- Analytics & Business:
--   - track_shell_file_upload_usage(), track_ai_processing_usage() - Usage metering
--   - get_user_usage_status() - Real-time usage dashboard support
-- 
-- PRODUCTION FEATURES:
-- - Atomic API rate limiting prevents quota violations under high concurrency
-- - Heartbeat monitoring with configurable intervals for worker health tracking  
-- - Dead letter queue support for failed job recovery
-- - Job correlation IDs for complete audit trail and healthcare compliance
-- - Usage analytics with privacy-compliant data aggregation
-- - Subscription billing foundation with monthly billing cycle management
-- 
-- INTEGRATION POINTS:
-- - Provides complete RPC interface for exora-v3-worker Render.com service
-- - Integrates with shell_files table for document processing job tracking
-- - Usage analytics feed business intelligence and subscription billing systems
-- - API rate limiting supports OpenAI GPT-4o Mini, Google Vision, Anthropic Claude
-- - Job coordination enables V3 three-pass AI processing pipeline at scale
-- =============================================================================

BEGIN;

-- =============================================================================
-- DEPENDENCY VALIDATION
-- =============================================================================

DO $$
BEGIN
    -- Check required tables from previous migrations
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_queue') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: job_queue missing. Run 07_optimization.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_configuration') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: system_configuration missing. Run 01_foundations.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: user_profiles missing. Run 02_profiles.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shell_files') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: shell_files missing. Run 03_clinical_core.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clinical_narratives') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: clinical_narratives missing. Run 03_clinical_core.sql first.';
    END IF;
    
    -- Check required functions
    IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'has_profile_access') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: has_profile_access() missing. Run 02_profiles.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'is_service_role') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: is_service_role() missing. Run 01_foundations.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'log_audit_event') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: log_audit_event() missing. Run 01_foundations.sql first.';
    END IF;
END $$;

-- =============================================================================
-- SECTION 1: API RATE LIMITING INFRASTRUCTURE
-- =============================================================================
-- 6a. Create API rate limits table
CREATE TABLE IF NOT EXISTS api_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Provider Configuration
    provider_name TEXT NOT NULL, -- 'openai', 'google_vision', 'anthropic', etc.
    api_endpoint TEXT NOT NULL,
    
    -- Rate Limit Configuration
    requests_per_minute INTEGER NOT NULL DEFAULT 60,
    requests_per_hour INTEGER,
    tokens_per_minute INTEGER, -- For token-based APIs
    tokens_per_hour INTEGER,
    concurrent_requests INTEGER DEFAULT 10,
    
    -- Current Usage Tracking (reset periodically)
    current_requests_minute INTEGER DEFAULT 0,
    current_requests_hour INTEGER DEFAULT 0,
    current_tokens_minute INTEGER DEFAULT 0,
    current_tokens_hour INTEGER DEFAULT 0,
    active_requests INTEGER DEFAULT 0,
    
    -- Reset Timestamps
    minute_reset_at TIMESTAMPTZ DEFAULT NOW(),
    hour_reset_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Backpressure Configuration
    backpressure_threshold NUMERIC(3,2) DEFAULT 0.8, -- At 80% capacity
    backpressure_delay_seconds INTEGER DEFAULT 5,
    queue_depth_limit INTEGER DEFAULT 1000,
    
    -- Status and Monitoring
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'maintenance')),
    last_rate_limit_hit TIMESTAMPTZ,
    rate_limit_violations INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(provider_name, api_endpoint)
);

-- Insert default API rate limits for scale-ready deployment
INSERT INTO api_rate_limits (provider_name, api_endpoint, requests_per_minute, tokens_per_minute, concurrent_requests, status) VALUES
('openai', 'gpt-4o-mini', 500, 200000, 50, 'active'),     -- OpenAI GPT-4o Mini
('openai', 'gpt-4-vision', 100, 20000, 20, 'active'),     -- OpenAI Vision API
('google', 'vision-api', 1800, NULL, 100, 'active'),      -- Google Vision API (per minute)
('anthropic', 'claude-3', 400, 100000, 25, 'active')      -- Anthropic Claude
ON CONFLICT (provider_name, api_endpoint) DO UPDATE SET
    requests_per_minute = EXCLUDED.requests_per_minute,
    tokens_per_minute = EXCLUDED.tokens_per_minute,
    concurrent_requests = EXCLUDED.concurrent_requests,
    status = EXCLUDED.status,
    updated_at = NOW();

-- Enable RLS for API rate limits (service role only)
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'api_rate_limits_service_role_only') THEN
        CREATE POLICY "api_rate_limits_service_role_only" ON api_rate_limits
            FOR ALL USING (
                current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
                OR is_service_role()
            )
            WITH CHECK (
                current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
                OR is_service_role()
            );
    END IF;
END $$;

-- 6c. Create user analytics infrastructure for early adopter insights
-- Core usage tracking table for monthly usage aggregates
CREATE TABLE IF NOT EXISTS user_usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    
    -- Billing Period
    billing_cycle_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()),
    billing_cycle_end TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + interval '1 month'),
    
    -- Shell File Upload Metrics
    shell_files_uploaded INTEGER DEFAULT 0,
    total_pages_processed INTEGER DEFAULT 0,
    total_file_size_mb NUMERIC(10,2) DEFAULT 0,
    
    -- AI Processing Metrics
    ai_tokens_used INTEGER DEFAULT 0,
    ai_processing_jobs INTEGER DEFAULT 0,
    ai_processing_minutes INTEGER DEFAULT 0,
    
    -- Storage Metrics
    storage_used_mb NUMERIC(10,2) DEFAULT 0,
    
    -- Plan Configuration (for future billing)
    plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'basic', 'premium', 'enterprise')),
    
    -- Usage Limits (dynamic based on plan_type - feature flagged)
    shell_files_limit INTEGER DEFAULT 10,        -- Free: 10 files/month
    pages_limit INTEGER DEFAULT 100,             -- Free: 100 pages/month  
    ai_tokens_limit INTEGER DEFAULT 50000,       -- Free: 50K tokens/month
    storage_limit_mb INTEGER DEFAULT 100,        -- Free: 100MB storage
    
    -- Status Flags (feature flagged for billing)
    is_over_limit BOOLEAN DEFAULT FALSE,
    upgrade_required BOOLEAN DEFAULT FALSE,
    warnings_sent INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one record per user per billing cycle
    UNIQUE(profile_id, billing_cycle_start)
);

-- Performance indexes for usage tracking
CREATE INDEX IF NOT EXISTS idx_user_usage_profile_cycle ON user_usage_tracking(profile_id, billing_cycle_start);
CREATE INDEX IF NOT EXISTS idx_user_usage_over_limit ON user_usage_tracking(profile_id) WHERE is_over_limit = TRUE;

-- Pass-specific metrics tables for structured analytics and performance tracking

-- Pass 0.5 Encounter Discovery Metrics (Migration 34 - 2025-10-30)
CREATE TABLE IF NOT EXISTS pass05_encounter_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,

    -- Pass 0.5 metrics
    encounters_detected INTEGER NOT NULL,
    real_world_encounters INTEGER NOT NULL,
    planned_encounters INTEGER NOT NULL DEFAULT 0,  -- Migration 35 - 2025-10-30
    pseudo_encounters INTEGER NOT NULL,

    -- Performance
    processing_time_ms INTEGER NOT NULL,
    processing_time_seconds NUMERIC(10,2) GENERATED ALWAYS AS (ROUND(processing_time_ms::numeric / 1000.0, 2)) STORED,

    -- AI model
    ai_model_used TEXT NOT NULL,

    -- Token breakdown
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,

    -- Quality metrics
    ocr_average_confidence NUMERIC(3,2),
    encounter_confidence_average NUMERIC(3,2),
    encounter_types_found TEXT[],

    -- Cost metrics (Migration 39 - 2025-11-04: moved from shell_file_manifests)
    ai_cost_usd NUMERIC(10,6),

    -- Page analysis
    total_pages INTEGER NOT NULL,

    -- Batching
    batching_required BOOLEAN NOT NULL DEFAULT FALSE,

    -- Audit trail
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Uniqueness constraint
    CONSTRAINT unique_metrics_per_session UNIQUE (processing_session_id)
);

CREATE INDEX idx_pass05_metrics_shell_file ON pass05_encounter_metrics(shell_file_id);
CREATE INDEX idx_pass05_metrics_session ON pass05_encounter_metrics(processing_session_id);
CREATE INDEX idx_pass05_metrics_created ON pass05_encounter_metrics(created_at);

COMMENT ON TABLE pass05_encounter_metrics IS 'Pass 0.5 session-level performance and cost tracking';

-- Pass 0.5 Progressive Refinement Infrastructure (Migration 44 - 2025-11-10)
-- For handling large documents (200+ pages) that exceed AI output token limits

-- UPDATED by Migration 47 (2025-11-18): Strategy A cascade system changes
-- Changes: Deleted total_encounters_found/completed, renamed total_encounters_pending,
--          added total_cascades, strategy_version, reconciliation_completed_at, final_encounter_count
CREATE TABLE IF NOT EXISTS pass05_progressive_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL,

  total_pages INTEGER NOT NULL CHECK (total_pages > 0),
  chunk_size INTEGER NOT NULL CHECK (chunk_size > 0),
  total_chunks INTEGER NOT NULL CHECK (total_chunks > 0),
  current_chunk INTEGER NOT NULL DEFAULT 0 CHECK (current_chunk >= 0),

  processing_status TEXT NOT NULL DEFAULT 'initialized'
    CHECK (processing_status IN ('initialized', 'processing', 'completed', 'failed')),

  current_handoff_package JSONB, -- Context passed between chunks (cascade context)

  -- Strategy A: Pending-based tracking (Migration 47)
  total_pendings_created INTEGER DEFAULT 0,  -- Renamed from total_encounters_pending
  total_cascades INTEGER DEFAULT 0,          -- Count of cascade chains created
  strategy_version VARCHAR(10) DEFAULT 'A-v1',  -- Which strategy version processed this
  reconciliation_completed_at TIMESTAMPTZ,   -- When reconciliation finished (separate from chunk completion)
  final_encounter_count INTEGER,             -- Final encounters after reconciliation

  requires_manual_review BOOLEAN DEFAULT false,
  review_reasons TEXT[],
  average_confidence NUMERIC(3,2),

  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  total_processing_time INTERVAL,

  total_ai_calls INTEGER DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10,4) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_progressive_sessions_shell_file ON pass05_progressive_sessions(shell_file_id);
CREATE INDEX idx_progressive_sessions_patient ON pass05_progressive_sessions(patient_id);
CREATE INDEX idx_progressive_sessions_status ON pass05_progressive_sessions(processing_status);
CREATE INDEX idx_progressive_sessions_created ON pass05_progressive_sessions(created_at DESC);

COMMENT ON TABLE pass05_progressive_sessions IS 'Tracks progressive processing sessions for large documents split into chunks. UPDATED by Migration 47 for Strategy A cascade system.';

-- UPDATED by Migration 47 (2025-11-18): Strategy A cascade system changes
-- Changes: Deleted encounters_started/completed/continued,
--          renamed handoff columns to cascade terminology,
--          added pendings_created, cascading_count, cascade_ids, continues_count, page_separation_analysis
CREATE TABLE IF NOT EXISTS pass05_chunk_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES pass05_progressive_sessions(id) ON DELETE CASCADE,

  chunk_number INTEGER NOT NULL CHECK (chunk_number > 0),
  page_start INTEGER NOT NULL CHECK (page_start >= 0), -- 0-based inclusive
  page_end INTEGER NOT NULL CHECK (page_end > page_start), -- 0-based exclusive

  processing_status TEXT NOT NULL
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  processing_time_ms INTEGER,

  ai_model_used TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  ai_cost_usd NUMERIC(10,4),

  -- Strategy A: Cascade context (Migration 47 renamed from handoff_*)
  cascade_context_received JSONB,  -- Renamed from handoff_received
  cascade_package_sent JSONB,      -- Renamed from handoff_generated

  -- Strategy A: Pending-based metrics (Migration 47)
  pendings_created INTEGER DEFAULT 0,      -- Total pending encounters created in this chunk
  cascading_count INTEGER DEFAULT 0,       -- How many encounters cascaded to next chunk
  cascade_ids TEXT[],                      -- Array of cascade IDs created/continued
  continues_count INTEGER DEFAULT 0,       -- How many encounters continued from previous chunk
  page_separation_analysis JSONB,          -- Batching split points for Pass 1/2

  confidence_score NUMERIC(3,2),
  ocr_average_confidence NUMERIC(3,2),

  error_message TEXT,
  error_context JSONB,
  retry_count INTEGER DEFAULT 0,

  ai_response_raw JSONB,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chunk_results_session ON pass05_chunk_results(session_id, chunk_number);
CREATE INDEX idx_chunk_results_status ON pass05_chunk_results(processing_status);
CREATE UNIQUE INDEX idx_chunk_results_session_chunk ON pass05_chunk_results(session_id, chunk_number);
CREATE INDEX idx_chunk_results_separation_analysis ON pass05_chunk_results USING GIN (page_separation_analysis); -- Added by Migration 47

COMMENT ON TABLE pass05_chunk_results IS 'Detailed results from processing each chunk in a progressive session. UPDATED by Migration 47 for Strategy A cascade metrics.';

CREATE TABLE IF NOT EXISTS pass05_pending_encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES pass05_progressive_sessions(id) ON DELETE CASCADE,

  temp_encounter_id TEXT NOT NULL,
  chunk_started INTEGER NOT NULL,
  chunk_last_seen INTEGER,

  partial_data JSONB NOT NULL,
  page_ranges INTEGER[],

  last_seen_context TEXT,
  expected_continuation TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'abandoned')),

  completed_encounter_id UUID REFERENCES healthcare_encounters(id),
  completed_at TIMESTAMPTZ,

  confidence NUMERIC(3,2),
  requires_review BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pending_encounters_session ON pass05_pending_encounters(session_id, status);
CREATE INDEX idx_pending_encounters_temp_id ON pass05_pending_encounters(temp_encounter_id);
CREATE INDEX idx_pending_encounters_completed ON pass05_pending_encounters(completed_encounter_id) WHERE completed_encounter_id IS NOT NULL;
CREATE UNIQUE INDEX idx_pending_encounters_unique_temp_id ON pass05_pending_encounters(session_id, temp_encounter_id);

COMMENT ON TABLE pass05_pending_encounters IS 'Staging table for encounters that span multiple chunks during progressive processing';

-- DELETED by Migration 47 (2025-11-18): Redundant with pass05_encounter_metrics table
-- Original view: pass05_progressive_performance
-- Reason: Replaced by pass05_encounter_metrics for Strategy A metrics tracking

CREATE OR REPLACE FUNCTION update_progressive_session_progress(
  p_session_id UUID,
  p_chunk_number INTEGER,
  p_handoff_package JSONB
) RETURNS VOID AS $$
BEGIN
  UPDATE pass05_progressive_sessions
  SET
    current_chunk = p_chunk_number,
    current_handoff_package = p_handoff_package,
    updated_at = now()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- WILL BE UPDATED by Migration 52: Current RPC is BROKEN (uses deleted columns)
-- This RPC references columns deleted in Migration 47 and will crash on every call.
-- Migration 52 will replace this with Strategy A-compatible version.
-- DO NOT USE until Migration 52 is executed.
CREATE OR REPLACE FUNCTION finalize_progressive_session(
  p_session_id UUID
) RETURNS VOID AS $$
DECLARE
  v_final_encounters INTEGER;      -- Final encounter count from healthcare_encounters
  v_pending_count INTEGER;          -- Still-pending count (should be 0)
  v_total_input_tokens INTEGER;
  v_total_output_tokens INTEGER;
  v_total_cost NUMERIC(10,4);
  v_avg_confidence NUMERIC(3,2);
  v_total_pendings INTEGER;         -- Sum of pendings_created across chunks
  v_ai_calls INTEGER;
BEGIN
  -- Count final encounters created from this session
  SELECT COUNT(*) INTO v_final_encounters
  FROM healthcare_encounters
  WHERE primary_shell_file_id IN (
    SELECT shell_file_id FROM pass05_progressive_sessions WHERE id = p_session_id
  );

  -- Count still-pending encounters (should be 0 after reconciliation, >0 = needs review)
  SELECT COUNT(*) INTO v_pending_count
  FROM pass05_pending_encounters
  WHERE session_id = p_session_id AND status = 'pending';

  -- Aggregate metrics from all chunks
  SELECT
    COALESCE(SUM(input_tokens), 0),
    COALESCE(SUM(output_tokens), 0),
    COALESCE(SUM(ai_cost_usd), 0),
    COALESCE(AVG(confidence_score), 0),
    COALESCE(SUM(pendings_created), 0),  -- FIXED: Use pendings_created (encounters_completed deleted in Migration 47)
    COUNT(*)
  INTO
    v_total_input_tokens,
    v_total_output_tokens,
    v_total_cost,
    v_avg_confidence,
    v_total_pendings,
    v_ai_calls
  FROM pass05_chunk_results
  WHERE session_id = p_session_id;

  -- Update session with final metrics using CORRECT column names (Migration 47)
  UPDATE pass05_progressive_sessions
  SET
    processing_status = 'completed',
    completed_at = now(),
    total_processing_time = now() - started_at,
    final_encounter_count = v_final_encounters,     -- FIXED: Use final_encounter_count (total_encounters_found deleted)
    total_pendings_created = v_total_pendings,      -- FIXED: Use total_pendings_created (total_encounters_pending renamed)
    total_input_tokens = v_total_input_tokens,
    total_output_tokens = v_total_output_tokens,
    total_cost_usd = v_total_cost,
    average_confidence = v_avg_confidence,          -- CORRECT: Column name matches
    total_ai_calls = v_ai_calls,
    requires_manual_review = (v_pending_count > 0), -- Flag if any pendings remain
    updated_at = now()
  WHERE id = p_session_id;

  -- Add review reason if unresolved pendings exist
  IF v_pending_count > 0 THEN
    UPDATE pass05_progressive_sessions
    SET review_reasons = array_append(review_reasons,
          format('%s pending encounters not reconciled', v_pending_count))
    WHERE id = p_session_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION finalize_progressive_session IS
  'UPDATED (Migration 52): Fixed to use Strategy A column names after Migration 47.
   Changes: encounters_completed → pendings_created, total_encounters_found → final_encounter_count,
   total_encounters_pending → total_pendings_created. Finalizes progressive session after
   all chunks processed and reconciliation complete.';


-- ============================================================================
-- RPC Functions for Reconciliation (Migration 52 - Issue #4)
-- ============================================================================

-- RPC #1: Atomic Pending → Final Encounter Conversion (Migration 52)
CREATE OR REPLACE FUNCTION reconcile_pending_to_final(
  p_pending_ids UUID[],
  p_patient_id UUID,
  p_shell_file_id UUID,
  p_encounter_data JSONB
) RETURNS UUID AS $$
DECLARE
  v_encounter_id UUID;
  v_pending_id UUID;
  v_cascade_id TEXT;
BEGIN
  -- Migration 57: Get cascade_id from first pending
  SELECT cascade_id INTO v_cascade_id
  FROM pass05_pending_encounters
  WHERE id = p_pending_ids[1];

  -- Insert final encounter atomically
  INSERT INTO healthcare_encounters (
    patient_id,
    source_shell_file_id,
    encounter_type,
    encounter_start_date,
    encounter_end_date,
    encounter_timeframe_status,
    date_source,
    provider_name,
    facility_name,
    start_page,
    start_boundary_type,
    start_marker,              -- Migration 53: Fixed from start_text_marker
    start_marker_context,
    start_region_hint,
    start_text_y_top,
    start_text_height,
    start_y,
    end_page,
    end_boundary_type,
    end_marker,                -- Migration 53: Fixed from end_text_marker
    end_marker_context,
    end_region_hint,
    end_text_y_top,
    end_text_height,
    end_y,
    position_confidence,
    page_ranges,
    pass_0_5_confidence,
    summary,
    identified_in_pass,
    source_method,
    is_real_world_visit,
    data_quality_tier,
    quality_criteria_met,
    quality_calculation_date,
    encounter_source,
    created_by_user_id,
    -- Migration 57: Audit trail and tracking fields
    reconciled_from_pendings,
    chunk_count,
    cascade_id,
    completed_at
  )
  SELECT
    p_patient_id,
    p_shell_file_id,
    (p_encounter_data->>'encounter_type')::VARCHAR,
    (p_encounter_data->>'encounter_start_date')::TIMESTAMPTZ,
    (p_encounter_data->>'encounter_end_date')::TIMESTAMPTZ,
    (p_encounter_data->>'encounter_timeframe_status')::VARCHAR,
    (p_encounter_data->>'date_source')::VARCHAR,
    (p_encounter_data->>'provider_name')::VARCHAR,
    (p_encounter_data->>'facility_name')::VARCHAR,
    (p_encounter_data->>'start_page')::INTEGER,
    (p_encounter_data->>'start_boundary_type')::VARCHAR,
    (p_encounter_data->>'start_text_marker')::VARCHAR,
    (p_encounter_data->>'start_marker_context')::VARCHAR,
    (p_encounter_data->>'start_region_hint')::VARCHAR,
    (p_encounter_data->>'start_text_y_top')::INTEGER,
    (p_encounter_data->>'start_text_height')::INTEGER,
    (p_encounter_data->>'start_y')::INTEGER,
    (p_encounter_data->>'end_page')::INTEGER,
    (p_encounter_data->>'end_boundary_type')::VARCHAR,
    (p_encounter_data->>'end_text_marker')::VARCHAR,
    (p_encounter_data->>'end_marker_context')::VARCHAR,
    (p_encounter_data->>'end_region_hint')::VARCHAR,
    (p_encounter_data->>'end_text_y_top')::INTEGER,
    (p_encounter_data->>'end_text_height')::INTEGER,
    (p_encounter_data->>'end_y')::INTEGER,
    (p_encounter_data->>'position_confidence')::NUMERIC,
    -- Migration 55: Proper JSONB array to PostgreSQL array conversion
    (SELECT ARRAY(
      SELECT ARRAY[(elem->0)::INTEGER, (elem->1)::INTEGER]
      FROM jsonb_array_elements(p_encounter_data->'page_ranges') AS elem
    )),
    (p_encounter_data->>'pass_0_5_confidence')::NUMERIC,
    (p_encounter_data->>'summary')::TEXT,
    'pass_0_5'::VARCHAR,
    'ai_pass_0_5'::VARCHAR,
    (p_encounter_data->>'is_real_world_visit')::BOOLEAN,
    (p_encounter_data->>'data_quality_tier')::VARCHAR,
    (p_encounter_data->'quality_criteria_met')::JSONB,
    NOW(),
    'shell_file'::VARCHAR,
    (p_encounter_data->>'created_by_user_id')::UUID,
    -- Migration 57: Audit trail and tracking fields
    cardinality(p_pending_ids),
    (SELECT COUNT(DISTINCT chunk_number)
     FROM pass05_pending_encounters
     WHERE id = ANY(p_pending_ids)),
    v_cascade_id,
    NOW()
  RETURNING id INTO v_encounter_id;

  -- Mark all pendings as completed (atomic with insert)
  FOREACH v_pending_id IN ARRAY p_pending_ids
  LOOP
    UPDATE pass05_pending_encounters
    SET
      status = 'completed',
      reconciled_to = v_encounter_id,
      reconciled_at = NOW(),   -- Migration 57: Add reconciliation timestamp
      updated_at = NOW()
    WHERE id = v_pending_id;
  END LOOP;

  -- Update page assignments (atomic)
  -- Migration 56 FIX: Use subquery to match TEXT pending_id with UUID[] p_pending_ids
  UPDATE pass05_page_assignments
  SET
    encounter_id = v_encounter_id,
    reconciled_at = NOW()
  WHERE pending_id IN (
    SELECT pending_id
    FROM pass05_pending_encounters
    WHERE id = ANY(p_pending_ids)
  );

  RETURN v_encounter_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reconcile_pending_to_final IS
  'Atomically converts pending encounters to final encounter. Inserts into healthcare_encounters,
   marks pendings as completed, and updates page assignments. All operations succeed or fail together.
   Returns final encounter ID. (Migrations 52-53: column names, Migration 55: page_ranges array conversion,
   Migration 56: pending_id type mismatch fix, Migration 57: audit trail and tracking fields)';


-- RPC #2: Atomic Cascade Pending Count Increment (Migration 52)
CREATE OR REPLACE FUNCTION increment_cascade_pending_count(
  p_cascade_id VARCHAR
) RETURNS VOID AS $$
BEGIN
  UPDATE pass05_cascade_chains
  SET pendings_count = pendings_count + 1
  WHERE cascade_id = p_cascade_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cascade % not found for increment', p_cascade_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_cascade_pending_count IS
  'Atomically increments pending count for cascade chain. Called when continuation
   encounter detected in subsequent chunk. Replaces fetch+update pattern in database.ts. (Migration 52)';


-- RPC #2.5: Update Strategy A Metrics After Reconciliation (Migration 57)
CREATE OR REPLACE FUNCTION update_strategy_a_metrics(
  p_shell_file_id UUID,
  p_session_id UUID
) RETURNS VOID AS $$
DECLARE
  v_metrics_id UUID;
  v_pendings_total INTEGER;
  v_cascades_total INTEGER;
  v_orphans_total INTEGER;
  v_chunk_count INTEGER;
  v_final_encounters_count INTEGER;
  v_real_world_count INTEGER;
  v_pseudo_count INTEGER;
BEGIN
  SELECT id INTO v_metrics_id
  FROM pass05_encounter_metrics
  WHERE shell_file_id = p_shell_file_id
    AND processing_session_id = p_session_id;

  IF v_metrics_id IS NULL THEN
    RAISE EXCEPTION 'No metrics record found for shell_file_id: %', p_shell_file_id;
  END IF;

  SELECT
    COUNT(*),
    COUNT(DISTINCT cascade_id) FILTER (WHERE cascade_id IS NOT NULL),
    COUNT(*) FILTER (WHERE status = 'pending'),
    (SELECT MAX(chunk_number) FROM pass05_chunk_results WHERE session_id = p_session_id)
  INTO v_pendings_total, v_cascades_total, v_orphans_total, v_chunk_count
  FROM pass05_pending_encounters
  WHERE session_id = p_session_id;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_real_world_visit = TRUE),
    COUNT(*) FILTER (WHERE is_real_world_visit = FALSE)
  INTO v_final_encounters_count, v_real_world_count, v_pseudo_count
  FROM healthcare_encounters
  WHERE source_shell_file_id = p_shell_file_id
    AND identified_in_pass = 'pass_0_5';

  UPDATE pass05_encounter_metrics
  SET
    encounters_detected = v_final_encounters_count,
    real_world_encounters = v_real_world_count,
    pseudo_encounters = v_pseudo_count,
    pendings_total = v_pendings_total,
    cascades_total = v_cascades_total,
    orphans_total = v_orphans_total,
    chunk_count = v_chunk_count
  WHERE id = v_metrics_id;

  RAISE NOTICE 'Updated metrics: % encounters (% real-world, % pseudo) from % pendings, % cascades, % chunks',
    v_final_encounters_count, v_real_world_count, v_pseudo_count,
    v_pendings_total, v_cascades_total, v_chunk_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_strategy_a_metrics IS
  'Migration 57: Updates pass05_encounter_metrics after Strategy A reconciliation completes.
   Populates pendings_total, cascades_total, orphans_total, chunk_count, and corrects
   encounter counts that were written as zeros before reconciliation. (Rabbit #17)';


-- RPC #3: Atomic Session Metrics Finalization (Migration 52)
CREATE OR REPLACE FUNCTION finalize_session_metrics(
  p_session_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_final_encounters INTEGER;
  v_pending_count INTEGER;
  v_total_input_tokens INTEGER;
  v_total_output_tokens INTEGER;
  v_total_cost NUMERIC(10,4);
  v_avg_confidence NUMERIC(3,2);
  v_total_pendings INTEGER;
  v_ai_calls INTEGER;
  v_shell_file_id UUID;
  v_result JSONB;
BEGIN
  -- Get shell_file_id for this session
  SELECT shell_file_id INTO v_shell_file_id
  FROM pass05_progressive_sessions
  WHERE id = p_session_id;

  -- Count final encounters created
  SELECT COUNT(*) INTO v_final_encounters
  FROM healthcare_encounters
  WHERE source_shell_file_id = v_shell_file_id;

  -- Count still-pending encounters
  SELECT COUNT(*) INTO v_pending_count
  FROM pass05_pending_encounters
  WHERE session_id = p_session_id AND status = 'pending';

  -- Aggregate metrics from all chunks
  SELECT
    COALESCE(SUM(input_tokens), 0),
    COALESCE(SUM(output_tokens), 0),
    COALESCE(SUM(ai_cost_usd), 0),
    COALESCE(AVG(confidence_score), 0),
    COALESCE(SUM(pendings_created), 0),
    COUNT(*)
  INTO
    v_total_input_tokens,
    v_total_output_tokens,
    v_total_cost,
    v_avg_confidence,
    v_total_pendings,
    v_ai_calls
  FROM pass05_chunk_results
  WHERE session_id = p_session_id;

  -- Update session with final metrics (atomic)
  UPDATE pass05_progressive_sessions
  SET
    processing_status = 'completed',
    completed_at = NOW(),
    total_processing_time = NOW() - started_at,
    final_encounter_count = v_final_encounters,
    total_pendings_created = v_total_pendings,
    total_input_tokens = v_total_input_tokens,
    total_output_tokens = v_total_output_tokens,
    total_cost_usd = v_total_cost,
    average_confidence = v_avg_confidence,
    total_ai_calls = v_ai_calls,
    requires_manual_review = (v_pending_count > 0),
    review_reasons = CASE
      WHEN v_pending_count > 0 THEN
        ARRAY[format('%s pending encounters not reconciled', v_pending_count)]
      ELSE
        review_reasons
    END,
    updated_at = NOW()
  WHERE id = p_session_id;

  -- Return metrics summary for caller
  v_result := jsonb_build_object(
    'final_encounters', v_final_encounters,
    'pending_count', v_pending_count,
    'total_pendings_created', v_total_pendings,
    'total_cost_usd', v_total_cost,
    'requires_review', v_pending_count > 0
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION finalize_session_metrics IS
  'Atomically finalizes progressive session metrics after reconciliation. Aggregates chunk
   results, counts final encounters, detects unresolved pendings. Returns metrics summary. (Migration 52)';


-- Pass 1 Entity Detection Metrics
CREATE TABLE IF NOT EXISTS pass1_entity_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,

    -- Pass 1 Specific Metrics
    entities_detected INTEGER NOT NULL,
    processing_time_ms INTEGER NOT NULL,
    processing_time_minutes NUMERIC(10,2) NOT NULL GENERATED ALWAYS AS (ROUND(processing_time_ms::numeric / 60000.0, 2)) STORED,
    vision_model_used TEXT NOT NULL,
    ocr_model_used TEXT,

    -- Quality Metrics
    ocr_agreement_average NUMERIC(4,3),
    confidence_distribution JSONB, -- { "high": 15, "medium": 8, "low": 2 }
    entity_types_found TEXT[], -- ['medication', 'condition', 'vital_sign']

    -- Token Breakdown (for accurate cost calculation)
    input_tokens INTEGER,       -- prompt_tokens from OpenAI API (text + images)
    output_tokens INTEGER,      -- completion_tokens from OpenAI API
    total_tokens INTEGER,       -- sum of input + output

    -- Cost and Performance
    ocr_pages_processed INTEGER,

    -- Metadata (Compliance Audit Trail)
    user_agent TEXT,       -- NULL for background jobs; populated for direct API calls
    ip_address INET,       -- NULL for background jobs; part of HIPAA audit trail
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pass 2 Clinical Enrichment Metrics
CREATE TABLE IF NOT EXISTS pass2_clinical_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,

    -- Pass 2 Specific Metrics
    clinical_entities_enriched INTEGER NOT NULL,
    schemas_populated TEXT[] NOT NULL, -- ['patient_conditions', 'patient_medications']
    clinical_model_used TEXT NOT NULL,

    -- Quality Metrics
    average_clinical_confidence NUMERIC(4,3),
    manual_review_triggered_count INTEGER DEFAULT 0,
    validation_failures INTEGER DEFAULT 0,

    -- Bridge Schema Performance
    bridge_schemas_used TEXT[],
    schema_loading_time_ms INTEGER,

    -- Token Breakdown (for accurate cost calculation)
    input_tokens INTEGER,       -- prompt_tokens from OpenAI API
    output_tokens INTEGER,      -- completion_tokens from OpenAI API
    total_tokens INTEGER,       -- sum of input + output

    -- Cost and Performance
    processing_time_ms INTEGER NOT NULL,
    processing_time_minutes NUMERIC(10,2) NOT NULL GENERATED ALWAYS AS (ROUND(processing_time_ms::numeric / 60000.0, 2)) STORED,

    -- Metadata (Compliance Audit Trail)
    user_agent TEXT,       -- NULL for background jobs; populated for direct API calls
    ip_address INET,       -- NULL for background jobs; part of HIPAA audit trail
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pass 3 Narrative Creation Metrics
CREATE TABLE IF NOT EXISTS pass3_narrative_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    semantic_processing_session_id UUID NOT NULL REFERENCES semantic_processing_sessions(id) ON DELETE CASCADE,

    -- Pass 3 Specific Metrics
    narratives_created INTEGER NOT NULL,
    narrative_quality_score NUMERIC(4,3),
    semantic_model_used TEXT NOT NULL,
    synthesis_complexity TEXT CHECK (synthesis_complexity IN ('simple', 'moderate', 'complex')),

    -- Content Metrics
    narrative_length_avg INTEGER, -- Average narrative length in characters
    clinical_relationships_found INTEGER,
    timeline_events_created INTEGER,

    -- Token Breakdown (for accurate cost calculation)
    input_tokens INTEGER,       -- prompt_tokens from OpenAI API
    output_tokens INTEGER,      -- completion_tokens from OpenAI API
    total_tokens INTEGER,       -- sum of input + output

    -- Cost and Performance
    processing_time_ms INTEGER NOT NULL,
    processing_time_minutes NUMERIC(10,2) NOT NULL GENERATED ALWAYS AS (ROUND(processing_time_ms::numeric / 60000.0, 2)) STORED,

    -- Metadata (Compliance Audit Trail)
    user_agent TEXT,       -- NULL for background jobs; populated for direct API calls
    ip_address INET,       -- NULL for background jobs; part of HIPAA audit trail
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Master AI Processing Summary
CREATE TABLE IF NOT EXISTS ai_processing_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,

    -- Processing Overview
    processing_status TEXT NOT NULL CHECK (processing_status IN (
        'initialized', 'pass1_only', 'pass1_pass2', 'complete_pipeline', 'failed'
    )),
    overall_success BOOLEAN NOT NULL,
    failure_stage TEXT, -- 'pass1', 'pass2', 'pass3' if failed

    -- Aggregated Metrics
    total_processing_time_ms INTEGER NOT NULL,
    total_tokens_used INTEGER NOT NULL,
    total_cost_usd NUMERIC(8,4) NOT NULL,

    -- Quality Summary
    overall_confidence_score NUMERIC(4,3),
    entities_extracted_total INTEGER,
    manual_review_required BOOLEAN DEFAULT FALSE,

    -- Pass References
    pass1_metrics_id UUID REFERENCES pass1_entity_metrics(id),
    pass2_metrics_id UUID REFERENCES pass2_clinical_metrics(id),
    pass3_metrics_id UUID REFERENCES pass3_narrative_metrics(id),

    -- Business Events (preserved from original usage_events)
    business_events JSONB DEFAULT '[]', -- [{"event": "plan_upgraded", "timestamp": "..."}]

    -- Metadata (Compliance Audit Trail)
    user_agent TEXT,       -- NULL for background jobs; populated for direct API calls
    ip_address INET,       -- NULL for background jobs; part of HIPAA audit trail
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one summary per shell file
    CONSTRAINT unique_shell_file_summary UNIQUE (shell_file_id)
);

-- Indexes for new metrics tables
CREATE INDEX IF NOT EXISTS idx_pass1_entity_metrics_profile ON pass1_entity_metrics(profile_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pass1_entity_metrics_shell_file ON pass1_entity_metrics(shell_file_id);
CREATE INDEX IF NOT EXISTS idx_pass1_entity_metrics_session ON pass1_entity_metrics(processing_session_id);

CREATE INDEX IF NOT EXISTS idx_pass2_clinical_metrics_profile ON pass2_clinical_metrics(profile_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pass2_clinical_metrics_shell_file ON pass2_clinical_metrics(shell_file_id);
CREATE INDEX IF NOT EXISTS idx_pass2_clinical_metrics_session ON pass2_clinical_metrics(processing_session_id);

CREATE INDEX IF NOT EXISTS idx_pass3_narrative_metrics_profile ON pass3_narrative_metrics(profile_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pass3_narrative_metrics_shell_file ON pass3_narrative_metrics(shell_file_id);
CREATE INDEX IF NOT EXISTS idx_pass3_narrative_metrics_session ON pass3_narrative_metrics(semantic_processing_session_id);

CREATE INDEX IF NOT EXISTS idx_ai_processing_summary_profile ON ai_processing_summary(profile_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_processing_summary_shell_file ON ai_processing_summary(shell_file_id);
CREATE INDEX IF NOT EXISTS idx_ai_processing_summary_status ON ai_processing_summary(processing_status);

-- Migration 31 (2025-10-21): Embedding performance metrics for SapBERT/OpenAI optimization
CREATE TABLE IF NOT EXISTS embedding_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Model identification
    model_name VARCHAR(50) NOT NULL, -- 'sapbert', 'openai'
    code_system VARCHAR(10) NOT NULL, -- 'pbs', 'mbs'

    -- Performance metrics
    batch_size INTEGER, -- Number of embeddings generated in batch
    generation_time_ms INTEGER, -- Total time for batch generation
    cache_hit_rate DECIMAL(5,2), -- Percentage of cache hits (0-100)

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for security
ALTER TABLE embedding_performance_metrics ENABLE ROW LEVEL SECURITY;

-- Service role only policy (metrics are internal system data)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'embedding_performance_metrics'
        AND policyname = 'Service role full access'
    ) THEN
        CREATE POLICY "Service role full access"
        ON embedding_performance_metrics
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- Index for performance analytics
CREATE INDEX IF NOT EXISTS idx_embedding_performance_metrics_model_system
ON embedding_performance_metrics(model_name, code_system, created_at DESC);

-- Subscription plans configuration (future billing - feature flagged)
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_type TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    
    -- Monthly Limits
    shell_files_limit INTEGER,        -- NULL = unlimited
    pages_limit INTEGER,              -- NULL = unlimited
    ai_tokens_limit INTEGER,          -- NULL = unlimited  
    storage_limit_mb INTEGER,         -- NULL = unlimited
    
    -- Pricing (in cents)
    monthly_price_cents INTEGER DEFAULT 0,
    
    -- Features
    features JSONB DEFAULT '[]',      -- ['priority_processing', 'advanced_ai', 'api_access']
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed subscription plan data
INSERT INTO subscription_plans (plan_type, display_name, description, shell_files_limit, pages_limit, ai_tokens_limit, storage_limit_mb, monthly_price_cents, sort_order) VALUES
('free', 'Free', 'Perfect for getting started', 10, 100, 50000, 100, 0, 1),
('basic', 'Basic', 'For regular users', 100, 1000, 500000, 1000, 999, 2),  -- $9.99/month
('premium', 'Premium', 'For power users', 500, 5000, 2500000, 5000, 2999, 3), -- $29.99/month
('enterprise', 'Enterprise', 'Unlimited usage', NULL, NULL, NULL, NULL, 9999, 4) -- $99.99/month
ON CONFLICT (plan_type) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    shell_files_limit = EXCLUDED.shell_files_limit,
    pages_limit = EXCLUDED.pages_limit,
    ai_tokens_limit = EXCLUDED.ai_tokens_limit,
    storage_limit_mb = EXCLUDED.storage_limit_mb,
    monthly_price_cents = EXCLUDED.monthly_price_cents,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- FIXED: Enable RLS for user analytics tables with correct profile access logic
ALTER TABLE user_usage_tracking ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'user_usage_tracking_profile_isolation') THEN
        CREATE POLICY "user_usage_tracking_profile_isolation" ON user_usage_tracking
            FOR ALL USING (
                -- FIXED: Use has_profile_access instead of profile_id = auth.uid() 
                has_profile_access(auth.uid(), profile_id)
                OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
                OR is_service_role()
            )
            WITH CHECK (
                -- FIXED: Use has_profile_access instead of profile_id = auth.uid()
                has_profile_access(auth.uid(), profile_id)
                OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
                OR is_service_role()
            );
    END IF;
END $$;

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'usage_events_profile_isolation') THEN
        CREATE POLICY "usage_events_profile_isolation" ON usage_events
            FOR ALL USING (
                -- FIXED: Use has_profile_access instead of profile_id = auth.uid()
                has_profile_access(auth.uid(), profile_id)
                OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
                OR is_service_role()
            )
            WITH CHECK (
                -- FIXED: Use has_profile_access instead of profile_id = auth.uid()
                has_profile_access(auth.uid(), profile_id)
                OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
                OR is_service_role()
            );
    END IF;
END $$;

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'subscription_plans_read_all') THEN
        CREATE POLICY "subscription_plans_read_all" ON subscription_plans
            FOR SELECT USING (true); -- Everyone can read plan options
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'subscription_plans_service_role_only') THEN
        CREATE POLICY "subscription_plans_service_role_only" ON subscription_plans
            FOR ALL USING (
                current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
                OR is_service_role()
            )
            WITH CHECK (
                current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
                OR is_service_role()
            );
    END IF;
END $$;

-- 7. Add system configuration for timeouts, intervals, and feature flags
INSERT INTO system_configuration (config_key, config_value, config_type, description, is_sensitive) VALUES
('worker.heartbeat_interval_seconds', '30', 'system', 'Heartbeat interval for worker health monitoring', false),
('worker.timeout_seconds', '1800', 'system', 'Worker timeout threshold (30 minutes - increased for GPT-5 vision processing)', false),
('worker.reclaim_jitter_max_seconds', '60', 'system', 'Maximum jitter when reclaiming timed-out jobs', false),
('queue.backpressure_delay_seconds', '30', 'system', 'Default backpressure delay for rate limiting', false),
-- FIXED: Analytics and billing feature flags (use 'system' config_type)
('features.usage_tracking_enabled', 'true', 'system', 'Enable usage tracking and analytics', false),
('features.billing_enabled', 'false', 'system', 'Enable subscription billing features', false),
('features.upgrade_prompts_enabled', 'false', 'system', 'Show upgrade prompts when limits exceeded', false)
ON CONFLICT (config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    updated_at = NOW();

-- 8. Deploy all enhanced RPCs
-- 8a. Rate limiting coordination functions
CREATE OR REPLACE FUNCTION acquire_api_capacity(
    p_provider_name TEXT,
    p_api_endpoint TEXT,
    p_estimated_tokens INTEGER DEFAULT 1000
) RETURNS BOOLEAN 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIXED: Prevent search_path hijacking
AS $$
DECLARE
    current_timestamp_val TIMESTAMPTZ := NOW();  -- FIXED: Renamed to avoid collision with CURRENT_TIME built-in
    capacity_acquired BOOLEAN := FALSE;
    reset_needed BOOLEAN := FALSE;
BEGIN
    -- First, atomically reset counters if minute boundary crossed
    UPDATE api_rate_limits SET
        current_requests_minute = 0,
        current_tokens_minute = 0,
        minute_reset_at = current_timestamp_val
    WHERE provider_name = p_provider_name 
    AND api_endpoint = p_api_endpoint 
    AND status = 'active'
    AND (current_timestamp_val - minute_reset_at) > INTERVAL '1 minute';  -- FIXED: Proper timestamp subtraction
    
    -- Atomic capacity acquisition in single UPDATE statement
    UPDATE api_rate_limits SET
        current_requests_minute = current_requests_minute + 1,
        current_tokens_minute = current_tokens_minute + p_estimated_tokens,
        active_requests = active_requests + 1
    WHERE provider_name = p_provider_name 
    AND api_endpoint = p_api_endpoint 
    AND status = 'active'
    -- Atomic capacity check conditions (NULL-safe)
    AND (current_requests_minute + 1 <= COALESCE(requests_per_minute, 999999))
    AND (current_tokens_minute + p_estimated_tokens <= COALESCE(tokens_per_minute, 999999))
    AND (active_requests < COALESCE(concurrent_requests, 999999));
    
    -- Check if capacity was acquired (row was updated)
    capacity_acquired := FOUND;
    
    IF NOT capacity_acquired THEN
        -- Rate limit exceeded - log the violation atomically
        UPDATE api_rate_limits SET 
            last_rate_limit_hit = current_timestamp_val,
            rate_limit_violations = rate_limit_violations + 1
        WHERE provider_name = p_provider_name 
        AND api_endpoint = p_api_endpoint 
        AND status = 'active';
        
        -- Check if config exists at all
        IF NOT FOUND THEN
            RAISE EXCEPTION 'No active rate limit configuration for %:%', p_provider_name, p_api_endpoint;
        END IF;
        
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION release_api_capacity(
    p_provider_name TEXT,
    p_api_endpoint TEXT,
    p_estimated_tokens INTEGER DEFAULT 1000,
    p_actual_tokens INTEGER DEFAULT NULL
) RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIXED: Prevent search_path hijacking
AS $$
DECLARE
    token_delta INTEGER;
BEGIN
    -- Calculate proper token delta (actual - estimate)
    token_delta := COALESCE(p_actual_tokens, p_estimated_tokens) - p_estimated_tokens;
    
    -- Atomic release with same provider+endpoint+status criteria as acquire
    UPDATE api_rate_limits SET
        active_requests = GREATEST(0, active_requests - 1),
        -- Adjust token usage: remove estimate, add actual (net effect is delta)
        current_tokens_minute = GREATEST(0, current_tokens_minute + token_delta)
    WHERE provider_name = p_provider_name 
    AND api_endpoint = p_api_endpoint
    AND status = 'active';
    
    -- Warn if no matching config found (shouldn't happen if acquire/release paired)
    IF NOT FOUND THEN
        RAISE WARNING 'No active rate limit config found for release: %:%', p_provider_name, p_api_endpoint;
    END IF;
END;
$$;

-- 8b. Job management RPCs
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
    
    -- Auto-assign job_lane based on job_type (fixes NULL lane issue)
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

CREATE OR REPLACE FUNCTION claim_next_job_v3(
    worker_id text, 
    job_types text[] default null,
    job_lanes text[] default null
)
RETURNS TABLE(job_id uuid, job_type text, job_payload jsonb, retry_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIXED: Prevent search_path hijacking
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
    jitter_delay := (random() * jitter_max)::INTEGER;
    
    -- First, reclaim timed-out jobs (heartbeat expired)
    UPDATE job_queue SET
        status = 'pending',
        worker_id = NULL,
        started_at = NULL,
        heartbeat_at = NULL,
        retry_count = retry_count + 1,
        scheduled_at = NOW() + (jitter_delay || ' seconds')::INTERVAL,
        error_details = COALESCE(error_details, '{}'::jsonb) || jsonb_build_object(
            'error_type', 'worker_timeout',
            'original_worker', worker_id,
            'timeout_at', NOW(),
            'reclaim_jitter_seconds', jitter_delay
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
        worker_id = claim_next_job_v3.worker_id,
        heartbeat_at = heartbeat_expiry
    WHERE id = (
        SELECT id FROM job_queue 
        WHERE status = 'pending' 
        AND scheduled_at <= NOW()
        AND (job_types IS NULL OR job_type = ANY(job_types))
        AND (job_lanes IS NULL OR job_lane = ANY(job_lanes))
        ORDER BY priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING id, job_type, job_payload, retry_count;
END;
$$;

CREATE OR REPLACE FUNCTION update_job_heartbeat(
    p_job_id uuid,
    p_worker_id text
) RETURNS BOOLEAN 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIXED: Prevent search_path hijacking
AS $$
DECLARE
    heartbeat_interval INTEGER;
BEGIN
    -- Get heartbeat interval from configuration
    SELECT (config_value #>> '{}')::INTEGER INTO heartbeat_interval FROM system_configuration WHERE config_key = 'worker.heartbeat_interval_seconds';
    heartbeat_interval := COALESCE(heartbeat_interval, 30);
    
    UPDATE job_queue SET
        heartbeat_at = NOW() + (heartbeat_interval || ' seconds')::INTERVAL,
        updated_at = NOW()
    WHERE id = p_job_id 
    AND worker_id = p_worker_id 
    AND status = 'processing';
    
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION reschedule_job(
    p_job_id uuid,
    p_delay_seconds integer,
    p_reason text,
    p_add_jitter boolean DEFAULT true
) RETURNS BOOLEAN 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIXED: Prevent search_path hijacking
AS $$
DECLARE
    jitter_seconds INTEGER := 0;
    total_delay INTEGER;
BEGIN
    -- Add jitter to prevent thundering herd under global backpressure
    IF p_add_jitter THEN
        jitter_seconds := (random() * LEAST(p_delay_seconds * 0.5, 30))::INTEGER; -- Max 30s jitter or 50% of delay
    END IF;
    
    total_delay := p_delay_seconds + jitter_seconds;
    
    UPDATE job_queue SET
        status = 'pending',
        scheduled_at = NOW() + (total_delay || ' seconds')::INTERVAL,
        worker_id = NULL,
        started_at = NULL,
        heartbeat_at = NULL,
        error_details = COALESCE(error_details, '{}'::jsonb) || jsonb_build_object(
            'reschedule_reason', p_reason,
            'reschedule_delay_seconds', p_delay_seconds,
            'jitter_seconds', jitter_seconds,
            'total_delay_seconds', total_delay,
            'rescheduled_at', NOW()
        )
    WHERE id = p_job_id
    AND status IN ('processing', 'pending'); -- FIXED: Restrict to avoid re-opening completed/failed jobs
    
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION complete_job(
    p_job_id uuid,
    p_worker_id text,
    p_job_result jsonb default null
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIXED: Prevent search_path hijacking
AS $$
DECLARE
    v_now timestamptz := NOW();        -- Migration 22: Single timestamp for consistency
    v_rows int := 0;                   -- Migration 22: Explicit row count for RETURN value
    v_actual_duration interval;        -- Migration 22: Capture calculated duration
BEGIN
    UPDATE job_queue
    SET
        status = 'completed',
        completed_at = v_now,                    -- Migration 22: Use consistent timestamp
        heartbeat_at = NULL,                     -- Migration 22: Clear heartbeat on completion
        actual_duration = v_now - started_at,    -- Migration 22: Auto-calculate job duration
        job_result = p_job_result,
        updated_at = v_now                       -- Migration 22: Use consistent timestamp
    WHERE id = p_job_id
      AND worker_id = p_worker_id
      AND status = 'processing'                  -- FIXED: Prevent double-completion or completing non-active jobs
    RETURNING actual_duration INTO v_actual_duration;

    -- Migration 22: Use explicit row count instead of FOUND (which would reflect PERFORM result)
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
        RETURN FALSE; -- No matching in-progress job found
    END IF;

    -- Migration 22: Audit logging with exception handling for operational resilience
    -- Healthcare note: Log failure as WARNING for compliance visibility
    BEGIN
        PERFORM log_audit_event(
            'job_queue',
            p_job_id::text,
            'UPDATE',
            NULL,
            jsonb_build_object(
                'status', 'completed',
                'job_id', p_job_id,
                'worker_id', p_worker_id,
                'actual_duration_seconds', EXTRACT(EPOCH FROM v_actual_duration)  -- Migration 22: Include duration in audit log
            ),
            'Job completed successfully with duration tracking',
            'system',
            NULL -- p_patient_id (NULL for system operations)
        );
    EXCEPTION WHEN OTHERS THEN
        -- Allow job completion even if audit logging fails, but ensure visibility
        RAISE WARNING 'Audit logging failed in complete_job() for job %: %', p_job_id, SQLERRM;
    END;

    RETURN TRUE;
END;
$$;

-- 8c. User analytics functions (early adopter insights + future billing)
CREATE OR REPLACE FUNCTION track_shell_file_upload_usage(
    p_profile_id UUID,
    p_shell_file_id UUID,
    p_file_size_bytes BIGINT,
    p_estimated_pages INTEGER DEFAULT 1,
    p_user_id UUID DEFAULT NULL  -- Optional for service role calls (Edge Functions)
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIXED: Prevent search_path hijacking
AS $$
DECLARE
    usage_record RECORD;
    file_size_mb NUMERIC(10,2);
    limits_exceeded BOOLEAN := FALSE;
    tracking_enabled BOOLEAN := FALSE;
    actual_file_size BIGINT;
    caller_user_id UUID;
BEGIN
    -- Determine caller: use provided p_user_id (service role) or auth.uid() (user context)
    caller_user_id := COALESCE(p_user_id, auth.uid());

    -- SECURITY GUARD: Verify caller has access to profile (skip if service role with no user)
    IF caller_user_id IS NOT NULL AND NOT has_profile_access(caller_user_id, p_profile_id) THEN
        RAISE EXCEPTION 'Unauthorized: User % cannot access profile %', caller_user_id, p_profile_id;
    END IF;
    
    -- FIXED: Fetch actual file size from database (estimated_pages column doesn't exist - use provided param)
    SELECT file_size_bytes INTO actual_file_size
    FROM shell_files WHERE id = p_shell_file_id;
    
    -- Use database file size if available, keep provided page estimate 
    p_file_size_bytes := COALESCE(actual_file_size, p_file_size_bytes);
    -- Note: Keep estimated_pages as provided parameter until actual page count is persisted later

    -- Check if usage tracking is enabled
    SELECT (config_value)::BOOLEAN INTO tracking_enabled 
    FROM system_configuration 
    WHERE config_key = 'features.usage_tracking_enabled';
    
    IF NOT COALESCE(tracking_enabled, FALSE) THEN
        RETURN jsonb_build_object('tracking_disabled', true);
    END IF;
    
    file_size_mb := p_file_size_bytes::NUMERIC / 1048576; -- Convert bytes to MB
    
    -- Create or get current month usage record
    INSERT INTO user_usage_tracking (profile_id, billing_cycle_start, billing_cycle_end)
    VALUES (
        p_profile_id, 
        date_trunc('month', NOW()), 
        date_trunc('month', NOW()) + interval '1 month'
    )
    ON CONFLICT (profile_id, billing_cycle_start) DO NOTHING;
    
    -- Increment usage counters
    UPDATE user_usage_tracking SET
        shell_files_uploaded = shell_files_uploaded + 1,
        total_pages_processed = total_pages_processed + p_estimated_pages,
        total_file_size_mb = total_file_size_mb + file_size_mb,
        storage_used_mb = storage_used_mb + file_size_mb,
        updated_at = NOW()
    WHERE profile_id = p_profile_id 
    AND billing_cycle_start = date_trunc('month', NOW())
    RETURNING * INTO usage_record;
    
    -- Check if limits exceeded (feature flagged)
    limits_exceeded := usage_record.shell_files_uploaded > usage_record.shell_files_limit 
                    OR usage_record.total_pages_processed > usage_record.pages_limit
                    OR usage_record.storage_used_mb > usage_record.storage_limit_mb;
    
    -- Update limit status
    UPDATE user_usage_tracking SET
        is_over_limit = limits_exceeded,
        upgrade_required = limits_exceeded
    WHERE id = usage_record.id;
    
    -- Initialize AI processing summary record
    INSERT INTO ai_processing_summary (
        profile_id,
        shell_file_id,
        processing_status,
        overall_success,
        total_processing_time_ms,
        total_tokens_used,
        total_cost_usd,
        processing_started_at,
        user_agent,
        business_events
    ) VALUES (
        p_profile_id,
        p_shell_file_id,
        'initialized',
        FALSE,
        0,
        0,
        0.0,
        NOW(),
        'file_upload_system',
        jsonb_build_array(
            jsonb_build_object(
                'event', 'shell_file_uploaded',
                'timestamp', NOW(),
                'file_size_mb', file_size_mb,
                'pages', p_estimated_pages
            )
        )
    )
    ON CONFLICT (shell_file_id) DO NOTHING;
    
    -- Return usage status for UI
    RETURN jsonb_build_object(
        'shell_files_used', usage_record.shell_files_uploaded,
        'shell_files_limit', usage_record.shell_files_limit,
        'pages_used', usage_record.total_pages_processed,
        'pages_limit', usage_record.pages_limit,
        'storage_used_mb', usage_record.storage_used_mb,
        'storage_limit_mb', usage_record.storage_limit_mb,
        'over_limit', limits_exceeded,
        'upgrade_required', limits_exceeded,
        'plan_type', usage_record.plan_type
    );
END;
$$;

CREATE OR REPLACE FUNCTION track_ai_processing_usage(
    p_profile_id UUID,
    p_job_id UUID,
    p_tokens_used INTEGER,
    p_processing_seconds INTEGER DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIXED: Prevent search_path hijacking
AS $$
DECLARE
    usage_record RECORD;
    limits_exceeded BOOLEAN := FALSE;
    tracking_enabled BOOLEAN := FALSE;
BEGIN
    -- FIXED: CRITICAL SECURITY GUARD - Verify caller has access to profile
    IF NOT has_profile_access(auth.uid(), p_profile_id) THEN
        RAISE EXCEPTION 'Unauthorized: User % cannot access profile %', auth.uid(), p_profile_id;
    END IF;
    
    -- Check if usage tracking is enabled
    SELECT (config_value)::BOOLEAN INTO tracking_enabled 
    FROM system_configuration 
    WHERE config_key = 'features.usage_tracking_enabled';
    
    IF NOT COALESCE(tracking_enabled, FALSE) THEN
        RETURN jsonb_build_object('tracking_disabled', true);
    END IF;
    
    -- FIXED: Create current month usage record if it doesn't exist (like track_shell_file_upload_usage)
    INSERT INTO user_usage_tracking (profile_id, billing_cycle_start, billing_cycle_end)
    VALUES (
        p_profile_id, 
        date_trunc('month', NOW()), 
        date_trunc('month', NOW()) + interval '1 month'
    )
    ON CONFLICT (profile_id, billing_cycle_start) DO NOTHING;
    
    -- Increment AI usage counters
    UPDATE user_usage_tracking SET
        ai_tokens_used = ai_tokens_used + p_tokens_used,
        ai_processing_jobs = ai_processing_jobs + 1,
        ai_processing_minutes = ai_processing_minutes + (p_processing_seconds / 60),
        updated_at = NOW()
    WHERE profile_id = p_profile_id 
    AND billing_cycle_start = date_trunc('month', NOW())
    RETURNING * INTO usage_record;
    
    -- Check AI token limits (feature flagged)
    limits_exceeded := usage_record.ai_tokens_used > usage_record.ai_tokens_limit;
    
    -- Update limit status if AI limits exceeded
    UPDATE user_usage_tracking SET
        is_over_limit = CASE WHEN limits_exceeded THEN TRUE ELSE is_over_limit END,
        upgrade_required = CASE WHEN limits_exceeded THEN TRUE ELSE upgrade_required END
    WHERE id = usage_record.id;
    
    -- Update AI processing summary with completion data
    UPDATE ai_processing_summary SET
        total_tokens_used = total_tokens_used + p_tokens_used,
        total_processing_time_ms = total_processing_time_ms + (p_processing_seconds * 1000),
        processing_status = 'pass1_only', -- Default assumption for legacy calls
        business_events = business_events || jsonb_build_object(
            'event', 'ai_processing_completed',
            'timestamp', NOW(),
            'tokens_used', p_tokens_used,
            'processing_seconds', p_processing_seconds
        )
    WHERE shell_file_id = (
        SELECT shell_file_id FROM job_queue WHERE id = p_job_id LIMIT 1
    );
    
    RETURN jsonb_build_object(
        'ai_tokens_used', usage_record.ai_tokens_used,
        'ai_tokens_limit', usage_record.ai_tokens_limit,
        'ai_processing_jobs', usage_record.ai_processing_jobs,
        'over_limit', limits_exceeded
    );
END;
$$;

CREATE OR REPLACE FUNCTION get_user_usage_status(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIXED: Prevent search_path hijacking
AS $$
DECLARE
    usage_record RECORD;
    plan_record RECORD;
    tracking_enabled BOOLEAN := FALSE;
BEGIN
    -- FIXED: CRITICAL SECURITY GUARD - Verify caller has access to profile
    IF NOT has_profile_access(auth.uid(), p_profile_id) THEN
        RAISE EXCEPTION 'Unauthorized: User % cannot access profile %', auth.uid(), p_profile_id;
    END IF;
    
    -- Check if usage tracking is enabled
    SELECT (config_value)::BOOLEAN INTO tracking_enabled 
    FROM system_configuration 
    WHERE config_key = 'features.usage_tracking_enabled';
    
    IF NOT COALESCE(tracking_enabled, FALSE) THEN
        RETURN jsonb_build_object('tracking_disabled', true);
    END IF;
    
    -- Get current month usage
    SELECT * INTO usage_record
    FROM user_usage_tracking
    WHERE profile_id = p_profile_id
    AND billing_cycle_start = date_trunc('month', NOW());
    
    -- Create record if doesn't exist
    IF usage_record IS NULL THEN
        -- Get plan limits
        SELECT * INTO plan_record
        FROM subscription_plans 
        WHERE plan_type = 'free' AND is_active = TRUE;
        
        INSERT INTO user_usage_tracking (
            profile_id, plan_type,
            shell_files_limit, pages_limit, ai_tokens_limit, storage_limit_mb
        ) VALUES (
            p_profile_id, 'free',
            plan_record.shell_files_limit, plan_record.pages_limit, 
            plan_record.ai_tokens_limit, plan_record.storage_limit_mb
        ) RETURNING * INTO usage_record;
    END IF;
    
    RETURN jsonb_build_object(
        'current_period', jsonb_build_object(
            'start', usage_record.billing_cycle_start,
            'end', usage_record.billing_cycle_end
        ),
        'usage', jsonb_build_object(
            'shell_files', jsonb_build_object(
                'used', usage_record.shell_files_uploaded,
                'limit', usage_record.shell_files_limit,
                'percentage', ROUND((usage_record.shell_files_uploaded::NUMERIC / NULLIF(usage_record.shell_files_limit, 0)) * 100, 1)
            ),
            'pages', jsonb_build_object(
                'used', usage_record.total_pages_processed,
                'limit', usage_record.pages_limit,
                'percentage', ROUND((usage_record.total_pages_processed::NUMERIC / NULLIF(usage_record.pages_limit, 0)) * 100, 1)
            ),
            'ai_tokens', jsonb_build_object(
                'used', usage_record.ai_tokens_used,
                'limit', usage_record.ai_tokens_limit,
                'percentage', ROUND((usage_record.ai_tokens_used::NUMERIC / NULLIF(usage_record.ai_tokens_limit, 0)) * 100, 1)
            ),
            'storage', jsonb_build_object(
                'used_mb', usage_record.storage_used_mb,
                'limit_mb', usage_record.storage_limit_mb,
                'percentage', ROUND((usage_record.storage_used_mb::NUMERIC / NULLIF(usage_record.storage_limit_mb, 0)) * 100, 1)
            )
        ),
        'status', jsonb_build_object(
            'plan_type', usage_record.plan_type,
            'over_limit', usage_record.is_over_limit,
            'upgrade_required', usage_record.upgrade_required
        )
    );
END;
$$;

-- Pass 0.5 Atomic Manifest Write Function (Migration 35 - 2025-10-30, updated Migration 39 - 2025-11-04)
CREATE OR REPLACE FUNCTION write_pass05_manifest_atomic(
  -- Manifest data
  p_shell_file_id UUID,
  p_patient_id UUID,
  p_total_pages INTEGER,
  p_total_encounters_found INTEGER,
  p_ocr_average_confidence NUMERIC(3,2),
  p_pass_0_5_version TEXT,  -- Migration 41: Track Pass 0.5 version from environment (worker always passes explicitly)
  p_manifest_data JSONB,
  p_ai_model_used TEXT,
  p_ai_cost_usd NUMERIC(10,6),
  p_processing_time_ms INTEGER,

  -- Metrics data
  p_processing_session_id UUID,
  p_encounters_detected INTEGER,
  p_real_world_encounters INTEGER,
  p_planned_encounters INTEGER,
  p_pseudo_encounters INTEGER,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_encounter_confidence_average NUMERIC(3,2),
  p_encounter_types_found TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_manifest_id UUID;
  v_metrics_id UUID;
BEGIN
  -- Optional: Validate shell_file belongs to patient (defense in depth)
  -- Uncomment if cross-patient writes are detected in production
  /*
  IF NOT EXISTS (
    SELECT 1 FROM shell_files
    WHERE id = p_shell_file_id AND patient_id = p_patient_id
  ) THEN
    RAISE EXCEPTION 'shell_file_id % does not belong to patient_id %',
      p_shell_file_id, p_patient_id;
  END IF;
  */

  -- 1. Insert manifest (will fail if already exists due to unique constraint)
  -- Note: batch_count removed (Migration 39), ai_cost_usd moved to metrics (Migration 39)
  -- Note: batching_required removed (Migration 41), pass_0_5_version added (Migration 41)
  INSERT INTO shell_file_manifests (
    shell_file_id,
    patient_id,
    total_pages,
    total_encounters_found,
    ocr_average_confidence,
    pass_0_5_version,
    manifest_data,
    ai_model_used,
    processing_time_ms
  ) VALUES (
    p_shell_file_id,
    p_patient_id,
    p_total_pages,
    p_total_encounters_found,
    p_ocr_average_confidence,
    p_pass_0_5_version,
    p_manifest_data,
    p_ai_model_used,
    p_processing_time_ms
  )
  RETURNING manifest_id INTO v_manifest_id;

  -- 2. UPSERT metrics (idempotent on processing_session_id)
  -- Note: pages_per_encounter removed (Migration 39), batch_count removed (Migration 39), ai_cost_usd added (Migration 39)
  -- Note: batching_required hardcoded FALSE (Migration 41 - batching deferred to Pass 1 load testing)
  INSERT INTO pass05_encounter_metrics (
    patient_id,
    shell_file_id,
    processing_session_id,
    encounters_detected,
    real_world_encounters,
    planned_encounters,
    pseudo_encounters,
    processing_time_ms,
    ai_model_used,
    input_tokens,
    output_tokens,
    total_tokens,
    ai_cost_usd,
    ocr_average_confidence,
    encounter_confidence_average,
    encounter_types_found,
    total_pages,
    batching_required
  ) VALUES (
    p_patient_id,
    p_shell_file_id,
    p_processing_session_id,
    p_encounters_detected,
    p_real_world_encounters,
    p_planned_encounters,
    p_pseudo_encounters,
    p_processing_time_ms,
    p_ai_model_used,
    p_input_tokens,
    p_output_tokens,
    p_input_tokens + p_output_tokens,
    p_ai_cost_usd,
    p_ocr_average_confidence,
    p_encounter_confidence_average,
    p_encounter_types_found,
    p_total_pages,
    FALSE  -- Migration 41: Hardcoded (batching deferred until Pass 1 load testing)
  )
  ON CONFLICT (processing_session_id) DO UPDATE SET
    encounters_detected = EXCLUDED.encounters_detected,
    real_world_encounters = EXCLUDED.real_world_encounters,
    planned_encounters = EXCLUDED.planned_encounters,
    pseudo_encounters = EXCLUDED.pseudo_encounters,
    processing_time_ms = EXCLUDED.processing_time_ms,
    ai_model_used = EXCLUDED.ai_model_used,
    input_tokens = EXCLUDED.input_tokens,
    output_tokens = EXCLUDED.output_tokens,
    total_tokens = EXCLUDED.total_tokens,
    ai_cost_usd = EXCLUDED.ai_cost_usd,
    ocr_average_confidence = EXCLUDED.ocr_average_confidence,
    encounter_confidence_average = EXCLUDED.encounter_confidence_average,
    encounter_types_found = EXCLUDED.encounter_types_found
  RETURNING id INTO v_metrics_id;

  -- 3. Update shell_files completion flag
  UPDATE shell_files
  SET
    pass_0_5_completed = TRUE,
    pass_0_5_completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_shell_file_id;

  -- Return success with IDs
  RETURN jsonb_build_object(
    'success', true,
    'manifest_id', v_manifest_id,
    'metrics_id', v_metrics_id
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Manifest already exists (idempotency check passed)
    RAISE EXCEPTION 'Manifest already exists for shell_file_id %', p_shell_file_id;
  WHEN OTHERS THEN
    -- Any other error rolls back transaction
    RAISE;
END;
$$;

COMMENT ON FUNCTION write_pass05_manifest_atomic IS
  'Atomic transaction wrapper for Pass 0.5 manifest/metrics/shell_files writes. Ensures all-or-nothing behavior: if any write fails, all writes roll back. Called via RPC from worker to prevent partial failures.';

-- 9. Set up proper RLS and security
-- Enable RLS on job_queue (service role only)
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'job_queue_service_role_only') THEN
        CREATE POLICY "job_queue_service_role_only" ON job_queue
            FOR ALL USING (
                current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
                OR is_service_role()
            )
            WITH CHECK (
                current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
                OR is_service_role()
            );
    END IF;
END $$;

-- Grant execute permissions only to service role, revoke from others
REVOKE EXECUTE ON FUNCTION acquire_api_capacity(text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION release_api_capacity(text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION enqueue_job_v3(text, text, jsonb, text, int, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_next_job_v3(text, text[], text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_job_heartbeat(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reschedule_job(uuid, integer, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION complete_job(uuid, text, jsonb) FROM PUBLIC;
-- Analytics functions security
REVOKE EXECUTE ON FUNCTION track_shell_file_upload_usage(uuid, uuid, bigint, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION track_ai_processing_usage(uuid, uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_user_usage_status(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION acquire_api_capacity(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION release_api_capacity(text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION enqueue_job_v3(text, text, jsonb, text, int, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION claim_next_job_v3(text, text[], text[]) TO service_role;
GRANT EXECUTE ON FUNCTION update_job_heartbeat(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION reschedule_job(uuid, integer, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION complete_job(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION write_pass05_manifest_atomic(uuid, uuid, integer, integer, numeric, boolean, integer, jsonb, text, numeric, integer, uuid, integer, integer, integer, integer, integer, integer, numeric, text[]) TO service_role;
-- Analytics functions permissions - accessible to authenticated users
GRANT EXECUTE ON FUNCTION track_shell_file_upload_usage(uuid, uuid, bigint, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION track_ai_processing_usage(uuid, uuid, integer, integer) TO service_role; -- Service role only for worker usage
GRANT EXECUTE ON FUNCTION get_user_usage_status(uuid) TO authenticated;

COMMIT;