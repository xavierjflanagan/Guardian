# Procedure Hybrid Search - Implementation Plan

**Status:** Phase 1 Complete - Database Foundation Deployed
**Date Created:** October 22, 2025
**Last Updated:** October 22, 2025
**Validated By:** Experiment 5 (MBS Procedure Validation)

## Implementation Progress

- [X] **Phase 1: Database Foundation** - COMPLETE (October 22, 2025)
  - Migration 32 executed: `2025-10-22_32_procedure_hybrid_search_foundation.sql`
  - `search_variants` column added to `entity_processing_audit`
  - `search_procedures_hybrid()` function deployed
  - Performance indexes created (trigram + composite)
  - Source of truth schemas updated
  - Cholecystectomy test passed (found all 3 expected codes)

- [ ] **Phase 2: Pass 1 Enhancement** - NOT STARTED
  - Update Pass 1 AI prompt for variant generation
  - Update TypeScript types

- [ ] **Phase 3: Pass 1.5 Routing** - NOT STARTED
  - Create entity router fork
  - Wire up hybrid search RPC call

- [ ] **Phase 4: Testing** - NOT STARTED
  - Run Experiment 5 test suite
  - Validate accuracy improvement

- [ ] **Phase 5: Production Deployment** - NOT STARTED
  - Monitor first 100 documents
  - Validate real-world accuracy

---

## Overview

Implement hybrid search for MBS procedure matching using:
- **Lexical matching (70%):** AI-generated search variants
- **Semantic reranking (30%):** OpenAI embeddings
- **Pass 1 enhancement:** `search_variants` array output

---

## Phase 1: Database Foundation ✅ COMPLETE

**Objective:** Add `search_variants` column and `search_procedures_hybrid()` function

**Status:** ✅ COMPLETE (October 22, 2025)

### Database Migration - COMPLETE ✅

**File:** `migration_history/2025-10-22_32_procedure_hybrid_search_foundation.sql`

**Components Deployed:**
- ✅ `search_variants TEXT[]` column added to `entity_processing_audit`
- ✅ Column comment documenting max 5 variants
- ✅ `search_procedures_hybrid()` function created
- ✅ Trigram GIN index for ILIKE performance (`idx_rmc_normalized_text_trgm`)
- ✅ Composite BTREE index for filter predicates (`idx_rmc_mbs_proc_active`)
- ✅ Security: REVOKE/GRANT to service_role only
- ✅ Source of truth schemas updated:
  - `04_ai_processing.sql` (Line 348-349)
  - `03_clinical_core.sql` (Lines 2010-2184)
  - `07_optimization.sql` (Lines 425-436)

**Verification Results:**
- ✅ Column exists and accepts TEXT[] arrays
- ✅ Function exists and executes without errors
- ✅ Indexes created successfully
- ✅ Cholecystectomy test: Found all 3 expected codes (30443, 30445, 30448) in top 10
- ✅ Function returns lexical_score, semantic_score, combined_score, match_source

---

## Phase 2: Pass 1 Worker Enhancement (NOT STARTED)

**Objective:** Update Pass 1 to generate `search_variants` array for all entities

**Status:** ⏳ NOT STARTED

### Pass 1 AI Prompt Enhancement

**Location:** `apps/render-worker/src/pass1/prompts/entity-detection.ts`

Add variant generation to system prompt:

```typescript
For each clinical entity detected, generate up to 5 search variants including:
- Medical synonyms (e.g., "arthroplasty" for "replacement")
- Common abbreviations (e.g., "CXR", "CT", "ECG")
- Formatting variations (e.g., "X-ray", "x-ray", "xray")
- Anatomical variations (e.g., "left knee" vs "knee left")

Output format:
{
  "entity_text": "Chest X-ray",
  "entity_type": "procedure",
  "search_variants": ["chest x-ray", "chest radiography", "CXR", "thoracic radiograph", "lung fields x-ray"]
}
```

### TypeScript Type Updates

**File:** `apps/render-worker/src/pass1/types.ts`

Update entity output type to include search_variants:

```typescript
export interface DetectedEntity {
  entity_text: string;
  entity_type: 'medication' | 'procedure' | 'condition' | 'observation';
  search_variants: string[]; // NEW: max 5 variants
  confidence: number;
  bounding_box?: BoundingBox;
}
```

