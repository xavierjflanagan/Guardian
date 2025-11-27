# OCR Coordinate Enhancement Implementation Plan

**Date Created:** 2025-11-26
**Last Updated:** 2025-11-27
**Status:** IN PROGRESS - Phase 1 Step 1.4 (Testing)
**Priority:** HIGH - Blocks accurate clinical entity extraction

---

## File Reference Corrections

**Verified against actual codebase (2025-11-26):**

| Plan Reference | Actual File | Purpose |
|----------------|-------------|---------|
| `processor.ts` | `chunk-processor.ts` | AI prompt building and chunk processing |
| `processor.ts` | `post-processor.ts` | AI response parsing and field cleanup |
| `reconciliation.ts` | `pending-reconciler.ts` | Boundary matching during reconciliation |
| Location TBD | `utils/ocr-persistence.ts` | OCR artifact preparation and storage |

**All file references in this plan have been updated to match the actual codebase.**

### Files Affected by This Change

**Cross-referenced with:** `pass-0.5-encounter-discovery/strategy-a-docs/02-SCRIPT-ANALYSIS-V3.md`

**Modified:**
- `progressive/chunk-processor.ts` - Generate enhanced OCR format for AI input (lines 135-148 in 02-SCRIPT-ANALYSIS-V3.md)
- `progressive/post-processor.ts` - Parse Y-coordinates directly from AI (simplified) (lines 71 in directory structure)
- `progressive/pending-reconciler.ts` - Use Y-coordinates for boundary matching (lines 149-156 in 02-SCRIPT-ANALYSIS-V3.md)
- `utils/ocr-persistence.ts` - Store enhanced OCR format with X-coordinates

**Also Needs Updates (Infrastructure):**
- `aiPrompts.v11.ts` → Create `aiPrompts.v12.ts` - Update prompt to use Y-coordinates directly (lines 187-289 in 02-SCRIPT-ANALYSIS-V3.md)
- `progressive/database.ts` - Encounter insertion logic (lines 1670+ in 02-SCRIPT-ANALYSIS-V3.md)
- `progressive/handoff-builder.ts` - Cascade context building (lines 1608+ in 02-SCRIPT-ANALYSIS-V3.md)

**Deprecated (but kept for backward compatibility):**
- `progressive/coordinate-extractor.ts` - Previously extracted coordinates from markers + region hints (lines 290-412 in 02-SCRIPT-ANALYSIS-V3.md)
  - **V11 Pattern:** AI provided markers → post-processor extracted coordinates
  - **V12 Pattern:** AI provides Y-coordinates directly → no extraction needed
  - **Action:** Keep file for legacy documents, but V12 prompt won't use it

---

## Executive Summary

**Problem:** Current OCR spatially-sorted text loses horizontal table structure, preventing accurate clinical entity extraction in Pass 1/2.

**Solution:** Enhance OCR pipeline to include X-coordinates, enabling AI to maintain spatial relationships while parsing tables and multi-column data.

**Scope:** This implementation affects:
1. Pass 0.5 (Encounter Discovery) - Use Y-coordinates for boundary detection
2. OCR Storage Pipeline - Store enhanced coordinate data
3. Pass 1/2 (Future) - Use X+Y coordinates for clinical entity extraction

**Critical Decision:** Implement Pass 0.5 changes FIRST (proving coordinate system works) before designing Pass 1/2.

---

## Table of Contents

