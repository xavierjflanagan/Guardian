# Example Data Flows

**Purpose:** End-to-end examples showing how AI extracts medical facts and populates database tables  
**Audience:** AI processing developers implementing Guardian's clinical extraction pipeline  
**Reference:** [Database Integration Guide](./database-integration-guide.md) | [Table Population Matrix](./table-population-matrix.md)

---

## Overview

This document provides concrete examples of how medical information flows from document text through AI processing components into Guardian's normalized database structure.

---

## Lab Result Flow

### Input Document
```
Patient: Sarah Johnson
Date: July 15, 2024
Provider: Quest Diagnostics

COMPLETE BLOOD COUNT (CBC)
Hemoglobin: 7.2 g/dL (LOW) [Reference: 12.0-16.0 g/dL]
Hematocrit: 21.5% (LOW) [Reference: 36.0-46.0%]
White Blood Cell Count: 8,500/uL (NORMAL) [Reference: 4,000-11,000/uL]

Clinical Notes: Patient reports fatigue and weakness. 
CBC results suggest iron deficiency anemia.
```

### AI Processing Flow

#### Step 1: Profile Classification
```yaml
profile_classifier_input: "Patient: Sarah Johnson"
profile_classifier_output:
  profile_type: "self"
  display_name: "Sarah Johnson"
  confidence_score: 0.89
  reasoning: "First-person healthcare context, adult patient name"
```

**Database Population:**
```sql
INSERT INTO user_profiles (
  account_owner_id, profile_type, display_name, auth_level
) VALUES (
  'user-uuid-123', 'self', 'Sarah Johnson', 'soft'
) ON CONFLICT (account_owner_id, display_name) DO UPDATE SET
  updated_at = NOW();
```

#### Step 2: O3 Clinical Classification
```yaml
o3_classifier_input: "COMPLETE BLOOD COUNT (CBC) - Hemoglobin: 7.2 g/dL (LOW)"
o3_classifier_output:
  activity_type: "observation"
  clinical_purposes: ["diagnostic", "monitoring"]
  event_name: "Complete Blood Count"
  method: "laboratory"
  body_site: null
  snomed_code: "26604007"
  loinc_code: "58410-2"
  confidence_score: 0.95
  reasoning: "Laboratory test gathering diagnostic information"
```

**Database Population:**
```sql
INSERT INTO patient_clinical_events (
  patient_id, activity_type, clinical_purposes, event_name, method,
  snomed_code, loinc_code, event_date, confidence_score, source_document_id
) VALUES (
  'user-uuid-123', 'observation', ARRAY['diagnostic', 'monitoring'],
  'Complete Blood Count', 'laboratory', '26604007', '58410-2',
  '2024-07-15', 0.95, 'doc-uuid-456'
) RETURNING id; -- Returns event-uuid-789
```

#### Step 3: Observation Details Extraction
```yaml
observation_extractor_input: "Hemoglobin: 7.2 g/dL (LOW) [Reference: 12.0-16.0 g/dL]"
observation_extractor_output:
  - observation_type: "lab_result"
    lab_test_name: "Hemoglobin"
    value_numeric: 7.2
    unit: "g/dL"
    value_text: "7.2 g/dL"
    reference_range_low: 12.0
    reference_range_high: 16.0
    interpretation: "low"
    abnormal_flag: true
    confidence_score: 0.92
```

**Database Population:**
```sql
INSERT INTO patient_observations (
  event_id, observation_type, lab_test_name, value_numeric, unit,
  value_text, reference_range_low, reference_range_high, 
  interpretation, abnormal_flag
) VALUES (
  'event-uuid-789', 'lab_result', 'Hemoglobin', 7.2, 'g/dL',
  '7.2 g/dL', 12.0, 16.0, 'low', true
);

-- Additional entries for Hematocrit and WBC...
```

#### Step 4: Timeline Generation
```yaml
timeline_generator_input: 
  clinical_event: "Complete Blood Count"
  observation_details: ["Hemoglobin: 7.2 g/dL (LOW)", "Hematocrit: 21.5% (LOW)"]
  date: "2024-07-15"
  
timeline_generator_output:
  display_category: "test_result"
  display_subcategory: "blood_test"
  title: "Complete Blood Count Results"
  summary: "CBC showing low hemoglobin and hematocrit levels"
  icon: "flask"
  searchable_content: "CBC complete blood count hemoglobin hematocrit anemia low iron deficiency laboratory test"
  event_tags: ["laboratory", "abnormal", "anemia", "monitoring"]
  ui_priority: "high"  # Due to abnormal results
```

