/**
 * Pass 1.5 Medical Code Database Population Script
 *
 * Purpose: Load embedded medical codes into Supabase database
 *
 * Usage:
 *   npx tsx populate-database.ts --code-system rxnorm
 *   npx tsx populate-database.ts --code-system all
 *   npx tsx populate-database.ts --code-system all --dry-run
 *
 * Requirements:
 *   - Embedded JSON files in data/medical-codes/<system>/processed/
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 *
 * Output:
 *   - Medical codes loaded into universal_medical_codes and regional_medical_codes tables
 *   - Progress logs and statistics
 *
 * Created: 2025-10-15
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Supabase configuration
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  // Batch configuration
  batch: {
    size: 1000,         // Insert 1000 codes per batch (Supabase limit: 10,000)
    delayMs: 100,       // 100ms delay between batches
  },

  // File paths
  paths: {
    dataRoot: path.join(process.cwd(), 'data', 'medical-codes'),
  },

  // Code systems
  universalSystems: ['rxnorm', 'snomed', 'loinc'],
  regionalSystems: ['pbs', 'mbs', 'icd10am'],
};

// ============================================================================
// Type Definitions
// ============================================================================

interface MedicalCodeStandard {
  code_system: string;
  code_value: string;
  display_name: string;
  entity_type: 'medication' | 'condition' | 'procedure' | 'observation' | 'allergy';
  search_text: string;
  library_version: string;
  country_code: string | null;
  region_specific_data: Record<string, any>;
  embedding: number[];
}

interface UniversalMedicalCodeRow {
  code_system: string;
  code_value: string;
  display_name: string;
  embedding: string; // pgvector format: '[0.1,0.2,...]'
  entity_type: string;
  search_text: string;
  library_version: string;
  valid_from: string; // ISO date
  valid_to: string | null;
  superseded_by: string | null;
  active: boolean;
}

interface RegionalMedicalCodeRow {
  code_system: string;
  code_value: string;
  display_name: string;
  embedding: string; // pgvector format: '[0.1,0.2,...]'
  country_code: string;
  region_specific_data: Record<string, any>;
  entity_type: string;
  search_text: string;
  library_version: string;
  valid_from: string; // ISO date
  valid_to: string | null;
  superseded_by: string | null;
  active: boolean;
  authority_required: boolean;
}

interface PopulationStats {
  codeSystem: string;
  totalCodes: number;
  successfulInserts: number;
  failedInserts: number;
  skippedDuplicates: number;
  processingTime: number;
}

// ============================================================================
// Supabase Client
// ============================================================================

const supabase = createClient(
  CONFIG.supabase.url,
  CONFIG.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// ============================================================================
// Database Population Functions
// ============================================================================

/**
 * Convert embedding array to pgvector format string
 */
function embeddingToVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Convert MedicalCodeStandard to UniversalMedicalCodeRow
 */
function toUniversalRow(code: MedicalCodeStandard): UniversalMedicalCodeRow {
  return {
    code_system: code.code_system,
    code_value: code.code_value,
    display_name: code.display_name,
    embedding: embeddingToVector(code.embedding),
    entity_type: code.entity_type,
    search_text: code.search_text,
    library_version: code.library_version,
    valid_from: new Date().toISOString().split('T')[0], // Today's date
    valid_to: null,
    superseded_by: null,
    active: true,
  };
}

/**
 * Convert MedicalCodeStandard to RegionalMedicalCodeRow
 */
function toRegionalRow(code: MedicalCodeStandard): RegionalMedicalCodeRow {
  return {
    code_system: code.code_system,
    code_value: code.code_value,
    display_name: code.display_name,
    embedding: embeddingToVector(code.embedding),
    country_code: code.country_code || 'AUS', // Default to Australia
    region_specific_data: code.region_specific_data,
    entity_type: code.entity_type,
    search_text: code.search_text,
    library_version: code.library_version,
    valid_from: new Date().toISOString().split('T')[0],
    valid_to: null,
    superseded_by: null,
    active: true,
    authority_required: code.region_specific_data?.authority_required || false,
  };
}

/**
 * Insert batch of universal medical codes
 */
