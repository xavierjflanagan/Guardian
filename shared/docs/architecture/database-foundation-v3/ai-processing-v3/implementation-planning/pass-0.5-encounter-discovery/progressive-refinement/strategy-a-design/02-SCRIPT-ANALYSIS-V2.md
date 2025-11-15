# Pass 0.5 Strategy A - Script Analysis V2

**Date:** November 15, 2024
**Version:** 2.0
**Supersedes:** 02-SCRIPT-ANALYSIS.md (v1.0, Nov 14, 2024)
**Purpose:** Comprehensive script change plan incorporating design iterations

## Changelog from V1

**Major Design Iterations Since V1:**
- Position tracking evolved: 5-position strings → inter_page/intra_page with Y-coordinates
- OCR integration design completed (two-stage: AI markers + code extraction)
- Batching analysis added to V11 prompt (safe split points WITHIN encounters)
- Reconciliation strategy extended to handle position data merging
- Column count increased: 47 → 58 new columns

**Critical Gaps Identified in V1:**
1. **coordinate-extractor.ts** - Entire script missing from V1 analysis (CRITICAL)
2. **Position data merging** - Reconciler complexity underestimated
3. **Batching analysis aggregation** - Not considered in V1
4. **Validation requirements** - Position data needs comprehensive checks
5. **Page assignment persistence** - Missing from chunk-processor flow

**Updated Estimates:**
- Scripts to create: 4 → 6-7 (3 new additions)
- Scripts to modify: 5 → 5 (but 2 have MUCH higher complexity)
- Timeline: 4 weeks → 4-5 weeks

---

## Directory Structure

```
apps/render-worker/src/pass05/
├── Core Scripts
├── progressive/
│   ├── session-manager.ts
│   ├── chunk-processor.ts
│   ├── pending-reconciler.ts
│   ├── handoff-builder.ts
│   ├── database.ts
│   ├── types.ts
│   ├── coordinate-extractor.ts (NEW)
│   ├── position-validator.ts (NEW)
│   └── batching-aggregator.ts (NEW - recommended)
├── providers/
│   ├── base-provider.ts
│   ├── google-provider.ts
│   ├── openai-provider.ts
│   └── provider-factory.ts
├── models/
│   ├── model-registry.ts
│   └── model-selector.ts
└── aiPrompts.v11.ts (NEW)
```

---

## Part 1: Script Categories

### 1. KEEP AS-IS (Infrastructure) ✅

**Status:** No changes required

#### Provider Scripts (`providers/`)
- `base-provider.ts` - Abstract base class for AI providers
- `google-provider.ts` - Google AI (Gemini) implementation
- `openai-provider.ts` - OpenAI GPT implementation
- `provider-factory.ts` - Factory pattern for provider selection

**Purpose:** Abstracts AI model interfaces, handles API calls
**Strategy A Impact:** None - works perfectly for new system

#### Model Management (`models/`)
- `model-registry.ts` - Available models and configurations
- `model-selector.ts` - Model selection logic

**Purpose:** Manages which AI model to use
**Strategy A Impact:** None - compatible with Strategy A

---

### 2. MODIFY SIGNIFICANTLY ⚠️

#### session-manager.ts - CONFIRMED (No New Changes)

**Current Purpose:** Manages progressive sessions for >100 page documents

**V1 Analysis:** Remove page count threshold check, add cascade tracking

**V2 Update:** No additional changes from design iterations

**Strategy A Changes:**
- Remove page count threshold check → ALL documents use progressive
- Add cascade_id tracking
- Simplify metrics calculation
- Universal entry point for ALL documents

**Complexity:** MEDIUM (as originally estimated)

---

#### chunk-processor.ts - COMPLEXITY INCREASED ⚠️⚠️

**Current Purpose:** Processes individual chunks

**V1 Analysis:** "Add cascade_id generation, implement position extraction"

**V2 CRITICAL ADDITIONS:**
1. Coordinate extraction integration (OCR bbox lookup)
2. Batching analysis coordinate extraction
3. Page assignment persistence
4. Position data validation

**NEW Requirements:**

##### 1. Coordinate Extraction Integration

