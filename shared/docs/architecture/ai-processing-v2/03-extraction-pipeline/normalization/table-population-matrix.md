# Database Table Population Matrix

**Purpose:** Map each AI processing component to the database tables it populates  
**Reference:** [database-foundation schemas](../../../database-foundation/implementation/sql/)  
**Status:** Implementation Guide

---

## Core Clinical Tables

### patient_clinical_events
- **AI Component**: o3-classifier
- **Population Strategy**: Two-axis classification (activity_type × clinical_purposes)
- **Required Fields**: activity_type, clinical_purposes[], event_name
- **Optional Fields**: method, body_site, snomed_code, loinc_code, cpt_code
- **Confidence Required**: 0.9+ for core fields, 0.7+ for optional
- **Dependencies**: Must classify EVERY medical fact
- **SQL Reference**: [005_clinical_events_core.sql](../../../database-foundation/implementation/sql/005_clinical_events_core.sql)

### patient_observations
- **AI Component**: observation-details-extractor
- **Population Strategy**: Extract detailed measurements and values
- **Required Fields**: event_id, observation_type, value_text
- **Optional Fields**: value_numeric, unit, reference_range_low/high, interpretation
- **Confidence Required**: 0.8+ for values, 0.7+ for interpretations
- **Dependencies**: Requires parent patient_clinical_events record
- **Triggers**: Only for activity_type='observation'

### patient_interventions  
- **AI Component**: intervention-details-extractor
- **Population Strategy**: Extract substance, dosage, and technique details
- **Required Fields**: event_id, intervention_type
- **Optional Fields**: substance_name, dose_amount, dose_unit, route, technique
- **Confidence Required**: 0.9+ for medications, 0.8+ for procedures
- **Dependencies**: Requires parent patient_clinical_events record
- **Triggers**: Only for activity_type='intervention'

### patient_conditions
- **AI Component**: condition-extractor
- **Population Strategy**: Extract diagnoses and ongoing conditions
- **Required Fields**: patient_id, condition_name, status
- **Optional Fields**: icd10_code, severity, onset_date, resolution_date
- **Confidence Required**: 0.85+ for diagnosis names
- **Dependencies**: None (can be populated directly)
- **Special**: Links to clinical events via medical_data_relationships

### patient_allergies
- **AI Component**: allergy-extractor  
- **Population Strategy**: Extract allergies, sensitivities, and reactions
- **Required Fields**: patient_id, allergen, severity
- **Optional Fields**: reaction_type, onset_date, verified_date
- **Confidence Required**: 0.9+ (safety critical)
- **Dependencies**: None (safety critical - populate directly)
- **Special**: Flags for review if confidence < 0.95

---

## Multi-Profile Tables

### user_profiles
- **AI Component**: profile-classifier
- **Population Strategy**: Detect document owner from content analysis
- **Required Fields**: profile_type (self/child/adult_dependent/pet)
- **Optional Fields**: relationship, species (for pets), date_of_birth
- **Confidence Required**: 0.8+ for profile assignment
- **Dependencies**: Must prevent cross-profile contamination
- **Safety**: Critical for data integrity

### smart_health_features
- **AI Component**: smart-feature-detector
- **Population Strategy**: Detect contexts that trigger UI features
- **Required Fields**: profile_id, feature_type
- **Detection Triggers**:
  - pregnancy: Pregnancy tests, prenatal visits, obstetric care
  - family_planning: Fertility tests, contraception, IVF
  - pediatric: Age < 18, pediatric providers, growth charts
  - adult_care: Elderly care, disability support, caregiver notes
  - veterinary: Animal species, vet clinics, pet medications
- **Confidence Required**: 0.85+ for feature activation
- **Dependencies**: Requires valid user_profiles record

---

## Timeline & Journey Tables

### healthcare_timeline_events
- **AI Component**: timeline-generator
- **Population Strategy**: Generate timeline metadata for every clinical event
- **Required Fields**: patient_id, display_category, title, event_date
- **Generated Fields**: 
  - display_category: visit/test_result/treatment/vaccination/screening
  - display_subcategory: annual_physical/blood_test/minor_procedure
  - title: "Blood Pressure Check", "Flu Vaccination"
  - summary: Brief patient-friendly description
  - icon: UI icon identifier
  - searchable_content: For AI chatbot queries
  - event_tags[]: For filtering and search
