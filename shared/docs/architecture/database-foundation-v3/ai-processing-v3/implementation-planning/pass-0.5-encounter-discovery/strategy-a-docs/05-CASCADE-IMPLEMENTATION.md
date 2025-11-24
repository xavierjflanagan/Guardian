# Pass 0.5 Strategy A - Cascade ID Implementation

**Date:** November 14, 2024 (Updated November 15, 2024)
**Version:** 2.0
**Purpose:** Technical specification for cascade ID system implementation (V2 with OCR position integration)

## Overview

The cascade ID system is the cornerstone of Strategy A, providing deterministic encounter linking across chunk boundaries without relying on AI state management.

**V2 Updates:**
- Integrated with OCR coordinate extraction for precise position tracking
- Updated for inter_page vs intra_page boundary system (13 position fields)
- Added position merging logic for multi-chunk encounters
- Added batching analysis aggregation
- Added session-level concurrency guards

## Cascade ID Lifecycle

### 1. Generation Phase (chunk-processor.ts)
```
Chunk Processing → AI Response → OCR Coordinate Extraction → Post-Processor → Cascade ID Assignment
```

### 2. Propagation Phase (handoff-builder.ts)
```
Cascading Encounter → Cascade Package → Next Chunk Handoff
```

### 3. Continuation Phase (chunk-processor.ts)
```
Receive Handoff → Match Continuation → Apply Same Cascade ID → Extract Coordinates
```

### 4. Reconciliation Phase (pending-reconciler.ts)
```
Session Guard → Group by Cascade ID → Merge Positions → Aggregate Batching → Create Final Encounter
```

## Cascade ID Format

### Structure
```
cascade_{sessionId}_{chunkNum}_{index}_{hash}
```

**Components:**
- `cascade_` - Prefix for identification
- `sessionId` - First 8 chars of session UUID
- `chunkNum` - Chunk number where cascade started (001, 002, etc.)
- `index` - Index within chunk (01, 02, 03)
- `hash` - 6-char hash of encounter type + date

### Examples
```
cascade_a1b2c3d4_001_01_h5j8k9  // First cascade from chunk 1
cascade_a1b2c3d4_001_02_m3n4p5  // Second cascade from chunk 1
cascade_a1b2c3d4_002_01_q7r8s9  // First cascade from chunk 2
```

### Why This Format?
1. **Sortable**: Natural ordering by session, chunk, index
2. **Debuggable**: Human-readable components
3. **Unique**: No collisions across sessions or chunks
4. **Traceable**: Can identify origin chunk

## Implementation Components

### 1. cascade-manager.ts (NEW)
```typescript
export class CascadeManager {
  private session: ProgressiveSession;
  private currentChunk: number;

  /**
   * Generate a new cascade ID for an encounter
   */
  generateCascadeId(
    encounterIndex: number,
    encounterType: string,
    startDate: string
  ): string {
    const sessionPrefix = this.session.id.substring(0, 8);
    const chunkNum = String(this.currentChunk).padStart(3, '0');
    const index = String(encounterIndex + 1).padStart(2, '0');
    const hash = this.generateHash(encounterType, startDate);

    return `cascade_${sessionPrefix}_${chunkNum}_${index}_${hash}`;
  }

  /**
   * Check if encounter should cascade based on V2 position system
   * V2: Uses inter_page vs intra_page boundary types
   */
  shouldCascade(encounter: any, chunkEndPage: number): boolean {
    // Rule 1: Encounter touches chunk boundary
    if (encounter.end_page === chunkEndPage) {
      // Check boundary type
      if (encounter.end_boundary_type === 'inter_page') {
        // Natural page break at chunk end = likely continues
        return true;
      }

      if (encounter.end_boundary_type === 'intra_page') {
        // Check Y-coordinate position on page
        // If near bottom (high Y value), likely continues
        const pageHeight = 792; // Standard letter page height in points
        const endY = encounter.end_y || 0;

        if (endY > pageHeight * 0.75) {
          // Bottom quarter of page = likely continues
          return true;
        } else if (endY > pageHeight * 0.5 && encounter.position_confidence < 0.7) {
          // Middle of page with low confidence = cascade if uncertain
          return true;
        } else {
          // Top half of page with good confidence = likely complete
          return false;
        }
      }
    }

    // Rule 2: Missing end date for ongoing encounter
    if (!encounter.encounter_end_date &&
        encounter.encounter_type === 'hospital_admission') {
      return true;
    }

    // Rule 3: AI explicitly marked as cascading
    if (encounter.is_cascading === true) {
      return true;
    }

    return false;
  }

  /**
   * Track cascade in session
   */
  async trackCascade(
    cascadeId: string,
    chunkNumber: number,
    encounterData: any
  ): Promise<void> {
    await supabase.from('pass05_cascade_chains').insert({
      session_id: this.session.id,
      cascade_id: cascadeId,
      origin_chunk: this.currentChunk,
      last_chunk: chunkNumber,
      created_at: new Date().toISOString()
    });
  }

  /**
   * Complete cascade chain after reconciliation
   */
  async completeCascade(
    cascadeId: string,
    finalEncounterId: string
  ): Promise<void> {
    await supabase.from('pass05_cascade_chains')
      .update({
        final_encounter_id: finalEncounterId,
        completed_at: new Date().toISOString()
      })
      .eq('cascade_id', cascadeId);
  }

  private generateHash(type: string, date: string): string {
    const input = `${type}_${date}`;
    // Simple hash for readability
    return crypto.createHash('sha256')
      .update(input)
      .digest('hex')
      .substring(0, 6);
  }
}
```

