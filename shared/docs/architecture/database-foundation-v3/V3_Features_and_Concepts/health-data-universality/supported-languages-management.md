# Supported Languages Management

**Status**: Planning Phase  
**Created**: 16 September 2025  
**Last Updated**: 16 September 2025

## Overview

This document defines the dynamic language availability system that tracks AI model capabilities, manages language quality scoring, and provides a framework for expanding language support through both general-purpose and bespoke AI models. The system integrates with the three-layer architecture (backend tables + per-domain translation tables + per-domain display tables) to ensure users receive accurate information about available languages while providing mechanisms for graceful fallbacks and quality assurance.

## Problem Domain

Language support management presents unique challenges:
- AI model capabilities vary significantly across languages and change over time
- Medical translation quality requirements are higher than general translation
- Bespoke AI models may be needed for specialized medical vocabularies in certain languages
- Users need clear information about language availability and quality
- System must handle graceful degradation for unsupported languages
- Language support impacts business model and subscription tiers

## Language Availability Architecture

### **Language Capability Database**

**Core Language Management Tables**:
```sql
-- Master table of all languages Exora can potentially support
CREATE TABLE supported_languages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    language_code VARCHAR(10) NOT NULL UNIQUE, -- ISO 639-1 + country (e.g., 'es-ES', 'zh-CN')
    language_name TEXT NOT NULL, -- 'Spanish (Spain)', 'Chinese (Simplified)'
    native_name TEXT NOT NULL, -- 'Español (España)', '中文 (简体)'
    availability_status VARCHAR(20) NOT NULL DEFAULT 'unavailable', -- 'available', 'beta', 'coming_soon', 'unavailable'
    medical_translation_quality NUMERIC(3,2) DEFAULT 0.00, -- 0.00-1.00 quality score
    general_translation_quality NUMERIC(3,2) DEFAULT 0.00, -- 0.00-1.00 quality score
    subscription_tier_required VARCHAR(20) DEFAULT 'premium', -- 'free', 'premium', 'enterprise'
    launch_date DATE, -- When language became available
    last_quality_assessment TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI model capabilities for each language
CREATE TABLE ai_model_language_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_provider VARCHAR(50) NOT NULL, -- 'openai', 'google', 'anthropic', 'exora_bespoke'
    model_name VARCHAR(100) NOT NULL, -- 'gpt-4o-mini', 'gemini-pro', 'claude-3-sonnet'
    language_code VARCHAR(10) NOT NULL REFERENCES supported_languages(language_code),
    capability_type VARCHAR(30) NOT NULL, -- 'medical_translation', 'general_translation', 'medical_terminology'
    quality_score NUMERIC(3,2) NOT NULL, -- Model performance for this language/capability
    cost_per_1k_tokens NUMERIC(10,4), -- Cost in USD
    latency_percentile_95 INTEGER, -- p95 latency in milliseconds
    last_benchmarked TIMESTAMPTZ NOT NULL,
    benchmark_dataset VARCHAR(100), -- Dataset used for quality assessment
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Baseline language support data
INSERT INTO supported_languages (language_code, language_name, native_name, availability_status, medical_translation_quality, subscription_tier_required) VALUES
('en-AU', 'English (Australia)', 'English (Australia)', 'available', 1.00, 'free'),
('en-US', 'English (United States)', 'English (United States)', 'available', 1.00, 'free'),
('es-ES', 'Spanish (Spain)', 'Español (España)', 'available', 0.95, 'premium'),
('fr-FR', 'French (France)', 'Français (France)', 'available', 0.92, 'premium'),
('zh-CN', 'Chinese (Simplified)', '中文 (简体)', 'beta', 0.88, 'premium'),
('hi-IN', 'Hindi (India)', 'हिन्दी (भारत)', 'coming_soon', 0.82, 'premium'),
('ar-SA', 'Arabic (Saudi Arabia)', 'العربية (السعودية)', 'coming_soon', 0.79, 'enterprise');
```

### **Dynamic Language Availability Management with Display Table Integration**

