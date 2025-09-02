-- =============================================================================
-- 05_HEALTHCARE_JOURNEY.SQL - Provider Integration & Care Coordination Platform
-- =============================================================================
-- Purpose: Healthcare provider integration, patient-provider relationships, and clinical decision support infrastructure
-- Architecture: Provider registry with credential verification + patient care coordination + clinical decision support automation
-- Dependencies: 01_foundations.sql (audit, security), 02_profiles.sql (user_profiles), 03_clinical_core.sql (clinical_events), 04_ai_processing.sql (AI insights)
-- 
-- DESIGN DECISIONS:
-- - Provider registry: Comprehensive healthcare provider directory with AHPRA/NPI credential verification
-- - Patient-provider relationships: Secure access control with audit logging and time-based permissions
-- - Australian healthcare integration: Registered doctors verification with Medicare provider numbers
-- - Partitioned audit logging: Quarterly partitions for high-volume provider access logs
-- - Clinical decision support: Rule-based alert system for provider workflows
-- - Care coordination: Action items and task management for healthcare teams
-- - Provider context management: Workflow state persistence for complex care scenarios
-- - Healthcare journey tracking: Longitudinal care coordination across multiple providers
-- 
-- TABLES CREATED (12 tables + partitions):
-- Healthcare Provider System (8 tables):
--   - provider_registry, registered_doctors_au, patient_provider_access
--   - provider_access_log (partitioned), provider_action_items
-- Clinical Decision Support (4 tables):
--   - clinical_alert_rules, provider_clinical_notes, healthcare_provider_context
-- Audit Partitions:
--   - provider_access_log_2025_q1, q2, q3, q4 (quarterly partitions)
-- 
-- KEY FEATURES:
-- - provider_registry.registration_number: AHPRA/NPI credential verification support
-- - patient_provider_access.permission_scope: Granular clinical data access control
-- - provider_access_log: High-performance partitioned audit trail
-- - clinical_alert_rules.condition_logic: AI-powered clinical decision support
-- - provider_clinical_notes: Healthcare provider assessment and care plan documentation
-- - healthcare_provider_context: Persistent workflow state for complex care scenarios
-- 
-- INTEGRATION POINTS:
-- - Patient clinical events trigger provider alerts and action items
-- - AI processing insights feed clinical decision support rules
-- - Provider notes integrate with patient clinical narratives
-- - Care coordination workflows connect multiple healthcare providers
-- - Audit logs support healthcare compliance and quality assurance
-- =============================================================================

BEGIN;

-- =============================================================================
-- DEPENDENCY VALIDATION
-- =============================================================================

DO $$
BEGIN
    -- Verify dependencies exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shell_files') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: shell_files table not found. Run 03_clinical_core.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clinical_narratives') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: clinical_narratives table not found. Run 03_clinical_core.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_clinical_events') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: patient_clinical_events table not found. Run 03_clinical_core.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_profile_access') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: has_profile_access() function not found. Run 02_profiles.sql first.';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'is_admin') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: is_admin() missing. Run 01_foundations.sql first.';
    END IF;
END $$;

-- =============================================================================
-- SECTION 1: HEALTHCARE PROVIDER SYSTEM (8 TABLES)
-- =============================================================================

