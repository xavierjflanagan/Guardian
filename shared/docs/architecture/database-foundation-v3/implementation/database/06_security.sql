-- =============================================================================
-- FRESH START BLUEPRINT: 06_security.sql
-- Enhanced Consent Management & Comprehensive RLS Policies
-- =============================================================================
-- Purpose: GDPR-compliant consent management, advanced security policies, and data protection
-- Dependencies: 01_foundations.sql, 02_profiles.sql, 03_clinical_core.sql, 04_ai_processing.sql, 05_healthcare_journey.sql
-- Tables: 3 Enhanced Consent Management + Comprehensive RLS Policy Framework

BEGIN;

-- =============================================================================
-- DEPENDENCY VALIDATION
-- =============================================================================

DO $$
BEGIN
    -- Verify semantic architecture dependencies
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clinical_narratives') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: clinical_narratives table not found. Run 03_clinical_core.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shell_files') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: shell_files table not found. Run 03_clinical_core.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'provider_registry') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: provider_registry table not found. Run 05_healthcare_journey.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_profile_access') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: has_profile_access() function not found. Run 02_profiles.sql first.';
    END IF;
END $$;

-- =============================================================================
-- SECTION 1: ENHANCED CONSENT MANAGEMENT (3 TABLES)
-- =============================================================================

-- GDPR-compliant patient consent management
CREATE TABLE IF NOT EXISTS patient_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    
    -- Consent Classification
    consent_type TEXT NOT NULL CHECK (consent_type IN (
        'data_processing', 'data_sharing', 'marketing_communications', 'research_participation',
        'telehealth_services', 'emergency_contact', 'provider_access', 'ai_processing',
        'data_export', 'third_party_integration', 'analytics_processing'
    )),
    consent_category TEXT NOT NULL CHECK (consent_category IN (
        'essential', 'functional', 'analytical', 'marketing', 'research'
    )),
    
    -- Consent Status and Details
    consent_status TEXT NOT NULL CHECK (consent_status IN (
        'granted', 'denied', 'withdrawn', 'expired', 'pending'
    )),
    consent_given_at TIMESTAMPTZ,
    consent_withdrawn_at TIMESTAMPTZ,
    consent_expiry_date TIMESTAMPTZ, -- For time-limited consents
    
    -- GDPR Article 7 Requirements - Demonstrable Consent
    consent_method TEXT NOT NULL CHECK (consent_method IN (
        'explicit_opt_in', 'digital_signature', 'verbal_recorded', 'written_form',
        'checkbox_consent', 'biometric_consent', 'guardian_consent'
    )),
    consent_evidence JSONB, -- Evidence of consent (signature, recording reference, etc.)
    consent_witness TEXT, -- For verbal or witnessed consents
    
    -- Granular Consent Details
    purpose_description TEXT NOT NULL, -- Clear description of what data is used for
    data_categories TEXT[] NOT NULL, -- Types of data this consent covers
    processing_activities TEXT[] NOT NULL, -- Specific processing activities consented to
    data_recipients TEXT[], -- Who data may be shared with under this consent
    retention_period TEXT, -- How long data will be retained under this consent
    
    -- Legal Basis and Compliance
    legal_basis TEXT NOT NULL CHECK (legal_basis IN (
        'consent', 'contract', 'legal_obligation', 'vital_interests', 
        'public_task', 'legitimate_interests'
    )),
    legitimate_interest_assessment TEXT, -- If legal basis is legitimate interests
    privacy_policy_version TEXT, -- Version of privacy policy when consent given
    terms_of_service_version TEXT,
    
    -- Consent Tracking Context
    ip_address INET, -- IP address when consent given (for audit)
    user_agent TEXT, -- Browser/app info when consent given
    session_context JSONB, -- Additional context about consent session
    
    -- Guardian/Proxy Consent (for children, dependents)
    proxy_consent_given BOOLEAN DEFAULT FALSE,
    proxy_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Guardian who gave consent
    proxy_relationship TEXT, -- Relationship to patient
    proxy_authority_verified BOOLEAN DEFAULT FALSE,
    
    -- Provider-Specific Consents
    provider_id UUID REFERENCES provider_registry(id), -- If consent is provider-specific
    provider_access_scope TEXT[], -- Specific access permissions granted to provider
    
    -- Audit and lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);

