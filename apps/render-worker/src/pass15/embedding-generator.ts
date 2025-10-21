// @ts-nocheck
/**
 * Pass 1.5 Medical Code Embedding - Embedding Generation
 *
 * Purpose: Generate embeddings via OpenAI API with caching and error handling
 */

import OpenAI from 'openai';
import { Pass1Entity } from './types';
import { PASS15_CONFIG } from './config';
import { getEmbeddingText, validateEmbeddingText, sanitizeEmbeddingText } from './embedding-strategy';
import { logger } from '../utils/logger';
import { retryWithBackoff } from '../utils/retry';

// Lazy-initialize OpenAI client
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

/**
 * In-memory embedding cache (24-hour TTL)
 */
interface CacheEntry {
  embedding: number[];
  timestamp: number;
  ttl: number;
}

const embeddingCache = new Map<string, CacheEntry>();

/**
 * Generate cache key for embedding
 */
function getCacheKey(text: string): string {
  // Simple hash-like key generation
  return `emb_${Buffer.from(text).toString('base64').substring(0, 50)}`;
}

/**
 * Check if cache entry is still valid
 */
function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < entry.ttl;
}

/**
 * Get embedding from cache if available and valid
 */
function getFromCache(text: string): number[] | null {
  const key = getCacheKey(text);
  const entry = embeddingCache.get(key);
  
  if (entry && isCacheValid(entry)) {
    logger.debug('Embedding cache hit', { key });
    return entry.embedding;
  }
  
  // Clean up expired entry
  if (entry) {
    embeddingCache.delete(key);
  }
  
  return null;
}

/**
 * Store embedding in cache
 */
function storeInCache(text: string, embedding: number[]): void {
  const key = getCacheKey(text);
  const ttl = PASS15_CONFIG.embedding.cache_ttl_hours * 60 * 60 * 1000; // Convert to ms
  
  embeddingCache.set(key, {
    embedding,
    timestamp: Date.now(),
    ttl,
  });
  
  logger.debug('Embedding cached', { key, ttl_hours: PASS15_CONFIG.embedding.cache_ttl_hours });
}

/**
 * Generate embedding via OpenAI API with retry logic
 */
async function generateEmbeddingFromAPI(text: string): Promise<number[]> {
  const startTime = Date.now();
  
  try {
    const openaiClient = getOpenAIClient();
    const response = await retryWithBackoff(
      async () => {
        return await openaiClient.embeddings.create({
          model: PASS15_CONFIG.embedding.model,
          input: text,
          dimensions: PASS15_CONFIG.embedding.dimensions,
        });
      },
      {
        maxRetries: PASS15_CONFIG.embedding.max_retries,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffFactor: 2,
      }
    );
    
    const duration = Date.now() - startTime;
    const embedding = response.data[0].embedding;
    
    logger.debug('Generated embedding via OpenAI API', {
      text_length: text.length,
      embedding_dimensions: embedding.length,
      duration_ms: duration,
      model: PASS15_CONFIG.embedding.model,
    });
    
    return embedding;
    
  } catch (error: any) {
    logger.error('Failed to generate embedding via OpenAI API', {
      error: error.message,
      text_length: text.length,
      duration_ms: Date.now() - startTime,
    });
    throw error;
  }
}

/**
 * Generate embedding for a single entity
 */
export async function generateEmbedding(entity: Pass1Entity): Promise<number[]> {
  try {
    // Get optimal embedding text using Smart Entity-Type Strategy
    const embeddingText = getEmbeddingText(entity);
    
    // Validate and sanitize text
    if (!validateEmbeddingText(embeddingText)) {
      throw new Error(`Invalid embedding text for entity ${entity.id}: "${embeddingText}"`);
    }
    
    const sanitizedText = sanitizeEmbeddingText(embeddingText);
    
    // Check cache first
    const cachedEmbedding = getFromCache(sanitizedText);
    if (cachedEmbedding) {
      return cachedEmbedding;
    }
    
    // Generate via API
    const embedding = await generateEmbeddingFromAPI(sanitizedText);
    
    // Store in cache
    storeInCache(sanitizedText, embedding);
    
    return embedding;
    
  } catch (error: any) {
    logger.error('Failed to generate embedding for entity', {
      entity_id: entity.id,
      entity_subtype: entity.entity_subtype,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Generate embeddings for multiple entities in batch
 */
export async function generateEmbeddingsBatch(entities: Pass1Entity[]): Promise<Map<string, number[]>> {
  const results = new Map<string, number[]>();
  const errors: string[] = [];
  
  logger.info('Starting batch embedding generation', { 
    entity_count: entities.length 
  });
  
  // Process entities concurrently with reasonable limit
  const CONCURRENT_LIMIT = 5;
  const chunks = [];
  
  for (let i = 0; i < entities.length; i += CONCURRENT_LIMIT) {
    chunks.push(entities.slice(i, i + CONCURRENT_LIMIT));
  }
  
  for (const chunk of chunks) {
    const promises = chunk.map(async (entity) => {
      try {
        const embedding = await generateEmbedding(entity);
        results.set(entity.id, embedding);
        return { success: true, entity_id: entity.id };
      } catch (error: any) {
        errors.push(`Entity ${entity.id}: ${error.message}`);
        return { success: false, entity_id: entity.id, error: error.message };
      }
    });
    
    await Promise.all(promises);
  }
  
  logger.info('Completed batch embedding generation', {
    total_entities: entities.length,
    successful: results.size,
    failed: errors.length,
    cache_size: embeddingCache.size,
  });
  
  if (errors.length > 0) {
    logger.warn('Some embeddings failed to generate', { errors });
  }
  
  return results;
}

/**
 * Clear embedding cache (for testing or memory management)
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
  logger.info('Embedding cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: embeddingCache.size,
    entries: Array.from(embeddingCache.entries()).map(([key, entry]) => ({
      key,
      age_ms: Date.now() - entry.timestamp,
      ttl_remaining_ms: entry.ttl - (Date.now() - entry.timestamp),
      valid: isCacheValid(entry),
    })),
  };
}