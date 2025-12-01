const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const patientId = 'd1dbe18c-afc2-421f-bd58-145ddb48cbca';
const shellFileId = '3195b2af-bafb-40ed-8408-e83bdd39cebf';
const storagePath = `${patientId}/${shellFileId}-ocr/enhanced-ocr-y.txt`;

async function main() {
  const result = await supabase.storage
    .from('medical-docs')
    .download(storagePath);

  if (result.error) {
    console.error('Error:', result.error.message);
    return;
  }
  const text = await result.data.text();
  console.log(text);
}

main();
