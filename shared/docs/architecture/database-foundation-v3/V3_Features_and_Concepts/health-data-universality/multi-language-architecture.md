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
    -- NOTE: No expires_at - translations are immutable audit records

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
    -- NOTE: No expires_at - translations are immutable audit records

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
    -- NOTE: No expires_at - translations are immutable audit records

    UNIQUE(allergy_id, target_language, complexity_level)
);

-- RLS Policies for Translation Tables (Healthcare Security Critical)
-- Enable RLS on all translation tables
ALTER TABLE medication_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE condition_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE allergy_translations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access translations for their own clinical data
CREATE POLICY medication_translations_patient_isolation ON medication_translations
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM patient_medications pm
        WHERE pm.id = medication_translations.medication_id
        AND pm.patient_id = get_current_profile_id()
    )
);

CREATE POLICY condition_translations_patient_isolation ON condition_translations
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM patient_conditions pc
        WHERE pc.id = condition_translations.condition_id
        AND pc.patient_id = get_current_profile_id()
    )
);

CREATE POLICY allergy_translations_patient_isolation ON allergy_translations
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM patient_allergies pa
        WHERE pa.id = allergy_translations.allergy_id
        AND pa.patient_id = get_current_profile_id()
    )
);

-- Indexes to support RLS policy performance
CREATE INDEX idx_medication_translations_patient_lookup ON medication_translations(medication_id);
CREATE INDEX idx_condition_translations_patient_lookup ON condition_translations(condition_id);
CREATE INDEX idx_allergy_translations_patient_lookup ON allergy_translations(allergy_id);
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

-- RLS Policies for Display Tables (Healthcare Security Critical)
-- Enable RLS on all display tables
ALTER TABLE medications_display ENABLE ROW LEVEL SECURITY;
ALTER TABLE conditions_display ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access display records for their own patient_id
CREATE POLICY medications_display_patient_isolation ON medications_display
FOR ALL USING (patient_id = get_current_profile_id());

CREATE POLICY conditions_display_patient_isolation ON conditions_display
FOR ALL USING (patient_id = get_current_profile_id());

-- Indexes to support RLS policy performance (already have patient_id in covering indexes)
-- Note: patient_id already indexed via PARTITION BY HASH and dashboard indexes

-- Concrete Partition Child Tables (16 partitions for optimal distribution)
-- Create child partitions for medications_display
CREATE TABLE medications_display_p0 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE medications_display_p1 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 1);
CREATE TABLE medications_display_p2 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 2);
CREATE TABLE medications_display_p3 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 3);
CREATE TABLE medications_display_p4 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 4);
CREATE TABLE medications_display_p5 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 5);
CREATE TABLE medications_display_p6 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 6);
CREATE TABLE medications_display_p7 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 7);
CREATE TABLE medications_display_p8 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 8);
CREATE TABLE medications_display_p9 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 9);
CREATE TABLE medications_display_p10 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 10);
CREATE TABLE medications_display_p11 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 11);
CREATE TABLE medications_display_p12 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 12);
CREATE TABLE medications_display_p13 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 13);
CREATE TABLE medications_display_p14 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 14);
CREATE TABLE medications_display_p15 PARTITION OF medications_display FOR VALUES WITH (MODULUS 16, REMAINDER 15);

-- Create child partitions for conditions_display
CREATE TABLE conditions_display_p0 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE conditions_display_p1 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 1);
CREATE TABLE conditions_display_p2 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 2);
CREATE TABLE conditions_display_p3 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 3);
CREATE TABLE conditions_display_p4 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 4);
CREATE TABLE conditions_display_p5 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 5);
CREATE TABLE conditions_display_p6 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 6);
CREATE TABLE conditions_display_p7 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 7);
CREATE TABLE conditions_display_p8 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 8);
CREATE TABLE conditions_display_p9 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 9);
CREATE TABLE conditions_display_p10 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 10);
CREATE TABLE conditions_display_p11 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 11);
CREATE TABLE conditions_display_p12 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 12);
CREATE TABLE conditions_display_p13 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 13);
CREATE TABLE conditions_display_p14 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 14);
CREATE TABLE conditions_display_p15 PARTITION OF conditions_display FOR VALUES WITH (MODULUS 16, REMAINDER 15);

-- Autovacuum settings for display table partitions (aggressive for cache tables)
ALTER TABLE medications_display SET (autovacuum_vacuum_scale_factor = 0.05); -- Vacuum at 5% change
ALTER TABLE medications_display SET (autovacuum_analyze_scale_factor = 0.05); -- Analyze at 5% change
ALTER TABLE conditions_display SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE conditions_display SET (autovacuum_analyze_scale_factor = 0.05);

