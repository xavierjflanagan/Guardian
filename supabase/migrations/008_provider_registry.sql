-- Guardian v7.1 Provider Portal: Universal Provider Registry
-- This migration creates the foundation for the provider portal system
-- Status: Future (v7.1) - Deploy after Guardian v7 patient platform is operational

-- =============================================================================
-- 1. PROVIDER REGISTRY CORE TABLES
-- =============================================================================

-- Universal provider registry that works across jurisdictions
CREATE TABLE provider_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Universal identification
    guardian_provider_id TEXT UNIQUE NOT NULL, -- "GP-AU-MED0001234567"
    
    -- External registry mappings
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
    
    -- Guardian platform engagement
    has_guardian_account BOOLEAN DEFAULT FALSE,
    account_verified BOOLEAN DEFAULT FALSE,
    verification_method TEXT, -- 'ahpra_lookup', 'manual_verification', 'peer_attestation'
    guardian_verified_badge BOOLEAN DEFAULT FALSE,
    pledged_data_sharing BOOLEAN DEFAULT FALSE,
    pledge_date TIMESTAMPTZ,
    
    -- Profile enrichment (provider-added)
    bio TEXT,
    areas_of_interest TEXT[],
    accepting_new_patients BOOLEAN,
    telehealth_available BOOLEAN,
    
    -- Directory visibility
    is_public BOOLEAN DEFAULT FALSE, -- Whether provider appears in public directory searches
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AHPRA registry table (completing original O3 ticket)
CREATE TABLE registered_doctors_au (
    ahpra_id TEXT PRIMARY KEY,
    family_name TEXT,
    given_names TEXT,
    profession TEXT,        -- always "Medical Practitioner" in this file
    specialty TEXT[],       -- array (may be empty)
    registration_type TEXT,
    registration_status TEXT, -- "Registered", "Suspended", "Cancelled"
    conditions TEXT,
    principal_state TEXT, 
    principal_postcode TEXT,
    last_updated DATE,      -- as provided in the CSV
    loaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link AHPRA to provider registry
ALTER TABLE provider_registry ADD COLUMN ahpra_verification_id TEXT REFERENCES registered_doctors_au(ahpra_id);

-- =============================================================================
-- 2. PERFORMANCE INDEXES
-- =============================================================================

-- Provider registry indexes
CREATE INDEX idx_provider_registry_guardian_id ON provider_registry(guardian_provider_id);
CREATE INDEX idx_provider_registry_external_regs ON provider_registry USING GIN(external_registries);
CREATE INDEX idx_provider_registry_country ON provider_registry(primary_practice_country);
CREATE INDEX idx_provider_registry_verified ON provider_registry(guardian_verified_badge) WHERE guardian_verified_badge = TRUE;
CREATE INDEX idx_provider_registry_has_account ON provider_registry(has_guardian_account) WHERE has_guardian_account = TRUE;

-- AHPRA registry indexes
CREATE INDEX idx_registered_doctors_au_status ON registered_doctors_au(registration_status);
CREATE INDEX idx_registered_doctors_au_state ON registered_doctors_au(principal_state);
CREATE INDEX idx_registered_doctors_au_name ON registered_doctors_au(family_name, given_names);

-- =============================================================================
-- 3. ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on provider tables
ALTER TABLE provider_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE registered_doctors_au ENABLE ROW LEVEL SECURITY;

-- Providers can see their own records
CREATE POLICY provider_registry_self_access ON provider_registry
    FOR ALL USING (
        is_healthcare_provider() 
        AND auth.uid()::TEXT = id::TEXT
    );

-- Patients can see basic provider info for providers they've granted access
CREATE POLICY provider_registry_patient_access ON provider_registry
    FOR SELECT USING (
        auth.uid() IS NOT NULL 
        AND EXISTS (
            SELECT 1 FROM patient_provider_access ppa
            WHERE ppa.provider_id = provider_registry.id
            AND ppa.patient_id = auth.uid()
            AND ppa.status = 'active'
        )
    );

-- AHPRA data is publicly readable for verification purposes
CREATE POLICY registered_doctors_au_public_read ON registered_doctors_au
    FOR SELECT USING (true);

-- =============================================================================
-- 4. PROVIDER LOOKUP FUNCTIONS
-- =============================================================================

-- AHPRA lookup RPC (from original O3 ticket)
CREATE OR REPLACE FUNCTION get_doctor_by_ahpra(ahpra_id TEXT)
RETURNS TABLE(
    ahpra_id TEXT,
    family_name TEXT,
    given_names TEXT,
    registration_status TEXT,
    specialty TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT rd.ahpra_id, rd.family_name, rd.given_names, rd.registration_status, rd.specialty
    FROM registered_doctors_au rd
    WHERE rd.ahpra_id = get_doctor_by_ahpra.ahpra_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Provider search function
CREATE OR REPLACE FUNCTION search_providers(
    p_search_term TEXT,
    p_country TEXT DEFAULT NULL,
    p_specialty TEXT DEFAULT NULL,
    p_verified_only BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
    id UUID,
    guardian_provider_id TEXT,
    full_name TEXT,
    specialties TEXT[],
    verification_status BOOLEAN,
    primary_practice_country TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pr.id,
        pr.guardian_provider_id,
        CONCAT(pr.given_names, ' ', pr.family_name) as full_name,
        pr.specialties,
        pr.guardian_verified_badge,
        pr.primary_practice_country
    FROM provider_registry pr
    WHERE 
        (p_search_term IS NULL OR 
         pr.given_names ILIKE '%' || p_search_term || '%' OR
         pr.family_name ILIKE '%' || p_search_term || '%' OR
         pr.guardian_provider_id ILIKE '%' || p_search_term || '%')
    AND (p_country IS NULL OR pr.primary_practice_country = p_country)
    AND (p_specialty IS NULL OR p_specialty = ANY(pr.specialties))
    AND (NOT p_verified_only OR pr.guardian_verified_badge = true)
    ORDER BY pr.family_name, pr.given_names;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 5. AUDIT TRIGGERS
-- =============================================================================

-- Update timestamp trigger for provider registry
CREATE TRIGGER update_provider_registry_updated_at
    BEFORE UPDATE ON provider_registry
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Audit trigger for provider registry changes
CREATE TRIGGER provider_registry_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON provider_registry
    FOR EACH ROW EXECUTE FUNCTION enhanced_audit_trigger_function();

-- =============================================================================
-- 6. INITIAL DATA AND CONFIGURATION
-- =============================================================================

-- Update feature flags for provider registry
INSERT INTO feature_flags (feature_name, enabled, configuration) VALUES
('provider_registry', false, '{"ahpra_integration": true, "universal_id_system": true}')
ON CONFLICT (feature_name) DO UPDATE SET
    configuration = EXCLUDED.configuration,
    updated_at = NOW();

-- Add provider registry to core foundation documentation
-- (This would be added to README.md under Core Foundation section)

-- =============================================================================
-- 7. COMMENTS AND DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE provider_registry IS 'Universal provider registry supporting multiple jurisdictions and external registry mappings';
COMMENT ON TABLE registered_doctors_au IS 'Australian AHPRA registry for provider verification (from original O3 ticket)';

COMMENT ON COLUMN provider_registry.guardian_provider_id IS 'Guardian universal provider ID: GP-{COUNTRY}-{EXTERNAL_ID}';
COMMENT ON COLUMN provider_registry.external_registries IS 'Array of external registry mappings with verification status';
COMMENT ON COLUMN provider_registry.guardian_verified_badge IS 'Provider has completed verification and pledged data sharing';

COMMENT ON FUNCTION get_doctor_by_ahpra(TEXT) IS 'Look up Australian doctor by AHPRA ID (original O3 ticket requirement)';
COMMENT ON FUNCTION search_providers(TEXT, TEXT, TEXT, BOOLEAN) IS 'Search providers with optional filters for country, specialty, and verification status';