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
export const PASS1_SYSTEM_MESSAGE = `You are a medical document reviewer that locates, extracts and classifies clinical entities and their locations from the uploaded document OCR text. Output minimal JSON only.`;

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

TASK: Identify and extract every clinical entity from this document.

STEP 1 - LINE-BY-LINE EXTRACTION:
Read EVERY line of the document. For each line, determine:
- Does this line contain any clinical entities?
- If yes, extract ALL clinical entities with their exact text, entity_type, page_number, and y_coordinate

STEP 2 - GROUP INTO ZONES:
After extracting all entities, group them into bridge_schema_zones to help with downstream parralel batch processing.
A zone is a contiguous Y-range on a page where entities of the same type cluster.

ENTITY TYPES: ${entityTypesList}

EXTRACTION RULES:
- A clinical entity is ANY mention of a medication, condition, disease, procedure, immunisation, allergy, test result, vital measurement, or clinical observation - essentially anything that is a clinical event, clinical fact or clinical context.
- Read every line - entities may be scattered throughout without section headers
- DO NOT DEDUPLICATE: If the same medication/vaccine appears on 5 different lines, output 5 separate entities with different y_coordinates
- Each line that contains clinical entities = at least one entity in your output (even if the clinical entity is listed on other lines)
- Extract the EXACT text as it appears in the document for original_text
- Use y_coordinate from the [Y:###] marker for that line
- When uncertain whether something is a clinical entity, include it
- Aliases: 1-3 common alternatives for medical code lookup (SNOMED, RxNorm, LOINC)

COMMON PATTERNS TO RECOGNIZE:
- "Prescriptions:" or "Script date:" sections contain medications
- Immunisation records often have format: "DATE Vaccine Name (Disease)"
- Past History sections contain conditions AND procedures
- Lines with "mg", "mcg", "mL", "Tablet", "Capsule", "Injection" are likely medications or immunisations
- Lines with dates followed by medical terms are likely clinical events

ZONE RULES:
- One zone per schema_type per contiguous Y-range
- Zones of different types on the same page MAY overlap
- entity_count must match the number of entities you extracted for that zone
- A clinical section continuing from one page to the next = separate zones (different pages)`;

  // Add page context if provided
  if (pageNumber !== undefined) {
    prompt += `\n- All entities on this page should have page_number: ${pageNumber}`;
  }

  // Add batch context if provided
  if (batchInfo) {
    prompt += `\n- ${batchInfo}`;
  }

  // Add output schema with multi-page example
  prompt += `

OUTPUT JSON SCHEMA:
{
  "entities": [
    {
      "id": "e1",
      "original_text": "Metformin 500mg Tablet",
      "entity_type": "medication",
      "aliases": ["metformin", "glucophage"],
      "y_coordinate": 550,
      "page_number": 1
    },
    {
      "id": "e2",
      "original_text": "Lisinopril 10mg Tablet",
      "entity_type": "medication",
      "aliases": ["lisinopril", "zestril"],
      "y_coordinate": 620,
      "page_number": 1
    },
    {
      "id": "e3",
      "original_text": "Type 2 Diabetes",
      "entity_type": "condition",
      "aliases": ["diabetes mellitus type 2", "T2DM"],
      "y_coordinate": 900,
      "page_number": 1
    },
    {
      "id": "e4",
      "original_text": "Hypertension",
      "entity_type": "condition",
      "aliases": ["high blood pressure", "HTN"],
      "y_coordinate": 950,
      "page_number": 1
    },
    {
      "id": "e5",
      "original_text": "Ruptured spleen",
      "entity_type": "condition",
      "aliases": ["splenic rupture"],
      "y_coordinate": 130,
      "page_number": 2
    },
    {
      "id": "e6",
      "original_text": "Pneumonia",
      "entity_type": "condition",
      "aliases": ["lung infection"],
      "y_coordinate": 200,
      "page_number": 2
    },
    {
      "id": "e7",
      "original_text": "Influenza Vaccine",
      "entity_type": "immunisation",
      "aliases": ["flu shot", "flu vaccine"],
      "y_coordinate": 500,
      "page_number": 2
    },
    {
      "id": "e8",
      "original_text": "COVID-19 Vaccine",
      "entity_type": "immunisation",
      "aliases": ["covid vaccine", "coronavirus vaccine"],
      "y_coordinate": 550,
      "page_number": 2
    },
    {
      "id": "e9",
      "original_text": "Hepatitis B Vaccine",
      "entity_type": "immunisation",
      "aliases": ["hep B vaccine"],
      "y_coordinate": 600,
      "page_number": 2
    },
    {
      "id": "e10",
      "original_text": "Doxycycline 100mg Capsule",
      "entity_type": "medication",
      "aliases": ["doxycycline"],
      "y_coordinate": 950,
      "page_number": 2
    },
    {
      "id": "e11",
      "original_text": "Metformin 500mg Tablet",
      "entity_type": "medication",
      "aliases": ["metformin", "glucophage"],
      "y_coordinate": 1050,
      "page_number": 2
    }
  ],
  "bridge_schema_zones": [
    {
      "schema_type": "medications",
      "page_number": 1,
      "y_start": 550,
      "y_end": 620,
      "entity_count": 2
    },
    {
      "schema_type": "conditions",
      "page_number": 1,
      "y_start": 900,
      "y_end": 950,
      "entity_count": 2
    },
    {
      "schema_type": "conditions",
      "page_number": 2,
      "y_start": 130,
      "y_end": 200,
      "entity_count": 2
    },
    {
      "schema_type": "immunisations",
      "page_number": 2,
      "y_start": 500,
      "y_end": 600,
      "entity_count": 3
    },
    {
      "schema_type": "medications",
      "page_number": 2,
      "y_start": 950,
      "y_end": 1050,
      "entity_count": 2
    }
  ]
}

The example above shows:
- Page 1: 2 medications (e1, e2), 2 conditions (e3, e4)
- Page 2: 2 conditions (e5, e6), 3 immunisations (e7, e8, e9), 2 medications (e10, e11)
- Note: e11 is "Metformin 500mg Tablet" again - same drug as e1 but different line/date = separate entity
- 5 zones total across 2 pages, with entity_count matching actual entities in each zone

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
  'physical_finding': 'physical_findings',
  'immunisation': 'immunisations'
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
