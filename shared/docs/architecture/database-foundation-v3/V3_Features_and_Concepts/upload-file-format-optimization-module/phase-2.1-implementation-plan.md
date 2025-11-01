# Phase 2.1 Implementation Plan - Store Processed Images

**Created:** November 1, 2025
**Status:** Ready for implementation
**Estimated Time:** 4 hours
**Priority:** CRITICAL - Blocks click-to-source feature

---

## Executive Summary

**Problem:** BBOX coordinates from OCR reference processed JPEG images that are currently discarded, making click-to-source feature impossible.

**Solution:** Store processed JPEG pages in Supabase Storage before OCR processing, using existing database columns and parallel folder structure.

**Impact:** Enables click-to-source feature (core product differentiator), prevents 4 cents/month storage cost from blocking $50k+ ARR feature.

---

## Critical Evaluation of AI Recommendations

### Opus 4.1 Recommendation Analysis

#### Recommendation 1: PNG Format - STRONGLY REJECT

**Their Claim:** Convert everything to PNG for lossless quality and best OCR results.

**Evidence Against:**
```
Production Reality (Phase 2 test results):
- JPEG at 85% quality: 96.63% OCR accuracy
- No compression artifacts observed
- Medical text extraction: Excellent

Cost Comparison (8-page PDF):
- JPEG: 1.6 MB total  → $0.0004/month storage
- PNG:  16 MB total   → $0.004/month storage
- Network: 10x transfer costs
- Google Vision: 10x input size costs

Annual impact (10,000 documents × 10 pages avg):
- JPEG: $4.80/year storage + reasonable vision costs
- PNG:  $48/year storage + 10x vision costs
= ~$400-500/year cost increase for ZERO accuracy gain
```

**Decision:** REJECT - JPEG working perfectly, PNG offers no benefit

---

#### Recommendation 2: New `document_pages` Table - REJECT (For Now)

**Their Claim:** Create normalized table for page-level relationality.

**Proposed Schema:**
```sql
CREATE TABLE document_pages (
    id UUID PRIMARY KEY,
    shell_file_id UUID REFERENCES shell_files(id),
    page_number INT,
    processed_image_path TEXT,
    width_px INT,
    height_px INT
);
```

**Counter-Analysis:**

**Existing Schema Already Solves This:**
```sql
-- shell_files table ALREADY HAS:
processed_image_path TEXT,        -- Can store folder path
processed_image_checksum TEXT,    -- Verification
processed_image_mime TEXT,        -- Content type
page_count INT,                   -- Number of pages

-- ocr_artifacts manifest.json ALREADY STORES:
{
  "pages": [
    {
      "page_number": 1,
      "artifact_path": "path/to/page-1.json",
      "width_px": 1600,
      "height_px": 2263,
      "bytes": 245678
    }
  ]
}
```

**Why New Table is Premature:**
1. **Path pattern works:** `{patient_id}/{shell_file_id}-processed/page-{n}.jpg`
2. **Dimensions in manifest:** OCR manifest already stores width/height per page
3. **No current query needs:** Not querying by individual pages yet
4. **Migration cost:** Would require backfilling all existing records
5. **Complexity:** Adds foreign key management, cascade deletes, RLS policies

**When to Reconsider:**
- If we need to query individual pages (not whole documents)
- If we add page-level metadata (annotations, redactions, etc.)
- If we implement page-level versioning or reprocessing

**Decision:** REJECT - Use existing columns + path patterns + manifest

---

#### Recommendation 3: Versioning System (v1, v2, v3) - REJECT (Premature)

**Their Claim:** Version processed images for reprocessing scenarios.

**Proposed Structure:**
```
{patient_id}/{shell_file_id}-processed/
  ├── v1/
  │   ├── page-1.jpg
  │   └── page-2.jpg
  └── v2/
      ├── page-1.jpg
      └── page-2.jpg
```

**Counter-Analysis:**

**Reprocessing Reality:**
1. **Frequency:** Rare (model upgrades, bug fixes)
2. **Strategy when needed:** Delete old → reprocess → replace
3. **Versioning complexity:**
   - Database schema needs version tracking
   - BBOX data tied to specific version
   - Cleanup logic for old versions
   - Storage costs multiply
4. **Current need:** Zero reprocessing scenarios yet

