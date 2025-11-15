# Pass 0.5 Strategy A - V11 Prompt Specification

**Date:** November 14, 2024 (Updated: November 15, 2024)
**Version:** 1.1
**Purpose:** Define the V11 unified progressive prompt for Strategy A

**UPDATE (Nov 15, 2024):** Position tracking updated to match batching design (inter_page/intra_page), added batching analysis output, added pseudo-encounter detection (Timeline Test from v2.9), added OCR integration.

## Executive Summary

V11 is the evolution of V10 designed specifically for Strategy A's simplified architecture. Key changes:
- Every encounter gets cascade_id detection logic
- Simplified handoff to just cascade context
- **Position tracking with inter_page vs intra_page boundaries (matches batching design)**
- **Batching analysis output for downstream Pass 1/2 splitting**
- **Pseudo-encounter detection using Timeline Test (from v2.9)**
- **OCR bounding box integration for precise Y-coordinates**
- Removed complex state management
- Clear instructions: AI never generates IDs

## Core Design Principles

1. **Universal Application**: Same prompt for 1-page to 1000-page documents
2. **Cascade Awareness**: Built-in logic for detecting cascading encounters
3. **Position Granularity**: Sub-page precision for encounter boundaries
4. **ID Agnostic**: AI describes encounters, system generates IDs
5. **Minimal Handoff**: Only cascade_id and semantic context passed

## Major Changes from V10

### 1. Removed Fields
- `tempId` - System generates, not AI
- `encounterId` - System generates, not AI
- Complex `status` field logic - Replaced with simpler `is_cascading` boolean

### 2. New Fields
```json
{
  "is_cascading": true,  // Does this touch chunk boundary?
  "continues_previous": false,  // Does this continue from previous chunk's cascade?
  "cascade_context": "admission continuing from previous",

  // Position tracking (inter_page vs intra_page)
  "start_boundary_type": "inter_page",
  "start_marker": "page begins with 'ADMISSION NOTE'",
  "start_text_y_top": null,  // null for inter_page
  "start_text_height": null,
  "start_y": null,

  "end_boundary_type": "intra_page",
  "end_marker": "before header 'DISCHARGE SUMMARY'",
  "end_text_y_top": 2400,  // From OCR bbox
  "end_text_height": 24,
  "end_y": 2376,  // Calculated: 2400 - 24

  "position_confidence": 0.92,

  // Pseudo-encounter detection (Timeline Test)
  "is_real_world_visit": true  // Has date + provider/facility
}
```

### 3. Simplified Handoff
**V10 Handoff (Complex):**
```json
{
  "pendingEncounter": {
    "tempId": "encounter_temp_chunk1_001",
    "partialData": {...},
    "expectedContinuation": "discharge_summary",
    "pageRanges": [[1,50]]
  },
  "activeContext": {...}
}
```

**V11 Handoff (Simple):**
```json
{
  "cascade_context": {
    "encounter_type": "hospital_admission",
    "summary": "STEMI patient in cardiac ICU",
    "expecting": "discharge_summary"
  }
}
```

## V11 Prompt Structure

### 1. Opening Context
```
You are a medical data extraction specialist analyzing healthcare documents.
This document has been split into {totalChunks} chunks of approximately 50 pages each.
You are processing chunk {chunkNumber} containing pages {startPage} to {endPage}.
```

### 2. Core Task Definition
```
# ENCOUNTER DISCOVERY WITH CASCADE DETECTION

Extract ALL healthcare encounters from this chunk. An encounter is any
documented interaction between a patient and healthcare provider(s).

CRITICAL: You are part of a cascade detection system. If an encounter's
documentation appears to continue beyond this chunk's last page, mark it
as cascading. The system will link it with its continuation in the next chunk.
```

### 3. Cascade Detection Rules
```
## WHEN TO MARK AS CASCADING (is_cascading: true)

An encounter is cascading if ANY of these conditions are met:

1. **Page Boundary Test**: The encounter's last page equals this chunk's last page
   AND the encounter appears incomplete (no discharge summary, no final notes)

2. **Content Incompleteness**: Clear indicators of more content:
   - Hospital admission without discharge documentation
   - Surgery without post-operative notes
   - Emergency visit without disposition
   - Multi-day stay where we haven't reached the end date

3. **Explicit Continuation**: Document says "continued on next page" or similar

4. **Sub-page Position**: Encounter ends in bottom three-quarters of last page
   (High probability it continues on next page)

IMPORTANT: Having an end date does NOT mean the encounter won't cascade.
A 2022 admission with 142 pages of documentation will cascade across chunks
even though the real-world encounter has ended.
```

