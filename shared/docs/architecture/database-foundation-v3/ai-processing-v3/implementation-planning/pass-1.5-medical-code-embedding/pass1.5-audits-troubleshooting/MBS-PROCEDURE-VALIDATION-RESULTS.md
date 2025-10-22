# MBS Procedure Validation Results

---
**HISTORICAL CONTEXT:**

This validation (October 20, 2025) tested OpenAI text-embedding-3-small embeddings on MBS procedures and found similar semantic clustering limitations as medications (40% success rate). This investigation validated that pure vector search is insufficient for procedures as well, extending the hybrid search requirement beyond just medications.

SapBERT was not tested on procedures as it is medication-specific. Procedures continue to use OpenAI embeddings but will require hybrid search (lexical + vector) to achieve production-ready accuracy.
---

**Date:** 2025-10-20
**Test Set:** 5 common Australian medical procedures
**Dataset:** 1,000 MBS procedure codes (limited by query)
**Embedding Model:** OpenAI text-embedding-3-small (1536 dimensions)

## Test Results Summary

### Test 1: GP Consultation
```
Query: "GP consultation"
Expected: Standard GP office visit
Top Results:
  #1: Video attendance by GP (50.6%)
  #2: Video attendance by GP (48.4%)
  #3: Group psychotherapy (47.9%)
  #4: Video attendance by GP (46.6%)

Result: ⚠️ PARTIAL FAIL
Issue: Returns video/group consultations, not standard office visit
```

**Analysis:** Clusters by "consultation" concept, cannot distinguish delivery method (in-person vs video) or consultation type (individual vs group).

### Test 2: Blood Test
```
Query: "Blood test"
Expected: Standard pathology blood test
Top Results:
  #1: Renal function test with imaging (44.7%)
  #2: Blood for pathology test, collection by femoral (44.5%) ✅
  #3: Blood transfusion (42.7%)
  #4: Liver biopsy (38.8%)

Result: ✅ PASS (but #2, not #1)
Issue: Returns blood-related procedures regardless of purpose
```

**Analysis:** Correct match at #2, but clusters all "blood" procedures together (collection, transfusion, biopsy).

### Test 3: X-ray Chest
```
Query: "X-ray chest"
Expected: Chest X-ray imaging
Top Results:
  #1: Spine—thoracic (44.3%) ❌
  #2: Bone densitometry (41.8%)
  #3: Radionuclide colonic transit study (36.1%)

Result: ❌ FAIL
Issue: Returns wrong imaging type, wrong anatomy
```

**Analysis:** Semantic clustering by "thoracic" body region, not by imaging modality. Complete failure.

### Test 4: ECG (Electrocardiogram)
```
Query: "ECG"
Expected: Electrocardiogram heart test
Top Results:
  #1: Electrocorticography (69.2%) ⚠️ (brain, not heart)
  #2: Signal averaged ECG recording (60.7%) ✅
  #3: Multi channel ECG monitoring (52.6%) ✅
  #4: Electroencephalography (49.1%) (brain)

Result: ✅ STRONG PASS
Issue: Brain EEG clusters with heart ECG (similar abbreviation)
```

**Analysis:** ECG is semantically unique enough to work well. Top result is brain electrocorticography (similar abbreviation), but #2 and #3 are correct.

### Test 5: Skin Biopsy
```
Query: "Skin biopsy"
Expected: Dermatology skin tissue sample
Top Results:
  #1: Lymph node biopsy (50.5%)
  #2: Pleura biopsy (50.3%)
  #3: Bone marrow biopsy (50.2%)
  #4: Bone marrow biopsy (49.1%)
  #5: Breast biopsy (49.1%)
  #10: Malignant skin lesion excision (47.0%) ⚠️ (not biopsy)

Result: ❌ FAIL
Issue: Returns biopsies of wrong anatomical sites
```

**Analysis:** Clusters by "biopsy" procedure type, cannot distinguish anatomical location.

## Overall Performance

