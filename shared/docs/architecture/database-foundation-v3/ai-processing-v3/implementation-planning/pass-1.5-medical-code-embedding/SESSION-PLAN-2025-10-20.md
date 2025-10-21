# Pass 1.5 Medical Code Embedding - Session Plan 2025-10-20

**Purpose:** Fix embedding mismatch issue and validate normalization approach
**Status:** IN PROGRESS
**Start Time:** 2025-10-20

---

## Session Goals

**Primary Objective:** Establish baseline failure rate and validate normalization fix approach

**Success Criteria:**
1. ✅ Phase 0 baseline test completed with 5 common medications
2. ✅ Root cause confirmed: embedding input mismatch
3. ⏳ Phase 1: Design and test normalization function
4. ⏳ Phase 2: Create migration and regenerate embeddings
5. ⏳ Phase 3: Implement combined retrieval (vector + lexical)
6. ⏳ Phase 4: Gold standard validation

---

## Phase 0: Baseline Test Results ✅ COMPLETED

**Purpose:** Measure current system failure rate before implementing fixes

### Test Setup
- **Test Cases:** 5 common medications
- **Threshold:** 0.60 similarity minimum
- **Model:** OpenAI text-embedding-3-small (1536 dimensions)

### Results Summary

| Medication | Found in Top 20? | Position | Similarity | Notes |
|------------|------------------|----------|------------|-------|
| Metformin 500mg | ❌ NO | N/A | ~55% | Matched Vildagliptin instead |
| Atorvastatin 40mg | ✅ YES | #1 | 80.1% | Perfect match |
| Perindopril 4mg | ❌ NO | N/A | ~72% | Matched Trandolapril instead |
| Paracetamol 500mg | ❌ NO | N/A | ~54% | Matched Naproxen instead |
| Amoxicillin 500mg | ✅ YES | #1 | 76.6% | Perfect match |

**Overall Performance:**
- Correct ingredient in top 20: 2/5 (40%)
- Correct ingredient at #1: 2/5 (40%)
- Average position when found: #1.0

**CONCLUSION:** System is BROKEN - 60% failure rate confirms embedding mismatch issue

### Diagnostic Analysis

**Query:** "Metformin 500mg"
- Top result: Vildagliptin 50mg (55.3% similarity) - WRONG DRUG
- Metformin not found in top 20 results
- Cause: Query embedding for clean text doesn't match database embeddings with verbose descriptions

**Query:** "Paracetamol 500mg"
- Top result: Naproxen 550mg (54.1% similarity) - WRONG DRUG
- Paracetamol not found in top 20 results
- Cause: Same embedding mismatch issue

### Root Cause Confirmation

**Problem:** Embedding input mismatch
- **Database embeddings** use verbose `search_text`:
  - "Metformin Tablet (extended release) containing metformin hydrochloride 500 mg APO-Metformin XR 500"
  - "Paracetamol Tablet 500 mg PHARMACY CARE PARACETAMOL"

- **Clinical queries** use clean entity text:
  - "Metformin 500mg"
  - "Paracetamol 500mg"

**Impact:**
- Vector cosine distance fails because semantic spaces don't align
- Clean clinical terms embedded in different semantic space than verbose pharmaceutical descriptions
- Brand names, billing codes, salt forms pollute the embedding space

---

## Phase 1: Normalization Design ⏳ PENDING

**Next Steps:**
1. Design normalization function to extract clinical essentials:
   - Ingredient name (generic)
   - Strength (with unit)
   - Form (tablet/capsule/injection)
   - Release type (extended/modified/immediate)

2. Test normalization with 20 diverse codes:
   - Simple medications (Paracetamol, Aspirin)
   - Complex combinations (Alogliptin + metformin)
   - Different salt forms (Perindopril erbumine vs arginine)
   - Various release types (XR, SR, modified release)

3. Validate normalization preserves clinical distinctiveness

---

## Phase 2: Migration & Re-embedding ✅ IN PROGRESS

**Status:** Migration 30 executed successfully, ready for population

### 2.1: Database Schema Updates ✅ COMPLETED

**Migration 30 executed (2025-10-20):**
- Added `normalized_embedding_text TEXT` column
- Added `normalized_embedding VECTOR(1536)` column
- Applied to both `regional_medical_codes` and `universal_medical_codes`
- Kept old `embedding` column for A/B testing and rollback safety

**Why dual columns approach:**
- Safety: Can validate normalized embeddings before switching
- A/B testing: Compare old vs new search results
- Rollback: Easy revert if normalization makes things worse
- Audit trail: `embedding_batch_id` tracks which model version

### 2.2: Population Strategy (Two-Pass Approach)

**Decision: Use TypeScript worker scripts (not SQL functions)**

