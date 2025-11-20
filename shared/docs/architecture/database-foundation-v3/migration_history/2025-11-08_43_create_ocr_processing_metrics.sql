-- ============================================================================
-- Migration: Create OCR Processing Metrics Table
-- Date: 2025-11-08
-- Issue: Phase 2 of OCR Logging Implementation Plan
--
-- PROBLEM: No database tracking for OCR batch performance metrics
-- Current logs are ephemeral (Render.com) and difficult to analyze for optimization.
-- Need permanent storage for batch size optimization and cost analysis.
--
-- SOLUTION: Create ocr_processing_metrics table to store per-job OCR performance data
-- Enables queries like:
--   - "What's the optimal batch size for 100+ page documents?"
--   - "How does provider latency vary over time?"
--   - "Which documents needed retry and why?"
--
-- AFFECTED TABLES: ocr_processing_metrics (new table)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/04_ai_processing.sql (Lines 198-322: Added ocr_processing_metrics table)
--
-- DOWNSTREAM UPDATES:
--   [ ] Worker code (apps/render-worker/src/worker.ts) - Add database write after OCR completion
--   [ ] Bridge schemas (N/A - no bridge schemas for metrics table)
--   [ ] TypeScript types (Auto-generated via mcp__supabase__generate_typescript_types)
--
-- RELATED DOCUMENTATION:
--   - OCR_LOGGING_IMPLEMENTATION_PLAN.md (Phase 2)
--   - TEST_REPORT_PARALLEL_FORMAT_OPTIMIZATION_2025-11-07.md
--
-- DEPENDENCIES:
--   - Requires shell_files table (03_clinical_core.sql)
--   - Requires user_profiles table (02_profiles.sql)
--   - Requires get_accessible_profiles() function (02_profiles.sql)
--
-- ROLLBACK PLAN:
--   DROP TABLE IF EXISTS ocr_processing_metrics CASCADE;
-- ============================================================================

-- Create OCR processing metrics table
CREATE TABLE IF NOT EXISTS ocr_processing_metrics (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key references
  shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Correlation tracking (links to application logs)
  -- Must be unique - one metrics record per OCR session
  correlation_id TEXT NOT NULL,

  -- Batch configuration (optimization target)
  batch_size INTEGER NOT NULL CHECK (batch_size > 0),
  total_batches INTEGER NOT NULL CHECK (total_batches > 0),
  total_pages INTEGER NOT NULL CHECK (total_pages > 0),

  -- Timing metrics (all in milliseconds)
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  processing_time_ms INTEGER NOT NULL CHECK (processing_time_ms >= 0), -- Allow 0 for sub-millisecond jobs
  average_batch_time_ms NUMERIC(10,2) CHECK (average_batch_time_ms IS NULL OR average_batch_time_ms >= 0),
  average_page_time_ms NUMERIC(10,2) CHECK (average_page_time_ms IS NULL OR average_page_time_ms >= 0),
  provider_avg_latency_ms INTEGER CHECK (provider_avg_latency_ms IS NULL OR provider_avg_latency_ms >= 0), -- Google Cloud Vision API response time

  -- Individual batch timings for distribution analysis
  batch_times_ms INTEGER[] NOT NULL DEFAULT '{}',

  -- Success/failure tracking
  successful_pages INTEGER NOT NULL DEFAULT 0 CHECK (successful_pages >= 0),
  failed_pages INTEGER NOT NULL DEFAULT 0 CHECK (failed_pages >= 0),
  failed_page_numbers INTEGER[] NOT NULL DEFAULT '{}',

  -- Quality metrics
  average_confidence NUMERIC(5,4) CHECK (average_confidence >= 0.0 AND average_confidence <= 1.0),
  total_text_length INTEGER CHECK (total_text_length >= 0),

  -- Resource usage (memory tracking)
  peak_memory_mb INTEGER CHECK (peak_memory_mb > 0),
  memory_freed_mb INTEGER CHECK (memory_freed_mb IS NULL OR memory_freed_mb >= 0),

  -- Cost estimation (for budget tracking)
  estimated_cost_usd NUMERIC(10,6) CHECK (estimated_cost_usd >= 0),
  estimated_cost_per_page_usd NUMERIC(10,6) CHECK (estimated_cost_per_page_usd >= 0),

  -- Provider info
  ocr_provider TEXT NOT NULL DEFAULT 'google_vision' CHECK (ocr_provider IN ('google_vision', 'aws_textract', 'azure_cv')),

  -- Deployment context (for environment comparison)
  environment TEXT CHECK (environment IN ('development', 'staging', 'production')),
  app_version TEXT,
  worker_id TEXT,

  -- Retry tracking (detect problematic documents)
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),

  -- Queue wait time (operational metric - detects worker starvation)
  queue_wait_ms INTEGER CHECK (queue_wait_ms >= 0),

  -- Audit timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraint: completed_at must be after started_at
  CONSTRAINT valid_ocr_timing CHECK (completed_at >= started_at)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_ocr_metrics_shell_file ON ocr_processing_metrics(shell_file_id);
