# Feature Flag Integration

**Status**: Planning Phase  
**Created**: 16 September 2025  
**Last Updated**: 16 September 2025

## Overview

This document defines the feature flag architecture for controlling access to language translation and medical literacy features based on subscription tiers, user types, and experimental rollouts. The system integrates with the three-layer architecture (backend tables + per-domain translation tables + per-domain display tables) to provide granular control over feature availability while supporting A/B testing, gradual rollouts, and subscription-based access control.

## Problem Domain

Feature flag management for health data universality presents unique challenges:
- Language translation features require subscription tier enforcement
- Medical literacy features should be available to all users regardless of subscription
- Different languages may have different subscription requirements
- Emergency translation needs to bypass normal subscription restrictions
- A/B testing must respect medical safety requirements
- Feature rollouts need gradual deployment capabilities

## Feature Flag Architecture

### **Core Feature Flag System**

**Feature Flag Database Schema**:
```sql
-- Master feature flag definitions
CREATE TABLE feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_key VARCHAR(100) NOT NULL UNIQUE,
    flag_name TEXT NOT NULL,
    description TEXT,
    flag_type VARCHAR(30) NOT NULL, -- 'boolean', 'string', 'percentage', 'subscription_tier'
    default_value TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    requires_restart BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User-specific feature flag overrides
CREATE TABLE user_feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    flag_key VARCHAR(100) NOT NULL REFERENCES feature_flags(flag_key),
    override_value TEXT NOT NULL,
    override_reason VARCHAR(100), -- 'manual_override', 'ab_test', 'emergency_access'
    expires_at TIMESTAMPTZ,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A/B testing assignments
CREATE TABLE feature_flag_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_name VARCHAR(100) NOT NULL,
    flag_key VARCHAR(100) NOT NULL REFERENCES feature_flags(flag_key),
    variant_name VARCHAR(50) NOT NULL,
    variant_value TEXT NOT NULL,
    traffic_percentage NUMERIC(5,2) NOT NULL, -- 0.00-100.00
    target_user_segments TEXT[], -- 'new_users', 'premium_users', 'healthcare_providers'
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Core health data universality feature flags
INSERT INTO feature_flags (flag_key, flag_name, description, flag_type, default_value) VALUES
('language_translation_enabled', 'Language Translation Features', 'Enable AI-powered language translation', 'subscription_tier', 'premium'),
('medical_literacy_enabled', 'Medical Literacy Levels', 'Enable medical jargon vs simplified language toggle', 'boolean', 'true'),
('emergency_translation_enabled', 'Emergency Translation', 'Enable emergency translation for unplanned scenarios', 'subscription_tier', 'premium'),
('healthcare_provider_patient_view', 'Healthcare Provider Patient View', 'Enable patient view toggle for healthcare providers', 'boolean', 'true'),
('foreign_language_upload_processing', 'Foreign Language Document Processing', 'Enable processing of non-English documents', 'subscription_tier', 'premium'),
('shared_profile_translation', 'Shared Profile Translation', 'Enable translated shared health profiles', 'subscription_tier', 'premium');
```

### **Subscription-Based Feature Access**

