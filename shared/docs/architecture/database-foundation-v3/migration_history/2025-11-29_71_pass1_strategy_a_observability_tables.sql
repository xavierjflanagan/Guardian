-- ============================================================================
-- Migration 71: Pass 1 Strategy-A Observability Tables
-- Date: 2025-11-29
-- Issue: Pass 1 Strategy-A needs hierarchical observability infrastructure
--
-- CREATES:
--   - pass1_encounter_results: Per-encounter processing tracking
--   - pass1_batch_results: Per-batch processing with retry tracking
--   - pass1_bridge_schema_zones: Y-coordinate ranges per schema type
--   - pass1_entity_detections: Minimal entity storage for Strategy-A
--
-- MODIFIES:
--   - pass1_entity_metrics: Add batch/encounter aggregate columns
--   - ai_processing_summary: Add failure drill-down columns
--   - ai_processing_sessions: Add pass-specific status columns
--
-- DESIGN REFERENCE:
--   - PASS1-STRATEGY-A-MASTER.md Section 4 (New Component Designs)
--   - 05-hierarchical-observability-system.md (Full schema details)
--
-- SOURCE OF TRUTH TO UPDATE:
--   [x] current_schema/04_ai_processing.sql - Entity detections, bridge zones, metrics
--   [x] current_schema/08_job_coordination.sql - Batch/encounter results, session columns
--
-- ============================================================================

-- ============================================================================
-- PART 1: Create pass1_encounter_results (must be first - FK target)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pass1_encounter_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Hierarchy
  shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  healthcare_encounter_id UUID NOT NULL REFERENCES healthcare_encounters(id) ON DELETE CASCADE,
  processing_session_id UUID REFERENCES ai_processing_sessions(id),
  patient_id UUID NOT NULL REFERENCES user_profiles(id),

  -- Encounter scope
  page_count INTEGER NOT NULL,

  -- Batching info
  batching_used BOOLEAN DEFAULT FALSE,
  batches_total INTEGER DEFAULT 1,

  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'succeeded', 'failed'
  )),

  -- Batch aggregates (updated as batches complete)
  batches_succeeded INTEGER DEFAULT 0,
  batches_failed INTEGER DEFAULT 0,
  total_retries_used INTEGER DEFAULT 0,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_duration_ms INTEGER,

  -- AI metrics (aggregated from batches)
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,

  -- Output metrics (aggregated from batches)
  total_entities_detected INTEGER DEFAULT 0,
  total_zones_detected INTEGER DEFAULT 0,

  -- Error summary (populated if any batch failed permanently)
  failure_batch_index INTEGER,
  error_code TEXT,
  error_summary TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE pass1_encounter_results IS
  'Migration 71: Per-encounter processing results for Pass 1 Strategy-A. Aggregates batch results and provides encounter-level status tracking.';

-- Indexes for pass1_encounter_results
CREATE INDEX IF NOT EXISTS idx_pass1_encounter_shell ON pass1_encounter_results(shell_file_id);
CREATE INDEX IF NOT EXISTS idx_pass1_encounter_status ON pass1_encounter_results(status);
CREATE INDEX IF NOT EXISTS idx_pass1_encounter_failed ON pass1_encounter_results(shell_file_id) WHERE status = 'failed';

-- Unique constraint: one row per encounter
CREATE UNIQUE INDEX IF NOT EXISTS idx_pass1_encounter_unique ON pass1_encounter_results(healthcare_encounter_id);


-- ============================================================================
-- PART 2: Create pass1_batch_results (FK to pass1_encounter_results)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pass1_batch_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Hierarchy
  healthcare_encounter_id UUID NOT NULL REFERENCES healthcare_encounters(id) ON DELETE CASCADE,
  pass1_encounter_result_id UUID NOT NULL REFERENCES pass1_encounter_results(id) ON DELETE CASCADE,
  processing_session_id UUID REFERENCES ai_processing_sessions(id),

  -- Batch identification
  batch_index INTEGER NOT NULL,  -- 0-based index within encounter
  page_range_start INTEGER NOT NULL,
  page_range_end INTEGER NOT NULL,

  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'succeeded', 'failed'
  )),

  -- Retry tracking
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- AI metrics
  ai_model_used TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,

  -- Error tracking (populated on failure)
  error_code TEXT,
  error_message TEXT,
  error_context JSONB,

  -- Transient failure tracking (populated even on success if retries occurred)
  had_transient_failure BOOLEAN DEFAULT FALSE,
  transient_error_history JSONB,

  -- Output metrics (populated on success)
  entities_detected INTEGER,
  zones_detected INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE pass1_batch_results IS
  'Migration 71: Per-batch processing results for Pass 1 Strategy-A. Tracks retry attempts, errors, and metrics at batch granularity.';

