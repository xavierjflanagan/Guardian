/**
 * Identifier Extractor - Strategy A
 *
 * Purpose: Extract and parse medical identifiers from AI-provided encounter data.
 *          Handles MRN, Medicare, insurance numbers, and other healthcare identifiers.
 *
 * Source: File 10 (PROFILE-CLASSIFICATION-INTEGRATION.md)
 * Complexity: LOW-MEDIUM
 *
 * Key Concepts:
 * - Medical Record Number (MRN): Hospital/facility patient ID
 * - Medicare Number: Australian Medicare card number (10 digits)
 * - Insurance ID: Private health insurance member number
 * - Identifier normalization: Remove whitespace, hyphens for matching
 *
 * Integration:
 * - Called by chunk-processor.ts after AI response
 * - Extracts identifiers from AI-provided array
 * - Stores in pass05_pending_encounter_identifiers table
 */

import { MedicalIdentifier } from './types';

/**
 * Parsed identifier ready for database storage
 */
export interface ParsedIdentifier {
  identifier_type: string;
  identifier_value: string;
  issuing_organization: string | null;
  detected_context: string | null;
  normalized_value: string;  // For matching/deduplication
}

/**
 * Identifier extraction result
 */
export interface IdentifierExtractionResult {
  identifiers: ParsedIdentifier[];
  validation_warnings: string[];
}

/**
 * Extract and parse identifiers from AI response
 *
 * Takes raw identifiers from AI and:
 * 1. Validates format
 * 2. Normalizes values for matching
 * 3. Detects identifier types
 * 4. Validates against known patterns
 *
 * @param aiIdentifiers - Array of identifiers from AI response
 * @param encounterContext - Optional context for validation (encounter type, facility)
 * @returns Parsed identifiers ready for database storage
 */
