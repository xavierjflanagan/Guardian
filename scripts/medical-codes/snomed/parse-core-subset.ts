#!/usr/bin/env tsx
/**
 * Parse SNOMED CT CORE Subset from NLM
 *
 * Downloads: https://www.nlm.nih.gov/research/umls/Snomed/core_subset.html
 *
 * Purpose: Identify which of our 706k Australian SNOMED codes are in the
 * NLM CORE subset (validated by 7 major healthcare institutions)
 *
 * Output:
 * - core_mapping.json: SNOMED codes with CORE metadata
 * - core_stats.json: Statistics about coverage
 * - au_crossref.json: Cross-reference results
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Paths
const CORE_SUBSET_DIR = 'data/medical-codes/snomed/core-subset';
const OUTPUT_DIR = CORE_SUBSET_DIR;

// Supabase connection
const supabaseUrl = process.env.SUPABASE_URL || 'https://napoydbbuvbpyciwjdci.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hcG95ZGJidXZicHljaXdqZGNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTY3Nzk4NCwiZXhwIjoyMDY3MjUzOTg0fQ.EgNVgaVfhAdH4AvPFBGfuqRzRPTvvF83c_6cdSY7oFI';
const supabase = createClient(supabaseUrl, supabaseKey);

interface CoreSubsetRow {
  snomed_cid: string;          // SNOMED Concept ID
  snomed_fsn: string;          // Fully Specified Name
  concept_status: string;      // Active/Inactive
  umls_cui: string;           // UMLS identifier
  occurrence: number;         // 1-8 institutions
  usage: number;              // Average usage %
  first_in_subset: string;    // Date added
  is_retired: string;         // Y/N
  last_in_subset: string;     // Last version
  replaced_by: string;        // Replacement code
}

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
  missing_codes: Array<{
    code_value: string;
    display_name: string;
    occurrence: number;
    usage: number;
  }>;
}

/**
 * Find CORE subset file in the directory
 */
function findCoreSubsetFile(): string | null {
  const files = fs.readdirSync(CORE_SUBSET_DIR);
  const coreFile = files.find(f =>
    f.startsWith('SNOMEDCT_CORE_SUBSET') && f.endsWith('.txt')
  );

  if (!coreFile) {
    console.error('❌ CORE subset file not found!');
    console.error('Expected format: SNOMEDCT_CORE_SUBSET_<YYYYMM>.txt');
    console.error(`\nLooked in: ${CORE_SUBSET_DIR}`);
    console.error('\nDownload from: https://www.nlm.nih.gov/research/umls/Snomed/core_subset.html');
    return null;
  }

  return path.join(CORE_SUBSET_DIR, coreFile);
}

/**
 * Parse CORE subset file
 */
function parseCoreSubsetFile(filePath: string): CoreSubsetRow[] {
  console.log(`\n📖 Parsing: ${path.basename(filePath)}`);

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  // Skip header line
  const dataLines = lines.slice(1);

  const rows: CoreSubsetRow[] = [];

  for (const line of dataLines) {
    const cols = line.split('|');

    if (cols.length < 10) {
      console.warn(`Skipping malformed line: ${line.substring(0, 50)}...`);
      continue;
    }

    rows.push({
      snomed_cid: cols[0],
      snomed_fsn: cols[1],
      concept_status: cols[2],
      umls_cui: cols[3],
      occurrence: parseInt(cols[4]) || 0,
      usage: parseFloat(cols[5]) || 0,
      first_in_subset: cols[6],
      is_retired: cols[7],
      last_in_subset: cols[8],
      replaced_by: cols[9]
    });
  }

  console.log(`✓ Parsed ${rows.length} CORE subset codes`);
  return rows;
}

/**
 * Cross-reference with Australian SNOMED edition in database
 */
