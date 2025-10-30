"use strict";
/**
 * Pass 1.5 Medical Code Embedding - Smart Entity-Type Strategy
 *
 * Purpose: Optimize embedding text based on entity type for better code matching
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmbeddingText = getEmbeddingText;
exports.validateEmbeddingText = validateEmbeddingText;
exports.sanitizeEmbeddingText = sanitizeEmbeddingText;
const config_1 = require("./config");
/**
 * Smart Entity-Type Strategy: Different entity types need different text for optimal embedding matching
 *
 * Key Insights:
 * - Medications: AI-cleaned standardized format works best
 * - Diagnoses: Expanded clinical context improves matching
 * - Vital Signs: Need measurement type context
 * - Procedures: Use expanded descriptions when available
 * - Identifiers: Exact text only
 */
function getEmbeddingText(entity) {
    const subtype = entity.entity_subtype;
    // Medications/Immunizations: AI-cleaned standardized format
    if (config_1.ENTITY_TYPE_STRATEGIES.MEDICATION_TYPES.includes(subtype)) {
        return entity.original_text; // "Lisinopril 10mg"
    }
    // Diagnoses/Conditions/Allergies: Expanded clinical context
    if (config_1.ENTITY_TYPE_STRATEGIES.DIAGNOSIS_TYPES.includes(subtype)) {
        // AI often expands abbreviations: "T2DM" → "Type 2 Diabetes Mellitus"
        if (entity.ai_visual_interpretation &&
            entity.ai_visual_interpretation !== entity.original_text &&
            entity.ai_visual_interpretation.length > entity.original_text.length) {
            return entity.ai_visual_interpretation;
        }
        return entity.original_text;
    }
    // Vital Signs/Labs: Need measurement type context
    if (config_1.ENTITY_TYPE_STRATEGIES.VITAL_TYPES.includes(subtype)) {
        // Combine "128/82" + "Blood pressure reading" = better match
        const parts = [entity.original_text];
        if (entity.visual_formatting_context) {
            parts.push(entity.visual_formatting_context);
        }
        return parts.join(' ').trim();
    }
    // Procedures: Use expanded descriptions when available
    if (config_1.ENTITY_TYPE_STRATEGIES.PROCEDURE_TYPES.includes(subtype)) {
        if (entity.ai_visual_interpretation &&
            entity.ai_visual_interpretation.length > entity.original_text.length) {
            return entity.ai_visual_interpretation;
        }
        return entity.original_text;
    }
    // Healthcare Identifiers: Exact text only
    if (config_1.ENTITY_TYPE_STRATEGIES.IDENTIFIER_TYPES.includes(subtype)) {
        return entity.original_text;
    }
    // Safe default
    return entity.original_text;
}
/**
 * Validate embedding text quality
 */
function validateEmbeddingText(text) {
    // Must have meaningful content
    if (!text || text.trim().length < 2) {
        return false;
    }
    // Must not be too long (OpenAI token limit)
    if (text.length > 8000) { // Conservative limit
        return false;
    }
    // Must not be just whitespace or numbers
    const meaningfulChars = text.replace(/[\s\d\-\.\/]/g, '').length;
    if (meaningfulChars < 2) {
        return false;
    }
    return true;
}
/**
 * Sanitize embedding text for optimal results
 */
function sanitizeEmbeddingText(text) {
    return text
        .trim()
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/\n/g, ' ') // Remove line breaks
        .substring(0, 500); // Reasonable length limit
}
//# sourceMappingURL=embedding-strategy.js.map