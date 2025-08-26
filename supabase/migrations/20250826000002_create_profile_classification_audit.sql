-- Create profile_classification_audit table for V2 safety validation
-- This table tracks profile safety validation and contamination prevention
-- Essential for family healthcare safety and regulatory compliance
-- Created: 2025-08-26

BEGIN;

-- Create profile_classification_audit table (V2 Essential Safety)
CREATE TABLE profile_classification_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id),
    
    -- Profile Classification Results
    recommended_profile_type TEXT NOT NULL CHECK (recommended_profile_type IN ('self', 'child', 'adult_dependent', 'pet')),
    profile_confidence NUMERIC(4,3) CHECK (profile_confidence >= 0 AND profile_confidence <= 1),
    identity_extraction_results JSONB,
    
    -- Contamination Prevention (Core Safety Only)
    contamination_risk_score NUMERIC(4,3) CHECK (contamination_risk_score >= 0 AND contamination_risk_score <= 1),
    contamination_checks_performed JSONB,
    contamination_warnings TEXT[],
    
    -- Audit Trail
    classification_reasoning TEXT,
    manual_review_required BOOLEAN DEFAULT FALSE,
    reviewed_by_user BOOLEAN DEFAULT FALSE,
    final_profile_assignment TEXT CHECK (final_profile_assignment IN ('self', 'child', 'adult_dependent', 'pet')),
    
    -- Safety Validation Details
    identity_consistency_score NUMERIC(4,3),
    medical_appropriateness_score NUMERIC(4,3),
    age_appropriateness_validated BOOLEAN DEFAULT FALSE,
    
    -- Processing Context
    processing_session_id UUID,
    ai_model_used TEXT,
    validation_method TEXT DEFAULT 'automated',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX profile_classification_audit_document_id_idx ON profile_classification_audit(document_id);
CREATE INDEX profile_classification_audit_profile_type_idx ON profile_classification_audit(recommended_profile_type);
CREATE INDEX profile_classification_audit_contamination_risk_idx ON profile_classification_audit(contamination_risk_score);
CREATE INDEX profile_classification_audit_manual_review_idx ON profile_classification_audit(manual_review_required);
CREATE INDEX profile_classification_audit_created_at_idx ON profile_classification_audit(created_at);
CREATE INDEX profile_classification_audit_processing_session_idx ON profile_classification_audit(processing_session_id);

-- Create GIN indexes for JSONB fields
CREATE INDEX profile_classification_audit_identity_results_gin_idx ON profile_classification_audit USING GIN(identity_extraction_results);
CREATE INDEX profile_classification_audit_contamination_checks_gin_idx ON profile_classification_audit USING GIN(contamination_checks_performed);

-- Add updated_at trigger
CREATE TRIGGER update_profile_classification_audit_updated_at 
    BEFORE UPDATE ON profile_classification_audit 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Add row level security (RLS)
ALTER TABLE profile_classification_audit ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access profile classification records for their own documents
CREATE POLICY profile_classification_audit_access_policy ON profile_classification_audit
    FOR ALL USING (
        document_id IN (
            SELECT id FROM documents WHERE patient_id IN (
                SELECT unnest(get_allowed_patient_ids((auth.jwt()->>'profile_id')::uuid))
            )
        )
    );

-- Add helpful comments
COMMENT ON TABLE profile_classification_audit IS 'V2 profile safety validation and contamination prevention audit trail';
COMMENT ON COLUMN profile_classification_audit.recommended_profile_type IS 'AI-recommended profile assignment based on document analysis';
COMMENT ON COLUMN profile_classification_audit.contamination_risk_score IS 'Risk score for cross-profile contamination (0=safe, 1=critical)';
COMMENT ON COLUMN profile_classification_audit.identity_extraction_results IS 'Structured identity data extracted for profile matching';
COMMENT ON COLUMN profile_classification_audit.contamination_checks_performed IS 'Detailed results of contamination prevention validation';
COMMENT ON COLUMN profile_classification_audit.manual_review_required IS 'Flag indicating if manual review is needed for safety';
COMMENT ON COLUMN profile_classification_audit.age_appropriateness_validated IS 'Whether medical content is appropriate for assigned profile age';

COMMIT;