**Database Population:**
```sql
INSERT INTO healthcare_timeline_events (
  patient_id, display_category, display_subcategory, title, summary,
  icon, event_date, clinical_event_ids, searchable_content, event_tags, ui_priority
) VALUES (
  'user-uuid-123', 'test_result', 'blood_test', 'Complete Blood Count Results',
  'CBC showing low hemoglobin and hematocrit levels', 'flask', '2024-07-15',
  ARRAY['event-uuid-789'], 
  'CBC complete blood count hemoglobin hematocrit anemia low iron deficiency laboratory test',
  ARRAY['laboratory', 'abnormal', 'anemia', 'monitoring'], 'high'
);
```

#### Step 5: Condition Detection
```yaml
condition_extractor_input: "CBC results suggest iron deficiency anemia"
condition_extractor_output:
  condition_name: "Iron deficiency anemia"
  icd10_code: "D50.9"
  status: "suspected"
  severity: "moderate"
  confidence_score: 0.87
  evidence_text: "CBC results suggest iron deficiency anemia"
```

**Database Population:**
```sql
INSERT INTO patient_conditions (
  patient_id, condition_name, icd10_code, status, severity,
  onset_date, confidence_score, evidence_text
) VALUES (
  'user-uuid-123', 'Iron deficiency anemia', 'D50.9', 'suspected', 'moderate',
  '2024-07-15', 0.87, 'CBC results suggest iron deficiency anemia'
) RETURNING id; -- Returns condition-uuid-101
```

#### Step 6: Smart Feature Detection
```yaml
smart_feature_detector_input:
  conditions: ["Iron deficiency anemia"]
  abnormal_results: ["Hemoglobin: 7.2 g/dL (LOW)"]
  
smart_feature_detector_output:
  feature_type: "anemia_management"
  activation_source: "abnormal_lab_results"
  detection_confidence: 0.91
  trigger_criteria: ["hemoglobin < 12.0", "suspected anemia diagnosis"]
```

**Database Population:**
```sql
INSERT INTO smart_health_features (
  profile_id, feature_type, activation_source, detection_confidence,
  trigger_criteria, activated_at
) VALUES (
  'profile-uuid-sarah', 'anemia_management', 'abnormal_lab_results', 0.91,
  ARRAY['hemoglobin < 12.0', 'suspected anemia diagnosis'], NOW()
);
```

---

## Medication Flow

### Input Document
```
Patient: Michael Chen
Date: August 10, 2024
Provider: Dr. Lisa Park, Internal Medicine

PRESCRIPTION
Medication: Lisinopril 10mg tablets
Instructions: Take 1 tablet by mouth daily
Quantity: #30 tablets (30-day supply)
Refills: 2
Indication: Hypertension management
```

### AI Processing Flow

#### Step 1: Profile Classification
```yaml
profile_classifier_output:
  profile_type: "self"
  display_name: "Michael Chen"
  confidence_score: 0.93
```

#### Step 2: O3 Clinical Classification
```yaml
o3_classifier_output:
  activity_type: "intervention"
  clinical_purposes: ["therapeutic"]
  event_name: "Hypertension Medication Prescription"
  method: "oral"
  snomed_code: "386872004"  # Lisinopril
  confidence_score: 0.96
```

**Database Population:**
```sql
INSERT INTO patient_clinical_events (
  patient_id, activity_type, clinical_purposes, event_name, method,
  snomed_code, event_date, confidence_score
) VALUES (
  'user-michael-123', 'intervention', ARRAY['therapeutic'],
  'Hypertension Medication Prescription', 'oral', '386872004',
  '2024-08-10', 0.96
) RETURNING id; -- Returns event-uuid-999
```

#### Step 3: Intervention Details Extraction
```yaml
intervention_extractor_output:
  intervention_type: "medication_prescription"
  substance_name: "Lisinopril"
  dose_amount: 10
  dose_unit: "mg"
  route: "oral"
  frequency: "daily"
  quantity_prescribed: 30
  refills_allowed: 2
  followup_instructions: "Monitor blood pressure weekly"
  indication: "Hypertension management"
```

