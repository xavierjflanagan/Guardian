/**
 * OCR Formatter - Enhanced Coordinate Format Generation (V12)
 *
 * TWO FORMAT VARIANTS:
 *
 * 1. Y-Only Format (for Pass 0.5):
 *    [Y:###] text text text
 *    - Minimal token usage (~900 tokens/page)
 *    - Pass 0.5 only needs Y-coordinates for encounter boundary positioning
 *    - Stored as: enhanced-ocr-y.txt
 *
 * 2. XY Format (for Pass 1/2):
 *    [Y:###] text (x:###) | text (x:###) | ...
 *    - Full coordinate data (~5000 tokens/page)
 *    - Pass 1/2 need X-coordinates for clinical entity bounding boxes and table structure
 *    - Stored as: enhanced-ocr-xy.txt
 *
 * FUTURE OPTIMIZATION (for XY format):
 * Selective coordinate inclusion - only add X-coordinates for lines that look like tables
 * (multiple widely-spaced elements). Could reduce XY format size by ~40% for text-heavy docs.
 * Deferred until Pass 1/2 stress testing determines ROI.
 *
 * Source: OCR-COORDINATE-ENHANCEMENT-IMPLEMENTATION-PLAN.md
 * Complexity: MEDIUM
 */

import { OCRPage, OCRWord } from '../types';

/**
 * Enhanced OCR word with coordinates
 */
interface EnhancedWord {
  text: string;
  x: number;  // X-coordinate (left edge)
  y: number;  // Y-coordinate (top edge)
}

/**
 * Configuration for enhanced OCR generation
 */
interface EnhancedOcrConfig {
  yTolerance: number;      // Pixels tolerance for grouping words into same line (default: 10)
  minWordSpacing: number;  // Minimum pixels between words to add separator (default: 20)
}

/**
 * Generate enhanced OCR format with inline coordinates from OCR page data
 *
 * Input: Google Cloud Vision OCR page with blocks/paragraphs/words
 * Output: [Y:###] text (x:###) | text (x:###) format
 *
 * Example output:
 * [Y:240] S T-BIL (x:20) | 16 (x:120) | 14 (x:220) | 7 (x:320)
 * [Y:270] S ALP (x:20) | 62 (x:120) | 66 (x:220) | 75 (x:320)
 *
 * @param page OCR page data from Google Cloud Vision
 * @param config Optional configuration for grouping tolerance
 * @returns Enhanced OCR text with inline coordinates
 */
export function generateEnhancedOcrFormat(
  page: OCRPage,
  config: Partial<EnhancedOcrConfig> = {}
): string {
  const {
    yTolerance = 10,
    minWordSpacing = 20
  } = config;

  // Extract all words with coordinates from OCR structure
  const words = extractWordsWithCoordinates(page);

  if (words.length === 0) {
    return ''; // Empty page
  }

  // Group words by Y-coordinate (within tolerance)
  const lines = groupWordsByLine(words, yTolerance);

  // Sort lines by Y-coordinate (top to bottom)
  const sortedLines = Array.from(lines.entries())
    .sort(([yA], [yB]) => yA - yB);

  // Format each line with inline coordinates
  const formattedLines = sortedLines.map(([y, lineWords]) => {
    // Sort words by X-coordinate (left to right) within line
    const sortedWords = lineWords.sort((a, b) => a.x - b.x);

    // Format words with coordinates, add separators for widely spaced words
    const wordStrings = sortedWords.map((word, index) => {
      const formatted = `${word.text} (x:${word.x})`;

      // Add separator if there's significant spacing to next word
      if (index < sortedWords.length - 1) {
        const nextWord = sortedWords[index + 1];
        const spacing = nextWord.x - word.x;
        if (spacing > minWordSpacing) {
          return formatted + ' |';
        }
      }

      return formatted;
    }).join(' ');

    return `[Y:${y}] ${wordStrings}`;
  });

  return formattedLines.join('\n');
}

/**
 * Extract all words with their coordinates from OCR page structure
 *
 * @param page OCR page with blocks/paragraphs/words hierarchy
 * @returns Array of words with x,y coordinates
 */
function extractWordsWithCoordinates(page: OCRPage): EnhancedWord[] {
  const words: EnhancedWord[] = [];

  // PHASE 2: Check for new block-level structure
  if (page.blocks && page.blocks.length > 0) {
    // Traverse blocks -> paragraphs -> words hierarchy
    for (const block of page.blocks) {
      if (!block.paragraphs) continue;

      for (const paragraph of block.paragraphs) {
        if (!paragraph.words) continue;

        for (const word of paragraph.words) {
          const coordinates = extractWordCoordinates(word);
          if (coordinates) {
            words.push({
              text: word.text,
              x: coordinates.x,
              y: coordinates.y
            });
          }
        }
      }
    }

    return words;
  }

  // BACKWARD COMPATIBILITY: Fall back to legacy 'lines' array
  // Legacy page-N.json files (pre-Phase 2) only have 'lines', not 'blocks'
  const legacyPage = page as any;
  if (legacyPage.lines && Array.isArray(legacyPage.lines)) {
    for (const line of legacyPage.lines) {
      if (line.text && line.bbox) {
        words.push({
          text: line.text,
          x: line.bbox.x,
          y: line.bbox.y
        });
      }
    }
  }

  return words;
}

