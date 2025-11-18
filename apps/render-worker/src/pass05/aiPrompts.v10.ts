/**
 * Pass 0.5 Encounter Discovery - Universal v10 Prompt
 *
 * ARCHITECTURE DECISION (2025-11-12):
 * This is a UNIVERSAL prompt that works for ALL file sizes.
 * - Small files (<100 pages): Process as single chunk, ignore progressive fields
 * - Large files (≥100 pages): Process in 50-page chunks with handoff
 *
 * The prompt natively includes progressive fields (status, tempId, expectedContinuation)
 * which are simply ignored for single-chunk processing.
 *
 * This replaces the failed v2.9 + addons approach where the addon instructions
 * conflicted with and tried to override the base prompt.
 */

import { OCRPage } from './types';

export interface V10PromptConfig {
  fullText: string;
  pageCount: number;
  ocrPages: OCRPage[];

  // Progressive mode parameters (optional, for multi-chunk files)
  progressive?: {
    chunkNumber: number;
    totalChunks: number;
    pageRange: [number, number]; // 0-based: [startIdx, endIdx) exclusive
    totalPages: number;
    handoffReceived?: any; // Previous chunk's handoff package
  };
}

/**
 * Build the universal v10 prompt for encounter discovery
 * Works for both single-chunk (standard) and multi-chunk (progressive) processing
 */
