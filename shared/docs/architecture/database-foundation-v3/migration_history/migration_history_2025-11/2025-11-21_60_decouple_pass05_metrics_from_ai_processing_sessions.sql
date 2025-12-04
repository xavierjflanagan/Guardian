-- ============================================================================
-- Migration: Decouple Pass 0.5 Metrics from Multi-Pass Session Tracking
-- Date: 2025-11-21
-- Issue: Architectural cleanup - Remove legacy V2 coupling
--
-- PROBLEM:
--   1. pass05_encounter_metrics.processing_session_id has FK to ai_processing_sessions.id
--   2. Strategy A (universal progressive) never creates ai_processing_sessions record
--   3. FK constraint blocks metrics insert, causing NULL values for all metrics
--   4. ai_processing_sessions is for multi-pass tracking (Pass 0.5→1→2→3), not Pass 0.5 alone
--
-- ROOT CAUSE:
--   Standard Mode vs Progressive Mode binary is GONE (Strategy A is universal)
--   - Standard Mode code in index.ts (lines 113-174) is DEAD CODE never executed
--   - That code created ai_processing_sessions record
--   - Progressive Mode never creates it, breaking FK constraint
--   - Architecture mistake: Pass 0.5 metrics shouldn't depend on multi-pass session
--
-- SOLUTION:
--   Part 1: Make processing_session_id nullable and drop FK constraint
--   Part 2: Update update_strategy_a_metrics RPC to not require processing_session_id
--   Part 3: TypeScript cleanup in reconciler (remove ai_processing_sessions query)
--
-- AFFECTED TABLES:
--   - pass05_encounter_metrics (remove FK constraint, make column nullable)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/08_job_coordination.sql (pass05_encounter_metrics table - line 232)
--   [X] current_schema/08_job_coordination.sql (update_strategy_a_metrics RPC - lines 707-898)
--
-- DOWNSTREAM UPDATES:
--   [X] TypeScript: pending-reconciler.ts (removed ai_processing_sessions query, lines 237-255)
--
-- EXECUTED: 2025-11-21
-- ============================================================================

-- PART 1: Remove FK constraint and make column nullable
-- ============================================================================

-- Drop the foreign key constraint
ALTER TABLE pass05_encounter_metrics
  DROP CONSTRAINT IF EXISTS pass05_encounter_metrics_processing_session_id_fkey;

-- Make processing_session_id nullable (allows insert without ai_processing_sessions record)
ALTER TABLE pass05_encounter_metrics
  ALTER COLUMN processing_session_id DROP NOT NULL;

COMMENT ON COLUMN pass05_encounter_metrics.processing_session_id IS
  'Migration 60: Made nullable. Legacy V2 field for multi-pass session tracking.
   Pass 0.5 metrics are now self-contained using shell_file_id for lookups.
   This column may be populated by Pass 1/2/3 when they run, but Pass 0.5 does not use it.';


-- PART 2: Update update_strategy_a_metrics RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION update_strategy_a_metrics(
  p_shell_file_id UUID,
  p_session_id UUID DEFAULT NULL  -- Migration 60: Kept for backward compatibility but ignored
) RETURNS VOID AS $$
DECLARE
  v_metrics_id UUID;
  v_strategy_a_session_id UUID;
  v_patient_id UUID;

  -- Existing metrics (Migration 57)
  v_pendings_total INTEGER;
  v_cascades_total INTEGER;
  v_orphans_total INTEGER;
  v_chunk_count INTEGER;
  v_final_encounters_count INTEGER;
  v_real_world_count INTEGER;
  v_pseudo_count INTEGER;

  -- Migration 58: Token and cost metrics
  v_total_input_tokens INTEGER;
  v_total_output_tokens INTEGER;
  v_total_tokens INTEGER;
  v_total_cost_usd NUMERIC(10,6);

  -- Migration 58: Quality metrics
  v_ocr_avg_confidence NUMERIC(3,2);
  v_encounter_confidence_avg NUMERIC(3,2);
  v_encounter_types TEXT[];

  -- Migration 58: Performance metrics
  v_processing_time_ms INTEGER;
  v_ai_model_used TEXT;
  v_total_pages INTEGER;