**Simple Alternative (When Needed):**
```typescript
// Reprocessing pseudocode:
async function reprocessDocument(shellFileId) {
  // Delete old processed images
  await supabase.storage.from('medical-docs')
    .remove([`${patientId}/${shellFileId}-processed/`]);

  // Delete old OCR artifacts
  await supabase.storage.from('medical-docs')
    .remove([`${patientId}/${shellFileId}-ocr/`]);

  // Reprocess from original
  await processDocument(shellFileId);
}
```

**Decision:** REJECT - Implement simple replacement, add versioning if needed later

---

#### Recommendation 4: Unified Hierarchy - ACCEPT (Modified)

**Their Claim:** Use clean unified structure instead of parallel folders.

**Original Unified Proposal:**
```
{patient_id}/{shell_file_id}/
  ├── original.pdf
  ├── processed/
  │   ├── page-1.jpg
  │   └── page-2.jpg
  └── ocr/
      ├── manifest.json
      └── page-1.json
```

**My Modified Approach (Parallel with Future Migration Path):**

**Phase 2.1 Implementation (Now):**
```
{patient_id}/
  ├── {timestamp}_{original_filename}      # Existing pattern
  ├── {shell_file_id}-processed/           # NEW: Parallel folder
  │   ├── page-1.jpg
  │   └── page-N.jpg
  └── {shell_file_id}-ocr/                 # Existing: OCR artifacts
      ├── manifest.json
      └── page-N.json
```

**Why Parallel Now, Not Unified:**
1. **Zero migration:** Works with existing `-ocr/` structure
2. **No breaking changes:** Existing code unchanged
3. **Simple path construction:** `${patientId}/${shellFileId}-processed/page-${n}.jpg`
4. **Consistent pattern:** Suffix-based folders (like `-ocr/`)
5. **Pre-launch flexibility:** Easy to change before users accumulate data

**Future Migration Path (Post-Launch, If Needed):**
- Can migrate to unified structure when convenient
- Simple storage move + path update in database
- Not urgent since system pre-launch (few documents)

**Decision:** ACCEPT modified - Parallel folders now, unified later if desired

---

#### Recommendation 5: Citations Table - REJECT (Premature)

**Their Claim:** Create citations table for click-to-source now.

**Counter-Analysis:**
- Click-to-source is a FUTURE feature (not implemented yet)
- BBOX data already persisted in OCR JSON artifacts
- Build citations table when implementing the feature
- Don't build database schema for features that don't exist

**Decision:** REJECT - Build when implementing click-to-source UI

---

### Summary of Evaluations

| Opus 4.1 Recommendation | Decision | Rationale |
|------------------------|----------|-----------|
| PNG format | ❌ REJECT | 10x cost, zero benefit (JPEG @ 96%+ accuracy) |
| document_pages table | ❌ REJECT | Path patterns + manifest sufficient |
| Versioning (v1, v2) | ❌ REJECT | Premature - simple replacement works |
| Unified hierarchy | ✅ ACCEPT (modified) | Parallel now, migrate later if desired |
| Citations table | ❌ REJECT | Feature doesn't exist yet |

---

## Final Architecture Decision

### Storage Structure: Parallel Folder Pattern

```
medical-docs/
└── {patient_id}/
    ├── {timestamp}_{original_filename}           # Original file (existing)
    ├── {shell_file_id}-processed/                # NEW: Processed images
    │   ├── page-1.jpg
    │   ├── page-2.jpg
    │   └── page-N.jpg
    └── {shell_file_id}-ocr/                      # Existing: OCR artifacts
        ├── manifest.json
        ├── page-1.json
        └── page-N.json
```

**Path Construction:**
- **Processed images:** `${patientId}/${shellFileId}-processed/page-${pageNumber}.jpg`
- **OCR artifacts:** `${patientId}/${shellFileId}-ocr/page-${pageNumber}.json`
- **OCR manifest:** `${patientId}/${shellFileId}-ocr/manifest.json`

**Benefits:**
- Zero migration required (works with existing structure)
- Consistent naming pattern (suffix-based folders)
- Clear separation of concerns (originals / processed / ocr)
- Simple path construction (template-based)
- RLS compatible (patient ID in path)

---

### Database Schema: Use Existing Columns

**shell_files table** (NO schema changes needed):
```sql
-- Columns already exist, currently NULL:
processed_image_path TEXT,        -- Store folder path pattern
processed_image_checksum TEXT,    -- SHA-256 of concatenated page hashes
processed_image_mime TEXT,        -- 'image/jpeg'

-- Update strategy:
UPDATE shell_files SET
  processed_image_path = '{patient_id}/{shell_file_id}-processed/',
  processed_image_checksum = '<SHA-256 of all page checksums>',
  processed_image_mime = 'image/jpeg'
WHERE id = <shell_file_id>;
```