/**
 * Extract top-left coordinates from word bounding box
 *
 * @param word OCR word with bounding box
 * @returns {x, y} coordinates or null if invalid
 */
function extractWordCoordinates(word: OCRWord): { x: number, y: number } | null {
  if (!word.boundingBox || !word.boundingBox.vertices || word.boundingBox.vertices.length < 1) {
    return null;
  }

  // Use first vertex (top-left corner)
  const topLeft = word.boundingBox.vertices[0];
  return {
    x: Math.round(topLeft.x),
    y: Math.round(topLeft.y)
  };
}

/**
 * Group words by Y-coordinate into lines
 *
 * Words within yTolerance pixels are considered on the same line.
 * Uses quantization to group nearby Y-coordinates.
 *
 * @param words Array of words with coordinates
 * @param yTolerance Pixels tolerance for grouping (default: 10)
 * @returns Map of Y-coordinate to words on that line
 */
function groupWordsByLine(
  words: EnhancedWord[],
  yTolerance: number
): Map<number, EnhancedWord[]> {
  const lines = new Map<number, EnhancedWord[]>();

  for (const word of words) {
    // Quantize Y-coordinate to nearest multiple of yTolerance
    // This groups words with similar Y-coordinates together
    const lineY = Math.round(word.y / yTolerance) * yTolerance;

    if (!lines.has(lineY)) {
      lines.set(lineY, []);
    }

    lines.get(lineY)!.push(word);
  }

  return lines;
}

/**
 * Fallback: Generate enhanced OCR from spatially sorted text
 *
 * Used when structured OCR data (blocks/paragraphs/words) is not available.
 * Creates estimated coordinates based on word position in sorted text.
 *
 * WARNING: This is a degraded fallback with less accurate coordinates.
 * Prefer generateEnhancedOcrFormat() when structured data is available.
 *
 * @param spatiallySortedText Pre-sorted OCR text
 * @param pageHeight Page height in pixels (for Y estimation)
 * @returns Enhanced OCR text with estimated coordinates
 */
export function generateEnhancedOcrFromSortedText(
  spatiallySortedText: string,
  pageHeight: number = 2263
): string {
  const lines = spatiallySortedText.split('\n');
  const estimatedYStep = Math.floor(pageHeight / (lines.length + 1));

  return lines.map((line, index) => {
    const y = (index + 1) * estimatedYStep;

    // Split line into words and assign estimated X-coordinates
    const words = line.trim().split(/\s+/).filter(w => w.length > 0);
    const wordStrings = words.map((word, wordIndex) => {
      const x = wordIndex * 100; // Rough estimate: 100px per word
      return `${word} (x:${x})`;
    }).join(' | ');

    return `[Y:${y}] ${wordStrings}`;
  }).join('\n');
}

/**
 * Check if page has structured OCR data for enhanced formatting
 *
 * @param page OCR page data
 * @returns true if structured data (blocks) exists
 */
export function hasStructuredOcrData(page: OCRPage): boolean {
  return !!(page.blocks && page.blocks.length > 0);
}

/**
 * Generate Y-Only enhanced OCR format for Pass 0.5
 *
 * This is a lightweight version that only includes Y-coordinates (no X-coordinates).
 * Pass 0.5 only needs Y-coordinates for encounter boundary positioning.
 *
 * Input: Google Cloud Vision OCR page with blocks/paragraphs/words
 * Output: [Y:###] text text text format
 *
 * Example output:
 * [Y:240] S T-BIL 16 14 7
 * [Y:270] S ALP 62 66 75
 *
 * Token savings: ~80% reduction compared to XY format (~900 vs ~5000 tokens/page)
 *
 * @param page OCR page data from Google Cloud Vision
 * @param config Optional configuration for grouping tolerance
 * @returns Enhanced OCR text with Y-coordinates only
 */
export function generateEnhancedOcrFormatYOnly(
  page: OCRPage,
  config: Partial<EnhancedOcrConfig> = {}
): string {
  const {
    yTolerance = 10
  } = config;

  // Extract all words with coordinates from OCR structure (reuse existing helper)
  const words = extractWordsWithCoordinates(page);

  if (words.length === 0) {
    return ''; // Empty page
  }

  // Group words by Y-coordinate (within tolerance) - reuse existing helper
  const lines = groupWordsByLine(words, yTolerance);

  // Sort lines by Y-coordinate (top to bottom)
  const sortedLines = Array.from(lines.entries())
    .sort(([yA], [yB]) => yA - yB);

  // Format each line with Y-coordinate only (no X-coordinates, no separators)
  const formattedLines = sortedLines.map(([y, lineWords]) => {
    // Sort words by X-coordinate (left to right) within line for reading order
    const sortedWords = lineWords.sort((a, b) => a.x - b.x);

    // Join words with single space (no X-coordinates, no | separators)
    const lineText = sortedWords.map(word => word.text).join(' ');

    return `[Y:${y}] ${lineText}`;
  });

  return formattedLines.join('\n');
}
