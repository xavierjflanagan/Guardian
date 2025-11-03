/**
 * LOINC Vector Search Test Script
 *
 * Purpose: Test semantic search quality of LOINC embeddings
 * - Generates query embeddings using OpenAI
 * - Executes vector similarity search against 102,891 LOINC codes
 * - Calculates top-1, top-5, top-10 accuracy metrics
 * - Analyzes entity type precision
 *
 * NO SHORTCUTS - This script performs actual database queries
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

interface GroundTruth {
  experiment: string;
  created: string;
  total_entities: number;
  total_queries: number;
  entities: Array<{
    id: number;
    entity_text: string;
    category: string;
    search_variants: Array<{
      variant_type: string;
      query: string;
      expected_entity_type: string;
    }>;
    ground_truth_matches: {
      perfect: string[];
      good: string[];
      acceptable: string[];
    };
    rationale: {
      perfect: string;
      good: string;
      acceptable: string;
    };
  }>;
}

interface SearchResult {
  entityId: number;
  entityText: string;
  variantType: string;
  query: string;
  expectedEntityType: string;
  results: Array<{
    rank: number;
    code_value: string;
    display_name: string;
    entity_type: string;
    similarity: number;
  }>;
  topKAccuracy: {
    top1Perfect: boolean;
    top5Perfect: boolean;
    top10Perfect: boolean;
    top1Any: boolean;
    top5Any: boolean;
    top10Any: boolean;
  };
  entityTypePrecision: {
    top5Correct: number;
    top10Correct: number;
  };
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

  return response.data[0].embedding;
}

/**
 * Execute vector similarity search against LOINC codes
 * CRITICAL: Must query actual database, not mock data
 */
async function searchLOINC(queryEmbedding: number[], limit: number = 10): Promise<any[]> {
  // Use search_regional_codes RPC function
  // This function filters by code_system='loinc' implicitly via entity_type_filter
  // Returns results ordered by cosine similarity

  const { data, error } = await supabase.rpc('search_regional_codes', {
    query_embedding: queryEmbedding,
    entity_type_filter: null, // No filter, accept all LOINC entity types
    country_code_filter: 'AUS',
    max_results: limit,
    min_similarity: 0.0 // No threshold, return top K regardless
  });

  if (error) {
    console.error(`   [ERROR] Database query failed: ${error.message}`);
    throw error;
  }

  // Filter to only LOINC codes (in case RPC returns other code systems)
  const loincOnly = (data || []).filter((r: any) => r.code_system === 'loinc');

  return loincOnly.slice(0, limit);
}

/**
 * Calculate accuracy metrics for a single query
 */
function calculateAccuracy(
  results: any[],
  groundTruth: { perfect: string[]; good: string[]; acceptable: string[] }
): {
  top1Perfect: boolean;
  top5Perfect: boolean;
  top10Perfect: boolean;
  top1Any: boolean;
  top5Any: boolean;
  top10Any: boolean;
} {
  const allMatches = [
    ...groundTruth.perfect,
    ...groundTruth.good,
    ...groundTruth.acceptable
  ];

  const top1Codes = results.slice(0, 1).map(r => r.code_value);
  const top5Codes = results.slice(0, 5).map(r => r.code_value);
  const top10Codes = results.slice(0, 10).map(r => r.code_value);

  return {
    top1Perfect: top1Codes.some(code => groundTruth.perfect.includes(code)),
    top5Perfect: top5Codes.some(code => groundTruth.perfect.includes(code)),
    top10Perfect: top10Codes.some(code => groundTruth.perfect.includes(code)),
    top1Any: top1Codes.some(code => allMatches.includes(code)),
    top5Any: top5Codes.some(code => allMatches.includes(code)),
    top10Any: top10Codes.some(code => allMatches.includes(code)),
  };
}

/**
 * Calculate entity type precision (are results the expected entity type?)
 */
