/**
 * Pass 1 Strategy-A Prompt Generator
 *
 * Created: 2025-11-29
 * Updated: 2025-12-01 - V3 patient-context approach (07b spec)
 * Purpose: Build prompts for entity detection from OCR text
 * Reference: 07b-PASS1-PROMPT-V3-PATIENT-CONTEXT.md
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
 * V3: Patient-context framing - extract facts ABOUT THIS PATIENT
 */
export const PASS1_SYSTEM_MESSAGE = `You are reviewing a patient's medical record. Your task is to extract clinical facts that are TRUE OF THIS PATIENT - their conditions, their medications, their procedures, their immunisations.

Medical documents contain many medical terms that are NOT facts about the patient:
- Vaccine names include diseases they prevent (not patient diagnoses)
- Negation phrases rule OUT conditions (patient does NOT have them)
- Family history describes relatives (not this patient)
- Side effect warnings are potential risks (not confirmed conditions)

Extract only what belongs in this patient's structured health record. Output JSON only.`;

// =============================================================================
// PROMPT GENERATION
// =============================================================================

/**
 * Options for building the user prompt
 */
export interface PromptOptions {
  pageNumber?: number;
  batchInfo?: string;
  includeZones?: boolean;  // Default: true - set false for entity-only extraction test
}

/**
 * Build the user prompt for Pass 1 entity detection
 * V3: Patient-context approach with explicit exclusion rules
 *
 * @param ocrText - Pre-formatted OCR text with [Y:###] markers (from enhanced-ocr-y.txt)
 * @param options - Prompt options (pageNumber, batchInfo, includeZones)
 * @returns User prompt string
 */
export function buildUserPrompt(
  ocrText: string,
  options: PromptOptions = {}
): string {
  const { pageNumber, batchInfo, includeZones = true } = options;

  // Build entity types list
  const entityTypesList = VALID_ENTITY_TYPES.join(', ');

  // Build the prompt - OCR text already has [Y:###] markers
  let prompt = `PATIENT MEDICAL RECORD (OCR with Y-coordinates):
${ocrText}

TASK: Extract clinical facts about THIS PATIENT.

ENTITY TYPES: ${entityTypesList}

WHAT TO EXTRACT (facts about this patient):
- Conditions the patient HAS (diagnoses in history sections)
- Medications the patient TAKES (current medications, prescriptions)
- Procedures the patient HAD (surgeries, treatments performed on them)
- Immunisations the patient RECEIVED (vaccines administered)
- Allergies the patient HAS
- Lab results, vitals, observations about the patient

WHAT NOT TO EXTRACT (not facts about this patient):
- Disease names in vaccine records: "Stamaril (Yellow Fever)" -> extract "Stamaril (Yellow Fever)" as immunisation, do NOT extract "Yellow Fever" as a separate condition
- Negated conditions: "No evidence of kidney disease" -> do NOT extract "kidney disease"
- Risk assessments: "low risk of prostatic neoplasia" -> do NOT extract "prostatic neoplasia"
- Family history: conditions listed under "Family History" belong to relatives, not this patient
- "Nil known" in allergy section: this is an observation that patient has no known allergies, not an allergy entity

EXTRACTION RULES:
- Use the EXACT text from the document for original_text
- Record the Y-coordinate from the [Y:###] marker
- Include 1-3 aliases for medical code lookup (generic name, common abbreviation, or brand name)
- If the same medication appears on multiple lines (different dates), extract each occurrence separately
`;

  // Only add zone instructions if includeZones is true
  if (includeZones) {
    prompt += `
ZONE RULES:
- Group entities into bridge_schema_zones by type and contiguous Y-range
- One zone per schema_type per contiguous Y-range
- entity_count must match the number of entities in that zone
`;
  }

  // Add page context if provided
  if (pageNumber !== undefined) {
    prompt += `\nAll entities on this page should have page_number: ${pageNumber}`;
  }

  // Add batch context if provided
  if (batchInfo) {
    prompt += `\n${batchInfo}`;
  }

  // Add output schema - different based on includeZones flag
  if (includeZones) {
    prompt += `

OUTPUT JSON:
{
  "entities": [
    {
      "id": "e1",
      "original_text": "Metformin 500mg Tablet",
      "entity_type": "medication",
      "aliases": ["metformin hydrochloride", "Glucophage"],
      "y_coordinate": 1350,
      "page_number": 1
    },
    {
      "id": "e2",
      "original_text": "Type 2 Diabetes",
      "entity_type": "condition",
      "aliases": ["diabetes mellitus type 2", "T2DM", "T2 diabetes"],
      "y_coordinate": 1890,
      "page_number": 1
    },
    {
      "id": "e3",
      "original_text": "Aortic valve replacement",
      "entity_type": "procedure",
      "aliases": ["AVR", "aortic valve surgery"],
      "y_coordinate": 2000,
      "page_number": 1
    },
    {
      "id": "e4",
      "original_text": "FluQuadri (Influenza)",
      "entity_type": "immunisation",
      "aliases": ["influenza vaccine", "flu shot"],
      "y_coordinate": 930,
      "page_number": 2
    },
    {
      "id": "e5",
      "original_text": "Penicillin",
      "entity_type": "allergy",
      "aliases": ["penicillin allergy", "PCN allergy"],
      "y_coordinate": 820,
      "page_number": 1
    }
  ],
  "bridge_schema_zones": [
    {
      "schema_type": "medications",
      "page_number": 1,
      "y_start": 1350,
      "y_end": 1350,
      "entity_count": 1
    },
    {
      "schema_type": "conditions",
      "page_number": 1,
      "y_start": 1890,
      "y_end": 1890,
      "entity_count": 1
    },
    {
      "schema_type": "immunisations",
      "page_number": 2,
      "y_start": 930,
      "y_end": 930,
      "entity_count": 1
    }
  ]
}

Note: e4 shows correct immunisation handling - include "(Influenza)" in original_text but classify as immunisation only, NOT as a separate condition.

Output ONLY valid JSON. No explanations.`;
  } else {
    // Entity-only output schema (no zones)
    prompt += `

OUTPUT JSON:
{
  "entities": [
    {
      "id": "e1",
      "original_text": "Metformin 500mg Tablet",
      "entity_type": "medication",
      "aliases": ["metformin hydrochloride", "Glucophage"],
      "y_coordinate": 1350,
      "page_number": 1
    },
    {
      "id": "e2",
      "original_text": "Type 2 Diabetes",
      "entity_type": "condition",
      "aliases": ["diabetes mellitus type 2", "T2DM", "T2 diabetes"],
      "y_coordinate": 1890,
      "page_number": 1
    },
    {
      "id": "e3",
      "original_text": "Aortic valve replacement",
      "entity_type": "procedure",
      "aliases": ["AVR", "aortic valve surgery"],
      "y_coordinate": 2000,
      "page_number": 1
    },
    {
      "id": "e4",
      "original_text": "FluQuadri (Influenza)",
      "entity_type": "immunisation",
      "aliases": ["influenza vaccine", "flu shot"],
      "y_coordinate": 930,
      "page_number": 2
    },
    {
      "id": "e5",
      "original_text": "Penicillin",
      "entity_type": "allergy",
      "aliases": ["penicillin allergy", "PCN allergy"],
      "y_coordinate": 820,
      "page_number": 1
    }
  ]
}

Note: e4 shows correct immunisation handling - include "(Influenza)" in original_text but classify as immunisation only, NOT as a separate condition.

Output ONLY valid JSON. No explanations.`;
  }

  return prompt;
}

