-- ============================================================================
-- Migration: Fix Single-Page Document Constraint Failure
-- Date: 2025-11-24
-- Issue: Single-page documents fail with constraint violation on pass05_chunk_results
--
-- PROBLEM:
--   Constraint CHECK (page_end > page_start) rejects single-page documents where
--   page_start = page_end = 1 (e.g., single HEIC image upload).
--
--   Code uses 1-based inclusive ranges: pageStart = startIdx + 1, pageEnd = endIdx
--   For 1-page document: pageStart = 1, pageEnd = 1 (same value)
--   Constraint check: 1 > 1 = FALSE ❌
--
-- ROOT CAUSE:
--   1. Constraint expects exclusive ranges (page_end > page_start)
--   2. Code uses inclusive ranges (page_end can equal page_start for single page)
--   3. Schema comments incorrectly say "0-based" when code is 1-based
--
-- EVIDENCE:
--   Error: "new row for relation "pass05_chunk_results" violates check constraint "pass05_chunk_results_check""
--   session-manager.ts:93-94: pageStart = startIdx + 1, pageEnd = endIdx
--   Existing data shows 1-based ranges: page_start=1 for first chunk
--
-- SOLUTION:
--   1. Change constraint from page_end > page_start to page_end >= page_start
--   2. Fix schema comments from "0-based" to "1-based inclusive"
--   3. Document duplicate schema definition issue
--
-- AFFECTED TABLES: pass05_chunk_results
-- AFFECTED CONSTRAINTS: pass05_chunk_results_check, page_start check, page_end check
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/08_job_coordination.sql (Lines 342-343: constraint + comments)
--
-- DOWNSTREAM UPDATES:
--   [X] current_schema/04_ai_processing.sql (Add comment about duplicate definition)
--
-- EXECUTED: 2025-11-24 via mcp__supabase__apply_migration
--
-- NOTES:
--   - Schema is duplicated in 04_ai_processing.sql:1716 and 08_job_coordination.sql:337
--   - 08_job_coordination.sql is the canonical definition (has more columns)
--   - This migration only fixes the active constraint in the database
-- ============================================================================

BEGIN;

-- Part 1: Drop existing constraint
ALTER TABLE pass05_chunk_results
DROP CONSTRAINT IF EXISTS pass05_chunk_results_check;

-- Part 2: Add corrected constraint (>= instead of >)
ALTER TABLE pass05_chunk_results
ADD CONSTRAINT pass05_chunk_results_check
CHECK (page_end >= page_start);

COMMENT ON CONSTRAINT pass05_chunk_results_check ON pass05_chunk_results IS
  'Migration 66: Allow single-page documents (page_end >= page_start).
   Ranges are 1-based inclusive: page 1 has page_start=1, page_end=1.';

-- Part 3: Update column-level constraints with corrected comments
-- Note: Cannot modify inline constraint comments without recreating table,
--       so we just add table-level comment for documentation

COMMENT ON COLUMN pass05_chunk_results.page_start IS
  'Migration 66: 1-based inclusive page number where chunk starts (not 0-based as originally commented)';

COMMENT ON COLUMN pass05_chunk_results.page_end IS
  'Migration 66: 1-based inclusive page number where chunk ends (not 0-based exclusive as originally commented)';

COMMIT;

-- Verification Queries
-- ============================================================================

-- Verify constraint updated
SELECT conname, pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'pass05_chunk_results'::regclass
  AND conname = 'pass05_chunk_results_check';
-- Expected: CHECK ((page_end >= page_start))

-- Verify existing data still valid
SELECT
  COUNT(*) as total_chunks,
  MIN(page_end - page_start) as min_range,
  MAX(page_end - page_start) as max_range
FROM pass05_chunk_results;
-- Expected: min_range >= 0 (was previously >= 1)

-- Test insert of single-page chunk (should now succeed)
DO $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Create temporary test session
  INSERT INTO pass05_progressive_sessions (
    shell_file_id,
    patient_id,
    total_pages,
    total_chunks,
    chunk_size,
    session_status
  )
  SELECT
    id,
    patient_id,
    1,  -- Single page
    1,  -- Single chunk
    50,
    'completed'
  FROM shell_files
  LIMIT 1
  RETURNING id INTO v_session_id;

  -- Test single-page chunk insert
  INSERT INTO pass05_chunk_results (
    session_id,
    chunk_number,
    page_start,
    page_end,
    processing_status
  ) VALUES (
    v_session_id,
    1,
    1,  -- Same as page_end
    1,  -- Same as page_start
    'completed'
  );

  RAISE NOTICE 'Single-page chunk insert successful!';

  -- Cleanup
  DELETE FROM pass05_progressive_sessions WHERE id = v_session_id;
END $$;

-- Rollback Script (if needed)
-- ============================================================================
/*
BEGIN;

-- Revert to original constraint
ALTER TABLE pass05_chunk_results
DROP CONSTRAINT IF EXISTS pass05_chunk_results_check;

ALTER TABLE pass05_chunk_results
ADD CONSTRAINT pass05_chunk_results_check
CHECK (page_end > page_start);

-- Remove comments
COMMENT ON CONSTRAINT pass05_chunk_results_check ON pass05_chunk_results IS NULL;
COMMENT ON COLUMN pass05_chunk_results.page_start IS NULL;
COMMENT ON COLUMN pass05_chunk_results.page_end IS NULL;

COMMIT;
*/
