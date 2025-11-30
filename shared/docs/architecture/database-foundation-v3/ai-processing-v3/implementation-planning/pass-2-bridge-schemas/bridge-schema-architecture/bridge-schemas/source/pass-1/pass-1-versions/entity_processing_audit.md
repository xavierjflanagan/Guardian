# entity_processing_audit Bridge Schema (Source) - Pass 1 CREATE Version

**Status:** ✅ Created from Database Schema
**Database Source:** /current_schema/04_ai_processing.sql (lines 153-263)
**Last Updated:** 1 October 2025
**Priority:** CRITICAL - Complete audit trail foundation, most complex multi-pass table

## Multi-Pass Context

- **This is the Pass 1 CREATE version of entity_processing_audit**
- Pass 1 CREATES complete audit record for each detected entity
- Pass 2 UPDATES same record with clinical enrichment results and final table links
- Most detailed audit table - tracks AI-OCR cross-validation and spatial mapping
- Cross-pass join key: processing_session_id

## Database Table Structure (Pass 1 CREATE Fields)

```sql
-- Pass 1 CREATE operation populates these fields:
INSERT INTO entity_processing_audit (
    -- Primary references (REQUIRED)
    shell_file_id,
    patient_id,
    processing_session_id,

    -- Entity Identity (REQUIRED)
    entity_id,
    original_text,
    entity_category,
    entity_subtype,

    -- Spatial and Context Information
    unique_marker,
    location_context,
    spatial_bbox,
    page_number,

    -- Pass 1 Processing Results (REQUIRED)
    pass1_confidence,
    requires_schemas,
    processing_priority,

    -- Pass 2 Coordination (INITIALIZED)
    pass2_status,  -- Default: 'pending'

    -- AI Model and Performance (REQUIRED for Pass 1)
    pass1_model_used,
    pass1_vision_processing,
    pass1_token_usage,
    pass1_image_tokens,
    pass1_cost_estimate,

    -- AI Visual Processing
    ai_visual_interpretation,
    visual_formatting_context,
    ai_visual_confidence,

    -- OCR Cross-Reference
    ocr_reference_text,
    ocr_confidence,
    ocr_provider,
    ai_ocr_agreement_score,
    spatial_mapping_source,

    -- Discrepancy Tracking
    discrepancy_type,
    discrepancy_notes,
    visual_quality_assessment,

    -- Quality and Validation
    validation_flags,
    cross_validation_score,
    manual_review_required,

    -- Profile Safety
    profile_verification_confidence,
    pii_sensitivity_level,
    compliance_flags,

    created_at  -- Default: NOW()
) VALUES (...);
```

## AI Extraction Requirements for Pass 1 CREATE

Pass 1 CREATES complete audit record for each entity detected in the document.

### Required Fields (Pass 1 Must Provide)

```typescript
interface EntityProcessingAuditPass1CreateExtraction {
  // REQUIRED: Primary references
  shell_file_id: string;  // UUID from context
  patient_id: string;  // UUID from context
  processing_session_id: string;  // UUID from context

  // REQUIRED: Entity Identity
  entity_id: string;  // Unique identifier (e.g., "entity_001")
  original_text: string;  // Exact text from document
  entity_category: 'clinical_event' | 'healthcare_context' | 'document_structure';
  entity_subtype: string;  // vital_sign, medication, diagnosis, etc.

  // REQUIRED: Pass 1 Results
  pass1_confidence: number;  // 0.000-1.000
  requires_schemas: string[];  // ['patient_observations', 'patient_vitals']
  processing_priority: 'highest' | 'high' | 'medium' | 'low' | 'logging_only';

  // REQUIRED: AI Model Metadata
  pass1_model_used: string;  // "gpt-4o-mini", "claude-3-5-sonnet"
  pass1_vision_processing: boolean;  // true if vision model used
  pass1_token_usage?: number;
  pass1_image_tokens?: number;
  pass1_cost_estimate?: number;
}
```

### Optional Fields (Strongly Recommended)

