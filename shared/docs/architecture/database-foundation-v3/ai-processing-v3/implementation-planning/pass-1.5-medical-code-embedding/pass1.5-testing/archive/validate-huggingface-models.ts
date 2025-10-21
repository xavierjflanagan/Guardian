/**
 * HuggingFace Model Validation Script
 *
 * Tests all 4 HuggingFace models with single API calls to verify:
 * 1. Models are accessible and loadable
 * 2. Each returns pooled embeddings (768 dimensions)
 * 3. Feature-extraction pipeline works correctly
 * 4. Results are consistent with known good SapBERT test
 *
 * Run this BEFORE executing the full Experiment 2 to catch API issues early.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment
function findProjectRoot(): string {
  let currentDir = process.cwd();
  while (currentDir !== '/') {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      if (fs.existsSync(path.join(currentDir, 'apps'))) {
        return currentDir;
      }
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error('Could not find project root');
}

const projectRoot = findProjectRoot();
const envPath = path.join(projectRoot, '.env.production');
dotenv.config({ path: envPath });

const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;

if (!HUGGINGFACE_API_KEY) {
  console.error('❌ Missing HUGGINGFACE_API_KEY in .env.production');
  console.error('Get free API key at: https://huggingface.co/settings/tokens');
  process.exit(1);
}

// Models to test
const MODELS_TO_TEST = [
  {
    name: 'SapBERT',
    id: 'cambridgeltl/SapBERT-from-PubMedBERT-fulltext',
    expectedDimensions: 768,
    description: 'Medical entity linking (UMLS trained)',
    knownGood: true // Successfully tested, needs mean pooling
  },
  {
    name: 'BioBERT',
    id: 'dmis-lab/biobert-v1.1',
    expectedDimensions: 768,
    description: 'Biomedical text mining (PubMed + PMC)',
    knownGood: true // Successfully tested, needs mean pooling
  },
  {
    name: 'Clinical-ModernBERT',
    id: 'Simonlee711/Clinical_ModernBERT',
    expectedDimensions: 768,
    description: 'Clinical ModernBERT 2025 (PubMed + MIMIC-IV)',
    knownGood: false
  },
  {
    name: 'BioClinical-ModernBERT-Embeddings',
    id: 'NeuML/bioclinical-modernbert-base-embeddings',
    expectedDimensions: 768,
    description: 'Clinical ModernBERT sentence-transformers version',
    knownGood: false
  },
  {
    name: 'BlueBERT',
    id: 'bionlp/bluebert_pubmed_mimic_uncased_L-12_H-768_A-12',
    expectedDimensions: 768,
    description: 'BlueBERT PubMed + MIMIC-III (NCBI)',
    knownGood: false
  },
  {
    name: 'ClinicalBERT-MedicalAI',
    id: 'medicalai/ClinicalBERT',
    expectedDimensions: 768,
    description: 'ClinicalBERT (40M PubMed + 3M EHR)',
    knownGood: false
  }
];

// Test text (simple medical term)
const TEST_TEXT = 'amoxicillin';

interface ValidationResult {
  model: string;
  modelId: string;
  success: boolean;
  dimensions?: number;
  responseTime?: number;
  error?: string;
  embedding?: number[];
}

/**
 * Test HuggingFace model with feature-extraction pipeline
 */
