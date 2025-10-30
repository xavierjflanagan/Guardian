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
/**
 * Normalize medication text for embedding generation
 *
 * This is the SINGLE SOURCE OF TRUTH for normalization logic.
 * Used by:
 * 1. Database population scripts (Pass A)
 * 2. Live Pass 1.5 queries (runtime normalization)
 */
export declare function normalizeMedicationText(displayName: string, searchText: string): string;
/**
 * Normalize procedure text for embedding generation
 *
 * For MBS procedures:
 * - Extract procedure name and anatomical site
 * - Exclude MBS codes, billing units, regulatory prose
 */
export declare function normalizeProcedureText(displayName: string, _searchText: string): string;
/**
 * Main normalization function - dispatches to entity-specific normalizers
 */
export declare function normalizeText(displayName: string, searchText: string, entityType: 'medication' | 'procedure' | 'condition' | 'observation' | 'allergy'): string;
//# sourceMappingURL=normalization.d.ts.map