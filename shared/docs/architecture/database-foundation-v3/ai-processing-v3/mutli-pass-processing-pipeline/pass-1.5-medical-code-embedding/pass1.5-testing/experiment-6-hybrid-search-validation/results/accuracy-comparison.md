# Experiment 6: Accuracy Comparison

**Date:** 2025-10-22T21:09:18.780Z
**Comparison:** Hybrid Search vs Pure Vector Baseline (Experiment 5)

---

## Ground Truth Validation

**IMPORTANT:** Accuracy metrics below are calculated using ground truth MBS codes from manual investigation.

- **Total Test Entities:** 35
- **Entities with Ground Truth:** 14 (40.0%)
- **Entities Pending Investigation:** 21 (marked "TBD")

**Coverage:** 13/35 entities investigated, 22/35 need investigation

---

## Accuracy Metrics (Ground Truth Validated)

Based on 14 entities with verified expected MBS codes:

| Metric | Hybrid Search | Notes |
|--------|---------------|-------|
| **Top-20 Accuracy** | **71.4%** | 10/14 entities with correct code in top-20 |
| **Top-5 Accuracy** | **42.9%** | 6/14 entities with correct code in top-5 |
| **Top-1 Accuracy** | **35.7%** | 5/14 entities with correct code as #1 result |

---

## Result Existence Metrics (All Entities)

| Metric | Baseline (Exp 5) | Hybrid (Exp 6) | Change |
|--------|-----------------|----------------|--------|
| Total Entities | 35 | 35 | - |
| Results Returned | 0 (0.0%) | 35 (100.0%) | +35 |
| Zero Results | 0 (0.0%) | 0 (0.0%) | +0 |

### Key Improvements

- **Failures Fixed:** 0 entities (baseline: 0 results to hybrid: results found)
- **Regressions:** 0 entities (baseline: results found to hybrid: 0 results)
- **Net Improvement:** 0 entities

---

## Critical Test Cases

### Chest X-ray Formatting Variations (IDs 15-19)

**Expected Codes:** 58500, 58503, 58506 (chest lung fields by direct radiography)

**Hypothesis:** All 5 formats should match same MBS codes regardless of formatting

| ID | Entity Text | Expected Codes | Found in Top-20? | Status |
|----|-------------|----------------|------------------|--------|
| 15 | Chest X-ray | 58500, 58503, 58506 | Yes | PASS CORRECT |
| 16 | Chest x-ray | 58500, 58503, 58506 | Yes | PASS CORRECT |
| 17 | Chest xray | 58500, 58503, 58506 | Yes | PASS CORRECT |
| 18 | CXR | 58500, 58503, 58506 | Yes | PASS CORRECT |
| 19 | XR chest | 58500, 58503, 58506 | Yes | PASS CORRECT |

**Result:** 5/5 entities returned correct codes

### Cholecystectomy (Exact Term Match Failure)

- **Expected Codes:** 30443, 30445, 30448
- **Baseline:** undefined results (catastrophic - similarity < 0.0)
- **Hybrid:** 20 results
- **Found in Top-20:** Yes
- **Status:** PASS FIXED

### CT Scan Head (Terminology Mismatch)

- **Expected Codes:** 56001, 56007
- **Issue:** "CT" needs "Computed tomography", "head" needs "brain"
- **Baseline:** undefined results
- **Hybrid:** 20 results
- **Found in Top-20:** Yes
- **Status:** PASS FIXED

### Ultrasound Abdomen

- **Expected Code:** 55036
- **Baseline:** undefined results
- **Hybrid:** 20 results
- **Found in Top-20:** No
- **Status:** FAIL

---

## Detailed Comparison Table

| ID | Entity Text | Expected Codes | Top-20 Correct? | Baseline Results | Hybrid Results |
|----|-------------|----------------|-----------------|------------------|----------------|
| 1 | Standard GP consultation | TBD | N/A | undefined | 20 |
| 2 | Long GP consultation | 44 | No | undefined | 20 |
| 3 | Telehealth consultation | TBD | N/A | undefined | 20 |
| 4 | ECG | TBD | N/A | undefined | 20 |
| 5 | Spirometry | TBD | N/A | undefined | 20 |
| 6 | Wound dressing | TBD | N/A | undefined | 20 |
| 7 | Suture removal | TBD | N/A | undefined | 20 |
| 8 | Ear syringing | TBD | N/A | undefined | 20 |
| 9 | Influenza vaccination | TBD | N/A | undefined | 20 |
| 10 | Skin lesion excision | TBD | N/A | undefined | 20 |
| 11 | Mental health care plan | TBD | N/A | undefined | 20 |
| 12 | Pap smear | TBD | N/A | undefined | 20 |
| 13 | Joint injection | 45865, 53225, 59751 | No | undefined | 20 |
| 14 | Blood collection | 13839 | Yes | undefined | 20 |
| 15 | Chest X-ray | 58500, 58503, 58506 | Yes | undefined | 20 |
| 16 | Chest x-ray | 58500, 58503, 58506 | Yes | undefined | 20 |
| 17 | Chest xray | 58500, 58503, 58506 | Yes | undefined | 20 |
| 18 | CXR | 58500, 58503, 58506 | Yes | undefined | 20 |
| 19 | XR chest | 58500, 58503, 58506 | Yes | undefined | 20 |
| 20 | X-ray left ankle | TBD | N/A | undefined | 20 |
| 21 | CT scan head | 56001, 56007 | Yes | undefined | 20 |
| 22 | Ultrasound abdomen | 55036 | No | undefined | 20 |
| 23 | Laceration repair | TBD | N/A | undefined | 20 |
| 24 | Appendectomy | TBD | N/A | undefined | 20 |
| 25 | Cholecystectomy | 30443, 30445, 30448 | Yes | undefined | 20 |
| 26 | Inguinal hernia repair | 44114 | Yes | undefined | 20 |
| 27 | Knee arthroscopy | 49582 | No | undefined | 20 |
| 28 | Total hip replacement | 49318, 49315 | Yes | undefined | 20 |
| 29 | Carpal tunnel release | TBD | N/A | undefined | 20 |
| 30 | Tonsillectomy | TBD | N/A | undefined | 20 |
| 31 | Cataract surgery | TBD | N/A | undefined | 20 |
| 32 | Hysterectomy | TBD | N/A | undefined | 20 |
| 33 | Caesarean section | TBD | N/A | undefined | 20 |
| 34 | Colonoscopy | TBD | N/A | undefined | 20 |
| 35 | Skin cancer excision | TBD | N/A | undefined | 20 |

---

## Interpretation

**Ground Truth Coverage:** 14/35 entities (40.0%)

### RETHINK: Insufficient Improvement

**Top-20 Accuracy:** 71.4% (target: >=90%)

**Recommendation:** Consider alternative approaches

**Alternatives:**
1. Domain-specific embeddings (BioBERT, Clinical-ModernBERT)
2. Anatomy + procedure extraction
3. MBS-specific preprocessing
4. Multi-stage search pipeline

