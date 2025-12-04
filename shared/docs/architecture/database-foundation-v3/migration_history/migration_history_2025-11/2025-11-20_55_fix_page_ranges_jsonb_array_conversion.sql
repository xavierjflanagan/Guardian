-- ============================================================================
-- Migration 55: Fix page_ranges JSONB array to INTEGER[][] conversion
-- Date: 2025-11-20
-- Issue: Reconciliation failing with "malformed array literal"
--
-- PROBLEM:
--   Migration 54 changed from -> to ->> for page_ranges extraction:
--     (p_encounter_data->>'page_ranges')::INTEGER[][]
--
--   This extracts as TEXT in JSON format: "[[1, 100]]"
--   PostgreSQL cannot cast JSON-formatted text to INTEGER[][] directly
--
--   Error in production:
--     "malformed array literal: \"[[1, 100]]\""
--     "malformed array literal: \"[[101, 142]]\""
--
-- EVIDENCE:
--   Production session: a1775405-30ec-4e6e-9f3d-7834c1376cb8
--   Render logs timestamp: 2025-11-20T08:06:20.490Z
--   All 3 pending encounters still failing to reconcile
--
-- ROOT CAUSE:
--   PostgreSQL has different formats for arrays:
--   - JSON format: [[1, 100], [101, 142]]  (from JSONB->TEXT)
--   - SQL format:  {{1, 100}, {101, 142}}  (what PostgreSQL expects)
--
--   The ->> operator gives us JSON format as TEXT, which cannot be cast
--   directly to INTEGER[][].
--
-- SOLUTION:
--   Use PostgreSQL's built-in jsonb_to_recordset OR translate_json_array_to_pg_array
--
--   Simplest approach: Use array() constructor with jsonb_array_elements:
--     ARRAY(SELECT ARRAY(
--       SELECT jsonb_array_elements_text(inner_arr)::INTEGER
--       FROM jsonb_array_elements(p_encounter_data->'page_ranges') AS inner_arr
--     ))
--
--   But this is complex. Better: Use ARRAY constructor with subquery:
--     (SELECT ARRAY(
--       SELECT ARRAY[
--         (elem->0)::INTEGER,
--         (elem->1)::INTEGER
--       ]
--       FROM jsonb_array_elements(p_encounter_data->'page_ranges') AS elem
--     ))
--
-- AFFECTED TABLES: healthcare_encounters (insert via RPC)
-- AFFECTED FUNCTIONS: reconcile_pending_to_final
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/08_job_coordination.sql (Lines 603-607: Array conversion subquery)
--   [X] Execution Date: 2025-11-20
--
-- DOWNSTREAM UPDATES:
--   [X] N/A - No TypeScript changes needed
--
-- VERIFICATION:
--   [X] RPC function created successfully
--   [X] Array conversion tested - page_ranges now converts correctly {{1,10},{20,30}}
--   [ ] Test full reconciliation with real data (next upload)
--   [ ] Verify healthcare_encounters records created (next upload)
-- ============================================================================

-- Drop and recreate function with proper JSONB array conversion
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
    -- FIXED: Properly convert JSONB array to INTEGER[][]
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
  UPDATE pass05_page_assignments
  SET
    encounter_id = v_encounter_id,
    reconciled_at = NOW()
  WHERE pending_id = ANY(p_pending_ids);

  RETURN v_encounter_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reconcile_pending_to_final IS
'Strategy A reconciliation: Atomically creates final encounter from pending encounters and marks them completed. Migration 55: Fixed page_ranges JSONB array conversion using jsonb_array_elements';
