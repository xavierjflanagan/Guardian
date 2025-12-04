-- ============================================================================
-- Migration: Strategy A - Page Assignments and Encounter Metrics
-- Date: 2025-11-18
-- Migration Number: 49
-- Issue: Update pass05_page_assignments and pass05_encounter_metrics for Strategy A reconciliation system
--
-- PROBLEM:
--   pass05_page_assignments:
--   - encounter_id has wrong type (text instead of uuid) and wrong nullability (NOT NULL)
--   - Missing session_id and pending_id for reconciliation tracking
--   - Missing chunk_number and cascade_id for provenance
--   - Missing reconciled_at timestamp
--   - Missing is_partial flag for multi-encounter pages
--
--   pass05_encounter_metrics:
--   - Missing reconciliation metrics (pendings, cascades, orphans, timing, method)
--   - Missing chunk metrics (count, avg time, max time)
--   - Missing quality position metrics
--   - Missing identity completeness tracking (File 10)
--   - Missing quality tier summary (File 11)
--   - Orphaned columns never populated (user_agent, ip_address, batching_required)
--
-- SOLUTION:
--   1. MODIFY pass05_page_assignments:
--      - TRUNCATE table (breaking change: encounter_id type conversion)
--      - Change encounter_id from text NOT NULL to uuid nullable
--      - Add 6 new columns (session_id, pending_id, chunk_number, cascade_id, is_partial, reconciled_at)
--      - Add unique constraint (shell_file_id, page_num, pending_id)
--      - Add 2 foreign keys (pending_encounters, healthcare_encounters)
--      - Add 6 indexes (doc_page, encounter, pending, chunk, cascade, unreconciled)
--   2. MODIFY pass05_encounter_metrics:
--      - Delete 3 orphaned columns
--      - Add 15 new columns (5 reconciliation + 3 chunk + 2 quality position + 4 identity + 2 quality tier)
--
-- AFFECTED TABLES:
--   - pass05_page_assignments (19 changes: TRUNCATE, 1 MODIFY, 6 ADD, 1 CONSTRAINT, 2 FKs, 6 INDEXES)
--   - pass05_encounter_metrics (18 changes: 3 DELETE, 15 ADD)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] EXECUTED: 2025-11-18 - Migration applied successfully
--   [X] COMPLETED: Added pass05_page_assignments schema to current_schema/04_ai_processing.sql
--                  Lines 1945-2000: Complete schema with 12 columns, 6 indexes, 3 constraints
--                  Includes Migration 49 changes: dual-ID tracking, reconciliation, provenance
--   [X] COMPLETED: Added pass05_encounter_metrics schema to current_schema/04_ai_processing.sql
--                  Lines 2003-2079: Complete schema with 36 columns, 3 indexes
--                  Includes Migration 49 changes: reconciliation, chunk, quality, identity metrics
--   [X] COMPLETED: Dropped vestigial view shell_file_manifests_v2 (no longer used in application)
--
-- DOWNSTREAM UPDATES:
--   [ ] Worker code: Update chunk-processor to populate session_id, pending_id, chunk_number, cascade_id
--   [ ] Worker code: Update reconciler to set encounter_id and reconciled_at
--   [ ] Worker code: Update metrics aggregation to populate all 15 new fields
--   [ ] Bridge schemas: N/A (internal processing tables)
--   [ ] TypeScript types: Update if types generated from database
--
-- MIGRATION EXECUTED: 2025-11-18
-- STATUS: SUCCESS
-- VERIFICATION: Column counts verified (page_assignments=12, metrics=35)
--
-- DESIGN REFERENCE:
--   - Source: 03-TABLE-DESIGN-V3.md (Part 2, Sections 4 and 5)
--   - Strategy: Strategy A reconciliation and metrics tracking
--   - Files: 04-12 (core + identity + quality + source), Nov 18, 2024 design
--
-- WARNING: pass05_page_assignments TRUNCATE is a breaking change.
--          Pre-launch status allows us to proceed without data preservation.
-- ============================================================================


-- ============================================================================
-- PART 1: MODIFY pass05_page_assignments
-- ============================================================================

-- Step 1: TRUNCATE table for encounter_id type conversion
TRUNCATE TABLE pass05_page_assignments;

-- Reason: encounter_id type change from text to uuid requires data cleanup
-- Impact: All existing page assignments deleted (acceptable pre-launch)


-- Step 2: Change encounter_id type and nullability
ALTER TABLE pass05_page_assignments
  ALTER COLUMN encounter_id DROP NOT NULL;

ALTER TABLE pass05_page_assignments
  ALTER COLUMN encounter_id TYPE uuid USING encounter_id::uuid;

