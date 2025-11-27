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

// =============================================================================
// TYPES
// =============================================================================

export interface V12PromptParams {
  enhancedOcrText: string;
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

export function buildEncounterDiscoveryPromptV12(params: V12PromptParams): string {
  const { enhancedOcrText, progressive } = params;
  const { chunkNumber, totalChunks, pageRange, totalPages, cascadeContextReceived } = progressive;

  // Build cascade context section if received from previous chunk
  const cascadeContextSection = buildCascadeContextSection(cascadeContextReceived);

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

## 3. POSITION TRACKING

For EVERY encounter, identify position using Y-coordinates from OCR output:

**Two Boundary Types:**

### Inter-Page boundaries (encounter starts/ends at page edge):

**Start Position:**
- \`start_boundary_type\`: "inter_page"
- \`start_y\`: \`null\` (always null for inter_page)
- \`start_marker\`: \`null\` (always null for inter_page)

**End Position:**
- \`end_boundary_type\`: "inter_page"
- \`end_y\`: \`null\` (always null for inter_page)
- \`end_marker\`: \`null\` (always null for inter_page)

### Intra-Page boundaries (encounter starts/ends mid-page):

**Start Position:**
- \`start_boundary_type\`: "intra_page"
- \`start_y\`: **Y-coordinate from OCR** (e.g., 450 from [Y:450])
- \`start_marker\`: Brief label (e.g., "DISCHARGE SUMMARY")

**End Position:**
- \`end_boundary_type\`: "intra_page"
- \`end_y\`: **Y-coordinate from OCR** (e.g., 250 from [Y:250])
- \`end_marker\`: Brief label (e.g., "DISCHARGE SUMMARY")

**How to find Y-coordinates:**
1. Locate where the encounter boundary occurs in the OCR text
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

Example Output:
\`\`\`json
{
  "start_page": 1,
  "start_boundary_type": "inter_page",
  "start_y": null,  // Always null for inter_page
  "start_marker": null // Always null for inter_page
  "position_confidence": 0.95

  "end_page": 5,
  "end_boundary_type": "intra_page",
  "end_y": 2376,  // Y-coordinate from OCR
  "end_marker": "DISCHARGE SUMMARY",
  "position_confidence": 0.95
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
If you do NOT find any safe split points, return an empty array for the \`safe_split_points\` array (i.e. \`"safe_split_points": []\`).
Prefer a small number of clear, high-confidence split points over many uncertain ones.

**Critical Rules:**
1. DO NOT mark encounter boundaries as split points (those are handled separately)
2. ONLY identify splits WITHIN encounters - places where parallel processing is safe
3. For intra-page splits, provide text marker and Y-coordinate
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
      "split_y": null, // Always null for inter_page
      "marker": null,  // Always null for inter_page
      "confidence": 1.0
    },
    {
      "page": 23,
      "split_type": "intra_page",
      "split_y": 780,  // Y-coordinate from OCR
      "marker": "PATHOLOGY RESULTS",
      "confidence": 0.95
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
      "start_y": null,
      "start_marker": null,  // Always null for inter_page

      "end_page": 2,
      "end_boundary_type": "intra_page",
      "end_y": 1450,
      "end_marker": "Plan discussed with patient",
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

      // Position with coordinates
      "start_page": 2,
      "start_boundary_type": "intra_page",
      "start_y": 1500,
      "start_marker": "ADMISSION NOTE",
      "end_page": 5,
      "end_boundary_type": "inter_page",
      "end_y": null,  // Ends at page boundary (end of chunk)
      "end_marker": null, // Ends at page boundary
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
      
      // Date source tracking
      "date_source": "ai_extracted"  // Possible Values: "ai_extracted" | "file_metadata" | "upload_date"
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
        "split_y": 2100,
        "marker": "PATHOLOGY RESULTS",
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

# DOCUMENT TEXT

Page Range: ${pageRange[0]} to ${pageRange[1]}

${enhancedOcrText}

# CRITICAL REMINDERS

1. Use document page numbers (${pageRange[0]}-${pageRange[1]}), NOT chunk-relative numbers
2. Extract ALL identity fields and medical identifiers if present
3. Set \`is_real_world_visit\` based on Timeline Test (date + provider/facility + actuality)
4. **Use Y-coordinates from [Y:###] tags for ALL intra-page boundaries**
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
