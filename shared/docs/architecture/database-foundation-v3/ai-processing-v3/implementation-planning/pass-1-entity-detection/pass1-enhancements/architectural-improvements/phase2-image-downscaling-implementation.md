# Phase 2: Image Downscaling Optimization Implementation

**Created:** 2025-10-10  
**Status:** READY FOR IMPLEMENTATION  
**Scope:** Phase 2 only - core downscaling optimization with future format hooks  
**Priority:** CRITICAL  
**Objective:** Move image downscaling before OCR processing for 40-60% speed improvement, prepare architecture for future format conversion (Phase 3+)

## Problem Statement

Current implementation downscales images AFTER OCR, missing key optimizations:
- OCR processes full-resolution images (slower, more expensive)
- Separate downscaling for AI means no image reuse for Pass 2
- Google Cloud Vision charges by pixel count (unnecessary cost)

## Optimal Strategy

**Current Flow:**
```
Download → OCR (full res) → AI (downscaled separately)
```

**Target Flow:**
```
Download → Downscale → OCR (1600px) → AI (same 1600px) → Store for Pass 2
```

## Expected Benefits

- **OCR Speed:** 40-60% faster processing (fewer pixels)
- **OCR Cost:** 50-70% reduction (Google Vision pixel-based pricing)
- **Pass 2 Efficiency:** Reuse same downscaled image
- **Quality:** Minimal impact (medical text readable at 1600px)

## Implementation Steps

### Step 1: Enhanced Downscaling Utility
**File:** `apps/render-worker/src/utils/image-processing.ts`

Add format-preserving downscaler with comprehensive format support:
```typescript
import sharp from 'sharp';

export async function downscaleImageBase64(
  b64: string, 
  mime: string, 
  maxWidth = 1600, 
  quality = 78
): Promise<{ b64: string; width: number; height: number; outMime: string }> {
  // PDF handling - skip downscaling, let OCR handle directly
  if (mime === 'application/pdf') {
    console.log('[ImageProcessing] PDF detected - skipping downscaling (OCR handles directly)');
    return { b64, width: 0, height: 0, outMime: mime };
  }

  // DICOM not supported for OCR
  if (mime === 'application/dicom') {
    throw new Error('DICOM files not supported for OCR processing');
  }

  const buf = Buffer.from(b64, 'base64');
  const img = sharp(buf, { failOn: 'none' }).rotate(); // Respect EXIF
  const meta = await img.metadata();

  // Guard against missing dimensions
  if (!meta.width || !meta.height) {
    console.warn(`[ImageProcessing] Missing dimensions for ${mime}, skipping downscaling`);
    return { b64, width: 0, height: 0, outMime: mime };
  }

  // Skip if not larger than target
  if (meta.width <= maxWidth) {
    console.log(`[ImageProcessing] Image ${meta.width}px <= ${maxWidth}px target, skipping downscaling`);
    return { b64, width: meta.width, height: meta.height, outMime: mime };
  }

  // Format-specific processing
  try {
    if (mime === 'image/jpeg') {
      const out = await img.resize({ width: maxWidth, withoutEnlargement: true, kernel: 'lanczos3' })
        .jpeg({ quality, chromaSubsampling: '4:4:4', mozjpeg: true })
        .toBuffer();
      const outMeta = await sharp(out).metadata();
      return { b64: out.toString('base64'), width: outMeta.width || 0, height: outMeta.height || 0, outMime: 'image/jpeg' };
    }

    if (mime === 'image/png') {
      const out = await img.resize({ width: maxWidth, withoutEnlargement: true, kernel: 'lanczos3' })
        .png({ compressionLevel: 9, palette: true })
        .toBuffer();
      const outMeta = await sharp(out).metadata();
      return { b64: out.toString('base64'), width: outMeta.width || 0, height: outMeta.height || 0, outMime: 'image/png' };
    }

    // WebP support (lossless for medical documents)
    if (mime === 'image/webp') {
      const out = await img.resize({ width: maxWidth, withoutEnlargement: true, kernel: 'lanczos3' })
        .webp({ lossless: true })
        .toBuffer();
      const outMeta = await sharp(out).metadata();
      return { b64: out.toString('base64'), width: outMeta.width || 0, height: outMeta.height || 0, outMime: 'image/webp' };
    }

    // TIFF: Skip downscaling for multi-page support (Google Vision handles natively)
    if (mime === 'image/tiff') {
      console.log('[ImageProcessing] TIFF detected - skipping downscaling (multi-page support)');
      return { b64, width: meta.width, height: meta.height, outMime: mime };
    }

    // HEIC: Not supported by Google Cloud Vision (Phase 3+ will add conversion)
    if (mime === 'image/heic' || mime === 'image/heif') {
      throw new Error('HEIC/HEIF files not yet supported. Format conversion planned for Phase 3 (post-Phase 2). Timeline: 2-3 weeks after Phase 2 completion.');
    }
    
    // Office documents: Future text extraction support
    if (mime.startsWith('application/vnd.openxmlformats') || 
        mime === 'application/msword' || 
        mime === 'application/vnd.ms-excel') {
      throw new Error('Office document processing planned for Phase 4. Timeline: 4-6 weeks after Phase 2 completion.');
    }
    
    // Archive formats: Future bulk processing support
    if (mime === 'application/zip' || mime === 'application/x-rar-compressed') {
      throw new Error('Archive processing planned for Phase 5. Timeline: 8-10 weeks after Phase 2 completion.');
    }

    // Unknown format: skip processing
    console.warn(`[ImageProcessing] Unknown format ${mime}, skipping downscaling`);
    return { b64, width: meta.width, height: meta.height, outMime: mime };

  } catch (error) {
    console.error(`[ImageProcessing] Error processing ${mime}:`, error);
    // Fallback to original
    return { b64, width: meta.width || 0, height: meta.height || 0, outMime: mime };
  }
}
```

