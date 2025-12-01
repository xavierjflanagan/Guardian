/**
 * Generate OpenAI embeddings for SNOMED CT CORE codes
 *
 * Purpose: Generate text-embedding-3-small embeddings for SNOMED CORE codes
 * in universal_medical_codes for vector similarity search
 *
 * Architecture: Pass 1.5 Two-Tier Search
 * - Tier 1: Vector search on SNOMED CORE (~6,820 common conditions)
 * - Tier 2: Lexical search fallback on full SNOMED (~700k codes)
 *
 * Model: OpenAI text-embedding-3-small (1536 dimensions)
 * Text source: display_name (SNOMED Fully Specified Names)
 *
 * Usage:
 *   npx tsx scripts/medical-codes/generate-snomed-embeddings.ts
 *
 * Environment Requirements:
 *   - OPENAI_API_KEY
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Cost: ~$0.01 USD for 6,820 codes
 * Time: ~5-10 minutes
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseUrl = process.env.SUPABASE_URL || 'https://napoydbbuvbpyciwjdci.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const openaiKey = process.env.OPENAI_API_KEY || '';

if (!supabaseKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

if (!openaiKey) {
  console.error('Error: OPENAI_API_KEY environment variable is required');
  console.error('Get your API key from: https://platform.openai.com/api-keys');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

const BATCH_SIZE = 100; // Process 100 codes per batch
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

interface SnomedCode {
  id: string;
  code_value: string;
  display_name: string;
  active: boolean;
}

// Generate embeddings for a batch of codes
async function generateEmbeddingsBatch(
  codes: SnomedCode[],
  retries = 3
): Promise<{ embeddings: number[][], tokens: number } | null> {
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
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`   [WARN] Rate limit - retrying in ${delay}ms (attempt ${attempt}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (error.status >= 500 && attempt < retries) {
        const delay = 2000;
        console.log(`   [WARN] Server error - retrying in ${delay}ms (attempt ${attempt}/${retries})`);
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
  codes: SnomedCode[],
  embeddings: number[][]
): Promise<{ success: number, failed: number }> {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const embedding = embeddings[i];

    try {
      const { error } = await supabase
        .from('universal_medical_codes')
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
  console.log('=== SNOMED CT CORE Embedding Generation ===\n');
  console.log(`Model: ${EMBEDDING_MODEL}`);
  console.log(`Dimensions: ${EMBEDDING_DIMENSIONS}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Pricing: $0.02 per 1M tokens\n`);

  // 1. Count codes without embeddings
  console.log('Checking SNOMED CORE codes in database...');

  const { count: totalCount } = await supabase
    .from('universal_medical_codes')
    .select('id', { count: 'exact', head: true })
    .eq('code_system', 'snomed')
    .is('embedding', null);

  if (!totalCount || totalCount === 0) {
    console.log('[OK] All SNOMED CORE codes already have embeddings!');

    const { count: withEmbeddings } = await supabase
      .from('universal_medical_codes')
      .select('id', { count: 'exact', head: true })
      .eq('code_system', 'snomed')
      .not('embedding', 'is', null);

    console.log(`\nTotal SNOMED codes with embeddings: ${withEmbeddings}`);
    return;
  }

  console.log(`[OK] Found ${totalCount} SNOMED CORE codes without embeddings\n`);

  // 2. Fetch all codes
  console.log('Fetching codes from database...');
  const FETCH_BATCH_SIZE = 1000;
  let allCodes: SnomedCode[] = [];
  let offset = 0;

  while (offset < totalCount) {
    const { data: batch, error: fetchError } = await supabase
      .from('universal_medical_codes')
      .select('id, code_value, display_name, active')
      .eq('code_system', 'snomed')
      .is('embedding', null)
      .order('code_value')
      .range(offset, offset + FETCH_BATCH_SIZE - 1);

    if (fetchError) {
      console.error(`[ERROR] Failed to fetch batch: ${fetchError.message}`);
      process.exit(1);
    }

    if (!batch || batch.length === 0) break;

    allCodes = allCodes.concat(batch);
    offset += FETCH_BATCH_SIZE;
    process.stdout.write(`\r   Fetched ${allCodes.length}/${totalCount} codes...`);
  }

  console.log(`\n[OK] Fetched all ${allCodes.length} codes\n`);

  const codes = allCodes;

  // Status distribution
  const activeCodes = codes.filter(c => c.active).length;
  const retiredCodes = codes.filter(c => !c.active).length;

  console.log('Status distribution:');
  console.log(`   Active: ${activeCodes} (${((activeCodes/codes.length)*100).toFixed(1)}%)`);
  console.log(`   Retired: ${retiredCodes} (${((retiredCodes/codes.length)*100).toFixed(1)}%)`);
  console.log('');

  // 3. Process in batches
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
  const estimatedCost = (totalTokens / 1_000_000) * 0.02;

  // 4. Summary
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
    console.log('\nSNOMED CORE embeddings generated successfully!');
    console.log('\nNext Steps:');
    console.log('1. Create HNSW index for vector search');
    console.log('2. Test semantic search on medical conditions');
    console.log('3. Implement two-tier search architecture');
  }

  if (totalFailed > 0) {
    console.log(`\n[WARN] ${totalFailed} codes failed. Run script again to retry.`);
  }
}

main().catch(console.error);
