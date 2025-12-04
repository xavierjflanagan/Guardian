# shell_files Bridge Schema (Source) - Pass 2 UPDATE Version

**Status:** ✅ Created from Database Schema
**Database Source:** /current_schema/03_clinical_core.sql (lines 96-154)
**Last Updated:** 1 October 2025
**Priority:** CRITICAL - Document container completion tracking, multi-pass table

## Multi-Pass Context

- **This is the Pass 2 UPDATE version of shell_files**
- Pass 1 CREATES the file record during upload
- Pass 2 UPDATES status to 'completed' after clinical enrichment finishes
- Pass 3 will UPDATE synthesis fields (ai_synthesized_summary, narrative_count, synthesis_completed_at)
- Foreign key referenced by patient_vitals.source_shell_file_id

## Database Table Structure (Pass 2 UPDATE Fields)

```sql
-- Pass 2 UPDATE operation modifies these fields:
UPDATE shell_files SET
    status = 'completed',  -- Update from 'processing' to 'completed' (or 'failed')
    processing_completed_at = COALESCE(processing_completed_at, NOW()),  -- Only set if NULL (avoid overwriting)
    processing_cost_estimate = processing_cost_estimate + pass2_costs,  -- Add Pass 2 costs to Pass 1 costs
    processing_duration_seconds = EXTRACT(EPOCH FROM (NOW() - processing_started_at))::INTEGER  -- Calculate total duration
WHERE id = shell_file_id
  AND status = 'processing';  -- Safety check: only update if still processing
```

## AI Extraction Requirements for Pass 2 UPDATE

Pass 2 UPDATES the existing shell_files record to mark clinical enrichment as complete.

### Fields Updated by Pass 2

```typescript
interface ShellFilesPass2UpdateExtraction {
  // PASS 2 UPDATES THESE FIELDS
  status?: 'completed' | 'failed';         // Update to 'completed' after successful enrichment, or 'failed' on error
  processing_completed_at?: string;        // TIMESTAMPTZ - set if Pass 1 didn't already set it
  processing_cost_estimate?: number;       // DECIMAL(10,4) - ADD Pass 2 costs to existing Pass 1 value
  processing_duration_seconds?: number;    // INTEGER - calculate total processing time
  processing_error?: object;               // JSONB - populate if Pass 2 fails

  // PASS 2 DOES NOT MODIFY THESE (Pass 1 ownership)
  // patient_id, filename, original_filename, file_size_bytes, mime_type, storage_path
  // file_type, file_subtype, confidence_score, extracted_text, ocr_confidence, page_count
  // processing_started_at, processing_job_id, processing_worker_id, processing_priority
  // idempotency_key, language_detected, provider_name, facility_name, upload_context
  // processed_image_path, processed_image_checksum, processed_image_mime (Phase 2 optimization - Pass 1 writes)

  // PASS 3 WILL UPDATE THESE (NOT Pass 2)
  // ai_synthesized_summary, narrative_count, synthesis_completed_at
}
```

## Example Extractions (Pass 2 UPDATE)

### Example 1: Successful Clinical Enrichment Complete
```json
{
  "status": "completed",
  "processing_completed_at": "2025-01-01T12:36:22Z",
  "processing_cost_estimate": 0.0325,
  "processing_duration_seconds": 146
}
```

### Example 2: Clinical Enrichment Failed
```json
{
  "status": "failed",
  "processing_completed_at": "2025-01-15T09:32:10Z",
  "processing_error": {
    "error_code": "ENRICHMENT_FAILURE",
    "error_message": "Unable to classify clinical entities - low confidence across all detected entities",
    "pass": "pass-2",
    "retry_count": 2,
    "can_retry": true
  },
  "processing_cost_estimate": 0.0185
}
```

### Example 3: Minimal Update (Status Only)
```json
{
  "status": "completed"
}
```

## Critical Notes (Pass 2 UPDATE)

1. **Multi-Pass Table**: Pass 2 UPDATES record created by Pass 1. Does NOT create new records.

