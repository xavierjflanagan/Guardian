-- ============================================================================
-- Migration: Strategy A - Progressive Sessions and Chunk Results
-- Date: 2025-11-18
-- Migration Number: 47
-- Issue: Update progressive session and chunk result tables for Strategy A cascade system
--
-- PROBLEM:
--   - Orphaned encounter tracking columns (total_encounters_found/completed) never populated
--   - Ambiguous naming (total_encounters_pending vs actual meaning)
--   - Missing cascade tracking metrics
--   - Missing strategy version tracking
--   - pass05_progressive_performance view is redundant
--   - Chunk results missing batching analysis storage
--
-- SOLUTION:
--   1. DROP pass05_progressive_performance view (redundant with pass05_encounter_metrics)
--   2. MODIFY pass05_progressive_sessions:
--      - Delete 2 orphaned columns
--      - Rename 1 column for clarity (total_encounters_pending → total_pendings_created)
--      - Add 4 cascade/strategy tracking columns
--   3. MODIFY pass05_chunk_results:
--      - Delete 3 obsolete encounter tracking columns
--      - Rename 2 handoff columns to cascade terminology
--      - Add 5 cascade metrics + batching analysis
--
-- AFFECTED TABLES:
--   - pass05_progressive_performance (VIEW - DROP)
--   - pass05_progressive_sessions (7 changes: 2 DELETE, 1 RENAME, 4 ADD)
--   - pass05_chunk_results (10 changes: 3 DELETE, 2 RENAME, 5 ADD, 1 INDEX)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] EXECUTED: 2025-11-18 - Migration applied successfully
--   [X] COMPLETED: Added SECTION 7 to current_schema/04_ai_processing.sql (lines 1648-1943)
--   [X] COMPLETED: Documented pass05_progressive_sessions schema (26 columns, lines 1657-1732)
--   [X] COMPLETED: Documented pass05_chunk_results schema (27 columns, lines 1735-1811)
--   [X] COMPLETED: Removed pass05_progressive_performance view (was redundant)
--
-- DOWNSTREAM UPDATES:
--   [ ] Worker code: Update queries referencing renamed columns (apps/render-worker/src/pass05/progressive/database.ts)
--   [ ] Worker code: Populate new cascade metrics during processing
--   [ ] Bridge schemas: N/A (internal processing tables)
--   [ ] TypeScript types: Update if types generated from database
--
-- MIGRATION EXECUTED: 2025-11-18
-- STATUS: SUCCESS
-- VERIFICATION: Column counts verified (sessions=26, chunks=27)
--
-- DESIGN REFERENCE:
--   - Source: 03-TABLE-DESIGN-V3.md (Part 2, Sections 1 and 3)
--   - Strategy: Strategy A cascade-based progressive processing
--   - Files: 04-08 (core pipeline), Nov 18, 2024 design
-- ============================================================================

-- ============================================================================
-- PART 1: DROP REDUNDANT VIEW
-- ============================================================================

DROP VIEW IF EXISTS pass05_progressive_performance CASCADE;

-- Reason: This view is redundant with pass05_encounter_metrics table
-- Impact: None - no known dependencies


-- ============================================================================
-- PART 2: MODIFY pass05_progressive_sessions
-- ============================================================================

-- Step 1: Remove orphaned columns (never populated in current system)
ALTER TABLE pass05_progressive_sessions
  DROP COLUMN IF EXISTS total_encounters_found,
  DROP COLUMN IF EXISTS total_encounters_completed;

-- Reason: These columns were designed for immediate encounter tracking but
-- Strategy A creates all encounters as "pending" first, reconciling later.
-- These columns remained 0 until reconciliation, making them meaningless.


-- Step 2: Rename for clarity
ALTER TABLE pass05_progressive_sessions
  RENAME COLUMN total_encounters_pending TO total_pendings_created;

-- Reason: More accurate name - this counts pending encounters CREATED during
-- chunk processing, not encounters currently in "pending" status.


