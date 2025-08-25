
# Draft AI Processing Pipeline: Two-Pass Architecture with Entity-Based Extraction

## Document Status
- **Created**: 25 August 2025
- **Purpose**: Define the AI processing strategy for clinical document extraction. 
- **Status**: Draft specification for implementation
- **Related**: Follows `03-ocr-processing-architecture.md`. See `00-pipeline-overview.md` for overview


## Executive Summary

This document outlines a two-pass AI architecture for extracting structured clinical data from unstructured medical documents. The approach balances accuracy, cost-efficiency, and completeness while maintaining full document traceability. It is not the verbatim plan, but rather just a draft for the overarching architecture. It is missing many features and is not yet aligned to match database foundation.

## Core Challenges and Concerns

### 1. Schema Alignment Without Model Overwhelm
**Challenge**: Providing complete database schema instructions (~3,000 tokens) to the AI without degrading performance or accuracy.
**Concern**: Including all possible schemas in a single prompt may lead to undesirable issues (Attention degradation and increased errors, Higher processing costs, Slower response times).

### 2. Document Fragmentation Risk
**Challenge**: Processing multi-page documents without losing critical context.
**Concern**: Clinical information often spans pages such as lab results split across page breaks, medications referenced in multiple locations, clinical narratives that reference earlier findings.

