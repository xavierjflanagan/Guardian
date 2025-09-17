# Medical Literacy Levels Architecture

**Status**: Planning Phase  
**Created**: 16 September 2025  
**Last Updated**: 16 September 2025

## Overview

This document defines the two-tier medical complexity system that makes healthcare information accessible to users regardless of their medical knowledge level. The system uses the three-layer architecture (backend tables + per-domain translation tables + per-domain display tables) to provide medical jargon for healthcare professionals and simplified patient-friendly language targeting a 14-year-old reading level, with seamless toggling between complexity levels.

## Problem Domain

Healthcare language accessibility presents significant challenges:
- Medical terminology creates barriers for patients without medical training
- Healthcare providers need precise medical language for professional decision-making
- Same clinical information must be presented appropriately for different audiences
- Medical accuracy must be preserved across complexity levels
- User preferences need to be respected while maintaining clinical safety
- Cross-complexity access enables better patient-provider communication

## Core Architecture Philosophy

### **Source of Truth: Backend Tables with Medical Jargon**
The existing backend tables (patient_medications, patient_conditions, etc.) store high-complexity medical terminology as the authoritative source, with simplified versions generated through the per-domain translation and display layers. This approach ensures:
- **Clinical accuracy**: Medical professionals receive unaltered medical information from backend tables
- **Audit compliance**: Original medical terminology preserved in backend tables for regulatory requirements
- **Quality control**: Simplification process validated through per-domain translation tables
- **Regulatory safety**: Healthcare providers always have access to complete medical detail from source tables
- **Performance optimization**: Display tables provide fast access to complexity-specific versions

### **Two-Tier Complexity System**
- **Medical Jargon (Level 1)**: Complete medical terminology for healthcare providers
- **Patient-Friendly (Level 2)**: Simplified language targeting 14-year-old reading comprehension

## Database Schema Architecture

### **User Complexity Preferences**

**User Preference Storage**:
```sql
-- Medical complexity preferences integrated with language preferences
ALTER TABLE user_language_preferences ADD COLUMN IF NOT EXISTS default_complexity_level VARCHAR(20) NOT NULL DEFAULT 'simplified';
ALTER TABLE user_language_preferences ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) NOT NULL DEFAULT 'patient'; -- 'patient' or 'healthcare_provider'

-- Complexity level options
CREATE TYPE complexity_level AS ENUM ('medical_jargon', 'simplified');

-- Update user preferences to include complexity defaults
UPDATE user_language_preferences 
SET default_complexity_level = CASE 
    WHEN user_type = 'healthcare_provider' THEN 'medical_jargon'
    ELSE 'simplified'
END;
```

### **Clinical Data Complexity Storage**

**Per-Domain Translation Tables with Complexity Levels**:
```sql
-- Per-domain translation tables support complexity levels
-- Using the three-layer architecture from multi-language-architecture.md

-- Backend table stores medical jargon (source of truth)
-- patient_medications.medication_name = "Lisinopril 10mg oral tablet" (medical_jargon)

-- Translation table provides complexity variants per language
INSERT INTO medication_translations (
    medication_id,
    source_language,
    target_language,
    complexity_level,
    translated_name,
    confidence_score
) VALUES 
(
    $medication_id,
    'en-AU',
    'en-AU', 
    'simplified',
    'Blood pressure medicine (10mg)',
    0.95
),
(
    $medication_id,
    'en-AU',
    'es-ES',
    'medical_jargon', 
    'Lisinopril 10mg comprimido oral',
    0.92
),
(
    $medication_id,
    'en-AU',
    'es-ES',
    'simplified',
    'Medicina para la presión arterial (10mg)',
    0.89
);
```

**Per-Domain Condition Translation Tables**:
```sql
-- Backend table: patient_conditions.condition_name = "Non-small cell lung carcinoma"

-- Translation table with complexity variants
INSERT INTO condition_translations (
    condition_id,
    source_language,
    target_language,
    complexity_level,
    translated_name,
    confidence_score
) VALUES 
(
    $condition_id,
    'en-AU',
    'en-AU',
    'simplified',
    'Lung cancer',
    0.98
),
(
    $condition_id,
    'en-AU',
    'es-ES',
    'medical_jargon',
    'Carcinoma pulmonar de células no pequeñas',
    0.94
),
(
    $condition_id,
    'en-AU', 
    'es-ES',
    'simplified',
    'Cáncer de pulmón',
    0.96
);
```

