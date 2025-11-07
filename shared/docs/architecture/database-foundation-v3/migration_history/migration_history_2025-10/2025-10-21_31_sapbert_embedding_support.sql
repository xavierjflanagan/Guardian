-- ============================================================================
-- Migration: Add SapBERT Embedding Support for PBS Medications
-- Date: 2025-10-21
-- Issue: Implement dual-model embedding strategy based on Experiment 2 results
--
-- PROBLEM: OpenAI embeddings show 50.5% avg similarity for medications,
--          leading to suboptimal medication code matching and higher false positives
-- SOLUTION: Add SapBERT embeddings (33.2% avg similarity - 17.3pp better differentiation)
--           based on Experiment 2 comprehensive model comparison
-- AFFECTED TABLES: regional_medical_codes (3 new columns, 1 new index)
--                  embedding_performance_metrics (new table)
--
-- EXPERIMENT 2 FINDINGS:
--   - SapBERT normalized: 33.2% avg similarity (BEST for medications)
--   - OpenAI normalized: 50.5% avg similarity (current baseline)
--   - Improvement: 17.3 percentage points better differentiation
--   - Test data: 40 clinical entities (20 medications + 20 procedures)
--   - Reference: pass1.5-testing/experiment-2/COMPREHENSIVE_ANALYSIS.md
--
-- ARCHITECTURE DECISION:
--   - Dual embedding storage: Keep both OpenAI and SapBERT
--   - Medications (PBS): Use SapBERT embeddings (768 dimensions)
--   - Procedures (MBS): Continue using OpenAI embeddings (1536 dimensions)
--   - Enables: Easy rollback, A/B testing, API failure fallback
--
-- IMPORTANT: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
--            If your migration runner wraps DDL in transactions, split the index
--            creation into a separate migration or run manually.
--
-- EXECUTION STATUS: ✅ COMPLETED 2025-10-21
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [✅] current_schema/03_clinical_core.sql (Line 1350-1353: Added SapBERT columns)
--   [✅] current_schema/07_optimization.sql (Line 417-423: Added SapBERT index note)
--   [✅] current_schema/08_job_coordination.sql (Line 379-418: Added embedding_performance_metrics table)
--
-- DOWNSTREAM UPDATES:
--   [✅] TypeScript types: apps/render-worker/src/pass15/generate-sapbert-embeddings.ts (MedicalCode interface updated)
--   [✅] Worker code:
--       - generate-sapbert-embeddings.ts (Updated to use sapbert_embedding column + timestamp)
--       - vector-search.ts (Added TODO for dual-model routing implementation)
-- ============================================================================

-- ============================================================================
-- STEP 0: Ensure pgvector extension exists
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- STEP 1: Add SapBERT embedding column to regional_medical_codes
-- ============================================================================

-- SapBERT uses 768 dimensions (vs OpenAI 1536)
ALTER TABLE public.regional_medical_codes
ADD COLUMN IF NOT EXISTS sapbert_embedding VECTOR(768);

COMMENT ON COLUMN public.regional_medical_codes.sapbert_embedding IS
'SapBERT embeddings (768d) for medical entity linking. Used for PBS medications based on Experiment 2 showing 17.3pp better differentiation than OpenAI. Model: cambridgeltl/SapBERT-from-PubMedBERT-fulltext';

-- ============================================================================
-- STEP 2: Add metadata columns for embedding tracking and routing
-- ============================================================================

-- Track when SapBERT embeddings were generated
ALTER TABLE public.regional_medical_codes
ADD COLUMN IF NOT EXISTS sapbert_embedding_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.regional_medical_codes.sapbert_embedding_generated_at IS
'Timestamp of SapBERT embedding generation for cache invalidation and regeneration tracking';

-- Track which embedding model is active for each code (routing logic)
ALTER TABLE public.regional_medical_codes
ADD COLUMN IF NOT EXISTS active_embedding_model VARCHAR(20) DEFAULT 'openai';

-- Add check constraint for active_embedding_model
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'regional_medical_codes_active_embedding_model_check'
  ) THEN
    ALTER TABLE public.regional_medical_codes
    ADD CONSTRAINT regional_medical_codes_active_embedding_model_check
    CHECK (active_embedding_model IN ('openai', 'sapbert'));
  END IF;
END $$;

COMMENT ON COLUMN public.regional_medical_codes.active_embedding_model IS
'Active embedding model for search routing: openai (procedures/default) or sapbert (medications). Enables dual-model strategy and easy rollback.';

-- ============================================================================
-- STEP 3: Create vector search index for SapBERT embeddings (PBS only)
-- ============================================================================

-- Index only PBS medications to optimize for SapBERT search performance
-- Uses IVFFlat for vector cosine similarity with 100 lists for recall/speed balance
-- CONCURRENTLY avoids write locks (cannot run in transaction; may need separate execution)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_regional_medical_codes_sapbert_embedding_pbs
ON public.regional_medical_codes
USING ivfflat (sapbert_embedding vector_cosine_ops)
WITH (lists = 100)
WHERE code_system = 'pbs' AND country_code = 'AUS';

