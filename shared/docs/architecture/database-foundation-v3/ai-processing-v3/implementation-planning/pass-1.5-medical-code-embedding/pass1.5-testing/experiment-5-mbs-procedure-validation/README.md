# Experiment 5: MBS Procedure Matching Validation

**Purpose:** Validate whether OpenAI embeddings are sufficient for MBS procedure code matching, or if domain-specific models or hybrid search strategies are needed (similar to medications).

**Date:** October 22, 2025

**Status:** Planning

---

## Hypothesis

**Null Hypothesis:** OpenAI text-embedding-3-small provides adequate accuracy (>90%) for MBS procedure matching using pure vector search.

**Alternative Hypothesis:** MBS procedures require:
- Medical domain-specific embeddings (e.g., BioBERT, Clinical-ModernBERT), OR
- Hybrid search (semantic + lexical) like medications, OR
- Specialized anatomy/procedure extraction

---

## Background

### Current Strategy (Unvalidated)

From PASS-1.5-MASTER-PLAN.md:

```
Entity Type: procedure
Embedding Model: OpenAI text-embedding-3-small (1536 dimensions)
Search Strategy: Simple vector search
Code System: MBS (6,001 regional Australian codes)
Status: NEEDS VALIDATION
```

**Why Validation is Critical:**
- Medications required specialized handling (SapBERT + hybrid search) per Experiment 4
- Procedures may have similar challenges:
  - Anatomy variations (e.g., "left knee" vs "knee, left")
  - Procedure synonyms (e.g., "removal" vs "excision")
  - MBS-specific terminology vs clinical language
  - Multi-word procedure descriptions with diluted signal

### MBS Code Characteristics

**MBS Database:** 6,001 Australian procedure codes

**Example MBS Codes:**
```
Code: 23
Display: "Professional attendance by a general practitioner"

Code: 104
Display: "Electrocardiography - tracing only"

Code: 30071
Display: "Knee, arthroscopy of, not being a service to which item 30076, 30077, 30078 or 30079 applies"
```

**Challenges:**
- Long descriptive text (up to 200+ characters)
- Negative definitions ("not being a service to which...")
- Anatomy-specific codes (knee, shoulder, hip)
- Multiple similar codes differing by technique or approach

---

## Experiment Design

### Phase 1: Test Data Creation

**Target:** 30-50 realistic procedure entities from actual medical documents

**Entity Sources:**
1. Pass 1 outputs from real medical documents (if available)
2. Manually created realistic entities based on common procedures
3. Edge cases: anatomical variations, synonyms, abbreviations

**Entity Categories:**

| Category | Count | Examples |
|----------|-------|----------|
| GP Consultations | 5-8 | "GP visit", "Telehealth consult", "Extended consultation" |
| Diagnostic Tests | 5-8 | "ECG", "Blood pressure check", "Spirometry" |
| Imaging | 5-8 | "X-ray left knee", "Ultrasound abdomen", "CT scan head" |
| Minor Procedures | 5-8 | "Wound dressing", "Suture removal", "Joint injection" |
| Surgical Procedures | 5-8 | "Knee arthroscopy", "Cataract surgery", "Skin lesion excision" |
| Allied Health | 5-8 | "Physiotherapy", "Dietitian consult", "Podiatry treatment" |

**Validation:**
- Manual review by medical expert (if possible)
- Cross-reference with actual patient records
- Ground truth: Correct MBS code for each entity

### Phase 2: OpenAI Baseline Testing

**Test:** Pure OpenAI vector search (current strategy)