**Database Population:**
```sql
INSERT INTO patient_interventions (
  event_id, intervention_type, substance_name, dose_amount, dose_unit,
  route, frequency, quantity_prescribed, refills_allowed,
  followup_instructions, indication
) VALUES (
  'event-uuid-999', 'medication_prescription', 'Lisinopril', 10, 'mg',
  'oral', 'daily', 30, 2, 'Monitor blood pressure weekly',
  'Hypertension management'
);
```

#### Step 4: Timeline Generation
```yaml
timeline_generator_output:
  display_category: "treatment"
  display_subcategory: "medication"
  title: "Lisinopril Prescription"
  summary: "Blood pressure medication prescribed for hypertension"
  icon: "pill"
  searchable_content: "lisinopril blood pressure hypertension ACE inhibitor medication daily"
  event_tags: ["medication", "hypertension", "therapeutic", "ongoing"]
```

#### Step 5: Condition Linking
```yaml
condition_extractor_output:
  condition_name: "Hypertension"
  icd10_code: "I10"
  status: "active"
  treatment_relationship: true  # Links to Lisinopril prescription
```

**Database Population:**
```sql
-- Create relationship between medication and condition
INSERT INTO medical_data_relationships (
  source_table, source_id, target_table, target_id, relationship_type
) VALUES (
  'patient_interventions', 'intervention-lisinopril-id',
  'patient_conditions', 'condition-hypertension-id', 'treats'
);
```

---

## Pediatric Vaccination Flow

### Input Document
```
Patient: Emma Rodriguez (Age: 5 years)
Parent/Guardian: Maria Rodriguez
Date: September 5, 2024
Provider: Sunny Pediatrics

IMMUNIZATION RECORD
Vaccine: MMR (Measles, Mumps, Rubella) - Second Dose
Lot Number: ABC123
Site: Left deltoid muscle
Route: Intramuscular injection
No adverse reactions observed
```

### AI Processing Flow

#### Step 1: Profile Classification
```yaml
profile_classifier_output:
  profile_type: "child"
  display_name: "Emma Rodriguez"
  relationship: "daughter"
  age_context: "5 years"
  parent_name: "Maria Rodriguez"
  confidence_score: 0.94
  reasoning: "Age < 18, pediatric provider, parent/guardian mentioned"
```

**Database Population:**
```sql
INSERT INTO user_profiles (
  account_owner_id, profile_type, display_name, relationship,
  date_of_birth, legal_status
) VALUES (
  'user-maria-123', 'child', 'Emma Rodriguez', 'daughter',
  '2019-09-05'::DATE, 'dependent'  -- Calculated from age 5
);
```

#### Step 2: Smart Feature Detection
```yaml
smart_feature_detector_output:
  feature_type: "pediatric"
  activation_source: "age_and_provider_context"
  detection_confidence: 0.96
  trigger_criteria: ["age < 18", "pediatric provider", "immunization schedule"]
  
additional_features:
  - feature_type: "immunization_tracking"
    activation_confidence: 0.93
    ui_elements: ["vaccination schedule", "next due dates", "school requirements"]
```

#### Step 3: O3 Clinical Classification
```yaml
o3_classifier_output:
  activity_type: "intervention"
  clinical_purposes: ["preventive"]
  event_name: "MMR Vaccination (Second Dose)"
  method: "injection"
  body_site: "left_deltoid"
  snomed_code: "432636005"  # MMR vaccine
  cpt_code: "90707"         # MMR vaccine administration
  confidence_score: 0.98
```

#### Step 4: Intervention Details
```yaml
intervention_extractor_output:
  intervention_type: "vaccination"
  substance_name: "MMR Vaccine"
  vaccine_components: ["Measles", "Mumps", "Rubella"]
  dose_number: 2
  route: "intramuscular"
  anatomical_site: "left_deltoid"
  lot_number: "ABC123"
  adverse_reactions: "None observed"
  provider_name: "Sunny Pediatrics"
```

#### Step 5: Timeline Generation
```yaml
timeline_generator_output:
  display_category: "vaccination"
  display_subcategory: "routine_immunization"
  title: "MMR Vaccination (2nd Dose)"
  summary: "Routine immunization against measles, mumps, and rubella"
  icon: "shield"
  age_appropriate_language: true  # For pediatric profile
  searchable_content: "MMR vaccination measles mumps rubella immunization school required second dose"
  event_tags: ["vaccination", "preventive", "pediatric", "school_required"]
```

---

## Veterinary Pet Flow

