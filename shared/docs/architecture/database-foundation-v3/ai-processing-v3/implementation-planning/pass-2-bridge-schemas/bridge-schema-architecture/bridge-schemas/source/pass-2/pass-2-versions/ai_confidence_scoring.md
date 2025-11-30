# ai_confidence_scoring Bridge Schema (Source) - Pass 2 UPDATE Version

**Status:** ✅ Created from Database Schema
**Database Source:** /current_schema/04_ai_processing.sql (lines 385-424)
**Last Updated:** 1 October 2025
**Priority:** MEDIUM - Optional clinical enrichment confidence updates

## Multi-Pass Context

- **This is the Pass 2 UPDATE version of ai_confidence_scoring**
- Pass 1 CREATED confidence scoring record with entity detection metrics
- Pass 2 MAY OPTIONALLY UPDATE with clinical enrichment confidence
- Unlike other multi-pass tables, Pass 2 updates here are OPTIONAL and ADDITIVE
- Used for comprehensive quality tracking across both detection and enrichment phases

## Database Table Structure (Pass 2 UPDATE Fields)

```sql
-- Pass 2 UPDATE operation MAY modify these fields:
UPDATE ai_confidence_scoring SET
    clinical_coding_confidence = 0.920,  -- ADD clinical enrichment confidence
    overall_confidence = COALESCE(overall_confidence, 0) + (clinical_coding_confidence * 0.20),  -- MAY update composite
    reliability_score = new_reliability_score,  -- MAY update with Pass 2 validation
    confidence_flags = array_append(confidence_flags, 'pass2_low_clinical_confidence'),  -- MAY add Pass 2 flags
    updated_at = NOW()
WHERE id = confidence_record_id;
```

## AI Extraction Requirements for Pass 2 UPDATE

Pass 2 MAY OPTIONALLY UPDATE confidence scoring with clinical enrichment metrics.

### Fields Pass 2 May Update

```typescript
interface AIConfidenceScoringPass2UpdateExtraction {
  // PASS 2 MAY ADD/UPDATE THESE FIELDS
  clinical_coding_confidence?: number;  // 0.000-1.000 clinical classification confidence
  overall_confidence?: number;  // MAY update to incorporate clinical confidence
  reliability_score?: number;  // MAY update with Pass 2 validation data
  confidence_flags?: string[];  // MAY append Pass 2-specific quality flags
}
```

### Fields NOT Modified by Pass 2 (Pass 1 Ownership)

```typescript
interface AIConfidenceScoringPass1Fields {
  // PASS 2 DOES NOT MODIFY THESE (Pass 1 ownership)
  processing_session_id: string;
  entity_processing_audit_id?: string;
  entity_detection_confidence?: number;
  text_extraction_confidence?: number;
  spatial_alignment_confidence?: number;
  vision_model_confidence?: number;
  language_model_confidence?: number;
  classification_model_confidence?: number;
  clinical_relevance_score?: number;
  confidence_trend?: string;
  outlier_detection?: boolean;
  human_validation_available?: boolean;
  human_agreement_score?: number;
  model_accuracy_score?: number;
  processing_time_ms?: number;
  model_version?: string;
  calibration_score?: number;
}
```

## Example Extractions (Pass 2 UPDATE)

### Example 1: Add Clinical Coding Confidence
```json
{
  "clinical_coding_confidence": 0.920
}
```

### Example 2: Add Clinical Confidence and Update Overall
```json
{
  "clinical_coding_confidence": 0.880,
  "overall_confidence": 0.895
}
```
**Note:** overall_confidence updated to incorporate both Pass 1 and Pass 2 confidence scores.

### Example 3: Add Pass 2 Quality Flag
```json
{
  "clinical_coding_confidence": 0.650,
  "confidence_flags": ["pass2_low_clinical_confidence", "missing_context"]
}
```

### Example 4: No Pass 2 Update
**No UPDATE required** - Pass 2 updates are entirely optional for this table.

## Critical Notes (Pass 2 UPDATE)

1. **UPDATE Operation OPTIONAL**: Pass 2 updates are NOT required - this table functions fine without them.

2. **Additive Updates**: Pass 2 ADDS clinical_coding_confidence, does not replace Pass 1 metrics.

3. **Overall Confidence Recalculation**: If updating overall_confidence, incorporate both Pass 1 and Pass 2 scores.

4. **Confidence Flags Append**: Use array_append() to ADD Pass 2 flags without removing Pass 1 flags.

5. **Pass 1 Fields Readonly**: Do NOT modify any Pass 1 confidence metrics.

6. **Less Rigid Separation**: This table is more flexible than other multi-pass tables - Pass 2 participation is optional.

7. **Use Case Driven**: Only update if clinical enrichment confidence is meaningful for your quality tracking.

8. **No Status Tracking**: Unlike entity_processing_audit, no pass2_status field exists here.

## Schema Validation Checklist (Pass 2 UPDATE)

- [ ] `clinical_coding_confidence` (if updated) is 0.000-1.000
- [ ] `overall_confidence` (if updated) is 0.000-1.000
- [ ] `reliability_score` (if updated) is 0.000-1.000
- [ ] `confidence_flags` (if updated) preserves existing Pass 1 flags
- [ ] Pass 1 fields are NOT modified
- [ ] WHERE clause targets correct confidence record

## Database Constraint Notes

- **NUMERIC precision**: clinical_coding_confidence (4,3) - 0.000-1.000 range
- **TEXT[] array**: confidence_flags for quality issues (append, don't replace)
- **No Pass 2 status field**: Unlike other multi-pass tables, no explicit pass2_status tracking
- **Foreign keys**: All FK references set by Pass 1, not modified by Pass 2
- **Timestamp update**: Application must manually set updated_at=NOW() (no automatic trigger)

## Pass 1 vs Pass 2 Field Ownership

**Pass 1 CREATE populates:**
- All entity detection confidence metrics
- All text extraction and spatial alignment scores
- All model-specific confidence scores (vision, language, classification)
- All composite scores (overall, reliability, clinical relevance)
- All quality indicators (trend, outlier detection, initial confidence flags)
- All model performance metrics (processing time, model version, calibration)

**Pass 2 MAY OPTIONALLY UPDATE:**
- clinical_coding_confidence (clinical enrichment confidence)
- overall_confidence (recalculated to include Pass 2)
- reliability_score (updated with Pass 2 validation)
- confidence_flags (append Pass 2-specific flags)

**Note:** Pass 2 updates are OPTIONAL and ADDITIVE. Most deployments may skip Pass 2 updates entirely.

## Update Operation Pattern

```sql
-- Pass 2 UPDATE example (OPTIONAL):
UPDATE ai_confidence_scoring
SET
    clinical_coding_confidence = 0.920,
    overall_confidence = (
        COALESCE(overall_confidence, 0) * 0.80 +  -- Weight Pass 1 scores
        0.920 * 0.20  -- Weight Pass 2 clinical score
    ),
    confidence_flags = array_append(confidence_flags, 'pass2_enrichment_complete'),
    updated_at = NOW()
WHERE id = $1;
```

## Use Cases

1. **Clinical Quality Tracking**: Track clinical enrichment confidence separately from detection
2. **Comprehensive Scoring**: Incorporate both detection and enrichment quality into overall_confidence
3. **Quality Flags**: Add Pass 2-specific quality flags for diagnostics
4. **Model Monitoring**: Track clinical classification model performance over time
5. **Optional Enhancement**: Many deployments may skip Pass 2 updates and use Pass 1 metrics only