-- Vacuum settings for translation tables (less aggressive - immutable data)
ALTER TABLE medication_translations SET (autovacuum_vacuum_scale_factor = 0.2); -- Vacuum at 20% change
ALTER TABLE condition_translations SET (autovacuum_vacuum_scale_factor = 0.2);
ALTER TABLE allergy_translations SET (autovacuum_vacuum_scale_factor = 0.2);
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
-- NOTE: No expiry index on translation tables - translations are immutable audit records

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
-- SIDE-EFFECT-FREE function to get display text from display tables with fallback
-- NOTE: No write operations in read functions - queue management handled by API layer
CREATE OR REPLACE FUNCTION get_medication_display_text(
    p_medication_id UUID,
    p_language VARCHAR(10),
    p_complexity VARCHAR(20),
    p_field VARCHAR(50) DEFAULT 'name'
) RETURNS JSONB AS $$
DECLARE
    display_text TEXT;
    fallback_text TEXT;
    cache_miss BOOLEAN := FALSE;
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
        cache_miss := TRUE;
        IF p_field = 'name' THEN
            SELECT medication_name INTO fallback_text
            FROM patient_medications WHERE id = p_medication_id;
        ELSIF p_field = 'instructions' THEN
            SELECT instructions INTO fallback_text
            FROM patient_medications WHERE id = p_medication_id;
        END IF;

        -- Return fallback with cache miss indicator for API layer handling
        RETURN jsonb_build_object(
            'text', fallback_text,
            'cache_miss', TRUE,
            'needs_translation', TRUE,
            'language', p_language,
            'complexity', p_complexity
        );
    END IF;

    -- Return cached result
    RETURN jsonb_build_object(
        'text', display_text,
        'cache_miss', FALSE,
        'needs_translation', FALSE
    );
END;
$$ LANGUAGE plpgsql;
```

#### **API Layer Queue Management**
```typescript
// API route handles queue management - NO side effects in DB functions
async function getMedicationDisplayText(
  medicationId: string,
  language: string,
  complexity: string
): Promise<MedicationDisplayResult> {

  // Call side-effect-free DB function
  const result = await supabase.rpc('get_medication_display_text', {
    p_medication_id: medicationId,
    p_language: language,
    p_complexity: complexity,
    p_field: 'name'
  });

  // Handle cache miss at API layer
  if (result.cache_miss) {
    // Enqueue translation job asynchronously
    await supabase.from('translation_sync_queue').insert({
      entity_id: medicationId,
      entity_type: 'medication',
      operation: 'populate_display',
      priority: 5,
      payload: {
        language: language,
        complexity: complexity,
        field: 'name'
      }
    });

    // Return fallback immediately
    return {
      text: result.text,
      isFallback: true,
      translationQueued: true
    };
  }

  // Return cached result
  return {
    text: result.text,
    isFallback: false,
    translationQueued: false
  };
}
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

### **Phase 2: Populate Display Tables with Active-User Prioritization**

**Intelligent Migration Strategy**: Prioritize active users for immediate display table population while gradually migrating the long tail to minimize cost and resource usage.

#### **Active User Identification and Prioritization**
```sql
-- User activity scoring for migration prioritization
CREATE TEMPORARY TABLE migration_user_priority AS
WITH user_activity_scores AS (
    SELECT
        up.id as profile_id,
        -- Activity scoring factors
        CASE
            WHEN up.last_login_at > NOW() - INTERVAL '7 days' THEN 100
            WHEN up.last_login_at > NOW() - INTERVAL '30 days' THEN 75
            WHEN up.last_login_at > NOW() - INTERVAL '90 days' THEN 50
            WHEN up.last_login_at > NOW() - INTERVAL '180 days' THEN 25
            ELSE 10
        END as recency_score,

        -- Document upload activity
        COALESCE((
            SELECT COUNT(*) FROM documents d
            WHERE d.patient_id = up.id
            AND d.created_at > NOW() - INTERVAL '30 days'
        ), 0) * 10 as upload_activity_score,

        -- Clinical data richness
        COALESCE((
            SELECT COUNT(*) FROM patient_medications pm WHERE pm.patient_id = up.id
        ), 0) +
        COALESCE((
            SELECT COUNT(*) FROM patient_conditions pc WHERE pc.patient_id = up.id
        ), 0) as clinical_data_score,

        -- User type priority
        CASE
            WHEN EXISTS(SELECT 1 FROM medical_reviewer_permissions mrp WHERE mrp.reviewer_id = up.id) THEN 20
            WHEN up.subscription_type = 'premium' THEN 15
            ELSE 5
        END as user_type_score

    FROM user_profiles up
)
SELECT
    profile_id,
    recency_score + upload_activity_score + clinical_data_score + user_type_score as priority_score,
    -- Migration priority tiers
    CASE
        WHEN recency_score + upload_activity_score + clinical_data_score + user_type_score >= 150 THEN 'tier_1_immediate'
        WHEN recency_score + upload_activity_score + clinical_data_score + user_type_score >= 100 THEN 'tier_2_high'
        WHEN recency_score + upload_activity_score + clinical_data_score + user_type_score >= 50 THEN 'tier_3_medium'
        ELSE 'tier_4_long_tail'
    END as migration_tier
FROM user_activity_scores
ORDER BY priority_score DESC;

-- Create indexes for efficient migration processing
CREATE INDEX idx_migration_priority ON migration_user_priority(migration_tier, priority_score DESC);
```

