"use strict";
// @ts-nocheck
/**
 * Pass 1.5 - Pass B: Generate Normalized Embeddings
 *
 * Purpose: Generate vector embeddings from normalized_embedding_text for all regional medical codes
 *
 * Strategy: Two-phase approach
 * - Phase 1: Test run with 1,000 sample codes ($0.02)
 * - Phase 2: Full population of all codes ($0.38)
 *
 * Usage:
 *   npm run pass15:generate-embeddings -- --test     # Test with 1K sample
 *   npm run pass15:generate-embeddings                # Full population
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const openai_1 = __importDefault(require("openai"));
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// Find project root and load environment variables
function findProjectRoot() {
    let currentDir = process.cwd();
    while (currentDir !== '/') {
        if (fs.existsSync(path.join(currentDir, 'package.json'))) {
            if (fs.existsSync(path.join(currentDir, 'apps'))) {
                return currentDir;
            }
        }
        currentDir = path.dirname(currentDir);
    }
    throw new Error('Could not find project root');
}
const projectRoot = findProjectRoot();
const envPath = path.join(projectRoot, '.env.production');
dotenv.config({ path: envPath });
console.log(`Loading environment from: ${envPath}`);
// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !OPENAI_API_KEY) {
    console.error('Missing required environment variables:');
    console.error('SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
    console.error('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_KEY ? '✓' : '✗');
    console.error('OPENAI_API_KEY:', OPENAI_API_KEY ? '✓' : '✗');
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const openai = new openai_1.default({ apiKey: OPENAI_API_KEY });
// Constants
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 100; // OpenAI allows up to 2048 inputs per request, we use 100 for safety
const RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 1000;
/**
 * Create embedding batch record for audit trail (optional)
 */
async function createEmbeddingBatch() {
    try {
        const { data, error } = await supabase
            .from('embedding_batches')
            .insert({
            embedding_model: EMBEDDING_MODEL,
            embedding_dimensions: EMBEDDING_DIMENSIONS,
            api_version: 'v1',
            code_system: 'all',
            library_version: 'v2025Q4',
            total_codes: 0, // Will be updated later
            created_at: new Date().toISOString()
        })
            .select('id')
            .single();
        if (error) {
            console.warn('Warning: Could not create embedding batch audit record:', error.message);
            console.warn('Continuing without audit trail...');
            return null;
        }
        return data.id;
    }
    catch (error) {
        console.warn('Warning: Embedding batch audit disabled, continuing...');
        return null;
    }
}
/**
 * Fetch codes that need embeddings with pagination support
 */
async function fetchCodesToEmbed(limit) {
    console.log(`\nFetching codes to embed${limit ? ` (limit: ${limit})` : ''}...`);
    const allCodes = [];
    const PAGE_SIZE = 1000;
    let page = 0;
    while (true) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        let query = supabase
            .from('regional_medical_codes')
            .select('id, code_system, code_value, entity_type, normalized_embedding_text')
            .not('normalized_embedding_text', 'is', null) // Only codes with normalized text
            .neq('normalized_embedding_text', '') // Skip empty strings
            .is('normalized_embedding', null) // But no embedding yet
            .order('code_system', { ascending: true })
            .order('code_value', { ascending: true })
            .range(from, to);
        const { data, error } = await query;
        if (error) {
            console.error('Error fetching codes:', error);
            throw error;
        }
        if (!data || data.length === 0) {
            break;
        }
        allCodes.push(...data);
        console.log(`Fetched page ${page + 1}: ${data.length} codes (total: ${allCodes.length})`);
        if (limit && allCodes.length >= limit) {
            console.log(`Reached limit of ${limit} codes`);
            return allCodes.slice(0, limit);
        }
        if (data.length < PAGE_SIZE) {
            break;
        }
        page++;
    }
    console.log(`Fetched ${allCodes.length} total codes`);
    return allCodes;
}
/**
 * Generate embeddings for a batch of texts with retry logic
 */
async function generateEmbeddings(texts, stats, attempt = 1) {
    try {
        stats.apiCalls++;
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: texts,
            dimensions: EMBEDDING_DIMENSIONS
        });
        // Track token usage (guard against undefined)
        stats.totalTokens += response.usage?.total_tokens || 0;
        // Extract embeddings in same order as input
        const embeddings = response.data.map(item => item.embedding);
        return embeddings;
    }
    catch (error) {
        if (attempt < RETRY_ATTEMPTS) {
            const backoffMs = RETRY_BACKOFF_MS * Math.pow(2, attempt - 1);
            console.warn(`API error (attempt ${attempt}/${RETRY_ATTEMPTS}), retrying in ${backoffMs}ms:`, error.message);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            return generateEmbeddings(texts, stats, attempt + 1);
        }
        else {
            console.error(`Failed after ${RETRY_ATTEMPTS} attempts:`, error);
            throw error;
        }
    }
}
/**
 * Process and update a batch of codes with embeddings
 */