-- Patient consent audit trail (GDPR Article 5.2 - Accountability)
CREATE TABLE IF NOT EXISTS patient_consent_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consent_id UUID NOT NULL REFERENCES patient_consents(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE, -- Denormalized for performance
    
    -- Audit Event Details
    audit_event_type TEXT NOT NULL CHECK (audit_event_type IN (
        'consent_granted', 'consent_modified', 'consent_withdrawn', 'consent_expired',
        'consent_renewed', 'consent_challenged', 'consent_verified', 'access_under_consent'
    )),
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Change Details
    previous_status TEXT,
    new_status TEXT,
    changes_made JSONB, -- Detailed record of what changed
    change_reason TEXT NOT NULL, -- Why the change was made
    
    -- Actor and Context
    changed_by UUID REFERENCES auth.users(id), -- Who made the change
    actor_type TEXT CHECK (actor_type IN (
        'patient_self', 'patient_guardian', 'healthcare_provider', 'system_automated', 'admin_user'
    )),
    system_context TEXT, -- System or process that triggered the change
    
    -- Legal and Compliance Context
    legal_basis_for_change TEXT,
    notification_sent BOOLEAN DEFAULT FALSE, -- Was patient notified of this change
    notification_method TEXT,
    notification_timestamp TIMESTAMPTZ,
    
    -- Technical Context
    ip_address INET,
    user_agent TEXT,
    session_id UUID,
    
    -- Evidence and Documentation
    supporting_documentation TEXT[], -- References to supporting documents
    audit_evidence JSONB, -- Technical evidence of the audit event
    
    -- Compliance and Validation
    gdpr_compliance_validated BOOLEAN DEFAULT FALSE,
    validation_method TEXT,
    validator_id UUID REFERENCES auth.users(id),
    
    -- Audit metadata
    audit_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User consent preferences and granular settings
CREATE TABLE IF NOT EXISTS user_consent_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE, -- Profile-specific preferences
    
    -- Communication Preferences
    marketing_emails BOOLEAN DEFAULT FALSE,
    product_updates BOOLEAN DEFAULT TRUE,
    security_notifications BOOLEAN DEFAULT TRUE,
    emergency_communications BOOLEAN DEFAULT TRUE,
    research_invitations BOOLEAN DEFAULT FALSE,
    
    -- Data Processing Preferences
    ai_processing_consent BOOLEAN DEFAULT TRUE,
    analytics_processing BOOLEAN DEFAULT FALSE,
    performance_monitoring BOOLEAN DEFAULT TRUE,
    error_reporting BOOLEAN DEFAULT TRUE,
    usage_analytics BOOLEAN DEFAULT FALSE,
    
    -- Sharing and Integration Preferences
    provider_data_sharing BOOLEAN DEFAULT TRUE,
    emergency_data_sharing BOOLEAN DEFAULT TRUE,
    research_data_sharing BOOLEAN DEFAULT FALSE,
    third_party_integrations BOOLEAN DEFAULT FALSE,
    family_member_sharing BOOLEAN DEFAULT FALSE,
    
    -- Advanced Privacy Settings
    data_minimization_preference TEXT DEFAULT 'standard' CHECK (data_minimization_preference IN (
        'minimal', 'standard', 'comprehensive'
    )),
    retention_preference TEXT DEFAULT 'standard' CHECK (retention_preference IN (
        'minimal_retention', 'standard', 'extended_retention'
    )),
    anonymization_preference TEXT DEFAULT 'pseudonymized' CHECK (anonymization_preference IN (
        'identified', 'pseudonymized', 'anonymized'
    )),
    
    -- Consent Management Preferences
    consent_reminder_frequency TEXT DEFAULT 'annual' CHECK (consent_reminder_frequency IN (
        'never', 'quarterly', 'biannual', 'annual'
    )),
    auto_renewal_enabled BOOLEAN DEFAULT FALSE,
    granular_control_preferred BOOLEAN DEFAULT TRUE,
    
    -- Legal and Regional Settings
    jurisdiction TEXT DEFAULT 'australia', -- Legal jurisdiction for data protection
    privacy_regulation TEXT DEFAULT 'privacy_act_1988' CHECK (privacy_regulation IN (
        'privacy_act_1988', 'gdpr', 'hipaa', 'ccpa', 'pipeda'
    )),
    
    -- Notification and Communication Settings
    preferred_contact_method TEXT DEFAULT 'email' CHECK (preferred_contact_method IN (
        'email', 'sms', 'phone', 'postal_mail', 'secure_message'
    )),
    language_preference TEXT DEFAULT 'en',
    accessible_format_required BOOLEAN DEFAULT FALSE,
    
    -- Emergency and Special Circumstances
    emergency_override_consent BOOLEAN DEFAULT TRUE,
    life_threatening_data_sharing BOOLEAN DEFAULT TRUE,
    unconscious_patient_consent BOOLEAN DEFAULT TRUE,
    
    -- Audit and lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_reviewed_at TIMESTAMPTZ DEFAULT NOW(),
    next_review_due TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 year'),
    
    UNIQUE(user_id, profile_id)
);

