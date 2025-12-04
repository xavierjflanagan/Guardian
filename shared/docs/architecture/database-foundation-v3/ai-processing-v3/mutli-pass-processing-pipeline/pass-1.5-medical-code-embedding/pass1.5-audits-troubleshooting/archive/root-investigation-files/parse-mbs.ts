/**
 * MBS (Medicare Benefits Schedule) Parser
 * 
 * Purpose: Parse Australian MBS XML data into standardized medical code format
 * Source: http://www.mbsonline.gov.au/
 * Data: XML format with ~5,000 medical procedure codes
 */

import * as fs from 'fs-extra';
import * as xml2js from 'xml2js';
import * as path from 'path';

// Configuration
const CONFIG = {
  input: {
    xmlFile: '/Users/xflanagan/Documents/GitHub/Guardian-Cursor/data/medical-codes/mbs/raw/MBS-XML-20251101.XML',
  },
  output: {
    jsonFile: '/Users/xflanagan/Documents/GitHub/Guardian-Cursor/data/medical-codes/mbs/processed/mbs_codes.json',
  },
  library: {
    version: 'v2025Q4',
    system: 'mbs',
    country: 'AUS',
    entityType: 'procedure',
  }
};

interface RawMBSItem {
  ItemNum: string[] | string;
  SubItemNum: string[] | string;
  Category: string[] | string;
  Group: string[] | string;
  SubGroup: string[] | string;
  ItemType: string[] | string;
  Description: string[] | string;
  ScheduleFee: string[] | string;
  Benefit100: string[] | string;
  ItemStartDate: string[] | string;
  ItemEndDate: string[] | string;
  BenefitType: string[] | string;
}

interface StandardizedMBSCode {
  code_system: string;
  code_value: string;
  grouping_code: string;
  display_name: string;
  entity_type: string;
  search_text: string;
  library_version: string;
  country_code: string;
  region_specific_data: {
    category: string;
    group: string;
    sub_group?: string;
    item_type: string;
    schedule_fee?: number;
    benefit_100?: number;
    benefit_type: string;
    start_date: string;
    end_date?: string;
  };
}

/**
 * Parse XML string to JavaScript object
 */
async function parseXML(xmlContent: string): Promise<any> {
  const parser = new xml2js.Parser({
    explicitArray: true,
    trim: true,
    normalize: true,
  });
  
  return await parser.parseStringPromise(xmlContent);
}

/**
 * Clean and validate MBS description text
 */
function cleanDescription(description: string): string {
  return description
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .replace(/\n/g, ' ')   // Remove line breaks
    .trim()
    .substring(0, 500);    // Limit length for search optimization
}

/**
 * Helper function to extract string value from XML field
 */
function extractString(field: string[] | string | undefined): string {
  if (!field) return '';
  if (Array.isArray(field)) return field[0] || '';
  return field || '';
}

/**
 * Create search text optimized for embedding generation
 */
function createSearchText(item: RawMBSItem): string {
  const description = cleanDescription(extractString(item.Description));
  const itemNum = extractString(item.ItemNum);
  const group = extractString(item.Group);
  const category = extractString(item.Category);
  
  // Combine for semantic search optimization
  return `MBS ${itemNum} ${group} ${description}`.trim();
}

/**
 * Parse schedule fee to number
 */
function parseScheduleFee(feeString: string): number | undefined {
  if (!feeString || feeString.trim() === '') return undefined;
  const fee = parseFloat(feeString);
  return isNaN(fee) ? undefined : fee;
}

/**
 * Convert raw MBS item to standardized format
 */
function standardizeMBSItem(item: RawMBSItem): StandardizedMBSCode {
  const itemNum = extractString(item.ItemNum);
  const subItemNum = extractString(item.SubItemNum);
  const category = extractString(item.Category);
  const group = extractString(item.Group);
  
  // Create hierarchical code structure
  const codeValue = subItemNum ? `${itemNum}_${subItemNum}` : itemNum;
  const groupingCode = group || category; // Use group for clustering related procedures
  
  return {
    code_system: CONFIG.library.system,
    code_value: codeValue,
    grouping_code: groupingCode,
    display_name: cleanDescription(extractString(item.Description)),
    entity_type: CONFIG.library.entityType,
    search_text: createSearchText(item),
    library_version: CONFIG.library.version,
    country_code: CONFIG.library.country,
    region_specific_data: {
      category: category,
      group: group,
      sub_group: extractString(item.SubGroup) || undefined,
      item_type: extractString(item.ItemType),
      schedule_fee: parseScheduleFee(extractString(item.ScheduleFee)),
      benefit_100: parseScheduleFee(extractString(item.Benefit100)),
      benefit_type: extractString(item.BenefitType),
      start_date: extractString(item.ItemStartDate),
      end_date: extractString(item.ItemEndDate) || undefined,
    }
  };
}

/**
 * Filter valid MBS items (active procedures only)
 */
