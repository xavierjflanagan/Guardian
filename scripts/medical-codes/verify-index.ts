import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://napoydbbuvbpyciwjdci.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyIndex() {
  console.log('=== Index and Embedding Verification ===\n');

  // 1. Check embedding counts by code system
  console.log('1. Embeddings by code system:');
  const { data: codeSystems, error: csError } = await supabase.rpc('exec_sql', {
    query: `
      SELECT
        code_system,
        COUNT(*) as total_codes,
        COUNT(embedding) as codes_with_embeddings,
        ROUND(100.0 * COUNT(embedding) / COUNT(*), 1) as percentage
      FROM universal_medical_codes
      GROUP BY code_system
      ORDER BY code_system;
    `
  });

  if (csError) {
    console.error('Error querying code systems:', csError);
  } else {
    console.table(codeSystems);
  }

  // 2. Sample LOINC embeddings
  console.log('\n2. Sample LOINC codes with embeddings:');
  const { data: loincSamples, error: loincError } = await supabase
    .from('universal_medical_codes')
    .select('code_system, code_value, display_name, active_embedding_model')
    .eq('code_system', 'loinc')
    .not('embedding', 'is', null)
    .limit(3);

  if (loincError) {
    console.error('Error:', loincError);
  } else {
    console.table(loincSamples);
  }

  // 3. Sample SNOMED embeddings
  console.log('\n3. Sample SNOMED codes with embeddings:');
  const { data: snomedSamples, error: snomedError } = await supabase
    .from('universal_medical_codes')
    .select('code_system, code_value, display_name, active_embedding_model')
    .eq('code_system', 'snomed')
    .not('embedding', 'is', null)
    .limit(3);

  if (snomedError) {
    console.error('Error:', snomedError);
  } else {
    console.table(snomedSamples);
  }

  // 4. Check index usage (via raw SQL if RPC available)
  console.log('\n4. Index information:');
  console.log('Note: Direct index stats require database superuser access.');
  console.log('Index name: idx_universal_codes_vector');
  console.log('Index type: IVFFlat (pgvector)');
  console.log('Index columns: embedding (vector_cosine_ops)');
  console.log('Index parameters: lists=500');

  console.log('\n=== Verification Complete ===');
}

verifyIndex().catch(console.error);