**Display Tables for Fast UI Access**:
```sql
-- Display tables populated from translation tables for fast dashboard queries
INSERT INTO medications_display (
    medication_id,
    patient_id,
    language_code,
    complexity_level,
    display_name,
    confidence_score
) VALUES 
(
    $medication_id,
    $patient_id,
    'en-AU',
    'simplified',
    'Blood pressure medicine (10mg)',
    0.95
);

-- Similar pattern for conditions_display, allergies_display, etc.
```

### **Terminology Mapping and Simplification Rules**

**Medical Terminology Simplification Database**:
```sql
-- Terminology simplification mapping
CREATE TABLE medical_terminology_simplification (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medical_term TEXT NOT NULL,
    simplified_term TEXT NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'condition', 'medication', 'procedure', 'anatomy'
    complexity_reduction_score NUMERIC NOT NULL, -- How much simpler (1-10 scale)
    reading_level NUMERIC NOT NULL, -- Flesch-Kincaid grade level
    approval_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'approved', 'pending', 'rejected'
    created_by VARCHAR(100), -- AI model or medical professional
    reviewed_by VARCHAR(100), -- Medical professional reviewer
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

-- Common medical terminology mappings
INSERT INTO medical_terminology_simplification (medical_term, simplified_term, category, complexity_reduction_score, reading_level, approval_status) VALUES
('Myocardial infarction', 'Heart attack', 'condition', 8, 4.2, 'approved'),
('Hypertension', 'High blood pressure', 'condition', 6, 5.1, 'approved'),
('Non-small cell lung carcinoma', 'Lung cancer', 'condition', 9, 3.8, 'approved'),
('Pyelonephritis', 'Kidney infection', 'condition', 7, 4.5, 'approved'),
('Acetaminophen', 'Pain relief medicine', 'medication', 5, 4.0, 'approved'),
('Percutaneous coronary intervention', 'Heart procedure', 'procedure', 8, 4.2, 'approved');

-- Index for fast terminology lookup
CREATE INDEX idx_medical_terminology_lookup ON medical_terminology_simplification(medical_term);
```

### **Complexity-Aware Query Functions**

**Display Table Query with Complexity Support**:
```sql
-- Function to get display text with complexity preference using three-layer architecture
CREATE OR REPLACE FUNCTION get_medication_display_with_complexity(
    p_medication_id UUID,
    p_language VARCHAR(10),
    p_complexity VARCHAR(20),
    p_patient_id UUID
) RETURNS TEXT AS $$
DECLARE
    display_text TEXT;
    translation_text TEXT;
    backend_text TEXT;
BEGIN
    -- Layer 3: Try display table first (fastest)
    SELECT display_name INTO display_text
    FROM medications_display
    WHERE medication_id = p_medication_id
    AND language_code = p_language
    AND complexity_level = p_complexity;
    
    IF display_text IS NOT NULL THEN
        RETURN display_text;
    END IF;
    
    -- Layer 2: Try translation table
    SELECT translated_name INTO translation_text
    FROM medication_translations
    WHERE medication_id = p_medication_id
    AND target_language = p_language
    AND complexity_level = p_complexity;
    
    IF translation_text IS NOT NULL THEN
        -- Trigger display table population for future requests
        INSERT INTO translation_sync_queue (entity_id, entity_type, operation, payload)
        VALUES (p_medication_id, 'medication', 'populate_display', 
                jsonb_build_object('language', p_language, 'complexity', p_complexity));
        RETURN translation_text;
    END IF;
    
    -- Layer 1: Fallback to backend table (source of truth)
    SELECT medication_name INTO backend_text
    FROM patient_medications
    WHERE id = p_medication_id;
    
    -- Trigger translation job for requested complexity
    INSERT INTO translation_sync_queue (entity_id, entity_type, operation, payload)
    VALUES (p_medication_id, 'medication', 'translate',
            jsonb_build_object('language', p_language, 'complexity', p_complexity));
    
    RETURN backend_text;
END;
$$ LANGUAGE plpgsql;
```

## User Type and Default Complexity Management

### **User Type Detection and Preferences**

