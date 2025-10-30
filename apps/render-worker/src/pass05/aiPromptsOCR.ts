/**
 * OCR-Optimized Prompt for Pass 0.5 Encounter Discovery
 *
 * Target: 85-90% accuracy using text patterns only
 * Input: OCR-extracted text (no visual information)
 * Model: GPT-5-mini (text-only)
 *
 * Key Changes from Original:
 * - Removed all visual cues (formatting, letterhead, page breaks)
 * - Focus on text patterns and markers
 * - Header detection in text
 * - Section marker detection
 * - Date clustering analysis
 * - Reduced redundancy (150 lines vs 370)
 */

import { OCRPage } from './types';

export interface PromptInput {
  fullText: string;
  pageCount: number;
  ocrPages: OCRPage[];
}

/**
 * Build OCR-optimized prompt for encounter discovery
 */
export function buildOCROptimizedPrompt(input: PromptInput): string {
  const pageConfidences = input.ocrPages
    .map((p, idx) => `Page ${idx + 1}: ${(p.confidence * 100).toFixed(0)}%`)
    .join(', ');

  return `
# Task: Healthcare Encounter Discovery from OCR Text

You are analyzing OCR-extracted text from a medical document. You CANNOT see formatting, letterheads, or visual layout - only the text content.

## Document Information
- Total pages: ${input.pageCount}
- OCR confidence: ${pageConfidences}

## STEP 1: Document Unity Detection (Text Patterns Only)

### Single Unified Document - Text Indicators:
- First line or header contains: "Patient Health Summary", "GP Summary", "My Health Record", "Medical Summary", "Health Summary"
- Text follows "Section Label: items" pattern (e.g., "Current Medications:", "Allergies:", "Immunisations:")
- Multiple sections present but NO distinct document headers between them
- Facility name appears in header/footer text but doesn't change
- No date for the document itself (only item dates within sections)

**Action:** Create ONE encounter (type: \`pseudo_admin_summary\`)

### Multiple Distinct Documents - Text Indicators:
- Different document headers appear in sequence (e.g., "Discharge Summary" followed by "Pathology Report")
- Facility names change between sections
- Provider names change AND different dates present
- Document-level dates present (not just item dates)
- Clear textual breaks like "--- END OF DOCUMENT ---" or repeated facility headers

**Action:** Create SEPARATE encounters for each distinct document

## STEP 2: Encounter Classification Rules

### Real-World Visit (Timeline-Worthy)
Must have BOTH in the text:
1. **Specific date**: YYYY-MM-DD or YYYY-MM format (e.g., "2024-03-15", "March 2024")
2. **Provider OR Facility**: Named provider (e.g., "Dr Smith") OR specific facility (e.g., "City Hospital")

**Types:** \`inpatient\`, \`outpatient\`, \`emergency_department\`, \`specialist_consultation\`, \`gp_appointment\`, \`telehealth\`

### Planned Encounter (Future)
- Text indicates future appointment: "Scheduled for...", "Appointment on..."
- Has date AND provider/facility

**Types:** \`planned_specialist_consultation\`, \`planned_procedure\`, \`planned_gp_appointment\`

### Pseudo-Encounter (Administrative Documents)
- Missing specific date OR missing provider/facility
- Administrative summaries
- Standalone lists or records

**Types:** \`pseudo_admin_summary\`, \`pseudo_medication_list\`, \`pseudo_lab_report\`, \`pseudo_imaging_report\`

## STEP 3: Pseudo-Encounter Specific Rules

### Use \`pseudo_admin_summary\` when:
- Header text: "Patient Health Summary", "GP Summary", "My Health Record", "Health Summary"
- Contains multiple sections: "Medications:", "Allergies:", "Immunisations:", "Past History:"
- Even if sections list individual items with dates → still ONE summary encounter

### Use \`pseudo_medication_list\` when:
- Standalone medication sheet (NOT part of larger summary)
- Text focused only on medications

### Use \`pseudo_lab_report\` ONLY when ALL present:
1. **Lab header text:** Contains "Pathology", "Laboratory", "Lab Report", "Test Results"
2. **Actual test values:** Multiple analytes with units (e.g., "Hb 135 g/L", "WBC 6.5 x10^9/L", "Na 140 mmol/L")
3. **Reference ranges:** Text like "Normal: 135-145", "Reference Interval: 11-16 g/dL"

**DO NOT use for:**
- Immunization records (dates + vaccine names like "11/04/2010 Fluvax (Influenza)")
- Medication lists
- Vital signs
- Test results mentioned within larger documents

### Immunization Records - CRITICAL
**These are NOT lab reports** - they are vaccination/procedure records
- Look for: "Immunisation", "Vaccination", "Vaccine", names like "Fluvax", "Vivaxim"
- Format: Date + vaccine name (e.g., "11/04/2010 Fluvax (Influenza)")
- If part of health summary → include in \`pseudo_admin_summary\`
- If standalone → still \`pseudo_admin_summary\` (administrative record)

## STEP 4: Critical Constraints

### Non-Overlapping Page Ranges
Each page must belong to exactly ONE encounter:
- VALID: Encounter A pages [1,2,3], Encounter B pages [4,5,6]
- INVALID: Encounter A pages [1,2,3], Encounter B pages [3,4,5] (page 3 overlaps)

### Decision Hierarchy
When uncertain:
1. Default to document text boundaries (header changes in text)
2. Preserve multi-document capability (can detect multiple documents)
3. Avoid over-segmentation (don't split unified summaries)
4. Lower confidence (0.70-0.85) when uncertain

## Output Format

Return JSON with this structure. Examples show common scenarios:

**Example 1: Single Admin Summary (MOST COMMON)**
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
      "extractedText": "Patient Health Summary - Current Medications: Metformin..."
    }
  ]
}
\`\`\`

**Example 2: Single Real Visit (COMMON)**
\`\`\`json
{
  "encounters": [
    {
      "encounterType": "outpatient",
      "isRealWorldVisit": true,
      "dateRange": {"start": "2024-03-15"},
      "provider": "Dr Jane Smith",
      "facility": "City Medical Centre",
      "pageRanges": [[1, 3]],
      "confidence": 0.92,
      "extractedText": "Outpatient consultation - Follow-up for hypertension..."
    }
  ]
}
\`\`\`

**Example 3: Multiple Documents (LESS COMMON)**
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
      "extractedText": "PATHOLOGY REPORT - FBC: Hb 145 g/L (135-175)..."
    }
  ]
}
\`\`\`

**Page Range Format:**
- Single page: [[1, 1]] NOT [[1]] or [[1, null]]
- Multiple pages: [[1, 5]]
- Non-contiguous: [[1, 3], [7, 8]]

## Important Notes
- Focus on TEXT patterns only (no visual cues available)
- Header detection from text content
- Section markers indicate unified documents
- Immunizations are NOT lab reports
- When uncertain, prefer fewer encounters
- Confidence reflects certainty in detection (not OCR quality)

## Document Text (OCR Output)

${input.fullText}

## Your Response (JSON only)
`.trim();
}
