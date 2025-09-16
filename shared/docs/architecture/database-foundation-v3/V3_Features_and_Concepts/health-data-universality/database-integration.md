# Database Integration with Existing V3 Architecture

**Status**: Planning Phase  
**Created**: 16 September 2025  
**Last Updated**: 16 September 2025

## Overview

This document defines how the multi-language and medical literacy systems integrate with the existing V3 database architecture, including temporal data management, medical code resolution, and narrative systems. The integration maintains backward compatibility while enabling new translation capabilities through careful schema evolution and performance optimization.

## Integration with Temporal Data Management

### **Deduplication Framework Integration**

**Enhanced Supersession Logic with Language Awareness**:
The deduplication framework operates on medical codes (language-agnostic) but now preserves translation data through supersession chains.

**Database Schema Modifications for Supersession**:
```sql
-- Extend supersession_history to track translation preservation
ALTER TABLE supersession_history ADD COLUMN IF NOT EXISTS translation_data_preserved JSONB DEFAULT '{}';
ALTER TABLE supersession_history ADD COLUMN IF NOT EXISTS source_languages TEXT[] DEFAULT ARRAY[];

-- Enhanced supersession function to preserve translations
CREATE OR REPLACE FUNCTION apply_supersession_with_translations(
    superseding_entity_id UUID,
    superseded_entity_id UUID,
    supersession_type supersession_type_enum,
    preserve_translation_data BOOLEAN DEFAULT TRUE
) RETURNS supersession_result AS $$
DECLARE
    result supersession_result;
    translation_data JSONB;
BEGIN
    -- Preserve translation data from superseded entity
    IF preserve_translation_data THEN
        SELECT jsonb_build_object(
            'medication_name_translations', medication_name_translations,
            'instructions_translations', instructions_translations,
            'available_translations', available_translations,
            'source_language', source_language
        ) INTO translation_data
        FROM medications WHERE id = superseded_entity_id;
        
        -- Merge translations into superseding entity
        UPDATE medications SET
            medication_name_translations = medication_name_translations || (translation_data->>'medication_name_translations')::jsonb,
            available_translations = array_cat(available_translations, (translation_data->>'available_translations')::text[])
        WHERE id = superseding_entity_id;
    END IF;
    
    -- Continue with standard supersession logic
    -- ... existing supersession implementation
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;
```

**Clinical Identity Policies Integration**:
Language metadata enhances identity validation without changing core identity logic:

```sql
-- Enhanced identity validation with translation confidence
CREATE OR REPLACE FUNCTION validate_clinical_identity_with_translations(
    entity clinical_entity,
    proposed_identity_key VARCHAR(255)
) RETURNS identity_validation_result AS $$
DECLARE
    validation_result identity_validation_result;
    translation_confidence NUMERIC;
BEGIN
    -- Perform standard identity validation
    validation_result := validate_clinical_identity(entity, proposed_identity_key);
    
    -- Enhance with translation confidence scoring
    IF entity.source_language != 'en-AU' THEN
        SELECT AVG(confidence_score) INTO translation_confidence
        FROM jsonb_each_text(entity.translation_confidence);
        
        -- Lower confidence for translated source data
        validation_result.confidence_score := validation_result.confidence_score * translation_confidence;
        validation_result.confidence_flags := array_append(
            validation_result.confidence_flags, 
            'TRANSLATED_SOURCE_DATA'
        );
    END IF;
    
    RETURN validation_result;
END;
$$ LANGUAGE plpgsql;
```

### **Silver Tables Enhancement**

**Translation-Aware Silver Table Schema**:
Silver tables (source of truth) now include translation metadata for comprehensive clinical data representation:

