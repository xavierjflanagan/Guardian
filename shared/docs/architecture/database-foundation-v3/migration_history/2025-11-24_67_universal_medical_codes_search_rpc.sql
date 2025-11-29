-- ============================================================================
-- Migration: Universal Medical Codes Vector Search RPC Function
-- Date: 2025-11-24
-- Issue: Pass 1.5 needs RPC function to perform vector similarity search
--
-- PROBLEM: IVFFlat index exists on universal_medical_codes.embedding but no
--          RPC function to actually USE it for Pass 1.5 code matching.
--          Without RPC, would need to download all 109k+ vectors to client.
--
-- SOLUTION: Create match_universal_medical_codes() RPC function that:
--          - Searches 109k+ embeddings (LOINC, SNOMED CT CORE) in database
--          - Returns top N matches with similarity scores
--          - Supports filters: entity_type, code_system, min_similarity
--          - Uses existing idx_universal_codes_vector (IVFFlat) for speed
--
-- AFFECTED TABLES: universal_medical_codes (read-only, no schema changes)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/03_clinical_core.sql (Added function at line 2181-2239)
--
-- DOWNSTREAM UPDATES:
--   [X] None required (new function, no schema changes)
--
-- Status: [X] Research complete  [X] Script created  [X] Human reviewed
--         [X] Executed 2025-11-24  [X] Schema updated  [X] Complete
-- ============================================================================

-- ============================================================================
-- Vector Search Function for Universal Medical Codes
-- ============================================================================
-- Purpose: Fast semantic search across LOINC, SNOMED CT CORE, and RxNorm codes
-- Use case: Pass 1.5 medical code matching for clinical entities
-- Index used: idx_universal_codes_vector (IVFFlat, 109k+ vectors)
--
-- Parameters:
--   - query_embedding: 1536-dim OpenAI text-embedding-3-small vector from entity
--   - entity_type_filter: Optional filter (medication, condition, lab_result, etc.)
--   - code_system_filter: Optional filter (loinc, snomed, rxnorm)
--   - max_results: Number of top matches to return (default: 20 for Pass 1.5)
--   - min_similarity: Cosine similarity threshold (default: 0.5 = 50% match)
--
-- Returns: Top N matching codes with similarity scores, ordered by relevance
--
-- Performance: ~10-50ms for 109k codes with IVFFlat index
--
CREATE OR REPLACE FUNCTION public.match_universal_medical_codes(
    query_embedding VECTOR(1536),
    entity_type_filter VARCHAR(20) DEFAULT NULL,
    code_system_filter VARCHAR(20) DEFAULT NULL,
    max_results INTEGER DEFAULT 20,
    min_similarity REAL DEFAULT 0.5
) RETURNS TABLE (
    code_system VARCHAR(20),
    code_value VARCHAR(50),
    display_name TEXT,
    search_text TEXT,
    similarity_score REAL,
    entity_type VARCHAR(20),
    active BOOLEAN,
    active_embedding_model VARCHAR(20)
) AS $$
DECLARE
    v_max_results INTEGER;
    v_min_similarity REAL;
BEGIN
    -- Parameter validation
    v_max_results := GREATEST(1, max_results);
    v_min_similarity := GREATEST(0.0, LEAST(1.0, min_similarity));

    RETURN QUERY
    SELECT
        umc.code_system,
        umc.code_value,
        umc.display_name,
        umc.search_text,
        (1 - (umc.embedding <=> query_embedding))::REAL as similarity_score,
        umc.entity_type,
        umc.active,
        umc.active_embedding_model
    FROM public.universal_medical_codes umc
    WHERE umc.embedding IS NOT NULL
        AND (entity_type_filter IS NULL OR umc.entity_type = entity_type_filter)
        AND (code_system_filter IS NULL OR umc.code_system = code_system_filter)
        AND (1 - (umc.embedding <=> query_embedding)) >= v_min_similarity
    ORDER BY umc.embedding <=> query_embedding
    LIMIT v_max_results;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Add function comment
COMMENT ON FUNCTION public.match_universal_medical_codes IS
'Pass 1.5 vector similarity search for universal medical codes (LOINC, SNOMED CT CORE, RxNorm).
Uses IVFFlat index idx_universal_codes_vector for fast cosine similarity matching.
Returns top N codes matching entity embedding with optional filters.
Parameters validated: max_results >= 1, min_similarity clamped to [0.0, 1.0].';

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.match_universal_medical_codes TO authenticated, anon, service_role;

-- ============================================================================
-- Post-execution Validation
-- ============================================================================
-- Run these queries after executing migration to verify success:
--
-- 1. Verify function exists:
--    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
--    FROM pg_proc p
--    JOIN pg_namespace n ON p.pronamespace = n.oid
--    WHERE p.proname = 'match_universal_medical_codes';
--
-- 2. Get function definition:
--    SELECT pg_get_functiondef('public.match_universal_medical_codes(vector, varchar, varchar, integer, real)'::regprocedure);
--
-- 3. Test function with sample LOINC code embedding:
--    SELECT * FROM public.match_universal_medical_codes(
--        (SELECT embedding FROM public.universal_medical_codes WHERE code_system='loinc' LIMIT 1),
--        NULL, 'loinc', 10, 0.5
--    );
--
-- 4. Check performance (should be <100ms):
--    EXPLAIN ANALYZE SELECT * FROM public.match_universal_medical_codes(
--        (SELECT embedding FROM public.universal_medical_codes WHERE code_system='loinc' LIMIT 1),
--        NULL, 'loinc', 20, 0.5
--    );
-- ============================================================================

-- ============================================================================
-- Downstream Updates Required
-- ============================================================================
-- After executing this migration:
-- [ ] Update current_schema/03_clinical_core.sql with this function
-- [ ] Create TypeScript RPC wrapper in Pass 1.5 code matching utilities
-- [ ] Update Pass 1.5 architecture documentation
-- [ ] Test with sample entities from Pass 1 output
-- ============================================================================
