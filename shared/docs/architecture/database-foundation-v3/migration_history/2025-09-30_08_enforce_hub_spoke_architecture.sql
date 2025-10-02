-- =============================================================================
-- Migration: Enforce Hub-and-Spoke Architecture for Clinical Tables
-- Date: 30 September 2025
-- Author: Xavier Flanagan / Claude Code
-- Reviewed By: GPT-5
-- Status: EXECUTED in staging (2025-09-30)
--
-- SOURCE OF TRUTH UPDATES:
-- This migration updated the following source of truth SQL files:
-- - /shared/docs/architecture/database-foundation-v3/current_schema/03_clinical_core.sql
--   - Backup created: 03_clinical_core_pre_migration_08_20250930.sql (archive/)
--   - Updated patient_clinical_events: Added is_synthetic column + UNIQUE(id, patient_id) constraint
--   - Updated patient_observations: Documented event_id requirement + added index
--   - Updated patient_interventions: Documented event_id requirement + added index
--   - Updated patient_vitals: Added event_id column + composite FK + index
--   - Updated patient_conditions: Renamed clinical_event_id→event_id + composite FK + index
--   - Updated patient_allergies: Added event_id column + composite FK + index
--   - Updated patient_medications: Added event_id column + composite FK + index
--   - Updated patient_immunizations: Added event_id column + composite FK + index
--   - Added migration_08_backfill_audit table
-- =============================================================================

-- PURPOSE:
-- This migration enforces the architectural principle that "every clinical entity
-- is a patient_clinical_event". It standardizes event_id across all clinical
-- detail tables and enforces referential integrity with minimal downtime.

-- ARCHITECTURAL PRINCIPLE:
-- All clinical detail tables (observations, interventions, vitals, conditions,
-- allergies, medications, immunizations) MUST reference a parent patient_clinical_events
-- record via event_id. Healthcare encounters are EXCLUDED (they are parents, not children).

-- GPT-5 REVIEW CORRECTIONS APPLIED:
-- 1. Do NOT add event_id to healthcare_encounters (parent table, not child)
-- 2. Standardize on event_id everywhere (rename clinical_event_id → event_id)
-- 3. Use composite FK (event_id, patient_id) for integrity enforcement
-- 4. Use NOT VALID constraints with VALIDATE for minimal downtime
-- 5. Create indexes CONCURRENTLY before setting NOT NULL
-- 6. Keep patient_id denormalized with composite FK enforcement
-- 7. Add backfill audit trail with synthetic event flags
-- 8. Drop redundant clinical_event_id from observations/interventions if present

-- AFFECTED TABLES (7 clinical detail tables):
-- - patient_observations (has event_id, may have clinical_event_id from migration 02)
-- - patient_interventions (has event_id, may have clinical_event_id from migration 02)
-- - patient_vitals (needs event_id)
-- - patient_conditions (has clinical_event_id, needs rename to event_id)
-- - patient_allergies (has clinical_event_id, needs rename to event_id)
-- - patient_medications (has clinical_event_id, needs rename to event_id)
-- - patient_immunizations (has clinical_event_id, needs rename to event_id)

-- EXCLUDED TABLES:
-- - healthcare_encounters (parent table - patient_clinical_events references encounters)
-- - healthcare_timeline_events (aggregator table with clinical_event_ids[] array)

-- =============================================================================
-- PHASE 1: PREPARE PATIENT_CLINICAL_EVENTS HUB
-- =============================================================================

-- Create UNIQUE index CONCURRENTLY (non-blocking for production safety)
-- This must be done outside transaction block for CONCURRENTLY to work
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_pce_id_patient_id
    ON patient_clinical_events(id, patient_id);

-- Note: UNIQUE index created CONCURRENTLY (non-blocking)

BEGIN;

-- Add composite UNIQUE constraint using the existing index
-- This is instant since index already exists
ALTER TABLE patient_clinical_events
ADD CONSTRAINT patient_clinical_events_id_patient_id_key
    UNIQUE USING INDEX idx_pce_id_patient_id;

-- Note: Composite UNIQUE constraint added using existing index (instant operation)

