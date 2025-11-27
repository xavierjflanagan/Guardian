# Pass 0.5 Strategy A - V12 Prompt Specification

**Date:** November 26, 2025
**Version:** V12 (MAJOR UPDATE from V11)
**Purpose:** Enhanced OCR coordinate integration for Pass 0.5 Strategy A
**Supersedes:** 04-PROMPT-V11-SPEC.md

---

## BREAKING CHANGES from V11

**V12 introduces enhanced OCR format with inline X+Y coordinates to solve table structure problems.**

### Key Changes:

1. **Enhanced OCR Input Format**: AI receives `[Y:###] text (x:###) | text (x:###)` instead of separate bounding box data
2. **Direct Y-Coordinate Output**: AI provides Y-coordinates directly for intra-page boundaries (no more marker extraction)
3. **Deprecated Fields**: marker_context, region_hint, text_y_top, text_height are now deprecated
4. **Simplified Logic**: Eliminates post-processing coordinate extraction step

### Why This Change?

**Primary Motivation: Pass 1 & Pass 2 Requirements**

The enhanced OCR format with X+Y coordinates was **primarily designed for Pass 1 (Entity Detection) and Pass 2 (Clinical Extraction)**, where spatial table relationships are critical for accurate entity extraction:

- **Problem:** Spatially-sorted OCR text loses horizontal table structure
- **Impact:** AI cannot determine which lab value corresponds to which date column
- **Consequence:** Multi-column tables are unreadable, preventing accurate clinical data extraction

**Secondary Benefit: Pass 0.5 Efficiency Improvement**

Since we're implementing enhanced OCR for Pass 1/2 anyway, we're applying it to Pass 0.5 as well:

- **V11 Approach:** AI provides descriptive text markers → post-processor extracts coordinates via fuzzy matching
  - Example: `"start_marker": "DISCHARGE SUMMARY", "start_marker_context": "...text...", "start_region_hint": "upper_middle"`
  - Requires ~50-100 tokens for context + post-processing extraction step

- **V12 Approach:** AI provides Y-coordinate directly from enhanced OCR
  - Example: `"start_y": 450, "start_marker": "DISCHARGE SUMMARY"`
  - Single integer output, ~40-60 tokens saved per boundary
  - No post-processing extraction needed

**Initial Hesitation Overcome:**

The original concern was that inline coordinates would:
1. Balloon input tokens excessively
2. Dilute AI model efficiency in the API pass

**Reality Check:**
- Input token increase: +14% (manageable)
- Output token savings: -40 to -60 per encounter boundary
- Net cost: Approximately balanced
- Accuracy improvement: Significant (precise pixel coordinates vs. fuzzy text matching)

**Conclusion:** Worth the tradeoff for both Pass 0.5 efficiency gains and Pass 1/2 spatial reasoning capability.

---

## Enhanced OCR Format (V12)

### What AI Receives

**V11 Format (Old):**
```
CHEERS, VINCENT
18 BURRELL ST, MCCRAE
Birthdate: 16/02/1959
Chemistry Results
Date
23/03/11
02/08/12
19/09/16
S T-BIL
16
14
7
```

**V12 Format (New - Enhanced):**
```
[Y:150] CHEERS, VINCENT (x:80)
[Y:180] 18 BURRELL ST, MCCRAE (x:80)
[Y:210] Birthdate: 16/02/1959 (x:80)
[Y:450] Chemistry Results (x:80)
[Y:480] Date (x:80) | 23/03/11 (x:220) | 02/08/12 (x:320) | 19/09/16 (x:420)
[Y:510] S T-BIL (x:20) | 16 (x:220) | 14 (x:320) | 7 (x:420)
```

### Format Specifications

**Line Format:** `[Y:###] text (x:###) | text (x:###) | ...`

**Components:**
- `[Y:###]` - Y-coordinate in pixels from top of page (groups text into lines)
- `text` - The actual text content
- `(x:###)` - X-coordinate in pixels from left of page
- `|` - Separator between words on same line

**Coordinate System:**
- Origin: Top-left of page
- Y-axis: Increases downward (0 at top, ~2263 at bottom for typical page)
- X-axis: Increases rightward (0 at left, ~1600 at right for typical page)
- Units: Pixels
- Typical page: 1600 x 2263 pixels

