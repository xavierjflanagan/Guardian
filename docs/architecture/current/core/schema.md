# Guardian v7 Core Database Schema

**Status:** Foundational Schema  
**Date:** 2025-07-29  
**Purpose:** Core database structure that serves as the foundation for all Guardian healthcare data operations

---

## Overview

This document defines the foundational database schema for Guardian v7. It contains the essential database structure without performance optimizations, monitoring systems, or advanced features. This schema provides the core foundation upon which all other Guardian features are built.

**Key Principles:**
- User data isolation through Row Level Security (RLS)
- Healthcare compliance with comprehensive audit trails
- Flexible relationship modeling between clinical entities
- Provenance tracking for all extracted medical facts
- **Multi-profile architecture**: Support for dependent profiles (children, pets, etc.) under primary accounts
- **Smart feature detection**: Context-aware UI features that activate based on health data
- **Future-ready architecture**: Designed for provider portal integration while maintaining patient data sovereignty

---

## 1. Database Foundation & Extensions

### 1.1. Required PostgreSQL Extensions

```sql
-- Core extensions required for Guardian architecture
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Fuzzy string matching for relationship normalization
CREATE EXTENSION IF NOT EXISTS "postgis";        -- Spatial data for bounding box operations
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- Enhanced cryptographic functions
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- Enhanced GIN indexing capabilities
```

---

## 2. Multi-Profile Management System

### 2.1. Profile Management Tables

*Support for dependent profiles (children, pets, etc.) under primary user accounts with granular access control*

```sql
-- Primary table for all profiles (including main user profile)
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_owner_id UUID NOT NULL REFERENCES auth.users(id), -- The primary account holder
    
    -- Profile Identity
    profile_type TEXT NOT NULL CHECK (profile_type IN ('self', 'child', 'pet', 'dependent')),
    profile_status TEXT NOT NULL DEFAULT 'active' CHECK (profile_status IN ('active', 'inactive', 'pending_transfer')),
    
    -- Profile Details
    display_name TEXT NOT NULL,
    full_name TEXT,
    date_of_birth DATE,
    species TEXT, -- For pets: 'dog', 'cat', 'bird', etc.
    breed TEXT, -- For pets
    
    -- Relationship to Account Owner
    relationship TEXT, -- 'self', 'daughter', 'son', 'mother', 'father', 'dog', 'cat', etc.
    legal_status TEXT CHECK (legal_status IN ('guardian', 'parent', 'caregiver', 'self', 'owner')),
    
    -- Profile Customization
    theme_color TEXT DEFAULT '#2563eb',
    avatar_url TEXT,
    custom_theme JSONB DEFAULT '{}', -- Extended theme customization
    profile_icon TEXT, -- Icon identifier for quick visual recognition
    
    -- Authentication Level
    auth_level TEXT NOT NULL DEFAULT 'soft' CHECK (auth_level IN ('none', 'soft', 'hard')),
    auth_verified_at TIMESTAMPTZ,
    auth_method TEXT, -- 'document_extraction', 'manual_entry', 'id_verification', 'bank_verification'
    
    -- Profile Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transferred_from UUID REFERENCES user_profiles(id), -- For profile transfers
    transferred_to UUID REFERENCES user_profiles(id),
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Pregnancy Feature Support
    is_pregnancy_profile BOOLEAN DEFAULT FALSE,
    expected_due_date DATE,
    transitioned_to_child_profile_id UUID REFERENCES user_profiles(id)
);

-- Profile access permissions
CREATE TABLE profile_access_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Permission Levels
    permission_level TEXT NOT NULL CHECK (permission_level IN ('owner', 'full_access', 'read_write', 'read_only', 'emergency')),
    
    -- Granular Permissions
    can_upload_documents BOOLEAN NOT NULL DEFAULT FALSE,
    can_view_documents BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit_medical_data BOOLEAN NOT NULL DEFAULT FALSE,
    can_share_data BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_permissions BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Time-based Access
    access_start_date TIMESTAMPTZ DEFAULT NOW(),
    access_end_date TIMESTAMPTZ,
    
    -- Audit
    granted_by UUID REFERENCES auth.users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT
);

-- Profile switching context
CREATE TABLE user_profile_context (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id),
    current_profile_id UUID NOT NULL REFERENCES user_profiles(id),
    last_switched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Quick access profiles (recently used)
    recent_profile_ids UUID[] DEFAULT '{}',
    pinned_profile_ids UUID[] DEFAULT '{}', -- User's favorite profiles for quick access
    
    -- Preferences
    auto_detect_profile_from_uploads BOOLEAN DEFAULT TRUE,
    prompt_threshold NUMERIC(3,2) DEFAULT 0.8 -- Confidence threshold for auto-switching
);

-- Essential indexes for profile management
CREATE INDEX idx_user_profiles_owner ON user_profiles(account_owner_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_user_profiles_type ON user_profiles(profile_type) WHERE archived IS NOT TRUE;
CREATE INDEX idx_profile_access_user ON profile_access_permissions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_profile_access_profile ON profile_access_permissions(profile_id) WHERE revoked_at IS NULL;
```