#### **Phased Migration with Cost Control**
```sql
-- Migration progress tracking
CREATE TABLE translation_migration_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    migration_phase VARCHAR(50) NOT NULL, -- 'tier_1_immediate', 'tier_2_high', etc.
    total_users INTEGER NOT NULL,
    completed_users INTEGER DEFAULT 0,
    total_entities INTEGER NOT NULL,
    completed_entities INTEGER DEFAULT 0,
    estimated_cost_usd NUMERIC(10,2),
    actual_cost_usd NUMERIC(10,2) DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE
);

-- Phase 1: Immediate Priority Users (Tier 1)
-- Target: Active users with recent logins and rich clinical data
INSERT INTO translation_migration_progress (migration_phase, total_users, total_entities, estimated_cost_usd)
SELECT
    'tier_1_immediate',
    COUNT(DISTINCT mup.profile_id),
    COUNT(*) as total_entities,
    COUNT(*) * 0.20 as estimated_cost -- $0.20 per entity for high-priority processing
FROM migration_user_priority mup
JOIN patient_medications pm ON pm.patient_id = mup.profile_id
WHERE mup.migration_tier = 'tier_1_immediate';

-- Populate display tables for Tier 1 users immediately
WITH tier_1_medications AS (
    SELECT DISTINCT pm.id, pm.patient_id, pm.medication_name, pm.instructions,
           encode(sha256(concat(pm.medication_name, COALESCE(pm.instructions, ''))), 'hex') as content_hash
    FROM patient_medications pm
    JOIN migration_user_priority mup ON mup.profile_id = pm.patient_id
    WHERE mup.migration_tier = 'tier_1_immediate'
)
INSERT INTO medications_display (
    medication_id, patient_id, language_code, complexity_level,
    display_name, display_instructions, content_hash, access_count, last_accessed_at
)
SELECT
    tm.id, tm.patient_id, 'en-AU', 'simplified',
    tm.medication_name, tm.instructions, tm.content_hash, 5, NOW() -- Pre-heat access count
FROM tier_1_medications tm;

-- Queue background translation jobs for non-English languages for Tier 1 users
INSERT INTO translation_sync_queue (
    entity_id, entity_type, target_language, complexity_level, priority, profile_id, payload
)
SELECT
    pm.id, 'medication', ulp.primary_language, ulp.medical_complexity_preference, 1, -- High priority
    pm.patient_id,
    jsonb_build_object(
        'source_text', pm.medication_name,
        'instructions', pm.instructions,
        'tier', 'tier_1_immediate'
    )
FROM patient_medications pm
JOIN migration_user_priority mup ON mup.profile_id = pm.patient_id
JOIN user_language_preferences ulp ON ulp.profile_id = pm.patient_id
WHERE mup.migration_tier = 'tier_1_immediate'
AND ulp.primary_language != 'en-AU';
```

