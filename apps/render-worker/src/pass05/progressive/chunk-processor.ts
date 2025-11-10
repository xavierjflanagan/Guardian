/**
 * Progressive Chunk Processor
 * Processes individual chunks with context handoff
 */

import { ChunkParams, ChunkResult, ProgressiveAIResponse } from './types';
import { EncounterMetadata, PageAssignment } from '../types';
import { buildHandoffPackage } from './handoff-builder';
import { saveChunkResults, savePendingEncounter } from './database';
import { getSelectedModel } from '../models/model-selector';
import { AIProviderFactory } from '../providers/provider-factory';
import { buildProgressivePrompt } from './prompts';

/**
 * Process a single chunk of pages
 */
export async function processChunk(params: ChunkParams): Promise<ChunkResult> {
  const startTime = Date.now();

  console.log(`[Chunk ${params.chunkNumber}] Processing pages ${params.pageRange[0] + 1}-${params.pageRange[1]} with ${params.handoffReceived ? 'handoff context' : 'no prior context'}`);

  // Build prompt with handoff context
  const prompt = buildProgressivePrompt({
    pages: params.pages,
    pageRange: params.pageRange,
    totalPages: params.totalPages,
    chunkNumber: params.chunkNumber,
    totalChunks: params.totalChunks,
    handoffReceived: params.handoffReceived
  });

  // Get AI model and provider
  const model = getSelectedModel();
  const provider = AIProviderFactory.createProvider(model);

  console.log(`[Chunk ${params.chunkNumber}] Calling ${model.displayName}...`);

  // Call AI model
  const aiResponse = await provider.generateJSON(prompt);

  if (!aiResponse.content) {
    throw new Error(`Empty AI response for chunk ${params.chunkNumber}`);
  }

  const processingTimeMs = Date.now() - startTime;

  // Parse and normalize response (snake_case → camelCase)
  const parsed = parseProgressiveResponse(aiResponse.content);

  // Separate completed vs continuing encounters
  const completedEncounters: EncounterMetadata[] = [];
  const completedPageAssignments: PageAssignment[] = [];
  let pendingEncounter: ChunkResult['pendingEncounter'] = null;

  for (const enc of parsed.encounters) {
    if (enc.status === 'complete') {
      // Convert to EncounterMetadata (note: actual type uses different field names)
      // This is a placeholder - will be normalized in manifestBuilder.ts
      const encounter: any = {
        encounterType: enc.encounterType as any,
        dateRange: enc.encounterStartDate ? {
          start: enc.encounterStartDate,
          end: enc.encounterEndDate
        } : undefined,
        encounterTimeframeStatus: enc.encounterTimeframeStatus || 'unknown_end_date',
        dateSource: enc.dateSource || 'ai_extracted',
        provider: enc.providerName,
        facility: enc.facility,
        pageRanges: enc.pageRanges || [],
        confidence: enc.confidence,
        summary: enc.summary,
        spatialBounds: [], // Will be filled by manifestBuilder
        isRealWorldVisit: true,
        encounterId: '' // Will be assigned by manifestBuilder
      };
      completedEncounters.push(encounter);

    } else if (enc.status === 'continuing') {
      // This encounter extends beyond chunk boundary
      if (!enc.tempId) {
        console.warn(`[Chunk ${params.chunkNumber}] Continuing encounter missing tempId, skipping`);
        continue;
      }

      pendingEncounter = {
        tempId: enc.tempId,
        startPage: params.pageRange[0],
        encounterDate: enc.encounterStartDate,
        provider: enc.providerName,
        encounterType: enc.encounterType as any,
        partialData: {
          encounterType: enc.encounterType as any,
          dateRange: enc.encounterStartDate ? {
            start: enc.encounterStartDate,
            end: enc.encounterEndDate
          } : undefined,
          provider: enc.providerName,
          facility: enc.facility,
          pageRanges: enc.pageRanges || [],
          confidence: enc.confidence,
          summary: enc.summary
        },
        lastSeenContext: getLastContext(params.pages),
        confidence: enc.confidence,
        expectedContinuation: enc.expectedContinuation
      };

      // Save to pending encounters table
      if (pendingEncounter) {
        await savePendingEncounter(params.sessionId, pendingEncounter);
      }
    }
  }

  // Build handoff package for next chunk
  const handoffGenerated = buildHandoffPackage({
    pendingEncounter,
    completedEncounters,
    activeContext: parsed.activeContext,
    chunkNumber: params.chunkNumber
  });

  // Calculate cost
  const cost = calculateCost(model.modelId, aiResponse.inputTokens, aiResponse.outputTokens);

  // Save chunk results to database
  await saveChunkResults({
    sessionId: params.sessionId,
    chunkNumber: params.chunkNumber,
    pageStart: params.pageRange[0],
    pageEnd: params.pageRange[1],
    aiModel: model.modelId,
    inputTokens: aiResponse.inputTokens,
    outputTokens: aiResponse.outputTokens,
    cost,
    handoffReceived: params.handoffReceived,
    handoffGenerated,
    encountersCompleted: completedEncounters.length,
    encountersPending: pendingEncounter ? 1 : 0,
    aiResponseRaw: aiResponse.content,
    processingTimeMs
  });

  // Calculate average confidence
  const avgConfidence = completedEncounters.length > 0
    ? completedEncounters.reduce((sum, e) => sum + e.confidence, 0) / completedEncounters.length
    : pendingEncounter?.confidence || 0;

  console.log(`[Chunk ${params.chunkNumber}] Complete: ${completedEncounters.length} encounters, confidence ${avgConfidence.toFixed(2)}, ${processingTimeMs}ms, $${cost.toFixed(4)}`);

  return {
    completedEncounters,
    completedPageAssignments,
    pendingEncounter,
    handoffGenerated,
    metrics: {
      inputTokens: aiResponse.inputTokens,
      outputTokens: aiResponse.outputTokens,
      cost,
      confidence: avgConfidence,
      aiModel: model.modelId
    }
  };
}

