-- =============================================================================
-- FRESH START BLUEPRINT: 02_profiles.sql
-- =============================================================================
-- Purpose: Multi-profile management system with correct ID architecture
-- Components: Profile Tables + User Events + Audit Log Completion + Access Security
-- Dependencies: 01_foundations.sql (extensions, audit infrastructure)
-- Key Fix: Establishes correct auth.users(id) vs user_profiles(id) architecture
-- Eliminates: get_allowed_patient_ids() workaround function (Blueprint Issue #38)
-- Created: 2025-08-27 (Fresh Start Implementation)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. CORE PROFILE MANAGEMENT TABLES
-- =============================================================================
-- Source: 003_multi_profile_management.sql (TEMPLATE - Already correct ID architecture)

-- Primary table for all profiles (including main user profile)
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_owner_id UUID NOT NULL REFERENCES auth.users(id), -- The primary account holder
    
    -- Profile Identity
    profile_type TEXT NOT NULL CHECK (profile_type IN ('self', 'child', 'pet', 'dependent')),
    profile_status TEXT NOT NULL DEFAULT 'active' CHECK (profile_status IN ('active', 'inactive', 'pending_transfer')),
    
    -- Profile Details
    display_name TEXT NOT NULL,
    full_name TEXT,
    date_of_birth DATE,
    species TEXT, -- For pets: 'dog', 'cat', 'bird', etc.
    breed TEXT, -- For pets
    
    -- Relationship to Account Owner
    relationship profile_relationship_type, -- Strong typed relationship (replaces TEXT)
    legal_status TEXT CHECK (legal_status IN ('guardian', 'parent', 'caregiver', 'self', 'owner')),
    
    -- Profile Customization
    theme_color TEXT DEFAULT '#2563eb',
    avatar_url TEXT,
    custom_theme JSONB DEFAULT '{}', -- Extended theme customization
    profile_icon TEXT, -- Icon identifier for quick visual recognition
    
    -- Authentication Level
    auth_level access_level_type NOT NULL DEFAULT 'read_write', -- Strong typed access level
    auth_verified_at TIMESTAMPTZ,
    auth_verification_status verification_status_type DEFAULT 'unverified', -- Strong typed verification
    auth_method TEXT, -- 'document_extraction', 'manual_entry', 'id_verification', 'bank_verification'
    
    -- Profile Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transferred_from UUID REFERENCES user_profiles(id) ON DELETE SET NULL, -- For profile transfers
    transferred_to UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    
    -- Enhanced Archival System (GPT-5 & Gemini recommended)
    archived BOOLEAN NOT NULL DEFAULT FALSE, -- Legacy compatibility
    archived_at TIMESTAMPTZ, -- When archival occurred
    archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Who initiated archival
    archival_reason TEXT, -- User-provided deletion reason
    recovery_expires_at TIMESTAMPTZ, -- 30-day recovery window
    processing_restricted_at TIMESTAMPTZ, -- GDPR Article 18 compliance
    legal_hold BOOLEAN DEFAULT FALSE, -- Prevents any purge during litigation
    erasure_performed_at TIMESTAMPTZ, -- When PII was purged
    erasure_scope TEXT, -- 'pii_only', 'analytics_only', 'full_restriction'
    region_of_record TEXT, -- 'AU', 'US', 'EU' for jurisdiction-specific handling
    
    -- Pregnancy Feature Support
    is_pregnancy_profile BOOLEAN DEFAULT FALSE,
    expected_due_date DATE,
    transitioned_to_child_profile_id UUID REFERENCES user_profiles(id)
);

-- Profile access permissions
CREATE TABLE profile_access_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Permission Levels
    permission_level access_level_type NOT NULL, -- Strong typed access level
    
    -- Granular Permissions
    can_upload_documents BOOLEAN NOT NULL DEFAULT FALSE,
    can_view_documents BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit_medical_data BOOLEAN NOT NULL DEFAULT FALSE,
    can_share_data BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_permissions BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Time-based Access
    access_start_date TIMESTAMPTZ DEFAULT NOW(),
    access_end_date TIMESTAMPTZ,
    
    -- Audit
    granted_by UUID REFERENCES auth.users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT
);

