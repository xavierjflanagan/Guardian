-- ============================================================================
-- Migration: Strategy A - Pending Encounters Complete Redesign
-- Date: 2025-11-18
-- Migration Number: 48
-- Issue: Transform pass05_pending_encounters for Strategy A with identity/quality/source tracking
--
-- PROBLEM:
--   - Missing cascade support (cascade_id, is_cascading, continues_previous)
--   - No position tracking (13 fields for sub-page granularity)
--   - No reconciliation metadata (3 fields)
--   - No identity extraction (4 patient fields from File 10)
--   - No provider/facility tracking (4 fields for File 10/11)
--   - No profile classification (4 fields from File 10)
--   - No quality tier tracking (3 fields from File 11)
--   - No source metadata (5 fields from File 12)
--   - Ambiguous column names (temp_encounter_id, chunk_started, partial_data)
--
-- SOLUTION:
--   1. DELETE 2 obsolete columns (chunk_last_seen, last_seen_context)
--   2. RENAME 5 columns for clarity
--   3. ADD 41 new columns:
--      - 3 cascade fields
--      - 13 position fields (start/end boundaries with OCR coordinates)
--      - 5 reconciliation fields
--      - 4 identity fields (patient demographics)
--      - 4 provider/facility fields
--      - 4 classification fields (profile matching)
--      - 3 quality tier fields
--      - 5 source metadata fields
--   4. CREATE 11 new indexes
--   5. ADD unique constraint (session_id, pending_id)
--   6. ADD cross-field constraint for source validation
--
-- AFFECTED TABLES:
--   - pass05_pending_encounters (48 changes: 2 DELETE, 5 RENAME, 41 ADD, 11 INDEXES, 2 CONSTRAINTS)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] EXECUTED: 2025-11-18 - Migration applied successfully
--   [X] COMPLETED: Added pass05_pending_encounters schema to current_schema/04_ai_processing.sql
--                  Lines 1814-1942: Complete schema with 53 columns, 11 indexes, 2 constraints
--                  Includes all Migration 48 changes: identity, quality, source, cascade support
--
-- MIGRATION EXECUTED: 2025-11-18
-- STATUS: SUCCESS
-- VERIFICATION: Column count verified (53 columns: 16-2+39=53)
--
-- DOWNSTREAM UPDATES:
--   [ ] Worker code: Complete rewrite of chunk-processor.ts for new fields
--   [ ] Worker code: Add identifier-extractor.ts (File 10)
--   [ ] Worker code: Add profile-classifier.ts (File 10, optional)
--   [ ] Worker code: Add quality-tier-calculator.ts (File 11)
--   [ ] Worker code: Update pending-reconciler.ts for all new fields
--   [ ] Bridge schemas: Update pending encounter schema
--   [ ] TypeScript types: Generate new types from schema
--
-- DESIGN REFERENCE:
--   - Source: 03-TABLE-DESIGN-V3.md (Part 2, Section 2)
--   - Strategy: Strategy A complete pipeline with Files 10-12 integration
--   - Files: 04-12 (core + identity + quality + source), Nov 18, 2024 design
--
-- WARNING: This is a MAJOR migration affecting the core pending table.
--          Pre-launch status allows us to proceed without data preservation.
-- ============================================================================

-- ============================================================================
-- PART 1: REMOVE OBSOLETE COLUMNS
-- ============================================================================

ALTER TABLE pass05_pending_encounters
  DROP COLUMN IF EXISTS chunk_last_seen,
  DROP COLUMN IF EXISTS last_seen_context;

-- Reason: chunk_last_seen not needed with cascade system
-- Reason: last_seen_context replaced by cascade_id


-- ============================================================================
-- PART 2: RENAME COLUMNS FOR CLARITY
-- ============================================================================

ALTER TABLE pass05_pending_encounters
  RENAME COLUMN temp_encounter_id TO pending_id;

ALTER TABLE pass05_pending_encounters
  RENAME COLUMN chunk_started TO chunk_number;

ALTER TABLE pass05_pending_encounters
  RENAME COLUMN partial_data TO encounter_data;

