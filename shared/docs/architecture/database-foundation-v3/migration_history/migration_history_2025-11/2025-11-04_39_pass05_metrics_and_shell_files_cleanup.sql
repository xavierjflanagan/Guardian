-- ============================================================================
-- Migration: Pass 0.5 Metrics and Shell Files - Batching Redesign + Cost Column Move
-- Date: 2025-11-04
-- Issue: Remove redundant/premature columns, add inter-page dependency analysis, fix data model architecture
--
-- Changes:
--   pass05_encounter_metrics:
--     - DROP: pages_per_encounter (redundant, derivable from page_ranges)
--     - DROP: batch_count (premature without batch size policy)
--     - ADD: ai_cost_usd NUMERIC(10,6) (moved from shell_file_manifests - correct semantic location)
--
--   shell_file_manifests:
--     - DROP: batch_count (premature, moved batching analysis to shell_files)
--     - DROP: ai_cost_usd (belongs in metrics table, not manifest content)
--
--   shell_files:
--     - ADD: page_separation_analysis JSONB (inter-page dependency tracking)
--
--   write_pass05_manifest_atomic() RPC:
--     - REMOVE: p_batch_count parameter from function signature
--     - FIX: Write ai_cost_usd to metrics table (not manifests)
--     - FIX: Add total_tokens calculation (was missing)
--     - FIX: Remove processing_time_seconds from INSERT (generated column)
--     - FIX: Restore shell_file_manifests INSERT (was accidentally removed)
--     - FIX: Add ON CONFLICT for idempotency (was accidentally removed)
--
-- Impact:
--   - pass05_encounter_metrics: 28 -> 27 columns (dropped 2, added 1)
--   - shell_file_manifests: 11 -> 9 columns (dropped 2)
--   - shell_files: +1 column (page_separation_analysis)
--   - RPC function: 20 parameters -> 19 parameters
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/08_job_coordination.sql (Lines 219-264: pass05_encounter_metrics table)
--       - Removed: pages_per_encounter, batch_count
--       - Added: ai_cost_usd NUMERIC(10,6)
--   [X] current_schema/08_job_coordination.sql (Lines 1293-1450: write_pass05_manifest_atomic RPC)
--       - Removed: p_batch_count parameter
--       - Updated: manifest INSERT (no batch_count, no ai_cost_usd)
--       - Updated: metrics INSERT (added ai_cost_usd, removed pages_per_encounter, removed batch_count)
--       - Updated: ON CONFLICT includes ai_cost_usd
--   [X] current_schema/03_clinical_core.sql (Lines 292-321: shell_file_manifests table)
--       - Removed: batch_count, ai_cost_usd
--   [X] current_schema/03_clinical_core.sql (Lines 96-167: shell_files table)
--       - Added: page_separation_analysis JSONB
--
-- DOWNSTREAM UPDATES:
--   [X] apps/render-worker/src/pass05/databaseWriter.ts (Removed p_batch_count from RPC call)
--   [X] apps/render-worker/src/pass05/types.ts (Not needed - page_separation_analysis stored in shell_files table only)
--   [ ] Pass 0.5 AI prompt (Inter-page dependency analysis - DEFERRED to future batching implementation, schema ready)
--
-- EXECUTION DATE: 2025-11-04
-- MIGRATION STATUS: COMPLETE
-- ============================================================================

-- =============================================================================
-- STEP 1: DROP COLUMNS FROM pass05_encounter_metrics
-- =============================================================================

-- Drop pages_per_encounter (redundant, derivable from page_ranges)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pass05_encounter_metrics'
      AND column_name = 'pages_per_encounter'
  ) THEN
    ALTER TABLE public.pass05_encounter_metrics
      DROP COLUMN pages_per_encounter;
    RAISE NOTICE 'Dropped pages_per_encounter column from pass05_encounter_metrics';
  ELSE
    RAISE NOTICE 'Column pages_per_encounter does not exist, skipping';
  END IF;
END $$;

