-- Create healthcare_provider_context table for V2 healthcare context extraction
-- Supports provider identification and context extraction from medical documents
-- NOTE: This is separate from the existing 'provider_registry' table which handles provider portal functionality
-- Created: 2025-08-26

BEGIN;

-- Create healthcare_provider_context table
CREATE TABLE healthcare_provider_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Provider Identity
    provider_name TEXT NOT NULL,
    provider_type TEXT CHECK (provider_type IN ('individual', 'organization', 'facility', 'department')),
    specialty TEXT,
    subspecialty TEXT,
    
    -- Individual Provider Details (when provider_type = 'individual')
    first_name TEXT,
    last_name TEXT,
    middle_name TEXT,
    title TEXT, -- 'Dr.', 'Nurse', 'PA', 'NP', 'Therapist'
    credentials TEXT, -- 'MD', 'RN', 'PA-C', 'NP', 'PhD', 'DPT'
    
    -- Organization/Facility Details (when provider_type = 'organization' or 'facility')
    organization_name TEXT,
    department_name TEXT,
    facility_type TEXT, -- 'hospital', 'clinic', 'laboratory', 'pharmacy', 'imaging_center'
    
    -- Contact Information
    primary_phone TEXT,
    secondary_phone TEXT,
    email_address TEXT,
    website_url TEXT,
    
    -- Address Information
    street_address TEXT,
    suite_number TEXT,
    city TEXT,
    state_province TEXT,
    postal_code TEXT,
    country TEXT DEFAULT 'AU',
    
    -- Professional Identifiers
    npi_number TEXT, -- National Provider Identifier (US)
    medicare_provider_number TEXT, -- Medicare provider number
    medicaid_provider_number TEXT, -- Medicaid provider number
    state_license_number TEXT,
    dea_number TEXT, -- Drug Enforcement Administration number
    
    -- Australian Healthcare Identifiers
    ahpra_number TEXT, -- Australian Health Practitioner Regulation Agency
    medicare_provider_number_au TEXT, -- Australian Medicare provider number
    hpi_i TEXT, -- Healthcare Provider Identifier - Individual
    hpi_o TEXT, -- Healthcare Provider Identifier - Organisation
    
    -- Network and Insurance Information
    insurance_networks TEXT[], -- Array of insurance networks
    medicare_participating BOOLEAN DEFAULT FALSE,
    medicaid_participating BOOLEAN DEFAULT FALSE,
    accepting_new_patients BOOLEAN DEFAULT TRUE,
    
    -- Practice Information
    practice_hours JSONB, -- Store business hours as JSON
    languages_spoken TEXT[], -- Array of languages
    board_certifications TEXT[], -- Array of board certifications
    hospital_affiliations TEXT[], -- Array of affiliated hospitals
    
    -- Data Quality and Provenance (V2)
    verification_status TEXT CHECK (verification_status IN ('unverified', 'partial', 'verified', 'requires_update')),
    last_verification_date TIMESTAMPTZ,
    data_source TEXT, -- 'user_entered', 'document_extraction', 'directory_import', 'provider_submitted'
    source_document_id UUID REFERENCES documents(id),
    
    -- Provider Status
    active_status BOOLEAN DEFAULT TRUE,
    inactive_reason TEXT,
    inactive_date TIMESTAMPTZ,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX healthcare_provider_context_provider_name_idx ON healthcare_provider_context(provider_name);
CREATE INDEX healthcare_provider_context_provider_type_idx ON healthcare_provider_context(provider_type);
CREATE INDEX healthcare_provider_context_specialty_idx ON healthcare_provider_context(specialty);
CREATE INDEX healthcare_provider_context_city_state_idx ON healthcare_provider_context(city, state_province);
CREATE INDEX healthcare_provider_context_verification_status_idx ON healthcare_provider_context(verification_status);
CREATE INDEX healthcare_provider_context_active_status_idx ON healthcare_provider_context(active_status);

-- Unique indexes for professional identifiers
CREATE UNIQUE INDEX healthcare_provider_context_npi_unique_idx ON healthcare_provider_context(npi_number) WHERE npi_number IS NOT NULL;
CREATE UNIQUE INDEX healthcare_provider_context_ahpra_unique_idx ON healthcare_provider_context(ahpra_number) WHERE ahpra_number IS NOT NULL;
CREATE UNIQUE INDEX healthcare_provider_context_hpi_i_unique_idx ON healthcare_provider_context(hpi_i) WHERE hpi_i IS NOT NULL;
CREATE UNIQUE INDEX healthcare_provider_context_hpi_o_unique_idx ON healthcare_provider_context(hpi_o) WHERE hpi_o IS NOT NULL;

-- GIN index for professional identifiers search
CREATE INDEX healthcare_provider_context_identifiers_gin_idx ON healthcare_provider_context USING gin(
    (npi_number || ' ' || 
     COALESCE(medicare_provider_number, '') || ' ' || 
     COALESCE(ahpra_number, '') || ' ' || 
     COALESCE(state_license_number, ''))
) WHERE (npi_number IS NOT NULL OR medicare_provider_number IS NOT NULL OR 
         ahpra_number IS NOT NULL OR state_license_number IS NOT NULL);

-- Text search index for provider names
CREATE INDEX healthcare_provider_context_name_search_idx ON healthcare_provider_context USING gin(
    to_tsvector('english', 
        provider_name || ' ' || 
        COALESCE(first_name, '') || ' ' || 
        COALESCE(last_name, '') || ' ' || 
        COALESCE(organization_name, '')
    )
);

-- GIN index for arrays
CREATE INDEX healthcare_provider_context_networks_gin_idx ON healthcare_provider_context USING gin(insurance_networks);
CREATE INDEX healthcare_provider_context_languages_gin_idx ON healthcare_provider_context USING gin(languages_spoken);
CREATE INDEX healthcare_provider_context_certifications_gin_idx ON healthcare_provider_context USING gin(board_certifications);

-- Add updated_at trigger
CREATE TRIGGER update_healthcare_provider_context_updated_at 
    BEFORE UPDATE ON healthcare_provider_context 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Note: No RLS needed for healthcare_provider_context as it's reference data accessible to all users
-- Providers are public information used for healthcare context extraction

-- Add helpful comments
COMMENT ON TABLE healthcare_provider_context IS 'Provider context extraction for V2 healthcare document processing - separate from provider_registry (portal system)';
COMMENT ON COLUMN healthcare_provider_context.ahpra_number IS 'Australian Health Practitioner Regulation Agency registration number';
COMMENT ON COLUMN healthcare_provider_context.hpi_i IS 'Healthcare Provider Identifier - Individual (Australian national identifier)';
COMMENT ON COLUMN healthcare_provider_context.hpi_o IS 'Healthcare Provider Identifier - Organisation (Australian national identifier)';
COMMENT ON COLUMN healthcare_provider_context.verification_status IS 'V2 provider identity verification status for healthcare context accuracy';
COMMENT ON COLUMN healthcare_provider_context.data_source IS 'V2 provenance tracking for provider information';
COMMENT ON COLUMN healthcare_provider_context.practice_hours IS 'JSON object storing business hours (e.g., {"monday": "9:00-17:00", "tuesday": "9:00-17:00"})';

COMMIT;