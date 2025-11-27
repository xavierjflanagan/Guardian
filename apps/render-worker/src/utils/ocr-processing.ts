/**
 * OCR Processing Utilities
 *
 * Handles Google Cloud Vision OCR processing with spatial sorting
 * Extracted from worker.ts for better organization and testability
 */

import { retryGoogleVision } from './retry';
import { createLogger, Logger } from './logger';
import { storeRawGCV } from './ocr-persistence';
import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Google Cloud Vision block type enumeration
 * Maps GCV blockType enum values to readable strings
 */
export type BlockType = 'UNKNOWN' | 'TEXT' | 'TABLE' | 'PICTURE' | 'RULER' | 'BARCODE';

/**
 * Word with full bounding box vertices (4 corners)
 * PHASE 3: Full vertex storage for accurate coordinate lookup
 */
export interface OCRWord {
  text: string;
  boundingBox: {
    vertices: Array<{ x: number; y: number }>; // TL, TR, BR, BL
  };
  confidence: number;
}

/**
 * Paragraph containing words
 */
export interface OCRParagraph {
  boundingBox: {
    vertices: Array<{ x: number; y: number }>;
  };
  words: OCRWord[];
}

/**
 * Block with type metadata and full hierarchy
 * PHASE 2: Block type preservation for content routing
 */
export interface OCRBlock {
  blockType: BlockType;
  confidence: number;
  boundingBox: {
    vertices: Array<{ x: number; y: number }>;
  };
  paragraphs: OCRParagraph[];
}

/**
 * Complete OCR result for a single page
 */
export interface OCRPageResult {
  page_number: number;
  size: { width_px: number; height_px: number };
  blocks: OCRBlock[]; // PHASE 2: Block-level structure with full hierarchy
  provider: string;
  processing_time_ms: number;
  original_gcv_text: string; // Original unsorted GCV text
  spatially_sorted_text: string; // Spatially sorted text in reading order
  page_dimensions?: { width: number; height: number };
}

/**
 * Multi-page OCR result
 */
export interface OCRResult {
  pages: OCRPageResult[];
}

/**
 * Configuration for OCR processing
 */
export interface OCRProcessingConfig {
  googleApiKey: string;
  storeRawGCV: boolean;
  correlationId?: string;
}

/**
 * Context for storing raw GCV response (optional)
 */
export interface RawGCVStorageContext {
  supabase: SupabaseClient;
  patientId: string;
  shellFileId: string;
  logger: Logger;
}

// =============================================================================
// SPATIAL SORTING UTILITIES
// =============================================================================

/**
 * Sort text blocks spatially for correct reading order
 * Fixes multi-column reading bug where GCV returns text in detection order
 *
 * Algorithm:
 * 1. Group blocks into horizontal rows by Y-coordinate
 * 2. Sort rows top-to-bottom
 * 3. Within each row, sort blocks left-to-right by X-coordinate
 *
 * @param blocks - GCV blocks with boundingBox vertices
 * @returns Sorted blocks in natural reading order (top-to-bottom, left-to-right)
 */
