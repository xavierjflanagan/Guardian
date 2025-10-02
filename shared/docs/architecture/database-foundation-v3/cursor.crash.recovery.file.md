.Perfect! All changes are in one file. Let me create a comprehensive update plan:

  📋 Source of Truth Update Plan - Migration 08

  Files Requiring Updates

  Single File: /shared/docs/architecture/database-foundation-v3/current_schema/03_clinical_core.sql

  All 8 affected tables are in this file:
  - ✅ patient_clinical_events (hub table)
  - ✅ patient_observations
  - ✅ patient_interventions
  - ✅ patient_vitals
  - ✅ patient_conditions
  - ✅ patient_allergies
  - ✅ patient_medications
  - ✅ patient_immunizations

  ---
  Required Schema Changes

  1. patient_clinical_events (Hub Table)

  Changes:
  - Add UNIQUE (id, patient_id) constraint
  - Add is_synthetic BOOLEAN DEFAULT FALSE column

  Location: Lines ~280-351

  Update:
  CREATE TABLE IF NOT EXISTS patient_clinical_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      -- ... existing fields ...

      -- Migration 08: Hub-and-spoke enforcement
      is_synthetic BOOLEAN DEFAULT FALSE, -- Tracks backfilled events from orphaned records

      -- ... existing audit fields ...

      -- Migration 08: Composite unique constraint for child table integrity
      CONSTRAINT patient_clinical_events_id_patient_id_key UNIQUE (id, patient_id)
  );

  2. patient_observations

  Current State: ✅ Already has event_id UUID NOT NULL
  Changes:
  - Drop clinical_event_id column if present from migration 02
  - Add comment documenting event_id is required
  - Add index: idx_patient_observations_event_id

  Update:
  CREATE TABLE IF NOT EXISTS patient_observations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE, -- Migration 08: Required hub reference
      -- ... rest of fields (NO patient_id column - derives through event_id) ...
  );

  -- Migration 08: Event reference index
  CREATE INDEX IF NOT EXISTS idx_patient_observations_event_id ON patient_observations(event_id);

  3. patient_interventions

  Current State: ✅ Already has event_id UUID NOT NULL
  Changes:
  - Drop clinical_event_id column if present from migration 02
  - Add comment documenting event_id is required
  - Add index: idx_patient_interventions_event_id

  Update:
  CREATE TABLE IF NOT EXISTS patient_interventions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE, -- Migration 08: Required hub reference
      -- ... rest of fields (NO patient_id column - derives through event_id) ...
  );

  -- Migration 08: Event reference index
  CREATE INDEX IF NOT EXISTS idx_patient_interventions_event_id ON patient_interventions(event_id);

  4. patient_vitals

  Changes:
  - Add event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE
  - Add composite FK: CONSTRAINT patient_vitals_event_patient_fk FOREIGN KEY (event_id, patient_id) REFERENCES patient_clinical_events(id, patient_id) ON 
  DELETE CASCADE
  - Add index: idx_patient_vitals_event_id

  Update:
  CREATE TABLE IF NOT EXISTS patient_vitals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE, -- Migration 08: Required hub reference
      -- ... rest of fields ...

      -- Migration 08: Composite FK ensures patient_id consistency with parent event
      CONSTRAINT patient_vitals_event_patient_fk FOREIGN KEY (event_id, patient_id)
          REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
  );

  -- Migration 08: Event reference index
  CREATE INDEX IF NOT EXISTS idx_patient_vitals_event_id ON patient_vitals(event_id);

  5. patient_conditions

  Changes:
  - Rename clinical_event_id → event_id
  - Make event_id NOT NULL
  - Add composite FK
  - Add index: idx_patient_conditions_event_id

  Update:
  CREATE TABLE IF NOT EXISTS patient_conditions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE, -- Migration 08: Renamed from clinical_event_id, now required
      -- ... rest of fields ...

      -- Migration 08: Composite FK ensures patient_id consistency
      CONSTRAINT patient_conditions_event_patient_fk FOREIGN KEY (event_id, patient_id)
          REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
  );

  -- Migration 08: Event reference index
  CREATE INDEX IF NOT EXISTS idx_patient_conditions_event_id ON patient_conditions(event_id);

  6. patient_allergies

  Changes:
  - Add event_id column (if clinical_event_id exists, rename it)
  - Make event_id NOT NULL
  - Add composite FK
  - Add index: idx_patient_allergies_event_id

  Update:
  CREATE TABLE IF NOT EXISTS patient_allergies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE, -- Migration 08: Required hub reference
      -- ... rest of fields ...

      -- Migration 08: Composite FK ensures patient_id consistency
      CONSTRAINT patient_allergies_event_patient_fk FOREIGN KEY (event_id, patient_id)
          REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
  );

  -- Migration 08: Event reference index
  CREATE INDEX IF NOT EXISTS idx_patient_allergies_event_id ON patient_allergies(event_id);

  7. patient_medications

  Changes:
  - Add event_id column (if clinical_event_id exists, rename it)
  - Make event_id NOT NULL
  - Add composite FK
  - Add index: idx_patient_medications_event_id

  Update:
  CREATE TABLE IF NOT EXISTS patient_medications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE, -- Migration 08: Required hub reference
      -- ... rest of fields ...

      -- Migration 08: Composite FK ensures patient_id consistency
      CONSTRAINT patient_medications_event_patient_fk FOREIGN KEY (event_id, patient_id)
          REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
  );

  -- Migration 08: Event reference index
  CREATE INDEX IF NOT EXISTS idx_patient_medications_event_id ON patient_medications(event_id);

  8. patient_immunizations

  Changes:
  - Add event_id column (if clinical_event_id exists, rename it)
  - Make event_id NOT NULL
  - Add composite FK
  - Add index: idx_patient_immunizations_event_id

  Update:
  CREATE TABLE IF NOT EXISTS patient_immunizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE, -- Migration 08: Required hub reference
      -- ... rest of fields ...

      -- Migration 08: Composite FK ensures patient_id consistency
      CONSTRAINT patient_immunizations_event_patient_fk FOREIGN KEY (event_id, patient_id)
          REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
  );

  -- Migration 08: Event reference index
  CREATE INDEX IF NOT EXISTS idx_patient_immunizations_event_id ON patient_immunizations(event_id);

  ---
  Additional File Updates

  9. migration_08_backfill_audit table (New Table)

  Location: Add to end of 03_clinical_core.sql or create new tracking section

  -- =============================================================================
  -- MIGRATION 08 AUDIT TRACKING
  -- =============================================================================

  -- Audit table for tracking synthetic events created during hub-and-spoke migration
  CREATE TABLE IF NOT EXISTS migration_08_backfill_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_table TEXT NOT NULL,
      source_record_id UUID NOT NULL,
      created_event_id UUID NOT NULL,
      backfill_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      backfill_reason TEXT
  );

  ---
  Migration Script Header Update

  Update the header of migration_history/2025-09-30_08_enforce_hub_spoke_architecture.sql:

  -- =============================================================================
  -- Migration: Enforce Hub-and-Spoke Architecture for Clinical Tables
  -- Date: 30 September 2025
  -- Author: Xavier Flanagan / Claude Code
  -- Reviewed By: GPT-5
  -- Status: ✅ COMPLETED - Executed in staging 30 Sept 2025
  -- =============================================================================

  -- SOURCE OF TRUTH UPDATES:
  -- This migration updates the following schema files:
  -- - current_schema/03_clinical_core.sql (8 tables + 1 audit table)
  --   - patient_clinical_events: Added is_synthetic column + UNIQUE(id, patient_id) constraint
  --   - patient_observations: Documented event_id requirement + added index
  --   - patient_interventions: Documented event_id requirement + added index
  --   - patient_vitals: Added event_id column + composite FK + index
  --   - patient_conditions: Renamed clinical_event_id→event_id + composite FK + index
  --   - patient_allergies: Added event_id column + composite FK + index
  --   - patient_medications: Added event_id column + composite FK + index
  --   - patient_immunizations: Added event_id column + composite FK + index
  --   - migration_08_backfill_audit: New tracking table for synthetic events

  ---
  Execution Plan

  1. ✅ Backup current 03_clinical_core.sql to archive folder
  2. ✅ Update patient_clinical_events (add is_synthetic + UNIQUE constraint)
  3. ✅ Update patient_observations (document + index)
  4. ✅ Update patient_interventions (document + index)
  5. ✅ Update patient_vitals (add event_id + composite FK + index)
  6. ✅ Update patient_conditions (rename clinical_event_id + composite FK + index)
  7. ✅ Update patient_allergies (add event_id + composite FK + index)
  8. ✅ Update patient_medications (add event_id + composite FK + index)
  9. ✅ Update patient_immunizations (add event_id + composite FK + index)
  10. ✅ Add migration_08_backfill_audit table at end of file
  11. ✅ Update migration script header with source of truth notes

  ---
  Summary

  Files to Update: 1 file (03_clinical_core.sql)
  Tables Modified: 8 tables
  New Tables: 1 audit table
  Total Changes: ~10 schema modifications + 8 index additions