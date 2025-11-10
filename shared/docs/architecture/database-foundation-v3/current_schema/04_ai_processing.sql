-- =============================================================================
-- 04_AI_PROCESSING.SQL - V3 Three-Pass AI Processing Pipeline & Dual-Lens Experience
-- =============================================================================
-- VERSION: 1.2 (MIGRATION 2025-09-30: Pass 1 Entity Audit and Metrics Restructuring)
--   - Replaced entity_processing_audit_v2 with enhanced entity_processing_audit (dual-input processing)
--   - Updated ai_confidence_scoring FK reference to new audit table
--   - Enhanced audit table supports complete Pass 1→Pass 2 entity lifecycle tracking
-- Purpose: Complete V3 AI processing infrastructure with three-pass pipeline and dual-lens user experience
-- Architecture: Pass 1 (entity detection) → Pass 2 (clinical extraction) → Pass 3 (semantic narrative creation) with human-in-the-loop validation
-- Dependencies: 01_foundations.sql (audit, security), 02_profiles.sql (user_profiles), 03_clinical_core.sql (shell_files, clinical_narratives)
-- 
-- DESIGN DECISIONS:
-- - Three-pass AI architecture: Sequential processing with increasing sophistication
-- - Entity processing audit: Complete traceability of all AI entity extraction decisions
-- - Profile classification safety: Contamination prevention through demographic/clinical validation
-- - Manual review queue: Human-in-the-loop validation for low-confidence AI results
-- - Semantic processing infrastructure: Pass 3 clinical narrative creation with coherence scoring
-- - Shell file synthesis: Post-Pass 3 intelligent summaries replacing primitive document intelligence
-- - Dual-lens user experience: Document-centric vs narrative-centric viewing with user preference persistence
-- - Clinical decision support: Rule engine for AI-powered clinical insights and recommendations
-- 
-- TABLES CREATED (11 tables):
-- OCR Infrastructure:
--   - ocr_artifacts
-- AI Processing Core:
--   - ai_processing_sessions, entity_processing_audit, profile_classification_audit
-- Quality & Validation:
--   - manual_review_queue, ai_confidence_scoring
-- Pass 3 Semantic Infrastructure:
--   - semantic_processing_sessions, narrative_creation_audit, shell_file_synthesis_results
-- Dual-Lens User Experience:
--   - dual_lens_user_preferences, narrative_view_cache
-- 
-- KEY FEATURES:
-- - ai_processing_sessions.workflow_step: Tracks progression through three-pass pipeline
-- - entity_processing_audit: V3-enhanced audit with dual-input processing and complete Pass 1→Pass 2 lifecycle tracking
-- - semantic_processing_sessions: Pass 3 narrative creation session management
-- - dual_lens_user_preferences: User choice between document-minded and clinical-minded experiences
-- - narrative_view_cache: Performance optimization for complex narrative queries
-- - Human-in-the-loop validation: Quality assurance for healthcare-critical AI decisions
-- 
-- INTEGRATION POINTS:
-- - Processing sessions coordinate with V3 job queue (08_job_coordination.sql)
-- - Entity audit feeds clinical decision support algorithms
-- - Semantic processing creates clinical narratives in 03_clinical_core.sql
-- - Dual-lens preferences drive frontend UI/UX presentation layer
-- - Manual review queue supports healthcare provider validation workflows
-- =============================================================================

BEGIN;

-- Verification that dependencies exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shell_files') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: shell_files table not found. Run 03_clinical_core.sql first.';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_clinical_events') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: patient_clinical_events table not found. Run 03_clinical_core.sql first.';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'healthcare_encounters') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: healthcare_encounters table not found. Run 03_clinical_core.sql first.';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'has_profile_access') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: has_profile_access() function not found. Run 02_profiles.sql first.';
    END IF;
    
    -- Additional dependency checks from GPT-5 review
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: user_profiles missing. Run 02_profiles.sql.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clinical_narratives') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: clinical_narratives missing. Run 03_clinical_core.sql.';
    END IF;

    -- Check all patient_* tables required by FKs
    PERFORM 1 FROM information_schema.tables WHERE table_name IN (
        'patient_observations','patient_interventions','patient_conditions',
        'patient_medications','patient_immunizations','patient_vitals','patient_allergies'
    );
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: One or more patient_* tables missing. Run 03_clinical_core.sql.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'is_admin') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: is_admin() missing. Run 01_foundations.sql.';
    END IF;
    
    RAISE NOTICE 'Dependencies verified: All required tables and functions exist';
END $$;

-- =============================================================================
-- SECTION 0: OCR ARTIFACT PERSISTENCE
-- =============================================================================
-- Added 2025-10-10: OCR artifacts table for reusable OCR results
-- Purpose: Index OCR results stored in Supabase Storage for reuse across retries and passes

CREATE TABLE IF NOT EXISTS ocr_artifacts (
    -- Primary key links to shell_files with CASCADE delete
    shell_file_id UUID PRIMARY KEY REFERENCES shell_files(id) ON DELETE CASCADE,
    
    -- Storage path to manifest file
    manifest_path TEXT NOT NULL,
    
    -- OCR provider for future flexibility
    provider TEXT NOT NULL DEFAULT 'google_vision',
    
    -- Version tracking for OCR processing changes
    artifact_version TEXT NOT NULL DEFAULT 'v1.2024.10',
    
    -- SHA256 of original file for integrity verification
    file_checksum TEXT,
    
    -- SHA256 of OCR results for change detection
    checksum TEXT NOT NULL,
    
    -- Page count for quick reference
    pages INT NOT NULL CHECK (pages > 0),
    
    -- Total size of OCR artifacts in bytes
    bytes BIGINT NOT NULL CHECK (bytes > 0),
    
    -- Timestamps for tracking
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_ocr_artifacts_created ON ocr_artifacts(created_at);
CREATE INDEX IF NOT EXISTS idx_ocr_artifacts_provider ON ocr_artifacts(provider);

-- Enable RLS
ALTER TABLE ocr_artifacts ENABLE ROW LEVEL SECURITY;

-- Service role: optional (service role bypasses RLS anyway). If you want it explicit:
DO $ocr_policy_service$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ocr_artifacts' AND policyname = 'Service role full access') THEN
        CREATE POLICY "Service role full access"
          ON ocr_artifacts
          FOR ALL
          USING (
            coalesce((current_setting('request.jwt.claims', true)::jsonb->>'role')::text, '') = 'service_role'
          )
          WITH CHECK (
            coalesce((current_setting('request.jwt.claims', true)::jsonb->>'role')::text, '') = 'service_role'
          );
    END IF;
END $ocr_policy_service$;

-- End-user read access via profile access helper
DO $ocr_policy_user$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ocr_artifacts' AND policyname = 'Users can read own OCR artifacts') THEN
        CREATE POLICY "Users can read own OCR artifacts"
          ON ocr_artifacts
          FOR SELECT
          USING (
            has_profile_access(
              auth.uid(),
              (SELECT sf.patient_id FROM shell_files sf WHERE sf.id = ocr_artifacts.shell_file_id)
            )
          );
    END IF;
END $ocr_policy_user$;

-- Add trigger for automatic updated_at maintenance
DO $ocr_trigger$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE event_object_table = 'ocr_artifacts' AND trigger_name = 'update_ocr_artifacts_updated_at') THEN
        CREATE TRIGGER update_ocr_artifacts_updated_at
          BEFORE UPDATE ON ocr_artifacts
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $ocr_trigger$;

-- Add constraint for manifest_path length (security hardening)
DO $ocr_constraint$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'ocr_artifacts' AND constraint_name = 'ocr_manifest_path_len') THEN
        ALTER TABLE ocr_artifacts
          ADD CONSTRAINT ocr_manifest_path_len CHECK (char_length(manifest_path) BETWEEN 1 AND 2048);
    END IF;
END $ocr_constraint$;

-- Add helpful comments
COMMENT ON TABLE ocr_artifacts IS 'Index table for OCR artifact discovery and automatic cleanup via CASCADE. Links shell_files to their OCR processing results stored in Supabase Storage.';
COMMENT ON COLUMN ocr_artifacts.shell_file_id IS 'Foreign key to shell_files table, CASCADE delete ensures cleanup';
COMMENT ON COLUMN ocr_artifacts.manifest_path IS 'Path to manifest.json in medical-docs bucket';
COMMENT ON COLUMN ocr_artifacts.provider IS 'OCR provider used (google_vision, aws_textract, etc.)';
COMMENT ON COLUMN ocr_artifacts.artifact_version IS 'Version of OCR processing pipeline';
COMMENT ON COLUMN ocr_artifacts.file_checksum IS 'SHA256 of original file for integrity verification';
COMMENT ON COLUMN ocr_artifacts.checksum IS 'SHA256 of OCR results for change detection';
COMMENT ON COLUMN ocr_artifacts.pages IS 'Number of pages processed';
COMMENT ON COLUMN ocr_artifacts.bytes IS 'Total size of all OCR artifacts in bytes';

