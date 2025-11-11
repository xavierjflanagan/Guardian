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
 *
 * Progressive Mode (via PASS_05_PROGRESSIVE_ENABLED env var):
 * - Documents >100 pages are automatically split into 50-page chunks
 * - Context handoff between chunks for incomplete encounters
 * - Prevents MAX_TOKENS errors on large documents
 */

import { GoogleCloudVisionOCR, EncounterMetadata, PageAssignment } from './types';
import { buildEncounterDiscoveryPrompt } from './aiPrompts';
import { buildEncounterDiscoveryPromptV27 } from './aiPrompts.v2.7';
import { buildEncounterDiscoveryPromptV28 } from './aiPrompts.v2.8';
import { buildEncounterDiscoveryPromptV29 } from './aiPrompts.v2.9';
import { buildEncounterDiscoveryPromptV10 } from './aiPrompts.v10';
import { parseEncounterResponse } from './manifestBuilder';
import { getSelectedModel } from './models/model-selector';
import { AIProviderFactory } from './providers/provider-factory';
import { shouldUseProgressiveMode, processDocumentProgressively } from './progressive/session-manager';
import { createClient } from '@supabase/supabase-js';

// Migration 45: Supabase client for shell_files finalization
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
 * Migration 45: Calculate average OCR confidence across all pages
 */
function calculateOCRConfidence(ocrOutput: GoogleCloudVisionOCR): number {
  const confidences = ocrOutput.fullTextAnnotation.pages.map(p => p.confidence || 0);
  if (confidences.length === 0) return 0;
  return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
}

/**
 * Migration 45: Finalize shell_file with Pass 0.5 metadata (manifest-free architecture)
 */
async function finalizeShellFile(shellFileId: string, data: {
  version: string;
  progressive: boolean;
  ocrConfidence: number;
  completed: boolean;
}): Promise<void> {
  const { error } = await supabase
    .from('shell_files')
    .update({
      pass_0_5_completed: data.completed,
      pass_0_5_version: data.version,
      pass_0_5_progressive: data.progressive,
      ocr_average_confidence: data.ocrConfidence
    })
    .eq('id', shellFileId);

  if (error) {
    throw new Error(`Failed to update shell_files: ${error.message}`);
  }
}

/**
 * Task 1: Extract healthcare encounters from OCR text
 * Strategy selected via PASS_05_STRATEGY environment variable
 * Progressive mode automatically enabled for documents >100 pages
 */
export async function discoverEncounters(
  input: EncounterDiscoveryInput
): Promise<EncounterDiscoveryOutput> {

  try {
    // Read strategy and version from environment variables
    const strategy = (process.env.PASS_05_STRATEGY || 'ocr') as 'ocr' | 'vision';
    const version = (process.env.PASS_05_VERSION || 'v10') as 'v2.4' | 'v2.7' | 'v2.8' | 'v2.9' | 'v10';

    console.log(`[Pass 0.5] Using strategy: ${strategy}, version: ${version}`);

    // Vision strategy requires image loading infrastructure (not yet implemented)
    if (strategy === 'vision') {
      throw new Error(
        'Vision strategy not yet implemented. ' +
        'Requires image loading from Supabase Storage. ' +
        'Use PASS_05_STRATEGY=ocr instead.'
      );
    }

    // V10 UNIVERSAL ARCHITECTURE: Works for all document sizes
    // Progressive mode handled internally by the prompt and post-processing

    if (version === 'v10') {
      console.log(`[Pass 0.5] Using v10 universal prompt for ${input.pageCount} pages`);

      // Documents >100 pages still use progressive chunking
      if (shouldUseProgressiveMode(input.pageCount)) {
        console.log(`[Pass 0.5] Document has ${input.pageCount} pages, using progressive mode with v10`);

        const progressiveResult = await processDocumentProgressively(
          input.shellFileId,
          input.patientId,
          input.ocrOutput.fullTextAnnotation.pages
        );

        return {
          success: true,
          encounters: progressiveResult.encounters,
          page_assignments: progressiveResult.pageAssignments,
          aiModel: progressiveResult.aiModel,
          aiCostUsd: progressiveResult.totalCost,
          inputTokens: progressiveResult.totalInputTokens,
          outputTokens: progressiveResult.totalOutputTokens
        };
      }

      // Standard mode with v10 prompt
      console.log(`[Pass 0.5] Document has ${input.pageCount} pages, using v10 in single-pass mode`);

      // Build v10 prompt without progressive parameters (single chunk)
      const prompt = buildEncounterDiscoveryPromptV10({
        fullText: input.ocrOutput.fullTextAnnotation.text,
        pageCount: input.pageCount,
        ocrPages: input.ocrOutput.fullTextAnnotation.pages
        // No progressive parameter = single chunk mode
      });

      // Continue with standard processing below...

    } else {
      // LEGACY: Old versions still supported for backward compatibility
      console.log(`[Pass 0.5] Using legacy version ${version}`);

      if (shouldUseProgressiveMode(input.pageCount)) {
        console.log(`[Pass 0.5] Document has ${input.pageCount} pages, using progressive mode (compositional v2.9 + addons)`);

        const progressiveResult = await processDocumentProgressively(
          input.shellFileId,
          input.patientId,
          input.ocrOutput.fullTextAnnotation.pages
        );

        return {
          success: true,
          encounters: progressiveResult.encounters,
          page_assignments: progressiveResult.pageAssignments,
          aiModel: progressiveResult.aiModel,
          aiCostUsd: progressiveResult.totalCost,
          inputTokens: progressiveResult.totalInputTokens,
          outputTokens: progressiveResult.totalOutputTokens
        };
      }
    }

    // STANDARD MODE: Process entire document in single pass (≤100 pages)
    console.log(`[Pass 0.5] Standard mode processing...`);

    // Select prompt builder based on version
    const promptBuilder = version === 'v10'
      ? buildEncounterDiscoveryPromptV10
      : version === 'v2.9'
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

    // Migration 45: Finalize shell_file with Pass 0.5 metadata
    await finalizeShellFile(input.shellFileId, {
      version, // Use actual version (v2.9, v2.8, etc.)
      progressive: false,
      ocrConfidence: calculateOCRConfidence(input.ocrOutput),
      completed: true
    });

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