- **Confidence Required**: 0.8+ for categorization
- **Dependencies**: Requires patient_clinical_events record
- **Trigger**: Auto-generated for EVERY clinical event

### healthcare_encounters
- **AI Component**: encounter-extractor
- **Population Strategy**: Group clinical events by healthcare visit
- **Required Fields**: patient_id, encounter_type, encounter_date
- **Optional Fields**: provider_name, facility_name, specialty
- **Detection Strategy**: Group events by date, provider, facility
- **Confidence Required**: 0.7+ for grouping
- **Dependencies**: Clinical events must exist first

---

## Provenance & Tracking Tables

### clinical_fact_sources  
- **AI Component**: spatial-fusion (Phase 2+)
- **Population Strategy**: Link every fact to document regions
- **Required Fields**: fact_table, fact_id, document_id
- **Phase 1**: source_text, extraction_method, confidence_score
- **Phase 2+**: page_number, bounding_box (PostGIS GEOMETRY)
- **Confidence Required**: 0.8+ for text alignment
- **Dependencies**: Must link to every clinical table record
- **Critical**: Required for click-to-zoom functionality

### ai_processing_sessions
- **AI Component**: session-tracker
- **Population Strategy**: Track every processing session
- **Required Fields**: document_id, user_id, processing_pipeline
- **Tracked Data**:
  - processing_pipeline: {"ocr": "google_vision", "llm": "gpt-4o-mini"}
  - api_costs_usd: Cost attribution per session
  - processing_duration_ms: Performance tracking
  - quality_metrics: Extraction completeness scores
  - confidence_scores: Per-extraction confidence breakdown
- **Compliance**: Required for healthcare audit trails
- **Dependencies**: Created for EVERY document processing

### medical_data_relationships
- **AI Component**: relationship-detector
- **Population Strategy**: Detect relationships between clinical entities
- **Required Fields**: source_table, source_id, target_table, target_id, relationship_type
- **Common Relationships**:
  - medication → condition ("treats")
  - lab_result → condition ("monitors") 
  - procedure → condition ("treats")
  - allergy → medication ("contraindication")
- **Confidence Required**: 0.8+ for relationship detection
- **Dependencies**: Source and target records must exist

---

## Population Flow Order

### Phase 1: Foundation Data
1. **user_profiles** ← profile-classifier
2. **ai_processing_sessions** ← session-tracker (start)
3. **patient_clinical_events** ← o3-classifier (CRITICAL BLOCKER)

### Phase 2: Clinical Details  
4. **patient_observations** ← observation-details-extractor
5. **patient_interventions** ← intervention-details-extractor
6. **patient_conditions** ← condition-extractor
7. **patient_allergies** ← allergy-extractor

### Phase 3: Experience Layer
8. **healthcare_timeline_events** ← timeline-generator
9. **smart_health_features** ← smart-feature-detector
10. **healthcare_encounters** ← encounter-extractor

### Phase 4: Relationships & Provenance
11. **medical_data_relationships** ← relationship-detector
12. **clinical_fact_sources** ← spatial-fusion
13. **ai_processing_sessions** ← session-tracker (complete)

---

## Validation Rules

### Data Integrity
- Every patient_clinical_events record MUST have corresponding observation OR intervention details
- Every clinical fact MUST have provenance in clinical_fact_sources
- Profile classification MUST prevent cross-contamination
- Timeline events MUST be generated for every clinical event

### Safety Rules
- Allergies require 0.9+ confidence (safety critical)
- Medication dosages require validation against therapeutic ranges
- Profile assignments require confirmation for low confidence

### Completeness Requirements
- At least 80% of clinical facts should have SNOMED/LOINC/CPT codes
- Every processing session must track API costs and duration
- Every document should generate at least one timeline event

---

*This matrix ensures that every piece of medical information extracted by AI is correctly stored in Guardian's normalized database structure, maintaining data integrity while enabling powerful clinical decision support and patient experience features.*