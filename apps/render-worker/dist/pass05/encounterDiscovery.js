"use strict";
/**
 * Task 1: Healthcare Encounter Discovery
 *
 * Strategy Selection (via PASS_05_STRATEGY env var):
 * - 'ocr' (default): Current baseline prompt with OCR text (gpt-5-mini)
 * - 'ocr_optimized': OCR-optimized prompt focused on text patterns (gpt-5-mini)
 * - 'vision': Vision-optimized prompt with raw images (gpt-5-mini vision) - NOT YET IMPLEMENTED
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverEncounters = discoverEncounters;
const openai_1 = __importDefault(require("openai"));
const aiPrompts_1 = require("./aiPrompts");
const aiPromptsOCR_1 = require("./aiPromptsOCR");
// import { buildVisionPrompt } from './aiPromptsVision'; // For future Vision implementation
const manifestBuilder_1 = require("./manifestBuilder");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
/**
 * Task 1: Extract healthcare encounters from OCR text
 * Strategy selected via PASS_05_STRATEGY environment variable
 */
async function discoverEncounters(input) {
    try {
        // Read strategy from environment variable (defaults to 'ocr')
        const strategy = (process.env.PASS_05_STRATEGY || 'ocr');
        console.log(`[Pass 0.5] Using strategy: ${strategy}`);
        // Vision strategy requires image loading infrastructure (not yet implemented)
        if (strategy === 'vision') {
            throw new Error('Vision strategy not yet implemented. ' +
                'Requires image loading from Supabase Storage. ' +
                'Use PASS_05_STRATEGY=ocr or ocr_optimized instead.');
        }
        // Select prompt builder based on strategy
        const promptBuilder = strategy === 'ocr_optimized'
            ? aiPromptsOCR_1.buildOCROptimizedPrompt
            : aiPrompts_1.buildEncounterDiscoveryPrompt;
        // Build prompt with OCR text
        const prompt = promptBuilder({
            fullText: input.ocrOutput.fullTextAnnotation.text,
            pageCount: input.pageCount,
            ocrPages: input.ocrOutput.fullTextAnnotation.pages
        });
        // Detect GPT-5 vs GPT-4o (same pattern as Pass 1)
        const model = 'gpt-5';
        const isGPT5 = model.startsWith('gpt-5');
        // Build request parameters with model-specific handling
        const requestParams = {
            model: model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a medical document analyzer specializing in healthcare encounter extraction.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            response_format: { type: 'json_object' }
        };
        // Model-specific parameters (same pattern as Pass 1)
        if (isGPT5) {
            // GPT-5: Uses max_completion_tokens, temperature fixed at 1.0
            requestParams.max_completion_tokens = 32000; // Safe limit for GPT-5-mini (supports up to 128k)
        }
        else {
            // GPT-4o and earlier: Uses max_tokens and custom temperature
            requestParams.max_tokens = 32000;
            requestParams.temperature = 0.1; // Low temperature for consistent extraction
        }
        // Call OpenAI API
        const response = await openai.chat.completions.create(requestParams);
        // Parse AI response
        const aiOutput = response.choices[0].message.content;
        if (!aiOutput) {
            throw new Error('Empty response from AI');
        }
        const parsed = await (0, manifestBuilder_1.parseEncounterResponse)(aiOutput, input.ocrOutput, input.patientId, input.shellFileId);
        // Calculate cost
        const inputTokens = response.usage?.prompt_tokens || 0;
        const outputTokens = response.usage?.completion_tokens || 0;
        const cost = calculateCost(inputTokens, outputTokens);
        return {
            success: true,
            encounters: parsed.encounters,
            aiModel: response.model, // Dynamic from OpenAI response
            aiCostUsd: cost,
            inputTokens,
            outputTokens
        };
    }
    catch (error) {
        console.error('[Pass 0.5] Encounter discovery error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            aiModel: 'unknown', // No response available on error
            aiCostUsd: 0,
            inputTokens: 0,
            outputTokens: 0
        };
    }
}
function calculateCost(inputTokens, outputTokens) {
    // GPT-5-mini pricing (as of Oct 2025)
    const INPUT_PRICE_PER_1M = 0.25; // $0.25 per 1M tokens (verified)
    const OUTPUT_PRICE_PER_1M = 2.00; // $2.00 per 1M tokens (verified)
    const inputCost = (inputTokens / 1_000_000) * INPUT_PRICE_PER_1M;
    const outputCost = (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M;
    return inputCost + outputCost;
}
//# sourceMappingURL=encounterDiscovery.js.map