export function buildEncounterDiscoveryPromptV10(config: V10PromptConfig): string {
  const { fullText, progressive } = config;

  // Build chunk context section if in progressive mode
  const chunkContext = progressive ? buildChunkContext(progressive) : '';

  // Build handoff context if receiving from previous chunk
  const handoffContext = progressive?.handoffReceived ?
    buildHandoffContext(progressive.handoffReceived) : '';

  return `You are a medical data extraction specialist analyzing healthcare documents.

${chunkContext}

# MEDICAL ENCOUNTER DISCOVERY TASK

You will extract ALL healthcare encounters from the provided medical document text. An encounter is any documented interaction between a patient and healthcare provider(s) that occurs at a specific time and place.

## Core Definition: What is a Healthcare Encounter?

A healthcare encounter MUST have:
1. **Temporal Boundary**: A specific date or date range when it occurred
2. **Provider Interaction**: Evidence of healthcare professional involvement
3. **Clinical Purpose**: Medical assessment, treatment, or care delivery
4. **Documentation**: Recorded in the medical record you're analyzing

## The Timeline Test (CRITICAL)

For each potential encounter, ask: "Could this have happened at a different time without changing the medical story?"
- If YES → It's a SEPARATE encounter (requires its own entry)
- If NO → It's part of the same encounter (consolidate together)

### Examples Applying the Timeline Test:

**SEPARATE Encounters (each gets its own entry):**
- ED visit on March 1st then another ED visit on March 2nd = 2 encounters
- Surgery on April 10th with post-op visit on April 20th = 2 encounters
- Three chemotherapy sessions on different dates = 3 encounters
- CXR and blood test performed on the same day but at seperate healthcare provider facilities = 2 encounters

**SINGLE Encounter (consolidate together):**
- Hospital admission with multiple specialist consultations during stay = 1 encounter
- Emergency visit with X-rays, CT scan, and blood tests = 1 encounter (as all perfomed on the same day at the same facility/location)
- Clinic visit with multiple providers in same session = 1 encounter

## Boundary Detection Priority

When determining encounter boundaries, use this priority system (strongest → weakest):

1. **New clinical document header with date** (e.g., "DISCHARGE SUMMARY 2024-03-15") = STRONG boundary
2. **Provider name change** (Dr. Smith → Dr. Jones) = STRONG boundary
3. **Facility/department change** = MODERATE boundary
4. **Date discontinuity** (>24 hours gap) = MODERATE boundary
5. **Document formatting change** = WEAK signal (verify with content)

**Boundary Verification:** When you detect a potential boundary, check the next page to confirm the encounter actually changed.

${handoffContext}

## Encounter Types to Extract

### Primary Encounter Types (Use Standardized Values)

**IMPORTANT:** Use these exact lowercase_underscore values for encounterType:

1. **"emergency_department"**
   - ONLY for standalone ED visits where patient is discharged home
   - DO NOT use for ED visits that lead to hospital admission
   - Urgent care or after-hours clinic visits

2. **"hospital_admission"**
   - Inpatient stays (overnight or longer)
   - INCLUDES the ED visit if patient was admitted from ED
   - Treat ED-to-admission as ONE continuous hospital_admission encounter
   - Day surgery admissions (even if same-day discharge)

3. **"surgical_procedure"**
   - Standalone surgeries (outpatient)
   - Include pre-operative assessment if documented
   - Capture procedure type and surgical team

4. **"outpatient_consultation"**
   - Clinic visits
   - Specialist appointments
   - Follow-up visits
   - Initial consultations
  
5. **"imaging"**
   - Standalone imaging appointments
   - Include modality (X-ray, CT, MRI, ultrasound, etc.)
   - Capture imaging findings if available

6. **"lab_test"**
   - Standalone pathology/lab visits
   - Blood draws, urine samples, biopsies
   - Include test types ordered

7. **"treatment_session"**
   - Chemotherapy infusions
   - Radiation therapy
   - Dialysis sessions
   - Physiotherapy sessions
   - Wound care visits

8. **"vaccination"**
   - Vaccine administrations
   - Include vaccine type and dose number
   - Travel vaccinations

9. **"telehealth"**
   - Video consultations
   - Phone consultations
   - Remote monitoring reviews

10. **"medication_review"**
    - Pharmacy consultations
    - Medication therapy management
    - Prescription renewals with assessment

### Encounter Metadata to Extract

For EACH encounter, extract:

1. **Date Information**
   - Start date (REQUIRED - use document date if necessary)
   - End date rules:
     * Single-day encounters: Set encounterEndDate = encounterStartDate
     * Multi-day completed encounters: Set actual end date
     * Ongoing encounters: Set encounterEndDate = null
   - Time if specified
   - Date source (extracted from text vs inferred)

2. **Facility/Location**
   - Hospital/clinic name
   - Department/ward
   - Room number if specified
   - City/region if mentioned
   
3. **Provider Information**
   - Primary provider name
   - Provider role/specialty
   - Additional providers involved
   - Referring provider if mentioned 

4. **Clinical Content**
   - Chief complaint/reason for visit
   - Key diagnoses mentioned
   - Procedures performed
   - Medications given/prescribed
   - Disposition/outcome

5. **Administrative Details**
   - Medical Record Number (MRN)
   - Visit/encounter ID
   - Insurance information if mentioned

## Page Assignment Logic

EVERY page must be assigned to an encounter. Use this decision tree:

1. **Clear encounter content** → Assign to that encounter
2. **Continuation from previous page** → Assign to same encounter
3. **Mixed content (rare)** → Assign to PRIMARY encounter on that page
4. **Headers/footers only** → Assign to encounter that spans across
5. **Cover pages** → Assign to first encounter in document
6. **Pure administrative** → Assign to most relevant encounter

**CRITICAL:** The justification MUST include a key phrase from that actual page. Examples:
- GOOD: "Contains 'DISCHARGE SUMMARY' header and date '2024-03-15'"
- GOOD: "Shows 'Dr. Smith' and 'cardiac consultation'"
- BAD: "Emergency department notes" (too generic, no specific text)

## CRITICAL: ED-to-Admission Continuity

**IMPORTANT**: When an Emergency Department visit leads directly to hospital admission, this is ONE CONTINUOUS ENCOUNTER, not two separate encounters:
- Use encounterType: "hospital_admission" for the entire stay
- Do NOT create separate ED and admission encounters when one leads to the other

## Output JSON Schema

You must output valid JSON with this EXACT structure:

\`\`\`json
{
  "encounters": [
    {
      "encounterId": "enc-001",
      "encounterType": "hospital_admission",
      "status": "continuing",
      "tempId": "encounter_temp_chunk1_001",
      "expectedContinuation": "discharge_summary",
      "encounterStartDate": "2024-03-15",
      "encounterEndDate": null,
      "encounterTimeframeStatus": "ongoing",
      "dateSource": "ai_extracted",
      "providerName": "Dr. Michael Roberts",
      "providerRole": "Hospitalist",
      "facility": "St Vincent's Hospital",
      "department": "Cardiac ICU",
      "chiefComplaint": "Chest pain leading to STEMI diagnosis",
      "diagnoses": ["STEMI", "Acute heart failure"],
      "procedures": ["ECG", "Cardiac catheterization", "PCI with stent"],
      "medications": ["Aspirin", "Nitroglycerin", "Dual antiplatelet therapy"],
      "disposition": null,
      "pageRanges": [[1, 50]],
      "confidence": 0.95,
      "summary": "Patient presented to ED with chest pain, diagnosed with STEMI, admitted to Cardiac ICU for PCI and ongoing management"
    }
  ],
  "pageAssignments": [
    {
      "page": 1,
      "encounterId": "enc-001",
      "justification": "Contains 'EMERGENCY DEPARTMENT TRIAGE' header and '15/03/2024 14:32'"
    },
    {
      "page": 2,
      "encounterId": "enc-001",
      "justification": "Shows 'Dr. Sarah Chen' and 'chest pain radiating to left arm'"
    }
  ],
  "activeContext": {
    "currentAdmission": {
      "facility": "St Vincent's Hospital",
      "admitDate": "2024-03-15",
      "expectedDischargeInfo": "pending"
    },
    "activeProviders": ["Dr. Michael Roberts", "Dr. Sarah Chen"],
    "recentLabOrders": [],
    "documentFlow": "chronological",
    "lastConfidentDate": "2024-03-15"
  },
  "extractionMetadata": {
    "totalEncountersFound": 2,
    "dateExtractionConfidence": 0.92,
    "documentCompleteness": "partial",
    "flaggedForReview": false,
    "reviewReasons": []
  }
}
\`\`\`

## CRITICAL Field Specifications

### Encounter Status Field (REQUIRED)
- **"complete"**: Encounter documentation is fully contained within this chunk
- **"continuing"**: Encounter documentation extends into the next chunk (progressive mode only)

**CRITICAL - Don't Confuse These Two Concepts:**
- **encounterEndDate**: When the real-world medical encounter ended (or null if ongoing)
- **status="continuing"**: Whether this encounter's DOCUMENTATION continues in next chunk
- **These are INDEPENDENT**: A hospital stay from 2022-11-29 to 2022-12-07 has a real end date, but if its discharge summary spans pages 1-142, then status="continuing" until the final chunk

**ABSOLUTE RULE - Chunk Boundary Enforcement:**
IF you are NOT processing the final chunk:
  AND any encounter's pageRanges include the LAST PAGE of this chunk
  THEN that encounter MUST have:
    - status="continuing"
    - tempId field populated
    - expectedContinuation field populated

This rule applies REGARDLESS of whether the encounter has an end date. Having a real-world end date does NOT mean the documentation is complete.

**Example - 142-page document split into 3 chunks (pages 1-50, 51-100, 101-142):**
- Chunk 1 (pages 1-50): Encounter with pageRanges [[1,50]] → status="continuing" (touches page 50, not final chunk)
- Chunk 2 (pages 51-100): Encounter with pageRanges [[51,100]] → status="continuing" (touches page 100, not final chunk)
- Chunk 3 (pages 101-142): Encounter with pageRanges [[101,142]] → status="complete" (final chunk)

**When to Use status="continuing" (Check ALL indicators):**
1. **Page Range Touches Chunk Boundary**: If ANY pageRange ends at the last page of this chunk (HIGHEST PRIORITY)
2. **Missing End Date**: If encounterEndDate is null/missing AND encounterTimeframeStatus is NOT "completed"
3. **Explicit Continuation Signal**: If you see phrases like "continued on next page" or incomplete sections
4. **Expected Continuation**: If you expect more content (discharge summary, lab results, etc.) in next chunk

**When status="complete" is SAFE:**
- You are processing the FINAL chunk (all encounters should be complete)
- Encounter ends BEFORE the chunk boundary (last pageRange ends before the last page of chunk)
- Multiple distinct encounters can be "complete" within same chunk if each is fully documented AND none touch the chunk boundary

### TempId Field (REQUIRED when status="continuing")
- Format: "encounter_temp_chunkN_XXX" where N is chunk number and XXX is a simple counter (001, 002, etc.)
- Example: "encounter_temp_chunk1_001" for first continuing encounter in chunk 1
- Used to track encounters across chunk boundaries
- Must be consistent when completing encounter in next chunk
- Do NOT use the encounterId in tempId generation

### ExpectedContinuation Field (REQUIRED when status="continuing")
- Describes what content is expected in the next chunk
- Examples: "discharge_summary", "lab_results", "surgical_notes", "recovery_progress"

### Date Fields (Database Column Names)
- **encounterStartDate**: Start date in YYYY-MM-DD format
- **encounterEndDate**: End date in YYYY-MM-DD format (null if ongoing)
- Note: Database column is "encounter_end_date" not "encounter_end_date"

### Confidence Score
- 0.0 to 1.0 scale
- Stored in database as "pass_0_5_confidence" not "confidence"
- Calibration bands:
  * 0.90-1.00: All dates explicit, provider named, clear boundaries, document headers present
  * 0.70-0.89: Most information present, minor uncertainty in dates or providers
  * 0.50-0.69: Some key information missing or unclear, requires verification
  * Below 0.50: Major uncertainty, multiple missing elements, flag for review
- Factors: date clarity, provider identification, encounter boundaries

### Page Ranges
- Format: Array of [start, end] pairs (1-indexed)
- Can span multiple ranges: [[1, 5], [51, 75]]
- Must cover actual pages containing encounter content

## Progressive Mode Handling

### When Processing Multi-Chunk Documents

1. **First Chunk**
   - No handoff context received
   - Mark encounters extending beyond chunk as "continuing"
   - Generate handoff package in activeContext

2. **Middle Chunks**
   - Check handoff context for pending encounters
   - Complete pending encounters if found
   - Mark new encounters extending beyond as "continuing"
   - Update activeContext for next chunk

3. **Final Chunk**
   - Complete all pending encounters
   - No encounters should be marked "continuing"
   - Finalize all encounter boundaries

### Completing Encounters from Previous Chunks

When you receive a pending encounter in handoff:
1. Look for continuation in current chunk
2. If found, create ONE encounter entry that includes:
   - encounterId: Use the tempId from handoff (e.g., "encounter_temp_chunk1_001")
   - status: "complete" if ending in this chunk, "continuing" if extending further
   - pageRanges: Combine ranges from all chunks
   - All merged data from both chunks
3. Do NOT create a new encounter - complete the existing one

## Special Handling Instructions

### Date Extraction
- Prefer explicit dates from document text
- Use document metadata dates as fallback
- Mark dateSource appropriately
- Handle partial dates (month/year only)

### Provider Disambiguation
- Same provider may appear with variations
- Consolidate obvious duplicates
- Preserve specialty/role information
- Include department affiliations

### Duplicate Prevention
- Check for same encounter_type + encounter_start_date + facility
- Consolidate if clearly the same encounter
- Keep separate if different departments/providers

### Quality Checks
- Every page must be assigned
- Date ranges must be logical
- Confidence scores must reflect uncertainty
- Flag for review if critical data missing

## OCR Text Input

The medical document text follows. Extract all encounters according to these instructions:

${fullText}

---

OUTPUT ONLY VALID JSON. No explanations or comments outside the JSON structure.`;
}

