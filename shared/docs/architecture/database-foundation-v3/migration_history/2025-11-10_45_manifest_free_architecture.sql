-- ============================================================================
-- Migration 45: Manifest-Free Architecture for Pass 0.5
-- Date: 2025-11-11
-- Issue: Eliminate redundant shell_file_manifests table
--
-- PROBLEM:
--   - shell_file_manifests table duplicates data from healthcare_encounters
--   - Progressive processing (>100 pages) bypasses manifest writes
--   - Manifest synchronization adds complexity and failure modes
--
-- SOLUTION:
--   - Add Pass 0.5 tracking columns to shell_files (version, progressive flag, OCR confidence)
--   - Create backward-compatible view aggregating from normalized tables
--   - Progressive mode becomes automatic (no environment variable needed)
--   - All data lives in proper normalized tables
--
-- AFFECTED TABLES:
--   - shell_files (add 3 columns - note: pass_0_5_completed already exists)
--   - shell_file_manifests_v2 (new view)
--   - pass05_page_assignments (new table for v2.3 feature)
--
-- REQUIREMENTS:
--   - Postgres 13+ (for gen_random_uuid() built-in function)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/03_clinical_core.sql (shell_files columns) - COMPLETED 2025-11-10
--   [X] current_schema/04_ai_processing.sql (page_assignments table, view) - COMPLETED 2025-11-10
--
-- DOWNSTREAM UPDATES:
--   [ ] apps/render-worker/src/pass05/encounterDiscovery.ts (remove PASS_05_PROGRESSIVE_ENABLED check)
--   [ ] apps/render-worker/src/pass05/progressive/session-manager.ts (remove env var check)
--   [ ] apps/render-worker/src/pass05/index.ts (remove manifest writes)
--   [ ] apps/render-worker/src/pass05/databaseWriter.ts (delete file - obsolete)
--
-- MIGRATION EXECUTION:
--   [X] Migration 45 executed successfully - 2025-11-10
--   [X] Verification queries passed - all objects created
--   [X] RLS policies verified - PHI protected
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Add Pass 0.5 tracking columns to shell_files
-- ============================================================================

-- Note: pass_0_5_completed already exists (added in earlier migration)
-- We're adding 3 new columns to track version, progressive mode, and OCR quality

ALTER TABLE shell_files
  ADD COLUMN IF NOT EXISTS pass_0_5_version TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pass_0_5_progressive BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ocr_average_confidence NUMERIC(3,2) DEFAULT NULL;

COMMENT ON COLUMN shell_files.pass_0_5_version IS
  'Prompt version used for Pass 0.5 processing (e.g., v2.9, v2.10). NULL if not yet processed.';

COMMENT ON COLUMN shell_files.pass_0_5_progressive IS
  'TRUE if progressive refinement was used (>100 pages), FALSE for standard mode. Automatically determined by page count.';

COMMENT ON COLUMN shell_files.ocr_average_confidence IS
  'Average OCR confidence across all pages (0.00-1.00). Calculated from Google Cloud Vision confidence scores.';

-- ============================================================================
-- 2. Create page assignments table (v2.3 feature)
-- ============================================================================

-- Page-level encounter assignments with AI justifications
-- Helps explain which pages belong to which encounter

CREATE TABLE IF NOT EXISTS pass05_page_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  page_num INTEGER NOT NULL CHECK (page_num > 0),
  encounter_id TEXT NOT NULL,  -- AI-assigned ID like "enc-1", "enc-2" (temp ID during processing)
  justification TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each page assigned exactly once (idempotent upserts safe)
  UNIQUE(shell_file_id, page_num)
);

CREATE INDEX idx_page_assignments_shell_file ON pass05_page_assignments(shell_file_id);

COMMENT ON TABLE pass05_page_assignments IS
  'Page-level encounter assignments with AI justifications (v2.3 feature).
   Maps each page to its encounter with reasoning. Temp IDs (enc-1, enc-2) are mapped
   to actual UUIDs during encounter creation by manifestBuilder.
   UNIQUE constraint on (shell_file_id, page_num) enables idempotent upserts.';

-- Enable RLS for PHI protection (inherits access control from shell_files)
ALTER TABLE pass05_page_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY pass05_page_assignments_select
  ON pass05_page_assignments FOR SELECT
  USING (
    -- User can only see page assignments for shell files they own
    -- Inherits security from shell_files RLS policy
    EXISTS (
      SELECT 1 FROM shell_files sf
      WHERE sf.id = pass05_page_assignments.shell_file_id
      -- RLS on shell_files already enforces patient_id access via has_semantic_data_access()
    )
  );

COMMENT ON POLICY pass05_page_assignments_select ON pass05_page_assignments IS
  'Users can only see page assignments for their own shell files.
   Security inherited from shell_files RLS - no complex logic duplication needed.';