**File:** `apps/render-worker/src/worker.ts` (lines ~440-450)

Add import and processing logic with checksum caching:
```typescript
import { downscaleImageBase64 } from '../utils/image-processing';

// Phase 2: Image downscaling before OCR
// Check for emergency bypass (future format conversion integration point)
const BYPASS_DOWNSCALING = process.env.BYPASS_IMAGE_DOWNSCALING === 'true';

let processed = { b64: fileBuffer.toString('base64'), width: 0, height: 0, outMime: payload.mime_type };
const isImageOrPDF = /^(image\/|application\/pdf)/.test(payload.mime_type);

if (isImageOrPDF && !BYPASS_DOWNSCALING) {
  console.log('[Worker] Phase 2: Processing image/PDF before OCR...');
  
  try {
    processed = await downscaleImageBase64(processed.b64, payload.mime_type, 1600, 78);
  } catch (error: any) {
    // Handle unsupported formats gracefully
    if (error.message.includes('not yet supported') || error.message.includes('planned for Phase')) {
      console.log(`[Worker] ${error.message}`);
      // Continue with original file for now
      processed = { b64: fileBuffer.toString('base64'), width: 0, height: 0, outMime: payload.mime_type };
    } else {
      throw error; // Re-throw unexpected errors
    }
  }
  
  if (processed.width && processed.height) {
    console.log(`[Worker] Processed to ${processed.width}x${processed.height} (${processed.outMime})`);
    } else {
    console.log(`[Worker] Processed ${processed.outMime} (dimensions handled by OCR)`);
  }
} else if (BYPASS_DOWNSCALING) {
  console.log('[Worker] Image downscaling bypassed via BYPASS_IMAGE_DOWNSCALING flag');
} else {
  console.log(`[Worker] Non-image file (${payload.mime_type}), skipping downscaling`);
}

const ocrSpatialData = await processWithGoogleVisionOCR(processed.b64, processed.outMime);
```

### Step 2: Store Processed Image with Caching
**File:** `apps/render-worker/src/worker.ts`