```typescript
interface EntityProcessingAuditPass1OptionalFields {
  // Spatial and Context
  unique_marker?: string;  // Searchable text pattern
  location_context?: string;  // "page 2, vitals section"
  spatial_bbox?: object;  // {x: 100, y: 200, width: 150, height: 30}
  page_number?: number;

  // AI Visual Processing
  ai_visual_interpretation?: string;  // What AI saw
  visual_formatting_context?: string;  // Bold, table, chart, etc.
  ai_visual_confidence?: number;  // 0.000-1.000

  // OCR Cross-Reference
  ocr_reference_text?: string;  // What OCR extracted
  ocr_confidence?: number;  // 0.000-1.000
  ocr_provider?: string;  // "google_vision", "aws_textract"
  ai_ocr_agreement_score?: number;  // 0.0-1.0
  spatial_mapping_source?: 'ocr_exact' | 'ocr_approximate' | 'ai_estimated' | 'none';

  // Discrepancy Tracking
  discrepancy_type?: string;  // "text_mismatch", "formatting_difference"
  discrepancy_notes?: string;
  visual_quality_assessment?: string;  // "high_quality", "blurry", "handwritten"

  // Quality and Validation
  validation_flags?: string[];  // ["low_confidence", "high_discrepancy"]
  cross_validation_score?: number;  // Overall AI-OCR agreement
  manual_review_required?: boolean;

  // Profile Safety
  profile_verification_confidence?: number;  // 0.000-1.000
  pii_sensitivity_level?: 'none' | 'low' | 'medium' | 'high';
  compliance_flags?: string[];  // ["requires_hipaa_audit", "contains_minor_data"]
}
```

### Fields NOT Set by Pass 1 (Pass 2 Ownership)

```typescript
interface EntityProcessingAuditPass2Fields {
  // Pass 2 will populate these during clinical enrichment:
  pass2_status: string;  // Pass 1 sets 'pending', Pass 2 updates
  pass2_confidence?: number;
  pass2_started_at?: string;
  pass2_completed_at?: string;
  enrichment_errors?: string;
  pass2_model_used?: string;
  pass2_token_usage?: number;
  pass2_cost_estimate?: number;

  // Final clinical data links (Pass 2 only)
  final_event_id?: string;
  final_encounter_id?: string;
  final_observation_id?: string;
  final_intervention_id?: string;
  final_condition_id?: string;
  final_allergy_id?: string;
  final_vital_id?: string;

  // Manual review completion (Pass 2 or human)
  manual_review_completed?: boolean;
  manual_review_notes?: string;
  manual_reviewer_id?: string;
}
```

## Example Extractions (Pass 1 CREATE)

### Example 1: High-Confidence Clinical Event (Blood Pressure)
```json
{
  "shell_file_id": "uuid-of-shell-file",
  "patient_id": "uuid-of-patient",
  "processing_session_id": "uuid-of-session",
  "entity_id": "entity_001",
  "original_text": "BP: 120/80 mmHg",
  "entity_category": "clinical_event",
  "entity_subtype": "vital_sign_blood_pressure",
  "unique_marker": "BP: 120/80",
  "location_context": "Page 1, vitals section, third row",
  "spatial_bbox": {"x": 125, "y": 340, "width": 180, "height": 25, "page": 1},
  "page_number": 1,
  "pass1_confidence": 0.980,
  "requires_schemas": ["patient_observations", "patient_vitals"],
  "processing_priority": "highest",
  "pass2_status": "pending",
  "pass1_model_used": "gpt-4o-mini",
  "pass1_vision_processing": true,
  "pass1_token_usage": 1250,
  "pass1_image_tokens": 800,
  "pass1_cost_estimate": 0.0045,
  "ai_visual_interpretation": "Blood pressure reading in standard clinical format with unit notation",
  "visual_formatting_context": "Bold text in vital signs table",
  "ai_visual_confidence": 0.985,
  "ocr_reference_text": "BP: 120/80 mmHg",
  "ocr_confidence": 0.990,
  "ocr_provider": "google_vision",
  "ai_ocr_agreement_score": 1.0,
  "spatial_mapping_source": "ocr_exact",
  "cross_validation_score": 0.990,
  "manual_review_required": false,
  "profile_verification_confidence": 0.950,
  "pii_sensitivity_level": "medium",
  "compliance_flags": ["clinical_data"]
}
```

