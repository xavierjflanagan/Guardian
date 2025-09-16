# Medical Literacy Levels Architecture

**Status**: Planning Phase  
**Created**: 16 September 2025  
**Last Updated**: 16 September 2025

## Overview

This document defines the two-tier medical complexity system that makes healthcare information accessible to users regardless of their medical knowledge level. The system provides medical jargon for healthcare professionals and simplified patient-friendly language targeting a 14-year-old reading level, with seamless toggling between complexity levels and integration across all clinical data presentation.

## Problem Domain

Healthcare language accessibility presents significant challenges:
- Medical terminology creates barriers for patients without medical training
- Healthcare providers need precise medical language for professional decision-making
- Same clinical information must be presented appropriately for different audiences
- Medical accuracy must be preserved across complexity levels
- User preferences need to be respected while maintaining clinical safety
- Cross-complexity access enables better patient-provider communication

## Core Architecture Philosophy

### **Source of Truth: Medical Jargon**
The backend database stores high-complexity medical terminology as the authoritative source, with simplified versions generated as a separate translated layer. This approach ensures:
- **Clinical accuracy**: Medical professionals receive unaltered medical information
- **Audit compliance**: Original medical terminology preserved for regulatory requirements
- **Quality control**: Simplification process can be validated against medical source
- **Regulatory safety**: Healthcare providers always have access to complete medical detail

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

**Medications Table Complexity Extensions**:
```sql
-- Add complexity-specific translations to existing translation structure
-- medication_name_translations structure:
-- {
--   "en-AU": {
--     "medical_jargon": "Lisinopril 10mg oral tablet",
--     "simplified": "Blood pressure medicine (10mg)"
--   },
--   "es-ES": {
--     "medical_jargon": "Lisinopril 10mg comprimido oral", 
--     "simplified": "Medicina para la presión arterial (10mg)"
--   }
-- }

-- Enhanced translation structure supports both language and complexity
ALTER TABLE medications ADD COLUMN IF NOT EXISTS complexity_source VARCHAR(20) DEFAULT 'medical_jargon';
```

**Conditions Table Complexity Extensions**:
```sql
-- Enhanced condition translations with complexity levels
-- condition_name_translations structure:
-- {
--   "en-AU": {
--     "medical_jargon": "Non-small cell lung carcinoma",
--     "simplified": "Lung cancer"
--   },
--   "es-ES": {
--     "medical_jargon": "Carcinoma pulmonar de células no pequeñas",
--     "simplified": "Cáncer de pulmón"
--   }
-- }

-- Medical complexity metadata
ALTER TABLE conditions ADD COLUMN IF NOT EXISTS medical_terminology_complexity JSONB DEFAULT '{}';
```

**Procedures Table Complexity Extensions**:
```sql
-- procedure_name_translations structure:
-- {
--   "en-AU": {
--     "medical_jargon": "Percutaneous coronary intervention with drug-eluting stent",
--     "simplified": "Heart procedure to open blocked artery"
--   }
-- }
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

**Translation Retrieval with Complexity Support**:
```sql
-- Enhanced function to get text with language and complexity preferences
CREATE OR REPLACE FUNCTION get_translated_text_with_complexity(
    translations JSONB,
    target_language VARCHAR(10),
    complexity_level VARCHAR(20),
    source_language VARCHAR(10) DEFAULT 'en-AU'
) RETURNS TEXT AS $$
DECLARE
    language_translations JSONB;
    result_text TEXT;
BEGIN
    -- Get translations for target language
    language_translations := translations->target_language;
    
    -- Try to get text at requested complexity level
    IF language_translations ? complexity_level THEN
        result_text := language_translations->>complexity_level;
    END IF;
    
    -- Fallback to medical jargon if simplified not available
    IF result_text IS NULL AND language_translations ? 'medical_jargon' THEN
        result_text := language_translations->>'medical_jargon';
    END IF;
    
    -- Fallback to source language if target language not available
    IF result_text IS NULL THEN
        language_translations := translations->source_language;
        IF language_translations ? complexity_level THEN
            result_text := language_translations->>complexity_level;
        ELSE
            result_text := language_translations->>'medical_jargon';
        END IF;
    END IF;
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
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

