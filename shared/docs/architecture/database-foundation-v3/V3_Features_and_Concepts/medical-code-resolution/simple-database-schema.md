# Simple Medical Code Database Schema

**Purpose**: Minimal database design for vector-based medical code resolution

**Architecture**: Fork-style parallel vector search across universal (RxNorm/SNOMED/LOINC) and regional (PBS/MBS/NHS dm+d) code libraries, with AI selection from both shortlists.

## Core Schema (5 Tables: Split Code Libraries + Assignment Tables)

**Table Overview**:
1. **Universal Medical Codes** - Vector database of universal codes (RxNorm/SNOMED/LOINC) with embeddings for global interoperability
2. **Regional Medical Codes** - Vector database of regional codes (PBS/MBS/NHS dm+d/NDC/etc.) with embeddings for local healthcare systems --> For now we are giving us one regional medical code table and because we're launching Australia it'll just contain Australian regional codes but eventually we can split it out into multiple regional medical tables.
3. **Medical Code Assignments** - Links clinical entities to their selected universal and/or regional codes (separate from clinical tables)
4. **Code Resolution Log** - Performance monitoring and audit trail for vector search operations and AI selections
5. **RLS Policies** - Row-level security ensuring patient data isolation and read-only access to code libraries

### **1. Universal Medical Codes (Global Interoperability)**

```sql
CREATE TABLE universal_medical_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Code identification
  code_system VARCHAR(20) NOT NULL,    -- 'rxnorm', 'snomed', 'loinc'
  code_value VARCHAR(50) NOT NULL,
  display_name TEXT NOT NULL,

  -- Vector embedding for similarity search
  embedding VECTOR(1536) NOT NULL,     -- OpenAI text-embedding-3-small

  -- Classification
  entity_type VARCHAR(20) NOT NULL,    -- 'medication', 'condition', 'procedure', 'observation'

  -- Metadata
  usage_frequency INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  last_updated TIMESTAMP DEFAULT NOW(),

  UNIQUE(code_system, code_value)
);

-- Vector similarity index for universal codes
CREATE INDEX idx_universal_codes_vector
  ON universal_medical_codes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 500);  -- Smaller list count for focused universal codes

-- Performance indexes
CREATE INDEX idx_universal_codes_system ON universal_medical_codes (code_system);
CREATE INDEX idx_universal_codes_entity_type ON universal_medical_codes (entity_type);
```

### **2. Regional Medical Codes (Local Healthcare Systems)**

```sql
CREATE TABLE regional_medical_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Code identification
  code_system VARCHAR(20) NOT NULL,    -- 'pbs', 'mbs', 'nhs_dmd', 'ndc', 'pzn', etc.
  code_value VARCHAR(50) NOT NULL,
  display_name TEXT NOT NULL,

  -- Vector embedding for similarity search
  embedding VECTOR(1536) NOT NULL,     -- OpenAI text-embedding-3-small

  -- Classification
  entity_type VARCHAR(20) NOT NULL,    -- 'medication', 'condition', 'procedure'

  -- Regional specificity
  country_code CHAR(3) NOT NULL,       -- 'AUS', 'GBR', 'USA', 'DEU', 'CAN', 'FRA'
  authority_required BOOLEAN DEFAULT FALSE,  -- PBS authority, NHS approval, etc.

  -- Metadata
  usage_frequency INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  last_updated TIMESTAMP DEFAULT NOW(),

  UNIQUE(code_system, code_value, country_code)
);

-- Vector similarity index for regional codes
CREATE INDEX idx_regional_codes_vector
  ON regional_medical_codes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 1000);  -- Larger list count for diverse regional codes

-- Performance indexes
CREATE INDEX idx_regional_codes_system ON regional_medical_codes (code_system);
CREATE INDEX idx_regional_codes_country ON regional_medical_codes (country_code);
CREATE INDEX idx_regional_codes_entity_type ON regional_medical_codes (entity_type);
CREATE INDEX idx_regional_codes_country_entity ON regional_medical_codes (country_code, entity_type);
```

### **3. Medical Code Assignments (Separate from Clinical Tables)**

```sql
CREATE TABLE medical_code_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Entity reference (generic for all clinical tables)
  entity_table VARCHAR(50) NOT NULL,      -- 'medications', 'conditions', 'procedures', etc.
  entity_id UUID NOT NULL,                -- FK to the clinical entity
  patient_id UUID NOT NULL,               -- For RLS and audit

  -- Universal code assignment
  universal_code_system VARCHAR(20),      -- 'rxnorm', 'snomed', 'loinc'
  universal_code VARCHAR(50),
  universal_display TEXT,
  universal_confidence DECIMAL(3,2),

  -- Regional code assignment
  regional_code_system VARCHAR(20),       -- 'pbs', 'mbs', 'nhs_dmd', etc.
  regional_code VARCHAR(50),
  regional_display TEXT,
  regional_confidence DECIMAL(3,2),
  regional_country_code CHAR(3),          -- 'AUS', 'GBR', 'USA', etc.

  -- Assignment metadata
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by_system VARCHAR(20) DEFAULT 'vector_ai',
  requires_review BOOLEAN DEFAULT FALSE,

  -- Fallback for no matches
  fallback_identifier TEXT,               -- When no codes found

  UNIQUE(entity_table, entity_id),
  FOREIGN KEY (patient_id) REFERENCES auth.users(id)
);

-- Indexes for lookups
CREATE INDEX idx_assignments_entity ON medical_code_assignments (entity_table, entity_id);
CREATE INDEX idx_assignments_patient ON medical_code_assignments (patient_id);
CREATE INDEX idx_assignments_universal ON medical_code_assignments (universal_code_system, universal_code);
CREATE INDEX idx_assignments_regional ON medical_code_assignments (regional_code_system, regional_code, regional_country_code);
```

