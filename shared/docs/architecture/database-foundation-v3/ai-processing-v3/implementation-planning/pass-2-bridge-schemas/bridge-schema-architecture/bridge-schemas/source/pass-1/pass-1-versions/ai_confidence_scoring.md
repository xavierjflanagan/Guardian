# ai_confidence_scoring Bridge Schema (Source) - Pass 1 CREATE Version

**Status:** ✅ Created from Database Schema
**Database Source:** /current_schema/04_ai_processing.sql (lines 385-424)
**Last Updated:** 1 October 2025
**Priority:** HIGH - Entity detection confidence metrics and quality tracking

## Multi-Pass Context

- **This is the Pass 1 CREATE version of ai_confidence_scoring**
- Pass 1 CREATES confidence scoring record for entity detection
- Pass 2 MAY UPDATE with clinical enrichment confidence metrics
- Links to processing_session_id and optionally entity_processing_audit_id
- Used for automated decision-making and manual review triggering

## Database Table Structure (Pass 1 CREATE Fields)

```sql
-- Pass 1 CREATE operation populates these fields:
INSERT INTO ai_confidence_scoring (
    -- Primary references (REQUIRED)
    processing_session_id,
    entity_processing_audit_id,  -- Optional: session-level or entity-level scoring

    -- Confidence breakdown (Pass 1 entity detection)
    entity_detection_confidence,
    text_extraction_confidence,
    spatial_alignment_confidence,

    -- Model-specific confidence scores (Pass 1)
    vision_model_confidence,
    language_model_confidence,
    classification_model_confidence,

    -- Composite scores (Pass 1)
    overall_confidence,
    reliability_score,
    clinical_relevance_score,

    -- Quality indicators
    confidence_trend,  -- 'improving', 'stable', 'declining'
    outlier_detection,
    confidence_flags,

    -- Validation against human review (if available)
    human_validation_available,
    human_agreement_score,
    model_accuracy_score,

    -- Model performance tracking
    processing_time_ms,
    model_version,
    calibration_score,

    created_at  -- Default: NOW()
) VALUES (...);
```

## AI Extraction Requirements for Pass 1 CREATE

Pass 1 CREATES confidence scoring record for entity detection phase.

### Required Fields (Pass 1 Must Provide)

```typescript
interface AIConfidenceScoringPass1CreateExtraction {
  // REQUIRED: Primary reference
  processing_session_id: string;  // UUID from context

  // OPTIONAL: Entity-specific scoring (if scoring individual entity)
  entity_processing_audit_id?: string;  // UUID link to specific entity audit
}
```

### Optional Fields (Strongly Recommended)

```typescript
interface AIConfidenceScoringPass1OptionalFields {
  // Confidence Breakdown (Pass 1 entity detection)
  entity_detection_confidence?: number;  // 0.000-1.000
  text_extraction_confidence?: number;  // 0.000-1.000 (OCR quality)
  spatial_alignment_confidence?: number;  // 0.000-1.000 (bbox accuracy)

  // Model-Specific Scores (Pass 1)
  vision_model_confidence?: number;  // 0.000-1.000 (GPT-4o Vision, etc.)
  language_model_confidence?: number;  // 0.000-1.000 (text understanding)
  classification_model_confidence?: number;  // 0.000-1.000 (entity categorization)

  // Composite Scores (Pass 1)
  overall_confidence?: number;  // 0.000-1.000 (weighted average)
  reliability_score?: number;  // 0.000-1.000 (consistency metric)
  clinical_relevance_score?: number;  // 0.000-1.000 (medical importance)

  // Quality Indicators
  confidence_trend?: 'improving' | 'stable' | 'declining';
  outlier_detection?: boolean;  // Default: false
  confidence_flags?: string[];  // ["low_ocr_confidence", "spatial_uncertainty"]

  // Validation (if human review available)
  human_validation_available?: boolean;  // Default: false
  human_agreement_score?: number;  // 0.000-1.000
  model_accuracy_score?: number;  // 0.000-1.000

  // Model Performance
  processing_time_ms?: number;  // Milliseconds for processing
  model_version?: string;  // "gpt-4o-mini-2024-07-18"
  calibration_score?: number;  // 0.000-1.000 (how well calibrated model is)
}
```

