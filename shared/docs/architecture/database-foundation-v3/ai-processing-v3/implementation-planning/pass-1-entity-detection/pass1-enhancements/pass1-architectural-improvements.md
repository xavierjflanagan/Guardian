# Pass 1 Architectural Improvements & Action Plan

**Date:** 2025-10-09 (Consolidated from ongoing analysis)
**Original Analysis Date:** 2025-10-05
**GPT-5 Involvement:** Review suggestions from GPT-5 model informed architectural improvements
**Status:** Action plan - Implementation pending

---

## Executive Summary

The Pass 1 entity detection pipeline is functional but requires architectural improvements to address latency, cost, and reliability issues. Current implementation processes OCR in the Edge Function before enqueueing jobs, causing 2-4 minute upload delays. Base64-encoded files embedded in job payloads create database bloat and memory pressure. Security vulnerabilities exist around JWT validation, and external API calls lack retry logic.

This document consolidates all identified improvements with clear priorities, implementation details, and expected impact. Critical items (OCR relocation, image optimization, payload cleanup) will eliminate upload latency and reduce costs. High priority items (JWT validation, retry logic) address security and reliability gaps.

Current system uses GPT-5-mini with 32K token output limit, processing documents successfully but requiring optimization for large multi-page files.

---

## Critical Improvements (BLOCKING)

### 1. Move OCR from Edge Function to Worker

**Priority:** CRITICAL
**Impact:** Eliminates 2-4 minute upload latency, prevents Edge Function timeouts
**Effort:** 2-3 hours

**Current Flow (PROBLEMATIC):**
```typescript
Edge Function:
1. Upload file to storage ✓
2. Download file from storage ❌ (unnecessary round-trip)
3. Run Google Vision OCR ❌ (2-4 minutes blocking)
4. Create job with OCR data ❌ (huge payload)
5. Return success (slow - user waits 2-4 min)

Worker:
1. Claim job
2. Use embedded OCR data
3. Run Pass 1 entity detection
```

**Proposed Flow (OPTIMIZED):**
```typescript
Edge Function:
1. Upload file to storage ✓
2. Create shell_files record ✓
3. Enqueue job with file reference only ✓
   {
     storage_path: "medical-docs/{user_id}/{file}",
     mime_type: "image/jpeg",
     file_size: 1024000,
     checksum: "sha256..."
   }
4. Return 201 (instant!) ✓

Worker:
1. Claim job
2. Download file from storage using storage_path
3. Run Google Vision OCR (background, user doesn't wait)
4. Downscale image (max 1600px, JPEG 75%)
5. Run Pass 1 entity detection
6. Write results to database
```

**Benefits:**
- Instant upload response (< 1 second vs 2-4 minutes)
- Edge Function stays lightweight (prevents timeouts)
- Better separation of concerns (orchestration vs processing)
- Safer retries (worker can retry OCR without user re-upload)
- Eliminates unnecessary file download in Edge Function

**Implementation Changes:**
- **Edge Function:** Remove OCR processing, enqueue with storage reference only
- **Worker:** Add OCR as first step in job processing
- **Job Schema:** Remove `ocr_spatial_data` from payload, add `storage_path`
- **Validation:** Add checksum verification to detect file tampering
- **OCR Persistence:** Save OCR artifacts for reuse across retries and downstream passes

#### OCR Artifact Persistence

**Storage Structure:**
- Bucket: `medical-docs/` (existing bucket, reuse permissions)
- Layout: `{user_id}/{shell_file_id}-ocr/manifest.json` + `page-{n}.json`
- Manifest tracks page count, versions, checksums for all pages

**Database Index Table:**
```sql
CREATE TABLE ocr_artifacts (
  shell_file_id UUID PRIMARY KEY REFERENCES shell_files(id) ON DELETE CASCADE,
  manifest_path TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google_vision',
  checksum TEXT NOT NULL,
  pages INT NOT NULL,
  bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ocr_artifacts_created ON ocr_artifacts(created_at);
COMMENT ON TABLE ocr_artifacts IS 'Index table for OCR artifact discovery and automatic cleanup via CASCADE';
```

**Manifest Structure (manifest.json):**
```json
{
  "shell_file_id": "abc-123-def",
  "provider": "google_vision",
  "version": "v1.2024.10",
  "page_count": 3,
  "total_bytes": 156789,
  "checksum": "sha256...",
  "pages": [
    {
      "page_number": 1,
      "artifact_path": "page-1.json",
      "bytes": 52345,
      "width_px": 2550,
      "height_px": 3300
    },
    {
      "page_number": 2,
      "artifact_path": "page-2.json",
      "bytes": 51234,
      "width_px": 2550,
      "height_px": 3300
    },
    {
      "page_number": 3,
      "artifact_path": "page-3.json",
      "bytes": 53210,
      "width_px": 2550,
      "height_px": 3300
    }
  ],
  "created_at": "2025-10-09T12:34:56.789Z"
}
```

