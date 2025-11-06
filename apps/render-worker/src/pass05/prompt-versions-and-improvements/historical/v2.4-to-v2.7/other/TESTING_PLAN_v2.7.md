# v2.7 Testing Plan - Pre-Deployment Validation

**Purpose:** Empirically test v2.7 optimization before deciding whether to add back critical items
**Approach:** Test with real files, compare against known-good v2.4 results
**Decision Point:** If issues found → implement Option A (add back 5 critical items)

---

## Test Strategy

Test v2.7 with progressively more complex documents to identify where it might fail:

1. **Simple documents** - Should work fine (low risk)
2. **Complex documents** - May expose missing guidance (medium risk)
3. **Frankenstein file** - Critical test (high risk of failure)

---

## Priority 1: MUST PASS Tests

These are the existing test files that MUST work correctly:

### Test 1: Frankenstein File (HIGHEST RISK)
**File:** `006_Emma_Thompson_Frankenstein_Progress_note_Emergency_summary.pdf`
**Pages:** 20 (two PDFs stacked)
**Expected Behavior:**
- **2 encounters detected**
- **Boundary at page 13** (NOT 12, NOT 14)
- Encounter 1: Pages 1-12 (Specialist consultation, Oct 27)
- Encounter 2: Pages 13-20 (Emergency Department, June 22)

**What to Check:**
```json
// Page 12 assignment
{"page": 12, "encounter_id": "enc-1", "justification": "...specialist encounter closeout..."}

// Page 13 assignment - CRITICAL
{"page": 13, "encounter_id": "enc-2", "justification": "NEW Encounter Summary header..."}
```

**Signs of v2.7 Failure:**
- Boundary at page 12/13 instead of 13/14 → WRONG
- Page 13 assigned to enc-1 → WRONG (this is what v2.2 fixed)
- Only 1 encounter detected → MAJOR FAILURE

**Why This Might Fail:**
- Missing Pattern D example
- Missing boundary priority list
- Missing document header vs metadata distinction

**If This Fails:** Implement Option A immediately

---

### Test 2: TIFF Lab Report (MEDIUM RISK)
**File:** `Xavier_combined_2page_medication_and_lab.tiff`
**Pages:** 2
**Expected Behavior:**
- **2 encounters detected**
- Encounter 1: pseudo_medication_list (page 1)
- Encounter 2: outpatient with date "2025-07-03" (page 2)

**What to Check:**
```json
// Lab report encounter
{
  "encounter_id": "enc-2",
  "encounterType": "outpatient",
  "isRealWorldVisit": true,
  "dateRange": {"start": "2025-07-03"},
  "facility": "NSW Health Pathology"
}
```

**Signs of v2.7 Failure:**
- Lab report classified as pseudo_lab_report → REGRESSION (v2.4 fix)
- encounter_date is null → CRITICAL FAILURE
- isRealWorldVisit: false → WRONG

**Why This Might Fail:**
- v2.4 lab report fix not preserved (but it was in v2.7)

**If This Fails:** Check if v2.4 fix was properly preserved

---

### Test 3: Administrative Summary (LOW RISK)
**File:** Any single-page health summary
**Expected Behavior:**
- **1 encounter detected**
- Type: pseudo_admin_summary
- All pages assigned to single encounter

**What to Check:**
```json
{
  "encounterType": "pseudo_admin_summary",
  "isRealWorldVisit": false,
  "dateRange": null
}
```

**Signs of v2.7 Failure:**
- Multiple encounters created for sections → WRONG
- Medication/immunization sections split off → WRONG

**Why This Might Fail:**
- Missing decision tree for admin summaries (but basic logic preserved)

**If This Fails:** Low priority, might be acceptable

---

## Priority 2: SHOULD PASS Tests

### Test 4: Planned Encounter (NEW TEST - v2.7 Fix Validation)
**File:** Referral letter with scheduled future appointment
**Expected Behavior:**
- Encounter with future date
- isRealWorldVisit: false (CRITICAL - v2.7 fix)
- dateRange populated

**What to Check:**
```json
{
  "encounterType": "planned_specialist_consultation",
  "isRealWorldVisit": false,  // v2.7 fix
  "dateRange": {"start": "2025-12-15"}
}
```

**Signs of v2.7 Failure:**
- isRealWorldVisit: true → REGRESSION of v2.7 fix

**If This Fails:** v2.7 bug fix broken

---

### Test 5: Month-Only Date (NEW TEST - v2.7 Fix Validation)
**File:** Document with "March 2024" date
**Expected Behavior:**
- dateRange accepts YYYY-MM format

