-- Create administrative_data table for billing and insurance information
-- Supports healthcare administrative processes and V2 context extraction
-- Created: 2025-08-26

BEGIN;

-- Create administrative_data table
CREATE TABLE administrative_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    clinical_event_id UUID REFERENCES patient_clinical_events(id), -- Links to related clinical event
    
    -- Insurance Information
    insurance_provider TEXT,
    insurance_plan_name TEXT,
    policy_number TEXT,
    group_number TEXT,
    subscriber_name TEXT,
    subscriber_id TEXT,
    relationship_to_subscriber TEXT, -- 'self', 'spouse', 'child', 'other'
    
    -- Coverage Details
    coverage_type TEXT, -- 'primary', 'secondary', 'tertiary'
    coverage_start_date DATE,
    coverage_end_date DATE,
    copay_amount NUMERIC(8,2),
    deductible_amount NUMERIC(8,2),
    out_of_pocket_max NUMERIC(8,2),
    
    -- Billing Information
    billing_provider TEXT,
    billing_facility TEXT,
    billing_date DATE,
    service_date DATE,
    total_charges NUMERIC(10,2),
    insurance_payment NUMERIC(10,2),
    patient_payment NUMERIC(10,2),
    outstanding_balance NUMERIC(10,2),
    
    -- Claim Information
    claim_number TEXT,
    claim_status TEXT CHECK (claim_status IN ('submitted', 'pending', 'approved', 'denied', 'partially_paid', 'paid')),
    claim_submission_date DATE,
    claim_processing_date DATE,
    denial_reason TEXT,
    
    -- Healthcare Standards Integration (V2)
    procedure_codes TEXT[], -- Array of CPT codes billed
    diagnosis_codes TEXT[], -- Array of ICD-10 codes for claim
    revenue_codes TEXT[], -- Hospital revenue codes
    hcpcs_codes TEXT[], -- Healthcare Common Procedure Coding System
    
    -- Financial Categories
    cost_category TEXT, -- 'preventive', 'diagnostic', 'treatment', 'emergency', 'specialty'
    payment_method TEXT, -- 'insurance', 'cash', 'card', 'payment_plan', 'charity_care'
    
    -- Authorization and Approval
    prior_authorization_number TEXT,
    prior_authorization_required BOOLEAN DEFAULT FALSE,
    prior_authorization_status TEXT CHECK (prior_authorization_status IN ('not_required', 'pending', 'approved', 'denied')),
    referral_number TEXT,
    referral_required BOOLEAN DEFAULT FALSE,
    
    -- Data Quality and Provenance (V2)
    coding_confidence NUMERIC(4,3) CHECK (coding_confidence BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    source_document_id UUID REFERENCES documents(id),
    extraction_method TEXT, -- 'automated_ai', 'manual_entry', 'provider_import'
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX administrative_data_patient_id_idx ON administrative_data(patient_id);
CREATE INDEX administrative_data_clinical_event_idx ON administrative_data(clinical_event_id);
CREATE INDEX administrative_data_insurance_provider_idx ON administrative_data(insurance_provider);
CREATE INDEX administrative_data_claim_status_idx ON administrative_data(claim_status);
CREATE INDEX administrative_data_service_date_idx ON administrative_data(service_date DESC);
CREATE INDEX administrative_data_outstanding_balance_idx ON administrative_data(outstanding_balance) WHERE outstanding_balance > 0;

-- GIN index for medical codes
CREATE INDEX administrative_data_codes_gin_idx ON administrative_data USING gin(
    (array_to_string(procedure_codes, ' ') || ' ' || 
     array_to_string(diagnosis_codes, ' ') || ' ' || 
     array_to_string(revenue_codes, ' ') || ' ' || 
     array_to_string(hcpcs_codes, ' '))
) WHERE (procedure_codes IS NOT NULL OR diagnosis_codes IS NOT NULL OR revenue_codes IS NOT NULL OR hcpcs_codes IS NOT NULL);

-- Index for financial reporting
CREATE INDEX administrative_data_financial_summary_idx ON administrative_data(patient_id, service_date, total_charges, outstanding_balance);

-- Add updated_at trigger
CREATE TRIGGER update_administrative_data_updated_at 
    BEFORE UPDATE ON administrative_data 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Add row level security (RLS)
ALTER TABLE administrative_data ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access administrative data for their allowed patients
CREATE POLICY administrative_data_access_policy ON administrative_data
    FOR ALL USING (
        patient_id IN (
            SELECT unnest(get_allowed_patient_ids((auth.jwt()->>'profile_id')::uuid))
        )
    );

-- Add helpful comments
COMMENT ON TABLE administrative_data IS 'Healthcare billing, insurance, and administrative information with V2 context extraction';
COMMENT ON COLUMN administrative_data.procedure_codes IS 'Array of CPT codes billed for this service - V2 healthcare standards';
COMMENT ON COLUMN administrative_data.diagnosis_codes IS 'Array of ICD-10 diagnosis codes for insurance claim - V2 healthcare standards';
COMMENT ON COLUMN administrative_data.coding_confidence IS 'AI confidence in extracted administrative codes - V2 enhancement';
COMMENT ON COLUMN administrative_data.outstanding_balance IS 'Remaining patient financial responsibility';
COMMENT ON COLUMN administrative_data.extraction_method IS 'Method used to capture administrative data - V2 provenance tracking';

COMMIT;