# Pass 0.5 Column Audit: shell_files

**Date:** 2025-11-06 (6th November 2025 audit)
**Status:** COMPREHENSIVE REVIEW IN PROGRESS
**Context:** Full column-by-column analysis of `shell_files` table
**Table Purpose:** Track uploaded medical documents through V3 processing pipeline (OCR → Pass 0.5 → Pass 1 → Pass 2 → Pass 3)

**Location:** shared/docs/architecture/database-foundation-v3/current_schema/03_clinical_core.sql:96

**Key Findings:**
- **CRITICAL:** Many columns consistently NULL across all recent uploads
- **FIXED:** page_count now accurate after worker fix (was estimation, now actual OCR count)
- **ISSUE:** file_type, file_subtype never populated by any pass
- **ISSUE:** provider_name, facility_name never populated despite available in source documents
- **ARCHITECTURAL:** Processed image file size not tracked (only original file size)

---

## 6th November 2025 Audit Issues

### Issue 1: Processed Image Metadata Incomplete

**User Question:** "We store the processed image as well as the original image... But what about listing the file size of the processed image? Because I see that we list the file size of the original file/image as file_size_bytes and also provide the 'mime_type'."

**Current State:**

| Column | Original File | Processed Image | Populated? |
|--------|--------------|-----------------|------------|
| `file_size_bytes` | ✓ Original | - | YES |
| `mime_type` | ✓ Original | - | YES |
| `processed_image_path` | - | ✓ Path | YES |
| `processed_image_mime` | - | ✓ MIME | YES |
| `processed_image_checksum` | - | ✓ SHA256 | YES |
| **`processed_image_size_bytes`** | - | **MISSING** | **NO** |

**Sample Data:**
```
shell_file_id: 1c1c18b9-3a15-4dac-ac56-cfebd6228566
- file_size_bytes: 776,324 (original PDF)
- mime_type: "application/pdf"
- processed_image_path: "d1dbe18c.../1c1c18b9...-processed"
- processed_image_mime: "image/jpeg"
- processed_image_checksum: "5cd9e89e..."
- processed_image_size_bytes: NULL (NOT TRACKED)
```

**Problem:**
Worker converts uploaded files to JPEG pages for:
1. Vision AI input (consistent format)
2. Click-to-source feature (display in UI)
3. OCR processing (Google Cloud Vision)

But we don't know:
- Total storage used by processed images
- Compression ratio (PDF → JPEG)
- Cost per file for storage

**Architectural Analysis:**

**Option A: Add processed_image_size_bytes Column**
```sql
ALTER TABLE shell_files
ADD COLUMN processed_image_size_bytes BIGINT;
```

Pros:
- Simple, consistent with existing file_size_bytes pattern
- Easy to query total storage usage
- Minimal schema complexity

Cons:
- Only stores total size (not per-page breakdown)
- Doesn't help with per-page analysis

**Option B: Store Per-Page Metadata in JSONB**
```sql
ALTER TABLE shell_files
ADD COLUMN processed_pages_metadata JSONB;

-- Example structure:
{
  "total_size_bytes": 2450000,
  "page_count": 20,
  "pages": [
    {"page": 1, "size_bytes": 125000, "width": 1600, "height": 2260},
    {"page": 2, "size_bytes": 120000, "width": 1600, "height": 2260},
    ...
  ]
}
```

Pros:
- Granular per-page metadata
- Useful for debugging/analysis
- Extensible (can add more metadata later)

Cons:
- More complex schema
- Querying total size requires JSON extraction
- Duplicate page_count data (already exists)

**Option C: No Change - Derive from Storage**
Query Supabase Storage API when needed.

Pros:
- No schema changes
- Storage is source of truth

Cons:
- Slower queries (API roundtrip)
- Not available for analytics queries
- Can't track historical changes

**Recommendation: Option A (Add Column)**
- **Rationale:** Consistent with existing pattern, simple implementation, sufficient for billing/analytics
- **Implementation:** Worker calculates total size after storing processed pages, updates shell_files
- **Migration:** Backfill existing records by querying storage (one-time operation)

**Impact:**
- LOW risk, simple schema addition
- Enables storage cost tracking
- Foundation for future billing/quota features

