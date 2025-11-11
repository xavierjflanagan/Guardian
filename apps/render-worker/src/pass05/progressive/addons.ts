/**
 * Progressive Mode Addons
 *
 * Schema-agnostic instructions appended to base prompts (v2.9, v3.0, etc.)
 * for chunk-based processing of large documents.
 *
 * ARCHITECTURE:
 * - Base prompt defines WHAT encounters are and JSON output format
 * - Addons define HOW to handle chunks and context handoff
 * - Addons NEVER modify the JSON schema
 *
 * This allows base prompts to evolve (v2.9 -> v3.0) without breaking progressive mode.
 */

import { HandoffPackage } from './types';

export interface ProgressiveAddonInput {
  chunkNumber: number;
  totalChunks: number;
  pageRange: [number, number]; // 0-based: [startIdx, endIdx) exclusive
  totalPages: number;
  handoffReceived: HandoffPackage | null;
}

/**
 * Build progressive mode instructions to append to base prompt
 *
 * These instructions are schema-agnostic and work with any base prompt
 * that uses the v2.9+ JSON format (encounterType, dateRange, etc.)
 */
export function buildProgressiveAddons(input: ProgressiveAddonInput): string {
  const { chunkNumber, totalChunks, pageRange, totalPages, handoffReceived } = input;

  // Build handoff context section (if applicable)
  const handoffContext = handoffReceived ? buildHandoffContext(handoffReceived) : '';

  // Build chunk position guidance
  const positionGuidance = buildPositionGuidance(chunkNumber, totalChunks);

  return `

# PROGRESSIVE MODE INSTRUCTIONS

You are analyzing a CHUNK of a large medical document, not the complete document.

## Chunk Information
- **Chunk ${chunkNumber} of ${totalChunks}**
- **Pages in this chunk**: ${pageRange[0] + 1} to ${pageRange[1]} (1-indexed)
- **Total document pages**: ${totalPages}

${positionGuidance}

${handoffContext}

## Progressive Processing Guidelines

### 1. Incomplete Encounters Spanning Chunks

If you find an encounter that **starts** in this chunk but **continues beyond the last page**:

**What to do:**
- Set \`"status": "continuing"\` (REQUIRED)
- Assign a \`"tempId": "encounter_temp_XXX"\` (REQUIRED)
- Set \`"expectedContinuation"\` to describe what's expected next
- Extract all data you can see so far (date, provider, facility, etc.)
- Include page ranges for this chunk only

**Example:**
\`\`\`json
{
  "encounter_id": "enc-1",
  "encounterType": "inpatient",
  "status": "continuing",  // REQUIRED for handoff
  "tempId": "encounter_temp_001",  // REQUIRED for tracking
  "expectedContinuation": "discharge_summary",  // REQUIRED hint
  "dateRange": {"start": "2024-03-15"},  // May not have end date yet
  "summary": "Hospital admission started 2024-03-15 at St Vincent's Hospital",
  "pageRanges": [[${pageRange[0] + 1}, ${pageRange[1]}]]
}
\`\`\`

The next chunk MUST look for this tempId to complete the encounter.

### 2. Completing Encounters from Previous Chunk

If you received a pending encounter from the previous chunk (see Context section above):

**What to do:**
- Look for the continuation of that encounter in this chunk's pages
- If you find it, create a SINGLE complete encounter merging both parts
- Use the encounter_id from the pending encounter
- Update pageRanges to span both chunks: \`[[prev_start, prev_end], [this_start, this_end]]\`

**Example:**
\`\`\`json
{
  "encounter_id": "enc-1",
  "encounterType": "inpatient",
  "dateRange": {"start": "2024-03-15", "end": "2024-03-18"},
  "summary": "Hospital admission 2024-03-15 to 2024-03-18 at St Vincent's Hospital",
  "pageRanges": [[1, 50], [51, 75]]
}
\`\`\`

### 3. New Encounters in This Chunk

Process new encounters normally using the Timeline Test and all guidelines from above.

### 4. REQUIRED JSON Output Format for Progressive Mode

**CRITICAL:** You MUST include these additional fields for progressive mode to work:

\`\`\`json
{
  "encounters": [
    {
      // Standard v2.9 fields (encounterType, dateRange, etc.)
      "encounter_id": "enc-1",
      "encounterType": "inpatient",
      "dateRange": {"start": "2024-03-15", "end": "2024-03-18"},

      // REQUIRED PROGRESSIVE FIELDS:
      "status": "complete",  // or "continuing" if extends beyond chunk
      "tempId": "encounter_temp_001",  // REQUIRED if status is "continuing"
      "expectedContinuation": "discharge_notes",  // REQUIRED if status is "continuing"

      // Standard fields continue...
      "summary": "Hospital admission...",
      "pageRanges": [[1, 50]],
      "confidence": 0.95
    }
  ],
  "pageAssignments": [
    // Standard format
  ],
  "activeContext": {  // REQUIRED for handoff to next chunk
    "currentAdmission": {
      "facility": "St Vincent's Hospital",
      "admitDate": "2024-03-15",
      "expectedDischargeInfo": "pending"
    },
    "recentLabOrders": [],
    "activeProviders": ["Dr. Chen"],
    "documentFlow": "chronological",
    "lastConfidentDate": "2024-03-15"
  }
}
\`\`\`

**Progressive Mode Rules:**
1. **status**: Set to "continuing" if encounter extends beyond page ${pageRange[1]}
2. **tempId**: Required for continuing encounters (e.g., "encounter_temp_001")
3. **expectedContinuation**: What you expect in next chunk (e.g., "lab_results", "discharge_summary")
4. **activeContext**: Always include for handoff to next chunk

`.trim();
}

