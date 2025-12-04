/**
 * Debug Vector Search Core Issue
 * 
 * Focused test to understand why vector search returns wrong results
 * even when correct medications exist in the database
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

async function debugVectorSearchIssue() {
  console.log('🔍 Debug Vector Search Core Issue');
  console.log('=' + '='.repeat(70));

  // Test case: Metformin should match metformin entries
  const testQuery = 'Metformin 500mg';
  console.log(`\nTesting: "${testQuery}"`);

  // Step 1: Generate embedding for our test query
  console.log('\n📊 Step 1: Generate Query Embedding');
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: testQuery,
    dimensions: 1536,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;
  console.log(`   ✅ Generated embedding (${queryEmbedding.length} dimensions)`);

  // Step 2: Test the RPC function that's returning wrong results
  console.log('\n📊 Step 2: Test RPC Function (Current Behavior)');
  const { data: rpcResults, error: rpcError } = await supabase
    .rpc('search_regional_codes', {
      query_embedding: queryEmbedding,
      entity_type_filter: null,
      country_code_filter: 'AUS',
      max_results: 10,
      min_similarity: 0.0
    });

  if (rpcError) {
    console.log(`   ❌ RPC Error: ${rpcError.message}`);
  } else {
    console.log(`   📋 RPC Results (${rpcResults?.length || 0} found):`);
    rpcResults?.slice(0, 5).forEach((r: any, i: number) => {
      const hasMetformin = r.display_name.toLowerCase().includes('metformin');
      console.log(`      ${i+1}. ${hasMetformin ? '✅' : '❌'} ${r.display_name}`);
      console.log(`         Similarity: ${(r.similarity_score * 100).toFixed(1)}%`);
      console.log(`         Code: ${r.code_value} [${r.code_system}]`);
    });
  }

  // Step 3: Test direct SQL with same embedding to isolate the issue
  console.log('\n📊 Step 3: Test Direct SQL Vector Search');
  
  try {
    // Get actual metformin entries and calculate similarity manually
    const { data: metforminEntries } = await supabase
      .from('regional_medical_codes')
      .select('id, code_value, display_name, embedding')
      .ilike('display_name', 'metformin%')
      .not('display_name', 'ilike', '%+%') // Exclude combinations
      .eq('code_system', 'pbs')
      .limit(5);

    if (metforminEntries && metforminEntries.length > 0) {
      console.log(`   📋 Found ${metforminEntries.length} pure metformin entries in database`);
      
      // Manual similarity calculation for first metformin entry
      const firstMetformin = metforminEntries[0];
      console.log(`   🧪 Testing manual similarity for: "${firstMetformin.display_name}"`);
      
      if (firstMetformin.embedding) {
        // Parse the stored embedding
        let storedEmbedding: number[];
        if (typeof firstMetformin.embedding === 'string') {
          storedEmbedding = firstMetformin.embedding
            .replace(/[\[\]]/g, '')
            .split(',')
            .map(v => parseFloat(v.trim()));
        } else {
          storedEmbedding = firstMetformin.embedding;
        }

        // Calculate cosine similarity manually
        const dotProduct = queryEmbedding.reduce((sum, val, i) => 
          sum + val * storedEmbedding[i], 0
        );
        const magnitude1 = Math.sqrt(queryEmbedding.reduce((sum, val) => sum + val * val, 0));
        const magnitude2 = Math.sqrt(storedEmbedding.reduce((sum, val) => sum + val * val, 0));
        const cosineSimilarity = dotProduct / (magnitude1 * magnitude2);
        
        console.log(`   📊 Manual similarity calculation:`);
        console.log(`      Cosine similarity: ${(cosineSimilarity * 100).toFixed(1)}%`);
        console.log(`      pgvector similarity (1 - distance): ${((1 - (1 - cosineSimilarity)) * 100).toFixed(1)}%`);
        
        // Now test if we can find this entry using direct SQL with pgvector operator
        const directSQLQuery = `
          SELECT 
            display_name,
            (1 - (embedding <=> $1::vector))::real as similarity_score
          FROM regional_medical_codes 
          WHERE id = $2
        `;
        
        console.log(`   🔍 Testing direct pgvector operator...`);
        const { data: directResult } = await supabase.rpc('exec_sql_with_params', {
          sql: directSQLQuery,
          params: [JSON.stringify(queryEmbedding), firstMetformin.id]
        }).catch(() => ({ data: null }));
        
        if (directResult && directResult.length > 0) {
          console.log(`   ✅ Direct pgvector result: ${(directResult[0].similarity_score * 100).toFixed(1)}%`);
        } else {
          console.log(`   ⚠️ Could not test direct pgvector operator`);
        }
      }
    }
  } catch (error: any) {
    console.log(`   ❌ Direct SQL test failed: ${error.message}`);
  }

  // Step 4: Test if the issue is with the RPC function logic
  console.log('\n📊 Step 4: Analyze RPC Function Logic');
  
  // Test with a specific similarity threshold
  const { data: highThresholdResults } = await supabase
    .rpc('search_regional_codes', {
      query_embedding: queryEmbedding,
      entity_type_filter: 'medication',
      country_code_filter: 'AUS',
      max_results: 20,
      min_similarity: 0.8  // Very high threshold
    });

  console.log(`   📋 High similarity threshold (80%): ${highThresholdResults?.length || 0} results`);
  
  if (highThresholdResults && highThresholdResults.length > 0) {
    highThresholdResults.slice(0, 3).forEach((r: any, i: number) => {
      console.log(`      ${i+1}. ${r.display_name} (${(r.similarity_score * 100).toFixed(1)}%)`);
    });
  } else {
    console.log(`      No results above 80% similarity`);
  }

  // Test with lower threshold to see what we get
  const { data: lowThresholdResults } = await supabase
    .rpc('search_regional_codes', {
      query_embedding: queryEmbedding,
      entity_type_filter: 'medication',
      country_code_filter: 'AUS',
      max_results: 100,
      min_similarity: 0.0
    });

  console.log(`   📋 Low similarity threshold (0%): ${lowThresholdResults?.length || 0} results`);
  
  if (lowThresholdResults && lowThresholdResults.length > 0) {
    // Find any metformin entries in the results
    const metforminResults = lowThresholdResults.filter((r: any) => 
      r.display_name.toLowerCase().includes('metformin')
    );
    
    if (metforminResults.length > 0) {
      console.log(`   ✅ Found ${metforminResults.length} metformin entries in results:`);
      metforminResults.slice(0, 3).forEach((r: any, i: number) => {
        const rank = lowThresholdResults.indexOf(r) + 1;
        console.log(`      Rank ${rank}: ${r.display_name} (${(r.similarity_score * 100).toFixed(1)}%)`);
      });
    } else {
      console.log(`   ❌ No metformin entries found in ANY vector search results`);
      console.log(`   🚨 This indicates the vector search is fundamentally broken!`);
    }
  }

  // Step 5: Check if there's an issue with the embedding storage
  console.log('\n📊 Step 5: Validate Embedding Storage Integrity');
  
  const { data: embeddingCheck } = await supabase
    .from('regional_medical_codes')
    .select('display_name, embedding')
    .ilike('display_name', 'metformin%')
    .not('display_name', 'ilike', '%+%')
    .limit(1)
    .single();

  if (embeddingCheck && embeddingCheck.embedding) {
    let storedEmbedding: number[];
    if (typeof embeddingCheck.embedding === 'string') {
      storedEmbedding = embeddingCheck.embedding
        .replace(/[\[\]]/g, '')
        .split(',')
        .map(v => parseFloat(v.trim()));
    } else {
      storedEmbedding = embeddingCheck.embedding;
    }

    console.log(`   📊 Embedding validation for: "${embeddingCheck.display_name}"`);
    console.log(`      Dimensions: ${storedEmbedding.length}`);
    console.log(`      First values: [${storedEmbedding.slice(0, 5).map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`      Range: ${Math.min(...storedEmbedding).toFixed(3)} to ${Math.max(...storedEmbedding).toFixed(3)}`);
    
    const hasNaN = storedEmbedding.some(v => isNaN(v));
    const hasInfinity = storedEmbedding.some(v => !isFinite(v));
    
    if (hasNaN || hasInfinity) {
      console.log(`   🚨 CRITICAL: Stored embedding contains invalid values!`);
      console.log(`      NaN values: ${hasNaN}`);
      console.log(`      Infinite values: ${hasInfinity}`);
    } else {
      console.log(`   ✅ Stored embedding appears valid`);
    }
  }

  // Step 6: Final diagnosis
  console.log('\n📋 DIAGNOSIS');
  console.log('-'.repeat(50));
  
  if (rpcResults && rpcResults.length > 0 && !rpcResults[0].display_name.toLowerCase().includes('metformin')) {
    console.log('🚨 CONFIRMED: Vector search returns incorrect medications');
    console.log('   Possible causes:');
    console.log('   1. Index corruption or wrong index type');
    console.log('   2. Embedding normalization mismatch');
    console.log('   3. RPC function logic error');
    console.log('   4. pgvector operator configuration issue');
    console.log('');
    console.log('💡 RECOMMENDED ACTIONS:');
    console.log('   1. Rebuild the vector index');
    console.log('   2. Verify embedding generation consistency');
    console.log('   3. Test with normalized embeddings');
    console.log('   4. Check pgvector extension configuration');
  } else {
    console.log('✅ Vector search appears to be working correctly');
  }
}

// Validate environment
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.OPENAI_API_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

debugVectorSearchIssue().catch(error => {
  console.error('❌ Debug failed:', error);
  process.exit(1);
});