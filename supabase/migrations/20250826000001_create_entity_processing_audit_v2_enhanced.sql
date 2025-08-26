-- Create entity_processing_audit table with V2 enhancements
-- This table provides complete audit trail for AI processing pipeline
-- Supports V3 core processing + V2 safety validation features
-- Created: 2025-08-26

BEGIN;

-- Create entity_processing_audit table (V3 + V2 Enhanced)
CREATE TABLE entity_processing_audit (
    -- V3 Core Fields (Enhanced)
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id),
    entity_id TEXT NOT NULL,
    
    -- V3 Processing Results
    entity_category TEXT NOT NULL CHECK (entity_category IN ('clinical_event', 'healthcare_context', 'document_structure')),
    entity_subtype TEXT NOT NULL,
    pass1_confidence NUMERIC(3,2),
    pass2_status TEXT CHECK (pass2_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
    final_event_id UUID REFERENCES patient_clinical_events(id),
    
    -- V2 Profile Classification Results (Essential)
    profile_classification_results JSONB,
    contamination_prevention_checks JSONB,
    identity_verification_results JSONB,
    
    -- V2 Healthcare Standards Results (Schema-Driven)
    medical_coding_results JSONB,
    healthcare_context_extraction JSONB,
    
    -- V2 Spatial Processing Results
    spatial_alignment_results JSONB,
    
    -- Processing Metadata
    processing_session_id UUID,
    processing_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_completed_at TIMESTAMPTZ,
    
    -- Entity Content and Provenance
    original_text TEXT,
    spatial_coordinates JSONB,
    
    -- Audit Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX entity_processing_audit_document_id_idx ON entity_processing_audit(document_id);
CREATE INDEX entity_processing_audit_entity_category_idx ON entity_processing_audit(entity_category);
CREATE INDEX entity_processing_audit_processing_session_idx ON entity_processing_audit(processing_session_id);
CREATE INDEX entity_processing_audit_created_at_idx ON entity_processing_audit(created_at);

-- Create GIN indexes for JSONB fields
CREATE INDEX entity_processing_audit_profile_classification_gin_idx ON entity_processing_audit USING GIN(profile_classification_results);
CREATE INDEX entity_processing_audit_medical_coding_gin_idx ON entity_processing_audit USING GIN(medical_coding_results);
CREATE INDEX entity_processing_audit_spatial_coordinates_gin_idx ON entity_processing_audit USING GIN(spatial_coordinates);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_entity_processing_audit_updated_at 
    BEFORE UPDATE ON entity_processing_audit 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Add row level security (RLS)
ALTER TABLE entity_processing_audit ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access audit records for their own documents
CREATE POLICY entity_processing_audit_access_policy ON entity_processing_audit
    FOR ALL USING (
        document_id IN (
            SELECT id FROM documents WHERE patient_id IN (
                SELECT unnest(get_allowed_patient_ids((auth.jwt()->>'profile_id')::uuid))
            )
        )
    );

-- Add helpful comments
COMMENT ON TABLE entity_processing_audit IS 'Complete audit trail for AI processing pipeline with V2 safety enhancements';
COMMENT ON COLUMN entity_processing_audit.entity_category IS 'V3 3-category classification: clinical_event, healthcare_context, document_structure';
COMMENT ON COLUMN entity_processing_audit.profile_classification_results IS 'V2 profile safety validation results including identity verification';
COMMENT ON COLUMN entity_processing_audit.contamination_prevention_checks IS 'V2 contamination prevention validation results';
COMMENT ON COLUMN entity_processing_audit.medical_coding_results IS 'V2 healthcare standards coding results (SNOMED, LOINC, CPT)';
COMMENT ON COLUMN entity_processing_audit.spatial_alignment_results IS 'V2 spatial precision and click-to-zoom alignment results';

COMMIT;