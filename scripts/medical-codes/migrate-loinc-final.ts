import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://napoydbbuvbpyciwjdci.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const BATCH_SIZE = 500;  // Ultra-conservative batch size to avoid timeouts and memory issues
const DELAY_MS = 2000;   // 2-second delay between batches
const START_OFFSET = parseInt(process.env.START_OFFSET || '0', 10); // Resume capability

// Helper: Sleep function
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Retry logic for transient failures
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 5000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      if (attempt === maxRetries) throw error;

      console.log(`   Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
      console.log(`   Error: ${error.message}`);
      await sleep(delayMs);
    }
  }
  throw new Error('Max retries exceeded');
}

async function migrateLOINC() {
  console.log('=== LOINC Migration: Regional → Universal (Production) ===\n');
  console.log(`Configuration:`);
  console.log(`  - Batch size: ${BATCH_SIZE} records`);
  console.log(`  - Delay between batches: ${DELAY_MS}ms`);
  console.log(`  - Starting offset: ${START_OFFSET}`);
  console.log('');

  try {
    // Step 1: Count total records
    console.log('Step 1: Counting LOINC records...');
    const { count: totalCount, error: countError } = await supabase
      .from('regional_medical_codes')
      .select('*', { count: 'exact', head: true })
      .eq('code_system', 'loinc');

    if (countError) throw countError;
    if (!totalCount) throw new Error('No LOINC records found in regional table');

    console.log(`   Found ${totalCount} total LOINC records in regional table`);

    // Step 2: Delete incomplete records from universal table (only if starting fresh)
    if (START_OFFSET === 0) {
      console.log('\nStep 2: Deleting incomplete LOINC records from universal table...');

      const { count: existingCount } = await supabase
        .from('universal_medical_codes')
        .select('*', { count: 'exact', head: true })
        .eq('code_system', 'loinc');

      console.log(`   Found ${existingCount || 0} existing LOINC records`);

      const { error: deleteError } = await retryOperation(() =>
        supabase
          .from('universal_medical_codes')
          .delete()
          .eq('code_system', 'loinc')
      );

      if (deleteError) throw deleteError;
      console.log(`   ✓ Deleted ${existingCount || 0} incomplete records`);
    } else {
      console.log(`\nStep 2: Skipping deletion (resuming from offset ${START_OFFSET})`);
    }

    // Step 3: Migrate in small batches
    console.log('\nStep 3: Migrating LOINC records in batches...');
    console.log(`   Total batches: ${Math.ceil(totalCount / BATCH_SIZE)}`);
    console.log(`   Estimated time: ~${Math.ceil((totalCount / BATCH_SIZE) * (DELAY_MS / 1000))} seconds\n`);

    let successCount = 0;
    let errorCount = 0;
    const startTime = Date.now();

    for (let offset = START_OFFSET; offset < totalCount; offset += BATCH_SIZE) {
      const batchNumber = Math.floor(offset / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(totalCount / BATCH_SIZE);
      const remaining = totalCount - offset;
      const currentBatchSize = Math.min(BATCH_SIZE, remaining);

      try {
        // Fetch batch from regional table
        const { data: batch, error: fetchError } = await retryOperation(() =>
          supabase
            .from('regional_medical_codes')
            .select(`
              code_system, code_value, display_name, embedding, entity_type,
              search_text, synonyms, library_version, valid_from, valid_to,
              superseded_by, usage_frequency, active, last_updated, embedding_batch_id,
              clinical_specificity, typical_setting, normalized_embedding_text,
              normalized_embedding, authority_required, sapbert_embedding,
              sapbert_embedding_generated_at, active_embedding_model
            `)
            .eq('code_system', 'loinc')
            .range(offset, offset + BATCH_SIZE - 1)
        );

        if (fetchError) throw fetchError;
        if (!batch || batch.length === 0) {
          console.log(`   [${batchNumber}/${totalBatches}] No records found at offset ${offset}`);
          break;
        }

        // Insert batch into universal table
        const { error: insertError } = await retryOperation(() =>
          supabase
            .from('universal_medical_codes')
            .insert(batch)
        );

        if (insertError) throw insertError;

        successCount += batch.length;
        const progress = ((offset + batch.length) / totalCount * 100).toFixed(1);
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const rate = successCount / elapsed;
        const eta = Math.ceil((totalCount - offset - batch.length) / rate);

        console.log(
          `   [${batchNumber}/${totalBatches}] ✓ Migrated ${batch.length} records ` +
          `(offset ${offset}) | Progress: ${progress}% | ` +
          `Rate: ${rate.toFixed(1)} rec/s | ETA: ${eta}s`
        );

        // Release memory
        batch.length = 0;

        // Delay before next batch (except for last batch)
        if (offset + BATCH_SIZE < totalCount) {
          await sleep(DELAY_MS);
        }

      } catch (error: any) {
        errorCount++;
        console.error(`   [${batchNumber}/${totalBatches}] ✗ Failed at offset ${offset}: ${error.message}`);
        console.error(`   To resume, run with: START_OFFSET=${offset} npm run migrate-loinc-final`);
        throw error;
      }
    }

    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    console.log(`\n   ✓ Migration completed successfully!`);
    console.log(`   - Total records migrated: ${successCount}`);
    console.log(`   - Total time: ${totalTime}s`);
    console.log(`   - Average rate: ${(successCount / totalTime).toFixed(1)} records/second`);

    // Step 4: Verification
    console.log('\nStep 4: Verifying migration...');
    const { count: finalCount } = await supabase
      .from('universal_medical_codes')
      .select('*', { count: 'exact', head: true })
      .eq('code_system', 'loinc');

    console.log(`   Regional table: ${totalCount} LOINC records`);
    console.log(`   Universal table: ${finalCount} LOINC records`);

    if (finalCount === totalCount) {
      console.log(`   ✓ Counts match! Migration successful.\n`);
    } else {
      console.error(`   ✗ Count mismatch! Expected ${totalCount}, got ${finalCount}`);
      throw new Error('Migration verification failed');
    }

    // Step 5: Sample check
    console.log('Step 5: Checking Migration 60 columns...');
    const { data: sample } = await supabase
      .from('universal_medical_codes')
      .select('code_value, display_name, authority_required, active_embedding_model')
      .eq('code_system', 'loinc')
      .limit(5);

    console.log('   Sample records:');
    console.table(sample);

    console.log('\n=== Migration Complete ===');
    console.log('Next steps:');
    console.log('1. Run: START_OFFSET=0 npm run verify-loinc-migration');
    console.log('2. Delete LOINC from regional_medical_codes (after verification)');
    console.log('3. Create HNSW vector index on universal_medical_codes');

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.code) console.error('   Error code:', error.code);
    if (error.hint) console.error('   Hint:', error.hint);
    process.exit(1);
  }
}

migrateLOINC().catch(console.error);