async function insertUniversalBatch(
  batch: UniversalMedicalCodeRow[],
  dryRun: boolean
): Promise<{ success: number; failed: number }> {
  if (dryRun) {
    console.log(`  [DRY RUN] Would insert ${batch.length} universal codes`);
    return { success: batch.length, failed: 0 };
  }

  try {
    const { data, error } = await supabase
      .from('universal_medical_codes')
      .insert(batch);

    if (error) {
      // Check for duplicate key violations (expected on re-runs)
      if (error.code === '23505') {
        // Duplicate key - skip silently
        return { success: 0, failed: 0 };
      }
      throw error;
    }

    return { success: batch.length, failed: 0 };
  } catch (error: any) {
    console.error(`  ❌ Batch insert failed: ${error.message}`);
    return { success: 0, failed: batch.length };
  }
}

/**
 * Insert batch of regional medical codes
 */
async function insertRegionalBatch(
  batch: RegionalMedicalCodeRow[],
  dryRun: boolean
): Promise<{ success: number; failed: number }> {
  if (dryRun) {
    console.log(`  [DRY RUN] Would insert ${batch.length} regional codes`);
    return { success: batch.length, failed: 0 };
  }

  try {
    const { data, error } = await supabase
      .from('regional_medical_codes')
      .insert(batch);

    if (error) {
      // Check for duplicate key violations (expected on re-runs)
      if (error.code === '23505') {
        // Duplicate key - skip silently
        return { success: 0, failed: 0 };
      }
      throw error;
    }

    return { success: batch.length, failed: 0 };
  } catch (error: any) {
    console.error(`  ❌ Batch insert failed: ${error.message}`);
    return { success: 0, failed: batch.length };
  }
}

/**
 * Process a single code system (universal)
 */
async function processUniversalSystem(
  codeSystem: string,
  dryRun: boolean
): Promise<PopulationStats> {
  const startTime = Date.now();

  // 1. Load embedded codes
  const inputPath = path.join(
    CONFIG.paths.dataRoot,
    codeSystem,
    'processed',
    `${codeSystem}_codes.json`
  );

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Embedded codes not found: ${inputPath}`);
  }

  const codes: MedicalCodeStandard[] = await fs.readJson(inputPath);
  console.log(`\n📂 Loaded ${codes.length} ${codeSystem} codes`);

  // 2. Validate embeddings exist
  const missingEmbeddings = codes.filter((code) => !code.embedding);
  if (missingEmbeddings.length > 0) {
    throw new Error(
      `${missingEmbeddings.length} codes missing embeddings. Run generate-embeddings.ts first.`
    );
  }

  // 3. Convert to database rows
  const rows = codes.map(toUniversalRow);

  // 4. Create batches
  const batches: UniversalMedicalCodeRow[][] = [];
  for (let i = 0; i < rows.length; i += CONFIG.batch.size) {
    batches.push(rows.slice(i, i + CONFIG.batch.size));
  }

  console.log(`  🔄 Inserting ${batches.length} batches (${CONFIG.batch.size} codes per batch)`);

  // 5. Insert batches with progress tracking
  let successfulInserts = 0;
  let failedInserts = 0;
  let skippedDuplicates = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const progress = ((i / batches.length) * 100).toFixed(1);

    const result = await insertUniversalBatch(batch, dryRun);

    if (result.success === 0 && result.failed === 0) {
      // Duplicates skipped
      skippedDuplicates += batch.length;
    } else {
      successfulInserts += result.success;
      failedInserts += result.failed;
    }

    // Progress logging
    process.stdout.write(
      `\r  ⏳ Progress: ${progress}% (${successfulInserts + skippedDuplicates}/${rows.length} codes)`
    );

    // Rate limiting: Small delay between batches
    if (i < batches.length - 1) {
      await sleep(CONFIG.batch.delayMs);
    }
  }

  console.log(); // New line after progress

  // 6. Calculate statistics
  const processingTime = Date.now() - startTime;

  const stats: PopulationStats = {
    codeSystem,
    totalCodes: codes.length,
    successfulInserts,
    failedInserts,
    skippedDuplicates,
    processingTime,
  };

  // 7. Log summary
  console.log(`  ✅ Successfully inserted ${successfulInserts} codes`);
  if (skippedDuplicates > 0) {
    console.log(`  ℹ️  Skipped ${skippedDuplicates} duplicates`);
  }
  if (failedInserts > 0) {
    console.log(`  ⚠️  Failed inserts: ${failedInserts}`);
  }
  console.log(`  ⏱️  Processing time: ${(processingTime / 1000).toFixed(1)}s`);

  return stats;
}

/**
 * Process a single code system (regional)
 */
async function processRegionalSystem(
  codeSystem: string,
  dryRun: boolean
): Promise<PopulationStats> {
  const startTime = Date.now();

  // 1. Load embedded codes
  const inputPath = path.join(
    CONFIG.paths.dataRoot,
    codeSystem,
    'processed',
    `${codeSystem}_codes.json`
  );

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Embedded codes not found: ${inputPath}`);
  }

  const codes: MedicalCodeStandard[] = await fs.readJson(inputPath);
  console.log(`\n📂 Loaded ${codes.length} ${codeSystem} codes`);

  // 2. Validate embeddings exist
  const missingEmbeddings = codes.filter((code) => !code.embedding);
  if (missingEmbeddings.length > 0) {
    throw new Error(
      `${missingEmbeddings.length} codes missing embeddings. Run generate-embeddings.ts first.`
    );
  }

  // 3. Convert to database rows
  const rows = codes.map(toRegionalRow);

  // 4. Create batches
  const batches: RegionalMedicalCodeRow[][] = [];
  for (let i = 0; i < rows.length; i += CONFIG.batch.size) {
    batches.push(rows.slice(i, i + CONFIG.batch.size));
  }

  console.log(`  🔄 Inserting ${batches.length} batches (${CONFIG.batch.size} codes per batch)`);

  // 5. Insert batches with progress tracking
  let successfulInserts = 0;
  let failedInserts = 0;
  let skippedDuplicates = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const progress = ((i / batches.length) * 100).toFixed(1);

    const result = await insertRegionalBatch(batch, dryRun);

    if (result.success === 0 && result.failed === 0) {
      // Duplicates skipped
      skippedDuplicates += batch.length;
    } else {
      successfulInserts += result.success;
      failedInserts += result.failed;
    }

    // Progress logging
    process.stdout.write(
      `\r  ⏳ Progress: ${progress}% (${successfulInserts + skippedDuplicates}/${rows.length} codes)`
    );

    // Rate limiting: Small delay between batches
    if (i < batches.length - 1) {
      await sleep(CONFIG.batch.delayMs);
    }
  }

  console.log(); // New line after progress

  // 6. Calculate statistics
  const processingTime = Date.now() - startTime;

  const stats: PopulationStats = {
    codeSystem,
    totalCodes: codes.length,
    successfulInserts,
    failedInserts,
    skippedDuplicates,
    processingTime,
  };

  // 7. Log summary
  console.log(`  ✅ Successfully inserted ${successfulInserts} codes`);
  if (skippedDuplicates > 0) {
    console.log(`  ℹ️  Skipped ${skippedDuplicates} duplicates`);
  }
  if (failedInserts > 0) {
    console.log(`  ⚠️  Failed inserts: ${failedInserts}`);
  }
  console.log(`  ⏱️  Processing time: ${(processingTime / 1000).toFixed(1)}s`);

  return stats;
}

