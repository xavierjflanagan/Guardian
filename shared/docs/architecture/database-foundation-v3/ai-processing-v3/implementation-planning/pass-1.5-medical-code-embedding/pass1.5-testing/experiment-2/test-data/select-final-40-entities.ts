/**
 * Select Final 40 Clinical Entities for Experiment 2
 *
 * Systematically queries the database to select:
 * - 20 PBS medications (organized into pairs/triplets for differentiation)
 * - 20 MBS procedures (organized into pairs/triplets for differentiation)
 *
 * All entities come from actual regional_medical_codes table.
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

interface MedicalEntity {
  entity_name: string;
  code_system: string;
  code_value: string;
  display_name: string;
  entity_type: string;
  group: string;
}

/**
 * Query database for medications by search term
 */
async function findMedication(searchTerm: string, preferredForm?: string): Promise<MedicalEntity | null> {
  const { data, error } = await supabase
    .from('regional_medical_codes')
    .select('code_value, display_name, entity_type')
    .eq('country_code', 'AUS')
    .eq('code_system', 'pbs')
    .ilike('display_name', `%${searchTerm}%`)
    .limit(20);

  if (error || !data || data.length === 0) {
    return null;
  }

  // Prefer standalone over combinations
  let selected = data[0];

  if (preferredForm) {
    const preferred = data.find(item =>
      item.display_name.toLowerCase().includes(preferredForm.toLowerCase())
    );
    if (preferred) selected = preferred;
  }

  // Prefer simpler formulations (avoid combinations)
  const standalone = data.find(item =>
    !item.display_name.toLowerCase().includes(' with ') &&
    !item.display_name.toLowerCase().includes(' + ')
  );
  if (standalone && !preferredForm) selected = standalone;

  return {
    entity_name: searchTerm,
    code_system: 'pbs',
    code_value: selected.code_value,
    display_name: selected.display_name,
    entity_type: selected.entity_type || 'medication',
    group: ''
  };
}

/**
 * Query database for procedures by search term
 */
async function findProcedure(searchTerm: string, excludeTerms: string[] = []): Promise<MedicalEntity | null> {
  const { data, error } = await supabase
    .from('regional_medical_codes')
    .select('code_value, display_name, entity_type')
    .eq('country_code', 'AUS')
    .eq('code_system', 'mbs')
    .ilike('display_name', `%${searchTerm}%`)
    .limit(20);

  if (error || !data || data.length === 0) {
    return null;
  }

  // Filter out excluded terms
  let filtered = data;
  if (excludeTerms.length > 0) {
    filtered = data.filter(item =>
      !excludeTerms.some(term => item.display_name.toLowerCase().includes(term.toLowerCase()))
    );
  }

  if (filtered.length === 0) {
    filtered = data;
  }

  const selected = filtered[0];

  return {
    entity_name: searchTerm,
    code_system: 'mbs',
    code_value: selected.code_value,
    display_name: selected.display_name,
    entity_type: selected.entity_type || 'procedure',
    group: ''
  };
}

/**
 * Select 20 PBS medications organized into differentiation groups
 */
