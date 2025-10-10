# shell_files Bridge Schema (Source) - Pass 1 CREATE Version

**Status:** ✅ Created from Database Schema
**Database Source:** /current_schema/03_clinical_core.sql (lines 96-154)
**Last Updated:** 1 October 2025
**Priority:** CRITICAL - Document container foundation, multi-pass table

## Multi-Pass Context

- **This is the Pass 1 CREATE version of shell_files**
- Pass 1 creates the file record during upload and populates entity detection metadata
- Pass 2 will UPDATE with clinical enrichment completion status and Pass 3 synthesis results
- Foreign key referenced by patient_vitals.source_shell_file_id

## Database Table Structure (Pass 1 CREATE Fields)

```sql
CREATE TABLE IF NOT EXISTS shell_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

    -- Physical file metadata (Pass 1 CREATE)
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,

    -- Processing status (Pass 1 CREATE initializes)
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN (
        'uploaded', 'processing', 'completed', 'failed', 'archived'
    )),
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    processing_error JSONB,

    -- File classification (Pass 1 CREATE)
    file_type TEXT CHECK (file_type IN (
        'medical_record', 'lab_result', 'imaging_report', 'prescription',
        'discharge_summary', 'referral', 'insurance_card', 'id_document', 'other'
    )),
    file_subtype TEXT,
    confidence_score NUMERIC(3,2),

    -- Content analysis (Pass 1 CREATE)
    extracted_text TEXT,
    ocr_confidence NUMERIC(3,2),
    page_count INTEGER DEFAULT 1,

    -- POST-PASS 3: Shell File Synthesis (Pass 3 will UPDATE these - NOT Pass 1)
    ai_synthesized_summary TEXT,
    narrative_count INTEGER DEFAULT 0,
    synthesis_completed_at TIMESTAMPTZ,

    -- Job Coordination Integration (Pass 1 CREATE)
    processing_job_id UUID,
    processing_worker_id VARCHAR(100),
    processing_priority INTEGER DEFAULT 100,
    idempotency_key TEXT,

    -- Business Analytics (Pass 1 CREATE initializes, Pass 2 may update)
    processing_cost_estimate DECIMAL(10,4) DEFAULT 0,
    processing_duration_seconds INTEGER,

    -- Upload and processing metadata (Pass 1 CREATE)
    language_detected TEXT DEFAULT 'en',

    -- Healthcare-specific metadata (Pass 1 CREATE if extractable)
    provider_name TEXT,
    facility_name TEXT,
    upload_context TEXT,

    -- Phase 2 Image Processing Optimization (Pass 1 writes after downscaling)
    processed_image_path TEXT,                -- Storage path for downscaled image
    processed_image_checksum TEXT,            -- SHA256 checksum for idempotency
    processed_image_mime TEXT,                -- MIME type of processed image

    -- Audit and lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## AI Extraction Requirements for Pass 1 CREATE

This table is the document container. Pass 1 CREATES the record during file upload and populates metadata from file analysis and entity detection.

### Required Fields (Pass 1 CREATE)

```typescript
interface ShellFilesPass1CreateExtraction {
  // REQUIRED FIELDS (from file upload context)
  patient_id: string;                      // UUID - from upload context (which patient owns this file)
  filename: string;                        // Generated filename for storage
  original_filename: string;               // User's original filename
  file_size_bytes: number;                 // BIGINT - file size in bytes
  mime_type: string;                       // File MIME type (e.g., "application/pdf")
  storage_path: string;                    // Where file is stored in object storage

  // PROCESSING STATUS (Pass 1 initializes)
  status?: 'uploaded' | 'processing' | 'completed' | 'failed' | 'archived';  // Default: 'uploaded'
  processing_started_at?: string;          // TIMESTAMPTZ - when Pass 1 processing started
  processing_completed_at?: string;        // TIMESTAMPTZ - when Pass 1 processing completed
  processing_error?: object;               // JSONB - error details if processing failed

  // FILE CLASSIFICATION (Pass 1 AI vision determines)
  file_type?: 'medical_record' | 'lab_result' | 'imaging_report' | 'prescription' |
              'discharge_summary' | 'referral' | 'insurance_card' | 'id_document' | 'other';
  file_subtype?: string;                   // More specific classification
  confidence_score?: number;               // NUMERIC(3,2) - AI confidence in file_type classification

  // CONTENT ANALYSIS (Pass 1 OCR/vision extracts)
  extracted_text?: string;                 // Full text extracted via OCR
  ocr_confidence?: number;                 // NUMERIC(3,2) - average OCR confidence
  page_count?: number;                     // Number of pages (default: 1)

  // JOB COORDINATION (Pass 1 populates from job context)
  processing_job_id?: string;              // UUID - job queue reference
  processing_worker_id?: string;           // VARCHAR(100) - which worker processed this
  processing_priority?: number;            // INTEGER - processing priority (default: 100)
  idempotency_key?: string;                // Prevents duplicate processing

  // BUSINESS ANALYTICS (Pass 1 initializes)
  processing_cost_estimate?: number;       // DECIMAL(10,4) - estimated cost (default: 0)
  processing_duration_seconds?: number;    // INTEGER - actual processing time