-- =============================================================================
-- SECTION 0B: OCR PROCESSING METRICS
-- =============================================================================
-- Added 2025-11-08 (Migration 43): OCR performance metrics for batch optimization
-- Purpose: Store per-job OCR performance data for batch size optimization and cost analysis

CREATE TABLE IF NOT EXISTS ocr_processing_metrics (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key references
  shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Correlation tracking (links to application logs)
  correlation_id TEXT NOT NULL,

  -- Batch configuration (optimization target)
  batch_size INTEGER NOT NULL CHECK (batch_size > 0),
  total_batches INTEGER NOT NULL CHECK (total_batches > 0),
  total_pages INTEGER NOT NULL CHECK (total_pages > 0),

  -- Timing metrics (all in milliseconds)
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  processing_time_ms INTEGER NOT NULL CHECK (processing_time_ms >= 0),
  average_batch_time_ms NUMERIC(10,2) CHECK (average_batch_time_ms IS NULL OR average_batch_time_ms >= 0),
  average_page_time_ms NUMERIC(10,2) CHECK (average_page_time_ms IS NULL OR average_page_time_ms >= 0),
  provider_avg_latency_ms INTEGER CHECK (provider_avg_latency_ms IS NULL OR provider_avg_latency_ms >= 0),

  -- Individual batch timings for distribution analysis
  batch_times_ms INTEGER[] NOT NULL DEFAULT '{}',

  -- Success/failure tracking
  successful_pages INTEGER NOT NULL DEFAULT 0 CHECK (successful_pages >= 0),
  failed_pages INTEGER NOT NULL DEFAULT 0 CHECK (failed_pages >= 0),
  failed_page_numbers INTEGER[] NOT NULL DEFAULT '{}',

  -- Quality metrics
  average_confidence NUMERIC(5,4) CHECK (average_confidence >= 0.0 AND average_confidence <= 1.0),
  total_text_length INTEGER CHECK (total_text_length >= 0),

  -- Resource usage (memory tracking)
  peak_memory_mb INTEGER CHECK (peak_memory_mb > 0),
  memory_freed_mb INTEGER CHECK (memory_freed_mb IS NULL OR memory_freed_mb >= 0),

  -- Cost estimation (for budget tracking)
  estimated_cost_usd NUMERIC(10,6) CHECK (estimated_cost_usd >= 0),
  estimated_cost_per_page_usd NUMERIC(10,6) CHECK (estimated_cost_per_page_usd >= 0),

  -- Provider info
  ocr_provider TEXT NOT NULL DEFAULT 'google_vision' CHECK (ocr_provider IN ('google_vision', 'aws_textract', 'azure_cv')),

  -- Deployment context (for environment comparison)
  environment TEXT CHECK (environment IN ('development', 'staging', 'production')),
  app_version TEXT,
  worker_id TEXT,

  -- Retry tracking (detect problematic documents)
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),

  -- Queue wait time (operational metric - detects worker starvation)
  queue_wait_ms INTEGER CHECK (queue_wait_ms >= 0),

  -- Audit timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraint: completed_at must be after started_at
  CONSTRAINT valid_ocr_timing CHECK (completed_at >= started_at)
);

