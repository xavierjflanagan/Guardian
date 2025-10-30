/**
 * Experiment 6: Test Hybrid Search Function Directly
 *
 * Purpose: Call search_procedures_hybrid() RPC for each entity and collect top-20 results
 *
 * Usage:
 *   npx tsx test-hybrid-search-direct.ts
 *
 * Output:
 *   ../results/hybrid-search-raw-results.json
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Environment setup
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: Missing required environment variables:');
  console.error('   SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Types
interface SearchVariant {
  id: number;
  entity_text: string;
  search_variants: string[];
}

interface HybridSearchResult {
  code_value: string;
  display_name: string;
  lexical_score: number;
  semantic_score: number;
  combined_score: number;
  match_source: string;
  code_system: string;
  search_text: string;
}

interface EntityTestResult {
  entity_id: number;
  entity_text: string;
  search_variants: string[];
  result_count: number;
  top_20_results: HybridSearchResult[];
  top_1_code: string | null;
  top_1_score: number | null;
  execution_time_ms: number;
  error: string | null;
}

async function main() {
  console.log('Experiment 6: Hybrid Search Function Validation');
  console.log('Date:', new Date().toISOString());
  console.log('');

  // Load search variants
  const variantsPath = path.join(__dirname, '../variant-data/search-variants.json');
  const variantsData = JSON.parse(fs.readFileSync(variantsPath, 'utf-8'));
  const entities: SearchVariant[] = variantsData.entities;

  console.log(`Loaded ${entities.length} test entities`);
  console.log('');

  const results: EntityTestResult[] = [];

  // Test each entity
  for (const entity of entities) {
    console.log(`Testing #${entity.id}: "${entity.entity_text}"`);
    console.log(`  Variants: [${entity.search_variants.join(', ')}]`);

    const startTime = Date.now();
    let testResult: EntityTestResult;

    try {
      const { data, error } = await supabase.rpc('search_procedures_hybrid', {
        p_entity_text: entity.entity_text,
        p_search_variants: entity.search_variants,
        p_country_code: 'AUS',
        p_limit: 20
      });

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      if (error) {
        console.error(`  ERROR: ${error.message}`);
        testResult = {
          entity_id: entity.id,
          entity_text: entity.entity_text,
          search_variants: entity.search_variants,
          result_count: 0,
          top_20_results: [],
          top_1_code: null,
          top_1_score: null,
          execution_time_ms: executionTime,
          error: error.message
        };
      } else {
        const resultCount = data?.length || 0;
        const top1Code = data?.[0]?.code_value || null;
        const top1Score = data?.[0]?.combined_score || null;

        console.log(`  Results: ${resultCount} codes found`);
        if (resultCount > 0) {
          console.log(`     Top-1: ${top1Code} (score: ${top1Score?.toFixed(3)})`);
        }
        console.log(`     Execution time: ${executionTime}ms`);

        testResult = {
          entity_id: entity.id,
          entity_text: entity.entity_text,
          search_variants: entity.search_variants,
          result_count: resultCount,
          top_20_results: data || [],
          top_1_code: top1Code,
          top_1_score: top1Score,
          execution_time_ms: executionTime,
          error: null
        };
      }
    } catch (err: any) {
      const endTime = Date.now();
      console.error(`  EXCEPTION: ${err.message}`);
      testResult = {
        entity_id: entity.id,
        entity_text: entity.entity_text,
        search_variants: entity.search_variants,
        result_count: 0,
        top_20_results: [],
        top_1_code: null,
        top_1_score: null,
        execution_time_ms: endTime - startTime,
        error: err.message
      };
    }

    results.push(testResult);
    console.log('');
  }

  // Summary statistics
  const successCount = results.filter(r => r.result_count > 0).length;
  const zeroResultsCount = results.filter(r => r.result_count === 0).length;
  const errorCount = results.filter(r => r.error !== null).length;
  const avgExecutionTime = results.reduce((sum, r) => sum + r.execution_time_ms, 0) / results.length;

  console.log('Test Summary:');
  console.log(`   Total entities tested: ${results.length}`);
  console.log(`   Results returned: ${successCount}/${results.length} (${(successCount / results.length * 100).toFixed(1)}%)`);
  console.log(`   Zero results: ${zeroResultsCount}/${results.length} (${(zeroResultsCount / results.length * 100).toFixed(1)}%)`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Avg execution time: ${avgExecutionTime.toFixed(0)}ms`);
  console.log('');

  // Save results
  const outputPath = path.join(__dirname, '../results/hybrid-search-raw-results.json');
  const outputData = {
    metadata: {
      experiment: 'Experiment 6: Hybrid Search Function Validation',
      date: new Date().toISOString(),
      total_entities: results.length,
      success_count: successCount,
      zero_results_count: zeroResultsCount,
      error_count: errorCount,
      avg_execution_time_ms: avgExecutionTime
    },
    results: results
  };

  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  console.log(`Results saved to: ${outputPath}`);
  console.log('');

  // Special test groups
  const chestXrayGroup = results.filter(r => r.entity_id >= 15 && r.entity_id <= 19);
  const chestXraySuccess = chestXrayGroup.filter(r => r.result_count > 0).length;

  console.log('Chest X-ray Formatting Test (IDs 15-19):');
  console.log(`   Success: ${chestXraySuccess}/5`);
  chestXrayGroup.forEach(r => {
    console.log(`   - "${r.entity_text}": ${r.result_count > 0 ? 'PASS' : 'FAIL'} ${r.result_count} results`);
  });
  console.log('');

  console.log('Test complete!');
  console.log('Next step: Run compare-to-baseline.ts');
}

main().catch(console.error);