async function processBatch(codes, batchId, stats) {
    for (let i = 0; i < codes.length; i += BATCH_SIZE) {
        const batch = codes.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(codes.length / BATCH_SIZE);
        console.log(`\nProcessing batch ${batchNum}/${totalBatches} (${i + 1}-${Math.min(i + BATCH_SIZE, codes.length)} of ${codes.length})`);
        try {
            // Filter batch to only codes with non-whitespace text
            const validBatch = batch.filter(code => code.normalized_embedding_text && code.normalized_embedding_text.trim().length > 0);
            if (validBatch.length === 0) {
                console.log(`Skipping batch - all texts empty or whitespace`);
                stats.skipped += batch.length;
                stats.processed += batch.length;
                continue;
            }
            if (validBatch.length < batch.length) {
                console.log(`Filtered ${batch.length - validBatch.length} empty/whitespace texts from batch`);
                stats.skipped += batch.length - validBatch.length;
            }
            // Extract normalized texts
            const texts = validBatch.map(code => code.normalized_embedding_text);
            // Generate embeddings
            console.log(`Generating embeddings for ${texts.length} codes...`);
            const embeddings = await generateEmbeddings(texts, stats);
            if (embeddings.length !== validBatch.length) {
                throw new Error(`Embedding count mismatch: expected ${validBatch.length}, got ${embeddings.length}`);
            }
            // Update database with embeddings
            console.log(`Updating database...`);
            let batchSucceeded = 0;
            let batchFailed = 0;
            for (let j = 0; j < validBatch.length; j++) {
                const code = validBatch[j];
                const embedding = embeddings[j];
                // Validate embedding dimensions
                if (embedding.length !== EMBEDDING_DIMENSIONS) {
                    console.error(`Invalid embedding dimensions for ${code.code_value}: ${embedding.length}`);
                    batchFailed++;
                    stats.failed++;
                    continue;
                }
                // Convert embedding to PostgreSQL vector format
                const vectorString = `[${embedding.join(',')}]`;
                const updateData = {
                    normalized_embedding: vectorString
                };
                if (batchId) {
                    updateData.embedding_batch_id = batchId;
                }
                const { error } = await supabase
                    .from('regional_medical_codes')
                    .update(updateData)
                    .eq('id', code.id);
                if (error) {
                    console.error(`Error updating ${code.code_value}:`, error.message);
                    batchFailed++;
                    stats.failed++;
                }
                else {
                    batchSucceeded++;
                    stats.succeeded++;
                }
                stats.processed++;
            }
            console.log(`✓ Batch complete: ${batchSucceeded} succeeded, ${batchFailed} failed`);
            // Progress update
            const progressPercent = ((i + batch.length) / codes.length * 100).toFixed(1);
            const estimatedCost = (stats.totalTokens * 0.00000002).toFixed(4);
            console.log(`Progress: ${progressPercent}% (${stats.succeeded} succeeded, ${stats.failed} failed, ~$${estimatedCost} spent)`);
            // Rate limiting: small delay between batches to avoid hitting API limits
            if (i + BATCH_SIZE < codes.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        catch (error) {
            console.error(`Batch ${batchNum} failed:`, error);
            stats.failed += batch.length;
            stats.processed += batch.length;
        }
    }
}
/**
 * Display sample embedding results for QA
 */
async function displaySampleResults(limit = 10) {
    console.log('\n' + '='.repeat(80));
    console.log('SAMPLE EMBEDDING RESULTS (for QA)');
    console.log('='.repeat(80));
    const { data, error } = await supabase
        .from('regional_medical_codes')
        .select('code_system, code_value, entity_type, normalized_embedding_text, normalized_embedding')
        .not('normalized_embedding', 'is', null)
        .order('code_system')
        .limit(limit);
    if (error) {
        console.error('Error fetching samples:', error);
        return;
    }
    if (!data || data.length === 0) {
        console.log('No embeddings found yet.');
        return;
    }
    data.forEach((code, idx) => {
        // Parse vector to check dimensions
        const vectorStr = code.normalized_embedding;
        const dimensions = vectorStr ? (vectorStr.match(/,/g) || []).length + 1 : 0;
        console.log(`\n${idx + 1}. ${code.code_system.toUpperCase()} ${code.code_value}`);
        console.log(`   Type: ${code.entity_type}`);
        console.log(`   Text: ${code.normalized_embedding_text.substring(0, 80)}...`);
        console.log(`   Embedding: ${dimensions} dimensions`);
        console.log(`   First 5 values: [${vectorStr.substring(1, 50)}...]`);
    });
    console.log('\n' + '='.repeat(80));
}
/**
 * Main embedding generation function
 */
async function generateNormalizedEmbeddings(testRun = false) {
    const stats = {
        total: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        apiCalls: 0,
        totalTokens: 0,
        startTime: new Date()
    };
    console.log('='.repeat(80));
    console.log('PASS 1.5 - PASS B: GENERATE NORMALIZED EMBEDDINGS');
    console.log('='.repeat(80));
    console.log(`Mode: ${testRun ? 'TEST RUN (1,000 sample)' : 'FULL POPULATION'}`);
    console.log(`Model: ${EMBEDDING_MODEL}`);
    console.log(`Dimensions: ${EMBEDDING_DIMENSIONS}`);
    console.log(`Batch size: ${BATCH_SIZE} codes per API call`);
    console.log(`Start time: ${stats.startTime.toISOString()}`);
    console.log('='.repeat(80));
    try {
        // Skip embedding batch audit trail (PostgREST schema cache issue)
        console.log('\nSkipping embedding batch audit trail (not required for functionality)');
        const batchId = null;
        // Fetch codes to embed
        const codes = await fetchCodesToEmbed(testRun ? 1000 : undefined);
        stats.total = codes.length;
        if (codes.length === 0) {
            console.log('\n✓ All codes already have embeddings. Nothing to do.');
            return;
        }
        console.log(`\nFound ${codes.length} codes needing embeddings`);
        // Estimate cost
        const avgTokensPerCode = 20; // Conservative estimate
        const estimatedTokens = codes.length * avgTokensPerCode;
        const estimatedCost = estimatedTokens * 0.00000002; // $0.00002 per token for text-embedding-3-small
        console.log(`Estimated cost: ~$${estimatedCost.toFixed(4)} (${estimatedTokens.toLocaleString()} tokens)`);
        // Confirm before proceeding (unless test run)
        if (!testRun) {
            console.log('\n⚠️  WARNING: This will generate embeddings for ALL codes.');
            console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        // Process codes
        await processBatch(codes, batchId, stats);
        stats.endTime = new Date();
        const durationSeconds = (stats.endTime.getTime() - stats.startTime.getTime()) / 1000;
        const actualCost = stats.totalTokens * 0.00000002;
        // Display results
        console.log('\n' + '='.repeat(80));
        console.log('EMBEDDING GENERATION COMPLETE');
        console.log('='.repeat(80));
        console.log(`Total codes:      ${stats.total}`);
        console.log(`Processed:        ${stats.processed}`);
        console.log(`Succeeded:        ${stats.succeeded}`);
        console.log(`Failed:           ${stats.failed}`);
        console.log(`API calls:        ${stats.apiCalls}`);
        console.log(`Total tokens:     ${stats.totalTokens.toLocaleString()}`);
        console.log(`Actual cost:      $${actualCost.toFixed(4)}`);
        console.log(`Duration:         ${durationSeconds.toFixed(1)}s`);
        console.log(`Rate:             ${(stats.succeeded / durationSeconds).toFixed(1)} codes/sec`);
        console.log('='.repeat(80));
        // Show sample results for QA
        await displaySampleResults(10);
        // Next steps
        if (testRun) {
            console.log('\n📋 NEXT STEPS (Test run complete):');
            console.log('1. Review sample embedding results above');
            console.log('2. Verify:');
            console.log('   - All embeddings have 1536 dimensions');
            console.log('   - No API errors or failures');
            console.log('   - Costs align with estimates');
            console.log('3. Test vector search with Phase 0 medications:');
            console.log('   npm run pass15:test-vector-search');
            console.log('4. If results good, run full embedding generation:');
            console.log('   npm run pass15:generate-embeddings');
        }
        else {
            console.log('\n📋 NEXT STEPS (Full generation complete):');
            console.log('1. Create IVFFLAT index on normalized_embedding:');
            console.log('   See migration_history for index creation script');
            console.log('2. Test vector search with Phase 0 medications');
            console.log('3. Compare results vs baseline (60% failure rate)');
            console.log('4. Expand validation to 50-100 medications');
        }
    }
    catch (error) {
        console.error('\n❌ Embedding generation failed:', error);
        stats.endTime = new Date();
        throw error;
    }
}
// Parse command line arguments
const isTestRun = process.argv.includes('--test');
// Run embedding generation
generateNormalizedEmbeddings(isTestRun)
    .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
})
    .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
});
//# sourceMappingURL=generate-normalized-embeddings.js.map