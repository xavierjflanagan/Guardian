import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// Load from environment instead of hardcoding secrets
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required env vars: OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testPass15RPC() {
  console.log('=== TESTING PASS 1.5 RPC FUNCTION WITH REAL PASS 1 ENTITIES ===\n');

  const medications = [
    {
      name: 'Metformin',
      original_text: 'Current Medication: Metformin 500mg twice daily',
      entity_id: 'c7f2e07f-ccd3-4630-b720-d24aba56ed46'
    },
    {
      name: 'Perindopril',
      original_text: 'Current Medication: Perindopril 4mg once daily',
      entity_id: '94f6ed03-5995-4d01-864b-b2203fa71d78'
    }
  ];

  for (const med of medications) {
    console.log(`\n${'='.repeat(100)}`);
    console.log(`TESTING: ${med.original_text}`);
    console.log(`${'='.repeat(100)}\n`);

    // STEP 1: Generate embedding
    console.log('STEP 1: Generating embedding via OpenAI API...');
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: med.original_text
    });
    const embedding = embeddingResponse.data[0].embedding;
    console.log(`✓ Embedding generated (${embedding.length} dimensions)\n`);

    // STEP 2: Call RPC function (the actual Pass 1.5 code path)
    console.log('STEP 2: Calling search_regional_codes() RPC function...');
    const { data, error, status, statusText } = await supabase.rpc('search_regional_codes', {
      query_embedding: embedding,
      entity_type_filter: 'medication',
      country_code_filter: 'AUS',
      max_results: 10,
      min_similarity: 0.0
    });

    console.log(`Response Status: ${status} ${statusText}`);
    console.log(`Error: ${error ? JSON.stringify(error, null, 2) : 'null'}`);
    console.log(`Results Count: ${data?.length || 0}\n`);

    if (error) {
      console.log('❌ RPC CALL FAILED - This is the core issue!\n');
      continue;
    }

    if (!data || data.length === 0) {
      console.log('❌ RPC RETURNED ZERO RESULTS - Pass 1.5 is broken!\n');
      continue;
    }

    // STEP 3: Display results
    console.log('STEP 3: RESULTS FROM PASS 1.5 VECTOR SEARCH\n');
    console.log('Rank | Similarity | Code      | Display Name');
    console.log('-'.repeat(120));

    data.forEach((result: any, index: number) => {
      const rank = `#${index + 1}`.padEnd(5);
      const similarity = `${(result.similarity_score * 100).toFixed(1)}%`.padEnd(11);
      const code = `${result.code_system.toUpperCase()} ${result.code_value.substring(0, 15)}`.padEnd(10);
      const displayName = result.display_name.substring(0, 80);
      console.log(`${rank}| ${similarity}| ${code}| ${displayName}`);
    });

    console.log('\n');

    // STEP 4: Analysis
    const ingredientName = med.name.toLowerCase();
    const topResult = data[0];
    const topContainsIngredient = topResult.display_name.toLowerCase().includes(ingredientName);

    console.log('ANALYSIS:');
    console.log(`- Searching for: ${med.name}`);
    console.log(`- Top match: ${topResult.display_name.substring(0, 80)}...`);
    console.log(`- Top similarity: ${(topResult.similarity_score * 100).toFixed(1)}%`);
    console.log(`- Top contains "${ingredientName}": ${topContainsIngredient ? '✓ YES' : '✗ NO'}`);

    const top5ContainIngredient = data.slice(0, 5).filter((r: any) =>
      r.display_name.toLowerCase().includes(ingredientName)
    ).length;

    console.log(`- Top 5 results containing "${ingredientName}": ${top5ContainIngredient}/5`);

    if (!topContainsIngredient) {
      console.log(`\n⚠️  CRITICAL: Top result does NOT contain "${ingredientName}"!`);
      console.log(`   This means Pass 1.5 is returning WRONG medical codes.`);
    } else if (top5ContainIngredient < 3) {
      console.log(`\n⚠️  WARNING: Only ${top5ContainIngredient}/5 top results contain "${ingredientName}".`);
      console.log(`   Vector search quality is poor (ranking issue).`);
    } else {
      console.log(`\n✓ Pass 1.5 returned correct ingredient in top results.`);
    }

    console.log('\n');
  }

  console.log('=== TEST COMPLETE ===\n');
}

testPass15RPC().catch(console.error);
