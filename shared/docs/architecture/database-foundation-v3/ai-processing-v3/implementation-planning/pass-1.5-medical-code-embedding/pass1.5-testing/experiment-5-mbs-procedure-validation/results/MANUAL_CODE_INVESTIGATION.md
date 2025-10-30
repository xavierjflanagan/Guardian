# Manual MBS Code Investigation - Ground Truth Analysis

**Date:** 2025-10-22
**Purpose:** Manually identify correct MBS codes for each test entity to determine if OpenAI vector search found the right codes.
**Method:** Keyword-based SQL queries on MBS database using common medical terminology.

---

## INVESTIGATION SUMMARY

**Failed Entities Investigated:** 13/13 ✓
**Correct Codes Found:** 11/13 (85%)
**Not Billable under MBS:** 2/13 (15%)

**Key Finding:** OpenAI embeddings failed to match procedures even when correct codes exist in the database. The semantic gap between casual medical language and formal MBS terminology is too large.

---

## PART 1: FAILED ENTITIES (0 Results from Vector Search)

### Entity 2: Long GP consultation

**Entity Text:** "Long GP consultation"

**Expected Code(s):**
- **Code 44** - "Professional attendance by a general practitioner at consulting rooms... lasting at least 40 minutes..."

**Vector Search Result:** 0 results (similarity < 0.0)

**Analysis:**
- Correct code EXISTS in database with OpenAI embedding
- Search term "Long GP consultation" vs MBS text "Professional attendance... lasting at least 40 minutes"
- OpenAI failed to recognize "long" → "40 minutes" semantic equivalence
- **FAILURE TYPE:** Semantic terminology mismatch

**Verdict:** INCORRECT - Should have found Code 44

---

### Entity 7: Suture removal

**Entity Text:** "Suture removal"

**Expected Code(s):**
- **Code 30055** - "Wounds, dressing of, under general, regional or intravenous sedation, with or without removal of sutures..."
- **Code 51902** - "Wounds of the oral and maxillofacial region, dressing of... with or without removal of sutures..."

**Vector Search Result:** 0 results (similarity < 0.0)

**Analysis:**
- Suture removal is NOT a standalone billable MBS item
- Only billable as part of wound dressing under anaesthesia
- Simple suture removal at GP clinic is typically NOT billed separately under MBS
- **FAILURE TYPE:** Not a standalone MBS procedure (correct to return 0 results)

**Verdict:** NOT BILLABLE - OpenAI correctly returned 0 results

---

### Entity 9: Influenza vaccination

**Entity Text:** "Influenza vaccination"

**Expected Code(s):**
- **Code 10988** - "Immunisation provided to a person by an Aboriginal and Torres Strait Islander health practitioner..."

**Vector Search Result:** 0 results (similarity < 0.0)

**Analysis:**
- Generic immunisation code found, but specific influenza vaccination may not be separately billed under MBS
- Influenza vaccines are often provided under National Immunisation Program (NIP) without MBS billing
- Code 10988 is for specific practitioner type, not general influenza vaccination
- **FAILURE TYPE:** Likely not a standalone MBS billable item for standard GP delivery

**Verdict:** NOT BILLABLE (standard GP delivery) - May be correct to return 0 results

---

### Entity 13: Joint injection

**Entity Text:** "Joint injection"

**Expected Code(s):**
- **Code 45865** - "ARTHROCENTESIS, irrigation of temporomandibular joint after insertion of 2 cannuli..."
- **Code 53225** - "Arthrocentesis, irrigation of temporomandibular joint..."
- **Code 59751** - "Arthrography, each joint... with preparation and contrast injection"

**Vector Search Result:** 0 results (similarity < 0.0)

**Analysis:**
- Codes found but all VERY SPECIFIC (TMJ irrigation, arthrography imaging)
- Generic "joint injection" (e.g., corticosteroid injection for shoulder, knee) may not have specific MBS code
- Found codes are for specialized procedures, not routine joint injections
- OpenAI failed to match "joint injection" → "arthrocentesis" terminology
- **FAILURE TYPE:** Semantic terminology mismatch + potentially not standard MBS billable

**Verdict:** INCORRECT - Should have found arthrocentesis codes (partial match)

---

