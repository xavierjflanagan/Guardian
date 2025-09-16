# Translation Quality Assurance

**Status**: Planning Phase  
**Created**: 16 September 2025  
**Last Updated**: 16 September 2025

## Overview

This document defines the quality assurance framework for AI-powered medical translations, focusing on automated confidence scoring, user safety through clear disclaimers, and error handling for translation failures. The system prioritizes user safety by providing transparent quality information and recommending consultation with original language content for critical medical decisions.

## Problem Domain

Medical translation quality assurance presents unique challenges:
- AI translations may contain inaccuracies that could impact medical understanding
- Users need clear information about translation reliability
- Critical medical decisions require highest accuracy standards
- Translation errors must be detected and flagged automatically
- User feedback is essential for continuous quality improvement
- System must balance accessibility with safety warnings

## AI Translation Accuracy Framework

### **Automated Confidence Scoring System**

**Translation Confidence Database Schema**:
```sql
-- Translation confidence tracking for all medical content
CREATE TABLE translation_confidence_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL, -- References clinical entity (medication, condition, etc.)
    entity_type VARCHAR(50) NOT NULL, -- 'medication', 'condition', 'allergy', 'procedure', 'narrative'
    source_language VARCHAR(10) NOT NULL,
    target_language VARCHAR(10) NOT NULL,
    field_name VARCHAR(50) NOT NULL, -- 'name', 'instructions', 'description'
    ai_model_used VARCHAR(100) NOT NULL,
    confidence_score NUMERIC(5,4) NOT NULL, -- 0.0000-1.0000
    translation_method VARCHAR(30) NOT NULL, -- 'ai_translation', 'exact_match', 'fuzzy_match'
    quality_indicators JSONB, -- Detailed quality metrics
    source_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    review_flags TEXT[], -- Array of quality concerns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Function to calculate translation confidence based on multiple factors
CREATE OR REPLACE FUNCTION calculate_translation_confidence(
    p_source_text TEXT,
    p_translated_text TEXT,
    p_source_language VARCHAR(10),
    p_target_language VARCHAR(10),
    p_ai_model VARCHAR(100)
) RETURNS TABLE (
    confidence_score NUMERIC(5,4),
    quality_indicators JSONB,
    review_flags TEXT[]
) AS $$
DECLARE
    base_confidence NUMERIC := 0.85; -- Base AI model confidence
    language_quality NUMERIC;
    terminology_complexity NUMERIC;
    length_ratio NUMERIC;
    calculated_confidence NUMERIC;
    quality_data JSONB := '{}';
    flags TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Get language-specific quality scores
    SELECT medical_translation_quality INTO language_quality
    FROM supported_languages 
    WHERE language_code = p_target_language;
    
    -- Assess terminology complexity (medical terms reduce confidence)
    SELECT 
        CASE 
            WHEN COUNT(*) = 0 THEN 0.95 -- No complex terms
            WHEN COUNT(*) <= 2 THEN 0.90 -- Few complex terms
            WHEN COUNT(*) <= 5 THEN 0.85 -- Some complex terms
            ELSE 0.80 -- Many complex terms
        END INTO terminology_complexity
    FROM medical_terminology_simplification mts
    WHERE p_source_text ILIKE '%' || mts.medical_term || '%';
    
    -- Check translation length ratio (extreme ratios suggest issues)
    length_ratio := CASE 
        WHEN length(p_source_text) = 0 THEN 0.5
        ELSE length(p_translated_text)::NUMERIC / length(p_source_text)::NUMERIC
    END;
    
    -- Flag concerning length ratios
    IF length_ratio < 0.3 OR length_ratio > 3.0 THEN
        flags := array_append(flags, 'UNUSUAL_LENGTH_RATIO');
    END IF;
    
    -- Calculate final confidence score
    calculated_confidence := base_confidence * 
                           COALESCE(language_quality, 0.8) * 
                           terminology_complexity *
                           CASE 
                               WHEN length_ratio BETWEEN 0.5 AND 2.0 THEN 1.0
                               WHEN length_ratio BETWEEN 0.3 AND 3.0 THEN 0.95
                               ELSE 0.85
                           END;
    
    -- Build quality indicators
    quality_data := jsonb_build_object(
        'language_quality', language_quality,
        'terminology_complexity', terminology_complexity,
        'length_ratio', length_ratio,
        'source_length', length(p_source_text),
        'target_length', length(p_translated_text)
    );
    
    -- Add quality-based flags
    IF calculated_confidence < 0.70 THEN
        flags := array_append(flags, 'LOW_CONFIDENCE');
    END IF;
    
    IF terminology_complexity < 0.85 THEN
        flags := array_append(flags, 'COMPLEX_MEDICAL_TERMINOLOGY');
    END IF;
    
    RETURN QUERY SELECT calculated_confidence, quality_data, flags;
END;
$$ LANGUAGE plpgsql;
```

