/**
 * Task 1: Healthcare Encounter Discovery
 *
 * Strategy Selection (via PASS_05_STRATEGY env var):
 * - 'ocr' (default): Current baseline prompt with OCR text (gpt-5-mini)
 * - 'vision': Vision-optimized prompt with raw images (gpt-5-mini vision) - NOT YET IMPLEMENTED
 *
 * Version Selection (via PASS_05_VERSION env var):
 * - 'v2.4' (default): Current production prompt (v2.4)
 * - 'v2.7': Optimized prompt with Phase 1 improvements (token reduction, linear flow)
 * - 'v2.8': Further optimizations
 * - 'v2.9': Latest optimizations
 */

import OpenAI from 'openai';
import { GoogleCloudVisionOCR, EncounterMetadata, PageAssignment } from './types';
import { buildEncounterDiscoveryPrompt } from './aiPrompts';
import { buildEncounterDiscoveryPromptV27 } from './aiPrompts.v2.7';
import { buildEncounterDiscoveryPromptV28 } from './aiPrompts.v2.8';
import { buildEncounterDiscoveryPromptV29 } from './aiPrompts.v2.9';
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
  page_assignments?: PageAssignment[];  // v2.3: Optional page-by-page assignments
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
    // Read strategy and version from environment variables
    const strategy = (process.env.PASS_05_STRATEGY || 'ocr') as 'ocr' | 'vision';
    const version = (process.env.PASS_05_VERSION || 'v2.9') as 'v2.4' | 'v2.7' | 'v2.8' | 'v2.9';

    console.log(`[Pass 0.5] Using strategy: ${strategy}, version: ${version}`);

    // Vision strategy requires image loading infrastructure (not yet implemented)
    if (strategy === 'vision') {
      throw new Error(
        'Vision strategy not yet implemented. ' +
        'Requires image loading from Supabase Storage. ' +
        'Use PASS_05_STRATEGY=ocr instead.'
      );
    }

    // Select prompt builder based on version
    const promptBuilder = version === 'v2.9'
      ? buildEncounterDiscoveryPromptV29
      : version === 'v2.8'
        ? buildEncounterDiscoveryPromptV28
        : version === 'v2.7'
          ? buildEncounterDiscoveryPromptV27
          : buildEncounterDiscoveryPrompt;

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
    const requestParams: any = {
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
    } else {
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

    // v2.3: Pass totalPages for page assignment validation
    const parsed = await parseEncounterResponse(
      aiOutput,
      input.ocrOutput,
      input.patientId,
      input.shellFileId,
      input.pageCount  // v2.3: Enable page assignment validation
    );

    // Calculate cost
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const cost = calculateCost(inputTokens, outputTokens);

    return {
      success: true,
      encounters: parsed.encounters,
      page_assignments: parsed.page_assignments,  // v2.3: Include if present
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
  const INPUT_PRICE_PER_1M = 0.25;  // $0.25 per 1M tokens (verified)
  const OUTPUT_PRICE_PER_1M = 2.00;  // $2.00 per 1M tokens (verified)

  const inputCost = (inputTokens / 1_000_000) * INPUT_PRICE_PER_1M;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M;

  return inputCost + outputCost;
}