-- Add is_synthetic column to track backfilled events
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_clinical_events' AND column_name = 'is_synthetic') THEN
        ALTER TABLE patient_clinical_events
        ADD COLUMN is_synthetic BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added is_synthetic column to patient_clinical_events';
    END IF;
END $$;

COMMIT;

-- =============================================================================
-- PHASE 2: BACKFILL SYNTHETIC EVENTS FOR ORPHANED RECORDS
-- =============================================================================

BEGIN;

-- Create audit table for backfill tracking
CREATE TABLE IF NOT EXISTS migration_08_backfill_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_table TEXT NOT NULL,
    source_record_id UUID NOT NULL,
    created_event_id UUID NOT NULL,
    backfill_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    backfill_reason TEXT
);

-- =============================================================================
-- BACKFILL 1: patient_vitals
-- =============================================================================

-- patient_vitals currently has patient_id but no event_id/clinical_event_id
DO $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    -- Create synthetic events for vitals without event linkage
    WITH orphaned_vitals AS (
        SELECT
            pv.id as vital_id,
            pv.patient_id,
            pv.vital_type,
            pv.measurement_date,
            pv.ai_extracted,
            pv.ai_confidence,
            pv.created_at,
            pv.updated_at,
            pv.source_shell_file_id
        FROM patient_vitals pv
        WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'patient_vitals' AND column_name IN ('event_id', 'clinical_event_id')
        )
    ),
    created_events AS (
        INSERT INTO patient_clinical_events (
            patient_id,
            shell_file_id,
            activity_type,
            clinical_purposes,
            event_name,
            event_date,
            ai_extracted,
            ai_confidence,
            created_at,
            updated_at,
            is_synthetic
        )
        SELECT
            ov.patient_id,
            COALESCE(
                ov.source_shell_file_id,
                (SELECT id FROM shell_files WHERE patient_id = ov.patient_id LIMIT 1)
            ),
            'observation' AS activity_type,
            ARRAY['monitoring']::TEXT[] AS clinical_purposes,
            'Vital Signs: ' || ov.vital_type AS event_name,
            ov.measurement_date AS event_date,
            ov.ai_extracted,
            COALESCE(ov.ai_confidence, 0.700),
            ov.created_at,
            ov.updated_at,
            TRUE -- Mark as synthetic
        FROM orphaned_vitals ov
        RETURNING id, patient_id, event_name, event_date, created_at, updated_at
    ),
    audit_records AS (
        INSERT INTO migration_08_backfill_audit (source_table, source_record_id, created_event_id, backfill_reason)
        SELECT
            'patient_vitals',
            ov.vital_id,
            ce.id,
            'Synthetic event created for orphaned vital record'
        FROM orphaned_vitals ov
        JOIN created_events ce ON ov.patient_id = ce.patient_id
            AND ov.measurement_date = ce.event_date
            AND ov.created_at = ce.created_at
            AND ov.updated_at = ce.updated_at
        RETURNING *
    )
    SELECT COUNT(*) INTO v_count FROM audit_records;

    RAISE NOTICE 'Backfilled % orphaned patient_vitals records', v_count;
END $$;

-- =============================================================================
-- BACKFILL 2-5: Tables with clinical_event_id from migration 02
-- =============================================================================

-- For patient_conditions, patient_allergies, patient_medications, patient_immunizations:
-- Only backfill records where clinical_event_id IS NULL

