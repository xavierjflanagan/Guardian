# AI Processing Architecture Overview

**Guardian Healthcare Document Processing System**  
**Version:** 2.0 - Enterprise Architecture  
**Date:** August 19, 2025  
**Purpose:** Transform medical documents into normalized clinical data for multi-profile healthcare management

---

## System Overview

Guardian's AI Processing Architecture v2 is a complete redesign that transforms medical documents into structured clinical data. Unlike the MVP v1 approach, this enterprise architecture directly aligns with Guardian's database foundation to support family healthcare management across multiple profiles.

### Core Design Principles

**Database-First Architecture**
- Every AI component is designed to populate specific database tables
- Direct mapping from AI extraction to normalized clinical schema
- Ensures data consistency and enables advanced healthcare features

**Multi-Profile Safety**
- Documents classified to correct profiles (self/child/adult_dependent/pet)
- Contamination prevention to maintain data integrity
- Family healthcare coordination with proper access controls

**Clinical Standards Compliance**
- Integration with SNOMED-CT, LOINC, and CPT coding systems
- Healthcare interoperability and provider integration ready
- Supports clinical decision support and analytics

**Complete Provenance**
- Every extracted fact traceable to source document
- Spatial coordinates for click-to-zoom functionality (Phase 2+)
- Confidence scoring and quality metrics for healthcare compliance

---

## High-Level System Flow

### 1. Document Ingestion
```
Medical Document → Profile Classification → Document Routing
```
- AI determines profile type (self/child/adult_dependent/pet)
- Routes to appropriate processing pipeline
- Prevents cross-profile data contamination

### 2. AI-First Processing
```
Document Content → GPT-4o Mini → Structured Medical Facts
```
- O3's two-axis clinical classification (observation/intervention × clinical purposes)
- Healthcare standards integration (SNOMED-CT/LOINC/CPT codes)
- Confidence scoring and quality validation

### 3. Database Population
```
Structured Facts → Database Tables → Healthcare Timeline
```
- Direct insertion into normalized clinical tables
- Automatic timeline metadata generation
- Smart feature activation based on content

### 4. Spatial Enhancement (Phase 2+)
```
AI Facts + OCR Data → Spatial Alignment → Provenance Mapping
```
- Maps AI extractions to document coordinates
- Enables click-to-zoom document navigation
- PostGIS geometry storage for spatial queries

---

## Core Components

### Profile Classification Engine
**Purpose:** Determine document owner and route appropriately  
**Database Target:** `user_profiles`  
**Key Features:**
- Multi-profile detection (self/child/adult_dependent/pet)
- Age-based classification for pediatric care
- Species detection for veterinary records
- Contamination prevention algorithms

### O3 Clinical Events Classifier
**Purpose:** Transform medical facts into structured clinical events  
**Database Target:** `patient_clinical_events`  
**Classification Model:**
- **Activity Type:** observation (information gathering) vs intervention (action taken)
- **Clinical Purposes:** screening, diagnostic, therapeutic, monitoring, preventive
- **Healthcare Standards:** SNOMED-CT, LOINC, CPT code integration

### Clinical Details Extractors
**Purpose:** Extract specific medical measurements and details  
**Database Targets:** `patient_observations`, `patient_interventions`, `patient_conditions`, `patient_allergies`  
**Key Features:**
- Lab result parsing with reference ranges
- Medication extraction with dosage and route
- Condition classification with ICD-10 codes
- Allergy detection with severity assessment

### Timeline Generator
**Purpose:** Create patient-friendly timeline metadata  
**Database Target:** `healthcare_timeline_events`  
**Generated Content:**
- Display categories (visit/test_result/treatment/vaccination)
- Patient-friendly titles and summaries
- UI icons and searchable content
- Event tagging for filtering

### Smart Feature Detector
**Purpose:** Activate context-sensitive UI features  
**Database Target:** `smart_health_features`  
**Detection Contexts:**
- Pregnancy care (prenatal visits, pregnancy tests)
- Pediatric care (age-based, growth charts, immunizations)
- Veterinary care (animal species, vet procedures)
- Chronic disease management (diabetes, hypertension)

### Spatial Fusion Engine (Phase 2+)
**Purpose:** Link AI extractions to document coordinates  
**Database Target:** `clinical_fact_sources`  
**Capabilities:**
- OCR and AI text alignment
- PostGIS geometry conversion
- Click-to-zoom functionality
- Spatial clinical data queries

---

## Database Integration Architecture

### Core Clinical Tables
Guardian's AI processing directly populates these normalized tables:

```yaml
patient_clinical_events:
  purpose: "Core clinical facts with O3 classification"
  populated_by: "O3 Clinical Events Classifier"
  key_fields: "activity_type, clinical_purposes[], event_name, snomed_code"

patient_observations:
  purpose: "Detailed observation measurements"
  populated_by: "Observation Details Extractor"
  key_fields: "observation_type, value_numeric, unit, interpretation"

patient_interventions:
  purpose: "Intervention details (medications, procedures)"
  populated_by: "Intervention Details Extractor"
  key_fields: "intervention_type, substance_name, dose_amount, route"

healthcare_timeline_events:
  purpose: "Patient timeline metadata"
  populated_by: "Timeline Generator"
  key_fields: "display_category, title, summary, searchable_content"
```

