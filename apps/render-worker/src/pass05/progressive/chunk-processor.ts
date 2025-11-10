/**
 * Progressive Chunk Processor
 * Processes individual chunks with context handoff
 */

import { ChunkParams, ChunkResult } from './types';
import { EncounterMetadata, PageAssignment, OCRPage } from '../types';
import { buildHandoffPackage } from './handoff-builder';
import { saveChunkResults, savePendingEncounter } from './database';
import { getSelectedModel } from '../models/model-selector';
import { AIProviderFactory } from '../providers/provider-factory';
import { buildProgressiveAddons } from './addons';
import { buildEncounterDiscoveryPromptV29 } from '../aiPrompts.v2.9';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Process a single chunk of pages
 */
export async function processChunk(params: ChunkParams): Promise<ChunkResult> {
  const startTime = Date.now();

  console.log(`[Chunk ${params.chunkNumber}] Processing pages ${params.pageRange[0] + 1}-${params.pageRange[1]} with ${params.handoffReceived ? 'handoff context' : 'no prior context'}`);

  // Build base v2.9 prompt (same as standard mode)
  const fullText = extractTextFromPages(params.pages);
  const basePrompt = buildEncounterDiscoveryPromptV29({
    fullText,
    pageCount: params.totalPages,  // Total pages in document (for context)
    ocrPages: params.pages
  });

  // Append progressive-specific instructions
  const progressiveAddons = buildProgressiveAddons({
    chunkNumber: params.chunkNumber,
    totalChunks: params.totalChunks,
    pageRange: params.pageRange,
    totalPages: params.totalPages,
    handoffReceived: params.handoffReceived
  });

  // Compositional prompt: base + addons
  const prompt = basePrompt + '\n\n' + progressiveAddons;

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
  const completedPageAssignments: PageAssignment[] = parsed.pageAssignments;  // FIXED: Use parsed page assignments
  let pendingEncounter: ChunkResult['pendingEncounter'] = null;

  for (const enc of parsed.encounters) {
    if (enc.status === 'complete') {
      // CRITICAL FIX: Persist completed encounters immediately to database
      const { data: inserted, error: insertError } = await supabase
        .from('healthcare_encounters')
        .insert({
          patient_id: params.patientId,
          primary_shell_file_id: params.shellFileId,
          encounter_type: enc.encounterType,
          encounter_start_date: enc.encounterStartDate,
          encounter_end_date: enc.encounterEndDate,
          encounter_timeframe_status: enc.encounterTimeframeStatus || 'unknown_end_date',
          date_source: enc.dateSource || 'ai_extracted',
          provider_name: enc.providerName,
          facility_name: enc.facility,
          page_ranges: enc.pageRanges || [],
          confidence: enc.confidence,
          summary: enc.summary,
          identified_in_pass: 'pass_0_5',  // Standardized label (matches manifestBuilder)
          source_method: 'progressive_chunk'
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to persist completed encounter: ${insertError.message}`);
      }

      // Convert to EncounterMetadata for return value
      const encounter: any = {
        encounterId: inserted.id,
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
        spatialBounds: [],
        isRealWorldVisit: true
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
        await savePendingEncounter(params.sessionId, pendingEncounter, params.chunkNumber);
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
 * Parse AI response using v2.9 schema (camelCase)
 *
 * ARCHITECTURE CHANGE: Now uses v2.9 base prompt which outputs camelCase natively.
 * Progressive addons don't change the schema, so no normalization needed.
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
  pageAssignments: PageAssignment[];
  activeContext?: any;
} {
  // v2.9 outputs camelCase, so we can use it directly
  const parsed = typeof content === 'string' ? JSON.parse(content) : content;

  // Map v2.9 camelCase format to our internal format
  const encounters = (parsed.encounters || []).map((enc: any) => {
    // Determine status: check if summary indicates continuation
    const isContinuing = enc.summary && (
      enc.summary.includes('continues beyond') ||
      enc.summary.includes('continuing to next chunk')
    );

    return {
      status: isContinuing ? 'continuing' : 'complete',
      tempId: enc.encounter_id,  // Use encounter_id as tempId for continuations
      encounterType: enc.encounterType,
      encounterStartDate: enc.dateRange?.start,
      encounterEndDate: enc.dateRange?.end,
      encounterTimeframeStatus: enc.encounterTimeframeStatus || 'unknown_end_date',
      dateSource: enc.dateSource || 'ai_extracted',
      providerName: enc.provider,
      facility: enc.facility,
      pageRanges: enc.pageRanges || [],
      confidence: enc.confidence,
      summary: enc.summary,
      expectedContinuation: undefined  // v2.9 doesn't have this field
    };
  });

  // Parse page assignments (v2.9 format)
  const pageAssignments: PageAssignment[] = (parsed.page_assignments || []).map((pa: any) => ({
    page: pa.page,
    encounter_id: pa.encounter_id,
    justification: pa.justification
  }));

  return {
    encounters,
    pageAssignments,
    activeContext: undefined  // v2.9 doesn't output this, but that's OK
  };
}

/**
 * Extract full text from OCR pages for base prompt
 */
function extractTextFromPages(pages: OCRPage[]): string {
  return pages.map((page, idx) => {
    const words: string[] = [];
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          words.push(word.text);
        }
      }
    }
    const text = words.join(' ');
    return `--- PAGE ${idx + 1} START ---\n${text}\n--- PAGE ${idx + 1} END ---`;
  }).join('\n\n');
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