### 4. Position Tracking Instructions (Inter-Page vs Intra-Page)
```
## POSITION TRACKING (MATCHES BATCHING DESIGN)

For each encounter, identify boundary types and precise coordinates:

### Boundary Types

**Inter-Page Boundaries:** Encounter starts at page top or ends at page bottom
- No pixel coordinates needed
- Highest confidence (page boundaries are always clean)
- Most common case
- Example: Hospital admission starts on page 1 (top) and ends on page 50 (bottom)

**Intra-Page Boundaries:** Encounter starts/ends mid-page
- Requires precise Y-coordinates from OCR data
- Include descriptive marker text
- Less common but critical for accuracy
- Example: Consultation ends mid-page, next encounter begins below

### Output Format

**For Inter-Page Start:**
{
  "start_boundary_type": "inter_page",
  "start_marker": "page begins with 'ADMISSION NOTE' header",
  "start_text_y_top": null,
  "start_text_height": null,
  "start_y": null
}

**For Intra-Page End:**
{
  "end_boundary_type": "intra_page",
  "end_marker": "before header 'DISCHARGE SUMMARY'",
  "end_text_y_top": 2400,  // From OCR bbox
  "end_text_height": 24,   // From OCR bbox
  "end_y": 2376           // Calculated: 2400 - 24
}

### OCR Coordinate Extraction

Use the provided OCR bounding box data to extract coordinates:
1. Locate the marker text in OCR data for the page
2. Extract bbox.y (top coordinate) as text_y_top
3. Extract bbox.height as text_height
4. Calculate split line: text_y_top - text_height (creates buffer zone above text)

### Position Confidence Scoring

- Inter-page boundaries: 1.0 (always reliable)
- Intra-page with clear marker + OCR coords: 0.9-1.0
- Intra-page estimated (no clear marker): 0.6-0.8
- Unclear boundaries: <0.6

Why this matters:
- Enables precise visual highlighting in UI
- Supports page cropping for encounter-specific PDFs
- Allows validation of AI-identified boundaries
```

### 5. Handoff Context Handling
```
## CASCADE CONTEXT FROM PREVIOUS CHUNK

{if cascade_context provided}
You received cascade context indicating an encounter continues from the previous chunk:
- Type: {encounter_type}
- Summary: {summary}
- Expecting: {expecting}

Instructions:
1. Look for the continuation of this encounter
2. When found, include cascade_context: "continues from previous chunk"
3. Start your pageRanges from where you find it in this chunk
4. If it ends in this chunk, mark is_cascading: false
5. If it continues beyond this chunk, mark is_cascading: true
```

### 6. Output Schema
```json
{
  "encounters": [
    {
      // NO IDs - System generates these
      "encounter_type": "hospital_admission",
      "is_cascading": true,
      "cascade_context": "admission continuing to next chunk",

      // Dates
      "encounter_start_date": "2024-03-15",
      "encounter_end_date": null,  // null if ongoing or unknown
      "date_source": "extracted",

      // Position data (inter_page vs intra_page)
      // IMPORTANT: Pages are document-absolute (1-N), NOT chunk-relative
      "start_page": 1,
      "start_boundary_type": "inter_page",
      "start_marker": "page begins with 'EMERGENCY ADMISSION'",
      "start_text_y_top": null,
      "start_text_height": null,
      "start_y": null,

      "end_page": 50,
      "end_boundary_type": "intra_page",
      "end_marker": "before header 'CONTINUED NEXT PAGE'",
      "end_text_y_top": 2800,
      "end_text_height": 24,
      "end_y": 2776,

      "position_confidence": 0.95,
      "page_ranges": [[1, 50]],

      // Pseudo-encounter detection (Timeline Test)
      "is_real_world_visit": true,  // Has date + provider/facility

      // Clinical content
      "provider_name": "Dr. Smith",
      "facility": "St Vincent's Hospital",
      "department": "Cardiac ICU",
      "chief_complaint": "Chest pain",
      "diagnoses": ["STEMI"],
      "procedures": ["PCI with stent"],
      "summary": "STEMI patient admitted for cardiac intervention",

      // Confidence
      "confidence": 0.95
    }
  ],
  "page_assignments": [
    {
      "page": 1,
      "encounter_index": 0,  // Index in encounters array
      "justification": "Contains 'ADMISSION NOTE' and date '15/03/2024'"
    }
  ],
  "cascade_package": {
    // Only populated if any encounters are cascading
    "encounter_type": "hospital_admission",
    "summary": "STEMI patient in cardiac ICU, PCI completed",
    "expecting": "discharge_summary"
  }
}
```

