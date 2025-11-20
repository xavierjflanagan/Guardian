-- ============================================================================
-- Migration 54: Fix page_ranges JSONB to INTEGER[][] cast in reconcile RPC
-- Date: 2025-11-20
-- Issue: Reconciliation failing with "cannot cast type jsonb to integer[]"
--
-- PROBLEM:
--   RPC function reconcile_pending_to_final line 118 tries to cast JSONB
--   directly to INTEGER[][] which is not supported in PostgreSQL.
--
--   Current (broken):
--     (p_encounter_data->'page_ranges')::INTEGER[][]
--
--   Error in production:
--     "cannot cast type jsonb to integer[]"
--     HTTP 400 from reconcile_pending_to_final RPC
--
-- EVIDENCE:
--   Production session: a3493521-647a-4cea-8371-1377b8073083
--   Render logs timestamp: 2025-11-20T07:04:00.997Z
--   All 3 pending encounters failed to reconcile (0 final encounters created)
--
-- ROOT CAUSE:
--   PostgreSQL cannot directly cast JSONB to array types. You must use
--   json_populate_recordset or array constructor with json_array_elements.
--
-- SOLUTION:
--   Since page_ranges is a 2D array and healthcare_encounters.page_ranges is
--   type INTEGER[][], we need to:
--   1. Extract JSONB as TEXT
--   2. Cast TEXT to INTEGER[][] (this works in PostgreSQL)
--
--   Fixed cast:
--     (p_encounter_data->>'page_ranges')::INTEGER[][]
--
--   Note: ->> extracts as TEXT, -> extracts as JSONB
--
-- AFFECTED TABLES: healthcare_encounters (insert via RPC)
-- AFFECTED FUNCTIONS: reconcile_pending_to_final
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/08_job_coordination.sql (Line 603: Cast method changed)
--   [X] Execution Date: 2025-11-20
--
-- DOWNSTREAM UPDATES:
--   [X] N/A - No TypeScript changes needed
--
-- VERIFICATION:
--   [X] RPC function created successfully
--   [ ] Test reconciliation with new document (next step)
--   [ ] Verify healthcare_encounters records created (next step)
--   [ ] Verify page_ranges field populated correctly (next step)
-- ============================================================================

-- Drop and recreate function with correct JSONB cast
CREATE OR REPLACE FUNCTION reconcile_pending_to_final(
  p_pending_ids UUID[],
  p_patient_id UUID,
  p_shell_file_id UUID,
  p_encounter_data JSONB
) RETURNS UUID AS $$
DECLARE
  v_encounter_id UUID;
  v_pending_id UUID;
BEGIN
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
    created_by_user_id
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
    (p_encounter_data->>'page_ranges')::INTEGER[][],    -- FIXED: ->> extracts as TEXT, then cast to array
    (p_encounter_data->>'pass_0_5_confidence')::NUMERIC,
    (p_encounter_data->>'summary')::TEXT,
    'pass_0_5'::VARCHAR,
    'ai_pass_0_5'::VARCHAR,
    (p_encounter_data->>'is_real_world_visit')::BOOLEAN,
    (p_encounter_data->>'data_quality_tier')::VARCHAR,
    (p_encounter_data->'quality_criteria_met')::JSONB,    -- Keep as JSONB (no cast needed)
    NOW(),
    'shell_file'::VARCHAR,
    (p_encounter_data->>'created_by_user_id')::UUID
  RETURNING id INTO v_encounter_id;

  -- Mark all pendings as completed (atomic with insert)
  FOREACH v_pending_id IN ARRAY p_pending_ids
  LOOP
    UPDATE pass05_pending_encounters
    SET
      status = 'completed',
      reconciled_to = v_encounter_id,
      updated_at = NOW()
    WHERE id = v_pending_id;
  END LOOP;

  -- Update page assignments with final encounter ID (atomic)
  -- CRITICAL: Links pages to final encounter (prevents orphaned pages)
  UPDATE pass05_page_assignments
  SET
    encounter_id = v_encounter_id,
    reconciled_at = NOW()
  WHERE pending_id = ANY(p_pending_ids);

  RETURN v_encounter_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reconcile_pending_to_final IS
'Strategy A reconciliation: Atomically creates final encounter from pending encounters and marks them completed. Migration 54: Fixed page_ranges JSONB->TEXT->INTEGER[][] cast';