function calculateEntityTypePrecision(
  results: any[],
  expectedEntityType: string
): { top5Correct: number; top10Correct: number } {
  const top5 = results.slice(0, 5);
  const top10 = results.slice(0, 10);

  const top5Correct = top5.filter(r => r.entity_type === expectedEntityType).length;
  const top10Correct = top10.filter(r => r.entity_type === expectedEntityType).length;

  return {
    top5Correct,
    top10Correct
  };
}

async function main() {
  console.log('LOINC Vector Search Test');
  console.log('========================\n');
  console.log('Purpose: Validate semantic search quality of LOINC embeddings');
  console.log('Method: Generate query embeddings and execute actual vector searches\n');

  // Load ground truth
  const groundTruthPath = path.join(
    __dirname,
    '../test-data/ground-truth.json'
  );

  if (!fs.existsSync(groundTruthPath)) {
    console.error(`[ERROR] Ground truth file not found: ${groundTruthPath}`);
    process.exit(1);
  }

  const groundTruth: GroundTruth = await fs.readJSON(groundTruthPath);
  console.log(`[OK] Loaded ground truth: ${groundTruth.total_entities} entities, ${groundTruth.total_queries} queries\n`);

  // Test execution
  const results: SearchResult[] = [];
  let queryCount = 0;

  for (const entity of groundTruth.entities) {
    console.log(`\nEntity ${entity.id}: ${entity.entity_text}`);
    console.log('─'.repeat(60));

    for (const variant of entity.search_variants) {
      queryCount++;
      console.log(`\nQuery ${queryCount}/${groundTruth.total_queries} (${variant.variant_type}): "${variant.query}"`);

      try {
        // Generate embedding for query
        const queryEmbedding = await generateQueryEmbedding(variant.query);

        // Execute vector search
        console.log('   Searching LOINC database...');
        const searchResults = await searchLOINC(queryEmbedding, 10);

        // Calculate accuracy
        const accuracy = calculateAccuracy(searchResults, entity.ground_truth_matches);
        const entityTypePrecision = calculateEntityTypePrecision(
          searchResults,
          variant.expected_entity_type
        );

        // Display top 3 results
        console.log('   Top 3 results:');
        searchResults.slice(0, 3).forEach((r, i) => {
          const isMatch = [
            ...entity.ground_truth_matches.perfect,
            ...entity.ground_truth_matches.good,
            ...entity.ground_truth_matches.acceptable
          ].includes(r.code_value);
          const matchSymbol = isMatch ? '✓' : '✗';
          console.log(`     ${i + 1}. ${matchSymbol} ${r.code_value}: ${r.display_name.substring(0, 60)}...`);
        });

        console.log(`   Accuracy: Top-1=${accuracy.top1Perfect}, Top-5=${accuracy.top5Perfect}, Top-10=${accuracy.top10Perfect}`);

        // Store results
        results.push({
          entityId: entity.id,
          entityText: entity.entity_text,
          variantType: variant.variant_type,
          query: variant.query,
          expectedEntityType: variant.expected_entity_type,
          results: searchResults.map((r, i) => ({
            rank: i + 1,
            code_value: r.code_value,
            display_name: r.display_name,
            entity_type: r.entity_type,
            code_system: r.code_system,
            similarity: r.similarity_score || 0  // FIXED: Use similarity_score from RPC
          })),
          topKAccuracy: accuracy,
          entityTypePrecision
        });

        // Rate limiting (100ms delay)
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error: any) {
        console.error(`   [ERROR] Query failed: ${error.message}`);
        // Continue with next query
      }
    }
  }

  // Save raw results
  const resultsPath = path.join(__dirname, '../results/search-results-raw.json');
  await fs.ensureDir(path.dirname(resultsPath));
  await fs.writeJSON(resultsPath, results, { spaces: 2 });
  console.log(`\n[OK] Raw results saved: ${resultsPath}`);

  // Calculate aggregate metrics
  const metrics = {
    totalQueries: results.length,
    top1PerfectAccuracy: results.filter(r => r.topKAccuracy.top1Perfect).length / results.length,
    top5PerfectAccuracy: results.filter(r => r.topKAccuracy.top5Perfect).length / results.length,
    top10PerfectAccuracy: results.filter(r => r.topKAccuracy.top10Perfect).length / results.length,
    top1AnyAccuracy: results.filter(r => r.topKAccuracy.top1Any).length / results.length,
    top5AnyAccuracy: results.filter(r => r.topKAccuracy.top5Any).length / results.length,
    top10AnyAccuracy: results.filter(r => r.topKAccuracy.top10Any).length / results.length,
    byVariantType: {
      clinical: {
        count: results.filter(r => r.variantType === 'clinical').length,
        top10PerfectAccuracy: results.filter(r => r.variantType === 'clinical' && r.topKAccuracy.top10Perfect).length / results.filter(r => r.variantType === 'clinical').length
      },
      layperson: {
        count: results.filter(r => r.variantType === 'layperson').length,
        top10PerfectAccuracy: results.filter(r => r.variantType === 'layperson' && r.topKAccuracy.top10Perfect).length / results.filter(r => r.variantType === 'layperson').length
      },
      abbreviation: {
        count: results.filter(r => r.variantType === 'abbreviation').length,
        top10PerfectAccuracy: results.filter(r => r.variantType === 'abbreviation' && r.topKAccuracy.top10Perfect).length / results.filter(r => r.variantType === 'abbreviation').length
      }
    }
  };

  const metricsPath = path.join(__dirname, '../results/accuracy-metrics.json');
  await fs.writeJSON(metricsPath, metrics, { spaces: 2 });
  console.log(`[OK] Metrics saved: ${metricsPath}`);

  // Display summary
  console.log('\n' + '='.repeat(60));
  console.log('EXPERIMENT RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total queries executed:         ${metrics.totalQueries}`);
  console.log('\nAccuracy (Perfect match only):');
  console.log(`  Top-1 accuracy:               ${(metrics.top1PerfectAccuracy * 100).toFixed(1)}%`);
  console.log(`  Top-5 accuracy:               ${(metrics.top5PerfectAccuracy * 100).toFixed(1)}%`);
  console.log(`  Top-10 accuracy:              ${(metrics.top10PerfectAccuracy * 100).toFixed(1)}%`);
  console.log('\nAccuracy (Any acceptable match):');
  console.log(`  Top-1 accuracy:               ${(metrics.top1AnyAccuracy * 100).toFixed(1)}%`);
  console.log(`  Top-5 accuracy:               ${(metrics.top5AnyAccuracy * 100).toFixed(1)}%`);
  console.log(`  Top-10 accuracy:              ${(metrics.top10AnyAccuracy * 100).toFixed(1)}%`);
  console.log('\nBy query type (Top-10 perfect):');
  console.log(`  Clinical terms:               ${(metrics.byVariantType.clinical.top10PerfectAccuracy * 100).toFixed(1)}%`);
  console.log(`  Layperson terms:              ${(metrics.byVariantType.layperson.top10PerfectAccuracy * 100).toFixed(1)}%`);
  console.log(`  Abbreviations:                ${(metrics.byVariantType.abbreviation.top10PerfectAccuracy * 100).toFixed(1)}%`);
  console.log('='.repeat(60));

  // Success criteria check
  console.log('\nSuccess Criteria:');
  console.log(`  Target: Top-10 accuracy ≥85%`);
  console.log(`  Actual: ${(metrics.top10PerfectAccuracy * 100).toFixed(1)}%`);

  if (metrics.top10PerfectAccuracy >= 0.85) {
    console.log('  Result: ✓ PASS');
  } else {
    console.log('  Result: ✗ FAIL');
  }
}

main().catch(console.error);
