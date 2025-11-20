/**
 * AI Prompt Design for Pass 0.5
 * Healthcare Encounter Discovery
 *
 * VERSION HISTORY:
 * v1 (original) - Backed up as aiPrompts.v1.ts
 * v2.0 (Nov 2, 2025 10:20 AM) - Added Scenario D: Metadata Page Recognition (INITIAL)
 *    - Fixes Test 06 boundary detection issue (detected 11/12, should be 13/14)
 *    - Added weighted boundary signal priority
 *    - Added guidance: metadata pages belong to PRECEDING document
 *    - ISSUE: Too specific to Test 06 structure, assumed metadata always at end
 * v2.1 (Nov 2, 2025 10:30 AM) - Made metadata guidance GENERAL and context-based
 *    - Changed from position-based ("PRECEDING") to context-based (provider continuity)
 *    - Added Pattern A/B/C examples covering metadata at start/end/middle
 *    - Key principle: Use provider/facility matching, not page position
 *    - Handles metadata as cover pages, signature blocks, or between sections
 * v2.2 (Nov 2, 2025 11:00 PM) - Document Header vs Metadata distinction
 *    - Added critical distinction: "Encounter Summary" headers are STARTERS, not metadata
 *    - Generation dates (report printed) vs Encounter dates (clinical visit)
 *    - Prevents mistaking new encounter documents for metadata pages
 *    - Pattern D example: Don't confuse close generation dates with same encounter
 * v2.3 (Nov 3, 2025) - Page-by-Page Assignment with Justifications
 *    - Forces explicit page-to-encounter assignment for all pages
 *    - Requires brief justification (15-20 words) for each page assignment
 *    - Exposes contradictions at boundary pages through required reasoning
 *    - Addresses Test 06 failure: model ignored boundary signals in v2.2
 *    - Chain-of-thought approach to improve instruction compliance
 * v2.4 (Nov 4, 2025) - Lab Report Date Extraction Fix (Migration 38 follow-up)
 *    - CRITICAL FIX: Lab reports with specific dates now apply Timeline Test
 *    - Lab report with date + facility → real-world encounter (timeline-worthy)
 *    - Lab report without date → pseudo_lab_report (not timeline-worthy)
 *    - Resolves PASS05-001: Lab test dates now populate encounter_date field
 *    - Updated pseudo_lab_report classification to exclude dated reports
 *    - Same fix applied to imaging reports
 *    - Updated Example 3 to show dated lab report as timeline-worthy encounter
 */

import { OCRPage } from '../../types';

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
    .map((p, idx) => `Page ${idx + 1}: ${((p.confidence || 0) * 100).toFixed(0)}%`)
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

### Scenario D: Documents with Administrative Metadata Pages (CRITICAL)
**Problem:** Medical documents often contain metadata pages (signatures, document IDs, patient info tables) that LOOK like document separators but may actually be part of an adjacent clinical document.

**Metadata Page Indicators:**
- Electronic signature blocks: "Electronically signed by [Name] on [Date]"
- Document generation timestamps: "Generated for Printing/Faxing/eTransmitting on: [Date]"
- Patient information tables (Document ID, Patient-ID, Version, Set-ID)
- Custodian/Author/Legal Authenticator information blocks
- Document metadata tables with IDs and version numbers
- "Created On", "Authored On", "Confirmatory sign off" sections
- Cover pages with document metadata but no clinical content

### CRITICAL: Document Header Pages vs Administrative Metadata Pages

**Document Header/Title Pages (Strong Encounter Boundary Signal):**
- Headers containing: "Encounter Summary", "Clinical Summary", "Visit Summary", "Patient Visit"
- Often include document generation metadata: "Generated for Printing on [Date]", "Created on [Date]"
- These mark the START of a NEW encounter, NOT metadata for a previous one

**Critical Distinction:**
- **Generation/Created Date** (in header): When the report was printed/generated (metadata)
- **Encounter Date** (in body text): When the clinical visit actually occurred (clinical data)
- Example: "Encounter Summary (Created Oct 30)" with "Visit Date: June 22" → encounter date is June 22, not Oct 30