**Per-Page Artifact Structure (page-{n}.json):**
```json
{
  "page_number": 1,
  "size": {
    "width_px": 2550,
    "height_px": 3300
  },
  "lines": [
    {
      "text": "IMMUNIZATIONS",
      "bbox": { "x": 120, "y": 180, "w": 830, "h": 48 },
      "bbox_norm": { "x": 0.047, "y": 0.055, "w": 0.325, "h": 0.015 },
      "confidence": 0.98,
      "reading_order": 12
    },
    {
      "text": "Fluvax 2024-03-15",
      "bbox": { "x": 140, "y": 240, "w": 280, "h": 32 },
      "bbox_norm": { "x": 0.055, "y": 0.073, "w": 0.110, "h": 0.010 },
      "confidence": 0.94,
      "reading_order": 13
    }
  ],
  "tables": [
    {
      "bbox": { "x": 100, "y": 500, "w": 2000, "h": 800 },
      "bbox_norm": { "x": 0.039, "y": 0.152, "w": 0.784, "h": 0.242 },
      "rows": 10,
      "columns": 4,
      "confidence": 0.91
    }
  ],
  "provider": "google_vision",
  "processing_time_ms": 14320
}
```

**Benefits of OCR Artifact Persistence:**
1. **Reuse on Retries:** No re-OCR if job fails (save 2-4 minutes + API costs)
2. **Shared Across Passes:** Pass 1, 2, 3 all use same OCR artifacts
3. **Click-to-Zoom:** Frontend can load bboxes for document highlighting
4. **Debugging:** Inspect OCR quality independent of AI processing
5. **Automatic Cleanup:** ON DELETE CASCADE removes artifacts when shell_file deleted
6. **Future OCR-Only Mode:** Enables text-only AI calls with bbox context

**Worker Implementation:**
```typescript
// After OCR completes, persist artifacts
async persistOCRArtefacts(
  shellFileId: string,
  userId: string,
  ocrResult: GoogleVisionOCRResult
): Promise<void> {
  const basePath = `${userId}/${shellFileId}-ocr`;

  // Create per-page artifacts
  const pageArtifacts = ocrResult.pages.map((page, idx) => ({
    page_number: idx + 1,
    artifact_path: `page-${idx + 1}.json`,
    bytes: JSON.stringify(page).length,
    width_px: page.size.width_px,
    height_px: page.size.height_px
  }));

  // Create manifest
  const manifest = {
    shell_file_id: shellFileId,
    provider: 'google_vision',
    version: 'v1.2024.10',
    page_count: ocrResult.pages.length,
    total_bytes: pageArtifacts.reduce((sum, p) => sum + p.bytes, 0),
    checksum: await calculateChecksum(JSON.stringify(ocrResult)),
    pages: pageArtifacts,
    created_at: new Date().toISOString()
  };

  // Upload manifest
  await this.supabase.storage
    .from('medical-docs')
    .upload(`${basePath}/manifest.json`, JSON.stringify(manifest, null, 2));

  // Upload per-page artifacts
  for (let i = 0; i < ocrResult.pages.length; i++) {
    await this.supabase.storage
      .from('medical-docs')
      .upload(
        `${basePath}/page-${i + 1}.json`,
        JSON.stringify(ocrResult.pages[i], null, 2)
      );
  }

  // Create index table record
  await this.supabase.from('ocr_artifacts').insert({
    shell_file_id: shellFileId,
    manifest_path: `${basePath}/manifest.json`,
    provider: 'google_vision',
    checksum: manifest.checksum,
    pages: ocrResult.pages.length,
    bytes: manifest.total_bytes
  });
}
```

**Status:** Not implemented

---

### 2. Image Downscaling

**Priority:** CRITICAL
**Impact:** 50-70% reduction in token usage, faster processing, lower costs
**Effort:** 1-2 hours

**Current State:**
Full-resolution images (often 3000x4000px+) sent directly to OpenAI Vision API, resulting in:
- Massive token counts (vision tokens are expensive)
- Slow API response times
- Higher costs per document
- Unnecessary detail for medical document entity detection

**Proposed Solution:**
```typescript
async function downscaleImage(
  base64Data: string,
  maxWidth: number = 1600,
  quality: number = 75
): Promise<string> {
  const buffer = Buffer.from(base64Data, 'base64');
  const resized = await sharp(buffer)
    .resize(maxWidth, null, {
      withoutEnlargement: true,
      fit: 'inside'
    })
    .jpeg({ quality })
    .toBuffer();
  return resized.toString('base64');
}

// Usage in Pass1EntityDetector (before OpenAI call)
const optimizedImage = await downscaleImage(input.raw_file.file_data);
// Send optimizedImage to OpenAI instead of raw
```

**Expected Impact:**
- 50-70% reduction in vision input tokens
- 2-3x faster API response times
- Proportional cost reduction
- Medical text still perfectly readable at 1600px width
- JPEG quality 75% maintains diagnostic clarity

**Dependencies:**
- Add `sharp` library to worker dependencies: `pnpm add sharp`
- Ensure worker has sufficient memory for image processing

**Status:** Not implemented

---

### 3. Remove Base64 from Job Payload

**Priority:** CRITICAL
**Impact:** Smaller job rows, faster DB operations, lower memory pressure
**Effort:** 2-3 hours

