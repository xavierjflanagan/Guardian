-- Create patient_demographics table for enhanced patient identity data
-- Supports V2 profile classification and identity verification features
-- Created: 2025-08-26

BEGIN;

-- Create patient_demographics table
CREATE TABLE patient_demographics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Core Identity Information (V2 Profile Classification)
    full_name TEXT,
    preferred_name TEXT,
    date_of_birth DATE,
    gender TEXT CHECK (gender IN ('male', 'female', 'other', 'unknown')),
    
    -- Contact Information
    primary_phone TEXT,
    secondary_phone TEXT,
    email_address TEXT,
    preferred_contact_method TEXT CHECK (preferred_contact_method IN ('phone', 'email', 'sms', 'mail')),
    
    -- Address Information
    street_address TEXT,
    city TEXT,
    state_province TEXT,
    postal_code TEXT,
    country TEXT DEFAULT 'AU', -- Default to Australia
    
    -- Healthcare Identifiers (V2 Identity Verification)
    medicare_number TEXT, -- Australian Medicare number
    healthcare_card_number TEXT,
    insurance_member_id TEXT,
    insurance_group_number TEXT,
    
    -- Emergency Contact
    emergency_contact_name TEXT,
    emergency_contact_relationship TEXT,
    emergency_contact_phone TEXT,
    
    -- Cultural and Language Preferences
    preferred_language TEXT DEFAULT 'en',
    interpreter_required BOOLEAN DEFAULT FALSE,
    cultural_background TEXT,
    religious_preferences TEXT,
    
    -- Healthcare Preferences
    preferred_provider TEXT,
    preferred_facility TEXT,
    advance_directives BOOLEAN DEFAULT FALSE,
    organ_donor BOOLEAN DEFAULT FALSE,
    
    -- V2 Profile Classification Context
    profile_type TEXT CHECK (profile_type IN ('self', 'child', 'adult_dependent', 'pet')) DEFAULT 'self',
    guardian_patient_id UUID REFERENCES auth.users(id), -- Links to guardian if dependent
    dependent_relationship TEXT, -- 'child', 'parent', 'spouse', 'other'
    
    -- Data Quality and Provenance (V2)
    identity_verification_status TEXT CHECK (identity_verification_status IN ('unverified', 'partial', 'verified', 'requires_update')),
    identity_verification_date TIMESTAMPTZ,
    data_source TEXT, -- 'user_entered', 'document_extraction', 'provider_import'
    source_document_id UUID REFERENCES documents(id),
    
    -- Privacy and Consent
    consent_to_contact BOOLEAN DEFAULT TRUE,
    marketing_consent BOOLEAN DEFAULT FALSE,
    data_sharing_consent BOOLEAN DEFAULT TRUE,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX patient_demographics_patient_id_idx ON patient_demographics(patient_id);
CREATE INDEX patient_demographics_date_of_birth_idx ON patient_demographics(date_of_birth);
CREATE INDEX patient_demographics_profile_type_idx ON patient_demographics(profile_type);
CREATE INDEX patient_demographics_guardian_idx ON patient_demographics(guardian_patient_id) WHERE guardian_patient_id IS NOT NULL;
CREATE INDEX patient_demographics_identity_verification_idx ON patient_demographics(identity_verification_status);

-- Unique constraint to ensure one demographics record per patient
CREATE UNIQUE INDEX patient_demographics_patient_unique_idx ON patient_demographics(patient_id);

-- GIN index for healthcare identifiers
CREATE INDEX patient_demographics_healthcare_ids_gin_idx ON patient_demographics USING gin(
    (medicare_number || ' ' || healthcare_card_number || ' ' || insurance_member_id)
) WHERE (medicare_number IS NOT NULL OR healthcare_card_number IS NOT NULL OR insurance_member_id IS NOT NULL);

-- Text search index for name searching
CREATE INDEX patient_demographics_name_search_idx ON patient_demographics USING gin(
    to_tsvector('english', full_name || ' ' || COALESCE(preferred_name, ''))
);

-- Add updated_at trigger
CREATE TRIGGER update_patient_demographics_updated_at 
    BEFORE UPDATE ON patient_demographics 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Add row level security (RLS)
ALTER TABLE patient_demographics ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access demographics for their allowed patients
CREATE POLICY patient_demographics_access_policy ON patient_demographics
    FOR ALL USING (
        patient_id IN (
            SELECT unnest(get_allowed_patient_ids((auth.jwt()->>'profile_id')::uuid))
        )
    );

-- RLS Policy: Guardians can access dependent demographics
CREATE POLICY patient_demographics_guardian_policy ON patient_demographics
    FOR ALL USING (
        guardian_patient_id IN (
            SELECT unnest(get_allowed_patient_ids((auth.jwt()->>'profile_id')::uuid))
        )
    );

-- Add helpful comments
COMMENT ON TABLE patient_demographics IS 'Enhanced patient identity data supporting V2 profile classification and identity verification';
COMMENT ON COLUMN patient_demographics.profile_type IS 'V2 profile type for multi-profile family accounts (self, child, adult_dependent, pet)';
COMMENT ON COLUMN patient_demographics.medicare_number IS 'Australian Medicare number for healthcare system integration';
COMMENT ON COLUMN patient_demographics.identity_verification_status IS 'V2 identity verification status for contamination prevention';
COMMENT ON COLUMN patient_demographics.guardian_patient_id IS 'Links dependent profiles to their guardian for V2 family account management';

COMMIT;