**RULE:** Document title pages with "Encounter/Clinical/Visit Summary" are encounter STARTERS, not metadata pages for previous encounters. Don't be misled by generation dates that are close to previous encounter dates.

**CRITICAL RULE - Use Context, Not Position:**
Metadata should be grouped with the clinical content it DESCRIBES, based on matching provider/facility names.

**How to Determine Which Document Metadata Belongs To:**

1. **Check Provider/Facility References in Metadata:**
   - If metadata mentions "Dr. Smith" → belongs with Dr. Smith's clinical content
   - If metadata shows "Hospital A" → belongs with Hospital A's clinical content
   - If metadata has signatures from "Dr. Smith" → part of Dr. Smith's document

2. **Metadata Position Analysis:**
   - **At document start (pages 1-2):** Usually a cover page/header for FOLLOWING content
   - **At document end (last 1-3 pages):** Usually signature block/closeout for PRECEDING content
   - **Between clinical sections:** Check provider names to determine grouping

3. **When Uncertain:**
   - Group metadata with the clinical content that shares the SAME provider/facility
   - If no clear match, metadata might be a standalone administrative page
   - Lower confidence score (0.75-0.85) when grouping is ambiguous

**Boundary Detection Priority (Strongest → Weakest):**
1. **New "Encounter Summary" / "Clinical Summary" / "Visit Summary" document header** = VERY STRONG SIGNAL (98% confidence boundary)
2. **Provider name change** (Dr. Smith → Dr. Jones) = VERY STRONG SIGNAL (95% confidence boundary)
3. **New document header with date/time** = VERY STRONG SIGNAL
4. **Facility name change** = STRONG SIGNAL
5. **Patient name change** = STRONG SIGNAL (may indicate different source systems)
6. **Author system change** (eClinicalWorks → Epic) = MODERATE SIGNAL
7. **Date discontinuity** (March → June) = MODERATE SIGNAL
8. **Content type change** (Clinical → Metadata) = WEAK SIGNAL (metadata often part of same document)
9. **Formatting change alone** = VERY WEAK SIGNAL

**Common Patterns and Solutions:**

**Pattern A: Metadata at End (Most Common)**

Pages 1-10: Clinical content (Dr. Smith, Hospital A)
Pages 11-12: Metadata (Dr. Smith signature, document IDs)
Page 13: New clinical header (Dr. Jones, Hospital B)
RESULT: Group pages 11-12 with pages 1-10 (same provider)
BOUNDARY: Page 12/13 (provider change)

**Pattern B: Metadata at Start**

Pages 1-2: Cover page with document metadata (Hospital A)
Pages 3-10: Clinical content (Dr. Smith, Hospital A)
RESULT: Group pages 1-2 with pages 3-10 (same facility)
BOUNDARY: No boundary until different provider/facility appears

**Pattern C: Multiple Documents with Metadata**

Pages 1-5: Clinical (Dr. Smith)
Pages 6-7: Metadata (Dr. Smith signature)
Pages 8-9: Metadata/cover (Dr. Jones, Hospital B)
Pages 10-15: Clinical (Dr. Jones, Hospital B)
RESULT: Boundary at page 7/8 (provider change in metadata signals new document)

**Pattern D: Document Header Page Confusion**

Page 13: Clinical content ending (Dr. Smith, signed October 27)
Page 14: "Encounter Summary (Generated October 30)" + "Encounter Date: June 22" (Dr. Jones)
RESULT: Page 14 is START of NEW encounter (Dr. Jones, June 22), NOT metadata for page 13
BOUNDARY: Page 13/14 (new document header + provider change)
KEY: Don't be misled by generation date (Oct 30) being close to previous encounter (Oct 27). The actual encounter date (June 22) and provider change confirm this is a separate encounter.

