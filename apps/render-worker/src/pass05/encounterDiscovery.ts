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

import { GoogleCloudVisionOCR, EncounterMetadata, PageAssignment } from './types';
import { buildEncounterDiscoveryPrompt } from './aiPrompts';
import { buildEncounterDiscoveryPromptV27 } from './aiPrompts.v2.7';
import { buildEncounterDiscoveryPromptV28 } from './aiPrompts.v2.8';
import { buildEncounterDiscoveryPromptV29 } from './aiPrompts.v2.9';
import { parseEncounterResponse } from './manifestBuilder';
import { getSelectedModel } from './models/model-selector';
import { AIProviderFactory } from './providers/provider-factory';

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

    // Get selected model and create provider (multi-vendor architecture)
    const model = getSelectedModel();
    const provider = AIProviderFactory.createProvider(model);

    console.log(`[Pass 0.5] Processing with ${model.displayName}`);

    // Generate JSON response using provider abstraction
    const aiResponse = await provider.generateJSON(prompt);

    // Parse AI response
    if (!aiResponse.content) {
      throw new Error('Empty response from AI');
    }

    // v2.3: Pass totalPages for page assignment validation
    const parsed = await parseEncounterResponse(
      aiResponse.content,
      input.ocrOutput,
      input.patientId,
      input.shellFileId,
      input.pageCount  // v2.3: Enable page assignment validation
    );

    return {
      success: true,
      encounters: parsed.encounters,
      page_assignments: parsed.page_assignments,  // v2.3: Include if present
      aiModel: aiResponse.model,  // Model name from provider
      aiCostUsd: aiResponse.cost,  // Cost calculated by provider
      inputTokens: aiResponse.inputTokens,
      outputTokens: aiResponse.outputTokens
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