-- Step 3: Add Strategy A cascade tracking columns
ALTER TABLE pass05_progressive_sessions
  ADD COLUMN total_cascades integer DEFAULT 0,
  ADD COLUMN strategy_version varchar(10) DEFAULT 'A-v1',
  ADD COLUMN reconciliation_completed_at timestamptz,
  ADD COLUMN final_encounter_count integer;

-- Column purposes:
--   total_cascades: Count of cascade chains created (encounters spanning chunks)
--   strategy_version: Track which strategy version processed this session (A-v1, B-v1, etc.)
--   reconciliation_completed_at: Separate timestamp for when reconciliation finishes (vs chunks finishing)
--   final_encounter_count: Count of final encounters after reconciliation (vs pendings created)


-- Step 4: Backfill strategy version for existing sessions
UPDATE pass05_progressive_sessions
SET strategy_version = 'A-v1'
WHERE strategy_version IS NULL;

-- All existing sessions will be marked as processed by Strategy A version 1


-- ============================================================================
-- PART 3: MODIFY pass05_chunk_results
-- ============================================================================

-- Step 1: Remove obsolete encounter tracking columns
ALTER TABLE pass05_chunk_results
  DROP COLUMN IF EXISTS encounters_started,
  DROP COLUMN IF EXISTS encounters_completed,
  DROP COLUMN IF EXISTS encounters_continued;

-- Reason: Strategy A doesn't "start" or "complete" encounters at chunk level.
-- All encounters go to pending table. Cascade system replaces "continued" tracking.


-- Step 2: Rename handoff columns to cascade terminology
ALTER TABLE pass05_chunk_results
  RENAME COLUMN handoff_received TO cascade_context_received;

ALTER TABLE pass05_chunk_results
  RENAME COLUMN handoff_generated TO cascade_package_sent;

-- Reason: Align terminology with cascade system. Handoff only contains cascade
-- context (cascade_id + encounter_type + last_page), not complex state.


-- Step 3: Add cascade metrics and batching analysis
ALTER TABLE pass05_chunk_results
  ADD COLUMN pendings_created integer DEFAULT 0,
  ADD COLUMN cascading_count integer DEFAULT 0,
  ADD COLUMN cascade_ids text[],
  ADD COLUMN continues_count integer DEFAULT 0,
  ADD COLUMN page_separation_analysis jsonb;

-- Column purposes:
--   pendings_created: Total pending encounters created in this chunk
--   cascading_count: How many encounters were marked as cascading (reached chunk boundary)
--   cascade_ids: Array of cascade IDs created/continued in this chunk
--   continues_count: How many encounters continued from previous chunk
--   page_separation_analysis: Batching split points identified by AI (for Pass 1/2)


-- Step 4: Create index for batching analysis queries
CREATE INDEX IF NOT EXISTS idx_chunk_results_separation_analysis
  ON pass05_chunk_results USING GIN (page_separation_analysis);

-- Enables efficient querying of batching split points during reconciliation


-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify view dropped
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'pass05_progressive_performance') THEN
        RAISE EXCEPTION 'View pass05_progressive_performance still exists!';
    END IF;
END $$;

-- Verify pass05_progressive_sessions columns
DO $$
BEGIN
    -- Check deleted columns are gone
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'pass05_progressive_sessions'
               AND column_name IN ('total_encounters_found', 'total_encounters_completed')) THEN
        RAISE EXCEPTION 'Orphaned columns still exist in pass05_progressive_sessions!';
    END IF;

    -- Check renamed column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pass05_progressive_sessions'
                   AND column_name = 'total_pendings_created') THEN
        RAISE EXCEPTION 'Column total_pendings_created missing in pass05_progressive_sessions!';
    END IF;

    -- Check new columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pass05_progressive_sessions'
                   AND column_name IN ('total_cascades', 'strategy_version',
                                      'reconciliation_completed_at', 'final_encounter_count')) THEN
        RAISE EXCEPTION 'New columns missing in pass05_progressive_sessions!';
    END IF;
END $$;

