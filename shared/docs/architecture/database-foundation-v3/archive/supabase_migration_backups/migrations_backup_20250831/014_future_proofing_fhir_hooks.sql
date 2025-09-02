-- 014_future_proofing_fhir_hooks.sql
-- Minimal FHIR future-proofing for Phase 1 MVP
-- Based on O3's recommendation: "Schema forethought" + "Adapter pattern around ingestion"
-- Focus: Core tables only, no complex functions, clear rollback path

-- =============================================================================
-- CORE TABLE FUTURE-PROOFING (3 tables only)
-- =============================================================================

-- 1. Documents table - Primary file storage (most important for FHIR DocumentReference)
ALTER TABLE documents 
ADD COLUMN external_reference TEXT,
ADD COLUMN raw_source JSONB DEFAULT '{}',
ADD COLUMN source_system TEXT DEFAULT 'guardian_native';

-- 2. User profiles table - Patient data (maps to FHIR Patient resource) 
ALTER TABLE user_profiles
ADD COLUMN external_reference TEXT,
ADD COLUMN raw_source JSONB DEFAULT '{}',
ADD COLUMN source_system TEXT DEFAULT 'guardian_native';

-- 3. Patient conditions table - Medical data (maps to FHIR Condition resource)
ALTER TABLE patient_conditions
ADD COLUMN external_reference TEXT,
ADD COLUMN raw_source JSONB DEFAULT '{}',
ADD COLUMN source_system TEXT DEFAULT 'guardian_native';

-- =============================================================================
-- DOCUMENTATION & CONTEXT
-- =============================================================================

-- Column purposes for future developers
COMMENT ON COLUMN documents.external_reference IS 'Future Phase 2: FHIR DocumentReference.id';
COMMENT ON COLUMN documents.raw_source IS 'Future Phase 2: Original FHIR DocumentReference resource JSON';
COMMENT ON COLUMN documents.source_system IS 'Data origin: guardian_native, epic_fhir, cerner_fhir, etc.';

COMMENT ON COLUMN user_profiles.external_reference IS 'Future Phase 2: FHIR Patient.id';
COMMENT ON COLUMN user_profiles.raw_source IS 'Future Phase 2: Original FHIR Patient resource JSON';
COMMENT ON COLUMN user_profiles.source_system IS 'Data origin: guardian_native, epic_fhir, cerner_fhir, etc.';

COMMENT ON COLUMN patient_conditions.external_reference IS 'Future Phase 2: FHIR Condition.id';
COMMENT ON COLUMN patient_conditions.raw_source IS 'Future Phase 2: Original FHIR Condition resource JSON';
COMMENT ON COLUMN patient_conditions.source_system IS 'Data origin: guardian_native, epic_fhir, cerner_fhir, etc.';

-- =============================================================================
-- INDEXES FOR FUTURE PERFORMANCE
-- =============================================================================

-- Sparse indexes (only when external_reference exists)
CREATE INDEX idx_documents_external_ref ON documents(external_reference) 
    WHERE external_reference IS NOT NULL;

CREATE INDEX idx_user_profiles_external_ref ON user_profiles(external_reference) 
    WHERE external_reference IS NOT NULL;

CREATE INDEX idx_patient_conditions_external_ref ON patient_conditions(external_reference) 
    WHERE external_reference IS NOT NULL;

-- Source system filtering indexes
CREATE INDEX idx_documents_source_system ON documents(source_system);
CREATE INDEX idx_user_profiles_source_system ON user_profiles(source_system);
CREATE INDEX idx_patient_conditions_source_system ON patient_conditions(source_system);

-- =============================================================================
-- UTILITY FUNCTION (SIMPLE, NO STUBS)
-- =============================================================================

-- Helper to identify FHIR-sourced records
CREATE OR REPLACE FUNCTION is_fhir_record(p_source_system TEXT) 
RETURNS BOOLEAN AS $$
BEGIN
    RETURN p_source_system IS NOT NULL AND p_source_system LIKE '%_fhir';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- ROLLBACK DOCUMENTATION
-- =============================================================================

-- To rollback this migration:
-- ALTER TABLE documents DROP COLUMN external_reference, DROP COLUMN raw_source, DROP COLUMN source_system;
-- ALTER TABLE user_profiles DROP COLUMN external_reference, DROP COLUMN raw_source, DROP COLUMN source_system;
-- ALTER TABLE patient_conditions DROP COLUMN external_reference, DROP COLUMN raw_source, DROP COLUMN source_system;
-- DROP FUNCTION is_fhir_record(TEXT);
-- (Indexes will be dropped automatically with columns)

-- Migration summary: Added 9 columns total, 6 indexes, 1 utility function
-- Zero breaking changes to existing functionality
-- Prepares for FHIR integration without current implementation burden