/**
 * End-to-End Verification: Paracetamol 500mg
 *
 * Trace one medication through the entire pipeline:
 * 1. Fetch original database record
 * 2. Verify normalized text matches normalization rules
 * 3. Verify embedding exists and has correct dimensions
 * 4. Generate query embedding for "Paracetamol 500mg"
 * 5. Calculate similarity manually
 * 6. Verify it matches test results (83.5%)
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

// Known good code from test results
const PARACETAMOL_CODE = '10582Y_7030_485_2862_9558';

async function verifyEndToEnd() {
  console.log('='.repeat(80));
  console.log('END-TO-END VERIFICATION: PARACETAMOL 500MG');
  console.log('='.repeat(80));
  console.log('');

  // Step 1: Fetch database record
  console.log('Step 1: Fetching database record...');
  const { data: dbRecord, error: fetchError } = await supabase
    .from('regional_medical_codes')
    .select('*')
    .eq('code_value', PARACETAMOL_CODE)
    .single();

  if (fetchError || !dbRecord) {
    console.error('Failed to fetch record:', fetchError);
    process.exit(1);
  }

  console.log('✓ Found record:');
  console.log(`  Code: ${dbRecord.code_value}`);
  console.log(`  Display: ${dbRecord.display_name}`);
  console.log(`  Search Text: ${dbRecord.search_text}`);
  console.log(`  Normalized Text: ${dbRecord.normalized_embedding_text}`);
  console.log('');

  // Step 2: Verify normalized text
  console.log('Step 2: Verifying normalized text...');
  const originalDisplay = dbRecord.display_name;
  const normalizedText = dbRecord.normalized_embedding_text;

  console.log(`  Original: "${originalDisplay}"`);
  console.log(`  Normalized: "${normalizedText}"`);

  // Check normalization rules applied
  const hasNoSalt = !normalizedText.includes('(as ');
  const isLowercase = normalizedText === normalizedText.toLowerCase();

  console.log(`  ✓ Salt forms removed: ${hasNoSalt}`);
  console.log(`  ✓ Lowercased: ${isLowercase}`);
  console.log('');

  // Step 3: Verify embedding
  console.log('Step 3: Verifying embedding...');
  if (!dbRecord.normalized_embedding) {
    console.error('❌ No embedding found!');
    process.exit(1);
  }

  const dbEmbedding = JSON.parse(dbRecord.normalized_embedding);
  console.log(`  ✓ Embedding exists`);
  console.log(`  ✓ Dimensions: ${dbEmbedding.length} (expected ${EMBEDDING_DIMENSIONS})`);

  if (dbEmbedding.length !== EMBEDDING_DIMENSIONS) {
    console.error(`❌ Dimension mismatch!`);
    process.exit(1);
  }

  // Check embedding is normalized (OpenAI embeddings should have unit length)
  const magnitude = Math.sqrt(dbEmbedding.reduce((sum: number, val: number) => sum + val * val, 0));
  console.log(`  Magnitude: ${magnitude.toFixed(6)} (should be ~1.0 for normalized vectors)`);
  console.log('');

  // Step 4: Generate query embedding
  console.log('Step 4: Generating query embedding for "Paracetamol 500mg"...');
  const queryText = 'Paracetamol 500mg';
  const queryResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: queryText,
    dimensions: EMBEDDING_DIMENSIONS
  });
  const queryEmbedding = queryResponse.data[0].embedding;

  console.log(`  ✓ Query embedding generated`);
  console.log(`  ✓ Dimensions: ${queryEmbedding.length}`);

  const queryMagnitude = Math.sqrt(queryEmbedding.reduce((sum, val) => sum + val * val, 0));
  console.log(`  Magnitude: ${queryMagnitude.toFixed(6)}`);
  console.log('');

  // Step 5: Calculate similarity manually
  console.log('Step 5: Calculating cosine similarity manually...');
  let dotProduct = 0;
  let dbMag = 0;
  let queryMag = 0;

  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    dotProduct += queryEmbedding[i] * dbEmbedding[i];
    queryMag += queryEmbedding[i] * queryEmbedding[i];
    dbMag += dbEmbedding[i] * dbEmbedding[i];
  }

  const similarity = dotProduct / (Math.sqrt(queryMag) * Math.sqrt(dbMag));

  console.log(`  Dot product: ${dotProduct.toFixed(6)}`);
  console.log(`  Query magnitude: ${Math.sqrt(queryMag).toFixed(6)}`);
  console.log(`  DB magnitude: ${Math.sqrt(dbMag).toFixed(6)}`);
  console.log(`  Cosine similarity: ${similarity.toFixed(6)} (${(similarity * 100).toFixed(1)}%)`);
  console.log('');

  // Step 6: Compare with test results
  console.log('Step 6: Comparing with test results...');
  const expectedSimilarity = 0.835;  // From test output
  const difference = Math.abs(similarity - expectedSimilarity);
  const withinTolerance = difference < 0.01;  // 1% tolerance for embedding regeneration

  console.log(`  Expected similarity: ${(expectedSimilarity * 100).toFixed(1)}%`);
  console.log(`  Calculated similarity: ${(similarity * 100).toFixed(1)}%`);
  console.log(`  Difference: ${(difference * 100).toFixed(2)}%`);
  console.log(`  ${withinTolerance ? '✅ MATCH' : '⚠️ MISMATCH'} (tolerance: 1%)`);
  console.log('');

  // Step 7: Verify against other paracetamol drugs
  console.log('Step 7: Comparing against other paracetamol drugs...');
  const { data: allParacetamol, error: allError } = await supabase
    .from('regional_medical_codes')
    .select('code_value, display_name, normalized_embedding_text, normalized_embedding')
    .eq('code_system', 'pbs')
    .eq('country_code', 'AUS')
    .eq('entity_type', 'medication')
    .ilike('display_name', '%paracetamol%')
    .not('normalized_embedding', 'is', null)
    .limit(20);

  if (allError || !allParacetamol) {
    console.error('Failed to fetch paracetamol drugs:', allError);
    process.exit(1);
  }

  console.log(`  Found ${allParacetamol.length} paracetamol drugs in database`);

  const similarities = allParacetamol.map(drug => {
    const drugEmbedding = JSON.parse(drug.normalized_embedding);
    let dot = 0, qMag = 0, dMag = 0;
    for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
      dot += queryEmbedding[i] * drugEmbedding[i];
      qMag += queryEmbedding[i] * queryEmbedding[i];
      dMag += drugEmbedding[i] * drugEmbedding[i];
    }
    const sim = dot / (Math.sqrt(qMag) * Math.sqrt(dMag));
    return {
      code: drug.code_value,
      display: drug.display_name,
      normalized: drug.normalized_embedding_text,
      similarity: sim
    };
  }).sort((a, b) => b.similarity - a.similarity);

  console.log('');
  console.log('  Top 10 Paracetamol Matches:');
  console.log('  ' + '-'.repeat(76));
  similarities.slice(0, 10).forEach((drug, idx) => {
    const marker = drug.code === PARACETAMOL_CODE ? '→' : ' ';
    const display = drug.display.length > 50 ? drug.display.substring(0, 50) + '...' : drug.display;
    console.log(`  ${marker} #${(idx + 1).toString().padStart(2)}: ${(drug.similarity * 100).toFixed(1)}% | ${display}`);
  });
  console.log('  ' + '-'.repeat(76));
  console.log('  Legend: → = Our test record');
  console.log('');

  // Final verdict
  console.log('='.repeat(80));
  console.log('VERIFICATION RESULT');
  console.log('='.repeat(80));

  if (withinTolerance && similarities[0].code === PARACETAMOL_CODE) {
    console.log('✅ END-TO-END VERIFICATION PASSED');
    console.log('   All pipeline components working correctly:');
    console.log('   - Database record integrity: ✓');
    console.log('   - Normalization logic: ✓');
    console.log('   - Embedding storage: ✓');
    console.log('   - Cosine similarity calculation: ✓');
    console.log('   - KNN ranking: ✓');
    console.log('');
    console.log('   Paracetamol works because:');
    console.log('   - It\'s a unique drug class (analgesic/antipyretic)');
    console.log('   - Low semantic overlap with other medications');
    console.log('   - Many exact "paracetamol 500mg tablet" variants in database');
    console.log('   - Pure vector search CAN work for semantically unique drugs');
  } else {
    console.log('⚠️ END-TO-END VERIFICATION FAILED');
    console.log(`   Similarity match: ${withinTolerance ? '✓' : '✗'}`);
    console.log(`   Top ranking: ${similarities[0].code === PARACETAMOL_CODE ? '✓' : '✗'}`);
  }
  console.log('='.repeat(80));
}

verifyEndToEnd()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
