/**
 * OCR-Optimized Prompt for Pass 0.5 Encounter Discovery
 *
 * Target: 85-90% accuracy using text patterns only
 * Input: OCR-extracted text (no visual information)
 * Model: GPT-5-mini (text-only)
 *
 * Key Changes from Original:
 * - Removed all visual cues (formatting, letterhead, page breaks)
 * - Focus on text patterns and markers
 * - Header detection in text
 * - Section marker detection
 * - Date clustering analysis
 * - Reduced redundancy (150 lines vs 370)
 */
import { OCRPage } from './types';
export interface PromptInput {
    fullText: string;
    pageCount: number;
    ocrPages: OCRPage[];
}
/**
 * Build OCR-optimized prompt for encounter discovery
 */
export declare function buildOCROptimizedPrompt(input: PromptInput): string;
//# sourceMappingURL=aiPromptsOCR.d.ts.map