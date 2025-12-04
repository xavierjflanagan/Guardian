/**
 * Verification Script: Cosine Similarity Calculation
 *
 * This script proves that semantic similarity IS being calculated correctly
 * by loading actual embeddings and recalculating cosine similarity manually.
 */

import * as fs from 'fs';
import * as path from 'path';

const EXPERIMENT_DIR = 'shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/pass1.5-testing/experiment-2';

// Cosine similarity function (same as in run-experiment-2.ts)
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error(`Vector dimension mismatch: ${vec1.length} vs ${vec2.length}`);
  }

  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }

  const similarity = dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
  return similarity;
}

console.log('='.repeat(80));
console.log('COSINE SIMILARITY VERIFICATION');
console.log('='.repeat(80));
console.log();

// Load samples to get entity-to-UUID mapping
const samplesPath = path.join(EXPERIMENT_DIR, 'samples.json');
console.log(`Loading samples from: ${samplesPath}`);
const samples = JSON.parse(fs.readFileSync(samplesPath, 'utf-8'));
console.log(`✓ Loaded ${samples.medications.length} medications + ${samples.procedures.length} procedures`);
console.log();

// Load embeddings for SapBERT normalized strategy
const embeddingsPath = path.join(EXPERIMENT_DIR, 'embeddings_sapbert_normalized.json');
console.log(`Loading embeddings from: ${embeddingsPath}`);
const embeddingsFile = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8'));
const embeddings = embeddingsFile.embeddings;
console.log(`✓ Loaded ${Object.keys(embeddings).length} embeddings`);
console.log();

// Load similarity results
const resultsPath = path.join(EXPERIMENT_DIR, 'similarity_results.json');
console.log(`Loading similarity results from: ${resultsPath}`);
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
console.log(`✓ Loaded ${results.length} similarity results`);
console.log();

// Find a test case: Amoxicillin vs Flucloxacillin (MED-01)
const testCase = results.find((r: any) =>
  r.pair_id === 'MED-01' &&
  r.model === 'sapbert' &&
  r.strategy === 'normalized'
);

if (!testCase) {
  console.error('ERROR: Could not find test case MED-01 for sapbert+normalized');
  process.exit(1);
}

console.log('TEST CASE: MED-01 (Amoxicillin vs Flucloxacillin)');
console.log('-'.repeat(80));
console.log(`Entity 1: ${testCase.entity1}`);
console.log(`Entity 2: ${testCase.entity2}`);
console.log(`Reported similarity: ${(testCase.similarity * 100).toFixed(1)}%`);
console.log();

// Find the entities in samples to get their UUIDs
const entity1 = samples.medications.find((m: any) => m.display_name.includes('Amoxicillin'));
const entity2 = samples.medications.find((m: any) => m.display_name.includes('Flucloxacillin'));

if (!entity1 || !entity2) {
  console.error('ERROR: Could not find test entities in samples');
  process.exit(1);
}

console.log(`Found entities:`);
console.log(`  Entity 1 UUID: ${entity1.id}`);
console.log(`  Entity 2 UUID: ${entity2.id}`);
console.log();

// Get the embeddings using the UUIDs
const vec1 = embeddings[entity1.id];
const vec2 = embeddings[entity2.id];

if (!vec1 || !vec2) {
  console.error('ERROR: Could not find embeddings for entity UUIDs');
  console.log('Available UUIDs:', Object.keys(embeddings).slice(0, 5));
  process.exit(1);
}

console.log('VECTOR DETAILS:');
console.log('-'.repeat(80));
console.log(`Vector 1 dimensions: ${vec1.length}`);
console.log(`Vector 2 dimensions: ${vec2.length}`);
console.log();
console.log(`Vector 1 sample (first 5 values): [${vec1.slice(0, 5).map((v: number) => v.toFixed(4)).join(', ')}...]`);
console.log(`Vector 2 sample (first 5 values): [${vec2.slice(0, 5).map((v: number) => v.toFixed(4)).join(', ')}...]`);
console.log();