**Why This Works:**
1. **No migration:** Columns already exist
2. **Backward compatible:** Existing NULL values = old records
3. **Forward compatible:** New records populated automatically
4. **Simple queries:** Single table lookup (no joins)

---

### OCR Manifest Enhancement

**Current manifest.json structure:**
```json
{
  "shell_file_id": "uuid",
  "provider": "google_vision",
  "version": "v1.2024.10",
  "page_count": 8,
  "pages": [
    {
      "page_number": 1,
      "artifact_path": "{patient_id}/{shell_file_id}-ocr/page-1.json",
      "bytes": 245678,
      "width_px": 1600,
      "height_px": 2263
    }
  ]
}
```

**Enhanced manifest.json (Phase 2.1):**
```json
{
  "shell_file_id": "uuid",
  "provider": "google_vision",
  "version": "v1.2024.11",
  "page_count": 8,
  "processed_images_path": "{patient_id}/{shell_file_id}-processed/",
  "pages": [
    {
      "page_number": 1,
      "artifact_path": "{patient_id}/{shell_file_id}-ocr/page-1.json",
      "processed_image_path": "{patient_id}/{shell_file_id}-processed/page-1.jpg",
      "processed_image_bytes": 198432,
      "processed_image_checksum": "sha256_hash",
      "bytes": 245678,
      "width_px": 1600,
      "height_px": 2263
    }
  ]
}
```

**New Fields:**
- `processed_images_path` (root): Folder path for all processed images
- `processed_image_path` (per page): Full path to specific page image
- `processed_image_bytes` (per page): File size in bytes
- `processed_image_checksum` (per page): SHA-256 hash for verification

---

## Implementation Steps

### Step 1: Create Image Storage Utility (30 min)

**File:** `apps/render-worker/src/utils/storage/store-processed-images.ts` (NEW)

```typescript
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import type { ProcessedPage } from '../format-processor/types';

interface StorageResult {
  path: string;
  checksum: string;
  bytes: number;
}

interface ProcessedImageMetadata {
  folderPath: string;
  pages: Array<{
    pageNumber: number;
    path: string;
    checksum: string;
    bytes: number;
  }>;
  combinedChecksum: string;
  totalBytes: number;
}

/**
 * Store processed JPEG pages in Supabase Storage before OCR
 *
 * Storage path: {patientId}/{shellFileId}-processed/page-{n}.jpg
 *
 * @param supabase - Supabase client with storage permissions
 * @param patientId - Patient UUID (for RLS path construction)
 * @param shellFileId - Shell file UUID
 * @param pages - Array of ProcessedPage objects from format processor
 * @returns Metadata for stored images (paths, checksums, sizes)
 */
export async function storeProcessedImages(
  supabase: ReturnType<typeof createClient>,
  patientId: string,
  shellFileId: string,
  pages: ProcessedPage[],
  correlationId?: string
): Promise<ProcessedImageMetadata> {
  const folderPath = `${patientId}/${shellFileId}-processed`;
  const storedPages: ProcessedImageMetadata['pages'] = [];
  const checksums: string[] = [];
  let totalBytes = 0;

  console.log(`[${correlationId}] Storing ${pages.length} processed images to ${folderPath}/`);

  for (const page of pages) {
    // Skip pages with errors (no base64 data)
    if (!page.base64) {
      console.warn(`[${correlationId}] Skipping page ${page.pageNumber} - no data`);
      continue;
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(page.base64, 'base64');
    const bytes = buffer.length;
    totalBytes += bytes;

    // Calculate SHA-256 checksum
    const checksum = createHash('sha256').update(buffer).digest('hex');
    checksums.push(checksum);

    // Storage path for this page
    const pagePath = `${folderPath}/page-${page.pageNumber}.jpg`;

    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from('medical-docs')
      .upload(pagePath, buffer, {
        contentType: 'image/jpeg',
        upsert: true, // Idempotent (reprocessing overwrites)
      });

    if (error) {
      console.error(`[${correlationId}] Failed to store page ${page.pageNumber}:`, error);
      throw new Error(
        `Failed to store processed image page ${page.pageNumber}: ${error.message}`
      );
    }

    storedPages.push({
      pageNumber: page.pageNumber,
      path: pagePath,
      checksum,
      bytes,
    });

    console.log(
      `[${correlationId}] Stored page ${page.pageNumber}: ${(bytes / 1024).toFixed(1)} KB (${pagePath})`
    );
  }

  // Combined checksum (hash of all page hashes concatenated)
  const combinedChecksum = createHash('sha256')
    .update(checksums.join(''))
    .digest('hex');

  console.log(
    `[${correlationId}] Stored ${storedPages.length} images, ` +
    `${(totalBytes / 1024 / 1024).toFixed(2)} MB total, ` +
    `checksum: ${combinedChecksum.slice(0, 8)}...`
  );

  return {
    folderPath,
    pages: storedPages,
    combinedChecksum,
    totalBytes,
  };
}
```