**Healthcare Provider Identification**:
```sql
-- Healthcare provider verification table
CREATE TABLE healthcare_provider_verification (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    provider_type VARCHAR(50) NOT NULL, -- 'doctor', 'nurse', 'pharmacist', 'researcher'
    license_number VARCHAR(100),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'verified', 'pending', 'rejected'
    verification_documents TEXT[], -- Array of document URLs
    verified_by VARCHAR(100), -- Admin who verified
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Function to determine user's default complexity preference
CREATE OR REPLACE FUNCTION get_default_complexity_for_user(p_profile_id UUID) RETURNS VARCHAR(20) AS $$
DECLARE
    is_healthcare_provider BOOLEAN;
    user_preference VARCHAR(20);
BEGIN
    -- Check if user is verified healthcare provider
    SELECT EXISTS(
        SELECT 1 FROM healthcare_provider_verification hpv
        WHERE hpv.profile_id = p_profile_id 
        AND hpv.verification_status = 'verified'
    ) INTO is_healthcare_provider;
    
    -- Get user's explicit preference
    SELECT default_complexity_level INTO user_preference
    FROM user_language_preferences
    WHERE profile_id = p_profile_id;
    
    -- Return preference if set, otherwise default based on provider status
    IF user_preference IS NOT NULL THEN
        RETURN user_preference;
    ELSIF is_healthcare_provider THEN
        RETURN 'medical_jargon';
    ELSE
        RETURN 'simplified';
    END IF;
END;
$$ LANGUAGE plpgsql;
```

### **Healthcare Provider "Patient View" Toggle**

**Session-Based Complexity Override**:
```sql
-- User session complexity preferences
CREATE TABLE user_session_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    session_token VARCHAR(255) NOT NULL,
    temporary_complexity_level VARCHAR(20), -- Override for this session
    temporary_language VARCHAR(10), -- Override for this session
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Function for healthcare providers to view "Patient View"
CREATE OR REPLACE FUNCTION enable_patient_view_for_session(
    p_profile_id UUID,
    p_session_token VARCHAR(255)
) RETURNS VOID AS $$
BEGIN
    -- Verify user is healthcare provider
    IF NOT EXISTS(
        SELECT 1 FROM healthcare_provider_verification hpv
        WHERE hpv.profile_id = p_profile_id 
        AND hpv.verification_status = 'verified'
    ) THEN
        RAISE EXCEPTION 'Patient view only available to verified healthcare providers';
    END IF;
    
    -- Set temporary complexity to simplified for this session
    INSERT INTO user_session_preferences (profile_id, session_token, temporary_complexity_level, expires_at)
    VALUES (p_profile_id, p_session_token, 'simplified', NOW() + INTERVAL '24 hours')
    ON CONFLICT (session_token) DO UPDATE SET
        temporary_complexity_level = 'simplified',
        expires_at = NOW() + INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;
```

## Terminology Simplification Guidelines

### **14-Year-Old Reading Level Standards**

**Simplification Rules**:
1. **Sentence length**: Maximum 15 words per sentence
2. **Syllable reduction**: Prefer 1-2 syllable words when possible
3. **Common vocabulary**: Use words from 5,000 most common English words
4. **Active voice**: Prefer active over passive voice
5. **Concrete terms**: Replace abstract medical concepts with concrete descriptions

**Medical Category Simplification Patterns**:

**Conditions and Diseases**:
```sql
-- Example simplification patterns
INSERT INTO medical_terminology_simplification (medical_term, simplified_term, category, reading_level) VALUES
('Gastroesophageal reflux disease', 'Acid reflux', 'condition', 3.2),
('Diabetes mellitus type 2', 'Type 2 diabetes', 'condition', 4.1),
('Osteoarthritis', 'Joint pain from wear and tear', 'condition', 4.8),
('Pneumonia', 'Lung infection', 'condition', 3.5),
('Hyperlipidemia', 'High cholesterol', 'condition', 4.2);
```

**Medications and Treatments**:
```sql
INSERT INTO medical_terminology_simplification (medical_term, simplified_term, category, reading_level) VALUES
('Antihypertensive agent', 'Blood pressure medicine', 'medication', 4.5),
('Broad-spectrum antibiotic', 'Strong infection medicine', 'medication', 4.2),
('Proton pump inhibitor', 'Stomach acid reducer', 'medication', 4.8),
('Beta-blocker', 'Heart rate medicine', 'medication', 4.1),
('Bronchodilator', 'Breathing medicine', 'medication', 3.9);
```

**Procedures and Tests**:
```sql
INSERT INTO medical_terminology_simplification (medical_term, simplified_term, category, reading_level) VALUES
('Computed tomography scan', 'CT scan (detailed X-ray)', 'procedure', 4.5),
('Echocardiogram', 'Heart ultrasound', 'procedure', 4.2),
('Colonoscopy', 'Camera test of large intestine', 'procedure', 5.1),
('Magnetic resonance imaging', 'MRI scan (detailed pictures)', 'procedure', 4.8);
```

### **Quality Assurance for Simplification**

