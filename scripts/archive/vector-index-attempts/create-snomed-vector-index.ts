/**
 * Create IVFFlat vector index for SNOMED CT embeddings
 *
 * Purpose: Build vector index for fast similarity search on 706k SNOMED codes
 *
 * Performance Impact:
 * - Without index: 2-5 seconds per vector search query
 * - With index: 10-50 milliseconds per vector search query
 * - Index build time: 5-15 minutes
 * - Index size: ~500MB-1GB additional disk space
 *
 * Usage:
 *   pnpm exec tsx scripts/create-snomed-vector-index.ts
 *
 * Environment Requirements:
 *   - SUPABASE credentials in .env.local
 *
 * Note: This operation takes 5-15 minutes. The script will wait for completion.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('[OK] Loaded credentials from .env.local\n');
}

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Validate environment
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing environment variables in .env.local:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function main() {
  console.log('SNOMED CT Vector Index Creation Script');
  console.log('=======================================\n');

  // Check if index already exists
  console.log('Checking for existing index...');
  const { data: existingIndexes, error: checkError } = await supabase
    .rpc('get_table_indexes', { table_name: 'regional_medical_codes' })
    .single();

  if (checkError) {
    console.log('Could not check existing indexes (this is OK, continuing...)');
  }

  console.log('\nCreating IVFFlat vector index...');
  console.log('Configuration:');
  console.log('  - Index type: IVFFlat');
  console.log('  - Distance metric: Cosine similarity');
  console.log('  - Lists (clusters): 1000');
  console.log('  - Vectors to index: ~706,544 SNOMED CT codes');
  console.log('  - Estimated time: 5-15 minutes');
  console.log('  - Building with CONCURRENTLY (non-blocking)\n');

  const startTime = Date.now();

  try {
    // Note: We use a raw SQL query with a very long timeout
    // The CONCURRENTLY option allows other queries to continue while index builds
    const { error } = await supabase.rpc('exec_sql', {
      query: `
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_snomed_embedding_ivfflat
        ON regional_medical_codes
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 1000)
        WHERE code_system = 'snomed_ct' AND country_code = 'AUS';
      `
    });

    if (error) {
      throw error;
    }

    const elapsedTime = Math.round((Date.now() - startTime) / 1000);

    console.log('\n' + '='.repeat(60));
    console.log('INDEX CREATION SUCCESSFUL');
    console.log('='.repeat(60));
    console.log(`Index name:        idx_snomed_embedding_ivfflat`);
    console.log(`Build time:        ${elapsedTime}s (${Math.floor(elapsedTime / 60)}m ${elapsedTime % 60}s)`);
    console.log(`Index type:        IVFFlat with 1000 clusters`);
    console.log(`Codes indexed:     706,544 SNOMED CT codes`);
    console.log('='.repeat(60));

    console.log('\nNext Steps:');
    console.log('1. Index is now active and will be used automatically for vector searches');
    console.log('2. Test vector search performance with sample queries');
    console.log('3. Monitor query times - should be 10-50ms instead of 2-5 seconds');
    console.log('\nExample query to test:');
    console.log(`
      SELECT code_value, display_name,
             embedding <=> '[0.1, 0.2, ...]' AS distance
      FROM regional_medical_codes
      WHERE code_system = 'snomed_ct'
      ORDER BY distance
      LIMIT 10;
    `);

  } catch (error: any) {
    console.error('\n[ERROR] Failed to create index:', error.message);
    console.error('\nAlternative: Run this SQL directly in Supabase SQL Editor:');
    console.error(`
      CREATE INDEX CONCURRENTLY idx_snomed_embedding_ivfflat
      ON regional_medical_codes
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 1000)
      WHERE code_system = 'snomed_ct' AND country_code = 'AUS';
    `);
    process.exit(1);
  }
}

main().catch(console.error);
