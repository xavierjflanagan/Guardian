# Pass 1.5 SapBERT Implementation Plan

**Date:** 2025-10-21
**Based on:** Experiment 2 Results (COMPREHENSIVE_ANALYSIS.md)
**Decision:** Dual-model embedding strategy - SapBERT for medications, OpenAI for procedures

---

## Executive Summary

Implement dual-model embedding strategy based on Experiment 2 findings:
- **Medications (PBS):** SapBERT embeddings (33.2% avg similarity - 9.1pp better than OpenAI)
- **Procedures (MBS):** OpenAI embeddings (current implementation, no changes needed)

**Key Statistics:**
- PBS medications: 14,382 codes
- MBS procedures: 6,001 codes
- Expected cache hit rate: 85-90%
- Average latency: <80ms per medication

---

## A) Database Migration Design

### Migration 31: Dual Embedding Architecture

**Objective:** Add SapBERT embedding support while maintaining OpenAI embeddings for comparison and fallback.

**Migration File:** `2025-10-21_31_sapbert_embedding_support.sql`

```sql
-- ============================================================================
-- Migration: Add SapBERT Embedding Support for PBS Medications
-- Date: 2025-10-21
-- Issue: Implement dual-model embedding strategy based on Experiment 2
--
-- PROBLEM: OpenAI embeddings show 50.5% avg similarity for medications
-- SOLUTION: Add SapBERT embeddings (33.2% avg similarity - 17.3pp better)
-- AFFECTED TABLES: regional_medical_codes
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [ ] current_schema/03_clinical_core.sql (regional_medical_codes table)
--
-- DOWNSTREAM UPDATES:
--   [ ] TypeScript types updated (if applicable)
-- ============================================================================

-- 1. Add SapBERT embedding column
ALTER TABLE regional_medical_codes
ADD COLUMN IF NOT EXISTS sapbert_embedding vector(768);

-- 2. Add metadata columns for embedding tracking
ALTER TABLE regional_medical_codes
ADD COLUMN IF NOT EXISTS sapbert_embedding_generated_at timestamptz,
ADD COLUMN IF NOT EXISTS active_embedding_model varchar(20) DEFAULT 'openai';

-- Add check constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'regional_medical_codes_active_embedding_model_check'
  ) THEN
    ALTER TABLE regional_medical_codes
    ADD CONSTRAINT regional_medical_codes_active_embedding_model_check
    CHECK (active_embedding_model IN ('openai', 'sapbert'));
  END IF;
END $$;

-- 3. Create index for SapBERT vector search (medications only)
CREATE INDEX IF NOT EXISTS idx_regional_medical_codes_sapbert_embedding_pbs
ON regional_medical_codes
USING ivfflat (sapbert_embedding vector_cosine_ops)
WHERE code_system = 'pbs' AND country_code = 'AUS';

-- 4. Update active_embedding_model for medications
UPDATE regional_medical_codes
SET active_embedding_model = 'sapbert'
WHERE code_system = 'pbs';

-- 5. Add performance tracking table
CREATE TABLE IF NOT EXISTS embedding_performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name varchar(50) NOT NULL,
  code_system varchar(10) NOT NULL,
  batch_size integer,
  generation_time_ms integer,
  cache_hit_rate decimal(5,2),
  created_at timestamptz DEFAULT now()
);

-- 6. Enable RLS
ALTER TABLE embedding_performance_metrics ENABLE ROW LEVEL SECURITY;

-- Service role only policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'embedding_performance_metrics'
    AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access"
    ON embedding_performance_metrics
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- Verification Query
SELECT
  code_system,
  active_embedding_model,
  COUNT(*) as count,
  COUNT(sapbert_embedding) as sapbert_count,
  COUNT(embedding) as openai_count
FROM regional_medical_codes
WHERE country_code = 'AUS'
GROUP BY code_system, active_embedding_model;
```

**Migration Impact:**
- **Storage increase:** ~43MB for 14K PBS medications (768 dimensions × 4 bytes)
- **Index size:** ~60-80MB for IVFFlat index
- **Downtime:** Zero (column addition is non-blocking)
- **Backwards compatibility:** Existing OpenAI embeddings remain functional

