/**
 * AI Prompt Design for Pass 0.5
 * Healthcare Encounter Discovery
 */

import { OCRPage } from './types';

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

## STEP 1: Document Type Recognition (CRITICAL FIRST STEP)

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

**Use \`pseudo_lab_report\` ONLY for:**
- Pathology reports: Blood tests, chemistry panels, FBC, LFTs, U&E
- Microbiology culture results
- NOT immunization records
- NOT vital signs in consultation notes
- NOT test results embedded in discharge summaries

**Use \`pseudo_imaging_report\` ONLY for:**
- Radiology reports: X-ray, CT, MRI, ultrasound interpretations
- NOT procedure notes that mention imaging

### Date Precision Requirements
- VALID **Specific:** "2024-03-15", "March 2024", "15-20 January 2024"
- INVALID **Vague:** "last month", "recently", "early 2024", "a few weeks ago", "Day 2" (relative without anchor)

**If date is vague:** Create pseudo-encounter, leave \`dateRange\` null

### What NOT to Create as Separate Encounters

**DO NOT split administrative summaries into sections:**
- If document header says "Patient Health Summary", keep it as ONE \`pseudo_admin_summary\` encounter
- Sections like "Current Medications", "Immunisations", "Past History" are COMPONENTS, not separate encounters
- Immunization records are NOT lab reports (they are procedures/interventions, not diagnostic tests)

**DO NOT create pseudo_lab_report for:**
- Immunization/vaccination records (part of admin summary or parent encounter)
- Vital signs listed in a consultation note (part of consultation)
- Brief test results mentioned in discharge summary (part of discharge)
- Medication lists

**DO NOT create separate encounters for historical mentions:**
- Brief mentions: "Patient previously seen by GP for chest pain"
- Embedded references: "Discharge summary notes initial GP visit on 2024-01-10..." (main encounter is discharge, not GP visit)

**ONLY create separate encounter if:** Full detail provided (date + provider/facility + distinct page range)

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

5. **Return JSON** with the following structure:

\`\`\`json
{
  "encounters": [
    {
      "encounterType": "inpatient",
      "isRealWorldVisit": true,
      "dateRange": {
        "start": "2024-03-10",
        "end": "2024-03-15"
      },
      "provider": "Dr Jane Smith",
      "facility": "St Vincent's Hospital Sydney",
      "pageRanges": [[1, 10], [15, 18]],
      "confidence": 0.95,
      "extractedText": "Hospital admission for cholecystectomy..."
    },
    {
      "encounterType": "pseudo_medication_list",
      "isRealWorldVisit": false,
      "pageRanges": [[19, 20]],
      "confidence": 0.90,
      "extractedText": "Current medications: Metformin 500mg BD..."
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
