/**
 * AI Prompt Design for Pass 0.5
 * Healthcare Encounter Discovery
 */
import { OCRPage } from './types';
export interface PromptInput {
    fullText: string;
    pageCount: number;
    ocrPages: OCRPage[];
}
/**
 * Build prompt for encounter discovery (Task 1)
 * GPT-4o-mini text analysis
 */
export declare function buildEncounterDiscoveryPrompt(input: PromptInput): string;
//# sourceMappingURL=aiPrompts.d.ts.map