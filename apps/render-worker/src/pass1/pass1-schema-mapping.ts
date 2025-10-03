/**
 * Pass 1 Schema Mapping - Entity Subtype to Database Schemas
 * Created: 2025-10-03
 * Purpose: Maps entity subtypes to required database schemas for Pass 2 enrichment
 *
 * CRITICAL: This determines which database tables Pass 2 needs to write to
 * for each entity type detected in Pass 1.
 */

import { EntitySubtype, ProcessingPriority } from './pass1-types';

// =============================================================================
// ENTITY SUBTYPE → DATABASE SCHEMAS MAPPING
// =============================================================================

/**
 * Maps entity subtypes to the database schemas they require for Pass 2 enrichment
 *
 * RULES:
 * - ALL clinical_event entities include 'patient_clinical_events' (master timeline)
 * - Specific subtypes add their specialized tables
 * - healthcare_context entities use contextual schemas (no timeline)
 * - document_structure entities use NO schemas (logging only)
 */
export const ENTITY_SCHEMA_MAPPING: Record<EntitySubtype, string[]> = {
  // ============================================================================
  // CLINICAL EVENTS - ALL include patient_clinical_events for master timeline
  // ============================================================================

  // Observational Data
  vital_sign: [
    'patient_clinical_events',
    'patient_observations',
    'patient_vitals',
  ],

  lab_result: [
    'patient_clinical_events',
    'patient_observations',
    'patient_lab_results',
  ],

  physical_finding: [
    'patient_clinical_events',
    'patient_observations',
  ],

  symptom: [
    'patient_clinical_events',
    'patient_observations',
  ],

  // Interventional Data
  medication: [
    'patient_clinical_events',
    'patient_interventions',
    'patient_medications',
  ],

  procedure: [
    'patient_clinical_events',
    'patient_interventions',
  ],

  immunization: [
    'patient_clinical_events',
    'patient_interventions',
    'patient_immunizations',
  ],

  // Diagnostic Data
  diagnosis: [
    'patient_clinical_events',
    'patient_conditions',
  ],

  allergy: [
    'patient_clinical_events',
    'patient_allergies',
  ],

  // Healthcare Encounters (still clinical timeline)
  healthcare_encounter: [
    'patient_clinical_events',
    'healthcare_encounters',
  ],

  // Failsafe
  clinical_other: [
    'patient_clinical_events', // At minimum, goes on timeline
  ],

  // ============================================================================
  // HEALTHCARE CONTEXT - Contextual schemas (no patient_clinical_events)
  // ============================================================================

  patient_identifier: ['healthcare_encounters'],
  provider_identifier: ['healthcare_encounters'],
  facility_identifier: ['healthcare_encounters'],
  appointment: ['healthcare_encounters'],
  referral: ['patient_clinical_events'], // Referrals do go on timeline
  care_coordination: ['patient_clinical_events'], // Care plans go on timeline
  insurance_information: ['healthcare_encounters'],
  billing_code: ['healthcare_encounters'],
  authorization: ['healthcare_encounters'],
  healthcare_context_other: ['healthcare_encounters'],

  // ============================================================================
  // DOCUMENT STRUCTURE - No schemas (logging only)
  // ============================================================================

  header: [],
  footer: [],
  logo: [],
  page_marker: [],
  signature_line: [],
  watermark: [],
  form_structure: [],
  document_structure_other: [],
};

// =============================================================================
// PROCESSING PRIORITY ASSIGNMENT
// =============================================================================

/**
 * Determines processing priority based on entity category and subtype
 *
 * PRIORITY LEVELS:
 * - highest: Safety-critical data (allergies, medications, diagnoses)
 * - high: Important clinical data (vitals, labs, procedures)
 * - medium: Supporting clinical data (symptoms, physical findings)
 * - low: Contextual information (appointments, providers)
 * - logging_only: Document structure (no processing needed)
 */
export function determineProcessingPriority(
  entityCategory: string,
  entitySubtype: EntitySubtype
): ProcessingPriority {
  // Document structure = logging only
  if (entityCategory === 'document_structure') {
    return 'logging_only';
  }

  // Safety-critical entities
  const safetyCritical: EntitySubtype[] = [
    'allergy',
    'medication',
    'diagnosis',
    'immunization',
  ];

  if (safetyCritical.includes(entitySubtype)) {
    return 'highest';
  }

  // High-priority clinical data
  const highPriority: EntitySubtype[] = [
    'vital_sign',
    'lab_result',
    'procedure',
    'healthcare_encounter',
  ];

  if (highPriority.includes(entitySubtype)) {
    return 'high';
  }

  // Medium-priority clinical data
  const mediumPriority: EntitySubtype[] = [
    'symptom',
    'physical_finding',
    'clinical_other',
    'referral',
    'care_coordination',
  ];

  if (mediumPriority.includes(entitySubtype)) {
    return 'medium';
  }

  // Everything else (healthcare context) = low priority
  return 'low';
}