### 2. Modified chunk-processor.ts (V2)
```typescript
export async function processChunkV2(
  chunkNumber: number,
  chunkPages: Page[],
  sessionId: string,
  ocrPages: OCRPage[],
  handoffContext?: any
): Promise<ChunkResult> {

  // Step 1: Call AI with V11 prompt
  const aiResponse = await callAIV11(chunkPages, handoffContext);

  // Step 2: Extract OCR coordinates for all position markers
  for (const encounter of aiResponse.healthcare_encounters) {
    // Extract start coordinates
    if (encounter.start_boundary_type === 'intra_page') {
      const startCoords = extractCoordinatesForMarker(
        ocrPages,
        encounter.start_page,
        encounter.start_marker
      );

      if (startCoords.found) {
        encounter.start_text_y_top = startCoords.text_y_top;
        encounter.start_text_height = startCoords.text_height;
        encounter.start_y = startCoords.split_y;
      } else {
        // Fallback: degrade to inter_page
        encounter.start_boundary_type = 'inter_page';
        encounter.start_marker = 'coordinate extraction failed, using page boundary';
        encounter.position_confidence *= 0.9;

        logger.warn({
          encounter_index: encounter.encounter_index,
          fallback: 'degraded to inter_page',
          reason: 'start coordinate extraction failure'
        });
      }
    }

    // Extract end coordinates (same logic)
    if (encounter.end_boundary_type === 'intra_page') {
      const endCoords = extractCoordinatesForMarker(
        ocrPages,
        encounter.end_page,
        encounter.end_marker
      );

      if (endCoords.found) {
        encounter.end_text_y_top = endCoords.text_y_top;
        encounter.end_text_height = endCoords.text_height;
        encounter.end_y = endCoords.split_y;
      } else {
        // Fallback: degrade to inter_page
        encounter.end_boundary_type = 'inter_page';
        encounter.end_marker = 'coordinate extraction failed, using page boundary';
        encounter.position_confidence *= 0.9;

        logger.warn({
          encounter_index: encounter.encounter_index,
          fallback: 'degraded to inter_page',
          reason: 'end coordinate extraction failure'
        });
      }
    }
  }

  // Step 3: Extract batching analysis coordinates
  if (aiResponse.page_separation_analysis) {
    for (const splitPoint of aiResponse.page_separation_analysis.safe_split_points) {
      if (splitPoint.split_location === 'intra_page') {
        const coords = extractCoordinatesForMarker(
          ocrPages,
          splitPoint.page,
          splitPoint.marker
        );

        splitPoint.text_y_top = coords.text_y_top;
        splitPoint.text_height = coords.text_height;
        splitPoint.split_y = coords.split_y;
      }
    }
  }

  // Step 4: Post-process encounters (cascade ID assignment)
  const cascadeManager = new CascadeManager(sessionId, chunkNumber);
  const processedEncounters = [];
  const cascadePackages = [];

  const chunkEndPage = chunkPages[chunkPages.length - 1].pageNumber;

  for (let i = 0; i < aiResponse.healthcare_encounters.length; i++) {
    const encounter = aiResponse.healthcare_encounters[i];

    // Check if continuing from previous chunk
    let cascadeId: string | null = null;
    if (handoffContext && encounter.continues_previous === true) {
      // This continues a cascade from previous chunk
      cascadeId = handoffContext.cascade_id;
    }

    // Check if this will cascade to next chunk
    const shouldCascade = cascadeManager.shouldCascade(encounter, chunkEndPage);

    if (shouldCascade && !cascadeId) {
      // Generate new cascade ID
      cascadeId = cascadeManager.generateCascadeId(
        i,
        encounter.encounter_type,
        encounter.encounter_start_date
      );

      // Track the cascade
      await cascadeManager.trackCascade(cascadeId, chunkNumber, encounter);

      // Create cascade package for handoff
      cascadePackages.push({
        cascade_id: cascadeId,
        encounter_type: encounter.encounter_type,
        summary: encounter.summary,
        expecting: inferExpectation(encounter)
      });
    }

    // Generate system IDs
    const pendingId = generatePendingId(sessionId, chunkNumber, i);

    // Store pending encounter with all 13 position fields
    await supabase.from('pass05_pending_encounters').insert({
      session_id: sessionId,
      pending_id: pendingId,
      cascade_id: cascadeId,
      chunk_number: chunkNumber,
      is_cascading: shouldCascade,
      continues_previous: encounter.continues_previous || false,

      // Position data (V2: 13 fields)
      start_page: encounter.start_page,
      start_boundary_type: encounter.start_boundary_type,
      start_marker: encounter.start_marker,
      start_text_y_top: encounter.start_text_y_top,
      start_text_height: encounter.start_text_height,
      start_y: encounter.start_y,

      end_page: encounter.end_page,
      end_boundary_type: encounter.end_boundary_type,
      end_marker: encounter.end_marker,
      end_text_y_top: encounter.end_text_y_top,
      end_text_height: encounter.end_text_height,
      end_y: encounter.end_y,

      position_confidence: encounter.position_confidence,

      // Clinical data
      encounter_type: encounter.encounter_type,
      encounter_start_date: encounter.encounter_start_date,
      encounter_end_date: encounter.encounter_end_date,
      provider_name: encounter.provider_name,
      facility: encounter.facility,
      summary: encounter.summary,
      page_ranges: encounter.page_ranges
    });

    processedEncounters.push(encounter);
  }

  // Step 5: Store batching analysis in chunk_results
  await supabase.from('pass05_chunk_results').update({
    page_separation_analysis: aiResponse.page_separation_analysis
  }).eq('id', chunkResultId);

  return {
    encounters: processedEncounters,
    cascadePackage: cascadePackages.length > 0 ? cascadePackages[0] : null,
    metrics: {
      totalEncounters: processedEncounters.length,
      cascadingCount: cascadePackages.length
    }
  };
}

function generatePendingId(
  sessionId: string,
  chunkNum: number,
  index: number
): string {
  const sessionPrefix = sessionId.substring(0, 8);
  const chunk = String(chunkNum).padStart(3, '0');
  const idx = String(index).padStart(3, '0');
  return `pending_${sessionPrefix}_${chunk}_${idx}`;
}

function inferExpectation(encounter: any): string {
  const type = encounter.encounter_type;

  if (type === 'hospital_admission' && !encounter.encounter_end_date) {
    return 'discharge_summary';
  }
  if (type === 'surgical_procedure') {
    return 'post_operative_notes';
  }
  if (type === 'emergency_department') {
    return 'disposition_or_admission';
  }

  return 'continuation';
}
```