async function testModel(
  modelName: string,
  modelId: string,
  expectedDims: number,
  attempt: number = 1
): Promise<ValidationResult> {
  const startTime = Date.now();

  try {
    console.log(`Testing ${modelName} (${modelId})...`);

    // Sentence-transformers models need array input for feature extraction
    const isSentenceTransformers = modelId.includes('embeddings') || modelId.includes('S-PubMedBert');
    const requestBody = isSentenceTransformers
      ? { inputs: [TEST_TEXT], options: { wait_for_model: true } }
      : { inputs: TEST_TEXT, options: { wait_for_model: true } };

    const response = await fetch(
      `https://api-inference.huggingface.co/models/${modelId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      }
    );

    const responseTime = Date.now() - startTime;

    // Handle model loading
    if (response.status === 503) {
      console.log(`  ⏳ Model loading, waiting 10 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      if (attempt < 3) {
        return testModel(modelName, modelId, expectedDims, attempt + 1);
      }
      return {
        model: modelName,
        modelId,
        success: false,
        error: 'Model loading timeout after 3 attempts'
      };
    }

    // Handle rate limiting
    if (response.status === 429) {
      console.log(`  ⚠️  Rate limit hit, waiting 60 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 60000));
      if (attempt < 2) {
        return testModel(modelName, modelId, expectedDims, attempt + 1);
      }
      return {
        model: modelName,
        modelId,
        success: false,
        error: 'Rate limit exceeded'
      };
    }

    if (!response.ok) {
      const errorText = await response.text();
      return {
        model: modelName,
        modelId,
        success: false,
        error: `HTTP ${response.status}: ${errorText}`
      };
    }

    const data = await response.json();

    // HuggingFace feature-extraction returns different formats:
    // - Sentence transformers with array input: [[embedding]] (array of embeddings)
    // - Sentence transformers with single input: [embedding] (single embedding)
    // - Base BERT: [[token_embeddings]] (2D array - needs pooling)

    let embedding: number[];

    if (Array.isArray(data)) {
      // Check if this is sentence-transformers model (array of embeddings)
      if (Array.isArray(data[0]) && Array.isArray(data[0][0])) {
        // 3D array: sentence-transformers with array input [[embedding]]
        // Take first embedding
        embedding = data[0] as number[];
        console.log(`  ✓ Received pooled sentence embedding from array (${embedding.length}d)`);
      } else if (Array.isArray(data[0])) {
        // 2D array: could be token embeddings OR single sentence embedding
        const firstRow = data[0];

        if (firstRow.length === 768) {
          // Likely a single sentence embedding (1 row, 768 dims)
          embedding = firstRow as number[];
          console.log(`  ✓ Received pooled sentence embedding (${embedding.length}d)`);
        } else {
          // Multiple tokens, needs mean pooling
          console.log(`  ⚠️  Received token embeddings (2D array), applying mean pooling...`);
          const tokenEmbeddings = data as number[][];
          const dimensions = tokenEmbeddings[0].length;
          embedding = new Array(dimensions).fill(0);

          for (let i = 0; i < tokenEmbeddings.length; i++) {
            for (let j = 0; j < dimensions; j++) {
              embedding[j] += tokenEmbeddings[i][j];
            }
          }
          for (let j = 0; j < dimensions; j++) {
            embedding[j] /= tokenEmbeddings.length;
          }

          console.log(`  ℹ️  Pooled ${tokenEmbeddings.length} token embeddings → ${embedding.length}d`);
        }
      } else {
        // 1D array: already pooled sentence embedding
        embedding = data as number[];
        console.log(`  ✓ Received pooled sentence embedding (${embedding.length}d)`);
      }
    } else {
      return {
        model: modelName,
        modelId,
        success: false,
        error: `Unexpected response format: ${JSON.stringify(data).substring(0, 100)}`
      };
    }

    // Validate dimensions
    const actualDims = embedding.length;

    if (actualDims !== expectedDims) {
      return {
        model: modelName,
        modelId,
        success: false,
        dimensions: actualDims,
        responseTime,
        error: `Dimension mismatch: expected ${expectedDims}, got ${actualDims}`
      };
    }

    // Validate embedding values are reasonable
    const allZeros = embedding.every(v => v === 0);
    const hasNaN = embedding.some(v => isNaN(v));
    const hasInfinity = embedding.some(v => !isFinite(v));

    if (allZeros) {
      return {
        model: modelName,
        modelId,
        success: false,
        dimensions: actualDims,
        responseTime,
        error: 'Embedding is all zeros (invalid)'
      };
    }

    if (hasNaN || hasInfinity) {
      return {
        model: modelName,
        modelId,
        success: false,
        dimensions: actualDims,
        responseTime,
        error: 'Embedding contains NaN or Infinity values'
      };
    }

    // Calculate magnitude to verify it's normalized or at least reasonable
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));

    console.log(`  ✓ Valid embedding: ${actualDims}d, magnitude: ${magnitude.toFixed(4)}, time: ${responseTime}ms`);

    return {
      model: modelName,
      modelId,
      success: true,
      dimensions: actualDims,
      responseTime,
      embedding
    };

  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      model: modelName,
      modelId,
      success: false,
      responseTime,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error(`Vector dimension mismatch: ${vec1.length} vs ${vec2.length}`);
  }

  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }

  return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

/**
 * Main validation execution
 */
async function main() {
  console.log('='.repeat(80));
  console.log('HUGGINGFACE MODEL VALIDATION');
  console.log('='.repeat(80));
  console.log(`Test text: "${TEST_TEXT}"`);
  console.log(`Expected dimensions: 768 (BERT-base)`);
  console.log('');

  const results: ValidationResult[] = [];

  // Test each model
  for (const model of MODELS_TO_TEST) {
    const result = await testModel(model.name, model.id, model.expectedDimensions);
    results.push(result);

    if (result.success) {
      console.log(`✅ ${model.name}: PASSED`);
    } else {
      console.log(`❌ ${model.name}: FAILED - ${result.error}`);
    }
    console.log('');

    // Small delay between models to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Summary
  console.log('='.repeat(80));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(80));
  console.log('');

  const passedCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;

  console.log(`Total models tested: ${results.length}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log('');

  // Detailed results table
  console.log('Model Results:');
  console.log('');
  console.log('| Model | Status | Dimensions | Response Time | Notes |');
  console.log('|-------|--------|------------|---------------|-------|');

  for (const result of results) {
    const status = result.success ? '✓ PASS' : '✗ FAIL';
    const dims = result.dimensions?.toString() || 'N/A';
    const time = result.responseTime ? `${result.responseTime}ms` : 'N/A';
    const notes = result.error || 'OK';

    console.log(`| ${result.model.padEnd(12)} | ${status.padEnd(6)} | ${dims.padEnd(10)} | ${time.padEnd(13)} | ${notes} |`);
  }
  console.log('');

  // Cross-model similarity check (if we have multiple successful results)
  const successfulResults = results.filter(r => r.success && r.embedding);

  if (successfulResults.length >= 2) {
    console.log('='.repeat(80));
    console.log('CROSS-MODEL CONSISTENCY CHECK');
    console.log('='.repeat(80));
    console.log('');
    console.log('Comparing embeddings of the same text across models:');
    console.log('(Higher similarity = models agree on semantic representation)');
    console.log('');

    for (let i = 0; i < successfulResults.length; i++) {
      for (let j = i + 1; j < successfulResults.length; j++) {
        const model1 = successfulResults[i];
        const model2 = successfulResults[j];

        if (model1.embedding && model2.embedding) {
          const similarity = cosineSimilarity(model1.embedding, model2.embedding);
          console.log(`${model1.model} vs ${model2.model}: ${(similarity * 100).toFixed(1)}%`);
        }
      }
    }
    console.log('');
  }

  // Final verdict
  console.log('='.repeat(80));
  console.log('VERDICT');
  console.log('='.repeat(80));
  console.log('');

  if (passedCount === results.length) {
    console.log('✅ ALL MODELS VALIDATED SUCCESSFULLY');
    console.log('');
    console.log('Ready to proceed with Experiment 2.');
    console.log('All models return 768-dimensional embeddings as expected.');
  } else if (passedCount >= 3) {
    console.log('⚠️  PARTIAL SUCCESS');
    console.log('');
    console.log(`${passedCount}/${results.length} models validated successfully.`);
    console.log('Recommend proceeding with validated models only.');
    console.log('');
    console.log('Failed models:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.model}: ${r.error}`);
    });
  } else {
    console.log('❌ VALIDATION FAILED');
    console.log('');
    console.log('Too many model failures. Issues detected:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.model}: ${r.error}`);
    });
    console.log('');
    console.log('Recommendations:');
    console.log('1. Check HuggingFace API status');
    console.log('2. Verify API key permissions');
    console.log('3. Try again in a few minutes (models may need to load)');
    process.exit(1);
  }

  console.log('='.repeat(80));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