-- Verify pass05_chunk_results columns
DO $$
BEGIN
    -- Check deleted columns are gone
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'pass05_chunk_results'
               AND column_name IN ('encounters_started', 'encounters_completed', 'encounters_continued')) THEN
        RAISE EXCEPTION 'Obsolete columns still exist in pass05_chunk_results!';
    END IF;

    -- Check renamed columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pass05_chunk_results'
                   AND column_name IN ('cascade_context_received', 'cascade_package_sent')) THEN
        RAISE EXCEPTION 'Renamed columns missing in pass05_chunk_results!';
    END IF;

    -- Check new columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pass05_chunk_results'
                   AND column_name IN ('pendings_created', 'cascading_count', 'cascade_ids',
                                      'continues_count', 'page_separation_analysis')) THEN
        RAISE EXCEPTION 'New columns missing in pass05_chunk_results!';
    END IF;
END $$;

-- Verify index created
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                   WHERE tablename = 'pass05_chunk_results'
                   AND indexname = 'idx_chunk_results_separation_analysis') THEN
        RAISE EXCEPTION 'Index idx_chunk_results_separation_analysis missing!';
    END IF;
END $$;

-- Show final column counts
SELECT
  'pass05_progressive_sessions' as table_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'pass05_progressive_sessions'
UNION ALL
SELECT
  'pass05_chunk_results' as table_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'pass05_chunk_results';

-- Expected: pass05_progressive_sessions = 26 columns (was 24, deleted 2, added 4)
-- Expected: pass05_chunk_results = 27 columns (was 25, deleted 3, added 5)


-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================

/*
-- Recreate view (if needed - but it was redundant)
CREATE OR REPLACE VIEW pass05_progressive_performance AS
SELECT * FROM pass05_encounter_metrics;

-- Rollback pass05_progressive_sessions
ALTER TABLE pass05_progressive_sessions
  ADD COLUMN total_encounters_found integer DEFAULT 0,
  ADD COLUMN total_encounters_completed integer DEFAULT 0,
  RENAME COLUMN total_pendings_created TO total_encounters_pending,
  DROP COLUMN total_cascades,
  DROP COLUMN strategy_version,
  DROP COLUMN reconciliation_completed_at,
  DROP COLUMN final_encounter_count;

-- Rollback pass05_chunk_results
ALTER TABLE pass05_chunk_results
  ADD COLUMN encounters_started integer DEFAULT 0,
  ADD COLUMN encounters_completed integer DEFAULT 0,
  ADD COLUMN encounters_continued integer DEFAULT 0,
  RENAME COLUMN cascade_context_received TO handoff_received,
  RENAME COLUMN cascade_package_sent TO handoff_generated,
  DROP COLUMN pendings_created,
  DROP COLUMN cascading_count,
  DROP COLUMN cascade_ids,
  DROP COLUMN continues_count,
  DROP COLUMN page_separation_analysis;

DROP INDEX IF EXISTS idx_chunk_results_separation_analysis;
*/


-- ============================================================================
-- MIGRATION SUMMARY
-- ============================================================================

-- pass05_progressive_performance (VIEW):
--   - DROPPED (redundant with pass05_encounter_metrics)

-- pass05_progressive_sessions:
--   - Before: 24 columns
--   - After: 26 columns
--   - Changes: 2 DELETE, 1 RENAME, 4 ADD
--   - Deleted: total_encounters_found, total_encounters_completed
--   - Renamed: total_encounters_pending → total_pendings_created
--   - Added: total_cascades, strategy_version, reconciliation_completed_at, final_encounter_count

-- pass05_chunk_results:
--   - Before: 25 columns
--   - After: 27 columns
--   - Changes: 3 DELETE, 2 RENAME, 5 ADD, 1 INDEX
--   - Deleted: encounters_started, encounters_completed, encounters_continued
--   - Renamed: handoff_received → cascade_context_received, handoff_generated → cascade_package_sent
--   - Added: pendings_created, cascading_count, cascade_ids, continues_count, page_separation_analysis
--   - Index: idx_chunk_results_separation_analysis (GIN on page_separation_analysis)

-- Breaking Changes: NONE (deleted columns were orphaned/unused)
-- Data Migration: Backfill strategy_version='A-v1' for existing sessions
