/**
 * Coordinate Extractor - Strategy A (V11 Marker + Region Hint Pattern)
 *
 * Purpose: Extract OCR coordinates from text markers + region hints provided by AI.
 *          Post-processing step that runs AFTER AI response to find exact Y-coordinates.
 *
 * Source: File 07 (OCR-INTEGRATION-DESIGN.md), TECHNICAL-DEBT.md DEBT-011
 * Complexity: MEDIUM-HIGH
 *
 * V11 CHANGE: Complete rewrite for marker + region hint pattern
 * ============================================================================
 * OLD APPROACH (Pre-V11):
 * - AI provided: position marker like "after header 'DISCHARGE SUMMARY'"
 * - Post-processor: Searched entire page for marker text
 * - Problem: Ambiguous when marker appears multiple times on page
 *
 * NEW APPROACH (V11+):
 * - AI provides: text_marker + marker_context + region_hint
 * - text_marker: Just the text (e.g., "DISCHARGE SUMMARY")
 * - marker_context: Additional context (e.g., "Patient: John Doe")
 * - region_hint: Approximate region ('top', 'upper_middle', 'lower_middle', 'bottom')
 * - Post-processor: Uses region hint to disambiguate duplicate markers
 *
 * Benefits:
 * - 50,000 fewer tokens per chunk (no coordinate data in AI prompt)
 * - Better disambiguation when marker appears multiple times
 * - AI focuses on semantic understanding, not coordinate extraction
 * ============================================================================
 *
 * Key Concepts:
 * - Intra-page boundary: Encounter boundary occurs WITHIN a page (not at page edge)
 * - Marker text: AI-provided text like "DISCHARGE SUMMARY"
 * - Marker context: Additional surrounding text for disambiguation
 * - Region hint: Approximate location to narrow search (top/upper_middle/lower_middle/bottom)
 * - OCR coordinates: Bounding box Y-coordinates from Google Cloud Vision
 * - Graceful degradation: Falls back to inter_page if coordinate extraction fails
 *
 * Integration:
 * - Called by post-processor.ts after AI response
 * - Queries OCR data from Google Cloud Vision results
 * - Returns coordinates or null (non-blocking)
 */

import { OCRPage, OCRWord } from '../types';

/**
 * Extracted coordinates result
 */
export interface ExtractedCoordinates {
  text_y_top: number;      // Y coordinate of text top edge (pixels from page top)
  text_height: number;     // Height of text box (pixels)
  split_y: number;         // Calculated split line (for encounter START, this is text_y_top)
  confidence: number;      // Confidence in coordinate accuracy (0-1)
  matched_text: string;    // Actual text that was matched in OCR
}

/**
 * OCR match candidate
 */
interface OCRMatch {
  text: string;
  y: number;              // Top Y coordinate
  height: number;
  confidence: number;
  page: number;
}

/**
 * Region hint type
 */
export type RegionHint = 'top' | 'upper_middle' | 'lower_middle' | 'bottom';

/**
 * Coordinate extraction configuration
 */
interface ExtractionConfig {
  fuzzyThreshold: number;       // Similarity threshold for fuzzy matching (0-1)
  maxPageHeight: number;        // Maximum expected page height (pixels)
  minTextHeight: number;        // Minimum realistic text height (pixels)
  maxTextHeight: number;        // Maximum realistic text height (pixels)
}

// Default configuration (A4 at 300 DPI)
const DEFAULT_CONFIG: ExtractionConfig = {
  fuzzyThreshold: 0.85,
  maxPageHeight: 3300,  // A4 at 300 DPI
  minTextHeight: 8,     // Tiny footnote text
  maxTextHeight: 500    // Giant header text
};

/**
 * Extract coordinates for a text marker with region hint
 *
 * V11 NEW SIGNATURE: Uses marker + context + region hint instead of position marker
 *
 * Main extraction pipeline:
 * 1. Parse marker text (clean up quotes, whitespace)
 * 2. Extract words from OCR page
 * 3. Calculate region bounds from region hint
 * 4. Search for exact match within region
 * 5. Fallback to fuzzy match if exact match fails
 * 6. If multiple matches, use marker_context to disambiguate
 * 7. Validate and calculate split_y
 *
 * @param textMarker - AI-provided text marker (e.g., "DISCHARGE SUMMARY")
 * @param markerContext - AI-provided context for disambiguation (e.g., "Patient: John Doe")
 * @param regionHint - AI-provided region hint ('top', 'upper_middle', 'lower_middle', 'bottom')
 * @param pageNumber - Page to search on (1-indexed)
 * @param ocrPage - OCR data for the page
 * @param config - Optional extraction configuration
 * @returns Extracted coordinates or null if not found
 */