-- Patient Conditions
DO $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    WITH orphaned_conditions AS (
        SELECT
            pc.id as condition_id,
            pc.patient_id,
            pc.condition_name,
            pc.onset_date,
            pc.ai_extracted,
            pc.ai_confidence,
            pc.created_at,
            pc.updated_at,
            pc.shell_file_id  -- CORRECT: shell_file_id not primary_shell_file_id
        FROM patient_conditions pc
        WHERE pc.clinical_event_id IS NULL
    ),
    created_events AS (
        INSERT INTO patient_clinical_events (
            patient_id,
            shell_file_id,
            activity_type,
            clinical_purposes,
            event_name,
            event_date,
            ai_extracted,
            ai_confidence,
            created_at,
            updated_at,
            is_synthetic
        )
        SELECT
            oc.patient_id,
            oc.shell_file_id,  -- REQUIRED NOT NULL field per schema
            'observation' AS activity_type,
            ARRAY['diagnosis']::TEXT[] AS clinical_purposes,
            'Condition: ' || oc.condition_name AS event_name,
            COALESCE(oc.onset_date, oc.created_at) AS event_date,
            oc.ai_extracted,
            COALESCE(oc.ai_confidence, 0.700),
            oc.created_at,
            oc.updated_at,
            TRUE
        FROM orphaned_conditions oc
        RETURNING id, patient_id, event_date, created_at, updated_at
    )
    INSERT INTO migration_08_backfill_audit (source_table, source_record_id, created_event_id, backfill_reason)
    SELECT
        'patient_conditions',
        oc.condition_id,
        ce.id,
        'Synthetic event created for orphaned condition record'
    FROM orphaned_conditions oc
    JOIN created_events ce ON oc.patient_id = ce.patient_id
        AND COALESCE(oc.onset_date, oc.created_at) = ce.event_date
        AND oc.created_at = ce.created_at
        AND oc.updated_at = ce.updated_at;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled % orphaned patient_conditions records', v_count;
END $$;

