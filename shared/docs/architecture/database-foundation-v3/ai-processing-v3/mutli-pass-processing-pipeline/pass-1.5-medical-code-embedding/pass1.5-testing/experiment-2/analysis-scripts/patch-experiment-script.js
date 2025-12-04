const fs = require('fs');

// Read the original script
let script = fs.readFileSync('run-experiment-2.ts', 'utf-8');

// Add loadFinalEntities function after the STRATEGIES constant
const loadEntitiesFn = `
/**
 * Load final 40 entities from JSON file
 */
function loadFinalEntities(): { medications: any[]; procedures: any[] } {
  const entitiesPath = path.join(projectRoot, 'final-40-entities.json');
  if (!fs.existsSync(entitiesPath)) {
    throw new Error(\`Could not find final-40-entities.json at: \${entitiesPath}\`);
  }
  const data = JSON.parse(fs.readFileSync(entitiesPath, 'utf-8'));
  return {
    medications: data.medications || [],
    procedures: data.procedures || []
  };
}
`;

// Insert after STRATEGIES line
script = script.replace(
  "const STRATEGIES = ['original', 'normalized', 'core'] as const;\ntype Strategy = typeof STRATEGIES[number];",
  `const STRATEGIES = ['original', 'normalized', 'core'] as const;\ntype Strategy = typeof STRATEGIES[number];${loadEntitiesFn}`
);

// Replace fetchMedications function
const oldFetchMeds = script.match(/async function fetchMedications\(\): Promise<MedicalEntity\[\]> \{[\s\S]*?^}/m);
if (oldFetchMeds) {
  const newFetchMeds = `async function fetchMedications(): Promise<MedicalEntity[]> {
  console.log('\\nFetching 20 medications from database...');
  const { medications: entityList } = loadFinalEntities();
  const medications: MedicalEntity[] = [];

  for (const entity of entityList) {
    const { data, error } = await supabase
      .from('regional_medical_codes')
      .select('id, code_system, code_value, display_name, normalized_embedding_text')
      .eq('code_value', entity.code_value)
      .eq('code_system', 'pbs')
      .eq('country_code', 'AUS')
      .single();

    if (error || !data) {
      console.warn(\`⚠️  Could not find medication: \${entity.entity_name} (\${entity.code_value})\`);
      continue;
    }

    medications.push(generateTextVersions(data, 'medication'));
    console.log(\`  ✓ \${entity.entity_name}: \${data.display_name.substring(0, 60)}...\`);
  }

  console.log(\`\\nFetched \${medications.length}/20 medications\`);
  return medications;
}`;
  
  script = script.replace(oldFetchMeds[0], newFetchMeds);
}

// Replace fetchProcedures function
const oldFetchProcs = script.match(/async function fetchProcedures\(\): Promise<MedicalEntity\[\]> \{[\s\S]*?^}/m);
if (oldFetchProcs) {
  const newFetchProcs = `async function fetchProcedures(): Promise<MedicalEntity[]> {
  console.log('\\nFetching 20 procedures from database...');
  const { procedures: entityList } = loadFinalEntities();
  const procedures: MedicalEntity[] = [];

  for (const entity of entityList) {
    const { data, error } = await supabase
      .from('regional_medical_codes')
      .select('id, code_system, code_value, display_name, normalized_embedding_text')
      .eq('code_value', entity.code_value)
      .eq('code_system', 'mbs')
      .eq('country_code', 'AUS')
      .single();

    if (error || !data) {
      console.warn(\`⚠️  Could not find procedure: \${entity.entity_name} (\${entity.code_value})\`);
      continue;
    }

    procedures.push(generateTextVersions(data, 'procedure'));
    console.log(\`  ✓ \${entity.entity_name}: \${data.display_name.substring(0, 60)}...\`);
  }

  console.log(\`\\nFetched \${procedures.length}/20 procedures\`);
  return procedures;
}`;
  
  script = script.replace(oldFetchProcs[0], newFetchProcs);
}

// Write the patched script
fs.writeFileSync('run-experiment-2.ts', script);
console.log('✓ Patched run-experiment-2.ts');
