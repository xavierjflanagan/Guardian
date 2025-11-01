# Format Processor Module - Improvements Roadmap

**Created:** November 1, 2025
**Status:** Review and prioritization
**Source:** GPT-5 Mini blind review + Opus 4.1 blind review + implementation analysis

---

## Overview

This document captures recommended improvements to the Format Processor Module based on:
1. **GPT-5 Mini blind review** (context-aware, Oct 2025 knowledge)
2. **Opus 4.1 blind review** (blinded, no context, fresh perspective)
3. **Implementation learnings** from Phase 1-3 deployment
4. **User insights** (click-to-source requirements, BBOX necessity)

Each recommendation is evaluated with:
- **Priority:** CRITICAL / HIGH / MEDIUM / LOW / REJECTED
- **Effort:** Time estimate
- **Impact:** Business value
- **Decision:** Accept / Reject with justification

## Summary

**Total Improvements Evaluated:** 12
- **CRITICAL (3):** Store processed images, EXIF rotation, HEIC dimensions
- **MEDIUM (3):** Per-page cost tracking, min resolution gate, configurable DPI
- **REJECTED (6):** PNG format, PDF text bypass, GCS migration, store derived images, auto-tune quality, Opus 4.1 PNG recommendation

---

## Critical Fixes (Priority 0 - Immediate)

### 0. Store Processed JPEG Pages (PRODUCTION BLOCKER)

**Source:** User insight + Opus 4.1 validation
**Priority:** CRITICAL - BLOCKS CLICK-TO-SOURCE FEATURE
**Effort:** 2 hours
**Impact:** Enables core feature (click-to-source with BBOX highlighting)

**Problem:**
- Current: Only store originals + OCR JSON (with BBOX coordinates)
- BBOX coordinates reference processed JPEG pages that don't exist
- Click-to-source feature IMPOSSIBLE without reference images
- Can't retroactively convert BBOX from processed dimensions to original

**Current Flow (BROKEN):**
```
1. Original → Supabase Storage ✓
2. Format processor → JPEG pages (memory only)
3. JPEG → Google Vision OCR
4. BBOX coordinates returned (reference non-existent JPEGs) ✗
5. JPEG pages DISCARDED ✗
6. Click-to-source: Can't show BBOX (no image!) ✗
```

**Required Flow (FIXED):**
```
1. Original → Supabase Storage (originals/)
2. Format processor → JPEG pages (memory)
3. Store JPEG pages → Supabase Storage (processed/) ✓ NEW!
4. JPEG → Google Vision OCR
5. BBOX coordinates (reference stored JPEGs) ✓
6. Click-to-source: Load JPEG + overlay BBOX ✓
```

**Implementation:**

Update format processor to return storage metadata:
```typescript
interface ProcessedPage {
  pageNumber: number;
  base64: string;           // For OCR input
  storagePath?: string;     // NEW: Where this page is stored
  mime: string;
  width: number;
  height: number;
  originalFormat: string;
}
```

Update worker to store pages before OCR:
```typescript
async function processDocument(preprocessResult, shellFileId, patientId) {
  const storagePaths = [];

  // NEW: Store each processed page
  for (const page of preprocessResult.pages) {
    const path = `${patientId}/${shellFileId}/processed/page-${page.pageNumber}.jpg`;

    await supabase.storage
      .from('medical-docs')
      .upload(path, Buffer.from(page.base64, 'base64'), {
        contentType: 'image/jpeg',
        upsert: true,
      });

    storagePaths.push(path);
  }

  // Send to OCR
  const ocrResult = await googleVisionOCR(preprocessResult.pages);

  // Store OCR with page references
  await persistOCRArtifacts(supabase, shellFileId, {
    ...ocrResult,
    processed_image_paths: storagePaths, // NEW!
  });
}
```

**Storage Costs (JUSTIFIED):**
```
8-page PDF:
- Original: 80 KB
- Processed JPEGs: 8 × 200 KB = 1.6 MB
- Total: 1.68 MB

100-page PDF:
- Original: 5 MB
- Processed JPEGs: 100 × 200 KB = 20 MB
- Total: 25 MB

Monthly (1000 docs, avg 10 pages):
- Storage: ~2 GB
- Cost: $0.042/month (~4 cents)

This is NOT expensive - this is ESSENTIAL for click-to-source!
```

