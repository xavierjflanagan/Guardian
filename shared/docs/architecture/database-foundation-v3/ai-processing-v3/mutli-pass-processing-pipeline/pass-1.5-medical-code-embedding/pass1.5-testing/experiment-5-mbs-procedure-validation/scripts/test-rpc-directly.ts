#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.production') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function generateOpenAIEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  const data = await response.json();
  return data.data[0].embedding;
}

async function main() {
  console.log('Testing RPC function directly with "Chest X-ray"...\n');

  // Generate embedding
  const embedding = await generateOpenAIEmbedding('Chest X-ray');
  console.log(`Generated embedding with ${embedding.length} dimensions\n`);

  // Test 1: With all filters
  console.log('TEST 1: With entity_type and country_code filters');
  const { data: data1, error: error1 } = await supabase.rpc('search_regional_codes', {
    query_embedding: `[${embedding.join(',')}]`,
    entity_type_filter: 'procedure',
    country_code_filter: 'AUS',
    min_similarity: 0.0,
    max_results: 5
  });

  if (error1) {
    console.error('Error:', error1);
  } else {
    console.log(`Results: ${data1?.length || 0}`);
    if (data1 && data1.length > 0) {
      console.log('Top result:', data1[0].code_value, '-', data1[0].display_name.substring(0, 80));
      console.log('Similarity:', data1[0].similarity_score);
    }
  }

  console.log('\n---\n');

  // Test 2: Without entity_type filter
  console.log('TEST 2: Without entity_type filter');
  const { data: data2, error: error2 } = await supabase.rpc('search_regional_codes', {
    query_embedding: `[${embedding.join(',')}]`,
    entity_type_filter: null,
    country_code_filter: 'AUS',
    min_similarity: 0.0,
    max_results: 5
  });

  if (error2) {
    console.error('Error:', error2);
  } else {
    console.log(`Results: ${data2?.length || 0}`);
    if (data2 && data2.length > 0) {
      console.log('Top result:', data2[0].code_value, '-', data2[0].display_name.substring(0, 80));
      console.log('Similarity:', data2[0].similarity_score);
    }
  }

  console.log('\n---\n');

  // Test 3: With higher min_similarity
  console.log('TEST 3: With min_similarity = 0.3 (default)');
  const { data: data3, error: error3 } = await supabase.rpc('search_regional_codes', {
    query_embedding: `[${embedding.join(',')}]`,
    entity_type_filter: 'procedure',
    country_code_filter: 'AUS',
    min_similarity: 0.3,
    max_results: 5
  });

  if (error3) {
    console.error('Error:', error3);
  } else {
    console.log(`Results: ${data3?.length || 0}`);
    if (data3 && data3.length > 0) {
      console.log('Top result:', data3[0].code_value, '-', data3[0].display_name.substring(0, 80));
      console.log('Similarity:', data3[0].similarity_score);
    }
  }
}

main().catch(console.error);
