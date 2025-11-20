# Pass 0.5 Batching Task Design V2

**Date:** November 15, 2024
**Version:** 2.0
**Updated:** November 19, 2024 - Marker + Region Hint Pattern
**Purpose:** Define how Pass 0.5 identifies safe splitting points for downstream Pass 1/2 batching

## Executive Summary

Pass 0.5 identifies ADDITIONAL safe split points where medical documents can be divided for parallel processing without losing clinical context. These split points supplement the natural encounter boundaries and can occur both between pages (inter-page) and within pages (intra-page).

**Key Innovation (Updated Nov 19, 2024):** Pass 0.5 now uses a marker + region hint pattern. The AI identifies text markers and region hints (top/upper_middle/lower_middle/bottom), while post-processing scripts extract precise Y-coordinates. This eliminates token overhead while maintaining accuracy.

**Important:** Encounter boundaries (where one encounter ends and another begins) are inherently safe split points and are NOT included in this batching analysis. Downstream processing will combine encounter boundaries with these additional split points.

**Storage Strategy:** Hybrid approach - chunk-level during processing, document-level after reconciliation.

## Core Concept: Split Points

### Two Types of Split Points

#### 1. Inter-Page Splits (Natural Page Boundaries)

When the content naturally ends on one page and new content begins on the next:

```json
{
  "split_location": "inter_page",
  "between_pages": [5, 6],
  "split_type": "natural_boundary",
  "confidence": 1.0,
  "justification": "Page 5 ends with completed discharge summary. Page 6 begins new encounter dated 3 days later."
}
```

**Characteristics:**
- No coordinates needed
- Highest confidence (1.0)
- Simplest for downstream processing
- No text erasure required

#### 2. Intra-Page Splits (Within a Page)

When safe split point exists within a single page:

**Updated (Nov 19, 2024) - Marker + Region Hint Pattern:**
```json
{
  "split_location": "intra_page",
  "page": 23,
  "marker": "PATHOLOGY REPORT",
  "marker_context": "...previous text...PATHOLOGY REPORT Date: 2024-03-15",
  "region_hint": "upper_middle",
  "text_y_top": null,  // Will be extracted by post-processor
  "text_height": null, // Will be extracted by post-processor
  "split_y": null      // Will be calculated by post-processor
}
```

**Original Design (For Reference):**
```json
{
  "split_location": "intra_page",
  "page": 23,
  "marker": "just before header 'PATHOLOGY REPORT'",
  "text_y_top": 450,
  "split_y": 426,
  "text_height": 24,
  "split_type": "new_document",
  "confidence": 0.92,
  "justification": "Consultation concludes mid-page. New pathology report begins with clear header."
}
```

**Characteristics:**
- Requires precise coordinates
- Buffer zone pre-calculated
- Text erasure needed downstream
- Variable confidence

### Y-Coordinate System Explained

OCR systems measure from top of page in pixels:
- Y=0: Top edge of page
- Y=450: Text starts 450 pixels from top
- Y=3300: Bottom of typical US Letter page (11 inches at 300 DPI)

**Buffer Zone Calculation:**
```
split_y = text_y_top - text_height
```

This ensures the split line appears one text-height above the header, preserving visual clarity.

## Data Schema

### Per-Chunk Storage During Processing

```sql
ALTER TABLE pass05_chunk_results
  ADD COLUMN page_separation_analysis jsonb;
```

**JSON Structure (Per Chunk):**
```json
{
  "chunk_number": 1,
  "pages_analyzed": [1, 50],
  "safe_split_points": [
    {
      "split_location": "inter_page",
      "between_pages": [5, 6],
      "split_type": "natural_boundary",
      "confidence": 1.0,
      "justification": "Page 5: discharge complete. Page 6: new admission."
    },
    {
      "split_location": "intra_page",
      "page": 23,
      "marker": "just before header 'PATHOLOGY REPORT'",
      "text_y_top": 450,
      "split_y": 426,
      "text_height": 24,
      "split_type": "new_document",
      "confidence": 0.92,
      "justification": "New pathology report begins mid-page with clear header."
    }
  ],
  "metadata": {
    "splits_found": 8,
    "avg_confidence": 0.94,
    "inter_page_count": 3,
    "intra_page_count": 5
  }
}
```

### Final Document Storage After Reconciliation

```sql
ALTER TABLE shell_files
  ADD COLUMN page_separation_analysis jsonb;
```

