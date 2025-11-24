# Pass 0.5 Batching Task Design

**Date:** November 14, 2024
**Version:** 1.0
**Purpose:** Define how Pass 0.5 identifies safe splitting points for downstream Pass 1/2 batching

## Executive Summary

Pass 0.5's batching task provides critical data for downstream Pass 1/2 processing by identifying safe points where a document can be split for parallel processing without losing clinical context.

**Key Insight:** Clinical content flows within pages, not just across page boundaries. Safe split points exist at intra-page positions (mid-page), not just inter-page boundaries.

**Approach:** Text markers (descriptive locations) converted to Y-coordinates via OCR bbox data.

**Output:** Populated `page_separation_analysis` jsonb column in `pass05_pending_encounters` table.

## The Clinical Reality

### Why This Matters

Real-world medical documents don't respect page boundaries:

```
Page 22:
┌─────────────────────────────────┐
│ CARDIOLOGY CONSULTATION         │
│                                 │
│ Patient presented with...       │
│ ... detailed assessment ...     │
│ ... treatment plan ...          │
│                                 │ <- Page break happens here
└─────────────────────────────────┘

Page 23:
┌─────────────────────────────────┐
│ Follow-up recommendations:      │ <- Orphaned! Needs page 22
│ - Continue medication           │
│ - Review in 2 weeks             │
│                                 │
│ PATHOLOGY REPORT                │ <- Safe split BEFORE this
│ Specimen: Blood sample          │
│ ...                             │
└─────────────────────────────────┘
```

**Problem:** If you batch pages 22 and 23 separately, the follow-up recommendations lose their context.

**Solution:** Pass 0.5 identifies that:
- Page 22-23 boundary is UNSAFE (consultation continues)
- Mid-page 23 (before "PATHOLOGY REPORT") is SAFE (new encounter starts)

## Text Marker Approach

### What is a Text Marker?

A text marker is a descriptive phrase identifying a location in the document where a split is safe.

**Examples:**
```json
{
  "safe_split_points": [
    {
      "page": 5,
      "marker": "just before header 'EMERGENCY DEPARTMENT NOTES'",
      "split_type": "new_encounter",
      "confidence": 0.95
    },
    {
      "page": 12,
      "marker": "just before image showing chest X-ray",
      "split_type": "new_section",
      "confidence": 0.85
    },
    {
      "page": 23,
      "marker": "just before header 'PATHOLOGY REPORT'",
      "split_type": "new_encounter",
      "confidence": 0.90
    }
  ]
}
```

### Why Text Markers?

**Simpler than bbox coordinates:**
- AI can describe locations naturally
- Human-readable for debugging
- Convertible to coordinates later via OCR bbox lookup

**Precise enough:**
- Downstream can convert to Y-coordinates using `ocr_raw_jsonb`
- Allows text erasure for partial-page batching

## Safe Split Point Identification

### What Makes a Split Safe?

A split is safe when the content after the split point can stand alone with just the encounter context.

**Safe Split Criteria:**
1. New encounter begins (different date, provider, or facility)
2. Clear section header introduces new topic
3. New document type or progress note starts (e.g., pathology report after consultation, or successive unique progress notes within the same admission, that could all be safely seperated into seperate batches)
4. Table ends and narrative text begins

**Unsafe Split Criteria:**
1. Mid-paragraph in continuous narrative
2. Middle of a table or list
3. Continuation of a letter or report
4. Caption follows image on next page
5. Results reference earlier context

### AI Prompt Requirements for V11

The V11 prompt needs additional instructions for batching analysis:

```markdown
## SAFE SPLIT POINT IDENTIFICATION

For downstream parallel processing, identify safe points where this document
could be split without losing clinical context.

### Rules for Safe Splits

A split point is SAFE if content after the split can be understood with just
the encounter context (date, provider, facility, chief complaint).

Mark as SAFE:
- Just before a new encounter header (different date/provider)
- Just before a clear section header (e.g., "PATHOLOGY REPORT", "Progress note")
- Just before an image introducing new evidence
- Natural boundaries between complete clinical narratives

Mark as UNSAFE:
- Mid-paragraph in continuous text
- Middle of tables or lists
- Between related content (e.g., image and its caption)
- Where later content references earlier content on same pages

### Output Format

For each safe split point, provide:
- Page number where split occurs
- Text marker describing exact location (e.g., "just before header 'DISCHARGE SUMMARY'")
- Split type (new_encounter, new_section, new_document, new_evidence)
- Confidence (0.0-1.0)

### Analysis Frequency

Analyze inter-page and intra-page boundaries:
- Every page boundary (between pages)
- Significant headers or images within pages
- Aim for approximately 1 split point per 3 pages minimum
- Must identify at least 1 split point per 5 pages maximum
```

