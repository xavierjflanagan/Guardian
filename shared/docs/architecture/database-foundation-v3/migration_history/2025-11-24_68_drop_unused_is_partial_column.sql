-- ============================================================================
-- Migration 68: Drop Unused is_partial Column from pass05_page_assignments
-- Date: 2025-11-24
-- Author: Claude Code + Xavier Flanagan
-- Purpose: Remove unused is_partial column that serves no documented purpose
--
-- Issue: The is_partial boolean column in pass05_page_assignments is:
--   1. Never populated correctly (always FALSE even for multi-encounter pages)
--   2. Not referenced by any queries, RPCs, or downstream systems
--   3. Not used in Pass 1, Pass 2, batching logic, or UI
--   4. Can be calculated on-demand if ever needed: COUNT(*) > 1 GROUP BY page_num
--   5. Vestige from earlier design iteration (replaced 5-position system)
--
-- The column definition states "TRUE if page is shared with other encounters"
-- but in production, pages with 2-3 encounters all show is_partial = FALSE.
--
-- Cost of keeping: ~30 lines of code to populate + reconciliation updates
-- Benefit: Zero (no documented use case)
--
-- ============================================================================
-- EXECUTION CHECKLIST
-- ============================================================================
-- PRE-EXECUTION:
-- [X] 1. Read this entire migration file
-- [X] 2. Verify column exists in pass05_page_assignments:
--        SELECT column_name, data_type
--        FROM information_schema.columns
--        WHERE table_schema = 'public'
--          AND table_name = 'pass05_page_assignments'
--          AND column_name = 'is_partial';
-- [X] 3. Verify column is not referenced in any code (already confirmed)
-- [X] 4. Check no critical queries depend on this column
--
-- EXECUTION:
-- [X] 5. Apply migration via Supabase MCP: mcp__supabase__apply_migration
-- [X] 6. Verify column dropped successfully
--
-- POST-EXECUTION:
-- [X] 7. Update current_schema/04_ai_processing.sql (remove column from schema)
-- [X] 8. No worker code changes needed (column not used)
-- [X] 9. Mark this migration complete with execution date
--
-- ============================================================================

BEGIN;

-- Drop the unused is_partial column from pass05_page_assignments
ALTER TABLE public.pass05_page_assignments
DROP COLUMN IF EXISTS is_partial;

-- Verify the column is gone
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pass05_page_assignments'
      AND column_name = 'is_partial'
  ) THEN
    RAISE EXCEPTION 'Migration 68 verification failed: is_partial column still exists';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- POST-EXECUTION VERIFICATION QUERIES
-- ============================================================================

-- Verify column is gone:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'pass05_page_assignments'
-- ORDER BY ordinal_position;
--
-- Expected: is_partial should NOT appear in column list

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================

/*
-- Add column back (though not recommended since it was never used)
ALTER TABLE public.pass05_page_assignments
  ADD COLUMN is_partial boolean DEFAULT false;

COMMENT ON COLUMN public.pass05_page_assignments.is_partial IS
  'DEPRECATED: Column was never used or populated. Can calculate on-demand if needed.';
*/

-- ============================================================================
-- EXECUTION LOG
-- ============================================================================
-- Executed: 2025-11-24
-- Executed by: Claude Code + Xavier Flanagan
-- Result: [X] Success
-- Verification: [X] Column dropped successfully
-- Note: This column was never populated or used in production

-- ============================================================================
-- DESIGN RATIONALE
-- ============================================================================
-- The is_partial column was added in Migration 49 as part of Strategy A
-- implementation, intended to mark pages with multiple encounters.
--
-- However, analysis shows:
-- 1. Worker code (database.ts:562-572) never sets this field
-- 2. No queries in codebase reference this column
-- 3. No downstream systems (Pass 1, Pass 2) use this data
-- 4. Can be calculated on-demand: SELECT page_num, COUNT(*) > 1 as is_partial
--    FROM pass05_page_assignments GROUP BY page_num;
-- 5. Documentation search found zero use cases
--
-- The field appears to be a vestige from an earlier design where it replaced
-- a 5-position system. Current design uses precise boundary coordinates
-- (start_y, end_y) instead.
--
-- Maintenance cost of keeping an unused field outweighs any hypothetical
-- future value. If needed, can be reintroduced with proper implementation.