-- Patient Allergies
DO $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    WITH orphaned_allergies AS (
        SELECT
            pa.id as allergy_id,
            pa.patient_id,
            pa.allergen_name,
            pa.verified_date,  -- CORRECT: verified_date, not onset_date (which doesn't exist)
            pa.ai_extracted,
            pa.ai_confidence,
            pa.created_at,
            pa.updated_at,
            pa.source_shell_file_id  -- CORRECT: source_shell_file_id not primary_shell_file_id
        FROM patient_allergies pa
        WHERE pa.clinical_event_id IS NULL
    ),
    created_events AS (
        INSERT INTO patient_clinical_events (
            patient_id,
            shell_file_id,
            activity_type,
            clinical_purposes,
            event_name,
            event_date,
            ai_extracted,
            ai_confidence,
            created_at,
            updated_at,
            is_synthetic
        )
        SELECT
            oa.patient_id,
            COALESCE(
                oa.source_shell_file_id,
                (SELECT id FROM shell_files WHERE patient_id = oa.patient_id LIMIT 1)
            ),
            'observation' AS activity_type,
            ARRAY['safety']::TEXT[] AS clinical_purposes,
            'Allergy: ' || oa.allergen_name AS event_name,
            COALESCE(oa.verified_date, oa.created_at) AS event_date,  -- CORRECT: use verified_date
            oa.ai_extracted,
            COALESCE(oa.ai_confidence, 0.700),
            oa.created_at,
            oa.updated_at,
            TRUE
        FROM orphaned_allergies oa
        RETURNING id, patient_id, event_date, created_at, updated_at
    )
    INSERT INTO migration_08_backfill_audit (source_table, source_record_id, created_event_id, backfill_reason)
    SELECT
        'patient_allergies',
        oa.allergy_id,
        ce.id,
        'Synthetic event created for orphaned allergy record'
    FROM orphaned_allergies oa
    JOIN created_events ce ON oa.patient_id = ce.patient_id
        AND COALESCE(oa.verified_date, oa.created_at) = ce.event_date
        AND oa.created_at = ce.created_at
        AND oa.updated_at = ce.updated_at;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled % orphaned patient_allergies records', v_count;
END $$;

-- Patient Medications
DO $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    WITH orphaned_medications AS (
        SELECT
            pm.id as medication_id,
            pm.patient_id,
            pm.medication_name,
            pm.start_date,
            pm.ai_extracted,
            pm.ai_confidence,
            pm.created_at,
            pm.updated_at,
            pm.source_shell_file_id  -- CORRECT: source_shell_file_id not primary_shell_file_id
        FROM patient_medications pm
        WHERE pm.clinical_event_id IS NULL
    ),
    created_events AS (
        INSERT INTO patient_clinical_events (
            patient_id,
            shell_file_id,
            activity_type,
            clinical_purposes,
            event_name,
            event_date,
            ai_extracted,
            ai_confidence,
            created_at,
            updated_at,
            is_synthetic
        )
        SELECT
            om.patient_id,
            COALESCE(
                om.source_shell_file_id,
                (SELECT id FROM shell_files WHERE patient_id = om.patient_id LIMIT 1)
            ),
            'intervention' AS activity_type,
            ARRAY['treatment']::TEXT[] AS clinical_purposes,
            'Medication: ' || om.medication_name AS event_name,
            COALESCE(om.start_date, om.created_at) AS event_date,
            om.ai_extracted,
            COALESCE(om.ai_confidence, 0.700),
            om.created_at,
            om.updated_at,
            TRUE
        FROM orphaned_medications om
        RETURNING id, patient_id, event_date, created_at, updated_at
    )
    INSERT INTO migration_08_backfill_audit (source_table, source_record_id, created_event_id, backfill_reason)
    SELECT
        'patient_medications',
        om.medication_id,
        ce.id,
        'Synthetic event created for orphaned medication record'
    FROM orphaned_medications om
    JOIN created_events ce ON om.patient_id = ce.patient_id
        AND COALESCE(om.start_date, om.created_at) = ce.event_date
        AND om.created_at = ce.created_at
        AND om.updated_at = ce.updated_at;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled % orphaned patient_medications records', v_count;
END $$;

-- Patient Immunizations
DO $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    WITH orphaned_immunizations AS (
        SELECT
            pi.id as immunization_id,
            pi.patient_id,
            pi.vaccine_name,
            pi.administration_date,
            pi.ai_extracted,
            pi.ai_confidence,
            pi.created_at,
            pi.updated_at,
            pi.source_shell_file_id  -- CORRECT: source_shell_file_id not primary_shell_file_id
        FROM patient_immunizations pi
        WHERE pi.clinical_event_id IS NULL
    ),
    created_events AS (
        INSERT INTO patient_clinical_events (
            patient_id,
            shell_file_id,
            activity_type,
            clinical_purposes,
            event_name,
            event_date,
            ai_extracted,
            ai_confidence,
            created_at,
            updated_at,
            is_synthetic
        )
        SELECT
            oi.patient_id,
            COALESCE(
                oi.source_shell_file_id,
                (SELECT id FROM shell_files WHERE patient_id = oi.patient_id LIMIT 1)
            ),
            'intervention' AS activity_type,
            ARRAY['prevention']::TEXT[] AS clinical_purposes,
            'Immunization: ' || oi.vaccine_name AS event_name,
            oi.administration_date AS event_date,
            oi.ai_extracted,
            COALESCE(oi.ai_confidence, 0.700),
            oi.created_at,
            oi.updated_at,
            TRUE
        FROM orphaned_immunizations oi
        RETURNING id, patient_id, event_date, created_at, updated_at
    )
    INSERT INTO migration_08_backfill_audit (source_table, source_record_id, created_event_id, backfill_reason)
    SELECT
        'patient_immunizations',
        oi.immunization_id,
        ce.id,
        'Synthetic event created for orphaned immunization record'
    FROM orphaned_immunizations oi
    JOIN created_events ce ON oi.patient_id = ce.patient_id
        AND oi.administration_date = ce.event_date
        AND oi.created_at = ce.created_at
        AND oi.updated_at = ce.updated_at;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled % orphaned patient_immunizations records', v_count;
END $$;

COMMIT;

-- =============================================================================
-- PHASE 3: ADD/RENAME event_id COLUMNS
-- =============================================================================

BEGIN;

-- Add event_id to patient_vitals (doesn't have it yet)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_vitals' AND column_name = 'event_id') THEN
        ALTER TABLE patient_vitals
        ADD COLUMN event_id UUID REFERENCES patient_clinical_events(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added event_id column to patient_vitals';
    END IF;
END $$;

-- Rename clinical_event_id → event_id for consistency
DO $$
BEGIN
    -- Patient Conditions
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'patient_conditions' AND column_name = 'clinical_event_id') THEN
        ALTER TABLE patient_conditions RENAME COLUMN clinical_event_id TO event_id;
        RAISE NOTICE 'Renamed clinical_event_id to event_id in patient_conditions';
    END IF;

    -- Patient Allergies
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'patient_allergies' AND column_name = 'clinical_event_id') THEN
        ALTER TABLE patient_allergies RENAME COLUMN clinical_event_id TO event_id;
        RAISE NOTICE 'Renamed clinical_event_id to event_id in patient_allergies';
    END IF;

    -- Patient Medications
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'patient_medications' AND column_name = 'clinical_event_id') THEN
        ALTER TABLE patient_medications RENAME COLUMN clinical_event_id TO event_id;
        RAISE NOTICE 'Renamed clinical_event_id to event_id in patient_medications';
    END IF;

    -- Patient Immunizations
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'patient_immunizations' AND column_name = 'clinical_event_id') THEN
        ALTER TABLE patient_immunizations RENAME COLUMN clinical_event_id TO event_id;
        RAISE NOTICE 'Renamed clinical_event_id to event_id in patient_immunizations';
    END IF;
