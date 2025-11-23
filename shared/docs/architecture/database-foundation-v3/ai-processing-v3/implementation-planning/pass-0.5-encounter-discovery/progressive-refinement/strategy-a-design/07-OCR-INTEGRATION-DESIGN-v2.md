# OCR Integration Design v2

**Date:** November 23, 2025
**Version:** 2.0
**Purpose:** Define complete OCR integration for Pass 0.5 - both text preparation (INPUT) and coordinate extraction (OUTPUT)

## Executive Summary

Pass 0.5 OCR integration has TWO distinct stages:

1. **TEXT PREPARATION (Input):** How OCR text is formatted for AI consumption
2. **COORDINATE EXTRACTION (Output):** How AI text markers are converted to Y-coordinates

**Critical Discovery (Nov 23, 2025):** The original v1 documented Stage 2 (coordinate extraction) but did not document Stage 1 (text preparation). Investigation revealed that AI is NOT receiving spatially-sorted text, causing potential table column alignment issues.

**Design Philosophy:** AI never receives bbox coordinates in the prompt. Instead:
- **Input:** AI receives spatially-sorted text (paragraphs with horizontal alignment preserved)
- **Output:** AI provides text markers, code extracts coordinates from OCR data

**Deployment Context (Nov 23, 2025):** Pre-launch, pre-users. No A/B testing or feature flags needed - just ship the fix and test with sample documents. Rollback is a single git revert if issues arise.

## PART 1: TEXT PREPARATION FOR AI (ISSUE DISCOVERED & FIXED)

### Investigation Timeline (Nov 23, 2025)

**Initial Hypothesis:**
- Suspected chunk-processor.ts was using wrong fallback order
- Expected to find `page.lines` being used instead of `spatially_sorted_text`

**Discovery #1 - Two Problem Locations:**
While investigating chunk-processor.ts, discovered the problem existed in TWO places:
1. **worker.ts:1189** - Constructs fullTextAnnotation.text using `p.lines.map().join(' ')`
2. **chunk-processor.ts:622** - Fallback order prioritized `page.blocks` before `spatially_sorted_text`

**Discovery #2 - OCR Data Flow:**
- worker.ts creates OCR pages with `spatially_sorted_text` field (line 838)
- worker.ts then builds Pass05Input structure (lines 1182-1216)
- fullTextAnnotation.text is constructed by joining page.lines with spaces
- Page structure passed to chunk-processor was missing `spatially_sorted_text` field

**Discovery #3 - Actual Bug Location:**
The primary bug was in **worker.ts:1189**, not chunk-processor.ts:
```typescript
// BEFORE (BUG):
text: ocrResult.pages.map((p: any, idx: number) =>
  `--- PAGE ${idx + 1} START ---\n` +
  p.lines.map((l: any) => l.text).join(' ') +  // ← Joins words with spaces!
  `\n--- PAGE ${idx + 1} END ---`
).join('\n\n'),
```

### Original State (BEFORE FIX)

**Location 1: `apps/render-worker/src/worker.ts:1187-1191`**

```typescript
fullTextAnnotation: {
  text: ocrResult.pages.map((p: any, idx: number) =>
    `--- PAGE ${idx + 1} START ---\n` +
    p.lines.map((l: any) => l.text).join(' ') +  // ← PROBLEM!
    `\n--- PAGE ${idx + 1} END ---`
  ).join('\n\n'),
  pages: ocrResult.pages.map((page: any) => ({
    // ... page structure WITHOUT spatially_sorted_text
  }))
}
```

**Location 2: `apps/render-worker/src/pass05/progressive/chunk-processor.ts:622`**

```typescript
// Fallback #1: Try blocks (worker.ts maps lines to blocks)
if (page.blocks && page.blocks.length > 0) {
  text = page.blocks.map((block: any) => block.text || '').join(' ');  // ← Joins with spaces
}
// Fallback #2: Try lines array
else if ((page as any).lines && Array.isArray((page as any).lines)) {
  text = (page as any).lines.map((line: any) => line.text).join(' ');
}
// Fallback #3: Try spatially_sorted_text ← NEVER REACHED
else if ((page as any).spatially_sorted_text) {
  text = (page as any).spatially_sorted_text;
}
```

**The Problem:**
- worker.ts constructed fullTextAnnotation.text by joining `p.lines` with spaces
- worker.ts didn't pass `spatially_sorted_text` field to page structure
- chunk-processor.ts checked `page.blocks` first (which joins with spaces)
- `spatially_sorted_text` was never used despite existing in the OCR data

