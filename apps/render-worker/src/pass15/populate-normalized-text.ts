/**
 * Pass 1.5 - Pass A: Populate Normalized Embedding Text
 *
 * Purpose: Populate normalized_embedding_text column for all regional medical codes
 *
 * Strategy: Two-phase approach
 * - Phase 1: Dry-run with 1,000 sample codes for QA
 * - Phase 2: Full population of all 20,383 codes
 *
 * Usage:
 *   npm run pass15:populate-text -- --dry-run    # Test with 1K sample
 *   npm run pass15:populate-text                  # Full population
 */

import { createClient } from '@supabase/supabase-js';
import { normalizeText } from './normalization';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Find project root and load environment variables
function findProjectRoot(): string {
  let currentDir = process.cwd();
  while (currentDir !== '/') {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      // Check if this is the monorepo root (has apps/ directory)
      if (fs.existsSync(path.join(currentDir, 'apps'))) {
        return currentDir;
      }
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error('Could not find project root');
}

const projectRoot = findProjectRoot();
const envPath = path.join(projectRoot, '.env.production');
dotenv.config({ path: envPath });

console.log(`Loading environment from: ${envPath}`);

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables:');
  console.error('SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_KEY ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface MedicalCode {
  id: string;
  code_system: string;
  code_value: string;
  display_name: string;
  search_text: string;
  entity_type: 'medication' | 'procedure' | 'condition' | 'observation' | 'allergy';
  normalized_embedding_text: string | null;
}

interface PopulationStats {
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
}

/**
 * Fetch codes that need normalization with pagination support
 */
async function fetchCodesToNormalize(
  limit?: number
): Promise<MedicalCode[]> {
  console.log(`\nFetching codes to normalize${limit ? ` (limit: ${limit})` : ''}...`);

  const allCodes: MedicalCode[] = [];
  const PAGE_SIZE = 1000; // Supabase default max
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('regional_medical_codes')
      .select('id, code_system, code_value, display_name, search_text, entity_type, normalized_embedding_text')
      .is('normalized_embedding_text', null)  // Only codes without normalized text
      .order('code_system', { ascending: true })
      .order('code_value', { ascending: true })
      .range(from, to);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching codes:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      break; // No more data
    }

    allCodes.push(...(data as MedicalCode[]));
    console.log(`Fetched page ${page + 1}: ${data.length} codes (total: ${allCodes.length})`);

    // If we have a limit and reached it, stop
    if (limit && allCodes.length >= limit) {
      console.log(`Reached limit of ${limit} codes`);
      return allCodes.slice(0, limit);
    }

    // If we got less than PAGE_SIZE, we're done
    if (data.length < PAGE_SIZE) {
      break;
    }

    page++;
  }

  console.log(`Fetched ${allCodes.length} total codes`);
  return allCodes;
}

/**
 * Normalize and update a batch of codes
 */