END $$;

-- Drop redundant clinical_event_id from observations/interventions if migration 02 added it
DO $$
BEGIN
    -- Patient Observations
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'patient_observations' AND column_name = 'clinical_event_id') THEN
        ALTER TABLE patient_observations DROP COLUMN clinical_event_id;
        RAISE NOTICE 'Dropped redundant clinical_event_id from patient_observations';
    END IF;

    -- Patient Interventions
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'patient_interventions' AND column_name = 'clinical_event_id') THEN
        ALTER TABLE patient_interventions DROP COLUMN clinical_event_id;
        RAISE NOTICE 'Dropped redundant clinical_event_id from patient_interventions';
    END IF;
END $$;

COMMIT;

-- =============================================================================
-- PHASE 4: LINK ORPHANED RECORDS TO SYNTHETIC EVENTS
-- =============================================================================

BEGIN;

-- Update patient_vitals with event_id from backfill
UPDATE patient_vitals pv
SET event_id = ba.created_event_id
FROM migration_08_backfill_audit ba
WHERE ba.source_table = 'patient_vitals'
  AND ba.source_record_id = pv.id
  AND pv.event_id IS NULL;

-- Update patient_conditions
UPDATE patient_conditions pc
SET event_id = ba.created_event_id
FROM migration_08_backfill_audit ba
WHERE ba.source_table = 'patient_conditions'
  AND ba.source_record_id = pc.id
  AND pc.event_id IS NULL;

-- Update patient_allergies
UPDATE patient_allergies pa
SET event_id = ba.created_event_id
FROM migration_08_backfill_audit ba
WHERE ba.source_table = 'patient_allergies'
  AND ba.source_record_id = pa.id
  AND pa.event_id IS NULL;

-- Update patient_medications
UPDATE patient_medications pm
SET event_id = ba.created_event_id
FROM migration_08_backfill_audit ba
WHERE ba.source_table = 'patient_medications'
  AND ba.source_record_id = pm.id
  AND pm.event_id IS NULL;

-- Update patient_immunizations
UPDATE patient_immunizations pi
SET event_id = ba.created_event_id
FROM migration_08_backfill_audit ba
WHERE ba.source_table = 'patient_immunizations'
  AND ba.source_record_id = pi.id
  AND pi.event_id IS NULL;

-- Note: All orphaned records linked to synthetic events

COMMIT;

-- =============================================================================
-- PHASE 5: CREATE INDEXES CONCURRENTLY (Non-blocking)
-- =============================================================================

