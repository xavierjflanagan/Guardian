# OCR Data Flow: GCV Raw vs Normalized Format

**Date:** November 3, 2025
**Purpose:** Explain the difference between Google Cloud Vision raw format vs normalized format and how they flow through Pass 0.5 and Pass 1

---

## Answer 1: Difference Between GCV Raw and Normalized Format

### Google Cloud Vision RAW Format (Original API Response)

**What it is:** The actual JSON response from Google Cloud Vision API

**Structure (from worker.ts:136-184):**
```json
{
  "responses": [{
    "fullTextAnnotation": {
      "text": "Progress Note\nPatient: Emma Thompson...",  // Flat concatenated text
      "pages": [{
        "property": {...},
        "width": 1700,
        "height": 2200,
        "blocks": [{
          "property": {...},
          "boundingBox": {
            "vertices": [
              {"x": 50, "y": 100},
              {"x": 800, "y": 100},
              {"x": 800, "y": 150},
              {"x": 50, "y": 150}
            ]
          },
          "paragraphs": [{
            "property": {...},
            "boundingBox": {...},
            "words": [{
              "property": {...},
              "boundingBox": {...},
              "confidence": 0.98,
              "symbols": [
                {"text": "P", "boundingBox": {...}, "confidence": 0.99},
                {"text": "r", "boundingBox": {...}, "confidence": 0.98},
                {"text": "o", "boundingBox": {...}, "confidence": 0.97},
                ...
              ]
            }]
          }]
        }]
      }]
    }
  }]
}
```

**Characteristics:**
- Deep nested structure (pages → blocks → paragraphs → words → symbols)
- Character-level detail (each letter has own bbox)
- Complex metadata (properties, confidence at every level)
- Size: ~50KB per 20-page document

---

### Normalized Format (Our Internal Format)

**What it is:** Flattened, simplified format for storage and processing

**Structure (from worker.ts:192-198 and ocr-persistence.ts:661-687):**
```json
{
  "pages": [{
    "page_number": 1,
    "size": {
      "width_px": 1700,
      "height_px": 2200
    },
    "lines": [
      {
        "text": "Progress Note",
        "bbox": {"x": 50, "y": 100, "w": 750, "h": 50},
        "bbox_norm": {"x": 0.029, "y": 0.045, "w": 0.441, "h": 0.023},
        "confidence": 0.98,
        "reading_order": 0
      },
      {
        "text": "Patient: Emma Thompson",
        "bbox": {"x": 50, "y": 160, "w": 450, "h": 45},
        "bbox_norm": {"x": 0.029, "y": 0.073, "w": 0.265, "h": 0.020},
        "confidence": 0.97,
        "reading_order": 1
      }
    ],
    "tables": [],
    "provider": "google_vision",
    "processing_time_ms": 1230
  }]
}
```

**Characteristics:**
- Flat structure (pages → lines)
- LINE-level detail (not character-level)
- Normalized bboxes (0-1 scale for different image sizes)
- Size: Similar ~50KB but more queryable

**Why we normalize:**
1. **Simpler to query** - Don't need to traverse deep nesting
2. **Line-level is sufficient** - We don't need character-level detail
3. **Consistent across providers** - Could add AWS Textract with same schema
4. **Efficient storage** - JSONB indexing works better on flat structure

---

## Answer 2: Is OCR Output Needed for Pass 1?

**YES - Pass 1 needs OCR data, but NORMALIZED format, not raw GCV**

### Evidence from pass1-types.ts:93-113:

```typescript
export interface Pass1Input {
  shell_file_id: string;
  patient_id: string;
  processing_session_id: string;

  // PRIMARY INPUT: Raw file for AI vision analysis
  raw_file: {
    file_data: string;  // Base64 encoded JPEG image
    file_type: string;
    filename: string;
    file_size: number;
  };

  // SECONDARY INPUT: OCR spatial mapping (NORMALIZED FORMAT)
  ocr_spatial_data: {
    extracted_text: string;            // Flat text
    spatial_mapping: SpatialElement[]; // Line-level bboxes
    ocr_confidence: number;
    processing_time_ms: number;
    ocr_provider: string;
  };
}
```