**Current Problem:**
Raw files converted to base64 and embedded directly in `job_queue.job_payload` JSONB:
- 1MB image → ~1.4MB base64 → stored in database row
- Inflates job records to multi-megabyte size
- Slow INSERT/SELECT operations
- High memory usage in worker
- Risks hitting PostgreSQL row size limits (1GB max)
- PII exposure in database dumps/logs

**Proposed Solution:**
Store only file reference, download on-demand in worker:

```typescript
// Edge Function - Enqueue with reference
const job = await supabase.rpc('enqueue_job_v3', {
  p_job_type: 'ai_processing',
  p_job_payload: {
    shell_file_id: shellFileId,
    patient_id: patientId,
    storage_path: storagePath,        // Reference only
    mime_type: file.type,
    file_size: file.size,
    checksum: await calculateChecksum(file)
  }
});

// Worker - Download on-demand
async processJob(job: Job) {
  const { storage_path, checksum } = job.job_payload;

  // Download from storage
  const { data, error } = await this.supabase.storage
    .from('medical-docs')
    .download(storage_path);

  if (error) throw new Error(`File download failed: ${error.message}`);

  // Verify integrity
  const actualChecksum = await calculateChecksum(data);
  if (actualChecksum !== checksum) {
    throw new Error('File integrity check failed');
  }

  // Convert to base64 just-in-time
  const base64 = data.toString('base64');

  // Continue processing...
}
```

**Benefits:**
- Job payload size: ~1.4MB → ~500 bytes (99.96% reduction)
- Faster database operations (INSERT/SELECT)
- Lower memory usage in worker
- Safer retries (file stored independently)
- Cleaner separation (storage layer vs job queue)
- Reduced PII in database logs
- Enables on-demand image optimization

**Implementation Requirements:**
- Edge Function: Remove base64 conversion, enqueue storage_path only
- Worker: Add storage download with checksum validation
- Error handling: Graceful "file not found" scenarios
- Verify worker service role has storage read permissions (already configured)

**Status:** Not implemented

---

## High Priority Security & Reliability

### 4. JWT Validation in Edge Function

**Priority:** HIGH (Security Vulnerability)
**Impact:** Prevents unauthorized file uploads for other users
**Effort:** 2-3 hours

**Current Security Flaw:**
Edge Function uses service role client without verifying caller's JWT. Any request with valid `apikey` can upload files for any `patient_id`, bypassing user isolation.

**Attack Vector:**
```bash
# Attacker can upload malicious file for victim's patient_id
curl -X POST https://your-project.supabase.co/functions/v1/shell-file-processor-v3 \
  -H "apikey: ANON_KEY" \
  -d '{"patient_id": "VICTIM_UUID", "file": "malicious_data"}'
```

**Proposed Fix:**
```typescript
// Edge Function - Add JWT validation
export async function handler(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return createErrorResponse({
      code: 'UNAUTHORIZED',
      message: 'Missing authorization header'
    }, 401);
  }

  // Verify JWT and extract user
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return createErrorResponse({
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired token'
    }, 401);
  }

  // Verify patient_id belongs to authenticated user
  const { data: hasAccess } = await supabase.rpc('has_profile_access', {
    p_user_id: user.id,
    p_profile_id: requestData.patient_id
  });

  if (!hasAccess) {
    return createErrorResponse({
      code: 'FORBIDDEN',
      message: 'Access denied to this patient profile'
    }, 403);
  }

  // Continue processing (user is authorized)
}
```

**Implementation Notes:**
- Use `supabase.auth.getUser()` instead of `getSession()` (more secure)
- Leverage existing `has_profile_access()` RLS function
- Return appropriate HTTP status codes (401 vs 403)
- Add correlation_id to auth error logs

**Status:** Not implemented

---

### 5. Retry Logic for External APIs

**Priority:** HIGH (Reliability)
**Impact:** Prevents data loss from transient API failures
**Effort:** 2-3 hours

**Current Problem:**
Worker calls external APIs (OpenAI, Google Vision, Supabase Storage) without retry logic. Transient failures (429 rate limits, 5xx errors, timeouts) cause job failures and data loss.

**Proposed Solution:**
```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  operation: string = 'operation'
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = i === maxRetries - 1;

      // Don't retry on permanent errors
      if (isNonRetryableError(error)) {
        console.error(`[Retry] Non-retryable error in ${operation}:`, error);
        throw error;
      }

      if (isLastAttempt) {
        console.error(`[Retry] Max retries (${maxRetries}) exceeded for ${operation}`);
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s...
      const delay = baseDelay * Math.pow(2, i);
      console.warn(`[Retry] ${operation} failed (attempt ${i + 1}/${maxRetries}), retrying in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Retry logic error - should never reach here');
}

function isNonRetryableError(error: any): boolean {
  // Don't retry on:
  // - 400 Bad Request (invalid input)
  // - 401 Unauthorized (invalid credentials)
  // - 404 Not Found (resource doesn't exist)
  const nonRetryableStatusCodes = [400, 401, 404];
  return nonRetryableStatusCodes.includes(error.status);
}

