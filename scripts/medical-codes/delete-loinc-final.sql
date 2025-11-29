-- ============================================================================
-- Script: Delete LOINC from regional_medical_codes after successful migration
-- Date: 2025-11-24
-- Purpose: Remove 102,891 LOINC records from regional_medical_codes table
--          after successful migration to universal_medical_codes
--
-- STATUS: Migration verified successful
--   - Regional table: 102,891 LOINC records
--   - Universal table: 102,891 LOINC records
--   - Counts match: ✓
--   - All Migration 60 columns present: ✓
--
-- APPROACH: Direct SQL DELETE with smaller batches and explicit commits
-- ============================================================================

BEGIN;

-- Delete LOINC records in batches using CTE approach
-- This avoids the statement timeout by processing smaller chunks
WITH loinc_ids AS (
  SELECT id
  FROM regional_medical_codes
  WHERE code_system = 'loinc'
  LIMIT 1000
)
DELETE FROM regional_medical_codes
WHERE id IN (SELECT id FROM loinc_ids);

-- Check progress
SELECT
  'LOINC records remaining in regional_medical_codes' as status,
  COUNT(*) as count
FROM regional_medical_codes
WHERE code_system = 'loinc';

COMMIT;

-- NOTE: This script deletes 1,000 records per execution
-- Run repeatedly until no records remain:
--   psql "postgresql://..." -f delete-loinc-final.sql
--
-- Or execute via Supabase MCP:
--   While regional count > 0, run the DELETE statement
-- ============================================================================
