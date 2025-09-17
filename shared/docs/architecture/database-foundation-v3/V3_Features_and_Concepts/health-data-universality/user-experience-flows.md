# User Experience Flows

**Status**: Planning Phase  
**Created**: 16 September 2025  
**Last Updated**: 16 September 2025

## Overview

This document defines the complete user experience workflows for language and medical literacy features across all user types and scenarios using the three-layer architecture (backend tables + per-domain translation tables + per-domain display tables). The flows ensure intuitive access to health data universality features while respecting subscription tiers, user preferences, and clinical safety requirements.

## User Journey Architecture

### **Primary User Types and Default Behaviors**

**User Type Classification**:
- **Patient (Individual)**: Default to simplified medical language, primary country language
- **Healthcare Provider**: Default to medical jargon, professional terminology preferences
- **Family Member/Caregiver**: Default to simplified language, family's primary language
- **International Visitor**: Context-aware language detection, emergency translation capability

## Onboarding Experience Flows

### **Initial User Registration and Language Setup**

**New User Onboarding Workflow**:

**Step 1: Basic Profile Creation**
- User creates account with email/magic link authentication
- System detects browser language and geographic location
- Pre-populates primary language based on detection

**Step 2: User Type Identification**
```sql
-- User type selection interface
SELECT 
    user_type_option,
    default_complexity,
    available_features,
    subscription_tier_required
FROM user_type_options
WHERE is_active = TRUE
ORDER BY display_order;

-- Options presented:
-- "I'm a patient managing my own health" → 'patient', 'simplified', basic features, 'free'
-- "I'm a healthcare provider" → 'healthcare_provider', 'medical_jargon', professional features, verification required
-- "I'm helping manage family member's health" → 'caregiver', 'simplified', family features, 'free'
```

**Step 3: Language Preference Configuration**
```sql
-- Available languages for user's subscription tier
WITH user_subscription AS (
    SELECT 'free' as current_tier -- From user registration
)
SELECT 
    sl.language_code,
    sl.language_name,
    sl.native_name,
    sl.availability_status,
    sl.medical_translation_quality,
    CASE 
        WHEN sl.subscription_tier_required = 'free' THEN TRUE
        WHEN us.current_tier = 'premium' AND sl.subscription_tier_required IN ('free', 'premium') THEN TRUE
        ELSE FALSE
    END as is_accessible,
    sl.subscription_tier_required as upgrade_needed
FROM supported_languages sl, user_subscription us
WHERE sl.availability_status IN ('available', 'beta')
ORDER BY sl.medical_translation_quality DESC;
```

**Step 4: Medical Complexity Preference**
- Present complexity level examples:
  - **Medical Jargon**: "Non-small cell lung carcinoma"
  - **Patient-Friendly**: "Lung cancer"
- Allow user to select preference with ability to change later
- Healthcare providers automatically default to medical jargon

**Step 5: Premium Feature Introduction**
- Show preview of additional languages available with premium subscription
- Offer free trial period for translation features
- Present upgrade option with clear value proposition

### **Healthcare Provider Verification Flow**

**Professional Verification Process**:
```sql
-- Healthcare provider verification workflow
INSERT INTO healthcare_provider_verification (
    profile_id,
    provider_type,
    license_number,
    verification_documents,
    verification_status
) VALUES (
    $profile_id,
    $provider_type, -- Selected from: 'doctor', 'nurse', 'pharmacist', 'researcher', 'other'
    $license_number,
    $document_urls, -- Array of uploaded verification documents
    'pending'
);
```

**Verification States and UX**:
- **Pending**: User can access basic features, medical jargon default, verification notice shown
- **Verified**: Full healthcare provider features unlocked, patient view toggle available
- **Rejected**: Falls back to patient user type, can resubmit with additional documentation

## Core Feature Usage Flows

### **Language and Complexity Toggle Experience**

