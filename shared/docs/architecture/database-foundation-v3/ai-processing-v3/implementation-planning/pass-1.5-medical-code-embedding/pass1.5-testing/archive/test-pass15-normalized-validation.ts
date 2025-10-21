/**
 * Pass 1.5 Phase 0 Validation Test - NORMALIZED EMBEDDINGS
 *
 * Purpose: Test if normalization fixed the 60% failure rate
 * Baseline: 40% success rate (2/5 medications found)
 * Target: >80% success rate (4+/5 medications found)
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Find project root and load environment variables
function findProjectRoot(): string {
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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !OPENAI_API_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

interface TestCase {
  query: string;
  expectedIngredient: string;
  baselineResult: 'PASS' | 'FAIL';
  baselineSimilarity?: number;
  baselinePosition?: number;
}

const TEST_CASES: TestCase[] = [
  {
    query: 'Metformin 500mg',
    expectedIngredient: 'metformin',
    baselineResult: 'FAIL',
    baselineSimilarity: 0.55,
  },
  {
    query: 'Atorvastatin 40mg',
    expectedIngredient: 'atorvastatin',
    baselineResult: 'PASS',
    baselineSimilarity: 0.801,
    baselinePosition: 1,
  },
  {
    query: 'Perindopril 4mg',
    expectedIngredient: 'perindopril',
    baselineResult: 'FAIL',
    baselineSimilarity: 0.72,
  },
  {
    query: 'Paracetamol 500mg',
    expectedIngredient: 'paracetamol',
    baselineResult: 'FAIL',
    baselineSimilarity: 0.54,
  },
  {
    query: 'Amoxicillin 500mg',
    expectedIngredient: 'amoxicillin',
    baselineResult: 'PASS',
    baselineSimilarity: 0.766,
    baselinePosition: 1,
  },
];

async function generateQueryEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS
  });
  return response.data[0].embedding;
}

async function searchNormalizedEmbeddings(
  queryEmbedding: number[],
  limit: number = 20
): Promise<any[]> {
  const vectorString = `[${queryEmbedding.join(',')}]`;

  const { data, error } = await supabase.rpc('search_regional_codes', {
    query_embedding: vectorString,
    entity_type_filter: 'medication',
    country_code_filter: 'AUS',
    max_results: limit,
    min_similarity: 0.3
  });

  if (error) {
    console.error('Search error:', error);
    throw error;
  }

  return data || [];
}

// Custom search function using normalized_embedding column directly
// Note: We need to use a custom RPC function since Supabase client doesn't support
// vector distance operations directly. For now, we'll fetch all and calculate similarity.
async function searchNormalizedEmbeddingsDirect(
  queryEmbedding: number[],
  limit: number = 20
): Promise<any[]> {
  // Fetch medications with normalized embeddings
  const { data: codes, error } = await supabase
    .from('regional_medical_codes')
    .select('code_system, code_value, display_name, search_text, normalized_embedding_text, normalized_embedding, entity_type, country_code, authority_required')
    .eq('active', true)
    .eq('entity_type', 'medication')
    .eq('country_code', 'AUS')
    .not('normalized_embedding', 'is', null)
    .limit(1000); // Fetch more than we need for manual filtering

  if (error) {
    console.error('Fetch error:', error);
    throw error;
  }

  if (!codes || codes.length === 0) {
    return [];
  }

  // Calculate cosine similarity manually
  const results = codes.map(code => {
    // Parse the vector string
    const vectorStr = code.normalized_embedding as string;
    const dbEmbedding = JSON.parse(vectorStr.replace('[', '[').replace(']', ']'));

    // Calculate cosine similarity
    let dotProduct = 0;
    let queryMag = 0;
    let dbMag = 0;

    for (let i = 0; i < queryEmbedding.length; i++) {
      dotProduct += queryEmbedding[i] * dbEmbedding[i];
      queryMag += queryEmbedding[i] * queryEmbedding[i];
      dbMag += dbEmbedding[i] * dbEmbedding[i];
    }

    const similarity = dotProduct / (Math.sqrt(queryMag) * Math.sqrt(dbMag));

    return {
      ...code,
      similarity_score: similarity
    };
  })
  .filter(r => r.similarity_score >= 0.3) // Min similarity threshold
  .sort((a, b) => b.similarity_score - a.similarity_score) // Sort by similarity descending
  .slice(0, limit); // Limit results

  return results;
}

async function runValidationTest() {
  console.log('='.repeat(80));
  console.log('PASS 1.5 PHASE 0 VALIDATION TEST - NORMALIZED EMBEDDINGS');
  console.log('='.repeat(80));
  console.log('Purpose: Test if normalization fixed 60% failure rate');
  console.log('Baseline: 40% success (2/5 medications found)');
  console.log('Target: >80% success (4+/5 medications found)');
  console.log('='.repeat(80));
  console.log('');

  const results = [];
  let passCount = 0;
  let totalSimilarity = 0;

  for (const testCase of TEST_CASES) {
    console.log(`\nTesting: ${testCase.query}`);
    console.log(`Expected ingredient: ${testCase.expectedIngredient}`);
    console.log(`Baseline result: ${testCase.baselineResult}${testCase.baselinePosition ? ` (position #${testCase.baselinePosition})` : ''}`);

    // Generate embedding for query
    console.log('⏳ Generating query embedding...');
    const queryEmbedding = await generateQueryEmbedding(testCase.query);

    // Search using normalized embeddings (direct SQL for now)
    console.log('⏳ Searching with normalized embeddings...');
    const searchResults = await searchNormalizedEmbeddingsDirect(queryEmbedding, 20);

    // Find if expected ingredient is in results
    let foundPosition = -1;
    let foundSimilarity = 0;
    let foundCode = null;

    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      const displayLower = result.display_name.toLowerCase();
      const normalizedLower = result.normalized_embedding_text.toLowerCase();

      if (displayLower.includes(testCase.expectedIngredient.toLowerCase()) ||
          normalizedLower.includes(testCase.expectedIngredient.toLowerCase())) {
        foundPosition = i + 1;
        foundSimilarity = result.similarity_score;
        foundCode = result;
        break;
      }
    }

    const currentResult = foundPosition > 0 ? 'PASS' : 'FAIL';
    const improved = (testCase.baselineResult === 'FAIL' && currentResult === 'PASS');
    const regressed = (testCase.baselineResult === 'PASS' && currentResult === 'FAIL');

    if (currentResult === 'PASS') {
      passCount++;
      totalSimilarity += foundSimilarity;
    }

    console.log('');
    console.log(`Result: ${currentResult === 'PASS' ? '✅' : '❌'} ${currentResult}`);
    if (foundPosition > 0) {
      console.log(`  Position: #${foundPosition}`);
      console.log(`  Similarity: ${(foundSimilarity * 100).toFixed(1)}%`);
      console.log(`  Code: ${foundCode.code_value}`);
      console.log(`  Display: ${foundCode.display_name.substring(0, 80)}...`);
    } else {
      console.log(`  Not found in top 20 results`);
      if (searchResults.length > 0) {
        console.log(`  Top result: ${searchResults[0].display_name.substring(0, 60)}...`);
        console.log(`  Top similarity: ${(searchResults[0].similarity_score * 100).toFixed(1)}%`);
      }
    }

    if (improved) {
      console.log(`  🎉 IMPROVEMENT: Baseline FAIL → Now PASS`);
    } else if (regressed) {
      console.log(`  ⚠️ REGRESSION: Baseline PASS → Now FAIL`);
    }

    // Display full top 20 results
    console.log('\n  Top 20 Candidates:');
    console.log('  ' + '-'.repeat(76));
    searchResults.forEach((result, idx) => {
      const position = idx + 1;
      const similarity = (result.similarity_score * 100).toFixed(1);
      const isMatch = result.display_name.toLowerCase().includes(testCase.expectedIngredient.toLowerCase()) ||
                      result.normalized_embedding_text.toLowerCase().includes(testCase.expectedIngredient.toLowerCase());
      const marker = isMatch ? '✓' : ' ';
      const displayText = result.display_name.length > 55 ?
                         result.display_name.substring(0, 55) + '...' :
                         result.display_name;
      console.log(`  ${marker} #${position.toString().padStart(2)}: ${similarity.padStart(5)}% | ${displayText}`);
    });
    console.log('  ' + '-'.repeat(76));

    results.push({
      query: testCase.query,
      expectedIngredient: testCase.expectedIngredient,
      baselineResult: testCase.baselineResult,
      currentResult,
      foundPosition,
      foundSimilarity,
      improved,
      regressed
    });
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('VALIDATION TEST RESULTS');
  console.log('='.repeat(80));

  const successRate = (passCount / TEST_CASES.length) * 100;
  const avgSimilarity = passCount > 0 ? (totalSimilarity / passCount) * 100 : 0;
  const improvements = results.filter(r => r.improved).length;
  const regressions = results.filter(r => r.regressed).length;

  console.log(`\nSuccess Rate: ${passCount}/${TEST_CASES.length} (${successRate.toFixed(1)}%)`);
  console.log(`Baseline: 2/5 (40%)`);
  console.log(`Change: ${successRate >= 80 ? '✅' : '❌'} ${(successRate - 40).toFixed(1)} percentage points`);
  console.log(`\nAverage Similarity: ${avgSimilarity.toFixed(1)}% (for successful matches)`);
  console.log(`Improvements: ${improvements} medications (FAIL → PASS)`);
  console.log(`Regressions: ${regressions} medications (PASS → FAIL)`);

  console.log('\nDetailed Results:');
  results.forEach(r => {
    const status = r.currentResult === 'PASS' ? '✅' : '❌';
    const change = r.improved ? ' [IMPROVED]' : r.regressed ? ' [REGRESSED]' : '';
    console.log(`  ${status} ${r.query.padEnd(25)} ${r.currentResult}${r.foundPosition ? ` #${r.foundPosition}` : ''} (${(r.foundSimilarity * 100).toFixed(1)}%)${change}`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('VALIDATION OUTCOME');
  console.log('='.repeat(80));

  if (successRate >= 80) {
    console.log('✅ VALIDATION PASSED');
    console.log('   Normalization approach successfully fixed embedding mismatch');
    console.log('   Ready for:');
    console.log('   1. IVFFLAT index creation');
    console.log('   2. Extended validation (50-100 medications)');
    console.log('   3. Production deployment');
  } else {
    console.log('❌ VALIDATION FAILED');
    console.log('   Normalization did not achieve target success rate');
    console.log('   Next steps:');
    console.log('   1. Investigate why normalization did not help');
    console.log('   2. Consider combined retrieval (vector + lexical)');
    console.log('   3. Adjust normalization strategy');
  }

  console.log('='.repeat(80));

  process.exit(successRate >= 80 ? 0 : 1);
}

runValidationTest()
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