**Subscription Tier Feature Matrix**:
```sql
-- Feature access by subscription tier
CREATE TABLE subscription_feature_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_tier VARCHAR(20) NOT NULL, -- 'free', 'premium', 'enterprise'
    flag_key VARCHAR(100) NOT NULL REFERENCES feature_flags(flag_key),
    is_enabled BOOLEAN NOT NULL,
    usage_limits JSONB, -- Limits specific to this tier
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Define feature access matrix
INSERT INTO subscription_feature_access (subscription_tier, flag_key, is_enabled, usage_limits) VALUES
-- Free tier
('free', 'medical_literacy_enabled', TRUE, '{"complexity_levels": ["simplified", "medical_jargon"]}'),
('free', 'healthcare_provider_patient_view', TRUE, '{}'),
('free', 'language_translation_enabled', FALSE, '{"primary_language_only": true}'),
('free', 'emergency_translation_enabled', FALSE, '{}'),
('free', 'foreign_language_upload_processing', FALSE, '{}'),
('free', 'shared_profile_translation', FALSE, '{}'),

-- Premium tier
('premium', 'medical_literacy_enabled', TRUE, '{"complexity_levels": ["simplified", "medical_jargon"]}'),
('premium', 'healthcare_provider_patient_view', TRUE, '{}'),
('premium', 'language_translation_enabled', TRUE, '{"max_languages": 5, "translation_quality": "standard"}'),
('premium', 'emergency_translation_enabled', TRUE, '{"max_emergency_sessions": 10, "session_duration": "6 hours"}'),
('premium', 'foreign_language_upload_processing', TRUE, '{"max_documents_per_month": 50}'),
('premium', 'shared_profile_translation', TRUE, '{"max_shared_profiles": 20}'),

-- Enterprise tier
('enterprise', 'medical_literacy_enabled', TRUE, '{"complexity_levels": ["simplified", "medical_jargon", "professional"]}'),
('enterprise', 'healthcare_provider_patient_view', TRUE, '{}'),
('enterprise', 'language_translation_enabled', TRUE, '{"unlimited_languages": true, "translation_quality": "premium"}'),
('enterprise', 'emergency_translation_enabled', TRUE, '{"unlimited_emergency_sessions": true}'),
('enterprise', 'foreign_language_upload_processing', TRUE, '{"unlimited_documents": true}'),
('enterprise', 'shared_profile_translation', TRUE, '{"unlimited_shared_profiles": true}');
```

### **Feature Flag Evaluation Engine**

**Core Evaluation Function**:
```sql
-- Function to check if feature is enabled for user
CREATE OR REPLACE FUNCTION is_feature_enabled(
    p_profile_id UUID,
    p_flag_key VARCHAR(100),
    p_context JSONB DEFAULT '{}'
) RETURNS TABLE (
    is_enabled BOOLEAN,
    effective_value TEXT,
    access_source VARCHAR(30), -- 'subscription', 'override', 'experiment', 'emergency'
    usage_limits JSONB,
    restriction_reason TEXT
) AS $$
DECLARE
    user_subscription VARCHAR(20);
    flag_config RECORD;
    user_override TEXT;
    experiment_value TEXT;
    subscription_access RECORD;
    emergency_context BOOLEAN;
BEGIN
    -- Get user's current subscription tier
    SELECT subscription_tier INTO user_subscription
    FROM user_profiles 
    WHERE id = p_profile_id;
    
    -- Get feature flag configuration
    SELECT * INTO flag_config
    FROM feature_flags 
    WHERE flag_key = p_flag_key AND is_active = TRUE;
    
    -- Check for emergency context (bypasses normal restrictions)
    emergency_context := COALESCE((p_context->>'emergency_translation')::BOOLEAN, FALSE);
    
    -- Check for user-specific override
    SELECT override_value INTO user_override
    FROM user_feature_flags
    WHERE profile_id = p_profile_id 
    AND flag_key = p_flag_key
    AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Check for A/B testing assignment
    SELECT variant_value INTO experiment_value
    FROM feature_flag_experiments ffe
    WHERE ffe.flag_key = p_flag_key
    AND ffe.is_active = TRUE
    AND NOW() BETWEEN ffe.start_date AND COALESCE(ffe.end_date, NOW() + INTERVAL '1 year')
    AND (
        'all_users' = ANY(ffe.target_user_segments) OR
        user_subscription = ANY(ffe.target_user_segments)
    )
    -- Simple hash-based assignment (simplified for example)
    AND (abs(hashtext(p_profile_id::TEXT || p_flag_key)) % 100) < ffe.traffic_percentage
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Get subscription-based access
    SELECT * INTO subscription_access
    FROM subscription_feature_access sfa
    WHERE sfa.subscription_tier = user_subscription
    AND sfa.flag_key = p_flag_key;
    
    -- Determine final access (priority: override > experiment > subscription > default)
    IF user_override IS NOT NULL THEN
        RETURN QUERY SELECT 
            user_override::BOOLEAN,
            user_override,
            'override'::VARCHAR(30),
            COALESCE(subscription_access.usage_limits, '{}'::JSONB),
            NULL::TEXT;
    ELSIF experiment_value IS NOT NULL THEN
        RETURN QUERY SELECT 
            experiment_value::BOOLEAN,
            experiment_value,
            'experiment'::VARCHAR(30),
            COALESCE(subscription_access.usage_limits, '{}'::JSONB),
            NULL::TEXT;
    ELSIF emergency_context AND p_flag_key IN ('emergency_translation_enabled', 'language_translation_enabled') THEN
        RETURN QUERY SELECT 
            TRUE,
            'true',
            'emergency'::VARCHAR(30),
            '{"emergency_session": true, "max_duration": "6 hours"}'::JSONB,
            NULL::TEXT;
    ELSIF subscription_access.is_enabled THEN
        RETURN QUERY SELECT 
            TRUE,
            'true',
            'subscription'::VARCHAR(30),
            subscription_access.usage_limits,
            NULL::TEXT;
    ELSE
        RETURN QUERY SELECT 
            FALSE,
            'false',
            'subscription'::VARCHAR(30),
            '{}'::JSONB,
            CASE 
                WHEN user_subscription = 'free' THEN 'Premium subscription required'
                ELSE 'Feature not available in current subscription tier'
            END;
    END IF;
END;
$$ LANGUAGE plpgsql;
```

