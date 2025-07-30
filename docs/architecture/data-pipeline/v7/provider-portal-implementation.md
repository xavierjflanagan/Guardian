# Guardian v7.1 Provider Portal Implementation Guide

**Status:** Future Planning Phase  
**Version:** 7.1 (Provider Portal Extension)  
**Date:** 2025-07-30  
**Dependencies:** Guardian v7 patient platform fully operational

---

## Overview

This implementation guide provides detailed instructions for extending Guardian v7 with provider portal capabilities. The provider portal transforms Guardian from a patient-only platform into a comprehensive healthcare ecosystem while maintaining patient data sovereignty.

**Key Implementation Philosophy:**
- **Extend, Don't Replace**: Build upon existing v7 clinical events and audit systems
- **Patient-Controlled Access**: All provider access requires explicit patient consent
- **Zero-Trust Security**: Every provider action is verified and audited
- **Unified Architecture**: Single database with enhanced RLS for provider access

---

## 1. Prerequisites and Dependencies

### 1.1. Required v7 Infrastructure
Before starting provider portal implementation, ensure these v7 components are operational:

- ✅ **Core Schema**: `patient_clinical_events`, `healthcare_encounters`, `audit_log`
- ✅ **Security Framework**: RLS policies, audit system, GDPR compliance
- ✅ **Feature Flags**: Progressive rollout infrastructure
- ✅ **FHIR Integration**: Healthcare standards compliance
- ✅ **Document Processing**: OCR and AI extraction pipeline

### 1.2. New Infrastructure Requirements

#### Database Extensions
```sql
-- Additional extensions for provider portal
CREATE EXTENSION IF NOT EXISTS "pg_partman";  -- Automated table partitioning
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- Query performance monitoring
```

#### Environment Variables
```bash
# Provider portal specific configuration
PROVIDER_PORTAL_ENABLED=false
AHPRA_API_URL=https://www.ahpra.gov.au/api/
AHPRA_BULK_CSV_URL=https://www.ahpra.gov.au/downloads/
PROVIDER_SESSION_TIMEOUT=900  # 15 minutes
PROVIDER_MFA_REQUIRED=true
```

---

## 2. Phase 1: Universal Provider Registry Implementation

### 2.1. Core Provider Registry Schema

Create the foundational provider registry that works across jurisdictions:

```sql
-- Core provider registry extending v7 architecture
CREATE TABLE provider_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Universal identification
    guardian_provider_id TEXT UNIQUE NOT NULL, -- "GP-AU-MED0001234567"
    
    -- External registry mappings
    external_registries JSONB DEFAULT '[]', -- [{country: "AU", registry: "AHPRA", id: "MED0001234567", verified: true}]
    
    -- Core provider data
    given_names TEXT NOT NULL,
    family_name TEXT NOT NULL,
    professional_titles TEXT[],
    
    -- Professional details
    specialties TEXT[],
    qualifications JSONB, -- [{degree: "MBBS", institution: "Sydney Uni", year: 2010}]
    languages_spoken TEXT[],
    
    -- Practice information
    primary_practice_country TEXT NOT NULL,
    practice_locations JSONB, -- Multiple locations with addresses
    
    -- Guardian platform engagement
    has_guardian_account BOOLEAN DEFAULT FALSE,
    account_verified BOOLEAN DEFAULT FALSE,
    verification_method TEXT, -- 'ahpra_lookup', 'manual_verification', 'peer_attestation'
    guardian_verified_badge BOOLEAN DEFAULT FALSE,
    pledged_data_sharing BOOLEAN DEFAULT FALSE,
    pledge_date TIMESTAMPTZ,
    
    -- Profile enrichment (provider-added)
    bio TEXT,
    areas_of_interest TEXT[],
    accepting_new_patients BOOLEAN,
    telehealth_available BOOLEAN,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY HASH(id);

-- Create partitions for performance
SELECT partman.create_parent(
    p_parent_table => 'public.provider_registry',
    p_control => 'id',
    p_type => 'hash',
    p_partition_interval => '1000000'  -- 1M providers per partition
);

-- Essential indexes
CREATE INDEX idx_provider_registry_guardian_id ON provider_registry(guardian_provider_id);
CREATE INDEX idx_provider_registry_external_regs ON provider_registry USING GIN(external_registries);
CREATE INDEX idx_provider_registry_country ON provider_registry(primary_practice_country);
CREATE INDEX idx_provider_registry_verified ON provider_registry(guardian_verified_badge) WHERE guardian_verified_badge = TRUE;
```

