# Pass 0.5 Baseline Validation Plan

**Status:** Ready for Execution
**Context:** Phase 2 Baseline Validation (Pre-A/B Testing)
**Date:** October 31, 2025
**Purpose:** Comprehensively validate Phase 2 baseline prompt improvements across multiple document scenarios before conducting A/B testing with OCR-optimized and Vision strategies.

---

## Executive Summary

We have only tested Pass 0.5 with a single 1-page admin summary document (BP2025060246784 V5). This validation plan tests Phase 2 improvements across 5 critical scenarios using real de-identified medical records from 6 sample patients.

**Phase 2 Improvements Being Validated:**
- Document Unity Analysis (prevents false positives from splitting unified documents)
- Stricter lab report criteria (3-condition test: presence + standalone + no encounter context)
- Timeline Test logic (date + provider/facility = real-world visit)
- Example reordering (pseudo-encounters first to prevent priming bias)

**Token Cost with Pass 1 Disabled:** ~$0.10 total (GPT-5-mini only)

---

## Test Inventory

### Available Sample Patients

| Patient | Documents | Total Pages | Key Document Types | Best For Testing |
|---------|-----------|-------------|-------------------|------------------|
| **001 - Xavier Flanagan** | 4 | 24 pages | C-CDA, Office Visit, Hospital, Travel | Medication management, continuity of care |
| **002 - Sarah Chen** | 11 | 119 pages | 7× C-CDA, Emergency, Hospital (69p), Office (15p), Telephone | **Multi-document upload**, large file |
| **003 - Michael Rodriguez** | 5 | 36 pages | 3× C-CDA, 2× Emergency (11p, 10p) | Emergency encounters, real-world visits |
| **004 - Jennifer Patel** | 4 | 104 pages | Clinical Support, C-CDA, Hospital (71p), Office (15p) | Large hospital encounters |
| **005 - David Nguyen** | 3 | 26 pages | Future Orders, Office Visit, Virtual Encounter | Planned appointments, telehealth |
| **006 - Emma Thompson** | 6 | 187 pages | 3× C-CDA, Emergency, Hospital (142p), Progress Note (13p) | **MASSIVE batching test** (142 pages!) |

### Additional Test Assets

| Asset | Type | Purpose |
|-------|------|---------|
| Xavier's Antibiotic Box Photo | JPEG/PNG image | Test pseudo_medication_list detection from photos |

---

## Test Execution Plan

### Test 5: Large File Batching (Priority 1 - HIGHEST)
**Rationale:** Most critical untested feature - Pass 0.5 Task 2 batch planning must work for Pass 1 batching

**Test Files:**
- Primary: `006_Emma_Thompson_Hospital_Encounter_Summary.pdf` (142 pages, 2.5MB)
- Secondary: `002_Sarah_Chen_Hospital_Encounter_Summary.pdf` (69 pages) - if we have time
- Tertiary: `004_Jennifer_Patel_Hospital_Encounter_Summary.pdf` (71 pages) - if we have time

**Purpose:** Validate Pass 0.5 Task 2 batch boundary planning for files ≥18 pages

**Upload Method:** Manual upload via Patient UX dashboard (single file upload)

**Expected Behavior:**
1. Pass 0.5 Task 1 detects 1 encounter: `inpatient_encounter` or `outpatient_encounter`
2. Pass 0.5 Task 2 triggers (≥18 pages threshold met)
3. Batch boundaries calculated (142 pages ÷ ~15 pages/batch = ~9-10 batches)
4. Manifest written to `shell_file_manifests` with:
   - `encounter_count: 1`
   - `requires_batching: true`
   - `total_pages: 142`
   - `estimated_batch_count: 9-10`
   - Valid batch boundaries in JSON format

**Success Criteria:**
- ✅ 1 encounter detected (not 2-3 false positives from splitting)
- ✅ Correct encounter type (inpatient_encounter for hospital admission)
- ✅ `requires_batching: true` flag set
- ✅ Logical batch boundaries (not mid-section splits)
- ✅ No NULL page ranges
- ✅ Processing completes within 60 seconds (Task 1: 30s, Task 2: 30s)

**Failure Indicators:**
- ❌ Multiple encounters detected (false positives from over-segmentation)
- ❌ `requires_batching: false` despite 142 pages
- ❌ Missing batch boundaries in manifest
- ❌ Batch boundaries split clinical sections illogically

---

### Test 1: Multi-Document Upload (Priority 2)
**Rationale:** Core functionality - tests document boundary detection (Test 02 failure point)