// Usage in Pass1EntityDetector
const ocrResult = await retryWithBackoff(
  () => processWithGoogleVisionOCR(base64Data, mimeType),
  3,
  1000,
  'Google Vision OCR'
);

const pass1Result = await retryWithBackoff(
  () => this.openai.chat.completions.create({ /* ... */ }),
  3,
  2000,
  'OpenAI Pass 1 Detection'
);

const storageDownload = await retryWithBackoff(
  () => supabase.storage.from('medical-docs').download(path),
  3,
  1000,
  'Storage Download'
);
```

**Retry Strategy:**
- OpenAI: 3 retries, 2s base delay (handles rate limits, timeouts)
- Google Vision: 3 retries, 1s base delay (handles transient failures)
- Supabase Storage: 3 retries, 1s base delay (handles network issues)
- Exponential backoff prevents API hammering
- Skip retry on 4xx errors (permanent failures)

**Benefits:**
- Resilient to transient API failures
- Automatic recovery from rate limits
- Prevents data loss from network issues
- Better user experience (fewer failed jobs)
- Detailed retry logging for debugging

**Status:** Not implemented

---

## Medium Priority Enhancements

### 6. Structured Logging

**Priority:** MEDIUM (Observability)
**Impact:** Easier debugging, performance monitoring, SLA tracking
**Effort:** 2-3 hours

**Current State:**
Inconsistent logging across Edge Function and Worker. Some logs include `correlation_id`, others don't. Timing information incomplete. Hard to trace request flow through entire pipeline.

**Proposed Standard:**
```typescript
interface StructuredLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  correlation_id: string;
  component: 'edge-function' | 'worker';
  operation: string;
  shell_file_id?: string;
  job_id?: string;
  patient_id?: string;
  duration_ms?: number;
  error_code?: string;
  message: string;
  metadata?: Record<string, any>;
}

function logStructured(log: StructuredLog) {
  console.log(JSON.stringify({
    ...log,
    timestamp: new Date().toISOString()
  }));
}

// Usage examples
logStructured({
  level: 'info',
  correlation_id: correlationId,
  component: 'worker',
  operation: 'ocr_processing',
  shell_file_id: shellFileId,
  duration_ms: Date.now() - startTime,
  message: 'OCR completed successfully'
});

logStructured({
  level: 'error',
  correlation_id: correlationId,
  component: 'edge-function',
  operation: 'file_upload',
  patient_id: patientId,
  error_code: 'FILE_TOO_LARGE',
  message: 'File exceeds 50MB limit',
  metadata: { file_size: file.size }
});
```

**Key Requirements:**
- Every log includes `correlation_id` (trace request through pipeline)
- Include `shell_file_id` and `job_id` when available
- Log operation start and completion with duration
- Structured JSON format (parseable by log aggregators)
- Consistent field names across components

**Status:** Partially implemented (correlation_id exists, needs standardization)

---

### 7. Prompt Optimization

**Priority:** MEDIUM (Cost & Performance)
**Impact:** 30-50% token reduction, faster processing, lower costs
**Effort:** 2-4 hours

**Current State:**
Pass 1 prompt is 348 lines with verbose instructions, redundant text, and uncompressed examples. Consumes unnecessary input tokens on every request.

**Optimizations to Apply:**

**A. Remove Duplicate OCR Text**
- Current: OCR text appears twice in prompt (lines 87 and 226-231)
- Fix: Delete "DOCUMENT PROCESSING" section
- Savings: ~100 tokens per request

**B. Compress Taxonomy Examples**
- Current: `vital_sign: Physiological measurements (BP: 140/90, temp: 98.6°F, pulse: 72 bpm)`
- Proposed: `vital_sign: BP 140/90, temp 98.6°F, pulse 72bpm`
- Savings: ~30% reduction in taxonomy section

**C. Add Low-Confidence Inclusion Rule**
- Current: Prompt doesn't specify what to do with uncertain entities
- Fix: Add "Always emit uncertain items; set requires_manual_review=true when confidence < 0.7"
- Impact: Prevents data loss from AI skipping low-confidence entities

**D. Server-Side Truncation Enforcement**
- Current: Prompt instructs 120-char limit but no code enforcement
- Fix: Add truncation in `pass1-translation.ts` before database insert
- Benefit: Defense in depth (don't trust AI to enforce limits)

**E. Clarify Metrics Instructions**
- Current: Says "for each list section" but response format has global metrics
- Fix: Change to "Report overall list extraction metrics"
- Impact: Clearer instructions, less AI confusion

**Status:** Batch 1 completed (model name passing, duplicate removal, low-confidence rule, metrics wording). Batch 2 pending (taxonomy compression, server-side truncation).

---

### 8. File Size Limits

**Priority:** MEDIUM (Tied to OCR location)
**Impact:** Prevents resource spikes and timeouts
**Effort:** 30 minutes

**Current State:**
50MB file size limit enforced in Edge Function. Appropriate if OCR moves to worker, too high if OCR stays in Edge Function.

**Decision Matrix:**
- **If OCR in Worker (recommended):** Keep 50MB limit (Edge Function just validates and enqueues)
- **If OCR in Edge Function:** Reduce to 20-30MB (prevent timeouts and memory spikes)

**Implementation:**
```typescript
// Edge Function validation
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

