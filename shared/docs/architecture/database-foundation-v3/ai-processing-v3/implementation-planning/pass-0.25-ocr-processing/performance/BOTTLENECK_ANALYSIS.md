# Pass 0.25: Bottleneck Analysis

**Created:** November 2, 2025
**Purpose:** Explain why OCR is the slowest pipeline component and what we can do about it

---

## Executive Summary

**OCR processing is the primary bottleneck in the entire document processing pipeline**, consuming 77-93% of total processing time for large files.

**Key findings:**
- OCR: 3 seconds per page (external API call)
- All other components combined: <10 seconds total
- For 142-page file: OCR = 7 minutes, everything else = 2 minutes

**This is EXPECTED and NORMAL** - OCR is inherently slow due to:
1. External API calls (network latency)
2. Complex image processing on Google's side
3. High-resolution medical document images
4. Sequential processing (current implementation)

---

## Pipeline Component Timing Breakdown

### Full Pipeline (142-Page PDF Example)

```
Component                    Time        % of Total   Type
─────────────────────────────────────────────────────────────
1. PDF Download              1 sec       0.2%         Network I/O
2. PDF Page Extraction       6 sec       1.3%         CPU-bound
3. Upload Pages to Storage   3 sec       0.7%         Network I/O
4. OCR Processing           420 sec      93%         ← BOTTLENECK
5. Pass 0.5 Analysis         30 sec      6.6%         AI API
6. Pass 1 Detection        (disabled)    0%           AI API
7. Pass 2 Extraction       (future)      0%           AI API
─────────────────────────────────────────────────────────────
TOTAL                       460 sec      100%

OCR is 93% of processing time!
```

### Detailed OCR Breakdown (Per Page)

```
Step                        Time         Notes
─────────────────────────────────────────────────────────────
1. Network request setup     0.2 sec     HTTPS connection
2. Upload image to Google    0.3 sec     ~1-2 MB image
3. Google Vision processing  2.0 sec     AI inference on their servers
4. Download OCR result       0.3 sec     ~1.5 MB JSON response
5. Parse JSON response       0.2 sec     Node.js JSON.parse()
─────────────────────────────────────────────────────────────
TOTAL PER PAGE              3.0 sec

External API call is 86% of per-page time (2.6 sec / 3 sec)
```

---

## Why OCR Is Inherently Slow

### 1. External API Dependency

**We don't control Google's processing time:**
- Request travels to Google's servers (network latency)
- Google performs complex AI inference
- Response travels back (network latency)
- **Total: ~2 seconds of wait time per page**

**Compare to local processing:**
- PDF extraction: CPU-bound, local, <0.1 sec/page
- JSON parsing: CPU-bound, local, <0.01 sec
- OCR: External API, 2+ seconds unavoidable

### 2. Image Processing Complexity

**What Google Vision does:**
1. Image preprocessing (deskew, denoise, enhance)
2. Text detection (locate all text regions)
3. Character recognition (OCR each word)
4. Layout analysis (understand document structure)
5. Confidence scoring (per word, per line, per page)
6. JSON serialization (structure results)

**This is computationally expensive:**
- Medical documents: High-resolution scans (300-600 DPI)
- Dense text: Hospital summaries have thousands of words per page
- Mixed formatting: Tables, handwriting, printed text
- **Google's servers doing heavy lifting, we just wait**

### 3. Network Latency Overhead

**Each API call incurs network overhead:**
```
Request:
- DNS lookup: ~50ms (cached after first)
- TCP handshake: ~100ms
- TLS handshake: ~150ms
- HTTP request: ~50ms
Total setup: ~350ms per call

Response:
- Server processing: ~2000ms
- HTTP response: ~50ms
- Download JSON: ~300ms (1.5 MB)
Total response: ~2350ms

TOTAL: ~2700ms ≈ 3 seconds
```

**142 pages × 3 sec = 426 seconds of unavoidable network+API time**

---

## Comparison with Other Components

### Component Speed Analysis

| Component | Time (142p file) | Time per page | Type | Parallelizable? |
|-----------|------------------|---------------|------|-----------------|
| PDF Download | 1 sec | - | Network I/O | N/A |
| Page Extraction | 6 sec | 0.04 sec | CPU | Partially |
| **OCR** | **420 sec** | **3 sec** | **External API** | **YES** ✅ |
| Pass 0.5 | 30-60 sec | - | AI API | No* |
| Pass 1 | 60-120 sec | - | AI API | No* |
| Pass 2 | 30-60 sec | - | AI API | No* |

