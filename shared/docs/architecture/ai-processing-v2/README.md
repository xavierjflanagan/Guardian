# Guardian AI Processing Architecture v2

**Enterprise Healthcare Document Processing Platform**

**Status:** Architecture Redesign - Aligning with Database Foundation  
**Date:** August 19, 2025  
**Purpose:** Transform medical documents into normalized clinical data for Guardian's multi-profile healthcare platform

---

## Current Status

⚠️ **Critical Gap**: Current AI processing implementation is MVP-level. Enterprise requirements discovered from database foundation review:

| Component | Current State | Required State | Impact |
|-----------|--------------|----------------|---------|
| **Multi-Profile Support** | Single-user processing | self/child/adult_dependent/pet classification | Blocks family healthcare management |
| **O3's Clinical Events** | Basic text grouping | Two-axis classification (activity_type × clinical_purposes) | Cannot populate `patient_clinical_events` table |
| **Healthcare Standards** | Plain text extraction | SNOMED-CT/LOINC/CPT code integration | No healthcare interoperability |
| **Spatial Precision** | No coordinate data | PostGIS GEOMETRY(POLYGON, 4326) | Cannot populate `clinical_fact_sources` table |
| **Timeline Integration** | No metadata generation | Display categories, icons, search content | Cannot populate `healthcare_timeline_events` table |

See [CURRENT_STATUS.md](./CURRENT_STATUS.md) for detailed gap analysis.

---

## Quick Navigation

### 📚 Understanding Requirements
- [Core Requirements](./01-core-requirements/) - Foundation concepts that map to database tables
- [Clinical Classification](./02-clinical-classification/) - How AI classifies medical data using O3's model

### 🔧 Implementation Guide  
- [Implementation Roadmap](./IMPLEMENTATION_ROADMAP.md) - Comprehensive 5-phase plan
- [Extraction Pipeline](./03-extraction-pipeline/) - Document processing flow
- [Technical Specifications](./06-technical-specifications/) - Developer reference

### 📋 Compliance & Integration
- [Healthcare Compliance](./04-healthcare-compliance/) - Session tracking and audit trails
- [Provider Integration](./07-provider-integration/) - Future doctor portal preparation

### 🗄️ Database Foundation Links
- [Core Schema](../database-foundation/core/schema.md) - Tables we must populate
- [Multi-Profile System](../database-foundation/core/multi-profile.md) - Profile architecture
- [Healthcare Journey](../database-foundation/features/healthcare-journey.md) - Timeline system
- [Clinical Events SQL](../database-foundation/implementation/sql/005_clinical_events_core.sql) - O3's implementation

---

## Priority Implementation Phases

### Phase 1: Foundation (5-7 days) - **BLOCKING DATABASE INTEGRATION**
Critical components that must be built before any clinical data can be stored:

1. **Multi-Profile Document Classification**
   - Implement profile detection (self/child/adult_dependent/pet)
   - Map to `user_profiles` table
   - Prevent cross-profile contamination
   
2. **O3's Two-Axis Clinical Event Framework**  
   - Classify as observation vs intervention
   - Assign clinical purposes (screening/diagnostic/therapeutic/monitoring/preventive)
   - Populate `patient_clinical_events` table

3. **Healthcare Standards Integration**
   - SNOMED-CT, LOINC, CPT code lookup
   - Map to `snomed_code`, `loinc_code`, `cpt_code` fields

### Phase 2: AI-First Processing (4-6 days)
Core extraction without spatial coordinates:

1. **Clinical Fact Extraction**
   - Extract individual facts with confidence scores
   - Generate normalized data for clinical tables
   
2. **Timeline Metadata Generation**
   - Create display categories, titles, summaries
   - Populate `healthcare_timeline_events` table
   
3. **Smart Feature Detection**
   - Detect pregnancy, pediatric, adult care contexts
   - Populate `smart_health_features` table