async function processBatch(
  codes: MedicalCode[],
  stats: PopulationStats
): Promise<void> {
  const BATCH_SIZE = 100;

  for (let i = 0; i < codes.length; i += BATCH_SIZE) {
    const batch = codes.slice(i, i + BATCH_SIZE);
    console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1} (${i + 1}-${Math.min(i + BATCH_SIZE, codes.length)} of ${codes.length})`);

    const updates = batch.map(code => {
      try {
        const normalizedText = normalizeText(
          code.display_name,
          code.search_text,
          code.entity_type
        );

        stats.processed++;

        return {
          id: code.id,
          normalized_embedding_text: normalizedText
        };
      } catch (error) {
        console.error(`Error normalizing code ${code.code_value}:`, error);
        stats.errors++;
        return null;
      }
    }).filter(Boolean);

    if (updates.length === 0) {
      console.log('No valid updates in this batch, skipping');
      continue;
    }

    // Update database - use individual updates instead of upsert
    // (upsert tries to insert full rows and violates NOT NULL constraints)
    try {
      for (const update of updates) {
        const { error } = await supabase
          .from('regional_medical_codes')
          .update({ normalized_embedding_text: update.normalized_embedding_text })
          .eq('id', update.id);

        if (error) {
          console.error(`Error updating ${update.id}:`, error);
          stats.errors++;
        } else {
          stats.updated++;
        }
      }
      console.log(`✓ Updated ${updates.length} codes`);
    } catch (error) {
      console.error('Batch update exception:', error);
      stats.errors += updates.length;
    }

    // Progress update
    const progressPercent = ((i + batch.length) / codes.length * 100).toFixed(1);
    console.log(`Progress: ${progressPercent}% (${stats.updated} updated, ${stats.errors} errors)`);
  }
}

/**
 * Display sample normalized results for QA
 */
async function displaySampleResults(limit: number = 20): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('SAMPLE NORMALIZED RESULTS (for QA)');
  console.log('='.repeat(80));

  const { data, error } = await supabase
    .from('regional_medical_codes')
    .select('code_system, code_value, display_name, search_text, normalized_embedding_text, entity_type')
    .not('normalized_embedding_text', 'is', null)
    .order('code_system')
    .limit(limit);

  if (error) {
    console.error('Error fetching samples:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No normalized codes found yet.');
    return;
  }

  data.forEach((code, idx) => {
    console.log(`\n${idx + 1}. ${code.code_system.toUpperCase()} ${code.code_value}`);
    console.log(`   Type: ${code.entity_type}`);
    console.log(`   Original:   ${code.display_name.substring(0, 80)}`);
    console.log(`   Normalized: ${code.normalized_embedding_text.substring(0, 80)}`);

    const originalLen = code.display_name.length;
    const normalizedLen = code.normalized_embedding_text.length;
    const reduction = ((originalLen - normalizedLen) / originalLen * 100).toFixed(1);
    console.log(`   Reduction:  ${reduction}% (${originalLen} → ${normalizedLen} chars)`);
  });

  console.log('\n' + '='.repeat(80));
}

/**
 * Main population function
 */
async function populateNormalizedText(dryRun: boolean = false): Promise<void> {
  const stats: PopulationStats = {
    total: 0,
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    startTime: new Date()
  };

  console.log('='.repeat(80));
  console.log('PASS 1.5 - PASS A: POPULATE NORMALIZED EMBEDDING TEXT');
  console.log('='.repeat(80));
  console.log(`Mode: ${dryRun ? 'DRY RUN (1,000 sample)' : 'FULL POPULATION'}`);
  console.log(`Start time: ${stats.startTime.toISOString()}`);
  console.log('='.repeat(80));

  try {
    // Fetch codes to normalize
    const codes = await fetchCodesToNormalize(dryRun ? 1000 : undefined);
    stats.total = codes.length;

    if (codes.length === 0) {
      console.log('\n✓ All codes already have normalized text. Nothing to do.');
      return;
    }

    console.log(`\nFound ${codes.length} codes needing normalization`);

    // Confirm before proceeding (unless dry-run)
    if (!dryRun) {
      console.log('\n⚠️  WARNING: This will update ALL codes in the database.');
      console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Process codes
    await processBatch(codes, stats);

    stats.endTime = new Date();

    // Display results
    console.log('\n' + '='.repeat(80));
    console.log('POPULATION COMPLETE');
    console.log('='.repeat(80));
    console.log(`Total codes:     ${stats.total}`);
    console.log(`Processed:       ${stats.processed}`);
    console.log(`Updated:         ${stats.updated}`);
    console.log(`Errors:          ${stats.errors}`);
    console.log(`Duration:        ${((stats.endTime.getTime() - stats.startTime.getTime()) / 1000).toFixed(1)}s`);
    console.log('='.repeat(80));

    // Show sample results for QA
    await displaySampleResults(20);

    // Next steps
    if (dryRun) {
      console.log('\n📋 NEXT STEPS (Dry-run complete):');
      console.log('1. Review sample normalized results above');
      console.log('2. Verify:');
      console.log('   - Units converted correctly (g→mg, mcg→mg)');
      console.log('   - Salt forms removed (hydrochloride, arginine, etc.)');
      console.log('   - Brand names preserved appropriately');
      console.log('   - Clinical distinctiveness maintained');
      console.log('3. If QA passes, run full population:');
      console.log('   npm run pass15:populate-text');
      console.log('4. Then proceed to Pass B (embedding generation)');
    } else {
      console.log('\n📋 NEXT STEPS (Full population complete):');
      console.log('1. Verify sample results above look correct');
      console.log('2. If satisfied, proceed to Pass B:');
      console.log('   npm run pass15:generate-embeddings');
    }

  } catch (error) {
    console.error('\n❌ Population failed:', error);
    stats.endTime = new Date();
    throw error;
  }
}

// Parse command line arguments
const isDryRun = process.argv.includes('--dry-run');

// Run population
populateNormalizedText(isDryRun)
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