ALTER TABLE pass05_pending_encounters
  RENAME COLUMN completed_encounter_id TO reconciled_to;

ALTER TABLE pass05_pending_encounters
  RENAME COLUMN completed_at TO reconciled_at;

-- Clearer names: pending_id (not temp), chunk_number (not started),
-- encounter_data (not partial), reconciled_to/at (not completed)


-- ============================================================================
-- PART 3: ADD CASCADE SUPPORT (3 columns)
-- ============================================================================

ALTER TABLE pass05_pending_encounters
  ADD COLUMN cascade_id varchar(100),
  ADD COLUMN is_cascading boolean DEFAULT false,
  ADD COLUMN continues_previous boolean DEFAULT false;

-- cascade_id: Links encounters spanning chunk boundaries
-- is_cascading: TRUE if encounter reaches end of chunk (continues in next)
-- continues_previous: TRUE if encounter continues from previous chunk


-- ============================================================================
-- PART 4: ADD POSITION TRACKING (13 columns)
-- ============================================================================

ALTER TABLE pass05_pending_encounters
  -- START boundary (6 columns)
  ADD COLUMN start_page integer,
  ADD COLUMN start_boundary_type varchar(20),
  ADD COLUMN start_marker text,
  ADD COLUMN start_text_y_top integer,
  ADD COLUMN start_text_height integer,
  ADD COLUMN start_y integer,

  -- END boundary (6 columns)
  ADD COLUMN end_page integer,
  ADD COLUMN end_boundary_type varchar(20),
  ADD COLUMN end_marker text,
  ADD COLUMN end_text_y_top integer,
  ADD COLUMN end_text_height integer,
  ADD COLUMN end_y integer,

  -- Overall confidence (1 column)
  ADD COLUMN position_confidence numeric;

-- boundary_type: 'inter_page' (natural page break) or 'intra_page' (mid-page split)
-- marker: Descriptive text like "after header 'ADMISSION NOTE'"
-- text_y_top/height/y: OCR coordinates for precise intra-page boundaries (NULL for inter_page)
-- position_confidence: Overall confidence in position accuracy (0.0-1.0)


-- ============================================================================
-- PART 5: ADD RECONCILIATION SUPPORT (5 columns)
-- ============================================================================

ALTER TABLE pass05_pending_encounters
  ADD COLUMN reconciliation_key varchar(255),
  ADD COLUMN reconciliation_method varchar(20),
  ADD COLUMN reconciliation_confidence numeric;

-- Note: reconciled_to and reconciled_at already exist (renamed in Part 2)
-- reconciliation_key: For descriptor-based matching (cascade ID is primary key)
-- reconciliation_method: 'cascade', 'descriptor', 'orphan'
-- reconciliation_confidence: 0.0-1.0


-- ============================================================================
-- PART 6: ADD IDENTITY MARKERS (4 columns) - File 10
-- ============================================================================

ALTER TABLE pass05_pending_encounters
  ADD COLUMN patient_full_name text,
  ADD COLUMN patient_date_of_birth text,
  ADD COLUMN patient_address text,
  ADD COLUMN patient_phone varchar(50);

-- Raw text extracted from AI for profile classification
-- DOB stored as text (e.g., "15/03/1985") - parsed during reconciliation


-- ============================================================================
-- PART 7: ADD PROVIDER/FACILITY MARKERS (4 columns) - Files 10/11
-- ============================================================================

ALTER TABLE pass05_pending_encounters
  ADD COLUMN provider_name text,
  ADD COLUMN facility_name text,
  ADD COLUMN encounter_start_date text,
  ADD COLUMN encounter_end_date text;

-- For profile classification (File 10) and quality tiers (File 11)
-- Dates stored as text (raw AI output) - parsed during reconciliation


-- ============================================================================
-- PART 8: ADD CLASSIFICATION RESULTS (4 columns) - File 10
-- ============================================================================

ALTER TABLE pass05_pending_encounters
  ADD COLUMN matched_profile_id uuid,
  ADD COLUMN match_confidence numeric,
  ADD COLUMN match_status varchar(20),
  ADD COLUMN is_orphan_identity boolean DEFAULT false;

