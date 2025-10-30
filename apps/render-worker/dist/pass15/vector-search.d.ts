/**
 * Pass 1.5 Medical Code Embedding - Vector Similarity Search
 *
 * Purpose: Search medical code databases using pgvector similarity
 */
import { CodeCandidate } from './types';
/**
 * Search universal medical codes (RxNorm, SNOMED, LOINC)
 */
export declare function searchUniversalCodes(embedding: number[], entityType?: string, limit?: number): Promise<CodeCandidate[]>;
/**
 * Search regional medical codes (PBS, MBS, etc.)
 *
 * TODO (Migration 31): Implement dual-model routing:
 * - PBS codes (active_embedding_model = 'sapbert'): Search using sapbert_embedding
 * - MBS codes (active_embedding_model = 'openai'): Search using normalized_embedding
 * - Current: Uses normalized_embedding for all codes (OpenAI)
 */
export declare function searchRegionalCodes(embedding: number[], countryCode?: string, entityType?: string, limit?: number): Promise<CodeCandidate[]>;
/**
 * Search both universal and regional codes concurrently
 */
export declare function searchMedicalCodeCandidates(embedding: number[], entityType?: string, countryCode?: string): Promise<{
    universal: CodeCandidate[];
    regional: CodeCandidate[];
}>;
/**
 * Test vector search functionality with a known code
 */
export declare function testVectorSearch(): Promise<boolean>;
//# sourceMappingURL=vector-search.d.ts.map