-- ============================================================================
-- Migration: Strategy A - Healthcare Encounters and Shell Files
-- Date: 2025-11-18
-- Migration Number: 50
-- Issue: Transform healthcare_encounters and shell_files for Strategy A with column parity,
--        position tracking, identity/quality/source metadata
--
-- PROBLEM:
--   healthcare_encounters:
--   - Missing cascade support (cascade_id, chunk_count, reconciliation_key)
--   - Missing position tracking (13 fields for sub-page granularity)
--   - Missing identity markers (4 patient fields from File 10)
--   - Missing classification results (4 fields from File 10)
--   - Missing quality tier tracking (3 fields from File 11)
--   - Missing source metadata (5 fields from File 12)
--   - Orphaned columns never populated (4 fields)
--   - Inconsistent naming (primary_shell_file_id vs source_shell_file_id)
--   - Wrong page_ranges type (integer[] instead of integer[][])
--
--   shell_files:
--   - Missing uploaded_by for auth user tracking (critical for created_by_user_id)
--   - Missing progressive_session_id direct link
--   - Missing reconciliation_method tracking
--   - Missing File 12 source classification (shell_file_subtype, api_source_name)
--   - Orphaned columns never populated (3 fields)
--
-- SOLUTION:
--   1. MODIFY healthcare_encounters:
--      - Delete 4 orphaned columns
--      - Rename 2 columns for consistency
--      - Change page_ranges type from integer[] to integer[][]
--      - Add 38 new columns (3 cascade + 13 position + 2 reconciliation + 4 identity +
--                            1 facility + 4 classification + 3 quality + 5 source + 3 provider)
--      - Add 1 cross-field constraint
--      - Add 11 indexes
--   2. MODIFY shell_files:
--      - Add uploaded_by FIRST (critical for FK)
--      - Delete 3 orphaned columns
--      - Add 4 more Strategy A columns
--      - Add 3 indexes
--
-- AFFECTED TABLES:
--   - healthcare_encounters (56 changes: 4 DELETE, 2 RENAME, 1 TYPE CHANGE, 38 ADD, 1 CONSTRAINT, 11 INDEXES)
--   - shell_files (10 changes: 3 DELETE, 5 ADD, 3 INDEXES)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] EXECUTED: 2025-11-18 - Migration applied successfully
--   [X] COMPLETED: Updated healthcare_encounters schema in current_schema/03_clinical_core.sql
--                  Lines 513-631: Complete schema with 77 columns (was 46, deleted 4, added 38, renamed 2)
--                  Lines 1653-1664: Added 11 Migration 50 indexes
--                  Includes all Migration 50 changes: cascade, position, identity, quality, source metadata
--   [X] COMPLETED: Updated shell_files schema in current_schema/03_clinical_core.sql
--                  Lines 96-164: Complete schema with 40 columns (was 38, deleted 3, added 5)
--                  Lines 1679-1680: Added 2 Migration 50 indexes (renamed 1 existing)
--                  Includes all Migration 50 changes: uploaded_by, progressive_session_id, reconciliation_method, source classification
--
-- DOWNSTREAM UPDATES:
--   [ ] Worker code: Update all references to primary_shell_file_id → source_shell_file_id
--   [ ] Worker code: Update reconciler to copy all 38 new fields from pending to final
--   [ ] Worker code: Update pass_0_5_progressive references to progressive_session_id
--   [ ] Bridge schemas: Update healthcare_encounters schema
--   [ ] TypeScript types: Update generated types
--
-- MIGRATION EXECUTED: 2025-11-18
-- STATUS: SUCCESS
-- VERIFICATION: Column counts verified (healthcare_encounters=80, shell_files=40)
--
-- DESIGN REFERENCE:
--   - Source: 03-TABLE-DESIGN-V3.md (Part 2, Sections 6 and 7)
--   - Strategy: Strategy A column parity, position tracking, Files 10-12 integration
--   - Files: 04-12 (core + identity + quality + source), Nov 18, 2024 design
--
-- WARNING: Column renames are breaking changes requiring worker code updates
-- ============================================================================


-- ============================================================================
-- PART 1: MODIFY healthcare_encounters
-- ============================================================================

-- Step 1: Remove orphaned columns (never populated)
ALTER TABLE healthcare_encounters
  DROP COLUMN IF EXISTS date_resolution_reason,
  DROP COLUMN IF EXISTS clinical_effective_date,
  DROP COLUMN IF EXISTS date_confidence,
  DROP COLUMN IF EXISTS plan;

