-- ============================================================================
-- Migration: OCR Artifacts Table for Persistence and Reuse
-- Date: 2025-10-10
-- Issue: No persistence of OCR results causing re-processing on retries
--
-- PROBLEM:
--   Currently OCR results are embedded in job_queue.job_payload as base64 blobs,
--   causing several issues:
--   1. Re-OCR required on job retries (2-4 minutes + API costs)
--   2. No OCR reuse across Pass 1, Pass 2, Pass 3 
--   3. No frontend access to bboxes for click-to-zoom
--   4. Job payload bloat (1.4MB+ per job)
--   5. Cannot debug OCR quality independently of AI processing
--   6. Edge Function timeouts from 2-4 minute OCR processing blocking uploads
--
-- SOLUTION:
--   Create ocr_artifacts table to index OCR results stored in Supabase Storage.
--   OCR results persist as JSON files in medical-docs bucket with manifest tracking.
--   Enables reuse, debugging, and future OCR-only processing mode.
--
-- AFFECTED TABLES:
--   - ocr_artifacts (NEW)
--   - job_queue (indirectly - payload will shrink)
--   - shell_files (indirectly - linked via foreign key)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/04_ai_processing.sql
--       - Add ocr_artifacts table definition
--       - Add indexes and RLS policies  
--       - Add trigger for updated_at
--
-- WORKER FILES UPDATED (comprehensive review of apps/render-worker/src/pass1/):
--   [ ] apps/render-worker/src/pass1/pass1-types.ts
--       - Update Pass1Input interface to remove ocr_spatial_data from job payload
--       - Add OCR artifact loading interfaces for new storage-based workflow
--   [ ] apps/render-worker/src/worker.ts  
--       - Update processAIJob() to handle new payload structure
--       - Add OCR loading from storage before Pass1 processing
--   [ ] apps/render-worker/src/pass1/Pass1EntityDetector.ts
--       - Minor: access input.ocr_spatial_data (no changes - still gets same structure)
--       - Validation logic preserved (checks extracted_text, spatial_mapping)
--   [ ] apps/render-worker/src/pass1/pass1-prompts.ts
--       - Minor: accesses input.ocr_spatial_data fields in prompt generation
--       - No changes needed (receives same OCR structure regardless of source)
--   [ ] apps/render-worker/src/pass1/pass1-database-builder.ts
--       - Minor: accesses input.ocr_spatial_data.extracted_text and ocr_confidence
--       - No changes needed (receives same OCR structure regardless of source)
--   [ ] apps/render-worker/src/pass1/pass1-translation.ts
--       - NO changes needed (doesn't directly access input.ocr_spatial_data)
--       - Works with AI response data and session metadata only
--   [ ] apps/render-worker/src/pass1/pass1-schema-mapping.ts
--       - NO changes needed (doesn't reference Pass1Input or OCR data)
--   [ ] apps/render-worker/src/pass1/pass1-prompts-minimal-test.ts
--       - NO changes needed (uses Pass1Input type but doesn't access OCR fields)
--   [ ] apps/render-worker/src/pass1/index.ts
--       - Minor: exports Pass1Input type (indirect dependency)
--       - No changes needed (type export only)
--   [ ] apps/render-worker/src/pass1/README.md
--       - Update: contains example showing ocr_spatial_data in job payload
--       - Update documentation to reflect new storage-based OCR loading
--
-- EDGE FUNCTION FILES UPDATED:
--   [ ] supabase/functions/shell-file-processor-v3/index.ts
--       - Remove OCR processing from Edge Function
--       - Update job enqueue to use storage reference instead of OCR payload
--
-- AI PROMPTS AND PROCESSING LOGIC:
--   [ ] Pass 1 AI prompts remain unchanged (still receive same OCR structure)
--   [ ] No changes to entity detection output schema or database writes
--   [ ] OCR loading logic added to worker but transparent to AI processing
--   [ ] All existing AI confidence scoring and validation logic preserved
--
-- SCHEMA DOCUMENTATION UPDATED:
--   [ ] bridge-schemas/source/pass-1/ocr-artifacts.md (if applicable)
--   [ ] bridge-schemas/detailed/pass-1/ocr-artifacts.json (if applicable)
--   [ ] bridge-schemas/minimal/pass-1/ocr-artifacts.json (if applicable)
--
-- MIGRATION STRATEGY:
--   Single-step migration - additive only, no breaking changes
--
-- MIGRATION EXECUTED:
--   [X] Applied to Supabase on 2025-10-10 via mcp__supabase__apply_migration
--   [X] Verified table structure, RLS policies, constraints, and triggers
--   [X] All verification queries passed successfully
-- ============================================================================

BEGIN;

-- Guard: ensure updated_at trigger function exists
DO $guard_trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'update_updated_at_column'
      AND n.nspname = 'public'
  ) THEN
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      NEW.updated_at := NOW();
      RETURN NEW;
    END
    $func$;
  END IF;
END$guard_trigger$;

-- Create table for OCR artifact indexing
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
CREATE INDEX idx_ocr_artifacts_created ON ocr_artifacts(created_at);
CREATE INDEX idx_ocr_artifacts_provider ON ocr_artifacts(provider);

-- Enable RLS
ALTER TABLE ocr_artifacts ENABLE ROW LEVEL SECURITY;

-- Service role: optional (service role bypasses RLS anyway). If you want it explicit:
CREATE POLICY "Service role full access"
  ON ocr_artifacts
  FOR ALL
  USING (
    coalesce((current_setting('request.jwt.claims', true)::jsonb->>'role')::text, '') = 'service_role'
  )
  WITH CHECK (
    coalesce((current_setting('request.jwt.claims', true)::jsonb->>'role')::text, '') = 'service_role'
  );

-- End-user read access via your helper
CREATE POLICY "Users can read own OCR artifacts"
  ON ocr_artifacts
  FOR SELECT
  USING (
    has_profile_access(
      auth.uid(),
      (SELECT sf.patient_id FROM shell_files sf WHERE sf.id = ocr_artifacts.shell_file_id)
    )
  );

-- Add trigger for automatic updated_at maintenance
CREATE TRIGGER update_ocr_artifacts_updated_at
  BEFORE UPDATE ON ocr_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add constraint for manifest_path length (security hardening)
ALTER TABLE ocr_artifacts
  ADD CONSTRAINT ocr_manifest_path_len CHECK (char_length(manifest_path) BETWEEN 1 AND 2048);

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

COMMIT;

-- ============================================================================
-- Verification Query
-- ============================================================================

-- Verify table was created with correct structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'ocr_artifacts'
ORDER BY ordinal_position;

-- Verify RLS is enabled
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname = 'ocr_artifacts';

-- Verify policies were created
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'ocr_artifacts';

-- Verify triggers were created
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'ocr_artifacts';

-- Verify constraints were created
SELECT constraint_name, constraint_type, check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'ocr_artifacts'
AND tc.constraint_type = 'CHECK';

-- Verify RLS policies work correctly
-- (This should return true for service role, and proper filtering for users)
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename = 'ocr_artifacts';

-- ============================================================================
-- Rollback Script (If Needed)
-- ============================================================================
/*
BEGIN;
DROP TABLE IF EXISTS ocr_artifacts CASCADE;
COMMIT;
*/