### 3. Modified pending-reconciler.ts (V2)
```typescript
export async function reconcilePendingEncountersV2(
  sessionId: string,
  shellFileId: string,
  totalPages: number
): Promise<ReconciliationResult> {

  // CRITICAL: Session-level guard - only run after ALL chunks complete
  // Prevents race conditions and ensures all pending encounters are available
  const incompletedChunks = await supabase
    .from('pass05_chunk_results')
    .select('chunk_number, status')
    .eq('session_id', sessionId)
    .neq('status', 'completed');

  if (incompletedChunks.data && incompletedChunks.data.length > 0) {
    throw new Error(
      `Cannot reconcile: ${incompletedChunks.data.length} chunks still processing. ` +
      `Incomplete chunks: ${incompletedChunks.data.map(c => c.chunk_number).join(', ')}`
    );
  }

  // Step 1: Fetch all pending encounters for session
  const { data: pendings, error } = await supabase
    .from('pass05_pending_encounters')
    .select('*')
    .eq('session_id', sessionId)
    .order('chunk_number', { ascending: true })
    .order('pending_id', { ascending: true });

  if (error) throw error;

  // Step 2: Group by cascade_id (primary grouping)
  const cascadeGroups = new Map<string, any[]>();
  const orphans = [];

  for (const pending of pendings) {
    if (pending.cascade_id) {
      if (!cascadeGroups.has(pending.cascade_id)) {
        cascadeGroups.set(pending.cascade_id, []);
      }
      cascadeGroups.get(pending.cascade_id).push(pending);
    } else {
      // No cascade_id = complete within chunk
      orphans.push(pending);
    }
  }

  // Step 3: Aggregate batching analysis from all chunks
  await aggregateBatchingAnalysis(sessionId, shellFileId, totalPages);

  // Step 4: Create final encounters
  const finalEncounters = [];

  // Process cascade groups
  for (const [cascadeId, group] of cascadeGroups) {
    const merged = mergeCascadeGroupV2(group);
    const finalId = await createFinalEncounter(merged);

    // Update cascade chain
    await completeCascade(cascadeId, finalId);

    // Update pendings with final ID
    await updatePendingsWithFinal(group, finalId);

    finalEncounters.push({
      id: finalId,
      cascade_id: cascadeId,
      chunk_count: group.length,
      ...merged
    });
  }

  // Process orphans (complete encounters)
  for (const orphan of orphans) {
    const finalId = await createFinalEncounter(orphan);
    await updatePendingsWithFinal([orphan], finalId);

    finalEncounters.push({
      id: finalId,
      cascade_id: null,
      chunk_count: 1,
      ...orphan
    });
  }

  // Step 5: Log reconciliation
  await logReconciliation(sessionId, cascadeGroups, orphans, finalEncounters);

  return {
    finalEncounters,
    cascadeGroupCount: cascadeGroups.size,
    orphanCount: orphans.length,
    totalReconciled: finalEncounters.length
  };
}

/**
 * Merge cascade group with V2 position data
 * V2: Merges 13 position fields from first/last chunks
 */
function mergeCascadeGroupV2(group: any[]): any {
  // Sort by chunk number
  group.sort((a, b) => a.chunk_number - b.chunk_number);

  const first = group[0];
  const last = group[group.length - 1];

  // V2: Merge start positions from FIRST chunk
  const startPosition = {
    start_page: first.start_page,
    start_boundary_type: first.start_boundary_type,
    start_marker: first.start_marker,
    start_text_y_top: first.start_text_y_top,
    start_text_height: first.start_text_height,
    start_y: first.start_y
  };

  // V2: Merge end positions from LAST chunk
  const endPosition = {
    end_page: last.end_page,
    end_boundary_type: last.end_boundary_type,
    end_marker: last.end_marker,
    end_text_y_top: last.end_text_y_top,
    end_text_height: last.end_text_height,
    end_y: last.end_y
  };

  // V2: Calculate weighted average position confidence
  let totalConfidenceWeighted = 0;
  let totalPages = 0;
  for (const pending of group) {
    const pageCount = pending.end_page - pending.start_page + 1;
    totalConfidenceWeighted += pending.position_confidence * pageCount;
    totalPages += pageCount;
  }
  const position_confidence = totalPages > 0 ? totalConfidenceWeighted / totalPages : 0.5;

  // Merge page ranges
  const allPageRanges = [];
  for (const pending of group) {
    if (pending.page_ranges) {
      allPageRanges.push(...pending.page_ranges);
    }
  }
  const mergedRanges = mergePageRanges(allPageRanges);

  return {
    // Take dates from appropriate chunks
    encounter_start_date: first.encounter_start_date,
    encounter_end_date: last.encounter_end_date,

    // V2: Merged position data (13 fields)
    ...startPosition,
    ...endPosition,
    position_confidence,

    // Merged page ranges
    page_ranges: mergedRanges,

    // Take latest/most complete data
    encounter_type: last.encounter_type || first.encounter_type,
    provider_name: last.provider_name || first.provider_name,
    facility: last.facility || first.facility,

    // Combine summaries
    summary: combineSummaries(group),

    // Metadata
    source_chunks: group.map(p => p.chunk_number),
    cascade_id: group[0].cascade_id
  };
}

/**
 * Aggregate batching analysis from all chunks to shell_files
 * V2: New function for Pass 1/2 batching guidance
 */
async function aggregateBatchingAnalysis(
  sessionId: string,
  shellFileId: string,
  totalPages: number
): Promise<void> {
  // 1. Fetch all chunk batching analyses
  const { data: chunkResults } = await supabase
    .from('pass05_chunk_results')
    .select('chunk_number, page_separation_analysis')
    .eq('session_id', sessionId)
    .order('chunk_number');

  // 2. Combine all safe split points
  const allSplitPoints: SafeSplitPoint[] = [];
  for (const chunk of chunkResults) {
    if (chunk.page_separation_analysis?.safe_split_points) {
      allSplitPoints.push(...chunk.page_separation_analysis.safe_split_points);
    }
  }

  // 3. Deduplicate split points at chunk boundaries
  const uniqueSplits: SafeSplitPoint[] = [];
  for (const split of allSplitPoints) {
    const splitPage = split.split_location === 'inter_page'
      ? split.between_pages[0]
      : split.page;

    const duplicate = uniqueSplits.find(s => {
      const existingPage = s.split_location === 'inter_page'
        ? s.between_pages[0]
        : s.page;
      return existingPage === splitPage && s.split_location === split.split_location;
    });

    if (!duplicate) {
      uniqueSplits.push(split);
    } else {
      // If duplicate exists, keep the one with higher confidence
      if (split.confidence > duplicate.confidence) {
        const index = uniqueSplits.indexOf(duplicate);
        uniqueSplits[index] = split;
      }
    }
  }

  // 4. Calculate summary statistics
  const interPageCount = uniqueSplits.filter(s => s.split_location === 'inter_page').length;
  const intraPageCount = uniqueSplits.filter(s => s.split_location === 'intra_page').length;
  const avgConfidence = uniqueSplits.reduce((sum, s) => sum + s.confidence, 0) / uniqueSplits.length;

  // 5. Store in shell_files table
  const finalAnalysis = {
    version: '2.0',
    total_pages: totalPages,
    analysis_date: new Date().toISOString(),
    safe_split_points: uniqueSplits,
    summary: {
      total_splits: uniqueSplits.length,
      inter_page_splits: interPageCount,
      intra_page_splits: intraPageCount,
      avg_confidence: avgConfidence,
      pages_per_split: totalPages / uniqueSplits.length
    }
  };

  await supabase
    .from('shell_files')
    .update({ page_separation_analysis: finalAnalysis })
    .eq('id', shellFileId);
}

function mergePageRanges(ranges: number[][]): number[][] {
  if (ranges.length === 0) return [];

  // Sort by start page
  ranges.sort((a, b) => a[0] - b[0]);

  const merged = [ranges[0]];

  for (let i = 1; i < ranges.length; i++) {
    const current = ranges[i];
    const previous = merged[merged.length - 1];

    // Check if ranges overlap or are adjacent
    if (current[0] <= previous[1] + 1) {
      // Merge ranges
      previous[1] = Math.max(previous[1], current[1]);
    } else {
      // Add as new range
      merged.push(current);
    }
  }

  return merged;
}

function combineSummaries(group: any[]): string {
  const summaries = group
    .map(p => p.summary)
    .filter(s => s && s.trim());

  if (summaries.length === 0) return '';
  if (summaries.length === 1) return summaries[0];

  // Combine with chunk indicators
  return group.map((p, i) =>
    `[Chunk ${p.chunk_number}] ${p.summary || 'No summary'}`
  ).join('\n');
}
```