**Automated Reading Level Validation**:
```sql
-- Function to validate reading level of simplified text
CREATE OR REPLACE FUNCTION validate_reading_level(simplified_text TEXT) RETURNS NUMERIC AS $$
DECLARE
    word_count INTEGER;
    sentence_count INTEGER;
    syllable_count INTEGER;
    flesch_kincaid_grade NUMERIC;
BEGIN
    -- Simple word count (spaces + 1)
    word_count := array_length(string_to_array(simplified_text, ' '), 1);
    
    -- Simple sentence count (periods + exclamations + questions)
    sentence_count := length(simplified_text) - length(replace(replace(replace(simplified_text, '.', ''), '!', ''), '?', ''));
    
    -- Estimated syllable count (rough approximation)
    syllable_count := word_count * 1.5; -- Average 1.5 syllables per word in simplified text
    
    -- Flesch-Kincaid grade level formula
    flesch_kincaid_grade := 0.39 * (word_count::NUMERIC / sentence_count) + 11.8 * (syllable_count::NUMERIC / word_count) - 15.59;
    
    RETURN flesch_kincaid_grade;
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate reading level on insert/update
CREATE OR REPLACE FUNCTION check_simplified_term_reading_level() RETURNS TRIGGER AS $$
DECLARE
    calculated_reading_level NUMERIC;
BEGIN
    calculated_reading_level := validate_reading_level(NEW.simplified_term);
    
    -- Update reading level field
    NEW.reading_level := calculated_reading_level;
    
    -- Flag for review if reading level too high
    IF calculated_reading_level > 8.0 THEN
        NEW.approval_status := 'pending';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER simplified_term_reading_level_trigger
    BEFORE INSERT OR UPDATE ON medical_terminology_simplification
    FOR EACH ROW EXECUTE FUNCTION check_simplified_term_reading_level();
```

## Integration with Clinical Entity Display

### **Dashboard and Timeline Integration**

**Complexity-Aware Dashboard Queries using Display Tables**:
```sql
-- Fast dashboard query using display tables first, with fallbacks
CREATE OR REPLACE FUNCTION get_user_medications_display(
    p_patient_id UUID,
    p_language VARCHAR(10) DEFAULT 'en-AU',
    p_complexity VARCHAR(20) DEFAULT NULL
) RETURNS TABLE (
    medication_id UUID,
    display_name TEXT,
    instructions TEXT,
    complexity_used VARCHAR(20),
    has_detailed_view BOOLEAN,
    confidence_score NUMERIC
) AS $$
DECLARE
    user_complexity VARCHAR(20);
BEGIN
    -- Get user's complexity preference if not specified
    IF p_complexity IS NULL THEN
        SELECT get_default_complexity_for_user(
            (SELECT id FROM user_profiles WHERE id = p_patient_id)
        ) INTO user_complexity;
    ELSE
        user_complexity := p_complexity;
    END IF;
    
    RETURN QUERY
    SELECT 
        pm.id as medication_id,
        COALESCE(
            md.display_name,
            mt.translated_name,
            pm.medication_name
        ) as display_name,
        COALESCE(
            md.display_instructions,
            mt.translated_instructions,
            pm.instructions
        ) as instructions,
        user_complexity as complexity_used,
        EXISTS(
            SELECT 1 FROM medication_translations mt2 
            WHERE mt2.medication_id = pm.id 
            AND mt2.target_language = p_language 
            AND mt2.complexity_level = 'medical_jargon'
        ) as has_detailed_view,
        COALESCE(md.confidence_score, mt.confidence_score, 1.0) as confidence_score
    FROM patient_medications pm
    LEFT JOIN medications_display md ON (
        md.medication_id = pm.id 
        AND md.language_code = p_language 
        AND md.complexity_level = user_complexity
    )
    LEFT JOIN medication_translations mt ON (
        mt.medication_id = pm.id 
        AND mt.target_language = p_language 
        AND mt.complexity_level = user_complexity
        AND md.medication_id IS NULL
    )
    WHERE pm.patient_id = p_patient_id
    ORDER BY pm.created_at DESC;
END;
$$ LANGUAGE plpgsql;
```

### **Click-Through to Medical Details**