### 2.2. Smart Health Features Detection

*Context-aware UI features that automatically activate based on detected health data*

```sql
-- Feature detection table for smart tabs (family planning, pregnancy, etc.)
CREATE TABLE smart_health_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    feature_type TEXT NOT NULL CHECK (feature_type IN ('family_planning', 'pregnancy', 'chronic_condition', 'mental_health', 'pediatric')),
    
    -- Activation triggers
    activated_by_event_id UUID REFERENCES patient_clinical_events(id),
    activation_confidence NUMERIC(3,2) NOT NULL,
    activation_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Feature state
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE, -- User can hide tabs
    last_relevant_event TIMESTAMPTZ,
    
    -- Feature-specific data
    feature_data JSONB DEFAULT '{}',
    
    -- For pregnancy specifically
    pregnancy_stage TEXT CHECK (pregnancy_stage IN ('planning', 'trying', 'pregnant', 'postpartum', 'completed')),
    estimated_conception_date DATE,
    estimated_due_date DATE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint: one feature type per profile
    UNIQUE(profile_id, feature_type)
);

-- Pregnancy-specific timeline events
CREATE TABLE pregnancy_journey_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    smart_feature_id UUID REFERENCES smart_health_features(id),
    
    -- Event categorization
    event_category TEXT NOT NULL CHECK (event_category IN (
        'fertility_test', 'ovulation_tracking', 'conception_attempt',
        'pregnancy_test', 'prenatal_visit', 'ultrasound', 'genetic_screening',
        'labor_delivery', 'postpartum_checkup', 'milestone'
    )),
    
    -- Event details
    event_date TIMESTAMPTZ NOT NULL,
    event_title TEXT NOT NULL,
    event_data JSONB DEFAULT '{}',
    
    -- Links to source data
    clinical_event_id UUID REFERENCES patient_clinical_events(id),
    document_id UUID REFERENCES documents(id),
    
    -- Pregnancy-specific metrics
    gestational_week INTEGER,
    baby_measurements JSONB, -- weight, length, head circumference
    maternal_metrics JSONB, -- weight, blood pressure, etc.
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profile contamination prevention
CREATE TABLE profile_verification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_type TEXT NOT NULL CHECK (rule_type IN ('demographic', 'clinical', 'logical', 'temporal')),
    rule_name TEXT NOT NULL,
    rule_definition JSONB NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
    is_active BOOLEAN DEFAULT TRUE
);

-- Sample contamination prevention rules
INSERT INTO profile_verification_rules (rule_type, rule_name, rule_definition, severity) VALUES
('demographic', 'name_mismatch', '{"check": "name_similarity", "threshold": 0.7}', 'warning'),
('clinical', 'gender_condition_mismatch', '{"incompatible_pairs": {"male": ["pregnancy", "hysterectomy"], "female": ["prostate_cancer"]}}', 'critical'),
('clinical', 'age_condition_mismatch', '{"age_restrictions": {"COPD": {"min_age": 40}, "alzheimers": {"min_age": 60}}}', 'warning'),
('temporal', 'future_date_check', '{"max_future_days": 30}', 'warning');

-- Indexes for smart features
CREATE INDEX idx_smart_features_profile ON smart_health_features(profile_id) WHERE is_active = TRUE;
CREATE INDEX idx_smart_features_type ON smart_health_features(feature_type) WHERE is_active = TRUE;
CREATE INDEX idx_pregnancy_events_profile ON pregnancy_journey_events(profile_id);
CREATE INDEX idx_pregnancy_events_date ON pregnancy_journey_events(profile_id, event_date DESC);
```

---

## 3. Unified Clinical Events Architecture

*Based on O3's two-axis classification model: **Activity Type** (observation/intervention) × **Clinical Purpose** (screening/diagnostic/therapeutic/monitoring/preventive)*

### 2.1. Core Clinical Events System

#### Central Events Table - Everything is an Event
```sql
CREATE TABLE patient_clinical_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    profile_id UUID REFERENCES user_profiles(id), -- Multi-profile support
    encounter_id UUID REFERENCES healthcare_encounters(id),
    
    -- O3's Two-Axis Classification System
    activity_type TEXT NOT NULL CHECK (activity_type IN ('observation', 'intervention')),
    clinical_purposes TEXT[] NOT NULL, -- Multi-purpose support: ['screening', 'diagnostic']
    
    -- Event Details
    event_name TEXT NOT NULL, -- "Blood Pressure Measurement", "Wart Cryotherapy", "HIV Test"
    method TEXT, -- 'physical_exam', 'laboratory', 'imaging', 'injection', 'surgery', 'assessment_tool'
    body_site TEXT, -- 'left_ear', 'chest', 'left_hand', 'brain'
    
    -- Placeholder: standard code fields below will be populated by a future automated coding subsystem
    
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
```

