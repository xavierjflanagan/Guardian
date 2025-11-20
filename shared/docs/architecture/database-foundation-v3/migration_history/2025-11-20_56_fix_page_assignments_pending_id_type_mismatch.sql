-- ============================================================================
-- Migration 56: Fix page_assignments pending_id type mismatch in reconciliation
-- Date: 2025-11-20
-- Issue: "operator does not exist: text = uuid" during reconciliation
--
-- PROBLEM:
--   Migration 55 line 176 tries to match:
--     WHERE pending_id = ANY(p_pending_ids)
--
--   But:
--   - pass05_page_assignments.pending_id is TEXT ("pending_b18955d5_001_000")
--   - p_pending_ids parameter is UUID[] (pass05_pending_encounters.id values)
--
--   This causes: "operator does not exist: text = uuid"
--
-- EVIDENCE:
--   Production session: b18955d5-f0fc-4710-bbfa-d6ea0eaace5c
--   Render logs timestamp: 2025-11-20T08:35:00Z
--   HTTP 404 response (misleading - actually PostgreSQL type error)
--   Error: "operator does not exist: text = uuid"
--
-- ROOT CAUSE:
--   The reconcile_pending_to_final RPC receives UUID[] (pk values), but
--   pass05_page_assignments stores TEXT pending_id values. There's no
--   direct way to match these without joining.
--
-- SOLUTION:
--   Use a subquery to get TEXT pending_id values from pass05_pending_encounters
--   that match the UUID[] we received:
--
--   UPDATE pass05_page_assignments
--   SET ...
--   WHERE pending_id IN (
--     SELECT pending_id
--     FROM pass05_pending_encounters
--     WHERE id = ANY(p_pending_ids)
--   )
--
-- AFFECTED TABLES: pass05_page_assignments (update via RPC)
-- AFFECTED FUNCTIONS: reconcile_pending_to_final
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/08_job_coordination.sql (Lines 665-670: Subquery fix)
--   [X] Execution Date: 2025-11-20
--
-- DOWNSTREAM UPDATES:
--   [X] N/A - No TypeScript changes needed
--
-- VERIFICATION:
--   [X] RPC function created successfully
--   [ ] Test reconciliation with real data (next upload)
--   [ ] Verify healthcare_encounters records created (next upload)
--   [ ] Verify pass05_page_assignments updated correctly (next upload)
-- ============================================================================

-- Drop and recreate function with proper pending_id matching
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
'Strategy A reconciliation: Atomically creates final encounter from pending encounters and marks them completed. Migration 56: Fixed page_assignments pending_id type mismatch (TEXT vs UUID)';
