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

    // For multi-chunk files, infer status from page boundaries
    const lastPageRange = enc.pageRanges?.[enc.pageRanges.length - 1];
    if (!lastPageRange) {
      // No page ranges, assume complete
      return {
        ...enc,
        status: enc.status || 'complete'
      };
    }

    const encounterLastPage = lastPageRange[1];

    // Check if encounter ends at chunk boundary and we're not on last chunk
    if (encounterLastPage === chunkEndPage && !isLastChunk) {
      // Encounter likely continues to next chunk
      console.log(`[Post-processor] Encounter ${enc.encounterId} ends at chunk boundary (page ${encounterLastPage}), marking as continuing`);

      return {
        ...enc,
        status: 'continuing',
        tempId: enc.tempId || `encounter_temp_${chunkNumber}_${enc.encounterId}`,
        expectedContinuation: enc.expectedContinuation || inferExpectedContinuation(enc)
      };
    }

    // Encounter ends before chunk boundary or we're on last chunk
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

    // Ensure tempId exists
    if (!pending.tempId) {
      console.warn('[Post-processor] Pending encounter missing tempId, generating one');
      pending.tempId = `encounter_temp_generated_${Date.now()}`;
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