#### **Gradual Long-Tail Migration**
```sql
-- Phase 2-4: Gradual migration with cost controls and backoff
CREATE OR REPLACE FUNCTION migrate_next_user_tier(
    p_tier VARCHAR(50),
    p_batch_size INTEGER DEFAULT 50,
    p_cost_limit_usd NUMERIC DEFAULT 100.00
) RETURNS JSONB AS $$
DECLARE
    migration_batch RECORD;
    current_cost NUMERIC;
    entities_processed INTEGER := 0;
    users_processed INTEGER := 0;
BEGIN
    -- Check current migration cost for the day
    SELECT COALESCE(SUM(actual_cost_usd), 0) INTO current_cost
    FROM translation_migration_progress
    WHERE started_at >= CURRENT_DATE;

    -- Stop if we've hit cost limit
    IF current_cost >= p_cost_limit_usd THEN
        RETURN jsonb_build_object(
            'status', 'cost_limit_reached',
            'current_cost', current_cost,
            'limit', p_cost_limit_usd
        );
    END IF;

    -- Process next batch of users in specified tier
    FOR migration_batch IN
        SELECT DISTINCT mup.profile_id, mup.priority_score
        FROM migration_user_priority mup
        LEFT JOIN medications_display md ON md.patient_id = mup.profile_id
        WHERE mup.migration_tier = p_tier
        AND md.patient_id IS NULL -- Not yet migrated
        ORDER BY mup.priority_score DESC
        LIMIT p_batch_size
    LOOP
        -- Create display records for this user
        INSERT INTO medications_display (
            medication_id, patient_id, language_code, complexity_level,
            display_name, display_instructions, content_hash
        )
        SELECT
            pm.id, pm.patient_id, 'en-AU', 'simplified',
            pm.medication_name, pm.instructions,
            encode(sha256(concat(pm.medication_name, COALESCE(pm.instructions, ''))), 'hex')
        FROM patient_medications pm
        WHERE pm.patient_id = migration_batch.profile_id;

        GET DIAGNOSTICS entities_processed = ROW_COUNT;
        users_processed := users_processed + 1;

        -- Add to background translation queue with lower priority
        INSERT INTO translation_sync_queue (
            entity_id, entity_type, target_language, complexity_level, priority, profile_id
        )
        SELECT
            pm.id, 'medication', 'en-AU', 'simplified', 7, -- Lower priority
            pm.patient_id
        FROM patient_medications pm
        WHERE pm.patient_id = migration_batch.profile_id;
    END LOOP;

    -- Update migration progress
    UPDATE translation_migration_progress
    SET completed_users = completed_users + users_processed,
        completed_entities = completed_entities + entities_processed,
        actual_cost_usd = actual_cost_usd + (entities_processed * 0.10) -- Lower cost for batch processing
    WHERE migration_phase = p_tier AND is_active = TRUE;

    RETURN jsonb_build_object(
        'status', 'success',
        'tier', p_tier,
        'users_processed', users_processed,
        'entities_processed', entities_processed,
        'current_cost', current_cost + (entities_processed * 0.10)
    );
END;
$$ LANGUAGE plpgsql;

-- Scheduled migration execution (run via cron job)
-- Priority: Tier 1 (immediate), then Tier 2 (high), then Tier 3 (medium), then Tier 4 (long tail)
SELECT migrate_next_user_tier('tier_2_high', 25, 50.00); -- Smaller batches, lower cost limits
SELECT migrate_next_user_tier('tier_3_medium', 15, 25.00);
SELECT migrate_next_user_tier('tier_4_long_tail', 10, 10.00);
```

#### **Migration Monitoring and Alerting**
```sql
-- Migration health check function
CREATE OR REPLACE FUNCTION check_migration_health() RETURNS JSONB AS $$
DECLARE
    tier_status JSONB;
    total_progress NUMERIC;
    estimated_completion TIMESTAMPTZ;
BEGIN
    SELECT jsonb_object_agg(
        migration_phase,
        jsonb_build_object(
            'completion_percentage', ROUND((completed_users::NUMERIC / total_users * 100), 2),
            'cost_efficiency', ROUND((actual_cost_usd / NULLIF(estimated_cost_usd, 0) * 100), 2),
            'entities_per_hour', ROUND((completed_entities::NUMERIC / EXTRACT(epoch FROM (NOW() - started_at)) * 3600), 2),
            'status', CASE WHEN completed_at IS NOT NULL THEN 'completed' ELSE 'in_progress' END
        )
    ) INTO tier_status
    FROM translation_migration_progress
    WHERE is_active = TRUE;

    -- Calculate overall progress
    SELECT
        ROUND((SUM(completed_users)::NUMERIC / SUM(total_users) * 100), 2) INTO total_progress
    FROM translation_migration_progress
    WHERE is_active = TRUE;

    -- Estimate completion based on current rate
    SELECT
        NOW() + (
            (SUM(total_users - completed_users)::NUMERIC /
             NULLIF(SUM(completed_users)::NUMERIC / EXTRACT(epoch FROM (NOW() - MIN(started_at))) * 3600, 0))
            * INTERVAL '1 hour'
        ) INTO estimated_completion
    FROM translation_migration_progress
    WHERE is_active = TRUE AND completed_at IS NULL;

    RETURN jsonb_build_object(
        'total_progress_percentage', total_progress,
        'estimated_completion', estimated_completion,
        'tier_status', tier_status,
        'last_updated', NOW()
    );
END;
$$ LANGUAGE plpgsql;
```

This migration strategy ensures that active users receive immediate benefits while controlling costs and resources for the long tail of inactive users.

### **Rollback Plan and Feature Flag Integration**

