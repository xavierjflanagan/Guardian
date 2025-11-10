/**
 * Progressive Refinement Prompts
 * Context-aware prompts for chunk-based processing
 */

import { HandoffPackage } from './types';
import { OCRPage } from '../types';

export interface ProgressivePromptInput {
  pages: OCRPage[];
  pageRange: [number, number]; // 0-based: [startIdx, endIdx) exclusive
  totalPages: number;
  chunkNumber: number;
  totalChunks: number;
  handoffReceived: HandoffPackage | null;
}

/**
 * Build progressive chunk processing prompt
 */
export function buildProgressivePrompt(input: ProgressivePromptInput): string {
  const { pages, pageRange, totalPages, chunkNumber, totalChunks, handoffReceived } = input;

  // Build OCR text with page markers
  const ocrText = buildOCRText(pages, pageRange[0]);

  // Build handoff context section
  const handoffContext = handoffReceived ? buildHandoffContext(handoffReceived) : '';

  // Build chunk position guidance
  const positionGuidance = buildPositionGuidance(chunkNumber, totalChunks);

  return `
# Task: Healthcare Encounter Discovery (Progressive Mode)

You are analyzing a **chunk** of a large medical document (${totalPages} total pages).

## Chunk Information
- **Chunk ${chunkNumber} of ${totalChunks}**
- **Pages in this chunk**: ${pageRange[0] + 1} to ${pageRange[1]} (1-indexed)
- **Total document pages**: ${totalPages}

${positionGuidance}

${handoffContext}

# Core Principle: Timeline Test

**A healthcare encounter is timeline-worthy when it has BOTH:**
1. **Specific Date**: YYYY-MM-DD or YYYY-MM format
2. **Provider OR Facility**: Named healthcare provider OR specific facility

**Timeline-Worthy Examples:**
- "Admitted to St Vincent's Hospital 2024-03-10" (date + facility)
- "GP visit with Dr. Jones on 2024-01-15" (date + provider)
- "Pathology report collected 03-Jul-2025 at NSW Health Pathology" (date + facility)

**Not Timeline-Worthy:**
- Medication lists without visit dates
- Lab reports without collection dates
- Administrative summaries

# Progressive Processing Instructions

## 1. Handling Incomplete Encounters

If an encounter **starts** in this chunk but **continues beyond** the last page:
- Mark the encounter as \`"status": "continuing"\`
- Assign a temporary ID: \`"temp_id": "encounter_temp_001"\`
- Include all data you can extract so far in \`partial_data\`
- Set \`"expected_continuation"\`: hint about what's expected next (e.g., "lab_results", "treatment_plan")

## 2. Completing Previous Encounters

If you received a pending encounter from the previous chunk:
- Try to complete it using content in this chunk
- If completed, merge it into a full encounter with \`"status": "complete"\`
- If still incomplete, update the partial data and pass it forward again

## 3. Active Context Tracking

Track ongoing medical situations that might affect future chunks:
- Current hospital admissions (facility, admit date, expected discharge)
- Recent lab orders awaiting results
- Active providers mentioned recently
- Document flow pattern (chronological, by provider, mixed)

## 4. Page Number Format

**CRITICAL:** All page numbers in your response must be **1-indexed** (matching how humans read documents).
- This chunk contains pages ${pageRange[0] + 1} to ${pageRange[1]}
- Use these exact numbers in page_ranges
- Example: \`"page_ranges": [[${pageRange[0] + 1}, ${pageRange[0] + 3}]]\` for first 3 pages of chunk

# Required JSON Response Format

\`\`\`json
{
  "continuation_data": {
    // If there was a pending encounter, include data to complete it here
    // Structure matches what's needed to fill in missing fields
  },
  "encounters": [
    {
      "status": "complete",  // or "continuing"
      "temp_id": "encounter_temp_001",  // ONLY for continuing encounters
      "encounter_type": "Emergency Department Visit",
      "encounter_start_date": "2024-03-15",
      "encounter_end_date": "2024-03-15",  // Can be null if ongoing
      "encounter_timeframe_status": "completed",  // completed | ongoing | unknown_end_date
      "date_source": "ai_extracted",
      "provider_name": "Dr. Sarah Chen",
      "facility": "St Vincent's Hospital",
      "page_ranges": [[${pageRange[0] + 1}, ${pageRange[0] + 5}]],  // 1-indexed
      "confidence": 0.95,
      "summary": "Brief summary of encounter",
      "expected_continuation": "lab_results"  // ONLY for continuing encounters
    }
  ],
  "active_context": {
    "current_admission": {
      "facility": "St Vincent's Hospital",
      "admit_date": "2024-03-15",
      "expected_discharge_info": "awaiting cardiology clearance"
    },
    "recent_lab_orders": [
      {
        "ordered_date": "2024-03-15",
        "tests": ["CBC", "CMP"],
        "provider": "Dr. Chen"
      }
    ],
    "active_providers": ["Dr. Sarah Chen", "Dr. John Smith"],
    "document_flow": "chronological",  // chronological | mixed | by_provider
    "last_confident_date": "2024-03-15"
  }
}
\`\`\`

# OCR Text for This Chunk

${ocrText}

# Analysis Instructions

1. **Read the entire chunk** to understand context
2. **Complete any pending encounter** from previous chunk if applicable
3. **Identify all complete encounters** in this chunk
4. **Identify any incomplete encounter** that continues beyond this chunk
5. **Track active context** for next chunk
6. **Return valid JSON** matching the format above

Remember: Page numbers must be 1-indexed (pages ${pageRange[0] + 1}-${pageRange[1]} in this chunk).
`;
}

