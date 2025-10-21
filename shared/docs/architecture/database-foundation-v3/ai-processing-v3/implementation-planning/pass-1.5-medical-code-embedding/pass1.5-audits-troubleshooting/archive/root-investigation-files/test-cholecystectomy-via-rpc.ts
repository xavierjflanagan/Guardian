import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required env vars: OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testCholecystectomyViaRPC() {
  console.log('=== TESTING CHOLECYSTECTOMY VIA RPC FUNCTION (NOT DIRECT SQL) ===\n');

  const procedureText = 'Cholecystectomy';

  console.log(`Testing: ${procedureText}\n`);

  // STEP 1: Generate embedding from procedure text
  console.log('STEP 1: Generating embedding via OpenAI API...');
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: procedureText
  });
  const embedding = embeddingResponse.data[0].embedding;
  console.log(`✓ Embedding generated (${embedding.length} dimensions)\n`);

  // STEP 2: Call RPC function (actual Pass 1.5 code path)
  console.log('STEP 2: Calling search_regional_codes() RPC function...');
  const { data, error, status, statusText } = await supabase.rpc('search_regional_codes', {
    query_embedding: embedding,
    entity_type_filter: 'procedure',
    country_code_filter: 'AUS',
    max_results: 10,
    min_similarity: 0.0
  });

  console.log(`Response Status: ${status} ${statusText}`);
  console.log(`Error: ${error ? JSON.stringify(error, null, 2) : 'null'}`);
  console.log(`Results Count: ${data?.length || 0}\n`);

  if (error) {
    console.log('❌ RPC CALL FAILED\n');
    return;
  }

  if (!data || data.length === 0) {
    console.log('❌ RPC RETURNED ZERO RESULTS\n');
    return;
  }

  // STEP 3: Display results
  console.log('STEP 3: RESULTS FROM PASS 1.5 VECTOR SEARCH\n');
  console.log('Rank | Similarity | Code      | Display Name');
  console.log('-'.repeat(120));

  data.forEach((result: any, index: number) => {
    const rank = `#${index + 1}`.padEnd(5);
    const similarity = `${(result.similarity_score * 100).toFixed(1)}%`.padEnd(11);
    const code = `${result.code_system.toUpperCase()} ${result.code_value}`.padEnd(10);
    const displayName = result.display_name.substring(0, 80);
    console.log(`${rank}| ${similarity}| ${code}| ${displayName}`);
  });

  console.log('\n');

  // STEP 4: Analysis
  const topResult = data[0];
  const topContainsCholecystectomy = topResult.display_name.toLowerCase().includes('cholecystectomy');

  console.log('ANALYSIS:');
  console.log(`- Searching for: Cholecystectomy`);
  console.log(`- Top match: ${topResult.display_name.substring(0, 80)}...`);
  console.log(`- Top similarity: ${(topResult.similarity_score * 100).toFixed(1)}%`);
  console.log(`- Top contains "cholecystectomy": ${topContainsCholecystectomy ? '✓ YES' : '✗ NO'}`);

  const top5ContainCholecystectomy = data.slice(0, 5).filter((r: any) =>
    r.display_name.toLowerCase().includes('cholecystectomy')
  ).length;

  console.log(`- Top 5 results containing "cholecystectomy": ${top5ContainCholecystectomy}/5`);

  if (!topContainsCholecystectomy) {
    console.log(`\n⚠️  CRITICAL: Top result does NOT contain "cholecystectomy"!`);
    console.log(`   Pass 1.5 is broken for procedures too.`);
  } else {
    console.log(`\n✓ Pass 1.5 works correctly for procedures.`);
  }
}

testCholecystectomyViaRPC().catch(console.error);