**AI Model Performance Monitoring with Translation Table Tracking**:
```sql
-- Function to update language availability based on AI model performance and translation table data
CREATE OR REPLACE FUNCTION update_language_availability() RETURNS VOID AS $$
DECLARE
    lang_record RECORD;
    best_model_quality NUMERIC;
    model_count INTEGER;
    translation_coverage NUMERIC;
    display_coverage NUMERIC;
BEGIN
    -- Update each language's availability based on best available AI model
    FOR lang_record IN SELECT language_code FROM supported_languages LOOP
        -- Find best quality score for medical translation in this language
        SELECT 
            MAX(quality_score),
            COUNT(*)
        INTO best_model_quality, model_count
        FROM ai_model_language_capabilities
        WHERE language_code = lang_record.language_code
        AND capability_type = 'medical_translation'
        AND is_active = TRUE;
        
        -- Check translation coverage across per-domain tables
        SELECT AVG(coverage_percentage) INTO translation_coverage
        FROM (
            SELECT 
                (COUNT(mt.id)::NUMERIC / NULLIF(COUNT(pm.id), 0)) * 100 as coverage_percentage
            FROM patient_medications pm
            LEFT JOIN medication_translations mt ON (
                mt.medication_id = pm.id 
                AND mt.target_language = lang_record.language_code
            )
            WHERE pm.created_at > NOW() - INTERVAL '30 days'
            
            UNION ALL
            
            SELECT 
                (COUNT(ct.id)::NUMERIC / NULLIF(COUNT(pc.id), 0)) * 100 as coverage_percentage
            FROM patient_conditions pc
            LEFT JOIN condition_translations ct ON (
                ct.condition_id = pc.id 
                AND ct.target_language = lang_record.language_code
            )
            WHERE pc.created_at > NOW() - INTERVAL '30 days'
            
            UNION ALL
            
            SELECT 
                (COUNT(at.id)::NUMERIC / NULLIF(COUNT(pa.id), 0)) * 100 as coverage_percentage
            FROM patient_allergies pa
            LEFT JOIN allergy_translations at ON (
                at.allergy_id = pa.id 
                AND at.target_language = lang_record.language_code
            )
            WHERE pa.created_at > NOW() - INTERVAL '30 days'
        ) coverage_stats;
        
        -- Check display table population coverage
        SELECT AVG(display_coverage_percentage) INTO display_coverage
        FROM (
            SELECT 
                (COUNT(md.id)::NUMERIC / NULLIF(COUNT(mt.id), 0)) * 100 as display_coverage_percentage
            FROM medication_translations mt
            LEFT JOIN medications_display md ON (
                md.medication_id = mt.medication_id 
                AND md.language_code = mt.target_language
                AND md.complexity_level = mt.complexity_level
            )
            WHERE mt.target_language = lang_record.language_code
            AND mt.created_at > NOW() - INTERVAL '7 days'
        ) display_stats;
        
        -- Update language availability based on model quality and coverage
        UPDATE supported_languages SET
            medical_translation_quality = COALESCE(best_model_quality, 0.00),
            availability_status = CASE
                WHEN best_model_quality >= 0.95 AND COALESCE(translation_coverage, 0) >= 80 THEN 'available'
                WHEN best_model_quality >= 0.85 AND COALESCE(translation_coverage, 0) >= 60 THEN 'beta'
                WHEN best_model_quality >= 0.70 AND COALESCE(translation_coverage, 0) >= 40 THEN 'coming_soon'
                ELSE 'unavailable'
            END,
            last_quality_assessment = NOW(),
            updated_at = NOW()
        WHERE language_code = lang_record.language_code;
        
        -- Trigger display table population for languages with low display coverage
        IF COALESCE(display_coverage, 0) < 70 AND best_model_quality >= 0.80 THEN
            INSERT INTO translation_sync_queue (entity_type, operation, payload, priority)
            VALUES (
                'language_coverage',
                'populate_display_tables',
                jsonb_build_object('language', lang_record.language_code, 'min_coverage', 70),
                3
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Scheduled job to run quality assessment weekly
-- This would be implemented as a cron job or scheduled database function
```

### **Bespoke AI Model Integration Framework**