/**
 * Build chunk context section for progressive mode
 */
function buildChunkContext(progressive: {
  chunkNumber: number;
  totalChunks: number;
  pageRange: [number, number];
  totalPages: number;
}) {
  const { chunkNumber, totalChunks, pageRange, totalPages } = progressive;

  let position = '';
  if (chunkNumber === 1) {
    position = 'This is the FIRST chunk. No prior context exists.';
  } else if (chunkNumber === totalChunks) {
    position = 'This is the FINAL chunk. Complete all pending encounters.';
  } else {
    position = 'This is a MIDDLE chunk. Check for pending encounters and watch for new ones extending beyond.';
  }

  return `# PROGRESSIVE MODE ACTIVE

You are processing a LARGE document in chunks:
- **Chunk ${chunkNumber} of ${totalChunks}**
- **Pages in this chunk**: ${pageRange[0]} to ${pageRange[1]}
- **Total document pages**: ${totalPages}
- **Position**: ${position}

CRITICAL INSTRUCTIONS:
1. When creating pageRanges for encounters, use the ACTUAL page numbers from this chunk (${pageRange[0]} to ${pageRange[1]}), NOT array indices or offset numbers.
2. Encounters may span chunk boundaries. Use status, tempId, and expectedContinuation fields for handoff.
3. If any encounter's pageRanges include page ${pageRange[1]} (the last page of this chunk) AND this is not the final chunk, that encounter MUST have status="continuing".`;
}

