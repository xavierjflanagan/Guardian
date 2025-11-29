import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://napoydbbuvbpyciwjdci.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'SUPABASE_SERVICE_ROLE_KEY_REMOVED';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function truthTest() {
  console.log('=== RPC TRUTH TEST ===');
  console.log('Testing if RPC can find a known procedure using its own embedding\n');

  // STEP 1: Get a known procedure's embedding from the database
  console.log('STEP 1: Fetching MBS 20706 (cholecystectomy) and its embedding...');
  const { data: procedureData, error: fetchError } = await supabase
    .from('regional_medical_codes')
    .select('code_value, display_name, entity_type, country_code, active, embedding')
    .eq('code_system', 'mbs')
    .eq('code_value', '20706')
    .single();

  if (fetchError || !procedureData) {
    console.error('Failed to fetch procedure:', fetchError);
    return;
  }

  console.log(`✓ Found: ${procedureData.display_name.substring(0, 60)}...`);
  console.log(`  Code: MBS ${procedureData.code_value}`);
  console.log(`  Entity Type: ${procedureData.entity_type}`);
  console.log(`  Country: ${procedureData.country_code}`);
  console.log(`  Active: ${procedureData.active}`);
  console.log(`  Embedding: ${procedureData.embedding ? 'present' : 'NULL'}\n`);

  if (!procedureData.embedding) {
    console.error('❌ No embedding found for this procedure!');
    return;
  }

  // STEP 2: Call RPC with this procedure's own embedding
  console.log('STEP 2: Calling search_regional_codes() RPC with this embedding...');
  console.log('Parameters:');
  console.log(`  entity_type_filter: 'procedure'`);
  console.log(`  country_code_filter: 'AUS'`);
  console.log(`  max_results: 5`);
  console.log(`  min_similarity: 0.0\n`);

  const { data: rpcData, error: rpcError, status } = await supabase.rpc('search_regional_codes', {
    query_embedding: procedureData.embedding,
    entity_type_filter: 'procedure',
    country_code_filter: 'AUS',
    max_results: 5,
    min_similarity: 0.0
  });

  console.log(`Response Status: ${status}`);
  console.log(`RPC Error: ${rpcError ? JSON.stringify(rpcError, null, 2) : 'null'}`);
  console.log(`Results Count: ${rpcData?.length || 0}\n`);

  if (rpcError) {
    console.error('❌ RPC CALL FAILED');
    return;
  }

  if (!rpcData || rpcData.length === 0) {
    console.error('❌ RPC RETURNED ZERO RESULTS');
    console.error('   CRITICAL: RPC cannot even find a procedure using its OWN embedding!');
    console.error('   This proves the RPC function itself is broken.\n');
    return;
  }

  // STEP 3: Verify top result is the same procedure
  console.log('STEP 3: RESULTS\n');
  console.log('Rank | Similarity | Code      | Match?');
  console.log('-'.repeat(80));

  rpcData.forEach((result: any, index: number) => {
    const rank = `#${index + 1}`.padEnd(5);
    const similarity = `${(result.similarity_score * 100).toFixed(1)}%`.padEnd(11);
    const code = `MBS ${result.code_value}`.padEnd(10);
    const isMatch = result.code_value === procedureData.code_value ? '✓ EXACT MATCH' : '';
    console.log(`${rank}| ${similarity}| ${code}| ${isMatch}`);
  });

  console.log('\n');

  const topResult = rpcData[0];
  const isTopMatch = topResult.code_value === procedureData.code_value;
  const isTopPerfect = topResult.similarity_score >= 0.99;

  console.log('ANALYSIS:');
  console.log(`- Expected: MBS ${procedureData.code_value} with ~100% similarity`);
  console.log(`- Got: MBS ${topResult.code_value} with ${(topResult.similarity_score * 100).toFixed(1)}% similarity`);
  console.log(`- Top result matches: ${isTopMatch ? '✓ YES' : '✗ NO'}`);
  console.log(`- Similarity is perfect: ${isTopPerfect ? '✓ YES' : '✗ NO'}\n`);

  if (isTopMatch && isTopPerfect) {
    console.log('✅ TRUTH TEST PASSED');
    console.log('   RPC function works correctly when given a known embedding.');
    console.log('   The zero-results issue is NOT an RPC bug.');
    console.log('   Problem is: OpenAI embeddings of free text ("Cholecystectomy")');
    console.log('   don\'t match embeddings in database (from search_text field).\n');
  } else {
    console.log('❌ TRUTH TEST FAILED');
    console.log('   RPC cannot even find a procedure using its own embedding.');
    console.log('   This is a critical RPC or database bug.\n');
  }
}

truthTest().catch(console.error);
