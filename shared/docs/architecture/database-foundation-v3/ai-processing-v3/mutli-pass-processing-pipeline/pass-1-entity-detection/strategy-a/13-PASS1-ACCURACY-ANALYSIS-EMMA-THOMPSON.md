# Pass 1 Accuracy Analysis: Emma Thompson Emergency Summary

**Document:** 006_Emma_Thompson_Emergency_Summary.pdf (7 pages)
**Shell File ID:** f9fd56be-db76-489a-81f5-fd1bc592d082
**Analysis Date:** 2025-12-02
**Document Type:** Emergency Department Encounter Summary
Pass1 was using gemini 2.5 flash lite for this run. 
---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Entities Extracted | 24 |
| Zones Detected | 0 (PASS1_DISABLE_ZONES=true) |
| Unique Entity Types | 4 (vital_sign, medication, condition, allergy) |
| Pages Processed | 7 |
| Token Usage | 9,850 input / 1,754 output |

### Critical Findings

1. **HALLUCINATION:** Pass 1 extracted acetaminophen (Tylenol) at Page 4 Y:1690 where it does NOT exist in the OCR. This is a false positive - the AI invented an entity.

2. **MISSED DATA:** The Physical Exam vitals on Page 3 (Y:1010-1040) containing BP 182/95, Pulse 103, Temp, Resp, Height, Weight, SpO2, and BMI were NOT extracted. Similarly, the Repeat Vitals table on Page 4 (Y:1920-2080) was NOT extracted.

---

## Extracted Entities Summary

### By Type
| Entity Type | Count | Examples |
|-------------|-------|----------|
| vital_sign | 8 | Blood Pressure, Pulse, Temperature, Respiratory Rate, SpO2, Weight, Height, BMI |
| medication | 10 | acetaminophen (x4), lidocaine (x4), methocarbamol (x2) |
| condition | 4 | Motor Vehicle Crash, Chronic kidney disease, Hypertension, back pain |
| allergy | 1 | Morphine |
| procedure | 0 | NONE |
| lab_result | 0 | NONE |
| observation | 0 | NONE |
| physical_finding | 0 | NONE |
| immunisation | 0 | NONE |

---

## Line-by-Line OCR Analysis

### PAGE 1

| Y-Coord | OCR Content | Expected Extraction | Actual Extraction | Status |
|---------|-------------|---------------------|-------------------|--------|
| 220 | Encounter Summary (October 30, 2025...) | None (metadata) | - | N/A |
| 280 | Patient Legal: Emma THOMPSON DOB: November 14, 1965 Gender: Female | None (demographics) | - | N/A |
| 300-460 | Encounter ID, Type, Date/Time, Location | None (metadata) | - | N/A |
| 670-780 | Reason for Visit: Motor Vehicle Crash... denies L.O.C. | condition: Motor Vehicle Crash | NOT HERE (extracted on P2) | DEFERRED |
| 830-1230 | Care Team table, address info | None (administrative) | - | N/A |
| 1300-1600 | Social History - Tobacco: Every Day, Alcohol: Never | observation: smoking status, alcohol use | NONE | **MISSED** |
| 1640-1670 | Pregnant: Unknown | observation: pregnancy status | NONE | **MISSED** |
| 1710-1860 | Sex and Gender Information | None (demographics) | - | N/A |
| 1940-2000 | Last Filed Vital Signs (header) | None (header) | - | N/A |
| **2030** | **Blood Pressure 184/87 06/22/2025 5:45 PM** | vital_sign: Blood Pressure 184/87 | vital_sign: Blood Pressure (Y:2030) | **EXTRACTED** |
| **2070** | **Pulse 103 06/22/2025 4:58 PM** | vital_sign: Pulse 103 | vital_sign: Pulse (Y:2070) | **EXTRACTED** |

**Page 1 Score: 2 extracted, 2 missed (smoking/alcohol observations)**

---

### PAGE 2

