#!/usr/bin/env tsx

/**
 * Experiment 3: Pure SapBERT Top-K Validation
 *
 * Tests if pure SapBERT vector search achieves >95% top-20 accuracy,
 * eliminating the need for hybrid lexical+vector approach.
 *
 * Usage: npx tsx validate-pure-sapbert.ts
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Types
interface TestEntity {
  entity_name: string;
  code_system: string;
  code_value: string;
  display_name: string;
  entity_type: string;
  group: string;
}

interface TestData {
  medications: TestEntity[];
  procedures?: TestEntity[];
  conditions?: TestEntity[];
}

interface SearchResult {
  code_value: string;
  display_name: string;
  similarity_score: number;
}

interface ValidationResult {
  query: string;
  expected_code: string;
  expected_display: string;
  group: string;
  top20_results: SearchResult[];
  correct_rank: number | null;
  in_top1: boolean;
  in_top5: boolean;
  in_top10: boolean;
  in_top20: boolean;
  top1_similarity: number;
  correct_similarity: number | null;
}

interface Summary {
  total_queries: number;
  top1_accuracy: number;
  top5_accuracy: number;
  top10_accuracy: number;
  top20_accuracy: number;
  top1_count: number;
  top5_count: number;
  top10_count: number;
  top20_count: number;
}

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY!;
const SAPBERT_MODEL = 'cambridgeltl/SapBERT-from-PubMedBERT-fulltext';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Generate SapBERT embedding via HuggingFace API
 */
async function generateSapBERTEmbedding(text: string, retries = 3): Promise<number[]> {
  const url = `https://api-inference.huggingface.co/models/${SAPBERT_MODEL}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: text }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HuggingFace API error (${response.status}): ${errorText}`);
      }

      const embedding = await response.json();

      if (Array.isArray(embedding) && embedding.length === 768) {
        return embedding;
      } else if (Array.isArray(embedding) && Array.isArray(embedding[0])) {
        return embedding[0];
      } else {
        throw new Error(`Unexpected embedding format: ${JSON.stringify(embedding).slice(0, 100)}`);
      }
    } catch (error) {
      console.error(`Attempt ${attempt + 1}/${retries} failed:`, error);
      if (attempt === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }

  throw new Error('Failed to generate embedding after retries');
}

/**
 * Search for top-20 similar codes using SapBERT embedding
 */
async function searchSimilarCodes(
  queryEmbedding: number[],
  codeSystem: string = 'pbs',
  limit: number = 20
): Promise<SearchResult[]> {
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const { data, error } = await supabase.rpc('search_sapbert_codes', {
    query_embedding: embeddingStr,
    p_code_system: codeSystem,
    p_limit: limit
  });

  if (error) {
    throw new Error(`Database search error: ${error.message}`);
  }

  return data.map((row: any) => ({
    code_value: row.code_value,
    display_name: row.display_name,
    similarity_score: row.similarity_score
  }));
}

/**
 * Validate a single test entity
 */
async function validateEntity(entity: TestEntity): Promise<ValidationResult> {
  console.log(`\nValidating: ${entity.entity_name}`);

  // Generate embedding for query
  const queryEmbedding = await generateSapBERTEmbedding(entity.entity_name);

  // Search for similar codes
  const top20Results = await searchSimilarCodes(queryEmbedding, entity.code_system, 20);

  // Find rank of expected code
  const correctRank = top20Results.findIndex(r => r.code_value === entity.code_value);
  const actualRank = correctRank === -1 ? null : correctRank + 1;

  const result: ValidationResult = {
    query: entity.entity_name,
    expected_code: entity.code_value,
    expected_display: entity.display_name,
    group: entity.group,
    top20_results: top20Results,
    correct_rank: actualRank,
    in_top1: actualRank === 1,
    in_top5: actualRank !== null && actualRank <= 5,
    in_top10: actualRank !== null && actualRank <= 10,
    in_top20: actualRank !== null && actualRank <= 20,
    top1_similarity: top20Results[0]?.similarity_score || 0,
    correct_similarity: correctRank !== -1 ? top20Results[correctRank].similarity_score : null
  };

  console.log(`  Rank: ${actualRank || 'NOT IN TOP 20'}`);
  console.log(`  Top-1: ${top20Results[0].display_name} (${(top20Results[0].similarity_score * 100).toFixed(1)}%)`);
  if (actualRank && actualRank > 1) {
    console.log(`  Correct: ${entity.display_name} (${((result.correct_similarity || 0) * 100).toFixed(1)}%)`);
  }

  return result;
}

/**
 * Main execution
 */