Add checksum-based caching to avoid redundant uploads:
```typescript
// Store processed image with checksum caching
if (isImageOrPDF && processed.width && processed.height) {
  const processedBuf = Buffer.from(processed.b64, 'base64');
  const processedChecksum = await calculateSHA256(processedBuf);
  
  // Check if already processed (avoid redundant uploads)
  const { data: sf } = await this.supabase
    .from('shell_files')
    .select('processed_image_checksum')
    .eq('id', payload.shell_file_id)
    .single();
  
  if (sf?.processed_image_checksum !== processedChecksum) {
    // Upload new processed image
    const ext = processed.outMime === 'image/png' ? '.png' : 
                 processed.outMime === 'image/webp' ? '.webp' : '.jpg';
    const processedPath = `${payload.patient_id}/${payload.shell_file_id}-processed${ext}`;
    
    await this.supabase.storage
      .from('medical-docs')
      .upload(processedPath, processedBuf, {
        contentType: processed.outMime,
        upsert: true
      });
    
    // Update metadata
    await this.supabase
      .from('shell_files')
      .update({
        processed_image_path: processedPath,
        processed_image_checksum: processedChecksum,
        processed_image_mime: processed.outMime
      })
      .eq('id', payload.shell_file_id);
    
    console.log(`[Worker] Stored ${processed.outMime} image: ${processedPath}`);
  } else {
    console.log(`[Worker] Processed image unchanged (checksum match), skipping upload`);
  }
}
```

### Step 3: Update Pass1EntityDetector
**File:** `apps/render-worker/src/pass1/Pass1EntityDetector.ts`

Remove existing downscaling (lines 257-279):
```typescript
// REMOVE THIS SECTION - downscaling now happens in worker
// console.log(`[Pass1] Downscaling image before AI processing...`);
// optimizedImageData = await downscaleImage(input.raw_file.file_data, 1600, 75);
```

Use image as-is (already downscaled):
```typescript
// Image already downscaled in worker - use directly
const optimizedImageData = input.raw_file.file_data;
console.log(`[Pass1] Using pre-downscaled image for AI processing`);
```

### Step 4: Fix Hardcoded Bbox Normalization
**File:** `apps/render-worker/src/worker.ts` (lines 450-475)

**Critical Fix:** Replace hardcoded 1000px normalization with dimension guards:
```typescript
// Guard against division by zero for missing dimensions
const pageWidth = processed.width || 1000;  // Fallback for PDFs
const pageHeight = processed.height || 1000; // Fallback for PDFs

if (processed.width === 0 && processed.height === 0) {
  console.warn('[Worker] Missing image dimensions, using fallback 1000x1000 for normalization');
}

ocrResult = {
  pages: [{
    page_number: 1,
    size: { width_px: pageWidth, height_px: pageHeight },
    lines: ocrSpatialData.spatial_mapping.map((item, idx) => ({
      text: item.text,
      bbox: {
        x: item.bounding_box.x,
        y: item.bounding_box.y,
        w: item.bounding_box.width,
        h: item.bounding_box.height
      },
      bbox_norm: {
        x: item.bounding_box.x / pageWidth,
        y: item.bounding_box.y / pageHeight,
        w: item.bounding_box.width / pageWidth,
        h: item.bounding_box.height / pageHeight
      },
      confidence: item.confidence,
      reading_order: idx
    })),
    tables: [],
    provider: ocrSpatialData.ocr_provider,
    processing_time_ms: ocrSpatialData.processing_time_ms
  }]
};
```

### Step 5: Update OCR Manifest with Dimensions
**File:** `apps/render-worker/src/utils/ocr-persistence.ts`

Store actual dimensions in OCR manifest for consistency:
```typescript
// In persistOCRArtifacts function
const manifest = {
  shell_file_id: shellFileId,
  provider: 'google_vision',
  version: 'v1.2024.10',
  page_count: ocrResult.pages.length,
  total_bytes: pageArtifacts.reduce((sum: number, p: any) => sum + p.bytes, 0),
  checksum: await calculateSHA256(Buffer.from(JSON.stringify(ocrResult))),
  // Store processed dimensions for future normalization
  processed_width_px: processedWidth,   // Add parameter
  processed_height_px: processedHeight, // Add parameter
  pages: pageArtifacts,
  created_at: new Date().toISOString()
};
```