---

### Issue 2: file_type and file_subtype Always NULL

**User Observation:** "I also see that 'file_type' is empty as well as file_subtype"

**Current State:**
ALL recent uploads have:
- `file_type`: NULL (should be enum: 'medical_record', 'lab_result', 'imaging_report', etc.)
- `file_subtype`: NULL (should be more specific classification)

**Sample Data:**
```sql
-- Recent 5 uploads
shell_file_id: 1b3c8e48... | file_type: NULL | file_subtype: NULL
shell_file_id: 1c1c18b9... | file_type: NULL | file_subtype: NULL
shell_file_id: bb3b79e5... | file_type: NULL | file_subtype: NULL
shell_file_id: 6fbf3179... | file_type: NULL | file_subtype: NULL
shell_file_id: ac42dad4... | file_type: NULL | file_subtype: NULL
```

**Schema Definition:**
```sql
file_type TEXT CHECK (file_type IN (
    'medical_record', 'lab_result', 'imaging_report', 'prescription',
    'discharge_summary', 'referral', 'insurance_card', 'id_document', 'other'
)),
file_subtype TEXT,
```

**Root Cause Analysis:**

**WHERE should it be populated?**

Checked all passes:
1. **Edge Function (shell-file-processor-v3):** Does NOT populate file_type
2. **Worker (Pass 0.5):** Does NOT populate file_type
3. **Worker (Pass 1):** Does NOT populate file_type
4. **Pass 2 (not implemented):** Potential location?

**Current Architecture:**
- Edge Function: Creates shell_files record with mime_type only
- Pass 0.5: Creates healthcare_encounters with encounter_type (outpatient, lab_result, etc.)
- **NO PASS WRITES BACK TO shell_files.file_type**

**Architectural Conflict:**
- `shell_files.file_type` = "What is this document?" (lab result, prescription, discharge summary)
- `healthcare_encounters.encounter_type` = "What kind of visit was this?" (outpatient, emergency, specialist)

These are **different concepts** but often correlate:
- A "lab_result" document → typically contains diagnostic encounters
- A "discharge_summary" document → typically contains inpatient/emergency encounters

**Problem:**
Pass 0.5 has this information (it classifies encounters) but doesn't write it back to shell_files.

**Architectural Questions:**

**Q1: Is file_type even needed if we have encounter_type?**
- **YES if:** Single document can contain multiple encounter types (Frankenstein files!)
- **NO if:** We only care about encounter types, not document types

**Q2: Should file_type be:**
- A) Inferred from encounters (e.g., if all encounters are "diagnostic" → file_type = "lab_result")
- B) Explicitly set by AI during Pass 0.5 or Pass 1
- C) Removed from schema as redundant

**Q3: What's the USER NEED for file_type?**
- Document library filtering? ("Show me all lab results")
- Upload workflow routing? ("Lab results go to fast queue")
- Analytics? ("How many prescriptions uploaded this month")

**Recommendation: ADD to Pass 0.5 Output**

**Rationale:**
- Pass 0.5 AI already sees entire document content
- Can classify document type alongside encounter detection
- Simple addition to existing prompt

**Implementation:**
```typescript
// Pass 0.5 output adds:
{
  "document_classification": {
    "file_type": "lab_result", // or "medical_record", "discharge_summary", etc.
    "file_subtype": "pathology_report", // optional granular type
    "confidence": 0.95
  },
  "encounters": [...]
}

// Worker writes back to shell_files:
await supabase
  .from('shell_files')
  .update({
    file_type: pass05Result.document_classification.file_type,
    file_subtype: pass05Result.document_classification.file_subtype
  })
  .eq('id', shellFileId);
```

**Alternative: Derive from Encounters (No AI Change)**
```sql
-- Materialized view or computed column
UPDATE shell_files sf
SET file_type = CASE
  WHEN EXISTS (
    SELECT 1 FROM healthcare_encounters he
    WHERE he.primary_shell_file_id = sf.id
    AND he.encounter_type LIKE '%lab%'
  ) THEN 'lab_result'
  WHEN EXISTS (
    SELECT 1 FROM healthcare_encounters he
    WHERE he.primary_shell_file_id = sf.id
    AND he.encounter_type = 'emergency_department'
  ) THEN 'discharge_summary'
  ELSE 'medical_record'
END;
```

