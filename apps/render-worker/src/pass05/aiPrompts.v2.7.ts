/**
 * Pass 0.5 AI Prompt - v2.7 Optimized
 * Healthcare Encounter Discovery
 *
 * VERSION: v2.7 (Nov 5, 2025) - Optimized & Bug-Fixed
 * - Phase 1 optimization: Token reduction, linear flow, consolidated sections
 * - Schema alignment: All field names match TypeScript interfaces
 * - Logic fixes: Planned encounters, date precision, page assignment consistency
 *
 * To use this version: Set environment variable PASS_05_VERSION=v2.7
 */

import { OCRPage } from './types';

export interface PromptInput {
  fullText: string;
  pageCount: number;
  ocrPages: OCRPage[];
}

/**
 * Build optimized v2.7 prompt for encounter discovery
 */
export function buildEncounterDiscoveryPromptV27(input: PromptInput): string {
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
- Assign to adjacent encounter based on context

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
    "justification": "Brief description of why this page belongs to enc-1"
  },
  {
    "page": 2,
    "encounter_id": "enc-1",
    "justification": "Continuation of same encounter"
  }
]
\`\`\`

Justification should reference:
- Headers/titles on the page
- Provider/facility names
- Dates mentioned
- Document continuity markers
- Boundary signals (NEW encounter headers)

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

# Critical Rules

- Every page must be assigned to exactly one encounter
- Apply Timeline Test consistently (date + provider/facility = timeline-worthy)
- encounter_id values must match between page_assignments and encounters
- Use only valid encounterType values from the classification section
- For real-world encounters with specific dates, populate dateRange and set isRealWorldVisit to true
- For planned encounters, populate dateRange but set isRealWorldVisit to false
- For pseudo-encounters, set dateRange to null and isRealWorldVisit to false
- When uncertain between types, prefer more general classification
- Page assignments must have justifications (15-20 words)
- Confidence scores must reflect both identification certainty and boundary detection accuracy

## Document Text (OCR Output)

${input.fullText}

## Your Response (JSON only)
`.trim();
}