---

## B) Entity Type Routing & Pipeline Architecture

### Pass 1 → Pass 1.5 Flow

```typescript
// Current state from Pass 1
interface DetectedEntity {
  entity_type: 'medication' | 'procedure' | 'condition' | 'test';
  extracted_text: string;
  confidence: number;
  // ... other fields
}

// New Pass 1.5 routing logic
class EmbeddingRouter {
  async routeEntityForEmbedding(entity: DetectedEntity): Promise<EmbeddingPipeline> {
    switch (entity.entity_type) {
      case 'medication':
        return this.sapbertPipeline;

      case 'procedure':
        return this.openaiPipeline;

      case 'condition':
      case 'test':
      default:
        // Default to OpenAI for non-medication entities
        return this.openaiPipeline;
    }
  }
}
```

### Updated RPC Function: `search_regional_codes_v2`

**Location:** Create new migration or update existing function

```sql
-- New version with model-aware search
CREATE OR REPLACE FUNCTION search_regional_codes_v2(
  p_query_embedding vector(768),
  p_entity_type text,
  p_code_system text,
  p_country_code text DEFAULT 'AUS',
  p_limit integer DEFAULT 5,
  p_similarity_threshold float DEFAULT 0.7
)
RETURNS TABLE (
  id uuid,
  code_system varchar,
  code_value text,
  display_name text,
  normalized_embedding_text text,
  similarity_score float
) AS $$
BEGIN
  -- Route to appropriate embedding column based on entity type
  IF p_entity_type = 'medication' AND p_code_system = 'pbs' THEN
    -- Use SapBERT embeddings for medications
    RETURN QUERY
    SELECT
      rmc.id,
      rmc.code_system,
      rmc.code_value,
      rmc.display_name,
      rmc.normalized_embedding_text,
      1 - (rmc.sapbert_embedding <=> p_query_embedding) as similarity_score
    FROM regional_medical_codes rmc
    WHERE rmc.code_system = p_code_system
      AND rmc.country_code = p_country_code
      AND rmc.sapbert_embedding IS NOT NULL
      AND (1 - (rmc.sapbert_embedding <=> p_query_embedding)) >= p_similarity_threshold
    ORDER BY rmc.sapbert_embedding <=> p_query_embedding
    LIMIT p_limit;
  ELSE
    -- Use OpenAI embeddings for procedures and other entities
    RETURN QUERY
    SELECT
      rmc.id,
      rmc.code_system,
      rmc.code_value,
      rmc.display_name,
      rmc.normalized_embedding_text,
      1 - (rmc.embedding <=> p_query_embedding) as similarity_score
    FROM regional_medical_codes rmc
    WHERE rmc.code_system = p_code_system
      AND rmc.country_code = p_country_code
      AND rmc.embedding IS NOT NULL
      AND (1 - (rmc.embedding <=> p_query_embedding)) >= p_similarity_threshold
    ORDER BY rmc.embedding <=> p_query_embedding
    LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

### Worker Code Updates

**Location:** `apps/render-worker/src/pass15/`

#### 1. `pass15-embedding-service.ts` (NEW)

```typescript
import { HfInference } from '@huggingface/inference';
import OpenAI from 'openai';

interface EmbeddingConfig {
  model: 'openai' | 'sapbert';
  modelPath?: string;
  apiKey?: string;
}

class Pass15EmbeddingService {
  private openaiClient: OpenAI;
  private hfClient: HfInference;
  private embeddingCache: Map<string, number[]>;

  constructor() {
    this.openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.hfClient = new HfInference(process.env.HUGGINGFACE_API_KEY);
    this.embeddingCache = new Map();
  }

  async generateEmbedding(
    text: string,
    config: EmbeddingConfig
  ): Promise<number[]> {
    // Check cache first
    const cacheKey = `${config.model}:${text}`;
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    let embedding: number[];

    if (config.model === 'sapbert') {
      embedding = await this.generateSapBERTEmbedding(text);
    } else {
      embedding = await this.generateOpenAIEmbedding(text);
    }

    // Cache result
    this.embeddingCache.set(cacheKey, embedding);
    return embedding;
  }