**CRITICAL: Y-Coordinate Semantics**
- All Y-coordinates represent the **TOP edge** of text bounding boxes
- Source: `ocr-formatter.ts` uses `vertices[0].y` (top-left vertex from Google Cloud Vision)
- `start_y` and `end_y`: TOP edge coordinates provided by AI
- `start_text_y_top` and `end_text_y_top`: DEPRECATED (redundant with start_y/end_y)
- Text height calculated separately for buffer zone safety

**Why This Works:**
- AI can see that "16" at x:220 aligns with "23/03/11" at x:220
- AI can see that "14" at x:320 aligns with "02/08/12" at x:320
- Spatial relationships preserved without complex bounding box parsing

---

## Output Schema Changes (V12)

### Position Tracking - SIMPLIFIED

**V11 Output (Old - Complex):**
```json
{
  "start_boundary_type": "intra_page",
  "start_marker": "before header 'DISCHARGE SUMMARY'",
  "start_marker_context": "...previous text...DISCHARGE SUMMARY...",
  "start_region_hint": "upper_middle",
  "start_text_y_top": 2400,
  "start_text_height": 24,
  "start_y": 2376,
  "position_confidence": 0.92
}
```

**V12 Output (New - Direct):**
```json
{
  "start_boundary_type": "intra_page",
  "start_y": 450,                        // ← PRIMARY: Y-coordinate from enhanced OCR (TOP edge)
  "start_marker": "DISCHARGE SUMMARY",   // ← OPTIONAL: Human-readable label
  "position_confidence": 0.95            // ← Higher confidence with direct coordinates
}
```

**V12.1 Post-Processing (Worker calculates ACTUAL text height from OCR bounding boxes):**
```typescript
// Worker extracts ACTUAL TEXT HEIGHT from Google Cloud Vision OCR bounding boxes
// Uses vertices[3].y - vertices[0].y (bottom-left Y minus top-left Y)
pending.start_text_height = findActualTextHeight(
  pages,
  pending.start_page - 1,
  pending.start_y,
  pending.start_marker
);

// Google Cloud Vision bounding box structure:
// vertices[0] = Top-Left (x, y)        ← This is start_y from AI
// vertices[1] = Top-Right (x, y)
// vertices[2] = Bottom-Right (x, y)
// vertices[3] = Bottom-Left (x, y)     ← We use this for height calculation

// Example: "DISCHARGE SUMMARY" at Y=450
// - vertices[0].y = 450 (TOP edge)
// - vertices[3].y = 468 (BOTTOM edge)
// - Actual text height = 468 - 450 = 18 pixels

// Result: { start_y: 450, start_text_height: 18 }

// CRITICAL FOR SAFE CUTTING:
// - START markers: Cut at start_y (450) - at the top edge ✓
// - END markers: Cut at end_y + end_text_height (450 + 18 = 468) - below the text ✓
//
// This provides EXACT bounding boxes for Pass 1/2 document splitting
```

**Deprecated Fields (Not in AI output, remain in DB for backward compatibility):**
- `start_marker_context` - V11 field, not needed in V12
- `start_region_hint` - V11 field, redundant with direct Y-coordinate
- `start_text_y_top` - Redundant (same as `start_y` since both represent TOP edge)

### Field Changes Summary

| Field | V11 | V12 | Notes |
|-------|-----|-----|-------|
| `start_y` / `end_y` | Calculated by worker | **AI provides directly** | PRIMARY source of truth |
| `start_marker` / `end_marker` | Required for extraction | **Optional human label** | For readability only |
| `start_marker_context` | Required | **DEPRECATED (null)** | Not needed with coordinates |
| `start_region_hint` | Required | **DEPRECATED (null)** | Redundant with Y-coordinate |
| `start_text_y_top` | AI provides | **DEPRECATED (null)** | Same as start_y |
| `start_text_height` | AI provides | **DEPRECATED (null)** | Worker calculates if needed |

---

## Instructions for AI (V12)

### 1. Reading Enhanced OCR Format

When you receive document text, it will be in enhanced OCR format with inline coordinates:

```
[Y:450] DISCHARGE SUMMARY (x:80)
[Y:480] Patient Name: John Smith (x:80) | DOB: 15/03/1985 (x:400)
[Y:510] Discharged: 20/11/2025 (x:80) | Condition: Stable (x:400)
```

