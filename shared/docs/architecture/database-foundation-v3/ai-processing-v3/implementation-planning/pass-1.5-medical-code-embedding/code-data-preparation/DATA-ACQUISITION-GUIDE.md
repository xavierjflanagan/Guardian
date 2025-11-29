# Pass 1.5 Medical Code Data Acquisition Guide

**Purpose:** Step-by-step instructions for acquiring medical code libraries

**Status:** Active - Updated for universal vs regional strategy (2025-11-22)

**Created:** 2025-10-15
**Updated:** 2025-11-22

---

## Overview

This guide covers acquiring medical code libraries for the two-table architecture:

**Universal Codes → `universal_medical_codes` table:**
- SNOMED CT CORE subset: 6,820 codes (NLM-validated, primary clinical matching)
- SNOMED CT International: 527,304 concepts (optional, for reference)
- RxNorm: ~50,000 medication codes (US-based, globally recognized)
- LOINC: ~102,891 lab/observation codes (global standard)

**Regional Codes (Australia) → `regional_medical_codes` table:**
- SNOMED CT AU edition: 706,544 codes (includes International + AU extensions)
- PBS: ~14,382 subsidized medication codes
- MBS: Deleted (billing codes, not clinically useful)
- ICD-10-AM: Optional (paid license, not prioritized)

**Strategy:** Universal codes for primary matching (fast, 90%+ coverage), regional codes for Australian-specific detail and rare disease fallback.

---

## 1. UMLS Account Setup (RxNorm + SNOMED + LOINC)

### Registration Process

**Step 1: Create UMLS Account**
1. Visit: https://uts.nlm.nih.gov/uts/signup-login
2. Click "Request a UTS License"
3. Fill out registration form:
   - **Purpose:** Clinical application development
   - **Organization:** Exora Health Pty Ltd
   - **Country:** Australia
   - Accept UMLS Metathesaurus License Agreement
4. Verify email address
5. Account approval typically takes 1-2 business days

**Step 2: Download RxNorm**
1. Login to UTS: https://uts.nlm.nih.gov/uts/
2. Navigate to: Downloads > RxNorm
3. Select: "RxNorm Full Monthly Release"
4. Download format: **RRF (Rich Release Format)** - easier to parse
5. Expected file: `RxNorm_full_MMDDYYYY.zip` (~500 MB)
6. Extract to: `data/medical-codes/rxnorm/`

**Key Files in RxNorm:**
```
RxNorm_full_MMDDYYYY/
├── rrf/
│   ├── RXNCONSO.RRF    # Main concepts (drug names)
│   ├── RXNREL.RRF      # Relationships between concepts
│   ├── RXNSAT.RRF      # Attributes (strength, form, etc.)
│   └── RXNCUI.RRF      # Concept unique identifiers
└── scripts/
    └── README.txt      # Field descriptions
```

**Step 3: Download SNOMED CT CORE Subset (PRIORITY)**
1. In UTS, navigate to: Downloads > SNOMED CT
2. Select: "SNOMED CT CORE Problem List Subset"
3. Download: Latest version (e.g., `SNOMEDCT_CORE_SUBSET_202506.txt`)
4. Expected file: ~500 KB text file
5. Extract to: `data/medical-codes/snomed/core-subset/`

**CORE Subset File Structure (10 columns, pipe-delimited):**
```
SNOMED_CID|SNOMED_FSN|SNOMED_CONCEPT_STATUS|UMLS_CUI|OCCURRENCE|USAGE|...
60728008|Swollen abdomen (finding)|Current|C0000731|4|0.0055|...
```

**Key Fields:**
- `OCCURRENCE`: Number of institutions (1-8) using this code
- `USAGE`: Average usage percentage across institutions
- Codes with OCCURRENCE=7-8 are most universally relevant

**Step 4: Download SNOMED CT International Edition (OPTIONAL)**
1. In UTS, navigate to: Downloads > SNOMED CT
2. Select: "SNOMED CT International Edition"
3. Download format: **RF2 (Release Format 2)**
4. Expected file: `SnomedCT_InternationalRF2_PRODUCTION_YYYYMMDD.zip` (~1 GB)
5. Extract to: `data/medical-codes/snomed/raw/`

