/**
 * Test: Does removing dosage improve semantic diversity?
 *
 * Hypothesis: The "500mg" signal dominates semantic similarity,
 * causing all 500mg drugs to cluster together regardless of ingredient.
 *
 * Test: Generate embeddings for INGREDIENT ONLY (no dose, no form)
 * and see if amoxicillin/dicloxacillin/cefalexin differentiate better.
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

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

function extractIngredient(displayName: string): string {
  // Remove everything after the first occurrence of dose pattern
  let ingredient = displayName;

  // Remove dose patterns (e.g., "500 mg", "2.5 g", "10 mg-20 mg")
  ingredient = ingredient.replace(/\d+(?:\.\d+)?\s*(?:mg|g|ml|mcg|micrograms?|milligrams?)(?:\s*-\s*\d+(?:\.\d+)?\s*(?:mg|g|ml|mcg|micrograms?|milligrams?))?/gi, '');

  // Remove form patterns
  ingredient = ingredient.replace(/\b(tablet|capsule|injection|syrup|cream|ointment|oral liquid|suppository|pessary|powder|solution|suspension)\b/gi, '');

  // Remove "containing", "with", etc.
  ingredient = ingredient.replace(/\b(containing|with)\b/gi, '');

  // Remove salt forms
  ingredient = ingredient.replace(/\(as [^)]+\)/gi, '');

  // Remove brand names in parentheses
  ingredient = ingredient.replace(/\([^)]+\)/g, '');

  // Clean up
  ingredient = ingredient.replace(/\s+/g, ' ').trim().toLowerCase();

  return ingredient;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS
  });
  return response.data[0].embedding;
}

function calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }

  return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

async function testIngredientOnly() {
  console.log('='.repeat(80));
  console.log('TEST: INGREDIENT-ONLY EMBEDDINGS');
  console.log('='.repeat(80));
  console.log('Hypothesis: Removing dosage improves semantic differentiation');
  console.log('='.repeat(80));
  console.log('');

  // Test medications (500mg antibiotics that currently cluster)
  const testDrugs = [
    'Amoxicillin Capsule 500 mg',
    'Dicloxacillin Capsule 500 mg (as sodium)',
    'Cefalexin Capsule 500 mg (as monohydrate)',
    'Flucloxacillin Capsule 500 mg (as sodium monohydrate)',
    'Paracetamol Tablet 500 mg',  // Control: different drug class
  ];

  console.log('Test Drugs:');
  testDrugs.forEach((drug, idx) => {
    const ingredient = extractIngredient(drug);
    console.log(`  ${idx + 1}. ${drug}`);
    console.log(`     → Ingredient: "${ingredient}"`);
  });
  console.log('');

  // Generate embeddings for FULL text (current approach)
  console.log('Generating embeddings for FULL text (current approach)...');
  const fullEmbeddings = await Promise.all(
    testDrugs.map(drug => generateEmbedding(drug.toLowerCase()))
  );

  // Generate embeddings for INGREDIENT ONLY (proposed approach)
  console.log('Generating embeddings for INGREDIENT ONLY (proposed approach)...');
  const ingredientEmbeddings = await Promise.all(
    testDrugs.map(drug => generateEmbedding(extractIngredient(drug)))
  );

  console.log('✓ All embeddings generated');
  console.log('');

  // Calculate similarity matrices
  console.log('='.repeat(80));
  console.log('SIMILARITY MATRIX - FULL TEXT (Current Approach)');
  console.log('='.repeat(80));
  console.log('');

  const fullMatrix: number[][] = [];
  for (let i = 0; i < testDrugs.length; i++) {
    fullMatrix[i] = [];
    for (let j = 0; j < testDrugs.length; j++) {
      fullMatrix[i][j] = calculateCosineSimilarity(fullEmbeddings[i], fullEmbeddings[j]);
    }
  }

  // Print full matrix
  const drugLabels = ['Amox-500', 'Dicl-500', 'Cefa-500', 'Fluc-500', 'Para-500'];
  console.log('      ' + drugLabels.map(l => l.padEnd(10)).join(''));
  for (let i = 0; i < testDrugs.length; i++) {
    const row = fullMatrix[i].map(val => (val * 100).toFixed(1) + '%').map(s => s.padEnd(10)).join('');
    console.log(`${drugLabels[i].padEnd(6)}${row}`);
  }
  console.log('');

  // Highlight key comparisons
  console.log('Key Comparisons (Full Text):');
  console.log(`  Amoxicillin vs Dicloxacillin:  ${(fullMatrix[0][1] * 100).toFixed(1)}% (same class, same dose)`);
  console.log(`  Amoxicillin vs Cefalexin:      ${(fullMatrix[0][2] * 100).toFixed(1)}% (different class, same dose)`);
  console.log(`  Amoxicillin vs Paracetamol:    ${(fullMatrix[0][4] * 100).toFixed(1)}% (different class, same dose)`);
  console.log('');

  console.log('='.repeat(80));
  console.log('SIMILARITY MATRIX - INGREDIENT ONLY (Proposed Approach)');
  console.log('='.repeat(80));
  console.log('');

  const ingredientMatrix: number[][] = [];
  for (let i = 0; i < testDrugs.length; i++) {
    ingredientMatrix[i] = [];
    for (let j = 0; j < testDrugs.length; j++) {
      ingredientMatrix[i][j] = calculateCosineSimilarity(ingredientEmbeddings[i], ingredientEmbeddings[j]);
    }
  }

  // Print ingredient matrix
  console.log('      ' + drugLabels.map(l => l.padEnd(10)).join(''));
  for (let i = 0; i < testDrugs.length; i++) {
    const row = ingredientMatrix[i].map(val => (val * 100).toFixed(1) + '%').map(s => s.padEnd(10)).join('');
    console.log(`${drugLabels[i].padEnd(6)}${row}`);
  }
  console.log('');

  // Highlight key comparisons
  console.log('Key Comparisons (Ingredient Only):');
  console.log(`  Amoxicillin vs Dicloxacillin:  ${(ingredientMatrix[0][1] * 100).toFixed(1)}% (same class, no dose)`);
  console.log(`  Amoxicillin vs Cefalexin:      ${(ingredientMatrix[0][2] * 100).toFixed(1)}% (different class, no dose)`);
  console.log(`  Amoxicillin vs Paracetamol:    ${(ingredientMatrix[0][4] * 100).toFixed(1)}% (different class, no dose)`);
  console.log('');

  // Compare differentiation
  console.log('='.repeat(80));
  console.log('DIFFERENTIATION ANALYSIS');
  console.log('='.repeat(80));
  console.log('');

  const fullDiff_AmoxDiclo = fullMatrix[0][1];
  const ingredientDiff_AmoxDiclo = ingredientMatrix[0][1];
  const fullDiff_AmoxCefa = fullMatrix[0][2];
  const ingredientDiff_AmoxCefa = ingredientMatrix[0][2];

  console.log('Amoxicillin vs Dicloxacillin (same antibiotic class):');
  console.log(`  Full text:       ${(fullDiff_AmoxDiclo * 100).toFixed(1)}%`);
  console.log(`  Ingredient only: ${(ingredientDiff_AmoxDiclo * 100).toFixed(1)}%`);
  console.log(`  Change: ${ingredientDiff_AmoxDiclo < fullDiff_AmoxDiclo ? '✓ IMPROVED' : '✗ WORSE'} (${((ingredientDiff_AmoxDiclo - fullDiff_AmoxDiclo) * 100).toFixed(1)} points)`);
  console.log('');

  console.log('Amoxicillin vs Cefalexin (different antibiotic class):');
  console.log(`  Full text:       ${(fullDiff_AmoxCefa * 100).toFixed(1)}%`);
  console.log(`  Ingredient only: ${(ingredientDiff_AmoxCefa * 100).toFixed(1)}%`);
  console.log(`  Change: ${ingredientDiff_AmoxCefa < fullDiff_AmoxCefa ? '✓ IMPROVED' : '✗ WORSE'} (${((ingredientDiff_AmoxCefa - fullDiff_AmoxCefa) * 100).toFixed(1)} points)`);
  console.log('');

  // Test with actual query
  console.log('='.repeat(80));
  console.log('QUERY TEST: "Amoxicillin"');
  console.log('='.repeat(80));
  console.log('');

  const query = 'Amoxicillin';
  console.log(`Query: "${query}"`);
  console.log('');

  const queryEmbedding = await generateEmbedding(query.toLowerCase());

  console.log('Similarity Rankings (Ingredient-Only Embeddings):');
  const results = testDrugs.map((drug, idx) => ({
    drug,
    ingredient: extractIngredient(drug),
    similarity: calculateCosineSimilarity(queryEmbedding, ingredientEmbeddings[idx])
  })).sort((a, b) => b.similarity - a.similarity);

  results.forEach((r, idx) => {
    const marker = idx === 0 ? '→' : ' ';
    console.log(`  ${marker} #${idx + 1}: ${(r.similarity * 100).toFixed(1)}% | ${r.drug}`);
  });
  console.log('');

  // Conclusion
  console.log('='.repeat(80));
  console.log('CONCLUSION');
  console.log('='.repeat(80));
  console.log('');

  const improved = ingredientDiff_AmoxDiclo < fullDiff_AmoxDiclo;
  const improvementAmount = (fullDiff_AmoxDiclo - ingredientDiff_AmoxDiclo) * 100;

  if (improved && improvementAmount > 5) {
    console.log('✅ HYPOTHESIS CONFIRMED');
    console.log('   Removing dosage DOES improve semantic differentiation');
    console.log(`   Improvement: ${improvementAmount.toFixed(1)} percentage points`);
    console.log('');
    console.log('   Recommendation:');
    console.log('   - Embed INGREDIENT ONLY for vector similarity');
    console.log('   - Use lexical matching for dosage filtering');
    console.log('   - This combines best of both: semantic + exact dose matching');
  } else if (improved && improvementAmount > 0) {
    console.log('⚠️ MINOR IMPROVEMENT');
    console.log('   Removing dosage slightly improves differentiation');
    console.log(`   Improvement: ${improvementAmount.toFixed(1)} percentage points (marginal)`);
    console.log('');
    console.log('   Recommendation:');
    console.log('   - Hybrid approach still needed');
    console.log('   - Ingredient-only embeddings help but not enough alone');
  } else {
    console.log('❌ HYPOTHESIS REJECTED');
    console.log('   Removing dosage does NOT improve differentiation');
    console.log(`   Change: ${improvementAmount.toFixed(1)} percentage points`);
    console.log('');
    console.log('   Recommendation:');
    console.log('   - Dosage is not the primary cause of clustering');
    console.log('   - Issue is inherent semantic similarity of drug classes');
    console.log('   - Hybrid approach (lexical + vector) still required');
  }
  console.log('='.repeat(80));
}

testIngredientOnly()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
