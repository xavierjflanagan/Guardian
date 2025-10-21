# Pass 1.5 Normalization Experiment - 2025-10-20

## Experiment Overview

**Hypothesis:** Normalizing medical code text before embedding generation will fix the 60% failure rate in vector similarity search caused by semantic space mismatch between verbose database descriptions and clean clinical queries.

**Date Started:** 2025-10-20
**Status:** IN PROGRESS - Pass A running

---

## Background

### Problem Statement
Phase 0 baseline testing revealed 60% failure rate (3/5 common medications not found in top 20 results):
- Metformin 500mg: Not found (matched wrong drug at 55% similarity)
- Paracetamol 500mg: Not found (matched wrong drug at 54% similarity)
- Perindopril 4mg: Not found (matched wrong drug at 72% similarity)

**Root Cause:** Embedding input mismatch
- Database embeddings use verbose `search_text`: "Metformin Tablet (extended release) containing metformin hydrochloride 1 g Diaformin XR 1000"
- Clinical queries use clean text: "Metformin 1g"
- These exist in different semantic spaces, causing vector cosine similarity to fail

### Solution Design
Two-column approach with normalized text:
1. `normalized_embedding_text` - Extract clinical essentials (generic name + brand + dose + form + release type)
2. `normalized_embedding` - Vector generated from normalized text
3. Keep old `embedding` column for A/B testing and rollback

**Normalization Strategy:**
- Remove salt forms (hydrochloride, arginine, erbumine, etc.)
- Standardize units (g→mg, mcg→mg)
- Extract brand names from search_text
- Preserve release types (extended, modified)
- Remove verbose phrases ("containing", "as")

---

## Experiment Phases

### Phase 0: Baseline Testing ✅ COMPLETED
**Date:** 2025-10-20
**Purpose:** Measure current system failure rate

**Test Set:** 5 common medications
- Metformin 500mg
- Atorvastatin 40mg
- Perindopril 4mg
- Paracetamol 500mg
- Amoxicillin 500mg

**Results:**
| Medication | Found in Top 20? | Position | Similarity | Status |
|------------|------------------|----------|------------|--------|
| Metformin 500mg | ❌ NO | N/A | ~55% | FAIL |
| Atorvastatin 40mg | ✅ YES | #1 | 80.1% | PASS |
| Perindopril 4mg | ❌ NO | N/A | ~72% | FAIL |
| Paracetamol 500mg | ❌ NO | N/A | ~54% | FAIL |
| Amoxicillin 500mg | ✅ YES | #1 | 76.6% | PASS |

**Success Rate:** 40% (2/5 medications found)

**Conclusion:** System is BROKEN - confirms embedding mismatch hypothesis

**Test File:** `test-pass15-baseline.ts`

---

### Phase 1: Normalization Function Design ✅ COMPLETED
**Date:** 2025-10-20
**Purpose:** Design and validate normalization logic

**Test Set:** 19 diverse medications (simple drugs, combinations, different salt forms, release types)

**Results:**
- Average length reduction: 26%
- Salt removal: Working (hydrochloride, arginine, erbumine removed)
- Unit conversion: Working (1 g → 1000 mg)
- Brand extraction: Working (from search_text)
- Release type preservation: Working (extended release, modified release)

**Key Transformations Validated:**
1. Perindopril erbumine → perindopril (salt removed)
2. Metformin 1 g → metformin 1000 mg (unit conversion)
3. Alogliptin + metformin combination preserved
4. Extended release notation simplified

**Conclusion:** Normalization logic working correctly, preserves clinical distinctiveness

**Test File:** `test-normalization-function.ts`
**Source Code:** `apps/render-worker/src/pass15/normalization.ts`

---

### Phase 2: Database Migration ✅ COMPLETED
**Date:** 2025-10-20
**Migration:** `2025-10-20_30_add_normalized_embedding_text.sql`

**Schema Changes:**
Added to `regional_medical_codes` and `universal_medical_codes`:
- `normalized_embedding_text TEXT` - Normalized text for embedding
- `normalized_embedding VECTOR(1536)` - OpenAI text-embedding-3-small vectors

**Dual Column Rationale:**
- Safety: Validate before switching
- A/B testing: Compare old vs new results
- Rollback: Easy revert if normalization makes things worse
- Audit trail: Track which model version via `embedding_batch_id`

