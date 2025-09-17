# Database Integration with Existing V3 Architecture

**Status**: Planning Phase  
**Created**: 16 September 2025  
**Last Updated**: 16 September 2025

## Overview

This document defines how the multi-language and medical literacy systems integrate with the existing V3 database architecture using the three-layer approach: existing backend tables (unchanged), per-domain translation tables, and per-domain display tables. The integration maintains backward compatibility while enabling new translation capabilities through minimal schema changes and strategic per-domain table additions.

## Integration with Temporal Data Management

### **Deduplication Framework Integration**

**Enhanced Supersession Logic with Translation Awareness**:
The deduplication framework operates on medical codes (language-agnostic) but now preserves translation data through supersession chains using the three-layer architecture.

**Database Schema Modifications for Supersession**:
```sql
-- Extend supersession_history to track translation preservation
ALTER TABLE supersession_history ADD COLUMN IF NOT EXISTS translation_preserved_count INTEGER DEFAULT 0;
ALTER TABLE supersession_history ADD COLUMN IF NOT EXISTS source_languages TEXT[] DEFAULT ARRAY[];
ALTER TABLE supersession_history ADD COLUMN IF NOT EXISTS display_cache_updated BOOLEAN DEFAULT FALSE;

-- Enhanced supersession function to preserve per-domain translations
CREATE OR REPLACE FUNCTION apply_supersession_with_translations(
    superseding_entity_id UUID,
    superseded_entity_id UUID,
    supersession_type supersession_type_enum,
    preserve_translation_data BOOLEAN DEFAULT TRUE
) RETURNS supersession_result AS $$
DECLARE
    result supersession_result;
    entity_type TEXT;
    translation_count INTEGER;
BEGIN
    -- Determine entity type for per-domain handling
    SELECT CASE 
        WHEN EXISTS (SELECT 1 FROM patient_medications WHERE id = superseded_entity_id) THEN 'medication'
        WHEN EXISTS (SELECT 1 FROM patient_conditions WHERE id = superseded_entity_id) THEN 'condition'
        WHEN EXISTS (SELECT 1 FROM patient_allergies WHERE id = superseded_entity_id) THEN 'allergy'
    END INTO entity_type;
    
    -- Preserve per-domain translation data
    IF preserve_translation_data AND entity_type IS NOT NULL THEN
        -- Update translation table references
        IF entity_type = 'medication' THEN
            UPDATE medication_translations 
            SET medication_id = superseding_entity_id 
            WHERE medication_id = superseded_entity_id;
            
            UPDATE medications_display 
            SET medication_id = superseding_entity_id 
            WHERE medication_id = superseded_entity_id;
            
        ELSIF entity_type = 'condition' THEN
            UPDATE condition_translations 
            SET condition_id = superseding_entity_id 
            WHERE condition_id = superseded_entity_id;
            
            UPDATE conditions_display 
            SET condition_id = superseding_entity_id 
            WHERE condition_id = superseded_entity_id;
            
        ELSIF entity_type = 'allergy' THEN
            UPDATE allergy_translations 
            SET allergy_id = superseding_entity_id 
            WHERE allergy_id = superseded_entity_id;
        END IF;
        
        GET DIAGNOSTICS translation_count = ROW_COUNT;
    END IF;
    
    -- Continue with standard supersession logic
    -- ... existing supersession implementation
    
    -- Record translation preservation in history
    UPDATE supersession_history 
    SET translation_preserved_count = translation_count,
        display_cache_updated = TRUE
    WHERE superseding_entity_id = superseding_entity_id;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;
```

**Clinical Identity Policies Integration**:
Language metadata enhances identity validation without changing core identity logic using per-domain translation confidence:

```sql
-- Enhanced identity validation with per-domain translation confidence
CREATE OR REPLACE FUNCTION validate_clinical_identity_with_translations(
    entity_id UUID,
    entity_type TEXT,
    proposed_identity_key VARCHAR(255)
) RETURNS identity_validation_result AS $$
DECLARE
    validation_result identity_validation_result;
    translation_confidence NUMERIC;
    source_language TEXT;
BEGIN
    -- Perform standard identity validation
    validation_result := validate_clinical_identity(entity_id, proposed_identity_key);
    
    -- Get source language from backend table
    CASE entity_type
        WHEN 'medication' THEN
            SELECT source_language INTO source_language FROM patient_medications WHERE id = entity_id;
        WHEN 'condition' THEN
            SELECT source_language INTO source_language FROM patient_conditions WHERE id = entity_id;
        WHEN 'allergy' THEN
            SELECT source_language INTO source_language FROM patient_allergies WHERE id = entity_id;
    END CASE;
    
    -- Enhance with per-domain translation confidence scoring
    IF source_language IS NOT NULL AND source_language != 'en-AU' THEN
        -- Get average confidence from per-domain translation table
        CASE entity_type
            WHEN 'medication' THEN
                SELECT AVG(confidence_score) INTO translation_confidence
                FROM medication_translations WHERE medication_id = entity_id;
            WHEN 'condition' THEN
                SELECT AVG(confidence_score) INTO translation_confidence
                FROM condition_translations WHERE condition_id = entity_id;
            WHEN 'allergy' THEN
                SELECT AVG(confidence_score) INTO translation_confidence
                FROM allergy_translations WHERE allergy_id = entity_id;
        END CASE;
        
        -- Lower confidence for translated source data
        validation_result.confidence_score := validation_result.confidence_score * COALESCE(translation_confidence, 0.5);
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

**Backend Tables as Silver Source of Truth**:
Existing backend tables (patient_medications, patient_conditions, etc.) serve as the silver tables with minimal enhancements. Translation data lives in separate per-domain tables:

```sql
-- Backend tables enhanced with minimal translation metadata
-- These remain the source of truth (silver tables)
ALTER TABLE patient_medications 
ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU',
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

ALTER TABLE patient_conditions 
ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU',
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

ALTER TABLE patient_allergies 
ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU',
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- Function to validate silver table data integrity with translation layers
CREATE OR REPLACE FUNCTION validate_silver_translation_integrity() RETURNS TABLE (
    table_name TEXT,
    entity_id UUID,
    issue_description TEXT
) AS $$
BEGIN
    -- Check for medications with translations but no content hash
    RETURN QUERY
    SELECT 'patient_medications'::TEXT, pm.id, 'Missing content hash with translations'::TEXT
    FROM patient_medications pm
    WHERE pm.content_hash IS NULL
    AND EXISTS (SELECT 1 FROM medication_translations mt WHERE mt.medication_id = pm.id);
    
    -- Check for orphaned translation records
    RETURN QUERY
    SELECT 'medication_translations'::TEXT, mt.medication_id, 'Translation without source record'::TEXT
    FROM medication_translations mt
    WHERE NOT EXISTS (SELECT 1 FROM patient_medications pm WHERE pm.id = mt.medication_id);
    
    -- Check for stale display cache
    RETURN QUERY
    SELECT 'medications_display'::TEXT, md.medication_id, 'Stale display cache detected'::TEXT
    FROM medications_display md
    JOIN patient_medications pm ON pm.id = md.medication_id
    WHERE md.content_hash != pm.content_hash;
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

### **Query Performance with Per-Domain Tables**

**Baseline Performance Comparison**:
| Operation | Before (Backend Only) | After (Three-Layer) | Impact |
|-----------|----------------------|--------------------|---------| 
| Single medication lookup | 2ms | <5ms (display table) | <3x (excellent) |
| Dashboard load (20 medications) | 15ms | <25ms (display cache) | <2x (acceptable) |
| Full profile translation | N/A | 2-5 minutes background | New capability |
| Emergency translation | N/A | 10-30 seconds frontend | New capability |
| Translation lookup | N/A | <5ms (per-domain index) | Fast per-domain access |

**Optimization Strategies**:

**1. Display Table First Strategy**:
```sql
-- Primary query: Fast display table lookup
SELECT 
    md.display_name as medication_name,
    md.display_instructions,
    md.confidence_score,
    md.last_synced_at
FROM medications_display md
WHERE md.patient_id = $1 
AND md.language_code = $2 
AND md.complexity_level = $3;

-- Fallback: Backend table with translation layer
SELECT 
    pm.medication_name,
    pm.instructions,
    mt.translated_name,
    mt.confidence_score
FROM patient_medications pm
LEFT JOIN medication_translations mt ON (
    mt.medication_id = pm.id 
    AND mt.target_language = $2 
    AND mt.complexity_level = $3
)
WHERE pm.patient_id = $1;
```