### 4. Database Schema Updates
```sql
-- Add cascade tracking and V2 position fields to pending encounters
ALTER TABLE pass05_pending_encounters
  ADD COLUMN cascade_id varchar(100),
  ADD COLUMN is_cascading boolean DEFAULT false,
  ADD COLUMN continues_previous boolean DEFAULT false,
  ADD COLUMN pending_id varchar(100) UNIQUE NOT NULL,

  -- V2 Position fields (13 total)
  ADD COLUMN start_page integer,
  ADD COLUMN start_boundary_type varchar(20), -- 'inter_page' or 'intra_page'
  ADD COLUMN start_marker text,
  ADD COLUMN start_text_y_top numeric,
  ADD COLUMN start_text_height numeric,
  ADD COLUMN start_y numeric,

  ADD COLUMN end_page integer,
  ADD COLUMN end_boundary_type varchar(20),
  ADD COLUMN end_marker text,
  ADD COLUMN end_text_y_top numeric,
  ADD COLUMN end_text_height numeric,
  ADD COLUMN end_y numeric,

  ADD COLUMN position_confidence numeric DEFAULT 0.5;

-- Index for efficient cascade queries
CREATE INDEX idx_pending_cascade
  ON pass05_pending_encounters(session_id, cascade_id)
  WHERE cascade_id IS NOT NULL;

-- New cascade chains table
CREATE TABLE pass05_cascade_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES pass05_progressive_sessions(id),
  cascade_id varchar(100) UNIQUE NOT NULL,
  origin_chunk integer NOT NULL,
  last_chunk integer,
  final_encounter_id uuid REFERENCES healthcare_encounters(id),
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamp
);

CREATE INDEX idx_cascade_session ON pass05_cascade_chains(session_id);
CREATE INDEX idx_cascade_final ON pass05_cascade_chains(final_encounter_id);

-- V2: Add position fields to healthcare_encounters (same 13 fields)
ALTER TABLE healthcare_encounters
  ADD COLUMN start_page integer,
  ADD COLUMN start_boundary_type varchar(20),
  ADD COLUMN start_marker text,
  ADD COLUMN start_text_y_top numeric,
  ADD COLUMN start_text_height numeric,
  ADD COLUMN start_y numeric,

  ADD COLUMN end_page integer,
  ADD COLUMN end_boundary_type varchar(20),
  ADD COLUMN end_marker text,
  ADD COLUMN end_text_y_top numeric,
  ADD COLUMN end_text_height numeric,
  ADD COLUMN end_y numeric,

  ADD COLUMN position_confidence numeric;
```