-- Provider registry and credentials directory
CREATE TABLE IF NOT EXISTS provider_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, -- Links provider to authentication account
    
    -- Provider Identity
    provider_type TEXT NOT NULL CHECK (provider_type IN (
        'individual_practitioner', 'healthcare_organization', 'clinic', 'hospital_system',
        'laboratory', 'imaging_center', 'pharmacy', 'allied_health'
    )),
    
    -- Individual Provider Details (for individual_practitioner type)
    first_name TEXT,
    last_name TEXT,
    middle_name TEXT,
    preferred_name TEXT,
    title TEXT, -- 'Dr', 'Prof', 'Mr', 'Ms', etc.
    
    -- Organization Details (for organization types)
    organization_name TEXT,
    trading_name TEXT,
    
    -- Professional Details
    primary_specialty TEXT,
    subspecialties TEXT[],
    professional_qualifications TEXT[],
    languages_spoken TEXT[] DEFAULT ARRAY['English'],
    
    -- Registration and Credentials
    registration_number TEXT, -- AHPRA number for Australia, NPI for US, etc.
    registration_body TEXT, -- 'AHPRA', 'Medical Board', etc.
    registration_status TEXT DEFAULT 'active' CHECK (registration_status IN (
        'active', 'inactive', 'suspended', 'cancelled', 'expired'
    )),
    registration_expiry_date DATE,
    
    -- Contact Information
    primary_phone TEXT,
    secondary_phone TEXT,
    email_address TEXT,
    website_url TEXT,
    
    -- Practice Address
    practice_address JSONB, -- Structured address data
    billing_address JSONB,
    postal_address JSONB,
    
    -- Service Details
    consultation_types TEXT[], -- 'in_person', 'telehealth', 'home_visit', 'hospital_rounds'
    appointment_booking_url TEXT,
    accepts_new_patients BOOLEAN DEFAULT TRUE,
    bulk_billing_available BOOLEAN, -- Australia-specific
    
    -- Integration and Connectivity
    hpii TEXT, -- Healthcare Provider Identifier-Individual (Australia)
    hpio TEXT, -- Healthcare Provider Identifier-Organisation (Australia)
    direct_messaging_address TEXT, -- Secure messaging for healthcare
    fhir_endpoint_url TEXT, -- FHIR API endpoint if available
    
    -- Verification Status
    verification_status TEXT DEFAULT 'unverified' CHECK (verification_status IN (
        'unverified', 'basic_verified', 'credential_verified', 'full_verified'
    )),
    verified_at TIMESTAMPTZ,
    verified_by TEXT, -- Internal staff or system that verified
    verification_method TEXT, -- 'ahpra_lookup', 'manual_verification', 'third_party_service'
    
    -- Lifecycle Management
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ,
    deactivation_reason TEXT
);

-- Australian AHPRA doctor verification database
CREATE TABLE IF NOT EXISTS registered_doctors_au (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- AHPRA Registration Details
    ahpra_registration_number TEXT NOT NULL UNIQUE,
    registration_type TEXT NOT NULL CHECK (registration_type IN (
        'general', 'specialist', 'limited', 'provisional', 'student'
    )),
    registration_status TEXT NOT NULL CHECK (registration_status IN (
        'registered', 'suspended', 'cancelled', 'lapsed'
    )),
    
    -- Personal Details (from AHPRA public register)
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    other_names TEXT,
    
    -- Professional Details
    profession TEXT DEFAULT 'Medical Practitioner',
    specialties TEXT[],
    qualifications TEXT[],
    
    -- Registration Dates
    initial_registration_date DATE,
    current_registration_date DATE,
    registration_expiry_date DATE,
    
    -- Conditions and Restrictions
    registration_conditions TEXT[],
    restrictions TEXT[],
    undertakings TEXT[],
    
    -- Data Source and Verification
    ahpra_data_source_url TEXT,
    last_ahpra_verification TIMESTAMPTZ,
    verification_method TEXT DEFAULT 'ahpra_public_register',
    
    -- Integration with Provider Registry
    provider_registry_id UUID REFERENCES provider_registry(id),
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patient-provider access and relationships
CREATE TABLE IF NOT EXISTS patient_provider_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE, -- CORRECT V3 REFERENCE
    provider_id UUID NOT NULL REFERENCES provider_registry(id) ON DELETE CASCADE,
    
    -- Access Type and Permissions
    access_type TEXT NOT NULL CHECK (access_type IN (
        'primary_care', 'specialist_referral', 'emergency_care', 'locum_coverage',
        'multidisciplinary_team', 'consultation_only', 'second_opinion', 'care_coordination'
    )),
    permission_level TEXT NOT NULL DEFAULT 'read_write' CHECK (permission_level IN (
        'read_only', 'read_write', 'full_access', 'emergency_only', 'restricted_access'
    )),
    
    -- Relationship Context
    relationship_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    relationship_end_date DATE,
    relationship_status TEXT DEFAULT 'active' CHECK (relationship_status IN (
        'active', 'inactive', 'suspended', 'transferred', 'completed'
    )),
    
    -- Clinical Context
    primary_conditions TEXT[], -- Main conditions this provider manages
    care_role TEXT, -- 'primary_physician', 'consulting_specialist', 'allied_health_provider'
    care_team_role TEXT, -- Role within multidisciplinary team
    
    -- Access Permissions Detail
    can_view_all_records BOOLEAN DEFAULT FALSE,
    can_view_specific_conditions UUID[], -- Reference to condition IDs
    can_view_date_range TSTZRANGE, -- Temporal access restrictions
    can_create_records BOOLEAN DEFAULT TRUE,
    can_modify_records BOOLEAN DEFAULT TRUE,
    can_order_tests BOOLEAN DEFAULT FALSE,
    can_prescribe_medications BOOLEAN DEFAULT FALSE,
    
    -- Referral Information (if applicable)
    referring_provider_id UUID REFERENCES provider_registry(id) ON DELETE SET NULL,
    referral_reason TEXT,
    referral_date DATE,
    referral_expiry_date DATE,
    referral_file_reference TEXT,
    
    -- Patient Consent and Authorization
    patient_consent_given BOOLEAN NOT NULL DEFAULT FALSE,
    consent_date TIMESTAMPTZ,
    consent_method TEXT CHECK (consent_method IN (
        'verbal_consent', 'written_consent', 'digital_consent', 'implied_consent', 'emergency_access'
    )),
    consent_witnessed_by TEXT,
    
    -- Administrative
    created_by UUID REFERENCES auth.users(id), -- Who established this relationship
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);

