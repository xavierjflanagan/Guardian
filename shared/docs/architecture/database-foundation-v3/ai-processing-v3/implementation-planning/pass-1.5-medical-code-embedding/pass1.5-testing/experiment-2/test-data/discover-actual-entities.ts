/**
 * Discover Actual Medical Entities in Database
 *
 * Searches for each proposed medication and procedure to see what actually exists
 * in the regional_medical_codes table.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

function findProjectRoot(): string {
  let currentDir = process.cwd();
  while (currentDir !== '/') {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// My proposed medications (search terms)
const MEDICATION_SEARCHES = [
  'Amoxicillin',
  'Dicloxacillin',
  'Flucloxacillin',
  'Cefalexin',
  'Metformin',
  'Metoprolol',
  'Atorvastatin',
  'Simvastatin',
  'Rosuvastatin',
  'clavulanic acid',  // for Amox+clav combination
  'Paclitaxel',
  'Docetaxel',
  'Carboplatin',
  'Perindopril',
  'Lisinopril',
  'Ramipril',
  'Paracetamol',
  'Ibuprofen',
  'Aspirin',
  'Clopidogrel'
];

// My proposed procedures (search terms)
const PROCEDURE_SEARCHES = [
  'chest',           // for chest X-ray
  'x-ray',           // general x-ray
  'spine',           // for spine imaging
  'biopsy',          // various biopsies
  'skin biopsy',
  'liver biopsy',
  'replacement',     // for hip/knee replacement
  'arthroscopy',     // for knee arthroscopy
  'excision',        // for skin lesion excision
  'electrocardiography', // ECG
  'spirometry',
  'blood',           // for blood tests
  'colonoscopy',
  'endoscopy',
  'computed tomography', // CT scan
  'magnetic resonance',  // MRI
  'ultrasound',
  'mammography',     // potential addition
  'bone density'     // potential addition
];

async function searchMedications() {
  console.log('='.repeat(80));
  console.log('SEARCHING PBS MEDICATIONS');
  console.log('='.repeat(80));
  console.log('');

  const found: any[] = [];
  const notFound: string[] = [];

  for (const searchTerm of MEDICATION_SEARCHES) {
    console.log(`Searching for: "${searchTerm}"...`);

    const { data, error } = await supabase
      .from('regional_medical_codes')
      .select('code_value, display_name, entity_type')
      .eq('country_code', 'AUS')
      .eq('code_system', 'pbs')
      .ilike('display_name', `%${searchTerm}%`)
      .limit(5);

    if (error) {
      console.error(`  Error: ${error.message}`);
      continue;
    }

    if (!data || data.length === 0) {
      console.log(`  ❌ NOT FOUND`);
      notFound.push(searchTerm);
    } else {
      console.log(`  ✓ Found ${data.length} matches:`);
      data.forEach((item, idx) => {
        console.log(`    ${idx + 1}. [${item.code_value}] ${item.display_name.substring(0, 80)}...`);
        if (idx === 0) {
          found.push({ search: searchTerm, ...item });
        }
      });
    }
    console.log('');
  }

  console.log('='.repeat(80));
  console.log(`MEDICATIONS SUMMARY: ${found.length}/${MEDICATION_SEARCHES.length} found`);
  console.log('='.repeat(80));
  console.log('');

  if (notFound.length > 0) {
    console.log('Not found:');
    notFound.forEach(term => console.log(`  - ${term}`));
    console.log('');
  }

  return found;
}

async function searchProcedures() {
  console.log('='.repeat(80));
  console.log('SEARCHING MBS PROCEDURES');
  console.log('='.repeat(80));
  console.log('');

  const found: any[] = [];
  const notFound: string[] = [];

  for (const searchTerm of PROCEDURE_SEARCHES) {
    console.log(`Searching for: "${searchTerm}"...`);

    const { data, error } = await supabase
      .from('regional_medical_codes')
      .select('code_value, display_name, entity_type')
      .eq('country_code', 'AUS')
      .eq('code_system', 'mbs')
      .ilike('display_name', `%${searchTerm}%`)
      .limit(5);

    if (error) {
      console.error(`  Error: ${error.message}`);
      continue;
    }

    if (!data || data.length === 0) {
      console.log(`  ❌ NOT FOUND`);
      notFound.push(searchTerm);
    } else {
      console.log(`  ✓ Found ${data.length} matches:`);
      data.forEach((item, idx) => {
        console.log(`    ${idx + 1}. [${item.code_value}] ${item.display_name.substring(0, 100)}...`);
        if (idx === 0 && !found.some(f => f.code_value === item.code_value)) {
          found.push({ search: searchTerm, ...item });
        }
      });
    }
    console.log('');
  }

  console.log('='.repeat(80));
  console.log(`PROCEDURES SUMMARY: ${found.length} unique found`);
  console.log('='.repeat(80));
  console.log('');

  if (notFound.length > 0) {
    console.log('Not found:');
    notFound.forEach(term => console.log(`  - ${term}`));
    console.log('');
  }

  return found;
}

async function main() {
  console.log('DISCOVERING ACTUAL MEDICAL ENTITIES IN DATABASE');
  console.log('');

  const medications = await searchMedications();
  const procedures = await searchProcedures();

  // Save results
  const outputPath = path.join(projectRoot, 'discovered-entities.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    medications,
    procedures,
    timestamp: new Date().toISOString()
  }, null, 2));

  console.log('='.repeat(80));
  console.log(`Results saved to: ${outputPath}`);
  console.log('='.repeat(80));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
