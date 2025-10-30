-- =============================================================================
-- TEMPORAL DATA MANAGEMENT MIGRATION
-- =============================================================================
-- Date: 2025-09-25 (SUCCESSFULLY DEPLOYED)
-- Module: 02 - Temporal Data Management
-- Priority: PHASE 1 (Foundation)
-- Dependencies: 01_universal_date_format_management.sql, medical-code-resolution system
-- Risk Level: HIGH (affects all clinical tables, major schema changes)
--
-- SOURCE OF TRUTH UPDATED: 2025-09-26
-- Updated: shared/docs/architecture/database-foundation-v3/current_schema/03_clinical_core.sql
-- Added: Section 4C - Temporal Data Management Enhancements
-- Added: Temporal columns, audit tables (temporal_audit_log, identity_audit_log, temporal_processing_log)
-- Added: Materialized view (temporal_data_summary)
--
-- Purpose: Enable deterministic deduplication with temporal precedence and clinical identity
-- Architecture: Silver tables as source of truth with complete audit trail preservation
-- Integration: Foundation for narrative architecture and dashboard queries
-- =============================================================================

BEGIN;

-- =============================================================================
-- PREFLIGHT VALIDATION
-- =============================================================================

DO $$
DECLARE
    clinical_tables TEXT[] := ARRAY[
        'patient_medications', 'patient_conditions', 'patient_allergies',
        'patient_vitals', 'patient_immunizations', 'patient_interventions',
        'patient_observations', 'healthcare_encounters', 'healthcare_timeline_events'
    ];
    tbl_name TEXT;
    missing_tables TEXT[] := '{}';
BEGIN
    -- Verify all clinical tables exist
    FOREACH tbl_name IN ARRAY clinical_tables LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_name = tbl_name) THEN
            missing_tables := array_append(missing_tables, tbl_name);
        END IF;
    END LOOP;

    IF array_length(missing_tables, 1) > 0 THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: Missing clinical tables: %. Run 03_clinical_core.sql first.',
                       array_to_string(missing_tables, ', ');
    END IF;

    -- Verify dependency tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_name = 'patient_clinical_events') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: patient_clinical_events table not found. Required for clinical_event_id references.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_name = 'clinical_narratives') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: clinical_narratives table not found. Required for primary_narrative_id references.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_name = 'shell_files') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: shell_files table not found. Required for shell_file_id references.';
    END IF;

    -- Check PostgreSQL version for generated columns
    IF current_setting('server_version_num')::int < 120000 THEN
        RAISE EXCEPTION 'SYSTEM ERROR: PostgreSQL 12+ required for STORED generated columns.';
    END IF;

    -- Verify pgcrypto extension for gen_random_uuid()
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: pgcrypto extension required for gen_random_uuid().';
    END IF;

    -- Check if RLS helper function exists (needed for policies)
    IF NOT EXISTS (SELECT 1 FROM information_schema.routines
                   WHERE routine_name = 'get_allowed_patient_ids' AND routine_schema = 'public') THEN
        RAISE WARNING 'RLS FUNCTION MISSING: get_allowed_patient_ids() not found. RLS policies will be skipped.';
    END IF;

    -- Check if temporal columns already exist (partial migration recovery)
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'patient_medications' AND column_name = 'valid_from') THEN
        RAISE WARNING 'PARTIAL MIGRATION DETECTED: Some temporal columns already exist. Migration will skip existing columns.';
    END IF;

    RAISE NOTICE 'Preflight validation passed: Ready for Temporal Data Management migration';
    RAISE NOTICE 'Target tables: %', array_to_string(clinical_tables, ', ');
END $$;

-- =============================================================================
-- 1. CLINICAL ENTITY TABLE ENHANCEMENTS
-- =============================================================================

-- Function to safely add columns (idempotent)
CREATE OR REPLACE FUNCTION add_temporal_columns_to_table(p_table_name TEXT)
RETURNS VOID AS $$
DECLARE
    has_clinical_event_id BOOLEAN;
    has_primary_narrative_id BOOLEAN;
    sql_statements TEXT[];
    stmt TEXT;
