-- =============================================================================
-- 08_JOB_COORDINATION.SQL - V3 Production Scalability & Render.com Worker Coordination
-- =============================================================================
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

-- Pass 1 Entity Detection Metrics
CREATE TABLE IF NOT EXISTS pass1_entity_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,

    -- Pass 1 Specific Metrics
    entities_detected INTEGER NOT NULL,
    processing_time_ms INTEGER NOT NULL,
    vision_model_used TEXT NOT NULL,
    ocr_model_used TEXT,

    -- Quality Metrics
    ocr_agreement_average NUMERIC(4,3),
    confidence_distribution JSONB, -- { "high": 15, "medium": 8, "low": 2 }
    entity_types_found TEXT[], -- ['medication', 'condition', 'vital_sign']

    -- Cost and Performance
    vision_tokens_used INTEGER,
    ocr_pages_processed INTEGER,
    cost_usd NUMERIC(8,4),

    -- Metadata
    user_agent TEXT,
    ip_address INET,
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

    -- Cost and Performance
    clinical_tokens_used INTEGER NOT NULL,
    processing_time_ms INTEGER NOT NULL,
    cost_usd NUMERIC(8,4),

    -- Metadata
    user_agent TEXT,
    ip_address INET,
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

    -- Cost and Performance
    semantic_tokens_used INTEGER NOT NULL,
    processing_time_ms INTEGER NOT NULL,
    cost_usd NUMERIC(8,4),

    -- Metadata
    user_agent TEXT,
    ip_address INET,
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

    -- Metadata
    user_agent TEXT,
    ip_address INET,
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
('worker.timeout_seconds', '300', 'system', 'Worker timeout threshold (5 minutes)', false),
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
    job_category text default 'standard',
    priority int default 5,
    p_scheduled_at timestamptz default now()
) RETURNS TABLE(job_id uuid, scheduled_at timestamptz)  -- IMPROVED: Return scheduled time for observability
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIXED: Prevent search_path hijacking
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
    
    -- Correlation ID logging
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
    
    RETURN QUERY SELECT job_id, p_scheduled_at;  -- FIXED: Return both job_id and scheduled time
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
BEGIN
    UPDATE job_queue SET
        status = 'completed',
        completed_at = NOW(),
        job_result = p_job_result,
        updated_at = NOW()
    WHERE id = p_job_id 
    AND worker_id = p_worker_id
    AND status = 'processing'; -- FIXED: Prevent double-completion or completing non-active jobs
    
    -- Correlation ID audit logging
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
-- Analytics functions permissions - accessible to authenticated users
GRANT EXECUTE ON FUNCTION track_shell_file_upload_usage(uuid, uuid, bigint, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION track_ai_processing_usage(uuid, uuid, integer, integer) TO service_role; -- Service role only for worker usage
GRANT EXECUTE ON FUNCTION get_user_usage_status(uuid) TO authenticated;

COMMIT;