**Source of Truth Updated:**
- `current_schema/03_clinical_core.sql` (lines 1342-1344, 1297-1299)

---

### Phase 2 Pass A: Populate Normalized Text ⏳ IN PROGRESS
**Date:** 2025-10-20
**Script:** `apps/render-worker/src/pass15/populate-normalized-text.ts`

**Dry-Run Results (1,000 codes):**
- Duration: 165 seconds
- Success rate: 100% (1,000 codes updated, 0 errors)
- Sample QA: Normalization working correctly
- All MBS procedures tested (first 1K codes)

**Medication Sample Test (20 random PBS codes):**
- Duration: ~10 seconds
- Success rate: 100% (20 medications normalized)
- Average "length increase": -22.6% (brand names added)
- Salt removal: Working (6 medications)
- Unit conversion: Working (2 medications with g→mg)
- Brand addition: Working (17/20 medications)

**Key Findings:**
- "Length reduction" metric is misleading - we ADD brand names (intentional)
- Normalization preserves clinical distinctiveness
- Edge cases handled well (bandages, multi-component drugs, release types)

**Full Population Run:**
- **Status:** RUNNING
- **Start Time:** 2025-10-20T06:10:15.562Z
- **Total Codes:** 19,383 codes
- **Current Progress:** 300/19,383 (1.5% complete)
- **Estimated Time:** ~56 minutes (based on dry-run timing)
- **Cost:** $0.00 (no API calls)

**Test Files:**
- `populate-normalized-text.ts` (main script)
- `test-medication-normalization.ts` (20 random PBS codes)

---

### Phase 2 Pass B: Generate Normalized Embeddings ⏳ PENDING
**Planned Date:** 2025-10-20 (after Pass A completes)
**Script:** `apps/render-worker/src/pass15/generate-normalized-embeddings.ts` (to be created)

**Strategy:**
1. Test with 1,000 codes first (same dry-run set)
2. Generate embeddings via OpenAI text-embedding-3-small
3. Verify embeddings populated correctly
4. Run full population if test succeeds

**Batch Processing Plan:**
- Batch size: 100 codes per API call
- Retry logic: 3 attempts with exponential backoff
- Rate limiting: Respect OpenAI API limits
- Progress tracking: `embedding_batch_id` for audit trail

**Index Creation (after completion):**
```sql
CREATE INDEX IF NOT EXISTS idx_regional_normalized_embedding_ivfflat
ON regional_medical_codes
USING ivfflat (normalized_embedding vector_cosine_ops)
WITH (lists = 1000);
```

**Estimated Costs:**
- 1,000 codes test: ~$0.02
- Full 19,383 codes: ~$0.38
- Model: text-embedding-3-small ($0.00002/token)

**Acceptance Gates:**
- All 1,000 test codes have `normalized_embedding IS NOT NULL`
- Sample vector dimensions correct (1536)
- No API errors or rate limit issues

---

### Phase 3: Vector Search Validation ⏳ PENDING
**Planned Date:** 2025-10-20 (after Pass B 1K test completes)

**Test Plan:**
1. Rerun Phase 0 baseline test (5 medications)
2. Search using `normalized_embedding` column
3. Compare results vs baseline

**Success Criteria:**
- Find correct ingredient in top 20: >80% (vs 40% baseline)
- Correct ingredient at #1: >60% (vs 40% baseline)
- Average similarity score: >75% (vs ~65% baseline)

**Test Medications:**
- Metformin 500mg (baseline: FAIL)
- Atorvastatin 40mg (baseline: PASS)
- Perindopril 4mg (baseline: FAIL)
- Paracetamol 500mg (baseline: FAIL)
- Amoxicillin 500mg (baseline: PASS)

**Expected Improvements:**
- Metformin: Should now match normalized "metformin 500 mg" instead of verbose description
- Paracetamol: Should match normalized "paracetamol 500 mg" instead of billing text
- Perindopril: Salt-free normalization should improve matching

---

### Phase 4: Extended Validation ⏳ PENDING
**Planned Date:** 2025-10-20 (after Phase 3 passes)

