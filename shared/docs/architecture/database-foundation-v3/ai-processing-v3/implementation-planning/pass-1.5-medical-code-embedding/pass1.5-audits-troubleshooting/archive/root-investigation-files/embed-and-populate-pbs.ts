/**
 * Direct PBS Embedding and Population Script
 * 
 * Purpose: Generate embeddings and populate database directly (no intermediate JSON)
 * Solves: File size limitation with 14K+ embeddings
 */

import * as fs from 'fs-extra';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// Configuration
const CONFIG = {
  openai: {
    model: 'text-embedding-3-small',
    dimensions: 1536,
    batchSize: 100,
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  batch: {
    size: 1000, // Insert 1000 codes per batch
    delayMs: 100,
  }
};

// Initialize clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

interface PBSCode {
  code_system: string;
  code_value: string;
  display_name: string;
  entity_type: string;
  search_text: string;
  library_version: string;
  country_code: string;
  grouping_code: string;
  region_specific_data: any;
}

interface EmbeddedPBSCode extends PBSCode {
  embedding: number[];
}

/**
 * Generate embeddings for a batch of codes
 */
async function generateEmbeddingBatch(codes: PBSCode[]): Promise<EmbeddedPBSCode[]> {
  const inputs = codes.map(code => code.search_text);
  
  const response = await openai.embeddings.create({
    model: CONFIG.openai.model,
    input: inputs,
    dimensions: CONFIG.openai.dimensions,
  });

  return codes.map((code, index) => ({
    ...code,
    embedding: response.data[index].embedding,
  }));
}

/**
 * Convert to database format
 */
function toDBFormat(code: EmbeddedPBSCode) {
  return {
    code_system: code.code_system,
    code_value: code.code_value,
    display_name: code.display_name,
    embedding: `[${code.embedding.join(',')}]`, // pgvector format
    country_code: code.country_code,
    entity_type: code.entity_type,
    search_text: code.search_text,
    library_version: code.library_version,
    valid_from: new Date().toISOString().split('T')[0],
    valid_to: null,
    superseded_by: null,
    active: true,
    authority_required: false,
    // PBS-specific fields
    pbs_authority_required: code.region_specific_data?.pbs_authority_required || false,
    tga_approved: code.region_specific_data?.tga_approved || true,
    // New Migration 28 fields with defaults for PBS
    clinical_specificity: 'general',
    typical_setting: 'primary_care',
  };
}

/**
 * Insert batch to database
 */
async function insertBatch(batch: any[]): Promise<{ success: number; failed: number }> {
  try {
    const { error } = await supabase
      .from('regional_medical_codes')
      .insert(batch);

    if (error) {
      if (error.code === '23505') {
        // Duplicate key - skip silently
        return { success: 0, failed: 0 };
      }
      throw error;
    }

    return { success: batch.length, failed: 0 };
  } catch (error: any) {
    console.error(`❌ Batch insert failed: ${error.message}`);
    return { success: 0, failed: batch.length };
  }
}

/**
 * Main processing function
 */
async function main() {
  console.log('🚀 Starting PBS Direct Embedding and Population');

  // 1. Get or create embedding batch record
  let batchRecord;
  const { data: existingBatch } = await supabase
    .from('embedding_batches')
    .select('id')
    .eq('code_system', 'pbs')
    .eq('library_version', 'v2025Q4')
    .eq('embedding_model', CONFIG.openai.model)
    .single();

  if (existingBatch) {
    batchRecord = existingBatch;
    console.log(`📊 Using existing embedding batch: ${batchRecord.id}`);
  } else {
    const { data: newBatch, error: batchError } = await supabase
      .from('embedding_batches')
      .insert({
        embedding_model: CONFIG.openai.model,
        embedding_dimensions: CONFIG.openai.dimensions,
        api_version: '2024-02-01',
        code_system: 'pbs',
        library_version: 'v2025Q4',
        total_codes: 14382,
      })
      .select('id')
      .single();

    if (batchError) {
      console.error('❌ Failed to create embedding batch record:', batchError.message);
      return;
    }
    
    batchRecord = newBatch;
    console.log(`📊 Created new embedding batch: ${batchRecord.id}`);
  }

  // 2. Load PBS codes
  const pbsPath = '/Users/xflanagan/Documents/GitHub/Guardian-Cursor/data/medical-codes/pbs/processed/pbs_codes.json';
  const codes: PBSCode[] = await fs.readJson(pbsPath);
  console.log(`📂 Loaded ${codes.length} PBS codes`);

  // 3. Process in chunks (embedding + database insertion)
  const chunkSize = 100; // Embed 100 at a time
  let totalProcessed = 0;
  let totalInserted = 0;

  for (let i = 0; i < codes.length; i += chunkSize) {
    const chunk = codes.slice(i, i + chunkSize);
    const progress = ((i / codes.length) * 100).toFixed(1);

    try {
      // Generate embeddings for this chunk
      console.log(`⚡ Processing batch ${Math.floor(i/chunkSize) + 1}: ${progress}% (${i}/${codes.length})`);
      const embeddedCodes = await generateEmbeddingBatch(chunk);

      // Convert to database format
      const dbRecords = embeddedCodes.map(code => ({
        ...toDBFormat(code),
        embedding_batch_id: batchRecord.id, // Link to batch
      }));

      // Insert to database
      const result = await insertBatch(dbRecords);
      totalInserted += result.success;
      totalProcessed += embeddedCodes.length;

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, CONFIG.batch.delayMs));

    } catch (error: any) {
      console.error(`❌ Error processing chunk ${i}-${i+chunkSize}: ${error.message}`);
    }
  }

  console.log(`✅ Complete! Processed ${totalProcessed} codes, inserted ${totalInserted} to database`);
}

// Validate environment
if (!process.env.OPENAI_API_KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});