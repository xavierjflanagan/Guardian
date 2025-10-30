/**
 * Pass 1.5 Medical Code Embedding - Candidate Selection and Ranking
 *
 * Purpose: Filter and rank medical code candidates for optimal AI selection
 */
import { CodeCandidate, CandidateSelectionConfig } from './types';
/**
 * Select optimal code candidates using hybrid confidence-based approach
 */
export declare function selectCodeCandidates(rawCandidates: CodeCandidate[], config?: CandidateSelectionConfig): CodeCandidate[];
/**
 * Combine and deduplicate universal and regional candidates
 */
export declare function combineAndRankCandidates(universalCandidates: CodeCandidate[], regionalCandidates: CodeCandidate[]): CodeCandidate[];
/**
 * Apply entity-type specific filtering and preferences
 */
export declare function applyEntityTypeFiltering(candidates: CodeCandidate[], entitySubtype: string): CodeCandidate[];
/**
 * Complete candidate processing pipeline
 */
export declare function processCodeCandidates(universalCandidates: CodeCandidate[], regionalCandidates: CodeCandidate[], entitySubtype: string): CodeCandidate[];
//# sourceMappingURL=candidate-selection.d.ts.map