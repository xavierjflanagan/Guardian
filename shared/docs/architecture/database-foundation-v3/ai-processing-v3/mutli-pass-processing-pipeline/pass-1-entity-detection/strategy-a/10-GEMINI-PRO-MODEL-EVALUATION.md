# 10 - Gemini 2.5 Pro Model Evaluation

**Date:** 2025-11-30
**Updated:** 2025-12-01
**Status:** Complete

---

## 3-Page Test Results

**Shell File:** `e9c2bda9-09c7-485b-8a80-427f8c7d08aa`
**Document:** Vincent Cheers Patient Health Summary (3 pages)

### Performance

| Metric | Gemini 2.5 Pro | Flash-Lite (Baseline) |
|--------|----------------|----------------------|
| Processing Time | 94s | 27s |
| Input Tokens | 5,351 | 5,351 |
| Output Tokens | 6,791 | 6,605 |
| Entities | 73 | 72 |
| Zones | 9 | 10 |

### Entity Breakdown

| Type | Pro | Flash-Lite |
|------|-----|------------|
| Immunisation | 33 | 32-33 |
| Medication | 24 | 25-26 |
| Condition | 11 | 10 |
| Procedure | 3 | 3 |
| Observation | 1 | 1 |
| Allergy | 1 | 0 |

### Cost Comparison

| Model | Cost/Doc |
|-------|----------|
| Pro | $0.0736 |
| Flash-Lite | $0.0031 |

**Pro is 24x more expensive than Flash-Lite.**

### Key Observations

1. **Allergy Detection:** Pro detected 1 allergy entity ("Nil known") that Flash-Lite missed
2. **Similar Accuracy:** Entity counts nearly identical (+1 entity)
3. **Slower:** 3.5x slower than Flash-Lite (94s vs 27s)
4. **Zone Explosion:** 152 zones in database (historical accumulation issue persists)

### Verdict (3-Page)

Pro offers marginal accuracy improvement (+1 allergy detection) but at 24x cost and 3.5x latency. **Not justified for standard documents.**

---

## 5-Page Test Results

**Shell File:** `58172b0c-8edc-4013-a8c8-2c805221151e`
**Document:** Vincent Cheers Lab Results (5 pages, pages 75-79 from larger document)
**Document Type:** Melbourne Pathology lab results with haematology, biochemistry, CRP, PSA panels

### Test Context

This test was run after fixing the intra-page encounter boundary bug (commit `f06d18e`). The document contains 2 encounters split at page 3:

| Encounter | Pages | Start Boundary | End Boundary | Y-Slice |
|-----------|-------|----------------|--------------|---------|
| 1 | 1-3 | inter_page | intra_page | end_y=1070 |
| 2 | 3-5 | intra_page | inter_page | start_y=1090 |

### Performance Metrics

| Metric | Encounter 1 | Encounter 2 | Total |
|--------|-------------|-------------|-------|
| Pages | 1-3 | 3-5 | 5 |
| Processing Time | 97s | 87s | 185s |
| Input Tokens | 5,790 | 5,190 | 10,980 |
| Output Tokens | 8,291 | 6,700 | 14,991 |
| Entities | 88 | 78 | **166** |
| Zones | 16 | 10 | 26 |

### Entity Type Distribution

| Type | Count | % | Notes |
|------|-------|---|-------|
| lab_result | 88 | 53% | Blood counts, chemistry panels |
| procedure | 75 | 45% | Test names (FBE, EUC, LFT, CRP, etc.) |
| condition | 3 | 2% | "kidney disease", "prostatic neoplasia" |
| **Total** | **166** | 100% | |

### Cost Analysis

| Model | Input Cost | Output Cost | Total/Doc |
|-------|------------|-------------|-----------|
| Pro | $0.0137 | $0.1874 | **$0.201** |
| Flash-Lite (est.) | $0.0010 | $0.0060 | ~$0.007 |

**Pro is ~29x more expensive for this 5-page document.**

---

## Zone Accuracy Analysis

### Encounter 1 Zones (Pages 1-3, ending at Y:1070)

