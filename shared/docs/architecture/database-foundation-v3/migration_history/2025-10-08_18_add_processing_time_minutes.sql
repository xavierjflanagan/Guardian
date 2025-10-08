-- ============================================================================
-- Migration: Add Human-Readable Processing Time (Minutes)
-- Date: 2025-10-08
-- Issue: Processing time stored in milliseconds is not human-readable
--
-- PROBLEM:
--   processing_time_ms stores AI processing duration in milliseconds (~295,084 ms)
--   which is difficult for humans to interpret. Need minutes for readability
--   in dashboards, queries, and monitoring tools.
--
-- SOLUTION:
--   Add processing_time_minutes as GENERATED ALWAYS column that auto-calculates
--   from processing_time_ms. STORED type means zero query overhead.
--
-- AFFECTED TABLES:
--   - pass1_entity_metrics
--   - pass2_clinical_metrics
--   - pass3_narrative_metrics
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/08_job_coordination.sql
--      - Line 228: pass1_entity_metrics.processing_time_minutes added
--      - Line 279: pass2_clinical_metrics.processing_time_minutes added
--      - Line 312: pass3_narrative_metrics.processing_time_minutes added
--
-- SCHEMA DOCUMENTATION UPDATED:
--   [X] bridge-schemas/source/pass-1/pass1_entity_metrics.md
--   [X] bridge-schemas/source/pass-2/pass2_clinical_metrics.md
--   [N/A] bridge-schemas/source/pass-3/pass3_narrative_metrics.md (table does not exist yet)
--   [X] bridge-schemas/detailed/pass-1/pass1_entity_metrics.json
--   [X] bridge-schemas/detailed/pass-2/pass2_clinical_metrics.json
--   [X] bridge-schemas/minimal/pass-1/pass1_entity_metrics.json
--   [X] bridge-schemas/minimal/pass-2/pass2_clinical_metrics.json
--
-- MIGRATION EXECUTED:
--   [X] All 3 tables applied to Supabase on 2025-10-08
--   [X] Pass 1 verified with production data (0.00 difference)
--   [X] Pass 2 and Pass 3 columns added successfully
--
-- COST ANALYSIS:
--   - Storage: Variable-length NUMERIC (typically 5-9 bytes for (10,2))
--   - Compute: Zero (STORED = calculated once at INSERT, not per query)
--   - Current scale: 5 rows = negligible
--   - At 1M docs: ~5-9 MB storage
--   - Cost: Negligible (fractions of a cent even at massive scale)
--
-- LOCKING CONSIDERATION:
--   - ALTER TABLE takes AccessExclusive lock during execution
--   - STORED columns trigger table rewrite to compute existing row values
--   - Current scale (5 rows): instant, no concern
--   - Future scale: Run during low-traffic window if table grows large
--
-- MIGRATION STRATEGY:
--   Single-step: Add GENERATED ALWAYS column (non-breaking, zero risk)
-- ============================================================================

-- ============================================================================
-- Add Human-Readable Minutes Column
-- ============================================================================
-- GENERATED ALWAYS AS ... STORED means:
--   - Calculated once when row is inserted/updated
--   - Stored on disk (no recalculation on reads)
--   - Behaves like a regular column in queries
--   - Auto-updates if processing_time_ms changes
--
-- Idempotency: IF NOT EXISTS prevents duplicate runs from failing
-- NOT NULL: Safe because processing_time_ms is NOT NULL (default 0)

ALTER TABLE pass1_entity_metrics
  ADD COLUMN IF NOT EXISTS processing_time_minutes NUMERIC(10,2) NOT NULL
  GENERATED ALWAYS AS (ROUND(processing_time_ms::numeric / 60000.0, 2)) STORED;

-- Only add comment if column exists (guards against partial rollback scenarios)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pass1_entity_metrics'
      AND column_name = 'processing_time_minutes'
  ) THEN
    COMMENT ON COLUMN pass1_entity_metrics.processing_time_minutes IS
      'Processing time in minutes (auto-calculated from processing_time_ms for human readability). Example: 295084 ms → 4.92 minutes';
  END IF;
END$$;

-- ============================================================================
-- Add Minutes Column to Pass 2 Clinical Metrics
-- ============================================================================

ALTER TABLE pass2_clinical_metrics
  ADD COLUMN IF NOT EXISTS processing_time_minutes NUMERIC(10,2) NOT NULL
  GENERATED ALWAYS AS (ROUND(processing_time_ms::numeric / 60000.0, 2)) STORED;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pass2_clinical_metrics'
      AND column_name = 'processing_time_minutes'
  ) THEN
    COMMENT ON COLUMN pass2_clinical_metrics.processing_time_minutes IS
      'Processing time in minutes (auto-calculated from processing_time_ms for human readability). Example: 180000 ms → 3.00 minutes';
  END IF;
END$$;

-- ============================================================================
-- Add Minutes Column to Pass 3 Narrative Metrics
-- ============================================================================

ALTER TABLE pass3_narrative_metrics
  ADD COLUMN IF NOT EXISTS processing_time_minutes NUMERIC(10,2) NOT NULL
  GENERATED ALWAYS AS (ROUND(processing_time_ms::numeric / 60000.0, 2)) STORED;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pass3_narrative_metrics'
      AND column_name = 'processing_time_minutes'
  ) THEN
    COMMENT ON COLUMN pass3_narrative_metrics.processing_time_minutes IS
      'Processing time in minutes (auto-calculated from processing_time_ms for human readability). Example: 120000 ms → 2.00 minutes';
  END IF;
END$$;

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Verify both columns show consistent values

-- SELECT
--   shell_file_id,
--   processing_time_ms,
--   processing_time_minutes,
--   -- Manual calculation for verification
--   ROUND(processing_time_ms / 60000.0, 2) as manual_calc,
--   -- Should be zero
--   ABS(processing_time_minutes - ROUND(processing_time_ms / 60000.0, 2)) as difference
-- FROM pass1_entity_metrics
-- WHERE processing_time_ms > 0
-- ORDER BY created_at DESC
-- LIMIT 10;

-- ============================================================================
-- Rollback Script (If Needed)
-- ============================================================================

/*
ALTER TABLE pass1_entity_metrics DROP COLUMN processing_time_minutes;
*/

-- ============================================================================
-- Post-Migration Updates Required
-- ============================================================================
-- 1. Update source of truth: current_schema/08_job_coordination.sql
-- 2. Update schema docs: bridge-schemas/source/pass-1/pass1_entity_metrics.md
-- 3. Update JSON schemas: bridge-schemas/detailed & minimal .json files
-- 4. Update migration header with ✅ completion markers
-- ============================================================================
