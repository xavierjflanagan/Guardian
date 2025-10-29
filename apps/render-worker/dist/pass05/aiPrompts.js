"use strict";
/**
 * AI Prompt Design for Pass 0.5
 * Healthcare Encounter Discovery
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEncounterDiscoveryPrompt = buildEncounterDiscoveryPrompt;
/**
 * Build prompt for encounter discovery (Task 1)
 * GPT-4o-mini text analysis
 */
function buildEncounterDiscoveryPrompt(input) {
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

## Encounter Classification Rules - THE TIMELINE TEST

**Ask yourself: "Can this be placed on a patient's medical timeline with confidence?"**

### Real-World Encounter (Timeline-Worthy)
A completed past visit that meets BOTH criteria:
1. ✅ **Specific Date**: YYYY-MM-DD or YYYY-MM format (NOT "recently", "last month", "early 2024")
2. ✅ **Provider OR Facility**: Named provider (Dr. Smith) OR specific facility (City Hospital) OR clinical setting (Emergency Department)

**Examples:**
- ✅ "Admitted to St Vincent's Hospital 2024-03-10" (date + facility)
- ✅ "GP visit with Dr. Jones on 2024-01-15" (date + provider)
- ✅ "Emergency Department attendance, January 2024" (date + clinical setting)
- ❌ "Patient presented to GP last month" (vague date → pseudo-encounter)
- ❌ "Recent hospital admission" (no specific date → pseudo-encounter)

**Encounter Types:** \`inpatient\`, \`outpatient\`, \`emergency_department\`, \`specialist_consultation\`, \`gp_appointment\`, \`telehealth\`

### Planned Encounter (Future Scheduled)
Future appointment or referral with specific date and provider/facility:
- "Referral to cardiologist Dr. Williams, appointment 2024-05-20"
- "Scheduled surgery at City Hospital, 2024-04-15"

**Encounter Types:** \`planned_specialist_consultation\`, \`planned_procedure\`, \`planned_gp_appointment\`
**Set:** \`isRealWorldVisit: false\` (hasn't happened yet)

### Pseudo-Encounter (NOT Timeline-Worthy)
Documents containing clinical info but NOT representing a discrete visit:
- Missing specific date (vague/relative dates)
- Missing provider AND facility
- Administrative documents
- Standalone results/reports

**Examples:**
- Standalone medication list (no date)
- Insurance card
- Lab report (collection date but no visit context)
- Historical mention: "Patient presented to GP last month with chest pain" (insufficient detail - don't create separate encounter)

**Encounter Types:** \`pseudo_medication_list\`, \`pseudo_lab_report\`, \`pseudo_imaging_report\`, \`pseudo_referral_letter\`, \`pseudo_insurance\`, \`pseudo_admin_summary\`, \`pseudo_unverified_visit\`

### Date Precision Requirements
- ✅ **Specific:** "2024-03-15", "March 2024", "15-20 January 2024"
- ❌ **Vague:** "last month", "recently", "early 2024", "a few weeks ago", "Day 2" (relative without anchor)

**If date is vague:** Create pseudo-encounter, leave \`dateRange\` null

### Historical Mentions vs. Encounters
**DO NOT create separate encounters for:**
- Brief mentions: "Patient previously seen by GP for chest pain"
- Embedded references: "Discharge summary notes initial GP visit on 2024-01-10..." (main encounter is discharge, not GP visit)

**ONLY create if:** Full detail provided (date + provider/facility + page range)

## Critical Constraints

### 1. NON-OVERLAPPING PAGE RANGES (PHASE 1 REQUIREMENT)
**Each page MUST belong to exactly ONE encounter**
- If page 3 has content from multiple encounters, choose the DOMINANT encounter for that page
- Example:
  - ✅ Encounter A: pages [1,2,3], Encounter B: pages [4,5,6]
  - ❌ Encounter A: pages [1,2,3], Encounter B: pages [3,4,5] ← INVALID (page 3 overlaps)

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
//# sourceMappingURL=aiPrompts.js.map