/**
 * SNOMED CT Parser - Systematized Nomenclature of Medicine Clinical Terms
 *
 * Converts SNOMED CT RF2 format to library-agnostic standardized JSON format
 * Processes Australian edition (AU1000036) October 2025 release
 *
 * Key Features:
 * - Joins Concepts + Descriptions to create complete medical concept records
 * - Extracts semantic tags from FSN for entity type mapping
 * - Collects all synonyms for hybrid search
 * - Includes both active and inactive codes for historical matching
 *
 * SNOMED CT Structure:
 * - 1 Concept = 1 medical concept (e.g., "Diabetes mellitus")
 * - ~5 Descriptions per concept:
 *   - 1 FSN (Fully Specified Name): "Diabetes mellitus (disorder)"
 *   - 4 Synonyms: "Diabetes mellitus", "DM - Diabetes mellitus", etc.
 *
 * Usage:
 *   pnpm exec tsx scripts/parse-snomed.ts
 *
 * Input:  data/medical-codes/snomed/raw/SnomedCT_Release_AU1000036_20251031/Full/Terminology/*.txt
 * Output: data/medical-codes/snomed/processed/snomed_codes.json
 *
 * Created: 2025-11-02
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

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
  synonyms: string[];
  library_version: string;
  country_code: string | null;
  region_specific_data: Record<string, any>;
}

interface ConceptRow {
  id: string;
  effectiveTime: string;
  active: string;
  moduleId: string;
  definitionStatusId: string;
}

interface DescriptionRow {
  id: string;
  effectiveTime: string;
  active: string;
  moduleId: string;
  conceptId: string;
  languageCode: string;
  typeId: string;
  term: string;
  caseSignificanceId: string;
}

interface ConceptWithDescriptions {
  conceptId: string;
  active: boolean;
  fsn: string | null;
  synonyms: string[];
}

interface ParsingStats {
  totalConcepts: number;
  totalDescriptions: number;
  activeConcepts: number;
  conceptsWithFSN: number;
  conceptsWithoutFSN: number;
  validRecords: number;
  skippedRecords: number;
  errors: Array<{ conceptId: string; error: string }>;
  entityTypeCounts: Record<string, number>;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  conceptsPath: path.join(
    process.cwd(),
    'data/medical-codes/snomed/raw/SnomedCT_Release_AU1000036_20251031/Full/Terminology/sct2_Concept_Full_AU1000036_20251031.txt'
  ),
  descriptionsPath: path.join(
    process.cwd(),
    'data/medical-codes/snomed/raw/SnomedCT_Release_AU1000036_20251031/Full/Terminology/sct2_Description_Full-en-au_AU1000036_20251031.txt'
  ),
  outputPath: path.join(
    process.cwd(),
    'data/medical-codes/snomed/processed/snomed_codes.json'
  ),
  libraryVersion: 'AU1000036_20251031',
};

// ============================================================================
// Entity Type Mapping (SNOMED Semantic Tag → Pass 1 Taxonomy)
// ============================================================================

/**
 * Extract semantic tag from FSN
 * Example: "Diabetes mellitus (disorder)" → "disorder"
 */