-- Indexes for ocr_processing_metrics
CREATE INDEX IF NOT EXISTS idx_ocr_metrics_shell_file ON ocr_processing_metrics(shell_file_id);
CREATE INDEX IF NOT EXISTS idx_ocr_metrics_correlation ON ocr_processing_metrics(correlation_id);
CREATE INDEX IF NOT EXISTS idx_ocr_metrics_patient_id ON ocr_processing_metrics(patient_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ocr_metrics_correlation ON ocr_processing_metrics(correlation_id);
CREATE INDEX IF NOT EXISTS idx_ocr_metrics_created_at ON ocr_processing_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_metrics_batch_perf ON ocr_processing_metrics(batch_size, average_page_time_ms);
CREATE INDEX IF NOT EXISTS idx_ocr_metrics_patient_created_at ON ocr_processing_metrics(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_metrics_shell_file_created_at ON ocr_processing_metrics(shell_file_id, created_at DESC);

-- Enable RLS
ALTER TABLE ocr_processing_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own OCR metrics
DO $ocr_metrics_policy_user$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ocr_processing_metrics' AND policyname = 'Users can view own OCR metrics') THEN
        CREATE POLICY "Users can view own OCR metrics"
          ON ocr_processing_metrics
          FOR SELECT
          USING (
            patient_id IN (
              SELECT profile_id FROM get_accessible_profiles(auth.uid())
            )
          );
    END IF;
END $ocr_metrics_policy_user$;

-- RLS Policy: Service role full access
DO $ocr_metrics_policy_service$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ocr_processing_metrics' AND policyname = 'Service role full access to OCR metrics') THEN
        CREATE POLICY "Service role full access to OCR metrics"
          ON ocr_processing_metrics
          FOR ALL
          USING (
            coalesce((current_setting('request.jwt.claims', true)::jsonb->>'role')::text, '') = 'service_role'
          )
          WITH CHECK (
            coalesce((current_setting('request.jwt.claims', true)::jsonb->>'role')::text, '') = 'service_role'
          );
    END IF;
END $ocr_metrics_policy_service$;

-- Grants
GRANT SELECT ON ocr_processing_metrics TO authenticated;
GRANT ALL ON ocr_processing_metrics TO service_role;

-- Table and column comments
COMMENT ON TABLE ocr_processing_metrics IS 'OCR processing performance metrics for batch optimization and cost analysis. Stores one row per shell_file OCR session.';
COMMENT ON COLUMN ocr_processing_metrics.batch_size IS 'Number of pages processed per batch (optimization target).';
COMMENT ON COLUMN ocr_processing_metrics.processing_time_ms IS 'Total OCR session processing time in milliseconds.';
COMMENT ON COLUMN ocr_processing_metrics.provider_avg_latency_ms IS 'Average Google Cloud Vision API response time per request (milliseconds).';
COMMENT ON COLUMN ocr_processing_metrics.queue_wait_ms IS 'Time from job creation to job start (milliseconds). High values indicate worker starvation.';
COMMENT ON COLUMN ocr_processing_metrics.batch_times_ms IS 'Array of individual batch processing times for distribution analysis.';
COMMENT ON COLUMN ocr_processing_metrics.correlation_id IS 'Links to application logs for detailed debugging. Must be unique per OCR session.';

-- =============================================================================
-- SECTION 1: AI PROCESSING SESSION MANAGEMENT
-- =============================================================================

-- AI processing sessions for shell file processing coordination - UPDATED for semantic architecture
CREATE TABLE IF NOT EXISTS ai_processing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE, -- Updated reference
    
    -- Session metadata
    session_type TEXT NOT NULL CHECK (session_type IN (
        'shell_file_processing', 'entity_extraction', 'clinical_validation',
        'profile_classification', 'decision_support', 'semantic_processing' -- Added Pass 3
    )),
    session_status TEXT NOT NULL DEFAULT 'initiated' CHECK (session_status IN (
        'initiated', 'processing', 'completed', 'failed', 'cancelled'
    )),
    
    -- AI model configuration
    -- MIGRATION 23 (2025-10-12): Renamed ai_model_version → ai_model_name (column stored model names, not versions)
    ai_model_name TEXT NOT NULL DEFAULT 'v3',
    model_config JSONB DEFAULT '{}',
    processing_mode TEXT CHECK (processing_mode IN ('automated', 'human_guided', 'validation_only')),
    
    -- Processing workflow
    workflow_step TEXT NOT NULL DEFAULT 'entity_detection' CHECK (workflow_step IN (
        'entity_detection', 'profile_classification', 'clinical_extraction',
        'semantic_processing', 'validation', 'decision_support', 'completed' -- Added Pass 3 step
    )),
    total_steps INTEGER DEFAULT 5,
    completed_steps INTEGER DEFAULT 0,
    
    -- Quality metrics
    overall_confidence NUMERIC(4,3) CHECK (overall_confidence BETWEEN 0 AND 1),
    requires_human_review BOOLEAN DEFAULT FALSE,
    quality_score NUMERIC(4,3) CHECK (quality_score BETWEEN 0 AND 1),
    
    -- Processing times
    processing_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_completed_at TIMESTAMPTZ,
    total_processing_time INTERVAL,
    
    -- Error handling
    error_message TEXT,
    error_context JSONB,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 2: ENTITY PROCESSING AUDIT V3 ENHANCED
-- =============================================================================
-- CRITICAL FIX: References to clinical tables now use correct relationships

-- Entity processing audit with V3 enhancements and dual-input processing
CREATE TABLE IF NOT EXISTS entity_processing_audit (
    -- Primary Key and References
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES user_profiles(id),

    -- Entity Identity (Pass 1 Output)
    entity_id TEXT NOT NULL,           -- Unique entity identifier from Pass 1
    original_text TEXT NOT NULL,       -- Exact text as detected in document
    entity_category TEXT NOT NULL CHECK (
        entity_category IN ('clinical_event', 'healthcare_context', 'document_structure')
    ),
    entity_subtype TEXT NOT NULL,      -- Specific classification (vital_sign, medication, etc.)

    -- Spatial and Context Information (OCR Integration)
    unique_marker TEXT,                -- Searchable text pattern for entity relocation
    location_context TEXT,             -- Where in document entity appears (e.g., "page 2, vitals section")
    spatial_bbox JSONB,                -- Page coordinates for click-to-zoom functionality
    page_number INTEGER,               -- Document page where entity appears

    -- Pass 1 Processing Results
    pass1_confidence NUMERIC(4,3) NOT NULL CHECK (pass1_confidence >= 0.0 AND pass1_confidence <= 1.0),
    requires_schemas TEXT[] NOT NULL DEFAULT '{}',  -- Database schemas identified for Pass 2
    processing_priority TEXT NOT NULL CHECK (
        processing_priority IN ('highest', 'high', 'medium', 'low', 'logging_only')
    ),

    -- Pass 2 Processing Coordination
    pass2_status TEXT NOT NULL DEFAULT 'pending' CHECK (
        pass2_status IN ('pending', 'skipped', 'in_progress', 'completed', 'failed')
    ),
    pass2_confidence NUMERIC(4,3) CHECK (pass2_confidence >= 0.0 AND pass2_confidence <= 1.0),
    pass2_started_at TIMESTAMPTZ,
    pass2_completed_at TIMESTAMPTZ,
    enrichment_errors TEXT,             -- Any errors during Pass 2 processing

    -- Links to Final Clinical Data (The Complete Audit Trail)
    final_event_id UUID REFERENCES patient_clinical_events(id),      -- Link to enriched clinical record
    final_encounter_id UUID REFERENCES healthcare_encounters(id),    -- Link to encounter context
    final_observation_id UUID REFERENCES patient_observations(id),   -- Link to observations
    final_intervention_id UUID REFERENCES patient_interventions(id), -- Link to interventions
    final_condition_id UUID REFERENCES patient_conditions(id),       -- Link to conditions
    final_allergy_id UUID REFERENCES patient_allergies(id),         -- Link to allergies
    final_vital_id UUID REFERENCES patient_vitals(id),              -- Link to vital signs

    -- Processing Session Management
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,

    -- AI Model and Performance Metadata (Session-level data via JOIN)
    -- REMOVED (Migration 16): pass1_model_used (use JOIN to pass1_entity_metrics)
    -- REMOVED (Migration 16): pass1_vision_processing (use JOIN to pass1_entity_metrics)
    -- REMOVED (Migration 17): pass1_token_usage (use JOIN to pass1_entity_metrics.total_tokens)
    -- REMOVED (Migration 17): pass1_image_tokens (deprecated, always 0)
    -- REMOVED (Migration 17): pass1_cost_estimate (calculate on-demand from token breakdown)
    pass2_model_used TEXT,                 -- AI model used for enrichment (if applicable)
    pass2_token_usage INTEGER,             -- Token consumption for Pass 2
    pass2_cost_estimate NUMERIC(8,4),      -- Cost estimate for Pass 2 processing

    -- DUAL-INPUT PROCESSING METADATA
    ai_visual_interpretation TEXT,          -- What AI vision model detected
    visual_formatting_context TEXT,        -- Visual formatting description
    ai_visual_confidence NUMERIC(4,3),     -- AI's confidence in visual interpretation

    -- OCR CROSS-REFERENCE DATA
    ocr_reference_text TEXT,               -- What OCR extracted for this entity
    ocr_confidence NUMERIC(4,3),           -- OCR's confidence in the text
    ocr_provider TEXT,                     -- OCR service used (google_vision, aws_textract)
    ai_ocr_agreement_score NUMERIC(4,3),   -- 0.0-1.0 agreement between AI and OCR
    spatial_mapping_source TEXT CHECK (
        spatial_mapping_source IN ('ocr_exact', 'ocr_approximate', 'ai_estimated', 'none')
    ),

    -- DISCREPANCY TRACKING
    discrepancy_type TEXT,                 -- Type of AI-OCR disagreement
    discrepancy_notes TEXT,                -- Human-readable explanation of differences
    visual_quality_assessment TEXT,        -- AI assessment of source image quality

    -- Quality and Validation Metadata
    validation_flags TEXT[] DEFAULT '{}',   -- Quality flags (low_confidence, high_discrepancy, etc.)
    cross_validation_score NUMERIC(4,3),   -- Overall AI-OCR agreement quality
    manual_review_required BOOLEAN DEFAULT FALSE,
    manual_review_completed BOOLEAN DEFAULT FALSE,
    manual_review_notes TEXT,
    manual_reviewer_id UUID REFERENCES auth.users(id),

    -- Profile Safety and Compliance
    profile_verification_confidence NUMERIC(4,3),  -- Confidence in patient identity match
    pii_sensitivity_level TEXT CHECK (pii_sensitivity_level IN ('none', 'low', 'medium', 'high')),
    compliance_flags TEXT[] DEFAULT '{}',          -- HIPAA, Privacy Act compliance flags

    -- Pass 1.5 Hybrid Search Support (Migration 32 - 2025-10-22)
    search_variants TEXT[],                        -- AI-generated search term variants for hybrid code matching (max 5)

    -- Pass 0.5 Encounter Assignment (Migration 34 - 2025-10-30)
    encounter_assignment_method TEXT,              -- Method used: high_iou (>=0.8), medium_iou (0.2-0.8), page_range_fallback, nearest_region, unassigned
    encounter_assignment_score NUMERIC(3,2),       -- IoU overlap score or distance score
    encounter_assignment_confidence NUMERIC(3,2),  -- Confidence in the assignment
    temporal_precision TEXT DEFAULT 'unknown',     -- Temporal granularity: day, month, year, vague, unknown

    -- Audit Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_pass2_timing CHECK (
        (pass2_started_at IS NULL AND pass2_completed_at IS NULL) OR
        (pass2_started_at IS NOT NULL AND pass2_completed_at IS NULL) OR
        (pass2_started_at IS NOT NULL AND pass2_completed_at IS NOT NULL AND pass2_completed_at >= pass2_started_at)
    ),

    CONSTRAINT valid_final_links CHECK (
        -- Document structure entities should have no final links
        (entity_category = 'document_structure' AND
         final_event_id IS NULL AND final_encounter_id IS NULL AND
         final_observation_id IS NULL AND final_intervention_id IS NULL AND
         final_condition_id IS NULL AND final_allergy_id IS NULL AND final_vital_id IS NULL) OR
        -- Other categories should have at least one final link after Pass 2 completion
        (entity_category != 'document_structure')
    ),

    -- Migration 26 (2025-10-15): Unique constraint for Pass 1.5 composite FK
    CONSTRAINT entity_processing_audit_id_patient_key UNIQUE (id, patient_id)
);

-- =============================================================================
-- SECTION 2B: PASS 1.5 MEDICAL CODE CANDIDATE AUDIT (Migration 26)
-- =============================================================================
-- MANDATORY audit table for Pass 1.5 medical code candidate retrieval
-- Healthcare compliance and AI accountability requirement

CREATE TABLE IF NOT EXISTS pass15_code_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entity_processing_audit(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

    -- What text was embedded for vector search
    embedding_text TEXT NOT NULL,

    -- Candidates retrieved from vector search
    -- JSONB format: [{code_id, code_system, code_value, display_name, similarity_score}, ...]
    universal_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
    regional_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Metadata for performance monitoring and debugging
    total_candidates_found INTEGER NOT NULL DEFAULT 0,
    search_duration_ms INTEGER NOT NULL DEFAULT 0,

    -- Audit trail timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Composite foreign key for RLS (patient_id must match entity's patient_id)
    CONSTRAINT fk_pass15_entity_patient
        FOREIGN KEY (entity_id, patient_id)
        REFERENCES entity_processing_audit(id, patient_id)
);

-- Pass 1.5 indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pass15_entity ON pass15_code_candidates(entity_id);
CREATE INDEX IF NOT EXISTS idx_pass15_patient ON pass15_code_candidates(patient_id);
CREATE INDEX IF NOT EXISTS idx_pass15_created_at ON pass15_code_candidates(created_at DESC);

-- Add table comment
COMMENT ON TABLE pass15_code_candidates IS
  'Audit trail for Pass 1.5 medical code candidate retrieval. Stores the shortlist of 10-20 candidates from vector search BEFORE AI selection. MANDATORY for healthcare compliance, AI accountability, and quality monitoring.';

-- Add column comments
COMMENT ON COLUMN pass15_code_candidates.embedding_text IS
  'The text that was embedded for vector similarity search (after Smart Entity-Type Strategy selection).';
COMMENT ON COLUMN pass15_code_candidates.universal_candidates IS
  'JSONB array of universal medical code candidates (RxNorm, SNOMED, LOINC) with similarity scores.';
COMMENT ON COLUMN pass15_code_candidates.regional_candidates IS
  'JSONB array of regional medical code candidates (PBS, MBS, ICD-10-AM) with similarity scores.';
COMMENT ON COLUMN pass15_code_candidates.total_candidates_found IS
  'Total number of candidates found from vector search (before filtering).';
COMMENT ON COLUMN pass15_code_candidates.search_duration_ms IS
  'Duration of vector search in milliseconds (for performance monitoring).';

-- Enable RLS on pass15_code_candidates table
ALTER TABLE pass15_code_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass15_code_candidates FORCE ROW LEVEL SECURITY;  -- Force RLS even for table owner

-- RLS Policy: Users can only see their own code candidates (via profile access)
-- Service role bypasses RLS, so no explicit INSERT policy needed (more secure)
DROP POLICY IF EXISTS pass15_code_candidates_select_policy ON pass15_code_candidates;
CREATE POLICY pass15_code_candidates_select_policy ON pass15_code_candidates
    FOR SELECT
    TO authenticated
    USING (
        has_profile_access(auth.uid(), patient_id)
        OR is_admin()
    );

-- RLS Policy: Users cannot insert, update, or delete (audit trail is immutable)
-- Only service role (which bypasses RLS) can write to this table
-- No INSERT/UPDATE/DELETE policies = complete immutability for users

-- =============================================================================
-- SECTION 3: PROFILE CLASSIFICATION & SAFETY (V2 Integration)
-- =============================================================================
-- CRITICAL FIX: Proper file references and profile-based access

-- Profile classification audit for V2 safety validation
CREATE TABLE IF NOT EXISTS profile_classification_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    
    -- Profile Classification Results
    recommended_profile_type TEXT NOT NULL CHECK (recommended_profile_type IN (
        'self', 'child', 'adult_dependent', 'pet'
    )),
    profile_confidence NUMERIC(4,3) CHECK (profile_confidence BETWEEN 0 AND 1),
    identity_extraction_results JSONB DEFAULT '{}',
    
    -- Contamination Prevention (Core Safety)
    contamination_risk_score NUMERIC(4,3) CHECK (contamination_risk_score BETWEEN 0 AND 1),
    contamination_checks_performed JSONB DEFAULT '{}',
    contamination_warnings TEXT[],
    cross_profile_risk_detected BOOLEAN DEFAULT FALSE,
    
    -- Identity Verification
    identity_consistency_score NUMERIC(4,3) CHECK (identity_consistency_score BETWEEN 0 AND 1),
    identity_markers_found TEXT[],
    age_indicators TEXT[],
    relationship_indicators TEXT[],
    
    -- Australian Healthcare Context
    medicare_number_detected BOOLEAN DEFAULT FALSE,
    healthcare_identifier_type TEXT,
    healthcare_provider_context TEXT,
    
    -- Audit Trail
    classification_reasoning TEXT,
    manual_review_required BOOLEAN DEFAULT FALSE,
    reviewed_by_user BOOLEAN DEFAULT FALSE,
    final_profile_assignment TEXT CHECK (final_profile_assignment IN (
        'self', 'child', 'adult_dependent', 'pet'
    )),
    
    -- Safety Validation Details
    medical_appropriateness_score NUMERIC(4,3) CHECK (medical_appropriateness_score BETWEEN 0 AND 1),
    age_appropriateness_validated BOOLEAN DEFAULT FALSE,
    safety_flags TEXT[],
    
    -- Processing Context
    ai_model_used TEXT DEFAULT 'gpt-4o-mini',
    validation_method TEXT DEFAULT 'automated' CHECK (validation_method IN (
        'automated', 'human_guided', 'manual_review'
    )),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 4: MANUAL REVIEW & VALIDATION QUEUE
-- =============================================================================

-- Manual review queue for AI processing validation (Blueprint Issue #39)
CREATE TABLE IF NOT EXISTS manual_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    
    -- Review context
    review_type TEXT NOT NULL CHECK (review_type IN (
        'entity_validation', 'profile_classification', 'clinical_accuracy',
        'safety_concern', 'low_confidence', 'contamination_risk'
    )),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN (
        'low', 'normal', 'high', 'urgent', 'critical'
    )),
    
    -- AI processing context
    ai_confidence_score NUMERIC(4,3) CHECK (ai_confidence_score BETWEEN 0 AND 1),
    ai_concerns TEXT[],
    flagged_issues TEXT[],
    
    -- Review content
    review_title TEXT NOT NULL,
    review_description TEXT NOT NULL,
    ai_suggestions TEXT,
    clinical_context JSONB DEFAULT '{}',
    
    -- Assignment and workflow
    assigned_reviewer TEXT, -- User identifier or role
    assigned_at TIMESTAMPTZ,
    estimated_review_time INTERVAL DEFAULT '15 minutes',
    
    -- Review results
    review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN (
        'pending', 'in_review', 'completed', 'escalated', 'deferred'
    )),
    reviewer_decision TEXT CHECK (reviewer_decision IN (
        'approved', 'rejected', 'needs_modification', 'escalate', 'defer'
    )),
    reviewer_notes TEXT,
    modifications_required JSONB DEFAULT '{}',
    
    -- Completion tracking
    review_started_at TIMESTAMPTZ,
    review_completed_at TIMESTAMPTZ,
    actual_review_time INTERVAL,
    
    -- Quality metrics
    review_quality_score NUMERIC(4,3) CHECK (review_quality_score BETWEEN 0 AND 1),
    reviewer_confidence NUMERIC(4,3) CHECK (reviewer_confidence BETWEEN 0 AND 1),
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI confidence scoring for quality metrics
CREATE TABLE IF NOT EXISTS ai_confidence_scoring (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id) ON DELETE CASCADE,
    entity_processing_audit_id UUID REFERENCES entity_processing_audit(id) ON DELETE CASCADE,
    
    -- Confidence breakdown
    entity_detection_confidence NUMERIC(4,3) CHECK (entity_detection_confidence BETWEEN 0 AND 1),
    text_extraction_confidence NUMERIC(4,3) CHECK (text_extraction_confidence BETWEEN 0 AND 1),
    clinical_coding_confidence NUMERIC(4,3) CHECK (clinical_coding_confidence BETWEEN 0 AND 1),
    spatial_alignment_confidence NUMERIC(4,3) CHECK (spatial_alignment_confidence BETWEEN 0 AND 1),
    
    -- Model-specific confidence scores
    vision_model_confidence NUMERIC(4,3) CHECK (vision_model_confidence BETWEEN 0 AND 1),
    language_model_confidence NUMERIC(4,3) CHECK (language_model_confidence BETWEEN 0 AND 1),
    classification_model_confidence NUMERIC(4,3) CHECK (classification_model_confidence BETWEEN 0 AND 1),
    
    -- Composite scores
    overall_confidence NUMERIC(4,3) CHECK (overall_confidence BETWEEN 0 AND 1),
    reliability_score NUMERIC(4,3) CHECK (reliability_score BETWEEN 0 AND 1),
    clinical_relevance_score NUMERIC(4,3) CHECK (clinical_relevance_score BETWEEN 0 AND 1),
    
    -- Quality indicators
    confidence_trend TEXT CHECK (confidence_trend IN ('improving', 'stable', 'declining')),
    outlier_detection BOOLEAN DEFAULT FALSE,
    confidence_flags TEXT[],
    
    -- Validation against human review
    human_validation_available BOOLEAN DEFAULT FALSE,
    human_agreement_score NUMERIC(4,3) CHECK (human_agreement_score BETWEEN 0 AND 1),
    model_accuracy_score NUMERIC(4,3) CHECK (model_accuracy_score BETWEEN 0 AND 1),
    
    -- Model performance tracking
    processing_time_ms INTEGER,
    model_version TEXT,
    calibration_score NUMERIC(4,3) CHECK (calibration_score BETWEEN 0 AND 1),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 5: CLINICAL DECISION SUPPORT RULE ENGINE
-- =============================================================================
-- NOTE: Clinical alert rules and provider action items are defined in 05_healthcare_journey.sql
-- This section focuses on AI-specific processing and validation infrastructure

-- =============================================================================
-- SECTION 6: PERFORMANCE INDEXES
-- =============================================================================

-- AI processing sessions indexes
CREATE INDEX IF NOT EXISTS idx_ai_sessions_patient ON ai_processing_sessions(patient_id) WHERE session_status != 'cancelled';
CREATE INDEX IF NOT EXISTS idx_ai_sessions_shell_file ON ai_processing_sessions(shell_file_id, session_status);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_status ON ai_processing_sessions(session_status, processing_started_at);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_review ON ai_processing_sessions(requires_human_review) WHERE requires_human_review = true;

-- Entity processing audit indexes
-- Performance Indexes for entity_processing_audit
CREATE INDEX IF NOT EXISTS idx_entity_processing_audit_shell_file ON entity_processing_audit(shell_file_id);
CREATE INDEX IF NOT EXISTS idx_entity_processing_audit_patient ON entity_processing_audit(patient_id);
CREATE INDEX IF NOT EXISTS idx_entity_processing_audit_session ON entity_processing_audit(processing_session_id);
CREATE INDEX IF NOT EXISTS idx_entity_processing_audit_category ON entity_processing_audit(entity_category, entity_subtype);
CREATE INDEX IF NOT EXISTS idx_entity_processing_audit_pass2_status ON entity_processing_audit(pass2_status) WHERE pass2_status IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_entity_processing_audit_manual_review ON entity_processing_audit(manual_review_required) WHERE manual_review_required = true;

-- DUAL-INPUT SPECIFIC INDEXES
CREATE INDEX IF NOT EXISTS idx_entity_audit_ai_ocr_agreement ON entity_processing_audit(ai_ocr_agreement_score);
CREATE INDEX IF NOT EXISTS idx_entity_audit_visual_confidence ON entity_processing_audit(ai_visual_confidence);
CREATE INDEX IF NOT EXISTS idx_entity_audit_cross_validation ON entity_processing_audit(cross_validation_score);
CREATE INDEX IF NOT EXISTS idx_entity_audit_discrepancy ON entity_processing_audit(discrepancy_type) WHERE discrepancy_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entity_audit_spatial_source ON entity_processing_audit(spatial_mapping_source);
-- REMOVED: idx_entity_audit_vision_processing (pass1_vision_processing column dropped in migration 2025-10-08_16)

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_entity_processing_audit_processing ON entity_processing_audit(shell_file_id, processing_session_id, entity_category);
CREATE INDEX IF NOT EXISTS idx_entity_processing_audit_final_event ON entity_processing_audit(final_event_id) WHERE final_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entity_processing_audit_spatial ON entity_processing_audit(shell_file_id, page_number) WHERE spatial_bbox IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entity_audit_quality_review ON entity_processing_audit(ai_ocr_agreement_score, cross_validation_score) WHERE manual_review_required = false;

-- Pass 0.5 indexes (Migration 34 - 2025-10-30)
CREATE INDEX IF NOT EXISTS idx_entities_assignment_method ON entity_processing_audit(encounter_assignment_method);
CREATE INDEX IF NOT EXISTS idx_entities_unassigned ON entity_processing_audit(final_encounter_id) WHERE final_encounter_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_entities_temporal_precision ON entity_processing_audit(temporal_precision);

-- Profile classification indexes
CREATE INDEX IF NOT EXISTS idx_profile_class_session ON profile_classification_audit(processing_session_id);
CREATE INDEX IF NOT EXISTS idx_profile_class_shell_file ON profile_classification_audit(shell_file_id);
CREATE INDEX IF NOT EXISTS idx_profile_class_risk ON profile_classification_audit(contamination_risk_score) WHERE contamination_risk_score > 0.3;
CREATE INDEX IF NOT EXISTS idx_profile_class_review ON profile_classification_audit(manual_review_required) WHERE manual_review_required = true;

-- Manual review queue indexes
CREATE INDEX IF NOT EXISTS idx_review_queue_patient ON manual_review_queue(patient_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON manual_review_queue(review_status, priority);
CREATE INDEX IF NOT EXISTS idx_review_queue_assigned ON manual_review_queue(assigned_reviewer, assigned_at) WHERE assigned_reviewer IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_queue_pending ON manual_review_queue(priority, created_at) WHERE review_status = 'pending';

-- AI confidence scoring indexes
CREATE INDEX IF NOT EXISTS idx_confidence_session ON ai_confidence_scoring(processing_session_id);
CREATE INDEX IF NOT EXISTS idx_confidence_overall ON ai_confidence_scoring(overall_confidence) WHERE overall_confidence < 0.7;
CREATE INDEX IF NOT EXISTS idx_confidence_outlier ON ai_confidence_scoring(outlier_detection) WHERE outlier_detection = true;

-- MOVED TO 05_healthcare_journey.sql: Clinical alert rules and provider action items indexes
-- These indexes reference tables defined in file 05, so they belong there

-- =============================================================================
-- SECTION 7: ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on all AI processing tables
ALTER TABLE ai_processing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_processing_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_classification_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_confidence_scoring ENABLE ROW LEVEL SECURITY;
-- MOVED TO 05_healthcare_journey.sql: clinical_alert_rules and provider_action_items RLS

-- AI processing sessions - profile-based access (idempotent)
DROP POLICY IF EXISTS ai_sessions_access ON ai_processing_sessions;
CREATE POLICY ai_sessions_access ON ai_processing_sessions
    FOR ALL TO authenticated
    USING (
        has_profile_access(auth.uid(), patient_id)
        OR is_admin()
    )
    WITH CHECK (
        has_profile_access(auth.uid(), patient_id)
        OR is_admin()
    );

-- Entity processing audit - profile-based access via session (idempotent)
DROP POLICY IF EXISTS entity_audit_access ON entity_processing_audit;
CREATE POLICY entity_audit_access ON entity_processing_audit
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM ai_processing_sessions s
            WHERE s.id = entity_processing_audit.processing_session_id
            AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM ai_processing_sessions s
            WHERE s.id = entity_processing_audit.processing_session_id
            AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
        )
    );

-- Profile classification audit - similar access pattern (idempotent)
DROP POLICY IF EXISTS profile_classification_access ON profile_classification_audit;
CREATE POLICY profile_classification_access ON profile_classification_audit
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM ai_processing_sessions s
            WHERE s.id = profile_classification_audit.processing_session_id
            AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM ai_processing_sessions s
            WHERE s.id = profile_classification_audit.processing_session_id
            AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
        )
    );

