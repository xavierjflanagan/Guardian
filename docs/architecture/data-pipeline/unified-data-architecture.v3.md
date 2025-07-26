# Guardian Unified Data Architecture & Lifecycle Strategy (v3)

**Status:** Comprehensive Blueprint  
**Date:** 2025-07-26  
**Authors:** Claude Code synthesis of Gemini v2, incorporating v1 completeness and O3 feedback

---

## 1. Executive Summary

This document provides the definitive, implementation-ready data architecture for the Guardian platform. Version 3 synthesizes the best elements from previous iterations while addressing critical gaps identified through systematic review. The architecture balances relational performance with modern flexibility, emphasizing immutable data, comprehensive provenance, and clinically-aware lifecycle management.

**Key Enhancements in v3:**
- Complete clinical data schema with type-specific tables
- Comprehensive provenance with bounding box support
- Rich metadata and tagging infrastructure  
- Security and performance specifications
- Detailed rule engine framework

---

## 2. Core Architectural Principles

- **Immutable History:** No data is ever physically deleted. Changes tracked through versioning with complete audit trails
- **Clinically-Aware Lifecycle:** Sophisticated rule-based engine manages data status (active, resolved, superseded) with clinical understanding
- **Deep Multi-Layered Provenance:** Every clinical fact traceable to source document, page location, and extraction process
- **Separation of Concerns:** Clean separation of clinical data, source metadata, and relational links
- **Performance & Security:** Built-in optimization and HIPAA-compliant isolation
- **Interoperability:** FHIR-compatible design for healthcare data exchange

---

## 3. Database Schema: Complete Clinical Data Model

### 3.1. Document Management Layer

#### `documents` Table
```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    file_name TEXT NOT NULL,
    file_size BIGINT,
    mime_type TEXT,
    storage_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    -- Performance
    CONSTRAINT documents_user_created_idx ON (user_id, created_at DESC)
);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY documents_user_isolation ON documents
    FOR ALL USING (auth.uid() = user_id);
```

#### `document_representations` Table
```sql
CREATE TABLE document_representations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    representation_type TEXT NOT NULL CHECK (representation_type IN ('original', 'ocr_text', 'ai_json', 'normalized')),
    content JSONB,
    content_url TEXT, -- For large files stored externally
    processing_stage TEXT NOT NULL,
    confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_document_representations_document_type 
ON document_representations(document_id, representation_type);
```

#### `document_processing_stages` Table
```sql
CREATE TABLE document_processing_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    stage_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'
);
```

### 3.2. Provenance Layer

#### `clinical_fact_sources` Table
```sql
CREATE TABLE clinical_fact_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fact_table TEXT NOT NULL, -- e.g., 'patient_medications'
    fact_id UUID NOT NULL,
    document_id UUID NOT NULL REFERENCES documents(id),
    representation_id UUID REFERENCES document_representations(id),
    page_number INTEGER,
    bounding_box JSONB, -- {x, y, width, height} for click-to-zoom
    source_text TEXT, -- Original extracted text
    extraction_method TEXT NOT NULL, -- 'ai_vision', 'ocr', 'manual'
    confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Generic FK constraint handled at application level
    UNIQUE(fact_table, fact_id)
);

CREATE INDEX idx_clinical_fact_sources_document 
ON clinical_fact_sources(document_id);
CREATE INDEX idx_clinical_fact_sources_fact 
ON clinical_fact_sources(fact_table, fact_id);
```

### 3.3. Core Clinical Data Tables

#### `medications_master` (Canonical Library)
```sql
CREATE TABLE medications_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generic_name TEXT NOT NULL,
    brand_names TEXT[] DEFAULT '{}',
    medication_class TEXT NOT NULL,
    therapeutic_category TEXT,
    is_prescription BOOLEAN NOT NULL DEFAULT true,
    rxnorm_code TEXT,
    source TEXT NOT NULL DEFAULT 'RxNorm',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(generic_name, medication_class)
);

-- Full-text search support
CREATE INDEX idx_medications_master_search 
ON medications_master USING GIN(to_tsvector('english', generic_name || ' ' || array_to_string(brand_names, ' ')));
```