if (file.size > MAX_FILE_SIZE) {
  return createErrorResponse({
    code: 'FILE_TOO_LARGE',
    message: `File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds maximum ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    details: {
      file_size: file.size,
      max_size: MAX_FILE_SIZE,
      suggestion: 'Compress or split the document before uploading'
    }
  }, 413);
}
```

**Status:** Current 50MB limit functional, decision pending OCR relocation

---

## Performance Analysis

### GPT-5 vs GPT-4o Model Selection

**Current Choice:** GPT-5-mini with 32K token output limit

**Model Performance Comparison:**

| Model | Speed | Cost (Input/Output per 1M tokens) | Quality | Production Status |
|-------|-------|-----------------------------------|---------|-------------------|
| GPT-4o | 191 tok/sec | $2.50 / $10 | Excellent | Previously used, stable |
| GPT-5-mini | ~100 tok/sec | $0.25 / $2 | Good | Currently deployed |
| GPT-5 standard | 12 tok/sec | $1.25 / $10 | Best | Too slow for current architecture |

**Why GPT-5-mini (Current):**
- 80% cost reduction vs GPT-4o ($0.25 vs $2.50 input)
- Acceptable speed for background processing (~100 tok/sec)
- 32K token output handles 1-5 page documents
- Good quality for entity detection tasks

**Known Limitations:**
- Will hit 32K token limit on documents with 100+ entities
- Slower than GPT-4o (but acceptable for background jobs)
- May need page-by-page processing for very large documents

**Future Considerations:**
Once architectural optimizations are complete (image downscaling, prompt compression), re-evaluate model choice based on:
- Actual token usage per page
- Processing speed requirements
- Cost vs quality tradeoffs

---

### Latency Analysis: Queue Delay Root Causes

**Observed Issue:** 2-4 minute gap between file upload and Pass 1 job start

**Root Causes Identified:**

**1. Pre-Enqueue OCR Time (PRIMARY - 120-240 seconds)**
- Edge Function runs Google Vision OCR before enqueueing job
- OCR duration stored in `job_payload.ocr_spatial_data.processing_time_ms`
- Job doesn't exist in queue until OCR completes
- User waits entire duration before receiving upload confirmation

**2. Enqueue Backpressure (SECONDARY - 0-60 seconds)**
- `enqueue_job_v3` can defer `scheduled_at` when API rate limits indicate load
- Job won't be claimable until `scheduled_at <= now()`
- Affects all jobs during high-traffic periods

**3. Worker Poll Interval (NEGLIGIBLE - 5 seconds)**
- Worker polls every 5 seconds for new jobs
- Minimal impact compared to OCR time

**Verification Query:**
```sql
SELECT
  id,
  shell_file_id,
  created_at,
  scheduled_at,
  started_at,
  make_interval(secs => (job_payload->'ocr_spatial_data'->>'processing_time_ms')::int/1000.0) as ocr_duration,
  (scheduled_at - created_at) as backpressure_delay,
  (started_at - greatest(created_at, scheduled_at)) as queue_wait
FROM job_queue
WHERE job_type = 'ai_processing'
  AND job_payload->>'shell_file_id' = 'YOUR_SHELL_FILE_ID';
```

**Interpretation:**
- `ocr_duration` ≈ 2-4 min → Delay is pre-enqueue OCR
- `backpressure_delay` > 0 → Enqueue deferral active
- `queue_wait` > 30s → Worker saturation or outage

**Solution:** Move OCR to worker (Item #1) eliminates primary cause

---

## Already Completed

**Core V3 Pipeline:**
- ✅ CORS headers with Access-Control-Expose-Headers
- ✅ Render worker configuration and deployment
- ✅ Usage tracking with service role support
- ✅ RLS policies for shell_files table
- ✅ Idempotency key support
- ✅ Worker job claiming and processing
- ✅ Pass 1 entity detection with GPT-5-mini
- ✅ Database writes to all 7 Pass 1 tables
- ✅ shell_files status transitions (uploaded → pass1_complete)

**Performance & Quality:**
- ✅ GPT-5-mini deployment with 32K token output limit
- ✅ Worker timeout increase (300s → 1800s for large documents)
- ✅ Prompt engineering - List handling rules (split items, don't summarize)
- ✅ Low-confidence entity inclusion (emit uncertain entities with manual review flag)
- ✅ Token limit fixes (4000 → 8000 → 16000 → 32000)
- ✅ Prompt optimization batch 1 (model name passing, duplicate removal, metrics clarification)

**Job Queue Enhancements:**
- ✅ Fixed worker job type mismatch
- ✅ Job status transitions working correctly
- ✅ shell_files status constraint expanded (pass1_complete, pass2_complete, pass3_complete)

---

## Detailed Implementation Guides

### Move OCR to Worker - Step-by-Step

**Step 1: Update Edge Function**

File: `supabase/functions/shell-file-processor-v3/index.ts`

Remove OCR processing (lines ~348-366):
```typescript
// REMOVE THIS SECTION
const fileBuffer = await response.arrayBuffer();
const base64Data = Buffer.from(fileBuffer).toString('base64');
const ocrResult = await processWithGoogleVisionOCR(base64Data, file.type);
```

Replace with storage reference:
```typescript
// Add checksum calculation
const checksum = await calculateSHA256(file);

// Enqueue with reference only
const jobPayload = {
  shell_file_id: shellFileId,
  patient_id: patientId,
  storage_path: storagePath,
  mime_type: file.type,
  file_size: file.size,
  checksum: checksum,
  // Remove: ocr_spatial_data (will be generated in worker)
};
```

**Step 2: Update Worker OCR Handling**

File: `apps/render-worker/src/pass1/index.ts`

Add OCR as first step:
```typescript
async processAIJob(job: Job): Promise<void> {
  const { storage_path, checksum, mime_type } = job.job_payload;

  // Download file from storage
  const { data, error } = await this.supabase.storage
    .from('medical-docs')
    .download(storage_path);

  if (error) {
    throw new Error(`Storage download failed: ${error.message}`);
  }

  // Verify checksum
  const actualChecksum = await calculateSHA256(data);
  if (actualChecksum !== checksum) {
    throw new Error('File integrity check failed - possible tampering');
  }

  // Convert to base64
  const base64Data = Buffer.from(await data.arrayBuffer()).toString('base64');

  // Run OCR (now in worker, not blocking user upload)
  const ocrResult = await processWithGoogleVisionOCR(base64Data, mime_type);

  // Continue with Pass 1 detection...
  const input = {
    raw_file: { file_data: base64Data, mime_type },
    ocr_spatial_data: ocrResult,
    // ...
  };

  await this.pass1Detector.detectEntities(input);
}
```

**Step 3: Add Checksum Utility**

File: `apps/render-worker/src/utils/checksum.ts`

```typescript
import crypto from 'crypto';

export async function calculateSHA256(data: Blob | Buffer): Promise<string> {
  const buffer = data instanceof Buffer
    ? data
    : Buffer.from(await data.arrayBuffer());

  return crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex');
}
```

**Step 4: Update Job Schema**

Update TypeScript types to reflect new payload structure:
```typescript
interface AIProcessingJobPayload {
  shell_file_id: string;
  patient_id: string;
  storage_path: string;    // NEW: Reference to storage
  mime_type: string;
  file_size: number;
  checksum: string;        // NEW: Integrity verification
  // REMOVED: ocr_spatial_data (generated in worker)
}
```

**Step 5: Deploy and Test**

1. Deploy Edge Function changes
2. Deploy Worker changes
3. Upload test document
4. Verify instant 201 response (< 1 second)
5. Monitor worker logs for OCR execution
6. Confirm Pass 1 results in database

---

### Image Downscaling - Implementation

**Step 1: Add sharp Dependency**

```bash
cd apps/render-worker
pnpm add sharp
pnpm add -D @types/sharp
```

**Step 2: Create Downscaling Utility**

File: `apps/render-worker/src/utils/image-optimization.ts`

```typescript
import sharp from 'sharp';

export interface ImageOptimizationOptions {
  maxWidth: number;
  quality: number;
}

export async function optimizeImageForVision(
  base64Data: string,
  options: ImageOptimizationOptions = { maxWidth: 1600, quality: 75 }
): Promise<string> {
  try {
    const buffer = Buffer.from(base64Data, 'base64');

    // Get original dimensions
    const metadata = await sharp(buffer).metadata();
    console.log(`[ImageOptimization] Original: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

    // Downscale and compress
    const optimized = await sharp(buffer)
      .resize(options.maxWidth, null, {
        withoutEnlargement: true,  // Don't upscale small images
        fit: 'inside'               // Maintain aspect ratio
      })
      .jpeg({ quality: options.quality })  // Convert to JPEG with compression
      .toBuffer();

    const optimizedMetadata = await sharp(optimized).metadata();
    console.log(`[ImageOptimization] Optimized: ${optimizedMetadata.width}x${optimizedMetadata.height}`);
    console.log(`[ImageOptimization] Size reduction: ${buffer.length} → ${optimized.length} bytes (${((1 - optimized.length/buffer.length) * 100).toFixed(1)}% savings)`);

    return optimized.toString('base64');
  } catch (error) {
    console.error('[ImageOptimization] Failed to optimize image:', error);
    // Fallback: return original if optimization fails
    return base64Data;
  }
}
```

**Step 3: Integrate into Pass1EntityDetector**

File: `apps/render-worker/src/pass1/Pass1EntityDetector.ts`

```typescript
import { optimizeImageForVision } from '../utils/image-optimization';

async detectEntities(input: Pass1Input): Promise<Pass1ProcessingResult> {
  // Optimize image before sending to OpenAI
  const optimizedImage = await optimizeImageForVision(
    input.raw_file.file_data,
    { maxWidth: 1600, quality: 75 }
  );

  // Use optimized image in API call
  const messages = [
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: `data:${input.raw_file.mime_type};base64,${optimizedImage}`,
            detail: "high"
          }
        },
        // ... rest of prompt
      ]
    }
  ];

  // Continue with OpenAI call...
}
```

**Step 4: Test and Monitor**

1. Deploy worker with sharp dependency
2. Upload test document
3. Monitor logs for optimization metrics
4. Verify token reduction in OpenAI API usage
5. Confirm entity detection quality unchanged

---

### Remove Base64 from Payload - Implementation

**Combined with OCR Move** (see "Move OCR to Worker" section above)

Key changes already covered:
- Edge Function: Enqueue with `storage_path` instead of embedded base64
- Worker: Download from storage, verify checksum, convert just-in-time
- Error handling: Graceful "file not found" scenarios

Additional considerations:
```typescript
// Worker: Handle storage download failures gracefully
async downloadFile(storagePath: string, maxRetries: number = 3): Promise<Buffer> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data, error } = await this.supabase.storage
      .from('medical-docs')
      .download(storagePath);

    if (!error && data) {
      return Buffer.from(await data.arrayBuffer());
    }

    if (attempt === maxRetries - 1) {
      throw new Error(`File download failed after ${maxRetries} attempts: ${error?.message}`);
    }

    // Wait before retry (exponential backoff)
    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
  }

  throw new Error('Should never reach here');
}
```

---

## Future: OCR-Only Mode (Selective Vision)

**Purpose:** Enable cost-optimized processing by defaulting to text-only AI calls, with targeted vision fallback for low-confidence cases.

**Status:** Architectural seams to add now, full implementation later

###Mode Flags

```bash
# Worker environment variables
PASS1_MODE=dual|ocr_only  # Default: dual
PASS1_VISUAL_FALLBACK=true|false  # Default: false
```

**Mode Behaviors:**

**`dual` (Current):**
- OCR runs first (sequential)
- AI receives BOTH raw image + OCR text
- Vision model processes both inputs for entity detection
- Full entity output schema

**`ocr_only` (Future):**
- OCR runs first (sequential)
- AI receives ONLY OCR text + bboxes (no raw image)
- Text-only model uses OCR structure for entity detection
- Same entity output schema (database agnostic)

**`PASS1_VISUAL_FALLBACK=true`:**
- Enables targeted vision calls for low-confidence regions
- Triggers when: OCR confidence < 0.7, handwriting detected, visual-only cues needed
- Only processes specific page regions, not entire document

### Expected Impact

**Cost Savings:**
- Dual mode: ~$0.30/page (vision tokens expensive)
- OCR-only mode: ~$0.05/page (text tokens cheap)
- 80-85% cost reduction on happy path
- Vision fallback adds ~$0.10/region when triggered

**Latency:**
- Dual mode: 2-4 min/page (vision generation time)
- OCR-only mode: 30-60 sec/page (text processing faster)
- 50-75% latency reduction

**Quality:**
- 70-90% of medical content is text-driven (OCR-only sufficient)
- Visual fallback covers edge cases: logos, stamps, checkboxes, handwriting quality
- Net quality maintained with selective vision use

### Implementation Requirements

**Minimal Changes Now (Add Seams):**

1. **Mode Branching in Worker:**
```typescript
const PASS1_MODE = process.env.PASS1_MODE || 'dual';

