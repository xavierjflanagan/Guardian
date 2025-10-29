/**
 * Manifest Builder for Pass 0.5
 * Parses AI response and enriches with spatial bbox data from OCR
 *
 * FIX #3: PageRanges normalization (sort + fix inverted ranges)
 * FIX #4: Type safety for encounterType (validation)
 */
import { EncounterMetadata, GoogleCloudVisionOCR } from './types';
/**
 * Parse AI response and enrich with spatial bbox data from OCR
 * Note: Idempotency handled at runPass05() level
 */
export declare function parseEncounterResponse(aiResponse: string, ocrOutput: GoogleCloudVisionOCR, patientId: string, shellFileId: string): Promise<{
    encounters: EncounterMetadata[];
}>;
//# sourceMappingURL=manifestBuilder.d.ts.map