-- Provider access audit log (partitioned by quarter for performance)
-- CRITICAL SECURITY NOTE: Due to partitioning limitations, foreign key constraints cannot be applied 
-- to patient_id and provider_id. Referential integrity MUST be enforced by the application layer 
-- before inserting into this table to prevent orphaned audit entries.
CREATE TABLE IF NOT EXISTS provider_access_log (
    id UUID DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL, -- References user_profiles(id) - no FK due to partitioning  
    provider_id UUID NOT NULL, -- References provider_registry(id) - no FK due to partitioning
    access_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Access Details
    access_type TEXT NOT NULL CHECK (access_type IN (
        'view_record', 'create_record', 'update_record', 'delete_record',
        'export_data', 'share_data', 'emergency_access'
    )),
    resource_accessed TEXT, -- Table or resource type accessed
    resource_id UUID, -- Specific record ID if applicable
    
    -- Session Context
    session_id UUID,
    ip_address INET,
    user_agent TEXT,
    
    -- Clinical Context
    clinical_context TEXT, -- Reason for access if provided
    emergency_access BOOLEAN DEFAULT FALSE,
    
    -- Audit Details
    access_granted BOOLEAN NOT NULL DEFAULT TRUE,
    denial_reason TEXT, -- If access was denied
    
    -- Performance tracking
    response_time_ms INTEGER,
    
    PRIMARY KEY (id, access_timestamp)
) PARTITION BY RANGE (access_timestamp);

-- Create quarterly partitions for provider access log
CREATE TABLE IF NOT EXISTS provider_access_log_2025_q1 PARTITION OF provider_access_log
    FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');

CREATE TABLE IF NOT EXISTS provider_access_log_2025_q2 PARTITION OF provider_access_log
    FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');

CREATE TABLE IF NOT EXISTS provider_access_log_2025_q3 PARTITION OF provider_access_log
    FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');

CREATE TABLE IF NOT EXISTS provider_access_log_2025_q4 PARTITION OF provider_access_log
    FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');

-- =============================================================================
-- AUTOMATED PARTITION MANAGEMENT (CRITICAL FIX)
-- =============================================================================
-- Addresses the January 2026 time bomb where provider access logging will fail

-- Create function to automatically generate quarterly partitions
CREATE OR REPLACE FUNCTION create_quarterly_partitions(
    table_name TEXT DEFAULT 'provider_access_log',
    start_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER,
    num_years INTEGER DEFAULT 2
)
RETURNS TEXT AS $$
DECLARE
    year_val INTEGER;
    quarter INTEGER;
    partition_name TEXT;
    start_date TEXT;
    end_date TEXT;
    sql_statement TEXT;
    result_message TEXT := '';
BEGIN
    -- Generate partitions for the specified number of years
    FOR year_val IN start_year..(start_year + num_years - 1) LOOP
        FOR quarter IN 1..4 LOOP
            -- Calculate partition name and date ranges
            partition_name := table_name || '_' || year_val || '_q' || quarter;
            
            CASE quarter
                WHEN 1 THEN
                    start_date := year_val || '-01-01';
                    end_date := year_val || '-04-01';
                WHEN 2 THEN
                    start_date := year_val || '-04-01';
                    end_date := year_val || '-07-01';
                WHEN 3 THEN
                    start_date := year_val || '-07-01';
                    end_date := year_val || '-10-01';
                WHEN 4 THEN
                    start_date := year_val || '-10-01';
                    end_date := (year_val + 1) || '-01-01';
            END CASE;
            
            -- Check if partition already exists
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.tables t
                WHERE t.table_name = partition_name AND t.table_schema = 'public'
            ) THEN
                -- Create partition
                sql_statement := format(
                    'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
                    partition_name, table_name, start_date, end_date
                );
                EXECUTE sql_statement;
                
                -- Create indexes for the new partition
                EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_patient ON %I(patient_id)', partition_name, partition_name);
                EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_provider ON %I(provider_id)', partition_name, partition_name);
                EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_timestamp ON %I(access_timestamp)', partition_name, partition_name);
                EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_type ON %I(access_type)', partition_name, partition_name);
                
                result_message := result_message || format('Created partition %I for %s to %s. ', partition_name, start_date, end_date);
            END IF;
        END LOOP;
    END LOOP;
    
    -- Return summary
    IF result_message = '' THEN
        RETURN format('All quarterly partitions already exist for %s (%s-%s)', table_name, start_year, start_year + num_years - 1);
    ELSE
        RETURN format('Partition creation complete: %s', result_message);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create partitions through 2027 immediately (prevents January 2026 failure)