### Input Document
```
Patient: Max (Golden Retriever, Male, 3 years old)
Owner: David Kim
Date: October 12, 2024
Clinic: Happy Paws Veterinary

ANNUAL WELLNESS EXAM
Weight: 65 lbs (Normal for breed/age)
Vaccinations Updated: Rabies, DHPP
Heartworm Test: Negative
Flea/Tick Prevention: Applied Frontline

Recommendations: Continue current diet, increase exercise
Next Visit: 12 months
```

### AI Processing Flow

#### Step 1: Profile Classification
```yaml
profile_classifier_output:
  profile_type: "pet"
  display_name: "Max"
  species: "dog"
  breed: "Golden Retriever"
  relationship: "dog"
  age_context: "3 years"
  owner_name: "David Kim"
  confidence_score: 0.97
  reasoning: "Animal species, veterinary clinic, owner mentioned"
```

**Database Population:**
```sql
INSERT INTO user_profiles (
  account_owner_id, profile_type, display_name, species, breed,
  relationship, date_of_birth, legal_status
) VALUES (
  'user-david-123', 'pet', 'Max', 'dog', 'Golden Retriever',
  'dog', '2021-10-12'::DATE, 'owner'
);
```

#### Step 2: Smart Feature Detection
```yaml
smart_feature_detector_output:
  feature_type: "veterinary"
  activation_source: "pet_species_and_clinic"
  detection_confidence: 0.98
  trigger_criteria: ["animal species detected", "veterinary provider"]
  
  ui_customizations:
    - "veterinary appointment scheduling"
    - "pet medication tracking"
    - "vaccination schedule for dogs"
    - "breed-specific health information"
```

#### Step 3: Multiple Clinical Events
```yaml
# Vaccination Events
o3_classifier_outputs:
  - activity_type: "intervention"
    clinical_purposes: ["preventive"]
    event_name: "Rabies Vaccination"
    method: "injection"
    snomed_code: "396429000"  # Rabies vaccine for dogs
    
  - activity_type: "intervention"
    clinical_purposes: ["preventive"]
    event_name: "DHPP Vaccination"
    method: "injection"
    
  # Wellness Exam
  - activity_type: "observation"
    clinical_purposes: ["screening", "monitoring"]
    event_name: "Annual Wellness Examination"
    method: "physical_exam"
```

#### Step 4: Observation Details (Weight Check)
```yaml
observation_extractor_output:
  observation_type: "body_measurement"
  measurement_type: "weight"
  value_numeric: 65
  unit: "lbs"
  interpretation: "normal"
  reference_context: "Normal for Golden Retriever, age 3"
  veterinary_context: true
```

#### Step 5: Timeline Generation (Veterinary Specific)
```yaml
timeline_generator_output:
  display_category: "vet_visit"
  display_subcategory: "annual_wellness"
  title: "Annual Wellness Exam"
  summary: "Routine health checkup with vaccinations updated"
  icon: "veterinary"
  pet_specific_language: true
  searchable_content: "annual wellness exam rabies DHPP vaccination weight check golden retriever vet visit"
  event_tags: ["veterinary", "wellness", "vaccination", "preventive"]
  next_visit_reminder: "2025-10-12"
```

---

## Multi-Profile Family Coordination Flow

### Input Document
```
Family Medical Summary - Johnson Family
Date: November 20, 2024
Provider: Dr. Sarah Williams, Family Medicine

PATIENTS SEEN TODAY:
1. Robert Johnson (Father, Age 45) - Annual physical, blood pressure check
2. Lisa Johnson (Mother, Age 42) - Follow-up for diabetes management  
3. Sophie Johnson (Daughter, Age 8) - School physical, growth assessment

COORDINATED CARE NOTES:
Family history of diabetes noted for all members
Recommended lifestyle changes for entire family
Next family appointment: 6 months
```

### AI Processing Flow

#### Step 1: Multi-Profile Classification
```yaml
profile_classifier_outputs:
  - profile_type: "self"
    display_name: "Robert Johnson"
    relationship: "account_owner"
    confidence_score: 0.91
    
  - profile_type: "self"  # Could be spouse with shared account
    display_name: "Lisa Johnson"
    relationship: "spouse"
    confidence_score: 0.89
    
  - profile_type: "child"
    display_name: "Sophie Johnson"
    relationship: "daughter"
    age_context: "8 years"
    confidence_score: 0.95
```

