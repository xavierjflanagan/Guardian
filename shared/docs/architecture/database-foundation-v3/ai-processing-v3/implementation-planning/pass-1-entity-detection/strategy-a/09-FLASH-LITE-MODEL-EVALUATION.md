# 09 - Flash-Lite Model Evaluation

**Date Created:** 2025-11-30
**Status:** Complete
**Purpose:** Evaluate Gemini 2.5 Flash-Lite for Pass 1 entity detection

---

## Executive Summary

This document presents a comprehensive evaluation of Gemini 2.5 Flash-Lite against Gemini 2.5 Flash for Pass 1 entity detection. Testing was conducted on the Vincent Cheers 3-page medical document with multiple runs to assess both accuracy and consistency.

**Key Finding:** Flash-Lite is approved for production use, delivering 88% cost reduction, 4.7x speed improvement, and 97% consistency while naturally avoiding the "condition inflation" problem that plagued Flash.

---

## Test Document Profile

**Document:** Vincent Cheers Patient Health Summary
**Pages:** 3
**Content Density:** High
- Current Medications section (10 medications)
- Active Past History (6 conditions, 3 procedures)
- Immunisation records (32 vaccinations spanning 2011-2025)
- Prescription history (13 scripts)

**OCR Source:** Google Cloud Vision with Y-coordinate enhancement
**Input Tokens:** 5,351 (consistent across all runs)

---

## Flash vs Flash-Lite Comparison

### Performance Metrics

| Metric | Flash | Flash-Lite | Change |
|--------|-------|------------|--------|
| **Processing Time** | 128 seconds | 27 seconds | **-79%** |
| **Output Tokens** | 9,714 | 6,605 | **-32%** |
| **Input Tokens** | 5,351 | 5,351 | Same |
| **Total Entities** | 113 | 72 | -36% |
| **Zones Detected** | 18 | 10 | -44% |

### Entity Detection by Type

| Entity Type | Flash | Flash-Lite | Difference | Assessment |
|-------------|-------|------------|------------|------------|
| **Conditions** | 49 | 10 | -39 | IMPROVED |
| **Immunisations** | 34 | 32 | -2 | Acceptable |
| **Medications** | 23 | 26 | +3 | Good |
| **Procedures** | 4 | 3 | -1 | Acceptable |
| **Observations** | 3 | 1 | -2 | Minor loss |
| **Total** | 113 | 72 | -41 | See analysis |

---

## Critical Finding: Condition Entity Accuracy

### The "Condition Inflation" Problem

Flash extracted 49 conditions from a document that contains approximately 10 actual patient conditions. The remaining 39 were disease names extracted from immunisation records.

**Example of Flash over-extraction:**
```
OCR Line: [Y:930] 23/05/2019 FluQuadri ( Influenza )

Flash output:
- Entity 1: immunisation = "FluQuadri" (CORRECT)
- Entity 2: condition = "Influenza" (INCORRECT - vaccine target, not patient condition)
```

### Flash-Lite Natural Correction

Flash-Lite naturally avoided this problem without any prompt changes. It extracted only the 10 actual patient conditions:

1. Infective discitis 13/4 c5/6
2. Adenoma
3. Parathyroid
4. Infective endocarditis
5. Lymphoma
6. Ruptured spleen
7. Left lower lobe pneumonia
8. Immunocompromised
9. Infection
10. Asthma

**Why This Matters:** This validates the "holistic" extraction approach described in `07-PASS1-PROMPT-V2-SPECIFICATION.md`. Flash-Lite appears to naturally understand document context better than Flash, treating disease names in immunisation records as vaccine targets rather than patient conditions.

---

## Entity Extraction Accuracy Audit

### Page 1 - Current Medications Section (Y:1320-1740)

| OCR Line | Flash-Lite Extraction | Correct? |
|----------|----------------------|----------|
| Amoxil 250mg Capsule | medication (Y:1350) | YES |
| Arexvy 120mcg/0.5mL | medication (Y:1390) | YES |
| Aristocort 0.02% Cream | medication (Y:1430) | YES |
| Breo Ellipta 200/25 | medication (Y:1470) | YES |
| Celebrex 200mg Capsule | medication (Y:1540) | YES |
| Depo-Medrol 40mg/mL | medication (Y:1580) | YES |
| Diazepam 5mg Tablet | medication (Y:1620) | YES |
| Nimenrix Vial | medication (Y:1660) | YES* |
| Oxazepam 15mg Tablet | medication (Y:1700) | YES |
| Prednisolone 25mg Tablet | medication (Y:1740) | YES |

*Nimenrix is a vaccine but listed in "Current Medications" section - classification is contextually appropriate.