### **Translation Quality Categories**

**Quality Tier Classification**:
```sql
-- Function to classify translation quality for user display
CREATE OR REPLACE FUNCTION get_translation_quality_tier(p_confidence_score NUMERIC) 
RETURNS TABLE (
    quality_tier VARCHAR(20),
    quality_description TEXT,
    safety_recommendation TEXT,
    display_warning BOOLEAN
) AS $$
BEGIN
    RETURN QUERY SELECT
        CASE 
            WHEN p_confidence_score >= 0.95 THEN 'excellent'::VARCHAR(20)
            WHEN p_confidence_score >= 0.90 THEN 'very_good'::VARCHAR(20)
            WHEN p_confidence_score >= 0.80 THEN 'good'::VARCHAR(20)
            WHEN p_confidence_score >= 0.70 THEN 'fair'::VARCHAR(20)
            ELSE 'limited'::VARCHAR(20)
        END as quality_tier,
        CASE 
            WHEN p_confidence_score >= 0.95 THEN 'Translation is highly accurate and reliable for medical use.'
            WHEN p_confidence_score >= 0.90 THEN 'Translation is very accurate with minimal risk of errors.'
            WHEN p_confidence_score >= 0.80 THEN 'Translation is generally accurate but may have minor terminology variations.'
            WHEN p_confidence_score >= 0.70 THEN 'Translation provides good general understanding but may have terminology gaps.'
            ELSE 'Translation accuracy is limited. Use with caution for medical decisions.'
        END as quality_description,
        CASE 
            WHEN p_confidence_score >= 0.90 THEN 'Suitable for general medical reference.'
            WHEN p_confidence_score >= 0.80 THEN 'Verify important details with healthcare provider.'
            ELSE 'Refer to original language version for critical medical decisions.'
        END as safety_recommendation,
        CASE 
            WHEN p_confidence_score < 0.85 THEN TRUE
            ELSE FALSE
        END as display_warning;
END;
$$ LANGUAGE plpgsql;
```

## User Safety Through Disclaimers and Warnings

### **Disclaimer System Architecture**

**Translation Disclaimer Management**:
```sql
-- Translation disclaimers and warnings
CREATE TABLE translation_disclaimers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    disclaimer_type VARCHAR(30) NOT NULL, -- 'general', 'low_confidence', 'critical_decision'
    language_code VARCHAR(10) NOT NULL REFERENCES supported_languages(language_code),
    disclaimer_text TEXT NOT NULL,
    severity_level VARCHAR(20) NOT NULL, -- 'info', 'warning', 'critical'
    display_context TEXT[], -- Where to show: 'dashboard', 'entity_detail', 'shared_profile'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Standard disclaimers in multiple languages
INSERT INTO translation_disclaimers (disclaimer_type, language_code, disclaimer_text, severity_level, display_context) VALUES
-- English disclaimers
('general', 'en-AU', 'This information has been translated by AI and may contain errors or inaccuracies. We recommend referring to the original language version for critical medical decisions.', 'warning', ARRAY['dashboard', 'entity_detail']),
('low_confidence', 'en-AU', 'Translation confidence is lower than usual. Please verify important medical information with your healthcare provider or refer to the original language version.', 'critical', ARRAY['dashboard', 'entity_detail', 'shared_profile']),
('critical_decision', 'en-AU', 'For critical medical decisions, emergency situations, or medication changes, always refer to the original language version or consult your healthcare provider.', 'critical', ARRAY['entity_detail', 'shared_profile']),
-- Spanish disclaimers
('general', 'es-ES', 'Esta información ha sido traducida por IA y puede contener errores o inexactitudes. Recomendamos consultar la versión en idioma original para decisiones médicas críticas.', 'warning', ARRAY['dashboard', 'entity_detail']),
('low_confidence', 'es-ES', 'La confianza de traducción es menor de lo habitual. Verifique la información médica importante con su proveedor de atención médica o consulte la versión en idioma original.', 'critical', ARRAY['dashboard', 'entity_detail', 'shared_profile']),
-- French disclaimers
('general', 'fr-FR', 'Ces informations ont été traduites par IA et peuvent contenir des erreurs ou des inexactitudes. Nous recommandons de consulter la version en langue originale pour les décisions médicales critiques.', 'warning', ARRAY['dashboard', 'entity_detail']);

-- Function to get appropriate disclaimer for translation
CREATE OR REPLACE FUNCTION get_translation_disclaimer(
    p_confidence_score NUMERIC,
    p_target_language VARCHAR(10),
    p_display_context VARCHAR(50)
) RETURNS TABLE (
    disclaimer_text TEXT,
    severity_level VARCHAR(20),
    should_display BOOLEAN
) AS $$
DECLARE
    disclaimer_type VARCHAR(30);
BEGIN
    -- Determine appropriate disclaimer type based on confidence
    disclaimer_type := CASE 
        WHEN p_confidence_score < 0.70 THEN 'critical_decision'
        WHEN p_confidence_score < 0.85 THEN 'low_confidence'
        ELSE 'general'
    END;
    
    -- Get disclaimer text
    RETURN QUERY
    SELECT 
        td.disclaimer_text,
        td.severity_level,
        CASE 
            WHEN p_confidence_score < 0.85 THEN TRUE -- Always show for low confidence
            WHEN disclaimer_type = 'general' AND p_display_context = 'shared_profile' THEN TRUE -- Always show on shared profiles
            ELSE FALSE -- Hide general disclaimers for high confidence translations
        END as should_display
    FROM translation_disclaimers td
    WHERE td.disclaimer_type = disclaimer_type
    AND td.language_code = p_target_language
    AND p_display_context = ANY(td.display_context)
    AND td.is_active = TRUE
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;
```