### Example AI Output

```json
{
  "safe_split_points": [
    {
      "page": 5,
      "marker": "just before header 'EMERGENCY DEPARTMENT NOTES'",
      "split_type": "new_encounter",
      "confidence": 0.95,
      "justification": "New encounter with different date (15/03/2024) and facility (City Hospital ED). Previous content was outpatient consultation at different location."
    },
    {
      "page": 8,
      "marker": "just before header 'RADIOLOGY REPORT'",
      "split_type": "new_document",
      "confidence": 0.90,
      "justification": "Standalone diagnostic report. Does not reference prior content except patient demographics. Can be batched independently."
    },
    {
      "page": 12,
      "marker": "just before image showing chest X-ray",
      "split_type": "new_evidence",
      "confidence": 0.85,
      "justification": "Image introduces new clinical evidence with accompanying report. Previous content concluded with treatment plan."
    }
  ],
  "unsafe_boundaries": [
    {
      "pages": [3, 4],
      "reason": "Consultation letter continues across page boundary. Page 4 content references assessment from page 3."
    },
    {
      "pages": [10, 11],
      "reason": "Lab results table spans both pages. Cannot separate without losing result context."
    }
  ]
}
```

## Data Format for `page_separation_analysis`

### Schema

```sql
ALTER TABLE pass05_pending_encounters
  ADD COLUMN page_separation_analysis jsonb;
```

### JSON Structure

```json
{
  "version": "1.0",
  "analysis_date": "2024-11-14T10:30:00Z",
  "total_pages": 142,
  "safe_split_points": [
    {
      "page": 5,
      "marker": "just before header 'EMERGENCY DEPARTMENT NOTES'",
      "split_type": "new_encounter",
      "confidence": 0.95,
      "justification": "New encounter with different date..."
    }
  ],
  "unsafe_boundaries": [
    {
      "pages": [3, 4],
      "reason": "Consultation letter continues..."
    }
  ],
  "metadata": {
    "splits_identified": 28,
    "avg_split_confidence": 0.88,
    "pages_per_split": 5.1
  }
}
```

### Field Definitions

**safe_split_points** (array):
- `page` (integer): Page number where split occurs
- `marker` (string): Descriptive text identifying split location
- `split_type` (enum): Type of boundary
  - `new_encounter` - Different healthcare visit begins
  - `new_document` - Different document type starts
  - `new_section` - New major section within same encounter
  - `new_evidence` - New clinical evidence (image, lab, etc.)
- `confidence` (decimal): AI confidence in split safety (0.0-1.0)
- `justification` (string): Why this split is safe

**unsafe_boundaries** (array):
- `pages` (array): Page range that cannot be split
- `reason` (string): Why splitting would lose context

**metadata** (object):
- `splits_identified` (integer): Total safe splits found
- `avg_split_confidence` (decimal): Average confidence across all splits
- `pages_per_split` (decimal): Average pages between splits

## Converting Text Markers to Coordinates

### OCR Bbox Lookup

When downstream Pass 1/2 needs actual Y-coordinates for text erasure:

1. Read `ocr_raw_jsonb` from `shell_files` table
2. Search for text matching the marker
3. Extract bbox coordinates
4. Use Y-coordinate as split line

**Example Process:**

```typescript
// Text marker from Pass 0.5
const marker = "just before header 'PATHOLOGY REPORT'";

// Extract search term
const searchTerm = "PATHOLOGY REPORT";

// Read OCR data
const ocrData = shellFile.ocr_raw_jsonb;

// Find matching text in OCR bbox data
const match = findTextInOcr(ocrData, searchTerm, page: 23);

// Result
const splitYCoordinate = match.bbox.y; // e.g., 450 pixels from top
```

