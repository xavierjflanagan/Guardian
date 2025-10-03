/**
 * Pass 1 Schema Mapping - Entity Subtype to Database Schemas
 * Created: 2025-10-03
 * Purpose: Maps entity subtypes to required database schemas for Pass 2 enrichment
 *
 * CRITICAL: This determines which database tables Pass 2 needs to write to
 * for each entity type detected in Pass 1.
 */
import { EntitySubtype, ProcessingPriority } from './pass1-types';
/**
 * Maps entity subtypes to the database schemas they require for Pass 2 enrichment
 *
 * RULES:
 * - ALL clinical_event entities include 'patient_clinical_events' (master timeline)
 * - Specific subtypes add their specialized tables
 * - healthcare_context entities use contextual schemas (no timeline)
 * - document_structure entities use NO schemas (logging only)
 */
export declare const ENTITY_SCHEMA_MAPPING: Record<EntitySubtype, string[]>;
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
export declare function determineProcessingPriority(entityCategory: string, entitySubtype: EntitySubtype): ProcessingPriority;
/**
 * Assigns database schemas to an entity based on its subtype
 *
 * @param entitySubtype - The specific entity subtype
 * @returns Array of database schema table names
 */
export declare function assignEntitySchemas(entitySubtype: EntitySubtype): string[];
/**
 * Assesses the complexity of Pass 2 enrichment for an entity
 *
 * COMPLEXITY LEVELS:
 * - simple: Single table, straightforward extraction (vitals, symptoms)
 * - moderate: Multiple tables or medical coding required (labs, procedures)
 * - complex: Multiple tables + coding + temporal relationships (medications, diagnoses)
 */
export declare function assessEnrichmentComplexity(entitySubtype: EntitySubtype): 'simple' | 'moderate' | 'complex';
/**
 * Validates that all entity subtypes have schema mappings
 * Run this at startup to catch configuration errors
 */
export declare function validateSchemaMapping(): {
    valid: boolean;
    errors: string[];
};
/**
 * Check if entity requires Pass 2 enrichment
 */
export declare function requiresPass2Enrichment(entitySubtype: EntitySubtype): boolean;
/**
 * Get all unique schemas needed for a list of entity subtypes
 */
export declare function getUniqueSchemas(entitySubtypes: EntitySubtype[]): string[];
/**
 * Count entities by processing priority
 */
export declare function countEntitiesByPriority(entities: Array<{
    category: string;
    subtype: EntitySubtype;
}>): Record<ProcessingPriority, number>;
//# sourceMappingURL=pass1-schema-mapping.d.ts.map