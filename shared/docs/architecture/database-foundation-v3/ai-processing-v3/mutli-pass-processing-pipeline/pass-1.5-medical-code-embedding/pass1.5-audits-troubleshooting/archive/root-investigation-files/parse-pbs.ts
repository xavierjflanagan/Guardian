/**
 * PBS Parser - Australian Pharmaceutical Benefits Scheme
 *
 * Converts PBS CSV data to library-agnostic standardized JSON format for embedding generation
 * Uses standardized field names (code_value, grouping_code) for universal worker compatibility
 *
 * Key Changes:
 * - code_value: li_item_id (most granular, preserves all brand variants)
 * - grouping_code: pbs_code (for optional grouping/deduplication)
 * - region_specific_data: original field names + PBS-specific metadata
 *
 * Usage:
 *   cd /Users/xflanagan/Documents/GitHub/Guardian-Cursor
 *   npx tsx parse-pbs.ts
 *
 * Input:  data/medical-codes/pbs/raw/2025-10-01-PBS-API-CSV-files/tables_as_csv/items.csv
 * Output: data/medical-codes/pbs/processed/pbs_codes.json
 *
 * Created: 2025-10-16
 * Updated: 2025-10-16 (library-agnostic fields)
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import csvParser from 'csv-parser';

// ============================================================================
// Type Definitions
// ============================================================================

interface MedicalCodeStandard {
  code_system: string;
  code_value: string;              // STANDARDIZED: Most granular unique identifier  
  grouping_code?: string;          // STANDARDIZED: Optional grouping identifier
  display_name: string;
  entity_type: 'medication' | 'condition' | 'procedure' | 'observation' | 'allergy';
  search_text: string;
  library_version: string;
  country_code: string | null;
  region_specific_data: Record<string, any>;
}

interface PBSRow {
  li_item_id: string;  // ADDED: Unique item identifier per brand
  pbs_code: string;
  drug_name: string;
  li_drug_name: string;
  li_form: string;
  schedule_form: string;
  brand_name: string;
  program_code: string;
  manner_of_administration: string;
  moa_preferred_term: string;
  manufacturer_code: string;
  pack_size: string;
  number_of_repeats: string;
  caution_indicator: string;
  note_indicator: string;
  [key: string]: string; // Allow other fields
}

interface ParsingStats {
  totalRecords: number;
  validRecords: number;
  skippedRecords: number;
  errors: Array<{ line: number; error: string }>;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  inputPath: path.join(
    process.cwd(),
    'data/medical-codes/pbs/raw/2025-10-01-PBS-API-CSV-files/tables_as_csv/items.csv'
  ),
  outputPath: path.join(
    process.cwd(),
    'data/medical-codes/pbs/processed/pbs_codes.json'
  ),
  libraryVersion: 'v2025Q4',
};

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Transform PBS CSV row to standardized format
 * UPDATED: Use li_item_id for brand preservation
 */
function transformPBSRow(row: PBSRow, lineNumber: number): MedicalCodeStandard | null {
  try {
    // Validate required fields - UPDATED to check li_item_id
    if (!row.li_item_id || row.li_item_id.trim() === '' || !row.pbs_code || row.pbs_code.trim() === '') {
      return null;
    }

    // Construct display name
    const displayName = row.drug_name && row.li_form
      ? `${row.drug_name} ${row.li_form}`
      : row.schedule_form || row.li_form || row.drug_name;

    if (!displayName || displayName.trim() === '') {
      return null;
    }

    // Construct search text (includes brand name for better matching)
    const searchText = [
      displayName,
      row.brand_name
    ].filter(Boolean).join(' ').trim();

    if (!searchText) {
      return null;
    }

    // Build standardized code object - LIBRARY-AGNOSTIC FIELDS
    const code: MedicalCodeStandard = {
      code_system: 'pbs',
      code_value: row.li_item_id.trim(),        // STANDARDIZED: Most granular unique identifier
      grouping_code: row.pbs_code.trim(),       // STANDARDIZED: Grouping identifier
      display_name: displayName.trim(),
      entity_type: 'medication',
      search_text: searchText,
      library_version: CONFIG.libraryVersion,
      country_code: 'AUS',
      region_specific_data: {
        original_li_item_id: row.li_item_id || null,  // Preserve original field names
        original_pbs_code: row.pbs_code || null,
        brand_name: row.brand_name || null,
        li_form: row.li_form || null,
        schedule_form: row.schedule_form || null,
        manner_of_administration: row.manner_of_administration || null,
        moa_preferred_term: row.moa_preferred_term || null,
        program_code: row.program_code || null,
        manufacturer_code: row.manufacturer_code || null,
        pack_size: row.pack_size || null,
        number_of_repeats: row.number_of_repeats || null,
        caution_indicator: row.caution_indicator === 'Y',
        note_indicator: row.note_indicator === 'Y'
      }
    };

    return code;

  } catch (error: any) {
    console.error(`Error parsing line ${lineNumber}: ${error.message}`);
    return null;
  }
}

