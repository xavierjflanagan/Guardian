/**
 * Experiment 2: Comprehensive Medical Embedding Model Comparison
 *
 * Compares 4 embedding models (OpenAI, SapBERT, BioBERT, Clinical-ModernBERT)
 * across 3 text extraction strategies (original, normalized, core-concept)
 * on 40 medical entities (20 medications + 20 procedures).
 *
 * This script executes the complete experiment workflow:
 * 1. Fetch test samples from Supabase
 * 2. Generate embeddings for all model/strategy combinations
 * 3. Calculate pairwise similarities
 * 4. Generate comparison tables
 * 5. Produce final recommendation
 *
 * Crash-safe design: All intermediate results cached to JSON files.
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// ENVIRONMENT SETUP
// ============================================================================

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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error('❌ Missing OPENAI_API_KEY');
  process.exit(1);
}

if (!HUGGINGFACE_API_KEY) {
  console.error('❌ Missing HUGGINGFACE_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Experiment directory
const EXPERIMENT_DIR = path.join(
  projectRoot,
  'shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/pass1.5-testing/experiment-2'
);

// Ensure experiment directory exists
if (!fs.existsSync(EXPERIMENT_DIR)) {
  fs.mkdirSync(EXPERIMENT_DIR, { recursive: true });
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MODELS = {
  openai: {
    name: 'OpenAI',
    id: 'text-embedding-3-small',
    dimensions: 768,
    type: 'openai'
  },
  sapbert: {
    name: 'SapBERT',
    id: 'cambridgeltl/SapBERT-from-PubMedBERT-fulltext',
    dimensions: 768,
    type: 'huggingface'
  },
  biobert: {
    name: 'BioBERT',
    id: 'dmis-lab/biobert-v1.1',
    dimensions: 768,
    type: 'huggingface'
  },
  clinical_modernbert: {
    name: 'Clinical-ModernBERT',
    id: 'Simonlee711/Clinical_ModernBERT',
    dimensions: 768,
    type: 'huggingface'
  }
};

const STRATEGIES = ['original', 'normalized', 'core'] as const;
type Strategy = typeof STRATEGIES[number];
/**
 * Load final 40 entities from JSON file
 */
function loadFinalEntities(): { medications: any[]; procedures: any[] } {
  const entitiesPath = path.join(projectRoot, 'final-40-entities.json');
  if (!fs.existsSync(entitiesPath)) {
    throw new Error(`Could not find final-40-entities.json at: ${entitiesPath}`);
  }
  const data = JSON.parse(fs.readFileSync(entitiesPath, 'utf-8'));
  return {
    medications: data.medications || [],
    procedures: data.procedures || []
  };
}


// Test medications (exact display names to fetch from database)
const MEDICATION_QUERIES = [
  'Amoxicillin',
  'Dicloxacillin',
  'Flucloxacillin',
  'Cefalexin',
  'Metformin',
  'Metoprolol',
  'Atorvastatin',
  'Simvastatin',
  'Rosuvastatin',
  'Amoxicillin + clavulanic acid',
  'Paclitaxel',
  'Docetaxel',
  'Carboplatin',
  'Perindopril',
  'Lisinopril',
  'Ramipril',
  'Paracetamol',
  'Ibuprofen',
  'Aspirin',
  'Clopidogrel'
];

// Test procedures (search terms for MBS procedures)
const PROCEDURE_QUERIES = [
  'Chest X-ray',
  'Spine X-ray',
  'X-ray of limb',
  'GP consultation',
  'Specialist consultation',
  'Skin biopsy',
  'Liver biopsy',
  'Lymph node biopsy',
  'Hip replacement',
  'Knee arthroscopy',
  'Skin lesion excision',
  'ECG',
  'Spirometry',
  'Blood test',
  'Colonoscopy',
  'Endoscopy',
  'CT scan',
  'MRI',
  'Ultrasound'
];

