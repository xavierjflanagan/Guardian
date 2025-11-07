# Experiment 7: LOINC Embedding Validation

## Quick Summary

**Objective:** Validate that OpenAI text-embedding-3-small embeddings enable accurate semantic search across 102,891 LOINC lab results, vital signs, observations, and physical findings.

**Status:** PLANNED

**Target Metrics:**
- Top-10 accuracy: ≥85%
- Layperson query accuracy: Within 10% of clinical queries
- Entity type precision: ≥90%

---

## Why This Experiment?

LOINC codes present unique challenges for semantic search:

1. **Massive search space**: 102,891 codes (22x larger than PBS medications)
2. **High semantic overlap**: Multiple codes for similar concepts (e.g., "Glucose in Blood" vs "Glucose in Serum")
3. **Terminology gap**: Layperson terms ("blood sugar") vs clinical terms ("glucose") vs LOINC terms ("Glucose [Mass/volume] in Serum")
4. **Entity diversity**: Lab results, vital signs, observations, physical findings each have different characteristics

This experiment validates our architectural decision to use `display_name` (clean clinical terminology) instead of `search_text` (verbose with repetitions) for embedding generation.

---

## Test Design

### 40 Realistic Test Entities

**Category 1: Common Lab Tests** (10)
- Blood glucose, HbA1c, cholesterol, CBC, LFTs, kidney function, thyroid, vitamin D, iron studies, urinalysis

**Category 2: Vital Signs** (10)
- Blood pressure, heart rate, temperature, respiratory rate, SpO2, height, weight, BMI, pain score, GCS

**Category 3: Clinical Observations** (10)
- Fetal heart rate, fetal abdominal circumference, pregnancy test, allergy status, smoking status, fall risk, depression screening, cognitive assessment

**Category 4: Diagnostic Tests** (10)
- Chest X-ray findings, ECG results, echocardiogram, spirometry, sleep study, bone density, colonoscopy, pap smear, mammogram, MRI findings

### 3 Query Variations Per Entity

Each entity tested with:
1. **Clinical term** (how doctors write it)
2. **Layperson term** (how patients describe it)
3. **Abbreviation** (clinical shorthand)

Total: 40 entities × 3 variations = **120 test queries**

---

## Key Files

- `EXPERIMENT_PLAN.md` - Detailed methodology and success criteria
- `HOW_TO_RUN.md` - Step-by-step execution instructions (to be created)
- `test-data/ground-truth.json` - Manual ground truth LOINC matches
- `scripts/test-loinc-vector-search.ts` - Main test execution script
- `results/RESULTS_SUMMARY.md` - Findings and recommendations (after execution)

---

## Expected Outcomes

### If Successful (≥85% top-10 accuracy)
- LOINC semantic search ready for Pass 1.5 integration
- Validates display_name embedding strategy
- Proceed with SNOMED CT implementation using same approach

### If Partially Successful (70-84% top-10 accuracy)
- Implement hybrid search (vector + keyword) for low-performing categories
- Refine query generation strategies for Pass 1 AI
- Consider specialized embeddings for layperson queries

### If Unsuccessful (<70% top-10 accuracy)
- Re-evaluate text source (display_name vs search_text)
- Consider fine-tuning embedding model for medical terminology
- Explore alternative embedding models (SapBERT, BioBERT)

---

## Timeline

- Ground truth establishment: 2-3 hours
- Script development: 3-4 hours
- Test execution: 30 minutes
- Analysis: 2-3 hours
- **Total**: 8-10 hours

---

## Related Work

This experiment builds on:
- **Experiment 2**: Validated OpenAI vs SapBERT for non-medication entities (OpenAI equivalent performance)
- **Initial LOINC validation (Nov 1)**: 8/8 test pairs passed with 90-96% high-similarity, 14-22% low-similarity
- **Experiment 6**: Hybrid search validation for MBS procedures (71.4% accuracy, identified MBS limitations)

---

## Next Steps

1. Create HOW_TO_RUN.md with execution instructions
2. Establish ground truth dataset (manual LOINC review)
3. Develop test scripts
4. Execute experiment
5. Document findings in RESULTS_SUMMARY.md
6. Make go/no-go decision on SNOMED CT implementation