**What to Check:**
```json
{
  "dateRange": {"start": "2024-03"}  // YYYY-MM format
}
```

**Signs of v2.7 Failure:**
- Date rejected or malformed

**If This Fails:** v2.7 date precision fix broken

---

## Priority 3: EDGE CASE Tests

### Test 6: Document with Metadata Pages Between Encounters
**Expected Behavior:**
- Metadata pages assigned to correct encounter
- Provider continuity determines grouping

**What to Check:**
- Signature pages at end of encounter assigned to that encounter
- Cover pages at start assigned to following encounter

**Signs of v2.7 Failure:**
- Metadata pages assigned to wrong encounter
- Low confidence scores

**Why This Might Fail:**
- Missing Pattern A/B/C examples

**If This Fails:** Consider adding back metadata patterns

---

## Testing Checklist

For each test file, verify:

### Schema Compliance
- [ ] All field names correct (page_assignments, encounter_id, provider, facility)
- [ ] All encounter types valid from EncounterType union
- [ ] encounter_id matching between arrays
- [ ] pageRanges format correct [[start, end]]

### Logic Correctness
- [ ] Timeline Test applied correctly
- [ ] Planned encounters have isRealWorldVisit: false
- [ ] Lab reports with dates are timeline-worthy
- [ ] Pseudo-encounters without dates have dateRange: null
- [ ] Every page assigned exactly once

### Boundary Detection
- [ ] Multi-document files split at correct boundaries
- [ ] "Encounter Summary" headers recognized as boundaries
- [ ] Provider changes trigger boundaries
- [ ] Metadata pages grouped with correct encounter

### Quality
- [ ] Confidence scores reasonable (>0.50)
- [ ] Summaries informative and content-aware
- [ ] Justifications reference actual page content
- [ ] No obvious misclassifications

---

## Success Criteria

**v2.7 PASSES if:**
- All Priority 1 tests pass (Frankenstein, TIFF, Admin summary)
- All Priority 2 tests pass (Planned encounter, Month date)
- No critical failures on edge cases

**Proceed with v2.7 deployment without modifications**

---

**v2.7 NEEDS OPTION A if:**
- Frankenstein file boundary detection fails
- Multiple documents incorrectly grouped
- Metadata pages misassigned

**Add back the 5 critical items and re-test**

---

## Comparison Testing

If possible, run **same files through v2.4** for baseline comparison:

**Compare:**
1. Number of encounters detected (should match)
2. Boundary page assignments (should match exactly)
3. Encounter types (should match)
4. Confidence scores (can vary slightly)
5. Summaries (can vary in wording, but should be similar quality)

**Red Flags:**
- Different number of encounters → INVESTIGATE
- Different boundary pages → HIGH PRIORITY BUG
- Different encounter types → INVESTIGATE

---

## Logging and Documentation

For each test, document:

```
File: [filename]
Pages: [count]
v2.7 Result:
- Encounters detected: [count]
- Boundaries at: [page numbers]
- Issues: [any problems]

v2.4 Baseline (if available):
- Encounters detected: [count]
- Boundaries at: [page numbers]
- Match: YES/NO

Decision: PASS / FAIL / NEEDS INVESTIGATION
```

---

## Decision Matrix

After testing:

| Test Results | Action |
|-------------|--------|
| All Priority 1 + 2 pass | Deploy v2.7 as-is |
| Frankenstein fails | Implement Option A (add 5 critical items) |
| Frankenstein passes, edge cases fail | Consider Option B (add 2 critical items) |
| Multiple critical failures | Implement Option A + investigate further |

---

## Next Steps After Testing

### If v2.7 Passes All Tests:
1. Deploy to production
2. Monitor first 10-20 uploads
3. Consider Phase 2 optimization later

### If v2.7 Needs Option A:
1. I'll create v2.8 with 5 critical items added back
2. Re-test with same files
3. Deploy v2.8

### If Issues Unclear:
1. Share test results with me
2. I'll analyze what went wrong
3. Propose targeted fixes

---

## Testing Time Estimate

- Priority 1 tests: 30-45 minutes
- Priority 2 tests: 15-20 minutes
- Edge case tests: 20-30 minutes
- Comparison analysis: 15-20 minutes

**Total:** 1.5-2 hours for comprehensive testing

---

## Ready to Test

You're all set to test v2.7. The key test is **Frankenstein file** - if that passes with boundary at page 13, you're in good shape.

**Report back with:**
1. Frankenstein file result (boundary location)
2. TIFF lab report result (date extracted?)
3. Any other notable issues

Then we'll decide together whether to proceed with v2.7 or implement Option A.