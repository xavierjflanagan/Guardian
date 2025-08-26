-- Create patient_immunizations table for vaccination tracking
-- Supports comprehensive immunization records with healthcare standards integration
-- Created: 2025-08-26

BEGIN;

-- Create patient_immunizations table
CREATE TABLE patient_immunizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    clinical_event_id UUID REFERENCES patient_clinical_events(id), -- Links to parent clinical event
    
    -- Immunization Details
    vaccine_name TEXT NOT NULL, -- "COVID-19 mRNA vaccine", "Influenza vaccine"
    vaccine_type TEXT, -- "mRNA", "inactivated", "live attenuated", "subunit"
    manufacturer TEXT, -- "Pfizer-BioNTech", "Moderna", "Johnson & Johnson"
    lot_number TEXT,
    expiration_date DATE,
    
    -- Administration Details
    dose_number INTEGER, -- 1st dose, 2nd dose, booster
    dose_amount NUMERIC(6,3), -- Amount in mL
    route_of_administration TEXT, -- "intramuscular", "intranasal", "oral"
    anatomical_site TEXT, -- "left deltoid", "right deltoid", "anterolateral thigh"
    
    -- Healthcare Standards Integration (V2)
    snomed_code TEXT, -- SNOMED-CT vaccine codes
    cpt_code TEXT, -- CPT administration codes (90686, 90688, etc.)
    cvx_code TEXT, -- CDC vaccine codes (CVX codes)
    ndc_code TEXT, -- National Drug Code
    
    -- Clinical Context
    indication TEXT, -- "routine immunization", "travel", "occupational exposure"
    contraindications TEXT[], -- Array of contraindications if any
    adverse_reactions TEXT[], -- Any reported adverse reactions
    
    -- Provider Information
    administered_by TEXT, -- Healthcare provider name
    administering_facility TEXT, -- Facility name
    administration_date TIMESTAMPTZ NOT NULL,
    
    -- Data Quality and Provenance (V2)
    coding_confidence NUMERIC(4,3) CHECK (coding_confidence BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    source_document_id UUID REFERENCES documents(id),
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX patient_immunizations_patient_id_idx ON patient_immunizations(patient_id);
CREATE INDEX patient_immunizations_vaccine_name_idx ON patient_immunizations(vaccine_name);
CREATE INDEX patient_immunizations_administration_date_idx ON patient_immunizations(administration_date DESC);
CREATE INDEX patient_immunizations_clinical_event_idx ON patient_immunizations(clinical_event_id);

-- GIN index for vaccine codes
CREATE INDEX patient_immunizations_vaccine_codes_gin_idx ON patient_immunizations USING gin(
    (snomed_code || ' ' || cpt_code || ' ' || cvx_code || ' ' || ndc_code)
) WHERE (snomed_code IS NOT NULL OR cpt_code IS NOT NULL OR cvx_code IS NOT NULL OR ndc_code IS NOT NULL);

-- Add updated_at trigger
CREATE TRIGGER update_patient_immunizations_updated_at 
    BEFORE UPDATE ON patient_immunizations 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Add row level security (RLS)
ALTER TABLE patient_immunizations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access immunization records for their allowed patients
CREATE POLICY patient_immunizations_access_policy ON patient_immunizations
    FOR ALL USING (
        patient_id IN (
            SELECT unnest(get_allowed_patient_ids((auth.jwt()->>'profile_id')::uuid))
        )
    );

-- Add helpful comments
COMMENT ON TABLE patient_immunizations IS 'Comprehensive immunization records with healthcare standards coding - V2 enhanced';
COMMENT ON COLUMN patient_immunizations.vaccine_name IS 'Full vaccine name as documented';
COMMENT ON COLUMN patient_immunizations.cvx_code IS 'CDC vaccine code (CVX) for standardized vaccine identification';
COMMENT ON COLUMN patient_immunizations.coding_confidence IS 'AI confidence in assigned vaccine codes - V2 enhancement';
COMMENT ON COLUMN patient_immunizations.adverse_reactions IS 'Array of any reported adverse reactions';

COMMIT;