**Emergency Rollback Strategy**: Complete rollback capability using feature flags and read-only mode to ensure system stability if issues arise during deployment.

#### **Feature Flag Control System**
```sql
-- Feature flag management for gradual rollout
CREATE TABLE translation_feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_name VARCHAR(100) NOT NULL UNIQUE,
    is_enabled BOOLEAN DEFAULT FALSE,
    rollout_percentage INTEGER DEFAULT 0, -- 0-100% rollout
    user_segments TEXT[], -- ['premium', 'beta_testers', 'healthcare_providers']
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES user_profiles(id)
);

-- Insert feature flags for controlled rollout
INSERT INTO translation_feature_flags (flag_name, description, is_enabled, rollout_percentage) VALUES
('enable_three_layer_architecture', 'Enable three-layer translation architecture for all users', FALSE, 0),
('enable_display_table_queries', 'Use display tables for dashboard queries instead of direct backend queries', FALSE, 0),
('enable_translation_sync_queue', 'Enable background translation job processing', FALSE, 0),
('enable_human_review_queue', 'Enable human review workflow for low-confidence translations', FALSE, 0),
('enable_phi_safe_analytics', 'Enable PHI-safe session recording and analytics', FALSE, 0);

-- Function to check if feature is enabled for user
CREATE OR REPLACE FUNCTION is_feature_enabled_for_user(
    p_flag_name VARCHAR(100),
    p_profile_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    flag_record RECORD;
    user_segment VARCHAR(50);
    random_seed INTEGER;
BEGIN
    -- Get feature flag configuration
    SELECT * INTO flag_record
    FROM translation_feature_flags
    WHERE flag_name = p_flag_name;

    -- Feature doesn't exist or is disabled globally
    IF NOT FOUND OR NOT flag_record.is_enabled THEN
        RETURN FALSE;
    END IF;

    -- Check if user is in target segments
    SELECT CASE
        WHEN EXISTS(SELECT 1 FROM medical_reviewer_permissions WHERE reviewer_id = p_profile_id) THEN 'healthcare_provider'
        WHEN EXISTS(SELECT 1 FROM user_profiles WHERE id = p_profile_id AND subscription_type = 'premium') THEN 'premium'
        WHEN EXISTS(SELECT 1 FROM user_profiles WHERE id = p_profile_id AND is_beta_tester = TRUE) THEN 'beta_tester'
        ELSE 'standard'
    END INTO user_segment;

    -- Check if user segment is in rollout
    IF flag_record.user_segments IS NOT NULL AND
       NOT (user_segment = ANY(flag_record.user_segments)) THEN
        RETURN FALSE;
    END IF;

    -- Check percentage rollout using deterministic hash
    SELECT ABS(hashtext(p_profile_id::TEXT || p_flag_name)) % 100 INTO random_seed;

    RETURN random_seed < flag_record.rollout_percentage;
END;
$$ LANGUAGE plpgsql;
```