2. **Status Update**: Primary Pass 2 responsibility is updating status from 'processing' to 'completed' or 'failed'.

3. **Cost Accumulation**: processing_cost_estimate should ADD Pass 2 costs to existing Pass 1 value, not replace it.

4. **Completion Timestamp**: Set processing_completed_at if Pass 1 didn't already set it (e.g., Pass 1 failed mid-processing).

5. **Duration Calculation**: processing_duration_seconds = total time from processing_started_at to completion.

6. **Error Handling**: If Pass 2 fails, set status='failed' and populate processing_error with Pass 2 error details.

7. **Pass 1 Fields Unchanged**: Pass 2 does NOT modify file metadata, classification, or OCR results from Pass 1.

8. **Pass 3 Fields Unchanged**: Pass 2 does NOT modify ai_synthesized_summary, narrative_count, or synthesis_completed_at.

9. **Idempotency**: Pass 2 UPDATE should be idempotent - safe to retry if interrupted.

10. **Minimal Updates Allowed**: Pass 2 can update just status='completed' if that's all that's needed.

## Schema Validation Checklist (Pass 2 UPDATE)

- [ ] `status` (if updated) is 'completed' or 'failed'
- [ ] `processing_completed_at` (if updated) is valid TIMESTAMPTZ
- [ ] `processing_cost_estimate` (if updated) ADDS to existing value, doesn't replace
- [ ] `processing_duration_seconds` (if updated) is positive integer
- [ ] `processing_error` (if populated) is valid JSONB with pass='pass-2'
- [ ] Pass 1 fields are NOT modified
- [ ] Pass 3 fields are NOT modified

## Database Constraint Notes

- **Status values**: Must still be one of 5 enum values ('completed' or 'failed' for Pass 2)
- **NOT NULL status**: status field is NOT NULL, so Pass 2 must provide value when changing status (other updates may not require status change)
- **Cost precision**: processing_cost_estimate uses DECIMAL(10,4) - 4 decimal places
- **Timestamp format**: processing_completed_at is TIMESTAMPTZ - ISO 8601 with timezone
- **COALESCE usage**: Use COALESCE(processing_completed_at, NOW()) to avoid overwriting existing timestamp

## Pass 1 vs Pass 2 vs Pass 3 Field Ownership

**Pass 1 CREATE populates:**
- All physical file metadata (filename, size, MIME type, storage path)
- Initial processing status (status='uploaded' or 'processing')
- File classification (file_type, file_subtype, confidence_score)
- Content analysis (extracted_text, ocr_confidence, page_count)
- Job coordination (processing_job_id, processing_worker_id, etc.)
- Initial analytics (processing_cost_estimate with Pass 1 costs only)
- Upload metadata (language_detected, provider_name, facility_name, upload_context)

**Pass 2 UPDATE modifies:**
- status (update to 'completed' or 'failed' after clinical enrichment)
- processing_completed_at (if not already set by Pass 1)
- processing_cost_estimate (ADD Pass 2 costs to Pass 1 costs)
- processing_duration_seconds (calculate total time)
- processing_error (if Pass 2 fails)

**Pass 3 UPDATE populates:**
- ai_synthesized_summary (intelligent overview of all narratives)
- narrative_count (number of clinical narratives created)
- synthesis_completed_at (when Pass 3 synthesis completed)

## Update Operation Pattern

```sql
-- Pass 2 UPDATE operation example:
UPDATE shell_files
SET
    status = 'completed',
    processing_completed_at = COALESCE(processing_completed_at, NOW()),  -- Only set if NULL
    processing_cost_estimate = processing_cost_estimate + 0.0200,  -- Add Pass 2 costs
    processing_duration_seconds = EXTRACT(EPOCH FROM (NOW() - processing_started_at))::INTEGER,
    updated_at = NOW()  -- Automatic trigger handles this
WHERE id = $1  -- shell_file_id from context
  AND status = 'processing';  -- Safety check: only update if still processing
```
