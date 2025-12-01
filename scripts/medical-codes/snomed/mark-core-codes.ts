#!/usr/bin/env tsx
/**
 * Mark CORE Subset Codes in Database
 *
 * Prerequisites:
 * 1. parse-core-subset.ts has been run
 * 2. core_mapping.json exists in data/medical-codes/snomed/core-subset/
 *
 * Purpose: Update regional_medical_codes table to mark CORE subset codes
 * with is_core_subset = TRUE and populate occurrence/usage metadata
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Paths
const CORE_MAPPING_FILE = 'data/medical-codes/snomed/core-subset/core_mapping.json';

// Supabase connection
const supabaseUrl = process.env.SUPABASE_URL || 'https://napoydbbuvbpyciwjdci.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hcG95ZGJidXZicHljaXdqZGNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTY3Nzk4NCwiZXhwIjoyMDY3MjUzOTg0fQ.EgNVgaVfhAdH4AvPFBGfuqRzRPTvvF83c_6cdSY7oFI';
const supabase = createClient(supabaseUrl, supabaseKey);

interface CoreMapping {
  total_core_codes: number;
  matched_in_aus_edition: number;
  not_found_in_aus: number;
  match_rate: number;
  matched_codes: Array<{
    code_value: string;
    display_name: string;
    occurrence: number;
    usage: number;
    in_database: boolean;
  }>;
}

/**
 * Check if schema columns exist
 */
async function checkSchemaReady(): Promise<boolean> {
  console.log('\n🔍 Checking database schema...');

  // Try to query the new columns
  const { data, error } = await supabase
    .from('regional_medical_codes')
    .select('is_core_subset, core_occurrence, core_usage')
    .limit(1);

  if (error) {
    console.error('❌ Schema not ready! Run database migration first.');
    console.error('Error:', error.message);
    return false;
  }

  console.log('✓ Schema ready (is_core_subset column exists)');
  return true;
}

/**
 * Mark CORE codes in database
 */
async function markCoreCodes(mapping: CoreMapping): Promise<void> {
  console.log('\n📝 Marking CORE codes in database...');
  console.log(`Total codes to mark: ${mapping.matched_codes.length}`);

  let updated = 0;
  let errors = 0;

  // Update in batches
  const batchSize = 50;
  for (let i = 0; i < mapping.matched_codes.length; i += batchSize) {
    const batch = mapping.matched_codes.slice(i, i + batchSize);

    // Update each code in batch
    for (const code of batch) {
      const { error } = await supabase
        .from('regional_medical_codes')
        .update({
          is_core_subset: true,
          core_occurrence: code.occurrence,
          core_usage: code.usage
        })
        .eq('code_system', 'snomed_ct')
        .eq('code_value', code.code_value);

      if (error) {
        console.error(`  ❌ Error updating ${code.code_value}:`, error.message);
        errors++;
      } else {
        updated++;
      }
    }

    // Progress indicator
    if (i % 500 === 0) {
      console.log(`  Progress: ${updated}/${mapping.matched_codes.length} codes marked...`);
    }
  }

  console.log(`\n✓ Marking complete:`);
  console.log(`  Successfully marked: ${updated}`);
  console.log(`  Errors: ${errors}`);
}

/**
 * Verify results
 */
async function verifyResults(): Promise<void> {
  console.log('\n🔬 Verifying results...');

  // Count CORE codes
  const { count: coreCount, error: coreError } = await supabase
    .from('regional_medical_codes')
    .select('*', { count: 'exact', head: true })
    .eq('code_system', 'snomed_ct')
    .eq('is_core_subset', true);

  if (coreError) {
    console.error('Error counting CORE codes:', coreError);
    return;
  }

  // Count total SNOMED codes
  const { count: totalCount, error: totalError } = await supabase
    .from('regional_medical_codes')
    .select('*', { count: 'exact', head: true })
    .eq('code_system', 'snomed_ct');

  if (totalError) {
    console.error('Error counting total codes:', totalError);
    return;
  }

  console.log(`\nDatabase Status:`);
  console.log(`  Total SNOMED codes: ${totalCount?.toLocaleString()}`);
  console.log(`  CORE subset codes: ${coreCount?.toLocaleString()}`);
  console.log(`  Non-CORE codes: ${((totalCount || 0) - (coreCount || 0)).toLocaleString()}`);
  console.log(`  CORE percentage: ${((coreCount || 0) / (totalCount || 1) * 100).toFixed(2)}%`);

  // Sample some CORE codes
  const { data: samples, error: samplesError } = await supabase
    .from('regional_medical_codes')
    .select('code_value, display_name, core_occurrence, core_usage')
    .eq('code_system', 'snomed_ct')
    .eq('is_core_subset', true)
    .order('core_occurrence', { ascending: false })
    .limit(5);

  if (!samplesError && samples) {
    console.log(`\nTop 5 CORE codes by institution usage:`);
    samples.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.code_value}: ${s.display_name}`);
      console.log(`     Institutions: ${s.core_occurrence}/8, Usage: ${s.core_usage}%`);
    });
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Mark CORE Subset Codes in Database');
  console.log('=====================================\n');

  // Step 1: Check if mapping file exists
  if (!fs.existsSync(CORE_MAPPING_FILE)) {
    console.error('❌ core_mapping.json not found!');
    console.error(`Expected: ${CORE_MAPPING_FILE}`);
    console.error('\nRun parse-core-subset.ts first:\n');
    console.error('  npx tsx scripts/medical-codes/snomed/parse-core-subset.ts\n');
    process.exit(1);
  }

  // Step 2: Load mapping
  console.log('📖 Loading core_mapping.json...');
  const mapping: CoreMapping = JSON.parse(
    fs.readFileSync(CORE_MAPPING_FILE, 'utf-8')
  );
  console.log(`  ✓ Loaded ${mapping.matched_codes.length} matched CORE codes`);

  // Step 3: Check schema
  const schemaReady = await checkSchemaReady();
  if (!schemaReady) {
    console.error('\n❌ Database schema not ready!');
    console.error('Run the database migration first to add CORE subset columns.\n');
    process.exit(1);
  }

  // Step 4: Mark codes
  await markCoreCodes(mapping);

  // Step 5: Verify
  await verifyResults();

  // Summary
  console.log('\n✅ CORE Codes Marked Successfully!\n');
  console.log('Next Steps:');
  console.log('1. Generate embeddings for CORE codes:');
  console.log('   npx tsx scripts/medical-codes/snomed/generate-snomed-embeddings.ts --core-only');
  console.log('2. Create partial vector index (see migration script)');
  console.log('3. Test two-tier search\n');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