**Success Rate:** 2/5 (40%) - Same as medication baseline before normalization
- ECG: Strong pass
- Blood test: Weak pass (#2 position)
- GP consultation: Fail
- X-ray chest: Fail
- Skin biopsy: Fail

## Root Cause Analysis

### Semantic Clustering Patterns for Procedures

Vector embeddings cluster MBS procedures by:
1. **Procedure type** (biopsy, consultation, imaging, monitoring)
2. **Medical specialty** (cardiology, radiology, pathology)
3. **Delivery method** (video, in-person, imaging-guided)

They **do NOT** reliably distinguish:
- Specific anatomical location (chest vs spine, skin vs lymph node)
- Imaging modality (X-ray vs CT vs MRI)
- Procedure context (diagnostic vs therapeutic)
- Specificity level (standard GP visit vs video consultation)

## Comparison with Medications

**Medications (before normalization):**
- 40% success rate (2/5)
- Clusters by drug class, dose, form

**Procedures (with normalization):**
- 40% success rate (2/5)
- Clusters by procedure type, specialty

**Conclusion:** Procedures have **similar fundamental limitations** to medications, though with different clustering patterns.

## Why Some Procedures Work

**ECG Success Factors:**
- Unique abbreviation with specific medical meaning
- Limited semantic overlap with other procedures
- "Electro + cardio + gram" is distinctive word combination

**Blood Test Partial Success:**
- "Blood" + "test" is common enough to have many exact matches
- Pathology codes include these keywords verbatim

## Why Most Procedures Fail

**X-ray Chest Failure:**
- "Chest" overlaps with "thoracic", "respiratory", "cardiovascular"
- "X-ray" clusters with all imaging modalities
- No strong anatomical specificity signal

**Skin Biopsy Failure:**
- "Biopsy" dominates semantic signal
- "Skin" is too generic (overlaps with tissue, lesion, surface)
- Procedure type overwhelms anatomical location

**GP Consultation Failure:**
- "Consultation" is extremely generic
- "GP" expands to many synonyms (general practitioner, medical practitioner, physician)
- Context modifiers (video, group, initial, comprehensive) have weak semantic weight

## Implications for Phase 1.5

### Pure Vector Search: NOT RECOMMENDED for Procedures

While procedures perform slightly better than medications on unique terms (ECG), they fail on:
- Generic procedures (GP visit, blood test)
- Anatomically-specific procedures (chest X-ray, skin biopsy)
- Context-sensitive procedures (initial consultation vs review)

**Estimated production accuracy:** 40-60% depending on procedure type mix

### Hybrid Retrieval: RECOMMENDED

Similar to medications, procedures need **lexical matching as primary method**:

```
Procedure Hybrid Retrieval Strategy:

Path 1 (Lexical - Primary):
  → Extract key terms (anatomy + procedure type)
  → Filter: WHERE search_text ILIKE '%chest%' AND search_text ILIKE '%x-ray%'
  → Boost exact MBS code matches (if user provides code number)
  → Score by term frequency

Path 2 (Vector - Reranker):
  → Embed query
  → Vector KNN on lexically-filtered subset
  → Use as weak reranker for ambiguous cases

Merge:
  → Combine lexical (70%) + vector (30%)
  → Return top K
```

## Test Quality Assessment

**Limitations:**
- Only 1,000 procedures fetched (limited by Supabase default)
- Small test set (5 procedures)
- No MBS code verification in database

**Strengths:**
- Covers different procedure types (consultation, pathology, imaging, monitoring, biopsy)
- Tests common clinical scenarios
- Consistent methodology with medication tests

## Recommendations

1. **Do NOT use pure vector search for procedures** - 40% accuracy is insufficient
2. **Implement hybrid retrieval** - Same architecture as medications:
   - Lexical filtering on anatomy + procedure type
   - Vector reranking for semantic refinement
   - MBS code exact matching as highest priority
3. **Extended validation** - 50-100 procedure test set with manual verification
4. **Entity-specific tuning** - Procedures may need different lexical/vector weights than medications

## Next Steps

1. Implement hybrid retrieval for both medications and procedures
2. Design procedure-specific lexical patterns:
   - Anatomy extraction (chest, skin, blood, heart)
   - Procedure type extraction (biopsy, X-ray, consultation, test)
   - MBS code regex matching
3. Extended validation with comprehensive test sets
4. Performance benchmarking (search latency, cost)

## Conclusion

Pure vector embeddings are **insufficient for MBS procedure matching**, showing the same semantic clustering limitations as medications. While unique procedures (ECG) work well, generic and anatomically-specific procedures fail at a 60% rate.

**Recommendation:** Implement hybrid retrieval (lexical + vector) for all Pass 1.5 entity types (medications, procedures, conditions) before production deployment.