export function sortBlocksSpatially(blocks: any[]): any[] {
  if (!blocks || blocks.length === 0) {
    return blocks;
  }

  // Calculate bbox for each block
  const blocksWithBbox = blocks.map(block => {
    const vertices = block.boundingBox?.vertices || [];
    if (vertices.length < 4) {
      return { block, y: 0, x: 0, height: 0 };
    }

    const y = Math.min(...vertices.map((v: any) => v.y || 0));
    const x = Math.min(...vertices.map((v: any) => v.x || 0));
    const maxY = Math.max(...vertices.map((v: any) => v.y || 0));
    const height = maxY - y;

    return { block, y, x, height };
  });

  // Sort by Y first (top-to-bottom)
  blocksWithBbox.sort((a, b) => a.y - b.y);

  // Group into rows (blocks with overlapping Y ranges)
  const rows: typeof blocksWithBbox[] = [];
  let currentRow: typeof blocksWithBbox = [];
  let currentRowMaxY = 0;

  for (const item of blocksWithBbox) {
    // Check if this block overlaps with current row's Y range
    // Use height-based threshold: block is in same row if it starts within current row's height
    const isInCurrentRow = currentRow.length === 0 ||
      (item.y < currentRowMaxY && item.y >= currentRow[0].y - currentRow[0].height * 0.5);

    if (isInCurrentRow) {
      currentRow.push(item);
      currentRowMaxY = Math.max(currentRowMaxY, item.y + item.height);
    } else {
      // Start new row
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }
      currentRow = [item];
      currentRowMaxY = item.y + item.height;
    }
  }

  // Don't forget last row
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  // Sort each row left-to-right by X
  rows.forEach(row => {
    row.sort((a, b) => a.x - b.x);
  });

  // Flatten back to sorted blocks
  return rows.flatMap(row => row.map(item => item.block));
}

/**
 * Extract text from sorted blocks in reading order
 * @param blocks - Sorted GCV blocks
 * @returns Concatenated text with proper spacing and line breaks
 */
export function extractTextFromBlocks(blocks: any[]): string {
  const textParts: string[] = [];

  for (const block of blocks) {
    if (block.paragraphs) {
      for (const paragraph of block.paragraphs) {
        if (paragraph.words) {
          const paragraphText = paragraph.words
            .map((word: any) => word.symbols?.map((s: any) => s.text).join('') || '')
            .filter((text: string) => text.length > 0)
            .join(' ');

          if (paragraphText) {
            textParts.push(paragraphText);
          }
        }
      }
    }
  }

  return textParts.join('\n');
}

// =============================================================================
// GOOGLE CLOUD VISION OCR PROCESSING
// =============================================================================

/**
 * Process document with Google Cloud Vision OCR
 *
 * @param base64Data - Base64-encoded image data
 * @param mimeType - MIME type of the image (for future format-specific processing)
 * @param config - OCR processing configuration
 * @param storageContext - Optional context for storing raw GCV response
 * @returns OCR page result with spatial sorting and block structure
 */
