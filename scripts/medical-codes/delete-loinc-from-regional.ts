import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://napoydbbuvbpyciwjdci.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function deleteLOINCFromRegional() {
  console.log('=== Delete LOINC from regional_medical_codes ===\n');
  console.log('WARNING: This will permanently delete 102,891 LOINC records from regional_medical_codes');
  console.log('Migration verification confirmed all records exist in universal_medical_codes\n');

  try {
    // Step 1: Final verification before deletion
    console.log('Step 1: Pre-deletion verification...');

    const { count: regionalCount } = await supabase
      .from('regional_medical_codes')
      .select('*', { count: 'exact', head: true })
      .eq('code_system', 'loinc');

    const { count: universalCount } = await supabase
      .from('universal_medical_codes')
      .select('*', { count: 'exact', head: true })
      .eq('code_system', 'loinc');

    console.log(`   Regional table: ${regionalCount} LOINC records`);
    console.log(`   Universal table: ${universalCount} LOINC records`);

    if (regionalCount !== universalCount) {
      throw new Error(`Count mismatch! Regional: ${regionalCount}, Universal: ${universalCount}`);
    }

    console.log(`   ✓ Counts match (${regionalCount} records)\n`);

    // Step 2: Delete LOINC records in batches to avoid timeout
    console.log('Step 2: Deleting LOINC records from regional_medical_codes...');
    console.log('   Using ultra-small batched deletion to avoid statement timeout\n');

    const BATCH_SIZE = 50; // Ultra-small batches due to large vector embeddings
    const DELAY_MS = 500;   // 500ms delay between batches
    let deletedCount = 0;
    const startTime = Date.now();

    while (true) {
      // Fetch IDs first, then delete by ID to avoid order requirement
      const { data: batch, error: fetchError } = await supabase
        .from('regional_medical_codes')
        .select('id')
        .eq('code_system', 'loinc')
        .order('id')
        .limit(BATCH_SIZE);

      if (fetchError) {
        console.error(`   Fetch error: ${fetchError.message}`);
        throw fetchError;
      }

      if (!batch || batch.length === 0) {
        console.log(`   No more records to delete`);
        break;
      }

      // Delete by IDs
      const ids = batch.map(r => r.id);
      const { error: deleteError } = await supabase
        .from('regional_medical_codes')
        .delete()
        .in('id', ids);

      if (deleteError) {
        console.error(`   Delete error: ${deleteError.message}`);
        throw deleteError;
      }

      const count = batch.length;

      deletedCount += count;
      const progress = ((deletedCount / regionalCount!) * 100).toFixed(1);
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const rate = elapsed > 0 ? deletedCount / elapsed : 0;
      const eta = rate > 0 ? Math.ceil((regionalCount! - deletedCount) / rate) : 0;

      console.log(
        `   Deleted ${deletedCount.toLocaleString()}/${regionalCount?.toLocaleString()} records ` +
        `(${progress}%) | Rate: ${rate.toFixed(1)} rec/s | ETA: ${eta}s`
      );

      // Delay between batches to avoid overwhelming the database
      await sleep(DELAY_MS);
    }

    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    console.log(`\n   ✓ Deletion completed successfully!`);
    console.log(`   - Total records deleted: ${deletedCount.toLocaleString()}`);
    console.log(`   - Total time: ${totalTime}s`);
    console.log(`   - Average rate: ${(deletedCount / totalTime).toFixed(1)} records/second`);

    // Step 3: Verification
    console.log('\nStep 3: Post-deletion verification...');
    const { count: remainingCount } = await supabase
      .from('regional_medical_codes')
      .select('*', { count: 'exact', head: true })
      .eq('code_system', 'loinc');

    console.log(`   Remaining LOINC records in regional table: ${remainingCount || 0}`);

    if (remainingCount === 0) {
      console.log(`   ✓ All LOINC records successfully deleted from regional table\n`);
    } else {
      throw new Error(`Deletion incomplete! ${remainingCount} records remain`);
    }

    console.log('=== Deletion Complete ===');
    console.log('Next step: Create HNSW vector index on universal_medical_codes');

  } catch (error: any) {
    console.error('\n❌ Deletion failed:', error.message);
    if (error.code) console.error('   Error code:', error.code);
    if (error.hint) console.error('   Hint:', error.hint);
    process.exit(1);
  }
}

deleteLOINCFromRegional().catch(console.error);
