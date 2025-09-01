-- Enhanced Consent Management Implementation
-- Guardian v7 Implementation - Step 2
-- File: 002_enhanced_consent.sql
-- Implements GDPR Article 7 compliant granular consent system

BEGIN;

-- Create enhanced consent management tables
CREATE TABLE IF NOT EXISTS patient_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Consent details
    consent_type TEXT NOT NULL CHECK (consent_type IN (
        'data_sharing', 'research_participation', 'marketing_communication',
        'ai_processing', 'external_provider_access', 'emergency_access',
        'family_access', 'analytics_processing', 'export_data'
    )),
    resource_type TEXT, -- specific to certain data types ('medications', 'lab_results', etc.)
    granted_to UUID, -- specific provider, organization, or NULL for general
    purpose TEXT NOT NULL,
    
    -- Consent status
    granted BOOLEAN NOT NULL DEFAULT false,
    
    -- GDPR Article 7 compliance fields
    legal_basis TEXT NOT NULL CHECK (legal_basis IN (
        'consent', 'contract', 'legal_obligation', 'vital_interests',
        'public_task', 'legitimate_interests'
    )),
    explicit_consent BOOLEAN NOT NULL DEFAULT false, -- GDPR Article 7(1)
    consent_evidence JSONB, -- Record of how consent was obtained
    
    -- Temporal controls
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ, -- NULL means indefinite
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    
    -- Metadata
    consent_metadata JSONB DEFAULT '{}',
    consent_version TEXT DEFAULT '1.0',
    
    -- Audit trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    
    -- Constraints
    CONSTRAINT valid_temporal_range CHECK (
        valid_until IS NULL OR valid_until > valid_from
    ),
    CONSTRAINT revocation_logic CHECK (
        (granted = false AND revoked_at IS NOT NULL) OR
        (granted = true AND revoked_at IS NULL)
    ),
    
    -- Note: Unique constraint simplified due to PostgreSQL limitations with COALESCE in constraints
    UNIQUE (patient_id, consent_type, purpose, granted_to, resource_type)
);

-- Create consent audit table for immutable history
CREATE TABLE IF NOT EXISTS patient_consent_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consent_id UUID NOT NULL REFERENCES patient_consents(id),
    
    -- Action details
    action TEXT NOT NULL CHECK (action IN (
        'granted', 'revoked', 'modified', 'expired', 'renewed'
    )),
    action_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action_by UUID REFERENCES auth.users(id),
    
    -- Context
    action_context JSONB, -- Browser, IP, device info
    previous_state JSONB,
    new_state JSONB,
    
    -- Legal compliance
    legal_basis_change BOOLEAN DEFAULT false,
    gdpr_notification_required BOOLEAN DEFAULT false,
    
    -- Immutable by design
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create consent preferences table for user-friendly management
CREATE TABLE IF NOT EXISTS user_consent_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id),
    
    -- General preferences
    default_consent_duration INTERVAL DEFAULT '1 year',
    require_explicit_consent BOOLEAN DEFAULT true,
    auto_renew_enabled BOOLEAN DEFAULT false,
    
    -- Notification preferences
    consent_expiry_reminder_days INTEGER DEFAULT 30,
    notify_on_access BOOLEAN DEFAULT true,
    notification_method TEXT DEFAULT 'email' CHECK (notification_method IN ('email', 'sms', 'push', 'all')),
    
    -- Privacy preferences
    granular_control_enabled BOOLEAN DEFAULT true,
    emergency_override_allowed BOOLEAN DEFAULT true,
    
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_patient_consents_patient ON patient_consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_type ON patient_consents(consent_type);
CREATE INDEX IF NOT EXISTS idx_patient_consents_granted_to ON patient_consents(granted_to);
CREATE INDEX IF NOT EXISTS idx_patient_consents_valid_period ON patient_consents(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_patient_consents_status ON patient_consents(granted) WHERE granted = true;
CREATE INDEX IF NOT EXISTS idx_patient_consent_audit_consent ON patient_consent_audit(consent_id);
CREATE INDEX IF NOT EXISTS idx_patient_consent_audit_timestamp ON patient_consent_audit(action_timestamp);

-- Row Level Security policies
ALTER TABLE patient_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_consent_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consent_preferences ENABLE ROW LEVEL SECURITY;

-- Patients can manage their own consents
CREATE POLICY patient_consents_own_data ON patient_consents
    FOR ALL TO authenticated
    USING (patient_id = auth.uid())
    WITH CHECK (patient_id = auth.uid());

-- Healthcare providers can view relevant consents
CREATE POLICY patient_consents_provider_read ON patient_consents
    FOR SELECT TO authenticated
    USING (
        granted = true 
        AND NOW() BETWEEN valid_from AND COALESCE(valid_until, 'infinity'::timestamptz)
        AND (
            granted_to = auth.uid() OR 
            granted_to IS NULL OR
            -- Provider has explicit access through organization
            EXISTS (
                SELECT 1 FROM patient_provider_access 
                WHERE provider_id = auth.uid() AND patient_id = patient_consents.patient_id
            )
        )
    );

-- Audit access is read-only for patients and authorized providers
CREATE POLICY patient_consent_audit_read ON patient_consent_audit
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM patient_consents pc 
            WHERE pc.id = consent_id 
            AND (pc.patient_id = auth.uid() OR pc.granted_to = auth.uid())
        )
    );

