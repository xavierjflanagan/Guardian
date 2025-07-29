# Guardian v7 Core Database Schema

**Status:** Foundational Schema  
**Date:** 2025-07-29  
**Purpose:** Core database structure that serves as the foundation for all Guardian healthcare data operations

---

## Overview

This document defines the foundational database schema for Guardian v7. It contains the essential database structure without performance optimizations, monitoring systems, or advanced features. This schema provides the core foundation upon which all other Guardian features are built.

**Key Principles:**
- User data isolation through Row Level Security (RLS)
- Healthcare compliance with comprehensive audit trails
- Flexible relationship modeling between clinical entities
- Provenance tracking for all extracted medical facts

---

## 1. Database Foundation & Extensions

### 1.1. Required PostgreSQL Extensions

```sql
-- Core extensions required for Guardian architecture
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Fuzzy string matching for relationship normalization
CREATE EXTENSION IF NOT EXISTS "postgis";        -- Spatial data for bounding box operations
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- Enhanced cryptographic functions
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- Enhanced GIN indexing capabilities
```

---

## 2. Core Clinical Tables

### 2.1. Patient Medications

```sql
CREATE TABLE patient_medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Core medication data
    medication_name TEXT NOT NULL,
    generic_name TEXT,
    dosage TEXT,
    frequency TEXT,
    route TEXT,
    strength TEXT,
    
    -- Status and lifecycle
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued', 'completed')),
    start_date DATE,
    end_date DATE,
    prescribed_by TEXT,
    
    -- Quality control
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    review_reason TEXT,
    
    -- Normalization and original data
    raw_value TEXT,
    
    -- Audit and soft delete
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_reason TEXT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- User tracking
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ
);

-- Essential indexes
CREATE INDEX idx_patient_medications_patient ON patient_medications(patient_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_medications_status ON patient_medications(status) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_medications_review ON patient_medications(requires_review) WHERE requires_review = TRUE AND archived IS NOT TRUE;
```

### 2.2. Patient Conditions

```sql
CREATE TABLE patient_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Core condition data
    condition_name TEXT NOT NULL,
    icd_10_code TEXT,
    category TEXT,
    severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe', 'critical')),
    
    -- Status and lifecycle
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'resolved', 'chronic')),
    diagnosis_date DATE,
    resolved_date DATE,
    diagnosed_by TEXT,
    
    -- Quality control
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    review_reason TEXT,
    
    -- Normalization and original data
    raw_value TEXT,
    
    -- Audit and soft delete
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_reason TEXT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- User tracking
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ
);

-- Essential indexes
CREATE INDEX idx_patient_conditions_patient ON patient_conditions(patient_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_conditions_status ON patient_conditions(status) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_conditions_review ON patient_conditions(requires_review) WHERE requires_review = TRUE AND archived IS NOT TRUE;
```

### 2.3. Patient Allergies

```sql
CREATE TABLE patient_allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Core allergy data
    allergen TEXT NOT NULL,
    allergy_type TEXT CHECK (allergy_type IN ('drug', 'food', 'environmental', 'other')),
    reaction TEXT,
    severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe', 'life_threatening')),
    
    -- Status and lifecycle
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'resolved')),
    onset_date DATE,
    identified_by TEXT,
    
    -- Quality control
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    review_reason TEXT,
    
    -- Normalization and original data
    raw_value TEXT,
    
    -- Audit and soft delete
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_reason TEXT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- User tracking
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ
);

-- Essential indexes
CREATE INDEX idx_patient_allergies_patient ON patient_allergies(patient_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_allergies_severity ON patient_allergies(severity) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_allergies_review ON patient_allergies(requires_review) WHERE requires_review = TRUE AND archived IS NOT TRUE;
```

### 2.4. Patient Lab Results

