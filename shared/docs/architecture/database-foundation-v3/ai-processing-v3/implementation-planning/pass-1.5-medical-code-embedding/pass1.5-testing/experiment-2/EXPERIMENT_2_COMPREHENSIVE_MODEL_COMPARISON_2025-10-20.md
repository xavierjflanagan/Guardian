# Experiment 2: Comprehensive Medical Embedding Model Comparison

**Date:** 2025-10-20
**Experiment ID:** EXP-002-MODEL-COMPARISON
**Status:** PLANNED
**Duration Estimate:** 60-90 minutes

---

## Executive Summary

**Research Question:** Which embedding model and text extraction strategy provides optimal semantic differentiation for Australian medical codes (PBS medications and MBS procedures)?

**Motivation:** Experiment 1 demonstrated that pure vector embeddings using OpenAI text-embedding-3-small have insufficient semantic differentiation for medical entities (40% success rate). Initial SapBERT testing showed 23.9 point improvement over OpenAI. This experiment comprehensively compares 5 embedding models across 3 text strategies to identify the optimal combination.

**Key Finding from Experiment 1:**
- OpenAI (ingredient-only): Amoxicillin vs Dicloxacillin = 65.8% similarity
- SapBERT (ingredient-only): Amoxicillin vs Dicloxacillin = 41.9% similarity
- **Improvement: 23.9 points (36% reduction in false similarity)**

---

## Hypothesis

**H1 (Primary):** Medical-specific embedding models (SapBERT, BioBERT, PubMedBERT, ClinicalBERT) will demonstrate lower similarity scores between clinically distinct medications and procedures compared to general-purpose models (OpenAI), indicating better semantic differentiation.

**H2 (Secondary):** Ingredient-only text extraction will provide better differentiation than full-text or normalized-text strategies for medications, while procedure-specific extraction will work best for procedures.

**H3 (Tertiary):** Models trained on clinical text (ClinicalBERT) will outperform models trained on research literature (BioBERT, PubMedBERT) for medication/procedure differentiation.

**Null Hypothesis:** There is no meaningful difference in semantic differentiation between medical-specific and general-purpose embedding models.

**Success Criteria:**
- A model shows ≥15 point improvement over OpenAI baseline for key medication pairs
- Consistent improvement across multiple drug classes and procedure types
- One model + strategy combination emerges as clear winner

---

## Methodology

### Test Design: Pairwise Differentiation Analysis

**Approach:** Controlled pairwise comparison of semantically similar but clinically distinct medical entities.

