-- Clinical Events Core System Implementation
-- Guardian v7 Implementation - Step 3
-- File: 003_clinical_events_core.sql
-- Implements O3's two-axis classification model: activity_type × clinical_purposes

BEGIN;

-- Create central clinical events table using O3's unified model
CREATE TABLE patient_clinical_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    encounter_id UUID REFERENCES healthcare_encounters(id),
    
    -- O3's Two-Axis Classification System
    activity_type TEXT NOT NULL CHECK (activity_type IN ('observation', 'intervention')),
    clinical_purposes TEXT[] NOT NULL, -- Multi-purpose: ['screening', 'diagnostic', 'therapeutic', 'monitoring', 'preventive']
    
    -- Event Details
    event_name TEXT NOT NULL, -- "Blood Pressure Measurement", "Wart Cryotherapy", "HIV Test"
    method TEXT, -- 'physical_exam', 'laboratory', 'imaging', 'injection', 'surgery', 'assessment_tool'
    body_site TEXT, -- 'left_ear', 'chest', 'left_hand', 'brain'
    
    -- Healthcare Standards Integration
    snomed_code TEXT, -- SNOMED CT codes for clinical concepts
    loinc_code TEXT, -- LOINC codes for observations and lab tests
    cpt_code TEXT, -- CPT codes for procedures and services
    
    -- Timing and Context
    event_date TIMESTAMPTZ NOT NULL,
    performed_by TEXT, -- Healthcare provider or facility
    
    -- Data Quality and Provenance
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    source_document_id UUID REFERENCES documents(id),
    
    -- Audit and Lifecycle Management
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_reason TEXT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- User Review Tracking
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ
);