Cons:
- Heuristic, not AI-driven
- Doesn't handle Frankenstein files well (multiple encounter types → what file_type?)

**Decision Required:** Should we ask Pass 0.5 to classify document type?

---

### Issue 3: provider_name and facility_name Always NULL

**User Observation:** "provider_name and facility_name are empty for all records as well."

**Current State:**
```sql
-- shell_files table
provider_name: NULL (all records)
facility_name: NULL (all records)

-- healthcare_encounters table (HAS this data!)
provider_name: "Matthew T Tinkham, MD" ✓
facility_name: "Piedmont Eastside Medical Emergency Department" ✓
```

**Problem:**
Data EXISTS in healthcare_encounters but NOT in shell_files.

**Architectural Question:**
**SHOULD shell_files have provider_name/facility_name?**

**Case FOR keeping these columns:**
- Quick document filtering without joining encounters
- Document library UI: "Show all docs from Dr. Smith"
- Useful for single-provider documents

**Case AGAINST:**
- **Frankenstein files:** Which provider? Which facility? (Multiple encounters = multiple providers)
- Data redundancy (already in healthcare_encounters)
- Maintenance burden (keep in sync with encounters)

**Analysis:**

**Frankenstein File Example:**
```
shell_file_id: 1c1c18b9-3a15-4dac-ac56-cfebd6228566
Encounter 1: Mara Ehret @ Interventional Spine & Pain PC
Encounter 2: Matthew T Tinkham @ Piedmont Emergency Dept

What should shell_files.provider_name be?
- Option A: "Mara Ehret" (first encounter)
- Option B: "Multiple providers" (generic)
- Option C: NULL (ambiguous, use encounters table)
- Option D: ["Mara Ehret", "Matthew T Tinkham"] (array - complex)
```

**Current Schema Supports Single Value:**
```sql
provider_name TEXT,  -- Not an array
facility_name TEXT,  -- Not an array
```

**Recommendation: REMOVE from shell_files Schema**

**Rationale:**
1. Frankenstein files make single provider/facility ambiguous
2. Data already exists in healthcare_encounters (source of truth)
3. Document filtering can query encounters table (performant with indexes)
4. Reduces schema complexity and maintenance burden

**Alternative: Use for Single-Encounter Heuristic**
```sql
-- Populate only if shell_file has exactly ONE encounter
UPDATE shell_files sf
SET
  provider_name = he.provider_name,
  facility_name = he.facility_name
FROM healthcare_encounters he
WHERE he.primary_shell_file_id = sf.id
AND (
  SELECT COUNT(*)
  FROM healthcare_encounters
  WHERE primary_shell_file_id = sf.id
) = 1;

-- Leave NULL for multi-encounter files
```

Pros:
- Useful for ~80% of files (single-encounter documents)
- Clear signal (NULL = multi-encounter or unknown)

Cons:
- Inconsistent population logic
- Maintenance complexity

**Decision Required:** Keep columns with heuristic population OR remove from schema?

---

### Issue 4: ai_synthesized_summary Always NULL

**User Observation:** "ai_synthesized_summary also empty"

**Current State:**
```sql
ai_synthesized_summary: NULL (all records)
narrative_count: 0 (all records)
synthesis_completed_at: NULL (all records)
```

**Schema Purpose:**
```sql
-- POST-PASS 3: Shell File Synthesis (replaces primitive document intelligence)
ai_synthesized_summary TEXT, -- Intelligent overview of all narratives in this shell file
narrative_count INTEGER DEFAULT 0, -- Number of clinical narratives created from this shell file
synthesis_completed_at TIMESTAMPTZ, -- When Pass 3 synthesis completed
```

**Root Cause:**
**Pass 3 is NOT implemented yet.**

Pass 3's job:
1. Take all clinical entities from Pass 1 + Pass 2
2. Create narrative summaries grouped by clinical themes
3. Synthesize shell-file-level overview