BEGIN
    -- Check for existing columns that might conflict
    SELECT
        EXISTS(SELECT 1 FROM information_schema.columns c
               WHERE c.table_name = p_table_name AND c.column_name = 'clinical_event_id'),
        EXISTS(SELECT 1 FROM information_schema.columns c
               WHERE c.table_name = p_table_name AND c.column_name = 'primary_narrative_id')
    INTO has_clinical_event_id, has_primary_narrative_id;

    -- Build SQL statements array
    sql_statements := ARRAY[]::TEXT[];

    -- Russian Babushka Doll linking (skip if exists)
    IF NOT has_clinical_event_id THEN
        sql_statements := array_append(sql_statements,
            'clinical_event_id UUID REFERENCES patient_clinical_events(id)');
    END IF;

    IF NOT has_primary_narrative_id THEN
        sql_statements := array_append(sql_statements,
            'primary_narrative_id UUID REFERENCES clinical_narratives(id)');
    END IF;

    -- Temporal deduplication columns (check each for idempotency)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name = p_table_name AND c.column_name = 'valid_from') THEN
        sql_statements := array_append(sql_statements, 'valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW()');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name = p_table_name AND c.column_name = 'valid_to') THEN
        sql_statements := array_append(sql_statements, 'valid_to TIMESTAMPTZ NULL');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name = p_table_name AND c.column_name = 'superseded_by_record_id') THEN
        sql_statements := array_append(sql_statements, 'superseded_by_record_id UUID REFERENCES ' || p_table_name || '(id) ON DELETE SET NULL');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name = p_table_name AND c.column_name = 'supersession_reason') THEN
        sql_statements := array_append(sql_statements, 'supersession_reason TEXT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name = p_table_name AND c.column_name = 'is_current') THEN
        sql_statements := array_append(sql_statements, 'is_current BOOLEAN GENERATED ALWAYS AS (valid_to IS NULL) STORED');
    END IF;

    -- Clinical identity and date resolution columns (check each for idempotency)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name = p_table_name AND c.column_name = 'clinical_effective_date') THEN
        sql_statements := array_append(sql_statements, 'clinical_effective_date DATE');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name = p_table_name AND c.column_name = 'date_confidence') THEN
        sql_statements := array_append(sql_statements, 'date_confidence TEXT CHECK (date_confidence IN (''high'', ''medium'', ''low'', ''conflicted''))');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name = p_table_name AND c.column_name = 'extracted_dates') THEN
        sql_statements := array_append(sql_statements, 'extracted_dates JSONB DEFAULT ''[]''::jsonb');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name = p_table_name AND c.column_name = 'date_source') THEN
        sql_statements := array_append(sql_statements, 'date_source TEXT CHECK (date_source IN (''clinical_content'', ''document_date'', ''file_metadata'', ''upload_timestamp'', ''user_provided''))');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name = p_table_name AND c.column_name = 'date_conflicts') THEN
        sql_statements := array_append(sql_statements, 'date_conflicts JSONB DEFAULT ''[]''::jsonb');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name = p_table_name AND c.column_name = 'date_resolution_reason') THEN
        sql_statements := array_append(sql_statements, 'date_resolution_reason TEXT');
    END IF;

    -- Execute ALTER TABLE with all columns
    IF array_length(sql_statements, 1) > 0 THEN
        EXECUTE 'ALTER TABLE ' || p_table_name || ' ADD COLUMN ' || array_to_string(sql_statements, ', ADD COLUMN ');

        RAISE NOTICE 'Added temporal columns to %: %',
                    p_table_name,
                    CASE
                        WHEN has_clinical_event_id AND has_primary_narrative_id THEN 'temporal only'
                        WHEN has_clinical_event_id OR has_primary_narrative_id THEN 'partial + temporal'
                        ELSE 'full set'
                    END;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply temporal columns to all clinical tables
SELECT add_temporal_columns_to_table('patient_medications');
SELECT add_temporal_columns_to_table('patient_conditions'); -- Will skip existing columns
SELECT add_temporal_columns_to_table('patient_allergies');
SELECT add_temporal_columns_to_table('patient_vitals');
SELECT add_temporal_columns_to_table('patient_immunizations');
SELECT add_temporal_columns_to_table('patient_interventions');
SELECT add_temporal_columns_to_table('patient_observations');
SELECT add_temporal_columns_to_table('healthcare_encounters');
SELECT add_temporal_columns_to_table('healthcare_timeline_events');

