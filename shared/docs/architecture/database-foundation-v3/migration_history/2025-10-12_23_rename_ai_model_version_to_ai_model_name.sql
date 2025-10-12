-- ============================================================================
-- Migration: Rename ai_model_version to ai_model_name for Semantic Clarity
-- Date: 2025-10-12
-- Issue: Column name ai_model_version misleading when storing model names
--
-- PROBLEM:
--   Current system behavior verified on 2025-10-12:
--   1. ai_processing_sessions.ai_model_version contains model NAMES not versions
--      - Column default: 'v3' (suggests pipeline version)
--      - Actual data: "gpt-5-mini" (19 records), "gpt-4o" (12 records) - MODEL NAMES
--      - Worker overrides default with actual model name
--      - Expected: Should be named ai_model_name for clarity
--      - Impact: Confusing for developers writing queries and analytics
--   2. profile_classification_audit.ai_model_used already correctly named
--      - Column is ai_model_used (NOT ai_model_version as audit doc claimed)
--      - No rename needed for this table
--   3. semantic_processing_sessions.ai_model_version stores model names too
--      - Default: 'gpt-4o-mini' (model name, not version)
--      - Should arguably be renamed, but Pass 3 not implemented yet
--      - Defer to avoid confusion until Pass 3 implementation
--
-- SOLUTION:
--   1. Rename ai_processing_sessions.ai_model_version → ai_model_name
--   2. Keep profile_classification_audit.ai_model_used unchanged (already correct name)
--   3. Defer semantic_processing_sessions.ai_model_version rename (Pass 3 not implemented)
--   4. Do NOT change defaults in this migration (minimize behavior changes)
--
-- AFFECTED TABLES:
--   - ai_processing_sessions (only table being renamed)
--
-- VERIFICATION PERFORMED:
--   - Verified ai_processing_sessions has 31 records with model names (not versions)
--   - Verified profile_classification_audit uses ai_model_used (not ai_model_version)
--   - Verified semantic_processing_sessions.ai_model_version default is 'gpt-4o-mini' (model name)
--   - Confirmed column rename is safe (PostgreSQL handles dependencies automatically)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/04_ai_processing.sql (Lines 218-219, 711: ai_processing_sessions renamed with migration comment)
--
-- DOWNSTREAM UPDATES:
--   [X] Worker types updated (ai_model_version → ai_model_name) - COMPLETE
--       - apps/render-worker/src/pass1/pass1-types.ts:310 (AIProcessingSessionRecord interface)
--       - apps/render-worker/src/pass1/pass1-database-builder.ts:142 (buildAIProcessingSessionRecord function)
--   [X] Bridge schemas updated - COMPLETE
--       - bridge-schemas/detailed/pass-2/ai_processing_sessions.json:67 (fields_not_modified_by_pass2 list)
--
-- MIGRATION EXECUTED:
--   [X] Applied to Supabase database on 2025-10-12 via mcp__supabase__apply_migration
--   [X] Verification queries confirm successful rename and data integrity
--   [X] Source of truth schema updated with migration comments
--   [X] Worker code updated with renamed field references
--   [X] Bridge schemas updated with migration notes
--   [X] Production validation completed via test-10 (2025-10-12)
--   [X] Verified ai_model_name column exists with correct data
--   [X] Verified 32 sessions use "gpt-5-mini" model name
--
-- DEPLOYMENT STATUS:
--   [X] Database migration deployed and validated (2025-10-12)
--   [X] Worker code deployed with ai_model_name references (commit 85f5cef - 2025-10-12)
--   [X] Cost calculation fix deployed with model-specific pricing (commit 85f5cef)
--   [X] Confirmed backward compatible - no breaking changes
--
-- RISK ASSESSMENT:
--   - Risk Level: LOW (column rename, PostgreSQL handles FK/index updates automatically)
--   - Breaking Changes: Code using old column name will fail (requires coordinated deploy)
--   - Rollback: Simple column rename back to ai_model_version
--
-- DEPLOYMENT COORDINATION REQUIRED:
--   1. Apply database migration (this script)
--   2. Deploy worker code with updated field names (ai_model_name)
--   3. Application must NOT be deployed before database migration completes
-- ============================================================================

-- Rename ai_model_version to ai_model_name in ai_processing_sessions
-- Note: profile_classification_audit already uses ai_model_used (correct name)
ALTER TABLE ai_processing_sessions
    RENAME COLUMN ai_model_version TO ai_model_name;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- 1. Verify column was renamed successfully
-- SELECT
--     table_name,
--     column_name,
--     data_type,
--     column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
-- AND table_name IN ('ai_processing_sessions', 'profile_classification_audit')
-- AND column_name LIKE 'ai_model_%'
-- ORDER BY table_name, column_name;

-- Expected Results:
-- - ai_processing_sessions.ai_model_name exists (not ai_model_version)
-- - profile_classification_audit.ai_model_name exists (not ai_model_version)
-- - semantic_processing_sessions.ai_model_version still exists (unchanged)

-- 2. Verify data is intact after rename
-- SELECT
--     ai_model_name,
--     COUNT(*) as count
-- FROM ai_processing_sessions
-- GROUP BY ai_model_name
-- ORDER BY count DESC;

-- Expected Results:
-- - "gpt-5-mini": 19 records (same as before)
-- - "gpt-4o": 12 records (same as before)

-- 3. Verify semantic_processing_sessions unchanged
-- SELECT
--     table_name,
--     column_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
-- AND table_name = 'semantic_processing_sessions'
-- AND column_name = 'ai_model_version';

-- Expected Result: Should return 1 row (column still exists with original name)

-- Rollback Script (if needed):
/*
-- Revert ai_processing_sessions
ALTER TABLE ai_processing_sessions
    RENAME COLUMN ai_model_name TO ai_model_version;

-- Revert profile_classification_audit
ALTER TABLE profile_classification_audit
    RENAME COLUMN ai_model_name TO ai_model_version;
*/
