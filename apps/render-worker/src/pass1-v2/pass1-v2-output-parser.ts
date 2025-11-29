/**
 * Pass 1 Strategy-A Output Parser
 *
 * Created: 2025-11-29
 * Purpose: Parse and validate AI JSON responses
 * Reference: PASS1-STRATEGY-A-MASTER.md Section 4
 */

import {
  Pass1AIResponse,
  Pass1Entity,
  Pass1BridgeSchemaZone,
  Pass1EntityType,
  VALID_ENTITY_TYPES
} from './pass1-v2-types';

// =============================================================================
// PARSE ERROR CLASS
// =============================================================================

/**
 * Custom error for parsing failures
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly errorType: 'PARSE_JSON' | 'PARSE_SCHEMA' | 'EMPTY_RESPONSE',
    public readonly rawContent?: string
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

// =============================================================================
// JSON EXTRACTION
// =============================================================================

/**
 * Extract JSON from AI response content
 * Handles markdown code blocks and raw JSON
 *
 * @param content - Raw AI response content
 * @returns Extracted JSON string
 * @throws ParseError if no valid JSON found
 */
export function extractJsonFromResponse(content: string): string {
  if (!content || content.trim() === '') {
    throw new ParseError('Empty response from AI', 'EMPTY_RESPONSE');
  }

  const trimmed = content.trim();

  // Try to find JSON in markdown code block
  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    return jsonBlockMatch[1].trim();
  }

  // Try to find raw JSON object
  const jsonObjectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    return jsonObjectMatch[0];
  }

  // If content starts with { or [, assume it's JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }

  throw new ParseError(
    'No valid JSON found in AI response',
    'PARSE_JSON',
    content.substring(0, 500)
  );
}

// =============================================================================
// SCHEMA VALIDATION
// =============================================================================

/**
 * Validate and normalize an entity from AI response
 *
 * @param raw - Raw entity object from AI
 * @param index - Entity index for default ID
 * @returns Validated Pass1Entity
 * @throws ParseError if entity is invalid
 */
function validateEntity(raw: any, index: number): Pass1Entity {
  if (!raw || typeof raw !== 'object') {
    throw new ParseError(`Entity at index ${index} is not an object`, 'PARSE_SCHEMA');
  }

  // Required fields
  if (!raw.original_text || typeof raw.original_text !== 'string') {
    throw new ParseError(`Entity at index ${index} missing original_text`, 'PARSE_SCHEMA');
  }

  if (!raw.entity_type || typeof raw.entity_type !== 'string') {
    throw new ParseError(`Entity at index ${index} missing entity_type`, 'PARSE_SCHEMA');
  }

  // Validate entity_type
  const normalizedType = raw.entity_type.toLowerCase().trim() as Pass1EntityType;
  if (!VALID_ENTITY_TYPES.includes(normalizedType)) {
    // Try to map common variations
    const mappedType = mapEntityType(raw.entity_type);
    if (!mappedType) {
      throw new ParseError(
        `Entity at index ${index} has invalid entity_type: ${raw.entity_type}`,
        'PARSE_SCHEMA'
      );
    }
    raw.entity_type = mappedType;
  } else {
    raw.entity_type = normalizedType;
  }

  // Normalize page_number
  let pageNumber = 1;
  if (raw.page_number !== undefined && raw.page_number !== null) {
    pageNumber = typeof raw.page_number === 'number'
      ? raw.page_number
      : parseInt(String(raw.page_number), 10) || 1;
  }

  // Normalize y_coordinate
  let yCoordinate: number | null = null;
  if (raw.y_coordinate !== undefined && raw.y_coordinate !== null) {
    const parsedY = typeof raw.y_coordinate === 'number'
      ? raw.y_coordinate
      : parseInt(String(raw.y_coordinate), 10);
    yCoordinate = isNaN(parsedY) ? null : parsedY;
  }

  // Normalize aliases
  let aliases: string[] = [];
  if (Array.isArray(raw.aliases)) {
    aliases = raw.aliases
      .filter((a: any) => typeof a === 'string' && a.trim() !== '')
      .slice(0, 3)  // Max 3 aliases
      .map((a: string) => a.trim());
  }

  // Generate ID if not provided
  const id = raw.id && typeof raw.id === 'string'
    ? raw.id
    : `e${index + 1}`;

  return {
    id,
    original_text: raw.original_text.trim(),
    entity_type: raw.entity_type as Pass1EntityType,
    aliases,
    y_coordinate: yCoordinate,
    page_number: pageNumber
  };
}

