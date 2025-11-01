/**
 * Delete MBS Codes from Supabase Database
 *
 * Purpose: Remove billing procedure codes that are not clinically useful
 *
 * Usage:
 *   npx tsx scripts/delete-mbs-codes.ts
 *   npx tsx scripts/delete-mbs-codes.ts --dry-run
 *
 * Created: 2025-10-31
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

// ============================================================================
// Configuration
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const isDryRun = process.argv.includes('--dry-run');

// ============================================================================
// Supabase Client
// ============================================================================

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ============================================================================
// Main Function
// ============================================================================

async function deleteMbsCodes() {
  console.log('='.repeat(80));
  console.log('MBS Code Deletion Script');
  console.log('='.repeat(80));
  console.log();

  if (isDryRun) {
    console.log('[DRY RUN MODE] No changes will be made to the database');
    console.log();
  }

  // Step 1: Count MBS codes
  console.log('Step 1: Counting MBS codes in regional_medical_codes table...');
  const { count, error: countError } = await supabase
    .from('regional_medical_codes')
    .select('*', { count: 'exact', head: true })
    .eq('code_system', 'mbs');

  if (countError) {
    console.error('ERROR counting MBS codes:', countError.message);
    process.exit(1);
  }

  console.log(`Found ${count} MBS codes to delete`);
  console.log();

  if (count === 0) {
    console.log('No MBS codes found. Nothing to delete.');
    return;
  }

  // Step 2: Delete MBS codes (if not dry run)
  if (!isDryRun) {
    console.log('Step 2: Deleting MBS codes (this may take a minute)...');

    // Simple delete without batching - let Supabase handle it
    const { error: deleteError } = await supabase.rpc('delete_mbs_codes', {});

    // If RPC doesn't exist, fall back to direct delete
    if (deleteError && deleteError.message.includes('function')) {
      console.log('Using direct delete method...');
      const { error: directDeleteError } = await supabase
        .from('regional_medical_codes')
        .delete()
        .eq('code_system', 'mbs');

      if (directDeleteError) {
        console.error('ERROR deleting MBS codes:', directDeleteError.message);
        console.log('\nTrying alternative method: fetching and deleting by ID...');

        // Fetch all MBS code IDs and delete in batches
        const { data: mbsCodes, error: fetchError } = await supabase
          .from('regional_medical_codes')
          .select('id')
          .eq('code_system', 'mbs');

        if (fetchError || !mbsCodes) {
          console.error('ERROR fetching MBS code IDs:', fetchError?.message);
          process.exit(1);
        }

        console.log(`Fetched ${mbsCodes.length} MBS code IDs`);
        const batchSize = 500;

        for (let i = 0; i < mbsCodes.length; i += batchSize) {
          const batch = mbsCodes.slice(i, i + batchSize);
          const ids = batch.map(code => code.id);

          const { error: batchDeleteError } = await supabase
            .from('regional_medical_codes')
            .delete()
            .in('id', ids);

          if (batchDeleteError) {
            console.error(`ERROR deleting batch ${i / batchSize + 1}:`, batchDeleteError.message);
            process.exit(1);
          }

          console.log(`Deleted ${Math.min(i + batchSize, mbsCodes.length)}/${mbsCodes.length} codes`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    console.log(`Successfully deleted ${count} MBS codes`);
    console.log();

    // Step 3: Verify deletion
    console.log('Step 3: Verifying deletion...');
    const { count: remainingCount, error: verifyError } = await supabase
      .from('regional_medical_codes')
      .select('*', { count: 'exact', head: true })
      .eq('code_system', 'mbs');

    if (verifyError) {
      console.error('ERROR verifying deletion:', verifyError.message);
      process.exit(1);
    }

    if (remainingCount === 0) {
      console.log('Verification successful: No MBS codes remaining');
    } else {
      console.error(`WARNING: ${remainingCount} MBS codes still remain!`);
    }
  } else {
    console.log('[DRY RUN] Would delete ${count} MBS codes');
  }

  console.log();
  console.log('='.repeat(80));
  console.log('Deletion complete!');
  console.log('='.repeat(80));
}

// ============================================================================
// Run Script
// ============================================================================

deleteMbsCodes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
