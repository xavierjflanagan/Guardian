/**
 * Vector Search Execution Script
 *
 * Purpose: Generate embeddings for test queries and execute vector similarity searches
 * NO SHORTCUTS: Every query generates ACTUAL OpenAI embedding and ACTUAL database search
 *
 * For each test entity variant:
 * 1. Generate embedding using OpenAI API (text-embedding-3-small, 1536 dims)
 * 2. Execute vector search via search_regional_codes RPC
 * 3. Return top 20 codes ranked by similarity
 * 4. Save results with similarity scores
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('[OK] Loaded credentials from .env.local\n');
}

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[ERROR] Missing Supabase credentials');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error('[ERROR] Missing OpenAI API key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

interface TestEntity {
  id: number;
  entity_text: string;
  category: string;
  expected_entity_type: string;
  search_variants: Array<{
    variant_type: string;
    query: string;
    rationale: string;
  }>;
}

interface VectorResult {
  entity_id: number;
  entity_text: string;
  variant_type: string;
  query: string;
  expected_entity_type: string;
  method: 'vector';
  timestamp: string;
  results: Array<{
    rank: number;
    code_value: string;
    display_name: string;
    entity_type: string;
    code_system: string;
    similarity_score: number;
  }>;
}

/**
 * Generate embedding for query using OpenAI API
 * CRITICAL: Must use same model/dimensions as LOINC code embeddings
 */
async function generateQueryEmbedding(query: string): Promise<number[]> {
  console.log(`   Generating embedding for: "${query}"`);

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
    dimensions: 1536,
  });

  console.log(`   ✓ Embedding generated (${response.data[0].embedding.length} dimensions)`);
  return response.data[0].embedding;
}

/**
 * Execute vector similarity search against LOINC codes
 * CRITICAL: Must query actual database, searches all 102,891 codes
 */
async function searchVector(queryEmbedding: number[], limit: number = 20): Promise<any[]> {
  console.log(`   Executing vector search (top ${limit})...`);

  const { data, error } = await supabase.rpc('search_regional_codes', {
    query_embedding: queryEmbedding,
    entity_type_filter: null, // No filter, accept all entity types
    country_code_filter: 'AUS',
    max_results: limit,
    min_similarity: 0.0 // No threshold, return top K regardless
  });

  if (error) {
    console.error(`   [ERROR] Database query failed: ${error.message}`);
    throw error;
  }

  // Filter to only LOINC codes
  const loincOnly = (data || []).filter((r: any) => r.code_system === 'loinc');

  console.log(`   ✓ Found ${loincOnly.length} LOINC codes`);

  if (loincOnly.length === 0) {
    console.warn('   [WARN] No LOINC codes returned - check if embeddings exist');
  }

  return loincOnly.slice(0, limit);
}

async function main() {
  console.log('Experiment 8: Vector Search Execution');
  console.log('=====================================\n');
  console.log('Purpose: Generate embeddings and execute vector searches for all test queries');
  console.log('Method: ACTUAL OpenAI API calls + ACTUAL database searches\n');

  // Load test entities
  const testDataPath = path.join(
    __dirname,
    '../test-data/test-entities.json'
  );

  if (!fs.existsSync(testDataPath)) {
    console.error(`[ERROR] Test entities file not found: ${testDataPath}`);
    process.exit(1);
  }

  const testData = await fs.readJSON(testDataPath);
  console.log(`[OK] Loaded ${testData.total_entities} entities with ${testData.total_queries} total queries\n`);
  console.log('Note: Database verification completed externally (102,891 LOINC codes with embeddings)\n');

  // Execute vector searches
  const results: VectorResult[] = [];
  let queryCount = 0;

  for (const entity of testData.entities) {
    console.log(`\nEntity ${entity.id}: ${entity.entity_text}`);
    console.log('─'.repeat(60));

    for (const variant of entity.search_variants) {
      queryCount++;
      console.log(`\nQuery ${queryCount}/${testData.total_queries} (${variant.variant_type}): "${variant.query}"`);

      try {
        // Generate embedding for query (ACTUAL OpenAI API call)
        const queryEmbedding = await generateQueryEmbedding(variant.query);

        // Execute vector search (ACTUAL database query)
        const searchResults = await searchVector(queryEmbedding, 20);

        // Save results
        const result: VectorResult = {
          entity_id: entity.id,
          entity_text: entity.entity_text,
          variant_type: variant.variant_type,
          query: variant.query,
          expected_entity_type: entity.expected_entity_type,
          method: 'vector',
          timestamp: new Date().toISOString(),
          results: searchResults.map((r, i) => ({
            rank: i + 1,
            code_value: r.code_value,
            display_name: r.display_name,
            entity_type: r.entity_type,
            code_system: r.code_system,
            similarity_score: r.similarity_score || 0
          }))
        };

        results.push(result);

        // Save individual result file
        const filename = `vector-entity-${entity.id}-${variant.variant_type}.json`;
        const filepath = path.join(__dirname, '../results', filename);
        await fs.ensureDir(path.dirname(filepath));
        await fs.writeJSON(filepath, result, { spaces: 2 });
        console.log(`   ✓ Saved: ${filename}`);

        // Display top 3 results
        console.log('   Top 3 results:');
        searchResults.slice(0, 3).forEach((r, i) => {
          const score = (r.similarity_score * 100).toFixed(1);
          console.log(`     ${i + 1}. [${score}%] ${r.code_value}: ${r.display_name.substring(0, 60)}...`);
        });

        // Rate limiting (100ms delay between queries)
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error: any) {
        console.error(`   [ERROR] Query failed: ${error.message}`);
        console.error('   Stopping execution - fix error and retry');
        process.exit(1);
      }
    }
  }

  // Save aggregated results
  const aggregatedPath = path.join(__dirname, '../results/vector-all-results.json');
  await fs.writeJSON(aggregatedPath, results, { spaces: 2 });
  console.log(`\n[OK] Saved aggregated results: ${aggregatedPath}`);

  // Summary statistics
  console.log('\n' + '='.repeat(60));
  console.log('VECTOR SEARCH EXECUTION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total queries executed:       ${results.length}`);
  console.log(`Total result codes:           ${results.reduce((sum, r) => sum + r.results.length, 0)}`);
  console.log(`Average similarity (top-1):   ${(results.reduce((sum, r) => sum + (r.results[0]?.similarity_score || 0), 0) / results.length * 100).toFixed(1)}%`);
  console.log(`Average similarity (top-20):  ${(results.reduce((sum, r) => sum + (r.results.reduce((s, result) => s + result.similarity_score, 0) / r.results.length), 0) / results.length * 100).toFixed(1)}%`);
  console.log('='.repeat(60));

  console.log('\n✓ Vector search execution complete');
  console.log('Next step: Run lexical search script');
}

main().catch(console.error);