**Note:** International edition is optional - we use CORE subset (6,820 codes) for primary matching and AU edition (706k codes) for rare disease fallback. International edition can be downloaded for reference but is not actively used in the two-tier architecture.

**Key Files in SNOMED International (if downloaded):**
```
SnomedCT_InternationalRF2/
├── Snapshot/
│   ├── Terminology/
│   │   ├── sct2_Concept_Snapshot_INT_YYYYMMDD.txt      # 527,304 concepts
│   │   ├── sct2_Description_Snapshot_INT_YYYYMMDD.txt  # Human-readable names
│   │   └── sct2_Relationship_Snapshot_INT_YYYYMMDD.txt # Hierarchies
│   └── Refset/
└── Full/  # Historical versions (skip)
```

**Step 5: Download LOINC**
1. In UTS, navigate to: Downloads > LOINC
2. Select: "LOINC Table File"
3. Download format: **CSV**
4. Expected file: `Loinc_X.XX.zip` (~200 MB)
5. Extract to: `data/medical-codes/loinc/`

**Key Files in LOINC:**
```
Loinc_X.XX/
├── LoincTable/
│   ├── Loinc.csv              # Main LOINC codes and descriptions
│   ├── LoincRsnaRadiologyPlaybook.csv
│   └── MapTo.csv              # Mappings to other systems
└── AccessoryFiles/
    ├── PartFile/              # Component parts (what's being measured)
    └── LinguisticVariants/    # Translations
```

---

## 2. PBS (Pharmaceutical Benefits Scheme) - Australia

### Data Source: Australian Government Department of Health

**⚠️ Format Update (2025-10-15):** PBS has migrated from XML to CSV API format.

**Step 1: Visit PBS API Website**
- URL: https://www.pbs.gov.au/info/industry/useful-resources
- Direct API: https://api.pbs.gov.au/

**Step 2: Download PBS CSV API Files**
1. Navigate to "PBS API CSV Files" section
2. Download: **PBS API CSV ZIP** (monthly release)
3. Expected file: `2025-10-01-PBS-API-CSV-files.zip` (~10 MB)
4. Extract to: `data/medical-codes/pbs/raw/`

**Key CSV Files in ZIP:**
```
2025-10-01-PBS-API-CSV-files/
├── tables_as_csv/
│   ├── items.csv              # PRIMARY: All PBS items with brand details
│   ├── amt-items.csv          # AMT mappings
│   ├── organisations.csv      # Manufacturers  
│   ├── restrictions.csv       # Restriction text
│   ├── prescribers.csv        # Prescriber requirements
│   └── atc-codes.csv          # ATC classification
└── documentation/
    └── PBS_API_CSV_Guide.pdf  # Field descriptions
```

**Primary CSV Structure (items.csv):**
```csv
li_item_id,drug_name,li_drug_name,li_form,schedule_form,brand_name,program_code,pbs_code,
benefit_type_code,caution_indicator,note_indicator,manner_of_administration,
moa_preferred_term,maximum_prescribable_pack,maximum_quantity_units,number_of_repeats,
organisation_id,manufacturer_code,pack_size,pricing_quantity,...
```

**Sample Record:**
```csv
"10001J_14023_31078_31081_31083","Rifaximin","Rifaximin","Tablet 550 mg",
"rifaximin 550 mg tablet, 56","Xifaxan","GE","10001J","A","N","Y","ORAL",...
```

**Legacy XML Format (Deprecated):**
The old XML feed may still be available but is no longer updated. Use CSV API for current data.

---

## 3. MBS (Medicare Benefits Schedule) - Australia

### Data Source: Australian Government Department of Health

**Step 1: Visit MBS Website**
- URL: http://www.mbsonline.gov.au/internet/mbsonline/publishing.nsf/Content/downloads
- Direct data: http://www.mbsonline.gov.au/internet/mbsonline/publishing.nsf/Content/Downloads

