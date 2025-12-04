/**
 * Experiment 6: Compare Hybrid Search to Baseline
 *
 * Purpose: Compare hybrid search results against Experiment 5 pure vector baseline
 *
 * Usage:
 *   npx tsx compare-to-baseline.ts
 *
 * Requires:
 *   ../results/hybrid-search-raw-results.json (from test-hybrid-search-direct.ts)
 *   ../test-data/expected-codes.json (ground truth MBS codes)
 *   ../../experiment-5-mbs-procedure-validation/results/openai-baseline-results.json
 *
 * Output:
 *   ../results/accuracy-comparison.md
 */

import * as fs from 'fs';
import * as path from 'path';

interface HybridResult {
  entity_id: number;
  entity_text: string;
  result_count: number;
  top_20_results: Array<{ code_value: string; combined_score: number }>;
  top_1_code: string | null;
  top_1_score: number | null;
  execution_time_ms: number;
}

interface BaselineResult {
  entity_id: number;
  entity_text: string;
  result_count: number;
  top_1_code: string | null;
  top_1_similarity: number | null;
}

interface ExpectedCode {
  entity_id: number;
  entity_text: string;
  expected_codes: string[];
  notes: string;
}

interface ExpectedCodesData {
  metadata: {
    source: string;
    coverage: string;
    note: string;
  };
  expected_codes: ExpectedCode[];
}

