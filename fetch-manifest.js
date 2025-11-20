const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchManifest() {
  const manifestPath = 'd1dbe18c-afc2-421f-bd58-145ddb48cbca/35d53f2d-869a-40da-a58e-3c2857b8a106-processed/manifest.json';

  const { data, error } = await supabase.storage
    .from('medical-docs')
    .download(manifestPath);

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  const text = await data.text();
  const manifest = JSON.parse(text);

  console.log('=== ENCOUNTER BOUNDARIES ===');
  manifest.encounters.forEach((enc, idx) => {
    console.log(`\nEncounter ${idx + 1}:`);
    console.log(`  Pages: ${enc.start_page} - ${enc.end_page}`);
    console.log(`  Type: ${enc.encounter_type}`);
    console.log(`  Date: ${enc.encounter_date}`);
    console.log(`  Provider: ${enc.provider_name || 'Unknown'}`);
  });
}

fetchManifest().catch(console.error);
