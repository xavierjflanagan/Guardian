/**
 * Debug Pass 1.5 Pipeline - Step-by-step diagnostic
 * 
 * Traces each step of Pass 1.5 processing to identify failure points
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

interface Pass1Entity {
  id: string;
  entity_subtype: string;
  original_text: string;
  ai_visual_interpretation: string;
}

async function debugPass15Pipeline() {
  console.log('🔍 Pass 1.5 Pipeline Debug - Step-by-Step Analysis');
  console.log('=' + '='.repeat(79));
  
  // Step 1: Get the 5 medical entities from Pass 1
  console.log('\n📋 STEP 1: Retrieving Pass 1 Medical Entities');
  console.log('-'.repeat(80));
  
  const shellFileId = '22d23e0e-88a0-4620-8ac3-3259c7009f5b';
  
  const { data: allEntities, error: entitiesError } = await supabase
    .from('entity_processing_audit')
    .select('id, entity_subtype, original_text, ai_visual_interpretation')
    .eq('shell_file_id', shellFileId)
    .in('entity_subtype', ['medication', 'procedure', 'diagnosis', 'immunization']);

  if (entitiesError) {
    console.error('❌ Error fetching entities:', entitiesError);
    return;
  }

  const medicalEntities = allEntities?.filter(e => 
    ['medication', 'procedure', 'diagnosis'].includes(e.entity_subtype)
  ).slice(0, 5) || [];

  console.log(`✅ Found ${medicalEntities.length} medical entities to process:`);
  medicalEntities.forEach((entity, index) => {
    console.log(`   ${index + 1}. [${entity.entity_subtype}] "${entity.original_text}"`);
    if (entity.ai_visual_interpretation && entity.ai_visual_interpretation !== entity.original_text) {
      console.log(`      AI interpretation: "${entity.ai_visual_interpretation}"`);
    }
  });

  // Process each entity through the full pipeline
  for (let i = 0; i < medicalEntities.length; i++) {
    const entity = medicalEntities[i];
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🧪 ENTITY ${i + 1}/${medicalEntities.length}: Processing "${entity.original_text}"`);
    console.log(`${'='.repeat(80)}`);
    
    await debugSingleEntity(entity);
  }
}

async function debugSingleEntity(entity: Pass1Entity) {
  
  // Step 2: Smart Entity-Type Strategy
  console.log('\n📝 STEP 2: Smart Entity-Type Strategy (Embedding Text Selection)');
  console.log('-'.repeat(80));
  
  let embeddingText = entity.original_text;
  
  // Apply entity-type strategy logic
  if (entity.entity_subtype === 'medication') {
    // For medications, prefer AI interpretation if it's longer/more detailed
    if (entity.ai_visual_interpretation && 
        entity.ai_visual_interpretation.length > entity.original_text.length) {
      embeddingText = entity.ai_visual_interpretation;
      console.log(`✅ Using AI interpretation (longer/more detailed)`);
    } else {
      console.log(`✅ Using original text (sufficient detail)`);
    }
  } else if (entity.entity_subtype === 'procedure') {
    // For procedures, prefer AI interpretation if it expands abbreviations
    if (entity.ai_visual_interpretation && 
        entity.ai_visual_interpretation.length > entity.original_text.length) {
      embeddingText = entity.ai_visual_interpretation;
      console.log(`✅ Using AI interpretation (expanded/clarified)`);
    } else {
      console.log(`✅ Using original text (clear enough)`);
    }
  } else {
    // For diagnoses, use original text
    console.log(`✅ Using original text (standard for ${entity.entity_subtype})`);
  }
  
  console.log(`   Original: "${entity.original_text}"`);
  console.log(`   AI interpretation: "${entity.ai_visual_interpretation || 'none'}"`);
  console.log(`   Selected for embedding: "${embeddingText}"`);

  // Step 3: Embedding Generation
  console.log('\n🔗 STEP 3: Embedding Generation');
  console.log('-'.repeat(80));
  
  try {
    console.log(`   Generating embedding for: "${embeddingText}"`);
    console.log(`   Model: text-embedding-3-small, Dimensions: 1536`);
    
    const startTime = Date.now();
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: embeddingText,
      dimensions: 1536,
    });
    const embeddingTime = Date.now() - startTime;
    
    const embedding = embeddingResponse.data[0].embedding;
    
    console.log(`   ✅ Embedding generated successfully in ${embeddingTime}ms`);
    console.log(`   📊 Embedding stats:`);
    console.log(`      - Length: ${embedding.length} dimensions`);
    console.log(`      - Sample values: [${embedding.slice(0, 5).map(v => v.toFixed(3)).join(', ')}...]`);
    console.log(`      - Range: ${Math.min(...embedding).toFixed(3)} to ${Math.max(...embedding).toFixed(3)}`);

    // Step 4: Vector Search
    console.log('\n🔍 STEP 4: Vector Search');
    console.log('-'.repeat(80));
    
    // Test different search configurations
    const searchConfigs = [
      {
        name: 'No filters (current approach)',
        entity_type_filter: null,
        country_code_filter: 'AUS',
        min_similarity: 0.0
      },
      {
        name: 'With entity type filter',
        entity_type_filter: entity.entity_subtype,
        country_code_filter: 'AUS',
        min_similarity: 0.0
      },
      {
        name: 'Higher similarity threshold',
        entity_type_filter: null,
        country_code_filter: 'AUS',
        min_similarity: 0.3
      }
    ];

    for (const config of searchConfigs) {
      console.log(`\n   🧪 Testing: ${config.name}`);
      console.log(`      Entity filter: ${config.entity_type_filter || 'none'}`);
      console.log(`      Country: ${config.country_code_filter}`);
      console.log(`      Min similarity: ${config.min_similarity}`);
      
      try {
        const searchStart = Date.now();
        const { data: results, error: searchError } = await supabase
          .rpc('search_regional_codes', {
            query_embedding: embedding,
            entity_type_filter: config.entity_type_filter,
            country_code_filter: config.country_code_filter,
            max_results: 10,
            min_similarity: config.min_similarity
          });
        const searchTime = Date.now() - searchStart;

        if (searchError) {
          console.log(`      ❌ Search error: ${searchError.message}`);
          continue;
        }

        console.log(`      ✅ Search completed in ${searchTime}ms`);
        console.log(`      📊 Found ${results?.length || 0} candidates`);

        if (results && results.length > 0) {
          console.log(`      🏆 Top 3 results:`);
          results.slice(0, 3).forEach((result, index) => {
            const similarity = (result.similarity_score * 100).toFixed(1);
            console.log(`         ${index + 1}. [${result.code_system.toUpperCase()}] ${result.display_name} (${similarity}%)`);
            console.log(`            Code: ${result.code_value}`);
          });

          // Analysis of results
          const avgSimilarity = results.reduce((sum, r) => sum + r.similarity_score, 0) / results.length;
          const codeSystems = results.reduce((acc, r) => {
            acc[r.code_system] = (acc[r.code_system] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          console.log(`      📈 Analysis:`);
          console.log(`         Average similarity: ${(avgSimilarity * 100).toFixed(1)}%`);
          console.log(`         Code systems: ${Object.entries(codeSystems).map(([sys, count]) => `${sys}:${count}`).join(', ')}`);
          
          // Check for obvious matches
          const textLower = embeddingText.toLowerCase();
          const obviousMatches = results.filter(r => {
            const displayLower = r.display_name.toLowerCase();
            return displayLower.includes(textLower.split(' ')[0]) || 
                   textLower.includes(displayLower.split(' ')[0]);
          });
          
          if (obviousMatches.length > 0) {
            console.log(`      ✅ Found ${obviousMatches.length} obvious text matches!`);
          } else {
            console.log(`      ⚠️  No obvious text matches found`);
          }
        }
        
      } catch (error: any) {
        console.log(`      ❌ Search failed: ${error.message}`);
      }
    }

    // Step 5: Manual Database Check
    console.log('\n🔍 STEP 5: Manual Database Verification');
    console.log('-'.repeat(80));
    
    // Extract key terms for manual search
    const searchTerms = embeddingText.toLowerCase().split(/\s+/).filter(term => 
      term.length > 2 && !['mg', 'tablet', 'daily', 'once', 'twice'].includes(term)
    );
    
    console.log(`   🔍 Searching database for key terms: [${searchTerms.join(', ')}]`);
    
    for (const term of searchTerms.slice(0, 2)) { // Check first 2 key terms
      const { data: manualResults } = await supabase
        .from('regional_medical_codes')
        .select('code_system, code_value, display_name')
        .ilike('display_name', `%${term}%`)
        .limit(5);
        
      if (manualResults && manualResults.length > 0) {
        console.log(`   ✅ Found ${manualResults.length} database matches for "${term}":`);
        manualResults.forEach((result, index) => {
          console.log(`      ${index + 1}. [${result.code_system.toUpperCase()}] ${result.display_name}`);
        });
      } else {
        console.log(`   ❌ No database matches found for "${term}"`);
      }
    }

    // Step 6: Candidate Selection Analysis
    console.log('\n🎯 STEP 6: Candidate Selection Analysis');
    console.log('-'.repeat(80));
    
    // Get the best results from the no-filter search
    const { data: bestResults } = await supabase
      .rpc('search_regional_codes', {
        query_embedding: embedding,
        entity_type_filter: null,
        country_code_filter: 'AUS',
        max_results: 20,
        min_similarity: 0.0
      });

    if (bestResults && bestResults.length > 0) {
      // Apply candidate selection logic
      const highConfidenceCandidates = bestResults.filter(r => r.similarity_score > 0.7);
      const mediumConfidenceCandidates = bestResults.filter(r => r.similarity_score > 0.5 && r.similarity_score <= 0.7);
      const lowConfidenceCandidates = bestResults.filter(r => r.similarity_score <= 0.5);
      
      console.log(`   📊 Candidate distribution:`);
      console.log(`      High confidence (>70%): ${highConfidenceCandidates.length}`);
      console.log(`      Medium confidence (50-70%): ${mediumConfidenceCandidates.length}`);
      console.log(`      Low confidence (<50%): ${lowConfidenceCandidates.length}`);
      
      // Final selection (top 10 with minimum 0.3 similarity)
      const finalCandidates = bestResults.filter(r => r.similarity_score > 0.3).slice(0, 10);
      
      console.log(`   🎯 Final selection: ${finalCandidates.length} candidates above 30% similarity`);
      
      if (finalCandidates.length > 0) {
        console.log(`   🏆 Final candidates:`);
        finalCandidates.forEach((candidate, index) => {
          const similarity = (candidate.similarity_score * 100).toFixed(1);
          console.log(`      ${index + 1}. [${candidate.code_system.toUpperCase()}] ${candidate.display_name} (${similarity}%)`);
        });
      }
      
      // Step 7: Quality Assessment
      console.log('\n📋 STEP 7: Quality Assessment');
      console.log('-'.repeat(80));
      
      const topCandidate = bestResults[0];
      const avgTopFive = bestResults.slice(0, 5).reduce((sum, r) => sum + r.similarity_score, 0) / 5;
      
      console.log(`   🎯 Quality metrics:`);
      console.log(`      Top candidate similarity: ${(topCandidate.similarity_score * 100).toFixed(1)}%`);
      console.log(`      Average top 5 similarity: ${(avgTopFive * 100).toFixed(1)}%`);
      console.log(`      Total candidates found: ${bestResults.length}`);
      
      // Expected vs actual assessment
      const entityType = entity.entity_subtype;
      const expectedCodeSystem = entityType === 'medication' ? 'PBS' : 
                                entityType === 'procedure' ? 'MBS' : 'ANY';
      
      const topSystemMatch = bestResults.find(r => 
        expectedCodeSystem === 'ANY' || r.code_system.toLowerCase() === expectedCodeSystem.toLowerCase()
      );
      
      if (topSystemMatch) {
        const rank = bestResults.indexOf(topSystemMatch) + 1;
        console.log(`   ✅ Expected code system (${expectedCodeSystem}) found at rank ${rank} with ${(topSystemMatch.similarity_score * 100).toFixed(1)}% similarity`);
      } else {
        console.log(`   ⚠️  Expected code system (${expectedCodeSystem}) not found in top results`);
      }
      
      // Overall assessment
      const qualityScore = topCandidate.similarity_score;
      let assessment = '';
      if (qualityScore > 0.7) assessment = '✅ EXCELLENT';
      else if (qualityScore > 0.5) assessment = '⚠️  GOOD';
      else if (qualityScore > 0.3) assessment = '⚠️  FAIR';
      else assessment = '❌ POOR';
      
      console.log(`   ${assessment} - Overall quality for "${embeddingText}"`);
      
    } else {
      console.log(`   ❌ No candidates found for quality assessment`);
    }

  } catch (error: any) {
    console.error(`❌ Pipeline failed at embedding generation: ${error.message}`);
  }
}

// Validate environment
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.OPENAI_API_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

debugPass15Pipeline().catch(error => {
  console.error('❌ Debug failed:', error);
  process.exit(1);
});