#### `patient_medications` Table
```sql
CREATE TABLE patient_medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    medication_id UUID REFERENCES medications_master(id),
    
    -- Original extracted data
    original_name TEXT NOT NULL,
    dosage TEXT,
    frequency TEXT,
    route TEXT,
    
    -- Normalized data
    normalized_dosage_value DECIMAL,
    normalized_dosage_unit TEXT,
    normalized_frequency TEXT,
    
    -- Lifecycle management
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'ceased', 'superseded')),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ,
    valid_from_precision TEXT NOT NULL DEFAULT 'exact' CHECK (valid_from_precision IN ('exact', 'document_date', 'upload_date')),
    
    -- Audit and quality
    confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    resolution_reason TEXT,
    superseded_by UUID REFERENCES patient_medications(id),
    
    -- Metadata and tagging
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE patient_medications ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY patient_medications_user_isolation ON patient_medications
    FOR ALL USING (auth.uid() = patient_id);

-- Performance indexes
CREATE INDEX idx_patient_medications_patient_active 
ON patient_medications(patient_id, status) WHERE status = 'active';
CREATE INDEX idx_patient_medications_timeline 
ON patient_medications(patient_id, valid_from DESC, valid_to DESC NULLS FIRST);

-- GIST index for metadata/tags
CREATE INDEX idx_patient_medications_metadata 
ON patient_medications USING GIN(metadata);
CREATE INDEX idx_patient_medications_tags 
ON patient_medications USING GIN(tags);
```

#### `patient_conditions` Table
```sql
CREATE TABLE patient_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Condition data
    condition_name TEXT NOT NULL,
    icd10_code TEXT,
    condition_category TEXT,
    severity TEXT,
    
    -- Lifecycle management
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'chronic', 'superseded')),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ,
    valid_from_precision TEXT NOT NULL DEFAULT 'exact' CHECK (valid_from_precision IN ('exact', 'document_date', 'upload_date')),
    
    -- Audit and quality
    confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    resolution_reason TEXT,
    superseded_by UUID REFERENCES patient_conditions(id),
    
    -- Metadata and tagging
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE patient_conditions ENABLE ROW LEVEL SECURITY;

-- RLS Policy  
CREATE POLICY patient_conditions_user_isolation ON patient_conditions
    FOR ALL USING (auth.uid() = patient_id);

-- Performance indexes
CREATE INDEX idx_patient_conditions_patient_active 
ON patient_conditions(patient_id, status) WHERE status IN ('active', 'chronic');
CREATE INDEX idx_patient_conditions_metadata 
ON patient_conditions USING GIN(metadata);
```

#### `patient_lab_results` Table
```sql
CREATE TABLE patient_lab_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Lab result data
    test_name TEXT NOT NULL,
    loinc_code TEXT,
    
    -- Original values
    original_value TEXT NOT NULL,
    original_unit TEXT,
    
    -- Normalized values
    normalized_value DECIMAL,
    normalized_unit TEXT,
    
    -- Reference ranges
    reference_range_low DECIMAL,
    reference_range_high DECIMAL,
    reference_range_text TEXT,
    
    -- Test context
    test_date TIMESTAMPTZ,
    test_date_precision TEXT NOT NULL DEFAULT 'exact' CHECK (test_date_precision IN ('exact', 'document_date', 'upload_date')),
    ordering_provider TEXT,
    lab_facility TEXT,
    
    -- Quality and audit
    confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    
    -- Metadata and tagging
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE patient_lab_results ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY patient_lab_results_user_isolation ON patient_lab_results
    FOR ALL USING (auth.uid() = patient_id);

-- Performance indexes
CREATE INDEX idx_patient_lab_results_patient_test 
ON patient_lab_results(patient_id, test_name, test_date DESC);
CREATE INDEX idx_patient_lab_results_loinc 
ON patient_lab_results(loinc_code) WHERE loinc_code IS NOT NULL;
```

#### `patient_allergies` Table
```sql
CREATE TABLE patient_allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Allergy data
    allergen TEXT NOT NULL,
    allergen_category TEXT, -- 'medication', 'food', 'environmental'
    reaction TEXT,
    severity TEXT,
    
    -- Lifecycle management
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'superseded')),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ,
    valid_from_precision TEXT NOT NULL DEFAULT 'exact' CHECK (valid_from_precision IN ('exact', 'document_date', 'upload_date')),
    
    -- Quality and audit
    confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    superseded_by UUID REFERENCES patient_allergies(id),
    
    -- Metadata and tagging
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE patient_allergies ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY patient_allergies_user_isolation ON patient_allergies
    FOR ALL USING (auth.uid() = patient_id);
```

#### `unclassified_data` Table
```sql
CREATE TABLE unclassified_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Extracted data
    extracted_text TEXT NOT NULL,
    suggested_category TEXT,
    ai_reasoning TEXT,
    
    -- Review workflow
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'classified', 'discarded')),
    classified_as_table TEXT,
    classified_as_id UUID,
    review_notes TEXT,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    
    -- Quality
    confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE unclassified_data ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY unclassified_data_user_isolation ON unclassified_data
    FOR ALL USING (auth.uid() = patient_id);
```

### 3.4. Relationship Modeling