-- Reason: encounter_id must be uuid (to FK to healthcare_encounters) and nullable
-- (populated only AFTER reconciliation completes)


-- Step 3: Add dual-ID tracking and reconciliation timestamp
ALTER TABLE pass05_page_assignments
  ADD COLUMN session_id uuid NOT NULL REFERENCES pass05_progressive_sessions(id) ON DELETE CASCADE,
  ADD COLUMN pending_id text NOT NULL,
  ADD COLUMN reconciled_at timestamptz;

-- Column purposes:
--   session_id: Links to processing session (required for pending FK)
--   pending_id: Temporary encounter ID during chunking (before reconciliation)
--   reconciled_at: When this page was reconciled from pending to final encounter


-- Step 4: Add provenance tracking
ALTER TABLE pass05_page_assignments
  ADD COLUMN chunk_number integer NOT NULL,
  ADD COLUMN cascade_id varchar(100);

-- Column purposes:
--   chunk_number: Which chunk assigned this page (for debugging/auditing)
--   cascade_id: If page belongs to cascading encounter, track cascade chain


-- Step 5: Add page metadata
ALTER TABLE pass05_page_assignments
  ADD COLUMN is_partial boolean DEFAULT false;

-- Reason: Track pages with multiple encounters (partial page assignments)


-- Step 6: Add unique constraint (prevent duplicate pending assignments)
ALTER TABLE pass05_page_assignments
  ADD CONSTRAINT uq_page_per_pending
  UNIQUE (shell_file_id, page_num, pending_id);

-- Reason: Each page+pending combination should appear only once


-- Step 7: Add foreign key constraints
ALTER TABLE pass05_page_assignments
  ADD CONSTRAINT fk_pending_encounter
  FOREIGN KEY (session_id, pending_id)
  REFERENCES pass05_pending_encounters(session_id, pending_id)
  ON DELETE CASCADE;

ALTER TABLE pass05_page_assignments
  ADD CONSTRAINT fk_final_encounter
  FOREIGN KEY (encounter_id)
  REFERENCES healthcare_encounters(id)
  ON DELETE CASCADE;

-- Reason: Ensure referential integrity for both pending and final encounters


-- Step 8: Create indexes for performance
CREATE INDEX idx_page_assign_doc_page
  ON pass05_page_assignments(shell_file_id, page_num);

CREATE INDEX idx_page_assign_encounter
  ON pass05_page_assignments(encounter_id)
  WHERE encounter_id IS NOT NULL;

CREATE INDEX idx_page_assign_pending
  ON pass05_page_assignments(session_id, pending_id);

CREATE INDEX idx_page_assign_chunk
  ON pass05_page_assignments(session_id, chunk_number);

CREATE INDEX idx_page_assign_cascade
  ON pass05_page_assignments(cascade_id)
  WHERE cascade_id IS NOT NULL;

CREATE INDEX idx_page_assign_unreconciled
  ON pass05_page_assignments(shell_file_id, pending_id)
  WHERE encounter_id IS NULL;

-- Index purposes:
--   doc_page: Lookup all encounters on specific page
--   encounter: Find all pages for final encounter
--   pending: Find all pages for pending encounter
--   chunk: Find all pages assigned in specific chunk
--   cascade: Find all pages in cascade chain
--   unreconciled: Find pages not yet reconciled


-- ============================================================================
-- PART 2: MODIFY pass05_encounter_metrics
-- ============================================================================

-- Step 1: Remove orphaned columns (never populated)
ALTER TABLE pass05_encounter_metrics
  DROP COLUMN IF EXISTS user_agent,
  DROP COLUMN IF EXISTS ip_address,
  DROP COLUMN IF EXISTS batching_required;

-- Reason: user_agent/ip_address never relevant for backend worker
-- batching_required always TRUE in Strategy A (replaced by chunk_count)


-- Step 2: Add reconciliation metrics
ALTER TABLE pass05_encounter_metrics
  ADD COLUMN pendings_total integer,
  ADD COLUMN cascades_total integer,
  ADD COLUMN orphans_total integer,
  ADD COLUMN reconciliation_time_ms integer,
  ADD COLUMN reconciliation_method varchar(20);

-- Column purposes:
--   pendings_total: Total pending encounters before reconciliation
--   cascades_total: Number of cascade chains created
--   orphans_total: Pendings that couldn't reconcile to final encounters
--   reconciliation_time_ms: Time spent in reconciliation phase
--   reconciliation_method: Primary method used ('cascade', 'descriptor', 'mixed')