**Step 2: Download MBS Data**
1. Look for: "MBS Online Data" or "MBS Items Dataset"
2. Download format: **CSV or Excel** (usually updated quarterly)
3. Expected file: `MBS_Items_YYYYMMDD.xlsx` or `MBS.csv` (~5 MB)
4. Extract/save to: `data/medical-codes/mbs/`

**CSV Structure:**
```csv
Item,Description,Category,Fee,ScheduleFee
1,Professional attendance,GENERAL PRACTITIONER ATTENDANCES,$38.75,$38.75
23,Professional attendance - Level A,$76.95,$76.95
```

**Key Fields:**
- **Item**: MBS item number (e.g., "23")
- **Description**: Service description (e.g., "Professional attendance - Level A")
- **Category**: Service category (e.g., "GENERAL PRACTITIONER ATTENDANCES")
- **Fee**: Medicare scheduled fee
- **ScheduleFee**: Standard fee

**Alternative: MBS API**
If available, use programmatic access:
- Check: http://www.mbsonline.gov.au/internet/mbsonline/publishing.nsf/Content/api

---

## 4. ICD-10-AM (Australian Modification) - Optional

### Data Source: Australian Consortium for Classification Development (ACCD)

**⚠️ PAID LICENSE REQUIRED**

**Step 1: Contact ACCD**
- Website: https://www.accd.net.au/
- Email: accd@accd.net.au
- Phone: +61 2 9887 5666

**Step 2: Purchase License**
- **Cost:** ~$500-$1,000 AUD per year (institutional license)
- **Format:** Electronic files (tabular data or PDF)
- **Updates:** Annual (July 1)

**Step 3: Download After Purchase**
- Access portal provided by ACCD
- Expected format: **Excel or CSV**
- Expected file: `ICD-10-AM-Tabular-List.xlsx` (~50 MB)

**CSV Structure (typical):**
```csv
Code,Description,Category,Chapter
A00,Cholera,Infectious diseases,I
A00.0,Cholera due to Vibrio cholerae 01 biovar cholerae,Infectious diseases,I
```

**Alternative: Delay ICD-10-AM**
- ICD-10-AM is expensive and takes time to license
- Consider starting without it (use free ICD-10 generic codes as placeholder)
- Add later when budget allows

---

## 5. File Organization Structure

Create this directory structure for downloaded data:

```
Guardian-Cursor/
└── data/
    └── medical-codes/
        ├── rxnorm/
        │   ├── raw/                    # Extracted RxNorm files
        │   └── processed/              # Parsed JSON/CSV
        ├── snomed/
        │   ├── raw/                    # Extracted SNOMED files
        │   └── processed/
        ├── loinc/
        │   ├── raw/                    # Extracted LOINC files
        │   └── processed/
        ├── pbs/
        │   ├── raw/                    # PBS XML/CSV
        │   └── processed/
        ├── mbs/
        │   ├── raw/                    # MBS CSV/Excel
        │   └── processed/
        └── icd10am/
            ├── raw/                    # ICD-10-AM files (if acquired)
            └── processed/
```

---

## 6. Data Verification Checklist

After downloading, verify each dataset:

### RxNorm
- [ ] RXNCONSO.RRF exists (~500 MB)
- [ ] Can open in text editor (pipe-delimited)
- [ ] Contains drug names (e.g., "Atorvastatin")

### SNOMED-CT
- [ ] sct2_Concept_Snapshot_INT.txt exists (~150 MB)
- [ ] sct2_Description_Snapshot_INT.txt exists (~500 MB)
- [ ] Tab-delimited format

### LOINC
- [ ] Loinc.csv exists (~100 MB)
- [ ] Contains LOINC codes (e.g., "85354-9")
- [ ] CSV format with headers

### PBS
- [ ] XML file exists (~10 MB)
- [ ] Contains `<pbs-code>` tags
- [ ] Valid XML (can open in browser)

### MBS
- [ ] CSV or Excel file exists (~5 MB)
- [ ] Contains MBS item numbers (e.g., "23")
- [ ] Readable in Excel/LibreOffice