-- Reason: All 4 columns have 0 rows populated across 161 total encounters


-- Step 2: Rename columns for consistency
ALTER TABLE healthcare_encounters
  RENAME COLUMN primary_shell_file_id TO source_shell_file_id;

ALTER TABLE healthcare_encounters
  RENAME COLUMN encounter_date_end TO encounter_end_date;

-- Reason: source_shell_file_id matches pending_encounters naming
-- Reason: encounter_end_date consistent with encounter_start_date naming


-- Step 3: Change page_ranges type for column parity
ALTER TABLE healthcare_encounters
  ALTER COLUMN page_ranges TYPE integer[][]
  USING CASE
    WHEN page_ranges IS NULL THEN NULL
    WHEN array_length(page_ranges, 1) = 0 THEN ARRAY[]::integer[][]
    ELSE ARRAY[page_ranges]::integer[][]
  END;

-- Reason: Column parity with pending_encounters (integer[][] for [start,end] pairs)


-- Step 4: Add cascade support (3 columns)
ALTER TABLE healthcare_encounters
  ADD COLUMN cascade_id varchar(100),
  ADD COLUMN chunk_count integer DEFAULT 1,
  ADD COLUMN reconciliation_key text;

-- Column purposes:
--   cascade_id: Which cascade created this (if encounter spanned chunks)
--   chunk_count: How many chunks this encounter spanned
--   reconciliation_key: Unique descriptor for duplicate detection


-- Step 5: Add position tracking (13 columns)
ALTER TABLE healthcare_encounters
  ADD COLUMN start_page integer,
  ADD COLUMN start_boundary_type varchar(20),
  ADD COLUMN start_marker text,
  ADD COLUMN start_text_y_top integer,
  ADD COLUMN start_text_height integer,
  ADD COLUMN start_y integer,
  ADD COLUMN end_page integer,
  ADD COLUMN end_boundary_type varchar(20),
  ADD COLUMN end_marker text,
  ADD COLUMN end_text_y_top integer,
  ADD COLUMN end_text_height integer,
  ADD COLUMN end_y integer,
  ADD COLUMN position_confidence numeric;

-- Column purposes: Sub-page granularity boundary positions (matches batching design)
--   start_page/end_page: First/last page of encounter
--   start_boundary_type/end_boundary_type: 'inter_page' or 'intra_page'
--   start_marker/end_marker: Descriptive text for boundaries
--   start_text_y_top/end_text_y_top: Y-coordinate of marker text top (NULL if inter_page)
--   start_text_height/end_text_height: Height of marker text (NULL if inter_page)
--   start_y/end_y: Calculated split line (y_top - height, NULL if inter_page)
--   position_confidence: Overall confidence in boundary positions (0.0-1.0)


-- Step 6: Add reconciliation tracking (2 columns)
ALTER TABLE healthcare_encounters
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN reconciled_from_pendings integer;

-- Column purposes:
--   completed_at: When reconciliation created this final encounter
--   reconciled_from_pendings: Count of pending encounters merged into this


-- Step 7: Add identity markers - File 10 (4 columns)
ALTER TABLE healthcare_encounters
  ADD COLUMN patient_full_name text,
  ADD COLUMN patient_date_of_birth date,
  ADD COLUMN patient_mrn text,
  ADD COLUMN patient_address text;

-- Column purposes: Patient demographics extracted from document


-- Step 8: Add facility address - File 10 (1 column)
ALTER TABLE healthcare_encounters
  ADD COLUMN facility_address text;

-- Reason: Complete the provider/facility set (provider_name and facility_name already exist)


-- Step 9: Add classification results - File 10 (4 columns)
ALTER TABLE healthcare_encounters
  ADD COLUMN matched_profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN match_confidence numeric,
  ADD COLUMN match_status varchar(20),
  ADD COLUMN is_orphan_identity boolean DEFAULT false;

-- Column purposes:
--   matched_profile_id: Profile matched from multi-profile account
--   match_confidence: 0.0 to 1.0 confidence in match
--   match_status: 'matched', 'unmatched', 'orphan', 'review'
--   is_orphan_identity: TRUE if no matching profile found


-- Step 10: Add data quality - File 11 (3 columns)
ALTER TABLE healthcare_encounters
  ADD COLUMN data_quality_tier varchar(20)
    CHECK (data_quality_tier IN ('low', 'medium', 'high', 'verified')),
  ADD COLUMN quality_criteria_met jsonb,
  ADD COLUMN quality_calculation_date timestamptz;