### Example 2: Medium-Confidence Medication (AI-OCR Discrepancy)
```json
{
  "shell_file_id": "uuid-of-shell-file",
  "patient_id": "uuid-of-patient",
  "processing_session_id": "uuid-of-session",
  "entity_id": "entity_012",
  "original_text": "Lisinopril 10mg daily",
  "entity_category": "clinical_event",
  "entity_subtype": "medication",
  "location_context": "Page 2, medications list",
  "page_number": 2,
  "pass1_confidence": 0.750,
  "requires_schemas": ["patient_interventions"],
  "processing_priority": "high",
  "pass2_status": "pending",
  "pass1_model_used": "gpt-4o-mini",
  "pass1_vision_processing": true,
  "pass1_token_usage": 980,
  "pass1_cost_estimate": 0.0032,
  "ai_visual_interpretation": "Medication entry with handwritten dosage notation",
  "ai_visual_confidence": 0.720,
  "ocr_reference_text": "Lisinopril 1Omg daily",
  "ocr_confidence": 0.680,
  "ocr_provider": "google_vision",
  "ai_ocr_agreement_score": 0.850,
  "spatial_mapping_source": "ocr_approximate",
  "discrepancy_type": "ocr_character_confusion",
  "discrepancy_notes": "OCR interpreted '10' as '1O' (digit-letter confusion)",
  "visual_quality_assessment": "partial_handwriting",
  "validation_flags": ["ocr_uncertainty", "handwriting_present"],
  "cross_validation_score": 0.750,
  "manual_review_required": true,
  "pii_sensitivity_level": "high",
  "compliance_flags": ["medication_data", "requires_verification"]
}
```

### Example 3: Document Structure Entity (No Clinical Enrichment)
```json
{
  "shell_file_id": "uuid-of-shell-file",
  "patient_id": "uuid-of-patient",
  "processing_session_id": "uuid-of-session",
  "entity_id": "entity_025",
  "original_text": "Laboratory Results Summary",
  "entity_category": "document_structure",
  "entity_subtype": "section_header",
  "location_context": "Page 3, top of page",
  "page_number": 3,
  "pass1_confidence": 1.000,
  "requires_schemas": [],
  "processing_priority": "logging_only",
  "pass2_status": "skipped",
  "pass1_model_used": "gpt-4o-mini",
  "pass1_vision_processing": true,
  "pass1_token_usage": 450,
  "pass1_cost_estimate": 0.0015,
  "ai_visual_interpretation": "Section header in bold, larger font",
  "visual_formatting_context": "Heading style, 18pt bold",
  "ai_visual_confidence": 1.000,
  "ocr_reference_text": "Laboratory Results Summary",
  "ocr_confidence": 0.995,
  "ocr_provider": "google_vision",
  "ai_ocr_agreement_score": 1.0,
  "spatial_mapping_source": "ocr_exact",
  "cross_validation_score": 1.000,
  "manual_review_required": false,
  "pii_sensitivity_level": "none"
}
```

### Example 4: Minimal Required Fields Only
```json
{
  "shell_file_id": "uuid-of-shell-file",
  "patient_id": "uuid-of-patient",
  "processing_session_id": "uuid-of-session",
  "entity_id": "entity_042",
  "original_text": "Height: 175cm",
  "entity_category": "clinical_event",
  "entity_subtype": "vital_sign_height",
  "pass1_confidence": 0.920,
  "requires_schemas": ["patient_observations", "patient_vitals"],
  "processing_priority": "high",
  "pass2_status": "pending",
  "pass1_model_used": "gpt-4o-mini",
  "pass1_vision_processing": true
}
```
**Note:** Explicitly including `pass2_status: "pending"` reinforces initialization semantics.

## Critical Notes (Pass 1 CREATE)

1. **CREATE Operation**: Pass 1 creates ONE audit record per detected entity.

2. **Entity Identity**: Each entity gets unique entity_id (e.g., "entity_001", "entity_002").

3. **Cross-Pass Coordination**: pass2_status='pending' signals Pass 2 to process this entity.

4. **Schema Requirements**: requires_schemas array tells Pass 2 which clinical tables to populate.

5. **Processing Priority**: Determines Pass 2 urgency (highest=critical clinical data, logging_only=skip Pass 2).

6. **AI-OCR Cross-Validation**: Strong recommendation to include both AI and OCR perspectives for quality.

7. **Spatial Mapping**: spatial_bbox enables click-to-zoom UI features, page_number for navigation.

8. **Document Structure**: entity_category='document_structure' entities skip Pass 2 enrichment.

9. **Manual Review Flagging**: Pass 1 can flag manual_review_required=true for low confidence entities.

10. **Profile Safety**: profile_verification_confidence tracks patient identity match confidence.

11. **PII Sensitivity**: Enables proper audit logging and access controls based on data sensitivity.

