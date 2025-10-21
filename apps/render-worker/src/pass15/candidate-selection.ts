/**
 * Pass 1.5 Medical Code Embedding - Candidate Selection and Ranking
 * 
 * Purpose: Filter and rank medical code candidates for optimal AI selection
 */

import { CodeCandidate, CandidateSelectionConfig } from './types';
import { PASS15_CONFIG } from './config';
import { logger } from '../utils/logger';

/**
 * Select optimal code candidates using hybrid confidence-based approach
 */
export function selectCodeCandidates(
  rawCandidates: CodeCandidate[],
  config: CandidateSelectionConfig = PASS15_CONFIG.candidate_selection
): CodeCandidate[] {
  
  if (rawCandidates.length === 0) {
    logger.debug('No candidates to select from');
    return [];
  }
  
  // Step 1: Filter out low similarity candidates
  const filtered = rawCandidates.filter(
    candidate => candidate.similarity_score >= config.MIN_SIMILARITY
  );
  
  if (filtered.length === 0) {
    logger.debug('All candidates below minimum similarity threshold', {
      min_similarity: config.MIN_SIMILARITY,
      raw_count: rawCandidates.length,
    });
    return [];
  }
  
  // Step 2: Auto-include high confidence candidates
  const highConfidence = filtered.filter(
    candidate => candidate.similarity_score >= config.AUTO_INCLUDE_THRESHOLD
  );
  
  // Step 3: Fill to target of 10 candidates
  const remaining = filtered.filter(
    candidate => candidate.similarity_score < config.AUTO_INCLUDE_THRESHOLD
  );
  
  const toInclude = Math.max(config.TARGET_CANDIDATES - highConfidence.length, 0);
  const additional = remaining.slice(0, toInclude);
  
  // Step 4: If many good matches (>= 0.75), include up to 20 total
  const goodMatches = filtered.filter(candidate => candidate.similarity_score >= 0.75);
  
  let finalList: CodeCandidate[];
  
  if (goodMatches.length > config.TARGET_CANDIDATES) {
    finalList = goodMatches.slice(0, config.MAX_CANDIDATES);
  } else {
    finalList = [...highConfidence, ...additional];
  }
  
  // Step 5: Ensure minimum of 5 candidates (if available)
  if (finalList.length < config.MIN_CANDIDATES && filtered.length >= config.MIN_CANDIDATES) {
    finalList = filtered.slice(0, config.MIN_CANDIDATES);
  }
  
  // Sort by similarity score (highest first)
  finalList.sort((a, b) => b.similarity_score - a.similarity_score);
  
  logger.debug('Candidate selection completed', {
    raw_candidates: rawCandidates.length,
    filtered_candidates: filtered.length,
    high_confidence: highConfidence.length,
    final_selection: finalList.length,
    top_similarity: finalList[0]?.similarity_score,
    min_similarity: finalList[finalList.length - 1]?.similarity_score,
  });
  
  return finalList;
}

/**
 * Combine and deduplicate universal and regional candidates
 */
export function combineAndRankCandidates(
  universalCandidates: CodeCandidate[],
  regionalCandidates: CodeCandidate[]
): CodeCandidate[] {
  
  // Combine all candidates
  const allCandidates = [...universalCandidates, ...regionalCandidates];
  
  if (allCandidates.length === 0) {
    return [];
  }
  
  // Deduplicate by code_system + code_value combination
  const seen = new Set<string>();
  const deduped = allCandidates.filter(candidate => {
    const key = `${candidate.code_system}:${candidate.code_value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  
  // Sort by similarity score (highest first)
  deduped.sort((a, b) => b.similarity_score - a.similarity_score);
  
  logger.debug('Candidate combination completed', {
    universal_count: universalCandidates.length,
    regional_count: regionalCandidates.length,
    combined_count: allCandidates.length,
    deduped_count: deduped.length,
    duplicates_removed: allCandidates.length - deduped.length,
  });
  
  return deduped;
}

/**
 * Apply entity-type specific filtering and preferences
 */
export function applyEntityTypeFiltering(
  candidates: CodeCandidate[],
  entitySubtype: string
): CodeCandidate[] {
  
  if (candidates.length === 0) {
    return candidates;
  }
  
  // Medication entities: Prefer regional codes (PBS) over universal (RxNorm)
  if (['medication', 'immunization'].includes(entitySubtype)) {
    const regional = candidates.filter(c => ['pbs', 'ndc'].includes(c.code_system));
    const universal = candidates.filter(c => ['rxnorm'].includes(c.code_system));
    
    // Prefer regional codes but include universal as backup
    if (regional.length > 0) {
      return [...regional, ...universal.slice(0, 5)]; // Top 5 universal as backup
    }
    return universal;
  }
  
  // Procedure entities: Prefer regional codes (MBS) over universal (SNOMED)
  if (entitySubtype === 'procedure') {
    const regional = candidates.filter(c => ['mbs', 'cpt'].includes(c.code_system));
    const universal = candidates.filter(c => ['snomed'].includes(c.code_system));
    
    if (regional.length > 0) {
      return [...regional, ...universal.slice(0, 5)];
    }
    return universal;
  }
  
  // Lab/Vital entities: Prefer LOINC codes
  if (['vital_sign', 'lab_result', 'physical_finding'].includes(entitySubtype)) {
    const loinc = candidates.filter(c => c.code_system === 'loinc');
    const others = candidates.filter(c => c.code_system !== 'loinc');
    
    if (loinc.length > 0) {
      return [...loinc, ...others.slice(0, 5)];
    }
    return others;
  }
  
  // Diagnosis entities: Prefer SNOMED over ICD
  if (['diagnosis', 'allergy', 'symptom'].includes(entitySubtype)) {
    const snomed = candidates.filter(c => c.code_system === 'snomed');
    const icd = candidates.filter(c => c.code_system.startsWith('icd'));
    const others = candidates.filter(c => !['snomed'].includes(c.code_system) && !c.code_system.startsWith('icd'));
    
    return [...snomed, ...icd, ...others];
  }
  
  // Default: return as-is
  return candidates;
}

/**
 * Complete candidate processing pipeline
 */
export function processCodeCandidates(
  universalCandidates: CodeCandidate[],
  regionalCandidates: CodeCandidate[],
  entitySubtype: string
): CodeCandidate[] {
  
  // Combine and deduplicate
  const combined = combineAndRankCandidates(universalCandidates, regionalCandidates);
  
  // Apply entity-type specific filtering
  const filtered = applyEntityTypeFiltering(combined, entitySubtype);
  
  // Select optimal candidates
  const selected = selectCodeCandidates(filtered);
  
  logger.debug('Candidate processing pipeline completed', {
    entity_subtype: entitySubtype,
    universal_input: universalCandidates.length,
    regional_input: regionalCandidates.length,
    combined_count: combined.length,
    filtered_count: filtered.length,
    final_selection: selected.length,
  });
  
  return selected;
}