**Detailed View Access using Three-Layer Architecture**:
```sql
-- Function to get medical jargon details for simplified view using display tables
CREATE OR REPLACE FUNCTION get_medical_details_for_entity(
    p_entity_id UUID,
    p_entity_type VARCHAR(50),
    p_language VARCHAR(10) DEFAULT 'en-AU'
) RETURNS JSONB AS $$
DECLARE
    medical_details JSONB;
BEGIN
    CASE p_entity_type
        WHEN 'medication' THEN
            SELECT jsonb_build_object(
                'name', COALESCE(
                    (SELECT display_name FROM medications_display 
                     WHERE medication_id = p_entity_id AND language_code = p_language AND complexity_level = 'medical_jargon'),
                    (SELECT translated_name FROM medication_translations 
                     WHERE medication_id = p_entity_id AND target_language = p_language AND complexity_level = 'medical_jargon'),
                    (SELECT medication_name FROM patient_medications WHERE id = p_entity_id)
                ),
                'instructions', COALESCE(
                    (SELECT display_instructions FROM medications_display 
                     WHERE medication_id = p_entity_id AND language_code = p_language AND complexity_level = 'medical_jargon'),
                    (SELECT translated_instructions FROM medication_translations 
                     WHERE medication_id = p_entity_id AND target_language = p_language AND complexity_level = 'medical_jargon'),
                    (SELECT instructions FROM patient_medications WHERE id = p_entity_id)
                ),
                'rxnorm_code', (SELECT rxnorm_code FROM patient_medications WHERE id = p_entity_id),
                'strength', (SELECT strength FROM patient_medications WHERE id = p_entity_id),
                'dose_form', (SELECT dose_form FROM patient_medications WHERE id = p_entity_id)
            ) INTO medical_details;
            
        WHEN 'condition' THEN
            SELECT jsonb_build_object(
                'name', COALESCE(
                    (SELECT display_name FROM conditions_display 
                     WHERE condition_id = p_entity_id AND language_code = p_language AND complexity_level = 'medical_jargon'),
                    (SELECT translated_name FROM condition_translations 
                     WHERE condition_id = p_entity_id AND target_language = p_language AND complexity_level = 'medical_jargon'),
                    (SELECT condition_name FROM patient_conditions WHERE id = p_entity_id)
                ),
                'snomed_code', (SELECT snomed_code FROM patient_conditions WHERE id = p_entity_id),
                'icd10_code', (SELECT icd10_code FROM patient_conditions WHERE id = p_entity_id)
            ) INTO medical_details;
    END CASE;
    
    RETURN medical_details;
END;
$$ LANGUAGE plpgsql;
```

## Confidence Thresholds and Human Review Queues

### **Per-Domain Confidence Thresholds**

**Healthcare Safety Requirements**: All simplified translations must meet domain-specific confidence thresholds before being presented to users. Low-confidence translations require human review to ensure medical accuracy and patient safety.

#### **Domain-Specific Confidence Requirements**
```sql
-- Confidence threshold configuration by medical domain
CREATE TABLE medical_domain_confidence_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_type VARCHAR(50) NOT NULL, -- 'medication', 'condition', 'allergy', 'procedure'
    complexity_level VARCHAR(20) NOT NULL, -- 'medical_jargon', 'simplified'
    minimum_confidence NUMERIC(5,4) NOT NULL, -- Threshold for auto-approval
    review_required_below NUMERIC(5,4) NOT NULL, -- Threshold for human review
    auto_reject_below NUMERIC(5,4) NOT NULL, -- Threshold for automatic rejection
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(domain_type, complexity_level)
);

-- Insert standard healthcare confidence thresholds
INSERT INTO medical_domain_confidence_thresholds (domain_type, complexity_level, minimum_confidence, review_required_below, auto_reject_below) VALUES
-- Medications - highest safety requirements
('medication', 'simplified', 0.90, 0.75, 0.50),
('medication', 'medical_jargon', 0.85, 0.70, 0.45),

-- Conditions - high accuracy needed
('condition', 'simplified', 0.85, 0.70, 0.45),
('condition', 'medical_jargon', 0.80, 0.65, 0.40),

-- Allergies - critical for safety
('allergy', 'simplified', 0.92, 0.80, 0.55),
('allergy', 'medical_jargon', 0.88, 0.75, 0.50),

-- Procedures - moderate requirements
('procedure', 'simplified', 0.80, 0.65, 0.40),
('procedure', 'medical_jargon', 0.75, 0.60, 0.35);
```

