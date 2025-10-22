#!/usr/bin/env tsx

/**
 * Mini Experiment: US vs Australian Brand Names
 *
 * Tests if SapBERT performs better with US brand names vs Australian brand names.
 *
 * Hypothesis: SapBERT was trained on PubMed (predominantly US medical literature),
 * so it may recognize US brand names better than Australian-specific brands.
 */

import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY!;
const SAPBERT_MODEL = 'cambridgeltl/SapBERT-from-PubMedBERT-fulltext';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface BrandTest {
  query: string;
  region: 'AUS' | 'US' | 'Global';
  expected_ingredient: string;
  expected_pbs_display: string;
  notes: string;
}

// Test cases: US vs AUS brand names
const brandTests: BrandTest[] = [
  // Original failed Australian brands
  {
    query: 'Panadol Osteo',
    region: 'AUS',
    expected_ingredient: 'Paracetamol',
    expected_pbs_display: 'Paracetamol Tablet 665 mg (modified release)',
    notes: 'Australian-specific brand (GSK Australia), failed in Experiment 4'
  },
  {
    query: 'Ventolin',
    region: 'Global',
    expected_ingredient: 'Salbutamol',
    expected_pbs_display: 'Salbutamol Pressurised inhalation 100 micrograms',
    notes: 'Global GSK brand (US/UK/AUS), failed without dose in Experiment 4'
  },

  // US equivalent brand names
  {
    query: 'Tylenol Arthritis',
    region: 'US',
    expected_ingredient: 'Paracetamol',
    expected_pbs_display: 'Paracetamol Tablet 665 mg (modified release)',
    notes: 'US equivalent to Panadol Osteo (McNeil/J&J US brand)'
  },
  {
    query: 'Tylenol Extended Release',
    region: 'US',
    expected_ingredient: 'Paracetamol',
    expected_pbs_display: 'Paracetamol Tablet 665 mg (modified release)',
    notes: 'Alternative US brand name for extended release paracetamol'
  },
  {
    query: 'Proventil',
    region: 'US',
    expected_ingredient: 'Salbutamol',
    expected_pbs_display: 'Salbutamol Pressurised inhalation 100 micrograms',
    notes: 'US brand name for salbutamol inhaler (Merck)'
  },
  {
    query: 'ProAir',
    region: 'US',
    expected_ingredient: 'Salbutamol',
    expected_pbs_display: 'Salbutamol Pressurised inhalation 100 micrograms',
    notes: 'US brand name for salbutamol inhaler (Teva)'
  },

  // Additional Australian brands for comparison
  {
    query: 'Asmol',
    region: 'AUS',
    expected_ingredient: 'Salbutamol',
    expected_pbs_display: 'Salbutamol Pressurised inhalation 100 micrograms',
    notes: 'Australian brand name for salbutamol (Alphapharm)'
  },
  {
    query: 'Panamax',
    region: 'AUS',
    expected_ingredient: 'Paracetamol',
    expected_pbs_display: 'Paracetamol Tablet 500 mg',
    notes: 'Australian brand name for paracetamol (Sanofi Australia)'
  },

  // US brands for same ingredient
  {
    query: 'Tylenol',
    region: 'US',
    expected_ingredient: 'Paracetamol',
    expected_pbs_display: 'Paracetamol Tablet 500 mg',
    notes: 'US brand name for paracetamol (acetaminophen in US)'
  }
];

async function generateSapBERTEmbedding(text: string): Promise<number[]> {
  const url = `https://api-inference.huggingface.co/models/${SAPBERT_MODEL}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: text }),
  });

  if (!response.ok) {
    throw new Error(`HuggingFace API error: ${response.status}`);
  }

  const embedding = await response.json();
  return Array.isArray(embedding[0]) ? embedding[0] : embedding;
}

async function searchTopResults(queryEmbedding: number[], limit: number = 5) {
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const { data, error } = await supabase.rpc('search_sapbert_codes', {
    query_embedding: embeddingStr,
    p_code_system: 'pbs',
    p_limit: limit
  });

  if (error) throw new Error(`Database error: ${error.message}`);

  return data;
}

async function testBrand(test: BrandTest) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`QUERY: "${test.query}" [${test.region}]`);
  console.log(`Expected: ${test.expected_ingredient} → ${test.expected_pbs_display}`);
  console.log(`Notes: ${test.notes}`);
  console.log(`${'='.repeat(80)}`);

  const embedding = await generateSapBERTEmbedding(test.query);
  const results = await searchTopResults(embedding, 5);

  console.log(`\nTOP-5 RESULTS:\n`);
  results.forEach((result: any, index: number) => {
    const percentage = (result.similarity_score * 100).toFixed(1);
    const isCorrectIngredient = result.display_name.toLowerCase().includes(test.expected_ingredient.toLowerCase());
    const marker = isCorrectIngredient ? '✓' : '✗';
    console.log(`#${index + 1}: ${result.display_name}`);
    console.log(`    Similarity: ${percentage}% ${marker}`);
  });

  // Check if expected ingredient appears in top-5
  const hasCorrectIngredient = results.some((r: any) =>
    r.display_name.toLowerCase().includes(test.expected_ingredient.toLowerCase())
  );

  const topScore = (results[0].similarity_score * 100).toFixed(1);

  return {
    query: test.query,
    region: test.region,
    top_score: parseFloat(topScore),
    correct_ingredient_in_top5: hasCorrectIngredient,
    top_result: results[0].display_name
  };
}

