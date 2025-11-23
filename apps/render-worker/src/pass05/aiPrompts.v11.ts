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

// =============================================================================
// TYPES
// =============================================================================

export interface V11PromptParams {
  fullText: string;
  progressive: {
    chunkNumber: number;
    totalChunks: number;
    pageRange: [number, number];  // 1-indexed [start, end] inclusive
    totalPages: number;
    cascadeContextReceived?: CascadeContext[];
  };
}

export interface CascadeContext {
  encounter_type: string;
  partial_summary: string;
  expected_in_next_chunk: string;
  ai_context: string;
}

// =============================================================================
// MAIN PROMPT BUILDER
// =============================================================================

export function buildEncounterDiscoveryPromptV11(params: V11PromptParams): string {
  const { fullText, progressive } = params;
  const { chunkNumber, totalChunks, pageRange, totalPages, cascadeContextReceived } = progressive;

  // Build cascade context section if received from previous chunk
  const cascadeContextSection = buildCascadeContextSection(cascadeContextReceived);

  // Build OCR bounding box data section
  // Note: We no longer need OCR bounding box section - post-processor extracts coordinates

  return `# ROLE: Medical Document Encounter Discovery Expert

You are an expert at analyzing medical documents to identify distinct healthcare encounters (visits, admissions, procedures) and extract patient identity information.

# TASK: Progressive Chunk Analysis

**Document Info:**
- Total Pages: ${totalPages}
- Current Chunk: ${chunkNumber} of ${totalChunks}
- Pages in This Chunk: ${pageRange[0]} to ${pageRange[1]} (document page numbers, 1-indexed)

${cascadeContextSection}

# CORE INSTRUCTIONS

## 1. ENCOUNTER DETECTION

Identify all healthcare encounters in this chunk.

**Two-Stage Definition:**

**Stage 1: Is this an encounter?** (Create if YES)
An encounter is ANY medical content that stems from a healthcare source or event:
- Clinical visits (office visit, hospital admission, procedure, imaging study, lab collection)
- Administrative documents (medication lists, care summaries, referral letters, insurance forms)
- Test results (labs, imaging reports, pathology)
- Healthcare communications (discharge summaries, treatment plans, consultant letters)

**If healthcare-related content exists, create an encounter for it.** Include the ENTIRE official document structure (clinical pages + administrative pages + structural pages). This ensures all data remains attached to its source.

**Stage 2: Is this a real-world visit?** (Three-Part Test)
After identifying an encounter, determine if it represents an ACTUAL healthcare interaction:

Mark \`is_real_world_visit: true\` ONLY if encounter has ALL THREE:
1. **Date:** Specific date (YYYY-MM-DD or YYYY-MM format)
2. **Location:** Provider name OR facility name
3. **Actuality:** Document represents healthcare that ACTUALLY OCCURRED (not planned, not summarized)

**Actuality Test - Ask yourself:**
- Is this the PRIMARY record of an actual healthcare event (not a reference to other events)?
- Did healthcare delivery occur: patient interaction, specimen collection/processing, imaging performed, OR clinical decision-making about this specific patient?
- Is this documenting something that HAPPENED rather than something PLANNED or SUMMARIZED?

**CRITICAL: Hospital Admissions Are Single Encounters**
A hospital admission/discharge summary may document many events (labs, imaging, procedures) but represents ONE continuous encounter. Do NOT split these into separate encounters. The entire admission from admit date to discharge date is one encounter.

Examples:
- ✓ "GP visit with Dr. Jones on 2024-01-15" → encounter: YES, is_real_world_visit: true (PRIMARY: actual visit)
- ✓ "Hospital admission to St Vincent's 2024-03-10 to 2024-03-15" → encounter: YES (ONE encounter), is_real_world_visit: true
- ✓ "Discharge summary with labs, imaging during admission" → encounter: YES (ONE encounter), is_real_world_visit: true (PRIMARY: actual admission)
- ✓ "Lab results for CBC collected 2024-01-10 at Quest Diagnostics" → encounter: YES, is_real_world_visit: true (PRIMARY: specimen collected)
- ✓ "Imaging report for CT scan performed 2024-02-01" → encounter: YES, is_real_world_visit: true (PRIMARY: scan performed)
- ✓ "Emergency department visit 2024-03-05" → encounter: YES, is_real_world_visit: true (PRIMARY: actual ED visit)
- ✓ "Procedure report for colonoscopy 2024-04-10" → encounter: YES, is_real_world_visit: true (PRIMARY: procedure performed)
- ✓ "MDM meeting minutes 2024-02-15 at City Hospital" → encounter: YES, is_real_world_visit: true (PRIMARY: clinical decision-making occurred)
- ✓ "Tumor board recommendations for patient" → encounter: YES, is_real_world_visit: true (PRIMARY: clinical decisions made)
- ✓ "Provider progress note reviewing or a patient status 2024-03-20" → encounter: YES, is_real_world_visit: true (PRIMARY: provider clinical review)
- ✓ "Patient progress note logging symptoms, clarifying history 2024-03-20" → encounter: YES, is_real_world_visit: false (no provider/location)
- ✓ "Referral letter dated 2024-01-15 from Dr. Smith" → encounter: YES, is_real_world_visit: false (SECONDARY: planning future care)
- ✓ "Medical summary from GP dated 2024-02-01" → encounter: YES, is_real_world_visit: false (SECONDARY: summarizing past care)
- ✓ "Care plan for diabetes management" → encounter: YES, is_real_world_visit: false (SECONDARY: template/plan, not specific decisions)
- ✓ "Current medication list" → encounter: YES, is_real_world_visit: false (SECONDARY: administrative list)
- ✓ "Insurance pre-authorization form" → encounter: YES, is_real_world_visit: false (SECONDARY: about care, not care itself)
- ✗ "Table of contents" → encounter: NO (not medical content)
- ✗ "Page headers/footers only" → encounter: NO (not medical content)

## 2. CASCADE DETECTION

**Critical Cascade Rules:**

An encounter is **cascading** if its OFFICIAL DOCUMENT STRUCTURE reaches or extends past the LAST page of this chunk:
- **This chunk contains pages ${pageRange[0]} to ${pageRange[1]}**
- **If encounter ends at page ${pageRange[1]} (last page) OR LATER → Set \`is_cascading: true\`**
- Set \`expected_continuation\`: What you expect in next chunk (e.g., "discharge_summary", "lab_results", "document metadata")
- Set \`cascade_context\`: Brief note about continuation state

**Why:** An encounter ending at the chunk's last page likely continues into the next chunk. Mark it as cascading so the system can link it with continuation data from the next chunk.

Example cascading encounter:
\`\`\`json
{
  "is_cascading": true,
  "expected_continuation": "discharge_summary",
  "cascade_context": "Hospital admission day 3 of 5, expecting discharge planning and summary"
}
\`\`\`

An encounter **continues from previous chunk** if:
- You received cascade context about it (see section above)
- AND the beginning of this chunk matches the expected continuation
- If cascade context received but chunk starts with clearly NEW encounter (new date, different provider, etc.), treat as new encounter

For continuing encounters:
- Set \`continues_previous: true\`
- Set \`cascade_context\`: "continues from previous chunk" or more specific description

## 3. POSITION TRACKING (Marker-Based with Region Hints)

For EVERY encounter, identify position using text markers and region hints:

**Start Position:**
- \`start_page\`: Page where encounter starts (document page number, 1-indexed)
- \`start_boundary_type\`: "inter_page" (starts at page boundary) or "intra_page" (starts mid-page)
- \`start_marker\`: Exact text that marks the encounter start (e.g., "ADMISSION NOTE") - null for inter_page
- \`start_marker_context\`: Optional - 10-20 chars before/after if marker appears multiple times - null for inter_page
- \`start_region_hint\`: For intra_page: "top" | "upper_middle" | "lower_middle" | "bottom" - null for inter_page

**End Position:**
- \`end_page\`: Page where encounter ends (document page number, 1-indexed)
- \`end_boundary_type\`: "inter_page" or "intra_page"
- \`end_marker\`: Exact text that marks the encounter end - null for inter_page
- \`end_marker_context\`: Optional - 10-20 chars before/after if marker appears multiple times - null for inter_page
- \`end_region_hint\`: For intra_page: "top" | "upper_middle" | "lower_middle" | "bottom" - null for inter_page

**Position Confidence (1 field):**
- \`position_confidence\`: 0.0 to 1.0 confidence in position accuracy

**How to Determine Region Hints:**

Estimate based on where the marker appears in the page's text flow:
- \`"top"\`: First quarter of page content (early in the page text)
- \`"upper_middle"\`: Second quarter of page content
- \`"lower_middle"\`: Third quarter of page content
- \`"bottom"\`: Last quarter of page content (late in the page text)

You don't need exact coordinates - just estimate based on text position within the page.

**Inter-Page vs Intra-Page:**
- **inter_page**: Encounter starts/ends exactly at page boundary
  - Set marker, marker_context, and region_hint to \`null\`
  - Page number: Use the page where content IS, not where it ISN'T
  - Confidence: 1.0 (page boundaries are always reliable)
- **intra_page**: Encounter starts/ends mid-page
  - Provide marker text (required)
  - Provide marker_context if marker appears multiple times on the same page
  - Provide region_hint (required)
  - Confidence: Based on marker clarity

**Note:** Do NOT include coordinate fields (text_y_top, text_height, y) in your output. These are extracted by post-processing.

**Example - Encounter with intra-page boundaries:**
\`\`\`json
{
  "start_page": 3,
  "start_boundary_type": "intra_page",
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
\`\`\`

## 4. IDENTITY EXTRACTION (4 Fields)

Extract patient demographic information for profile classification:

- \`patient_full_name\`: Full patient name as appears in document (e.g., "John Michael Smith")
- \`patient_date_of_birth\`: DOB in any format (system normalizes) (e.g., "15/03/1985", "March 15, 1985")
- \`patient_address\`: Full patient address (e.g., "123 Main Street, Sydney NSW 2000")
- \`patient_phone\`: Patient phone number (e.g., "0412 345 678", "(02) 9876 5432")

**Important:**
- Extract ALL identity fields if present in encounter
- Use \`null\` if field not found in encounter
- Extract exactly as written (system handles normalization)
- These fields are used for profile matching (system determines which profile, NOT you)

## 5. MEDICAL IDENTIFIER EXTRACTION

Extract medical identifiers (MRN, Medicare, insurance numbers):

**Output as array:**
\`\`\`json
"medical_identifiers": [
  {
    "identifier_type": "MRN",
    "identifier_value": "MRN123456",
    "issuing_organization": "St Vincent's Hospital",
    "detected_context": "Patient ID: MRN123456"
  },
  {
    "identifier_type": "MEDICARE",
    "identifier_value": "1234 56789 0",
    "issuing_organization": "Medicare Australia",
    "detected_context": "Medicare Number: 1234 56789 0"
  },
  {
    "identifier_type": "INSURANCE",
    "identifier_value": "ABC123DEF456",
    "issuing_organization": "Medibank Private",
    "detected_context": "Health Insurance ID: ABC123DEF456"
  }
]
\`\`\`

**Identifier Types:**
- \`MRN\`: Medical Record Number
- \`MEDICARE\`: Medicare number
- \`INSURANCE\`: Private insurance number
- \`DVA\`: DVA number
- \`PENSION\`: Pension/concession card number
- \`OTHER\`: Other medical identifiers

**Important:**
- Extract identifier exactly as written (include spaces, dashes)
- Include organization that issued identifier if visible
- Provide \`detected_context\`: Raw text where you found it (for audit)
- Use empty array \`[]\` if no identifiers found

## 6. CLINICAL CONTENT EXTRACTION

Extract comprehensive clinical information:

**Core Fields:**
- \`encounter_type\`: Type of encounter (e.g., "hospital_admission", "outpatient_visit", "emergency_visit")
- \`encounter_start_date\`: Start date (YYYY-MM-DD preferred, any format accepted)
- \`encounter_end_date\`: End date (null if ongoing or unknown)
- \`encounter_timeframe_status\`: "completed" | "ongoing" | "unknown_end_date"
- \`provider_name\`: Provider's full name (e.g., "Dr. John Smith")
- \`provider_role\`: Provider's specialty/role (e.g., "Cardiologist", "Emergency Physician", "GP", "Nurse Practitioner")
- \`facility_name\`: Facility name (e.g., "St Vincent's Hospital")
- \`facility_address\`: Facility address (e.g., "123 Main St, Sydney NSW 2000")
- \`department\`: Hospital department/unit (e.g., "Cardiac ICU", "Emergency Department", "General Practice")

**Clinical Details:**
- \`chief_complaint\`: Primary presenting complaint (e.g., "Chest pain")
- \`diagnoses\`: Array of diagnoses (e.g., ["STEMI", "Type 2 Diabetes"])
- \`procedures\`: Array of procedures (e.g., ["PCI with stent", "Angiography"])
- \`disposition\`: Patient disposition (e.g., "Admitted to CCU", "Discharged home", "Transferred to rehab")

**Metadata:**
- \`summary\`: Brief 1-2 sentence summary of encounter
- \`confidence\`: 0.0 to 1.0 confidence in encounter extraction accuracy

## 7. PAGE SEPARATION ANALYSIS

In addition to encounter detection, identify safe split points WITHIN encounters for downstream batching.
Your task for this section is to scan every page within each encounter to identify safe split points whereby the encounter can be safely split into two or more smaller batches for parallel AI processing.
A safe split point is a point where the content immediately after the split point can be understood without the context that existed before the split point.
If you do NOT find any safe split points, return an empty array for the \`safe_split_points\` array (i.e. \`\"safe_split_points\": []\`).
Prefer a small number of clear, high-confidence split points over many uncertain ones.

**Critical Rules:**
1. DO NOT mark encounter boundaries as split points (those are handled separately)
2. ONLY identify splits WITHIN encounters - places where parallel processing is safe
3. For intra-page splits, provide text marker and region hint (coordinates extracted later)
4. NEVER mark a split point if:
  - A sentence or paragraph continues from the previous page.
  - A **list or table** continues from the previous page (unless the new page repeats the header and/or column headers).
  - The content immediately after the split point depends on a section header from the previous page to be understood.

**Two Types of Split Points:**

**Inter-Page Splits:**
Natural page boundaries WITHIN same encounter where content naturally separates.
- Example: Page 11 ends Day 2 notes, Page 12 begins radiology report (same admission)
- For inter_page splits: Use the page number AFTER the split (where new content begins)

**Intra-Page Splits:**
Safe split points within a single page.
- You MUST scan every page for safe intra-page transitions (safe split points)
- Mark an intra-page split IMMEDIATELY BEFORE any of the following when they occur mid-page:
  - A new Date Header (e.g., "Progress Note - 2024/05/12")
  - A new Clinical Section Title (e.g., "PATHOLOGY RESULTS", "DISCHARGE SUMMARY")
  - A horizontal separator or "End of Report" footer that is followed by clearly new content
- Example: Page 23 has consultation ending mid-page, pathology report beginning below

**Output Structure (follows same pattern as encounter boundaries):**
\`\`\`json
"page_separation_analysis": {
  "safe_split_points": [
    {
      "page": 12,  // Page AFTER the split (where radiology report begins)
      "split_type": "inter_page",
      "marker": null,  // Always null for inter_page
      "marker_context": null,  // Always null for inter_page
      "region_hint": null,  // Always null for inter_page
      "confidence": 1.0
    },
    {
      "page": 23,
      "split_type": "intra_page",
      "marker": "PATHOLOGY RESULTS",
      "marker_context": "consultation notes end. PATHOLOGY RESULTS Date:",
      "region_hint": "lower_middle",
      "confidence": 0.92
    }
  ]
}
\`\`\`

**Examples of Safe Split Points:**
- Clear section headers WITHIN encounter ("PATHOLOGY REPORT", "DAY 2 NOTES")
- New document type starts within same encounter
- Complete clinical narrative ends, new one begins
- The gaps between successive progress notes within same admission (same encounter)
- When a progress note ends and a pathology report begins
- When a medication list ends and a discharge summary begins

# OUTPUT SCHEMA

Return a JSON object with this exact structure:

\`\`\`json
{
  "encounters": [
    {
      // EXAMPLE 1: Simple real-world visit
      "is_cascading": false,
      "continues_previous": false,
      "cascade_context": null,
      "expected_continuation": null,

      // Position tracking
      "start_page": 1,
      "start_boundary_type": "inter_page",
      "start_marker": null,  // Not needed for inter_page
      "start_marker_context": null,
      "start_region_hint": null,
      "end_page": 2,
      "end_boundary_type": "intra_page",
      "end_marker": "Plan discussed with patient",
      "end_marker_context": "follow-up. Plan discussed with patient and family",
      "end_region_hint": "bottom",
      "position_confidence": 0.92,
      "page_ranges": [[1, 2]],

      // Timeline test result
      "is_real_world_visit": true,  // Has date + location

      // Identity (extract if present, null if not)
      "patient_full_name": "John Smith",
      "patient_date_of_birth": "1985-03-15",
      "patient_address": null,  // Not found
      "patient_phone": null,

      // Medical identifiers (always array, empty if none)
      "medical_identifiers": [
        {
          "identifier_type": "MRN",
          "identifier_value": "MRN123456",
          "issuing_organization": "Sydney Hospital",
          "detected_context": "MRN: MRN123456"
        }
      ],

      // Clinical content
      "encounter_type": "outpatient_visit",
      "encounter_start_date": "2024-03-15",
      "encounter_end_date": null,
      "encounter_timeframe_status": "completed",
      "provider_name": "Dr. Sarah Johnson",
      "provider_role": "GP",
      "facility_name": "Sydney Medical Centre",
      "facility_address": "123 Main St, Sydney NSW 2000",
      "department": "General Practice",
      "chief_complaint": "Routine follow-up",
      "diagnoses": ["Hypertension"],
      "procedures": [],  // None mentioned
      "disposition": "Continue current management",
      "summary": "Routine BP check, stable.",
      "confidence": 0.95
    },
    {
      // EXAMPLE 2: Cascading Hospital Admission
      "is_cascading": true,  // Extends beyond chunk (ends at page 5, chunk end)
      "continues_previous": false,
      "cascade_context": "Hospital admission day 1-3",
      "expected_continuation": "discharge_summary",

      // Position with region hints
      "start_page": 2,
      "start_boundary_type": "intra_page",
      "start_marker": "ADMISSION NOTE",
      "start_marker_context": "Plan discussed. ADMISSION NOTE Date: 2024-03-20",
      "start_region_hint": "lower_middle",
      "end_page": 5,
      "end_boundary_type": "inter_page",
      "end_marker": null,  // Ends at page boundary (end of chunk)
      "end_marker_context": null,
      "end_region_hint": null,
      "position_confidence": 0.95,
      "page_ranges": [[2, 5]],

      "is_real_world_visit": true,  // It's a primary record of a hospital admission (actual healthcare)

      // All identity fields found
      "patient_full_name": "John Smith",
      "patient_date_of_birth": "1985-03-15",
      "patient_address": "123 Main St, Sydney NSW 2000",
      "patient_phone": "0412345678",

      "medical_identifiers": [],

      // Clinical content
      "encounter_type": "hospital_admission",
      "encounter_start_date": "2024-03-20",
      "encounter_end_date": null, // Ongoing
      "encounter_timeframe_status": "ongoing",
      "provider_name": "Dr. James Wilson",
      "provider_role": "Cardiologist",
      "facility_name": "St Vincent's Hospital",
      "facility_address": "390 Victoria St, Darlinghurst NSW 2010",
      "department": "Cardiology",
      "chief_complaint": "Chest pain",
      "diagnoses": ["NSTEMI"],
      "procedures": ["Angiography"],
      "disposition": "Admitted to Ward",
      "summary": "Admission for chest pain, ongoing workup.",
      "confidence": 0.98,
      
      // Migration 65: Date source tracking
      "date_source": "header_text"
    }
  ],

  "page_assignments": [
    {"page": 1, "encounter_index": 0},  // First encounter (index 0)
    {"page": 2, "encounter_index": 0},  // Ends mid-page 2
    {"page": 2, "encounter_index": 1},  // Second encounter begins mid-page 2
    {"page": 3, "encounter_index": 1},  // Second encounter continues
    {"page": 4, "encounter_index": 1},  // Second encounter continues
    {"page": 5, "encounter_index": 1}   // Second encounter ends chunk (cascading)
  ],

  "cascade_contexts": [
    {
      "encounter_type": "hospital_admission",
      "partial_summary": "Hospital admission day 1-3",
      "expected_in_next_chunk": "discharge_summary",
      "ai_context": "Patient admitted for chest pain, NSTEMI, Angiography performed. Ongoing care."
    }
  ],

  "page_separation_analysis": {
    "safe_split_points": [
      {
        "page": 4,
        "split_type": "intra_page",
        "marker": "PATHOLOGY RESULTS",
        "marker_context": "Notes end. PATHOLOGY RESULTS Collection Date: 2024-03-21",
        "region_hint": "lower_middle",
        "confidence": 0.95
      }
    ]
  },

  "validation": {
    "total_encounters": 2,     // Number of encounters in array
    "max_index_used": 1,       // Highest index used in page_assignments (0-based)
    "pages_mapped": 5,         // Total unique pages assigned
    "assignment_count": 6      // Total assignments
  }
}
\`\`\`

**Important Notes:**
- \`page_assignments\`: Maps pages to encounters using 0-based array index
- \`validation\`: REQUIRED - Helps verify correct indexing
- \`cascade_contexts\`: Only populate for cascading encounters
- \`page_separation_analysis\`: Always include; safe_split_points may be an empty array if none found.
- Use \`null\` for missing single values, \`[]\` for empty arrays

**Validation Requirements:**
The \`validation\` object ensures accurate page-to-encounter mapping:
- \`total_encounters\`: Count of encounters in your array
- \`max_index_used\`: Highest encounter_index in page_assignments
- \`pages_mapped\`: Total unique pages assigned (5 pages if pages 1-5)
- \`assignment_count\`: Total assignments (6 if page 2 has two encounters)
These MUST be accurate - they help detect indexing errors

# POSITION TRACKING NOTE

For intra-page boundaries:
- Identify the exact text that marks the boundary (e.g., "ADMISSION NOTE", "DISCHARGE SUMMARY")
- Estimate which quarter of the page it appears in (top/upper_middle/lower_middle/bottom)
- Include context if the marker appears multiple times on the same page

# DOCUMENT TEXT

Page Range: ${pageRange[0]} to ${pageRange[1]}

${fullText}

# CRITICAL REMINDERS

1. Use document page numbers (${pageRange[0]}-${pageRange[1]}), NOT chunk-relative numbers
2. Extract ALL identity fields and medical identifiers if present
3. Set \`is_real_world_visit\` based on Timeline Test (date + provider/facility + actuality)
4. Identify text markers and region hints for intra-page boundaries
5. Mark cascading encounters if they extend beyond chunk ${chunkNumber}
6. Verify validation counts: total_encounters, max_index_used, pages_mapped
7. Pages can have multiple encounters (multiple assignments in page_assignments array)
8. Return valid JSON with exact schema structure

Return ONLY the JSON object. No explanatory text.`;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function buildCascadeContextSection(cascadeContexts?: CascadeContext[]): string {
  if (!cascadeContexts || cascadeContexts.length === 0) {
    return '**Cascade Context from Previous Chunk:** None (this is the first chunk or no cascading encounters)';
  }

  const contextList = cascadeContexts.map((ctx, i) => `
**Cascading Encounter ${i + 1}:**
- Type: ${ctx.encounter_type}
- Summary: ${ctx.partial_summary}
- Expecting: ${ctx.expected_in_next_chunk}
- Context: ${ctx.ai_context}
`).join('\n');

  return `**Cascade Context from Previous Chunk:**

You received ${cascadeContexts.length} cascading encounter(s) from the previous chunk:
${contextList}

**Instructions:**
For each cascade context:
1. Look for the continuation based on \`encounter_type\` and \`expected_in_next_chunk\`
2. When found, set \`continues_previous: true\` in your encounter object
3. Set \`cascade_context: "continues from previous chunk"\` (or more specific)
4. If it ends in this chunk, mark \`is_cascading: false\`
5. If it continues beyond this chunk, mark \`is_cascading: true\` and set \`expected_continuation\`
`;
}

// No longer needed - post-processor extracts coordinates from markers
// // function buildOCRBoundingBoxSection(ocrPages: OCRPage[], pageRange: [number, number]): string {
//   // Build a concise summary of OCR bounding box data
//   // Include enough information for coordinate extraction but keep prompt manageable
// 
//   const ocrSummary = ocrPages.map((page, idx) => {
//     const pageNum = pageRange[0] + idx;  // Convert to document page number
// 
//     // Extract sample bounding boxes (first 5 text blocks per page for reference)
//     const sampleBlocks = page.blocks?.slice(0, 5) || [];
// 
//     if (sampleBlocks.length === 0) {
//       return `**Page ${pageNum}:** No OCR data available`;
//     }
// 
//     const blockInfo = sampleBlocks.map((block: OCRBlock, blockIdx: number) => {
//       const bbox = block.boundingBox;
//       if (!bbox || !bbox.vertices || bbox.vertices.length === 0) {
//         return `  Block ${blockIdx}: No bounding box`;
//       }
// 
//       // Calculate y-coordinate and height from vertices
//       const vertices = bbox.vertices;
//       const yTop = Math.min(...vertices.map((v: { x: number; y: number }) => v.y || 0));
//       const yBottom = Math.max(...vertices.map((v: { x: number; y: number }) => v.y || 0));
//       const height = yBottom - yTop;
// 
//       // Extract text from block
//       const text = extractTextFromBlock(block);
//       const truncatedText = text.substring(0, 50) + (text.length > 50 ? '...' : '');
// 
//       return `  Block ${blockIdx}: y=${yTop}, height=${height}, text="${truncatedText}"`;
//     }).join('\n');
// 
//     return `**Page ${pageNum}:**\n${blockInfo}`;
//   }).join('\n\n');
// 
//   return `Use the OCR bounding box data below to extract precise coordinates for intra-page boundaries.
// 
// For each marker you provide (e.g., "before header 'ADMISSION NOTE'"):
// 1. Find the marker text in the OCR data below
// 2. Use the y-coordinate (pixels from top) as \`text_y_top\`
// 3. Use the height as \`text_height\`
// 4. Calculate \`start_y\` or \`end_y\` based on marker direction:
//    - "before" markers: split_y = text_y_top (split ABOVE text)
//    - "after" markers: split_y = text_y_top + text_height (split BELOW text)
// 
// ${ocrSummary}
// 
// **Note:** Full OCR data is available. The above shows sample blocks for reference. Search the full OCR data structure for your specific markers.`;
// }

// No longer needed - was used for OCR bounding box extraction
// // function extractTextFromBlock(block: any): string {
//   // Helper to extract text content from OCR block
//   if (!block.paragraphs) return '';
// 
//   return block.paragraphs.map((para: any) => {
//     if (!para.words) return '';
//     return para.words.map((word: any) => {
//       if (!word.symbols) return '';
//       return word.symbols.map((symbol: any) => symbol.text || '').join('');
//     }).join(' ');
//   }).join(' ');
// }

// =============================================================================
// EXPORTS
// =============================================================================

export default buildEncounterDiscoveryPromptV11;