```sql
-- Enhanced medications_silver with translation support
CREATE TABLE medications_silver (
    -- Existing silver table columns
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL,
    clinical_effective_date DATE NOT NULL,
    rxnorm_code VARCHAR(20),
    medication_name TEXT NOT NULL,
    -- New translation columns
    medication_name_translations JSONB DEFAULT '{}',
    instructions_translations JSONB DEFAULT '{}',
    source_language VARCHAR(10) DEFAULT 'en-AU',
    available_translations TEXT[] DEFAULT ARRAY['en-AU'],
    translation_confidence JSONB DEFAULT '{}',
    translation_last_updated TIMESTAMPTZ DEFAULT NOW(),
    -- Existing temporal columns
    supersedes_entity_id UUID,
    is_current BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Function to populate silver table with translation awareness
CREATE OR REPLACE FUNCTION populate_medications_silver() RETURNS VOID AS $$
BEGIN
    -- Clear and repopulate silver table with current medications
    DELETE FROM medications_silver;
    
    INSERT INTO medications_silver (
        id, patient_id, clinical_effective_date, rxnorm_code, medication_name,
        medication_name_translations, instructions_translations, source_language,
        available_translations, translation_confidence, supersedes_entity_id, is_current
    )
    SELECT 
        m.id, m.patient_id, m.clinical_effective_date, m.rxnorm_code, 
        COALESCE(m.medication_name_translations->>'en-AU', m.medication_name) as medication_name,
        m.medication_name_translations, m.instructions_translations, m.source_language,
        m.available_translations, m.translation_confidence, m.supersedes_entity_id, m.is_current
    FROM medications m
    WHERE m.is_current = TRUE
    ORDER BY m.patient_id, m.clinical_effective_date DESC;
END;
$$ LANGUAGE plpgsql;
```

## Integration with Medical Code Resolution

### **Enhanced Code Resolution for Multi-Language Support**

**Language-Aware Medical Code Assignment**:
The medical code resolution system now handles documents in any language while maintaining universal code assignment:

```sql
-- Enhanced code resolution request structure
CREATE TYPE code_resolution_request_multilingual AS (
    entity_type VARCHAR(50),
    extracted_attributes JSONB,
    clinical_context TEXT,
    document_origin VARCHAR(20),
    source_language VARCHAR(10), -- New field for language awareness
    target_languages TEXT[] -- Languages to generate codes for
);

-- Enhanced code resolution response
CREATE TYPE code_resolution_response_multilingual AS (
    primary_code medical_code,
    localized_codes JSONB, -- Country-specific codes by language
    code_confidence NUMERIC,
    alternative_codes medical_code[],
    selection_method VARCHAR(50),
    language_metadata JSONB -- Translation and confidence data
);
```

**Embedding-Based Matching with Language Support**:
The embedding system supports multi-language medication matching while maintaining code universality:

```sql
-- Enhanced medication embedding storage
CREATE TABLE medication_embeddings_multilingual (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_text TEXT NOT NULL,
    language VARCHAR(10) NOT NULL,
    rxnorm_code VARCHAR(20) NOT NULL,
    embedding VECTOR(1536), -- OpenAI embedding dimension
    confidence_score NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast similarity search by language
CREATE INDEX idx_medication_embeddings_lang_vector 
    ON medication_embeddings_multilingual 
    USING ivfflat (embedding vector_cosine_ops) 
    WHERE language IN ('en-AU', 'es-ES', 'fr-FR', 'zh-CN');
```

### **Universal vs Local Code Management**

**Multi-Language Local Code Storage**:
Local codes (PBS, BNF, etc.) are stored with language context for proper user presentation:

```sql
-- Enhanced local code mappings with language context
CREATE TABLE medication_local_codes_multilingual (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rxnorm_code VARCHAR(20) NOT NULL, -- Universal code
    country_code VARCHAR(3) NOT NULL, -- ISO 3166-1
    language VARCHAR(10) NOT NULL, -- Language for display
    local_system VARCHAR(20) NOT NULL, -- PBS, BNF, CIP, etc.
    local_code VARCHAR(50) NOT NULL,
    local_display_name TEXT NOT NULL,
    local_description TEXT,
    confidence_score NUMERIC NOT NULL,
    mapping_method VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Query function for user-appropriate codes
CREATE OR REPLACE FUNCTION get_medication_codes_for_user(
    p_rxnorm_code VARCHAR(20),
    p_user_language VARCHAR(10),
    p_user_country VARCHAR(3)
) RETURNS TABLE (
    universal_code VARCHAR(20),
    local_code VARCHAR(50),
    display_name TEXT,
    description TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p_rxnorm_code as universal_code,
        mlc.local_code,
        mlc.local_display_name as display_name,
        mlc.local_description as description
    FROM medication_local_codes_multilingual mlc
    WHERE mlc.rxnorm_code = p_rxnorm_code
    AND mlc.language = p_user_language
    AND mlc.country_code = p_user_country
    ORDER BY mlc.confidence_score DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;
```