### 3. Complete Information Capture
**Challenge**: Ensuring no data is lost, even non-clinical elements.
**Concern**: We need to track every clinical data point (observations, interventions) as well as every non-clinical data point (administrative elements such as signatures, dates, provider info, as non-useful data points such as logos, headers (for completeness). We also need to track duplicate mentions of same clinical facts for provenance.

### 4. Token Limit Management
**Challenge**: Processing large documents (15+ pages) within model constraints.
**Concern**: A comprehensive document could generate:
- 200+ identified entities
- 5,000+ tokens of document text
- 3,000+ tokens of entity metadata
- 2,000+ tokens of required schemas

## Proposed Solution: Two-Pass Architecture

### Architecture Overview

```yaml
AI Call 1 - Entity Detection and pure classification (Lightweight):
  Purpose: Comprehensive entity identification and classification
  Model: Lightweight model, refer to "4. Cost Optimization" below.
  Input: Full uploaded file + OCR output
  Output: Complete entity inventory with classifications and required schemas (as per code look up table that maps categories (entity types and subtypes) to schemas)

AI Call 2 - Schema-Based Enrichment (Targeted):
  Purpose: Structured data extraction using relevant schemas
  Model: Heavier high perofrmance model, refer to "4. Cost Optimization" below.
  Input: Full uploaded file + OCR output + filtered entities + specific schemas
  Output: Fully enriched clinical data per database requirements
```

### Pass 1: Comprehensive Entity Detection

#### Input Prompt Structure
```python
prompt = """
Identify EVERY piece of information in this document as an entity.

For each entity found, provide:
1. entity_id: Unique identifier (e.g., "ent_001")
2. text: Exact text as it appears in the document
3. entity_type: One of:
   - clinical_event (observations, interventions)
   - healthcare_identifier (patient info, provider info)
   - healthcare_journey (appointments, referrals)
   - administrative (billing, signatures, dates)
   - non_clinical (logos, headers, formatting)
4. subtype: Specific classification within type:
   - For clinical_event: vital_sign, lab_result, medication, procedure, etc.
   - For healthcare_identifier: patient_name, provider_name, facility, etc.
5. unique_marker: A searchable text pattern to relocate this entity
6. location_context: Where in the document this appears
7. spatial_bbox: AI to use unique_marker and/or location_context to map OCR spatial bounding box data to entity_id (page, x_min, y_min, x_max, y_max). This is for click-to-zoom feature and NOT for AI pass 2.
8. confidence: Confidence score (0.0-1.0)
9. requires_schemas: List of database schemas needed (if clinical), **as per code lookup table that maps categories (entity types and subtypes) to schemas (This reduces Pass 1 to pure classification, making it even cheaper and more reliable)**
10. Addtional roles and actions: 
    - profile_match_confidence...
    - healthcare_relevance_score...

Important:
- Include EVERYTHING, even non-clinical items (they get logged but not enriched)
- Track each mention of the same clinical fact separately (for provenance)
- Tables and graphs should be identified with their contained entities listed

Document text:
{extracted_text}  # Directly from raw material along with ocr output data (ocr text + spatial bbox data)
"""
```

#### Expected Output Structure
```json
{
  "document_id": "doc_12345",
  "total_entities": 187,
  "entity_breakdown": {
    "clinical_event": 45,
    "healthcare_identifier": 12,
    "healthcare_journey": 8,
    "administrative": 22,
    "non_clinical": 100
  },
  "entities": [
    {
      "entity_id": "ent_001",
      "text": "Blood pressure: 140/90 mmHg",
      "entity_type": "clinical_event",
      "subtype": "vital_sign",
      "unique_marker": "Vital Signs Section: Blood pressure: 140/90 mmHg",
      "location_context": "Under 'Vital Signs' header, page 2",
      "spatial_bbox": { "page": 2, "x_min": 0.12, "y_min": 0.34, "x_max": 0.58, "y_max": 0.38 },
      "confidence": 0.95,
      "requires_schemas": ["patient_observations", "patient_vitals"]
    },
    {
      "entity_id": "ent_002",
      "text": "Lisinopril 10mg daily",
      "entity_type": "clinical_event",
      "subtype": "medication",
      "unique_marker": "Medications: • Lisinopril 10mg daily",
      "location_context": "In medication list, page 3",
      "spatial_bbox": { "page": 3, "x_min": 0.10, "y_min": 0.52, "x_max": 0.61, "y_max": 0.56 },
      "confidence": 0.98,
      "requires_schemas": ["patient_interventions", "patient_medications"]
    },
    {
      "entity_id": "ent_045",
      "text": "Lisinopril for blood pressure control",
      "entity_type": "clinical_event",
      "subtype": "medication",
      "unique_marker": "started on Lisinopril for blood pressure control",
      "location_context": "In clinical summary, page 5",
      "spatial_bbox": { "page": 5, "x_min": 0.17, "y_min": 0.40, "x_max": 0.72, "y_max": 0.45 },
      "confidence": 0.92,
      "requires_schemas": ["patient_interventions", "patient_medications"]
    },
    {
      "entity_id": "ent_103",
      "text": "[Signature]",
      "entity_type": "administrative",
      "subtype": "signature",
      "unique_marker": "Attending Physician: [Signature]",
      "location_context": "Bottom of page 8",
      "spatial_bbox": { "page": 8, "x_min": 0.68, "y_min": 0.90, "x_max": 0.92, "y_max": 0.95 },
      "confidence": 0.99,
      "requires_schemas": []
    }
  ],
  "required_schemas_summary": [
    "patient_observations",
    "patient_interventions",
    "patient_vitals",
    "patient_medications",
    "healthcare_encounters"
  ]
}
```

### Pass 2: Targeted Schema Enrichment

#### Schema Loading Strategy
```python
def load_required_schemas(schema_list):
    """Dynamically load only the schemas needed for this document"""
    schema_definitions = {}
    
    for schema_name in schema_list:
        if schema_name == "patient_observations":
            schema_definitions[schema_name] = load_observations_schema()
        elif schema_name == "patient_interventions":
            schema_definitions[schema_name] = load_interventions_schema()
        # ... etc
    
    return schema_definitions
```

#### Input Prompt Structure
```python
prompt = """
Extract structured data for the following clinical entities according to their database schemas.

Entities to process:
{filtered_clinical_entities}  # Only clinical_event type entities

Database schemas to follow:
{loaded_schema_definitions}  # Only schemas identified in Pass 1

Instructions:
1. For each entity, find it in the document using its unique_marker (not bbox data because ai's cant read that stuff)
2. Extract all required fields per the schema
3. Include confidence scores for each extraction
4. Maintain entity_id for tracking

Full document text:
{complete_document_text}

Return structured JSON matching the schemas exactly.
"""
```

#### Expected Output Structure
```json
{
  "enriched_entities": [
    {
      "entity_id": "ent_001",
      "original_text": "Blood pressure: 140/90 mmHg",
      "enriched_data": {
        "patient_clinical_events": {
          "activity_type": "observation",
          "clinical_purpose": ["screening", "monitoring"],
          "event_name": "Blood Pressure Measurement",
          "method": "manual_cuff",
          "body_site": "left_arm",
          "event_datetime": "2024-01-15T10:30:00Z",
          "confidence_score": 0.92
        },
        "patient_observations": {
          "observation_type": "vital_sign",
          "value_text": "140/90 mmHg",
          "value_numeric": 140,
          "value_secondary": 90,
          "unit": "mmHg",
          "interpretation": "stage_2_hypertension"
        }
      }
    },
    {
      "entity_id": "ent_002",
      "original_text": "Lisinopril 10mg daily",
      "enriched_data": {
        "patient_clinical_events": {
          "activity_type": "intervention",
          "clinical_purpose": ["treatment"],
          "event_name": "Medication Prescription",
          "event_datetime": "2024-01-15T00:00:00Z",
          "confidence_score": 0.95
        },
        "patient_interventions": {
          "intervention_type": "medication",
          "substance_name": "Lisinopril",
          "dose_amount": 10,
          "dose_unit": "mg",
          "route": "oral",
          "frequency": "daily"
        }
      }
    }
  ]
}
```

### Handling Large Documents: Intelligent Batching

When document size threatens token limits, implement smart batching (*values are placeholders for the time being and should be easily changeable post-launch):

```python
class EntityBatchProcessor:
    MAX_ENTITIES_PER_BATCH = 50
    MAX_TOKENS_PER_CALL = 12000
    
    def process_large_document(self, entities, document_text, schemas):
        """Intelligently batch entities to stay within token limits"""
        
        # Strategy 1: Group by schema requirement
        schema_groups = self.group_by_schema(entities)
        
        results = []
        for schema_type, entity_batch in schema_groups.items():
            if self.estimate_tokens(entity_batch, document_text, schemas[schema_type]) > self.MAX_TOKENS_PER_CALL:
                # Split into smaller batches
                for chunk in self.split_batch(entity_batch, self.MAX_ENTITIES_PER_BATCH):
                    result = self.enrich_batch(chunk, document_text, schemas[schema_type])
                    results.extend(result)
            else:
                # Process entire group
                result = self.enrich_batch(entity_batch, document_text, schemas[schema_type])
                results.extend(result)
        
        return results
    
    def group_by_schema(self, entities):
        """Group entities by their required schemas"""
        groups = {
            'observations': [],
            'interventions': [],
            'encounters': [],
            'identifiers': []
        }
        
        for entity in entities:
            if 'patient_observations' in entity.get('requires_schemas', []):
                groups['observations'].append(entity)
            elif 'patient_interventions' in entity.get('requires_schemas', []):
                groups['interventions'].append(entity)
            # ... etc
        
        return groups
```

## Implementation Considerations

### 1. Duplicate Entity Tracking
Each mention of the same clinical fact must be tracked separately: Medication in meds list (ent_002) but also mentioned in notes (ent_045) and in discharge plan (ent_078)
This preserves provenance and allows for validation.

### 2. Non-Clinical Entity Handling
Non-clinical entities are identified but are not enriched (not sent to Pass 2 for schema enrichment).
Available for audit and completeness checks; Still logged in the entity inventory and possibly stored elsewere (e.g., separate tracking table)

### 3. Storage Architecture
```sql
-- Temporary storage during processing
CREATE TABLE processing_session (
    session_id UUID PRIMARY KEY,
    document_id UUID NOT NULL,
    pass1_output JSONB,  -- Complete entity inventory
    pass2_input JSONB,   -- Filtered entities + schemas
    pass2_output JSONB,  -- Enriched data
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Permanent entity tracking
CREATE TABLE document_entities (
    entity_id VARCHAR(50) PRIMARY KEY,
    document_id UUID NOT NULL,
    entity_type VARCHAR(50),
    subtype VARCHAR(50),
    original_text TEXT,
    enriched_data JSONB,
    confidence DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 4. Cost Optimization
- Pass 1 uses cheaper model (Claude 3 Haiku or GPT-4o-mini or Mixtral-8x7B, or the cheaper less reliable DeepSeek R1 or Gemini 2.5 Flash): ~$0.0002-0.0005 per document
- Pass 2 uses powerful model (Claude Sonnet 4, Gemini 2.5 Pro or GPT-5) only for clinical entities: ~$0.003-0.006 per document.
- Total 2-pass cost:~$0.0035-0.0065 per document

### 5. Quality Assurance
- Confidence thresholds at each stage
- Validation of enriched data against schemas
- Audit trail of all identified entities
- Manual review queue for low-confidence extractions

#### Recommended Approach to ensuring Pass 1 accuracy via a hybrid 'Code-Based Validation Scoring'system
def process_with_validation(document_text):
    # First attempt with cheap model
    result = call_cheap_model(document_text)
    
    # Quick code validation
    score = validation_score(result)
    needs_retry, issues = needs_reprocessing(result, document_text)
    
    if score < 0.85 or needs_retry:
        logger.warning(f"Validation failed: score={score}, issues={issues}")
        # Retry with better model
        result = call_better_model(document_text)
        
        # Validate again
        score = validation_score(result)
        if score < 0.7:
            # Still bad - might need human review
            raise ExtractionQualityError(f"Low quality extraction: {score}")
    
    return result

## Migration Path

1. **Phase 1**: Implement Pass 1 entity detection
2. **Phase 2**: Add Pass 2 enrichment for high-confidence entities
3. **Phase 3**: Implement intelligent batching for large documents
4. **Phase 4**: Add specialized handlers for tables/graphs
5. **Phase 5**: Optimize with learned patterns from production data

## Success Metrics

- **Completeness**: 100% of document content identified as entities
- **Accuracy**: >95% correct schema assignment
- **Cost**: <$0.02 per document average
- **Speed**: <10 seconds total processing time
- **Token Efficiency**: No single API call exceeds 12k tokens

## Open Questions for Implementation

1. Should we implement entity deduplication at the database level or UI level?
2. How should we handle entities that span multiple schemas?
3. What confidence threshold triggers manual review?
4. Should administrative entities get any enrichment (e.g., parsing dates)?

## Next Steps

1. Complete schema analysis in `database-foundation-v2` to determine the actual schemas/instructions that will be required for all entity categories in order for them to align with the database foundation.
2. Build Pass 1 entity detection with test documents
3. Implement schema loading system
4. Develop Pass 2 enrichment with batching logic
5. Create validation and quality assurance pipeline

---

*This specification represents the current consensus on the AI processing architecture. It will be refined based on implementation learnings and production performance.*