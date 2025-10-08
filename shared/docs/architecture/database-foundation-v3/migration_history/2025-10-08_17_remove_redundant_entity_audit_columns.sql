-- ============================================================================
-- Migration: Remove Redundant Columns from entity_processing_audit
-- Date: 2025-10-08
-- Migration Number: 17
-- Issue: Redundant session-level data duplicated across all entities
--
-- PROBLEM:
--   Three columns in entity_processing_audit duplicate session-level metrics:
--   - pass1_token_usage: Same value for all 40+ entities in a session
--   - pass1_image_tokens: Deprecated field (always 0 after OpenAI API change)
--   - pass1_cost_estimate: Same value for all entities, should be calculated on-demand
--
--   Impact: 120 redundant fields per 40-entity document (3 columns × 40 entities)
--   Combined with migration 16: 200 total redundant fields eliminated
--
-- SOLUTION:
--   Drop these 3 columns from entity_processing_audit.
--   Session-level metrics available via JOIN to pass1_entity_metrics table.
--
-- PREVIOUS CLEANUP (Migration 16):
--   ✅ Already dropped: pass1_model_used, pass1_vision_processing
--
-- AFFECTED TABLE:
--   - entity_processing_audit (Pass 1 entity detection audit trail)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   ✅ current_schema/04_ai_processing.sql (lines 201-209)
--      - Lines 204-206: Three REMOVED comments added for pass1_token_usage,
--        pass1_image_tokens, pass1_cost_estimate
--      - Session-level metrics now exclusively via JOIN to pass1_entity_metrics
--
-- DEPENDENCY CHECK (2025-10-08):
--   ✅ No views reference these columns
--   ✅ No foreign key constraints
--   ✅ No indexes on these columns
--   ✅ No database functions reference them
--   ✅ Code writes to these columns but never reads them
--
-- CODE CHANGES REQUIRED:
--   ✅ apps/render-worker/src/pass1/pass1-translation.ts (lines 96-98)
--      - Remove writes to pass1_token_usage, pass1_image_tokens, pass1_cost_estimate
--   ✅ apps/render-worker/src/pass1/pass1-types.ts (lines 244-246)
--      - Remove fields from EntityAuditRecord interface
--
-- MIGRATION STRATEGY:
--   Step 1: Update code to stop writing to columns (non-breaking) ✅ Deploy first
--   Step 2: Wait 24-48 hours for validation
--   Step 3: Run this migration to drop columns ✅ Execute after code deployed
--   Step 4: Clean up type definitions (remove optional fields)
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop Redundant Columns
-- ============================================================================
-- These columns duplicate session-level data already in pass1_entity_metrics
-- Safe to drop after code changes deployed (columns are nullable, never read)

ALTER TABLE entity_processing_audit
  DROP COLUMN IF EXISTS pass1_token_usage,
  DROP COLUMN IF EXISTS pass1_image_tokens,
  DROP COLUMN IF EXISTS pass1_cost_estimate;

-- Update table comment to reflect cleanup
COMMENT ON TABLE entity_processing_audit IS
  'Per-entity audit trail for Pass 1 detection. Session-level metrics (tokens, cost, model) via JOIN to pass1_entity_metrics.';

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify columns were dropped
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'entity_processing_audit'
-- AND column_name IN ('pass1_token_usage', 'pass1_image_tokens', 'pass1_cost_estimate');
-- -- Expected: Empty result (0 rows)

-- Test JOIN pattern to access session-level metrics
-- SELECT
--   e.entity_id,
--   e.original_text,
--   m.total_tokens,           -- Replaces pass1_token_usage
--   m.input_tokens,           -- New breakdown field (migration 15)
--   m.output_tokens,          -- New breakdown field (migration 15)
--   (m.input_tokens / 1000000.0 * 2.50) +
--   (m.output_tokens / 1000000.0 * 10.00) as cost_usd  -- On-demand calculation
-- FROM entity_processing_audit e
-- JOIN pass1_entity_metrics m ON m.shell_file_id = e.shell_file_id
-- WHERE e.shell_file_id = 'test-file-id'
-- LIMIT 5;

-- ============================================================================
-- Rollback Script (If Needed)
-- ============================================================================
-- Execute if migration needs to be reverted (restore columns with NULL values)

/*
ALTER TABLE entity_processing_audit
  ADD COLUMN pass1_token_usage INTEGER,
  ADD COLUMN pass1_image_tokens INTEGER,
  ADD COLUMN pass1_cost_estimate NUMERIC(10, 6);

COMMENT ON COLUMN entity_processing_audit.pass1_token_usage IS
  'DEPRECATED: Session-level data, use JOIN to pass1_entity_metrics.total_tokens';
COMMENT ON COLUMN entity_processing_audit.pass1_image_tokens IS
  'DEPRECATED: Always 0 after OpenAI API change, not needed';
COMMENT ON COLUMN entity_processing_audit.pass1_cost_estimate IS
  'DEPRECATED: Calculate on-demand from token breakdown in pass1_entity_metrics';
*/

-- ============================================================================
-- Post-Migration Impact
-- ============================================================================
-- Database Savings:
--   - 120 fields per 40-entity document eliminated
--   - Combined with migration 16: 200 total redundant fields eliminated
--   - Cleaner architecture: Single source of truth in pass1_entity_metrics
--
-- Query Pattern:
--   Always JOIN to pass1_entity_metrics when session-level metrics needed:
--   - Token counts: input_tokens, output_tokens, total_tokens
--   - Model info: model_used, vision_processing
--   - Cost: Calculate on-demand from token breakdown (4x output cost premium)
--
-- Code Cleanup Required:
--   See: shared/docs/architecture/database-foundation-v3/ai-processing-v3/
--        implementation-planning/pass-1-entity-detection/pass1-audits/
--        entity_processing_audit-COLUMN-AUDIT-ANSWERS.md
-- ============================================================================