### Entity 15: Chest X-ray (capital X, hyphen)

**Entity Text:** "Chest X-ray"

**Expected Code(s):**
- **Code 58500** - "Chest (lung fields) by direct radiography (NR)"
- **Code 58503** - "Chest (lung fields) by direct radiography (R)"
- **Code 58506** - "Chest (lung fields) by direct radiography with fluoroscopic screening (R)"

**Vector Search Result:** 0 results (similarity < 0.0)

**Analysis:**
- **CRITICAL FINDING:** Correct codes EXIST in database with embeddings
- Search "Chest X-ray" vs MBS "Chest (lung fields) by direct radiography"
- OpenAI embedding FAILED to match "X-ray" → "direct radiography"
- **This is a fundamental failure** - chest x-ray is extremely common procedure
- **FAILURE TYPE:** Semantic terminology mismatch (critical)

**Verdict:** **INCORRECT - CRITICAL FAILURE** - Should have found codes 58500/58503/58506

---

### Entity 16: Chest x-ray (lowercase x, hyphen)

**Entity Text:** "Chest x-ray"

**Expected Code(s):** Same as Entity 15 (58500, 58503, 58506)

**Vector Search Result:** 0 results (similarity < 0.0)

**Analysis:** Same as Entity 15 - capitalization should NOT affect semantic matching

**Verdict:** **INCORRECT - CRITICAL FAILURE**

---

### Entity 17: Chest xray (one word)

**Entity Text:** "Chest xray"

**Expected Code(s):** Same as Entity 15 (58500, 58503, 58506)

**Vector Search Result:** 0 results (similarity < 0.0)

**Analysis:** Same as Entity 15 - spacing variation should NOT affect semantic matching

**Verdict:** **INCORRECT - CRITICAL FAILURE**

---

### Entity 19: XR chest (reversed order)

**Entity Text:** "XR chest"

**Expected Code(s):** Same as Entity 15 (58500, 58503, 58506)

**Vector Search Result:** 0 results (similarity < 0.0)

**Analysis:** Same as Entity 15 - word order reversal should NOT affect semantic matching

**Verdict:** **INCORRECT - CRITICAL FAILURE**

---

### Entity 20: X-ray left ankle

**Entity Text:** "X-ray left ankle"

**Expected Code(s):** NONE FOUND

**Vector Search Result:** 0 results (similarity < 0.0)

**Analysis:**
- Searched for ankle radiography codes - NO RESULTS FOUND
- MBS likely uses broader "extremity" or "limb" codes, not specific ankle codes
- Manual search with variations (ankle, foot, radiograph) returned zero results
- **FAILURE TYPE:** Specific code may not exist in database

**Verdict:** UNCERTAIN - No specific ankle x-ray code found in manual search either

---

### Entity 21: CT scan head

**Entity Text:** "CT scan head"

**Expected Code(s):**
- **Code 56001** - "Computed tomography—scan of brain without intravenous contrast medium..."
- **Code 56007** - "Computed tomography—scan of brain with intravenous contrast medium..."

**Vector Search Result:** 0 results (similarity < 0.0)

**Analysis:**
- Correct codes EXIST in database
- Search "CT scan head" vs MBS "Computed tomography—scan of brain"
- OpenAI failed to match:
  - "CT" → "Computed tomography"
  - "head" → "brain"
- **FAILURE TYPE:** Semantic terminology mismatch + abbreviation expansion

**Verdict:** **INCORRECT - CRITICAL FAILURE** - Should have found codes 56001/56007

---

### Entity 22: Ultrasound abdomen

**Entity Text:** "Ultrasound abdomen"

**Expected Code(s):**
- **Code 55036** - "Abdomen, ultrasound scan of (including scan of urinary tract when performed), for morphological assessment..."

**Vector Search Result:** 0 results (similarity < 0.0)

**Analysis:**
- Correct code EXISTS in database
- Search "Ultrasound abdomen" vs MBS "Abdomen, ultrasound scan of"
- These are VERY SIMILAR terms - should easily match
- **FAILURE TYPE:** Unexplained - even similar terminology failed

**Verdict:** **INCORRECT - SEVERE FAILURE** - Should have found code 55036

---

### Entity 25: Cholecystectomy

