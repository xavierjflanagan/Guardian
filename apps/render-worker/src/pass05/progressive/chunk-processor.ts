/**
 * Progressive Chunk Processor
 * Processes individual chunks with context handoff
 */

import { ChunkParams, ChunkResult, PendingEncounter } from './types';
import { OCRPage } from '../types';
import { buildCascadeContext } from './handoff-builder';
import {
  saveChunkResults,
  batchInsertPendingEncountersV3,
  batchInsertPendingIdentifiers,
  batchInsertPageAssignments,
  updatePageSeparationAnalysis,
  supabase
} from './database';
import { getSelectedModel } from '../models/model-selector';
import { AIProviderFactory } from '../providers/provider-factory';
import { buildEncounterDiscoveryPromptV11 } from '../aiPrompts.v11';
import { extractCoordinatesForMarker } from './coordinate-extractor';
import { generateCascadeId, generatePendingId, shouldCascade, trackCascade, incrementCascadePendings } from './cascade-manager';
import { extractIdentifiers, ParsedIdentifier } from './identifier-extractor';

/**
 * Process a single chunk of pages
 */
export async function processChunk(params: ChunkParams): Promise<ChunkResult> {
  const startTime = Date.now();

  console.log(`[Chunk ${params.chunkNumber}] Processing pages ${params.pageRange[0]}-${params.pageRange[1]} with ${params.handoffReceived ? 'handoff context' : 'no prior context'}`);

  // Extract OCR text for this chunk
  // pageRange is 1-based (e.g., [51, 100]), so convert to 0-based for extractTextFromPages (e.g., 50)
  const fullText = extractTextFromPages(params.pages, params.pageRange[0] - 1);

  // Add guardrails and logging
  if (fullText.trim().length === 0) {
    console.error(`[Chunk ${params.chunkNumber}] CRITICAL: Extracted 0 characters of OCR text - likely data structure mismatch`);
    console.error(`[Chunk ${params.chunkNumber}] Sample page structure: ${JSON.stringify(Object.keys(params.pages[0] || {}))}`);
    // Continue processing (allow pseudo encounters to be created as diagnostic signal)
    // Session-level quality validation will flag this for review
  }

  console.log(`[Chunk ${params.chunkNumber}] Extracted ${fullText.length} chars of OCR text`);
  console.log(`[Chunk ${params.chunkNumber}] First 200 chars: ${fullText.substring(0, 200)}`);

  // Build OCR page map for coordinate extraction
  // Map: absolute 1-based page number → OCRPage
  const ocrPageMap = new Map<number, OCRPage>();
  params.pages.forEach((page, index) => {
    const absolutePageNum = params.pageRange[0] + index; // Convert chunk-local to absolute
    ocrPageMap.set(absolutePageNum, page);
  });
  console.log(`[Chunk ${params.chunkNumber}] Built OCR page map with ${ocrPageMap.size} pages (${params.pageRange[0]}-${params.pageRange[1]})`);

  // Build V11 prompt with marker + region hint pattern
  const prompt = buildEncounterDiscoveryPromptV11({
    fullText,
    progressive: {
      chunkNumber: params.chunkNumber,
      totalChunks: params.totalChunks,
      pageRange: params.pageRange,
      totalPages: params.totalPages,
      cascadeContextReceived: params.handoffReceived?.cascadeContexts  // V11: extract cascade contexts
    }
  });

  console.log(`[Chunk ${params.chunkNumber}] Using V11 prompt with marker + region hint pattern (Strategy A)`);
  if (prompt.includes('start_text_marker')) {
    console.log(`[Chunk ${params.chunkNumber}] ✓ V11 marker fields confirmed in prompt`);
  }
  if (prompt.includes('is_cascading')) {
    console.log(`[Chunk ${params.chunkNumber}] ✓ Cascade detection fields confirmed in prompt`);
  }

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

  // Parse V11 response into PendingEncounter objects
  // STRATEGY A: ALL encounters become pendings, no direct finals
  const { pendings, pageSeparationAnalysis, identifiersByEncounter } = parseV11Response(
    aiResponse.content,
    params.sessionId,
    params.chunkNumber,
    params.handoffReceived?.cascadeContexts || []
  );

  console.log(`[Chunk ${params.chunkNumber}] Parsed ${pendings.length} pending encounters from V11 response`);

  // Extract OCR coordinates for intra-page boundaries
  console.log(`[Chunk ${params.chunkNumber}] Extracting coordinates for ${pendings.length} pendings...`);

  for (const pending of pendings) {
    // Extract START coordinates
    if (pending.start_boundary_type === 'intra_page' && pending.start_text_marker) {
      const startPage = ocrPageMap.get(pending.start_page);
      if (startPage) {
        try {
          const coords = await extractCoordinatesForMarker(
            pending.start_text_marker,
            pending.start_marker_context,
            pending.start_region_hint as any,
            pending.start_page,
            startPage
          );

          if (coords) {
            pending.start_text_y_top = coords.text_y_top;
            pending.start_text_height = coords.text_height;
            pending.start_y = coords.split_y;  // For START: split BEFORE marker
            console.log(`[Chunk ${params.chunkNumber}] ✓ START coords for ${pending.pending_id}: y=${coords.split_y}`);
          } else {
            console.warn(`[Chunk ${params.chunkNumber}] ⚠ START coord extraction failed for ${pending.pending_id}, keeping as intra_page with null coords`);
          }
        } catch (error) {
          console.error(`[Chunk ${params.chunkNumber}] ✗ START coord extraction error for ${pending.pending_id}:`, error);
        }
      }
    }

    // Extract END coordinates
    if (pending.end_boundary_type === 'intra_page' && pending.end_text_marker) {
      const endPage = ocrPageMap.get(pending.end_page);
      if (endPage) {
        try {
          const coords = await extractCoordinatesForMarker(
            pending.end_text_marker,
            pending.end_marker_context,
            pending.end_region_hint as any,
            pending.end_page,
            endPage
          );

          if (coords) {
            pending.end_text_y_top = coords.text_y_top;
            pending.end_text_height = coords.text_height;
            // CRITICAL: For END boundaries, split AFTER the marker
            pending.end_y = coords.text_y_top + coords.text_height;
            console.log(`[Chunk ${params.chunkNumber}] ✓ END coords for ${pending.pending_id}: y=${pending.end_y}`);
          } else {
            console.warn(`[Chunk ${params.chunkNumber}] ⚠ END coord extraction failed for ${pending.pending_id}, keeping as intra_page with null coords`);
          }
        } catch (error) {
          console.error(`[Chunk ${params.chunkNumber}] ✗ END coord extraction error for ${pending.pending_id}:`, error);
        }
      }
    }
  }

  // Extract coordinates for page_separation_analysis safe splits
  if (pageSeparationAnalysis?.safe_split_points?.length > 0) {
    console.log(`[Chunk ${params.chunkNumber}] Extracting coordinates for ${pageSeparationAnalysis.safe_split_points.length} safe split points...`);

    for (const splitPoint of pageSeparationAnalysis.safe_split_points) {
      // Only extract for intra_page splits (inter_page splits don't need coordinates)
      if (splitPoint.split_type === 'intra_page' && splitPoint.marker) {
        const splitPage = ocrPageMap.get(splitPoint.page);

        if (splitPage) {
          try {
            const coords = await extractCoordinatesForMarker(
              splitPoint.marker,
              splitPoint.marker_context,
              splitPoint.region_hint as any,
              splitPoint.page,
              splitPage
            );

            if (coords) {
              splitPoint.text_y_top = coords.text_y_top;
              splitPoint.text_height = coords.text_height;
              splitPoint.split_y = coords.split_y;
              console.log(`[Chunk ${params.chunkNumber}] ✓ Safe split coords for page ${splitPoint.page}: y=${coords.split_y}`);
            } else {
              console.warn(`[Chunk ${params.chunkNumber}] ⚠ Safe split coord extraction failed for page ${splitPoint.page}, keeping null coords`);
            }
          } catch (error) {
            console.error(`[Chunk ${params.chunkNumber}] ✗ Safe split coord extraction error for page ${splitPoint.page}:`, error);
          }
        }
      }
    }
  }

  // FIX: Assign cascade_ids to encounters that will cascade BEFORE persisting
  // This ensures encounters ending at chunk boundary get proper cascade_ids,
  // not just implicit ones during handoff building
  pendings.forEach((pending, index) => {
    if (!pending.cascade_id && shouldCascade(
      {
        is_cascading: pending.is_cascading,
        end_boundary_type: pending.end_boundary_type,
        end_page: pending.end_page,
        encounter_type: pending.encounter_type
      },
      params.chunkNumber,
      params.totalChunks,
      params.pageRange[1]
    )) {
      // This encounter will cascade but doesn't have cascade_id yet
      // (AI said is_cascading: false, but shouldCascade detected it ends at boundary)
      pending.cascade_id = generateCascadeId(params.sessionId, params.chunkNumber, index, pending.encounter_type);
      console.log(`[Chunk ${params.chunkNumber}] Generated cascade_id for implicit cascade: ${pending.pending_id} → ${pending.cascade_id}`);
    }
  });

  // FIX Issue #1: Track cascade chains in database
  // Separate new cascades (origin) from continuations
  const newCascadeIds = new Set<string>();
  const continuationCascadeIds = new Set<string>();

  pendings.forEach((pending) => {
    if (pending.cascade_id) {
      if (pending.continues_previous) {
        continuationCascadeIds.add(pending.cascade_id);
      } else {
        newCascadeIds.add(pending.cascade_id);
      }
    }
  });

  // Create cascade chain records for new cascades (origin chunk)
  for (const cascadeId of newCascadeIds) {
    await trackCascade(cascadeId, params.sessionId, params.chunkNumber);
    console.log(`[Chunk ${params.chunkNumber}] ✓ Tracked new cascade chain: ${cascadeId}`);

    // Migration 59: Increment session total_cascades counter
    const { data: newCount, error: counterError } = await supabase.rpc(
      'increment_session_total_cascades',
      { p_session_id: params.sessionId }
    );

    if (counterError) {
      console.error(`[Chunk ${params.chunkNumber}] Failed to increment cascade counter:`, counterError);
    } else {
      console.log(`[Chunk ${params.chunkNumber}] ✓ Session total_cascades now: ${newCount}`);
    }
  }

  // Increment cascade chain counters for continuations
  for (const cascadeId of continuationCascadeIds) {
    await incrementCascadePendings(cascadeId);
    console.log(`[Chunk ${params.chunkNumber}] ✓ Incremented cascade chain: ${cascadeId}`);
  }

  // Save all pendings to database (Strategy A: no direct finals)
  console.log(`[Chunk ${params.chunkNumber}] Saving ${pendings.length} pending encounters...`);

  if (pendings.length > 0) {
    await batchInsertPendingEncountersV3(params.sessionId, params.chunkNumber, pendings);
    console.log(`[Chunk ${params.chunkNumber}] ✓ Saved ${pendings.length} pendings`);
  }

  // Extract and save medical identifiers (MRN, Medicare, Insurance IDs)
  console.log(`[Chunk ${params.chunkNumber}] Extracting medical identifiers...`);

  const identifiersByPending = new Map<string, ParsedIdentifier[]>();
  let totalIdentifiers = 0;

  pendings.forEach((pending, index) => {
    const rawIdentifiers = identifiersByEncounter.get(index);

    if (rawIdentifiers && rawIdentifiers.length > 0) {
      const extractionResult = extractIdentifiers(rawIdentifiers, {
        facility_name: pending.facility_name || undefined,
        provider_name: pending.provider_name || undefined,
        encounter_type: pending.encounter_type
      });

      if (extractionResult.identifiers.length > 0) {
        identifiersByPending.set(pending.pending_id, extractionResult.identifiers);
        totalIdentifiers += extractionResult.identifiers.length;
      }

      if (extractionResult.validation_warnings.length > 0) {
        console.warn(`[Chunk ${params.chunkNumber}] Identifier warnings for ${pending.pending_id}:`, extractionResult.validation_warnings);
      }
    }
  });

  if (identifiersByPending.size > 0) {
    await batchInsertPendingIdentifiers(params.sessionId, identifiersByPending);
    console.log(`[Chunk ${params.chunkNumber}] ✓ Saved ${totalIdentifiers} identifiers for ${identifiersByPending.size} pendings`);
  } else {
    console.log(`[Chunk ${params.chunkNumber}] No identifiers to save`);
  }

  // Map page_ranges to individual page assignments
  console.log(`[Chunk ${params.chunkNumber}] Mapping page assignments...`);

  const pageAssignments: Array<{
    pending_id: string;
    cascade_id: string | null;
    page_num: number;
    justification: string;
  }> = [];

  pendings.forEach((pending) => {
    // Expand page_ranges (array of [start, end] ranges) into individual page numbers
    pending.page_ranges.forEach((range) => {
      const [startPage, endPage] = range;

      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        pageAssignments.push({
          pending_id: pending.pending_id,
          cascade_id: pending.cascade_id,
          page_num: pageNum,
          justification: `${pending.encounter_type} (${pending.encounter_start_date || 'unknown date'})`
        });
      }
    });
  });

  if (pageAssignments.length > 0) {
    await batchInsertPageAssignments(
      params.sessionId,
      params.shellFileId,
      params.chunkNumber,
      pageAssignments
    );
    console.log(`[Chunk ${params.chunkNumber}] ✓ Saved ${pageAssignments.length} page assignments for ${pendings.length} pendings`);
  } else {
    console.log(`[Chunk ${params.chunkNumber}] No page assignments to save`);
  }

  // Save page_separation_analysis to shell_files (only on final chunk)
  if (params.chunkNumber === params.totalChunks && pageSeparationAnalysis) {
    console.log(`[Chunk ${params.chunkNumber}] Saving page_separation_analysis with ${pageSeparationAnalysis.safe_split_points?.length || 0} split points...`);
    await updatePageSeparationAnalysis(params.shellFileId, pageSeparationAnalysis);
    console.log(`[Chunk ${params.chunkNumber}] ✓ Saved page_separation_analysis to shell_files`);
  }

  // Build cascade context for next chunk
  const cascadingPendings = pendings.filter(p =>
    shouldCascade(
      {
        is_cascading: p.is_cascading,
        end_boundary_type: p.end_boundary_type,
        end_page: p.end_page,
        encounter_type: p.encounter_type
      },
      params.chunkNumber,
      params.totalChunks,
      params.pageRange[1]
    )
  );

  // ANALYTICS: Track implicit cascades (where AI forgot is_cascading flag)
  const explicitCascades = cascadingPendings.filter(p => p.is_cascading);
  const implicitCascades = cascadingPendings.filter(p => !p.is_cascading);

  if (implicitCascades.length > 0) {
    console.warn(`[Chunk ${params.chunkNumber}] ⚠️ IMPLICIT CASCADES DETECTED: ${implicitCascades.length}/${cascadingPendings.length} cascading encounters missing is_cascading flag`);
    console.warn(`[Chunk ${params.chunkNumber}] Implicit cascade IDs: ${implicitCascades.map(p => p.pending_id).join(', ')}`);
    console.warn(`[Chunk ${params.chunkNumber}] This indicates AI prompt quality issue - should be rare with good prompts`);
  }

  const handoffGenerated = cascadingPendings.length > 0
    ? buildCascadeContext({
        cascadingEncounters: cascadingPendings.map(p => ({
          // Safety: Generate fallback ID for implicit cascades (where AI forgot is_cascading flag)
          // Implicit cascades detected by shouldCascade but have null cascade_id
          cascade_id: p.cascade_id || `implicit_${p.pending_id}`,
          pending_id: p.pending_id,
          encounter_type: p.encounter_type,
          summary: p.summary,
          expected_continuation: p.expected_continuation,
          cascade_context: p.cascade_context
        })),
        chunkNumber: params.chunkNumber
      })
    : null;

  console.log(`[Chunk ${params.chunkNumber}] Generated handoff for ${cascadingPendings.length} cascading encounters (${explicitCascades.length} explicit, ${implicitCascades.length} implicit)`);

  // Calculate cost
  const cost = calculateCost(model.modelId, aiResponse.inputTokens, aiResponse.outputTokens);

  // Calculate average confidence
  const avgConfidence = pendings.length > 0
    ? pendings.reduce((sum, p) => sum + p.confidence, 0) / pendings.length
    : 0;

  // Save chunk results to database
  const endTime = Date.now(); // Migration 59: Capture end time
  await saveChunkResults({
    sessionId: params.sessionId,
    chunkNumber: params.chunkNumber,
    pageStart: params.pageRange[0],
    pageEnd: params.pageRange[1],
    aiModel: model.modelId,
    inputTokens: aiResponse.inputTokens,
    outputTokens: aiResponse.outputTokens,
    cost,
    confidence: avgConfidence,
    cascadeContextReceived: params.handoffReceived?.cascadeContexts || null,  // Strategy A renamed field
    cascadePackageSent: handoffGenerated?.cascadeContexts || null,           // Strategy A renamed field
    pendingsCreated: pendings.length,                                         // Strategy A field
    cascadingCount: cascadingPendings.length,                                 // Strategy A field
    cascadeIds: cascadingPendings.map(p => p.cascade_id!).filter(Boolean),   // Strategy A field
    continuesCount: pendings.filter(p => p.continues_previous).length,        // Strategy A field
    aiResponseRaw: aiResponse.content,
    processingTimeMs,
    pageSeparationAnalysis,                                                   // Optional batching analysis
    startedAt: new Date(startTime).toISOString(),                             // Migration 59
    completedAt: new Date(endTime).toISOString()                              // Migration 59
  });

  console.log(`[Chunk ${params.chunkNumber}] Complete: ${pendings.length} pendings created, confidence ${avgConfidence.toFixed(2)}, ${processingTimeMs}ms, $${cost.toFixed(4)}`);

  return {
    completedEncounters: [],  // Strategy A: no direct finals
    completedPageAssignments: [],  // TODO Week 4: map page assignments
    pendingEncounter: null,  // DEPRECATED (v2.9 field)
    handoffGenerated,  // Can be null when no cascading encounters
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
 * Parse V11 AI response into PendingEncounter objects
 *
 * STRATEGY A: ALL encounters become pendings, no direct finals
 * V11 adds marker + region hint pattern for coordinate extraction
 *
 * @param content - AI response content
 * @param sessionId - Session ID
 * @param chunkNumber - Current chunk number
 * @param cascadeContexts - Incoming cascade contexts from previous chunk
 */
function parseV11Response(
  content: any,
  sessionId: string,
  chunkNumber: number,
  cascadeContexts: Array<{
    cascade_id: string;
    pending_id: string;
    encounter_type: string;
    partial_summary: string;
    expected_in_next_chunk: string;
    ai_context: string;
  }>
): {
  pendings: PendingEncounter[];
  pageSeparationAnalysis: any; // Will be stored in shell_files.page_separation_analysis
  identifiersByEncounter: Map<number, any[]>; // Map of encounter index → raw AI identifiers
} {
  const parsed = typeof content === 'string' ? JSON.parse(content) : content;

  // Track identifiers by encounter index for later extraction
  const identifiersByEncounter = new Map<number, any[]>();

  // Parse encounters into pendings
  const pendings: PendingEncounter[] = (parsed.encounters || []).map((enc: any, index: number) => {
    // Store raw identifiers for later extraction (Week 4)
    if (enc.identifiers && enc.identifiers.length > 0) {
      identifiersByEncounter.set(index, enc.identifiers);
    }
    // Generate pending_id (always unique per chunk)
    const pending_id = generatePendingId(sessionId, chunkNumber, index);

    // Generate cascade_id with inheritance logic
    let cascade_id: string | null = null;

    // FIX: Handle continuation encounters first (regardless of is_cascading status)
    // A continuation encounter that ENDS in current chunk has is_cascading=false
    // but still needs to inherit the cascade_id from previous chunk
    if (enc.continues_previous && cascadeContexts.length > 0) {
      // CONTINUATION: Inherit cascade_id from previous chunk
      // Match by encounter_type (simple heuristic - could be enhanced with better matching)
      const matchingCascade = cascadeContexts.find(ctx => ctx.encounter_type === enc.encounter_type);

      if (matchingCascade) {
        cascade_id = matchingCascade.cascade_id;
        console.log(`[Parse V11] Encounter ${index} continues cascade ${cascade_id} from previous chunk (is_cascading: ${enc.is_cascading})`);
      } else {
        // Fallback: AI says continues_previous but we can't find matching cascade
        console.warn(`[Parse V11] Encounter ${index} claims continues_previous but no matching cascade found (type: ${enc.encounter_type})`);
        // Only generate new cascade_id if this encounter itself is cascading
        if (enc.is_cascading) {
          cascade_id = generateCascadeId(sessionId, chunkNumber, index, enc.encounter_type);
        }
      }
    } else if (enc.is_cascading) {
      // NEW CASCADE: Generate new cascade_id starting in this chunk
      cascade_id = generateCascadeId(sessionId, chunkNumber, index, enc.encounter_type);
    }

    return {
      // IDs
      session_id: sessionId,
      pending_id,
      cascade_id,

      // Cascade fields
      is_cascading: enc.is_cascading || false,
      continues_previous: enc.continues_previous || false,
      cascade_context: enc.cascade_context || null,
      expected_continuation: enc.expected_continuation || null,

      // Position fields (17 fields - AI provided)
      start_page: enc.start_page,
      start_boundary_type: enc.start_boundary_type,
      start_text_marker: enc.start_text_marker || null,
      start_marker_context: enc.start_marker_context || null,
      start_region_hint: enc.start_region_hint || null,
      start_text_y_top: null,  // Filled by coordinate extractor
      start_text_height: null,  // Filled by coordinate extractor
      start_y: null,  // Filled by coordinate extractor

      end_page: enc.end_page,
      end_boundary_type: enc.end_boundary_type,
      end_text_marker: enc.end_text_marker || null,
      end_marker_context: enc.end_marker_context || null,
      end_region_hint: enc.end_region_hint || null,
      end_text_y_top: null,  // Filled by coordinate extractor
      end_text_height: null,  // Filled by coordinate extractor
      end_y: null,  // Filled by coordinate extractor

      position_confidence: enc.position_confidence || 0.5,

      // Identity fields (parsed but not persisted until Week 4)
      patient_full_name: enc.patient_full_name || null,
      patient_date_of_birth: enc.patient_date_of_birth || null,
      patient_address: enc.patient_address || null,
      patient_phone: enc.patient_phone || null,

      // Classification fields (set in Week 4)
      matched_profile_id: null,
      match_confidence: null,
      match_status: null,
      is_orphan_identity: false,

      // Quality field (set in Week 4)
      data_quality_tier: null,

      // Source metadata
      encounter_source: 'shell_file' as const,
      created_by_user_id: null,  // Set from params if available

      // Encounter core fields
      encounter_type: enc.encounter_type,
      page_ranges: enc.page_ranges || [],
      encounter_start_date: enc.encounter_start_date,
      encounter_end_date: enc.encounter_end_date,
      encounter_timeframe_status: enc.encounter_timeframe_status,
      provider_name: enc.provider_name,
      facility_name: enc.facility_name,
      confidence: enc.confidence || 0.5,
      summary: enc.summary,

      // Clinical fields (V11 additions)
      diagnoses: enc.diagnoses || [],
      procedures: enc.procedures || [],
      chief_complaint: enc.chief_complaint,
      department: enc.department,
      provider_role: enc.provider_role,
      disposition: enc.disposition,

      // Timeline Test (computed)
      is_real_world_visit: !!(
        (enc.encounter_start_date || enc.encounter_end_date) &&
        (enc.provider_name || enc.facility_name)
      )
    };
  });

  // Parse page separation analysis (safe splits)
  const pageSeparationAnalysis = parsed.page_separation_analysis || null;

  return { pendings, pageSeparationAnalysis, identifiersByEncounter };
}

/**
 * Extract full text from OCR pages for base prompt
 * FIXED: Extract text from lines array (actual OCR structure from ocr-persistence.ts)
 *
 * OCR pages have this structure (from ocr-persistence.ts:12-31 and worker.ts:1192-1208):
 * {
 *   page_number: number;
 *   size: { width_px, height_px };
 *   lines: Array<{ text, bbox, confidence, reading_order }>;
 *   tables: Array<{ bbox, rows, columns, confidence }>;
 *   provider: string;
 *   processing_time_ms: number;
 * }
 *
 * @param pages - Array of OCR pages for this chunk
 * @param startPageNum - The actual starting page number in the document (0-indexed)
 */
function extractTextFromPages(pages: OCRPage[], startPageNum: number = 0): string {
  // EMERGENCY DEBUG: Log actual page structure
  if (pages.length > 0) {
    const firstPage = pages[0] as any;
    console.error('[DEBUG] First page keys:', Object.keys(firstPage));
    console.error('[DEBUG] First page structure sample:', JSON.stringify(firstPage).substring(0, 500));
  }

  return pages.map((page, idx) => {
    let text = '';

    // CORRECT: Extract text from blocks (worker.ts maps lines to blocks with text field)
    if (page.blocks && page.blocks.length > 0) {
      // Each block represents a line of text (worker.ts:1196-1208)
      text = page.blocks
        .map((block: any) => block.text || '')
        .filter((t: string) => t.length > 0)
        .join(' ');
    }
    // FALLBACK: Try lines array (if not transformed by worker)
    else if ((page as any).lines && Array.isArray((page as any).lines)) {
      text = (page as any).lines
        .sort((a: any, b: any) => (a.reading_order || 0) - (b.reading_order || 0))
        .map((line: any) => line.text)
        .join(' ');
    }
    // LAST RESORT: Try direct text fields
    else if ((page as any).spatially_sorted_text) {
      text = (page as any).spatially_sorted_text;
    } else if ((page as any).original_gcv_text) {
      text = (page as any).original_gcv_text;
    } else if (page.text) {
      text = page.text;
    }

    // Use actual page number in document, not chunk index
    const actualPageNum = startPageNum + idx + 1;
    return `--- PAGE ${actualPageNum} START ---\n${text}\n--- PAGE ${actualPageNum} END ---`;
  }).join('\n\n');
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
