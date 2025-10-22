# Manual MBS Code Investigation - Ground Truth Analysis

**Purpose:** Manually identify correct MBS codes for each test entity to determine if OpenAI vector search found the right codes.

**Method:** Keyword-based SQL queries on MBS database using common medical terminology.

---

## PART 1: FAILED ENTITIES (0 Results from Vector Search)

### Entity 2: Long GP consultation

**Expected Code(s):** TBD
**Vector Search Result:** 0 results (similarity < 0.0)
**Manual Search Status:** Investigating...

---

### Entity 7: Suture removal

**Expected Code(s):** TBD
**Vector Search Result:** 0 results (similarity < 0.0)
**Manual Search Status:** Investigating...

---

### Entity 9: Influenza vaccination

**Expected Code(s):** TBD
**Vector Search Result:** 0 results (similarity < 0.0)
**Manual Search Status:** Investigating...

---

### Entity 13: Joint injection

**Expected Code(s):** TBD
**Vector Search Result:** 0 results (similarity < 0.0)
**Manual Search Status:** Investigating...

---

### Entity 15: Chest X-ray (capital X, hyphen)

**Expected Code(s):** TBD
**Vector Search Result:** 0 results (similarity < 0.0)
**Manual Search Status:** Investigating...

---

### Entity 16: Chest x-ray (lowercase x, hyphen)

**Expected Code(s):** TBD
**Vector Search Result:** 0 results (similarity < 0.0)
**Manual Search Status:** Investigating...

---

### Entity 17: Chest xray (one word)

**Expected Code(s):** TBD
**Vector Search Result:** 0 results (similarity < 0.0)
**Manual Search Status:** Investigating...

---

### Entity 19: XR chest (reversed order)

**Expected Code(s):** TBD
**Vector Search Result:** 0 results (similarity < 0.0)
**Manual Search Status:** Investigating...

---

### Entity 20: X-ray left ankle

**Expected Code(s):** TBD
**Vector Search Result:** 0 results (similarity < 0.0)
**Manual Search Status:** Investigating...

---

### Entity 21: CT scan head

**Expected Code(s):** TBD
**Vector Search Result:** 0 results (similarity < 0.0)
**Manual Search Status:** Investigating...

---

### Entity 22: Ultrasound abdomen

**Expected Code(s):** TBD
**Vector Search Result:** 0 results (similarity < 0.0)
**Manual Search Status:** Investigating...

---

### Entity 25: Cholecystectomy

**Expected Code(s):** TBD
**Vector Search Result:** 0 results (similarity < 0.0)
**Manual Search Status:** Investigating...

---

### Entity 28: Total hip replacement

**Expected Code(s):** TBD
**Vector Search Result:** 0 results (similarity < 0.0)
**Manual Search Status:** Investigating...

---

## PART 2: SUCCESSFUL ENTITIES (Verification Needed)

### Entity 1: Standard GP consultation

**Vector Search Top Result:** 10905 (49.8%) - "REFERRED COMPREHENSIVE INITIAL CONSULTATION Professional attendance of more than 15 minutes duration..."
**Manual Verification Status:** Investigating...

---

### Entity 3: Telehealth consultation

**Vector Search Top Result:** 93095 (44.1%) - "Eating disorder psychological treatment service provided by video attendance..."
**Manual Verification Status:** Investigating...

---

### Entity 4: ECG

**Vector Search Top Result:** 73829 (28.5%) - "Leucocyte count, erythrocyte sedimentation rate..."
**Manual Verification Status:** Investigating...

---

### Entity 5: Spirometry

**Vector Search Top Result:** 66900 (37.6%) - "CARBON-LABELLED UREA BREATH TEST..."
**Manual Verification Status:** Investigating...

---

### Entity 6: Wound dressing

**Vector Search Top Result:** 46134 (49.6%) - "Definitive burn wound closure..."
**Manual Verification Status:** Investigating...

---

### Entity 8: Ear syringing