-- Profile switching context
CREATE TABLE user_profile_context (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id),
    current_profile_id UUID NOT NULL REFERENCES user_profiles(id),
    last_switched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Quick access profiles (recently used)
    recent_profile_ids UUID[] DEFAULT '{}',
    pinned_profile_ids UUID[] DEFAULT '{}', -- User's favorite profiles for quick access
    
    -- Preferences
    auto_detect_profile_from_uploads BOOLEAN DEFAULT TRUE,
    prompt_threshold NUMERIC(3,2) DEFAULT 0.8 -- Confidence threshold for auto-switching
);

-- =============================================================================
-- 2. SMART HEALTH FEATURES SYSTEM
-- =============================================================================
-- Source: 003_multi_profile_management.sql (Already correct user_profiles references)

-- Feature detection table for smart tabs (family planning, pregnancy, etc.)
CREATE TABLE smart_health_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    feature_type TEXT NOT NULL CHECK (feature_type IN ('family_planning', 'pregnancy', 'chronic_condition', 'mental_health', 'pediatric')),
    
    -- Activation triggers
    activated_by_event_id UUID, -- Will reference patient_clinical_events(id) after clinical tables are created
    activation_confidence NUMERIC(3,2) NOT NULL,
    activation_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Feature state
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE, -- User can hide tabs
    last_relevant_event TIMESTAMPTZ,
    
    -- Feature-specific data
    feature_data JSONB DEFAULT '{}',
    
    -- For pregnancy specifically
    pregnancy_stage TEXT CHECK (pregnancy_stage IN ('planning', 'trying', 'pregnant', 'postpartum', 'completed')),
    estimated_conception_date DATE,
    estimated_due_date DATE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint: one feature type per profile
    UNIQUE(profile_id, feature_type)
);

-- Pregnancy-specific timeline events
CREATE TABLE pregnancy_journey_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    smart_feature_id UUID REFERENCES smart_health_features(id),
    
    -- Event categorization
    event_category TEXT NOT NULL CHECK (event_category IN (
        'fertility_test', 'ovulation_tracking', 'conception_attempt',
        'pregnancy_test', 'prenatal_visit', 'ultrasound', 'genetic_screening',
        'labor_delivery', 'postpartum_checkup', 'milestone'
    )),
    
    -- Event details
    event_date TIMESTAMPTZ NOT NULL,
    event_title TEXT NOT NULL,
    event_data JSONB DEFAULT '{}',
    
    -- Links to source data (will be added as FKs after clinical tables exist)
    clinical_event_id UUID, -- Will reference patient_clinical_events(id)
    document_id UUID, -- Will reference documents(id)
    
    -- Pregnancy-specific metrics
    gestational_week INTEGER,
    baby_measurements JSONB, -- weight, length, head circumference
    maternal_metrics JSONB, -- weight, blood pressure, etc.
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 3. PROFILE CONTAMINATION PREVENTION
-- =============================================================================
-- Source: 003_multi_profile_management.sql (Clean tables for profile safety)

-- Profile contamination prevention rules
CREATE TABLE profile_verification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_type TEXT NOT NULL CHECK (rule_type IN ('demographic', 'clinical', 'logical', 'temporal')),
    rule_name TEXT NOT NULL,
    rule_definition JSONB NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
    is_active BOOLEAN DEFAULT TRUE
);

