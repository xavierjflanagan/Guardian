# Pass 0.5 Reconciliation Strategy V2 (Strategy A with Position Tracking)

**Date:** November 15, 2024
**Version:** 2.0
**Purpose:** Define how pending encounters from multiple chunks are merged into final encounters with accurate position data

## Executive Summary

Strategy A reconciliation merges pending encounters that span multiple chunks using **cascade IDs** as the primary grouping mechanism. Version 2 extends this to properly handle the **inter_page/intra_page position tracking** system.

**Key Changes in V2:**
- Position data merging logic for start/end boundaries
- Coordinate validation and conflict resolution
- Position confidence recalculation
- Batching analysis aggregation across chunks

## Reconciliation Overview

### What Gets Reconciled

**Input (from pass05_pending_encounters table):**
- Multiple pending encounter records with same `cascade_id`
- Each record represents a partial view from one chunk
- Each has position data (start/end boundaries with coordinates)
- Each has batching analysis for its page range

**Output (to healthcare_encounters table):**
- Single final encounter record
- Merged position data (earliest start, latest end)
- Consolidated page ranges
- Aggregated batching analysis (to shell_files table)

### Reconciliation Triggers

1. **End of progressive session** - All chunks completed, finalize all encounters
2. **Never during processing** - Chunks write to pending_encounters only

## Position Data Reconciliation

### Challenge: Multiple Boundary Observations

**Scenario:** 142-page hospital admission spanning 3 chunks

```
Chunk 1 (pages 1-50):
- Start: page 1, inter_page, "page begins with admission note"
- End: page 50, intra_page, "before CONTINUED NEXT PAGE", Y=2800

Chunk 2 (pages 51-100):
- Start: page 51, inter_page, "continuation from previous"
- End: page 100, intra_page, "before CONTINUED NEXT PAGE", Y=2750

Chunk 3 (pages 101-142):
- Start: page 101, inter_page, "continuation from previous"
- End: page 142, intra_page, "before OUTPATIENT VISIT", Y=1850
```

**Question:** Which start? Which end? How to merge coordinates?

### Solution: Earliest Start, Latest End