### 7. Key Instruction Changes

#### ID Generation
```
CRITICAL: Do NOT generate any IDs. The system will:
- Generate deterministic encounter IDs
- Assign cascade IDs when needed
- Create temporary IDs for pending storage

You only describe what you see.
```

#### Page Assignments
```
Page assignments now use encounter_index instead of encounter_id:
- First encounter in array: encounter_index = 0
- Second encounter: encounter_index = 1
- This links pages to encounters without requiring IDs

IMPLEMENTATION NOTE (for worker code):
When persisting page assignments, the worker will:
1. Map encounter_index → system-generated pending_id
2. Store in pass05_page_assignments with encounter_id = pending_id
3. Leave encounter_id as temp ID until reconciliation
4. After reconciliation, update encounter_id → final healthcare_encounters.id
```

#### Cascade Package
```
The cascade_package is your handoff to the next chunk.
Only populate if you have cascading encounters.
Keep it minimal - just enough context for continuity.
```

### 8. Pseudo-Encounter Detection (Timeline Test)

```
## PSEUDO-ENCOUNTER DETECTION (FROM V2.9)

### Core Principle: Timeline Test

A healthcare encounter is **timeline-worthy** when it has BOTH:
1. **Specific Date**: YYYY-MM-DD or YYYY-MM format
2. **Provider OR Facility**: Named healthcare provider OR specific facility

**Timeline-Worthy (Real World Visits):**
- "Admitted to St Vincent's Hospital 2024-03-10" (date + facility) ✓
- "GP visit with Dr. Jones on 2024-01-15" (date + provider) ✓
- "Pathology report collected 03-Jul-2025 at NSW Health Pathology" (date + facility) ✓
- "Imaging study dated 15-Mar-2024 from City Radiology" (date + facility) ✓

**NOT Timeline-Worthy (Pseudo-Encounters):**
- Medication lists without visit dates ✗
- Lab reports without collection dates ✗
- Administrative summaries without specific encounter dates ✗
- Insurance forms ✗
- General health information summaries ✗

### Output Field

is_real_world_visit: true   // Passes Timeline Test (has date + provider/facility)
is_real_world_visit: false  // Fails Timeline Test (pseudo-encounter)

### Examples

**Real World Visit:**
{
  "encounter_type": "outpatient",
  "is_real_world_visit": true,
  "encounter_start_date": "2025-07-03",
  "provider_name": null,
  "facility": "NSW Health Pathology",
  "summary": "Pathology test collected 03-Jul-2025"
}

**Pseudo-Encounter:**
{
  "encounter_type": "medication_list",
  "is_real_world_visit": false,
  "encounter_start_date": null,
  "provider_name": null,
  "facility": "Sydney Hospital Pharmacy",
  "summary": "Pharmacy dispensing label for moxifloxacin 400 mg"
}

**CRITICAL:** Lab/imaging reports WITH specific collection/study dates + facility ARE timeline-worthy (real world visits).
```

### 9. Batching Analysis Output