BEGIN
  -- Get Strategy A session ID (pass05_progressive_sessions.id)
  -- Use LIMIT 1 for safety against duplicate records
  SELECT id, patient_id INTO v_strategy_a_session_id, v_patient_id
  FROM pass05_progressive_sessions
  WHERE shell_file_id = p_shell_file_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_strategy_a_session_id IS NULL THEN
    RAISE EXCEPTION 'No pass05_progressive_sessions record found for shell_file_id: %', p_shell_file_id;
  END IF;

  -- Get or create metrics record (self-healing)
  SELECT id INTO v_metrics_id
  FROM pass05_encounter_metrics
  WHERE shell_file_id = p_shell_file_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Migration 60: If no metrics record exists, create it (Strategy A never creates it)
  IF v_metrics_id IS NULL THEN
    INSERT INTO pass05_encounter_metrics (
      shell_file_id,
      patient_id,
      processing_session_id,  -- Left NULL (decoupled from ai_processing_sessions)
      encounters_detected,
      real_world_encounters,
      pseudo_encounters,
      processing_time_ms,
      ai_model_used,
      input_tokens,
      output_tokens,
      total_tokens,
      total_pages
    ) VALUES (
      p_shell_file_id,
      v_patient_id,
      NULL,  -- No longer requires ai_processing_sessions FK
      0,     -- Will be updated below
      0,     -- Will be updated below
      0,     -- Will be updated below
      0,     -- Will be updated below
      'unknown',  -- Will be updated below
      0,     -- Will be updated below
      0,     -- Will be updated below
      0,     -- Will be updated below
      0      -- Will be updated below
    )
    RETURNING id INTO v_metrics_id;

    RAISE NOTICE 'Created new metrics record for shell_file_id: %', p_shell_file_id;
  END IF;

  -- EXISTING QUERY: Pendings, cascades, orphans, chunks
  SELECT
    COUNT(*),
    COUNT(DISTINCT cascade_id) FILTER (WHERE cascade_id IS NOT NULL),
    COUNT(*) FILTER (WHERE status = 'pending'),
    (SELECT MAX(chunk_number) FROM pass05_chunk_results WHERE session_id = v_strategy_a_session_id)
  INTO v_pendings_total, v_cascades_total, v_orphans_total, v_chunk_count
  FROM pass05_pending_encounters
  WHERE session_id = v_strategy_a_session_id;

  -- EXISTING QUERY: Final encounter counts
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_real_world_visit = TRUE),
    COUNT(*) FILTER (WHERE is_real_world_visit = FALSE)
  INTO v_final_encounters_count, v_real_world_count, v_pseudo_count
  FROM healthcare_encounters
  WHERE source_shell_file_id = p_shell_file_id
    AND identified_in_pass = 'pass_0_5';

  -- Migration 58: Token and cost metrics from progressive session
  SELECT
    total_input_tokens,
    total_output_tokens,
    total_cost_usd
  INTO v_total_input_tokens, v_total_output_tokens, v_total_cost_usd
  FROM pass05_progressive_sessions
  WHERE id = v_strategy_a_session_id;

  -- Calculate total tokens
  v_total_tokens := COALESCE(v_total_input_tokens, 0) + COALESCE(v_total_output_tokens, 0);

  -- Migration 58: Quality metrics from final encounters
  SELECT
    AVG(pass_0_5_confidence),
    ARRAY_AGG(DISTINCT encounter_type) FILTER (WHERE encounter_type IS NOT NULL)
  INTO v_encounter_confidence_avg, v_encounter_types
  FROM healthcare_encounters
  WHERE source_shell_file_id = p_shell_file_id
    AND identified_in_pass = 'pass_0_5';

  -- Migration 58: OCR confidence from chunk results
  SELECT AVG(ocr_confidence)
  INTO v_ocr_avg_confidence
  FROM pass05_chunk_results
  WHERE session_id = v_strategy_a_session_id;

  -- Migration 58: Performance metrics from progressive session
  SELECT
    ai_model_used,
    total_pages
  INTO v_ai_model_used, v_total_pages
  FROM pass05_progressive_sessions
  WHERE id = v_strategy_a_session_id;

  -- Migration 58: Processing time from chunk results (total duration)
  SELECT
    EXTRACT(EPOCH FROM (MAX(completed_at) - MIN(started_at))) * 1000
  INTO v_processing_time_ms
  FROM pass05_chunk_results
  WHERE session_id = v_strategy_a_session_id;

  -- UPDATE: All metrics (existing + new)
  UPDATE pass05_encounter_metrics
  SET
    -- Existing fields (Migration 57)
    encounters_detected = v_final_encounters_count,
    real_world_encounters = v_real_world_count,
    pseudo_encounters = v_pseudo_count,
    pendings_total = v_pendings_total,
    cascades_total = v_cascades_total,
    orphans_total = v_orphans_total,
    chunk_count = v_chunk_count,

    -- Migration 58: Token and cost metrics
    input_tokens = COALESCE(v_total_input_tokens, 0),
    output_tokens = COALESCE(v_total_output_tokens, 0),
    total_tokens = COALESCE(v_total_tokens, 0),
    ai_cost_usd = v_total_cost_usd,

    -- Migration 58: Quality metrics
    ocr_average_confidence = v_ocr_avg_confidence,
    encounter_confidence_average = v_encounter_confidence_avg,
    encounter_types_found = v_encounter_types,

    -- Migration 58: Performance metrics
    processing_time_ms = COALESCE(v_processing_time_ms::INTEGER, 0),
    ai_model_used = COALESCE(v_ai_model_used, 'unknown'),
    total_pages = COALESCE(v_total_pages, 0)
  WHERE id = v_metrics_id;

  RAISE NOTICE 'Updated metrics: % encounters (% real-world, % pseudo) from % pendings, % cascades, % chunks, % tokens (% in, % out), cost $%, OCR conf %, enc conf %',
    v_final_encounters_count, v_real_world_count, v_pseudo_count,
    v_pendings_total, v_cascades_total, v_chunk_count,
    v_total_tokens, v_total_input_tokens, v_total_output_tokens,
    v_total_cost_usd, v_ocr_avg_confidence, v_encounter_confidence_avg;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_strategy_a_metrics IS
  'Migration 60: Made p_session_id parameter optional (backward compatibility - ignored in function body).
   Pass 0.5 metrics now self-contained and self-healing (creates record if missing).
   Function looks up metrics by shell_file_id, queries pass05_progressive_sessions for session data.
   No longer depends on ai_processing_sessions FK (multi-pass tracker).
   Includes robustness measures (ORDER BY/LIMIT 1) to handle duplicate records from re-uploads.';