-- Drop batch_count (premature without batch size policy)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pass05_encounter_metrics'
      AND column_name = 'batch_count'
  ) THEN
    ALTER TABLE public.pass05_encounter_metrics
      DROP COLUMN batch_count;
    RAISE NOTICE 'Dropped batch_count column from pass05_encounter_metrics';
  ELSE
    RAISE NOTICE 'Column batch_count does not exist, skipping';
  END IF;
END $$;

-- =============================================================================
-- STEP 2: ADD ai_cost_usd TO pass05_encounter_metrics (correct semantic location)
-- =============================================================================

-- Add ai_cost_usd column to metrics table (metrics data, not manifest content)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pass05_encounter_metrics'
      AND column_name = 'ai_cost_usd'
  ) THEN
    ALTER TABLE public.pass05_encounter_metrics
      ADD COLUMN ai_cost_usd NUMERIC(10,6);
    RAISE NOTICE 'Added ai_cost_usd column to pass05_encounter_metrics';
  ELSE
    RAISE NOTICE 'Column ai_cost_usd already exists in pass05_encounter_metrics, skipping';
  END IF;
END $$;

-- =============================================================================
-- STEP 3: DROP COLUMNS FROM shell_file_manifests
-- =============================================================================

-- Drop batch_count from manifests (moved to shell_files.page_separation_analysis)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shell_file_manifests'
      AND column_name = 'batch_count'
  ) THEN
    ALTER TABLE public.shell_file_manifests
      DROP COLUMN batch_count;
    RAISE NOTICE 'Dropped batch_count column from shell_file_manifests';
  ELSE
    RAISE NOTICE 'Column batch_count does not exist in shell_file_manifests, skipping';
  END IF;
END $$;

-- Drop ai_cost_usd from manifests (moved to pass05_encounter_metrics)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shell_file_manifests'
      AND column_name = 'ai_cost_usd'
  ) THEN
    ALTER TABLE public.shell_file_manifests
      DROP COLUMN ai_cost_usd;
    RAISE NOTICE 'Dropped ai_cost_usd column from shell_file_manifests (moved to metrics table)';
  ELSE
    RAISE NOTICE 'Column ai_cost_usd does not exist in shell_file_manifests, skipping';
  END IF;
END $$;

-- =============================================================================
-- STEP 4: ADD page_separation_analysis TO shell_files
-- =============================================================================

-- Add page_separation_analysis column
-- Structure: {safe_split_points: [], inseparable_groups: [], analysis_metadata: {}}
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shell_files'
      AND column_name = 'page_separation_analysis'
  ) THEN
    ALTER TABLE public.shell_files
      ADD COLUMN page_separation_analysis JSONB;
    RAISE NOTICE 'Added page_separation_analysis column to shell_files';
  ELSE
    RAISE NOTICE 'Column page_separation_analysis already exists, skipping';
  END IF;
END $$;

-- Add GIN index on page_separation_analysis for efficient querying
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'shell_files'
      AND indexname = 'idx_shell_files_page_separation_analysis'
  ) THEN
    CREATE INDEX idx_shell_files_page_separation_analysis
      ON public.shell_files USING GIN (page_separation_analysis);
    RAISE NOTICE 'Created GIN index on page_separation_analysis';
  ELSE
    RAISE NOTICE 'GIN index already exists, skipping';
  END IF;
END $$;

-- =============================================================================
-- STEP 5: UPDATE write_pass05_manifest_atomic RPC FUNCTION
-- =============================================================================

-- Drop existing GRANT (will recreate with new signature)
DO $$
BEGIN
  -- Revoke old function signature grants (if they exist)
  EXECUTE 'REVOKE ALL ON FUNCTION write_pass05_manifest_atomic(
    UUID, UUID, INTEGER, INTEGER, NUMERIC, BOOLEAN, INTEGER, JSONB, TEXT, NUMERIC, INTEGER,
    UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[]
  ) FROM service_role';
  RAISE NOTICE 'Revoked grants from old function signature';
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'Old function signature not found, skipping grant revocation';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not revoke old grants: %', SQLERRM;
END $$;

