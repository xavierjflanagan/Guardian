// @ts-nocheck
/**
 * Pass 1.5 Medical Code Embedding - Main Module
 *
 * Purpose: Vector similarity search service for medical code candidate retrieval
 * Integration: Called by Pass 2 worker before AI processing
 */

import { createClient } from '@supabase/supabase-js';
import { Pass1Entity, CodeCandidatesResult, Pass15BatchResult, Pass15Error } from './types';
import { generateEmbedding } from './embedding-generator';
import { searchMedicalCodeCandidates } from './vector-search';
import { processCodeCandidates } from './candidate-selection';
import { getEmbeddingText } from './embedding-strategy';
import { logger } from '../utils/logger';

// Lazy-initialize Supabase client for audit logging
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
 * Store Pass 1.5 results in audit table for healthcare compliance
 */
async function storePass15Results(
  entityId: string,
  patientId: string,
  result: CodeCandidatesResult
): Promise<void> {
  try {
    const supabaseClient = getSupabaseClient();
    const { error } = await supabaseClient
      .from('pass15_code_candidates')
      .insert({
        entity_id: entityId,
        patient_id: patientId,
        embedding_text: result.embedding_text,
        universal_candidates: result.universal_candidates,
        regional_candidates: result.regional_candidates,
        total_candidates_found: result.total_candidates_found,
        search_duration_ms: result.search_duration_ms,
      });

    if (error) {
      logger.error('Failed to store Pass 1.5 audit record', {
        entity_id: entityId,
        error: error.message,
      });
    } else {
      logger.debug('Pass 1.5 audit record stored', { entity_id: entityId });
    }
  } catch (error: any) {
    logger.error('Failed to store Pass 1.5 audit record', {
      entity_id: entityId,
      error: error.message,
    });
  }
}

/**
 * Process a single entity to retrieve medical code candidates
 */
export async function retrieveCodeCandidatesForEntity(
  entity: Pass1Entity,
  patientId: string,
  countryCode: string = 'AUS'
): Promise<CodeCandidatesResult | Pass15Error> {
  const startTime = Date.now();
  
  try {
    logger.debug('Starting Pass 1.5 processing for entity', {
      entity_id: entity.id,
      entity_subtype: entity.entity_subtype,
      country_code: countryCode,
    });

    // Step 1: Generate embedding using Smart Entity-Type Strategy
    const embeddingText = getEmbeddingText(entity);
    const embedding = await generateEmbedding(entity);

    // Step 2: Search medical code databases
    const searchResults = await searchMedicalCodeCandidates(
      embedding,
      entity.entity_subtype,
      countryCode
    );

    // Step 3: Process and rank candidates
    const finalCandidates = processCodeCandidates(
      searchResults.universal,
      searchResults.regional,
      entity.entity_subtype
    );

    const duration = Date.now() - startTime;

    const result: CodeCandidatesResult = {
      entity_id: entity.id,
      embedding_text: embeddingText,
      universal_candidates: searchResults.universal,
      regional_candidates: searchResults.regional,
      total_candidates_found: finalCandidates.length,
      search_duration_ms: duration,
    };

    // Store audit record (non-blocking)
    storePass15Results(entity.id, patientId, result).catch(() => {
      // Silent failure for audit logging - don't block processing
    });

    logger.info('Pass 1.5 processing completed successfully', {
      entity_id: entity.id,
      entity_subtype: entity.entity_subtype,
      candidates_found: finalCandidates.length,
      duration_ms: duration,
    });

    return result;

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logger.error('Pass 1.5 processing failed for entity', {
      entity_id: entity.id,
      entity_subtype: entity.entity_subtype,
      error: error.message,
      duration_ms: duration,
    });

    return {
      entity_id: entity.id,
      error_type: 'embedding_failure',
      error_message: error.message,
      fallback_used: false,
    };
  }
}

/**
 * Process multiple entities in batch (main entry point for Pass 2 integration)
 */
export async function retrieveCodeCandidatesForBatch(
  entities: Pass1Entity[],
  patientId: string,
  countryCode: string = 'AUS'
): Promise<Pass15BatchResult> {
  const startTime = Date.now();
  
  logger.info('Starting Pass 1.5 batch processing', {
    entity_count: entities.length,
    patient_id: patientId,
    country_code: countryCode,
  });

  const successfulEntities = new Map<string, CodeCandidatesResult>();
  const failedEntities: Pass15Error[] = [];

  // Process entities with concurrency control
  const CONCURRENT_LIMIT = 3; // Conservative limit to avoid API rate limits
  const chunks = [];
  
  for (let i = 0; i < entities.length; i += CONCURRENT_LIMIT) {
    chunks.push(entities.slice(i, i + CONCURRENT_LIMIT));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(entity => 
      retrieveCodeCandidatesForEntity(entity, patientId, countryCode)
    );

    const results = await Promise.all(promises);

    for (const result of results) {
      if ('error_type' in result) {
        failedEntities.push(result as Pass15Error);
      } else {
        successfulEntities.set(result.entity_id, result as CodeCandidatesResult);
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  const totalCandidates = Array.from(successfulEntities.values())
    .reduce((sum, result) => sum + result.total_candidates_found, 0);

  const batchResult: Pass15BatchResult = {
    successful_entities: successfulEntities,
    failed_entities: failedEntities,
    batch_summary: {
      total_entities: entities.length,
      successful_count: successfulEntities.size,
      failed_count: failedEntities.length,
      total_duration_ms: totalDuration,
      average_candidates_per_entity: successfulEntities.size > 0 
        ? Math.round(totalCandidates / successfulEntities.size) 
        : 0,
    },
  };

  logger.info('Pass 1.5 batch processing completed', {
    total_entities: entities.length,
    successful: successfulEntities.size,
    failed: failedEntities.length,
    total_duration_ms: totalDuration,
    average_candidates: batchResult.batch_summary.average_candidates_per_entity,
  });

  return batchResult;
}

/**
 * Health check for Pass 1.5 module
 */
export async function healthCheck(): Promise<boolean> {
  try {
    logger.info('Running Pass 1.5 health check');

    // Test database connectivity
    const supabaseClient = getSupabaseClient();
    const { data, error } = await supabaseClient
      .from('regional_medical_codes')
      .select('count')
      .limit(1);

    if (error) {
      logger.error('Pass 1.5 health check failed - database error', { error: error.message });
      return false;
    }

    // Test OpenAI API (simple embedding)
    // This will be tested when generateEmbedding is called

    logger.info('Pass 1.5 health check passed');
    return true;

  } catch (error: any) {
    logger.error('Pass 1.5 health check failed', { error: error.message });
    return false;
  }
}

// Main functions already exported above