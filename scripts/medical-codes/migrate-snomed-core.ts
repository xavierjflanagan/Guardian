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

interface SnomedCoreRow {
  code: string;
  description: string;
  status: string;
  umls_cui: string | null;
  occurrence: number | null;
  usage: number | null;
  first_in_subset: string;
  is_retired: boolean;
  last_in_subset: string | null;
  replaced_by: string | null;
}

async function migrateSnomedCore() {
  console.log('=== SNOMED CT CORE Subset Migration to universal_medical_codes ===\n');

  const dataPath = path.join(__dirname, '../../data/medical-codes/snomed/core-subset/SNOMEDCT_CORE_SUBSET_202506.txt');

  console.log(`Reading SNOMED CORE data from: ${dataPath}`);
  const fileContent = fs.readFileSync(dataPath, 'utf-8');
  const lines = fileContent.trim().split('\n');

  console.log(`Total lines: ${lines.length}`);
  console.log(`Header: ${lines[0]}\n`);

  // Parse data rows (skip header)
  const rows: SnomedCoreRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('|');
    if (parts.length < 10) {
      console.warn(`Skipping malformed line ${i + 1}: ${lines[i]}`);
      continue;
    }

    rows.push({
      code: parts[0].trim(),
      description: parts[1].trim(),
      status: parts[2].trim(),
      umls_cui: parts[3].trim() || null,
      occurrence: parts[4] && parts[4].trim() !== 'NULL' ? parseInt(parts[4].trim()) : null,
      usage: parts[5] && parts[5].trim() !== 'NULL' ? parseFloat(parts[5].trim()) : null,
      first_in_subset: parts[6].trim(),
      is_retired: parts[7].trim() === 'True',
      last_in_subset: parts[8].trim() !== 'NULL' ? parts[8].trim() : null,
      replaced_by: parts[9].trim() !== 'NULL' ? parts[9].trim() : null,
    });
  }

  console.log(`Parsed ${rows.length} SNOMED CORE codes\n`);

  // Statistics
  const currentCodes = rows.filter(r => r.status === 'Current');
  const retiredCodes = rows.filter(r => r.status === 'Not current');

  console.log('Statistics:');
  console.log(`  Current codes: ${currentCodes.length}`);
  console.log(`  Retired codes: ${retiredCodes.length}`);
  console.log(`  With UMLS mapping: ${rows.filter(r => r.umls_cui).length}`);
  console.log(`  With usage data: ${rows.filter(r => r.usage !== null).length}\n`);

  // Check current state in database
  console.log('Checking current database state...');

  // Get unique code values from parsed data
  const codeValues = rows.map(r => r.code);

  const { count: existingCount } = await supabase
    .from('universal_medical_codes')
    .select('*', { count: 'exact', head: true })
    .eq('code_system', 'snomed')
    .in('code_value', codeValues);

  console.log(`  Existing SNOMED CORE records: ${existingCount}\n`);

  // Prepare records for insertion
  console.log('Preparing records for upsert...');
  const records = rows.map(row => ({
    code_system: 'snomed',
    code_value: row.code,
    display_name: row.description,
    entity_type: 'condition',  // SNOMED CORE is primarily conditions/diagnoses
    search_text: row.description,  // Use FSN (Fully Specified Name) for search
    active: row.status === 'Current',
    // Note: SNOMED CORE specific metadata (UMLS CUI, occurrence, usage, etc.)
    // is available in the source file but not stored in universal_medical_codes
    // These fields could be added in a future migration if needed
  }));

  console.log(`Prepared ${records.length} records for insertion\n`);

  // Insert in batches
  const BATCH_SIZE = 500;
  let successCount = 0;
  let errorCount = 0;

  console.log(`Starting upsert in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(records.length / BATCH_SIZE);

    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${i + 1}-${Math.min(i + BATCH_SIZE, records.length)})... `);

    const { data, error } = await supabase
      .from('universal_medical_codes')
      .upsert(batch, {
        onConflict: 'code_system,code_value',
        ignoreDuplicates: false,
      });

    if (error) {
      console.log(`ERROR: ${error.message}`);
      errorCount += batch.length;
    } else {
      console.log('OK');
      successCount += batch.length;
    }
  }

  console.log(`\nMigration complete!`);
  console.log(`  Success: ${successCount} records`);
  console.log(`  Errors: ${errorCount} records\n`);

  // Verify final counts
  console.log('Verifying migration...');
  const { count: finalCount } = await supabase
    .from('universal_medical_codes')
    .select('*', { count: 'exact', head: true })
    .eq('code_system', 'snomed')
    .in('code_value', codeValues);

  const { count: currentOnlyCount } = await supabase
    .from('universal_medical_codes')
    .select('*', { count: 'exact', head: true })
    .eq('code_system', 'snomed')
    .in('code_value', codeValues)
    .eq('active', true);

  console.log(`  Total SNOMED CORE in database: ${finalCount}`);
  console.log(`  Current/active codes: ${currentOnlyCount}`);
  console.log(`  Retired codes: ${(finalCount || 0) - (currentOnlyCount || 0)}\n`);

  console.log('Next steps:');
  console.log('1. Generate embeddings for SNOMED CORE codes');
  console.log('2. Create HNSW index for vector search');
  console.log('3. Test semantic search on medical conditions\n');
}

migrateSnomedCore().catch(console.error);
