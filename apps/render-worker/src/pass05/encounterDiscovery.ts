/**
 * Task 1: Healthcare Encounter Discovery
 *
 * Strategy Selection (via PASS_05_STRATEGY env var):
 * - 'ocr' (default): Current baseline prompt with OCR text (gpt-5-mini)
 * - 'ocr_optimized': OCR-optimized prompt focused on text patterns (gpt-5-mini)
 * - 'vision': Vision-optimized prompt with raw images (gpt-5-mini vision) - NOT YET IMPLEMENTED
 */

import OpenAI from 'openai';
import { GoogleCloudVisionOCR, EncounterMetadata } from './types';
import { buildEncounterDiscoveryPrompt } from './aiPrompts';
import { buildOCROptimizedPrompt } from './aiPromptsOCR';
// import { buildVisionPrompt } from './aiPromptsVision'; // For future Vision implementation
import { parseEncounterResponse } from './manifestBuilder';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
export async function discoverEncounters(
  input: EncounterDiscoveryInput
): Promise<EncounterDiscoveryOutput> {

  try {
    // Read strategy from environment variable (defaults to 'ocr')
    const strategy = (process.env.PASS_05_STRATEGY || 'ocr') as 'ocr' | 'ocr_optimized' | 'vision';

    console.log(`[Pass 0.5] Using strategy: ${strategy}`);

    // Vision strategy requires image loading infrastructure (not yet implemented)
    if (strategy === 'vision') {
      throw new Error(
        'Vision strategy not yet implemented. ' +
        'Requires image loading from Supabase Storage. ' +
        'Use PASS_05_STRATEGY=ocr or ocr_optimized instead.'
      );
    }

    // Select prompt builder based on strategy
    const promptBuilder = strategy === 'ocr_optimized'
      ? buildOCROptimizedPrompt
      : buildEncounterDiscoveryPrompt;

    // Build prompt with OCR text
    const prompt = promptBuilder({
      fullText: input.ocrOutput.fullTextAnnotation.text,
      pageCount: input.pageCount,
      ocrPages: input.ocrOutput.fullTextAnnotation.pages
    });

    // Call GPT-5-mini (text analysis for both OCR strategies)
    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
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
      temperature: 0.1,  // Low temperature for consistent extraction
      response_format: { type: 'json_object' }
    });

    // Parse AI response
    const aiOutput = response.choices[0].message.content;
    if (!aiOutput) {
      throw new Error('Empty response from AI');
    }

    const parsed = await parseEncounterResponse(aiOutput, input.ocrOutput, input.patientId, input.shellFileId);

    // Calculate cost
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const cost = calculateCost(inputTokens, outputTokens);

    return {
      success: true,
      encounters: parsed.encounters,
      aiModel: response.model,  // Dynamic from OpenAI response
      aiCostUsd: cost,
      inputTokens,
      outputTokens
    };

  } catch (error) {
    console.error('[Pass 0.5] Encounter discovery error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      aiModel: 'unknown',  // No response available on error
      aiCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0
    };
  }
}

function calculateCost(inputTokens: number, outputTokens: number): number {
  // GPT-5-mini pricing (as of Oct 2025)
  const INPUT_PRICE_PER_1M = 0.15;  // $0.15 per 1M tokens (verify current pricing)
  const OUTPUT_PRICE_PER_1M = 0.60;  // $0.60 per 1M tokens (verify current pricing)

  const inputCost = (inputTokens / 1_000_000) * INPUT_PRICE_PER_1M;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M;

  return inputCost + outputCost;
}