-- =============================================================================
-- SECTION 2: COMPREHENSIVE RLS POLICIES FOR SEMANTIC ARCHITECTURE
-- =============================================================================

-- Enhanced profile access security function (semantic architecture aware)
CREATE OR REPLACE FUNCTION has_semantic_data_access(
    p_user_id UUID, 
    p_profile_id UUID,
    p_resource_type TEXT DEFAULT 'general'
) RETURNS BOOLEAN AS $$
DECLARE
    has_basic_access BOOLEAN;
    consent_status BOOLEAN DEFAULT TRUE;
    provider_access BOOLEAN DEFAULT FALSE;
BEGIN
    -- Check profile access including delegated permissions
    -- Use 'read' level for basic semantic data access
    SELECT has_profile_access_level(p_user_id, p_profile_id, 'read') INTO has_basic_access;
    
    IF NOT has_basic_access THEN
        RETURN FALSE;
    END IF;
    
    -- Check consent for specific resource types
    IF p_resource_type IN ('ai_processing', 'narrative_data', 'semantic_analysis') THEN
        SELECT COUNT(*) > 0 INTO consent_status
        FROM patient_consents pc
        WHERE pc.patient_id = p_profile_id
        AND pc.consent_type = 'ai_processing'
        AND pc.consent_status = 'granted'
        AND (pc.consent_expiry_date IS NULL OR pc.consent_expiry_date > NOW());
        
        IF NOT consent_status THEN
            RETURN FALSE;
        END IF;
    END IF;
    
    -- Check provider access if user is a healthcare provider
    IF EXISTS (SELECT 1 FROM provider_registry pr WHERE pr.user_id = p_user_id AND pr.active = TRUE) THEN
        SELECT COUNT(*) > 0 INTO provider_access
        FROM patient_provider_access ppa
        JOIN provider_registry pr ON pr.id = ppa.provider_id
        WHERE ppa.patient_id = p_profile_id
        AND pr.user_id = p_user_id
        AND ppa.relationship_status = 'active'
        AND ppa.patient_consent_given = TRUE;
        
        RETURN provider_access;
    END IF;
    
    RETURN has_basic_access AND consent_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- SECTION 3: RLS POLICIES FOR SEMANTIC ARCHITECTURE TABLES
-- =============================================================================

-- Shell Files RLS Policies
CREATE POLICY shell_files_profile_access ON shell_files
    FOR ALL USING (has_semantic_data_access(auth.uid(), patient_id, 'shell_file'));

-- Clinical Narratives RLS Policies  
CREATE POLICY clinical_narratives_profile_access ON clinical_narratives
    FOR ALL USING (has_semantic_data_access(auth.uid(), patient_id, 'narrative_data'));

-- Clinical Narrative Linking Tables RLS Policies
CREATE POLICY narrative_condition_links_access ON narrative_condition_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_condition_links.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    );

CREATE POLICY narrative_medication_links_access ON narrative_medication_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_medication_links.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    );

CREATE POLICY narrative_allergy_links_access ON narrative_allergy_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_allergy_links.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    );

CREATE POLICY narrative_immunization_links_access ON narrative_immunization_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_immunization_links.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    );

CREATE POLICY narrative_vital_links_access ON narrative_vital_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_vital_links.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    );

-- Narrative Source Mappings RLS Policy
CREATE POLICY narrative_source_mappings_access ON narrative_source_mappings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM clinical_narratives cn
            WHERE cn.id = narrative_source_mappings.narrative_id
            AND has_semantic_data_access(auth.uid(), cn.patient_id, 'narrative_data')
        )
    );