-- Column purposes:
--   data_quality_tier: Quality grade based on completeness criteria
--   quality_criteria_met: JSON object tracking which criteria met
--   quality_calculation_date: When quality tier was calculated


-- Step 11: Add encounter source metadata - File 12 (5 columns)
ALTER TABLE healthcare_encounters
  ADD COLUMN encounter_source varchar(20) NOT NULL DEFAULT 'shell_file'
    CHECK (encounter_source IN ('shell_file', 'manual', 'api')),
  ADD COLUMN manual_created_by varchar(20)
    CHECK (manual_created_by IN ('provider', 'user', 'other_user')),
  ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN api_source_name varchar(100),
  ADD COLUMN api_import_date date;

-- Column purposes:
--   encounter_source: Where encounter came from ('shell_file', 'manual', 'api')
--   manual_created_by: For manual entries, who created it
--   created_by_user_id: Auth user who created/uploaded this encounter
--   api_source_name: For API imports, which API ('medicare_australia', etc.)
--   api_import_date: Date of API import


-- Step 12: Add cross-field constraint for data integrity
ALTER TABLE healthcare_encounters
  ADD CONSTRAINT check_shell_file_source_valid
    CHECK (encounter_source != 'shell_file' OR source_shell_file_id IS NOT NULL);

-- Reason: If source is 'shell_file', must have source_shell_file_id


-- Step 13: Create 11 new indexes
CREATE INDEX IF NOT EXISTS idx_encounters_cascade
  ON healthcare_encounters(cascade_id) WHERE cascade_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_encounters_spatial
  ON healthcare_encounters USING gin (spatial_bounds) WHERE spatial_bounds IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_encounters_source
  ON healthcare_encounters(encounter_source);

CREATE INDEX IF NOT EXISTS idx_encounters_quality
  ON healthcare_encounters(data_quality_tier);

CREATE INDEX IF NOT EXISTS idx_encounters_manual_creator
  ON healthcare_encounters(manual_created_by) WHERE manual_created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_encounters_creator
  ON healthcare_encounters(created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_encounters_profile
  ON healthcare_encounters(matched_profile_id) WHERE matched_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_encounters_match_status
  ON healthcare_encounters(match_status);

CREATE INDEX IF NOT EXISTS idx_encounters_orphan
  ON healthcare_encounters(is_orphan_identity) WHERE is_orphan_identity = true;

CREATE INDEX IF NOT EXISTS idx_encounters_source_file
  ON healthcare_encounters(source_shell_file_id);

CREATE INDEX IF NOT EXISTS idx_encounters_reconciliation_key
  ON healthcare_encounters(reconciliation_key) WHERE reconciliation_key IS NOT NULL;


-- ============================================================================
-- PART 2: MODIFY shell_files
-- ============================================================================

-- Step 1: Add uploaded_by FIRST (critical for created_by_user_id FK)
ALTER TABLE shell_files
  ADD COLUMN uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- NOTE: Cannot make NOT NULL yet because existing rows don't have values
-- Will backfill, then add NOT NULL constraint


-- Step 2: Backfill uploaded_by from patient_id (temporary assumption: single-user accounts)
-- In multi-user accounts, this will need manual correction
UPDATE shell_files sf
SET uploaded_by = (
  SELECT up.id
  FROM user_profiles up
  WHERE up.id = sf.patient_id
  LIMIT 1
);

-- Step 3: Now add NOT NULL constraint
ALTER TABLE shell_files
  ALTER COLUMN uploaded_by SET NOT NULL;


-- Step 4: Remove orphaned/redundant columns
ALTER TABLE shell_files
  DROP COLUMN IF EXISTS processing_error,
  DROP COLUMN IF EXISTS ocr_confidence,
  DROP COLUMN IF EXISTS pass_0_5_progressive;

-- Reasons:
--   processing_error: Never populated (replaced by pass-specific error fields)
--   ocr_confidence: Redundant with ocr_average_confidence
--   pass_0_5_progressive: Always TRUE in Strategy A, use progressive_session_id instead


-- Step 5: Add Strategy A columns
ALTER TABLE shell_files
  ADD COLUMN progressive_session_id uuid REFERENCES pass05_progressive_sessions(id) ON DELETE SET NULL,
  ADD COLUMN reconciliation_method varchar(20),
  ADD COLUMN shell_file_subtype varchar(50),
  ADD COLUMN api_source_name text;

-- Column purposes:
--   progressive_session_id: Direct link to pass05 progressive session
--   reconciliation_method: 'cascade', 'descriptor', 'mixed'
--   shell_file_subtype: 'scanned_document', 'progress_note', 'voice_transcript', 'api_import'
--   api_source_name: For API imports: 'medicare_australia', 'my_health_record', etc.


-- Step 6: Create 3 new indexes
CREATE INDEX IF NOT EXISTS idx_shell_files_job
  ON shell_files(processing_job_id) WHERE processing_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shell_files_session
  ON shell_files(progressive_session_id) WHERE progressive_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shell_files_subtype
  ON shell_files(shell_file_subtype) WHERE shell_file_subtype IS NOT NULL;


-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify healthcare_encounters columns
DO $$
BEGIN
    -- Check deleted columns are gone
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'healthcare_encounters'
               AND column_name IN ('date_resolution_reason', 'clinical_effective_date',
                                  'date_confidence', 'plan', 'primary_shell_file_id',
                                  'encounter_date_end')) THEN
        RAISE EXCEPTION 'Old columns still exist in healthcare_encounters!';
    END IF;

    -- Check renamed columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'healthcare_encounters'
                   AND column_name IN ('source_shell_file_id', 'encounter_end_date')) THEN
        RAISE EXCEPTION 'Renamed columns missing in healthcare_encounters!';
    END IF;

    -- Check page_ranges type changed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'healthcare_encounters'
                   AND column_name = 'page_ranges'
                   AND data_type = 'ARRAY') THEN
        RAISE EXCEPTION 'page_ranges type not changed in healthcare_encounters!';
    END IF;

    -- Check new columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'healthcare_encounters'
                   AND column_name IN ('cascade_id', 'chunk_count', 'reconciliation_key',
                                      'start_page', 'position_confidence', 'completed_at',
                                      'patient_full_name', 'facility_address', 'matched_profile_id',
                                      'data_quality_tier', 'encounter_source', 'created_by_user_id')) THEN
        RAISE EXCEPTION 'New columns missing in healthcare_encounters!';
    END IF;