#### **Read-Only Fallback Mode**
```sql
-- Emergency read-only mode for rollback scenarios
CREATE TABLE system_emergency_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_name VARCHAR(100) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    reason TEXT,
    activated_by UUID REFERENCES user_profiles(id),
    activated_at TIMESTAMPTZ,
    deactivated_at TIMESTAMPTZ
);

-- Insert emergency rollback settings
INSERT INTO system_emergency_settings (setting_name, setting_value, reason) VALUES
('translation_read_only_mode', '{"enabled": false, "fallback_to_backend": true, "disable_new_translations": true}', 'Emergency fallback to backend tables only'),
('disable_display_tables', '{"enabled": false, "force_translation_tables": true}', 'Force queries to use translation tables instead of display cache'),
('disable_ai_translations', '{"enabled": false, "human_review_only": true}', 'Disable AI translation processing, require human review for all');

-- Emergency activation function
CREATE OR REPLACE FUNCTION activate_emergency_rollback(
    p_setting_name VARCHAR(100),
    p_reason TEXT,
    p_activated_by UUID
) RETURNS VOID AS $$
BEGIN
    UPDATE system_emergency_settings
    SET is_active = TRUE,
        reason = p_reason,
        activated_by = p_activated_by,
        activated_at = NOW(),
        deactivated_at = NULL
    WHERE setting_name = p_setting_name;

    -- Log emergency activation
    INSERT INTO audit_events (event_type, profile_id, details)
    VALUES ('emergency_rollback_activated', p_activated_by,
            jsonb_build_object('setting', p_setting_name, 'reason', p_reason));
END;
$$ LANGUAGE plpgsql;

-- Modified query functions with rollback support
CREATE OR REPLACE FUNCTION get_medication_display_with_rollback(
    p_medication_id UUID,
    p_language VARCHAR(10),
    p_complexity VARCHAR(20),
    p_profile_id UUID
) RETURNS JSONB AS $$
DECLARE
    result JSONB;
    use_display_tables BOOLEAN;
    emergency_mode BOOLEAN;
BEGIN
    -- Check feature flags and emergency settings
    SELECT is_feature_enabled_for_user('enable_display_table_queries', p_profile_id) INTO use_display_tables;
    SELECT is_active FROM system_emergency_settings WHERE setting_name = 'translation_read_only_mode' INTO emergency_mode;

    -- Emergency rollback: use backend tables only
    IF emergency_mode THEN
        SELECT jsonb_build_object(
            'text', medication_name,
            'source', 'backend_table_emergency_mode',
            'confidence_score', 1.0
        ) INTO result
        FROM patient_medications
        WHERE id = p_medication_id;

        RETURN result;
    END IF;

    -- Normal operation with feature flag control
    IF use_display_tables THEN
        -- Try display table first
        SELECT jsonb_build_object(
            'text', display_name,
            'source', 'display_table',
            'confidence_score', confidence_score
        ) INTO result
        FROM medications_display
        WHERE medication_id = p_medication_id
        AND language_code = p_language
        AND complexity_level = p_complexity;

        IF result IS NOT NULL THEN
            RETURN result;
        END IF;
    END IF;

    -- Fallback to translation table
    SELECT jsonb_build_object(
        'text', translated_name,
        'source', 'translation_table',
        'confidence_score', confidence_score
    ) INTO result
    FROM medication_translations
    WHERE medication_id = p_medication_id
    AND target_language = p_language
    AND complexity_level = p_complexity;

    IF result IS NOT NULL THEN
        RETURN result;
    END IF;

    -- Final fallback to backend table
    SELECT jsonb_build_object(
        'text', medication_name,
        'source', 'backend_table_fallback',
        'confidence_score', 1.0
    ) INTO result
    FROM patient_medications
    WHERE id = p_medication_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql;
```