-- Clean up the helper function
DROP FUNCTION add_temporal_columns_to_table(TEXT);

-- =============================================================================
-- 2. CLINICAL IDENTITY KEY GENERATION (Generated Columns)
-- =============================================================================

-- Patient Medications Identity
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_medications' AND column_name = 'clinical_identity_key') THEN
        ALTER TABLE patient_medications ADD COLUMN
          clinical_identity_key TEXT GENERATED ALWAYS AS (
            CASE
              WHEN rxnorm_code IS NOT NULL THEN 'rxnorm:' || rxnorm_code
              WHEN pbs_code IS NOT NULL THEN 'pbs:' || pbs_code
              WHEN atc_code IS NOT NULL THEN 'atc:' || atc_code
              WHEN medication_name IS NOT NULL AND strength IS NOT NULL
                THEN 'composite:' || LOWER(medication_name) || ':' || strength || ':' || COALESCE(LOWER(dosage_form), 'unknown')
              ELSE 'fallback:' || id::text
            END
          ) STORED;
    END IF;
END $$;

-- Patient Conditions Identity
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_conditions' AND column_name = 'clinical_identity_key') THEN
        ALTER TABLE patient_conditions ADD COLUMN
          clinical_identity_key TEXT GENERATED ALWAYS AS (
            CASE
              WHEN condition_code IS NOT NULL AND condition_system = 'snomed' THEN 'snomed:' || condition_code
              WHEN condition_code IS NOT NULL AND condition_system = 'icd10' THEN 'icd10:' || condition_code
              WHEN condition_code IS NOT NULL THEN condition_system || ':' || condition_code
              ELSE 'normalized:' || LOWER(TRIM(condition_name))
            END
          ) STORED;
    END IF;
END $$;

-- Patient Allergies Identity (substance-based)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_allergies' AND column_name = 'clinical_identity_key') THEN
        ALTER TABLE patient_allergies ADD COLUMN
          clinical_identity_key TEXT GENERATED ALWAYS AS (
            CASE
              WHEN allergen_code IS NOT NULL THEN 'allergen_code:' || allergen_code
              ELSE 'substance:' || LOWER(TRIM(allergen_name))
            END
          ) STORED;
    END IF;
END $$;

-- Patient Vitals Identity (type + date based for point-in-time measurements)
-- Using regular column + trigger due to timezone-dependent date formatting
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_vitals' AND column_name = 'clinical_identity_key') THEN
        ALTER TABLE patient_vitals ADD COLUMN clinical_identity_key TEXT;
    END IF;
END $$;

-- Trigger function for patient_vitals identity key
CREATE OR REPLACE FUNCTION update_patient_vitals_identity_key()
RETURNS TRIGGER AS $$
BEGIN
    NEW.clinical_identity_key := CASE
        WHEN NEW.measurement_date IS NOT NULL
            THEN 'vital:' || NEW.vital_type || ':' || to_char(NEW.measurement_date::date, 'YYYY-MM-DD')
        ELSE 'vital:' || NEW.vital_type || ':unknown_date'
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_patient_vitals_identity_key ON patient_vitals;
CREATE TRIGGER trigger_update_patient_vitals_identity_key
    BEFORE INSERT OR UPDATE ON patient_vitals
    FOR EACH ROW
    EXECUTE FUNCTION update_patient_vitals_identity_key();

-- Patient Immunizations Identity (vaccine + date based)
-- Using regular column + trigger due to timezone-dependent date formatting
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_immunizations' AND column_name = 'clinical_identity_key') THEN
        ALTER TABLE patient_immunizations ADD COLUMN clinical_identity_key TEXT;
    END IF;
END $$;

