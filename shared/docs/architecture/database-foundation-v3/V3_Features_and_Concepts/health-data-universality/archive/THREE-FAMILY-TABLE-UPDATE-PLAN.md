# Three-Layer Table Architecture Update Plan

**Status**: COMPLETED - All Documentation Updated
**Created**: 16 September 2025
**Last Updated**: 17 September 2025
**Implementation Status**: ✅ ALL 10 FILES UPDATED (100% Complete)

## Executive Summary

✅ **DOCUMENTATION UPDATE COMPLETED**: All health-data-universality documentation has been successfully updated to implement a refined three-layer table architecture using **existing backend tables** as the source of truth, with per-domain translation tables and display tables for UI performance:

1. **Backend Tables**: Existing tables (patient_medications, patient_conditions, etc.) - NO CHANGES
2. **Translation Tables**: Per-domain normalized translations (medication_translations, condition_translations, etc.)
3. **Display Tables**: Per-domain lazily-populated cache for UI performance

**All 10 files in the health-data-universality folder have been updated according to this specification and are now consistent with the three-layer architecture approach.**

## Architecture Overview

### **Three-Layer Data Model (Using Existing Schema)**

```
┌─────────────────┐
│  Backend Tables │ ← EXISTING: patient_medications, patient_conditions, etc.
│   (UNCHANGED)   │   (Source of truth from AI pipeline)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│Translation Tables│ ← NEW: Per-domain (medication_translations, etc.)
│  (Per-Domain)   │   (Normalized translations with confidence/audit)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Display Tables  │ ← NEW: Per-domain lazy cache (medications_display, etc.)
│  (Per-Domain)   │   (UI-optimized for language/complexity toggling)
└─────────────────┘
```

### **Key Architecture Decisions**

1. **Use Existing Backend Tables**: No changes to patient_medications, patient_conditions, etc.
2. **Per-Domain Translation Tables**: medication_translations, condition_translations (not one giant table)
3. **Per-Domain Display Tables**: medications_display, conditions_display for UI performance
4. **NO JSONB**: All translations in dedicated normalized tables
5. **Lazy Population**: Display tables populated only when language/complexity requested
6. **Content Fingerprinting**: Hash-based staleness detection for efficient sync
7. **TTL/LRU Expiry**: Automatic cleanup of unused display records

## Files Updates Completed ✅

### **Priority 1: Core Architecture Files (Heavy Rewrites)** ✅ COMPLETED

#### **1. multi-language-architecture.md** ✅ COMPLETED
**Previous State**: JSONB-based storage approach
**Updates Applied**:
- Remove all JSONB schema definitions
- Add three-layer table architecture using existing backend tables:
  - Backend tables: EXISTING patient_medications, patient_conditions, patient_allergies, patient_vitals, patient_immunizations
  - Translation tables: NEW per-domain medication_translations, condition_translations, allergy_translations, etc.
  - Display tables: NEW per-domain medications_display, conditions_display, allergies_display, etc.
- Add content fingerprinting for staleness detection
- Add lazy population workflow for display tables
- Add TTL/expiry mechanisms for unused translations
- Update all query examples to reference existing table names
- Add per-domain indexing strategy

**Key Sections to Rewrite**:
- Database Schema Architecture
- Migration Strategy
- Performance Optimization
- Foreign Language File Upload Handling

#### **2. database-integration.md** ✅ COMPLETED
**Previous State**: Assumes single table with JSONB
**Updates Applied**:
- Complete rewrite of integration approach
- Add backend→translation→display data flow
- Update supersession logic to handle three layers
- Add sync queue architecture
- Add staleness detection mechanisms
- Update Silver table concept (backend tables = silver)
- Add rebuild/recovery procedures for display layer

**Key Sections to Rewrite**:
- Integration with Temporal Data Management
- Silver Tables Enhancement
- Migration Coordination Strategy
- Data Integrity and Synchronization

### **Priority 2: Implementation Files (Moderate Updates)** ✅ COMPLETED

#### **3. medical-literacy-levels.md** ✅ COMPLETED
**Previous State**: JSONB complexity storage
**Updates Applied**:
- Update schema to use translation tables with complexity_level column
- Add display table structure for complexity variants
- Update query functions to use display tables
- Add lazy population for complexity levels
- Keep conceptual framework intact

**Key Sections to Update**:
- Database Schema Architecture
- Complexity-Aware Query Functions
- Integration with Clinical Entity Display

#### **4. supported-languages-management.md** ✅ COMPLETED
**Previous State**: References JSONB for availability
**Updates Applied**:
- Update language availability detection to query translation tables
- Add display table population triggers
- Update fallback strategies to check display cache first
- Add language expiry/cleanup policies