**Why You Can't Convert BBOX Back to Original:**
```
Original HEIC: 4000×3000 (portrait, EXIF rotated)
Processed JPEG: 1600×1200 (auto-rotated, downscaled)
BBOX on JPEG: {x: 800, y: 400, width: 200, height: 50}

To convert back requires:
1. Reverse rotation (which angle? EXIF may be stripped)
2. Reverse downscaling (2.5x factor)
3. Account for cropping/padding
4. Hope aspect ratio didn't change

= IMPOSSIBLE to do accurately
```

**Decision:** ✅ ACCEPT - CRITICAL for click-to-source feature

---

### 1. Add EXIF Auto-Rotation

**Source:** GPT-5 + Implementation Gap
**Priority:** CRITICAL
**Effort:** 15 minutes
**Impact:** Prevents rotated iPhone photos from failing OCR

**Problem:**
- iPhone photos often have EXIF rotation metadata (portrait/landscape)
- Sharp reads EXIF but doesn't auto-rotate by default
- Rotated images = OCR failure or incorrect text orientation
- Current code missing `.rotate()` in Sharp pipelines

**Solution:**
Add to all Sharp pipelines:
```typescript
const pipeline = sharp(buffer).rotate(); // Auto-rotate using EXIF
```

**Impact Analysis:**
- **Without fix:** Rotated photos fail OCR (bad UX for 65-70% of market)
- **With fix:** Automatic orientation correction
- **Test case:** Upload landscape iPhone photo of prescription

**Locations to Update:**
- `pdf-processor.ts`: Line 116 (after Sharp initialization)
- `tiff-processor.ts`: Sharp initialization
- `index.ts`: Pass-through images (JPEG/PNG)

**Decision:** ✅ ACCEPT - Critical for iPhone photo uploads

---

### 2. Extract HEIC Dimensions

**Source:** GPT-5 + Opus 4.1 (metadata completeness)
**Priority:** CRITICAL
**Effort:** 10 minutes
**Impact:** Complete metadata for all formats

**Problem:**
- HEIC conversion returns `width: 0, height: 0` (unknown)
- Downstream systems may need dimensions for layout/display
- heic-convert library doesn't provide dimensions

**Solution:**
After HEIC → JPEG conversion, add Sharp metadata extraction:
```typescript
const jpegBuffer = Buffer.from(jpegArrayBuffer);

// NEW: Extract dimensions from converted JPEG
const jpegMeta = await sharp(jpegBuffer).metadata();

return {
  pages: [{
    pageNumber: 1,
    base64: jpegBuffer.toString('base64'),
    mime: 'image/jpeg',
    width: jpegMeta.width || 0,   // Real dimensions
    height: jpegMeta.height || 0, // Real dimensions
    originalFormat: mimeType,
  }],
  // ...
};
```

**Impact Analysis:**
- **Current:** Incomplete metadata (dimensions unknown)
- **After fix:** Consistent metadata across all formats
- **Effort:** 5 lines of code

**Location:** `format-processor/index.ts` lines 108-130

**Decision:** ✅ ACCEPT - Easy win, completes metadata

---

## High-Value Enhancements (Phase 2.1 - Next Session)

### 3. PDF Text Layer Bypass (REJECTED - BREAKS BBOX)

**Source:** GPT-5 (cost optimization)
**Priority:** REJECTED BY USER
**Effort:** N/A
**Impact:** Would break click-to-source feature

**Original Suggestion:**
- Many medical PDFs have extractable text layers (EMR exports)
- Extract text directly instead of rendering → save OCR costs
- Cost: $0.006/page OCR → $0/page text extraction
- Speed: 5.5s/page → 0.1s/page (55x faster)

**Why REJECTED (User Insight):**
```
Text extraction provides text but NO BBOX spatial coordinates!

Click-to-source feature requires:
1. Extract text ✓ (text extraction can do this)
2. Get BBOX coordinates ✗ (text extraction CAN'T do this)
3. Store reference image ✗ (no image if we skip OCR)
4. Highlight source in UI ✗ (impossible without BBOX + image)

Without BBOX, click-to-source is broken!
```

**Why This Matters:**
- Exora's core value: Clinical entity traceability
- Users must click through to SOURCE document
- See EXACT location where data was extracted
- Regulatory compliance (audit trail)