```
## BATCHING ANALYSIS (NEW IN V11)

In addition to encounter detection, identify ADDITIONAL safe split points WITHIN encounters for downstream Pass 1/2 batching.

### Critical Rules

1. **DO NOT mark encounter boundaries as split points** - those are handled separately
2. **Only identify splits WITHIN encounters** - places where parallel processing is safe
3. **Provide precise coordinates for intra-page splits**

### Two Types of Split Points

**Inter-Page Splits:**
Natural page boundaries WITHIN same encounter where content naturally separates.

Example: Page 11 ends Day 2 notes, Page 12 begins radiology report (same admission)

**Intra-Page Splits:**
Safe split points within a single page.

Example: Page 23 has consultation ending mid-page, pathology report beginning below

### Output Structure

{
  "page_separation_analysis": {
    "chunk_number": 1,
    "pages_analyzed": [1, 50],
    "safe_split_points": [
      {
        "split_location": "inter_page",
        "between_pages": [11, 12],
        "split_type": "natural_boundary",
        "confidence": 1.0,
        "justification": "Day 2 notes end page 11. Radiology begins page 12."
      },
      {
        "split_location": "intra_page",
        "page": 23,
        "marker": "just before header 'PATHOLOGY REPORT'",
        "text_y_top": 1200,
        "split_y": 1178,
        "text_height": 22,
        "split_type": "new_document",
        "confidence": 0.92,
        "justification": "Consultation concludes. New pathology document begins."
      }
    ],
    "metadata": {
      "splits_found": 8,
      "avg_confidence": 0.94,
      "inter_page_count": 3,
      "intra_page_count": 5
    }
  }
}

### Safe Split Criteria

Mark as SAFE when content after split can be understood with just encounter context:
- Clear section headers WITHIN encounter ("PATHOLOGY REPORT", "DAY 2 NOTES")
- New document type starts within same encounter
- Complete clinical narrative ends, new one begins
- Successive progress notes within same admission

### Analysis Frequency

- Examine every page boundary for potential inter-page splits
- Look for intra-page splits at major headers and transitions
- Aim for 1 split per 3-5 pages minimum
```

### 10. OCR Bounding Box Data Format

```
## OCR INTEGRATION

You receive OCR data in this format alongside the document text:

{
  "pages": [
    {
      "page_number": 1,
      "blocks": [
        {
          "text": "EMERGENCY ADMISSION",
          "bbox": {
            "x": 100,
            "y": 150,
            "width": 400,
            "height": 24
          }
        }
      ]
    }
  ]
}

### How to Extract Coordinates

1. **Find marker text:** Search OCR blocks for the header/marker
2. **Extract y-coordinate:** Use bbox.y as text_y_top
3. **Extract height:** Use bbox.height as text_height
4. **Calculate split line:** text_y_top - text_height (creates buffer above text)

### Coordinate System

- Origin: Top-left of page
- Y-axis: Increases downward
- Units: Pixels
- Typical page: 2550 x 3300 pixels (8.5" x 11" at 300 DPI)

### When to Use Coordinates

- **Intra-page encounter boundaries:** When encounter starts/ends mid-page
- **Intra-page batching splits:** When safe split point exists within a page
- **Inter-page boundaries:** Coordinates NOT needed (use page boundary)
```

## Implementation Strategy

### Phase 1: Core V11 Prompt
1. Create `aiPrompts.v11.ts` with new structure
2. Remove ID generation logic
3. Add position tracking
4. Implement cascade detection

### Phase 2: Response Processing
1. Update post-processor for V11 response format
2. Generate IDs after AI processing
3. Extract position data
4. Build cascade packages

### Phase 3: Integration
1. Update chunk-processor to use V11
2. Modify handoff-builder for cascade packages
3. Test with 142-page document
4. Verify single encounter result

## Testing Scenarios

### Scenario 1: Single Chunk Document (20 pages)
- Expected: No cascading, no cascade package
- Position data for single encounter
- Complete encounter within chunk

### Scenario 2: Multi-Chunk Single Encounter (142 pages)
- Chunk 1: is_cascading=true, cascade package created
- Chunk 2: Receives context, is_cascading=true
- Chunk 3: Receives context, is_cascading=false (ends here)
- Result: 1 final encounter with pages [1,142]

### Scenario 3: Multi-Encounter Multi-Chunk
- Multiple encounters, some cascade, some don't
- Proper cascade_id assignment
- Correct page assignments

## Migration Path from V10

### Step 1: Parallel Testing
- Run V10 and V11 on same documents
- Compare results
- Tune V11 instructions based on differences

### Step 2: Gradual Rollout
- Start with documents <100 pages
- Monitor cascade detection accuracy
- Expand to larger documents

### Step 3: Full Migration
- Replace V10 with V11
- Update all processors
- Delete V10 code

## Success Metrics