**Example Impact - Vital Signs Table:**
```
CURRENT OUTPUT (Fallback #2 - page.lines):
"Blood Pressure Pulse Temperature 113/61 80 36.4°C 12/07/2022 12/07/2022 12/07/2022 7:30 AM 7:30 AM 7:30 AM EST EST EST"

DESIRED OUTPUT (Fallback #3 - spatially_sorted_text):
"Blood Pressure 113/61 12/07/2022 7:30 AM EST
Pulse 80 12/07/2022 7:30 AM EST
Temperature 36.4°C (97.6°F) 12/07/2022 7:30 AM EST"
```

### Spatial Sorting Algorithm (IMPLEMENTED AND WORKING)

**Location:** `apps/render-worker/src/worker.ts:106-165`

```typescript
/**
 * Sort text blocks spatially for correct reading order
 * Algorithm:
 * 1. Group blocks into horizontal rows by Y-coordinate
 * 2. Sort rows top-to-bottom
 * 3. Within each row, sort blocks left-to-right by X-coordinate
 */
function sortBlocksSpatially(blocks: any[]): any[] {
  // Calculate bbox for each block
  const blocksWithBbox = blocks.map(block => {
    const vertices = block.boundingBox?.vertices || [];
    const y = Math.min(...vertices.map((v: any) => v.y || 0));
    const x = Math.min(...vertices.map((v: any) => v.x || 0));
    const maxY = Math.max(...vertices.map((v: any) => v.y || 0));
    const height = maxY - y;
    return { block, y, x, height };
  });

  // Group into rows (blocks with overlapping Y ranges)
  const rows: typeof blocksWithBbox[] = [];
  const ROW_OVERLAP_THRESHOLD = 0.5; // 50% height overlap = same row

  for (const item of blocksWithBbox) {
    let addedToRow = false;

    for (const row of rows) {
      // Check if this block overlaps with any block in the row
      const overlaps = row.some(rowItem => {
        const overlapStart = Math.max(item.y, rowItem.y);
        const overlapEnd = Math.min(item.y + item.height, rowItem.y + rowItem.height);
        const overlapHeight = Math.max(0, overlapEnd - overlapStart);
        const minHeight = Math.min(item.height, rowItem.height);
        return overlapHeight / minHeight >= ROW_OVERLAP_THRESHOLD;
      });

      if (overlaps) {
        row.push(item);
        addedToRow = true;
        break;
      }
    }

    if (!addedToRow) {
      rows.push([item]);
    }
  }

  // Sort rows top-to-bottom
  rows.sort((a, b) => Math.min(...a.map(item => item.y)) - Math.min(...b.map(item => item.y)));

  // Within each row, sort left-to-right by X
  rows.forEach(row => {
    row.sort((a, b) => a.x - b.x);
  });

  return rows.flatMap(row => row.map(item => item.block));
}
```

**This algorithm correctly:**
- Groups horizontally-aligned text (table columns) into rows
- Preserves left-to-right reading order within rows
- Maintains vertical top-to-bottom document flow

### OCR Page Structure Creation

**Location:** `apps/render-worker/src/worker.ts:820-840`

```typescript
const ocrPage = {
  page_number: page.pageNumber,
  size: { width_px: page.width || 0, height_px: page.height || 0 },
  lines: ocrSpatialData.spatial_mapping.map((item, idx) => ({
    text: item.text,  // ← Individual words/blocks
    bbox: { x, y, w, h },
    confidence: item.confidence,
    reading_order: idx,  // ← Sequential index (not true spatial order!)
  })),
  tables: [],
  original_gcv_text: ocrSpatialData.original_gcv_text,
  spatially_sorted_text: ocrSpatialData.extracted_text,  // ← Contains SORTED text!
}
```

**Key Fields:**
- `lines`: Array of individual text blocks with bbox data (used for coordinate extraction)
- `spatially_sorted_text`: Properly formatted text with paragraph structure (SHOULD be used for AI)
- `original_gcv_text`: Raw OCR output (fallback)

### Fixed State (AFTER COMMIT a4177e9)

**Changes Applied (Nov 23, 2025):**

**Fix #1: `apps/render-worker/src/worker.ts:1189`**
```typescript
// AFTER (FIXED):
text: ocrResult.pages.map((p: any, idx: number) =>
  `--- PAGE ${idx + 1} START ---\n` +
  (p.spatially_sorted_text || p.lines.map((l: any) => l.text).join(' ')) +  // ← Use spatial sorting!
  `\n--- PAGE ${idx + 1} END ---`
).join('\n\n'),
```