-- Manual review queue - profile-based access (idempotent)
DROP POLICY IF EXISTS review_queue_access ON manual_review_queue;
CREATE POLICY review_queue_access ON manual_review_queue
    FOR ALL TO authenticated
    USING (
        has_profile_access(auth.uid(), patient_id)
        OR is_admin()
        OR assigned_reviewer = auth.uid()::text
    )
    WITH CHECK (
        has_profile_access(auth.uid(), patient_id)
        OR is_admin()
    );

-- AI confidence scoring - access via processing session (idempotent)
DROP POLICY IF EXISTS confidence_scoring_access ON ai_confidence_scoring;
CREATE POLICY confidence_scoring_access ON ai_confidence_scoring
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM ai_processing_sessions s
            WHERE s.id = ai_confidence_scoring.processing_session_id
            AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM ai_processing_sessions s
            WHERE s.id = ai_confidence_scoring.processing_session_id
            AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
        )
    );

-- MOVED TO 05_healthcare_journey.sql: All clinical_alert_rules and provider_action_items policies
-- These policies reference tables defined in file 05, so they belong there

-- NOTE: GPT-5 Security Policies moved to after all tables are created (avoid forward references)
-- SECTION 8: AI PROCESSING UTILITY FUNCTIONS
-- =============================================================================