-- matched_profile_id: Links to user_profiles(id) - populated by profile-classifier
-- match_confidence: 0.0-1.0
-- match_status: 'matched', 'unmatched', 'orphan', 'review'
-- is_orphan_identity: TRUE if unmatched identity appearing 3+ times


-- ============================================================================
-- PART 9: ADD QUALITY TIER TRACKING (3 columns) - File 11
-- ============================================================================

ALTER TABLE pass05_pending_encounters
  ADD COLUMN data_quality_tier varchar(20)
    CHECK (data_quality_tier IN ('low', 'medium', 'high', 'verified')),
  ADD COLUMN quality_criteria_met jsonb,
  ADD COLUMN quality_calculation_date timestamptz;

-- data_quality_tier: A/B/C classification (low/medium/high)
-- quality_criteria_met: {"criteria_a": true, "criteria_b": false, ...}
-- quality_calculation_date: When tier was calculated


-- ============================================================================
-- PART 10: ADD SOURCE METADATA (5 columns) - File 12
-- ============================================================================

ALTER TABLE pass05_pending_encounters
  ADD COLUMN encounter_source varchar(20) NOT NULL DEFAULT 'shell_file'
    CHECK (encounter_source IN ('shell_file', 'manual', 'api')),
  ADD COLUMN manual_created_by varchar(20)
    CHECK (manual_created_by IN ('provider', 'user', 'other_user')),
  ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN api_source_name varchar(100),
  ADD COLUMN api_import_date date;

-- encounter_source: Always 'shell_file' in Strategy A
-- manual_created_by: NULL for shell_file source (File 13 future)
-- created_by_user_id: Auth user who uploaded the document
-- api_source_name/date: NULL for shell_file source (File 13 future)


-- ============================================================================
-- PART 11: ADD CONSTRAINTS
-- ============================================================================

-- Unique constraint: Only one pending per session with given pending_id
ALTER TABLE pass05_pending_encounters
  ADD CONSTRAINT uq_pending_per_session UNIQUE (session_id, pending_id);

-- Cross-field constraint: shell_file source requires session_id
ALTER TABLE pass05_pending_encounters
  ADD CONSTRAINT check_pending_shell_file_source_valid
    CHECK (encounter_source != 'shell_file' OR session_id IS NOT NULL);


-- ============================================================================
-- PART 12: CREATE INDEXES (11 total)
-- ============================================================================

-- Cascade and reconciliation indexes
CREATE INDEX IF NOT EXISTS idx_pending_cascade
  ON pass05_pending_encounters(session_id, cascade_id);

CREATE INDEX IF NOT EXISTS idx_pending_spatial
  ON pass05_pending_encounters(session_id, start_page, end_page);

CREATE INDEX IF NOT EXISTS idx_pending_lookup
  ON pass05_pending_encounters(session_id, pending_id);

CREATE INDEX IF NOT EXISTS idx_pending_descriptor
  ON pass05_pending_encounters(session_id, reconciliation_key)
  WHERE reconciliation_key IS NOT NULL;

-- Source metadata indexes
CREATE INDEX IF NOT EXISTS idx_pending_encounters_source
  ON pass05_pending_encounters(encounter_source);

CREATE INDEX IF NOT EXISTS idx_pending_encounters_quality
  ON pass05_pending_encounters(data_quality_tier);

CREATE INDEX IF NOT EXISTS idx_pending_encounters_manual_creator
  ON pass05_pending_encounters(manual_created_by)
  WHERE manual_created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pending_encounters_creator
  ON pass05_pending_encounters(created_by_user_id);

-- Classification indexes
CREATE INDEX IF NOT EXISTS idx_pending_encounters_profile
  ON pass05_pending_encounters(matched_profile_id)
  WHERE matched_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pending_encounters_match_status
  ON pass05_pending_encounters(match_status);

CREATE INDEX IF NOT EXISTS idx_pending_encounters_orphan
  ON pass05_pending_encounters(is_orphan_identity)
  WHERE is_orphan_identity = true;


-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify deleted columns are gone
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'pass05_pending_encounters'
               AND column_name IN ('chunk_last_seen', 'last_seen_context')) THEN
        RAISE EXCEPTION 'Obsolete columns still exist in pass05_pending_encounters!';
    END IF;
