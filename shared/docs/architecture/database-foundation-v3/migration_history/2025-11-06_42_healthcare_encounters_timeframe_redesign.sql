-- ============================================================================
-- Migration: healthcare_encounters Timeframe Redesign - Semantic Clarity + Multi-Day Encounters
-- Date: 2025-11-06
-- Migration Number: 42
-- Issue: Pass 0.5 Audit - Encounter date/timeframe ambiguity and multi-day encounter support
--
-- PROBLEM:
--   Pass 0.5 column audit (2025-11-06) identified critical issues in healthcare_encounters table:
--   1. encounter_date semantically ambiguous (start date? single date? entire encounter?)
--   2. encounter_date_end always NULL - ambiguous (single-day? ongoing? unknown?)
--   3. No way to distinguish completed vs ongoing vs unknown-end encounters
--   4. Hospital discharge summaries (25%+ of documents) have multi-day stays with admission + discharge dates
--   5. Pseudo encounters without dates have no fallback mechanism (date_source tracking needed)
--   6. Three redundant confidence columns (confidence_score, ai_confidence, pass_0_5_confidence)
--   7. visit_duration_minutes rarely populated and low value
--
-- SOLUTION:
--   1. RENAME encounter_date → encounter_start_date (clarity)
--   2. ADD encounter_timeframe_status column (completed | ongoing | unknown_end_date)
--   3. ADD date_source column (ai_extracted | file_metadata | upload_date)
--   4. DROP redundant confidence columns (keep only pass_0_5_confidence)
--   5. DROP visit_duration_minutes (rarely available, low value)
--   6. Worker logic updates (separate from schema):
--      - Pseudo encounters: start_date = end_date, status = 'completed'
--      - Real-world encounters: AI extracts admission + discharge dates for multi-day stays
--      - Date waterfall fallback: ai_extracted → file_metadata → upload_date
--
-- AFFECTED TABLES: healthcare_encounters
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/03_clinical_core.sql (Lines 510, 543-544, 1567: encounter_start_date, new columns, index)
--
-- DOWNSTREAM UPDATES:
--   [X] Bridge schemas: N/A (Pass 0.5 writes directly to healthcare_encounters, no bridge schemas)
--   [X] Worker code: apps/render-worker/src/pass05/manifestBuilder.ts (two-branch logic implemented)
--   [X] Worker code: current_workers/exora-v3-worker/ (N/A - not synced with deployed version)
--   [X] TypeScript types: types.ts - EncounterMetadata interface (v2.9 fields added)
--   [X] AI Prompt: aiPrompts.v2.9.ts (v2.9 prompt complete with timeframe detection)
--
-- EXECUTION DATE: 2025-11-06
-- EXECUTED BY: Supabase MCP (Claude Code)
-- ============================================================================

-- Begin transaction for atomic execution
BEGIN;

-- ===========================================
-- PHASE 1: Column Rename (Semantic Clarity)
-- ===========================================

-- Rename encounter_date → encounter_start_date
-- Rationale: Removes ambiguity, makes it clear this is the start of the encounter
ALTER TABLE public.healthcare_encounters
RENAME COLUMN encounter_date TO encounter_start_date;

-- Update index to use new column name
DROP INDEX IF EXISTS idx_encounters_date;
CREATE INDEX IF NOT EXISTS idx_encounters_start_date
ON healthcare_encounters(patient_id, encounter_start_date DESC)
WHERE archived IS NOT TRUE;

-- ===========================================
-- PHASE 2: Add New Columns
-- ===========================================

-- Add encounter_timeframe_status column
-- Purpose: Explicitly track whether encounter is completed, ongoing, or has unknown end date
-- This removes NULL ambiguity from encounter_date_end
ALTER TABLE public.healthcare_encounters
ADD COLUMN encounter_timeframe_status TEXT NOT NULL DEFAULT 'completed'
CHECK (encounter_timeframe_status IN ('completed', 'ongoing', 'unknown_end_date'));

-- Add date_source column (Migration 38 already added this, but ensure constraints are correct)
-- Purpose: Track origin of encounter date (AI extraction vs file metadata vs upload date fallback)
-- Note: Column added in Migration 38, but was nullable. Make it NOT NULL with default.
DO $$
BEGIN
  -- Check if column exists and is nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'healthcare_encounters'
      AND column_name = 'date_source'
      AND is_nullable = 'YES'
  ) THEN
    -- Column exists but is nullable - first update NULLs, then make NOT NULL

    -- Step 1: Update all NULL values to default
    UPDATE public.healthcare_encounters
    SET date_source = 'upload_date'
    WHERE date_source IS NULL;

    -- Step 2: Set default for future inserts
    ALTER TABLE public.healthcare_encounters
    ALTER COLUMN date_source SET DEFAULT 'upload_date';

    -- Step 3: Make column NOT NULL
    ALTER TABLE public.healthcare_encounters
    ALTER COLUMN date_source SET NOT NULL;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'healthcare_encounters'
      AND column_name = 'date_source'
  ) THEN
    -- Column doesn't exist at all - add it
    ALTER TABLE public.healthcare_encounters
    ADD COLUMN date_source TEXT NOT NULL DEFAULT 'upload_date'
    CHECK (date_source IN ('ai_extracted', 'file_metadata', 'upload_date'));
  END IF;
  -- If column exists and is NOT NULL, do nothing (already correct)