### **Warning Display Logic**

**Context-Sensitive Warning System**:
```sql
-- Function to determine warning display requirements
CREATE OR REPLACE FUNCTION get_translation_warning_display(
    p_entity_type VARCHAR(50),
    p_confidence_score NUMERIC,
    p_user_context VARCHAR(50) -- 'patient', 'healthcare_provider', 'shared_viewer'
) RETURNS TABLE (
    show_banner_warning BOOLEAN,
    show_inline_warning BOOLEAN,
    warning_text TEXT,
    warning_icon VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY SELECT
        -- Banner warning for critical entities or low confidence
        CASE 
            WHEN p_entity_type IN ('medication', 'allergy') AND p_confidence_score < 0.80 THEN TRUE
            WHEN p_confidence_score < 0.70 THEN TRUE
            WHEN p_user_context = 'shared_viewer' THEN TRUE -- Always warn external viewers
            ELSE FALSE
        END as show_banner_warning,
        
        -- Inline warning for moderate confidence issues
        CASE 
            WHEN p_confidence_score < 0.85 THEN TRUE
            WHEN p_user_context = 'shared_viewer' THEN TRUE
            ELSE FALSE
        END as show_inline_warning,
        
        -- Appropriate warning text
        CASE 
            WHEN p_confidence_score < 0.70 THEN 'Low translation confidence - verify with original language'
            WHEN p_confidence_score < 0.85 THEN 'AI translated - may contain inaccuracies'
            WHEN p_user_context = 'shared_viewer' THEN 'AI translated content - verify with patient for accuracy'
            ELSE 'AI translated content'
        END as warning_text,
        
        -- Warning icon severity
        CASE 
            WHEN p_confidence_score < 0.70 THEN 'critical'::VARCHAR(20)
            WHEN p_confidence_score < 0.85 THEN 'warning'::VARCHAR(20)
            ELSE 'info'::VARCHAR(20)
        END as warning_icon;
END;
$$ LANGUAGE plpgsql;
```

## Error Handling and Translation Failure Management

### **Translation Failure Detection**

