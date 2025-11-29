/**
 * Pass 1 Strategy-A Batching Logic
 *
 * Created: 2025-11-29
 * Purpose: Split large encounters into batches using safe-split points
 * Reference: PASS1-STRATEGY-A-MASTER.md Section 1 Core Principles
 *
 * Batching Configuration:
 * - MIN_PAGES_PER_BATCH: 3 - Avoid tiny batches with high prompt overhead ratio
 * - MAX_PAGES_PER_BATCH: 10 - Ensure parallelism benefits on large encounters
 * - HARD_CEILING_PAGES: 50 - Absolute max before forced arbitrary split
 *
 * Batching Logic:
 * - 1-10 pages: Single batch (no split needed)
 * - 11-50 pages with safe-splits: Use splits to create optimal batches of ~10 pages
 * - 11-50 pages without safe-splits: Single batch (suboptimal but works)
 * - 51+ pages with safe-splits: Use splits to create optimal batches
 * - 51+ pages without safe-splits: Forced arbitrary splits at 50-page intervals
 */

import {
  BatchDefinition,
  EncounterData,
  SafeSplitPoint
} from './pass1-v2-types';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Minimum pages per batch
 * Avoid tiny batches with high prompt overhead ratio (~27%)
 */
export const MIN_PAGES_PER_BATCH = 3;

/**
 * Maximum pages per batch
 * Keeps batches manageable for parallel processing
 */
export const MAX_PAGES_PER_BATCH = 10;

/**
 * Hard ceiling before forced arbitrary split
 * Matches Pass 0.5 chunk size for consistency
 */
export const HARD_CEILING_PAGES = 50;

// =============================================================================
// BATCHING DECISION
// =============================================================================

/**
 * Check if an encounter needs batching
 *
 * @param pageCount - Number of pages in encounter
 * @returns True if batching should be used
 */
export function needsBatching(pageCount: number): boolean {
  return pageCount > MAX_PAGES_PER_BATCH;
}

/**
 * Check if forced arbitrary splitting is needed
 * Used when no safe-split points are available for large encounters
 *
 * @param pageCount - Number of pages in encounter
 * @param safeSplitPoints - Available safe-split points
 * @returns True if forced splitting is needed
 */
export function needsForcedSplitting(
  pageCount: number,
  safeSplitPoints: SafeSplitPoint[]
): boolean {
  return pageCount > HARD_CEILING_PAGES &&
    (!safeSplitPoints || safeSplitPoints.length === 0);
}

// =============================================================================
// OCR TEXT SLICING
// =============================================================================

/**
 * Extract page markers from OCR text
 * Looks for patterns like "--- PAGE N START ---" or "[PAGE N]"
 *
 * @param ocrText - Full OCR text
 * @returns Map of page number to start/end character positions
 */
export function extractPageBoundaries(ocrText: string): Map<number, { start: number; end: number }> {
  const boundaries = new Map<number, { start: number; end: number }>();

  // Pattern: --- PAGE N START --- ... --- PAGE N END ---
  const pageStartPattern = /---\s*PAGE\s*(\d+)\s*START\s*---/gi;
  const pageEndPattern = /---\s*PAGE\s*(\d+)\s*END\s*---/gi;

  let match: RegExpExecArray | null;
  const startPositions = new Map<number, number>();

  // Find all page starts
  while ((match = pageStartPattern.exec(ocrText)) !== null) {
    const pageNum = parseInt(match[1], 10);
    startPositions.set(pageNum, match.index);
  }

  // Find all page ends
  while ((match = pageEndPattern.exec(ocrText)) !== null) {
    const pageNum = parseInt(match[1], 10);
    const start = startPositions.get(pageNum);
    if (start !== undefined) {
      boundaries.set(pageNum, {
        start,
        end: match.index + match[0].length
      });
    }
  }

  // If no explicit boundaries found, treat entire text as page 1
  if (boundaries.size === 0) {
    boundaries.set(1, { start: 0, end: ocrText.length });
  }

  return boundaries;
}