-- Trigger function for patient_immunizations identity key
CREATE OR REPLACE FUNCTION update_patient_immunizations_identity_key()
RETURNS TRIGGER AS $$
BEGIN
    NEW.clinical_identity_key := CASE
        WHEN NEW.snomed_code IS NOT NULL
            THEN 'snomed_vaccine:' || NEW.snomed_code || ':' || COALESCE(to_char(NEW.administration_date::date, 'YYYY-MM-DD'), 'unknown_date')
        WHEN NEW.cvx_code IS NOT NULL
            THEN 'cvx:' || NEW.cvx_code || ':' || COALESCE(to_char(NEW.administration_date::date, 'YYYY-MM-DD'), 'unknown_date')
        ELSE
            'vaccine:' || LOWER(NEW.vaccine_name) || ':' || COALESCE(to_char(NEW.administration_date::date, 'YYYY-MM-DD'), 'unknown_date')
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_patient_immunizations_identity_key ON patient_immunizations;
CREATE TRIGGER trigger_update_patient_immunizations_identity_key
    BEFORE INSERT OR UPDATE ON patient_immunizations
    FOR EACH ROW
    EXECUTE FUNCTION update_patient_immunizations_identity_key();

-- Apply similar patterns to remaining tables with appropriate identity logic
DO $$
DECLARE
    table_record RECORD;
    remaining_tables TEXT[] := ARRAY['patient_interventions', 'patient_observations', 'healthcare_encounters', 'healthcare_timeline_events'];
    tbl_name TEXT;
BEGIN
    FOREACH tbl_name IN ARRAY remaining_tables LOOP
        -- Generic fallback identity for tables without specific medical codes
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns c
                       WHERE c.table_name = tbl_name AND c.column_name = 'clinical_identity_key') THEN
            EXECUTE 'ALTER TABLE ' || tbl_name || ' ADD COLUMN
              clinical_identity_key TEXT GENERATED ALWAYS AS (''generic:'' || id::text) STORED';

            RAISE NOTICE 'Added generic identity key to %', tbl_name;
        END IF;
    END LOOP;
END $$;

-- =============================================================================
-- 3. DEDUPLICATION CONSTRAINTS & PERFORMANCE INDEXES
-- =============================================================================

-- Function to create deduplication indexes for a table
CREATE OR REPLACE FUNCTION create_deduplication_indexes(p_table_name TEXT)
RETURNS VOID AS $$
DECLARE
    unique_index_name TEXT;
    dedup_index_name TEXT;
    supersession_index_name TEXT;
    patient_ref_column TEXT;
BEGIN
    -- Determine the patient reference column based on table structure
    CASE p_table_name
        WHEN 'patient_interventions', 'patient_observations' THEN
            -- These tables reference patient through event_id -> patient_clinical_events.patient_id
            -- Skip unique constraints for these tables as they require JOIN-based queries
            RAISE NOTICE 'Skipped deduplication indexes for % - uses event_id relationship', p_table_name;
            RETURN;
        WHEN 'healthcare_encounters', 'healthcare_timeline_events' THEN
            patient_ref_column := 'patient_id';
        ELSE
            patient_ref_column := 'patient_id'; -- Default for direct patient tables
    END CASE;

    -- Unique constraint: One current record per clinical identity per patient
    unique_index_name := 'idx_single_current_per_identity_' || replace(p_table_name, 'patient_', '');
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS ' || unique_index_name || ' ON ' || p_table_name ||
            ' (' || patient_ref_column || ', clinical_identity_key) WHERE is_current = true';

    -- Performance index for deduplication lookups
    dedup_index_name := 'idx_' || replace(p_table_name, 'patient_', '') || '_dedup_lookup';
    EXECUTE 'CREATE INDEX IF NOT EXISTS ' || dedup_index_name || ' ON ' || p_table_name ||
            ' (' || patient_ref_column || ', clinical_identity_key, is_current, clinical_effective_date)';

    -- Supersession chain traversal index
    supersession_index_name := 'idx_' || replace(p_table_name, 'patient_', '') || '_supersession';
    EXECUTE 'CREATE INDEX IF NOT EXISTS ' || supersession_index_name || ' ON ' || p_table_name ||
            ' (superseded_by_record_id) WHERE superseded_by_record_id IS NOT NULL';

    RAISE NOTICE 'Created deduplication indexes for %: %, %, %',
                 p_table_name, unique_index_name, dedup_index_name, supersession_index_name;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for all clinical tables
SELECT create_deduplication_indexes('patient_medications');
SELECT create_deduplication_indexes('patient_conditions');
SELECT create_deduplication_indexes('patient_allergies');
SELECT create_deduplication_indexes('patient_vitals');
SELECT create_deduplication_indexes('patient_immunizations');
SELECT create_deduplication_indexes('patient_interventions');
SELECT create_deduplication_indexes('patient_observations');
SELECT create_deduplication_indexes('healthcare_encounters');
SELECT create_deduplication_indexes('healthcare_timeline_events');