/**
 * Validate parsed code
 */
function validateCode(code: MedicalCodeStandard): boolean {
  // Required fields
  if (!code.code_system || !code.code_value || !code.display_name) {
    return false;
  }

  // Entity type
  const validEntityTypes = ['medication', 'condition', 'procedure', 'observation', 'allergy'];
  if (!validEntityTypes.includes(code.entity_type)) {
    return false;
  }

  // Search text
  if (!code.search_text || code.search_text.trim() === '') {
    return false;
  }

  // Library version format
  if (!/^v\d{4}Q[1-4]$/.test(code.library_version)) {
    return false;
  }

  // Country code format
  if (code.country_code && !/^[A-Z]{3}$/.test(code.country_code)) {
    return false;
  }

  return true;
}

/**
 * Preserve all brand variants - NO deduplication for optimal patient matching
 * Each li_item_id represents a unique medication option
 */
function preserveAllVariants(codes: MedicalCodeStandard[]): MedicalCodeStandard[] {
  // NO deduplication - li_item_id values are already unique per brand
  // This preserves all brand variants for better patient upload matching
  return codes;
}

// Legacy function removed - not needed with li_item_id approach

/**
 * Main parser function
 */
async function parsePBS(): Promise<void> {
  console.log('🚀 Starting PBS Parser');
  console.log(`📂 Input:  ${CONFIG.inputPath}`);
  console.log(`📂 Output: ${CONFIG.outputPath}`);
  console.log();

  // Check input file exists
  if (!fs.existsSync(CONFIG.inputPath)) {
    throw new Error(`Input file not found: ${CONFIG.inputPath}`);
  }

  const stats: ParsingStats = {
    totalRecords: 0,
    validRecords: 0,
    skippedRecords: 0,
    errors: []
  };

  const codes: MedicalCodeStandard[] = [];
  let lineNumber = 0;

  return new Promise((resolve, reject) => {
    fs.createReadStream(CONFIG.inputPath)
      .pipe(csvParser())
      .on('data', (row: PBSRow) => {
        lineNumber++;
        stats.totalRecords++;

        // Progress indicator
        if (stats.totalRecords % 500 === 0) {
          process.stdout.write(`\r⏳ Processing: ${stats.totalRecords} records...`);
        }

        // Transform row
        const code = transformPBSRow(row, lineNumber);

        if (!code) {
          stats.skippedRecords++;
          return;
        }

        // Validate code
        if (!validateCode(code)) {
          stats.skippedRecords++;
          stats.errors.push({
            line: lineNumber,
            error: 'Validation failed'
          });
          return;
        }

        codes.push(code);
        stats.validRecords++;
      })
      .on('end', async () => {
        console.log('\n');

        // Preserve all brand variants - NO deduplication
        const finalCodes = preserveAllVariants(codes);
        
        console.log(`✅ Preserved all ${finalCodes.length} brand variants (no deduplication)`);

        // Ensure output directory exists
        await fs.ensureDir(path.dirname(CONFIG.outputPath));

        // Write output file
        await fs.writeJson(CONFIG.outputPath, finalCodes, { spaces: 2 });

        // Print summary
        console.log('='.repeat(80));
        console.log('📊 PBS PARSING SUMMARY');
        console.log('='.repeat(80));
        console.log(`Total records processed:  ${stats.totalRecords}`);
        console.log(`Valid codes:              ${stats.validRecords}`);
        console.log(`Skipped records:          ${stats.skippedRecords}`);
        console.log(`Brand variants preserved: ${finalCodes.length} (no deduplication)`);
        console.log(`Final output count:       ${finalCodes.length}`);
        console.log(`Success rate:             ${((stats.validRecords / stats.totalRecords) * 100).toFixed(2)}%`);
        console.log('='.repeat(80));
        console.log(`✅ Output written to: ${CONFIG.outputPath}`);
        console.log();

        // Sample records
        if (finalCodes.length > 0) {
          console.log('📝 Sample Records (first 3):');
          console.log('-'.repeat(80));
          finalCodes.slice(0, 3).forEach((code, index) => {
            console.log(`${index + 1}. ${code.code_value} - ${code.display_name}`);
            console.log(`   Grouping Code: ${code.grouping_code || 'N/A'}`);
            console.log(`   Brand: ${code.region_specific_data.brand_name || 'N/A'}`);
            console.log(`   Search: ${code.search_text.substring(0, 60)}...`);
            console.log();
          });
        }

        // Error summary
        if (stats.errors.length > 0) {
          console.log(`⚠️  ${stats.errors.length} errors occurred (first 10):`);
          stats.errors.slice(0, 10).forEach(err => {
            console.log(`   Line ${err.line}: ${err.error}`);
          });
          console.log();
        }

        resolve();
      })
      .on('error', (error: Error) => {
        reject(error);
      });
  });
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  try {
    await parsePBS();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