**Test Files:** Patient 002 - Sarah Chen - All 11 documents uploaded together
```
002_Sarah_Chen_Continuity_of_Care_Document.pdf (4 pages)
002_Sarah_Chen_Continuity_of_Care_Document_(1).pdf (2 pages)
002_Sarah_Chen_Continuity_of_Care_Document_(2).pdf (2 pages)
002_Sarah_Chen_Continuity_of_Care_Document_(3).pdf (4 pages)
002_Sarah_Chen_Continuity_of_Care_Document_(4).pdf (3 pages)
002_Sarah_Chen_Continuity_of_Care_Document_(5).pdf (4 pages)
002_Sarah_Chen_Continuity_of_Care_Document_(6).pdf (4 pages)
002_Sarah_Chen_Emergency_Summary.pdf (9 pages)
002_Sarah_Chen_Hospital_Encounter_Summary.pdf (69 pages)
002_Sarah_Chen_Office_Visit_Summary.pdf (15 pages)
002_Sarah_Chen_Telephone_Summary.pdf (3 pages)
```

**Purpose:** Test if Pass 0.5 correctly identifies document boundaries when multiple files are uploaded together

**Upload Method:** Manual upload via Patient UX dashboard (multi-file upload)

**Expected Behavior:**
- Each PDF processed as separate shell_file
- 11 separate manifests written (one per shell_file)
- No false merging of documents
- Correct encounter types for each document

**Expected Encounter Types:**
| Document | Expected Type | Reasoning |
|----------|---------------|-----------|
| 7× Continuity of Care | `pseudo_admin_summary` | Comprehensive summaries, no specific encounter |
| Emergency Summary | `emergency_encounter` | Real emergency visit (Timeline Test: date + ED provider) |
| Hospital Encounter | `inpatient_encounter` | Real hospital admission (Timeline Test: date + facility) |
| Office Visit | `outpatient_encounter` | Real office visit (Timeline Test: date + provider) |
| Telephone Summary | `outpatient_encounter` or `pseudo_admin_summary` | Depends on date + provider context |

**Success Criteria:**
- ✅ 11 separate manifests created (one per document)
- ✅ No false positives (splitting unified documents)
- ✅ No false negatives (merging separate documents)
- ✅ Real visits correctly identified via Timeline Test (Emergency, Hospital, Office)
- ✅ Admin summaries correctly classified as pseudo-encounters

**Failure Indicators:**
- ❌ Fewer than 11 manifests (false merging)
- ❌ More than 11 manifests (false splitting)
- ❌ Real visits misclassified as pseudo-encounters
- ❌ Admin summaries misclassified as real visits

---

### Test 2: Multi-Page Unified Document (Priority 3)
**Rationale:** Test Document Unity Analysis - prevent over-segmentation of single documents

**Test Files:**
- Primary: `002_Sarah_Chen_Office_Visit_Summary.pdf` (15 pages)
- Secondary: `003_Michael_Rodriguez_Emergency_Summary.pdf` (11 pages)
- Tertiary: `006_Emma_Thompson_Progress_note.pdf` (13 pages)

**Purpose:** Validate that Phase 2 Document Unity Analysis prevents false positives from splitting unified documents

**Upload Method:** Manual upload via Patient UX dashboard (single file upload for each)

**Expected Behavior:**
1. Document Unity Analysis runs FIRST
2. Detects single unified document
3. Returns 1 encounter (not 2-3)
4. Correct encounter type based on document type

**Expected Outcomes:**

| Document | Pages | Expected Encounter Count | Expected Type | Reasoning |
|----------|-------|-------------------------|---------------|-----------|
| Office Visit Summary | 15 | 1 | `outpatient_encounter` | Single clinical visit, unified document |
| Emergency Summary | 11 | 1 | `emergency_encounter` | Single ED visit, unified document |
| Progress Note | 13 | 1 | `outpatient_encounter` or `inpatient_encounter` | Single progress note document |

**Success Criteria:**
- ✅ Each document returns 1 encounter only
- ✅ Correct encounter type (real visits, not pseudo-encounters)
- ✅ All 15 pages attributed to single encounter
- ✅ No false splitting at section boundaries

**Failure Indicators:**
- ❌ 2+ encounters detected (over-segmentation failure)
- ❌ Misclassified as pseudo-encounter
- ❌ Pages split between multiple encounters

**Test 02 False Positive Context:**
- Previous issue: 1-page admin summary split into 2 encounters (pseudo_medication_list + pseudo_lab_report)
- Phase 2 fix: Document Unity Analysis + stricter lab report criteria
- This test validates fix works for multi-page documents

