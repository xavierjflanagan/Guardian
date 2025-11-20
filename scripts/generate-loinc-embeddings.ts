/**
 * Generate OpenAI embeddings for LOINC codes
 *
 * Purpose: Generate text-embedding-3-small embeddings for all LOINC codes
 * in the database for vector similarity search
 *
 * Architecture Decisions:
 * - Model: OpenAI text-embedding-3-small (1536 dimensions)
 * - Text source: display_name (clean, focused clinical terminology)
 * - NOT search_text (too verbose with repetitive abbreviations that dilute semantics)
 *
 * Rationale:
 * - LOINC codes are observations/lab results, not medications
 * - Experiment 2: OpenAI performs equally to SapBERT for non-medication entities
 * - Experiment 2: Normalized text (clean) > Over-verbose text
 * - display_name provides clean semantic signal without noise
 * - No hybrid search needed (unlike medications)
 *
 * Usage:
 *   pnpm exec tsx scripts/generate-loinc-embeddings.ts
 *
 * Environment Requirements:
 *   - OPENAI_API_KEY in .env.local
 *   - SUPABASE credentials in .env.local
 *
 * Cost: ~$0.04 USD for 102,891 codes
 * Time: ~60-90 minutes (processes all codes in one run)
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

interface LoincCodeRow {
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
  codes: LoincCodeRow[],
  retries = 3
): Promise<{ embeddings: number[][], tokens: number } | null> {
  // Use display_name for cleaner, focused embeddings
  // search_text contains too many abbreviations and synonyms that dilute semantic meaning
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
  codes: LoincCodeRow[],
  embeddings: number[][]
): Promise<{ success: number, failed: number }> {
  let success = 0;
  let failed = 0;

  // Update each code individually (Supabase doesn't support batch UPDATE with different values easily)
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
  console.log('LOINC Embedding Generation Script');
  console.log('==================================\n');
  console.log(`Model: ${EMBEDDING_MODEL}`);
  console.log(`Dimensions: ${EMBEDDING_DIMENSIONS}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Pricing: $0.02 per 1M tokens\n`);

  // 1. Fetch total count first
  console.log('Checking LOINC codes in database...');

  const { count: totalCount } = await supabase
    .from('regional_medical_codes')
    .select('id', { count: 'exact', head: true })
    .eq('code_system', 'loinc')
    .eq('country_code', 'AUS')
    .is('embedding', null);

  if (!totalCount || totalCount === 0) {
    console.log('[OK] All LOINC codes already have embeddings!');

    const { count: withEmbeddings } = await supabase
      .from('regional_medical_codes')
      .select('id', { count: 'exact', head: true })
      .eq('code_system', 'loinc')
      .eq('country_code', 'AUS')
      .not('embedding', 'is', null);

    console.log(`\nTotal LOINC codes with embeddings: ${withEmbeddings}`);
    return;
  }

  console.log(`[OK] Found ${totalCount} LOINC codes without embeddings\n`);

  // 2. Fetch all codes in batches (Supabase has 1000 row limit per query)
  console.log('Fetching codes from database (may take a moment for large datasets)...');
  const FETCH_BATCH_SIZE = 1000;
  let allCodes: LoincCodeRow[] = [];
  let offset = 0;

  while (offset < totalCount) {
    const { data: batch, error: fetchError } = await supabase
      .from('regional_medical_codes')
      .select('id, code_value, display_name, search_text, entity_type')
      .eq('code_system', 'loinc')
      .eq('country_code', 'AUS')
      .is('embedding', null)
      .order('code_value')
      .range(offset, offset + FETCH_BATCH_SIZE - 1);

    if (fetchError) {
      console.error(`[ERROR] Failed to fetch batch at offset ${offset}: ${fetchError.message}`);
      process.exit(1);
    }

    if (!batch || batch.length === 0) break;

    allCodes = allCodes.concat(batch);
    offset += FETCH_BATCH_SIZE;
    process.stdout.write(`\r   Fetched ${allCodes.length}/${totalCount} codes...`);
  }

  console.log(`\n[OK] Fetched all ${allCodes.length} codes\n`);
  const codes = allCodes;

  // Entity type distribution
  const entityTypes = codes.reduce((acc, code) => {
    acc[code.entity_type] = (acc[code.entity_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('Entity type distribution:');
  Object.entries(entityTypes).forEach(([type, count]) => {
    const percent = ((count / codes.length) * 100).toFixed(1);
    console.log(`   ${type}: ${count} (${percent}%)`);
  });
  console.log('');

  // 2. Process in batches
  const totalBatches = Math.ceil(codes.length / BATCH_SIZE);
  let totalTokens = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  const startTime = Date.now();

  console.log(`Processing ${totalBatches} batches...\n`);

  for (let i = 0; i < codes.length; i += BATCH_SIZE) {
    const batch = codes.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const progress = ((i / codes.length) * 100).toFixed(1);

    process.stdout.write(`   Batch ${batchNum}/${totalBatches} (${progress}%) - ${batch.length} codes... `);

    // Generate embeddings
    const result = await generateEmbeddingsBatch(batch);

    if (!result) {
      console.log('[FAIL] Could not generate embeddings');
      totalFailed += batch.length;
      continue;
    }

    totalTokens += result.tokens;

    // Update database
    const updateResult = await updateEmbeddings(batch, result.embeddings);
    totalUpdated += updateResult.success;
    totalFailed += updateResult.failed;

    console.log(`[OK] Updated ${updateResult.success}/${batch.length}`);

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const elapsedTime = Math.round((Date.now() - startTime) / 1000);
  const estimatedCost = calculateCost(totalTokens);

  // 3. Summary
  console.log('\n' + '='.repeat(60));
  console.log('EMBEDDING GENERATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total codes processed:       ${codes.length}`);
  console.log(`Successfully updated:        ${totalUpdated}`);
  console.log(`Failed:                      ${totalFailed}`);
  console.log(`Total tokens used:           ${totalTokens.toLocaleString()}`);
  console.log(`Estimated cost:              $${estimatedCost.toFixed(4)} USD`);
  console.log(`Processing time:             ${elapsedTime}s (${Math.round(elapsedTime / 60)}m ${elapsedTime % 60}s)`);
  console.log('='.repeat(60));

  if (totalUpdated > 0) {
    console.log('\nLOINC embeddings generated successfully!');
    console.log('\nNext Steps:');
    console.log('1. Verify embeddings in Supabase dashboard');
    console.log('2. Test vector search with sample LOINC queries');
    console.log('3. Create vector index for performance:');
    console.log('   CREATE INDEX ON regional_medical_codes ');
    console.log('   USING ivfflat (openai_embedding vector_cosine_ops)');
    console.log('   WHERE code_system = \'loinc\';');
  }

  if (totalFailed > 0) {
    console.log(`\n[WARN] ${totalFailed} codes failed to update. Run script again to retry.`);
  }
}

main().catch(console.error);
