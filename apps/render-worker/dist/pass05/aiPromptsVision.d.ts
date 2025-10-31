/**
 * Vision-Optimized Prompt for Pass 0.5 Encounter Discovery
 *
 * Target: 95%+ accuracy using visual document understanding
 * Input: Raw medical document images
 * Model: GPT-5-mini vision (vision-capable)
 *
 * Key Changes from Original:
 * - Leverages visual understanding (letterheads, formatting, layout)
 * - Document boundary detection via visual cues
 * - Table and structure detection
 * - Page break and formatting change detection
 * - ~200 lines (focused on visual analysis)
 */
export interface VisionPromptInput {
    pageCount: number;
}
/**
 * Build vision-optimized prompt for encounter discovery
 */
export declare function buildVisionPrompt(input: VisionPromptInput): string;
//# sourceMappingURL=aiPromptsVision.d.ts.map