```typescript
import { extractCoordinatesForMarker } from './coordinate-extractor';

// After AI response parsing
for (const encounter of aiResponse.encounters) {
  // Extract coordinates for intra_page boundaries
  const startCoords = encounter.start_boundary_type === 'intra_page'
    ? extractCoordinatesForMarker(
        ocrPages,
        encounter.start_page,
        encounter.start_marker
      )
    : null;

  const endCoords = encounter.end_boundary_type === 'intra_page'
    ? extractCoordinatesForMarker(
        ocrPages,
        encounter.end_page,
        encounter.end_marker
      )
    : null;

  // Error Handling: Fallback if extraction failed
  // Degrade to inter_page boundary with reduced confidence
  if (startCoords && !startCoords.found && encounter.start_boundary_type === 'intra_page') {
    encounter.start_boundary_type = 'inter_page';
    encounter.start_marker = 'coordinate extraction failed, using page boundary';
    encounter.position_confidence *= 0.9;  // Reduce confidence by 10%

    logger.warn({
      encounter_index: encounter.encounter_index,
      original_marker: encounter.start_marker,
      fallback: 'degraded to inter_page',
      reason: 'coordinate extraction failure'
    });
  }

  // Similar fallback for end boundary
  if (endCoords && !endCoords.found && encounter.end_boundary_type === 'intra_page') {
    encounter.end_boundary_type = 'inter_page';
    encounter.end_marker = 'coordinate extraction failed, using page boundary';
    encounter.position_confidence *= 0.9;

    logger.warn({
      encounter_index: encounter.encounter_index,
      original_marker: encounter.end_marker,
      fallback: 'degraded to inter_page',
      reason: 'coordinate extraction failure'
    });
  }
}
```

##### 2. Batching Analysis Coordinate Extraction

```typescript
// Process batching analysis from AI response
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

  // Store in chunk_results
  await supabase.from('pass05_chunk_results').update({
    page_separation_analysis: aiResponse.page_separation_analysis
  }).eq('id', chunkResultId);
}
```

##### 3. Pending Encounter Insertion (13 new position fields)

```typescript
// Insert pending encounter with position data
await supabase.from('pass05_pending_encounters').insert({
  session_id: sessionId,
  pending_id: generatedPendingId,
  cascade_id: cascadeId,
  chunk_number: chunkNumber,
  is_cascading: encounter.is_cascading,
  continues_previous: encounter.continues_previous,

  // Position data (NEW - 13 fields)
  start_page: encounter.start_page,
  start_boundary_type: encounter.start_boundary_type,
  start_marker: encounter.start_marker,
  start_text_y_top: startCoords?.text_y_top || null,
  start_text_height: startCoords?.text_height || null,
  start_y: startCoords?.split_y || null,

  end_page: encounter.end_page,
  end_boundary_type: encounter.end_boundary_type,
  end_marker: encounter.end_marker,
  end_text_y_top: endCoords?.text_y_top || null,
  end_text_height: endCoords?.text_height || null,
  end_y: endCoords?.split_y || null,

  position_confidence: encounter.position_confidence,

  // Clinical data...
  encounter_type: encounter.encounter_type,
  // ...
});
```

##### 4. Page Assignment Persistence

```typescript
// Store page assignments with encounter_index → pending_id mapping
// IMPORTANT: Pages are document-absolute (1-N), NOT chunk-relative

// Process each encounter to create pending_id → encounter_index mapping
for (const encounter of aiResponse.healthcare_encounters) {
  const encounterIndex = encounter.encounter_index;  // AI's numeric ID (1, 2, 3...)
  const pendingId = generatePendingId();  // System-generated temp ID

  // Store pending encounter
  await supabase.from('pass05_pending_encounters').insert({
    pending_id: pendingId,
    // ... encounter data
  });

  // Map encounter_index → pending_id for page assignments
  for (const assignment of aiResponse.page_assignments) {
    if (assignment.encounter_index === encounterIndex) {
      await supabase.from('pass05_page_assignments').insert({
        shell_file_id: shellFileId,
        page_num: assignment.page,  // Document-absolute page number
        encounter_id: pendingId,    // <-- Mapping: encounter_index → pending_id
        justification: assignment.justification,
        created_at: new Date().toISOString()
      });
    }
  }
}

// Note: encounter_id will be updated to final healthcare_encounters.id
// during reconciliation via updatePageAssignmentsAfterReconciliation()
```

