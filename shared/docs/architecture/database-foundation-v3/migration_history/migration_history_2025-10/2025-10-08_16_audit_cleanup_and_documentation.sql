-- ============================================================================
-- Migration: Audit Cleanup and Documentation
-- Date: 2025-10-08
-- Issue: Redundant columns and missing compliance documentation
--
-- PROBLEM:
--   1. entity_processing_audit has redundant session-level columns duplicated
--      from pass1_entity_metrics (pass1_model_used, pass1_vision_processing)
--   2. Compliance fields (user_agent, ip_address) lack documentation explaining
--      NULL behavior for background jobs
--
-- SOLUTION:
--   1. Remove redundant columns from entity_processing_audit (use JOIN to
--      pass1_entity_metrics when needed)
--   2. Add column comments documenting NULL behavior for compliance fields
--      across all metrics tables
--
-- AFFECTED TABLES:
--   - entity_processing_audit (drop 2 redundant columns)
--   - pass1_entity_metrics (add documentation)
--   - pass2_clinical_metrics (add documentation)
--   - pass3_narrative_metrics (add documentation)
--   - ai_processing_summary (add documentation)
--
-- SOURCE OF TRUTH SCHEMAS UPDATED:
--   current_schema/04_ai_processing.sql
--      - Lines 202-203: Removed pass1_model_used and pass1_vision_processing
--   current_schema/08_job_coordination.sql
--      - Lines 245-246: Added comments for pass1_entity_metrics
--      - Lines 280-281: Added comments for pass2_clinical_metrics
--      - Lines 312-313: Added comments for pass3_narrative_metrics
--      - Lines 349-350: Added comments for ai_processing_summary
--
-- MIGRATION STRATEGY:
--   Phase 1: Add column documentation (non-breaking)
--   Phase 2: Drop redundant columns (breaking change - requires code update)
--
-- RELATED AUDIT DOCUMENTS:
--   - pass1-audits/entity_processing_audit-COLUMN-AUDIT-ANSWERS.md
--   - pass1-audits/pass1_entity_metrics-COLUMN-AUDIT-ANSWERS.md
-- ============================================================================

-- ============================================================================
-- PHASE 1: Add Documentation for Compliance Fields
-- ============================================================================
-- Document NULL behavior for background job processing context

-- Pass 1 Entity Metrics
COMMENT ON COLUMN pass1_entity_metrics.user_agent IS
  'User agent of client that initiated processing. NULL for background worker jobs (no HTTP request context). Populated only for direct API processing where user session is available.';

COMMENT ON COLUMN pass1_entity_metrics.ip_address IS
  'IP address of client that initiated processing. NULL for background worker jobs (no network context). Populated only for direct API processing where user session is available. Part of HIPAA compliance audit trail.';

-- Pass 2 Clinical Metrics
COMMENT ON COLUMN pass2_clinical_metrics.user_agent IS
  'User agent of client that initiated processing. NULL for background worker jobs (no HTTP request context). Populated only for direct API processing where user session is available.';

COMMENT ON COLUMN pass2_clinical_metrics.ip_address IS
  'IP address of client that initiated processing. NULL for background worker jobs (no network context). Populated only for direct API processing where user session is available. Part of HIPAA compliance audit trail.';

-- Pass 3 Narrative Metrics
COMMENT ON COLUMN pass3_narrative_metrics.user_agent IS
  'User agent of client that initiated processing. NULL for background worker jobs (no HTTP request context). Populated only for direct API processing where user session is available.';

COMMENT ON COLUMN pass3_narrative_metrics.ip_address IS
  'IP address of client that initiated processing. NULL for background worker jobs (no network context). Populated only for direct API processing where user session is available. Part of HIPAA compliance audit trail.';

-- AI Processing Summary
COMMENT ON COLUMN ai_processing_summary.user_agent IS
  'User agent of client that initiated processing. NULL for background worker jobs (no HTTP request context). Populated only for direct API processing where user session is available.';

COMMENT ON COLUMN ai_processing_summary.ip_address IS
  'IP address of client that initiated processing. NULL for background worker jobs (no network context). Populated only for direct API processing where user session is available. Part of HIPAA compliance audit trail.';