**Custom Model Registration**:
```sql
-- Bespoke AI model registration for specialized languages
CREATE TABLE bespoke_ai_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(100) NOT NULL UNIQUE,
    target_languages TEXT[] NOT NULL, -- Languages this model specializes in
    specialization VARCHAR(100), -- 'indian_medical_terminology', 'arabic_clinical_context'
    model_version VARCHAR(20) NOT NULL,
    api_endpoint TEXT NOT NULL,
    api_key_reference VARCHAR(100), -- Reference to secure key storage
    model_status VARCHAR(20) DEFAULT 'testing', -- 'testing', 'production', 'deprecated'
    benchmark_results JSONB, -- Detailed performance metrics
    deployment_date DATE,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Function to register new bespoke model capabilities
CREATE OR REPLACE FUNCTION register_bespoke_model_capability(
    p_model_name VARCHAR(100),
    p_language_code VARCHAR(10),
    p_quality_score NUMERIC,
    p_benchmark_data JSONB
) RETURNS VOID AS $$
BEGIN
    -- Register the model's capability for this language
    INSERT INTO ai_model_language_capabilities (
        model_provider,
        model_name,
        language_code,
        capability_type,
        quality_score,
        last_benchmarked,
        benchmark_dataset
    ) VALUES (
        'exora_bespoke',
        p_model_name,
        p_language_code,
        'medical_translation',
        p_quality_score,
        NOW(),
        p_benchmark_data->>'dataset_name'
    );
    
    -- Trigger language availability update
    PERFORM update_language_availability();
END;
$$ LANGUAGE plpgsql;
```

## Language Quality Scoring and Assessment

### **Medical Translation Quality Metrics**

**Quality Assessment Framework**:
```sql
-- Medical translation quality benchmarks
CREATE TABLE translation_quality_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    language_code VARCHAR(10) NOT NULL REFERENCES supported_languages(language_code),
    model_provider VARCHAR(50) NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    benchmark_type VARCHAR(50) NOT NULL, -- 'medical_accuracy', 'terminology_consistency', 'readability'
    test_dataset_size INTEGER NOT NULL,
    accuracy_score NUMERIC(5,4) NOT NULL, -- 0.0000-1.0000
    terminology_accuracy NUMERIC(5,4), -- Medical term translation accuracy
    readability_score NUMERIC(5,4), -- For simplified complexity level
    human_evaluation_score NUMERIC(5,4), -- Professional medical translator review
    benchmark_date DATE NOT NULL,
    benchmark_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automated quality scoring function
CREATE OR REPLACE FUNCTION calculate_language_quality_score(
    p_language_code VARCHAR(10),
    p_model_name VARCHAR(100)
) RETURNS NUMERIC AS $$
DECLARE
    medical_accuracy NUMERIC;
    terminology_accuracy NUMERIC;
    readability_score NUMERIC;
    human_evaluation NUMERIC;
    weighted_score NUMERIC;
BEGIN
    -- Get latest benchmark scores for this language/model combination
    SELECT 
        accuracy_score,
        terminology_accuracy,
        readability_score,
        human_evaluation_score
    INTO medical_accuracy, terminology_accuracy, readability_score, human_evaluation
    FROM translation_quality_benchmarks
    WHERE language_code = p_language_code 
    AND model_name = p_model_name
    ORDER BY benchmark_date DESC
    LIMIT 1;
    
    -- Calculate weighted quality score
    -- Medical accuracy: 40%, Terminology: 30%, Human evaluation: 20%, Readability: 10%
    weighted_score := (
        COALESCE(medical_accuracy, 0.0) * 0.40 +
        COALESCE(terminology_accuracy, 0.0) * 0.30 +
        COALESCE(human_evaluation, 0.0) * 0.20 +
        COALESCE(readability_score, 0.0) * 0.10
    );
    
    RETURN weighted_score;
END;
$$ LANGUAGE plpgsql;
```

### **Quality Confidence Indicators**