/**
 * Slice OCR text for a specific page range
 *
 * @param ocrText - Full OCR text
 * @param startPage - Start page (1-indexed)
 * @param endPage - End page (1-indexed)
 * @returns Sliced OCR text for the page range
 */
export function sliceOcrText(
  ocrText: string,
  startPage: number,
  endPage: number
): string {
  const boundaries = extractPageBoundaries(ocrText);

  // If no boundaries found, return full text
  if (boundaries.size === 0) {
    return ocrText;
  }

  // Find the start position (from startPage)
  let sliceStart = 0;
  for (let page = startPage; page <= endPage; page++) {
    const boundary = boundaries.get(page);
    if (boundary && page === startPage) {
      sliceStart = boundary.start;
      break;
    }
  }

  // Find the end position (from endPage)
  let sliceEnd = ocrText.length;
  for (let page = endPage; page >= startPage; page--) {
    const boundary = boundaries.get(page);
    if (boundary && page === endPage) {
      sliceEnd = boundary.end;
      break;
    }
  }

  // If we couldn't find exact boundaries, estimate based on proportions
  if (sliceStart === 0 && sliceEnd === ocrText.length && boundaries.size > 0) {
    const maxPage = Math.max(...boundaries.keys());
    const charsPerPage = Math.ceil(ocrText.length / maxPage);
    sliceStart = (startPage - 1) * charsPerPage;
    sliceEnd = endPage * charsPerPage;
  }

  return ocrText.slice(sliceStart, sliceEnd);
}

// =============================================================================
// SPLIT POINT SELECTION
// =============================================================================

/**
 * Find the best split point near a target page
 *
 * @param splitPoints - Available split points
 * @param targetPage - Target page to split at
 * @param minPage - Minimum page (don't split before this)
 * @param maxPage - Maximum page (don't split after this)
 * @returns Best split point or null if none suitable
 */
function findBestSplitNear(
  splitPoints: SafeSplitPoint[],
  targetPage: number,
  minPage: number,
  maxPage: number
): SafeSplitPoint | null {
  // Filter to valid range
  const validSplits = splitPoints.filter(
    sp => sp.page >= minPage && sp.page <= maxPage
  );

  if (validSplits.length === 0) {
    return null;
  }

  // Sort by distance to target page
  validSplits.sort((a, b) => {
    const distA = Math.abs(a.page - targetPage);
    const distB = Math.abs(b.page - targetPage);
    return distA - distB;
  });

  return validSplits[0];
}

/**
 * Generate optimal split pages using safe-split points
 *
 * @param startPage - Encounter start page (1-indexed)
 * @param endPage - Encounter end page (1-indexed)
 * @param safeSplitPoints - Available safe-split points
 * @param targetBatchSize - Target pages per batch
 * @returns Array of page numbers where splits should occur
 */
function generateSplitPages(
  startPage: number,
  endPage: number,
  safeSplitPoints: SafeSplitPoint[],
  targetBatchSize: number = MAX_PAGES_PER_BATCH
): number[] {
  const pageCount = endPage - startPage + 1;

  // No splits needed for small encounters
  if (pageCount <= targetBatchSize) {
    return [];
  }

  const splitPages: number[] = [];
  let currentPage = startPage;

  while (currentPage + targetBatchSize <= endPage) {
    // Target split is targetBatchSize pages ahead
    const targetSplit = currentPage + targetBatchSize;

    // Look for a split point near the target
    const splitPoint = findBestSplitNear(
      safeSplitPoints,
      targetSplit,
      currentPage + MIN_PAGES_PER_BATCH,  // Min pages in current batch
      Math.min(targetSplit + 2, endPage)  // Allow some flexibility
    );

    if (splitPoint) {
      splitPages.push(splitPoint.page);
      currentPage = splitPoint.page;
    } else {
      // No split point found - use target directly
      splitPages.push(targetSplit);
      currentPage = targetSplit;
    }

    // Prevent infinite loop
    if (splitPages.length > 100) {
      break;
    }
  }

  return splitPages;
}