-- =============================================================================
-- SECTION 4: RLS POLICIES FOR AI PROCESSING TABLES
-- =============================================================================

-- Semantic Processing Sessions RLS Policies
CREATE POLICY semantic_processing_sessions_access ON semantic_processing_sessions
    FOR ALL USING (has_semantic_data_access(auth.uid(), patient_id, 'ai_processing'));

-- Narrative Creation Audit RLS Policies
CREATE POLICY narrative_creation_audit_access ON narrative_creation_audit
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM semantic_processing_sessions sps
            WHERE sps.id = narrative_creation_audit.semantic_processing_session_id
            AND has_semantic_data_access(auth.uid(), sps.patient_id, 'ai_processing')
        )
    );

-- Shell File Synthesis Results RLS Policies
CREATE POLICY shell_file_synthesis_results_access ON shell_file_synthesis_results
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM shell_files sf
            WHERE sf.id = shell_file_synthesis_results.shell_file_id
            AND has_semantic_data_access(auth.uid(), sf.patient_id, 'ai_processing')
        )
    );

-- Dual Lens User Preferences RLS Policies
CREATE POLICY dual_lens_user_preferences_owner ON dual_lens_user_preferences
    FOR ALL USING (
        user_id = auth.uid() 
        OR (profile_id IS NOT NULL AND has_profile_access(auth.uid(), profile_id))
    );

-- Narrative View Cache RLS Policies
CREATE POLICY narrative_view_cache_profile_access ON narrative_view_cache
    FOR ALL USING (has_profile_access(auth.uid(), profile_id));

-- =============================================================================
-- SECTION 5: RLS POLICIES FOR HEALTHCARE PROVIDER TABLES
-- =============================================================================

-- Provider Registry RLS Policies (providers can see their own data + basic info for others)
CREATE POLICY provider_registry_self_access ON provider_registry
    FOR ALL USING (
        id = auth.uid() -- Provider accessing their own record
        OR verification_status = 'full_verified' -- Public directory access for verified providers
        OR is_admin() -- Admin access
    );

-- Patient Provider Access RLS Policies
CREATE POLICY patient_provider_access_patient_view ON patient_provider_access
    FOR ALL USING (
        has_profile_access(auth.uid(), patient_id) -- Patient can see their provider relationships
        OR provider_id = auth.uid() -- Provider can see their patient relationships
        OR is_admin() -- Admin access
    );

-- Provider Access Log RLS Policies (patients can see access to their data, providers can see their access logs)
CREATE POLICY provider_access_log_patient_provider_access ON provider_access_log
    FOR SELECT USING (
        has_profile_access(auth.uid(), patient_id) -- Patient can see access logs for their data
        OR provider_id = auth.uid() -- Provider can see their access logs
        OR is_admin() -- Admin access
    );

-- Provider Action Items RLS Policies
CREATE POLICY provider_action_items_access ON provider_action_items
    FOR ALL USING (
        has_profile_access(auth.uid(), patient_id) -- Patient can see their action items
        OR provider_id = auth.uid() -- Provider can see action items they created
        OR assigned_to = auth.uid() -- Provider can see action items assigned to them
        OR is_admin()
    );

-- Provider Clinical Notes RLS Policies
CREATE POLICY provider_clinical_notes_access ON provider_clinical_notes
    FOR ALL USING (
        has_profile_access(auth.uid(), patient_id) -- Patient can see their clinical notes
        OR provider_id = auth.uid() -- Provider can see notes they created
        OR is_admin()
    );

-- Clinical Alert Rules RLS Policies (read-only for providers, admin only for modifications)
CREATE POLICY clinical_alert_rules_provider_read ON clinical_alert_rules
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM provider_registry WHERE id = auth.uid() AND active = TRUE)
        OR is_admin()
    );

CREATE POLICY clinical_alert_rules_admin_modify ON clinical_alert_rules
    FOR INSERT, UPDATE, DELETE USING (is_admin());

-- Healthcare Provider Context RLS Policies
CREATE POLICY healthcare_provider_context_self_access ON healthcare_provider_context
    FOR ALL USING (
        provider_id = auth.uid() -- Provider accessing their own context
        OR is_admin() -- Admin access
    );

-- =============================================================================
-- SECTION 6: RLS POLICIES FOR CONSENT MANAGEMENT TABLES
-- =============================================================================