// Medication pairs for analysis (indices into fetched medications)
const MEDICATION_PAIRS = [
  { id: 'MED-01', idx1: 0, idx2: 1, type: 'same-class', expected: 'LOW' },          // Amox vs Diclo
  { id: 'MED-02', idx1: 0, idx2: 2, type: 'same-class', expected: 'LOW' },          // Amox vs Fluclo
  { id: 'MED-03', idx1: 0, idx2: 3, type: 'different-class', expected: 'LOW' },     // Amox vs Cefa
  { id: 'MED-04', idx1: 4, idx2: 5, type: 'name-similar', expected: 'VERY_LOW' },   // Metformin vs Metoprolol
  { id: 'MED-05', idx1: 6, idx2: 7, type: 'same-class', expected: 'LOW' },          // Atorva vs Simva
  { id: 'MED-06', idx1: 6, idx2: 8, type: 'same-class', expected: 'LOW' },          // Atorva vs Rosuva
  { id: 'MED-07', idx1: 0, idx2: 9, type: 'standalone-vs-combo', expected: 'MEDIUM' }, // Amox vs Amox+clav
  { id: 'MED-08', idx1: 10, idx2: 11, type: 'same-class-chemo', expected: 'LOW' },  // Paclitaxel vs Docetaxel
  { id: 'MED-09', idx1: 10, idx2: 12, type: 'different-chemo', expected: 'LOW' },   // Paclitaxel vs Carboplatin
  { id: 'MED-10', idx1: 13, idx2: 14, type: 'same-class-ACE', expected: 'LOW' },    // Perindopril vs Lisinopril
  { id: 'MED-11', idx1: 13, idx2: 15, type: 'same-class-ACE', expected: 'LOW' },    // Perindopril vs Ramipril
  { id: 'MED-12', idx1: 16, idx2: 17, type: 'different-analgesic', expected: 'VERY_LOW' }, // Paracetamol vs Ibuprofen
  { id: 'MED-13', idx1: 16, idx2: 18, type: 'different-analgesic', expected: 'LOW' }, // Paracetamol vs Aspirin
  { id: 'MED-14', idx1: 18, idx2: 19, type: 'antiplatelet', expected: 'LOW' },      // Aspirin vs Clopidogrel
  { id: 'MED-15', idx1: 1, idx2: 2, type: 'same-class', expected: 'LOW' }           // Diclo vs Fluclo
];

// Procedure pairs for analysis
const PROCEDURE_PAIRS = [
  { id: 'PROC-01', idx1: 0, idx2: 1, type: 'same-modality', expected: 'LOW' },      // Chest vs Spine X-ray
  { id: 'PROC-02', idx1: 0, idx2: 2, type: 'same-modality', expected: 'LOW' },      // Chest vs Limb X-ray
  { id: 'PROC-03', idx1: 1, idx2: 2, type: 'same-modality', expected: 'LOW' },      // Spine vs Limb X-ray
  { id: 'PROC-04', idx1: 3, idx2: 3, type: 'same-type-different-duration', expected: 'MEDIUM' }, // GP consult (will find 2 variants)
  { id: 'PROC-05', idx1: 3, idx2: 4, type: 'different-provider', expected: 'LOW' }, // GP vs Specialist
  { id: 'PROC-06', idx1: 5, idx2: 6, type: 'same-procedure', expected: 'LOW' },     // Skin vs Liver biopsy
  { id: 'PROC-07', idx1: 5, idx2: 7, type: 'same-procedure', expected: 'LOW' },     // Skin vs Lymph node biopsy
  { id: 'PROC-08', idx1: 8, idx2: 9, type: 'surgery', expected: 'LOW' },            // Hip replacement vs Knee arthroscopy
  { id: 'PROC-09', idx1: 8, idx2: 10, type: 'surgery', expected: 'VERY_LOW' },      // Hip replacement vs Skin lesion excision
  { id: 'PROC-10', idx1: 11, idx2: 12, type: 'diagnostic', expected: 'VERY_LOW' },  // ECG vs Spirometry
  { id: 'PROC-11', idx1: 11, idx2: 13, type: 'diagnostic', expected: 'VERY_LOW' },  // ECG vs Blood test
  { id: 'PROC-12', idx1: 14, idx2: 15, type: 'endoscopy', expected: 'LOW' },        // Colonoscopy vs Endoscopy
  { id: 'PROC-13', idx1: 16, idx2: 17, type: 'imaging-advanced', expected: 'LOW' }, // CT vs MRI
  { id: 'PROC-14', idx1: 16, idx2: 18, type: 'imaging', expected: 'VERY_LOW' },     // CT vs Ultrasound
  { id: 'PROC-15', idx1: 5, idx2: 10, type: 'skin-procedures', expected: 'MEDIUM' } // Skin biopsy vs Skin lesion excision
];