**Key Features:**
- SHA-256 checksums for verification
- Idempotent uploads (upsert: true)
- Handles pages with errors (skips null base64)
- Detailed logging with correlation IDs
- Returns metadata for database updates

---

### Step 2: Update Format Processor Types (10 min)

**File:** `apps/render-worker/src/utils/format-processor/types.ts`

**Add error tracking to ProcessedPage:**
```typescript
export interface ProcessedPage {
  pageNumber: number;
  base64: string | null;  // Allow null for failed pages
  mime: string;
  width: number;
  height: number;
  originalFormat: string;
  error?: {               // NEW: Optional error tracking
    message: string;
    code: string;
    details?: any;
  };
}
```

**Add error summary to PreprocessResult:**
```typescript
export interface PreprocessResult {
  pages: ProcessedPage[];
  totalPages: number;
  processingTimeMs: number;
  originalFormat: string;
  conversionApplied: boolean;
  pageErrors?: Array<{   // NEW: Summary of page errors
    pageNumber: number;
    error: string;
  }>;
  successfulPages: number; // NEW: Count of successful pages
}
```

---

### Step 3: Add EXIF Auto-Rotation to Format Processor (15 min)

**File:** `apps/render-worker/src/utils/format-processor/index.ts`

**Update Sharp pipelines in three locations:**

**Location 1: Pass-through images (JPEG/PNG) - Line ~75:**
```typescript
// Process through Sharp for optimization
const pipeline = sharp(buffer)
  .rotate()  // NEW: Auto-rotate using EXIF orientation
  .resize(config?.maxWidth || 1600, null, {
    fit: 'inside',
    withoutEnlargement: true,
  })
  .jpeg({ quality: config?.jpegQuality || 85 });
```

**Location 2: HEIC conversion - Line ~120:**
```typescript
// Convert to JPEG and optimize
const jpegMeta = await sharp(jpegBuffer)
  .rotate()  // NEW: Auto-rotate (though HEIC rarely has EXIF rotation)
  .metadata();
```

**Location 3: PDF processor - Line ~116 in pdf-processor.ts:**
```typescript
const optimizedBuffer = await sharp(inputBuffer)
  .rotate()  // NEW: Auto-rotate (PDFs rarely have EXIF, but safe)
  .resize(maxWidth, null, {
    fit: 'inside',
    withoutEnlargement: true,
  })
  .jpeg({ quality })
  .toBuffer();
```

**Impact:** Rotated iPhone photos (portrait/landscape) will auto-correct before OCR

---

### Step 4: Extract HEIC Dimensions (10 min)

**File:** `apps/render-worker/src/utils/format-processor/index.ts`

**Update HEIC conversion block (lines 87-144):**

```typescript
if (mimeType === 'image/heic' || mimeType === 'image/heif') {
  const startTime = Date.now();
  console.log(`[${correlationId}] Converting HEIC/HEIF to JPEG...`);

  const heicBuffer = Buffer.from(base64Data, 'base64');

  // Convert HEIC → JPEG
  const jpegArrayBuffer = await convert({
    buffer: new Uint8Array(heicBuffer) as unknown as ArrayBufferLike,
    format: 'JPEG',
    quality: config?.jpegQuality || 0.85,
  });

  const jpegBuffer = Buffer.from(jpegArrayBuffer);

  // NEW: Extract dimensions from converted JPEG
  const jpegMeta = await sharp(jpegBuffer).metadata();

  const processingTimeMs = Date.now() - startTime;

  console.log(
    `[${correlationId}] HEIC converted: ` +
    `${(jpegBuffer.length / 1024).toFixed(1)} KB JPEG, ` +
    `${jpegMeta.width}×${jpegMeta.height}px, ` +  // NEW: Real dimensions
    `${processingTimeMs}ms`
  );

  return {
    pages: [
      {
        pageNumber: 1,
        base64: jpegBuffer.toString('base64'),
        mime: 'image/jpeg',
        width: jpegMeta.width || 0,   // NEW: Real width
        height: jpegMeta.height || 0, // NEW: Real height
        originalFormat: mimeType,
      },
    ],
    totalPages: 1,
    processingTimeMs,
    originalFormat: mimeType,
    conversionApplied: true,
  };
}
```