export async function extractCoordinatesForMarker(
  textMarker: string | null,
  markerContext: string | null,
  regionHint: RegionHint | null,
  pageNumber: number,
  ocrPage: OCRPage,
  config: ExtractionConfig = DEFAULT_CONFIG
): Promise<ExtractedCoordinates | null> {
  // Null check: inter_page boundaries don't have markers
  if (!textMarker) {
    console.warn(`[coordinate-extractor] No text marker provided for page ${pageNumber} (inter_page boundary)`);
    return null;
  }

  // Step 1: Extract words from OCR data
  const words = extractWordsFromOCRPage(ocrPage);
  if (words.length === 0) {
    console.warn(`[coordinate-extractor] No OCR words found on page ${pageNumber}`);
    return null;
  }

  // Step 2: Calculate region bounds
  const regionBounds = calculateRegionBounds(regionHint, ocrPage, config.maxPageHeight);

  // Step 3: Extract using pre-extracted words (internal helper)
  return extractCoordinatesFromWords(
    textMarker,
    markerContext,
    regionBounds,
    pageNumber,
    words,
    config
  );
}

/**
 * Calculate Y-coordinate bounds for a region hint
 *
 * Divides page into 4 regions:
 * - top: 0% - 25% of page height
 * - upper_middle: 25% - 50% of page height
 * - lower_middle: 50% - 75% of page height
 * - bottom: 75% - 100% of page height
 *
 * @param regionHint - Region hint from AI
 * @param ocrPage - OCR page data (for actual page height)
 * @param defaultMaxHeight - Fallback height if OCR page dimensions missing
 * @returns [minY, maxY] bounds for region (null = no region filtering)
 */
function calculateRegionBounds(
  regionHint: RegionHint | null,
  ocrPage: OCRPage,
  defaultMaxHeight: number
): [number, number] | null {
  // No region hint = search entire page
  if (!regionHint) {
    return null;
  }

  // Get page height from OCR data
  const pageHeight = ocrPage.dimensions?.height || ocrPage.height || defaultMaxHeight;

  // Calculate region bounds (25% chunks)
  switch (regionHint) {
    case 'top':
      return [0, pageHeight * 0.25];
    case 'upper_middle':
      return [pageHeight * 0.25, pageHeight * 0.50];
    case 'lower_middle':
      return [pageHeight * 0.50, pageHeight * 0.75];
    case 'bottom':
      return [pageHeight * 0.75, pageHeight];
    default:
      console.warn(`[coordinate-extractor] Unknown region hint: ${regionHint}`);
      return null;
  }
}

/**
 * Internal helper: Extract coordinates from pre-extracted OCR words
 *
 * Used by both extractCoordinatesForMarker() and batchExtractCoordinates()
 * to avoid duplicate word extraction when processing multiple markers on same page.
 *
 * @param textMarker - AI-provided text marker
 * @param markerContext - AI-provided context for disambiguation
 * @param regionBounds - Region bounds [minY, maxY] or null for entire page
 * @param pageNumber - Page to search on (1-indexed)
 * @param words - Pre-extracted OCR words with coordinates
 * @param config - Extraction configuration
 * @returns Extracted coordinates or null if not found
 */
