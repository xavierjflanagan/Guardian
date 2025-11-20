/**
 * Task 1: Healthcare Encounter Discovery
 *
 * Strategy Selection (via PASS_05_STRATEGY env var):
 * - 'ocr' (default): Current baseline prompt with OCR text (gpt-5-mini)
 * - 'vision': Vision-optimized prompt with raw images (gpt-5-mini vision) - NOT YET IMPLEMENTED
 *
 * Version Selection (via PASS_05_VERSION env var):
 * - 'v2.4' (default): Current production prompt (v2.4)
 * - 'v2.7': Optimized prompt with Phase 1 improvements (token reduction, linear flow)
 * - 'v2.8': Further optimizations
 * - 'v2.9': Latest optimizations
 * - 'v11': Strategy A (universal progressive, cascade-based)
 *
 * STRATEGY A (V11):
 * - ALL documents use progressive mode (no page threshold)
 * - Cascade-based encounter continuity (not handoff-based)
 * - All encounters created as "pendings" first, reconciled later
 */
import { GoogleCloudVisionOCR, EncounterMetadata, PageAssignment } from './types';
export interface EncounterDiscoveryInput {
    shellFileId: string;
    patientId: string;
    ocrOutput: GoogleCloudVisionOCR;
    pageCount: number;
}
export interface EncounterDiscoveryOutput {
    success: boolean;
    encounters?: EncounterMetadata[];
    page_assignments?: PageAssignment[];
    error?: string;
    aiModel: string;
    aiCostUsd: number;
    inputTokens: number;
    outputTokens: number;
}
/**
 * Task 1: Extract healthcare encounters from OCR text
 * Strategy selected via PASS_05_STRATEGY environment variable
 * Progressive mode automatically enabled for documents >100 pages
 */
export declare function discoverEncounters(input: EncounterDiscoveryInput): Promise<EncounterDiscoveryOutput>;
//# sourceMappingURL=encounterDiscovery.d.ts.map