### ICD-10-AM (if acquired)
- [ ] Tabular list exists
- [ ] Contains ICD codes (e.g., "A00.0")
- [ ] License agreement on file

---

## 7. Data Refresh Schedule

Medical code libraries are updated regularly:

| Library | Update Frequency | Release Schedule |
|---------|------------------|------------------|
| RxNorm | Monthly | First Monday of month |
| SNOMED-CT | Bi-annual | January 31, July 31 |
| LOINC | Bi-annual | June, December |
| PBS | Monthly | First of month |
| MBS | Quarterly | March, June, Sept, Dec |
| ICD-10-AM | Annual | July 1 |

**Recommendation:** Set calendar reminders for quarterly updates (PBS + MBS + LOINC + SNOMED)

---

## 8. Common Issues and Solutions

### Issue: UMLS Account Not Approved
**Solution:** Check spam folder for approval email, wait 48 hours, contact help@nlm.nih.gov

### Issue: RxNorm Files Too Large
**Solution:** Extract only needed files (RXNCONSO.RRF is main file), delete Full/ directory

### Issue: PBS XML Not Loading
**Solution:** Try alternative CSV format from PBS website, or contact PBS support

### Issue: MBS Data Format Changed
**Solution:** Australian government updates formats - check documentation, parse headers dynamically

### Issue: SNOMED Files Won't Extract
**Solution:** Use 7-Zip (Windows) or `unzip` command (Mac/Linux) for large files

---

## 9. Next Steps After Acquisition

Once all files downloaded:

1. **Verify file integrity** (run checksums if provided)
2. **Parse data** (see `PARSING-STRATEGY.md`)
3. **Generate embeddings** (see `EMBEDDING-GENERATION-PLAN.md`)
4. **Load into database** (see `DATABASE-POPULATION.md`)

---

## 10. Support and Resources

### Official Documentation
- **UMLS:** https://www.nlm.nih.gov/research/umls/
- **RxNorm:** https://www.nlm.nih.gov/research/umls/rxnorm/docs/
- **SNOMED:** https://confluence.ihtsdotools.org/display/DOCSTART
- **LOINC:** https://loinc.org/get-started/
- **PBS:** https://www.pbs.gov.au/info/industry/useful-resources
- **MBS:** http://www.mbsonline.gov.au/

### Contact Support
- **UMLS/RxNorm/LOINC:** help@nlm.nih.gov
- **SNOMED:** info@snomed.org
- **PBS:** pbs@health.gov.au
- **MBS:** mbsonline@health.gov.au
- **ICD-10-AM:** accd@accd.net.au

---

---

## 11. Database Table Destinations

After parsing and generating embeddings, each library goes to its designated table:

### Universal Medical Codes Table

**Population command:**
```bash
npx tsx populate-codes.ts --table=universal --code-system=snomed_core
npx tsx populate-codes.ts --table=universal --code-system=loinc
npx tsx populate-codes.ts --table=universal --code-system=rxnorm
```

**Libraries:**
- SNOMED CT CORE subset → `universal_medical_codes` (code_system='snomed_ct_core')
- LOINC → `universal_medical_codes` (code_system='loinc')
- RxNorm → `universal_medical_codes` (code_system='rxnorm')

**Indexing:**
- All libraries get full HNSW vector indexes
- Target query performance: 5-50ms per entity

### Regional Medical Codes Table

**Population command:**
```bash
npx tsx populate-codes.ts --table=regional --code-system=snomed_au
npx tsx populate-codes.ts --table=regional --code-system=pbs
```

**Libraries:**
- SNOMED CT AU edition → `regional_medical_codes` (code_system='snomed_ct_au')
- PBS → `regional_medical_codes` (code_system='pbs')

**Indexing:**
- PBS: Full HNSW vector index
- SNOMED AU: Lexical indexes only (no vector, used for rare disease fallback)

---

**Last Updated:** 2025-11-22
**Status:** Updated for universal vs regional two-table architecture
**Estimated Time:** 2-4 hours for registration + downloads
**Reference:** See MEDICAL-CODE-LIBRARY-STRATEGY-AUDIT.md for strategic rationale

