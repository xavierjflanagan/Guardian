# Critical Finding: Pure Vector Embeddings Insufficient for Medication Matching

---
**HISTORICAL CONTEXT:**

This investigation (October 20, 2025) used OpenAI text-embedding-3-small embeddings and led to the hybrid search decision. Subsequent work (Experiment 2, October 21) validated that SapBERT embeddings perform better for medications (75.3% vs 58.0% OpenAI accuracy) but hybrid search remains necessary to achieve target accuracy above 95%.

This document remains valuable as it explains the fundamental semantic clustering limitations that affect all general-purpose embedding models for low-diversity domains like medical codes.
---

**Date:** 2025-10-20
**Status:** VALIDATED via empirical testing
**Impact:** HIGH - Requires architectural change from pure vector to hybrid retrieval

## Executive Summary

Pure vector embeddings using OpenAI text-embedding-3-small demonstrate **fundamental semantic clustering limitations** for medication matching. Testing with normalized embeddings shows the system clusters by drug class, dose, and form rather than specific active ingredients, resulting in systematically incorrect matches for common medication classes.

## Test Configuration

- **Embedding Model:** OpenAI text-embedding-3-small (1536 dimensions)
- **Normalization:** Applied to both database and query text
- **Test Set:** 5 common Australian medications
- **Dataset:** 1,000+ PBS medication codes (limited by Supabase client default)
- **Search Method:** Client-side cosine similarity calculation (KNN simulation)

## Test Results

### Success Case: Paracetamol
```
Query: "Paracetamol 500mg"
Result: ✅ PERFECT MATCH
Top Result: Paracetamol Tablet 500 mg (83.5% similarity, STANDALONE)
Top 20: 14 standalone paracetamol variants, all correct ingredient
```

**Why it works:** Paracetamol is a unique drug class with minimal semantic overlap with other medications.

### Failure Case 1: Amoxicillin
```
Query: "Amoxicillin 500mg"
Result: ❌ WRONG INGREDIENT
Top Results:
  #1: Dicloxacillin Capsule 500mg (64.0%) - WRONG ANTIBIOTIC
  #2: Cefalexin Capsule 500mg (62.9%) - WRONG ANTIBIOTIC
  #3: Flucloxacillin Capsule 500mg (61.0%) - WRONG ANTIBIOTIC
  #4: Amoxicillin + clavulanic acid (60.7%) - COMBO, not standalone
```

**Root cause:** Vector embeddings cluster "500mg capsule antibiotic" semantically, cannot distinguish between penicillin-class antibiotics.

### Failure Case 2: Metformin
```
Query: "Metformin 500mg"
Result: ⚠️ WRONG FORMULATION
Top Results:
  #1-11: All COMBINATION drugs (empagliflozin+metformin, linagliptin+metformin, etc.)
  Standalone metformin: Not in top 20
```

**Root cause:** Combination drugs contain "metformin 500mg" in their normalized text, creating higher semantic similarity than standalone metformin.

### Failure Case 3: Atorvastatin
```
Query: "Atorvastatin 40mg"
Result: ⚠️ WRONG FORMULATION
Top Results:
  #1-11: All ezetimibe + atorvastatin COMBINATIONS
  #12: Atorvastatin Tablet 20mg STANDALONE (63.3%) - wrong dose
```

**Root cause:** Same as metformin - combinations dominate semantic space.

### Failure Case 4: Perindopril
```
Query: "Perindopril 4mg"
Result: ❌ NOT FOUND
Top Results: Ramipril, Riociguat, Pomalidomide (random similar-dose drugs)
```

**Root cause:** ACE inhibitor class has high semantic overlap with other cardiovascular drugs.

## Root Cause Analysis

### Semantic Clustering Behavior

Vector embeddings using text-embedding-3-small cluster medications by:
1. **Dose** (500mg, 40mg, 4mg)
2. **Form** (tablet, capsule)
3. **Drug class** (antibiotic, statin, ACE inhibitor)
4. **Combination status** (text contains multiple ingredient names)

They **do NOT** prioritize:
- Specific active ingredient identity
- Standalone vs combination formulation
- Exact dose matching (20mg statin ≈ 40mg statin semantically)

### Why Normalization Wasn't Enough

The normalization strategy successfully aligned database and query text formats:
- Removed salt forms: "amoxicillin (as trihydrate)" → "amoxicillin"
- Standardized units: "0.5g" → "500mg"
- Extracted active ingredients: "Brand + ingredient" → "ingredient"

However, this made the problem **worse** by making all drugs in the same class more semantically similar to each other.

## Comparison with Investigation Results