async function main() {
  console.log('================================================================================');
  console.log('MINI EXPERIMENT: US vs AUSTRALIAN BRAND NAMES');
  console.log('================================================================================');
  console.log('Hypothesis: SapBERT recognizes US brands better than AUS brands (PubMed bias)');
  console.log('Testing: 9 brand name queries (3 AUS, 5 US, 1 Global)');
  console.log('================================================================================\n');

  const results = [];

  for (const test of brandTests) {
    try {
      const result = await testBrand(test);
      results.push(result);
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Error testing ${test.query}:`, error);
    }
  }

  // Analysis
  console.log('\n\n================================================================================');
  console.log('ANALYSIS: US vs AUS Brand Name Performance');
  console.log('================================================================================\n');

  const ausBrands = results.filter(r => r.region === 'AUS');
  const usBrands = results.filter(r => r.region === 'US');
  const globalBrands = results.filter(r => r.region === 'Global');

  const ausSuccess = ausBrands.filter(r => r.correct_ingredient_in_top5).length;
  const usSuccess = usBrands.filter(r => r.correct_ingredient_in_top5).length;
  const globalSuccess = globalBrands.filter(r => r.correct_ingredient_in_top5).length;

  const ausAvgScore = ausBrands.reduce((sum, r) => sum + r.top_score, 0) / ausBrands.length;
  const usAvgScore = usBrands.reduce((sum, r) => sum + r.top_score, 0) / usBrands.length;

  console.log('AUSTRALIAN BRANDS:');
  console.log(`  Success Rate: ${ausSuccess}/${ausBrands.length} (${(ausSuccess/ausBrands.length*100).toFixed(1)}%)`);
  console.log(`  Avg Top Score: ${ausAvgScore.toFixed(1)}%`);
  ausBrands.forEach(r => {
    console.log(`    - ${r.query}: ${r.top_score}% ${r.correct_ingredient_in_top5 ? '✓' : '✗'}`);
  });

  console.log('\nUS BRANDS:');
  console.log(`  Success Rate: ${usSuccess}/${usBrands.length} (${(usSuccess/usBrands.length*100).toFixed(1)}%)`);
  console.log(`  Avg Top Score: ${usAvgScore.toFixed(1)}%`);
  usBrands.forEach(r => {
    console.log(`    - ${r.query}: ${r.top_score}% ${r.correct_ingredient_in_top5 ? '✓' : '✗'}`);
  });

  console.log('\nGLOBAL BRANDS:');
  console.log(`  Success Rate: ${globalSuccess}/${globalBrands.length}`);
  globalBrands.forEach(r => {
    console.log(`    - ${r.query}: ${r.top_score}% ${r.correct_ingredient_in_top5 ? '✓' : '✗'}`);
  });

  console.log('\n================================================================================');
  console.log('CONCLUSION:');
  console.log('================================================================================');

  if (usAvgScore > ausAvgScore) {
    const diff = (usAvgScore - ausAvgScore).toFixed(1);
    console.log(`✓ HYPOTHESIS CONFIRMED: US brands score ${diff}% higher on average`);
    console.log(`  This suggests SapBERT has stronger US brand recognition (PubMed training bias)`);
  } else {
    const diff = (ausAvgScore - usAvgScore).toFixed(1);
    console.log(`✗ HYPOTHESIS REJECTED: AUS brands score ${diff}% higher or equal`);
    console.log(`  Brand recognition appears region-independent or insufficient training data`);
  }

  console.log('\n================================================================================\n');
}

main().catch(console.error);
