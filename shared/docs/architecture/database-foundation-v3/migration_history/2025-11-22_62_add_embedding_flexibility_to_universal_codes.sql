-- ============================================================================
-- Migration: Add Embedding Flexibility and Authority to Universal Medical Codes
-- Date: 2025-11-22
-- Issue: universal_medical_codes missing columns for embedding experiments and authority tracking
--
-- PROBLEM:
--   1. regional_medical_codes has sapbert_embedding columns (Migration 31) but universal doesn't
--   2. Migrating LOINC from regional to universal fails due to schema mismatch
--   3. No authority_required field for universal codes (generic field, not region-specific)
--   4. Cannot experiment with SapBERT embeddings on universal codes (SNOMED CORE, LOINC, RxNorm)
--
-- SOLUTION:
--   Add 4 columns to universal_medical_codes to match regional_medical_codes (non-regional columns only):
--   - authority_required: Generic boolean for prescriptions requiring authority
--   - sapbert_embedding: VECTOR(768) for biomedical embedding experiments
--   - sapbert_embedding_generated_at: Timestamp tracking
--   - active_embedding_model: Track which embedding model is active ('openai' or 'sapbert')
--
--   Keeps regional-specific columns (pbs_authority_required, mbs_complexity_level, tga_approved, country_code)
--   in regional_medical_codes only.
--
-- AFFECTED TABLES: universal_medical_codes
--
-- IMPACT ANALYSIS:
--   - No existing data affected (columns are nullable/have defaults)
--   - No index changes needed
--   - No RLS policy changes needed
--   - Enables LOINC migration from regional to universal table
--   - Future: Enables SapBERT embedding experiments on universal codes
--
-- EXECUTED: 2025-11-22
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/03_clinical_core.sql (Lines 1439-1443: Added 4 columns after normalized_embedding)
--
-- DOWNSTREAM UPDATES:
--   [X] No bridge schema updates needed (nullable columns with defaults)
--   [X] No TypeScript type updates needed (auto-generated from schema)
-- ============================================================================

BEGIN;

-- Add authority_required column (generic, applicable to universal codes)
ALTER TABLE universal_medical_codes
ADD COLUMN IF NOT EXISTS authority_required BOOLEAN DEFAULT FALSE;

-- Add SapBERT embedding support (Migration 31 equivalent for universal codes)
ALTER TABLE universal_medical_codes
ADD COLUMN IF NOT EXISTS sapbert_embedding VECTOR(768);

ALTER TABLE universal_medical_codes
ADD COLUMN IF NOT EXISTS sapbert_embedding_generated_at TIMESTAMPTZ;

ALTER TABLE universal_medical_codes
ADD COLUMN IF NOT EXISTS active_embedding_model VARCHAR(20) DEFAULT 'openai'
CHECK (active_embedding_model IN ('openai', 'sapbert'));

-- Add comments explaining purpose
COMMENT ON COLUMN universal_medical_codes.authority_required IS 'Generic flag for medications requiring prescription authority (not region-specific)';
COMMENT ON COLUMN universal_medical_codes.sapbert_embedding IS 'SapBERT biomedical embedding (768 dimensions) for embedding model experiments';
COMMENT ON COLUMN universal_medical_codes.sapbert_embedding_generated_at IS 'Timestamp when SapBERT embedding was generated';
COMMENT ON COLUMN universal_medical_codes.active_embedding_model IS 'Which embedding model is currently active for this code (openai or sapbert)';

-- Verification Query
DO $$
DECLARE
    authority_col_exists BOOLEAN;
    sapbert_col_exists BOOLEAN;
    sapbert_timestamp_exists BOOLEAN;
    active_model_exists BOOLEAN;
BEGIN
    -- Check if columns were added
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'universal_medical_codes'
        AND column_name = 'authority_required'
    ) INTO authority_col_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'universal_medical_codes'
        AND column_name = 'sapbert_embedding'
    ) INTO sapbert_col_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'universal_medical_codes'
        AND column_name = 'sapbert_embedding_generated_at'
    ) INTO sapbert_timestamp_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'universal_medical_codes'
        AND column_name = 'active_embedding_model'
    ) INTO active_model_exists;

    -- Report results
    IF authority_col_exists AND sapbert_col_exists AND sapbert_timestamp_exists AND active_model_exists THEN
        RAISE NOTICE 'Migration successful: All 4 columns added to universal_medical_codes';
        RAISE NOTICE '  - authority_required: %', authority_col_exists;
        RAISE NOTICE '  - sapbert_embedding: %', sapbert_col_exists;
        RAISE NOTICE '  - sapbert_embedding_generated_at: %', sapbert_timestamp_exists;
        RAISE NOTICE '  - active_embedding_model: %', active_model_exists;
    ELSE
        RAISE EXCEPTION 'Migration verification failed! Missing columns.';
    END IF;
END $$;

COMMIT;

-- Rollback Script (if needed)
/*
BEGIN;
ALTER TABLE universal_medical_codes DROP COLUMN IF EXISTS authority_required;
ALTER TABLE universal_medical_codes DROP COLUMN IF EXISTS sapbert_embedding;
ALTER TABLE universal_medical_codes DROP COLUMN IF EXISTS sapbert_embedding_generated_at;
ALTER TABLE universal_medical_codes DROP COLUMN IF EXISTS active_embedding_model;
COMMIT;
*/