**User-Facing Quality Communication**:
```sql
-- Function to get user-friendly quality description
CREATE OR REPLACE FUNCTION get_language_quality_description(
    p_language_code VARCHAR(10)
) RETURNS TABLE (
    quality_level VARCHAR(20),
    description TEXT,
    medical_accuracy_note TEXT,
    recommended_use TEXT
) AS $$
DECLARE
    quality_score NUMERIC;
BEGIN
    SELECT medical_translation_quality INTO quality_score
    FROM supported_languages 
    WHERE language_code = p_language_code;
    
    RETURN QUERY SELECT
        CASE 
            WHEN quality_score >= 0.95 THEN 'excellent'::VARCHAR(20)
            WHEN quality_score >= 0.90 THEN 'very_good'::VARCHAR(20)
            WHEN quality_score >= 0.85 THEN 'good'::VARCHAR(20)
            WHEN quality_score >= 0.75 THEN 'fair'::VARCHAR(20)
            ELSE 'limited'::VARCHAR(20)
        END as quality_level,
        CASE 
            WHEN quality_score >= 0.95 THEN 'Medical translations are highly accurate and suitable for all healthcare contexts.'
            WHEN quality_score >= 0.90 THEN 'Medical translations are very accurate with minor terminology variations.'
            WHEN quality_score >= 0.85 THEN 'Medical translations are generally accurate but may require verification for critical decisions.'
            WHEN quality_score >= 0.75 THEN 'Medical translations provide good general understanding but may have terminology gaps.'
            ELSE 'Medical translations are limited and should be used with caution.'
        END as description,
        CASE 
            WHEN quality_score >= 0.95 THEN 'Medical terminology is consistently accurate.'
            WHEN quality_score >= 0.85 THEN 'Medical terminology is mostly accurate with occasional variations.'
            ELSE 'Medical terminology may be simplified or approximate. Refer to original language for precision.'
        END as medical_accuracy_note,
        CASE 
            WHEN quality_score >= 0.90 THEN 'Suitable for all medical contexts including clinical decision support.'
            WHEN quality_score >= 0.80 THEN 'Suitable for patient education and general medical information.'
            ELSE 'Best used for basic medical information and patient communication.'
        END as recommended_use;
END;
$$ LANGUAGE plpgsql;
```

## User Language Selection and Availability

### **User Language Preference Management**

**Language Selection with Quality Awareness**:
```sql
-- Enhanced user language selection with display table population triggers
CREATE OR REPLACE FUNCTION add_user_language_preference(
    p_profile_id UUID,
    p_language_code VARCHAR(10)
) RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    quality_warning TEXT
) AS $$
DECLARE
    lang_availability VARCHAR(20);
    lang_quality NUMERIC;
    subscription_required VARCHAR(20);
    user_subscription VARCHAR(20);
    existing_entities_count INTEGER;
BEGIN
    -- Check language availability and quality
    SELECT 
        availability_status,
        medical_translation_quality,
        subscription_tier_required
    INTO lang_availability, lang_quality, subscription_required
    FROM supported_languages 
    WHERE language_code = p_language_code;
    
    -- Check user's subscription level
    SELECT subscription_tier INTO user_subscription
    FROM user_profiles 
    WHERE id = p_profile_id;
    
    -- Validate language can be added
    IF lang_availability = 'unavailable' THEN
        RETURN QUERY SELECT FALSE, 'Language not currently supported', 'Language unavailable'::TEXT;
        RETURN;
    END IF;
    
    -- Check subscription requirements
    IF subscription_required = 'premium' AND user_subscription = 'free' THEN
        RETURN QUERY SELECT FALSE, 'Premium subscription required for this language', 'Subscription upgrade needed'::TEXT;
        RETURN;
    END IF;
    
    -- Add language to user preferences
    UPDATE user_language_preferences 
    SET active_languages = array_append(active_languages, p_language_code),
        updated_at = NOW()
    WHERE profile_id = p_profile_id;
    
    -- Count existing clinical entities for this user
    SELECT 
        (
            (SELECT COUNT(*) FROM patient_medications WHERE patient_id = p_profile_id) +
            (SELECT COUNT(*) FROM patient_conditions WHERE patient_id = p_profile_id) +
            (SELECT COUNT(*) FROM patient_allergies WHERE patient_id = p_profile_id)
        )
    INTO existing_entities_count;
    
    -- Trigger translation and display table population for existing entities
    IF existing_entities_count > 0 THEN
        -- Queue medication translations
        INSERT INTO translation_sync_queue (entity_id, entity_type, operation, priority, payload)
        SELECT 
            pm.id,
            'medication',
            'translate',
            5, -- Normal priority
            jsonb_build_object(
                'target_language', p_language_code,
                'complexity_levels', ARRAY['medical_jargon', 'simplified']
            )
        FROM patient_medications pm
        WHERE pm.patient_id = p_profile_id;
        
        -- Queue condition translations
        INSERT INTO translation_sync_queue (entity_id, entity_type, operation, priority, payload)
        SELECT 
            pc.id,
            'condition',
            'translate',
            5,
            jsonb_build_object(
                'target_language', p_language_code,
                'complexity_levels', ARRAY['medical_jargon', 'simplified']
            )
        FROM patient_conditions pc
        WHERE pc.patient_id = p_profile_id;
        
        -- Queue allergy translations
        INSERT INTO translation_sync_queue (entity_id, entity_type, operation, priority, payload)
        SELECT 
            pa.id,
            'allergy',
            'translate',
            5,
            jsonb_build_object(
                'target_language', p_language_code,
                'complexity_levels', ARRAY['medical_jargon', 'simplified']
            )
        FROM patient_allergies pa
        WHERE pa.patient_id = p_profile_id;
    END IF;
    
    -- Return success with quality information and processing status
    RETURN QUERY SELECT 
        TRUE,
        format('Successfully added %s. %s clinical records queued for translation.', 
            (SELECT language_name FROM supported_languages WHERE language_code = p_language_code),
            existing_entities_count
        ),
        CASE 
            WHEN lang_quality < 0.90 THEN format('Translation quality: %s. Medical translations may require verification.', 
                (SELECT quality_level FROM get_language_quality_description(p_language_code)))
            WHEN existing_entities_count > 0 THEN 'Translations will be processed in the background and available shortly.'
            ELSE NULL
        END;
END;
$$ LANGUAGE plpgsql;
```