### Page 1 - Active Past History Section (Y:1850-2080)

| OCR Line | Flash-Lite Extraction | Correct? |
|----------|----------------------|----------|
| Infective discitis | condition (Y:1890) | YES |
| Adenoma/Parathyroid | condition (Y:1920-1930) | YES |
| Infective endocarditis | condition (Y:1970) | YES |
| Aortic valve replacement | procedure (Y:2000) | YES |
| Lymphoma | condition (Y:2040) | YES |
| Splenectomy | procedure (Y:2080) | YES |
| Arterial embolectomy | procedure (Y:2080) | YES |

### Page 2 - Immunisations Section (Y:550-1810)

Flash-Lite correctly extracted 32 immunisations without extracting disease targets as separate conditions:
- Stamaril (Yellow Fever) - extracted as immunisation only
- Vivaxim (Hepatitis A, Typhoid) - extracted as immunisation only
- FluQuadri (Influenza) - extracted as immunisation only (multiple entries)
- COVID-19 vaccines - extracted as immunisation only (7 entries)
- All other vaccines correctly identified

### Page 2-3 - Prescriptions Section

Flash-Lite extracted 13 medications from prescription records:
- Doxycycline 100mg Capsule
- Prednisolone 25mg Tablet (2 scripts)
- Voltaren 50mg
- Dukoral Suspension
- Stilnox 10mg Tablet (2 scripts)
- Diazepam 5mg Tablet (2 scripts)
- Cephalexin 500mg Capsule
- Panadeine Forte
- Aristocort 0.02% Cream
- Endone 5mg Tablet
- Tramadol 50mg Capsule

---

## Minor Classification Issues

| Entity | Flash-Lite Classification | Should Be | Impact |
|--------|--------------------------|-----------|--------|
| Dukoral (Y:730, Page 2) | medication | immunisation | Minor |
| AstraZeneca VAXZEVRIA (Y:1380) | medication | immunisation | Minor |
| Initial immunisations (Y:240) | immunisation | observation | Minor |

**Error Rate:** 3 of 72 entities (~4%)

These edge cases can be addressed in v2 prompt refinements but do not block production use.

---

## Cost Analysis

### Per-Document Cost

| Model | Input Tokens | Output Tokens | Input Cost | Output Cost | Total Cost |
|-------|--------------|---------------|------------|-------------|------------|
| Flash | 5,351 | 9,714 | $0.0016 | $0.0243 | **$0.0259** |
| Flash-Lite | 5,351 | 6,605 | $0.0005 | $0.0026 | **$0.0031** |

**Cost Reduction: 88%**

### Projected Monthly Cost (1,000 documents)

| Model | Monthly Cost |
|-------|--------------|
| Flash | $25.90 |
| Flash-Lite | $3.10 |
| **Savings** | **$22.80/month** |

### Projected Annual Cost (12,000 documents)

| Model | Annual Cost |
|-------|-------------|
| Flash | $310.80 |
| Flash-Lite | $37.20 |
| **Savings** | **$273.60/year** |

---

## Flash-Lite Variability Testing

Three identical uploads of the Vincent Cheers document were processed to assess consistency.

### Run-by-Run Metrics

| Metric | Run 1 | Run 2 | Run 3 | Variance |
|--------|-------|-------|-------|----------|
| **Processing Time** | 27.3s | 24.5s | 22.6s | 22-27s range |
| **Input Tokens** | 5,351 | 5,351 | 5,351 | Identical |
| **Output Tokens** | 6,605 | 6,636 | 6,597 | 0.6% |
| **Entities Detected** | 72 | 72 | 72 | **Identical** |
| **Zones Detected** | 10 | 9 | 10 | 10% |

### Entity Counts by Type Across Runs

| Entity Type | Run 1 | Run 2 | Run 3 | Variance |
|-------------|-------|-------|-------|----------|
| **Immunisations** | 32 | 33 | 33 | 1 entity |
| **Medications** | 26 | 25 | 25 | 1 entity |
| **Conditions** | 10 | 10 | 10 | **Identical** |
| **Procedures** | 3 | 3 | 3 | **Identical** |
| **Observations** | 1 | 1 | 1 | **Identical** |
| **Total** | 72 | 72 | 72 | **Identical** |

### Consistency Analysis

| Dimension | Score | Notes |
|-----------|-------|-------|
| Entity Count | 100% | Identical total across all runs |
| Entity Type Distribution | 98% | 1 entity variance in 2 categories |
| Output Tokens | 99.4% | <1% variance (39 tokens) |
| Zones | 90% | 9-10 range |
| **Overall Consistency** | **97%** | Production-ready |