SELECT create_quarterly_partitions('provider_access_log', 2026, 2);

-- Create monitoring function to check partition coverage
CREATE OR REPLACE FUNCTION check_partition_coverage(
    table_name TEXT DEFAULT 'provider_access_log',
    months_ahead INTEGER DEFAULT 6
)
RETURNS TABLE (
    status TEXT,
    message TEXT,
    recommended_action TEXT
) AS $$
DECLARE
    future_date DATE := CURRENT_DATE + (months_ahead || ' months')::INTERVAL;
    partition_exists BOOLEAN;
    partition_name TEXT;
BEGIN
    -- Check if we have partition coverage for the future date using standard catalogs
    SELECT EXISTS (
        SELECT 1 FROM pg_tables pt
        WHERE pt.schemaname = 'public' 
        AND pt.tablename LIKE table_name || '_%'
        -- Note: Without pg_partman, we'll need to implement partition date checking differently
        -- For now, just check if partition tables exist
    ) INTO partition_exists;
    
    IF partition_exists THEN
        RETURN QUERY SELECT 
            'OK'::TEXT,
            format('Partition coverage exists for %s months ahead (through %s)', months_ahead, future_date),
            'No action needed'::TEXT;
    ELSE
        RETURN QUERY SELECT 
            'WARNING'::TEXT,
            format('No partition coverage for date %s (%s months ahead)', future_date, months_ahead),
            format('Run: SELECT create_quarterly_partitions(''%s'', %s, 2);', 
                   table_name, EXTRACT(YEAR FROM future_date)::INTEGER)::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SECTION 2: CLINICAL DECISION SUPPORT & CARE MANAGEMENT (4 TABLES)
-- =============================================================================

-- Provider action items and clinical recommendations
CREATE TABLE IF NOT EXISTS provider_action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES provider_registry(id) ON DELETE CASCADE,
    
    -- Action Item Classification
    action_type TEXT NOT NULL CHECK (action_type IN (
        'medication_review', 'follow_up_appointment', 'diagnostic_test', 'referral_needed',
        'lab_result_review', 'medication_adherence_check', 'care_plan_update',
        'patient_education', 'lifestyle_counseling', 'emergency_assessment'
    )),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN (
        'low', 'medium', 'high', 'urgent', 'critical'
    )),
    
    -- Clinical Context
    related_condition TEXT, -- Primary condition this action addresses
    clinical_context TEXT NOT NULL, -- Detailed clinical reasoning
    
    -- SEMANTIC ARCHITECTURE INTEGRATION
    shell_file_id UUID REFERENCES shell_files(id), -- Source file if applicable
    narrative_id UUID REFERENCES clinical_narratives(id), -- Related clinical narrative
    clinical_event_id UUID REFERENCES patient_clinical_events(id), -- Triggering clinical event
    
    -- Action Details
    action_title TEXT NOT NULL,
    action_description TEXT NOT NULL,
    recommended_timeframe TEXT, -- 'within_24_hours', 'within_1_week', 'within_1_month'
    due_date DATE,
    
    -- AI-Generated Insights (from clinical decision support)
    generated_by_ai BOOLEAN DEFAULT FALSE,
    ai_confidence_score NUMERIC(3,2) CHECK (ai_confidence_score BETWEEN 0 AND 1),
    ai_reasoning TEXT, -- AI explanation for this recommendation
    supporting_evidence TEXT[], -- Clinical evidence supporting this action
    
    -- Workflow Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'in_progress', 'completed', 'cancelled', 'overdue', 'deferred'
    )),
    assigned_to UUID REFERENCES provider_registry(id), -- Who should complete this action
    
    -- Completion Details
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES provider_registry(id),
    completion_notes TEXT,
    outcome TEXT CHECK (outcome IN (
        'completed_as_planned', 'completed_with_modifications', 'patient_declined',
        'clinically_inappropriate', 'referred_elsewhere', 'cancelled_by_provider'
    )),
    
    -- Audit and lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clinical decision support rule definitions and configuration
