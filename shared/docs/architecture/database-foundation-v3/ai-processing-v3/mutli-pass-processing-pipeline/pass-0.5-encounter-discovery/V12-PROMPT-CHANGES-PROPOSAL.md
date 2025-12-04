# V12 Prompt Changes Proposal

**Purpose:** Document all changes needed to convert aiPrompts.v11.ts → aiPrompts.v12.ts
**Status:** Awaiting user approval for each change
**Date:** 2025-11-26

---

## Overview

V12 changes the OCR input format to include inline coordinates, allowing AI to directly output Y-coordinates instead of text markers that need post-processing extraction.

**Key Change:** AI receives `[Y:###] text (x:###) | text (x:###)` format instead of plain text

---

## Proposed Changes (Line-by-Line)

### Change 1: File Header (Lines 1-18)

**Current V11:**
```typescript
/**
 * V11 AI Prompt - Strategy A Universal Progressive Processing
 *
 * Version: 2.0 (V11 with Strategy A enhancements)
 * Date: November 19, 2025
 *
 * STRATEGY A FEATURES:
 * - Universal progressive (all documents, no page threshold)
 * - Cascade-based encounter continuity
 * - Sub-page position granularity (13 position fields)
 * - Identity extraction (4 demographic fields)
 * - Medical identifier extraction (MRN, Medicare, insurance IDs)
 * - Profile classification support (AI extracts, system matches)
 * - Data quality tier support (AI extracts, system calculates)
 * - Page separation analysis (batching optimization)
 *
 * Source: 04-PROMPT-V11-SPEC.md (V2.0)
 */

// Note: OCR coordinate extraction moved to post-processor
```

**Proposed V12:**
```typescript
/**
 * V12 AI Prompt - Enhanced OCR Coordinate Integration
 *
 * Version: V12 (Enhanced OCR with inline coordinates)
 * Date: November 26, 2025
 *
 * V12 ENHANCEMENTS:
 * - Enhanced OCR format with inline X+Y coordinates
 * - Direct Y-coordinate output (no marker extraction)
 * - Simplified position tracking (7 fields instead of 13)
 * - Table structure preservation for clinical entity extraction
 *
 * STRATEGY A FEATURES (unchanged from V11):
 * - Universal progressive (all documents, no page threshold)
 * - Cascade-based encounter continuity
 * - Identity extraction (4 demographic fields)
 * - Medical identifier extraction (MRN, Medicare, insurance IDs)
 * - Profile classification support (AI extracts, system matches)
 * - Data quality tier support (AI extracts, system calculates)
 * - Page separation analysis (batching optimization)
 *
 * Source: 04-PROMPT-V12-SPEC.md
 */

// Note: AI now provides Y-coordinates directly from enhanced OCR format
```

**Rationale:** Update version info and document V12-specific enhancements

**User Approval:** ⬜ Approve / ⬜ Modify / ⬜ Reject

---

### Change 2: Function Name (Line 48)

**Current V11:**
```typescript
export function buildEncounterDiscoveryPromptV11(params: V11PromptParams): string {
```

**Proposed V12:**
```typescript
export function buildEncounterDiscoveryPromptV12(params: V12PromptParams): string {
```

**Rationale:** Update function name to match version

**User Approval:** ⬜ Approve / ⬜ Modify / ⬜ Reject

---

### Change 3: Interface Names (Lines 26-42)

**Current V11:**
```typescript
export interface V11PromptParams {
  fullText: string;
  progressive: {
    // ...
  };
}
```

**Proposed V12:**
```typescript
export interface V12PromptParams {
  enhancedOcrText: string;  // ← Changed from fullText
  progressive: {
    // ... (unchanged)
  };
}
```

**Rationale:**
- Rename interface to V12
- Change `fullText` → `enhancedOcrText` to clarify input format

**User Approval:** ⬜ Approve / ⬜ Modify / ⬜ Reject

---

### Change 4: Input Format Documentation (Lines 50-69)

**Current V11:**
```typescript
  return `# ROLE: Medical Document Encounter Discovery Expert

You are an expert at analyzing medical documents to identify distinct healthcare encounters (visits, admissions, procedures) and extract patient identity information.

# TASK: Progressive Chunk Analysis

