"use strict";
/**
 * Pass 1.5 Medical Code Normalization
 *
 * Purpose: Normalize medication text for embedding generation
 *
 * Extracts ONLY essential clinical information:
 * - Generic drug name (lowercase, no salts)
 * - Brand name if present (from search_text)
 * - Dosage with standardized units (g→mg, mcg→mg)
 * - Drug form (tablet, capsule, injection, etc.)
 * - Release type if important (extended, modified)
 *
 * EXCLUDES:
 * - Salt forms (hydrochloride, arginine, erbumine, etc.)
 * - Verbose phrases ("containing", "as")
 * - PBS/MBS codes
 * - Billing/restriction codes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeMedicationText = normalizeMedicationText;
exports.normalizeProcedureText = normalizeProcedureText;
exports.normalizeText = normalizeText;
/**
 * Normalize medication text for embedding generation
 *
 * This is the SINGLE SOURCE OF TRUTH for normalization logic.
 * Used by:
 * 1. Database population scripts (Pass A)
 * 2. Live Pass 1.5 queries (runtime normalization)
 */
function normalizeMedicationText(displayName, searchText) {
    // Start with display_name as it's cleaner than search_text
    let normalized = displayName.toLowerCase().trim();
    // Remove salt forms (common patterns)
    const saltPatterns = [
        /\(as [^)]+\)/gi, // (as hydrochloride), (as calcium), etc.
        /\(containing [^)]+\)/gi, // (containing enteric coated pellets)
        /\bhydrochloride\b/gi,
        /\barginine\b/gi,
        /\berbumine\b/gi,
        /\btosylate\b/gi,
        /\bsuccinate\b/gi,
        /\bmaleate\b/gi,
        /\bfumarate\b/gi,
        /\btartrate\b/gi,
        /\bphosphate\b/gi,
        /\bsulfate\b/gi,
        /\bsulphate\b/gi,
        /\bacetate\b/gi,
        /\bcitrate\b/gi,
        /\blactate\b/gi,
        /\boxalate\b/gi,
        /\bbenzoate\b/gi,
        /\btrihydrate\b/gi,
        /\bdihydrate\b/gi,
        /\bmonohydrate\b/gi,
        /\banhydrous\b/gi,
    ];
    for (const pattern of saltPatterns) {
        normalized = normalized.replace(pattern, '');
    }
    // Remove verbose phrases
    normalized = normalized.replace(/\bcontaining\b/gi, '');
    // Simplify release type notation
    normalized = normalized.replace(/tablet \(extended release\)/gi, 'tablet extended release');
    normalized = normalized.replace(/tablet \(modified release\)/gi, 'tablet modified release');
    normalized = normalized.replace(/tablet \(enteric coated\)/gi, 'tablet enteric coated');
    normalized = normalized.replace(/capsule \(extended release\)/gi, 'capsule extended release');
    normalized = normalized.replace(/capsule \(modified release\)/gi, 'capsule modified release');
    // Convert strength units: g → mg, mcg → mg
    // Match patterns like "1 g" and convert to "1000 mg"
    normalized = normalized.replace(/(\d+\.?\d*)\s*g\b/gi, (_match, num) => {
        const mg = parseFloat(num) * 1000;
        return `${mg} mg`;
    });
    // Convert mcg → mg (1000 mcg = 1 mg)
    normalized = normalized.replace(/(\d+\.?\d*)\s*mcg\b/gi, (_match, num) => {
        const mg = parseFloat(num) / 1000;
        return `${mg} mg`;
    });
    // Extract brand name from search_text if available
    // Brand names are typically appended after the display_name
    // Use safer approach: check if searchText is longer and extract suffix
    const displayLower = displayName.toLowerCase().trim();
    const searchLower = searchText.toLowerCase().trim();
    if (searchLower.startsWith(displayLower) && searchLower.length > displayLower.length) {
        // Extract the extra text after display_name
        const suffix = searchLower.substring(displayLower.length).trim();
        // Only add if it's reasonable length (likely a brand, not regulatory text)
        // and not already in normalized text
        if (suffix.length > 0 && suffix.length < 50 && !normalized.includes(suffix)) {
            normalized = `${normalized} ${suffix}`;
        }
    }
    // Clean up whitespace and multiple spaces
    normalized = normalized.replace(/\s+/g, ' ').trim();
    return normalized;
}
/**
 * Normalize procedure text for embedding generation
 *
 * For MBS procedures:
 * - Extract procedure name and anatomical site
 * - Exclude MBS codes, billing units, regulatory prose
 */
function normalizeProcedureText(displayName, _searchText) {
    let normalized = displayName.toLowerCase().trim();
    // Remove MBS code patterns
    normalized = normalized.replace(/\bmbs\s+\d+\b/gi, '');
    normalized = normalized.replace(/\bt\d+\b/gi, ''); // T10, T8, etc.
    // Remove billing/regulatory prose patterns
    normalized = normalized.replace(/initiation of management of/gi, '');
    normalized = normalized.replace(/including but not limited to/gi, '');
    // Clean up whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();
    return normalized;
}
/**
 * Main normalization function - dispatches to entity-specific normalizers
 */
function normalizeText(displayName, searchText, entityType) {
    switch (entityType) {
        case 'medication':
            return normalizeMedicationText(displayName, searchText);
        case 'procedure':
            return normalizeProcedureText(displayName, searchText);
        default:
            // For other entity types, use basic normalization for now
            return displayName.toLowerCase().trim();
    }
}
//# sourceMappingURL=normalization.js.map