**Alternative Considered:**
Could we extract BOTH text AND render images for BBOX?
- Problem: Wastes rendering cost if we already have text
- Reality: Must render anyway for BBOX capture
- Conclusion: Just use OCR for everything (gets both text + BBOX)

**Correct Approach:**
```
All PDFs → Render to images → Google Vision OCR
  ↓
Outputs:
  - Extracted text ✓
  - BBOX coordinates ✓
  - Confidence scores ✓
  - Reference images ✓ (if we store them - see improvement #0!)

This provides EVERYTHING needed for click-to-source!
```

**Decision:** ❌ REJECT - OCR is mandatory for BBOX capture

---

### 4. Add pageErrors[] Field to Schema

**Source:** GPT-5 (production resilience)
**Priority:** HIGH
**Effort:** 1 hour
**Impact:** Graceful degradation for large multi-page documents

**Problem:**
- Current: If any page fails, entire job fails
- Reality: 100-page PDF with 1 corrupted page shouldn't fail
- Medical records often have quality issues on some pages

**Solution:**
Update `ProcessedPage` and `PreprocessResult` types:
```typescript
interface ProcessedPage {
  pageNumber: number;
  base64: string | null;  // Allow null for failed pages
  mime: string;
  width: number;
  height: number;
  originalFormat: string;
  error?: {              // NEW: Optional error tracking
    message: string;
    code: string;
    details?: any;
  };
}

interface PreprocessResult {
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

**Processing Logic:**
```typescript
// Process pages with error handling per page
for (let i = 0; i < totalPages; i++) {
  try {
    const page = await processPage(i);
    pages.push(page);
  } catch (error) {
    console.error(`Page ${i + 1} failed`, error);
    pages.push({
      pageNumber: i + 1,
      base64: null,
      mime: 'image/jpeg',
      width: 0,
      height: 0,
      originalFormat: mimeType,
      error: {
        message: error.message,
        code: 'PAGE_PROCESSING_FAILED',
      },
    });
    pageErrors.push({ pageNumber: i + 1, error: error.message });
  }
}

// Decide if job should succeed or fail
if (pages.filter(p => p.base64).length === 0) {
  throw new Error('All pages failed to process');
}