### **4. Code Resolution Log (Performance Monitoring)**

```sql
CREATE TABLE code_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Input
  input_text TEXT NOT NULL,
  entity_type VARCHAR(20) NOT NULL,
  entity_table VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,

  -- Assignment results
  universal_assigned BOOLEAN DEFAULT FALSE,
  regional_assigned BOOLEAN DEFAULT FALSE,
  fallback_used BOOLEAN DEFAULT FALSE,

  -- Performance
  processing_time_ms INTEGER,
  candidates_count_universal INTEGER,
  candidates_count_regional INTEGER,
  ai_selection_time_ms INTEGER,

  -- Metadata
  resolved_at TIMESTAMP DEFAULT NOW(),
  document_origin VARCHAR(10)
);

-- Performance monitoring indexes
CREATE INDEX idx_resolutions_date ON code_resolutions (resolved_at);
CREATE INDEX idx_resolutions_performance ON code_resolutions (processing_time_ms);
```

### **5. RLS Policies for Security**

```sql
-- Row Level Security for medical_code_assignments
ALTER TABLE medical_code_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own code assignments"
  ON medical_code_assignments FOR ALL
  USING (patient_id = auth.uid());

-- Code libraries are globally readable (no RLS)
-- But only system can write to code tables
CREATE POLICY "Read-only access to universal codes"
  ON universal_medical_codes FOR SELECT
  USING (true);

CREATE POLICY "Read-only access to regional codes"
  ON regional_medical_codes FOR SELECT
  USING (true);
```

## Fork-Style Search Functions

```sql
-- Universal code vector search
CREATE OR REPLACE FUNCTION search_universal_codes(
  query_embedding VECTOR(1536),
  entity_type VARCHAR(20) DEFAULT NULL,
  max_results INTEGER DEFAULT 10
) RETURNS TABLE (
  code_system VARCHAR(20),
  code_value VARCHAR(50),
  display_name TEXT,
  similarity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    umc.code_system,
    umc.code_value,
    umc.display_name,
    1 - (umc.embedding <=> query_embedding)::FLOAT as similarity_score
  FROM universal_medical_codes umc
  WHERE umc.active = TRUE
    AND (entity_type IS NULL OR umc.entity_type = entity_type)
  ORDER BY umc.embedding <=> query_embedding
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Regional code vector search
CREATE OR REPLACE FUNCTION search_regional_codes(
  query_embedding VECTOR(1536),
  entity_type VARCHAR(20) DEFAULT NULL,
  country_code CHAR(3) DEFAULT NULL,
  max_results INTEGER DEFAULT 10
) RETURNS TABLE (
  code_system VARCHAR(20),
  code_value VARCHAR(50),
  display_name TEXT,
  similarity_score FLOAT,
  country_code CHAR(3)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rmc.code_system,
    rmc.code_value,
    rmc.display_name,
    1 - (rmc.embedding <=> query_embedding)::FLOAT as similarity_score,
    rmc.country_code
  FROM regional_medical_codes rmc
  WHERE rmc.active = TRUE
    AND (entity_type IS NULL OR rmc.entity_type = entity_type)
    AND (country_code IS NULL OR rmc.country_code = country_code)
  ORDER BY rmc.embedding <=> query_embedding
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;
```

## Data Population

```sql
-- Insert universal codes
INSERT INTO universal_medical_codes (
  code_system, code_value, display_name, embedding, entity_type
) VALUES
  ('rxnorm', '314076', 'Lisinopril 10mg Oral Tablet',
   get_embedding('Lisinopril 10mg Oral Tablet'), 'medication'),
  ('snomed', '56018004', 'Heart failure',
   get_embedding('Heart failure'), 'condition'),
  ('loinc', '33747-0', 'Blood pressure',
   get_embedding('Blood pressure'), 'observation');

-- Insert regional codes
INSERT INTO regional_medical_codes (
  code_system, code_value, display_name, embedding, entity_type, country_code
) VALUES
  ('pbs', '2345', 'Lisinopril tablets',
   get_embedding('Lisinopril tablets'), 'medication', 'AUS'),
  ('mbs', '23', 'General practitioner consultation',
   get_embedding('General practitioner consultation'), 'procedure', 'AUS'),
  ('nhs_dmd', '123456', 'Lisinopril 10mg tablets',
   get_embedding('Lisinopril 10mg tablets'), 'medication', 'GBR');

-- Example code assignment (after AI processing)
INSERT INTO medical_code_assignments (
  entity_table, entity_id, patient_id,
  universal_code_system, universal_code, universal_display, universal_confidence,
  regional_code_system, regional_code, regional_display, regional_confidence, regional_country_code
) VALUES (
  'medications', 'some-medication-uuid', 'some-patient-uuid',
  'rxnorm', '314076', 'Lisinopril 10mg Oral Tablet', 0.92,
  'pbs', '2345', 'Lisinopril tablets', 0.87, 'AUS'
);
```