### Text Erasure Implementation

Using `sharp` npm package to white-out excluded regions:

```typescript
import sharp from 'sharp';

async function createPartialPageBatch(
  pdfPages: Buffer[],
  splitPoint: SafeSplitPoint
): Promise<Buffer[]> {

  const page = pdfPages[splitPoint.page - 1];
  const splitY = await convertMarkerToCoordinate(splitPoint.marker);

  // Create two partial pages
  const topPortion = await sharp(page)
    .extract({
      left: 0,
      top: 0,
      width: pageWidth,
      height: splitY
    })
    .toBuffer();

  const bottomPortion = await sharp(page)
    .extract({
      left: 0,
      top: splitY,
      width: pageWidth,
      height: pageHeight - splitY
    })
    .toBuffer();

  return [topPortion, bottomPortion];
}
```

## Pass 0.5 Internal Chunking vs Downstream Batching

### Critical Distinction

**Pass 0.5 Internal Chunking:**
- Fixed 50-page chunks for progressive processing
- Internal implementation detail
- Irrelevant to downstream batching

**Downstream Batching (Pass 1/2):**
- Variable-size batches based on safe split points
- Uses `page_separation_analysis` data from Pass 0.5
- Completely independent of 50-page chunks

### Example Scenario

**Document:** 142 pages, single hospital admission

**Pass 0.5 Processing:**
- Chunk 1: Pages 1-50
- Chunk 2: Pages 51-100
- Chunk 3: Pages 101-142
- All chunks get batching analysis
- Results stored in `page_separation_analysis`

**Pass 0.5 Output:**
- 1 final encounter (cascade-linked)
- 28 safe split points identified across all 142 pages
- Split points stored in encounter's `page_separation_analysis`

**Downstream Pass 1/2 Batching:**
- Reads the 28 safe split points
- Creates batches: [1-12], [13-28], [29-45], [46-67], ...
- Batch boundaries respect split points
- Completely ignores Pass 0.5's 50-page chunks

## Implementation Timeline

### Phase 1: V11 Prompt Addition
- Add batching analysis instructions to V11 prompt
- Test with 142-page document
- Validate split point quality

### Phase 2: Response Processing
- Update post-processor to extract `safe_split_points`
- Store in `page_separation_analysis` column
- Validate JSON structure

### Phase 3: Coordinate Conversion (Future)
- Implement text marker to Y-coordinate conversion
- Build OCR bbox lookup utilities
- Test text erasure implementation

### Phase 4: Downstream Integration (Future)
- Pass 1/2 reads `page_separation_analysis`
- Creates variable-size batches
- Implements text erasure for partial pages

## Success Metrics

### Pass 0.5 Deliverables

1. **Coverage:** At least 1 split point per 5 pages maximum
2. **Precision:** Average split confidence >0.85
3. **Accuracy:** <5% false positives (unsafe marked as safe)
4. **Completeness:** No encounters >10 pages without split points

### Validation Criteria

1. All safe splits are truly context-independent
2. No unsafe boundaries missed
3. Justifications are specific and accurate
4. Text markers are unambiguous and findable in OCR data

## Example Real-World Scenarios

### Scenario 1: Multi-encounter Document

**Document:** 45 pages, 3 encounters (GP visit, ED visit, specialist consult)

**Expected Output:**
```json
{
  "safe_split_points": [
    {
      "page": 8,
      "marker": "just before header 'EMERGENCY DEPARTMENT TRIAGE'",
      "split_type": "new_encounter",
      "confidence": 0.98
    },
    {
      "page": 28,
      "marker": "just before header 'CARDIOLOGY CONSULTATION'",
      "split_type": "new_encounter",
      "confidence": 0.95
    }
  ]
}
```

### Scenario 2: Single Long Encounter

**Document:** 142 pages, single hospital admission

**Expected Output:**
```json
{
  "safe_split_points": [
    {
      "page": 5,
      "marker": "just before header 'DAY 2 PROGRESS NOTES'",
      "split_type": "new_section",
      "confidence": 0.90
    },
    {
      "page": 12,
      "marker": "just before image showing chest X-ray dated 16/03/2024'",
      "split_type": "new_evidence",
      "confidence": 0.85
    },
    {
      "page": 28,
      "marker": "just before header 'PATHOLOGY RESULTS - 18/03/2024'",
      "split_type": "new_document",
      "confidence": 0.92
    },
    // ... 25 more split points across 142 pages
  ]
}
```

