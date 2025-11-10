/**
 * Progressive Processing Logic for Pass 0.5
 *
 * Reference implementation for chunked document processing with context handoff.
 * This file serves as documentation and implementation template.
 *
 * Key Concepts:
 * - Split large documents into chunks (e.g., 50 pages)
 * - Process chunks sequentially with context handoff
 * - Handle encounters that span chunk boundaries
 * - Reconcile pending encounters at session end
 */

// ============================================================================
// Type Definitions
// ============================================================================

interface OCRPage {
  pageNumber: number;
  text: string;
  confidence: number;
}

interface HandoffPackage {
  // Incomplete encounter from previous chunk
  pendingEncounter?: {
    tempId: string;
    startPage: number;
    encounterDate?: string;
    provider?: string;
    encounterType?: string;
    partialData: Partial<Encounter>;
    lastSeenContext: string; // Last 500 chars
    confidence: number;
    expectedContinuation?: string; // 'lab_results' | 'treatment_plan' | etc.
  };

  // Active context to carry forward
  activeContext: {
    currentAdmission?: {
      facility: string;
      admitDate: string;
      expectedDischargeInfo?: string;
    };
    recentLabOrders?: Array<{
      orderedDate: string;
      tests: string[];
      provider: string;
    }>;
    activeProviders: string[]; // Recently mentioned providers
    documentFlow: 'chronological' | 'mixed' | 'by_provider';
    lastConfidentDate?: string; // For temporal anchoring
  };

  // Summary for next chunk
  recentEncountersSummary: Array<{
    date: string;
    type: string;
    provider: string;
    pages: number[];
  }>;
}

interface ChunkParams {
  sessionId: string;
  chunkNumber: number;
  totalChunks: number;
  pages: OCRPage[];
  pageRange: [number, number]; // [startPage, endPage]
  totalPages: number;
  handoffReceived: HandoffPackage | null;
}

interface ChunkResult {
  completedEncounters: Encounter[];
  pendingEncounter: HandoffPackage['pendingEncounter'] | null;
  handoffGenerated: HandoffPackage;
  metrics: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
    confidence: number;
  };
}