/**
 * Generate forced split pages when no safe-splits available
 *
 * @param startPage - Encounter start page
 * @param endPage - Encounter end page
 * @returns Array of page numbers for forced splits at HARD_CEILING intervals
 */
function generateForcedSplitPages(startPage: number, endPage: number): number[] {
  const splitPages: number[] = [];
  let currentPage = startPage + HARD_CEILING_PAGES;

  while (currentPage < endPage) {
    splitPages.push(currentPage);
    currentPage += HARD_CEILING_PAGES;
  }

  return splitPages;
}

// =============================================================================
// MAIN BATCHING FUNCTION
// =============================================================================

/**
 * Split an encounter into batches for parallel processing
 *
 * @param encounter - Encounter data including OCR text and safe-split points
 * @returns Array of batch definitions
 */
export function splitEncounterIntoBatches(encounter: EncounterData): BatchDefinition[] {
  const { start_page, end_page, safe_split_points, enhanced_ocr_text } = encounter;
  const pageCount = end_page - start_page + 1;

  // Single batch for small encounters
  if (!needsBatching(pageCount)) {
    return [{
      index: 0,
      pageRangeStart: start_page,
      pageRangeEnd: end_page,
      ocrTextSlice: enhanced_ocr_text
    }];
  }

  // Determine split pages
  let splitPages: number[];

  if (needsForcedSplitting(pageCount, safe_split_points)) {
    // Force splits at regular intervals
    splitPages = generateForcedSplitPages(start_page, end_page);
  } else if (safe_split_points && safe_split_points.length > 0) {
    // Use safe-split points
    splitPages = generateSplitPages(start_page, end_page, safe_split_points);
  } else {
    // No safe-splits but under hard ceiling - single batch
    return [{
      index: 0,
      pageRangeStart: start_page,
      pageRangeEnd: end_page,
      ocrTextSlice: enhanced_ocr_text
    }];
  }

  // Build batches from split pages
  const batches: BatchDefinition[] = [];
  let batchStart = start_page;

  for (let i = 0; i < splitPages.length; i++) {
    const splitPage = splitPages[i];

    // Current batch ends at split page - 1
    batches.push({
      index: i,
      pageRangeStart: batchStart,
      pageRangeEnd: splitPage - 1,
      ocrTextSlice: sliceOcrText(enhanced_ocr_text, batchStart, splitPage - 1)
    });

    batchStart = splitPage;
  }

  // Final batch from last split to end
  batches.push({
    index: splitPages.length,
    pageRangeStart: batchStart,
    pageRangeEnd: end_page,
    ocrTextSlice: sliceOcrText(enhanced_ocr_text, batchStart, end_page)
  });

  return batches;
}

/**
 * Create a single batch for an encounter (no splitting)
 *
 * @param encounter - Encounter data
 * @returns Single batch definition
 */
export function createSingleBatch(encounter: EncounterData): BatchDefinition {
  return {
    index: 0,
    pageRangeStart: encounter.start_page,
    pageRangeEnd: encounter.end_page,
    ocrTextSlice: encounter.enhanced_ocr_text
  };
}

// =============================================================================
// BATCH STATISTICS
// =============================================================================

/**
 * Get statistics about batch distribution
 *
 * @param batches - Array of batch definitions
 * @returns Batch statistics
 */
export function getBatchStatistics(batches: BatchDefinition[]): {
  batchCount: number;
  avgPagesPerBatch: number;
  minPagesInBatch: number;
  maxPagesInBatch: number;
  totalPages: number;
} {
  if (batches.length === 0) {
    return {
      batchCount: 0,
      avgPagesPerBatch: 0,
      minPagesInBatch: 0,
      maxPagesInBatch: 0,
      totalPages: 0
    };
  }

  const pageCounts = batches.map(b => b.pageRangeEnd - b.pageRangeStart + 1);
  const totalPages = pageCounts.reduce((sum, count) => sum + count, 0);

  return {
    batchCount: batches.length,
    avgPagesPerBatch: totalPages / batches.length,
    minPagesInBatch: Math.min(...pageCounts),
    maxPagesInBatch: Math.max(...pageCounts),
    totalPages
  };
}