### Phase 2+: Spatial-Semantic Fusion (4-6 days) - **FUTURE ENHANCEMENT**
OCR integration for spatial precision:

1. **Text Alignment Algorithms**
   - Map AI facts to OCR spatial regions
   - Fuzzy matching with confidence scoring
   
2. **PostGIS Conversion**
   - Convert bounding boxes to GEOMETRY format
   - Populate `clinical_fact_sources.bounding_box`

### Phase 3: Healthcare Compliance (3-4 days)
Session tracking and audit:

1. **Processing Sessions**
   - Track all API costs and durations
   - Populate `ai_processing_sessions` table
   
2. **Quality Metrics**
   - Extraction completeness scoring
   - Confidence tracking per fact

### Phase 4: Normalization Pipeline (4-5 days)
Database population engine:

1. **JSON to Clinical Tables**
   - Parse rich AI extraction JSON
   - Insert into `patient_conditions`, `patient_allergies`, etc.
   
2. **Relationship Detection**
   - Link medications to conditions
   - Populate `medical_data_relationships`

### Phase 5: Testing & Validation (3-4 days)
Healthcare-grade quality assurance:

1. **Multi-Document Testing**
   - Lab results, prescriptions, discharge summaries
   - Veterinary documents for pet profiles
   
2. **Standards Compliance**
   - Validate clinical code accuracy
   - Test timeline generation

---

## Critical Database Tables We Populate

### Core Clinical Tables
```sql
patient_clinical_events     -- O3's two-axis classification
patient_observations        -- Lab results, vitals, assessments  
patient_interventions       -- Medications, procedures, vaccinations
patient_conditions          -- Diagnoses with ICD-10 codes
patient_allergies          -- Allergies with severity
```

### Provenance & Tracking
```sql
clinical_fact_sources      -- Links facts to documents with spatial data
ai_processing_sessions     -- Complete processing audit trail
medical_data_relationships -- Relationships between clinical entities
```

### User Experience Tables
```sql
healthcare_timeline_events -- Timeline metadata for UI
smart_health_features      -- Auto-activating UI features
user_profiles             -- Multi-profile support
```

---

## Architecture Principles

### 1. Database-First Design
Every AI extraction component is designed to populate specific database tables with the exact structure and constraints required by the database foundation.

### 2. Multi-Profile Safety
Documents are classified to the correct profile (self/child/adult_dependent/pet) with contamination prevention to ensure data integrity.

### 3. Clinical Standards Compliance
All medical data is enriched with healthcare standard codes (SNOMED-CT, LOINC, CPT) for interoperability.

### 4. Complete Provenance
Every extracted fact is traceable to its source document with spatial coordinates (Phase 2+) and confidence scores.

### 5. Timeline Integration
Every clinical event generates timeline metadata for the patient's healthcare journey visualization.

---

## Getting Started for Developers

1. **Understand the Gap**: Review [CURRENT_STATUS.md](./CURRENT_STATUS.md)
2. **Learn Requirements**: Study [Core Requirements](./01-core-requirements/)
3. **Review Database Schema**: Read [database-foundation/core/schema.md](../database-foundation/core/schema.md)
4. **Follow Implementation**: Start with [Phase 1](./05-implementation-phases/phase-1-foundation.md)

---

## Key Differences from v1 (MVP)

| Aspect | v1 (Current) | v2 (Required) |
|--------|-------------|---------------|
| **Scope** | Single-user, basic extraction | Multi-profile, enterprise healthcare |
| **Classification** | Simple categorization | O3's two-axis clinical model |
| **Standards** | Plain text | SNOMED-CT/LOINC/CPT codes |
| **Spatial** | None | PostGIS coordinates for provenance |
| **Timeline** | None | Full healthcare journey metadata |
| **Profiles** | Single user | self/child/adult_dependent/pet |

---

*This architecture ensures Guardian's AI processing pipeline correctly populates the sophisticated database foundation, enabling multi-profile family healthcare management with clinical-grade precision and compliance.*