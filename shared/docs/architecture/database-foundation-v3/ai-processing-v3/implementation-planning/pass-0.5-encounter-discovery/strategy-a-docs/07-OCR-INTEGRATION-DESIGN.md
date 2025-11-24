# Pass 0.5 OCR Integration Design

**Date:** November 15, 2024
**Version:** 1.0
**Purpose:** Define how Pass 0.5 accesses OCR bounding box data for precise position tracking

## Executive Summary

Pass 0.5 requires OCR bounding box coordinates to implement the inter_page/intra_page position tracking system defined in TABLE-DESIGN-V3.md and BATCHING-TASK-DESIGN-V2.md. This document clarifies:

1. **What OCR data is available** - Format and structure from Google Cloud Vision
2. **How AI receives OCR data** - Integration with AI prompt and response
3. **Coordinate extraction requirements** - What AI must provide for position tracking
4. **Implementation approach** - Two-stage system (AI identifies, code validates)

## Current OCR Infrastructure

### Data Source: Google Cloud Vision OCR

**Location:** `apps/render-worker/src/utils/ocr-persistence.ts`

**Storage Format:**
```typescript
interface OCRPage {
  page_number: number;
  size: { width_px: number; height_px: number };
  lines: Array<{
    text: string;
    bbox: { x: number; y: number; w: number; h: number };
    bbox_norm: { x: number; y: number; w: number; h: number };
    confidence: number;
    reading_order: number;
  }>;
  tables: Array<{
    bbox: { x: number; y: number; w: number; h: number };
    bbox_norm: { x: number; y: number; w: number; h: number };
    rows: number;
    columns: number;
    confidence: number;
  }>;
  provider: string;
  processing_time_ms: number;
}
```

**Key Characteristics:**
- Stored in Supabase Storage as JSON artifacts (per-page files)
- Includes both pixel coordinates (`bbox`) and normalized coordinates (`bbox_norm`)
- Line-level granularity with reading order
- Page dimensions available (`size.width_px`, `size.height_px`)

### Current Pass 0.5 Integration

**How OCR Data Reaches Pass 0.5:**

1. **Worker loads OCR artifacts** (`worker.ts:1182-1214`):
   ```typescript
   const pass05Input: Pass05Input = {
     shellFileId: payload.shell_file_id,
     patientId: payload.patient_id,
     ocrOutput: {
       fullTextAnnotation: {
         text: ocrResult.pages.map(/* text extraction */),
         pages: ocrResult.pages.map((page: any) => ({
           width: page.size.width_px || 1000,
           height: page.size.height_px || 1400,
           confidence: /* avg line confidence */,
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
             text: line.text,
             paragraphs: []
           }))
         }))
       }
     },
     pageCount: ocrResult.pages.length,
     processingSessionId: processingSessionId
   };
   ```

2. **Data transformation:**
   - Raw OCR: `lines` array with `bbox: { x, y, w, h }`
   - Pass 0.5 input: `blocks` array with `boundingBox.vertices` (4 corners)
   - Text extracted separately for AI prompt

**Current Problem:**
- AI only receives extracted TEXT (no bbox data)
- Position tracking requires Y-coordinates for intra-page boundaries
- No mechanism for AI to request/receive bbox coordinates

## Design Solution: Two-Stage Approach

### Stage 1: AI Text Marker Identification (Prompt Output)

**What AI Does:**
- Analyzes text content to identify boundary markers
- Outputs descriptive text markers (human-readable)
- Provides position confidence based on text analysis

**AI Output Format (from PROMPT-V11-SPEC.md):**
```json
{
  "start_boundary_type": "intra_page",
  "start_marker": "just before header 'EMERGENCY ADMISSION'",
  "start_text_y_top": null,  // AI does NOT provide coordinates
  "start_text_height": null,
  "start_y": null,

  "end_boundary_type": "intra_page",
  "end_marker": "just before header 'DISCHARGE SUMMARY'",
  "end_text_y_top": null,  // AI does NOT provide coordinates
  "end_text_height": null,
  "end_y": null,

  "position_confidence": 0.92
}
```

