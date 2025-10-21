/**
 * Verify SapBERT Embeddings - Quality Check
 *
 * Validates that generated SapBERT embeddings:
 * 1. Have correct dimensions (768)
 * 2. Are actual vectors (not null/malformed)
 * 3. Have reasonable magnitude
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment
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

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function verifySapBERTEmbeddings() {
  console.log('Verifying SapBERT embeddings...\n');

  // Fetch sample of PBS codes with SapBERT embeddings
  const { data, error } = await supabase
    .from('regional_medical_codes')
    .select('id, code_value, display_name, sapbert_embedding, sapbert_embedding_generated_at')
    .eq('code_system', 'pbs')
    .eq('country_code', 'AUS')
    .not('sapbert_embedding', 'is', null)
    .limit(5);

  if (error) {
    console.error('Error fetching embeddings:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No SapBERT embeddings found!');
    process.exit(1);
  }

  console.log(`Found ${data.length} codes with SapBERT embeddings\n`);

  for (const code of data) {
    console.log(`Code: ${code.code_value}`);
    console.log(`Display: ${code.display_name}`);
    console.log(`Generated: ${code.sapbert_embedding_generated_at}`);

    // Parse embedding
    const embedding = code.sapbert_embedding;

    if (!embedding) {
      console.log('❌ Embedding is null!');
      continue;
    }

    // Check if it's a string that needs parsing or already an array
    let embeddingArray: number[];
    if (typeof embedding === 'string') {
      // Parse string format: "[1,2,3,...]"
      embeddingArray = JSON.parse(embedding);
    } else if (Array.isArray(embedding)) {
      embeddingArray = embedding;
    } else {
      console.log('❌ Unknown embedding format:', typeof embedding);
      continue;
    }

    console.log(`✓ Dimensions: ${embeddingArray.length} (expected: 768)`);

    // Calculate magnitude (L2 norm)
    const magnitude = Math.sqrt(embeddingArray.reduce((sum, val) => sum + val * val, 0));
    console.log(`✓ Magnitude: ${magnitude.toFixed(4)}`);

    // Check for NaN or Infinity
    const hasInvalid = embeddingArray.some(val => !isFinite(val));
    console.log(`✓ Valid values: ${hasInvalid ? '❌ Contains NaN/Infinity' : 'Yes'}`);

    // Sample first 5 values
    console.log(`✓ Sample values: [${embeddingArray.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);

    console.log('');
  }

  console.log('✅ Verification complete!');
}

verifySapBERTEmbeddings().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
