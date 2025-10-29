-- ============================================================================
-- Migration: Pass 0.5 Encounter Discovery Infrastructure
-- Date: 2025-10-30
-- Issue: Add Pass 0.5 intelligence layer for pre-processing encounter discovery
--
-- PROBLEM:
--   Pass 1 and Pass 2 currently duplicate encounter detection work, causing:
--   - 15-20% encounter duplication (same encounter extracted multiple times)
--   - Wasted AI tokens re-extracting encounters in each pass
--   - Inconsistent encounter context between passes
--
-- SOLUTION:
--   Implement Pass 0.5 as pre-processing intelligence layer that:
--   - Discovers all healthcare encounters ONCE before Pass 1/2
--   - Creates lightweight manifests for Pass 1/2 consumption
--   - Enables functional bbox assignment (no AI tokens for assignment)
--   - Includes Phase 2 master encounter grouping infrastructure
--
-- AFFECTED TABLES:
--   - shell_file_manifests (NEW)
--   - pass05_encounter_metrics (NEW)
--   - healthcare_encounters (8 new columns)
--   - shell_files (3 new columns)
--   - entity_processing_audit (4 new columns)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/03_clinical_core.sql (healthcare_encounters updates, shell_files updates, shell_file_manifests table)
--   [X] current_schema/04_ai_processing.sql (entity_processing_audit updates)
--   [X] current_schema/08_job_coordination.sql (pass05_encounter_metrics table)
--
-- DOWNSTREAM UPDATES:
--   [ ] Bridge schemas updated (if applicable)
--   [ ] TypeScript types regenerated
--   [X] Migration executed 2025-10-30
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Create shell_file_manifests table
-- ============================================================================

CREATE TABLE IF NOT EXISTS shell_file_manifests (
  -- Primary key
  manifest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Manifest metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pass_0_5_version TEXT NOT NULL DEFAULT '1.0.0',
  processing_time_ms INTEGER,

  -- File analysis
  total_pages INTEGER NOT NULL,
  total_encounters_found INTEGER NOT NULL,
  ocr_average_confidence NUMERIC(3,2),

  -- Batching metadata (Phase 2)
  batching_required BOOLEAN NOT NULL DEFAULT FALSE,
  batch_count INTEGER DEFAULT 1,

  -- Manifest content (JSONB)
  manifest_data JSONB NOT NULL,

  -- AI audit
  ai_model_used TEXT NOT NULL,
  ai_cost_usd NUMERIC(10,6),

  -- Uniqueness constraint
  CONSTRAINT unique_manifest_per_shell_file UNIQUE(shell_file_id)
);

CREATE INDEX idx_manifests_shell_file ON shell_file_manifests(shell_file_id);
CREATE INDEX idx_manifests_patient ON shell_file_manifests(patient_id);
CREATE INDEX idx_manifests_created ON shell_file_manifests(created_at);

COMMENT ON TABLE shell_file_manifests IS 'Pass 0.5 encounter discovery output - lightweight metadata for Pass 1/2 consumption';
COMMENT ON COLUMN shell_file_manifests.manifest_data IS 'JSONB structure: encounters array with spatial bounds, page ranges, encounter metadata';

-- ============================================================================
-- 2. Update healthcare_encounters table
-- ============================================================================

-- Add Pass 0.5 fields
ALTER TABLE healthcare_encounters
  ADD COLUMN IF NOT EXISTS page_ranges INT[][] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS spatial_bounds JSONB,
  ADD COLUMN IF NOT EXISTS identified_in_pass TEXT DEFAULT 'pass_2',
  ADD COLUMN IF NOT EXISTS is_real_world_visit BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pass_0_5_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS ocr_average_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS encounter_date_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_planned_future BOOLEAN DEFAULT FALSE,

  -- Phase 2: Master encounter grouping (deduplication across documents)
  ADD COLUMN IF NOT EXISTS master_encounter_id UUID,
  ADD COLUMN IF NOT EXISTS master_encounter_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS all_shell_file_ids UUID[] DEFAULT ARRAY[]::UUID[];