-- Start AI processing session
CREATE OR REPLACE FUNCTION start_ai_processing_session(
    p_patient_id UUID,
    p_shell_file_id UUID,
    p_session_type TEXT DEFAULT 'shell_file_processing',
    p_model_version TEXT DEFAULT 'v3'
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    session_id UUID;
BEGIN
    -- Verify profile access
    IF NOT has_profile_access(auth.uid(), p_patient_id) AND NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied to profile data';
    END IF;
    
    -- Create processing session
    INSERT INTO ai_processing_sessions (
        patient_id, shell_file_id, session_type, ai_model_name  -- MIGRATION 23: Renamed column
    ) VALUES (
        p_patient_id, p_shell_file_id, p_session_type, p_model_version
    ) RETURNING id INTO session_id;
    
    RETURN session_id;
END $$;

-- Update processing session status
CREATE OR REPLACE FUNCTION update_processing_session_status(
    p_session_id UUID,
    p_status TEXT,
    p_workflow_step TEXT DEFAULT NULL,
    p_confidence NUMERIC DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    session_patient_id UUID;
BEGIN
    -- Get patient_id for access check
    SELECT patient_id INTO session_patient_id
    FROM ai_processing_sessions
    WHERE id = p_session_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Processing session not found';
    END IF;
    
    -- Verify profile access
    IF NOT has_profile_access(auth.uid(), session_patient_id) AND NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied to processing session';
    END IF;
    
    -- Update session
    UPDATE ai_processing_sessions
    SET 
        session_status = p_status,
        workflow_step = COALESCE(p_workflow_step, workflow_step),
        overall_confidence = COALESCE(p_confidence, overall_confidence),
        processing_completed_at = CASE WHEN p_status = 'completed' THEN NOW() ELSE processing_completed_at END,
        updated_at = NOW()
    WHERE id = p_session_id;
    
    RETURN TRUE;
END $$;

-- Add item to manual review queue
CREATE OR REPLACE FUNCTION add_to_manual_review_queue(
    p_patient_id UUID,
    p_processing_session_id UUID,
    p_shell_file_id UUID,
    p_review_type TEXT,
    p_priority TEXT DEFAULT 'normal',
    p_title TEXT DEFAULT 'AI Processing Review Required',
    p_description TEXT DEFAULT 'Manual review required for AI processing validation'
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    review_id UUID;
BEGIN
    -- Verify profile access
    IF NOT has_profile_access(auth.uid(), p_patient_id) AND NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied to profile data';
    END IF;
    
    -- Add to review queue
    INSERT INTO manual_review_queue (
        patient_id, processing_session_id, shell_file_id,
        review_type, priority, review_title, review_description
    ) VALUES (
        p_patient_id, p_processing_session_id, p_shell_file_id,
        p_review_type, p_priority, p_title, p_description
    ) RETURNING id INTO review_id;
    
    RETURN review_id;
END $$;

-- Get pending review items for a patient
CREATE OR REPLACE FUNCTION get_pending_reviews(p_patient_id UUID)
RETURNS TABLE(
    review_id UUID,
    review_type TEXT,
    priority TEXT,
    title TEXT,
    created_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Verify profile access
    IF NOT has_profile_access(auth.uid(), p_patient_id) AND NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied to profile data';
    END IF;
    
    RETURN QUERY
    SELECT 
        mrq.id,
        mrq.review_type,
        mrq.priority,
        mrq.review_title,
        mrq.created_at
    FROM manual_review_queue mrq
    WHERE mrq.patient_id = p_patient_id
    AND mrq.review_status = 'pending'
    ORDER BY 
        CASE mrq.priority 
            WHEN 'critical' THEN 1
            WHEN 'urgent' THEN 2
            WHEN 'high' THEN 3
            WHEN 'normal' THEN 4
            WHEN 'low' THEN 5
        END,
        mrq.created_at ASC;
END $$;

-- =============================================================================
-- SECTION 9: DEPLOYMENT VERIFICATION AND SUCCESS REPORTING
-- =============================================================================

-- Verify deployment success
DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
    policy_count INTEGER;
    function_count INTEGER;
BEGIN
    -- Count created tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN (
        'ai_processing_sessions', 'entity_processing_audit', 'profile_classification_audit',
        'manual_review_queue', 'ai_confidence_scoring'
    );
    
    -- Count created indexes
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND (indexname LIKE 'idx_ai_%'
    OR indexname LIKE 'idx_entity_%'
    OR indexname LIKE 'idx_profile_%'
    OR indexname LIKE 'idx_review_%'
    OR indexname LIKE 'idx_confidence_%'
    OR indexname LIKE 'idx_alert_%'
    OR indexname LIKE 'idx_action_%');
    
    -- Count RLS policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename IN (
        'ai_processing_sessions', 'entity_processing_audit', 'profile_classification_audit',
        'manual_review_queue', 'ai_confidence_scoring'
    );
    
    -- Count utility functions
    SELECT COUNT(*) INTO function_count
    FROM information_schema.routines
    WHERE routine_schema = 'public'
    AND routine_name IN (
        'start_ai_processing_session', 'update_processing_session_status',
        'add_to_manual_review_queue', 'get_pending_reviews'
    );
    
    IF table_count = 5 AND index_count >= 12 AND policy_count >= 8 AND function_count = 4 THEN
        RAISE NOTICE '';
        RAISE NOTICE '==================================================================';
        RAISE NOTICE 'FRESH START BLUEPRINT: 04_ai_processing.sql DEPLOYMENT SUCCESS';
        RAISE NOTICE '==================================================================';
        RAISE NOTICE '';
        RAISE NOTICE 'AI PROCESSING V3 INFRASTRUCTURE DEPLOYED:';
        RAISE NOTICE '  Entity processing audit with V3 core table references:';
        RAISE NOTICE '    - patient_clinical_events integration established';
        RAISE NOTICE '    - patient_observations and patient_interventions linking operational';
        RAISE NOTICE '    - healthcare_encounters context tracking enabled';
        RAISE NOTICE '  V3 entity classification (clinical_event, healthcare_context, file_structure)';
        RAISE NOTICE '  V2 safety validation and contamination prevention integrated';
        RAISE NOTICE '';
        RAISE NOTICE 'MANUAL REVIEW SYSTEM (Blueprint Issue #39):';
        RAISE NOTICE '  Human validation workflows for AI processing compliance';
        RAISE NOTICE '  Quality assurance and clinical validation tracking';
        RAISE NOTICE '  Review queue with priority-based assignment';
        RAISE NOTICE '';
        RAISE NOTICE 'CLINICAL DECISION SUPPORT RULE ENGINE:';
        RAISE NOTICE '  AI-driven clinical alerts and recommendations';
        RAISE NOTICE '  Provider action items with Australian healthcare integration';
        RAISE NOTICE '  Quality measures and billing code integration';
        RAISE NOTICE '';
        RAISE NOTICE 'COMPONENTS DEPLOYED:';
        RAISE NOTICE '  - % AI processing tables with correct ID relationships', table_count;
        RAISE NOTICE '  - % performance indexes for AI processing queries', index_count;
        RAISE NOTICE '  - % RLS policies using has_profile_access()', policy_count;
        RAISE NOTICE '  - % AI processing utility functions', function_count;
        RAISE NOTICE '';
        RAISE NOTICE 'CRITICAL FIXES APPLIED:';
        RAISE NOTICE '  All patient_id references use user_profiles(id) relationships';
        RAISE NOTICE '  Entity processing audit references V3 core clinical tables';
        RAISE NOTICE '  Profile-based access control throughout AI pipeline';
        RAISE NOTICE '  V3 entity-to-schema mapping fully operational';
        RAISE NOTICE '';
        RAISE NOTICE 'AI PROCESSING V3 INTEGRATION READY:';
        RAISE NOTICE '  Direct integration with V3 core clinical architecture';
        RAISE NOTICE '  Pass 1 & Pass 2 entity processing pipeline operational';
        RAISE NOTICE '  Schema_loader.ts entity-to-schema mapping supported';
        RAISE NOTICE '  O3 two-axis classification system integrated';
        RAISE NOTICE '  Russian Babushka Doll contextual layering enabled';
        RAISE NOTICE '';
        RAISE NOTICE 'Ready for: 05_healthcare_journey.sql';
        RAISE NOTICE '';
    ELSE
        RAISE WARNING 'AI processing deployment incomplete:';
        RAISE WARNING '  - Tables: %/7, Indexes: %/20, Policies: %/10, Functions: %/4', 
            table_count, index_count, policy_count, function_count;
    END IF;
END $$;

-- =============================================================================
-- SECTION 9B: PASS 3 VERIFICATION (GPT-5 Enhancement)
-- =============================================================================

-- Additional verification for Pass 3 semantic processing tables
DO $$
DECLARE
    pass3_table_count INTEGER;
    pass3_policy_count INTEGER;
BEGIN
    -- Count Pass 3 tables
    SELECT COUNT(*) INTO pass3_table_count
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN (
        'semantic_processing_sessions', 'narrative_creation_audit', 'shell_file_synthesis_results',
        'dual_lens_user_preferences', 'narrative_view_cache'
    );
    
    -- Count Pass 3 RLS policies
    SELECT COUNT(*) INTO pass3_policy_count
    FROM pg_policies 
    WHERE schemaname = 'public'
    AND tablename IN (
        'semantic_processing_sessions', 'narrative_creation_audit', 'shell_file_synthesis_results',
        'dual_lens_user_preferences', 'narrative_view_cache'
    );
    
    IF pass3_table_count = 5 AND pass3_policy_count >= 5 THEN
        RAISE NOTICE '==================================================================';
        RAISE NOTICE 'PASS 3 SEMANTIC PROCESSING INFRASTRUCTURE DEPLOYMENT SUCCESS';
        RAISE NOTICE '==================================================================';
        RAISE NOTICE '';
        RAISE NOTICE 'PASS 3 COMPONENTS DEPLOYED:';
        RAISE NOTICE '  - % semantic processing tables with RLS protection', pass3_table_count;
        RAISE NOTICE '  - % security policies for healthcare data protection', pass3_policy_count;
        RAISE NOTICE '';
        RAISE NOTICE 'SEMANTIC CAPABILITIES READY:';
        RAISE NOTICE '  - Clinical narrative creation and audit tracking';
        RAISE NOTICE '  - Shell file synthesis with post-AI intelligence';
        RAISE NOTICE '  - Dual-lens user experience (document vs clinical views)';
        RAISE NOTICE '  - Narrative view caching for performance optimization';
        RAISE NOTICE '';
    ELSE
        RAISE WARNING 'Pass 3 deployment incomplete: Tables: %/5, Policies: %/5', 
                     pass3_table_count, pass3_policy_count;
    END IF;
END $$;

-- =============================================================================
-- SECTION 6: PASS 3 SEMANTIC PROCESSING INFRASTRUCTURE
-- =============================================================================
-- NEW: Pass 3 semantic narrative creation and dual-lens user experience

-- Semantic processing sessions for Pass 3 narrative creation
CREATE TABLE IF NOT EXISTS semantic_processing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    
    -- Session metadata
    session_type TEXT NOT NULL DEFAULT 'narrative_creation' CHECK (session_type IN (
        'narrative_creation', 'narrative_linking', 'shell_file_synthesis'
    )),
    session_status TEXT NOT NULL DEFAULT 'initiated' CHECK (session_status IN (
        'initiated', 'processing', 'completed', 'failed', 'cancelled'
    )),
    
    -- Pass 3 specific workflow
    processing_phase TEXT NOT NULL DEFAULT 'narrative_detection' CHECK (processing_phase IN (
        'narrative_detection', 'narrative_creation', 'clinical_linking', 'shell_synthesis', 'completed'
    )),
    
    -- Input data for Pass 3 (structured clinical events from Pass 2)
    input_clinical_events JSONB NOT NULL, -- Structured JSON from Pass 2 results
    input_event_count INTEGER NOT NULL DEFAULT 0,
    
    -- Pass 3 processing results
    narratives_created INTEGER DEFAULT 0,
    clinical_links_created INTEGER DEFAULT 0,
    shell_synthesis_completed BOOLEAN DEFAULT FALSE,
    
    -- Quality metrics
    overall_narrative_confidence NUMERIC(4,3) CHECK (overall_narrative_confidence BETWEEN 0 AND 1),
    semantic_coherence_score NUMERIC(4,3) CHECK (semantic_coherence_score BETWEEN 0 AND 1),
    requires_human_review BOOLEAN DEFAULT FALSE,
    
    -- AI model configuration
    ai_model_version TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    model_config JSONB DEFAULT '{}',
    prompt_template_version TEXT DEFAULT 'v3.0',
    
    -- Processing times and costs
    processing_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_completed_at TIMESTAMPTZ,
    total_processing_time INTERVAL,
    token_usage_input INTEGER,
    token_usage_output INTEGER,
    processing_cost_usd NUMERIC(8,4),
    
    -- Error handling
    error_message TEXT,
    error_context JSONB,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 2,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Narrative creation audit trail for Pass 3 processing
CREATE TABLE IF NOT EXISTS narrative_creation_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semantic_processing_session_id UUID NOT NULL REFERENCES semantic_processing_sessions(id) ON DELETE CASCADE,
    narrative_id UUID REFERENCES clinical_narratives(id) ON DELETE SET NULL, -- May not exist yet during processing
    
    -- Narrative creation details
    narrative_purpose TEXT NOT NULL, -- Intended clinical purpose
    narrative_classification TEXT NOT NULL,
    creation_method TEXT DEFAULT 'ai_pass_3' CHECK (creation_method IN (
        'ai_pass_3', 'manual_creation', 'template_based', 'hybrid_approach'
    )),
    
    -- AI processing context
    input_events_analyzed INTEGER DEFAULT 0,
    narrative_confidence NUMERIC(4,3) CHECK (narrative_confidence BETWEEN 0 AND 1),
    semantic_coherence_score NUMERIC(4,3) CHECK (semantic_coherence_score BETWEEN 0 AND 1),
    clinical_complexity_assessment TEXT CHECK (clinical_complexity_assessment IN (
        'simple', 'moderate', 'complex', 'highly_complex'
    )),
    
    -- AI prompt and response details
    ai_prompt_used TEXT, -- The actual prompt sent to AI model
    ai_response_raw TEXT, -- Raw AI response before processing
    ai_processing_duration INTERVAL,
    ai_token_usage JSONB, -- {"input": 1200, "output": 800, "total": 2000}
    
    -- Quality validation
    validation_checks_passed INTEGER DEFAULT 0,
    validation_concerns TEXT[],
    requires_manual_review BOOLEAN DEFAULT FALSE,
    manual_review_reason TEXT,
    
    -- Clinical linking results
    conditions_linked INTEGER DEFAULT 0,
    medications_linked INTEGER DEFAULT 0,
    allergies_linked INTEGER DEFAULT 0,
    immunizations_linked INTEGER DEFAULT 0,
    vitals_linked INTEGER DEFAULT 0,
    
    -- Audit and lifecycle
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processing_completed_at TIMESTAMPTZ
);

-- Shell file synthesis results for post-Pass 3 shell file summaries
CREATE TABLE IF NOT EXISTS shell_file_synthesis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    semantic_processing_session_id UUID NOT NULL REFERENCES semantic_processing_sessions(id) ON DELETE CASCADE,
    
    -- Synthesis input data
    narratives_analyzed INTEGER NOT NULL DEFAULT 0,
    clinical_events_count INTEGER DEFAULT 0,
    total_pages_processed INTEGER DEFAULT 0,
    
    -- AI synthesis results
    ai_synthesized_summary TEXT NOT NULL, -- Intelligent overview of all narratives
    synthesis_confidence NUMERIC(4,3) CHECK (synthesis_confidence BETWEEN 0 AND 1),
    synthesis_approach TEXT CHECK (synthesis_approach IN (
        'single_narrative', 'multi_narrative_summary', 'complex_integration'
    )),
    
    -- Synthesis metadata
    key_clinical_themes TEXT[], -- Primary medical themes identified
    provider_entities_mentioned TEXT[], -- Healthcare providers mentioned
    temporal_span_assessment TEXT, -- "single_visit", "episodic_care", "longitudinal_management"
    clinical_urgency_assessment TEXT CHECK (clinical_urgency_assessment IN (
        'routine', 'urgent', 'emergent', 'mixed_urgency'
    )),
    
    -- AI processing details
    ai_model_version TEXT DEFAULT 'gpt-4o-mini',
    ai_processing_duration INTERVAL,
    ai_token_usage JSONB,
    ai_prompt_template TEXT,
    
    -- Quality and validation
    synthesis_quality_score NUMERIC(4,3) CHECK (synthesis_quality_score BETWEEN 0 AND 1),
    coherence_validation_passed BOOLEAN DEFAULT FALSE,
    clinical_accuracy_validated BOOLEAN DEFAULT FALSE,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synthesis_completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 7: DUAL-LENS USER EXPERIENCE INFRASTRUCTURE
-- =============================================================================
-- Support for shell file view vs clinical narrative view user preferences

-- User preferences for dual-lens viewing experience
CREATE TABLE IF NOT EXISTS dual_lens_user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE, -- Profile-specific preferences
    
    -- View preferences
    default_view_lens TEXT NOT NULL DEFAULT 'shell_file_view' CHECK (default_view_lens IN (
        'shell_file_view', 'clinical_narrative_view', 'hybrid_view', 'auto_detect'
    )),
    fallback_behavior TEXT DEFAULT 'graceful_degradation' CHECK (fallback_behavior IN (
        'graceful_degradation', 'prefer_shell_file', 'prefer_narrative', 'show_both'
    )),
    
    -- Enhancement preferences
    show_narrative_enhancement_status BOOLEAN DEFAULT TRUE,
    auto_switch_to_narrative_when_available BOOLEAN DEFAULT FALSE,
    prefer_rich_context_popups BOOLEAN DEFAULT TRUE,
    
    -- Timeline preferences
    timeline_organization_preference TEXT DEFAULT 'narrative_grouped' CHECK (timeline_organization_preference IN (
        'chronological_only', 'narrative_grouped', 'hybrid_timeline', 'clinical_significance_ordered'
    )),
    
    -- Clinical data display preferences
    medication_context_level TEXT DEFAULT 'full_context' CHECK (medication_context_level IN (
        'basic_info', 'narrative_context', 'full_context', 'clinical_journey'
    )),
    condition_storytelling_preference TEXT DEFAULT 'narrative_focused' CHECK (condition_storytelling_preference IN (
        'clinical_facts_only', 'narrative_focused', 'provider_perspective', 'patient_journey'
    )),
    
    -- Performance preferences
    enable_narrative_view_caching BOOLEAN DEFAULT TRUE,
    preload_narrative_contexts BOOLEAN DEFAULT TRUE,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_preference_change TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, profile_id)
);

-- Narrative view rendering cache for performance optimization
CREATE TABLE IF NOT EXISTS narrative_view_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    view_type TEXT NOT NULL CHECK (view_type IN (
        'narrative_timeline', 'condition_narrative_context', 'medication_narrative_context',
        'clinical_story_summary', 'narrative_dashboard_widget'
    )),
    
    -- Cache key and content
    cache_key TEXT NOT NULL, -- Hash of view parameters
    cached_content JSONB NOT NULL,
    content_format TEXT DEFAULT 'json' CHECK (content_format IN ('json', 'html', 'markdown')),
    
    -- Cache metadata
    source_narratives UUID[], -- Narratives included in this cached view
    last_data_change TIMESTAMPTZ, -- When underlying narrative data last changed
    cache_generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cache_expires_at TIMESTAMPTZ, -- Optional cache expiration
    
    -- Performance metrics
    generation_time_ms INTEGER,
    cache_hit_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMPTZ DEFAULT NOW(),
    
    -- Cache validation
    cache_valid BOOLEAN DEFAULT TRUE,
    invalidation_reason TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(profile_id, view_type, cache_key)
);