/**
 * Map common entity type variations to valid types
 *
 * @param rawType - Raw entity type string
 * @returns Mapped valid type or null
 */
function mapEntityType(rawType: string): Pass1EntityType | null {
  const normalized = rawType.toLowerCase().trim();

  const mappings: Record<string, Pass1EntityType> = {
    // Medication variations
    'med': 'medication',
    'drug': 'medication',
    'prescription': 'medication',
    'rx': 'medication',

    // Condition variations
    'diagnosis': 'condition',
    'disease': 'condition',
    'problem': 'condition',
    'dx': 'condition',

    // Procedure variations
    'surgery': 'procedure',
    'operation': 'procedure',
    'treatment': 'procedure',

    // Lab result variations
    'lab': 'lab_result',
    'labs': 'lab_result',
    'test': 'lab_result',
    'test_result': 'lab_result',
    'laboratory': 'lab_result',

    // Vital sign variations
    'vital': 'vital_sign',
    'vitals': 'vital_sign',

    // Allergy variations
    'allergies': 'allergy',
    'sensitivity': 'allergy',

    // Physical finding variations
    'finding': 'physical_finding',
    'exam_finding': 'physical_finding',
    'physical': 'physical_finding',

    // Observation variations
    'note': 'observation',
    'clinical_note': 'observation'
  };

  return mappings[normalized] || null;
}

/**
 * Validate and normalize a bridge schema zone from AI response
 *
 * @param raw - Raw zone object from AI
 * @param index - Zone index for error messages
 * @returns Validated Pass1BridgeSchemaZone
 * @throws ParseError if zone is invalid
 */
function validateZone(raw: any, index: number): Pass1BridgeSchemaZone {
  if (!raw || typeof raw !== 'object') {
    throw new ParseError(`Zone at index ${index} is not an object`, 'PARSE_SCHEMA');
  }

  // Required fields
  if (!raw.schema_type || typeof raw.schema_type !== 'string') {
    throw new ParseError(`Zone at index ${index} missing schema_type`, 'PARSE_SCHEMA');
  }

  if (raw.y_start === undefined || raw.y_start === null) {
    throw new ParseError(`Zone at index ${index} missing y_start`, 'PARSE_SCHEMA');
  }

  if (raw.y_end === undefined || raw.y_end === null) {
    throw new ParseError(`Zone at index ${index} missing y_end`, 'PARSE_SCHEMA');
  }

  // Normalize values
  const yStart = typeof raw.y_start === 'number'
    ? raw.y_start
    : parseInt(String(raw.y_start), 10);

  const yEnd = typeof raw.y_end === 'number'
    ? raw.y_end
    : parseInt(String(raw.y_end), 10);

  if (isNaN(yStart) || isNaN(yEnd)) {
    throw new ParseError(`Zone at index ${index} has invalid y_start or y_end`, 'PARSE_SCHEMA');
  }

  // Ensure y_end > y_start (swap if needed)
  const [finalYStart, finalYEnd] = yStart < yEnd ? [yStart, yEnd] : [yEnd, yStart];

  // Normalize page_number
  let pageNumber = 1;
  if (raw.page_number !== undefined && raw.page_number !== null) {
    pageNumber = typeof raw.page_number === 'number'
      ? raw.page_number
      : parseInt(String(raw.page_number), 10) || 1;
  }

  return {
    schema_type: raw.schema_type.trim().toLowerCase(),
    page_number: pageNumber,
    y_start: finalYStart,
    y_end: finalYEnd
  };
}