#### Step 2: Profile-Specific Clinical Events
```yaml
# Robert's Events
robert_events:
  - activity_type: "observation"
    clinical_purposes: ["screening", "monitoring"]
    event_name: "Annual Physical Examination"
    patient_profile: "Robert Johnson"
    
  - activity_type: "observation"
    clinical_purposes: ["monitoring"]
    event_name: "Blood Pressure Assessment"
    patient_profile: "Robert Johnson"

# Lisa's Events  
lisa_events:
  - activity_type: "observation"
    clinical_purposes: ["monitoring", "therapeutic"]
    event_name: "Diabetes Follow-up"
    patient_profile: "Lisa Johnson"
    
# Sophie's Events
sophie_events:
  - activity_type: "observation"
    clinical_purposes: ["screening"]
    event_name: "School Physical Examination"
    patient_profile: "Sophie Johnson"
    
  - activity_type: "observation"
    clinical_purposes: ["screening", "monitoring"]
    event_name: "Pediatric Growth Assessment"
    patient_profile: "Sophie Johnson"
```

#### Step 3: Family Healthcare Encounter
```yaml
encounter_extractor_output:
  encounter_type: "family_visit"
  encounter_date: "2024-11-20"
  provider_name: "Dr. Sarah Williams"
  specialty: "Family Medicine"
  
  participating_profiles:
    - "Robert Johnson"
    - "Lisa Johnson" 
    - "Sophie Johnson"
    
  coordinated_care_notes: "Family history of diabetes noted for all members"
  family_recommendations: "Recommended lifestyle changes for entire family"
  next_family_visit: "2025-05-20"
```

**Database Population:**
```sql
INSERT INTO healthcare_encounters (
  encounter_id, encounter_type, encounter_date, provider_name, specialty,
  participating_patients, coordinated_care_notes, next_visit_date
) VALUES (
  gen_random_uuid(), 'family_visit', '2024-11-20', 'Dr. Sarah Williams', 'Family Medicine',
  ARRAY['robert-profile-id', 'lisa-profile-id', 'sophie-profile-id'],
  'Family history of diabetes noted for all members', '2025-05-20'
);
```

#### Step 4: Family-Coordinated Timeline Events
```yaml
timeline_events:
  # Individual events for each family member
  robert_timeline:
    display_category: "visit"
    title: "Annual Physical with Family"
    family_context: true
    
  lisa_timeline:
    display_category: "visit"
    title: "Diabetes Follow-up (Family Visit)"
    family_context: true
    
  sophie_timeline:
    display_category: "visit"
    title: "School Physical (Family Visit)"
    family_context: true
    pediatric_language: true
    
  # Shared family event
  family_timeline:
    display_category: "family_visit"
    title: "Johnson Family Healthcare Visit"
    summary: "Coordinated family care with Dr. Williams"
    family_members: ["Robert", "Lisa", "Sophie"]
    searchable_content: "family visit johnson family medicine coordinated care diabetes lifestyle"
```

---

## Performance Considerations

### Batch Processing Optimizations
```sql
-- Process multiple related events in single transaction
BEGIN;

-- Insert all clinical events for a document
INSERT INTO patient_clinical_events (patient_id, activity_type, ...) 
VALUES 
  ('patient-1', 'observation', ...),
  ('patient-1', 'intervention', ...);

-- Insert all observation details
INSERT INTO patient_observations (event_id, observation_type, ...)
VALUES 
  ('event-1', 'lab_result', ...),
  ('event-2', 'vital_sign', ...);

-- Generate timeline events
INSERT INTO healthcare_timeline_events (patient_id, display_category, ...)
VALUES 
  ('patient-1', 'test_result', ...),
  ('patient-1', 'treatment', ...);

COMMIT;
```

### Error Recovery Patterns
```yaml
error_recovery:
  partial_extraction_failure:
    strategy: "Save successful extractions, queue failed portions for retry"
    implementation: "Use savepoints within transactions"
    
  low_confidence_threshold:
    strategy: "Insert with requires_review=true flag"
    implementation: "Manual review queue for human validation"
    
  database_constraint_violation:
    strategy: "Log detailed error, skip problematic record, continue processing"
    implementation: "Graceful degradation with audit trail"
```

---

*These examples demonstrate the complete flow from medical document text through AI processing components into Guardian's normalized database structure, ensuring data integrity while enabling powerful healthcare features.*