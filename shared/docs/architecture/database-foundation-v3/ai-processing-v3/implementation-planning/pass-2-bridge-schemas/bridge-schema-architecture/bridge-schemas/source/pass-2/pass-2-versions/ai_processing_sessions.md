# ai_processing_sessions Bridge Schema (Source) - Pass 2 UPDATE Version

**Status:** ✅ Created from Database Schema
**Database Source:** /current_schema/04_ai_processing.sql (lines 99-145)
**Last Updated:** 1 October 2025
**Priority:** CRITICAL - Session completion tracking, multi-pass table

## Multi-Pass Context

- **This is the Pass 2 UPDATE version of ai_processing_sessions**
- Pass 1 CREATES session and tracks entity detection
- Pass 2 UPDATES session with clinical enrichment status and completion
- Referenced by all metrics tables via processing_session_id

## Database Table Structure (Pass 2 UPDATE Fields)

```sql
-- Pass 2 UPDATE operation modifies these fields:
UPDATE ai_processing_sessions SET
    session_status = 'completed',  -- Update to 'completed' or 'failed'
    workflow_step = 'completed',  -- Advance through clinical_extraction to completed
    completed_steps = total_steps,  -- Mark all steps complete
    overall_confidence = COALESCE(overall_confidence, new_confidence),  -- Update if needed
    quality_score = new_quality_score,  -- Update with Pass 2 quality
    processing_completed_at = NOW(),  -- Set completion timestamp
    total_processing_time = NOW() - processing_started_at,  -- Calculate total time
    error_message = error_msg,  -- If Pass 2 fails
    error_context = error_ctx,  -- If Pass 2 fails (include pass='pass-2')
    retry_count = retry_count + 1,  -- If retrying
    updated_at = NOW()
WHERE id = $1
  AND session_status = 'processing';  -- Safety check
```

## AI Extraction Requirements for Pass 2 UPDATE

Pass 2 UPDATES existing session to mark clinical enrichment as complete.

### Fields Updated by Pass 2

```typescript
interface AIProcessingSessionsPass2UpdateExtraction {
  // PASS 2 UPDATES THESE FIELDS
  session_status?: 'completed' | 'failed';  // Update after clinical enrichment
  workflow_step?: 'clinical_extraction' | 'completed';  // Advance workflow
  completed_steps?: number;  // Increment or set to total_steps
  overall_confidence?: number;  // Update with Pass 2 clinical confidence
  quality_score?: number;  // Update with Pass 2 quality metrics
  processing_completed_at?: string;  // Set when Pass 2 finishes
  total_processing_time?: string;  // Calculate from started_at to completed_at
  error_message?: string;  // If Pass 2 fails
  error_context?: object;  // If Pass 2 fails (include pass='pass-2')
  retry_count?: number;  // Increment if retrying

  // PASS 2 DOES NOT MODIFY THESE (Pass 1 ownership)
  // patient_id, shell_file_id, session_type, ai_model_version, model_config,
  // processing_mode, total_steps, processing_started_at, max_retries
}
```

## Example Extractions (Pass 2 UPDATE)

### Example 1: Successful Clinical Enrichment
```json
{
  "session_status": "completed",
  "workflow_step": "completed",
  "completed_steps": 5,
  "overall_confidence": 0.920,
  "quality_score": 0.885,
  "processing_completed_at": "2025-01-01T12:36:22Z",
  "total_processing_time": "00:01:26"
}
```
**Note:** `total_processing_time` is PostgreSQL INTERVAL type. String format shown ("00:01:26" for 1 minute 26 seconds) is JSON-compatible representation.

### Example 2: Pass 2 Failed
```json
{
  "session_status": "failed",
  "workflow_step": "clinical_extraction",
  "processing_completed_at": "2025-01-15T09:32:10Z",
  "total_processing_time": "00:01:48",
  "error_message": "Clinical enrichment failed - insufficient clinical entities",
  "error_context": {
    "entities_detected": 3,
    "enrichment_threshold": 5,
    "pass": "pass-2"
  }
}
```