**Expected Behavior (when Pass 3 implemented):**
```
shell_file_id: 1c1c18b9...
ai_synthesized_summary: "This document contains two distinct encounters: a specialist pain management consultation on Oct 27, 2025 with Mara Ehret, PA-C regarding post-procedure follow-up for neck and back pain, and an emergency department visit on June 22, 2025 with Dr. Tinkham following a motor vehicle collision."
narrative_count: 2
synthesis_completed_at: "2025-11-06 10:30:00+00"
```

**Status:**
- **EXPECTED NULL** - Pass 3 not implemented
- **NOT A BUG** - Design works as intended

**Recommendation:**
- No action required
- Populate when Pass 3 implemented (future work)

---

### Issue 5: upload_context Column Purpose Unclear

**User Question:** "what is upload_context? (thats also null)"

**Current State:**
```sql
upload_context TEXT, -- NULL for all records
```

**Schema Definition:**
```sql
-- Upload and processing metadata
language_detected TEXT DEFAULT 'en',

-- Healthcare-specific metadata
provider_name TEXT,
facility_name TEXT,
upload_context TEXT,
```

**Purpose Analysis:**

**Hypothesis 1: User-Provided Context**
User uploads file and optionally provides context:
- "Lab results from my annual physical"
- "Referral letter from Dr. Smith"
- "Emergency visit after car accident"

Pros:
- Helps AI understanding
- User-driven metadata
- Useful for search/filtering

Cons:
- Rarely provided by users
- Not implemented in UI

**Hypothesis 2: System-Generated Context**
Automatically captured metadata:
- Upload source ("mobile_app", "web_upload", "fax_import")
- Upload workflow ("quick_upload", "batch_import", "provider_portal")
- Trigger context ("annual_checkup_prep", "insurance_claim", "medical_history_request")

Pros:
- Tracks upload patterns
- Analytics useful
- No user input required

Cons:
- Not currently captured
- Unclear business value

**Code Search:**
```bash
# Search for upload_context usage
grep -r "upload_context" apps/render-worker/src/
grep -r "upload_context" supabase/functions/
```

**Finding:** Column defined but NEVER POPULATED by any code.

**Recommendation: REMOVE from Schema (Vestigial Column)**

**Rationale:**
- No code populates it
- No clear use case
- Adds schema complexity with no benefit

**Alternative: Define Clear Purpose**
If we want to keep it:
```sql
upload_context TEXT CHECK (upload_context IN (
  'web_upload', 'mobile_upload', 'email_import', 'fax_import',
  'provider_portal', 'insurance_request', 'patient_request'
))
```

And populate in Edge Function:
```typescript
await supabase.from('shell_files').insert({
  ...
  upload_context: 'web_upload', // or from request headers
})
```

**Decision Required:** Remove column OR define purpose and implement population?

---

## Complete Column-by-Column Audit

### GROUP 1: Primary Keys and Foreign Keys

| Column | Type | Purpose | Populated? | Verdict |
|--------|------|---------|------------|---------|
| `id` | UUID PRIMARY KEY | Unique identifier | YES | ✓ KEEP |
| `patient_id` | UUID REFERENCES user_profiles | Patient ownership | YES | ✓ KEEP |

**Analysis:** Standard keys, properly populated.

**Verdict:** ✓ KEEP ALL

---

### GROUP 2: Physical File Metadata (Original File)

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `filename` | TEXT NOT NULL | System filename | YES | None | ✓ KEEP |
| `original_filename` | TEXT NOT NULL | User's original filename | YES | None | ✓ KEEP |
| `file_size_bytes` | BIGINT NOT NULL | Original file size | YES | None | ✓ KEEP |
| `mime_type` | TEXT NOT NULL | Original MIME type | YES | None | ✓ KEEP |
| `storage_path` | TEXT NOT NULL | Supabase Storage path | YES | None | ✓ KEEP |

**Sample Data:**
```
filename: "1762380130104_006_Emma_Thompson_Frankenstein.pdf"
original_filename: "006_Emma_Thompson_Frankenstein_Progress_note.pdf"
file_size_bytes: 776324 (758 KB)
mime_type: "application/pdf"
storage_path: "d1dbe18c.../1762380130104_006_Emma..."
```

**Analysis:** Original file metadata captured correctly at upload.