## Cascade Flow Examples (V2)

### Example 1: Simple Cascade with Intra-Page Boundary
```
Chunk 1 (pages 1-50):
- Encounter detected on pages 1-50
- End boundary: intra_page at page 50, Y-coordinate 650 (near bottom)
- AI marker: "just before footer on page 50"
- System extracts Y=650 from OCR bbox
- System generates: cascade_a1b2c3d4_001_01_h5j8k9
- Marks as cascading
- Creates handoff package

Chunk 2 (pages 51-100):
- Receives handoff with cascade_id
- AI sets continues_previous: true
- Finds continuation on pages 51-75
- End boundary: inter_page at page 75
- Applies same cascade_id
- Marks as NOT cascading (ends at natural page break)

Reconciliation:
- Groups both pendings by cascade_id
- Merges positions:
  - Start: page 1, intra_page, Y=650 (from chunk 1)
  - End: page 75, inter_page, no coordinates (from chunk 2)
  - Weighted confidence: (50 pages * 0.8 + 25 pages * 0.9) / 75 = 0.83
- Creates final encounter [1,75]
- Updates cascade chain with final ID
```

### Example 2: Multi-Cascade with Inter-Page Boundaries
```
Chunk 1: Pages 1-50
- Encounter ends at page 50, inter_page boundary
- Generates cascade_id
- Handoff to chunk 2

Chunk 2: Pages 51-100
- Continues with same cascade_id
- Still cascading at page 100, inter_page
- Handoff to chunk 3

Chunk 3: Pages 101-142
- Continues with same cascade_id
- Ends at page 142, inter_page
- Not cascading

Reconciliation:
- Three pendings with same cascade_id
- Start position: page 1, inter_page (from chunk 1)
- End position: page 142, inter_page (from chunk 3)
- Weighted confidence across all chunks
- Merged into single encounter [1,142]
```