async function extractCoordinatesFromWords(
  textMarker: string,
  markerContext: string | null,
  regionBounds: [number, number] | null,
  pageNumber: number,
  words: OCRWord[],
  config: ExtractionConfig
): Promise<ExtractedCoordinates | null> {
  // Step 1: Parse marker text (remove quotes, trim whitespace)
  const searchText = parseMarkerText(textMarker);

  if (!searchText || searchText.length < 3) {
    console.warn(`[coordinate-extractor] Marker too short after parsing: "${textMarker}" → "${searchText}"`);
    return null;
  }

  // Step 2: Filter words by region if hint provided
  const regionWords = regionBounds
    ? filterWordsByRegion(words, regionBounds)
    : words;

  if (regionWords.length === 0) {
    console.warn(`[coordinate-extractor] No OCR words in region ${JSON.stringify(regionBounds)} on page ${pageNumber}`);
    return null;
  }

  // Step 3: Try exact match
  const exactMatches = findAllMatches(searchText, regionWords, pageNumber, true, config.fuzzyThreshold);
  if (exactMatches.length > 0) {
    // If multiple matches, use context to disambiguate
    const bestMatch = disambiguateMatches(exactMatches, markerContext, words);
    if (bestMatch) {
      return validateCoordinates(bestMatch, 1.0, config);
    }
  }

  // Step 4: Fallback to fuzzy match
  const fuzzyMatches = findAllMatches(searchText, regionWords, pageNumber, false, config.fuzzyThreshold);
  if (fuzzyMatches.length > 0) {
    // If multiple matches, use context to disambiguate
    const bestMatch = disambiguateMatches(fuzzyMatches, markerContext, words);
    if (bestMatch) {
      // Reduce confidence for fuzzy matches
      return validateCoordinates(bestMatch, 0.8, config);
    }
  }

  // Step 5: Extraction failed
  console.warn(
    `[coordinate-extractor] Failed to find marker on page ${pageNumber}: "${textMarker}" (search: "${searchText}", region: ${JSON.stringify(regionBounds)})`
  );
  return null;
}

/**
 * Filter OCR words by region bounds
 *
 * @param words - All OCR words on page
 * @param regionBounds - [minY, maxY] region bounds
 * @returns Words within region
 */
function filterWordsByRegion(words: OCRWord[], regionBounds: [number, number]): OCRWord[] {
  const [minY, maxY] = regionBounds;

  return words.filter(word => {
    const wordY = Math.min(
      word.boundingBox.vertices[0].y,
      word.boundingBox.vertices[1].y
    );
    return wordY >= minY && wordY <= maxY;
  });
}

/**
 * Disambiguate multiple matches using marker context
 *
 * When marker appears multiple times in region, use marker_context to find the right one.
 * Looks for context text near each match and picks the one with best context match.
 *
 * @param matches - All matching OCR matches
 * @param markerContext - AI-provided context for disambiguation (can be null)
 * @param allWords - All OCR words on page (for context search)
 * @returns Best match or null if cannot disambiguate
 */
function disambiguateMatches(
  matches: OCRMatch[],
  markerContext: string | null,
  allWords: OCRWord[]
): OCRMatch | null {
  // Single match = no disambiguation needed
  if (matches.length === 1) {
    return matches[0];
  }

  // No context = pick first match (assume AI ordered by confidence)
  if (!markerContext || markerContext.trim().length === 0) {
    console.warn(`[coordinate-extractor] Multiple matches found but no context provided, using first match`);
    return matches[0];
  }

  // Parse context text
  const contextText = parseMarkerText(markerContext).toLowerCase();
  const contextWords = contextText.split(/\s+/);

  // Score each match by how well context matches nearby text
  const scoredMatches = matches.map(match => {
    // Find words near this match (within 100 pixels vertically, ±300 pixels horizontally)
    const nearbyWords = findNearbyWords(match, allWords, 100, 300);
    const nearbyText = nearbyWords.map(w => w.text.toLowerCase()).join(' ');

    // Calculate how many context words appear nearby
    let score = 0;
    for (const contextWord of contextWords) {
      if (nearbyText.includes(contextWord)) {
        score++;
      }
    }

    return { match, score };
  });

  // Sort by score (highest first)
  scoredMatches.sort((a, b) => b.score - a.score);

  // Return best match (must have at least 1 context word match)
  if (scoredMatches[0].score > 0) {
    return scoredMatches[0].match;
  }

  // No context match = pick first match as fallback
  console.warn(`[coordinate-extractor] Multiple matches found but context did not help, using first match`);
  return matches[0];
}

/**
 * Find words near a match for context analysis
 *
 * NOTE: Currently only filters by vertical distance since OCRMatch doesn't have X coordinates.
 * The horizontalRadius parameter is kept for future enhancement but not currently used.
 *
 * @param match - OCR match to find nearby words for
 * @param allWords - All OCR words on page
 * @param verticalRadius - Max vertical distance (pixels)
 * @param _horizontalRadius - Max horizontal distance (pixels) - NOT CURRENTLY USED
 * @returns Words within vertical radius of match
 */