### Provenance and Tracking
```yaml
clinical_fact_sources:
  purpose: "Link facts to source documents with spatial data"
  populated_by: "Spatial Fusion Engine"
  key_fields: "fact_table, fact_id, bounding_box, confidence_score"

ai_processing_sessions:
  purpose: "Complete processing audit trail"
  populated_by: "Session Tracker"
  key_fields: "processing_pipeline, api_costs_usd, quality_metrics"
```

### Multi-Profile Support
```yaml
user_profiles:
  purpose: "Multi-profile classification and routing"
  populated_by: "Profile Classification Engine"
  key_fields: "profile_type, display_name, species, relationship"

smart_health_features:
  purpose: "Context-sensitive UI activation"
  populated_by: "Smart Feature Detector"
  key_fields: "feature_type, activation_source, detection_confidence"
```

---

## Processing Phases Architecture

### Phase 1: Foundation (Critical - Blocks Database Integration)
**Components:** Profile Classification, O3 Clinical Events, Healthcare Standards Integration  
**Duration:** 5-7 days  
**Deliverables:** Core clinical data population capability

### Phase 2: AI-First Processing
**Components:** Clinical Details Extraction, Timeline Generation, Smart Features  
**Duration:** 4-6 days  
**Deliverables:** Complete clinical data extraction without spatial coordinates

### Phase 2+: Spatial Enhancement
**Components:** OCR Integration, Text Alignment, PostGIS Conversion  
**Duration:** 4-6 days  
**Deliverables:** Click-to-zoom document navigation

### Phase 3: Healthcare Compliance
**Components:** Session Tracking, Cost Attribution, Quality Metrics  
**Duration:** 3-4 days  
**Deliverables:** Healthcare-grade audit trails and compliance

### Phase 4: Normalization Pipeline
**Components:** JSON to Clinical Tables, Relationship Detection  
**Duration:** 4-5 days  
**Deliverables:** Complete database population engine

### Phase 5: Testing & Validation
**Components:** Multi-Document Testing, Standards Compliance  
**Duration:** 3-4 days  
**Deliverables:** Healthcare-grade quality assurance

---

## Quality and Compliance Architecture

### Confidence Scoring
- Every extraction includes confidence scores (0.0-1.0)
- Configurable thresholds per data type
- Safety-critical data (allergies, medications) requires higher confidence
- Low confidence items flagged for manual review

### Healthcare Standards
- SNOMED-CT integration for clinical concepts
- LOINC codes for laboratory results
- CPT codes for procedures and services
- ICD-10 codes for diagnoses and conditions

### Audit and Provenance
- Complete processing session tracking
- API cost attribution per document
- Processing duration and performance metrics
- Quality metrics (extraction completeness, code accuracy)
- Full traceability from source document to clinical table

### Data Safety
- Profile contamination prevention
- Input validation and sanitization
- Graceful error handling with rollback capability
- Healthcare data privacy and security compliance

---

## Integration Points

### Database Foundation
- Direct integration with [database-foundation-v2](../database-foundation-v2/)
- Populates all clinical tables defined in core schema
- Supports multi-profile access patterns
- Enables healthcare journey visualization

### Frontend Application
- Provides structured data for clinical timeline UI
- Supports smart feature activation
- Enables click-to-zoom document navigation (Phase 2+)
- Multi-profile family healthcare interface

### Provider Portal (Future)
- Structured clinical data for provider access
- Healthcare standards compliance for interoperability
- Complete audit trails for regulatory compliance
- Multi-profile family coordination

---

## Performance and Scalability

### Processing Optimization
- Batch processing for multiple documents
- Parallel extraction for different clinical data types
- Database connection pooling and transaction optimization
- Memory management for large document processing

### Cost Optimization
- GPT-4o Mini for cost-effective LLM processing (~85-90% cost reduction vs previous approaches)
- Intelligent prompt engineering to minimize token usage
- API cost tracking and attribution per processing session
- Configurable processing intensity based on document importance

### Monitoring and Metrics
- Real-time processing performance monitoring
- Quality metrics tracking (extraction accuracy, standards compliance)
- Cost tracking per document and per profile
- Error rate monitoring with alerting

---

## Future Enhancements

### Advanced AI Processing
- Multi-modal document understanding (images, tables, handwriting)
- Relationship inference between clinical entities
- Predictive analytics for health trends
- Clinical decision support integration

### Enhanced Spatial Processing
- Advanced OCR for handwritten notes
- Table and form recognition
- Multi-page document spatial mapping
- Dynamic document layout analysis

### Provider Integration
- Real-time provider portal data synchronization
- Clinical workflow integration
- Provider-specific data views and permissions
- Cross-provider data sharing and coordination

---

*This architecture overview provides the foundation for understanding Guardian's enterprise-grade AI processing system, designed for healthcare compliance, multi-profile safety, and seamless database integration.*