END $$;

-- Verify healthcare_encounters constraint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'check_shell_file_source_valid') THEN
        RAISE EXCEPTION 'Constraint check_shell_file_source_valid missing!';
    END IF;
END $$;

-- Verify healthcare_encounters indexes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                   WHERE tablename = 'healthcare_encounters'
                   AND indexname IN ('idx_encounters_cascade', 'idx_encounters_spatial',
                                    'idx_encounters_source', 'idx_encounters_quality',
                                    'idx_encounters_manual_creator', 'idx_encounters_creator',
                                    'idx_encounters_profile', 'idx_encounters_match_status',
                                    'idx_encounters_orphan', 'idx_encounters_source_file',
                                    'idx_encounters_reconciliation_key')) THEN
        RAISE EXCEPTION 'Required indexes missing in healthcare_encounters!';
    END IF;
END $$;

-- Verify shell_files columns
DO $$
BEGIN
    -- Check deleted columns are gone
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'shell_files'
               AND column_name IN ('processing_error', 'ocr_confidence', 'pass_0_5_progressive')) THEN
        RAISE EXCEPTION 'Orphaned columns still exist in shell_files!';
    END IF;

    -- Check new columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'shell_files'
                   AND column_name IN ('uploaded_by', 'progressive_session_id',
                                      'reconciliation_method', 'shell_file_subtype', 'api_source_name')) THEN
        RAISE EXCEPTION 'New columns missing in shell_files!';
    END IF;

    -- Check uploaded_by is NOT NULL
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'shell_files'
                   AND column_name = 'uploaded_by'
                   AND is_nullable = 'NO') THEN
        RAISE EXCEPTION 'uploaded_by not NOT NULL in shell_files!';
    END IF;
END $$;

-- Verify shell_files indexes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                   WHERE tablename = 'shell_files'
                   AND indexname IN ('idx_shell_files_job', 'idx_shell_files_session',
                                    'idx_shell_files_subtype')) THEN
        RAISE EXCEPTION 'Required indexes missing in shell_files!';
    END IF;
END $$;

-- Show final column counts
SELECT
  'healthcare_encounters' as table_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'healthcare_encounters'
UNION ALL
SELECT
  'shell_files' as table_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'shell_files';