**Test Plan:**
1. Expand test set to 50-100 medications
2. Include edge cases:
   - Brand name queries
   - Combination drugs
   - Rare medications
   - Different salt forms
   - Various release types
3. Measure precision and recall
4. Document findings

**Success Criteria:**
- Precision >90% (correct drug in top 20)
- Recall >85% (all relevant codes retrieved)
- No critical information lost in normalization

---

## Data Storage & Safety

### Database Updates (Crash-Safe)
All updates written immediately to `regional_medical_codes.normalized_embedding_text`:
- **Location:** Supabase production database
- **Persistence:** Permanent, survives crashes
- **Rollback:** Can reset to NULL and rerun if needed

### Test Outputs (Not Crash-Safe)
Currently in stdout only:
- Terminal output lost if process crashes
- No checkpoint system for resume
- Would need to restart from beginning

### Experiment Logs (This File)
- **Location:** `shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/pass1.5-testing/EXPERIMENT_LOG_2025-10-20.md`
- **Purpose:** Permanent record of hypothesis, methods, results
- **Updates:** Manual after each phase completes

---

## Progress Tracking

### Current Status: Phase 2 Pass A (IN PROGRESS)

**Start Time:** 2025-10-20T06:10:15.562Z
**Last Update:** 2025-10-20T06:11:28Z
**Progress:** 300/19,383 codes (1.5%)
**Errors:** 0
**ETA:** ~55 minutes remaining

### Next Steps
1. ⏳ Wait for Pass A to complete
2. ⏳ Create Pass B embedding generation script
3. ⏳ Run Pass B on 1K sample codes
4. ⏳ Validate vector search with Phase 0 medications
5. ⏳ Run Pass B on full dataset if validation passes
6. ⏳ Create IVFFLAT index
7. ⏳ Extended validation with 50-100 medications

---

## Files Created

### Core Implementation
- `apps/render-worker/src/pass15/normalization.ts` - Single source of truth for normalization
- `apps/render-worker/src/pass15/populate-normalized-text.ts` - Pass A population script

### Testing Scripts
- `test-pass15-baseline.ts` - Phase 0 baseline test (5 medications)
- `test-normalization-function.ts` - Phase 1 function validation (19 medications)
- `test-medication-normalization.ts` - Pass A medication sample test (20 random PBS codes)

### Documentation
- `SESSION-PLAN-2025-10-20.md` - Session planning and strategy
- `EXPERIMENT_LOG_2025-10-20.md` - This file

### Database
- `migration_history/2025-10-20_30_add_normalized_embedding_text.sql` - Schema changes
- `current_schema/03_clinical_core.sql` - Updated source of truth

---

## Results Summary (Updated as experiments complete)

### Phase 0 Baseline: 40% Success Rate ✅
- 2/5 medications found in top 20
- Average similarity: ~65%
- System BROKEN - embedding mismatch confirmed

### Phase 1 Normalization Design: VALIDATED ✅
- 19 medications tested
- 26% average length reduction
- All transformations working correctly

### Phase 2 Pass A Dry-Run: 100% Success ✅
- 1,000 codes normalized
- 0 errors
- QA passed

### Phase 2 Pass A Medication Sample: 100% Success ✅
- 20 random PBS medications normalized
- Salt removal, unit conversion, brand addition all working
- Clinical distinctiveness preserved

### Phase 2 Pass A Full Run: IN PROGRESS ⏳
- 19,383 codes total
- 300 completed (1.5%)
- 0 errors so far

### Phase 2 Pass B: PENDING ⏳

### Phase 3 Validation: PENDING ⏳

### Phase 4 Extended Validation: PENDING ⏳

---

## Conclusions (To be updated)

**Preliminary Findings:**
- Normalization logic working correctly
- Database migration successful
- Pass A population running smoothly

**Next Decision Point:**
After Pass A completes, decide whether to:
1. Proceed with Pass B on 1K sample ($0.02)
2. Modify normalization logic based on findings
3. Expand testing before embedding generation

**Expected Outcome:**
If normalization fixes embedding mismatch, we should see:
- >80% success rate (vs 40% baseline)
- Higher similarity scores for correct matches
- Better semantic alignment between queries and database codes

---

**Last Updated:** 2025-10-20T06:11:30Z
**Updated By:** Claude Code (AI Assistant)