## Language-Specific Feature Flags

### **Language Tier Access Control**

**Language-Level Feature Restrictions**:
```sql
-- Language-specific access control
CREATE TABLE language_feature_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    language_code VARCHAR(10) NOT NULL REFERENCES supported_languages(language_code),
    subscription_tier VARCHAR(20) NOT NULL,
    feature_type VARCHAR(30) NOT NULL, -- 'translation', 'emergency_translation', 'shared_profiles'
    is_enabled BOOLEAN NOT NULL,
    quality_tier VARCHAR(20), -- 'standard', 'premium', 'experimental'
    usage_limits JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Language access matrix
INSERT INTO language_feature_access (language_code, subscription_tier, feature_type, is_enabled, quality_tier, usage_limits) VALUES
-- Free tier - Primary language only (usually English)
('en-AU', 'free', 'translation', TRUE, 'standard', '{"primary_language": true}'),
('en-US', 'free', 'translation', TRUE, 'standard', '{"primary_language": true}'),

-- Premium tier - Major languages
('es-ES', 'premium', 'translation', TRUE, 'standard', '{"translation_confidence": 0.90}'),
('fr-FR', 'premium', 'translation', TRUE, 'standard', '{"translation_confidence": 0.88}'),
('zh-CN', 'premium', 'translation', TRUE, 'standard', '{"translation_confidence": 0.85}'),
('de-DE', 'premium', 'translation', TRUE, 'standard', '{"translation_confidence": 0.87}'),

-- Enterprise tier - All languages including experimental
('hi-IN', 'enterprise', 'translation', TRUE, 'experimental', '{"translation_confidence": 0.75, "disclaimer_required": true}'),
('ar-SA', 'enterprise', 'translation', TRUE, 'experimental', '{"translation_confidence": 0.70, "disclaimer_required": true}'),
('ja-JP', 'enterprise', 'translation', TRUE, 'premium', '{"translation_confidence": 0.82}');

-- Function to check language-specific access
CREATE OR REPLACE FUNCTION is_language_accessible(
    p_profile_id UUID,
    p_language_code VARCHAR(10),
    p_feature_type VARCHAR(30) DEFAULT 'translation'
) RETURNS TABLE (
    is_accessible BOOLEAN,
    quality_tier VARCHAR(20),
    confidence_threshold NUMERIC(3,2),
    requires_disclaimer BOOLEAN,
    upgrade_tier_needed VARCHAR(20)
) AS $$
DECLARE
    user_tier VARCHAR(20);
    lang_access RECORD;
    primary_lang VARCHAR(10);
BEGIN
    -- Get user subscription and primary language
    SELECT up.subscription_tier, ulp.primary_language
    INTO user_tier, primary_lang
    FROM user_profiles up
    JOIN user_language_preferences ulp ON ulp.profile_id = up.id
    WHERE up.id = p_profile_id;
    
    -- Check if this is user's primary language (always accessible)
    IF p_language_code = primary_lang THEN
        RETURN QUERY SELECT 
            TRUE,
            'native'::VARCHAR(20),
            1.00::NUMERIC(3,2),
            FALSE,
            NULL::VARCHAR(20);
        RETURN;
    END IF;
    
    -- Check language-specific access for user's tier
    SELECT * INTO lang_access
    FROM language_feature_access lfa
    WHERE lfa.language_code = p_language_code
    AND lfa.subscription_tier = user_tier
    AND lfa.feature_type = p_feature_type
    AND lfa.is_enabled = TRUE;
    
    IF FOUND THEN
        RETURN QUERY SELECT 
            TRUE,
            lang_access.quality_tier,
            COALESCE((lang_access.usage_limits->>'translation_confidence')::NUMERIC, 0.85),
            COALESCE((lang_access.usage_limits->>'disclaimer_required')::BOOLEAN, FALSE),
            NULL::VARCHAR(20);
    ELSE
        -- Find minimum tier that would grant access
        SELECT lfa.subscription_tier INTO lang_access
        FROM language_feature_access lfa
        WHERE lfa.language_code = p_language_code
        AND lfa.feature_type = p_feature_type
        AND lfa.is_enabled = TRUE
        ORDER BY 
            CASE lfa.subscription_tier 
                WHEN 'premium' THEN 1 
                WHEN 'enterprise' THEN 2 
                ELSE 3 
            END
        LIMIT 1;
        
        RETURN QUERY SELECT 
            FALSE,
            NULL::VARCHAR(20),
            NULL::NUMERIC(3,2),
            FALSE,
            COALESCE(lang_access.subscription_tier, 'premium')::VARCHAR(20);
    END IF;
END;
$$ LANGUAGE plpgsql;
```

