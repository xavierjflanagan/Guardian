# Medical Code Sources - Universal vs Regional Strategy

**Purpose:** Classification of medical code libraries into universal vs regional categories

**Status:** Active - Updated for UMLS access (2025-11-22)

**Created:** 2025-10-14
**Updated:** 2025-11-22

---

## Universal vs Regional Architecture

### Database Tables

**universal_medical_codes:**
- Purpose: Globally recognized medical code standards
- Contents: SNOMED CORE, LOINC, RxNorm
- Indexing: Full HNSW vector indexes on all code systems
- Query performance: 5-50ms per entity (primary matching)

**regional_medical_codes:**
- Purpose: Country/region-specific medical codes
- Contents: SNOMED AU edition, PBS, MBS (Australia-specific)
- Indexing: Selective (PBS vector, SNOMED AU lexical)
- Query performance: 10-500ms per entity (fallback matching)

---

## Universal Code Libraries (UMLS Access)

### SNOMED CT CORE Subset

**Classification:** UNIVERSAL

**Table:** `universal_medical_codes`

**Details:**
- Source: National Library of Medicine (NLM)
- Size: 6,820 codes (vs 706k full dataset)
- Validation: Based on actual usage from 7 major healthcare institutions
  - Beth Israel Deaconess Medical Center
  - Intermountain Healthcare
  - Kaiser Permanente
  - Mayo Clinic
  - Nebraska University Medical Center
  - Regenstrief Institute
  - Hong Kong Hospital Authority
- Latest version: Derived from September 2024 US Edition
- Update frequency: Bi-annual

**Why Universal:**
- Curated for international clinical use
- Represents most common diagnoses, conditions, procedures
- Covers 90%+ of typical clinical scenarios
- No country-specific extensions

**Access:**
- Download: https://www.nlm.nih.gov/research/umls/Snomed/core_subset.html
- Requires: UMLS account (free for healthcare use)
- Format: Tab-delimited text file (~500 KB)

**File Structure:**
```
SNOMED_CID                  - Concept identifier (SNOMED code)
SNOMED_FSN                  - Fully-specified name
SNOMED_CONCEPT_STATUS       - Active/Inactive
UMLS_CUI                    - UMLS identifier
OCCURRENCE                  - Number of institutions (1-8) using this code
USAGE                       - Average usage percentage
FIRST_IN_SUBSET            - Date added to CORE
IS_RETIRED_FROM_SUBSET     - Retirement flag
LAST_IN_SUBSET             - Last version containing this code
REPLACED_BY_SNOMED_CID     - Replacement code if retired
```

### LOINC (Lab/Observation Codes)

**Classification:** UNIVERSAL

**Table:** `universal_medical_codes`

**Details:**
- Source: Regenstrief Institute
- Size: ~102,891 codes (our current dataset)
- Purpose: Laboratory observations, clinical measurements, vital signs
- Update frequency: Bi-annual (June, December)

**Why Universal:**
- THE global standard for lab test codes
- Used worldwide by laboratories and healthcare systems
- No regional variants exist (universally applicable)
- Internationally recognized for data exchange

**Access:**
- Download: Via UMLS or https://loinc.org/downloads/
- Requires: UMLS account or free LOINC account
- Format: CSV (~100 MB)

**Coverage:**
- Lab tests (chemistry, hematology, microbiology)
- Clinical observations (vital signs, physical findings)
- Radiology reports
- Clinical documents

### RxNorm (Medication Codes)

**Classification:** UNIVERSAL

**Table:** `universal_medical_codes`

**Details:**
- Source: National Library of Medicine (NLM)
- Size: ~50,000 medication codes
- Purpose: Standardized medication naming
- Update frequency: Monthly (first Monday of each month)
- Country focus: US-centric but internationally recognized

**Why Universal:**
- Standard reference terminology for medications
- Includes both generic (SCD) and branded (SBD) drugs
- Used globally for medication data exchange
- HL7/FHIR standard for medication codes

**Access:**
- Download: https://www.nlm.nih.gov/research/umls/rxnorm/
- Requires: UMLS account
- Format: RRF (Rich Release Format) - pipe-delimited text

**Key Files:**
```
RxNorm_full_MMDDYYYY/
├── rrf/
│   ├── RXNCONSO.RRF    # Main concepts (drug names)
│   ├── RXNSAT.RRF      # Attributes (strength, form)
│   └── RXNREL.RRF      # Relationships
```