**Rule 1: Start Position (Take First Chunk's Data)**
```typescript
function mergeStartPositions(pendings: PendingEncounterRecord[]): StartPosition {
  // Sort by chunk number (ascending)
  const sorted = pendings.sort((a, b) => a.chunk_number - b.chunk_number);

  // Take start position from FIRST chunk (earliest encounter start)
  const first = sorted[0];

  return {
    start_page: first.start_page,
    start_boundary_type: first.start_boundary_type,
    start_marker: first.start_marker,
    start_text_y_top: first.start_text_y_top,
    start_text_height: first.start_text_height,
    start_y: first.start_y
  };
}
```

**Rule 2: End Position (Take Last Chunk's Data)**
```typescript
function mergeEndPositions(pendings: PendingEncounterRecord[]): EndPosition {
  // Sort by chunk number (ascending)
  const sorted = pendings.sort((a, b) => a.chunk_number - b.chunk_number);

  // Take end position from LAST chunk (latest encounter end)
  const last = sorted[sorted.length - 1];

  return {
    end_page: last.end_page,
    end_boundary_type: last.end_boundary_type,
    end_marker: last.end_marker,
    end_text_y_top: last.end_text_y_top,
    end_text_height: last.end_text_height,
    end_y: last.end_y
  };
}
```

**Rationale:**
- First chunk sees the TRUE start of the encounter
- Last chunk sees the TRUE end of the encounter
- Middle chunks see "continuation from previous" (not useful for final position)

### Position Confidence Recalculation

**Challenge:** Each chunk has a `position_confidence` score. How to combine?

**Solution: Weighted Average by Page Count**

```typescript
function recalculatePositionConfidence(
  pendings: PendingEncounterRecord[]
): number {
  let totalConfidenceWeighted = 0;
  let totalPages = 0;

  for (const pending of pendings) {
    const pageCount = pending.end_page - pending.start_page + 1;
    totalConfidenceWeighted += pending.position_confidence * pageCount;
    totalPages += pageCount;
  }

  return totalPages > 0 ? totalConfidenceWeighted / totalPages : 0.5;
}
```

**Example:**
```
Chunk 1: 50 pages, confidence 0.95 → weight = 47.5
Chunk 2: 50 pages, confidence 0.88 → weight = 44.0
Chunk 3: 42 pages, confidence 0.92 → weight = 38.64

Total: 142 pages, weighted sum = 130.14
Final confidence: 130.14 / 142 = 0.917
```

## Page Range Reconciliation

### Existing Logic (Reuse from pending-reconciler.ts)

The `mergePageRanges()` function already handles this correctly:

```typescript
function mergePageRanges(ranges: number[][]): number[][] {
  if (ranges.length === 0) return [];

  // Sort by start page
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);

  const merged: number[][] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    // Check if ranges overlap or are adjacent
    if (current[0] <= last[1] + 1) {
      // Merge: extend the last range to cover current
      last[1] = Math.max(last[1], current[1]);
    } else {
      // No overlap: add as new range
      merged.push(current);
    }
  }

  return merged;
}
```

**Example:**
```
Chunk 1: [[1, 50]]
Chunk 2: [[51, 100]]
Chunk 3: [[101, 142]]

Merged: [[1, 142]]  // Adjacent ranges combined
```

## Batching Analysis Reconciliation

### Challenge: Multiple Batching Analyses

Each chunk produces `page_separation_analysis` JSON with safe split points:

```json
// Chunk 1 (pages 1-50)
{
  "chunk_number": 1,
  "pages_analyzed": [1, 50],
  "safe_split_points": [
    { "split_location": "inter_page", "between_pages": [11, 12], ... },
    { "split_location": "intra_page", "page": 28, ... }
  ]
}

// Chunk 2 (pages 51-100)
{
  "chunk_number": 2,
  "pages_analyzed": [51, 100],
  "safe_split_points": [
    { "split_location": "inter_page", "between_pages": [62, 63], ... },
    { "split_location": "intra_page", "page": 89, ... }
  ]
}

// Chunk 3 (pages 101-142)
{
  "chunk_number": 3,
  "pages_analyzed": [101, 142],
  "safe_split_points": [
    { "split_location": "inter_page", "between_pages": [120, 121], ... }
  ]
}
```

### Solution: Aggregate to Shell Files Table

**Storage Location:** `shell_files.page_separation_analysis`

**Aggregation Logic:**

```typescript
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
    const analysis = chunk.page_separation_analysis;
    if (analysis?.safe_split_points) {
      allSplitPoints.push(...analysis.safe_split_points);
    }
  }

  // 3. Sort by page number
  allSplitPoints.sort((a, b) => {
    const pageA = a.split_location === 'inter_page'
      ? a.between_pages[0]
      : a.page;
    const pageB = b.split_location === 'inter_page'
      ? b.between_pages[0]
      : b.page;
    return pageA - pageB;
  });

  // 4. Calculate summary statistics
  const interPageCount = allSplitPoints.filter(s => s.split_location === 'inter_page').length;
  const intraPageCount = allSplitPoints.filter(s => s.split_location === 'intra_page').length;
  const avgConfidence = allSplitPoints.reduce((sum, s) => sum + s.confidence, 0) / allSplitPoints.length;

  // 5. Store in shell_files table
  const finalAnalysis = {
    version: '2.0',
    total_pages: totalPages,
    analysis_date: new Date().toISOString(),
    safe_split_points: allSplitPoints,
    summary: {
      total_splits: allSplitPoints.length,
      inter_page_splits: interPageCount,
      intra_page_splits: intraPageCount,
      avg_confidence: avgConfidence,
      pages_per_split: totalPages / allSplitPoints.length
    }
  };

  await supabase
    .from('shell_files')
    .update({ page_separation_analysis: finalAnalysis })
    .eq('id', shellFileId);
}
```

**Result (shell_files.page_separation_analysis):**
```json
{
  "version": "2.0",
  "total_pages": 142,
  "analysis_date": "2024-11-15T10:30:00Z",
  "safe_split_points": [
    { "split_location": "inter_page", "between_pages": [11, 12], ... },
    { "split_location": "intra_page", "page": 28, ... },
    { "split_location": "inter_page", "between_pages": [62, 63], ... },
    { "split_location": "intra_page", "page": 89, ... },
    { "split_location": "inter_page", "between_pages": [120, 121], ... }
  ],
  "summary": {
    "total_splits": 5,
    "inter_page_splits": 3,
    "intra_page_splits": 2,
    "avg_confidence": 0.93,
    "pages_per_split": 28.4
  }
}
```

## Complete Reconciliation Algorithm

### Step-by-Step Process

```typescript
async function reconcilePendingEncountersV2(
  sessionId: string,
  shellFileId: string,
  totalPages: number
): Promise<EncounterMetadata[]> {

  // STEP 1: Group pending encounters by cascade_id
  const { data: pendings } = await supabase
    .from('pass05_pending_encounters')
    .select('*')
    .eq('session_id', sessionId)
    .eq('status', 'pending');

  const cascadeGroups = groupBy(pendings, p => p.cascade_id);

  const finalEncounters: EncounterMetadata[] = [];

  // STEP 2: Process each cascade group
  for (const [cascadeId, groupPendings] of cascadeGroups) {
    console.log(`[Reconcile] Processing cascade ${cascadeId} (${groupPendings.length} chunks)`);

    // STEP 2A: Merge position data
    const startPosition = mergeStartPositions(groupPendings);
    const endPosition = mergeEndPositions(groupPendings);
    const positionConfidence = recalculatePositionConfidence(groupPendings);

    // STEP 2B: Merge page ranges
    const allPageRanges = groupPendings.flatMap(p => p.page_ranges || []);
    const mergedPageRanges = mergePageRanges(allPageRanges);

    // STEP 2C: Take clinical data from first pending (all should be consistent)
    const firstPending = groupPendings.sort((a, b) => a.chunk_number - b.chunk_number)[0];

    // STEP 2D: Insert final encounter
    const { data: inserted } = await supabase
      .from('healthcare_encounters')
      .insert({
        patient_id: firstPending.patient_id,
        primary_shell_file_id: shellFileId,
        encounter_type: firstPending.encounter_type,
        encounter_start_date: firstPending.encounter_start_date,
        encounter_end_date: firstPending.encounter_end_date,
        encounter_timeframe_status: firstPending.encounter_timeframe_status,
        date_source: firstPending.date_source,
        provider_name: firstPending.provider_name,
        facility_name: firstPending.facility_name,

        // Position data (V2 addition)
        start_page: startPosition.start_page,
        start_boundary_type: startPosition.start_boundary_type,
        start_marker: startPosition.start_marker,
        start_text_y_top: startPosition.start_text_y_top,
        start_text_height: startPosition.start_text_height,
        start_y: startPosition.start_y,

        end_page: endPosition.end_page,
        end_boundary_type: endPosition.end_boundary_type,
        end_marker: endPosition.end_marker,
        end_text_y_top: endPosition.end_text_y_top,
        end_text_height: endPosition.end_text_height,
        end_y: endPosition.end_y,

        position_confidence: positionConfidence,

        page_ranges: mergedPageRanges,
        pass_0_5_confidence: firstPending.confidence,
        summary: firstPending.summary,
        identified_in_pass: 'pass_0_5',
        source_method: 'ai_pass_0_5'
      })
      .select()
      .single();

    // STEP 2E: Mark all pendings as completed
    for (const pending of groupPendings) {
      await supabase
        .from('pass05_pending_encounters')
        .update({
          status: 'completed',
          reconciled_to: inserted.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', pending.id);
    }

    // STEP 2F: Complete cascade chain tracking
    await supabase
      .from('pass05_cascade_chains')
      .update({
        final_encounter_id: inserted.id,
        last_chunk: Math.max(...groupPendings.map(p => p.chunk_number)),
        completed_at: new Date().toISOString()
      })
      .eq('cascade_id', cascadeId);

    finalEncounters.push(inserted);
  }

  // STEP 3: Aggregate batching analysis to shell_files
  await aggregateBatchingAnalysis(sessionId, shellFileId, totalPages);

  // STEP 4: Update page assignments (reuse existing logic)
  await updatePageAssignmentsAfterReconciliation(sessionId, shellFileId);

  // STEP 5: Recalculate encounter metrics (reuse existing logic)
  await recalculateEncounterMetrics(sessionId, shellFileId);

  return finalEncounters;
}
```

## Error Handling and Validation

### Validation Checks Before Reconciliation

```typescript
function validatePendingGroupForReconciliation(
  pendings: PendingEncounterRecord[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check 1: All pendings have same cascade_id
  const cascadeIds = new Set(pendings.map(p => p.cascade_id));
  if (cascadeIds.size > 1) {
    errors.push(`Multiple cascade IDs in group: ${Array.from(cascadeIds).join(', ')}`);
  }

  // Check 2: All pendings have same encounter type
  const encounterTypes = new Set(pendings.map(p => p.encounter_type));
  if (encounterTypes.size > 1) {
    errors.push(`Multiple encounter types: ${Array.from(encounterTypes).join(', ')}`);
  }

  // Check 3: Sequential chunk numbers (no gaps)
  const chunkNumbers = pendings.map(p => p.chunk_number).sort((a, b) => a - b);
  for (let i = 1; i < chunkNumbers.length; i++) {
    if (chunkNumbers[i] !== chunkNumbers[i - 1] + 1) {
      errors.push(`Chunk gap detected: ${chunkNumbers[i - 1]} -> ${chunkNumbers[i]}`);
    }
  }

  // Check 4: Start page of chunk N+1 should be >= end page of chunk N
  const sorted = pendings.sort((a, b) => a.chunk_number - b.chunk_number);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start_page < sorted[i - 1].end_page) {
      errors.push(`Page overlap: Chunk ${sorted[i - 1].chunk_number} ends at ${sorted[i - 1].end_page}, Chunk ${sorted[i].chunk_number} starts at ${sorted[i].start_page}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

### Handling Invalid Pendings

```typescript
async function handleInvalidPendingGroup(
  cascadeId: string,
  pendings: PendingEncounterRecord[],
  errors: string[]
): Promise<void> {
  console.error(`[Reconcile] Validation failed for cascade ${cascadeId}:`, errors);

  // Mark all pendings as requiring manual review
  for (const pending of pendings) {
    await supabase
      .from('pass05_pending_encounters')
      .update({
        status: 'abandoned',
        requires_review: true,
        review_reason: `Reconciliation validation failed: ${errors.join('; ')}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', pending.id);
  }

  // Log reconciliation failure
  await supabase
    .from('pass05_reconciliation_log')
    .insert({
      session_id: pendings[0].session_id,
      cascade_id: cascadeId,
      pending_ids: pendings.map(p => p.id),
      match_type: 'validation_failed',
      confidence: 0,
      reasons: errors.join('\n'),
      created_at: new Date().toISOString()
    });
}
```

## Position Coordinate Edge Cases

### Case 1: Missing Coordinates (Coordinate Extraction Failed)

**Scenario:** AI provided text marker, but code couldn't find it in OCR

```typescript
if (pending.end_boundary_type === 'intra_page' && !pending.end_y) {
  console.warn(`[Reconcile] Missing coordinates for intra_page boundary on page ${pending.end_page}`);

  // Option 1: Degrade to inter_page
  pending.end_boundary_type = 'inter_page';
  pending.end_marker = 'coordinate extraction failed, using page boundary';
  pending.position_confidence *= 0.9;  // Reduce confidence

  // Option 2: Skip this pending and rely on others in cascade
  // (Only viable if multiple pendings exist)
}
```

### Case 2: Conflicting Coordinates (Multiple Chunks Report Different Y)

**Scenario:** Chunk 1 says page 50 ends at Y=2800, Chunk 2 says page 51 starts at Y=100

**Solution:** Trust the chunk that "owns" that page

```typescript
// For start position: Trust first chunk
const startCoords = firstPending.start_text_y_top;