1. [Background & Rationale](#background--rationale)
2. [Phase 1: Pass 0.5 Coordinate Migration](#phase-1-pass-05-coordinate-migration)
3. [Phase 2: OCR Pipeline Enhancement](#phase-2-ocr-pipeline-enhancement)
4. [Phase 3: Pass 1/2 Design (Future)](#phase-3-pass-12-design-future)
5. [Token Economics](#token-economics)
6. [Testing Strategy](#testing-strategy)
7. [Rollback Plan](#rollback-plan)

---

## Background & Rationale

### Current Problem

**What AI Currently Receives:**
```
S T - BIL .
16
14
7
```

**What AI Cannot Determine:**
- Which value (16, 14, 7) corresponds to which date column
- Horizontal spatial relationships lost in sort process

**Visual Reality (What Human Sees):**
```
Date       23/03/11  02/08/12  19/09/16
S T-BIL      16        14         7
```

### Proposed Solution

**Enhanced OCR Format with X-Coordinates:**
```
[Y:240] S T-BIL (x:20) | 16 (x:120) | 14 (x:220) | 7 (x:320)
[Y:270] S ALP (x:20) | 62 (x:120) | 66 (x:220) | 75 (x:320)
```

**AI Can Now Reason:**
- "The dates are at x:120, x:220, x:320"
- "Value '16' at x:120 corresponds to date '23/03/11' at x:120"
- Spatial alignment preserved

### Additional Capability: Non-Text Content Detection

Google Cloud Vision already provides `blockType` field to detect:
- `TEXT` - Regular text content
- `IMAGE` - Diagrams, photos, charts
- `TABLE` - Tabular structures

**Benefit:** Route image-containing pages to vision models, text-only pages to cheaper text models.

---

## Phase 1: Pass 0.5 Coordinate Migration

### Overview

**Current:** Pass 0.5 uses descriptive text markers + region hints for encounter boundaries
**New:** Pass 0.5 uses Y-coordinates directly from enhanced OCR

**Why This Matters:**
- Eliminates ambiguous text matching ("before header 'DISCHARGE SUMMARY'")
- Provides precise pixel-level boundary detection
- Proves coordinate system works before Pass 1/2 investment

### Step 1.1: Database Schema Changes

**Target Tables:**
- `pass05_pending_encounters` (encounter boundaries)
- `pass05_chunk_results.page_separation_analysis` (safe split points)

**Current Schema (Already Has Coordinate Columns!):**
```sql
-- pass05_pending_encounters
start_text_y_top integer,      -- OCR Y-coordinate (NULL if inter_page)
start_text_height integer,     -- OCR text height (NULL if inter_page)
start_y integer,               -- Calculated split line (NULL if inter_page)

end_text_y_top integer,        -- OCR Y-coordinate (NULL if inter_page)
end_text_height integer,       -- OCR text height (NULL if inter_page)
end_y integer,                 -- Calculated split line (NULL if inter_page)
```

**Assessment:** ✅ Schema already supports coordinates (Migration 48/52/64)

**Changes Needed:**
1. **Deprecate unused columns** (keep for backward compatibility):
   - `start_marker` (text) - Keep for human readability, but AI won't populate
   - `start_marker_context` (varchar 500) - Keep for human readability
   - `start_region_hint` (varchar 20) - Redundant with Y-coordinate
   - Same for `end_*` variants

2. **Add documentation** - Update table comments to clarify:
   - `start_y` / `end_y` are PRIMARY source of truth (populated from enhanced OCR)
   - `start_marker` / `end_marker` are OPTIONAL human-readable descriptions
   - `region_hint` is DEPRECATED (redundant with Y-coordinate)

**Migration Required:** NO - Schema already complete (just documentation updates)

---

### Step 1.2: Update Pass 0.5 Prompt (V12)

**File:** `shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-0.5-encounter-discovery/strategy-a-docs/04-PROMPT-V11-SPEC.md`

**Current V11 Output Format:**
```json
{
  "start_page": 1,
  "start_boundary_type": "intra_page",
  "start_marker": "before header 'DISCHARGE SUMMARY'",
  "start_marker_context": "...text context...",
  "start_region_hint": "upper_middle",
  "start_text_y_top": null,
  "start_text_height": null,
  "start_y": null
}
```

**New V12 Output Format:**
```json
{
  "start_page": 1,
  "start_boundary_type": "intra_page",
  "start_y": 450,                    // ← PRIMARY: Y-coordinate from enhanced OCR
  "start_marker": "DISCHARGE SUMMARY", // ← OPTIONAL: Human-readable label
  "start_marker_context": null,      // ← DEPRECATED: No longer needed
  "start_region_hint": null,         // ← DEPRECATED: Redundant with Y-coordinate
  "start_text_y_top": null,          // ← DEPRECATED: Worker calculates from start_y
  "start_text_height": null          // ← DEPRECATED: Worker calculates from OCR
}
```

**Key Changes:**

1. **AI Input Enhanced:**
   ```
   [Y:420] CONTINUED FROM PREVIOUS PAGE
   [Y:450] DISCHARGE SUMMARY (x:80)
   [Y:480] Patient Name: John Smith (x:80)
   ```

2. **AI Instructions Updated:**
   ```
   When identifying encounter boundaries on intra-page splits:

   1. Locate the Y-coordinate where the new encounter begins
   2. Use the [Y:###] marker from the enhanced OCR input
   3. Report ONLY the Y-coordinate (no text matching needed)
   4. Optionally provide a human-readable label in start_marker

   Example:
   "start_y": 450,                    // Y-coordinate where DISCHARGE SUMMARY appears
   "start_marker": "DISCHARGE SUMMARY" // Optional human label
   ```

3. **Simplified Logic:**
   - No more "before header" or "after section" text descriptions
   - No more region hints (top/upper_middle/etc)
   - Direct Y-coordinate from enhanced OCR

**Token Impact:**
- **Removed:** Verbose text descriptions (marker_context ~50-100 tokens)
- **Removed:** Region hint logic
- **Simplified:** Single integer Y-coordinate output

**Net Result:** ~40-60 tokens saved per encounter boundary

---

### Step 1.3: Update Pass 0.5 Worker Code

**Status:** ✅ COMPLETED (2025-11-27)

**Files Modified:**
1. ✅ `apps/render-worker/src/pass05/progressive/ocr-formatter.ts` - NEW FILE - Enhanced OCR format generation
2. ✅ `apps/render-worker/src/pass05/aiPrompts.v12.ts` - V12 prompt with inline coordinate support
3. ✅ `apps/render-worker/src/pass05/progressive/chunk-processor.ts` - Updated to use V12 prompt and enhanced OCR
4. ✅ `apps/render-worker/src/pass05/progressive/database.ts` - No changes needed (passes through deprecated fields as null)
5. ✅ `apps/render-worker/src/pass05/progressive/pending-reconciler.ts` - No changes needed (passes through fields)
6. ✅ `apps/render-worker/src/pass05/progressive/handoff-builder.ts` - No changes needed (doesn't reference deprecated fields)
7. ✅ `apps/render-worker/src/pass05/progressive/post-processor.ts` - No changes needed (no coordinate extraction logic)

**Changes Required:**

#### A. Input: Enhanced OCR Format

**Current (chunk-processor.ts):**
```typescript
// Uses spatially_sorted_text from shell_files.ocr_raw_jsonb
const ocrText = shellFile.ocr_raw_jsonb.pages[pageNum].spatially_sorted_text;
```

**New (chunk-processor.ts):**
```typescript
// Generate enhanced OCR format from raw bounding boxes
// This will be called during prompt building in buildEncounterDiscoveryPromptV11()
const enhancedOcr = generateEnhancedOcrFormat(
  shellFile.ocr_raw_jsonb.pages[pageNum]
);

// Format:
// [Y:240] S T-BIL (x:20) | 16 (x:120) | 14 (x:220) | 7 (x:320)
// [Y:270] S ALP (x:20) | 62 (x:120) | 66 (x:220) | 75 (x:320)
```

**New Function:**
```typescript
function generateEnhancedOcrFormat(page: GCVPage): string {
  const lines: Map<number, Array<{text: string, x: number}>> = new Map();

  // Group words by Y-coordinate (with tolerance for same line)
  for (const word of page.words) {
    const y = word.boundingBox.vertices[0].y;
    const x = word.boundingBox.vertices[0].x;
    const lineY = Math.round(y / 10) * 10; // Group to nearest 10px

    if (!lines.has(lineY)) {
      lines.set(lineY, []);
    }
    lines.get(lineY)!.push({ text: word.text, x });
  }

  // Sort lines by Y, then words by X within each line
  const sortedLines = Array.from(lines.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([y, words]) => {
      const sortedWords = words.sort((a, b) => a.x - b.x);
      const wordStrings = sortedWords.map(w => `${w.text} (x:${w.x})`).join(' | ');
      return `[Y:${y}] ${wordStrings}`;
    });

  return sortedLines.join('\n');
}
```

#### B. Output: Parse Y-Coordinates from AI

**Current (post-processor.ts):**
```typescript
// Post-processor handles AI response cleanup
start_marker: encounter.start_marker,
start_marker_context: encounter.start_marker_context,
start_region_hint: encounter.start_region_hint,
start_text_y_top: encounter.start_text_y_top,
start_text_height: encounter.start_text_height,
start_y: encounter.start_y
```

**New (post-processor.ts):**
```typescript
// AI provides Y-coordinate directly
start_y: encounter.start_y,  // PRIMARY source
start_marker: encounter.start_marker || null,  // Optional label

// Deprecated fields - set to null
start_marker_context: null,
start_region_hint: null,
start_text_y_top: null,  // Could calculate from start_y if needed
start_text_height: null
```

#### C. Validation: Verify Y-Coordinates

**New Validation Logic:**
```typescript
function validateBoundaryCoordinate(
  boundary: { boundary_type: string, y: number | null },
  page: { height: number }
): boolean {
  // Inter-page boundaries don't need Y-coordinates
  if (boundary.boundary_type === 'inter_page') {
    return boundary.y === null;
  }

  // Intra-page boundaries MUST have Y-coordinates
  if (boundary.boundary_type === 'intra_page') {
    if (boundary.y === null) {
      throw new Error('Intra-page boundary missing Y-coordinate');
    }

    // Y must be within page bounds
    if (boundary.y < 0 || boundary.y > page.height) {
      throw new Error(`Y-coordinate ${boundary.y} outside page height ${page.height}`);
    }

    return true;
  }

  return false;
}
```

---

### Step 1.4: Update Pass 0.5 Documentation

**Files to Update:**

1. **04-PROMPT-V11-SPEC.md** → **04-PROMPT-V12-SPEC.md**
   - Document V12 format with Y-coordinate-first approach
   - Add migration notes explaining V11 → V12 changes
   - Update all example JSON outputs

2. **06-BATCHING-TASK-DESIGN-V2.md** → **06-BATCHING-TASK-DESIGN-V3.md**
   - Update safe split point format to use Y-coordinates
   - Remove marker + region hint pattern (now deprecated)
   - Document simplified coordinate-based approach

3. **03-TABLE-DESIGN-V3.md** → **03-TABLE-DESIGN-V4.md**
   - Mark deprecated columns (marker_context, region_hint)
   - Clarify that start_y/end_y are primary source of truth
   - Update examples to show Y-coordinate usage

4. **02-SCRIPT-ANALYSIS-V3.md** → **02-SCRIPT-ANALYSIS-V4.md**
   - Document new `generateEnhancedOcrFormat()` function
   - Update AI response parsing logic
   - Show coordinate validation patterns

---

### Step 1.5: Testing Pass 0.5 Changes

**Test Cases:**

1. **Single-Page Document**
   - Verify Y-coordinate detection for single encounter
   - Confirm inter-page boundaries don't require coordinates

2. **Multi-Page Document with Intra-Page Splits**
   - Verify Y-coordinates for mid-page encounter boundaries
   - Confirm safe split points use Y-coordinates

3. **Cascade Chain (5-Page Lab Report)**
   - Use existing test file: `ac15a5b2-2756-4d1f-8ae9-3e142fd847d3`
   - Verify cascade handoff includes coordinates
   - Confirm reconciliation matches by Y-coordinate

4. **Edge Cases**
   - Page with no intra-page boundaries (all inter-page)
   - Page with multiple intra-page splits
   - Y-coordinate at very top (Y:0) or very bottom (Y:2263)

**Validation Queries:**

```sql
-- Verify all intra-page boundaries have Y-coordinates
SELECT
  id,
  start_boundary_type,
  start_y,
  end_boundary_type,
  end_y
FROM pass05_pending_encounters
WHERE (start_boundary_type = 'intra_page' AND start_y IS NULL)
   OR (end_boundary_type = 'intra_page' AND end_y IS NULL);

-- Expected: 0 rows (all intra-page boundaries have coordinates)
```

---

## Phase 2: OCR Pipeline Enhancement

### Overview

**Current OCR Storage:**
```json
{
  "pages": [
    {
      "page_number": 1,
      "dimensions": {"width": 1600, "height": 2263},
      "original_gcv_text": "[raw text]",
      "spatially_sorted_text": "[sorted text]"
    }
  ]
}
```

**New OCR Storage:**
```json
{
  "pages": [
    {
      "page_number": 1,
      "dimensions": {"width": 1600, "height": 2263},
      "original_gcv_text": "[raw text]",
      "spatially_sorted_text": "[sorted text]",  // ← Keep for backward compat
      "enhanced_ocr_text": "[Y:240] S T-BIL (x:20) | 16 (x:120)...", // ← NEW
      "blocks": [  // ← NEW: Preserve block metadata
        {
          "blockType": "TEXT",
          "boundingBox": {...}
        },
        {
          "blockType": "IMAGE",
          "boundingBox": {...}
        }
      ]
    }
  ]
}
```

---

### Step 2.1: Database Schema Update

**Table:** `shell_files`

**Current:**
```sql
ocr_raw_jsonb jsonb,  -- Full Google Vision response
```

**Changes Needed:** NONE - `ocr_raw_jsonb` already stores full response

**Implementation:** Update OCR processing code to preserve:
1. `enhanced_ocr_text` field (X-coordinate format)
2. `blocks` array with `blockType` metadata

---

### Step 2.2: Update OCR Processing Worker

**File:** `apps/render-worker/src/utils/ocr-persistence.ts`

**Current Logic:**
```typescript
// Extract text and sort spatially
const sortedText = extractAndSortText(gcvResponse);

// Store in database
await supabase.from('shell_files').update({
  ocr_raw_jsonb: {
    pages: [{
      page_number: 1,
      dimensions: gcvResponse.pages[0].dimensions,
      original_gcv_text: gcvResponse.fullTextAnnotation.text,
      spatially_sorted_text: sortedText
    }]
  }
});
```

**New Logic:**
```typescript
// Extract text in multiple formats
const sortedText = extractAndSortText(gcvResponse);
const enhancedText = generateEnhancedOcrFormat(gcvResponse.pages[0]);
const blocks = extractBlockMetadata(gcvResponse.pages[0]);

// Store in database
await supabase.from('shell_files').update({
  ocr_raw_jsonb: {
    pages: [{
      page_number: 1,
      dimensions: gcvResponse.pages[0].dimensions,
      original_gcv_text: gcvResponse.fullTextAnnotation.text,
      spatially_sorted_text: sortedText,     // Backward compat
      enhanced_ocr_text: enhancedText,       // NEW
      blocks: blocks                         // NEW
    }]
  }
});
```

**New Functions:**

```typescript
function generateEnhancedOcrFormat(page: GCVPage): string {
  // Same as Step 1.3 implementation
  // Returns: "[Y:240] word1 (x:20) | word2 (x:120) | ..."
}

function extractBlockMetadata(page: GCVPage): Array<BlockMetadata> {
  return page.blocks.map(block => ({
    blockType: block.blockType,  // TEXT, IMAGE, TABLE
    boundingBox: block.boundingBox,
    confidence: block.confidence
  }));
}
```

---

### Step 2.3: Non-Text Content Detection

**Goal:** Route pages with images/diagrams to vision models

**Implementation:**

```typescript
function hasNonTextContent(page: OCRPage): boolean {
  return page.blocks.some(block => block.blockType === 'IMAGE');
}

// Usage in Pass 1/2 routing logic (future)
if (hasNonTextContent(page)) {
  // Route to GPT-5 vision with raw image input (~1,105 tokens/page)
  await processWithVision(page);
} else {
  // Route to GPT-5 text-only with enhanced OCR (~509 tokens/page)
  await processWithText(page);
}
```

**Token Savings:**
- Text-only pages: 509 tokens/page ($0.00064 per page)
- Image pages: 1,105 tokens/page ($0.00138 per page)
- **Selective routing saves ~54% on text-heavy documents**

---

### Step 2.4: Migration for Existing Documents

**Challenge:** Existing documents in production have old OCR format

**Options:**

**Option A: Lazy Migration (Recommended)**
```typescript
// Worker checks for enhanced format on-the-fly
function getEnhancedOcr(shellFile: ShellFile, pageNum: number): string {
  const page = shellFile.ocr_raw_jsonb.pages[pageNum];

  // Check if enhanced format exists
  if (page.enhanced_ocr_text) {
    return page.enhanced_ocr_text;
  }

  // Fall back to generating on-the-fly from raw GCV data
  return generateEnhancedOcrFormat(page);
}
```

**Option B: Batch Migration**
```sql
-- Create migration script to regenerate enhanced OCR for all existing files
-- WARNING: Expensive operation (processes all documents)
UPDATE shell_files
SET ocr_raw_jsonb = regenerate_enhanced_ocr(ocr_raw_jsonb)
WHERE ocr_completed_at IS NOT NULL
  AND ocr_raw_jsonb -> 'pages' -> 0 ->> 'enhanced_ocr_text' IS NULL;
```

**Recommendation:** Use Option A (lazy migration) - regenerate on-demand as documents are processed.

---

## Phase 3: Pass 1/2 Design (Future)

### Overview

**Pass 1/2 Scope:** Extract clinical entities from medical documents

**Enhanced OCR Benefits:**
- Maintain table structure (lab results with date columns)
- Accurate spatial relationships for complex layouts
- Coordinate-based validation of extracted entities

---

### Step 3.1: AI Output Format with Y-Coordinates

**Current Decision:** AI outputs Y-coordinate only (not line reference)

**Format:**
```json
{
  "lab_results": [
    {
      "test_name": "S T-BIL",
      "value": "16",
      "unit": "umol/L",
      "date": "23/03/11",
      "y": 240  // ← Y-coordinate for validation
    }
  ]
}
```

**Post-AI Validation Function:**
```typescript
function validateEntityCoordinates(
  entity: ClinicalEntity,
  enhancedOcr: string
): boolean {
  // Search for entity.value at specified Y-coordinate
  const lineAtY = findLineAtY(enhancedOcr, entity.y);

  // Verify entity.value appears in that line
  if (!lineAtY.includes(entity.value)) {
    console.warn(`Entity value "${entity.value}" not found at Y:${entity.y}`);
    return false;
  }

  return true;
}
```

**Token Overhead:**
- Per entity: ~2 tokens (`"y": 240`)
- 50 entities/page: 100 output tokens
- Cost: $0.001 per page (8x input cost)

**Alternative (Future Optimization):** Use line references if output token cost becomes significant.

---

### Step 3.2: Table Detection & Parsing

**Challenge:** Identify table structures automatically

**Options:**

**Option A: Heuristic Detection (Simple)**
```typescript
function isTableLine(line: string): boolean {
  // Line with 3+ X-coordinates separated by consistent spacing
  const coords = line.match(/\(x:\d+\)/g);
  return coords && coords.length >= 3;
}
```

**Option B: Table Transformer Model (Advanced)**
- Use Microsoft's Table Transformer (90-95% accuracy)
- Extract table structure before Pass 1/2 processing
- Provide pre-parsed table data to AI

**Recommendation:** Start with Option A, upgrade to Option B if accuracy issues arise.

---

### Step 3.3: Coordinate-Based Entity Linking

**Use Case:** Link lab values to date columns

**Algorithm:**
```typescript
function linkLabValueToDate(
  value: { text: string, x: number, y: number },
  dates: Array<{ text: string, x: number, y: number }>
): string {
  // Find date with closest X-coordinate
  const closestDate = dates.reduce((closest, date) => {
    const distToCurrent = Math.abs(value.x - date.x);
    const distToClosest = Math.abs(value.x - closest.x);
    return distToCurrent < distToClosest ? date : closest;
  });

  return closestDate.text;
}
```

**Example:**
```
Dates at Y:180:  23/03/11 (x:220) | 02/08/12 (x:320) | 19/09/16 (x:420)
Value at Y:240:  16 (x:120) | 14 (x:220) | 7 (x:320)

Result:
- 16 at x:120 → No close date (could be test name)
- 14 at x:220 → Links to 23/03/11 at x:220
- 7 at x:320 → Links to 02/08/12 at x:320
```

---

### Step 3.4: Pass 1/2 Prompt Design

**Deferred:** Design Pass 1/2 prompts AFTER Pass 0.5 coordinate system is proven.

**Key Principles:**
1. AI receives enhanced OCR with X+Y coordinates
2. AI outputs clinical entities with Y-coordinates
3. Post-processing validates coordinates against OCR
4. Compact output format minimizes token overhead

---

## Token Economics

### Input Token Costs (GPT-5 - November 2025)

**Pricing:** $1.25 per million input tokens ($0.00125 per 1K)

| Format | Tokens/Page | Cost/Page | vs Baseline |
|--------|-------------|-----------|-------------|
| Text-only (baseline) | 446 | $0.00056 | - |
| Text + X-coords | 509 | $0.00064 | +14% |
| Text + Full BBox | 619 | $0.00077 | +39% |
| Raw Image (1600x2263) | 1,105 | $0.00138 | +147% |

**Calculation (Text + X-coords):**
- 5-page document: 2,545 input tokens
- Cost: 2.545 × $0.00125 = $0.003 per document
- At scale (1,000 docs/month): $3/month input cost

**Cached Token Discount:** 90% off ($0.000125 per 1K) for repeated content within minutes

---

### Output Token Costs (GPT-5 - November 2025)

**Pricing:** $10 per million output tokens ($0.01000 per 1K) - **8x more expensive than input**

| Format | Tokens/Entity | 50 Entities | Cost Difference |
|--------|---------------|-------------|-----------------|
| Full coords | 4 | 200 | $0.002 |
| Y-coord only | 2 | 100 | $0.001 |
| Line reference | 1 | 50 | $0.0005 |

**Recommendation:** Use Y-coordinate format (2 tokens/entity) - balances precision with cost.

---

### Selective Routing Savings

**Strategy:** Route text-only pages to text models, image pages to vision models

| Document Type | Text-Only Cost | Vision Cost | Savings |
|---------------|----------------|-------------|---------|
| 100% text | $0.64/1K pages | $1.38/1K pages | 54% |
| 50% images | $1.01/1K pages | $1.38/1K pages | 27% |
| 100% images | $1.38/1K pages | $1.38/1K pages | 0% |

**Typical Medical Document:** 80% text, 20% images → **43% savings**

---

## Testing Strategy

### Unit Tests

**Test File:** `tests/ocr/enhanced-format.test.ts`

```typescript
describe('Enhanced OCR Format Generation', () => {
  test('generates X-coordinate format from GCV response', () => {
    const gcvPage = loadFixture('lab-report-page-1.json');
    const enhanced = generateEnhancedOcrFormat(gcvPage);

    expect(enhanced).toContain('[Y:240]');
    expect(enhanced).toContain('(x:120)');
    expect(enhanced).toContain('|');
  });

  test('groups words by Y-coordinate with 10px tolerance', () => {
    const gcvPage = createTestPage([
      { text: 'Word1', x: 10, y: 240 },
      { text: 'Word2', x: 50, y: 245 },  // Same line (within 10px)
      { text: 'Word3', x: 10, y: 270 }   // Different line
    ]);

    const enhanced = generateEnhancedOcrFormat(gcvPage);
    const lines = enhanced.split('\n');

    expect(lines).toHaveLength(2);  // 2 distinct Y-coordinates
  });
});
```

---

### Integration Tests

**Test File:** `tests/pass05/coordinate-boundaries.test.ts`

```typescript
describe('Pass 0.5 Coordinate Boundaries', () => {
  test('detects intra-page boundary with Y-coordinate', async () => {
    const shellFile = await createTestShellFile({
      pages: [
        {
          enhanced_ocr_text: `
[Y:240] ADMISSION NOTE
[Y:270] Patient admitted with chest pain
[Y:450] DISCHARGE SUMMARY
[Y:480] Patient discharged in stable condition
          `
        }
      ]
    });

    const encounters = await processPass05(shellFile);

    expect(encounters).toHaveLength(2);
    expect(encounters[0].end_y).toBe(450);  // Boundary at DISCHARGE SUMMARY
    expect(encounters[1].start_y).toBe(450);
  });
});
```

---

### Production Validation

**Test Document:** Use existing 5-page lab report
- Shell File ID: `ac15a5b2-2756-4d1f-8ae9-3e142fd847d3`
- Known to have cascade chains and multi-column tables

**Validation Steps:**
1. Regenerate OCR with enhanced format
2. Reprocess through Pass 0.5 with coordinate detection
3. Verify encounter boundaries match expected Y-coordinates
4. Confirm cascade reconciliation still works
5. Compare AI token usage before/after

**Success Criteria:**
- All encounters detected correctly
- Y-coordinates within ±10px of expected values
- Token usage within 14% of baseline
- No regressions in cascade reconciliation

---

## Rollback Plan

### If Pass 0.5 Coordinate System Fails

**Symptoms:**
- AI cannot parse enhanced OCR format
- Y-coordinates are inaccurate (>50px off)
- Token usage exceeds 20% baseline

**Rollback Steps:**
1. Revert prompt to V11 (marker + region hint)
2. Modify worker to skip enhanced OCR generation
3. Keep schema changes (no migration needed)
4. Mark coordinate columns as NULL

**Effort:** 1-2 hours (prompt + worker changes only)

---

### If OCR Pipeline Enhancement Fails

**Symptoms:**
- generateEnhancedOcrFormat() crashes on edge cases
- Block metadata extraction errors
- Production OCR processing stops

**Rollback Steps:**
1. Revert OCR worker to old logic (spatially_sorted_text only)
2. Pass 0.5 falls back to old format automatically
3. No database changes needed (backward compatible)

**Effort:** <1 hour (revert single file)

---

## Implementation Checklist

### Phase 1: Pass 0.5 Coordinate Migration

#### Step 1.1: Schema Review ✅ COMPLETED
- [X] Verify `pass05_pending_encounters` has coordinate columns (✅ Already exists: Migration 48/52/64)
- [X] Verify `pass05_chunk_results.page_separation_analysis` can store Y-coordinates
- [X] No database migrations required

**Result:** All required columns exist. No schema changes needed.

#### Step 1.2: Create V12 Prompt Specification ✅ COMPLETED
- [X] Copy `aiPrompts.v11.ts` → `aiPrompts.v12.ts` (Documentation created)
- [X] Update AI instructions to use Y-coordinates from enhanced OCR
- [X] Remove marker_context and region_hint instructions
- [X] Update output schema to require Y-coordinates for intra-page boundaries
- [X] Add examples showing `[Y:450]` format in OCR input
- [X] Document breaking changes from V11

**Result:** Created `04-PROMPT-V12-SPEC.md` with complete specification
- Enhanced OCR format documentation with examples
- Simplified output schema (direct Y-coordinates)
- Migration guide from V11
- Token economics analysis
- Testing requirements

**Next:** Need to create actual TypeScript file `aiPrompts.v12.ts` by duplicating v11 and applying spec changes (Step 1.3)

#### Step 1.3: Update Worker Code Files ⏳ IN PROGRESS
**Files to modify (verified against 02-SCRIPT-ANALYSIS-V3.md):**

- [X] **`progressive/ocr-formatter.ts`** ✅ CREATED (New file)
  - [X] Implement `generateEnhancedOcrFormat(page: OCRPage): string`
  - [X] Group words by Y-coordinate (10px tolerance)
  - [X] Sort words by X-coordinate within each line
  - [X] Format as `[Y:###] text (x:###) | text (x:###)`
  - [X] Add fallback for non-structured OCR data
  - [X] Add helper functions (extractWordsWithCoordinates, groupWordsByLine, etc.)

  **Created:** `apps/render-worker/src/pass05/progressive/ocr-formatter.ts` (180 lines)

- [ ] **`aiPrompts.v12.ts`** ⏳ NEXT (User wants to be involved)
  - [ ] Duplicate `aiPrompts.v11.ts` → `aiPrompts.v12.ts`
  - [ ] Update prompt to reference enhanced OCR format
  - [ ] Update instructions for Y-coordinate output
  - [ ] Remove marker_context/region_hint instructions
  - [ ] User approval required for each change

- [ ] **`progressive/chunk-processor.ts`** (lines 135-148 in docs)
  - [ ] Import `generateEnhancedOcrFormat()` from ocr-formatter
  - [ ] Replace `spatially_sorted_text` with `enhancedOcr` in prompt builder
  - [ ] Update `buildEncounterDiscoveryPromptV11()` call to pass enhanced format

- [ ] **`progressive/post-processor.ts`** (lines 71 in docs)
  - [ ] Update encounter parsing to read `start_y` / `end_y` directly from AI
  - [ ] Set deprecated fields to null (marker_context, region_hint, text_y_top, text_height)
  - [ ] Add Y-coordinate validation logic

- [ ] **`progressive/database.ts`** (lines 1670+ in docs)
  - [ ] Verify encounter insertion uses Y-coordinates from AI response
  - [ ] Update `batchInsertPendingEncountersV3()` to handle null deprecated fields

- [ ] **`progressive/pending-reconciler.ts`** (lines 149-156 in docs)
  - [ ] Update boundary matching to use Y-coordinates directly
  - [ ] Remove any coordinate-extractor.ts calls

- [ ] **`progressive/handoff-builder.ts`** (lines 1608+ in docs)
  - [ ] Verify cascade context includes Y-coordinate boundaries if needed

#### Step 1.4: Update Documentation
- [ ] Create **04-PROMPT-V12-SPEC.md** (copy from V11, update for coordinates)
- [ ] Create **06-BATCHING-TASK-DESIGN-V3.md** (update for Y-coordinate split points)
- [ ] Update **03-TABLE-DESIGN-V3.md** → V4 (mark deprecated columns)
- [ ] Update **02-SCRIPT-ANALYSIS-V3.md** → V4 (document V12 changes)
- [ ] Update **OCR-COORDINATE-ENHANCEMENT-IMPLEMENTATION-PLAN.md** (this file) with completion status

#### Step 1.5: Testing
- [ ] **Unit tests** (`tests/pass05/enhanced-ocr.test.ts`)
  - [ ] Test `generateEnhancedOcrFormat()` groups words by Y-coordinate
  - [ ] Test X-coordinate sorting within lines
  - [ ] Test edge cases (empty page, single word, overlapping Y-coords)

- [ ] **Integration tests** (`tests/pass05/coordinate-boundaries.test.ts`)
  - [ ] Test AI receives enhanced OCR format
  - [ ] Test AI returns Y-coordinates for intra-page boundaries
  - [ ] Test post-processor validates Y-coordinates
  - [ ] Test cascade reconciliation with Y-coordinate boundaries

- [ ] **Production test**
  - [ ] Use shell_file_id: `ac15a5b2-2756-4d1f-8ae9-3e142fd847d3` (5-page lab report)
  - [ ] Verify all encounters detected correctly
  - [ ] Verify Y-coordinates within ±10px of expected values
  - [ ] Verify cascade chains reconcile correctly
  - [ ] Compare token usage vs V11 baseline

### Phase 2: OCR Pipeline Enhancement

- [ ] **Step 2.1:** Verify schema (no changes needed)
- [ ] **Step 2.2:** Update OCR worker
  - [ ] Add enhanced_ocr_text generation
  - [ ] Add block metadata extraction
  - [ ] Update storage logic
- [ ] **Step 2.3:** Implement non-text content detection
  - [ ] Add `hasNonTextContent()` function
  - [ ] Store block metadata
  - [ ] Plan routing logic for Pass 1/2
- [ ] **Step 2.4:** Migration strategy
  - [ ] Implement lazy migration (on-demand regeneration)
  - [ ] Test backward compatibility

### Phase 3: Pass 1/2 Design (Future)

- [ ] **Step 3.1:** Design AI output format with Y-coordinates
- [ ] **Step 3.2:** Implement table detection
- [ ] **Step 3.3:** Build coordinate-based entity linking
- [ ] **Step 3.4:** Create Pass 1/2 prompt specification

---

## Timeline Estimate

**Phase 1 (Pass 0.5):** 3-5 days
- Prompt design: 1 day
- Worker implementation: 2 days
- Testing: 1-2 days

**Phase 2 (OCR Pipeline):** 2-3 days
- Worker update: 1 day
- Testing: 1 day
- Migration: 0.5 days

**Phase 3 (Pass 1/2):** Deferred until Phase 1 proven

**Total (Phases 1-2):** ~1 week

---

## Key Decisions Made

1. **Y-Coordinate Output Format:** AI outputs Y-coordinates (not line references) for clinical entities
2. **Phase Order:** Pass 0.5 first (prove coordinate system), then Pass 1/2
3. **Backward Compatibility:** Keep old OCR format, add enhanced format alongside
4. **Migration Strategy:** Lazy migration (regenerate on-demand, not batch)
5. **Token Optimization:** Use X-coordinate-only input (+14% tokens) vs full bounding boxes (+39%)
6. **Non-Text Detection:** Store block metadata for future vision model routing

---

## Success Metrics

**Pass 0.5 (Phase 1):**
- ✅ 100% of intra-page boundaries have Y-coordinates
- ✅ Y-coordinates within ±10px of expected values
- ✅ Token usage <20% increase vs baseline
- ✅ No regressions in cascade reconciliation

**OCR Pipeline (Phase 2):**
- ✅ Enhanced OCR generated for all new documents
- ✅ Block metadata captured (TEXT vs IMAGE)
- ✅ Backward compatibility with old format maintained

**Pass 1/2 (Phase 3 - Future):**
- ✅ Clinical entities linked to correct table cells (>95% accuracy)
- ✅ Output token overhead <5% of total cost
- ✅ Selective routing saves >40% on text-heavy documents

---

## Open Questions

1. **X-Coordinate Precision:** Should we normalize X-coordinates to 0-999 scale (like DeepSeek-OCR) for resolution independence?
   - **Decision:** Defer until Phase 3 - use raw pixel coordinates for now

2. **Table Transformer Integration:** When should we integrate Microsoft's Table Transformer?
   - **Decision:** Only if heuristic table detection fails in Phase 3

3. **Batch Migration:** Should we batch-migrate existing documents to enhanced OCR format?
   - **Decision:** No - use lazy migration to minimize risk and cost

4. **Coordinate Buffer Zones:** Should AI output buffer zones (±10px) or exact coordinates?
   - **Decision:** Exact coordinates - worker calculates buffer zones as needed

---

## References

### Documentation
- [Pass 0.5 System Overview](./pass-0.5-encounter-discovery/strategy-a-docs/01-SYSTEM-OVERVIEW.md)
- [Current Prompt V11 Spec](./pass-0.5-encounter-discovery/strategy-a-docs/04-PROMPT-V11-SPEC.md)
- [Batching Task Design V2](./pass-0.5-encounter-discovery/strategy-a-docs/06-BATCHING-TASK-DESIGN-V2.md)
- [Alternative OCR Strategies](./alternative-ocr-strategies)

### External Resources
- [GPT-5 Pricing](https://pricepertoken.com/pricing-page/model/openai-gpt-5)
- [Google Cloud Vision API](https://cloud.google.com/vision/docs/reference/rpc/google.cloud.vision.v1)
- [TOON vs JSON Token Efficiency](https://jduncan.io/blog/2025-11-11-toon-vs-json-agent-optimized-data/)
- [OCR Layout Analysis 2025](https://www.nature.com/articles/s41598-025-07439-y)

---

**Last Updated:** 2025-11-26
**Next Review:** After Phase 1 completion
**Status:** Planning phase - awaiting approval to proceed with Phase 1