#### `medical_data_relationships` Table
```sql
CREATE TABLE medical_data_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source and target (polymorphic)
    source_table TEXT NOT NULL,
    source_id UUID NOT NULL,
    target_table TEXT NOT NULL,
    target_id UUID NOT NULL,
    
    -- Relationship metadata
    relationship_type TEXT NOT NULL, -- Controlled vocabulary
    relationship_strength DECIMAL(3,2) CHECK (relationship_strength BETWEEN 0 AND 1),
    relationship_direction TEXT DEFAULT 'bidirectional' CHECK (relationship_direction IN ('source_to_target', 'target_to_source', 'bidirectional')),
    
    -- Context and reasoning
    rationale TEXT,
    clinical_context TEXT,
    
    -- Quality
    confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
    requires_review BOOLEAN DEFAULT FALSE,
    
    -- Audit
    created_by TEXT NOT NULL DEFAULT 'ai_extraction',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate relationships
    UNIQUE(source_table, source_id, target_table, target_id, relationship_type)
);

-- Performance indexes
CREATE INDEX idx_medical_relationships_source 
ON medical_data_relationships(source_table, source_id);
CREATE INDEX idx_medical_relationships_target 
ON medical_data_relationships(target_table, target_id);
CREATE INDEX idx_medical_relationships_type 
ON medical_data_relationships(relationship_type);
```

#### `relationship_types` (Controlled Vocabulary)
```sql
CREATE TABLE relationship_types (
    type TEXT PRIMARY KEY,
    category TEXT NOT NULL, -- 'treatment', 'causation', 'temporal', 'monitoring'
    description TEXT NOT NULL,
    valid_source_tables TEXT[] NOT NULL,
    valid_target_tables TEXT[] NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- Insert common relationship types
INSERT INTO relationship_types (type, category, description, valid_source_tables, valid_target_tables) VALUES
('treats', 'treatment', 'Medication treats condition', '{"patient_medications"}', '{"patient_conditions"}'),
('monitors', 'monitoring', 'Lab test monitors condition or medication', '{"patient_lab_results"}', '{"patient_conditions", "patient_medications"}'),
('caused_by', 'causation', 'Condition caused by medication (side effect)', '{"patient_conditions"}', '{"patient_medications"}'),
('contraindicates', 'safety', 'Allergy contraindicates medication', '{"patient_allergies"}', '{"patient_medications"}'),
('temporal_sequence', 'temporal', 'Events occurred in sequence', '{"patient_conditions", "patient_medications", "patient_lab_results"}', '{"patient_conditions", "patient_medications", "patient_lab_results"}');
```

---

## 4. Data Lifecycle Management: The Guardian Rule Engine

### 4.1. Rule Engine Framework

The lifecycle rule engine operates through PostgreSQL triggers and stored procedures, with extensible YAML-based rule definitions:

```sql
CREATE TABLE lifecycle_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    rule_definition JSONB NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(table_name, rule_name)
);
```

### 4.2. Temporal State Management

Each clinical table includes standardized lifecycle columns:
- `valid_from` / `valid_to`: Temporal validity windows
- `valid_from_precision`: Data quality indicator
- `status`: Current lifecycle state
- `superseded_by`: Audit trail for replacements
- `resolution_reason`: Context for status changes

### 4.3. Complex Scenario Handling

**Re-commenced Medications Example:**
```sql
-- First period: 2020-01-15 to 2022-03-01
-- Second period: 2024-06-10 to present
-- Results in two separate rows with different valid_from/valid_to
```

**Frontend Aggregation:**
The UI intelligently consolidates related records: "Lisinopril (Jan 2020 - Mar 2022, Jun 2024 - Present)"

---

## 5. Performance Optimization Strategy

### 5.1. Indexing Strategy

**Timeline Queries:**
```sql
CREATE INDEX idx_patient_medications_timeline 
ON patient_medications(patient_id, valid_from DESC, valid_to DESC NULLS FIRST);
```

**Full-Text Search:**
```sql
CREATE INDEX idx_medications_search 
ON medications_master USING GIN(to_tsvector('english', generic_name || ' ' || array_to_string(brand_names, ' ')));
```

**Metadata Queries:**
```sql
CREATE INDEX idx_patient_conditions_metadata 
ON patient_conditions USING GIN(metadata);
```

### 5.2. Materialized Views

**Active Patient Summary:**
```sql
CREATE MATERIALIZED VIEW patient_active_summary AS
SELECT 
    patient_id,
    COUNT(*) FILTER (WHERE table_name = 'patient_medications' AND status = 'active') as active_medications,
    COUNT(*) FILTER (WHERE table_name = 'patient_conditions' AND status IN ('active', 'chronic')) as active_conditions,
    COUNT(*) FILTER (WHERE table_name = 'patient_allergies' AND status = 'active') as active_allergies,
    MAX(updated_at) as last_updated
FROM (
    SELECT patient_id, 'patient_medications' as table_name, status, updated_at FROM patient_medications
    UNION ALL
    SELECT patient_id, 'patient_conditions' as table_name, status, updated_at FROM patient_conditions  
    UNION ALL
    SELECT patient_id, 'patient_allergies' as table_name, status, updated_at FROM patient_allergies
) combined
GROUP BY patient_id;

CREATE UNIQUE INDEX ON patient_active_summary(patient_id);
```