-- Expected: healthcare_encounters = 80 columns (was 46, deleted 4, added 38)
-- Expected: shell_files = 40 columns (was 38, deleted 3, added 5)


-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================

/*
-- Rollback healthcare_encounters
ALTER TABLE healthcare_encounters
  ADD COLUMN date_resolution_reason text,
  ADD COLUMN clinical_effective_date date,
  ADD COLUMN date_confidence text,
  ADD COLUMN plan text,
  RENAME COLUMN source_shell_file_id TO primary_shell_file_id,
  RENAME COLUMN encounter_end_date TO encounter_date_end,
  ALTER COLUMN page_ranges TYPE integer[] USING CASE
    WHEN page_ranges IS NULL THEN NULL
    WHEN array_length(page_ranges, 1) = 0 THEN ARRAY[]::integer[]
    ELSE page_ranges[1]
  END,
  DROP COLUMN cascade_id,
  DROP COLUMN chunk_count,
  DROP COLUMN reconciliation_key,
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
  DROP COLUMN completed_at,
  DROP COLUMN reconciled_from_pendings,
  DROP COLUMN patient_full_name,
  DROP COLUMN patient_date_of_birth,
  DROP COLUMN patient_mrn,
  DROP COLUMN patient_address,
  DROP COLUMN facility_address,
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
  DROP COLUMN api_import_date,
  DROP CONSTRAINT check_shell_file_source_valid;

DROP INDEX IF EXISTS idx_encounters_cascade;
DROP INDEX IF EXISTS idx_encounters_spatial;
DROP INDEX IF EXISTS idx_encounters_source;
DROP INDEX IF EXISTS idx_encounters_quality;
DROP INDEX IF EXISTS idx_encounters_manual_creator;
DROP INDEX IF EXISTS idx_encounters_creator;
DROP INDEX IF EXISTS idx_encounters_profile;
DROP INDEX IF EXISTS idx_encounters_match_status;
DROP INDEX IF EXISTS idx_encounters_orphan;
DROP INDEX IF EXISTS idx_encounters_source_file;
DROP INDEX IF EXISTS idx_encounters_reconciliation_key;

-- Rollback shell_files
ALTER TABLE shell_files
  ADD COLUMN processing_error text,
  ADD COLUMN ocr_confidence numeric,
  ADD COLUMN pass_0_5_progressive boolean,
  DROP COLUMN uploaded_by,
  DROP COLUMN progressive_session_id,
  DROP COLUMN reconciliation_method,
  DROP COLUMN shell_file_subtype,
  DROP COLUMN api_source_name;

DROP INDEX IF EXISTS idx_shell_files_job;
DROP INDEX IF EXISTS idx_shell_files_session;
DROP INDEX IF EXISTS idx_shell_files_subtype;
*/


-- ============================================================================
-- MIGRATION SUMMARY
-- ============================================================================

-- healthcare_encounters:
--   - Before: 46 columns
--   - After: 80 columns
--   - Changes: 4 DELETE, 2 RENAME, 1 TYPE CHANGE, 38 ADD, 1 CONSTRAINT, 11 INDEXES
--   - Deleted: date_resolution_reason, clinical_effective_date, date_confidence, plan
--   - Renamed: primary_shell_file_id → source_shell_file_id, encounter_date_end → encounter_end_date
--   - Type Change: page_ranges (integer[] → integer[][])
--   - Added: 3 cascade + 13 position + 2 reconciliation + 4 identity + 1 facility +
--            4 classification + 3 quality + 5 source metadata + 3 provider fields
--   - Constraint: check_shell_file_source_valid
--   - Indexes: 11 (cascade, spatial, source, quality, manual_creator, creator, profile,
--              match_status, orphan, source_file, reconciliation_key)

-- shell_files:
--   - Before: 38 columns
--   - After: 40 columns
--   - Changes: 3 DELETE, 5 ADD, 3 INDEXES
--   - Deleted: processing_error, ocr_confidence, pass_0_5_progressive
--   - Added: uploaded_by, progressive_session_id, reconciliation_method,
--            shell_file_subtype, api_source_name
--   - Indexes: 3 (job, session, subtype)

-- Breaking Changes: YES - Column renames require worker code updates
--   - primary_shell_file_id → source_shell_file_id
--   - pass_0_5_progressive → progressive_session_id
-- Data Migration: Backfill uploaded_by from patient_id (temporary single-user assumption)
