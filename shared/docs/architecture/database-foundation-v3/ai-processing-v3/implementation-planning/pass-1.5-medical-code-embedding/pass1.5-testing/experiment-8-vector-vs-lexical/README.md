# Experiment 8: Vector Search vs Lexical Search Comparison

**Created**: November 2, 2025
**Purpose**: Compare semantic vector search vs keyword lexical search for LOINC code matching
**Database**: 102,891 LOINC codes with embeddings (text-embedding-3-small, 1536 dimensions)

## Why This Experiment Exists

**Experiment 7 was fundamentally flawed**:
- Used LEXICAL search (SQL ILIKE) to establish "ground truth"
- Tested SEMANTIC search (vector embeddings) against lexical ground truth
- Declared failure when vector search returned different codes than lexical search
- **Problem**: Vector and lexical search are DIFFERENT algorithms that SHOULD return different results

**Experiment 8 corrects this**:
- Generates TWO independent lists: vector search AND lexical search
- Compares both methods without assuming one is "correct"
- Manual human review (by user) determines which codes are actually clinically relevant
- Quantitative analysis of similarity scores shows confidence levels

---

## Methodology

### Input: Clinical Entities with Variants

For each test entity, we create 3 search query variants:

1. **Clinical terminology**: How a clinician would search
   - Example: "glucose serum plasma measurement"

2. **Layperson terminology**: How a patient would search
   - Example: "blood sugar level test"

3. **Abbreviation**: Common medical abbreviations
   - Example: "BG BSL"

### Two Search Methods

**Method A: Vector Search (Semantic)**
- Embed query using OpenAI text-embedding-3-small (1536 dimensions)
- Execute vector similarity search via `search_regional_codes` RPC
- Search ALL 102,891 LOINC codes with embeddings
- Rank by cosine similarity (1.0 = perfect match, 0.0 = no match)
- Return top 20 codes with similarity scores

**Method B: Lexical Search (Keyword) - ENHANCED**
- Full-text search on `search_text` field (PostgreSQL tsquery/tsvector)
- Keyword matching with relevance ranking
- Calculate vector similarity for each lexical result
- Return top 20 codes with BOTH relevance scores AND similarity scores
- Enables comparison: do high-relevance codes also have high similarity?

### Outputs for Each Query

For every query variant (18 total = 6 entities × 3 variants):

**Vector Results (JSON)**:
```json
{
  "entity_id": 1,
  "entity_text": "Blood glucose measurement",
  "variant_type": "clinical",
  "query": "glucose serum plasma blood measurement",
  "method": "vector",
  "results": [
    {
      "rank": 1,
      "code_value": "2345-7",
      "display_name": "Glucose [Mass/volume] in Serum or Plasma",
      "entity_type": "lab_result",
      "similarity_score": 0.92
    },
    // ... 19 more results
  ]
}
```

**Lexical Results (JSON) - ENHANCED**:
```json
{
  "entity_id": 1,
  "entity_text": "Blood glucose measurement",
  "variant_type": "clinical",
  "query": "glucose serum plasma blood measurement",
  "method": "lexical",
  "results": [
    {
      "rank": 1,
      "code_value": "2339-0",
      "display_name": "Glucose [Mass/volume] in Blood",
      "entity_type": "lab_result",
      "relevance_score": 0.85,
      "similarity_score": 0.91
    },
    // ... 19 more results
  ]
}
```
**Note**: relevance_score = PostgreSQL ts_rank (text matching), similarity_score = vector cosine similarity (semantic matching)

**ENHANCEMENT BENEFIT**: Having both scores for lexical results enables critical analysis:
- **Correlation**: Do high-relevance codes also have high similarity?
- **Lexical-strong, Vector-weak**: Codes that match keywords but lack semantic similarity (false positives)
- **Vector-strong, Lexical-weak**: Codes with semantic similarity but missing exact keywords (might miss in lexical search)
- **Ranking comparison**: How does lexical ranking compare to vector ranking for the SAME codes?