**Complexity:** HIGH → VERY HIGH (V1 underestimated)

---

#### pending-reconciler.ts - MAJOR REWRITE + POSITION MERGING

**Current Purpose:** Complex reconciliation with fixes 2A/2B/2C

**V1 Analysis:** "Complete rewrite, group by cascade_id"

**V2 CRITICAL ADDITIONS:**
1. Position data merging (start, end, confidence)
2. Batching analysis aggregation to shell_files
3. Position validation before final insert

**NEW Requirements:**

##### 1. Position Merging Functions

```typescript
/**
 * Merge start positions from multiple chunks
 * Rule: Use FIRST chunk's start position
 */
function mergeStartPositions(pendings: PendingEncounterRecord[]): StartPosition {
  const sorted = pendings.sort((a, b) => a.chunk_number - b.chunk_number);
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

/**
 * Merge end positions from multiple chunks
 * Rule: Use LAST chunk's end position
 */
function mergeEndPositions(pendings: PendingEncounterRecord[]): EndPosition {
  const sorted = pendings.sort((a, b) => a.chunk_number - b.chunk_number);
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

/**
 * Calculate weighted average position confidence
 */
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

##### 2. Batching Analysis Aggregation

```typescript
/**
 * Aggregate batching analyses from all chunks to shell_files table
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
    const analysis = chunk.page_separation_analysis;
    if (analysis?.safe_split_points) {
      allSplitPoints.push(...analysis.safe_split_points);
    }
  }

  // 3. Sort by page number
  allSplitPoints.sort((a, b) => {
    const pageA = a.split_location === 'inter_page' ? a.between_pages[0] : a.page;
    const pageB = b.split_location === 'inter_page' ? b.between_pages[0] : b.page;
    return pageA - pageB;
  });

  // 3.5. Deduplicate split points
  // Adjacent chunks might identify the same split at chunk boundaries
  const uniqueSplits: SafeSplitPoint[] = [];
  for (const split of allSplitPoints) {
    const splitPage = split.split_location === 'inter_page'
      ? split.between_pages[0]
      : split.page;

    // Check if we already have a split at this page
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

  // 4. Calculate summary statistics (using deduplicated splits)
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
```

##### 3. Main Reconciliation Function (Updated)

```typescript
async function reconcilePendingEncountersV2(
  sessionId: string,
  shellFileId: string,
  totalPages: number
): Promise<EncounterMetadata[]> {

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

  // Fetch all pending encounters (safe after guard check)
  const { data: pendings } = await supabase
    .from('pass05_pending_encounters')
    .select('*')
    .eq('session_id', sessionId);

  // Group by cascade_id
  const cascadeGroups = groupBy(pendings, p => p.cascade_id);

  for (const [cascadeId, groupPendings] of cascadeGroups) {
    // Merge position data (NEW)
    const startPosition = mergeStartPositions(groupPendings);
    const endPosition = mergeEndPositions(groupPendings);
    const positionConfidence = recalculatePositionConfidence(groupPendings);

    // Merge page ranges (existing logic)
    const allPageRanges = groupPendings.flatMap(p => p.page_ranges || []);
    const mergedPageRanges = mergePageRanges(allPageRanges);

    // Insert final encounter with position data
    await supabase.from('healthcare_encounters').insert({
      // Clinical data...
      patient_id: groupPendings[0].patient_id,
      encounter_type: groupPendings[0].encounter_type,
      // ...

      // Position data (NEW - 13 fields)
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
      cascade_id: cascadeId,
      chunk_count: groupPendings.length
    });
  }

  // Aggregate batching analysis (NEW)
  await aggregateBatchingAnalysis(sessionId, shellFileId, totalPages);

  // Existing logic...
  await updatePageAssignmentsAfterReconciliation(sessionId, shellFileId);
  await recalculateEncounterMetrics(sessionId, shellFileId);
}
```

**Complexity:** MEDIUM → VERY HIGH (V1 significantly underestimated)

---

#### handoff-builder.ts - CONFIRMED SIMPLIFICATION

**V1 Analysis:** "Massive simplification, only cascade_id + minimal context"

**V2 Update:** No changes from design iterations - V1 was correct

**New Structure:**
```json
{
  "cascade_id": "cascade_abc123",
  "encounter_type": "hospital_admission",
  "summary_snapshot": "Brief context...",
  "confidence": 0.95
}
```

**Complexity:** LOW (simplification confirmed)

---

#### post-processor.ts - ADD VALIDATION LOGIC

**V1 Analysis:** "Add cascade_id generation, add position field extraction"

**V2 Addition:** Position data validation

**NEW Requirements:**

```typescript
/**
 * Validate position data before storing
 */
