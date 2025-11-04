-- ============================================================================
-- Migration: Healthcare Encounters Table Schema Cleanup
-- Date: 2025-11-04
-- Issue: Remove redundant columns, improve encounter source tracking
--
-- Changes:
--   - DROP: visit_duration_minutes (rarely available, low value)
--   - DROP: confidence_score (redundant with pass_0_5_confidence)
--   - DROP: ai_confidence (redundant with pass_0_5_confidence)
--   - RENAME: ai_extracted -> source_method (better semantic clarity)
--   - ADD: date_source (track encounter date provenance)
--
-- Impact:
--   - Columns: 37 -> 35
--   - Existing data: ai_extracted migrated to source_method
--   - Existing rows: date_source populated based on encounter_date presence
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/03_clinical_core.sql (Lines 519-570: healthcare_encounters table)
--       - Removed: visit_duration_minutes, ai_extracted, confidence_score, ai_confidence
--       - Added: source_method (NOT NULL with CHECK constraint)
--       - Added: date_source (nullable with CHECK constraint)
--       - Updated comments for Migration 38
--
-- DOWNSTREAM UPDATES:
--   [X] apps/render-worker/src/pass05/manifestBuilder.ts (UPSERT statement - added source_method, date_source, spatial_bounds, summary)
--   [X] apps/render-worker/src/pass05/types.ts (EncounterMetadata interface - added summary field)
--   [X] Pass 0.5 AI prompt (aiPrompts.ts - added confidence guidelines 0.95/0.85/0.70/0.50, summary generation guidelines, date range end guidance)
--
-- EXECUTION DATE: 2025-11-04
-- MIGRATION STATUS: COMPLETE
-- ============================================================================

-- =============================================================================
-- STEP 1: DROP REDUNDANT COLUMNS
-- =============================================================================

-- Drop visit_duration_minutes (rarely available, low clinical value)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'healthcare_encounters'
      AND column_name = 'visit_duration_minutes'
  ) THEN
    ALTER TABLE public.healthcare_encounters
      DROP COLUMN visit_duration_minutes;
    RAISE NOTICE 'Dropped visit_duration_minutes column';
  ELSE
    RAISE NOTICE 'Column visit_duration_minutes does not exist, skipping';
  END IF;
END $$;

-- Drop confidence_score (redundant with pass_0_5_confidence)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'healthcare_encounters'
      AND column_name = 'confidence_score'
  ) THEN
    ALTER TABLE public.healthcare_encounters
      DROP COLUMN confidence_score;
    RAISE NOTICE 'Dropped confidence_score column';
  ELSE
    RAISE NOTICE 'Column confidence_score does not exist, skipping';
  END IF;
END $$;

-- Drop ai_confidence (redundant with pass_0_5_confidence)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'healthcare_encounters'
      AND column_name = 'ai_confidence'
  ) THEN
    ALTER TABLE public.healthcare_encounters
      DROP COLUMN ai_confidence;
    RAISE NOTICE 'Dropped ai_confidence column';
  ELSE
    RAISE NOTICE 'Column ai_confidence does not exist, skipping';
  END IF;
END $$;

-- =============================================================================
-- STEP 2: MIGRATE ai_extracted -> source_method
-- =============================================================================

-- Add source_method column (temporarily nullable for migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'healthcare_encounters'
      AND column_name = 'source_method'
  ) THEN
    ALTER TABLE public.healthcare_encounters
      ADD COLUMN source_method TEXT;
    RAISE NOTICE 'Added source_method column';
  ELSE
    RAISE NOTICE 'Column source_method already exists, skipping';
  END IF;
END $$;

-- Migrate existing ai_extracted data to source_method
-- All existing Pass 0.5 encounters should be marked as 'ai_pass_0_5'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'healthcare_encounters'
      AND column_name = 'ai_extracted'
  ) THEN
    -- Migrate boolean to enum values
    UPDATE public.healthcare_encounters
    SET source_method = CASE
      WHEN ai_extracted = TRUE THEN 'ai_pass_0_5'
      WHEN ai_extracted = FALSE THEN 'manual_entry'
      ELSE 'ai_pass_0_5'  -- Default for NULL values
    END
    WHERE source_method IS NULL;

    RAISE NOTICE 'Migrated ai_extracted data to source_method';
  ELSE
    RAISE NOTICE 'Column ai_extracted does not exist, skipping data migration';
  END IF;
END $$;

-- Drop ai_extracted column (migration complete)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'healthcare_encounters'
      AND column_name = 'ai_extracted'
  ) THEN
    ALTER TABLE public.healthcare_encounters
      DROP COLUMN ai_extracted;
    RAISE NOTICE 'Dropped ai_extracted column';
  ELSE
    RAISE NOTICE 'Column ai_extracted does not exist, skipping';
  END IF;