**Brand Name Handling:**
- Generic drugs: SCD (Semantic Clinical Drug) - ~18,604 codes
- Branded drugs: SBD (Semantic Branded Drug) - ~14,609 codes
- Each brand gets unique RXCUI code

**Example:**
- Generic: "Atorvastatin 20 MG Oral Tablet" (RXCUI: 617318)
- Branded: "Lipitor 20 MG Oral Tablet" (RXCUI: 617310)

---

## Regional Code Libraries (Australia)

### SNOMED CT Australian Edition

**Classification:** REGIONAL (Australia)

**Table:** `regional_medical_codes`

**Details:**
- Source: SNOMED International + Australian extensions
- Size: 706,544 codes
- Purpose: Australian-specific clinical terminology
- Update frequency: Bi-annual (January, July)
- Already in database: Yes (currently in regional_medical_codes)

**Why Regional:**
- Contains Australian-specific extensions beyond international edition
- Includes Australia-specific procedures, findings, conditions
- May include codes not in CORE subset (rare diseases)
- Optimized for Australian clinical documentation

**Access:**
- Download: Via UMLS (Australian edition)
- Requires: UMLS account
- Format: RF2 (Release Format 2) - tab-delimited text

**Strategic Use:**
- Fallback for entities not found in CORE subset
- Rare disease coding
- Australian-specific clinical detail

### PBS (Pharmaceutical Benefits Scheme)

**Classification:** REGIONAL (Australia)

**Table:** `regional_medical_codes`

**Details:**
- Source: Australian Government Department of Health
- Size: 14,382 codes (current dataset)
- Purpose: Australian subsidized medications
- Update frequency: Monthly
- Already in database: Yes (currently in regional_medical_codes)

**Why Regional:**
- Australia-specific subsidy program
- Australian brand names and formulations
- PBS-specific codes and pricing
- Not applicable outside Australia

**Access:**
- Download: https://www.pbs.gov.au/info/industry/useful-resources
- Public access: Free API/CSV downloads
- Format: CSV (monthly releases)

**Key Fields:**
```csv
li_item_id              # Unique per brand (most granular)
pbs_code                # Grouping code
drug_name               # Generic name
brand_name              # Brand name
schedule_form           # Formulation details
organisation_id         # Manufacturer
```

**Brand Name Handling:**
- Multiple brands per medication
- Example: PBS code "10004M" has 2 brands (Sutent, Sunitinib Sandoz)
- Each brand gets unique li_item_id

**Strategic Use:**
- Primary for Australian medication matching
- Fallback for RxNorm (when AU brand not in RxNorm)
- Provides AU-specific pricing and subsidy information

### MBS (Medicare Benefits Schedule)

**Classification:** REGIONAL (Australia)

**Table:** Deleted (not used)

**Details:**
- Source: Australian Government Department of Health
- Purpose: Medical service/procedure billing codes
- Decision: Not clinically useful for patient data extraction
- Status: Previously had 6,001 codes, deleted from database

**Why Not Used:**
- Billing codes, not clinical codes
- Focus is procedure cost, not clinical detail
- Patient care doesn't require MBS item numbers
- SNOMED CT provides better clinical procedure coding

---

## Universal vs Regional Routing Strategy

### Lab Results
```
Entity Category: lab_result, observation
Primary: LOINC (universal_medical_codes)
Method: Vector similarity search
Performance: 5-20ms
Fallback: None needed (LOINC is comprehensive)
```

### Medications
```
Entity Category: medication
Primary: RxNorm (universal_medical_codes)
Method: Vector similarity search
Performance: 5-20ms
Fallback: PBS (regional_medical_codes) for AU brands
Performance: 10-50ms
```

### Clinical Terms (Conditions, Procedures, Findings)
```
Entity Category: condition, procedure, physical_finding
Primary: SNOMED CORE (universal_medical_codes)
Method: Vector similarity search
Performance: 5-20ms
Fallback: SNOMED AU (regional_medical_codes) for rare diseases
Performance: 200-500ms (lexical search)
```

---

## Brand Name Handling Summary

**Research Question:** How do universal and regional medical code libraries handle medication brand names?

### Universal Libraries

