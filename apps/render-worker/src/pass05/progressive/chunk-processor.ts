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
import { getSelectedModel, getModelById, AIProviderFactory } from '../../shared/ai';
import { buildEncounterDiscoveryPromptV12 } from '../aiPrompts.v12';
import { generateEnhancedOcrFormat } from './ocr-formatter';
import { generateCascadeId, generatePendingId, shouldCascade, trackCascade, incrementCascadePendings } from './cascade-manager';
import { extractIdentifiers, ParsedIdentifier } from './identifier-extractor';

/**
 * Process a single chunk of pages
 */
export async function processChunk(params: ChunkParams): Promise<ChunkResult> {
  const startTime = Date.now();

  console.log(`[Chunk ${params.chunkNumber}] Processing pages ${params.pageRange[0]}-${params.pageRange[1]} with ${params.handoffReceived ? 'handoff context' : 'no prior context'}`);

  // PHASE 1: Load enhanced OCR from storage if available, otherwise generate on-the-fly
  let enhancedOcrText: string;
  if (params.enhancedOcrText) {
    // Extract only the pages for this chunk from the full enhanced OCR text
    console.log(`[Chunk ${params.chunkNumber}] Using pre-loaded enhanced OCR from storage`);
    enhancedOcrText = extractChunkFromEnhancedOcr(params.enhancedOcrText, params.pageRange[0], params.pageRange[1]);
  } else {
    // Fallback: Generate enhanced OCR on-the-fly (backward compatibility)
    console.log(`[Chunk ${params.chunkNumber}] Enhanced OCR not found in storage, generating on-the-fly`);
    enhancedOcrText = generateEnhancedOcrTextForChunk(params.pages, params.pageRange[0] - 1);
  }

  // Add guardrails and logging
  if (enhancedOcrText.trim().length === 0) {
    console.error(`[Chunk ${params.chunkNumber}] CRITICAL: Extracted 0 characters of OCR text - likely data structure mismatch`);
    console.error(`[Chunk ${params.chunkNumber}] Sample page structure: ${JSON.stringify(Object.keys(params.pages[0] || {}))}`);
    // Continue processing (allow pseudo encounters to be created as diagnostic signal)
    // Session-level quality validation will flag this for review
  }

  console.log(`[Chunk ${params.chunkNumber}] Extracted ${enhancedOcrText.length} chars of Enhanced OCR text`);
  console.log(`[Chunk ${params.chunkNumber}] First 200 chars: ${enhancedOcrText.substring(0, 200)}`);

  // Build V12 prompt with enhanced OCR format
  const prompt = buildEncounterDiscoveryPromptV12({
    enhancedOcrText,
    progressive: {
      chunkNumber: params.chunkNumber,
      totalChunks: params.totalChunks,
      pageRange: params.pageRange,
      totalPages: params.totalPages,
      cascadeContextReceived: params.handoffReceived?.cascadeContexts
    }
  });

  console.log(`[Chunk ${params.chunkNumber}] Using V12 prompt with inline coordinate integration (Strategy A)`);

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

  // Parse V12 response into PendingEncounter objects
  // STRATEGY A: ALL encounters become pendings, no direct finals
  const { pendings, pageSeparationAnalysis, identifiersByEncounter } = parseV12Response(
    aiResponse.content,
    params.sessionId,
    params.chunkNumber,
    params.handoffReceived?.cascadeContexts || []
  );

  console.log(`[Chunk ${params.chunkNumber}] Parsed ${pendings.length} pending encounters from V12 response`);

  // V12: Calculate ACTUAL TEXT HEIGHTS from raw OCR bounding boxes
  // This determines safe cutting boundaries for document splitting in Pass 1/2
  // NOTE:
  //   - start_y/end_y: TOP edge of text (from AI via enhanced OCR)
  //   - start_text_height/end_text_height: ACTUAL TEXT HEIGHT from OCR bounding box
  //   - Uses vertices[3].y - vertices[0].y (bottom-left Y minus top-left Y)
  //   - For END markers: Cut at end_y + end_text_height (below the text)
  //   - For START markers: Cut at start_y (at the top edge)
  console.log(`[Chunk ${params.chunkNumber}] Calculating actual text heights from OCR bounding boxes for ${pendings.length} pendings...`);

  for (const pending of pendings) {
    // Calculate START text height from OCR bounding box
    if (pending.start_boundary_type === 'intra_page' && pending.start_y !== null && pending.start_marker) {
      const height = findActualTextHeight(params.pages, pending.start_page - 1, pending.start_y, pending.start_marker);
      if (height !== null) {
        pending.start_text_height = height;  // Actual text height for buffer zone calculations
        console.log(`[Chunk ${params.chunkNumber}] ✓ START height for ${pending.pending_id}: marker="${pending.start_marker}", y=${pending.start_y}, h=${height}px`);
      } else {
        console.warn(`[Chunk ${params.chunkNumber}] ⚠ Could not find START marker "${pending.start_marker}" at y=${pending.start_y} on page ${pending.start_page}`);
      }
    }

    // Calculate END text height from OCR bounding box
    if (pending.end_boundary_type === 'intra_page' && pending.end_y !== null && pending.end_marker) {
      const height = findActualTextHeight(params.pages, pending.end_page - 1, pending.end_y, pending.end_marker);
      if (height !== null) {
        pending.end_text_height = height;  // Actual text height for buffer zone calculations
        console.log(`[Chunk ${params.chunkNumber}] ✓ END height for ${pending.pending_id}: marker="${pending.end_marker}", y=${pending.end_y}, h=${height}px`);
      } else {
        console.warn(`[Chunk ${params.chunkNumber}] ⚠ Could not find END marker "${pending.end_marker}" at y=${pending.end_y} on page ${pending.end_page}`);
      }
    }
  }

  // V12.1: Calculate ACTUAL TEXT HEIGHTS for safe split points
  // Safe split points need heights for Pass 1/2 batching buffer zones
  if (pageSeparationAnalysis && pageSeparationAnalysis.safe_split_points) {
    console.log(`[Chunk ${params.chunkNumber}] Calculating text heights for ${pageSeparationAnalysis.safe_split_points.length} safe split points...`);

    for (const splitPoint of pageSeparationAnalysis.safe_split_points) {
      // Only enrich intra_page splits that have markers
      if (splitPoint.split_type === 'intra_page' && splitPoint.marker && splitPoint.split_y !== null) {
        // Convert split point page (1-indexed, relative to chunk) to 0-indexed array position
        const pageIndex = splitPoint.page - 1;
        const height = findActualTextHeight(
          params.pages,
          pageIndex,
          splitPoint.split_y,
          splitPoint.marker
        );

        if (height !== null) {
          splitPoint.text_height = height;
          splitPoint.text_y_top = splitPoint.split_y; // AI gives us top edge
          console.log(`[Chunk ${params.chunkNumber}] ✓ Safe split height: page=${splitPoint.page}, marker="${splitPoint.marker}", y=${splitPoint.split_y}, h=${height}px`);
        } else {
          console.warn(`[Chunk ${params.chunkNumber}] ⚠ Could not find safe split marker "${splitPoint.marker}" at y=${splitPoint.split_y} on page ${splitPoint.page}`);
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
 * Parse V12 AI response into PendingEncounter objects
 *
 * STRATEGY A: ALL encounters become pendings, no direct finals
 * V12: Coordinates extracted directly from AI response (start_y, end_y)
 *
 * @param content - AI response content
 * @param sessionId - Session ID
 * @param chunkNumber - Current chunk number
 * @param cascadeContexts - Incoming cascade contexts from previous chunk
 */
function parseV12Response(
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

      // Position fields (17 fields) - V12.1: Direct Y-coordinates from AI + post-calculated heights
      start_page: enc.start_page,
      start_boundary_type: enc.start_boundary_type,
      start_marker: enc.start_marker || null,  // V12: Direct from AI (no mapping layer)
      start_marker_context: null,              // V12: DEPRECATED (not used)
      start_region_hint: null,                 // V12: DEPRECATED (not used)
      start_text_y_top: null,                  // V12: DEPRECATED (redundant with start_y)
      start_text_height: null,                 // V12.1: Calculated from OCR bounding box AFTER parsing
      start_y: enc.start_y || null,            // V12: Direct from AI (TOP edge of text)

      end_page: enc.end_page,
      end_boundary_type: enc.end_boundary_type,
      end_marker: enc.end_marker || null,      // V12: Direct from AI (no mapping layer)
      end_marker_context: null,                // V12: DEPRECATED (not used)
      end_region_hint: null,                   // V12: DEPRECATED (not used)
      end_text_y_top: null,                    // V12: DEPRECATED (redundant with end_y)
      end_text_height: null,                   // V12.1: Calculated from OCR bounding box AFTER parsing
      end_y: enc.end_y || null,                // V12: Direct from AI (TOP edge of text)

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
      date_source: enc.date_source || null,  // Migration 65: Track date provenance from AI
      provider_name: enc.provider_name,
      facility_name: enc.facility_name,
      facility_address: enc.facility_address,  // Migration 66: Facility address
      confidence: enc.confidence || 0.5,
      summary: enc.summary,

      // Clinical fields (V11 additions)
      diagnoses: enc.diagnoses || [],
      procedures: enc.procedures || [],
      chief_complaint: enc.chief_complaint,
      department: enc.department,
      provider_role: enc.provider_role,
      disposition: enc.disposition,

      // Migration 65: Trust AI's is_real_world_visit decision
      // Reconciler will merge using "any true = all true" logic for multi-chunk encounters
      is_real_world_visit: enc.is_real_world_visit
    };
  });

  // Parse page separation analysis (safe splits)
  // V12: Map split_y from AI response
  const rawPageSeparation = parsed.page_separation_analysis || null;
  let pageSeparationAnalysis = null;

  if (rawPageSeparation && rawPageSeparation.safe_split_points) {
    pageSeparationAnalysis = {
      ...rawPageSeparation,
      safe_split_points: rawPageSeparation.safe_split_points.map((split: any) => ({
        ...split,
        split_y: split.split_y || null,  // AI provides this
        text_y_top: null,  // Will be enriched post-processing (same as split_y)
        text_height: null, // Will be enriched post-processing via findActualTextHeight()
        marker_context: split.marker_context || null, // AI may provide this for disambiguation
        region_hint: split.region_hint || null // AI may provide this for fuzzy matching
      }))
    };
  }

  return { pendings, pageSeparationAnalysis, identifiersByEncounter };
}

/**
 * Extract chunk pages from full enhanced OCR text (PHASE 1)
 *
 * Extracts only the pages needed for this chunk from the full document enhanced OCR
 *
 * @param fullEnhancedOcr - Full enhanced OCR text for entire document
 * @param startPage - First page number for this chunk (1-indexed)
 * @param endPage - Last page number for this chunk (1-indexed)
 * @returns Enhanced OCR text for only this chunk's pages
 */
function extractChunkFromEnhancedOcr(fullEnhancedOcr: string, startPage: number, endPage: number): string {
  const chunkPages: string[] = [];

  // Split by page markers
  const pagePattern = /--- PAGE (\d+) START ---\n([\s\S]*?)\n--- PAGE \d+ END ---/g;
  let match;

  while ((match = pagePattern.exec(fullEnhancedOcr)) !== null) {
    const pageNum = parseInt(match[1], 10);
    const pageContent = match[2];

    // Include this page if it's in our chunk range
    if (pageNum >= startPage && pageNum <= endPage) {
      chunkPages.push(`--- PAGE ${pageNum} START ---\n${pageContent}\n--- PAGE ${pageNum} END ---`);
    }
  }

  return chunkPages.join('\n\n');
}

/**
 * Generate Enhanced OCR Text for V12 (FALLBACK - used when storage unavailable)
 * Format: [Y:###] text (x:###) | text (x:###)
 *
 * @param pages - Array of OCR pages for this chunk
 * @param startPageNum - The actual starting page number in the document (0-indexed)
 */
function generateEnhancedOcrTextForChunk(pages: OCRPage[], startPageNum: number = 0): string {
  return pages.map((page, idx) => {
    const actualPageNum = startPageNum + idx + 1;

    // Generate enhanced OCR format with coordinates
    const enhancedText = generateEnhancedOcrFormat(page);

    // Add page markers
    return `--- PAGE ${actualPageNum} START ---\n${enhancedText}\n--- PAGE ${actualPageNum} END ---`;
  }).join('\n\n');
}

/**
 * Find actual text height from raw OCR bounding boxes
 *
 * STRATEGY: Use Google Cloud Vision bounding box vertices to get exact text height
 * - vertices[0] = Top-Left (x, y)
 * - vertices[3] = Bottom-Left (x, y)
 * - Actual height = vertices[3].y - vertices[0].y
 *
 * This provides EXACT text height (not line height with whitespace), which is critical for:
 * - END markers: Cut at end_y + end_text_height (below the text)
 * - START markers: Cut at start_y (at the top edge)
 *
 * @param pages Array of OCR pages
 * @param pageIndex 0-indexed page number within the chunk
 * @param targetY Y-coordinate to search for (TOP edge from AI)
 * @param markerText Text marker to search for (e.g., "DISCHARGE SUMMARY")
 * @returns Actual text height in pixels, or null if not found
 */
function findActualTextHeight(
  pages: OCRPage[],
  pageIndex: number,
  targetY: number,
  markerText: string
): number | null {
  const page = pages[pageIndex];
  if (!page || !page.blocks) {
    return null;
  }

  // Normalize marker text for comparison (case-insensitive, trim whitespace)
  const normalizedMarker = markerText.toLowerCase().trim();

  // Search through OCR hierarchy: blocks -> paragraphs -> words
  for (const block of page.blocks) {
    if (!block.paragraphs) continue;

    for (const paragraph of block.paragraphs) {
      if (!paragraph.words) continue;

      for (const word of paragraph.words) {
        // Check if this word matches the marker text
        const wordText = word.text.toLowerCase().trim();

        // Check for exact match or if marker contains this word
        if (wordText === normalizedMarker || normalizedMarker.includes(wordText)) {
          // Extract Y-coordinate from bounding box
          if (!word.boundingBox || !word.boundingBox.vertices || word.boundingBox.vertices.length < 4) {
            continue;
          }

          const topLeftY = Math.round(word.boundingBox.vertices[0].y);

          // Check if Y-coordinate matches target (within ±5px tolerance)
          if (Math.abs(topLeftY - targetY) <= 5) {
            // Calculate actual text height from bounding box
            const bottomLeftY = Math.round(word.boundingBox.vertices[3].y);
            const height = bottomLeftY - topLeftY;

            console.log(`[findActualTextHeight] Found "${word.text}" at Y=${topLeftY}, height=${height}px (vertices: TL=${topLeftY}, BL=${bottomLeftY})`);
            return height;
          }
        }
      }
    }
  }

  // Not found - try fuzzy search by Y-coordinate only
  console.log(`[findActualTextHeight] Marker "${markerText}" not found, trying Y-coordinate fuzzy search at ${targetY}...`);

  for (const block of page.blocks) {
    if (!block.paragraphs) continue;

    for (const paragraph of block.paragraphs) {
      if (!paragraph.words) continue;

      for (const word of paragraph.words) {
        if (!word.boundingBox || !word.boundingBox.vertices || word.boundingBox.vertices.length < 4) {
          continue;
        }

        const topLeftY = Math.round(word.boundingBox.vertices[0].y);

        // Fuzzy match by Y-coordinate only (within ±10px for safety)
        if (Math.abs(topLeftY - targetY) <= 10) {
          const bottomLeftY = Math.round(word.boundingBox.vertices[3].y);
          const height = bottomLeftY - topLeftY;

          console.log(`[findActualTextHeight] Fuzzy matched "${word.text}" at Y=${topLeftY} (target=${targetY}), height=${height}px`);
          return height;
        }
      }
    }
  }

  return null;
}

/**
 * Calculate AI cost based on model and token usage
 * Uses model registry for pricing, with hardcoded fallbacks
 */
function calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  // Try to get pricing from registry
  const modelDef = getModelById(modelName);
  if (modelDef) {
    return (inputTokens * modelDef.inputCostPer1M / 1_000_000) + 
           (outputTokens * modelDef.outputCostPer1M / 1_000_000);
  }

  // Fallback: Gemini 2.5 Flash-Lite pricing (lowest tier)
  // Input: $0.10 per 1M tokens, Output: $0.40 per 1M tokens
  if (modelName.includes('gemini')) {
    return (inputTokens * 0.10 / 1_000_000) + (outputTokens * 0.40 / 1_000_000);
  }

  // Fallback: GPT-5 pricing (default for unknown OpenAI models)
  // Input: $1.25 per 1M tokens, Output: $10.00 per 1M tokens
  return (inputTokens * 1.25 / 1_000_000) + (outputTokens * 10.00 / 1_000_000);
}