-- Patient Consents RLS Policies
CREATE POLICY patient_consents_profile_access ON patient_consents
    FOR ALL USING (
        has_profile_access(auth.uid(), patient_id) -- Patient/guardian can manage their consents
        OR (provider_id IS NOT NULL AND provider_id = auth.uid()) -- Provider-specific consent access
        OR is_admin()
    );

-- Patient Consent Audit RLS Policies
CREATE POLICY patient_consent_audit_profile_access ON patient_consent_audit
    FOR SELECT USING (
        has_profile_access(auth.uid(), patient_id) -- Patient can see their consent audit trail
        OR is_admin()
    );

-- User Consent Preferences RLS Policies  
CREATE POLICY user_consent_preferences_owner ON user_consent_preferences
    FOR ALL USING (
        user_id = auth.uid()
        OR (profile_id IS NOT NULL AND has_profile_access(auth.uid(), profile_id))
    );

-- =============================================================================
-- SECTION 7: SECURITY INDEXES
-- =============================================================================

-- Consent management indexes
CREATE INDEX IF NOT EXISTS idx_patient_consents_patient ON patient_consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_type_status ON patient_consents(consent_type, consent_status);
CREATE INDEX IF NOT EXISTS idx_patient_consents_expiry ON patient_consents(consent_expiry_date) WHERE consent_expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_consents_provider ON patient_consents(provider_id) WHERE provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_consent_audit_consent ON patient_consent_audit(consent_id);
CREATE INDEX IF NOT EXISTS idx_patient_consent_audit_patient ON patient_consent_audit(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_consent_audit_timestamp ON patient_consent_audit(event_timestamp);
CREATE INDEX IF NOT EXISTS idx_patient_consent_audit_type ON patient_consent_audit(audit_event_type);

CREATE INDEX IF NOT EXISTS idx_user_consent_preferences_user ON user_consent_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consent_preferences_profile ON user_consent_preferences(profile_id) WHERE profile_id IS NOT NULL;

-- Security function performance indexes
CREATE INDEX IF NOT EXISTS idx_shell_files_patient_active ON shell_files(patient_id) WHERE status != 'archived';
CREATE INDEX IF NOT EXISTS idx_clinical_narratives_patient_active ON clinical_narratives(patient_id, created_at DESC);

COMMIT;

-- =============================================================================
-- SECURITY DEPLOYMENT VALIDATION
-- =============================================================================

DO $$
DECLARE
    table_count INTEGER;
    policy_count INTEGER;
    function_count INTEGER;
    index_count INTEGER;
BEGIN
    -- Count consent management tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_name IN (
        'patient_consents', 'patient_consent_audit', 'user_consent_preferences'
    ) AND table_schema = 'public';
    
    -- Count RLS policies created (focusing on new semantic architecture policies)
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND (tablename LIKE '%narrative%' OR tablename LIKE '%shell%' OR tablename LIKE '%consent%' OR tablename LIKE '%provider%');
    
    -- Count security functions
    SELECT COUNT(*) INTO function_count
    FROM pg_proc 
    WHERE proname IN ('has_semantic_data_access');
    
    -- Count security-related indexes
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND (indexname LIKE '%consent%' OR indexname LIKE '%patient_active%');
    
    IF table_count >= 3 AND policy_count >= 15 AND function_count >= 1 THEN
        RAISE NOTICE '✅ Security and consent management deployment successful!';
        RAISE NOTICE '  - Tables: %/3, Policies: %/15+, Functions: %/1, Indexes: %/8+', 
            table_count, policy_count, function_count, index_count;
        RAISE NOTICE '  - GDPR-compliant consent management implemented';
        RAISE NOTICE '  - Comprehensive RLS policies for semantic architecture';
        RAISE NOTICE '  - Healthcare provider access controls deployed';
        RAISE NOTICE '  - Enhanced audit trails and security functions active';
    ELSE
        RAISE WARNING 'Security deployment incomplete:';
        RAISE WARNING '  - Tables: %/3, Policies: %/15+, Functions: %/1, Indexes: %/8+', 
            table_count, policy_count, function_count, index_count;
    END IF;
END $$;

-- =============================================================================
-- FRESH START BLUEPRINT: 06_security.sql COMPLETE
-- =============================================================================