**RxNorm (USA):**
- Includes brands: SCD (generic) + SBD (branded)
- Each brand gets unique RXCUI
- Example: Atorvastatin vs Lipitor (different codes)

**SNOMED CT (International/CORE):**
- No brands in international release
- Brands in national extensions (country-specific)
- CORE subset: Generic clinical concepts only

**LOINC (International):**
- Not applicable (lab/observation codes, not medications)

### Regional Libraries (Australia)

**PBS:**
- Includes brands: Multiple brands per medication
- Structure: li_item_id (unique per brand) + pbs_code (grouping)
- Example: PBS code "10004M" has 2 brands (Sutent, Sunitinib Sandoz)

**SNOMED AU:**
- May include Australian-specific brand extensions
- Focus: Clinical terminology, not primarily medications

### Architecture Decision

Use most granular unique identifier available:
- **RxNorm:** RXCUI (already unique per SCD/SBD)
- **PBS:** li_item_id (unique per brand) + pbs_code (for grouping)
- **SNOMED/LOINC:** Standard codes (brands not applicable)

---

## Medical Importance of Brand Names

**Why Brand Preservation Matters:**

1. **Bioequivalence Variations**: Generic medications allowed 20% variation (critical for warfarin, levothyroxine)
2. **Excipient Allergies**: Different fillers/dyes between brands can cause reactions
3. **Biosimilar Distinctions**: Biologics not perfectly identical (Humira vs Amjevita)
4. **Patient Compliance**: Elderly patients may only recognize brand names
5. **Cost Tracking**: Insurance formulary changes, price monitoring over time
6. **Clinical Documentation**: Healthcare providers need exact medication tracking

---

## Data Acquisition Workflow

### Universal Libraries (UMLS Account Required)

**Step 1: Create UMLS Account**
1. Visit: https://uts.nlm.nih.gov/uts/signup-login
2. Register (approval: 1-2 business days)
3. Download: SNOMED CORE, LOINC, RxNorm

**Step 2: Download Files**
- SNOMED CORE: ~500 KB text file
- LOINC: ~100 MB CSV
- RxNorm: ~500 MB RRF files

**Step 3: Populate universal_medical_codes Table**
- Parse files to standardized JSON format
- Generate embeddings (OpenAI text-embedding-3-small)
- Load to universal_medical_codes table
- Create HNSW vector indexes

### Regional Libraries (Public Access)

**Step 1: Download PBS**
- Visit: https://www.pbs.gov.au/info/industry/useful-resources
- Download: Monthly CSV release
- Size: ~10 MB

**Step 2: Download SNOMED AU (Optional)**
- Via UMLS (same account as above)
- Already have: 706,544 codes in database

**Step 3: Populate regional_medical_codes Table**
- Parse files to standardized JSON format
- Generate embeddings (selective - PBS yes, SNOMED AU no)
- Load to regional_medical_codes table
- Create indexes (PBS vector, SNOMED AU lexical)

---

## Update Schedule

| Library | Table | Update Frequency | Next Update |
|---------|-------|------------------|-------------|
| SNOMED CORE | Universal | Bi-annual | January 2026, July 2026 |
| LOINC | Universal | Bi-annual | June 2026, December 2026 |
| RxNorm | Universal | Monthly | First Monday of each month |
| SNOMED AU | Regional | Bi-annual | January 2026, July 2026 |
| PBS | Regional | Monthly | First of each month |

**Recommendation:** Set calendar reminders for quarterly updates (SNOMED + LOINC + RxNorm)

---

## Future Regional Codes (International Expansion)

When expanding beyond Australia:

**UK:**
- NHS dm+d (Dictionary of Medicines and Devices)
- Classification: Regional (UK)
- Table: regional_medical_codes

**US:**
- NDC (National Drug Code)
- Classification: Regional (US) - despite being US-based
- Table: regional_medical_codes (FDA-specific codes)

**Germany:**
- PZN (Pharmazentralnummer)
- Classification: Regional (Germany)
- Table: regional_medical_codes

**Strategy:** Keep RxNorm/LOINC/SNOMED CORE as universal, add country-specific regional libraries as needed

---

**Last Updated:** 2025-11-22
**Status:** Updated for universal vs regional strategy
**Reference:** See MEDICAL-CODE-LIBRARY-STRATEGY-AUDIT.md for strategic rationale