if (PASS1_MODE === 'dual') {
  // Current: Send image + OCR to vision model
  const entities = await callGPT5WithVision({
    image: base64Image,
    ocrText: ocrResult.text,
    ocrBboxes: ocrResult.bboxes
  });
} else if (PASS1_MODE === 'ocr_only') {
  // Future: Send only OCR text to language model
  const entities = await callGPT5TextOnly({
    ocrText: ocrResult.text,
    ocrBboxes: ocrResult.bboxes,
    layout: ocrResult.structure
  });
}
```

2. **OCR Artifact Persistence** (Already covered in Item #1)
- Enables reuse across passes
- Provides bbox context for OCR-only mode
- Supports click-to-zoom functionality

3. **Schema Versioning:**
Prefer JSON objects with `schema_version` over positional arrays:

```typescript
// GOOD: Schema-versioned JSON
{
  "schema_version": 1,
  "entities": [
    {
      "id": "e1",
      "category": "vital_sign",
      "subtype": "blood_pressure",
      "confidence": 0.96,
      "requires_manual_review": false
    }
  ]
}

// AVOID: Positional arrays (fragile on schema evolution)
{
  "entities": [
    ["e1", "vital_sign", "blood_pressure", 0.96, false]
  ]
}
```

4. **Visual Fallback Hook (Disabled by Default):**
```typescript
const PASS1_VISUAL_FALLBACK = process.env.PASS1_VISUAL_FALLBACK === 'true';