**What this tells you:**
- Line at Y:450 contains "DISCHARGE SUMMARY" starting at x:80
- Line at Y:480 has two pieces of information: patient name (left side, x:80) and DOB (right side, x:400)
- Line at Y:510 has discharge date (left) and condition (right)

**For tables:**
```
[Y:480] Date (x:80) | 23/03/11 (x:220) | 02/08/12 (x:320) | 19/09/16 (x:420)
[Y:510] S T-BIL (x:20) | 16 (x:220) | 14 (x:320) | 7 (x:420)
```

You can reason: "The value '16' at x:220 aligns with date '23/03/11' at x:220, so this is the T-BIL result for that date."

### 2. Identifying Encounter Boundaries (V12 Simplified)

**For inter-page boundaries** (encounter starts/ends at page edge):
```json
{
  "start_page": 1,
  "start_boundary_type": "inter_page",
  "start_y": null,                    // ← Always null for inter-page
  "start_marker": "Page begins",      // ← Optional description
  "start_marker_context": null,       // ← Always null in V12
  "start_region_hint": null,          // ← Always null in V12
  "start_text_y_top": null,           // ← Always null in V12
  "start_text_height": null           // ← Always null in V12
}
```

**For intra-page boundaries** (encounter starts/ends mid-page):
```json
{
  "end_page": 5,
  "end_boundary_type": "intra_page",
  "end_y": 450,                       // ← Extract from [Y:450] marker
  "end_marker": "DISCHARGE SUMMARY",  // ← Optional human label
  "end_marker_context": null,         // ← Always null in V12
  "end_region_hint": null,            // ← Always null in V12
  "end_text_y_top": null,             // ← Always null in V12
  "end_text_height": null             // ← Always null in V12
}
```

**How to find Y-coordinates:**

1. Locate where the new encounter begins in the enhanced OCR text
2. Look for the `[Y:###]` marker at that line
3. Report that Y-coordinate as `start_y` or `end_y`

**Example:**
```
[Y:420] ...previous encounter text...
[Y:450] DISCHARGE SUMMARY (x:80)          ← New encounter starts here
[Y:480] Patient discharged in stable...
```

Report: `end_y: 450` (previous encounter ends) and `start_y: 450` (new encounter starts)

### 3. Position Confidence (V12 Updated)

**Confidence levels with enhanced OCR:**

- **1.0 (Perfect)** - Inter-page boundary (no coordinate needed)
- **0.95-1.0 (Excellent)** - Clear header/section marker with Y-coordinate (e.g., "DISCHARGE SUMMARY")
- **0.85-0.95 (Very Good)** - Contextual boundary with Y-coordinate (e.g., "Patient discharged")
- **0.70-0.85 (Good)** - Inferred boundary with Y-coordinate (e.g., blank line + new date)
- **<0.70 (Uncertain)** - Ambiguous boundary (consider making it inter_page instead)

**V12 Note:** Confidence is generally higher than V11 because coordinates are direct, not extracted.

---

## Page Separation Analysis (V12 Updated)

**Purpose:** Identify safe split points for Pass 1/2 batching

**V11 Format (Old):**
```json
{
  "page_separation_analysis": {
    "safe_split_points": [
      {
        "page_number": 15,
        "split_location": "intra_page",
        "marker": "PATHOLOGY REPORT",
        "marker_context": "...context...",
        "region_hint": "upper_middle",
        "text_y_top": null,
        "text_height": null,
        "split_y": null,
        "confidence": 0.92
      }
    ]
  }
}
```

**V12 Format (New):**
```json
{
  "page_separation_analysis": {
    "safe_split_points": [
      {
        "page_number": 15,
        "split_location": "intra_page",
        "split_y": 780,                 // ← PRIMARY: Y-coordinate from enhanced OCR
        "marker": "PATHOLOGY REPORT",   // ← OPTIONAL: Human-readable label
        "marker_context": null,         // ← DEPRECATED
        "region_hint": null,            // ← DEPRECATED
        "text_y_top": null,             // ← DEPRECATED
        "text_height": null,            // ← DEPRECATED
        "confidence": 0.95
      }
    ]
  }
}
```

