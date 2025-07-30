-- Guardian v7.1 Provider Portal: Patient-Provider Access Control
-- This migration creates granular access control between patients and providers
-- Status: Future (v7.1) - Deploy after provider registry is operational

-- =============================================================================
-- 1. PATIENT-PROVIDER ACCESS CONTROL TABLES
-- =============================================================================

-- Granular access permissions between patients and providers
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
    
    -- Provider's pledge acknowledgment
    provider_pledged_data_return BOOLEAN DEFAULT FALSE,
    pledge_acknowledged_at TIMESTAMPTZ,
    
    -- Audit trail
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure unique active access per patient-provider pair
    UNIQUE(patient_id, provider_id, status) DEFERRABLE INITIALLY DEFERRED
);

-- Real-time provider access logging (partitioned for performance)
CREATE TABLE provider_access_log (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    access_permission_id UUID NOT NULL REFERENCES patient_provider_access(id),
    provider_id UUID NOT NULL REFERENCES provider_registry(id),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- What was accessed
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_type TEXT NOT NULL, -- 'view', 'download', 'share'
    accessed_resources TEXT[], -- ['medications', 'recent_labs']
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    
    -- Sharing details (if applicable)
    shared_with_provider_id UUID REFERENCES provider_registry(id),
    share_reason TEXT,
    share_duration_days INTEGER,
    
    -- Audit context
    clinical_context TEXT,
    minimum_necessary_justification TEXT,
    
    PRIMARY KEY (id, accessed_at)
) PARTITION BY RANGE (accessed_at);

-- Create initial partitions for provider access log
CREATE TABLE provider_access_log_2025_q1 PARTITION OF provider_access_log
    FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
CREATE TABLE provider_access_log_2025_q2 PARTITION OF provider_access_log
    FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');
CREATE TABLE provider_access_log_2025_q3 PARTITION OF provider_access_log
    FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
CREATE TABLE provider_access_log_2025_q4 PARTITION OF provider_access_log
    FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');

-- =============================================================================
-- 2. PERFORMANCE INDEXES
-- =============================================================================

-- Patient-provider access indexes
CREATE INDEX idx_patient_provider_access_patient ON patient_provider_access(patient_id) WHERE status = 'active';
CREATE INDEX idx_patient_provider_access_provider ON patient_provider_access(provider_id) WHERE status = 'active';
CREATE INDEX idx_patient_provider_access_expires ON patient_provider_access(expires_at) WHERE expires_at IS NOT NULL AND status = 'active';
CREATE INDEX idx_patient_provider_access_scope ON patient_provider_access USING GIN(access_scope) WHERE status = 'active';

-- Provider access log indexes (on each partition)
CREATE INDEX idx_provider_access_log_provider ON provider_access_log(provider_id, accessed_at DESC);
CREATE INDEX idx_provider_access_log_patient ON provider_access_log(patient_id, accessed_at DESC);
CREATE INDEX idx_provider_access_log_permission ON provider_access_log(access_permission_id);
CREATE INDEX idx_provider_access_log_resources ON provider_access_log USING GIN(accessed_resources);

-- =============================================================================
-- 3. ACCESS VALIDATION FUNCTIONS
-- =============================================================================

-- Comprehensive provider access validation
CREATE OR REPLACE FUNCTION validate_provider_patient_access(
    p_provider_id UUID,
    p_patient_id UUID,
    p_resource_type TEXT,
    p_access_type TEXT DEFAULT 'view'
) RETURNS JSONB AS $$
DECLARE
    access_record RECORD;
    validation_result JSONB;