if (PASS1_MODE === 'ocr_only' && PASS1_VISUAL_FALLBACK) {
  // Check for low-confidence pages/regions
  const lowConfidenceRegions = detectLowConfidence(ocrResult, entities);

  if (lowConfidenceRegions.length > 0) {
    // Targeted vision call on specific regions only
    const visualEnrichment = await callVisionForRegions(
      base64Image,
      lowConfidenceRegions
    );
    entities = mergeVisualEnrichment(entities, visualEnrichment);
  }
}
```

### KPIs to Track

When OCR-only mode is enabled, monitor:

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Median latency** (upload → Pass 1 complete) | < 60 sec | > 120 sec |
| **P95 latency** (upload → Pass 1 complete) | < 90 sec | > 180 sec |
| **Cost per document** (input + output tokens) | < $0.10 | > $0.20 |
| **OCR-only success rate** (no fallback needed) | > 85% | < 70% |
| **Visual fallback trigger rate** | < 15% | > 30% |
| **Manual review rate** (low confidence entities) | < 20% | > 35% |
| **Entity recall** (detected / expected) | > 95% | < 85% |

### Rollout Checklist

**Phase 1: Add Seams (Now)**
- [ ] Add `PASS1_MODE` environment variable and code branch
- [ ] Implement OCR artifact persistence (already in Item #1)
- [ ] Add `schema_version` to entity output
- [ ] Create visual fallback hook (disabled by default)
- [ ] Document mode switching procedure

**Phase 2: Validate OCR-Only (Later - After Pass 2/3 Stable)**
- [ ] Flip `PASS1_MODE=ocr_only` in staging environment
- [ ] Test on 10-20 diverse medical documents
- [ ] Measure entity recall, precision, manual review rate
- [ ] Compare cost/latency vs dual mode
- [ ] Identify document types requiring visual fallback

**Phase 3: Production Rollout (Future)**
- [ ] Enable `PASS1_VISUAL_FALLBACK=true` for safety net
- [ ] Monitor KPIs daily for 1 week
- [ ] A/B test: 50% dual, 50% ocr_only
- [ ] Full rollout if KPIs meet targets
- [ ] Document visual fallback patterns

### Rollback Plan

**Simple Environment Variable Flip:**
```bash
# Instant rollback to dual mode
PASS1_MODE=dual
PASS1_VISUAL_FALLBACK=false

