-- ============================================================================
-- Migration: Strategy A - Script Implementation Fixes (STAGING - NOT YET EXECUTED)
-- Date: 2025-11-19
-- Migration Number: 52
-- Issue: Fixes discovered during Strategy A script implementation (Week 1-6)
--
-- IMPORTANT: This migration is OPEN-ENDED and will be updated as we discover
--            issues during script creation and review. DO NOT EXECUTE until
--            all Strategy A scripts are complete and reviewed.
--
-- PURPOSE:
--   As we implement the 11 TypeScript files for Strategy A (aiPrompts.v11.ts,
--   cascade-manager.ts, coordinate-extractor.ts, identifier-extractor.ts,
--   chunk-processor.ts, pending-reconciler.ts, etc.), we will discover:
--   - Missing database columns that were overlooked in Migrations 47-51
--   - Type mismatches between code and schema
--   - Missing indexes for performance
--   - Missing constraints for data integrity
--
--   This migration collects ALL such fixes in one place for atomic execution
--   after code review is complete.
--
-- WORKFLOW:
--   1. Week 1-2: Create new TypeScript files, discover issues → Add to this migration
--   2. Week 3-5: Update existing files, discover issues → Add to this migration
--   3. Week 6: Final review → Execute this migration once
--
-- STATUS: ✅ EXECUTED - 2025-11-20
-- ============================================================================


-- ============================================================================
-- SECTION 1: Missing Columns Discovered During Implementation
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Issue #1: is_real_world_visit missing from pass05_pending_encounters
-- ----------------------------------------------------------------------------
-- Discovered: 2025-11-19 during types.ts review
-- Root Cause: Migration 48 oversight - Timeline Test field was not included
-- Impact: AI cannot store Timeline Test result, data lost between extraction/reconciliation
-- Reference: 03-TABLE-DESIGN-V3.md Section "Pseudo-Encounter Support"

ALTER TABLE pass05_pending_encounters
  ADD COLUMN is_real_world_visit boolean DEFAULT true;

COMMENT ON COLUMN pass05_pending_encounters.is_real_world_visit IS
  'Timeline Test result: TRUE if encounter has both date AND location (provider/facility).
   FALSE for pseudo-encounters (missing date OR location). Calculated by AI during chunk
   processing and transferred to healthcare_encounters during reconciliation.';

-- Verification
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pass05_pending_encounters'
                   AND column_name = 'is_real_world_visit') THEN
        RAISE EXCEPTION 'Column is_real_world_visit not added to pass05_pending_encounters!';
    END IF;
END $$;


-- ============================================================================
-- SECTION 2: RPC Functions for Reconciliation and Session Finalization
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Issue #2: finalize_progressive_session RPC uses deleted columns (CRITICAL - RPC IS BROKEN)
-- ----------------------------------------------------------------------------
-- Discovered: 2025-11-19 during Supabase database audit
-- Root Cause: Migration 47 executed successfully, deleted/renamed columns from tables,
--             but RPCs were never updated. Current live RPC tries to:
--             1. SUM(encounters_completed) - column deleted from pass05_chunk_results
--             2. UPDATE total_encounters_found - column deleted from pass05_progressive_sessions
--             3. UPDATE total_encounters_completed - column deleted from pass05_progressive_sessions
--             4. UPDATE total_encounters_pending - renamed to total_pendings_created
--             5. UPDATE average_confidence with v_avg_confidence (correct column name)
-- Impact: RPC CRASHES on every call - progressive session finalization completely broken
-- Database State Verified: Migration 47 WAS executed, tables are correct, RPCs are stale
--
-- FIX: Replace RPC with Strategy A column names

