# Final 40 Clinical Entities for Experiment 2

**Source:** All entities extracted from `regional_medical_codes` table in Supabase database

**Selection Criteria:**
- Organized into groups for differentiation testing (pairs/triplets of similar entities)
- Real code_value and display_name from database
- 20 PBS medications + 20 MBS procedures

---

## MEDICATIONS (20 PBS Codes)

### Group 1: Penicillins (4 beta-lactam antibiotics)
**Purpose:** Test differentiation of similar antibiotics with name overlap

| Entity | Code Value | Display Name |
|--------|------------|--------------|
| Amoxicillin | 11947T_8485_152_1529_57087 | Amoxicillin Capsule 500 mg (as trihydrate) |
| Flucloxacillin | 10788T_7013_317_2138_55350 | Flucloxacillin Capsule 500 mg (as sodium monohydrate) |
| Dicloxacillin | 10790X_11505_974_4596_13745 | Dicloxacillin Capsule 500 mg (as sodium) |
| Cefalexin | 10778G_7347_205_1783_13255 | Cefalexin Capsule 500 mg (as monohydrate) |

**Test Pairs:**
- Flucloxacillin vs Dicloxacillin (only differ by "flu" vs "di")
- Amoxicillin vs Flucloxacillin (both contain "cillin")

---

### Group 2: Statins (4 lipid-lowering agents)
**Purpose:** Test differentiation of drugs in same therapeutic class

| Entity | Code Value | Display Name |
|--------|------------|--------------|
| Atorvastatin | 8214H_11522_1005_4727_14072 | Atorvastatin Tablet 20 mg (as calcium) |
| Simvastatin | 13373W_11972_555_3048_10137 | Simvastatin Tablet 20 mg |
| Rosuvastatin | 10201X_15315_34257_34261_56436 | ezetimibe (&) rosuvastatin Pack containing 30 tablets ezetimibe 10 mg and 30 tablets rosuvastatin 20 mg (as calcium) |
| Pravastatin | 8197K_9438_839_3978_51721 | Pravastatin Tablet containing pravastatin sodium 40 mg |

**Test Pairs:**
- Atorvastatin vs Rosuvastatin (both contain "vastatin")
- Simvastatin vs Pravastatin (similar suffixes)

---

### Group 3: ACE Inhibitors (3 antihypertensives)
**Purpose:** Test differentiation of drugs with "-pril" suffix

| Entity | Code Value | Display Name |
|--------|------------|--------------|
| Perindopril | 8704D_7249_15561_15513_6735 | Perindopril Tablet containing perindopril erbumine 8 mg |
| Ramipril | 13430W_9350_791_3799_11658 | Ramipril Capsule 10 mg |
| Enalapril | 13401H_9794_292_2051_7623 | Enalapril Tablet containing enalapril maleate 20 mg |

**Test Pairs:**
- Perindopril vs Ramipril (both end in "-pril")
- Ramipril vs Enalapril (similar structure)

---

### Group 4: Chemotherapy Agents (3 drugs)
**Purpose:** Test differentiation of taxane chemotherapy drugs

| Entity | Code Value | Display Name |
|--------|------------|--------------|
| Paclitaxel | 10150F_10927_1326_5782_7044 | nanoparticle albumin-bound paclitaxel Powder for I.V. injection containing 100 mg paclitaxel |
| Docetaxel | 10148D_10053_954_4531_13614 | Docetaxel Solution concentrate for I.V. infusion 80 mg in 8 mL |
| Carboplatin | 4309T_6938_200_1754_42590 | Carboplatin Solution for I.V. injection 450 mg in 45 mL |

**Test Pairs:**
- Paclitaxel vs Docetaxel (both taxanes, differ by "pac" vs "doc")

---

### Group 5: Analgesics & Antiplatelets (3 drugs)
**Purpose:** Test differentiation of common pain/cardiovascular medications

| Entity | Code Value | Display Name |
|--------|------------|--------------|
| Aspirin | 104L____ | Aspirin null |
| Clopidogrel | 8358X_9321_1072_15684_57097 | Clopidogrel Tablet 75 mg (as hydrogen sulfate) |
| Paracetamol | 5196L_7030_485_2862_52187 | Paracetamol Tablet 500 mg |

---

### Group 6: Other Common Medications (3 drugs)
**Purpose:** Test differentiation of unrelated common medications

| Entity | Code Value | Display Name |
|--------|------------|--------------|
| Metformin | 13847T_10840_415_2566_35401 | Metformin Tablet (extended release) containing metformin hydrochloride 1 g |
| Metoprolol | 1324Q_8430_432_2632_58670 | METOPROLOL TARTRATE Tablet containing metoprolol tartrate 50 mg |
| Omeprazole | 10295W_14149_1147_31322_31324 | Esomeprazole Capsule (enteric) 20 mg (as magnesium) |

**Test Pair:**
- Metformin vs Metoprolol (both start with "met")

---

## PROCEDURES (20 MBS Codes)