**Key Sections to Update**:
- Dynamic Language Availability Management
- Language Quality Scoring
- Fallback Strategies

#### **5. translation-quality-assurance.md** ✅ COMPLETED
**Previous State**: Confidence in JSONB
**Updates Applied**:
- Move all confidence scoring to translation tables
- Add audit fields to translation tables
- Update quality monitoring to track display cache hit rates
- Add staleness monitoring

**Key Sections to Update**:
- Automated Confidence Scoring System
- Translation Quality Categories
- Quality Improvement Analytics

### **Priority 3: User-Facing Files (Light Updates)** ✅ COMPLETED

#### **6. user-experience-flows.md** ✅ COMPLETED
**Previous State**: Some JSONB references in SQL
**Updates Applied**:
- Update all queries to use display tables
- Keep emergency translation flow unchanged
- Add "updating..." states for eventual consistency
- Add manual refresh options

**Key Sections to Update**:
- Dashboard Language Switching
- Healthcare Provider Patient View
- Shared Profile Generation

#### **7. README.md** ✅ COMPLETED
**Previous State**: References JSONB approach
**Updates Applied**:
- Update architecture overview to three-layer model
- Update benefits section
- Add consistency model explanation

### **Priority 4: Architecture-Independent Files** ✅ COMPLETED

#### **8. feature-flag-integration.md** ✅ COMPLETED
**Previous State**: Feature flags independent of storage architecture
**Updates Applied**: Added three-layer architecture integration references for consistency

#### **9. business-model-integration.md** ✅ COMPLETED
**Previous State**: Business model independent of technical implementation
**Updates Applied**: Added three-layer architecture cost/scaling benefits to strengthen value proposition

## Detailed Implementation Specifications

### **Backend Tables (EXISTING - No Changes Required)**
```sql
-- Use existing tables as source of truth from AI pipeline
patient_medications (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES user_profiles(id),
    medication_name TEXT NOT NULL, -- Source language from document
    instructions TEXT,
    -- ... existing fields from 03_clinical_core.sql
    -- ADD: source_language VARCHAR(10) DEFAULT 'en-AU'
    -- ADD: content_hash VARCHAR(64) -- For staleness detection
);

patient_conditions (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES user_profiles(id),
    condition_name TEXT NOT NULL, -- Source language from document
    -- ... existing fields from 03_clinical_core.sql
    -- ADD: source_language VARCHAR(10) DEFAULT 'en-AU'
    -- ADD: content_hash VARCHAR(64)
);

-- Similar for patient_allergies, patient_vitals, patient_immunizations
```

### **Translation Tables (Per-Domain)**
```sql
-- Per-domain translation tables for better performance
CREATE TABLE medication_translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_id UUID NOT NULL REFERENCES patient_medications(id) ON DELETE CASCADE,
    source_language VARCHAR(10) NOT NULL,
    target_language VARCHAR(10) NOT NULL,
    complexity_level VARCHAR(20) NOT NULL, -- 'medical_jargon', 'simplified'
    translated_name TEXT NOT NULL,
    translated_instructions TEXT,
    confidence_score NUMERIC(5,4) NOT NULL,
    translation_method VARCHAR(30) NOT NULL,
    ai_model_used VARCHAR(100),
    content_hash VARCHAR(64), -- Hash of source for staleness detection
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

-- Per-domain optimized indexes
CREATE INDEX idx_medication_translations_lookup ON medication_translations(medication_id, target_language, complexity_level);
CREATE INDEX idx_condition_translations_lookup ON condition_translations(condition_id, target_language, complexity_level);
CREATE INDEX idx_allergy_translations_lookup ON allergy_translations(allergy_id, target_language, complexity_level);
```

### **Display Tables (Per-Domain)**
```sql
-- Per-domain lazily-populated UI cache
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
) PARTITION BY HASH (patient_id); -- Partition for scale

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

-- Per-domain covering indexes for dashboard queries
CREATE INDEX idx_medications_display_dashboard ON medications_display(patient_id, language_code, complexity_level) INCLUDE (display_name, display_instructions);
CREATE INDEX idx_conditions_display_dashboard ON conditions_display(patient_id, language_code, complexity_level) INCLUDE (display_name, display_description);
```

### **Sync Queue Architecture**
```sql
-- Queue for propagating changes through layers
CREATE TABLE translation_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    operation VARCHAR(20) NOT NULL, -- 'translate', 'update_display', 'expire'
    priority INTEGER DEFAULT 5,
    payload JSONB,
    status VARCHAR(20) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);
```