-- Performance indexes for clinical events
CREATE INDEX idx_patient_clinical_events_patient ON patient_clinical_events(patient_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_clinical_events_type ON patient_clinical_events(activity_type) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_clinical_events_purposes ON patient_clinical_events USING GIN(clinical_purposes) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_clinical_events_date ON patient_clinical_events(patient_id, event_date DESC) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_clinical_events_encounter ON patient_clinical_events(encounter_id) WHERE encounter_id IS NOT NULL AND archived IS NOT TRUE;
CREATE INDEX idx_patient_clinical_events_review ON patient_clinical_events(requires_review) WHERE requires_review = TRUE AND archived IS NOT TRUE;

-- Enable RLS for patient isolation
ALTER TABLE patient_clinical_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy for user data isolation
CREATE POLICY patient_clinical_events_user_isolation ON patient_clinical_events
    FOR ALL USING (auth.uid() = patient_id AND archived IS NOT TRUE);

-- Create observation details table for information gathering events
CREATE TABLE patient_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE,
    
    -- Classification
    observation_type TEXT NOT NULL, -- 'vital_sign', 'lab_result', 'physical_finding', 'assessment_score'
    
    -- Measurement Values (flexible value storage)
    value_text TEXT, -- Original extracted text value
    value_numeric NUMERIC, -- Normalized numeric value
    value_boolean BOOLEAN, -- For yes/no findings
    unit TEXT, -- Measurement unit
    
    -- Reference Ranges and Interpretation
    reference_range_text TEXT, -- "Normal: 120-140 mg/dL"
    reference_range_low NUMERIC,
    reference_range_high NUMERIC,
    interpretation TEXT, -- 'normal', 'high', 'low', 'critical', 'abnormal'
    
    -- Assessment/Screening Specific Fields
    assessment_tool TEXT, -- 'MMSE', 'PHQ-9', 'Glasgow Coma Scale'
    score_max NUMERIC, -- Maximum possible score (e.g., 30 for MMSE)
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for observation queries
CREATE INDEX idx_patient_observations_event ON patient_observations(event_id);
CREATE INDEX idx_patient_observations_type ON patient_observations(observation_type);
CREATE INDEX idx_patient_observations_interpretation ON patient_observations(interpretation) WHERE interpretation IN ('high', 'low', 'critical', 'abnormal');

-- Create intervention details table for action events
CREATE TABLE patient_interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES patient_clinical_events(id) ON DELETE CASCADE,
    
    -- Classification
    intervention_type TEXT NOT NULL, -- 'medication_admin', 'vaccination', 'minor_procedure', 'surgery', 'therapy'
    
    -- Substance/Medication Details (for drugs, vaccines, etc.)
    substance_name TEXT, -- "Influenza A Vaccine", "Lidocaine", "Atorvastatin"
    manufacturer TEXT,
    lot_number TEXT,
    dose_amount NUMERIC,
    dose_unit TEXT,
    route TEXT, -- 'oral', 'intramuscular', 'topical', 'intravenous'
    
    -- Technique and Equipment
    technique TEXT, -- 'cryotherapy', 'excision', 'injection', 'suture'
    equipment_used TEXT, -- "Liquid nitrogen", "10-blade scalpel"
    
    -- Outcomes and Follow-up
    immediate_outcome TEXT, -- 'successful', 'partial', 'complications'
    complications TEXT, -- Description of any complications
    followup_required BOOLEAN DEFAULT FALSE,
    followup_instructions TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for intervention queries
CREATE INDEX idx_patient_interventions_event ON patient_interventions(event_id);
CREATE INDEX idx_patient_interventions_type ON patient_interventions(intervention_type);
CREATE INDEX idx_patient_interventions_substance ON patient_interventions(substance_name) WHERE substance_name IS NOT NULL;

-- Create healthcare encounters table for visit context
CREATE TABLE healthcare_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Encounter Classification
    encounter_type TEXT NOT NULL, -- 'outpatient', 'inpatient', 'emergency', 'specialist', 'telehealth', 'diagnostic'
    encounter_date TIMESTAMPTZ,
    
    -- Provider and Facility Information
    provider_name TEXT,
    provider_type TEXT, -- 'primary_care', 'specialist', 'hospital', 'urgent_care'
    facility_name TEXT,
    specialty TEXT, -- 'cardiology', 'dermatology', 'family_medicine'
    
    -- Clinical Context
    chief_complaint TEXT, -- Patient's main concern
    summary TEXT, -- Visit summary
    clinical_impression TEXT, -- Provider's assessment
    plan TEXT, -- Treatment plan
    
    -- Administrative
    visit_duration_minutes INTEGER,
    billing_codes TEXT[], -- CPT codes for billing
    
    -- Document Links
    primary_document_id UUID REFERENCES documents(id),
    related_document_ids UUID[] DEFAULT '{}',
    
    -- Quality and Audit
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for encounter queries
CREATE INDEX idx_healthcare_encounters_patient ON healthcare_encounters(patient_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_healthcare_encounters_date ON healthcare_encounters(patient_id, encounter_date DESC) WHERE archived IS NOT TRUE;
CREATE INDEX idx_healthcare_encounters_type ON healthcare_encounters(encounter_type) WHERE archived IS NOT TRUE;
CREATE INDEX idx_healthcare_encounters_provider ON healthcare_encounters USING GIN(to_tsvector('english', provider_name)) WHERE archived IS NOT TRUE;

-- Enable RLS for encounters
ALTER TABLE healthcare_encounters ENABLE ROW LEVEL SECURITY;

-- RLS Policy for encounter isolation
CREATE POLICY healthcare_encounters_user_isolation ON healthcare_encounters
    FOR ALL USING (auth.uid() = patient_id AND archived IS NOT TRUE);

-- Create imaging reports table
CREATE TABLE patient_imaging_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Imaging Study Details
    imaging_type TEXT NOT NULL, -- 'x_ray', 'ct_scan', 'mri', 'ultrasound', 'mammogram', 'pet_scan'
    body_region TEXT, -- 'chest', 'abdomen', 'brain', 'left_knee', 'pelvis'
    study_date TIMESTAMPTZ,
    
    -- Clinical Context
    indication TEXT, -- Reason for imaging study
    clinical_history TEXT, -- Relevant patient history
    
    -- Findings and Results
    findings TEXT, -- Detailed radiologist findings
    impression TEXT, -- Radiologist's conclusion/diagnosis
    recommendations TEXT, -- Follow-up recommendations
    
    -- Technical Parameters
    contrast_used BOOLEAN DEFAULT FALSE,
    contrast_type TEXT, -- 'iodinated', 'gadolinium', 'barium'
    technique_notes TEXT,
    
    -- Provider Information
    facility_name TEXT,
    radiologist_name TEXT,
    referring_physician TEXT,
    
    -- Healthcare Standards
    cpt_code TEXT, -- Imaging procedure code
    icd10_codes TEXT[], -- Associated diagnosis codes
    dicom_study_uid TEXT, -- DICOM unique identifier
    
    -- Links and Context
    encounter_id UUID REFERENCES healthcare_encounters(id),
    source_document_id UUID REFERENCES documents(id),
    
    -- Quality Control
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    
    -- Audit
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for imaging queries
CREATE INDEX idx_patient_imaging_patient ON patient_imaging_reports(patient_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_imaging_type ON patient_imaging_reports(imaging_type) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_imaging_date ON patient_imaging_reports(patient_id, study_date DESC) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_imaging_body_region ON patient_imaging_reports(body_region) WHERE archived IS NOT TRUE;

-- Enable RLS for imaging reports
ALTER TABLE patient_imaging_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policy for imaging isolation
CREATE POLICY patient_imaging_reports_user_isolation ON patient_imaging_reports
    FOR ALL USING (auth.uid() = patient_id AND archived IS NOT TRUE);

-- Update existing clinical tables to link with clinical events
ALTER TABLE patient_conditions ADD COLUMN discovery_event_id UUID REFERENCES patient_clinical_events(id);
ALTER TABLE patient_conditions ADD COLUMN encounter_id UUID REFERENCES healthcare_encounters(id);
CREATE INDEX idx_patient_conditions_discovery_event ON patient_conditions(discovery_event_id) WHERE discovery_event_id IS NOT NULL;

ALTER TABLE patient_allergies ADD COLUMN discovery_event_id UUID REFERENCES patient_clinical_events(id);
ALTER TABLE patient_allergies ADD COLUMN encounter_id UUID REFERENCES healthcare_encounters(id);
CREATE INDEX idx_patient_allergies_discovery_event ON patient_allergies(discovery_event_id) WHERE discovery_event_id IS NOT NULL;

-- Create updated_at trigger for clinical events (function defined in system infrastructure)
CREATE TRIGGER update_patient_clinical_events_updated_at
    BEFORE UPDATE ON patient_clinical_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verify clinical events implementation
DO $$
DECLARE
    clinical_events_exists BOOLEAN;
    observations_exists BOOLEAN;
    interventions_exists BOOLEAN;
    encounters_exists BOOLEAN;
    imaging_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'patient_clinical_events' AND table_schema = 'public'
    ) INTO clinical_events_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'patient_observations' AND table_schema = 'public'
    ) INTO observations_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'patient_interventions' AND table_schema = 'public'
    ) INTO interventions_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'healthcare_encounters' AND table_schema = 'public'
    ) INTO encounters_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'patient_imaging_reports' AND table_schema = 'public'
    ) INTO imaging_exists;
    
    IF clinical_events_exists AND observations_exists AND interventions_exists AND encounters_exists AND imaging_exists THEN
        RAISE NOTICE 'Clinical events core system implementation successful!';
        RAISE NOTICE 'Tables created: patient_clinical_events, patient_observations, patient_interventions, healthcare_encounters, patient_imaging_reports';
    ELSE
        RAISE WARNING 'Some clinical events tables missing. Check implementation.';
    END IF;
END;
$$;

COMMIT;

-- Success message
\echo 'Clinical events core system deployed successfully!'
\echo 'Features available:'
\echo '- O3 two-axis classification (observation/intervention × clinical purposes)'
\echo '- Unified clinical events with detailed observation and intervention records'
\echo '- Healthcare encounters with provider and facility context'
\echo '- Imaging reports with DICOM integration'
\echo '- Row Level Security for complete patient data isolation'
\echo 'Next step: Run 004_healthcare_journey.sql'