**2. Per-Domain Partitioned Display Tables**:
```sql
-- Partitioned display tables for scale
CREATE TABLE medications_display_p0 PARTITION OF medications_display
    FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE medications_display_p1 PARTITION OF medications_display
    FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE medications_display_p2 PARTITION OF medications_display
    FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE medications_display_p3 PARTITION OF medications_display
    FOR VALUES WITH (MODULUS 4, REMAINDER 3);

-- Covering indexes per partition for dashboard queries
CREATE INDEX idx_medications_display_p0_covering 
    ON medications_display_p0(patient_id, language_code, complexity_level) 
    INCLUDE (display_name, display_instructions, confidence_score);
```

**3. Per-Domain Translation Indexing Strategy**:
```sql
-- Per-domain translation lookup indexes
CREATE INDEX idx_medication_translations_fast_lookup 
    ON medication_translations(medication_id, target_language, complexity_level) 
    INCLUDE (translated_name, translated_instructions, confidence_score);

CREATE INDEX idx_condition_translations_fast_lookup 
    ON condition_translations(condition_id, target_language, complexity_level) 
    INCLUDE (translated_name, translated_description, confidence_score);

-- Language-specific indexes for batch operations
CREATE INDEX idx_medication_translations_spanish 
    ON medication_translations(target_language, confidence_score DESC) 
    WHERE target_language = 'es-ES';

-- TTL cleanup indexes
CREATE INDEX idx_medication_translations_expiry 
    ON medication_translations(expires_at) 
    WHERE expires_at IS NOT NULL;
```

## Migration Coordination Strategy

### **Phased Migration Approach**

**Phase 1: Schema Preparation (Zero Downtime)**
```sql
-- Migration script: 001_add_per_domain_tables.sql
BEGIN;

-- Add minimal translation support to existing backend tables
ALTER TABLE patient_medications 
ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU',
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

ALTER TABLE patient_conditions 
ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU',
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- Create per-domain translation tables
CREATE TABLE medication_translations (/* full schema from TWO-FAMILY-TABLE-UPDATE-PLAN.md */);
CREATE TABLE condition_translations (/* full schema from TWO-FAMILY-TABLE-UPDATE-PLAN.md */);
CREATE TABLE allergy_translations (/* full schema from TWO-FAMILY-TABLE-UPDATE-PLAN.md */);

-- Create per-domain display tables with partitioning
CREATE TABLE medications_display (/* full schema */) PARTITION BY HASH (patient_id);
CREATE TABLE conditions_display (/* full schema */) PARTITION BY HASH (patient_id);

-- Create sync queue for background processing
CREATE TABLE translation_sync_queue (/* full schema from multi-language-architecture.md */);

-- Create indexes concurrently to avoid locks
CREATE INDEX CONCURRENTLY idx_medication_translations_lookup 
    ON medication_translations(medication_id, target_language, complexity_level);
CREATE INDEX CONCURRENTLY idx_medications_display_dashboard 
    ON medications_display(patient_id, language_code, complexity_level);

COMMIT;
```

**Phase 2: Data Population (Background Processing)**
```sql
-- Migration script: 002_populate_backend_metadata.sql
-- Run during low-traffic periods

-- Populate content hashes for existing backend data
UPDATE patient_medications SET 
    content_hash = encode(sha256(concat(medication_name, COALESCE(instructions, ''))), 'hex'),
    source_language = 'en-AU'
WHERE content_hash IS NULL;

UPDATE patient_conditions SET 
    content_hash = encode(sha256(concat(condition_name, COALESCE(description, ''))), 'hex'),
    source_language = 'en-AU'
WHERE content_hash IS NULL;

-- Create initial display records for active users in primary language
INSERT INTO medications_display (medication_id, patient_id, language_code, complexity_level, display_name, display_instructions, content_hash)
SELECT 
    pm.id,
    pm.patient_id,
    'en-AU',
    'simplified',
    pm.medication_name,
    pm.instructions,
    pm.content_hash
FROM patient_medications pm
JOIN user_profiles up ON up.id = pm.patient_id
WHERE up.created_at > NOW() - INTERVAL '90 days' -- Active users only
AND NOT EXISTS (SELECT 1 FROM medications_display md WHERE md.medication_id = pm.id);

-- Create translation jobs for users with additional languages
INSERT INTO translation_sync_queue (entity_id, entity_type, operation, payload)
SELECT 
    pm.id,
    'medication',
    'translate',
    jsonb_build_object('target_language', lang, 'complexity_level', 'simplified')
FROM patient_medications pm
JOIN user_language_preferences ulp ON ulp.profile_id = pm.patient_id,
UNNEST(ulp.active_languages) AS lang
WHERE lang != 'en-AU';
```

