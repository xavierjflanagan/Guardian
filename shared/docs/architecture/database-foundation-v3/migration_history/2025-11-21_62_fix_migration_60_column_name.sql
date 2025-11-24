-- ============================================================================
-- Migration: Hotfix Migration 60 - Fix Column Names, Table Sources, and Timing Race
-- Date: 2025-11-21
-- Issue: Migration 60 RPC has THREE bugs causing errors and missing data
--
-- PROBLEM #1: OCR Confidence Column Name Typo
--   Migration 60 update_strategy_a_metrics RPC references wrong column name:
--   - Uses: ocr_confidence (DOES NOT EXIST)
--   - Should use: ocr_average_confidence (ACTUAL COLUMN)
--   - Location: Migration 60 line 186
--
-- PROBLEM #2: AI Model Queried from Wrong Table
--   Migration 60 update_strategy_a_metrics RPC queries ai_model_used from wrong table:
--   - Tries to query: ai_model_used from pass05_progressive_sessions (COLUMN DOESN'T EXIST)
--   - Should query from: pass05_chunk_results (WHERE COLUMN EXISTS)
--   - Location: Migration 60 lines 192-197
--
-- PROBLEM #3: Token/Cost Race Condition (The "Rabbit")
--   - RPC queries total_input_tokens/cost from pass05_progressive_sessions
--   - BUT: pass05_progressive_sessions is only updated with totals AFTER reconciliation (in finalizeSessionMetrics)
--   - Reconciliation calls this RPC *before* finalizeSessionMetrics
--   - Result: Tokens and cost are always 0 in the metrics table
--
-- ROOT CAUSE:
--   - Typo in column name
--   - Architectural misunderstanding of where data lives (per-chunk vs per-session)
--   - Timing dependency between reconciler and session finalizer
--
-- SOLUTION:
--   Fix all three bugs in update_strategy_a_metrics RPC:
--   1. Change ocr_confidence → ocr_average_confidence
--   2. Query ai_model_used from pass05_chunk_results
--   3. Aggregate tokens/cost directly from pass05_chunk_results (removing race condition)
--
-- AFFECTED TABLES:
--   None (RPC function only)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/08_job_coordination.sql (lines 814-855: fixed all three bugs)
--
-- EXECUTED: 2025-11-21 (Migration applied via Supabase MCP)
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

  -- Migration 62 FIX #3: Aggregate tokens/cost from chunk results (Race Condition Fix)
  -- Do NOT query pass05_progressive_sessions because it is updated AFTER reconciliation
  SELECT
    COALESCE(SUM(input_tokens), 0),
    COALESCE(SUM(output_tokens), 0),
    COALESCE(SUM(ai_cost_usd), 0)
  INTO v_total_input_tokens, v_total_output_tokens, v_total_cost_usd
  FROM pass05_chunk_results
  WHERE session_id = v_strategy_a_session_id;

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

  -- Migration 62 FIX #1: Correct column name from ocr_confidence to ocr_average_confidence
  SELECT AVG(ocr_average_confidence)
  INTO v_ocr_avg_confidence
  FROM pass05_chunk_results
  WHERE session_id = v_strategy_a_session_id;

  -- Migration 62 FIX #2: Query ai_model_used from pass05_chunk_results (not pass05_progressive_sessions)
  -- Note: All chunks use same model, so LIMIT 1 is safe
  SELECT ai_model_used
  INTO v_ai_model_used
  FROM pass05_chunk_results
  WHERE session_id = v_strategy_a_session_id
  ORDER BY chunk_number
  LIMIT 1;

  -- Query total_pages from pass05_progressive_sessions (this was CORRECT in Migration 60)
  SELECT total_pages
  INTO v_total_pages
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
  'Migration 62: Fixed THREE bugs from Migration 60:
   1. Column name typo: ocr_confidence → ocr_average_confidence
   2. Wrong table query: ai_model_used now queried from pass05_chunk_results
   3. Race condition: tokens/cost now aggregated from pass05_chunk_results (not progressive_sessions)
   Migration 60: Made p_session_id parameter optional (backward compatibility - ignored in function body).
   Pass 0.5 metrics now self-contained and self-healing (creates record if missing).
   Function looks up metrics by shell_file_id, queries pass05_progressive_sessions for session data.
   No longer depends on ai_processing_sessions FK (multi-pass tracker).';


-- Verification Query
-- ============================================================================
-- Test the RPC with recent upload
-- SELECT update_strategy_a_metrics('00cf4b86-adb4-476f-aa4d-7dd495c363a6'::uuid);
-- Should execute without error and create/update metrics record

-- Check metrics populated
-- SELECT shell_file_id, pendings_total, cascades_total, orphans_total, chunk_count,
--        input_tokens, output_tokens, total_tokens, ai_cost_usd, ocr_average_confidence
-- FROM pass05_encounter_metrics
-- WHERE shell_file_id = '00cf4b86-adb4-476f-aa4d-7dd495c363a6';
-- All fields should be populated (not NULL)
