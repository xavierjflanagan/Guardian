# manual_review_queue Bridge Schema (Source) - Pass 1 CREATE Version

**Status:** ✅ Created from Database Schema
**Database Source:** /current_schema/04_ai_processing.sql (lines 329-382)
**Last Updated:** 1 October 2025
**Priority:** CRITICAL - Human review queue for Pass 1 low-confidence detection, final table in multi-pass series

## Multi-Pass Context

- **This is the Pass 1 CREATE version of manual_review_queue**
- Pass 1 CREATES review queue items for entity detection issues
- Pass 2 MAY CREATE additional items for clinical enrichment concerns
- Used to gate processing when confidence is too low or safety concerns detected
- Critical for patient safety and contamination prevention

## Database Table Structure (Pass 1 CREATE Fields)

```sql
-- Pass 1 CREATE operation populates these fields:
INSERT INTO manual_review_queue (
    -- Primary references (REQUIRED)
    patient_id,
    processing_session_id,
    shell_file_id,

    -- Review context (REQUIRED)
    review_type,  -- 'entity_validation', 'profile_classification', 'safety_concern', 'low_confidence', 'contamination_risk'
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

## AI Extraction Requirements for Pass 1 CREATE

Pass 1 CREATES manual review queue items when confidence is low or safety concerns detected.

### Required Fields (Pass 1 Must Provide)

```typescript
interface ManualReviewQueuePass1CreateExtraction {
  // REQUIRED: Primary references
  patient_id: string;  // UUID from context
  processing_session_id: string;  // UUID from context
  shell_file_id: string;  // UUID from context

  // REQUIRED: Review context
  review_type: 'entity_validation' | 'profile_classification' | 'safety_concern' | 'low_confidence' | 'contamination_risk';
  priority?: 'low' | 'normal' | 'high' | 'urgent' | 'critical';  // Default: 'normal'

  // REQUIRED: Review content
  review_title: string;  // Short summary
  review_description: string;  // Detailed explanation
}
```

### Optional Fields (Strongly Recommended)

```typescript
interface ManualReviewQueuePass1OptionalFields {
  // AI Processing Context
  ai_confidence_score?: number;  // 0.000-1.000
  ai_concerns?: string[];  // ["low_ocr_confidence", "handwriting_detected"]
  flagged_issues?: string[];  // ["potential_contamination", "unclear_identity"]

  // Review Content
  ai_suggestions?: string;  // What AI recommends human reviewer should focus on
  clinical_context?: object;  // Additional context (JSONB)