## Paywall Implementation

### **Subscription Upgrade Prompts**

**Dynamic Paywall System**:
```sql
-- Paywall trigger events and messaging
CREATE TABLE paywall_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_key VARCHAR(100) NOT NULL UNIQUE,
    trigger_name TEXT NOT NULL,
    required_subscription_tier VARCHAR(20) NOT NULL,
    trigger_context VARCHAR(50) NOT NULL, -- 'language_selection', 'emergency_translation', 'document_upload'
    prompt_message TEXT NOT NULL,
    value_proposition TEXT[],
    call_to_action TEXT NOT NULL,
    urgency_level VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'emergency'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Paywall messaging
INSERT INTO paywall_triggers (trigger_key, trigger_name, required_subscription_tier, trigger_context, prompt_message, value_proposition, call_to_action, urgency_level) VALUES
('language_translation_paywall', 'Language Translation Access', 'premium', 'language_selection', 
 'Unlock translation to {language_name} with Premium', 
 ARRAY['Translate your health profile to 15+ languages', 'Emergency translation for travel', 'Share profiles with international doctors'], 
 'Start 14-day free trial', 'normal'),
 
('emergency_translation_paywall', 'Emergency Translation Access', 'premium', 'emergency_translation',
 'Emergency translation to {language_name} requires Premium', 
 ARRAY['Instant emergency translation', 'Access your health info anywhere in the world', 'Share with foreign healthcare providers'], 
 'Upgrade now for immediate access', 'emergency'),
 
('foreign_document_paywall', 'Foreign Document Processing', 'premium', 'document_upload',
 'Process documents in {language_name} with Premium', 
 ARRAY['Upload documents in any language', 'Automatic translation to your preferred language', 'Preserve medical accuracy across languages'], 
 'Upgrade to process this document', 'high');

-- Function to get appropriate paywall prompt
CREATE OR REPLACE FUNCTION get_paywall_prompt(
    p_profile_id UUID,
    p_trigger_key VARCHAR(100),
    p_context JSONB DEFAULT '{}'
) RETURNS TABLE (
    should_show_paywall BOOLEAN,
    prompt_message TEXT,
    value_proposition TEXT[],
    call_to_action TEXT,
    trial_available BOOLEAN,
    urgency_level VARCHAR(20)
) AS $$
DECLARE
    user_tier VARCHAR(20);
    trigger_config RECORD;
    has_trial BOOLEAN;
    language_name TEXT;
BEGIN
    -- Get user subscription tier
    SELECT subscription_tier INTO user_tier
    FROM user_profiles 
    WHERE id = p_profile_id;
    
    -- Get paywall trigger configuration
    SELECT * INTO trigger_config
    FROM paywall_triggers 
    WHERE trigger_key = p_trigger_key AND is_active = TRUE;
    
    -- Check if user already has required tier
    IF user_tier = trigger_config.required_subscription_tier OR 
       (trigger_config.required_subscription_tier = 'premium' AND user_tier = 'enterprise') THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT[], NULL::TEXT, FALSE, NULL::VARCHAR(20);
        RETURN;
    END IF;
    
    -- Check trial availability
    SELECT NOT EXISTS(
        SELECT 1 FROM subscription_trials st
        WHERE st.profile_id = p_profile_id 
        AND st.trial_type = 'premium_features'
    ) INTO has_trial;
    
    -- Get language name for message personalization
    language_name := COALESCE(p_context->>'language_name', 'your selected language');
    
    -- Return paywall prompt
    RETURN QUERY SELECT
        TRUE,
        replace(trigger_config.prompt_message, '{language_name}', language_name),
        trigger_config.value_proposition,
        CASE 
            WHEN has_trial THEN trigger_config.call_to_action
            ELSE 'Upgrade to Premium'
        END,
        has_trial,
        trigger_config.urgency_level;
END;
$$ LANGUAGE plpgsql;
```