### 2.2. Observation Details (Information Gathering)

```sql
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
```

### 2.3. Intervention Details (Actions Performed)

```sql
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
```

### 2.4. Healthcare Encounters (Visit Context)

```sql
CREATE TABLE healthcare_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    profile_id UUID REFERENCES user_profiles(id), -- Multi-profile support
    
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
```

### 2.5. Imaging Reports (New Clinical Data Type)

```sql
CREATE TABLE patient_imaging_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    profile_id UUID REFERENCES user_profiles(id), -- Multi-profile support
    
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
```

### 2.6. Backward Compatibility Views

*Maintains existing API compatibility while leveraging unified clinical events architecture*

```sql
-- Patient Medications View (from clinical events + interventions)
CREATE MATERIALIZED VIEW patient_medications AS
SELECT 
    pi.id,
    pce.patient_id,
    pce.event_name as medication_name,
    pi.substance_name as generic_name,
    CONCAT(pi.dose_amount, ' ', pi.dose_unit) as dosage,
    'active' as status, -- Derived from event recency and context
    pce.event_date as start_date,
    pce.performed_by as prescribed_by,
    pce.confidence_score,
    pce.requires_review,
    CONCAT(pi.substance_name, ' ', pi.dose_amount, ' ', pi.dose_unit) as raw_value,
    pce.archived,
    pce.created_at,
    pce.updated_at,
    pce.reviewed_by,
    pce.reviewed_at
FROM patient_clinical_events pce
JOIN patient_interventions pi ON pi.event_id = pce.id
WHERE pce.activity_type = 'intervention'
AND pi.intervention_type = 'medication_admin'
AND pce.archived IS NOT TRUE;

-- Patient Vitals View (from clinical events + observations)
CREATE MATERIALIZED VIEW patient_vitals AS
SELECT 
    po.id,
    pce.patient_id,
    pce.event_name as measurement_type,
    po.value_numeric,
    po.value_text,
    po.unit as units,
    DATE(pce.event_date) as measurement_date,
    EXTRACT(TIME FROM pce.event_date) as measurement_time,
    pce.performed_by as measured_by,
    pce.method as measurement_method,
    pce.confidence_score,
    pce.requires_review,
    po.value_text as raw_value,
    pce.archived,
    pce.created_at,
    pce.updated_at,
    pce.reviewed_by,
    pce.reviewed_at
FROM patient_clinical_events pce
JOIN patient_observations po ON po.event_id = pce.id
WHERE pce.activity_type = 'observation'
AND po.observation_type = 'vital_sign'
AND pce.archived IS NOT TRUE;

-- Patient Lab Results View (from clinical events + observations)
CREATE MATERIALIZED VIEW patient_lab_results AS
SELECT 
    po.id,
    pce.patient_id,
    pce.event_name as test_name,
    pce.loinc_code as test_code,
    po.value_text as result_value,
    po.value_numeric as result_numeric,
    po.reference_range_text as reference_range,
    po.unit as units,
    CASE po.interpretation 
        WHEN 'high' THEN 'high'
        WHEN 'low' THEN 'low' 
        WHEN 'critical' THEN 'critical_high'
        ELSE 'normal' 
    END as abnormal_flag,
    DATE(pce.event_date) as test_date,
    pce.performed_by as ordered_by,
    pce.encounter_id as healthcare_encounter_id,
    pce.confidence_score,
    pce.requires_review,
    po.value_text as raw_value,
    pce.archived,
    pce.created_at,
    pce.updated_at,
    pce.reviewed_by,
    pce.reviewed_at
FROM patient_clinical_events pce
JOIN patient_observations po ON po.event_id = pce.id
WHERE pce.activity_type = 'observation'
AND po.observation_type = 'lab_result'
AND pce.archived IS NOT TRUE;

-- Create unique indexes for materialized views
CREATE UNIQUE INDEX idx_patient_medications_mv_id ON patient_medications(id);
CREATE UNIQUE INDEX idx_patient_vitals_mv_id ON patient_vitals(id);
CREATE UNIQUE INDEX idx_patient_lab_results_mv_id ON patient_lab_results(id);

-- Auto-refresh materialized views when clinical events change
CREATE OR REPLACE FUNCTION refresh_clinical_compatibility_views()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY patient_medications;
    REFRESH MATERIALIZED VIEW CONCURRENTLY patient_vitals;
    REFRESH MATERIALIZED VIEW CONCURRENTLY patient_lab_results;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refresh_clinical_views_trigger
    AFTER INSERT OR UPDATE OR DELETE ON patient_clinical_events
    FOR EACH STATEMENT EXECUTE FUNCTION refresh_clinical_compatibility_views();
```

### 2.7. Traditional Clinical Record Tables

*Certain clinical data types remain as dedicated tables due to their unique data patterns and lifecycle requirements*

