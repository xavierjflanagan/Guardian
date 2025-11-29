/**
 * Pass 1.5 Medical Code Embedding Generation Script
 *
 * Purpose: Generate OpenAI embeddings for all parsed medical codes
 *
 * Usage:
 *   npx tsx generate-embeddings.ts --code-system rxnorm
 *   npx tsx generate-embeddings.ts --code-system all
 *
 * Requirements:
 *   - Parsed JSON files in data/medical-codes/<system>/processed/
 *   - OPENAI_API_KEY environment variable
 *
 * Output:
 *   - Embeddings added to JSON files
 *   - Progress logs and statistics
 *
 * Created: 2025-10-15
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import OpenAI from 'openai';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // OpenAI API configuration
  openai: {
    model: 'text-embedding-3-small',
    dimensions: 1536, // Can be reduced to 1024 or 512 for smaller storage
    batchSize: 100,   // Max 100 inputs per API request
    maxRetries: 3,
    retryDelay: 1000, // 1 second
  },

  // Cost tracking (2025 pricing)
  pricing: {
    costPerToken: 0.00000002, // $0.02 per 1M tokens
  },

  // File paths
  paths: {
    dataRoot: path.join(process.cwd(), 'data', 'medical-codes'),
  },

  // Code systems
  codeSystems: ['rxnorm', 'snomed', 'loinc', 'pbs', 'mbs', 'icd10am'],
};

// ============================================================================
// Type Definitions
// ============================================================================

interface MedicalCodeStandard {
  code_system: string;
  code_value: string;
  display_name: string;
  entity_type: 'medication' | 'condition' | 'procedure' | 'observation' | 'allergy';
  search_text: string;
  library_version: string;
  country_code: string | null;
  region_specific_data: Record<string, any>;
  embedding?: number[]; // Added by this script
}

interface EmbeddingBatch {
  codes: MedicalCodeStandard[];
  texts: string[];
}

interface EmbeddingStats {
  codeSystem: string;
  totalCodes: number;
  successfulEmbeddings: number;
  failedEmbeddings: number;
  totalTokens: number;
  estimatedCost: number;
  processingTime: number;
}

// ============================================================================
// OpenAI Client
// ============================================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================================================
// Embedding Generation Functions
// ============================================================================

/**
 * Generate embeddings for a batch of texts
 */
async function generateEmbeddingBatch(
  texts: string[],
  retryCount = 0
): Promise<number[][]> {
  try {
    const response = await openai.embeddings.create({
      model: CONFIG.openai.model,
      input: texts,
      dimensions: CONFIG.openai.dimensions,
    });

    return response.data.map((item) => item.embedding);
  } catch (error: any) {
    // Handle rate limiting and transient errors
    if (retryCount < CONFIG.openai.maxRetries) {
      const isRateLimit = error?.status === 429;
      const isServerError = error?.status >= 500;

      if (isRateLimit || isServerError) {
        const delay = CONFIG.openai.retryDelay * Math.pow(2, retryCount);
        console.log(`  ⚠️  ${error.message} - Retrying in ${delay}ms (attempt ${retryCount + 1}/${CONFIG.openai.maxRetries})`);
        await sleep(delay);
        return generateEmbeddingBatch(texts, retryCount + 1);
      }
    }

    throw error;
  }
}

/**
 * Process a single code system
 */