### Scenario 3: Dense Lab Results

**Document:** 20 pages, all pathology reports

**Expected Output:**
```json
{
  "safe_split_points": [
    {
      "page": 3,
      "marker": "just before header 'CHEMISTRY PANEL'",
      "split_type": "new_document",
      "confidence": 0.88
    },
    {
      "page": 7,
      "marker": "just before header 'HEMATOLOGY RESULTS'",
      "split_type": "new_document",
      "confidence": 0.90
    },
    {
      "page": 12,
      "marker": "just before header 'MICROBIOLOGY CULTURE'",
      "split_type": "new_document",
      "confidence": 0.92
    }
  ],
  "unsafe_boundaries": [
    {
      "pages": [4, 5],
      "reason": "Chemistry results table spans both pages with reference ranges on page 5"
    }
  ]
}
```

## Future Enhancements

### Phase 1 (V11 Implementation)
- Text marker approach
- Basic split type classification
- Confidence scoring

### Phase 2 (Coordinate Conversion)
- OCR bbox lookup implementation
- Text marker validation
- Ambiguity detection

### Phase 3 (Advanced Analysis)
- Bbox coordinates as primary output
- Text markers as fallback
- Multi-column detection
- Table boundary detection

### Phase 4 (ML Enhancement)
- Learn from manual corrections
- Improve confidence calibration
- Detect complex document layouts

## Appendix: V11 Prompt Section

```markdown
## DOWNSTREAM BATCHING ANALYSIS

Identify safe points where this document could be split for parallel processing.

### What Makes a Split Safe?

Content after the split point must be understandable with just the encounter
context (date, provider, facility, chief complaint).

### Safe Split Examples

SAFE:
- Just before "EMERGENCY DEPARTMENT NOTES" (new encounter, different date)
- Just before "PATHOLOGY REPORT" (standalone document)
- Just before chest X-ray image (new clinical evidence)
- Just before "DAY 3 PROGRESS NOTES" (clear section boundary)

UNSAFE:
- Middle of paragraph discussing treatment plan
- Between table and its legend
- Between image and its interpretation
- Between recommendation and its rationale

### Output Format

```json
{
  "safe_split_points": [
    {
      "page": 5,
      "marker": "just before header 'EMERGENCY DEPARTMENT NOTES'",
      "split_type": "new_encounter",
      "confidence": 0.95,
      "justification": "New encounter with different date (15/03/2024) and facility. Previous content was complete outpatient consultation."
    }
  ],
  "unsafe_boundaries": [
    {
      "pages": [3, 4],
      "reason": "Consultation letter continues across pages. Page 4 references assessment from page 3."
    }
  ]
}
```

### Analysis Requirements

- Identify both inter-page (between pages) and intra-page (within pages) splits
- Aim for approximately 1 split per 3 pages minimum
- Must identify at least 1 split per 5 pages maximum
- Provide specific justifications for each split point
- Mark unsafe boundaries where content must stay together
```

## Conclusion

Pass 0.5's batching task provides essential infrastructure for downstream parallel processing by:

1. Identifying safe split points at intra-page granularity
2. Using simple text markers convertible to coordinates
3. Storing data in `page_separation_analysis` for downstream use
4. Enabling variable-size batching that respects clinical context

The key insight: Split points exist wherever clinical context changes, whether at page boundaries or mid-page. By identifying these points during Pass 0.5, we enable downstream Pass 1/2 to batch intelligently without losing clinical meaning.