**Before:** `width: 0, height: 0` (unknown)
**After:** `width: 3024, height: 4032` (real dimensions from metadata)

---

### Step 5: Update OCR Persistence to Include Image Paths (30 min)

**File:** `apps/render-worker/src/utils/ocr-persistence.ts`

**Update OCRManifest interface:**
```typescript
interface OCRManifest {
  shell_file_id: string;
  provider: string;
  version: string;
  page_count: number;
  processed_images_path?: string; // NEW: Folder path for images
  pages: Array<{
    page_number: number;
    artifact_path: string;
    processed_image_path?: string;     // NEW: Path to processed image
    processed_image_bytes?: number;    // NEW: Image file size
    processed_image_checksum?: string; // NEW: Image SHA-256
    bytes: number;
    width_px: number;
    height_px: number;
  }>;
}
```

**Update persistOCRArtifacts function signature:**
```typescript
export async function persistOCRArtifacts(
  supabase: ReturnType<typeof createClient>,
  shellFileId: string,
  ocrResult: OCRResult,
  processedImageMetadata?: ProcessedImageMetadata, // NEW: Optional image metadata
  correlationId?: string
): Promise<void>
```

**Update manifest creation (inside persistOCRArtifacts):**
```typescript
// Create manifest
const manifest: OCRManifest = {
  shell_file_id: shellFileId,
  provider: 'google_vision',
  version: 'v1.2024.11', // Bumped version for new fields
  page_count: ocrResult.pages.length,
  processed_images_path: processedImageMetadata?.folderPath, // NEW
  pages: ocrResult.pages.map((page, index) => {
    const imageMeta = processedImageMetadata?.pages.find(
      p => p.pageNumber === page.page_number
    );

    return {
      page_number: page.page_number,
      artifact_path: `${basePath}/page-${page.page_number}.json`,
      processed_image_path: imageMeta?.path,           // NEW
      processed_image_bytes: imageMeta?.bytes,         // NEW
      processed_image_checksum: imageMeta?.checksum,   // NEW
      bytes: Buffer.byteLength(JSON.stringify(page)),
      width_px: page.width_px,
      height_px: page.height_px,
    };
  }),
};
```

---

### Step 6: Update Pass1 Worker to Store Images (45 min)

**File:** `apps/render-worker/src/pass1/index.ts`

**Import new utility:**
```typescript
import { storeProcessedImages } from '../utils/storage/store-processed-images';
```

**Update processing flow (around line 200-250):**
```typescript
// 1. Format processor (existing)
const preprocessResult = await processFormat(
  supabase,
  shellFile.storage_path,
  shellFile.mime_type,
  correlationId
);

// 2. NEW: Store processed images BEFORE OCR
const imageMetadata = await storeProcessedImages(
  supabase,
  shellFile.patient_id,
  shellFile.id,
  preprocessResult.pages,
  correlationId
);

console.log(
  `[${correlationId}] Stored ${imageMetadata.pages.length} processed images ` +
  `(${(imageMetadata.totalBytes / 1024 / 1024).toFixed(2)} MB)`
);

// 3. OCR processing (existing)
const ocrResult = await googleVisionOCR(
  preprocessResult.pages,
  correlationId
);

// 4. Persist OCR artifacts WITH image references (updated)
await persistOCRArtifacts(
  supabase,
  shellFile.id,
  ocrResult,
  imageMetadata, // NEW: Pass image metadata
  correlationId
);

// 5. NEW: Update shell_files record with processed image path
await supabase
  .from('shell_files')
  .update({
    processed_image_path: imageMetadata.folderPath,
    processed_image_checksum: imageMetadata.combinedChecksum,
    processed_image_mime: 'image/jpeg',
  })
  .eq('id', shellFile.id);

console.log(
  `[${correlationId}] Updated shell_files record with processed image metadata`
);
```

**Error Handling:**
```typescript
try {
  const imageMetadata = await storeProcessedImages(...);
} catch (error) {
  console.error(`[${correlationId}] Failed to store processed images:`, error);

  // Decision: Fail the job (images are CRITICAL for click-to-source)
  throw new Error(
    `Failed to store processed images: ${error.message}. ` +
    `Click-to-source feature requires processed images.`
  );
}
```