async function selectMedications(): Promise<MedicalEntity[]> {
  console.log('Selecting 20 PBS medications...\n');

  const medications: MedicalEntity[] = [];

  // Group 1: Penicillins (4 similar beta-lactams)
  console.log('Group 1: Penicillins (beta-lactam antibiotics)');
  const amoxicillin = await findMedication('Amoxicillin', 'capsule');
  const flucloxacillin = await findMedication('Flucloxacillin');
  const dicloxacillin = await findMedication('Dicloxacillin');
  const cefalexin = await findMedication('Cefalexin');

  if (amoxicillin) { amoxicillin.group = 'Penicillins'; medications.push(amoxicillin); }
  if (flucloxacillin) { flucloxacillin.group = 'Penicillins'; medications.push(flucloxacillin); }
  if (dicloxacillin) { dicloxacillin.group = 'Penicillins'; medications.push(dicloxacillin); }
  if (cefalexin) { cefalexin.group = 'Penicillins'; medications.push(cefalexin); }
  console.log(`  Found ${medications.length}/4\n`);

  // Group 2: Statins (4 similar lipid-lowering agents)
  console.log('Group 2: Statins (lipid-lowering agents)');
  const atorvastatin = await findMedication('Atorvastatin');
  const simvastatin = await findMedication('Simvastatin');
  const rosuvastatin = await findMedication('Rosuvastatin');
  const pravastatin = await findMedication('Pravastatin');

  const statinsStart = medications.length;
  if (atorvastatin) { atorvastatin.group = 'Statins'; medications.push(atorvastatin); }
  if (simvastatin) { simvastatin.group = 'Statins'; medications.push(simvastatin); }
  if (rosuvastatin) { rosuvastatin.group = 'Statins'; medications.push(rosuvastatin); }
  if (pravastatin) { pravastatin.group = 'Statins'; medications.push(pravastatin); }
  console.log(`  Found ${medications.length - statinsStart}/4\n`);

  // Group 3: ACE Inhibitors (3 similar antihypertensives)
  console.log('Group 3: ACE Inhibitors (antihypertensives)');
  const perindopril = await findMedication('Perindopril');
  const ramipril = await findMedication('Ramipril');
  const enalapril = await findMedication('Enalapril');

  const aceStart = medications.length;
  if (perindopril) { perindopril.group = 'ACE Inhibitors'; medications.push(perindopril); }
  if (ramipril) { ramipril.group = 'ACE Inhibitors'; medications.push(ramipril); }
  if (enalapril) { enalapril.group = 'ACE Inhibitors'; medications.push(enalapril); }
  console.log(`  Found ${medications.length - aceStart}/3\n`);

  // Group 4: Chemotherapy agents (3 similar drugs)
  console.log('Group 4: Chemotherapy agents');
  const paclitaxel = await findMedication('Paclitaxel');
  const docetaxel = await findMedication('Docetaxel');
  const carboplatin = await findMedication('Carboplatin');

  const chemoStart = medications.length;
  if (paclitaxel) { paclitaxel.group = 'Chemotherapy'; medications.push(paclitaxel); }
  if (docetaxel) { docetaxel.group = 'Chemotherapy'; medications.push(docetaxel); }
  if (carboplatin) { carboplatin.group = 'Chemotherapy'; medications.push(carboplatin); }
  console.log(`  Found ${medications.length - chemoStart}/3\n`);

  // Group 5: Common analgesics/antiplatelets (3 medications)
  console.log('Group 5: Analgesics & Antiplatelets');
  const aspirin = await findMedication('Aspirin');
  const clopidogrel = await findMedication('Clopidogrel');
  const paracetamol = await findMedication('Paracetamol');

  const analgesicsStart = medications.length;
  if (aspirin) { aspirin.group = 'Analgesics/Antiplatelets'; medications.push(aspirin); }
  if (clopidogrel) { clopidogrel.group = 'Analgesics/Antiplatelets'; medications.push(clopidogrel); }
  if (paracetamol) { paracetamol.group = 'Analgesics/Antiplatelets'; medications.push(paracetamol); }
  console.log(`  Found ${medications.length - analgesicsStart}/3\n`);

  // Group 6: Other common medications (3 medications)
  console.log('Group 6: Other common medications');
  const metformin = await findMedication('Metformin');
  const metoprolol = await findMedication('Metoprolol');
  const omeprazole = await findMedication('Omeprazole');

  const otherStart = medications.length;
  if (metformin) { metformin.group = 'Other common'; medications.push(metformin); }
  if (metoprolol) { metoprolol.group = 'Other common'; medications.push(metoprolol); }
  if (omeprazole) { omeprazole.group = 'Other common'; medications.push(omeprazole); }
  console.log(`  Found ${medications.length - otherStart}/3\n`);

  console.log(`Total medications selected: ${medications.length}/20\n`);
  return medications;
}