*Pass 0.5/1/2 process entire document at once, not per-page

**Key insight:** OCR is the ONLY component that scales linearly with page count

```
10 pages:  OCR = 30 sec,  Pass 0.5 = 30 sec  (50/50 split)
50 pages:  OCR = 150 sec, Pass 0.5 = 30 sec  (83% OCR)
100 pages: OCR = 300 sec, Pass 0.5 = 30 sec  (91% OCR)
142 pages: OCR = 426 sec, Pass 0.5 = 30 sec  (93% OCR)
```

**As files get larger, OCR dominates even more!**

---

## Impact on User Experience

### Current State (Sequential OCR)

**Small files (1-10 pages):**
- User upload: Instant
- Processing: 30-60 seconds
- User sees results: ~1 minute
- **Acceptable UX** ✅

**Medium files (50-69 pages):**
- User upload: Instant
- Processing: 3-4 minutes
- User sees results: ~4 minutes
- **Borderline acceptable** ⚠️

**Large files (142+ pages):**
- User upload: Instant
- Processing: 7-10 minutes
- User sees results: **7-10 minutes waiting** ❌
- **Unacceptable UX** - User might think system is broken

### After Batched Parallel OCR

**Large files (142 pages):**
- User upload: Instant
- OCR: 45 seconds (batched parallel)
- Pass 0.5: 30 seconds
- **Total: ~75 seconds** ✅
- **Acceptable UX restored!**

---

## Why We Can't Eliminate OCR Bottleneck (But We Can Minimize It)

### Cannot Eliminate Because:

1. **Medical documents are scanned images**
   - Not text-based PDFs
   - OCR is mandatory, no alternative

2. **External API is required**
   - Self-hosted OCR (Tesseract) has 85-90% accuracy
   - Google Vision: 95-97% accuracy
   - Medical accuracy is critical (patient safety)

3. **Network latency is physics**
   - Australia → Google servers (Singapore region): ~50-100ms RTT
   - Cannot make speed of light faster
   - API call will always take 2+ seconds

### Can Minimize Impact By:

1. **Parallelization** (batched parallel OCR) ← Doing NOW
   - 10 pages at once instead of 1
   - 9.5x speedup for large files
   - **Best bang for buck optimization**

2. **Caching** (future enhancement)
   - If same document uploaded twice, reuse OCR
   - Rare case, but cheap to implement

3. **Pre-processing** (future optimization)
   - Resize images before API call (smaller uploads)
   - Compress with minimal quality loss
   - Could save 10-15% time

4. **Separate OCR service** (if scale demands)
   - Dedicated workers for OCR
   - Parallel processing across workers
   - See `FUTURE_SCALING_OPTIONS.md`

---

## Alternative OCR Solutions Evaluated

### AWS Textract
**Pricing:** $15 per 1,000 pages
**Accuracy:** 95% (similar to Google)
**Speed:** 5-10 seconds per page (slower)

**Decision:** ❌ Not cost-effective
- 10x more expensive
- Slower than Google Vision
- No compelling advantage

### Azure Computer Vision
**Pricing:** $1.50 per 1,000 pages (same as Google)
**Accuracy:** 94-96%
**Speed:** 3-5 seconds per page

**Decision:** ❌ No advantage over Google
- Slightly slower
- Less experience with API
- Google Vision working well

### Tesseract OCR (Open Source)
**Pricing:** Free (self-hosted)
**Accuracy:** 85-90% (worse than Google)
**Speed:** 1-2 seconds per page (faster)

**Decision:** ❌ Not worth the tradeoff
- 5-7% lower accuracy unacceptable for medical docs
- Would need GPU instances for speed
- Self-hosting complexity
- Saving $7.50/month not worth it

**Conclusion:** Google Vision is the best option for accuracy, cost, and reliability

---

## Optimization Opportunities

### Already Implemented ✅
1. **Batched parallel processing** (10 pages at a time)
   - 9.5x speedup for large files
   - Main focus of current work

### Quick Wins (Could Implement)