interface ProgressiveSession {
  id: string;
  shellFileId: string;
  totalPages: number;
  chunkSize: number;
  totalChunks: number;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main Pass 0.5 entry point - decides between standard and progressive processing
 */
export async function discoverEncounters(
  shellFileId: string,
  ocrPages: OCRPage[],
  patientId: string
): Promise<Pass05Result> {
  const PAGE_THRESHOLD = 100; // Switch to progressive above this
  const CHUNK_SIZE = 50; // Pages per chunk

  if (ocrPages.length <= PAGE_THRESHOLD) {
    // Standard single-pass processing (existing code)
    return processStandardPass05(shellFileId, ocrPages, patientId);
  } else {
    // Progressive refinement
    console.log(`[Pass 0.5] Large document detected (${ocrPages.length} pages). Using progressive processing.`);
    return processProgressivePass05(shellFileId, ocrPages, patientId, CHUNK_SIZE);
  }
}

// ============================================================================
// Progressive Processing Orchestrator
// ============================================================================

/**
 * Orchestrates progressive processing across multiple chunks
 */
async function processProgressivePass05(
  shellFileId: string,
  ocrPages: OCRPage[],
  patientId: string,
  chunkSize: number
): Promise<Pass05Result> {

  // 1. Initialize progressive session in database
  const session = await initializeProgressiveSession(
    shellFileId,
    patientId,
    ocrPages.length,
    chunkSize
  );

  console.log(`[Pass 0.5] Progressive session ${session.id} initialized: ${session.totalChunks} chunks`);

  // 2. Process chunks sequentially with context handoff
  let handoffPackage: HandoffPackage | null = null;
  const allEncounters: Encounter[] = [];
  let totalCost = 0;
  let totalTokens = 0;

  for (let chunkNum = 0; chunkNum < session.totalChunks; chunkNum++) {
    const startPage = chunkNum * chunkSize;
    const endPage = Math.min(startPage + chunkSize, ocrPages.length);

    console.log(`[Pass 0.5] Processing chunk ${chunkNum + 1}/${session.totalChunks} (pages ${startPage + 1}-${endPage})`);

    try {
      // Process chunk with context from previous
      const chunkResult = await processChunk({
        sessionId: session.id,
        chunkNumber: chunkNum + 1,
        totalChunks: session.totalChunks,
        pages: ocrPages.slice(startPage, endPage),
        pageRange: [startPage, endPage],
        totalPages: ocrPages.length,
        handoffReceived: handoffPackage
      });

      // Save completed encounters immediately
      for (const encounter of chunkResult.completedEncounters) {
        const savedEncounter = await saveEncounter(encounter, shellFileId, patientId);
        allEncounters.push(savedEncounter);
      }

      console.log(`[Pass 0.5] Chunk ${chunkNum + 1} completed: ${chunkResult.completedEncounters.length} encounters`);

      // Handle pending encounter
      if (chunkResult.pendingEncounter) {
        await savePendingEncounter(session.id, chunkResult.pendingEncounter);
        console.log(`[Pass 0.5] Pending encounter "${chunkResult.pendingEncounter.tempId}" handed off to next chunk`);
      }

      // Update handoff for next chunk
      handoffPackage = chunkResult.handoffGenerated;

      // Update session progress in database
      await updateSessionProgress(
        session.id,
        chunkNum + 1,
        handoffPackage,
        chunkResult.metrics
      );

      // Accumulate metrics
      totalCost += chunkResult.metrics.cost;
      totalTokens += chunkResult.metrics.inputTokens + chunkResult.metrics.outputTokens;

    } catch (error) {
      console.error(`[Pass 0.5] Chunk ${chunkNum + 1} failed:`, error);
      await markSessionFailed(session.id, error.message);
      throw error;
    }
  }

  // 3. Finalize any pending encounters
  const finalizedEncounters = await finalizePendingEncounters(session.id);
  allEncounters.push(...finalizedEncounters);

  // 4. Mark session complete
  await finalizeSession(session.id);

  console.log(`[Pass 0.5] Progressive session complete: ${allEncounters.length} total encounters, $${totalCost.toFixed(4)}`);

  return {
    success: true,
    encounters: allEncounters,
    sessionId: session.id,
    processingType: 'progressive',
    totalChunks: session.totalChunks,
    totalCost,
    totalTokens
  };
}

// ============================================================================
// Chunk Processor
// ============================================================================

/**
 * Process a single chunk with context from previous chunk
 */
async function processChunk(params: ChunkParams): Promise<ChunkResult> {
  const {
    sessionId,
    chunkNumber,
    totalChunks,
    pages,
    pageRange,
    totalPages,
    handoffReceived
  } = params;

  // Build prompt with progressive context
  const prompt = buildProgressivePrompt({
    pages,
    pageRange,
    totalPages,
    chunkNumber,
    totalChunks,
    handoffContext: handoffReceived
  });

  // Call AI model
  const model = getSelectedModel();
  const provider = AIProviderFactory.createProvider(model);
  const aiResponse = await provider.generateJSON(prompt);

  // Parse progressive response
  // IMPORTANT: parseProgressiveResponse must normalize snake_case → camelCase
  // AI returns: encounter_type, encounter_start_date, provider_name
  // Code expects: encounterType, encounterStartDate, providerName
  const parsed = parseProgressiveResponse(aiResponse.content);

  // Separate completed vs pending encounters
  const completedEncounters: Encounter[] = [];
  let pendingEncounter: HandoffPackage['pendingEncounter'] | null = null;

  for (const encounter of parsed.encounters) {
    if (encounter.status === 'complete') {
      completedEncounters.push(encounter);
    } else if (encounter.status === 'continuing') {
      // This encounter continues beyond our chunk
      pendingEncounter = {
        tempId: encounter.tempId,
        startPage: encounter.startPage,
        encounterDate: encounter.encounterDate,
        provider: encounter.provider,
        encounterType: encounter.encounterType,
        partialData: encounter,
        lastSeenContext: extractLastContext(pages, 500),
        confidence: encounter.confidence,
        expectedContinuation: encounter.expectedContinuation
      };
    }
  }

  // If we received a pending encounter from previous chunk, try to complete it
  if (handoffReceived?.pendingEncounter) {
    const completed = await tryCompletePendingEncounter(
      handoffReceived.pendingEncounter,
      parsed.continuationData,
      pages
    );

    if (completed) {
      completedEncounters.push(completed);
      console.log(`[Pass 0.5] Completed pending encounter: ${handoffReceived.pendingEncounter.tempId}`);
    } else {
      // Still incomplete, update and carry forward
      pendingEncounter = {
        ...handoffReceived.pendingEncounter,
        partialData: { ...handoffReceived.pendingEncounter.partialData, ...parsed.continuationData },
        lastSeenContext: extractLastContext(pages, 500)
      };
    }
  }

  // Build handoff package for next chunk
  const handoffGenerated: HandoffPackage = {
    pendingEncounter,
    activeContext: parsed.activeContext || {
      activeProviders: [],
      documentFlow: 'mixed'
    },
    recentEncountersSummary: completedEncounters.slice(-3).map(e => ({
      date: e.encounterDate,
      type: e.encounterType,
      provider: e.provider,
      pages: e.pageRanges
    }))
  };

  // Save chunk results to database
  await saveChunkResults({
    sessionId,
    chunkNumber,
    pageStart: pageRange[0],
    pageEnd: pageRange[1],
    aiModel: aiResponse.model,
    inputTokens: aiResponse.inputTokens,
    outputTokens: aiResponse.outputTokens,
    cost: aiResponse.cost,
    handoffReceived,
    handoffGenerated,
    encountersCompleted: completedEncounters.length,
    encountersPending: pendingEncounter ? 1 : 0,
    aiResponseRaw: parsed
  });

  return {
    completedEncounters,
    pendingEncounter,
    handoffGenerated,
    metrics: {
      inputTokens: aiResponse.inputTokens,
      outputTokens: aiResponse.outputTokens,
      cost: aiResponse.cost,
      confidence: calculateAverageConfidence(completedEncounters)
    }
  };
}

// ============================================================================
// Prompt Builder
// ============================================================================

/**
 * Build progressive prompt with handoff context
 */
function buildProgressivePrompt(params: {
  pages: OCRPage[];
  pageRange: [number, number];
  totalPages: number;
  chunkNumber: number;
  totalChunks: number;
  handoffContext: HandoffPackage | null;
}): string {
  const { pages, pageRange, totalPages, chunkNumber, totalChunks, handoffContext } = params;

  return `
# Progressive Document Processing - Chunk ${chunkNumber} of ${totalChunks}

You are analyzing pages ${pageRange[0] + 1} to ${pageRange[1]} of a ${totalPages}-page medical document.

## Context from Previous Chunk

${handoffContext ? formatHandoffContext(handoffContext) : 'This is the first chunk - no previous context.'}

## Your Tasks

${handoffContext?.pendingEncounter ? `
### 1. Complete Pending Encounter
Complete the encounter "${handoffContext.pendingEncounter.tempId}" using the context provided.
- Started on page ${handoffContext.pendingEncounter.startPage}
- Partial data: ${JSON.stringify(handoffContext.pendingEncounter.partialData)}
- Expected: ${handoffContext.pendingEncounter.expectedContinuation || 'continuation of medical information'}
- Mark as "complete" if it ends in your pages, or "continuing" if it extends beyond page ${pageRange[1]}
` : ''}

### ${handoffContext?.pendingEncounter ? '2' : '1'}. Identify New Encounters
Extract all encounters that START in pages ${pageRange[0] + 1} to ${pageRange[1]}.

### ${handoffContext?.pendingEncounter ? '3' : '2'}. Prepare Handoff
If any encounter continues beyond page ${pageRange[1]}, mark it as "continuing" and provide:
- All data collected so far
- Last 500 characters of relevant text
- Expected continuation type (lab_results, treatment_plan, etc.)

## Output Format

{
  "continuation_data": { /* Data to complete pending encounter */ },
  "encounters": [
    {
      "status": "complete" | "continuing",
      "tempId": "encounter_temp_xxx", // Only for continuing
      "encounter_type": "...",
      "encounter_start_date": "YYYY-MM-DD",
      "provider_name": "...",
      // ... other fields
      "page_ranges": [12, 13],
      "expectedContinuation": "lab_results" // Only for continuing
    }
  ],
  "activeContext": {
    "currentAdmission": { /* If patient is currently admitted */ },
    "recentLabOrders": [ /* Recent lab orders */ ],
    "activeProviders": ["Dr. Smith", "Dr. Jones"],
    "documentFlow": "chronological" | "mixed",
    "lastConfidentDate": "2024-03-15"
  }
}

## OCR Text for Your Pages

${formatOCRPages(pages)}
`;
}

function formatHandoffContext(handoff: HandoffPackage): string {
  let context = '';

  if (handoff.pendingEncounter) {
    context += `
**Pending Encounter to Complete:**
- ID: ${handoff.pendingEncounter.tempId}
- Type: ${handoff.pendingEncounter.encounterType || 'unknown'}
- Provider: ${handoff.pendingEncounter.provider || 'unknown'}
- Started Page: ${handoff.pendingEncounter.startPage}
- Last Context: "${handoff.pendingEncounter.lastSeenContext}"
`;
  }

  if (handoff.activeContext.currentAdmission) {
    context += `
**Active Hospital Admission:**
- Facility: ${handoff.activeContext.currentAdmission.facility}
- Admit Date: ${handoff.activeContext.currentAdmission.admitDate}
`;
  }

  if (handoff.recentEncountersSummary.length > 0) {
    context += `
**Recent Encounters:**
${handoff.recentEncountersSummary.map(e =>
  `- ${e.date}: ${e.type} with ${e.provider} (pages ${e.pages.join(', ')})`
).join('\n')}
`;
  }

  return context;
}

function formatOCRPages(pages: OCRPage[]): string {
  return pages.map(page => `
--- PAGE ${page.pageNumber} START (Confidence: ${(page.confidence * 100).toFixed(0)}%) ---
${page.text}
--- PAGE ${page.pageNumber} END ---
`).join('\n\n');
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractLastContext(pages: OCRPage[], maxChars: number): string {
  const allText = pages.map(p => p.text).join(' ');
  return allText.slice(-maxChars);
}

async function tryCompletePendingEncounter(
  pending: HandoffPackage['pendingEncounter'],
  continuationData: any,
  currentPages: OCRPage[]
): Promise<Encounter | null> {
  // Merge pending data with continuation data
  const merged = {
    ...pending.partialData,
    ...continuationData
  };

  // Check if encounter is complete (has all required fields)
  if (isEncounterComplete(merged)) {
    return merged as Encounter;
  }

  return null;
}

function isEncounterComplete(encounter: any): boolean {
  // Check if all required fields are present
  // NOTE: AI response uses snake_case, normalize to camelCase at parse boundary
  // This function expects camelCase after normalization
  return !!(
    encounter.encounterType &&
    encounter.encounterStartDate &&
    encounter.provider &&
    encounter.pageRanges?.length > 0
  );
}

function calculateAverageConfidence(encounters: Encounter[]): number {
  if (encounters.length === 0) return 0;
  const sum = encounters.reduce((acc, e) => acc + (e.confidence || 0), 0);
  return sum / encounters.length;
}

// ============================================================================
// Database Functions (Stubs - implement with actual DB calls)
// ============================================================================

async function initializeProgressiveSession(
  shellFileId: string,
  patientId: string,
  totalPages: number,
  chunkSize: number
): Promise<ProgressiveSession> {
  const totalChunks = Math.ceil(totalPages / chunkSize);

  // INSERT INTO pass05_progressive_sessions ...
  // Return session object

  return {
    id: 'session_uuid',
    shellFileId,
    totalPages,
    chunkSize,
    totalChunks
  };
}

async function updateSessionProgress(
  sessionId: string,
  chunkNumber: number,
  handoffPackage: HandoffPackage,
  metrics: any
): Promise<void> {
  // UPDATE pass05_progressive_sessions
  // SET current_chunk = ?, current_handoff_package = ?
}

async function saveChunkResults(params: any): Promise<void> {
  // INSERT INTO pass05_chunk_results ...
}

async function savePendingEncounter(
  sessionId: string,
  pending: HandoffPackage['pendingEncounter']
): Promise<void> {
  // INSERT INTO pass05_pending_encounters ...
}

async function finalizePendingEncounters(sessionId: string): Promise<Encounter[]> {
  // SELECT * FROM pass05_pending_encounters WHERE status = 'pending'
  // For each, create final encounter or flag for manual review
  return [];
}

async function finalizeSession(sessionId: string): Promise<void> {
  // Call finalize_progressive_session() database function
}

async function markSessionFailed(sessionId: string, error: string): Promise<void> {
  // UPDATE pass05_progressive_sessions SET processing_status = 'failed'
}
