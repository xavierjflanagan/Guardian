/**
 * Pass 1.5 Medical Code Embedding - Main Module
 *
 * Purpose: Vector similarity search service for medical code candidate retrieval
 * Integration: Called by Pass 2 worker before AI processing
 */
import { Pass1Entity, CodeCandidatesResult, Pass15BatchResult, Pass15Error } from './types';
/**
 * Process a single entity to retrieve medical code candidates
 */
export declare function retrieveCodeCandidatesForEntity(entity: Pass1Entity, patientId: string, countryCode?: string): Promise<CodeCandidatesResult | Pass15Error>;
/**
 * Process multiple entities in batch (main entry point for Pass 2 integration)
 */
export declare function retrieveCodeCandidatesForBatch(entities: Pass1Entity[], patientId: string, countryCode?: string): Promise<Pass15BatchResult>;
/**
 * Health check for Pass 1.5 module
 */
export declare function healthCheck(): Promise<boolean>;
//# sourceMappingURL=index.d.ts.map