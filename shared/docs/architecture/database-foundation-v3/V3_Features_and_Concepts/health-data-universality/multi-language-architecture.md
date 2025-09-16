# Multi-Language Architecture

**Status**: Planning Phase  
**Created**: 16 September 2025  
**Last Updated**: 16 September 2025

## Overview

This document defines the database architecture and implementation strategy for supporting multiple languages across all clinical data in Exora. The system uses a hybrid approach combining backend permanent storage for planned languages with frontend emergency translation for unplanned scenarios, while maintaining integration with existing temporal data management and medical code resolution systems.

## Database Schema Architecture

### **Core Translation Storage Strategy**

**JSONB Column Approach**: Instead of separate tables or databases for each language, we extend existing clinical tables with JSONB columns containing all language translations. This approach provides optimal performance, simplicity, and PostgreSQL optimization benefits.

### **Schema Changes Required**

#### **1. User Language Preferences**
```sql
-- New table for user language management
CREATE TABLE user_language_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    primary_language VARCHAR(10) NOT NULL DEFAULT 'en-AU', -- ISO 639-1 + country
    active_languages TEXT[] NOT NULL DEFAULT ARRAY['en-AU'], -- Array of enabled languages
    medical_complexity_preference VARCHAR(20) NOT NULL DEFAULT 'simplified', -- 'medical_jargon' or 'simplified'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS policies for user language preferences
CREATE POLICY user_language_preferences_policy ON user_language_preferences
    FOR ALL USING (profile_id = get_current_profile_id());
```

#### **2. Clinical Data Translation Extensions**

**Medications Table Extensions**:
```sql
-- Add translation columns to existing medications table
ALTER TABLE medications ADD COLUMN IF NOT EXISTS medication_name_translations JSONB DEFAULT '{}';
ALTER TABLE medications ADD COLUMN IF NOT EXISTS instructions_translations JSONB DEFAULT '{}';
ALTER TABLE medications ADD COLUMN IF NOT EXISTS side_effects_translations JSONB DEFAULT '{}';
ALTER TABLE medications ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU';
ALTER TABLE medications ADD COLUMN IF NOT EXISTS available_translations TEXT[] DEFAULT ARRAY['en-AU'];
ALTER TABLE medications ADD COLUMN IF NOT EXISTS translation_confidence JSONB DEFAULT '{}';

-- JSONB structure example:
-- medication_name_translations: {
--   "en-AU": "Panadol 500mg tablet",
--   "es-ES": "Panadol 500mg comprimido", 
--   "fr-FR": "Panadol 500mg comprimé",
--   "zh-CN": "必理痛500毫克片剂"
-- }
```

**Conditions Table Extensions**:
```sql
ALTER TABLE conditions ADD COLUMN IF NOT EXISTS condition_name_translations JSONB DEFAULT '{}';
ALTER TABLE conditions ADD COLUMN IF NOT EXISTS description_translations JSONB DEFAULT '{}';
ALTER TABLE conditions ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU';
ALTER TABLE conditions ADD COLUMN IF NOT EXISTS available_translations TEXT[] DEFAULT ARRAY['en-AU'];
ALTER TABLE conditions ADD COLUMN IF NOT EXISTS translation_confidence JSONB DEFAULT '{}';
```

**Allergies Table Extensions**:
```sql
ALTER TABLE allergies ADD COLUMN IF NOT EXISTS allergen_name_translations JSONB DEFAULT '{}';
ALTER TABLE allergies ADD COLUMN IF NOT EXISTS reaction_description_translations JSONB DEFAULT '{}';
ALTER TABLE allergies ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU';
ALTER TABLE allergies ADD COLUMN IF NOT EXISTS available_translations TEXT[] DEFAULT ARRAY['en-AU'];
ALTER TABLE allergies ADD COLUMN IF NOT EXISTS translation_confidence JSONB DEFAULT '{}';
```

**Procedures Table Extensions**:
```sql
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS procedure_name_translations JSONB DEFAULT '{}';
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS description_translations JSONB DEFAULT '{}';
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU';
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS available_translations TEXT[] DEFAULT ARRAY['en-AU'];
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS translation_confidence JSONB DEFAULT '{}';
```

