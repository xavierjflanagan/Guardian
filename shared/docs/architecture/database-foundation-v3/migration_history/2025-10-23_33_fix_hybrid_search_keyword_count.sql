-- ============================================================================
-- Migration: Fix Hybrid Search - Keyword Match Count Ranking
-- Date: 2025-10-23
-- Migration Number: 33
-- Issue: Migration 32 hybrid search has incorrect ranking algorithm
--
-- PROBLEM:
--   Migration 32 implemented positional variant scoring (variant[1]=1.0, variant[2]=0.95)
--   with 70/30 lexical/semantic weighting. This causes incorrect ranking:
--
--   Example: "Chest X-ray" with variants ["chest", "radiograph", "thorax", "cxr", "lung"]
--   - Anaesthesia code "chest wall procedures" → matches "chest" → score 1.0
--   - Radiology code "chest radiography" → matches "chest" → score 1.0 (SAME!)
--   - Both get similar final scores despite radiology matching 2 keywords vs anaesthesia's 1
--
--   Experiment 6 Results: 35.7% top-20 accuracy (target: ≥90%)
--   Root cause: Positional scoring doesn't differentiate keyword coverage
--
-- SOLUTION:
--   Replace positional scoring with keyword match-count ranking:
--   - Count total keywords matched (e.g., "chest" + "radiograph" = 2/5 = 0.4)
--   - Codes with more keyword coverage rank higher
--   - Remove semantic component entirely (pure lexical for Phase 1)
--   - Semantic to be reconsidered in Phase 2 if needed
--
-- AFFECTED TABLES:
--   - regional_medical_codes (READ for queries only)
--
-- AFFECTED FUNCTIONS:
--   - search_procedures_hybrid (REPLACE - fix lexical scoring algorithm)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] 03_clinical_core.sql (Lines 2010-2141: Replace search_procedures_hybrid function)
--
-- DOWNSTREAM UPDATES:
--   [X] Migration executed: 2025-10-23
--   [X] Experiment 6 documentation (README, RESULTS_SUMMARY updated)
--
-- PROCESSING DATE: 2025-10-23
-- EXECUTION DATE: 2025-10-23
-- ============================================================================

BEGIN;

-- ============================================================================
-- Replace search_procedures_hybrid() function with keyword-count algorithm
-- ============================================================================
-- Purpose: Pure lexical search with keyword match-count ranking
-- Strategy:
--   1. Filter: Get all codes matching ANY search variant (ILIKE shortlist)
--   2. Score: Count how many variants each code matches (coverage scoring)
--   3. Rank: Order by match count descending
--
-- Parameters:
--   p_entity_text: Original entity text from Pass 1 (for reference/logging)
--   p_search_variants: AI-generated variant array (max 5)
--   p_country_code: Country filter (default 'AUS')
--   p_limit: Max results to return (default 20)
--
-- Returns: Ranked procedure codes with match count and normalized score

CREATE OR REPLACE FUNCTION search_procedures_hybrid(
    p_entity_text TEXT,
    p_search_variants TEXT[],
    p_country_code CHAR(3) DEFAULT 'AUS',
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    code_value VARCHAR(50),
    display_name TEXT,
    lexical_score NUMERIC,
    semantic_score NUMERIC,  -- Always 0 (kept for API compatibility)
    combined_score NUMERIC,  -- Same as lexical_score (kept for API compatibility)
    match_source TEXT,       -- Always 'lexical' (kept for API compatibility)
    code_system VARCHAR(20),
    search_text TEXT
) AS $$
DECLARE
    v_variant_count INTEGER;
    v_normalized_variants TEXT[];