  private async generateSapBERTEmbedding(text: string): Promise<number[]> {
    const response = await this.hfClient.featureExtraction({
      model: 'cambridgeltl/SapBERT-from-PubMedBERT-fulltext',
      inputs: text,
    });

    // HuggingFace returns 2D array for token-level embeddings
    // Apply mean pooling to get sentence embedding
    const embedding = this.meanPooling(response as number[][]);
    return embedding;
  }

  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    const response = await this.openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 768,
    });
    return response.data[0].embedding;
  }

  private meanPooling(tokenEmbeddings: number[][]): number[] {
    const numTokens = tokenEmbeddings.length;
    const embeddingDim = tokenEmbeddings[0].length;
    const pooled = new Array(embeddingDim).fill(0);

    for (let i = 0; i < numTokens; i++) {
      for (let j = 0; j < embeddingDim; j++) {
        pooled[j] += tokenEmbeddings[i][j];
      }
    }

    return pooled.map(val => val / numTokens);
  }

  async batchGenerateSapBERT(texts: string[]): Promise<number[][]> {
    // HuggingFace Inference API supports batch processing
    const embeddings: number[][] = [];

    // Process in chunks of 10 to avoid timeout
    const chunkSize = 10;
    for (let i = 0; i < texts.length; i += chunkSize) {
      const chunk = texts.slice(i, i + chunkSize);

      const chunkEmbeddings = await Promise.all(
        chunk.map(text => this.generateSapBERTEmbedding(text))
      );

      embeddings.push(...chunkEmbeddings);
    }

    return embeddings;
  }
}

export default new Pass15EmbeddingService();
```

---

## C) SapBERT Embedding System Implementation

### Phase 1: Batch Processing (PBS Medical Code Library)

**Script:** `apps/render-worker/src/pass15/batch-generate-sapbert-embeddings.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import Pass15EmbeddingService from './pass15-embedding-service';
import * as fs from 'fs';
import * as path from 'path';

interface MedicationRecord {
  id: string;
  code_value: string;
  normalized_embedding_text: string;
}

interface BatchProgress {
  totalProcessed: number;
  successfulEmbeddings: number;
  failedEmbeddings: number;
  lastProcessedId: string | null;
  failedIds: string[];
}

class SapBERTBatchProcessor {
  private supabase;
  private batchSize = 100;
  private maxConcurrent = 5;
  private progressFile = './sapbert-batch-progress.json';
  private failureRetryLimit = 3;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  async processPBSLibrary() {
    console.log('Starting PBS library SapBERT embedding generation...');
    const startTime = Date.now();

    // Load or initialize progress
    const progress = this.loadProgress();

    // 1. Fetch all PBS medications without SapBERT embeddings
    let query = this.supabase
      .from('regional_medical_codes')
      .select('id, code_value, normalized_embedding_text')
      .eq('code_system', 'pbs')
      .eq('country_code', 'AUS')
      .is('sapbert_embedding', null)
      .order('id');

    // Resume from last processed if applicable
    if (progress.lastProcessedId) {
      console.log(`Resuming from ID: ${progress.lastProcessedId}`);
      query = query.gt('id', progress.lastProcessedId);
    }

    const { data: medications, error } = await query;

    if (error) throw error;

    console.log(`Found ${medications.length} medications to process`);
    console.log(`Previously processed: ${progress.totalProcessed}`);

    // 2. Process in batches with fault tolerance
    let processed = 0;
    for (let i = 0; i < medications.length; i += this.batchSize) {
      const batch = medications.slice(i, i + this.batchSize);

      console.log(`Processing batch ${i / this.batchSize + 1}/${Math.ceil(medications.length / this.batchSize)}`);

      try {
        await this.processBatchWithRetry(batch, progress);
        processed += batch.length;

        // Update progress after each batch
        progress.lastProcessedId = batch[batch.length - 1].id;
        this.saveProgress(progress);

        console.log(`Progress: ${processed}/${medications.length} (${((processed / medications.length) * 100).toFixed(1)}%)`);
      } catch (error) {
        console.error(`Batch failed after retries:`, error);
        // Save progress and continue to next batch
        this.saveProgress(progress);
        console.log('Continuing to next batch...');
      }

      // Small delay to avoid rate limiting
      await this.sleep(100);
    }

    const duration = Date.now() - startTime;
    console.log(`✓ Completed in ${(duration / 1000 / 60).toFixed(2)} minutes`);
    console.log(`Total processed: ${progress.totalProcessed}`);
    console.log(`Successful: ${progress.successfulEmbeddings}`);
    console.log(`Failed: ${progress.failedEmbeddings}`);

    if (progress.failedIds.length > 0) {
      console.log(`Failed IDs (will retry):`, progress.failedIds);
    }

    // 3. Log performance metrics
    await this.logPerformanceMetrics(progress.successfulEmbeddings, duration);

    // Clean up progress file on success
    if (progress.failedEmbeddings === 0) {
      this.clearProgress();
    }
  }

