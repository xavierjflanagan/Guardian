-- ============================================================================
-- Migration 46: Fix ai_processing_sessions RLS for service role access
-- Date: 2025-11-10
-- Issue: Pass 0.5 worker cannot create ai_processing_sessions (RLS blocks service role)
--
-- PROBLEM: RLS policy on ai_processing_sessions only allows 'authenticated' role
--          Service role has no auth.uid() context, so inserts fail silently
--          This causes FK constraint violations when writing pass05_encounter_metrics
--
-- SOLUTION: Add service role bypass to RLS policy for backend worker operations
--           Keep authenticated user restrictions for profile-based access
--
-- AFFECTED TABLES: ai_processing_sessions
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/04_ai_processing.sql (Lines 817-836: ai_sessions_access policy)
--
-- DOWNSTREAM UPDATES:
--   [X] None (RLS policy change only, no schema changes)
--
-- EXECUTION RECORD:
-- Executed: 2025-11-10 via Supabase MCP
-- Verified: Policy updated successfully
-- ============================================================================

-- ============================================================================
-- PROBLEM ANALYSIS
-- ============================================================================

-- Current RLS policy on ai_processing_sessions:
-- CREATE POLICY "ai_sessions_access" ON ai_processing_sessions
--   FOR ALL TO authenticated
--   USING (has_profile_access(auth.uid(), patient_id) OR is_admin());

-- Issue: Service role has no auth.uid(), so inserts fail silently
-- Impact: Pass 0.5 can't create sessions, metrics FK constraint fails

-- ============================================================================
-- FIX: Add service role bypass policy
-- ============================================================================

-- Ensure RLS is enabled (idempotent, defensive coding)
ALTER TABLE ai_processing_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policy (will recreate with service role support)
DROP POLICY IF EXISTS "ai_sessions_access" ON ai_processing_sessions;

-- Recreate policy with service role bypass
CREATE POLICY "ai_sessions_access" ON ai_processing_sessions
  FOR ALL
  USING (
    -- Service role: full access (backend worker needs to create sessions)
    coalesce((current_setting('request.jwt.claims', true)::jsonb->>'role')::text, '') = 'service_role'
    OR
    -- Authenticated users: access via profile ownership or admin
    (auth.role() = 'authenticated' AND (has_profile_access(auth.uid(), patient_id) OR is_admin()))
  )
  WITH CHECK (
    -- Service role: full access for inserts
    coalesce((current_setting('request.jwt.claims', true)::jsonb->>'role')::text, '') = 'service_role'
    OR
    -- Authenticated users: can insert for their own profiles or if admin
    (auth.role() = 'authenticated' AND (has_profile_access(auth.uid(), patient_id) OR is_admin()))
  );

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- After migration, verify policy exists:
-- SELECT * FROM pg_policies WHERE tablename = 'ai_processing_sessions';

-- Test service role can insert:
-- INSERT INTO ai_processing_sessions (shell_file_id, patient_id, session_type, session_status)
-- VALUES (
--   '00000000-0000-0000-0000-000000000000',
--   '00000000-0000-0000-0000-000000000000',
--   'shell_file_processing', -- Valid session_type (must match CHECK constraint)
--   'completed'
-- );
-- DELETE FROM ai_processing_sessions WHERE session_type = 'shell_file_processing' AND shell_file_id = '00000000-0000-0000-0000-000000000000';

COMMENT ON TABLE ai_processing_sessions IS
  'AI processing session tracking. RLS allows service role full access for worker operations, authenticated users access via profile ownership.';
