/**
 * Post-Processor for v10 Universal Prompt
 *
 * Handles status inference and field cleanup after AI processing.
 * This ensures consistent handling regardless of whether AI follows
 * the status field instructions.
 *
 * Key responsibilities:
 * 1. Infer status from encounter boundaries and chunk position
 * 2. Clean up progressive fields for single-chunk files
 * 3. Ensure handoff data is properly formatted
 */

export interface PostProcessConfig {
  encounters: any[];
  chunkNumber: number;
  totalChunks: number;
  chunkStartPage: number;
  chunkEndPage: number;
  isLastChunk: boolean;
}

/**
 * Post-process AI response to ensure proper status and handoff data
 *
 * Strategy:
 * - Don't rely on AI providing status field
 * - Infer from encounter page boundaries
 * - Clean up for single-chunk files
 */
export function postProcessEncounters(config: PostProcessConfig): any[] {
  const {
    encounters,
    chunkNumber,
    totalChunks,
    chunkEndPage,
    isLastChunk
  } = config;

  return encounters.map(enc => {
    // For single-chunk files, force complete status and clean up
    if (totalChunks === 1) {
      return {
        ...enc,
        status: 'complete',
        tempId: null,
        expectedContinuation: null
      };
    }

    // For multi-chunk files, infer status from multiple indicators
    const lastPageRange = enc.pageRanges?.[enc.pageRanges.length - 1];
    if (!lastPageRange) {
      // No page ranges, assume complete
      return {
        ...enc,
        status: enc.status || 'complete'
      };
    }

    const encounterLastPage = lastPageRange[1];

    // If we're on the last chunk, allow complete status
    if (isLastChunk) {
      return {
        ...enc,
        status: 'complete',
        tempId: null,
        expectedContinuation: null
      };
    }

    // NOT last chunk - check multiple indicators for continuation
    const touchesChunkBoundary = encounterLastPage === chunkEndPage;
    const hasExpectedContinuation = !!enc.expectedContinuation;
    const missingEndDate = !enc.encounterEndDate && enc.encounterTimeframeStatus !== 'completed';
    const explicitlyContinuing = enc.status === 'continuing';

    // Force 'continuing' status if ANY indicator suggests the encounter spans chunks
    const shouldContinue = touchesChunkBoundary || hasExpectedContinuation || missingEndDate || explicitlyContinuing;

    if (shouldContinue) {
      // Encounter likely continues to next chunk
      const tempIdSuffix = enc.encounterId || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const generatedTempId = `encounter_temp_chunk${chunkNumber}_${tempIdSuffix}`;

      const reasons = [];
      if (touchesChunkBoundary) reasons.push(`page ${encounterLastPage} = chunk end`);
      if (hasExpectedContinuation) reasons.push(`expected: ${enc.expectedContinuation}`);
      if (missingEndDate) reasons.push('no end date');
      if (explicitlyContinuing) reasons.push('AI marked continuing');

      console.log(`[Post-processor] Encounter marked as continuing (${reasons.join(', ')}) with tempId: ${generatedTempId}`);

      return {
        ...enc,
        status: 'continuing',
        tempId: enc.tempId || generatedTempId,
        expectedContinuation: enc.expectedContinuation || inferExpectedContinuation(enc)
      };
    }

    // Encounter is fully contained within this chunk - allow 'complete'
    console.log(`[Post-processor] Encounter fully contained (ends at page ${encounterLastPage}, chunk ends at ${chunkEndPage}), marking as complete`);
    return {
      ...enc,
      status: 'complete',
      tempId: null,
      expectedContinuation: null
    };
  });
}

/**
 * Infer what type of content might continue in next chunk
 */
function inferExpectedContinuation(encounter: any): string {
  const encounterType = encounter.encounterType?.toLowerCase() || '';

  if (encounterType.includes('admission') || encounterType.includes('inpatient')) {
    return 'discharge_summary';
  }
  if (encounterType.includes('surgery') || encounterType.includes('procedure')) {
    return 'post_operative_notes';
  }
  if (encounterType.includes('emergency')) {
    return 'disposition_or_admission';
  }
  if (encounterType.includes('consultation')) {
    return 'recommendations';
  }
  if (encounterType.includes('diagnostic') || encounterType.includes('imaging')) {
    return 'results_or_report';
  }

  return 'continuation';
}

/**
 * Validate and fix handoff package
 */
export function validateHandoffPackage(handoff: any): any {
  if (!handoff) return null;

  // Ensure required fields for pending encounter
  if (handoff.pendingEncounter) {
    const pending = handoff.pendingEncounter;

    // Ensure tempId exists and doesn't contain "undefined"
    if (!pending.tempId || pending.tempId.includes('undefined')) {
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substr(2, 9);
      pending.tempId = `encounter_temp_generated_${timestamp}_${randomSuffix}`;
      console.warn(`[Post-processor] Pending encounter had invalid tempId, generated new one: ${pending.tempId}`);
    }

    // Ensure expectedContinuation exists
    if (!pending.expectedContinuation) {
      pending.expectedContinuation = inferExpectedContinuation(pending.partialData || pending);
    }
  }

  return handoff;
}

/**
 * Clean up response for final output
 */
export function cleanupForOutput(encounters: any[], isSingleChunk: boolean): any[] {
  if (!isSingleChunk) {
    return encounters; // Keep all fields for multi-chunk
  }

  // For single-chunk files, remove progressive fields
  return encounters.map(enc => {
    const cleaned = { ...enc };
    delete cleaned.status;
    delete cleaned.tempId;
    delete cleaned.expectedContinuation;
    return cleaned;
  });
}