### Manual Review Process

User manually reviews both lists and marks codes as:
- **Relevant**: Clinically appropriate match for the query
- **Not Relevant**: Wrong code (wrong test type, wrong specimen, wrong category)

Results saved in `analysis/manual-review.json`:
```json
{
  "entity_id": 1,
  "variant_type": "clinical",
  "query": "glucose serum plasma blood measurement",
  "vector_relevant_codes": ["2345-7", "2339-0", "14749-6"],
  "lexical_relevant_codes": ["2339-0", "2345-7", "32016-8"],
  "overlap": ["2345-7", "2339-0"],
  "vector_only": ["14749-6"],
  "lexical_only": ["32016-8"],
  "reviewer_notes": "Vector found Moles/volume variant which is acceptable. Lexical found finger stick variant."
}
```

### Quantitative Analysis

**Precision Metrics**:
- Precision@5 = relevant codes in top 5 / 5
- Precision@10 = relevant codes in top 10 / 10
- Precision@20 = relevant codes in top 20 / 20

**Similarity Score Analysis** (Vector only):
- Are high-scoring results (>0.8) actually relevant?
- What's the average similarity of relevant vs non-relevant codes?
- Is there a clear threshold for "good match"?

**Entity Type Accuracy**:
- Percentage of results matching expected entity type (lab_result vs vital_sign vs observation)

**Overlap Analysis**:
- How many codes appear in BOTH vector and lexical top 20?
- Which method finds more unique relevant codes?

---

## Test Entities

### Entity 1: Blood Glucose Measurement
**Category**: Lab test
**Expected Entity Type**: lab_result

**Variants**:
1. Clinical: "glucose serum plasma blood measurement"
2. Layperson: "blood sugar level test"
3. Abbreviation: "BG BSL glucose"

**Clinical Context**: Common lab test for diabetes monitoring

---

### Entity 2: Hemoglobin A1c Test
**Category**: Lab test
**Expected Entity Type**: lab_result

**Variants**:
1. Clinical: "hemoglobin a1c glycated blood"
2. Layperson: "a1c diabetes blood test"
3. Abbreviation: "HbA1c"

**Clinical Context**: 3-month average blood glucose measurement

---

### Entity 3: Blood Pressure Measurement
**Category**: Vital sign
**Expected Entity Type**: vital_sign

**Variants**:
1. Clinical: "blood pressure systolic diastolic"
2. Layperson: "BP reading pressure"
3. Abbreviation: "BP SBP DBP"

**Clinical Context**: Cardiovascular vital sign measurement

---

### Entity 4: Total Cholesterol Test
**Category**: Lab test
**Expected Entity Type**: lab_result

**Variants**:
1. Clinical: "cholesterol total serum plasma"
2. Layperson: "cholesterol level blood test"
3. Abbreviation: "TC chol"

**Clinical Context**: Lipid panel component for cardiovascular risk

---

### Entity 5: Pregnancy Test
**Category**: Clinical observation
**Expected Entity Type**: observation

**Variants**:
1. Clinical: "pregnancy test result"
2. Layperson: "pregnant test positive negative"
3. Abbreviation: "preg test"

**Clinical Context**: Qualitative pregnancy determination

---

### Entity 6: ECG Findings
**Category**: Diagnostic test
**Expected Entity Type**: observation

**Variants**:
1. Clinical: "electrocardiogram findings impression"
2. Layperson: "heart test results ECG"
3. Abbreviation: "EKG ECG"

**Clinical Context**: Cardiac electrical activity interpretation

---

## Integration with Pass 1 Output

**Critical Note**: Pass 1 entity detection outputs include 5 aliases/synonyms for each detected clinical entity to aid Pass 1.5 vector matching.

**Example Pass 1 Output**:
```json
{
  "entity_text": "Blood glucose",
  "entity_type": "lab_result",
  "aliases": [
    "glucose blood",
    "blood sugar",
    "BG",
    "serum glucose",
    "plasma glucose"
  ]
}
```

