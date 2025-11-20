-- ============================================================================
-- Migration: Pass 0.5 Progressive Refinement Infrastructure
-- Date: 2025-11-10
-- Issue: MAX_TOKENS error when processing large documents (219+ pages)
--
-- PROBLEM:
--   Large medical documents (200+ pages) generate excessive output tokens
--   during Pass 0.5 encounter discovery, exceeding Gemini 2.5 Flash's 65,536
--   token limit. Example: 219-page document generates ~80,000 output tokens
--   (120-150 encounters × ~542 tokens each), causing complete processing failure.
--
-- SOLUTION:
--   Implement progressive refinement architecture:
--   - Split large documents into 50-page chunks
--   - Process chunks sequentially with context handoff
--   - Handle encounters spanning chunk boundaries via pending encounter staging
--   - Reconcile incomplete encounters at session end
--   - Documents ≤100 pages continue using standard single-pass processing
--
-- AFFECTED TABLES:
--   NEW: pass05_progressive_sessions (session tracking)
--   NEW: pass05_chunk_results (chunk-level processing results)
--   NEW: pass05_pending_encounters (incomplete encounter staging)
--
-- KEY DESIGN DECISIONS:
--   - RLS policies use has_semantic_data_access() with 'ai_processing' resource type (enforces AI consent)
--   - Session totals aggregated from chunk_results during finalization
--   - Page ranges use 0-based indices (inclusive start, exclusive end)
--   - Feature flag: PASS_05_PROGRESSIVE_ENABLED (matches PASS_05_STRATEGY naming)
--   - UNIQUE constraint on (session_id, temp_encounter_id) prevents duplicate pending encounters
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/08_job_coordination.sql (Line 272-513: Added progressive tables after pass05_encounter_metrics)
--
-- DOWNSTREAM UPDATES:
--   [ ] Worker TypeScript implementation (progressive-processing-logic.ts) - Phase 1, not yet started
--   [ ] Bridge schemas (if applicable) - Not needed for progressive infrastructure
--   [ ] Type definitions (if applicable) - Will be needed when TypeScript implementation begins
--
-- MIGRATION EXECUTED:
--   [X] Applied via mcp__supabase__apply_migration() on 2025-11-10
--   [X] Verification query confirmed tables created successfully
--   [X] Verification: 3 tables, 1 view, 2 functions, 14 indexes, RLS enabled on all tables
-- ============================================================================

-- ============================================================================
-- Table 1: pass05_progressive_sessions
-- ============================================================================
-- Tracks the overall progressive processing session for a document
-- One session can have multiple chunks

CREATE TABLE IF NOT EXISTS pass05_progressive_sessions (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core references
  shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL,

  -- Document metadata
  total_pages INTEGER NOT NULL CHECK (total_pages > 0),
  chunk_size INTEGER NOT NULL CHECK (chunk_size > 0),
  total_chunks INTEGER NOT NULL CHECK (total_chunks > 0),
  current_chunk INTEGER NOT NULL DEFAULT 0 CHECK (current_chunk >= 0),

  -- Processing state
  processing_status TEXT NOT NULL DEFAULT 'initialized'
    CHECK (processing_status IN ('initialized', 'processing', 'completed', 'failed')),

  -- Handoff mechanism - stores context passed between chunks
  current_handoff_package JSONB,

  -- Results tracking
  total_encounters_found INTEGER DEFAULT 0,
  total_encounters_completed INTEGER DEFAULT 0,
  total_encounters_pending INTEGER DEFAULT 0,

  -- Quality metrics
  requires_manual_review BOOLEAN DEFAULT false,
  review_reasons TEXT[],
  average_confidence NUMERIC(3,2),

  -- Timing
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  total_processing_time INTERVAL,

  -- Cost tracking
  total_ai_calls INTEGER DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10,4) DEFAULT 0,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_progressive_sessions_shell_file
  ON pass05_progressive_sessions(shell_file_id);

CREATE INDEX IF NOT EXISTS idx_progressive_sessions_patient
  ON pass05_progressive_sessions(patient_id);