  // UPLOAD METADATA (Pass 1 detects/receives)
  language_detected?: string;              // Language code (default: 'en')

  // HEALTHCARE METADATA (Pass 1 extracts if visible)
  provider_name?: string;                  // Provider name extracted from document
  facility_name?: string;                  // Facility name extracted from document
  upload_context?: string;                 // User-provided context about upload

  // PHASE 2 IMAGE PROCESSING (Pass 1 writes after downscaling)
  processed_image_path?: string;           // Storage path for downscaled image
  processed_image_checksum?: string;       // SHA256 checksum for idempotency
  processed_image_mime?: string;           // MIME type of processed image

  // PASS 3 FIELDS (NOT populated in Pass 1 - Pass 3 will UPDATE these)
  ai_synthesized_summary?: null;           // Pass 1 leaves null, Pass 3 updates
  narrative_count?: 0;                     // Pass 1 defaults to 0, Pass 3 updates
  synthesis_completed_at?: null;           // Pass 1 leaves null, Pass 3 updates
}
```

## Example Extractions (Pass 1 CREATE)

### Example 1: PDF Medical Record Upload
```json
{
  "patient_id": "uuid-from-upload-context",
  "filename": "medical_record_20250101_123456.pdf",
  "original_filename": "Dr_Smith_Visit_2025.pdf",
  "file_size_bytes": 2458624,
  "mime_type": "application/pdf",
  "storage_path": "medical-docs/patient-uuid/medical_record_20250101_123456.pdf",
  "status": "processing",
  "processing_started_at": "2025-01-01T12:34:56Z",
  "file_type": "medical_record",
  "file_subtype": "general_practitioner_visit",
  "confidence_score": 0.92,
  "extracted_text": "[Full OCR text content...]",
  "ocr_confidence": 0.88,
  "page_count": 4,
  "processing_job_id": "uuid-of-job",
  "processing_worker_id": "worker-01",
  "processing_priority": 100,
  "language_detected": "en",
  "provider_name": "Dr. Jane Smith",
  "facility_name": "Sydney Medical Centre",
  "upload_context": "Regular checkup visit",
  "ai_synthesized_summary": null,
  "narrative_count": 0,
  "synthesis_completed_at": null
}
```

### Example 2: Lab Results Image Upload
```json
{
  "patient_id": "uuid-from-upload-context",
  "filename": "lab_results_20250115_093022.jpg",
  "original_filename": "Blood_Test_Results.jpg",
  "file_size_bytes": 1245680,
  "mime_type": "image/jpeg",
  "storage_path": "medical-docs/patient-uuid/lab_results_20250115_093022.jpg",
  "status": "completed",
  "processing_started_at": "2025-01-15T09:30:22Z",
  "processing_completed_at": "2025-01-15T09:31:45Z",
  "file_type": "lab_result",
  "file_subtype": "blood_test",
  "confidence_score": 0.95,
  "extracted_text": "[OCR extracted lab values...]",
  "ocr_confidence": 0.91,
  "page_count": 1,
  "processing_job_id": "uuid-of-job",
  "processing_worker_id": "worker-02",
  "language_detected": "en",
  "provider_name": "Pathology Lab Australia",
  "facility_name": "Melbourne Pathology Centre",
  "processing_cost_estimate": 0.0125,
  "processing_duration_seconds": 83
}
```

### Example 3: Processing Failed
```json
{
  "patient_id": "uuid-from-upload-context",
  "filename": "prescription_20250120_140512.pdf",
  "original_filename": "Prescription_Scan.pdf",
  "file_size_bytes": 524288,
  "mime_type": "application/pdf",
  "storage_path": "medical-docs/patient-uuid/prescription_20250120_140512.pdf",
  "status": "failed",
  "processing_started_at": "2025-01-20T14:05:12Z",
  "processing_completed_at": "2025-01-20T14:05:45Z",
  "processing_error": {
    "error_code": "OCR_FAILURE",
    "error_message": "Document quality too low for OCR processing",
    "retry_count": 3,
    "can_retry": false
  },
  "file_type": "prescription",
  "confidence_score": 0.75,
  "ocr_confidence": 0.35,
  "page_count": 1,
  "language_detected": "en"
}
```

## Critical Notes (Pass 1 CREATE)

1. **Multi-Pass Table**: Pass 1 CREATES record, Pass 2 may UPDATE status/metrics, Pass 3 UPDATES synthesis fields.

2. **Six Required NOT NULL Fields**: patient_id, filename, original_filename, file_size_bytes, mime_type, storage_path.

3. **Status Field**: Defaults to 'uploaded'. Pass 1 sets to 'processing' during entity detection, then 'completed' or 'failed'.

4. **File Type Enum**: 9 allowed values for file_type CHECK constraint.

5. **Numeric Precision**: confidence_score and ocr_confidence both use NUMERIC(3,2) - 2 decimal places (0.00-0.99).

6. **Processing Timestamps**: processing_started_at set when Pass 1 begins, processing_completed_at set when Pass 1 ends.

7. **Pass 3 Fields NOT Populated**: ai_synthesized_summary, narrative_count, synthesis_completed_at remain NULL/0 after Pass 1.

8. **JSONB Error Field**: processing_error is JSONB object with structured error details.

9. **Job Coordination Fields**: processing_job_id, processing_worker_id, idempotency_key track job queue integration.

10. **Business Analytics**: processing_cost_estimate (DECIMAL(10,4)) and processing_duration_seconds track resource usage.

11. **Foreign Key Cascade**: patient_id references user_profiles(id) ON DELETE CASCADE.

12. **Referenced By Other Tables**: patient_vitals.source_shell_file_id references this table.

13. **Language Detection**: language_detected defaults to 'en', can be overridden by vision AI.

14. **Healthcare Metadata**: provider_name and facility_name extracted from document if visible (optional).

15. **TIMESTAMPTZ Fields**: processing_started_at, processing_completed_at, synthesis_completed_at, created_at, updated_at.

## Schema Validation Checklist (Pass 1 CREATE)

- [ ] `patient_id` is a valid UUID (from upload context, NOT NULL)
- [ ] `filename` is provided (NOT NULL)
- [ ] `original_filename` is provided (NOT NULL)
- [ ] `file_size_bytes` is a non-negative number (BIGINT, NOT NULL)
- [ ] `mime_type` is provided (NOT NULL)
- [ ] `storage_path` is provided (NOT NULL)
- [ ] `status` (if provided) is one of: 'uploaded', 'processing', 'completed', 'failed', 'archived'
- [ ] `processing_started_at` (if provided) is valid TIMESTAMPTZ
- [ ] `processing_completed_at` (if provided) is valid TIMESTAMPTZ
- [ ] `processing_error` (if provided) is valid JSONB object
- [ ] `file_type` (if provided) is one of 9 enum values
- [ ] `confidence_score` (if provided) is between 0.00 and 0.99 with 2 decimal places
- [ ] `ocr_confidence` (if provided) is between 0.00 and 0.99 with 2 decimal places
- [ ] `page_count` is a positive integer (defaults to 1)
- [ ] `processing_priority` is an integer (defaults to 100)
- [ ] `processing_cost_estimate` is non-negative DECIMAL(10,4) (defaults to 0)
- [ ] `language_detected` defaults to 'en'
- [ ] Pass 3 fields (ai_synthesized_summary, narrative_count, synthesis_completed_at) are NOT populated

## Database Constraint Notes

- **NOT NULL constraints**: patient_id, filename, original_filename, file_size_bytes, mime_type, storage_path, status, created_at, updated_at
- **Status Field Special Note**: status is NOT NULL but defaults to 'uploaded', so Pass 1 CREATE must always provide a value (default or explicit)
- **CHECK constraints**: status (5 values), file_type (9 values)
- **DEFAULT values**: status ('uploaded'), page_count (1), narrative_count (0), processing_priority (100), processing_cost_estimate (0), language_detected ('en'), created_at (NOW()), updated_at (NOW())
- **NUMERIC precision**: confidence_score (3,2), ocr_confidence (3,2), processing_cost_estimate (10,4)
- **BIGINT type**: file_size_bytes
- **JSONB object**: processing_error
- **FK references with CASCADE**: patient_id → user_profiles(id) ON DELETE CASCADE
- **VARCHAR type**: processing_worker_id (100 chars max)
- **TIMESTAMPTZ fields**: processing_started_at, processing_completed_at, synthesis_completed_at, created_at, updated_at
- **INTEGER fields**: page_count, narrative_count, processing_priority, processing_duration_seconds

## Database Indexes and Policies

**Indexes on shell_files:**
- Primary key index on `id`
- Index on `patient_id` for user-specific queries
- Index on `status` for processing queue queries
- Index on `file_type` for file classification filtering
- Index on `processing_started_at` for temporal queries
- Unique index on `idempotency_key` for duplicate prevention

**Row Level Security (RLS):**
- RLS enabled on shell_files table
- Policy uses `has_profile_access()` function to verify user can access patient's files
- Ensures users can only CREATE/UPDATE shell_files for patients they have permission to access

## Pass 1 vs Pass 2 vs Pass 3 Field Ownership

**Pass 1 CREATE populates:**
- All physical file metadata (filename, size, MIME type, storage path)
- Processing status (status, processing_started_at, processing_completed_at)
- File classification (file_type, file_subtype, confidence_score)
- Content analysis (extracted_text, ocr_confidence, page_count)
- Job coordination (processing_job_id, processing_worker_id, etc.)
- Initial analytics (processing_cost_estimate, processing_duration_seconds)
- Upload metadata (language_detected, provider_name, facility_name, upload_context)

**Pass 2 UPDATE may modify:**
- status (update to 'completed' after clinical enrichment)
- processing_cost_estimate (add Pass 2 costs)

**Pass 3 UPDATE populates:**
- ai_synthesized_summary (intelligent overview of all narratives)
- narrative_count (number of clinical narratives created)
- synthesis_completed_at (when Pass 3 synthesis completed)