# Redeploy worker → Immediate return to current behavior
```

**Artifacts Remain Compatible:**
- OCR artifacts work for both modes
- Database schema unchanged
- No data migration needed

---

## Future Enhancements (Not Yet Prioritized)

### Page-by-Page Processing for Multi-Page Documents

**Problem:** Current single-call architecture hits 32K token limit on documents with 100+ entities (typically 8-10+ pages).

**Proposed Solution:** Process each page independently, merge results.

**Benefits:**
- Infinite scaling (100-page documents work same as 1-page)
- Predictable cost per page
- Better error handling (page-level retry)
- Parallelizable for speed

**Effort:** 4-6 hours (design + implementation + testing)

**Status:** Documented, scheduled for future sprint

---

### Compact Output Fallback

**Problem:** When AI hits token limit (`finish_reason: "length"`), all data is lost.

**Proposed Solution:** Retry with reduced schema on token limit detection.

**Implementation:**
```typescript
async callAIWithFallback(input: Pass1Input): Promise<Pass1AIResponse> {
  try {
    return await this.callAI(input, { compact: false });
  } catch (error) {
    if (error.finish_reason === 'length') {
      console.warn('[Pass1] Token limit hit, retrying with compact schema');
      return await this.callAI(input, { compact: true });
    }
    throw error;
  }
}
```

**Compact Schema Changes:**
- Limit free-text fields to 60 chars (vs 120)
- Limit arrays to 25 items max (vs 50)
- Remove verbose document_coverage details
- Simpler confidence metrics

**Effort:** 2-3 hours

**Status:** Documented for future implementation

---

## Appendix: Analysis History

### GPT-5 Review Context (2025-10-05)

Original GPT-5 review focused on:
- Edge Function scope (move OCR to worker)
- CORS headers (already implemented)
- Auth and security (JWT validation needed)
- Render worker configuration (already correct)
- Retry logic and backoff (not implemented)
- File size limits (appropriate for current architecture)
- Structured logging (partially implemented)
- Usage tracking RLS (already addressed)

### Low Entity Count Issue (2025-10-06)

Discovered Pass 1 only detecting 2 entities instead of 15+ from immunization lists. Root cause: AI treating lists as single entities. Fixed with explicit LIST HANDLING RULES in prompt:
- Treat each list item as separate entity
- Split multi-item lines (commas, slashes, "and")
- Only deduplicate exact duplicates

### Model Performance Evolution

**October 2025:** GPT-5 standard and GPT-5-mini both showed 15-30x slower performance than expected (12 tok/sec vs 100+ tok/sec benchmark). Investigation revealed oversized input context and lack of image optimization as root causes, not model limitations.

**Current State:** Deployed GPT-5-mini with 32K token output limit after architectural understanding improved. Model performs acceptably for background jobs. Further optimization (image downscaling, prompt compression) will improve performance across all models.

### Token Limit Evolution

- October 5: Started with 4,000 tokens (insufficient)
- October 6: Increased to 8,000 tokens (handled 1-2 pages)
- October 6: Increased to 16,000 tokens (handled 2-4 pages)
- October 9: Increased to 32,000 tokens (handles 1-5 pages)

Current 32K limit appropriate for most medical documents. Page-by-page processing will be required for exceptionally large files (10+ pages with 100+ entities).