**How to identify split points (V12):**

1. Look for natural content breaks in the enhanced OCR
2. Note the Y-coordinate where the break occurs
3. Report the Y-coordinate directly

**Example:**
```
[Y:750] ...lab results end...
[Y:780] PATHOLOGY REPORT (x:80)        ← Safe split point
[Y:810] Date: 20/11/2025 (x:80)
```

Report: `split_y: 780, marker: "PATHOLOGY REPORT"`

---

## Complete V12 Output Schema

```json
{
  "encounters": [
    {
      // Core metadata (UNCHANGED from V11)
      "encounter_type": "hospital_admission",
      "is_cascading": true,
      "cascade_context": "admission continuing to next chunk",
      "expected_continuation": "discharge_summary",

      // Dates (UNCHANGED from V11)
      "encounter_start_date": "2024-03-15",
      "encounter_end_date": null,
      "date_source": "ai_extracted",

      // Position data - START (V12 SIMPLIFIED)
      "start_page": 1,
      "start_boundary_type": "inter_page",
      "start_y": null,                    // Always null for inter_page
      "start_marker": "Page begins",      // Optional
      "start_marker_context": null,       // DEPRECATED - always null
      "start_region_hint": null,          // DEPRECATED - always null
      "start_text_y_top": null,           // DEPRECATED - always null
      "start_text_height": null,          // DEPRECATED - always null

      // Position data - END (V12 SIMPLIFIED)
      "end_page": 50,
      "end_boundary_type": "intra_page",
      "end_y": 2376,                      // Y-coordinate from enhanced OCR
      "end_marker": "CONTINUED NEXT PAGE", // Optional human label
      "end_marker_context": null,         // DEPRECATED - always null
      "end_region_hint": null,            // DEPRECATED - always null
      "end_text_y_top": null,             // DEPRECATED - always null
      "end_text_height": null,            // DEPRECATED - always null

      "position_confidence": 0.95,
      "page_ranges": [[1, 50]],

      // All other fields UNCHANGED from V11
      "is_real_world_visit": true,
      "patient_full_name": "John Michael Smith",
      "patient_date_of_birth": "15/03/1985",
      "patient_address": "123 Main Street, Sydney NSW 2000",
      "patient_phone": "0412 345 678",
      "medical_identifiers": [
        {
          "identifier_type": "MRN",
          "identifier_value": "MRN123456",
          "issuing_organization": "St Vincent's Hospital",
          "detected_context": "Patient ID: MRN123456"
        }
      ],
      "provider_name": "Dr. Smith",
      "facility_name": "St Vincent's Hospital",
      "department": "Cardiac ICU",
      "chief_complaint": "Chest pain",
      "diagnoses": ["STEMI"],
      "procedures": ["PCI with stent"],
      "provider_role": "Cardiologist",
      "disposition": "Admitted to CCU",
      "summary": "STEMI patient admitted for cardiac intervention",
      "confidence": 0.95
    }
  ],

  "page_assignments": [
    {
      "page": 1,
      "encounter_index": 0,
      "justification": "Contains 'ADMISSION NOTE' and date '15/03/2024'"
    }
  ],

  "cascade_contexts": [
    {
      "encounter_type": "hospital_admission",
      "partial_summary": "STEMI patient in cardiac ICU, PCI completed",
      "expected_in_next_chunk": "discharge_summary",
      "ai_context": "Patient stable post-PCI, awaiting discharge planning"
    }
  ],

  // V12 SIMPLIFIED page_separation_analysis
  "page_separation_analysis": {
    "safe_split_points": [
      {
        "page_number": 15,
        "split_location": "intra_page",
        "split_y": 780,                 // Y-coordinate from enhanced OCR
        "marker": "PATHOLOGY REPORT",   // Optional label
        "marker_context": null,         // DEPRECATED
        "region_hint": null,            // DEPRECATED
        "text_y_top": null,             // DEPRECATED
        "text_height": null,            // DEPRECATED
        "confidence": 0.95
      }
    ]
  }
}
```

---

## Migration from V11 to V12

### Breaking Changes

1. **Input format changed**: AI now receives enhanced OCR format with inline coordinates
2. **Output expectations changed**: AI provides Y-coordinates directly (not markers for extraction)
3. **Deprecated fields**: Must be set to null (marker_context, region_hint, text_y_top, text_height)

