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
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

async function searchProcedure(term: string) {
  const { data } = await supabase
    .from('regional_medical_codes')
    .select('code_value, display_name')
    .eq('country_code', 'AUS')
    .eq('code_system', 'mbs')
    .ilike('display_name', `%${term}%`)
    .limit(5);

  console.log(`\nSearch: "${term}"`);
  if (data && data.length > 0) {
    data.forEach((item, idx) => {
      console.log(`  ${idx + 1}. [${item.code_value}] ${item.display_name.substring(0, 80)}...`);
    });
  } else {
    console.log(`  No results`);
  }
}

async function main() {
  // Try different searches for 2 more procedures
  await searchProcedure('skin');
  await searchProcedure('bone marrow');
  await searchProcedure('thyroid');
  await searchProcedure('prostate');
  await searchProcedure('lung');
}

main();