-- Create indexes outside transaction for CONCURRENTLY support
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_observations_event_id
    ON patient_observations(event_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_interventions_event_id
    ON patient_interventions(event_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_vitals_event_id
    ON patient_vitals(event_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_conditions_event_id
    ON patient_conditions(event_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_allergies_event_id
    ON patient_allergies(event_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_medications_event_id
    ON patient_medications(event_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_immunizations_event_id
    ON patient_immunizations(event_id);

-- Note: All event_id indexes created CONCURRENTLY (non-blocking)

-- =============================================================================
-- PHASE 6: ADD COMPOSITE FOREIGN KEYS (NOT VALID, then VALIDATE)
-- =============================================================================

BEGIN;

-- Add composite FKs that enforce patient_id consistency
-- Using NOT VALID allows constraint creation without full table scan
-- Then VALIDATE CONSTRAINT performs the check

-- NOTE: patient_observations and patient_interventions are EXCLUDED from composite FK
-- These tables have NO patient_id column (only event_id)
-- This is correct design - they derive patient_id through parent event
-- They already have single-column FK via event_id definition

-- Patient Vitals
ALTER TABLE patient_vitals
ADD CONSTRAINT patient_vitals_event_patient_fk
    FOREIGN KEY (event_id, patient_id)
    REFERENCES patient_clinical_events(id, patient_id)
    ON DELETE CASCADE
    NOT VALID;

-- Patient Conditions
ALTER TABLE patient_conditions
ADD CONSTRAINT patient_conditions_event_patient_fk
    FOREIGN KEY (event_id, patient_id)
    REFERENCES patient_clinical_events(id, patient_id)
    ON DELETE CASCADE
    NOT VALID;

-- Patient Allergies
ALTER TABLE patient_allergies
ADD CONSTRAINT patient_allergies_event_patient_fk
    FOREIGN KEY (event_id, patient_id)
    REFERENCES patient_clinical_events(id, patient_id)
    ON DELETE CASCADE
    NOT VALID;

-- Patient Medications
ALTER TABLE patient_medications
ADD CONSTRAINT patient_medications_event_patient_fk
    FOREIGN KEY (event_id, patient_id)
    REFERENCES patient_clinical_events(id, patient_id)
    ON DELETE CASCADE
    NOT VALID;

-- Patient Immunizations
ALTER TABLE patient_immunizations
ADD CONSTRAINT patient_immunizations_event_patient_fk
    FOREIGN KEY (event_id, patient_id)
    REFERENCES patient_clinical_events(id, patient_id)
    ON DELETE CASCADE
    NOT VALID;

-- Note: All composite FK constraints added (NOT VALID - validation in next phase)

COMMIT;

-- =============================================================================
-- PHASE 7: VALIDATE CONSTRAINTS (Can be done separately during low-traffic window)
-- =============================================================================

BEGIN;

-- Validate all composite FK constraints
-- This performs full table scan but doesn't block writes as much as initial constraint creation

-- NOTE: Skip patient_observations and patient_interventions (no composite FK - they have no patient_id column)
ALTER TABLE patient_vitals VALIDATE CONSTRAINT patient_vitals_event_patient_fk;
ALTER TABLE patient_conditions VALIDATE CONSTRAINT patient_conditions_event_patient_fk;
ALTER TABLE patient_allergies VALIDATE CONSTRAINT patient_allergies_event_patient_fk;
ALTER TABLE patient_medications VALIDATE CONSTRAINT patient_medications_event_patient_fk;
ALTER TABLE patient_immunizations VALIDATE CONSTRAINT patient_immunizations_event_patient_fk;

-- Note: All composite FK constraints validated successfully

COMMIT;

-- =============================================================================
-- PHASE 8: ENFORCE NOT NULL CONSTRAINT
-- =============================================================================

BEGIN;

-- Make event_id required (NOT NULL) on all clinical tables
-- Only safe after backfill and validation complete

ALTER TABLE patient_observations ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE patient_interventions ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE patient_vitals ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE patient_conditions ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE patient_allergies ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE patient_medications ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE patient_immunizations ALTER COLUMN event_id SET NOT NULL;

-- Note: NOT NULL constraint enforced on event_id for all clinical tables

COMMIT;

-- =============================================================================
-- PHASE 9: UPDATE CURRENT SCHEMA DOCUMENTATION
-- =============================================================================

-- Note: This step is manual - update 03_clinical_core.sql to reflect new reality:
-- 1. All clinical detail tables have event_id UUID NOT NULL
-- 2. Composite FK (event_id, patient_id) enforces patient_id consistency
-- 3. patient_clinical_events has UNIQUE (id, patient_id)
-- 4. healthcare_encounters remains parent-only (no event_id)

-- =============================================================================
-- VALIDATION QUERIES (Run after migration to verify success)
-- =============================================================================

-- Check for any remaining NULL event_id values (should return 0 for all)
-- SELECT 'patient_observations' as table_name, COUNT(*) as null_count FROM patient_observations WHERE event_id IS NULL
-- UNION ALL
-- SELECT 'patient_interventions', COUNT(*) FROM patient_interventions WHERE event_id IS NULL
-- UNION ALL
-- SELECT 'patient_vitals', COUNT(*) FROM patient_vitals WHERE event_id IS NULL
-- UNION ALL
-- SELECT 'patient_conditions', COUNT(*) FROM patient_conditions WHERE event_id IS NULL
-- UNION ALL
-- SELECT 'patient_allergies', COUNT(*) FROM patient_allergies WHERE event_id IS NULL
-- UNION ALL
-- SELECT 'patient_medications', COUNT(*) FROM patient_medications WHERE event_id IS NULL
-- UNION ALL
-- SELECT 'patient_immunizations', COUNT(*) FROM patient_immunizations WHERE event_id IS NULL;

-- Verify composite FK integrity (should return 0 mismatches)
-- SELECT COUNT(*) as mismatched_patient_ids
-- FROM patient_observations po
-- JOIN patient_clinical_events pce ON po.event_id = pce.id
-- WHERE po.patient_id != pce.patient_id;
-- -- Repeat for all other clinical tables

-- Check backfill audit trail
-- SELECT source_table, COUNT(*) as synthetic_events_created
-- FROM migration_08_backfill_audit
-- GROUP BY source_table
-- ORDER BY source_table;

-- Verify is_synthetic flag
-- SELECT
--     COUNT(*) as total_events,
--     SUM(CASE WHEN is_synthetic THEN 1 ELSE 0 END) as synthetic_events,
--     SUM(CASE WHEN NOT is_synthetic THEN 1 ELSE 0 END) as real_events
-- FROM patient_clinical_events;

-- =============================================================================
-- ROLLBACK PLAN (If migration fails or needs reverting)
-- =============================================================================

-- If you need to rollback this migration:
-- 1. Drop composite FK constraints
-- 2. Rename event_id back to clinical_event_id (where applicable)
-- 3. Make event_id/clinical_event_id nullable again
-- 4. Drop composite UNIQUE (id, patient_id) from patient_clinical_events
-- 5. Optionally delete synthetic events created during backfill
-- 6. Drop indexes on event_id
-- 7. Drop migration_08_backfill_audit table

-- Example rollback commands:
-- BEGIN;
-- ALTER TABLE patient_vitals DROP CONSTRAINT patient_vitals_event_patient_fk;
-- ALTER TABLE patient_vitals ALTER COLUMN event_id DROP NOT NULL;
-- ALTER TABLE patient_vitals RENAME COLUMN event_id TO clinical_event_id;
-- ALTER TABLE patient_clinical_events DROP CONSTRAINT patient_clinical_events_id_patient_id_key;
-- DELETE FROM patient_clinical_events WHERE is_synthetic = TRUE;
-- DROP TABLE migration_08_backfill_audit;
-- COMMIT;
-- -- Repeat for all affected tables

-- =============================================================================
-- POST-MIGRATION ACTIONS REQUIRED
-- =============================================================================

-- 1. Update all Pass 2 bridge schemas to require event_id and document parent-first extraction
-- 2. Update Pass 2 AI system prompt to enforce event-first creation order
-- 3. Update API endpoints to create event + detail atomically in transactions
-- 4. Add helper functions for synthetic events (manual entry use case)
-- 5. Update CLINICAL_TABLES_HUB_SPOKE_ARCHITECTURE_CLEANUP.md with "RESOLVED" status
-- 6. Update current_schema/03_clinical_core.sql documentation to reflect new constraints

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
