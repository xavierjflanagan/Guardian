/**
 * Test: SapBERT vs OpenAI for medication differentiation
 *
 * SapBERT is a medical entity linking model trained on UMLS.
 * Question: Does it better distinguish between similar drug names?
 *
 * Test via HuggingFace Inference API (free, no infrastructure needed)
 */

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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Test medications (ingredients only for fair comparison)
const testMedications = [
  'amoxicillin',
  'dicloxacillin',
  'cefalexin',
  'flucloxacillin',
  'paracetamol',
  'metformin',
  'metoprolol',  // Similar name to metformin but completely different drug
];

async function getOpenAIEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 384  // Match SapBERT dimension
  });
  return response.data[0].embedding;
}

async function getSapBERTEmbedding(text: string): Promise<number[] | null> {
  if (!HUGGINGFACE_API_KEY) {
    console.log('⚠️  No HuggingFace API key found, skipping SapBERT test');
    return null;
  }

  try {
    const response = await fetch(
      'https://api-inference.huggingface.co/models/cambridgeltl/SapBERT-from-PubMedBERT-fulltext',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: text,
          options: { wait_for_model: true }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`SapBERT API error: ${error}`);
      return null;
    }

    const data = await response.json();

    // HuggingFace returns different formats depending on model
    if (Array.isArray(data) && data.length > 0) {
      return data[0];
    } else if (data.embeddings) {
      return data.embeddings;
    } else {
      console.error('Unexpected SapBERT response format:', data);
      return null;
    }
  } catch (error) {
    console.error('SapBERT fetch error:', error);
    return null;
  }
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