1. **Cascade Detection Accuracy**: >95% correct cascade identification
2. **Position Accuracy**: >80% correct position estimates
3. **Encounter Completeness**: No missed encounters
4. **Processing Efficiency**: <10% overhead vs V10
5. **142-Page Test**: Single encounter result

## Prompt Engineering Notes

### Cascade Detection Tuning
The cascade detection rules may need adjustment based on testing:
- Too aggressive: Many false cascades
- Too conservative: Missing real cascades
- Sweet spot: Slight over-detection (reconciler will merge)

### Position Granularity
V11 uses a two-tier precision system:
- **Inter-page boundaries:** No coordinates needed (natural page breaks)
- **Intra-page boundaries:** Precise Y-coordinates from OCR bounding boxes

This replaces the previous 5-position system (top/quarter/middle/three-quarters/bottom) with exact pixel-level positioning for mid-page boundaries.

### Context Window Management
V11 uses less context than V10:
- Smaller handoff packages
- No complex state tracking
- Focused on current chunk

This allows processing larger chunks or using smaller models.

## Future Enhancements

### Phase 1 (With V11)
- Basic position tracking
- Cascade detection
- Simplified handoff

### Phase 2 (V11.1)
- Bounding box support
- Pixel-level positions
- Visual layout awareness

### Phase 3 (V11.2)
- Multi-column detection
- Table/form awareness
- Handwritten note handling

## Appendix: Example V11 Responses

### Example 1: Single Complete Encounter
```json
{
  "encounters": [{
    "encounter_type": "outpatient_consultation",
    "is_cascading": false,
    "is_real_world_visit": true,
    "encounter_start_date": "2024-03-15",
    "encounter_end_date": "2024-03-15",

    "start_page": 1,
    "start_boundary_type": "inter_page",
    "start_marker": "page begins with 'CONSULTATION NOTE'",
    "start_text_y_top": null,
    "start_text_height": null,
    "start_y": null,

    "end_page": 3,
    "end_boundary_type": "intra_page",
    "end_marker": "before footer area",
    "end_text_y_top": 2200,
    "end_text_height": 20,
    "end_y": 2180,

    "position_confidence": 0.9,
    "page_ranges": [[1, 3]],
    "provider_name": "Dr. Jones",
    "facility": "City Medical",
    "summary": "Follow-up for hypertension",
    "confidence": 0.95
  }],
  "page_assignments": [
    {"page": 1, "encounter_index": 0, "justification": "Contains 'CONSULTATION NOTE'"},
    {"page": 2, "encounter_index": 0, "justification": "Shows 'blood pressure 140/90'"},
    {"page": 3, "encounter_index": 0, "justification": "Contains 'Plan: Continue lisinopril'"}
  ],
  "cascade_package": null,
  "page_separation_analysis": {
    "chunk_number": 1,
    "pages_analyzed": [1, 3],
    "safe_split_points": [],
    "metadata": {
      "splits_found": 0,
      "avg_confidence": 0,
      "inter_page_count": 0,
      "intra_page_count": 0
    }
  }
}
```

### Example 2: Cascading Encounter
```json
{
  "encounters": [{
    "encounter_type": "hospital_admission",
    "is_cascading": true,
    "is_real_world_visit": true,
    "cascade_context": "new admission starting in this chunk",
    "encounter_start_date": "2024-03-15",
    "encounter_end_date": null,

    "start_page": 1,
    "start_boundary_type": "inter_page",
    "start_marker": "page begins with 'EMERGENCY ADMISSION'",
    "start_text_y_top": null,
    "start_text_height": null,
    "start_y": null,

    "end_page": 50,
    "end_boundary_type": "inter_page",
    "end_marker": "page ends with 'Day 2 progress notes continuing'",
    "end_text_y_top": null,
    "end_text_height": null,
    "end_y": null,

    "position_confidence": 0.95,
    "page_ranges": [[1, 50]],
    "provider_name": "Dr. Smith",
    "facility": "St Vincent's Hospital",
    "summary": "STEMI admission, PCI performed, ongoing care",
    "confidence": 0.9
  }],
  "page_assignments": [
    {"page": 1, "encounter_index": 0, "justification": "Contains 'EMERGENCY ADMISSION'"},
    // ... pages 2-49 ...
    {"page": 50, "encounter_index": 0, "justification": "Shows 'Day 2 progress notes'"}
  ],
  "cascade_package": {
    "encounter_type": "hospital_admission",
    "summary": "STEMI patient, PCI completed, stable in CCU",
    "expecting": "discharge_summary"
  },
  "page_separation_analysis": {
    "chunk_number": 1,
    "pages_analyzed": [1, 50],
    "safe_split_points": [
      {
        "split_location": "inter_page",
        "between_pages": [11, 12],
        "split_type": "natural_boundary",
        "confidence": 1.0,
        "justification": "Page 11 ends Day 1 notes. Page 12 begins radiology report."
      },
      {
        "split_location": "intra_page",
        "page": 28,
        "marker": "just before header 'PATHOLOGY RESULTS'",
        "text_y_top": 1350,
        "split_y": 1328,
        "text_height": 22,
        "split_type": "new_document",
        "confidence": 0.91,
        "justification": "Progress notes end. Pathology report begins mid-page."
      }
    ],
    "metadata": {
      "splits_found": 2,
      "avg_confidence": 0.96,
      "inter_page_count": 1,
      "intra_page_count": 1
    }
  }
}
```