// =============================================================================
// MAIN PARSER
// =============================================================================

/**
 * Parse AI response content into structured Pass1AIResponse
 *
 * @param content - Raw AI response content
 * @returns Parsed and validated Pass1AIResponse
 * @throws ParseError if parsing or validation fails
 */
export function parsePass1Response(content: string): Pass1AIResponse {
  // Extract JSON from response
  const jsonString = extractJsonFromResponse(content);

  // Parse JSON
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new ParseError(
      `Failed to parse JSON: ${(e as Error).message}`,
      'PARSE_JSON',
      jsonString.substring(0, 500)
    );
  }

  // Validate structure
  if (!parsed || typeof parsed !== 'object') {
    throw new ParseError('Parsed response is not an object', 'PARSE_SCHEMA');
  }

  // Validate entities array
  const entities: Pass1Entity[] = [];
  if (parsed.entities) {
    if (!Array.isArray(parsed.entities)) {
      throw new ParseError('entities is not an array', 'PARSE_SCHEMA');
    }

    for (let i = 0; i < parsed.entities.length; i++) {
      entities.push(validateEntity(parsed.entities[i], i));
    }
  }

  // Validate bridge_schema_zones array
  const zones: Pass1BridgeSchemaZone[] = [];
  if (parsed.bridge_schema_zones) {
    if (!Array.isArray(parsed.bridge_schema_zones)) {
      throw new ParseError('bridge_schema_zones is not an array', 'PARSE_SCHEMA');
    }

    for (let i = 0; i < parsed.bridge_schema_zones.length; i++) {
      zones.push(validateZone(parsed.bridge_schema_zones[i], i));
    }
  }

  return {
    entities,
    bridge_schema_zones: zones
  };
}

// =============================================================================
// BATCH RESULT MERGING
// =============================================================================

/**
 * Merge multiple batch results into a single response
 * Renumbers entity IDs to ensure uniqueness
 *
 * @param batchResults - Array of parsed batch results
 * @returns Merged Pass1AIResponse
 */
export function mergeBatchResults(batchResults: Pass1AIResponse[]): Pass1AIResponse {
  const allEntities: Pass1Entity[] = [];
  const allZones: Pass1BridgeSchemaZone[] = [];

  let entityCounter = 0;

  for (const batch of batchResults) {
    // Renumber entities for uniqueness
    for (const entity of batch.entities) {
      entityCounter++;
      allEntities.push({
        ...entity,
        id: `e${entityCounter}`
      });
    }

    // Zones don't need renumbering
    allZones.push(...batch.bridge_schema_zones);
  }

  return {
    entities: allEntities,
    bridge_schema_zones: allZones
  };
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Check if a parsed response has any entities
 *
 * @param response - Parsed response
 * @returns True if entities were found
 */
export function hasEntities(response: Pass1AIResponse): boolean {
  return response.entities.length > 0;
}

/**
 * Check if a parsed response has any zones
 *
 * @param response - Parsed response
 * @returns True if zones were found
 */
export function hasZones(response: Pass1AIResponse): boolean {
  return response.bridge_schema_zones.length > 0;
}

/**
 * Get summary statistics from parsed response
 *
 * @param response - Parsed response
 * @returns Summary object
 */
export function getResponseSummary(response: Pass1AIResponse): {
  entityCount: number;
  zoneCount: number;
  entitiesByType: Record<string, number>;
  zonesByType: Record<string, number>;
} {
  const entitiesByType: Record<string, number> = {};
  for (const entity of response.entities) {
    entitiesByType[entity.entity_type] = (entitiesByType[entity.entity_type] || 0) + 1;
  }

  const zonesByType: Record<string, number> = {};
  for (const zone of response.bridge_schema_zones) {
    zonesByType[zone.schema_type] = (zonesByType[zone.schema_type] || 0) + 1;
  }

  return {
    entityCount: response.entities.length,
    zoneCount: response.bridge_schema_zones.length,
    entitiesByType,
    zonesByType
  };
}