-- Step 3: Add chunk metrics
ALTER TABLE pass05_encounter_metrics
  ADD COLUMN chunk_count integer,
  ADD COLUMN avg_chunk_time_ms integer,
  ADD COLUMN max_chunk_time_ms integer;

-- Column purposes:
--   chunk_count: Number of chunks processed (replaces batching_required boolean)
--   avg_chunk_time_ms: Average processing time per chunk
--   max_chunk_time_ms: Slowest chunk (for performance debugging)


-- Step 4: Add quality position metrics
ALTER TABLE pass05_encounter_metrics
  ADD COLUMN pages_with_multi_encounters integer,
  ADD COLUMN position_confidence_avg numeric;

-- Column purposes:
--   pages_with_multi_encounters: Pages with >1 encounter (complexity metric)
--   position_confidence_avg: Average position confidence across all encounters


-- Step 5: Add identity completeness metrics (File 10 integration)
ALTER TABLE pass05_encounter_metrics
  ADD COLUMN encounters_with_patient_name integer DEFAULT 0,
  ADD COLUMN encounters_with_dob integer DEFAULT 0,
  ADD COLUMN encounters_with_provider integer DEFAULT 0,
  ADD COLUMN encounters_with_facility integer DEFAULT 0;

-- Column purposes: Track how many encounters have complete identity markers
-- (patient_full_name, date_of_birth, provider_name, facility_name)


-- Step 6: Add quality tier summary (File 11 integration)
ALTER TABLE pass05_encounter_metrics
  ADD COLUMN encounters_high_quality integer DEFAULT 0,
  ADD COLUMN encounters_low_quality integer DEFAULT 0;

-- Column purposes:
--   encounters_high_quality: Count of HIGH or VERIFIED tier encounters
--   encounters_low_quality: Count of LOW or MEDIUM tier encounters


-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify pass05_page_assignments columns
DO $$
BEGIN
    -- Check encounter_id is uuid and nullable
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pass05_page_assignments'
                   AND column_name = 'encounter_id'
                   AND data_type = 'uuid'
                   AND is_nullable = 'YES') THEN
        RAISE EXCEPTION 'encounter_id not uuid nullable in pass05_page_assignments!';
    END IF;

    -- Check new columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pass05_page_assignments'
                   AND column_name IN ('session_id', 'pending_id', 'chunk_number',
                                      'cascade_id', 'is_partial', 'reconciled_at')) THEN
        RAISE EXCEPTION 'New columns missing in pass05_page_assignments!';
    END IF;
END $$;

-- Verify pass05_page_assignments constraints
DO $$
BEGIN
    -- Check unique constraint exists
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'uq_page_per_pending') THEN
        RAISE EXCEPTION 'Unique constraint uq_page_per_pending missing!';
    END IF;

    -- Check foreign keys exist
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname IN ('fk_pending_encounter', 'fk_final_encounter')) THEN
        RAISE EXCEPTION 'Foreign key constraints missing in pass05_page_assignments!';
    END IF;
END $$;

-- Verify pass05_page_assignments indexes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                   WHERE tablename = 'pass05_page_assignments'
                   AND indexname IN ('idx_page_assign_doc_page', 'idx_page_assign_encounter',
                                    'idx_page_assign_pending', 'idx_page_assign_chunk',
                                    'idx_page_assign_cascade', 'idx_page_assign_unreconciled')) THEN
        RAISE EXCEPTION 'Required indexes missing in pass05_page_assignments!';
    END IF;
END $$;

-- Verify pass05_encounter_metrics columns
DO $$
BEGIN
    -- Check deleted columns are gone
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'pass05_encounter_metrics'
               AND column_name IN ('user_agent', 'ip_address', 'batching_required')) THEN
        RAISE EXCEPTION 'Orphaned columns still exist in pass05_encounter_metrics!';
    END IF;

    -- Check reconciliation metrics exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pass05_encounter_metrics'
                   AND column_name IN ('pendings_total', 'cascades_total', 'orphans_total',
                                      'reconciliation_time_ms', 'reconciliation_method')) THEN
        RAISE EXCEPTION 'Reconciliation metrics missing in pass05_encounter_metrics!';
    END IF;

    -- Check chunk metrics exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pass05_encounter_metrics'
                   AND column_name IN ('chunk_count', 'avg_chunk_time_ms', 'max_chunk_time_ms')) THEN
        RAISE EXCEPTION 'Chunk metrics missing in pass05_encounter_metrics!';
    END IF;

    -- Check quality position metrics exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pass05_encounter_metrics'
                   AND column_name IN ('pages_with_multi_encounters', 'position_confidence_avg')) THEN
        RAISE EXCEPTION 'Quality position metrics missing in pass05_encounter_metrics!';
    END IF;

    -- Check identity completeness metrics exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pass05_encounter_metrics'
                   AND column_name IN ('encounters_with_patient_name', 'encounters_with_dob',
                                      'encounters_with_provider', 'encounters_with_facility')) THEN
        RAISE EXCEPTION 'Identity completeness metrics missing in pass05_encounter_metrics!';
    END IF;

    -- Check quality tier summary exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pass05_encounter_metrics'
                   AND column_name IN ('encounters_high_quality', 'encounters_low_quality')) THEN
        RAISE EXCEPTION 'Quality tier summary missing in pass05_encounter_metrics!';
    END IF;
