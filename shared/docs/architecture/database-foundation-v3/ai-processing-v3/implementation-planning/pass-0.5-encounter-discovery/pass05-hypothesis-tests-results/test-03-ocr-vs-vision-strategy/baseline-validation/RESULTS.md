# Pass 0.5 Baseline Validation Results

**Status:** IN PROGRESS
**Date:** October 31, 2025
**Test Plan:** See `BASELINE_VALIDATION_PLAN.md`
**Strategy:** Phase 2 Baseline (`PASS_05_STRATEGY=ocr`)

---

## Test Execution Summary

| Test # | Test Name | Status | Result | Issues Found |
|--------|-----------|--------|--------|--------------|
| 4 | Medication Photo (JPEG) | ✅ Complete | PASS | Format limitations: PDFs and HEIC not supported (OCR issue) |
| 5 | Large File Batching (142 pages) | ⏳ Pending | - | - |
| 1 | Multi-Document Upload (11 files) | ⏳ Pending | - | - |
| 2 | Multi-Page Unified Document (15 pages) | ⏳ Pending | - | - |
| 3 | Real-World Visit Detection | ⏳ Pending | - | - |

---

## Test 5: Large File Batching (142-page Hospital Encounter)

**File:** `006_Emma_Thompson_Hospital_Encounter_Summary.pdf` (142 pages, 2.5MB)
**Upload Date:** TBD
**Shell File ID:** TBD

### Expected Outcome
- 1 encounter: `inpatient_encounter`
- `requires_batching: true`
- ~9-10 batch boundaries calculated
- Processing time: <60 seconds

### Actual Outcome
TBD

### Manifest Data
```json
TBD
```

### AI Processing Session
```json
TBD
```

### Analysis
TBD

### Result
- [ ] PASS
- [ ] FAIL

---

## Test 1: Multi-Document Upload (11 files)

**Files:** Patient 002 - Sarah Chen - All 11 documents
**Upload Date:** TBD
**Shell File IDs:** TBD (11 separate IDs expected)

### Expected Outcome
- 11 separate manifests
- Mix of real visits and pseudo-encounters
- No false merging or splitting

### Actual Outcome
TBD

### Per-Document Results

#### Document 1: Continuity of Care Document (4 pages)
**Shell File ID:** TBD
**Expected:** `pseudo_admin_summary`
**Actual:** TBD

#### Document 2: Continuity of Care Document (1) (2 pages)
**Shell File ID:** TBD
**Expected:** `pseudo_admin_summary`
**Actual:** TBD

#### Document 3: Continuity of Care Document (2) (2 pages)
**Shell File ID:** TBD
**Expected:** `pseudo_admin_summary`
**Actual:** TBD

#### Document 4: Continuity of Care Document (3) (4 pages)
**Shell File ID:** TBD
**Expected:** `pseudo_admin_summary`
**Actual:** TBD

#### Document 5: Continuity of Care Document (4) (3 pages)
**Shell File ID:** TBD
**Expected:** `pseudo_admin_summary`
**Actual:** TBD

#### Document 6: Continuity of Care Document (5) (4 pages)
**Shell File ID:** TBD
**Expected:** `pseudo_admin_summary`
**Actual:** TBD

#### Document 7: Continuity of Care Document (6) (4 pages)
**Shell File ID:** TBD
**Expected:** `pseudo_admin_summary`
**Actual:** TBD

#### Document 8: Emergency Summary (9 pages)
**Shell File ID:** TBD
**Expected:** `emergency_encounter`
**Actual:** TBD

#### Document 9: Hospital Encounter Summary (69 pages)
**Shell File ID:** TBD
**Expected:** `inpatient_encounter` with batching
**Actual:** TBD

#### Document 10: Office Visit Summary (15 pages)
**Shell File ID:** TBD
**Expected:** `outpatient_encounter`
**Actual:** TBD

#### Document 11: Telephone Summary (3 pages)
**Shell File ID:** TBD
**Expected:** `outpatient_encounter` or `pseudo_admin_summary`
**Actual:** TBD

### Analysis
TBD

### Result
- [ ] PASS
- [ ] FAIL

---