-- Indexes for pass1_batch_results
CREATE INDEX IF NOT EXISTS idx_pass1_batch_encounter ON pass1_batch_results(healthcare_encounter_id);
CREATE INDEX IF NOT EXISTS idx_pass1_batch_status ON pass1_batch_results(status) WHERE status IN ('pending', 'processing', 'failed');
CREATE INDEX IF NOT EXISTS idx_pass1_batch_failed ON pass1_batch_results(healthcare_encounter_id) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_pass1_batch_stale ON pass1_batch_results(started_at) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_pass1_batch_transient ON pass1_batch_results(healthcare_encounter_id) WHERE had_transient_failure = TRUE;

-- Unique constraint: one row per batch per encounter
CREATE UNIQUE INDEX IF NOT EXISTS idx_pass1_batch_unique ON pass1_batch_results(healthcare_encounter_id, batch_index);


-- ============================================================================
-- PART 3: Create pass1_bridge_schema_zones
-- ============================================================================

CREATE TABLE IF NOT EXISTS pass1_bridge_schema_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  healthcare_encounter_id UUID NOT NULL REFERENCES healthcare_encounters(id) ON DELETE CASCADE,
  processing_session_id UUID REFERENCES ai_processing_sessions(id),

  -- Zone definition
  schema_type TEXT NOT NULL,  -- 'medications', 'lab_results', 'vitals', etc.
  page_number INTEGER NOT NULL,
  y_start INTEGER NOT NULL,
  y_end INTEGER NOT NULL,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_y_range CHECK (y_end > y_start)
);

COMMENT ON TABLE pass1_bridge_schema_zones IS
  'Migration 71: Y-coordinate ranges per bridge schema type for Pass 1 Strategy-A. Used by Pass 2 to batch entities by zone.';

-- Indexes for pass1_bridge_schema_zones
CREATE INDEX IF NOT EXISTS idx_bridge_zones_encounter ON pass1_bridge_schema_zones(healthcare_encounter_id);
CREATE INDEX IF NOT EXISTS idx_bridge_zones_schema ON pass1_bridge_schema_zones(schema_type);


-- ============================================================================
-- PART 4: Create pass1_entity_detections (FK to pass1_bridge_schema_zones)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pass1_entity_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  healthcare_encounter_id UUID NOT NULL REFERENCES healthcare_encounters(id) ON DELETE CASCADE,
  shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  processing_session_id UUID REFERENCES ai_processing_sessions(id),

  -- Entity identification
  entity_sequence INTEGER NOT NULL,  -- Order within encounter (e1, e2, etc.)
  original_text TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'medication', 'condition', 'procedure', 'observation',
    'allergy', 'lab_result', 'vital_sign', 'physical_finding'
  )),
  aliases TEXT[] DEFAULT '{}',

  -- Spatial
  y_coordinate INTEGER,
  page_number INTEGER NOT NULL DEFAULT 1,

  -- Link to bridge schema zone
  bridge_schema_zone_id UUID REFERENCES pass1_bridge_schema_zones(id),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE pass1_entity_detections IS
  'Migration 71: Minimal entity storage for Pass 1 Strategy-A. Replaces entity_processing_audit with streamlined schema.';

-- Indexes for pass1_entity_detections
CREATE INDEX IF NOT EXISTS idx_pass1_entities_encounter ON pass1_entity_detections(healthcare_encounter_id);
CREATE INDEX IF NOT EXISTS idx_pass1_entities_type ON pass1_entity_detections(entity_type);
CREATE INDEX IF NOT EXISTS idx_pass1_entities_shell_file ON pass1_entity_detections(shell_file_id);
CREATE INDEX IF NOT EXISTS idx_pass1_entities_zone ON pass1_entity_detections(bridge_schema_zone_id) WHERE bridge_schema_zone_id IS NOT NULL;


-- ============================================================================
-- PART 5: Add columns to pass1_entity_metrics
-- ============================================================================

-- New model column (replaces legacy vision_model_used)
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS ai_model_used TEXT;

-- Encounter tracking
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS encounters_total INTEGER;
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS encounters_succeeded INTEGER;
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS encounters_failed INTEGER;

-- Batch tracking
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS batches_total INTEGER;
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS batches_succeeded INTEGER;
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS total_retries_used INTEGER;

-- Error tracking
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS failure_encounter_id UUID REFERENCES healthcare_encounters(id);
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS error_summary TEXT;

COMMENT ON COLUMN pass1_entity_metrics.ai_model_used IS
  'Migration 71: AI model used for Strategy-A (replaces legacy vision_model_used)';
COMMENT ON COLUMN pass1_entity_metrics.encounters_total IS
  'Migration 71: Total encounters processed in this session';
COMMENT ON COLUMN pass1_entity_metrics.batches_total IS
  'Migration 71: Total batches across all encounters';
COMMENT ON COLUMN pass1_entity_metrics.error_code IS
  'Migration 71: Standardized error code if processing failed';


-- ============================================================================
-- PART 6: Add columns to ai_processing_summary
-- ============================================================================

-- Pass 0.5 reference (currently missing)
ALTER TABLE ai_processing_summary ADD COLUMN IF NOT EXISTS pass05_metrics_id UUID;
-- Note: FK to pass05_encounter_metrics not added - table may not exist in all environments

