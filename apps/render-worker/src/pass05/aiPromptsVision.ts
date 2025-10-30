/**
 * Vision-Optimized Prompt for Pass 0.5 Encounter Discovery
 *
 * Target: 95%+ accuracy using visual document understanding
 * Input: Raw medical document images
 * Model: GPT-5-mini vision (vision-capable)
 *
 * Key Changes from Original:
 * - Leverages visual understanding (letterheads, formatting, layout)
 * - Document boundary detection via visual cues
 * - Table and structure detection
 * - Page break and formatting change detection
 * - ~200 lines (focused on visual analysis)
 */

export interface VisionPromptInput {
  pageCount: number;
  // Images will be passed separately in the API call
}

/**
 * Build vision-optimized prompt for encounter discovery
 */
export function buildVisionPrompt(input: VisionPromptInput): string {
  return `
# Task: Healthcare Encounter Discovery from Medical Images

You are viewing medical document images directly. Use visual cues to identify document structure and healthcare encounters.

## Document Information
- Total pages: ${input.pageCount}
- You CAN see: formatting, letterheads, layout, page breaks, visual structure

## STEP 1: Visual Document Boundary Detection

### Single Unified Document - Visual Indicators:
- **Consistent letterhead** across all pages (same logo, facility name, design)
- **Same formatting style** throughout (fonts, colors, layout)
- **Continuous page numbers** (Page 1 of 3, Page 2 of 3, Page 3 of 3)
- **No visual breaks** between pages (seamless continuation)
- **Sectioned layout** with boxes or dividers (Medications, Allergies, Immunizations sections)
- **Header indicates summary**: Large text "Patient Health Summary", "GP Summary", "My Health Record"

**Action:** Create ONE encounter (type: \`pseudo_admin_summary\`)

**Visual Example:**
- Page 1: "South Coast Medical" letterhead, "Patient Health Summary" header, patient details + medications section
- Same document, unified appearance → ONE admin summary encounter

### Multiple Distinct Documents - Visual Indicators:
- **Letterhead changes** between pages (different logos, facilities)
- **Different formatting styles** (different fonts, layouts, colors)
- **Visual page breaks** (white space, clear start of new document)
- **Different paper backgrounds** or document templates
- **Document headers change** ("Discharge Summary" on pages 1-3, "Pathology Report" on pages 4-5)

**Action:** Create SEPARATE encounters for each visually distinct document

**Visual Example:**
- Pages 1-3: Hospital letterhead "City Hospital", formatted as discharge summary
- Pages 4-5: PathLab letterhead, formatted as lab results table
- Different visual appearance → TWO separate encounters

### Mixed Content (Main Document + Attachments):
- Main document with clearly attached reports
- Example: Discharge summary (pages 1-5) with attached lab report (pages 6-7)
- Different visual styles but related content

**Action:** Create separate encounters but note potential relationship

## STEP 2: Visual Encounter Classification

### Administrative Summaries (Visual Cues):
- **Large header text**: "Patient Health Summary", "GP Summary", "Health Summary"
- **Sectioned boxes or dividers**: Medications box, Allergies box, Immunizations box
- **Patient details block** at top (name, DOB, address in formatted box)
- **Multiple labeled sections** with consistent visual styling
- **List format** within sections (bullet points, numbered lists)

**Type:** \`pseudo_admin_summary\`

### Lab Reports (Visual Cues):
- **Pathology letterhead**: "PathLab", "Laboratory Services", medical lab logo
- **Structured table layout**: Columns for Test, Result, Reference Range, Units
- **Test values visible in table cells**: "Hb 145 g/L", "WBC 6.5"
- **Reference ranges in adjacent columns**: "(135-175)", "Normal: 4.0-11.0"
- **Table borders or grid lines** separating results

**Type:** \`pseudo_lab_report\`

**NOT lab reports:**
- Immunization lists (even if in table format)
- Vital signs in consultation notes
- Medication lists

### Discharge Summaries (Visual Cues):
- **Hospital letterhead** (facility logo, hospital name)
- **Date range in header**: "Admission: 2024-03-10" and "Discharge: 2024-03-15"
- **Narrative paragraph format** (not tables or lists)
- **Sections**: Admission Details, Hospital Course, Medications, Discharge Plan
- **Signature block** at bottom

**Type:** \`inpatient\` or \`outpatient\` (based on content)

### Immunization Records (Visual Cues):
- **Immunization table or list** with columns: Date, Vaccine, Batch Number
- **Vaccine names visible**: "Fluvax", "Vivaxim", "Dukoral"
- **Date + vaccine name pattern**: "11/04/2010 Fluvax (Influenza)"

**CRITICAL:** These are NOT lab reports (they're vaccination records)
- If part of health summary → include in \`pseudo_admin_summary\`
- If standalone certificate → \`pseudo_admin_summary\` (administrative)

## STEP 3: Encounter Classification Rules

### Real-World Visit (Timeline-Worthy)
Must visually identify BOTH:
1. **Specific date**: Clearly visible date in YYYY-MM-DD or YYYY-MM format
2. **Provider OR Facility**: Named provider or facility visible in document

**Types:** \`inpatient\`, \`outpatient\`, \`emergency_department\`, \`specialist_consultation\`, \`gp_appointment\`, \`telehealth\`

### Planned Encounter (Future)
- Text indicates future appointment
- Has visible date AND provider/facility

**Types:** \`planned_specialist_consultation\`, \`planned_procedure\`, \`planned_gp_appointment\`

### Pseudo-Encounter (Administrative)
- Missing specific date OR missing provider/facility
- Administrative documents
- Standalone lists or records

**Types:** \`pseudo_admin_summary\`, \`pseudo_medication_list\`, \`pseudo_lab_report\`, \`pseudo_imaging_report\`

## STEP 4: Visual Analysis Checklist

For each page, observe:
1. **Letterhead/Header**: What facility? Any logo? Header text?
2. **Page layout**: Sections? Boxes? Tables? Narrative paragraphs?
3. **Formatting continuity**: Same as previous page or different?
4. **Page numbers**: Continuous or starting over?
5. **Visual breaks**: Clear start of new document?
6. **Content type**: Summary sections? Test results table? Clinical narrative?

## STEP 5: Critical Constraints

### Non-Overlapping Page Ranges
Each page belongs to exactly ONE encounter:
- VALID: Encounter A pages [1,2,3], Encounter B pages [4,5,6]
- INVALID: Encounter A pages [1,2,3], Encounter B pages [3,4,5] (overlap)

### Decision Hierarchy
1. Use visual document boundaries (letterhead changes, formatting shifts)
2. Preserve multi-document capability (detect jumbled uploads)
3. Avoid over-segmentation (don't split unified documents)
4. Lower confidence when visual boundaries are unclear

## Output Format

Return JSON with this structure:

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
      "extractedText": "Patient Health Summary - Medications, Immunizations, History sections visible"
    }
  ]
}
\`\`\`

**Example 2: Single Clinical Visit (COMMON)**
\`\`\`json
{
  "encounters": [
    {
      "encounterType": "discharge_summary",
      "isRealWorldVisit": true,
      "dateRange": {"start": "2024-03-10", "end": "2024-03-15"},
      "provider": "Dr Jane Smith",
      "facility": "St Vincent's Hospital",
      "pageRanges": [[1, 5]],
      "confidence": 0.95,
      "extractedText": "Hospital discharge summary - surgical admission"
    }
  ]
}
\`\`\`

**Example 3: Multiple Distinct Documents (LESS COMMON)**
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
      "extractedText": "Hospital letterhead, narrative format, discharge details"
    },
    {
      "encounterType": "pseudo_lab_report",
      "isRealWorldVisit": false,
      "dateRange": null,
      "provider": null,
      "facility": "PathLab Services",
      "pageRanges": [[4, 5]],
      "confidence": 0.88,
      "extractedText": "PathLab letterhead, table format, FBC results with reference ranges"
    },
    {
      "encounterType": "outpatient",
      "isRealWorldVisit": true,
      "dateRange": {"start": "2024-03-20"},
      "provider": "Dr Jones",
      "facility": "Medical Centre",
      "pageRanges": [[6, 8]],
      "confidence": 0.90,
      "extractedText": "Outpatient consultation - follow-up visit"
    }
  ]
}
\`\`\`

**Page Range Format:**
- Single page: [[1, 1]]
- Multiple pages: [[1, 5]]
- Non-contiguous: [[1, 3], [7, 8]]

## Important Visual Analysis Notes

1. **Letterhead is key**: Different letterheads = different source documents
2. **Formatting changes**: Major style shifts = potential document boundary
3. **Page numbers**: "Page 1 of 3" followed by "Page 1 of 2" = two documents
4. **Table structure**: Lab reports have clear table layouts with columns
5. **Section boxes**: Admin summaries often use boxed sections
6. **Continuous flow**: Same formatting throughout = unified document

## Critical Reminders

- Immunization records are NOT lab reports (even if in table format)
- Admin summaries with sections = ONE encounter (don't split)
- Use visual cues to detect boundaries
- Confidence reflects certainty in visual boundary detection
- When uncertain, prefer fewer encounters

## Your Response (JSON only)
`.trim();
}
