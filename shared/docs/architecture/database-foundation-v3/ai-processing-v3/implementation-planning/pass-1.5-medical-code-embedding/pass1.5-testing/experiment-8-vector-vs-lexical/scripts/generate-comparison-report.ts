/**
 * Comparison Report Generation Script
 *
 * Purpose: Compare vector vs lexical search results side-by-side
 * Analyzes overlap, unique codes, and prepares for manual review
 */

import * as fs from 'fs-extra';
import * as path from 'path';

interface SearchResult {
  entity_id: number;
  entity_text: string;
  variant_type: string;
  query: string;
  expected_entity_type: string;
  method: 'vector' | 'lexical';
  timestamp: string;
  results: Array<{
    rank: number;
    code_value: string;
    display_name: string;
    entity_type: string;
    code_system: string;
    similarity_score?: number;
    relevance_score?: number;
  }>;
}

interface ComparisonResult {
  entity_id: number;
  entity_text: string;
  variant_type: string;
  query: string;
  expected_entity_type: string;
  vector_results: SearchResult['results'];
  lexical_results: SearchResult['results'];
  analysis: {
    vector_codes: string[];
    lexical_codes: string[];
    overlap_codes: string[];
    vector_only_codes: string[];
    lexical_only_codes: string[];
    overlap_count: number;
    overlap_percentage: number;
    vector_avg_similarity: number;
    lexical_avg_relevance: number;
    lexical_avg_similarity: number;  // ENHANCED: Vector similarity of lexically-matched codes
    vector_entity_type_match: number;
    lexical_entity_type_match: number;
  };
}