### Fields NOT Set by Pass 1 (Pass 2 May Add)

```typescript
interface AIConfidenceScoringPass2PotentialFields {
  // Pass 2 MAY add clinical enrichment confidence metrics:
  clinical_coding_confidence?: number;  // Pass 2 clinical classification confidence
  // Pass 2 may also update overall_confidence and reliability_score
}
```

## Example Extractions (Pass 1 CREATE)

### Example 1: Session-Level Confidence (Overall Document Quality)
```json
{
  "processing_session_id": "uuid-of-session",
  "entity_detection_confidence": 0.885,
  "text_extraction_confidence": 0.920,
  "spatial_alignment_confidence": 0.850,
  "vision_model_confidence": 0.910,
  "language_model_confidence": 0.875,
  "classification_model_confidence": 0.890,
  "overall_confidence": 0.885,
  "reliability_score": 0.900,
  "clinical_relevance_score": 0.870,
  "confidence_trend": "stable",
  "outlier_detection": false,
  "processing_time_ms": 8450,
  "model_version": "gpt-4o-mini-2024-07-18",
  "calibration_score": 0.910
}
```

### Example 2: Entity-Level Confidence (Single Entity)
```json
{
  "processing_session_id": "uuid-of-session",
  "entity_processing_audit_id": "uuid-of-entity-audit",
  "entity_detection_confidence": 0.750,
  "text_extraction_confidence": 0.680,
  "spatial_alignment_confidence": 0.720,
  "vision_model_confidence": 0.740,
  "language_model_confidence": 0.760,
  "classification_model_confidence": 0.750,
  "overall_confidence": 0.740,
  "reliability_score": 0.720,
  "clinical_relevance_score": 0.850,
  "confidence_trend": "declining",
  "outlier_detection": true,
  "confidence_flags": ["low_ocr_confidence", "handwriting_present"],
  "processing_time_ms": 3200,
  "model_version": "gpt-4o-mini-2024-07-18"
}
```

### Example 3: High-Confidence with Human Validation
```json
{
  "processing_session_id": "uuid-of-session",
  "entity_processing_audit_id": "uuid-of-entity-audit",
  "entity_detection_confidence": 0.980,
  "text_extraction_confidence": 0.990,
  "vision_model_confidence": 0.985,
  "language_model_confidence": 0.980,
  "overall_confidence": 0.985,
  "reliability_score": 0.990,
  "clinical_relevance_score": 0.950,
  "confidence_trend": "improving",
  "outlier_detection": false,
  "human_validation_available": true,
  "human_agreement_score": 0.975,
  "model_accuracy_score": 0.980,
  "processing_time_ms": 2100,
  "model_version": "gpt-4o-mini-2024-07-18",
  "calibration_score": 0.985
}
```

### Example 4: Minimal Required Fields Only
```json
{
  "processing_session_id": "uuid-of-session"
}
```
**Note:** Only processing_session_id is strictly required. All confidence fields are optional.

## Critical Notes (Pass 1 CREATE)

1. **CREATE Operation**: Pass 1 creates ONE confidence record per session OR per entity.

2. **Session vs Entity Level**:
   - Session-level: processing_session_id only (overall document quality)
   - Entity-level: processing_session_id + entity_processing_audit_id (specific entity confidence)

3. **Confidence Breakdown**: Split confidence into components (detection, extraction, alignment, etc.).

4. **Model-Specific Scores**: Track confidence from each model type (vision, language, classification).

5. **Composite Scores**:
   - overall_confidence: Weighted average of component scores
   - reliability_score: Consistency/reproducibility metric
   - clinical_relevance_score: Medical importance scoring

6. **Confidence Trend**: 'improving', 'stable', or 'declining' (may require historical comparison).

7. **Outlier Detection**: Flag entities with unusual confidence patterns.

8. **Confidence Flags**: Array of quality issues (["low_ocr_confidence", "spatial_uncertainty"]).

9. **Human Validation**: If human review available, track agreement between AI and human.

10. **Model Performance**: Track processing time and calibration for model monitoring.