CREATE OR REPLACE FUNCTION finalize_progressive_session(
  p_session_id UUID
) RETURNS VOID AS $$
DECLARE
  v_final_encounters INTEGER;      -- Final encounter count from healthcare_encounters
  v_pending_count INTEGER;          -- Still-pending count (should be 0)
  v_total_input_tokens INTEGER;
  v_total_output_tokens INTEGER;
  v_total_cost NUMERIC(10,4);
  v_avg_confidence NUMERIC(3,2);
  v_total_pendings INTEGER;         -- Sum of pendings_created across chunks
  v_ai_calls INTEGER;
BEGIN
  -- Count final encounters created from this session
  SELECT COUNT(*) INTO v_final_encounters
  FROM healthcare_encounters
  WHERE primary_shell_file_id IN (
    SELECT shell_file_id FROM pass05_progressive_sessions WHERE id = p_session_id
  );

  -- Count still-pending encounters (should be 0 after reconciliation, >0 = needs review)
  SELECT COUNT(*) INTO v_pending_count
  FROM pass05_pending_encounters
  WHERE session_id = p_session_id AND status = 'pending';

  -- Aggregate metrics from all chunks
  SELECT
    COALESCE(SUM(input_tokens), 0),
    COALESCE(SUM(output_tokens), 0),
    COALESCE(SUM(ai_cost_usd), 0),
    COALESCE(AVG(confidence_score), 0),
    COALESCE(SUM(pendings_created), 0),  -- FIXED: Use pendings_created (encounters_completed deleted)
    COUNT(*)
  INTO
    v_total_input_tokens,
    v_total_output_tokens,
    v_total_cost,
    v_avg_confidence,
    v_total_pendings,
    v_ai_calls
  FROM pass05_chunk_results
  WHERE session_id = p_session_id;

  -- Update session with final metrics using CORRECT column names
  UPDATE pass05_progressive_sessions
  SET
    processing_status = 'completed',
    completed_at = now(),
    total_processing_time = now() - started_at,
    final_encounter_count = v_final_encounters,     -- FIXED: Use final_encounter_count (total_encounters_found deleted)
    total_pendings_created = v_total_pendings,      -- FIXED: Use total_pendings_created (total_encounters_pending renamed)
    total_input_tokens = v_total_input_tokens,
    total_output_tokens = v_total_output_tokens,
    total_cost_usd = v_total_cost,
    average_confidence = v_avg_confidence,          -- CORRECT: Column name matches
    total_ai_calls = v_ai_calls,
    requires_manual_review = (v_pending_count > 0), -- Flag if any pendings remain
    updated_at = now()
  WHERE id = p_session_id;

  -- Add review reason if unresolved pendings exist
  IF v_pending_count > 0 THEN
    UPDATE pass05_progressive_sessions
    SET review_reasons = array_append(review_reasons,
          format('%s pending encounters not reconciled', v_pending_count))
    WHERE id = p_session_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION finalize_progressive_session IS
  'UPDATED (Migration 52): Fixed to use Strategy A column names after Migration 47.
   Changes: encounters_completed → pendings_created, total_encounters_found → final_encounter_count,
   total_encounters_pending → total_pendings_created. Finalizes progressive session after
   all chunks processed and reconciliation complete.';


-- ----------------------------------------------------------------------------
-- Issue #3: Marker + Region Hint Pattern - Replace Coordinate Extraction
-- ----------------------------------------------------------------------------
-- Discovered: 2025-11-19 during V11 prompt implementation review
-- Root Cause: Token cost optimization - coordinate extraction moved from AI to post-processor
-- Impact: AI now identifies text markers + region hints instead of exact Y-coordinates
-- Reference: TECHNICAL-DEBT.md DEBT-011, 03-TABLE-DESIGN-V3.md updated column counts
--
-- NOTE: Safe split points are stored in shell_files.page_separation_analysis JSONB,
--       not in a separate table. Only encounter boundary tables need the new columns.

-- Add marker/region columns to pass05_pending_encounters (for encounter boundaries)
ALTER TABLE pass05_pending_encounters
  ADD COLUMN start_marker_context VARCHAR(100),
  ADD COLUMN end_marker_context VARCHAR(100),
  ADD COLUMN start_region_hint VARCHAR(20),
  ADD COLUMN end_region_hint VARCHAR(20);

