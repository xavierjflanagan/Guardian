-- Guardian v7 Multi-Profile Management System Deployment
-- File: 001_multi_profile_management.sql
-- Purpose: Deploy complete multi-profile management infrastructure

BEGIN;

-- =============================================================================
-- 1. CORE PROFILE MANAGEMENT TABLES
-- =============================================================================

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
    relationship TEXT, -- 'self', 'daughter', 'son', 'mother', 'father', 'dog', 'cat', etc.
    legal_status TEXT CHECK (legal_status IN ('guardian', 'parent', 'caregiver', 'self', 'owner')),
    
    -- Profile Customization
    theme_color TEXT DEFAULT '#2563eb',
    avatar_url TEXT,
    custom_theme JSONB DEFAULT '{}', -- Extended theme customization
    profile_icon TEXT, -- Icon identifier for quick visual recognition
    
    -- Authentication Level
    auth_level TEXT NOT NULL DEFAULT 'soft' CHECK (auth_level IN ('none', 'soft', 'hard')),
    auth_verified_at TIMESTAMPTZ,
    auth_method TEXT, -- 'document_extraction', 'manual_entry', 'id_verification', 'bank_verification'
    
    -- Profile Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transferred_from UUID REFERENCES user_profiles(id), -- For profile transfers
    transferred_to UUID REFERENCES user_profiles(id),
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    
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
    permission_level TEXT NOT NULL CHECK (permission_level IN ('owner', 'full_access', 'read_write', 'read_only', 'emergency')),
    
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
-- 4. UNIFIED FAMILY APPOINTMENTS
-- =============================================================================

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
-- 5. ESSENTIAL INDEXES
-- =============================================================================

-- Profile management indexes
CREATE INDEX idx_user_profiles_owner ON user_profiles(account_owner_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_user_profiles_type ON user_profiles(profile_type) WHERE archived IS NOT TRUE;
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
CREATE INDEX idx_profile_appointments_status ON profile_appointments(status, appointment_date) WHERE appointment_date >= CURRENT_DATE;

-- =============================================================================
-- 6. ROW LEVEL SECURITY POLICIES
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

-- Profile management policies
CREATE POLICY user_profiles_owner_access ON user_profiles
    FOR ALL USING (account_owner_id = auth.uid() AND archived IS NOT TRUE);

CREATE POLICY profile_access_permissions_owner ON profile_access_permissions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles up 
            WHERE up.id = profile_access_permissions.profile_id 
            AND up.account_owner_id = auth.uid()
        )
        OR user_id = auth.uid()
    );

CREATE POLICY user_profile_context_owner ON user_profile_context
    FOR ALL USING (user_id = auth.uid());

-- Smart features policies (will need profile access function after core schema)
CREATE POLICY smart_health_features_basic_access ON smart_health_features
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles up 
            WHERE up.id = smart_health_features.profile_id 
            AND up.account_owner_id = auth.uid()
        )
    );

CREATE POLICY pregnancy_journey_events_basic_access ON pregnancy_journey_events
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles up 
            WHERE up.id = pregnancy_journey_events.profile_id 
            AND up.account_owner_id = auth.uid()
        )
    );

-- Profile verification rules - accessible to all authenticated users
CREATE POLICY profile_verification_rules_read_all ON profile_verification_rules
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Profile detection patterns - owner only
CREATE POLICY profile_detection_patterns_owner ON profile_detection_patterns
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles up 
            WHERE up.id = profile_detection_patterns.profile_id 
            AND up.account_owner_id = auth.uid()
        )
    );

-- Profile auth progression - owner only
CREATE POLICY profile_auth_progression_owner ON profile_auth_progression
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles up 
            WHERE up.id = profile_auth_progression.profile_id 
            AND up.account_owner_id = auth.uid()
        )
    );

-- Profile appointments - owner access
CREATE POLICY profile_appointments_owner ON profile_appointments
    FOR ALL USING (account_owner_id = auth.uid());

-- =============================================================================
-- 7. SAMPLE CONTAMINATION PREVENTION RULES
-- =============================================================================

INSERT INTO profile_verification_rules (rule_type, rule_name, rule_definition, severity) VALUES
('demographic', 'name_mismatch', '{"check": "name_similarity", "threshold": 0.7}', 'warning'),
('clinical', 'gender_condition_mismatch', '{"incompatible_pairs": {"male": ["pregnancy", "hysterectomy"], "female": ["prostate_cancer"]}}', 'critical'),
('clinical', 'age_condition_mismatch', '{"age_restrictions": {"COPD": {"min_age": 40}, "alzheimers": {"min_age": 60}}}', 'warning'),
('temporal', 'future_date_check', '{"max_future_days": 30}', 'warning');

-- =============================================================================
-- 8. UPDATED_AT TRIGGERS
-- =============================================================================

-- Apply updated_at triggers to profile tables (function defined in system infrastructure)
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profile_appointments_updated_at
    BEFORE UPDATE ON profile_appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- =============================================================================
-- DEPLOYMENT VERIFICATION
-- =============================================================================

-- Verify all tables were created
SELECT 
    'Multi-Profile System Deployment' as status,
    CASE 
        WHEN (
            SELECT COUNT(*) FROM information_schema.tables 
            WHERE table_name IN (
                'user_profiles', 'profile_access_permissions', 'user_profile_context',
                'smart_health_features', 'pregnancy_journey_events', 'profile_verification_rules',
                'profile_detection_patterns', 'profile_auth_progression', 'profile_appointments'
            ) AND table_schema = 'public'
        ) = 9 THEN '✅ ALL TABLES CREATED SUCCESSFULLY'
        ELSE '❌ SOME TABLES MISSING - CHECK DEPLOYMENT'
    END as deployment_result;

-- Verify RLS policies
SELECT 
    'RLS Policies' as component,
    COUNT(*) as policies_created
FROM pg_policies 
WHERE tablename LIKE '%profile%' OR tablename LIKE '%pregnancy%';

-- Verify indexes
SELECT 
    'Profile Indexes' as component,
    COUNT(*) as indexes_created
FROM pg_indexes 
WHERE indexname LIKE '%profile%' OR indexname LIKE '%pregnancy%';

-- Display sample data for verification rules
SELECT 
    'Sample Verification Rules' as component,
    rule_type,
    rule_name,
    severity
FROM profile_verification_rules
ORDER BY rule_type, rule_name;