**Vector Search Top Result:** 10943 (22.3%) - "Additional testing to confirm diagnosis of... binocular..."
**Manual Verification Status:** Investigating...

---

### Entity 10: Skin lesion excision

**Vector Search Top Result:** 55084 (23.5%) - "Urinary bladder, ultrasound scan..."
**Manual Verification Status:** Investigating...

---

### Entity 11: Mental health care plan

**Vector Search Top Result:** 80170 (49.2%) - "Focussed psychological strategies health service..."
**Manual Verification Status:** Investigating...

---

### Entity 12: Pap smear

**Vector Search Top Result:** 16060 (18.3%) - "177Lutetium-DOTA-somatostatin receptor agonist treatment..."
**Manual Verification Status:** Investigating...

---

### Entity 14: Blood collection

**Vector Search Top Result:** 13839 (58.6%) - "ARTERIAL PUNCTURE and collection of blood for diagnostic purposes"
**Manual Verification Status:** Investigating...

---

### Entity 18: CXR (abbreviation)

**Vector Search Top Result:** 53410 (24.8%) - "ZYGOMATIC BONE, treatment of fracture..."
**Manual Verification Status:** Investigating...

---

### Entity 23: Laceration repair

**Vector Search Top Result:** 30052 (56.4%) - "FULL THICKNESS LACERATION OF EAR, EYELID, NOSE OR LIP, repair of..."
**Manual Verification Status:** Investigating...

---

### Entity 24: Appendectomy

**Vector Search Top Result:** 65087 (25.9%) - "Bone marrow - examination of aspirated material..."
**Manual Verification Status:** Investigating...

---

### Entity 26: Inguinal hernia repair

**Vector Search Top Result:** 44114 (63.7%) - "Inguinal hernia, laparoscopic or open repair of..."
**Manual Verification Status:** CORRECT ✓

---

### Entity 27: Knee arthroscopy

**Vector Search Top Result:** 49582 (63.3%) - "Meniscal repair of knee, by arthroscopic means"
**Manual Verification Status:** CORRECT ✓

---

### Entity 29: Carpal tunnel release

**Vector Search Top Result:** 38730 (26.5%) - "Anastomosis or repair of intrathoracic vessels..."
**Manual Verification Status:** Investigating...

---

### Entity 30: Tonsillectomy

**Vector Search Top Result:** 10940 (22.3%) - "Full quantitative computerised perimetry..."
**Manual Verification Status:** Investigating...

---

### Entity 31: Cataract surgery

**Vector Search Top Result:** 42749 (54.4%) - "Glaucoma filtering surgery..."
**Manual Verification Status:** Investigating...

---

### Entity 32: Hysterectomy

**Vector Search Top Result:** 73833 (24.1%) - "Pregnancy test by 1 or more immunochemical methods..."
**Manual Verification Status:** Investigating...

---

### Entity 33: Caesarean section

**Vector Search Top Result:** 38736 (36.2%) - "Systemic pulmonary or Cavo-pulmonary shunt, creation of..."
**Manual Verification Status:** Investigating...

---

### Entity 34: Colonoscopy

**Vector Search Top Result:** 43822 (49.2%) - "ANORECTAL MALFORMATION, laparotomy and colostomy for"
**Manual Verification Status:** Investigating...

---

### Entity 35: Skin cancer excision

**Vector Search Top Result:** 31362 (58.7%) - "Non-malignant skin lesion... including subcutaneous tissue..."
**Manual Verification Status:** Investigating (code says NON-malignant, but entity is cancer)

---

## Investigation Progress

- [ ] Entity 2: Long GP consultation
- [ ] Entity 7: Suture removal
- [ ] Entity 9: Influenza vaccination
- [ ] Entity 13: Joint injection
- [ ] Entity 15-17, 19: Chest X-ray variations
- [ ] Entity 20: X-ray left ankle
- [ ] Entity 21: CT scan head
- [ ] Entity 22: Ultrasound abdomen
- [ ] Entity 25: Cholecystectomy
- [ ] Entity 28: Total hip replacement

**Status:** Investigation starting...
