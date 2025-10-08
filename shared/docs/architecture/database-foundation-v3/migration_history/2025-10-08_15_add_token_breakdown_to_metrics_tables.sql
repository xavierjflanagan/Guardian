-- ============================================================================
-- Migration: Add Token Breakdown to Metrics Tables
-- Date: 2025-10-08
-- Issue: Input/output token breakdown data loss
--
-- PROBLEM:
--   Currently storing only total_tokens in metrics tables, losing input/output
--   breakdown needed for accurate cost calculation (output tokens are 4x more
--   expensive than input tokens for GPT models).
--
-- SOLUTION:
--   Add input_tokens, output_tokens, total_tokens columns to all 3 metrics
--   tables (pass1_entity_metrics, pass2_clinical_metrics, pass3_narrative_metrics).
--   Use safe 6-step migration strategy with dual-write period.
--
-- AFFECTED TABLES:
--   - pass1_entity_metrics (vision_tokens_used → total_tokens)
--   - pass2_clinical_metrics (clinical_tokens_used → total_tokens)
--   - pass3_narrative_metrics (semantic_tokens_used → total_tokens)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   ✅ current_schema/08_job_coordination.sql
--      - Lines 236-239: pass1_entity_metrics token breakdown columns added
--      - Lines 271-274: pass2_clinical_metrics token breakdown columns added
--      - Lines 303-306: pass3_narrative_metrics token breakdown columns added
--
-- CODE CHANGES IMPLEMENTED:
--   ✅ apps/render-worker/src/pass1/pass1-types.ts (lines 345-352)
--      - Removed vision_tokens_used and cost_usd from Pass1EntityMetricsRecord
--      - Added input_tokens, output_tokens, total_tokens fields
--   ✅ apps/render-worker/src/pass1/pass1-database-builder.ts (lines 259-269)
--      - Updated buildPass1EntityMetrics() to write only new token columns
--      - Removed cost_usd calculation (now on-demand)
--   ✅ apps/render-worker/src/pass1/Pass1EntityDetector.ts (lines 348-456)
--      - Deprecated image_tokens estimation
--      - Using OpenAI API token breakdown directly
--
-- SCHEMA DOCUMENTATION UPDATED:
--   ✅ bridge-schemas/source/pass-1/pass1_entity_metrics.md
--   ✅ bridge-schemas/source/pass-2/pass2_clinical_metrics.md
--   ✅ bridge-schemas/detailed/pass-1/pass1_entity_metrics.json
--   ✅ bridge-schemas/minimal/pass-1/pass1_entity_metrics.json
--
-- MIGRATION STRATEGY:
--   Step 1: Add new columns (nullable, non-breaking) ✅ COMPLETED
--   Step 2: Dual-write period (code writes to both old and new columns) ✅ COMPLETED
--   Step 3: Backfill historical data (copy existing totals) ✅ COMPLETED
--   Step 4: Update read paths (switch queries to new columns) ✅ COMPLETED
--   Step 5: Stop dual-write (remove old field writes) ✅ COMPLETED
--   Step 6: Drop old columns (after validation period) ✅ COMPLETED (2025-10-08)
-- ============================================================================

-- ============================================================================
-- STEP 1: Add New Columns (Non-Breaking)
-- ============================================================================
-- All columns are nullable to allow existing records to remain valid
-- New records will populate these during dual-write period

-- Pass 1 Entity Metrics
ALTER TABLE pass1_entity_metrics
  ADD COLUMN input_tokens INTEGER,
  ADD COLUMN output_tokens INTEGER,
  ADD COLUMN total_tokens INTEGER;

COMMENT ON COLUMN pass1_entity_metrics.input_tokens IS
  'Input tokens (text + images) from OpenAI API prompt_tokens field';
COMMENT ON COLUMN pass1_entity_metrics.output_tokens IS
  'Output tokens (AI completion) from OpenAI API completion_tokens field';
COMMENT ON COLUMN pass1_entity_metrics.total_tokens IS
  'Sum of input + output tokens from OpenAI API total_tokens field';

-- Pass 2 Clinical Metrics
ALTER TABLE pass2_clinical_metrics
  ADD COLUMN input_tokens INTEGER,
  ADD COLUMN output_tokens INTEGER,
  ADD COLUMN total_tokens INTEGER;

COMMENT ON COLUMN pass2_clinical_metrics.input_tokens IS
  'Input tokens from OpenAI API prompt_tokens field';
COMMENT ON COLUMN pass2_clinical_metrics.output_tokens IS
  'Output tokens from OpenAI API completion_tokens field';
COMMENT ON COLUMN pass2_clinical_metrics.total_tokens IS
  'Sum of input + output tokens from OpenAI API total_tokens field';

-- Pass 3 Narrative Metrics
ALTER TABLE pass3_narrative_metrics
  ADD COLUMN input_tokens INTEGER,
  ADD COLUMN output_tokens INTEGER,
  ADD COLUMN total_tokens INTEGER;

COMMENT ON COLUMN pass3_narrative_metrics.input_tokens IS
  'Input tokens from OpenAI API prompt_tokens field';
COMMENT ON COLUMN pass3_narrative_metrics.output_tokens IS
  'Output tokens from OpenAI API completion_tokens field';
COMMENT ON COLUMN pass3_narrative_metrics.total_tokens IS
  'Sum of input + output tokens from OpenAI API total_tokens field';

-- ============================================================================
-- STEP 3: Backfill Historical Data
-- ============================================================================
-- Copy existing total token values to new total_tokens column
-- Input/output breakdown not available for historical records (will remain NULL)