**Experiment 8 should test**:
- What if we embed ALL 5 aliases and average the similarity scores?
- What if we take the MAX similarity across all aliases?
- Does including aliases improve match quality?

This will be addressed in a future variation of Experiment 8.

---

## STRICT Execution Checklist

**PURPOSE**: Prevent shortcuts, assumptions, and fabricated data

### Phase 1: Preparation (MUST COMPLETE ALL)

- [ ] Verify 102,891 LOINC codes exist with embeddings
  ```sql
  SELECT COUNT(*) FROM regional_medical_codes
  WHERE code_system = 'loinc' AND embedding IS NOT NULL;
  -- Must return: 102891
  ```

- [ ] Verify OpenAI API key is configured
  ```bash
  echo $OPENAI_API_KEY | head -c 20
  # Should show: sk-proj-...
  ```

- [ ] Verify Supabase credentials are configured
  ```bash
  echo $SUPABASE_SERVICE_ROLE_KEY | head -c 20
  # Should show valid key
  ```

- [ ] Test vector search RPC function works
  ```sql
  SELECT COUNT(*) FROM search_regional_codes(
    (SELECT embedding FROM regional_medical_codes WHERE code_value = '2345-7' LIMIT 1),
    NULL, 'AUS', 10, 0.0
  );
  -- Should return: 10
  ```

- [ ] Create test entities file (`test-data/test-entities.json`)
- [ ] Verify file exists with 6 entities × 3 variants = 18 queries

### Phase 2: Vector Search Execution (NO SHORTCUTS)

- [ ] Run vector search script for Entity 1, Variant 1
  - [ ] Generate OpenAI embedding (ACTUAL API CALL)
  - [ ] Execute database search (ACTUAL RPC CALL)
  - [ ] Save results with similarity scores
  - [ ] Verify results file exists with 20 codes

- [ ] Run vector search for Entity 1, Variant 2
  - [ ] Generate embedding
  - [ ] Execute search
  - [ ] Save results
  - [ ] Verify file exists

- [ ] Run vector search for Entity 1, Variant 3
  - [ ] Generate embedding
  - [ ] Execute search
  - [ ] Save results
  - [ ] Verify file exists

- [ ] Repeat for Entities 2-6 (15 more queries)
  - [ ] Entity 2 × 3 variants
  - [ ] Entity 3 × 3 variants
  - [ ] Entity 4 × 3 variants
  - [ ] Entity 5 × 3 variants
  - [ ] Entity 6 × 3 variants

- [ ] Verify 18 vector result files exist
  ```bash
  ls -1 results/vector-*.json | wc -l
  # Must show: 18
  ```

### Phase 3: Lexical Search Execution (NO SHORTCUTS)

- [ ] Run lexical search for Entity 1, Variant 1
  - [ ] Execute PostgreSQL full-text search
  - [ ] Save results with relevance scores
  - [ ] Verify file exists with 20 codes

- [ ] Run lexical search for Entity 1, Variant 2
- [ ] Run lexical search for Entity 1, Variant 3
- [ ] Repeat for Entities 2-6 (15 more queries)

- [ ] Verify 18 lexical result files exist
  ```bash
  ls -1 results/lexical-*.json | wc -l
  # Must show: 18
  ```

### Phase 4: Comparison Report Generation

- [ ] Generate side-by-side comparison for each query
  - [ ] Load vector results
  - [ ] Load lexical results
  - [ ] Calculate overlap
  - [ ] Identify unique codes in each method
  - [ ] Format for manual review

- [ ] Create summary statistics
  - [ ] Average similarity scores for vector
  - [ ] Average relevance scores for lexical
  - [ ] Overlap percentages
  - [ ] Entity type distribution

- [ ] Verify comparison report exists
  ```bash
  test -f analysis/comparison-report.json && echo "EXISTS"
  ```

