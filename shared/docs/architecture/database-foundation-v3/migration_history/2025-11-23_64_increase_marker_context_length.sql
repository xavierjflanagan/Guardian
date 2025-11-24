-- ============================================================================
-- Migration 64: Increase marker_context Field Length
-- Date: 2025-11-23
-- Issue: VARCHAR(100) too short for AI-generated marker context strings
--
-- NOTE: Migrations 61, 63, 64, 65, 67 missing from migration_history folder
-- but were executed. Migration numbering continues at 68.
--
-- PROBLEM:
-- - start_marker_context and end_marker_context are VARCHAR(100)
-- - AI prompt requests "10-20 chars" but AI frequently exceeds this
-- - 142-page document failed with: "value too long for type character varying(100)"
-- - Worker has no truncation logic - passes AI output directly to database
-- - Session: 03cf3457-b593-4491-8035-b5247e02f357 failed during batch insert
--
-- ROOT CAUSE:
-- - AI models don't strictly follow character limits in prompts
-- - Migration 52 set VARCHAR(100) assuming AI would comply with "10-20 chars"
-- - No validation or truncation in worker code (chunk-processor.ts)
--
-- SOLUTION:
-- - Increase VARCHAR(100) to VARCHAR(500) to accommodate AI variance
-- - 500 chars provides safety margin while still being reasonable constraint
-- - Alternative considered: TEXT type (unlimited) - rejected to maintain data quality
-- - Future: Add truncation logic in worker as defense-in-depth
--
-- AFFECTED COLUMNS:
-- - pass05_pending_encounters.start_marker_context
-- - pass05_pending_encounters.end_marker_context
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [x] current_schema/04_ai_processing.sql (Lines 1816, 1826: VARCHAR(100) → VARCHAR(500))
--
-- DOWNSTREAM UPDATES NEEDED:
--   [ ] None - TypeScript types already use string (no length constraint)
--   [ ] Worker code already passes values through (no changes needed)
--   [ ] Consider adding truncation in chunk-processor.ts for defense-in-depth
--
-- EXECUTION NOTES:
-- - Safe to run on production - ALTER COLUMN doesn't require table rewrite for length increase
-- - No data migration needed - existing data fits within new limit
-- - No index changes needed
--
-- ============================================================================

-- SCHEMA CHANGES
-- ============================================================================

-- Increase marker_context field lengths from VARCHAR(100) to VARCHAR(500)
ALTER TABLE pass05_pending_encounters
  ALTER COLUMN start_marker_context TYPE VARCHAR(500);

ALTER TABLE pass05_pending_encounters
  ALTER COLUMN end_marker_context TYPE VARCHAR(500);

-- Verification query (optional - run after migration)
-- SELECT
--   MAX(LENGTH(start_marker_context)) as max_start_len,
--   MAX(LENGTH(end_marker_context)) as max_end_len
-- FROM pass05_pending_encounters
-- WHERE start_marker_context IS NOT NULL OR end_marker_context IS NOT NULL;


-- MIGRATION STATUS
-- ============================================================================
-- Date Started: 2025-11-23
-- Date Completed: 2025-11-23
--
-- EXECUTION CHECKLIST:
--   [x] Execute DDL via mcp__supabase__apply_migration
--   [x] Update current_schema/04_ai_processing.sql (lines 1816, 1826)
--   [ ] Test with 142-page document that previously failed
--   [ ] Verify no other VARCHAR(100) constraints hit by large documents
--   [ ] Consider adding truncation logic to worker (defense-in-depth)
