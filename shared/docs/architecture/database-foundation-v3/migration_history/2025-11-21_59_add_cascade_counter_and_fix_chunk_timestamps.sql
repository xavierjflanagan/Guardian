-- ============================================================================
-- Migration: Add Cascade Counter RPC and Fix Chunk Timestamps
-- Date: 2025-11-21
-- Issue: Post-Migration 57 Data Quality Issues (#4, #5, #6)
--
-- PROBLEM:
--   1. pass05_progressive_sessions.total_cascades always 0 (should reflect cascade count)
--   2. pass05_chunk_results.started_at and completed_at are NULL
--   3. pass05_progressive_sessions.started_at and completed_at are NULL
--
-- SOLUTION:
--   Part 1: Create increment_session_total_cascades RPC for atomic counter updates
--   Part 2: No SQL changes needed for timestamps - TypeScript fix only
--
-- AFFECTED TABLES:
--   - pass05_progressive_sessions (adds cascade counter mechanism)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/08_job_coordination.sql (Lines 869-893: increment_session_total_cascades RPC)
--
-- DOWNSTREAM UPDATES:
--   [X] TypeScript: chunk-processor.ts (call increment RPC when cascade created)
--   [X] TypeScript: chunk-processor.ts (add timestamp capture for chunk results)
--   [X] TypeScript: database.ts (add startedAt/completedAt to saveChunkResults signature)
--   [N/A] TypeScript: progressive-session management (deferred - session timestamps need session-manager.ts investigation)
--
-- EXECUTED: 2025-11-21
-- ============================================================================

-- PART 1: Create RPC for atomic cascade counter increments
-- This RPC safely increments total_cascades in pass05_progressive_sessions
-- Called by chunk-processor.ts when a new cascade is created (not continuation)

CREATE OR REPLACE FUNCTION increment_session_total_cascades(
  p_session_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  -- Atomically increment total_cascades
  UPDATE pass05_progressive_sessions
  SET total_cascades = total_cascades + 1
  WHERE id = p_session_id
  RETURNING total_cascades INTO v_new_count;

  IF v_new_count IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  RETURN v_new_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_session_total_cascades IS
  'Migration 59: Atomically increments total_cascades counter in pass05_progressive_sessions.
   Called by chunk-processor.ts when a new cascade is created (encounters with is_cascading=true).
   Returns the new total_cascades value after increment.
   See STRATEGY-A-DATA-QUALITY-AUDIT.md Issue #4 for details.';


-- PART 2: Timestamp fixes are TypeScript-only (no SQL changes needed)
-- The following columns already exist and just need to be populated:
--   - pass05_chunk_results.started_at (set when chunk processing begins)
--   - pass05_chunk_results.completed_at (set when chunk processing completes)
--   - pass05_progressive_sessions.started_at (set when session starts)
--   - pass05_progressive_sessions.completed_at (set when reconciliation completes)

-- Verification Queries

-- Query 1: Check total_cascades after next document upload
-- SELECT id, shell_file_id, total_cascades, strategy_version
-- FROM pass05_progressive_sessions
-- ORDER BY created_at DESC LIMIT 1;

-- Query 2: Check chunk timestamps after next document upload
-- SELECT session_id, chunk_number, started_at, completed_at,
--        EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_seconds
-- FROM pass05_chunk_results
-- ORDER BY started_at DESC LIMIT 5;

-- Query 3: Check session timestamps after next document upload
-- SELECT id, shell_file_id, started_at, completed_at, reconciliation_completed_at,
--        EXTRACT(EPOCH FROM (completed_at - started_at)) as total_duration_seconds
-- FROM pass05_progressive_sessions
-- ORDER BY created_at DESC LIMIT 1;

-- Rollback Script (if needed)
-- DROP FUNCTION IF EXISTS increment_session_total_cascades(UUID);