**JSON Structure (Document-Wide):**
```json
{
  "version": "2.0",
  "total_pages": 142,
  "analysis_date": "2024-11-15T10:30:00Z",
  "safe_split_points": [
    // Combined from all chunks, sorted by page number
  ],
  "summary": {
    "total_splits": 28,
    "inter_page_splits": 12,
    "intra_page_splits": 16,
    "avg_confidence": 0.91,
    "pages_per_split": 5.1
  }
}
```

## Processing Flow

### 1. Chunk Processing
Each 50-page chunk identifies split points within its range:

```typescript
// Chunk 1 (pages 1-50)
const chunkAnalysis = {
  chunk_number: 1,
  pages_analyzed: [1, 50],
  safe_split_points: [/* splits for pages 1-50 */]
};

// Store in pass05_chunk_results
await db.update('pass05_chunk_results')
  .set({ page_separation_analysis: chunkAnalysis })
  .where({ id: chunkResultId });
```

### 2. Reconciliation
Combine all chunks' analyses into final document analysis:

```sql
-- Aggregate split points from all chunks
WITH combined_splits AS (
  SELECT
    jsonb_array_elements(page_separation_analysis->'safe_split_points') as split_point
  FROM pass05_chunk_results
  WHERE session_id = $1
  ORDER BY chunk_number
)
UPDATE shell_files
SET page_separation_analysis = jsonb_build_object(
  'version', '2.0',
  'total_pages', number_of_pages,
  'analysis_date', CURRENT_TIMESTAMP,
  'safe_split_points', jsonb_agg(split_point),
  'summary', jsonb_build_object(
    'total_splits', COUNT(*),
    'inter_page_splits', COUNT(*) FILTER (WHERE split_point->>'split_location' = 'inter_page'),
    'intra_page_splits', COUNT(*) FILTER (WHERE split_point->>'split_location' = 'intra_page'),
    'avg_confidence', AVG((split_point->>'confidence')::numeric),
    'pages_per_split', number_of_pages::numeric / NULLIF(COUNT(*), 0)
  )
)
FROM combined_splits
WHERE id = $2
GROUP BY id, number_of_pages;
```

### 3. Downstream Access
Pass 1/2 reads BOTH encounter boundaries AND batching split points:

```typescript
// Get encounter boundaries (primary split points)
const encounters = await db
  .select('start_page', 'end_page')
  .from('healthcare_encounters')
  .where({ shell_file_id: fileId })
  .orderBy('start_page');

// Get additional split points from batching analysis
const { page_separation_analysis } = await db
  .select('page_separation_analysis')
  .from('shell_files')
  .where({ id: fileId })
  .single();

// Combine both sources for complete split list
const allSplitPoints = [
  ...getEncounterBoundaries(encounters),  // Primary splits
  ...page_separation_analysis.safe_split_points  // Additional splits
].sort((a, b) => getPageNumber(a) - getPageNumber(b));

// Create batches respecting all split points
const batches = createBatchesFromAllSplitPoints(allSplitPoints);
```

## AI Prompt Instructions (V11)

### Safe Split Point Identification

```markdown
## BATCHING ANALYSIS

Identify safe points where this document could be split for parallel processing.

### Two Types of Split Points

1. **Inter-Page Splits** (Between Pages)
   - Natural boundaries where one page ends and another begins
   - Example: Page 5 ends with discharge summary, Page 6 starts new admission

2. **Intra-Page Splits** (Within a Page)
   - Safe split points within a single page
   - Example: Consultation ends mid-page, pathology report begins

### Safe Split Criteria

Mark as SAFE when content after the split can be understood with just encounter context:
- Clear section headers WITHIN an encounter (e.g., "PATHOLOGY REPORT", "DAY 2 NOTES")
- New document type starts within the same encounter
- Complete clinical narrative ends and new one begins
- Successive progress notes within same admission

**DO NOT MARK** encounter boundaries as split points - these are handled separately by encounter discovery.

### Output Requirements

For INTER-PAGE splits:
```json
{
  "split_location": "inter_page",
  "between_pages": [page_before, page_after],
  "split_type": "natural_boundary|new_encounter|new_section",
  "confidence": 0.0-1.0,
  "justification": "Why this page boundary is safe to split"
}
```

For INTRA-PAGE splits:
```json
{
  "split_location": "intra_page",
  "page": page_number,
  "marker": "just before [specific text]",
  "text_y_top": y_coordinate_of_text,
  "split_y": y_coordinate_minus_text_height,
  "text_height": height_of_text,
  "split_type": "new_document|new_section|new_evidence",
  "confidence": 0.0-1.0,
  "justification": "Why this location is safe to split"
}
```

### Analysis Frequency
- Examine every page boundary for inter-page splits
- Look for intra-page splits at major headers and transitions
- Aim for ~1 split per 3 pages minimum
- Must identify at least 1 split per 5 pages maximum

### Important Notes (Updated Nov 19, 2024)
- AI identifies text markers and region hints only
- Post-processor (coordinate-extractor.ts) extracts exact Y-coordinates from OCR
- Region hints help disambiguate when same marker appears multiple times
- DO NOT output unsafe boundaries (only safe splits)
- Higher confidence for clear headers, lower for contextual boundaries
```