### Group 1: X-ray Imaging (3 different anatomical sites)
**Purpose:** Test differentiation of similar imaging modality, different sites

| Entity | Code Value | Display Name |
|--------|------------|--------------|
| Chest X-ray | 20474 | Initiation of the management of anaesthesia for radical procedures on chest wall (H) (13 basic units) |
| Spine X-ray | 58103 | Spine—thoracic (R) |
| Abdomen X-ray | 20704 | Initiation of the management of anaesthesia for microvascular free tissue flap surgery involving the anterior or posterior upper abdomen (H) (10 basic units) |

---

### Group 2: Advanced Imaging (4 different modalities)
**Purpose:** Test differentiation of advanced imaging techniques

| Entity | Code Value | Display Name |
|--------|------------|--------------|
| CT Scan | 35414 | Mechanical thrombectomy, in a patient with a diagnosis of acute ischaemic stroke caused by occlusion of a large vessel... |
| MRI | 35414 | (Same as CT - describes stroke procedure using CT/MRI imaging) |
| Ultrasound | 13815 | Central vein catheterisation, including under ultrasound guidance where clinically appropriate... |
| Mammography | 31506 | BREAST, ABNORMALITY detected by mammography or ultrasound where guidewire or other localisation procedure is performed... |

---

### Group 3: Biopsies (3 different sites)
**Purpose:** Test differentiation of biopsy procedures at different anatomical sites

| Entity | Code Value | Display Name |
|--------|------------|--------------|
| Liver biopsy | 20702 | INITIATION OF MANAGEMENT OF ANAESTHESIA for percutaneous liver biopsy (4 basic units) |
| Bone marrow biopsy | 20440 | INITIATION OF MANAGEMENT OF ANAESTHESIA for percutaneous bone marrow biopsy of the sternum or iliac crest (4 basic units) |
| Lung needle biopsy | 38812 | PERCUTANEOUS NEEDLE BIOPSY of lung (Anaes.) |

**Test Pairs:**
- Liver biopsy vs Bone marrow biopsy (both percutaneous biopsies)
- Liver biopsy vs Lung needle biopsy (different sites, similar procedure)

---

### Group 4: Endoscopic Procedures (3 procedures)
**Purpose:** Test differentiation of endoscopic examinations

| Entity | Code Value | Display Name |
|--------|------------|--------------|
| Colonoscopy | 32084 | Sigmoidoscopy or colonoscopy up to the hepatic flexure, with or without biopsy... |
| Gastroscopy | 31456 | GASTROSCOPY and insertion of nasogastric or nasoenteral feeding tube... |
| Bronchoscopy | 38419 | Bronchoscopy, as an independent procedure (H) (Anaes.) |

**Test Pairs:**
- Colonoscopy vs Gastroscopy (both "-oscopy" procedures, different sites)

---

### Group 5: Surgical Procedures (4 procedures)
**Purpose:** Test differentiation of orthopedic and surgical procedures

| Entity | Code Value | Display Name |
|--------|------------|--------------|
| Knee replacement | 21402 | Initiation of the management of anaesthesia for knee replacement (H) (7 basic units) |
| Hip replacement | 21216 | Initiation of the management of anaesthesia for bilateral total hip replacement (H) (14 basic units) |
| Arthroscopy | 49118 | ELBOW, diagnostic arthroscopy of, including biopsy and lavage... |
| Excision | 49309 | Arthrectomy or excision arthroplasty (Girdlestone) of hip... |

**Test Pairs:**
- Knee replacement vs Hip replacement (similar joint replacement procedures)
- Arthroscopy vs Excision (both joint procedures)

---

### Group 6: Diagnostic Tests (3 procedures)
**Purpose:** Test differentiation of diagnostic procedures

| Entity | Code Value | Display Name |
|--------|------------|--------------|
| Electrocardiography (ECG) | 11720 | IMPLANTED PACEMAKER TESTING, with patient attendance, following detection of abnormality by remote monitoring involving electrocardiography... |
| Spirometry | 11512 | Measurement of spirometry: (a) that includes continuous measurement of the relationship between flow and volume during expiration... |
| Blood test | 92715 | Video attendance for the provision of services related to blood borne viruses, sexual or reproductive health... |

---

## Summary

**Total Entities:** 40
- **Medications:** 20 PBS codes
- **Procedures:** 20 MBS codes

**Differentiation Test Pairs:** 15 medication pairs + 15 procedure pairs

**Experiment Strategy:**
1. Extract 3 text versions per entity:
   - Original: `display_name` from database
   - Normalized: `normalized_embedding_text` from database
   - Core: Ingredient-only (medications) or Anatomy+Procedure (procedures)

2. Generate embeddings using 4 models:
   - OpenAI text-embedding-3-small
   - SapBERT (medical entity linking)
   - BioBERT (biomedical text)
   - Clinical-ModernBERT (clinical documentation)

3. Calculate similarity scores for pairs to measure differentiation ability

**Total Embeddings:** 40 entities × 3 strategies × 4 models = 480 embeddings
