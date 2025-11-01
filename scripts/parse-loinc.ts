/**
 * LOINC Parser - Logical Observation Identifiers Names and Codes
 *
 * Converts LOINC CSV data to library-agnostic standardized JSON format for embedding generation
 * Maps LOINC CLASS field to Pass 1's entity_subtype taxonomy
 *
 * Key Features:
 * - CLASS-based entity type mapping (vital_sign, lab_result, physical_finding, observation)
 * - Rich synonym extraction from RELATEDNAMES2 for hybrid search
 * - Includes both ACTIVE and DEPRECATED codes for historical matching
 * - Excludes panel codes (multi-test bundles)
 *
 * Usage:
 *   npx tsx scripts/parse-loinc.ts
 *
 * Input:  data/medical-codes/data/medical-codes/loinc/raw/Loinc_2.81/LoincTable/Loinc.csv
 * Output: data/medical-codes/loinc/processed/loinc_codes.json
 *
 * Created: 2025-10-31
 */

import * as fs from 'fs';
import * as path from 'path';
import csvParser from 'csv-parser';

// ============================================================================
// Type Definitions
// ============================================================================

interface MedicalCodeStandard {
  code_system: string;
  code_value: string;
  grouping_code?: string;
  display_name: string;
  entity_type: 'vital_sign' | 'lab_result' | 'physical_finding' | 'medication' | 'procedure' | 'observation' | 'allergy' | 'condition';
  search_text: string;
  synonyms: string[];  // NEW: For hybrid search
  library_version: string;
  country_code: string | null;
  region_specific_data: Record<string, any>;
}

interface LOINCRow {
  LOINC_NUM: string;
  COMPONENT: string;
  PROPERTY: string;
  TIME_ASPCT: string;
  SYSTEM: string;
  SCALE_TYP: string;
  METHOD_TYP: string;
  CLASS: string;
  VersionLastChanged: string;
  CHNG_TYPE: string;
  DefinitionDescription: string;
  STATUS: string;
  CONSUMER_NAME: string;
  CLASSTYPE: string;
  FORMULA: string;
  EXMPL_ANSWERS: string;
  SURVEY_QUEST_TEXT: string;
  SURVEY_QUEST_SRC: string;
  UNITSREQUIRED: string;
  RELATEDNAMES2: string;
  SHORTNAME: string;
  ORDER_OBS: string;
  HL7_FIELD_SUBFIELD_ID: string;
  EXTERNAL_COPYRIGHT_NOTICE: string;
  EXAMPLE_UNITS: string;
  LONG_COMMON_NAME: string;
  EXAMPLE_UCUM_UNITS: string;
  STATUS_REASON: string;
  STATUS_TEXT: string;
  CHANGE_REASON_PUBLIC: string;
  COMMON_TEST_RANK: string;
  COMMON_ORDER_RANK: string;
  HL7_ATTACHMENT_STRUCTURE: string;
  EXTERNAL_COPYRIGHT_LINK: string;
  PanelType: string;
  AskAtOrderEntry: string;
  AssociatedObservations: string;
  VersionFirstReleased: string;
  ValidHL7AttachmentRequest: string;
  DisplayName: string;
  [key: string]: string;
}

interface ParsingStats {
  totalRecords: number;
  validRecords: number;
  skippedRecords: number;
  skippedPanels: number;
  skippedMissingData: number;
  errors: Array<{ line: number; error: string }>;
  entityTypeCounts: Record<string, number>;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  inputPath: path.join(
    process.cwd(),
    'data/medical-codes/data/medical-codes/loinc/raw/Loinc_2.81/LoincTable/Loinc.csv'
  ),
  outputPath: path.join(
    process.cwd(),
    'data/medical-codes/loinc/processed/loinc_codes.json'
  ),
  libraryVersion: 'v2025Q3',
};

// ============================================================================
// Entity Type Mapping (LOINC CLASS → Pass 1 Taxonomy)
// ============================================================================

/**
 * Map LOINC CLASS field to Pass 1's entity_subtype taxonomy
 *
 * This enables Pass 1.5 to filter codes by the entity type Pass 1 detected
 * Example: Pass 1 detects "BP 128/82" as vital_sign → Pass 1.5 searches only vital_sign codes
 */