function isValidMBSItem(item: RawMBSItem): boolean {
  // Must have item number and description
  const itemNum = extractString(item.ItemNum);
  const description = extractString(item.Description);
  
  if (!itemNum || !description) {
    return false;
  }
  
  // Must be active (no end date or future end date)
  const endDate = extractString(item.ItemEndDate);
  if (endDate && endDate.trim() !== '') {
    // Check if end date is in the past (basic validation)
    // Format appears to be DD.MM.YYYY
    const today = new Date();
    const [day, month, year] = endDate.split('.');
    if (year && parseInt(year) < today.getFullYear()) {
      return false;
    }
  }
  
  // Must have meaningful description (not just whitespace)
  if (description.trim().length < 10) {
    return false;
  }
  
  return true;
}

/**
 * Main parsing function
 */
async function parseMBS(): Promise<StandardizedMBSCode[]> {
  console.log('🚀 Starting MBS Parser');
  
  // 1. Read XML file
  console.log('📂 Reading MBS XML file...');
  if (!await fs.pathExists(CONFIG.input.xmlFile)) {
    throw new Error(`MBS XML file not found: ${CONFIG.input.xmlFile}`);
  }
  
  const xmlContent = await fs.readFile(CONFIG.input.xmlFile, 'utf-8');
  console.log(`📊 XML file size: ${(xmlContent.length / 1024 / 1024).toFixed(1)} MB`);
  
  // 2. Parse XML
  console.log('⚡ Parsing XML structure...');
  const xmlData = await parseXML(xmlContent);
  
  // 3. Extract MBS items
  const rawItems: RawMBSItem[] = xmlData.MBS_XML?.Data || [];
  console.log(`🔍 Found ${rawItems.length} raw MBS items`);
  
  // 4. Filter valid items
  console.log('🧹 Filtering valid procedure codes...');
  const validItems = rawItems.filter(isValidMBSItem);
  console.log(`✅ ${validItems.length} valid items (${((validItems.length / rawItems.length) * 100).toFixed(1)}% success rate)`);
  
  // 5. Standardize format
  console.log('🔧 Converting to standardized format...');
  const standardizedCodes = validItems.map(standardizeMBSItem);
  
  // 6. Validate results
  const uniqueItemNums = new Set(standardizedCodes.map(code => code.code_value));
  const uniqueGroups = new Set(standardizedCodes.map(code => code.grouping_code));
  
  console.log(`📋 Processing Summary:`);
  console.log(`   - Total procedures: ${standardizedCodes.length}`);
  console.log(`   - Unique item numbers: ${uniqueItemNums.size}`);
  console.log(`   - Unique groups: ${uniqueGroups.size}`);
  console.log(`   - Entity type: ${CONFIG.library.entityType}`);
  console.log(`   - Country: ${CONFIG.library.country}`);
  
  return standardizedCodes;
}

/**
 * Save standardized codes to JSON
 */
async function saveCodes(codes: StandardizedMBSCode[]): Promise<void> {
  console.log('💾 Saving standardized MBS codes...');
  
  // Ensure output directory exists
  await fs.ensureDir(path.dirname(CONFIG.output.jsonFile));
  
  // Save with pretty formatting for review
  await fs.writeJson(CONFIG.output.jsonFile, codes, { spaces: 2 });
  
  const fileSizeKB = (await fs.stat(CONFIG.output.jsonFile)).size / 1024;
  console.log(`✅ Saved ${codes.length} codes to ${CONFIG.output.jsonFile}`);
  console.log(`📁 Output file size: ${fileSizeKB.toFixed(1)} KB`);
}

/**
 * Display sample codes for verification
 */
function displaySamples(codes: StandardizedMBSCode[]): void {
  console.log('\n🔍 Sample MBS Procedures:');
  console.log('=' * 80);
  
  // Show first 5 codes as samples
  codes.slice(0, 5).forEach((code, index) => {
    console.log(`${index + 1}. Item ${code.code_value} (Group ${code.grouping_code})`);
    console.log(`   Description: ${code.display_name.substring(0, 80)}...`);
    console.log(`   Fee: $${code.region_specific_data.schedule_fee || 'N/A'}`);
    console.log('');
  });
  
  // Show statistics by group
  const groupStats = codes.reduce((acc, code) => {
    const group = code.grouping_code;
    acc[group] = (acc[group] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('📊 Procedures by Group:');
  Object.entries(groupStats)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .forEach(([group, count]) => {
      console.log(`   ${group}: ${count} procedures`);
    });
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    const codes = await parseMBS();
    await saveCodes(codes);
    displaySamples(codes);
    
    console.log('\n✅ MBS parser completed successfully!');
    console.log(`📄 Output: ${CONFIG.output.jsonFile}`);
    console.log('🔄 Ready for embedding generation');
    
  } catch (error: any) {
    console.error('❌ MBS parser failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run parser
main();