---

### Test 4: Medication Photo (Priority 4)
**Rationale:** Validate pseudo-encounter detection for single medication images (common user workflow)

**Test File:** Xavier's antibiotic box photo (JPEG/PNG image)

**Purpose:** Test that single medication photos are correctly classified as `pseudo_medication_list` encounters

**Upload Method:** Manual upload via Patient UX dashboard (single image upload)

**Expected Behavior:**
1. Image processed (requires image handling in Pass 0.5 or pre-processing)
2. 1 encounter detected
3. Classified as `pseudo_medication_list`
4. Confidence level appropriate for single item

**Expected Outcome:**
- Encounter count: 1
- Encounter type: `pseudo_medication_list`
- Page range: `[[1, 1]]`
- Reasoning: "Single medication image with no encounter context"

**Success Criteria:**
- ✅ 1 encounter detected
- ✅ Correctly classified as `pseudo_medication_list`
- ✅ Not misclassified as `pseudo_lab_report` or real encounter
- ✅ Appropriate confidence level

**Failure Indicators:**
- ❌ 0 encounters (detection failure)
- ❌ 2+ encounters (false positive splitting)
- ❌ Misclassified as lab report or real encounter
- ❌ Processing fails due to image format

**Note:** This test may require pre-processing to convert image to PDF or special handling in Pass 0.5 for image inputs.

---

### Test 3: Real-World Visit Detection (Priority 5)
**Rationale:** Validate Timeline Test logic (date + provider/facility = real visit)

**Test Files:**
- `002_Sarah_Chen_Emergency_Summary.pdf` (9 pages)
- `003_Michael_Rodriguez_Emergency_Summary.pdf` (11 pages)
- `003_Michael_Rodriguez_Emergency_Summary_(1).pdf` (10 pages)

**Purpose:** Test that real emergency department visits are correctly identified (not misclassified as pseudo-encounters)

**Upload Method:** Manual upload via Patient UX dashboard (one file at a time)

**Expected Behavior:**
1. Timeline Test evaluates: date present? + provider/facility present?
2. Both conditions met → real visit
3. Classified as `emergency_encounter`
4. Not misclassified as pseudo-encounter

**Expected Outcomes:**

| Document | Expected Type | Reasoning |
|----------|---------------|-----------|
| Sarah Chen Emergency | `emergency_encounter` | ED visit with date + ED provider/facility |
| Michael Rodriguez Emergency (1) | `emergency_encounter` | ED visit with date + ED provider/facility |
| Michael Rodriguez Emergency (2) | `emergency_encounter` | ED visit with date + ED provider/facility |

**Success Criteria:**
- ✅ All 3 files classified as `emergency_encounter`
- ✅ Not misclassified as pseudo-encounters
- ✅ Timeline Test reasoning visible in audit logs
- ✅ Date and provider/facility extracted correctly

**Failure Indicators:**
- ❌ Misclassified as `pseudo_admin_summary` or other pseudo-encounter
- ❌ Timeline Test fails to detect date or provider
- ❌ Incorrect encounter type (e.g., `outpatient_encounter` instead of `emergency_encounter`)

**Timeline Test Logic:**
```
IF (date present AND (provider present OR facility present))
  THEN real-world visit (inpatient/outpatient/emergency/gp/specialist)
ELSE
  THEN pseudo-encounter (pseudo_admin_summary/medication/lab/immunization)
```

---

## Test Execution Sequence

**Recommended Order (optimized for learning):**

1. **Test 5: Large File Batching** (142-page file)
   - Tests most complex scenario first
   - Validates critical Task 2 batch planning
   - If this fails, we know there's a fundamental issue

2. **Test 1: Multi-Document Upload** (11 documents)
   - Tests core document boundary detection
   - Validates Phase 2 improvements at scale

3. **Test 2: Multi-Page Unified Document** (15-page file)
   - Tests Document Unity Analysis
   - Validates over-segmentation prevention

4. **Test 4: Medication Photo** (single image)
   - Tests pseudo-encounter detection
   - Validates image handling (if implemented)

5. **Test 3: Real-World Visit Detection** (Emergency summaries)
   - Tests Timeline Test logic
   - Validates real vs pseudo classification

**Alternate Order (if time-constrained - do most critical first):**
1. Test 5 (Batching - 142 pages)
2. Test 1 (Multi-document - 11 files)
3. Test 2 (Multi-page - 15 pages)
4. Skip Tests 3-4 if needed

