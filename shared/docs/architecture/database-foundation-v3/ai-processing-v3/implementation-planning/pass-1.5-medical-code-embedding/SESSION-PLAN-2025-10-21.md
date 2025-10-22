# Pass 1.5 Session Plan - October 21, 2025

## Current Status

**Active:** SapBERT embedding generation running (73% complete, ~4 hours remaining)
- 10,440 / 14,281 PBS medications embedded
- Model: cambridgeltl/SapBERT-from-PubMedBERT-fulltext (768 dims)
- Strategy: Normalized text (17.3pp better than OpenAI)
- ETA: ~6:30 AM Oct 22 (overnight local run)

## Completed Work

### Migration 31: SapBERT Embedding Schema ✅
- Added `sapbert_embedding VECTOR(768)` to regional_medical_codes
- Added `sapbert_embedding_generated_at` timestamp
- Added `active_embedding_model TEXT` to track which model is active

### Experiment 2: Comprehensive Model Comparison ✅
**Test Set:** 40 validated entities (20 medications, 10 procedures, 10 conditions)

**Results:**
- SapBERT + Normalized: 75.3% accuracy (WINNER)
- OpenAI + Normalized: 58.0% accuracy
- BioBERT + Normalized: 65.5% accuracy
- Clinical-ModernBERT + Normalized: 62.8% accuracy

**Key Finding:** Normalized text strategy beats core ingredient for medications (5.4pp improvement)

**Test Data Location:** `pass1.5-testing/experiment-2/test-data/final-40-entities.json`

### Previous Work (2025-10-20) ✅
- OpenAI normalized embeddings: 20,382 codes (deprecated, kept for comparison)
- Normalization strategy validated
- Pure vector search proven insufficient (40% accuracy)
- Hybrid retrieval (lexical + vector) identified as solution

## Architecture Decision: Hybrid Retrieval

**Problem:** Pure vector embeddings cluster by drug class/dose/form, not specific ingredient
- "Amoxicillin 500mg" → Returns Dicloxacillin (wrong antibiotic)
- "Skin biopsy" → Returns lymph node biopsies (wrong anatomy)

**Solution:** 70% lexical matching + 30% SapBERT vector reranking
- Lexical: Extract ingredient/anatomy, filter with ILIKE + pg_trgm similarity
- Vector: Rerank filtered subset for semantic refinement
- Combined score: (0.7 × lexical) + (0.3 × vector)

## Next Steps (After Embedding Completes)

### Step 1: Create IVFFLAT Index
```sql
CREATE INDEX idx_regional_sapbert_embedding_ivfflat
ON regional_medical_codes
USING ivfflat (sapbert_embedding vector_cosine_ops)
WITH (lists = 100);
```

### Step 2: Quick Validation Test
Run 40 validated entities from Experiment 2 through:
1. Pure SapBERT vector search (baseline)
2. Hybrid search (lexical + SapBERT)

**Expected Results:**
- Pure vector: ~75% (from Experiment 2)
- Hybrid: >90% target

### Step 3: Implement Hybrid Search RPC

**Core Function:**
```sql
CREATE FUNCTION search_medications_hybrid(
    query_text TEXT,
    max_results INT DEFAULT 20
) RETURNS TABLE (
    code_value TEXT,
    display_name TEXT,
    lexical_score REAL,
    vector_score REAL,
    combined_score REAL
)
```

**Key Components:**
- `extract_ingredient(query)` - Remove dose/form, extract drug name
- `extract_dose(query)` - Extract "500mg" patterns
- Lexical scoring: ILIKE match + pg_trgm similarity + standalone boost
- Vector scoring: SapBERT cosine similarity on filtered subset
- Combined ranking with configurable weights

### Step 4: Extended Validation (100 medications)
**Test Categories:**
- Common medications: 40 cases (use Experiment 2 as baseline)
- Typos/variants: 20 cases ("Paracetomol", "Amoxycillin")
- Abbreviations: 15 cases ("PPI", "ACE inhibitor")
- Edge cases: 15 cases (combinations, brand names)
- Exact PBS codes: 10 cases