---

## Phase 3: Pass 1.5 Routing Logic (NOT STARTED)

**Objective:** Route procedures to hybrid search function

**Status:** ⏳ NOT STARTED

### Update Entity Router

**File:** `shared/docs/architecture/database-foundation-v3/current_workers/pass1.5-coordinator/entity-router.ts`

```typescript
export function routeEntity(entity: ClinicalEntity): CodeMatchingStrategy {
  switch (entity.entity_type) {
    case 'medication':
      return {
        function: 'search_medications_hybrid',
        model: 'sapbert',
        strategy: 'hybrid',
        requiresVariants: false  // Medications use brand name fallback
      };

    case 'procedure':
      return {
        function: 'search_procedures_hybrid',  // NEW
        model: 'openai',
        strategy: 'hybrid',
        requiresVariants: true  // Procedures REQUIRE search_variants
      };

    default:
      return {
        function: 'search_regional_codes',
        model: 'openai',
        strategy: 'vector_only',
        requiresVariants: false
      };
  }
}
```

### Worker Validation

**File:** `apps/render-worker/src/pass1.5/code-matcher.ts`

```typescript
export async function matchCodes(entity: ClinicalEntity): Promise<CodeMatch[]> {
  const strategy = routeEntity(entity);

  // CRITICAL: Validate search_variants exists for procedures
  if (strategy.requiresVariants && (!entity.search_variants || entity.search_variants.length === 0)) {
    throw new Error(`Entity type '${entity.entity_type}' requires search_variants but none provided`);
  }

  // Call appropriate search function
  if (strategy.function === 'search_procedures_hybrid') {
    return await supabase.rpc('search_procedures_hybrid', {
      p_entity_text: entity.entity_text,
      p_search_variants: entity.search_variants,
      p_country: entity.country || 'AU',
      p_limit: 20
    });
  }

  // ... other routing logic
}
```

---

## Phase 4: Testing & Validation (NOT STARTED)

**Objective:** Validate hybrid search improves accuracy

**Status:** ⏳ NOT STARTED

### Test Script

**File:** `pass1.5-testing/experiment-5-mbs-procedure-validation/scripts/test-hybrid-implementation.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import testEntities from '../test-data/realistic-procedure-entities.json';

async function testHybridSearch() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const results = [];

  for (const entity of testEntities) {
    const { data, error } = await supabase.rpc('search_procedures_hybrid', {
      p_entity_text: entity.entity_text,
      p_search_variants: entity.search_variants,
      p_country: 'AU',
      p_limit: 20
    });

    if (error) {
      console.error(`Error for "${entity.entity_text}":`, error);
      continue;
    }

    // Check if correct code is in top-20
    const correctCodes = entity.expected_codes || [];
    const foundCorrect = data.some(result =>
      correctCodes.includes(result.code_value)
    );

    results.push({
      entity_text: entity.entity_text,
      top_result: data[0]?.code_value,
      found_correct: foundCorrect,
      top_score: data[0]?.combined_score
    });
  }

  // Calculate accuracy
  const top1Accuracy = results.filter(r => r.found_correct && r.top_result === r.expected_codes[0]).length / results.length;
  const top20Accuracy = results.filter(r => r.found_correct).length / results.length;

  console.log(`Top-1 Accuracy: ${(top1Accuracy * 100).toFixed(1)}%`);
  console.log(`Top-20 Accuracy: ${(top20Accuracy * 100).toFixed(1)}%`);

  return results;
}

testHybridSearch();
```

### Success Criteria

- **Top-20 accuracy ≥90%** on Experiment 5 test set (vs 62.9% OpenAI baseline)
- All 5 chest x-ray variations match correct codes
- Cholecystectomy finds exact match codes (30443, 30445, 30448)
- CT/MRI abbreviations expand correctly
- Ultrasound abdomen matches code 55036

### Regression Testing

Ensure hybrid search doesn't break existing successful matches:
- Test all 22 entities that succeeded in Experiment 5 baseline
- Verify top-1 accuracy maintained or improved
- Check latency doesn't exceed 500ms p95

---

## Phase 5: Production Deployment (NOT STARTED)

**Status:** ⏳ NOT STARTED