// ============================================================================
// INTERFACES
// ============================================================================

interface MedicalEntity {
  id: string;
  code_system: string;
  code_value: string;
  display_name: string;
  normalized_embedding_text: string;
  entity_type: string;
  original_text: string;
  normalized_text: string;
  core_text: string;
}

interface EmbeddingCache {
  model: string;
  strategy: Strategy;
  embeddings: {
    [entityId: string]: number[];
  };
}

interface SimilarityResult {
  pair_id: string;
  model: string;
  strategy: Strategy;
  entity1: string;
  entity2: string;
  similarity: number;
  pair_type: string;
  expected: string;
  entity_type: 'medication' | 'procedure';
}

// ============================================================================
// TEXT EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extract ingredient-only from medication display name
 */
function extractIngredient(displayName: string): string {
  let ingredient = displayName;

  // Remove dose patterns
  ingredient = ingredient.replace(/\d+(?:\.\d+)?\s*(?:mg|g|ml|mcg|micrograms?|milligrams?)(?:\s*-\s*\d+(?:\.\d+)?\s*(?:mg|g|ml|mcg|micrograms?|milligrams?))?/gi, '');

  // Remove form patterns
  ingredient = ingredient.replace(/\b(tablet|capsule|injection|syrup|cream|ointment|oral liquid|suppository|pessary|powder|solution|suspension)\\b/gi, '');

  // Remove "containing", "with", etc.
  ingredient = ingredient.replace(/\b(containing|with)\b/gi, '');

  // Remove salt forms
  ingredient = ingredient.replace(/\(as [^)]+\)/gi, '');

  // Remove brand names in parentheses
  ingredient = ingredient.replace(/\([^)]+\)/g, '');

  // Clean up
  ingredient = ingredient.replace(/\s+/g, ' ').trim().toLowerCase();

  return ingredient;
}

/**
 * Extract core procedure concept (anatomy + procedure type)
 */
function extractProcedureCore(displayName: string): string {
  let core = displayName.toLowerCase();

  // Remove duration patterns
  core = core.replace(/\b(not more than|less than|at least)\s+\d+\s+(minutes?|hours?)\b/gi, '');

  // Remove setting/context patterns
  core = core.replace(/\b(professional attendance|at consulting rooms|in hospital|by a|of a)\b/gi, '');

  // Clean up
  core = core.replace(/\s+/g, ' ').trim();

  return core;
}

/**
 * Generate all 3 text versions for an entity
 */
function generateTextVersions(entity: any, entityType: 'medication' | 'procedure'): MedicalEntity {
  const original = entity.display_name;
  const normalized = entity.normalized_embedding_text || original.toLowerCase();
  const core = entityType === 'medication'
    ? extractIngredient(original)
    : extractProcedureCore(original);

  return {
    id: entity.id,
    code_system: entity.code_system,
    code_value: entity.code_value,
    display_name: original,
    normalized_embedding_text: entity.normalized_embedding_text,
    entity_type: entityType,
    original_text: original,
    normalized_text: normalized,
    core_text: core
  };
}

// ============================================================================
// DATA COLLECTION
// ============================================================================

async function fetchMedications(): Promise<MedicalEntity[]> {
  console.log('\nFetching 20 medications from database...');
  const { medications: entityList } = loadFinalEntities();
  const medications: MedicalEntity[] = [];

  for (const entity of entityList) {
    const { data, error } = await supabase
      .from('regional_medical_codes')
      .select('id, code_system, code_value, display_name, normalized_embedding_text')
      .eq('code_value', entity.code_value)
      .eq('code_system', 'pbs')
      .eq('country_code', 'AUS')
      .single();

    if (error || !data) {
      console.warn(`⚠️  Could not find medication: ${entity.entity_name} (${entity.code_value})`);
      continue;
    }

    medications.push(generateTextVersions(data, 'medication'));
    console.log(`  ✓ ${entity.entity_name}: ${data.display_name.substring(0, 60)}...`);
  }

  console.log(`\nFetched ${medications.length}/20 medications`);
  return medications;
}