/**
 * Build complete prompt for Pass 1 entity detection
 *
 * @param ocrText - Pre-formatted OCR text with [Y:###] markers
 * @param pageNumber - Starting page number (for single-page or batch context)
 * @param pageCount - Total pages in this batch
 * @param includeZones - Whether to include zone instructions (default: true)
 * @returns Object with system and user prompts
 */
export function buildPass1Prompt(
  ocrText: string,
  pageNumber?: number,
  pageCount?: number,
  includeZones: boolean = true
): { system: string; user: string } {
  // Build batch info if multi-page
  let batchInfo: string | undefined;
  if (pageCount && pageCount > 1 && pageNumber !== undefined) {
    batchInfo = `This batch covers pages ${pageNumber} to ${pageNumber + pageCount - 1}`;
  }

  return {
    system: PASS1_SYSTEM_MESSAGE,
    user: buildUserPrompt(ocrText, { pageNumber, batchInfo, includeZones })
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
 * @param includeZones - Whether to include zone instructions (default: true)
 * @returns Object with system and user prompts
 */
export function buildBatchPrompt(
  batchOcrText: string,
  pageRangeStart: number,
  pageRangeEnd: number,
  batchIndex: number,
  totalBatches: number,
  includeZones: boolean = true
): { system: string; user: string } {
  let batchInfo = `This is batch ${batchIndex + 1} of ${totalBatches}, covering pages ${pageRangeStart}-${pageRangeEnd}`;
  if (totalBatches > 1) {
    batchInfo += `. Entity IDs should be unique within this batch (e.g., e1, e2, ...).`;
  }

  return {
    system: PASS1_SYSTEM_MESSAGE,
    user: buildUserPrompt(batchOcrText, { pageNumber: pageRangeStart, batchInfo, includeZones })
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
