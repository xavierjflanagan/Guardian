-- ============================================================================
-- Migration: Remove ocr_raw_jsonb Column from shell_files
-- Date: 2025-11-27
-- Issue: Unused database column adding storage overhead
--
-- PROBLEM:
--   - shell_files.ocr_raw_jsonb column is WRITE-ONLY (never read)
--   - Stores lightweight OCR text comparison data (~10KB/page)
--   - Redundant with superior page-N.json storage in Supabase Storage
--   - Adds database bloat: ~1MB per 100-page document
--   - No code reads from this column (verified via codebase search)
--
-- SOLUTION:
--   - Drop ocr_raw_jsonb column from shell_files table
--   - All OCR data available in page-N.json files (enhanced with block structure)
--   - Reduces database row size and query overhead
--   - Pre-launch timing ideal (zero user impact)
--
-- AFFECTED TABLES: shell_files
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [✓] current_schema/03_clinical_core.sql (Line 118: Remove ocr_raw_jsonb column definition)
--
-- DOWNSTREAM UPDATES:
--   [✓] OCR-UNIFIED-ARCHITECTURE-IMPLEMENTATION-PLAN.md (Removed all 7 references)
--   [✓] apps/render-worker/src/worker.ts (Removed write logic at line 1224-1253)
--   [✓] TypeScript types - NO CHANGES (column was never typed in application code)
-- ============================================================================

-- VERIFICATION: Check if column exists before dropping
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shell_files'
      AND column_name = 'ocr_raw_jsonb'
  ) THEN
    RAISE NOTICE 'ocr_raw_jsonb column exists - proceeding with drop';
  ELSE
    RAISE NOTICE 'ocr_raw_jsonb column already removed - skipping';
  END IF;
END $$;

-- Drop the unused ocr_raw_jsonb column
ALTER TABLE shell_files
DROP COLUMN IF EXISTS ocr_raw_jsonb;

-- VERIFICATION: Confirm column removal
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shell_files'
      AND column_name = 'ocr_raw_jsonb'
  ) THEN
    RAISE NOTICE 'SUCCESS: ocr_raw_jsonb column successfully removed';
  ELSE
    RAISE EXCEPTION 'FAILED: ocr_raw_jsonb column still exists';
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK PLAN (if needed)
-- ============================================================================
-- Re-add column with original definition from Migration 37:
--
-- ALTER TABLE shell_files
-- ADD COLUMN ocr_raw_jsonb JSONB;
--
-- COMMENT ON COLUMN shell_files.ocr_raw_jsonb IS
--   'Complete Google Cloud Vision OCR response for debugging/reprocessing (Migration 37 - 2025-11-03)';
--
-- NOTE: Data would need to be regenerated from page-N.json files
-- ============================================================================

-- ============================================================================
-- MIGRATION EXECUTION RECORD
-- ============================================================================
-- Executed: 2025-11-27
-- Executed By: Claude Code (User approval: xflanagan)
-- Execution Method: mcp__supabase__apply_migration()
-- Result: SUCCESS - ocr_raw_jsonb column removed from shell_files table
-- ============================================================================