async function fetchProcedures(): Promise<MedicalEntity[]> {
  console.log('\nFetching 20 procedures from database...');
  const { procedures: entityList } = loadFinalEntities();
  const procedures: MedicalEntity[] = [];

  for (const entity of entityList) {
    const { data, error } = await supabase
      .from('regional_medical_codes')
      .select('id, code_system, code_value, display_name, normalized_embedding_text')
      .eq('code_value', entity.code_value)
      .eq('code_system', 'mbs')
      .eq('country_code', 'AUS')
      .single();

    if (error || !data) {
      console.warn(`⚠️  Could not find procedure: ${entity.entity_name} (${entity.code_value})`);
      continue;
    }

    procedures.push(generateTextVersions(data, 'procedure'));
    console.log(`  ✓ ${entity.entity_name}: ${data.display_name.substring(0, 60)}...`);
  }

  console.log(`\nFetched ${procedures.length}/20 procedures`);
  return procedures;
}

// ============================================================================
// EMBEDDING GENERATION
// ============================================================================

/**
 * Generate OpenAI embedding
 */
async function generateOpenAIEmbedding(text: string, attempt: number = 1): Promise<number[] | null> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 768
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error(`OpenAI API error (attempt ${attempt}):`, error);
    if (attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return generateOpenAIEmbedding(text, attempt + 1);
    }
    return null;
  }
}

/**
 * Generate HuggingFace embedding (with mean pooling)
 */
