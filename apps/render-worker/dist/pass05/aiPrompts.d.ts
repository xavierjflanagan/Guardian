/**
 * AI Prompt Design for Pass 0.5
 * Healthcare Encounter Discovery
 *
 * VERSION HISTORY:
 * v1 (original) - Backed up as aiPrompts.v1.ts
 * v2.0 (Nov 2, 2025 10:20 AM) - Added Scenario D: Metadata Page Recognition (INITIAL)
 *    - Fixes Test 06 boundary detection issue (detected 11/12, should be 13/14)
 *    - Added weighted boundary signal priority
 *    - Added guidance: metadata pages belong to PRECEDING document
 *    - ISSUE: Too specific to Test 06 structure, assumed metadata always at end
 * v2.1 (Nov 2, 2025 10:30 AM) - Made metadata guidance GENERAL and context-based
 *    - Changed from position-based ("PRECEDING") to context-based (provider continuity)
 *    - Added Pattern A/B/C examples covering metadata at start/end/middle
 *    - Key principle: Use provider/facility matching, not page position
 *    - Handles metadata as cover pages, signature blocks, or between sections
 */
import { OCRPage } from './types';
export interface PromptInput {
    fullText: string;
    pageCount: number;
    ocrPages: OCRPage[];
}
/**
 * Build prompt for encounter discovery (Task 1)
 * GPT-5-mini text analysis
 */
export declare function buildEncounterDiscoveryPrompt(input: PromptInput): string;
//# sourceMappingURL=aiPrompts.d.ts.map