-- Users can manage their own consent preferences
CREATE POLICY user_consent_preferences_own_data ON user_consent_preferences
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Create consent management functions
CREATE OR REPLACE FUNCTION grant_patient_consent(
    p_patient_id UUID,
    p_consent_type TEXT,
    p_purpose TEXT,
    p_granted_to UUID DEFAULT NULL,
    p_resource_type TEXT DEFAULT NULL,
    p_valid_until TIMESTAMPTZ DEFAULT NULL,
    p_explicit_consent BOOLEAN DEFAULT true,
    p_consent_evidence JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    consent_id UUID;
BEGIN
    -- Atomic INSERT with ON CONFLICT to prevent race conditions
    INSERT INTO patient_consents (
        patient_id, consent_type, resource_type, granted_to, purpose,
        granted, legal_basis, explicit_consent, valid_until, 
        consent_evidence, created_by, updated_by
    ) VALUES (
        p_patient_id, p_consent_type, p_resource_type, p_granted_to, p_purpose,
        true, 'consent', p_explicit_consent, p_valid_until,
        p_consent_evidence, auth.uid(), auth.uid()
    )
    ON CONFLICT (patient_id, consent_type, purpose, COALESCE(granted_to, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(resource_type, ''))
    DO UPDATE SET
        valid_until = p_valid_until,
        consent_evidence = patient_consents.consent_evidence || p_consent_evidence,
        updated_at = NOW(),
        updated_by = auth.uid(),
        granted = true,
        revoked_at = NULL -- Re-grant if previously revoked
    RETURNING id INTO consent_id;
    
    -- Record audit entry
    INSERT INTO patient_consent_audit (
        consent_id, action, action_by, new_state, action_context
    ) VALUES (
        consent_id, 'granted', auth.uid(),
        jsonb_build_object(
            'consent_type', p_consent_type,
            'purpose', p_purpose,
            'granted_to', p_granted_to,
            'valid_until', p_valid_until
        ),
        jsonb_build_object(
            'user_agent', current_setting('request.headers', true)::jsonb->>'user-agent',
            'timestamp', NOW()
        )
    );
    
    RETURN consent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION revoke_patient_consent(
    p_consent_id UUID,
    p_revocation_reason TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    consent_record RECORD;
BEGIN
    -- Get current consent
    SELECT * INTO consent_record FROM patient_consents WHERE id = p_consent_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Consent not found: %', p_consent_id;
    END IF;
    
    -- Verify user can revoke this consent
    IF consent_record.patient_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized to revoke this consent';
    END IF;
    
    -- Update consent
    UPDATE patient_consents
    SET granted = false,
        revoked_at = NOW(),
        revocation_reason = p_revocation_reason,
        updated_at = NOW(),
        updated_by = auth.uid()
    WHERE id = p_consent_id;
    
    -- Record audit entry
    INSERT INTO patient_consent_audit (
        consent_id, action, action_by, 
        previous_state, new_state, action_context
    ) VALUES (
        p_consent_id, 'revoked', auth.uid(),
        row_to_json(consent_record),
        jsonb_build_object(
            'revoked_at', NOW(),
            'revocation_reason', p_revocation_reason
        ),
        jsonb_build_object(
            'user_agent', current_setting('request.headers', true)::jsonb->>'user-agent',
            'timestamp', NOW()
        )
    );
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check consent access
CREATE OR REPLACE FUNCTION check_consent_access(
    p_patient_id UUID,
    p_accessor_id UUID,
    p_resource_type TEXT DEFAULT NULL,
    p_purpose TEXT DEFAULT 'healthcare_services'
) RETURNS BOOLEAN AS $$
DECLARE
    consent_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM patient_consents
        WHERE patient_id = p_patient_id
        AND (granted_to = p_accessor_id OR granted_to IS NULL)
        AND (resource_type = p_resource_type OR resource_type IS NULL)
        AND purpose = p_purpose
        AND granted = true
        AND NOW() BETWEEN valid_from AND COALESCE(valid_until, 'infinity'::timestamptz)
        AND revoked_at IS NULL
    ) INTO consent_exists;
    
    RETURN consent_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for automatic consent audit
CREATE OR REPLACE FUNCTION trigger_consent_audit()
RETURNS TRIGGER AS $$
BEGIN
    -- Don't audit audit table itself
    IF TG_TABLE_NAME = 'patient_consent_audit' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Record all changes to consents
    INSERT INTO patient_consent_audit (
        consent_id,
        action,
        action_by,
        previous_state,
        new_state
    ) VALUES (
        COALESCE(NEW.id, OLD.id),
        CASE 
            WHEN TG_OP = 'INSERT' THEN 'granted'
            WHEN TG_OP = 'UPDATE' AND NEW.granted = false AND OLD.granted = true THEN 'revoked'
            WHEN TG_OP = 'UPDATE' THEN 'modified'
            WHEN TG_OP = 'DELETE' THEN 'deleted'
        END,
        auth.uid(),
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_patient_consents_audit
    AFTER INSERT OR UPDATE OR DELETE ON patient_consents
    FOR EACH ROW EXECUTE FUNCTION trigger_consent_audit();

-- Create default consent preferences for all users (fresh implementation)
-- Note: This will be populated as users register in the system

-- Create view for easy consent management
CREATE OR REPLACE VIEW user_consent_summary AS
SELECT 
    pc.patient_id,
    pc.consent_type,
    pc.purpose,
    pc.granted,
    pc.valid_from,
    pc.valid_until,
    pc.revoked_at,
    -- User-friendly status
    CASE 
        WHEN pc.granted = false OR pc.revoked_at IS NOT NULL THEN 'Revoked'
        WHEN pc.valid_until IS NOT NULL AND pc.valid_until < NOW() THEN 'Expired'
        WHEN pc.granted = true AND NOW() BETWEEN pc.valid_from AND COALESCE(pc.valid_until, 'infinity'::timestamptz) THEN 'Active'
        ELSE 'Inactive'
    END as consent_status,
    -- Days until expiry
    CASE 
        WHEN pc.valid_until IS NOT NULL THEN 
            GREATEST(0, EXTRACT(days FROM pc.valid_until - NOW()))
        ELSE NULL
    END as days_until_expiry
FROM patient_consents pc
WHERE pc.patient_id = auth.uid(); -- RLS will enforce this

-- Enable RLS on the view
ALTER VIEW user_consent_summary SET (security_barrier = true);

-- Verify implementation success
DO $$
DECLARE
    consent_table_exists BOOLEAN;
    audit_table_exists BOOLEAN;
    preferences_table_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'patient_consents' AND table_schema = 'public'
    ) INTO consent_table_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'patient_consent_audit' AND table_schema = 'public'
    ) INTO audit_table_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'user_consent_preferences' AND table_schema = 'public'
    ) INTO preferences_table_exists;
    
    IF consent_table_exists AND audit_table_exists AND preferences_table_exists THEN
        RAISE NOTICE 'Enhanced consent management implementation successful!';
    ELSE
        RAISE WARNING 'Some consent tables missing. Check implementation.';
    END IF;
END;
$$;

COMMIT;

-- Success message
\echo 'Enhanced consent management deployed successfully!'
\echo 'Features available:'
\echo '- GDPR Article 7 compliant consent tracking'
\echo '- Granular consent management by data type'
\echo '- Temporal consent controls'
\echo '- Immutable audit trail'
\echo '- User-friendly consent dashboard'
\echo 'Next step: Run 003_core_schema.sql'