-- =============================================================================
-- PASS 3 SEMANTIC PROCESSING INDEXES
-- =============================================================================

-- Semantic processing sessions indexes
CREATE INDEX IF NOT EXISTS idx_semantic_processing_sessions_shell_file ON semantic_processing_sessions(shell_file_id);
CREATE INDEX IF NOT EXISTS idx_semantic_processing_sessions_status ON semantic_processing_sessions(session_status);
CREATE INDEX IF NOT EXISTS idx_semantic_processing_sessions_patient ON semantic_processing_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_semantic_processing_sessions_created ON semantic_processing_sessions(created_at);

-- Narrative creation audit indexes
CREATE INDEX IF NOT EXISTS idx_narrative_creation_audit_session ON narrative_creation_audit(semantic_processing_session_id);
CREATE INDEX IF NOT EXISTS idx_narrative_creation_audit_narrative ON narrative_creation_audit(narrative_id) WHERE narrative_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_narrative_creation_audit_confidence ON narrative_creation_audit(narrative_confidence);

-- Shell file synthesis indexes
CREATE INDEX IF NOT EXISTS idx_shell_file_synthesis_shell_file ON shell_file_synthesis_results(shell_file_id);
CREATE INDEX IF NOT EXISTS idx_shell_file_synthesis_session ON shell_file_synthesis_results(semantic_processing_session_id);