### Example 3: Continuing from Previous Chunk
```json
{
  "encounters": [{
    "encounter_type": "hospital_admission",
    "is_cascading": false,
    "continues_previous": true,
    "cascade_context": "continues from previous chunk",
    "encounter_start_date": "2024-03-15",
    "encounter_end_date": "2024-03-22",

    // Position data (inter_page vs intra_page)
    "start_page": 51,
    "start_boundary_type": "inter_page",
    "start_marker": "page begins mid-admission (continuation)",
    "start_text_y_top": null,
    "start_text_height": null,
    "start_y": null,

    "end_page": 75,
    "end_boundary_type": "intra_page",
    "end_marker": "before header 'OUTPATIENT CLINIC VISIT - 2024-03-30'",
    "end_text_y_top": 1850,
    "end_text_height": 24,
    "end_y": 1826,

    "position_confidence": 0.88,
    "is_real_world_visit": true,

    "page_ranges": [[51, 75]],
    "provider_name": "Dr. Roberts",
    "facility": "St Vincent's Hospital",
    "summary": "Discharge summary for STEMI admission",
    "confidence": 0.92
  }],
  "page_assignments": [
    {"page": 51, "encounter_index": 0, "justification": "Contains 'DISCHARGE SUMMARY'"},
    {"page": 52, "encounter_index": 0, "justification": "Medication reconciliation"},
    {"page": 53, "encounter_index": 0, "justification": "Discharge instructions"},
    {"page": 54, "encounter_index": 0, "justification": "Follow-up care plan"},
    // ... pages 55-74 omitted for brevity ...
    {"page": 75, "encounter_index": 0, "justification": "Shows 'Follow-up instructions'"}
  ],
  "cascade_package": null,
  "page_separation_analysis": {
    "chunk_number": 2,
    "pages_analyzed": [51, 100],
    "safe_split_points": [
      {
        "split_location": "inter_page",
        "between_pages": [62, 63],
        "split_type": "natural_boundary",
        "confidence": 1.0,
        "justification": "Page 62 ends discharge medications. Page 63 begins cardiology consult report."
      },
      {
        "split_location": "intra_page",
        "page": 75,
        "marker": "just before header 'OUTPATIENT CLINIC VISIT - 2024-03-30'",
        "text_y_top": 1850,
        "split_y": 1826,
        "text_height": 24,
        "split_type": "new_encounter",
        "confidence": 0.88,
        "justification": "Discharge summary ends. New outpatient visit begins mid-page (encounter boundary, not batching split)."
      }
    ],
    "metadata": {
      "splits_found": 2,
      "avg_confidence": 0.94,
      "inter_page_count": 1,
      "intra_page_count": 1
    }
  }
}
```

## Conclusion

V11 represents a significant simplification while improving accuracy. By removing ID generation from the AI and focusing on cascade detection and position tracking, we achieve:

1. Cleaner separation of concerns
2. More reliable encounter linking
3. Better sub-page precision
4. Simpler reconciliation logic
5. Reduced prompt complexity

The key insight: Let AI describe what it sees, let the system handle the mechanics.