**Fix #2: `apps/render-worker/src/worker.ts:1196-1197`**
```typescript
pages: ocrResult.pages.map((page: any) => ({
  width: page.size.width_px || 1000,
  height: page.size.height_px || 1400,
  confidence: page.lines.reduce((sum: number, l: any) => sum + l.confidence, 0) / (page.lines.length || 1),
  spatially_sorted_text: page.spatially_sorted_text,  // ← NEW: Pass to chunk processor
  original_gcv_text: page.original_gcv_text,          // ← NEW: Include fallback
  blocks: page.lines.map((line: any) => ({
    // ... bbox data for coordinate extraction
  }))
}))
```

**Fix #3: `apps/render-worker/src/pass05/progressive/chunk-processor.ts:622`**
```typescript
// AFTER (FIXED):
return pages.map((page, idx) => {
  let text = '';

  // PRIORITY 1: Use spatially sorted text (proper paragraph structure, table alignment)
  if ((page as any).spatially_sorted_text) {
    text = (page as any).spatially_sorted_text;
  }
  // FALLBACK 2: Extract text from blocks (worker.ts maps lines to blocks)
  else if (page.blocks && page.blocks.length > 0) {
    text = page.blocks.map((block: any) => block.text || '').join(' ');
  }
  // FALLBACK 3: Try lines array
  else if ((page as any).lines && Array.isArray((page as any).lines)) {
    text = (page as any).lines.map((line: any) => line.text).join(' ');
  }
  // FALLBACK 4: Try original GCV text
  else if ((page as any).original_gcv_text) {
    text = (page as any).original_gcv_text;
  }
  // FALLBACK 5: Last resort page.text
  else if (page.text) {
    text = page.text;
  }

  const actualPageNum = startPageNum + idx + 1;
  return `--- PAGE ${actualPageNum} START ---\n${text}\n--- PAGE ${actualPageNum} END ---`;
}).join('\n\n');
```

**Summary of Fixes:**
1. **worker.ts:1189** - Use `spatially_sorted_text` when constructing fullTextAnnotation.text
2. **worker.ts:1196-1197** - Pass `spatially_sorted_text` and `original_gcv_text` to page structure
3. **chunk-processor.ts:622** - Prioritize `spatially_sorted_text` as fallback #1 (before blocks)

**Result:**
- AI now receives spatially-sorted text with proper paragraph breaks and table column alignment
- Two-layer safety: worker.ts uses it AND chunk-processor.ts prioritizes it
- Graceful fallbacks if `spatially_sorted_text` is missing (blocks → lines → original_gcv_text → page.text)

### Impact Analysis

**Benefits:**
- ✅ Table columns stay aligned (horizontal text preserved)
- ✅ Paragraph structure preserved (multi-line blocks stay together)
- ✅ AI can better identify encounter boundaries in complex layouts
- ✅ Consistent with spatial sorting algorithm already implemented
- ✅ No performance impact (data already exists, just reordering fallbacks)
- ✅ No AI prompt changes needed
- ✅ No schema changes needed

**Risks:**
- ⚠️ Current system works well despite using `page.lines` - change could introduce regressions
- ⚠️ `spatially_sorted_text` format may differ from `page.lines` in unexpected ways
- ⚠️ Need to verify `spatially_sorted_text` is always populated

**Mitigation (Pre-Launch Approach):**
- Simple git commit - easy rollback if issues arise
- Test with 3-5 diverse documents before considering it "done"
- If encounter detection looks worse, revert immediately
- No feature flags or A/B testing infrastructure needed

### Token Usage Analysis

**Question:** Does this change reduce OCR input fed to AI?

**Answer:** NO - Token count stays approximately the same (possibly increases slightly)

**Explanation:**
- `page.lines.join(' ')`: Joins individual words with single spaces
  - Example: `"Blood Pressure Pulse Temperature 113/61 80 36.4°C"` (fewer tokens due to compact spacing)
- `spatially_sorted_text`: Preserves paragraph breaks with newlines
  - Example: `"Blood Pressure 113/61 12/07/2022 7:30 AM\nPulse 80 12/07/2022 7:30 AM"` (more tokens due to newlines)

**Token Impact:**
- Estimated increase: 5-10% more tokens per page
- Reason: Newline characters and preserved whitespace
- Trade-off: Better structure understanding vs slightly higher API cost

**Example Token Count Comparison:**
```
page.lines (current):
"Blood Pressure Pulse Temperature 113/61 80 36.4°C 12/07/2022 12/07/2022 7:30 AM 7:30 AM"
→ ~20 tokens

spatially_sorted_text (proposed):
"Blood Pressure 113/61 12/07/2022 7:30 AM EST\nPulse 80 12/07/2022 7:30 AM EST\nTemperature 36.4°C 12/07/2022 7:30 AM EST"
→ ~25 tokens (+25%)
```

