-- ============================================================================
-- Migration: Add Pass 1.5 Medical Code Versioning and Audit Tables
-- Date: 2025-10-15
-- Issue: Prepare database for Pass 1.5 medical code embedding system
--
-- PROBLEM:
--   Pass 1.5 medical code embedding system requires:
--   1. Versioning fields for medical code library updates (quarterly updates)
--   2. Audit table for code candidate retrieval (healthcare compliance)
--   Current tables (universal_medical_codes, regional_medical_codes) lack
--   versioning fields needed for tracking deprecated codes and library versions.
--
-- SOLUTION:
--   1. Add versioning fields to universal_medical_codes table
--   2. Add versioning fields to regional_medical_codes table
--   3. Create pass15_code_candidates audit table (MANDATORY for compliance)
--   4. Add indexes for efficient querying
--
-- AFFECTED TABLES:
--   - universal_medical_codes (ALTER - add 4 columns)
--   - regional_medical_codes (ALTER - add 4 columns)
--   - pass15_code_candidates (CREATE new table)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/03_clinical_core.sql (Lines 1252-1296: Medical code versioning added)
--   [X] current_schema/04_ai_processing.sql (Lines 369-443: pass15_code_candidates table added)
--
-- DOWNSTREAM UPDATES:
--   [ ] Pass 1.5 bridge schemas (not yet created)
--   [ ] TypeScript types (not yet created)
--
-- EXECUTION DATE: 2025-10-15
-- STATUS: COMPLETE ✓
-- ============================================================================

-- Step 1: Add versioning fields to universal_medical_codes
-- These fields enable quarterly medical code library updates without table replacement
ALTER TABLE universal_medical_codes
  ADD COLUMN IF NOT EXISTS library_version VARCHAR(20) DEFAULT 'v1.0',
  ADD COLUMN IF NOT EXISTS valid_from DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS valid_to DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS superseded_by UUID DEFAULT NULL;

-- Add foreign key for superseded_by (links to replacement code)
ALTER TABLE universal_medical_codes
  ADD CONSTRAINT IF NOT EXISTS fk_universal_superseded_by
    FOREIGN KEY (superseded_by) REFERENCES universal_medical_codes(id);

-- Add index for active code queries (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_universal_codes_active
  ON universal_medical_codes(code_system, active, valid_to);

-- Add comment explaining versioning strategy
COMMENT ON COLUMN universal_medical_codes.library_version IS
  'Medical code library version (e.g., v1.0, v2024Q1). Used for tracking quarterly updates.';
COMMENT ON COLUMN universal_medical_codes.valid_from IS
  'Date this code became active. Used for historical lookups.';
COMMENT ON COLUMN universal_medical_codes.valid_to IS
  'Date this code was deprecated. NULL = currently active. Used to filter deprecated codes.';
COMMENT ON COLUMN universal_medical_codes.superseded_by IS
  'UUID of replacement code if this code was deprecated. Enables graceful code transitions.';

-- Step 2: Add versioning fields to regional_medical_codes
-- Same versioning strategy as universal codes
ALTER TABLE regional_medical_codes
  ADD COLUMN IF NOT EXISTS library_version VARCHAR(20) DEFAULT 'v1.0',
  ADD COLUMN IF NOT EXISTS valid_from DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS valid_to DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS superseded_by UUID DEFAULT NULL;

-- Add foreign key for superseded_by
ALTER TABLE regional_medical_codes
  ADD CONSTRAINT IF NOT EXISTS fk_regional_superseded_by
    FOREIGN KEY (superseded_by) REFERENCES regional_medical_codes(id);

-- Add index for active code queries
CREATE INDEX IF NOT EXISTS idx_regional_codes_active
  ON regional_medical_codes(code_system, country_code, active, valid_to);

-- Add comments
COMMENT ON COLUMN regional_medical_codes.library_version IS
  'Regional medical code library version (e.g., v1.0, v2024Q1).';
COMMENT ON COLUMN regional_medical_codes.valid_from IS
  'Date this regional code became active.';
COMMENT ON COLUMN regional_medical_codes.valid_to IS
  'Date this regional code was deprecated. NULL = currently active.';
COMMENT ON COLUMN regional_medical_codes.superseded_by IS
  'UUID of replacement code if this regional code was deprecated.';

-- Step 3A: Add unique constraint to entity_processing_audit for composite FK
-- Required for pass15_code_candidates composite foreign key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'entity_processing_audit_id_patient_key'
  ) THEN
    ALTER TABLE entity_processing_audit
      ADD CONSTRAINT entity_processing_audit_id_patient_key UNIQUE (id, patient_id);
    RAISE NOTICE 'Added unique constraint entity_processing_audit(id, patient_id)';
  END IF;
END $$;

