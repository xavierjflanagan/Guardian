import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testRealPass1Entities() {
  console.log('=== TESTING REAL PASS 1 MEDICATION ENTITIES ===\n');

  // Real medication entities from Pass 1 output (2025-10-19)
  const medications = [
    {
      id: 'c7f2e07f-ccd3-4630-b720-d24aba56ed46',
      original_text: 'Current Medication: Metformin 500mg twice daily',
      pass1_confidence: 0.970
    },
    {
      id: '94f6ed03-5995-4d01-864b-b2203fa71d78',
      original_text: 'Current Medication: Perindopril 4mg once daily',
      pass1_confidence: 0.960
    }
  ];

  for (const med of medications) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`MEDICATION ENTITY: ${med.original_text}`);
    console.log(`Pass 1 Confidence: ${med.pass1_confidence}`);
    console.log(`Entity ID: ${med.id}`);
    console.log(`${'='.repeat(80)}\n`);

    // STEP 1: Generate embedding from clinical entity text
    console.log('STEP 1: Generating embedding from clinical entity text...');
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: med.original_text
    });

    const embedding = embeddingResponse.data[0].embedding;
    console.log(`✓ Embedding generated (${embedding.length} dimensions)\n`);

    // STEP 2: Query Pass 1.5 vector search
    console.log('STEP 2: Querying Pass 1.5 vector search (search_regional_codes)...');
    const { data, error, status } = await supabase.rpc('search_regional_codes', {
      query_embedding: embedding,
      entity_type_filter: 'medication',
      country_code_filter: 'AUS',
      max_results: 10,
      min_similarity: 0.0  // Show all results regardless of similarity
    });

    if (error) {
      console.error('ERROR:', error);
      continue;
    }

    console.log(`✓ RPC Status: ${status}`);
    console.log(`✓ Results returned: ${data?.length || 0}\n`);

    // STEP 3: Display shortlisted results with ranking
    if (!data || data.length === 0) {
      console.log('❌ ZERO RESULTS - Pass 1.5 vector search failed\n');
      continue;
    }

    console.log('STEP 3: SHORTLISTED MEDICAL CODES (Ranked by Similarity)\n');
    console.log('Rank | Similarity | Code System | Code Value | Display Name');
    console.log('-'.repeat(120));

    data.forEach((result: any, index: number) => {
      const rank = `#${index + 1}`.padEnd(4);
      const similarity = `${(result.similarity_score * 100).toFixed(1)}%`.padEnd(10);
      const codeSystem = result.code_system.toUpperCase().padEnd(11);
      const codeValue = result.code_value.substring(0, 20).padEnd(20);
      const displayName = result.display_name.substring(0, 60);

      console.log(`${rank} | ${similarity} | ${codeSystem} | ${codeValue} | ${displayName}`);
    });

    console.log('\n');

    // STEP 4: Analysis
    console.log('ANALYSIS:');
    console.log(`- Top match: ${data[0].display_name.substring(0, 80)}...`);
    console.log(`- Top similarity: ${(data[0].similarity_score * 100).toFixed(1)}%`);
    console.log(`- Code: ${data[0].code_system.toUpperCase()} ${data[0].code_value}`);

    // Check if ingredient name appears in top results
    const ingredientName = med.original_text.split(':')[1]?.split(/\d/)[0]?.trim().toLowerCase();
    const topResultsContainIngredient = data.slice(0, 5).some((r: any) =>
      r.display_name.toLowerCase().includes(ingredientName || 'xxx')
    );

    console.log(`- Top 5 contain "${ingredientName}": ${topResultsContainIngredient ? '✓' : '✗'}`);

    if (!topResultsContainIngredient) {
      console.log('⚠️  WARNING: Top results do not contain the medication ingredient!');
    }

    console.log('\n');
  }
}

testRealPass1Entities().catch(console.error);