/**
 * Build OCR text with page markers
 */
function buildOCRText(pages: OCRPage[], startIdx: number): string {
  return pages.map((page, idx) => {
    const pageNum = startIdx + idx + 1; // 1-indexed
    // Extract text from OCRPage structure (blocks → paragraphs → words)
    const text = extractTextFromOCRPage(page);
    return `--- PAGE ${pageNum} START ---\n${text}\n--- PAGE ${pageNum} END ---`;
  }).join('\n\n');
}

/**
 * Extract text content from OCRPage structure
 */
function extractTextFromOCRPage(page: OCRPage): string {
  const words: string[] = [];

  for (const block of page.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const word of paragraph.words || []) {
        words.push(word.text);
      }
    }
  }

  return words.join(' ');
}

/**
 * Build handoff context section
 */
function buildHandoffContext(handoff: HandoffPackage): string {
  let context = '# Context from Previous Chunk\n\n';

  // Pending encounter
  if (handoff.pendingEncounter) {
    const pending = handoff.pendingEncounter;
    context += `## Pending Encounter to Complete\n\n`;
    context += `- **Temporary ID**: ${pending.tempId}\n`;
    context += `- **Type**: ${pending.encounterType || 'Unknown'}\n`;
    context += `- **Date**: ${pending.encounterDate || 'Unknown'}\n`;
    context += `- **Provider**: ${pending.provider || 'Unknown'}\n`;
    context += `- **Started on page**: ${pending.startPage + 1} (in previous chunk)\n`;
    context += `- **Expected continuation**: ${pending.expectedContinuation || 'Unknown'}\n`;
    context += `- **Confidence**: ${pending.confidence.toFixed(2)}\n`;
    context += `- **Last seen context**: "${pending.lastSeenContext.slice(0, 200)}..."\n\n`;
    context += `**Your task**: Look for content that completes this encounter. If found, merge the data and mark it as complete.\n\n`;
  }

  // Active context
  if (handoff.activeContext.currentAdmission) {
    const adm = handoff.activeContext.currentAdmission;
    context += `## Active Hospital Admission\n\n`;
    context += `- **Facility**: ${adm.facility}\n`;
    context += `- **Admit Date**: ${adm.admitDate}\n`;
    context += `- **Status**: ${adm.expectedDischargeInfo || 'Ongoing'}\n\n`;
  }

  // Recent lab orders
  if (handoff.activeContext.recentLabOrders && handoff.activeContext.recentLabOrders.length > 0) {
    context += `## Recent Lab Orders (awaiting results)\n\n`;
    for (const lab of handoff.activeContext.recentLabOrders) {
      context += `- **Ordered**: ${lab.orderedDate} by ${lab.provider}\n`;
      context += `  - Tests: ${lab.tests.join(', ')}\n`;
    }
    context += '\n';
  }

  // Active providers
  if (handoff.activeContext.activeProviders.length > 0) {
    context += `## Recently Mentioned Providers\n\n`;
    context += handoff.activeContext.activeProviders.map(p => `- ${p}`).join('\n');
    context += '\n\n';
  }

  // Document flow
  context += `## Document Flow Pattern\n\n`;
  context += `- **Flow**: ${handoff.activeContext.documentFlow}\n`;
  if (handoff.activeContext.lastConfidentDate) {
    context += `- **Last confident date**: ${handoff.activeContext.lastConfidentDate}\n`;
  }
  context += '\n';

  // Recent encounters summary
  if (handoff.recentEncountersSummary.length > 0) {
    context += `## Recent Encounters (from previous chunks)\n\n`;
    for (const enc of handoff.recentEncountersSummary) {
      context += `- **${enc.date}**: ${enc.type} with ${enc.provider} (pages ${enc.pages.join(', ')})\n`;
    }
    context += '\n';
  }

  return context;
}

/**
 * Build chunk position guidance
 */
function buildPositionGuidance(chunkNumber: number, totalChunks: number): string {
  if (chunkNumber === 1) {
    return `**Position**: This is the FIRST chunk. There is no prior context.`;
  } else if (chunkNumber === totalChunks) {
    return `**Position**: This is the FINAL chunk. Complete any pending encounters or mark them for manual review.`;
  } else {
    return `**Position**: This is a MIDDLE chunk. You may receive pending encounters from previous chunks, and may generate new pending encounters for the next chunk.`;
  }
}