```sql
CREATE TABLE patient_lab_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Core lab data
    test_name TEXT NOT NULL,
    test_code TEXT,
    result_value TEXT,
    result_numeric NUMERIC,
    reference_range TEXT,
    units TEXT,
    abnormal_flag TEXT CHECK (abnormal_flag IN ('normal', 'high', 'low', 'critical_high', 'critical_low')),
    
    -- Timing and context
    test_date DATE,
    collection_date DATE,
    ordered_by TEXT,
    lab_name TEXT,
    
    -- Quality control
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    review_reason TEXT,
    
    -- Normalization and original data
    raw_value TEXT,
    
    -- Audit and soft delete
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_reason TEXT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- User tracking
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ
);

-- Essential indexes
CREATE INDEX idx_patient_lab_results_patient ON patient_lab_results(patient_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_lab_results_date ON patient_lab_results(test_date) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_lab_results_abnormal ON patient_lab_results(abnormal_flag) WHERE abnormal_flag IN ('high', 'low', 'critical_high', 'critical_low') AND archived IS NOT TRUE;
CREATE INDEX idx_patient_lab_results_review ON patient_lab_results(requires_review) WHERE requires_review = TRUE AND archived IS NOT TRUE;
```

### 2.5. Patient Vitals

```sql
CREATE TABLE patient_vitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Core vital signs
    measurement_type TEXT NOT NULL CHECK (measurement_type IN ('blood_pressure', 'heart_rate', 'temperature', 'weight', 'height', 'bmi', 'oxygen_saturation')),
    value_numeric NUMERIC,
    value_text TEXT,
    units TEXT,
    
    -- Context
    measurement_date DATE,
    measurement_time TIME,
    measured_by TEXT,
    measurement_method TEXT,
    
    -- Quality control
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    review_reason TEXT,
    
    -- Normalization and original data
    raw_value TEXT,
    
    -- Audit and soft delete
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_reason TEXT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- User tracking
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ
);

-- Essential indexes
CREATE INDEX idx_patient_vitals_patient ON patient_vitals(patient_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_vitals_type ON patient_vitals(measurement_type) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_vitals_date ON patient_vitals(measurement_date) WHERE archived IS NOT TRUE;
CREATE INDEX idx_patient_vitals_review ON patient_vitals(requires_review) WHERE requires_review = TRUE AND archived IS NOT TRUE;
```

---

## 3. Enhanced Provenance Layer

### 3.1. Clinical Fact Sources

```sql
CREATE TABLE clinical_fact_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fact_table TEXT NOT NULL,
    fact_id UUID NOT NULL,
    document_id UUID NOT NULL REFERENCES documents(id),
    representation_id UUID REFERENCES document_representations(id),
    
    -- Geographic precision for click-to-zoom
    page_number INTEGER,
    bounding_box GEOMETRY(POLYGON, 4326), -- PostGIS for proper spatial indexing
    source_text TEXT, -- Original extracted text
    
    -- Extraction metadata
    extraction_method TEXT NOT NULL CHECK (extraction_method IN ('ai_vision', 'ocr', 'manual', 'api_import')),
    extraction_model_version TEXT,
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Allow multiple sources per fact (medication can appear on multiple pages/documents)
    UNIQUE(fact_table, fact_id, document_id, page_number, md5(ST_AsBinary(bounding_box)))
);

-- Essential indexes
CREATE INDEX idx_clinical_fact_sources_spatial ON clinical_fact_sources USING GIST(bounding_box);
CREATE INDEX idx_clinical_fact_sources_document ON clinical_fact_sources(document_id);
CREATE INDEX idx_clinical_fact_sources_fact ON clinical_fact_sources(fact_table, fact_id);
CREATE INDEX idx_clinical_fact_sources_method ON clinical_fact_sources(extraction_method);
```

---

## 4. Controlled Vocabularies

### 4.1. Relationship Types