COMMENT ON COLUMN pass05_pending_encounters.start_marker_context IS
  'Additional text context around start_text_marker for disambiguation when marker appears multiple times';
COMMENT ON COLUMN pass05_pending_encounters.end_marker_context IS
  'Additional text context around end_text_marker for disambiguation when marker appears multiple times';
COMMENT ON COLUMN pass05_pending_encounters.start_region_hint IS
  'Approximate region where start marker appears: top, upper_middle, lower_middle, or bottom';
COMMENT ON COLUMN pass05_pending_encounters.end_region_hint IS
  'Approximate region where end marker appears: top, upper_middle, lower_middle, or bottom';

-- Add marker/region columns to healthcare_encounters (for final encounter boundaries)
ALTER TABLE healthcare_encounters
  ADD COLUMN start_marker_context VARCHAR(100),
  ADD COLUMN end_marker_context VARCHAR(100),
  ADD COLUMN start_region_hint VARCHAR(20),
  ADD COLUMN end_region_hint VARCHAR(20);

COMMENT ON COLUMN healthcare_encounters.start_marker_context IS
  'Additional text context around start_text_marker for disambiguation when marker appears multiple times';
COMMENT ON COLUMN healthcare_encounters.end_marker_context IS
  'Additional text context around end_text_marker for disambiguation when marker appears multiple times';
COMMENT ON COLUMN healthcare_encounters.start_region_hint IS
  'Approximate region where start marker appears: top, upper_middle, lower_middle, or bottom';
COMMENT ON COLUMN healthcare_encounters.end_region_hint IS
  'Approximate region where end marker appears: top, upper_middle, lower_middle, or bottom';

-- Note: Safe split points within encounters are stored in the page_separation_analysis JSONB
-- column of shell_files table. The JSONB structure already supports marker_context and
-- region_hint fields in its safe_split_points array. No table changes needed for that.

-- Verification for pass05_pending_encounters
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pass05_pending_encounters'
                   AND column_name IN ('start_marker_context', 'end_marker_context',
                                       'start_region_hint', 'end_region_hint')) THEN
        RAISE EXCEPTION 'Marker/region columns not added to pass05_pending_encounters!';
    END IF;
END $$;

-- Verification for healthcare_encounters
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'healthcare_encounters'
                   AND column_name IN ('start_marker_context', 'end_marker_context',
                                       'start_region_hint', 'end_region_hint')) THEN
        RAISE EXCEPTION 'Marker/region columns not added to healthcare_encounters!';
    END IF;
END $$;


-- ----------------------------------------------------------------------------
-- Issue #4: Atomic RPC Functions for Reconciliation (DEBT-003, Week 4-5)
-- ----------------------------------------------------------------------------
-- Discovered: 2025-11-20 during Week 4-5 reconciliation planning
-- Root Cause: Supabase connection pooling makes multi-step operations unsafe without transactions
-- Impact: Race conditions during reconciliation, cascade tracking, and session finalization
-- Reference: TECHNICAL-DEBT.md DEBT-003, 08-RECONCILIATION-STRATEGY-V2.md
-- Files Affected: database.ts (will call these RPCs), pending-reconciler.ts