---

### Step 7: Add Page-Level Error Handling (1 hour)

**File:** `apps/render-worker/src/utils/format-processor/pdf-processor.ts`

**Update page extraction loop:**
```typescript
export async function extractPdfPages(
  base64Pdf: string,
  maxWidth = 1600,
  quality = 85,
  correlationId?: string
): Promise<ProcessedPage[]> {
  // ... existing setup ...

  const pages: ProcessedPage[] = [];
  const pageErrors: Array<{ pageNumber: number; error: string }> = [];

  for (let i = 0; i < totalPages; i++) {
    const pageNumber = i + 1;

    try {
      // Existing page processing logic
      const inputBuffer = fs.readFileSync(path.join(pngOutputDir, filename));
      const optimizedBuffer = await sharp(inputBuffer)
        .rotate()
        .resize(maxWidth, null, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();

      const metadata = await sharp(optimizedBuffer).metadata();

      pages.push({
        pageNumber,
        base64: optimizedBuffer.toString('base64'),
        mime: 'image/jpeg',
        width: metadata.width || 0,
        height: metadata.height || 0,
        originalFormat: 'application/pdf',
      });

      console.log(
        `[${correlationId}] Page ${pageNumber}/${totalPages}: ` +
        `${(optimizedBuffer.length / 1024).toFixed(1)} KB, ` +
        `${metadata.width}×${metadata.height}px`
      );

    } catch (error) {
      console.error(`[${correlationId}] Page ${pageNumber} failed:`, error);

      // Add error page (null base64)
      pages.push({
        pageNumber,
        base64: null,
        mime: 'image/jpeg',
        width: 0,
        height: 0,
        originalFormat: 'application/pdf',
        error: {
          message: error.message,
          code: 'PAGE_PROCESSING_FAILED',
          details: error,
        },
      });

      pageErrors.push({
        pageNumber,
        error: error.message,
      });
    }
  }

  // Fail if ALL pages failed
  const successfulPages = pages.filter(p => p.base64).length;
  if (successfulPages === 0) {
    throw new Error(
      `All ${totalPages} pages failed to process. ` +
      `First error: ${pageErrors[0]?.error || 'Unknown'}`
    );
  }

  // Log partial success
  if (pageErrors.length > 0) {
    console.warn(
      `[${correlationId}] Partial success: ${successfulPages}/${totalPages} pages processed. ` +
      `Failed pages: ${pageErrors.map(e => e.pageNumber).join(', ')}`
    );
  }

  return pages;
}
```

**Impact:**
- 100-page PDF with 1 corrupted page → Process 99 pages successfully
- Clear error tracking for debugging
- Graceful degradation instead of total failure

---

### Step 8: Update TIFF Processor (Similar Pattern) (20 min)

**File:** `apps/render-worker/src/utils/format-processor/tiff-processor.ts`

Apply same error handling pattern as PDF processor (Step 7).

---

### Step 9: Testing Plan (30 min)

#### Local Testing

**Test Case 1: Multi-Page PDF**
```bash
# Use existing test file
Test file: sample-medical-records/patient-002-jack-smith/Sample Patient ED Note pdf.pdf
Expected: 8 processed images stored in -processed/ folder
Verify: shell_files.processed_image_path updated
Verify: manifest.json includes processed_image_path per page
```

**Test Case 2: HEIC iPhone Photo**
```bash
Test file: sample-medical-records/patient-001-xavier-flanagan/Xavier_medication_box_IMG_6161.heic
Expected: 1 processed image stored with real dimensions
Verify: width/height not 0
Verify: Auto-rotation applied if EXIF present
```

**Test Case 3: Multi-Page TIFF**
```bash
Test file: sample-medical-records/patient-002-jack-smith/JACK 1 TIFF TEST FILE Consult.tiff
Expected: 2 processed images stored
Verify: Both pages in -processed/ folder
```

#### Verification Checklist

**Supabase Storage:**
```sql
-- Check folder structure in storage
-- Should see: {patient_id}/{shell_file_id}-processed/page-*.jpg
```

**Database:**
```sql
-- Check shell_files updated
SELECT
  id,
  filename,
  page_count,
  processed_image_path,
  processed_image_checksum,
  processed_image_mime
FROM shell_files
WHERE processed_image_path IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
```