```sql
CREATE TABLE relationship_types (
    type TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('treatment', 'causation', 'temporal', 'monitoring', 'safety', 'diagnostic')),
    description TEXT NOT NULL,
    valid_source_tables TEXT[] NOT NULL,
    valid_target_tables TEXT[] NOT NULL,
    is_bidirectional BOOLEAN NOT NULL DEFAULT false,
    confidence_threshold NUMERIC(3,2) DEFAULT 0.7,
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Evolution tracking
    superseded_by TEXT REFERENCES relationship_types(type),
    deprecated_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Core relationship vocabulary
INSERT INTO relationship_types (type, category, description, valid_source_tables, valid_target_tables, is_bidirectional) VALUES
('treats', 'treatment', 'Medication treats condition', '{"patient_medications"}', '{"patient_conditions"}', false),
('monitors', 'monitoring', 'Lab test monitors condition or medication', '{"patient_lab_results"}', '{"patient_conditions", "patient_medications"}', false),
('caused_by', 'causation', 'Condition caused by medication (side effect)', '{"patient_conditions"}', '{"patient_medications"}', false),
('contraindicates', 'safety', 'Allergy contraindicates medication', '{"patient_allergies"}', '{"patient_medications"}', false),
('indicates', 'diagnostic', 'Condition indicates need for lab test', '{"patient_conditions"}', '{"patient_lab_results"}', false),
('temporal_sequence', 'temporal', 'Events occurred in sequence', '{"patient_conditions", "patient_medications", "patient_lab_results"}', '{"patient_conditions", "patient_medications", "patient_lab_results"}', false),
('related_to', 'temporal', 'Generic relationship - catch-all for uncertain cases', '{"patient_medications", "patient_conditions", "patient_lab_results", "patient_allergies", "patient_vitals"}', '{"patient_medications", "patient_conditions", "patient_lab_results", "patient_allergies", "patient_vitals"}', true);
```

### 4.2. Status Types

```sql
-- Medication status types
CREATE TABLE medication_status_types (
    status TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    is_active_status BOOLEAN NOT NULL,
    display_order INTEGER NOT NULL,
    
    -- Evolution support
    superseded_by TEXT REFERENCES medication_status_types(status),
    deprecated_at TIMESTAMPTZ
);

-- Condition status types
CREATE TABLE condition_status_types (
    status TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    is_active_status BOOLEAN NOT NULL,
    display_order INTEGER NOT NULL,
    
    -- Evolution support  
    superseded_by TEXT REFERENCES condition_status_types(status),
    deprecated_at TIMESTAMPTZ
);

-- Vocabulary evolution function
CREATE OR REPLACE FUNCTION evolve_vocabulary_term(
    table_name TEXT,
    old_term TEXT,
    new_term TEXT,
    reason TEXT DEFAULT 'Term evolution'
) RETURNS VOID AS $$
BEGIN
    EXECUTE format('UPDATE %I SET superseded_by = $1, deprecated_at = NOW() WHERE status = $2', table_name)
    USING new_term, old_term;
    
    RAISE NOTICE 'Vocabulary term evolved: % -> % (Reason: %)', old_term, new_term, reason;
END;
$$ LANGUAGE plpgsql;
```

---

## 5. Medical Data Relationships

### 5.1. Core Relationship Table

```sql
CREATE TABLE medical_data_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source and target (polymorphic with validation)
    source_table TEXT NOT NULL,
    source_id UUID NOT NULL,
    target_table TEXT NOT NULL,
    target_id UUID NOT NULL,
    
    -- Relationship definition
    relationship_type TEXT NOT NULL REFERENCES relationship_types(type) ON UPDATE CASCADE,
    relationship_strength NUMERIC(4,3) CHECK (relationship_strength BETWEEN 0 AND 1),
    relationship_direction TEXT DEFAULT 'bidirectional' CHECK (relationship_direction IN ('source_to_target', 'target_to_source', 'bidirectional')),
    
    -- Context and reasoning
    rationale TEXT,
    clinical_context TEXT,
    
    -- Soft delete pattern
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_reason TEXT,
    archived_at TIMESTAMPTZ,
    
    -- Quality control
    confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    original_ai_relationship TEXT,
    normalization_notes TEXT,
    
    -- Audit
    created_by TEXT NOT NULL DEFAULT 'ai_extraction',
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate relationships
    UNIQUE(source_table, source_id, target_table, target_id, relationship_type)
);

-- Essential indexes
CREATE INDEX idx_medical_relationships_source 
ON medical_data_relationships(source_table, source_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_medical_relationships_target 
ON medical_data_relationships(target_table, target_id) WHERE archived IS NOT TRUE;
CREATE INDEX idx_medical_relationships_type 
ON medical_data_relationships(relationship_type) WHERE archived IS NOT TRUE;
CREATE INDEX idx_medical_relationships_requires_review 
ON medical_data_relationships(requires_review) WHERE requires_review = TRUE AND archived IS NOT TRUE;
```

