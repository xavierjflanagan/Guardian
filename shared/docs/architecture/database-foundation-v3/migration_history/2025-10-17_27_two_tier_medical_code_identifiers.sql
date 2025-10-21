-- ============================================================================
-- Migration: Two-Tier Medical Code Identifier System
-- Date: 2025-10-17
-- Issue: Medical code assignments need grouping capability for brand variants
--
-- PROBLEM: Current medical_code_assignments table stores single code identifiers,
-- but our parsing strategy produces two-tier identifiers (code_value + grouping_code).
-- PBS medications use granular li_item_id for brand preservation plus pbs_code
-- for optional grouping. Other code systems may also benefit from hierarchical
-- organization (e.g., condition groups, allergy categories).
--
-- SOLUTION: Add grouping_code columns to support two-tier assignments while
-- maintaining backward compatibility. Enable flexible storage strategies:
-- - Store both granular + group codes for max flexibility
-- - Leave grouping_code NULL when not applicable
-- - Support future hierarchical use cases across all entity types
--
-- AFFECTED TABLES: medical_code_assignments
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/03_clinical_core.sql (Line 1327, 1334: added grouping_code columns + indexes)
--
-- DOWNSTREAM UPDATES:
--   [X] Bridge schemas updated (source + detailed + minimal - two-tier system documented)
--   [ ] TypeScript types updated (if applicable)
--   [ ] Pass 1.5 worker functions updated for two-tier assignment strategy
--
-- EXECUTION STATUS:
--   [X] Migration executed successfully via Supabase MCP (2025-10-17)
--   [X] New columns verified: universal_grouping_code, regional_grouping_code (VARCHAR(50))
--   [X] New indexes verified: idx_assignments_universal_grouping, idx_assignments_regional_grouping
-- ============================================================================

-- Add grouping code support to medical_code_assignments table
-- These columns support hierarchical medical code organization

-- Universal grouping code (for RxNorm SCD->ingredient grouping, SNOMED hierarchies, etc.)
ALTER TABLE medical_code_assignments 
ADD COLUMN IF NOT EXISTS universal_grouping_code VARCHAR(50);

-- Regional grouping code (for PBS pbs_code->li_item_id grouping, MBS categories, etc.)  
ALTER TABLE medical_code_assignments 
ADD COLUMN IF NOT EXISTS regional_grouping_code VARCHAR(50);

-- Add helpful comments for the new columns
COMMENT ON COLUMN medical_code_assignments.universal_grouping_code IS 
'Optional grouping identifier for universal codes. Examples: RxNorm ingredient codes, SNOMED parent concepts, LOINC system groupings. NULL when no grouping applicable.';

COMMENT ON COLUMN medical_code_assignments.regional_grouping_code IS 
'Optional grouping identifier for regional codes. Examples: PBS pbs_code (groups brand variants), MBS category codes, ICD-10-AM chapter codes. NULL when no grouping applicable.';

-- Add indexes for the new grouping columns to support queries
CREATE INDEX IF NOT EXISTS idx_assignments_universal_grouping 
ON medical_code_assignments (universal_code_system, universal_grouping_code) 
WHERE universal_grouping_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_regional_grouping 
ON medical_code_assignments (regional_code_system, regional_grouping_code, regional_country_code) 
WHERE regional_grouping_code IS NOT NULL;

-- Update table comment to reflect two-tier capability
COMMENT ON TABLE medical_code_assignments IS 
'Entity-to-medical-code assignments with two-tier identifier support. Stores both granular codes (code) and optional grouping codes (grouping_code) for flexible hierarchical organization. Supports brand preservation in medications while enabling optional deduplication via grouping codes.';

-- Verification Query: Check new columns exist and are properly typed
SELECT 
  column_name, 
  data_type, 
  character_maximum_length, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'medical_code_assignments' 
  AND column_name IN ('universal_grouping_code', 'regional_grouping_code')
ORDER BY column_name;

-- Verification Query: Check indexes were created
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'medical_code_assignments' 
  AND indexname LIKE '%grouping%';

-- Example usage patterns after migration:

-- Pattern 1: PBS medication with brand preservation
-- INSERT INTO medical_code_assignments (
--   entity_id, entity_table, patient_id,
--   regional_code_system, 
--   regional_code,              -- "10001J_14023_31078_31081_31083" (granular li_item_id)
--   regional_grouping_code,     -- "10001J" (PBS code for optional grouping)
--   regional_display, regional_country_code
-- ) VALUES (...);

-- Pattern 2: Condition with SNOMED hierarchy
-- INSERT INTO medical_code_assignments (
--   entity_id, entity_table, patient_id,
--   universal_code_system,
--   universal_code,             -- "44054006" (specific diabetes type)
--   universal_grouping_code,    -- "73211009" (diabetes mellitus parent concept) 
--   universal_display
-- ) VALUES (...);

-- Pattern 3: Simple code without grouping (backward compatible)
-- INSERT INTO medical_code_assignments (
--   entity_id, entity_table, patient_id,
--   universal_code_system,
--   universal_code,             -- "85354-9" (blood pressure panel)
--   -- universal_grouping_code NULL (no grouping needed)
--   universal_display
-- ) VALUES (...);

-- Rollback Script (if needed)
-- ALTER TABLE medical_code_assignments DROP COLUMN IF EXISTS universal_grouping_code;
-- ALTER TABLE medical_code_assignments DROP COLUMN IF EXISTS regional_grouping_code;
-- DROP INDEX IF EXISTS idx_assignments_universal_grouping;
-- DROP INDEX IF EXISTS idx_assignments_regional_grouping;