"use strict";
/**
 * Generate SapBERT Embeddings for Medical Codes
 *
 * Uses HuggingFace Inference API to generate medical-specific embeddings
 * for all regional medical codes.
 *
 * Based on Experiment 2 findings:
 * - SapBERT provides 17.3pp better differentiation vs OpenAI for medications
 * - Normalized text strategy outperforms ingredient-only by 5.4pp
 *
 * Strategy:
 * - Use normalized_embedding_text column (includes dosage + form context)
 * - SapBERT model: cambridgeltl/SapBERT-from-PubMedBERT-fulltext
 * - HuggingFace API (free tier, ~1000 requests/hour)
 * - Store in column: sapbert_embedding (768 dimensions)
 * - Resume-safe: skips codes that already have SapBERT embeddings
 *
 * Reference: pass1.5-testing/experiment-2/COMPREHENSIVE_ANALYSIS.md
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
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// Load environment
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
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}
if (!HUGGINGFACE_API_KEY) {
    console.error('Missing HUGGINGFACE_API_KEY in .env.production');
    console.error('Get free API key at: https://huggingface.co/settings/tokens');
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const SAPBERT_MODEL = 'cambridgeltl/SapBERT-from-PubMedBERT-fulltext';
const SAPBERT_DIMENSIONS = 768;
const BATCH_SIZE = 10; // HuggingFace free tier: 1000 requests/hour = ~10/min safe
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
/**
 * Generate SapBERT embedding via HuggingFace Inference API
 */