**Why This Design:**
- Differentiation test is meaningful with small sample (doesn't require full 20k database)
- Directly measures what matters: Can the model distinguish between similar drugs/procedures?
- Reproducible and interpretable results
- Cost-effective (150 embeddings vs 100k+ for full database test)

**What We Cannot Test (Requires Full Database):**
- Real-world query matching accuracy (Top-K ranking)
- Production search performance at scale
- Rare entity edge cases

**What This Test DOES Prove:**
- Relative model performance on differentiation task
- Optimal text extraction strategy per entity type
- Whether medical training helps vs general-purpose models

---

## Test Samples

### A. Medications (PBS) - 20 Samples

**Selection Criteria:**
1. Include within-class pairs (e.g., multiple penicillins, multiple statins)
2. Include name-similarity pairs (e.g., Metformin/Metoprolol)
3. Include common medications (paracetamol, amoxicillin)
4. Include specialized medications (cancer drugs, antivirals)
5. Include standalone vs combination formulations
6. Include different therapeutic classes

**Medication Pairs for Differentiation Analysis:**

**Pair 1: Penicillin Antibiotics (Same Class)**
- Amoxicillin 500mg
- Dicloxacillin 500mg
- Flucloxacillin 500mg
- *Expected: Low similarity (different drugs despite same class)*

**Pair 2: Beta-Lactam Antibiotics (Different Classes)**
- Amoxicillin 500mg (penicillin)
- Cefalexin 500mg (cephalosporin)
- *Expected: Medium-low similarity (related but different classes)*

**Pair 3: Name-Similar, Clinically Different**
- Metformin (diabetes)
- Metoprolol (cardiovascular)
- *Expected: Very low similarity (completely different despite names)*

**Pair 4: Statins (Same Class, Different Generations)**
- Atorvastatin 40mg
- Simvastatin 40mg
- Rosuvastatin 40mg
- *Expected: Low-medium similarity (same class, different drugs)*

**Pair 5: Standalone vs Combination**
- Amoxicillin 500mg standalone
- Amoxicillin + clavulanic acid 875mg-125mg
- *Expected: Medium similarity (contains same ingredient)*

**Pair 6: Cancer Drugs (Chemotherapy)**
- Paclitaxel
- Docetaxel
- Carboplatin
- *Expected: Low similarity (different mechanisms despite all being chemo)*

**Pair 7: ACE Inhibitors (Same Class)**
- Perindopril 4mg
- Lisinopril 10mg
- Ramipril 10mg
- *Expected: Low similarity (same class, different drugs)*

**Pair 8: Common Analgesics**
- Paracetamol 500mg
- Ibuprofen 400mg
- *Expected: Very low similarity (different classes)*

**Full Medication List (20 total):**
1. Amoxicillin 500mg
2. Dicloxacillin 500mg
3. Flucloxacillin 500mg
4. Cefalexin 500mg
5. Metformin 500mg
6. Metoprolol 50mg
7. Atorvastatin 40mg
8. Simvastatin 40mg
9. Rosuvastatin 40mg
10. Amoxicillin + clavulanic acid 875mg-125mg
11. Paclitaxel
12. Docetaxel
13. Carboplatin
14. Perindopril 4mg
15. Lisinopril 10mg
16. Ramipril 10mg
17. Paracetamol 500mg
18. Ibuprofen 400mg
19. Aspirin 100mg
20. Clopidogrel 75mg

### B. Procedures (MBS) - 20 Samples

**Selection Criteria:**
1. Include anatomical triplets (e.g., chest/spine/limb X-rays)
2. Include procedure type groups (e.g., multiple biopsies, multiple consultations)
3. Include different complexity levels (minor vs major)
4. Include different specialties

**Procedure Groups for Differentiation Analysis:**

**Group 1: Imaging - X-rays (Same Modality, Different Anatomy)**
- Chest X-ray
- Spine X-ray
- Limb X-ray
- *Expected: Low similarity (same imaging type, different body parts)*

**Group 2: Consultations (Different Contexts)**
- GP consultation (standard)
- GP consultation (long)
- Specialist consultation
- *Expected: Medium similarity (all consultations but different scopes)*

**Group 3: Biopsies (Same Procedure, Different Sites)**
- Skin biopsy
- Liver biopsy
- Lymph node biopsy
- *Expected: Low similarity (same procedure type, different anatomy)*

**Group 4: Surgical Procedures (Different Complexity)**
- Hip replacement (major)
- Knee arthroscopy (moderate)
- Skin lesion excision (minor)
- *Expected: Low similarity (all surgical but very different)*

**Group 5: Diagnostic Tests (Different Systems)**
- ECG (cardiovascular)
- Spirometry (respiratory)
- Blood test (pathology)
- *Expected: Very low similarity (different diagnostic modalities)*

**Full Procedure List (20 total):**
1. Chest X-ray
2. Spine X-ray
3. Limb X-ray
4. GP consultation (standard)
5. GP consultation (long)
6. Specialist consultation
7. Skin biopsy
8. Liver biopsy
9. Lymph node biopsy
10. Hip replacement
11. Knee arthroscopy
12. Skin lesion excision
13. ECG
14. Spirometry
15. Blood test (pathology)
16. Colonoscopy
17. Endoscopy (upper GI)
18. CT scan (head)
19. MRI (spine)
20. Ultrasound (abdomen)

---

## Models Under Test

### 1. OpenAI (Baseline - General Purpose)
- **Model:** `text-embedding-3-small`
- **Dimensions:** 768 (reduced from 1536 for fair comparison with BERT models)
- **Training:** General internet text, code, books
- **API:** OpenAI API
- **Cost:** $0.02 per 1M tokens
- **Validation:** ✅ Baseline (established in Experiment 1)
- **Note:** Using 768 dimensions for direct comparison with BERT-base models

### 2. SapBERT (Medical Entity Linking)
- **Model:** `cambridgeltl/SapBERT-from-PubMedBERT-fulltext`
- **Dimensions:** 768
- **Training:** UMLS concept pairs from PubMed, self-alignment pretraining
- **API:** HuggingFace Inference API (requires mean pooling of token embeddings)
- **Cost:** Free tier (1000 requests/hour)
- **Validation:** ✅ PASSED (4.4s response, 768d embeddings)
- **Expected Performance:** Best for medication differentiation (23.9 point improvement shown in initial testing)
- **Strengths:** Understands medical synonyms, trained on biomedical entity linking

### 3. BioBERT (Biomedical Text Mining)
- **Model:** `dmis-lab/biobert-v1.1`
- **Dimensions:** 768
- **Training:** PubMed abstracts + PMC full-text articles (4.5B words)
- **API:** HuggingFace Inference API (requires mean pooling)
- **Cost:** Free tier
- **Validation:** ✅ PASSED (4.1s response, 768d embeddings)
- **Expected Performance:** Good for biomedical concepts and research terminology
- **Strengths:** General biomedical understanding from research literature

### 4. Clinical-ModernBERT (Clinical Documentation - 2025 Model)
- **Model:** `Simonlee711/Clinical_ModernBERT`
- **Dimensions:** 768
- **Training:** 40M PubMed abstracts + MIMIC-IV clinical notes (2025)
- **API:** HuggingFace Inference API (direct pooled embeddings)
- **Cost:** Free tier
- **Validation:** ✅ PASSED (5.2s response, 768d embeddings)
- **Expected Performance:** May excel at clinical terminology due to EHR training
- **Strengths:** Latest 2025 model with modern architecture (RoPE, Flash Attention), trained on real clinical documentation
- **Note:** Shows 0.1% similarity with SapBERT, suggesting very similar medical representations

---

## Text Extraction Strategies

### Strategy 1: Original Text
**Definition:** Raw `display_name` from database, unmodified

**Example (Medication):**
```
Amoxicillin Capsule 500 mg (Amoxil)
```

**Example (Procedure):**
```
Professional attendance at consulting rooms by a general practitioner of not more than 5 minutes duration
```

**Hypothesis:** Contains all information but may have noise (brands, verbose descriptions)

### Strategy 2: Normalized Text
**Definition:** Cleaned, lowercased `normalized_embedding_text` from database

**Example (Medication):**
```
amoxicillin capsule 500 mg amoxil
```

**Example (Procedure):**
```
professional attendance consulting rooms general practitioner not more than 5 minutes duration
```

**Hypothesis:** Reduces noise while preserving context (dose, form, duration)

### Strategy 3: Core Concept Extraction

**For Medications: Ingredient-Only**
```
amoxicillin
```
*Rationale:* Proven 8.6 point improvement (Experiment 1). Removes dose/form clustering.

**For Procedures: Anatomy + Procedure Type**
```
chest xray
```
*Rationale:* Procedures are defined by WHAT (procedure) + WHERE (anatomy), not duration/setting.

**Extraction Logic:**
- Medications: Remove dose, form, salt, brand → keep active ingredient
- Procedures: Extract anatomy term + procedure term → remove modifiers, duration, setting

---

## Experimental Protocol

### Phase 1: Data Collection (5 minutes)
1. Query Supabase `regional_medical_codes` table via MCP
2. Fetch 20 PBS medications matching test list
3. Fetch 20 MBS procedures matching test list
4. Extract three text versions for each:
   - Original: `display_name`
   - Normalized: `normalized_embedding_text`
   - Core concept: Apply extraction function
5. Validate all samples retrieved successfully
6. Save samples to JSON file for reproducibility

### Phase 2: Embedding Generation (30-45 minutes)
**For each model:**
1. Generate embeddings for all 40 entities × 3 strategies = 120 embeddings per model
2. Save embeddings to intermediate cache file (crash recovery)
3. Handle rate limits (wait 60s if 429 error)
4. Retry failed embeddings up to 3 times
5. Mark completion in progress log

**Total embeddings:** 4 models × 120 = 480 embeddings

**Rate limiting strategy:**
- OpenAI: No limit concern (paid API, ~5 min for 120 embeddings)
- HuggingFace: 1000/hour free tier = ~16/minute safe
- Batch delay: 5 seconds between HuggingFace requests
- Model loading time: 3-5 seconds first request per model
- Expected duration: ~35-45 minutes total

### Phase 3: Similarity Calculation (5 minutes)
For each model + strategy combination:
1. Calculate pairwise cosine similarity for all defined pairs
2. Store results in structured format:
   ```json
   {
     "model": "SapBERT",
     "strategy": "ingredient-only",
     "pair": "Amoxicillin vs Dicloxacillin",
     "similarity": 0.419,
     "entity_type": "medication",
     "pair_type": "same-class"
   }
   ```
3. Save to `similarity_results.json`

### Phase 4: Analysis & Reporting (5 minutes)
1. Generate comparison tables (model × strategy matrix)
2. Identify best model per entity type
3. Identify best strategy per model
4. Calculate improvement over OpenAI baseline
5. Generate final recommendations
6. Update this experiment log with results

---

## Data Recording Structure

### File Outputs

**1. Sample Data:**
```
samples_medications.json - 20 PBS medications × 3 text versions
samples_procedures.json - 20 MBS procedures × 3 text versions
```

**2. Embeddings Cache:**
```
embeddings_openai.json - All OpenAI embeddings
embeddings_sapbert.json - All SapBERT embeddings
embeddings_biobert.json - All BioBERT embeddings
embeddings_clinical_modernbert.json - All Clinical-ModernBERT embeddings
```

**3. Results:**
```
similarity_results.json - All pairwise similarity scores
comparison_tables.md - Formatted comparison tables
final_recommendation.md - Recommended model + strategy
```

**4. Progress Log:**
```
progress.log - Real-time execution log with timestamps
```

All files saved to: `shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/pass1.5-testing/experiment-2/`

---

## Pairwise Comparison Definitions

**Similarity Band Definitions:**
- **VERY LOW:** < 0.30 (30%) - Unrelated entities
- **LOW:** 0.30 - 0.55 (30-55%) - Different but related
- **MEDIUM:** 0.55 - 0.75 (55-75%) - Similar entities
- **HIGH:** > 0.75 (75%+) - Very similar or near-identical

### Medications (15 key pairs)

| Pair ID | Entity 1 | Entity 2 | Pair Type | Expected Similarity |
|---------|----------|----------|-----------|---------------------|
| MED-01 | Amoxicillin 500mg | Dicloxacillin 500mg | same-class | LOW (different drugs) |
| MED-02 | Amoxicillin 500mg | Flucloxacillin 500mg | same-class | LOW (different drugs) |
| MED-03 | Amoxicillin 500mg | Cefalexin 500mg | different-class | LOW (different classes) |
| MED-04 | Metformin 500mg | Metoprolol 50mg | name-similar | VERY LOW (unrelated) |
| MED-05 | Atorvastatin 40mg | Simvastatin 40mg | same-class | LOW (different statins) |
| MED-06 | Atorvastatin 40mg | Rosuvastatin 40mg | same-class | LOW (different statins) |
| MED-07 | Amoxicillin 500mg | Amoxicillin+clavulanic | standalone-vs-combo | MEDIUM (contains same) |
| MED-08 | Paclitaxel | Docetaxel | same-class-chemo | LOW (different taxanes) |
| MED-09 | Paclitaxel | Carboplatin | different-chemo | LOW (different mechanisms) |
| MED-10 | Perindopril 4mg | Lisinopril 10mg | same-class-ACE | LOW (different ACE-I) |
| MED-11 | Perindopril 4mg | Ramipril 10mg | same-class-ACE | LOW (different ACE-I) |
| MED-12 | Paracetamol 500mg | Ibuprofen 400mg | different-analgesic | VERY LOW (different classes) |
| MED-13 | Paracetamol 500mg | Aspirin 100mg | different-analgesic | LOW (different classes) |
| MED-14 | Aspirin 100mg | Clopidogrel 75mg | antiplatelet | LOW (different mechanisms) |
| MED-15 | Dicloxacillin 500mg | Flucloxacillin 500mg | same-class | LOW (different penicillins) |

### Procedures (15 key pairs)

| Pair ID | Entity 1 | Entity 2 | Pair Type | Expected Similarity |
|---------|----------|----------|-----------|---------------------|
| PROC-01 | Chest X-ray | Spine X-ray | same-modality | LOW (different anatomy) |
| PROC-02 | Chest X-ray | Limb X-ray | same-modality | LOW (different anatomy) |
| PROC-03 | Spine X-ray | Limb X-ray | same-modality | LOW (different anatomy) |
| PROC-04 | GP consult standard | GP consult long | same-type-different-duration | MEDIUM (same type) |
| PROC-05 | GP consult standard | Specialist consult | different-provider | LOW (different scope) |
| PROC-06 | Skin biopsy | Liver biopsy | same-procedure | LOW (different anatomy) |
| PROC-07 | Skin biopsy | Lymph node biopsy | same-procedure | LOW (different anatomy) |
| PROC-08 | Hip replacement | Knee arthroscopy | surgery | LOW (different complexity) |
| PROC-09 | Hip replacement | Skin lesion excision | surgery | VERY LOW (major vs minor) |
| PROC-10 | ECG | Spirometry | diagnostic | VERY LOW (different systems) |
| PROC-11 | ECG | Blood test | diagnostic | VERY LOW (different modalities) |
| PROC-12 | Colonoscopy | Endoscopy upper GI | endoscopy | LOW (different sites) |
| PROC-13 | CT head | MRI spine | imaging-advanced | LOW (different anatomy/modality) |
| PROC-14 | CT head | Ultrasound abdomen | imaging | VERY LOW (different modality/anatomy) |
| PROC-15 | Skin biopsy | Skin lesion excision | skin-procedures | MEDIUM (related procedures) |

---

## Success Metrics

### Primary Metric: Differentiation Score Reduction
**Definition:** Lower similarity = better differentiation

**Baseline:** OpenAI ingredient-only
- Amoxicillin vs Dicloxacillin: 65.8%
- Metformin vs Metoprolol: 49.8%

**Success Threshold:**
- ≥15 point reduction for at least 80% of medication pairs
- ≥10 point reduction for at least 70% of procedure pairs

### Secondary Metrics

**1. Consistency Score:**
- % of pairs where model performs better than OpenAI
- Higher = more reliable across different scenarios

**2. Strategy Effectiveness:**
- Which text strategy yields lowest average similarity?
- Does optimal strategy differ by entity type?

**3. Within-Class Discrimination:**
- Can model distinguish drugs within same therapeutic class?
- Critical for avoiding wrong medication matches

**4. Name Confusion Resistance:**
- Metformin vs Metoprolol similarity
- Lower = better resistance to name-based false matches

---

## Risk Mitigation

### Rate Limiting
- **Risk:** HuggingFace free tier: 1000 requests/hour
- **Mitigation:** 5-second delays between requests, exponential backoff on 429 errors
- **Fallback:** If rate limited, pause 60 seconds and resume

### API Failures
- **Risk:** Model loading delays, network errors
- **Mitigation:** Save embeddings after each batch, retry up to 3 times
- **Recovery:** Resume from last saved checkpoint

### Model Unavailability
- **Risk:** HuggingFace model not loaded
- **Mitigation:** Send `wait_for_model: true` parameter, allow 60s warmup
- **Fallback:** Skip model and continue with others, note in results

### Crash Recovery
- **Design:** All intermediate results saved to JSON files
- **Resume:** Script detects existing cache files and skips completed work
- **Validation:** Check file existence before re-running expensive operations

---

## Expected Outcomes

### Scenario 1: SapBERT Dominates (Most Likely)
- SapBERT shows 15-25 point improvement across most pairs
- Ingredient-only strategy works best for medications
- Anatomy+procedure strategy works best for procedures
- **Decision:** Adopt SapBERT with optimized text extraction

### Scenario 2: Multiple Models Perform Well
- SapBERT, BioBERT, PubMedBERT all show 10-15 point improvements
- Different models excel at different entity types
- **Decision:** Evaluate cost/performance tradeoff, likely choose SapBERT (best proven so far)

### Scenario 3: ClinicalBERT Surprises
- ClinicalBERT outperforms research-trained models
- Clinical notes training translates better to medication codes
- **Decision:** Adopt ClinicalBERT, note importance of clinical vs research training

### Scenario 4: OpenAI Holds Up (Unlikely)
- No model shows >10 point improvement over OpenAI
- Medical training doesn't help for code matching
- **Decision:** Stick with OpenAI, focus on hybrid lexical+vector approach

---

## Timeline

**Total Duration:** 60-90 minutes

| Phase | Duration | Tasks |
|-------|----------|-------|
| Setup | 5 min | Create experiment directory, initialize files |
| Data Collection | 10 min | Fetch 40 entities from Supabase, extract text versions |
| OpenAI Embeddings | 5 min | Generate 120 embeddings |
| SapBERT Embeddings | 12 min | Generate 120 embeddings (rate limit delays) |
| BioBERT Embeddings | 12 min | Generate 120 embeddings |
| Clinical-ModernBERT Embeddings | 13 min | Generate 120 embeddings |
| Similarity Calculation | 5 min | Calculate all pairwise similarities |
| Analysis | 10 min | Generate tables, identify winner |
| Documentation | 5 min | Update experiment log with results |

**Total:** ~77 minutes (60-90 min range accounting for API variability)

---

## Experiment Execution Log

**Execution Status:** NOT STARTED

| Timestamp | Event | Status | Notes |
|-----------|-------|--------|-------|
| - | Experiment planned | ✓ | Awaiting approval to proceed |
| - | Data collection | ⏳ | Pending |
| - | OpenAI embeddings | ⏳ | Pending |
| - | SapBERT embeddings | ⏳ | Pending |
| - | BioBERT embeddings | ⏳ | Pending |
| - | PubMedBERT embeddings | ⏳ | Pending |
| - | ClinicalBERT embeddings | ⏳ | Pending |
| - | Similarity analysis | ⏳ | Pending |
| - | Final results | ⏳ | Pending |

---

## Results Section (To Be Completed)

### Model Performance Summary
*[To be populated after experiment completion]*

### Best Model + Strategy Combination
*[To be populated after experiment completion]*

### Detailed Comparison Tables
*[To be populated after experiment completion]*

### Recommendations
*[To be populated after experiment completion]*

---

## Appendix

### A. Extraction Functions

**Ingredient-Only (Medications):**
```typescript
function extractIngredient(displayName: string): string {
  let ingredient = displayName;
  ingredient = ingredient.replace(/\d+(?:\.\d+)?\s*(?:mg|g|ml|mcg).*$/gi, '');
  ingredient = ingredient.replace(/\b(tablet|capsule|injection|syrup|cream).*$/gi, '');
  ingredient = ingredient.replace(/\(as [^)]+\)/gi, '');
  ingredient = ingredient.replace(/\([^)]+\)/g, '');
  return ingredient.replace(/\s+/g, ' ').trim().toLowerCase();
}
```

**Anatomy + Procedure (Procedures):**
```typescript
function extractProcedureCore(displayName: string): string {
  // Extract key anatomy and procedure terms, remove duration/setting/modifiers
  let core = displayName.toLowerCase();
  core = core.replace(/\b(not more than|less than|at least)\s+\d+\s+(minutes?|hours?)\b/gi, '');
  core = core.replace(/\b(professional attendance|at consulting rooms|in hospital)\b/gi, '');
  // Keep anatomy + procedure type keywords only
  return core.replace(/\s+/g, ' ').trim();
}
```

### B. References

1. **SapBERT Paper:** Liu et al. (2021) "Self-Alignment Pretraining for Biomedical Entity Representations"
2. **BioBERT Paper:** Lee et al. (2020) "BioBERT: a pre-trained biomedical language representation model"
3. **Clinical-ModernBERT Paper:** Lee et al. (2025) "Clinical ModernBERT: An efficient and long context encoder for biomedical text" (arXiv:2504.03964)
4. **ModernBERT Architecture:** Haviv et al. (2024) "Finally, a Replacement for BERT: Introducing ModernBERT"

### C. Cost Analysis

**Total API Calls:** 480 embeddings

**OpenAI:**
- Cost: 120 embeddings × ~20 tokens avg = 2,400 tokens
- Price: $0.02 per 1M tokens = $0.00005

**HuggingFace (Free Tier):**
- Cost: 120 embeddings per model × 3 models = 360 API calls
- Rate: 1000/hour limit
- Time: ~30-40 minutes with delays
- Price: $0 (free tier)

**Total Cost:** ~$0.00005 (essentially free)

**Validated Models:** All 4 models tested and working via HuggingFace Inference API

---

**Experiment Log Created:** 2025-10-20
**Created By:** Claude (Sonnet 4.5)
**Approved By:** [Pending]
**Execution Started:** [Pending]
**Execution Completed:** [Pending]