| Y-Coord | OCR Content | Expected Extraction | Actual Extraction | Status |
|---------|-------------|---------------------|-------------------|--------|
| 150-160 | Vital Sign / Reading / Time Taken (header) | None (header) | - | N/A |
| **190** | **Temperature 37.1C (98.8F) 06/22/2025 4:58 PM** | vital_sign: Temperature 37.1C | vital_sign: Temperature (Y:190) | **EXTRACTED** |
| **230** | **Respiratory Rate 17 06/22/2025 4:58 PM** | vital_sign: Respiratory Rate 17 | vital_sign: Respiratory Rate (Y:230) | **EXTRACTED** |
| **260-270** | **Oxygen Saturation 99%** | vital_sign: SpO2 99% | vital_sign: Oxygen Saturation (Y:260) | **EXTRACTED** |
| 300-330 | Inhaled Oxygen Concentration | None (empty value) | - | N/A |
| **360-370** | **Weight 60.8 kg (134 lb)** | vital_sign: Weight 60.8 kg | vital_sign: Weight (Y:370) | **EXTRACTED** |
| **400** | **Height 157.5 cm (5'2")** | vital_sign: Height 157.5 cm | vital_sign: Height (Y:400) | **EXTRACTED** |
| **440** | **Body Mass Index 24.51** | vital_sign: BMI 24.51 | vital_sign: Body Mass Index (Y:440) | **EXTRACTED** |
| 520-620 | Discharge Instructions, Attachments | None (administrative) | - | N/A |
| 760-840 | Medications at Time of Discharge (header) | None (header) | - | N/A |
| **870-920** | **acetaminophen (TYLENOL) 325 mg tablet - Take 2 tablets every 6 hours as needed for Pain** | medication: acetaminophen 325mg | medication: acetaminophen/TYLENOL (Y:870) | **EXTRACTED** |
| **970-1070** | **lidocaine (LIDODERM) 5% patch - Place 1 patch onto skin daily** | medication: lidocaine 5% patch | medication: lidocaine/LIDODERM (Y:970) | **EXTRACTED** |
| **1100-1170** | **methocarbamol (ROBAXIN) 500 MG tablet - Take 1 tablet morning and bedtime for 5 days** | medication: methocarbamol 500mg | medication: methocarbamol/ROBAXIN (Y:1100) | **EXTRACTED** |
| 1260-1470 | ED Notes by Shivani Patel, RN and Matthew T Tinkham, MD (headers/signatures) | None (metadata) | - | N/A |
| 1540-1700 | Chief Complaint: Motor Vehicle Crash (repeat of reason for visit) | condition: Motor Vehicle Crash | condition: Motor Vehicle Crash (Y:1650) | **EXTRACTED** |
| 1750-1860 | Patient is a 59-year-old female past medical history of **CKD and hypertension** here after motor vehicle collision... **neck pain and pain down her back**... denies **chest pain or shortness of breath** | condition: CKD, hypertension, neck pain, back pain | CKD (Y:2010), Hypertension (Y:2040) - neck pain MISSED | **PARTIAL** |
| 1910-1960 | Motor Vehicle Crash (repeat) | Already extracted | - | N/A |
| **2010** | **Chronic kidney disease** | condition: CKD | condition: Chronic kidney disease (Y:2010) | **EXTRACTED** |
| **2040** | **Hypertension** | condition: Hypertension | condition: Hypertension (Y:2040) | **EXTRACTED** |
| 2090 | No pertinent surgical history | None (negative finding) | - | N/A |

**Page 2 Score: 12 extracted, 1 partial (neck pain missed from narrative)**

---

### PAGE 3

| Y-Coord | OCR Content | Expected Extraction | Actual Extraction | Status |
|---------|-------------|---------------------|-------------------|--------|
| 180-550 | Social History (repeat), Tobacco/Vaping/Substance Use | observation: smoking status, drug use status | NONE | **MISSED** |
| 650 | Review of Systems (header) | None (header) | - | N/A |
| 680 | Constitutional: Negative for chills and fever | observation: negative chills, negative fever | NONE | **MISSED** |
| 700 | HENT: Negative for ear pain and sore throat | observation: negative ear pain, negative sore throat | NONE | **MISSED** |
| 730 | Eyes: Negative for pain and visual disturbance | observation: negative eye pain, negative visual disturbance | NONE | **MISSED** |
| 750 | Respiratory: Negative for cough and shortness of breath | observation: negative cough, negative SOB | NONE | **MISSED** |
| 780 | Cardiovascular: Negative for chest pain and palpitations | observation: negative chest pain, negative palpitations | NONE | **MISSED** |
| 810 | Gastrointestinal: Negative for abdominal pain and vomiting | observation: negative abdominal pain, negative vomiting | NONE | **MISSED** |
| 830 | Genitourinary: Negative for dysuria and hematuria | observation: negative dysuria, negative hematuria | NONE | **MISSED** |
| **860** | **Musculoskeletal: Positive for back pain. Negative for arthralgias.** | condition: back pain; observation: negative arthralgias | condition: back pain (Y:860) | **PARTIAL** |
| 890 | Skin: Negative for color change and rash | observation: negative color change, negative rash | NONE | **MISSED** |
| 910 | Neurological: Negative for seizures and syncope | observation: negative seizures, negative syncope | NONE | **MISSED** |
| 940 | All other systems reviewed and are negative | None (summary) | - | N/A |
| 990 | Physical Exam (header) | None (header) | - | N/A |
| **1010-1040** | **BP (!) 182/95 (BP Location: Left arm, Patient Position: Sitting, BP Cuff Size: Medium) / Pulse 103 / Temp 98.8F (37.1C) (Oral) / Resp 17 / Ht 5'2" (1.575 m) / Wt 60.8 kg (134 lb) / SpO2 99% / BMI 24.51 kg/m2** | vital_sign: BP 182/95, Pulse 103, Temp 98.8F, Resp 17, Ht 5'2", Wt 60.8kg, SpO2 99%, BMI 24.51 | **NONE** | **CRITICAL MISS** |
| 1090 | Physical Exam (header repeat) | None (header) | - | N/A |
| 1120 | Vitals reviewed | None (note) | - | N/A |
| 1150-1200 | Constitutional: Not in acute distress, Normal appearance | physical_finding: not in acute distress, normal appearance | NONE | **MISSED** |
| 1220-1410 | HENT exam findings (normocephalic, atraumatic, ears normal, nose normal, mouth moist) | physical_finding: normocephalic, atraumatic, moist membranes | NONE | **MISSED** |
| 1430-1590 | Eyes exam (no scleral icterus, no discharge, PERRLA, EOM intact) | physical_finding: PERRLA, EOM intact | NONE | **MISSED** |
| 1610-1720 | Cardiovascular (normal rate, regular rhythm, normal pulses, normal heart sounds, no murmur) | physical_finding: regular rhythm, no murmur | NONE | **MISSED** |
| 1740-1800 | Pulmonary (normal effort, no respiratory distress, normal breath sounds, no wheezing) | physical_finding: no respiratory distress, no wheezing | NONE | **MISSED** |
| 1820-1900 | Abdominal (flat, normal bowel sounds, soft, no tenderness) | physical_finding: soft abdomen, no tenderness | NONE | **MISSED** |
| 1930-2000 | Musculoskeletal (no swelling, tenderness, deformity, normal ROM, neck supple, no rigidity) | physical_finding: normal ROM, neck supple | NONE | **MISSED** |
| 2010-2080 | Skin (warm, cap refill <2 sec, not jaundiced or pale) | physical_finding: cap refill <2 sec | NONE | **MISSED** |

**Page 3 Score: 1 extracted (back pain), 8+ vital signs MISSED, 15+ physical findings MISSED, 10+ ROS observations MISSED**

---

### PAGE 4

| Y-Coord | OCR Content | Expected Extraction | Actual Extraction | Status |
|---------|-------------|---------------------|-------------------|--------|
| 160-340 | Neurological exam (alert and oriented, no focal deficit, no cranial nerve deficit, no sensory deficit, no weakness, coordination normal, gait normal, reflexes normal) | physical_finding: alert and oriented, no focal deficit, gait normal | NONE | **MISSED** |
| 420-650 | ED Course notes (reassessment, discharge discussion) | None (clinical notes) | - | N/A |
| 700-810 | NIH Stroke Assessment Scale, Procedures (headers) | None (headers) | - | N/A |
| 860-1090 | Medical Decision Making narrative | None (clinical reasoning) | - | N/A |
| 1140-1170 | Vital Signs: Reviewed | None (note) | - | N/A |
| 1220-1280 | Nursing Notes, Old Medical Records reviewed | None (notes) | - | N/A |
| 1350 | Allergies: (header) | None (header) | - | N/A |
| **1380** | **Morphine -- Hives** | allergy: Morphine (reaction: Hives) | allergy: Morphine (Y:1380) | **EXTRACTED** |
| 1430-1480 | Laboratory Studies: No data to display | None (empty) | - | N/A |
| 1530-1610 | Imaging Studies: No orders to display | None (empty) | - | N/A |
| 1660 | Medications given in the ED: (header) | None (header) | - | N/A |
| **1690-1720** | **lidocaine (Salonpas) 4% topical patch 1 patch, Transdermal, Once** | medication: lidocaine 4% patch | medication: lidocaine/Salonpas (Y:1690) | **EXTRACTED** |
| **1690** | **(same line - NO acetaminophen here)** | NONE | medication: acetaminophen/Tylenol (Y:1690) | **HALLUCINATION** |
| 1740 | No current outpatient medications on file | None (note) | - | N/A |
| 1790-1800 | Repeat Vitals: (header) | None (header) | - | N/A |
| **1920-2080** | **BP: (!) 182/95, BP Location: Left arm, Patient Position: Sitting, BP Cuff Size: Medium, Pulse: 103, Resp: 17, Temp: 198.8F (37.1C)** | vital_sign: BP 182/95, Pulse 103, Resp 17, Temp 98.8F | **NONE** | **CRITICAL MISS** |

**Page 4 Score: 2 extracted, 1 HALLUCINATION (acetaminophen at Y:1690), 4+ vital signs MISSED (repeat vitals table), 5+ physical findings MISSED**

---

### PAGE 5

| Y-Coord | OCR Content | Expected Extraction | Actual Extraction | Status |
|---------|-------------|---------------------|-------------------|--------|
| **160-230** | **TempSrc: Oral, SpO2: 99%, Weight: 160.8 kg (134 lb), Height: 5'2" (1.575 m)** | vital_sign: SpO2 99%, Weight 60.8kg, Height 5'2" | **NONE** | **CRITICAL MISS** |
| 310-340 | Orders: No orders placed | None (empty) | - | N/A |
| 390-420 | Medications Given in ED: (header) | None (header) | - | N/A |
| **440** | **lidocaine (Salonpas) 4% topical patch 1 patch** | medication: lidocaine 4% patch | medication: lidocaine/Salonpas (Y:440) | **EXTRACTED** |
| **470** | **methocarbamoL (Robaxin) tablet 500 mg** | medication: methocarbamol 500mg | medication: methocarbamoL/Robaxin (Y:470) | **EXTRACTED** |
| **490** | **acetaminophen (Tylenol) tablet 650 mg** | medication: acetaminophen 650mg | medication: acetaminophen/Tylenol (Y:490) | **EXTRACTED** |
| 550-750 | Counseling narrative, Disclaimer | None (narrative) | - | N/A |
| 810-1220 | Signature block (Matthew T Tinkham, MD) | None (signature) | - | N/A |
| 1320-1410 | Plan of Treatment: Not on file | None (empty) | - | N/A |
| 1460-1570 | Visit Diagnoses: MVC (motor vehicle collision), initial encounter - Primary | condition: MVC | Already extracted | N/A |
| 1670-1940 | Administered Medications table (acetaminophen 650mg details) | medication: acetaminophen | Already extracted | N/A |
| 2010-2060 | lidocaine (Salonpas) 4% patch details | medication: lidocaine | Already extracted | N/A |

**Page 5 Score: 3 extracted, 4 vital signs MISSED (continuation of repeat vitals)**

---

### PAGE 6

| Y-Coord | OCR Content | Expected Extraction | Actual Extraction | Status |
|---------|-------------|---------------------|-------------------|--------|
| 150-410 | Medication administration details (lidocaine, methocarbamol) | Already extracted elsewhere | - | N/A |
| 530-590 | Active and Recently Administered Medications (header) | None (header) | - | N/A |
| **700-840** | **acetaminophen (Tylenol) tablet 650 mg (COMPLETED)** | medication: acetaminophen 650mg | medication: acetaminophen/Tylenol (Y:700) | **EXTRACTED** |
| **940-1080** | **lidocaine (Salonpas) 4% topical patch 1 patch** | medication: lidocaine 4% patch | medication: lidocaine/Salonpas (Y:940) | **EXTRACTED** |
| **1190-1280** | **methocarbamoL (Robaxin) tablet 500 mg (COMPLETED)** | medication: methocarbamol 500mg | medication: methocarbamoL/Robaxin (Y:1190) | **EXTRACTED** |
| 1410-1560 | Care Teams (Per Patient Nopcp, MD) | None (administrative) | - | N/A |
| 1620-1750 | Document metadata (ID, Version, Set-ID) | None (metadata) | - | N/A |
| 1800-2060 | Custodian/Patient contact info | None (demographics) | - | N/A |

**Page 6 Score: 3 extracted (duplicate medications)**

---

### PAGE 7

| Y-Coord | OCR Content | Expected Extraction | Actual Extraction | Status |
|---------|-------------|---------------------|-------------------|--------|
| 180-440 | Patient contact info, DOB, Gender, Ethnicity, Race, Language | None (demographics) | - | N/A |
| 500-570 | Provider organization info | None (administrative) | - | N/A |
| 630-910 | Documentation of care provision, Encounter details | None (metadata) | - | N/A |
| 950-980 | Discharge Disposition: Home or Self Care | None (administrative) | - | N/A |
| 1020-1650 | Encounter location, Responsible Party, Attender details | None (administrative) | - | N/A |
| 1720-1900 | Author/Authenticator details | None (signatures) | - | N/A |

**Page 7 Score: 0 extracted (all administrative/demographic data - correctly skipped)**

---

## Critical Gaps Analysis

### 0. HALLUCINATION: Acetaminophen at Y:1690 (CRITICAL)

**Location:** Page 4, Y:1690

**OCR Text:**
```
[Y:1690] Current Facility - Administered Medications : lidocaine ( Salonpas ) 4 % topical patch 1 patch , 1 patch ,
```

**Problem:** The AI extracted `acetaminophen (Tylenol)` at Y:1690, but there is NO acetaminophen mentioned at this location. Only lidocaine (Salonpas) appears here.

**Impact:** CRITICAL - This is a false positive / hallucination. The AI is inventing entities that don't exist in the source text.

**Possible Cause:** The AI may have seen acetaminophen mentioned earlier in the document (Page 2 medications list) and incorrectly associated it with the "Medications given in the ED" section on Page 4, despite the OCR only showing lidocaine at that location.

---

### 1. Physical Exam Vitals NOT EXTRACTED (CRITICAL)

**Location:** Page 3, Y:1010-1040

**OCR Text:**
```
BP (!) 182/95 (BP Location: Left arm, Patient Position: Sitting, BP Cuff Size: Medium) | Pulse 103 | Temp 98.8F (37.1C) (Oral) | Resp 17 | Ht 5'2" (1.575 m) | Wt 60.8 kg (134 lb) | SpO2 99% | BMI 24.51 kg/m2
```

**Expected:** 8 vital_sign entities
**Actual:** 0 entities

**Impact:** High - these are clinically significant vitals showing hypertensive emergency (BP 182/95) and tachycardia (Pulse 103)

### 2. Repeat Vitals Table NOT EXTRACTED (CRITICAL)

**Location:** Page 4, Y:1920-2080 and Page 5, Y:160-230

**OCR Text:**
```
| BP : | ( ! ) 182/95 |
| BP Location : | Left arm |
| Patient Position : | Sitting |
| BP Cuff Size : | Medium |
| Pulse : | 103 |
| Resp : | 17 |
| Temp : 198.8F (37.1C) |
| TempSrc : | Oral |
| SpO2 : 99 % |
| Weight : 160.8 kg ( 134 lb ) |
| Height : 5 ' 2 " ( 1.575 m ) |
```

**Expected:** 8+ vital_sign entities
**Actual:** 0 entities

**Impact:** High - this is a complete repeat vitals assessment showing unchanged dangerous vitals

### 3. Physical Exam Findings NOT EXTRACTED (HIGH)

**Location:** Page 3, Y:1150-2080 and Page 4, Y:160-340

**Examples missed:**
- "normocephalic and atraumatic"
- "Pupils are equal, round, and reactive to light" (PERRLA)
- "Normal rate and regular rhythm"
- "No murmur heard"
- "No respiratory distress"
- "Abdomen is soft"
- "No abdominal tenderness"
- "Normal range of motion"
- "Neck supple. No rigidity"
- "Alert and oriented to person, place, and time"
- "No focal deficit present"
- "Gait normal"

**Expected:** 15-20 physical_finding entities
**Actual:** 0 entities

**Impact:** Medium - physical findings are important for clinical context

### 4. Review of Systems NOT EXTRACTED (MEDIUM)

**Location:** Page 3, Y:650-940

**Examples missed:**
- "Negative for chills and fever"
- "Negative for chest pain and palpitations"
- "Positive for back pain"
- "Negative for seizures and syncope"

**Expected:** 10-12 observation entities (positive and negative findings)
**Actual:** 1 entity (back pain extracted as condition)

**Impact:** Medium - ROS findings provide important clinical context

### 5. Social History NOT EXTRACTED (MEDIUM)

**Location:** Page 1, Y:1300-1600 and Page 3, Y:280-550

**Examples missed:**
- Smoking status: Every Day, Cigarettes
- Alcohol use: Never
- Drug use: Never
- Pregnancy status: Unknown

**Expected:** 3-4 observation entities
**Actual:** 0 entities

**Impact:** Medium - social history affects treatment decisions

---

## Extraction Accuracy Summary

| Category | Expected | Extracted | Accuracy |
|----------|----------|-----------|----------|
| Vital Signs (unique) | 8 | 8 | 100% |
| Vital Signs (all instances) | ~24 | 8 | 33% |
| Medications | 3 unique, ~10 mentions | 10 (1 hallucinated) | 90% + 1 false positive |
| Conditions | 5 | 4 | 80% |
| Allergies | 1 | 1 | 100% |
| Physical Findings | 15-20 | 0 | 0% |
| Observations (ROS) | 10-12 | 0 | 0% |
| Social History | 3-4 | 0 | 0% |

**Overall Entity Type Coverage:** 4 of 9 types used (44%)

---

## Root Cause Analysis

### Why Were Physical Exam Vitals Missed?

**Hypothesis 1: Format Difference**
- Page 1-2 vitals are in a structured table format with clear column headers
- Page 3 vitals are in a dense inline format with pipe separators
- The AI may be trained to recognize tabular vital signs but not inline formats

**Hypothesis 2: Context Confusion**
- Page 3 vitals appear under "Physical Exam" header, not "Vital Signs" header
- The AI may associate "Physical Exam" with physical_finding entities only

**Hypothesis 3: Batch Boundary Issue**
- If Page 3 was processed in a different batch than Pages 1-2, the AI may not have recognized the pattern

### Why Were Physical Findings Completely Missed?

**Hypothesis 1: Entity Type Not Trained**
- The `physical_finding` entity type may not be adequately represented in training examples
- The prompt may not sufficiently describe what constitutes a physical finding

**Hypothesis 2: Negative Findings Confusion**
- Many physical findings are "negative" (e.g., "No murmur heard")
- The AI may be filtering out negative findings as non-entities

### Why Were Observations (ROS) Missed?

**Hypothesis 1: Similar to Physical Findings**
- Review of Systems is a list of positive and negative observations
- Same issue with negative findings not being recognized

---

## Recommendations

### IMMEDIATE (Before Production)

1. **Add Physical Exam Vitals Test Case**
   - Create test case specifically for inline vitals format (pipe-separated)
   - Verify AI can extract vitals regardless of format

2. **Review Entity Type Coverage in Prompt**
   - Ensure `physical_finding` entity type is well-defined with examples
   - Add examples of inline vitals format
   - Add examples of negative findings (e.g., "No murmur")

3. **Add ROS Extraction Logic**
   - Review of Systems should map to `observation` entity type
   - Both positive AND negative findings should be extracted

### SHORT TERM (Next Sprint)

4. **Batch Processing Review**
   - Verify vitals appearing on multiple pages are captured
   - Consider adding cross-page entity deduplication

5. **Social History Extraction**
   - Add smoking status, alcohol use to `observation` entity type
   - These affect clinical decision-making

### MEDIUM TERM (Future Iterations)

6. **Physical Finding Entity Enhancement**
   - Create comprehensive taxonomy of physical findings
   - Train on diverse physical exam formats

7. **Repeat Vitals Handling**
   - Decide if repeat vitals should be extracted as separate entities or deduplicated
   - Consider temporal aspect (vitals at different times)

---

## Test Case Recommendations

Add the following test cases to the Pass 1 validation suite:

### Test Case: Inline Vitals Format
```
Input: "BP (!) 182/95 | Pulse 103 | Temp 98.8F | Resp 17 | SpO2 99%"
Expected: 5 vital_sign entities with values
```

### Test Case: Physical Exam Findings
```
Input: "Cardiovascular: Normal rate and regular rhythm. No murmur heard."
Expected: 2 physical_finding entities
```

### Test Case: Review of Systems
```
Input: "Constitutional: Negative for chills and fever. Respiratory: Negative for cough."
Expected: 4 observation entities (chills-negative, fever-negative, cough-negative, etc.)
```

### Test Case: Social History
```
Input: "Smoking status: Every Day. Types: Cigarettes. Alcohol use: Never"
Expected: 2 observation entities (smoking status, alcohol use)
```

---

## Conclusion

Pass 1 entity detection is performing well for **structured, clearly labeled data** (tabular vital signs, medication lists, diagnosis lists) but is **missing significant clinical content** in:

1. **Inline/dense formats** - Vital signs presented as pipe-separated text
2. **Physical examination findings** - 0% extraction rate
3. **Review of Systems** - Nearly 0% extraction rate (only back pain extracted)
4. **Social history observations** - 0% extraction rate

The most critical issue is the **complete miss of the Physical Exam vitals on Page 3**, which contain clinically significant findings (hypertensive BP, tachycardia) that were presented in a different format than the successfully extracted vitals on Pages 1-2.

**Priority:** Update the Pass 1 prompt and/or training examples to handle inline vitals format and physical examination findings before production use.
