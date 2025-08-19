# Database Integration Guide

**Purpose:** Complete guide for how AI processing populates Guardian's database foundation  
**Audience:** Developers implementing AI extraction components  
**Reference:** [database-foundation](../../../database-foundation/)

---

## Overview

This guide shows exactly how AI-extracted medical data flows into Guardian's normalized database structure. Every AI component must understand which tables to populate and in what order.

---

## End-to-End Data Flow Examples

### Example 1: Lab Result Document

**Input Document:** "Complete Blood Count - Hemoglobin: 7.2 g/dL (Low)"

#### Step 1: Profile Classification
```yaml
profile_classifier_output:
  profile_type: "self"
  confidence: 0.95
  
database_record:
  table: user_profiles
  action: update_or_create
  fields:
    profile_type: "self"
    auth_level: "soft"  # if first document
```

#### Step 2: Clinical Event Classification  
```yaml
o3_classifier_output:
  activity_type: "observation"
  clinical_purposes: ["diagnostic", "monitoring"]
  event_name: "Complete Blood Count"
  method: "laboratory"
  snomed_code: "26604007"
  loinc_code: "58410-2"
  
database_record:
  table: patient_clinical_events
  fields:
    id: "uuid-generated"
    patient_id: "user-id"
    activity_type: "observation"
    clinical_purposes: ["diagnostic", "monitoring"]
    event_name: "Complete Blood Count"
    method: "laboratory"
    snomed_code: "26604007"
    loinc_code: "58410-2"
    confidence_score: 0.92
```

#### Step 3: Observation Details
```yaml
observation_extractor_output:
  observation_type: "lab_result"
  value_numeric: 7.2
  unit: "g/dL"
  reference_range_low: 12.0
  reference_range_high: 16.0
  interpretation: "low"
  
database_record:
  table: patient_observations
  fields:
    event_id: "uuid-from-step-2"
    observation_type: "lab_result"
    value_text: "7.2 g/dL"
    value_numeric: 7.2
    unit: "g/dL"
    reference_range_low: 12.0
    reference_range_high: 16.0
    interpretation: "low"
```

#### Step 4: Timeline Generation
```yaml
timeline_generator_output:
  display_category: "test_result"
  display_subcategory: "blood_test"
  title: "Complete Blood Count Results"
  summary: "Hemoglobin level below normal range"
  icon: "flask"
  searchable_content: "CBC complete blood count hemoglobin anemia low"
  event_tags: ["laboratory", "abnormal", "monitoring"]
  
database_record:
  table: healthcare_timeline_events
  fields:
    patient_id: "user-id"
    display_category: "test_result"
    display_subcategory: "blood_test"
    title: "Complete Blood Count Results"
    summary: "Hemoglobin level below normal range"
    icon: "flask"
    event_date: "2024-07-15"
    clinical_event_ids: ["uuid-from-step-2"]
    searchable_content: "CBC complete blood count hemoglobin anemia low"
    event_tags: ["laboratory", "abnormal", "monitoring"]
```

#### Step 5: Session Tracking
```yaml
session_tracker_output:
  processing_pipeline:
    llm: 
      service: "openai"
      model: "gpt-4o-mini"
      version: "2024-07-18"
  api_costs_usd: 0.85
  processing_duration_ms: 14800
  quality_metrics:
    total_facts_extracted: 1
    facts_with_clinical_codes: 1
    extraction_completeness: 0.95
    
database_record:
  table: ai_processing_sessions
  fields:
    document_id: "document-uuid"
    user_id: "user-id"
    processing_pipeline: # JSON above
    api_costs_usd: 0.85
    processing_duration_ms: 14800
    quality_metrics: # JSON above
```

---

### Example 2: Prescription Document 

**Input Document:** "Rx: Amoxicillin 500mg capsules, take 1 capsule by mouth three times daily for 7 days"

#### Step 1: Profile Classification
```yaml
# Same as Example 1 - profile_type: "self"
```

#### Step 2: Clinical Event Classification
```yaml
o3_classifier_output:
  activity_type: "intervention"
  clinical_purposes: ["therapeutic"]
  event_name: "Antibiotic Prescription"
  method: "oral"
  snomed_code: "27658006"  # Amoxicillin
  cpt_code: "99213"        # Office visit with prescription
  
database_record:
  table: patient_clinical_events
  # Similar to Example 1 but activity_type: "intervention"
```

#### Step 3: Intervention Details
```yaml
intervention_extractor_output:
  intervention_type: "medication_admin"
  substance_name: "Amoxicillin"
  dose_amount: 500
  dose_unit: "mg"
  route: "oral"
  followup_instructions: "Take with food, complete full course"
  
database_record:
  table: patient_interventions
  fields:
    event_id: "uuid-from-step-2"
    intervention_type: "medication_admin"
    substance_name: "Amoxicillin"
    dose_amount: 500
    dose_unit: "mg"
    route: "oral"
    followup_instructions: "Take with food, complete full course"
```

#### Step 4: Timeline Generation
```yaml
timeline_generator_output:
  display_category: "treatment"
  display_subcategory: "medication"
  title: "Antibiotic Prescription"
  summary: "Amoxicillin 500mg for bacterial infection"
  icon: "pill"
  event_tags: ["medication", "antibiotic", "therapeutic"]
```

---

