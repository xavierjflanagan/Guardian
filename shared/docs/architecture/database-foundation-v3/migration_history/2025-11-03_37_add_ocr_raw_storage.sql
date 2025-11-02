-- ============================================================================
-- Migration: Add OCR Raw Output Storage
-- Date: 2025-11-03
-- Issue: OCR output not stored, preventing debugging of multi-column reading bugs
--
-- PROBLEM:
--   - Google Cloud Vision OCR output is discarded after processing
--   - Cannot diagnose text ordering issues (e.g., multi-column reading bugs)
--   - Cannot reprocess files if OCR ordering algorithm changes
--   - No ability to compare OCR vendors or validate quality
--
-- SOLUTION:
--   - Add ocr_raw_jsonb column to shell_files table
--   - Store complete Google Cloud Vision API response
--   - Enables debugging, reprocessing, and quality audits
--
-- AFFECTED TABLES: shell_files
--
-- STORAGE IMPACT:
--   - Typical size: ~50KB per 20-page PDF (most medical documents)
--   - Size range: 2KB (1 page) to 300KB (100 pages) to 1.5MB (500 pages, rare)
--   - Healthcare document profile: 80% are 1-30 pages, 15% are 30-100 pages, 5% >100 pages
--   - Storage cost: ~$0.000001-$0.00003 per file per month
--   - 100K documents at 50KB avg = 5GB = $0.11/month (negligible)
--   - Benefit: Enables root cause analysis and reprocessing without re-upload
--
-- OPERATIONAL NOTES:
--   - No size cap enforced initially (start simple, optimize if needed)
--   - If documents >100 pages become common, consider Supabase Storage fallback
--   - Always use explicit column lists in queries (do NOT use SELECT *)
--   - Single version stored per document (versioning deferred until reprocessing workflow added)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/03_clinical_core.sql (Line 127: Add ocr_raw_jsonb after ocr_confidence) - COMPLETED 2025-11-03
--
-- DOWNSTREAM UPDATES:
--   [ ] Pass 0.25 OCR worker code (store OCR output) - Pending implementation
--   [ ] TypeScript types (GoogleCloudVisionOCR interface) - Pending implementation
--
-- MIGRATION EXECUTED: 2025-11-03
-- VERIFICATION: Column added successfully (JSONB, nullable, no default)
-- ============================================================================

-- Add OCR raw storage column
-- Using JSONB for efficient querying and indexing if needed later
ALTER TABLE shell_files
ADD COLUMN IF NOT EXISTS ocr_raw_jsonb JSONB;

-- Add comment for documentation
COMMENT ON COLUMN shell_files.ocr_raw_jsonb IS
'Complete Google Cloud Vision API response (fullTextAnnotation). '
'Stored for debugging, reprocessing, and quality audits. '
'Contains: pages[], blocks[], paragraphs[], words[], symbols[], boundingBoxes. '
'Enables spatial text sorting fixes for multi-column documents. '
'WARNING: Large JSONB column (~50KB typical, up to 1.5MB for 500-page docs). '
'Always use explicit column lists in queries - do NOT fetch with SELECT *.';

-- ============================================================================
-- MANUAL VERIFICATION (run these queries AFTER migration execution)
-- ============================================================================

-- Check column exists and is correct type
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'shell_files'
  AND column_name = 'ocr_raw_jsonb';

-- Check existing records (should all be NULL initially)
SELECT
    COUNT(*) as total_shell_files,
    COUNT(ocr_raw_jsonb) as with_ocr_json,
    COUNT(extracted_text) as with_extracted_text
FROM shell_files;

-- Rollback Script (if needed)
-- ALTER TABLE shell_files DROP COLUMN IF EXISTS ocr_raw_jsonb;
