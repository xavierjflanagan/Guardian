/**
 * Pass 1 Strategy-A Prompt Generator
 *
 * Created: 2025-11-29
 * Purpose: Build prompts for entity detection from OCR text
 * Reference: PASS1-STRATEGY-A-MASTER.md Section 4.1
 *
 * IMPORTANT: OCR text is pre-processed with Y-coordinate markers by ocr-formatter.ts
 * and stored in Supabase Storage as enhanced-ocr-y.txt (Y-only format).
 * Pass 1 receives text already in [Y:###] format - no marker addition needed here.
 *
 * OCR Format: [Y:240] text text text
 * Source: loadEnhancedOCR_Y() from ocr-persistence.ts
 */

import { Pass1EntityType, VALID_ENTITY_TYPES } from './pass1-v2-types';

// =============================================================================
// SYSTEM MESSAGE
// =============================================================================

/**
 * System message for Pass 1 entity detection
 * Minimal persona focused on classification
 */
export const PASS1_SYSTEM_MESSAGE = `You are a medical document entity classifier. Your task is to identify clinical entities and their types from OCR text. Output minimal JSON only.`;

// =============================================================================
// PROMPT GENERATION
// =============================================================================

/**
 * Build the user prompt for Pass 1 entity detection
 *
 * @param ocrText - Pre-formatted OCR text with [Y:###] markers (from enhanced-ocr-y.txt)
 * @param pageNumber - Page number for context (optional, for batch processing)
 * @param batchInfo - Batch info string for multi-page batches (optional)
 * @returns User prompt string
 */
export function buildUserPrompt(
  ocrText: string,
  pageNumber?: number,
  batchInfo?: string
): string {
  // Build entity types list
  const entityTypesList = VALID_ENTITY_TYPES.join(', ');

  // Build the prompt - OCR text already has [Y:###] markers
  let prompt = `ENCOUNTER OCR TEXT (Y-coordinates per line):
${ocrText}

TASK:
1. Identify ALL clinical entities from these categories: ${entityTypesList}
2. For each entity output: original_text, entity_type, aliases (1-3 common alternatives), y_coordinate, page_number
3. Identify bridge_schema_zones: Y-ranges where specific schema types apply
   - Create ONE zone per schema_type (not multiple schema_types per zone)
   - Zones MAY overlap if multiple schema types share the same Y-region
   - Keep zones focused on actual content regions

CRITICAL - EXTRACT EVERY ENTITY:
- Extract EVERY clinical entity, even if the same medication/condition appears multiple times
- Each prescription entry is a SEPARATE entity (same drug prescribed on different dates = multiple entities)
- Sections may span multiple pages - continue extracting across page boundaries
- When uncertain, include the entity rather than omit it

IMPORTANT:
- Extract the EXACT text as it appears in the document for original_text
- Use y_coordinate from the [Y:###] marker for that line
- Aliases should be common alternative names (1-3) to help identify the entity in medical code libraries (SNOMED, RxNorm, LOINC)`;

  // Add page context if provided
  if (pageNumber !== undefined) {
    prompt += `\n- All entities on this page should have page_number: ${pageNumber}`;
  }

  // Add batch context if provided
  if (batchInfo) {
    prompt += `\n- ${batchInfo}`;
  }

  // Add output schema
  prompt += `

OUTPUT JSON SCHEMA:
{
  "entities": [
    {
      "id": "e1",
      "original_text": "Metformin 500mg",
      "entity_type": "medication",
      "aliases": ["metformin", "glucophage"],
      "y_coordinate": 245,
      "page_number": 1
    }
  ],
  "bridge_schema_zones": [
    {
      "schema_type": "medications",
      "page_number": 1,
      "y_start": 200,
      "y_end": 350
    }
  ]
}

Output ONLY valid JSON matching this schema. No explanations or markdown.`;

  return prompt;
}

/**
 * Build complete prompt for Pass 1 entity detection
 *
 * @param ocrText - Pre-formatted OCR text with [Y:###] markers
 * @param pageNumber - Starting page number (for single-page or batch context)
 * @param pageCount - Total pages in this batch
 * @returns Object with system and user prompts
 */
export function buildPass1Prompt(
  ocrText: string,
  pageNumber?: number,
  pageCount?: number
): { system: string; user: string } {
  // Build batch info if multi-page
  let batchInfo: string | undefined;
  if (pageCount && pageCount > 1 && pageNumber !== undefined) {
    batchInfo = `This batch covers pages ${pageNumber} to ${pageNumber + pageCount - 1}`;
  }

  return {
    system: PASS1_SYSTEM_MESSAGE,
    user: buildUserPrompt(ocrText, pageNumber, batchInfo)
  };
}

/**
 * Build prompt for a specific batch of an encounter
 *
 * @param batchOcrText - Pre-formatted OCR text slice for this batch
 * @param pageRangeStart - First page in batch (1-indexed)
 * @param pageRangeEnd - Last page in batch (1-indexed)
 * @param batchIndex - Batch index (0-based)
 * @param totalBatches - Total number of batches
 * @returns Object with system and user prompts
 */
export function buildBatchPrompt(
  batchOcrText: string,
  pageRangeStart: number,
  pageRangeEnd: number,
  batchIndex: number,
  totalBatches: number
): { system: string; user: string } {
  let batchInfo = `This is batch ${batchIndex + 1} of ${totalBatches}, covering pages ${pageRangeStart}-${pageRangeEnd}`;
  if (totalBatches > 1) {
    batchInfo += `. Entity IDs should be unique within this batch (e.g., e1, e2, ...).`;
  }

  return {
    system: PASS1_SYSTEM_MESSAGE,
    user: buildUserPrompt(batchOcrText, pageRangeStart, batchInfo)
  };
}

// =============================================================================
// TOKEN ESTIMATION
// =============================================================================

/**
 * Rough token estimation for prompt
 * Used for pre-flight checks and cost estimation
 *
 * Rule of thumb: ~4 characters per token for English text
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Roughly 4 characters per token, with some overhead for special tokens
  return Math.ceil(text.length / 4) + 50;
}

/**
 * Estimate total prompt tokens
 *
 * @param ocrText - OCR text
 * @returns Estimated token count for full prompt
 */
export function estimatePromptTokens(ocrText: string): number {
  const systemTokens = estimateTokens(PASS1_SYSTEM_MESSAGE);
  const userPrompt = buildUserPrompt(ocrText);
  const userTokens = estimateTokens(userPrompt);

  return systemTokens + userTokens;
}

// =============================================================================
// SCHEMA TYPE MAPPING
// =============================================================================

/**
 * Map entity types to bridge schema types
 * Used for zone-entity linking
 */
export const ENTITY_TO_SCHEMA_TYPE: Record<Pass1EntityType, string> = {
  'medication': 'medications',
  'condition': 'conditions',
  'procedure': 'procedures',
  'observation': 'observations',
  'allergy': 'allergies',
  'lab_result': 'lab_results',
  'vital_sign': 'vitals',
  'physical_finding': 'physical_findings'
};

/**
 * Check if a schema type matches an entity type
 *
 * @param schemaType - Bridge schema type (e.g., 'medications')
 * @param entityType - Entity type (e.g., 'medication')
 * @returns True if they match
 */
export function schemaTypeMatchesEntityType(schemaType: string, entityType: Pass1EntityType): boolean {
  const expectedSchemaType = ENTITY_TO_SCHEMA_TYPE[entityType];
  return schemaType.toLowerCase() === expectedSchemaType.toLowerCase();
}