function mapLoincClassToEntityType(loincClass: string): MedicalCodeStandard['entity_type'] {
  if (!loincClass || loincClass.trim() === '') {
    return 'observation';  // Default fallback
  }

  const classUpper = loincClass.toUpperCase();

  // Vital signs - maps to Pass 1's "vital_sign" subtype
  // Note: Removed PULSE (not common in LOINC CLASS), kept HRTRATE
  if (/^(BP|HRTRATE|BODY\.TEMP|RESP)/i.test(classUpper)) {
    return 'vital_sign';
  }

  // Lab results - maps to Pass 1's "lab_result" subtype
  // Added BLOODGAS and COAG for comprehensive coverage
  if (/^(CHEM|HEMATOLOGY|MICRO|DRUG|TOX|SERO|PATH|BLOODGAS|COAG)/i.test(classUpper)) {
    return 'lab_result';
  }

  // Physical findings - maps to Pass 1's "physical_finding" subtype
  if (/^(PHENOTYPE|H&P)/i.test(classUpper)) {
    return 'physical_finding';
  }

  // Default to observation (generic clinical measurement)
  return 'observation';
}

// ============================================================================
// Synonym Extraction
// ============================================================================

/**
 * Extract synonyms from RELATEDNAMES2 field
 * RELATEDNAMES2 contains semicolon-separated synonyms and abbreviations
 */
function extractSynonyms(relatedNames: string): string[] {
  if (!relatedNames || relatedNames.trim() === '') {
    return [];
  }

  // Split by semicolon, clean, and deduplicate
  const synonyms = relatedNames
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 200)  // Exclude overly long entries
    .filter((value, index, self) => self.indexOf(value) === index);  // Deduplicate

  return synonyms;
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Transform LOINC CSV row to standardized format
 */