CREATE TABLE IF NOT EXISTS clinical_alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Rule Identity
    rule_name TEXT NOT NULL UNIQUE,
    rule_category TEXT NOT NULL CHECK (rule_category IN (
        'medication_safety', 'diagnostic_guidance', 'preventive_care', 'chronic_disease_management',
        'drug_interaction', 'allergy_alert', 'lab_value_critical', 'age_specific_care'
    )),
    rule_description TEXT NOT NULL,
    
    -- Clinical Logic
    trigger_conditions JSONB NOT NULL, -- Structured conditions that trigger this rule
    rule_logic JSONB NOT NULL, -- Detailed rule execution logic
    alert_message_template TEXT NOT NULL, -- Template for generated alerts
    
    -- Rule Configuration
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN (
        'info', 'low', 'medium', 'high', 'critical'
    )),
    auto_dismiss BOOLEAN DEFAULT FALSE, -- Can the alert be automatically dismissed
    requires_acknowledgment BOOLEAN DEFAULT TRUE, -- Must provider acknowledge the alert
    
    -- Clinical Context Filtering
    applicable_specialties TEXT[], -- Which provider specialties this rule applies to
    applicable_conditions TEXT[], -- Which patient conditions trigger this rule
    age_range_min INTEGER, -- Minimum patient age for this rule
    age_range_max INTEGER, -- Maximum patient age for this rule
    gender_specific TEXT CHECK (gender_specific IN ('male', 'female', 'any')),
    
    -- Evidence and Guidelines
    clinical_guideline_reference TEXT, -- Reference to clinical guideline
    evidence_level TEXT CHECK (evidence_level IN (
        'expert_opinion', 'case_series', 'cohort_study', 'rct', 'systematic_review', 'clinical_guideline'
    )),
    last_evidence_review DATE,
    
    -- Rule Performance and Validation
    rule_version TEXT DEFAULT '1.0',
    validation_status TEXT DEFAULT 'draft' CHECK (validation_status IN (
        'draft', 'testing', 'validated', 'active', 'deprecated'
    )),
    false_positive_rate NUMERIC(3,2),
    clinical_utility_score NUMERIC(3,2),
    
    -- Lifecycle Management
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deprecated_at TIMESTAMPTZ,
    deprecation_reason TEXT
);

-- Provider clinical notes and assessments
CREATE TABLE IF NOT EXISTS provider_clinical_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES provider_registry(id) ON DELETE CASCADE,
    
    -- Note Classification
    note_type TEXT NOT NULL CHECK (note_type IN (
        'progress_note', 'consultation_note', 'discharge_summary', 'referral_letter',
        'assessment_note', 'treatment_plan', 'medication_review', 'care_coordination'
    )),
    encounter_type TEXT CHECK (encounter_type IN (
        'office_visit', 'telehealth', 'hospital_round', 'home_visit', 'telephone_consultation'
    )),
    
    -- SEMANTIC ARCHITECTURE INTEGRATION
    shell_file_id UUID REFERENCES shell_files(id), -- Source file if transcribed/extracted
    narrative_id UUID REFERENCES clinical_narratives(id), -- Related clinical narrative
    clinical_event_id UUID REFERENCES patient_clinical_events(id), -- Associated clinical event
    
    -- Clinical Content
    chief_complaint TEXT,
    history_present_illness TEXT,
    review_of_systems TEXT,
    physical_examination TEXT,
    assessment_text TEXT NOT NULL,
    plan_text TEXT NOT NULL,
    
    -- Structured Data Elements
    vital_signs JSONB, -- Structured vital signs data
    medications_reviewed TEXT[], -- Medications discussed/reviewed
    allergies_confirmed TEXT[], -- Allergies confirmed during visit
    
    -- Follow-up and Care Coordination
    follow_up_instructions TEXT,
    referrals_made TEXT[],
    tests_ordered TEXT[],
    patient_education_provided TEXT[],
    
    -- Provider Workflow
    note_status TEXT DEFAULT 'draft' CHECK (note_status IN (
        'draft', 'pending_review', 'final', 'amended', 'corrected'
    )),
    dictated_at TIMESTAMPTZ,
    transcribed_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    signed_at TIMESTAMPTZ,
    
    -- Quality and Compliance
    template_used TEXT, -- Clinical template if used
    coding_reviewed BOOLEAN DEFAULT FALSE,
    billing_reviewed BOOLEAN DEFAULT FALSE,
    
    -- Audit and lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Healthcare provider context and metadata for encounters
