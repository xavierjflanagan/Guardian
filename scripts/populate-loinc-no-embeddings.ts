/**
 * Populate LOINC codes WITHOUT embeddings (for visual inspection)
 *
 * Purpose: Load LOINC data into Supabase so user can inspect structure
 * before generating expensive embeddings
 *
 * Usage:
 *   pnpm exec tsx scripts/populate-loinc-no-embeddings.ts
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
  console.error('❌ Missing environment variables in .env.local:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

interface LoincCode {
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
  console.log('LOINC Population Script (No Embeddings)');
  console.log('==========================================\n');

  // 1. Load LOINC codes
  const inputPath = path.join(
    process.cwd(),
    'data',
    'medical-codes',
    'loinc',
    'processed',
    'loinc_codes.json'
  );

  console.log(`Loading LOINC codes from: ${inputPath}`);

  if (!fs.existsSync(inputPath)) {
    console.error(`[ERROR] File not found: ${inputPath}`);
    process.exit(1);
  }

  const codes: LoincCode[] = await fs.readJson(inputPath);
  console.log(`[OK] Loaded ${codes.length} LOINC codes\n`);

  // 2. Transform to database rows (NO embedding field) - matching actual database schema
  console.log('Transforming to database format...');
  const rows: DatabaseRow[] = codes.map(code => ({
    code_system: 'loinc',
    code_value: code.code_value,
    display_name: code.display_name,
    country_code: code.country_code, // "AUS" - treating LOINC as Australian-specific library
    // Use correct entity types from parsed data (Migration 36 added support)
    // Supported: observation, lab_result, vital_sign, physical_finding
    entity_type: code.entity_type as 'observation' | 'lab_result' | 'vital_sign' | 'physical_finding',
    search_text: code.search_text,
    synonyms: code.synonyms, // Store in synonyms array column (actual database schema)
    library_version: code.library_version,
    valid_from: new Date().toISOString().split('T')[0],
    valid_to: null,
    superseded_by: null,
    active: true,
    authority_required: false,
    // Migration 28 fields - following PBS defaults
    clinical_specificity: 'general', // Default for LOINC codes
    typical_setting: 'any', // LOINC used across all settings
  }));

  console.log(`[OK] Transformed ${rows.length} rows\n`);

  // 3. Insert in batches
  console.log(`Inserting into Supabase (batch size: ${BATCH_SIZE})...`);

  let totalInserted = 0;
  let totalFailed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

    process.stdout.write(`   Batch ${batchNum}/${totalBatches} (${batch.length} codes)... `);

    try {
      const { data, error } = await supabase
        .from('regional_medical_codes')
        .upsert(batch, {
          onConflict: 'code_system,code_value,country_code',
          ignoreDuplicates: false // Update existing rows on conflict
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
  console.log('\n' + '='.repeat(60));
  console.log('POPULATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total codes processed:  ${rows.length}`);
  console.log(`Successfully upserted:  ${totalInserted}`);
  console.log(`Failed:                 ${totalFailed}`);
  console.log('='.repeat(60));
  console.log(`Note: Upsert updates existing rows, so re-runs are safe.`);

  if (totalInserted > 0) {
    console.log('\nLOINC codes populated successfully!');
    console.log('\nNext Steps:');
    console.log('1. Open Supabase dashboard and inspect regional_medical_codes table');
    console.log('2. Filter by code_system = "loinc" AND country_code = "AUS"');
    console.log('3. Verify columns: search_text, entity_type, region_specific_data (includes synonyms)');
    console.log('4. Confirm what you want embedded (search_text field)');
    console.log('5. Run: npx tsx generate-embeddings.ts --code-system=loinc');
    console.log('6. Embeddings will be added via UPDATE statements');
  }
}

main().catch(console.error);