// Calculate magnitude of each vector
const mag1 = Math.sqrt(vec1.reduce((sum: number, v: number) => sum + v * v, 0));
const mag2 = Math.sqrt(vec2.reduce((sum: number, v: number) => sum + v * v, 0));

console.log(`Vector 1 magnitude: ${mag1.toFixed(6)}`);
console.log(`Vector 2 magnitude: ${mag2.toFixed(6)}`);
console.log();

// Calculate dot product
const dotProduct = vec1.reduce((sum: number, v: number, i: number) => sum + v * vec2[i], 0);
console.log(`Dot product: ${dotProduct.toFixed(6)}`);
console.log();

// Calculate cosine similarity manually
const calculatedSimilarity = dotProduct / (mag1 * mag2);
console.log('CALCULATED COSINE SIMILARITY:');
console.log('-'.repeat(80));
console.log(`Formula: dotProduct / (mag1 * mag2)`);
console.log(`Calculation: ${dotProduct.toFixed(6)} / (${mag1.toFixed(6)} * ${mag2.toFixed(6)})`);
console.log(`Result: ${calculatedSimilarity.toFixed(6)} (${(calculatedSimilarity * 100).toFixed(1)}%)`);
console.log();

// Verify using our function
const functionResult = cosineSimilarity(vec1, vec2);
console.log(`Using cosineSimilarity() function: ${functionResult.toFixed(6)} (${(functionResult * 100).toFixed(1)}%)`);
console.log();

// Compare with reported value
console.log('VERIFICATION RESULT:');
console.log('='.repeat(80));
console.log(`Reported similarity:   ${(testCase.similarity * 100).toFixed(1)}%`);
console.log(`Calculated similarity: ${(calculatedSimilarity * 100).toFixed(1)}%`);
console.log(`Function similarity:   ${(functionResult * 100).toFixed(1)}%`);
console.log();

const diff = Math.abs(testCase.similarity - calculatedSimilarity);
if (diff < 0.000001) {
  console.log('✅ VERIFICATION PASSED!');
  console.log('   Cosine similarity calculations are working correctly.');
  console.log('   The experiment IS calculating semantic similarity properly.');
} else {
  console.log('❌ VERIFICATION FAILED!');
  console.log(`   Difference: ${diff.toFixed(8)}`);
  console.log('   There may be an issue with the calculation.');
}
console.log('='.repeat(80));
console.log();

// Test a few more cases to be thorough
console.log('ADDITIONAL VERIFICATION CASES:');
console.log('-'.repeat(80));

const additionalTestCases = [
  {
    pair_id: 'MED-12',
    entity1Name: 'Paracetamol',
    entity2Name: 'Metformin',
    entityType: 'medication'
  },
  {
    pair_id: 'PROC-03',
    entity1Name: 'Spine',
    entity2Name: 'anaesthesia',
    entityType: 'procedure'
  }
];

for (const testInfo of additionalTestCases) {
  const testResult = results.find((r: any) =>
    r.pair_id === testInfo.pair_id &&
    r.model === 'sapbert' &&
    r.strategy === 'normalized'
  );

  if (!testResult) continue;

  // Find entities in samples
  const entityList = testInfo.entityType === 'medication' ? samples.medications : samples.procedures;
  const ent1 = entityList.find((e: any) => e.display_name.toLowerCase().includes(testInfo.entity1Name.toLowerCase()));
  const ent2 = entityList.find((e: any) => e.display_name.toLowerCase().includes(testInfo.entity2Name.toLowerCase()));

  if (ent1 && ent2) {
    const v1 = embeddings[ent1.id];
    const v2 = embeddings[ent2.id];

    if (v1 && v2) {
      const calculated = cosineSimilarity(v1, v2);
      const reported = testResult.similarity;
      const matches = Math.abs(calculated - reported) < 0.000001;

      console.log(`${testInfo.pair_id} (${testInfo.entity1Name} vs ${testInfo.entity2Name}):`);
      console.log(`  Reported: ${(reported * 100).toFixed(1)}%, Calculated: ${(calculated * 100).toFixed(1)}% ${matches ? '✅' : '❌'}`);
    }
  }
}

console.log();
console.log('Verification complete!');