**Complexity-Aware Dashboard Queries**:
```sql
-- User dashboard with complexity preference
CREATE OR REPLACE FUNCTION get_user_medications_display(
    p_patient_id UUID,
    p_language VARCHAR(10) DEFAULT 'en-AU',
    p_complexity VARCHAR(20) DEFAULT NULL
) RETURNS TABLE (
    medication_id UUID,
    display_name TEXT,
    instructions TEXT,
    complexity_used VARCHAR(20),
    has_detailed_view BOOLEAN
) AS $$
DECLARE
    user_complexity VARCHAR(20);
BEGIN
    -- Get user's complexity preference if not specified
    IF p_complexity IS NULL THEN
        SELECT get_default_complexity_for_user(
            (SELECT profile_id FROM medications WHERE patient_id = p_patient_id LIMIT 1)
        ) INTO user_complexity;
    ELSE
        user_complexity := p_complexity;
    END IF;
    
    RETURN QUERY
    SELECT 
        m.id as medication_id,
        get_translated_text_with_complexity(
            m.medication_name_translations, 
            p_language, 
            user_complexity, 
            m.source_language
        ) as display_name,
        get_translated_text_with_complexity(
            m.instructions_translations, 
            p_language, 
            user_complexity, 
            m.source_language
        ) as instructions,
        user_complexity as complexity_used,
        (m.medication_name_translations->p_language ? 'medical_jargon') as has_detailed_view
    FROM medications m
    WHERE m.patient_id = p_patient_id
    AND m.is_current = TRUE
    ORDER BY m.clinical_effective_date DESC;
END;
$$ LANGUAGE plpgsql;
```

### **Click-Through to Medical Details**

**Detailed View Access from Simplified**:
```sql
-- Function to get medical jargon details for simplified view
CREATE OR REPLACE FUNCTION get_medical_details_for_entity(
    p_entity_id UUID,
    p_entity_type VARCHAR(50),
    p_language VARCHAR(10) DEFAULT 'en-AU'
) RETURNS JSONB AS $$
DECLARE
    medical_details JSONB;
    entity_data RECORD;
BEGIN
    -- Get entity data based on type
    CASE p_entity_type
        WHEN 'medication' THEN
            SELECT 
                get_translated_text_with_complexity(medication_name_translations, p_language, 'medical_jargon') as name,
                get_translated_text_with_complexity(instructions_translations, p_language, 'medical_jargon') as instructions,
                rxnorm_code,
                strength,
                dose_form,
                route
            INTO entity_data
            FROM medications WHERE id = p_entity_id;
            
        WHEN 'condition' THEN
            SELECT 
                get_translated_text_with_complexity(condition_name_translations, p_language, 'medical_jargon') as name,
                get_translated_text_with_complexity(description_translations, p_language, 'medical_jargon') as description,
                snomed_code,
                icd10_code
            INTO entity_data
            FROM conditions WHERE id = p_entity_id;
    END CASE;
    
    -- Build medical details JSON
    medical_details := to_jsonb(entity_data);
    
    RETURN medical_details;
END;
$$ LANGUAGE plpgsql;
```

## Integration with Narrative Systems

### **Complexity-Aware Narrative Generation**

**Master and Sub-Narrative Complexity Support**:
```sql
-- Enhanced narrative generation with complexity awareness
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
    -- Collect clinical entities in appropriate complexity level
    FOR clinical_entities IN
        SELECT 
            get_translated_text_with_complexity(medication_name_translations, p_language, p_complexity) as name,
            'medication' as entity_type
        FROM medications 
        WHERE patient_id = p_patient_id AND is_current = TRUE
        UNION ALL
        SELECT 
            get_translated_text_with_complexity(condition_name_translations, p_language, p_complexity) as name,
            'condition' as entity_type
        FROM conditions 
        WHERE patient_id = p_patient_id AND is_current = TRUE
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

This medical literacy levels architecture ensures that all users can access and understand their healthcare information at an appropriate complexity level while maintaining clinical accuracy and enabling seamless transitions between complexity levels for different use cases.