  private async processBatchWithRetry(
    medications: MedicationRecord[],
    progress: BatchProgress,
    attempt: number = 1
  ): Promise<void> {
    const batchStartTime = Date.now();

    try {
      // Generate embeddings for all medications in batch
      const texts = medications.map(m => m.normalized_embedding_text);
      const embeddings = await Pass15EmbeddingService.batchGenerateSapBERT(texts);

      // Update database
      const updates = medications.map((med, idx) => ({
        id: med.id,
        sapbert_embedding: embeddings[idx],
        sapbert_embedding_generated_at: new Date().toISOString(),
      }));

      // Batch upsert
      const { error } = await this.supabase
        .from('regional_medical_codes')
        .upsert(updates);

      if (error) {
        throw error;
      }

      // Update progress
      progress.totalProcessed += medications.length;
      progress.successfulEmbeddings += medications.length;

      const batchDuration = Date.now() - batchStartTime;
      console.log(`  Batch processed in ${batchDuration}ms (${(batchDuration / medications.length).toFixed(0)}ms per medication)`);

    } catch (error) {
      if (attempt < this.failureRetryLimit) {
        console.warn(`  Batch failed (attempt ${attempt}/${this.failureRetryLimit}), retrying...`);
        await this.sleep(1000 * attempt); // Exponential backoff
        return this.processBatchWithRetry(medications, progress, attempt + 1);
      } else {
        console.error(`  Batch failed after ${this.failureRetryLimit} attempts:`, error);

        // Mark individual items as failed
        medications.forEach(med => {
          if (!progress.failedIds.includes(med.id)) {
            progress.failedIds.push(med.id);
            progress.failedEmbeddings++;
          }
        });

        throw error;
      }
    }
  }