-- ============================================================================
-- 3. Create backward-compatible view to replace manifest table
-- ============================================================================

CREATE OR REPLACE VIEW shell_file_manifests_v2 AS
SELECT
  -- Legacy manifest columns (for backward compatibility)
  sf.id as manifest_id,  -- Use shell_file_id for stable, backward-compatible manifest_id
  sf.id as shell_file_id,
  sf.patient_id,
  sf.created_at,
  sf.pass_0_5_version,
  m.processing_time_ms,
  sf.page_count as total_pages,
  COUNT(he.id) as total_encounters_found,
  sf.ocr_average_confidence,

  -- Aggregate manifest data from encounters
  jsonb_build_object(
    'shellFileId', sf.id,
    'patientId', sf.patient_id,
    'totalPages', sf.page_count,
    'ocrAverageConfidence', sf.ocr_average_confidence,
    'encounters', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'encounterId', he.id,
          'encounterType', he.encounter_type,
          'isRealWorldVisit', he.is_real_world_visit,
          'dateRange', jsonb_build_object(
            'start', he.encounter_start_date,
            'end', he.encounter_date_end
          ),
          'encounterTimeframeStatus', he.encounter_timeframe_status,
          'dateSource', he.date_source,
          'provider', he.provider_name,
          'facility', he.facility_name,
          'pageRanges', he.page_ranges,
          'confidence', he.pass_0_5_confidence,
          'summary', he.summary,
          'spatialBounds', he.spatial_bounds
        ) ORDER BY he.encounter_start_date, he.id
      ) FILTER (WHERE he.id IS NOT NULL),
      '[]'::jsonb
    ),
    'page_assignments', COALESCE(pa.assignments, '[]'::jsonb),
    'batching', null  -- Always null in Phase 1
  ) as manifest_data,

  m.ai_model_used

FROM shell_files sf
LEFT JOIN healthcare_encounters he ON he.primary_shell_file_id = sf.id
LEFT JOIN pass05_encounter_metrics m ON m.shell_file_id = sf.id
LEFT JOIN LATERAL (
  -- Aggregate page assignments if they exist
  SELECT jsonb_agg(
    jsonb_build_object(
      'page', page_num,
      'encounter_id', encounter_id,
      'justification', justification
    ) ORDER BY page_num
  ) as assignments
  FROM pass05_page_assignments
  WHERE shell_file_id = sf.id
) pa ON true
WHERE sf.pass_0_5_completed = true
GROUP BY sf.id, sf.patient_id, sf.created_at, sf.pass_0_5_version,
         sf.page_count, sf.ocr_average_confidence,
         m.processing_time_ms, m.ai_model_used, pa.assignments;

COMMENT ON VIEW shell_file_manifests_v2 IS
  'Backward-compatible view replacing the deprecated shell_file_manifests table.
   Aggregates data from distributed sources (shell_files, healthcare_encounters, metrics).
   Used for legacy code compatibility during transition period.

   manifest_id uses sf.id (shell_file_id) for stability - same UUID on every query,
   enables caching, WHERE clauses, and perfect backward compatibility.

   Security: Only service_role should query this directly. Authenticated users should
   access via base tables with RLS protection.';

-- ============================================================================
-- 4. Security: Grant permissions
-- ============================================================================

-- View: Restrict to service_role only (base table RLS protects actual data access)
REVOKE ALL ON shell_file_manifests_v2 FROM PUBLIC;
REVOKE ALL ON shell_file_manifests_v2 FROM authenticated;
GRANT SELECT ON shell_file_manifests_v2 TO service_role;

-- Page assignments: Same security model as healthcare_encounters
REVOKE ALL ON pass05_page_assignments FROM PUBLIC;
GRANT SELECT ON pass05_page_assignments TO authenticated;
GRANT ALL ON pass05_page_assignments TO service_role;

COMMIT;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify new columns exist
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'shell_files'
-- AND column_name IN ('pass_0_5_version', 'pass_0_5_progressive', 'ocr_average_confidence');

-- Verify page_assignments table created
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'pass05_page_assignments';

-- Verify view created
-- SELECT table_name FROM information_schema.views WHERE table_name = 'shell_file_manifests_v2';

-- Test view (should return empty if no Pass 0.5 processing done yet)
-- SELECT shell_file_id, pass_0_5_version, total_encounters_found FROM shell_file_manifests_v2 LIMIT 1;

-- ============================================================================
-- Rollback Script (if needed)
-- ============================================================================

-- DROP VIEW IF EXISTS shell_file_manifests_v2;
-- DROP TABLE IF EXISTS pass05_page_assignments CASCADE;
-- ALTER TABLE shell_files DROP COLUMN IF EXISTS pass_0_5_version;
-- ALTER TABLE shell_files DROP COLUMN IF EXISTS pass_0_5_progressive;
-- ALTER TABLE shell_files DROP COLUMN IF EXISTS ocr_average_confidence;