**Dashboard Language Switching**:
```sql
-- User language toggle interface
CREATE OR REPLACE FUNCTION switch_user_display_language(
    p_profile_id UUID,
    p_new_language VARCHAR(10),
    p_session_token VARCHAR(255)
) RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    translation_status VARCHAR(20),
    estimated_completion_time INTERVAL
) AS $$
DECLARE
    lang_available BOOLEAN;
    translation_exists BOOLEAN;
    user_tier VARCHAR(20);
BEGIN
    -- Check if language is available for user's subscription
    SELECT 
        (sl.subscription_tier_required = 'free' OR up.subscription_tier IN ('premium', 'enterprise')),
        up.subscription_tier
    INTO lang_available, user_tier
    FROM supported_languages sl, user_profiles up
    WHERE sl.language_code = p_new_language 
    AND up.id = p_profile_id;
    
    IF NOT lang_available THEN
        RETURN QUERY SELECT FALSE, 'Premium subscription required for this language', 'upgrade_needed'::VARCHAR(20), NULL::INTERVAL;
        RETURN;
    END IF;
    
    -- Check if translations already exist in display tables
    SELECT EXISTS(
        SELECT 1 FROM medications_display md
        JOIN patient_medications pm ON pm.id = md.medication_id
        WHERE pm.patient_id IN (SELECT id FROM user_profiles WHERE id = p_profile_id)
        AND md.language_code = p_new_language
        
        UNION
        
        SELECT 1 FROM conditions_display cd
        JOIN patient_conditions pc ON pc.id = cd.condition_id
        WHERE pc.patient_id IN (SELECT id FROM user_profiles WHERE id = p_profile_id)
        AND cd.language_code = p_new_language
    ) INTO translation_exists;
    
    -- If no display tables, check translation tables
    IF NOT translation_exists THEN
        SELECT EXISTS(
            SELECT 1 FROM medication_translations mt
            JOIN patient_medications pm ON pm.id = mt.medication_id
            WHERE pm.patient_id IN (SELECT id FROM user_profiles WHERE id = p_profile_id)
            AND mt.target_language = p_new_language
            
            UNION
            
            SELECT 1 FROM condition_translations ct
            JOIN patient_conditions pc ON pc.id = ct.condition_id
            WHERE pc.patient_id IN (SELECT id FROM user_profiles WHERE id = p_profile_id)
            AND ct.target_language = p_new_language
        ) INTO translation_exists;
    END IF;
    
    -- Update user session preference
    INSERT INTO user_session_preferences (profile_id, session_token, temporary_language, expires_at)
    VALUES (p_profile_id, p_session_token, p_new_language, NOW() + INTERVAL '24 hours')
    ON CONFLICT (session_token) DO UPDATE SET
        temporary_language = p_new_language,
        expires_at = NOW() + INTERVAL '24 hours';
    
    IF translation_exists THEN
        RETURN QUERY SELECT TRUE, 'Language switched successfully', 'ready'::VARCHAR(20), NULL::INTERVAL;
    ELSE
        -- Trigger background translation via sync queue
        INSERT INTO translation_sync_queue (entity_id, entity_type, operation, priority, payload)
        SELECT 
            pm.id,
            'medication',
            'translate',
            2, -- High priority for user-requested language
            jsonb_build_object(
                'target_language', p_new_language,
                'complexity_levels', ARRAY['medical_jargon', 'simplified'],
                'populate_display', true
            )
        FROM patient_medications pm
        WHERE pm.patient_id IN (SELECT id FROM user_profiles WHERE id = p_profile_id);
        
        INSERT INTO translation_sync_queue (entity_id, entity_type, operation, priority, payload)
        SELECT 
            pc.id,
            'condition',
            'translate',
            2,
            jsonb_build_object(
                'target_language', p_new_language,
                'complexity_levels', ARRAY['medical_jargon', 'simplified'],
                'populate_display', true
            )
        FROM patient_conditions pc
        WHERE pc.patient_id IN (SELECT id FROM user_profiles WHERE id = p_profile_id);
        
        RETURN QUERY SELECT TRUE, 'Preparing translations...', 'processing'::VARCHAR(20), INTERVAL '2-5 minutes';
    END IF;
END;
$$ LANGUAGE plpgsql;
```

**Medical Complexity Toggle Interface**:
- **Patient View**: 
  - Simple toggle: "Medical terms" ↔ "Simple language"
  - Shows immediate preview of change
  - Click on any entity shows detailed medical version in overlay
  