### How Pass 1 Uses OCR Data (from worker.ts:997-1034):

```typescript
const pass1Input: Pass1Input = {
  raw_file: {
    file_data: processedImageBase64,  // First page as JPEG
    file_type: 'image/jpeg',
    filename: payload.uploaded_filename,
    file_size: processedImageBuffer.length
  },
  ocr_spatial_data: {
    // NORMALIZED FORMAT from ocrResult.pages
    extracted_text: ocrResult.pages
      .map((p: any) => p.lines.map((l: any) => l.text).join(' '))
      .join(' '),

    spatial_mapping: ocrResult.pages.flatMap((page: any) =>
      page.lines.map((line: any) => ({
        text: line.text,
        page_number: page.page_number,
        bounding_box: {
          x: line.bbox.x,
          y: line.bbox.y,
          width: line.bbox.w,
          height: line.bbox.h
        },
        line_number: line.reading_order,
        word_index: 0,
        confidence: line.confidence
      }))
    ),
    ocr_confidence: /* calculated from lines */,
    processing_time_ms: ocrResult.pages[0]?.processing_time_ms || 0,
    ocr_provider: 'google_vision'
  }
};
```

**Pass 1 uses TWO inputs:**
1. **Primary:** JPEG image (for GPT-4o Vision analysis)
2. **Secondary:** NORMALIZED OCR spatial data (for fallback/validation)

---

## Answer 3: What Format Does Pass 0.5 and Pass 1 Use?

### Pass 0.5 Uses: RECONSTRUCTED GCV-Like Format

**From worker.ts:865-892:**

```typescript
const pass05Input: Pass05Input = {
  shellFileId: payload.shell_file_id,
  patientId: payload.patient_id,

  // RECONSTRUCTED from normalized format to look like GCV
  ocrOutput: {
    fullTextAnnotation: {
      // Concatenated text from normalized pages
      text: ocrResult.pages
        .map((p: any) => p.lines.map((l: any) => l.text).join(' '))
        .join('\n'),

      // Reconstruct GCV-like pages structure from normalized lines
      pages: ocrResult.pages.map((page: any) => ({
        width: page.size.width_px || 1000,
        height: page.size.height_px || 1400,
        confidence: /* calculated from lines */,
        blocks: page.lines.map((line: any) => ({
          boundingBox: {
            vertices: [
              { x: line.bbox.x, y: line.bbox.y },
              { x: line.bbox.x + line.bbox.w, y: line.bbox.y },
              { x: line.bbox.x + line.bbox.w, y: line.bbox.y + line.bbox.h },
              { x: line.bbox.x, y: line.bbox.y + line.bbox.h }
            ]
          },
          confidence: line.confidence,
          paragraphs: []
        }))
      }))
    }
  },
  pageCount: ocrResult.pages.length,
  processingSessionId: processingSessionId
};
```

**Key Point:** Pass 0.5 receives a RECONSTRUCTED GCV-like format, but it's built FROM the normalized format, NOT the original raw GCV response!

### Pass 1 Uses: NORMALIZED Format (as shown above)

---

## The Complete OCR Data Flow

```
┌────────────────────────────────────────────────────────────────┐
│ 1. Google Cloud Vision API Call (worker.ts:111-136)           │
│    Input: Base64 JPEG image                                    │
│    Output: RAW GCV Response (complex nested JSON)              │
└────────────────────────────────────────────────────────────────┘
                              ↓
                    THIS IS WHAT WE WANT TO STORE
                    (in shell_files.ocr_raw_jsonb)
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 2. Normalization (worker.ts:150-198)                          │
│    Transforms: GCV nested structure → Flat line-based format   │
│    Extracts:                                                   │
│    - annotation.text (flat string)                             │
│    - annotation.pages → blocks → paragraphs → words → symbols  │
│    Creates: spatial_mapping array of line-level bboxes        │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 3. Page-Level OCR Construction (worker.ts:661-696)            │
│    Builds normalized page objects:                             │
│    { page_number, size, lines, tables, provider, time_ms }    │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 4. Storage in Supabase Storage (ocr-persistence.ts:64-208)    │
│    Path: patient_id/shell_file_id-ocr/                        │
│    Files: page-1.json, page-2.json, ..., manifest.json        │
│    Format: Normalized format                                   │
└────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────┴─────────┐
                    ↓                   ↓
      ┌──────────────────────┐  ┌──────────────────────┐
      │ Pass 0.5 Input       │  │ Pass 1 Input         │
      │ (Reconstructed GCV)  │  │ (Normalized)         │
      └──────────────────────┘  └──────────────────────┘
```