END $$;

-- Verify renamed columns exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pass05_pending_encounters'
                   AND column_name IN ('pending_id', 'chunk_number', 'encounter_data',
                                      'reconciled_to', 'reconciled_at')) THEN
        RAISE EXCEPTION 'Renamed columns missing in pass05_pending_encounters!';
    END IF;
END $$;

-- Verify all new columns exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pass05_pending_encounters'
                   AND column_name IN (
                     -- Cascade (3)
                     'cascade_id', 'is_cascading', 'continues_previous',
                     -- Position start (6)
                     'start_page', 'start_boundary_type', 'start_marker',
                     'start_text_y_top', 'start_text_height', 'start_y',
                     -- Position end (6)
                     'end_page', 'end_boundary_type', 'end_marker',
                     'end_text_y_top', 'end_text_height', 'end_y',
                     -- Position confidence (1)
                     'position_confidence',
                     -- Reconciliation (3)
                     'reconciliation_key', 'reconciliation_method', 'reconciliation_confidence',
                     -- Identity (4)
                     'patient_full_name', 'patient_date_of_birth', 'patient_address', 'patient_phone',
                     -- Provider/facility (4)
                     'provider_name', 'facility_name', 'encounter_start_date', 'encounter_end_date',
                     -- Classification (4)
                     'matched_profile_id', 'match_confidence', 'match_status', 'is_orphan_identity',
                     -- Quality (3)
                     'data_quality_tier', 'quality_criteria_met', 'quality_calculation_date',
                     -- Source metadata (5)
                     'encounter_source', 'manual_created_by', 'created_by_user_id',
                     'api_source_name', 'api_import_date'
                   )) THEN
        RAISE EXCEPTION 'New columns missing in pass05_pending_encounters!';
    END IF;
END $$;

-- Verify constraints exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE table_name = 'pass05_pending_encounters'
                   AND constraint_name = 'uq_pending_per_session') THEN
        RAISE EXCEPTION 'Unique constraint uq_pending_per_session missing!';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE table_name = 'pass05_pending_encounters'
                   AND constraint_name = 'check_pending_shell_file_source_valid') THEN
        RAISE EXCEPTION 'Check constraint check_pending_shell_file_source_valid missing!';
    END IF;
END $$;

-- Verify all indexes exist
DO $$
BEGIN
    PERFORM 1 FROM pg_indexes
    WHERE tablename = 'pass05_pending_encounters'
    AND indexname IN (
      'idx_pending_cascade', 'idx_pending_spatial', 'idx_pending_lookup', 'idx_pending_descriptor',
      'idx_pending_encounters_source', 'idx_pending_encounters_quality',
      'idx_pending_encounters_manual_creator', 'idx_pending_encounters_creator',
      'idx_pending_encounters_profile', 'idx_pending_encounters_match_status',
      'idx_pending_encounters_orphan'
    );

    IF NOT FOUND THEN
        RAISE EXCEPTION 'One or more indexes missing on pass05_pending_encounters!';
    END IF;
END $$;

-- Show final column count
SELECT
  'pass05_pending_encounters' as table_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'pass05_pending_encounters';

-- Expected: 57 columns (was 16, deleted 2, renamed 5 (same count), added 41)


-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================

