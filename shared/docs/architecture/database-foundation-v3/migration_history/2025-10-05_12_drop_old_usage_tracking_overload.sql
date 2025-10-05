-- =============================================================================
-- DROP OLD track_shell_file_upload_usage OVERLOAD - Remove function ambiguity
-- =============================================================================
-- DATE: 2025-10-05
-- ISSUE: Two versions of track_shell_file_upload_usage exist (4-param and 5-param)
--        causing PostgreSQL function resolution ambiguity
-- ERROR: Could not choose the best candidate function between [4-param] and [5-param]
-- ROOT CAUSE: CREATE OR REPLACE only replaces exact signature matches.
--             Migration 2025-10-05_11 added 5th parameter, creating overload instead of replacing
-- SOURCE OF TRUTH: Only 5-param version in current_schema/08_job_coordination.sql (lines 859-941)
-- FIX: Drop old 4-parameter version, keep only new 5-parameter version
-- =============================================================================

-- Drop the old 4-parameter version (uses exact signature for precision)
DROP FUNCTION IF EXISTS track_shell_file_upload_usage(
    p_profile_id UUID,
    p_shell_file_id UUID,
    p_file_size_bytes BIGINT,
    p_estimated_pages INTEGER
);

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Verify only one version exists (should return 1 row with 5 parameters):
-- SELECT proname, pronargs, pg_get_function_arguments(oid)
-- FROM pg_proc
-- WHERE proname = 'track_shell_file_upload_usage';
--
-- Expected result:
-- proname: track_shell_file_upload_usage
-- pronargs: 5
-- pg_get_function_arguments: p_profile_id uuid, p_shell_file_id uuid,
--                            p_file_size_bytes bigint, p_estimated_pages integer,
--                            p_user_id uuid
-- =============================================================================
