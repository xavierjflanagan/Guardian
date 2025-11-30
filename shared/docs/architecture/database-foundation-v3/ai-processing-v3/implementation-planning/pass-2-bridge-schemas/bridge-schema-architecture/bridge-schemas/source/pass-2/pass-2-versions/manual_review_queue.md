# manual_review_queue Bridge Schema (Source) - Pass 2 CREATE Version

**Status:** ✅ Created from Database Schema
**Database Source:** /current_schema/04_ai_processing.sql (lines 329-382)
**Last Updated:** 1 October 2025
**Priority:** MEDIUM - Optional clinical enrichment review items, FINAL SCHEMA IN SERIES

## Multi-Pass Context

- **This is the Pass 2 CREATE version of manual_review_queue**
- Pass 1 CREATED review items for entity detection issues
- Pass 2 MAY CREATE additional items for clinical enrichment concerns
- Uses same table structure, but Pass 2 focuses on clinical accuracy reviews
- Critical for clinical data quality assurance

## Database Table Structure (Pass 2 CREATE Fields)

```sql
-- Pass 2 CREATE operation populates these fields (same structure as Pass 1):
INSERT INTO manual_review_queue (
    -- Primary references (REQUIRED)
    patient_id,
    processing_session_id,
    shell_file_id,

    -- Review context (REQUIRED)
    review_type,  -- Pass 2 typically uses 'clinical_accuracy'
    priority,  -- 'low', 'normal', 'high', 'urgent', 'critical' (default: 'normal')

    -- AI processing context
    ai_confidence_score,
    ai_concerns,
    flagged_issues,

    -- Review content (REQUIRED)
    review_title,
    review_description,
    ai_suggestions,
    clinical_context,

    -- Assignment and workflow
    assigned_reviewer,
    assigned_at,
    estimated_review_time,  -- Default: '15 minutes'

    -- Review results (INITIALIZED)
    review_status,  -- Default: 'pending'

    created_at  -- Default: NOW()
) VALUES (...);
```

## AI Extraction Requirements for Pass 2 CREATE

Pass 2 MAY CREATE new review queue items when clinical enrichment confidence is low.

### Required Fields (Pass 2 Must Provide)

```typescript
interface ManualReviewQueuePass2CreateExtraction {
  // REQUIRED: Primary references (same as Pass 1)
  patient_id: string;  // UUID from context
  processing_session_id: string;  // UUID from context
  shell_file_id: string;  // UUID from context

  // REQUIRED: Review context (Pass 2 focus)
  review_type: 'clinical_accuracy';  // Pass 2 typically uses this type
  priority?: 'low' | 'normal' | 'high' | 'urgent' | 'critical';  // Default: 'normal'

  // REQUIRED: Review content
  review_title: string;  // Short summary
  review_description: string;  // Detailed explanation
}
```

### Optional Fields (Strongly Recommended)

Same optional fields as Pass 1 - Pass 2 uses identical table structure.

## Example Extractions (Pass 2 CREATE)

### Example 1: Clinical Classification Uncertainty
```json
{
  "patient_id": "uuid-of-patient",
  "processing_session_id": "uuid-of-session",
  "shell_file_id": "uuid-of-shell-file",
  "review_type": "clinical_accuracy",
  "priority": "high",
  "ai_confidence_score": 0.680,
  "ai_concerns": ["ambiguous_clinical_context", "missing_date_information"],
  "flagged_issues": ["incomplete_clinical_event"],
  "review_title": "Clinical Enrichment Uncertainty - Medication Timing",
  "review_description": "Detected medication 'Metformin 500mg' but unable to determine start date or frequency with sufficient confidence. Context suggests 'twice daily' but text is ambiguous. Clinical enrichment confidence: 68%.",
  "ai_suggestions": "Verify medication timing and frequency. Check surrounding context for date indicators.",
  "clinical_context": {
    "entity_id": "entity_025",
    "entity_subtype": "medication",
    "detected_text": "Metformin 500mg",
    "context_snippet": "...prescribed Metformin 500mg, taking regularly...",
    "pass2_confidence": 0.680,
    "missing_fields": ["start_date", "frequency"]
  },
  "estimated_review_time": "00:08:00"
}
```

