/**
 * Cascade Manager - Strategy A
 *
 * Purpose: Manage cascade ID generation and cascade chain tracking for encounters
 *          spanning multiple chunks in progressive processing.
 *
 * Source: File 05 (CASCADE-IMPLEMENTATION.md)
 * Complexity: MEDIUM
 *
 * Key Concepts:
 * - Cascade: An encounter that spans multiple chunks (e.g., starts in chunk 2, ends in chunk 4)
 * - Cascade ID: Deterministic identifier linking all pending encounters in the same cascade
 * - Cascade Chain: Database record tracking cascade from origin to completion
 *
 * Integration:
 * - Called by chunk-processor.ts during pending encounter creation
 * - Called by pending-reconciler.ts after final encounter creation
 * - Writes to pass05_cascade_chains table
 */

import { createHash } from 'crypto';
import {
  trackCascadeChain,
  incrementCascadePendingCount,
  completeCascadeChain,
  getCascadeChainById,
  getIncompleteCascades as getIncompleteCascadesDb
} from './database';
import { CascadeChain } from './types';

/**
 * AI encounter from prompt response
 * Minimal interface for cascade detection
 */
interface AIEncounter {
  is_cascading: boolean;
  end_boundary_type: 'inter_page' | 'intra_page';
  end_page: number;
  encounter_type: string;
}

/**
 * Generate deterministic cascade ID
 *
 * Format: cascade_{sessionId}_{chunkNum}_{encounterIndex}_{hash}
 *
 * Example: cascade_abc123_2_0_a1b2c3d4
 *
 * CRITICAL: For cascade continuations, you MUST use the ORIGIN chunk number,
 * not the current chunk number, to generate the same ID!
 *
 * @example
 * // New cascade in chunk 2:
 * const id = generateCascadeId(sessionId, 2, 0, 'admission');
 *
 * // Continuation in chunk 3 - MUST use origin chunk 2:
 * const sameId = generateCascadeId(sessionId, 2, 0, 'admission'); // ✅ Correct
 * const wrongId = generateCascadeId(sessionId, 3, 0, 'admission'); // ❌ Wrong - different ID!
 *
 * @param sessionId - UUID of the progressive session
 * @param chunkNumber - Which chunk this cascade ORIGINATED in (1-indexed)
 * @param encounterIndex - Position of encounter within ORIGIN chunk (0-indexed)
 * @param encounterType - Type of encounter (for hash uniqueness)
 * @returns Deterministic cascade ID
 */
export function generateCascadeId(
  sessionId: string,
  chunkNumber: number,
  encounterIndex: number,
  encounterType: string
): string {
  // Create 8-character hash for uniqueness
  const hash = createHash('md5')
    .update(`${sessionId}_${chunkNumber}_${encounterIndex}_${encounterType}`)
    .digest('hex')
    .substring(0, 8);

  return `cascade_${sessionId}_${chunkNumber}_${encounterIndex}_${hash}`;
}

/**
 * Generate deterministic pending ID
 *
 * Format: pending_{sessionPrefix}_{chunkNum}_{index}
 *
 * Example: pending_abc12345_002_000
 *
 * The pending ID uniquely identifies a pending encounter within a session.
 * Unlike cascade IDs (which stay constant across chunks for the same logical encounter),
 * each pending gets its own unique ID based on where it appears in the session.
 *
 * @param sessionId - UUID of the progressive session
 * @param chunkNumber - Which chunk this pending is in (1-indexed)
 * @param encounterIndex - Position of encounter within chunk (0-indexed)
 * @returns Deterministic pending ID
 */
export function generatePendingId(
  sessionId: string,
  chunkNumber: number,
  encounterIndex: number
): string {
  const sessionPrefix = sessionId.substring(0, 8);
  const chunk = String(chunkNumber).padStart(3, '0');
  const idx = String(encounterIndex).padStart(3, '0');
  return `pending_${sessionPrefix}_${chunk}_${idx}`;
}