---

## Success Metrics

### Overall Success Criteria

**Pass 0.5 Phase 2 Baseline is VALIDATED if:**
- ✅ Batching works correctly (Test 5 passes)
- ✅ No false positives from multi-document uploads (Test 1 passes)
- ✅ No over-segmentation of unified documents (Test 2 passes)
- ✅ Real visits correctly identified (Test 3 passes)
- ✅ Pseudo-encounters correctly classified (Test 4 passes)

**Phase 2 Baseline NEEDS IMPROVEMENT if:**
- ❌ Any test shows false positives (splitting unified documents)
- ❌ Batching logic fails or produces illogical boundaries
- ❌ Real visits misclassified as pseudo-encounters
- ❌ Processing time exceeds 60 seconds per document

### Quantitative Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Encounter Detection Accuracy | 100% | Manual verification of manifest vs expected |
| False Positive Rate | 0% | Count of incorrectly split documents |
| False Negative Rate | 0% | Count of incorrectly merged encounters |
| Batching Accuracy (≥18 pages) | 100% | Verify `requires_batching` flag and boundaries |
| Processing Time (per document) | <60s | Check `processing_duration_ms` in audit logs |
| Timeline Test Accuracy | 100% | Real visits correctly classified |

---

## Data Collection

### For Each Test, Record:

**From `shell_file_manifests` table:**
```sql
SELECT
  shell_file_id,
  encounter_count,
  requires_batching,
  total_pages,
  estimated_batch_count,
  encounters_json,
  created_at
FROM shell_file_manifests
WHERE shell_file_id = '<test_file_id>';
```

**From `ai_processing_sessions` table:**
```sql
SELECT
  session_id,
  shell_file_id,
  pass_number,
  processing_status,
  ai_model_used,
  total_tokens_used,
  processing_duration_ms
FROM ai_processing_sessions
WHERE shell_file_id = '<test_file_id>'
  AND pass_number = '0.5';
```

**Encounter Details from `encounters_json`:**
```json
{
  "encounter_id": 1,
  "encounter_type": "inpatient_encounter",
  "page_ranges": [[1, 142]],
  "confidence_level": "high",
  "reasoning": "..."
}
```

---

## Environment Setup

### Pass 1 Disabled (Token Cost Reduction)

**Temporary Worker Modification:**
- Pass 1 entity detection temporarily disabled
- Only Pass 0.5 runs (Task 1 + Task 2)
- Cost: ~$0.01-0.02 per document (GPT-5-mini only)
- Total estimated cost: ~$0.10 for all tests

**Revert After Testing:**
- Re-enable Pass 1 after baseline validation complete
- Deploy updated worker for A/B testing

### Strategy Configuration

**Current Strategy:** `PASS_05_STRATEGY=ocr` (Phase 2 baseline)
- Uses `apps/render-worker/src/pass05/aiPrompts.ts`
- GPT-5-mini model
- Phase 2 improvements: Document Unity Analysis, stricter lab criteria, Timeline Test

**Future Strategies (A/B Testing):**
- `PASS_05_STRATEGY=ocr_optimized` - Text pattern-focused (85-90% target)
- `PASS_05_STRATEGY=vision` - Image-based analysis (95%+ target, not yet implemented)

---

## Related Documents

- **Test 02 Phase 2 Results:** `../test-02-end-to-end-production-flow/PHASE_2_RESULTS.md`
- **Issues and Fixes:** `../ISSUES_AND_FIXES.md`
- **Strategy Analysis:** `STRATEGY_ANALYSIS.md`
- **Test Results:** `BASELINE_VALIDATION_RESULTS.md` (to be created)

---

## Next Steps

1. ✅ Create this validation plan - **COMPLETE**
2. **Temporarily disable Pass 1 in worker code**
3. **Deploy worker changes to Render.com**
4. **Execute Test 5: Large File Batching (142 pages)**
5. **Execute Test 1: Multi-Document Upload (11 files)**
6. **Execute Test 2: Multi-Page Unified Document (15 pages)**
7. **Execute Test 4: Medication Photo**
8. **Execute Test 3: Real-World Visit Detection**
9. **Document results in BASELINE_VALIDATION_RESULTS.md**
10. **Decide:** Proceed with A/B testing OR fix issues and re-validate

---

**Last Updated:** October 31, 2025
**Status:** Ready for Execution
**Estimated Duration:** 2-3 hours (setup + testing + documentation)
**Estimated Cost:** ~$0.10 (Pass 1 disabled)