#### Patient Conditions (Diagnoses and Health Issues)
```sql
CREATE TABLE patient_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    profile_id UUID REFERENCES user_profiles(id), -- Multi-profile support
    
    -- Core condition data
    condition_name TEXT NOT NULL,
    icd_10_code TEXT,
    category TEXT,
    severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe', 'critical')),
    
    -- Status and lifecycle
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'resolved', 'chronic')),
    diagnosis_date DATE,
    resolved_date DATE,
    diagnosed_by TEXT,
    
    -- Link to clinical events (when condition discovered via observation)
    discovery_event_id UUID REFERENCES patient_clinical_events(id),
    encounter_id UUID REFERENCES healthcare_encounters(id),
    
    -- Quality control
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    review_reason TEXT,
    
    -- Normalization and original data
    raw_value TEXT,
    
    -- Audit and soft delete
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_reason TEXT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- User tracking
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ
);

-- Essential indexes
CREATE INDEX idx_patient_conditions_patient ON patient_conditions(patient_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_conditions_status ON patient_conditions(status) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_conditions_discovery_event ON patient_conditions(discovery_event_id) WHERE discovery_event_id IS NOT NULL;
CREATE INDEX idx_patient_conditions_review ON patient_conditions(requires_review) WHERE requires_review = TRUE AND archived IS NOT TRUE;
```

#### Patient Allergies (Adverse Reactions)
```sql
CREATE TABLE patient_allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    profile_id UUID REFERENCES user_profiles(id), -- Multi-profile support
    
    -- Core allergy data
    allergen TEXT NOT NULL,
    allergy_type TEXT CHECK (allergy_type IN ('drug', 'food', 'environmental', 'other')),
    reaction TEXT,
    severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe', 'life_threatening')),
    
    -- Status and lifecycle
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'resolved')),
    onset_date DATE,
    identified_by TEXT,
    
    -- Link to clinical events (when allergy discovered)
    discovery_event_id UUID REFERENCES patient_clinical_events(id),
    encounter_id UUID REFERENCES healthcare_encounters(id),
    
    -- Quality control
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    review_reason TEXT,
    
    -- Normalization and original data
    raw_value TEXT,
    
    -- Audit and soft delete
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_reason TEXT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- User tracking
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ
);

-- Essential indexes
CREATE INDEX idx_patient_allergies_patient ON patient_allergies(patient_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_allergies_severity ON patient_allergies(severity) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_allergies_discovery_event ON patient_allergies(discovery_event_id) WHERE discovery_event_id IS NOT NULL;
CREATE INDEX idx_patient_allergies_review ON patient_allergies(requires_review) WHERE requires_review = TRUE AND archived IS NOT TRUE;
```

---

## 3. Enhanced Provenance Layer

### 3.1. Clinical Fact Sources (Updated for Unified Events)

*Links all clinical data back to source documents with spatial precision for click-to-zoom functionality*

```sql
CREATE TABLE clinical_fact_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fact_table TEXT NOT NULL, -- 'patient_clinical_events', 'patient_conditions', 'patient_allergies', 'patient_imaging_reports'
    fact_id UUID NOT NULL,
    document_id UUID NOT NULL REFERENCES documents(id),
    representation_id UUID REFERENCES document_representations(id),
    
    -- Geographic precision for click-to-zoom functionality
    page_number INTEGER,
    bounding_box GEOMETRY(POLYGON, 4326), -- PostGIS spatial indexing for precise document regions
    source_text TEXT, -- Original extracted text that led to this clinical fact
    
    -- Extraction methodology and quality
    extraction_method TEXT NOT NULL CHECK (extraction_method IN ('ai_vision', 'ocr', 'manual', 'api_import')),
    extraction_model_version TEXT, -- Track AI model versions for confidence recalibration
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    
    -- Clinical event specific context (for unified events system)
    clinical_event_type TEXT, -- 'observation', 'intervention', 'encounter'
    extraction_context JSONB, -- Additional metadata about extraction context
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Allow multiple sources per fact - same clinical fact can appear across multiple documents/pages
    UNIQUE(fact_table, fact_id, document_id, page_number, md5(ST_AsText(bounding_box)))
);

-- Spatial and performance indexes
CREATE INDEX idx_clinical_fact_sources_spatial ON clinical_fact_sources USING GIST(bounding_box);
CREATE INDEX idx_clinical_fact_sources_document ON clinical_fact_sources(document_id);
CREATE INDEX idx_clinical_fact_sources_fact ON clinical_fact_sources(fact_table, fact_id);
CREATE INDEX idx_clinical_fact_sources_method ON clinical_fact_sources(extraction_method);
CREATE INDEX idx_clinical_fact_sources_clinical_event_type ON clinical_fact_sources(clinical_event_type) WHERE clinical_event_type IS NOT NULL;

-- Full-text search on source text for document exploration
CREATE INDEX idx_clinical_fact_sources_text_search ON clinical_fact_sources USING GIN(to_tsvector('english', source_text));
```

---

## 4. Controlled Vocabularies

### 4.1. Relationship Types