**Error Handling System**:
```sql
-- Translation error tracking
CREATE TABLE translation_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    source_language VARCHAR(10) NOT NULL,
    target_language VARCHAR(10) NOT NULL,
    error_type VARCHAR(50) NOT NULL, -- 'api_failure', 'timeout', 'invalid_response', 'confidence_too_low'
    error_message TEXT,
    source_text TEXT,
    attempted_translation TEXT,
    ai_model_used VARCHAR(100),
    retry_count INTEGER DEFAULT 0,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Function to handle translation failures gracefully
CREATE OR REPLACE FUNCTION handle_translation_failure(
    p_entity_id UUID,
    p_entity_type VARCHAR(50),
    p_source_language VARCHAR(10),
    p_target_language VARCHAR(10),
    p_error_type VARCHAR(50),
    p_error_message TEXT,
    p_source_text TEXT
) RETURNS TABLE (
    fallback_text TEXT,
    fallback_language VARCHAR(10),
    error_notification TEXT
) AS $$
DECLARE
    fallback_lang VARCHAR(10);
    fallback_translation TEXT;
BEGIN
    -- Log the translation error
    INSERT INTO translation_errors (
        entity_id, entity_type, source_language, target_language,
        error_type, error_message, source_text
    ) VALUES (
        p_entity_id, p_entity_type, p_source_language, p_target_language,
        p_error_type, p_error_message, p_source_text
    );
    
    -- Try to find fallback language translation
    SELECT fallback_language INTO fallback_lang
    FROM language_fallback_hierarchy 
    WHERE requested_language = p_target_language
    ORDER BY fallback_priority
    LIMIT 1;
    
    -- Attempt to get fallback translation
    CASE p_entity_type
        WHEN 'medication' THEN
            SELECT medication_name_translations->>fallback_lang INTO fallback_translation
            FROM medications WHERE id = p_entity_id;
        WHEN 'condition' THEN
            SELECT condition_name_translations->>fallback_lang INTO fallback_translation
            FROM conditions WHERE id = p_entity_id;
        -- Add other entity types as needed
    END CASE;
    
    -- Return fallback information
    RETURN QUERY SELECT
        COALESCE(fallback_translation, p_source_text) as fallback_text,
        COALESCE(fallback_lang, p_source_language) as fallback_language,
        format('Translation to %s failed. Showing %s version.', 
               p_target_language, 
               COALESCE(fallback_lang, p_source_language)) as error_notification;
END;
$$ LANGUAGE plpgsql;
```

### **Retry and Recovery Mechanisms**

**Automated Translation Recovery**:
```sql
-- Function to retry failed translations
CREATE OR REPLACE FUNCTION retry_failed_translations() RETURNS VOID AS $$
DECLARE
    failure_record RECORD;
    retry_result BOOLEAN;
BEGIN
    -- Find recent unresolved translation failures
    FOR failure_record IN 
        SELECT * FROM translation_errors 
        WHERE resolved = FALSE 
        AND retry_count < 3 
        AND created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC
    LOOP
        -- Attempt retry with different AI model or approach
        -- This would interface with the translation service
        
        -- Update retry count
        UPDATE translation_errors 
        SET retry_count = retry_count + 1,
            updated_at = NOW()
        WHERE id = failure_record.id;
        
        -- If retry successful, mark as resolved
        -- retry_result := call_translation_service(failure_record);
        -- IF retry_result THEN
        --     UPDATE translation_errors 
        --     SET resolved = TRUE, resolved_at = NOW()
        --     WHERE id = failure_record.id;
        -- END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
```

## User Feedback and Quality Improvement

### **Translation Quality Feedback System**

