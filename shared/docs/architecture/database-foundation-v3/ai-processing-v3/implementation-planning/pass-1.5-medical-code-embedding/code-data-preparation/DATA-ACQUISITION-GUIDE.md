# Pass 1.5 Medical Code Data Acquisition Guide

**Purpose:** Step-by-step instructions for acquiring all medical code libraries

**Status:** Active - Phase 2 in progress

**Created:** 2025-10-15

---

## Overview

This guide covers acquiring 6 medical code libraries totaling ~228,000 codes:

**Universal Codes (Free):**
- RxNorm: ~50,000 medication codes
- SNOMED-CT: ~100,000 clinical terms
- LOINC: ~50,000 lab/observation codes

**Regional Codes - Australia:**
- PBS: ~3,000 subsidized medication codes
- MBS: ~5,000 Medicare service codes
- ICD-10-AM: ~20,000 diagnosis codes (paid license)

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

**Step 3: Download SNOMED-CT**
1. In UTS, navigate to: Downloads > SNOMED CT
2. Select: "SNOMED CT International Edition"
3. Download format: **RF2 (Release Format 2)**
4. Expected file: `SnomedCT_InternationalRF2_PRODUCTION_YYYYMMDD.zip` (~1 GB)
5. Extract to: `data/medical-codes/snomed/`

**Key Files in SNOMED:**
```
SnomedCT_InternationalRF2/
├── Snapshot/
│   ├── Terminology/
│   │   ├── sct2_Concept_Snapshot_INT_YYYYMMDD.txt      # All concepts
│   │   ├── sct2_Description_Snapshot_INT_YYYYMMDD.txt  # Human-readable names
│   │   └── sct2_Relationship_Snapshot_INT_YYYYMMDD.txt # Hierarchies
│   └── Refset/
└── Full/  # Historical versions (skip for now)
```

**Step 4: Download LOINC**
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

**Last Updated:** 2025-10-15
**Status:** Ready for data acquisition
**Estimated Time:** 2-4 hours for registration + downloads