## Integration with Clinical Tables

```sql
-- Example: Clinical entities remain clean (no embedded codes)
CREATE TABLE medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL,
  medication_name TEXT NOT NULL,
  strength TEXT,
  form TEXT,
  -- NO medical code columns here
  created_at TIMESTAMP DEFAULT NOW()
);

-- Code assignments link via medical_code_assignments table
-- Query pattern for enriched data:
-- Query with both universal and regional code details
SELECT
  m.*,
  mca.universal_code_system,
  mca.universal_code,
  umc.display_name as universal_display,
  mca.regional_code_system,
  mca.regional_code,
  rmc.display_name as regional_display,
  rmc.country_code
FROM medications m
LEFT JOIN medical_code_assignments mca
  ON mca.entity_table = 'medications' AND mca.entity_id = m.id
LEFT JOIN universal_medical_codes umc
  ON umc.code_system = mca.universal_code_system AND umc.code_value = mca.universal_code
LEFT JOIN regional_medical_codes rmc
  ON rmc.code_system = mca.regional_code_system AND rmc.code_value = mca.regional_code
WHERE m.patient_id = auth.uid();
```

## Performance Targets

- **Vector search**: <100ms p95 for similarity queries
- **Storage**: ~15GB total (8GB universal + 7GB regional codes with embeddings + assignments)
- **Accuracy**: >90% relevant matches in top 10 results
- **Scalability**: Handle 1000+ concurrent searches
- **Assignment lookups**: <50ms p95 with proper indexing

## Schema Benefits

- **Clean separation**: Clinical data separate from medical codes
- **Multi-domain support**: Single assignment table for all entity types
- **Multi-regional**: Isolated regional code tables per country for easy maintenance
- **Audit-ready**: Complete assignment history and performance logs
- **RLS-compliant**: Patient data isolation maintained

## Regional Code Systems Reference

**Launch**: Australia only (PBS, MBS, ICD_10_AM)
**Future Expansion**: Additional countries can be added to regional table

```typescript
interface RegionalCodeSystems {
  australia: {
    medications: ['PBS', 'TGA_ARTG']; // Pharmaceutical Benefits Scheme, ARTG registry
    conditions: ['ICD_10_AM']; // Australian modification of ICD-10
    procedures: ['MBS', 'ACHI']; // Medicare Benefits Schedule, Australian Classification of Health Interventions
    observations: ['NATA']; // National Association of Testing Authorities standards
  };

  // Future expansion targets
  united_kingdom: {
    medications: ['NHS_dm+d', 'BNF']; // Dictionary of medicines and devices, British National Formulary
    conditions: ['ICD_10_UK', 'Read_Codes'];
    procedures: ['OPCS_4']; // Office of Population Censuses and Surveys Classification
    observations: ['NHS_Reference_Ranges'];
  };

  united_states: {
    medications: ['NDC']; // National Drug Code (FDA)
    conditions: ['ICD_10_CM']; // Clinical Modification
    procedures: ['CPT', 'ICD_10_PCS']; // Current Procedural Terminology, Procedure Coding System
    observations: ['CPT_Lab_Codes'];
  };

  germany: {
    medications: ['PZN', 'ATC_DE']; // Pharmazentralnummer, German ATC
    conditions: ['ICD_10_GM']; // German modification
    procedures: ['OPS']; // Operationen- und Prozedurenschlüssel
    observations: ['LOINC_DE'];
  };

  canada: {
    medications: ['DIN', 'Health_Canada']; // Drug Identification Number
    conditions: ['ICD_10_CA']; // Canadian modification
    procedures: ['CCI']; // Canadian Classification of Health Interventions
    observations: ['Canadian_Lab_Standards'];
  };

  france: {
    medications: ['CIP', 'ANSM']; // Code Identifiant de Présentation
    conditions: ['CIM_10']; // French ICD-10
    procedures: ['CCAM']; // Classification Commune des Actes Médicaux
    observations: ['French_Lab_Standards'];
  };
}
```

## Maintenance Benefits

- **Independent Updates**: Universal codes (quarterly) vs regional codes (country-specific schedules)
- **Easy Expansion**: New countries = new rows in regional table, no schema changes
- **Performance Isolation**: Universal search hits smaller, focused table; regional search filters by country
- **Code System Separation**: RxNorm updates don't affect PBS table performance

This split 5-table schema provides robust medical code resolution through fork-style parallel vector search with isolated code libraries for optimal maintenance and performance.