function findNearbyWords(
  match: OCRMatch,
  allWords: OCRWord[],
  verticalRadius: number,
  _horizontalRadius: number  // Prefixed with _ to indicate intentionally unused
): OCRWord[] {
  const matchCenterY = match.y + match.height / 2;

  return allWords.filter(word => {
    const wordCenterY = (
      Math.min(word.boundingBox.vertices[0].y, word.boundingBox.vertices[1].y) +
      Math.max(word.boundingBox.vertices[2].y, word.boundingBox.vertices[3].y)
    ) / 2;

    const verticalDistance = Math.abs(wordCenterY - matchCenterY);

    return verticalDistance <= verticalRadius;
  });
}

/**
 * Parse marker text to extract searchable content
 *
 * Removes quotes and cleans up whitespace.
 *
 * Examples:
 * - "'DISCHARGE SUMMARY'" → "DISCHARGE SUMMARY"
 * - "  Patient History  " → "Patient History"
 *
 * @param marker - AI-provided marker string
 * @returns Cleaned search text
 */
export function parseMarkerText(marker: string): string {
  // Remove all quotes
  let cleaned = marker.replace(/['"]/g, '').trim();

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');

  return cleaned;
}

/**
 * Extract words with bounding boxes from OCR page
 *
 * Handles different OCR data structures:
 * - Structured blocks/paragraphs/words (preferred)
 * - Fallback to text-only (no coordinates available)
 *
 * @param ocrPage - OCR page data from Google Cloud Vision
 * @returns Array of words with coordinates
 */
function extractWordsFromOCRPage(ocrPage: OCRPage): OCRWord[] {
  const words: OCRWord[] = [];

  // Preferred: Structured OCR data with blocks
  if (ocrPage.blocks && ocrPage.blocks.length > 0) {
    for (const block of ocrPage.blocks) {
      for (const paragraph of block.paragraphs) {
        words.push(...paragraph.words);
      }
    }
    return words;
  }

  // Fallback: No structured data available
  // Cannot extract coordinates without word-level bounding boxes
  return [];
}

/**
 * Find all matches for search text in OCR words
 *
 * Returns ALL matches (not just first) to allow disambiguation.
 *
 * @param searchText - Text to search for
 * @param words - OCR words with coordinates
 * @param pageNumber - Page number for logging
 * @param exactOnly - If true, only exact matches; if false, fuzzy matches
 * @param fuzzyThreshold - Similarity threshold for fuzzy matching
 * @returns All matching OCR matches
 */
function findAllMatches(
  searchText: string,
  words: OCRWord[],
  pageNumber: number,
  exactOnly: boolean,
  fuzzyThreshold: number
): OCRMatch[] {
  const matches: OCRMatch[] = [];
  const searchLower = searchText.toLowerCase();
  const searchWords = searchLower.split(/\s+/);

  // Sliding window search
  for (let i = 0; i <= words.length - searchWords.length; i++) {
    const windowWords = words.slice(i, i + searchWords.length);
    const windowText = windowWords.map(w => w.text.toLowerCase()).join(' ');

    if (exactOnly) {
      // Exact match
      if (windowText === searchLower) {
        matches.push(createMatchFromWords(windowWords, pageNumber));
      }
    } else {
      // Fuzzy match
      const similarity = calculateSimilarity(searchLower, windowText);
      if (similarity >= fuzzyThreshold) {
        matches.push(createMatchFromWords(windowWords, pageNumber));
      }
    }
  }

  return matches;
}

/**
 * Calculate similarity between two strings using Levenshtein distance
 *
 * Returns similarity ratio (0-1) where 1 is identical.
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Similarity ratio (0-1)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);

  if (maxLength === 0) return 1.0;

  return 1 - (distance / maxLength);
}

/**
 * Calculate Levenshtein distance between two strings
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Edit distance (number of changes required)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str1.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str1.length][str2.length];
}

/**
 * Create OCR match from sequence of words
 *
 * Computes combined bounding box for multi-word phrase.
 *
 * @param words - Sequence of OCR words
 * @param pageNumber - Page number
 * @returns OCR match with combined bounding box
 */
function createMatchFromWords(words: OCRWord[], pageNumber: number): OCRMatch {
  // Find top-most Y coordinate (smallest Y = highest on page)
  const minY = Math.min(...words.map(w => {
    const vertices = w.boundingBox.vertices;
    return Math.min(vertices[0].y, vertices[1].y); // Top two vertices
  }));

  // Find bottom-most Y coordinate (largest Y = lowest on page)
  const maxY = Math.max(...words.map(w => {
    const vertices = w.boundingBox.vertices;
    return Math.max(vertices[2].y, vertices[3].y); // Bottom two vertices
  }));

  // Calculate average confidence
  const avgConfidence = words.reduce((sum, w) => sum + w.confidence, 0) / words.length;

  return {
    text: words.map(w => w.text).join(' '),
    y: minY,
    height: maxY - minY,
    confidence: avgConfidence,
    page: pageNumber
  };
}

/**
 * Validate extracted coordinates
 *
 * Ensures coordinates are within realistic bounds for a page.
 * Applies confidence multiplier for fuzzy matches.
 *
 * For encounter START boundaries:
 * - split_y = text_y_top (split occurs BEFORE the marker text)
 *
 * For encounter END boundaries:
 * - split_y = text_y_top + text_height (split occurs AFTER the marker text)
 * - This calculation is handled by the caller (post-processor.ts)
 *
 * @param match - OCR match to validate
 * @param confidenceMultiplier - Reduce confidence for fuzzy matches (0-1)
 * @param config - Extraction configuration
 * @returns Validated coordinates
 * @throws Error if coordinates are invalid
 */
function validateCoordinates(
  match: OCRMatch,
  confidenceMultiplier: number,
  config: ExtractionConfig
): ExtractedCoordinates {
  // Validate Y coordinate
  if (match.y < 0 || match.y > config.maxPageHeight) {
    throw new Error(
      `Y coordinate ${match.y} out of bounds (page height: ${config.maxPageHeight})`
    );
  }

  // Validate height
  if (match.height < config.minTextHeight || match.height > config.maxTextHeight) {
    throw new Error(
      `Text height ${match.height} out of realistic range (${config.minTextHeight}-${config.maxTextHeight})`
    );
  }

  // For encounter START: split_y = text_y_top (split BEFORE marker)
  // For encounter END: caller will add text_height to get split AFTER marker
  const split_y = match.y;

  return {
    text_y_top: match.y,
    text_height: match.height,
    split_y,
    confidence: match.confidence * confidenceMultiplier,
    matched_text: match.text
  };
}

/**
 * Batch extract coordinates for multiple markers
 *
 * Optimized for processing multiple markers on the same page.
 * Extracts words once and reuses for all marker searches.
 *
 * V11 UPDATE: Changed signature to use marker + context + region hint
 *
 * @param markers - Array of markers with context and region hints
 * @param ocrPages - Map of page number to OCR data
 * @param config - Optional extraction configuration
 * @returns Map of marker identifier to extracted coordinates (null if failed)
 */
export async function batchExtractCoordinates(
  markers: Array<{
    id: string;  // Unique identifier for this marker (for result mapping)
    text_marker: string;
    marker_context: string | null;
    region_hint: RegionHint | null;
    page: number;
  }>,
  ocrPages: Map<number, OCRPage>,
  config: ExtractionConfig = DEFAULT_CONFIG
): Promise<Map<string, ExtractedCoordinates | null>> {
  const results = new Map<string, ExtractedCoordinates | null>();

  // Group markers by page for efficient processing
  const markersByPage = new Map<number, typeof markers>();
  for (const marker of markers) {
    if (!markersByPage.has(marker.page)) {
      markersByPage.set(marker.page, []);
    }
    markersByPage.get(marker.page)!.push(marker);
  }

  // Process each page's markers
  for (const [page, pageMarkers] of markersByPage.entries()) {
    const ocrPage = ocrPages.get(page);
    if (!ocrPage) {
      // No OCR data for page - mark all markers as failed
      for (const marker of pageMarkers) {
        results.set(marker.id, null);
      }
      continue;
    }

    // Extract words once per page (OPTIMIZATION: reuse for all markers on this page)
    const words = extractWordsFromOCRPage(ocrPage);

    if (words.length === 0) {
      // No OCR words - mark all markers as failed
      for (const marker of pageMarkers) {
        results.set(marker.id, null);
      }
      continue;
    }

    // Process all markers on this page using pre-extracted words
    for (const marker of pageMarkers) {
      try {
        const regionBounds = calculateRegionBounds(marker.region_hint, ocrPage, config.maxPageHeight);
        const coords = await extractCoordinatesFromWords(
          marker.text_marker,
          marker.marker_context,
          regionBounds,
          page,
          words,
          config
        );
        results.set(marker.id, coords);
      } catch (error) {
        console.error(`[coordinate-extractor] Error extracting marker "${marker.text_marker}":`, error);
        results.set(marker.id, null);
      }
    }
  }

  return results;
}