/**
 * Determine if encounter should cascade to next chunk
 *
 * V2 Logic with inter/intra boundary awareness:
 * 1. Check AI's is_cascading flag (primary signal)
 * 2. Validate: encounter must touch chunk boundary
 * 3. Validate: not the last chunk (nothing to cascade to)
 *
 * @param encounter - AI-extracted encounter with position data
 * @param chunkNumber - Current chunk number (1-indexed)
 * @param totalChunks - Total chunks in session
 * @param lastPageOfChunk - Last page number in current chunk (1-indexed)
 * @returns True if encounter should cascade to next chunk
 */
export function shouldCascade(
  encounter: AIEncounter,
  chunkNumber: number,
  totalChunks: number,
  lastPageOfChunk: number
): boolean {
  // Cannot cascade from last chunk (nowhere to cascade to)
  if (chunkNumber >= totalChunks) {
    return false;
  }

  // Primary signal: AI detected cascading encounter
  if (encounter.is_cascading) {
    return true;
  }

  // Additional validation: encounter touches chunk boundary at page level
  // This catches cases where AI might have missed the cascading flag
  if (
    encounter.end_boundary_type === 'inter_page' &&
    encounter.end_page === lastPageOfChunk
  ) {
    return true; // Encounter ends exactly at chunk boundary
  }

  return false;
}

/**
 * Track new cascade in database
 *
 * Creates initial cascade chain record when a cascading encounter is first detected.
 * Record will be updated during reconciliation when cascade completes.
 *
 * @param cascadeId - Unique cascade identifier
 * @param sessionId - UUID of progressive session
 * @param originChunk - Chunk number where cascade started (1-indexed)
 * @throws Error if database insert fails
 */
export async function trackCascade(
  cascadeId: string,
  sessionId: string,
  originChunk: number
): Promise<void> {
  // DEBT-002: Delegate to database.ts helper
  await trackCascadeChain(cascadeId, sessionId, originChunk);
}

/**
 * Increment pending count for existing cascade
 *
 * Called when a continuation encounter is detected in a subsequent chunk.
 * Updates the cascade chain to reflect that another pending was added to the chain.
 *
 * @param cascadeId - Unique cascade identifier
 * @throws Error if database update fails
 */
export async function incrementCascadePendings(
  cascadeId: string
): Promise<void> {
  // DEBT-002: Delegate to database.ts helper
  await incrementCascadePendingCount(cascadeId);
}

/**
 * Complete cascade after reconciliation
 *
 * Updates cascade chain with final encounter ID and completion metadata.
 * Called by pending-reconciler.ts after creating the final healthcare_encounter.
 *
 * Validates that pendingsCount matches or exceeds the tracked count to prevent
 * data loss from incorrect caller logic.
 *
 * @param cascadeId - Unique cascade identifier
 * @param lastChunk - Chunk number where cascade ended (1-indexed)
 * @param finalEncounterId - UUID of final healthcare_encounter created
 * @param pendingsCount - Total number of pendings merged into final encounter
 * @throws Error if database update fails or validation fails
 */
export async function completeCascade(
  cascadeId: string,
  lastChunk: number,
  finalEncounterId: string,
  pendingsCount: number
): Promise<void> {
  // DEBT-002: Delegate to database.ts helper
  await completeCascadeChain(cascadeId, lastChunk, finalEncounterId, pendingsCount);
}

/**
 * Get cascade chain by ID
 *
 * Retrieves cascade chain record for debugging or reconciliation logic.
 *
 * @param cascadeId - Unique cascade identifier
 * @returns Cascade chain record or null if not found
 * @throws Error if database query fails
 */
export async function getCascadeChain(
  cascadeId: string
): Promise<CascadeChain | null> {
  // DEBT-002: Delegate to database.ts helper
  return await getCascadeChainById(cascadeId);
}

/**
 * Get all incomplete cascades for a session
 *
 * Used by reconciliation to find all cascades that need to be completed.
 * Incomplete cascades have final_encounter_id = NULL.
 *
 * @param sessionId - UUID of progressive session
 * @returns Array of incomplete cascade chains
 * @throws Error if database query fails
 */
export async function getIncompleteCascades(
  sessionId: string
): Promise<CascadeChain[]> {
  // DEBT-002: Delegate to database.ts helper
  return await getIncompleteCascadesDb(sessionId);
}