### **Language Availability Notifications**

**User Notification System for Language Updates**:
```sql
-- Language availability change notifications
CREATE TABLE language_availability_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    language_code VARCHAR(10) NOT NULL REFERENCES supported_languages(language_code),
    notification_type VARCHAR(30) NOT NULL, -- 'now_available', 'quality_improved', 'beta_available'
    previous_status VARCHAR(20),
    new_status VARCHAR(20),
    quality_change NUMERIC(3,2), -- Change in quality score
    notification_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Function to create notifications when language status changes
CREATE OR REPLACE FUNCTION notify_users_of_language_changes() RETURNS VOID AS $$
DECLARE
    lang_change RECORD;
    interested_users UUID[];
BEGIN
    -- Find languages that have improved in the last day
    FOR lang_change IN 
        SELECT 
            language_code,
            availability_status,
            medical_translation_quality
        FROM supported_languages 
        WHERE last_quality_assessment > NOW() - INTERVAL '1 day'
        AND availability_status IN ('available', 'beta')
    LOOP
        -- Find users who might be interested in this language
        SELECT array_agg(DISTINCT ulp.profile_id) INTO interested_users
        FROM user_language_preferences ulp
        JOIN user_profiles up ON up.id = ulp.profile_id
        WHERE up.primary_country_code LIKE '%' || split_part(lang_change.language_code, '-', 2) || '%'
        OR ulp.primary_language LIKE split_part(lang_change.language_code, '-', 1) || '%';
        
        -- Create notifications for interested users
        INSERT INTO language_availability_notifications (
            profile_id,
            language_code,
            notification_type,
            new_status
        )
        SELECT 
            unnest(interested_users),
            lang_change.language_code,
            CASE 
                WHEN lang_change.availability_status = 'available' THEN 'now_available'
                ELSE 'beta_available'
            END,
            lang_change.availability_status;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
```

## Fallback Strategies for Unsupported Languages

### **Graceful Language Degradation**