### Backward Compatibility

**V11 documents:** System will continue to support coordinate extraction from markers for existing documents

**V12 documents:** System will use Y-coordinates directly without extraction

**Database schema:** No changes required - already supports both approaches

### Worker Changes Required

1. **chunk-processor.ts**: Generate enhanced OCR format before building prompt
2. **post-processor.ts**: Read Y-coordinates directly from AI response (skip extraction)
3. **coordinate-extractor.ts**: Deprecated (keep for V11 documents)

---

## Token Economics (V12)

### Input Tokens

**V11 Baseline (spatially_sorted_text):**
- 5-page document: ~2,231 tokens
- Cost: $0.0028 per document (GPT-5)

**V12 Enhanced (with X-coordinates):**
- 5-page document: ~2,545 tokens (+14%)
- Cost: $0.0032 per document (GPT-5)
- **Overhead: $0.0004 per document**

### Output Tokens

**V11 (with marker extraction fields):**
- Per encounter: ~50 tokens (includes marker_context ~25 tokens)

**V12 (direct Y-coordinates):**
- Per encounter: ~30 tokens (simplified, marker_context removed)
- **Savings: ~20 tokens per encounter**

### Net Cost Impact

**For typical 5-page document with 2 encounters:**
- Input: +314 tokens ($0.0004)
- Output: -40 tokens ($0.0004)
- **Net: ~$0 difference** (balanced)

**For large 50-page document with 10 encounters:**
- Input: +3,140 tokens ($0.0039)
- Output: -200 tokens ($0.0020)
- **Net: +$0.0019 per document** (~4.8% increase)

**Benefit:** Significantly better accuracy for clinical entity extraction in Pass 1/2

---

## Testing Requirements (V12)

### Unit Tests

1. **Enhanced OCR generation**
   - Groups words by Y-coordinate (10px tolerance)
   - Sorts words by X-coordinate within lines
   - Formats correctly: `[Y:###] text (x:###) | text (x:###)`

2. **Y-coordinate parsing**
   - AI provides start_y/end_y for intra-page boundaries
   - Deprecated fields are null
   - Validation rejects out-of-bounds coordinates

### Integration Tests

1. **Single-page document**
   - AI receives enhanced OCR format
   - Reports Y-coordinates for intra-page boundaries
   - Inter-page boundaries work correctly (Y null)

2. **Multi-page cascade document**
   - Cascade context includes Y-coordinates
   - Reconciliation matches by Y-coordinate
   - Page assignments respect boundaries

3. **Table structure preservation**
   - AI correctly interprets multi-column tables
   - Values link to correct date columns
   - Spatial relationships maintained

### Production Validation

**Test document:** shell_file_id `ac15a5b2-2756-4d1f-8ae9-3e142fd847d3` (5-page lab report)

**Success criteria:**
- All encounters detected (match V11 baseline)
- Y-coordinates within ±10px of expected values
- Token usage within 15% of V11 baseline
- Table interpretation correct (values linked to correct dates)

---

## Implementation Checklist

- [ ] Create `aiPrompts.v12.ts` (copy from v11, apply changes)
- [ ] Update prompt instructions to read enhanced OCR format
- [ ] Update output schema to use direct Y-coordinates
- [ ] Add examples showing `[Y:###]` format
- [ ] Document deprecated fields
- [ ] Add token economics calculations
- [ ] Create test cases
- [ ] Update worker code to generate enhanced OCR
- [ ] Update post-processor to use direct coordinates

---

## Version History

- **V12** (2025-11-26): Enhanced OCR format with inline coordinates
- **V11** (2024-11-19): Identity extraction, medical identifiers, cascade contexts
- **V10** (2024-11-15): Position tracking, batching analysis, Timeline Test
- **V2.9** (2024-11-14): Pseudo-encounter detection
- **V2.8** (2024-11-13): Encounter type classification

---

**Next Steps:**
1. Review and approve this V12 specification
2. Implement `generateEnhancedOcrFormat()` function
3. Update worker code to use V12 prompt
4. Test with 5-page lab report
5. Compare results with V11 baseline

**Status:** ✅ Specification complete - Ready for implementation