### Example 3: Multiple Encounters, Mixed Boundary Types
```
Chunk 1:
- Encounter A: Pages 1-25, inter_page end (complete, no cascade)
- Encounter B: Pages 26-50, intra_page end at Y=720 (cascading)

Chunk 2:
- Encounter B cont.: Pages 51-60, inter_page end (complete)
- Encounter C: Pages 61-100, intra_page end at Y=680 (cascading)

Chunk 3:
- Encounter C cont.: Pages 101-115, inter_page end (complete)

Reconciliation:
- Encounter A: No cascade_id, creates as-is with inter_page boundaries
- Encounter B: Groups 2 pendings, merges positions (intra → inter)
- Encounter C: Groups 2 pendings, merges positions (intra → inter)
Result: 3 final encounters with accurate position data
```

## Error Handling

### Cascade ID Conflicts
```typescript
// Check for existing cascade_id before generating
const existing = await supabase
  .from('pass05_cascade_chains')
  .select('cascade_id')
  .eq('cascade_id', proposedId)
  .single();

if (existing) {
  // Add random suffix to ensure uniqueness
  proposedId += '_' + crypto.randomBytes(3).toString('hex');
}
```

### Missing Handoff Context
```typescript
// If handoff lost, fall back to descriptor matching
if (!handoffContext && encounter.continues_previous === true) {
  // Try to match by encounter type and rough date
  const match = await findPossibleCascadeMatch(
    sessionId,
    encounter.encounter_type,
    encounter.encounter_start_date,
    chunkNumber - 1
  );

  if (match) {
    cascadeId = match.cascade_id;
    logWarning('Recovered cascade via fallback matching');
  }
}
```

### Coordinate Extraction Failures
```typescript
// V2: Graceful degradation for OCR extraction failures
if (!coords.found && encounter.start_boundary_type === 'intra_page') {
  // Degrade to inter_page boundary
  encounter.start_boundary_type = 'inter_page';
  encounter.start_marker = 'coordinate extraction failed, using page boundary';
  encounter.position_confidence *= 0.9;

  logger.warn({
    encounter_index: encounter.encounter_index,
    original_marker: encounter.start_marker,
    fallback: 'degraded to inter_page',
    reason: 'coordinate extraction failure'
  });
}
```