**Document Info:**
- Total Pages: ${totalPages}
- Current Chunk: ${chunkNumber} of ${totalChunks}
- Pages in This Chunk: ${pageRange[0]} to ${pageRange[1]} (document page numbers, 1-indexed)

${cascadeContextSection}
```

**Proposed V12:**
```typescript
  return `# ROLE: Medical Document Encounter Discovery Expert

You are an expert at analyzing medical documents to identify distinct healthcare encounters (visits, admissions, procedures) and extract patient identity information.

# TASK: Progressive Chunk Analysis

**Document Info:**
- Total Pages: ${totalPages}
- Current Chunk: ${chunkNumber} of ${totalChunks}
- Pages in This Chunk: ${pageRange[0]} to ${pageRange[1]} (document page numbers, 1-indexed)

**Enhanced OCR Format:**
The document text below uses enhanced OCR format with inline coordinates:
- Format: [Y:###] text (x:###) | text (x:###)
- Y-coordinate: Pixels from top of page (groups words into lines)
- X-coordinate: Pixels from left of page (preserves horizontal alignment)
- This format preserves table structure and spatial relationships

${cascadeContextSection}
```

**Rationale:** Add explanation of enhanced OCR format so AI knows how to interpret it

**User Approval:** ⬜ Approve / ⬜ Modify / ⬜ Reject

---

### Change 5: Position Tracking Instructions (Lines 156-196)

**Current V11:** (Long section with marker/region_hint instructions)

**Proposed V12:**
```
## 3. POSITION TRACKING

For EVERY encounter, identify position using Y-coordinates from enhanced OCR:

**Two Boundary Types:**

### Inter-Page (encounter starts/ends at page edge)
Boundaries:
- \`start_boundary_type\`: "inter_page"
- \`start_y\`: \`null\` (always null for inter_page)
- \`start_marker\`: Optional brief label (e.g., "Page begins")
- All deprecated fields: \`null\` (marker_context, region_hint, text_y_top, text_height)

### Intra-Page (encounter starts/ends mid-page)
Boundaries:
- \`start_boundary_type\`: "intra_page"
- \`start_y\`: **Y-coordinate from enhanced OCR** (e.g., 450 from [Y:450])
- \`start_marker\`: Optional brief label (e.g., "DISCHARGE SUMMARY")
- All deprecated fields: \`null\` (marker_context, region_hint, text_y_top, text_height)

**How to find Y-coordinates:**
1. Locate where the encounter boundary occurs in the enhanced OCR text
2. Find the \`[Y:###]\` marker at that line
3. Report that Y-coordinate as \`start_y\` or \`end_y\`

**Example:**
\`\`\`
[Y:420] ...previous encounter text...
[Y:450] DISCHARGE SUMMARY (x:80)          ← New encounter starts here
[Y:480] Patient discharged in stable...
\`\`\`

Report: \`end_y: 450\` (previous encounter ends) and \`start_y: 450\` (new encounter starts)

**Position Confidence:**
- 1.0: Inter-page boundary (no coordinate needed)
- 0.95-1.0: Clear section marker with Y-coordinate (e.g., "DISCHARGE SUMMARY")
- 0.85-0.95: Contextual boundary with Y-coordinate (e.g., "Patient discharged")
- 0.70-0.85: Inferred boundary with Y-coordinate (e.g., blank line + new date)

**CRITICAL:**
- Do NOT include deprecated fields: marker_context, region_hint, text_y_top, text_height
- These fields must be \`null\` in your output
- Only provide: boundary_type, y (for intra_page), marker (optional label)
```

**Rationale:** Complete rewrite to use Y-coordinates instead of markers

**User Approval:** ⬜ Approve / ⬜ Modify / ⬜ Reject

---

### Change 6: Example Encounter Output (Lines 197-220)

**Current V11:**
```json
{
  "start_page": 1,
  "start_boundary_type": "inter_page",
  "start_marker": "ADMISSION NOTE",
  "start_marker_context": "2024-11-01 ADMISSION NOTE Cardiac ICU",
  "start_region_hint": "upper_middle",

  "end_page": 5,
  "end_boundary_type": "intra_page",
  "end_marker": "DISCHARGE SUMMARY",
  "end_marker_context": null,
  "end_region_hint": "bottom",
  "position_confidence": 0.85
}
```

