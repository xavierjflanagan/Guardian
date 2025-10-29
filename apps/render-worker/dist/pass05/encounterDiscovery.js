"use strict";
/**
 * Task 1: Healthcare Encounter Discovery
 * Uses GPT-4o-mini (text-only, not vision)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverEncounters = discoverEncounters;
const openai_1 = __importDefault(require("openai"));
const aiPrompts_1 = require("./aiPrompts");
const manifestBuilder_1 = require("./manifestBuilder");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
/**
 * Task 1: Extract healthcare encounters from OCR text
 * Uses GPT-4o-mini (text-only, not vision)
 */
async function discoverEncounters(input) {
    try {
        // Build prompt with OCR text
        const prompt = (0, aiPrompts_1.buildEncounterDiscoveryPrompt)({
            fullText: input.ocrOutput.fullTextAnnotation.text,
            pageCount: input.pageCount,
            ocrPages: input.ocrOutput.fullTextAnnotation.pages
        });
        // Call GPT-4o-mini (text analysis)
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
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
            temperature: 0.1, // Low temperature for consistent extraction
            response_format: { type: 'json_object' }
        });
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
            aiModel: 'gpt-4o-mini',
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
            aiModel: 'gpt-4o-mini',
            aiCostUsd: 0,
            inputTokens: 0,
            outputTokens: 0
        };
    }
}
function calculateCost(inputTokens, outputTokens) {
    // GPT-4o-mini pricing (as of Oct 2024)
    const INPUT_PRICE_PER_1M = 0.15; // $0.15 per 1M tokens
    const OUTPUT_PRICE_PER_1M = 0.60; // $0.60 per 1M tokens
    const inputCost = (inputTokens / 1_000_000) * INPUT_PRICE_PER_1M;
    const outputCost = (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M;
    return inputCost + outputCost;
}
//# sourceMappingURL=encounterDiscovery.js.map