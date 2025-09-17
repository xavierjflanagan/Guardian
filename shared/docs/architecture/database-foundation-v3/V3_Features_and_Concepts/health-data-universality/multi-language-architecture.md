# Multi-Language Architecture

**Status**: Planning Phase  
**Created**: 16 September 2025  
**Last Updated**: 16 September 2025

## Overview

This document defines the database architecture and implementation strategy for supporting multiple languages across all clinical data in Exora. The system uses a three-layer architecture: existing backend tables as source of truth, per-domain translation tables for normalized translations, and per-domain display tables for UI performance, while maintaining integration with existing temporal data management and medical code resolution systems.

## Database Schema Architecture

### **Three-Layer Architecture Strategy**

**Per-Domain Table Approach**: We use the existing clinical tables (`patient_medications`, `patient_conditions`, etc.) as the backend source of truth, add per-domain translation tables for normalized translations, and per-domain display tables for UI performance. This approach provides optimal performance, clear separation of concerns, and leverages the existing V3 clinical architecture.

### **Schema Architecture Layers**

#### **Layer 1: Backend Tables (Existing - Minimal Changes)**
```sql
-- Use existing V3 clinical tables as source of truth
-- Add minimal columns for translation support

ALTER TABLE patient_medications 
ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU',
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

ALTER TABLE patient_conditions 
ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU',
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

ALTER TABLE patient_allergies 
ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU',
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- Similar for patient_vitals, patient_immunizations
```

#### **Layer 2: Translation Tables (New - Per Domain)**
```sql
-- Per-domain translation tables for optimal performance
CREATE TABLE medication_translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_id UUID NOT NULL REFERENCES patient_medications(id) ON DELETE CASCADE,
    source_language VARCHAR(10) NOT NULL,
    target_language VARCHAR(10) NOT NULL,
    complexity_level VARCHAR(20) NOT NULL, -- 'medical_jargon', 'simplified'
    translated_name TEXT NOT NULL,
    translated_instructions TEXT,
    confidence_score NUMERIC(5,4) NOT NULL,
    translation_method VARCHAR(30) NOT NULL, -- 'ai_translation', 'exact_match', 'human_review'
    ai_model_used VARCHAR(100),
    content_hash VARCHAR(64), -- For staleness detection
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- For TTL cleanup
    
    UNIQUE(medication_id, target_language, complexity_level)
);

CREATE TABLE condition_translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condition_id UUID NOT NULL REFERENCES patient_conditions(id) ON DELETE CASCADE,
    source_language VARCHAR(10) NOT NULL,
    target_language VARCHAR(10) NOT NULL,
    complexity_level VARCHAR(20) NOT NULL,
    translated_name TEXT NOT NULL,
    translated_description TEXT,
    confidence_score NUMERIC(5,4) NOT NULL,
    translation_method VARCHAR(30) NOT NULL,
    ai_model_used VARCHAR(100),
    content_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    UNIQUE(condition_id, target_language, complexity_level)
);

CREATE TABLE allergy_translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    allergy_id UUID NOT NULL REFERENCES patient_allergies(id) ON DELETE CASCADE,
    source_language VARCHAR(10) NOT NULL,
    target_language VARCHAR(10) NOT NULL,
    complexity_level VARCHAR(20) NOT NULL,
    translated_allergen_name TEXT NOT NULL,
    translated_reaction_description TEXT,
    confidence_score NUMERIC(5,4) NOT NULL,
    translation_method VARCHAR(30) NOT NULL,
    ai_model_used VARCHAR(100),
    content_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    UNIQUE(allergy_id, target_language, complexity_level)
);
```

#### **Layer 3: Display Tables (New - UI Performance Cache)**
```sql
-- Per-domain display tables for sub-5ms dashboard queries
CREATE TABLE medications_display (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_id UUID NOT NULL REFERENCES patient_medications(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL, -- Denormalized for fast queries
    language_code VARCHAR(10) NOT NULL,
    complexity_level VARCHAR(20) NOT NULL,
    display_name TEXT NOT NULL,
    display_instructions TEXT,
    confidence_score NUMERIC(5,4),
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    content_hash VARCHAR(64), -- For staleness detection
    access_count INTEGER DEFAULT 1, -- For LRU expiry
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- TTL expiry
    
    UNIQUE(medication_id, language_code, complexity_level)
) PARTITION BY HASH (patient_id);

CREATE TABLE conditions_display (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condition_id UUID NOT NULL REFERENCES patient_conditions(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL,
    language_code VARCHAR(10) NOT NULL,
    complexity_level VARCHAR(20) NOT NULL,
    display_name TEXT NOT NULL,
    display_description TEXT,
    confidence_score NUMERIC(5,4),
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    content_hash VARCHAR(64),
    access_count INTEGER DEFAULT 1,
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    UNIQUE(condition_id, language_code, complexity_level)
) PARTITION BY HASH (patient_id);
```

