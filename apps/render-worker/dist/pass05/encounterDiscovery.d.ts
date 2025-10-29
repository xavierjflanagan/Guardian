/**
 * Task 1: Healthcare Encounter Discovery
 * Uses GPT-4o-mini (text-only, not vision)
 */
import { GoogleCloudVisionOCR, EncounterMetadata } from './types';
export interface EncounterDiscoveryInput {
    shellFileId: string;
    patientId: string;
    ocrOutput: GoogleCloudVisionOCR;
    pageCount: number;
}
export interface EncounterDiscoveryOutput {
    success: boolean;
    encounters?: EncounterMetadata[];
    error?: string;
    aiModel: string;
    aiCostUsd: number;
    inputTokens: number;
    outputTokens: number;
}
/**
 * Task 1: Extract healthcare encounters from OCR text
 * Uses GPT-4o-mini (text-only, not vision)
 */
export declare function discoverEncounters(input: EncounterDiscoveryInput): Promise<EncounterDiscoveryOutput>;
//# sourceMappingURL=encounterDiscovery.d.ts.map