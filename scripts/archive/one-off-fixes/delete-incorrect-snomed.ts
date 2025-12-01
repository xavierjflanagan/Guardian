/**
 * Delete incorrect SNOMED codes from universal_medical_codes
 *
 * These were incorrectly loaded - SNOMED should be in regional_medical_codes
 * with code_system='snomed_ct' and country_code='AUS'
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function main() {
  console.log('Deleting incorrect SNOMED codes from universal_medical_codes...\n');

  // Delete in batches to avoid timeout
  let totalDeleted = 0;
  let batchNum = 0;

  while (true) {
    batchNum++;
    console.log(`Batch ${batchNum}: Deleting up to 1000 codes...`);

    const { data, error } = await supabase
      .from('universal_medical_codes')
      .delete()
      .eq('code_system', 'snomed')
      .order('id')
      .limit(1000)
      .select('id');

    if (error) {
      console.error(`[ERROR] ${error.message}`);
      break;
    }

    const deletedCount = data?.length || 0;
    totalDeleted += deletedCount;
    console.log(`  Deleted ${deletedCount} codes (total: ${totalDeleted})`);

    if (deletedCount === 0) {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\nTotal deleted: ${totalDeleted}`);
  console.log('Done!');
}

main().catch(console.error);