-- Indexes
CREATE INDEX IF NOT EXISTS idx_encounters_identified_in_pass ON healthcare_encounters(identified_in_pass);
CREATE INDEX IF NOT EXISTS idx_encounters_real_world ON healthcare_encounters(is_real_world_visit);
CREATE INDEX IF NOT EXISTS idx_encounters_planned_future ON healthcare_encounters(is_planned_future);
CREATE INDEX IF NOT EXISTS idx_encounters_master ON healthcare_encounters(master_encounter_id);

-- Uniqueness constraint for idempotency
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_encounter_per_shell_file'
    AND conrelid = 'healthcare_encounters'::regclass
  ) THEN
    ALTER TABLE healthcare_encounters DROP CONSTRAINT unique_encounter_per_shell_file;
  END IF;
END $$;

ALTER TABLE healthcare_encounters
  ADD CONSTRAINT unique_encounter_per_shell_file
  UNIQUE (patient_id, primary_shell_file_id, encounter_type, encounter_date, page_ranges);

-- Check constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_pass_0_5_page_ranges'
    AND conrelid = 'healthcare_encounters'::regclass
  ) THEN
    ALTER TABLE healthcare_encounters DROP CONSTRAINT check_pass_0_5_page_ranges;
  END IF;
END $$;

ALTER TABLE healthcare_encounters
  ADD CONSTRAINT check_pass_0_5_page_ranges
  CHECK (
    identified_in_pass != 'pass_0_5' OR
    (page_ranges IS NOT NULL AND array_length(page_ranges, 1) > 0)
  );

COMMENT ON COLUMN healthcare_encounters.page_ranges IS 'Page ranges in source document [[1,5], [10,12]] - Pass 0.5 only';
COMMENT ON COLUMN healthcare_encounters.master_encounter_id IS 'Groups duplicate encounters from different documents - Phase 2';
COMMENT ON COLUMN healthcare_encounters.all_shell_file_ids IS 'All document IDs referencing this encounter - managed by Phase 2 dedup batch process';
COMMENT ON COLUMN healthcare_encounters.is_planned_future IS 'True for scheduled future appointments/procedures';

-- ============================================================================
-- 3. Update shell_files table
-- ============================================================================

ALTER TABLE shell_files
  ADD COLUMN IF NOT EXISTS pass_0_5_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pass_0_5_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pass_0_5_error TEXT;

CREATE INDEX IF NOT EXISTS idx_shell_files_pass_0_5_completed ON shell_files(pass_0_5_completed);

COMMENT ON COLUMN shell_files.pass_0_5_completed IS 'True if Pass 0.5 encounter discovery completed successfully';

-- ============================================================================
-- 4. Create pass05_encounter_metrics table
-- ============================================================================

CREATE TABLE IF NOT EXISTS pass05_encounter_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,

  -- Pass 0.5 metrics
  encounters_detected INTEGER NOT NULL,
  real_world_encounters INTEGER NOT NULL,
  pseudo_encounters INTEGER NOT NULL,

  -- Performance
  processing_time_ms INTEGER NOT NULL,
  processing_time_seconds NUMERIC(10,2) GENERATED ALWAYS AS (ROUND(processing_time_ms::numeric / 1000.0, 2)) STORED,

  -- AI model
  ai_model_used TEXT NOT NULL,

  -- Token breakdown
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,

  -- Quality metrics
  ocr_average_confidence NUMERIC(3,2),
  encounter_confidence_average NUMERIC(3,2),
  encounter_types_found TEXT[],

  -- Page analysis
  total_pages INTEGER NOT NULL,
  pages_per_encounter NUMERIC(5,2),

  -- Batching
  batching_required BOOLEAN NOT NULL DEFAULT FALSE,
  batch_count INTEGER DEFAULT 1,

  -- Audit trail
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Uniqueness constraint
  CONSTRAINT unique_metrics_per_session UNIQUE (processing_session_id)
);

CREATE INDEX idx_pass05_metrics_shell_file ON pass05_encounter_metrics(shell_file_id);
CREATE INDEX idx_pass05_metrics_session ON pass05_encounter_metrics(processing_session_id);
CREATE INDEX idx_pass05_metrics_created ON pass05_encounter_metrics(created_at);