/**
 * Build context section when receiving pending encounters from previous chunk
 */
function buildHandoffContext(handoff: HandoffPackage): string {
  let context = '## Context from Previous Chunk\n\n';

  // Pending encounter
  if (handoff.pendingEncounter) {
    const pending = handoff.pendingEncounter;
    context += `### Pending Encounter to Complete\n\n`;
    context += `The previous chunk detected an encounter that continues into this chunk:\n\n`;
    context += `- **Encounter ID**: ${pending.tempId} (use this ID if you complete it)\n`;
    context += `- **Type**: ${pending.encounterType || 'Unknown'}\n`;
    context += `- **Date**: ${pending.encounterDate || 'Unknown'}\n`;
    context += `- **Provider**: ${pending.provider || 'Unknown'}\n`;
    context += `- **Facility**: ${pending.partialData.facility || 'Unknown'}\n`;
    context += `- **Started on page**: ${pending.startPage + 1}\n`;
    context += `- **Expected continuation**: ${pending.expectedContinuation || 'Unknown'}\n`;
    context += `- **Context snippet**: "${pending.lastSeenContext.slice(0, 200)}..."\n\n`;
    context += `**Your task**: Look for the continuation of this encounter in this chunk. If found, merge the data into a single complete encounter.\n\n`;
  }

  // Active context (hospital admissions, lab orders, etc.)
  if (handoff.activeContext.currentAdmission) {
    const adm = handoff.activeContext.currentAdmission;
    context += `### Active Hospital Admission Context\n\n`;
    context += `The patient is currently admitted:\n`;
    context += `- **Facility**: ${adm.facility}\n`;
    context += `- **Admit Date**: ${adm.admitDate}\n`;
    context += `- **Status**: ${adm.expectedDischargeInfo || 'Ongoing'}\n\n`;
    context += `This context may help you understand references to "current admission" or "inpatient care".\n\n`;
  }

  // Recent lab orders
  if (handoff.activeContext.recentLabOrders && handoff.activeContext.recentLabOrders.length > 0) {
    context += `### Recent Lab Orders (Awaiting Results)\n\n`;
    for (const lab of handoff.activeContext.recentLabOrders) {
      context += `- **Ordered**: ${lab.orderedDate} by ${lab.provider}\n`;
      context += `  - Tests: ${lab.tests.join(', ')}\n`;
    }
    context += `\nIf you see lab results in this chunk, they may correspond to these orders.\n\n`;
  }

  // Active providers
  if (handoff.activeContext.activeProviders.length > 0) {
    context += `### Recently Mentioned Providers\n\n`;
    context += `These providers were mentioned recently:\n`;
    context += handoff.activeContext.activeProviders.map(p => `- ${p}`).join('\n');
    context += '\n\n';
  }

  // Document flow
  context += `### Document Flow Pattern\n\n`;
  context += `- **Flow**: ${handoff.activeContext.documentFlow}\n`;
  if (handoff.activeContext.lastConfidentDate) {
    context += `- **Last confident date**: ${handoff.activeContext.lastConfidentDate}\n`;
  }
  context += '\n';

  // Recent encounters summary
  if (handoff.recentEncountersSummary.length > 0) {
    context += `### Recent Encounters (from previous chunks)\n\n`;
    for (const enc of handoff.recentEncountersSummary) {
      context += `- **${enc.date}**: ${enc.type} with ${enc.provider} (pages ${enc.pages.join(', ')})\n`;
    }
    context += '\n';
  }

  return context;
}

/**
 * Build guidance based on chunk position
 */
function buildPositionGuidance(chunkNumber: number, totalChunks: number): string {
  if (chunkNumber === 1) {
    return `**Position**: This is the FIRST chunk. There is no prior context from previous chunks.`;
  } else if (chunkNumber === totalChunks) {
    return `**Position**: This is the FINAL chunk. Any incomplete encounters should be marked in the summary as continuing beyond this document.`;
  } else {
    return `**Position**: This is a MIDDLE chunk. You may receive pending encounters from previous chunks, and may encounter incomplete encounters that continue to the next chunk.`;
  }
}
