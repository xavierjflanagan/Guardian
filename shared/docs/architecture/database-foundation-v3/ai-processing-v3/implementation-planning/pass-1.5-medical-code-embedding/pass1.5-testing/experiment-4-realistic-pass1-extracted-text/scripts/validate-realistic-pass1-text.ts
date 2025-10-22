#!/usr/bin/env tsx

/**
 * Experiment 4: Realistic Pass 1 Extracted Text - EXPLORATORY DISCOVERY
 *
 * Tests SapBERT with realistic medication text as Pass 1 would extract it.
 * Outputs top-20 results with similarity scores for manual review.
 * NO automated pass/fail - pure discovery.
 *
 * Usage: npx tsx validate-realistic-pass1-text.ts
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Types
interface TestMedication {
  entity_name: string;
  code_system: string;
  reference_code?: string;
  reference_display?: string;
  group: string;
  source: string;
  brand_generic_pair?: string;
}

interface TestData {
  medications: TestMedication[];
}

interface SearchResult {
  code_value: string;
  display_name: string;
  similarity_score: number;
}

interface ExploratoryResult {
  query: string;
  group: string;
  source: string;
  reference_display?: string;
  top20_results: SearchResult[];
  brand_generic_pair?: string;
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
 * Process a single medication query
 */
async function processMedication(medication: TestMedication): Promise<ExploratoryResult> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`QUERY: "${medication.entity_name}"`);
  console.log(`Group: ${medication.group} | Source: ${medication.source}`);
  if (medication.reference_display) {
    console.log(`Reference: ${medication.reference_display}`);
  }
  if (medication.brand_generic_pair) {
    console.log(`Brand/Generic Pair: ${medication.brand_generic_pair}`);
  }
  console.log(`${'='.repeat(80)}`);

  // Generate embedding for query
  const queryEmbedding = await generateSapBERTEmbedding(medication.entity_name);

  // Search for similar codes
  const top20Results = await searchSimilarCodes(queryEmbedding, medication.code_system, 20);

  // Display results
  console.log(`\nTOP-20 RESULTS (sorted by similarity):\n`);
  top20Results.forEach((result, index) => {
    const percentage = (result.similarity_score * 100).toFixed(1);
    const rank = `#${(index + 1).toString().padStart(2, ' ')}`;
    console.log(`${rank}: ${result.display_name}`);
    console.log(`     Similarity: ${percentage}% | Code: ${result.code_value}`);
  });

  return {
    query: medication.entity_name,
    group: medication.group,
    source: medication.source,
    reference_display: medication.reference_display,
    top20_results: top20Results,
    brand_generic_pair: medication.brand_generic_pair
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('================================================================================');
  console.log('EXPERIMENT 4: REALISTIC PASS 1 EXTRACTED TEXT - EXPLORATORY DISCOVERY');
  console.log('================================================================================');
  console.log('Model: cambridgeltl/SapBERT-from-PubMedBERT-fulltext');
  console.log('Test set: 15 realistic medications (10 generic + 5 brand names)');
  console.log('Approach: EXPLORATORY - no automated pass/fail, manual review only');
  console.log('Output: Top-20 results with similarity % for each query');
  console.log('================================================================================\n');

  // Load test data
  const testDataPath = path.join(__dirname, 'test-data/realistic-15-medications.json');
  const testData: TestData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));

  const medications = testData.medications;
  console.log(`Loaded ${medications.length} test medications\n`);

  // Process each medication
  const results: ExploratoryResult[] = [];

  for (const medication of medications) {
    try {
      const result = await processMedication(medication);
      results.push(result);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`\nERROR processing ${medication.entity_name}:`, error);
    }
  }

  // Save results
  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const outputPath = path.join(resultsDir, 'exploratory-discovery-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    metadata: {
      experiment: 'Experiment 4: Realistic Pass 1 Extracted Text',
      approach: 'Exploratory discovery - manual review required',
      total_queries: results.length,
      model: SAPBERT_MODEL,
      timestamp: new Date().toISOString()
    },
    results
  }, null, 2));

  console.log('\n\n================================================================================');
  console.log('EXPLORATORY DISCOVERY COMPLETE');
  console.log('================================================================================');
  console.log(`Total queries processed: ${results.length}`);
  console.log(`\nResults saved to: ${outputPath}`);
  console.log('\nMANUAL REVIEW REQUIRED:');
  console.log('1. Review top-20 results for each query');
  console.log('2. Evaluate match quality');
  console.log('3. Compare brand vs generic pair performance');
  console.log('4. Note patterns in similarity scores');
  console.log('5. Identify where pure SapBERT succeeds/fails');
  console.log('================================================================================\n');
}

// Run
main().catch(console.error);
