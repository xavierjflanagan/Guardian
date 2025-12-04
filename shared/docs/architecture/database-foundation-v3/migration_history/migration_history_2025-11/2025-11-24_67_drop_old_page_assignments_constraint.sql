-- Migration 67: Drop Old Page Assignments Constraint
-- Created: 2025-11-24
-- Author: Claude Code + Xavier Flanagan
-- Purpose: Remove conflicting UNIQUE constraint that blocks Strategy A multi-pending assignments
--
-- Issue: Production has two UNIQUE constraints on pass05_page_assignments:
--   1. pass05_page_assignments_shell_file_id_page_num_key UNIQUE (shell_file_id, page_num) - OLD/INCORRECT
--   2. uq_page_per_pending UNIQUE (shell_file_id, page_num, pending_id) - NEW/CORRECT (Migration 49)
--
-- The old constraint prevents Strategy A from assigning multiple pending encounters
-- to the same page (needed for cascade chains). Migration 49 added the correct constraint
-- but failed to drop the old one.
--
-- Error encountered:
--   "duplicate key value violates unique constraint 'pass05_page_assignments_shell_file_id_page_num_key'"
--
-- Test case: 5-page document with multiple pending encounters assigned to same pages
--
-- ============================================================================
-- EXECUTION CHECKLIST
-- ============================================================================
-- PRE-EXECUTION:
-- [X] 1. Read this entire migration file
-- [X] 2. Verify current constraints (in public schema):
--        SELECT conname, pg_get_constraintdef(c.oid)
--        FROM pg_constraint c
--        JOIN pg_class t ON c.conrelid = t.oid
--        JOIN pg_namespace n ON t.relnamespace = n.oid
--        WHERE t.relname = 'pass05_page_assignments'
--          AND n.nspname = 'public'
--          AND contype = 'u';
-- [X] 3. Confirm both constraints exist (old + new)
-- [X] 4. Rabbit hunt completed (no blocking issues found)
--
-- EXECUTION:
-- [X] 5. Apply migration via Supabase MCP: mcp__supabase__apply_migration
-- [X] 6. Verify old constraint dropped
-- [X] 7. Verify uq_page_per_pending still exists
--
-- POST-EXECUTION:
-- [X] 8. Update current_schema/04_ai_processing.sql (added Migration 67 note to table comment)
-- [ ] 9. Test with 5-page document (should succeed now)
-- [X] 10. Mark this migration complete with execution date
--
-- ============================================================================

BEGIN;

-- Drop the old conflicting constraint (public schema)
-- This constraint was created before Strategy A and doesn't support multiple pending assignments per page
ALTER TABLE public.pass05_page_assignments
DROP CONSTRAINT IF EXISTS pass05_page_assignments_shell_file_id_page_num_key;

-- Verify the correct constraint still exists in public schema (Migration 49)
-- Expected: uq_page_per_pending UNIQUE (shell_file_id, page_num, pending_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE t.relname = 'pass05_page_assignments'
      AND n.nspname = 'public'
      AND c.conname = 'uq_page_per_pending'
      AND contype = 'u'
  ) THEN
    RAISE EXCEPTION 'Migration 67 verification failed: uq_page_per_pending constraint missing';
  END IF;
END $$;

-- Add comment documenting the fix (preserves existing comment + adds migration note)
COMMENT ON TABLE pass05_page_assignments IS
  'Maps pages to encounters (pending during chunking, final after reconciliation).
   Migration 49: Strategy A dual-ID tracking - pending_id during processing, encounter_id after reconciliation.
   Migration 67: Dropped old UNIQUE (shell_file_id, page_num) constraint that blocked cascade chains.
   Correct constraint: uq_page_per_pending UNIQUE (shell_file_id, page_num, pending_id).';

COMMIT;

-- ============================================================================
-- POST-EXECUTION VERIFICATION QUERIES
-- ============================================================================

-- Verify old constraint is gone and new constraint exists (public schema):
-- SELECT conname, pg_get_constraintdef(c.oid)
-- FROM pg_constraint c
-- JOIN pg_class t ON c.conrelid = t.oid
-- JOIN pg_namespace n ON t.relnamespace = n.oid
-- WHERE t.relname = 'pass05_page_assignments'
--   AND n.nspname = 'public'
--   AND contype = 'u';
--
-- Expected result:
--   conname: uq_page_per_pending
--   definition: UNIQUE (shell_file_id, page_num, pending_id)
--
-- Should NOT see:
--   conname: pass05_page_assignments_shell_file_id_page_num_key

-- ============================================================================
-- EXECUTION LOG
-- ============================================================================
-- Executed: 2025-11-24
-- Executed by: Claude Code + Xavier Flanagan
-- Result: [X] Success
-- Verification: [X] Old constraint dropped / [X] New constraint exists
-- Test result: [ ] 5-page document processed successfully (pending retest)