-- Step 3B: Create pass15_code_candidates audit table
-- MANDATORY for healthcare compliance and AI accountability
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

-- Add indexes for efficient querying
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

-- Step 4: Enable RLS on pass15_code_candidates table
ALTER TABLE pass15_code_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass15_code_candidates FORCE ROW LEVEL SECURITY;  -- Force RLS even for table owner

-- RLS Policy: Users can only see their own code candidates (via profile access)
-- Service role bypasses RLS, so no explicit INSERT policy needed (more secure)
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

-- Step 5: Create RPC functions for Pass 1.5 vector similarity search
-- These functions are called by the Pass 1.5 worker to retrieve medical code candidates

-- RPC: Search universal medical codes (RxNorm, SNOMED, LOINC) via pgvector
CREATE OR REPLACE FUNCTION search_universal_codes(
  query_embedding vector(1536),
  entity_type text DEFAULT NULL,
  max_results integer DEFAULT 20
)
RETURNS TABLE (
  code_id uuid,
  code_system varchar(20),
  code_value varchar(50),
  display_name text,
  similarity_score float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    id as code_id,
    universal_medical_codes.code_system,
    universal_medical_codes.code_value,
    universal_medical_codes.display_name,
    (1 - (embedding <=> query_embedding))::float as similarity_score
  FROM universal_medical_codes
  WHERE active = true
    AND valid_to IS NULL  -- Only active codes
    AND (entity_type IS NULL OR universal_medical_codes.entity_type = entity_type)
  ORDER BY embedding <=> query_embedding  -- Cosine distance (smaller = more similar)
  LIMIT max_results;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION search_universal_codes(vector, text, integer) TO service_role;

-- Add comment
COMMENT ON FUNCTION search_universal_codes IS
  'Vector similarity search for universal medical codes (RxNorm, SNOMED, LOINC). Returns top-K candidates sorted by cosine similarity. Used by Pass 1.5 medical code embedding system.';

-- RPC: Search regional medical codes (PBS, MBS, ICD-10-AM) via pgvector
CREATE OR REPLACE FUNCTION search_regional_codes(
  query_embedding vector(1536),
  entity_type text DEFAULT NULL,
  country_code char(3) DEFAULT 'AUS',
  max_results integer DEFAULT 20
)
RETURNS TABLE (
  code_id uuid,
  code_system varchar(20),
  code_value varchar(50),
  display_name text,
  similarity_score float,
  country_code char(3)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    id as code_id,
    regional_medical_codes.code_system,
    regional_medical_codes.code_value,
    regional_medical_codes.display_name,
    (1 - (embedding <=> query_embedding))::float as similarity_score,
    regional_medical_codes.country_code
  FROM regional_medical_codes
  WHERE active = true
    AND valid_to IS NULL  -- Only active codes
    AND regional_medical_codes.country_code = search_regional_codes.country_code
    AND (entity_type IS NULL OR regional_medical_codes.entity_type = entity_type)
  ORDER BY embedding <=> query_embedding  -- Cosine distance (smaller = more similar)
  LIMIT max_results;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION search_regional_codes(vector, text, char, integer) TO service_role;

-- Add comment
COMMENT ON FUNCTION search_regional_codes IS
  'Vector similarity search for regional medical codes (PBS, MBS, ICD-10-AM). Returns top-K candidates filtered by country code and sorted by cosine similarity. Used by Pass 1.5 medical code embedding system.';

-- Verification Queries
-- Verify versioning fields added to universal_medical_codes
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'universal_medical_codes'
--   AND column_name IN ('library_version', 'valid_from', 'valid_to', 'superseded_by');

-- Verify versioning fields added to regional_medical_codes
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'regional_medical_codes'
--   AND column_name IN ('library_version', 'valid_from', 'valid_to', 'superseded_by');

-- Verify pass15_code_candidates table created
-- SELECT table_name, table_type
-- FROM information_schema.tables
-- WHERE table_name = 'pass15_code_candidates';

-- Verify RLS enabled
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE tablename = 'pass15_code_candidates';

-- Rollback Script (if needed)
-- WARNING: This will remove versioning capability and audit trail
--
-- ALTER TABLE universal_medical_codes
--   DROP COLUMN IF EXISTS library_version,
--   DROP COLUMN IF EXISTS valid_from,
--   DROP COLUMN IF EXISTS valid_to,
--   DROP COLUMN IF EXISTS superseded_by;
--
-- ALTER TABLE regional_medical_codes
--   DROP COLUMN IF EXISTS library_version,
--   DROP COLUMN IF EXISTS valid_from,
--   DROP COLUMN IF EXISTS valid_to,
--   DROP COLUMN IF EXISTS superseded_by;
--
-- DROP TABLE IF EXISTS pass15_code_candidates CASCADE;
