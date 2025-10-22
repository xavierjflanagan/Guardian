# Test Entity List Summary - v2 (Revised)

**Total Entities:** 35
**Status:** DRAFT v2 - Awaiting final approval

**Changes from v1:**
- Removed treatments (IV fluids, nebuliser) - not procedures
- Removed assessments (triage, generic blood tests) - not procedures
- Added blood collection/venipuncture (actual MBS billable procedure)
- Added 5 chest x-ray formatting variations to test formatting impact on accuracy
- Reduced from 48 to 35 entities, focused on actual procedures only

---

## Category Breakdown

### GP Visits (14 entities)

**Consultations (3):**
1. Standard GP consultation
2. Long GP consultation
3. Telehealth consultation

**Diagnostic Tests (2):**
4. ECG
5. Spirometry

**Minor Procedures (5):**
6. Wound dressing
7. Suture removal
8. Ear syringing
13. Joint injection
14. Blood collection (venipuncture)

**Immunization (1):**
9. Influenza vaccination

**Minor Surgery (1):**
10. Skin lesion excision

**Care Plans (1):**
11. Mental health care plan

**Screening (1):**
12. Pap smear

---

### Emergency Department Visits (9 entities)

**Imaging - X-ray Formatting Variations (5):**
15. Chest X-ray (capital X, hyphen)
16. Chest x-ray (lowercase x, hyphen)
17. Chest xray (one word)
18. CXR (abbreviation)
19. XR chest (reversed order)

**Imaging - Other (3):**
20. X-ray left ankle (with laterality)
21. CT scan head
22. Ultrasound abdomen

**Procedures (1):**
23. Laceration repair

---

### Past Surgeries (12 entities)

**Abdominal Surgery (3):**
24. Appendectomy
25. Cholecystectomy
26. Inguinal hernia repair

**Orthopedic (3):**
27. Knee arthroscopy
28. Total hip replacement
29. Carpal tunnel release

**ENT (1):**
30. Tonsillectomy

**Ophthalmology (1):**
31. Cataract surgery

**Gynecology (1):**
32. Hysterectomy

**Obstetrics (1):**
33. Caesarean section

**Endoscopy (1):**
34. Colonoscopy

**Dermatology (1):**
35. Skin cancer excision

---

## Special Test Group: Chest X-ray Formatting Variations

**Purpose:** Test how different formatting affects OpenAI vector matching accuracy

**Entities 15-19 all represent the SAME procedure (chest x-ray), just formatted differently:**

| Entity ID | Text | Formatting |
|-----------|------|------------|
| 15 | Chest X-ray | Capital X, hyphen |
| 16 | Chest x-ray | Lowercase x, hyphen |
| 17 | Chest xray | One word, no hyphen |
| 18 | CXR | Abbreviation |
| 19 | XR chest | Reversed word order |

**Expected Result:** All 5 should match the same MBS code (chest radiograph)

**Hypothesis:**
- Pure vector search MAY struggle with formatting differences (especially abbreviations)
- Lexical search should handle all variations easily
- Will reveal if formatting normalization is needed in pre-processing

**Why This Matters:**
- Real medical documents have inconsistent formatting
- Need to know if OpenAI embeddings are robust to formatting variations
- May inform whether lexical fallback or text normalization is required

---

## Test Coverage

### Realistic Variations Included

**Abbreviations:**
- ECG (electrocardiogram)
- CXR (chest x-ray)
- CT (computed tomography)
- MHCP (mental health care plan)

**Anatomy Specifications:**
- X-ray left ankle (laterality specified)
- Joint injection (location unspecified - tests generalization)

**Common vs Medical Terms:**
- "Flu shot" vs "Influenza vaccination"
- "C-section" vs "Caesarean section"
- "Bowel scope" vs "Colonoscopy"

**Procedure Complexity:**
- Simple: Blood collection, wound dressing, ECG
- Moderate: Laceration repair, joint injection, skin lesion excision
- Complex: Total hip replacement, colonoscopy, hysterectomy

---

## Edge Cases to Test

1. **Formatting variations:** "Chest X-ray" vs "Chest x-ray" vs "CXR" (special test group)
2. **Abbreviations:** "ECG" vs "electrocardiogram"
3. **Anatomy variations:** "X-ray left ankle" vs "left ankle x-ray"
4. **Generic procedures:** "Standard GP consultation" (could map to multiple MBS codes)
5. **Multi-word procedures:** "Skin cancer excision", "Mental health care plan"

---

## What We Removed (and Why)

**Treatments (not procedures):**
- ✗ IV fluids - medication administration, not MBS procedure
- ✗ Nebuliser treatment - medication delivery, not MBS procedure

**Assessments (not procedures):**
- ✗ ED triage - nursing assessment, not MBS billable
- ✗ Generic "blood tests" - lab results, not procedures

**What We Added Instead:**
- ✓ Blood collection/venipuncture - actual MBS billable procedure
- ✓ 5 x-ray formatting variations - test formatting robustness

---

## Questions for Review

1. **Are these 35 entities realistic?** Do they reflect how procedures appear in medical documents?
2. **Coverage gaps?** Missing any common procedures (physiotherapy, dental, etc.)?
3. **X-ray formatting test:** Good approach to test formatting sensitivity?
4. **Blood collection vs blood tests:** Correct interpretation? (Procedure to take blood vs lab test results)
5. **Complexity balance:** Good mix of simple/moderate/complex procedures?

---

## Next Steps After Approval

Once approved:
1. Look up actual MBS codes for each entity (ground truth)
2. Verify codes exist in our MBS database (6,001 codes loaded)
3. Add expected MBS display names to JSON
4. Create baseline test script (Phase 2)
5. Run OpenAI vector search validation
6. Analyze results and determine if domain model or hybrid search needed
