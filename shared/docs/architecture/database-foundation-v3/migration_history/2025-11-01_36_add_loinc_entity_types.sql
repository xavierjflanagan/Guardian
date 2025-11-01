-- ============================================================================
-- Migration: Add LOINC-Specific Entity Types
-- Date: 2025-11-01
-- Issue: LOINC codes use entity types not supported by database constraints
--
-- PROBLEM:
-- LOINC codes have 4 entity types in parsed data:
--   - observation: 61,043 codes (59.3%)
--   - lab_result: 39,943 codes (38.8%)
--   - physical_finding: 1,444 codes (1.4%)
--   - vital_sign: 461 codes (0.4%)
--
-- Current database constraint only allows:
--   ('medication', 'condition', 'procedure', 'observation', 'allergy')
--
-- This forced population script to map ALL LOINC codes to 'observation',
-- losing semantic distinction between lab results, vital signs, and physical findings.
--
-- SOLUTION:
-- Add LOINC-specific entity types to constraints on both tables:
--   - lab_result
--   - vital_sign
--   - physical_finding
--
-- AFFECTED TABLES:
--   - universal_medical_codes
--   - regional_medical_codes
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/03_clinical_core.sql (Line 1351: universal_medical_codes entity_type constraint)
--   [X] current_schema/03_clinical_core.sql (Line 1407: regional_medical_codes entity_type constraint)
--
-- DOWNSTREAM UPDATES:
--   [X] LOINC population script updated to use correct entity types
--   [X] LOINC data re-populated with correct entity_type values (102,891 rows UPDATE)
--       - observation: 61,043 (59.3%)
--       - lab_result: 39,943 (38.8%)
--       - physical_finding: 1,444 (1.4%)
--       - vital_sign: 461 (0.4%)
--
-- EXECUTION DATE: 2025-11-01
-- ============================================================================

-- Drop existing constraints
ALTER TABLE universal_medical_codes
DROP CONSTRAINT IF EXISTS universal_medical_codes_entity_type_check;

ALTER TABLE regional_medical_codes
DROP CONSTRAINT IF EXISTS regional_medical_codes_entity_type_check;

-- Add updated constraints with LOINC entity types
ALTER TABLE universal_medical_codes
ADD CONSTRAINT universal_medical_codes_entity_type_check
CHECK (entity_type IN (
  -- Original 5 entity types
  'medication',
  'condition',
  'procedure',
  'observation',
  'allergy',
  -- LOINC-specific entity types (added 2025-11-01)
  'lab_result',
  'vital_sign',
  'physical_finding'
));

ALTER TABLE regional_medical_codes
ADD CONSTRAINT regional_medical_codes_entity_type_check
CHECK (entity_type IN (
  -- Original 5 entity types
  'medication',
  'condition',
  'procedure',
  'observation',
  'allergy',
  -- LOINC-specific entity types (added 2025-11-01)
  'lab_result',
  'vital_sign',
  'physical_finding'
));

-- Verification Query
-- Check that constraints were updated successfully
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname IN (
  'universal_medical_codes_entity_type_check',
  'regional_medical_codes_entity_type_check'
);

-- Rollback Script (if needed)
/*
ALTER TABLE universal_medical_codes
DROP CONSTRAINT IF EXISTS universal_medical_codes_entity_type_check;

ALTER TABLE universal_medical_codes
ADD CONSTRAINT universal_medical_codes_entity_type_check
CHECK (entity_type IN ('medication', 'condition', 'procedure', 'observation', 'allergy'));

ALTER TABLE regional_medical_codes
DROP CONSTRAINT IF EXISTS regional_medical_codes_entity_type_check;

ALTER TABLE regional_medical_codes
ADD CONSTRAINT regional_medical_codes_entity_type_check
CHECK (entity_type IN ('medication', 'condition', 'procedure', 'observation', 'allergy'));
*/