/*
-- WARNING: Rollback will lose all new data!

-- Remove constraints
ALTER TABLE pass05_pending_encounters
  DROP CONSTRAINT IF EXISTS uq_pending_per_session,
  DROP CONSTRAINT IF EXISTS check_pending_shell_file_source_valid;

-- Drop indexes
DROP INDEX IF EXISTS idx_pending_cascade;
DROP INDEX IF EXISTS idx_pending_spatial;
DROP INDEX IF EXISTS idx_pending_lookup;
DROP INDEX IF EXISTS idx_pending_descriptor;
DROP INDEX IF EXISTS idx_pending_encounters_source;
DROP INDEX IF EXISTS idx_pending_encounters_quality;
DROP INDEX IF EXISTS idx_pending_encounters_manual_creator;
DROP INDEX IF EXISTS idx_pending_encounters_creator;
DROP INDEX IF EXISTS idx_pending_encounters_profile;
DROP INDEX IF EXISTS idx_pending_encounters_match_status;
DROP INDEX IF EXISTS idx_pending_encounters_orphan;

-- Remove all new columns
ALTER TABLE pass05_pending_encounters
  DROP COLUMN cascade_id,
  DROP COLUMN is_cascading,
  DROP COLUMN continues_previous,
  DROP COLUMN start_page,
  DROP COLUMN start_boundary_type,
  DROP COLUMN start_marker,
  DROP COLUMN start_text_y_top,
  DROP COLUMN start_text_height,
  DROP COLUMN start_y,
  DROP COLUMN end_page,
  DROP COLUMN end_boundary_type,
  DROP COLUMN end_marker,
  DROP COLUMN end_text_y_top,
  DROP COLUMN end_text_height,
  DROP COLUMN end_y,
  DROP COLUMN position_confidence,
  DROP COLUMN reconciliation_key,
  DROP COLUMN reconciliation_method,
  DROP COLUMN reconciliation_confidence,
  DROP COLUMN patient_full_name,
  DROP COLUMN patient_date_of_birth,
  DROP COLUMN patient_address,
  DROP COLUMN patient_phone,
  DROP COLUMN provider_name,
  DROP COLUMN facility_name,
  DROP COLUMN encounter_start_date,
  DROP COLUMN encounter_end_date,
  DROP COLUMN matched_profile_id,
  DROP COLUMN match_confidence,
  DROP COLUMN match_status,
  DROP COLUMN is_orphan_identity,
  DROP COLUMN data_quality_tier,
  DROP COLUMN quality_criteria_met,
  DROP COLUMN quality_calculation_date,
  DROP COLUMN encounter_source,
  DROP COLUMN manual_created_by,
  DROP COLUMN created_by_user_id,
  DROP COLUMN api_source_name,
  DROP COLUMN api_import_date;

-- Reverse renames
ALTER TABLE pass05_pending_encounters
  RENAME COLUMN pending_id TO temp_encounter_id,
  RENAME COLUMN chunk_number TO chunk_started,
  RENAME COLUMN encounter_data TO partial_data,
  RENAME COLUMN reconciled_to TO completed_encounter_id,
  RENAME COLUMN reconciled_at TO completed_at;

-- Re-add deleted columns
ALTER TABLE pass05_pending_encounters
  ADD COLUMN chunk_last_seen integer,
  ADD COLUMN last_seen_context text;
*/


-- ============================================================================
-- MIGRATION SUMMARY
-- ============================================================================

-- pass05_pending_encounters:
--   - Before: 16 columns
--   - After: 57 columns
--   - Changes: 2 DELETE, 5 RENAME, 41 ADD, 11 INDEXES, 2 CONSTRAINTS
--
-- Deleted: chunk_last_seen, last_seen_context
--
-- Renamed:
--   temp_encounter_id → pending_id
--   chunk_started → chunk_number
--   partial_data → encounter_data
--   completed_encounter_id → reconciled_to
--   completed_at → reconciled_at
--
-- Added (41 columns):
--   Cascade (3): cascade_id, is_cascading, continues_previous
--   Position (13): start/end boundaries with OCR coordinates
--   Reconciliation (3): reconciliation_key, method, confidence
--   Identity (4): patient_full_name, DOB, address, phone
--   Provider (4): provider_name, facility_name, start/end dates
--   Classification (4): matched_profile_id, match_confidence, match_status, is_orphan_identity
--   Quality (3): data_quality_tier, quality_criteria_met, quality_calculation_date
--   Source (5): encounter_source, manual_created_by, created_by_user_id, api_source_name, api_import_date
--
-- Indexes (11): cascade, spatial, lookup, descriptor, source, quality, manual_creator, creator, profile, match_status, orphan
--
-- Constraints (2): uq_pending_per_session, check_pending_shell_file_source_valid
--
-- Breaking Changes: NONE (deleted columns unused, pre-launch status)
-- Data Migration: Clear existing pending encounters recommended (temporary data)