return {
  pages,
  totalPages,
  pageErrors,
  successfulPages: pages.filter(p => p.base64).length,
  // ...
};
```

**Impact Analysis:**
- **Before:** 100-page PDF with 1 bad page = complete failure
- **After:** 100-page PDF with 1 bad page = 99 pages processed, 1 error logged
- **User experience:** Partial success with clear error reporting
- **Debugging:** Clear visibility into which pages failed and why

**Decision:** ✅ ACCEPT - Critical for production resilience

---

## Medium-Value Improvements (Phase 2.2 - Future)

### 5. Per-Page Cost Tracking

**Source:** GPT-5 (monitoring/optimization)
**Priority:** MEDIUM
**Effort:** 30 minutes
**Impact:** Better cost visibility and optimization insights

**Solution:**
```typescript
interface ProcessedPage {
  // ... existing fields
  processingCost?: {
    ocrCostUsd: number;
    aiCostUsd: number;
    totalCostUsd: number;
  };
}
```

Track costs per page for analytics:
- Which document types are most expensive?
- Cost per page trends over time
- Identify optimization opportunities

**Decision:** ✅ ACCEPT - Low effort, high value for monitoring

---

### 6. Min Resolution Quality Gate

**Source:** GPT-5 (quality control)
**Priority:** MEDIUM
**Effort:** 30 minutes
**Impact:** Prevent low-quality uploads from wasting OCR costs

**Problem:**
- Very low-resolution images (<100 DPI) won't OCR well
- Better to reject early with clear error than waste AI costs

**Solution:**
```typescript
async function validateImageQuality(metadata) {
  const estimatedDPI = calculateDPI(metadata);

  if (estimatedDPI < 100) {
    throw new Error(
      `Image resolution too low (${estimatedDPI} DPI). ` +
      `Minimum 150 DPI required for accurate text recognition. ` +
      `Please scan or photograph at higher resolution.`
    );
  }
}
```

**Decision:** ✅ ACCEPT - Better UX than processing bad images

---

### 7. Configurable DPI for PDF Rendering

**Source:** GPT-5 + Opus 4.1 (quality options)
**Priority:** MEDIUM
**Effort:** 15 minutes
**Impact:** Flexibility for quality vs cost trade-offs

**Current:** Hard-coded 200 DPI
**Proposed:** Configurable via `FormatProcessorConfig`

```typescript
interface FormatProcessorConfig {
  maxWidth?: number;
  jpegQuality?: number;
  correlationId?: string;
  dpi?: number;           // NEW: Default 200
}
```

**DPI Guidelines:**
- **150 DPI:** Fast, low cost, acceptable quality (basic documents)
- **200 DPI:** Current default, good balance
- **300 DPI:** High quality, slower, more expensive (detailed medical images)

**Decision:** ✅ ACCEPT - Simple config addition

---

## Evaluated and REJECTED

### 8. PNG Instead of JPEG (Opus 4.1 Suggestion)

**Source:** Opus 4.1 (lossless quality)
**Priority:** REJECTED
**Rationale:** Cost-benefit analysis doesn't justify

**Opus 4.1's Argument:**
- Lossless format = better OCR accuracy
- Simpler single-format pipeline
- Better for spatial coordinates (BBOX)
- 300 DPI standard

**Counter-Analysis:**

**Evidence Against:**
1. **Current JPEG results:** 96.63% OCR accuracy (excellent)
   - No quality issues observed in production
   - Medical text extraction working perfectly

2. **File size comparison:**
   - JPEG 200 DPI: ~200 KB per page
   - PNG 300 DPI: ~2 MB per page (10x larger)

3. **Cost impact (8-page PDF):**
   - JPEG: ~1.6 MB total upload
   - PNG: ~16 MB total upload
   - Network costs: 10x higher
   - Google Vision costs: Size-based pricing (higher)
   - Storage costs: 10x if storing processed pages

4. **Spatial coordinates:**
   - Google Vision returns normalized coordinates (0-1 scale)
   - Works with any resolution/format
   - Pixel-perfect BBOX not needed

5. **Production reality:**
   - Already live with JPEG
   - Working excellently
   - No reported quality issues
   - Healthcare startup = cost matters

**When PNG Might Make Sense:**
- If we observe compression artifacts affecting OCR
- If we need pixel-perfect spatial coordinates (not current requirement)
- If file size costs become negligible

**Decision:** ❌ REJECT - No evidence of problems to solve, high cost for theoretical benefit

**Alternative:** Keep JPEG, add optional PNG output if specific use case emerges

---

### 9. Google Vision Async API via GCS

**Source:** GPT-5 (alternative architecture)
**Priority:** REJECTED
**Rationale:** Adds complexity without solving problems

**Suggestion:**
Use Google's native PDF API via GCS buckets instead of our page extraction

**Counter-Analysis:**
1. **Current stack:** Supabase Storage (not GCS)
2. **Infrastructure change:** Would require GCS buckets, additional integration
3. **Vendor lock-in:** Ties us more to Google ecosystem
4. **Current approach:** Works with existing Supabase-aligned stack
5. **Benefit:** Marginal (Google does page extraction vs Poppler)
6. **No problem:** Current approach working fine

**Decision:** ❌ REJECT - No problem to solve, adds infrastructure complexity

---

### 10. Store Derived Page Images

**Source:** GPT-5 (re-processing optimization)
**Priority:** REJECTED
**Rationale:** Storage cost > re-conversion cost

**Suggestion:**
Keep converted JPEG pages in storage for re-processing

**Cost Analysis:**
- **Storage:** 100-page PDF = 100 JPEG images = ~20 MB
- **Monthly storage (Supabase):** $0.021 per GB → ~$0.0004/month
- **At scale (1000 PDFs):** ~$0.40/month storage
- **Re-conversion cost:** ~10 seconds compute time = negligible

**Re-processing frequency:** Rare event (model upgrades, error corrections)

**Decision:** ❌ REJECT - Re-convert from originals when needed (rare)

**Alternative:** Keep originals only, re-process on demand

---

### 11. Auto-Tune Quality/DPI for Large Jobs

**Source:** GPT-5 (cost optimization)
**Priority:** REJECTED
**Rationale:** Quality consistency > cost savings

**Suggestion:**
Reduce quality/DPI automatically for large PDFs to save costs

**Counter-Analysis:**
1. **Medical records:** Can't sacrifice accuracy for cost
2. **User expectation:** Consistent quality regardless of file size
3. **Current costs:** Already very reasonable ($0.0006/page)
4. **Risk:** Lower quality = missed clinical data = liability
5. **Trust:** Users expect consistent results

**Decision:** ❌ REJECT - Keep quality consistent, don't auto-tune

---

## Architectural Insights from Opus 4.1

While the PNG recommendation is rejected, Opus 4.1 raised valuable architectural points:

### Insight 1: Uniform Processing Pipeline

**Good Idea:** Single pipeline for all formats
**Current Status:** Already achieved! All formats → JPEG pages → OCR
**Validation:** ✅ We're already doing this

### Insight 2: BBOX/Spatial Data Importance

**Good Idea:** Store spatial coordinates for click-to-source
**Current Status:** Google Vision already returns BBOX coordinates
**Action:** Ensure we're persisting BBOX data in database schema
**Future Feature:** Click-to-source highlighting in UI

### Insight 3: 300 DPI for High-Quality Documents

**Good Idea:** Higher DPI for certain document types
**Current:** 200 DPI default
**Action:** Make DPI configurable (Improvement #7)
**Use case:** Radiology reports, detailed medical images

### Insight 4: Direct Text Extraction from PDFs

**Good Idea:** Extract text when available, skip rendering
**Alignment:** Same as GPT-5's recommendation #3 (PDF text layer bypass)
**Validation:** ✅ High-priority improvement

---

## Implementation Phases

### Phase 2.1 (Next Session - 4.5 hours)

**CRITICAL Fixes:**
0. Store processed JPEG pages (2 hours) - BLOCKS CLICK-TO-SOURCE
1. Add EXIF auto-rotation (15 min)
2. Extract HEIC dimensions (10 min)

**HIGH-VALUE Features:**
4. Add pageErrors[] field (1 hour)

**Total:** ~4 hours

### Phase 2.2 (Future Session - 2 hours)

**Polish & Monitoring:**
5. Per-page cost tracking (30 min)
6. Min resolution quality gate (30 min)
7. Configurable DPI (15 min)

**Documentation:**
- Update phase-2-pdf.md with text layer bypass
- Document DPI recommendations
- Add quality guidelines

**Total:** 2 hours

---

## Success Metrics

### Phase 2.1 Success Criteria:
- ✅ Processed JPEG pages stored in Supabase (click-to-source enabled)
- ✅ Rotated iPhone photos auto-correct orientation
- ✅ HEIC files return real dimensions
- ✅ 100-page PDFs with 1 bad page process 99 pages successfully

### Phase 2.2 Success Criteria:
- ✅ Per-page cost metrics in monitoring dashboard
- ✅ Low-resolution uploads rejected with helpful error
- ✅ DPI configurable for quality/cost trade-offs

---

## Rejected Ideas - Revisit If...

**PNG format:**
- Revisit if: Compression artifacts observed affecting OCR
- Trigger: OCR accuracy drops below 90% on JPEG

**GCS integration:**
- Revisit if: Moving to multi-cloud strategy
- Trigger: Business decision to diversify cloud vendors

**Store derived images:**
- Revisit if: Re-processing becomes frequent (>1% of uploads)
- Trigger: Model upgrade cycle increases

**Auto-tune quality:**
- Revisit if: Cost becomes prohibitive at scale
- Trigger: Monthly OCR costs exceed budget threshold

---

## Key Learnings from Reviews

### From GPT-5 (Context-Aware):
1. **Text extraction opportunity** - PDF text layers = huge cost savings
2. **Production resilience** - Partial success better than total failure
3. **Metadata completeness** - EXIF rotation, dimensions critical

### From Opus 4.1 (Fresh Perspective):
1. **Pipeline uniformity** - We're already doing this well ✓
2. **Spatial data matters** - BBOX persistence for future features
3. **Quality options** - Configurable DPI for different use cases
4. **Simple is better** - Single format is good (JPEG working fine)

### From Implementation (Phase 1-3):
1. **Build-time dependencies** - Types in dependencies for deployed apps
2. **Buffer formats matter** - Uint8Array vs ArrayBuffer for iterable APIs
3. **Sharp auto-rotation** - Missing from initial implementation
4. **Quality threshold** - 200 DPI JPEG = 96%+ OCR accuracy

---

**Last Updated:** November 1, 2025
**Next Action:** Implement Phase 2.1 critical fixes (3.5 hours)
**Review Cycle:** Re-evaluate rejected ideas quarterly based on metrics
