-- =============================================================================
-- ADD Pass-Specific Status Values to shell_files - Fix Worker Update Failures
-- =============================================================================
-- DATE: 2025-10-05
-- ISSUE: Worker fails to update shell_files.status to 'pass1_complete'
-- ERROR: new row for relation "shell_files" violates check constraint "shell_files_status_check"
--        Value 'pass1_complete' not in allowed status values
-- ROOT CAUSE: shell_files.status CHECK constraint only allows:
--             ('uploaded', 'processing', 'completed', 'failed', 'archived')
--             Worker tries to set 'pass1_complete' after Pass 1 entity detection
-- SYMPTOM: Pass 1 completes successfully (entities inserted, sessions created)
--          but shell_files.status remains 'uploaded' instead of 'pass1_complete'
-- DISCOVERY: Worker logs show "Failed to update shell_files" warnings (line 371 of worker.ts)
--            Jobs complete with status='completed' but shell_files not updated
-- SOURCE OF TRUTH: Updated in current_schema/03_clinical_core.sql (lines 108-110)
-- FIX: Add pass1_complete, pass2_complete, pass3_complete to status constraint
-- =============================================================================

-- Drop existing constraint
ALTER TABLE shell_files
DROP CONSTRAINT IF EXISTS shell_files_status_check;

-- Add new constraint with Pass 1/2/3 status values
ALTER TABLE shell_files
ADD CONSTRAINT shell_files_status_check
CHECK (status IN (
  'uploaded',        -- Initial upload state
  'processing',      -- Generic processing state
  'pass1_complete',  -- Pass 1 entity detection complete
  'pass2_complete',  -- Pass 2 clinical enrichment complete
  'pass3_complete',  -- Pass 3 narrative synthesis complete
  'completed',       -- All processing complete
  'failed',          -- Processing failed
  'archived'         -- File archived
));

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Verify constraint updated:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conname = 'shell_files_status_check';
--
-- Expected: CHECK constraint includes 'pass1_complete', 'pass2_complete', 'pass3_complete'
--
-- Test worker can now update status:
-- UPDATE shell_files
-- SET status = 'pass1_complete'
-- WHERE id = 'some-uuid'::uuid;
-- =============================================================================