BEGIN
    -- Get active access permission
    SELECT * INTO access_record
    FROM patient_provider_access
    WHERE provider_id = p_provider_id
    AND patient_id = p_patient_id
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
    AND p_resource_type = ANY(access_scope);
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'access_granted', false,
            'reason', 'no_active_permission',
            'message', 'No active permission found for this provider-patient-resource combination'
        );
    END IF;
    
    -- Verify provider has acknowledged data sharing pledge
    IF NOT access_record.provider_pledged_data_return THEN
        RETURN jsonb_build_object(
            'access_granted', false,
            'reason', 'pledge_not_acknowledged',
            'message', 'Provider must acknowledge data sharing pledge before accessing patient data'
        );
    END IF;
    
    -- Update access tracking
    UPDATE patient_provider_access
    SET last_accessed_at = NOW(),
        access_count = access_count + 1
    WHERE id = access_record.id;
    
    -- Log the access
    INSERT INTO provider_access_log (
        access_permission_id, provider_id, patient_id,
        access_type, accessed_resources, ip_address, user_agent, session_id,
        clinical_context, minimum_necessary_justification
    ) VALUES (
        access_record.id, p_provider_id, p_patient_id,
        p_access_type, ARRAY[p_resource_type],
        inet_client_addr(), 
        current_setting('app.user_agent', true),
        current_setting('app.session_id', true),
        current_setting('app.clinical_context', true),
        current_setting('app.minimum_necessary_justification', true)
    );
    
    RETURN jsonb_build_object(
        'access_granted', true,
        'access_type', access_record.access_type,
        'expires_at', access_record.expires_at,
        'access_count', access_record.access_count + 1,
        'permission_id', access_record.id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant provider access to patient data
CREATE OR REPLACE FUNCTION grant_provider_access(
    p_patient_id UUID,
    p_provider_id UUID,
    p_access_type TEXT,
    p_access_scope TEXT[],
    p_duration_days INTEGER DEFAULT NULL,
    p_grant_reason TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    access_id UUID;
    expires_at_date TIMESTAMPTZ;
BEGIN
    -- Validate provider exists and is verified
    IF NOT EXISTS (
        SELECT 1 FROM provider_registry 
        WHERE id = p_provider_id 
        AND guardian_verified_badge = true
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'provider_not_verified',
            'message', 'Provider must be verified before being granted access'
        );
    END IF;
    
    -- Calculate expiry date if duration specified
    IF p_duration_days IS NOT NULL THEN
        expires_at_date := NOW() + (p_duration_days || ' days')::INTERVAL;
    END IF;
    
    -- Revoke any existing active access
    UPDATE patient_provider_access
    SET status = 'revoked',
        revoked_at = NOW(),
        revoke_reason = 'replaced_by_new_grant'
    WHERE patient_id = p_patient_id
    AND provider_id = p_provider_id
    AND status = 'active';
    
    -- Create new access grant
    INSERT INTO patient_provider_access (
        patient_id, provider_id, access_type, access_scope,
        expires_at, access_duration_days, grant_reason
    ) VALUES (
        p_patient_id, p_provider_id, p_access_type, p_access_scope,
        expires_at_date, p_duration_days, p_grant_reason
    ) RETURNING id INTO access_id;
    
    -- Log the grant action
    INSERT INTO audit_log (
        table_name, record_id, operation, changed_by, reason, clinical_context
    ) VALUES (
        'patient_provider_access', access_id, 'INSERT', p_patient_id,
        'Patient granted provider access', p_grant_reason
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'access_id', access_id,
        'expires_at', expires_at_date,
        'message', 'Provider access granted successfully'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke provider access
CREATE OR REPLACE FUNCTION revoke_provider_access(
    p_patient_id UUID,
    p_provider_id UUID,
    p_revoke_reason TEXT
) RETURNS JSONB AS $$
DECLARE
    access_record RECORD;
BEGIN
    -- Find active access
    SELECT * INTO access_record
    FROM patient_provider_access
    WHERE patient_id = p_patient_id
    AND provider_id = p_provider_id
    AND status = 'active';
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'no_active_access',
            'message', 'No active access found for this provider'
        );
    END IF;
    
    -- Revoke access
    UPDATE patient_provider_access
    SET status = 'revoked',
        revoked_at = NOW(),
        revoke_reason = p_revoke_reason
    WHERE id = access_record.id;
    
    -- Log the revocation
    INSERT INTO audit_log (
        table_name, record_id, operation, changed_by, reason, clinical_context
    ) VALUES (
        'patient_provider_access', access_record.id, 'UPDATE', p_patient_id,
        'Patient revoked provider access', p_revoke_reason
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'revoked_at', NOW(),
        'message', 'Provider access revoked successfully'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 4. EXTENDED RLS POLICIES FOR CLINICAL DATA
-- =============================================================================

-- Provider access to patient clinical events
CREATE POLICY provider_can_view_consented_patients ON patient_clinical_events
    FOR SELECT USING (
        (auth.jwt() ->> 'role') = 'healthcare_provider'
        AND EXISTS (
            SELECT 1 FROM patient_provider_access ppa
            WHERE ppa.patient_id = patient_clinical_events.patient_id
            AND ppa.provider_id = auth.uid()
            AND ppa.status = 'active'
            AND (ppa.expires_at IS NULL OR ppa.expires_at > NOW())
            AND 'clinical_events' = ANY(ppa.access_scope)
        )
    );

-- Provider access to patient medications (materialized view)
CREATE POLICY provider_can_view_patient_medications ON patient_medications
    FOR SELECT USING (
        (auth.jwt() ->> 'role') = 'healthcare_provider'
        AND EXISTS (
            SELECT 1 FROM patient_provider_access ppa
            WHERE ppa.patient_id = patient_medications.patient_id
            AND ppa.provider_id = auth.uid()
            AND ppa.status = 'active'
            AND (ppa.expires_at IS NULL OR ppa.expires_at > NOW())
            AND 'medications' = ANY(ppa.access_scope)
        )
    );

-- Provider access to patient conditions
CREATE POLICY provider_can_view_patient_conditions ON patient_conditions
    FOR SELECT USING (
        (auth.jwt() ->> 'role') = 'healthcare_provider'
        AND EXISTS (
            SELECT 1 FROM patient_provider_access ppa
            WHERE ppa.patient_id = patient_conditions.patient_id
            AND ppa.provider_id = auth.uid()
            AND ppa.status = 'active'
            AND (ppa.expires_at IS NULL OR ppa.expires_at > NOW())
            AND 'conditions' = ANY(ppa.access_scope)
        )
    );

-- Provider access to patient lab results
CREATE POLICY provider_can_view_patient_lab_results ON patient_lab_results
    FOR SELECT USING (
        (auth.jwt() ->> 'role') = 'healthcare_provider'
        AND EXISTS (
            SELECT 1 FROM patient_provider_access ppa
            WHERE ppa.patient_id = patient_lab_results.patient_id
            AND ppa.provider_id = auth.uid()
            AND ppa.status = 'active'
            AND (ppa.expires_at IS NULL OR ppa.expires_at > NOW())
            AND 'lab_results' = ANY(ppa.access_scope)
        )
    );

-- Provider access to patient vitals
CREATE POLICY provider_can_view_patient_vitals ON patient_vitals
    FOR SELECT USING (
        (auth.jwt() ->> 'role') = 'healthcare_provider'
        AND EXISTS (
            SELECT 1 FROM patient_provider_access ppa
            WHERE ppa.patient_id = patient_vitals.patient_id
            AND ppa.provider_id = auth.uid()
            AND ppa.status = 'active'
            AND (ppa.expires_at IS NULL OR ppa.expires_at > NOW())
            AND 'vitals' = ANY(ppa.access_scope)
        )
    );

-- =============================================================================
-- 5. RLS POLICIES FOR ACCESS CONTROL TABLES
-- =============================================================================

-- Enable RLS on access control tables
ALTER TABLE patient_provider_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_access_log ENABLE ROW LEVEL SECURITY;

-- Patients can manage their own access grants
CREATE POLICY patient_provider_access_patient_control ON patient_provider_access
    FOR ALL USING (auth.uid() = patient_id);

-- Providers can see access grants for their own provider ID
CREATE POLICY patient_provider_access_provider_view ON patient_provider_access
    FOR SELECT USING (
        (auth.jwt() ->> 'role') = 'healthcare_provider'
        AND auth.uid() = provider_id
    );

-- Patients can see their own access logs
CREATE POLICY provider_access_log_patient_view ON provider_access_log
    FOR SELECT USING (auth.uid() = patient_id);

-- Providers can see their own access logs
CREATE POLICY provider_access_log_provider_view ON provider_access_log
    FOR SELECT USING (
        (auth.jwt() ->> 'role') = 'healthcare_provider'
        AND auth.uid() = provider_id
    );

-- =============================================================================
-- 6. AUTOMATED MAINTENANCE FUNCTIONS
-- =============================================================================

-- Expire old access permissions
CREATE OR REPLACE FUNCTION expire_provider_access()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE patient_provider_access
    SET status = 'expired'
    WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at <= NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    -- Log expired access count
    INSERT INTO audit_log (
        table_name, record_id, operation, reason, clinical_context
    ) VALUES (
        'patient_provider_access', null, 'UPDATE', 
        'Automated expiry of provider access permissions',
        format('Expired %s access permissions', expired_count)
    );
    
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Create cron job to expire access permissions (runs daily at 02:00)
-- This would be configured in supabase/config.toml:
-- [edge-runtime.cron]
-- expire_provider_access = "0 2 * * *"

-- =============================================================================
-- 7. FEATURE FLAGS AND CONFIGURATION
-- =============================================================================

-- Update feature flags for patient-provider access
INSERT INTO feature_flags (feature_name, enabled, configuration) VALUES
('patient_provider_access', false, '{"granular_permissions": true, "time_based_access": true}')
ON CONFLICT (feature_name) DO UPDATE SET
    configuration = EXCLUDED.configuration,
    updated_at = NOW();

-- =============================================================================
-- 8. COMMENTS AND DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE patient_provider_access IS 'Granular access control between patients and healthcare providers';
COMMENT ON TABLE provider_access_log IS 'Real-time logging of all provider access to patient data (partitioned by quarter)';

COMMENT ON COLUMN patient_provider_access.access_scope IS 'Array of data types provider can access: medications, conditions, lab_results, vitals, etc.';
COMMENT ON COLUMN patient_provider_access.provider_pledged_data_return IS 'Provider has pledged to return clinical data to patient';

COMMENT ON FUNCTION validate_provider_patient_access(UUID, UUID, TEXT, TEXT) IS 'Validate provider access to specific patient resource with audit logging';
COMMENT ON FUNCTION grant_provider_access(UUID, UUID, TEXT, TEXT[], INTEGER, TEXT) IS 'Grant provider access to patient data with optional expiry';
COMMENT ON FUNCTION revoke_provider_access(UUID, UUID, TEXT) IS 'Revoke provider access to patient data with audit trail';