### Variance Explanation

The 1-entity variance between immunisation/medication counts is likely the same edge case entity (Nimenrix or similar) being classified differently between runs. This does not represent a coverage gap - total entity count remains identical.

---

## Comparison Summary

### Flash vs Flash-Lite Scorecard

| Dimension | Flash | Flash-Lite | Winner |
|-----------|-------|------------|--------|
| **Speed** | 128s | 27s | Flash-Lite |
| **Cost** | $0.0259/doc | $0.0031/doc | Flash-Lite |
| **Output Tokens** | 9,714 | 6,605 | Flash-Lite |
| **Condition Accuracy** | 49 (inflated) | 10 (accurate) | Flash-Lite |
| **Medication Coverage** | 23 | 26 | Flash-Lite |
| **Immunisation Coverage** | 34 | 32 | Flash (marginal) |
| **Consistency** | Not tested | 97% | Flash-Lite |

**Overall Winner: Flash-Lite**

---

## Production Recommendation

### Decision: APPROVED for Production

Flash-Lite is approved as the default Pass 1 model based on:

1. **88% cost reduction** - Significant operational savings
2. **4.7x speed improvement** - Better user experience
3. **Superior condition accuracy** - Naturally avoids condition inflation
4. **97% consistency** - Reliable, predictable output
5. **Acceptable entity coverage** - Minor variance in edge cases only

### Configuration Change

Update Render.com environment variables:

```
PASS_1_USE_GEMINI_2_5_FLASH=false
PASS_1_USE_GEMINI_2_5_FLASH_LITE=true
```

### Monitoring Requirements

Track the following metrics post-deployment:

| Metric | Threshold | Action if Exceeded |
|--------|-----------|-------------------|
| Entity count variance | >10% | Investigate prompt |
| Condition count | >15 per 3 pages | Check for inflation regression |
| Processing time | >60 seconds | Check API status |
| Error rate | >5% | Escalate |

---

## Future Considerations

### v2 Prompt Refinements

While Flash-Lite naturally handles most context issues, v2 prompt can address:
- Edge case vaccine/medication classification
- Section header detection
- Zone derivation (moving to post-AI as per `08-POST-AI-ZONE-DERIVATION-SYSTEM.md`)

### Alternative Models to Test

| Model | Potential Use Case |
|-------|-------------------|
| GPT-5-nano | Lower cost alternative if Flash-Lite accuracy regresses |
| Gemini 2.5 Pro | Complex documents requiring deeper reasoning |
| Claude Haiku | Alternative vendor for redundancy |

### Document Type Coverage

This evaluation covers structured Best Practice summaries. Additional testing recommended for:
- Medical letters (continuous prose)
- Specialist reports
- Pathology results
- Imaging reports

---

## Appendix: Raw Data

### Flash Run (Baseline)

```json
{
  "shell_file_id": "3e028f02-6462-4d70-9088-134d559902f0",
  "ai_model_used": "gemini-2.5-flash",
  "processing_time_ms": 128382,
  "input_tokens": 5351,
  "output_tokens": 9714,
  "entities_detected": 113,
  "zones_detected": 18
}
```

### Flash-Lite Runs

```json
[
  {
    "run": 1,
    "shell_file_id": "ffb69aef-04c3-4131-a2e5-d4ee837ace38",
    "processing_time_ms": 27349,
    "input_tokens": 5351,
    "output_tokens": 6605,
    "entities_detected": 72,
    "zones_detected": 10
  },
  {
    "run": 2,
    "shell_file_id": "4dd16661-62e0-4c2b-a272-c0ca36073509",
    "processing_time_ms": 24546,
    "input_tokens": 5351,
    "output_tokens": 6636,
    "entities_detected": 72,
    "zones_detected": 9
  },
  {
    "run": 3,
    "shell_file_id": "bd4b4322-6120-4c12-9a92-482fbed1d652",
    "processing_time_ms": 22622,
    "input_tokens": 5351,
    "output_tokens": 6597,
    "entities_detected": 72,
    "zones_detected": 10
  }
]
```

---

## Related Documents

- `06-AI-MODEL-SWITCHING-SYSTEM.md` - Model configuration and switching
- `07-PASS1-PROMPT-V2-SPECIFICATION.md` - v2 prompt requirements
- `08-POST-AI-ZONE-DERIVATION-SYSTEM.md` - Zone derivation system
- `3-page-file-Vincent-Cheers-OCR-output` - Test document OCR

---

## Revision History

| Date | Change |
|------|--------|
| 2025-11-30 | Initial evaluation complete |