**OCR Manifest:**
```typescript
// Download manifest.json from storage
// Verify includes:
{
  "processed_images_path": "{patient_id}/{shell_file_id}-processed/",
  "pages": [
    {
      "processed_image_path": "...",
      "processed_image_checksum": "...",
      "processed_image_bytes": 198432
    }
  ]
}
```

**Logs:**
```bash
# Check Render.com logs for:
✓ "Storing 8 processed images to {path}/"
✓ "Stored page 1: 245.3 KB ({path})"
✓ "Stored 8 images, 1.92 MB total, checksum: abc123..."
✓ "Updated shell_files record with processed image metadata"
```

---

### Step 10: Deployment (15 min)

**Pre-Deployment Checklist:**
- ✅ All code changes committed
- ✅ Local testing passed
- ✅ TypeScript compilation successful
- ✅ No lint errors

**Deployment Commands:**
```bash
# From monorepo root
cd /Users/xflanagan/Documents/GitHub/Guardian-Cursor

# Build worker to verify TypeScript
pnpm --filter exora-v3-worker run build

# Commit changes
git add .
git commit -m "feat: Phase 2.1 - Store processed JPEG pages for click-to-source

- Add storeProcessedImages() utility for Supabase Storage
- Update format processor with EXIF auto-rotation
- Extract HEIC dimensions with Sharp metadata
- Add pageErrors[] field for graceful degradation
- Update OCR manifest to include processed image references
- Update shell_files records with processed_image_path

Enables click-to-source feature by storing JPEG pages sent to OCR.
BBOX coordinates now reference actual stored images."

git push origin main
```

**Post-Deployment Verification:**
1. Watch Render.com deployment logs
2. Wait for deployment to complete
3. Upload test document via web UI
4. Check logs for image storage confirmation
5. Verify Supabase Storage has `-processed/` folder
6. Verify database record updated

---

## Migration Strategy

### Existing Records (All have NULL processed_image_path)

**Approach:** Lazy Migration (On-Demand Reprocessing)

**Trigger:** When user clicks "View Source" for old document without processed images

**Process:**
1. Frontend detects `processed_image_path` is NULL
2. Show "Processing..." indicator
3. Backend reprocesses document:
   - Download original from storage
   - Run through format processor
   - Store processed images
   - Update database record
4. Display click-to-source UI

**Cost Analysis:**
- Only reprocess documents actually accessed (likely <10% of corpus)
- Average cost: $0.0006/page × 10 pages = $0.006 per document
- If 100 documents accessed: $0.60 total migration cost

**Alternative (Batch Migration - Not Recommended):**
- Reprocess all documents immediately
- Cost: $0.006 × 1000 documents = $6
- Unnecessary since many documents never accessed

**Decision:** Lazy migration (reprocess on-demand)

---

## Cost Analysis

### Storage Costs (Supabase)

**Per Document:**
```
8-page PDF:
- Original: 80 KB
- Processed JPEGs: 8 × 200 KB = 1.6 MB
- OCR JSON: 8 × 10 KB = 80 KB
- Total: 1.76 MB per document

100-page PDF:
- Original: 5 MB
- Processed JPEGs: 100 × 200 KB = 20 MB
- OCR JSON: 100 × 10 KB = 1 MB
- Total: 26 MB per document
```

**Monthly Costs:**
```
1000 documents/month (avg 10 pages):
- Total storage: ~2 GB
- Cost: 2 GB × $0.023/GB = $0.046/month (~5 cents)

Annual: $0.55/year
```

### Network Transfer Costs

**Negligible** - Images stored/retrieved within Supabase (no egress)

### Click-to-Source Business Value

**Conservative Estimate:**
- Feature enables regulatory compliance
- Differentiates from competitors
- $50,000+ ARR impact (clinical trial sponsors)

**ROI:**
```
Annual storage cost: $0.55
Feature value: $50,000+
ROI: 90,909x

Decision: Storage cost is rounding error compared to feature value
```

---

## Success Criteria

### Phase 2.1 Success Metrics:

✅ **Processed images stored:**
- All new uploads have `processed_image_path` populated
- Images accessible in Supabase Storage

✅ **EXIF auto-rotation:**
- Rotated iPhone photos display correctly
- No sideways/upside-down images

✅ **HEIC dimensions:**
- All HEIC files return real width/height (not 0)

✅ **Page-level errors:**
- 100-page PDF with 1 bad page processes 99 pages
- Clear error tracking in logs