## Test 2: Multi-Page Unified Document (15-page Office Visit)

**File:** `002_Sarah_Chen_Office_Visit_Summary.pdf` (15 pages)
**Upload Date:** TBD
**Shell File ID:** TBD

### Expected Outcome
- 1 encounter: `outpatient_encounter`
- All 15 pages attributed to single encounter
- No over-segmentation

### Actual Outcome
TBD

### Manifest Data
```json
TBD
```

### AI Processing Session
```json
TBD
```

### Analysis
TBD

### Result
- [ ] PASS
- [ ] FAIL

---

## Test 4: Medication Photo (Antibiotic Box)

**File:** photo_medication_box.jpeg
**Upload Date:** October 31, 2025, 10:17 AM UTC
**Shell File ID:** 75968dc3-e42e-42c8-8057-43fd153150d7
**Job ID:** fb055eb8-c90c-4145-9a53-c440852c86f8

### Expected Outcome
- 1 encounter: `pseudo_medication_list`
- Single image processed correctly
- Appropriate confidence level

### Actual Outcome
- 1 encounter detected: `pseudo_medication_list` (CORRECT)
- Confidence: 0.93 (high)
- Processing time: 40.13 seconds
- Cost: $0.0047

### Manifest Data
```json
{
  "encounters": [
    {
      "encounterId": "3957b2eb-9239-4787-aae7-071ab2ac714f",
      "encounterType": "pseudo_medication_list",
      "confidence": 0.93,
      "pageRanges": [[1, 1]],
      "facility": "Sydney Hospital and Sydney Eye Hospital Pharmacy Department",
      "provider": null,
      "dateRange": null,
      "extractedText": "4d UNTIL ALL USED TO BE TAKEN Do not take antacids or mineral supplements within two hours of each d",
      "isRealWorldVisit": false
    }
  ],
  "totalPages": 1,
  "ocrAverageConfidence": 0.9557
}
```

### AI Processing Session
```json
{
  "aiModel": "gpt-5-mini-2025-08-07",
  "success": true,
  "aiCostUsd": 0.0047345,
  "processingTimeMs": 35443
}
```

### Analysis
PASS - All criteria met:
- Correctly classified as `pseudo_medication_list` (not a real healthcare visit)
- High confidence (0.93)
- Extracted facility name from pharmacy label
- OCR quality excellent (95.57%)
- Processing time acceptable (40s)
- Correctly identified as NOT a real-world visit (isRealWorldVisit: false)

Note: Single medication photo correctly distinguished from actual encounter documentation.

### Result
- [X] PASS
- [ ] FAIL

---

## Test 3: Real-World Visit Detection (Emergency Summaries)

### Test 3a: Sarah Chen Emergency Summary (9 pages)

**File:** `002_Sarah_Chen_Emergency_Summary.pdf`
**Upload Date:** TBD
**Shell File ID:** TBD

**Expected:** `emergency_encounter`
**Actual:** TBD

### Test 3b: Michael Rodriguez Emergency Summary (11 pages)

**File:** `003_Michael_Rodriguez_Emergency_Summary.pdf`
**Upload Date:** TBD
**Shell File ID:** TBD

**Expected:** `emergency_encounter`
**Actual:** TBD

### Test 3c: Michael Rodriguez Emergency Summary (10 pages)

**File:** `003_Michael_Rodriguez_Emergency_Summary_(1).pdf`
**Upload Date:** TBD
**Shell File ID:** TBD

**Expected:** `emergency_encounter`
**Actual:** TBD

### Analysis
TBD

### Result
- [ ] PASS
- [ ] FAIL

---

## Overall Assessment

### Quantitative Results

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Encounter Detection Accuracy | 100% | TBD | TBD |
| False Positive Rate | 0% | TBD | TBD |
| False Negative Rate | 0% | TBD | TBD |
| Batching Accuracy | 100% | TBD | TBD |
| Avg Processing Time | <60s | TBD | TBD |
| Timeline Test Accuracy | 100% | TBD | TBD |

### Issues Discovered

TBD

### Recommendations

TBD

### Next Steps

TBD

---

**Last Updated:** October 31, 2025
**Completion Date:** TBD
