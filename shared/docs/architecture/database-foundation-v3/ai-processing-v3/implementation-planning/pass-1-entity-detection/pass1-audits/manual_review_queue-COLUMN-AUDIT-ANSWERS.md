# Manual Review Queue Table - Column-by-Column Audit

**Audit Date:** 2025-10-09
**Sample Record:** `5e7ed3be-b80b-47d2-a566-62f0cbe65f7e` (created: 2025-10-08 01:29:35 UTC)
**Table Purpose:** Queue system for flagging AI-processed entities that require human validation due to low confidence, discrepancies, or policy triggers. Supports manual review workflow across all processing passes.

---

## Sample Record Overview

```json
{
  "id": "5e7ed3be-b80b-47d2-a566-62f0cbe65f7e",
  "patient_id": "d1dbe18c-afc2-421f-bd58-145ddb48cbca",
  "processing_session_id": "2792287e-96ed-401c-8f2a-70039cde1db6",
  "shell_file_id": "879a4cd2-c94f-47eb-9a46-ae1223eacac5",
  "review_type": "entity_validation",
  "priority": "low",
  "ai_confidence_score": "0.950",
  "ai_concerns": ["AI-OCR discrepancy: concatenation"],
  "flagged_issues": [],
  "review_title": "Low Confidence Entity: provider_identifier",
  "review_description": "Entity \"South Coast Medical\" detected with 95% confidence. Manual review recommended.",
  "ai_suggestions": "Verify the classification of this entity and confirm the extracted text is accurate.",
  "clinical_context": {
    "location": "top-right header block",
    "entity_id": "ent_011",
    "original_text": "South Coast Medical",
    "entity_subtype": "provider_identifier",
    "entity_category": "healthcare_context"
  },
  "assigned_reviewer": null,
  "assigned_at": null,
  "estimated_review_time": "00:15:00",
  "review_status": "pending",
  "reviewer_decision": null,
  "reviewer_notes": null,
  "modifications_required": {},
  "review_started_at": null,
  "review_completed_at": null,
  "actual_review_time": null,
  "review_quality_score": null,
  "reviewer_confidence": null,
  "created_at": "2025-10-08 01:29:35.361042+00",
  "updated_at": "2025-10-08 01:29:35.361042+00"
}
```

---

## Column-by-Column Analysis

### Primary Keys and Identifiers

#### 1. `id` (UUID, PRIMARY KEY, NOT NULL)
- **Purpose:** Unique identifier for each review queue item
- **Sample Value:** `5e7ed3be-b80b-47d2-a566-62f0cbe65f7e`
- **Populated By:** System (PostgreSQL UUID generation)
- **NULL Status:** ✅ NEVER NULL (enforced)
- **Correctness:** ✅ CORRECT

---

### Foreign Key References

#### 2. `patient_id` (UUID, REFERENCES user_profiles(id), NOT NULL)
- **Purpose:** Links to the patient whose data is being reviewed
- **Sample Value:** `d1dbe18c-afc2-421f-bd58-145ddb48cbca`
- **Populated By:** System (inherited from processing session)
- **NULL Status:** ✅ NEVER NULL (enforced)
- **RLS Impact:** Used for has_profile_access() filtering
- **Correctness:** ✅ CORRECT

#### 3. `processing_session_id` (UUID, REFERENCES ai_processing_sessions(id), NOT NULL)
- **Purpose:** Links to the AI processing session that generated this review item
- **Sample Value:** `2792287e-96ed-401c-8f2a-70039cde1db6`
- **Populated By:** System (from active session)
- **NULL Status:** ✅ NEVER NULL (enforced)
- **Cascade Behavior:** ON DELETE CASCADE (review deleted if session deleted)
- **Correctness:** ✅ CORRECT

