# Pass 1 Job Audit - October 2025 Run

**Shell File ID:** `fbed75ec-ba6d-4c16-8b80-54868e9c851e`
**Date Processed:** October 30, 2025
**Document:** BP2025060246784 - first 2 page version V5.jpeg (1 page)

---

## 1. Input Analysis

### What Went Into Pass 1

| Input Type | Used | Notes |
|------------|------|-------|
| Raw JPEG Image | YES | Base64 sent to GPT-5-mini Vision (PRIMARY) |
| OCR Format | OLD `SpatialElement[]` | Built on-the-fly from OCR blocks |
| Enhanced OCR (Y-only) | NO | Did not exist (Oct 2025) |
| Enhanced OCR (XY) | NO | Did not exist (Oct 2025) |

### Token Breakdown

| Component | Tokens | % of Total |
|-----------|--------|------------|
| Input tokens | 10,686 | - |
| Output tokens | 15,949 | - |
| **Total** | **26,635** | 100% |

**Estimated Input Token Breakdown:**

| Component | Est. Tokens | % | Notes |
|-----------|-------------|---|-------|
| System prompt | ~200 | 2% | PASS1_SYSTEM_MESSAGE |
| Classification prompt | ~2,500 | 23% | Taxonomy, rules, JSON schema |
| OCR extracted_text | ~250 | 2% | 1,004 chars |
| Spatial mapping JSON | ~1,500 | 14% | 100 word objects |
| **Raw JPEG image** | **~6,200** | **58%** | Vision model tokens |

---

## 2. Output Analysis

### Entity Detection Results

| Category | Count | Avg Confidence |
|----------|-------|----------------|
| clinical_event | 16 | 0.944 |
| healthcare_context | 11 | 0.973 |
| document_structure | 10 | 0.968 |
| **TOTAL** | **37** | **0.958** |

### Subtype Breakdown

| Category | Subtype | Count | Confidence |
|----------|---------|-------|------------|
| clinical_event | immunization | 10 | 0.936 |
| clinical_event | diagnosis | 2 | 0.965 |
| clinical_event | medication | 2 | 0.960 |
| clinical_event | procedure | 1 | 0.950 |
| clinical_event | allergy | 1 | 0.960 |
| healthcare_context | patient_identifier | 7 | 0.980 |
| healthcare_context | facility_identifier | 2 | 0.975 |
| healthcare_context | healthcare_context_other | 2 | 0.960 |
| document_structure | form_structure | 4 | 0.975 |
| document_structure | document_structure_other | 3 | 0.973 |
| document_structure | header/footer/page_marker | 3 | 0.957 |

### Bridge Schemas Identified

| Bridge Schema | Count |
|---------------|-------|
| immunization | 10 |
| patient_identifier | 7 |
| medication | 2 |
| diagnosis | 2 |
| facility_identifier | 2 |
| procedure | 1 |
| allergy | 1 |

---

## 3. Spatial Coordinate Analysis

**All 37 entities:** `spatial_mapping_source: "ocr_exact"`, `ai_ocr_agreement_score: 1.000`

Sample (sorted by Y position):

| Entity | Text | Y | Bbox |
|--------|------|---|------|
| E001 | Patient Health Summary | 47 | {x:160, y:47, w:276, h:21} |
| E002 | Xavier Flanagan | 74 | {x:73, y:74, w:88, h:11} |
| E017 | Metformin 500mg twice daily | 503 | {x:36, y:503, w:123, h:11} |
| E026 | 11/04/2010 Fluvax (Influenza) | 630 | {x:34, y:630, w:220, h:10} |
| E036 | Page 1 of 20 | 780 | {x:34, y:780, w:80, h:10} |

**Assessment:** Coordinates flow logically top-to-bottom. Bounding boxes appear accurate.

---

## 4. Performance Metrics

| Metric | Value |
|--------|-------|
| Processing Time | 5 min 4 sec |
| OCR Agreement | 95.0% |
| Quality Score | 0.950 |
| Confidence Distribution | 37 high, 0 medium, 0 low |
| Manual Review Queue | 0 items |

---

## 5. OCR Format Comparison

### OLD Format (Used in this run)

```json
[
  {"text": "Xavier", "page_number": 1, "bounding_box": {"x": 73, "y": 74, "width": 40, "height": 11}, "confidence": 0.99},
  {"text": "Flanagan", "page_number": 1, "bounding_box": {"x": 115, "y": 74, "width": 48, "height": 11}, "confidence": 0.99}
]
```
- Truncated to 100 word objects
- ~1,500 tokens for 100 elements

### NEW Y-Only Format (Pass 0.5 uses)

```
[Y:74] Name : Xavier Flanagan South Coast Medical
[Y:88] 505 Grasslands Rd 2841 Pt Nepean Rd
```
- ~900 tokens per page
- No X-coordinates

### NEW XY Format (for Pass 2)

```
[Y:74] Name (x:35) | : (x:65) | Xavier (x:73) | Flanagan (x:115)
```
- ~5,000 tokens per page
- Full coordinate data

---

## 6. Key Findings

1. **Image dominates input tokens** - 58% of input is raw JPEG
2. **Output > Input** - 15,949 output tokens for 37 entities (heavy per-entity metadata)
3. **100% spatial accuracy** - All coordinates matched OCR exactly
4. **All high confidence** - No entities below 0.8 threshold
5. **Old OCR format** - Word-by-word JSON, truncated to 100 elements

---

## 7. Grand Vision: OCR-Primary Architecture

**Key Insight:** The October 2025 run used raw image as PRIMARY input with OCR as reference. The future architecture inverts this:

| Aspect | Legacy (Oct 2025) | Future Architecture |
|--------|-------------------|---------------------|
| Primary Input | Raw JPEG image | Enhanced OCR text |
| Secondary Input | OCR reference data | Pixels (selective) |
| Pixel Usage | Always (100% of docs) | Non-text zones only |
| Zone Awareness | None | Pass 0.5 flags zones |

### Why OCR-Primary?

1. **Token efficiency** - OCR text is ~80% cheaper than vision tokens
2. **Deterministic coordinates** - OCR provides exact bounding boxes
3. **Consistency** - Same text interpretation across passes
4. **Selective vision** - Only use pixels where they add value (graphs, images, tables)

### Zone-Level Processing (Future)

Pass 0.5 will flag non-text zones that benefit from pixel analysis:
- Charts and graphs
- Embedded images (logos, signatures)
- Complex tables with visual structure
- Handwritten annotations

For these zones ONLY, Pass 1 would include pixel data alongside OCR. For standard text zones (95%+ of medical documents), OCR-only is sufficient.

### Legacy Path Status

The October 2025 approach (dual-input with image as primary) will be DISCARDED after OCR-only validation. It served its purpose during initial development but is not the target architecture.

---

## 8. Next Test: OCR-Only Pass 1

**Goal:** Test Pass 1 with Y-only enhanced OCR, NO raw image

**Expected changes:**
- Input tokens: ~10,686 to ~3,000 (remove ~6,200 image tokens)
- Cost reduction: ~60%
- Processing time: Faster (no image encoding/transmission)

**Hypothesis:** For text-dominant medical documents, OCR-only will produce equivalent entity detection quality at 60% lower cost.

**Test approach:**
1. Add `PASS1_OCR_ONLY=true` config flag
2. Load enhanced OCR Y-only format (same as Pass 0.5)
3. Create OCR-only prompt variant
4. Process same document, compare results

---

**Created:** 2025-11-28
**Updated:** 2025-11-28 (added grand vision section)