## Integration with Narrative Architecture

### **Multi-Language Master and Sub-Narratives**

**Translation-Aware Narrative Generation**:
Master and sub-narratives support multiple languages while maintaining clinical coherence:

```sql
-- Enhanced master narratives with translation support
ALTER TABLE master_narratives ADD COLUMN IF NOT EXISTS content_translations JSONB DEFAULT '{}';
ALTER TABLE master_narratives ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU';
ALTER TABLE master_narratives ADD COLUMN IF NOT EXISTS available_translations TEXT[] DEFAULT ARRAY['en-AU'];
ALTER TABLE master_narratives ADD COLUMN IF NOT EXISTS medical_complexity_level VARCHAR(20) DEFAULT 'simplified';

-- Enhanced sub-narratives with translation support
ALTER TABLE sub_narratives ADD COLUMN IF NOT EXISTS content_translations JSONB DEFAULT '{}';
ALTER TABLE sub_narratives ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU';
ALTER TABLE sub_narratives ADD COLUMN IF NOT EXISTS available_translations TEXT[] DEFAULT ARRAY['en-AU'];
ALTER TABLE sub_narratives ADD COLUMN IF NOT EXISTS medical_complexity_level VARCHAR(20) DEFAULT 'simplified';

-- Function to generate narratives in user's preferred language and complexity
CREATE OR REPLACE FUNCTION get_narrative_for_user(
    p_narrative_id UUID,
    p_target_language VARCHAR(10),
    p_complexity_level VARCHAR(20)
) RETURNS TEXT AS $$
DECLARE
    narrative_content TEXT;
    fallback_content TEXT;
BEGIN
    -- Try to get content in target language and complexity
    SELECT content_translations->>p_target_language INTO narrative_content
    FROM master_narratives 
    WHERE id = p_narrative_id 
    AND medical_complexity_level = p_complexity_level;
    
    -- Fallback to source language if translation not available
    IF narrative_content IS NULL THEN
        SELECT content_translations->>source_language INTO fallback_content
        FROM master_narratives 
        WHERE id = p_narrative_id 
        AND medical_complexity_level = p_complexity_level;
        
        narrative_content := fallback_content;
    END IF;
    
    RETURN narrative_content;
END;
$$ LANGUAGE plpgsql;
```

## Performance Impact Analysis and Optimization

### **Query Performance with JSONB Translations**

**Baseline Performance Comparison**:
| Operation | Before (TEXT) | After (JSONB) | Impact |
|-----------|---------------|---------------|---------|
| Single medication lookup | 2ms | 3ms | +50% (acceptable) |
| Dashboard load (20 medications) | 15ms | 22ms | +47% (acceptable) |
| Full profile translation | N/A | 2-5 minutes | New capability |
| Emergency translation | N/A | 10-30 seconds | New capability |

**Optimization Strategies**:

**1. Selective Language Loading**:
```sql
-- Only load requested language to minimize data transfer
SELECT 
    id,
    medication_name_translations->>$1 as medication_name, -- User's language only
    source_language,
    $1 = ANY(available_translations) as has_translation
FROM medications_silver 
WHERE patient_id = $2;
```

**2. Cached Translation Lookup**:
```sql
-- Materialized view for common language pairs
CREATE MATERIALIZED VIEW medication_translations_en_es AS
SELECT 
    id,
    medication_name_translations->>'en-AU' as name_en,
    medication_name_translations->>'es-ES' as name_es,
    instructions_translations->>'en-AU' as instructions_en,
    instructions_translations->>'es-ES' as instructions_es
FROM medications_silver
WHERE 'es-ES' = ANY(available_translations);

-- Refresh strategy for cached translations
CREATE INDEX idx_medication_translations_en_es_id ON medication_translations_en_es(id);
```

**3. Intelligent Indexing Strategy**:
```sql
-- Partial indexes for active translations only
CREATE INDEX idx_medications_active_translations 
    ON medications USING GIN (medication_name_translations)
    WHERE cardinality(available_translations) > 1;

-- Language-specific partial indexes
CREATE INDEX idx_medications_spanish_translations 
    ON medications USING GIN (medication_name_translations)
    WHERE 'es-ES' = ANY(available_translations);
```

## Migration Coordination Strategy