/**
 * Build handoff context section when receiving from previous chunk
 */
function buildHandoffContext(handoff: any): string {
  let context = '\n## HANDOFF FROM PREVIOUS CHUNK\n\n';

  // Pending encounter to complete
  if (handoff.pendingEncounter) {
    const pending = handoff.pendingEncounter;
    context += `### Pending Encounter to Complete\n\n`;
    context += `You MUST look for the continuation of this encounter:\n`;
    context += `- **Temp ID**: ${pending.tempId} (use this as encounterId when completing)\n`;
    context += `- **Type**: ${pending.encounterType}\n`;
    context += `- **Start Date**: ${pending.encounterDate || 'Unknown'}\n`;
    context += `- **Provider**: ${pending.provider || 'Unknown'}\n`;
    context += `- **Facility**: ${pending.partialData?.facility || 'Unknown'}\n`;
    context += `- **Started on page**: ${pending.startPage + 1}\n`;
    context += `- **Expected content**: ${pending.expectedContinuation}\n`;
    context += `- **Previous pages**: [[${pending.startPage + 1}, ${pending.partialData?.pageRanges?.[0]?.[1] || pending.startPage + 1}]]\n\n`;
    context += `When you find the continuation:\n`;
    context += `1. Set encounterId = "${pending.tempId}"\n`;
    context += `2. Set status = "complete"\n`;
    context += `3. Merge all data from both chunks\n`;
    context += `4. Combine page ranges\n\n`;
  }

  // Active context
  if (handoff.activeContext) {
    const ctx = handoff.activeContext;

    if (ctx.currentAdmission) {
      context += `### Active Hospital Admission\n`;
      context += `- **Facility**: ${ctx.currentAdmission.facility}\n`;
      context += `- **Admit Date**: ${ctx.currentAdmission.admitDate}\n`;
      context += `- **Status**: ${ctx.currentAdmission.expectedDischargeInfo || 'Ongoing'}\n\n`;
    }

    if (ctx.activeProviders?.length > 0) {
      context += `### Active Providers\n`;
      context += ctx.activeProviders.map((p: string) => `- ${p}`).join('\n');
      context += '\n\n';
    }

    if (ctx.documentFlow) {
      context += `### Document Flow Pattern: ${ctx.documentFlow}\n`;
      if (ctx.lastConfidentDate) {
        context += `Last confident date: ${ctx.lastConfidentDate}\n`;
      }
      context += '\n';
    }
  }

  return context;
}

