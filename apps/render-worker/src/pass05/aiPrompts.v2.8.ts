/**
 * Pass 0.5 AI Prompt - v2.8 Optimized + Boundary Fixes
 * Healthcare Encounter Discovery
 *
 * VERSION: v2.8 (Nov 5, 2025) - v2.7 + Critical Boundary Guidance Restored
 * - Re-added Boundary Detection Priority List
 * - Re-added Pattern D Example (Frankenstein scenario)
 * - Re-added Document Header vs Metadata Distinction
 * - NEW: Boundary Verification Step
 * - NEW: Citation Requirement
 * - Re-added Confidence <0.50 Guardrail
 *
 * To use this version: Set environment variable PASS_05_VERSION=v2.8
 */

import { OCRPage } from './types';

export interface PromptInput {
  fullText: string;
  pageCount: number;
  ocrPages: OCRPage[];
}

/**
 * Build optimized v2.8 prompt for encounter discovery
 */
export function buildEncounterDiscoveryPromptV28(input: PromptInput): string {
  // Include OCR confidence per page for context
  const pageConfidences = input.ocrPages
    .map((p, idx) => `Page ${idx + 1}: ${((p.confidence || 0) * 100).toFixed(0)}%`)
    .join(', ');

  return `
# Task: Healthcare Encounter Discovery

You are analyzing a medical document uploaded by a patient. Your task is to identify ALL healthcare encounters contained in this document.

## Document Information
- Total pages: ${input.pageCount}
- OCR confidence: ${pageConfidences}

**IMPORTANT:** Pages are marked with explicit boundaries in the OCR text below. Look for "--- PAGE N START ---" markers and use these to track which page you're analyzing. Your justifications must reference content from the specific page number you assign.

# Core Principle: Timeline Test

**A healthcare encounter is timeline-worthy when it has BOTH:**
1. **Specific Date**: YYYY-MM-DD or YYYY-MM format
2. **Provider OR Facility**: Named healthcare provider OR specific facility

**Timeline-Worthy Examples:**
- "Admitted to St Vincent's Hospital 2024-03-10" (date + facility)
- "GP visit with Dr. Jones on 2024-01-15" (date + provider)
- "Pathology report collected 03-Jul-2025 at NSW Health Pathology" (date + facility)
- "Imaging study dated 15-Mar-2024 from City Radiology" (date + facility)

**Not Timeline-Worthy (Pseudo-Encounters):**
- Medication lists without visit dates
- Lab reports without collection dates
- Administrative summaries
- Insurance forms
- General health information

# Examples

## Example 1: Multi-Encounter Document (Frankenstein File)
**Input:** 12-page specialist consultation followed by 8-page emergency department visit
**Output:**
\`\`\`json
{
  "page_assignments": [
    {"page": 1, "encounter_id": "enc-1", "justification": "Letterhead shows Interventional Spine & Pain PC"},
    {"page": 12, "encounter_id": "enc-1", "justification": "Signatures for specialist encounter"},
    {"page": 13, "encounter_id": "enc-2", "justification": "NEW Encounter Summary header for ED"},
    {"page": 20, "encounter_id": "enc-2", "justification": "ED discharge instructions end"}
  ],
  "encounters": [
    {
      "encounter_id": "enc-1",
      "encounterType": "specialist_consultation",
      "isRealWorldVisit": true,
      "dateRange": {
        "start": "2025-10-27",
        "end": null
      },
      "provider": "Mara Ehret, PA-C",
      "facility": "Interventional Spine & Pain PC",
      "summary": "Pain management specialist visit on October 27, 2025 for post-procedure follow-up",
      "confidence": 0.96,
      "pageRanges": [[1, 12]],
      "extractedText": "INTERVENTIONAL SPINE & PAIN PC - Visit Date: 10/27/2025..."
    },
    {
      "encounter_id": "enc-2",
      "encounterType": "emergency_department",
      "isRealWorldVisit": true,
      "dateRange": {
        "start": "2025-06-22",
        "end": null
      },
      "provider": "Matthew T Tinkham, MD",
      "facility": "Piedmont Eastside Medical Emergency Department",
      "summary": "Emergency Department visit on June 22, 2025 after motor vehicle collision",
      "confidence": 0.97,
      "pageRanges": [[13, 20]],
      "extractedText": "ENCOUNTER SUMMARY - ED Visit 06/22/2025..."
    }
  ]
}
\`\`\`

## Example 2: Mixed Real and Pseudo Encounters
**Input:** 2-page document with medication list and lab report with collection date
**Output:**
\`\`\`json
{
  "page_assignments": [
    {"page": 1, "encounter_id": "enc-1", "justification": "Pharmacy dispensing label for medication"},
    {"page": 2, "encounter_id": "enc-2", "justification": "Lab report with collection date 03-Jul-2025"}
  ],
  "encounters": [
    {
      "encounter_id": "enc-1",
      "encounterType": "pseudo_medication_list",
      "isRealWorldVisit": false,
      "dateRange": null,
      "provider": null,
      "facility": "Sydney Hospital Pharmacy",
      "summary": "Pharmacy dispensing label for moxifloxacin 400 mg",
      "confidence": 0.90,
      "pageRanges": [[1, 1]],
      "extractedText": "SYDNEY HOSPITAL PHARMACY - Moxifloxacin 400mg..."
    },
    {
      "encounter_id": "enc-2",
      "encounterType": "outpatient",
      "isRealWorldVisit": true,
      "dateRange": {
        "start": "2025-07-03",
        "end": null
      },
      "provider": null,
      "facility": "NSW Health Pathology",
      "summary": "Pathology test collected 03-Jul-2025 for Mycoplasma genitalium",
      "confidence": 0.94,
      "pageRanges": [[2, 2]],
      "extractedText": "NSW HEALTH PATHOLOGY - Collected: 03-Jul-2025..."
    }
  ]
}
\`\`\`

## Example 3: Administrative Summary (Single Pseudo-Encounter)
**Input:** 1-page health summary with multiple sections
**Output:**
\`\`\`json
{
  "page_assignments": [
    {"page": 1, "encounter_id": "enc-1", "justification": "Single-page health summary from South Coast Medical"}
  ],
  "encounters": [
    {
      "encounter_id": "enc-1",
      "encounterType": "pseudo_admin_summary",
      "isRealWorldVisit": false,
      "dateRange": null,
      "provider": null,
      "facility": "South Coast Medical",
      "summary": "Comprehensive health summary including medications, immunizations, and medical history",
      "confidence": 0.95,
      "pageRanges": [[1, 1]],
      "extractedText": "Patient Health Summary - Current Medications: Metformin..."
    }
  ]
}
\`\`\`

# Document Structure Analysis

Analyze the document to determine its structure:

## Single vs Multiple Encounters

Look for boundary signals indicating new encounters:
- Headers: "Encounter Summary", "Visit Note", "Discharge Summary"
- Provider/facility changes between pages
- Date discontinuities (jumping between different dates)
- Document type changes (consultation → emergency → lab report)

### Boundary Detection Priority (Strongest → Weakest)

When determining encounter boundaries, use this weighted priority system:

1. **New "Encounter Summary" / "Clinical Summary" / "Visit Summary" document header** = VERY STRONG SIGNAL (98% confidence boundary)
2. **Provider name change** (Dr. Smith → Dr. Jones) = VERY STRONG SIGNAL (95% confidence boundary)
3. **New document header with date/time** = VERY STRONG SIGNAL
4. **Facility name change** = STRONG SIGNAL
5. **Patient name change** = STRONG SIGNAL
6. **Author system change** (eClinicalWorks → Epic) = MODERATE SIGNAL
7. **Date discontinuity** = MODERATE SIGNAL
8. **Content type change** (Clinical → Metadata) = WEAK SIGNAL
9. **Formatting change alone** = VERY WEAK SIGNAL

**Key Principle:** "Encounter Summary" headers and provider changes override weaker signals like temporal proximity or formatting changes.

## Document Unity Scenarios

**Scenario A: Single Continuous Encounter**
- Same provider/facility throughout
- Continuous date or single visit
- Consistent document type
- Example: 5-page hospital discharge spanning admission to discharge

**Scenario B: Multiple Independent Encounters**
- Clear headers separating sections
- Different providers/facilities
- Different dates
- Example: GP visit + lab report + specialist consult in one PDF

**Scenario C: Administrative Summary**
- Summary of multiple past visits
- No single primary encounter
- Often insurance or transfer documents
- Classify as "pseudo_admin_summary" (pseudo-encounter)
- Example: "Patient Health Summary" with medications + immunizations + history

**Scenario D: Metadata-Only Pages**
- Cover sheets, fax headers, routing pages
- No clinical content
- Assign to adjacent encounter based on provider/facility continuity

## CRITICAL: Document Header Pages vs Metadata Pages

**Document Header/Title Pages (Strong Encounter Boundary Signal):**
- Headers containing: "Encounter Summary", "Clinical Summary", "Visit Summary", "Patient Visit"
- Often include document generation metadata: "Generated for Printing on [Date]", "Created on [Date]"
- **These mark the START of a NEW encounter**, NOT metadata for a previous one

**Critical Distinction:**
- **Generation/Created Date** (in header): When the report was printed/generated (metadata)
- **Encounter Date** (in body text): When the clinical visit actually occurred (clinical data)
- Example: "Encounter Summary (Created Oct 30)" with "Visit Date: June 22" → encounter date is June 22, not Oct 30

**RULE:** Document title pages with "Encounter/Clinical/Visit Summary" are encounter STARTERS, not metadata pages for previous encounters. Don't be misled by generation dates that are close to previous encounter dates.

## Pattern D: Document Header Page Confusion (Frankenstein Scenario)

**Scenario:**
- Page 13: Clinical content ending (Dr. Smith, signed October 27)
- Page 14: "Encounter Summary (Generated October 30)" + "Encounter Date: June 22" (Dr. Jones)

**Result:** Page 14 is START of NEW encounter (Dr. Jones, June 22), NOT metadata for page 13

**Boundary:** Page 13/14 (new document header + provider change)

**Key:** Don't be misled by generation date (Oct 30) being close to previous encounter (Oct 27). The actual encounter date (June 22) and provider change confirm this is a separate encounter.

# Encounter Classification

## Real-World Encounters (Timeline-Worthy)
Must pass Timeline Test (specific date + provider/facility):

**Valid Types (from TypeScript union):**
- **inpatient**: Hospital admissions, multi-day stays
- **outpatient**: Outpatient clinics, dated lab reports, dated imaging reports
- **emergency_department**: ED/ER visits
- **specialist_consultation**: Specialist appointments
- **gp_appointment**: GP/family doctor visits
- **telehealth**: Virtual consultations with dates

## Planned Encounters (Future Events)
- **planned_procedure**: Scheduled future surgeries
- **planned_specialist_consultation**: Scheduled specialist visits
- **planned_gp_appointment**: Scheduled GP visits
Requirements: Future date + provider/facility

## Pseudo-Encounters (Not Timeline-Worthy)
Documents without specific dates OR missing provider/facility:

- **pseudo_medication_list**: Medication lists without visit context
- **pseudo_lab_report**: Lab results without collection dates
- **pseudo_imaging_report**: Imaging without study dates
- **pseudo_admin_summary**: Multi-visit summaries, health records
- **pseudo_referral_letter**: Referral letters
- **pseudo_insurance**: Insurance forms
- **pseudo_unverified_visit**: Vague dates or insufficient details

**CRITICAL:** Lab/imaging reports WITH specific collection/study dates + facility are timeline-worthy (use "outpatient" type).

# Page-by-Page Assignment

For each page, you MUST specify which encounter it belongs to with justification:

\`\`\`json
"page_assignments": [
  {
    "page": 1,
    "encounter_id": "enc-1",
    "justification": "Brief description citing EXACT phrases from this page"
  },
  {
    "page": 2,
    "encounter_id": "enc-1",
    "justification": "Must reference actual content from PAGE 2"
  }
]
\`\`\`

**Citation Requirement:** Justifications must cite exact phrases, headers, or dates that appear on THAT SPECIFIC PAGE. Do not describe content from a different page.

Justification should reference:
- Headers/titles on the page (use exact wording)
- Provider/facility names found on that page
- Dates mentioned on that page
- Document continuity markers
- Boundary signals (NEW encounter headers with exact text)

# Output Requirements

## JSON Structure

Your response must be valid JSON with this exact structure:

\`\`\`json
{
  "page_assignments": [
    {
      "page": number,
      "encounter_id": "enc-N",
      "justification": "string"
    }
  ],
  "encounters": [
    {
      "encounter_id": "enc-N",
      "encounterType": "EncounterType",
      "isRealWorldVisit": boolean,
      "dateRange": {"start": "YYYY-MM-DD or YYYY-MM", "end": "YYYY-MM-DD or YYYY-MM"} | null,
      "provider": "string" | null,
      "facility": "string" | null,
      "summary": "string",
      "confidence": 0.0-1.0,
      "pageRanges": [[startPage, endPage]],
      "extractedText": "string (optional)"
    }
  ]
}
\`\`\`

## Field Requirements

**encounter_id:**
- Must be unique string (enc-1, enc-2, enc-3, etc.)
- Must match between page_assignments and encounters arrays

**encounterType:**
- Must be one of the valid types from classification section above
- Use exact spelling (lowercase with underscores)

**dateRange:**
- Use ISO date format: YYYY-MM-DD (preferred) or YYYY-MM (if only month known)
- end is optional (null for single-day encounters)
- Set to null for pseudo-encounters without dates
- For planned encounters, populate with future date

**provider/facility:**
- Extract actual names from document
- Set to null if not present
- For real-world encounters, at least one should be populated

**isRealWorldVisit:**
- true for completed past visits (real-world encounters)
- false for planned encounters (future) and pseudo-encounters

**confidence:**
- 0.95-1.00: Crystal clear identification
- 0.85-0.94: Mostly clear with minor ambiguity
- 0.70-0.84: Some uncertainty about classification
- 0.50-0.69: Significant uncertainty
- **Below 0.50: RECONSIDER your classification** - this indicates you should re-evaluate the encounter type or boundaries

**summary:**
- Plain English description
- Real encounters: "[Type] on [date] with [provider] at [facility] for [reason]"
- Pseudo encounters: "[Document type] from [facility] containing [key content]"

**extractedText:**
- Optional sample text from encounter (for debugging)
- First 100-200 characters

# Common Patterns

1. **Lab reports with collection dates** → Real encounters (outpatient type)
2. **Frankenstein files** → Multiple encounters with clear boundary detection
3. **Administrative summaries** → Single pseudo_admin_summary covering all pages
4. **Medication lists** → Pseudo unless part of a visit note with date
5. **Referral letters** → May contain both past visit (real) and future appointment (planned)
6. **Multi-day admissions** → Use dateRange with both start and end dates

# Boundary Verification Step (FINAL CHECK)

Before finalizing your response, verify each proposed encounter boundary:

1. **Check boundary page content:** Ensure the page you marked as a boundary actually contains the signal you cited (e.g., "Encounter Summary" header, provider change)

2. **Look ahead one page:** If the NEXT page has a stronger boundary signal (e.g., "Encounter Summary" header), shift your boundary forward to that page

3. **Verify justifications:** Confirm each page's justification cites content from THAT specific page, not from adjacent pages

4. **Provider continuity:** Metadata pages should be grouped with the encounter they describe (same provider/facility)

If you find any misalignments during this check, adjust your page assignments accordingly.

# Critical Rules

- Every page must be assigned to exactly one encounter
- Apply Timeline Test consistently (date + provider/facility = timeline-worthy)
- encounter_id values must match between page_assignments and encounters
- Use only valid encounterType values from the classification section
- For real-world encounters with specific dates, populate dateRange and set isRealWorldVisit to true
- For planned encounters, populate dateRange but set isRealWorldVisit to false
- For pseudo-encounters, set dateRange to null and isRealWorldVisit to false
- When uncertain between types, prefer more general classification
- Page assignments must have justifications (15-20 words) citing EXACT content from that page
- Confidence scores must reflect both identification certainty and boundary detection accuracy
- Use the page markers ("--- PAGE N START ---") to track your position in the document

## Document Text (OCR Output)

${input.fullText}

## Your Response (JSON only)
`.trim();
}
