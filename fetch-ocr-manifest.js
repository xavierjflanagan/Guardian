const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchManifest() {
  const manifestPath = 'd1dbe18c-afc2-421f-bd58-145ddb48cbca/062c36ee-82c5-4994-9900-5e45293b7198-ocr/manifest.json';

  const { data, error } = await supabase.storage
    .from('medical-docs')
    .download(manifestPath);

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  const text = await data.text();
  const manifest = JSON.parse(text);

  console.log(JSON.stringify(manifest, null, 2));

  // Also save to file
  fs.writeFileSync('/tmp/ocr-manifest.json', JSON.stringify(manifest, null, 2));
  console.error('\nManifest saved to /tmp/ocr-manifest.json');
}

fetchManifest().catch(console.error);
