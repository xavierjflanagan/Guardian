-- ============================================================================
-- Migration: Remove Legacy Pass 1 Columns
-- Date: 2025-12-01
-- Issue: Legacy columns from OLD Pass 1 implementation are no longer used
--
-- PROBLEM:
--   pass1_entity_metrics table has columns from OLD Pass 1 implementation
--   (vision-based entity detection) that are no longer used by NEW Pass 1 V2
--   (Strategy-A, OCR-only). These columns add confusion and wasted storage.
--
-- LEGACY COLUMNS (to be removed):
--   - vision_model_used: OLD Pass 1 wrote actual model, NEW writes 'none'
--   - ocr_model_used: Only used by OLD Pass 1 (dual-model approach)
--   - ocr_agreement_average: OCR comparison metric from OLD Pass 1
--   - confidence_distribution: JSONB breakdown from OLD Pass 1
--   - ocr_pages_processed: Page count from OLD OCR phase
--
-- SOLUTION: Drop all unused legacy columns
--
-- AFFECTED TABLES: pass1_entity_metrics
--
-- VERIFICATION:
--   1. OLD Pass 1 code is never called (confirmed in worker.ts - only imports types)
--   2. NEW Pass 1 V2 writes 'none' to vision_model_used for backward compat
--   3. No frontend or API queries reference these columns
--   4. All legacy values are meaningless ('none', NULL, etc.)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [x] current_schema/08_job_coordination.sql (Lines 1098-1136: Table definition cleaned up)
--
-- DOWNSTREAM UPDATES:
--   [x] apps/render-worker/src/pass1-v2/pass1-v2-database.ts (Removed vision_model_used write)
--   [x] Bridge schemas: N/A (these were never part of bridge schemas)
--   [x] TypeScript types: N/A (types are in pass1-v2-types.ts, not legacy types)
--
-- EXECUTION:
--   [x] Migration executed successfully via MCP
--   [x] Executed date: 2025-12-01
-- ============================================================================

-- Step 1: Remove NOT NULL constraint from vision_model_used (required before drop)
-- This ensures existing inserts don't fail while migration runs
ALTER TABLE pass1_entity_metrics
  ALTER COLUMN vision_model_used DROP NOT NULL;

-- Step 2: Drop all legacy columns
ALTER TABLE pass1_entity_metrics
  DROP COLUMN IF EXISTS vision_model_used,
  DROP COLUMN IF EXISTS ocr_model_used,
  DROP COLUMN IF EXISTS ocr_agreement_average,
  DROP COLUMN IF EXISTS confidence_distribution,
  DROP COLUMN IF EXISTS ocr_pages_processed;

-- Verification Query
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'pass1_entity_metrics' AND table_schema = 'public';

-- Rollback Script (if needed)
-- NOTE: Rollback would require re-adding columns and repopulating data
-- This is a one-way migration - data recovery not possible
--
-- ALTER TABLE pass1_entity_metrics
--   ADD COLUMN vision_model_used TEXT,
--   ADD COLUMN ocr_model_used TEXT,
--   ADD COLUMN ocr_agreement_average NUMERIC(4,3),
--   ADD COLUMN confidence_distribution JSONB,
--   ADD COLUMN ocr_pages_processed INTEGER;