#### **Human Review Queue System**
```sql
-- Queue for translations requiring human review
CREATE TABLE translation_human_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    translation_id UUID NOT NULL, -- Reference to translation table
    entity_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    target_language VARCHAR(10) NOT NULL,
    complexity_level VARCHAR(20) NOT NULL,
    original_text TEXT NOT NULL,
    ai_translated_text TEXT NOT NULL,
    ai_confidence_score NUMERIC(5,4) NOT NULL,
    review_reason VARCHAR(100) NOT NULL, -- 'low_confidence', 'protected_term', 'manual_flag'
    review_priority INTEGER DEFAULT 5, -- 1=urgent, 5=normal, 9=low

    -- Review assignment
    assigned_reviewer_id UUID REFERENCES user_profiles(id),
    assigned_at TIMESTAMPTZ,

    -- Review results
    review_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'in_review', 'approved', 'rejected', 'escalated'
    reviewed_text TEXT,
    reviewer_confidence_score NUMERIC(5,4),
    reviewer_notes TEXT,
    reviewed_at TIMESTAMPTZ,

    -- Audit trail
    profile_id UUID NOT NULL REFERENCES user_profiles(id), -- Patient this affects
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Performance tracking
    review_time_minutes INTEGER, -- Time spent on review

    CONSTRAINT fk_profile_id FOREIGN KEY (profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE
);

-- Indexes for queue management
CREATE INDEX idx_review_queue_pending ON translation_human_review_queue(review_status, review_priority, created_at)
    WHERE review_status = 'pending';
CREATE INDEX idx_review_queue_assigned ON translation_human_review_queue(assigned_reviewer_id, review_status)
    WHERE review_status = 'in_review';
CREATE INDEX idx_review_queue_entity ON translation_human_review_queue(entity_type, entity_id);

-- RLS for review queue
ALTER TABLE translation_human_review_queue ENABLE ROW LEVEL SECURITY;

-- Medical reviewers can see assigned reviews
CREATE POLICY review_queue_reviewer_access ON translation_human_review_queue
FOR ALL USING (
    assigned_reviewer_id = get_current_profile_id()
    OR EXISTS(
        SELECT 1 FROM medical_reviewer_permissions mrp
        WHERE mrp.reviewer_id = get_current_profile_id()
        AND mrp.can_review_domain = entity_type
        AND mrp.is_active = TRUE
    )
);
```

#### **Protected Terms and Glossary Enforcement**
```sql
-- Medical terms that should never be simplified or require special handling
CREATE TABLE protected_medical_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medical_term TEXT NOT NULL,
    term_category VARCHAR(50) NOT NULL, -- 'medication_name', 'dosage', 'medical_code', 'critical_instruction'
    protection_level VARCHAR(20) NOT NULL, -- 'never_translate', 'review_required', 'preserve_original'
    reasoning TEXT NOT NULL, -- Why this term is protected
    alternative_explanation TEXT, -- Safe explanation to provide alongside
    created_by VARCHAR(100) NOT NULL,
    approved_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(medical_term, term_category)
);

-- Standard protected terms
INSERT INTO protected_medical_terms (medical_term, term_category, protection_level, reasoning, alternative_explanation, created_by, approved_by) VALUES
-- Dosages and measurements
('mg', 'dosage', 'never_translate', 'Dosage units must remain exact for safety', 'milligrams (mg)', 'system', 'medical_team'),
('mL', 'dosage', 'never_translate', 'Volume units must remain exact for safety', 'milliliters (mL)', 'system', 'medical_team'),
('twice daily', 'critical_instruction', 'preserve_original', 'Dosing frequency critical for safety', 'take 2 times per day', 'system', 'medical_team'),

-- Medical codes
('RxNorm:%', 'medical_code', 'never_translate', 'Medical codes must remain unchanged', NULL, 'system', 'medical_team'),
('SNOMED:%', 'medical_code', 'never_translate', 'Medical codes must remain unchanged', NULL, 'system', 'medical_team'),

-- Critical medication names
('Warfarin', 'medication_name', 'review_required', 'Blood thinner requires careful explanation', 'blood-thinning medicine (Warfarin)', 'system', 'medical_team'),
('Insulin', 'medication_name', 'review_required', 'Diabetes medication requires careful explanation', 'diabetes medicine (Insulin)', 'system', 'medical_team');

-- Function to check if translation violates protected terms
CREATE OR REPLACE FUNCTION check_protected_terms_violation(
    p_original_text TEXT,
    p_translated_text TEXT,
    p_entity_type VARCHAR(50)
) RETURNS TABLE(
    has_violation BOOLEAN,
    violated_terms TEXT[],
    requires_review BOOLEAN
) AS $$
DECLARE
    protected_term RECORD;
    violations TEXT[] := '{}';
    needs_review BOOLEAN := FALSE;
BEGIN
    -- Check for protected terms in original that may have been inappropriately translated
    FOR protected_term IN
        SELECT * FROM protected_medical_terms pmt
        WHERE pmt.term_category = p_entity_type OR pmt.term_category = 'critical_instruction'
    LOOP
        IF p_original_text ILIKE '%' || protected_term.medical_term || '%' THEN
            -- Check if protected term is preserved or properly handled
            IF protected_term.protection_level = 'never_translate' AND
               p_translated_text NOT ILIKE '%' || protected_term.medical_term || '%' THEN
                violations := array_append(violations, protected_term.medical_term);
            ELSIF protected_term.protection_level = 'review_required' THEN
                needs_review := TRUE;
            END IF;
        END IF;
    END LOOP;

    RETURN QUERY SELECT
        array_length(violations, 1) > 0 OR needs_review,
        violations,
        needs_review;
END;
$$ LANGUAGE plpgsql;
```

