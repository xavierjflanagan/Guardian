"use strict";
/**
 * Pass 1.5 Medical Code Embedding - Configuration
 *
 * Purpose: Centralized configuration for embedding and search parameters
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNIVERSAL_CODE_SYSTEMS = exports.REGIONAL_CODE_SYSTEMS = exports.ENTITY_TYPE_STRATEGIES = exports.PASS15_CONFIG = void 0;
exports.PASS15_CONFIG = {
    embedding: {
        model: 'text-embedding-3-small',
        dimensions: 1536,
        max_retries: 3,
        cache_ttl_hours: 24,
    },
    search: {
        max_universal_candidates: 30,
        max_regional_candidates: 30,
        similarity_threshold: 0.60,
        timeout_ms: 5000,
    },
    candidate_selection: {
        MIN_CANDIDATES: 5,
        MAX_CANDIDATES: 20,
        AUTO_INCLUDE_THRESHOLD: 0.85,
        MIN_SIMILARITY: 0.60,
        TARGET_CANDIDATES: 10,
    },
};
/**
 * Entity type mappings for Smart Entity-Type Strategy
 */
exports.ENTITY_TYPE_STRATEGIES = {
    MEDICATION_TYPES: ['medication', 'immunization'],
    DIAGNOSIS_TYPES: ['diagnosis', 'allergy', 'symptom'],
    VITAL_TYPES: ['vital_sign', 'lab_result', 'physical_finding'],
    PROCEDURE_TYPES: ['procedure'],
    IDENTIFIER_TYPES: ['patient_identifier', 'provider_identifier'],
};
/**
 * Regional code system mappings
 */
exports.REGIONAL_CODE_SYSTEMS = {
    AUS: ['pbs', 'mbs', 'icd10_am'],
    USA: ['ndc', 'cpt', 'icd10_cm'],
    GBR: ['nhs_dmd', 'bnf'],
};
/**
 * Universal code system mappings
 */
exports.UNIVERSAL_CODE_SYSTEMS = ['rxnorm', 'snomed', 'loinc'];
//# sourceMappingURL=config.js.map