**Verdict:** ✓ ALL WORKING CORRECTLY

---

### GROUP 3: Processing Status Tracking

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `status` | TEXT NOT NULL | Processing state | YES | Valid enum values | ✓ KEEP |
| `processing_started_at` | TIMESTAMPTZ | When processing began | YES | Correct timestamps | ✓ KEEP |
| `processing_completed_at` | TIMESTAMPTZ | When processing finished | YES | Correct timestamps | ✓ KEEP |
| `processing_error` | JSONB | Error details if failed | NULL (no errors) | Expected NULL on success | ✓ KEEP |

**Sample Data:**
```
status: "processing" (currently in Pass 0.5)
processing_started_at: "2025-11-05 22:04:17.648+00"
processing_completed_at: NULL (still processing)
processing_error: NULL (no errors)
```

**Valid Status Values:**
- `uploaded` - Initial state after upload
- `processing` - Worker claimed job
- `pass1_complete` - Pass 1 finished
- `pass2_complete` - Pass 2 finished
- `pass3_complete` - Pass 3 finished
- `completed` - All passes done
- `failed` - Error occurred
- `archived` - Soft deleted

**Analysis:** Status tracking works correctly. Pass 0.5 doesn't have dedicated status (uses pass_0_5_completed flag instead).

**Verdict:** ✓ ALL WORKING CORRECTLY

---

### GROUP 4: File Classification (PROBLEM AREA)

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `file_type` | TEXT | Document category | **NO** | Always NULL | ⚠️ FIX OR REMOVE |
| `file_subtype` | TEXT | Granular type | **NO** | Always NULL | ⚠️ FIX OR REMOVE |
| `confidence_score` | NUMERIC(3,2) | Classification confidence | **NO** | Always NULL | ⚠️ FIX OR REMOVE |

**Problem:** See Issue #2 above - No pass populates these fields.

**Recommendation:** Add document classification to Pass 0.5 output OR remove columns as redundant with healthcare_encounters.encounter_type.

**Verdict:** ⚠️ ACTION REQUIRED

---

### GROUP 5: Content Analysis (MIXED STATE)

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `extracted_text` | TEXT | Full OCR text | **NO** | NULL (not persisted) | ℹ️ DESIGN CHOICE |
| `ocr_confidence` | NUMERIC(3,2) | Average OCR quality | **NO** | NULL (not persisted) | ℹ️ DESIGN CHOICE |
| `ocr_raw_jsonb` | JSONB | Complete OCR response | **YES** | Populated | ✓ KEEP |
| `page_count` | INTEGER | Number of pages | **YES** | FIXED (now accurate) | ✓ KEEP |

**Sample Data:**
```
extracted_text: NULL (not stored to save space)
ocr_confidence: NULL (available in ocr_raw_jsonb but not extracted)
ocr_raw_jsonb: {"pages": [{"page_number": 1, "original_gcv_text": "...", ...}]}
page_count: 20 (CORRECT - fixed 2025-11-06)
```

**Analysis:**

**ocr_raw_jsonb Structure:**
```json
{
  "pages": [
    {
      "page_number": 1,
      "dimensions": {"width": 1600, "height": 2260},
      "original_gcv_text": "Full text from Google Cloud Vision...",
      "spatially_sorted_text": "Text in reading order..."
    }
  ]
}
```

**Design Decision:**
- `ocr_raw_jsonb` stores lightweight OCR comparison data for debugging
- Full OCR text NOT stored in shell_files (available in ocr_artifacts table via persistOCRArtifacts())
- Trade-off: Smaller shell_files table vs easier debugging

**Recommendation:**

**Option A: Populate extracted_text and ocr_confidence (materialized)**
```sql
UPDATE shell_files
SET
  extracted_text = (ocr_raw_jsonb->'pages'->0->>'spatially_sorted_text'),
  ocr_confidence = (
    SELECT AVG((page->>'confidence')::numeric)
    FROM jsonb_array_elements(ocr_raw_jsonb->'pages') AS page
  )
WHERE ocr_raw_jsonb IS NOT NULL;
```

Pros:
- Easier full-text search
- No need to extract from JSONB