COMMENT ON TABLE pass05_encounter_metrics IS 'Pass 0.5 session-level performance and cost tracking';

-- ============================================================================
-- 5. Update entity_processing_audit table
-- ============================================================================

ALTER TABLE entity_processing_audit
  ADD COLUMN IF NOT EXISTS encounter_assignment_method TEXT,
  ADD COLUMN IF NOT EXISTS encounter_assignment_score NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS encounter_assignment_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS temporal_precision TEXT DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_entities_assignment_method ON entity_processing_audit(encounter_assignment_method);
CREATE INDEX IF NOT EXISTS idx_entities_unassigned ON entity_processing_audit(final_encounter_id) WHERE final_encounter_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_entities_temporal_precision ON entity_processing_audit(temporal_precision);

COMMENT ON COLUMN entity_processing_audit.encounter_assignment_method IS 'Method used: high_iou (>=0.8), medium_iou (0.2-0.8), page_range_fallback, nearest_region, unassigned';
COMMENT ON COLUMN entity_processing_audit.temporal_precision IS 'Temporal granularity: day, month, year, vague, unknown';

-- ============================================================================
-- 6. RLS policies
-- ============================================================================

ALTER TABLE shell_file_manifests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own manifests" ON shell_file_manifests;

CREATE POLICY "Users can view their own manifests"
  ON shell_file_manifests FOR SELECT
  USING (patient_id = auth.uid());

COMMENT ON POLICY "Users can view their own manifests" ON shell_file_manifests IS 'RLS: Users can only view manifests for their own documents';

-- ============================================================================
-- Verification Queries
-- ============================================================================

DO $$
BEGIN
  -- Verify tables exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shell_file_manifests') THEN
    RAISE EXCEPTION 'Migration failed: shell_file_manifests table not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pass05_encounter_metrics') THEN
    RAISE EXCEPTION 'Migration failed: pass05_encounter_metrics table not created';
  END IF;

  -- Verify columns exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'healthcare_encounters' AND column_name = 'master_encounter_id'
  ) THEN
    RAISE EXCEPTION 'Migration failed: master_encounter_id column not added';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_processing_audit' AND column_name = 'temporal_precision'
  ) THEN
    RAISE EXCEPTION 'Migration failed: temporal_precision column not added';
  END IF;

  RAISE NOTICE 'Migration #34 verification passed: All tables and columns created successfully';
END $$;

COMMIT;

-- ============================================================================
-- Rollback Script
-- ============================================================================

/*
BEGIN;

DROP TABLE IF EXISTS pass05_encounter_metrics CASCADE;
DROP TABLE IF EXISTS shell_file_manifests CASCADE;

ALTER TABLE healthcare_encounters
  DROP COLUMN IF EXISTS page_ranges,
  DROP COLUMN IF EXISTS spatial_bounds,
  DROP COLUMN IF EXISTS identified_in_pass,
  DROP COLUMN IF EXISTS is_real_world_visit,
  DROP COLUMN IF EXISTS pass_0_5_confidence,
  DROP COLUMN IF EXISTS ocr_average_confidence,
  DROP COLUMN IF EXISTS encounter_date_end,
  DROP COLUMN IF EXISTS is_planned_future,
  DROP COLUMN IF EXISTS master_encounter_id,
  DROP COLUMN IF EXISTS master_encounter_confidence,
  DROP COLUMN IF EXISTS all_shell_file_ids;

ALTER TABLE shell_files
  DROP COLUMN IF EXISTS pass_0_5_completed,
  DROP COLUMN IF EXISTS pass_0_5_completed_at,
  DROP COLUMN IF EXISTS pass_0_5_error;

ALTER TABLE entity_processing_audit
  DROP COLUMN IF EXISTS encounter_assignment_method,
  DROP COLUMN IF EXISTS encounter_assignment_score,
  DROP COLUMN IF EXISTS encounter_assignment_confidence,
  DROP COLUMN IF EXISTS temporal_precision;

COMMIT;
*/
