/**
 * Test MBS Procedures with Normalized Embeddings
 *
 * Purpose: See if procedures work better than medications
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

interface TestCase {
  query: string;
  expectedCode?: string;
  description: string;
}

const TEST_CASES: TestCase[] = [
  {
    query: 'GP consultation',
    description: 'Standard GP office visit',
  },
  {
    query: 'Blood test',
    description: 'Standard pathology blood test',
  },
  {
    query: 'X-ray chest',
    description: 'Chest X-ray imaging',
  },
  {
    query: 'ECG',
    description: 'Electrocardiogram heart test',
  },
  {
    query: 'Skin biopsy',
    description: 'Dermatology skin tissue sample',
  },
];

async function generateQueryEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS
  });
  return response.data[0].embedding;
}

async function searchProcedures(queryEmbedding: number[], limit: number = 10): Promise<any[]> {
  const { data: codes, error } = await supabase
    .from('regional_medical_codes')
    .select('code_system, code_value, display_name, search_text, normalized_embedding_text, normalized_embedding, entity_type')
    .eq('active', true)
    .eq('entity_type', 'procedure')
    .eq('code_system', 'mbs')
    .eq('country_code', 'AUS')
    .not('normalized_embedding', 'is', null)
    .limit(1000);

  if (error) {
    throw error;
  }

  if (!codes || codes.length === 0) {
    return [];
  }

  const results = codes.map(code => {
    const vectorStr = code.normalized_embedding as string;
    const dbEmbedding = JSON.parse(vectorStr);

    let dotProduct = 0;
    let queryMag = 0;
    let dbMag = 0;

    for (let i = 0; i < queryEmbedding.length; i++) {
      dotProduct += queryEmbedding[i] * dbEmbedding[i];
      queryMag += queryEmbedding[i] * queryEmbedding[i];
      dbMag += dbEmbedding[i] * dbEmbedding[i];
    }

    const similarity = dotProduct / (Math.sqrt(queryMag) * Math.sqrt(dbMag));

    return {
      ...code,
      similarity_score: similarity
    };
  })
  .filter(r => r.similarity_score >= 0.3)
  .sort((a, b) => b.similarity_score - a.similarity_score)
  .slice(0, limit);

  return results;
}

async function runTest() {
  console.log('='.repeat(80));
  console.log('MBS PROCEDURE VALIDATION TEST');
  console.log('='.repeat(80));
  console.log('');

  for (const testCase of TEST_CASES) {
    console.log(`\nTesting: "${testCase.query}"`);
    console.log(`Expected: ${testCase.description}`);
    console.log('⏳ Generating embedding...');

    const queryEmbedding = await generateQueryEmbedding(testCase.query);

    console.log('⏳ Searching procedures...');
    const results = await searchProcedures(queryEmbedding, 10);

    if (results.length === 0) {
      console.log('❌ No results found');
      continue;
    }

    console.log(`\nTop 10 Results:`);
    console.log('-'.repeat(78));
    results.forEach((result, idx) => {
      const similarity = (result.similarity_score * 100).toFixed(1);
      const display = result.display_name.length > 50 ?
                     result.display_name.substring(0, 50) + '...' :
                     result.display_name;
      console.log(`#${(idx + 1).toString().padStart(2)}: ${similarity.padStart(5)}% | ${result.code_value.padEnd(8)} | ${display}`);
    });
    console.log('-'.repeat(78));
  }

  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));
}

runTest()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