### Example 2: Medical Coding Ambiguity
```json
{
  "patient_id": "uuid-of-patient",
  "processing_session_id": "uuid-of-session",
  "shell_file_id": "uuid-of-shell-file",
  "review_type": "clinical_accuracy",
  "priority": "normal",
  "ai_confidence_score": 0.720,
  "ai_concerns": ["multiple_possible_codes", "unclear_severity"],
  "flagged_issues": ["coding_uncertainty"],
  "review_title": "ICD-10 Coding Ambiguity - Hypertension",
  "review_description": "Detected 'hypertension' diagnosis but unclear if essential (I10) or secondary (I15). Document mentions 'high blood pressure' without further specificity. Clinical coding confidence: 72%.",
  "ai_suggestions": "Determine if essential or secondary hypertension based on document context. Check for underlying causes mentioned.",
  "clinical_context": {
    "entity_id": "entity_048",
    "entity_subtype": "diagnosis",
    "detected_text": "hypertension",
    "possible_codes": ["I10", "I15.0", "I15.9"],
    "code_confidence": {"I10": 0.72, "I15.0": 0.18, "I15.9": 0.10}
  }
}
```

### Example 3: No Pass 2 Review Required
**No CREATE operation** - Pass 2 only creates review items if clinical enrichment confidence is insufficient.

## Critical Notes (Pass 2 CREATE)

1. **CREATE Operation**: Pass 2 creates NEW review queue items (does NOT update Pass 1 items).

2. **Review Type**: Pass 2 typically uses 'clinical_accuracy' to distinguish from Pass 1 reviews.

3. **Optional Creation**: Pass 2 review items are OPTIONAL - only create if clinical enrichment confidence is low.

4. **Same Table Structure**: Uses identical table structure as Pass 1 - no Pass 2-specific fields.

5. **Priority Guidance**:
   - high: Clinical data with significant uncertainty
   - normal: Ambiguous coding or classification
   - low: Optional clinical verification

6. **Non-Blocking**: Pass 2 review items typically do NOT block processing (unlike Pass 1 critical/urgent).

7. **Clinical Focus**: Pass 2 reviews focus on clinical accuracy, medical coding, temporal relationships.

8. **AI Concerns** (Pass 2 examples):
   - ambiguous_clinical_context
   - missing_date_information
   - multiple_possible_codes
   - unclear_severity
   - incomplete_clinical_event

9. **Clinical Context**: Include entity_id, pass2_confidence, missing_fields for reviewer.

10. **Assignment**: May assign to clinical review team or medical coding specialists.

## Schema Validation Checklist (Pass 2 CREATE)

Same validation rules as Pass 1 - identical table structure.

## Database Constraint Notes

Same constraints as Pass 1 - no Pass 2-specific constraints.

## Pass 1 vs Pass 2 Review Types

**Pass 1 Review Types:**
- entity_validation: AI-OCR discrepancies
- profile_classification: Patient identity uncertainty
- low_confidence: Overall detection confidence
- contamination_risk: Multiple patient data
- safety_concern: Safety-critical issues

**Pass 2 Review Types:**
- clinical_accuracy: Clinical enrichment uncertainty
- May also use low_confidence for clinical coding

**Key Difference:** Pass 1 reviews often BLOCK processing (critical/urgent), Pass 2 reviews typically do NOT.

## Create Operation Pattern

```typescript
// Pass 2 creates NEW review items if clinical confidence is low
if (clinicalConfidence < 0.75) {
  await supabase.from('manual_review_queue').insert({
    patient_id: patientId,
    processing_session_id: sessionId,
    shell_file_id: shellFileId,
    review_type: 'clinical_accuracy',
    priority: clinicalConfidence < 0.65 ? 'high' : 'normal',
    ai_confidence_score: clinicalConfidence,
    ai_concerns: ['ambiguous_clinical_context'],
    review_title: 'Clinical Enrichment Uncertainty',
    review_description: `Unable to enrich entity with sufficient confidence (${(clinicalConfidence * 100).toFixed(0)}%)...`,
    ai_suggestions: 'Verify clinical classification and temporal relationships.',
    clinical_context: {
      entity_id: entityId,
      pass2_confidence: clinicalConfidence,
      missing_fields: missingFields
    }
  });
}
```

## Use Cases

1. **Clinical Coding Uncertainty**: Ambiguous diagnosis/procedure codes requiring specialist review
2. **Temporal Ambiguity**: Missing dates or unclear temporal relationships
3. **Incomplete Clinical Events**: Missing critical fields (dosage, frequency, severity)
4. **Classification Uncertainty**: Unclear entity subtype or clinical category
5. **Quality Assurance**: Optional clinical verification for high-value data
