/**
 * Task 1: Healthcare Encounter Discovery - STRATEGY A (V11)
 *
 * STRATEGY A (V11):
 * - ALL documents use progressive mode (no page threshold)
 * - Cascade-based encounter continuity
 * - All encounters created as "pendings" first, reconciled later
 * - Uses aiPrompts.v11.ts via chunk-processor.ts
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
 * STRATEGY A (v11): Extract healthcare encounters using universal progressive mode
 *
 * All documents (1-1000+ pages) use the same progressive pipeline:
 * - Chunks documents into 50-page batches
 * - Processes each chunk with aiPrompts.v11 (cascade-aware)
 * - Creates pending encounters during processing
 * - Reconciles all pendings after all chunks complete
 */
export declare function discoverEncounters(input: EncounterDiscoveryInput): Promise<EncounterDiscoveryOutput>;
//# sourceMappingURL=encounterDiscovery.d.ts.map