function extractSemanticTag(fsn: string): string | null {
  const match = fsn.match(/\(([^)]+)\)$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Map SNOMED semantic tag to Pass 1's entity_subtype taxonomy
 */
function mapSemanticTagToEntityType(semanticTag: string | null): MedicalCodeStandard['entity_type'] {
  if (!semanticTag) {
    return 'observation';
  }

  const tag = semanticTag.toLowerCase();

  // Clinical conditions/diseases
  if (tag === 'disorder' || tag === 'disease') {
    return 'condition';
  }

  // Physical findings and observations
  if (tag === 'finding' || tag === 'observable entity') {
    return 'physical_finding';
  }

  // Procedures and interventions
  if (tag === 'procedure' || tag === 'regime/therapy' || tag === 'intervention') {
    return 'procedure';
  }

  // Substances and medications
  if (tag === 'substance' || tag === 'pharmaceutical / biologic product' || tag === 'medicinal product') {
    return 'medication';
  }

  // Body structures (map to physical_finding)
  if (tag === 'body structure' || tag === 'morphologic abnormality') {
    return 'physical_finding';
  }

  // Everything else
  return 'observation';
}

// ============================================================================
// File Reading Functions
// ============================================================================

/**
 * Read concepts file (tab-delimited)
 */
async function readConcepts(): Promise<Map<string, ConceptRow>> {
  console.log('Reading concepts file...');

  const concepts = new Map<string, ConceptRow>();
  const fileStream = fs.createReadStream(CONFIG.conceptsPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  let header: string[] = [];

  for await (const line of rl) {
    lineNumber++;

    if (lineNumber === 1) {
      header = line.split('\t');
      continue;
    }

    const fields = line.split('\t');
    if (fields.length < 5) continue;

    const concept: ConceptRow = {
      id: fields[0],
      effectiveTime: fields[1],
      active: fields[2],
      moduleId: fields[3],
      definitionStatusId: fields[4]
    };

    concepts.set(concept.id, concept);

    if (lineNumber % 100000 === 0) {
      process.stdout.write(`\r   ${lineNumber.toLocaleString()} concepts...`);
    }
  }

  console.log(`\n   [OK] Loaded ${concepts.size.toLocaleString()} concepts`);
  return concepts;
}

/**
 * Read descriptions file and group by conceptId
 */
async function readDescriptions(concepts: Map<string, ConceptRow>): Promise<Map<string, ConceptWithDescriptions>> {
  console.log('\nReading descriptions file...');

  const conceptDescriptions = new Map<string, ConceptWithDescriptions>();
  const fileStream = fs.createReadStream(CONFIG.descriptionsPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  let header: string[] = [];

  for await (const line of rl) {
    lineNumber++;

    if (lineNumber === 1) {
      header = line.split('\t');
      continue;
    }

    const fields = line.split('\t');
    if (fields.length < 9) continue;

    const desc: DescriptionRow = {
      id: fields[0],
      effectiveTime: fields[1],
      active: fields[2],
      moduleId: fields[3],
      conceptId: fields[4],
      languageCode: fields[5],
      typeId: fields[6],
      term: fields[7],
      caseSignificanceId: fields[8]
    };

    // Only process active descriptions
    if (desc.active !== '1') continue;

    // Only process if concept exists
    const concept = concepts.get(desc.conceptId);
    if (!concept) continue;

    // Get or create concept description group
    if (!conceptDescriptions.has(desc.conceptId)) {
      conceptDescriptions.set(desc.conceptId, {
        conceptId: desc.conceptId,
        active: concept.active === '1',
        fsn: null,
        synonyms: []
      });
    }

    const conceptDesc = conceptDescriptions.get(desc.conceptId)!;

    // FSN (Fully Specified Name) - typeId = 900000000000003001
    if (desc.typeId === '900000000000003001') {
      conceptDesc.fsn = desc.term;
    }
    // Synonym - typeId = 900000000000013009
    else if (desc.typeId === '900000000000013009') {
      conceptDesc.synonyms.push(desc.term);
    }

    if (lineNumber % 500000 === 0) {
      process.stdout.write(`\r   ${lineNumber.toLocaleString()} descriptions...`);
    }
  }

  console.log(`\n   [OK] Processed ${lineNumber.toLocaleString()} descriptions`);
  console.log(`   [OK] Grouped into ${conceptDescriptions.size.toLocaleString()} concepts`);

  return conceptDescriptions;
}

// ============================================================================
// Transform Functions
// ============================================================================

/**
 * Transform SNOMED concept to standardized format
 */
function transformConcept(conceptDesc: ConceptWithDescriptions): MedicalCodeStandard | null {
  try {
    // Must have FSN
    if (!conceptDesc.fsn) {
      return null;
    }

    // Extract semantic tag from FSN
    const semanticTag = extractSemanticTag(conceptDesc.fsn);
    const entityType = mapSemanticTagToEntityType(semanticTag);

    // Deduplicate synonyms
    const uniqueSynonyms = Array.from(new Set(conceptDesc.synonyms));

    // Build search text (FSN + synonyms)
    const searchTextParts = [
      conceptDesc.fsn,
      ...uniqueSynonyms
    ];

    const searchText = searchTextParts
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Build standardized code object
    const code: MedicalCodeStandard = {
      code_system: 'snomed',
      code_value: conceptDesc.conceptId,
      grouping_code: undefined,
      display_name: conceptDesc.fsn,
      entity_type: entityType,
      search_text: searchText,
      synonyms: uniqueSynonyms,
      library_version: CONFIG.libraryVersion,
      country_code: 'AUS',
      region_specific_data: {
        original_concept_id: conceptDesc.conceptId,
        semantic_tag: semanticTag,
        synonym_count: uniqueSynonyms.length,
        active: conceptDesc.active
      }
    };

    return code;

  } catch (error: any) {
    console.error(`Error transforming concept ${conceptDesc.conceptId}: ${error.message}`);
    return null;
  }
}

// ============================================================================
// Main Parser Function
// ============================================================================

async function parseSNOMED(): Promise<void> {
  console.log('SNOMED CT Parser');
  console.log('='.repeat(80));
  console.log(`Input (Concepts):     ${CONFIG.conceptsPath}`);
  console.log(`Input (Descriptions): ${CONFIG.descriptionsPath}`);
  console.log(`Output:               ${CONFIG.outputPath}`);
  console.log('='.repeat(80));
  console.log();

  // Check input files exist
  if (!fs.existsSync(CONFIG.conceptsPath)) {
    throw new Error(`Concepts file not found: ${CONFIG.conceptsPath}`);
  }
  if (!fs.existsSync(CONFIG.descriptionsPath)) {
    throw new Error(`Descriptions file not found: ${CONFIG.descriptionsPath}`);
  }

  const stats: ParsingStats = {
    totalConcepts: 0,
    totalDescriptions: 0,
    activeConcepts: 0,
    conceptsWithFSN: 0,
    conceptsWithoutFSN: 0,
    validRecords: 0,
    skippedRecords: 0,
    errors: [],
    entityTypeCounts: {}
  };

  // Step 1: Read concepts
  const concepts = await readConcepts();
  stats.totalConcepts = concepts.size;
  stats.activeConcepts = Array.from(concepts.values()).filter(c => c.active === '1').length;

  // Step 2: Read descriptions and group by concept
  const conceptDescriptions = await readDescriptions(concepts);

  // Step 3: Transform to standardized format
  console.log('\nTransforming concepts...');
  const codes: MedicalCodeStandard[] = [];

  let processed = 0;
  for (const conceptDesc of conceptDescriptions.values()) {
    processed++;

    if (processed % 50000 === 0) {
      process.stdout.write(`\r   ${processed.toLocaleString()}/${conceptDescriptions.size.toLocaleString()} concepts...`);
    }

    if (conceptDesc.fsn) {
      stats.conceptsWithFSN++;
    } else {
      stats.conceptsWithoutFSN++;
    }

    const code = transformConcept(conceptDesc);

    if (!code) {
      stats.skippedRecords++;
      continue;
    }

    // Track entity type counts
    stats.entityTypeCounts[code.entity_type] = (stats.entityTypeCounts[code.entity_type] || 0) + 1;

    codes.push(code);
    stats.validRecords++;
  }

  console.log('\n');

  // Step 4: Write output file
  console.log('Writing output file...');
  const outputDir = path.dirname(CONFIG.outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(CONFIG.outputPath, JSON.stringify(codes, null, 2));

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('SNOMED CT PARSING SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total concepts:            ${stats.totalConcepts.toLocaleString()}`);
  console.log(`Active concepts:           ${stats.activeConcepts.toLocaleString()}`);
  console.log(`Concepts with FSN:         ${stats.conceptsWithFSN.toLocaleString()}`);
  console.log(`Concepts without FSN:      ${stats.conceptsWithoutFSN.toLocaleString()}`);
  console.log(`Valid codes output:        ${stats.validRecords.toLocaleString()}`);
  console.log(`Skipped:                   ${stats.skippedRecords.toLocaleString()}`);
  console.log();
  console.log('Entity Type Distribution:');
  Object.entries(stats.entityTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      const percentage = ((count / codes.length) * 100).toFixed(1);
      console.log(`  ${type.padEnd(20)} ${count.toString().padStart(7)} (${percentage}%)`);
    });
  console.log('='.repeat(80));
  console.log(`Output written to: ${CONFIG.outputPath}`);
  console.log();

  // Sample records
  if (codes.length > 0) {
    console.log('Sample Records (first 5):');
    console.log('-'.repeat(80));
    codes.slice(0, 5).forEach((code, index) => {
      console.log(`${index + 1}. ${code.code_value} - ${code.display_name}`);
      console.log(`   Entity Type: ${code.entity_type}`);
      console.log(`   Semantic Tag: ${code.region_specific_data.semantic_tag || 'N/A'}`);
      console.log(`   Synonyms (${code.synonyms.length}): ${code.synonyms.slice(0, 3).join(', ')}${code.synonyms.length > 3 ? '...' : ''}`);
      console.log();
    });
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  try {
    await parseSNOMED();
    process.exit(0);
  } catch (error: any) {
    console.error('Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