// For end position: Trust last chunk
const endCoords = lastPending.end_text_y_top;

// Never merge coordinates from different chunks for same boundary
```

### Case 3: Inter-Page Boundary (No Coordinates Needed)

```typescript
if (merged.start_boundary_type === 'inter_page') {
  // NULL out all coordinate fields
  merged.start_text_y_top = null;
  merged.start_text_height = null;
  merged.start_y = null;
}

if (merged.end_boundary_type === 'inter_page') {
  merged.end_text_y_top = null;
  merged.end_text_height = null;
  merged.end_y = null;
}
```

## Testing Strategy

### Unit Tests

```typescript
describe('Position Data Reconciliation', () => {
  it('should use first chunk for start position', () => {
    const pendings = [
      { chunk_number: 1, start_page: 1, start_marker: 'ADMISSION NOTE', start_y: 100 },
      { chunk_number: 2, start_page: 51, start_marker: 'continuation', start_y: null },
      { chunk_number: 3, start_page: 101, start_marker: 'continuation', start_y: null }
    ];

    const result = mergeStartPositions(pendings);

    expect(result.start_page).toBe(1);
    expect(result.start_marker).toBe('ADMISSION NOTE');
    expect(result.start_y).toBe(100);
  });

  it('should use last chunk for end position', () => {
    const pendings = [
      { chunk_number: 1, end_page: 50, end_marker: 'CONTINUED', end_y: 2800 },
      { chunk_number: 2, end_page: 100, end_marker: 'CONTINUED', end_y: 2750 },
      { chunk_number: 3, end_page: 142, end_marker: 'DISCHARGE', end_y: 1850 }
    ];

    const result = mergeEndPositions(pendings);

    expect(result.end_page).toBe(142);
    expect(result.end_marker).toBe('DISCHARGE');
    expect(result.end_y).toBe(1850);
  });

  it('should calculate weighted average confidence', () => {
    const pendings = [
      { start_page: 1, end_page: 50, position_confidence: 0.95 },   // 50 pages
      { start_page: 51, end_page: 100, position_confidence: 0.88 }, // 50 pages
      { start_page: 101, end_page: 142, position_confidence: 0.92 } // 42 pages
    ];

    const result = recalculatePositionConfidence(pendings);

    // (0.95*50 + 0.88*50 + 0.92*42) / 142 = 0.917
    expect(result).toBeCloseTo(0.917, 2);
  });
});
```

### Integration Tests

```typescript
describe('Full Reconciliation Flow', () => {
  it('should reconcile 3-chunk cascade with position data', async () => {
    const sessionId = 'test-session-123';

    // Insert 3 pending encounters with same cascade_id
    await insertTestPendings([
      { cascade_id: 'cascade_test_001_01_abc123', chunk_number: 1, start_page: 1, end_page: 50 },
      { cascade_id: 'cascade_test_001_01_abc123', chunk_number: 2, start_page: 51, end_page: 100 },
      { cascade_id: 'cascade_test_001_01_abc123', chunk_number: 3, start_page: 101, end_page: 142 }
    ]);

    const result = await reconcilePendingEncountersV2(sessionId, 'test-file-id', 142);

    expect(result.length).toBe(1);
    expect(result[0].start_page).toBe(1);
    expect(result[0].end_page).toBe(142);
    expect(result[0].page_ranges).toEqual([[1, 142]]);
  });
});
```

## Performance Considerations

### Expected Overhead

**Per-encounter reconciliation overhead:**
- Position merging: ~1ms (simple sorting + selection)
- Page range merging: ~5ms (array sorting + iteration)
- Database inserts: ~50-100ms (network latency)

**For 142-page document (1 encounter, 3 chunks):**
- Total reconciliation: ~100-150ms
- Negligible compared to chunk processing (~60 seconds total)

### Optimization: Batch Database Operations

```typescript
// Instead of inserting encounters one by one
for (const cascade of cascades) {
  await insertEncounter(cascade);  // 100ms each = 1 second for 10 encounters
}

