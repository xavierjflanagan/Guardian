"use strict";
// @ts-nocheck
/**
 * Pass 1.5 Medical Code Embedding - Embedding Generation
 *
 * Purpose: Generate embeddings via OpenAI API with caching and error handling
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEmbedding = generateEmbedding;
exports.generateEmbeddingsBatch = generateEmbeddingsBatch;
exports.clearEmbeddingCache = clearEmbeddingCache;
exports.getCacheStats = getCacheStats;
const openai_1 = __importDefault(require("openai"));
const config_1 = require("./config");
const embedding_strategy_1 = require("./embedding-strategy");
const logger_1 = require("../utils/logger");
const retry_1 = require("../utils/retry");
// Lazy-initialize OpenAI client
let openai = null;
function getOpenAIClient() {
    if (!openai) {
        openai = new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return openai;
}
const embeddingCache = new Map();
/**
 * Generate cache key for embedding
 */
function getCacheKey(text) {
    // Simple hash-like key generation
    return `emb_${Buffer.from(text).toString('base64').substring(0, 50)}`;
}
/**
 * Check if cache entry is still valid
 */
function isCacheValid(entry) {
    return Date.now() - entry.timestamp < entry.ttl;
}
/**
 * Get embedding from cache if available and valid
 */
function getFromCache(text) {
    const key = getCacheKey(text);
    const entry = embeddingCache.get(key);
    if (entry && isCacheValid(entry)) {
        logger_1.logger.debug('Embedding cache hit', { key });
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
function storeInCache(text, embedding) {
    const key = getCacheKey(text);
    const ttl = config_1.PASS15_CONFIG.embedding.cache_ttl_hours * 60 * 60 * 1000; // Convert to ms
    embeddingCache.set(key, {
        embedding,
        timestamp: Date.now(),
        ttl,
    });
    logger_1.logger.debug('Embedding cached', { key, ttl_hours: config_1.PASS15_CONFIG.embedding.cache_ttl_hours });
}
/**
 * Generate embedding via OpenAI API with retry logic
 */
async function generateEmbeddingFromAPI(text) {
    const startTime = Date.now();
    try {
        const openaiClient = getOpenAIClient();
        const response = await (0, retry_1.retryWithBackoff)(async () => {
            return await openaiClient.embeddings.create({
                model: config_1.PASS15_CONFIG.embedding.model,
                input: text,
                dimensions: config_1.PASS15_CONFIG.embedding.dimensions,
            });
        }, {
            maxRetries: config_1.PASS15_CONFIG.embedding.max_retries,
            baseDelay: 1000,
            maxDelay: 10000,
            backoffFactor: 2,
        });
        const duration = Date.now() - startTime;
        const embedding = response.data[0].embedding;
        logger_1.logger.debug('Generated embedding via OpenAI API', {
            text_length: text.length,
            embedding_dimensions: embedding.length,
            duration_ms: duration,
            model: config_1.PASS15_CONFIG.embedding.model,
        });
        return embedding;
    }
    catch (error) {
        logger_1.logger.error('Failed to generate embedding via OpenAI API', {
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
async function generateEmbedding(entity) {
    try {
        // Get optimal embedding text using Smart Entity-Type Strategy
        const embeddingText = (0, embedding_strategy_1.getEmbeddingText)(entity);
        // Validate and sanitize text
        if (!(0, embedding_strategy_1.validateEmbeddingText)(embeddingText)) {
            throw new Error(`Invalid embedding text for entity ${entity.id}: "${embeddingText}"`);
        }
        const sanitizedText = (0, embedding_strategy_1.sanitizeEmbeddingText)(embeddingText);
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
    }
    catch (error) {
        logger_1.logger.error('Failed to generate embedding for entity', {
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
async function generateEmbeddingsBatch(entities) {
    const results = new Map();
    const errors = [];
    logger_1.logger.info('Starting batch embedding generation', {
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
            }
            catch (error) {
                errors.push(`Entity ${entity.id}: ${error.message}`);
                return { success: false, entity_id: entity.id, error: error.message };
            }
        });
        await Promise.all(promises);
    }
    logger_1.logger.info('Completed batch embedding generation', {
        total_entities: entities.length,
        successful: results.size,
        failed: errors.length,
        cache_size: embeddingCache.size,
    });
    if (errors.length > 0) {
        logger_1.logger.warn('Some embeddings failed to generate', { errors });
    }
    return results;
}
/**
 * Clear embedding cache (for testing or memory management)
 */
function clearEmbeddingCache() {
    embeddingCache.clear();
    logger_1.logger.info('Embedding cache cleared');
}
/**
 * Get cache statistics
 */
function getCacheStats() {
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
//# sourceMappingURL=embedding-generator.js.map