-- RPC #1: Atomic Pending → Final Encounter Conversion
CREATE OR REPLACE FUNCTION reconcile_pending_to_final(
  p_pending_ids UUID[],
  p_patient_id UUID,
  p_shell_file_id UUID,
  p_encounter_data JSONB  -- Contains all encounter fields to insert
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
    start_text_marker,
    start_marker_context,
    start_region_hint,
    start_text_y_top,
    start_text_height,
    start_y,
    end_page,
    end_boundary_type,
    end_text_marker,
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

  -- Mark all pendings as completed and link to final encounter (atomic with insert)
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
  'Atomically converts pending encounters to final encounter. Inserts into healthcare_encounters,
   marks pendings as completed, and updates page assignments. All operations succeed or fail together.
   Returns final encounter ID.';


-- RPC #2: Atomic Cascade Pending Count Increment
CREATE OR REPLACE FUNCTION increment_cascade_pending_count(
  p_cascade_id VARCHAR
) RETURNS VOID AS $$
BEGIN
  UPDATE pass05_cascade_chains
  SET pendings_count = pendings_count + 1
  WHERE cascade_id = p_cascade_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cascade % not found for increment', p_cascade_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_cascade_pending_count IS
  'Atomically increments pending count for cascade chain. Called when continuation
   encounter detected in subsequent chunk. Replaces fetch+update pattern in database.ts.';


-- RPC #3: Atomic Session Metrics Finalization
CREATE OR REPLACE FUNCTION finalize_session_metrics(
  p_session_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_final_encounters INTEGER;
  v_pending_count INTEGER;
  v_total_input_tokens INTEGER;
  v_total_output_tokens INTEGER;
  v_total_cost NUMERIC(10,4);
  v_avg_confidence NUMERIC(3,2);
  v_total_pendings INTEGER;
  v_ai_calls INTEGER;
  v_shell_file_id UUID;
  v_result JSONB;
BEGIN
  -- Get shell_file_id for this session
  SELECT shell_file_id INTO v_shell_file_id
  FROM pass05_progressive_sessions
  WHERE id = p_session_id;

  -- Count final encounters created from this session
  SELECT COUNT(*) INTO v_final_encounters
  FROM healthcare_encounters
  WHERE source_shell_file_id = v_shell_file_id;

  -- Count still-pending encounters (should be 0 after reconciliation)
  SELECT COUNT(*) INTO v_pending_count
  FROM pass05_pending_encounters
  WHERE session_id = p_session_id AND status = 'pending';

  -- Aggregate metrics from all chunks
  SELECT
    COALESCE(SUM(input_tokens), 0),
    COALESCE(SUM(output_tokens), 0),
    COALESCE(SUM(ai_cost_usd), 0),
    COALESCE(AVG(confidence_score), 0),
    COALESCE(SUM(pendings_created), 0),
    COUNT(*)
  INTO
    v_total_input_tokens,
    v_total_output_tokens,
    v_total_cost,
    v_avg_confidence,
    v_total_pendings,
    v_ai_calls
  FROM pass05_chunk_results
  WHERE session_id = p_session_id;

  -- Update session with final metrics (atomic)
  UPDATE pass05_progressive_sessions
  SET
    processing_status = 'completed',
    completed_at = NOW(),
    total_processing_time = NOW() - started_at,
    final_encounter_count = v_final_encounters,
    total_pendings_created = v_total_pendings,
    total_input_tokens = v_total_input_tokens,
    total_output_tokens = v_total_output_tokens,
    total_cost_usd = v_total_cost,
    average_confidence = v_avg_confidence,
    total_ai_calls = v_ai_calls,
    requires_manual_review = (v_pending_count > 0),
    review_reasons = CASE
      WHEN v_pending_count > 0 THEN
        ARRAY[format('%s pending encounters not reconciled', v_pending_count)]
      ELSE
        review_reasons
    END,
    updated_at = NOW()
  WHERE id = p_session_id;

  -- Return metrics summary for caller
  v_result := jsonb_build_object(
    'final_encounters', v_final_encounters,
    'pending_count', v_pending_count,
    'total_pendings_created', v_total_pendings,
    'total_cost_usd', v_total_cost,
    'requires_review', v_pending_count > 0
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION finalize_session_metrics IS
  'Atomically finalizes progressive session metrics after reconciliation. Aggregates chunk
   results, counts final encounters, detects unresolved pendings. Returns metrics summary.';


-- Verification for RPC functions
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reconcile_pending_to_final') THEN
        RAISE EXCEPTION 'Function reconcile_pending_to_final not created!';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'increment_cascade_pending_count') THEN
        RAISE EXCEPTION 'Function increment_cascade_pending_count not created!';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'finalize_session_metrics') THEN
        RAISE EXCEPTION 'Function finalize_session_metrics not created!';
    END IF;
END $$;


-- ============================================================================
-- SECTION 3: Performance Indexes (To Be Added As Needed)
-- ============================================================================

-- [Indexes discovered during script implementation will be added here]


-- ============================================================================
-- SECTION 4: Data Integrity Constraints (To Be Added As Needed)
-- ============================================================================

-- [Constraints discovered during script implementation will be added here]


-- ============================================================================
-- FINAL VERIFICATION QUERIES (Run before execution)
-- ============================================================================

-- This section will be populated once all issues are collected
-- Verification queries ensure all changes were applied correctly


-- ============================================================================
-- EXECUTION CHECKLIST
-- ============================================================================

-- Pre-Execution:
-- [X] All 5 new TypeScript files created and reviewed
-- [X] All 6 existing TypeScript files updated and reviewed
-- [X] All issues documented in this migration with proper comments
-- [X] Verification queries added for each change
-- [X] Code review completed by second AI assistant
-- [X] Human approval obtained

-- Execution:
-- [X] Execute migration via mcp__supabase__apply_migration() - 2025-11-20
-- [X] All verification queries passed (embedded in migration)
-- [X] Update current_schema/*.sql files with changes
-- [X] Mark migration header as EXECUTED with date

-- Post-Execution:
-- [ ] Verify all TypeScript types still match database
-- [ ] Run integration tests
-- [ ] Update bridge schemas if needed


-- ============================================================================
-- ROLLBACK SCRIPT (if needed after execution)
-- ============================================================================

/*
-- Issue #1 Rollback
ALTER TABLE pass05_pending_encounters
  DROP COLUMN IF EXISTS is_real_world_visit;

-- Issue #2 Rollback
-- Restore original finalize_progressive_session function (see 08_job_coordination.sql backup)
-- Note: Column encounters_completed was already deleted in Migration 47, so original
--       function cannot be restored without recreating that column (not recommended)

-- Issue #3 Rollback
ALTER TABLE pass05_pending_encounters
  DROP COLUMN IF EXISTS start_marker_context,
  DROP COLUMN IF EXISTS end_marker_context,
  DROP COLUMN IF EXISTS start_region_hint,
  DROP COLUMN IF EXISTS end_region_hint;

ALTER TABLE healthcare_encounters
  DROP COLUMN IF EXISTS start_marker_context,
  DROP COLUMN IF EXISTS end_marker_context,
  DROP COLUMN IF EXISTS start_region_hint,
  DROP COLUMN IF EXISTS end_region_hint;
*/


-- ============================================================================
-- MIGRATION TRACKING
-- ============================================================================

-- Total Issues: 4
-- Status: ✅ EXECUTED - 2025-11-20
-- Execution Time: ~2 seconds
-- Verification: All embedded verification queries passed
--
-- Issues Summary:
--   #1: is_real_world_visit column missing from pass05_pending_encounters ✅ FIXED
--   #2: finalize_progressive_session RPC broken after Migration 47 ✅ FIXED
--   #3: Marker + region hint columns for token optimization (4 columns × 2 tables) ✅ ADDED
--       Note: Safe splits stored in shell_files.page_separation_analysis JSONB
--   #4: Atomic RPC functions for reconciliation (3 new functions) ✅ CREATED
--       - reconcile_pending_to_final
--       - increment_cascade_pending_count
--       - finalize_session_metrics
--
-- Source of Truth Updated:
--   [X] 03_clinical_core.sql - Added 4 marker/region columns to healthcare_encounters
--   [X] 04_ai_processing.sql - Added 4 marker/region + 5 encounter columns to pass05_pending_encounters
--   [X] 08_job_coordination.sql - Added 3 RPC functions (reconciliation system)