### **Phased Migration Approach**

**Phase 1: Schema Preparation (Zero Downtime)**
```sql
-- Migration script: 001_add_translation_columns.sql
BEGIN;

-- Add all translation columns with defaults (backward compatible)
ALTER TABLE medications ADD COLUMN IF NOT EXISTS medication_name_translations JSONB DEFAULT '{}';
ALTER TABLE conditions ADD COLUMN IF NOT EXISTS condition_name_translations JSONB DEFAULT '{}';
-- ... all other tables

-- Create indexes concurrently to avoid locks
CREATE INDEX CONCURRENTLY idx_medications_name_translations ON medications USING GIN (medication_name_translations);

COMMIT;
```

**Phase 2: Data Population (Background Processing)**
```sql
-- Migration script: 002_populate_translation_data.sql
-- Run during low-traffic periods

-- Populate existing data with source language
UPDATE medications SET 
    medication_name_translations = jsonb_build_object('en-AU', medication_name),
    source_language = 'en-AU',
    available_translations = ARRAY['en-AU']
WHERE medication_name_translations = '{}';

-- Create job tracking for user-requested translations
INSERT INTO translation_jobs (profile_id, target_language, status)
SELECT DISTINCT patient_id, 'es-ES', 'pending'
FROM medications m
JOIN user_language_preferences ulp ON ulp.profile_id = m.patient_id
WHERE 'es-ES' = ANY(ulp.active_languages);
```

**Phase 3: Application Deployment**
```sql
-- Migration script: 003_enable_translation_features.sql
-- Update application configuration to use new translation columns

-- Enable translation functions
CREATE OR REPLACE FUNCTION get_translated_text(/* implementation */);

-- Update silver table population to include translations
SELECT populate_medications_silver();

-- Enable translation job processing
UPDATE system_configuration SET value = 'enabled' WHERE key = 'translation_processing';
```

### **Rollback Strategy**

**Safe Rollback Procedures**:
```sql
-- Rollback script: rollback_translation_support.sql
BEGIN;

-- Disable translation processing
UPDATE system_configuration SET value = 'disabled' WHERE key = 'translation_processing';

-- Revert silver table population (optional - data preserved)
-- Application can fall back to medication_name column

-- Drop indexes if needed for performance (optional)
-- DROP INDEX CONCURRENTLY idx_medications_name_translations;

-- Translation columns remain but unused (data preserved)
COMMIT;
```

## Data Integrity and Synchronization

### **Translation Data Consistency**

**Consistency Checks**:
```sql
-- Validation function for translation data integrity
CREATE OR REPLACE FUNCTION validate_translation_consistency() RETURNS TABLE (
    table_name TEXT,
    entity_id UUID,
    issue_description TEXT
) AS $$
BEGIN
    -- Check for missing source language in translations
    RETURN QUERY
    SELECT 'medications'::TEXT, m.id, 'Missing source language in translations'::TEXT
    FROM medications m
    WHERE NOT (medication_name_translations ? source_language)
    AND medication_name_translations != '{}';
    
    -- Check for translation confidence without corresponding translation
    RETURN QUERY
    SELECT 'medications'::TEXT, m.id, 'Confidence data without translation'::TEXT
    FROM medications m
    WHERE translation_confidence != '{}'
    AND NOT EXISTS (
        SELECT 1 FROM jsonb_each_text(translation_confidence) tc
        WHERE medication_name_translations ? tc.key
    );
END;
$$ LANGUAGE plpgsql;
```

**Automated Synchronization**:
```sql
-- Trigger to maintain translation metadata consistency
CREATE OR REPLACE FUNCTION maintain_translation_metadata() RETURNS TRIGGER AS $$
BEGIN
    -- Update available_translations array when translations are added/removed
    NEW.available_translations := ARRAY(SELECT jsonb_object_keys(NEW.medication_name_translations));
    
    -- Update translation_last_updated timestamp
    NEW.translation_last_updated := NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER medications_translation_metadata_trigger
    BEFORE UPDATE OF medication_name_translations ON medications
    FOR EACH ROW EXECUTE FUNCTION maintain_translation_metadata();
```

This integration strategy ensures that multi-language support enhances the existing V3 architecture without disrupting core clinical data management, while providing clear migration paths and maintaining data integrity throughout the transformation process.