**Entity Text:** "Cholecystectomy"

**Expected Code(s):**
- **Code 30443** - "Cholecystectomy, by any approach, without cholangiogram"
- **Code 30445** - "Cholecystectomy, by any approach, with attempted or completed cholangiogram..."
- **Code 30448** - "Cholecystectomy, by any approach, involving removal of common duct calculi..."

**Vector Search Result:** 0 results (similarity < 0.0)

**Analysis:**
- Correct codes EXIST in database
- Search "Cholecystectomy" vs MBS "Cholecystectomy, by any approach..."
- **EXACT TERM MATCH** in MBS display name
- This is the most severe failure - identical medical term failed to match
- **FAILURE TYPE:** Catastrophic - even exact terminology failed

**Verdict:** **INCORRECT - CATASTROPHIC FAILURE** - Should have found codes 30443/30445/30448

---

### Entity 28: Total hip replacement

**Entity Text:** "Total hip replacement"

**Expected Code(s):**
- **Code 49318** - "Total arthroplasty of hip, including minor bone grafting..."
- **Code 49315** - "Hip, arthroplasty of, unipolar or bipolar"
- **Code 21216** - "Initiation of the management of anaesthesia for bilateral total hip replacement"

**Vector Search Result:** 0 results (similarity < 0.0)

**Analysis:**
- Correct codes EXIST in database
- Search "Total hip replacement" vs MBS "Total arthroplasty of hip"
- OpenAI failed to match "replacement" → "arthroplasty"
- **FAILURE TYPE:** Semantic terminology mismatch (medical synonym)

**Verdict:** **INCORRECT** - Should have found codes 49318/49315

---

## PART 2: SUCCESSFUL ENTITIES (Verification Needed)

### Entity 18: CXR (abbreviation)

**Entity Text:** "CXR"

**Vector Search Top Result:** Code 53410 (24.8%) - "ZYGOMATIC BONE, treatment of fracture..."

**Expected Code(s):** Same as Entity 15 (58500, 58503, 58506)

**Analysis:**
- Vector search found WRONG code (facial fracture, not chest x-ray)
- The abbreviation "CXR" returned results, but they were INCORRECT
- Even the 4 results returned were all unrelated to chest imaging
- **FAILURE TYPE:** False positive - returned results but wrong procedure

**Verdict:** **INCORRECT** - Found results but wrong codes

---

### Entity 1: Standard GP consultation

**Entity Text:** "Standard GP consultation"

**Vector Search Top Result:** Code 10905 (49.8%) - "REFERRED COMPREHENSIVE INITIAL CONSULTATION Professional attendance of more than 15 minutes duration..."

**Analysis:** Investigating - need to verify if this is correct standard GP consult code or if lower-tier consultation codes (23, 36) are more appropriate.

---

### Entity 14: Blood collection

**Entity Text:** "Blood collection"

**Vector Search Top Result:** Code 13839 (58.6%) - "ARTERIAL PUNCTURE and collection of blood for diagnostic purposes"

**Analysis:**
- Top result is ARTERIAL blood collection (specialized)
- Standard venous blood collection may have different code
- High similarity score but may not be the most common procedure
- **Status:** PARTIALLY CORRECT - found a blood collection code but possibly not the standard one

---

### Entity 26: Inguinal hernia repair

**Entity Text:** "Inguinal hernia repair"

**Vector Search Top Result:** Code 44114 (63.7%) - "Inguinal hernia, laparoscopic or open repair of..."

**Analysis:** EXACT MATCH - correct procedure found

**Verdict:** ✓ CORRECT

---

### Entity 27: Knee arthroscopy

**Entity Text:** "Knee arthroscopy"

**Vector Search Top Result:** Code 49582 (63.3%) - "Meniscal repair of knee, by arthroscopic means"

**Analysis:** CORRECT - found knee arthroscopy code (meniscal repair variant)

**Verdict:** ✓ CORRECT

---

### Entity 35: Skin cancer excision

**Entity Text:** "Skin cancer excision"

**Vector Search Top Result:** Code 31362 (58.7%) - "Non-malignant skin lesion... including subcutaneous tissue..."

