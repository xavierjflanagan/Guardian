#!/usr/bin/env tsx

/**
 * Experiment 5 - Phase 2: OpenAI Baseline Test
 *
 * Tests pure OpenAI vector search (current strategy) against 35 procedure entities.
 * Measures Top-1, Top-5, Top-20 accuracy.
 *
 * Success criteria: Top-20 accuracy ≥90% = OpenAI sufficient, keep simple vector search
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

// Load environment variables from .env.production
config({ path: path.join(process.cwd(), '.env.production') });

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Entity {
  id: number;
  entity_text: string;
  category: string;
  subcategory: string;
  notes: string;
  formatting_test?: string;
}

interface TestData {
  metadata: any;
  entities: Entity[];
}

interface SearchResult {
  code_value: string;
  display_name: string;
  similarity_score: number;
}

async function generateOpenAIEmbedding(text: string): Promise<number[]> {
  const url = 'https://api.openai.com/v1/embeddings';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function searchMBSCodes(queryEmbedding: number[], limit: number = 20): Promise<SearchResult[]> {
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const { data, error } = await supabase.rpc('search_regional_codes', {
    query_embedding: embeddingStr,
    entity_type_filter: 'procedure',
    country_code_filter: 'AUS',
    min_similarity: 0.0,
    max_results: limit
  });

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  // Filter for MBS codes only and map to expected format
  const mbsResults = (data || [])
    .filter((r: any) => r.code_system === 'mbs')
    .map((r: any) => ({
      code_value: r.code_value,
      display_name: r.display_name,
      similarity_score: r.similarity_score
    }));

  return mbsResults;
}

async function testEntity(entity: Entity) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`ENTITY ${entity.id}: "${entity.entity_text}"`);
  console.log(`Category: ${entity.category} | Subcategory: ${entity.subcategory}`);
  if (entity.formatting_test) {
    console.log(`Formatting Test: ${entity.formatting_test}`);
  }
  console.log(`${'='.repeat(80)}`);

  // Generate OpenAI embedding
  console.log('Generating OpenAI embedding...');
  const embedding = await generateOpenAIEmbedding(entity.entity_text);
  console.log(`✓ Embedding generated (${embedding.length} dimensions)`);

  // Search MBS codes
  console.log('Searching MBS codes (Top-20)...');
  const results = await searchMBSCodes(embedding, 20);
  console.log(`✓ Found ${results.length} results\n`);

  // Display top-5
  console.log('TOP-5 RESULTS:');
  results.slice(0, 5).forEach((result, index) => {
    const percentage = (result.similarity_score * 100).toFixed(1);
    const displayTruncated = result.display_name.substring(0, 100);
    console.log(`#${index + 1}: ${result.code_value} (${percentage}%)`);
    console.log(`    ${displayTruncated}${result.display_name.length > 100 ? '...' : ''}`);
  });

  const topScore = (results[0].similarity_score * 100).toFixed(1);

  return {
    entity_id: entity.id,
    entity_text: entity.entity_text,
    category: entity.category,
    subcategory: entity.subcategory,
    formatting_test: entity.formatting_test,
    top_score: parseFloat(topScore),
    top_20_results: results,
    timestamp: new Date().toISOString()
  };
}

async function main() {
  console.log('================================================================================');
  console.log('EXPERIMENT 5 - PHASE 2: OpenAI Baseline Test');
  console.log('================================================================================');
  console.log('Testing: Pure OpenAI text-embedding-3-small vector search');
  console.log('Dataset: 35 realistic procedure entities');
  console.log('Metric: Top-1, Top-5, Top-20 accuracy');
  console.log('Success Criteria: Top-20 ≥90% = OpenAI sufficient');
  console.log('================================================================================\n');

  // Load test data
  const testDataPath = path.join(__dirname, '../test-data/realistic-procedure-entities.json');
  const testData: TestData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));

  console.log(`Loaded ${testData.entities.length} test entities\n`);

  const results = [];

  for (const entity of testData.entities) {
    try {
      const result = await testEntity(entity);
      results.push(result);

      // Rate limit (OpenAI: 3 requests/minute for free tier)
      console.log('\nWaiting 1 second before next entity...\n');
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error testing entity ${entity.id}:`, error);
      results.push({
        entity_id: entity.id,
        entity_text: entity.entity_text,
        error: String(error),
        timestamp: new Date().toISOString()
      });
    }
  }

  // Save results
  const outputPath = path.join(__dirname, '../results/openai-baseline-results.json');

  // Create results directory if it doesn't exist
  const resultsDir = path.dirname(outputPath);
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify({
    experiment: 'Experiment 5 - Phase 2',
    test_type: 'OpenAI Baseline',
    model: 'text-embedding-3-small',
    total_entities: testData.entities.length,
    completed_at: new Date().toISOString(),
    results: results
  }, null, 2));

  console.log('\n\n================================================================================');
  console.log('SUMMARY');
  console.log('================================================================================\n');

  const successful = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error).length;

  console.log(`Completed: ${successful}/${testData.entities.length}`);
  console.log(`Failed: ${failed}/${testData.entities.length}`);
  console.log(`\nResults saved to: ${outputPath}`);
  console.log('\n================================================================================');
  console.log('NEXT STEPS');
  console.log('================================================================================\n');
  console.log('1. Review results to identify correct MBS codes (ground truth)');
  console.log('2. Calculate Top-1, Top-5, Top-20 accuracy');
  console.log('3. Analyze failure patterns');
  console.log('4. Decide: Keep OpenAI (≥90%) or test alternatives (<90%)');
  console.log('\n================================================================================\n');
}

main().catch(console.error);