/**
 * Parse and normalize AI response from snake_case to camelCase
 * CRITICAL: AI returns snake_case, TypeScript expects camelCase
 */
function parseProgressiveResponse(content: any): {
  encounters: Array<{
    status: 'complete' | 'continuing';
    tempId?: string;
    encounterType: string;
    encounterStartDate?: string;
    encounterEndDate?: string;
    encounterTimeframeStatus?: 'completed' | 'ongoing' | 'unknown_end_date';
    dateSource?: 'ai_extracted' | 'file_metadata' | 'upload_date';
    providerName?: string;
    facility?: string;
    pageRanges: number[][];
    confidence: number;
    summary?: string;
    expectedContinuation?: string;
  }>;
  activeContext?: any;
} {
  const raw = content as ProgressiveAIResponse;

  // Normalize encounters from snake_case to camelCase
  const encounters = (raw.encounters || []).map(enc => ({
    status: enc.status,
    tempId: enc.temp_id,
    encounterType: enc.encounter_type,
    encounterStartDate: enc.encounter_start_date,
    encounterEndDate: enc.encounter_end_date,
    encounterTimeframeStatus: enc.encounter_timeframe_status,
    dateSource: enc.date_source,
    providerName: enc.provider_name,
    facility: enc.facility,
    pageRanges: enc.page_ranges || [],
    confidence: enc.confidence,
    summary: enc.summary,
    expectedContinuation: enc.expected_continuation
  }));

  return {
    encounters,
    activeContext: raw.active_context
  };
}

/**
 * Get last 500 characters of OCR text for context continuity
 */
function getLastContext(pages: any[]): string {
  if (pages.length === 0) return '';

  const lastPage = pages[pages.length - 1];
  const text = lastPage.text || '';

  return text.length > 500 ? text.slice(-500) : text;
}

/**
 * Calculate AI cost based on model and token usage
 * TODO: Read pricing from model configuration
 */
function calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  // Gemini 2.5 Flash pricing (as of 2025-01)
  // Input: $0.075 per 1M tokens, Output: $0.30 per 1M tokens
  if (modelName.includes('gemini')) {
    return (inputTokens * 0.075 / 1_000_000) + (outputTokens * 0.30 / 1_000_000);
  }

  // OpenAI GPT-4o pricing (fallback)
  // Input: $2.50 per 1M tokens, Output: $10.00 per 1M tokens
  return (inputTokens * 2.50 / 1_000_000) + (outputTokens * 10.00 / 1_000_000);
}