Xavier's notes 15th Nov 2025
1. Let's have pass05 also provide the bbox y coordinate along with the descriptive marker, since it will already have that data and this should be more accurate as it's understanding the content and making the match. Having both the marker and the y coordinate data point in tandem would be ideal. 
2. If the split point is something like "marker: just before header 'EMERGENCY DEPARTMENT NOTES'", we need to ensure the actual split happens just above those words; so the downstream logic should add a buffer zone extending above the top of the phrase. The same idea applies for the y coordinate—a small buffer above the y coordinate as well. I'm not sure how to define this buffer (in y coordinate terms, since I don't fully understand what units they use), but as a rule of thumb it should be the height of the letter or header in question—e.g., the height of "EMERGENCY DEPARTMENT NOTES"—as the buffer. I'll leave it to you to work out exactly how to design this buffer zone above. 
3. What is the value in having the AI output unsafe boundaries? Would it be simpler and more useful to only ask the AI for safe split points, reducing token output? Also, we should clarify how to express when a split point is a natural (inter-page) boundary between two pages; currently, this isn't clearly differentiated. It's preferable if we can mark these natural page splits explicitly in the output—maybe call them intra- and inter-page safe split points. For inter-page splits, you may not need to provide marker/y coordinate data in the same way as intra-page splits, but use your discretion. 
4. Is the design to have this page separation analysis output stored as a JSON blob in a column? Which table will it live in—will it be in the chunks table (since pass05 operates in chunks), or in the page assignments table, pass05 metrics, or the shell_files table? If it's in shell_files, I'm not sure how the output would get consolidated there when pass05 works in chunks that are stitched together at the end. Please consider all options and whether we need new tables/columns, etc. I've noticed there may already be a table or column for this purpose—page_separation_analysis—but how does each chunk append its results there in a neat way? Will there be a column per chunk's page separation analysis output, or will each chunk overwrite or add to the previous output? Think through how best to aggregate these results.