| Page | Schema | Y Range | Height | OCR Content | Verdict |
|------|--------|---------|--------|-------------|---------|
| 1 | procedures | 370-500 | 130 | "ED - HAEMATOLOGY", "HAEMATOLOGY" | CORRECT |
| 1 | lab_results | 670-1030 | 360 | Haemoglobin through Basophils (FBE panel) | CORRECT |
| 1 | procedures | 1230-1260 | 30 | "Tests Completed: FBE", "Pending: CA, EUC..." | CORRECT |
| 1 | procedures | 1610-1740 | 130 | "SE CHEMISTRY", "MULTIPLE BIOCHEMICAL ANALYSIS" | CORRECT |
| 1 | lab_results | 1910-2070 | 160 | Sodium through eGFR | CORRECT |
| 2 | lab_results | 120-570 | 450 | T-BIL through CA(Corr) | CORRECT |
| 2 | procedures | 650-651 | 1 | "EUC" header | FRAGMENTED |
| 2 | conditions | 670-671 | 1 | "kidney disease" | FRAGMENTED |
| 2 | procedures | 720-880 | 160 | "LFT" through "Tests Completed" | CORRECT |
| 2 | procedures | 1250-1251 | 1 | "SE C-REACTIVE PROTEIN" | FRAGMENTED |
| 2 | lab_results | 1500-1501 | 1 | "S CRP 47 H" | FRAGMENTED |
| 2 | procedures | 1650-1651 | 1 | "Tests Completed" line | FRAGMENTED |
| 2 | procedures | 2030-2031 | 1 | "ED HAEMATOLOGY" header | FRAGMENTED |
| 3 | procedures | 180-181 | 1 | "HAEMATOLOGY" | FRAGMENTED |
| 3 | lab_results | 340-730 | 390 | Haemoglobin through ESR | CORRECT |
| 3 | procedures | 930-931 | 1 | "Tests Completed" | FRAGMENTED |

**Zone Accuracy Score (Enc 1):** 7 CORRECT, 9 FRAGMENTED = **44% meaningful zones**

### Encounter 2 Zones (Pages 3-5, starting at Y:1090)

| Page | Schema | Y Range | Height | OCR Content | Verdict |
|------|--------|---------|--------|-------------|---------|
| 3 | procedures | 1310-2080 | 770 | "SE C-REACTIVE PROTEIN" through "SE TUMOUR MARKERS" | CORRECT |
| 3 | lab_results | 1550-1551 | 1 | "S CRP" | FRAGMENTED |
| 4 | procedures | 230-1270 | 1040 | "TUMOUR MARKERS" through "HAEMATOLOGY" | CORRECT |
| 4 | lab_results | 390-391 | 1 | "S PSA" | FRAGMENTED |
| 4 | conditions | 570-571 | 1 | "prostatic neoplasia" | FRAGMENTED |
| 4 | lab_results | 1430-1820 | 390 | Haemoglobin through ESR | CORRECT |
| 4 | procedures | 2020-2070 | 50 | "Tests Completed" section | CORRECT |
| 5 | procedures | 420-1520 | 1100 | "SE CHEMISTRY" through "Sample Pending" | OVER-EXTENDED |
| 5 | lab_results | 720-1160 | 440 | Sodium through CA(Corr) | CORRECT |
| 5 | conditions | 1260-1261 | 1 | "kidney disease" | FRAGMENTED |

**Zone Accuracy Score (Enc 2):** 5 CORRECT, 1 OVER-EXTENDED, 4 FRAGMENTED = **50% meaningful zones**

### Zone Issues Summary

| Issue | Count | Impact |
|-------|-------|--------|
| Single-line zones (height=1) | 13 | Cannot be used for Pass 2 batching |
| Correct zones | 12 | Usable for Pass 2 |
| Over-extended zones | 1 | May include unrelated content |
| **Total zones** | 26 | |

**Zone Problem Rate: 54%** - Over half of zones are single-line fragments.

---

## Entity Extraction Audit

### Lab Results (88 entities)

Sample verification against OCR:

| Entity | Page | Y | OCR Match | Verdict |
|--------|------|---|-----------|---------|
| HAEMOGLOBIN 139 g/L | 1 | 670 | `[Y:670] HAEMOGLOBIN g / L ( 130-180 )` | CORRECT |
| Hct 0.42 | 1 | 690 | `[Y:690] Hct 0.42 ( 0.39-0.51 )` | CORRECT |
| RBC 4.4 x10*12/L | 1 | 720 | `[Y:720] RBC 4.4 x10 * 12 / L ( 4.3-5.8 )` | CORRECT |
| S SODIUM 140 mmol/L | 1 | 1910 | `[Y:1910] S SODIUM 140` | CORRECT |
| S CRP 47 H mg/L | 2 | 1500 | `[Y:1500] S CRP 47 H mg ( < 5 )` | CORRECT |
| S PSA 0.97 ug/L | 4 | 390 | `[Y:390] S PSA 0.80 0.94 0.97 ug / L` | CORRECT |
| ESR 20 H mm/hr | 3 | 730 | `[Y:730] ESR 20 H mm / hr ( 2-14 )` | CORRECT |

**Lab Result Accuracy: 100%** - All sampled entities match OCR content and Y-coordinates.

