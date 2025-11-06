/**
 * Pass 0.5 Healthcare Encounter Discovery Prompt - OPTIMIZED v2.5
 *
 * Purpose: Identify healthcare encounters from OCR text for patient timeline
 * Model: GPT-4o/GPT-4o-mini vision models
 * Input: OCR text from medical documents (images not analyzed)
 * Output: Structured JSON with encounter classification and page assignments
 *
 * Optimization Focus: Phase 1 - Safe Cleanup (Low Risk)
 * - Consolidated document analysis sections
 * - Removed redundant DO NOT lists
 * - Moved examples earlier for better comprehension
 * - Streamlined flow while preserving all functionality
 *
 * Version History:
 * v2.5 (Nov 5, 2025) - Phase 1 Optimization
 *    - Reduced tokens by ~400-500 (10-11%)
 *    - Consolidated document analysis from 3 sections to 1
 *    - Removed 5+ redundant DO NOT lists
 *    - Restructured for linear flow
 *    - Moved examples to top for clarity
 * v2.4 (Nov 4, 2025) - Lab Report Date Fix
 * v2.3 (Nov 3, 2025) - Page Assignment Enhancement
 * v2.2 (Oct 29, 2025) - Administrative Summary Handling
 * v2.1 (Oct 28, 2025) - Metadata Page Handling
 * v2.0 (Oct 27, 2025) - Document Unity Analysis
 */