/**
 * Process all code systems
 */
async function processAllCodeSystems(dryRun: boolean): Promise<void> {
  console.log('🚀 Starting Pass 1.5 Medical Code Database Population');
  console.log(`📊 Database: ${CONFIG.supabase.url}`);
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No database changes will be made');
  }

  const allStats: PopulationStats[] = [];

  // Process universal code systems
  console.log('\n' + '='.repeat(80));
  console.log('📚 UNIVERSAL MEDICAL CODES (RxNorm, SNOMED, LOINC)');
  console.log('='.repeat(80));

  for (const codeSystem of CONFIG.universalSystems) {
    try {
      const stats = await processUniversalSystem(codeSystem, dryRun);
      allStats.push(stats);
    } catch (error: any) {
      console.error(`\n❌ Failed to process ${codeSystem}: ${error.message}`);
      allStats.push({
        codeSystem,
        totalCodes: 0,
        successfulInserts: 0,
        failedInserts: 0,
        skippedDuplicates: 0,
        processingTime: 0,
      });
    }
  }

  // Process regional code systems
  console.log('\n' + '='.repeat(80));
  console.log('🌏 REGIONAL MEDICAL CODES (PBS, MBS, ICD-10-AM)');
  console.log('='.repeat(80));

  for (const codeSystem of CONFIG.regionalSystems) {
    try {
      const stats = await processRegionalSystem(codeSystem, dryRun);
      allStats.push(stats);
    } catch (error: any) {
      console.error(`\n❌ Failed to process ${codeSystem}: ${error.message}`);
      allStats.push({
        codeSystem,
        totalCodes: 0,
        successfulInserts: 0,
        failedInserts: 0,
        skippedDuplicates: 0,
        processingTime: 0,
      });
    }
  }

  // Print final summary
  printFinalSummary(allStats, dryRun);
}