```sql
CREATE TABLE relationship_types (
    type TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('treatment', 'causation', 'temporal', 'monitoring', 'safety', 'diagnostic')),
    description TEXT NOT NULL,
    valid_source_tables TEXT[] NOT NULL,
    valid_target_tables TEXT[] NOT NULL,
    is_bidirectional BOOLEAN NOT NULL DEFAULT false,
    confidence_threshold NUMERIC(3,2) DEFAULT 0.7,
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Evolution tracking
    superseded_by TEXT REFERENCES relationship_types(type),
    deprecated_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Core relationship vocabulary
INSERT INTO relationship_types (type, category, description, valid_source_tables, valid_target_tables, is_bidirectional) VALUES
('treats', 'treatment', 'Medication treats condition', '{"patient_medications"}', '{"patient_conditions"}', false),
('monitors', 'monitoring', 'Lab test monitors condition or medication', '{"patient_lab_results"}', '{"patient_conditions", "patient_medications"}', false),
('caused_by', 'causation', 'Condition caused by medication (side effect)', '{"patient_conditions"}', '{"patient_medications"}', false),
('contraindicates', 'safety', 'Allergy contraindicates medication', '{"patient_allergies"}', '{"patient_medications"}', false),
('indicates', 'diagnostic', 'Condition indicates need for lab test', '{"patient_conditions"}', '{"patient_lab_results"}', false),
('temporal_sequence', 'temporal', 'Events occurred in sequence', '{"patient_conditions", "patient_medications", "patient_lab_results"}', '{"patient_conditions", "patient_medications", "patient_lab_results"}', false),
('related_to', 'temporal', 'Generic relationship - catch-all for uncertain cases', '{"patient_medications", "patient_conditions", "patient_lab_results", "patient_allergies", "patient_vitals"}', '{"patient_medications", "patient_conditions", "patient_lab_results", "patient_allergies", "patient_vitals"}', true);
```

### 4.2. Status Types

```sql
-- Medication status types
CREATE TABLE medication_status_types (
    status TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    is_active_status BOOLEAN NOT NULL,
    display_order INTEGER NOT NULL,
    
    -- Evolution support
    superseded_by TEXT REFERENCES medication_status_types(status),
    deprecated_at TIMESTAMPTZ
);

-- Condition status types
CREATE TABLE condition_status_types (
    status TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    is_active_status BOOLEAN NOT NULL,
    display_order INTEGER NOT NULL,
    
    -- Evolution support  
    superseded_by TEXT REFERENCES condition_status_types(status),
    deprecated_at TIMESTAMPTZ
);

-- Vocabulary evolution function
CREATE OR REPLACE FUNCTION evolve_vocabulary_term(
    table_name TEXT,
    old_term TEXT,
    new_term TEXT,
    reason TEXT DEFAULT 'Term evolution'
) RETURNS VOID AS $$
BEGIN
    EXECUTE format('UPDATE %I SET superseded_by = $1, deprecated_at = NOW() WHERE status = $2', table_name)
    USING new_term, old_term;
    
    RAISE NOTICE 'Vocabulary term evolved: % -> % (Reason: %)', old_term, new_term, reason;
END;
$$ LANGUAGE plpgsql;
```

---

## 5. Medical Data Relationships

### 5.1. Core Relationship Table

```sql
CREATE TABLE medical_data_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source and target (polymorphic with validation)
    source_table TEXT NOT NULL,
    source_id UUID NOT NULL,
    target_table TEXT NOT NULL,
    target_id UUID NOT NULL,
    
    -- Relationship definition
    relationship_type TEXT NOT NULL REFERENCES relationship_types(type) ON UPDATE CASCADE,
    relationship_strength NUMERIC(4,3) CHECK (relationship_strength BETWEEN 0 AND 1),
    relationship_direction TEXT DEFAULT 'bidirectional' CHECK (relationship_direction IN ('source_to_target', 'target_to_source', 'bidirectional')),
    
    -- Context and reasoning
    rationale TEXT,
    clinical_context TEXT,
    
    -- Soft delete pattern
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_reason TEXT,
    archived_at TIMESTAMPTZ,
    
    -- Quality control
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    original_ai_relationship TEXT,
    normalization_notes TEXT,
    
    -- Audit
    created_by TEXT NOT NULL DEFAULT 'ai_extraction',
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate relationships
    UNIQUE(source_table, source_id, target_table, target_id, relationship_type)
);

-- Essential indexes
CREATE INDEX idx_medical_relationships_source 
ON medical_data_relationships(source_table, source_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_medical_relationships_target 
ON medical_data_relationships(target_table, target_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_medical_relationships_type 
ON medical_data_relationships(relationship_type) WHERE archived IS NOT TRUE;
CREATE INDEX idx_medical_relationships_requires_review 
ON medical_data_relationships(requires_review) WHERE requires_review = TRUE AND archived IS NOT TRUE;
```

### 5.2. Polymorphic Validation

