-- ============================================================================
-- Migration 57: Audit Trail and Metrics Tracking Improvements
-- Date: 2025-11-20
-- Fixes: Rabbits #14-#17, #21, #22 from Rabbit Hunt 2025-11-20
--
-- ISSUES ADDRESSED:
--   Rabbit #14: Missing reconciled_at timestamp in pass05_pending_encounters
--   Rabbit #15: Missing reconciled_from_pendings in healthcare_encounters
--   Rabbit #16: Incorrect chunk_count in healthcare_encounters (shows 1, should be 3)
--   Rabbit #17: Missing Migration 49 metrics (pendings_total, cascades_total, etc.)
--   Rabbit #21: Missing completed_at timestamp in healthcare_encounters
--   Rabbit #22: Missing cascade_id in healthcare_encounters
--
-- EVIDENCE:
--   Production session: 1fe015a5-b7fa-4e07-83c6-966847ba855b
--   - 3 pending encounters created successfully
--   - 1 final encounter created successfully
--   - But: Missing timestamps, incomplete metrics, no audit trail
--
-- ROOT CAUSE:
--   The reconcile_pending_to_final RPC was focused on core functionality
--   and didn't populate audit trail and tracking fields.
--
-- SOLUTION:
--   1. Add reconciled_at timestamp to pending encounters UPDATE
--   2. Add reconciled_from_pendings to healthcare_encounters INSERT (as INTEGER count via cardinality())
--   3. Fix chunk_count calculation (count distinct chunks from pendings)
--   4. Add cascade_id to healthcare_encounters (from first pending)
--   5. Add completed_at timestamp (set at reconciliation time)
--   6. Create helper function to update metrics after reconciliation
--
-- REVIEW FIXES (Independent AI review - 2025-11-20):
--   - Fixed reconciled_from_pendings: changed from UUID[] array to INTEGER count using cardinality()
--   - Fixed metrics selection: added processing_session_id to WHERE clause to prevent multi-row errors
--
-- AFFECTED TABLES:
--   - pass05_pending_encounters (UPDATE via RPC)
--   - healthcare_encounters (INSERT via RPC)
--   - pass05_encounter_metrics (new helper function)
--
-- AFFECTED FUNCTIONS:
--   - reconcile_pending_to_final (enhanced)
--   - update_strategy_a_metrics (new helper)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [ ] current_schema/08_job_coordination.sql (Lines TBD)
--   [ ] Execution Date: TBD
--
-- DOWNSTREAM UPDATES:
--   [ ] N/A - No TypeScript changes needed (these are backend improvements)
--
-- VERIFICATION:
--   [ ] RPC function updated successfully
--   [ ] Test reconciliation with real data
--   [ ] Verify all timestamps populated
--   [ ] Verify chunk_count calculation correct
--   [ ] Verify metrics updated after reconciliation
-- ============================================================================

-- Drop and recreate function with audit trail improvements
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
  -- Get cascade_id from first pending (Rabbit #22)
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
    page_ranges,                       -- INTEGER[][] column
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
    -- Migration 57: New audit trail and tracking fields
    reconciled_from_pendings,          -- Rabbit #15: Track source pendings
    chunk_count,                        -- Rabbit #16: Count chunks correctly
    cascade_id,                         -- Rabbit #22: Store source cascade
    completed_at                        -- Rabbit #21: Mark completion time
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
    -- Migration 55: Properly convert JSONB array to INTEGER[][]
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
    (p_encounter_data->'quality_criteria_met')::JSONB,    -- Keep as JSONB (no cast needed)
    NOW(),
    'shell_file'::VARCHAR,
    (p_encounter_data->>'created_by_user_id')::UUID,
    -- Migration 57: Audit trail and tracking fields
    cardinality(p_pending_ids),         -- Rabbit #15: Count of source pendings (FIXED: was p_pending_ids array)
    (SELECT COUNT(DISTINCT chunk_number)  -- Rabbit #16: Count unique chunks
     FROM pass05_pending_encounters
     WHERE id = ANY(p_pending_ids)),
    v_cascade_id,                       -- Rabbit #22: Store cascade ID
    NOW()                               -- Rabbit #21: Mark completion time
  RETURNING id INTO v_encounter_id;

  -- Mark all pendings as completed (atomic with insert)
  FOREACH v_pending_id IN ARRAY p_pending_ids
  LOOP
    UPDATE pass05_pending_encounters
    SET
      status = 'completed',
      reconciled_to = v_encounter_id,
      reconciled_at = NOW(),            -- Rabbit #14: Add reconciliation timestamp
      updated_at = NOW()
      WHERE id = v_pending_id;
  END LOOP;

  -- Update page assignments with final encounter ID (atomic)
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
'Strategy A reconciliation: Atomically creates final encounter from pending encounters and marks them completed. Migration 57: Enhanced with audit trail timestamps, source tracking (reconciled_from_pendings, chunk_count, cascade_id), and completion timestamp.';

-- ============================================================================
-- Helper Function: Update Strategy A Metrics After Reconciliation
-- Addresses Rabbit #17: Missing Migration 49 metrics
-- ============================================================================

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
  -- Get metrics record ID (FIXED: Added processing_session_id to prevent multi-row error on reprocessing)
  SELECT id INTO v_metrics_id
  FROM pass05_encounter_metrics
  WHERE shell_file_id = p_shell_file_id
    AND processing_session_id = p_session_id;

  IF v_metrics_id IS NULL THEN
    RAISE EXCEPTION 'No metrics record found for shell_file_id: %', p_shell_file_id;
  END IF;

  -- Calculate Strategy A metrics from pass05_pending_encounters
  SELECT
    COUNT(*),
    COUNT(DISTINCT cascade_id) FILTER (WHERE cascade_id IS NOT NULL),
    COUNT(*) FILTER (WHERE status = 'pending'),  -- Orphans
    (SELECT MAX(chunk_number) FROM pass05_chunk_results WHERE session_id = p_session_id)
  INTO v_pendings_total, v_cascades_total, v_orphans_total, v_chunk_count
  FROM pass05_pending_encounters
  WHERE session_id = p_session_id;

  -- Calculate final encounter counts
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_real_world_visit = TRUE),
    COUNT(*) FILTER (WHERE is_real_world_visit = FALSE)
  INTO v_final_encounters_count, v_real_world_count, v_pseudo_count
  FROM healthcare_encounters
  WHERE source_shell_file_id = p_shell_file_id
    AND identified_in_pass = 'pass_0_5';

  -- Update metrics with Strategy A reconciliation data
  UPDATE pass05_encounter_metrics
  SET
    -- Core encounter counts
    encounters_detected = v_final_encounters_count,
    real_world_encounters = v_real_world_count,
    pseudo_encounters = v_pseudo_count,
    -- Migration 49 metrics (Rabbit #17)
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
'Migration 57 (Rabbit #17): Updates pass05_encounter_metrics after Strategy A reconciliation completes. Populates pendings_total, cascades_total, orphans_total, chunk_count, and corrects encounter counts that were written as zeros before reconciliation.';