### Example 3: Multi-Profile Veterinary Document

**Input Document:** "Bella (Golden Retriever) - Annual vaccination: Rabies vaccine administered"

#### Step 1: Profile Classification
```yaml
profile_classifier_output:
  profile_type: "pet"
  species: "dog"
  breed: "Golden Retriever"
  display_name: "Bella"
  confidence: 0.92
  
database_record:
  table: user_profiles
  action: create_or_update
  fields:
    profile_type: "pet"
    species: "dog" 
    breed: "Golden Retriever"
    display_name: "Bella"
    relationship: "dog"
    legal_status: "owner"
```

#### Step 2: Smart Feature Detection
```yaml
smart_feature_detector_output:
  feature_type: "veterinary"
  activation_confidence: 0.95
  detection_reason: "Pet species and veterinary provider detected"
  
database_record:
  table: smart_health_features
  fields:
    profile_id: "bella-profile-uuid"
    feature_type: "veterinary"
    activation_source: "document_content"
    detection_confidence: 0.95
```

#### Step 3: Clinical Event (Veterinary)
```yaml
o3_classifier_output:
  activity_type: "intervention"
  clinical_purposes: ["preventive"]
  event_name: "Rabies Vaccination"
  method: "injection"
  # Note: Veterinary codes different from human healthcare
  
database_record:
  table: patient_clinical_events
  fields:
    patient_id: "user-id"  # Owner's ID
    # Note: Links to Bella's profile via timeline
    activity_type: "intervention" 
    clinical_purposes: ["preventive"]
    event_name: "Rabies Vaccination"
    method: "injection"
```

---

## Database Transaction Patterns

### Safe Multi-Table Updates
```sql
BEGIN;

-- 1. Create or update profile
INSERT INTO user_profiles (profile_type, display_name) 
VALUES ('self', 'John Smith')
ON CONFLICT (account_owner_id, display_name) DO UPDATE SET
  profile_type = EXCLUDED.profile_type;

-- 2. Create clinical event
INSERT INTO patient_clinical_events (
  patient_id, activity_type, clinical_purposes, event_name
) VALUES (
  auth.uid(), 'observation', ARRAY['diagnostic'], 'Blood Pressure Check'
) RETURNING id INTO clinical_event_id;

-- 3. Create observation details
INSERT INTO patient_observations (
  event_id, observation_type, value_numeric, unit
) VALUES (
  clinical_event_id, 'vital_sign', 120, 'mmHg'
);

-- 4. Create timeline event
INSERT INTO healthcare_timeline_events (
  patient_id, display_category, title, clinical_event_ids
) VALUES (
  auth.uid(), 'vital_sign', 'Blood Pressure Check', ARRAY[clinical_event_id]
);

COMMIT;
```

### Error Handling Strategy
```sql
-- If any step fails, rollback entire transaction
-- Log specific failure point for debugging
-- Ensure partial data doesn't corrupt database
```

---

## Validation & Quality Checks

### Pre-Insert Validation
```yaml
validation_rules:
  patient_clinical_events:
    - activity_type must be 'observation' OR 'intervention'
    - clinical_purposes array must not be empty
    - event_name must be descriptive (not generic)
    - confidence_score must be >= 0.5
    
  patient_observations:
    - requires parent clinical event with activity_type='observation'
    - value_numeric must have valid unit if present
    - interpretation must match value vs reference range
    
  patient_interventions:
    - requires parent clinical event with activity_type='intervention'
    - medication doses must be within therapeutic ranges
    - route must be valid (oral, injection, topical, etc.)
```

### Post-Insert Validation
```yaml
completeness_checks:
  timeline_generation:
    - every clinical event must generate timeline event
    - timeline categories must be consistent
    - searchable content must be meaningful
    
  provenance_tracking:
    - every fact must link to clinical_fact_sources
    - document relationships must be maintained
    - confidence scores must be preserved
```

---

## Performance Considerations

### Batch Processing
```yaml
optimization_strategies:
  bulk_inserts:
    - Process multiple facts in single transaction
    - Use COPY commands for large datasets
    - Batch timeline generation
    
  index_usage:
    - Ensure queries use patient_id indexes
    - Use GIN indexes for array fields
    - Optimize timeline queries with composite indexes
```

### Memory Management
```yaml
memory_optimization:
  large_documents:
    - Process in chunks to avoid memory issues
    - Stream results to database
    - Clean up intermediate objects
    
  concurrent_processing:
    - Use database connection pooling
    - Limit concurrent transactions
    - Monitor database load
```

---

## Testing & Validation

### Unit Testing
```yaml
test_requirements:
  table_population:
    - Test each AI component writes to correct tables
    - Verify all required fields are populated
    - Check foreign key relationships are valid
    
  data_integrity:
    - Test profile contamination prevention
    - Verify clinical event classification accuracy
    - Check timeline consistency
```

### Integration Testing
```yaml
end_to_end_testing:
  complete_flows:
    - Test full document → database flow
    - Verify all tables populated correctly
    - Check UI can display results
    
  edge_cases:
    - Test low confidence extractions
    - Handle malformed input gracefully
    - Verify error recovery
```

---

*This guide ensures that developers understand exactly how their AI components integrate with Guardian's database foundation, maintaining data integrity while populating the normalized clinical structure required for healthcare-grade functionality.*