### Orphaned Cascades
```typescript
// Detect cascades that never completed
const orphanedCascades = await supabase
  .from('pass05_cascade_chains')
  .select('*')
  .eq('session_id', sessionId)
  .is('final_encounter_id', null)
  .gt('created_at', '1 hour ago');

for (const orphan of orphanedCascades) {
  logError(`Orphaned cascade: ${orphan.cascade_id}`);
  // Attempt recovery or flag for review
}
```

## Testing Strategy

### Unit Tests
1. **CascadeManager.generateCascadeId()**
   - Verify format correctness
   - Test uniqueness
   - Check sorting order

2. **CascadeManager.shouldCascade() - V2**
   - Test inter_page boundary detection
   - Test intra_page Y-coordinate thresholds
   - Test confidence weighting
   - Test AI explicit cascading flag

3. **Reconciler.mergeCascadeGroupV2()**
   - Test position merging (start from first, end from last)
   - Test weighted confidence calculation
   - Test page range merging
   - Test summary combination

4. **aggregateBatchingAnalysis()**
   - Test split point deduplication
   - Test confidence-based tie-breaking
   - Test summary statistics calculation

### Integration Tests
1. **Single Chunk Processing**
   - No cascades generated
   - Inter_page and intra_page boundaries both work
   - Direct to final encounters

2. **Two Chunk Cascade**
   - Cascade generated in chunk 1
   - Continued in chunk 2
   - Position data correctly merged
   - Batching analysis aggregated

3. **Complex Multi-Cascade**
   - Multiple cascades across chunks
   - Mixed boundary types
   - Proper grouping
   - Correct position merging
   - Accurate weighted confidence

### E2E Test: 142-Page Document (V2)
```typescript
describe('142-page hospital admission with V2 positions', () => {
  it('should create single encounter with merged position data', async () => {
    // Process 3 chunks
    const chunk1Result = await processChunk(1, pages1to50, ocrPages1to50);
    expect(chunk1Result.cascadePackage).toBeDefined();
    expect(chunk1Result.encounters[0].end_boundary_type).toBe('intra_page');
    expect(chunk1Result.encounters[0].end_y).toBeGreaterThan(500);

    const chunk2Result = await processChunk(2, pages51to100, ocrPages51to100, chunk1Result.cascadePackage);
    expect(chunk2Result.cascadePackage).toBeDefined();

    const chunk3Result = await processChunk(3, pages101to142, ocrPages101to142, chunk2Result.cascadePackage);
    expect(chunk3Result.cascadePackage).toBeNull();
    expect(chunk3Result.encounters[0].end_boundary_type).toBe('inter_page');

    // Reconcile
    const result = await reconcilePendingEncounters(sessionId, shellFileId, 142);

    // Verify single encounter with V2 position data
    expect(result.finalEncounters).toHaveLength(1);
    expect(result.finalEncounters[0].page_ranges).toEqual([[1, 142]]);
    expect(result.finalEncounters[0].start_page).toBe(1);
    expect(result.finalEncounters[0].end_page).toBe(142);
    expect(result.finalEncounters[0].position_confidence).toBeGreaterThan(0.7);
    expect(result.cascadeGroupCount).toBe(1);

    // Verify batching analysis aggregated
    const { data: shellFile } = await supabase
      .from('shell_files')
      .select('page_separation_analysis')
      .eq('id', shellFileId)
      .single();

    expect(shellFile.page_separation_analysis).toBeDefined();
    expect(shellFile.page_separation_analysis.safe_split_points.length).toBeGreaterThan(0);
  });
});
```

## Performance Considerations

### Indexing Strategy
```sql
-- Primary lookup patterns
CREATE INDEX idx_cascade_lookup
  ON pass05_pending_encounters(session_id, cascade_id)
  WHERE cascade_id IS NOT NULL;

CREATE INDEX idx_pending_chunk
  ON pass05_pending_encounters(session_id, chunk_number);

-- Cascade chain lookups
CREATE INDEX idx_cascade_incomplete
  ON pass05_cascade_chains(session_id)
  WHERE final_encounter_id IS NULL;

-- V2: Position data queries
CREATE INDEX idx_encounter_position
  ON healthcare_encounters(start_page, end_page)
  WHERE start_boundary_type = 'intra_page' OR end_boundary_type = 'intra_page';
```

### Batch Processing
```typescript
// Process cascades in batches during reconciliation
const BATCH_SIZE = 100;
const cascadeIds = Array.from(cascadeGroups.keys());

for (let i = 0; i < cascadeIds.length; i += BATCH_SIZE) {
  const batch = cascadeIds.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(id =>
    processCascadeGroup(cascadeGroups.get(id))
  ));
}
```

