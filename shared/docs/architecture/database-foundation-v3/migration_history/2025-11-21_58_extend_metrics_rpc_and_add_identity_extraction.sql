-- ============================================================================
-- Migration: Extend Metrics RPC and Add Identity Extraction to Reconciliation
-- Date: 2025-11-21
-- Issue: Post-Migration 57 Data Quality Issues (#8 and #10)
--
-- PROBLEM:
--   1. Identity fields (patient_full_name, patient_date_of_birth, patient_address,
--      chief_complaint) not copied from pending encounters to final healthcare_encounters
--   2. update_strategy_a_metrics RPC only populates 7 of ~23 fields in pass05_encounter_metrics
--      (encounters_detected, real_world_encounters, pseudo_encounters, pendings_total,
--      cascades_total, orphans_total, chunk_count) - remaining 16 fields stay NULL/zero
--
-- SOLUTION:
--   Part 1: Extend update_strategy_a_metrics RPC to populate 16 additional metrics fields
--   Part 2: Extend reconcile_pending_to_final RPC to extract identity fields from JSONB
--
-- AFFECTED TABLES:
--   - healthcare_encounters (adds identity field population)
--   - pass05_encounter_metrics (extends metric coverage)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/08_job_coordination.sql (Lines 707-865: update_strategy_a_metrics RPC)
--   [X] current_schema/08_job_coordination.sql (Lines 526-683: reconcile_pending_to_final RPC)
--   [N/A] current_schema/03_clinical_core.sql (Identity columns already exist)
--
-- DOWNSTREAM UPDATES:
--   [X] TypeScript: pending-reconciler.ts (add pickBestValue, normalizeDateToISO helpers)
--   [X] TypeScript: pending-reconciler.ts (add identity fields to encounterData JSONB)
--   [N/A] Bridge schemas updated (not required for this change)
--
-- EXECUTED: 2025-11-21
-- ============================================================================

-- PART 1: Extend update_strategy_a_metrics RPC
-- Populates 16 additional fields: input_tokens, output_tokens, total_tokens, ai_cost_usd,
-- ocr_average_confidence, encounter_confidence_average, encounter_types_found, total_pages,
-- processing_time_ms, ai_model_used, pendings_total, cascades_total, orphans_total,
-- chunk_count, position_confidence_avg (if needed), batching_required

CREATE OR REPLACE FUNCTION update_strategy_a_metrics(
  p_shell_file_id UUID,
  p_session_id UUID
) RETURNS VOID AS $$
DECLARE
  v_metrics_id UUID;
  v_strategy_a_session_id UUID;

  -- Existing metrics (Migration 57)
  v_pendings_total INTEGER;
  v_cascades_total INTEGER;
  v_orphans_total INTEGER;
  v_chunk_count INTEGER;
  v_final_encounters_count INTEGER;
  v_real_world_count INTEGER;
  v_pseudo_count INTEGER;

  -- NEW: Token and cost metrics
  v_total_input_tokens INTEGER;
  v_total_output_tokens INTEGER;
  v_total_tokens INTEGER;
  v_total_cost_usd NUMERIC(10,6);

  -- NEW: Quality metrics
  v_ocr_avg_confidence NUMERIC(3,2);
  v_encounter_confidence_avg NUMERIC(3,2);
  v_encounter_types TEXT[];

  -- NEW: Performance metrics
  v_processing_time_ms INTEGER;
  v_ai_model_used TEXT;
  v_total_pages INTEGER;
  v_batching_required BOOLEAN;
BEGIN
  -- Get metrics record
  SELECT id INTO v_metrics_id
  FROM pass05_encounter_metrics
  WHERE shell_file_id = p_shell_file_id
    AND processing_session_id = p_session_id;

  IF v_metrics_id IS NULL THEN
    RAISE EXCEPTION 'No metrics record found for shell_file_id: %', p_shell_file_id;
  END IF;

  -- Get Strategy A session ID (pass05_progressive_sessions.id)
  SELECT id INTO v_strategy_a_session_id
  FROM pass05_progressive_sessions
  WHERE shell_file_id = p_shell_file_id;

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

  -- NEW QUERY 1: Token and cost metrics from progressive session
  SELECT
    total_input_tokens,
    total_output_tokens,
    total_cost_usd
  INTO v_total_input_tokens, v_total_output_tokens, v_total_cost_usd
  FROM pass05_progressive_sessions
  WHERE id = v_strategy_a_session_id;

  -- Calculate total tokens
  v_total_tokens := COALESCE(v_total_input_tokens, 0) + COALESCE(v_total_output_tokens, 0);

  -- NEW QUERY 2: Quality metrics from final encounters
  SELECT
    AVG(pass_0_5_confidence),
    ARRAY_AGG(DISTINCT encounter_type) FILTER (WHERE encounter_type IS NOT NULL)
  INTO v_encounter_confidence_avg, v_encounter_types
  FROM healthcare_encounters
  WHERE source_shell_file_id = p_shell_file_id
    AND identified_in_pass = 'pass_0_5';

  -- NEW QUERY 3: OCR confidence from chunk results
  SELECT AVG(ocr_confidence)
  INTO v_ocr_avg_confidence
  FROM pass05_chunk_results
  WHERE session_id = v_strategy_a_session_id;

  -- NEW QUERY 4: Performance metrics from progressive session
  SELECT
    ai_model_used,
    total_pages,
    strategy_version
  INTO v_ai_model_used, v_total_pages, v_batching_required
  FROM pass05_progressive_sessions
  WHERE id = v_strategy_a_session_id;

  -- Convert strategy_version to batching_required boolean
  -- Strategy A = TRUE (universal progressive), Strategy B = FALSE (direct processing)
  v_batching_required := (v_batching_required = 'strategy_a');

  -- NEW QUERY 5: Processing time from chunk results (total duration)
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

    -- NEW: Token and cost metrics
    input_tokens = COALESCE(v_total_input_tokens, 0),
    output_tokens = COALESCE(v_total_output_tokens, 0),
    total_tokens = COALESCE(v_total_tokens, 0),
    ai_cost_usd = v_total_cost_usd,

    -- NEW: Quality metrics
    ocr_average_confidence = v_ocr_avg_confidence,
    encounter_confidence_average = v_encounter_confidence_avg,
    encounter_types_found = v_encounter_types,

    -- NEW: Performance metrics
    processing_time_ms = COALESCE(v_processing_time_ms::INTEGER, 0),
    ai_model_used = COALESCE(v_ai_model_used, 'unknown'),
    total_pages = COALESCE(v_total_pages, 0),
    batching_required = COALESCE(v_batching_required, FALSE)
  WHERE id = v_metrics_id;

  RAISE NOTICE 'Updated metrics: % encounters (% real-world, % pseudo) from % pendings, % cascades, % chunks, % tokens (% in, % out), cost $%, OCR conf %, enc conf %',
    v_final_encounters_count, v_real_world_count, v_pseudo_count,
    v_pendings_total, v_cascades_total, v_chunk_count,
    v_total_tokens, v_total_input_tokens, v_total_output_tokens,
    v_total_cost_usd, v_ocr_avg_confidence, v_encounter_confidence_avg;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_strategy_a_metrics IS
  'Migration 58: Extended update_strategy_a_metrics to populate all ~23 fields in pass05_encounter_metrics.
   Previously only populated 7 fields (encounters_detected, real_world_encounters, pseudo_encounters,
   pendings_total, cascades_total, orphans_total, chunk_count). Now also populates:
   - Token metrics (input_tokens, output_tokens, total_tokens)
   - Cost metrics (ai_cost_usd)
   - Quality metrics (ocr_average_confidence, encounter_confidence_average, encounter_types_found)
   - Performance metrics (processing_time_ms, ai_model_used, total_pages, batching_required)
   See STRATEGY-A-DATA-QUALITY-AUDIT.md Issue #10 for details.';


-- PART 2: Extend reconcile_pending_to_final RPC to extract identity fields
-- Adds extraction for: patient_full_name, patient_date_of_birth, patient_address, chief_complaint

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

  -- Insert final encounter atomically (EXTENDED with identity fields)
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
    start_marker,
    start_marker_context,
    start_region_hint,
    start_text_y_top,
    start_text_height,
    start_y,
    end_page,
    end_boundary_type,
    end_marker,
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
    completed_at,
    -- Migration 58: Identity fields
    patient_full_name,
    patient_date_of_birth,
    patient_address,
    chief_complaint
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
    NOW(),
    -- Migration 58: Identity fields (extracted from JSONB)
    (p_encounter_data->>'patient_full_name')::TEXT,
    (p_encounter_data->>'patient_date_of_birth')::DATE,
    (p_encounter_data->>'patient_address')::TEXT,
    (p_encounter_data->>'chief_complaint')::TEXT
  RETURNING id INTO v_encounter_id;

  -- Mark all pendings as completed (atomic with insert)
  FOREACH v_pending_id IN ARRAY p_pending_ids
  LOOP
    UPDATE pass05_pending_encounters
    SET
      status = 'completed',
      reconciled_to = v_encounter_id,
      reconciled_at = NOW(),
      updated_at = NOW()
    WHERE id = v_pending_id;
  END LOOP;

  -- Update page assignments (atomic)
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
  'Migration 58: Extended reconcile_pending_to_final to extract identity fields from JSONB.
   Now extracts patient_full_name, patient_date_of_birth, patient_address, and chief_complaint
   from p_encounter_data JSONB parameter and writes to healthcare_encounters.
   These fields must be added to the JSONB by TypeScript reconciler using pickBestValue()
   and normalizeDateToISO() helpers. See STRATEGY-A-DATA-QUALITY-AUDIT.md Issue #8.';


-- Verification Queries
-- Query 1: Check metrics population after next reconciliation
-- SELECT
--   shell_file_id,
--   input_tokens, output_tokens, total_tokens, ai_cost_usd,
--   ocr_average_confidence, encounter_confidence_average,
--   processing_time_ms, ai_model_used, total_pages, batching_required
-- FROM pass05_encounter_metrics
-- ORDER BY created_at DESC LIMIT 1;

-- Query 2: Check identity fields in healthcare_encounters after next reconciliation
-- SELECT
--   id, patient_full_name, patient_date_of_birth, patient_address, chief_complaint
-- FROM healthcare_encounters
-- WHERE identified_in_pass = 'pass_0_5'
-- ORDER BY completed_at DESC LIMIT 1;

-- Rollback Script (if needed)
-- Revert to Migration 57 versions - requires re-running Migration 57 SQL for both functions