/**
 * Select 20 MBS procedures organized into differentiation groups
 */
async function selectProcedures(): Promise<MedicalEntity[]> {
  console.log('Selecting 20 MBS procedures...\n');

  const procedures: MedicalEntity[] = [];

  // Group 1: Imaging - X-rays (3 different anatomical sites)
  console.log('Group 1: X-ray imaging (different sites)');
  const chestXray = await findProcedure('chest', ['examination']);
  const spineXray = await findProcedure('spine', ['examination', 'biopsy']);
  const abdomenXray = await findProcedure('abdomen', ['examination', 'biopsy']);

  if (chestXray) { chestXray.group = 'X-rays'; procedures.push(chestXray); }
  if (spineXray) { spineXray.group = 'X-rays'; procedures.push(spineXray); }
  if (abdomenXray) { abdomenXray.group = 'X-rays'; procedures.push(abdomenXray); }
  console.log(`  Found ${procedures.length}/3\n`);

  // Group 2: Advanced imaging (4 different modalities)
  console.log('Group 2: Advanced imaging');
  const ctScan = await findProcedure('computed tomography');
  const mri = await findProcedure('magnetic resonance');
  const ultrasound = await findProcedure('ultrasound', ['examination']);
  const mammography = await findProcedure('mammography');

  const imagingStart = procedures.length;
  if (ctScan) { ctScan.group = 'Advanced imaging'; procedures.push(ctScan); }
  if (mri) { mri.group = 'Advanced imaging'; procedures.push(mri); }
  if (ultrasound) { ultrasound.group = 'Advanced imaging'; procedures.push(ultrasound); }
  if (mammography) { mammography.group = 'Advanced imaging'; procedures.push(mammography); }
  console.log(`  Found ${procedures.length - imagingStart}/4\n`);

  // Group 3: Biopsies (3 different sites)
  console.log('Group 3: Biopsies');
  const liverBiopsy = await findProcedure('liver biopsy');
  const kidneyBiopsy = await findProcedure('kidney biopsy');
  const boneBiopsy = await findProcedure('bone biopsy');

  const biopsyStart = procedures.length;
  if (liverBiopsy) { liverBiopsy.group = 'Biopsies'; procedures.push(liverBiopsy); }
  if (kidneyBiopsy) { kidneyBiopsy.group = 'Biopsies'; procedures.push(kidneyBiopsy); }
  if (boneBiopsy) { boneBiopsy.group = 'Biopsies'; procedures.push(boneBiopsy); }
  console.log(`  Found ${procedures.length - biopsyStart}/3\n`);

  // Group 4: Endoscopic procedures (3 procedures)
  console.log('Group 4: Endoscopic procedures');
  const colonoscopy = await findProcedure('colonoscopy');
  const gastroscopy = await findProcedure('gastroscopy');
  const bronchoscopy = await findProcedure('bronchoscopy');

  const endoscopyStart = procedures.length;
  if (colonoscopy) { colonoscopy.group = 'Endoscopy'; procedures.push(colonoscopy); }
  if (gastroscopy) { gastroscopy.group = 'Endoscopy'; procedures.push(gastroscopy); }
  if (bronchoscopy) { bronchoscopy.group = 'Endoscopy'; procedures.push(bronchoscopy); }
  console.log(`  Found ${procedures.length - endoscopyStart}/3\n`);

  // Group 5: Surgical procedures (4 procedures)
  console.log('Group 5: Surgical procedures');
  const kneeReplacement = await findProcedure('knee replacement');
  const hipReplacement = await findProcedure('hip replacement');
  const arthroscopy = await findProcedure('arthroscopy');
  const excision = await findProcedure('excision', ['biopsy']);

  const surgeryStart = procedures.length;
  if (kneeReplacement) { kneeReplacement.group = 'Surgery'; procedures.push(kneeReplacement); }
  if (hipReplacement) { hipReplacement.group = 'Surgery'; procedures.push(hipReplacement); }
  if (arthroscopy) { arthroscopy.group = 'Surgery'; procedures.push(arthroscopy); }
  if (excision) { excision.group = 'Surgery'; procedures.push(excision); }
  console.log(`  Found ${procedures.length - surgeryStart}/4\n`);

  // Group 6: Diagnostic tests (3 procedures)
  console.log('Group 6: Diagnostic tests');
  const ecg = await findProcedure('electrocardiography');
  const spirometry = await findProcedure('spirometry');
  const bloodTest = await findProcedure('blood', ['biopsy', 'examination']);

  const diagnosticStart = procedures.length;
  if (ecg) { ecg.group = 'Diagnostics'; procedures.push(ecg); }
  if (spirometry) { spirometry.group = 'Diagnostics'; procedures.push(spirometry); }
  if (bloodTest) { bloodTest.group = 'Diagnostics'; procedures.push(bloodTest); }
  console.log(`  Found ${procedures.length - diagnosticStart}/3\n`);

  console.log(`Total procedures selected: ${procedures.length}/20\n`);
  return procedures;
}