**Fallback Hierarchy**:
```sql
-- Language fallback preferences
CREATE TABLE language_fallback_hierarchy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_language VARCHAR(10) NOT NULL,
    fallback_language VARCHAR(10) NOT NULL REFERENCES supported_languages(language_code),
    fallback_priority INTEGER NOT NULL, -- 1 = first fallback, 2 = second, etc.
    cultural_similarity_score NUMERIC(3,2), -- How culturally similar the fallback is
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Common fallback hierarchies
INSERT INTO language_fallback_hierarchy (requested_language, fallback_language, fallback_priority, cultural_similarity_score) VALUES
-- Hindi fallbacks
('hi-IN', 'en-US', 1, 0.60), -- English common in India
('hi-IN', 'en-AU', 2, 0.55),
-- Arabic fallbacks  
('ar-SA', 'en-US', 1, 0.40),
('ar-SA', 'fr-FR', 2, 0.35), -- French common in some Arab regions
-- Regional language fallbacks
('pt-BR', 'es-ES', 1, 0.75), -- Portuguese to Spanish (linguistic similarity)
('pt-BR', 'en-US', 2, 0.45),
-- Chinese variants
('zh-TW', 'zh-CN', 1, 0.90), -- Traditional to Simplified Chinese
('zh-TW', 'en-US', 2, 0.40);

-- Function to get best available translation using three-layer architecture
CREATE OR REPLACE FUNCTION get_best_available_translation_from_display(
    p_entity_id UUID,
    p_entity_type VARCHAR(50),
    p_requested_language VARCHAR(10),
    p_complexity VARCHAR(20) DEFAULT 'simplified'
) RETURNS TABLE (
    translated_text TEXT,
    language_used VARCHAR(10),
    is_fallback BOOLEAN,
    quality_note TEXT,
    confidence_score NUMERIC
) AS $$
DECLARE
    fallback_lang VARCHAR(10);
    result_text TEXT;
    result_confidence NUMERIC;
BEGIN
    -- Try requested language first from display tables
    CASE p_entity_type
        WHEN 'medication' THEN
            SELECT md.display_name, md.confidence_score INTO result_text, result_confidence
            FROM medications_display md
            WHERE md.medication_id = p_entity_id 
            AND md.language_code = p_requested_language 
            AND md.complexity_level = p_complexity;
            
        WHEN 'condition' THEN
            SELECT cd.display_name, cd.confidence_score INTO result_text, result_confidence
            FROM conditions_display cd
            WHERE cd.condition_id = p_entity_id 
            AND cd.language_code = p_requested_language 
            AND cd.complexity_level = p_complexity;
            
        WHEN 'allergy' THEN
            SELECT ad.display_name, ad.confidence_score INTO result_text, result_confidence
            FROM allergies_display ad
            WHERE ad.allergy_id = p_entity_id 
            AND ad.language_code = p_requested_language 
            AND ad.complexity_level = p_complexity;
    END CASE;
    
    IF result_text IS NOT NULL THEN
        RETURN QUERY SELECT result_text, p_requested_language, FALSE, NULL::TEXT, result_confidence;
        RETURN;
    END IF;
    
    -- Try translation tables for requested language
    CASE p_entity_type
        WHEN 'medication' THEN
            SELECT mt.translated_name, mt.confidence_score INTO result_text, result_confidence
            FROM medication_translations mt
            WHERE mt.medication_id = p_entity_id 
            AND mt.target_language = p_requested_language 
            AND mt.complexity_level = p_complexity;
            
        WHEN 'condition' THEN
            SELECT ct.translated_name, ct.confidence_score INTO result_text, result_confidence
            FROM condition_translations ct
            WHERE ct.condition_id = p_entity_id 
            AND ct.target_language = p_requested_language 
            AND ct.complexity_level = p_complexity;
            
        WHEN 'allergy' THEN
            SELECT at.translated_allergen_name, at.confidence_score INTO result_text, result_confidence
            FROM allergy_translations at
            WHERE at.allergy_id = p_entity_id 
            AND at.target_language = p_requested_language 
            AND at.complexity_level = p_complexity;
    END CASE;
    
    IF result_text IS NOT NULL THEN
        -- Trigger display table population for future requests
        INSERT INTO translation_sync_queue (entity_id, entity_type, operation, payload)
        VALUES (p_entity_id, p_entity_type, 'populate_display', 
                jsonb_build_object('language', p_requested_language, 'complexity', p_complexity));
        
        RETURN QUERY SELECT result_text, p_requested_language, FALSE, 'Loaded from translation layer'::TEXT, result_confidence;
        RETURN;
    END IF;
    
    -- Try fallback languages in order of preference
    FOR fallback_lang IN 
        SELECT lf.fallback_language 
        FROM language_fallback_hierarchy lf
        WHERE lf.requested_language = p_requested_language
        ORDER BY lf.fallback_priority
    LOOP
        -- Check display tables for fallback language
        CASE p_entity_type
            WHEN 'medication' THEN
                SELECT md.display_name, md.confidence_score INTO result_text, result_confidence
                FROM medications_display md
                WHERE md.medication_id = p_entity_id 
                AND md.language_code = fallback_lang 
                AND md.complexity_level = p_complexity;
                
            WHEN 'condition' THEN
                SELECT cd.display_name, cd.confidence_score INTO result_text, result_confidence
                FROM conditions_display cd
                WHERE cd.condition_id = p_entity_id 
                AND cd.language_code = fallback_lang 
                AND cd.complexity_level = p_complexity;
        END CASE;
        
        IF result_text IS NOT NULL THEN
            RETURN QUERY SELECT 
                result_text, 
                fallback_lang, 
                TRUE,
                format('Translated to %s (requested %s unavailable)', 
                    (SELECT language_name FROM supported_languages WHERE language_code = fallback_lang),
                    (SELECT COALESCE(language_name, p_requested_language) FROM supported_languages WHERE language_code = p_requested_language)
                ),
                result_confidence;
            RETURN;
        END IF;
    END LOOP;
    
    -- Final fallback to backend table in English
    CASE p_entity_type
        WHEN 'medication' THEN
            SELECT medication_name INTO result_text FROM patient_medications WHERE id = p_entity_id;
        WHEN 'condition' THEN
            SELECT condition_name INTO result_text FROM patient_conditions WHERE id = p_entity_id;
        WHEN 'allergy' THEN
            SELECT allergen_name INTO result_text FROM patient_allergies WHERE id = p_entity_id;
    END CASE;
    
    RETURN QUERY SELECT result_text, 'en-AU'::VARCHAR(10), TRUE, 'Fallback to original language'::TEXT, 1.0::NUMERIC;
END;
$$ LANGUAGE plpgsql;
```