### 5.2. Polymorphic Validation

```sql
-- Relationship validation function
CREATE OR REPLACE FUNCTION validate_relationship_references()
RETURNS TRIGGER AS $$
DECLARE
    source_exists BOOLEAN;
    target_exists BOOLEAN;
BEGIN
    -- Skip validation during bulk operations (session-based control)
    IF current_setting('app.bulk_relationship_mode', true) = 'on' THEN
        RETURN NEW;
    END IF;
    
    -- Validate source reference exists and is not archived
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE id = $1 AND archived IS NOT TRUE)', NEW.source_table)
    INTO source_exists USING NEW.source_id;
    
    IF NOT source_exists THEN
        RAISE EXCEPTION 'Source record % does not exist in table %', NEW.source_id, NEW.source_table;
    END IF;
    
    -- Validate target reference exists and is not archived  
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE id = $1 AND archived IS NOT TRUE)', NEW.target_table)
    INTO target_exists USING NEW.target_id;
    
    IF NOT target_exists THEN
        RAISE EXCEPTION 'Target record % does not exist in table %', NEW.target_id, NEW.target_table;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_relationship_references_trigger
    BEFORE INSERT OR UPDATE ON medical_data_relationships
    FOR EACH ROW EXECUTE FUNCTION validate_relationship_references();
```

---

## 6. Row Level Security (RLS)

### 6.1. User Isolation Security Function

```sql
-- Secure relationship access control function
CREATE OR REPLACE FUNCTION can_access_relationship(
    source_table TEXT, 
    source_id UUID, 
    target_table TEXT, 
    target_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    source_patient_id UUID;
    target_patient_id UUID;
    user_id UUID := auth.uid();
BEGIN
    -- Handle different table structures for patient_id extraction
    CASE source_table
        WHEN 'patient_medications', 'patient_conditions', 'patient_allergies', 
             'patient_lab_results', 'patient_vitals' THEN
            EXECUTE format('SELECT patient_id FROM %I WHERE id = $1 AND archived IS NOT TRUE', source_table)
            INTO source_patient_id USING source_id;
        WHEN 'documents' THEN
            EXECUTE format('SELECT user_id FROM %I WHERE id = $1 AND archived IS NOT TRUE', source_table)
            INTO source_patient_id USING source_id;
        ELSE
            RETURN FALSE; -- Unknown table type
    END CASE;
    
    CASE target_table
        WHEN 'patient_medications', 'patient_conditions', 'patient_allergies', 
             'patient_lab_results', 'patient_vitals' THEN
            EXECUTE format('SELECT patient_id FROM %I WHERE id = $1 AND archived IS NOT TRUE', target_table)
            INTO target_patient_id USING target_id;
        WHEN 'documents' THEN
            EXECUTE format('SELECT user_id FROM %I WHERE id = $1 AND archived IS NOT TRUE', target_table)
            INTO target_patient_id USING target_id;
        ELSE
            RETURN FALSE; -- Unknown table type
    END CASE;
    
    -- User can access relationship if they own either the source or target record
    RETURN (source_patient_id = user_id OR target_patient_id = user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 6.2. RLS Policies

```sql
-- Enable RLS on all tables
ALTER TABLE patient_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_data_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_fact_sources ENABLE ROW LEVEL SECURITY;

