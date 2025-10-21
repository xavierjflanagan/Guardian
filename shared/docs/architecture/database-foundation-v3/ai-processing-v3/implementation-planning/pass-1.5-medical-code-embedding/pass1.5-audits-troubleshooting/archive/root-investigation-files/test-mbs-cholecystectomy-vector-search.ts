import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// Initialize clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface VectorSearchResult {
  id: string;
  code_system: string;
  code_value: string;
  display_name: string;
  search_text: string;
  entity_type: string;
  country_code: string;
  library_version: string;
  active: boolean;
  similarity_score: number;
}

async function testCholecystectomyVectorSearch() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  MBS PROCEDURE VECTOR SEARCH TEST: Cholecystectomy            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Test queries
  const queries = [
    'Cholecystectomy',
    'Laparoscopic cholecystectomy',
    'Removal of gallbladder',
    'Gallbladder removal surgery'
  ];

  for (const queryText of queries) {
    console.log('\n' + '═'.repeat(70));
    console.log(`QUERY: "${queryText}"`);
    console.log('═'.repeat(70) + '\n');

    try {
      // Step 1: Generate embedding
      console.log('Step 1: Generating OpenAI embedding...');
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: queryText
      });

      const embedding = embeddingResponse.data[0].embedding;
      console.log(`✓ Generated ${embedding.length}-dimensional vector\n`);

      // Step 2: Vector search via RPC
      console.log('Step 2: Searching MBS procedure codes...');
      const { data, error } = await supabase.rpc('search_regional_codes', {
        query_embedding: embedding,
        entity_type_filter: 'procedure',
        country_code_filter: 'AUS',
        max_results: 20,
        min_similarity: 0.50
      });

      if (error) {
        console.error('❌ Error:', error);
        continue;
      }

      console.log(`✓ Found ${data.length} results above 50% similarity\n`);

      // Step 3: Display results
      if (data.length === 0) {
        console.log('⚠️  NO RESULTS FOUND - Vector search returned empty\n');
        continue;
      }

      console.log('┌─────────────────────────────────────────────────────────────────┐');
      console.log('│ RANKED RESULTS (Top 20)                                         │');
      console.log('└─────────────────────────────────────────────────────────────────┘\n');

      data.forEach((result: VectorSearchResult, index: number) => {
        const rank = index + 1;
        const similarity = (result.similarity_score * 100).toFixed(1);
        const isCholecystectomy = result.display_name.toLowerCase().includes('cholecystectomy');
        const isGallbladder = result.display_name.toLowerCase().includes('gallbladder');
        const isRelevant = isCholecystectomy || isGallbladder;

        console.log(`${rank.toString().padStart(2)}. ${isRelevant ? '✅' : '❌'} Similarity: ${similarity}%`);
        console.log(`    Code: MBS ${result.code_value}`);
        console.log(`    Name: ${result.display_name}`);
        console.log(`    Search Text: ${result.search_text.substring(0, 120)}...`);
        console.log('');
      });

      // Step 4: Analysis
      const relevantResults = data.filter((r: VectorSearchResult) =>
        r.display_name.toLowerCase().includes('cholecystectomy') ||
        r.display_name.toLowerCase().includes('gallbladder')
      );

      const topResult = data[0];
      const topIsRelevant = topResult.display_name.toLowerCase().includes('cholecystectomy') ||
                           topResult.display_name.toLowerCase().includes('gallbladder');

      console.log('┌─────────────────────────────────────────────────────────────────┐');
      console.log('│ SEARCH QUALITY ANALYSIS                                         │');
      console.log('└─────────────────────────────────────────────────────────────────┘\n');

      console.log(`Total Results: ${data.length}`);
      console.log(`Relevant Results (cholecystectomy/gallbladder): ${relevantResults.length}`);
      console.log(`Top Result Relevant: ${topIsRelevant ? 'YES ✅' : 'NO ❌'}`);
      console.log(`Top Result Code: MBS ${topResult.code_value}`);
      console.log(`Top Result Similarity: ${(topResult.similarity_score * 100).toFixed(1)}%`);
      console.log(`Top Result: ${topResult.display_name.substring(0, 80)}...`);

      if (relevantResults.length > 0) {
        console.log(`\nRelevant Codes Found:`);
        relevantResults.slice(0, 5).forEach((r: VectorSearchResult, idx: number) => {
          console.log(`  ${idx + 1}. MBS ${r.code_value} (${(r.similarity_score * 100).toFixed(1)}%)`);
        });
      }

      console.log('\n' + (topIsRelevant ? '✅ PASS: Correct code in #1 position' : '❌ FAIL: Wrong code in #1 position'));
      console.log('');

    } catch (err) {
      console.error('❌ Error:', err);
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('TEST COMPLETE');
  console.log('═'.repeat(70) + '\n');
}

testCholecystectomyVectorSearch().catch(console.error);
