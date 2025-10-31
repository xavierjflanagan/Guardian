/**
 * Task 1: Healthcare Encounter Discovery
 *
 * Strategy Selection (via PASS_05_STRATEGY env var):
 * - 'ocr' (default): Current baseline prompt with OCR text (gpt-5-mini)
 * - 'ocr_optimized': OCR-optimized prompt focused on text patterns (gpt-5-mini)
 * - 'vision': Vision-optimized prompt with raw images (gpt-5-mini vision) - NOT YET IMPLEMENTED
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
 * Strategy selected via PASS_05_STRATEGY environment variable
 */
export declare function discoverEncounters(input: EncounterDiscoveryInput): Promise<EncounterDiscoveryOutput>;
//# sourceMappingURL=encounterDiscovery.d.ts.map