async function processCodeSystem(codeSystem: string): Promise<EmbeddingStats> {
  const startTime = Date.now();

  // 1. Load parsed codes
  const inputPath = path.join(
    CONFIG.paths.dataRoot,
    codeSystem,
    'processed',
    `${codeSystem}_codes.json`
  );

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Parsed codes not found: ${inputPath}`);
  }

  const codes: MedicalCodeStandard[] = await fs.readJson(inputPath);
  console.log(`\n📂 Loaded ${codes.length} ${codeSystem} codes`);

  // 2. Filter codes that already have embeddings (resume capability)
  const codesNeedingEmbedding = codes.filter((code) => !code.embedding);
  const alreadyEmbedded = codes.length - codesNeedingEmbedding.length;

  if (alreadyEmbedded > 0) {
    console.log(`  ℹ️  ${alreadyEmbedded} codes already have embeddings (skipping)`);
  }

  if (codesNeedingEmbedding.length === 0) {
    console.log(`  ✅ All codes already embedded!`);
    return {
      codeSystem,
      totalCodes: codes.length,
      successfulEmbeddings: codes.length,
      failedEmbeddings: 0,
      totalTokens: 0,
      estimatedCost: 0,
      processingTime: Date.now() - startTime,
    };
  }

  // 3. Create batches
  const batches: EmbeddingBatch[] = [];
  for (let i = 0; i < codesNeedingEmbedding.length; i += CONFIG.openai.batchSize) {
    const batchCodes = codesNeedingEmbedding.slice(i, i + CONFIG.openai.batchSize);
    batches.push({
      codes: batchCodes,
      texts: batchCodes.map((code) => code.search_text),
    });
  }

  console.log(`  🔄 Processing ${batches.length} batches (${CONFIG.openai.batchSize} codes per batch)`);

  // 4. Process batches with progress tracking
  let successfulEmbeddings = 0;
  let failedEmbeddings = 0;
  let totalTokens = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const progress = ((i / batches.length) * 100).toFixed(1);

    try {
      // Generate embeddings
      const embeddings = await generateEmbeddingBatch(batch.texts);

      // Estimate token usage (rough approximation: 1 token ≈ 4 characters)
      const batchTokens = batch.texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);
      totalTokens += batchTokens;

      // Attach embeddings to codes
      batch.codes.forEach((code, index) => {
        code.embedding = embeddings[index];
      });

      successfulEmbeddings += batch.codes.length;

      // Progress logging
      process.stdout.write(`\r  ⏳ Progress: ${progress}% (${successfulEmbeddings}/${codesNeedingEmbedding.length} codes)`);

    } catch (error: any) {
      console.error(`\n  ❌ Batch ${i + 1} failed: ${error.message}`);
      failedEmbeddings += batch.codes.length;
    }

    // Rate limiting: Small delay between batches
    if (i < batches.length - 1) {
      await sleep(100); // 100ms between batches
    }
  }

  console.log(); // New line after progress

  // 5. Save updated codes with embeddings
  const outputPath = inputPath; // Overwrite input file
  await fs.writeJson(outputPath, codes, { spaces: 2 });

  // 6. Calculate statistics
  const processingTime = Date.now() - startTime;
  const estimatedCost = totalTokens * CONFIG.pricing.costPerToken;

  const stats: EmbeddingStats = {
    codeSystem,
    totalCodes: codes.length,
    successfulEmbeddings: successfulEmbeddings + alreadyEmbedded,
    failedEmbeddings,
    totalTokens,
    estimatedCost,
    processingTime,
  };

  // 7. Log summary
  console.log(`  ✅ Successfully embedded ${successfulEmbeddings} new codes`);
  console.log(`  💰 Estimated cost: $${estimatedCost.toFixed(4)}`);
  console.log(`  ⏱️  Processing time: ${(processingTime / 1000).toFixed(1)}s`);

  if (failedEmbeddings > 0) {
    console.log(`  ⚠️  Failed embeddings: ${failedEmbeddings}`);
  }

  return stats;
}

/**
 * Process all code systems
 */
async function processAllCodeSystems(): Promise<void> {
  console.log('🚀 Starting Pass 1.5 Medical Code Embedding Generation');
  console.log(`📊 Model: ${CONFIG.openai.model} (${CONFIG.openai.dimensions} dimensions)`);
  console.log(`💲 Pricing: $${(CONFIG.pricing.costPerToken * 1000000).toFixed(2)} per 1M tokens`);

  const allStats: EmbeddingStats[] = [];

  for (const codeSystem of CONFIG.codeSystems) {
    try {
      const stats = await processCodeSystem(codeSystem);
      allStats.push(stats);
    } catch (error: any) {
      console.error(`\n❌ Failed to process ${codeSystem}: ${error.message}`);
      allStats.push({
        codeSystem,
        totalCodes: 0,
        successfulEmbeddings: 0,
        failedEmbeddings: 0,
        totalTokens: 0,
        estimatedCost: 0,
        processingTime: 0,
      });
    }
  }

  // Print final summary
  printFinalSummary(allStats);
}

/**
 * Print final summary report
 */
function printFinalSummary(stats: EmbeddingStats[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 FINAL EMBEDDING GENERATION SUMMARY');
  console.log('='.repeat(80));

  const totals = stats.reduce(
    (acc, stat) => ({
      totalCodes: acc.totalCodes + stat.totalCodes,
      successfulEmbeddings: acc.successfulEmbeddings + stat.successfulEmbeddings,
      failedEmbeddings: acc.failedEmbeddings + stat.failedEmbeddings,
      totalTokens: acc.totalTokens + stat.totalTokens,
      estimatedCost: acc.estimatedCost + stat.estimatedCost,
      processingTime: acc.processingTime + stat.processingTime,
    }),
    {
      totalCodes: 0,
      successfulEmbeddings: 0,
      failedEmbeddings: 0,
      totalTokens: 0,
      estimatedCost: 0,
      processingTime: 0,
    }
  );

  // Per-system breakdown
  console.log('\nPer-System Breakdown:');
  console.log('-'.repeat(80));
  for (const stat of stats) {
    if (stat.totalCodes > 0) {
      const successRate = ((stat.successfulEmbeddings / stat.totalCodes) * 100).toFixed(1);
      console.log(`  ${stat.codeSystem.padEnd(12)} | ${stat.successfulEmbeddings.toString().padStart(6)} / ${stat.totalCodes.toString().padStart(6)} codes (${successRate}%) | $${stat.estimatedCost.toFixed(4)}`);
    }
  }

  // Overall totals
  console.log('-'.repeat(80));
  const overallSuccessRate = ((totals.successfulEmbeddings / totals.totalCodes) * 100).toFixed(1);
  console.log(`  TOTAL        | ${totals.successfulEmbeddings.toString().padStart(6)} / ${totals.totalCodes.toString().padStart(6)} codes (${overallSuccessRate}%)`);
  console.log(`  Total Cost   | $${totals.estimatedCost.toFixed(4)}`);
  console.log(`  Total Tokens | ${totals.totalTokens.toLocaleString()}`);
  console.log(`  Total Time   | ${(totals.processingTime / 1000 / 60).toFixed(1)} minutes`);

  if (totals.failedEmbeddings > 0) {
    console.log(`\n  ⚠️  ${totals.failedEmbeddings} embeddings failed (retry recommended)`);
  }

  console.log('='.repeat(80));
  console.log('✅ Embedding generation complete!\n');
}

// ============================================================================
// Utility Functions
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  // Validate environment
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY environment variable not set');
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  const codeSystemArg = args.find((arg) => arg.startsWith('--code-system='))?.split('=')[1];

  if (!codeSystemArg) {
    console.error('❌ Error: --code-system argument required');
    console.log('\nUsage:');
    console.log('  npx tsx generate-embeddings.ts --code-system=rxnorm');
    console.log('  npx tsx generate-embeddings.ts --code-system=all');
    console.log('\nAvailable code systems:');
    CONFIG.codeSystems.forEach((system) => console.log(`  - ${system}`));
    process.exit(1);
  }

  // Process single or all code systems
  if (codeSystemArg === 'all') {
    await processAllCodeSystems();
  } else if (CONFIG.codeSystems.includes(codeSystemArg)) {
    console.log(`🚀 Starting embedding generation for ${codeSystemArg}`);
    const stats = await processCodeSystem(codeSystemArg);
    printFinalSummary([stats]);
  } else {
    console.error(`❌ Error: Unknown code system "${codeSystemArg}"`);
    console.log('\nAvailable code systems:');
    CONFIG.codeSystems.forEach((system) => console.log(`  - ${system}`));
    process.exit(1);
  }
}

// Run CLI
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

// Export for programmatic usage
export { processCodeSystem, processAllCodeSystems, CONFIG };
