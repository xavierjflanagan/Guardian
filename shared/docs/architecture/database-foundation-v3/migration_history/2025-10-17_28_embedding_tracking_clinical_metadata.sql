-- ============================================================================
-- Migration: Embedding Tracking and Clinical Metadata Enhancement
-- Date: 2025-10-17
-- Issue: Need efficient model tracking and clinical context for better AI assignments
--
-- PROBLEM: Medical code tables lack embedding model tracking and clinical metadata.
-- Current approach would duplicate model info across 200K+ rows (wasteful).
-- AI needs clinical context for smart code assignment decisions.
--
-- SOLUTION: 
-- 1. Create embedding_batches table for efficient model tracking (1 record per batch)
-- 2. Add minimal clinical metadata to medical code tables
-- 3. Prepare for PBS population with proper data structure
--
-- AFFECTED TABLES: NEW embedding_batches, regional_medical_codes, universal_medical_codes
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [x] current_schema/03_clinical_core.sql (Add embedding_batches + new columns)
--
-- DOWNSTREAM UPDATES:
--   [x] current_schema/03_clinical_core.sql (Add embedding_batches table + new columns)
--   [x] populate-database.ts script - Compatible (new columns nullable)
--   [ ] Bridge schemas updated for clinical metadata documentation
--
-- EXECUTION COMPLETED: 2025-10-17
-- MIGRATION STATUS: Successfully deployed
-- ============================================================================

-- 1. Ensure pgcrypto extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create embedding batch tracking table (efficient model tracking)
CREATE TABLE IF NOT EXISTS embedding_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Model identification
    embedding_model VARCHAR(50) NOT NULL,
    embedding_dimensions INTEGER NOT NULL,
    api_version VARCHAR(20) NOT NULL,
    
    -- Batch context
    code_system VARCHAR(20) NOT NULL,
    library_version VARCHAR(20) NOT NULL,
    total_codes INTEGER NOT NULL,
    
    -- Processing metadata (with safety constraints)
    processing_cost_usd DECIMAL(8,4) CHECK (processing_cost_usd >= 0),
    processing_time_minutes INTEGER CHECK (processing_time_minutes >= 0),
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique combinations
    UNIQUE(code_system, library_version, embedding_model)
);

COMMENT ON TABLE embedding_batches IS 
'Efficient tracking of embedding generation batches. One record per batch instead of duplicating model info across all medical codes. Enables model consistency validation and cost tracking.';

-- 3. Add embedding tracking to regional medical codes
ALTER TABLE regional_medical_codes 
ADD COLUMN IF NOT EXISTS embedding_batch_id UUID REFERENCES embedding_batches(id);

COMMENT ON COLUMN regional_medical_codes.embedding_batch_id IS 
'Reference to embedding_batches table for efficient model tracking. Enables validation that entity embeddings use same model as medical code embeddings.';

-- 4. Add clinical context to regional medical codes
ALTER TABLE regional_medical_codes 
ADD COLUMN IF NOT EXISTS clinical_specificity VARCHAR(20) CHECK (clinical_specificity IN ('highly_specific', 'moderately_specific', 'general', 'broad_category')),
ADD COLUMN IF NOT EXISTS typical_setting VARCHAR(30) CHECK (typical_setting IN ('primary_care', 'specialist', 'hospital', 'emergency', 'any'));

COMMENT ON COLUMN regional_medical_codes.clinical_specificity IS 
'Clinical specificity level for AI decision making. Helps distinguish between general terms vs highly specific medical codes.';

COMMENT ON COLUMN regional_medical_codes.typical_setting IS 
'Typical healthcare setting where this code is used. Helps AI select appropriate codes based on clinical context.';

-- 5. Add same enhancements to universal medical codes for consistency
ALTER TABLE universal_medical_codes 
ADD COLUMN IF NOT EXISTS embedding_batch_id UUID REFERENCES embedding_batches(id),
ADD COLUMN IF NOT EXISTS clinical_specificity VARCHAR(20) CHECK (clinical_specificity IN ('highly_specific', 'moderately_specific', 'general', 'broad_category')),
ADD COLUMN IF NOT EXISTS typical_setting VARCHAR(30) CHECK (typical_setting IN ('primary_care', 'specialist', 'hospital', 'emergency', 'any'));

-- 6. Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_embedding_batches_lookup 
ON embedding_batches (code_system, library_version, embedding_model);

CREATE INDEX IF NOT EXISTS idx_regional_codes_batch 
ON regional_medical_codes (embedding_batch_id) 
WHERE embedding_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_universal_codes_batch 
ON universal_medical_codes (embedding_batch_id) 
WHERE embedding_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_regional_clinical_context 
ON regional_medical_codes (clinical_specificity, typical_setting) 
WHERE clinical_specificity IS NOT NULL;

-- Verification queries
-- Check new table exists
SELECT COUNT(*) as embedding_batches_ready 
FROM information_schema.tables 
WHERE table_name = 'embedding_batches';

-- Check new columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'regional_medical_codes' 
  AND column_name IN ('embedding_batch_id', 'clinical_specificity', 'typical_setting')
ORDER BY column_name;

-- Example usage for PBS batch creation:
-- INSERT INTO embedding_batches (
--     embedding_model, embedding_dimensions, api_version,
--     code_system, library_version, total_codes
-- ) VALUES (
--     'text-embedding-3-small', 1536, '2024-02-01',
--     'pbs', 'v2025Q4', 14382
-- ) RETURNING id;

-- Rollback script (if needed)
-- ALTER TABLE regional_medical_codes DROP COLUMN IF EXISTS embedding_batch_id;
-- ALTER TABLE regional_medical_codes DROP COLUMN IF EXISTS clinical_specificity;
-- ALTER TABLE regional_medical_codes DROP COLUMN IF EXISTS typical_setting;
-- ALTER TABLE universal_medical_codes DROP COLUMN IF EXISTS embedding_batch_id;
-- ALTER TABLE universal_medical_codes DROP COLUMN IF EXISTS clinical_specificity;
-- ALTER TABLE universal_medical_codes DROP COLUMN IF EXISTS typical_setting;
-- DROP TABLE IF EXISTS embedding_batches;