/**
 * Display final entity list
 */
function displayFinalList(medications: MedicalEntity[], procedures: MedicalEntity[]): void {
  console.log('='.repeat(100));
  console.log('FINAL 40 CLINICAL ENTITIES FOR EXPERIMENT 2');
  console.log('='.repeat(100));
  console.log('');

  // Medications table
  console.log('MEDICATIONS (20 PBS codes)');
  console.log('='.repeat(100));
  console.log('');
  console.log('| # | Group | Entity Name | Code Value | Display Name (truncated) |');
  console.log('|---|-------|-------------|------------|--------------------------|');

  medications.forEach((med, idx) => {
    const displayTrunc = med.display_name.substring(0, 50) + (med.display_name.length > 50 ? '...' : '');
    console.log(`| ${(idx + 1).toString().padStart(2)} | ${med.group.padEnd(20)} | ${med.entity_name.padEnd(15)} | ${med.code_value.padEnd(10)} | ${displayTrunc} |`);
  });

  console.log('');
  console.log('');

  // Procedures table
  console.log('PROCEDURES (20 MBS codes)');
  console.log('='.repeat(100));
  console.log('');
  console.log('| # | Group | Entity Name | Code Value | Display Name (truncated) |');
  console.log('|---|-------|-------------|------------|--------------------------|');

  procedures.forEach((proc, idx) => {
    const displayTrunc = proc.display_name.substring(0, 50) + (proc.display_name.length > 50 ? '...' : '');
    console.log(`| ${(idx + 1).toString().padStart(2)} | ${proc.group.padEnd(17)} | ${proc.entity_name.padEnd(20)} | ${proc.code_value.padEnd(10)} | ${displayTrunc} |`);
  });

  console.log('');
  console.log('='.repeat(100));
  console.log(`Total entities: ${medications.length + procedures.length}`);
  console.log('='.repeat(100));
}

/**
 * Save entities to JSON file
 */
function saveEntities(medications: MedicalEntity[], procedures: MedicalEntity[]): void {
  const outputPath = path.join(projectRoot, 'final-40-entities.json');

  fs.writeFileSync(outputPath, JSON.stringify({
    medications,
    procedures,
    total: medications.length + procedures.length,
    timestamp: new Date().toISOString()
  }, null, 2));

  console.log('');
  console.log(`Results saved to: ${outputPath}`);
}

async function main() {
  console.log('='.repeat(100));
  console.log('SELECTING FINAL 40 CLINICAL ENTITIES FROM DATABASE');
  console.log('='.repeat(100));
  console.log('');

  const medications = await selectMedications();
  const procedures = await selectProcedures();

  displayFinalList(medications, procedures);
  saveEntities(medications, procedures);

  console.log('');
  console.log('✓ Entity selection complete!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