#### **Automated Review Triggering**
```sql
-- Function to automatically queue translations for human review based on confidence and protected terms
CREATE OR REPLACE FUNCTION evaluate_translation_for_review(
    p_translation_id UUID,
    p_entity_type VARCHAR(50),
    p_complexity_level VARCHAR(20),
    p_confidence_score NUMERIC(5,4),
    p_original_text TEXT,
    p_translated_text TEXT
) RETURNS VOID AS $$
DECLARE
    threshold_config RECORD;
    protection_check RECORD;
    review_reason VARCHAR(100);
    review_priority INTEGER := 5;
BEGIN
    -- Get confidence thresholds for this domain
    SELECT * INTO threshold_config
    FROM medical_domain_confidence_thresholds
    WHERE domain_type = p_entity_type
    AND complexity_level = p_complexity_level
    AND is_active = TRUE;

    -- Check protected terms
    SELECT * INTO protection_check
    FROM check_protected_terms_violation(p_original_text, p_translated_text, p_entity_type);

    -- Determine if review is needed
    IF p_confidence_score < threshold_config.auto_reject_below THEN
        -- Auto-reject, don't queue for review
        RETURN;
    ELSIF p_confidence_score < threshold_config.review_required_below THEN
        review_reason := 'low_confidence';
        review_priority := 3; -- Higher priority for low confidence
    ELSIF protection_check.has_violation THEN
        review_reason := 'protected_term';
        review_priority := 1; -- Highest priority for protected term violations
    ELSIF protection_check.requires_review THEN
        review_reason := 'protected_term_review';
        review_priority := 2; -- High priority for protected terms requiring review
    ELSE
        -- No review needed
        RETURN;
    END IF;

    -- Queue for human review
    INSERT INTO translation_human_review_queue (
        translation_id,
        entity_id,
        entity_type,
        target_language,
        complexity_level,
        original_text,
        ai_translated_text,
        ai_confidence_score,
        review_reason,
        review_priority,
        profile_id
    ) VALUES (
        p_translation_id,
        (SELECT entity_id FROM get_translation_entity_info(p_translation_id)),
        p_entity_type,
        (SELECT target_language FROM get_translation_info(p_translation_id)),
        p_complexity_level,
        p_original_text,
        p_translated_text,
        p_confidence_score,
        review_reason,
        review_priority,
        (SELECT profile_id FROM get_translation_profile_info(p_translation_id))
    );
END;
$$ LANGUAGE plpgsql;
```

#### **Display Table Override Handling**
```sql
-- Function to handle reviewed translations in display tables
CREATE OR REPLACE FUNCTION apply_reviewed_translation_to_display(
    p_review_queue_id UUID
) RETURNS VOID AS $$
DECLARE
    review_record RECORD;
BEGIN
    -- Get review record
    SELECT * INTO review_record
    FROM translation_human_review_queue
    WHERE id = p_review_queue_id
    AND review_status = 'approved';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Review record not found or not approved';
    END IF;

    -- Update display table with reviewed translation
    CASE review_record.entity_type
        WHEN 'medication' THEN
            INSERT INTO medications_display (
                medication_id,
                patient_id,
                language_code,
                complexity_level,
                display_name,
                confidence_score,
                last_synced_at,
                human_reviewed
            ) VALUES (
                review_record.entity_id,
                review_record.profile_id,
                review_record.target_language,
                review_record.complexity_level,
                review_record.reviewed_text,
                review_record.reviewer_confidence_score,
                NOW(),
                TRUE
            )
            ON CONFLICT (medication_id, language_code, complexity_level)
            DO UPDATE SET
                display_name = review_record.reviewed_text,
                confidence_score = review_record.reviewer_confidence_score,
                last_synced_at = NOW(),
                human_reviewed = TRUE;

        WHEN 'condition' THEN
            INSERT INTO conditions_display (
                condition_id,
                patient_id,
                language_code,
                complexity_level,
                display_name,
                confidence_score,
                last_synced_at,
                human_reviewed
            ) VALUES (
                review_record.entity_id,
                review_record.profile_id,
                review_record.target_language,
                review_record.complexity_level,
                review_record.reviewed_text,
                review_record.reviewer_confidence_score,
                NOW(),
                TRUE
            )
            ON CONFLICT (condition_id, language_code, complexity_level)
            DO UPDATE SET
                display_name = review_record.reviewed_text,
                confidence_score = review_record.reviewer_confidence_score,
                last_synced_at = NOW(),
                human_reviewed = TRUE;
    END CASE;
END;
$$ LANGUAGE plpgsql;
```

