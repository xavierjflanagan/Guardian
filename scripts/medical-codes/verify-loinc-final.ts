import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://napoydbbuvbpyciwjdci.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyLOINCMigration() {
  console.log('=== LOINC Migration Verification ===\n');

  try {
    // 1. Count comparison
    console.log('1. Count Verification:');
    const { count: regionalCount } = await supabase
      .from('regional_medical_codes')
      .select('*', { count: 'exact', head: true })
      .eq('code_system', 'loinc');

    const { count: universalCount } = await supabase
      .from('universal_medical_codes')
      .select('*', { count: 'exact', head: true })
      .eq('code_system', 'loinc');

    console.log(`   Regional table: ${regionalCount} records`);
    console.log(`   Universal table: ${universalCount} records`);

    if (regionalCount === universalCount) {
      console.log(`   ✓ Counts match!\n`);
    } else {
      console.error(`   ✗ COUNT MISMATCH! Missing ${(regionalCount || 0) - (universalCount || 0)} records\n`);
    }

    // 2. Schema verification (Migration 60 columns)
    console.log('2. Schema Verification (Migration 60 columns):');
    const { data: schemaCheck, error: schemaError } = await supabase
      .from('universal_medical_codes')
      .select('code_value, authority_required, sapbert_embedding, sapbert_embedding_generated_at, active_embedding_model')
      .eq('code_system', 'loinc')
      .limit(10);

    if (schemaError) {
      console.error(`   ✗ Schema check failed: ${schemaError.message}`);
      console.error(`   Missing columns from Migration 60!\n`);
    } else {
      console.log(`   ✓ All Migration 60 columns present`);
      console.log(`   Sample count: ${schemaCheck?.length || 0}\n`);
    }

    // 3. Embedding preservation check
    console.log('3. Embedding Preservation:');
    const { data: embeddingCheck } = await supabase
      .from('universal_medical_codes')
      .select('code_value, display_name, embedding')
      .eq('code_system', 'loinc')
      .limit(1000);

    const withEmbeddings = embeddingCheck?.filter(r => r.embedding !== null).length || 0;
    const coverage = embeddingCheck?.length ? ((withEmbeddings / embeddingCheck.length) * 100).toFixed(1) : 0;

    console.log(`   Sample size: ${embeddingCheck?.length || 0}`);
    console.log(`   With embeddings: ${withEmbeddings}`);
    console.log(`   Coverage: ${coverage}%`);

    if (coverage === '100.0') {
      console.log(`   ✓ All embeddings preserved!\n`);
    } else {
      console.warn(`   ⚠ Warning: Not all records have embeddings\n`);
    }

    // 4. Sample data display
    console.log('4. Sample Records:');
    const { data: sampleRecords } = await supabase
      .from('universal_medical_codes')
      .select('code_value, display_name, entity_type, authority_required, active_embedding_model')
      .eq('code_system', 'loinc')
      .limit(5);

    console.table(sampleRecords);

    // 5. Final verdict
    console.log('\n=== Verification Summary ===');
    if (regionalCount === universalCount && !schemaError && coverage === '100.0') {
      console.log('✓ Migration SUCCESSFUL - All checks passed!');
      console.log('\nNext steps:');
      console.log('1. DELETE FROM regional_medical_codes WHERE code_system = \'loinc\';');
      console.log('2. Create HNSW vector index on universal_medical_codes');
    } else {
      console.log('⚠ Migration has issues - review output above');
    }

  } catch (error: any) {
    console.error('\n❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifyLOINCMigration().catch(console.error);