async function generateHuggingFaceEmbedding(
  text: string,
  modelId: string,
  attempt: number = 1
): Promise<number[] | null> {
  try {
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${modelId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: text,
          options: { wait_for_model: true }
        })
      }
    );

    if (response.status === 503) {
      console.log(`  ⏳ Model loading, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      if (attempt < 3) {
        return generateHuggingFaceEmbedding(text, modelId, attempt + 1);
      }
      return null;
    }

    if (response.status === 429) {
      console.log(`  ⚠️  Rate limit, waiting 60s...`);
      await new Promise(resolve => setTimeout(resolve, 60000));
      if (attempt < 2) {
        return generateHuggingFaceEmbedding(text, modelId, attempt + 1);
      }
      return null;
    }

    if (!response.ok) {
      const error = await response.text();
      console.error(`HuggingFace API error: ${error}`);
      return null;
    }

    const data = await response.json();

    // Handle response format (may need mean pooling)
    let embedding: number[];

    if (Array.isArray(data)) {
      if (Array.isArray(data[0]) && Array.isArray(data[0][0])) {
        // 3D array: sentence-transformers with array input
        embedding = data[0];
      } else if (Array.isArray(data[0])) {
        // 2D array: could be token embeddings OR single sentence embedding
        if (data[0].length === 768) {
          // Single sentence embedding
          embedding = data[0];
        } else {
          // Token embeddings - apply mean pooling
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
        }
      } else {
        // 1D array: already pooled
        embedding = data;
      }
    } else {
      console.error('Unexpected response format');
      return null;
    }

    if (embedding.length !== 768) {
      console.error(`Invalid dimensions: ${embedding.length}`);
      return null;
    }

    return embedding;
  } catch (error) {
    console.error(`HuggingFace API exception:`, error);
    if (attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return generateHuggingFaceEmbedding(text, modelId, attempt + 1);
    }
    return null;
  }
}

/**
 * Generate embeddings for all entities using specified model and strategy
 */
async function generateEmbeddings(
  entities: MedicalEntity[],
  modelKey: string,
  strategy: Strategy
): Promise<EmbeddingCache> {
  const model = MODELS[modelKey as keyof typeof MODELS];
  const cacheFile = path.join(EXPERIMENT_DIR, `embeddings_${modelKey}_${strategy}.json`);

  // Check cache
  if (fs.existsSync(cacheFile)) {
    console.log(`  ✓ Loading from cache: ${cacheFile}`);
    return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
  }

  console.log(`\nGenerating ${model.name} embeddings (${strategy} strategy)...`);

  const cache: EmbeddingCache = {
    model: modelKey,
    strategy,
    embeddings: {}
  };

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const text = strategy === 'original' ? entity.original_text
               : strategy === 'normalized' ? entity.normalized_text
               : entity.core_text;

    console.log(`  [${i + 1}/${entities.length}] Embedding: "${text.substring(0, 40)}..."`);

    let embedding: number[] | null;

    if (model.type === 'openai') {
      embedding = await generateOpenAIEmbedding(text);
    } else {
      embedding = await generateHuggingFaceEmbedding(text, model.id);
      // Small delay between HuggingFace requests
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    if (embedding) {
      cache.embeddings[entity.id] = embedding;
      succeeded++;
    } else {
      console.error(`  ❌ Failed to generate embedding`);
      failed++;
    }
  }

  console.log(`  ✓ Complete: ${succeeded} succeeded, ${failed} failed`);

  // Save cache
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  console.log(`  ✓ Saved to: ${cacheFile}`);

  return cache;
}

// ============================================================================
// SIMILARITY CALCULATION
// ============================================================================

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
 * Calculate similarities for all defined pairs
 */
async function calculateSimilarities(
  medications: MedicalEntity[],
  procedures: MedicalEntity[],
  embeddingCaches: { [key: string]: EmbeddingCache }
): Promise<SimilarityResult[]> {
  console.log('\nCalculating pairwise similarities...');

  const results: SimilarityResult[] = [];

  // Medication pairs
  for (const pair of MEDICATION_PAIRS) {
    const entity1 = medications[pair.idx1];
    const entity2 = medications[pair.idx2];

    if (!entity1 || !entity2) continue;

    for (const modelKey of Object.keys(MODELS)) {
      for (const strategy of STRATEGIES) {
        const cacheKey = `${modelKey}_${strategy}`;
        const cache = embeddingCaches[cacheKey];

        if (!cache) continue;

        const emb1 = cache.embeddings[entity1.id];
        const emb2 = cache.embeddings[entity2.id];

        if (!emb1 || !emb2) continue;

        const similarity = cosineSimilarity(emb1, emb2);

        results.push({
          pair_id: pair.id,
          model: modelKey,
          strategy,
          entity1: entity1.display_name,
          entity2: entity2.display_name,
          similarity,
          pair_type: pair.type,
          expected: pair.expected,
          entity_type: 'medication'
        });
      }
    }
  }

  // Procedure pairs
  for (const pair of PROCEDURE_PAIRS) {
    const entity1 = procedures[pair.idx1];
    const entity2 = procedures[pair.idx2];

    if (!entity1 || !entity2) continue;

    for (const modelKey of Object.keys(MODELS)) {
      for (const strategy of STRATEGIES) {
        const cacheKey = `${modelKey}_${strategy}`;
        const cache = embeddingCaches[cacheKey];

        if (!cache) continue;

        const emb1 = cache.embeddings[entity1.id];
        const emb2 = cache.embeddings[entity2.id];

        if (!emb1 || !emb2) continue;

        const similarity = cosineSimilarity(emb1, emb2);

        results.push({
          pair_id: pair.id,
          model: modelKey,
          strategy,
          entity1: entity1.display_name.substring(0, 40),
          entity2: entity2.display_name.substring(0, 40),
          similarity,
          pair_type: pair.type,
          expected: pair.expected,
          entity_type: 'procedure'
        });
      }
    }
  }

  console.log(`✓ Calculated ${results.length} similarity scores`);

  // Save results
  const resultsFile = path.join(EXPERIMENT_DIR, 'similarity_results.json');
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`✓ Saved to: ${resultsFile}`);

  return results;
}

// ============================================================================
// ANALYSIS & REPORTING
// ============================================================================

/**
 * Generate comparison tables and analysis
 */
function generateAnalysis(results: SimilarityResult[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('EXPERIMENT 2 RESULTS');
  console.log('='.repeat(80));
  console.log('');

  // Group by model and strategy
  const grouped: { [key: string]: SimilarityResult[] } = {};

  for (const result of results) {
    const key = `${result.model}_${result.strategy}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(result);
  }

  // Calculate average similarities by model/strategy
  console.log('AVERAGE SIMILARITY SCORES (Lower = Better Differentiation)');
  console.log('');
  console.log('| Model | Strategy | Medications | Procedures | Overall |');
  console.log('|-------|----------|-------------|------------|---------|');

  const summaries: { [key: string]: { meds: number; procs: number; overall: number } } = {};

  for (const [key, items] of Object.entries(grouped)) {
    const meds = items.filter(r => r.entity_type === 'medication');
    const procs = items.filter(r => r.entity_type === 'procedure');

    const avgMeds = meds.length > 0 ? meds.reduce((sum, r) => sum + r.similarity, 0) / meds.length : 0;
    const avgProcs = procs.length > 0 ? procs.reduce((sum, r) => sum + r.similarity, 0) / procs.length : 0;
    const avgOverall = items.length > 0 ? items.reduce((sum, r) => sum + r.similarity, 0) / items.length : 0;

    summaries[key] = { meds: avgMeds, procs: avgProcs, overall: avgOverall };

    const [model, strategy] = key.split('_');
    console.log(`| ${model.padEnd(20)} | ${strategy.padEnd(10)} | ${(avgMeds * 100).toFixed(1)}% | ${(avgProcs * 100).toFixed(1)}% | ${(avgOverall * 100).toFixed(1)}% |`);
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('RECOMMENDATION');
  console.log('='.repeat(80));
  console.log('');

  // Find best combination (lowest overall similarity)
  let bestKey = '';
  let bestScore = 1.0;

  for (const [key, summary] of Object.entries(summaries)) {
    if (summary.overall < bestScore) {
      bestScore = summary.overall;
      bestKey = key;
    }
  }

  const [bestModel, bestStrategy] = bestKey.split('_');
  console.log(`Best Model: ${MODELS[bestModel as keyof typeof MODELS].name}`);
  console.log(`Best Strategy: ${bestStrategy}`);
  console.log(`Overall Similarity: ${(bestScore * 100).toFixed(1)}%`);
  console.log('');

  // Compare against OpenAI baseline
  const baselineKey = 'openai_core';
  if (summaries[baselineKey]) {
    const improvement = (summaries[baselineKey].overall - bestScore) * 100;
    console.log(`Improvement over OpenAI baseline: ${improvement.toFixed(1)} points`);
  }

  console.log('='.repeat(80));

  // Save analysis to file
  const analysisFile = path.join(EXPERIMENT_DIR, 'analysis.md');
  const analysisContent = `# Experiment 2 Analysis\n\nGenerated: ${new Date().toISOString()}\n\n## Summary\n\nBest combination: ${MODELS[bestModel as keyof typeof MODELS].name} with ${bestStrategy} strategy\nOverall similarity: ${(bestScore * 100).toFixed(1)}%\n`;

  fs.writeFileSync(analysisFile, analysisContent);
  console.log(`\n✓ Analysis saved to: ${analysisFile}`);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('='.repeat(80));
  console.log('EXPERIMENT 2: COMPREHENSIVE MEDICAL EMBEDDING MODEL COMPARISON');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Experiment directory: ${EXPERIMENT_DIR}`);
  console.log('');

  // Phase 1: Data Collection
  console.log('PHASE 1: DATA COLLECTION');
  console.log('-'.repeat(80));

  const medications = await fetchMedications();
  const procedures = await fetchProcedures();

  if (medications.length < 15 || procedures.length < 15) {
    console.error('❌ Insufficient data fetched, aborting');
    process.exit(1);
  }

  // Save samples
  const samplesFile = path.join(EXPERIMENT_DIR, 'samples.json');
  fs.writeFileSync(samplesFile, JSON.stringify({ medications, procedures }, null, 2));
  console.log(`\n✓ Samples saved to: ${samplesFile}`);

  // Phase 2: Embedding Generation
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 2: EMBEDDING GENERATION');
  console.log('-'.repeat(80));

  const embeddingCaches: { [key: string]: EmbeddingCache } = {};

  for (const modelKey of Object.keys(MODELS)) {
    for (const strategy of STRATEGIES) {
      const allEntities = [...medications, ...procedures];
      const cache = await generateEmbeddings(allEntities, modelKey, strategy);
      embeddingCaches[`${modelKey}_${strategy}`] = cache;
    }
  }

  // Phase 3: Similarity Calculation
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 3: SIMILARITY CALCULATION');
  console.log('-'.repeat(80));

  const results = await calculateSimilarities(medications, procedures, embeddingCaches);

  // Phase 4: Analysis
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 4: ANALYSIS & REPORTING');
  console.log('-'.repeat(80));

  generateAnalysis(results);

  console.log('\n' + '='.repeat(80));
  console.log('EXPERIMENT 2 COMPLETE');
  console.log('='.repeat(80));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