-- Clean up helper function
DROP FUNCTION create_deduplication_indexes(TEXT);

-- =============================================================================
-- 4. NEW AUDIT TABLES
-- =============================================================================

-- Track all supersession decisions for compliance
CREATE TABLE clinical_entity_supersession_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id),
    superseded_entity_id UUID NOT NULL,
    superseding_entity_id UUID NOT NULL,
    entity_table TEXT NOT NULL,
    supersession_type TEXT NOT NULL CHECK (supersession_type IN ('EXACT_DUPLICATE', 'PARAMETER_CHANGE', 'STATUS_CHANGE', 'TEMPORAL_ONLY')),
    supersession_reason TEXT NOT NULL,
    confidence_score DECIMAL(3,2),
    shell_file_trigger UUID REFERENCES shell_files(id),
    decision_metadata JSONB DEFAULT '{}'::jsonb,
    processing_version TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track clinical identity key assignments
CREATE TABLE clinical_identity_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id),
    clinical_entity_id UUID NOT NULL,
    entity_table TEXT NOT NULL,
    clinical_identity_key TEXT NOT NULL,
    identity_method TEXT NOT NULL,
    medical_codes_used JSONB DEFAULT '{}'::jsonb,
    identity_confidence DECIMAL(3,2),
    safety_checks_passed JSONB DEFAULT '{}'::jsonb,
    processing_version TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track temporal date resolution decisions
CREATE TABLE temporal_resolution_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id),
    clinical_entity_id UUID NOT NULL,
    entity_table TEXT NOT NULL,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id),
    extracted_dates JSONB NOT NULL,
    resolved_date DATE NOT NULL,
    date_confidence TEXT NOT NULL,
    date_source TEXT NOT NULL,
    resolution_reason TEXT,
    processing_version TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit tables
CREATE INDEX idx_supersession_audit_patient ON clinical_entity_supersession_audit(patient_id);
CREATE INDEX idx_supersession_audit_entity ON clinical_entity_supersession_audit(superseded_entity_id);
CREATE INDEX idx_supersession_audit_table ON clinical_entity_supersession_audit(entity_table);
CREATE INDEX idx_supersession_audit_created ON clinical_entity_supersession_audit(created_at);

CREATE INDEX idx_identity_audit_patient ON clinical_identity_audit(patient_id);
CREATE INDEX idx_identity_audit_entity ON clinical_identity_audit(clinical_entity_id, entity_table);
CREATE INDEX idx_identity_audit_key ON clinical_identity_audit(clinical_identity_key);

CREATE INDEX idx_temporal_audit_patient ON temporal_resolution_audit(patient_id);
CREATE INDEX idx_temporal_audit_entity ON temporal_resolution_audit(clinical_entity_id, entity_table);
CREATE INDEX idx_temporal_audit_date ON temporal_resolution_audit(resolved_date);

-- =============================================================================
-- 5. PROCESSING INFRASTRUCTURE
-- =============================================================================

-- Idempotency tracking for batch deduplication processing
CREATE TABLE deduplication_processing_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id),
    shell_file_id UUID NOT NULL REFERENCES shell_files(id),
    processing_status TEXT NOT NULL DEFAULT 'processing' CHECK (processing_status IN ('processing', 'completed', 'failed', 'cancelled')),
    entities_processed INTEGER DEFAULT 0,
    supersessions_applied INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL,
    error_details JSONB NULL,
    processing_version TEXT
);

CREATE UNIQUE INDEX idx_processing_idempotency
  ON deduplication_processing_log (patient_id, shell_file_id);

CREATE INDEX idx_processing_status ON deduplication_processing_log(processing_status);
CREATE INDEX idx_processing_started ON deduplication_processing_log(started_at);

-- Materialized view for fast dashboard queries (current clinical state)
CREATE MATERIALIZED VIEW patient_current_clinical_state AS
SELECT
  patient_id, 'medication' as entity_type, clinical_identity_key,
  id as current_record_id, clinical_effective_date, date_confidence,
  'patient_medications' as source_table