```sql
-- Relationship validation function
CREATE OR REPLACE FUNCTION validate_relationship_references()
RETURNS TRIGGER AS $$
DECLARE
    source_exists BOOLEAN;
    target_exists BOOLEAN;
BEGIN
    -- Skip validation during bulk operations (session-based control)
    IF current_setting('app.bulk_relationship_mode', true) = 'on' THEN
        RETURN NEW;
    END IF;
    
    -- Validate source reference exists and is not archived
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE id = $1 AND archived IS NOT TRUE)', NEW.source_table)
    INTO source_exists USING NEW.source_id;
    
    IF NOT source_exists THEN
        RAISE EXCEPTION 'Source record % does not exist in table %', NEW.source_id, NEW.source_table;
    END IF;
    
    -- Validate target reference exists and is not archived  
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE id = $1 AND archived IS NOT TRUE)', NEW.target_table)
    INTO target_exists USING NEW.target_id;
    
    IF NOT target_exists THEN
        RAISE EXCEPTION 'Target record % does not exist in table %', NEW.target_id, NEW.target_table;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_relationship_references_trigger
    BEFORE INSERT OR UPDATE ON medical_data_relationships
    FOR EACH ROW EXECUTE FUNCTION validate_relationship_references();
```

---

## 6. Row Level Security (RLS)

### 6.1. Profile-Aware Security Functions

```sql
-- Enhanced RLS function that checks both direct user access and profile permissions
CREATE OR REPLACE FUNCTION can_access_profile_data(
    p_profile_id UUID,
    p_required_permission TEXT DEFAULT 'read_only'
) RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_has_access BOOLEAN := FALSE;
BEGIN
    -- Check if user owns the profile or has permissions
    SELECT EXISTS(
        SELECT 1 
        FROM user_profiles up
        LEFT JOIN profile_access_permissions pap ON pap.profile_id = up.id
        WHERE up.id = p_profile_id
        AND (
            -- User owns the account
            up.account_owner_id = v_user_id
            OR
            -- User has explicit permissions
            (
                pap.user_id = v_user_id 
                AND pap.revoked_at IS NULL
                AND (pap.access_end_date IS NULL OR pap.access_end_date > NOW())
                AND (
                    pap.permission_level = 'owner'
                    OR (p_required_permission = 'read_only' AND pap.can_view_documents = TRUE)
                    OR (p_required_permission = 'read_write' AND pap.can_edit_medical_data = TRUE)
                    OR (p_required_permission = 'upload' AND pap.can_upload_documents = TRUE)
                )
            )
        )
    ) INTO v_has_access;
    
    RETURN v_has_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Secure relationship access control function (updated for profiles)
CREATE OR REPLACE FUNCTION can_access_relationship(
    source_table TEXT, 
    source_id UUID, 
    target_table TEXT, 
    target_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    source_patient_id UUID;
    target_patient_id UUID;
    source_profile_id UUID;
    target_profile_id UUID;
    user_id UUID := auth.uid();
BEGIN
    -- Handle different table structures for patient_id and profile_id extraction
    CASE source_table
        WHEN 'patient_medications', 'patient_conditions', 'patient_allergies', 
             'patient_lab_results', 'patient_vitals', 'patient_clinical_events',
             'patient_imaging_reports' THEN
            EXECUTE format('SELECT patient_id, profile_id FROM %I WHERE id = $1 AND archived IS NOT TRUE', source_table)
            INTO source_patient_id, source_profile_id USING source_id;
        WHEN 'documents' THEN
            EXECUTE format('SELECT user_id, profile_id FROM %I WHERE id = $1 AND archived IS NOT TRUE', source_table)
            INTO source_patient_id, source_profile_id USING source_id;
        ELSE
            RETURN FALSE; -- Unknown table type
    END CASE;
    
    CASE target_table
        WHEN 'patient_medications', 'patient_conditions', 'patient_allergies', 
             'patient_lab_results', 'patient_vitals', 'patient_clinical_events',
             'patient_imaging_reports' THEN
            EXECUTE format('SELECT patient_id, profile_id FROM %I WHERE id = $1 AND archived IS NOT TRUE', target_table)
            INTO target_patient_id, target_profile_id USING target_id;
        WHEN 'documents' THEN
            EXECUTE format('SELECT user_id, profile_id FROM %I WHERE id = $1 AND archived IS NOT TRUE', target_table)
            INTO target_patient_id, target_profile_id USING target_id;
        ELSE
            RETURN FALSE; -- Unknown table type
    END CASE;
    
    -- User can access relationship if:
    -- 1. They own either the source or target record directly, OR
    -- 2. They have profile access to either the source or target profile
    RETURN (
        (source_patient_id = user_id OR target_patient_id = user_id)
        OR
        (source_profile_id IS NOT NULL AND can_access_profile_data(source_profile_id))
        OR
        (target_profile_id IS NOT NULL AND can_access_profile_data(target_profile_id))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 6.2. RLS Policies

```sql
-- Enable RLS on all tables including new profile tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_access_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profile_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_health_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE pregnancy_journey_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_clinical_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_imaging_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE healthcare_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_data_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_fact_sources ENABLE ROW LEVEL SECURITY;