#### **3. Narrative Translation Support**

**Master and Sub-Narratives Extensions**:
```sql
ALTER TABLE master_narratives ADD COLUMN IF NOT EXISTS content_translations JSONB DEFAULT '{}';
ALTER TABLE master_narratives ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU';
ALTER TABLE master_narratives ADD COLUMN IF NOT EXISTS available_translations TEXT[] DEFAULT ARRAY['en-AU'];

ALTER TABLE sub_narratives ADD COLUMN IF NOT EXISTS content_translations JSONB DEFAULT '{}';
ALTER TABLE sub_narratives ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU';
ALTER TABLE sub_narratives ADD COLUMN IF NOT EXISTS available_translations TEXT[] DEFAULT ARRAY['en-AU'];
```

### **Performance Optimization Strategy**

#### **JSONB Indexing for Translation Lookup**
```sql
-- GIN indexes for fast JSONB key lookup
CREATE INDEX idx_medications_name_translations ON medications USING GIN (medication_name_translations);
CREATE INDEX idx_conditions_name_translations ON conditions USING GIN (condition_name_translations);
CREATE INDEX idx_allergies_name_translations ON allergies USING GIN (allergen_name_translations);
CREATE INDEX idx_procedures_name_translations ON procedures USING GIN (procedure_name_translations);

-- Btree indexes for language filtering
CREATE INDEX idx_medications_available_translations ON medications USING GIN (available_translations);
CREATE INDEX idx_conditions_available_translations ON conditions USING GIN (available_translations);
```

#### **Query Optimization Functions**
```sql
-- Function to get translated text with fallback
CREATE OR REPLACE FUNCTION get_translated_text(
    translations JSONB,
    target_language VARCHAR(10),
    source_language VARCHAR(10) DEFAULT 'en-AU'
) RETURNS TEXT AS $$
BEGIN
    -- Try target language first
    IF translations ? target_language THEN
        RETURN translations ->> target_language;
    END IF;
    
    -- Fallback to source language
    IF translations ? source_language THEN
        RETURN translations ->> source_language;
    END IF;
    
    -- Fallback to first available translation
    RETURN translations ->> (SELECT jsonb_object_keys(translations) LIMIT 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

## Migration Strategy and Implementation Mechanism

### **Phase 1: Schema Extension (Backward Compatible)**

**Migration Steps**:
1. **Add new columns** to existing tables with default empty JSONB values
2. **Create indexes** for performance optimization
3. **Add user language preferences table** with RLS policies
4. **Deploy translation utility functions**
5. **No data migration required** - existing data continues working unchanged

**Migration Script Template**:
```sql
-- migrations/add_translation_support.sql
BEGIN;

-- Step 1: Add translation columns (backward compatible)
ALTER TABLE medications ADD COLUMN IF NOT EXISTS medication_name_translations JSONB DEFAULT '{}';
-- ... repeat for all clinical tables

-- Step 2: Performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medications_name_translations 
    ON medications USING GIN (medication_name_translations);

-- Step 3: Utility functions
CREATE OR REPLACE FUNCTION get_translated_text(/* function definition */);

-- Step 4: Populate existing data with source language
UPDATE medications SET 
    medication_name_translations = jsonb_build_object('en-AU', medication_name),
    source_language = 'en-AU',
    available_translations = ARRAY['en-AU']
WHERE medication_name_translations = '{}';

COMMIT;
```

### **Phase 2: Data Population (Background Processing)**

**Existing Data Translation Process**:
1. **Background job** identifies all clinical entities needing translation
2. **Batch processing** translates entities to user's requested languages
3. **Confidence scoring** applied to all AI translations
4. **Progress tracking** updates user on translation completion status
5. **Quality validation** flags low-confidence translations for review

**Translation Workflow**:
```sql
-- Translation job status tracking
CREATE TABLE translation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    target_language VARCHAR(10) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    total_entities INTEGER DEFAULT 0,
    completed_entities INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT
);
```

### **Phase 3: Application Integration**

**Frontend Query Pattern**:
```sql
-- Example query for user dashboard in selected language
SELECT 
    id,
    get_translated_text(medication_name_translations, 'fr-FR', source_language) as medication_name,
    get_translated_text(instructions_translations, 'fr-FR', source_language) as instructions,
    source_language,
    'fr-FR' = ANY(available_translations) as has_french_translation