- **Healthcare Provider View**:
  - Default: Medical jargon with "Patient View" toggle prominent
  - "Patient View" mode shows how patients see their information
  - Clear indicator when in patient view mode

### **Emergency Translation Scenarios**

**Unplanned Travel Translation (Russia Example)**:

**Emergency Translation Workflow**:
1. **Situation**: Australian user with English profile traveling to Russia, needs medical care
2. **Access Point**: "Emergency Translation" button in app header
3. **Language Selection**: Quick country/language selector with common travel destinations
4. **Immediate Translation**: Frontend real-time translation of current view
5. **Sharing Preparation**: Option to create shared profile link for Russian healthcare provider

**Emergency Translation Implementation**:
```sql
-- Emergency translation session management
CREATE OR REPLACE FUNCTION create_emergency_translation_session(
    p_profile_id UUID,
    p_emergency_language VARCHAR(10),
    p_location_context TEXT DEFAULT NULL -- 'travel_to_russia', 'emergency_room', etc.
) RETURNS TABLE (
    session_token VARCHAR(255),
    translation_url TEXT,
    estimated_cost NUMERIC(5,2),
    session_duration INTERVAL
) AS $$
DECLARE
    emergency_session_token VARCHAR(255);
    profile_size_estimate INTEGER;
    cost_estimate NUMERIC(5,2);
BEGIN
    -- Generate emergency session token
    emergency_session_token := gen_random_uuid()::TEXT || '_emergency';
    
    -- Estimate profile size for cost calculation using backend tables
    SELECT COUNT(*) INTO profile_size_estimate
    FROM (
        SELECT id FROM patient_medications WHERE patient_id IN (SELECT id FROM user_profiles WHERE id = p_profile_id)
        UNION ALL
        SELECT id FROM patient_conditions WHERE patient_id IN (SELECT id FROM user_profiles WHERE id = p_profile_id)
        UNION ALL
        SELECT id FROM patient_allergies WHERE patient_id IN (SELECT id FROM user_profiles WHERE id = p_profile_id)
    ) entities;
    
    -- Calculate emergency translation cost (higher than batch)
    cost_estimate := profile_size_estimate * 0.15; -- $0.15 per entity for emergency translation
    
    -- Create emergency session
    INSERT INTO user_session_preferences (
        profile_id, 
        session_token, 
        temporary_language, 
        expires_at
    ) VALUES (
        p_profile_id,
        emergency_session_token,
        p_emergency_language,
        NOW() + INTERVAL '6 hours' -- Shorter for emergency sessions
    );
    
    -- Log emergency translation request
    INSERT INTO emergency_translation_logs (
        profile_id,
        session_token,
        emergency_language,
        location_context,
        estimated_cost,
        created_at
    ) VALUES (
        p_profile_id,
        emergency_session_token,
        p_emergency_language,
        p_location_context,
        cost_estimate,
        NOW()
    );
    
    RETURN QUERY SELECT
        emergency_session_token,
        format('/emergency-profile/%s', emergency_session_token) as translation_url,
        cost_estimate,
        INTERVAL '6 hours';
END;
$$ LANGUAGE plpgsql;
```

**Emergency Translation User Experience**:
1. **Cost Transparency**: "Emergency translation: ~$3.50 for Russian translation"
2. **Speed Options**: 
   - "Quick essentials" (medications, allergies): 30 seconds
   - "Complete profile": 2-3 minutes
3. **Sharing Options**: Generate QR code or shareable link for healthcare provider
4. **Automatic Upgrade Prompt**: "Save for future travel? Upgrade to permanent Russian translation"

### **Healthcare Provider "Patient View" Experience**

**Provider Patient View Toggle**:

**Access and Authentication**:
```sql
-- Verify provider access to patient view
CREATE OR REPLACE FUNCTION verify_provider_patient_view_access(
    p_provider_profile_id UUID,
    p_patient_profile_id UUID DEFAULT NULL
) RETURNS TABLE (
    has_access BOOLEAN,
    access_type VARCHAR(20), -- 'own_profile', 'shared_access', 'emergency_access'
    restrictions TEXT[]
) AS $$
DECLARE
    is_verified_provider BOOLEAN;
    shared_access_exists BOOLEAN;
BEGIN
    -- Check if user is verified healthcare provider
    SELECT EXISTS(
        SELECT 1 FROM healthcare_provider_verification hpv
        WHERE hpv.profile_id = p_provider_profile_id 
        AND hpv.verification_status = 'verified'
    ) INTO is_verified_provider;
    
    IF NOT is_verified_provider THEN
        RETURN QUERY SELECT FALSE, 'not_verified'::VARCHAR(20), ARRAY['Healthcare provider verification required']::TEXT[];
        RETURN;
    END IF;
    
    -- If viewing own profile, always allow
    IF p_patient_profile_id IS NULL OR p_patient_profile_id = p_provider_profile_id THEN
        RETURN QUERY SELECT TRUE, 'own_profile'::VARCHAR(20), ARRAY[]::TEXT[];
        RETURN;
    END IF;
    
    -- Check for shared profile access
    SELECT EXISTS(
        SELECT 1 FROM shared_health_profiles shp
        WHERE shp.patient_id = p_patient_profile_id
        AND shp.expiry_date > NOW()
        AND 'healthcare_provider' = ANY(shp.authorized_viewer_types)
    ) INTO shared_access_exists;
    
    IF shared_access_exists THEN
        RETURN QUERY SELECT TRUE, 'shared_access'::VARCHAR(20), ARRAY['Limited to shared permissions']::TEXT[];
    ELSE
        RETURN QUERY SELECT FALSE, 'no_access'::VARCHAR(20), ARRAY['No patient sharing permissions']::TEXT[];
    END IF;
END;
$$ LANGUAGE plpgsql;
```