### **Trial Management System**

**Free Trial Access Control**:
```sql
-- Free trial management
CREATE TABLE subscription_trials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    trial_type VARCHAR(30) NOT NULL, -- 'premium_features', 'language_translation', 'emergency_access'
    trial_duration INTERVAL NOT NULL DEFAULT INTERVAL '14 days',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    features_unlocked TEXT[],
    usage_tracking JSONB DEFAULT '{}',
    conversion_eligible BOOLEAN DEFAULT TRUE,
    converted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Function to start free trial
CREATE OR REPLACE FUNCTION start_free_trial(
    p_profile_id UUID,
    p_trial_type VARCHAR(30),
    p_requested_features TEXT[] DEFAULT ARRAY[]::TEXT[]
) RETURNS TABLE (
    trial_started BOOLEAN,
    expires_at TIMESTAMPTZ,
    features_unlocked TEXT[],
    trial_message TEXT
) AS $$
DECLARE
    existing_trial RECORD;
    trial_features TEXT[];
    expiry_time TIMESTAMPTZ;
BEGIN
    -- Check for existing trial
    SELECT * INTO existing_trial
    FROM subscription_trials st
    WHERE st.profile_id = p_profile_id 
    AND st.trial_type = p_trial_type;
    
    -- If trial already exists and not expired, return existing
    IF FOUND AND existing_trial.expires_at > NOW() THEN
        RETURN QUERY SELECT 
            FALSE,
            existing_trial.expires_at,
            existing_trial.features_unlocked,
            format('Your %s trial is already active until %s', p_trial_type, existing_trial.expires_at::DATE);
        RETURN;
    END IF;
    
    -- If trial already used, deny new trial
    IF FOUND AND existing_trial.expires_at <= NOW() THEN
        RETURN QUERY SELECT 
            FALSE,
            NULL::TIMESTAMPTZ,
            ARRAY[]::TEXT[],
            'Free trial for this feature has already been used';
        RETURN;
    END IF;
    
    -- Determine trial features based on type
    trial_features := CASE p_trial_type
        WHEN 'premium_features' THEN ARRAY['language_translation_enabled', 'emergency_translation_enabled', 'foreign_language_upload_processing']
        WHEN 'language_translation' THEN ARRAY['language_translation_enabled']
        WHEN 'emergency_access' THEN ARRAY['emergency_translation_enabled']
        ELSE p_requested_features
    END;
    
    expiry_time := NOW() + INTERVAL '14 days';
    
    -- Create trial record
    INSERT INTO subscription_trials (
        profile_id,
        trial_type,
        expires_at,
        features_unlocked
    ) VALUES (
        p_profile_id,
        p_trial_type,
        expiry_time,
        trial_features
    );
    
    -- Create temporary feature flag overrides for trial period
    INSERT INTO user_feature_flags (profile_id, flag_key, override_value, override_reason, expires_at)
    SELECT 
        p_profile_id,
        unnest(trial_features),
        'true',
        'free_trial',
        expiry_time;
    
    RETURN QUERY SELECT 
        TRUE,
        expiry_time,
        trial_features,
        format('Your 14-day free trial has started! Enjoy %s premium features.', array_length(trial_features, 1));
END;
$$ LANGUAGE plpgsql;
```