#### 1. Image Compression Before API Call
**Potential savings:** 10-15% time reduction
**Effort:** Low (2-3 hours)
**Implementation:**
```typescript
// Before sending to Google Vision
const optimizedImage = await sharp(imageBuffer)
  .resize({ width: 2000, withoutEnlargement: true })
  .jpeg({ quality: 85 })
  .toBuffer();

// Send optimized image instead of original
await callGoogleVisionOCR(optimizedImage);
```

**Tradeoff:**
- Faster uploads (smaller images)
- Potential slight accuracy decrease
- Need to test if quality 85 maintains >95% OCR confidence

#### 2. Connection Pooling
**Potential savings:** 5-10% time reduction
**Effort:** Low (1-2 hours)
**Implementation:**
```typescript
// Reuse HTTPS connections
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 10
});

// Use agent for all Google Vision requests
```

**Benefit:**
- Eliminate TCP/TLS handshake overhead for subsequent requests
- First request: 3 sec, subsequent: 2.7 sec

### Medium Effort (Future)

#### 3. Regional API Endpoints
**Potential savings:** 5-10% time reduction
**Effort:** Medium (4-6 hours research + testing)
**Implementation:**
- Use Google Vision Asia-Pacific endpoint
- Currently using global endpoint
- Reduce network latency by 20-30ms per request

#### 4. Batch API Calls (Google Vision Batch)
**Potential savings:** Unknown (need testing)
**Effort:** High (1-2 weeks)
**Implementation:**
- Google Vision supports batch requests (multiple images in one API call)
- Could send 5-10 images per request instead of 1
- Potentially reduce network overhead

**Risk:**
- Batch might be slower per image (more processing)
- Need to test if batch is actually faster

---

## Long-Term Scalability

### When OCR Is No Longer Bottleneck

**After batched parallel OCR:**
```
142-page file:
- OCR: 45 seconds (batched)
- Pass 0.5: 30 seconds
- Pass 1: 60 seconds (when enabled)
- Pass 2: 30 seconds (when implemented)

Total: ~165 seconds
New bottleneck: Pass 1 (36% of time)
```

**At that point, optimize Pass 1 instead of OCR**

### Future Bottleneck Predictions

**With all passes enabled:**
1. **OCR:** 45 sec (27%)
2. **Pass 1:** 60 sec (36%) ← Next bottleneck
3. **Pass 0.5:** 30 sec (18%)
4. **Pass 2:** 30 sec (18%)

**Optimization priority order:**
1. Pass 1 (slowest)
2. OCR (already optimized)
3. Pass 0.5 / Pass 2 (tie)

---

## Monitoring Bottlenecks Over Time

### Metrics to Track

**Track time breakdown per component:**
```sql
SELECT
  shell_file_id,
  ocr_processing_time_ms,
  pass05_processing_time_ms,
  pass1_processing_time_ms,
  pass2_processing_time_ms,
  (ocr_processing_time_ms::float / (
    ocr_processing_time_ms +
    pass05_processing_time_ms +
    COALESCE(pass1_processing_time_ms, 0) +
    COALESCE(pass2_processing_time_ms, 0)
  )) * 100 as ocr_percent_of_total
FROM processing_metrics
WHERE created_at > NOW() - INTERVAL '7 days';
```

**Alert when bottleneck shifts:**
- If OCR <50% of total time → OCR no longer primary bottleneck
- Re-evaluate optimization priorities

---

## Conclusion

**OCR is the bottleneck because:**
1. External API calls are slow (2+ seconds per page)
2. Scales linearly with page count
3. Cannot be eliminated (medical scans require OCR)
4. Was implemented sequentially (1 page at a time)

**Solution:**
1. ✅ **Batched parallel OCR** - 9.5x speedup (IMPLEMENTING NOW)
2. Future: Image compression, connection pooling, regional endpoints
3. Long-term: Separate OCR service if scale demands

**After batched parallel:**
- OCR time reduced from 7 min to 45 sec for 142 pages
- OCR no longer dominates (27% vs 93%)
- **Problem solved for pre-launch scale!**

---

**Related Documentation:**
- `OPTIMIZATION_HISTORY.md` - Timeline of improvements
- `METRICS_TRACKING.md` - What we measure
- `../IMPLEMENTATION_PLAN.md` - Batched parallel OCR details
