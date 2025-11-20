-- ============================================================================
-- Migration: Add Normalized Embedding Text for Pass 1.5 Medical Code Search
-- Date: 2025-10-20
-- Issue: Embedding mismatch causing 60% failure rate in vector similarity search
--
-- PROBLEM:
--   Current embeddings use verbose search_text with brand names, billing codes,
--   and salt forms (e.g., "Metformin Tablet (extended release) containing
--   metformin hydrochloride 1 g Diaformin XR 1000"). Clinical queries use
--   clean entity text (e.g., "Metformin 1g"). These exist in different semantic
--   spaces, causing vector similarity search to fail.
--
--   Phase 0 baseline test results:
--   - Metformin 500mg: 0 results (matched wrong drug at 55% similarity)
--   - Paracetamol 500mg: 0 results (matched wrong drug at 54% similarity)
--   - Overall: 60% failure rate (3/5 medications not found in top 20)
--
-- SOLUTION:
--   Add normalized_embedding_text column that extracts only essential clinical
--   information for semantic matching:
--   - Generic drug name (lowercase, no salts)
--   - Brand name if present (from search_text)
--   - Dosage with standardized units (g→mg, mcg→mg)
--   - Drug form (tablet, capsule, injection, etc.)
--   - Release type if important (extended, modified)
--
--   Normalization example:
--   Before: "Metformin Tablet (extended release) containing metformin hydrochloride 1 g Diaformin XR 1000"
--   After:  "metformin diaformin xr tablet extended release 1000 mg"
--
-- AFFECTED TABLES: regional_medical_codes, universal_medical_codes
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/03_clinical_core.sql (Lines 1342-1344, 1297-1299: Added normalized_embedding_text and normalized_embedding)
--
-- DOWNSTREAM UPDATES:
--   [ ] Bridge schemas updated (pass-2/medical_code_assignments.md - add field documentation)
--   [ ] TypeScript types updated (if regional_medical_codes type exists)
--   [ ] Worker code updated (apps/render-worker/src/pass15/ - normalization function)
--
-- EXECUTION: 2025-10-20 - Migration executed successfully via mcp__supabase__apply_migration
-- ============================================================================

-- Ensure pgvector extension is available
CREATE EXTENSION IF NOT EXISTS vector;

-- Add normalized_embedding_text column to regional_medical_codes
ALTER TABLE regional_medical_codes
ADD COLUMN IF NOT EXISTS normalized_embedding_text TEXT;

COMMENT ON COLUMN regional_medical_codes.normalized_embedding_text IS
'Normalized text for embedding generation. Extracts essential clinical information: generic name + brand + dosage (standardized units) + form + release type. Excludes salt forms, billing codes, verbose phrases. Used for Pass 1.5 vector similarity search.';

-- Add normalized_embedding vector column to regional_medical_codes
ALTER TABLE regional_medical_codes
ADD COLUMN IF NOT EXISTS normalized_embedding VECTOR(1536);

COMMENT ON COLUMN regional_medical_codes.normalized_embedding IS
'Vector embedding generated from normalized_embedding_text using OpenAI text-embedding-3-small. Used for Pass 1.5 vector similarity search. Separate from legacy embedding column for A/B testing and rollback safety.';

-- Add normalized_embedding_text column to universal_medical_codes
ALTER TABLE universal_medical_codes
ADD COLUMN IF NOT EXISTS normalized_embedding_text TEXT;

COMMENT ON COLUMN universal_medical_codes.normalized_embedding_text IS
'Normalized text for embedding generation. Extracts essential clinical information for universal codes (SNOMED, RxNorm, ICD-10, etc.). Same normalization strategy as regional codes.';

-- Add normalized_embedding vector column to universal_medical_codes
ALTER TABLE universal_medical_codes
ADD COLUMN IF NOT EXISTS normalized_embedding VECTOR(1536);

COMMENT ON COLUMN universal_medical_codes.normalized_embedding IS
'Vector embedding generated from normalized_embedding_text. Same strategy as regional codes.';

-- Verification Query (commented out for MCP runner compatibility)
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'regional_medical_codes'
--   AND column_name IN ('normalized_embedding_text', 'normalized_embedding');

-- Rollback Script (if needed)
/*
ALTER TABLE regional_medical_codes DROP COLUMN IF EXISTS normalized_embedding_text;
ALTER TABLE regional_medical_codes DROP COLUMN IF EXISTS normalized_embedding;
ALTER TABLE universal_medical_codes DROP COLUMN IF EXISTS normalized_embedding_text;
ALTER TABLE universal_medical_codes DROP COLUMN IF EXISTS normalized_embedding;
*/