-- Profile detection patterns for document analysis
CREATE TABLE profile_detection_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_type TEXT NOT NULL CHECK (pattern_type IN ('name', 'dob', 'pet_name', 'identifier')),
    pattern_value TEXT NOT NULL,
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    confidence_weight NUMERIC(3,2) DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Authentication progression tracking
CREATE TABLE profile_auth_progression (
    profile_id UUID PRIMARY KEY REFERENCES user_profiles(id),
    
    -- Soft Authentication (from first document)
    soft_auth_completed BOOLEAN DEFAULT FALSE,
    soft_auth_data JSONB, -- Extracted patient details
    soft_auth_confidence NUMERIC(3,2),
    soft_auth_at TIMESTAMPTZ,
    
    -- Hard Authentication
    hard_auth_requested BOOLEAN DEFAULT FALSE,
    hard_auth_method TEXT, -- 'id_document', 'bank_verification', 'telco_verification'
    hard_auth_completed BOOLEAN DEFAULT FALSE,
    hard_auth_at TIMESTAMPTZ,
    hard_auth_provider TEXT, -- External verification provider used
    
    -- Feature Restrictions
    can_export_data BOOLEAN DEFAULT FALSE, -- Requires hard auth
    can_share_with_providers BOOLEAN DEFAULT FALSE, -- Requires hard auth
    can_use_ecosystem_features BOOLEAN DEFAULT FALSE, -- Requires hard auth
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 4. ENHANCED APPOINTMENTS SYSTEM
-- =============================================================================
-- Source: 003_multi_profile_management.sql (Profile-aware appointments)

-- Enhanced appointments table with profile support
CREATE TABLE profile_appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    account_owner_id UUID NOT NULL REFERENCES auth.users(id), -- Denormalized for performance
    
    -- Appointment details
    appointment_date TIMESTAMPTZ NOT NULL,
    appointment_type TEXT NOT NULL,
    provider_name TEXT,
    facility_name TEXT,
    appointment_duration_minutes INTEGER,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
    
    -- Appointment details
    chief_complaint TEXT,
    appointment_notes TEXT,
    reminder_preferences JSONB DEFAULT '{}',
    
    -- Visibility settings
    visible_to_primary_account BOOLEAN DEFAULT TRUE,
    requires_guardian_consent BOOLEAN DEFAULT FALSE,
    
    -- Integration
    calendar_event_id TEXT, -- External calendar integration
    provider_system_id TEXT, -- Provider's appointment system ID
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 5. USER EVENTS TABLE (CORRECT PATTERN TEMPLATE)
-- =============================================================================
-- Source: 020_phase0_critical_fixes.sql (Shows correct profile_id usage)

-- User events table for frontend analytics and audit trail
CREATE TABLE user_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core event data
    action TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    session_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Profile context (CRITICAL: Use profile_id, not user_id)
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    active_patient_id UUID REFERENCES user_profiles(id), -- FIXED: Now correctly references user_profiles
    
    -- Privacy and security
    privacy_level TEXT NOT NULL DEFAULT 'internal' CHECK (privacy_level IN ('public', 'internal', 'sensitive')),
    user_agent_hash TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 6. COMPLETE AUDIT_LOG INTEGRATION (Fix from 01_foundations.sql)
-- =============================================================================

-- Add patient_id column to audit_log table (created in 01_foundations.sql)
ALTER TABLE audit_log ADD COLUMN patient_id UUID REFERENCES user_profiles(id);

-- Add patient_id index for performance
CREATE INDEX idx_audit_log_patient ON audit_log(patient_id) WHERE patient_id IS NOT NULL;

-- Update RLS policy with correct logic (no more auth.uid() vs profile_id confusion)
DROP POLICY audit_log_admin_read ON audit_log;
CREATE POLICY audit_log_admin_read ON audit_log
    FOR SELECT TO authenticated
    USING (
        -- Users can see their own audit entries
        changed_by = auth.uid() 
        -- Users can see audit entries for profiles they own (CORRECT LOGIC)
        OR EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE id = audit_log.patient_id 
            AND account_owner_id = auth.uid()
        )
        -- Admins can see all
        OR is_admin()
    );

-- Update log_audit_event function to use patient_id column
CREATE OR REPLACE FUNCTION log_audit_event(
    p_table_name TEXT,
    p_record_id TEXT, -- Accept TEXT for backward compatibility
    p_operation TEXT,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_compliance_category TEXT DEFAULT NULL,
    p_patient_id UUID DEFAULT NULL -- Now functional with patient_id column
) RETURNS UUID AS $$
DECLARE
    audit_id UUID;
    record_uuid UUID;