async function compareModels() {
  console.log('='.repeat(80));
  console.log('SAPBERT VS OPENAI: MEDICATION DIFFERENTIATION TEST');
  console.log('='.repeat(80));
  console.log('');
  console.log('Question: Does medical-specific SapBERT better distinguish between');
  console.log('similar medication names compared to general-purpose OpenAI?');
  console.log('');
  console.log('Test medications (ingredient-only):');
  testMedications.forEach((med, idx) => {
    console.log(`  ${idx + 1}. ${med}`);
  });
  console.log('');

  // Generate OpenAI embeddings
  console.log('Generating OpenAI embeddings (text-embedding-3-small, 384d)...');
  const openaiEmbeddings = await Promise.all(
    testMedications.map(med => getOpenAIEmbedding(med))
  );
  console.log('✓ OpenAI embeddings generated');
  console.log('');

  // Generate SapBERT embeddings
  console.log('Generating SapBERT embeddings (cambridgeltl/SapBERT, 768d)...');
  const sapbertEmbeddings = await Promise.all(
    testMedications.map(med => getSapBERTEmbedding(med))
  );

  const hasSapBERT = sapbertEmbeddings.every(emb => emb !== null);

  if (!hasSapBERT) {
    console.log('❌ SapBERT embeddings failed - continuing with OpenAI only');
    console.log('');
    console.log('To test SapBERT, add HUGGINGFACE_API_KEY to .env.production');
    console.log('Get free API key at: https://huggingface.co/settings/tokens');
    console.log('');
  } else {
    console.log('✓ SapBERT embeddings generated');
    console.log('');
  }

  // Calculate similarity matrices
  console.log('='.repeat(80));
  console.log('OPENAI SIMILARITY MATRIX');
  console.log('='.repeat(80));
  console.log('');

  const openaiMatrix: number[][] = [];
  for (let i = 0; i < testMedications.length; i++) {
    openaiMatrix[i] = [];
    for (let j = 0; j < testMedications.length; j++) {
      openaiMatrix[i][j] = calculateCosineSimilarity(openaiEmbeddings[i], openaiEmbeddings[j]);
    }
  }

  // Print matrix
  const labels = testMedications.map(m => m.substring(0, 6).padEnd(8));
  console.log('        ' + labels.join(''));
  for (let i = 0; i < testMedications.length; i++) {
    const row = openaiMatrix[i].map(val => (val * 100).toFixed(0) + '%').map(s => s.padEnd(8)).join('');
    console.log(`${labels[i]}${row}`);
  }
  console.log('');

  // Key comparisons
  console.log('Key Comparisons (OpenAI):');
  console.log(`  amoxicillin vs dicloxacillin:  ${(openaiMatrix[0][1] * 100).toFixed(1)}% (same class)`);
  console.log(`  amoxicillin vs cefalexin:      ${(openaiMatrix[0][2] * 100).toFixed(1)}% (different class)`);
  console.log(`  amoxicillin vs paracetamol:    ${(openaiMatrix[0][4] * 100).toFixed(1)}% (very different)`);
  console.log(`  metformin vs metoprolol:       ${(openaiMatrix[5][6] * 100).toFixed(1)}% (similar names, different drugs)`);
  console.log('');

  if (hasSapBERT) {
    console.log('='.repeat(80));
    console.log('SAPBERT SIMILARITY MATRIX');
    console.log('='.repeat(80));
    console.log('');

    const sapbertMatrix: number[][] = [];
    for (let i = 0; i < testMedications.length; i++) {
      sapbertMatrix[i] = [];
      for (let j = 0; j < testMedications.length; j++) {
        sapbertMatrix[i][j] = calculateCosineSimilarity(
          sapbertEmbeddings[i]!,
          sapbertEmbeddings[j]!
        );
      }
    }

    // Print matrix
    console.log('        ' + labels.join(''));
    for (let i = 0; i < testMedications.length; i++) {
      const row = sapbertMatrix[i].map(val => (val * 100).toFixed(0) + '%').map(s => s.padEnd(8)).join('');
      console.log(`${labels[i]}${row}`);
    }
    console.log('');

    // Key comparisons
    console.log('Key Comparisons (SapBERT):');
    console.log(`  amoxicillin vs dicloxacillin:  ${(sapbertMatrix[0][1] * 100).toFixed(1)}% (same class)`);
    console.log(`  amoxicillin vs cefalexin:      ${(sapbertMatrix[0][2] * 100).toFixed(1)}% (different class)`);
    console.log(`  amoxicillin vs paracetamol:    ${(sapbertMatrix[0][4] * 100).toFixed(1)}% (very different)`);
    console.log(`  metformin vs metoprolol:       ${(sapbertMatrix[5][6] * 100).toFixed(1)}% (similar names, different drugs)`);
    console.log('');

    // Comparison
    console.log('='.repeat(80));
    console.log('DIFFERENTIATION COMPARISON');
    console.log('='.repeat(80));
    console.log('');

    const openai_amox_diclo = openaiMatrix[0][1];
    const sapbert_amox_diclo = sapbertMatrix[0][1];
    const openai_met_met = openaiMatrix[5][6];
    const sapbert_met_met = sapbertMatrix[5][6];

    console.log('Amoxicillin vs Dicloxacillin (should be LOWER = better differentiation):');
    console.log(`  OpenAI:  ${(openai_amox_diclo * 100).toFixed(1)}%`);
    console.log(`  SapBERT: ${(sapbert_amox_diclo * 100).toFixed(1)}%`);
    console.log(`  Winner: ${sapbert_amox_diclo < openai_amox_diclo ? '✓ SapBERT' : '✓ OpenAI'} (${Math.abs((sapbert_amox_diclo - openai_amox_diclo) * 100).toFixed(1)} points better)`);
    console.log('');

    console.log('Metformin vs Metoprolol (similar names, should be LOWER = better):');
    console.log(`  OpenAI:  ${(openai_met_met * 100).toFixed(1)}%`);
    console.log(`  SapBERT: ${(sapbert_met_met * 100).toFixed(1)}%`);
    console.log(`  Winner: ${sapbert_met_met < openai_met_met ? '✓ SapBERT' : '✓ OpenAI'} (${Math.abs((sapbert_met_met - openai_met_met) * 100).toFixed(1)} points better)`);
    console.log('');

    // Final verdict
    console.log('='.repeat(80));
    console.log('VERDICT');
    console.log('='.repeat(80));
    console.log('');

    const sapbertBetter = sapbert_amox_diclo < openai_amox_diclo && sapbert_met_met < openai_met_met;
    const improvementAmox = (openai_amox_diclo - sapbert_amox_diclo) * 100;
    const improvementMet = (openai_met_met - sapbert_met_met) * 100;

    if (sapbertBetter && improvementAmox > 5) {
      console.log('✅ SAPBERT SIGNIFICANTLY BETTER');
      console.log(`   Medical-specific training provides ${improvementAmox.toFixed(1)}+ points better differentiation`);
      console.log('');
      console.log('   Recommendation: Switch to SapBERT');
      console.log('   - Self-host SapBERT model (~$500/month infrastructure)');
      console.log('   - OR use HuggingFace Inference API (~$0.001 per 1000 searches)');
      console.log('   - Re-generate all 20,382 embeddings with SapBERT');
    } else if (sapbertBetter && improvementAmox > 0) {
      console.log('⚠️  SAPBERT MARGINALLY BETTER');
      console.log(`   Small improvement: ${improvementAmox.toFixed(1)} points`);
      console.log('');
      console.log('   Recommendation: Stick with OpenAI + hybrid');
      console.log('   - Improvement too small to justify infrastructure change');
      console.log('   - Ingredient-only embeddings (8.6% improvement) already proven');
      console.log('   - Hybrid approach will close the remaining gap');
    } else {
      console.log('✓ OPENAI PERFORMS AS WELL OR BETTER');
      console.log('   Medical-specific training does not help for medication names');
      console.log('');
      console.log('   Recommendation: Stick with OpenAI');
      console.log('   - No benefit from SapBERT');
      console.log('   - OpenAI API simpler, faster, cheaper');
      console.log('   - Focus on ingredient-only + hybrid approach');
    }
    console.log('='.repeat(80));
  }
}

compareModels()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