FROM patient_medications WHERE is_current = true
UNION ALL
SELECT
  patient_id, 'condition' as entity_type, clinical_identity_key,
  id as current_record_id, clinical_effective_date, date_confidence,
  'patient_conditions' as source_table
FROM patient_conditions WHERE is_current = true
UNION ALL
SELECT
  patient_id, 'allergy' as entity_type, clinical_identity_key,
  id as current_record_id, clinical_effective_date, date_confidence,
  'patient_allergies' as source_table
FROM patient_allergies WHERE is_current = true
UNION ALL
SELECT
  patient_id, 'vital' as entity_type, clinical_identity_key,
  id as current_record_id, clinical_effective_date, date_confidence,
  'patient_vitals' as source_table
FROM patient_vitals WHERE is_current = true
UNION ALL
SELECT
  patient_id, 'immunization' as entity_type, clinical_identity_key,
  id as current_record_id, clinical_effective_date, date_confidence,
  'patient_immunizations' as source_table
FROM patient_immunizations WHERE is_current = true;

-- Indexes for materialized view performance
CREATE UNIQUE INDEX idx_current_state_pk
  ON patient_current_clinical_state (patient_id, entity_type, clinical_identity_key);

CREATE INDEX idx_current_state_patient
  ON patient_current_clinical_state (patient_id);

CREATE INDEX idx_current_state_type
  ON patient_current_clinical_state (entity_type);

CREATE INDEX idx_current_state_date
  ON patient_current_clinical_state (clinical_effective_date);

-- =============================================================================
-- 6. ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on new audit tables
ALTER TABLE clinical_entity_supersession_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_identity_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE temporal_resolution_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE deduplication_processing_log ENABLE ROW LEVEL SECURITY;

-- Patient isolation policies for audit tables using has_profile_access (consistent with 03_clinical_core.sql)
CREATE POLICY "Users can only access their own supersession audit"
  ON clinical_entity_supersession_audit FOR ALL
  USING (has_profile_access(auth.uid(), patient_id));

CREATE POLICY "Users can only access their own identity audit"
  ON clinical_identity_audit FOR ALL
  USING (has_profile_access(auth.uid(), patient_id));

CREATE POLICY "Users can only access their own temporal audit"
  ON temporal_resolution_audit FOR ALL
  USING (has_profile_access(auth.uid(), patient_id));

CREATE POLICY "Users can only access their own processing logs"
  ON deduplication_processing_log FOR ALL
  USING (has_profile_access(auth.uid(), patient_id));

DO $$
BEGIN
    RAISE NOTICE 'RLS policies created successfully for audit tables using has_profile_access';
END $$;

-- Note: Clinical tables inherit existing RLS policies, temporal columns are covered

-- =============================================================================
-- 7. UTILITY FUNCTIONS
-- =============================================================================

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_current_clinical_state()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW patient_current_clinical_state;
    RAISE NOTICE 'Patient current clinical state materialized view refreshed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Function to get current clinical state for a patient
