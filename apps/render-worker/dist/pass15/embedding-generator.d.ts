/**
 * Pass 1.5 Medical Code Embedding - Embedding Generation
 *
 * Purpose: Generate embeddings via OpenAI API with caching and error handling
 */
import { Pass1Entity } from './types';
/**
 * Generate embedding for a single entity
 */
export declare function generateEmbedding(entity: Pass1Entity): Promise<number[]>;
/**
 * Generate embeddings for multiple entities in batch
 */
export declare function generateEmbeddingsBatch(entities: Pass1Entity[]): Promise<Map<string, number[]>>;
/**
 * Clear embedding cache (for testing or memory management)
 */
export declare function clearEmbeddingCache(): void;
/**
 * Get cache statistics
 */
export declare function getCacheStats(): {
    size: number;
    entries: {
        key: string;
        age_ms: number;
        ttl_remaining_ms: number;
        valid: boolean;
    }[];
};
//# sourceMappingURL=embedding-generator.d.ts.map