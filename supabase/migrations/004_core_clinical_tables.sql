-- Core Clinical Tables Implementation
-- Guardian v7 Implementation - Core Foundation
-- File: 004_core_clinical_tables.sql
-- Purpose: Essential clinical tables that other scripts depend on

BEGIN;

-- =============================================================================
-- CORE DOCUMENT STORAGE TABLE
-- =============================================================================

-- Primary documents table (referenced by multiple other scripts)
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Document metadata
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    
    -- Processing status
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN (
        'uploaded', 'processing', 'completed', 'failed', 'archived'
    )),
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    processing_error TEXT,
    
    -- Document classification
    document_type TEXT CHECK (document_type IN (
        'medical_record', 'lab_result', 'imaging_report', 'prescription',
        'discharge_summary', 'referral', 'insurance_card', 'id_document', 'other'
    )),
    document_subtype TEXT,
    confidence_score NUMERIC(3,2),
    
    -- Content analysis
    extracted_text TEXT,
    ocr_confidence NUMERIC(3,2),
    page_count INTEGER DEFAULT 1,
    language_detected TEXT DEFAULT 'en',
    
    -- Healthcare-specific metadata
    provider_name TEXT,
    facility_name TEXT,
    service_date DATE,
    
    -- Security and compliance
    contains_phi BOOLEAN DEFAULT TRUE, -- Assume PHI until proven otherwise
    encryption_key_id TEXT,
    retention_period INTERVAL DEFAULT '7 years',
    
    -- Lifecycle management
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ -- Soft delete for compliance
);

-- =============================================================================
-- PATIENT CONDITIONS TABLE
-- =============================================================================

-- Patient medical conditions (referenced by clinical decision support)
CREATE TABLE IF NOT EXISTS patient_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Condition details
    condition_name TEXT NOT NULL,
    condition_code TEXT, -- ICD-10, SNOMED CT, etc.
    condition_system TEXT, -- 'icd10', 'snomed', 'custom'
    
    -- Clinical context
    severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe', 'critical')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'resolved', 'inactive', 'remission', 'relapse'
    )),
    
    -- Temporal information
    onset_date DATE,
    diagnosed_date DATE,
    resolved_date DATE,
    
    -- Source information
    diagnosed_by TEXT, -- Provider name
    source_document_id UUID REFERENCES documents(id),
    confidence_score NUMERIC(3,2) DEFAULT 1.0,
    
    -- Clinical notes
    notes TEXT,
    clinical_context JSONB DEFAULT '{}',
    
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

-- =============================================================================
-- PATIENT ALLERGIES TABLE
-- =============================================================================

-- Patient allergies and adverse reactions
CREATE TABLE IF NOT EXISTS patient_allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Allergen details
    allergen_name TEXT NOT NULL,
    allergen_type TEXT CHECK (allergen_type IN (
        'medication', 'food', 'environmental', 'contact', 'other'
    )),
    allergen_code TEXT, -- RxNorm, UNII, etc.
    
    -- Reaction details
    reaction_type TEXT CHECK (reaction_type IN (
        'allergic', 'intolerance', 'adverse_effect', 'unknown'
    )),
    severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe', 'life_threatening')),
    reaction_description TEXT,
    
    -- Clinical information
    symptoms TEXT[],
    onset_description TEXT, -- 'immediate', 'delayed', etc.
    
    -- Source and verification
    source_document_id UUID REFERENCES documents(id),
    verified_by TEXT, -- Provider name
    verified_date DATE,
    confidence_score NUMERIC(3,2) DEFAULT 1.0,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'inactive', 'resolved', 'entered_in_error'
    )),
    
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

-- =============================================================================
-- PATIENT VITALS TABLE
-- =============================================================================

-- Patient vital signs and measurements
CREATE TABLE IF NOT EXISTS patient_vitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Measurement details
    vital_type TEXT NOT NULL CHECK (vital_type IN (
        'blood_pressure', 'heart_rate', 'temperature', 'respiratory_rate',
        'oxygen_saturation', 'weight', 'height', 'bmi', 'blood_glucose', 'other'
    )),
    
    -- Values (using JSONB for flexibility with different measurement types)
    measurement_value JSONB NOT NULL, -- e.g., {"systolic": 120, "diastolic": 80} for BP
    unit TEXT NOT NULL, -- 'mmHg', 'bpm', 'F', 'C', 'kg', 'lbs', etc.
    
    -- Context
    measurement_date TIMESTAMPTZ NOT NULL,
    measurement_method TEXT, -- 'manual', 'automated', 'self_reported'
    body_position TEXT, -- 'sitting', 'standing', 'lying'
    
    -- Source information
    measured_by TEXT, -- Provider, patient, device
    source_document_id UUID REFERENCES documents(id),
    device_info JSONB, -- Device manufacturer, model, etc.
    
    -- Clinical context
    clinical_context TEXT, -- 'routine_visit', 'emergency', 'home_monitoring'
    notes TEXT,
    
    -- Quality indicators
    confidence_score NUMERIC(3,2) DEFAULT 1.0,
    is_abnormal BOOLEAN DEFAULT FALSE,
    reference_range JSONB, -- Normal ranges for this measurement
    
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