The deep investigation (`investigate-embedding-failure.ts`) showed different results because it **filtered to amoxicillin drugs only**:

```
Investigation (amoxicillin-only dataset):
  Query: "Amoxicillin 500mg"
  #1: Amoxicillin Capsule 500mg STANDALONE (82.0%) ✅ CORRECT

Validation Test (full PBS dataset):
  Query: "Amoxicillin 500mg"
  #1: Dicloxacillin Capsule 500mg (64.0%) ❌ WRONG
  #4: Amoxicillin + clavulanic acid (60.7%) ⚠️ COMBO
```

This proves the embeddings **work within ingredient subsets** but **fail across the full medication library** due to inter-class semantic similarity.

## Technical Implications

### What Pure Vector Search CAN Do
- ✅ Distinguish between drug classes when ingredient names are unique (paracetamol, aspirin)
- ✅ Match exact duplicates with high confidence (83%+ similarity)
- ✅ Fuzzy matching for typos and abbreviations
- ✅ Semantic understanding of medical context

### What Pure Vector Search CANNOT Do
- ❌ Distinguish between similar drug classes (penicillins, cephalosporins)
- ❌ Prefer standalone over combination formulations
- ❌ Match exact dose when similar doses exist
- ❌ Prioritize exact ingredient when class semantics dominate

## Required Architecture Change

### Current Approach (Insufficient)
```
User Query → Normalize → Embed → Vector KNN Search → Top Results
```

### Required Approach (Hybrid Retrieval)
```
User Query → Normalize → Split Processing:

  Path 1 (Lexical - Primary):
    → Extract ingredient via regex/NLP
    → Filter database WHERE normalized_text ILIKE '%ingredient%'
    → Boost standalone formulations (display_name NOT LIKE '%+%')
    → Boost exact dose matches
    → Score by text similarity

  Path 2 (Vector - Reranker):
    → Embed query
    → Vector KNN on lexically-filtered subset (not full dataset)
    → Use as weak reranker for ambiguous cases

  Merge:
    → Combine lexical results (70% weight) + vector scores (30% weight)
    → Return top K
```

## Recommendations

### Immediate Actions
1. **Do NOT proceed** with IVFFLAT index on `normalized_embedding` for medications
2. **Do NOT deploy** pure vector search for medication matching
3. **Do proceed** with MBS procedure testing (may work better - procedures are more unique)

### Phase 1.5 Architecture Revision
1. Implement hybrid retrieval for medications:
   - PostgreSQL `pg_trgm` extension for fuzzy text matching
   - Regex-based ingredient extraction
   - Lexical filtering as primary method
   - Vector embeddings as secondary reranker only
2. Keep pure vector search for procedures (pending validation)
3. Design entity-specific retrieval strategies:
   - Medications: Lexical-first hybrid
   - Procedures: Pure vector (if validation passes)
   - Conditions: Pure vector (similar to procedures)
   - Providers: Lexical-only (names, addresses)

### Code Changes Required
1. Create `search_medications_hybrid()` RPC function
2. Implement ingredient extraction logic
3. Add standalone preference scoring
4. Combine lexical + vector scores with tunable weights
5. Extended validation with 50-100 medications (target: 99% correct in top 20)

## Cost Impact

**Current Plan:**
- Pure vector: $0.02/1M input tokens
- Search cost: 1 embedding per query (~$0.000001)

**Hybrid Approach:**
- Lexical search: Free (PostgreSQL built-in)
- Vector reranking: Same cost but on smaller subset
- **Net cost: ~Same or lower** (fewer vector comparisons)

## Timeline Impact

- Phase 1.5 implementation: +2-3 days for hybrid retrieval
- Extended validation: +1 day
- Total delay: ~3-4 days vs original pure vector plan

## Validation Gate

Before proceeding to Phase 1.5 production:
- ✅ MBS procedure validation (50 test cases, >95% success)
- ✅ Medication hybrid retrieval (100 test cases, >99% correct in top 20)
- ✅ Performance benchmarking (search latency <500ms)
- ✅ Cost validation (cost per 1000 searches <$0.10)

## Conclusion

Pure vector embeddings using text-embedding-3-small are **fundamentally insufficient** for medication matching in a multi-drug-class library. The semantic clustering behavior prioritizes drug class, dose, and form over specific ingredient identity.

**Normalization was necessary but not sufficient.** We need lexical matching as the primary method with vector embeddings as a weak reranker.

This finding was discovered through empirical testing and validated across 5 different medication classes. The pattern is consistent and reproducible.

**Action:** Pivot from pure vector to hybrid retrieval before proceeding with Phase 1.5 implementation.
