-- ============================================================================
-- Migration 66: Add facility_address Field to Pass 0.5 Pipeline
-- Date: 2025-11-23
-- Issue: facility_address field missing from pending_encounters table
--
-- PROBLEM:
-- - facility_address exists in healthcare_encounters table (added in Migration 50)
-- - v11 AI prompt extracts facility_address from documents
-- - BUT: field was missing from pass05_pending_encounters table
-- - AND: reconcile_pending_to_final RPC was missing facility_address extraction
-- - Result: AI-extracted facility addresses were being lost during reconciliation
--
-- SOLUTION:
-- - Added facility_address TEXT column to pass05_pending_encounters table
-- - Updated entire processing pipeline to handle facility_address:
--   * TypeScript interface (PendingEncounter)
--   * AI response parsing (chunk-processor.ts)
--   * Database inserts (database.ts - both single and batch)
--   * Reconciliation transfer (pending-reconciler.ts)
--   * Database RPC function (reconcile_pending_to_final)
-- - Updated source of truth schema documentation
--
-- AFFECTED TABLES: pass05_pending_encounters
-- AFFECTED FUNCTIONS: reconcile_pending_to_final()
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [x] current_schema/04_ai_processing.sql (Line 1849: Added facility_address TEXT column)
--   [x] current_schema/08_job_coordination.sql (Lines 553, 603: Added to RPC function)
--
-- DOWNSTREAM UPDATES:
--   [x] TypeScript types updated (types.ts line 183)
--   [x] Chunk processor updated (chunk-processor.ts line 569)
--   [x] Database inserts updated (database.ts lines 298, 414)
--   [x] Reconciler updated (pending-reconciler.ts line 584)
--   [x] v11 AI prompt updated (aiPrompts.v11.ts - user manual update)
--
-- EXECUTION NOTES:
-- - Part 1 (Completed): User executed DDL manually via Supabase SQL editor:
--   ALTER TABLE pass05_pending_encounters ADD COLUMN facility_address TEXT;
-- - Part 2 (Pending): Update reconcile_pending_to_final RPC function
--   (see SQL below - requires MCP execution)
--
-- ============================================================================

-- SCHEMA CHANGES
-- ============================================================================

-- PART 1: Table Column (Already Executed by User via SQL Editor)
-- ================================================================
-- ALTER TABLE pass05_pending_encounters
--   ADD COLUMN facility_address TEXT;
-- COMMENT: User executed this DDL manually on 2025-11-23


-- PART 2: RPC Function Update (REQUIRES EXECUTION)
-- ================================================================
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

  -- Insert final encounter atomically (EXTENDED with identity fields - Migration 58)
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
    facility_address,              -- Migration 66: Facility address
    start_page,
    start_boundary_type,
    start_marker,              -- Migration 53: Fixed from start_text_marker
    start_marker_context,
    start_region_hint,
    start_text_y_top,
    start_text_height,
    start_y,
    end_page,
    end_boundary_type,
    end_marker,                -- Migration 53: Fixed from end_text_marker
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
    (p_encounter_data->>'facility_address')::VARCHAR,  -- Migration 66: Facility address
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
      reconciled_at = NOW(),   -- Migration 57: Add reconciliation timestamp
      updated_at = NOW()
    WHERE id = v_pending_id;
  END LOOP;

  -- Update page assignments (atomic)
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


-- CODE CHANGES SUMMARY
-- ============================================================================

-- 1. TypeScript Interface (apps/render-worker/src/pass05/progressive/types.ts)
-- Added to PendingEncounter interface (line 183):
--   facility_address?: string;  // Migration 66: Facility address

-- 2. Chunk Processor (apps/render-worker/src/pass05/progressive/chunk-processor.ts)
-- Added AI response parsing (line 569):
--   facility_address: enc.facility_address,  // Migration 66: Facility address

-- 3. Database Insert Functions (apps/render-worker/src/pass05/progressive/database.ts)
--
-- insertPendingEncounterV3() - Line 298:
--   facility_address: pending.facility_address,  // Migration 66: Facility address
--
-- batchInsertPendingEncountersV3() - Line 414:
--   facility_address: pending.facility_address,  // Migration 66: Facility address

-- 4. Reconciler (apps/render-worker/src/pass05/progressive/pending-reconciler.ts)
-- Added to final encounter creation (line 584):
--   facility_address: firstPending.facility_address,  // Migration 66: Facility address

-- 5. Source of Truth Schema (current_schema/04_ai_processing.sql)
-- Updated comment on line 1846 to include Migration 66
-- Added column documentation on line 1849:
--   facility_address text,  -- Migration 66: Facility address

-- 6. RPC Function (current_schema/08_job_coordination.sql)
-- Added to INSERT column list (line 553):
--   facility_address,  -- Migration 66: Facility address
-- Added JSONB extraction (line 603):
--   (p_encounter_data->>'facility_address')::VARCHAR,  -- Migration 66


-- DATA FLOW VERIFICATION
-- ============================================================================

-- Complete pipeline now handles facility_address:
-- 1. AI extracts facility_address via v11 prompt
-- 2. Chunk processor parses it from AI response (chunk-processor.ts:569)
-- 3. Database insert writes to pass05_pending_encounters.facility_address (database.ts:298, 414)
-- 4. Reconciler builds encounterData with facility_address (pending-reconciler.ts:584)
-- 5. RPC function extracts from JSONB and inserts to healthcare_encounters (08_job_coordination.sql:84, 134)
-- 6. Final encounter record includes complete facility information

-- Example data flow:
-- AI Response: { "facility_name": "South Coast Medical", "facility_address": "123 Main St, Sydney NSW 2000" }
-- → Pending: facility_name='South Coast Medical', facility_address='123 Main St, Sydney NSW 2000'
-- → Final: facility_name='South Coast Medical', facility_address='123 Main St, Sydney NSW 2000'


-- MIGRATION STATUS
-- ============================================================================
-- Date Started: 2025-11-23
--
-- PART 1 - COMPLETED:
--   [x] Table column added (user executed DDL manually)
--   [x] TypeScript code updated (6 files)
--   [x] Source of truth schemas updated (2 files)
--   [x] Worker deployed to Render.com
--
-- PART 2 - PENDING USER REVIEW:
--   [ ] RPC function update (requires MCP execution)
--   [ ] Final testing with document upload
--
-- POST-EXECUTION CHECKLIST (after RPC update):
--   [ ] Verify facility_address transfers to healthcare_encounters
--   [ ] Update this file with execution timestamp
--   [ ] Mark migration as complete