### Caching OCR Data
```typescript
// Cache OCR pages during chunk processing
const ocrCache = new Map<number, OCRPage>();

function getOCRPage(pageNumber: number, ocrPages: OCRPage[]): OCRPage {
  if (!ocrCache.has(pageNumber)) {
    ocrCache.set(pageNumber, ocrPages[pageNumber - 1]);
  }
  return ocrCache.get(pageNumber);
}
```

## Monitoring and Debugging

### Cascade Metrics (V2)
```sql
-- View cascade statistics with V2 position data
SELECT
  COUNT(DISTINCT cascade_id) as cascade_count,
  COUNT(*) as pending_count,
  AVG(ARRAY_LENGTH(source_chunks, 1)) as avg_chunks_per_cascade,
  MAX(ARRAY_LENGTH(source_chunks, 1)) as max_chunks_per_cascade,
  COUNT(*) FILTER (WHERE start_boundary_type = 'intra_page') as intra_page_starts,
  COUNT(*) FILTER (WHERE end_boundary_type = 'intra_page') as intra_page_ends,
  AVG(position_confidence) as avg_position_confidence
FROM pass05_pending_encounters
WHERE session_id = ?
GROUP BY session_id;
```

### Debug Cascade Flow with Position Data
```sql
-- Trace a cascade through the system with V2 positions
WITH cascade_flow AS (
  SELECT
    pe.cascade_id,
    pe.chunk_number,
    pe.pending_id,
    pe.is_cascading,
    pe.start_page,
    pe.start_boundary_type,
    pe.start_y,
    pe.end_page,
    pe.end_boundary_type,
    pe.end_y,
    pe.position_confidence,
    pe.page_ranges,
    cc.final_encounter_id
  FROM pass05_pending_encounters pe
  LEFT JOIN pass05_cascade_chains cc ON pe.cascade_id = cc.cascade_id
  WHERE pe.session_id = ?
  ORDER BY pe.cascade_id, pe.chunk_number
)
SELECT * FROM cascade_flow;
```

### Cascade Visualization (V2)
```typescript
// Generate cascade flow diagram with V2 position data
function visualizeCascadeFlowV2(sessionId: string): string {
  const cascades = await getCascadeData(sessionId);

  let diagram = 'Cascade Flow (V2 with Positions):\n';
  for (const cascade of cascades) {
    diagram += `\n${cascade.id}:\n`;
    for (const chunk of cascade.chunks) {
      const startPos = chunk.start_boundary_type === 'intra_page'
        ? `Y=${chunk.start_y}`
        : 'page-break';
      const endPos = chunk.end_boundary_type === 'intra_page'
        ? `Y=${chunk.end_y}`
        : 'page-break';

      diagram += `  Chunk ${chunk.num}: Pages ${chunk.pages} `;
      diagram += `[Start: ${startPos}, End: ${endPos}] `;
      diagram += `Conf: ${chunk.position_confidence.toFixed(2)} `;
      diagram += chunk.cascading ? '→' : '■';
      diagram += '\n';
    }
    diagram += `  Final: Encounter ${cascade.finalId} `;
    diagram += `(Merged conf: ${cascade.final_position_confidence.toFixed(2)})\n`;
  }

  return diagram;
}
```

## Success Criteria (V2)

1. **Cascade Generation**: 100% of boundary encounters get cascade IDs
2. **Cascade Propagation**: 95%+ successful handoff continuation
3. **Reconciliation Accuracy**: 99%+ correct grouping
4. **Position Merging**: 100% of cascades have merged position data
5. **Coordinate Extraction**: 90%+ successful OCR coordinate extraction
6. **Graceful Degradation**: 100% of extraction failures degrade to inter_page
7. **Batching Aggregation**: All sessions have aggregated batching analysis
8. **Performance**: <150ms overhead per chunk (includes OCR extraction)
9. **142-Page Test**: Single encounter with accurate position data

## Conclusion

The V2 cascade ID system provides:
- **Deterministic linking** across chunks with cascade IDs
- **Precise position tracking** with OCR-extracted Y-coordinates
- **Graceful degradation** when coordinate extraction fails
- **Position data merging** for multi-chunk encounters
- **Batching guidance** for Pass 1/2 via aggregated split points
- **Simple reconciliation** via grouping with session guards
- **Debugging transparency** with readable IDs and position metadata
- **Performance efficiency** with proper indexing and caching

This implementation resolves the core issues with the current progressive processing system while adding V2's precise intra-page boundary tracking and batching analysis capabilities.