**Patient View Interface**:
- **Clear Visual Indicator**: Orange banner "👥 Patient View - How patients see their information"
- **Toggle Controls**: 
  - Language selector (shows patient's available languages)
  - Complexity toggle defaulted to "simplified"
- **Educational Features**:
  - Hover/click on simplified terms shows medical equivalent
  - Side-by-side comparison view option
  - Quality confidence indicators for translations

### **Shared Profile Link Experience**

**Creating Shared Health Profiles**:

**Sharing Workflow**:
```sql
-- Create shared health profile
CREATE OR REPLACE FUNCTION create_shared_health_profile(
    p_patient_id UUID,
    p_target_language VARCHAR(10),
    p_complexity_level VARCHAR(20),
    p_sharing_duration INTERVAL DEFAULT INTERVAL '7 days',
    p_allowed_sections TEXT[] DEFAULT ARRAY['medications', 'conditions', 'allergies'],
    p_purpose TEXT DEFAULT NULL
) RETURNS TABLE (
    share_token UUID,
    share_url TEXT,
    expires_at TIMESTAMPTZ,
    translation_ready BOOLEAN
) AS $$
DECLARE
    new_share_token UUID;
    share_url_path TEXT;
    expiry_time TIMESTAMPTZ;
    translations_exist BOOLEAN;
BEGIN
    -- Generate unique share token
    new_share_token := gen_random_uuid();
    expiry_time := NOW() + p_sharing_duration;
    
    -- Check if translations exist for target language in display tables
    SELECT EXISTS(
        SELECT 1 FROM medications_display md
        WHERE md.patient_id = p_patient_id
        AND md.language_code = p_target_language
        AND md.complexity_level = p_complexity_level
        
        UNION
        
        SELECT 1 FROM conditions_display cd
        WHERE cd.patient_id = p_patient_id
        AND cd.language_code = p_target_language
        AND cd.complexity_level = p_complexity_level
    ) INTO translations_exist;
    
    -- If no display tables, check translation tables
    IF NOT translations_exist THEN
        SELECT EXISTS(
            SELECT 1 FROM medication_translations mt
            JOIN patient_medications pm ON pm.id = mt.medication_id
            WHERE pm.patient_id = p_patient_id
            AND mt.target_language = p_target_language
            AND mt.complexity_level = p_complexity_level
            
            UNION
            
            SELECT 1 FROM condition_translations ct
            JOIN patient_conditions pc ON pc.id = ct.condition_id
            WHERE pc.patient_id = p_patient_id
            AND ct.target_language = p_target_language
            AND ct.complexity_level = p_complexity_level
        ) INTO translations_exist;
    END IF;
    
    -- Create shared profile record
    INSERT INTO shared_health_profiles (
        share_token,
        patient_id,
        target_language,
        target_complexity_level,
        allowed_sections,
        expiry_date,
        sharing_purpose,
        created_at
    ) VALUES (
        new_share_token,
        p_patient_id,
        p_target_language,
        p_complexity_level,
        p_allowed_sections,
        expiry_time,
        p_purpose,
        NOW()
    );
    
    -- Generate share URL
    share_url_path := format('https://exorahealth.com.au/shared/%s', new_share_token);
    
    -- If translations don't exist, trigger creation via sync queue
    IF NOT translations_exist THEN
        INSERT INTO translation_sync_queue (entity_id, entity_type, operation, priority, payload)
        SELECT 
            pm.id,
            'medication',
            'translate',
            1, -- Highest priority for shared profiles
            jsonb_build_object(
                'target_language', p_target_language,
                'complexity_level', p_complexity_level,
                'populate_display', true,
                'shared_profile', true
            )
        FROM patient_medications pm
        WHERE pm.patient_id = p_patient_id;
        
        INSERT INTO translation_sync_queue (entity_id, entity_type, operation, priority, payload)
        SELECT 
            pc.id,
            'condition',
            'translate',
            1,
            jsonb_build_object(
                'target_language', p_target_language,
                'complexity_level', p_complexity_level,
                'populate_display', true,
                'shared_profile', true
            )
        FROM patient_conditions pc
        WHERE pc.patient_id = p_patient_id;
    END IF;
    
    RETURN QUERY SELECT
        new_share_token,
        share_url_path,
        expiry_time,
        translations_exist;
END;
$$ LANGUAGE plpgsql;
```

**Shared Profile Viewer Experience**:
1. **Landing Page**: Clean, professional interface with patient name (if permitted)
2. **Language Indicator**: Clear indication of display language and translation quality
3. **Medical Disclaimers**: Prominent AI translation warnings for non-native languages
4. **Professional Tools**: Download options, print-friendly view, QR codes for easy sharing
5. **Access Tracking**: Log of when profile was accessed (with patient consent)

### **Foreign Language File Upload Experience**

**Multi-Language Document Processing**:

**Upload Detection and Handling**:
```sql
-- Document language detection and processing workflow
CREATE OR REPLACE FUNCTION process_foreign_language_document(
    p_user_id UUID,
    p_document_path TEXT,
    p_detected_language VARCHAR(10),
    p_user_primary_language VARCHAR(10)
) RETURNS TABLE (
    processing_status VARCHAR(20),
    translation_required BOOLEAN,
    estimated_processing_time INTERVAL,
    cost_estimate NUMERIC(5,2)
) AS $$
DECLARE
    needs_translation BOOLEAN;
    processing_complexity VARCHAR(20);
    time_estimate INTERVAL;
    cost_est NUMERIC(5,2);
BEGIN
    -- Determine if translation is needed
    needs_translation := (p_detected_language != p_user_primary_language);
    
    -- Assess document complexity (affects processing time and cost)
    processing_complexity := CASE 
        WHEN p_detected_language IN ('es-ES', 'fr-FR') THEN 'standard'
        WHEN p_detected_language IN ('zh-CN', 'ar-SA') THEN 'complex'
        ELSE 'experimental'
    END;
    
    -- Calculate estimates
    time_estimate := CASE processing_complexity
        WHEN 'standard' THEN INTERVAL '3-5 minutes'
        WHEN 'complex' THEN INTERVAL '5-8 minutes' 
        ELSE INTERVAL '8-12 minutes'
    END;
    
    cost_est := CASE processing_complexity
        WHEN 'standard' THEN 2.50
        WHEN 'complex' THEN 4.00
        ELSE 6.00
    END;
    
    -- Create processing job
    INSERT INTO document_processing_jobs (
        user_id,
        document_path,
        source_language,
        target_language,
        processing_complexity,
        estimated_cost,
        status
    ) VALUES (
        p_user_id,
        p_document_path,
        p_detected_language,
        p_user_primary_language,
        processing_complexity,
        cost_est,
        'queued'
    );
    
    RETURN QUERY SELECT
        'queued'::VARCHAR(20),
        needs_translation,
        time_estimate,
        cost_est;
END;
$$ LANGUAGE plpgsql;
```

**User Experience for Foreign Documents**:
1. **Language Detection**: "We detected this document is in Spanish. Process in Spanish and translate to English?"
2. **Cost Transparency**: "Processing: $2.50 (includes Spanish→English translation)"
3. **Quality Expectations**: "Translation quality: Very Good (95% accuracy)"
4. **Processing Updates**: Real-time progress with estimated completion time
5. **Result Presentation**: Side-by-side original and translated content with quality indicators

## Premium Subscription Integration

### **Freemium to Premium Upgrade Flows**

**Language Paywall Experience**:
```sql
-- Check language access and present upgrade options
CREATE OR REPLACE FUNCTION get_language_upgrade_prompt(
    p_profile_id UUID,
    p_requested_language VARCHAR(10)
) RETURNS TABLE (
    access_level VARCHAR(20), -- 'free_trial', 'upgrade_required', 'accessible'
    trial_days_remaining INTEGER,
    upgrade_message TEXT,
    feature_preview TEXT[]
) AS $$
DECLARE
    user_tier VARCHAR(20);
    lang_tier_required VARCHAR(20);
    trial_used BOOLEAN;
    trial_remaining INTEGER;
BEGIN
    -- Get user subscription and language requirements
    SELECT up.subscription_tier, sl.subscription_tier_required
    INTO user_tier, lang_tier_required
    FROM user_profiles up, supported_languages sl
    WHERE up.id = p_profile_id AND sl.language_code = p_requested_language;
    
    -- Check if user has used free trial
    SELECT EXISTS(
        SELECT 1 FROM subscription_trials st
        WHERE st.profile_id = p_profile_id 
        AND st.trial_type = 'language_translation'
    ) INTO trial_used;
    
    -- Calculate trial days remaining
    SELECT GREATEST(0, 14 - EXTRACT(days FROM NOW() - created_at)::INTEGER)
    INTO trial_remaining
    FROM subscription_trials
    WHERE profile_id = p_profile_id AND trial_type = 'language_translation'
    ORDER BY created_at DESC LIMIT 1;
    
    -- Determine access level
    IF user_tier = 'premium' OR lang_tier_required = 'free' THEN
        RETURN QUERY SELECT 
            'accessible'::VARCHAR(20), 
            NULL::INTEGER,
            NULL::TEXT,
            ARRAY[]::TEXT[];
    ELSIF NOT trial_used THEN
        RETURN QUERY SELECT
            'free_trial'::VARCHAR(20),
            14,
            'Start your 14-day free trial to unlock all languages',
            ARRAY['Full translation features', 'Emergency translation', 'Shared profiles in any language'];
    ELSIF trial_remaining > 0 THEN
        RETURN QUERY SELECT
            'free_trial'::VARCHAR(20),
            trial_remaining,
            format('%s days remaining in your trial', trial_remaining),
            ARRAY['Continue using all language features'];
    ELSE
        RETURN QUERY SELECT
            'upgrade_required'::VARCHAR(20),
            NULL::INTEGER,
            'Upgrade to Premium to continue using translation features',
            ARRAY['Unlimited languages', 'Emergency translation', 'Priority translation processing'];
    END IF;
END;
$$ LANGUAGE plpgsql;
```

**Trial and Upgrade Experience**:
1. **Free Trial Activation**: One-click activation with credit card for seamless conversion
2. **Trial Progress Indicators**: Daily reminders of trial status and usage
3. **Value Demonstration**: Show specific languages and features unlocked
4. **Conversion Incentives**: Special pricing for trial users, annual discount options
5. **Graceful Degradation**: Clear explanation of features that become unavailable after trial

This comprehensive user experience framework ensures that health data universality features are accessible, intuitive, and properly integrated with business model requirements while maintaining clinical safety and user trust. The flows utilize the three-layer architecture to provide fast display table lookups, efficient translation table queries, and seamless backend table fallbacks for optimal user experience.