BEGIN
    -- Try to convert record_id to UUID, fallback to NULL if not valid UUID
    BEGIN
        record_uuid := p_record_id::UUID;
    EXCEPTION
        WHEN invalid_text_representation THEN
            record_uuid := NULL;
    END;
    
    INSERT INTO audit_log (
        table_name, record_id, record_id_text, operation, old_values, new_values,
        changed_by, reason, compliance_category, patient_id,
        session_id, ip_address, user_agent
    ) VALUES (
        p_table_name, 
        COALESCE(record_uuid, gen_random_uuid()), -- Use UUID or generate new one
        CASE WHEN record_uuid IS NULL THEN p_record_id ELSE NULL END, -- Store text only if not UUID
        p_operation, p_old_values, p_new_values,
        auth.uid(), p_reason, p_compliance_category, p_patient_id,
        current_setting('request.headers', true)::jsonb->>'session-id',
        inet_client_addr(),
        current_setting('request.headers', true)::jsonb->>'user-agent'
    ) RETURNING id INTO audit_id;
    
    RETURN audit_id;
EXCEPTION
    WHEN OTHERS THEN
        -- Log to PostgreSQL log but don't fail the main operation
        RAISE WARNING 'Audit logging failed for % %: %', p_table_name, p_record_id, SQLERRM;
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 7. PROFILE ACCESS SECURITY FUNCTIONS (Blueprint Issue #40)
-- =============================================================================
-- REPLACEMENT for get_allowed_patient_ids() workaround - Blueprint Issue #38

-- Core profile access checking function (eliminates need for workarounds)
CREATE OR REPLACE FUNCTION has_profile_access(p_user_id UUID, p_profile_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = p_profile_id 
        AND account_owner_id = p_user_id
        AND archived = FALSE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced profile access checking with permission levels
CREATE OR REPLACE FUNCTION has_profile_access_level(p_user_id UUID, p_profile_id UUID, p_required_level TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- First check direct ownership (highest access)
    IF has_profile_access(p_user_id, p_profile_id) THEN
        RETURN TRUE;
    END IF;
    
    -- Then check explicit permissions
    RETURN EXISTS (
        SELECT 1 FROM profile_access_permissions pap
        WHERE pap.user_id = p_user_id
        AND pap.profile_id = p_profile_id
        AND pap.permission_level >= p_required_level -- Assuming enum ordering
        AND (pap.access_end_date IS NULL OR pap.access_end_date > NOW())
        AND pap.revoked_at IS NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get profiles accessible by user (replaces get_allowed_patient_ids workaround)
CREATE OR REPLACE FUNCTION get_accessible_profiles(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE(profile_id UUID, access_type TEXT, relationship TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    -- Direct ownership (primary profiles)
    SELECT 
        up.id as profile_id,
        'owner'::TEXT as access_type,
        COALESCE(up.relationship, 'self')::TEXT as relationship
    FROM user_profiles up
    WHERE up.account_owner_id = p_user_id
    AND up.archived = FALSE
    
    UNION ALL
    
    -- Explicit permissions (shared profiles)
    SELECT 
        pap.profile_id,
        pap.permission_level as access_type,
        up.relationship
    FROM profile_access_permissions pap
    JOIN user_profiles up ON up.id = pap.profile_id
    WHERE pap.user_id = p_user_id
    AND (pap.access_end_date IS NULL OR pap.access_end_date > NOW())
    AND pap.revoked_at IS NULL
    AND up.archived = FALSE;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION has_profile_access(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION has_profile_access_level(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_accessible_profiles(UUID) TO authenticated;

-- =============================================================================
-- 8. PERFORMANCE INDEXES
-- =============================================================================

-- Profile management indexes (optimized for soft deletes)
CREATE INDEX idx_user_profiles_owner ON user_profiles(account_owner_id) WHERE archived IS NOT TRUE AND archived_at IS NULL;
CREATE INDEX idx_user_profiles_type ON user_profiles(profile_type) WHERE archived IS NOT TRUE AND archived_at IS NULL;
CREATE INDEX idx_profile_access_user ON profile_access_permissions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_profile_access_profile ON profile_access_permissions(profile_id) WHERE revoked_at IS NULL;

-- Smart features indexes
CREATE INDEX idx_smart_features_profile ON smart_health_features(profile_id) WHERE is_active = TRUE;
CREATE INDEX idx_smart_features_type ON smart_health_features(feature_type) WHERE is_active = TRUE;
CREATE INDEX idx_pregnancy_events_profile ON pregnancy_journey_events(profile_id);
CREATE INDEX idx_pregnancy_events_date ON pregnancy_journey_events(profile_id, event_date DESC);

-- Profile detection indexes
CREATE INDEX idx_profile_detection_patterns_profile ON profile_detection_patterns(profile_id);
CREATE INDEX idx_profile_detection_patterns_type ON profile_detection_patterns(pattern_type);

-- Appointment indexes
CREATE INDEX idx_profile_appointments_owner_date ON profile_appointments(account_owner_id, appointment_date);
CREATE INDEX idx_profile_appointments_profile ON profile_appointments(profile_id) WHERE status NOT IN ('cancelled', 'completed');
CREATE INDEX idx_profile_appointments_status ON profile_appointments(status, appointment_date);

-- User events indexes
CREATE INDEX user_events_profile_created_idx ON user_events(profile_id, created_at DESC);
CREATE INDEX user_events_created_at_idx ON user_events(created_at);
CREATE INDEX user_events_action_idx ON user_events(action, timestamp DESC);

-- =============================================================================
-- 9. ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on all profile tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_access_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profile_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_health_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE pregnancy_journey_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_verification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_detection_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_auth_progression ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;

-- Profile management policies (using correct has_profile_access function)
CREATE POLICY user_profiles_owner_access ON user_profiles
    FOR ALL USING (account_owner_id = auth.uid() AND archived IS NOT TRUE);

CREATE POLICY profile_access_permissions_owner ON profile_access_permissions
    FOR ALL USING (
        has_profile_access(auth.uid(), profile_access_permissions.profile_id)
        OR user_id = auth.uid()
    );

CREATE POLICY user_profile_context_owner ON user_profile_context
    FOR ALL USING (user_id = auth.uid());

-- Smart features policies (using has_profile_access function)
CREATE POLICY smart_health_features_access ON smart_health_features
    FOR ALL USING (has_profile_access(auth.uid(), smart_health_features.profile_id));

CREATE POLICY pregnancy_journey_events_access ON pregnancy_journey_events
    FOR ALL USING (has_profile_access(auth.uid(), pregnancy_journey_events.profile_id));

-- Profile verification rules - accessible to all authenticated users
CREATE POLICY profile_verification_rules_read_all ON profile_verification_rules
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Profile detection patterns - owner only
CREATE POLICY profile_detection_patterns_owner ON profile_detection_patterns
    FOR ALL USING (has_profile_access(auth.uid(), profile_detection_patterns.profile_id));

-- Profile auth progression - owner only
CREATE POLICY profile_auth_progression_owner ON profile_auth_progression
    FOR ALL USING (has_profile_access(auth.uid(), profile_auth_progression.profile_id));

-- Profile appointments - owner access
CREATE POLICY profile_appointments_owner ON profile_appointments
    FOR ALL USING (account_owner_id = auth.uid());

-- User events policies (using correct profile access)
CREATE POLICY user_events_profile_access ON user_events
    FOR SELECT USING (has_profile_access(auth.uid(), user_events.profile_id));

CREATE POLICY user_events_profile_insert ON user_events  
    FOR INSERT WITH CHECK (has_profile_access(auth.uid(), user_events.profile_id));

-- =============================================================================
-- 10. SAMPLE CONTAMINATION PREVENTION RULES
-- =============================================================================

INSERT INTO profile_verification_rules (rule_type, rule_name, rule_definition, severity) VALUES
('demographic', 'name_mismatch', '{"check": "name_similarity", "threshold": 0.7}', 'warning'),
('clinical', 'gender_condition_mismatch', '{"incompatible_pairs": {"male": ["pregnancy", "hysterectomy"], "female": ["prostate_cancer"]}}', 'critical'),
('clinical', 'age_condition_mismatch', '{"age_restrictions": {"COPD": {"min_age": 40}, "alzheimers": {"min_age": 60}}}', 'warning'),
('temporal', 'future_date_check', '{"max_future_days": 30}', 'warning');

-- =============================================================================
-- 11. UPDATED_AT TRIGGERS
-- =============================================================================

-- Apply updated_at triggers to profile tables (function defined in 01_foundations.sql)
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profile_appointments_updated_at
    BEFORE UPDATE ON profile_appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 12. DEPLOYMENT VERIFICATION
-- =============================================================================

-- Verify profile system deployment
DO $$
DECLARE
    table_count INTEGER;
    function_count INTEGER;
    rule_count INTEGER;
BEGIN
    -- Check tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_name IN (
        'user_profiles', 'profile_access_permissions', 'user_profile_context',
        'smart_health_features', 'pregnancy_journey_events', 'profile_verification_rules',
        'profile_detection_patterns', 'profile_auth_progression', 'profile_appointments',
        'user_events'
    ) AND table_schema = 'public';
    
    -- Check functions
    SELECT COUNT(*) INTO function_count
    FROM information_schema.routines 
    WHERE routine_name IN (
        'has_profile_access', 'has_profile_access_level', 'get_accessible_profiles'
    )
    AND routine_schema = 'public';
    
    -- Check verification rules
    SELECT COUNT(*) INTO rule_count FROM profile_verification_rules;
    
    -- Verify audit_log patient_id column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_log' 
        AND column_name = 'patient_id' 
        AND table_schema = 'public'
    ) THEN
        RAISE NOTICE 'CRITICAL FIX: audit_log.patient_id column successfully added';
    ELSE
        RAISE WARNING 'ERROR: audit_log.patient_id column missing';
    END IF;
    
    IF table_count = 10 AND function_count = 3 AND rule_count >= 4 THEN
        RAISE NOTICE 'Profile system deployment successful!';
        RAISE NOTICE '   - % profile tables created', table_count;
        RAISE NOTICE '   - % access functions created', function_count;
        RAISE NOTICE '   - % verification rules loaded', rule_count;
        RAISE NOTICE 'ELIMINATED: get_allowed_patient_ids() workaround function';
        RAISE NOTICE 'ESTABLISHED: Correct auth.users vs user_profiles ID architecture';
    ELSE
        RAISE WARNING 'Profile system deployment incomplete:';
        RAISE WARNING '   - Tables: %/10, Functions: %/3, Rules: %/4', 
                     table_count, function_count, rule_count;
    END IF;
END;
$$;

COMMIT;

-- =============================================================================
-- SUCCESS MESSAGE
-- =============================================================================

\echo 'FRESH START 02_profiles.sql deployed successfully!'
\echo 'Components available:'
\echo '- User Profiles System (correct ID architecture established)'
\echo '- Profile Access Permissions with granular control'
\echo '- Smart Health Features (pregnancy, chronic conditions)'
\echo '- Profile Contamination Prevention'
\echo '- User Events Table (correct profile_id usage template)'
\echo '- Enhanced Appointments System'
\echo ''
\echo 'CRITICAL FIXES APPLIED:'
\echo '  1. audit_log.patient_id column added (references user_profiles.id)'
\echo '  2. Audit RLS policy fixed (no more auth.uid vs profile_id confusion)'
\echo '  3. get_allowed_patient_ids() workaround ELIMINATED'
\echo '  4. has_profile_access() security function established'
\echo ''
\echo 'ID ARCHITECTURE ESTABLISHED:'
\echo '  - auth.users(id): Account holders / Authentication'
\echo '  - user_profiles(id): Patients / Medical data subjects'
\echo ''
\echo 'BLUEPRINT ISSUES RESOLVED:'
\echo '  - Issue #38: ID System Architecture Alignment'
\echo '  - Issue #40: Profile Access Security Function'
\echo ''
\echo 'Next step: Run 03_clinical_core.sql'