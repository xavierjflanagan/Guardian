/**
 * Pass 1.5 Medical Code Embedding - Type Definitions
 * 
 * Purpose: Vector similarity search for medical code candidate retrieval
 */

export interface Pass1Entity {
  id: string;
  entity_subtype: string;
  original_text: string;
  ai_visual_interpretation?: string;
  visual_formatting_context?: string;
  location_on_page?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence_score?: number;
}

export interface CodeCandidate {
  id: string;
  code_system: string;
  code_value: string;
  display_name: string;
  similarity_score: number;
  entity_type: string;
  country_code?: string;
  grouping_code?: string;
  clinical_specificity?: string;
  typical_setting?: string;
}

export interface CodeCandidatesResult {
  entity_id: string;
  embedding_text: string;
  universal_candidates: CodeCandidate[];
  regional_candidates: CodeCandidate[];
  total_candidates_found: number;
  search_duration_ms: number;
}

export interface CandidateSelectionConfig {
  MIN_CANDIDATES: number;
  MAX_CANDIDATES: number;
  AUTO_INCLUDE_THRESHOLD: number;
  MIN_SIMILARITY: number;
  TARGET_CANDIDATES: number;
}

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  max_retries: number;
  cache_ttl_hours: number;
}

export interface SearchConfig {
  max_universal_candidates: number;
  max_regional_candidates: number;
  similarity_threshold: number;
  timeout_ms: number;
}

export interface Pass15Config {
  embedding: EmbeddingConfig;
  search: SearchConfig;
  candidate_selection: CandidateSelectionConfig;
}

export interface Pass15Error {
  entity_id: string;
  error_type: 'embedding_failure' | 'search_failure' | 'database_error' | 'timeout';
  error_message: string;
  fallback_used: boolean;
}

export interface Pass15BatchResult {
  successful_entities: Map<string, CodeCandidatesResult>;
  failed_entities: Pass15Error[];
  batch_summary: {
    total_entities: number;
    successful_count: number;
    failed_count: number;
    total_duration_ms: number;
    average_candidates_per_entity: number;
  };
}