-- Profile management policies
CREATE POLICY user_profiles_owner_access ON user_profiles
    FOR ALL USING (account_owner_id = auth.uid() AND archived IS NOT TRUE);

CREATE POLICY profile_access_permissions_owner ON profile_access_permissions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles up 
            WHERE up.id = profile_access_permissions.profile_id 
            AND up.account_owner_id = auth.uid()
        )
        OR user_id = auth.uid()
    );

CREATE POLICY user_profile_context_owner ON user_profile_context
    FOR ALL USING (user_id = auth.uid());

-- Smart health features policies
CREATE POLICY smart_health_features_profile_access ON smart_health_features
    FOR ALL USING (can_access_profile_data(profile_id, 'read_only'));

CREATE POLICY pregnancy_journey_events_profile_access ON pregnancy_journey_events
    FOR ALL USING (can_access_profile_data(profile_id, 'read_only'));

-- Profile-aware clinical data policies
CREATE POLICY patient_clinical_events_profile_isolation ON patient_clinical_events
    FOR ALL USING (
        archived IS NOT TRUE 
        AND (
            -- Legacy: direct patient access
            (profile_id IS NULL AND auth.uid() = patient_id)
            OR
            -- New: profile-based access
            (profile_id IS NOT NULL AND can_access_profile_data(profile_id, 'read_only'))
        )
    );

CREATE POLICY patient_conditions_profile_isolation ON patient_conditions
    FOR ALL USING (
        archived IS NOT TRUE 
        AND (
            (profile_id IS NULL AND auth.uid() = patient_id)
            OR
            (profile_id IS NOT NULL AND can_access_profile_data(profile_id, 'read_only'))
        )
    );

CREATE POLICY patient_allergies_profile_isolation ON patient_allergies
    FOR ALL USING (
        archived IS NOT TRUE 
        AND (
            (profile_id IS NULL AND auth.uid() = patient_id)
            OR
            (profile_id IS NOT NULL AND can_access_profile_data(profile_id, 'read_only'))
        )
    );

CREATE POLICY patient_imaging_reports_profile_isolation ON patient_imaging_reports
    FOR ALL USING (
        archived IS NOT TRUE 
        AND (
            (profile_id IS NULL AND auth.uid() = patient_id)
            OR
            (profile_id IS NOT NULL AND can_access_profile_data(profile_id, 'read_only'))
        )
    );

CREATE POLICY healthcare_encounters_profile_isolation ON healthcare_encounters
    FOR ALL USING (
        archived IS NOT TRUE 
        AND (
            (profile_id IS NULL AND auth.uid() = patient_id)
            OR
            (profile_id IS NOT NULL AND can_access_profile_data(profile_id, 'read_only'))
        )
    );

-- Maintain existing materialized view policies
CREATE POLICY patient_medications_user_isolation ON patient_medications
    FOR ALL USING (auth.uid() = patient_id AND archived IS NOT TRUE);

CREATE POLICY patient_lab_results_user_isolation ON patient_lab_results
    FOR ALL USING (auth.uid() = patient_id AND archived IS NOT TRUE);

CREATE POLICY patient_vitals_user_isolation ON patient_vitals
    FOR ALL USING (auth.uid() = patient_id AND archived IS NOT TRUE);

-- Secure relationship access control (updated for profiles)
CREATE POLICY medical_relationships_secure_isolation ON medical_data_relationships
    FOR ALL USING (
        archived IS NOT TRUE 
        AND can_access_relationship(source_table, source_id, target_table, target_id)
    );

-- Provenance data access (tied to document ownership and profile access)
CREATE POLICY clinical_fact_sources_profile_isolation ON clinical_fact_sources
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM documents d 
            WHERE d.id = clinical_fact_sources.document_id 
            AND (
                d.user_id = auth.uid() 
                OR (d.profile_id IS NOT NULL AND can_access_profile_data(d.profile_id, 'read_only'))
            )
            AND d.archived IS NOT TRUE
        )
    );
```

---

## 7. Essential Constraints and Triggers

### 7.1. Updated At Triggers

```sql
-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all clinical tables
CREATE TRIGGER update_patient_medications_updated_at
    BEFORE UPDATE ON patient_medications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_conditions_updated_at
    BEFORE UPDATE ON patient_conditions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_allergies_updated_at
    BEFORE UPDATE ON patient_allergies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_lab_results_updated_at
    BEFORE UPDATE ON patient_lab_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_vitals_updated_at
    BEFORE UPDATE ON patient_vitals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 7.2. Session-Based Bulk Operation Control

```sql
-- Bulk operation helper functions
CREATE OR REPLACE FUNCTION enable_bulk_relationship_mode() RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.bulk_relationship_mode', 'on', false);
    RAISE NOTICE 'Bulk relationship mode enabled - validation triggers bypassed';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION disable_bulk_relationship_mode() RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.bulk_relationship_mode', 'off', false);
    RAISE NOTICE 'Bulk relationship mode disabled';
END;
$$ LANGUAGE plpgsql;
```

