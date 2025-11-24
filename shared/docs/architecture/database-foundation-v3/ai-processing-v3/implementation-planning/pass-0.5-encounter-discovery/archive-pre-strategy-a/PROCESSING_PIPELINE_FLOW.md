# Pass 0.5 Processing Pipeline Flow
## Complete Step-by-Step Processing for 142-Page Document

**Purpose**: Reference guide to understand the entire Pass 0.5 encounter discovery pipeline from upload to database completion.

**Document Scope**: 142-page PDF medical document processing through Pass 0.5 encounter discovery with progressive chunking.

**Last Updated**: 2025-11-12

---

## Phase 1: Document Upload & Job Enqueueing

### Trigger
User uploads a 142-page PDF via web frontend → POST to `/functions/v1/shell-file-processor-v3`

### Step 1.1: Upload Request Validation
**Location**: `supabase/functions/shell-file-processor-v3/index.ts`

**Validates**:
- Required fields: `filename`, `file_path`, `file_size_bytes`, `mime_type`, `patient_id`
- File size limit: 50MB max
- JWT authentication token present
- User has access to specified `patient_id` (via `has_profile_access` RPC)

**Database Interactions**: None yet

---

### Step 1.2: Create Shell File Record
**Location**: `shell-file-processor-v3/index.ts:341-364`

**Database Table**: `shell_files`

**Insert Columns**:
- `patient_id` (UUID) - References user_profiles.id
- `filename` (text)
- `original_filename` (text)
- `file_size_bytes` (integer) - Example: 8,450,123 bytes
- `mime_type` (text) - Example: 'application/pdf'
- `storage_path` (text) - Supabase Storage path
- `page_count` (integer) - Example: 142 (estimated from file size)
- `status` (text) - Set to 'uploaded'
- `idempotency_key` (UUID) - For duplicate prevention
- `created_at` (timestamp)

**Returns**: `shell_file_id` (UUID)

**Key Behavior**:
- Idempotent: If same `idempotency_key` exists, returns existing record
- Status starts as 'uploaded' and will progress through processing

---

### Step 1.3: Enqueue Background Job
**Location**: `shell-file-processor-v3/index.ts:400-424`

**Database RPC**: `enqueue_job_v3()`

**Database Table**: `job_queue`

**Parameters**:
- `job_type`: 'ai_processing'
- `job_name`: 'Pass 1: [filename]'
- `job_category`: 'standard'
- `priority`: 5
- `job_payload`:
  ```json
  {
    "shell_file_id": "uuid",
    "patient_id": "uuid",
    "storage_path": "patient_files/uuid/filename.pdf",
    "mime_type": "application/pdf",
    "file_size_bytes": 8450123,
    "uploaded_filename": "006_Emma_Thompson.pdf",
    "correlation_id": "uuid"
  }
  ```

**Key Columns Written**:
- `id` (UUID) - Job ID
- `job_type` - 'ai_processing'
- `status` - 'pending' (will become 'processing', then 'completed')
- `job_lane` - Auto-assigned by RPC (e.g., 'lane_standard_1')
- `job_payload` - JSONB with file metadata
- `scheduled_at` - Current timestamp
- `retry_count` - 0 (increments on failures)
- `max_retries` - 3

**Returns**: `job_id` (UUID)

---

### Step 1.4: Track Usage Analytics
**Location**: `shell-file-processor-v3/index.ts:429-443`

**Database RPC**: `track_shell_file_upload_usage()`

**Database Tables**:
- `file_usage_daily` (usage aggregation)
- `file_usage_monthly` (usage aggregation)

**Parameters**:
- `p_profile_id`: Patient/profile UUID
- `p_shell_file_id`: Shell file UUID
- `p_file_size_bytes`: 8,450,123
- `p_estimated_pages`: 142

