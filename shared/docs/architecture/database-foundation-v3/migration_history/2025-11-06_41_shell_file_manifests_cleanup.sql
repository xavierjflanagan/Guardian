-- ============================================================================
-- Migration: shell_file_manifests Cleanup - Remove Vestigial Column
-- Date: 2025-11-06
-- Migration Number: 41
-- Issue: Pass 0.5 Audit - Vestigial batching_required column
--
-- PROBLEM:
--   Pass 0.5 column audit (2025-11-06) identified one issue in shell_file_manifests table:
--   1. batching_required column vestigial (always FALSE, logic moved to shell_files.page_separation_analysis per Migration 39)
--
-- SOLUTION:
--   1. DROP batching_required column (batching analysis now lives in shell_files table)
--   2. Worker updates (separate from schema):
--      - Populate pass_0_5_version from environment variable (PASS_05_VERSION)
--      - Include summary field in manifest_data.encounters[] array
--
-- AFFECTED TABLES: shell_file_manifests
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [x] current_schema/03_clinical_core.sql (Lines 281-327: shell_file_manifests table definition)
--
-- DOWNSTREAM UPDATES:
--   [x] Worker code: apps/render-worker/src/pass05/manifestBuilder.ts:262 (include summary in manifest encounters)
--   [x] Worker code: apps/render-worker/src/pass05/databaseWriter.ts:58 (pass pass_0_5_version from environment to RPC)
--   [x] RPC function: current_schema/08_job_coordination.sql:1301 (accept pass_0_5_version parameter)
--
-- EXECUTION DATE: 2025-11-06
-- EXECUTED BY: Supabase MCP (Claude Code)
-- ============================================================================

-- Begin transaction for atomic execution
BEGIN;

-- ===========================================
-- PHASE 1: Remove Vestigial Column
-- ===========================================

-- Drop batching_required column (logic moved to shell_files.page_separation_analysis)
-- Migration 39 (2025-11-04) moved batching analysis to shell_files table
-- This column has been vestigial since then (always FALSE)
ALTER TABLE public.shell_file_manifests
DROP COLUMN IF EXISTS batching_required;

-- ===========================================
-- VERIFICATION QUERIES
-- ===========================================

-- Verify column was removed successfully
-- Expected result: 0 rows (column successfully removed)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'shell_file_manifests'
  AND column_name = 'batching_required';
-- Expected result: 0 rows

-- List all columns in shell_file_manifests table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'shell_file_manifests'
ORDER BY ordinal_position;

-- Count existing shell_file_manifests records (should remain unchanged)
SELECT COUNT(*) as total_records
FROM public.shell_file_manifests;

-- Verify manifest_data structure still intact
SELECT
    manifest_id,
    shell_file_id,
    pass_0_5_version,
    jsonb_typeof(manifest_data) as manifest_data_type,
    jsonb_array_length(manifest_data->'encounters') as encounter_count
FROM public.shell_file_manifests
ORDER BY created_at DESC
LIMIT 5;

-- Commit transaction
COMMIT;

-- ===========================================
-- ROLLBACK SCRIPT
-- ===========================================

/*
-- WARNING: Rollback will restore column structure but NOT original data
-- batching_required will be FALSE for all records after rollback (default value)
-- This is acceptable as all current data is test data (pre-launch)

BEGIN;

-- Add back removed column (with default FALSE)
ALTER TABLE public.shell_file_manifests
ADD COLUMN IF NOT EXISTS batching_required BOOLEAN NOT NULL DEFAULT FALSE;

-- Verify rollback
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'shell_file_manifests'
ORDER BY ordinal_position;

COMMIT;
*/

-- ===========================================
-- MIGRATION COMPLETE
-- ===========================================

-- Next steps (Touchpoint 2):
-- 1. Execute this migration via mcp__supabase__apply_migration()
-- 2. Run verification queries to confirm success
-- 3. Update current_schema/03_clinical_core.sql (lines 281-327)
-- 4. Update worker code:
--    a. manifestBuilder.ts - populate pass_0_5_version from environment
--    b. manifestBuilder.ts - include summary in manifest encounters array
-- 5. Mark migration header checkboxes complete
-- 6. Test end-to-end with new file upload