### Step 6: Database Schema Update
```sql
ALTER TABLE shell_files 
  ADD COLUMN IF NOT EXISTS processed_image_path TEXT,
  ADD COLUMN IF NOT EXISTS processed_image_checksum TEXT,
  ADD COLUMN IF NOT EXISTS processed_image_mime TEXT;

COMMENT ON COLUMN shell_files.processed_image_path IS 'Path to downscaled image for Pass 2+ reuse';
COMMENT ON COLUMN shell_files.processed_image_checksum IS 'SHA256 checksum for cache validation';
COMMENT ON COLUMN shell_files.processed_image_mime IS 'MIME type of processed image';
```

### Step 7: Sharp Dependency Verification
**File:** `apps/render-worker/package.json`

**Critical:** Sharp is already in the project dependencies. Verify version compatibility:
```bash
# Check current Sharp version in render-worker
cd apps/render-worker
npm list sharp
# Should show sharp@^0.34.x (already installed)
```

**Render.com Deployment Checklist:**
- [ ] Verify Sharp works in current Render.com environment
- [ ] Test image processing with existing Sharp installation  
- [ ] Confirm NODE_ENV=production doesn't break Sharp binaries
- [ ] Monitor worker logs for Sharp-related errors during deployment

**No Package.json Changes Needed** - Sharp already exists in the worker dependencies.

### Step 8: Environment Variables
Add to Render.com worker environment:
```bash
# Emergency bypass for rollback scenarios
BYPASS_IMAGE_DOWNSCALING=false  # Default: downscaling enabled

# Optional: Adjust downscaling parameters
DOWNSCALE_MAX_WIDTH=1600
DOWNSCALE_QUALITY=78
```

## Comprehensive Format Support

| Format | Support | Strategy | Notes |
|--------|---------|----------|--------|
| **JPEG** | ✅ Optimize | Resize + recompress (quality 78, chroma 4:4:4) | Best for photos |
| **PNG** | ✅ Preserve | Lossless resize only | Critical for text clarity |
| **WebP** | ✅ Preserve | Lossless resize only | Modern format support |
| **TIFF** | ✅ Skip | Pass-through (multi-page) | Google Vision handles natively |
| **PDF** | ✅ Skip | Pass-through | Google Vision Document AI handles |
| **HEIC/HEIF** | ❌ Error | Not supported by Google Vision | Clear error message |
| **DICOM** | ❌ Error | Medical imaging, not OCR | Requires conversion |

## Testing Checklist

### Core Phase 2 Functionality
- [ ] **Downscale guardrails:** Skip if width ≤ target or multi-page TIFF/PDF
- [ ] **Dimension validation:** Skip normalization if processed width/height = 0
- [ ] **Format handling:** PNG stays PNG, JPEG optimized, TIFF/PDF passed through
- [ ] **Idempotency:** Checksum comparison prevents redundant uploads
- [ ] **Storage hygiene:** Deterministic paths, sanitized segments, proper contentType
- [ ] **Metadata persistence:** Width/height in OCR manifest for unambiguous normalization
- [ ] **Status flow:** Clean `processing` → `pass1_complete` (no intermediate states)
- [ ] **OCR speed:** 40-60% improvement for large images
- [ ] **Sharp ops:** Verify installation, lockfile updated, Render build succeeds

### Future Integration Readiness
- [ ] **Unsupported format errors:** HEIC/Office/Archive errors mention future timeline
- [ ] **Bypass flag:** `BYPASS_IMAGE_DOWNSCALING=true` works correctly
- [ ] **Error handling:** Graceful fallback preserves original file for future conversion
- [ ] **Logging:** Clear distinction between Phase 2 processing vs future format conversion