END $$;

-- ===========================================
-- PHASE 3: Remove Redundant Columns
-- ===========================================

-- Drop visit_duration_minutes
-- Rationale: Rarely available in documents, low value, not useful for timeline
-- Dates (start + end) are sufficient for timeframe tracking
ALTER TABLE public.healthcare_encounters
DROP COLUMN IF EXISTS visit_duration_minutes;

-- Drop confidence_score
-- Rationale: Redundant with pass_0_5_confidence, not populated
-- Consolidating to single confidence column
ALTER TABLE public.healthcare_encounters
DROP COLUMN IF EXISTS confidence_score;

-- Drop ai_confidence
-- Rationale: Redundant with pass_0_5_confidence, not populated
-- Consolidating to single confidence column
ALTER TABLE public.healthcare_encounters
DROP COLUMN IF EXISTS ai_confidence;

-- ===========================================
-- VERIFICATION QUERIES
-- ===========================================

-- Verify column rename was successful
-- Expected result: 1 row (encounter_start_date exists)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'healthcare_encounters'
  AND column_name = 'encounter_start_date';

-- Verify old column name is gone
-- Expected result: 0 rows (encounter_date removed)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'healthcare_encounters'
  AND column_name = 'encounter_date';

-- Verify new columns were added successfully
-- Expected result: 2 rows (encounter_timeframe_status, date_source)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'healthcare_encounters'
  AND column_name IN ('encounter_timeframe_status', 'date_source')
ORDER BY column_name;

-- Verify CHECK constraints exist
-- Expected result: 2 rows (one constraint for each new column)
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
  AND constraint_name LIKE '%healthcare_encounters%timeframe%'
     OR constraint_name LIKE '%healthcare_encounters%date_source%'
ORDER BY constraint_name;

-- Verify redundant columns were removed successfully
-- Expected result: 0 rows (all three columns removed)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'healthcare_encounters'
  AND column_name IN ('visit_duration_minutes', 'confidence_score', 'ai_confidence');

-- List all remaining columns in healthcare_encounters table
-- Verify schema matches expected state
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'healthcare_encounters'
ORDER BY ordinal_position;

-- Count existing healthcare_encounters records (should remain unchanged)
SELECT COUNT(*) as total_records
FROM public.healthcare_encounters;

-- Sample recent encounters to verify defaults applied correctly
-- Expected: All existing records now have encounter_timeframe_status = 'completed', date_source = 'upload_date'
SELECT
    id,
    encounter_type,
    encounter_start_date,  -- Renamed column
    encounter_date_end,
    encounter_timeframe_status,  -- New column with default
    date_source,  -- New column with default
    is_real_world_visit,
    pass_0_5_confidence,
    created_at
FROM public.healthcare_encounters
ORDER BY created_at DESC
LIMIT 10;

-- Commit transaction
COMMIT;

-- ===========================================
-- ROLLBACK SCRIPT (if needed)
-- ===========================================

/*
BEGIN;

-- Reverse Phase 3: Re-add removed columns
ALTER TABLE public.healthcare_encounters ADD COLUMN visit_duration_minutes INTEGER;
ALTER TABLE public.healthcare_encounters ADD COLUMN confidence_score NUMERIC(4,3);
ALTER TABLE public.healthcare_encounters ADD COLUMN ai_confidence NUMERIC(4,3);

-- Reverse Phase 2: Remove new columns
ALTER TABLE public.healthcare_encounters DROP COLUMN IF EXISTS date_source;
ALTER TABLE public.healthcare_encounters DROP COLUMN IF EXISTS encounter_timeframe_status;

-- Reverse Phase 1: Rename column back
ALTER TABLE public.healthcare_encounters RENAME COLUMN encounter_start_date TO encounter_date;

COMMIT;
*/

-- ===========================================
-- POST-MIGRATION WORKER UPDATES REQUIRED
-- ===========================================

-- This migration only updates the database schema.
-- Worker logic updates are required to populate new columns:
--
-- 1. manifestBuilder.ts - Two-Branch Logic:
--    - Pseudo encounters: encounter_date_end = encounter_start_date, status = 'completed'
--    - Real-world encounters: AI extracts admission + discharge dates, determines status
--
-- 2. manifestBuilder.ts - Date Source Waterfall:
--    - Try AI extraction first (date_source = 'ai_extracted')
--    - Fall back to file metadata (date_source = 'file_metadata')
--    - Last resort upload date (date_source = 'upload_date')
--
-- 3. AI Prompt Updates:
--    - Multi-day encounter detection (admission + discharge dates)
--    - Ongoing encounter detection (currently admitted language)
--    - Single-day encounter logic (only one date present)
--    - Timeframe status determination guidelines
--
-- 4. TypeScript Interface Updates:
--    - encounterDate → encounterStartDate
--    - Add encounterTimeframeStatus field
--    - Add dateSource field
--
-- See: shared/docs/architecture/.../healthcare_encounters-COLUMN-AUDIT-ANSWERS.md