// Batch insert all at once
const allEncounters = cascades.map(buildEncounterRecord);
await supabase.from('healthcare_encounters').insert(allEncounters);  // 100ms total
```

## Migration Path

### Phase 1: Extend Existing Reconciliation (Current Priority)

1. Update `reconcilePendingEncountersV2()` to handle position fields
2. Add `mergeStartPositions()` and `mergeEndPositions()` functions
3. Add `recalculatePositionConfidence()` function
4. Add validation checks for position data
5. Write comprehensive tests

### Phase 2: Add Batching Analysis Aggregation

1. Implement `aggregateBatchingAnalysis()` function
2. Update `shell_files` table to store aggregated analysis
3. Test with multi-chunk documents

### Phase 3: Monitor and Optimize

1. Add metrics for reconciliation performance
2. Log position data conflicts for manual review
3. Optimize database batch operations if needed

## Conclusion

The V2 reconciliation strategy seamlessly integrates position tracking with Strategy A's cascade-based encounter linking:

1. **Simple merge logic:** First chunk = start, last chunk = end
2. **Weighted confidence:** Reflects accuracy across all chunks
3. **Page range consolidation:** Existing logic works perfectly
4. **Batching analysis:** Aggregated to shell_files for downstream use
5. **Robust validation:** Catches edge cases before they become problems

**Key Insight:** Position data reconciliation is SIMPLER than clinical data reconciliation because we can trust chunk order (first chunk sees true start, last chunk sees true end).

**Next Steps:**
1. Implement updated reconciliation logic in `pending-reconciler.ts`
2. Add comprehensive test coverage
3. Monitor real-world reconciliation success rate
4. Iterate based on edge cases discovered in production