**Phase 3: Application Deployment**
```sql
-- Migration script: 003_enable_three_layer_architecture.sql
-- Update application to use three-layer architecture

-- Enable per-domain translation functions
CREATE OR REPLACE FUNCTION get_medication_display_text(/* implementation from multi-language-architecture.md */);
CREATE OR REPLACE FUNCTION get_condition_display_text(/* similar implementation */);

-- Enable background sync queue processing
CREATE OR REPLACE FUNCTION process_translation_sync_queue() RETURNS VOID AS $$
BEGIN
    -- Process pending translation jobs
    -- Update display tables from translation tables
    -- Handle staleness detection
END;
$$ LANGUAGE plpgsql;

-- Enable translation job processing
UPDATE system_configuration SET value = 'enabled' WHERE key = 'per_domain_translation_processing';
```

### **Rollback Strategy**

**Safe Rollback Procedures**:
```sql
-- Rollback script: rollback_per_domain_translation_support.sql
BEGIN;

-- Disable per-domain translation processing
UPDATE system_configuration SET value = 'disabled' WHERE key = 'per_domain_translation_processing';

-- Application falls back to backend tables only
-- Display and translation tables remain but unused (data preserved)

-- Stop background sync queue processing
UPDATE translation_sync_queue SET status = 'paused' WHERE status = 'pending';

-- Drop performance indexes if needed (optional)
-- DROP INDEX CONCURRENTLY idx_medication_translations_lookup;
-- DROP INDEX CONCURRENTLY idx_medications_display_dashboard;

-- Per-domain tables remain but unused - zero data loss
COMMIT;
```

## Data Integrity and Synchronization

### **Translation Data Consistency**

**Consistency Checks**:
```sql
-- Validation function for per-domain translation data integrity
CREATE OR REPLACE FUNCTION validate_per_domain_translation_consistency() RETURNS TABLE (
    table_name TEXT,
    entity_id UUID,
    issue_description TEXT
) AS $$
BEGIN
    -- Check for orphaned translation records
    RETURN QUERY
    SELECT 'medication_translations'::TEXT, mt.medication_id, 'Translation without backend record'::TEXT
    FROM medication_translations mt
    WHERE NOT EXISTS (SELECT 1 FROM patient_medications pm WHERE pm.id = mt.medication_id);
    
    -- Check for stale display cache (content_hash mismatch)
    RETURN QUERY
    SELECT 'medications_display'::TEXT, md.medication_id, 'Stale display cache detected'::TEXT
    FROM medications_display md
    JOIN patient_medications pm ON pm.id = md.medication_id
    WHERE md.content_hash != pm.content_hash;
    
    -- Check for translation records without display cache
    RETURN QUERY
    SELECT 'medication_translations'::TEXT, mt.medication_id, 'Translation missing display cache'::TEXT
    FROM medication_translations mt
    WHERE NOT EXISTS (
        SELECT 1 FROM medications_display md 
        WHERE md.medication_id = mt.medication_id 
        AND md.language_code = mt.target_language 
        AND md.complexity_level = mt.complexity_level
    );
END;
$$ LANGUAGE plpgsql;
```

**Automated Synchronization**:
```sql
-- Trigger to maintain three-layer consistency on backend changes
CREATE OR REPLACE FUNCTION sync_translation_layers() RETURNS TRIGGER AS $$
BEGIN
    -- Update content hash when backend data changes
    IF OLD.medication_name != NEW.medication_name OR OLD.instructions != NEW.instructions THEN
        NEW.content_hash := encode(sha256(concat(NEW.medication_name, COALESCE(NEW.instructions, ''))), 'hex');
        
        -- Mark display cache as stale
        UPDATE medications_display 
        SET content_hash = NEW.content_hash || '_stale'
        WHERE medication_id = NEW.id;
        
        -- Queue re-translation job
        INSERT INTO translation_sync_queue (entity_id, entity_type, operation, priority)
        VALUES (NEW.id, 'medication', 'retranslate', 1);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patient_medications_sync_trigger
    BEFORE UPDATE ON patient_medications
    FOR EACH ROW EXECUTE FUNCTION sync_translation_layers();

-- Similar triggers for patient_conditions, patient_allergies
```

This integration strategy ensures that multi-language support enhances the existing V3 architecture through the three-layer approach (backend + translation + display) without disrupting core clinical data management, while providing clear migration paths and maintaining data integrity throughout the transformation process. The per-domain table architecture optimizes performance and preserves the existing backend tables as the authoritative source of truth.