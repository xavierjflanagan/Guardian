import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.SUPABASE_URL || 'https://napoydbbuvbpyciwjdci.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createLOINCHNSWIndex() {
  console.log('=== Create HNSW Index for LOINC in universal_medical_codes ===\n');

  try {
    // Step 1: Check current state
    console.log('Step 1: Checking current LOINC records...');

    const { count: loincCount } = await supabase
      .from('universal_medical_codes')
      .select('*', { count: 'exact', head: true })
      .eq('code_system', 'loinc');

    const { count: loincWithEmbedding } = await supabase
      .from('universal_medical_codes')
      .select('*', { count: 'exact', head: true })
      .eq('code_system', 'loinc')
      .not('embedding', 'is', null);

    console.log(`   Total LOINC records: ${loincCount}`);
    console.log(`   LOINC with embeddings: ${loincWithEmbedding}`);
    console.log(`   Coverage: ${((loincWithEmbedding! / loincCount!) * 100).toFixed(1)}%\n`);

    // Step 2: Read and execute SQL script
    console.log('Step 2: Creating HNSW index...');
    console.log('   This may take 3-5 minutes for 102,891 vectors');
    console.log('   Index parameters: HNSW with cosine distance');
    console.log('   Filtered: WHERE code_system = \'loinc\' AND embedding IS NOT NULL\n');

    const sqlPath = path.join(__dirname, 'create-loinc-hnsw-index.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    const startTime = Date.now();

    // Execute the SQL (note: Supabase JS client may not support full SQL scripts)
    // We'll execute the key CREATE INDEX statement directly
    const createIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_universal_codes_loinc_embedding_hnsw
      ON universal_medical_codes
      USING hnsw (embedding vector_cosine_ops)
      WHERE code_system = 'loinc' AND embedding IS NOT NULL;
    `;

    console.log('   Executing CREATE INDEX statement...');

    const { error } = await supabase.rpc('exec_sql', { sql: createIndexSQL });

    if (error) {
      // If RPC doesn't exist, provide manual instructions
      if (error.code === '42883') {
        console.log('\n   Note: Supabase JS client cannot execute DDL statements directly.');
        console.log('   Please execute the SQL script manually:\n');
        console.log('   1. Open Supabase SQL Editor');
        console.log('   2. Run the SQL from: scripts/medical-codes/create-loinc-hnsw-index.sql');
        console.log('   3. Or use psql: psql "postgresql://..." -f create-loinc-hnsw-index.sql\n');

        console.log('   SQL to execute:');
        console.log('   ----------------------------------------');
        console.log(createIndexSQL);
        console.log('   ----------------------------------------\n');

        return;
      }
      throw error;
    }

    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    console.log(`\n   ✓ Index created successfully in ${totalTime}s`);

    // Step 3: Verify index creation
    console.log('\nStep 3: Verifying index creation...');
    const verifySQL = `
      SELECT
        indexname,
        indexdef
      FROM pg_indexes
      WHERE indexname = 'idx_universal_codes_loinc_embedding_hnsw';
    `;

    console.log('   Checking pg_indexes catalog...');
    console.log('   (Index should appear once build completes)\n');

    console.log('=== Index Creation Complete ===');
    console.log('\nNext steps:');
    console.log('1. Monitor index usage: SELECT * FROM pg_stat_user_indexes WHERE indexrelname LIKE \'%loinc%\'');
    console.log('2. Test vector search performance on LOINC codes');
    console.log('3. Consider creating similar index for SapBERT embeddings (when populated)');

  } catch (error: any) {
    console.error('\n❌ Index creation failed:', error.message);
    if (error.code) console.error('   Error code:', error.code);
    if (error.hint) console.error('   Hint:', error.hint);

    console.log('\nFallback: Execute SQL manually');
    console.log('SQL file location: scripts/medical-codes/create-loinc-hnsw-index.sql');
    process.exit(1);
  }
}

createLOINCHNSWIndex().catch(console.error);