**User Feedback Collection**:
```sql
-- User feedback on translation quality
CREATE TABLE translation_user_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    entity_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    source_language VARCHAR(10) NOT NULL,
    target_language VARCHAR(10) NOT NULL,
    field_name VARCHAR(50) NOT NULL,
    feedback_type VARCHAR(30) NOT NULL, -- 'accuracy_issue', 'terminology_error', 'readability_poor', 'positive'
    user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
    feedback_text TEXT,
    suggested_correction TEXT,
    is_healthcare_provider BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Function to collect user feedback
CREATE OR REPLACE FUNCTION submit_translation_feedback(
    p_profile_id UUID,
    p_entity_id UUID,
    p_entity_type VARCHAR(50),
    p_field_name VARCHAR(50),
    p_feedback_type VARCHAR(30),
    p_rating INTEGER,
    p_feedback_text TEXT,
    p_suggested_correction TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    source_lang VARCHAR(10);
    target_lang VARCHAR(10);
    is_provider BOOLEAN;
BEGIN
    -- Get language information for this entity
    SELECT source_language INTO source_lang
    FROM medications WHERE id = p_entity_id; -- Simplified - would need entity type handling
    
    -- Get user's current display language
    SELECT primary_language INTO target_lang
    FROM user_language_preferences WHERE profile_id = p_profile_id;
    
    -- Check if user is healthcare provider
    SELECT EXISTS(
        SELECT 1 FROM healthcare_provider_verification 
        WHERE profile_id = p_profile_id AND verification_status = 'verified'
    ) INTO is_provider;
    
    -- Insert feedback
    INSERT INTO translation_user_feedback (
        profile_id, entity_id, entity_type, source_language, target_language,
        field_name, feedback_type, user_rating, feedback_text, 
        suggested_correction, is_healthcare_provider
    ) VALUES (
        p_profile_id, p_entity_id, p_entity_type, source_lang, target_lang,
        p_field_name, p_feedback_type, p_rating, p_feedback_text,
        p_suggested_correction, is_provider
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

### **Quality Improvement Analytics**

**Translation Quality Monitoring**:
```sql
-- Function to analyze translation quality trends
CREATE OR REPLACE FUNCTION analyze_translation_quality() 
RETURNS TABLE (
    language_code VARCHAR(10),
    entity_type VARCHAR(50),
    avg_user_rating NUMERIC(3,2),
    feedback_count INTEGER,
    accuracy_issues INTEGER,
    terminology_errors INTEGER,
    quality_trend VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    WITH quality_metrics AS (
        SELECT 
            tuf.target_language,
            tuf.entity_type,
            AVG(tuf.user_rating) as avg_rating,
            COUNT(*) as total_feedback,
            COUNT(*) FILTER (WHERE tuf.feedback_type = 'accuracy_issue') as accuracy_count,
            COUNT(*) FILTER (WHERE tuf.feedback_type = 'terminology_error') as terminology_count
        FROM translation_user_feedback tuf
        WHERE tuf.created_at > NOW() - INTERVAL '30 days'
        GROUP BY tuf.target_language, tuf.entity_type
    ),
    previous_metrics AS (
        SELECT 
            tuf.target_language,
            tuf.entity_type,
            AVG(tuf.user_rating) as prev_avg_rating
        FROM translation_user_feedback tuf
        WHERE tuf.created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days'
        GROUP BY tuf.target_language, tuf.entity_type
    )
    SELECT 
        qm.target_language,
        qm.entity_type,
        qm.avg_rating,
        qm.total_feedback::INTEGER,
        qm.accuracy_count::INTEGER,
        qm.terminology_count::INTEGER,
        CASE 
            WHEN pm.prev_avg_rating IS NULL THEN 'new'
            WHEN qm.avg_rating > pm.prev_avg_rating + 0.2 THEN 'improving'
            WHEN qm.avg_rating < pm.prev_avg_rating - 0.2 THEN 'declining' 
            ELSE 'stable'
        END::VARCHAR(20) as quality_trend
    FROM quality_metrics qm
    LEFT JOIN previous_metrics pm ON pm.target_language = qm.target_language 
                                  AND pm.entity_type = qm.entity_type
    ORDER BY qm.avg_rating DESC;
END;
$$ LANGUAGE plpgsql;
```

## Integration with User Interface

### **Translation Quality Display Components**

**Quality Indicator Integration**:
```sql
-- Function to get complete translation display data for UI
CREATE OR REPLACE FUNCTION get_translation_display_data(
    p_entity_id UUID,
    p_entity_type VARCHAR(50),
    p_field_name VARCHAR(50),
    p_target_language VARCHAR(10),
    p_user_context VARCHAR(50)
) RETURNS TABLE (
    translated_text TEXT,
    confidence_score NUMERIC(5,4),
    quality_tier VARCHAR(20),
    show_warning BOOLEAN,
    warning_text TEXT,
    disclaimer_text TEXT,
    original_language VARCHAR(10),
    alternative_available BOOLEAN
) AS $$
DECLARE
    confidence NUMERIC;
    source_lang VARCHAR(10);
    translation_text TEXT;
    quality_info RECORD;
    warning_info RECORD;
    disclaimer_info RECORD;
BEGIN
    -- Get confidence score and source language
    SELECT 
        tcs.confidence_score,
        tcs.source_language,
        tcs.translated_text
    INTO confidence, source_lang, translation_text
    FROM translation_confidence_scores tcs
    WHERE tcs.entity_id = p_entity_id 
    AND tcs.entity_type = p_entity_type
    AND tcs.field_name = p_field_name
    AND tcs.target_language = p_target_language
    ORDER BY tcs.created_at DESC
    LIMIT 1;
    
    -- Get quality tier information
    SELECT * INTO quality_info
    FROM get_translation_quality_tier(confidence);
    
    -- Get warning display information
    SELECT * INTO warning_info
    FROM get_translation_warning_display(p_entity_type, confidence, p_user_context);
    
    -- Get disclaimer information
    SELECT * INTO disclaimer_info
    FROM get_translation_disclaimer(confidence, p_target_language, p_user_context);
    
    RETURN QUERY SELECT
        translation_text,
        confidence,
        quality_info.quality_tier,
        warning_info.show_inline_warning,
        warning_info.warning_text,
        disclaimer_info.disclaimer_text,
        source_lang,
        confidence < 0.85 -- Show "View Original" option for lower confidence
    ;
END;
$$ LANGUAGE plpgsql;
```

This translation quality assurance system ensures user safety through transparent quality information, appropriate disclaimers, and robust error handling while maintaining the accessibility benefits of AI-powered medical translation.