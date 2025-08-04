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
-- PERFORMANCE FIX: Replace synchronous materialized view refresh with debounced queue system
-- The original trigger caused 10-100x performance degradation by refreshing views on every change

CREATE TABLE materialized_view_refresh_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    view_name TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    priority INTEGER DEFAULT 100 -- Lower = higher priority
);

CREATE INDEX idx_mv_refresh_queue_pending ON materialized_view_refresh_queue(requested_at) 
WHERE processed_at IS NULL;

-- P1.1 FIX: Properly queue materialized view refreshes with correct deduplication
CREATE OR REPLACE FUNCTION queue_clinical_view_refresh()
RETURNS TRIGGER AS $$
BEGIN
    -- Use INSERT ... ON CONFLICT for true deduplication
    -- Only insert if view is not already pending
    INSERT INTO materialized_view_refresh_queue (view_name, priority)
    SELECT view_name, priority FROM (
        VALUES 
            ('patient_medications', 50),
            ('patient_vitals', 60), 
            ('patient_lab_results', 70),
            ('relationship_access_cache', 40) -- High priority for security
    ) AS views(view_name, priority)
    WHERE NOT EXISTS (
        SELECT 1 FROM materialized_view_refresh_queue q
        WHERE q.view_name = views.view_name 
        AND q.processed_at IS NULL
    );
    
    -- Note: This ensures max 1 pending request per view type
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- P1.2 FIX: Add refresh triggers for ALL tables that feed into relationship_access_cache
-- This fixes the critical security issue where stale permissions could occur

CREATE TRIGGER queue_clinical_views_trigger
    AFTER INSERT OR UPDATE OR DELETE ON patient_clinical_events
    FOR EACH STATEMENT EXECUTE FUNCTION queue_clinical_view_refresh();

-- Additional triggers for all tables in relationship_access_cache
CREATE TRIGGER queue_medication_cache_refresh_trigger
    AFTER INSERT OR UPDATE OR DELETE ON patient_medications
    FOR EACH STATEMENT EXECUTE FUNCTION queue_clinical_view_refresh();

CREATE TRIGGER queue_conditions_cache_refresh_trigger
    AFTER INSERT OR UPDATE OR DELETE ON patient_conditions
    FOR EACH STATEMENT EXECUTE FUNCTION queue_clinical_view_refresh();

CREATE TRIGGER queue_allergies_cache_refresh_trigger
    AFTER INSERT OR UPDATE OR DELETE ON patient_allergies
    FOR EACH STATEMENT EXECUTE FUNCTION queue_clinical_view_refresh();

CREATE TRIGGER queue_lab_results_cache_refresh_trigger
    AFTER INSERT OR UPDATE OR DELETE ON patient_lab_results
    FOR EACH STATEMENT EXECUTE FUNCTION queue_clinical_view_refresh();

CREATE TRIGGER queue_vitals_cache_refresh_trigger
    AFTER INSERT OR UPDATE OR DELETE ON patient_vitals
    FOR EACH STATEMENT EXECUTE FUNCTION queue_clinical_view_refresh();

CREATE TRIGGER queue_documents_cache_refresh_trigger
    AFTER INSERT OR UPDATE OR DELETE ON documents
    FOR EACH STATEMENT EXECUTE FUNCTION queue_clinical_view_refresh();

-- Profile changes also affect access permissions
CREATE TRIGGER queue_profile_cache_refresh_trigger
    AFTER INSERT OR UPDATE OR DELETE ON user_profiles
    FOR EACH STATEMENT EXECUTE FUNCTION queue_clinical_view_refresh();

-- P1.1 FIX: Processing function with comprehensive error handling and monitoring
CREATE OR REPLACE FUNCTION process_materialized_view_refresh_queue()
RETURNS TABLE(
    processed_count INTEGER,
    error_count INTEGER,
    processing_time_ms INTEGER,
    error_details TEXT
) AS $$
DECLARE
    refresh_record RECORD;
    processed_count_var INTEGER := 0;
    error_count_var INTEGER := 0;
    start_time TIMESTAMPTZ := clock_timestamp();
    error_details_var TEXT := '';