## Implementation Details

### Coordinate Extraction

Pass 0.5 performs OCR bbox lookup during processing:

```typescript
function extractSplitCoordinates(
  ocrData: OcrData,
  page: number,
  markerText: string
): SplitCoordinates {

  // Find the text in OCR data
  const textBlock = findTextInOcr(ocrData, page, markerText);

  if (!textBlock) {
    throw new Error(`Could not find "${markerText}" on page ${page}`);
  }

  // Extract coordinates with buffer
  return {
    text_y_top: textBlock.bbox.y,
    text_height: textBlock.bbox.height,
    split_y: textBlock.bbox.y - textBlock.bbox.height, // Buffer zone
  };
}
```

### Text Erasure for Intra-Page Splits

Downstream Pass 1/2 implementation:

```typescript
import sharp from 'sharp';

async function splitPageAtCoordinate(
  pageImage: Buffer,
  splitPoint: IntraPageSplit
): Promise<{ top: Buffer, bottom: Buffer }> {

  const metadata = await sharp(pageImage).metadata();

  // Top portion: from page top to split line
  const topPortion = await sharp(pageImage)
    .extract({
      left: 0,
      top: 0,
      width: metadata.width!,
      height: splitPoint.split_y
    })
    .extend({
      bottom: metadata.height! - splitPoint.split_y,
      background: { r: 255, g: 255, b: 255 } // White fill
    })
    .toBuffer();

  // Bottom portion: from split line to page bottom
  const bottomPortion = await sharp(pageImage)
    .extract({
      left: 0,
      top: splitPoint.split_y,
      width: metadata.width!,
      height: metadata.height! - splitPoint.split_y
    })
    .extend({
      top: splitPoint.split_y,
      background: { r: 255, g: 255, b: 255 } // White fill
    })
    .toBuffer();

  return { top: topPortion, bottom: bottomPortion };
}
```

## Relationship to Encounter Boundaries

**Critical Design Decision:** This batching analysis identifies ADDITIONAL safe split points beyond encounter boundaries.

### How It Works

1. **Encounter boundaries** (from `healthcare_encounters` table) are PRIMARY split points
   - Always safe to split
   - Automatically used by downstream
   - NOT included in batching analysis output

2. **Batching analysis** (from `page_separation_analysis`) provides ADDITIONAL splits within encounters
   - Safe points within long encounters
   - Enables parallel processing of large encounters
   - Supplements encounter boundaries

### Example Integration

**Scenario:** Document with 2 encounters
- Encounter 1: Pages 1-50
- Encounter 2: Pages 51-100
- Batching analysis finds safe splits at pages 12, 28, 67, 89

**Downstream creates batches:**
```
[1-12]    // Within encounter 1
[13-28]   // Within encounter 1
[29-50]   // Within encounter 1 (ends at encounter boundary)
[51-67]   // Within encounter 2 (starts at encounter boundary)
[68-89]   // Within encounter 2
[90-100]  // Within encounter 2
```

The split at page 50/51 comes from the encounter boundary, NOT from batching analysis.

## Real-World Examples

### Example 1: Multi-Encounter Document

**Document:** 45 pages with GP visit → ED visit → Specialist consultation

**Note:** The encounter boundaries (pages 15/16 and 30/31) are NOT in the output below.

```json
{
  "safe_split_points": [
    {
      "split_location": "inter_page",
      "between_pages": [8, 9],
      "split_type": "natural_boundary",
      "confidence": 1.0,
      "justification": "Page 8: Assessment complete. Page 9: Lab results begin within same GP visit."
    },
    {
      "split_location": "intra_page",
      "page": 22,
      "marker": "just before header 'RADIOLOGY REPORT'",
      "text_y_top": 823,
      "split_y": 799,
      "text_height": 24,
      "split_type": "new_document",
      "confidence": 0.90,
      "justification": "Within ED visit: triage notes end, radiology report begins with clear header."
    }
  ]
}
```

