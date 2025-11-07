/**
 * Populate SNOMED CT codes WITHOUT embeddings (for visual inspection)
 *
 * Purpose: Load SNOMED CT data into Supabase so user can inspect structure
 * before generating expensive embeddings
 *
 * Usage:
 *   pnpm exec tsx scripts/populate-snomed-no-embeddings.ts
 *
 * Note: Reads credentials from .env.local automatically
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('[OK] Loaded credentials from .env.local\n');
}

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BATCH_SIZE = 500; // Insert 500 codes per batch

// Validate environment
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing environment variables in .env.local:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

interface SnomedCode {
  code_system: string;
  code_value: string;
  display_name: string;
  entity_type: string;
  search_text: string;
  synonyms: string[];
  library_version: string;
  country_code: string;
  region_specific_data: Record<string, any>;
}

interface DatabaseRow {
  code_system: string;
  code_value: string;
  display_name: string;
  country_code: string;
  entity_type: string;
  search_text: string;
  synonyms: string[];
  library_version: string;
  valid_from: string;
  valid_to: null;
  superseded_by: null;
  active: boolean;
  authority_required: boolean;
  clinical_specificity: string;
  typical_setting: string;
}

async function main() {
  console.log('SNOMED CT Population Script (No Embeddings)');
  console.log('============================================\n');

  // 1. Load SNOMED codes
  const inputPath = path.join(
    process.cwd(),
    'data',
    'medical-codes',
    'snomed',
    'processed',
    'snomed_codes.json'
  );

  console.log(`Loading SNOMED CT codes from: ${inputPath}`);

  if (!fs.existsSync(inputPath)) {
    console.error(`[ERROR] File not found: ${inputPath}`);
    process.exit(1);
  }

  const codes: SnomedCode[] = await fs.readJson(inputPath);
  console.log(`[OK] Loaded ${codes.length.toLocaleString()} SNOMED CT codes\n`);

  // Show entity type distribution
  const entityTypeCounts = codes.reduce((acc, code) => {
    acc[code.entity_type] = (acc[code.entity_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('Entity Type Distribution:');
  Object.entries(entityTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      const percent = ((count / codes.length) * 100).toFixed(1);
      console.log(`  ${type.padEnd(20)} ${count.toString().padStart(7)} (${percent}%)`);
    });
  console.log('');

  // 2. Transform to database rows (NO embedding field)
  console.log('Transforming to database format...');
  const rows: DatabaseRow[] = codes.map(code => ({
    code_system: 'snomed_ct',
    code_value: code.code_value,
    display_name: code.display_name,
    country_code: 'AUS',
    entity_type: code.entity_type as any,
    search_text: code.search_text,
    synonyms: code.synonyms,
    library_version: code.library_version,
    valid_from: new Date().toISOString().split('T')[0],
    valid_to: null,
    superseded_by: null,
    active: code.region_specific_data.active !== false,
    authority_required: false,
    clinical_specificity: 'general',
    typical_setting: 'any',
  }));

  console.log(`[OK] Transformed ${rows.length.toLocaleString()} rows\n`);

  // 3. Insert in batches
  console.log(`Inserting into Supabase (batch size: ${BATCH_SIZE})...`);

  let totalInserted = 0;
  let totalFailed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
    const progress = ((i / rows.length) * 100).toFixed(1);

    process.stdout.write(`   Batch ${batchNum}/${totalBatches} (${progress}%) - ${batch.length} codes... `);

    try {
      const { data, error } = await supabase
        .from('regional_medical_codes')
        .upsert(batch, {
          onConflict: 'code_system,code_value,country_code',
          ignoreDuplicates: false
        })
        .select('id');

      if (error) {
        console.log(`[FAIL] ${error.message}`);
        totalFailed += batch.length;
      } else {
        console.log(`[OK] Upserted ${data?.length || batch.length}`);
        totalInserted += data?.length || batch.length;
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (err: any) {
      console.log(`[ERROR] ${err.message}`);
      totalFailed += batch.length;
    }
  }

  // 4. Summary
  console.log('\n' + '='.repeat(80));
  console.log('SNOMED CT POPULATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total codes processed:  ${rows.length.toLocaleString()}`);
  console.log(`Successfully upserted:  ${totalInserted.toLocaleString()}`);
  console.log(`Failed:                 ${totalFailed.toLocaleString()}`);
  console.log('='.repeat(80));
  console.log(`Note: Upsert updates existing rows, so re-runs are safe.`);

  if (totalInserted > 0) {
    console.log('\nSNOMED CT codes populated successfully!');
    console.log('\nNext Steps:');
    console.log('1. Open Supabase dashboard and inspect regional_medical_codes table');
    console.log('2. Filter by code_system = "snomed_ct" AND country_code = "AUS"');
    console.log('3. Verify columns: display_name, search_text, synonyms, entity_type');
    console.log('4. Inspect sample records to decide what to embed:');
    console.log('   - Option A: Embed display_name only (FSN with semantic tag)');
    console.log('   - Option B: Embed search_text (FSN + all synonyms combined)');
    console.log('   - Option C: Embed display_name + top 3-5 synonyms');
    console.log('5. After decision, run embedding generation script');
  }
}

main().catch(console.error);