**Success Criteria:**
- Correct ingredient in top 20: >99%
- Correct ingredient in top 5: >95%
- Standalone preferred over combo: >90%
- Search latency: <500ms

### Step 5: Performance Optimization
- Create pg_trgm GIN index on normalized_embedding_text
- Benchmark query performance across 1000 searches
- Tune lexical/vector weight ratio (start 70/30)
- Cache common ingredient patterns

## Database Changes Required

### New RPC Functions
1. `search_medications_hybrid()` - Main search with configurable weights
2. `extract_ingredient()` - Parse ingredient from query text
3. `extract_dose()` - Parse dose patterns (e.g., "500mg")

### New Indexes
1. IVFFLAT on sapbert_embedding (vector search)
2. GIN on normalized_embedding_text (pg_trgm fuzzy matching)

### Extensions Needed
- `pg_trgm` - Already available in Supabase PostgreSQL

## Files to Create

### Implementation
- `migration_history/2025-10-21_32_hybrid_search_functions.sql`
- `test-hybrid-validation-100.ts` - Extended test suite
- `benchmark-hybrid-performance.ts` - Latency testing

### Documentation
- Update `SAPBERT-IMPLEMENTATION-PLAN.md` with hybrid approach
- Create `HYBRID-SEARCH-DESIGN.md` (technical spec)
- Update pass1.5 bridge schemas if needed

## Key Metrics to Track

### Accuracy (Target: >95%)
- Ingredient match in top 5
- Standalone vs combination preference
- Dose match accuracy
- Typo tolerance

### Performance (Target: <500ms)
- Query latency p50, p95, p99
- Lexical filter selectivity
- Vector reranking overhead
- Index effectiveness

### Cost
- Query embedding: $0.000001 per search (negligible)
- PostgreSQL compute: FREE (lexical filtering)
- Overall: Same or lower than pure vector

## Session Timeline (3-Day Plan)

**Day 1 (Oct 21-22):**
- Wait for SapBERT embedding completion
- Create IVFFLAT index
- Quick validation with 40 entities
- Implement helper functions (extract_ingredient, extract_dose)

**Day 2 (Oct 22-23):**
- Implement search_medications_hybrid() RPC
- Create 100-case test suite
- Run validation, debug issues
- Tune lexical/vector weights

**Day 3 (Oct 23-24):**
- Performance optimization
- Create pg_trgm indexes
- Benchmark latency
- Document findings

## Risks & Mitigations

### Risk 1: SapBERT embeddings don't improve hybrid search
- **Likelihood:** Low (Experiment 2 showed 75% pure vector)
- **Mitigation:** Keep OpenAI embeddings for fallback A/B test

### Risk 2: Hybrid search too slow
- **Likelihood:** Low (lexical filtering reduces vector comparisons 90%+)
- **Mitigation:** Benchmark early, optimize indexes

### Risk 3: Tuning complexity
- **Likelihood:** Medium (many parameters: weights, thresholds, boosts)
- **Mitigation:** Make configurable, start with literature recommendations

## Resources

### Key Documents
- `CRITICAL-FINDING-PURE-VECTOR-INSUFFICIENT.md` - Why hybrid needed
- `experiment-2/COMPREHENSIVE_ANALYSIS.md` - SapBERT validation
- `experiment-2/test-data/final-40-entities.json` - Ground truth test set

### PostgreSQL Docs
- pg_trgm: https://www.postgresql.org/docs/current/pgtrgm.html
- pgvector: https://github.com/pgvector/pgvector#querying

## Success Definition

**MVP Complete When:**
1. ✅ 100% PBS medications have SapBERT embeddings
2. ✅ Hybrid search RPC implemented and tested
3. ✅ Validation shows >95% accuracy (top 5)
4. ✅ Search latency <500ms (p95)
5. ✅ Documentation complete

**Then:** Proceed to MBS procedures, conditions, observations (similar pattern)

---

**Session Goal:** Complete SapBERT embedding generation, validate hybrid approach, implement core RPC functions

**Status:** Embedding generation in progress, all prerequisites complete