### Test Cases
```typescript
// Phase 2 supported formats
✅ 'medical_scan.jpg' → downscaled to 1600px
✅ 'lab_report.png' → preserved as PNG, downscaled
✅ 'xray_multi.tiff' → passed through (multi-page)
✅ 'prescription.pdf' → passed through

// Future format support (should error gracefully)
❌ 'iphone_photo.heic' → "Phase 3 (2-3 weeks post-Phase 2)"
❌ 'lab_results.docx' → "Phase 4 (4-6 weeks post-Phase 2)"
❌ 'bulk_docs.zip' → "Phase 5 (8-10 weeks post-Phase 2)"

// Edge cases
✅ Small image (800px) → no downscaling needed
✅ BYPASS_IMAGE_DOWNSCALING=true → original file used
✅ Corrupted image → graceful fallback to original
```

## File Changes Summary

| File | Change | Lines | Phase |
|------|--------|-------|-------|
| `image-processing.ts` | Format-preserving downscaler with future hooks | New function | Phase 2 |
| `worker.ts` | Move downscaling before OCR + bypass flag | ~440-450 | Phase 2 |
| `worker.ts` | Fix hardcoded bbox normalization | 450-475 | Phase 2 |
| `worker.ts` | Add metadata storage with caching | New section | Phase 2 |
| `Pass1EntityDetector.ts` | Remove duplicate downscaling | 257-279 | Phase 2 |
| Database | Add processed image metadata columns | Migration | Phase 2 |
| Environment | Add bypass flags | Render.com | Phase 2 |

**Total Implementation Scope:** 7 focused changes, all targeting core downscaling optimization

## Critical Fixes Applied

1. **Status Field:** Clean status flow: `processing` → `pass1_complete` (no 'ocr_complete')
2. **Bbox Normalization:** Use actual dimensions, not hardcoded 1000px
3. **Format Preservation:** PNG stays PNG, JPEG optimized only
4. **EXIF Handling:** Automatic rotation with Sharp
5. **Metadata Storage:** Checksum + MIME for safe reuse

## Success Metrics

- OCR processing time: Target 40-60% reduction
- Total processing time: Monitor for overall improvement
- Storage usage: +1 downscaled image per document
- Pass 2 preparation: Image readily available

## Rollback Plan

### Emergency Rollback (Immediate)
```bash
# Set environment variable to bypass downscaling
export BYPASS_IMAGE_DOWNSCALING=true
# Restart worker - will use original files, skip downscaling
```

### Full Rollback (If needed)
1. **Worker Changes:** Move downscaling back to Pass1EntityDetector (lines 257-279)
2. **Storage Operations:** Remove processed image storage logic
3. **Database:** Columns can remain (won't break existing flow)
4. **OCR Normalization:** Revert to hardcoded 1000px (temporary)

### Rollback Triggers
- OCR accuracy drops significantly (>10% entity detection degradation)
- Processing time increases instead of decreases
- Sharp library issues on Render.com platform
- Storage costs increase unexpectedly

## Future Format Support Integration

Phase 2 provides clean integration points for future format conversion:

**Integration Hooks Added:**
```typescript
// Emergency bypass flag for rollback scenarios
const BYPASS_DOWNSCALING = process.env.BYPASS_IMAGE_DOWNSCALING === 'true';

// Graceful error handling for unsupported formats
try {
  processed = await downscaleImageBase64(b64, mimeType);
} catch (error) {
  if (error.message.includes('planned for Phase')) {
    console.log(`[Worker] ${error.message}`);
    // Continue with original - Phase 3+ will add conversion
  }
}
```

**Clear User Communication:**
- HEIC errors mention "Phase 3 (2-3 weeks post-Phase 2)"
- Office docs mention "Phase 4 (4-6 weeks post-Phase 2)"
- Archives mention "Phase 5 (8-10 weeks post-Phase 2)"

**Architecture Prepared For:**
- Format conversion jobs (Phase 3+)
- Storage of both original + converted files
- Emergency bypass mechanisms
- Graceful degradation during conversion system issues

**See:** [File Format Optimization Roadmap](../file-format-optimization-roadmap.md) for the comprehensive format support strategy that will build on Phase 2's foundation.

---

**Next Phase:** Pass 2 can use stored downscaled images at `processed_image_path`