async function main() {
  console.log('================================================================================');
  console.log('EXPERIMENT 3: PURE SAPBERT TOP-K VALIDATION');
  console.log('================================================================================');
  console.log('Model: cambridgeltl/SapBERT-from-PubMedBERT-fulltext');
  console.log('Test set: 40 validated medications from Experiment 2');
  console.log('Measuring: top-1, top-5, top-10, top-20 accuracy');
  console.log('================================================================================\n');

  // Check if search RPC exists, if not create it
  console.log('Checking database function...');
  await ensureSearchFunction();

  // Load test data
  const testDataPath = path.join(__dirname, '../experiment-2/test-data/final-40-entities.json');
  const testData: TestData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));

  const medications = testData.medications;
  console.log(`Loaded ${medications.length} test medications\n`);

  // Validate each entity
  const results: ValidationResult[] = [];

  for (const medication of medications) {
    try {
      const result = await validateEntity(medication);
      results.push(result);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`ERROR validating ${medication.entity_name}:`, error);
    }
  }

  // Calculate summary statistics
  const summary: Summary = {
    total_queries: results.length,
    top1_count: results.filter(r => r.in_top1).length,
    top5_count: results.filter(r => r.in_top5).length,
    top10_count: results.filter(r => r.in_top10).length,
    top20_count: results.filter(r => r.in_top20).length,
    top1_accuracy: 0,
    top5_accuracy: 0,
    top10_accuracy: 0,
    top20_accuracy: 0,
  };

  summary.top1_accuracy = summary.top1_count / summary.total_queries;
  summary.top5_accuracy = summary.top5_count / summary.total_queries;
  summary.top10_accuracy = summary.top10_count / summary.total_queries;
  summary.top20_accuracy = summary.top20_count / summary.total_queries;

  // Print summary
  console.log('\n================================================================================');
  console.log('RESULTS SUMMARY');
  console.log('================================================================================');
  console.log(`Total queries: ${summary.total_queries}`);
  console.log(`Top-1 accuracy:  ${(summary.top1_accuracy * 100).toFixed(1)}% (${summary.top1_count}/${summary.total_queries})`);
  console.log(`Top-5 accuracy:  ${(summary.top5_accuracy * 100).toFixed(1)}% (${summary.top5_count}/${summary.total_queries})`);
  console.log(`Top-10 accuracy: ${(summary.top10_accuracy * 100).toFixed(1)}% (${summary.top10_count}/${summary.total_queries})`);
  console.log(`Top-20 accuracy: ${(summary.top20_accuracy * 100).toFixed(1)}% (${summary.top20_count}/${summary.total_queries})`);
  console.log('================================================================================\n');

  // Decision
  if (summary.top20_accuracy >= 0.95) {
    console.log('✓ SUCCESS: Top-20 accuracy ≥95% - Pure SapBERT is sufficient!');
    console.log('  Recommendation: Skip hybrid retrieval, use pure vector search');
  } else if (summary.top20_accuracy >= 0.90) {
    console.log('⚠ BORDERLINE: Top-20 accuracy 90-95% - Expand testing');
    console.log('  Recommendation: Test with 100 medications before deciding');
  } else {
    console.log('✗ INSUFFICIENT: Top-20 accuracy <90% - Hybrid retrieval needed');
    console.log('  Recommendation: Implement lexical+vector hybrid approach');
  }

  // Analyze failures
  const failures = results.filter(r => !r.in_top20);
  if (failures.length > 0) {
    console.log(`\n\nTop-20 Failures (${failures.length}):`);
    failures.forEach(f => {
      console.log(`  - ${f.query}: Expected ${f.expected_display}`);
      console.log(`    Top-1 result: ${f.top20_results[0].display_name} (${(f.top20_results[0].similarity_score * 100).toFixed(1)}%)`);
    });
  }

  // Save results
  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const outputPath = path.join(resultsDir, 'top-k-accuracy-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({ summary, results, failures }, null, 2));
  console.log(`\nDetailed results saved to: ${outputPath}`);
}

/**
 * Ensure the search RPC function exists
 */
async function ensureSearchFunction() {
  // Try to create the function (idempotent)
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE OR REPLACE FUNCTION search_sapbert_codes(
        query_embedding vector(768),
        p_code_system text DEFAULT 'pbs',
        p_limit int DEFAULT 20
      )
      RETURNS TABLE (
        code_value text,
        display_name text,
        similarity_score float
      )
      LANGUAGE sql
      STABLE
      AS $$
        SELECT
          code_value,
          display_name,
          1 - (sapbert_embedding <=> query_embedding) as similarity_score
        FROM regional_medical_codes
        WHERE code_system = p_code_system
          AND sapbert_embedding IS NOT NULL
        ORDER BY sapbert_embedding <=> query_embedding
        LIMIT p_limit;
      $$;
    `
  });

  if (error) {
    console.log('Note: Could not create search function (may already exist):', error.message);
  } else {
    console.log('✓ Search function ready\n');
  }
}

// Run
main().catch(console.error);