-- =============================================================================
-- ESSENTIAL INDEXES FOR PERFORMANCE
-- =============================================================================

-- Documents table indexes
CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status) WHERE status != 'archived';
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type, document_subtype);
CREATE INDEX IF NOT EXISTS idx_documents_service_date ON documents(patient_id, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_processing ON documents(status, processing_started_at) WHERE status = 'processing';

-- Patient conditions indexes
CREATE INDEX IF NOT EXISTS idx_patient_conditions_patient ON patient_conditions(patient_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patient_conditions_status ON patient_conditions(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_patient_conditions_code ON patient_conditions(condition_code, condition_system);
CREATE INDEX IF NOT EXISTS idx_patient_conditions_name ON patient_conditions USING gin(to_tsvector('english', condition_name));

-- Patient allergies indexes  
CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient ON patient_allergies(patient_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patient_allergies_status ON patient_allergies(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_patient_allergies_type ON patient_allergies(allergen_type);
CREATE INDEX IF NOT EXISTS idx_patient_allergies_severity ON patient_allergies(severity) WHERE severity IN ('severe', 'life_threatening');

-- Patient vitals indexes
CREATE INDEX IF NOT EXISTS idx_patient_vitals_patient_date ON patient_vitals(patient_id, measurement_date DESC);
CREATE INDEX IF NOT EXISTS idx_patient_vitals_type ON patient_vitals(vital_type, measurement_date DESC);
CREATE INDEX IF NOT EXISTS idx_patient_vitals_abnormal ON patient_vitals(patient_id, vital_type) WHERE is_abnormal = TRUE;

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on all core clinical tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_vitals ENABLE ROW LEVEL SECURITY;

-- Documents policies - patients see their own, providers with consent
CREATE POLICY documents_patient_access ON documents
    FOR ALL TO authenticated
    USING (patient_id = auth.uid())
    WITH CHECK (patient_id = auth.uid());

-- Conditions policies
CREATE POLICY patient_conditions_patient_access ON patient_conditions
    FOR ALL TO authenticated
    USING (patient_id = auth.uid())
    WITH CHECK (patient_id = auth.uid());

-- Allergies policies  
CREATE POLICY patient_allergies_patient_access ON patient_allergies
    FOR ALL TO authenticated
    USING (patient_id = auth.uid())
    WITH CHECK (patient_id = auth.uid());

-- Vitals policies
CREATE POLICY patient_vitals_patient_access ON patient_vitals
    FOR ALL TO authenticated
    USING (patient_id = auth.uid())
    WITH CHECK (patient_id = auth.uid());

-- =============================================================================
-- BACKWARD COMPATIBILITY VIEWS
-- =============================================================================

-- Materialized view for medications (backward compatibility)
CREATE MATERIALIZED VIEW IF NOT EXISTS patient_medications AS
SELECT 
    pc.id,
    pc.patient_id,
    pc.condition_name as medication_name,
    pc.condition_code as medication_code,
    'active' as status,
    pc.onset_date as start_date,
    pc.resolved_date as end_date,
    pc.diagnosed_by as prescribed_by,
    pc.notes as instructions,
    pc.created_at,
    pc.updated_at
FROM patient_conditions pc
WHERE pc.condition_system = 'medication' 
AND pc.archived_at IS NULL;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_medications_unique ON patient_medications(id);

-- Materialized view for lab results (backward compatibility)
CREATE MATERIALIZED VIEW IF NOT EXISTS patient_lab_results AS
SELECT 
    pv.id,
    pv.patient_id,
    pv.vital_type as test_name,
    pv.measurement_value as result_value,
    pv.unit,
    pv.measurement_date as test_date,
    pv.measured_by as ordered_by,
    pv.reference_range as normal_range,
    pv.is_abnormal,
    pv.clinical_context,
    pv.created_at,
    pv.updated_at
FROM patient_vitals pv
WHERE pv.vital_type IN ('blood_glucose', 'cholesterol', 'hemoglobin', 'other')
AND pv.archived_at IS NULL;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_lab_results_unique ON patient_lab_results(id);

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================

-- Apply updated_at triggers to all core tables
CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_conditions_updated_at
    BEFORE UPDATE ON patient_conditions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_allergies_updated_at
    BEFORE UPDATE ON patient_allergies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_vitals_updated_at
    BEFORE UPDATE ON patient_vitals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- AUDIT TRIGGERS
-- =============================================================================

-- Audit triggers for compliance tracking

-- Documents table audit function (uses patient_id field)
CREATE OR REPLACE FUNCTION audit_documents_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Log all changes to documents table
    PERFORM log_audit_event(
        TG_TABLE_NAME,
        COALESCE(NEW.id::text, OLD.id::text),
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        'Document management change',
        'clinical_data',
        COALESCE(NEW.patient_id, OLD.patient_id)
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Other clinical tables audit function (uses patient_id field)
CREATE OR REPLACE FUNCTION audit_core_clinical_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Log all changes to core clinical data
    PERFORM log_audit_event(
        TG_TABLE_NAME,
        COALESCE(NEW.id::text, OLD.id::text),
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        'Core clinical data change',
        'clinical_data',
        COALESCE(NEW.patient_id, OLD.patient_id)
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to all core clinical tables
CREATE TRIGGER trigger_audit_documents
    AFTER INSERT OR UPDATE OR DELETE ON documents
    FOR EACH ROW EXECUTE FUNCTION audit_documents_changes();

CREATE TRIGGER trigger_audit_patient_conditions
    AFTER INSERT OR UPDATE OR DELETE ON patient_conditions
    FOR EACH ROW EXECUTE FUNCTION audit_core_clinical_changes();

CREATE TRIGGER trigger_audit_patient_allergies
    AFTER INSERT OR UPDATE OR DELETE ON patient_allergies
    FOR EACH ROW EXECUTE FUNCTION audit_core_clinical_changes();

CREATE TRIGGER trigger_audit_patient_vitals
    AFTER INSERT OR UPDATE OR DELETE ON patient_vitals
    FOR EACH ROW EXECUTE FUNCTION audit_core_clinical_changes();

COMMIT;

-- =============================================================================
-- DEPLOYMENT VERIFICATION
-- =============================================================================

-- Verify core clinical tables deployment
DO $$
DECLARE
    table_count INTEGER;
    view_count INTEGER;
    trigger_count INTEGER;
BEGIN
    -- Check core tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_name IN ('documents', 'patient_conditions', 'patient_allergies', 'patient_vitals')
    AND table_schema = 'public';
    
    -- Check materialized views
    SELECT COUNT(*) INTO view_count
    FROM pg_matviews 
    WHERE matviewname IN ('patient_medications', 'patient_lab_results')
    AND schemaname = 'public';
    
    -- Check audit triggers
    SELECT COUNT(*) INTO trigger_count
    FROM information_schema.triggers 
    WHERE trigger_name LIKE 'trigger_audit_%'
    AND event_object_schema = 'public';
    
    IF table_count = 4 AND view_count = 2 AND trigger_count >= 4 THEN
        RAISE NOTICE '✅ Core clinical tables deployment successful!';
        RAISE NOTICE '   - % core tables created', table_count;
        RAISE NOTICE '   - % materialized views created', view_count;
        RAISE NOTICE '   - % audit triggers created', trigger_count;
    ELSE
        RAISE WARNING '❌ Core clinical tables deployment incomplete:';
        RAISE WARNING '   - Tables: %/4, Views: %/2, Triggers: %/4+', 
                     table_count, view_count, trigger_count;
    END IF;
END;
$$;

-- Success message
\echo 'Core clinical tables deployed successfully!'
\echo 'Tables created:'
\echo '- documents: Primary document storage with PHI protection'
\echo '- patient_conditions: Medical conditions with ICD-10/SNOMED support'
\echo '- patient_allergies: Allergies and adverse reactions tracking'
\echo '- patient_vitals: Vital signs and measurements'
\echo 'Backward compatibility views:'
\echo '- patient_medications: Medication view from conditions'
\echo '- patient_lab_results: Lab results view from vitals'
\echo 'Next step: Run 005_clinical_events_core.sql'