#### **Rollback Procedures**
```sql
-- Complete rollback procedure
CREATE OR REPLACE FUNCTION execute_full_system_rollback(
    p_reason TEXT,
    p_executed_by UUID
) RETURNS JSONB AS $$
DECLARE
    rollback_steps JSONB := '[]'::JSONB;
    step_result JSONB;
BEGIN
    -- Step 1: Activate emergency read-only mode
    PERFORM activate_emergency_rollback('translation_read_only_mode', p_reason, p_executed_by);
    rollback_steps := rollback_steps || jsonb_build_object('step', 'emergency_mode_activated', 'status', 'completed');

    -- Step 2: Disable all feature flags
    UPDATE translation_feature_flags
    SET is_enabled = FALSE, rollout_percentage = 0, updated_at = NOW(), updated_by = p_executed_by
    WHERE is_enabled = TRUE;
    rollback_steps := rollback_steps || jsonb_build_object('step', 'feature_flags_disabled', 'status', 'completed');

    -- Step 3: Pause translation queue processing
    UPDATE translation_sync_queue
    SET status = 'paused', error_message = 'System rollback in progress'
    WHERE status IN ('pending', 'failed');
    rollback_steps := rollback_steps || jsonb_build_object('step', 'queue_paused', 'status', 'completed');

    -- Step 4: Set display tables to read-only (prevent new inserts/updates)
    -- Note: This would typically be done at application level
    rollback_steps := rollback_steps || jsonb_build_object('step', 'display_tables_readonly', 'status', 'manual_action_required');

    -- Step 5: Alert monitoring systems
    INSERT INTO system_alerts (alert_type, severity, message, created_at)
    VALUES ('system_rollback', 'critical',
            format('Full system rollback executed. Reason: %s. Executed by: %s', p_reason, p_executed_by),
            NOW());
    rollback_steps := rollback_steps || jsonb_build_object('step', 'monitoring_alerted', 'status', 'completed');

    RETURN jsonb_build_object(
        'rollback_status', 'completed',
        'executed_at', NOW(),
        'executed_by', p_executed_by,
        'reason', p_reason,
        'steps', rollback_steps
    );
END;
$$ LANGUAGE plpgsql;

-- Gradual recovery procedure
CREATE OR REPLACE FUNCTION execute_gradual_recovery(
    p_recovery_phase VARCHAR(50), -- 'enable_display_tables', 'enable_translations', 'full_recovery'
    p_executed_by UUID
) RETURNS JSONB AS $$
DECLARE
    recovery_result JSONB;
BEGIN
    CASE p_recovery_phase
        WHEN 'enable_display_tables' THEN
            UPDATE translation_feature_flags
            SET is_enabled = TRUE, rollout_percentage = 10 -- Start with 10% rollout
            WHERE flag_name = 'enable_display_table_queries';

            recovery_result := jsonb_build_object('phase', 'display_tables', 'rollout_percentage', 10);

        WHEN 'enable_translations' THEN
            UPDATE translation_feature_flags
            SET is_enabled = TRUE, rollout_percentage = 25
            WHERE flag_name = 'enable_translation_sync_queue';

            -- Resume paused translation jobs for high-priority users only
            UPDATE translation_sync_queue
            SET status = 'pending'
            WHERE status = 'paused' AND priority <= 3;

            recovery_result := jsonb_build_object('phase', 'translations', 'rollout_percentage', 25);

        WHEN 'full_recovery' THEN
            -- Enable all features at 100% rollout
            UPDATE translation_feature_flags
            SET is_enabled = TRUE, rollout_percentage = 100, updated_by = p_executed_by
            WHERE flag_name IN ('enable_three_layer_architecture', 'enable_display_table_queries', 'enable_translation_sync_queue');

            -- Deactivate emergency settings
            UPDATE system_emergency_settings
            SET is_active = FALSE, deactivated_at = NOW()
            WHERE is_active = TRUE;

            -- Resume all translation jobs
            UPDATE translation_sync_queue
            SET status = 'pending'
            WHERE status = 'paused';

            recovery_result := jsonb_build_object('phase', 'full_recovery', 'all_systems_enabled', TRUE);
    END CASE;

    INSERT INTO audit_events (event_type, profile_id, details)
    VALUES ('system_recovery_executed', p_executed_by, recovery_result);

    RETURN recovery_result;
END;
$$ LANGUAGE plpgsql;
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

-- Enhanced sync queue for production reliability
CREATE TABLE translation_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- 'medication', 'condition', 'allergy'
    operation VARCHAR(20) NOT NULL, -- 'translate', 'update_display', 'expire'
    target_language VARCHAR(10) NOT NULL,
    complexity_level VARCHAR(20) NOT NULL,
    priority INTEGER DEFAULT 5, -- 1=high, 5=normal, 9=low
    payload JSONB,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'dead_letter'
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ, -- Exponential backoff scheduling
    error_message TEXT,
    error_code VARCHAR(50),
    processing_node VARCHAR(100), -- Worker node identifier
    profile_id UUID, -- For rate limiting per user
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    dead_letter_at TIMESTAMPTZ, -- When moved to dead letter status

    -- Deduplication constraint
    UNIQUE(entity_type, entity_id, target_language, complexity_level, operation),

    -- Foreign key constraints for data integrity
    CONSTRAINT fk_profile_id FOREIGN KEY (profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE
);

-- Enhanced indexes for queue processing
CREATE INDEX idx_translation_queue_pending ON translation_sync_queue(status, priority, next_retry_at)
    WHERE status IN ('pending', 'failed');
CREATE INDEX idx_translation_queue_processing ON translation_sync_queue(status, processing_node, started_at)
    WHERE status = 'processing';
CREATE INDEX idx_translation_queue_rate_limit ON translation_sync_queue(profile_id, created_at)
    WHERE status IN ('pending', 'processing');
CREATE INDEX idx_translation_queue_dead_letter ON translation_sync_queue(dead_letter_at)
    WHERE status = 'dead_letter';

-- Dead letter table for failed jobs requiring manual intervention
CREATE TABLE translation_dead_letter (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_queue_id UUID NOT NULL,
    entity_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    operation VARCHAR(20) NOT NULL,
    target_language VARCHAR(10) NOT NULL,
    complexity_level VARCHAR(20) NOT NULL,
    payload JSONB,
    final_error_message TEXT NOT NULL,
    final_error_code VARCHAR(50),
    total_attempts INTEGER NOT NULL,
    profile_id UUID,
    first_attempt_at TIMESTAMPTZ NOT NULL,
    final_failure_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    requires_human_review BOOLEAN DEFAULT TRUE,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,

    CONSTRAINT fk_profile_id FOREIGN KEY (profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE
);

-- Retry/backoff calculation function
CREATE OR REPLACE FUNCTION calculate_next_retry(attempt_count INTEGER) RETURNS TIMESTAMPTZ AS $$
BEGIN
    -- Exponential backoff: 30s, 2m, 8m, then dead letter
    CASE attempt_count
        WHEN 1 THEN RETURN NOW() + INTERVAL '30 seconds';
        WHEN 2 THEN RETURN NOW() + INTERVAL '2 minutes';
        WHEN 3 THEN RETURN NOW() + INTERVAL '8 minutes';
        ELSE RETURN NULL; -- Dead letter
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Queue worker rate limiting (per-tenant budget controls)
CREATE TABLE translation_rate_limits (
    profile_id UUID PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
    daily_translation_budget INTEGER DEFAULT 100, -- AI calls per day
    hourly_translation_budget INTEGER DEFAULT 20,  -- AI calls per hour
    current_daily_usage INTEGER DEFAULT 0,
    current_hourly_usage INTEGER DEFAULT 0,
    last_daily_reset DATE DEFAULT CURRENT_DATE,
    last_hourly_reset TIMESTAMPTZ DEFAULT date_trunc('hour', NOW()),
    is_premium_user BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

## Healthcare Privacy and Analytics Safeguards

### **PHI-Safe Session Recording and Analytics**

**Critical Requirement**: All session recording, user analytics, and "viewed" metrics must be PHI-safe and properly redacted to maintain healthcare compliance.

#### **PHI-Safe Analytics Implementation**
```sql
-- Analytics table with PHI redaction
CREATE TABLE translation_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id), -- User reference only
    session_id VARCHAR(64) NOT NULL, -- Hashed session identifier
    language_code VARCHAR(10) NOT NULL,
    complexity_level VARCHAR(20) NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- 'medication', 'condition', 'allergy'
    -- PHI-SAFE: No actual medical data stored
    action_type VARCHAR(30) NOT NULL, -- 'view', 'translate', 'cache_hit', 'cache_miss'
    response_time_ms INTEGER,
    confidence_score NUMERIC(5,4),
    translation_method VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- RLS Policy: Users can only see their own analytics
    CONSTRAINT translation_analytics_rls CHECK (profile_id = get_current_profile_id())
);