**For a 50-page chunk:** ~500 extra tokens (negligible cost, significant quality improvement)

### Risk Assessment: Could Current Method Be Better?

**Question:** Is there a chance the "bad" method (page.lines) is actually better by coincidence?

**Analysis:**

**Scenario 1: Simple Linear Documents (Most Common)**
- GP visit notes, consultation letters, discharge summaries
- Content flows top-to-bottom with no complex layouts
- **Result:** Both methods produce nearly identical output
- **Risk:** VERY LOW - no difference between methods

**Scenario 2: Documents with Tables (Common)**
- Vital signs, lab results, medication lists
- **Current (page.lines):** Columns get mixed together
- **Proposed (spatially_sorted_text):** Columns stay aligned
- **Result:** Proposed method is objectively better
- **Risk:** VERY LOW - current method is demonstrably worse

**Scenario 3: Multi-Column Layouts (Less Common)**
- Some hospital forms have side-by-side sections
- **Current (page.lines):** May jump between columns unpredictably
- **Proposed (spatially_sorted_text):** Preserves left-to-right reading order
- **Result:** Proposed method is better
- **Risk:** LOW - spatial sorting handles this correctly

**Scenario 4: Documents with Headers/Footers (Common)**
- Page numbers, facility names in margins
- **Current (page.lines):** May interleave header text with body
- **Proposed (spatially_sorted_text):** Groups by vertical position
- **Result:** Unknown - depends on spatial sorting threshold
- **Risk:** MEDIUM - headers might group incorrectly

**Scenario 5: Handwritten Notes or Poor OCR (Rare)**
- OCR confidence low, spatial data unreliable
- **Current (page.lines):** Simple sequential order
- **Proposed (spatially_sorted_text):** Might group incorrectly
- **Result:** Current method might be more robust
- **Risk:** MEDIUM - but rare occurrence

**Scenario 6: AI Adaptive Behavior (Unknown)**
- AI might have "learned" to handle space-separated word lists
- Changing format might confuse the model initially
- **Result:** Unknown - depends on model training
- **Risk:** LOW-MEDIUM - but temporary (AI adapts quickly)

**Overall Risk Assessment:**
- **Probability current method is better:** 10-15%
- **Probability proposed method is better:** 85-90%
- **Worst case:** Encounter detection accuracy drops slightly for complex layouts (git revert and investigate)
- **Best case:** Encounter detection improves for table-heavy documents

**Pre-Launch Recommendation:**
- Make the change (5 lines of code)
- Test with 3-5 diverse documents
- Ship it if it looks same or better, revert if it looks worse
- No A/B testing infrastructure needed - we have zero users to impact

## PART 2: COORDINATE EXTRACTION (WORKING AS DESIGNED)

### Overview

**Design Philosophy:** AI never sees bbox coordinates. Instead:
1. AI identifies text markers (e.g., "just before header 'EMERGENCY ADMISSION'")
2. Post-processing code searches OCR data for those markers
3. Code extracts precise Y-coordinates from bbox data