function main() {
  console.log('Experiment 6: Comparing Hybrid Search vs Baseline');
  console.log('');

  // Check file existence
  const hybridPath = path.join(__dirname, '../results/hybrid-search-raw-results.json');
  const baselinePath = path.join(__dirname, '../../experiment-5-mbs-procedure-validation/results/openai-baseline-results.json');
  const expectedCodesPath = path.join(__dirname, '../test-data/expected-codes.json');

  if (!fs.existsSync(hybridPath)) {
    console.error('ERROR: Hybrid results file not found.');
    console.error(`Expected: ${hybridPath}`);
    console.error('Run test-hybrid-search-direct.ts first.');
    process.exit(1);
  }

  if (!fs.existsSync(baselinePath)) {
    console.error('ERROR: Baseline results file not found.');
    console.error(`Expected: ${baselinePath}`);
    console.error('Run Experiment 5 first or check file path.');
    process.exit(1);
  }

  if (!fs.existsSync(expectedCodesPath)) {
    console.error('ERROR: Expected codes file not found.');
    console.error(`Expected: ${expectedCodesPath}`);
    console.error('This file is required for ground-truth-based accuracy calculation.');
    process.exit(1);
  }

  // Load all data
  const hybridData = JSON.parse(fs.readFileSync(hybridPath, 'utf-8'));
  const hybridResults: HybridResult[] = hybridData.results;

  const baselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
  const baselineResults: BaselineResult[] = baselineData.results;

  const expectedCodesData: ExpectedCodesData = JSON.parse(fs.readFileSync(expectedCodesPath, 'utf-8'));

  console.log(`Loaded ${hybridResults.length} hybrid results`);
  console.log(`Loaded ${baselineResults.length} baseline results`);
  console.log(`Loaded ${expectedCodesData.expected_codes.length} expected code entries`);
  console.log('');

  // Create comparison table with ground-truth validation
  const comparison: any[] = [];
  let entitiesWithGroundTruth = 0;
  let hybridTop1Hits = 0;
  let hybridTop5Hits = 0;
  let hybridTop20Hits = 0;

  for (const hybrid of hybridResults) {
    const baseline = baselineResults.find(b => b.entity_id === hybrid.entity_id);
    const expected = expectedCodesData.expected_codes.find(e => e.entity_id === hybrid.entity_id);

    if (!baseline) {
      console.warn(`WARNING: No baseline result for entity ${hybrid.entity_id}`);
      continue;
    }

    // Check if we have ground truth for this entity
    const expectedCodes = expected?.expected_codes || [];
    const hasGroundTruth = expectedCodes.length > 0 && !expectedCodes.includes('TBD');

    // Extract top-20 codes from hybrid results
    const top20Codes = hybrid.top_20_results?.map(r => r.code_value) || [];
    const top5Codes = top20Codes.slice(0, 5);
    const top1Code = hybrid.top_1_code;

    // Calculate accuracy (only if we have ground truth)
    let foundInTop1 = false;
    let foundInTop5 = false;
    let foundInTop20 = false;

    if (hasGroundTruth) {
      entitiesWithGroundTruth++;
      foundInTop1 = top1Code !== null && expectedCodes.includes(top1Code);
      foundInTop5 = expectedCodes.some(code => top5Codes.includes(code));
      foundInTop20 = expectedCodes.some(code => top20Codes.includes(code));

      if (foundInTop1) hybridTop1Hits++;
      if (foundInTop5) hybridTop5Hits++;
      if (foundInTop20) hybridTop20Hits++;
    }

    comparison.push({
      entity_id: hybrid.entity_id,
      entity_text: hybrid.entity_text,
      expected_codes: expectedCodes,
      has_ground_truth: hasGroundTruth,
      baseline_results: baseline.result_count,
      hybrid_results: hybrid.result_count,
      baseline_top1: baseline.top_1_code,
      hybrid_top1: top1Code,
      found_in_top1: foundInTop1,
      found_in_top5: foundInTop5,
      found_in_top20: foundInTop20,
      improvement: hybrid.result_count > 0 && baseline.result_count === 0 ? 'FIXED' :
                   hybrid.result_count === 0 && baseline.result_count > 0 ? 'REGRESSED' :
                   hybrid.result_count > baseline.result_count ? 'BETTER' : 'SAME'
    });
  }

  // Calculate metrics
  const totalEntities = comparison.length;

  // Baseline metrics (result existence)
  const baselineReturned = comparison.filter(c => c.baseline_results > 0).length;
  const baselineZero = comparison.filter(c => c.baseline_results === 0).length;

  // Hybrid metrics (result existence)
  const hybridReturned = comparison.filter(c => c.hybrid_results > 0).length;
  const hybridZero = comparison.filter(c => c.hybrid_results === 0).length;

  // Improvement metrics (result existence)
  const fixed = comparison.filter(c => c.improvement === 'FIXED').length;
  const regressed = comparison.filter(c => c.improvement === 'REGRESSED').length;

  // Accuracy metrics (ground truth validation)
  const top1Accuracy = entitiesWithGroundTruth > 0 ? (hybridTop1Hits / entitiesWithGroundTruth * 100) : 0;
  const top5Accuracy = entitiesWithGroundTruth > 0 ? (hybridTop5Hits / entitiesWithGroundTruth * 100) : 0;
  const top20Accuracy = entitiesWithGroundTruth > 0 ? (hybridTop20Hits / entitiesWithGroundTruth * 100) : 0;

  // Generate markdown report
  let markdown = `# Experiment 6: Accuracy Comparison\n\n`;
  markdown += `**Date:** ${new Date().toISOString()}\n`;
  markdown += `**Comparison:** Hybrid Search vs Pure Vector Baseline (Experiment 5)\n\n`;
  markdown += `---\n\n`;

  markdown += `## Ground Truth Validation\n\n`;
  markdown += `**IMPORTANT:** Accuracy metrics below are calculated using ground truth MBS codes from manual investigation.\n\n`;
  markdown += `- **Total Test Entities:** ${totalEntities}\n`;
  markdown += `- **Entities with Ground Truth:** ${entitiesWithGroundTruth} (${(entitiesWithGroundTruth/totalEntities*100).toFixed(1)}%)\n`;
  markdown += `- **Entities Pending Investigation:** ${totalEntities - entitiesWithGroundTruth} (marked "TBD")\n\n`;
  markdown += `**Coverage:** ${expectedCodesData.metadata.coverage}\n\n`;
  markdown += `---\n\n`;

  markdown += `## Accuracy Metrics (Ground Truth Validated)\n\n`;
  markdown += `Based on ${entitiesWithGroundTruth} entities with verified expected MBS codes:\n\n`;
  markdown += `| Metric | Hybrid Search | Notes |\n`;
  markdown += `|--------|---------------|-------|\n`;
  markdown += `| **Top-20 Accuracy** | **${top20Accuracy.toFixed(1)}%** | ${hybridTop20Hits}/${entitiesWithGroundTruth} entities with correct code in top-20 |\n`;
  markdown += `| **Top-5 Accuracy** | **${top5Accuracy.toFixed(1)}%** | ${hybridTop5Hits}/${entitiesWithGroundTruth} entities with correct code in top-5 |\n`;
  markdown += `| **Top-1 Accuracy** | **${top1Accuracy.toFixed(1)}%** | ${hybridTop1Hits}/${entitiesWithGroundTruth} entities with correct code as #1 result |\n\n`;

  markdown += `---\n\n`;

  markdown += `## Result Existence Metrics (All Entities)\n\n`;
  markdown += `| Metric | Baseline (Exp 5) | Hybrid (Exp 6) | Change |\n`;
  markdown += `|--------|-----------------|----------------|--------|\n`;
  markdown += `| Total Entities | ${totalEntities} | ${totalEntities} | - |\n`;
  markdown += `| Results Returned | ${baselineReturned} (${(baselineReturned/totalEntities*100).toFixed(1)}%) | ${hybridReturned} (${(hybridReturned/totalEntities*100).toFixed(1)}%) | ${hybridReturned > baselineReturned ? '+' : ''}${hybridReturned - baselineReturned} |\n`;
  markdown += `| Zero Results | ${baselineZero} (${(baselineZero/totalEntities*100).toFixed(1)}%) | ${hybridZero} (${(hybridZero/totalEntities*100).toFixed(1)}%) | ${hybridZero < baselineZero ? '' : '+'}${hybridZero - baselineZero} |\n\n`;

  markdown += `### Key Improvements\n\n`;
  markdown += `- **Failures Fixed:** ${fixed} entities (baseline: 0 results to hybrid: results found)\n`;
  markdown += `- **Regressions:** ${regressed} entities (baseline: results found to hybrid: 0 results)\n`;
  markdown += `- **Net Improvement:** ${fixed - regressed} entities\n\n`;

  markdown += `---\n\n`;
  markdown += `## Critical Test Cases\n\n`;

  // Chest X-ray group
  const chestXrayGroup = comparison.filter(c => c.entity_id >= 15 && c.entity_id <= 19);
  const chestXrayCorrect = chestXrayGroup.filter(c => c.found_in_top20).length;
  markdown += `### Chest X-ray Formatting Variations (IDs 15-19)\n\n`;
  markdown += `**Expected Codes:** 58500, 58503, 58506 (chest lung fields by direct radiography)\n\n`;
  markdown += `**Hypothesis:** All 5 formats should match same MBS codes regardless of formatting\n\n`;
  markdown += `| ID | Entity Text | Expected Codes | Found in Top-20? | Status |\n`;
  markdown += `|----|-------------|----------------|------------------|--------|\n`;
  chestXrayGroup.forEach(c => {
    const expectedStr = c.expected_codes.join(', ');
    const status = c.found_in_top20 ? 'CORRECT' : (c.hybrid_results > 0 ? 'WRONG CODES' : 'NO RESULTS');
    const icon = c.found_in_top20 ? 'PASS' : 'FAIL';
    markdown += `| ${c.entity_id} | ${c.entity_text} | ${expectedStr} | ${c.found_in_top20 ? 'Yes' : 'No'} | ${icon} ${status} |\n`;
  });
  markdown += `\n**Result:** ${chestXrayCorrect}/5 entities returned correct codes\n\n`;

  // Cholecystectomy
  const cholecystectomy = comparison.find(c => c.entity_text === 'Cholecystectomy');
  if (cholecystectomy) {
    markdown += `### Cholecystectomy (Exact Term Match Failure)\n\n`;
    markdown += `- **Expected Codes:** ${cholecystectomy.expected_codes.join(', ')}\n`;
    markdown += `- **Baseline:** ${cholecystectomy.baseline_results} results (catastrophic - similarity < 0.0)\n`;
    markdown += `- **Hybrid:** ${cholecystectomy.hybrid_results} results\n`;
    markdown += `- **Found in Top-20:** ${cholecystectomy.found_in_top20 ? 'Yes' : 'No'}\n`;
    markdown += `- **Status:** ${cholecystectomy.found_in_top20 ? 'PASS FIXED' : 'FAIL'}\n\n`;
  }

  // CT scan head
  const ctHead = comparison.find(c => c.entity_text === 'CT scan head');
  if (ctHead) {
    markdown += `### CT Scan Head (Terminology Mismatch)\n\n`;
    markdown += `- **Expected Codes:** ${ctHead.expected_codes.join(', ')}\n`;
    markdown += `- **Issue:** "CT" needs "Computed tomography", "head" needs "brain"\n`;
    markdown += `- **Baseline:** ${ctHead.baseline_results} results\n`;
    markdown += `- **Hybrid:** ${ctHead.hybrid_results} results\n`;
    markdown += `- **Found in Top-20:** ${ctHead.found_in_top20 ? 'Yes' : 'No'}\n`;
    markdown += `- **Status:** ${ctHead.found_in_top20 ? 'PASS FIXED' : 'FAIL'}\n\n`;
  }

  // Ultrasound abdomen
  const ultrasound = comparison.find(c => c.entity_text === 'Ultrasound abdomen');
  if (ultrasound) {
    markdown += `### Ultrasound Abdomen\n\n`;
    markdown += `- **Expected Code:** ${ultrasound.expected_codes.join(', ')}\n`;
    markdown += `- **Baseline:** ${ultrasound.baseline_results} results\n`;
    markdown += `- **Hybrid:** ${ultrasound.hybrid_results} results\n`;
    markdown += `- **Found in Top-20:** ${ultrasound.found_in_top20 ? 'Yes' : 'No'}\n`;
    markdown += `- **Status:** ${ultrasound.found_in_top20 ? 'PASS' : 'FAIL'}\n\n`;
  }

  markdown += `---\n\n`;
  markdown += `## Detailed Comparison Table\n\n`;
  markdown += `| ID | Entity Text | Expected Codes | Top-20 Correct? | Baseline Results | Hybrid Results |\n`;
  markdown += `|----|-------------|----------------|-----------------|------------------|----------------|\n`;
  comparison.forEach(c => {
    const expectedStr = c.has_ground_truth ? c.expected_codes.join(', ') : 'TBD';
    const correctStr = c.has_ground_truth ? (c.found_in_top20 ? 'Yes' : 'No') : 'N/A';
    markdown += `| ${c.entity_id} | ${c.entity_text} | ${expectedStr} | ${correctStr} | ${c.baseline_results} | ${c.hybrid_results} |\n`;
  });
  markdown += `\n`;

  markdown += `---\n\n`;
  markdown += `## Interpretation\n\n`;

  if (entitiesWithGroundTruth === 0) {
    markdown += `### WARNING: No Ground Truth Available\n\n`;
    markdown += `Cannot calculate accuracy metrics - all entities marked "TBD" in expected-codes.json.\n\n`;
    markdown += `Manual investigation of expected MBS codes is required before accuracy can be assessed.\n\n`;
  } else {
    markdown += `**Ground Truth Coverage:** ${entitiesWithGroundTruth}/${totalEntities} entities (${(entitiesWithGroundTruth/totalEntities*100).toFixed(1)}%)\n\n`;

    if (top20Accuracy >= 90) {
      markdown += `### SUCCESS: Proceed to Phase 2\n\n`;
      markdown += `**Top-20 Accuracy:** ${top20Accuracy.toFixed(1)}% (target: >=90%)\n\n`;
      markdown += `**Recommendation:** Proceed with Pass 1 integration\n\n`;
      markdown += `**Next Steps:**\n`;
      markdown += `1. Update Pass 1 AI prompt to generate search_variants\n`;
      markdown += `2. Update Pass 1.5 routing logic to call search_procedures_hybrid()\n`;
      markdown += `3. Test end-to-end on real documents\n\n`;
    } else if (top20Accuracy >= 75) {
      markdown += `### TUNE: Improvements Needed\n\n`;
      markdown += `**Top-20 Accuracy:** ${top20Accuracy.toFixed(1)}% (target: >=90%)\n\n`;
      markdown += `**Recommendation:** Tune hybrid search parameters\n\n`;
      markdown += `**Tuning Options:**\n`;
      markdown += `1. Adjust weights (try 80/20 lexical/semantic or 60/40)\n`;
      markdown += `2. Improve variant quality (add more anatomical terms)\n`;
      markdown += `3. Increase variant count from 5 to 7-10\n`;
      markdown += `4. Add variant generation prompt engineering\n\n`;
    } else {
      markdown += `### RETHINK: Insufficient Improvement\n\n`;
      markdown += `**Top-20 Accuracy:** ${top20Accuracy.toFixed(1)}% (target: >=90%)\n\n`;
      markdown += `**Recommendation:** Consider alternative approaches\n\n`;
      markdown += `**Alternatives:**\n`;
      markdown += `1. Domain-specific embeddings (BioBERT, Clinical-ModernBERT)\n`;
      markdown += `2. Anatomy + procedure extraction\n`;
      markdown += `3. MBS-specific preprocessing\n`;
      markdown += `4. Multi-stage search pipeline\n\n`;
    }
  }

  // Save markdown report
  const outputPath = path.join(__dirname, '../results/accuracy-comparison.md');
  fs.writeFileSync(outputPath, markdown);

  console.log('Comparison complete!');
  console.log('');
  console.log('Ground Truth Validation:');
  console.log(`  Entities with ground truth: ${entitiesWithGroundTruth}/${totalEntities}`);
  console.log(`  Top-1 Accuracy: ${top1Accuracy.toFixed(1)}% (${hybridTop1Hits}/${entitiesWithGroundTruth} correct)`);
  console.log(`  Top-5 Accuracy: ${top5Accuracy.toFixed(1)}% (${hybridTop5Hits}/${entitiesWithGroundTruth} correct)`);
  console.log(`  Top-20 Accuracy: ${top20Accuracy.toFixed(1)}% (${hybridTop20Hits}/${entitiesWithGroundTruth} correct)`);
  console.log(`  Target: >=90%`);
  console.log('');
  console.log('Result Existence Metrics:');
  console.log(`  Zero-result fixes: ${fixed} entities`);
  console.log(`  Regressions: ${regressed} entities`);
  console.log('');
  console.log(`Report saved to: ${outputPath}`);
}

main();