-- Enable RLS for analytics table
ALTER TABLE translation_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY translation_analytics_isolation ON translation_analytics
FOR ALL USING (profile_id = get_current_profile_id());
```

#### **Session Recording Safeguards**
```typescript
// PHI-safe session recording implementation
interface PHISafeSessionEvent {
  sessionId: string;          // Hashed session identifier
  profileId: string;          // User reference only
  eventType: 'language_switch' | 'complexity_toggle' | 'translation_request';
  language: string;           // Safe: language preference
  complexity: string;         // Safe: complexity preference
  entityType: string;         // Safe: 'medication', 'condition', etc.
  entityCount: number;        // Safe: count of entities, not content
  responseTime: number;       // Safe: performance metric
  timestamp: number;          // Safe: timing data
  // CRITICAL: No actual medical content, names, or PHI
}

// Redaction enforcement
function recordSessionEvent(event: Partial<PHISafeSessionEvent>) {
  // Validate no PHI in event data
  if (containsPHI(event)) {
    throw new Error('PHI detected in session event - recording blocked');
  }

  // Hash sensitive identifiers
  const safeEvent: PHISafeSessionEvent = {
    ...event,
    sessionId: hashSessionId(event.sessionId),
    entityId: undefined, // Remove any entity IDs
    content: undefined,  // Remove any medical content
  };

  return recordAnalyticsEvent(safeEvent);
}
```

#### **View Analytics with Privacy Protection**
```sql
-- PHI-safe view tracking (aggregate only)
CREATE TABLE translation_usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    language_code VARCHAR(10) NOT NULL,
    complexity_level VARCHAR(20) NOT NULL,
    date_bucket DATE NOT NULL, -- Daily aggregation
    -- AGGREGATE METRICS ONLY - No individual record tracking
    total_views INTEGER DEFAULT 0,
    total_translations INTEGER DEFAULT 0,
    cache_hit_rate NUMERIC(5,4),
    avg_response_time_ms INTEGER,
    total_entities_viewed INTEGER, -- Count only, no content
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(profile_id, language_code, complexity_level, date_bucket)
);

-- RLS for usage stats
ALTER TABLE translation_usage_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_stats_isolation ON translation_usage_stats
FOR ALL USING (profile_id = get_current_profile_id());
```

#### **Compliance Documentation Requirements**
- **No Medical Content Logging**: Analytics must never store actual medication names, conditions, or medical instructions
- **Hashed Identifiers**: All session and entity identifiers must be cryptographically hashed
- **Aggregate Metrics Only**: Individual view events aggregated into daily/weekly summaries
- **RLS Enforcement**: All analytics tables must enforce row-level security by profile_id
- **Audit Trail**: Maintain logs of what analytics data was accessed and by whom
- **Data Retention**: Analytics data subject to healthcare retention policies (7 years in Australia)
- **User Consent**: Users must explicitly consent to anonymized analytics collection

This architecture provides a robust, scalable foundation for multi-language support while maintaining integration with existing V3 systems and ensuring clinical data safety across language barriers.