CREATE INDEX IF NOT EXISTS idx_progressive_sessions_status
  ON pass05_progressive_sessions(processing_status);

CREATE INDEX IF NOT EXISTS idx_progressive_sessions_created
  ON pass05_progressive_sessions(created_at DESC);

-- Comments for documentation
COMMENT ON TABLE pass05_progressive_sessions IS
  'Tracks progressive processing sessions for large documents split into chunks';

COMMENT ON COLUMN pass05_progressive_sessions.current_handoff_package IS
  'JSONB containing context to pass to next chunk: pending encounters, active admissions, etc.';

COMMENT ON COLUMN pass05_progressive_sessions.chunk_size IS
  'Number of pages per chunk (typically 50)';

-- ============================================================================
-- Table 2: pass05_chunk_results
-- ============================================================================
-- Stores detailed results from processing each individual chunk

CREATE TABLE IF NOT EXISTS pass05_chunk_results (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent session
  session_id UUID NOT NULL REFERENCES pass05_progressive_sessions(id) ON DELETE CASCADE,

  -- Chunk identification
  chunk_number INTEGER NOT NULL CHECK (chunk_number > 0),
  page_start INTEGER NOT NULL CHECK (page_start >= 0), -- 0-based array index (inclusive)
  page_end INTEGER NOT NULL CHECK (page_end > page_start), -- 0-based array index (exclusive, matches JavaScript slice)

  -- Processing state
  processing_status TEXT NOT NULL
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  processing_time_ms INTEGER,

  -- AI model details
  ai_model_used TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  ai_cost_usd NUMERIC(10,4),

  -- Handoff tracking
  handoff_received JSONB, -- Context this chunk received from previous
  handoff_generated JSONB, -- Context this chunk passes to next

  -- Encounter counts
  encounters_started INTEGER DEFAULT 0,
  encounters_completed INTEGER DEFAULT 0,
  encounters_continued INTEGER DEFAULT 0, -- Received from previous chunk

  -- Quality metrics
  confidence_score NUMERIC(3,2),
  ocr_average_confidence NUMERIC(3,2),

  -- Error handling
  error_message TEXT,
  error_context JSONB,
  retry_count INTEGER DEFAULT 0,

  -- Debugging (store full AI response for analysis)
  ai_response_raw JSONB,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chunk_results_session
  ON pass05_chunk_results(session_id, chunk_number);

CREATE INDEX IF NOT EXISTS idx_chunk_results_status
  ON pass05_chunk_results(processing_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chunk_results_session_chunk
  ON pass05_chunk_results(session_id, chunk_number);

-- Comments
COMMENT ON TABLE pass05_chunk_results IS
  'Detailed results from processing each chunk in a progressive session';

COMMENT ON COLUMN pass05_chunk_results.handoff_received IS
  'Context received from previous chunk (pending encounters, active context)';

COMMENT ON COLUMN pass05_chunk_results.handoff_generated IS
  'Context generated for next chunk (incomplete encounters, active state)';

COMMENT ON COLUMN pass05_chunk_results.encounters_continued IS
  'Number of encounters that started in a previous chunk and were completed in this one';

-- ============================================================================
-- Table 3: pass05_pending_encounters
-- ============================================================================
-- Temporary staging for encounters that span multiple chunks

CREATE TABLE IF NOT EXISTS pass05_pending_encounters (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent session
  session_id UUID NOT NULL REFERENCES pass05_progressive_sessions(id) ON DELETE CASCADE,

  -- Temporary identifier (used during processing, replaced when completed)
  temp_encounter_id TEXT NOT NULL,

  -- Chunk tracking
  chunk_started INTEGER NOT NULL,
  chunk_last_seen INTEGER,

  -- Partial encounter data (accumulated as chunks process)
  partial_data JSONB NOT NULL,
  page_ranges INTEGER[],

  -- Last seen context (for debugging handoff issues)
  last_seen_context TEXT,
  expected_continuation TEXT, -- 'lab_results', 'treatment_plan', etc.

  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'abandoned')),

  -- When completed, link to final encounter record
  completed_encounter_id UUID REFERENCES healthcare_encounters(id),
  completed_at TIMESTAMPTZ,

  -- Quality
  confidence NUMERIC(3,2),
  requires_review BOOLEAN DEFAULT false,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pending_encounters_session
  ON pass05_pending_encounters(session_id, status);

CREATE INDEX IF NOT EXISTS idx_pending_encounters_temp_id
  ON pass05_pending_encounters(temp_encounter_id);

CREATE INDEX IF NOT EXISTS idx_pending_encounters_completed
  ON pass05_pending_encounters(completed_encounter_id)
  WHERE completed_encounter_id IS NOT NULL;

-- Prevent duplicate pending encounters within a session
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_encounters_unique_temp_id
  ON pass05_pending_encounters(session_id, temp_encounter_id);

-- Comments
COMMENT ON TABLE pass05_pending_encounters IS
  'Staging table for encounters that span multiple chunks during progressive processing';

COMMENT ON COLUMN pass05_pending_encounters.temp_encounter_id IS
  'Temporary ID used during processing (e.g., "encounter_temp_001")';

COMMENT ON COLUMN pass05_pending_encounters.partial_data IS
  'Accumulated encounter data as chunks are processed';

COMMENT ON COLUMN pass05_pending_encounters.expected_continuation IS
  'Hint about what content is expected in next chunk to complete this encounter';

-- ============================================================================
-- Performance Monitoring View
-- ============================================================================
-- Aggregated view for monitoring progressive processing performance

CREATE OR REPLACE VIEW pass05_progressive_performance AS
SELECT
  ps.id as session_id,
  ps.shell_file_id,
  ps.patient_id,
  ps.total_pages,
  ps.total_chunks,
  ps.processing_status,
  ps.total_encounters_found,
  ps.total_encounters_completed,
  ps.total_encounters_pending,

  -- Timing metrics
  EXTRACT(EPOCH FROM (ps.completed_at - ps.started_at)) as total_seconds,
  EXTRACT(EPOCH FROM ps.total_processing_time) as processing_seconds,

  -- Token metrics
  ps.total_input_tokens,
  ps.total_output_tokens,
  ps.total_input_tokens + ps.total_output_tokens as total_tokens,
  ps.total_cost_usd,

  -- Quality metrics
  ps.average_confidence,
  ps.requires_manual_review,
  ps.review_reasons,

  -- Chunk-level aggregations
  COUNT(DISTINCT cr.id) as chunks_processed,
  SUM(cr.encounters_completed) as total_completed_in_chunks,
  AVG(cr.confidence_score) as avg_chunk_confidence,
  AVG(cr.processing_time_ms) as avg_chunk_time_ms,

  -- Pending encounter metrics
  COUNT(DISTINCT pe.id) FILTER (WHERE pe.status = 'completed') as pending_completed,
  COUNT(DISTINCT pe.id) FILTER (WHERE pe.status = 'pending') as pending_still_open,
  COUNT(DISTINCT pe.id) FILTER (WHERE pe.status = 'abandoned') as pending_abandoned,

  -- Timestamps
  ps.started_at,
  ps.completed_at,
  ps.created_at

FROM pass05_progressive_sessions ps
LEFT JOIN pass05_chunk_results cr ON ps.id = cr.session_id
LEFT JOIN pass05_pending_encounters pe ON ps.id = pe.session_id
GROUP BY ps.id;

COMMENT ON VIEW pass05_progressive_performance IS
  'Aggregated performance metrics for progressive processing sessions';

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to update session progress
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

-- Function to finalize progressive session
CREATE OR REPLACE FUNCTION finalize_progressive_session(
  p_session_id UUID
) RETURNS VOID AS $$
DECLARE
  v_total_encounters INTEGER;
  v_pending_count INTEGER;
  v_total_input_tokens INTEGER;
  v_total_output_tokens INTEGER;
  v_total_cost NUMERIC(10,4);
  v_avg_confidence NUMERIC(3,2);
  v_total_completed INTEGER;
  v_ai_calls INTEGER;
BEGIN
  -- Count final encounters
  SELECT COUNT(*) INTO v_total_encounters
  FROM healthcare_encounters
  WHERE primary_shell_file_id IN (
    SELECT shell_file_id FROM pass05_progressive_sessions WHERE id = p_session_id
  );

  -- Count still-pending encounters (should be 0 or flagged for review)
  SELECT COUNT(*) INTO v_pending_count
  FROM pass05_pending_encounters
  WHERE session_id = p_session_id AND status = 'pending';

  -- Aggregate metrics from chunks
  SELECT
    COALESCE(SUM(input_tokens), 0),
    COALESCE(SUM(output_tokens), 0),
    COALESCE(SUM(ai_cost_usd), 0),
    COALESCE(AVG(confidence_score), 0),
    COALESCE(SUM(encounters_completed), 0),
    COUNT(*)
  INTO
    v_total_input_tokens,
    v_total_output_tokens,
    v_total_cost,
    v_avg_confidence,
    v_total_completed,
    v_ai_calls
  FROM pass05_chunk_results
  WHERE session_id = p_session_id;

  -- Update session with aggregated metrics
  UPDATE pass05_progressive_sessions
  SET
    processing_status = 'completed',
    completed_at = now(),
    total_processing_time = now() - started_at,
    total_encounters_found = v_total_encounters,
    total_encounters_completed = v_total_completed,
    total_encounters_pending = v_pending_count,
    total_input_tokens = v_total_input_tokens,
    total_output_tokens = v_total_output_tokens,
    total_cost_usd = v_total_cost,
    average_confidence = v_avg_confidence,
    total_ai_calls = v_ai_calls,
    requires_manual_review = (v_pending_count > 0),
    updated_at = now()
  WHERE id = p_session_id;

  -- Flag for review if there are unresolved pending encounters
  IF v_pending_count > 0 THEN
    UPDATE pass05_progressive_sessions
    SET review_reasons = array_append(review_reasons,
          format('%s pending encounters not completed', v_pending_count))
    WHERE id = p_session_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE pass05_progressive_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass05_chunk_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass05_pending_encounters ENABLE ROW LEVEL SECURITY;

-- Progressive sessions: Users can view sessions for patients they have access to
-- Uses 'ai_processing' resource type to enforce AI consent requirements
CREATE POLICY pass05_progressive_sessions_profile_access
  ON pass05_progressive_sessions
  FOR SELECT
  USING (has_semantic_data_access(auth.uid(), patient_id, 'ai_processing'));

-- Chunk results: Users can view chunks for sessions they have access to
CREATE POLICY pass05_chunk_results_profile_access
  ON pass05_chunk_results
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM pass05_progressive_sessions
      WHERE has_semantic_data_access(auth.uid(), patient_id, 'ai_processing')
    )
  );

