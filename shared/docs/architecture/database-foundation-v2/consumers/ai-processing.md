# AI Processing Consumer Guide

**Purpose:** Database integration guide for AI processing components  
**Target:** AI developers implementing Guardian's clinical extraction pipeline  
**Reference:** [AI Processing v2](../../ai-processing-v2/)

---

## Overview

This guide maps Guardian's AI processing components to their corresponding database tables, providing clear integration points for the clinical data extraction pipeline.

## AI Component → Database Mapping

### Core Classification Components

```yaml
profile_classifier:
  database_tables: ["user_profiles"]
  purpose: "Detect profile type from documents (self/child/adult_dependent/pet)"
  confidence_threshold: 0.85
  reference: "../ai-processing-v2/06-technical-specifications/database-bridge/user_profiles.md"

o3_classifier:
  database_tables: ["patient_clinical_events"]
  purpose: "Two-axis classification (observation/intervention + clinical purposes)"
  confidence_threshold: 0.7
  reference: "../ai-processing-v2/06-technical-specifications/database-bridge/patient_clinical_events.md"
```

### Extraction Components

```yaml
observation_extractor:
  database_tables: ["patient_clinical_events", "patient_observations"]
  purpose: "Extract lab results, vital signs, assessments"
  triggers_after: "o3_classifier identifies activity_type='observation'"
  reference: "../ai-processing-v2/06-technical-specifications/database-bridge/patient_observations.md"

intervention_extractor:
  database_tables: ["patient_clinical_events", "patient_interventions"]
  purpose: "Extract medications, procedures, treatments"
  triggers_after: "o3_classifier identifies activity_type='intervention'"
  reference: "../ai-processing-v2/06-technical-specifications/database-bridge/patient_interventions.md"
```

### Timeline & Experience Components

```yaml
timeline_generator:
  database_tables: ["healthcare_timeline_events", "patient_clinical_events"]
  purpose: "Generate patient-friendly timeline from clinical events"
  depends_on: ["o3_classifier", "observation_extractor", "intervention_extractor"]
  reference: "../ai-processing-v2/06-technical-specifications/database-bridge/healthcare_timeline_events.md"

smart_feature_detector:
  database_tables: ["smart_health_features", "user_profiles"]
  purpose: "Detect contexts that trigger specialized UI features"
  examples: ["pregnancy", "pediatric", "veterinary", "chronic_disease"]
  reference: "../ai-processing-v2/06-technical-specifications/database-bridge/smart_health_features.md"
```

### Provenance & Audit Components

```yaml
spatial_fusion:
  database_tables: ["clinical_fact_sources", "patient_clinical_events"]
  purpose: "Link extracted facts to source document locations (Phase 2+)"
  spatial_data: "PostGIS GEOMETRY for click-to-zoom"
  reference: "../ai-processing-v2/06-technical-specifications/database-bridge/clinical_fact_sources.md"
```

## Database Schema Quick Reference

### Core Tables

| Table | Purpose | AI Primary Consumer | Key Fields |
|-------|---------|-------------------|------------|
| `user_profiles` | Profile management | profile-classifier | profile_type, display_name, species |
| `patient_clinical_events` | Core clinical facts | o3-classifier | activity_type, clinical_purposes[], event_name |
| `patient_observations` | Observation details | observation-extractor | observation_type, value_numeric, unit |
| `patient_interventions` | Intervention details | intervention-extractor | substance_name, dose_amount, route |
| `healthcare_timeline_events` | Patient timeline | timeline-generator | display_category, title, searchable_content |
| `smart_health_features` | Context features | smart-feature-detector | feature_type, detection_confidence |

### Database Relationships

```
auth.users (account owners)
    ↓
user_profiles (profile-classifier populates this)
    ↓
patient_clinical_events (o3-classifier populates this)
    ↓ ↓
patient_observations    patient_interventions
    ↓
healthcare_timeline_events (timeline-generator populates this)
    ↓
smart_health_features (smart-feature-detector populates this)
```

## Integration Patterns

### Standard Processing Flow