---

## 6. Security & Compliance Framework

### 6.1. Row Level Security (RLS)

**Universal Patient Isolation:**
```sql
-- Applied to all patient data tables
CREATE POLICY {table}_user_isolation ON {table}
    FOR ALL USING (auth.uid() = patient_id);
```

### 6.2. Audit Trail

**Change Tracking:**
```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    old_values JSONB,
    new_values JSONB,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_info JSONB DEFAULT '{}'
);
```

### 6.3. Data Encryption

- **At Rest:** Transparent Data Encryption (TDE) for sensitive columns
- **In Transit:** TLS 1.3 for all database connections
- **Application Level:** Additional encryption for PII fields

---

## 7. Data Processing Pipeline: ETL Architecture

### 7.1. Processing Stages

1. **Document Ingestion**
   - File validation and virus scanning
   - Storage in user-isolated folders
   - Initial metadata extraction

2. **AI Extraction**
   - Multi-model approach (GPT-4o Mini + Google Cloud Vision)
   - Structured JSON output with confidence scores
   - Relationship identification

3. **Normalization Service**
   - Deterministic mapping to clinical tables
   - Canonical entity resolution (medications_master lookup)
   - Unit normalization and validation

4. **Quality Assurance**
   - Confidence threshold checks
   - Human review queue population
   - Data integrity validation

5. **Knowledge Graph Construction**
   - Relationship extraction and scoring
   - Graph consistency validation
   - Temporal relationship inference

### 7.2. Error Handling & Recovery

**Confidence-Based Routing:**
```sql
-- High confidence: Auto-process
-- Medium confidence: Queue for review
-- Low confidence: Flag for manual verification
```

**Processing State Tracking:**
```sql
UPDATE documents SET status = 'processing' WHERE id = $1;
-- Process...
UPDATE documents SET status = 'completed' WHERE id = $1;
```

---

## 8. Future Considerations & Extensibility

### 8.1. FHIR Integration Readiness

**Resource Mapping:**
- Patient → FHIR Patient
- patient_medications → FHIR MedicationStatement
- patient_conditions → FHIR Condition
- patient_lab_results → FHIR Observation

### 8.2. Scaling Considerations

**Horizontal Partitioning:**
```sql
-- Partition by patient_id for large datasets
CREATE TABLE patient_medications_y2025m01 PARTITION OF patient_medications
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

**Archival Strategy:**
- Move inactive records > 7 years to cold storage
- Maintain referential integrity with archive tables
- Compressed storage for historical data

### 8.3. AI Evolution Support

**Model Versioning:**
```sql
ALTER TABLE clinical_fact_sources ADD COLUMN extraction_model_version TEXT;
```

**Confidence Recalibration:**
```sql
-- Support for retrospective confidence score updates
ALTER TABLE patient_medications ADD COLUMN confidence_calibration_version INTEGER DEFAULT 1;
```

---

## 9. Implementation Roadmap

### Phase 1: Core Foundation (Weeks 1-2)
- Document management tables
- Basic clinical tables (medications, conditions)
- RLS policies and basic security

### Phase 2: Provenance & Quality (Weeks 3-4)  
- clinical_fact_sources implementation
- Confidence scoring and review workflows
- Basic relationship modeling

### Phase 3: Performance & Scale (Weeks 5-6)
- Index optimization
- Materialized views
- Audit logging

### Phase 4: Advanced Features (Weeks 7-8)
- Rule engine implementation
- Complex relationship handling
- FHIR preparation

---

## 10. Open Issues & Next Steps

### Critical Decisions Needed:
1. **Rule Engine Implementation:** PostgreSQL triggers vs. application-level processing
2. **Embedding Strategy:** pgvector vs. external vector database for RAG
3. **Migration Path:** From current schema to v3 architecture
4. **Testing Strategy:** Synthetic data generation and validation frameworks

### Development Dependencies:
1. **Medications Master Data:** RxNorm integration and initial population
2. **ICD-10 Mapping:** Condition normalization lookup tables  
3. **LOINC Integration:** Lab test standardization
4. **UI Mockups:** Frontend requirements for bounding box visualization

---

**Status:** Ready for development team review and implementation planning. This comprehensive architecture provides the foundation for a robust, scalable, and clinically-aware healthcare data platform.