## Integration with Business Model

### **Subscription Tier Language Management**

**Tier-Based Language Access**:
```sql
-- Function to get available languages for user's subscription tier
CREATE OR REPLACE FUNCTION get_available_languages_for_user(p_profile_id UUID) 
RETURNS TABLE (
    language_code VARCHAR(10),
    language_name TEXT,
    native_name TEXT,
    availability_status VARCHAR(20),
    quality_score NUMERIC(3,2),
    is_accessible BOOLEAN,
    upgrade_required VARCHAR(20)
) AS $$
DECLARE
    user_subscription VARCHAR(20);
BEGIN
    -- Get user's current subscription tier
    SELECT subscription_tier INTO user_subscription
    FROM user_profiles 
    WHERE id = p_profile_id;
    
    RETURN QUERY
    SELECT 
        sl.language_code,
        sl.language_name,
        sl.native_name,
        sl.availability_status,
        sl.medical_translation_quality,
        CASE 
            WHEN sl.subscription_tier_required = 'free' THEN TRUE
            WHEN sl.subscription_tier_required = 'premium' AND user_subscription IN ('premium', 'enterprise') THEN TRUE
            WHEN sl.subscription_tier_required = 'enterprise' AND user_subscription = 'enterprise' THEN TRUE
            ELSE FALSE
        END as is_accessible,
        CASE 
            WHEN sl.subscription_tier_required != 'free' AND user_subscription = 'free' THEN sl.subscription_tier_required
            ELSE NULL
        END as upgrade_required
    FROM supported_languages sl
    WHERE sl.availability_status IN ('available', 'beta')
    ORDER BY 
        sl.medical_translation_quality DESC,
        sl.language_name;
END;
$$ LANGUAGE plpgsql;
```

This supported languages management system provides a comprehensive framework for dynamically managing language availability based on AI model capabilities and translation table coverage while ensuring users receive appropriate quality information and graceful fallbacks when their preferred languages are unavailable. The system integrates with the three-layer architecture to trigger display table population and monitor translation coverage across per-domain tables.