  // Assignment
  assigned_reviewer?: string;  // User identifier or role
  assigned_at?: string;  // ISO 8601 timestamp
  estimated_review_time?: string;  // PostgreSQL INTERVAL (default: "15 minutes")
}
```

### Fields NOT Set by Pass 1 (Human Reviewer or Pass 2)

```typescript
interface ManualReviewQueueReviewerFields {
  // Human reviewer populates these during/after review:
  review_status: string;  // Pass 1 sets 'pending', reviewer updates
  reviewer_decision?: string;  // 'approved', 'rejected', 'needs_modification', 'escalate', 'defer'
  reviewer_notes?: string;
  modifications_required?: object;
  review_started_at?: string;
  review_completed_at?: string;
  actual_review_time?: string;
  review_quality_score?: number;
  reviewer_confidence?: number;
}
```

## Example Extractions (Pass 1 CREATE)

### Example 1: Low Confidence Entity Detection
```json
{
  "patient_id": "uuid-of-patient",
  "processing_session_id": "uuid-of-session",
  "shell_file_id": "uuid-of-shell-file",
  "review_type": "low_confidence",
  "priority": "high",
  "ai_confidence_score": 0.620,
  "ai_concerns": ["low_ocr_confidence", "handwriting_detected", "ai_ocr_discrepancy"],
  "flagged_issues": ["unclear_medication_dosage"],
  "review_title": "Low Confidence Medication Detection",
  "review_description": "Detected medication 'Lisinopril' with dosage, but OCR interpreted '10mg' as '1Omg' (digit-letter confusion). AI confidence: 62%. Handwritten notation present.",
  "ai_suggestions": "Verify medication name and dosage. Check for other handwritten entries on same page.",
  "clinical_context": {
    "page_number": 2,
    "section": "medications",
    "entity_id": "entity_012",
    "ocr_text": "Lisinopril 1Omg daily",
    "ai_interpretation": "Lisinopril 10mg daily"
  },
  "estimated_review_time": "00:05:00"
}
```

### Example 2: Profile Classification Uncertainty
```json
{
  "patient_id": "uuid-of-patient",
  "processing_session_id": "uuid-of-session",
  "shell_file_id": "uuid-of-shell-file",
  "review_type": "profile_classification",
  "priority": "urgent",
  "ai_confidence_score": 0.550,
  "ai_concerns": ["multiple_names_detected", "age_mismatch"],
  "flagged_issues": ["potential_contamination"],
  "review_title": "Uncertain Patient Identity",
  "review_description": "Document contains name 'Sarah Johnson' but also mentions 'Emily Johnson' multiple times. Age indicators suggest different individuals. Possible family document contamination.",
  "ai_suggestions": "Determine if document belongs to single patient or contains mixed patient data. May require document split or rejection.",
  "clinical_context": {
    "detected_names": ["Sarah Johnson", "Emily Johnson"],
    "age_indicators": ["42 years old", "8 years old"],
    "relationship_mentions": ["mother", "daughter"]
  },
  "assigned_reviewer": "profile_safety_team",
  "estimated_review_time": "00:10:00"
}
```

### Example 3: Safety Concern (Contamination Risk)
```json
{
  "patient_id": "uuid-of-patient",
  "processing_session_id": "uuid-of-session",
  "shell_file_id": "uuid-of-shell-file",
  "review_type": "contamination_risk",
  "priority": "critical",
  "ai_confidence_score": 0.320,
  "ai_concerns": ["multiple_patient_identifiers", "conflicting_demographics"],
  "flagged_issues": ["safety_concern", "potential_data_breach"],
  "review_title": "CRITICAL: Multiple Patient Data Detected",
  "review_description": "Document contains medical data for at least 2 different patients. Names: 'John Smith' and 'Mary Jones'. DOBs: 1975-03-15 and 1982-11-20. IMMEDIATE REVIEW REQUIRED.",
  "ai_suggestions": "DO NOT PROCESS. Quarantine document. Verify intended patient. Possible document contamination or multi-patient record.",
  "clinical_context": {
    "contamination_indicators": {
      "patient_1": {"name": "John Smith", "dob": "1975-03-15"},
      "patient_2": {"name": "Mary Jones", "dob": "1982-11-20"}
    },
    "document_type": "unknown_mixed"
  },
  "assigned_reviewer": "safety_team",
  "priority": "critical",
  "estimated_review_time": "00:15:00"
}
```

### Example 4: Entity Validation (AI-OCR Discrepancy)
```json
{
  "patient_id": "uuid-of-patient",
  "processing_session_id": "uuid-of-session",
  "shell_file_id": "uuid-of-shell-file",
  "review_type": "entity_validation",
  "priority": "normal",
  "ai_confidence_score": 0.780,
  "ai_concerns": ["ai_ocr_disagreement"],
  "flagged_issues": ["numeric_interpretation_uncertainty"],
  "review_title": "Blood Pressure Reading Verification",
  "review_description": "AI detected blood pressure '120/80 mmHg' but OCR read '120/8O mmHg' (letter O instead of zero). Medium discrepancy requiring verification.",
  "ai_suggestions": "Verify second number is '80' not '8O'. Check other vital signs on same page for consistency.",
  "clinical_context": {
    "entity_id": "entity_005",
    "entity_category": "clinical_event",
    "entity_subtype": "vital_sign_blood_pressure",
    "ai_visual_interpretation": "120/80 mmHg",
    "ocr_reference_text": "120/8O mmHg",
    "ai_ocr_agreement_score": 0.850
  }
}
```

### Example 5: Minimal Required Fields Only
```json
{
  "patient_id": "uuid-of-patient",
  "processing_session_id": "uuid-of-session",
  "shell_file_id": "uuid-of-shell-file",
  "review_type": "low_confidence",
  "review_title": "Low Confidence Detection",
  "review_description": "Entity detected with confidence below threshold. Manual verification required."
}
```

## Critical Notes (Pass 1 CREATE)

1. **CREATE Operation**: Pass 1 creates ONE review queue item per issue requiring manual review.

2. **Review Types** (Pass 1 focus):
   - entity_validation: AI-OCR discrepancies, unclear entities
   - profile_classification: Patient identity uncertainty
   - low_confidence: Overall confidence below threshold
   - contamination_risk: Multiple patient data detected
   - safety_concern: Safety-critical issues

3. **Priority Levels**:
   - critical: Safety concerns, contamination risk (BLOCKING)
   - urgent: Profile classification issues (BLOCKING)
   - high: Low confidence clinical data
   - normal: Entity validation, minor discrepancies
   - low: Optional verification

4. **Processing Gates**: Critical/urgent reviews BLOCK Pass 2 processing until resolved.

5. **AI Concerns**: Array of technical issues detected (["low_ocr_confidence", "handwriting_detected"]).

6. **Flagged Issues**: Array of business/safety issues (["potential_contamination", "unclear_identity"]).

7. **Review Content**: review_title (short) + review_description (detailed) are REQUIRED.

8. **AI Suggestions**: Guide human reviewer to focus areas (strongly recommended).

9. **Clinical Context**: JSONB with additional metadata for reviewer (page numbers, entity IDs, etc.).

10. **Assignment**: May optionally assign to specific reviewer or role during Pass 1.

11. **Estimated Review Time**: Default 15 minutes, adjust based on complexity.

12. **Pass 2 Blocking**: Critical/urgent reviews should block Pass 2 until completed.

## Schema Validation Checklist (Pass 1 CREATE)

- [ ] `patient_id` is valid UUID (NOT NULL)
- [ ] `processing_session_id` is valid UUID (NOT NULL)
- [ ] `shell_file_id` is valid UUID (NOT NULL)
- [ ] `review_type` is one of 6 enum values (NOT NULL)
- [ ] `priority` is one of 5 enum values (defaults to 'normal')
- [ ] `review_title` is non-empty (NOT NULL)
- [ ] `review_description` is non-empty (NOT NULL)
- [ ] `ai_confidence_score` (if provided) is 0.000-1.000
- [ ] `ai_concerns` (if provided) is TEXT[] array
- [ ] `flagged_issues` (if provided) is TEXT[] array
- [ ] `clinical_context` (if provided) is valid JSONB
- [ ] `estimated_review_time` (if provided) is valid INTERVAL
- [ ] `review_status` defaults to 'pending'
- [ ] All reviewer fields are NULL until review starts

## Database Constraint Notes

- **Review types**: Must be 'entity_validation', 'profile_classification', 'clinical_accuracy', 'safety_concern', 'low_confidence', or 'contamination_risk'
- **Priorities**: Must be 'low', 'normal', 'high', 'urgent', or 'critical'
- **Review status**: Defaults to 'pending' ('pending', 'in_review', 'completed', 'escalated', 'deferred')
- **NUMERIC precision**: ai_confidence_score, review_quality_score, reviewer_confidence all (4,3)
- **TEXT[] arrays**: ai_concerns, flagged_issues
- **JSONB**: clinical_context, modifications_required
- **INTERVAL**: estimated_review_time (default '15 minutes'), actual_review_time
- **Foreign keys**: All ON DELETE CASCADE for patient_id, processing_session_id, shell_file_id

## Pass 1 vs Pass 2 Field Ownership

**Pass 1 CREATE populates:**
- All primary references (patient_id, processing_session_id, shell_file_id)
- All review context (review_type, priority, ai_confidence_score, ai_concerns, flagged_issues)
- All review content (review_title, review_description, ai_suggestions, clinical_context)
- Initial assignment (assigned_reviewer, assigned_at, estimated_review_time)
- review_status initialization ('pending')

**Human Reviewer populates:**
- reviewer_decision ('approved', 'rejected', etc.)
- reviewer_notes
- modifications_required
- review_started_at, review_completed_at, actual_review_time
- review_quality_score, reviewer_confidence
- Updates review_status ('in_review' → 'completed', 'escalated', 'deferred')

**Pass 2 MAY CREATE NEW ITEMS:**
- Pass 2 may create additional review queue items for clinical enrichment concerns
- Uses review_type='clinical_accuracy' for Pass 2-specific issues

## Processing Gate Pattern

```typescript
// Check if critical/urgent reviews block Pass 2
const blockingReviews = await supabase
  .from('manual_review_queue')
  .select('id, review_type, priority, review_status')
  .eq('processing_session_id', sessionId)
  .in('priority', ['critical', 'urgent'])
  .neq('review_status', 'completed');

if (blockingReviews.data && blockingReviews.data.length > 0) {
  // BLOCK Pass 2 processing
  throw new Error('Critical/urgent manual reviews required before continuing');
}

// Proceed to Pass 2
```

## Review Queue Prioritization

**Critical (BLOCKING):**
- contamination_risk
- safety_concern with multiple patients

**Urgent (BLOCKING):**
- profile_classification uncertainty
- contamination_risk with unclear identity

**High (NON-BLOCKING):**
- low_confidence clinical data (medications, diagnoses)
- entity_validation with high discrepancy

**Normal (NON-BLOCKING):**
- entity_validation with medium discrepancy
- low_confidence non-critical data

**Low (OPTIONAL):**
- entity_validation with low discrepancy
- Optional verification requests