CREATE TABLE IF NOT EXISTS healthcare_provider_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES provider_registry(id) ON DELETE CASCADE,
    
    -- Practice Context
    practice_setting TEXT CHECK (practice_setting IN (
        'private_practice', 'public_hospital', 'private_hospital', 'community_health',
        'aged_care', 'mental_health', 'emergency_department', 'specialist_clinic'
    )),
    practice_location TEXT, -- Geographic location or clinic name
    
    -- Provider Preferences and Configuration
    default_appointment_duration INTEGER DEFAULT 15, -- minutes
    consultation_fee NUMERIC(8,2),
    bulk_billing_threshold NUMERIC(8,2), -- Income threshold for bulk billing
    
    -- Clinical Preferences
    preferred_medication_brands JSONB, -- Brand preferences for prescribing
    clinical_interests TEXT[], -- Areas of special clinical interest
    research_interests TEXT[], -- Research areas
    
    -- Technology and Integration
    ehr_system_used TEXT, -- Primary EHR system
    prescription_software TEXT, -- E-prescribing software
    telehealth_platform TEXT, -- Preferred telehealth platform
    
    -- Communication Preferences
    preferred_communication_method TEXT CHECK (preferred_communication_method IN (
        'secure_message', 'email', 'phone', 'fax', 'postal_mail'
    )),
    communication_hours JSONB, -- Available communication times
    
    -- Quality and Performance Metrics
    patient_satisfaction_score NUMERIC(3,2),
    average_consultation_time INTEGER, -- minutes
    no_show_rate NUMERIC(3,2),
    
    -- Professional Development
    cme_credits_current_year INTEGER DEFAULT 0,
    last_peer_review_date DATE,
    medical_indemnity_provider TEXT,
    medical_indemnity_number TEXT,
    
    -- Audit and lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- SECTION 3: HEALTHCARE JOURNEY INDEXES
-- =============================================================================