COMMENT ON INDEX idx_regional_medical_codes_sapbert_embedding_pbs IS
'IVFFlat index for SapBERT vector search on PBS medications only (~14K AUS codes). Optimizes Pass 1.5 medication matching with 768-dimensional embeddings. Tuned with 100 lists for recall/speed balance.';

-- ============================================================================
-- STEP 4: Set active_embedding_model for PBS medications
-- ============================================================================

-- Mark Australian PBS medications to use SapBERT embeddings
-- Procedures (MBS) and non-AUS codes remain on OpenAI (default)
-- Aligned with index predicate for consistency
UPDATE public.regional_medical_codes
SET active_embedding_model = 'sapbert'
WHERE code_system = 'pbs' AND country_code = 'AUS';

-- ============================================================================
-- STEP 5: Create performance tracking table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.embedding_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Model identification
  model_name VARCHAR(50) NOT NULL, -- 'sapbert', 'openai'
  code_system VARCHAR(10) NOT NULL, -- 'pbs', 'mbs'

  -- Performance metrics
  batch_size INTEGER, -- Number of embeddings generated in batch
  generation_time_ms INTEGER, -- Total time for batch generation
  cache_hit_rate DECIMAL(5,2), -- Percentage of cache hits (0-100)

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.embedding_performance_metrics IS
'Performance tracking for embedding generation across different models and code systems. Used for optimization, capacity planning, and cost analysis.';

-- Enable RLS for security
ALTER TABLE public.embedding_performance_metrics ENABLE ROW LEVEL SECURITY;

-- Service role only policy (metrics are internal system data)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'embedding_performance_metrics'
    AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access"
    ON public.embedding_performance_metrics
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify columns were added
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'regional_medical_codes'
AND column_name IN ('sapbert_embedding', 'sapbert_embedding_generated_at', 'active_embedding_model');

-- Verify index was created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'regional_medical_codes'
AND indexname = 'idx_regional_medical_codes_sapbert_embedding_pbs';

-- Verify embedding model routing setup
SELECT
  code_system,
  active_embedding_model,
  COUNT(*) as count,
  COUNT(sapbert_embedding) as sapbert_count,
  COUNT(embedding) as openai_count,
  COUNT(normalized_embedding) as normalized_count
FROM public.regional_medical_codes
WHERE country_code = 'AUS'
GROUP BY code_system, active_embedding_model
ORDER BY code_system;

-- Expected output structure:
-- code_system | active_embedding_model | count | sapbert_count | openai_count | normalized_count
-- mbs         | openai                 | ~6K   | 0             | ~6K          | ~6K
-- pbs         | sapbert                | ~14K  | 0             | ~14K         | ~14K
--
-- Note: sapbert_count will be 0 until batch processing runs. Actual counts may vary.

-- Verify performance metrics table
SELECT COUNT(*) as table_exists
FROM information_schema.tables
WHERE table_name = 'embedding_performance_metrics';

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================

/*
-- Rollback Step 1: Remove SapBERT columns
ALTER TABLE public.regional_medical_codes
DROP COLUMN IF EXISTS sapbert_embedding CASCADE;

ALTER TABLE public.regional_medical_codes
DROP COLUMN IF EXISTS sapbert_embedding_generated_at CASCADE;

ALTER TABLE public.regional_medical_codes
DROP COLUMN IF EXISTS active_embedding_model CASCADE;

-- Rollback Step 2: Drop index (use CONCURRENTLY to avoid locks)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_regional_medical_codes_sapbert_embedding_pbs;

-- Rollback Step 3: Drop performance metrics table
DROP TABLE IF EXISTS public.embedding_performance_metrics CASCADE;
*/

-- ============================================================================
-- NEXT STEPS (Post-Migration)
-- ============================================================================

-- 1. Execute batch processing script to generate SapBERT embeddings:
--    npx tsx apps/render-worker/src/pass15/batch-generate-sapbert-embeddings.ts
--
--    Expected duration (HuggingFace Inference API):
--      - 14,382 PBS medications
--      - Batch size: 100 medications per batch
--      - ~500ms per batch (API latency)
--      - Total batches: 144
--      - Estimated time: 5-10 minutes
--      - Note: Includes retry logic and progress tracking
--      - Script is crash-safe and resumable
--
-- 2. Deploy updated worker code:
--    - pass15-embedding-service.ts (SapBERT integration)
--    - real-time-embedding-handler.ts (cache + routing logic)
--
-- 3. Update search_regional_codes RPC function for model-aware routing
--
-- 4. Monitor performance metrics:
--    SELECT * FROM public.embedding_performance_metrics ORDER BY created_at DESC;
--
-- 5. Validate search quality improvement (target: +9.1% better differentiation)