-- Failure drill-down columns
ALTER TABLE ai_processing_summary ADD COLUMN IF NOT EXISTS failure_encounter_id UUID REFERENCES healthcare_encounters(id);
ALTER TABLE ai_processing_summary ADD COLUMN IF NOT EXISTS failure_batch_index INTEGER;
ALTER TABLE ai_processing_summary ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE ai_processing_summary ADD COLUMN IF NOT EXISTS error_drill_down JSONB;

COMMENT ON COLUMN ai_processing_summary.pass05_metrics_id IS
  'Migration 71: Reference to Pass 0.5 encounter metrics';
COMMENT ON COLUMN ai_processing_summary.failure_encounter_id IS
  'Migration 71: Which encounter caused pipeline failure';
COMMENT ON COLUMN ai_processing_summary.error_drill_down IS
  'Migration 71: Quick summary for UI (batch info, error context)';


-- ============================================================================
-- PART 7: Add columns to ai_processing_sessions
-- ============================================================================

-- Pass-specific status columns for quick visibility
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS pass05_status TEXT
  CHECK (pass05_status IS NULL OR pass05_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS pass1_status TEXT
  CHECK (pass1_status IS NULL OR pass1_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS pass1_5_status TEXT
  CHECK (pass1_5_status IS NULL OR pass1_5_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS pass2_status TEXT
  CHECK (pass2_status IS NULL OR pass2_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS pass3_status TEXT
  CHECK (pass3_status IS NULL OR pass3_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));

-- Failure drill-down reference
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS failure_pass TEXT;
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS failure_encounter_id UUID REFERENCES healthcare_encounters(id);
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS error_code_v2 TEXT;  -- Named error_code_v2 to avoid conflict if error_code exists

COMMENT ON COLUMN ai_processing_sessions.pass05_status IS
  'Migration 71: Quick visibility into Pass 0.5 status';
COMMENT ON COLUMN ai_processing_sessions.pass1_status IS
  'Migration 71: Quick visibility into Pass 1 status';
COMMENT ON COLUMN ai_processing_sessions.failure_pass IS
  'Migration 71: Which pass caused the failure';


-- ============================================================================
-- PART 8: RLS Policies for new tables
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE pass1_encounter_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass1_batch_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass1_bridge_schema_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass1_entity_detections ENABLE ROW LEVEL SECURITY;

-- Service role: Full access (for worker)
CREATE POLICY "Service role full access on pass1_encounter_results"
  ON pass1_encounter_results
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on pass1_batch_results"
  ON pass1_batch_results
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on pass1_bridge_schema_zones"
  ON pass1_bridge_schema_zones
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on pass1_entity_detections"
  ON pass1_entity_detections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users: Read access via patient_id
CREATE POLICY "Users can read own pass1_encounter_results"
  ON pass1_encounter_results
  FOR SELECT
  TO authenticated
  USING (patient_id IN (SELECT id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can read own pass1_entity_detections"
  ON pass1_entity_detections
  FOR SELECT
  TO authenticated
  USING (patient_id IN (SELECT id FROM user_profiles WHERE id = auth.uid()));

-- Batch results and zones: Read via encounter relationship
CREATE POLICY "Users can read own pass1_batch_results"
  ON pass1_batch_results
  FOR SELECT
  TO authenticated
  USING (
    healthcare_encounter_id IN (
      SELECT id FROM healthcare_encounters
      WHERE patient_id IN (SELECT id FROM user_profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can read own pass1_bridge_schema_zones"
  ON pass1_bridge_schema_zones
  FOR SELECT
  TO authenticated
  USING (
    healthcare_encounter_id IN (
      SELECT id FROM healthcare_encounters
      WHERE patient_id IN (SELECT id FROM user_profiles WHERE id = auth.uid())
    )
  );


-- ============================================================================
-- MIGRATION STATUS
-- ============================================================================
-- Date Started: 2025-11-29
-- Date Completed: 2025-11-29
--
-- EXECUTION CHECKLIST:
--   [x] Execute Part 1 (pass1_encounter_results) via mcp__supabase__apply_migration
--   [x] Execute Part 2 (pass1_batch_results) via mcp__supabase__apply_migration
--   [x] Execute Part 3 (pass1_bridge_schema_zones) via mcp__supabase__apply_migration
--   [x] Execute Part 4 (pass1_entity_detections) via mcp__supabase__apply_migration
--   [x] Execute Part 5 (pass1_entity_metrics columns) via mcp__supabase__apply_migration
--   [x] Execute Part 6 (ai_processing_summary columns) via mcp__supabase__apply_migration
--   [x] Execute Part 7 (ai_processing_sessions columns) via mcp__supabase__apply_migration
--   [x] Execute Part 8 (RLS policies) via mcp__supabase__apply_migration
--   [x] Update current_schema/04_ai_processing.sql
--   [x] Update current_schema/08_job_coordination.sql
--   [x] Update PASS1-STRATEGY-A-MASTER.md Phase 1 checklist
--