/**
 * Print final summary report
 */
function printFinalSummary(stats: PopulationStats[], dryRun: boolean): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 FINAL DATABASE POPULATION SUMMARY');
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No actual database changes were made');
  }
  console.log('='.repeat(80));

  const totals = stats.reduce(
    (acc, stat) => ({
      totalCodes: acc.totalCodes + stat.totalCodes,
      successfulInserts: acc.successfulInserts + stat.successfulInserts,
      failedInserts: acc.failedInserts + stat.failedInserts,
      skippedDuplicates: acc.skippedDuplicates + stat.skippedDuplicates,
      processingTime: acc.processingTime + stat.processingTime,
    }),
    {
      totalCodes: 0,
      successfulInserts: 0,
      failedInserts: 0,
      skippedDuplicates: 0,
      processingTime: 0,
    }
  );

  // Per-system breakdown
  console.log('\nPer-System Breakdown:');
  console.log('-'.repeat(80));
  for (const stat of stats) {
    if (stat.totalCodes > 0) {
      const successRate = (
        ((stat.successfulInserts / stat.totalCodes) * 100)
      ).toFixed(1);
      console.log(
        `  ${stat.codeSystem.padEnd(12)} | ${stat.successfulInserts
          .toString()
          .padStart(6)} / ${stat.totalCodes.toString().padStart(6)} codes (${successRate}%)`
      );
      if (stat.skippedDuplicates > 0) {
        console.log(`                 | ${stat.skippedDuplicates} duplicates skipped`);
      }
    }
  }

  // Overall totals
  console.log('-'.repeat(80));
  const overallSuccessRate = (
    ((totals.successfulInserts / totals.totalCodes) * 100)
  ).toFixed(1);
  console.log(
    `  TOTAL        | ${totals.successfulInserts
      .toString()
      .padStart(6)} / ${totals.totalCodes.toString().padStart(6)} codes (${overallSuccessRate}%)`
  );
  console.log(`  Duplicates   | ${totals.skippedDuplicates}`);
  console.log(`  Total Time   | ${(totals.processingTime / 1000 / 60).toFixed(1)} minutes`);

  if (totals.failedInserts > 0) {
    console.log(`\n  ⚠️  ${totals.failedInserts} inserts failed (review logs and retry)`);
  }

  console.log('='.repeat(80));
  if (!dryRun) {
    console.log('✅ Database population complete!\n');
  } else {
    console.log('✅ Dry run complete! Run without --dry-run to populate database.\n');
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  // Validate environment
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables required');
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  const codeSystemArg = args.find((arg) => arg.startsWith('--code-system='))?.split('=')[1];
  const dryRun = args.includes('--dry-run');

  if (!codeSystemArg) {
    console.error('❌ Error: --code-system argument required');
    console.log('\nUsage:');
    console.log('  npx tsx populate-database.ts --code-system=rxnorm');
    console.log('  npx tsx populate-database.ts --code-system=all');
    console.log('  npx tsx populate-database.ts --code-system=all --dry-run');
    console.log('\nAvailable code systems:');
    [...CONFIG.universalSystems, ...CONFIG.regionalSystems].forEach((system) =>
      console.log(`  - ${system}`)
    );
    process.exit(1);
  }

  // Process single or all code systems
  if (codeSystemArg === 'all') {
    await processAllCodeSystems(dryRun);
  } else if (CONFIG.universalSystems.includes(codeSystemArg)) {
    console.log(`🚀 Starting database population for ${codeSystemArg} (universal)`);
    const stats = await processUniversalSystem(codeSystemArg, dryRun);
    printFinalSummary([stats], dryRun);
  } else if (CONFIG.regionalSystems.includes(codeSystemArg)) {
    console.log(`🚀 Starting database population for ${codeSystemArg} (regional)`);
    const stats = await processRegionalSystem(codeSystemArg, dryRun);
    printFinalSummary([stats], dryRun);
  } else {
    console.error(`❌ Error: Unknown code system "${codeSystemArg}"`);
    console.log('\nAvailable code systems:');
    [...CONFIG.universalSystems, ...CONFIG.regionalSystems].forEach((system) =>
      console.log(`  - ${system}`)
    );
    process.exit(1);
  }
}

// Run CLI
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

// Export for programmatic usage
export { processUniversalSystem, processRegionalSystem, processAllCodeSystems, CONFIG };