-- Recreate function with updated signature (removed p_batch_count, moved ai_cost_usd to metrics)
CREATE OR REPLACE FUNCTION write_pass05_manifest_atomic(
  -- Manifest data
  p_shell_file_id UUID,
  p_patient_id UUID,
  p_total_pages INTEGER,
  p_total_encounters_found INTEGER,
  p_ocr_average_confidence NUMERIC(3,2),
  p_batching_required BOOLEAN,
  p_manifest_data JSONB,
  p_ai_model_used TEXT,
  p_ai_cost_usd NUMERIC(10,6),
  p_processing_time_ms INTEGER,

  -- Metrics data
  p_processing_session_id UUID,
  p_encounters_detected INTEGER,
  p_real_world_encounters INTEGER,
  p_planned_encounters INTEGER,
  p_pseudo_encounters INTEGER,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_encounter_confidence_average NUMERIC(3,2),
  p_encounter_types_found TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_manifest_id UUID;
  v_metrics_id UUID;
BEGIN
  -- Optional: Validate shell_file belongs to patient (defense in depth)
  -- Uncomment if cross-patient writes are detected in production
  /*
  IF NOT EXISTS (
    SELECT 1 FROM shell_files
    WHERE id = p_shell_file_id AND patient_id = p_patient_id
  ) THEN
    RAISE EXCEPTION 'shell_file_id % does not belong to patient_id %',
      p_shell_file_id, p_patient_id;
  END IF;
  */

  -- 1. Insert manifest (will fail if already exists due to unique constraint)
  -- Note: batch_count removed (Migration 39), ai_cost_usd moved to metrics (Migration 39)
  INSERT INTO shell_file_manifests (
    shell_file_id,
    patient_id,
    total_pages,
    total_encounters_found,
    ocr_average_confidence,
    batching_required,
    manifest_data,
    ai_model_used,
    processing_time_ms
  ) VALUES (
    p_shell_file_id,
    p_patient_id,
    p_total_pages,
    p_total_encounters_found,
    p_ocr_average_confidence,
    p_batching_required,
    p_manifest_data,
    p_ai_model_used,
    p_processing_time_ms
  )
  RETURNING manifest_id INTO v_manifest_id;

  -- 2. UPSERT metrics (idempotent on processing_session_id)
  -- Note: pages_per_encounter removed (Migration 39), batch_count removed (Migration 39), ai_cost_usd added (Migration 39)
  INSERT INTO pass05_encounter_metrics (
    patient_id,
    shell_file_id,
    processing_session_id,
    encounters_detected,
    real_world_encounters,
    planned_encounters,
    pseudo_encounters,
    processing_time_ms,
    ai_model_used,
    input_tokens,
    output_tokens,
    total_tokens,
    ai_cost_usd,
    ocr_average_confidence,
    encounter_confidence_average,
    encounter_types_found,
    total_pages,
    batching_required
  ) VALUES (
    p_patient_id,
    p_shell_file_id,
    p_processing_session_id,
    p_encounters_detected,
    p_real_world_encounters,
    p_planned_encounters,
    p_pseudo_encounters,
    p_processing_time_ms,
    p_ai_model_used,
    p_input_tokens,
    p_output_tokens,
    p_input_tokens + p_output_tokens,
    p_ai_cost_usd,
    p_ocr_average_confidence,
    p_encounter_confidence_average,
    p_encounter_types_found,
    p_total_pages,
    p_batching_required
  )
  ON CONFLICT (processing_session_id) DO UPDATE SET
    encounters_detected = EXCLUDED.encounters_detected,
    real_world_encounters = EXCLUDED.real_world_encounters,
    planned_encounters = EXCLUDED.planned_encounters,
    pseudo_encounters = EXCLUDED.pseudo_encounters,
    processing_time_ms = EXCLUDED.processing_time_ms,
    ai_model_used = EXCLUDED.ai_model_used,
    input_tokens = EXCLUDED.input_tokens,
    output_tokens = EXCLUDED.output_tokens,
    total_tokens = EXCLUDED.total_tokens,
    ai_cost_usd = EXCLUDED.ai_cost_usd,
    ocr_average_confidence = EXCLUDED.ocr_average_confidence,
    encounter_confidence_average = EXCLUDED.encounter_confidence_average,
    encounter_types_found = EXCLUDED.encounter_types_found
  RETURNING id INTO v_metrics_id;

  -- 3. Update shell_files completion flag
  UPDATE shell_files
  SET
    pass_0_5_completed = TRUE,
    pass_0_5_completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_shell_file_id;

  -- Return success with IDs
  RETURN jsonb_build_object(
    'success', true,
    'manifest_id', v_manifest_id,
    'metrics_id', v_metrics_id
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Manifest already exists (idempotency check passed)
    RAISE EXCEPTION 'Manifest already exists for shell_file_id %', p_shell_file_id;
  WHEN OTHERS THEN
    -- Any other error rolls back transaction
    RAISE;
END;
$$;

-- Grant execute permissions to service_role with new signature
DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION write_pass05_manifest_atomic(
    UUID, UUID, INTEGER, INTEGER, NUMERIC, BOOLEAN, JSONB, TEXT, NUMERIC, INTEGER,
    UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[]
  ) TO service_role;
  RAISE NOTICE 'Granted execute permissions to service_role for updated function';
END $$;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Verify final schema
DO $$
DECLARE
  metrics_col_count INTEGER;
  manifests_col_count INTEGER;
  shell_files_col_count INTEGER;
BEGIN
  -- Check pass05_encounter_metrics column count
  SELECT COUNT(*) INTO metrics_col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'pass05_encounter_metrics';

  -- Check shell_file_manifests column count
  SELECT COUNT(*) INTO manifests_col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'shell_file_manifests';

  -- Check shell_files column count
  SELECT COUNT(*) INTO shell_files_col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'shell_files';

  RAISE NOTICE 'pass05_encounter_metrics table now has % columns (expected: 27)', metrics_col_count;
  RAISE NOTICE 'shell_file_manifests table now has % columns (expected: 9)', manifests_col_count;
  RAISE NOTICE 'shell_files table now has % columns (+1 for page_separation_analysis)', shell_files_col_count;
END $$;

-- =============================================================================
-- ROLLBACK SCRIPT (for manual execution if needed)
-- =============================================================================

/*
-- WARNING: This rollback will lose data in page_separation_analysis and ai_cost_usd columns
-- Only use if you need to restore the original schema

BEGIN;

-- Restore columns to pass05_encounter_metrics
ALTER TABLE public.pass05_encounter_metrics
  ADD COLUMN pages_per_encounter NUMERIC(5,2);

ALTER TABLE public.pass05_encounter_metrics
  ADD COLUMN batch_count INTEGER DEFAULT 1;

ALTER TABLE public.pass05_encounter_metrics
  DROP COLUMN ai_cost_usd;

-- Restore columns to shell_file_manifests
ALTER TABLE public.shell_file_manifests
  ADD COLUMN batch_count INTEGER DEFAULT 1;

ALTER TABLE public.shell_file_manifests
  ADD COLUMN ai_cost_usd NUMERIC(10,6);

-- Drop new column from shell_files
DROP INDEX IF EXISTS public.idx_shell_files_page_separation_analysis;
ALTER TABLE public.shell_files
  DROP COLUMN page_separation_analysis;

-- Restore old RPC function signature
CREATE OR REPLACE FUNCTION write_pass05_manifest_atomic(
  p_shell_file_id UUID,
  p_patient_id UUID,
  p_total_pages INTEGER,
  p_total_encounters_found INTEGER,
  p_ocr_average_confidence NUMERIC(3,2),
  p_batching_required BOOLEAN,
  p_batch_count INTEGER,  -- RESTORED
  p_manifest_data JSONB,
  p_ai_model_used TEXT,
  p_ai_cost_usd NUMERIC(10,6),
  p_processing_time_ms INTEGER,
  p_processing_session_id UUID,
  p_encounters_detected INTEGER,
  p_real_world_encounters INTEGER,
  p_planned_encounters INTEGER,
  p_pseudo_encounters INTEGER,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_encounter_confidence_average NUMERIC(3,2),
  p_encounter_types_found TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_manifest_id UUID;
  v_metrics_id UUID;
BEGIN
  -- 1. Insert manifest
  INSERT INTO shell_file_manifests (
    shell_file_id,
    patient_id,
    total_pages,
    total_encounters_found,
    ocr_average_confidence,
    batching_required,
    batch_count,  -- RESTORED
    manifest_data,
    ai_model_used,
    ai_cost_usd,  -- RESTORED
    processing_time_ms
  ) VALUES (
    p_shell_file_id,
    p_patient_id,
    p_total_pages,
    p_total_encounters_found,
    p_ocr_average_confidence,
    p_batching_required,
    p_batch_count,
    p_manifest_data,
    p_ai_model_used,
    p_ai_cost_usd,
    p_processing_time_ms
  )
  RETURNING manifest_id INTO v_manifest_id;

  -- 2. Insert metrics (with old columns)
  INSERT INTO pass05_encounter_metrics (
    patient_id,
    shell_file_id,
    processing_session_id,
    encounters_detected,
    real_world_encounters,
    planned_encounters,
    pseudo_encounters,
    processing_time_ms,
    ai_model_used,
    input_tokens,
    output_tokens,
    total_tokens,
    ocr_average_confidence,
    encounter_confidence_average,
    encounter_types_found,
    total_pages,
    pages_per_encounter,  -- RESTORED
    batching_required,
    batch_count  -- RESTORED
  ) VALUES (
    p_patient_id,
    p_shell_file_id,
    p_processing_session_id,
    p_encounters_detected,
    p_real_world_encounters,
    p_planned_encounters,
    p_pseudo_encounters,
    p_processing_time_ms,
    p_ai_model_used,
    p_input_tokens,
    p_output_tokens,
    p_input_tokens + p_output_tokens,
    p_ocr_average_confidence,
    p_encounter_confidence_average,
    p_encounter_types_found,
    p_total_pages,
    CASE
      WHEN p_encounters_detected > 0 THEN ROUND((p_total_pages::numeric / p_encounters_detected::numeric), 2)
      ELSE 0
    END,
    p_batching_required,
    p_batch_count
  )
  ON CONFLICT (processing_session_id) DO UPDATE SET
    encounters_detected = EXCLUDED.encounters_detected,
    real_world_encounters = EXCLUDED.real_world_encounters,
    planned_encounters = EXCLUDED.planned_encounters,
    pseudo_encounters = EXCLUDED.pseudo_encounters,
    processing_time_ms = EXCLUDED.processing_time_ms,
    ai_model_used = EXCLUDED.ai_model_used,
    input_tokens = EXCLUDED.input_tokens,
    output_tokens = EXCLUDED.output_tokens,
    total_tokens = EXCLUDED.total_tokens,
    ocr_average_confidence = EXCLUDED.ocr_average_confidence,
    encounter_confidence_average = EXCLUDED.encounter_confidence_average,
    encounter_types_found = EXCLUDED.encounter_types_found
  RETURNING id INTO v_metrics_id;

  -- 3. Update shell_files
  UPDATE shell_files
  SET
    pass_0_5_completed = TRUE,
    pass_0_5_completed_at = NOW()
  WHERE id = p_shell_file_id;

  RETURN jsonb_build_object(
    'success', true,
    'manifest_id', v_manifest_id,
    'metrics_id', v_metrics_id
  );

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Manifest already exists for shell_file_id %', p_shell_file_id;
  WHEN OTHERS THEN
    RAISE;
END;
$$;

COMMIT;
*/