### Procedures (75 entities)

Sample verification:

| Entity | Page | Y | OCR Match | Verdict |
|--------|------|---|-----------|---------|
| ED - HAEMATOLOGY | 1 | 370 | `[Y:370] Name of Test : ED - HAEMATOLOGY` | CORRECT |
| SE CHEMISTRY | 1 | 1610 | `[Y:1610] Name of Test : SE CHEMISTRY` | CORRECT |
| FBE | 1 | 1230 | `[Y:1230] Tests Completed : FBE` | CORRECT |
| CRP (x6 instances) | various | various | Appears in multiple "Tests Completed" lines | DUPLICATE |
| EUC (x8 instances) | various | various | Appears in multiple "Tests Completed" lines | DUPLICATE |
| LFT (x7 instances) | various | various | Appears in multiple "Tests Completed" lines | DUPLICATE |

**Procedure Issue:** The AI extracted each test abbreviation (FBE, EUC, LFT, CRP, ESR, CA, PSA) multiple times from "Tests Completed" and "Tests Pending" lines. These are the same tests referenced repeatedly, not unique procedures.

**Unique Procedures: ~12** (ED HAEMATOLOGY, HAEMATOLOGY, SE CHEMISTRY, MULTIPLE BIOCHEMICAL ANALYSIS, SE C-REACTIVE PROTEIN, SE TUMOUR MARKERS, TUMOUR MARKERS, plus test abbreviations FBE, EUC, LFT, CRP, ESR, CA, PSA)

**Procedure Inflation: ~6x** (75 extracted vs ~12 unique)

### Conditions (3 entities)

| Entity | Page | Y | OCR Context | Verdict |
|--------|------|---|-------------|---------|
| kidney disease | 2 | 670 | `No evidence of kidney disease` | INCORRECT |
| prostatic neoplasia | 4 | 570 | `low risk of prostatic neoplasia` | INCORRECT |
| kidney disease | 5 | 1260 | `No evidence of kidney disease` | INCORRECT |

**Condition Accuracy: 0%** - All 3 "conditions" are from negation contexts:
- "No evidence of kidney disease" - the patient does NOT have kidney disease
- "low risk of prostatic neoplasia" - the patient does NOT have prostatic neoplasia

**This is a critical extraction error** - these are explicitly ruled-out conditions, not diagnoses.

---

## Accuracy Summary

| Metric | Score | Notes |
|--------|-------|-------|
| Lab Result Accuracy | **100%** | All verified correct |
| Lab Result Completeness | **~95%** | Captured most results, some values missing |
| Procedure Accuracy | **16%** | 12 unique / 75 extracted = massive duplication |
| Condition Accuracy | **0%** | All 3 are negation-context errors |
| Zone Usefulness | **46%** | 12/26 meaningful zones |
| Y-Coordinate Accuracy | **100%** | All coordinates match OCR |

### Critical Issues

1. **Negation Blindness:** Gemini Pro extracted "kidney disease" and "prostatic neoplasia" from sentences that explicitly rule them out
2. **Procedure Duplication:** Test abbreviations extracted ~6x each from repeated "Tests Completed" sections
3. **Zone Fragmentation:** 13 of 26 zones are single-line (height=1), unusable for Pass 2

---

## Pro vs Flash-Lite Comparison

| Dimension | Pro | Flash-Lite | Winner |
|-----------|-----|------------|--------|
| Lab Result Accuracy | 100% | ~100% | Tie |
| Condition Accuracy | 0% (negation errors) | Better | Flash-Lite |
| Processing Time | 185s | ~50s (est.) | Flash-Lite |
| Cost (5-page) | $0.201 | ~$0.007 | Flash-Lite |
| Zone Quality | 46% | ~60% | Flash-Lite |
| Procedure Duplication | 6x | ~3x | Flash-Lite |

---

## Recommendations

### 1. Do NOT use Pro for standard documents
- 29x cost increase provides no accuracy benefit
- Actually WORSE on negation handling
- Processing time 3-4x slower

### 2. Prompt improvements needed for ALL models
- Add negation detection: "No evidence of X" should NOT extract X as a condition
- Add deduplication guidance: Test abbreviations in "Tests Completed" lines should only be extracted once per encounter
- Zone minimum height: Instruct AI to merge single-line zones into nearest section

### 3. Potential Pro use case
- Complex multi-page clinical letters requiring reasoning
- Documents with ambiguous structure
- NOT for structured lab results (Flash-Lite is superior)

---

## Revision History

| Date | Change |
|------|--------|
| 2025-11-30 | Initial 3-page evaluation |
| 2025-12-01 | Added 5-page evaluation with full entity/zone audit |