END $$;

-- Show final column counts
SELECT
  'pass05_page_assignments' as table_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'pass05_page_assignments'
UNION ALL
SELECT
  'pass05_encounter_metrics' as table_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'pass05_encounter_metrics';

-- Expected: pass05_page_assignments = 12 columns (was 6, added 6)
-- Expected: pass05_encounter_metrics = 35 columns (was 23, deleted 3, added 15)


-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================

/*
-- Rollback pass05_page_assignments
ALTER TABLE pass05_page_assignments
  DROP CONSTRAINT IF EXISTS fk_pending_encounter,
  DROP CONSTRAINT IF EXISTS fk_final_encounter,
  DROP CONSTRAINT IF EXISTS uq_page_per_pending,
  DROP COLUMN IF EXISTS session_id,
  DROP COLUMN IF EXISTS pending_id,
  DROP COLUMN IF EXISTS reconciled_at,
  DROP COLUMN IF EXISTS chunk_number,
  DROP COLUMN IF EXISTS cascade_id,
  DROP COLUMN IF EXISTS is_partial;

ALTER TABLE pass05_page_assignments
  ALTER COLUMN encounter_id TYPE text USING encounter_id::text,
  ALTER COLUMN encounter_id SET NOT NULL;

DROP INDEX IF EXISTS idx_page_assign_doc_page;
DROP INDEX IF EXISTS idx_page_assign_encounter;
DROP INDEX IF EXISTS idx_page_assign_pending;
DROP INDEX IF EXISTS idx_page_assign_chunk;
DROP INDEX IF EXISTS idx_page_assign_cascade;
DROP INDEX IF EXISTS idx_page_assign_unreconciled;

-- Rollback pass05_encounter_metrics
ALTER TABLE pass05_encounter_metrics
  ADD COLUMN user_agent text,
  ADD COLUMN ip_address inet,
  ADD COLUMN batching_required boolean NOT NULL DEFAULT false,
  DROP COLUMN pendings_total,
  DROP COLUMN cascades_total,
  DROP COLUMN orphans_total,
  DROP COLUMN reconciliation_time_ms,
  DROP COLUMN reconciliation_method,
  DROP COLUMN chunk_count,
  DROP COLUMN avg_chunk_time_ms,
  DROP COLUMN max_chunk_time_ms,
  DROP COLUMN pages_with_multi_encounters,
  DROP COLUMN position_confidence_avg,
  DROP COLUMN encounters_with_patient_name,
  DROP COLUMN encounters_with_dob,
  DROP COLUMN encounters_with_provider,
  DROP COLUMN encounters_with_facility,
  DROP COLUMN encounters_high_quality,
  DROP COLUMN encounters_low_quality;
*/


-- ============================================================================
-- MIGRATION SUMMARY
-- ============================================================================

-- pass05_page_assignments:
--   - Before: 6 columns
--   - After: 12 columns
--   - Changes: TRUNCATE, 1 MODIFY (encounter_id), 6 ADD, 1 CONSTRAINT, 2 FKs, 6 INDEXES
--   - Modified: encounter_id (text NOT NULL → uuid nullable)
--   - Added: session_id, pending_id, reconciled_at, chunk_number, cascade_id, is_partial
--   - Constraint: uq_page_per_pending (shell_file_id, page_num, pending_id)
--   - FKs: fk_pending_encounter, fk_final_encounter
--   - Indexes: 6 (doc_page, encounter, pending, chunk, cascade, unreconciled)

-- pass05_encounter_metrics:
--   - Before: 23 columns
--   - After: 35 columns
--   - Changes: 3 DELETE, 15 ADD
--   - Deleted: user_agent, ip_address, batching_required
--   - Added: 5 reconciliation + 3 chunk + 2 quality position + 4 identity + 2 quality tier

-- Breaking Changes: YES - pass05_page_assignments TRUNCATE (acceptable pre-launch)
-- Data Migration: None required (truncated table)