// =============================================================================
// SCHEMA ASSIGNMENT FUNCTION
// =============================================================================

/**
 * Assigns database schemas to an entity based on its subtype
 *
 * @param entitySubtype - The specific entity subtype
 * @returns Array of database schema table names
 */
export function assignEntitySchemas(entitySubtype: EntitySubtype): string[] {
  const schemas = ENTITY_SCHEMA_MAPPING[entitySubtype];

  if (!schemas) {
    console.warn(`Unknown entity subtype: ${entitySubtype}, defaulting to patient_clinical_events`);
    return ['patient_clinical_events']; // Fallback to timeline
  }

  return schemas;
}

// =============================================================================
// ENRICHMENT COMPLEXITY ASSESSMENT
// =============================================================================

/**
 * Assesses the complexity of Pass 2 enrichment for an entity
 *
 * COMPLEXITY LEVELS:
 * - simple: Single table, straightforward extraction (vitals, symptoms)
 * - moderate: Multiple tables or medical coding required (labs, procedures)
 * - complex: Multiple tables + coding + temporal relationships (medications, diagnoses)
 */
export function assessEnrichmentComplexity(
  entitySubtype: EntitySubtype
): 'simple' | 'moderate' | 'complex' {
  const schemas = assignEntitySchemas(entitySubtype);

  // No schemas = simple (just logging)
  if (schemas.length === 0) {
    return 'simple';
  }

  // Complex entities (multiple tables + coding)
  const complexEntities: EntitySubtype[] = [
    'medication',      // Medications + interventions + events
    'diagnosis',       // Conditions + events + coding
    'allergy',         // Allergies + events + severity
    'immunization',    // Immunizations + interventions + events
  ];

  if (complexEntities.includes(entitySubtype)) {
    return 'complex';
  }

  // Moderate entities (2-3 tables or medical coding)
  const moderateEntities: EntitySubtype[] = [
    'vital_sign',
    'lab_result',
    'procedure',
    'healthcare_encounter',
  ];

  if (moderateEntities.includes(entitySubtype)) {
    return 'moderate';
  }

  // Everything else = simple
  return 'simple';
}

// =============================================================================
// SCHEMA VALIDATION
// =============================================================================

/**
 * Validates that all entity subtypes have schema mappings
 * Run this at startup to catch configuration errors
 */
export function validateSchemaMapping(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for missing mappings
  const allSubtypes: EntitySubtype[] = [
    // Clinical events
    'vital_sign', 'lab_result', 'physical_finding', 'symptom',
    'medication', 'procedure', 'immunization', 'diagnosis', 'allergy',
    'healthcare_encounter', 'clinical_other',
    // Healthcare context
    'patient_identifier', 'provider_identifier', 'facility_identifier',
    'appointment', 'referral', 'care_coordination', 'insurance_information',
    'billing_code', 'authorization', 'healthcare_context_other',
    // Document structure
    'header', 'footer', 'logo', 'page_marker', 'signature_line',
    'watermark', 'form_structure', 'document_structure_other',
  ];

  for (const subtype of allSubtypes) {
    if (!(subtype in ENTITY_SCHEMA_MAPPING)) {
      errors.push(`Missing schema mapping for subtype: ${subtype}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if entity requires Pass 2 enrichment
 */
export function requiresPass2Enrichment(entitySubtype: EntitySubtype): boolean {
  const schemas = assignEntitySchemas(entitySubtype);
  return schemas.length > 0;
}

/**
 * Get all unique schemas needed for a list of entity subtypes
 */
export function getUniqueSchemas(entitySubtypes: EntitySubtype[]): string[] {
  const allSchemas = entitySubtypes.flatMap(subtype => assignEntitySchemas(subtype));
  return [...new Set(allSchemas)]; // Deduplicate
}

/**
 * Count entities by processing priority
 */
export function countEntitiesByPriority(
  entities: Array<{ category: string; subtype: EntitySubtype }>
): Record<ProcessingPriority, number> {
  const counts: Record<ProcessingPriority, number> = {
    highest: 0,
    high: 0,
    medium: 0,
    low: 0,
    logging_only: 0,
  };

  for (const entity of entities) {
    const priority = determineProcessingPriority(entity.category, entity.subtype);
    counts[priority]++;
  }

  return counts;
}