END $$;

-- Add CHECK constraint to source_method
-- Values: 'ai_pass_0_5' (Pass 0.5 encounter discovery)
--         'ai_pass_2' (Pass 2 clinical extraction, future)
--         'manual_entry' (user manually created encounter, future)
--         'import' (imported from external system, future)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'healthcare_encounters'
      AND constraint_name = 'healthcare_encounters_source_method_check'
  ) THEN
    ALTER TABLE public.healthcare_encounters
      ADD CONSTRAINT healthcare_encounters_source_method_check
      CHECK (source_method IN ('ai_pass_0_5', 'ai_pass_2', 'manual_entry', 'import'));
    RAISE NOTICE 'Added CHECK constraint to source_method';
  ELSE
    RAISE NOTICE 'CHECK constraint already exists, skipping';
  END IF;
END $$;

-- Make source_method NOT NULL (all rows should have values now)
DO $$
BEGIN
  ALTER TABLE public.healthcare_encounters
    ALTER COLUMN source_method SET NOT NULL;
  RAISE NOTICE 'Set source_method to NOT NULL';
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Could not set source_method to NOT NULL (rows may have NULL values)';
END $$;

-- =============================================================================
-- STEP 3: ADD date_source COLUMN
-- =============================================================================

-- Add date_source column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'healthcare_encounters'
      AND column_name = 'date_source'
  ) THEN
    ALTER TABLE public.healthcare_encounters
      ADD COLUMN date_source TEXT;
    RAISE NOTICE 'Added date_source column';
  ELSE
    RAISE NOTICE 'Column date_source already exists, skipping';
  END IF;
END $$;

-- Drop existing CHECK constraint if present (defensive for reruns)
-- This ensures we can update data even if constraint exists with different values
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'healthcare_encounters'
      AND constraint_name = 'healthcare_encounters_date_source_check'
  ) THEN
    ALTER TABLE public.healthcare_encounters
      DROP CONSTRAINT healthcare_encounters_date_source_check;
    RAISE NOTICE 'Dropped existing date_source CHECK constraint for re-creation';
  END IF;
END $$;

-- Populate date_source for existing rows
-- Logic: If encounter_date exists, assume it was AI-extracted
-- Update all rows to ensure consistent values
DO $$
BEGIN
  UPDATE public.healthcare_encounters
  SET date_source = CASE
    WHEN encounter_date IS NOT NULL THEN 'ai_extracted'
    ELSE NULL  -- Pseudo encounters without dates
  END;

  RAISE NOTICE 'Populated date_source for existing rows';
END $$;

-- Add CHECK constraint to date_source
-- Values: 'ai_extracted' (AI found date in document text)
--         'file_metadata' (PDF creation date or EXIF timestamp)
--         'upload_date' (fallback to shell_files.created_at)
DO $$
BEGIN
  ALTER TABLE public.healthcare_encounters
    ADD CONSTRAINT healthcare_encounters_date_source_check
    CHECK (date_source IN ('ai_extracted', 'file_metadata', 'upload_date'));
  RAISE NOTICE 'Added CHECK constraint to date_source';
END $$;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Verify final schema
DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'healthcare_encounters';

  RAISE NOTICE 'healthcare_encounters table now has % columns', col_count;
  RAISE NOTICE 'Expected: 35 columns (37 - 3 dropped - 1 renamed + 1 added)';
END $$;

-- =============================================================================
-- ROLLBACK SCRIPT (for manual execution if needed)
-- =============================================================================

/*
-- WARNING: This rollback will lose data in source_method and date_source columns
-- Only use if you need to restore the original schema

BEGIN;

-- Restore ai_extracted column
ALTER TABLE public.healthcare_encounters
  ADD COLUMN ai_extracted BOOLEAN;

-- Migrate source_method back to ai_extracted
UPDATE public.healthcare_encounters
SET ai_extracted = CASE
  WHEN source_method IN ('ai_pass_0_5', 'ai_pass_2') THEN TRUE
  WHEN source_method = 'manual_entry' THEN FALSE
  ELSE TRUE
END;

-- Drop new columns
ALTER TABLE public.healthcare_encounters
  DROP COLUMN source_method;

ALTER TABLE public.healthcare_encounters
  DROP COLUMN date_source;

-- Restore dropped columns (will be empty)
ALTER TABLE public.healthcare_encounters
  ADD COLUMN visit_duration_minutes INTEGER;

ALTER TABLE public.healthcare_encounters
  ADD COLUMN confidence_score NUMERIC(4,3);

ALTER TABLE public.healthcare_encounters
  ADD COLUMN ai_confidence NUMERIC(4,3);

COMMIT;
*/