### **Staleness Detection**
```sql
-- Function to detect stale display records
CREATE OR REPLACE FUNCTION is_display_stale(
    p_display_hash VARCHAR(64),
    p_source_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    current_source_hash VARCHAR(64);
BEGIN
    SELECT content_hash INTO current_source_hash
    FROM medications_source
    WHERE id = p_source_id;
    
    RETURN p_display_hash != current_source_hash;
END;
$$ LANGUAGE plpgsql;
```

## Implementation Guardrails

### **Storage Control**
- Lazy generation on first request only
- Maximum 3 languages per free user, 5 for premium
- TTL: 90 days for unused translations
- LRU cleanup when storage exceeds thresholds

### **Sync Model**
- Content hash comparison for change detection
- Idempotent queue processors
- Priority queuing for active languages
- Batch updates during low-traffic periods

### **Clinical Safety**
- Never translate: medical codes, units, dates, dosages
- Protected terms glossary enforcement
- Confidence thresholds: <0.7 requires review
- Human review queue for critical fields

### **Performance Targets**
- Display table query: <5ms p95
- Cache hit rate: >95% for active users
- Translation job completion: <2min for profile
- Staleness detection: <100ms

## Migration Strategy

### **Phase 1: Add New Tables (Zero Downtime)**
1. Add per-domain translation tables (medication_translations, condition_translations, etc.)
2. Add per-domain display tables with partitioning (medications_display, conditions_display, etc.)
3. Add sync queue table for background processing
4. Add minimal columns to existing backend tables (source_language, content_hash)

### **Phase 2: Populate New Tables**
1. Identify source language for existing data in patient_medications, patient_conditions, etc.
2. Populate content_hash for existing records
3. Create initial display records for active users in their primary language
4. Set up background job processors for translation sync

### **Phase 3: Update Application Queries**
1. Update frontend queries to use display tables instead of backend tables directly
2. Implement lazy population logic for new language/complexity requests
3. Add language toggle functionality using display table filters
4. Enable TTL/LRU cleanup background jobs

### **Phase 4: Optimization and Cleanup**
1. Monitor display table hit rates and optimize caching
2. Fine-tune TTL and LRU parameters based on usage
3. Add additional per-domain tables as needed (vitals_display, immunizations_display)
4. Optimize indexes based on actual query patterns

## Success Metrics

- **Performance**: Dashboard load <100ms p95
- **Storage**: Display tables <2x source table size
- **Freshness**: Display updates within 30s of source change
- **Reliability**: 99.9% display cache availability
- **Cost**: Translation costs <$0.50 per user per month

## Risk Mitigation

### **Risk: Display Table Explosion**
**Mitigation**: Per-domain partitioning, aggressive TTL, LRU expiry based on access patterns

### **Risk: Sync Lag Between Backend and Display Tables**
**Mitigation**: Content hashing for change detection, priority queues for active languages, eventual consistency UX

### **Risk: Translation Quality**
**Mitigation**: Per-domain confidence thresholds, glossary enforcement, clear AI disclaimers

### **Risk: Frontend Migration Complexity**
**Mitigation**: Gradual migration using existing table names, display tables as additive layer

### **Risk: Backend Table Modification**
**Mitigation**: Minimal changes (only add source_language, content_hash), existing schema preserved

## Implementation Status Summary

✅ **ALL DOCUMENTATION UPDATES COMPLETED (10/10 Files)**

1. ✅ **Plan Review and Approval**: This comprehensive plan has been executed
2. ✅ **multi-language-architecture.md**: Updated with per-domain tables and existing schema references
3. ✅ **database-integration.md**: Updated for seamless integration with existing V3 architecture
4. ✅ **Remaining Files**: All files updated according to priority order
5. ✅ **Consistency Validation**: All documentation now consistent with three-layer architecture
6. 🎯 **Next Phase**: Ready for implementation tickets for engineering team

**DOCUMENTATION PHASE: COMPLETE**
**READY FOR**: Engineering implementation of three-layer architecture

## Key Benefits of This Approach

✅ **Zero Backend Disruption**: Existing patient_medications, patient_conditions tables unchanged  
✅ **Per-Domain Performance**: medication_translations, condition_translations optimized per clinical domain  
✅ **Frontend Compatibility**: Gradual migration to display tables without breaking existing queries  
✅ **GPT-5 Compliance**: Per-domain tables instead of giant generic table  
✅ **Production Ready**: Incorporates all guardrails (confidence thresholds, TTL, content hashing)  

This plan leverages the existing V3 clinical architecture while adding the translation and display layers needed for health data universality, with minimal risk and maximum performance.