export async function processWithGoogleVisionOCR(
  base64Data: string,
  _mimeType: string,
  config: OCRProcessingConfig,
  storageContext?: RawGCVStorageContext
): Promise<OCRPageResult> {
  const logger = createLogger({
    context: 'ocr-processing',
    correlation_id: config.correlationId,
  });

  const startTime = Date.now();

  // Call Google Cloud Vision API with retry logic
  const response = await retryGoogleVision(async () => {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${config.googleApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Data },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          }],
        }),
      }
    );

    if (!res.ok) {
      const error: any = new Error(`Google Vision API failed: ${res.status} ${res.statusText}`);
      error.status = res.status;
      error.response = res; // Preserve response for Retry-After header
      throw error;
    }

    return res;
  });

  const result = await response.json() as any;
  const annotation = result.responses?.[0]?.fullTextAnnotation;

  if (!annotation) {
    throw new Error('No text detected in document');
  }

  // PHASE 4: Optionally store raw Google Cloud Vision response for debugging
  // Only enabled when STORE_RAW_GCV=true environment variable is set
  if (config.storeRawGCV && storageContext) {
    try {
      await storeRawGCV(
        storageContext.supabase,
        storageContext.patientId,
        storageContext.shellFileId,
        result,
        config.correlationId
      );
      logger.info('Raw GCV response stored (Phase 4 optional feature)', {
        shell_file_id: storageContext.shellFileId,
        note: 'Will be deleted after 30 days via lifecycle policy',
      });
    } catch (error) {
      // Log error but don't fail the job - raw storage is optional
      logger.error('Failed to store raw GCV response (non-fatal)', error as Error, {
        shell_file_id: storageContext.shellFileId,
      });
    }
  }

  // Capture original GCV text (potentially scrambled in multi-column documents)
  const originalGCVText = annotation.text || '';

  // Capture page dimensions for context
  const pageDimensions = annotation.pages?.[0]
    ? {
        width: annotation.pages[0].width || 0,
        height: annotation.pages[0].height || 0,
      }
    : undefined;

  // SPATIAL SORTING FIX: Sort blocks spatially before extracting text
  // This fixes multi-column reading bug where GCV returns text in detection order
  let extractedText = '';
  if (annotation.pages && annotation.pages[0]?.blocks) {
    const sortedBlocks = sortBlocksSpatially(annotation.pages[0].blocks);
    extractedText = extractTextFromBlocks(sortedBlocks);
  } else {
    // Fallback to GCV's text if no blocks found (should be rare)
    extractedText = originalGCVText;
  }

  // PHASE 2: Build block-level structure with blockType metadata
  const blocks: OCRBlock[] = [];

  // Map GCV blockType enum values to our BlockType strings
  const blockTypeMap: Record<number, BlockType> = {
    0: 'UNKNOWN',
    1: 'TEXT',
    2: 'TABLE',
    3: 'PICTURE',
    4: 'RULER',
    5: 'BARCODE'
  };

  // Process pages and blocks
  if (annotation.pages) {
    for (const page of annotation.pages) {
      if (page.blocks) {
        // Use spatially sorted blocks for consistent ordering
        const sortedBlocks = sortBlocksSpatially(page.blocks);

        for (const block of sortedBlocks) {
          // PHASE 2: Capture blockType from Google Cloud Vision
          const blockType = blockTypeMap[block.blockType] || 'UNKNOWN';

          // Skip blocks without valid bounding boxes
          if (!block.boundingBox?.vertices || block.boundingBox.vertices.length < 4) {
            continue;
          }

          // PHASE 2: Build block structure for page-N.json
          const blockData: OCRBlock = {
            blockType,
            confidence: block.confidence || 0.85,
            boundingBox: {
              vertices: block.boundingBox.vertices
            },
            paragraphs: []
          };

          if (block.paragraphs) {
            for (const paragraph of block.paragraphs) {
              // Skip paragraphs without valid bounding boxes
              if (!paragraph.boundingBox?.vertices || paragraph.boundingBox.vertices.length < 4) {
                continue;
              }

              const paragraphData: OCRParagraph = {
                boundingBox: {
                  vertices: paragraph.boundingBox.vertices
                },
                words: []
              };

              if (paragraph.words) {
                for (const word of paragraph.words) {
                  const text = word.symbols?.map((s: any) => s.text).join('') || '';
                  // PHASE 3: Only include words with full 4-vertex bounding boxes
                  if (text && word.boundingBox?.vertices?.length >= 4) {
                    paragraphData.words.push({
                      text,
                      boundingBox: {
                        vertices: word.boundingBox.vertices
                      },
                      confidence: word.confidence || 0.85
                    });
                  }
                }
              }

              // Only add paragraph if it has words
              if (paragraphData.words.length > 0) {
                blockData.paragraphs.push(paragraphData);
              }
            }
          }

          // Only add block if it has paragraphs
          if (blockData.paragraphs.length > 0) {
            blocks.push(blockData);
          }
        }
      }
    }
  }

  const processingTime = Date.now() - startTime;

  // Get page dimensions from first page
  const pageWidth = annotation.pages?.[0]?.width || 0;
  const pageHeight = annotation.pages?.[0]?.height || 0;

  return {
    page_number: 1, // Will be set correctly by caller for multi-page docs
    size: { width_px: pageWidth, height_px: pageHeight },
    blocks,
    provider: 'google_cloud_vision',
    processing_time_ms: processingTime,
    original_gcv_text: originalGCVText,
    spatially_sorted_text: extractedText,
    page_dimensions: pageDimensions,
  };
}