#### 4. `shell_file_id` (UUID, REFERENCES shell_files(id), NOT NULL)
- **Purpose:** Links to the specific document being reviewed
- **Sample Value:** `879a4cd2-c94f-47eb-9a46-ae1223eacac5`
- **Populated By:** System (from processing session)
- **NULL Status:** ✅ NEVER NULL (enforced)
- **Cascade Behavior:** ON DELETE CASCADE (review deleted if document deleted)
- **Correctness:** ✅ CORRECT

---

### Review Classification

#### 5. `review_type` (TEXT, NOT NULL)
- **Purpose:** Categorizes the type of review needed
- **Sample Value:** `"entity_validation"`
- **Populated By:** AI Worker (based on triggering condition)
- **NULL Status:** ✅ NEVER NULL (enforced)
- **Allowed Values:**
  - `entity_validation` - Verify entity detection accuracy
  - `profile_classification` - Manual profile matching
  - `quality_check` - General quality review
  - `ai_hallucination` - Suspected AI fabrication
  - `ocr_discrepancy` - Vision vs OCR mismatch
- **Correctness:** ✅ CORRECT - Sample shows entity_validation usage

#### 6. `priority` (TEXT, NOT NULL, DEFAULT 'medium')
- **Purpose:** Review urgency level for triage
- **Sample Value:** `"low"`
- **Populated By:** AI Worker (based on confidence score and impact)
- **NULL Status:** ✅ NEVER NULL (has default)
- **Allowed Values:**
  - `critical` - Blocking processing, immediate review
  - `high` - Significant clinical impact
  - `medium` - Standard review priority
  - `low` - Minor issues, review when convenient
- **Correctness:** ✅ CORRECT - Low priority for 95% confidence entity

#### 7. `ai_confidence_score` (NUMERIC(5,3), NOT NULL)
- **Purpose:** AI's confidence in the flagged item (before flagging)
- **Sample Value:** `0.950` (95%)
- **Populated By:** AI Worker (from entity detection output)
- **NULL Status:** ✅ NEVER NULL (enforced)
- **Range:** 0.000 to 1.000
- **Correctness:** ✅ CORRECT - Paradox explained: high confidence but flagged due to OCR discrepancy

---

### Issue Documentation

#### 8. `ai_concerns` (JSONB ARRAY, NOT NULL, DEFAULT '[]')
- **Purpose:** List of AI-detected concerns that triggered review
- **Sample Value:** `["AI-OCR discrepancy: concatenation"]`
- **Populated By:** AI Worker (automatic concern detection)
- **NULL Status:** ✅ NEVER NULL (has default empty array)
- **Correctness:** ✅ CORRECT - Shows OCR mismatch triggered review despite 95% confidence

#### 9. `flagged_issues` (JSONB ARRAY, NOT NULL, DEFAULT '[]')
- **Purpose:** Human-reviewers can add additional concerns during review
- **Sample Value:** `[]` (empty - no human review yet)
- **Populated By:** Human Reviewer (during review process)
- **NULL Status:** ✅ NEVER NULL (has default empty array)
- **Correctness:** ✅ CORRECT - Empty because review_status is "pending"

---

### Review Instructions

#### 10. `review_title` (TEXT, NOT NULL)
- **Purpose:** Short summary for review queue UI
- **Sample Value:** `"Low Confidence Entity: provider_identifier"`
- **Populated By:** AI Worker (generated from review context)
- **NULL Status:** ✅ NEVER NULL (enforced)
- **Correctness:** ⚠️ MISLEADING - Title says "Low Confidence" but score is 95% (high confidence)
  - **Issue:** Title generation logic may not account for OCR-discrepancy triggers
  - **Should Say:** "OCR Discrepancy: provider_identifier" (more accurate)

#### 11. `review_description` (TEXT, NOT NULL)
- **Purpose:** Detailed explanation of what needs review
- **Sample Value:** `"Entity \"South Coast Medical\" detected with 95% confidence. Manual review recommended."`
- **Populated By:** AI Worker (context-aware description)
- **NULL Status:** ✅ NEVER NULL (enforced)
- **Correctness:** ✅ CORRECT - Provides entity text and confidence clearly