11. **Pass 2 Updates**: Pass 2 MAY add clinical_coding_confidence or update overall scores.

12. **Optional Nature**: Most fields are optional - AI can provide as much or as little detail as available.

## Schema Validation Checklist (Pass 1 CREATE)

- [ ] `processing_session_id` is valid UUID (NOT NULL)
- [ ] `entity_processing_audit_id` (if provided) is valid UUID
- [ ] `entity_detection_confidence` (if provided) is 0.000-1.000
- [ ] `text_extraction_confidence` (if provided) is 0.000-1.000
- [ ] `spatial_alignment_confidence` (if provided) is 0.000-1.000
- [ ] `vision_model_confidence` (if provided) is 0.000-1.000
- [ ] `language_model_confidence` (if provided) is 0.000-1.000
- [ ] `classification_model_confidence` (if provided) is 0.000-1.000
- [ ] `overall_confidence` (if provided) is 0.000-1.000
- [ ] `reliability_score` (if provided) is 0.000-1.000
- [ ] `clinical_relevance_score` (if provided) is 0.000-1.000
- [ ] `confidence_trend` (if provided) is 'improving', 'stable', or 'declining'
- [ ] `outlier_detection` defaults to false
- [ ] `confidence_flags` (if provided) is TEXT[] array
- [ ] `human_agreement_score` (if provided) is 0.000-1.000
- [ ] `model_accuracy_score` (if provided) is 0.000-1.000
- [ ] `calibration_score` (if provided) is 0.000-1.000
- [ ] `processing_time_ms` (if provided) is positive integer

## Database Constraint Notes

- **NUMERIC precision**: All confidence scores (4,3) - 0.000-1.000 range
- **TEXT[] array**: confidence_flags for quality issues
- **Confidence trend**: Must be 'improving', 'stable', or 'declining'
- **Boolean defaults**: outlier_detection=false, human_validation_available=false
- **Foreign keys**: processing_session_id (NOT NULL), entity_processing_audit_id (nullable)
- **Timestamps**: created_at defaults to NOW(), updated_at defaults to NOW()

## Pass 1 vs Pass 2 Field Ownership

**Pass 1 CREATE populates:**
- All entity detection confidence metrics
- All text extraction and spatial alignment scores
- All model-specific confidence scores (vision, language, classification)
- Composite scores (overall, reliability, clinical relevance)
- Quality indicators (trend, outlier detection, confidence flags)
- Model performance metrics (processing time, model version, calibration)
- Human validation scores (if available during Pass 1)

**Pass 2 MAY UPDATE:**
- clinical_coding_confidence (add clinical enrichment confidence)
- overall_confidence (may update with Pass 2 clinical data)
- reliability_score (may update with Pass 2 validation)
- confidence_flags (may add Pass 2-specific flags)

**Note:** This table is less rigidly separated between passes than other multi-pass tables. Pass 2 updates are optional and additive.

## Confidence Score Calculation Guidance

```typescript
// Example overall_confidence calculation (weighted average)
const overallConfidence = (
  entity_detection_confidence * 0.30 +
  text_extraction_confidence * 0.25 +
  spatial_alignment_confidence * 0.15 +
  vision_model_confidence * 0.15 +
  language_model_confidence * 0.15
) / 1.0;

// Example reliability_score (consistency metric)
const confidenceValues = [
  entity_detection_confidence,
  text_extraction_confidence,
  vision_model_confidence,
  language_model_confidence
].filter(v => v !== undefined);

const mean = confidenceValues.reduce((a, b) => a + b) / confidenceValues.length;
const variance = confidenceValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / confidenceValues.length;
const reliability_score = 1.0 - Math.sqrt(variance);  // Lower variance = higher reliability
```

## Use Cases

1. **Session-Level Quality**: Track overall document processing quality
2. **Entity-Level Quality**: Track individual entity detection confidence
3. **Manual Review Triggering**: Use overall_confidence < threshold to flag for human review
4. **Model Monitoring**: Track processing_time_ms and calibration_score over time
5. **Quality Dashboard**: Visualize confidence_trend and outlier_detection patterns
6. **Human-AI Agreement**: Compare model_accuracy_score vs human_agreement_score