**Metrics:**
- Top-1 accuracy (correct code in #1 position)
- Top-5 accuracy (correct code in top-5)
- Top-20 accuracy (correct code in top-20)
- Average similarity score for correct matches
- Failure pattern analysis

**Success Criteria:**
- Top-20 accuracy ≥90% → OpenAI sufficient, proceed with simple vector search
- Top-20 accuracy 70-89% → Consider hybrid search or domain model
- Top-20 accuracy <70% → Requires specialized approach (like medications)

### Phase 3: Failure Analysis

**If OpenAI underperforms (<90% top-20):**

1. **Categorize Failures:**
   - Anatomy-specific failures (e.g., "left knee" vs "knee")
   - Synonym failures (e.g., "ECG" vs "electrocardiography")
   - Abbreviation failures (e.g., "BP" vs "blood pressure")
   - Multi-word description dilution

2. **Test Alternative Strategies:**
   - **Option A: Medical Domain Models**
     - Test BioBERT embeddings
     - Test Clinical-ModernBERT embeddings
     - Compare accuracy improvement vs OpenAI

   - **Option B: Hybrid Search (Semantic + Lexical)**
     - Extract procedure type and anatomy from query
     - Lexical filter on `normalized_embedding_text` or `search_text`
     - Vector reranking on filtered subset
     - Measure accuracy improvement

   - **Option C: Anatomy + Procedure Extraction**
     - Parse query into: [anatomy] + [procedure type]
     - Search procedures by anatomy first (if specified)
     - Then vector search within anatomy subset
     - Handle laterality (left/right/bilateral)

### Phase 4: Recommendation

Based on results, recommend ONE of:

1. **Keep OpenAI + Simple Vector Search** (if ≥90% accuracy)
   - Update master plan status: VALIDATED
   - Document confidence in approach
   - Monitor production accuracy

2. **Upgrade to Domain Model** (if domain model >> OpenAI)
   - Specify which model (BioBERT, Clinical-ModernBERT)
   - Document accuracy improvement
   - Plan migration strategy

3. **Implement Hybrid Search** (if lexical helps significantly)
   - Design procedure-specific hybrid function
   - Define confidence thresholds
   - Plan gradient candidate system (like medications)

4. **Custom Anatomy Extraction** (if anatomy is main issue)
   - Build anatomy parser
   - Create anatomy-filtered search
   - Document laterality handling

---

## File Structure

```
experiment-5-mbs-procedure-validation/
├── README.md (this file)
├── test-data/
│   ├── realistic-procedure-entities.json     # 30-50 validated entities with ground truth
│   └── entity-categories.md                  # Documentation of test categories
├── scripts/
│   ├── test-openai-baseline.ts              # OpenAI vector search test
│   ├── test-domain-models.ts                # BioBERT, Clinical-ModernBERT tests (if needed)
│   ├── test-hybrid-search.ts                # Hybrid semantic + lexical (if needed)
│   └── analyze-failures.ts                  # Failure pattern analysis
├── results/
│   ├── openai-baseline-results.json         # Top-20 results for each entity
│   ├── failure-analysis.md                  # Categorized failure patterns
│   └── comparison-matrix.md                 # Model/strategy comparison (if tested)
└── ANALYSIS_SUMMARY.md                      # Final findings and recommendation
```

---

## Dependencies

**Database:**
- MBS codes already loaded: 6,001 codes in `regional_medical_codes` table
- OpenAI embeddings already generated (from Phase 4 of master plan)
- Need to verify `normalized_embedding_text` populated for MBS

**APIs:**
- OpenAI API (for baseline testing)
- HuggingFace API (if testing BioBERT or Clinical-ModernBERT)

**Environment:**
- Same as Experiment 4
- Supabase connection
- TypeScript execution environment

---

## Timeline Estimate

**Phase 1 - Test Data Creation:** 2-4 hours
- Collect realistic procedure entities
- Validate ground truth MBS codes
- Document entity categories

**Phase 2 - OpenAI Baseline:** 1-2 hours
- Run OpenAI vector search test
- Collect top-20 results
- Calculate accuracy metrics

**Phase 3 - Failure Analysis:** 2-4 hours
- Categorize failures
- Test alternative strategies (if needed)
- Run comparison tests

**Phase 4 - Recommendation:** 1 hour
- Document findings
- Update master plan
- Provide clear next steps

**Total:** 6-11 hours of work

---

## Success Metrics

**Primary:**
- Top-20 accuracy for OpenAI baseline
- Clear pass/fail decision (≥90% = pass)

**Secondary:**
- Failure pattern categorization
- Alternative strategy performance (if tested)
- Specific recommendation for production implementation

---

## Next Steps

1. Create `realistic-procedure-entities.json` with 30-50 validated entities
2. Write `test-openai-baseline.ts` script (similar to Experiment 4 structure)
3. Run baseline test and collect results
4. Analyze failures and determine if alternative strategies needed
5. Document findings in `ANALYSIS_SUMMARY.md`
6. Update `PASS-1.5-MASTER-PLAN.md` with validation status

---

## References

**Similar Experiments:**
- Experiment 2: SapBERT vs OpenAI for medications (17.3pp improvement)
- Experiment 4: Realistic medication entities, hybrid search validation (73.3% → 95%+ expected)

**Master Plan:**
- `PASS-1.5-MASTER-PLAN.md` - Entity routing table (line 339)
- `PASS-1.5-MASTER-PLAN.md` - Procedure strategy notes (line 363)

**MBS Data:**
- `shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/code-data-preparation/mbs/polished/mbs_codes_polished_v2.json`