BEGIN
    -- Process pending refresh requests (priority first, then oldest)
    FOR refresh_record IN 
        SELECT DISTINCT view_name
        FROM materialized_view_refresh_queue 
        WHERE processed_at IS NULL
        ORDER BY MIN(priority) ASC, MIN(requested_at) ASC  -- Lower priority number = higher priority
        GROUP BY view_name
        LIMIT 5 -- Conservative limit to prevent long-running operations
    LOOP
        BEGIN
            -- Verify materialized view exists before refreshing
            IF NOT EXISTS (
                SELECT 1 FROM pg_matviews 
                WHERE matviewname = refresh_record.view_name
            ) THEN
                RAISE EXCEPTION 'Materialized view % does not exist', refresh_record.view_name;
            END IF;
            
            -- Refresh the materialized view
            EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', refresh_record.view_name);
            
            -- Mark all requests for this view as processed
            UPDATE materialized_view_refresh_queue 
            SET processed_at = NOW()
            WHERE view_name = refresh_record.view_name 
            AND processed_at IS NULL;
            
            processed_count_var := processed_count_var + 1;
            
        EXCEPTION WHEN OTHERS THEN
            -- Log error but continue processing other views
            error_count_var := error_count_var + 1;
            error_details_var := error_details_var || 
                format('View %s failed: %s; ', refresh_record.view_name, SQLERRM);
            
            -- Mark failed requests as processed but with lower priority for retry
            UPDATE materialized_view_refresh_queue 
            SET processed_at = NOW(),
                priority = GREATEST(priority + 100, 999) -- Deprioritize failed refreshes
            WHERE view_name = refresh_record.view_name 
            AND processed_at IS NULL;
        END;
    END LOOP;
    
    -- Clean up old processed requests (keep for 24 hours for debugging)
    DELETE FROM materialized_view_refresh_queue 
    WHERE processed_at < NOW() - INTERVAL '24 hours';
    
    -- Return comprehensive results for monitoring
    RETURN QUERY SELECT 
        processed_count_var,
        error_count_var,
        EXTRACT(MILLISECONDS FROM clock_timestamp() - start_time)::INTEGER,
        CASE WHEN error_details_var = '' THEN NULL ELSE error_details_var END;
END;
$$ LANGUAGE plpgsql;
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

-- PERFORMANCE OPTIMIZATION: Create materialized view for relationship access control
-- This replaces the expensive dynamic SQL function with fast table lookups

CREATE MATERIALIZED VIEW relationship_access_cache AS
SELECT 
    'patient_medications'::TEXT as table_name,
    id as record_id,
    patient_id,
    profile_id,
    patient_id as user_id -- For direct access
FROM patient_medications 
WHERE archived IS NOT TRUE

UNION ALL

SELECT 
    'patient_conditions'::TEXT as table_name,
    id as record_id,
    patient_id,
    profile_id,
    patient_id as user_id
FROM patient_conditions 
WHERE archived IS NOT TRUE

UNION ALL

SELECT 
    'patient_allergies'::TEXT as table_name,
    id as record_id,
    patient_id,
    profile_id,
    patient_id as user_id
FROM patient_allergies 
WHERE archived IS NOT TRUE

UNION ALL

SELECT 
    'patient_lab_results'::TEXT as table_name,
    id as record_id,
    patient_id,
    profile_id,
    patient_id as user_id
FROM patient_lab_results 
WHERE archived IS NOT TRUE

UNION ALL

SELECT 
    'patient_vitals'::TEXT as table_name,
    id as record_id,
    patient_id,
    profile_id,
    patient_id as user_id
FROM patient_vitals 
WHERE archived IS NOT TRUE

UNION ALL

SELECT 
    'patient_clinical_events'::TEXT as table_name,
    id as record_id,
    patient_id,
    profile_id,
    patient_id as user_id
FROM patient_clinical_events 
WHERE archived IS NOT TRUE

UNION ALL

SELECT 
    'documents'::TEXT as table_name,
    id as record_id,
    user_id as patient_id,
    profile_id,
    user_id
FROM documents 
WHERE archived IS NOT TRUE;

-- Critical indexes for RLS performance
CREATE UNIQUE INDEX idx_relationship_access_cache_lookup 
ON relationship_access_cache(table_name, record_id);

CREATE INDEX idx_relationship_access_cache_user 
ON relationship_access_cache(user_id);

CREATE INDEX idx_relationship_access_cache_profile 
ON relationship_access_cache(profile_id) WHERE profile_id IS NOT NULL;