### **Review Workflow and Escalation**

#### **Medical Reviewer Permissions**
```sql
-- Medical professional reviewer authorization
CREATE TABLE medical_reviewer_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reviewer_id UUID NOT NULL REFERENCES user_profiles(id),
    can_review_domain VARCHAR(50) NOT NULL, -- 'medication', 'condition', 'allergy', 'procedure', 'all'
    max_complexity_level VARCHAR(20) NOT NULL, -- 'simplified', 'medical_jargon'
    medical_license_number VARCHAR(100),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'verified', 'suspended'
    verified_by UUID REFERENCES user_profiles(id),
    verified_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(reviewer_id, can_review_domain)
);

-- RLS for reviewer permissions
ALTER TABLE medical_reviewer_permissions ENABLE ROW LEVEL SECURITY;

-- Only admins and the reviewer themselves can see permissions
CREATE POLICY reviewer_permissions_access ON medical_reviewer_permissions
FOR ALL USING (
    reviewer_id = get_current_profile_id()
    OR EXISTS(SELECT 1 FROM admin_users WHERE user_id = get_current_profile_id())
);
```

This comprehensive confidence threshold and human review system ensures that simplified medical translations meet healthcare safety standards while providing a structured workflow for medical professionals to review and approve translations that fall below confidence thresholds.

## Integration with Narrative Systems

### **Complexity-Aware Narrative Generation**

**Master and Sub-Narrative Complexity Support**:
```sql
-- Enhanced narrative generation using three-layer architecture
CREATE OR REPLACE FUNCTION generate_narrative_with_complexity(
    p_patient_id UUID,
    p_narrative_type VARCHAR(50),
    p_language VARCHAR(10),
    p_complexity VARCHAR(20)
) RETURNS TEXT AS $$
DECLARE
    narrative_content TEXT;
    clinical_entities RECORD;
    entity_descriptions TEXT[];
BEGIN
    -- Collect medication entities using display tables with fallbacks
    FOR clinical_entities IN
        SELECT 
            COALESCE(
                md.display_name,
                mt.translated_name,
                pm.medication_name
            ) as name,
            'medication' as entity_type
        FROM patient_medications pm
        LEFT JOIN medications_display md ON (
            md.medication_id = pm.id 
            AND md.language_code = p_language 
            AND md.complexity_level = p_complexity
        )
        LEFT JOIN medication_translations mt ON (
            mt.medication_id = pm.id 
            AND mt.target_language = p_language 
            AND mt.complexity_level = p_complexity
            AND md.medication_id IS NULL
        )
        WHERE pm.patient_id = p_patient_id
        
        UNION ALL
        
        SELECT 
            COALESCE(
                cd.display_name,
                ct.translated_name,
                pc.condition_name
            ) as name,
            'condition' as entity_type
        FROM patient_conditions pc
        LEFT JOIN conditions_display cd ON (
            cd.condition_id = pc.id 
            AND cd.language_code = p_language 
            AND cd.complexity_level = p_complexity
        )
        LEFT JOIN condition_translations ct ON (
            ct.condition_id = pc.id 
            AND ct.target_language = p_language 
            AND ct.complexity_level = p_complexity
            AND cd.condition_id IS NULL
        )
        WHERE pc.patient_id = p_patient_id
    LOOP
        entity_descriptions := array_append(entity_descriptions, clinical_entities.name);
    END LOOP;
    
    -- Generate narrative appropriate for complexity level
    IF p_complexity = 'simplified' THEN
        narrative_content := format(
            'Your current health summary includes treatment for %s. These medications and conditions are being managed by your healthcare team.',
            array_to_string(entity_descriptions, ', ')
        );
    ELSE
        narrative_content := format(
            'Current clinical presentation includes the following entities: %s. Ongoing therapeutic management continues per established protocols.',
            array_to_string(entity_descriptions, ', ')
        );
    END IF;
    
    RETURN narrative_content;
END;
$$ LANGUAGE plpgsql;
```

This medical literacy levels architecture uses the three-layer approach (backend tables + per-domain translation tables + per-domain display tables) to ensure that all users can access and understand their healthcare information at an appropriate complexity level while maintaining clinical accuracy and enabling seamless transitions between complexity levels for different use cases. The per-domain display tables provide fast access to complexity-specific content while preserving the medical jargon source of truth in backend tables.