### Example 3: Minimal Update
```json
{
  "session_status": "completed",
  "workflow_step": "completed",
  "processing_completed_at": "2025-01-01T12:36:22Z"
}
```

## Critical Notes (Pass 2 UPDATE)

1. **UPDATE Operation**: Pass 2 updates existing record, does NOT create new session.

2. **Status Update**: Primary responsibility is updating session_status to 'completed' or 'failed'.

3. **Workflow Advancement**: workflow_step advances from 'entity_detection' → 'clinical_extraction' → 'completed'.

4. **Completion Timestamp**: Set processing_completed_at when Pass 2 finishes.

5. **Time Calculation**: total_processing_time = processing_completed_at - processing_started_at (INTERVAL type).

6. **Quality Updates**: May update overall_confidence and quality_score with Pass 2 metrics.

7. **Progress Tracking**: Increment completed_steps or set to total_steps when all done.

8. **Error Handling**: If Pass 2 fails, populate error_message and error_context with pass='pass-2'.

9. **Pass 1 Fields Readonly**: Do NOT modify patient_id, shell_file_id, session_type, processing_started_at.

10. **Idempotency**: Safe to retry. Use WHERE session_status = 'processing' guard.

## Schema Validation Checklist (Pass 2 UPDATE)

- [ ] `session_status` (if updated) is 'completed' or 'failed'
- [ ] `workflow_step` (if updated) is 'clinical_extraction' or 'completed'
- [ ] `completed_steps` (if updated) is ≤ total_steps
- [ ] `processing_completed_at` is valid TIMESTAMPTZ
- [ ] `total_processing_time` is valid INTERVAL format
- [ ] `overall_confidence` (if updated) is 0.000-1.000
- [ ] `quality_score` (if updated) is 0.000-1.000
- [ ] `error_context` (if populated) includes pass='pass-2'
- [ ] Pass 1 fields are NOT modified

## Database Constraint Notes

- **Status values**: Must be one of 5 enum values ('completed' or 'failed' for Pass 2)
- **Workflow values**: Must be one of 7 enum values ('clinical_extraction' or 'completed' for Pass 2)
- **INTERVAL type**: total_processing_time uses PostgreSQL INTERVAL (e.g., "00:01:26")
- **NUMERIC precision**: overall_confidence (4,3), quality_score (4,3)
- **TIMESTAMPTZ**: processing_completed_at is ISO 8601 with timezone

## Pass 1 vs Pass 2 Field Ownership

**Pass 1 CREATE populates:**
- Session metadata (patient_id, shell_file_id, session_type)
- Session status (session_status='initiated' or 'processing')
- AI configuration (ai_model_version, model_config, processing_mode)
- Workflow initialization (workflow_step='entity_detection', total_steps, completed_steps=0)
- Initial quality (overall_confidence, quality_score from entity detection)
- Start time (processing_started_at=NOW())
- Error handling (if Pass 1 fails)

**Pass 2 UPDATE modifies:**
- session_status ('completed' or 'failed')
- workflow_step ('clinical_extraction' → 'completed')
- completed_steps (increment or set to total_steps)
- overall_confidence (may update with clinical confidence)
- quality_score (may update with Pass 2 quality)
- processing_completed_at (set when Pass 2 finishes)
- total_processing_time (calculate duration)
- error_message/error_context (if Pass 2 fails with pass='pass-2')
- retry_count (if retrying)

## Update Operation Pattern

```sql
-- Pass 2 UPDATE example:
UPDATE ai_processing_sessions
SET
    session_status = 'completed',
    workflow_step = 'completed',
    completed_steps = total_steps,
    overall_confidence = COALESCE(overall_confidence, 0.920),
    quality_score = 0.885,
    processing_completed_at = NOW(),
    total_processing_time = NOW() - processing_started_at,
    updated_at = NOW()
WHERE id = $1
  AND session_status = 'processing';
```
