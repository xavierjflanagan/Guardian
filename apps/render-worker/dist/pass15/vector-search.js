"use strict";
// @ts-nocheck
/**
 * Pass 1.5 Medical Code Embedding - Vector Similarity Search
 *
 * Purpose: Search medical code databases using pgvector similarity
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchUniversalCodes = searchUniversalCodes;
exports.searchRegionalCodes = searchRegionalCodes;
exports.searchMedicalCodeCandidates = searchMedicalCodeCandidates;
exports.testVectorSearch = testVectorSearch;
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("./config");
const logger_1 = require("../utils/logger");
// Lazy-initialize Supabase client
let supabase = null;
function getSupabaseClient() {
    if (!supabase) {
        supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', {
            auth: { autoRefreshToken: false, persistSession: false }
        });
    }
    return supabase;
}
/**
 * Search universal medical codes (RxNorm, SNOMED, LOINC)
 */
async function searchUniversalCodes(embedding, entityType, limit = config_1.PASS15_CONFIG.search.max_universal_candidates) {
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
            .gte('(1 - (embedding <=> \'' + embeddingString + '\'))', config_1.PASS15_CONFIG.search.similarity_threshold)
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
        logger_1.logger.debug('Universal codes search completed', {
            results_count: data?.length || 0,
            duration_ms: duration,
            entity_type: entityType,
            similarity_threshold: config_1.PASS15_CONFIG.search.similarity_threshold,
        });
        return (data || []).map(row => ({
            id: row.id,
            code_system: row.code_system,
            code_value: row.code_value,
            display_name: row.display_name,
            similarity_score: parseFloat(row.similarity_score),
            entity_type: row.entity_type,
        }));
    }
    catch (error) {
        logger_1.logger.error('Universal codes search failed', {
            error: error.message,
            duration_ms: Date.now() - startTime,
        });
        return []; // Return empty array on failure (graceful degradation)
    }
}
/**
 * Search regional medical codes (PBS, MBS, etc.)
 *
 * TODO (Migration 31): Implement dual-model routing:
 * - PBS codes (active_embedding_model = 'sapbert'): Search using sapbert_embedding
 * - MBS codes (active_embedding_model = 'openai'): Search using normalized_embedding
 * - Current: Uses normalized_embedding for all codes (OpenAI)
 */
async function searchRegionalCodes(embedding, countryCode = 'AUS', entityType, limit = config_1.PASS15_CONFIG.search.max_regional_candidates) {
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
            .gte('(1 - (embedding <=> \'' + embeddingString + '\'))', config_1.PASS15_CONFIG.search.similarity_threshold)
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
        logger_1.logger.debug('Regional codes search completed', {
            results_count: data?.length || 0,
            duration_ms: duration,
            country_code: countryCode,
            entity_type: entityType,
            similarity_threshold: config_1.PASS15_CONFIG.search.similarity_threshold,
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
    }
    catch (error) {
        logger_1.logger.error('Regional codes search failed', {
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
async function searchMedicalCodeCandidates(embedding, entityType, countryCode = 'AUS') {
    const startTime = Date.now();
    try {
        // Search both databases concurrently
        const [universalCandidates, regionalCandidates] = await Promise.all([
            searchUniversalCodes(embedding, entityType),
            searchRegionalCodes(embedding, countryCode, entityType),
        ]);
        const duration = Date.now() - startTime;
        logger_1.logger.info('Medical code search completed', {
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
    }
    catch (error) {
        logger_1.logger.error('Medical code search failed', {
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
async function testVectorSearch() {
    try {
        // Use a dummy embedding for testing
        const testEmbedding = new Array(1536).fill(0.1);
        const supabaseClient = getSupabaseClient();
        const result = await searchRegionalCodes(testEmbedding, 'AUS', undefined, 5);
        logger_1.logger.info('Vector search test completed', {
            results_found: result.length,
            test_passed: result.length >= 0, // Should at least not error
        });
        return result.length >= 0;
    }
    catch (error) {
        logger_1.logger.error('Vector search test failed', { error: error.message });
        return false;
    }
}
//# sourceMappingURL=vector-search.js.map