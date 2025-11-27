/**
 * Page Content Analyzer
 *
 * PHASE 2: Infrastructure for future vision routing in Pass 1/2
 *
 * Analyzes OCR pages to identify non-text content (PICTURE/TABLE blocks)
 * This enables content-based routing to vision models in future passes
 */

import { OCRPage, OCRBlock } from '../pass05/types';

/**
 * Page content analysis result
 */
export interface PageContentAnalysis {
  hasImages: boolean;                // Does page contain PICTURE blocks?
  hasTables: boolean;                // Does page contain TABLE blocks?
  visualContentRatio: number;        // Ratio of visual content to total page area (0-1)
  recommendedModel: 'text' | 'vision'; // Future: Which model type to use
  blockTypeCounts: Record<string, number>; // Count of each block type
  pictureBlocks: OCRBlock[];         // PICTURE blocks needing visual interpretation
  tableBlocks: OCRBlock[];           // TABLE blocks for specialized extraction
}

/**
 * Analyze page content to determine if vision model routing is needed
 *
 * IMPORTANT: This is infrastructure for Pass 1/2 vision routing (future implementation)
 * Pass 0.5 uses text-only models regardless of page content
 *
 * @param page OCR page with block structure
 * @returns Analysis of page content and routing recommendation
 */
export function analyzePageContent(page: OCRPage): PageContentAnalysis {
  const blockTypeCounts: Record<string, number> = {};
  const pictureBlocks: OCRBlock[] = [];
  const tableBlocks: OCRBlock[] = [];
  let totalArea = 0;
  let visualArea = 0;

  // Calculate page area from dimensions (or use legacy width/height fields)
  const pageArea = page.dimensions
    ? page.dimensions.width * page.dimensions.height
    : (page.width && page.height) ? page.width * page.height : 0;

  // BACKWARD COMPATIBILITY: Default to TEXT if no blocks array
  if (!page.blocks || page.blocks.length === 0) {
    return {
      hasImages: false,
      hasTables: false,
      visualContentRatio: 0,
      recommendedModel: 'text',
      blockTypeCounts: { TEXT: 1 }, // Assume legacy data is text
      pictureBlocks: [],
      tableBlocks: [],
    };
  }

  // Analyze block structure
  for (const block of page.blocks) {
    // Count block types
    const blockType = block.blockType || 'UNKNOWN';
    blockTypeCounts[blockType] = (blockTypeCounts[blockType] || 0) + 1;

    // Track blocks that need visual interpretation
    if (blockType === 'PICTURE') {
      pictureBlocks.push(block);
    } else if (blockType === 'TABLE') {
      tableBlocks.push(block);
    }

    // Calculate areas
    const blockArea = calculateBoundingBoxArea(block.boundingBox);
    totalArea += blockArea;

    if (blockType === 'PICTURE' || blockType === 'TABLE') {
      visualArea += blockArea;
    }
  }

  const visualContentRatio = pageArea > 0 ? visualArea / pageArea : 0;

  return {
    hasImages: (blockTypeCounts['PICTURE'] || 0) > 0,
    hasTables: (blockTypeCounts['TABLE'] || 0) > 0,
    visualContentRatio,
    recommendedModel: visualContentRatio > 0.2 ? 'vision' : 'text',
    blockTypeCounts,
    pictureBlocks,  // Return blocks that need visual interpretation
    tableBlocks,    // Return table blocks for specialized extraction
  };
}

/**
 * Calculate bounding box area from vertices
 *
 * @param bbox Bounding box with 4 vertices
 * @returns Area in square pixels
 */
function calculateBoundingBoxArea(bbox: { vertices: Array<{ x: number; y: number }> } | null): number {
  if (!bbox || !bbox.vertices || bbox.vertices.length < 4) return 0;

  // Simple rectangle area calculation
  const minX = Math.min(...bbox.vertices.map(v => v.x));
  const maxX = Math.max(...bbox.vertices.map(v => v.x));
  const minY = Math.min(...bbox.vertices.map(v => v.y));
  const maxY = Math.max(...bbox.vertices.map(v => v.y));

  return (maxX - minX) * (maxY - minY);
}

/**
 * Check if page requires vision model routing (future use in Pass 1/2)
 *
 * @param page OCR page
 * @returns true if page contains non-text content requiring vision model
 */
export function requiresVisionModel(page: OCRPage): boolean {
  const analysis = analyzePageContent(page);
  return analysis.recommendedModel === 'vision';
}

/**
 * Get all non-text blocks from page (future use for vision routing)
 *
 * @param page OCR page
 * @returns Array of PICTURE and TABLE blocks
 */
export function getNonTextBlocks(page: OCRPage): OCRBlock[] {
  const analysis = analyzePageContent(page);
  return [...analysis.pictureBlocks, ...analysis.tableBlocks];
}