#### 12. `ai_suggestions` (TEXT, NULLABLE)
- **Purpose:** AI-generated recommendations for reviewer
- **Sample Value:** `"Verify the classification of this entity and confirm the extracted text is accurate."`
- **Populated By:** AI Worker (context-specific guidance)
- **NULL Status:** ⚠️ CAN BE NULL (but SHOULDN'T be for entity_validation reviews)
- **Correctness:** ✅ CORRECT - Helpful guidance for reviewer

#### 13. `clinical_context` (JSONB, NOT NULL)
- **Purpose:** Structured context data to help reviewer understand the issue
- **Sample Value:**
  ```json
  {
    "location": "top-right header block",
    "entity_id": "ent_011",
    "original_text": "South Coast Medical",
    "entity_subtype": "provider_identifier",
    "entity_category": "healthcare_context"
  }
  ```
- **Populated By:** AI Worker (from entity detection output)
- **NULL Status:** ✅ NEVER NULL (enforced)
- **Correctness:** ✅ CORRECT - Rich context for reviewer decision-making

---

### Review Assignment

#### 14. `assigned_reviewer` (UUID, REFERENCES auth.users(id), NULLABLE)
- **Purpose:** User assigned to review this item
- **Sample Value:** `null` (unassigned)
- **Populated By:** System (manual assignment or auto-assignment)
- **NULL Status:** ✅ CAN BE NULL (pending assignment)
- **Correctness:** ✅ CORRECT - Null because review_status is "pending"

#### 15. `assigned_at` (TIMESTAMPTZ, NULLABLE)
- **Purpose:** When the review was assigned to a reviewer
- **Sample Value:** `null`
- **Populated By:** System (when assigned_reviewer is set)
- **NULL Status:** ✅ CAN BE NULL (until assigned)
- **Correctness:** ✅ CORRECT - Null because not yet assigned

#### 16. `estimated_review_time` (INTERVAL, NOT NULL, DEFAULT '00:15:00')
- **Purpose:** Estimated time needed for review (for workload planning)
- **Sample Value:** `"00:15:00"` (15 minutes)
- **Populated By:** AI Worker (based on review complexity)
- **NULL Status:** ✅ NEVER NULL (has default)
- **Correctness:** ✅ CORRECT - 15 minutes for entity validation is reasonable

---

### Review Status Tracking

#### 17. `review_status` (TEXT, NOT NULL, DEFAULT 'pending')
- **Purpose:** Current state of the review workflow
- **Sample Value:** `"pending"`
- **Populated By:** System (workflow state machine)
- **NULL Status:** ✅ NEVER NULL (has default)
- **Allowed Values:**
  - `pending` - Awaiting assignment
  - `assigned` - Assigned to reviewer
  - `in_progress` - Reviewer actively working
  - `completed` - Review finished
  - `cancelled` - Review no longer needed
- **Correctness:** ✅ CORRECT - Pending because not yet assigned

---

### Review Outcome

#### 18. `reviewer_decision` (TEXT, NULLABLE)
- **Purpose:** Reviewer's final decision on the flagged item
- **Sample Value:** `null` (not yet reviewed)
- **Populated By:** Human Reviewer (upon completion)
- **NULL Status:** ✅ CAN BE NULL (until completed)
- **Allowed Values:**
  - `approved` - AI output accepted as-is
  - `modified` - AI output corrected
  - `rejected` - AI output discarded
  - `escalated` - Requires specialist review
- **Correctness:** ✅ CORRECT - Null because review not completed

#### 19. `reviewer_notes` (TEXT, NULLABLE)
- **Purpose:** Reviewer's comments and reasoning
- **Sample Value:** `null`
- **Populated By:** Human Reviewer (during/after review)
- **NULL Status:** ✅ CAN BE NULL (optional field)
- **Correctness:** ✅ CORRECT

#### 20. `modifications_required` (JSONB, NOT NULL, DEFAULT '{}')
- **Purpose:** Structured data of corrections made by reviewer
- **Sample Value:** `{}` (empty - no modifications yet)
- **Populated By:** Human Reviewer (if reviewer_decision = "modified")
- **NULL Status:** ✅ NEVER NULL (has default empty object)
- **Correctness:** ✅ CORRECT - Empty because not yet reviewed

---

### Review Timing

#### 21. `review_started_at` (TIMESTAMPTZ, NULLABLE)
- **Purpose:** When reviewer began working on this item
- **Sample Value:** `null`
- **Populated By:** System (when review_status → 'in_progress')
- **NULL Status:** ✅ CAN BE NULL (until started)
- **Correctness:** ✅ CORRECT

#### 22. `review_completed_at` (TIMESTAMPTZ, NULLABLE)
- **Purpose:** When reviewer finished the review
- **Sample Value:** `null`
- **Populated By:** System (when review_status → 'completed')
- **NULL Status:** ✅ CAN BE NULL (until completed)
- **Correctness:** ✅ CORRECT

#### 23. `actual_review_time` (INTERVAL, NULLABLE)
- **Purpose:** Actual time spent reviewing (for process improvement)
- **Sample Value:** `null`
- **Populated By:** System (calculated: review_completed_at - review_started_at)
- **NULL Status:** ✅ CAN BE NULL (until completed)
- **Correctness:** ✅ CORRECT

---

### Review Quality Metrics

#### 24. `review_quality_score` (NUMERIC(5,3), NULLABLE)
- **Purpose:** Quality assessment of the review itself (meta-review)
- **Sample Value:** `null`
- **Populated By:** System or QA Team (post-review audit)
- **NULL Status:** ✅ CAN BE NULL (optional quality tracking)
- **Range:** 0.000 to 1.000
- **Correctness:** ✅ CORRECT

#### 25. `reviewer_confidence` (NUMERIC(5,3), NULLABLE)
- **Purpose:** Reviewer's self-assessed confidence in their decision
- **Sample Value:** `null`
- **Populated By:** Human Reviewer (optional self-rating)
- **NULL Status:** ✅ CAN BE NULL (optional field)
- **Range:** 0.000 to 1.000
- **Correctness:** ✅ CORRECT

---

### System Timestamps

#### 26. `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())
- **Purpose:** When the review item was created
- **Sample Value:** `"2025-10-08 01:29:35.361042+00"`
- **Populated By:** System (automatic)
- **NULL Status:** ✅ NEVER NULL (has default)
- **Correctness:** ✅ CORRECT

#### 27. `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())
- **Purpose:** Last modification timestamp
- **Sample Value:** `"2025-10-08 01:29:35.361042+00"` (same as created_at - never updated)
- **Populated By:** System (trigger on UPDATE)
- **NULL Status:** ✅ NEVER NULL (has default)
- **Correctness:** ✅ CORRECT - Matches created_at because never updated

---

## Critical Findings

### Title Generation Logic Issue (Medium Priority)

**Problem:**
- `review_title` says "Low Confidence Entity: provider_identifier"
- But `ai_confidence_score` is 0.950 (95% - HIGH confidence)
- Review was triggered by `ai_concerns: ["AI-OCR discrepancy: concatenation"]`, not low confidence

**Root Cause:**
Title generation logic likely uses a simple confidence threshold check without considering the actual trigger reason.

**Recommendation:**
Update title generation logic:
```typescript
// Current (likely):
if (confidence < 0.96) {
  title = `Low Confidence Entity: ${subtype}`;
}

// Should be:
if (ai_concerns.includes('AI-OCR discrepancy')) {
  title = `OCR Discrepancy: ${subtype}`;
} else if (confidence < 0.96) {
  title = `Low Confidence Entity: ${subtype}`;
}
```

---

## Action Items

| Priority | Issue | Type | Action Required |
|----------|-------|------|-----------------|
| 🟡 MEDIUM | review_title logic | Title Generation | Update logic to prioritize trigger reason over confidence |
| 🟢 LOW | ai_suggestions NULL handling | Data Quality | Enforce NOT NULL for entity_validation review_type |
| 🔵 INFO | Review workflow implementation | Feature Status | Verify reviewer assignment UI exists |

---

## Verification Queries

### Check Review Queue Status Distribution
```sql
SELECT
  review_status,
  review_type,
  priority,
  COUNT(*) as count,
  AVG(ai_confidence_score) as avg_confidence,
  AVG(EXTRACT(EPOCH FROM actual_review_time)) as avg_review_seconds
FROM manual_review_queue
GROUP BY review_status, review_type, priority
ORDER BY review_status, priority;
```

### Identify Misleading Low Confidence Titles
```sql
SELECT
  id,
  review_title,
  ai_confidence_score,
  ai_concerns,
  review_type
FROM manual_review_queue
WHERE review_title ILIKE '%low confidence%'
  AND ai_confidence_score >= 0.90
ORDER BY ai_confidence_score DESC;
```

### Review Assignment Metrics
```sql
SELECT
  assigned_reviewer,
  COUNT(*) as assigned_count,
  SUM(CASE WHEN review_status = 'completed' THEN 1 ELSE 0 END) as completed_count,
  AVG(EXTRACT(EPOCH FROM actual_review_time)) / 60 as avg_minutes_actual,
  AVG(EXTRACT(EPOCH FROM estimated_review_time)) / 60 as avg_minutes_estimated
FROM manual_review_queue
WHERE assigned_reviewer IS NOT NULL
GROUP BY assigned_reviewer
ORDER BY assigned_count DESC;
```

### OCR Discrepancy Analysis
```sql
SELECT
  shell_file_id,
  review_title,
  ai_confidence_score,
  ai_concerns,
  clinical_context->>'original_text' as entity_text,
  clinical_context->>'entity_subtype' as entity_subtype,
  reviewer_decision
FROM manual_review_queue
WHERE ai_concerns::TEXT ILIKE '%ocr%'
ORDER BY created_at DESC;
```

---

## Schema Correctness Summary

**Total Columns:** 27
**AI-Generated Columns:** 14 (review_type through clinical_context)
**System Columns:** 7 (id, patient_id, processing_session_id, shell_file_id, created_at, updated_at, assigned_reviewer)
**Human Reviewer Columns:** 6 (reviewer_decision, reviewer_notes, modifications_required, review_quality_score, reviewer_confidence, flagged_issues)

**Overall Assessment:** ✅ MOSTLY CORRECT

**Issues Found:**
- 1 Medium Priority: Title generation logic doesn't account for OCR discrepancy triggers
- 1 Low Priority: ai_suggestions should be NOT NULL for entity_validation reviews

**Strengths:**
- Comprehensive workflow tracking (pending → assigned → in_progress → completed)
- Rich context data for reviewer decision-making
- Quality metrics for review process improvement
- Proper cascade behavior for data integrity
- Well-structured JSONB fields for flexibility

---

## Pass 1 Integration Notes

**Review Triggers:**
1. Low confidence entity detection (< 96%)
2. AI-OCR discrepancies (text mismatch)
3. Profile classification uncertainty (multiple matches)
4. Missing required clinical fields
5. Suspicious data patterns (hallucination detection)

**Current Usage:**
- Sample shows entity_validation review for OCR discrepancy
- High confidence (95%) but flagged due to Vision vs OCR mismatch
- Demonstrates proper safety net behavior

**Gate 2 Blocking:**
- If `requires_human_review = true` in profile_classification_audit
- Pass 2 cannot start until manual_review_queue items resolved
- Ensures profile matching accuracy before clinical extraction
