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
  const { fullText, pageCount, progressive } = config;

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
- ED visit on March 1st → Admission on March 1st → Discharge on March 5th = 2 encounters
  - Emergency Department Visit (March 1st)
  - Hospital Admission (March 1-5)
- Surgery on April 10th with post-op visit on April 20th = 2 encounters
- Three chemotherapy sessions on different dates = 3 encounters

**SINGLE Encounter (consolidate together):**
- Hospital admission with multiple specialist consultations during stay = 1 encounter
- Emergency visit with X-rays, CT scan, and blood tests = 1 encounter
- Clinic visit with multiple providers in same session = 1 encounter

${handoffContext}

## Encounter Types to Extract

### Primary Encounter Types

1. **Emergency Department Visit**
   - Standalone ED visits (patient discharged home)
   - Initial ED assessment before admission (separate from admission)
   - Urgent care or after-hours clinic visits

2. **Hospital Admission**
   - Inpatient stays (overnight or longer)
   - Includes all care during the admission period
   - Day surgery admissions (even if same-day discharge)

3. **Surgical Procedure**
   - Standalone surgeries (outpatient)
   - Include pre-operative assessment if documented
   - Capture procedure type and surgical team

4. **Outpatient Consultation**
   - Specialist appointments
   - Follow-up visits
   - Initial consultations
   - Clinic visits

5. **Diagnostic Imaging**
   - Standalone imaging appointments
   - Include modality (X-ray, CT, MRI, ultrasound, etc.)
   - Capture imaging findings if available

6. **Laboratory Test Collection**
   - Standalone pathology/lab visits
   - Blood draws, urine samples, biopsies
   - Include test types ordered

7. **Treatment Session**
   - Chemotherapy infusions
   - Radiation therapy
   - Dialysis sessions
   - Physiotherapy sessions
   - Wound care visits

8. **Vaccination/Immunization**
   - Vaccine administrations
   - Include vaccine type and dose number
   - Travel vaccinations

9. **Telehealth Consultation**
   - Video consultations
   - Phone consultations
   - Remote monitoring reviews

10. **Medication Review**
    - Pharmacy consultations
    - Medication therapy management
    - Prescription renewals with assessment

### Encounter Metadata to Extract

For EACH encounter, extract:

1. **Date Information**
   - Start date (REQUIRED - use document date if necessary)
   - End date (for multi-day encounters)
   - Time if specified
   - Date source (extracted from text vs inferred)

2. **Provider Information**
   - Primary provider name
   - Provider role/specialty
   - Additional providers involved
   - Referring provider if mentioned

3. **Facility/Location**
   - Hospital/clinic name
   - Department/ward
   - Room number if specified
   - City/region if mentioned

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

## Output JSON Schema

You must output valid JSON with this EXACT structure:

\`\`\`json
{
  "encounters": [
    {
      "encounterId": "enc-001",
      "encounterType": "Emergency Department Visit",
      "status": "complete",
      "tempId": null,
      "expectedContinuation": null,
      "encounterStartDate": "2024-03-15",
      "encounterEndDate": "2024-03-15",
      "encounterTimeframeStatus": "completed",
      "dateSource": "ai_extracted",
      "providerName": "Dr. Sarah Chen",
      "providerRole": "Emergency Physician",
      "facility": "St Vincent's Hospital",
      "department": "Emergency Department",
      "chiefComplaint": "Chest pain and shortness of breath",
      "diagnoses": ["Acute myocardial infarction", "Hypertension"],
      "procedures": ["ECG", "Cardiac catheterization"],
      "medications": ["Aspirin 300mg", "Nitroglycerin sublingual"],
      "disposition": "Admitted to Cardiac ICU",
      "pageRanges": [[1, 5]],
      "confidence": 0.95,
      "summary": "Emergency presentation with acute MI, stabilized and admitted for cardiac care"
    },
    {
      "encounterId": "enc-002",
      "encounterType": "Hospital Admission",
      "status": "continuing",
      "tempId": "encounter_temp_002",
      "expectedContinuation": "discharge_summary",
      "encounterStartDate": "2024-03-15",
      "encounterEndDate": null,
      "encounterTimeframeStatus": "ongoing",
      "dateSource": "ai_extracted",
      "providerName": "Dr. Michael Roberts",
      "providerRole": "Cardiologist",
      "facility": "St Vincent's Hospital",
      "department": "Cardiac ICU",
      "chiefComplaint": "Post-MI management",
      "diagnoses": ["STEMI", "Acute heart failure"],
      "procedures": ["PCI with stent placement"],
      "medications": ["Dual antiplatelet therapy", "Beta blocker", "ACE inhibitor"],
      "disposition": null,
      "pageRanges": [[5, 50]],
      "confidence": 0.90,
      "summary": "Cardiac ICU admission following STEMI, PCI performed, ongoing care"
    }
  ],
  "pageAssignments": [
    {
      "page": 1,
      "encounterId": "enc-001",
      "justification": "ED triage and initial assessment"
    },
    {
      "page": 2,
      "encounterId": "enc-001",
      "justification": "ED physician notes and examination"
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
- **"complete"**: Encounter is fully contained within this chunk/document
- **"continuing"**: Encounter extends beyond this chunk (progressive mode only)

### TempId Field (REQUIRED when status="continuing")
- Format: "encounter_temp_XXX" where XXX is a unique identifier
- Used to track encounters across chunk boundaries
- Must be consistent when completing encounter in next chunk

### ExpectedContinuation Field (REQUIRED when status="continuing")
- Describes what content is expected in the next chunk
- Examples: "discharge_summary", "lab_results", "surgical_notes", "recovery_progress"

### Date Fields (Database Column Names)
- **encounterStartDate**: Start date in YYYY-MM-DD format
- **encounterEndDate**: End date in YYYY-MM-DD format (null if ongoing)
- Note: Database column is "encounter_date_end" not "encounter_end_date"

### Confidence Score
- 0.0 to 1.0 scale
- Stored in database as "pass_0_5_confidence" not "confidence"
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
2. Merge data from both chunks
3. Set status="complete"
4. Combine page ranges from both chunks
5. Use the tempId from handoff as encounterId

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
- **Pages in this chunk**: ${pageRange[0] + 1} to ${pageRange[1]} (1-indexed)
- **Total document pages**: ${totalPages}
- **Position**: ${position}

CRITICAL: Encounters may span chunk boundaries. Use status, tempId, and expectedContinuation fields for handoff.`;
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
 */
export function mapV10ResponseToDatabase(encounter: any): any {
  return {
    // Database uses snake_case column names
    patient_id: encounter.patientId,
    primary_shell_file_id: encounter.shellFileId,
    encounter_type: encounter.encounterType,
    encounter_start_date: encounter.encounterStartDate,
    encounter_date_end: encounter.encounterEndDate, // CRITICAL: Not encounter_end_date!
    encounter_timeframe_status: encounter.encounterTimeframeStatus || 'unknown_end_date',
    date_source: encounter.dateSource || 'ai_extracted',
    provider_name: encounter.providerName,
    provider_role: encounter.providerRole,
    facility_name: encounter.facility,
    department: encounter.department,
    chief_complaint: encounter.chiefComplaint,
    diagnoses: encounter.diagnoses || [],
    procedures: encounter.procedures || [],
    medications: encounter.medications || [],
    disposition: encounter.disposition,
    page_ranges: encounter.pageRanges || [],
    pass_0_5_confidence: encounter.confidence, // CRITICAL: Not just confidence!
    summary: encounter.summary,
    identified_in_pass: 'pass_0_5',
    source_method: 'ai_pass_0_5'
  };
}