  private loadProgress(): BatchProgress {
    try {
      if (fs.existsSync(this.progressFile)) {
        const data = fs.readFileSync(this.progressFile, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('Could not load progress file, starting fresh');
    }

    return {
      totalProcessed: 0,
      successfulEmbeddings: 0,
      failedEmbeddings: 0,
      lastProcessedId: null,
      failedIds: [],
    };
  }

  private saveProgress(progress: BatchProgress): void {
    try {
      fs.writeFileSync(
        this.progressFile,
        JSON.stringify(progress, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Could not save progress file:', error);
    }
  }

  private clearProgress(): void {
    try {
      if (fs.existsSync(this.progressFile)) {
        fs.unlinkSync(this.progressFile);
        console.log('Progress file cleared');
      }
    } catch (error) {
      console.warn('Could not clear progress file:', error);
    }
  }

  private async logPerformanceMetrics(totalProcessed: number, durationMs: number) {
    await this.supabase
      .from('embedding_performance_metrics')
      .insert({
        model_name: 'sapbert',
        code_system: 'pbs',
        batch_size: totalProcessed,
        generation_time_ms: durationMs,
        cache_hit_rate: 0, // Initial batch has no cache
      });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Execute if run directly
if (require.main === module) {
  const processor = new SapBERTBatchProcessor();
  processor.processPBSLibrary()
    .then(() => {
      console.log('✓ Batch processing complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
```

**Execution Plan:**
```bash
# One-time PBS library processing
npx tsx apps/render-worker/src/pass15/batch-generate-sapbert-embeddings.ts

# Expected performance (updated for 14K medications):
# - Total medications: 14,382
# - Batch size: 100
# - Total batches: 144
# - Time per batch: ~500ms
# - Total time: ~72 seconds (1.2 minutes)
# - Can resume if interrupted via progress file
```

### Fault Tolerance Features

1. **Progress Tracking:** Saves progress after each batch to `sapbert-batch-progress.json`
2. **Resume Capability:** Automatically resumes from last successful batch
3. **Retry Logic:** 3 attempts per batch with exponential backoff
4. **Failed ID Tracking:** Records IDs that fail after all retries
5. **Graceful Degradation:** Continues processing even if individual batches fail

---

### Phase 2: Real-Time Processing (Pass 1 → Pass 1.5)

**Script:** `apps/render-worker/src/pass15/real-time-embedding-handler.ts`

```typescript
import Pass15EmbeddingService from './pass15-embedding-service';
import { createClient } from '@supabase/supabase-js';

interface Pass1Entity {
  entity_id: string;
  entity_type: 'medication' | 'procedure';
  extracted_text: string;
  normalized_text: string;
}

class RealTimeEmbeddingHandler {
  private supabase;
  private embeddingCache: Map<string, number[]>;
  private cacheStats = { hits: 0, misses: 0 };

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    this.embeddingCache = new Map();
    this.initializeCacheFromDatabase();
  }

  private async initializeCacheFromDatabase() {
    console.log('Loading PBS medication embeddings into cache...');

    // Load all pre-computed PBS embeddings into memory
    const { data: medications } = await this.supabase
      .from('regional_medical_codes')
      .select('normalized_embedding_text, sapbert_embedding')
      .eq('code_system', 'pbs')
      .not('sapbert_embedding', 'is', null);

    medications?.forEach(med => {
      this.embeddingCache.set(
        this.normalizeCacheKey(med.normalized_embedding_text),
        med.sapbert_embedding
      );
    });

    console.log(`✓ Loaded ${medications?.length} medication embeddings into cache`);
    console.log(`  Cache size: ~${((medications?.length || 0) * 768 * 4 / 1024 / 1024).toFixed(2)}MB`);
  }

  async processEntity(entity: Pass1Entity): Promise<number[]> {
    if (entity.entity_type === 'medication') {
      return this.processMedication(entity);
    } else {
      return this.processProcedure(entity);
    }
  }

  private async processMedication(entity: Pass1Entity): Promise<number[]> {
    const cacheKey = this.normalizeCacheKey(entity.normalized_text);

    // Check cache first (PBS pre-computed embeddings)
    if (this.embeddingCache.has(cacheKey)) {
      this.cacheStats.hits++;
      return this.embeddingCache.get(cacheKey)!;
    }

    // Cache miss - generate new embedding via API
    this.cacheStats.misses++;
    console.log(`Cache miss for medication: ${entity.extracted_text}`);

    const startTime = Date.now();

    try {
      const embedding = await Pass15EmbeddingService.generateEmbedding(
        entity.normalized_text,
        { model: 'sapbert' }
      );
      const duration = Date.now() - startTime;

      console.log(`Generated SapBERT embedding in ${duration}ms`);

      // Update cache
      this.embeddingCache.set(cacheKey, embedding);

      return embedding;

    } catch (error) {
      console.error('SapBERT API failed, falling back to OpenAI:', error);

      // Fallback to OpenAI
      const fallbackEmbedding = await Pass15EmbeddingService.generateEmbedding(
        entity.normalized_text,
        { model: 'openai' }
      );

      return fallbackEmbedding;
    }
  }

  private async processProcedure(entity: Pass1Entity): Promise<number[]> {
    // Procedures use existing OpenAI pipeline
    const embedding = await Pass15EmbeddingService.generateEmbedding(
      entity.normalized_text,
      { model: 'openai' }
    );

    return embedding;
  }

  private normalizeCacheKey(text: string): string {
    return text.toLowerCase().trim();
  }

  getCacheStats() {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = total > 0 ? (this.cacheStats.hits / total) * 100 : 0;

    return {
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      hitRate: hitRate.toFixed(2) + '%',
    };
  }
}

export default new RealTimeEmbeddingHandler();
```

---

### Phase 3: HuggingFace Integration & Configuration

**Environment Variables:**

```bash
# .env (Render.com worker)
HUGGINGFACE_API_KEY=hf_xxxxxxxxxxxxxxxxxxxxx

# Model configuration
SAPBERT_MODEL=cambridgeltl/SapBERT-from-PubMedBERT-fulltext
SAPBERT_MAX_LENGTH=512
SAPBERT_BATCH_SIZE=10

# Performance tuning
EMBEDDING_CACHE_SIZE=50000  # ~200MB in memory
EMBEDDING_CACHE_TTL=86400   # 24 hours
```

**Package Dependencies:**

```json
// package.json (apps/render-worker)
{
  "dependencies": {
    "@huggingface/inference": "^2.7.0",
    "openai": "^4.20.0"
  }
}
```

**HuggingFace API Options:**

1. **Free Tier (Current):**
   - Rate limit: 1000 requests/hour
   - Latency: 200-500ms per request
   - Cost: $0
   - Suitable for: Testing, low volume (<1000 medications/day)

2. **Inference Endpoints (Future Scale):**
   - Dedicated endpoint: $0.06/hour (~$43/month)
   - Latency: 80-150ms per request
   - No rate limits
   - Suitable for: Production, high volume (>5000 medications/day)

3. **Self-Hosted (Future at Scale):**
   - GPU instance: $100-300/month
   - Latency: 20-50ms
   - Full control
   - Suitable for: Very high volume (>50,000 medications/day)

---

## Performance Expectations

### Batch Processing (PBS Library)

| Metric | Value |
|--------|-------|
| Total medications | 14,382 |
| Batch size | 100 |
| Total batches | 144 |
| Time per batch | ~500ms |
| **Total time** | **~72 seconds (1.2 minutes)** |
| Storage required | 43MB (embeddings) + 60MB (index) |

### Real-Time Processing (Pass 1 → Pass 1.5)

| Scenario | Cache Hit | Cache Miss | Expected Rate |
|----------|-----------|------------|---------------|
| Common medication (Paracetamol) | <1ms | - | 90% of cases |
| PBS medication (in cache) | <1ms | - | 85% of cases |
| Novel medication (API call) | - | 300-500ms | 15% of cases |
| **Average latency** | **~50ms** | **~350ms** | **Overall: ~80ms** |

### Cache Performance Projections

```
Assumptions:
- 14K PBS medications pre-cached
- 80% of clinical entities are common medications
- 15% are PBS medications not in top common list
- 5% are novel/misspelled medications

Expected cache hit rate: 85-90%
Average processing time per document (10 medications): 80ms
Cache memory usage: ~150MB
```

---

## Implementation Roadmap

### Week 1: Database & Infrastructure
- [ ] Execute Migration 31 (sapbert_embedding column) - following two-touchpoint protocol
- [ ] Update `search_regional_codes_v2` RPC function
- [ ] Verify indexes created successfully
- [ ] Set up HuggingFace API key in Render.com

### Week 2: Batch Processing
- [ ] Install @huggingface/inference package
- [ ] Implement batch processing script with fault tolerance
- [ ] Execute batch processing for 14K PBS codes
- [ ] Validate embeddings quality (spot checks against Experiment 2)
- [ ] Measure and log performance metrics

### Week 3: Real-Time Integration
- [ ] Implement real-time embedding handler
- [ ] Update Pass 1.5 worker to route based on entity_type
- [ ] Implement cache initialization from database
- [ ] Test with sample medications from Pass 1

### Week 4: Testing & Optimization
- [ ] End-to-end testing with real documents
- [ ] Monitor cache hit rates
- [ ] Optimize batch sizes if needed
- [ ] Document performance benchmarks

---

## Monitoring & Observability

```typescript
// Metrics to track
interface EmbeddingMetrics {
  // Performance
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;

  // Cache efficiency
  cacheHitRate: number;
  cacheMisses: number;

  // Volume
  medicationsProcessed: number;
  proceduresProcessed: number;

  // Model breakdown
  sapbertCalls: number;
  openaiCalls: number;

  // Errors
  embeddingFailures: number;
  apiErrors: number;
}
```

**Dashboard queries:**

```sql
-- Cache hit rate (last 24 hours)
SELECT
  code_system,
  model_name,
  AVG(cache_hit_rate) as avg_hit_rate,
  COUNT(*) as total_batches
FROM embedding_performance_metrics
WHERE created_at > now() - interval '24 hours'
GROUP BY code_system, model_name;

-- Average generation time
SELECT
  model_name,
  AVG(generation_time_ms / batch_size) as avg_ms_per_item,
  MAX(generation_time_ms / batch_size) as max_ms_per_item
FROM embedding_performance_metrics
GROUP BY model_name;
```

---

## Risk Mitigation

### Risk 1: HuggingFace API Rate Limits
**Mitigation:**
- Pre-compute all PBS codes (eliminates 85% of API calls)
- Implement exponential backoff retry logic
- Monitor quota usage
- Upgrade to Inference Endpoint if needed ($43/month)

### Risk 2: Embedding Quality Degradation
**Mitigation:**
- Keep OpenAI embeddings as fallback (dual storage)
- Monitor search quality metrics
- A/B test SapBERT vs OpenAI in production
- Easy rollback via `active_embedding_model` flag

### Risk 3: Cache Memory Usage
**Mitigation:**
- Monitor cache size (target: <200MB)
- Load only PBS codes into cache (14K items)
- Current projection: ~150MB (well within limits)

### Risk 4: Batch Processing Interruption
**Mitigation:**
- Progress tracking in JSON file
- Automatic resume capability
- Retry logic with exponential backoff
- Failed ID tracking for manual review
- Can safely restart without data loss

### Risk 5: Latency Spikes for Cache Misses
**Mitigation:**
- Background processing for non-urgent matches
- Show OpenAI results immediately, refine with SapBERT async
- Pre-warm cache on worker startup
- Fallback to OpenAI on SapBERT API failure

---

## Success Metrics

### Technical Metrics
- [ ] Cache hit rate: >85%
- [ ] Average latency: <100ms per medication
- [ ] P95 latency: <200ms
- [ ] API error rate: <0.1%
- [ ] Batch processing completion: 100% of PBS codes

### Business Metrics
- [ ] Medication matching accuracy: +9.1% improvement (from Experiment 2)
- [ ] False positive rate: <5%
- [ ] User-reported match quality: >90% satisfaction

---

## Decision Log

### 1. Dual Embedding Storage
**Decision:** Keep both OpenAI and SapBERT embeddings
**Rationale:** Easy rollback, A/B testing, fallback on API failures
**Cost:** 2x storage (~103MB vs 43MB) - acceptable trade-off

### 2. Cache Strategy
**Decision:** Load all 14K PBS codes into memory on startup
**Rationale:** Maximum cache hit rate, simple logic, memory footprint acceptable (~150MB)

### 3. Fallback Strategy
**Decision:** Fall back to OpenAI on SapBERT API failure with warning log
**Rationale:** Ensures system availability, maintains user experience

### 4. Migration Timing
**Decision:** Execute migration following two-touchpoint protocol
**Rationale:** Follows established best practices, ensures proper review and documentation

---

## References

- Experiment 2 Results: `pass1.5-testing/experiment-2/COMPREHENSIVE_ANALYSIS.md`
- Migration Protocol: `migration_history/README.md`
- Current Schema: `current_schema/03_clinical_core.sql`
- SapBERT Model: https://huggingface.co/cambridgeltl/SapBERT-from-PubMedBERT-fulltext