FROM medications 
WHERE patient_id = $1
ORDER BY clinical_effective_date DESC;
```

## Foreign Language File Upload Handling

### **Upload Processing Workflow**

**Language Detection and Processing**:
1. **Document upload** → AI detects source language during Pass 1
2. **Source language processing** → Full AI pipeline processes in detected language
3. **Medical code assignment** → Universal codes (RxNorm) assigned regardless of language  
4. **Database storage** → Clinical entities stored with source language metadata
5. **User language translation** → Automatic translation to user's primary language
6. **Deduplication integration** → Temporal deduplication works on universal medical codes

**Database Integration Example**:
```sql
-- Spanish hospital discharge processed for English-primary user
INSERT INTO medications (
    patient_id,
    medication_name_translations,
    instructions_translations,
    source_language,
    available_translations,
    rxnorm_code, -- Universal code enables deduplication
    clinical_effective_date
) VALUES (
    $1,
    '{"es-ES": "Lisinopril 10mg comprimido", "en-AU": "Lisinopril 10mg tablet"}',
    '{"es-ES": "Tomar una vez al día", "en-AU": "Take once daily"}',
    'es-ES',
    ARRAY['es-ES', 'en-AU'],
    '314076', -- RxNorm code for deduplication
    '2025-09-15'
);
```

## Emergency Translation Architecture

### **Frontend Real-Time Translation**

**Implementation Strategy**:
- **Session-based translation** for immediate unplanned language needs
- **Translation API integration** with OpenAI/Google Translate
- **Cache management** to avoid repeated translation costs
- **Background job trigger** to create permanent translations for future use

**Emergency Translation Flow**:
1. **User requests emergency language** (e.g., Russian for travel)
2. **Frontend translates current view** using real-time AI translation
3. **Session caching** stores translations for immediate reuse
4. **Background job created** to permanently translate user's full profile
5. **Automatic upgrade prompt** to permanent language support

**Cost and Performance**:
- **Emergency translation**: 10-30 seconds, $0.10-0.30 per session
- **Permanent translation**: 2-5 minutes background processing, $0.50-2.00 per profile
- **Cache duration**: 24 hours for emergency translations
- **Automatic conversion**: Emergency translations become permanent after 3 uses

## Integration with Existing V3 Architecture

### **Temporal Data Management Integration**

**Deduplication Compatibility**:
- **Medical codes remain universal** → RxNorm/PBS codes enable cross-language deduplication
- **Temporal precedence preserved** → Date hierarchy works regardless of source language
- **Silver tables enhanced** → Include translation metadata and confidence scores
- **Supersession logic maintained** → Language differences don't affect clinical identity

**Clinical Identity Policies**:
- **Identity determination** remains language-agnostic using medical codes
- **Translation confidence** propagated through identity validation
- **Conservative fallbacks** apply when translation confidence is low
- **Source language preserved** for audit trail and quality assurance

### **Medical Code Resolution Integration**

**Multi-Language Code Assignment**:
- **Universal codes assigned first** → RxNorm, SNOMED-CT for all languages
- **Local codes by user country** → PBS for Australian users, regardless of document language
- **Translation layer separate** → Medical codes remain unchanged across languages
- **Embedding matching enhanced** → Support multiple languages in code resolution

## Data Backup and Recovery Strategy

### **Translation Data Protection**

**Backup Strategy**:
- **JSONB translations included** in all standard database backups
- **Translation job history preserved** for audit and recovery purposes
- **Source language metadata protected** to enable re-translation if needed
- **Confidence scores maintained** for quality assurance validation

**Recovery Procedures**:
- **Translation reconstruction** possible from source language and job history
- **Incremental re-translation** for corrupted translation data
- **Source data always preserved** → Original language data never overwritten
- **Quality validation** during recovery to ensure translation accuracy

This architecture provides a robust, scalable foundation for multi-language support while maintaining integration with existing V3 systems and ensuring clinical data safety across language barriers.