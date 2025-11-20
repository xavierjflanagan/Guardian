/**
 * Cascade Context Builder (Strategy A)
 *
 * STRATEGY A SIMPLIFICATION:
 * - Old v2.9 handoff system: Complex context packages with active providers,
 *   recent encounter summaries, document flow patterns, temporal anchoring
 * - Strategy A cascade system: Simple cascade context strings for AI continuity
 *
 * This builder creates minimal context for cascading encounters only.
 * All other cross-chunk context is handled by the cascade reconciliation system.
 */

import { HandoffPackage } from './types';

export interface CascadeContextInput {
  cascadingEncounters: Array<{
    pending_id: string;
    cascade_id: string;
    encounter_type: string;
    summary?: string;
    expected_continuation?: string;
    cascade_context?: string;
  }>;
  chunkNumber: number;
}

/**
 * Build cascade context package for next chunk
 *
 * STRATEGY A: Only includes context for encounters that are CASCADING
 * (touching the chunk boundary). All completed encounters are ignored.
 */
export function buildCascadeContext(input: CascadeContextInput): HandoffPackage | null {
  const { cascadingEncounters, chunkNumber } = input;

  // No cascading encounters = no handoff package needed
  if (cascadingEncounters.length === 0) {
    return null;
  }

  // Build simple cascade context for each cascading encounter
  // This tells the next chunk what to expect
  const cascadeContexts = cascadingEncounters.map(enc => ({
    cascade_id: enc.cascade_id,
    pending_id: enc.pending_id,
    encounter_type: enc.encounter_type,
    partial_summary: enc.summary || 'No summary available',
    expected_in_next_chunk: enc.expected_continuation || 'Continuation of encounter',
    ai_context: enc.cascade_context || `Encounter started in chunk ${chunkNumber}, continues into next chunk`
  }));

  // STRATEGY A: Minimal handoff package
  // Just enough context for AI to recognize cascade continuations
  return {
    // Legacy field (will be removed in future types.ts update)
    pendingEncounter: undefined,

    // Legacy field (will be removed in future types.ts update)
    activeContext: undefined,

    // Legacy field (will be removed in future types.ts update)
    recentEncountersSummary: undefined,

    // STRATEGY A: Cascade contexts only
    cascadeContexts
  };
}

/**
 * DEPRECATED: Old v2.9 handoff builder (replaced by buildCascadeContext)
 *
 * This function is kept for backward compatibility during Strategy A migration.
 * DO NOT USE for new Strategy A code.
 */
export interface HandoffBuilderInput {
  pendingEncounter: HandoffPackage['pendingEncounter'] | null;
  completedEncounters: any[];
  activeContext?: any;
  chunkNumber: number;
}

export function buildHandoffPackage(input: HandoffBuilderInput): HandoffPackage {
  console.warn('[handoff-builder] buildHandoffPackage is DEPRECATED. Use buildCascadeContext for Strategy A.');

  // Return minimal package for v2.9 compatibility
  return {
    pendingEncounter: input.pendingEncounter || undefined,
    activeContext: undefined,
    recentEncountersSummary: undefined
  };
}