### Phase 5: Manual Review Preparation

- [ ] Create manual review template
  - [ ] List all 18 queries
  - [ ] Show top 20 from vector
  - [ ] Show top 20 from lexical
  - [ ] Provide checkboxes for relevant/not relevant

- [ ] Generate human-readable review file (Markdown or JSON)

- [ ] Print review instructions for user

### Validation Gates (MUST PASS BEFORE CONTINUING)

**Gate 1: Data Existence**
```bash
# MUST show 18 files for each
ls -1 results/vector-*.json | wc -l
ls -1 results/lexical-*.json | wc -l
```

**Gate 2: Data Structure**
```bash
# Each file MUST have 20 results
for f in results/vector-*.json; do
  jq '.results | length' "$f"
done
# All should show: 20
```

**Gate 3: Similarity Scores**
```bash
# Vector results MUST have similarity_score field
jq '.results[0].similarity_score' results/vector-entity-1-clinical.json
# Should show number between 0.0 and 1.0
```

**Gate 4: No Duplicate Codes**
```bash
# Within each result file, no duplicate codes
jq '.results[].code_value | unique | length' results/vector-entity-1-clinical.json
# Should match total results: 20
```

---

## Expected Timeline

- **Phase 1 (Preparation)**: 30 minutes
- **Phase 2 (Vector searches)**: 45 minutes (18 queries × ~2.5 min each)
- **Phase 3 (Lexical searches)**: 15 minutes (18 queries × ~0.5 min each)
- **Phase 4 (Comparison report)**: 30 minutes
- **Phase 5 (Manual review prep)**: 15 minutes

**Total**: ~2.5 hours

---

## Success Criteria

**NOT accuracy-based** - this experiment compares methods, not validates absolute performance.

**Success = Complete Data Collection**:
- 18 vector search results with actual similarity scores
- 18 lexical search results with actual relevance scores
- Side-by-side comparison report
- Manual review template ready for user inspection

**User will determine**:
- Which method found more relevant codes
- Whether vector search adds value over lexical
- If embeddings are working correctly
- Whether to proceed with Pass 1.5 implementation

---

## Files Structure

```
experiment-8-vector-vs-lexical/
├── README.md (this file)
├── EXECUTION_CHECKLIST.md (copy of checklist for runtime tracking)
├── test-data/
│   └── test-entities.json (6 entities × 3 variants = 18 queries)
├── scripts/
│   ├── run-vector-searches.ts (embed + search, save top 20)
│   ├── run-lexical-searches.ts (full-text search, save top 20)
│   └── generate-comparison-report.ts (side-by-side analysis)
├── results/
│   ├── vector-entity-1-clinical.json
│   ├── vector-entity-1-layperson.json
│   ├── vector-entity-1-abbreviation.json
│   ├── ... (18 vector result files)
│   ├── lexical-entity-1-clinical.json
│   ├── ... (18 lexical result files)
│   └── summary-stats.json
└── analysis/
    ├── comparison-report.json (all queries, both methods)
    ├── manual-review-template.md (for user to fill out)
    └── RESULTS_SUMMARY.md (to be written after manual review)
```

---

## Critical Lessons from Experiment 7

**What went wrong**:
1. Assumed lexical search = "ground truth"
2. Never actually executed the tests (empty results directory)
3. Fabricated failure data in summary report
4. Didn't understand that vector ≠ lexical (they serve different purposes)

**What we're doing differently**:
1. No assumptions - both methods get equal treatment
2. Strict checklist with verification gates
3. MUST generate actual data files before analysis
4. Manual human review is the ONLY ground truth
5. Comparison shows strengths/weaknesses of each method

---

## Notes

- This experiment does NOT test embedding quality directly
- It tests whether vector search provides value BEYOND lexical search
- User manual review is the gold standard
- Quantitative metrics (similarity scores, overlap) inform but don't decide
- Future experiments can test Pass 1 alias integration