## A/B Testing Framework

### **Medical-Safe A/B Testing**

**A/B Testing with Safety Constraints**:
```sql
-- A/B testing safety rules for medical features
CREATE TABLE ab_test_safety_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_name VARCHAR(100) NOT NULL,
    safety_constraint VARCHAR(50) NOT NULL, -- 'medical_accuracy_required', 'provider_approval_only', 'no_emergency_context'
    constraint_description TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safety constraints for health data universality A/B tests
INSERT INTO ab_test_safety_rules (experiment_name, safety_constraint, constraint_description) VALUES
('translation_confidence_threshold', 'medical_accuracy_required', 'Translation confidence must remain above 0.80 for all medical content'),
('simplified_language_alternatives', 'provider_approval_only', 'Medical simplification changes require healthcare provider review'),
('emergency_translation_ui', 'no_emergency_context', 'UI changes cannot be tested in actual emergency situations'),
('paywall_messaging', 'medical_accuracy_required', 'Paywall cannot prevent access to critical medical information');

-- Function to validate A/B test safety
CREATE OR REPLACE FUNCTION validate_ab_test_safety(
    p_profile_id UUID,
    p_experiment_name VARCHAR(100),
    p_context JSONB DEFAULT '{}'
) RETURNS TABLE (
    is_safe_to_test BOOLEAN,
    safety_violations TEXT[],
    fallback_required BOOLEAN
) AS $$
DECLARE
    user_type VARCHAR(20);
    is_emergency BOOLEAN;
    safety_constraints RECORD;
    violations TEXT[] := ARRAY[]::TEXT[];
    is_safe BOOLEAN := TRUE;
BEGIN
    -- Get user context
    SELECT 
        CASE 
            WHEN EXISTS(SELECT 1 FROM healthcare_provider_verification WHERE profile_id = p_profile_id) THEN 'healthcare_provider'
            ELSE 'patient'
        END,
        COALESCE((p_context->>'is_emergency')::BOOLEAN, FALSE)
    INTO user_type, is_emergency;
    
    -- Check each safety constraint for this experiment
    FOR safety_constraints IN 
        SELECT * FROM ab_test_safety_rules 
        WHERE experiment_name = p_experiment_name AND is_active = TRUE
    LOOP
        CASE safety_constraints.safety_constraint
            WHEN 'medical_accuracy_required' THEN
                -- Cannot test changes that might reduce medical accuracy
                IF p_context ? 'reduces_accuracy' AND (p_context->>'reduces_accuracy')::BOOLEAN THEN
                    violations := array_append(violations, 'Experiment may reduce medical accuracy');
                    is_safe := FALSE;
                END IF;
                
            WHEN 'provider_approval_only' THEN
                -- Only healthcare providers can participate in certain tests
                IF user_type != 'healthcare_provider' THEN
                    violations := array_append(violations, 'Experiment restricted to healthcare providers');
                    is_safe := FALSE;
                END IF;
                
            WHEN 'no_emergency_context' THEN
                -- Cannot test UI changes during emergency scenarios
                IF is_emergency THEN
                    violations := array_append(violations, 'Testing not allowed in emergency context');
                    is_safe := FALSE;
                END IF;
        END CASE;
    END LOOP;
    
    RETURN QUERY SELECT is_safe, violations, NOT is_safe;
END;
$$ LANGUAGE plpgsql;
```