**Why AI Doesn't Provide Coordinates:**
1. AI only receives text content (no bbox data currently)
2. Text markers are sufficient for code-based lookup
3. Keeps prompt focused on clinical analysis
4. Reduces hallucination risk (AI can't invent coordinates)

### Stage 2: Code-Based Coordinate Extraction (Post-Processing)

**What Code Does:**
- Takes AI's text marker (e.g., "just before header 'EMERGENCY ADMISSION'")
- Searches OCR blocks for matching text
- Extracts precise bbox coordinates
- Calculates buffer zone for split line

**Implementation Location:** `apps/render-worker/src/pass05/progressive/coordinate-extractor.ts` (NEW FILE)

```typescript
interface CoordinateExtractionResult {
  text_y_top: number;
  text_height: number;
  split_y: number;  // text_y_top - text_height (buffer zone)
  found: boolean;
  confidence: number;
}

/**
 * Extract bbox coordinates for a text marker on a specific page
 *
 * @param ocrPages - Full OCR data with bbox information
 * @param pageNumber - Page number (1-indexed)
 * @param marker - Text marker from AI (e.g., "just before header 'EMERGENCY ADMISSION'")
 * @returns Extracted coordinates or error
 */
function extractCoordinatesForMarker(
  ocrPages: OCRPage[],
  pageNumber: number,
  marker: string
): CoordinateExtractionResult {
  // 1. Parse marker to extract search text
  const searchText = parseMarkerText(marker);
  // e.g., "just before header 'EMERGENCY ADMISSION'" → "EMERGENCY ADMISSION"

  // 2. Get OCR page data
  const page = ocrPages[pageNumber - 1];  // Convert to 0-indexed
  if (!page) {
    return { found: false, confidence: 0, text_y_top: 0, text_height: 0, split_y: 0 };
  }

  // 3. Search for text in OCR blocks
  const matchingLine = page.lines.find(line =>
    line.text.includes(searchText) ||
    line.text.toLowerCase().includes(searchText.toLowerCase())
  );

  if (!matchingLine) {
    // Fuzzy match fallback
    const fuzzyMatch = findFuzzyMatch(page.lines, searchText);
    if (fuzzyMatch) {
      return {
        text_y_top: fuzzyMatch.bbox.y,
        text_height: fuzzyMatch.bbox.h,
        split_y: fuzzyMatch.bbox.y - fuzzyMatch.bbox.h,
        found: true,
        confidence: fuzzyMatch.confidence * 0.8  // Reduced for fuzzy match
      };
    }

    return { found: false, confidence: 0, text_y_top: 0, text_height: 0, split_y: 0 };
  }

  // 4. Extract coordinates and calculate buffer
  return {
    text_y_top: matchingLine.bbox.y,
    text_height: matchingLine.bbox.h,
    split_y: matchingLine.bbox.y - matchingLine.bbox.h,  // Buffer zone
    found: true,
    confidence: matchingLine.confidence
  };
}

/**
 * Parse AI marker text to extract searchable text
 * Handles formats like:
 * - "just before header 'EMERGENCY ADMISSION'" → "EMERGENCY ADMISSION"
 * - "before 'Day 2 Progress Notes'" → "Day 2 Progress Notes"
 */
function parseMarkerText(marker: string): string {
  // Extract text between quotes
  const quotedMatch = marker.match(/'([^']+)'/);
  if (quotedMatch) {
    return quotedMatch[1];
  }

  // Extract text after "header" keyword
  const headerMatch = marker.match(/header\s+(.+)/i);
  if (headerMatch) {
    return headerMatch[1].trim();
  }

  // Fallback: return entire marker
  return marker;
}

/**
 * Fuzzy text matching for OCR errors
 */
function findFuzzyMatch(
  lines: Array<{ text: string; bbox: any; confidence: number }>,
  searchText: string
): { bbox: any; confidence: number } | null {
  const normalized = searchText.toLowerCase().replace(/[^\w\s]/g, '');

  for (const line of lines) {
    const lineNormalized = line.text.toLowerCase().replace(/[^\w\s]/g, '');

    // Check if normalized text is similar (Levenshtein distance or simple contains)
    if (lineNormalized.includes(normalized) || normalized.includes(lineNormalized)) {
      return { bbox: line.bbox, confidence: line.confidence };
    }
  }

  return null;
}
```

## Integration with Progressive Processing

### Chunk Processing Workflow

**Current Flow (V10):**
```
1. Load OCR for chunk → 2. Extract text → 3. Send to AI → 4. Parse response → 5. Store in pending_encounters
```

**New Flow (V11 with coordinate extraction):**
```
1. Load OCR for chunk
2. Extract text
3. Send to AI (text only)
4. Parse AI response (gets text markers)
5. Extract coordinates (code-based lookup)  ← NEW STEP
6. Store in pending_encounters (with coordinates)
```

**Implementation Location:** `apps/render-worker/src/pass05/progressive/chunk-processor.ts`

```typescript
// After AI response parsing
for (const encounter of aiResponse.encounters) {
  // Extract coordinates for intra_page boundaries
  const startCoords = encounter.start_boundary_type === 'intra_page'
    ? extractCoordinatesForMarker(
        ocrPages,
        encounter.start_page,
        encounter.start_marker
      )
    : null;

  const endCoords = encounter.end_boundary_type === 'intra_page'
    ? extractCoordinatesForMarker(
        ocrPages,
        encounter.end_page,
        encounter.end_marker
      )
    : null;

  // Store in pending_encounters with coordinates
  await supabase.from('pass05_pending_encounters').insert({
    session_id: sessionId,
    // ... other fields ...
    start_boundary_type: encounter.start_boundary_type,
    start_marker: encounter.start_marker,
    start_text_y_top: startCoords?.text_y_top || null,
    start_text_height: startCoords?.text_height || null,
    start_y: startCoords?.split_y || null,

    end_boundary_type: encounter.end_boundary_type,
    end_marker: encounter.end_marker,
    end_text_y_top: endCoords?.text_y_top || null,
    end_text_height: endCoords?.text_height || null,
    end_y: endCoords?.split_y || null,

    position_confidence: encounter.position_confidence
  });
}
```

### Batching Analysis Workflow

Similar two-stage approach for batching split points:

```typescript
// Extract coordinates for batching split points
for (const splitPoint of aiResponse.page_separation_analysis.safe_split_points) {
  if (splitPoint.split_location === 'intra_page') {
    const coords = extractCoordinatesForMarker(
      ocrPages,
      splitPoint.page,
      splitPoint.marker
    );

    splitPoint.text_y_top = coords.text_y_top;
    splitPoint.text_height = coords.text_height;
    splitPoint.split_y = coords.split_y;
  }
}

// Store in pass05_chunk_results
await supabase.from('pass05_chunk_results').update({
  page_separation_analysis: aiResponse.page_separation_analysis
}).eq('id', chunkResultId);
```

## Error Handling

### When Coordinate Extraction Fails

**Problem:** AI provides text marker, but code can't find matching text in OCR

**Root Causes:**
1. OCR quality issues (text not detected)
2. AI hallucination (referenced text doesn't exist)
3. Fuzzy matching failure (OCR misread text)

**Fallback Strategy:**

```typescript
if (!startCoords.found && encounter.start_boundary_type === 'intra_page') {
  console.warn(`Could not find coordinates for start marker: ${encounter.start_marker}`);

  // FALLBACK: Degrade to inter_page boundary
  encounter.start_boundary_type = 'inter_page';
  encounter.start_marker = 'coordinate extraction failed, using page boundary';
  encounter.start_text_y_top = null;
  encounter.start_text_height = null;
  encounter.start_y = null;

  // Reduce confidence slightly
  encounter.position_confidence *= 0.9;

  // Log for manual review
  await supabase.from('pass05_coordinate_extraction_failures').insert({
    session_id: sessionId,
    chunk_number: chunkNumber,
    page: encounter.start_page,
    marker: encounter.start_marker,
    failure_reason: 'text_not_found_in_ocr'
  });
}
```

### Validation Checks

**Before storing coordinates:**

```typescript
function validateCoordinates(
  coords: CoordinateExtractionResult,
  page: OCRPage
): boolean {
  // Sanity checks
  if (coords.text_y_top < 0 || coords.text_y_top > page.size.height_px) {
    console.error('Invalid Y coordinate: out of page bounds');
    return false;
  }

  if (coords.text_height < 0 || coords.text_height > 500) {
    console.error('Invalid text height: unrealistic value');
    return false;
  }

  if (coords.split_y < 0) {
    console.error('Invalid split Y: negative value');
    return false;
  }

  return true;
}
```

## Testing Strategy

### Unit Tests

**File:** `apps/render-worker/src/pass05/progressive/__tests__/coordinate-extractor.test.ts`

```typescript
describe('extractCoordinatesForMarker', () => {
  it('should extract coordinates for exact text match', () => {
    const ocrPages = [{
      page_number: 1,
      size: { width_px: 2550, height_px: 3300 },
      lines: [
        { text: 'EMERGENCY ADMISSION', bbox: { x: 100, y: 450, w: 400, h: 24 }, confidence: 0.95 },
        { text: 'Patient Name: John Doe', bbox: { x: 100, y: 500, w: 300, h: 20 }, confidence: 0.92 }
      ]
    }];

    const result = extractCoordinatesForMarker(
      ocrPages,
      1,
      "just before header 'EMERGENCY ADMISSION'"
    );

    expect(result.found).toBe(true);
    expect(result.text_y_top).toBe(450);
    expect(result.text_height).toBe(24);
    expect(result.split_y).toBe(426);  // 450 - 24
  });

  it('should handle fuzzy match for OCR errors', () => {
    const ocrPages = [{
      page_number: 1,
      size: { width_px: 2550, height_px: 3300 },
      lines: [
        { text: 'EMERGFNCY ADMI5SION', bbox: { x: 100, y: 450, w: 400, h: 24 }, confidence: 0.85 }
      ]
    }];

    const result = extractCoordinatesForMarker(
      ocrPages,
      1,
      "just before header 'EMERGENCY ADMISSION'"
    );

    expect(result.found).toBe(true);
    expect(result.confidence).toBeLessThan(0.85);  // Reduced for fuzzy match
  });

  it('should return not found for missing text', () => {
    const ocrPages = [{
      page_number: 1,
      size: { width_px: 2550, height_px: 3300 },
      lines: [
        { text: 'Some other text', bbox: { x: 100, y: 450, w: 400, h: 24 }, confidence: 0.95 }
      ]
    }];

    const result = extractCoordinatesForMarker(
      ocrPages,
      1,
      "just before header 'EMERGENCY ADMISSION'"
    );

    expect(result.found).toBe(false);
  });
});
```

### Integration Tests

**Test full chunk processing with coordinate extraction:**

```typescript
describe('Chunk Processor with Coordinate Extraction', () => {
  it('should extract coordinates for intra-page encounters', async () => {
    const mockOCR = {
      pages: [/* mock OCR data with known text + bbox */]
    };

    const mockAIResponse = {
      encounters: [{
        start_boundary_type: 'intra_page',
        start_marker: "just before header 'EMERGENCY ADMISSION'",
        // ... other fields
      }]
    };

    const result = await processChunk(mockOCR, mockAIResponse);

    expect(result.encounters[0].start_text_y_top).toBeGreaterThan(0);
    expect(result.encounters[0].start_y).toBeLessThan(result.encounters[0].start_text_y_top);
  });
});
```

## Performance Considerations

### Coordinate Extraction Overhead

**Expected Impact:**
- **Per-encounter overhead:** ~5-10ms (searching OCR lines)
- **Per-chunk overhead:** ~50-100ms (assuming 10 encounters)
- **Negligible** compared to AI API latency (~5-20 seconds)

### Optimization Opportunities

1. **Cache parsed OCR structure** per chunk (avoid re-parsing)
2. **Index OCR lines by text** for faster lookups
3. **Batch coordinate extraction** for all encounters/split points

```typescript
// Optimized batch extraction
function batchExtractCoordinates(
  ocrPages: OCRPage[],
  markers: Array<{ page: number; marker: string }>
): Map<string, CoordinateExtractionResult> {
  const results = new Map();

  // Group markers by page
  const markersByPage = groupBy(markers, m => m.page);

  // Process each page once
  for (const [page, pageMarkers] of markersByPage) {
    const pageData = ocrPages[page - 1];

    for (const { marker } of pageMarkers) {
      const coords = extractCoordinatesForMarker(ocrPages, page, marker);
      results.set(`${page}:${marker}`, coords);
    }
  }

  return results;
}
```

## Migration Path

### Phase 1: Add Coordinate Extraction (Current Priority)

1. Create `coordinate-extractor.ts` module
2. Update chunk processor to call extractor
3. Update reconciler to preserve coordinates
4. Add validation + error handling
5. Write unit tests

### Phase 2: AI Prompt Refinement (Future)

**Option to send OCR bbox data to AI directly:**

If coordinate extraction failures are common, we could:
1. Include OCR bbox data in AI prompt (as JSON)
2. AI outputs coordinates directly (instead of text markers)
3. Code validates AI-provided coordinates

**Trade-offs:**
- ✅ More accurate (AI sees coordinates)
- ❌ Much larger prompt (token cost)
- ❌ Higher hallucination risk (AI might invent coordinates)
- ❌ More complex prompt

**Recommendation:** Start with text markers + code extraction, only add bbox to prompt if failure rate > 10%

## Conclusion

The two-stage OCR integration approach provides:

1. **Clear separation of concerns:** AI analyzes text, code extracts coordinates
2. **Reduced hallucination risk:** AI describes what it sees, doesn't invent numbers
3. **Robust error handling:** Fallback to inter_page boundaries when extraction fails
4. **Testable components:** Text parsing and coordinate extraction are separate
5. **Performance efficient:** Minimal overhead compared to AI API latency

**Next Steps:**
1. Implement `coordinate-extractor.ts` module
2. Update chunk processor integration
3. Add comprehensive tests
4. Monitor coordinate extraction success rate
5. Iterate based on real-world performance

**Blockers Resolved:**
- ✅ Clarified what OCR data is available
- ✅ Defined AI vs code responsibilities
- ✅ Specified coordinate extraction algorithm
- ✅ Designed error handling strategy