**Reasoning:**
- Single source of truth: Same normalization code for database population AND live Pass 1.5 queries
- Easier iteration: TypeScript is more debuggable than SQL for complex string manipulation
- Cost safety: Validate text normalization before spending $0.05 on embeddings
- Edge case handling: Better support for unit conversions, salt forms, brand name extraction

**Pass A: Populate Normalized Text (DRY RUN)**

Script: `apps/render-worker/src/pass15/populate-normalized-text.ts`

Steps:
1. Read 1,000 sample codes from `regional_medical_codes`
2. Apply `normalizeMedicationText()` function to each
3. Update ONLY `normalized_embedding_text` column
4. Manual QA: Review normalized text for correctness
   - Verify units converted (g→mg)
   - Confirm salt forms removed
   - Check brand names retained appropriately
5. If QA passes → run for all 20,383 codes
6. Cost: Free (no API calls)
7. Time: ~5-10 minutes for full population

**Pass B: Generate Normalized Embeddings**

Script: `apps/render-worker/src/pass15/generate-normalized-embeddings.ts`

Steps:
1. Read codes WHERE `normalized_embedding_text IS NOT NULL`
2. Generate embeddings in batches of 100 (with retry logic)
3. Update `normalized_embedding` column
4. Track with `embedding_batch_id` for audit trail
5. Create IVFFLAT index after completion
6. Cost: ~$0.05 USD (20K codes × $0.00002/embedding)
7. Time: ~15-20 minutes (including API rate limits)

**Batch Processing Details:**
```typescript
// Pagination through codes
const BATCH_SIZE = 100;
const RETRY_ATTEMPTS = 3;
const BACKOFF_MS = 1000;

// Track progress with embedding_batch_id
const batchId = await createEmbeddingBatch({
  embedding_model: 'text-embedding-3-small',
  code_system: 'pbs',
  library_version: 'v2025Q4'
});
```

**Index Creation (after Pass B):**
```sql
CREATE INDEX IF NOT EXISTS idx_regional_normalized_embedding_ivfflat
ON regional_medical_codes
USING ivfflat (normalized_embedding vector_cosine_ops)
WITH (lists = 1000);
```

**Acceptance Gates Before Pass B:**
- Sample QA on `normalized_embedding_text` passes
- Units standardized correctly (g→mg, mcg→mg)
- Salt forms removed (hydrochloride, arginine, etc.)
- Brand names preserved but not dominant
- Clinical distinctiveness maintained

### 2.3: Next Steps

1. ⏳ Create `populate-normalized-text.ts` script (Pass A)
2. ⏳ Run on 1K sample, perform QA
3. ⏳ Run on full 20K codes if QA passes
4. ⏳ Create `generate-normalized-embeddings.ts` script (Pass B)
5. ⏳ Generate embeddings with batch tracking
6. ⏳ Create vector index on `normalized_embedding`

---

## Phase 3: Combined Retrieval ⏳ PENDING

**Plan:**
1. Implement combined search function:
   - Vector similarity on normalized embeddings (70% weight)
   - Lexical search with ts_rank (30% weight)
   - Both use unaccent() for accent-insensitive matching

2. Test with Phase 0 medications again
3. Target: >99% correct ingredient in top 20

---

## Phase 4: Gold Standard Validation ⏳ PENDING

**Plan:**
1. Expand test set to 50-100 medications
2. Include edge cases (brand names, combinations, rare drugs)
3. Measure precision and recall
4. Document findings

---

## Technical Notes

### Files Created

**Phase 0 Testing:**
- `test-pass15-baseline.ts` - Baseline test (5 medications, 40% success rate)
- `diagnostic-similarity-check.ts` - Similarity score analyzer

**Phase 1 Testing:**
- `test-normalization-function.ts` - Normalization function validation (19 medications, 26% avg reduction)

**Phase 2 Migration:**
- Migration 30: `2025-10-20_30_add_normalized_embedding_text.sql`
- Schema updates: `current_schema/03_clinical_core.sql` (lines 1342-1344, 1297-1299)

**Phase 2 Population (Next):**
- `apps/render-worker/src/pass15/populate-normalized-text.ts` (Pass A)
- `apps/render-worker/src/pass15/generate-normalized-embeddings.ts` (Pass B)

### Environment Setup
- Environment variables loaded from `.env.production`
- Supabase connection via service role key
- OpenAI API for embedding generation (text-embedding-3-small)

### Key Learnings
1. Embedding mismatch is confirmed as root cause
2. 60% of common medications fail with current system
3. Even successful matches show lower similarity than expected
4. Normalization approach is correct solution
5. Need combined retrieval (vector + lexical) for robustness

---

**Session Progress:** Phase 0 complete, moving to Phase 1