-- Pending encounters: Users can view pending encounters for sessions they have access to
CREATE POLICY pass05_pending_encounters_profile_access
  ON pass05_pending_encounters
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM pass05_progressive_sessions
      WHERE has_semantic_data_access(auth.uid(), patient_id, 'ai_processing')
    )
  );

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify tables created
SELECT
  table_name,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('pass05_progressive_sessions', 'pass05_chunk_results', 'pass05_pending_encounters')
ORDER BY table_name;

-- Verify indexes created
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE tablename LIKE 'pass05_%'
  AND (indexname LIKE '%progressive%' OR indexname LIKE '%chunk%' OR indexname LIKE '%pending%')
ORDER BY tablename, indexname;

-- Verify RLS enabled
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('pass05_progressive_sessions', 'pass05_chunk_results', 'pass05_pending_encounters')
ORDER BY tablename;

-- ============================================================================
-- Rollback Script (if needed)
-- ============================================================================
/*
DROP VIEW IF EXISTS pass05_progressive_performance;
DROP FUNCTION IF EXISTS update_progressive_session_progress(UUID, INTEGER, JSONB);
DROP FUNCTION IF EXISTS finalize_progressive_session(UUID);
DROP TABLE IF EXISTS pass05_pending_encounters CASCADE;
DROP TABLE IF EXISTS pass05_chunk_results CASCADE;
DROP TABLE IF EXISTS pass05_progressive_sessions CASCADE;
*/