Cons:
- Duplicate data (also in ocr_artifacts)
- Large text columns bloat shell_files table

**Option B: Keep NULL (current design)**
Use ocr_raw_jsonb for debugging only, query ocr_artifacts for full text.

Pros:
- Smaller shell_files table
- Separation of concerns

Cons:
- More complex queries for text search

**Recommendation:** Keep current design (Option B) - separation of concerns is correct.

**Verdict:** ✓ DESIGN IS CORRECT (no changes needed)

---

### GROUP 6: Pass 3 Synthesis (EXPECTED NULL - NOT IMPLEMENTED)

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `ai_synthesized_summary` | TEXT | Pass 3 document overview | **NO** | Pass 3 not implemented | ℹ️ FUTURE |
| `narrative_count` | INTEGER | Count of narratives created | **NO** | Pass 3 not implemented | ℹ️ FUTURE |
| `synthesis_completed_at` | TIMESTAMPTZ | When Pass 3 finished | **NO** | Pass 3 not implemented | ℹ️ FUTURE |

**Status:** Expected NULL until Pass 3 implemented.

**Verdict:** ✓ DESIGN IS CORRECT (no action needed)

---

### GROUP 7: Job Coordination (V3 Infrastructure)

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `processing_job_id` | UUID | Job queue reference | YES | Populated correctly | ✓ KEEP |
| `processing_worker_id` | VARCHAR(100) | Worker that processed file | YES | Populated correctly | ✓ KEEP |
| `processing_priority` | INTEGER | Queue priority | YES | Default 100 | ✓ KEEP |
| `idempotency_key` | TEXT | Prevents duplicate processing | YES | Populated correctly | ✓ KEEP |

**Sample Data:**
```
processing_job_id: "4c4508ec-ca0b-4a31-8542-3ce31c9e3ddd"
processing_worker_id: "render-srv-d2qkja56ubrc73dh13q0-1762335179164"
processing_priority: 100
idempotency_key: "388d7e59-111f-4f70-acef-52b738efa0d3"
```

**Analysis:** V3 job coordination working correctly.

**Verdict:** ✓ ALL WORKING CORRECTLY

---

### GROUP 8: Business Analytics

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `processing_cost_estimate` | DECIMAL(10,4) | Estimated cost | YES | Default 0 | ⚠️ POPULATE |
| `processing_duration_seconds` | INTEGER | Actual processing time | **NO** | NULL | ⚠️ POPULATE |

**Problem:** Cost tracking incomplete.

**Recommendation:**
```typescript
// Worker should update after Pass 0.5 completes:
await supabase.from('shell_files').update({
  processing_cost_estimate: pass05Result.aiCostUsd,
  processing_duration_seconds: Math.round(pass05Result.processingTimeMs / 1000)
}).eq('id', shellFileId);
```

**Verdict:** Low priority issue - leave as is for now. No changes. 

---

### GROUP 9: Upload Metadata

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `language_detected` | TEXT | Document language | YES | Default 'en' | ✓ KEEP |
| `provider_name` | TEXT | Provider name | **NO** | See Issue #3 | ⚠️ REVIEW |
| `facility_name` | TEXT | Facility name | **NO** | See Issue #3 | ⚠️ REVIEW |
| `upload_context` | TEXT | Upload source/context | **NO** | See Issue #5 | ⚠️ REMOVE? |

**Analysis:** See Issues #3 and #5 above for full analysis.

**Verdict:** Remove provider_name, facility_name and upload_context

---

### GROUP 10: Processed Image Metadata (Phase 2)

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `processed_image_path` | TEXT | Storage path for JPEGs | YES | Populated correctly | ✓ KEEP |
| `processed_image_checksum` | TEXT | SHA256 hash | YES | Populated correctly | ✓ KEEP |
| `processed_image_mime` | TEXT | MIME type (image/jpeg) | YES | Populated correctly | ✓ KEEP |
| **`processed_image_size_bytes`** | - | **MISSING COLUMN** | **NO** | See Issue #1 | ⚠️ ADD |

