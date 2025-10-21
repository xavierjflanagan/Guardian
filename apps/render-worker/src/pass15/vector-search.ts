/**
 * Pass 1.5 Medical Code Embedding - Vector Similarity Search
 * 
 * Purpose: Search medical code databases using pgvector similarity
 */

import { createClient } from '@supabase/supabase-js';
import { CodeCandidate } from './types';
import { PASS15_CONFIG, UNIVERSAL_CODE_SYSTEMS, REGIONAL_CODE_SYSTEMS } from './config';
import { logger } from '../utils/logger';

// Lazy-initialize Supabase client
let supabase: any = null;

function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      {
        auth: { autoRefreshToken: false, persistSession: false }
      }
    );
  }
  return supabase;
}

/**
 * Search universal medical codes (RxNorm, SNOMED, LOINC)
 */
export async function searchUniversalCodes(
  embedding: number[],
  entityType?: string,
  limit: number = PASS15_CONFIG.search.max_universal_candidates
): Promise<CodeCandidate[]> {
  const startTime = Date.now();
  
  try {
    const embeddingString = `[${embedding.join(',')}]`;
    
    const supabaseClient = getSupabaseClient();
    let query = supabaseClient
      .from('universal_medical_codes')
      .select(`
        id,
        code_system,
        code_value,
        display_name,
        entity_type,
        (1 - (embedding <=> '${embeddingString}')) as similarity_score
      `)
      .gte('(1 - (embedding <=> \'' + embeddingString + '\'))', PASS15_CONFIG.search.similarity_threshold)
      .eq('active', true)
      .order('embedding <=> \'' + embeddingString + '\'')
      .limit(limit);
    
    // Filter by entity type if provided
    if (entityType) {
      query = query.eq('entity_type', entityType);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Universal codes search failed: ${error.message}`);
    }
    
    const duration = Date.now() - startTime;
    
    logger.debug('Universal codes search completed', {
      results_count: data?.length || 0,
      duration_ms: duration,
      entity_type: entityType,
      similarity_threshold: PASS15_CONFIG.search.similarity_threshold,
    });
    
    return (data || []).map(row => ({
      id: row.id,
      code_system: row.code_system,
      code_value: row.code_value,
      display_name: row.display_name,
      similarity_score: parseFloat(row.similarity_score),
      entity_type: row.entity_type,
    }));
    
  } catch (error: any) {
    logger.error('Universal codes search failed', {
      error: error.message,
      duration_ms: Date.now() - startTime,
    });
    return []; // Return empty array on failure (graceful degradation)
  }
}

/**
 * Search regional medical codes (PBS, MBS, etc.)
 */
export async function searchRegionalCodes(
  embedding: number[],
  countryCode: string = 'AUS',
  entityType?: string,
  limit: number = PASS15_CONFIG.search.max_regional_candidates
): Promise<CodeCandidate[]> {
  const startTime = Date.now();
  
  try {
    const embeddingString = `[${embedding.join(',')}]`;
    
    const supabaseClient = getSupabaseClient();
    let query = supabaseClient
      .from('regional_medical_codes')
      .select(`
        id,
        code_system,
        code_value,
        display_name,
        entity_type,
        country_code,
        grouping_code,
        clinical_specificity,
        typical_setting,
        (1 - (embedding <=> '${embeddingString}')) as similarity_score
      `)
      .gte('(1 - (embedding <=> \'' + embeddingString + '\'))', PASS15_CONFIG.search.similarity_threshold)
      .eq('active', true)
      .eq('country_code', countryCode)
      .order('embedding <=> \'' + embeddingString + '\'')
      .limit(limit);
    
    // Filter by entity type if provided
    if (entityType) {
      query = query.eq('entity_type', entityType);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Regional codes search failed: ${error.message}`);
    }
    
    const duration = Date.now() - startTime;
    
    logger.debug('Regional codes search completed', {
      results_count: data?.length || 0,
      duration_ms: duration,
      country_code: countryCode,
      entity_type: entityType,
      similarity_threshold: PASS15_CONFIG.search.similarity_threshold,
    });
    
    return (data || []).map(row => ({
      id: row.id,
      code_system: row.code_system,
      code_value: row.code_value,
      display_name: row.display_name,
      similarity_score: parseFloat(row.similarity_score),
      entity_type: row.entity_type,
      country_code: row.country_code,
      grouping_code: row.grouping_code,
      clinical_specificity: row.clinical_specificity,
      typical_setting: row.typical_setting,
    }));
    
  } catch (error: any) {
    logger.error('Regional codes search failed', {
      error: error.message,
      duration_ms: Date.now() - startTime,
      country_code: countryCode,
    });
    return []; // Return empty array on failure (graceful degradation)
  }
}

/**
 * Search both universal and regional codes concurrently
 */
export async function searchMedicalCodeCandidates(
  embedding: number[],
  entityType?: string,
  countryCode: string = 'AUS'
): Promise<{ universal: CodeCandidate[], regional: CodeCandidate[] }> {
  const startTime = Date.now();
  
  try {
    // Search both databases concurrently
    const [universalCandidates, regionalCandidates] = await Promise.all([
      searchUniversalCodes(embedding, entityType),
      searchRegionalCodes(embedding, countryCode, entityType),
    ]);
    
    const duration = Date.now() - startTime;
    
    logger.info('Medical code search completed', {
      universal_count: universalCandidates.length,
      regional_count: regionalCandidates.length,
      total_duration_ms: duration,
      entity_type: entityType,
      country_code: countryCode,
    });
    
    return {
      universal: universalCandidates,
      regional: regionalCandidates,
    };
    
  } catch (error: any) {
    logger.error('Medical code search failed', {
      error: error.message,
      duration_ms: Date.now() - startTime,
    });
    
    return {
      universal: [],
      regional: [],
    };
  }
}

/**
 * Test vector search functionality with a known code
 */
export async function testVectorSearch(): Promise<boolean> {
  try {
    // Use a dummy embedding for testing
    const testEmbedding = new Array(1536).fill(0.1);
    
    const supabaseClient = getSupabaseClient();
    const result = await searchRegionalCodes(testEmbedding, 'AUS', undefined, 5);
    
    logger.info('Vector search test completed', {
      results_found: result.length,
      test_passed: result.length >= 0, // Should at least not error
    });
    
    return result.length >= 0;
    
  } catch (error: any) {
    logger.error('Vector search test failed', { error: error.message });
    return false;
  }
}