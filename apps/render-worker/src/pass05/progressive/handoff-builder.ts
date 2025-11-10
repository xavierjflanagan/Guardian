/**
 * Handoff Package Builder
 * Creates context packages to pass between chunks
 */

import { HandoffPackage } from './types';
import { EncounterMetadata } from '../types';

export interface HandoffBuilderInput {
  pendingEncounter: HandoffPackage['pendingEncounter'] | null;
  completedEncounters: EncounterMetadata[];
  activeContext?: any;
  chunkNumber: number;
}

/**
 * Build handoff package for next chunk
 */
export function buildHandoffPackage(input: HandoffBuilderInput): HandoffPackage {
  const { pendingEncounter, completedEncounters, activeContext } = input;

  // Extract active providers from recent encounters
  const activeProviders = extractActiveProviders(completedEncounters);

  // Get recent encounters summary (last 3)
  const recentEncountersSummary = buildRecentSummary(completedEncounters);

  // Determine document flow pattern
  const documentFlow = inferDocumentFlow(completedEncounters);

  // Extract last confident date for temporal anchoring
  const lastConfidentDate = extractLastConfidentDate(completedEncounters);

  // Build active context
  const activeCtx: HandoffPackage['activeContext'] = {
    currentAdmission: activeContext?.current_admission ? {
      facility: activeContext.current_admission.facility,
      admitDate: activeContext.current_admission.admit_date,
      expectedDischargeInfo: activeContext.current_admission.expected_discharge_info
    } : undefined,

    recentLabOrders: activeContext?.recent_lab_orders?.map((lab: any) => ({
      orderedDate: lab.ordered_date,
      tests: lab.tests || [],
      provider: lab.provider
    })) || [],

    activeProviders,
    documentFlow,
    lastConfidentDate
  };

  return {
    pendingEncounter: pendingEncounter || undefined,
    activeContext: activeCtx,
    recentEncountersSummary
  };
}

/**
 * Extract unique provider names from recent encounters
 */
function extractActiveProviders(encounters: EncounterMetadata[]): string[] {
  const providers = new Set<string>();

  // Get last 5 encounters
  const recent = encounters.slice(-5);

  for (const enc of recent) {
    if (enc.provider) {
      providers.add(enc.provider);
    }
  }

  return Array.from(providers);
}

/**
 * Build summary of recent encounters (last 3)
 */
function buildRecentSummary(encounters: EncounterMetadata[]): HandoffPackage['recentEncountersSummary'] {
  const recent = encounters.slice(-3);

  return recent.map(enc => ({
    date: enc.dateRange?.start || 'unknown',
    type: enc.encounterType,
    provider: enc.provider || 'unknown',
    pages: flattenPageRanges(enc.pageRanges)
  }));
}

/**
 * Flatten page ranges to simple array
 * [[1, 3], [5, 7]] → [1, 2, 3, 5, 6, 7]
 */
function flattenPageRanges(pageRanges: number[][]): number[] {
  const pages: number[] = [];

  for (const range of pageRanges) {
    const [start, end] = range;
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
  }

  return pages;
}

/**
 * Infer document flow pattern from encounter order
 */
function inferDocumentFlow(encounters: EncounterMetadata[]): 'chronological' | 'mixed' | 'by_provider' {
  if (encounters.length < 3) {
    return 'mixed'; // Not enough data
  }

  // Check if dates are in chronological order
  const dates = encounters
    .filter(e => e.dateRange?.start)
    .map(e => new Date(e.dateRange!.start).getTime());

  if (dates.length < 3) {
    return 'mixed';
  }

  // Check chronological order
  let isChronological = true;
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] < dates[i - 1]) {
      isChronological = false;
      break;
    }
  }

  if (isChronological) {
    return 'chronological';
  }

  // Check if grouped by provider
  const providers = encounters
    .filter(e => e.provider)
    .map(e => e.provider!);

  if (providers.length < 3) {
    return 'mixed';
  }

  // Count provider transitions
  let transitions = 0;
  for (let i = 1; i < providers.length; i++) {
    if (providers[i] !== providers[i - 1]) {
      transitions++;
    }
  }

  // If fewer transitions than encounters, likely grouped by provider
  const transitionRatio = transitions / (providers.length - 1);
  if (transitionRatio < 0.5) {
    return 'by_provider';
  }

  return 'mixed';
}

/**
 * Extract the most recent confident date for temporal anchoring
 */
function extractLastConfidentDate(encounters: EncounterMetadata[]): string | undefined {
  // Iterate backwards to find most recent high-confidence date
  for (let i = encounters.length - 1; i >= 0; i--) {
    const enc = encounters[i];
    if (enc.dateRange?.start && enc.confidence >= 0.8) {
      return enc.dateRange.start;
    }
  }

  return undefined;
}