---

## 8. Core Schema Summary

This unified core schema provides the essential foundation for Guardian's healthcare data management using O3's two-axis classification model:

**Multi-Profile Management System:**
- `user_profiles` - Primary account with dependent profiles (children, pets, etc.)
- `profile_access_permissions` - Granular access control with time-based restrictions
- `user_profile_context` - Profile switching and context management
- `smart_health_features` - Auto-activating UI features based on health data detection
- `pregnancy_journey_events` - Specialized pregnancy and family planning tracking

**Unified Clinical Events Architecture:**
- `patient_clinical_events` - Central events table using activity_type (observation/intervention) × clinical_purposes classification (now profile-aware)
- `patient_observations` - Detailed observation results (lab results, vital signs, assessments, physical findings)
- `patient_interventions` - Detailed intervention records (medications, procedures, vaccinations, treatments)
- `healthcare_encounters` - Healthcare visit context and provider information (profile-aware)
- `patient_imaging_reports` - Imaging studies and radiological findings (profile-aware)

**Traditional Clinical Records:**
- `patient_conditions` - Medical diagnoses and health conditions with ICD-10 codes (profile-aware)
- `patient_allergies` - Allergy information with reaction severity and clinical context (profile-aware)

**Backward Compatibility:**
- `patient_medications` (materialized view) - Maintains existing medication API compatibility
- `patient_lab_results` (materialized view) - Maintains existing lab results API compatibility  
- `patient_vitals` (materialized view) - Maintains existing vitals API compatibility

**Relationship System:**
- `medical_data_relationships` - Polymorphic relationships between all clinical entities (profile-aware)
- `relationship_types` - Controlled vocabulary for relationship definitions

**Enhanced Provenance Tracking:**
- `clinical_fact_sources` - Links all clinical data to source documents with PostGIS spatial precision (profile-aware)
- Support for unified clinical events system with extraction context

**Profile Security & Data Integrity:**
- `profile_verification_rules` - Automated contamination prevention system
- Profile-aware Row Level Security (RLS) with granular permissions
- Progressive authentication system (soft → hard authentication)
- Cross-profile access control and audit trails

**Key Architectural Benefits:**
- **Multi-Profile Architecture**: Complete support for dependent profiles (children, pets) with seamless data management
- **Smart Feature Detection**: Context-aware UI features that auto-activate based on health data (family planning, pregnancy)
- **Progressive Authentication**: Frictionless onboarding with soft → hard authentication progression
- **Profile Contamination Prevention**: AI-powered data integrity protection across profiles
- **O3's Two-Axis Model**: Clear separation of observations vs interventions with flexible clinical purposes
- **Healthcare Standards**: SNOMED-CT, LOINC, and CPT code integration throughout
- **Spatial Provenance**: PostGIS-powered click-to-zoom document regions for all clinical facts
- **Quality Control**: AI confidence scoring and human review workflows for all extracted data
- **Backward Compatibility**: Existing APIs continue working through materialized views
- **Performance Optimized**: Strategic indexing for timeline queries, filtering, and clinical event access patterns

This schema serves as the foundation for Guardian's comprehensive healthcare data platform, designed from the ground up to support single users through complex family health management while maintaining the clinical rigor, security, and scalability required for healthcare applications. All multi-profile features are integrated from initial deployment with no migration requirements.

---

## 9. Future Provider Portal Integration Points

The v7 core schema is designed with extensibility for future provider portal integration. Key architectural decisions that support this:

### 9.1. Provider-Ready Clinical Events
The `patient_clinical_events` table includes fields that support provider integration:
- `performed_by` field can reference provider information
- `clinical_purposes` array supports provider-driven clinical decision support
- Audit framework tracks all provider interactions

### 9.2. Healthcare Encounters Extension Points
The `healthcare_encounters` table is designed to accommodate:
- Provider authentication and verification
- Clinical decision support workflows
- Inter-provider referral tracking
- Provider-patient access control

### 9.3. Extensible Audit System
The existing audit framework in `audit_log` supports:
- Provider access logging
- Patient-provider consent tracking
- Clinical decision audit trails
- Provider data contribution tracking

### 9.4. Future Provider Tables (v7.1 Planned)
The schema is designed to accommodate these future additions:
- `provider_registry` - Universal provider identification system
- `patient_provider_access` - Granular access control
- `provider_action_items` - Clinical decision support tasks
- `registered_doctors_au` - AHPRA registry integration

**Design Philosophy**: The v7 core schema provides the foundation for a true healthcare platform that connects patients and providers while maintaining patient control and data sovereignty. All provider functionality will build upon these existing clinical events and audit systems rather than creating parallel structures.

**Reference**: See [`Doctor_portal_architecture_analysis.md`](./Doctor_portal_architecture_analysis.md) for comprehensive provider portal planning.