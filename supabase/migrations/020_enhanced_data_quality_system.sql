-- Enhanced Data Quality Guardian System
-- Extends existing contamination prevention with user validation layer
-- Date: 2025-07-31

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Data Quality Flags Table
-- Core table for tracking detected issues and user resolutions
CREATE TABLE data_quality_flags (
    flag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES user_profiles(profile_id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    record_table TEXT NOT NULL, -- Which table contains the flagged data
    record_id UUID, -- ID of the specific record with issues
    
    -- Flag categorization
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    category TEXT NOT NULL CHECK (category IN ('temporal', 'demographic', 'clinical', 'profile_mismatch', 'extraction_quality')),
    problem_code TEXT NOT NULL, -- Specific error code for tracking
    
    -- Issue details
    field_name TEXT, -- Which field has the issue
    raw_value JSONB, -- Original problematic value
    suggested_correction JSONB, -- AI-suggested fix
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    auto_resolvable BOOLEAN DEFAULT FALSE,
    
    -- Resolution tracking
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed', 'auto_resolved')),
    resolution_action TEXT CHECK (resolution_action IN ('confirmed', 'corrected', 'deleted', 'merged', 'ignored')),
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Additional context for ML learning
    user_feedback_rating INTEGER CHECK (user_feedback_rating >= 1 AND user_feedback_rating <= 5),
    ml_training_eligible BOOLEAN DEFAULT TRUE
);

-- Correction History Table
-- Detailed audit trail of all user corrections for ML learning
CREATE TABLE data_quality_corrections (
    correction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_id UUID REFERENCES data_quality_flags(flag_id) ON DELETE CASCADE,
    
    -- Change details
    original_value JSONB NOT NULL,
    corrected_value JSONB NOT NULL,
    correction_method TEXT NOT NULL CHECK (correction_method IN ('manual', 'ai_suggestion', 'bulk_operation', 'chat_command')),
    correction_source TEXT CHECK (correction_source IN ('ui_panel', 'chat_bot', 'batch_operation', 'mobile_app')),
    
    -- User feedback for ML improvement
    user_confidence TEXT CHECK (user_confidence IN ('very_sure', 'somewhat_sure', 'unsure')),
    correction_difficulty TEXT CHECK (correction_difficulty IN ('easy', 'moderate', 'difficult')),
    user_feedback TEXT,
    
    -- Metadata
    created_by UUID REFERENCES auth.users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- ML learning flags
    used_for_training BOOLEAN DEFAULT FALSE,
    training_weight DECIMAL(3,2) DEFAULT 1.0
);

-- Flag Pattern Learning Table
-- Track patterns in corrections to improve future flagging
CREATE TABLE flag_pattern_learning (
    pattern_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    problem_code TEXT NOT NULL,
    
    -- Pattern recognition data
    pattern_signature JSONB NOT NULL, -- Hash of common attributes
    correction_frequency INTEGER DEFAULT 0,
    false_positive_rate DECIMAL(5,4) DEFAULT 0,
    user_satisfaction_score DECIMAL(3,2),
    
    -- Learning metadata
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    sample_size INTEGER DEFAULT 0,
    
    -- Pattern status
    is_active BOOLEAN DEFAULT TRUE,
    confidence_threshold DECIMAL(3,2) DEFAULT 0.5
);

-- Add soft-delete columns to existing tables
-- Note: Only add if tables exist, adjust based on actual schema
DO $$ 
BEGIN
    -- Add soft delete to documents table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') THEN
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);
    END IF;
    
    -- Add soft delete to clinical_events table if it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clinical_events') THEN
        ALTER TABLE clinical_events ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
        ALTER TABLE clinical_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
        ALTER TABLE clinical_events ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);
    END IF;
    
    -- Add soft delete to other clinical tables as they're created
    -- appointments, medications, lab_results, etc.
END $$;