function transformLOINCRow(row: LOINCRow, lineNumber: number): MedicalCodeStandard | null {
  try {
    // Validate required fields
    if (!row.LOINC_NUM || row.LOINC_NUM.trim() === '') {
      return null;
    }

    // Filter out panel codes (multi-test bundles not needed for entity matching)
    if (row.CLASS && /PANEL/i.test(row.CLASS)) {
      return null;
    }

    // Construct display name (prefer LONG_COMMON_NAME, fallback to SHORTNAME or COMPONENT)
    const displayName = row.LONG_COMMON_NAME?.trim() ||
                       row.SHORTNAME?.trim() ||
                       row.COMPONENT?.trim();

    if (!displayName || displayName === '') {
      return null;
    }

    // Extract synonyms for hybrid search
    const synonyms = extractSynonyms(row.RELATEDNAMES2 || '');

    // Build search text (display name + component + system + synonyms)
    // Include SYSTEM for context like "urine", "serum", "blood"
    const searchTextParts = [
      displayName,
      row.COMPONENT,
      row.SYSTEM,  // Added per second AI bot recommendation
      ...synonyms.slice(0, 10).filter(s => s.length > 2 || ['BP', 'HR', 'A1C'].includes(s.toUpperCase()))  // Filter short tokens except known abbreviations
    ].filter(Boolean);

    const searchText = searchTextParts
      .join(' ')
      .replace(/;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!searchText) {
      return null;
    }

    // Map CLASS to entity type
    const entityType = mapLoincClassToEntityType(row.CLASS);

    // Build standardized code object
    const code: MedicalCodeStandard = {
      code_system: 'loinc',
      code_value: row.LOINC_NUM.trim(),
      grouping_code: undefined,  // LOINC doesn't have grouping
      display_name: displayName,
      entity_type: entityType,
      search_text: searchText,
      synonyms: synonyms,
      library_version: CONFIG.libraryVersion,
      country_code: 'AUS',  // Per user preference (LOINC is universal but stored regionally)
      region_specific_data: {
        original_loinc_num: row.LOINC_NUM || null,
        component: row.COMPONENT || null,
        property: row.PROPERTY || null,
        time_aspect: row.TIME_ASPCT || null,
        system: row.SYSTEM || null,
        scale_type: row.SCALE_TYP || null,
        method_type: row.METHOD_TYP || null,
        class: row.CLASS || null,
        short_name: row.SHORTNAME || null,
        example_units: row.EXAMPLE_UNITS || null,
        example_ucum_units: row.EXAMPLE_UCUM_UNITS || null,
        order_obs: row.ORDER_OBS || null,
        common_test_rank: row.COMMON_TEST_RANK && row.COMMON_TEST_RANK.trim() !== '' ? parseInt(row.COMMON_TEST_RANK, 10) : null,
        common_order_rank: row.COMMON_ORDER_RANK && row.COMMON_ORDER_RANK.trim() !== '' ? parseInt(row.COMMON_ORDER_RANK, 10) : null,
        status: row.STATUS || null,
        is_panel: row.CLASS && /PANEL/i.test(row.CLASS),  // Flag for panel codes (added per second AI bot)
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

  // LOINC code format validation (numeric-numeric)
  if (!/^\d+-\d+$/.test(code.code_value)) {
    return false;
  }

  // Entity type
  const validEntityTypes = ['vital_sign', 'lab_result', 'physical_finding', 'medication', 'procedure', 'observation', 'allergy', 'condition'];
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

  return true;
}

/**
 * Main parser function
 */
async function parseLOINC(): Promise<void> {
  console.log('🚀 Starting LOINC Parser');
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
    skippedPanels: 0,
    skippedMissingData: 0,
    errors: [],
    entityTypeCounts: {
      vital_sign: 0,
      lab_result: 0,
      physical_finding: 0,
      observation: 0
    }
  };

  const codes: MedicalCodeStandard[] = [];
  let lineNumber = 0;

  return new Promise((resolve, reject) => {
    fs.createReadStream(CONFIG.inputPath)
      .pipe(csvParser())
      .on('data', (row: LOINCRow) => {
        lineNumber++;
        stats.totalRecords++;

        // Progress indicator
        if (stats.totalRecords % 1000 === 0) {
          process.stdout.write(`\r⏳ Processing: ${stats.totalRecords} records...`);
        }

        // Transform row
        const code = transformLOINCRow(row, lineNumber);

        if (!code) {
          stats.skippedRecords++;

          // Track reason for skipping
          if (row.CLASS && /PANEL/i.test(row.CLASS)) {
            stats.skippedPanels++;
          } else {
            stats.skippedMissingData++;
          }

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

        // Track entity type counts
        stats.entityTypeCounts[code.entity_type] = (stats.entityTypeCounts[code.entity_type] || 0) + 1;

        codes.push(code);
        stats.validRecords++;
      })
      .on('end', async () => {
        console.log('\n');

        // Ensure output directory exists
        const outputDir = path.dirname(CONFIG.outputPath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // Write output file
        fs.writeFileSync(CONFIG.outputPath, JSON.stringify(codes, null, 2));

        // Print summary
        console.log('='.repeat(80));
        console.log('📊 LOINC PARSING SUMMARY');
        console.log('='.repeat(80));
        console.log(`Total records processed:   ${stats.totalRecords}`);
        console.log(`Valid codes:               ${stats.validRecords}`);
        console.log(`Skipped records:           ${stats.skippedRecords}`);
        console.log(`  - Panel codes excluded:  ${stats.skippedPanels}`);
        console.log(`  - Missing required data: ${stats.skippedMissingData}`);
        console.log(`Final output count:        ${codes.length}`);
        console.log(`Success rate:              ${((stats.validRecords / stats.totalRecords) * 100).toFixed(2)}%`);
        console.log();
        console.log('📈 Entity Type Distribution:');
        Object.entries(stats.entityTypeCounts).forEach(([type, count]) => {
          const percentage = ((count / codes.length) * 100).toFixed(1);
          console.log(`  ${type.padEnd(20)} ${count.toString().padStart(6)} (${percentage}%)`);
        });
        console.log('='.repeat(80));
        console.log(`✅ Output written to: ${CONFIG.outputPath}`);
        console.log();

        // Sample records
        if (codes.length > 0) {
          console.log('📝 Sample Records (first 5):');
          console.log('-'.repeat(80));
          codes.slice(0, 5).forEach((code, index) => {
            console.log(`${index + 1}. ${code.code_value} - ${code.display_name}`);
            console.log(`   Entity Type: ${code.entity_type}`);
            console.log(`   Class: ${code.region_specific_data.class || 'N/A'}`);
            console.log(`   Synonyms: ${code.synonyms.slice(0, 3).join(', ')}${code.synonyms.length > 3 ? '...' : ''}`);
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
    await parseLOINC();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