async function generateSapBERTEmbedding(text, stats, attempt = 1) {
    try {
        stats.apiCalls++;
        const response = await fetch(`https://api-inference.huggingface.co/models/${SAPBERT_MODEL}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                inputs: text,
                options: { wait_for_model: true }
            })
        });
        if (response.status === 503) {
            // Model loading, retry
            console.log(`⏳ Model loading, retrying in ${RETRY_DELAY_MS}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            if (attempt < RETRY_ATTEMPTS) {
                return generateSapBERTEmbedding(text, stats, attempt + 1);
            }
            return null;
        }
        if (response.status === 429) {
            // Rate limit hit
            stats.rateLimitHits++;
            console.log(`⚠️  Rate limit hit (${stats.rateLimitHits}), waiting 60 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 60000));
            if (attempt < RETRY_ATTEMPTS) {
                return generateSapBERTEmbedding(text, stats, attempt + 1);
            }
            return null;
        }
        if (!response.ok) {
            const error = await response.text();
            console.error(`SapBERT API error (${response.status}): ${error}`);
            if (attempt < RETRY_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                return generateSapBERTEmbedding(text, stats, attempt + 1);
            }
            return null;
        }
        const data = await response.json();
        // HuggingFace returns array of embeddings
        if (Array.isArray(data) && data.length > 0) {
            return data[0];
        }
        else if (data.embeddings) {
            return data.embeddings;
        }
        else {
            console.error('Unexpected SapBERT response format:', data);
            return null;
        }
    }
    catch (error) {
        console.error(`SapBERT API exception:`, error);
        if (attempt < RETRY_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            return generateSapBERTEmbedding(text, stats, attempt + 1);
        }
        return null;
    }
}
/**
 * Fetch codes that need SapBERT embeddings
 */
async function fetchCodesToEmbed(limit) {
    console.log(`\\nFetching codes to embed${limit ? ` (limit: ${limit})` : ''}...`);
    const allCodes = [];
    const PAGE_SIZE = 1000;
    let page = 0;
    while (true) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        let query = supabase
            .from('regional_medical_codes')
            .select('id, code_system, code_value, display_name, normalized_embedding_text, entity_type')
            .eq('code_system', 'pbs') // PBS medications only (Migration 31: SapBERT for medications)
            .eq('country_code', 'AUS') // Australian PBS codes
            .not('normalized_embedding_text', 'is', null) // Must have normalized text
            .neq('normalized_embedding_text', '') // Skip empty strings
            .is('sapbert_embedding', null) // But no SapBERT embedding yet (Migration 31 column)
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
    console.log(`Fetched ${allCodes.length} total codes needing SapBERT embeddings`);
    return allCodes;
}
/**
 * Process codes in batches
 */
async function processCodes(codes, stats) {
    console.log(`\\nProcessing ${codes.length} codes in batches of ${BATCH_SIZE}...`);
    console.log('');
    for (let i = 0; i < codes.length; i += BATCH_SIZE) {
        const batch = codes.slice(i, i + BATCH_SIZE);
        console.log(`\\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(codes.length / BATCH_SIZE)} (${batch.length} codes)`);
        // Filter out empty normalized texts
        const validBatch = batch.filter(code => code.normalized_embedding_text && code.normalized_embedding_text.trim().length > 0);
        if (validBatch.length === 0) {
            console.log('⚠️ Batch has no valid codes, skipping');
            stats.skipped += batch.length;
            continue;
        }
        if (validBatch.length < batch.length) {
            console.log(`⚠️ Filtered out ${batch.length - validBatch.length} codes with empty normalized text`);
            stats.skipped += (batch.length - validBatch.length);
        }
        console.log(`Generating SapBERT embeddings for ${validBatch.length} codes (normalized text strategy)...`);
        // Generate embeddings one by one (HuggingFace API doesn't support batching well)
        let batchSucceeded = 0;
        let batchFailed = 0;
        for (let j = 0; j < validBatch.length; j++) {
            const code = validBatch[j];
            // Use normalized_embedding_text (Experiment 2: 5.4pp better than ingredient-only)
            const textToEmbed = code.normalized_embedding_text;
            if (!textToEmbed || textToEmbed.trim().length === 0) {
                console.log(`⚠️ Empty normalized text for ${code.code_value}, skipping`);
                stats.skipped++;
                continue;
            }
            // Generate embedding
            const embedding = await generateSapBERTEmbedding(textToEmbed, stats);
            if (!embedding) {
                console.error(`❌ Failed to generate embedding for ${code.code_value}`);
                batchFailed++;
                stats.failed++;
                continue;
            }
            // Validate dimensions
            if (embedding.length !== SAPBERT_DIMENSIONS) {
                console.error(`❌ Invalid embedding dimensions for ${code.code_value}: ${embedding.length} (expected ${SAPBERT_DIMENSIONS})`);
                batchFailed++;
                stats.failed++;
                continue;
            }
            // Convert to PostgreSQL vector format
            const vectorString = `[${embedding.join(',')}]`;
            // Update database (Migration 31: sapbert_embedding + timestamp)
            const { error } = await supabase
                .from('regional_medical_codes')
                .update({
                sapbert_embedding: vectorString,
                sapbert_embedding_generated_at: new Date().toISOString()
            })
                .eq('id', code.id);
            if (error) {
                console.error(`❌ Database update failed for ${code.code_value}:`, error.message);
                batchFailed++;
                stats.failed++;
            }
            else {
                batchSucceeded++;
                stats.succeeded++;
            }
            // Small delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        stats.processed += validBatch.length;
        console.log(`✓ Batch complete: ${batchSucceeded} succeeded, ${batchFailed} failed`);
        // Progress update
        const progressPercent = ((i + batch.length) / codes.length * 100).toFixed(1);
        const elapsed = (Date.now() - stats.startTime) / 1000;
        const rate = stats.processed / elapsed;
        const remaining = (codes.length - stats.processed) / rate;
        console.log(`Progress: ${progressPercent}% (${stats.succeeded} succeeded, ${stats.failed} failed, ${stats.skipped} skipped)`);
        console.log(`Rate: ${rate.toFixed(1)} codes/sec, ETA: ${Math.floor(remaining / 60)}m ${Math.floor(remaining % 60)}s`);
        console.log(`API calls: ${stats.apiCalls}, Rate limits hit: ${stats.rateLimitHits}`);
    }
}
/**
 * Display summary statistics
 */
function displaySummary(stats) {
    const elapsed = (Date.now() - stats.startTime) / 1000;
    console.log('\\n' + '='.repeat(80));
    console.log('SAPBERT EMBEDDING GENERATION COMPLETE');
    console.log('='.repeat(80));
    console.log(`Total codes: ${stats.total}`);
    console.log(`Processed: ${stats.processed}`);
    console.log(`Succeeded: ${stats.succeeded}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log(`\\nDuration: ${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s`);
    console.log(`Rate: ${(stats.processed / elapsed).toFixed(1)} codes/sec`);
    console.log(`API calls: ${stats.apiCalls}`);
    console.log(`Rate limits hit: ${stats.rateLimitHits}`);
    if (stats.succeeded === stats.total) {
        console.log('\\n✅ All embeddings generated successfully!');
    }
    else if (stats.failed > 0) {
        console.log(`\\n⚠️  ${stats.failed} embeddings failed - review errors above`);
    }
    console.log('='.repeat(80));
}
/**
 * Main execution
 */
async function main() {
    console.log('='.repeat(80));
    console.log('SAPBERT EMBEDDING GENERATION');
    console.log('='.repeat(80));
    console.log('Model: cambridgeltl/SapBERT-from-PubMedBERT-fulltext');
    console.log('Dimensions: 768');
    console.log('Strategy: Normalized text (Experiment 2: 17.3pp better than OpenAI for medications)');
    console.log('Source: normalized_embedding_text column');
    console.log('='.repeat(80));
    console.log('');
    // Check if test mode
    const isTest = process.argv.includes('--test');
    const testLimit = isTest ? 100 : undefined;
    if (isTest) {
        console.log('⚠️  TEST MODE: Limiting to 100 codes');
        console.log('');
    }
    const stats = {
        total: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        startTime: Date.now(),
        apiCalls: 0,
        rateLimitHits: 0
    };
    // Fetch codes
    const codes = await fetchCodesToEmbed(testLimit);
    stats.total = codes.length;
    if (codes.length === 0) {
        console.log('✓ No codes need SapBERT embeddings - all done!');
        return;
    }
    // Process codes
    await processCodes(codes, stats);
    // Display summary
    displaySummary(stats);
    // Exit with appropriate code
    process.exit(stats.failed > 0 ? 1 : 0);
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=generate-sapbert-embeddings.js.map