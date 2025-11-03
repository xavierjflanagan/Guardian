/**
 * Generate OpenAI embeddings for SNOMED CT codes
 *
 * Purpose: Generate text-embedding-3-small embeddings for all SNOMED CT codes
 * in the database for vector similarity search
 *
 * Architecture Decisions:
 * - Model: OpenAI text-embedding-3-small (1536 dimensions)
 * - Text source: display_name (FSN with semantic tag)
 * - NOT search_text (too verbose with repetitive synonyms that dilute semantics)
 *
 * Rationale:
 * - SNOMED CT codes are clinical concepts (conditions, findings, procedures, medications)
 * - Following same strategy as LOINC (display_name only)
 * - display_name = FSN (Fully Specified Name) with semantic tag
 * - FSN provides clean semantic signal with clinical context
 * - Example: "Diabetes mellitus (disorder)" is more focused than FSN + 11 synonyms
 *
 * Usage:
 *   pnpm exec tsx scripts/generate-snomed-embeddings.ts
 *
 * Environment Requirements:
 *   - OPENAI_API_KEY in .env.local
 *   - SUPABASE credentials in .env.local
 *
 * Cost: ~$1.40 USD for 706,544 codes (estimated)
 * Time: ~6-8 hours (processes all codes in one run)
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('[OK] Loaded credentials from .env.local\n');
}

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const BATCH_SIZE = 100; // Process 100 codes per batch (OpenAI supports up to 2048)
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

// Validate environment
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing environment variables in .env.local:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env.local');
  console.error('   Get your API key from: https://platform.openai.com/api-keys');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

interface SnomedCodeRow {
  id: string;
  code_value: string;
  display_name: string;
  search_text: string;
  entity_type: string;
}

// Helper function to estimate tokens (rough approximation)
function estimateTokens(text: string): number {
  // 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
}

// Helper function to calculate cost
function calculateCost(tokens: number): number {
  // text-embedding-3-small: $0.02 per 1M tokens
  return (tokens / 1_000_000) * 0.02;
}

// Generate embeddings for a batch of codes
async function generateEmbeddingsBatch(
  codes: SnomedCodeRow[],
  retries = 3
): Promise<{ embeddings: number[][], tokens: number } | null> {
  // Use display_name for cleaner, focused embeddings
  // search_text contains too many synonyms that dilute semantic meaning
  const texts = codes.map(code => code.display_name);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
        dimensions: EMBEDDING_DIMENSIONS,
      });

      const embeddings = response.data.map(item => item.embedding);
      const tokens = response.usage.total_tokens;

      return { embeddings, tokens };
    } catch (error: any) {
      if (error.status === 429 && attempt < retries) {
        // Rate limit - wait and retry
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.log(`   [WARN] Rate limit hit - retrying in ${delay}ms (attempt ${attempt}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (error.status >= 500 && attempt < retries) {
        // Server error - wait and retry
        const delay = 2000;
        console.log(`   [WARN] OpenAI server error - retrying in ${delay}ms (attempt ${attempt}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`   [ERROR] Failed to generate embeddings: ${error.message}`);
        return null;
      }
    }
  }

  return null;
}

// Update database with embeddings
async function updateEmbeddings(
  codes: SnomedCodeRow[],
  embeddings: number[][]
): Promise<{ success: number, failed: number }> {
  let success = 0;
  let failed = 0;

  // Update each code individually
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const embedding = embeddings[i];

    try {
      const { error } = await supabase
        .from('regional_medical_codes')
        .update({
          embedding: JSON.stringify(embedding),
          active_embedding_model: 'openai'
        })
        .eq('id', code.id);

      if (error) {
        console.error(`   [ERROR] Failed to update ${code.code_value}: ${error.message}`);
        failed++;
      } else {
        success++;
      }
    } catch (err: any) {
      console.error(`   [ERROR] Failed to update ${code.code_value}: ${err.message}`);
      failed++;
    }
  }

  return { success, failed };
}

async function main() {
  console.log('SNOMED CT Embedding Generation Script');
  console.log('======================================\n');
  console.log(`Model: ${EMBEDDING_MODEL}`);
  console.log(`Dimensions: ${EMBEDDING_DIMENSIONS}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Pricing: $0.02 per 1M tokens\n`);

  // 1. Process codes in streaming batches (don't load all into memory)
  // Strategy: Filter by active_embedding_model IS NULL (faster than checking vector column)
  // Use cursor-based pagination to avoid statement timeouts
  console.log('Processing SNOMED CT codes in streaming batches...');
  const FETCH_BATCH_SIZE = 1000;
  let lastCodeValue: string | null = null;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let totalTokens = 0;
  let totalFetched = 0;
  const startTime = Date.now();

  while (true) {
    // Fetch batch using cursor-based pagination
    // CRITICAL: Check for NULL embedding vector, not just active_embedding_model
    // Some codes have active_embedding_model set but no actual vector data
    let query = supabase
      .from('regional_medical_codes')
      .select('id, code_value, display_name, search_text, entity_type')
      .eq('code_system', 'snomed_ct')
      .eq('country_code', 'AUS')
      .is('embedding', null)  // Check actual vector data
      .order('code_value')
      .limit(FETCH_BATCH_SIZE);

    if (lastCodeValue) {
      query = query.gt('code_value', lastCodeValue);
    }

    const { data: batch, error: fetchError } = await query;

    if (fetchError) {
      console.error(`[ERROR] Failed to fetch batch: ${fetchError.message}`);
      process.exit(1);
    }

    if (!batch || batch.length === 0) {
      break;
    }

    totalFetched += batch.length;

    // All codes in batch need embeddings (filtered by SQL)
    const codesWithoutEmbedding = batch;

    if (codesWithoutEmbedding.length > 0) {
      // Process these codes in embedding batches of 100
      for (let i = 0; i < codesWithoutEmbedding.length; i += BATCH_SIZE) {
        const embeddingBatch = codesWithoutEmbedding.slice(i, i + BATCH_SIZE) as SnomedCodeRow[];
        const batchNum = totalProcessed / BATCH_SIZE + 1;
        const progress = ((totalFetched / 706544) * 100).toFixed(1);

        process.stdout.write(`   Batch ${Math.floor(batchNum)} (${progress}%) - ${embeddingBatch.length} codes... `);

        // Generate embeddings
        const result = await generateEmbeddingsBatch(embeddingBatch);

        if (!result) {
          console.log('[FAIL] Could not generate embeddings');
          totalFailed += embeddingBatch.length;
          totalProcessed += embeddingBatch.length;
          continue;
        }

        totalTokens += result.tokens;

        // Update database
        const updateResult = await updateEmbeddings(embeddingBatch, result.embeddings);
        totalUpdated += updateResult.success;
        totalFailed += updateResult.failed;
        totalProcessed += embeddingBatch.length;

        console.log(`[OK] Updated ${updateResult.success}/${embeddingBatch.length}`);

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Update cursor to last code_value in this batch
    lastCodeValue = batch[batch.length - 1].code_value;

    // If we got fewer than FETCH_BATCH_SIZE, we're done
    if (batch.length < FETCH_BATCH_SIZE) {
      break;
    }
  }

  console.log(`\n[OK] Completed fetching and processing all codes\n`);

  if (totalProcessed === 0) {
    console.log('[OK] All SNOMED CT codes already have embeddings!');
    return;
  }

  const elapsedTime = Math.round((Date.now() - startTime) / 1000);
  const estimatedCost = calculateCost(totalTokens);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('EMBEDDING GENERATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total codes processed:       ${totalProcessed}`);
  console.log(`Successfully updated:        ${totalUpdated}`);
  console.log(`Failed:                      ${totalFailed}`);
  console.log(`Total tokens used:           ${totalTokens.toLocaleString()}`);
  console.log(`Estimated cost:              $${estimatedCost.toFixed(4)} USD`);
  console.log(`Processing time:             ${elapsedTime}s (${Math.round(elapsedTime / 60)}m ${elapsedTime % 60}s)`);
  console.log('='.repeat(60));

  if (totalUpdated > 0) {
    console.log('\nSNOMED CT embeddings generated successfully!');
    console.log('\nNext Steps:');
    console.log('1. Verify embeddings in Supabase dashboard');
    console.log('2. Test vector search with sample SNOMED CT queries');
    console.log('3. Create vector index for performance:');
    console.log('   CREATE INDEX ON regional_medical_codes ');
    console.log('   USING ivfflat (embedding vector_cosine_ops)');
    console.log('   WHERE code_system = \'snomed_ct\';');
  }

  if (totalFailed > 0) {
    console.log(`\n[WARN] ${totalFailed} codes failed to update. Run script again to retry.`);
  }
}

main().catch(console.error);