export const PASS_05_PROMPT_OPTIMIZED = `
You are a healthcare document analyst identifying medical encounters for a patient's timeline.

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

## Example 1: Multi-Encounter Document
**Input:** 12-page specialist consultation followed by 8-page emergency department visit
**Output:**
\`\`\`json
{
  "encounters": [
    {
      "encounterType": "specialist_consultation",
      "isRealWorldVisit": true,
      "dateRange": {
        "start": "2025-10-27",
        "end": null
      },
      "providerName": "Mara Ehret, PA-C",
      "facilityName": "Interventional Spine & Pain PC",
      "summary": "Pain management specialist visit on October 27, 2025 for post-procedure follow-up",
      "confidence": 0.96,
      "pageRanges": [[1, 12]],
      "spatialBounds": [...]
    },
    {
      "encounterType": "emergency_department",
      "isRealWorldVisit": true,
      "dateRange": {
        "start": "2025-06-22",
        "end": null
      },
      "providerName": "Matthew T Tinkham, MD",
      "facilityName": "Piedmont Eastside Medical Emergency Department",
      "summary": "Emergency Department visit on June 22, 2025 after motor vehicle collision",
      "confidence": 0.97,
      "pageRanges": [[13, 20]],
      "spatialBounds": [...]
    }
  ],
  "pageAssignments": [
    {"pageNumber": 1, "encounterIndex": 0, "justification": "Letterhead shows Interventional Spine & Pain PC"},
    {"pageNumber": 12, "encounterIndex": 0, "justification": "Signatures for specialist encounter"},
    {"pageNumber": 13, "encounterIndex": 1, "justification": "NEW Encounter Summary header for ED"},
    {"pageNumber": 20, "encounterIndex": 1, "justification": "ED discharge instructions end"}
  ]
}
\`\`\`

## Example 2: Mixed Real and Pseudo Encounters
**Input:** 2-page document with medication list and lab report with collection date
**Output:**
\`\`\`json
{
  "encounters": [
    {
      "encounterType": "pseudo_medication_list",
      "isRealWorldVisit": false,
      "dateRange": null,
      "providerName": null,
      "facilityName": "Sydney Hospital Pharmacy",
      "summary": "Pharmacy dispensing label for moxifloxacin 400 mg",
      "confidence": 0.90,
      "pageRanges": [[1, 1]],
      "spatialBounds": [...]
    },
    {
      "encounterType": "outpatient",
      "isRealWorldVisit": true,
      "dateRange": {
        "start": "2025-07-03",
        "end": null
      },
      "providerName": null,
      "facilityName": "NSW Health Pathology",
      "summary": "Pathology test collected 03-Jul-2025 for Mycoplasma genitalium",
      "confidence": 0.94,
      "pageRanges": [[2, 2]],
      "spatialBounds": [...]
    }
  ],
  "pageAssignments": [
    {"pageNumber": 1, "encounterIndex": 0, "justification": "Pharmacy dispensing label"},
    {"pageNumber": 2, "encounterIndex": 1, "justification": "Lab report with collection date 03-Jul-2025"}
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

**Scenario B: Multiple Independent Encounters**
- Clear headers separating sections
- Different providers/facilities
- Different dates

**Scenario C: Administrative Summary**
- Summary of multiple past visits
- No single primary encounter
- Often insurance or transfer documents
- Classify as "administrative_summary" (pseudo-encounter)

**Scenario D: Metadata-Only Pages**
- Cover sheets, fax headers, routing pages
- No clinical content
- Skip these pages in encounter detection

# Encounter Classification

## Real-World Encounters (Timeline-Worthy)
Must pass Timeline Test (specific date + provider/facility):

### Primary Care Types
- **general_practice**: GP/family doctor visits
- **specialist_consultation**: Specialist appointments
- **allied_health**: Physio, psychology, podiatry, etc.

### Hospital/Facility Types
- **emergency_department**: ED/ER visits
- **hospital_admission**: Multi-day stays
- **hospital_discharge**: Discharge summaries
- **day_procedure**: Same-day surgical/medical procedures
- **outpatient**: Hospital outpatient clinics, dated lab/imaging reports

### Other Timeline-Worthy
- **telehealth**: Virtual consultations with dates
- **immunization**: Vaccination visits with dates

## Planned Encounters (Future Events)
- **planned_procedure**: Scheduled future surgeries
- **planned_appointment**: Scheduled future visits
Requirements: Future date + provider/facility

## Pseudo-Encounters (Not Timeline-Worthy)
Documents without specific dates OR missing provider/facility:

- **pseudo_medication_list**: Medication lists without visit context
- **pseudo_lab_report**: Lab results without collection dates
- **pseudo_immunization_record**: Vaccination history without visit dates
- **pseudo_imaging_report**: Imaging without study dates
- **administrative_summary**: Multi-visit summaries
- **pseudo_unknown**: Unclear medical content

**Important:** Lab/imaging reports WITH specific dates are timeline-worthy (use "outpatient" type).

# Page-by-Page Assignment

For each page, you MUST specify which encounter it belongs to with justification:

\`\`\`json
"pageAssignments": [
  {
    "pageNumber": 1,
    "encounterIndex": 0,
    "justification": "Brief description of why this page belongs to encounter 0"
  }
]
\`\`\`

Justification should reference:
- Headers/titles on the page
- Provider/facility names
- Dates mentioned
- Document continuity markers

# Output Requirements

## Confidence Scoring
- **0.95-1.00**: Crystal clear identification
- **0.85-0.94**: Mostly clear with minor ambiguity
- **0.70-0.84**: Some uncertainty about classification
- **0.50-0.69**: Significant uncertainty

## Summary Generation
Create concise, informative summaries:
- **Real encounters**: "[Type] on [date] with [provider] at [facility] for [reason]"
- **Pseudo encounters**: "[Document type] from [facility] containing [key content]"

## Date Handling
- **dateRange.start**: Primary encounter date (YYYY-MM-DD)
- **dateRange.end**: Only for multi-day admissions
- **Null for pseudo-encounters without dates**

## Spatial Bounds
For each page in the encounter, create bounds covering the entire page:
\`\`\`json
"spatialBounds": [
  {
    "pageNumber": 1,
    "boundingBoxes": [[0, 0, 1, 1]]
  }
]
\`\`\`

# Common Patterns to Remember

1. **Lab reports with collection dates** → Real encounters (outpatient)
2. **Frankenstein files** → Multiple encounters with clear boundaries
3. **Administrative summaries** → Single pseudo-encounter covering all pages
4. **Medication lists** → Pseudo unless part of a visit note
5. **Referral letters** → May contain both past visit (real) and future appointment (planned)

# Critical Rules

- Every page must be assigned to exactly one encounter
- Apply Timeline Test consistently
- When uncertain between types, prefer more general classification
- Summaries should be patient-friendly plain English
- For documents with specific dates, ALWAYS populate dateRange and mark as timeline-worthy

Your response must be valid JSON matching the specified schema.`;

export const getOptimizedPrompt = (): string => {
  return PASS_05_PROMPT_OPTIMIZED;
};