CREATE INDEX IF NOT EXISTS idx_ocr_metrics_correlation ON ocr_processing_metrics(correlation_id);
CREATE INDEX IF NOT EXISTS idx_ocr_metrics_patient_id ON ocr_processing_metrics(patient_id);

-- Unique constraint: one metrics record per correlation_id (one per OCR session)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ocr_metrics_correlation ON ocr_processing_metrics(correlation_id);

-- Performance analysis indexes
CREATE INDEX IF NOT EXISTS idx_ocr_metrics_created_at ON ocr_processing_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_metrics_batch_perf ON ocr_processing_metrics(batch_size, average_page_time_ms);

-- Patient history index (common query pattern for user dashboards)
CREATE INDEX IF NOT EXISTS idx_ocr_metrics_patient_created_at ON ocr_processing_metrics(patient_id, created_at DESC);

-- Composite index for shell file history queries
CREATE INDEX IF NOT EXISTS idx_ocr_metrics_shell_file_created_at ON ocr_processing_metrics(shell_file_id, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE ocr_processing_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view OCR metrics for their own documents
DROP POLICY IF EXISTS ocr_metrics_user_select ON ocr_processing_metrics;
CREATE POLICY ocr_metrics_user_select
  ON ocr_processing_metrics
  FOR SELECT
  USING (
    patient_id IN (
      SELECT profile_id FROM get_accessible_profiles(auth.uid())
    )
  );

-- Policy: Service role has full access for worker operations
-- Pattern matches existing ocr_artifacts table for consistency
DROP POLICY IF EXISTS ocr_metrics_service_role ON ocr_processing_metrics;
CREATE POLICY ocr_metrics_service_role
  ON ocr_processing_metrics
  FOR ALL
  USING (
    coalesce((current_setting('request.jwt.claims', true)::jsonb->>'role')::text, '') = 'service_role'
  )
  WITH CHECK (
    coalesce((current_setting('request.jwt.claims', true)::jsonb->>'role')::text, '') = 'service_role'
  );

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON ocr_processing_metrics TO authenticated;
GRANT ALL ON ocr_processing_metrics TO service_role;

-- ============================================================================
-- TABLE AND COLUMN COMMENTS
-- ============================================================================

COMMENT ON TABLE ocr_processing_metrics IS 'OCR processing performance metrics for batch optimization and cost analysis. Stores one row per shell_file OCR session. Enables queries for optimal batch size, cost tracking, and quality monitoring.';

COMMENT ON COLUMN ocr_processing_metrics.batch_size IS 'Number of pages processed per batch (optimization target). Current testing: batch_size=5 is 34% faster than batch_size=20.';
COMMENT ON COLUMN ocr_processing_metrics.processing_time_ms IS 'Total OCR session processing time in milliseconds (wall clock time from start to completion).';
COMMENT ON COLUMN ocr_processing_metrics.provider_avg_latency_ms IS 'Average Google Cloud Vision API response time per request (milliseconds). Separate from internal processing time.';
COMMENT ON COLUMN ocr_processing_metrics.queue_wait_ms IS 'Time from job creation to job start (milliseconds). High values indicate worker starvation.';
COMMENT ON COLUMN ocr_processing_metrics.batch_times_ms IS 'Array of individual batch processing times for distribution analysis. Example: [1200, 1150, 1300] for 3 batches.';
COMMENT ON COLUMN ocr_processing_metrics.estimated_cost_per_page_usd IS 'Calculated cost per page for budget forecasting. Based on Google Cloud Vision pricing.';
COMMENT ON COLUMN ocr_processing_metrics.correlation_id IS 'Links to application logs (Render.com) for detailed debugging. Format: UUID generated at job start. Must be unique per OCR session.';
COMMENT ON COLUMN ocr_processing_metrics.environment IS 'Deployment environment (development, staging, production) for performance comparison.';
COMMENT ON COLUMN ocr_processing_metrics.retry_count IS 'Number of retries for this OCR session. Non-zero indicates problematic document.';

-- ============================================================================
-- SUCCESS CRITERIA
-- ============================================================================

-- Verification query: Confirm table exists and is accessible
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'ocr_processing_metrics'
  ) THEN
    RAISE EXCEPTION 'Table ocr_processing_metrics was not created';
  END IF;

  -- Verify RLS is enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = 'ocr_processing_metrics'
    AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on ocr_processing_metrics';
  END IF;

  -- Verify unique constraint on correlation_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
    AND tablename = 'ocr_processing_metrics'
    AND indexname = 'uq_ocr_metrics_correlation'
  ) THEN
    RAISE EXCEPTION 'Unique constraint on correlation_id not created';
  END IF;

  RAISE NOTICE 'Migration 43 completed successfully: ocr_processing_metrics table created';
  RAISE NOTICE 'Next step: Update worker.ts to write metrics after OCR completion';
END $$;
