/**
 * AI Prompt Design for Pass 0.5
 * Healthcare Encounter Discovery
 */

import { OCRPage } from '../types';

export interface PromptInput {
  fullText: string;
  pageCount: number;
  ocrPages: OCRPage[];
}

/**
 * Build prompt for encounter discovery (Task 1)
 * GPT-5-mini text analysis
 */
export function buildEncounterDiscoveryPrompt(input: PromptInput): string {
  // Include OCR confidence per page for context
  const pageConfidences = input.ocrPages
    .map((p, idx) => `Page ${idx + 1}: ${(p.confidence * 100).toFixed(0)}%`)
    .join(', ');

  return `
# Task: Healthcare Encounter Discovery

You are analyzing a medical document uploaded by a patient. Your task is to identify ALL healthcare encounters contained in this document.

## Document Information
- Total pages: ${input.pageCount}
- OCR confidence: ${pageConfidences}

## CRITICAL FIRST STEP: Document Unity Analysis

Before identifying encounters, determine the document structure:

### Scenario A: Single Unified Document
**Indicators:**
- Consistent formatting/letterhead throughout
- Single document header (e.g., "Patient Health Summary", "GP Summary", "My Health Record")
- Sections flow together (Medications, Allergies, History are PARTS of the summary)
- No clear page breaks or document boundaries
- Sections like "Current Medications:", "Immunisations:", "Past History:" are COMPONENTS, not separate documents

**Action:** Likely ONE encounter (usually \`pseudo_admin_summary\`)

### Scenario B: Multiple Distinct Documents
**Indicators:**
- Clear page breaks between different documents
- Different letterheads/formatting styles
- Different dates (e.g., March 10 discharge summary + March 20 outpatient consultation)
- Document headers suggesting separate records
- Formatting changes indicating different source files

**Action:** Create SEPARATE encounters for each distinct document

### Scenario C: Mixed Content (Document + Attachments)
**Indicators:**
- Main document with attached lab reports or imaging
- Example: Discharge summary (pages 1-5) + Lab results (pages 6-7)
- Different formats but clearly related to same clinical event

**Action:** Create separate encounters but note they may be related

## STEP 1: Document Type Recognition

**Before identifying encounters, determine the OVERALL document type:**

### A. Single Unified Administrative Document
If the document is ONE cohesive administrative record, create ONLY ONE pseudo-encounter.

**Indicators:**
- Document header/title: "Patient Health Summary", "GP Summary", "Medical Summary", "Patient Profile"
- Contains multiple sections: Medications, Allergies, History, Immunizations, Surgeries
- NO distinct date ranges or providers for individual sections
- Sections are COMPONENTS of the summary, not separate encounters

**Examples:**
- Patient Health Summary with sections for medications, immunizations, past history
- Medicare/Insurance card
- Referral letter (entire letter is one encounter)
- Standalone medication list sheet

**Action:** Create 1 encounter of type \`pseudo_admin_summary\` covering ALL pages

### B. Multi-Document File
If the file contains MULTIPLE DISTINCT documents (clear page breaks, different dates/providers).

**Indicators:**
- Clear page breaks between documents
- Different dates, different providers, different clinical settings
- Examples: Hospital discharge summary + attached lab reports, multiple consultation notes

**Action:** Create separate encounters for each distinct document

## STEP 2: Encounter Classification - THE TIMELINE TEST

**For each identified document, ask: "Can this be placed on a patient's medical timeline with confidence?"**

### Real-World Encounter (Timeline-Worthy)
A completed past visit that meets BOTH criteria:
1. **Specific Date**: YYYY-MM-DD or YYYY-MM format (NOT "recently", "last month", "early 2024")
2. **Provider OR Facility**: Named provider (Dr. Smith) OR specific facility (City Hospital) OR clinical setting (Emergency Department)

**Examples:**
- "Admitted to St Vincent's Hospital 2024-03-10" (date + facility)
- "GP visit with Dr. Jones on 2024-01-15" (date + provider)
- "Emergency Department attendance, January 2024" (date + clinical setting)
- "Patient presented to GP last month" (vague date → pseudo-encounter)
- "Recent hospital admission" (no specific date → pseudo-encounter)

**Encounter Types:** \`inpatient\`, \`outpatient\`, \`emergency_department\`, \`specialist_consultation\`, \`gp_appointment\`, \`telehealth\`

### Planned Encounter (Future Scheduled)
Future appointment or referral with specific date and provider/facility:
- "Referral to cardiologist Dr. Williams, appointment 2024-05-20"
- "Scheduled surgery at City Hospital, 2024-04-15"

**Encounter Types:** \`planned_specialist_consultation\`, \`planned_procedure\`, \`planned_gp_appointment\`
**Set:** \`isRealWorldVisit: false\` (hasn't happened yet)

### Pseudo-Encounter (NOT Timeline-Worthy)
Documents containing clinical info but NOT representing a discrete visit.

**When to use pseudo-encounters:**
- Administrative summaries (health summaries, GP summaries)
- Insurance/Medicare cards
- Standalone medication lists (no specific visit context)
- Referral letters (the letter itself, not the visit it refers to)

**CRITICAL - Pseudo-Encounter Subtypes:**

**Use \`pseudo_admin_summary\` for:**
- Patient Health Summary documents
- GP Summary printouts
- Multi-section administrative summaries
- Any document with header suggesting unified summary

**Use \`pseudo_medication_list\` for:**
- Standalone medication sheets (NOT part of larger summary)

**Use \`pseudo_lab_report\` ONLY when ALL conditions are met:**

1. **Document structure indicates laboratory report:**
   - Header contains: "Pathology", "Laboratory", "Lab Report", "Test Results"
   - OR clear laboratory/pathology letterhead
   - OR structured results table format

2. **Contains actual test values with units:**
   - Multiple analytes: "Hb 135 g/L", "WBC 6.5 x10^9/L", "Na 140 mmol/L"
   - Reference ranges: "Normal: 135-145 mmol/L", "Reference Interval: 11-16 g/dL"
   - NOT just dates of tests without results

3. **Is genuinely standalone:**
   - Separate document (not embedded in summary)
   - Has its own page range
   - Different format from surrounding pages

**DO NOT use \`pseudo_lab_report\` for:**
- Immunization/vaccination records (these are procedures, not lab tests)
- Medication lists
- Vital signs within consultation notes
- Test results mentioned in a larger summary document

**Use \`pseudo_imaging_report\` ONLY for:**
- Radiology reports: X-ray, CT, MRI, ultrasound interpretations with radiologist findings
- Must have imaging interpretation/findings (not just order or mention)
- NOT procedure notes that mention imaging

### Date Precision Requirements
- VALID **Specific:** "2024-03-15", "March 2024", "15-20 January 2024"
- INVALID **Vague:** "last month", "recently", "early 2024", "a few weeks ago", "Day 2" (relative without anchor)

**If date is vague:** Create pseudo-encounter, leave \`dateRange\` null

### What NOT to Create as Separate Encounters

**DO NOT split unified documents into sections:**
- If document header says "Patient Health Summary", "GP Summary", "My Health Record" → keep it as ONE \`pseudo_admin_summary\`
- Sections like "Current Medications:", "Immunisations:", "Past History:", "Allergies:" are COMPONENTS, not separate encounters
- Multi-section administrative documents remain ONE encounter

**DO NOT create pseudo_lab_report for:**
- Immunization/vaccination records (these are procedures/interventions, NOT diagnostic lab tests)
- Vital signs listed in a consultation note (part of the consultation encounter)
- Brief test results mentioned in discharge summary (part of the discharge encounter)
- Medication lists (use \`pseudo_medication_list\` or keep in admin summary)
- Sections within a larger administrative summary

**DO NOT create separate encounters for historical mentions:**
- Brief mentions: "Patient previously seen by GP for chest pain"
- Embedded references: "Discharge summary notes initial GP visit on 2024-01-10..." (main encounter is discharge, not the mentioned GP visit)

**ONLY create separate encounter if:**
- Full distinct document with clear boundaries
- Different formatting/letterhead
- OR: Real-world visit with date + provider/facility + distinct page range

## Common Misclassification Prevention

### Immunization Records
**These are NOT lab reports** - they are procedures/interventions, not diagnostic tests
- If part of a health summary → keep in the summary encounter (\`pseudo_admin_summary\`)
- If standalone immunization certificate → \`pseudo_admin_summary\` (unless better type exists)
- Look for: "Immunisation", "Vaccination", "Vaccine administered"
- Structure: Date + vaccine name (e.g., "11/04/2010 Fluvax (Influenza)")

### Medication Lists
- If standalone sheet → \`pseudo_medication_list\`
- If section in a larger summary → part of the \`pseudo_admin_summary\` encounter
- Do NOT create separate encounter for medication section within unified document

### Administrative Summaries
- Headers: "Patient Health Summary", "GP Summary", "My Health Record", "Health Summary"
- Even if contains multiple sections (medications, allergies, immunizations, history) → ONE encounter
- Type: \`pseudo_admin_summary\`
- Facility may be present (from header/footer)
- Provider usually NULL (summary not specific to one visit)

## Decision Tree for Administrative Summaries

When you see a document with header "Patient Health Summary" or "GP Summary":

1. Is this a single cohesive document?
   → YES: Create 1 \`pseudo_admin_summary\` encounter, STOP

2. Does it contain multiple sections (medications, immunizations, history)?
   → YES: These are COMPONENTS of the summary, NOT separate encounters
   → Keep as 1 \`pseudo_admin_summary\`

3. Are immunizations listed?
   → Do NOT create \`pseudo_lab_report\` for immunizations
   → Immunizations are part of the admin summary

4. Are medications listed?
   → If standalone medication sheet: \`pseudo_medication_list\`
   → If part of larger summary: Include in \`pseudo_admin_summary\`

## Encounter Segmentation Decision Hierarchy

When uncertain about splitting vs. keeping unified:

1. **Default to document boundaries** - Respect clear document breaks (different letterheads, formatting changes)
2. **Preserve multi-document capability** - System MUST handle jumbled uploads (3 discharge summaries + 2 lab reports)
3. **But avoid over-segmentation** - Don't split sections of a unified document into separate encounters
4. **Use confidence scores** - Lower confidence (0.70-0.85) when uncertain about boundaries

**Key Principle:** This system is designed to handle complex multi-document uploads (out-of-order pages, mixed records).
Don't artificially force everything into one encounter, but also don't split unified documents into artificial pieces.

## Critical Constraints

### 1. NON-OVERLAPPING PAGE RANGES (PHASE 1 REQUIREMENT)
**Each page MUST belong to exactly ONE encounter**
- If page 3 has content from multiple encounters, choose the DOMINANT encounter for that page
- Example:
  - VALID: Encounter A: pages [1,2,3], Encounter B: pages [4,5,6]
  - INVALID: Encounter A: pages [1,2,3], Encounter B: pages [3,4,5] (page 3 overlaps)

### 2. Confidence Scoring
Your \`confidence\` should reflect:
- HIGH (0.85-1.0): Clear dates, provider, facility, distinct page boundaries
- MEDIUM (0.65-0.85): Some missing info (no provider OR vague facility) but clearly separate document
- LOW (0.40-0.65): Ambiguous boundaries or missing key info

## Instructions

1. **Read the entire document** (all ${input.pageCount} pages)
2. **Apply Timeline Test** to each potential encounter
3. **Ensure non-overlapping page ranges**
4. **For each encounter, extract:**
   - Type (from lists above)
   - \`isRealWorldVisit\`: true (past completed), false (planned future OR pseudo)
   - Date range (null if vague date)
   - Provider name (null if not mentioned)
   - Facility name (null if not mentioned)
   - Page ranges (non-overlapping, can be non-contiguous like [[1,3],[7,8]])
   - Confidence (0.0-1.0)

5. **Return JSON** - Examples below show common scenarios in order of likelihood:

**Example 1: Single Administrative Summary (MOST COMMON)**
\`\`\`json
{
  "encounters": [
    {
      "encounterType": "pseudo_admin_summary",
      "isRealWorldVisit": false,
      "dateRange": null,
      "provider": null,
      "facility": "South Coast Medical",
      "pageRanges": [[1, 1]],
      "confidence": 0.95,
      "extractedText": "Patient Health Summary - Xavier Flanagan DOB: 25/04/1994 Current Medications: Metformin 500mg..."
    }
  ]
}
\`\`\`

**Example 2: Single Real-World Clinical Visit (COMMON)**
\`\`\`json
{
  "encounters": [
    {
      "encounterType": "discharge_summary",
      "isRealWorldVisit": true,
      "dateRange": {
        "start": "2024-03-10",
        "end": "2024-03-15"
      },
      "provider": "Dr Jane Smith",
      "facility": "St Vincent's Hospital",
      "pageRanges": [[1, 5]],
      "confidence": 0.95,
      "extractedText": "Discharge Summary - Admission for cholecystectomy..."
    }
  ]
}
\`\`\`

**Example 3: Multiple Distinct Documents (LESS COMMON but system MUST support)**
\`\`\`json
{
  "encounters": [
    {
      "encounterType": "discharge_summary",
      "isRealWorldVisit": true,
      "dateRange": {"start": "2024-03-10", "end": "2024-03-15"},
      "provider": "Dr Smith",
      "facility": "City Hospital",
      "pageRanges": [[1, 3]],
      "confidence": 0.92,
      "extractedText": "Discharge Summary - Surgical admission..."
    },
    {
      "encounterType": "pseudo_lab_report",
      "isRealWorldVisit": false,
      "dateRange": null,
      "provider": null,
      "facility": "PathLab Services",
      "pageRanges": [[4, 5]],
      "confidence": 0.88,
      "extractedText": "PATHOLOGY REPORT - FBC: Hb 145 g/L (135-175), WBC 7.2 x10^9/L..."
    },
    {
      "encounterType": "outpatient",
      "isRealWorldVisit": true,
      "dateRange": {"start": "2024-03-20"},
      "provider": "Dr Jones",
      "facility": "Medical Centre",
      "pageRanges": [[6, 8]],
      "confidence": 0.90,
      "extractedText": "Outpatient consultation - Post-surgical follow-up..."
    }
  ]
}
\`\`\`

**CRITICAL - Page Range Format:**
- pageRanges must ALWAYS include BOTH start AND end page as numbers
- Single page: [[1, 1]] NOT [[1]] or [[1, null]]
- Multiple pages: [[1, 5]] NOT [[1, 5, null]]
- Non-contiguous: [[1, 3], [7, 8]] (separate ranges for separate sections)

## Important Notes

- If multiple pages discuss the same encounter, use page ranges: [[1,5], [10,12]]
- For pseudo-encounters, leave dateRange, provider, facility as null
- If no encounters found, return empty array: {"encounters": []}
- Confidence should reflect certainty in encounter identification (not OCR quality)
- extractedText should be first 100 characters of encounter content (for debugging)

## Document Text (OCR Output)

${input.fullText}

## Your Response (JSON only)
`.trim();
}