**Sample Data:**
```
processed_image_path: "d1dbe18c.../1c1c18b9...-processed"
processed_image_checksum: "5cd9e89eb9873da1bc6283ebc9b735cbf1a1d3f5913a658398f711f2809c64bb"
processed_image_mime: "image/jpeg"
processed_image_size_bytes: NULL (COLUMN DOESN'T EXIST)
```

**Recommendation:** Add column to track processed image storage size (see Issue #1).

**Verdict:** ⚠️ ADD COLUMN

---

### GROUP 11: Pass 0.5 Completion Tracking

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `pass_0_5_completed` | BOOLEAN | Pass 0.5 done | YES | Correctly set to TRUE | ✓ KEEP |
| `pass_0_5_completed_at` | TIMESTAMPTZ | When Pass 0.5 finished | YES | Correct timestamp | ✓ KEEP |
| `pass_0_5_error` | TEXT | Pass 0.5 error message | NULL | Expected NULL on success | ✓ KEEP |
| `page_separation_analysis` | JSONB | Inter-page dependencies | **NO** | Not implemented (Migration 39) | ℹ️ FUTURE |

**Sample Data:**
```
pass_0_5_completed: TRUE
pass_0_5_completed_at: "2025-11-05 22:04:52.299516+00"
pass_0_5_error: NULL
page_separation_analysis: NULL (batching analysis not implemented)
```

**Analysis:**
- Pass 0.5 completion tracking works correctly
- `page_separation_analysis` is future feature for smart batching (not yet implemented)

**Verdict:** ✓ WORKING CORRECTLY (page_separation_analysis is future work)

---

### GROUP 12: Audit and Lifecycle

| Column | Type | Purpose | Populated? | Issues | Verdict |
|--------|------|---------|------------|--------|---------|
| `created_at` | TIMESTAMPTZ NOT NULL | Record creation | YES | Correct timestamps | ✓ KEEP |
| `updated_at` | TIMESTAMPTZ NOT NULL | Last modification | YES | Correct timestamps | ✓ KEEP |

**Analysis:** Standard audit columns populated correctly.

**Verdict:** ✓ ALL WORKING CORRECTLY

---

## Summary of Findings

### CRITICAL ISSUES (Immediate Action Required)

1. **file_type and file_subtype Always NULL**
   - **Impact:** Cannot filter documents by type in UI
   - **Action:** Add document classification to Pass 0.5 OR remove columns
   - **Priority:** MEDIUM

2. **provider_name and facility_name Always NULL**
   - **Impact:** Cannot filter by provider/facility at shell_files level
   - **Action:** Either populate from encounters OR remove columns
   - **Priority:** LOW (data exists in healthcare_encounters)

3. **Processed Image Size Not Tracked**
   - **Impact:** Cannot calculate storage costs accurately
   - **Action:** Add `processed_image_size_bytes` column
   - **Priority:** MEDIUM

### DESIGN DECISIONS NEEDED

1. **upload_context Column**
   - **Decision:** Keep and define purpose OR remove as vestigial?
   - **Recommendation:** REMOVE (unused, no clear purpose)

2. **provider_name/facility_name**
   - **Decision:** Populate for single-encounter files OR remove entirely?
   - **Recommendation:** REMOVE (Frankenstein files make this ambiguous)

3. **file_type Population**
   - **Decision:** Have Pass 0.5 classify document type OR derive from encounters?
   - **Recommendation:** Ask Pass 0.5 to classify (more accurate)

### WORKING CORRECTLY (No Action Needed)

✓ Physical file metadata (original file)
✓ Processing status tracking
✓ Job coordination (V3 infrastructure)
✓ Processed image metadata (path, checksum, mime)
✓ Pass 0.5 completion tracking
✓ Audit timestamps
✓ page_count (FIXED 2025-11-06)

### EXPECTED NULL (Future Features)

ℹ️ ai_synthesized_summary (Pass 3)
ℹ️ narrative_count (Pass 3)
ℹ️ synthesis_completed_at (Pass 3)
ℹ️ page_separation_analysis (smart batching)

---

## Recommendations

### Immediate Actions

1. **Add processed_image_size_bytes Column**
   ```sql
   ALTER TABLE shell_files
   ADD COLUMN processed_image_size_bytes BIGINT;
   ```

2. **Populate Cost/Duration Fields**
   Update worker to set:
   - `processing_cost_estimate` from Pass 0.5 aiCostUsd
   - `processing_duration_seconds` from Pass 0.5 processingTimeMs

### Schema Cleanup

3. **Remove Vestigial Columns** (if user approves)
   ```sql
   ALTER TABLE shell_files
   DROP COLUMN upload_context,
   DROP COLUMN provider_name,
   DROP COLUMN facility_name,
   DROP COLUMN file_type,
   DROP COLUMN file_subtype,
   DROP COLUMN confidence_score;
   ```

   OR

4. **Populate file_type/subtype via Pass 0.5**
   Add document classification to Pass 0.5 prompt and worker output.

### Data Quality

5. **Monitor Column Population Rates**
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE file_type IS NOT NULL) * 100.0 / COUNT(*) AS file_type_populated_pct,
     COUNT(*) FILTER (WHERE provider_name IS NOT NULL) * 100.0 / COUNT(*) AS provider_populated_pct,
     COUNT(*) FILTER (WHERE processed_image_path IS NOT NULL) * 100.0 / COUNT(*) AS processed_image_pct
   FROM shell_files
   WHERE created_at > NOW() - INTERVAL '7 days';
   ```

---

## Architectural Insights

### Healthcare Application Design Patterns

1. **Frankenstein Files Break Single-Value Assumptions**
   - Multi-encounter documents need array columns or relationships
   - Shell-file-level metadata becomes ambiguous
   - Better to query encounters table for provider/facility

2. **Separation of Concerns**
   - shell_files = physical file metadata
   - healthcare_encounters = clinical content metadata
   - Don't duplicate data between tables

3. **Storage Cost Tracking**
   - Need both original AND processed file sizes
   - Processed images often larger than PDFs (JPEG expansion)
   - Foundation for billing/quota features

4. **Pass 3 Synthesis is Shell-File-Level**
   - ai_synthesized_summary belongs in shell_files (document overview)
   - Distinct from encounter summaries (in healthcare_encounters)
   - Will enable "document library" UI with intelligent descriptions

---

**Audit Status:** COMPREHENSIVE REVIEW COMPLETE
**Next Step:** User approval for schema changes and population logic








Xavier's review 6th Nov 2025:

For shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-0.5-encounter-discovery/pass05-audits/pass05-individual-table-audits/shell_files-COLUMN-AUDIT-ANSWERS.md:
 - Issue 1: priceed with 'Recommendation: Option A (Add Column)' Add processed_image_size_bytes Column.  But will our implemented fix insert a combined total storage for the end product of the file format conversion / processing ? ie., if its a 20 page file uploaded that is made up of 2 unique medical records stuck together (like the frankenstein file), will it just have one file size value at the end of this? 

 - Issue 2: regarding file_type; i think it would be good to have a summary type value outut for the shell_file as a whole. We have this for the individual encounters but not for the shell_file as a whole, so it would be good to have. For example, on the patients app dashboard UX if they click on the uploaded files section to see which files they've uploaded, they could easily click on it and see a summary of the file, including a tech summary and maybe the summary of the file type but I'm still not sure what file type is. Is it just a string text summary made by the AI or is it a combination of the encounters within? Once we get to pass 3 and we have all the narratives as well we could also use the narratives + the encounters to help build a summary for the shell file (which is i believe the intent and purpose of 'ai_synthesized_summary' ) .  What I can see being useful is a shelf file being clicked on and a summary dates administration document compiled of multiple unique distinct medical records., or medical record compiling all recent lab reports, or travel summary with all patients recent medical history, for example. Let me know what your thoughts on this are. On a slightly similar relevant note this concept could also help the AI understand the document better and help it with it. Other tasks within the past 05 do you agree?   But im elaning towards just removing it for now, and we can decide what to do one we get to pass 3 build out etc. 

- issue 3: Confirming yes remove provider_name and facility_name from shell_files. 

- issue 4: aggree. no changes. 

- issue 5; aggree with "Recommendation: REMOVE from Schema (Vestigial Column)"

- regarding "### GROUP 8: Business Analytics"  leave these columns as is for now. no changes. 

Everything else as per your recommendations. 