-- Enhanced Audit Trail Table
-- Comprehensive logging of all data quality actions
CREATE TABLE data_quality_audit (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_id UUID REFERENCES data_quality_flags(flag_id),
    action_type TEXT NOT NULL CHECK (action_type IN ('flag_created', 'flag_resolved', 'record_corrected', 'record_deleted', 'record_restored')),
    
    -- Change tracking
    old_values JSONB,
    new_values JSONB,
    change_summary TEXT,
    
    -- Context
    user_id UUID REFERENCES auth.users(id),
    session_id TEXT,
    user_agent TEXT,
    ip_address INET,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_data_quality_flags_profile_status ON data_quality_flags(profile_id, status);
CREATE INDEX idx_data_quality_flags_severity_created ON data_quality_flags(severity, created_at DESC);
CREATE INDEX idx_data_quality_flags_document_id ON data_quality_flags(document_id);
CREATE INDEX idx_data_quality_flags_category_status ON data_quality_flags(category, status);
CREATE INDEX idx_data_quality_corrections_flag_id ON data_quality_corrections(flag_id);
CREATE INDEX idx_data_quality_corrections_created_by ON data_quality_corrections(created_by);
CREATE INDEX idx_flag_pattern_learning_category_code ON flag_pattern_learning(category, problem_code);
CREATE INDEX idx_data_quality_audit_flag_id ON data_quality_audit(flag_id);
CREATE INDEX idx_data_quality_audit_user_created ON data_quality_audit(user_id, created_at DESC);

-- Row Level Security Policies
-- Ensure users can only see flags for their own profiles or shared profiles

-- Enable RLS on all tables
ALTER TABLE data_quality_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_quality_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE flag_pattern_learning ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_quality_audit ENABLE ROW LEVEL SECURITY;

-- Policy for data_quality_flags
CREATE POLICY "Users can view flags for their profiles" ON data_quality_flags
    FOR SELECT USING (
        profile_id IN (
            SELECT profile_id FROM user_profiles 
            WHERE owner_user_id = auth.uid()
            OR profile_id IN (
                SELECT profile_id FROM profile_access_permissions 
                WHERE grantee_user_id = auth.uid() 
                AND access_level IN ('owner', 'full_access', 'read_write', 'read_only')
                AND (expires_at IS NULL OR expires_at > NOW())
            )
        )
    );

CREATE POLICY "Users can insert flags for their profiles" ON data_quality_flags
    FOR INSERT WITH CHECK (
        profile_id IN (
            SELECT profile_id FROM user_profiles 
            WHERE owner_user_id = auth.uid()
            OR profile_id IN (
                SELECT profile_id FROM profile_access_permissions 
                WHERE grantee_user_id = auth.uid() 
                AND access_level IN ('owner', 'full_access', 'read_write')
                AND (expires_at IS NULL OR expires_at > NOW())
            )
        )
    );

CREATE POLICY "Users can update flags for their profiles" ON data_quality_flags
    FOR UPDATE USING (
        profile_id IN (
            SELECT profile_id FROM user_profiles 
            WHERE owner_user_id = auth.uid()
            OR profile_id IN (
                SELECT profile_id FROM profile_access_permissions 
                WHERE grantee_user_id = auth.uid() 
                AND access_level IN ('owner', 'full_access', 'read_write')
                AND (expires_at IS NULL OR expires_at > NOW())
            )
        )
    );

-- Policy for data_quality_corrections
CREATE POLICY "Users can view corrections for their flags" ON data_quality_corrections
    FOR SELECT USING (
        flag_id IN (
            SELECT flag_id FROM data_quality_flags 
            WHERE profile_id IN (
                SELECT profile_id FROM user_profiles 
                WHERE owner_user_id = auth.uid()
                OR profile_id IN (
                    SELECT profile_id FROM profile_access_permissions 
                    WHERE grantee_user_id = auth.uid() 
                    AND access_level IN ('owner', 'full_access', 'read_write', 'read_only')
                    AND (expires_at IS NULL OR expires_at > NOW())
                )
            )
        )
    );

CREATE POLICY "Users can insert corrections for their flags" ON data_quality_corrections
    FOR INSERT WITH CHECK (
        created_by = auth.uid() AND
        flag_id IN (
            SELECT flag_id FROM data_quality_flags 
            WHERE profile_id IN (
                SELECT profile_id FROM user_profiles 
                WHERE owner_user_id = auth.uid()
                OR profile_id IN (
                    SELECT profile_id FROM profile_access_permissions 
                    WHERE grantee_user_id = auth.uid() 
                    AND access_level IN ('owner', 'full_access', 'read_write')
                    AND (expires_at IS NULL OR expires_at > NOW())
                )
            )
        )
    );

-- Policy for audit table (read-only for users)
CREATE POLICY "Users can view audit for their flags" ON data_quality_audit
    FOR SELECT USING (
        flag_id IN (
            SELECT flag_id FROM data_quality_flags 
            WHERE profile_id IN (
                SELECT profile_id FROM user_profiles 
                WHERE owner_user_id = auth.uid()
                OR profile_id IN (
                    SELECT profile_id FROM profile_access_permissions 
                    WHERE grantee_user_id = auth.uid() 
                    AND access_level IN ('owner', 'full_access', 'read_write', 'read_only')
                    AND (expires_at IS NULL OR expires_at > NOW())
                )
            )
        )
    );

-- Pattern learning table policy (system managed, users can read aggregated data)
CREATE POLICY "Users can view pattern learning data" ON flag_pattern_learning
    FOR SELECT USING (true); -- Public read access to learning patterns

-- Functions for flag management

-- Function to create a data quality flag
CREATE OR REPLACE FUNCTION create_data_quality_flag(
    p_profile_id UUID,
    p_document_id UUID,
    p_record_table TEXT,
    p_record_id UUID,
    p_severity TEXT,
    p_category TEXT,
    p_problem_code TEXT,
    p_field_name TEXT DEFAULT NULL,
    p_raw_value JSONB DEFAULT NULL,
    p_suggested_correction JSONB DEFAULT NULL,
    p_confidence_score DECIMAL DEFAULT NULL,
    p_auto_resolvable BOOLEAN DEFAULT FALSE
) RETURNS UUID AS $$
DECLARE
    v_flag_id UUID;
BEGIN
    INSERT INTO data_quality_flags (
        profile_id, document_id, record_table, record_id,
        severity, category, problem_code, field_name,
        raw_value, suggested_correction, confidence_score, auto_resolvable
    ) VALUES (
        p_profile_id, p_document_id, p_record_table, p_record_id,
        p_severity, p_category, p_problem_code, p_field_name,
        p_raw_value, p_suggested_correction, p_confidence_score, p_auto_resolvable
    ) RETURNING flag_id INTO v_flag_id;
    
    -- Create audit entry
    INSERT INTO data_quality_audit (flag_id, action_type, new_values, user_id)
    VALUES (v_flag_id, 'flag_created', jsonb_build_object(
        'severity', p_severity,
        'category', p_category,
        'problem_code', p_problem_code
    ), auth.uid());
    
    RETURN v_flag_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to resolve a flag
CREATE OR REPLACE FUNCTION resolve_data_quality_flag(
    p_flag_id UUID,
    p_resolution_action TEXT,
    p_resolution_notes TEXT DEFAULT NULL,
    p_user_feedback_rating INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_old_status TEXT;
BEGIN
    -- Get current status
    SELECT status INTO v_old_status FROM data_quality_flags WHERE flag_id = p_flag_id;
    
    -- Update flag
    UPDATE data_quality_flags 
    SET 
        status = 'resolved',
        resolution_action = p_resolution_action,
        resolved_by = auth.uid(),
        resolved_at = NOW(),
        resolution_notes = p_resolution_notes,
        user_feedback_rating = p_user_feedback_rating,
        updated_at = NOW()
    WHERE flag_id = p_flag_id;
    
    -- Create audit entry
    INSERT INTO data_quality_audit (flag_id, action_type, old_values, new_values, user_id)
    VALUES (p_flag_id, 'flag_resolved', 
        jsonb_build_object('status', v_old_status),
        jsonb_build_object('status', 'resolved', 'resolution_action', p_resolution_action),
        auth.uid()
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to soft delete a record with flag resolution
CREATE OR REPLACE FUNCTION soft_delete_with_flag_resolution(
    p_table_name TEXT,
    p_record_id UUID,
    p_flag_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_sql TEXT;
BEGIN
    -- Build dynamic SQL for soft delete
    v_sql := format('UPDATE %I SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $1 WHERE id = $2', p_table_name);
    
    -- Execute the soft delete
    EXECUTE v_sql USING auth.uid(), p_record_id;
    
    -- Resolve the associated flag
    PERFORM resolve_data_quality_flag(p_flag_id, 'deleted', 'Record soft deleted by user');
    
    -- Create audit entry
    INSERT INTO data_quality_audit (flag_id, action_type, old_values, user_id)
    VALUES (p_flag_id, 'record_deleted', 
        jsonb_build_object('record_id', p_record_id, 'table', p_table_name),
        auth.uid()
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to restore a soft-deleted record
CREATE OR REPLACE FUNCTION restore_soft_deleted_record(
    p_table_name TEXT,
    p_record_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_sql TEXT;
BEGIN
    -- Build dynamic SQL for restore
    v_sql := format('UPDATE %I SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL WHERE id = $1', p_table_name);
    
    -- Execute the restore
    EXECUTE v_sql USING p_record_id;
    
    -- Create audit entry
    INSERT INTO data_quality_audit (action_type, old_values, new_values, user_id)
    VALUES ('record_restored', 
        jsonb_build_object('record_id', p_record_id, 'table', p_table_name, 'was_deleted', true),
        jsonb_build_object('record_id', p_record_id, 'table', p_table_name, 'is_deleted', false),
        auth.uid()
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_data_quality_flags_updated_at
    BEFORE UPDATE ON data_quality_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON data_quality_flags TO authenticated;
GRANT SELECT, INSERT ON data_quality_corrections TO authenticated;
GRANT SELECT ON flag_pattern_learning TO authenticated;
GRANT SELECT ON data_quality_audit TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION create_data_quality_flag TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_data_quality_flag TO authenticated;
GRANT EXECUTE ON FUNCTION soft_delete_with_flag_resolution TO authenticated;
GRANT EXECUTE ON FUNCTION restore_soft_deleted_record TO authenticated;

COMMENT ON TABLE data_quality_flags IS 'Core table for tracking data quality issues detected during document processing and requiring user resolution';
COMMENT ON TABLE data_quality_corrections IS 'Audit trail of user corrections for machine learning improvement';
COMMENT ON TABLE flag_pattern_learning IS 'Tracks patterns in corrections to improve future flagging accuracy';
COMMENT ON TABLE data_quality_audit IS 'Comprehensive audit trail of all data quality actions';