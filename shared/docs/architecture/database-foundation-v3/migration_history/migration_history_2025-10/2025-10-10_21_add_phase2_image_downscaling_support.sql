-- ============================================================================
-- Migration: Phase 2 Image Downscaling Support
-- Date: 2025-10-10
-- Issue: Add database columns to support Phase 2 image downscaling optimization
--
-- PROBLEM: Phase 2 worker implementation tries to store processed (downscaled) images
-- but shell_files table lacks required columns, causing worker failures
-- SOLUTION: Add three columns to shell_files table for processed image metadata  
-- AFFECTED TABLES: shell_files
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/03_clinical_core.sql (Line 152-155: Phase 2 columns added - 2025-10-10)
--
-- DOWNSTREAM UPDATES:
--   [X] Bridge schemas updated: 6 shell_files bridge schema files need new columns (Commits 819ebf2, af49251 - 2025-10-10)
--       - bridge-schemas/source/pass-1/pass-1-versions/shell_files.md
--       - bridge-schemas/detailed/pass-1/shell_files.json
--       - bridge-schemas/minimal/pass-1/shell_files.json
--       - bridge-schemas/source/pass-2/pass-2-versions/shell_files.md
--       - bridge-schemas/detailed/pass-2/shell_files.json
--       - bridge-schemas/minimal/pass-2/shell_files.json
--   [X] TypeScript types updated (not applicable - no frontend type changes)
-- ============================================================================

BEGIN;

-- Add processed image columns to shell_files table
ALTER TABLE shell_files ADD COLUMN IF NOT EXISTS processed_image_path TEXT
  CHECK (processed_image_path IS NULL OR char_length(processed_image_path) BETWEEN 1 AND 2048);
ALTER TABLE shell_files ADD COLUMN IF NOT EXISTS processed_image_checksum TEXT;
ALTER TABLE shell_files ADD COLUMN IF NOT EXISTS processed_image_mime TEXT;

-- Add helpful comments explaining Phase 2 optimization
COMMENT ON COLUMN shell_files.processed_image_path IS 'Phase 2: Storage path for downscaled image used in OCR and Pass 1+ processing';
COMMENT ON COLUMN shell_files.processed_image_checksum IS 'Phase 2: SHA256 checksum of processed image to prevent redundant downscaling';
COMMENT ON COLUMN shell_files.processed_image_mime IS 'Phase 2: MIME type of processed image (may differ from original)';

COMMIT;

-- Verification Query
SELECT
    column_name,
    data_type,
    is_nullable,
    col_description(pgc.oid, cols.ordinal_position) as comment
FROM information_schema.columns cols
JOIN pg_class pgc ON pgc.relname = cols.table_name
WHERE table_name = 'shell_files'
AND column_name LIKE 'processed_image%'
ORDER BY column_name;

-- Rollback Script (if needed)
-- BEGIN;
-- ALTER TABLE shell_files DROP COLUMN IF EXISTS processed_image_path;
-- ALTER TABLE shell_files DROP COLUMN IF EXISTS processed_image_checksum;
-- ALTER TABLE shell_files DROP COLUMN IF EXISTS processed_image_mime;
-- COMMIT;