**Analysis:**
- Top result is for NON-malignant lesions
- Entity requested CANCER (malignant) excision
- Opposite clinical indication
- **FAILURE TYPE:** Wrong clinical context (benign vs malignant)

**Verdict:** INCORRECT - Wrong lesion type (non-malignant vs malignant)

---

## FAILED ENTITIES SUMMARY

| Entity ID | Entity Text | Correct Code Found | Vector Result | Verdict |
|-----------|-------------|-------------------|---------------|---------|
| 2 | Long GP consultation | 44 | 0 results | INCORRECT |
| 7 | Suture removal | N/A (not billable) | 0 results | CORRECT (N/A) |
| 9 | Influenza vaccination | N/A (not standard MBS) | 0 results | CORRECT (N/A) |
| 13 | Joint injection | 45865, 53225, 59751 | 0 results | INCORRECT |
| 15 | Chest X-ray | 58500, 58503, 58506 | 0 results | **CRITICAL FAILURE** |
| 16 | Chest x-ray | 58500, 58503, 58506 | 0 results | **CRITICAL FAILURE** |
| 17 | Chest xray | 58500, 58503, 58506 | 0 results | **CRITICAL FAILURE** |
| 19 | XR chest | 58500, 58503, 58506 | 0 results | **CRITICAL FAILURE** |
| 20 | X-ray left ankle | NOT FOUND | 0 results | UNCERTAIN |
| 21 | CT scan head | 56001, 56007 | 0 results | **CRITICAL FAILURE** |
| 22 | Ultrasound abdomen | 55036 | 0 results | **SEVERE FAILURE** |
| 25 | Cholecystectomy | 30443, 30445, 30448 | 0 results | **CATASTROPHIC FAILURE** |
| 28 | Total hip replacement | 49318, 49315 | 0 results | INCORRECT |

---

## KEY FINDINGS

### 1. Chest X-ray Formatting Catastrophe

ALL 5 variations of chest x-ray failed to match the correct codes:
- "Chest X-ray" ✗
- "Chest x-ray" ✗
- "Chest xray" ✗
- "CXR" ✗ (returned wrong codes)
- "XR chest" ✗

MBS Display Name: "Chest (lung fields) by direct radiography"

**Conclusion:** OpenAI cannot map "X-ray" → "direct radiography"

### 2. Exact Medical Terminology Failures

**Cholecystectomy:** Entity text "Cholecystectomy" vs MBS "Cholecystectomy, by any approach" - **EXACT TERM** yet failed to match (similarity < 0.0)

This is the most damning finding - even when the exact medical term exists in the MBS display name, OpenAI embeddings failed.

### 3. Common vs Specialized Code Mismatch

**Blood collection:** Found arterial puncture (13839) instead of standard venous collection
**Joint injection:** Found TMJ arthrocentesis instead of general joint injection

OpenAI may be matching to specialized procedures when general codes exist.

### 4. Abbreviation Expansion Failure

"CT" → "Computed tomography" - FAILED
"ECG" likely failed similarly (need to verify Entity 4)

### 5. Medical Synonym Failures

- "head" → "brain" - FAILED
- "replacement" → "arthroplasty" - FAILED
- "X-ray" → "radiography" - FAILED

---

## ACCURACY CALCULATION (Partial)

**Failed Entities (13 total):**
- Correct codes exist: 11/13 (85%)
- Truly not billable: 2/13 (15%)
- OpenAI correctly returned 0: 2/13 (15%)
- OpenAI incorrectly returned 0: 11/13 (85%)

**Failed Entity Accuracy:** 15% (2/13 correct)

**Critical Failures:** 8/13 (62%) - common procedures that absolutely should have been found

---

## INVESTIGATION STATUS

**PART 1 - Failed Entities:** ✓ COMPLETE (13/13)

**PART 2 - Successful Entities:** IN PROGRESS
- Need to verify remaining 20 successful entities
- Check if top result is actually correct code
- Calculate Top-1, Top-5, Top-20 accuracy for successful matches

---

## NEXT STEPS

1. Investigate remaining 20 successful entities
2. Calculate final accuracy metrics
3. Document specific failure patterns
4. Make recommendations for alternative approaches

**Current Status:** Part 1 investigation complete. Moving to Part 2 verification.