### Example 2: Long Hospital Admission

**Document:** 142 pages, single admission with multiple progress notes

```json
{
  "safe_split_points": [
    {
      "split_location": "intra_page",
      "page": 5,
      "marker": "just before header 'DAY 2 PROGRESS NOTES'",
      "text_y_top": 312,
      "split_y": 290,
      "text_height": 22,
      "split_type": "new_section",
      "confidence": 0.90,
      "justification": "Day 1 notes complete. Day 2 begins with dated header."
    },
    {
      "split_location": "inter_page",
      "between_pages": [11, 12],
      "split_type": "natural_boundary",
      "confidence": 1.0,
      "justification": "Page 11: Day 2 notes conclude. Page 12: Radiology report header."
    },
    {
      "split_location": "intra_page",
      "page": 28,
      "marker": "just before header 'PATHOLOGY RESULTS - 18/03/2024'",
      "text_y_top": 567,
      "split_y": 543,
      "text_height": 24,
      "split_type": "new_document",
      "confidence": 0.92,
      "justification": "Progress notes end. Standalone pathology report begins."
    }
  ]
}
```

## Success Metrics

### Quality Metrics
- **Coverage:** At least 1 split per 5 pages
- **Precision:** >95% of marked splits are truly safe
- **Confidence Calibration:** Higher confidence splits have lower error rates
- **Coordinate Accuracy:** Y-coordinates match OCR bbox data

### Performance Metrics
- **Processing Time:** <100ms per page for analysis
- **Storage Efficiency:** <5KB per document average
- **Reconciliation Speed:** <1 second for 1000-page document

## Migration Plan

### Database Changes Required

```sql
-- 1. Add column to chunk results table
ALTER TABLE pass05_chunk_results
  ADD COLUMN page_separation_analysis jsonb;

-- 2. Add column to shell files table
ALTER TABLE shell_files
  ADD COLUMN page_separation_analysis jsonb;

-- 3. Create indexes for efficient queries
CREATE INDEX idx_shell_files_separation_analysis
  ON shell_files USING GIN (page_separation_analysis);

CREATE INDEX idx_chunk_results_separation_analysis
  ON pass05_chunk_results USING GIN (page_separation_analysis);
```

### Implementation Phases

**Phase 1: V11 Prompt Update**
- Add batching analysis instructions
- Include coordinate extraction logic
- Test with sample documents

**Phase 2: Processing Pipeline**
- Update chunk processor to extract split points
- Store in `pass05_chunk_results`
- Validate coordinate accuracy

**Phase 3: Reconciliation Logic**
- Implement split point aggregation
- Store final analysis in `shell_files`
- Add monitoring metrics

**Phase 4: Downstream Integration**
- Pass 1/2 reads split points
- Implement text erasure
- Create variable-size batches

## Key Design Decisions

### Why Both Marker and Coordinates?

**Text Marker:** Human-readable for debugging, helps identify the intended split location
**Y-Coordinates:** Precise positioning for text erasure, eliminates ambiguity
**Buffer Zone:** Pre-calculated by Pass 0.5 when it has full context

### Why Hybrid Storage?

**Chunk-level:** Natural fit with progressive processing, no complex merging during processing
**Document-level:** Single source of truth for downstream, efficient reads

### Why No Unsafe Boundaries?

Reduces token usage and complexity. If a boundary isn't marked as safe, it's implicitly unsafe.

### Why Distinguish Inter vs Intra?

**Inter-page:** Simple, no coordinates needed, no text erasure
**Intra-page:** Complex, requires precise positioning and erasure
**Different downstream handling:** Optimization opportunities for inter-page splits

## Conclusion

This V2 design provides a robust, precise, and efficient system for identifying ADDITIONAL safe document split points beyond encounter boundaries. Key improvements:

1. **Clear distinction** between inter-page and intra-page splits
2. **Dual identification** with both text markers and Y-coordinates
3. **Pre-calculated buffers** eliminate downstream guesswork
4. **Hybrid storage** balances processing efficiency with data accessibility
5. **Simplified schema** removes redundant unsafe boundaries
6. **Separation of concerns** - encounter boundaries handled by encounter discovery, additional splits by batching analysis

The system enables intelligent document batching that respects clinical context while maximizing parallel processing opportunities. Downstream processing combines encounter boundaries (primary splits) with batching analysis (additional splits) to create optimal batch sizes.