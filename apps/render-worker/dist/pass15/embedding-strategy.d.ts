/**
 * Pass 1.5 Medical Code Embedding - Smart Entity-Type Strategy
 *
 * Purpose: Optimize embedding text based on entity type for better code matching
 */
import { Pass1Entity } from './types';
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
export declare function getEmbeddingText(entity: Pass1Entity): string;
/**
 * Validate embedding text quality
 */
export declare function validateEmbeddingText(text: string): boolean;
/**
 * Sanitize embedding text for optimal results
 */
export declare function sanitizeEmbeddingText(text: string): string;
//# sourceMappingURL=embedding-strategy.d.ts.map