### 2.2. AHPRA Integration Schema

Complete the original O3 ticket with provider registry integration:

```sql
-- AHPRA registry table (from original O3 ticket)
CREATE TABLE registered_doctors_au (
    ahpra_id TEXT PRIMARY KEY,
    family_name TEXT,
    given_names TEXT,
    profession TEXT,        -- always "Medical Practitioner" in this file
    specialty TEXT[],       -- array (may be empty)
    registration_type TEXT,
    registration_status TEXT, -- "Registered", "Suspended", "Cancelled"
    conditions TEXT,
    principal_state TEXT,
    principal_postcode TEXT,
    last_updated DATE,      -- as provided in the CSV
    loaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast "is doctor active?" checks
CREATE INDEX idx_registered_doctors_au_status ON registered_doctors_au(registration_status);

-- Link AHPRA to provider registry
ALTER TABLE provider_registry ADD COLUMN ahpra_verification_id TEXT REFERENCES registered_doctors_au(ahpra_id);

-- AHPRA lookup RPC (from original O3 ticket)
CREATE OR REPLACE FUNCTION get_doctor_by_ahpra(ahpra_id TEXT)
RETURNS TABLE(
    ahpra_id TEXT,
    family_name TEXT,
    given_names TEXT,
    registration_status TEXT,
    specialty TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT rd.ahpra_id, rd.family_name, rd.given_names, rd.registration_status, rd.specialty
    FROM registered_doctors_au rd
    WHERE rd.ahpra_id = get_doctor_by_ahpra.ahpra_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2.3. Provider Registry RLS Policies

Extend v7's security framework for provider data:

```sql
-- Enable RLS on provider tables
ALTER TABLE provider_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE registered_doctors_au ENABLE ROW LEVEL SECURITY;

-- Providers can see their own records
CREATE POLICY provider_registry_self_access ON provider_registry
    FOR ALL USING (
        (auth.jwt() ->> 'role') = 'healthcare_provider' 
        AND auth.uid()::TEXT = id::TEXT
    );

-- Patients can see basic provider info for providers they've granted access
CREATE POLICY provider_registry_patient_access ON provider_registry
    FOR SELECT USING (
        (auth.jwt() ->> 'role') = 'authenticated' 
        AND EXISTS (
            SELECT 1 FROM patient_provider_access ppa
            WHERE ppa.provider_id = provider_registry.id
            AND ppa.patient_id = auth.uid()
            AND ppa.status = 'active'
        )
    );

-- AHPRA data is publicly readable for verification purposes
CREATE POLICY registered_doctors_au_public_read ON registered_doctors_au
    FOR SELECT USING (true);
```

---

## 3. Phase 2: Patient-Provider Access Control System

### 3.1. Granular Access Permission Schema

```sql
-- Patient-provider access permissions
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Real-time provider access logging
CREATE TABLE provider_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    access_permission_id UUID NOT NULL REFERENCES patient_provider_access(id),
    provider_id UUID NOT NULL REFERENCES provider_registry(id),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- What was accessed
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_type TEXT NOT NULL, -- 'view', 'download', 'share'
    accessed_resources TEXT[], -- ['medications', 'recent_labs']
    ip_address INET,
    user_agent TEXT,
    
    -- Sharing details (if applicable)
    shared_with_provider_id UUID REFERENCES provider_registry(id),
    share_reason TEXT,
    share_duration_days INTEGER
) PARTITION BY RANGE (accessed_at);