-- Verification Queries
-- ============================================================================

-- Query 1: Verify FK constraint removed
-- SELECT conname, contype
-- FROM pg_constraint
-- WHERE conrelid = 'pass05_encounter_metrics'::regclass
--   AND conname = 'pass05_encounter_metrics_processing_session_id_fkey';
-- -- Should return 0 rows

-- Query 2: Verify column is now nullable
-- SELECT column_name, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'pass05_encounter_metrics'
--   AND column_name = 'processing_session_id';
-- -- Should show is_nullable = 'YES'

-- Query 3: Test metrics update after next upload
-- SELECT shell_file_id, pendings_total, cascades_total, orphans_total, chunk_count,
--        input_tokens, output_tokens, total_tokens, ai_cost_usd
-- FROM pass05_encounter_metrics
-- ORDER BY created_at DESC LIMIT 1;
-- -- All fields should be populated (not NULL)


-- Rollback Script (if needed)
-- ============================================================================
-- Re-add FK constraint (requires ai_processing_sessions records to exist first):
-- ALTER TABLE pass05_encounter_metrics
--   ADD CONSTRAINT pass05_encounter_metrics_processing_session_id_fkey
--   FOREIGN KEY (processing_session_id)
--   REFERENCES ai_processing_sessions(id)
--   ON DELETE CASCADE;
--
-- ALTER TABLE pass05_encounter_metrics
--   ALTER COLUMN processing_session_id SET NOT NULL;
--
-- Restore update_strategy_a_metrics to Migration 58 version (with p_session_id parameter)