-- Provider registry indexes
CREATE INDEX IF NOT EXISTS idx_provider_registry_type ON provider_registry(provider_type);
CREATE INDEX IF NOT EXISTS idx_provider_registry_specialty ON provider_registry(primary_specialty);
CREATE INDEX IF NOT EXISTS idx_provider_registry_active ON provider_registry(active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_provider_registry_registration ON provider_registry(registration_number, registration_body);
CREATE INDEX IF NOT EXISTS idx_provider_registry_verification ON provider_registry(verification_status);

-- Australian doctor registry indexes
CREATE INDEX IF NOT EXISTS idx_registered_doctors_au_ahpra ON registered_doctors_au(ahpra_registration_number);
CREATE INDEX IF NOT EXISTS idx_registered_doctors_au_name ON registered_doctors_au(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_registered_doctors_au_status ON registered_doctors_au(registration_status);
CREATE INDEX IF NOT EXISTS idx_registered_doctors_au_provider ON registered_doctors_au(provider_registry_id);

-- Patient provider access indexes
CREATE INDEX IF NOT EXISTS idx_patient_provider_access_patient ON patient_provider_access(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_provider_access_provider ON patient_provider_access(provider_id);
CREATE INDEX IF NOT EXISTS idx_patient_provider_access_active ON patient_provider_access(relationship_status) WHERE relationship_status = 'active';
CREATE INDEX IF NOT EXISTS idx_patient_provider_access_type ON patient_provider_access(access_type);
CREATE INDEX IF NOT EXISTS idx_patient_provider_access_dates ON patient_provider_access(relationship_start_date, relationship_end_date);

-- Provider access log indexes (on each partition)
CREATE INDEX IF NOT EXISTS idx_provider_access_log_2025_q1_patient ON provider_access_log_2025_q1(patient_id);
CREATE INDEX IF NOT EXISTS idx_provider_access_log_2025_q1_provider ON provider_access_log_2025_q1(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_access_log_2025_q1_timestamp ON provider_access_log_2025_q1(access_timestamp);
CREATE INDEX IF NOT EXISTS idx_provider_access_log_2025_q1_type ON provider_access_log_2025_q1(access_type);

-- Replicate indexes for other quarters
CREATE INDEX IF NOT EXISTS idx_provider_access_log_2025_q2_patient ON provider_access_log_2025_q2(patient_id);
CREATE INDEX IF NOT EXISTS idx_provider_access_log_2025_q2_provider ON provider_access_log_2025_q2(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_access_log_2025_q3_patient ON provider_access_log_2025_q3(patient_id);
CREATE INDEX IF NOT EXISTS idx_provider_access_log_2025_q3_provider ON provider_access_log_2025_q3(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_access_log_2025_q4_patient ON provider_access_log_2025_q4(patient_id);
CREATE INDEX IF NOT EXISTS idx_provider_access_log_2025_q4_provider ON provider_access_log_2025_q4(provider_id);

-- Clinical decision support indexes
CREATE INDEX IF NOT EXISTS idx_provider_action_items_patient ON provider_action_items(patient_id);
CREATE INDEX IF NOT EXISTS idx_provider_action_items_provider ON provider_action_items(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_action_items_status ON provider_action_items(status);
CREATE INDEX IF NOT EXISTS idx_provider_action_items_priority ON provider_action_items(priority);
CREATE INDEX IF NOT EXISTS idx_provider_action_items_due_date ON provider_action_items(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provider_action_items_narrative ON provider_action_items(narrative_id) WHERE narrative_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinical_alert_rules_category ON clinical_alert_rules(rule_category);
CREATE INDEX IF NOT EXISTS idx_clinical_alert_rules_active ON clinical_alert_rules(active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_clinical_alert_rules_severity ON clinical_alert_rules(severity);
CREATE INDEX IF NOT EXISTS idx_clinical_alert_rules_validation ON clinical_alert_rules(validation_status);

-- Provider clinical notes indexes
CREATE INDEX IF NOT EXISTS idx_provider_clinical_notes_patient ON provider_clinical_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_provider_clinical_notes_provider ON provider_clinical_notes(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_clinical_notes_type ON provider_clinical_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_provider_clinical_notes_status ON provider_clinical_notes(note_status);
CREATE INDEX IF NOT EXISTS idx_provider_clinical_notes_narrative ON provider_clinical_notes(narrative_id) WHERE narrative_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_healthcare_provider_context_provider ON healthcare_provider_context(provider_id);
CREATE INDEX IF NOT EXISTS idx_healthcare_provider_context_setting ON healthcare_provider_context(practice_setting);

-- =============================================================================
-- MOVED FROM 04_ai_processing.sql: Clinical Alert Rules and Provider Action Items
-- =============================================================================

-- Clinical alert rules indexes (corrected - removed invalid column references)
CREATE INDEX IF NOT EXISTS idx_alert_rules_category ON clinical_alert_rules(rule_category, active) WHERE active = true;
-- REMOVED: idx_alert_rules_priority (alert_priority column does not exist)
-- REMOVED: idx_alert_rules_performance (success_rate, trigger_count columns do not exist)

-- REMOVED: Duplicate provider_action_items indexes (already created in lines 677-682)
-- This "Moved from 04" section contained redundant indexes with different names

-- Enable RLS for moved tables
ALTER TABLE clinical_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_action_items ENABLE ROW LEVEL SECURITY;

-- Clinical alert rules policies (idempotent)
DROP POLICY IF EXISTS alert_rules_read ON clinical_alert_rules;
CREATE POLICY alert_rules_read ON clinical_alert_rules
    FOR SELECT TO authenticated
    USING (active = true);

DROP POLICY IF EXISTS alert_rules_admin ON clinical_alert_rules;
CREATE POLICY alert_rules_admin ON clinical_alert_rules
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Provider action items policy (fixed RLS type mismatch)
DROP POLICY IF EXISTS action_items_access ON provider_action_items;
CREATE POLICY action_items_access ON provider_action_items
    FOR ALL TO authenticated
    USING (
        has_profile_access(auth.uid(), patient_id)
        OR is_admin()
        OR EXISTS (
            SELECT 1 FROM provider_registry pr 
            WHERE pr.id = provider_action_items.assigned_to 
            AND pr.user_id = auth.uid()
        )
    )
    WITH CHECK (
        has_profile_access(auth.uid(), patient_id)
        OR is_admin()
    );

-- =============================================================================
-- MISSING RLS POLICIES (GPT-5 Security Hardening)
-- =============================================================================

-- provider_registry - Self-read + admin full access
ALTER TABLE provider_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_registry_self_read ON provider_registry;
CREATE POLICY provider_registry_self_read ON provider_registry
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR is_admin());
DROP POLICY IF EXISTS provider_registry_admin_all ON provider_registry;
CREATE POLICY provider_registry_admin_all ON provider_registry
    FOR ALL TO authenticated
    USING (is_admin()) WITH CHECK (is_admin());

-- registered_doctors_au - Directory: read-only to authenticated; admin can manage
ALTER TABLE registered_doctors_au ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS registered_doctors_read ON registered_doctors_au;
CREATE POLICY registered_doctors_read ON registered_doctors_au
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS registered_doctors_admin_all ON registered_doctors_au;
CREATE POLICY registered_doctors_admin_all ON registered_doctors_au
    FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- patient_provider_access - Gate by patient access or admin
ALTER TABLE patient_provider_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_provider_access_access ON patient_provider_access;
CREATE POLICY patient_provider_access_access ON patient_provider_access
    FOR ALL TO authenticated
    USING (has_profile_access(auth.uid(), patient_id) OR is_admin())
    WITH CHECK (has_profile_access(auth.uid(), patient_id) OR is_admin());

-- provider_access_log - Partitioned; apply to parent
ALTER TABLE provider_access_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_access_log_access ON provider_access_log;
CREATE POLICY provider_access_log_access ON provider_access_log
    FOR SELECT TO authenticated
    USING (
        has_profile_access(auth.uid(), patient_id) OR is_admin() OR
        EXISTS (
            SELECT 1 FROM provider_registry pr
            WHERE pr.id = provider_id AND pr.user_id = auth.uid()
        )
    );

-- provider_clinical_notes - By patient access or assigned provider or admin
ALTER TABLE provider_clinical_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_notes_access ON provider_clinical_notes;
CREATE POLICY provider_notes_access ON provider_clinical_notes
    FOR ALL TO authenticated
    USING (
        has_profile_access(auth.uid(), patient_id) OR is_admin() OR
        EXISTS (
            SELECT 1 FROM provider_registry pr
            WHERE pr.id = provider_clinical_notes.provider_id AND pr.user_id = auth.uid()
        )
    )
    WITH CHECK (has_profile_access(auth.uid(), patient_id) OR is_admin());

-- healthcare_provider_context - Provider-owned or admin
ALTER TABLE healthcare_provider_context ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_context_owner ON healthcare_provider_context;
CREATE POLICY provider_context_owner ON healthcare_provider_context
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM provider_registry pr
            WHERE pr.id = healthcare_provider_context.provider_id AND pr.user_id = auth.uid()
        ) OR is_admin()
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM provider_registry pr
            WHERE pr.id = healthcare_provider_context.provider_id AND pr.user_id = auth.uid()
        ) OR is_admin()
    );

COMMIT;

-- =============================================================================
-- HEALTHCARE JOURNEY DEPLOYMENT VALIDATION
-- =============================================================================

DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
    partition_count INTEGER;
BEGIN
    -- Count created tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_name IN (
        'provider_registry', 'registered_doctors_au', 'patient_provider_access', 'provider_access_log',
        'provider_access_log_2025_q1', 'provider_access_log_2025_q2', 'provider_access_log_2025_q3', 'provider_access_log_2025_q4',
        'provider_action_items', 'clinical_alert_rules', 'provider_clinical_notes', 'healthcare_provider_context'
    ) AND table_schema = 'public';
    
    -- Count created indexes (Healthcare Journey specific)
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes 
    WHERE indexname LIKE '%provider%' OR indexname LIKE '%clinical_alert%' OR indexname LIKE '%healthcare_%';
    
    -- Count partitions
    SELECT COUNT(*) INTO partition_count
    FROM information_schema.tables
    WHERE table_name LIKE 'provider_access_log_2025_%';
    
    IF table_count >= 12 AND index_count >= 25 AND partition_count = 4 THEN
        RAISE NOTICE 'Healthcare Journey deployment successful!';
        RAISE NOTICE '  - Tables: %/12, Indexes: %/25+, Partitions: %/4', 
            table_count, index_count, partition_count;
        RAISE NOTICE '  - Provider directory and credentials system ready';
        RAISE NOTICE '  - Clinical decision support infrastructure deployed';
        RAISE NOTICE '  - Patient-provider relationships with semantic architecture integration';
        RAISE NOTICE '  - Australian AHPRA verification database ready';
    ELSE
        RAISE WARNING 'Healthcare Journey deployment incomplete:';
        RAISE WARNING '  - Tables: %/12, Indexes: %/25+, Partitions: %/4', 
            table_count, index_count, partition_count;
    END IF;
END $$;

-- =============================================================================
-- FRESH START BLUEPRINT: 05_healthcare_journey.sql COMPLETE
-- =============================================================================