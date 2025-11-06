-- ============================================================================
-- Migration: shell_files Schema Cleanup - Remove Vestigial Columns
-- Date: 2025-11-06
-- Migration Number: 40
-- Issue: Pass 0.5 Audit - Column cleanup and missing metrics
--
-- PROBLEM:
--   Pass 0.5 column audit (2025-11-06) identified several issues in shell_files table:
--   1. Missing processed_image_size_bytes column (needed for storage metrics)
--   2. Vestigial columns never populated: upload_context
--   3. Columns in wrong table (belong in healthcare_encounters): provider_name, facility_name
--   4. Columns made ambiguous by Frankenstein files: file_type, file_subtype, confidence_score
--   5. Redundant columns: confidence_score (better mechanisms exist at encounter level)
--
-- SOLUTION:
--   1. ADD processed_image_size_bytes BIGINT - stores combined total size of all processed JPEG pages
--   2. DROP 6 columns: file_type, file_subtype, confidence_score, provider_name, facility_name, upload_context
--   3. DROP associated constraints and indexes: shell_files_file_type_check, idx_shell_files_type
--   4. Defer file-level summaries to Pass 3 ai_synthesized_summary (better mechanism)
--   5. Retain processing_cost_estimate and processing_duration_seconds for business analytics
--
-- AFFECTED TABLES: shell_files
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [x] current_schema/03_clinical_core.sql (Lines 116-144: shell_files table definition updated)
--
-- DOWNSTREAM UPDATES:
--   [x] Worker code: apps/render-worker/src/worker.ts:1005 (populate processed_image_size_bytes after page processing)
--   [ ] TypeScript types (if shell_files type definitions exist)
--
-- EXECUTION DATE: 2025-11-06
-- EXECUTED BY: Supabase MCP (Claude Code)
-- ============================================================================

-- Begin transaction for atomic execution
BEGIN;

-- ===========================================
-- PHASE 1: Drop Dependent Database Objects
-- ===========================================

-- Drop composite index on file_type and file_subtype (schema-qualified for safety)
DROP INDEX IF EXISTS public.idx_shell_files_type;

-- Drop CHECK constraint on file_type (schema-qualified for safety)
ALTER TABLE public.shell_files
DROP CONSTRAINT IF EXISTS shell_files_file_type_check;

-- ===========================================
-- PHASE 2: Remove Vestigial/Misplaced Columns
-- ===========================================

-- Columns moved to healthcare_encounters (Frankenstein files make single values ambiguous)
ALTER TABLE public.shell_files
DROP COLUMN IF EXISTS provider_name,
DROP COLUMN IF EXISTS facility_name;

-- Columns deferred to Pass 3 ai_synthesized_summary (better mechanism for file-level summaries)
ALTER TABLE public.shell_files
DROP COLUMN IF EXISTS file_type,
DROP COLUMN IF EXISTS file_subtype;

-- Redundant column (better mechanisms exist at encounter level)
ALTER TABLE public.shell_files
DROP COLUMN IF EXISTS confidence_score;

-- Vestigial column (never populated, no business logic)
ALTER TABLE public.shell_files
DROP COLUMN IF EXISTS upload_context;

-- ===========================================
-- PHASE 3: Add Missing Metrics Column
-- ===========================================

-- Add processed image size tracking (sum of all JPEG page sizes for entire file)
ALTER TABLE public.shell_files
ADD COLUMN IF NOT EXISTS processed_image_size_bytes BIGINT;

-- Add comment explaining calculation method
COMMENT ON COLUMN public.shell_files.processed_image_size_bytes IS
'Combined total size in bytes of all processed JPEG pages for this shell file. Calculated as sum of all page image sizes after PDF->JPEG conversion. Example: 20-page file stores one total size value (not per-page breakdown). Populated by worker after ALL page images are persisted to avoid undercounts on retries.';

-- ===========================================
-- VERIFICATION QUERIES
-- ===========================================

-- Verify columns were added/removed successfully
-- Expected result: processed_image_size_bytes exists, 6 columns removed

-- Guard: Verify removed columns are actually gone (expect 0 rows)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'shell_files'
  AND column_name IN ('file_type', 'file_subtype', 'confidence_score',
                      'provider_name', 'facility_name', 'upload_context');
-- Expected result: 0 rows (all columns successfully removed)

-- List all columns in shell_files table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'shell_files'
ORDER BY ordinal_position;

-- Verify no orphaned constraints remain
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name = 'shell_files';

-- Verify no orphaned indexes remain on dropped columns
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'shell_files';

-- Count existing shell_files records (should remain unchanged)
SELECT COUNT(*) as total_records,
       COUNT(processed_image_size_bytes) as records_with_new_column
FROM public.shell_files;

-- Commit transaction
COMMIT;

-- ===========================================
-- ROLLBACK SCRIPT
-- ===========================================

/*
-- WARNING: Rollback will restore column structure but NOT original data
-- All removed columns will have NULL values after rollback
-- This is acceptable as all current data is test data (pre-launch)

BEGIN;

-- Add back removed columns (with NULL values, exact types from current_schema/03_clinical_core.sql)
ALTER TABLE public.shell_files
ADD COLUMN IF NOT EXISTS file_type TEXT,
ADD COLUMN IF NOT EXISTS file_subtype TEXT,
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2),
ADD COLUMN IF NOT EXISTS provider_name TEXT,
ADD COLUMN IF NOT EXISTS facility_name TEXT,
ADD COLUMN IF NOT EXISTS upload_context TEXT;

-- Recreate CHECK constraint on file_type (exact constraint from original schema)
ALTER TABLE public.shell_files
ADD CONSTRAINT shell_files_file_type_check
CHECK (file_type IN (
    'medical_record',
    'lab_result',
    'imaging_report',
    'prescription',
    'discharge_summary',
    'referral',
    'insurance_card',
    'id_document',
    'other'
));

-- Recreate composite index on file_type and file_subtype
CREATE INDEX IF NOT EXISTS idx_shell_files_type
ON public.shell_files(file_type, file_subtype);

-- Remove added column
ALTER TABLE public.shell_files
DROP COLUMN IF EXISTS processed_image_size_bytes;

-- Verify rollback
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'shell_files'
ORDER BY ordinal_position;

COMMIT;
*/

-- ===========================================
-- MIGRATION COMPLETE
-- ===========================================

-- Next steps (Touchpoint 2):
-- 1. Execute this migration via mcp__supabase__apply_migration()
-- 2. Run verification queries to confirm success
-- 3. Update current_schema/03_clinical_core.sql (lines 96-167)
-- 4. Update worker code to populate processed_image_size_bytes
-- 5. Mark migration header checkboxes complete
-- 6. Test end-to-end with new file upload