-- User isolation policies
CREATE POLICY patient_medications_user_isolation ON patient_medications
    FOR ALL USING (auth.uid() = patient_id AND archived IS NOT TRUE);

CREATE POLICY patient_conditions_user_isolation ON patient_conditions
    FOR ALL USING (auth.uid() = patient_id AND archived IS NOT TRUE);

CREATE POLICY patient_allergies_user_isolation ON patient_allergies
    FOR ALL USING (auth.uid() = patient_id AND archived IS NOT TRUE);

CREATE POLICY patient_lab_results_user_isolation ON patient_lab_results
    FOR ALL USING (auth.uid() = patient_id AND archived IS NOT TRUE);

CREATE POLICY patient_vitals_user_isolation ON patient_vitals
    FOR ALL USING (auth.uid() = patient_id AND archived IS NOT TRUE);

-- Secure relationship access control
CREATE POLICY medical_relationships_secure_isolation ON medical_data_relationships
    FOR ALL USING (
        archived IS NOT TRUE 
        AND can_access_relationship(source_table, source_id, target_table, target_id)
    );

-- Provenance data access (tied to document ownership)
CREATE POLICY clinical_fact_sources_user_isolation ON clinical_fact_sources
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM documents d 
            WHERE d.id = clinical_fact_sources.document_id 
            AND d.user_id = auth.uid() 
            AND d.archived IS NOT TRUE
        )
    );
```

---

## 7. Essential Constraints and Triggers

### 7.1. Updated At Triggers

```sql
-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all clinical tables
CREATE TRIGGER update_patient_medications_updated_at
    BEFORE UPDATE ON patient_medications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_conditions_updated_at
    BEFORE UPDATE ON patient_conditions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_allergies_updated_at
    BEFORE UPDATE ON patient_allergies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_lab_results_updated_at
    BEFORE UPDATE ON patient_lab_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_vitals_updated_at
    BEFORE UPDATE ON patient_vitals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 7.2. Session-Based Bulk Operation Control

```sql
-- Bulk operation helper functions
CREATE OR REPLACE FUNCTION enable_bulk_relationship_mode() RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.bulk_relationship_mode', 'on', false);
    RAISE NOTICE 'Bulk relationship mode enabled - validation triggers bypassed';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION disable_bulk_relationship_mode() RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.bulk_relationship_mode', 'off', false);
    RAISE NOTICE 'Bulk relationship mode disabled';
END;
$$ LANGUAGE plpgsql;
```

---

## 8. Core Schema Summary

This core schema provides the essential foundation for Guardian's healthcare data management:

**Clinical Data Tables:**
- `patient_medications` - Medication records with dosage, frequency, and status
- `patient_conditions` - Medical conditions with ICD-10 codes and severity
- `patient_allergies` - Allergy information with reaction and severity details
- `patient_lab_results` - Laboratory test results with reference ranges
- `patient_vitals` - Vital signs measurements

**Relationship System:**
- `medical_data_relationships` - Polymorphic relationships between clinical entities
- `relationship_types` - Controlled vocabulary for relationship definitions

**Provenance Tracking:**
- `clinical_fact_sources` - Links clinical facts to source documents with spatial precision

**Security & Compliance:**
- Row Level Security (RLS) ensures complete user data isolation
- Secure polymorphic relationship access control
- Comprehensive audit trails with soft delete patterns

**Essential Features:**
- Quality control flags for AI-extracted data requiring human review
- Confidence scoring for all extracted medical facts
- Flexible status management with vocabulary evolution support
- Spatial indexing for document provenance with click-to-zoom capability

This schema serves as the foundation for all Guardian healthcare data operations, providing a secure, compliant, and scalable base for advanced features like performance optimization, monitoring, and analytics.