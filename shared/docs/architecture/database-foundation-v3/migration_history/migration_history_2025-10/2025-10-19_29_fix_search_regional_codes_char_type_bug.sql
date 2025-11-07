-- ============================================================================
-- Migration: Fix search_regional_codes() CHAR Type Truncation Bug
-- Date: 2025-10-19
-- Executed: 2025-10-19
-- Issue: Vector search returns zero results due to char(1) type truncation
--
-- PROBLEM:
--   RPC function parameter 'country_code_filter character' defaults to char(1),
--   causing 'AUS' to be truncated to 'A', resulting in WHERE clause mismatch
--   with database column country_code char(3) = 'AUS'.
--   Result: ALL 20,383 medical codes filtered out, zero search results.
--   Additional issue: RETURNS TABLE also used char(1), truncating return values.
--
-- SOLUTION:
--   1. Change parameter type from 'character' to 'char(3)' (input fix)
--   2. Change RETURNS TABLE country_code to char(3) (output fix)
--   3. Add STABLE keyword for query planner optimization
--   4. Lower min_similarity default from 0.7 to 0.3 for better recall
--   5. Verified index uses vector_cosine_ops (matches <=> operator)
--
-- AFFECTED TABLES: regional_medical_codes (RPC function only)
-- AFFECTED FUNCTIONS: search_regional_codes(), search_regional_codes_fixed()
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/03_clinical_core.sql (search_regional_codes function) - Updated 2025-10-19
--
-- DOWNSTREAM UPDATES:
--   [X] None required (function signature compatible - char(3) accepts 'AUS' string)
--
-- VERIFIED BEHAVIOR:
--   Current: 'AUS'::character = 'A' (length 1)
--   Fixed:   'AUS'::char(3) = 'AUS' (length 3)
-- ============================================================================

-- Drop the broken function versions
DROP FUNCTION IF EXISTS public.search_regional_codes(vector, character varying, character, integer, real);
DROP FUNCTION IF EXISTS public.search_regional_codes_fixed(vector, character varying, character, integer, real);

-- Recreate search_regional_codes with correct char(3) type
CREATE OR REPLACE FUNCTION public.search_regional_codes(
    query_embedding vector,
    entity_type_filter character varying DEFAULT NULL::character varying,
    country_code_filter char(3) DEFAULT 'AUS',  -- FIXED: char(3) instead of character
    max_results integer DEFAULT 10,
    min_similarity real DEFAULT 0.3  -- LOWERED: 0.3 instead of 0.7 for better recall during embedding fixes
)
RETURNS TABLE(
    code_system character varying,
    code_value character varying,
    display_name text,
    search_text text,
    similarity_score real,
    entity_type character varying,
    country_code char(3),  -- FIXED: char(3) to match table column and prevent truncation
    authority_required boolean
)
LANGUAGE plpgsql
STABLE  -- ADDED: Allows planner to use indexes more effectively
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        rmc.code_system,
        rmc.code_value,
        rmc.display_name,
        rmc.search_text,
        (1 - (rmc.embedding <=> query_embedding))::REAL as similarity_score,
        rmc.entity_type,
        rmc.country_code,
        rmc.authority_required
    FROM regional_medical_codes rmc
    WHERE rmc.active = TRUE
        AND rmc.embedding IS NOT NULL
        AND (entity_type_filter IS NULL OR rmc.entity_type = entity_type_filter)
        AND (country_code_filter IS NULL OR rmc.country_code = country_code_filter)
        AND (1 - (rmc.embedding <=> query_embedding)) >= min_similarity
    ORDER BY rmc.embedding <=> query_embedding
    LIMIT max_results;
END;
$function$;

-- Verification Query: Test with 'AUS' parameter
-- Should return MBS codes instead of 0 results
/*
SELECT
  code_system,
  code_value,
  display_name,
  country_code
FROM search_regional_codes(
  query_embedding := (SELECT embedding FROM regional_medical_codes LIMIT 1),
  entity_type_filter := 'procedure',
  country_code_filter := 'AUS',
  max_results := 5,
  min_similarity := 0.0
);
*/

-- Rollback Script (if needed)
/*
DROP FUNCTION IF EXISTS public.search_regional_codes(vector, character varying, char, integer, real);

CREATE OR REPLACE FUNCTION public.search_regional_codes(
    query_embedding vector,
    entity_type_filter character varying DEFAULT NULL::character varying,
    country_code_filter character DEFAULT 'AUS'::bpchar,  -- BROKEN VERSION (char(1))
    max_results integer DEFAULT 10,
    min_similarity real DEFAULT 0.7
)
RETURNS TABLE(
    code_system character varying,
    code_value character varying,
    display_name text,
    search_text text,
    similarity_score real,
    entity_type character varying,
    country_code character,  -- BROKEN: Also char(1) in original
    authority_required boolean
) AS $function$ ... $function$;
*/
