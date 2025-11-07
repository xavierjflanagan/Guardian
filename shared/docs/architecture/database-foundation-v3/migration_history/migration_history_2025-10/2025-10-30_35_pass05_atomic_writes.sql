-- ============================================================================
-- Migration: Pass 0.5 Atomic Manifest Write Function
-- Date: 2025-10-30
-- Issue: Add atomic transaction wrapper for manifest/metrics/shell_files writes
--
-- PROBLEM:
--   Current Pass 0.5 implementation has 3 separate database writes:
--   1. INSERT into shell_file_manifests
--   2. UPSERT into pass05_encounter_metrics
--   3. UPDATE shell_files.pass_0_5_completed
--
--   If write #2 or #3 fails after #1 succeeds, idempotency check returns early
--   on retry, leaving metrics/completion flags permanently missing.
--   - Missing metrics: Analytics broken
--   - Missing pass_0_5_completed flag: Blocks Pass 1/2 from knowing file is ready
--
-- SOLUTION:
--   1. Add planned_encounters column to pass05_encounter_metrics (separate from pseudo)
--   2. Create PostgreSQL function write_pass05_manifest_atomic() that wraps all
--      3 writes in single atomic transaction
--   3. Worker calls function via supabase.rpc() for all-or-nothing behavior
--
-- AFFECTED TABLES:
--   - pass05_encounter_metrics (add planned_encounters column)
--   - shell_file_manifests (via function)
--   - shell_files (via function)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/08_job_coordination.sql (add planned_encounters column, add RPC function)
--
-- DOWNSTREAM UPDATES:
--   [X] apps/render-worker/src/pass05/databaseWriter.ts (use RPC instead of 3 writes)
--   [X] apps/render-worker/src/pass05/manifestBuilder.ts (normalize pageRanges, validate encounterType)
--   [X] apps/render-worker/src/pass05/index.ts (add explanatory comment)
--   [X] apps/render-worker/src/pass05/types.ts (add JSDoc comments)
--
-- MIGRATION EXECUTED:
--   [X] Date: 2025-10-30
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Add planned_encounters column to pass05_encounter_metrics
-- ============================================================================

ALTER TABLE pass05_encounter_metrics
ADD COLUMN IF NOT EXISTS planned_encounters INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN pass05_encounter_metrics.planned_encounters IS
  'Count of future scheduled encounters (isRealWorldVisit=false, encounterType=planned_*)';

COMMENT ON COLUMN pass05_encounter_metrics.pseudo_encounters IS
  'Count of pseudo-encounters (documents, not visits) - excludes planned encounters (isRealWorldVisit=false, encounterType=pseudo_*)';

-- ============================================================================
-- 2. Create atomic write function for manifest/metrics/shell_files
-- ============================================================================

CREATE OR REPLACE FUNCTION write_pass05_manifest_atomic(
  -- Manifest data
  p_shell_file_id UUID,
  p_patient_id UUID,
  p_total_pages INTEGER,
  p_total_encounters_found INTEGER,
  p_ocr_average_confidence NUMERIC(3,2),
  p_batching_required BOOLEAN,
  p_batch_count INTEGER,
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
  INSERT INTO shell_file_manifests (
    shell_file_id,
    patient_id,
    total_pages,
    total_encounters_found,
    ocr_average_confidence,
    batching_required,
    batch_count,
    manifest_data,
    ai_model_used,
    ai_cost_usd,
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

  -- 2. UPSERT metrics (idempotent on processing_session_id)
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
    pages_per_encounter,
    batching_required,
    batch_count
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

  -- 3. Update shell_files completion flag
  UPDATE shell_files
  SET
    pass_0_5_completed = TRUE,
    pass_0_5_completed_at = NOW()
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

COMMENT ON FUNCTION write_pass05_manifest_atomic IS
  'Atomic transaction wrapper for Pass 0.5 manifest/metrics/shell_files writes. Ensures all-or-nothing behavior: if any write fails, all writes roll back. Called via RPC from worker to prevent partial failures.';

-- Security: Restrict function execution to service_role only
REVOKE ALL ON FUNCTION write_pass05_manifest_atomic(
  UUID, UUID, INTEGER, INTEGER, NUMERIC, BOOLEAN, INTEGER, JSONB, TEXT, NUMERIC, INTEGER,
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION write_pass05_manifest_atomic(
  UUID, UUID, INTEGER, INTEGER, NUMERIC, BOOLEAN, INTEGER, JSONB, TEXT, NUMERIC, INTEGER,
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[]
) TO service_role;

COMMIT;

-- ============================================================================
-- Verification Query
-- ============================================================================

-- Verify planned_encounters column exists
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'pass05_encounter_metrics'
-- AND column_name = 'planned_encounters';

-- Verify function exists
-- SELECT proname, pronargs, proargnames
-- FROM pg_proc
-- WHERE proname = 'write_pass05_manifest_atomic';

-- ============================================================================
-- Rollback Script
-- ============================================================================

-- DROP FUNCTION IF EXISTS write_pass05_manifest_atomic(
--   UUID, UUID, INTEGER, INTEGER, NUMERIC, BOOLEAN, INTEGER, JSONB, TEXT, NUMERIC, INTEGER,
--   UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[]
-- );
-- ALTER TABLE pass05_encounter_metrics DROP COLUMN IF EXISTS planned_encounters;