12. **Cost Tracking**: Track Pass 1 costs separately (pass1_cost_estimate) for monitoring.

13. **Pass 2 Fields NULL**: All pass2_* fields and final_*_id links remain NULL until Pass 2.

## Schema Validation Checklist (Pass 1 CREATE)

- [ ] `shell_file_id` is valid UUID (NOT NULL)
- [ ] `patient_id` is valid UUID (NOT NULL)
- [ ] `processing_session_id` is valid UUID (NOT NULL)
- [ ] `entity_id` is unique string (NOT NULL)
- [ ] `original_text` is non-empty (NOT NULL)
- [ ] `entity_category` is one of 3 enum values (NOT NULL)
- [ ] `entity_subtype` is provided (NOT NULL)
- [ ] `pass1_confidence` is 0.000-1.000 (NOT NULL)
- [ ] `requires_schemas` is TEXT[] array (NOT NULL, can be empty for document_structure)
- [ ] `processing_priority` is one of 5 enum values (NOT NULL)
- [ ] `pass2_status` defaults to 'pending' (or 'skipped' for document_structure)
- [ ] `pass1_model_used` is provided (NOT NULL)
- [ ] `pass1_vision_processing` is boolean (NOT NULL)
- [ ] All pass2_* fields are NULL
- [ ] All final_*_id links are NULL
- [ ] `ai_visual_confidence` (if provided) is 0.000-1.000
- [ ] `ocr_confidence` (if provided) is 0.000-1.000
- [ ] `ai_ocr_agreement_score` (if provided) is 0.0-1.0
- [ ] `cross_validation_score` (if provided) is 0.000-1.000
- [ ] `profile_verification_confidence` (if provided) is 0.000-1.000
- [ ] `spatial_mapping_source` (if provided) is one of 4 enum values
- [ ] `pii_sensitivity_level` (if provided) is one of 4 enum values

## Database Constraint Notes

- **Entity categories**: Must be 'clinical_event', 'healthcare_context', or 'document_structure'
- **Processing priorities**: Must be 'highest', 'high', 'medium', 'low', or 'logging_only'
- **Pass2 status**: Defaults to 'pending' ('pending'|'skipped'|'in_progress'|'completed'|'failed')
- **NUMERIC precision**: All confidence scores (4,3), cost (8,4)
- **TEXT[] arrays**: requires_schemas, validation_flags, compliance_flags
- **JSONB**: spatial_bbox for coordinate data
- **Spatial mapping**: Must be 'ocr_exact', 'ocr_approximate', 'ai_estimated', or 'none'
- **PII sensitivity**: Must be 'none', 'low', 'medium', or 'high'
- **Foreign keys**: shell_file_id and processing_session_id have ON DELETE CASCADE; patient_id is required (no CASCADE)

## Pass 1 vs Pass 2 Field Ownership

**Pass 1 CREATE populates:**
- All entity identity fields (entity_id, original_text, category, subtype)
- All spatial and context fields (spatial_bbox, page_number, location_context)
- All Pass 1 processing results (pass1_confidence, requires_schemas, priority)
- All AI model metadata (pass1_model_used, pass1_token_usage, pass1_cost_estimate)
- All AI visual processing fields (ai_visual_interpretation, ai_visual_confidence)
- All OCR cross-reference fields (ocr_reference_text, ocr_confidence, ocr_provider)
- All discrepancy tracking (discrepancy_type, visual_quality_assessment)
- All quality validation flags (validation_flags, cross_validation_score, manual_review_required)
- All profile safety fields (profile_verification_confidence, pii_sensitivity_level)
- pass2_status initialization ('pending' or 'skipped')

**Pass 2 UPDATE modifies:**
- pass2_status ('in_progress' → 'completed'/'failed')
- pass2_confidence (clinical enrichment confidence)
- pass2_started_at, pass2_completed_at (timing)
- pass2_model_used, pass2_token_usage, pass2_cost_estimate (Pass 2 metrics)
- enrichment_errors (if Pass 2 fails)
- All final_*_id links (final_event_id, final_observation_id, etc.)
- manual_review_completed, manual_review_notes (if human reviews)

## Unique Entity ID Pattern

```typescript
// Generate unique entity IDs sequentially within a session
const entityId = `entity_${String(index + 1).padStart(3, '0')}`;
// Examples: "entity_001", "entity_002", ..., "entity_042"
```