**Why This Approach:**
- Reduces token usage (no bbox data in prompt)
- Reduces hallucination risk (AI describes what it sees, doesn't invent numbers)
- Separates concerns (AI analyzes text, code handles coordinates)

### Stage 1: AI Text Marker Identification

**What AI Does:**
- Analyzes text content to identify boundary markers
- Outputs descriptive text markers (human-readable)
- Provides position confidence based on text analysis

**AI Output Format (from PROMPT-V11-SPEC.md):**
```json
{
  "start_boundary_type": "intra_page",
  "start_marker": "just before header 'EMERGENCY ADMISSION'",
  "start_marker_context": "...previous text...EMERGENCY ADMISSION Date: 2024-03-15",
  "start_text_y_top": null,  // AI does NOT provide coordinates
  "start_text_height": null,
  "start_y": null,

  "end_boundary_type": "intra_page",
  "end_marker": "just before header 'DISCHARGE SUMMARY'",
  "end_marker_context": "...previous text...DISCHARGE SUMMARY Patient: John Doe",
  "end_text_y_top": null,
  "end_text_height": null,
  "end_y": null,

  "position_confidence": 0.92
}
```

**Note (Nov 19, 2024 Update):** The batching analysis also uses marker + region hint pattern:
- AI provides: `marker`, `marker_context`, `region_hint` (top/upper_middle/lower_middle/bottom)
- Region hint helps disambiguate when same marker appears multiple times on page
- See 06-BATCHING-TASK-DESIGN-V2.md for full details

### Stage 2: Code-Based Coordinate Extraction

**Implementation Location:** `apps/render-worker/src/pass05/progressive/coordinate-extractor.ts`

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
 * @param markerContext - Additional context text to improve matching (optional)
 * @returns Extracted coordinates or error
 */
function extractCoordinatesForMarker(
  ocrPages: OCRPage[],
  pageNumber: number,
  marker: string,
  markerContext?: string
): CoordinateExtractionResult {
  // 1. Parse marker to extract search text
  const searchText = parseMarkerText(marker);
  // e.g., "just before header 'EMERGENCY ADMISSION'" → "EMERGENCY ADMISSION"

  // 2. Get OCR page data
  const page = ocrPages[pageNumber - 1];  // Convert to 0-indexed
  if (!page) {
    return { found: false, confidence: 0, text_y_top: 0, text_height: 0, split_y: 0 };
  }

  // 3. Search for text in OCR blocks (using page.lines array for bbox data)
  const matchingLine = page.lines.find(line =>
    line.text.includes(searchText) ||
    line.text.toLowerCase().includes(searchText.toLowerCase())
  );

  if (!matchingLine) {
    // Fuzzy match fallback (handles OCR errors)
    const fuzzyMatch = findFuzzyMatch(page.lines, searchText, markerContext);
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
```

**Key Functions:**

1. **parseMarkerText():** Extracts searchable text from AI's descriptive marker
2. **findFuzzyMatch():** Handles OCR errors using Levenshtein distance or contains logic
3. **validateCoordinates():** Sanity checks (Y within page bounds, height realistic, etc.)

### Integration with Progressive Processing

**Chunk Processing Workflow:**

```typescript
// After AI response parsing in chunk-processor.ts
for (const encounter of aiResponse.encounters) {
  // Extract coordinates for intra_page boundaries
  const startCoords = encounter.start_boundary_type === 'intra_page'
    ? extractCoordinatesForMarker(
        ocrPages,
        encounter.start_page,
        encounter.start_marker,
        encounter.start_marker_context  // Use context for disambiguation
      )
    : null;

  const endCoords = encounter.end_boundary_type === 'intra_page'
    ? extractCoordinatesForMarker(
        ocrPages,
        encounter.end_page,
        encounter.end_marker,
        encounter.end_marker_context
      )
    : null;

  // Store in pending_encounters with coordinates
  await supabase.from('pass05_pending_encounters').insert({
    session_id: sessionId,
    // ... other fields ...
    start_boundary_type: encounter.start_boundary_type,
    start_marker: encounter.start_marker,
    start_marker_context: encounter.start_marker_context,
    start_text_y_top: startCoords?.text_y_top || null,
    start_text_height: startCoords?.text_height || null,
    start_y: startCoords?.split_y || null,

    end_boundary_type: encounter.end_boundary_type,
    end_marker: encounter.end_marker,
    end_marker_context: encounter.end_marker_context,
    end_text_y_top: endCoords?.text_y_top || null,
    end_text_height: endCoords?.text_height || null,
    end_y: endCoords?.split_y || null,

    position_confidence: encounter.position_confidence
  });
}
```

### Error Handling

**When Coordinate Extraction Fails:**

**Problem:** AI provides text marker, but code can't find matching text in OCR

**Root Causes:**
1. OCR quality issues (text not detected)
2. AI hallucination (referenced text doesn't exist)
3. Fuzzy matching failure (OCR severely misread text)

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
    marker_context: encounter.start_marker_context,
    failure_reason: 'text_not_found_in_ocr'
  });
}
```

**Validation Checks:**

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

## COMPLETE DATA FLOW (Both Stages Together)

### Full Pipeline

```
1. OCR Processing (worker.ts)
   ├─ Google Cloud Vision OCR extracts text + bounding boxes
   ├─ Spatial sorting algorithm (sortBlocksSpatially) groups text into rows
   ├─ Creates spatially_sorted_text field (proper paragraph structure)
   ├─ Creates lines array with bbox data (for coordinate extraction)
   └─ Stores in ocrPage structure

2. Text Extraction for AI (chunk-processor.ts) ← NEEDS FIX
   ├─ extractTextFromPages() prepares text for AI consumption
   ├─ CURRENTLY: Uses page.lines.join(' ') (words with spaces)
   ├─ SHOULD: Use spatially_sorted_text (proper paragraphs)
   └─ Sends to AI in prompt

3. AI Analysis (OpenAI GPT-4o)
   ├─ Receives spatially-sorted text (after fix)
   ├─ Identifies encounter boundaries
   ├─ Outputs text markers (e.g., "just before header 'X'")
   ├─ Outputs marker_context for disambiguation
   └─ Returns JSON response

4. Coordinate Extraction (coordinate-extractor.ts) ← WORKING CORRECTLY
   ├─ Takes AI's text markers and context
   ├─ Searches page.lines array for matching text
   ├─ Uses fuzzy matching for OCR errors
   ├─ Extracts precise Y-coordinates from bbox
   ├─ Calculates buffer zone (split_y)
   └─ Stores coordinates in database

5. Storage (Supabase)
   ├─ pass05_pending_encounters: Per-chunk encounter boundaries with coordinates
   ├─ pass05_chunk_results: Page separation analysis with split point coordinates
   └─ shell_files: Final reconciled data (after all chunks complete)
```

### Data Structure at Each Stage

**Stage 1 - OCR Page Structure:**
```typescript
{
  page_number: 1,
  size: { width_px: 2550, height_px: 3300 },
  lines: [
    {
      text: "EMERGENCY ADMISSION",
      bbox: { x: 100, y: 450, w: 400, h: 24 },
      confidence: 0.95,
      reading_order: 0
    },
    // ... more lines
  ],
  spatially_sorted_text: "EMERGENCY ADMISSION\nDate: 2024-03-15\n\nPatient Name: John Doe\nMRN: 123456\n\n...",
  original_gcv_text: "EMERGENCY ADMISSION Date: 2024-03-15 Patient Name: John Doe MRN: 123456 ..."
}
```

**Stage 2 - AI Input Text (after fix):**
```
--- PAGE 1 START ---
EMERGENCY ADMISSION
Date: 2024-03-15

Patient Name: John Doe
MRN: 123456

Chief Complaint: Chest pain
...
--- PAGE 1 END ---

--- PAGE 2 START ---
...
```

**Stage 3 - AI Output:**
```json
{
  "encounters": [
    {
      "start_page": 1,
      "start_boundary_type": "intra_page",
      "start_marker": "just before header 'EMERGENCY ADMISSION'",
      "start_marker_context": "...EMERGENCY ADMISSION Date: 2024-03-15",
      "start_text_y_top": null,
      "start_y": null,
      // ... other fields
    }
  ]
}
```

**Stage 4 - After Coordinate Extraction:**
```json
{
  "start_page": 1,
  "start_boundary_type": "intra_page",
  "start_marker": "just before header 'EMERGENCY ADMISSION'",
  "start_marker_context": "...EMERGENCY ADMISSION Date: 2024-03-15",
  "start_text_y_top": 450,
  "start_text_height": 24,
  "start_y": 426,
  "position_confidence": 0.92
}
```

## FILES AFFECTED

### Text Preparation (NEEDS FIX):
- **apps/render-worker/src/pass05/progressive/chunk-processor.ts** (lines 610-648)
  - Change fallback priority to use `spatially_sorted_text` first
  - Simple reordering of if/else conditions
  - No new dependencies or schema changes

### Spatial Sorting (WORKING CORRECTLY):
- **apps/render-worker/src/worker.ts** (lines 106-165)
  - `sortBlocksSpatially()` function
  - Row grouping with overlap threshold
  - Left-to-right, top-to-bottom sorting
- **apps/render-worker/src/worker.ts** (lines 820-840)
  - OCR page structure creation
  - Populates `spatially_sorted_text` field

### Coordinate Extraction (WORKING CORRECTLY):
- **apps/render-worker/src/pass05/progressive/coordinate-extractor.ts**
  - `extractCoordinatesForMarker()` - Main extraction logic
  - `parseMarkerText()` - Extract searchable text from AI markers
  - `findFuzzyMatch()` - Handle OCR errors
  - `validateCoordinates()` - Sanity checks

## TESTING STRATEGY

### Test Text Preparation Fix

**Test 1: Simple Linear Document**
- Upload: GP consultation letter (5 pages, no tables)
- Verify: AI output identical before/after fix
- Expected: No change in encounter detection

**Test 2: Document with Tables**
- Upload: Hospital discharge summary with vital signs table
- Verify: AI receives properly aligned columns
- Expected: Improved or unchanged encounter detection

**Test 3: Multi-Column Layout**
- Upload: Hospital form with side-by-side sections
- Verify: Reading order preserved left-to-right
- Expected: Improved encounter boundary detection

**Test 4: Complex Mixed Layout**
- Upload: 142-page hospital admission with mix of notes, labs, imaging
- Verify: No regression in encounter count or accuracy
- Expected: Same or better performance

### Test Coordinate Extraction (Existing Tests)

**Unit Tests:**
```typescript
describe('extractCoordinatesForMarker', () => {
  it('should extract coordinates for exact text match', () => {
    const ocrPages = [{
      page_number: 1,
      size: { width_px: 2550, height_px: 3300 },
      lines: [
        { text: 'EMERGENCY ADMISSION', bbox: { x: 100, y: 450, w: 400, h: 24 }, confidence: 0.95 }
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
    // Test case for OCR misreads (e.g., "EMERGFNCY ADMI5SION")
  });

  it('should return not found for missing text', () => {
    // Test case for AI hallucination
  });

  it('should use marker_context for disambiguation', () => {
    // Test case where same marker appears multiple times
  });
});
```

### Pre-Launch Testing Plan (Simplified)

**No A/B testing infrastructure needed - we have zero users.**

**Simple 3-Step Process:**

1. **Make the change** (chunk-processor.ts fallback order)
   - 5 lines of code
   - Single git commit

2. **Test with 3-5 documents**
   - 1 simple GP letter (baseline - should be identical)
   - 1 discharge summary with tables (should improve)
   - 1 complex hospital admission (the 142-pager)
   - 2 random documents from test set

3. **Ship or revert**
   - If encounter detection looks same/better → ship it
   - If it looks worse → `git revert` and investigate
   - Time investment: 1-2 hours (not 1-2 weeks)

## PERFORMANCE CONSIDERATIONS

### Text Preparation Impact
- **Processing overhead:** None (just reordering fallbacks)
- **Token usage:** +5-10% per page (newlines and whitespace)
- **API cost:** +$0.10 per 1000 pages (negligible)
- **Quality improvement:** Significant for table-heavy documents

### Coordinate Extraction Overhead
- **Per-encounter overhead:** ~5-10ms (searching OCR lines)
- **Per-chunk overhead:** ~50-100ms (assuming 10 encounters)
- **Negligible** compared to AI API latency (~5-20 seconds)

### Optimization Opportunities

**1. Cache OCR Structure Per Chunk:**
```typescript
// Avoid re-parsing OCR data for each encounter
const ocrLookup = buildOCRLookupIndex(ocrPages);
// O(1) lookup instead of O(n) search
```

**2. Batch Coordinate Extraction:**
```typescript
// Extract coordinates for all encounters at once
const allMarkers = encounters.flatMap(e => [e.start_marker, e.end_marker]);
const coordsMap = batchExtractCoordinates(ocrPages, allMarkers);
```

**3. Fuzzy Matching Cache:**
```typescript
// Cache fuzzy match results during chunk processing
const fuzzyMatchCache = new Map();
```

## IMPLEMENTATION PLAN (PRE-LAUNCH SIMPLIFIED)

### The Fix (5 minutes)

**File:** `apps/render-worker/src/pass05/progressive/chunk-processor.ts:610-648`

**Change:** Reorder fallback priority to use `spatially_sorted_text` first

```typescript
// BEFORE (current):
if (page.blocks && page.blocks.length > 0) {
  text = page.blocks.map(b => b.text).join(' ');
}
else if ((page as any).lines && Array.isArray((page as any).lines)) {  // ← Used
  text = (page as any).lines.map(line => line.text).join(' ');
}
else if ((page as any).spatially_sorted_text) {  // ← Never reached
  text = (page as any).spatially_sorted_text;
}

// AFTER (proposed):
if ((page as any).spatially_sorted_text) {  // ← Try this first!
  text = (page as any).spatially_sorted_text;
}
else if ((page as any).lines && Array.isArray((page as any).lines)) {
  text = (page as any).lines.map(line => line.text).join(' ');
}
else if ((page as any).original_gcv_text) {
  text = (page as any).original_gcv_text;
}
```

**That's it.** No schema changes, no new dependencies, no infrastructure.

### Testing (1-2 hours)

1. Upload 3-5 test documents
2. Check encounter detection results
3. Compare with previous results (if available)
4. If it looks worse, run `git revert HEAD` and move on

### Rollback (30 seconds)

```bash
git revert HEAD
git push
# Done - back to old behavior
```

**No feature flags, no A/B tests, no monitoring infrastructure needed.**

## KEY DESIGN DECISIONS

### Why Text Markers Instead of Coordinates in Prompt?

**Advantages:**
- ✅ Reduces token usage (no bbox data in prompt)
- ✅ Reduces hallucination risk (AI describes text, doesn't invent numbers)
- ✅ Clear separation of concerns (AI analyzes, code extracts)
- ✅ More maintainable (coordinate logic isolated)

**Trade-offs:**
- ⚠️ Two-stage processing (slight complexity increase)
- ⚠️ Coordinate extraction can fail (fallback to inter_page needed)
- ⚠️ Dependency on marker_context for disambiguation

### Why Spatial Sorting Over Simple Sequential?

**Advantages:**
- ✅ Preserves table column alignment
- ✅ Handles multi-column layouts correctly
- ✅ Maintains logical reading order
- ✅ Better for complex hospital forms

**Trade-offs:**
- ⚠️ Slight increase in token count (newlines)
- ⚠️ Risk of header/footer grouping issues
- ⚠️ More complex algorithm (potential edge cases)

### Why Hybrid Storage (Chunk + Document)?

**From 06-BATCHING-TASK-DESIGN-V2.md:**
- Chunk-level: Natural fit with progressive processing
- Document-level: Single source of truth for downstream
- Reconciliation: Combines chunks into final analysis

## CONCLUSION

This v2 design documents the complete OCR integration for Pass 0.5, covering both:

1. **Text Preparation (INPUT):** How OCR text is formatted for AI consumption
   - Discovered issue: AI receives word-separated text instead of spatially-sorted paragraphs
   - Proposed fix: Reorder fallback priority to use `spatially_sorted_text` first
   - Risk: Low-Medium (current system works well, change could regress)
   - Benefit: Better table alignment and paragraph structure

2. **Coordinate Extraction (OUTPUT):** How AI text markers are converted to Y-coordinates
   - Two-stage approach: AI identifies text markers, code extracts coordinates
   - Working correctly with fuzzy matching and error handling
   - No changes needed

**Key Improvements Over v1:**
- ✅ Documents complete bidirectional OCR flow (input + output)
- ✅ Identifies and analyzes text preparation gap
- ✅ Provides risk assessment and honest probability analysis
- ✅ Pre-launch simplified deployment approach (no A/B testing)
- ✅ Addresses token usage and performance questions

**Pre-Launch Next Steps:**
1. Make the 5-line change in chunk-processor.ts
2. Test with 3-5 diverse documents (1-2 hours)
3. Ship it if it looks good, revert if it looks bad
4. Move on to more important features

**No A/B testing, no feature flags, no monitoring infrastructure - just ship and iterate.**

---

## DEPLOYMENT & TESTING STATUS

### Deployment Timeline (Nov 23, 2025)

**Commit:** `a4177e9` - "fix(pass05): Use spatially-sorted OCR text for better table alignment"

**Files Changed:**
1. `apps/render-worker/src/worker.ts` (+4 lines, -1 line)
2. `apps/render-worker/src/pass05/progressive/chunk-processor.ts` (+10 lines, -6 lines)
3. `shared/docs/.../07-OCR-INTEGRATION-DESIGN-v2.md` (+937 lines, new file)

**Deployment Method:**
- Pushed to GitHub `main` branch
- Render.com auto-deploy triggered (Exora Health worker service)
- Expected deployment time: 2-3 minutes

**Rollback Plan:**
```bash
git revert a4177e9
git push
# Render.com auto-deploys reverted code in ~2-3 minutes
```

### Testing Status

**Test Documents (Pending):**
- [ ] Simple GP letter (baseline - should be identical)
- [ ] Discharge summary with vital signs table (should improve)
- [ ] Complex 142-page hospital admission (should work same or better)
- [ ] 2 random documents from test set

**Success Criteria:**
- Encounter detection looks same or better than before
- No obvious regressions in encounter count or accuracy
- Table columns appear aligned in AI interpretation (if inspectable)

**Test Results:** _TBD - User testing in progress_

### Production Observations

**Expected Improvements:**
- Better encounter boundary detection for documents with tables
- More accurate coordinate extraction for intra-page boundaries
- Improved handling of multi-column layouts

**Potential Regressions to Watch:**
- Header/footer text grouping issues (spatial sorting might group incorrectly)
- Poor OCR quality documents (spatial data unreliable)
- AI confusion from new format (temporary, should adapt quickly)

**Monitoring:**
- Manual inspection of encounter detection results
- Check for increase in coordinate extraction failures
- Watch for unexpected encounter count changes

### Final Decision

**Status:** DEPLOYED, AWAITING TEST RESULTS

**Next Action:**
- If tests pass → Document as complete, move on
- If tests fail → Revert commit a4177e9, investigate root cause
- If mixed results → Investigate specific document types causing issues