export function extractIdentifiers(
  aiIdentifiers: MedicalIdentifier[],
  _encounterContext?: {
    facility_name?: string;
    provider_name?: string;
    encounter_type?: string;
  }
): IdentifierExtractionResult {
  const identifiers: ParsedIdentifier[] = [];
  const validation_warnings: string[] = [];

  for (const aiId of aiIdentifiers) {
    try {
      // Skip empty or invalid identifiers
      if (!aiId.identifier_value || aiId.identifier_value.trim().length === 0) {
        validation_warnings.push('Skipped empty identifier value');
        continue;
      }

      // Normalize value (remove whitespace, hyphens, lowercase for matching)
      const normalized_value = normalizeIdentifierValue(aiId.identifier_value);

      // Validate identifier type
      const identifier_type = validateIdentifierType(
        aiId.identifier_type,
        aiId.identifier_value
      );

      // Validate format based on type
      const formatValidation = validateIdentifierFormat(identifier_type, normalized_value);
      if (!formatValidation.valid) {
        validation_warnings.push(
          `${identifier_type} format validation: ${formatValidation.warning}`
        );
      }

      // Build parsed identifier
      const parsed: ParsedIdentifier = {
        identifier_type,
        identifier_value: aiId.identifier_value.trim(),
        issuing_organization: aiId.issuing_organization?.trim() || null,
        detected_context: aiId.detected_context?.trim() || null,
        normalized_value
      };

      identifiers.push(parsed);

    } catch (error) {
      validation_warnings.push(
        `Failed to parse identifier "${aiId.identifier_value}": ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  return {
    identifiers,
    validation_warnings
  };
}

/**
 * Normalize identifier value for matching and deduplication
 *
 * Removes whitespace, hyphens, and lowercases for consistent matching.
 *
 * Examples:
 * - "RMH-123456" → "rmh123456"
 * - "2345 6789 0" → "234567890"
 * - "ABC 12345" → "abc12345"
 *
 * @param value - Raw identifier value
 * @returns Normalized value
 */
export function normalizeIdentifierValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\-_]/g, '')  // Remove whitespace, hyphens, underscores
    .trim();
}

/**
 * Validate and normalize identifier type
 *
 * Handles common variations and typos in AI-provided types.
 *
 * @param aiType - Type from AI response
 * @param value - Identifier value (for auto-detection)
 * @returns Normalized identifier type
 */
export function validateIdentifierType(aiType: string, value: string): string {
  const typeUpper = aiType.toUpperCase().trim();

  // MRN variations
  if (/^MRN|MEDICAL.?RECORD|PATIENT.?ID|HOSPITAL.?ID/.test(typeUpper)) {
    return 'MRN';
  }

  // Medicare variations
  if (/^MEDICARE|MCARE|MC/.test(typeUpper)) {
    return 'MEDICARE';
  }

  // Insurance variations
  if (/^INSURANCE|HEALTH.?FUND|PRIVATE.?HEALTH|PHI/.test(typeUpper)) {
    return 'INSURANCE';
  }

  // IHI (Individual Healthcare Identifier - Australian)
  if (/^IHI|INDIVIDUAL.?HEALTH/.test(typeUpper)) {
    return 'IHI';
  }

  // DVA (Department of Veterans' Affairs - Australian)
  if (/^DVA|VETERAN/.test(typeUpper)) {
    return 'DVA';
  }

  // Pension Card
  if (/^PENSION|CONCESSION/.test(typeUpper)) {
    return 'PENSION_CARD';
  }

  // Healthcare Card
  if (/^HEALTHCARE.?CARD|HCC/.test(typeUpper)) {
    return 'HEALTHCARE_CARD';
  }

  // Auto-detect Medicare if value matches pattern (10 digits + optional suffix)
  if (/^\d{10}$/.test(normalizeIdentifierValue(value))) {
    return 'MEDICARE';
  }

  // Default: use AI's type but normalize it
  return typeUpper.replace(/\s+/g, '_');
}

/**
 * Validate identifier format based on type
 *
 * Performs basic format validation for known identifier types.
 * Does NOT enforce strict validation (too many edge cases in real data).
 *
 * @param type - Normalized identifier type
 * @param normalizedValue - Normalized identifier value
 * @returns Validation result with warning if invalid
 */
export function validateIdentifierFormat(
  type: string,
  normalizedValue: string
): { valid: boolean; warning?: string } {
  switch (type) {
    case 'MEDICARE':
      // Australian Medicare: 10 digits + optional 1-digit suffix
      // Format: NNNN NNNNN N or NNNNNNNNNN
      if (!/^\d{10,11}$/.test(normalizedValue)) {
        return {
          valid: false,
          warning: `Medicare number should be 10-11 digits, got ${normalizedValue.length}`
        };
      }
      return { valid: true };

    case 'IHI':
      // Australian IHI: 16 digits
      if (!/^\d{16}$/.test(normalizedValue)) {
        return {
          valid: false,
          warning: `IHI should be 16 digits, got ${normalizedValue.length}`
        };
      }
      return { valid: true };

    case 'MRN':
      // MRN: Very flexible, usually alphanumeric 4-12 characters
      if (normalizedValue.length < 2 || normalizedValue.length > 20) {
        return {
          valid: false,
          warning: `MRN length unusual: ${normalizedValue.length} characters`
        };
      }
      return { valid: true };

    case 'INSURANCE':
      // Insurance: Very flexible, alphanumeric
      if (normalizedValue.length < 3 || normalizedValue.length > 30) {
        return {
          valid: false,
          warning: `Insurance ID length unusual: ${normalizedValue.length} characters`
        };
      }
      return { valid: true };

    case 'DVA':
      // DVA: Format varies, usually alphanumeric
      if (normalizedValue.length < 3 || normalizedValue.length > 15) {
        return {
          valid: false,
          warning: `DVA number length unusual: ${normalizedValue.length} characters`
        };
      }
      return { valid: true };

    default:
      // Unknown types: minimal validation (not empty)
      if (normalizedValue.length === 0) {
        return {
          valid: false,
          warning: 'Identifier value is empty after normalization'
        };
      }
      return { valid: true };
  }
}

/**
 * Deduplicate identifiers within a single encounter
 *
 * Removes duplicate identifiers based on normalized value and type.
 * Keeps the first occurrence (assuming AI provides most confident first).
 *
 * @param identifiers - Array of parsed identifiers
 * @returns Deduplicated array
 */
export function deduplicateIdentifiers(identifiers: ParsedIdentifier[]): ParsedIdentifier[] {
  const seen = new Set<string>();
  const deduplicated: ParsedIdentifier[] = [];

  for (const id of identifiers) {
    // Create unique key from type + normalized value
    const key = `${id.identifier_type}:${id.normalized_value}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(id);
    }
  }

  return deduplicated;
}

/**
 * Batch extract identifiers from multiple encounters
 *
 * Optimized for processing all encounters in a chunk at once.
 *
 * @param encounters - Array of encounters with identifiers
 * @returns Map of encounter index to extraction results
 */
export function batchExtractIdentifiers(
  encounters: Array<{
    encounter_index: number;
    identifiers?: MedicalIdentifier[];
    facility_name?: string;
    provider_name?: string;
    encounter_type?: string;
  }>
): Map<number, IdentifierExtractionResult> {
  const results = new Map<number, IdentifierExtractionResult>();

  for (const encounter of encounters) {
    if (!encounter.identifiers || encounter.identifiers.length === 0) {
      // No identifiers for this encounter
      results.set(encounter.encounter_index, {
        identifiers: [],
        validation_warnings: []
      });
      continue;
    }

    // Extract identifiers for this encounter
    const extraction = extractIdentifiers(encounter.identifiers, {
      facility_name: encounter.facility_name,
      provider_name: encounter.provider_name,
      encounter_type: encounter.encounter_type
    });

    // Deduplicate identifiers
    extraction.identifiers = deduplicateIdentifiers(extraction.identifiers);

    results.set(encounter.encounter_index, extraction);
  }

  return results;
}
