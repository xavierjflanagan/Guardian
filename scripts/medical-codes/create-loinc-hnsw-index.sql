-- ============================================================================
-- Script: Create HNSW vector index for LOINC in universal_medical_codes
-- Date: 2025-11-24
-- Purpose: Create high-performance vector similarity search index for LOINC codes
--
-- CONTEXT: LOINC migration complete (102,891 records)
--   - All records successfully migrated to universal_medical_codes
--   - OpenAI embeddings (VECTOR(1536)) present on all records
--   - SapBERT embeddings (VECTOR(768)) column available for future use
--
-- INDEX STRATEGY:
--   - HNSW (Hierarchical Navigable Small World) for fast approximate nearest neighbor search
--   - Cosine distance for semantic similarity
--   - Filtered index: WHERE code_system = 'loinc' AND embedding IS NOT NULL
--   - This enables Pass 1.5 two-tier search: Universal codes first, regional fallback
--
-- PERFORMANCE IMPACT:
--   - Index build time: ~3-5 minutes for 102,891 vectors
--   - Query speedup: 10-100x faster than sequential scan
--   - Storage overhead: ~200-300MB for HNSW index
-- ============================================================================

BEGIN;

-- Create HNSW index on OpenAI embeddings for LOINC codes
-- Using default HNSW parameters (m=16, ef_construction=64)
CREATE INDEX IF NOT EXISTS idx_universal_codes_loinc_embedding_hnsw
ON universal_medical_codes
USING hnsw (embedding vector_cosine_ops)
WHERE code_system = 'loinc' AND embedding IS NOT NULL;

-- Add comment explaining index purpose
COMMENT ON INDEX idx_universal_codes_loinc_embedding_hnsw IS
'HNSW index for fast vector similarity search on LOINC codes (Pass 1.5 two-tier search)';

-- Verify index creation
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname = 'idx_universal_codes_loinc_embedding_hnsw';

COMMIT;

-- ============================================================================
-- NEXT STEPS:
-- 1. Consider creating similar index for SapBERT embeddings (when populated):
--    CREATE INDEX idx_universal_codes_loinc_sapbert_hnsw
--    ON universal_medical_codes
--    USING hnsw (sapbert_embedding vector_cosine_ops)
--    WHERE code_system = 'loinc' AND sapbert_embedding IS NOT NULL;
--
-- 2. Monitor index usage via pg_stat_user_indexes
-- 3. Tune HNSW parameters (m, ef_construction) if query performance needs optimization
-- ============================================================================