### **Feature Rollout Management**

**Gradual Feature Deployment**:
```sql
-- Feature rollout phases
CREATE TABLE feature_rollout_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_key VARCHAR(100) NOT NULL REFERENCES feature_flags(flag_key),
    phase_name VARCHAR(50) NOT NULL, -- 'alpha', 'beta', 'gradual_rollout', 'full_release'
    phase_percentage NUMERIC(5,2) NOT NULL, -- 0.00-100.00
    target_user_segments TEXT[],
    success_criteria JSONB,
    rollback_criteria JSONB,
    phase_start_date DATE NOT NULL,
    phase_end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Example rollout phases for language translation
INSERT INTO feature_rollout_phases (flag_key, phase_name, phase_percentage, target_user_segments, success_criteria, phase_start_date) VALUES
('language_translation_enabled', 'alpha', 5.00, ARRAY['healthcare_providers', 'beta_testers'], 
 '{"translation_accuracy": 0.90, "user_satisfaction": 4.0, "error_rate": 0.05}', '2025-10-01'),
('language_translation_enabled', 'beta', 25.00, ARRAY['premium_users'], 
 '{"translation_accuracy": 0.88, "user_satisfaction": 3.8, "support_tickets": 10}', '2025-11-01'),
('language_translation_enabled', 'gradual_rollout', 75.00, ARRAY['all_users'], 
 '{"system_stability": 0.99, "translation_success_rate": 0.95}', '2025-12-01');

-- Function to check rollout eligibility
CREATE OR REPLACE FUNCTION is_user_in_rollout_phase(
    p_profile_id UUID,
    p_flag_key VARCHAR(100)
) RETURNS TABLE (
    is_eligible BOOLEAN,
    phase_name VARCHAR(50),
    rollout_percentage NUMERIC(5,2)
) AS $$
DECLARE
    user_segments TEXT[];
    active_phase RECORD;
    user_hash INTEGER;
BEGIN
    -- Get user segments
    SELECT ARRAY[
        up.subscription_tier,
        CASE WHEN EXISTS(SELECT 1 FROM healthcare_provider_verification WHERE profile_id = p_profile_id) 
             THEN 'healthcare_providers' ELSE 'patients' END,
        CASE WHEN up.created_at < NOW() - INTERVAL '30 days' 
             THEN 'existing_users' ELSE 'new_users' END
    ] INTO user_segments
    FROM user_profiles up
    WHERE up.id = p_profile_id;
    
    -- Get current active rollout phase
    SELECT * INTO active_phase
    FROM feature_rollout_phases frp
    WHERE frp.flag_key = p_flag_key
    AND frp.is_active = TRUE
    AND NOW() BETWEEN frp.phase_start_date AND COALESCE(frp.phase_end_date, NOW() + INTERVAL '1 year')
    AND (
        'all_users' = ANY(frp.target_user_segments) OR
        frp.target_user_segments && user_segments
    )
    ORDER BY frp.phase_percentage DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::VARCHAR(50), NULL::NUMERIC(5,2);
        RETURN;
    END IF;
    
    -- Consistent hash-based assignment
    user_hash := abs(hashtext(p_profile_id::TEXT || p_flag_key)) % 10000;
    
    RETURN QUERY SELECT
        (user_hash < (active_phase.phase_percentage * 100)::INTEGER),
        active_phase.phase_name,
        active_phase.phase_percentage;
END;
$$ LANGUAGE plpgsql;
```

This feature flag integration system provides comprehensive control over health data universality features while maintaining medical safety standards and supporting flexible business model requirements. The system works seamlessly with the three-layer architecture to control access to translation tables, display table population, and backend table enhancements based on subscription tiers and feature rollout phases.