function validatePositionData(encounter: any): ValidationResult {
  const errors: string[] = [];

  // Check 1: start_page <= end_page
  if (encounter.start_page > encounter.end_page) {
    errors.push(`start_page (${encounter.start_page}) > end_page (${encounter.end_page})`);
  }

  // Check 2: inter_page boundaries should have NULL coordinates
  if (encounter.start_boundary_type === 'inter_page') {
    if (encounter.start_text_y_top !== null || encounter.start_y !== null) {
      errors.push('inter_page boundary should have NULL coordinates');
    }
  }

  // Check 3: intra_page boundaries should have valid coordinates
  if (encounter.start_boundary_type === 'intra_page') {
    if (encounter.start_y === null) {
      errors.push('intra_page start boundary missing coordinates');
    }
  }

  // Check 4: END boundary - inter_page should have NULL coordinates
  if (encounter.end_boundary_type === 'inter_page') {
    if (encounter.end_text_y_top !== null || encounter.end_y !== null) {
      errors.push('inter_page end boundary should have NULL coordinates');
    }
  }

  // Check 5: END boundary - intra_page should have valid coordinates
  if (encounter.end_boundary_type === 'intra_page') {
    if (encounter.end_y === null) {
      errors.push('intra_page end boundary missing coordinates');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

**Complexity:** LOW → MEDIUM (validation added)

---

### 3. DELETE (Legacy/Obsolete) 🗑️

**No changes from V1 - still valid**

#### Old Prompt Files
- `aiPrompts.v2.7.ts`
- `aiPrompts.v2.8.ts`
- `aiPrompts.v2.9.ts`
- `aiPrompts.ts`

**Action:** Delete after confirming no dependencies

#### manifestBuilder.ts
**Action:** Investigate dependencies, then delete if unused

#### encounterDiscovery.ts
**Action:** Delete after migration complete

---

### 4. CREATE NEW 🆕

#### aiPrompts.v11.ts - CONFIRMED

**V1 Analysis:** Still correct

**Purpose:** Unified progressive prompt for Strategy A
- Single prompt for all document sizes
- Cascade-aware instructions
- Position granularity support (inter_page/intra_page)
- Batching analysis output
- Pseudo-encounter detection (Timeline Test)

**Complexity:** MEDIUM

---

#### NEW SCRIPT #1: coordinate-extractor.ts (CRITICAL - MISSING FROM V1) 🚨

**Purpose:** Extract OCR bounding box coordinates for text markers

**V1 Gap:** This entire script was NOT identified in original analysis

**Complete Specification:** See OCR-INTEGRATION-DESIGN.md

**Key Functions:**

```typescript
interface CoordinateExtractionResult {
  text_y_top: number;
  text_height: number;
  split_y: number;
  found: boolean;
  confidence: number;
}

/**
 * Extract coordinates for text marker
 *
 * Multiple Match Policy:
 * - Uses .find() to return FIRST match
 * - Assumes AI provides disambiguating context if duplicates exist
 * - Example: "just before second occurrence of 'LAB RESULTS'"
 * - In practice, medical headers are typically unique per page
 */
function extractCoordinatesForMarker(
  ocrPages: OCRPage[],
  pageNumber: number,
  marker: string
): CoordinateExtractionResult;

function parseMarkerText(marker: string): string;

function findFuzzyMatch(
  lines: Array<{ text: string; bbox: any; confidence: number }>,
  searchText: string
): { bbox: any; confidence: number } | null;

function validateCoordinates(
  coords: CoordinateExtractionResult,
  page: OCRPage
): boolean;
```

**Complexity:** MEDIUM
**Dependencies:** OCR data from `ocr-persistence.ts`
**Priority:** CRITICAL PATH - without this, intra-page boundaries non-functional

---

#### NEW SCRIPT #2: position-validator.ts (NEW - NOT IN V1)

**Purpose:** Validate position data consistency and logic

**V1 Gap:** Validation requirements emerged from design iterations

**Key Functions:**

```typescript
interface PositionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateEncounterPosition(encounter: any): PositionValidationResult;

function validateMultiEncounterPage(
  encounters: any[],
  pageNumber: number
): PositionValidationResult;

function validateCascadePositions(
  pendings: PendingEncounterRecord[]
): PositionValidationResult;
```

**Complexity:** LOW-MEDIUM
**Priority:** HIGH - prevents invalid data

---

#### NEW SCRIPT #3: batching-aggregator.ts (RECOMMENDED - NOT IN V1)

**Purpose:** Aggregate batching analysis from chunks to shell_files

**V1 Gap:** Batching analysis was added in later design iterations

**Rationale:** Keep reconciler focused, extract batching logic to separate module

**Key Functions:**

```typescript
async function aggregateBatchingAnalysis(
  sessionId: string,
  shellFileId: string,
  totalPages: number
): Promise<void>;

function validateBatchingSplits(
  splits: SafeSplitPoint[]
): ValidationResult;

function calculateBatchingSummary(
  splits: SafeSplitPoint[],
  totalPages: number
): BatchingSummary;
```

**Complexity:** LOW
**Priority:** MEDIUM - could be inlined in reconciler
**Recommendation:** Separate for cleaner architecture

---

#### cascade-manager.ts - CONFIRMED FROM V1

**V1 Analysis:** Still correct

**Purpose:** Manage cascade ID lifecycle
- Generate unique cascade IDs
- Track cascade chains
- Map cascade to final IDs

**Complexity:** MEDIUM

---

#### metrics-aggregator.ts - CONFIRMED FROM V1

**V1 Analysis:** Still correct

**Purpose:** Calculate final session metrics
- Sum chunk costs
- Count final encounters
- Calculate processing time

**Complexity:** LOW

---

## Part 2: Updated Script Categories Summary

### KEEP AS-IS ✅ (6 scripts)
- `base-provider.ts`
- `google-provider.ts`
- `openai-provider.ts`
- `provider-factory.ts`
- `model-registry.ts`
- `model-selector.ts`

### MODIFY SIGNIFICANTLY ⚠️ (5 scripts)
- `session-manager.ts` → MEDIUM complexity (no change from V1)
- `chunk-processor.ts` → **VERY HIGH** complexity (V1: HIGH)
- `pending-reconciler.ts` → **VERY HIGH** complexity (V1: MEDIUM)
- `handoff-builder.ts` → LOW complexity (simplification)
- `post-processor.ts` → MEDIUM complexity (V1: LOW)

### DELETE 🗑️ (6 scripts)
- `aiPrompts.v2.7.ts`
- `aiPrompts.v2.8.ts`
- `aiPrompts.v2.9.ts`
- `aiPrompts.ts`
- `manifestBuilder.ts` (if unused)
- `encounterDiscovery.ts` (after migration)

### CREATE NEW 🆕 (6-7 scripts)
- `aiPrompts.v11.ts` ✅ (confirmed from V1)
- `coordinate-extractor.ts` 🚨 (CRITICAL - missing from V1)
- `position-validator.ts` 🆕 (NEW - not in V1)
- `batching-aggregator.ts` 🆕 (RECOMMENDED - not in V1)
- `cascade-manager.ts` ✅ (confirmed from V1)
- `metrics-aggregator.ts` ✅ (confirmed from V1)

---

## Part 3: Critical Gaps from V1 Analysis

### Gap #1: OCR Integration Completely Missed 🚨

**V1 Statement:** "position-extractor.ts - Handle sub-page position data"

**Reality:** Need full coordinate extraction from OCR bounding boxes:
- Parse text markers from AI
- Search OCR data for matching text
- Extract pixel coordinates
- Calculate buffer zones
- Handle fuzzy matching
- Validate coordinates

**Impact:** CRITICAL - without this, intra-page boundaries won't work

**Resolution:** Create `coordinate-extractor.ts` with complete OCR integration

---

### Gap #2: Position Data Merging Missed

**V1 Statement:** "pending-reconciler.ts - No complex page range merging"

**Reality:** Need position data merging logic:
- Merge start positions (first chunk)
- Merge end positions (last chunk)
- Recalculate position confidence (weighted average)
- Validate merged positions

**Impact:** HIGH - multi-chunk encounters won't have accurate positions

**Resolution:** Add position merging functions to reconciler

---

### Gap #3: Batching Analysis Aggregation Missed

**V1 Statement:** No mention of batching analysis

**Reality:** Need to aggregate batching analyses from all chunks:
- Combine safe split points from all chunks
- Deduplicate splits at chunk boundaries
- Sort by page number
- Calculate summary statistics
- Store in shell_files table

**Impact:** MEDIUM - Pass 1/2 won't have batching guidance

**Resolution:** Create `batching-aggregator.ts` or inline in reconciler

---

### Gap #4: Validation Requirements Missed

**V1 Statement:** No validation logic

**Reality:** Need comprehensive validation:
- Position data consistency (start <= end, coordinate logic)
- Multi-encounter page conflicts
- Cascade position continuity
- Coordinate boundary checks

**Impact:** MEDIUM - risk of invalid data in database

**Resolution:** Create `position-validator.ts` with validation suite

---

## Part 4: Implementation Priority & Timeline

### Phase 1: Critical Path (Week 1)

**Must Have for Basic Functionality:**
1. `aiPrompts.v11.ts` - AI prompt with position tracking
2. `coordinate-extractor.ts` - Extract coordinates from OCR
3. Update `chunk-processor.ts` - Integration with coordinate extraction
4. Update `pending-reconciler.ts` - Position merging logic

**Testing:** End-to-end with 142-page document

**Deliverable:** Position tracking functional

---

### Phase 2: Reconciliation & Validation (Week 2)

**Required for Production Quality:**
5. `position-validator.ts` - Validation logic
6. `cascade-manager.ts` - Cascade tracking
7. `batching-aggregator.ts` - Batching analysis
8. `metrics-aggregator.ts` - Final metrics

**Testing:** Multi-chunk scenarios, edge cases

**Deliverable:** Full reconciliation with batching

---

### Phase 3: Cleanup & Optimization (Week 3)

**Polish and Production Readiness:**
9. Delete legacy prompts (v2.7, v2.8, v2.9)
10. Simplify `handoff-builder.ts`
11. Update `session-manager.ts`
12. Update `post-processor.ts` with validation
13. Delete `encounterDiscovery.ts`

**Testing:** Regression tests, performance benchmarks

**Deliverable:** Production-ready codebase

---

### Phase 4: Migration & Deployment (Week 4-5)

**Database + Code Deployment:**
14. Execute all table migrations (58 new columns)
15. Deploy updated worker code
16. Run production test on sample documents
17. Monitor metrics and errors
18. Iterative fixes based on real-world data

**Deliverable:** Strategy A live in production

---

## Part 5: Dependency Map

```
chunk-processor.ts
├─ DEPENDS ON: coordinate-extractor.ts (NEW - CRITICAL)
├─ DEPENDS ON: position-validator.ts (NEW)
├─ DEPENDS ON: cascade-manager.ts (NEW)
└─ UPDATES: pass05_chunk_results.page_separation_analysis

pending-reconciler.ts
├─ DEPENDS ON: position-validator.ts (NEW)
├─ DEPENDS ON: batching-aggregator.ts (NEW - or inline)
├─ READS: pass05_pending_encounters (with 18 new columns)
└─ UPDATES: healthcare_encounters (with 14 new columns)

coordinate-extractor.ts (NEW - CRITICAL)
├─ READS: OCR data from ocr-persistence.ts
└─ STANDALONE (no dependencies on other Pass 0.5 scripts)

batching-aggregator.ts (NEW)
├─ READS: pass05_chunk_results.page_separation_analysis
└─ UPDATES: shell_files.page_separation_analysis
```

---

## Part 6: Testing Requirements

### Unit Tests Required

**NEW Tests (not in V1):**

1. **coordinate-extractor.test.ts** 🚨
   - Exact text match extraction
   - Fuzzy text matching
   - Missing text handling
   - Coordinate validation
   - Buffer zone calculation

2. **position-validator.test.ts** 🆕
   - Start/end page validation
   - Inter-page NULL coordinate checks
   - Intra-page coordinate requirements
   - Multi-encounter page conflicts

3. **batching-aggregator.test.ts** 🆕
   - Multi-chunk aggregation
   - Split point deduplication
   - Summary statistics calculation
   - Duplicate detection at chunk boundaries

**UPDATED Tests (higher complexity than V1 estimated):**

4. **chunk-processor.test.ts**
   - Add: Coordinate extraction integration
   - Add: Batching analysis output
   - Add: Position validation
   - Add: Page assignment persistence

5. **pending-reconciler.test.ts**
   - Add: Position merging (start, end, confidence)
   - Add: Batching aggregation
   - Add: Multi-chunk cascade positions

---

## Part 7: Risk Assessment

### High Risk Areas

**1. Coordinate Extraction (NEW - NOT IN V1)** 🚨
- **Risk:** OCR text might not match AI markers (OCR errors, hallucinations)
- **Mitigation:** Fuzzy matching, fallback to inter_page boundaries
- **Testing:** Test with low-quality OCR documents
- **V1 Gap:** Completely missed

**2. Position Data Merging (NEW - UNDERESTIMATED IN V1)**
- **Risk:** Merging logic might lose precision or create conflicts
- **Mitigation:** Weighted confidence, validation checks
- **Testing:** Test with 5+ chunk documents
- **V1 Gap:** Complexity underestimated

**3. Pending Reconciler Rewrite**
- **Risk:** Complex logic, many edge cases
- **Mitigation:** Comprehensive test coverage, phased rollout
- **Testing:** Test all cascade scenarios
- **V1 Estimate:** MEDIUM → **V2 Reality:** VERY HIGH

### Medium Risk Areas

**4. Batching Analysis Aggregation (NEW - NOT IN V1)**
- **Risk:** Duplicate splits at chunk boundaries, incorrect sorting
- **Mitigation:** Deduplication logic, validation
- **Testing:** Test with overlapping chunk boundaries
- **V1 Gap:** Not considered

**5. Database Migration**
- **Risk:** 58 new columns (V1: 47), potential for errors
- **Mitigation:** Two-touchpoint workflow, careful review
- **Testing:** Test migrations on staging first
- **V1 Change:** Column count increased

### Low Risk Areas

**6. Cascade Manager** ✅
- **Risk:** Low - deterministic ID generation
- **V1 Estimate:** Still valid

**7. Handoff Simplification** ✅
- **Risk:** Low - reducing complexity
- **V1 Estimate:** Still valid

---

## Conclusion

### V1 vs V2 Comparison

**Original V1 Estimate (Nov 14):**
- Create: 4 scripts
- Modify: 5 scripts (LOW-MEDIUM complexity)
- Timeline: 4 weeks

**Updated V2 Reality (Nov 15):**
- Create: 6-7 scripts (3 new additions, 1 critical)
- Modify: 5 scripts (2 now VERY HIGH complexity)
- Timeline: 4-5 weeks

### What V1 Missed

1. **OCR coordinate extraction** - Entire `coordinate-extractor.ts` script
2. **Position data merging** - Reconciliation complexity underestimated
3. **Batching analysis aggregation** - Not considered
4. **Validation requirements** - Position data needs comprehensive checks
5. **Page assignment persistence** - Missing from chunk-processor flow

### Updated Complexity Assessment

**Critical Path Scripts (Must Implement):**
1. `aiPrompts.v11.ts` - AI must output position data
2. `coordinate-extractor.ts` - Convert markers to coordinates
3. `chunk-processor.ts` - Integrate coordinate extraction
4. `pending-reconciler.ts` - Merge position data across chunks

**Without these 4 scripts, Strategy A cannot function.**

### Recommendation

**Proceed with V2 updated plan** - the additional complexity is necessary for the design to work correctly. The position tracking and batching features are core to Strategy A's value proposition.

**Timeline remains realistic:** 4-5 weeks accounts for increased complexity while maintaining aggressive but achievable pace.