```typescript
// 1. Classify profile from document
const profile = await profileClassifier.classifyProfile(document, userId);
await insertProfile(profile);

// 2. Extract clinical events using O3 model
const clinicalEvents = await o3Classifier.extractClinicalEvents(document);
await insertClinicalEvents(clinicalEvents, profile.id);

// 3. Extract detailed observations/interventions
for (const event of clinicalEvents) {
  if (event.activity_type === 'observation') {
    const details = await observationExtractor.extract(event);
    await insertObservation(event.id, details);
  } else if (event.activity_type === 'intervention') {
    const details = await interventionExtractor.extract(event);
    await insertIntervention(event.id, details);
  }
}

// 4. Generate timeline events
const timelineEvents = await timelineGenerator.generate(clinicalEvents);
await insertTimelineEvents(timelineEvents, profile.id);

// 5. Detect smart features
const smartFeatures = await smartFeatureDetector.detect(clinicalEvents, profile);
await activateSmartFeatures(smartFeatures, profile.id);
```

### Batch Processing Pattern

```typescript
// Process multiple documents for same profile
async function processBatch(documents: Document[], profileId: string) {
  // Extract all clinical events
  const allEvents = await Promise.all(
    documents.map(doc => o3Classifier.extractClinicalEvents(doc))
  );
  
  // Flatten and batch insert
  const flatEvents = allEvents.flat();
  await batchInsertClinicalEvents(flatEvents, profileId);
  
  // Generate timeline from all events
  const timeline = await timelineGenerator.generateFromEvents(flatEvents);
  await insertTimelineEvents(timeline, profileId);
}
```

## Quality Control & Validation

### Confidence Thresholds

```yaml
quality_gates:
  profile_classification:
    minimum_confidence: 0.85
    safety_critical_threshold: 0.95  # For pets and dependent profiles
    
  clinical_classification:
    minimum_confidence: 0.7
    safety_critical_threshold: 0.9   # For medications and allergies
    
  timeline_generation:
    minimum_confidence: 0.6          # More lenient for user experience
```

### Validation Requirements

```typescript
// Pre-insert validation
interface ValidationRules {
  profile_classification: {
    required_fields: ['profile_type', 'display_name'];
    profile_type_enum: ['self', 'child', 'adult_dependent', 'pet'];
    species_required_for_pets: true;
  };
  
  clinical_events: {
    required_fields: ['activity_type', 'clinical_purposes', 'event_name'];
    activity_type_enum: ['observation', 'intervention'];
    min_event_name_length: 5;
    max_clinical_purposes: 5;
  };
}
```

## Error Handling & Recovery

### Common Failure Patterns

```typescript
// Handle classification failures gracefully
try {
  const classification = await o3Classifier.classifyEvent(medicalText);
  if (classification.confidence_score < 0.7) {
    // Queue for manual review
    await queueForReview(classification, medicalText);
    return null;
  }
  return classification;
} catch (error) {
  // Log AI processing failure
  await logProcessingFailure(error, medicalText);
  throw new ProcessingError('Clinical event classification failed');
}
```

### Database Transaction Patterns

```typescript
// Ensure atomicity across related tables
async function insertClinicalEvent(event: ClinicalEvent) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Insert main event
    const eventResult = await client.query(
      'INSERT INTO patient_clinical_events (...) VALUES (...) RETURNING id',
      [...]
    );
    
    // Insert details based on type
    if (event.activity_type === 'observation') {
      await client.query(
        'INSERT INTO patient_observations (...) VALUES (...)',
        [eventResult.rows[0].id, ...]
      );
    }
    
    // Generate timeline event
    await client.query(
      'INSERT INTO healthcare_timeline_events (...) VALUES (...)',
      [...]
    );
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

## Bridge Documentation References

For detailed implementation guides for each AI component:

- [Database Integration Guide](../../ai-processing-v2/03-extraction-pipeline/normalization/database-integration-guide.md)
- [Table Population Matrix](../../ai-processing-v2/03-extraction-pipeline/normalization/table-population-matrix.md)
- [Example Data Flows](../../ai-processing-v2/03-extraction-pipeline/normalization/example-data-flows.md)
- [Patient Clinical Events Bridge](../../ai-processing-v2/06-technical-specifications/database-bridge/patient_clinical_events.md)
- [User Profiles Bridge](../../ai-processing-v2/06-technical-specifications/database-bridge/user_profiles.md)
- [Healthcare Timeline Events Bridge](../../ai-processing-v2/06-technical-specifications/database-bridge/healthcare_timeline_events.md)
- [Clinical Fact Sources Bridge](../../ai-processing-v2/06-technical-specifications/database-bridge/clinical_fact_sources.md)

---

*This guide serves as the primary integration reference for AI processing components connecting to Guardian's database foundation.*