/**
 * Migration helper: Convert v10 response to database format
 * Maps camelCase fields to snake_case for database insertion
 *
 * IMPORTANT: Only maps to columns that actually exist in healthcare_encounters table
 * Additional extracted data (diagnoses, procedures, medications, etc.) should be
 * stored in separate tables or in the summary/clinical_impression fields
 */
export function mapV10ResponseToDatabase(encounter: any): any {
  // Build extended summary that includes extra extracted data
  let extendedSummary = encounter.summary || '';

  // Append additional clinical data to summary if present
  if (encounter.diagnoses?.length > 0) {
    extendedSummary += `\nDiagnoses: ${encounter.diagnoses.join(', ')}`;
  }
  if (encounter.procedures?.length > 0) {
    extendedSummary += `\nProcedures: ${encounter.procedures.join(', ')}`;
  }
  if (encounter.medications?.length > 0) {
    extendedSummary += `\nMedications: ${encounter.medications.join(', ')}`;
  }
  if (encounter.disposition) {
    extendedSummary += `\nDisposition: ${encounter.disposition}`;
  }

  return {
    // Core identification
    patient_id: encounter.patientId,
    primary_shell_file_id: encounter.shellFileId,

    // Encounter details (columns that exist)
    encounter_type: encounter.encounterType,
    encounter_start_date: encounter.encounterStartDate,
    encounter_end_date: encounter.encounterEndDate,
    encounter_timeframe_status: encounter.encounterTimeframeStatus || 'unknown_end_date',
    date_source: encounter.dateSource || 'ai_extracted',

    // Provider/facility info (columns that exist)
    provider_name: encounter.providerName,
    provider_type: encounter.providerRole, // Maps providerRole -> provider_type
    facility_name: encounter.facility,
    specialty: encounter.department || encounter.specialty, // Maps department -> specialty

    // Clinical content (columns that exist)
    chief_complaint: encounter.chiefComplaint,
    summary: extendedSummary.trim(),
    clinical_impression: encounter.diagnoses?.join('; ') || null,
    plan: encounter.expectedContinuation || null, // Use continuation hint as plan

    // Spatial/page info
    page_ranges: encounter.pageRanges || [],

    // Tracking metadata
    pass_0_5_confidence: encounter.confidence,
    identified_in_pass: 'pass_0_5',
    source_method: 'ai_pass_0_5',

    // Review flag if low confidence
    requires_review: encounter.confidence < 0.7
  };
}