⏺ Excellent questions! Let me address each one:

  1. AI Provides Both Text Marker AND Y-Coordinate

  Agreed - this is better. Pass 0.5 has the OCR data loaded during processing, so it can do the bbox
  lookup itself and provide both:

  {
    "page": 23,
    "marker": "just before header 'PATHOLOGY REPORT'",
    "y_coordinate": 450,
    "split_type": "new_document",
    "confidence": 0.92
  }

  This is more accurate because the AI is analyzing the content and can make the correct match, rather
  than downstream having to guess which "PATHOLOGY REPORT" instance is the right one.

  2. Buffer Zone Above Split Point

  Y-coordinates in OCR typically measure pixels from the top of the page. If text has a bbox like:
  {
    "text": "EMERGENCY DEPARTMENT NOTES",
    "bbox": {
      "x": 100,
      "y": 450,    // Top of text
      "width": 400,
      "height": 24  // Height of text
    }
  }

  Buffer formula: Split point should be y_coordinate - height (one text-height above).

  So if the header is at y=450 with height=24, the actual split line should be at y=426.

  Better approach: Have the AI output TWO y-coordinates:
  {
    "page": 23,
    "marker": "just before header 'PATHOLOGY REPORT'",
    "text_y_top": 450,        // Where the text starts
    "split_y": 426,           // Actual split line (with buffer)
    "text_height": 24,        // For reference
    "split_type": "new_document"
  }

  This way Pass 0.5 calculates the buffer during processing when it has all the context.

  3. Remove Unsafe Boundaries + Inter vs Intra-Page Splits

  You're right - unsafe boundaries are redundant. If we only mark safe splits, everything else is
  implicitly unsafe.

  Inter-page vs Intra-page distinction is critical:

  {
    "safe_split_points": [
      {
        "split_location": "inter_page",  // NEW FIELD
        "page_before": 5,
        "page_after": 6,
        "marker": "natural page boundary",
        "y_coordinate": null,  // Not needed for inter-page
        "split_type": "natural_page_break",
        "confidence": 1.0
      },
      {
        "split_location": "intra_page",  // NEW FIELD
        "page": 23,
        "marker": "just before header 'PATHOLOGY REPORT'",
        "text_y_top": 450,
        "split_y": 426,
        "text_height": 24,
        "split_type": "new_document",
        "confidence": 0.92
      }
    ]
  }

  Inter-page splits are simpler (no coordinates needed), intra-page splits need the bbox data.

  4. Storage Strategy - THIS IS THE BIG ONE

  You're right to question this! I made an error in the original design. Let me think through the
  options:

  The Problem: Pass 0.5 processes in 50-page chunks, but batching analysis is document-wide.

  Option A: Store in pass05_chunk_results (Per-Chunk)

  -- Each chunk has its own analysis
  ALTER TABLE pass05_chunk_results
    ADD COLUMN page_separation_analysis jsonb;

  How it works:
  - Chunk 1 analyzes pages 1-50, stores split points for those pages
  - Chunk 2 analyzes pages 51-100, stores split points for those pages
  - Chunk 3 analyzes pages 101-142, stores split points for those pages

  At reconciliation: Combine all chunks' analyses into final document analysis.

  Pro: Natural fit with chunk processing
  Con: Fragmented data until reconciliation

  Option B: Store in shell_files (Document-Wide)

  -- Final document-level analysis
  ALTER TABLE shell_files
    ADD COLUMN page_separation_analysis jsonb;

  How it works:
  - Start with empty array []
  - After each chunk completes, append its split points to the array
  - Use array concatenation: page_separation_analysis = page_separation_analysis || new_splits

  Pro: Single source of truth
  Con: Requires array merging logic

  Option C: NEW TABLE pass05_split_points (Normalized)

  CREATE TABLE pass05_split_points (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid REFERENCES pass05_progressive_sessions(id),
    shell_file_id uuid REFERENCES shell_files(id),
    chunk_number integer,
    split_location varchar(20),  -- 'inter_page' or 'intra_page'
    page_before integer,         -- For inter-page
    page_after integer,          -- For inter-page
    page integer,                -- For intra-page
    marker text,
    text_y_top integer,
    split_y integer,
    text_height integer,
    split_type varchar(30),
    confidence decimal(3,2),
    justification text,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX idx_split_points_session ON pass05_split_points(session_id);
  CREATE INDEX idx_split_points_file ON pass05_split_points(shell_file_id);

  How it works:
  - Each chunk inserts rows for its split points
  - Query all rows for a session to get complete analysis
  - Can be aggregated into jsonb for downstream use

  Pro: Normalized, queryable, no array merging needed
  Con: More complex queries, another table to manage

  My Recommendation: Hybrid Approach

  Storage in TWO places:

  1. Per-Chunk (Working Data): pass05_chunk_results.page_separation_analysis
  2. Final Document (After Reconciliation): shell_files.page_separation_analysis

  Flow:
  Chunk 1 completes → Stores split points in pass05_chunk_results (chunk 1 row)
  Chunk 2 completes → Stores split points in pass05_chunk_results (chunk 2 row)
  Chunk 3 completes → Stores split points in pass05_chunk_results (chunk 3 row)
  ↓
  Reconciliation runs → Combines all chunks' analyses
  ↓
  Final analysis stored in shell_files.page_separation_analysis

  SQL for reconciliation:
  -- Combine all chunks' split points
  UPDATE shell_files sf
  SET page_separation_analysis = (
    SELECT jsonb_build_object(
      'version', '1.0',
      'total_pages', sf.number_of_pages,
      'safe_split_points', jsonb_agg(split_point)
    )
    FROM (
      SELECT jsonb_array_elements(cr.page_separation_analysis->'safe_split_points') as split_point
      FROM pass05_chunk_results cr
      WHERE cr.session_id = sf.progressive_session_id
      ORDER BY cr.chunk_number
    ) splits
  )
  WHERE sf.id = ?;

  This gives us:
  - During processing: Each chunk's analysis available in pass05_chunk_results
  - After completion: Complete document analysis in shell_files
  - For downstream: Simple read from shell_files.page_separation_analysis

  What do you think? Should I update the 06-BATCHING-TASK-DESIGN.md file with:
  1. AI outputs both marker + y-coordinates (with split_y calculated)
  2. Buffer zone logic (text height above)
  3. Remove unsafe_boundaries
  4. Add inter_page vs intra_page distinction
  5. Hybrid storage strategy (chunk_results during processing, shell_files after reconciliation)




Xavier's response 15th Nov 2025:
1. I just had a thought. You know how we have encounter orders that will be within a chunk—potentially they are perfect split points—but I doubt they're going to be included in the page splits for the batching task design JSON output. I'm not sure whether they should be, or whether downstream will just be provided with two different data pieces: one being the batching output data blob and the other being the encounter output data blob. It can then always split based on an encounter, but also split based on a safe inter- or intra-page split point. Do you get what I'm saying? In other words, should we build encounter split points into this batching task design AI output, or do we just leave it separate because the downstream AI models will be provided with all the data anyway?



⏺ Excellent point! You're absolutely right - encounter boundaries are inherently perfect split
  points, but we have a design choice to make.

  Let me think through both options:

  Option A: Include Encounter Boundaries in Batching Output

  The AI would explicitly mark encounter boundaries as split points:

  {
    "safe_split_points": [
      {
        "split_location": "inter_page",
        "between_pages": [7, 8],
        "split_type": "encounter_boundary",  // NEW TYPE
        "encounter_transition": true,        // Flag it
        "confidence": 1.0,
        "justification": "Encounter 1 ends page 7, Encounter 2 begins page 8"
      },
      {
        "split_location": "intra_page",
        "page": 23,
        "marker": "just before encounter 2 start",
        "split_type": "encounter_boundary",  // NEW TYPE
        "encounter_transition": true,
        "confidence": 1.0,
        "justification": "Encounter boundary - always safe to split"
      }
    ]
  }

  Pros:
  - Single source of truth for ALL split points
  - Downstream doesn't need to merge two data sources
  - Explicit about WHY it's safe (encounter boundary)

  Cons:
  - Redundant with encounter data
  - Could get out of sync if reconciliation changes encounter boundaries
  - More complex AI prompt

  Option B: Keep Separate (Your Instinct)

  Batching output only includes non-encounter split points:

  {
    "safe_split_points": [
      // Only WITHIN-encounter split points
      {
        "split_location": "intra_page",
        "page": 45,
        "marker": "just before header 'DAY 3 PROGRESS NOTES'",
        "split_type": "new_section",  // Within same encounter
        "confidence": 0.90,
        "justification": "Safe to split progress notes within admission"
      }
    ]
  }

  Downstream combines:
  // Downstream Pass 1/2 logic
  const encounters = shellFile.encounters; // [{start: 1, end: 50}, {start: 51, end: 100}]
  const batchingSplits = shellFile.page_separation_analysis.safe_split_points;

  // Merge both sources
  const allSplitPoints = [
    ...getEncounterBoundaries(encounters),  // Always safe
    ...batchingSplits                       // Additional safe points
  ].sort((a, b) => getPageNumber(a) - getPageNumber(b));

  Pros:
  - Clean separation of concerns
  - Encounter boundaries are ALWAYS safe (no AI judgment needed)
  - No redundancy or sync issues
  - Simpler AI task (only find ADDITIONAL split points)

  Cons:
  - Downstream needs to merge two data sources
  - Slightly more complex downstream logic

  My Recommendation: Option B (Keep Separate)

  Here's why:

  1. Encounter boundaries are definitionally safe - no AI analysis needed. They're guaranteed
  split points by the nature of what an encounter is.
  2. Separation of concerns - Encounter discovery finds encounters, batching analysis finds
  additional safe splits WITHIN encounters.
  3. No synchronization issues - If reconciliation merges/splits encounters, we don't need to
  update the batching analysis.
  4. Cleaner mental model:
    - Encounters = Primary document structure
    - Batching splits = Secondary optimization points
  5. Downstream is simple:
  // Pseudocode
  splitPoints = encounterBoundaries.concat(additionalSplits).sort()

  Updated Design Clarification

  We should add this to the V2 document:

  ## Relationship to Encounter Boundaries

  **Important:** This batching analysis identifies ADDITIONAL safe split points beyond encounter
  boundaries.

  Encounter boundaries (where one encounter ends and another begins) are ALWAYS safe split points
   and don't need to be included in the batching analysis output.

  **Downstream Processing Model:**
  1. Encounter boundaries from `healthcare_encounters` table = Primary splits
  2. Batching analysis from `page_separation_analysis` = Additional splits within encounters
  3. Downstream combines both sources for complete split point list

  **Example:**
  - Document has 2 encounters: pages 1-50 and 51-100
  - Batching analysis finds safe splits at pages 12, 28, 67, 89
  - Downstream creates batches: [1-12], [13-28], [29-50], [51-67], [68-89], [90-100]
    - Splits at 50/51 from encounter boundary
    - Other splits from batching analysis

  What do you think? Should we go with Option B and keep them separate? This feels cleaner and
  more maintainable to me.