---

## The Missing Piece: Raw GCV Response

**Current flow:**
1. Call GCV API → Get raw response
2. Process raw response → Create normalized format
3. **DISCARD raw response** ❌
4. Store normalized format in Storage
5. Reconstruct GCV-like format for Pass 0.5

**The problem:**
- We NEVER store the original raw GCV response
- The raw response contains the original text concatenation ORDER
- This is what we need to debug the multi-column reading bug!

**What we need to add:**
```typescript
// In worker.ts after line 136
const result = await response.json() as any;
const annotation = result.responses?.[0]?.fullTextAnnotation;

// NEW: Store the raw GCV response
const rawGCVResponse = result.responses?.[0]; // Full response including fullTextAnnotation

// Later, when updating shell_files (need to add this):
await supabase
  .from('shell_files')
  .update({
    ocr_raw_jsonb: rawGCVResponse,  // Store for debugging
    ocr_confidence: avgConfidence,
    extracted_text: extractedText
  })
  .eq('id', shellFileId);
```

---

## Why We Need Both Formats

### Raw GCV Format Needed For:
1. **Debugging multi-column issues** - See original text order from GCV
2. **OCR provider comparison** - Compare GCV vs AWS Textract responses
3. **Reprocessing with improved algorithms** - Apply new sorting without re-OCR
4. **Quality audits** - Validate our normalization is correct

### Normalized Format Needed For:
1. **Pass 1 entity detection** - Flat structure easier to process
2. **Pass 2 clinical extraction** - Consistent schema across providers
3. **Storage efficiency** - Better JSONB indexing
4. **Query performance** - Don't need to traverse deep nesting

---

## Summary Table

| Format | Size | Structure | Used By | Stored Where | Purpose |
|--------|------|-----------|---------|--------------|---------|
| **Raw GCV** | ~50KB | Deep nested (pages→blocks→paragraphs→words→symbols) | Currently: NOWHERE ❌ | Should be: `shell_files.ocr_raw_jsonb` | Debugging, reprocessing, audits |
| **Normalized** | ~50KB | Flat (pages→lines) | Pass 1, Storage system | Supabase Storage (`patient_id/shell_file_id-ocr/`) | Processing, querying, consistency |
| **Reconstructed GCV-like** | In-memory only | Similar to GCV but from normalized | Pass 0.5 | Not stored (built on-the-fly) | AI prompting |

---

## Action Items

1. ✅ **Database column exists** - `shell_files.ocr_raw_jsonb` added via migration
2. ❌ **Worker code NOT updated** - Need to store raw GCV response after line 136
3. ❌ **Need to re-upload document** - Current upload has null for `ocr_raw_jsonb`
4. ⏳ **Then we can analyze** - Compare raw GCV text order vs. visual layout

---

**Key Insight:** We're building a GCV-like structure for Pass 0.5 FROM our normalized format, not FROM the original GCV response. This means Pass 0.5 never sees the original GCV text order - it sees our RECONSTRUCTED text order (which may or may not match GCV's order depending on our normalization logic).

**The bug:** The multi-column scrambling happens in the ORIGINAL GCV response (`annotation.text`), and we're passing that scrambled text to Pass 0.5 (line 870). The spatial sorting fix needs to happen BEFORE we create the normalized format.
