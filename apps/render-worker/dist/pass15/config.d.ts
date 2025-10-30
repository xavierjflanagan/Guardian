/**
 * Pass 1.5 Medical Code Embedding - Configuration
 *
 * Purpose: Centralized configuration for embedding and search parameters
 */
import { Pass15Config } from './types';
export declare const PASS15_CONFIG: Pass15Config;
/**
 * Entity type mappings for Smart Entity-Type Strategy
 */
export declare const ENTITY_TYPE_STRATEGIES: {
    readonly MEDICATION_TYPES: readonly ["medication", "immunization"];
    readonly DIAGNOSIS_TYPES: readonly ["diagnosis", "allergy", "symptom"];
    readonly VITAL_TYPES: readonly ["vital_sign", "lab_result", "physical_finding"];
    readonly PROCEDURE_TYPES: readonly ["procedure"];
    readonly IDENTIFIER_TYPES: readonly ["patient_identifier", "provider_identifier"];
};
/**
 * Regional code system mappings
 */
export declare const REGIONAL_CODE_SYSTEMS: {
    readonly AUS: readonly ["pbs", "mbs", "icd10_am"];
    readonly USA: readonly ["ndc", "cpt", "icd10_cm"];
    readonly GBR: readonly ["nhs_dmd", "bnf"];
};
/**
 * Universal code system mappings
 */
export declare const UNIVERSAL_CODE_SYSTEMS: readonly ["rxnorm", "snomed", "loinc"];
//# sourceMappingURL=config.d.ts.map