**Proposed V12:**
```json
{
  "start_page": 1,
  "start_boundary_type": "inter_page",
  "start_y": null,  // Always null for inter_page
  "start_marker": "Page begins",  // Optional human label
  "start_marker_context": null,  // DEPRECATED - always null
  "start_region_hint": null,  // DEPRECATED - always null
  "start_text_y_top": null,  // DEPRECATED - always null
  "start_text_height": null,  // DEPRECATED - always null

  "end_page": 5,
  "end_boundary_type": "intra_page",
  "end_y": 2376,  // Y-coordinate from enhanced OCR
  "end_marker": "DISCHARGE SUMMARY",  // Optional human label
  "end_marker_context": null,  // DEPRECATED - always null
  "end_region_hint": null,  // DEPRECATED - always null
  "end_text_y_top": null,  // DEPRECATED - always null
  "end_text_height": null,  // DEPRECATED - always null
  "position_confidence": 0.95
}
```

**Rationale:** Show correct V12 output format with Y-coordinates and null deprecated fields

**User Approval:** ⬜ Approve / ⬜ Modify / ⬜ Reject

---

### Change 7: Page Separation Analysis (Lines 308-350)

**Current V11:**
```json
{
  "page_number": 15,
  "split_location": "intra_page",
  "marker": "PATHOLOGY RESULTS",
  "marker_context": "notes end. PATHOLOGY RESULTS Da",
  "region_hint": "lower_middle",
  "confidence": 0.92
}
```

**Proposed V12:**
```json
{
  "page_number": 15,
  "split_location": "intra_page",
  "split_y": 780,  // Y-coordinate from enhanced OCR
  "marker": "PATHOLOGY RESULTS",  // Optional human label
  "marker_context": null,  // DEPRECATED - always null
  "region_hint": null,  // DEPRECATED - always null
  "text_y_top": null,  // DEPRECATED - always null
  "text_height": null,  // DEPRECATED - always null
  "confidence": 0.95
}
```

**Rationale:** Update page separation analysis to use Y-coordinates

**User Approval:** ⬜ Approve / ⬜ Modify / ⬜ Reject

---

### Change 8: Complete Example Output (Lines 360-450)

**Current V11:** (Has marker/marker_context/region_hint in examples)

**Proposed V12:** Update all example outputs to:
- Include `start_y` / `end_y` with actual Y-coordinates for intra_page
- Set all deprecated fields to `null`
- Remove verbose marker_context examples

**Rationale:** Ensure all examples match V12 format

**User Approval:** ⬜ Approve / ⬜ Modify / ⬜ Reject

---

### Change 9: Final Output Schema (Lines 450-664)

**Current V11:** (Complete schema with all V11 fields)

**Proposed V12:** Update schema documentation to reflect:
- Direct Y-coordinate fields
- Deprecated fields marked as always null
- Simplified position tracking

**Rationale:** Ensure schema matches V12 spec

**User Approval:** ⬜ Approve / ⬜ Modify / ⬜ Reject

---

## Summary of Changes

**Total Changes:** 9 sections

**Critical Changes:**
1. Enhanced OCR format explanation added
2. Position tracking completely rewritten for Y-coordinates
3. All examples updated to show Y-coordinates
4. Deprecated fields always set to null

**No Changes:**
- Encounter detection logic (unchanged)
- Identity extraction (unchanged)
- Medical identifiers (unchanged)
- Cascade logic (unchanged)
- Timeline Test logic (unchanged)

---

## Testing After Changes

After user approves changes, test with:
1. 5-page lab report (shell_file_id: ac15a5b2-2756-4d1f-8ae9-3e142fd847d3)
2. Verify AI outputs Y-coordinates for intra-page boundaries
3. Verify deprecated fields are null
4. Compare token usage with V11 baseline

---

## Next Steps

1. **User Review:** Review each change and mark approval status
2. **Apply Changes:** Create aiPrompts.v12.ts with approved changes
3. **Test Prompt:** Verify output format matches V12 spec
4. **Update Worker:** Modify chunk-processor.ts to use V12 prompt

---

**Status:** ⏳ Awaiting user approval for changes