-- Auto-partition by month for performance
SELECT partman.create_parent(
    p_parent_table => 'public.provider_access_log',
    p_control => 'accessed_at',
    p_type => 'range',
    p_interval => 'monthly'
);
```

### 3.2. Provider Access Validation Functions

```sql
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
        access_type, accessed_resources, ip_address, user_agent
    ) VALUES (
        access_record.id, p_provider_id, p_patient_id,
        p_access_type, ARRAY[p_resource_type],
        inet_client_addr(), current_setting('app.user_agent', true)
    );
    
    RETURN jsonb_build_object(
        'access_granted', true,
        'access_type', access_record.access_type,
        'expires_at', access_record.expires_at,
        'access_count', access_record.access_count + 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.3. Provider-Specific RLS Policies for Clinical Data

Extend existing clinical data RLS policies for provider access:

```sql
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

-- Similar policies for other clinical data types...
-- (Repeat pattern for patient_conditions, patient_lab_results, patient_vitals, etc.)
```

---

## 4. Phase 3: Provider Authentication & Verification

### 4.1. Enhanced Provider Authentication Schema

```sql
-- Provider authentication extending Supabase auth
CREATE TABLE provider_auth_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    provider_registry_id UUID NOT NULL REFERENCES provider_registry(id),
    
    -- Authentication details
    verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected', 'suspended')),
    verification_method TEXT, -- 'ahpra_lookup', 'document_verification', 'peer_attestation'
    verification_completed_at TIMESTAMPTZ,
    verification_expires_at TIMESTAMPTZ, -- Annual re-verification required
    
    -- Multi-factor authentication
    mfa_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    mfa_methods TEXT[] DEFAULT '{}', -- ['totp', 'sms', 'authenticator_app']
    backup_codes_generated BOOLEAN DEFAULT FALSE,
    
    -- Device trust
    trusted_devices JSONB DEFAULT '[]', -- Device fingerprints and registration dates
    device_trust_required BOOLEAN DEFAULT TRUE,
    
    -- Session management
    session_timeout_minutes INTEGER DEFAULT 15, -- Shorter for providers
    concurrent_sessions_allowed INTEGER DEFAULT 2,
    
    -- Professional details
    license_number TEXT,
    license_state TEXT,
    license_expires_at DATE,
    professional_indemnity_verified BOOLEAN DEFAULT FALSE,
    
    -- Account status
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'terminated')),
    last_login_at TIMESTAMPTZ,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Provider onboarding workflow tracking
CREATE TABLE provider_onboarding_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_auth_id UUID NOT NULL REFERENCES provider_auth_profiles(id),
    
    -- Onboarding step tracking
    step_name TEXT NOT NULL CHECK (step_name IN (
        'registry_lookup', 'identity_verification', 'practice_details', 
        'data_pledge', 'profile_setup', 'mfa_setup', 'device_registration'
    )),
    step_status TEXT NOT NULL DEFAULT 'pending' CHECK (step_status IN ('pending', 'in_progress', 'completed', 'failed')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    
    -- Step-specific data
    step_data JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.2. Provider Verification Functions

```sql
-- AHPRA verification function
CREATE OR REPLACE FUNCTION verify_provider_with_ahpra(
    p_provider_id UUID,
    p_ahpra_id TEXT,
    p_given_names TEXT,
    p_family_name TEXT
) RETURNS JSONB AS $$
DECLARE
    ahpra_record RECORD;
    verification_result JSONB;
BEGIN
    -- Look up provider in AHPRA registry
    SELECT * INTO ahpra_record
    FROM registered_doctors_au
    WHERE ahpra_id = p_ahpra_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'verified', false,
            'reason', 'ahpra_id_not_found',
            'message', 'AHPRA ID not found in registry'
        );
    END IF;
    
    -- Check registration status
    IF ahpra_record.registration_status != 'Registered' THEN
        RETURN jsonb_build_object(
            'verified', false,
            'reason', 'not_registered',
            'status', ahpra_record.registration_status,
            'message', format('Provider status: %s', ahpra_record.registration_status)
        );
    END IF;
    
    -- Verify name match (fuzzy matching)
    IF similarity(ahpra_record.given_names, p_given_names) < 0.8 
       OR similarity(ahpra_record.family_name, p_family_name) < 0.8 THEN
        RETURN jsonb_build_object(
            'verified', false,
            'reason', 'name_mismatch',
            'message', 'Provided names do not match AHPRA records'
        );
    END IF;
    
    -- Update provider registry with verification
    UPDATE provider_registry 
    SET ahpra_verification_id = p_ahpra_id,
        account_verified = true,
        verification_method = 'ahpra_lookup',
        guardian_verified_badge = true
    WHERE id = p_provider_id;
    
    -- Update auth profile
    UPDATE provider_auth_profiles
    SET verification_status = 'verified',
        verification_method = 'ahpra_lookup',
        verification_completed_at = NOW(),
        verification_expires_at = NOW() + INTERVAL '1 year'
    WHERE provider_registry_id = p_provider_id;
    
    RETURN jsonb_build_object(
        'verified', true,
        'ahpra_id', p_ahpra_id,
        'registration_status', ahpra_record.registration_status,
        'specialties', ahpra_record.specialty,
        'verification_expires_at', NOW() + INTERVAL '1 year'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 5. Phase 4: Clinical Decision Support System

### 5.1. Provider Action Items Schema

```sql
-- Clinical decision support action items
CREATE TABLE provider_action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Action details
    action_type TEXT NOT NULL CHECK (action_type IN (
        'medication_review', 'dose_optimization', 'polypharmacy_check',
        'screening_due', 'vaccination_due', 'follow_up_needed',
        'drug_interaction', 'allergy_alert', 'contraindication'
    )),
    priority TEXT NOT NULL CHECK (priority IN ('routine', 'moderate', 'urgent', 'critical')),
    
    -- Clinical context
    related_entity_type TEXT, -- 'medication', 'condition', 'screening'
    related_entity_id UUID,
    
    -- The action request
    question TEXT NOT NULL,
    context TEXT,
    ai_generated_rationale TEXT,
    supporting_data JSONB, -- Lab values, risk scores, etc.
    
    -- Provider assignment and response
    assigned_provider_id UUID REFERENCES provider_registry(id),
    provider_response TEXT,
    provider_action_taken TEXT,
    responded_at TIMESTAMPTZ,
    
    -- Billing/incentive codes
    applicable_billing_codes TEXT[], -- CPT codes for addressing this
    quality_measure_codes TEXT[], -- MIPS/quality metrics
    estimated_reimbursement NUMERIC(10,2),
    
    -- Status and lifecycle
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'reviewed', 'actioned', 'deferred', 'not_applicable')),
    due_date TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for provider action item queries
CREATE INDEX idx_provider_action_items_provider ON provider_action_items(assigned_provider_id) WHERE status IN ('pending', 'assigned');
CREATE INDEX idx_provider_action_items_patient ON provider_action_items(patient_id);
CREATE INDEX idx_provider_action_items_priority ON provider_action_items(priority, status) WHERE status IN ('pending', 'assigned');
CREATE INDEX idx_provider_action_items_due_date ON provider_action_items(due_date) WHERE due_date IS NOT NULL AND status IN ('pending', 'assigned');
```

### 5.2. Clinical Alert Generation Functions

```sql
-- Generate medication review alerts
CREATE OR REPLACE FUNCTION generate_medication_review_alerts()
RETURNS INTEGER AS $$
DECLARE
    patient_record RECORD;
    medication_record RECORD;
    alerts_created INTEGER := 0;
BEGIN
    -- Find patients with multiple medications (polypharmacy risk)
    FOR patient_record IN 
        SELECT patient_id, COUNT(*) as med_count
        FROM patient_medications
        WHERE archived IS NOT TRUE
        GROUP BY patient_id
        HAVING COUNT(*) >= 5  -- 5+ medications = polypharmacy
    LOOP
        -- Check if alert already exists
        IF NOT EXISTS (
            SELECT 1 FROM provider_action_items
            WHERE patient_id = patient_record.patient_id
            AND action_type = 'polypharmacy_check'
            AND status IN ('pending', 'assigned')
        ) THEN
            -- Create polypharmacy review alert
            INSERT INTO provider_action_items (
                patient_id, action_type, priority, question, context,
                ai_generated_rationale, supporting_data,
                applicable_billing_codes, due_date
            ) VALUES (
                patient_record.patient_id,
                'polypharmacy_check',
                'moderate',
                'Patient has ' || patient_record.med_count || ' active medications. Review for potential interactions and optimization opportunities.',
                'Polypharmacy increases risk of adverse drug events and medication interactions.',
                'AI detected potential for medication optimization based on current medication count and known interaction patterns.',
                jsonb_build_object('medication_count', patient_record.med_count),
                ARRAY['99213', '99214'], -- Office visit codes
                NOW() + INTERVAL '30 days'
            );
            
            alerts_created := alerts_created + 1;
        END IF;
    END LOOP;
    
    RETURN alerts_created;
END;
$$ LANGUAGE plpgsql;

-- Generate screening due alerts
CREATE OR REPLACE FUNCTION generate_screening_alerts()
RETURNS INTEGER AS $$
DECLARE
    patient_record RECORD;
    alerts_created INTEGER := 0;
    patient_age INTEGER;
BEGIN
    -- Find patients due for age-based screenings
    FOR patient_record IN 
        SELECT u.id as patient_id, 
               EXTRACT(YEAR FROM AGE(NOW(), (epd.date_of_birth_encrypted)::DATE)) as age
        FROM auth.users u
        JOIN encrypted_patient_data epd ON u.id = epd.patient_id
        WHERE epd.archived IS NOT TRUE
    LOOP
        patient_age := patient_record.age;
        
        -- Mammography screening (women 50+, every 2 years)
        IF patient_age >= 50 AND patient_age <= 74 THEN
            IF NOT EXISTS (
                SELECT 1 FROM provider_action_items
                WHERE patient_id = patient_record.patient_id
                AND action_type = 'screening_due'
                AND question LIKE '%mammography%'
                AND status IN ('pending', 'assigned')
            ) THEN
                INSERT INTO provider_action_items (
                    patient_id, action_type, priority, question, context,
                    ai_generated_rationale, supporting_data,
                    applicable_billing_codes, due_date
                ) VALUES (
                    patient_record.patient_id,
                    'screening_due',
                    'routine',
                    'Patient is due for mammography screening (age ' || patient_age || ').',
                    'Current guidelines recommend biennial mammography for women aged 50-74.',
                    'AI analysis of patient age and screening history indicates mammography screening is due.',
                    jsonb_build_object('patient_age', patient_age, 'screening_type', 'mammography'),
                    ARRAY['77067'], -- Mammography CPT code
                    NOW() + INTERVAL '60 days'
                );
                
                alerts_created := alerts_created + 1;
            END IF;
        END IF;
        
        -- Colonoscopy screening (50+, every 10 years)
        IF patient_age >= 50 AND patient_age <= 75 THEN
            IF NOT EXISTS (
                SELECT 1 FROM provider_action_items
                WHERE patient_id = patient_record.patient_id
                AND action_type = 'screening_due'
                AND question LIKE '%colonoscopy%'
                AND status IN ('pending', 'assigned')
            ) THEN
                INSERT INTO provider_action_items (
                    patient_id, action_type, priority, question, context,
                    ai_generated_rationale, supporting_data,
                    applicable_billing_codes, due_date
                ) VALUES (
                    patient_record.patient_id,
                    'screening_due',
                    'routine',
                    'Patient is due for colorectal cancer screening (age ' || patient_age || ').',
                    'Current guidelines recommend colorectal cancer screening starting at age 50.',
                    'AI analysis indicates patient is in age range for colorectal cancer screening.',
                    jsonb_build_object('patient_age', patient_age, 'screening_type', 'colonoscopy'),
                    ARRAY['45380'], -- Colonoscopy CPT code
                    NOW() + INTERVAL '90 days'
                );
                
                alerts_created := alerts_created + 1;
            END IF;
        END IF;
    END LOOP;
    
    RETURN alerts_created;
END;
$$ LANGUAGE plpgsql;
```

---

## 6. Implementation Steps and Timeline

### 6.1. Phase 1: Foundation (Weeks 1-4)
**Prerequisites:** Guardian v7 patient platform operational

#### Week 1-2: Provider Registry
1. **Deploy Schema**: Create `provider_registry` and related tables
2. **AHPRA Integration**: Complete O3 ticket - ETL job and lookup functions
3. **Basic RLS**: Implement provider registry security policies
4. **Testing**: Verify provider registration and AHPRA lookup

#### Week 3-4: Access Control
1. **Deploy Schema**: Create `patient_provider_access` and logging tables
2. **Access Functions**: Implement validation and logging functions
3. **RLS Policies**: Extend clinical data policies for provider access
4. **Testing**: Verify granular access control works

### 6.2. Phase 2: Authentication (Weeks 5-8)

#### Week 5-6: Provider Auth System
1. **Auth Schema**: Create `provider_auth_profiles` and onboarding tables
2. **Verification**: Implement AHPRA verification functions
3. **MFA Setup**: Configure enhanced authentication requirements
4. **Testing**: Verify provider can authenticate and be verified

#### Week 7-8: Provider Portal UI
1. **Repository Structure**: Set up monorepo with provider-portal app
2. **Authentication Flow**: Build provider login and verification UI
3. **Basic Dashboard**: Create provider dashboard with patient list
4. **Testing**: End-to-end provider authentication and basic access

### 6.3. Phase 3: Clinical Features (Weeks 9-12)

#### Week 9-10: Clinical Decision Support
1. **Action Items Schema**: Create provider action items and alerts
2. **Alert Generation**: Implement clinical alert functions
3. **Provider Dashboard**: Add action items and alerts to provider UI
4. **Testing**: Verify clinical alerts are generated and displayed

#### Week 11-12: Advanced Features
1. **Inter-Provider Sharing**: Implement provider-to-provider referrals
2. **Clinical Notes**: Add provider clinical notes and documentation
3. **Billing Integration**: Add billing code suggestions and tracking
4. **Testing**: Full integration testing of provider workflows

### 6.4. Phase 4: Production Deployment (Weeks 13-16)

#### Week 13-14: Security & Compliance
1. **Security Audit**: Complete security review of provider access
2. **Penetration Testing**: External security testing of provider portal
3. **Compliance Review**: HIPAA and GDPR compliance verification
4. **Documentation**: Complete security and compliance documentation

#### Week 15-16: Launch Preparation
1. **Performance Testing**: Load testing with multiple providers
2. **Provider Onboarding**: Create provider onboarding workflows
3. **Training Materials**: Create provider training and documentation
4. **Soft Launch**: Beta testing with select healthcare providers

---

## 7. Testing Strategy

### 7.1. Unit Testing
- **Provider Registry**: Test AHPRA lookup and verification functions
- **Access Control**: Test granular permission validation
- **Clinical Alerts**: Test alert generation algorithms
- **Security**: Test RLS policies and access controls

### 7.2. Integration Testing
- **Provider Authentication**: End-to-end authentication and verification
- **Patient-Provider Access**: Grant, revoke, and audit access permissions
- **Clinical Workflows**: Complete provider clinical decision support workflows
- **Cross-Portal Integration**: Patient portal and provider portal integration

### 7.3. Security Testing
- **Penetration Testing**: External security testing of provider access
- **Access Control Testing**: Verify providers can only access consented data
- **Audit Testing**: Verify all provider actions are properly audited
- **Compliance Testing**: HIPAA minimum necessary rule compliance

---

## 8. Deployment and Operations

### 8.1. Feature Flag Strategy
Use existing v7 feature flag infrastructure for gradual rollout:

```sql
-- Provider portal feature flags
UPDATE feature_flags SET enabled = true WHERE feature_name = 'provider_registry';
UPDATE feature_flags SET enabled = true WHERE feature_name = 'provider_authentication';
UPDATE feature_flags SET enabled = true WHERE feature_name = 'patient_provider_access';
UPDATE feature_flags SET enabled = true WHERE feature_name = 'clinical_decision_support';
```

### 8.2. Monitoring and Alerting
- **Provider Access Monitoring**: Real-time monitoring of provider access patterns
- **Security Alerts**: Automated alerts for suspicious provider activities
- **Performance Monitoring**: Database performance with provider queries
- **Compliance Monitoring**: HIPAA audit trail completeness

### 8.3. Backup and Recovery
- **Provider Data Backup**: Include provider tables in existing backup strategy
- **Access Log Retention**: 7-year retention for provider access logs
- **Registry Sync**: Daily AHPRA registry sync with failure alerting

---

## 9. Success Criteria

### 9.1. Technical Milestones
- [ ] Universal provider registry operational with 1000+ verified providers
- [ ] Patient-provider access control with sub-100ms validation
- [ ] Clinical decision support generating 10+ alerts per day
- [ ] Zero security incidents in 90-day period
- [ ] 99.9% uptime for provider portal

### 9.2. Business Metrics
- [ ] 50+ healthcare providers onboarded and verified
- [ ] 500+ patients have granted provider access
- [ ] 30% reduction in medication optimization opportunities
- [ ] Provider satisfaction score >4.5/5
- [ ] 90% of clinical alerts result in provider action

### 9.3. Compliance Metrics
- [ ] 100% of provider access properly audited
- [ ] 100% compliance with HIPAA minimum necessary rule
- [ ] Zero data breaches or privacy incidents
- [ ] Complete audit trail for all patient-provider interactions

---

## 10. Future Enhancements (Post v7.1)

### 10.1. Advanced Clinical Features
- **AI-Powered Clinical Recommendations**: Machine learning-based clinical suggestions
- **Population Health Analytics**: Provider dashboard with population insights
- **Quality Metrics Tracking**: HEDIS and MIPS quality measure automation
- **Clinical Research Integration**: De-identified data for clinical research

### 10.2. Integration and Interoperability
- **EMR Integration**: HL7 FHIR APIs for EMR system integration
- **Health Information Exchange**: Integration with regional HIEs
- **Telehealth Integration**: Video consultation platform integration
- **Pharmacy Integration**: E-prescribing and medication management

### 10.3. Global Expansion
- **Multi-Country Registries**: Expand beyond Australia to NZ, UK, US
- **Regulatory Compliance**: GDPR (Europe), PIPEDA (Canada) compliance
- **Localization**: Multi-language support for international markets
- **Currency Support**: Multi-currency billing and reimbursement

---

This implementation guide provides a comprehensive roadmap for extending Guardian v7 with provider portal capabilities. The phased approach ensures that the patient platform remains the priority while building a strong foundation for the future healthcare ecosystem platform.

**Ready for Implementation**: Upon completion of Guardian v7 patient platform deployment.