-- ============================================================================
-- PHASE 2: Remove Redundant Columns from entity_processing_audit
-- ============================================================================
-- These columns duplicate session-level data from pass1_entity_metrics
-- Use JOIN when needed:
--   SELECT e.*, m.pass1_model_used, m.pass1_vision_processing
--   FROM entity_processing_audit e
--   JOIN pass1_entity_metrics m ON m.shell_file_id = e.shell_file_id

-- Drop redundant session metadata columns
ALTER TABLE entity_processing_audit
  DROP COLUMN IF EXISTS pass1_model_used,
  DROP COLUMN IF EXISTS pass1_vision_processing;

-- Add comment explaining where to find this data
COMMENT ON TABLE entity_processing_audit IS
  'Individual entity records from Pass 1 detection. For session-level metadata (model_used, vision_processing), JOIN to pass1_entity_metrics on shell_file_id.';

-- ============================================================================
-- Impact Analysis
-- ============================================================================
-- SAVINGS: 80 fields per 40-entity document (2 columns × 40 entities)
-- BREAKING: Code must JOIN to pass1_entity_metrics for model metadata
-- COMPLIANCE: Documented NULL behavior for healthcare audit trail

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify columns dropped successfully
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_name = 'entity_processing_audit'
--   AND column_name IN ('pass1_model_used', 'pass1_vision_processing');
-- Expected: 0 rows

-- Verify documentation added
-- SELECT
--   table_name,
--   column_name,
--   col_description(table_name::regclass, ordinal_position) as description
-- FROM information_schema.columns
-- WHERE table_name IN ('pass1_entity_metrics', 'pass2_clinical_metrics', 'pass3_narrative_metrics', 'ai_processing_summary')
--   AND column_name IN ('user_agent', 'ip_address')
-- ORDER BY table_name, column_name;
-- Expected: 8 rows with documentation

-- Example JOIN query to access session metadata
-- SELECT
--   e.entity_id,
--   e.original_text,
--   m.pass1_model_used,
--   m.pass1_vision_processing
-- FROM entity_processing_audit e
-- JOIN pass1_entity_metrics m ON m.shell_file_id = e.shell_file_id
-- LIMIT 5;

-- ============================================================================
-- Rollback Script (If Needed)
-- ============================================================================
/*
-- Add columns back (but they'll be NULL for existing records)
ALTER TABLE entity_processing_audit
  ADD COLUMN pass1_model_used TEXT,
  ADD COLUMN pass1_vision_processing BOOLEAN DEFAULT FALSE;

-- Remove documentation comments
COMMENT ON COLUMN pass1_entity_metrics.user_agent IS NULL;
COMMENT ON COLUMN pass1_entity_metrics.ip_address IS NULL;
COMMENT ON COLUMN pass2_clinical_metrics.user_agent IS NULL;
COMMENT ON COLUMN pass2_clinical_metrics.ip_address IS NULL;
COMMENT ON COLUMN pass3_narrative_metrics.user_agent IS NULL;
COMMENT ON COLUMN pass3_narrative_metrics.ip_address IS NULL;
COMMENT ON COLUMN ai_processing_summary.user_agent IS NULL;
COMMENT ON COLUMN ai_processing_summary.ip_address IS NULL;
COMMENT ON TABLE entity_processing_audit IS NULL;
*/

-- ============================================================================
-- Code Changes Required After Migration
-- ============================================================================
-- 1. Update any queries that reference entity_processing_audit.pass1_model_used
--    to JOIN with pass1_entity_metrics instead
--
-- 2. Update any queries that reference entity_processing_audit.pass1_vision_processing
--    to JOIN with pass1_entity_metrics instead
--
-- Example code update:
-- BEFORE:
--   SELECT pass1_model_used FROM entity_processing_audit WHERE id = '...';
--
-- AFTER:
--   SELECT m.pass1_model_used
--   FROM entity_processing_audit e
--   JOIN pass1_entity_metrics m ON m.shell_file_id = e.shell_file_id
--   WHERE e.id = '...';
-- ============================================================================