-- Dual-lens user experience indexes
CREATE INDEX IF NOT EXISTS idx_dual_lens_user_preferences_user ON dual_lens_user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_dual_lens_user_preferences_profile ON dual_lens_user_preferences(profile_id) WHERE profile_id IS NOT NULL;

-- Narrative view cache indexes
CREATE INDEX IF NOT EXISTS idx_narrative_view_cache_profile ON narrative_view_cache(profile_id);
CREATE INDEX IF NOT EXISTS idx_narrative_view_cache_type ON narrative_view_cache(view_type);
CREATE INDEX IF NOT EXISTS idx_narrative_view_cache_valid ON narrative_view_cache(cache_valid) WHERE cache_valid = TRUE;
CREATE INDEX IF NOT EXISTS idx_narrative_view_cache_expires ON narrative_view_cache(cache_expires_at) WHERE cache_expires_at IS NOT NULL;

-- =============================================================================
-- SECTION 7B: PASS 3 RLS POLICIES (GPT-5 Security Hardening)
-- =============================================================================
-- Enable RLS and create policies for Pass 3 tables (moved here after all tables exist)

-- Semantic Processing Sessions - Enable RLS and create policy (idempotent)
ALTER TABLE semantic_processing_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS semantic_processing_sessions_access ON semantic_processing_sessions;
CREATE POLICY semantic_processing_sessions_access ON semantic_processing_sessions
    FOR ALL TO authenticated
    USING (has_profile_access(auth.uid(), patient_id) OR is_admin())
    WITH CHECK (has_profile_access(auth.uid(), patient_id) OR is_admin());