-- P1.3 CONSERVATIVE INDEX STRATEGY (Following O3's Recommendation)
-- "Start lean, instrument, and let real traffic tell you which additional indexes earn their keep"

-- ESSENTIAL INDEXES ONLY - The minimal set for core functionality
-- These are based on the most common query patterns identified in reviews

-- 1. CRITICAL: Patient clinical events by patient and date (most common dashboard query)
CREATE INDEX idx_clinical_events_patient_date 
ON patient_clinical_events(patient_id, event_date DESC) 
WHERE archived IS NOT TRUE;

-- 2. CRITICAL: Document processing pipeline (high-volume operations)
CREATE INDEX idx_documents_processing_status 
ON documents(processing_status, created_at DESC) 
WHERE archived IS NOT TRUE;

-- 3. ESSENTIAL: Active medical conditions (frequently filtered)
CREATE INDEX idx_conditions_patient_active 
ON patient_conditions(patient_id, status) 
WHERE status = 'active' AND archived IS NOT TRUE;

-- 4. ESSENTIAL: Profile access permissions (security-critical)
CREATE INDEX idx_profile_permissions_lookup 
ON profile_access_permissions(user_id, profile_id) 
WHERE archived IS NOT TRUE;

-- INSTRUMENTATION FOR INDEX MONITORING
-- Following O3's advice: "enable query logging / pg_stat_statements"
-- After deployment, use these queries to identify missing indexes:

-- Query to monitor index usage:
-- SELECT schemaname, tablename, indexname, idx_tup_read, idx_tup_fetch 
-- FROM pg_stat_user_indexes 
-- ORDER BY idx_tup_read DESC;

-- Query to identify slow queries needing indexes:
-- SELECT query, calls, mean_time, total_time 
-- FROM pg_stat_statements 
-- WHERE mean_time > 100 
-- ORDER BY mean_time DESC;

-- Optimized relationship access control function
-- PERFORMANCE: Replaced O(n) dynamic SQL with O(1) table lookups
CREATE OR REPLACE FUNCTION can_access_relationship(
    source_table TEXT, 
    source_id UUID, 
    target_table TEXT, 
    target_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    user_id UUID := auth.uid();
    source_accessible BOOLEAN := FALSE;
    target_accessible BOOLEAN := FALSE;
BEGIN
    -- Fast lookup using materialized view instead of dynamic SQL
    SELECT EXISTS(
        SELECT 1 FROM relationship_access_cache rac
        WHERE rac.table_name = source_table 
        AND rac.record_id = source_id
        AND (
            rac.user_id = user_id 
            OR (rac.profile_id IS NOT NULL AND can_access_profile_data(rac.profile_id))
        )
    ) INTO source_accessible;
    
    SELECT EXISTS(
        SELECT 1 FROM relationship_access_cache rac
        WHERE rac.table_name = target_table 
        AND rac.record_id = target_id
        AND (
            rac.user_id = user_id 
            OR (rac.profile_id IS NOT NULL AND can_access_profile_data(rac.profile_id))
        )
    ) INTO target_accessible;
    
    RETURN source_accessible OR target_accessible;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Authentication progression functions (referenced in multi-profile.md)
CREATE OR REPLACE FUNCTION perform_soft_authentication(
    profile_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    current_auth_level TEXT;
BEGIN
    -- TODO: Implement soft authentication logic
    -- This stub prevents compilation errors
    SELECT authentication_level INTO current_auth_level 
    FROM user_profiles WHERE id = profile_id;
    
    -- Placeholder logic - should be replaced with actual implementation
    UPDATE user_profiles 
    SET authentication_level = 'soft', 
        soft_authenticated_at = NOW()
    WHERE id = profile_id AND authentication_level = 'none';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION initiate_hard_authentication(
    profile_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
    -- TODO: Implement hard authentication initiation logic
    -- This stub prevents compilation errors
    UPDATE user_profiles 
    SET authentication_level = 'hard_pending'
    WHERE id = profile_id AND authentication_level IN ('soft', 'none');
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION complete_hard_authentication(
    profile_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
    -- TODO: Implement hard authentication completion logic
    -- This stub prevents compilation errors
    UPDATE user_profiles 
    SET authentication_level = 'hard',
        hard_authenticated_at = NOW()
    WHERE id = profile_id AND authentication_level = 'hard_pending';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
```

---

## P2.3. Provider Registry Foundation (Future Provider Portal Support)

*Strategic addition: These tables enable future provider portal features without requiring major schema migrations*

```sql
-- P2.3: Core provider registry for cross-jurisdictional provider management
CREATE TABLE provider_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Universal identification
    guardian_provider_id TEXT UNIQUE NOT NULL, -- Our internal ID: "GP-AU-123456"
    
    -- External registry mappings (AHPRA, etc.)
    external_registries JSONB DEFAULT '[]', -- [{country: "AU", registry: "AHPRA", id: "MED0001234567", verified: true}]
    
    -- Core provider data
    given_names TEXT NOT NULL,
    family_name TEXT NOT NULL,
    professional_titles TEXT[],
    
    -- Professional details
    specialties TEXT[],
    qualifications JSONB, -- [{degree: "MBBS", institution: "Sydney Uni", year: 2010}]
    languages_spoken TEXT[],
    
    -- Practice information
    primary_practice_country TEXT NOT NULL,
    practice_locations JSONB, -- Multiple locations with addresses
    
    -- Guardian platform engagement (future use)
    has_guardian_account BOOLEAN DEFAULT FALSE,
    account_verified BOOLEAN DEFAULT FALSE,
    verification_method TEXT, -- 'ahpra_lookup', 'manual_verification', 'peer_attestation'
    guardian_verified_badge BOOLEAN DEFAULT FALSE,
    pledged_data_sharing BOOLEAN DEFAULT FALSE,
    pledge_date TIMESTAMPTZ,
    
    -- Profile enrichment (provider-added in future)
    bio TEXT,
    areas_of_interest TEXT[],
    accepting_new_patients BOOLEAN,
    telehealth_available BOOLEAN,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived BOOLEAN NOT NULL DEFAULT FALSE
);

-- Patient-provider access control (foundation for future sharing features)
CREATE TABLE patient_provider_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    provider_id UUID NOT NULL REFERENCES provider_registry(id),
    
    -- Access grant details
    access_type TEXT NOT NULL CHECK (access_type IN ('full', 'limited', 'emergency')),
    access_scope TEXT[] NOT NULL, -- ['medications', 'conditions', 'lab_results', 'vitals']
    
    -- Time constraints
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    access_duration_days INTEGER,
    
    -- Access context
    grant_reason TEXT,
    referred_by_provider_id UUID REFERENCES provider_registry(id),
    referral_reason TEXT,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'suspended')),
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT,
    
    -- Provider's pledge acknowledgment (future use)
    provider_pledged_data_return BOOLEAN DEFAULT FALSE,
    pledge_acknowledged_at TIMESTAMPTZ,
    
    -- Audit trail
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived BOOLEAN NOT NULL DEFAULT FALSE
);

-- Essential indexes for provider registry
CREATE INDEX idx_provider_registry_guardian_id ON provider_registry(guardian_provider_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_provider_registry_country ON provider_registry(primary_practice_country) WHERE archived IS NOT TRUE;
CREATE INDEX idx_provider_access_patient ON patient_provider_access(patient_id, status) WHERE archived IS NOT TRUE;
CREATE INDEX idx_provider_access_provider ON patient_provider_access(provider_id, status) WHERE archived IS NOT TRUE;
```

### 6.2. RLS Policies

```sql
-- Enable RLS on all tables including new profile and provider tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_provider_access ENABLE ROW LEVEL SECURITY;
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

-- P2.3: Provider registry RLS policies (future provider portal support)
-- Providers can read public registry data, manage their own profile
CREATE POLICY provider_registry_read_public ON provider_registry
    FOR SELECT USING (archived IS NOT TRUE);

-- Provider authentication bridge table (links Supabase auth.users to provider_registry)
CREATE TABLE provider_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Links Supabase auth user to Guardian provider
    user_id UUID NOT NULL REFERENCES auth.users(id),
    guardian_provider_id TEXT NOT NULL REFERENCES provider_registry(guardian_provider_id),
    
    -- Authentication metadata
    verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'suspended', 'revoked')),
    verification_method TEXT, -- 'ahpra_lookup', 'manual_verification', 'peer_attestation'
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES auth.users(id),
    
    -- Security context
    account_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    
    -- Provider profile preferences
    notification_preferences JSONB DEFAULT '{}',
    ui_preferences JSONB DEFAULT '{}',
    
    -- Account lifecycle
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    suspension_reason TEXT,
    
    -- Unique constraint: one account per provider
    UNIQUE(guardian_provider_id),
    -- Unique constraint: one provider account per user
    UNIQUE(user_id)
);