BEGIN
    -- Step 0: Validate and normalize inputs
    IF p_search_variants IS NULL OR array_length(p_search_variants, 1) = 0 THEN
        RAISE EXCEPTION 'search_variants array is required and must not be empty';
    END IF;

    IF p_entity_text IS NULL OR trim(p_entity_text) = '' THEN
        RAISE EXCEPTION 'p_entity_text is required and must not be empty';
    END IF;

    -- Normalize: trim whitespace and filter empty variants to prevent ILIKE '%%' matches
    SELECT array_agg(trim(v)) INTO v_normalized_variants
    FROM unnest(p_search_variants) AS v
    WHERE trim(v) != '';

    -- Validate at least one non-empty variant exists after filtering
    IF v_normalized_variants IS NULL OR array_length(v_normalized_variants, 1) = 0 THEN
        RAISE EXCEPTION 'All search_variants are empty after trimming';
    END IF;

    -- Enforce 5-variant cap (silent truncation)
    IF array_length(v_normalized_variants, 1) > 5 THEN
        v_normalized_variants := v_normalized_variants[1:5];
    END IF;

    v_variant_count := array_length(v_normalized_variants, 1);

    -- Step 1: Keyword match-count scoring
    -- Count how many search variants each code matches
    RETURN QUERY
    WITH keyword_matches AS (
        SELECT
            rmc.code_value,
            rmc.display_name,
            rmc.code_system,
            rmc.search_text,
            rmc.normalized_embedding_text,
            -- Count total keyword matches (raw count)
            (
                (CASE WHEN normalized_embedding_text ILIKE '%' || v_normalized_variants[1] || '%' THEN 1 ELSE 0 END) +
                (CASE WHEN v_variant_count >= 2 AND normalized_embedding_text ILIKE '%' || v_normalized_variants[2] || '%' THEN 1 ELSE 0 END) +
                (CASE WHEN v_variant_count >= 3 AND normalized_embedding_text ILIKE '%' || v_normalized_variants[3] || '%' THEN 1 ELSE 0 END) +
                (CASE WHEN v_variant_count >= 4 AND normalized_embedding_text ILIKE '%' || v_normalized_variants[4] || '%' THEN 1 ELSE 0 END) +
                (CASE WHEN v_variant_count >= 5 AND normalized_embedding_text ILIKE '%' || v_normalized_variants[5] || '%' THEN 1 ELSE 0 END)
            ) AS match_count
        FROM regional_medical_codes rmc
        WHERE rmc.code_system = 'mbs'
            AND rmc.country_code = p_country_code
            AND rmc.active = TRUE
            AND rmc.entity_type = 'procedure'
            -- Filter: At least ONE variant must match to be in shortlist
            AND (
                normalized_embedding_text ILIKE '%' || v_normalized_variants[1] || '%' OR
                (v_variant_count >= 2 AND normalized_embedding_text ILIKE '%' || v_normalized_variants[2] || '%') OR
                (v_variant_count >= 3 AND normalized_embedding_text ILIKE '%' || v_normalized_variants[3] || '%') OR
                (v_variant_count >= 4 AND normalized_embedding_text ILIKE '%' || v_normalized_variants[4] || '%') OR
                (v_variant_count >= 5 AND normalized_embedding_text ILIKE '%' || v_normalized_variants[5] || '%')
            )
    )

    -- Return results ordered by match count (normalized to 0-1 range)
    SELECT
        km.code_value,
        km.display_name,
        (km.match_count::NUMERIC / v_variant_count::NUMERIC) AS lexical_score,
        0::NUMERIC AS semantic_score,  -- Semantic removed (Phase 1)
        (km.match_count::NUMERIC / v_variant_count::NUMERIC) AS combined_score,
        'lexical'::TEXT AS match_source,
        km.code_system,
        km.search_text
    FROM keyword_matches km
    WHERE km.match_count > 0
    ORDER BY km.match_count DESC, km.code_value ASC  -- Secondary sort for deterministic ordering
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;

-- Security: Revoke from PUBLIC and grant only to service_role (matches Migration 32 pattern)
REVOKE ALL ON FUNCTION search_procedures_hybrid(TEXT, TEXT[], CHAR(3), INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_procedures_hybrid(TEXT, TEXT[], CHAR(3), INTEGER) TO service_role;

-- Add function comment with parameter signature
COMMENT ON FUNCTION search_procedures_hybrid(TEXT, TEXT[], CHAR(3), INTEGER) IS
'Hybrid search for MBS procedure codes (Phase 1: Pure lexical with keyword match-count ranking).

Parameters:
  p_entity_text TEXT - Original entity text from Pass 1 (for reference/logging)
  p_search_variants TEXT[] - AI-generated variant array (max 5, auto-truncated)
  p_country_code CHAR(3) - Country filter (default ''AUS'')
  p_limit INTEGER - Max results to return (default 20)

Strategy: Count how many search variants each code matches, rank by coverage.

Example: "Chest X-ray" with variants ["chest", "radiograph", "thorax", "cxr", "lung"]
  - Code matching "chest" + "radiograph" = 2/5 = 0.4 score
  - Code matching only "chest" = 1/5 = 0.2 score
  - Higher match count = higher ranking

Migration 33: Replaced positional scoring (Migration 32) with match-count for better accuracy.
Phase 2 may reintroduce semantic component if pure lexical insufficient.';

COMMIT;

-- ============================================================================
-- Verification Query (Run manually to test)
-- ============================================================================
-- Test with known entity from Experiment 6
-- Expected: Codes 58500, 58503, 58506 should rank in top-5 with high scores
--
-- SELECT * FROM search_procedures_hybrid(
--     'Chest X-ray',
--     ARRAY['chest', 'radiograph', 'thorax', 'cxr', 'lung'],
--     'AUS',
--     20
-- );
