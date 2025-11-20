-- ============================================================================
-- Migration 53: Fix reconcile_pending_to_final RPC Column Name Mismatch
-- Date: 2025-11-20
-- Issue: Production reconciliation failures due to incorrect column names
--
-- PROBLEM:
--   RPC function reconcile_pending_to_final uses column names start_text_marker
--   and end_text_marker when inserting into healthcare_encounters table, but
--   the actual table columns are named start_marker and end_marker.
--
--   This causes all reconciliation attempts to fail with error:
--   "column \"start_text_marker\" of relation \"healthcare_encounters\" does not exist"
--
-- EVIDENCE:
--   Production job: b70820df-b271-4da4-a809-d84acfdab232
--   Session: 644bfbd9-b781-4891-916a-d51caf12ceda
--   Error timestamp: 2025-11-20T05:22:46.106Z
--
-- SOLUTION:
--   Update RPC function to use correct column names (start_marker, end_marker)
--   while keeping the JSONB extraction field names unchanged (start_text_marker
--   is the correct field name in p_encounter_data JSONB).
--
-- AFFECTED TABLES: healthcare_encounters (column references in RPC)
-- AFFECTED FUNCTIONS: reconcile_pending_to_final
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/08_job_coordination.sql (Lines 549, 557: Column names fixed)
--   [X] Execution Date: 2025-11-20
--
-- DOWNSTREAM UPDATES:
--   [X] N/A - No TypeScript or bridge schema changes needed
--
-- VERIFICATION:
--   [X] RPC function created successfully
--   [ ] Test reconciliation with sample pending encounters (next step)
--   [ ] Verify healthcare_encounters record created with correct marker values (next step)
-- ============================================================================

-- Drop and recreate function with correct column names
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
    start_marker,              -- FIXED: was start_text_marker
    start_marker_context,
    start_region_hint,
    start_text_y_top,
    start_text_height,
    start_y,
    end_page,
    end_boundary_type,
    end_marker,                -- FIXED: was end_text_marker
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
    (p_encounter_data->>'start_text_marker')::VARCHAR,    -- Extract from p_encounter_data
    (p_encounter_data->>'start_marker_context')::VARCHAR,
    (p_encounter_data->>'start_region_hint')::VARCHAR,
    (p_encounter_data->>'start_text_y_top')::INTEGER,
    (p_encounter_data->>'start_text_height')::INTEGER,
    (p_encounter_data->>'start_y')::INTEGER,
    (p_encounter_data->>'end_page')::INTEGER,
    (p_encounter_data->>'end_boundary_type')::VARCHAR,
    (p_encounter_data->>'end_text_marker')::VARCHAR,      -- Extract from p_encounter_data
    (p_encounter_data->>'end_marker_context')::VARCHAR,
    (p_encounter_data->>'end_region_hint')::VARCHAR,
    (p_encounter_data->>'end_text_y_top')::INTEGER,
    (p_encounter_data->>'end_text_height')::INTEGER,
    (p_encounter_data->>'end_y')::INTEGER,
    (p_encounter_data->>'position_confidence')::NUMERIC,
    (p_encounter_data->'page_ranges')::INTEGER[][],
    (p_encounter_data->>'pass_0_5_confidence')::NUMERIC,
    (p_encounter_data->>'summary')::TEXT,
    'pass_0_5'::VARCHAR,
    'ai_pass_0_5'::VARCHAR,
    (p_encounter_data->>'is_real_world_visit')::BOOLEAN,
    (p_encounter_data->>'data_quality_tier')::VARCHAR,
    (p_encounter_data->'quality_criteria_met')::JSONB,
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
'Strategy A reconciliation: Atomically creates final encounter from pending encounters and marks them completed. Fixed migration 53: Column names start_marker/end_marker (not start_text_marker/end_text_marker)';