**Prerequisites:**
- Phase 1: ✅ Database foundation deployed
- Phase 2: ⏳ Pass 1 variant generation implemented
- Phase 3: ⏳ Pass 1.5 routing implemented
- Phase 4: ⏳ Testing validated (≥90% top-20 accuracy)

**Checklist:**
- [X] Database migration applied (`search_variants` column added) - Migration 32
- [X] Hybrid search function deployed (`search_procedures_hybrid`) - Migration 32
- [X] Performance indexes created - Migration 32
- [ ] Pass 1 prompt updated (variant generation in entity detection)
- [ ] Pass 1 TypeScript types updated
- [ ] Entity router updated (procedure fork routing)
- [ ] Integration tests passing (all 35 Experiment 5 entities)
- [ ] Cost monitoring enabled (variant generation costs)
- [ ] Rollback plan documented

**Estimated Cost Impact:** +$0.008 per document (variant generation)

**Deployment Order:**
1. Apply database migration (search_variants column)
2. Update Pass 1 worker (variant generation)
3. Deploy hybrid search function
4. Update Pass 1.5 router (procedure fork)
5. Monitor first 100 documents for errors
6. Validate accuracy improvement on real documents

---

## Rollback Plan

If hybrid search underperforms or causes issues:

1. **Immediate Rollback:**
   ```typescript
   // Revert entity router to use simple vector search
   case 'procedure':
     return {
       function: 'search_regional_codes',
       model: 'openai',
       strategy: 'vector_only'
     };
   ```

2. **Database Rollback:**
   - Keep `search_variants` column (no harm, future use)
   - No need to remove - column can remain unpopulated

3. **Alternative Investigation:**
   - Test domain-specific models (BioBERT, Clinical-ModernBERT)
   - Consider anatomy extraction approach
   - Investigate MBS-specific preprocessing

---

## Cost Analysis

**Per Entity:**
- Variant generation (GPT-4o mini): ~$0.0002
- Lexical search: ~$0.00001 (negligible)
- Semantic reranking: ~$0.00001 (negligible)
- **Total per entity:** ~$0.0002

**Per Document (40 entities):**
- Total cost: ~$0.008
- Baseline (pure vector): ~$0.004
- **Cost increase:** ~$0.004 per document (100% increase)

**Monthly Cost (1,000 documents):**
- Baseline: $4
- Hybrid: $8
- **Increase:** $4/month (negligible for accuracy improvement)

---

## Performance Targets

**Latency:**
- Lexical phase: <50ms
- Semantic phase: <100ms
- Total per entity: <200ms
- **Target: <500ms p95**

**Accuracy:**
- Top-1: ≥50% (vs ~30% baseline)
- Top-5: ≥75% (vs ~45% baseline)
- Top-20: ≥90% (vs 62.9% baseline)

**Throughput:**
- Target: 40 entities/document × 20 documents/minute = 800 entities/minute
- Should handle 1,000 documents/day easily

---

## Monitoring & Alerts

**Metrics to Track:**
- Variant generation success rate (target: >99%)
- Lexical match rate (target: >80%)
- Semantic reranking improvement (target: +10% accuracy)
- Combined score distribution
- Latency p50, p95, p99

**Alerts:**
- Variant generation failures >1%
- Hybrid search latency >1s p95
- Top-20 accuracy drop below 85%

---

## Future Enhancements

**Post-Launch Optimizations:**
1. Cache search_variants for common procedures
2. A/B test lexical/semantic weight ratios (60/40, 80/20)
3. Dynamic variant count (1-10 based on entity complexity)
4. Medical terminology normalization layer
5. Anatomy extraction and filtering

**CPT Code Support:**
- Extend hybrid search to universal CPT codes
- Test on US medical documents
- Validate synonym generation for US terminology

---

## References

**Experiment 5 Results:**
- `results/PHASE_2_ANALYSIS_SUMMARY.md` - Comprehensive test analysis
- `results/MANUAL_CODE_INVESTIGATION.md` - Ground truth investigation

**Master Plan:**
- `PASS-1.5-MASTER-PLAN.md` - Architecture and routing

**Similar Implementation:**
- Medication hybrid search (SapBERT + brand name fallback)
- Gradient candidate system (confidence-based candidate counts)