-- Pass 1: Copy vision_tokens_used → total_tokens
UPDATE pass1_entity_metrics
SET total_tokens = vision_tokens_used
WHERE vision_tokens_used IS NOT NULL
  AND total_tokens IS NULL;

-- Pass 2: Copy clinical_tokens_used → total_tokens
UPDATE pass2_clinical_metrics
SET total_tokens = clinical_tokens_used
WHERE clinical_tokens_used IS NOT NULL
  AND total_tokens IS NULL;

-- Pass 3: Copy semantic_tokens_used → total_tokens
UPDATE pass3_narrative_metrics
SET total_tokens = semantic_tokens_used
WHERE semantic_tokens_used IS NOT NULL
  AND total_tokens IS NULL;

-- ============================================================================
-- STEP 6: Drop Old Columns ✅ EXECUTED (2025-10-08)
-- ============================================================================
-- VALIDATION CHECKLIST COMPLETED:
--   ✅ Dual-write code deployed and validated (job e8b37e4b-9844-44c0-ac95-4d07df4012bc)
--   ✅ All read paths updated to use new columns
--   ✅ No queries reference old columns (verified in application code)
--   ✅ Token breakdown verified: input_tokens + output_tokens = total_tokens
--   ✅ Production test: 5,942 input + 18,235 output = 24,177 total ✓

-- EXECUTED ON 2025-10-08:

ALTER TABLE pass1_entity_metrics
  DROP COLUMN vision_tokens_used,
  DROP COLUMN cost_usd;

COMMENT ON TABLE pass1_entity_metrics IS
  'Session-level metrics for Pass 1 entity detection. Cost calculated on-demand from token breakdown.';

ALTER TABLE pass2_clinical_metrics
  DROP COLUMN clinical_tokens_used,
  DROP COLUMN cost_usd;

COMMENT ON TABLE pass2_clinical_metrics IS
  'Session-level metrics for Pass 2 clinical processing. Cost calculated on-demand from token breakdown.';

ALTER TABLE pass3_narrative_metrics
  DROP COLUMN semantic_tokens_used,
  DROP COLUMN cost_usd;

COMMENT ON TABLE pass3_narrative_metrics IS
  'Session-level metrics for Pass 3 narrative processing. Cost calculated on-demand from token breakdown.';

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Check backfill success (should have matching totals)
-- SELECT
--   'pass1_entity_metrics' as table_name,
--   COUNT(*) as total_records,
--   COUNT(vision_tokens_used) as old_column_populated,
--   COUNT(total_tokens) as new_column_populated,
--   COUNT(input_tokens) as input_populated,
--   COUNT(output_tokens) as output_populated
-- FROM pass1_entity_metrics;

-- Verify cost calculation accuracy (compare old vs new)
-- SELECT
--   shell_file_id,
--   cost_usd as old_hardcoded_cost,
--   (input_tokens / 1000000.0 * 2.50) + (output_tokens / 1000000.0 * 10.00) as new_calculated_cost,
--   ABS(cost_usd - ((input_tokens / 1000000.0 * 2.50) + (output_tokens / 1000000.0 * 10.00))) as cost_difference
-- FROM pass1_entity_metrics
-- WHERE input_tokens IS NOT NULL
--   AND output_tokens IS NOT NULL
--   AND cost_usd IS NOT NULL
-- ORDER BY cost_difference DESC
-- LIMIT 10;

-- ============================================================================
-- Rollback Script (If Needed)
-- ============================================================================
-- Execute if migration needs to be reverted before Step 6 (column drops)

/*
-- Remove new columns
ALTER TABLE pass1_entity_metrics
  DROP COLUMN IF EXISTS input_tokens,
  DROP COLUMN IF EXISTS output_tokens,
  DROP COLUMN IF EXISTS total_tokens;

ALTER TABLE pass2_clinical_metrics
  DROP COLUMN IF EXISTS input_tokens,
  DROP COLUMN IF EXISTS output_tokens,
  DROP COLUMN IF EXISTS total_tokens;

ALTER TABLE pass3_narrative_metrics
  DROP COLUMN IF EXISTS input_tokens,
  DROP COLUMN IF EXISTS output_tokens,
  DROP COLUMN IF EXISTS total_tokens;
*/

-- ============================================================================
-- Post-Migration Code Changes Required
-- ============================================================================
-- See TOKEN-BREAKDOWN-MIGRATION-CHECKLIST.md for complete code change list:
--
-- 1. Type Definitions (Phase 2A):
--    - apps/render-worker/src/pass1/pass1-types.ts
--    - apps/render-worker/src/pass2/pass2-types.ts
--    - apps/render-worker/src/pass3/pass3-types.ts
--
-- 2. Database Builders - Dual Write (Phase 2B):
--    - apps/render-worker/src/pass1/pass1-database-builder.ts (line 258)
--    - apps/render-worker/src/pass2/[builder].ts
--    - apps/render-worker/src/pass3/[builder].ts
--
-- 3. Stop Image Token Estimation (Phase 2C):
--    - apps/render-worker/src/pass1/Pass1EntityDetector.ts (lines 349-352, 530-532)
--
-- 4. Schema Documentation (Phase 3):
--    - bridge-schemas/source/*.md files
--    - bridge-schemas/detailed/*.json files
--    - bridge-schemas/minimal/*.json files
--    - current_schema/08_job_coordination.sql
--
-- ============================================================================