✅ **OCR manifest complete:**
- Includes `processed_image_path` per page
- Includes checksums and file sizes

✅ **Database updated:**
- `shell_files.processed_image_path` populated
- Combined checksum stored

---

## Risks and Mitigations

### Risk 1: Storage Upload Failures

**Scenario:** Supabase Storage upload fails mid-document

**Impact:** Document partially processed, OCR references non-existent images

**Mitigation:**
- Fail entire job if storage upload fails
- Don't proceed to OCR without stored images
- Clear error message: "Failed to store processed images"

**Code:**
```typescript
try {
  const imageMetadata = await storeProcessedImages(...);
} catch (error) {
  // FAIL LOUDLY - don't proceed without images
  throw new Error(`CRITICAL: Failed to store processed images: ${error.message}`);
}
```

---

### Risk 2: Checksum Mismatches

**Scenario:** Image corrupted during storage/retrieval

**Impact:** Click-to-source displays wrong image

**Mitigation:**
- Store SHA-256 checksums per page
- Verify checksum when retrieving for click-to-source
- Alert if mismatch detected

---

### Risk 3: Large Document Timeout

**Scenario:** 200-page PDF takes too long to store images

**Impact:** Job timeout before completion

**Mitigation:**
- Current timeout: 10 minutes
- Image storage time: ~0.5s per page
- 200 pages = ~100s storage time (well under timeout)
- Monitor storage times, increase timeout if needed

---

### Risk 4: Disk Space on Render.com

**Scenario:** Temp files fill disk during processing

**Impact:** Storage failures

**Mitigation:**
- Cleanup temp files in finally blocks (already implemented)
- Monitor disk usage metrics
- Scale up disk if needed (currently 512MB, can increase)

---

## Rollback Plan

### If Critical Issues After Deployment:

**Option 1: Disable Image Storage (Quick Fix)**
```typescript
// In pass1/index.ts, comment out storage call:
// const imageMetadata = await storeProcessedImages(...);
const imageMetadata = undefined; // Temporary rollback

// OCR will still work, just no click-to-source
```

**Option 2: Revert Deployment**
```bash
# In Render.com dashboard:
# Redeploy previous working commit

git log --oneline  # Find previous working commit
# Use Render.com UI to redeploy specific commit
```

**Impact of Rollback:**
- Click-to-source feature disabled
- OCR and AI processing continue working
- No data loss (original files + OCR artifacts preserved)

---

## Future Enhancements (Post Phase 2.1)

### Enhancement 1: Click-to-Source UI Implementation
**When:** After Phase 2.1 deployed and stable
**Work:**
- Frontend component to display image + BBOX overlay
- Highlight matching text regions
- Zoom/pan functionality

### Enhancement 2: Image Optimization
**When:** If storage costs become concern
**Options:**
- WebP format (smaller than JPEG, similar quality)
- Progressive JPEG (faster loading)
- Lazy loading for large documents

### Enhancement 3: Unified Hierarchy Migration
**When:** Post-launch when convenient
**Work:**
- Migrate from parallel folders to nested structure
- Path updates in database
- Storage folder reorganization

---

## Documentation Updates Required

**After Phase 2.1 Implementation:**

1. **Update phase-2-pdf.md:**
   - Document processed image storage
   - Update storage cost analysis
   - Add click-to-source preparation notes

2. **Update phase-3-heic.md:**
   - Document dimensions extraction fix
   - Update EXIF auto-rotation addition

3. **Update IMPLEMENTATION_ROADMAP.md:**
   - Mark Phase 2.1 complete
   - Update success metrics

4. **Create click-to-source-implementation-plan.md:**
   - Future feature implementation guide
   - UI component specifications
   - BBOX overlay rendering

---

## Timeline Summary

**Total Time:** 4 hours

| Step | Task | Time |
|------|------|------|
| 1 | Create image storage utility | 30 min |
| 2 | Update types (error handling) | 10 min |
| 3 | Add EXIF auto-rotation | 15 min |
| 4 | Extract HEIC dimensions | 10 min |
| 5 | Update OCR persistence | 30 min |
| 6 | Update Pass1 worker | 45 min |
| 7 | Add page-level error handling | 1 hour |
| 8 | Update TIFF processor | 20 min |
| 9 | Testing | 30 min |
| 10 | Deployment | 15 min |

**Ready to begin implementation on user approval.**

---

**Last Updated:** November 1, 2025
**Status:** Awaiting approval to proceed
**Next Step:** Begin Step 1 (Create image storage utility)