async function main() {
  console.log('Experiment 8: Comparison Report Generation');
  console.log('==========================================\n');

  // Load all vector results
  const vectorResultsPath = path.join(__dirname, '../results/vector-all-results.json');
  if (!fs.existsSync(vectorResultsPath)) {
    console.error('[ERROR] Vector results not found. Run vector search script first.');
    process.exit(1);
  }

  const vectorResults: SearchResult[] = await fs.readJSON(vectorResultsPath);
  console.log(`[OK] Loaded ${vectorResults.length} vector search results`);

  // Load all lexical results
  const lexicalResultsPath = path.join(__dirname, '../results/lexical-all-results.json');
  if (!fs.existsSync(lexicalResultsPath)) {
    console.error('[ERROR] Lexical results not found. Run lexical search script first.');
    process.exit(1);
  }

  const lexicalResults: SearchResult[] = await fs.readJSON(lexicalResultsPath);
  console.log(`[OK] Loaded ${lexicalResults.length} lexical search results\n`);

  // Verify counts match
  if (vectorResults.length !== lexicalResults.length) {
    console.error(`[ERROR] Result counts don't match: vector=${vectorResults.length}, lexical=${lexicalResults.length}`);
    process.exit(1);
  }

  // Generate comparisons
  const comparisons: ComparisonResult[] = [];

  for (let i = 0; i < vectorResults.length; i++) {
    const vResult = vectorResults[i];
    const lResult = lexicalResults[i];

    // Verify they're for the same query
    if (vResult.entity_id !== lResult.entity_id || vResult.variant_type !== lResult.variant_type) {
      console.error(`[ERROR] Result mismatch at index ${i}`);
      console.error(`  Vector: entity=${vResult.entity_id}, variant=${vResult.variant_type}`);
      console.error(`  Lexical: entity=${lResult.entity_id}, variant=${lResult.variant_type}`);
      process.exit(1);
    }

    // Extract code lists
    const vectorCodes = vResult.results.map(r => r.code_value);
    const lexicalCodes = lResult.results.map(r => r.code_value);

    // Calculate overlap
    const overlapCodes = vectorCodes.filter(code => lexicalCodes.includes(code));
    const vectorOnlyCodes = vectorCodes.filter(code => !lexicalCodes.includes(code));
    const lexicalOnlyCodes = lexicalCodes.filter(code => !vectorCodes.includes(code));

    // Calculate averages
    const vectorAvgSimilarity = vResult.results.reduce((sum, r) => sum + (r.similarity_score || 0), 0) / (vResult.results.length || 1);
    const lexicalAvgRelevance = lResult.results.reduce((sum, r) => sum + (r.relevance_score || 0), 0) / (lResult.results.length || 1);
    const lexicalAvgSimilarity = lResult.results.reduce((sum, r) => sum + (r.similarity_score || 0), 0) / (lResult.results.length || 1);

    // Entity type matching
    const vectorEntityTypeMatch = vResult.results.filter(r => r.entity_type === vResult.expected_entity_type).length;
    const lexicalEntityTypeMatch = lResult.results.filter(r => r.entity_type === lResult.expected_entity_type).length;

    const comparison: ComparisonResult = {
      entity_id: vResult.entity_id,
      entity_text: vResult.entity_text,
      variant_type: vResult.variant_type,
      query: vResult.query,
      expected_entity_type: vResult.expected_entity_type,
      vector_results: vResult.results,
      lexical_results: lResult.results,
      analysis: {
        vector_codes: vectorCodes,
        lexical_codes: lexicalCodes,
        overlap_codes: overlapCodes,
        vector_only_codes: vectorOnlyCodes,
        lexical_only_codes: lexicalOnlyCodes,
        overlap_count: overlapCodes.length,
        overlap_percentage: (overlapCodes.length / 20) * 100,
        vector_avg_similarity: vectorAvgSimilarity,
        lexical_avg_relevance: lexicalAvgRelevance,
        lexical_avg_similarity: lexicalAvgSimilarity,
        vector_entity_type_match: vectorEntityTypeMatch,
        lexical_entity_type_match: lexicalEntityTypeMatch
      }
    };

    comparisons.push(comparison);

    console.log(`Entity ${comparison.entity_id} (${comparison.variant_type}): "${comparison.query}"`);
    console.log(`  Overlap: ${overlapCodes.length}/20 (${comparison.analysis.overlap_percentage.toFixed(1)}%)`);
    console.log(`  Vector only: ${vectorOnlyCodes.length}, Lexical only: ${lexicalOnlyCodes.length}`);
    console.log(`  Entity type match: Vector=${vectorEntityTypeMatch}/20, Lexical=${lexicalEntityTypeMatch}/20`);
    console.log(`  Avg similarity: Vector=${(vectorAvgSimilarity * 100).toFixed(1)}%, Lexical=${(lexicalAvgSimilarity * 100).toFixed(1)}%\n`);
  }

  // Save comparison report
  const comparisonPath = path.join(__dirname, '../analysis/comparison-report.json');
  await fs.ensureDir(path.dirname(comparisonPath));
  await fs.writeJSON(comparisonPath, comparisons, { spaces: 2 });
  console.log(`[OK] Saved comparison report: ${comparisonPath}\n`);

  // Generate aggregate statistics
  const stats = {
    total_queries: comparisons.length,
    average_overlap_percentage: comparisons.reduce((sum, c) => sum + c.analysis.overlap_percentage, 0) / comparisons.length,
    average_vector_entity_type_match: comparisons.reduce((sum, c) => sum + c.analysis.vector_entity_type_match, 0) / comparisons.length,
    average_lexical_entity_type_match: comparisons.reduce((sum, c) => sum + c.analysis.lexical_entity_type_match, 0) / comparisons.length,
    by_variant_type: {
      clinical: {
        count: comparisons.filter(c => c.variant_type === 'clinical').length,
        avg_overlap: comparisons.filter(c => c.variant_type === 'clinical').reduce((sum, c) => sum + c.analysis.overlap_percentage, 0) / comparisons.filter(c => c.variant_type === 'clinical').length
      },
      layperson: {
        count: comparisons.filter(c => c.variant_type === 'layperson').length,
        avg_overlap: comparisons.filter(c => c.variant_type === 'layperson').reduce((sum, c) => sum + c.analysis.overlap_percentage, 0) / comparisons.filter(c => c.variant_type === 'layperson').length
      },
      abbreviation: {
        count: comparisons.filter(c => c.variant_type === 'abbreviation').length,
        avg_overlap: comparisons.filter(c => c.variant_type === 'abbreviation').reduce((sum, c) => sum + c.analysis.overlap_percentage, 0) / comparisons.filter(c => c.variant_type === 'abbreviation').length
      }
    }
  };

  const statsPath = path.join(__dirname, '../analysis/summary-stats.json');
  await fs.writeJSON(statsPath, stats, { spaces: 2 });
  console.log(`[OK] Saved summary statistics: ${statsPath}\n`);

  // Print summary
  console.log('='.repeat(60));
  console.log('COMPARISON SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total queries analyzed:           ${stats.total_queries}`);
  console.log(`Average overlap:                  ${stats.average_overlap_percentage.toFixed(1)}%`);
  console.log(`Avg entity type match (vector):   ${stats.average_vector_entity_type_match.toFixed(1)}/20`);
  console.log(`Avg entity type match (lexical):  ${stats.average_lexical_entity_type_match.toFixed(1)}/20`);
  console.log('\nBy query type:');
  console.log(`  Clinical:      ${stats.by_variant_type.clinical.avg_overlap.toFixed(1)}% overlap`);
  console.log(`  Layperson:     ${stats.by_variant_type.layperson.avg_overlap.toFixed(1)}% overlap`);
  console.log(`  Abbreviation:  ${stats.by_variant_type.abbreviation.avg_overlap.toFixed(1)}% overlap`);
  console.log('='.repeat(60));

  console.log('\n✓ Comparison report complete');
  console.log('Next step: Manual review by user');
}

main().catch(console.error);