#### **User Language Preferences**
```sql
-- User language and complexity preferences
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

### **Performance Optimization Strategy**

#### **Per-Domain Indexing for Translation Tables**
```sql
-- Optimized indexes for translation lookup
CREATE INDEX idx_medication_translations_lookup ON medication_translations(medication_id, target_language, complexity_level);
CREATE INDEX idx_medication_translations_language ON medication_translations(target_language);
CREATE INDEX idx_medication_translations_confidence ON medication_translations(confidence_score);
CREATE INDEX idx_medication_translations_expiry ON medication_translations(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX idx_condition_translations_lookup ON condition_translations(condition_id, target_language, complexity_level);
CREATE INDEX idx_condition_translations_language ON condition_translations(target_language);
CREATE INDEX idx_condition_translations_confidence ON condition_translations(confidence_score);

CREATE INDEX idx_allergy_translations_lookup ON allergy_translations(allergy_id, target_language, complexity_level);
CREATE INDEX idx_allergy_translations_language ON allergy_translations(target_language);
```

#### **Display Table Indexes for Dashboard Performance**
```sql
-- Covering indexes for dashboard queries
CREATE INDEX idx_medications_display_dashboard ON medications_display(patient_id, language_code, complexity_level) 
    INCLUDE (display_name, display_instructions, confidence_score);
    
CREATE INDEX idx_conditions_display_dashboard ON conditions_display(patient_id, language_code, complexity_level) 
    INCLUDE (display_name, display_description, confidence_score);
    
-- Indexes for cache management
CREATE INDEX idx_medications_display_access ON medications_display(last_accessed_at, access_count);
CREATE INDEX idx_medications_display_expiry ON medications_display(expires_at) WHERE expires_at IS NOT NULL;
```

#### **Query Optimization Functions**
```sql
-- Function to get display text from display tables with fallback
CREATE OR REPLACE FUNCTION get_medication_display_text(
    p_medication_id UUID,
    p_language VARCHAR(10),
    p_complexity VARCHAR(20),
    p_field VARCHAR(50) DEFAULT 'name'
) RETURNS TEXT AS $$
DECLARE
    display_text TEXT;
    fallback_text TEXT;
BEGIN
    -- Try to get from display table first
    IF p_field = 'name' THEN
        SELECT display_name INTO display_text
        FROM medications_display 
        WHERE medication_id = p_medication_id 
        AND language_code = p_language 
        AND complexity_level = p_complexity;
    ELSIF p_field = 'instructions' THEN
        SELECT display_instructions INTO display_text
        FROM medications_display 
        WHERE medication_id = p_medication_id 
        AND language_code = p_language 
        AND complexity_level = p_complexity;
    END IF;
    
    -- If not found in display table, get from source
    IF display_text IS NULL THEN
        IF p_field = 'name' THEN
            SELECT medication_name INTO fallback_text
            FROM patient_medications WHERE id = p_medication_id;
        ELSIF p_field = 'instructions' THEN
            SELECT instructions INTO fallback_text
            FROM patient_medications WHERE id = p_medication_id;
        END IF;
        
        -- Trigger background population of display table
        INSERT INTO translation_sync_queue (entity_id, entity_type, operation, payload)
        VALUES (p_medication_id, 'medication', 'populate_display', 
                jsonb_build_object('language', p_language, 'complexity', p_complexity));
        
        RETURN fallback_text;
    END IF;
    
    RETURN display_text;
END;
$$ LANGUAGE plpgsql;
```

## Migration Strategy and Implementation Mechanism

### **Phase 1: Add New Tables (Zero Downtime)**

**Migration Steps**:
1. **Add per-domain translation tables** (medication_translations, condition_translations, etc.)
2. **Add per-domain display tables** with partitioning (medications_display, conditions_display, etc.)
3. **Add sync queue table** for background processing
4. **Add minimal columns** to existing backend tables (source_language, content_hash)
5. **Add user language preferences table** with RLS policies

**Migration Script Template**:
```sql
-- migrations/add_translation_support.sql
BEGIN;

-- Step 1: Add translation tables
CREATE TABLE medication_translations (/* schema definition */);
CREATE TABLE condition_translations (/* schema definition */);
CREATE TABLE allergy_translations (/* schema definition */);

-- Step 2: Add display tables with partitioning
CREATE TABLE medications_display (/* schema definition */) PARTITION BY HASH (patient_id);
CREATE TABLE conditions_display (/* schema definition */) PARTITION BY HASH (patient_id);

-- Step 3: Add minimal columns to existing tables
ALTER TABLE patient_medications 
ADD COLUMN IF NOT EXISTS source_language VARCHAR(10) DEFAULT 'en-AU',
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- Step 4: Create indexes
CREATE INDEX idx_medication_translations_lookup ON medication_translations(medication_id, target_language, complexity_level);
CREATE INDEX idx_medications_display_dashboard ON medications_display(patient_id, language_code, complexity_level);

-- Step 5: Add sync queue and preferences
CREATE TABLE translation_sync_queue (/* schema definition */);
CREATE TABLE user_language_preferences (/* schema definition */);

COMMIT;
```

### **Phase 2: Populate Display Tables for Active Users**

**Initial Population Process**:
1. **Identify active users** and their primary languages
2. **Generate content hashes** for existing clinical data
3. **Create initial display records** for active users in their primary language
4. **Set up background processors** for translation sync queue

**Population Script**:
```sql
-- Populate content hashes for existing data
UPDATE patient_medications SET 
    content_hash = encode(sha256(concat(medication_name, COALESCE(instructions, ''))), 'hex'),
    source_language = 'en-AU'
WHERE content_hash IS NULL;

-- Create initial display records for active users
INSERT INTO medications_display (medication_id, patient_id, language_code, complexity_level, display_name, display_instructions)
SELECT 
    pm.id,
    pm.patient_id,
    'en-AU',
    'simplified',
    pm.medication_name,
    pm.instructions
FROM patient_medications pm
JOIN user_profiles up ON up.id = pm.patient_id
WHERE up.created_at > NOW() - INTERVAL '90 days'; -- Active users only
```

### **Phase 3: Update Application Queries**

**Frontend Query Migration**:
```sql
-- OLD: Direct backend table query
SELECT medication_name, instructions 
FROM patient_medications 
WHERE patient_id = $1;

-- NEW: Display table query with fallback
SELECT 
    COALESCE(md.display_name, pm.medication_name) as medication_name,
    COALESCE(md.display_instructions, pm.instructions) as instructions,
    md.confidence_score
FROM patient_medications pm
LEFT JOIN medications_display md ON (
    md.medication_id = pm.id 
    AND md.language_code = $2 
    AND md.complexity_level = $3
)
WHERE pm.patient_id = $1;
```

**Translation Job Processing**:
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

-- Sync queue for background processing
CREATE TABLE translation_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- 'medication', 'condition', 'allergy'
    operation VARCHAR(20) NOT NULL, -- 'translate', 'update_display', 'expire'
    priority INTEGER DEFAULT 5,
    payload JSONB,
    status VARCHAR(20) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);
```

## Foreign Language File Upload Handling

### **Upload Processing Workflow**

**Language Detection and Processing**:
1. **Document upload** → AI detects source language during Pass 1
2. **Source language processing** → Full AI pipeline processes in detected language
3. **Medical code assignment** → Universal codes (RxNorm) assigned regardless of language  
4. **Backend storage** → Clinical entities stored in existing tables with source language
5. **Translation layer** → Background job creates translations to user's primary language
6. **Display layer** → Display records created for immediate UI access
7. **Deduplication integration** → Temporal deduplication works on universal medical codes

**Database Integration Example**:
```sql
-- Spanish hospital discharge processed for English-primary user

-- Step 1: Store in backend table (source of truth)
INSERT INTO patient_medications (
    patient_id,
    medication_name,
    instructions,
    source_language,
    content_hash,
    rxnorm_code, -- Universal code enables deduplication
    clinical_effective_date
) VALUES (
    $1,
    'Lisinopril 10mg comprimido', -- Original Spanish
    'Tomar una vez al día',       -- Original Spanish
    'es-ES',
    encode(sha256('Lisinopril 10mg comprimido Tomar una vez al día'), 'hex'),
    '314076', -- RxNorm code for deduplication
    '2025-09-15'
);

-- Step 2: Create translation (background job)
INSERT INTO medication_translations (
    medication_id,
    source_language,
    target_language,
    complexity_level,
    translated_name,
    translated_instructions,
    confidence_score,
    translation_method,
    ai_model_used,
    content_hash
) VALUES (
    $medication_id,
    'es-ES',
    'en-AU',
    'simplified',
    'Blood pressure medicine',
    'Take once daily',
    0.92,
    'ai_translation',
    'gpt-4o-mini',
    encode(sha256('Lisinopril 10mg comprimido Tomar una vez al día'), 'hex')
);

-- Step 3: Create display record for immediate UI access
INSERT INTO medications_display (
    medication_id,
    patient_id,
    language_code,
    complexity_level,
    display_name,
    display_instructions,
    confidence_score,
    content_hash
) VALUES (
    $medication_id,
    $1,
    'en-AU',
    'simplified',
    'Blood pressure medicine',
    'Take once daily',
    0.92,
    encode(sha256('Lisinopril 10mg comprimido Tomar una vez al día'), 'hex')
);
```

## Emergency Translation Architecture

### **Frontend Real-Time Translation**

**Implementation Strategy**:
- **Session-based translation** for immediate unplanned language needs using display table fallbacks
- **Translation API integration** with OpenAI/Google Translate for emergency scenarios
- **Frontend cache management** to avoid repeated translation costs within session
- **Background sync queue trigger** to create permanent translations for future use
- **Display table population** triggers when emergency translations are used repeatedly

**Emergency Translation Flow**:
1. **User requests emergency language** (e.g., Russian for travel to Moscow)
2. **Display table lookup first** → Check for existing cached translations
3. **Frontend real-time translation** → If no display cache, translate current view using AI
4. **Session-level caching** → Store translations in browser session for immediate reuse
5. **Background job creation** → Add to sync queue for permanent translation after 2+ uses
6. **Display table population** → Background process creates permanent cache records
7. **Subscription upgrade prompt** → Convert to permanent language support after session ends

**Technical Implementation**:
```sql
-- Emergency translation session cache (frontend)
interface SessionTranslationCache {
  medicationId: string;
  language: string;
  complexity: string;
  translatedName: string;
  translatedInstructions: string;
  confidence: number;
  timestamp: number;
  useCount: number;
}

-- Background sync queue trigger
INSERT INTO translation_sync_queue (entity_id, entity_type, operation, priority, payload)
VALUES (
  $medication_id,
  'medication',
  'emergency_to_permanent',
  1, -- High priority
  jsonb_build_object(
    'language', 'ru-RU',
    'complexity', 'simplified',
    'session_translation', $session_data,
    'use_count', 3
  )
);
```

**Cost and Performance**:
- **Emergency translation**: 10-30 seconds, $0.10-0.30 per session (cached for 24h)
- **Permanent translation**: 2-5 minutes background processing, $0.50-2.00 per profile  
- **Display table lookup**: <5ms for subsequent requests
- **Automatic conversion**: Emergency translations promoted to display tables after 2+ session uses

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
- **Per-domain translation tables** included in all standard database backups
- **Display table snapshots** for cache reconstruction and performance validation
- **Translation job history preserved** for audit and recovery purposes
- **Source language metadata protected** to enable re-translation if needed
- **Confidence scores maintained** for quality assurance validation
- **Sync queue backups** for background job recovery and replay

**Recovery Procedures**:
- **Translation reconstruction** possible from source language and job history
- **Display table rebuilding** from translation tables using background sync queue
- **Incremental re-translation** for corrupted translation data with staleness detection
- **Source data always preserved** → Backend tables never overwritten during translation
- **Quality validation** during recovery to ensure translation accuracy matches confidence thresholds
- **Sync queue replay** for failed background translation jobs

This architecture provides a robust, scalable foundation for multi-language support while maintaining integration with existing V3 systems and ensuring clinical data safety across language barriers.