async function crossReferenceWithAustralianEdition(
  coreRows: CoreSubsetRow[]
): Promise<CoreMapping> {
  console.log('\n🔍 Cross-referencing with Australian SNOMED edition...');

  const matched: CoreMapping['matched_codes'] = [];
  const missing: CoreMapping['missing_codes'] = [];

  // Query database in batches
  const batchSize = 100;
  for (let i = 0; i < coreRows.length; i += batchSize) {
    const batch = coreRows.slice(i, i + batchSize);
    const codes = batch.map(r => r.snomed_cid);

    const { data, error } = await supabase
      .from('regional_medical_codes')
      .select('code_value, display_name')
      .eq('code_system', 'snomed_ct')
      .in('code_value', codes);

    if (error) {
      console.error('Database query error:', error);
      throw error;
    }

    const foundCodes = new Set(data?.map(d => d.code_value) || []);

    for (const row of batch) {
      const codeData = {
        code_value: row.snomed_cid,
        display_name: row.snomed_fsn,
        occurrence: row.occurrence,
        usage: row.usage
      };

      if (foundCodes.has(row.snomed_cid)) {
        matched.push({ ...codeData, in_database: true });
      } else {
        missing.push(codeData);
      }
    }

    // Progress indicator
    if (i % 500 === 0) {
      console.log(`  Processed ${i}/${coreRows.length} codes...`);
    }
  }

  const result: CoreMapping = {
    total_core_codes: coreRows.length,
    matched_in_aus_edition: matched.length,
    not_found_in_aus: missing.length,
    match_rate: matched.length / coreRows.length,
    matched_codes: matched,
    missing_codes: missing
  };

  console.log(`\n✓ Cross-reference complete:`);
  console.log(`  Total CORE codes: ${result.total_core_codes}`);
  console.log(`  Matched in AU edition: ${result.matched_in_aus_edition}`);
  console.log(`  Not found in AU: ${result.not_found_in_aus}`);
  console.log(`  Match rate: ${(result.match_rate * 100).toFixed(1)}%`);

  return result;
}

/**
 * Generate statistics
 */
function generateStatistics(coreRows: CoreSubsetRow[], mapping: CoreMapping) {
  const stats = {
    total_codes: coreRows.length,
    match_rate: mapping.match_rate,
    occurrence_distribution: {} as Record<number, number>,
    usage_stats: {
      min: Math.min(...coreRows.map(r => r.usage)),
      max: Math.max(...coreRows.map(r => r.usage)),
      avg: coreRows.reduce((sum, r) => sum + r.usage, 0) / coreRows.length
    },
    active_codes: coreRows.filter(r => r.concept_status === 'Active').length,
    retired_codes: coreRows.filter(r => r.is_retired === 'Y').length
  };

  // Count by occurrence
  for (const row of coreRows) {
    stats.occurrence_distribution[row.occurrence] =
      (stats.occurrence_distribution[row.occurrence] || 0) + 1;
  }

  return stats;
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 SNOMED CT CORE Subset Parser');
  console.log('================================\n');

  // Step 1: Find CORE subset file
  const coreFilePath = findCoreSubsetFile();
  if (!coreFilePath) {
    process.exit(1);
  }

  // Step 2: Parse file
  const coreRows = parseCoreSubsetFile(coreFilePath);

  // Step 3: Cross-reference with Australian edition
  const mapping = await crossReferenceWithAustralianEdition(coreRows);

  // Step 4: Generate statistics
  const stats = generateStatistics(coreRows, mapping);

  // Step 5: Write outputs
  console.log('\n💾 Writing output files...');

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'core_mapping.json'),
    JSON.stringify(mapping, null, 2)
  );
  console.log('  ✓ core_mapping.json');

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'core_stats.json'),
    JSON.stringify(stats, null, 2)
  );
  console.log('  ✓ core_stats.json');

  // Summary
  console.log('\n✅ CORE Subset Parsing Complete!\n');
  console.log('Next Steps:');
  console.log('1. Review core_mapping.json for matched codes');
  console.log('2. Run: npx tsx scripts/medical-codes/snomed/mark-core-codes.ts');
  console.log('3. Generate embeddings for CORE codes');
  console.log('4. Create partial vector index\n');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
