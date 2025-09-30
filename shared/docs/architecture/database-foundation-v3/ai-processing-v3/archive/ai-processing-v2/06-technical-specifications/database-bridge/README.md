# Database Bridge Documentation

**Purpose:** Technical specifications for how AI processing components interface with Guardian's database foundation  
**Audience:** Developers implementing AI extraction and normalization components  
**Reference:** [database-foundation](../../../database-foundation/)

---

## Bridge Overview

This bridge documentation provides the technical contracts between AI processing components and the database tables they must populate. Each document focuses on a specific table or table group, providing:

- Exact field mappings from AI output to database fields
- SQL insertion patterns and transaction management
- Validation rules and data quality requirements  
- Error handling and rollback strategies
- Performance optimization guidelines

---

## Bridge Documents

### Core Clinical Tables
- **[patient_clinical_events.md](./patient_clinical_events.md)** - O3's two-axis classification implementation
- **[patient_observations.md](./patient_observations.md)** - Observation details (labs, vitals, assessments)  
- **[patient_interventions.md](./patient_interventions.md)** - Intervention details (meds, procedures)
- **[patient_conditions.md](./patient_conditions.md)** - Diagnosis and condition extraction
- **[patient_allergies.md](./patient_allergies.md)** - Allergy extraction (safety critical)

### User Experience Tables
- **[user_profiles.md](./user_profiles.md)** - Multi-profile classification and management
- **[healthcare_timeline_events.md](./healthcare_timeline_events.md)** - Timeline metadata generation
- **[smart_health_features.md](./smart_health_features.md)** - Feature activation detection

### Provenance & Compliance  
- **[clinical_fact_sources.md](./clinical_fact_sources.md)** - Spatial provenance and fact linking
- **[ai_processing_sessions.md](./ai_processing_sessions.md)** - Session tracking and compliance
- **[medical_data_relationships.md](./medical_data_relationships.md)** - Relationship detection

---

## Key Integration Principles

### 1. Database-First Design
AI components are designed to populate existing, well-architected database tables. The database schema is the contract that drives AI extraction requirements.

### 2. Transactional Integrity  
All related data is inserted within database transactions to ensure consistency. Failed extractions rollback completely rather than leaving partial data.

### 3. Validation at Multiple Levels
```yaml
validation_layers:
  ai_output_validation:
    - Check required fields exist
    - Validate data types and ranges
    - Ensure confidence thresholds met
    
  database_constraint_validation:
    - Foreign key constraints enforced
    - Check constraints validated
    - Unique constraints respected
    
  business_rule_validation:
    - Profile contamination prevention
    - Clinical safety rules applied
    - Timeline consistency maintained
```

### 4. Complete Provenance Tracking
Every extracted fact must be traceable to its source document with confidence scores and extraction metadata.

### 5. Healthcare Safety Requirements
```yaml
safety_critical_tables:
  patient_allergies:
    min_confidence: 0.9
    manual_review_required: true
    safety_flags: always_enabled
    
  patient_interventions:
    medication_validation: therapeutic_range_check
    dosage_verification: required
    contraindication_check: enabled
```

---

## Common Patterns

### Standard Insert Pattern
```sql
-- 1. Validate AI output
-- 2. Begin transaction
-- 3. Insert parent record (get ID)
-- 4. Insert child records (use parent ID)
-- 5. Update provenance tracking
-- 6. Commit transaction
```

### Error Handling Pattern
```sql
BEGIN;
  -- AI processing inserts
EXCEPTION 
  WHEN constraint_violation THEN
    ROLLBACK;
    LOG ERROR WITH context;
    RETURN error_response;
  WHEN data_quality_failure THEN
    ROLLBACK;
    QUEUE FOR manual_review;
    RETURN review_required;
COMMIT;
```

### Confidence Scoring Pattern
```yaml
confidence_levels:
  high_confidence: >= 0.9
    action: auto_insert
    
  medium_confidence: 0.7 - 0.89
    action: insert_with_review_flag
    
  low_confidence: 0.5 - 0.69
    action: queue_for_manual_review
    
  very_low_confidence: < 0.5
    action: reject_extraction
```

---

## Development Workflow

### 1. Study Database Schema
Before implementing any AI component, thoroughly review the target database table schema in [database-foundation](../../../database-foundation/).

### 2. Review Bridge Document
Read the specific bridge document for your target table to understand exact requirements and constraints.

### 3. Implement with Validation
Build AI component with built-in validation that checks outputs before database insertion.

### 4. Test with Real Data
Test with actual medical documents to ensure realistic data flows correctly through the pipeline.

### 5. Monitor Quality Metrics
Track extraction quality and database population success rates in production.

---

## Quality Metrics

### Extraction Quality
```yaml
success_metrics:
  extraction_completeness: 
    target: "> 85% of medical facts extracted"
    measurement: facts_extracted / facts_available
    
  classification_accuracy:
    target: "> 90% correct O3 classification"
    measurement: manual_validation_sample
    
  clinical_coding_coverage:
    target: "> 80% facts have SNOMED/LOINC/CPT codes"
    measurement: facts_with_codes / total_facts
```

### Database Integration Quality
```yaml
integration_metrics:
  successful_insertions:
    target: "> 95% extractions successfully stored"
    measurement: successful_db_inserts / attempted_inserts
    
  data_consistency:
    target: "100% referential integrity maintained"
    measurement: foreign_key_violations = 0
    
  timeline_completeness:
    target: "100% clinical events generate timeline events"
    measurement: timeline_events / clinical_events
```

---

## Troubleshooting Guide

### Common Issues

#### Foreign Key Violations
```yaml
symptom: "INSERT violates foreign key constraint"
cause: "Referenced record doesn't exist"
solution: 
  - Check transaction order
  - Verify parent record creation
  - Review referential integrity
```

#### Confidence Score Issues
```yaml
symptom: "Extraction confidence too low"
cause: "AI model uncertainty"
solution:
  - Review prompt engineering
  - Check document quality
  - Adjust confidence thresholds
```

#### Profile Contamination
```yaml
symptom: "Data assigned to wrong profile"
cause: "Profile classification error"
solution:
  - Improve profile detection
  - Add contamination checks
  - Implement user confirmation
```

### Diagnostic Queries
```sql
-- Check extraction completeness
SELECT 
  COUNT(*) as total_extractions,
  COUNT(*) FILTER (WHERE confidence_score >= 0.8) as high_confidence,
  COUNT(*) FILTER (WHERE snomed_code IS NOT NULL) as with_snomed_codes
FROM patient_clinical_events 
WHERE created_at >= NOW() - INTERVAL '1 day';

-- Check timeline generation
SELECT 
  ce.id,
  ce.event_name,
  te.title IS NOT NULL as has_timeline_event
FROM patient_clinical_events ce
LEFT JOIN healthcare_timeline_events te ON ce.id = ANY(te.clinical_event_ids)
WHERE ce.created_at >= NOW() - INTERVAL '1 day';
```

---

*These bridge documents ensure that AI processing components integrate seamlessly with Guardian's database foundation, maintaining data integrity while enabling powerful healthcare functionality.*