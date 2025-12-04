/**
 * Investigation: Why are exact matches not showing up?
 *
 * We'll directly compare embeddings between:
 * 1. Query text
 * 2. Exact standalone match
 * 3. Combination that was incorrectly returned
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

async function investigateAmoxicillin() {
  console.log('='.repeat(80));
  console.log('INVESTIGATION: AMOXICILLIN 500MG');
  console.log('='.repeat(80));
  console.log('');

  // 1. Generate query embedding
  const queryText = 'Amoxicillin 500mg';
  console.log(`Query: "${queryText}"`);
  const queryEmbedding = await generateEmbedding(queryText);

  // 2. Fetch specific drugs from database
  const { data: drugs, error } = await supabase
    .from('regional_medical_codes')
    .select('code_value, display_name, normalized_embedding_text, normalized_embedding')
    .eq('code_system', 'pbs')
    .eq('country_code', 'AUS')
    .eq('entity_type', 'medication')
    .in('code_value', [
      '1889K_8485_152_1529_8675',  // Amoxil 500mg standalone
      '8254K_11531_153_1545_8847',  // Amoxicillin + clavulanic (the combo that was found)
    ]);

  if (error || !drugs) {
    console.error('Error fetching drugs:', error);
    return;
  }

  console.log(`\nFetched ${drugs.length} drugs for comparison`);

  // 3. Compare embeddings
  for (const drug of drugs) {
    console.log('\n' + '-'.repeat(80));
    console.log(`Drug: ${drug.display_name}`);
    console.log(`Code: ${drug.code_value}`);
    console.log(`Normalized text: "${drug.normalized_embedding_text}"`);

    // Parse database embedding
    const dbEmbedding = JSON.parse(drug.normalized_embedding);

    // Calculate similarity with query
    const similarity = calculateCosineSimilarity(queryEmbedding, dbEmbedding);
    console.log(`Similarity to query: ${(similarity * 100).toFixed(2)}%`);

    // Also test with the normalized text directly
    console.log(`\nTesting normalized text as query...`);
    const normalizedQueryEmbedding = await generateEmbedding(drug.normalized_embedding_text);
    const selfSimilarity = calculateCosineSimilarity(normalizedQueryEmbedding, dbEmbedding);
    console.log(`Self-similarity (should be ~100%): ${(selfSimilarity * 100).toFixed(2)}%`);
  }

  // 4. Now let's fetch ALL amoxicillin drugs and see their similarities
  console.log('\n' + '='.repeat(80));
  console.log('ALL AMOXICILLIN DRUGS - SIMILARITY ANALYSIS');
  console.log('='.repeat(80));

  const { data: allAmox, error: amoxError } = await supabase
    .from('regional_medical_codes')
    .select('code_value, display_name, normalized_embedding_text, normalized_embedding')
    .eq('code_system', 'pbs')
    .eq('country_code', 'AUS')
    .eq('entity_type', 'medication')
    .ilike('display_name', '%amoxicillin%')
    .limit(30);

  if (amoxError || !allAmox) {
    console.error('Error fetching all amoxicillin:', amoxError);
    return;
  }

  const results = [];
  for (const drug of allAmox) {
    const dbEmbedding = JSON.parse(drug.normalized_embedding);
    const similarity = calculateCosineSimilarity(queryEmbedding, dbEmbedding);

    results.push({
      code: drug.code_value,
      display: drug.display_name,
      normalized: drug.normalized_embedding_text,
      similarity: similarity,
      isCombo: drug.display_name.includes('+') || drug.display_name.includes('clavulanic')
    });
  }

  // Sort by similarity
  results.sort((a, b) => b.similarity - a.similarity);

  console.log('\nRanked by similarity to "Amoxicillin 500mg":');
  console.log('-'.repeat(80));
  results.forEach((r, idx) => {
    const marker = r.isCombo ? '[COMBO]' : '[SINGLE]';
    const display = r.display.length > 45 ? r.display.substring(0, 45) + '...' : r.display;
    console.log(`#${(idx + 1).toString().padStart(2)}: ${(r.similarity * 100).toFixed(1)}% ${marker} ${display}`);
    console.log(`     Normalized: "${r.normalized}"`);
  });
}

async function investigateAtorvastatin() {
  console.log('\n' + '='.repeat(80));
  console.log('INVESTIGATION: ATORVASTATIN 40MG');
  console.log('='.repeat(80));
  console.log('');

  const queryText = 'Atorvastatin 40mg';
  console.log(`Query: "${queryText}"`);
  const queryEmbedding = await generateEmbedding(queryText);

  const { data: allAtor, error } = await supabase
    .from('regional_medical_codes')
    .select('code_value, display_name, normalized_embedding_text, normalized_embedding')
    .eq('code_system', 'pbs')
    .eq('country_code', 'AUS')
    .eq('entity_type', 'medication')
    .ilike('display_name', '%atorvastatin%')
    .limit(30);

  if (error || !allAtor) {
    console.error('Error:', error);
    return;
  }

  const results = [];
  for (const drug of allAtor) {
    const dbEmbedding = JSON.parse(drug.normalized_embedding);
    const similarity = calculateCosineSimilarity(queryEmbedding, dbEmbedding);

    results.push({
      code: drug.code_value,
      display: drug.display_name,
      normalized: drug.normalized_embedding_text,
      similarity: similarity,
      isCombo: drug.display_name.includes('+') || drug.display_name.includes('ezetimibe')
    });
  }

  results.sort((a, b) => b.similarity - a.similarity);

  console.log('\nRanked by similarity to "Atorvastatin 40mg":');
  console.log('-'.repeat(80));
  results.slice(0, 15).forEach((r, idx) => {
    const marker = r.isCombo ? '[COMBO]' : '[SINGLE]';
    const display = r.display.length > 45 ? r.display.substring(0, 45) + '...' : r.display;
    console.log(`#${(idx + 1).toString().padStart(2)}: ${(r.similarity * 100).toFixed(1)}% ${marker} ${display}`);
    console.log(`     Normalized: "${r.normalized}"`);
  });
}

async function main() {
  await investigateAmoxicillin();
  await investigateAtorvastatin();

  console.log('\n' + '='.repeat(80));
  console.log('INVESTIGATION COMPLETE');
  console.log('='.repeat(80));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Investigation failed:', error);
    process.exit(1);
  });