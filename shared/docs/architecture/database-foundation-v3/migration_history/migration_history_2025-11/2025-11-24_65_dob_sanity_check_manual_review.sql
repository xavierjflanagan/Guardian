-- ============================================================================
-- Migration: DOB Sanity Check Manual Review Integration
-- Date: 2025-11-24
-- Issue: Date of birth sanity check failures silently result in NULL DOB
--
-- PROBLEM:
--   When normalizeDateToISO() detects invalid DOB years (< 1900 or > currentYear+1),
--   likely from OCR misreads (e.g., 1850 instead of 1950), the system:
--   - Creates encounter with NULL patient_date_of_birth
--   - Logs warning to console (invisible to users)
--   - Stores metadata in quality_criteria_met
--   - NO manual review queue entry created
--   Result: User sees empty DOB field with no explanation or review workflow
--
-- SOLUTION:
--   1. Extend manual_review_queue.review_type to include 'data_quality_issue'
--   2. Create enqueue_manual_review() RPC for worker-initiated reviews
--   3. Grant service_role permission (worker uses service key, not auth.uid())
--   Worker code (pending-reconciler.ts) will call this RPC when DOB sanity check fails
--
-- AFFECTED TABLES: manual_review_queue
-- AFFECTED FUNCTIONS: enqueue_manual_review (new)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/04_ai_processing.sql (Line 651-654: review_type CHECK constraint)
--   [X] current_schema/08_job_coordination.sql (After line 686: new enqueue_manual_review RPC)
--   [X] current_schema/08_job_coordination.sql (Lines 2300, 2313: service_role grants)
--
-- DOWNSTREAM UPDATES:
--   [X] apps/render-worker/src/pass05/progressive/pending-reconciler.ts (Add pickBestDOB + manual review call)
--   [X] 16b-DOB-SANITY-CHECK-MANUAL-REVIEW-PROPOSAL.md (Mark complete)
--
-- EXECUTED: 2025-11-24 via mcp__supabase__apply_migration
-- ============================================================================

BEGIN;

-- Part 1: Extend manual_review_queue.review_type enum
-- ============================================================================
-- Current values: entity_validation, profile_classification, clinical_accuracy,
--                 safety_concern, low_confidence, contamination_risk
-- Adding: data_quality_issue (for DOB sanity check failures and similar issues)

ALTER TABLE manual_review_queue
DROP CONSTRAINT IF EXISTS manual_review_queue_review_type_check;

ALTER TABLE manual_review_queue
ADD CONSTRAINT manual_review_queue_review_type_check
CHECK (review_type IN (
    'entity_validation',
    'profile_classification',
    'clinical_accuracy',
    'safety_concern',
    'low_confidence',
    'contamination_risk',
    'data_quality_issue'  -- NEW: For sanity check failures, invalid formats, data validation issues
));

-- Part 2: Create enqueue_manual_review RPC function
-- ============================================================================
-- Purpose: Worker-initiated manual review queue entries for data quality issues
-- Security: SECURITY DEFINER + explicit service_role grant (see Part 3)
-- Pattern: Consistent with other worker RPCs (enqueue_job_v3, claim_next_job_v3, complete_job)

CREATE OR REPLACE FUNCTION enqueue_manual_review(
  p_patient_id UUID,
  p_processing_session_id UUID,
  p_shell_file_id UUID,
  p_review_type TEXT,
  p_priority TEXT,
  p_review_title TEXT,
  p_review_description TEXT,
  p_flagged_issues TEXT[],
  p_clinical_context JSONB
) RETURNS UUID AS $$
DECLARE
  v_review_id UUID;
BEGIN
  -- Insert manual review entry
  INSERT INTO manual_review_queue (
    patient_id,
    processing_session_id,
    shell_file_id,
    review_type,
    priority,
    review_title,
    review_description,
    flagged_issues,
    clinical_context,
    review_status,
    created_at,
    updated_at
  ) VALUES (
    p_patient_id,
    p_processing_session_id,
    p_shell_file_id,
    p_review_type,
    p_priority,
    p_review_title,
    p_review_description,
    p_flagged_issues,
    p_clinical_context,
    'pending',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_review_id;

  -- Log the manual review creation for debugging
  RAISE NOTICE 'Manual review entry created: % (type: %, priority: %)',
    v_review_id, p_review_type, p_priority;

  RETURN v_review_id;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

COMMENT ON FUNCTION enqueue_manual_review IS
  'Migration 65: Worker-initiated manual review queue entry creation for data quality issues.
   Called by Pass 0.5 reconciliation when DOB sanity check fails (year < 1900 or > currentYear+1).
   Stores original extracted values, page ranges, and encounter context for human review.
   Requires service_role permissions (see Part 3 grants).';

-- Part 3: Grant execution permissions for worker (CRITICAL)
-- ============================================================================
-- Worker uses service_role key (not auth.uid()), requires explicit permission
-- Pattern matches existing worker RPCs in 08_job_coordination.sql (lines 2243-2250)

REVOKE EXECUTE ON FUNCTION enqueue_manual_review(uuid, uuid, uuid, text, text, text, text, text[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_manual_review(uuid, uuid, uuid, text, text, text, text, text[], jsonb) TO service_role;

COMMIT;

-- Verification Queries
-- ============================================================================

-- Verify review_type constraint updated
SELECT consrc
FROM pg_constraint
WHERE conname = 'manual_review_queue_review_type_check';
-- Expected: Should include 'data_quality_issue'

-- Verify function created
SELECT routine_name, routine_type, security_type
FROM information_schema.routines
WHERE routine_name = 'enqueue_manual_review';
-- Expected: routine_type = 'FUNCTION', security_type = 'DEFINER'

-- Verify grants
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'enqueue_manual_review';
-- Expected: service_role with EXECUTE privilege

-- Rollback Script (if needed)
-- ============================================================================
/*
BEGIN;

-- Remove function
DROP FUNCTION IF EXISTS enqueue_manual_review(uuid, uuid, uuid, text, text, text, text, text[], jsonb);

-- Revert constraint
ALTER TABLE manual_review_queue
DROP CONSTRAINT IF EXISTS manual_review_queue_review_type_check;

ALTER TABLE manual_review_queue
ADD CONSTRAINT manual_review_queue_review_type_check
CHECK (review_type IN (
    'entity_validation',
    'profile_classification',
    'clinical_accuracy',
    'safety_concern',
    'low_confidence',
    'contamination_risk'
));

COMMIT;
*/
