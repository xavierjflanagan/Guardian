-- Phase 1: Core Normalization Tables
-- This migration creates the normalized medical data tables for Guardian's 
-- Stage 2 transformation from document-centric to patient-centric data model

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Patient Medications (Active/Historical)
CREATE TABLE patient_medications (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users ON DELETE CASCADE,
    
    -- Medication Details
    medication_name text NOT NULL,
    dosage text,
    frequency text,
    route text, -- oral, injection, topical, etc.
    prescriber text,
    
    -- Status & Timeline
    status text DEFAULT 'active', -- active, discontinued, completed
    start_date date,
    end_date date,
    
    -- Source Tracking & Quality
    source_document_ids uuid[] NOT NULL, -- Array of document IDs
    confidence_score decimal(3,2), -- 0.00 to 1.00
    last_confirmed_at timestamptz,
    
    -- Deduplication
    normalized_name text, -- Standardized drug name for matching
    duplicate_group_id uuid, -- Groups similar medications
    
    -- Metadata
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Constraints
    CONSTRAINT patient_medications_status_check 
        CHECK (status IN ('active', 'discontinued', 'completed', 'unknown')),
    CONSTRAINT patient_medications_confidence_check 
        CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

-- Patient Allergies (Critical Safety Data)
CREATE TABLE patient_allergies (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users ON DELETE CASCADE,
    
    -- Allergy Details
    allergen text NOT NULL,
    allergy_type text, -- drug, food, environmental, etc.
    severity text, -- mild, moderate, severe, life-threatening
    reaction_description text,
    
    -- Status & Timeline
    status text DEFAULT 'active', -- active, resolved, unconfirmed
    onset_date date,
    
    -- Source Tracking & Quality
    source_document_ids uuid[] NOT NULL,
    confidence_score decimal(3,2),
    last_confirmed_at timestamptz,
    
    -- Deduplication
    normalized_allergen text,
    duplicate_group_id uuid,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Constraints
    CONSTRAINT patient_allergies_status_check 
        CHECK (status IN ('active', 'resolved', 'unconfirmed')),
    CONSTRAINT patient_allergies_severity_check 
        CHECK (severity IS NULL OR severity IN ('mild', 'moderate', 'severe', 'life-threatening', 'unknown')),
    CONSTRAINT patient_allergies_confidence_check 
        CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

-- Patient Conditions/Diagnoses
CREATE TABLE patient_conditions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users ON DELETE CASCADE,
    
    -- Condition Details
    condition_name text NOT NULL,
    icd10_code text, -- Standard medical coding
    condition_category text, -- chronic, acute, resolved, etc.
    description text,
    
    -- Status & Timeline
    status text DEFAULT 'active', -- active, resolved, in_remission, etc.
    diagnosis_date date,
    resolution_date date,
    
    -- Source Tracking & Quality
    source_document_ids uuid[] NOT NULL,
    confidence_score decimal(3,2),
    last_confirmed_at timestamptz,
    
    -- Deduplication
    normalized_condition text,
    duplicate_group_id uuid,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Constraints
    CONSTRAINT patient_conditions_status_check 
        CHECK (status IN ('active', 'resolved', 'in_remission', 'chronic', 'acute', 'unknown')),
    CONSTRAINT patient_conditions_confidence_check 
        CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

-- Patient Lab Results (Trending Over Time)
CREATE TABLE patient_lab_results (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users ON DELETE CASCADE,
    
    -- Lab Details
    test_name text NOT NULL,
    test_code text, -- Standard lab codes (LOINC, CPT)
    result_value text NOT NULL,
    unit text,
    reference_range text,
    
    -- Clinical Context
    result_status text, -- normal, abnormal, critical, etc.
    test_date date NOT NULL,
    ordering_provider text,
    lab_facility text,
    
    -- Source Tracking & Quality
    source_document_id uuid NOT NULL REFERENCES documents(id),
    confidence_score decimal(3,2),
    
    -- Trending & Analysis
    normalized_test_name text, -- For grouping same test over time
    numeric_value decimal(10,3), -- Parsed numeric value for trending
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Constraints
    CONSTRAINT patient_lab_results_status_check 
        CHECK (result_status IS NULL OR result_status IN ('normal', 'abnormal', 'critical', 'high', 'low', 'unknown')),
    CONSTRAINT patient_lab_results_confidence_check 
        CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

-- Patient Vital Signs
CREATE TABLE patient_vitals (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users ON DELETE CASCADE,
    
    -- Vital Signs
    measurement_date date NOT NULL,
    blood_pressure_systolic integer,
    blood_pressure_diastolic integer,
    heart_rate integer, -- BPM
    temperature decimal(4,1), -- Degrees
    weight decimal(5,1), -- Pounds or Kg
    height decimal(5,1), -- Inches or CM
    bmi decimal(4,1),
    
    -- Units & Context
    temperature_unit text DEFAULT 'F', -- F or C
    weight_unit text DEFAULT 'lbs', -- lbs or kg
    height_unit text DEFAULT 'in', -- in or cm
    measurement_context text, -- office visit, home, hospital, etc.
    
    -- Source Tracking
    source_document_id uuid NOT NULL REFERENCES documents(id),
    confidence_score decimal(3,2),
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Constraints
    CONSTRAINT patient_vitals_temperature_unit_check 
        CHECK (temperature_unit IN ('F', 'C')),
    CONSTRAINT patient_vitals_weight_unit_check 
        CHECK (weight_unit IN ('lbs', 'kg')),
    CONSTRAINT patient_vitals_height_unit_check 
        CHECK (height_unit IN ('in', 'cm')),
    CONSTRAINT patient_vitals_confidence_check 
        CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

-- Patient Healthcare Providers
CREATE TABLE patient_providers (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users ON DELETE CASCADE,
    
    -- Provider Details
    provider_name text NOT NULL,
    specialty text,
    facility_name text,
    phone text,
    address text,
    
    -- Relationship
    provider_type text, -- primary_care, specialist, emergency, etc.
    relationship_status text DEFAULT 'active', -- active, former, referred
    first_seen_date date,
    last_seen_date date,
    
    -- Source Tracking & Quality
    source_document_ids uuid[] NOT NULL,
    confidence_score decimal(3,2),
    
    -- Deduplication
    normalized_name text,
    duplicate_group_id uuid,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Constraints
    CONSTRAINT patient_providers_relationship_check 
        CHECK (relationship_status IN ('active', 'former', 'referred', 'unknown')),
    CONSTRAINT patient_providers_confidence_check 
        CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

-- Enable Row Level Security (RLS) on all normalized tables
ALTER TABLE patient_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_providers ENABLE ROW LEVEL SECURITY;

-- User isolation policies - Users can only access their own data
CREATE POLICY "Users can only access their own medications" ON patient_medications
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own allergies" ON patient_allergies
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own conditions" ON patient_conditions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own lab results" ON patient_lab_results
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own vitals" ON patient_vitals
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own providers" ON patient_providers
    FOR ALL USING (auth.uid() = user_id);

-- Strategic Indexing for Main Dashboard Performance
CREATE INDEX CONCURRENTLY patient_medications_active_idx ON patient_medications(user_id, status) WHERE status = 'active';
CREATE INDEX CONCURRENTLY patient_allergies_active_idx ON patient_allergies(user_id, status) WHERE status = 'active';
CREATE INDEX CONCURRENTLY patient_conditions_active_idx ON patient_conditions(user_id, status) WHERE status = 'active';
CREATE INDEX CONCURRENTLY patient_lab_results_recent_idx ON patient_lab_results(user_id, test_date DESC);
CREATE INDEX CONCURRENTLY patient_vitals_recent_idx ON patient_vitals(user_id, measurement_date DESC);

-- Composite indexes for deduplication queries
CREATE INDEX CONCURRENTLY medications_dedup_idx ON patient_medications(user_id, normalized_name, status);
CREATE INDEX CONCURRENTLY allergies_dedup_idx ON patient_allergies(user_id, normalized_allergen, status);
CREATE INDEX CONCURRENTLY conditions_dedup_idx ON patient_conditions(user_id, normalized_condition, status);
CREATE INDEX CONCURRENTLY providers_dedup_idx ON patient_providers(user_id, normalized_name, relationship_status);

-- Full-text search indexes for medical data
CREATE INDEX CONCURRENTLY medications_search_idx ON patient_medications USING gin(to_tsvector('english', medication_name));
CREATE INDEX CONCURRENTLY conditions_search_idx ON patient_conditions USING gin(to_tsvector('english', condition_name));
CREATE INDEX CONCURRENTLY allergies_search_idx ON patient_allergies USING gin(to_tsvector('english', allergen));

-- Source traceability indexes
CREATE INDEX CONCURRENTLY medications_source_docs_idx ON patient_medications USING gin(source_document_ids);
CREATE INDEX CONCURRENTLY allergies_source_docs_idx ON patient_allergies USING gin(source_document_ids);
CREATE INDEX CONCURRENTLY conditions_source_docs_idx ON patient_conditions USING gin(source_document_ids);
CREATE INDEX CONCURRENTLY providers_source_docs_idx ON patient_providers USING gin(source_document_ids);

-- Updated timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_patient_medications_updated_at BEFORE UPDATE ON patient_medications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_allergies_updated_at BEFORE UPDATE ON patient_allergies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_conditions_updated_at BEFORE UPDATE ON patient_conditions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_lab_results_updated_at BEFORE UPDATE ON patient_lab_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_vitals_updated_at BEFORE UPDATE ON patient_vitals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_providers_updated_at BEFORE UPDATE ON patient_providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add normalization tracking to documents table
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS normalized_at timestamptz,
ADD COLUMN IF NOT EXISTS normalization_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS normalization_errors jsonb;

-- Add constraint for normalization status
ALTER TABLE documents 
ADD CONSTRAINT documents_normalization_status_check 
CHECK (normalization_status IN ('pending', 'processing', 'completed', 'failed'));

-- Index for normalization tracking
CREATE INDEX IF NOT EXISTS documents_normalization_status_idx ON documents(normalization_status);
CREATE INDEX IF NOT EXISTS documents_normalized_at_idx ON documents(normalized_at);

-- Comments for documentation
COMMENT ON TABLE patient_medications IS 'Normalized medication records with deduplication and source traceability';
COMMENT ON TABLE patient_allergies IS 'Critical allergy information with safety-focused validation';
COMMENT ON TABLE patient_conditions IS 'Medical conditions and diagnoses with ICD-10 coding support';
COMMENT ON TABLE patient_lab_results IS 'Laboratory test results with trending and reference ranges';
COMMENT ON TABLE patient_vitals IS 'Vital signs measurements with unit standardization';
COMMENT ON TABLE patient_providers IS 'Healthcare provider relationships and contact information';

COMMENT ON COLUMN documents.normalized_at IS 'Timestamp when document medical data was normalized into relational tables';
COMMENT ON COLUMN documents.normalization_status IS 'Status of normalization process (pending, processing, completed, failed)';
COMMENT ON COLUMN documents.normalization_errors IS 'JSON array of normalization errors and warnings';