**Key Principle:**
Content type changes (clinical ↔ metadata) are WEAK signals. Provider/facility changes are STRONG signals. Use provider continuity to determine document boundaries, regardless of whether metadata appears before, after, or between clinical content.

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
- "Admitted to St Vincent's Hospital 2024-03-10" (date + facility) - timeline-worthy
- "GP visit with Dr. Jones on 2024-01-15" (date + provider) - timeline-worthy
- "Emergency Department attendance, January 2024" (date + clinical setting) - timeline-worthy
- "Pathology report collected 03-Jul-2025 at NSW Health Pathology" (date + facility) - timeline-worthy
- "Imaging study dated 15-Mar-2024 from City Radiology" (date + facility) - timeline-worthy
- "Patient presented to GP last month" (vague date) - pseudo-encounter
- "Recent hospital admission" (no specific date) - pseudo-encounter
- "Lab report with no collection date" (no date) - pseudo-encounter

**Encounter Types:** \`inpatient\`, \`outpatient\`, \`emergency_department\`, \`specialist_consultation\`, \`gp_appointment\`, \`telehealth\`

**NOTE:** Lab reports and imaging reports with specific dates qualify as timeline-worthy encounters (usually \`outpatient\` type).

### Planned Encounter (Future Scheduled)
Future appointment or referral with specific date and provider/facility:
- "Referral to cardiologist Dr. Williams, appointment 2024-05-20"
- "Scheduled surgery at City Hospital, 2024-04-15"

**Encounter Types:** \`planned_specialist_consultation\`, \`planned_procedure\`, \`planned_gp_appointment\`
**Set:** \`isRealWorldVisit: false\` (hasn't happened yet)

### Pseudo-Encounter (NOT Timeline-Worthy)
Documents containing clinical info but NOT representing a discrete visit.

**CRITICAL DISTINCTION - Lab Reports and Imaging:**
Lab reports and imaging reports with **specific dates + facility** ARE timeline-worthy:
- "Pathology report collected 03-Jul-2025 at NSW Health Pathology" → **Real-world encounter** (apply Timeline Test)
- "Imaging report dated 15-Mar-2024 from City Radiology" → **Real-world encounter** (apply Timeline Test)
- Lab/imaging report with vague/no date → Pseudo-encounter

**When to use pseudo-encounters:**
- Administrative summaries (health summaries, GP summaries)
- Insurance/Medicare cards
- Standalone medication lists (no specific visit context)
- Referral letters (the letter itself, not the visit it refers to)
- Lab reports **without specific collection dates**
- Imaging reports **without specific dates**

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

4. **Does NOT have specific collection date:**
   - If lab report has specific date (YYYY-MM-DD) + facility → apply Timeline Test (likely real-world encounter)
   - If lab report lacks collection date or has vague date → \`pseudo_lab_report\`

**DO NOT use \`pseudo_lab_report\` for:**
- Lab reports with specific collection dates and facility (use Timeline Test instead - likely outpatient or diagnostic encounter type)
- Immunization/vaccination records (these are procedures, not lab tests)
- Medication lists
- Vital signs within consultation notes
- Test results mentioned in a larger summary document

**Use \`pseudo_imaging_report\` ONLY for:**
- Radiology reports WITHOUT specific dates: X-ray, CT, MRI, ultrasound interpretations with radiologist findings
- Must have imaging interpretation/findings (not just order or mention)
- If imaging report has specific date + facility → apply Timeline Test (likely real-world encounter)
- NOT procedure notes that mention imaging

### Date Precision Requirements
- VALID **Specific:** "2024-03-15", "March 2024", "15-20 January 2024"
- INVALID **Vague:** "last month", "recently", "early 2024", "a few weeks ago", "Day 2" (relative without anchor)

**If date is vague:** Create pseudo-encounter, leave \`dateRange\` null

### Date Range: Start vs End Dates (Migration 38)
**When to populate dateRange.end:**

**Single-day encounters (MOST COMMON):**
- GP visit: {"start": "2024-03-15"} (no end date)
- Emergency Department: {"start": "2024-01-20"} (no end date)
- Outpatient consultation: {"start": "2024-02-10"} (no end date)

**Multi-day encounters (USE END DATE):**
- Hospital admission: {"start": "2024-03-10", "end": "2024-03-15"} (admission → discharge)
- Inpatient stay: {"start": "2024-06-01", "end": "2024-06-05"}

**Planned future encounters:**
- Scheduled appointment: {"start": "2024-05-20"} (no end date yet)
- Planned surgery: {"start": "2024-04-15"} (no end date until completed)

**RULE:** Only populate \`end\` date when document explicitly shows both admission AND discharge dates. For single-day visits or future appointments, use \`start\` only.

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

### 2. Confidence Scoring (Migration 38 - Updated Guidelines)
Your \`confidence\` should reflect certainty in encounter identification and boundaries:

**VERY HIGH (0.95-1.00): Crystal clear identification**
- Specific date (YYYY-MM-DD format)
- Clear provider AND facility names
- Distinct document boundaries (headers, letterhead changes)
- No ambiguity in page assignment
- Examples: Hospital discharge summary with all details, dated consultation note

**HIGH (0.85-0.94): Mostly clear with minor gaps**
- Specific date OR month/year
- Provider OR facility (one may be missing)
- Clear document structure but some missing details
- Examples: Dated clinic visit without facility name, consultation with provider but vague date precision

**MEDIUM (0.70-0.84): Some uncertainty**
- Vague date (e.g., "March 2024" without day) OR missing date
- Unclear provider/facility information
- Some ambiguity in page boundaries
- Examples: Admin summary with partial information, pseudo-encounter with limited metadata

**LOW (0.50-0.69): Significant uncertainty**
- Very vague or no date
- Missing provider AND facility
- Unclear document boundaries
- Examples: Metadata pages with minimal context, fragmented documents

**CRITICAL: Below 0.50 indicates you should reconsider the encounter classification**

### 3. Summary Generation (Migration 38 - REQUIRED for all encounters)

Every encounter MUST include a plain English summary (1-2 sentences) that helps users understand what the encounter was about.

**Summary Guidelines:**

**For Real-World Visits:**
- Include: type of visit, provider/facility, date, and main reason/outcome
- Examples:
  - "Hospital admission for appendectomy with Dr Sarah Chen at City Hospital from June 10-15, 2024, with successful surgery and recovery."
  - "Annual GP checkup with Dr James Wilson on March 5, 2024, including blood pressure check and medication review."
  - "Emergency Department visit for chest pain at St Vincent's on January 20, 2024, ruled out cardiac event, diagnosed anxiety."

**For Pseudo-Encounters (Admin Summaries):**
- Describe what type of information is contained
- Examples:
  - "Comprehensive health summary including current medications, immunization history, and past medical conditions."
  - "Medication list showing five active prescriptions for diabetes, hypertension, and cholesterol management."
  - "Full blood count pathology report showing hemoglobin, white blood cell count, and platelet results."

**For Planned Encounters:**
- Include: type of appointment, provider, date scheduled
- Example: "Scheduled cardiology consultation with Dr Lisa Brown on May 15, 2024, for follow-up of recent ECG findings."

**Summary Quality Requirements:**
- **Content-aware**: Reflect actual encounter content, not generic descriptions
- **Concise**: 1-2 sentences maximum (15-30 words ideal)
- **Patient-friendly**: Use plain English, avoid excessive medical jargon
- **Informative**: User should understand the visit purpose/outcome from summary alone
- **NO speculation**: Only include information explicitly stated in document

## CRITICAL: Page-by-Page Assignment Process (v2.3)

**IMPORTANT: You MUST assign EVERY page explicitly to an encounter and provide a brief justification.**

This requirement ensures you consciously evaluate each page assignment decision, especially at encounter boundaries.

### Assignment Rules

1. **For each page** (page 1 through page ${input.pageCount}):
   - Assign it to an encounter using encounter_id
   - Provide a brief justification (15-20 words maximum)

2. **Use consistent encounter IDs** across page_assignments and encounters arrays
   - Example: "enc-1", "enc-2", "enc-3"
   - IDs must match between page_assignments and encounters

3. **Justification Guidelines:**

   **For continuation pages (same encounter):**
   - "Continuation of [document type], same provider and facility"
   - "Middle section of [encounter type], consistent formatting"
   - "Part of same clinical note, no boundary signals"

   **For boundary pages (new encounter starting):**
   - "NEW Encounter Summary header, signals new document starting"
   - "Provider change from [Name A] to [Name B], new encounter"
   - "Facility change from [Facility X] to [Facility Y]"
   - "Different encounter date [Date1] vs previous [Date2]"
   - "New document header with different letterhead/format"

   **For metadata/administrative pages:**
   - "Signature block for [provider name] encounter"
   - "Document metadata/contact details for preceding encounter"
   - "Administrative cover page for [encounter type]"

### Critical Decision Points

**When you encounter a page that could belong to either of two encounters:**
- Ask yourself: "What are the boundary signals on this page?"
- Check for: Encounter Summary headers, provider changes, facility changes, date changes
- **Document headers ALWAYS signal new encounters** (even if dates are close)
- Write your reasoning in the justification

**Example critical page (like Test 06 page 14):**
- If you see "Encounter Summary" header: "NEW Encounter Summary header, different provider and facility"
- NOT: "Signature page for previous encounter" (wrong if Encounter Summary header present)

### Why This Matters

This process prevents errors like:
- Assigning page 14 to encounter 1 when it has "Encounter Summary" header for encounter 2
- Ignoring provider/facility changes at page boundaries
- Being misled by temporal proximity of dates

**Your justifications will be reviewed to understand your reasoning.**

## Instructions

1. **Read the entire document** (all ${input.pageCount} pages)
2. **Apply Timeline Test** to each potential encounter
3. **Assign EACH page to an encounter with justification** (page-by-page process above)
4. **Ensure non-overlapping page ranges**
5. **For each encounter, extract:**
   - \`encounter_id\`: Unique ID (e.g., "enc-1", "enc-2")
   - Type (from lists above)
   - \`isRealWorldVisit\`: true (past completed), false (planned future OR pseudo)
   - Date range (null if vague date)
   - Provider name (null if not mentioned)
   - Facility name (null if not mentioned)
   - Page ranges (non-overlapping, can be non-contiguous like [[1,3],[7,8]])
   - Confidence (0.0-1.0)
   - \`summary\`: Plain English description of encounter (1-2 sentences, content-aware) **REQUIRED - Migration 38**

6. **Return JSON** with TWO sections:
   - \`page_assignments\`: Array of page assignments with justifications
   - \`encounters\`: Array of encounter details

Examples below show the new format:

**Example 1: Single Administrative Summary (MOST COMMON)**
\`\`\`json
{
  "page_assignments": [
    {
      "page": 1,
      "encounter_id": "enc-1",
      "justification": "Single-page Patient Health Summary document from South Coast Medical"
    }
  ],
  "encounters": [
    {
      "encounter_id": "enc-1",
      "encounterType": "pseudo_admin_summary",
      "isRealWorldVisit": false,
      "dateRange": null,
      "provider": null,
      "facility": "South Coast Medical",
      "pageRanges": [[1, 1]],
      "confidence": 0.95,
      "summary": "Comprehensive health summary for Xavier Flanagan including current medications, immunization history, and past medical conditions from South Coast Medical.",
      "extractedText": "Patient Health Summary - Xavier Flanagan DOB: 25/04/1994 Current Medications: Metformin 500mg..."
    }
  ]
}
\`\`\`

**Example 2: Single Real-World Clinical Visit (COMMON)**
\`\`\`json
{
  "page_assignments": [
    {"page": 1, "encounter_id": "enc-1", "justification": "Discharge summary header, admission date March 10, Dr Jane Smith"},
    {"page": 2, "encounter_id": "enc-1", "justification": "Continuation of discharge summary, same provider and facility"},
    {"page": 3, "encounter_id": "enc-1", "justification": "Procedure details section, part of same discharge document"},
    {"page": 4, "encounter_id": "enc-1", "justification": "Medications and follow-up plan, same discharge summary"},
    {"page": 5, "encounter_id": "enc-1", "justification": "Final page with signature, Dr Jane Smith closeout"}
  ],
  "encounters": [
    {
      "encounter_id": "enc-1",
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
      "summary": "Hospital admission for laparoscopic cholecystectomy with Dr Jane Smith at St Vincent's Hospital from March 10-15, 2024, with successful surgery and recovery.",
      "extractedText": "Discharge Summary - Admission for cholecystectomy..."
    }
  ]
}
\`\`\`

**Example 3: Multiple Distinct Documents (LESS COMMON but system MUST support)**
\`\`\`json
{
  "page_assignments": [
    {"page": 1, "encounter_id": "enc-1", "justification": "Discharge summary header, City Hospital, Dr Smith, March 10-15"},
    {"page": 2, "encounter_id": "enc-1", "justification": "Continuation of discharge, same provider and facility"},
    {"page": 3, "encounter_id": "enc-1", "justification": "Discharge signature page, Dr Smith closeout"},
    {"page": 4, "encounter_id": "enc-2", "justification": "NEW document: Pathology header dated March 18, PathLab Services, different format"},
    {"page": 5, "encounter_id": "enc-2", "justification": "Continuation of pathology results with collection date, same lab facility"},
    {"page": 6, "encounter_id": "enc-3", "justification": "NEW Consultation header, Medical Centre, Dr Jones, March 20"},
    {"page": 7, "encounter_id": "enc-3", "justification": "Continuation of outpatient consultation, same provider"},
    {"page": 8, "encounter_id": "enc-3", "justification": "Final page of consultation with Dr Jones signature"}
  ],
  "encounters": [
    {
      "encounter_id": "enc-1",
      "encounterType": "discharge_summary",
      "isRealWorldVisit": true,
      "dateRange": {"start": "2024-03-10", "end": "2024-03-15"},
      "provider": "Dr Smith",
      "facility": "City Hospital",
      "pageRanges": [[1, 3]],
      "confidence": 0.92,
      "summary": "Surgical admission to City Hospital with Dr Smith from March 10-15, 2024, for planned procedure with successful outcome.",
      "extractedText": "Discharge Summary - Surgical admission..."
    },
    {
      "encounter_id": "enc-2",
      "encounterType": "outpatient",
      "isRealWorldVisit": true,
      "dateRange": {"start": "2024-03-18"},
      "provider": null,
      "facility": "PathLab Services",
      "pageRanges": [[4, 5]],
      "confidence": 0.88,
      "summary": "Full blood count pathology report collected March 18, 2024 at PathLab Services showing hemoglobin, white blood cell count, and other hematology results.",
      "extractedText": "PATHOLOGY REPORT - Collection Date: March 18, 2024 - FBC: Hb 145 g/L (135-175), WBC 7.2 x10^9/L..."
    },
    {
      "encounter_id": "enc-3",
      "encounterType": "outpatient",
      "isRealWorldVisit": true,
      "dateRange": {"start": "2024-03-20"},
      "provider": "Dr Jones",
      "facility": "Medical Centre",
      "pageRanges": [[6, 8]],
      "confidence": 0.90,
      "summary": "Post-surgical follow-up consultation with Dr Jones at Medical Centre on March 20, 2024, to review recovery progress.",
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

- **page_assignments is MANDATORY**: You must assign ALL ${input.pageCount} pages explicitly
- **Justifications are MANDATORY**: Every page assignment needs a brief justification (15-20 words)
- **encounter_id consistency**: Same IDs must appear in both page_assignments and encounters arrays
- If multiple pages discuss the same encounter, use page ranges: [[1,5], [10,12]]
- For pseudo-encounters **without specific dates**, leave dateRange as null (but populate provider/facility if present)
- For encounters with specific dates, ALWAYS populate dateRange and date_source (even if pseudo-encounter type)
- If no encounters found, return empty arrays: {"page_assignments": [], "encounters": []}
- Confidence should reflect certainty in encounter identification (not OCR quality)
- extractedText should be first 100 characters of encounter content (for debugging)

## Document Text (OCR Output)

${input.fullText}

## Your Response (JSON only)
`.trim();
}