-- Indexes for provider authentication
CREATE INDEX idx_provider_accounts_user_id ON provider_accounts(user_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_provider_accounts_provider_id ON provider_accounts(guardian_provider_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_provider_accounts_verification ON provider_accounts(verification_status) WHERE archived IS NOT TRUE;

-- Provider authentication functions
CREATE OR REPLACE FUNCTION get_provider_id_for_user(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
    provider_id TEXT;
BEGIN
    SELECT guardian_provider_id INTO provider_id
    FROM provider_accounts
    WHERE user_id = p_user_id
    AND verification_status = 'verified'
    AND archived IS NOT TRUE;
    
    RETURN provider_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_verified_provider(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM provider_accounts
        WHERE user_id = p_user_id
        AND verification_status = 'verified'
        AND archived IS NOT TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Provider self-management policy (now enabled with proper authentication)
CREATE POLICY provider_registry_manage_own ON provider_registry
    FOR ALL USING (
        archived IS NOT TRUE 
        AND has_guardian_account = TRUE 
        AND auth.uid() IN (
            SELECT user_id 
            FROM provider_accounts 
            WHERE guardian_provider_id = provider_registry.guardian_provider_id
            AND verification_status = 'verified'
            AND archived IS NOT TRUE
        )
    );

-- Patient-provider access control policies
CREATE POLICY patient_provider_access_patient_control ON patient_provider_access
    FOR ALL USING (
        archived IS NOT TRUE 
        AND auth.uid() = patient_id  -- Patients control their own access grants
    );

-- RLS policies for provider_accounts table
ALTER TABLE provider_accounts ENABLE ROW LEVEL SECURITY;

-- Providers can manage their own account
CREATE POLICY provider_accounts_own_account ON provider_accounts
    FOR ALL USING (auth.uid() = user_id AND archived IS NOT TRUE);

-- Admin users can manage all provider accounts (for verification workflow)
-- DISABLED: Requires admin_users table to be created first
-- CREATE POLICY provider_accounts_admin_access ON provider_accounts
--     FOR ALL USING (
--         auth.uid() IN (SELECT user_id FROM admin_users WHERE role = 'provider_admin')
--     );

-- Providers can see their own access grants
CREATE POLICY patient_provider_access_provider_view ON patient_provider_access
    FOR SELECT USING (
        archived IS NOT TRUE 
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())
        AND provider_id IN (
            SELECT pr.id 
            FROM provider_registry pr
            JOIN provider_accounts pa ON pr.guardian_provider_id = pa.guardian_provider_id
            WHERE pa.user_id = auth.uid()
            AND pa.verification_status = 'verified'
            AND pa.archived IS NOT TRUE
        )
    );
```

---

## 6. Data Lifecycle Management System

### 6.1. Production-Grade Data Archival Strategy

**Problem:** Healthcare data grows exponentially without archival strategy, leading to performance degradation and cost escalation.

**Solution:** Hybrid approach combining pg_partman for bulk operations with soft archival for edge cases.

```sql
-- Data lifecycle policies configuration
CREATE TABLE data_lifecycle_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL UNIQUE,
    
    -- Retention periods
    hot_retention_months INTEGER NOT NULL, -- Keep in primary tables
    warm_retention_months INTEGER NOT NULL, -- Keep in archive partitions  
    cold_retention_years INTEGER NOT NULL, -- Export to external storage
    
    -- Configuration
    partition_type TEXT DEFAULT 'monthly' CHECK (partition_type IN ('monthly', 'weekly')),
    archive_method TEXT DEFAULT 'hybrid' CHECK (archive_method IN ('partition_only', 'soft_only', 'hybrid')),
    
    -- pg_partman integration
    pg_partman_job_id TEXT,
    last_maintenance_run TIMESTAMPTZ,
    
    -- Operational controls
    is_active BOOLEAN NOT NULL DEFAULT TRUE, -- Can disable policy without deletion
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- System maintenance logging
CREATE TABLE system_maintenance_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation TEXT NOT NULL,
    table_name TEXT,
    details JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    error_message TEXT
);

-- Default lifecycle policies for healthcare compliance
INSERT INTO data_lifecycle_policies (table_name, hot_retention_months, warm_retention_months, cold_retention_years) VALUES
('patient_clinical_events', 24, 60, 7), -- Hot: 2yr, Warm: 5yr, Cold: 7yr
('healthcare_timeline_events', 24, 60, 7),
('documents', 12, 36, 7), -- Documents archived faster due to size
('audit_log', 6, 24, 7), -- Audit kept per compliance
('security_events', 6, 24, 7);

-- Add soft archival columns to key tables
ALTER TABLE patient_clinical_events ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE healthcare_timeline_events ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN archived_at TIMESTAMPTZ;

-- CRITICAL: Partial indexes for soft archival performance
CREATE INDEX idx_clinical_events_not_archived
ON patient_clinical_events (patient_id, created_at DESC)
WHERE archived_at IS NULL;

CREATE INDEX idx_timeline_events_not_archived  
ON healthcare_timeline_events (patient_id, event_date DESC)
WHERE archived_at IS NULL;

CREATE INDEX idx_documents_not_archived
ON documents (user_id, uploaded_at DESC)
WHERE archived_at IS NULL;

-- Archive tables for warm storage
CREATE TABLE patient_clinical_events_archive (
    LIKE patient_clinical_events INCLUDING ALL
) PARTITION BY RANGE (created_at);

CREATE TABLE healthcare_timeline_events_archive (
    LIKE healthcare_timeline_events INCLUDING ALL  
) PARTITION BY RANGE (event_date);

-- Cold storage reference table
CREATE TABLE cold_storage_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_table TEXT NOT NULL,
    original_record_id UUID NOT NULL,
    storage_location TEXT NOT NULL, -- S3 bucket/path
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accessible_until TIMESTAMPTZ, -- Legal hold dates
    checksum TEXT NOT NULL, -- Integrity verification
    metadata JSONB DEFAULT '{}'
);

-- Production-grade soft archival function with monitoring
CREATE OR REPLACE FUNCTION soft_archive_records(
    p_table_name TEXT,
    p_cutoff_date TIMESTAMPTZ,
    p_batch_size INTEGER DEFAULT 1000,
    p_max_batches INTEGER DEFAULT 100
) RETURNS INTEGER AS $$
DECLARE
    processed_count INTEGER := 0;
    batch_count INTEGER;
    batch_num INTEGER := 0;
    log_id UUID;
BEGIN
    -- Start maintenance log
    INSERT INTO system_maintenance_log (operation, table_name, details, status)
    VALUES ('soft_archive', p_table_name, jsonb_build_object(
        'cutoff_date', p_cutoff_date,
        'batch_size', p_batch_size
    ), 'running')
    RETURNING id INTO log_id;
    
    LOOP
        batch_num := batch_num + 1;
        EXIT WHEN batch_num > p_max_batches;
        
        EXECUTE format('
            UPDATE %I SET archived_at = NOW()
            WHERE created_at < %L 
            AND archived_at IS NULL
            LIMIT %s',
            p_table_name, p_cutoff_date, p_batch_size
        );
        
        GET DIAGNOSTICS batch_count = ROW_COUNT;
        processed_count := processed_count + batch_count;
        
        -- Progress logging
        RAISE NOTICE 'Archiving batch % for table %: % rows in batch, % total processed', 
            batch_num, p_table_name, batch_count, processed_count;
        
        EXIT WHEN batch_count = 0;
        
        -- Throttle to avoid lock contention
        PERFORM pg_sleep(0.1);
    END LOOP;
    
    -- Complete maintenance log
    UPDATE system_maintenance_log 
    SET completed_at = NOW(), 
        status = 'completed',
        details = details || jsonb_build_object('records_processed', processed_count)
    WHERE id = log_id;
    
    RETURN processed_count;
EXCEPTION WHEN OTHERS THEN
    -- Log error
    UPDATE system_maintenance_log 
    SET completed_at = NOW(), 
        status = 'failed',
        error_message = SQLERRM
    WHERE id = log_id;
    
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Automated lifecycle management function
CREATE OR REPLACE FUNCTION execute_data_lifecycle_management()
RETURNS VOID AS $$
DECLARE
    policy_record RECORD;
    archived_count INTEGER;
BEGIN
    FOR policy_record IN 
        SELECT * FROM data_lifecycle_policies 
        WHERE is_active = TRUE 
    LOOP
        -- Soft archive old records
        archived_count := soft_archive_records(
            policy_record.table_name,
            NOW() - (policy_record.hot_retention_months || ' months')::INTERVAL,
            1000, -- batch_size
            50    -- max_batches per run
        );
        
        -- Log lifecycle activity
        INSERT INTO security_events (event_type, severity, details)
        VALUES ('data_lifecycle_executed', 'info', jsonb_build_object(
            'table_name', policy_record.table_name,
            'records_archived', archived_count,
            'policy_id', policy_record.id
        ));
        
        -- Update policy last run
        UPDATE data_lifecycle_policies 
        SET last_maintenance_run = NOW()
        WHERE id = policy_record.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule monthly data lifecycle maintenance
-- SELECT cron.schedule('data-lifecycle-management', '0 2 1 * *', 'SELECT execute_data_lifecycle_management();');

-- Monitoring queries for operations team
CREATE VIEW data_lifecycle_status AS
SELECT 
    dlp.table_name,
    dlp.hot_retention_months,
    dlp.is_active,
    dlp.last_maintenance_run,
    CASE 
        WHEN dlp.last_maintenance_run < NOW() - INTERVAL '1 month' THEN 'overdue'
        WHEN dlp.last_maintenance_run < NOW() - INTERVAL '25 days' THEN 'due_soon' 
        ELSE 'current'
    END as maintenance_status,
    COUNT(sml.id) as recent_runs,
    MAX(sml.completed_at) as last_successful_run
FROM data_lifecycle_policies dlp
LEFT JOIN system_maintenance_log sml ON dlp.table_name = sml.table_name 
    AND sml.operation = 'soft_archive'
    AND sml.status = 'completed'
    AND sml.started_at > NOW() - INTERVAL '30 days'
GROUP BY dlp.id, dlp.table_name, dlp.hot_retention_months, dlp.is_active, dlp.last_maintenance_run;
```

---

## 7. Deferred Architectural Considerations

### 7.1. Internationalization Strategy (Deferred to v8)

**Issue:** English-centric CHECK constraints prevent localization
**Impact:** Cannot localize to other languages without schema redesign

**Current Pattern (Problematic):**
```sql
status TEXT CHECK (status IN ('active', 'inactive', 'resolved'))
```

**Future I18n-Friendly Pattern:**
```sql
status_id UUID REFERENCES status_types(id)

-- With lookup table supporting multiple languages
CREATE TABLE status_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL, -- 'active', 'inactive' 
    description_en TEXT NOT NULL,
    description_es TEXT,
    description_fr TEXT,
    description_de TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Migration Strategy:** Replace CHECK constraints with foreign keys during v8 internationalization phase
**Estimated Effort:** 2-3 weeks schema migration + UI localization

### 7.2. Pregnancy-to-Child Profile Transition (Deferred to v7.2)

**Issue:** No defined workflow for pregnancy → child profile data transition
**Impact:** Potential data loss/misattribution during critical life events

**Critical Questions:**
- How are pregnancy clinical events linked to child profile?
- Who owns birth event data (mother, child, or both)?
- What privacy controls apply to shared pregnancy/child data?
- How do RLS policies handle transition period access?

**Proposed Solution Architecture:**
```sql
-- Profile relationship system for complex transitions
CREATE TABLE profile_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_profile_id UUID NOT NULL REFERENCES user_profiles(id),
    child_profile_id UUID NOT NULL REFERENCES user_profiles(id),
    
    -- Relationship metadata
    relationship_type TEXT NOT NULL CHECK (relationship_type IN (
        'pregnancy_to_child', 'guardian_ward', 'parent_child', 'medical_proxy'
    )),
    
    -- Transition event linkage
    transition_event_id UUID REFERENCES patient_clinical_events(id),
    transition_date TIMESTAMPTZ NOT NULL,
    
    -- Data sharing rules
    shared_data_types TEXT[] DEFAULT '{}', -- ['pregnancy_events', 'genetic_info', 'family_history']
    access_permissions JSONB DEFAULT '{}',
    
    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'terminated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shared clinical events for transition periods
CREATE TABLE shared_clinical_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinical_event_id UUID NOT NULL REFERENCES patient_clinical_events(id),
    primary_profile_id UUID NOT NULL REFERENCES user_profiles(id),
    shared_with_profile_id UUID NOT NULL REFERENCES user_profiles(id),
    sharing_reason TEXT NOT NULL,
    shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);
```

**Implementation Requirements:**
- Detailed workflow specification for each transition type
- RLS policy updates for shared access scenarios  
- UI/UX design for family transition experiences
- Data integrity validation during transitions

**Estimated Effort:** 3-4 weeks design + implementation + testing

---

## 8. Essential Constraints and Triggers

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

## 9. AI Processing Foundation (Minimal MLOps)

### 9.1. External API Processing Tracking

*Provides essential traceability for healthcare AI compliance while using external APIs (OpenAI, Google Vision)*

```sql
-- ⚠️  REFERENCE ONLY ⚠️
-- The canonical schema is defined in /supabase/migrations/
-- This SQL is for documentation context only.

-- AI processing sessions for external API tracking
CREATE TABLE ai_processing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id),
    user_id UUID NOT NULL REFERENCES auth.users(id), -- Direct user attribution
    profile_id UUID REFERENCES user_profiles(id), -- Multi-profile support
    
    -- External API tracking (OpenAI GPT-4o Mini, Google Cloud Vision)
    processing_pipeline JSONB NOT NULL,
    -- Example: {
    --   "ocr": {"service": "google_vision", "api_version": "v1", "features": ["TEXT_DETECTION"]},
    --   "llm": {"service": "openai", "model": "gpt-4o-mini", "version": "2024-07-18"},
    --   "cost_estimate": {"ocr_usd": 0.15, "llm_usd": 0.85, "total_usd": 1.00}
    -- }
    
    -- Performance and quality metrics
    api_costs_usd NUMERIC(10,4),        -- Cost attribution for external APIs
    processing_duration_ms INTEGER,     -- Performance monitoring
    confidence_scores JSONB,            -- AI confidence metrics per extraction
    quality_metrics JSONB,              -- Accuracy, completeness scores
    
    -- Error handling and retry logic
    error_details JSONB,                -- API errors, rate limits, timeouts
    retry_count INTEGER DEFAULT 0,
    retry_strategy TEXT,                -- 'exponential_backoff', 'immediate', 'manual'
    
    -- Processing status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- Audit and compliance
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link clinical extractions to processing sessions for traceability
-- This provides the critical healthcare compliance requirement: "What AI system extracted this clinical data?"
ALTER TABLE clinical_fact_sources 
ADD COLUMN processing_session_id UUID REFERENCES ai_processing_sessions(id);

-- AI processing error tracking for operational monitoring
CREATE TABLE ai_processing_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_session_id UUID NOT NULL REFERENCES ai_processing_sessions(id),
    document_id UUID NOT NULL REFERENCES documents(id),
    
    -- Error classification
    error_type TEXT NOT NULL, -- 'api_timeout', 'rate_limit', 'parsing_error', 'insufficient_confidence'
    error_message TEXT NOT NULL,
    error_context JSONB, -- Full error response, stack trace, API response
    
    -- Resolution tracking
    resolved_at TIMESTAMPTZ,
    resolution_method TEXT, -- 'retry_successful', 'manual_intervention', 'alternative_api'
    resolution_notes TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Processing session performance tracking
CREATE TABLE ai_processing_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Daily aggregates
    total_sessions INTEGER DEFAULT 0,
    successful_sessions INTEGER DEFAULT 0,
    failed_sessions INTEGER DEFAULT 0,
    
    -- Performance metrics
    avg_processing_time_ms INTEGER,
    p95_processing_time_ms INTEGER,
    total_api_cost_usd NUMERIC(10,2),
    
    -- Quality metrics
    avg_confidence_score NUMERIC(3,2),
    manual_review_rate NUMERIC(3,2), -- Percentage requiring human review
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 9.2. RLS Policies for AI Processing

```sql
-- ⚠️  REFERENCE ONLY ⚠️
-- The canonical schema is defined in /supabase/migrations/
-- This SQL is for documentation context only.

-- User isolation for AI processing sessions
ALTER TABLE ai_processing_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_processing_isolation ON ai_processing_sessions
    FOR ALL USING (user_id = auth.uid());

-- User isolation for processing errors  
ALTER TABLE ai_processing_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_processing_errors_isolation ON ai_processing_errors
    FOR ALL USING (
        document_id IN (
            SELECT id FROM documents WHERE user_id = auth.uid()
        )
    );

-- Metrics are system-wide (admin access only)
ALTER TABLE ai_processing_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_processing_metrics_admin_only ON ai_processing_metrics
    FOR ALL USING (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin')
    );
```

### 9.3. AI Processing Utility Functions

```sql
-- ⚠️  REFERENCE ONLY ⚠️
-- The canonical schema is defined in /supabase/migrations/
-- This SQL is for documentation context only.

-- Create processing session for document
CREATE OR REPLACE FUNCTION create_ai_processing_session(
    p_document_id UUID,
    p_processing_pipeline JSONB,
    p_user_id UUID DEFAULT auth.uid(),
    p_profile_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    session_id UUID;
BEGIN
    INSERT INTO ai_processing_sessions (
        document_id, user_id, profile_id, processing_pipeline, status
    ) VALUES (
        p_document_id, p_user_id, p_profile_id, p_processing_pipeline, 'pending'
    ) RETURNING id INTO session_id;
    
    RETURN session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update processing session with results
CREATE OR REPLACE FUNCTION complete_ai_processing_session(
    p_session_id UUID,
    p_confidence_scores JSONB,
    p_api_costs_usd NUMERIC,
    p_processing_duration_ms INTEGER,
    p_status TEXT DEFAULT 'completed'
) RETURNS VOID AS $$
BEGIN
    UPDATE ai_processing_sessions SET
        confidence_scores = p_confidence_scores,
        api_costs_usd = p_api_costs_usd,
        processing_duration_ms = p_processing_duration_ms,
        status = p_status,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record processing error
CREATE OR REPLACE FUNCTION record_ai_processing_error(
    p_session_id UUID,
    p_error_type TEXT,
    p_error_message TEXT,
    p_error_context JSONB DEFAULT '{}'
) RETURNS VOID AS $$
DECLARE
    doc_id UUID;
BEGIN
    -- Get document ID from session
    SELECT document_id INTO doc_id 
    FROM ai_processing_sessions 
    WHERE id = p_session_id;
    
    -- Record error
    INSERT INTO ai_processing_errors (
        processing_session_id, document_id, error_type, error_message, error_context
    ) VALUES (
        p_session_id, doc_id, p_error_type, p_error_message, p_error_context
    );
    
    -- Update session status
    UPDATE ai_processing_sessions SET
        status = 'failed',
        retry_count = retry_count + 1,
        updated_at = NOW()
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 9.4. Evolution Path to Full MLOps

This minimal MLOps foundation provides the essential healthcare compliance requirements while using external APIs. As Guardian evolves toward proprietary models, this schema provides the foundation for:

**Phase 2 MLOps Evolution:**
- `ai_models` table for model registry and versioning
- `model_deployments` table for A/B testing capabilities
- `model_performance_metrics` for drift detection
- `feature_stores` for ML feature management
- Integration with MLOps platforms (MLflow, Weights & Biases)

**Key Benefits of This Approach:**
- **Healthcare Compliance**: Complete AI traceability from day one
- **Cost Transparency**: Detailed external API cost attribution
- **Quality Monitoring**: Confidence scoring and manual review triggering
- **Error Resilience**: Comprehensive error handling and retry logic
- **Performance Tracking**: Operational metrics for optimization
- **Evolution Ready**: Foundation for future proprietary model deployment

---

## 10. Future Provider Portal Integration Points

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