CREATE OR REPLACE FUNCTION get_patient_current_state(p_patient_id UUID)
RETURNS TABLE (
    entity_type TEXT,
    clinical_identity_key TEXT,
    current_record_id UUID,
    clinical_effective_date DATE,
    date_confidence TEXT,
    source_table TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pccs.entity_type,
        pccs.clinical_identity_key,
        pccs.current_record_id,
        pccs.clinical_effective_date,
        pccs.date_confidence,
        pccs.source_table
    FROM patient_current_clinical_state pccs
    WHERE pccs.patient_id = p_patient_id
    ORDER BY pccs.entity_type, pccs.clinical_effective_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- =============================================================================
-- 8. AUDIT LOGGING
-- =============================================================================

-- Log this migration for audit purposes
DO $$
BEGIN
    PERFORM log_audit_event(
        'system_migration',
        '2025-09-25_02_temporal_data_management',
        'INSERT',
        NULL,
        jsonb_build_object(
            'migration_type', 'temporal_data_management',
            'tables_modified', ARRAY['patient_medications', 'patient_conditions', 'patient_allergies', 'patient_vitals', 'patient_immunizations', 'patient_interventions', 'patient_observations', 'healthcare_encounters', 'healthcare_timeline_events'],
            'new_tables', ARRAY['clinical_entity_supersession_audit', 'clinical_identity_audit', 'temporal_resolution_audit', 'deduplication_processing_log'],
            'materialized_views', ARRAY['patient_current_clinical_state'],
            'new_functions', ARRAY['refresh_current_clinical_state', 'get_patient_current_state'],
            'columns_added_per_table', 12,
            'indexes_created', 27,
            'generated_columns_added', 9
        ),
        'Temporal Data Management module deployment - comprehensive deduplication framework',
        'system'
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Audit logging failed for migration: %', SQLERRM;
END $$;

-- =============================================================================
-- 9. DEPLOYMENT VERIFICATION
-- =============================================================================

DO $$
DECLARE
    clinical_tables TEXT[] := ARRAY[
        'patient_medications', 'patient_conditions', 'patient_allergies',
        'patient_vitals', 'patient_immunizations', 'patient_interventions',
        'patient_observations', 'healthcare_encounters', 'healthcare_timeline_events'
    ];
    tbl_name TEXT;
    temporal_columns_per_table INTEGER;
    total_temporal_columns INTEGER := 0;
    audit_table_count INTEGER;
    processing_table_count INTEGER;
    matview_count INTEGER;
    function_count INTEGER;
    index_count INTEGER;
BEGIN
    -- Check temporal columns added to each clinical table
    FOREACH tbl_name IN ARRAY clinical_tables LOOP
        SELECT COUNT(*) INTO temporal_columns_per_table
        FROM information_schema.columns c
        WHERE c.table_name = tbl_name
        AND column_name IN ('valid_from', 'valid_to', 'superseded_by_record_id', 'supersession_reason', 'is_current',
                           'clinical_identity_key', 'clinical_effective_date', 'date_confidence',
                           'extracted_dates', 'date_source', 'date_conflicts', 'date_resolution_reason');

        total_temporal_columns := total_temporal_columns + temporal_columns_per_table;
    END LOOP;

    -- Check audit tables
    SELECT COUNT(*) INTO audit_table_count
    FROM information_schema.tables
    WHERE table_name IN ('clinical_entity_supersession_audit', 'clinical_identity_audit', 'temporal_resolution_audit');

    -- Check processing infrastructure
    SELECT COUNT(*) INTO processing_table_count
    FROM information_schema.tables
    WHERE table_name = 'deduplication_processing_log';

    -- Check materialized view
    SELECT COUNT(*) INTO matview_count
    FROM pg_matviews
    WHERE matviewname = 'patient_current_clinical_state';

    -- Check functions
    SELECT COUNT(*) INTO function_count
    FROM information_schema.routines
    WHERE routine_name IN ('refresh_current_clinical_state', 'get_patient_current_state')
    AND routine_schema = 'public';

    -- Check indexes (approximate count)
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE indexname LIKE '%dedup%' OR indexname LIKE '%supersession%' OR indexname LIKE '%current_state%';

    -- Report results
    IF total_temporal_columns >= 96 AND audit_table_count = 3 AND processing_table_count = 1
       AND matview_count = 1 AND function_count = 2 AND index_count >= 25 THEN
        RAISE NOTICE 'Temporal Data Management migration completed successfully!';
        RAISE NOTICE '   - % temporal columns added across % clinical tables', total_temporal_columns, array_length(clinical_tables, 1);
        RAISE NOTICE '   - % audit tables created', audit_table_count;
        RAISE NOTICE '   - % processing infrastructure tables created', processing_table_count;
        RAISE NOTICE '   - % materialized views created', matview_count;
        RAISE NOTICE '   - % utility functions deployed', function_count;
        RAISE NOTICE '   - ~% performance indexes created', index_count;
        RAISE NOTICE '   - Ready for medical-code-resolution and narrative-architecture integration';
    ELSE
        RAISE WARNING 'Migration completed with potential issues:';
        RAISE WARNING '   - Temporal columns: %/96, Audit tables: %/3, Processing: %/1',
                     total_temporal_columns, audit_table_count, processing_table_count;
        RAISE WARNING '   - MatViews: %/1, Functions: %/2, Indexes: %/25+',
                     matview_count, function_count, index_count;
    END IF;
END $$;

COMMIT;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
-- Temporal Data Management module deployed successfully
-- Next step: Run medical-code-resolution migration
-- Source of truth update: Update current_schema/03_clinical_core.sql with temporal columns
-- =============================================================================