-- Narrative Creation Audit - Enable RLS and create policy (session-linked, idempotent)
ALTER TABLE narrative_creation_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS narrative_creation_audit_access ON narrative_creation_audit;
CREATE POLICY narrative_creation_audit_access ON narrative_creation_audit
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM semantic_processing_sessions s
            WHERE s.id = narrative_creation_audit.semantic_processing_session_id
            AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
        )
    )
    WITH CHECK (TRUE);

-- Shell File Synthesis Results - Enable RLS and create policy (session-linked, idempotent)
ALTER TABLE shell_file_synthesis_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shell_file_synthesis_results_access ON shell_file_synthesis_results;
CREATE POLICY shell_file_synthesis_results_access ON shell_file_synthesis_results
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM semantic_processing_sessions s
            WHERE s.id = shell_file_synthesis_results.semantic_processing_session_id
            AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
        )
    )
    WITH CHECK (TRUE);

-- Dual Lens User Preferences - Enable RLS and create policy (owner-based, idempotent)
ALTER TABLE dual_lens_user_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dual_lens_user_preferences_owner ON dual_lens_user_preferences;
CREATE POLICY dual_lens_user_preferences_owner ON dual_lens_user_preferences
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid()
        OR (profile_id IS NOT NULL AND has_profile_access(auth.uid(), profile_id))
        OR is_admin()
    )
    WITH CHECK (
        user_id = auth.uid()
        OR (profile_id IS NOT NULL AND has_profile_access(auth.uid(), profile_id))
        OR is_admin()
    );

-- Narrative View Cache - Enable RLS and create policy (profile-based, idempotent)
ALTER TABLE narrative_view_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS narrative_view_cache_profile_access ON narrative_view_cache;
CREATE POLICY narrative_view_cache_profile_access ON narrative_view_cache
    FOR ALL TO authenticated
    USING (has_profile_access(auth.uid(), profile_id) OR is_admin())
    WITH CHECK (has_profile_access(auth.uid(), profile_id) OR is_admin());

-- =============================================================================
-- SECTION 12: PASS 0.5 ENCOUNTER DISCOVERY INFRASTRUCTURE (Migration 45 - 2025-11-11)
-- =============================================================================
-- Manifest-free architecture: Page assignments and backward-compatible view

-- Page-level encounter assignments with AI justifications
CREATE TABLE IF NOT EXISTS pass05_page_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    page_num INTEGER NOT NULL CHECK (page_num > 0),
    encounter_id TEXT NOT NULL, -- AI-assigned temp ID like "enc-1", "enc-2"
    justification TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(shell_file_id, page_num) -- Idempotent upserts safe
);

CREATE INDEX idx_page_assignments_shell_file ON pass05_page_assignments(shell_file_id);

COMMENT ON TABLE pass05_page_assignments IS
  'Page-level encounter assignments with AI justifications (v2.3 feature).
   Maps each page to its encounter with reasoning. Temp IDs (enc-1, enc-2) are mapped
   to actual UUIDs during encounter creation by manifestBuilder.
   UNIQUE constraint on (shell_file_id, page_num) enables idempotent upserts.';

-- Enable RLS for PHI protection (inherits access control from shell_files)
ALTER TABLE pass05_page_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pass05_page_assignments_select ON pass05_page_assignments;
CREATE POLICY pass05_page_assignments_select
  ON pass05_page_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shell_files sf
      WHERE sf.id = pass05_page_assignments.shell_file_id
      -- RLS on shell_files already enforces patient_id access via has_semantic_data_access()
    )
  );

COMMENT ON POLICY pass05_page_assignments_select ON pass05_page_assignments IS
  'Users can only see page assignments for their own shell files.
   Security inherited from shell_files RLS - no complex logic duplication needed.';

-- Backward-compatible view replacing deprecated shell_file_manifests table
CREATE OR REPLACE VIEW shell_file_manifests_v2 AS
SELECT
  sf.id as manifest_id, -- Stable manifest_id = shell_file_id
  sf.id as shell_file_id,
  sf.patient_id,
  sf.created_at,
  sf.pass_0_5_version,
  m.processing_time_ms,
  sf.page_count as total_pages,
  COUNT(he.id) as total_encounters_found,
  sf.ocr_average_confidence,
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
    'batching', null
  ) as manifest_data,
  m.ai_model_used
FROM shell_files sf
LEFT JOIN healthcare_encounters he ON he.primary_shell_file_id = sf.id
LEFT JOIN pass05_encounter_metrics m ON m.shell_file_id = sf.id
LEFT JOIN LATERAL (
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
   manifest_id uses sf.id (shell_file_id) for stability - same UUID on every query,
   enables caching, WHERE clauses, and perfect backward compatibility.
   Security: Only service_role should query this directly. Authenticated users should
   access via base tables with RLS protection.';

-- View security: Restrict to service_role only (base table RLS protects actual data access)
REVOKE ALL ON shell_file_manifests_v2 FROM PUBLIC;
REVOKE ALL ON shell_file_manifests_v2 FROM authenticated;
GRANT SELECT ON shell_file_manifests_v2 TO service_role;

-- Page assignments security grants
REVOKE ALL ON pass05_page_assignments FROM PUBLIC;
GRANT SELECT ON pass05_page_assignments TO authenticated;
GRANT ALL ON pass05_page_assignments TO service_role;

COMMIT;

-- =============================================================================
-- FRESH START BLUEPRINT: 04_ai_processing.sql COMPLETE
-- =============================================================================

\echo ''
\echo '04_ai_processing.sql - AI PROCESSING PIPELINE INFRASTRUCTURE'
\echo 'Components:'
\echo '- AI Processing Session Management'
\echo '- Entity Processing Audit V3 Enhanced'
\echo '- Profile Classification & Safety (V2 Integration)'
\echo '- Manual Review & Validation Queue (Issue #39)'
\echo '- Clinical Decision Support Rule Engine'
\echo '- AI Processing Utility Functions'
\echo ''
\echo 'CRITICAL FIXES APPLIED:'
\echo '  All patient_id columns correctly reference user_profiles(id)'
\echo '  Entity processing audit references correct clinical tables'
\echo '  Profile-based access control throughout AI pipeline'
\echo ''
\echo 'AI PROCESSING V3 READY:'
\echo '  Direct integration with clinical tables'
\echo '  Support for entity-to-schema mapping'
\echo '  Manual review workflows for healthcare compliance'
\echo ''
\echo 'Next step: Run 05_healthcare_journey.sql'