**Key Behavior**:
- Non-critical operation (failures logged but don't block upload)
- Tracks storage and processing quotas per user

---

### Step 1.5: Return Success Response
**HTTP Response** (201 Created):
```json
{
  "shell_file_id": "uuid",
  "job_id": "uuid",
  "status": "enqueued",
  "estimated_processing_time": "2-5 minutes"
}
```

**Frontend State**:
- File marked as "processing"
- User sees progress indicator
- Polls for completion status

---

## Phase 2: Worker Picks Up Job

### Step 2.1: Worker Claims Job
**Location**: `apps/render-worker/src/worker.ts:420-469`

**Database RPC**: `claim_next_job_v3()`

**Database Table**: `job_queue`

**Parameters**:
- `p_worker_id`: 'render-srv-123-1731456789'
- `p_job_types`: ['ai_processing']

**RPC Behavior**:
- Uses `FOR UPDATE SKIP LOCKED` to prevent race conditions
- Claims first available job matching criteria
- Updates `status` → 'processing'
- Sets `started_at` timestamp
- Sets `claimed_by_worker_id`
- Sets `last_heartbeat_at`

**Returns**: Full job record with `job_payload`

---

## Phase 3: Format Processing & Optimization

### Step 3.1: Download File from Storage
**Location**: `apps/render-worker/src/worker.ts` (processShellFile)

**Supabase Storage**:
- Bucket: Configured bucket for patient files
- Path: From `job_payload.storage_path`
- Returns: Binary file data

**Retry Logic**: `retryStorageDownload()` - 3 attempts with exponential backoff

---

### Step 3.2: Format Preprocessing
**Location**: `apps/render-worker/src/utils/format-processor.ts`

**Function**: `preprocessForOCR()`

**Purpose**: Optimize images for OCR accuracy and cost

**Processing Steps**:
1. **Multi-page PDF Extraction**
   - Splits PDF into individual page images
   - Uses `pdfium` library
   - Generates PNG images per page

2. **Image Analysis**
   - Calculates DPI (dots per inch)
   - Checks dimensions (width × height)
   - Estimates OCR cost based on image size

3. **Downscaling (if needed)**
   - Target: 1800×2400 pixels for standard documents
   - Only downscales if image > target (preserves quality)
   - Prevents excessive OCR costs
   - Uses Jimp library for high-quality resize

4. **Format Conversion**
   - Converts to PNG if necessary
   - Ensures compatible format for Google Vision

**Output**: `PreprocessResult`
```typescript
{
  images: Buffer[],        // 142 PNG images (one per page)
  metadata: {
    totalPages: 142,
    originalFormat: 'pdf',
    wasDownscaled: boolean,
    downscaledPages: number[],
    processingTimeMs: number
  }
}
```

---

### Step 3.3: Store Processed Images
**Location**: `apps/render-worker/src/utils/storage/store-processed-images.ts`

**Supabase Storage Bucket**: `processed-ocr-images`

**Storage Structure**:
```
/shell-file-{uuid}/
  page-001.png  (1800×2400, optimized)
  page-002.png
  ...
  page-142.png
```

**Database Table**: `processed_image_metadata`

**Columns Written** (per page):
- `shell_file_id` (UUID)
- `page_number` (integer) - 1 to 142
- `storage_path` (text) - 'shell-file-{uuid}/page-001.png'
- `original_width` (integer) - Pre-downscale
- `original_height` (integer)
- `processed_width` (integer) - Post-downscale (e.g., 1800)
- `processed_height` (integer) - (e.g., 2400)
- `was_downscaled` (boolean)
- `file_size_bytes` (integer)
- `created_at` (timestamp)

**Key Behavior**:
- Enables OCR result caching
- Allows reprocessing without re-optimization
- 142 rows inserted for 142-page document

---

## Phase 4: OCR Processing

### Step 4.1: Check for Existing OCR Results
**Location**: `apps/render-worker/src/utils/ocr-persistence.ts:loadOCRArtifacts()`

**Database Table**: `ocr_artifacts`

**Query**:
```sql
SELECT * FROM ocr_artifacts
WHERE shell_file_id = ?
  AND page_count = 142
ORDER BY created_at DESC
LIMIT 1
```

**Columns Checked**:
- `shell_file_id` (UUID)
- `page_count` (integer)
- `checksum` (text) - SHA-256 hash of file
- `gcv_response` (JSONB) - Full Google Cloud Vision response
- `created_at` (timestamp)

**Behavior**:
- If found → Skip OCR, use cached results
- If not found → Proceed with OCR

---

### Step 4.2: Run Google Cloud Vision OCR
**Location**: `apps/render-worker/src/worker.ts:processWithGoogleVisionOCR()`

**External API**: Google Cloud Vision API

**Process** (for 142-page document):
1. **Batch Processing**
   - Sends images in batches (typically 5-10 at a time)
   - Each request: `images:annotate` endpoint
   - Feature type: `DOCUMENT_TEXT_DETECTION`

2. **Per-Page OCR**
   - Processes all 142 pages
   - Returns structured text + bounding boxes
   - Includes confidence scores

3. **Spatial Sorting**
   - Sorts text blocks by position (top-to-bottom, left-to-right)
   - Fixes multi-column reading order
   - Groups blocks into rows by Y-coordinate

**Retry Logic**: `retryGoogleVision()` - 3 attempts per page

---

### Step 4.3: Build OCR Result Structure
**Data Structure**: `GoogleCloudVisionOCR`

```typescript
{
  fullTextAnnotation: {
    text: "Full extracted text...",  // All 142 pages concatenated
    pages: [  // 142 page objects
      {
        confidence: 0.98,
        width: 1800,
        height: 2400,
        blocks: [
          {
            boundingBox: { vertices: [...] },
            paragraphs: [
              {
                boundingBox: { vertices: [...] },
                words: [...],
                confidence: 0.95
              }
            ]
          }
        ]
      },
      // ... pages 2-142
    ]
  }
}
```

**Key Metrics**:
- Total text length: ~500,000-1,000,000 characters for 142 pages
- Processing time: ~2-4 minutes
- Average confidence: 0.95-0.98

---

### Step 4.4: Persist OCR Results
**Location**: `apps/render-worker/src/utils/ocr-persistence.ts:persistOCRArtifacts()`

**Database Table**: `ocr_artifacts`

**Columns Written**:
- `shell_file_id` (UUID)
- `page_count` (integer) - 142
- `checksum` (text) - SHA-256 of original file
- `gcv_response` (JSONB) - Full Google Vision response (~5-15MB compressed)
- `total_characters` (integer) - Length of extracted text
- `average_confidence` (numeric) - 0.98
- `processing_time_ms` (integer) - OCR duration
- `created_at` (timestamp)

**Key Behavior**:
- Enables instant reprocessing if Pass 0.5 fails
- Avoids re-running expensive OCR
- Large JSONB storage (5-15MB per document)

---

## Phase 5: Pass 0.5 Entry Point

### Step 5.1: Determine Processing Mode
**Location**: `apps/render-worker/src/pass05/encounterDiscovery.ts:94-171`

**Decision Logic**:
```typescript
if (pageCount > 100) {
  → Use Progressive Mode (chunking)
} else {
  → Use Standard Mode (single pass)
}
```

**For 142-page document**:
- Progressive mode activated
- Document split into chunks of ~50 pages
- 142 pages → 3 chunks

---

## Phase 6: Progressive Mode Processing

### Step 6.1: Create Progressive Session
**Location**: `apps/render-worker/src/pass05/progressive/session-manager.ts:createProgressiveSession()`

**Database Table**: `pass05_progressive_sessions`

**Columns Written**:
- `id` (UUID) - Session ID
- `shell_file_id` (UUID)
- `patient_id` (UUID)
- `total_pages` (integer) - 142
- `chunk_size` (integer) - 50
- `total_chunks` (integer) - 3
- `current_chunk` (integer) - 0 (will increment)
- `processing_status` (text) - 'processing'
- `current_handoff_package` (JSONB) - null initially
- `total_encounters_found` (integer) - 0 (will increment)
- `total_encounters_completed` (integer) - 0
- `total_encounters_pending` (integer) - 0
- `started_at` (timestamp)

**Returns**: Session ID for tracking

---

### Step 6.2: Process Chunk 1 (Pages 1-50)

#### Step 6.2.1: Extract Chunk Text
**Location**: `apps/render-worker/src/pass05/progressive/chunk-processor.ts:extractTextFromPages()`

**Input**:
- OCR pages 0-49 (0-indexed)
- Start page number: 0

**Output**:
- Concatenated text from pages 1-50
- ~200,000-350,000 characters

---

#### Step 6.2.2: Build v10 Prompt
**Location**: `apps/render-worker/src/pass05/aiPrompts.v10.ts:buildEncounterDiscoveryPromptV10()`

**Prompt Sections**:
1. **Chunk Context**:
   ```
   Chunk 1 of 3
   Pages in this chunk: 1 to 50
   Total document pages: 142
   Position: This is the FIRST chunk. No prior context exists.
   ```

2. **Medical Encounter Discovery Task**
   - Timeline test instructions
   - ED-to-admission continuity rules
   - Boundary detection priority

3. **Encounter Type Standards**
   - 10 standardized types (hospital_admission, emergency_department, etc.)
   - Lowercase underscore format required

4. **Progressive Mode Instructions**
   - Mark encounters extending beyond page 50 as status="continuing"
   - Generate tempId for handoff
   - Provide expectedContinuation hint

5. **OCR Text**: Full text from pages 1-50

**Total Prompt Size**: ~250,000-400,000 characters

---

#### Step 6.2.3: Call AI Model
**Location**: `apps/render-worker/src/pass05/providers/google-provider.ts` (or OpenAI provider)

**Model**: Gemini 2.5 Pro or GPT-4o

**Request**:
```json
{
  "model": "gemini-2.5-pro",
  "messages": [
    {
      "role": "user",
      "content": "[v10 prompt]"
    }
  ],
  "response_format": { "type": "json_object" },
  "max_tokens": 32768  // For progressive mode
}
```

**Token Usage** (Chunk 1):
- Input tokens: ~40,000-45,000
- Output tokens: ~4,000-4,500
- Cost: ~$0.0046 USD

**Processing Time**: ~60 seconds

---

#### Step 6.2.4: Parse AI Response
**AI Output** (JSON):
```json
{
  "encounters": [
    {
      "encounterId": "enc-001",
      "encounterType": "hospital_admission",
      "status": "continuing",
      "tempId": "encounter_temp_chunk1_001",
      "expectedContinuation": "discharge_summary",
      "encounterStartDate": "2022-11-29",
      "encounterEndDate": null,
      "providerName": "Patrick Callaghan, DO",
      "facility": "St. Luke's Hospital",
      "pageRanges": [[1, 50]],
      "confidence": 0.98,
      "summary": "Hospital admission for acetaminophen overdose..."
    }
  ],
  "pageAssignments": [
    { "page": 1, "encounterId": "enc-001", "justification": "..." },
    // ... pages 2-50
  ],
  "activeContext": {
    "currentAdmission": {
      "facility": "St. Luke's Hospital",
      "admitDate": "2022-11-29"
    },
    "activeProviders": ["Patrick Callaghan, DO"],
    "lastConfidentDate": "2022-11-29"
  }
}
```

---

#### Step 6.2.5: Post-Process Encounters
**Location**: `apps/render-worker/src/pass05/progressive/post-processor.ts:postProcessEncounters()`

**Input**: AI response encounters

**Processing**:
1. Check if encounter ends at chunk boundary (page 50)
2. If yes AND not last chunk → Ensure status="continuing"
3. If no tempId, generate one: `encounter_temp_chunk1_[timestamp]_[random]`
4. Infer expectedContinuation if missing

**Output**: Validated encounters with proper status fields

---

#### Step 6.2.6: Save Chunk Results
**Database Table**: `pass05_chunk_results`

**Columns Written**:
- `session_id` (UUID)
- `chunk_number` (integer) - 1
- `page_start` (integer) - 0
- `page_end` (integer) - 50
- `processing_status` (text) - 'completed'
- `ai_model_used` (text) - 'gemini-2.5-pro'
- `input_tokens` (integer) - 44,382
- `output_tokens` (integer) - 4,168
- `ai_cost_usd` (numeric) - 0.0046
- `handoff_received` (JSONB) - null (first chunk)
- `handoff_generated` (JSONB) - Contains pendingEncounter data
- `encounters_started` (integer) - 0
- `encounters_completed` (integer) - 0
- `encounters_continued` (integer) - 1
- `confidence_score` (numeric) - 0.98
- `ai_response_raw` (JSONB) - Full AI JSON response
- `created_at` (timestamp)

---

#### Step 6.2.7: Save Pending Encounter
**Database Table**: `pass05_pending_encounters`

**Columns Written**:
- `session_id` (UUID)
- `temp_encounter_id` (text) - 'encounter_temp_chunk1_001'
- `chunk_started` (integer) - 1
- `chunk_last_seen` (integer) - 1
- `partial_data` (JSONB) - Encounter metadata
- `page_ranges` (integer[][]) - [[1, 50]]
- `expected_continuation` (text) - 'discharge_summary'
- `status` (text) - 'pending'
- `confidence` (numeric) - 0.98
- `created_at` (timestamp)

**Key Behavior**: This encounter will be completed in a later chunk

---

### Step 6.3: Process Chunk 2 (Pages 51-100)

#### Step 6.3.1: Build Handoff Context
**Location**: `apps/render-worker/src/pass05/aiPrompts.v10.ts:buildHandoffContext()`

**Handoff Package** (from Chunk 1):
```json
{
  "pendingEncounter": {
    "tempId": "encounter_temp_chunk1_001",
    "encounterType": "hospital_admission",
    "encounterDate": "2022-11-29",
    "provider": "Patrick Callaghan, DO",
    "startPage": 0,
    "partialData": { ... },
    "expectedContinuation": "discharge_summary"
  },
  "activeContext": {
    "currentAdmission": { ... },
    "activeProviders": [...]
  }
}
```

**Prompt Addition**:
```
## HANDOFF FROM PREVIOUS CHUNK

### Pending Encounter to Complete

Hospital admission started in previous chunk:
- TempID: encounter_temp_chunk1_001
- Type: hospital_admission
- Started: 2022-11-29
- Expected: discharge_summary
- Previous pages: [[1, 50]]

When you find the continuation:
1. Set encounterId = "encounter_temp_chunk1_001"
2. Set status = "complete" OR "continuing"
3. Merge all data from both chunks
4. Combine page ranges
```

---

#### Step 6.3.2: AI Processing (Chunk 2)
**Model Call**: Same as Chunk 1 but with handoff context

**Token Usage**:
- Input tokens: ~44,000
- Output tokens: ~4,500
- Cost: ~$0.0047

**AI Output**:
- Uses tempId from handoff as encounterId
- Continues the hospital admission
- Marks as "continuing" if extends beyond page 100
- Creates new tempId: "encounter_temp_chunk2_001"

---

#### Step 6.3.3: Update Pending Encounter
**Database Table**: `pass05_pending_encounters`

**Update**:
```sql
UPDATE pass05_pending_encounters
SET
  chunk_last_seen = 2,
  partial_data = [merged data],
  page_ranges = [[1, 50], [51, 100]],
  status = 'pending',  -- Still pending
  updated_at = NOW()
WHERE temp_encounter_id = 'encounter_temp_chunk1_001'
```

---

### Step 6.4: Process Chunk 3 (Pages 101-142) - FINAL CHUNK

#### Step 6.4.1: Build Prompt with Final Chunk Flag
**Chunk Context**:
```
Chunk 3 of 3
Pages in this chunk: 101 to 142
Total document pages: 142
Position: This is the FINAL chunk. Complete all pending encounters.
```

**Critical Instruction**: "No encounters should be marked 'continuing'"

---

#### Step 6.4.2: AI Processing (Chunk 3)
**Token Usage**:
- Input tokens: ~31,000 (fewer pages)
- Output tokens: ~3,900
- Cost: ~$0.0035

**AI Output**:
- Completes the hospital admission
- Uses tempId from handoff: "encounter_temp_chunk2_001"
- Sets status="complete"
- No new pending encounters

---

#### Step 6.4.3: Write Final Encounter to Database
**Location**: `apps/render-worker/src/pass05/progressive/chunk-processor.ts:100-139`

**Database Table**: `healthcare_encounters`

**Columns Written**:
- `id` (UUID) - Generated
- `patient_id` (UUID)
- `primary_shell_file_id` (UUID)
- `encounter_type` (text) - 'hospital_admission'
- `encounter_start_date` (date) - '2022-11-29'
- `encounter_date_end` (date) - '2022-12-07'
- `encounter_timeframe_status` (text) - 'completed'
- `date_source` (text) - 'ai_extracted'
- `provider_name` (text) - 'Mark John Hosak, MD'
- `facility_name` (text) - 'St. Luke's Hospital'
- `page_ranges` (integer[][]) - [[51, 142]] (chunk 3 only)
- `pass_0_5_confidence` (numeric) - 0.98
- `summary` (text) - Full encounter summary
- `identified_in_pass` (text) - 'pass_0_5'
- `source_method` (text) - 'ai_pass_0_5'
- `created_at` (timestamp)

**UPSERT Conflict**:
```sql
ON CONFLICT (
  patient_id,
  primary_shell_file_id,
  encounter_type,
  encounter_start_date,
  page_ranges
)
DO UPDATE SET ...
```

---

#### Step 6.4.4: Mark Pending Encounter as Completed
**Database Table**: `pass05_pending_encounters`

**Update**:
```sql
UPDATE pass05_pending_encounters
SET
  status = 'completed',
  completed_encounter_id = [new UUID from healthcare_encounters],
  completed_at = NOW()
WHERE temp_encounter_id = 'encounter_temp_chunk2_001'
```

---

### Step 6.5: Reconcile Any Remaining Pending Encounters

#### Step 6.5.1: Query for Pending Encounters
**Location**: `apps/render-worker/src/pass05/progressive/pending-reconciler.ts:19-50`

**Database Table**: `pass05_pending_encounters`

**Query**:
```sql
SELECT * FROM pass05_pending_encounters
WHERE session_id = ?
  AND status = 'pending'
```

**For successful processing**: Returns 0 rows (all marked 'completed')

---

#### Step 6.5.2: Process Any Truly Pending Encounters
**Behavior**:
- Check if encounter already exists in healthcare_encounters
- If exists: Link pending record to existing ID, skip insertion
- If not exists: Insert new encounter
- Mark pending record as 'completed'

**Critical Fix** (from Migration 46):
- Prevents duplicates by checking existence first
- Uses patient_id + shell_file_id + encounter_type + start_date

---

### Step 6.6: Finalize Progressive Session

#### Step 6.6.1: Update Session Status
**Database Table**: `pass05_progressive_sessions`

**Update**:
```sql
UPDATE pass05_progressive_sessions
SET
  processing_status = 'completed',
  current_chunk = 3,
  total_encounters_found = 1,  -- FIXED: Was 3 due to reconciler bug
  total_encounters_completed = 1,
  total_encounters_pending = 0,
  average_confidence = 0.98,
  completed_at = NOW(),
  total_processing_time = '00:03:18',
  total_ai_calls = 3,
  total_input_tokens = 119720,
  total_output_tokens = 12564,
  total_cost_usd = 0.0128
WHERE id = [session_id]
```

---

#### Step 6.6.2: Update Shell File
**Database Table**: `shell_files`

**Update**:
```sql
UPDATE shell_files
SET
  pass_0_5_completed = true,
  pass_0_5_version = 'v10',
  pass_0_5_progressive = true,
  ocr_average_confidence = 0.98,
  status = 'completed',
  processing_completed_at = NOW()
WHERE id = [shell_file_id]
```

---

## Phase 7: Job Completion

### Step 7.1: Complete Job in Queue
**Location**: `apps/render-worker/src/worker.ts`

**Database RPC**: `complete_job()`

**Database Table**: `job_queue`

**Update**:
```sql
UPDATE job_queue
SET
  status = 'completed',
  completed_at = NOW(),
  processing_time_ms = [duration],
  result_summary = {
    encounters_found: 1,
    pages_processed: 142,
    cost_usd: 0.0128
  }
WHERE id = [job_id]
```

---

## Final Database State Summary

### Records Created for 142-Page Document

#### Core Tables
1. **shell_files**: 1 record (status='completed')
2. **job_queue**: 1 record (status='completed')
3. **ocr_artifacts**: 1 record (~10MB JSONB)
4. **processed_image_metadata**: 142 records (1 per page)

#### Progressive Mode Tables
5. **pass05_progressive_sessions**: 1 record
6. **pass05_chunk_results**: 3 records (1 per chunk)
7. **pass05_pending_encounters**: 2 records (status='completed')

#### Encounter Tables
8. **healthcare_encounters**: 1 record (THE FINAL ENCOUNTER)
9. **pass05_page_assignments**: 142 records (1 per page)

#### Analytics Tables
10. **file_usage_daily**: Updated with upload metrics
11. **file_usage_monthly**: Updated with upload metrics

---

## Common Issues & Debugging

### Issue 1: Duplicate Encounters Created
**Symptom**: 3 encounters instead of 1 for same hospital admission

**Root Cause**: Reconciler inserting without checking existing encounters

**Fix**: Migration 46 - Add existence check before insertion

**Debug Query**:
```sql
SELECT encounter_type, encounter_start_date, COUNT(*)
FROM healthcare_encounters
WHERE primary_shell_file_id = ?
GROUP BY encounter_type, encounter_start_date
HAVING COUNT(*) > 1
```

---

### Issue 2: Encounters Marked as Continuing in Final Chunk
**Symptom**: status='continuing' in chunk 3

**Root Cause**: AI not following "final chunk" instructions

**Fix**: Post-processor forces status='complete' when isLastChunk=true

**Debug Query**:
```sql
SELECT chunk_number, encounters_continued
FROM pass05_chunk_results
WHERE session_id = ?
  AND chunk_number = (
    SELECT total_chunks
    FROM pass05_progressive_sessions
    WHERE id = ?
  )
```

---

### Issue 3: ED Visit Separate from Hospital Admission
**Symptom**: 2 encounters (ED + admission) for same hospitalization

**Root Cause**: AI not understanding ED-to-admission continuity

**Fix**: v10 prompt includes explicit ED-to-admission instructions

**Debug Query**:
```sql
SELECT encounter_type, encounter_start_date, provider_name
FROM healthcare_encounters
WHERE primary_shell_file_id = ?
  AND encounter_start_date = [same date]
ORDER BY encounter_type
```

---

## End of Pipeline Flow Documentation

**Total Processing Time**: 3-5 minutes for 142-page document
**Total Cost**: ~$0.013 USD (OCR + AI processing)
**Success Criteria**: 1 encounter created with 142 page assignments
