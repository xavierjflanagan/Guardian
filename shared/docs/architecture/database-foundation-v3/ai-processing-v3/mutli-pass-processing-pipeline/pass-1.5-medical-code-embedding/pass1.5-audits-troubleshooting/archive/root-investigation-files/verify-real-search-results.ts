/**
 * Verify Real Search Results - Debug Pass 1.5 accuracy
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

dotenv.config({ path: path.join(__dirname, 'apps/web/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function verifySearchResults() {
  console.log('🔍 Verifying Real Search Results for Pass 1.5');
  console.log('=' + '='.repeat(60));
  
  const testEntities = [
    'Current Medication: Metformin 500mg twice daily',
    'Current Medication: Perindopril 4mg once daily',
    'Active Past History: T2DM',
    'Active Past History: Hypertension',
    'Past Surgeries: Cholecystectomy'
  ];

  for (const entity of testEntities) {
    console.log(`\n🧪 Testing: "${entity}"`);
    console.log('-'.repeat(80));
    
    try {
      // Generate embedding
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: entity,
        dimensions: 1536,
      });

      // Search for candidates
      const { data: results, error } = await supabase
        .rpc('search_regional_codes', {
          query_embedding: embeddingResponse.data[0].embedding,
          entity_type_filter: null,
          country_code_filter: 'AUS',
          max_results: 10,
          min_similarity: 0.0
        });

      if (error) {
        console.error('❌ Search error:', error);
        continue;
      }

      if (!results || results.length === 0) {
        console.log('❌ No results found');
        continue;
      }

      console.log(`✅ Found ${results.length} candidates:`);
      results.forEach((result, index) => {
        const similarity = (result.similarity_score * 100).toFixed(1);
        console.log(`   ${index + 1}. [${result.code_system.toUpperCase()}] ${result.display_name}`);
        console.log(`      Code: ${result.code_value}`);
        console.log(`      Similarity: ${similarity}%`);
        console.log('');
      });

    } catch (error: any) {
      console.error(`❌ Error processing "${entity}":`, error.message);
    }
  }
}

// Validate environment
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.OPENAI_API_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

verifySearchResults().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});