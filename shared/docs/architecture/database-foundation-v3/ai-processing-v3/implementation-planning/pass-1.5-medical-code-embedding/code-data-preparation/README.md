# Pass 1.5 Medical Code Data Preparation

**Purpose:** Complete workflow for acquiring, parsing, embedding, and loading medical code libraries into Supabase

**Status:** Phase 2 - Data Acquisition and Preparation (In Progress)

**Created:** 2025-10-15

---

## Overview

This directory contains all documentation and scripts for Phase 2 of the Pass 1.5 Medical Code Embedding System implementation.

### Phase 2 Goals
1. Acquire 6 medical code libraries (~228,000 codes)
2. Parse raw data into standardized JSON format
3. Generate OpenAI embeddings for all codes
4. Populate Supabase database tables

---

## Workflow Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PASS 1.5 DATA PREPARATION WORKFLOW                │
└─────────────────────────────────────────────────────────────────────┘

Step 1: DATA ACQUISITION (User Action)
├── Register for UMLS account (RxNorm, SNOMED, LOINC)
├── Download PBS data (Australian government)
├── Download MBS data (Australian government)
└── Download ICD-10-AM (paid license, optional)
    │
    ├─> See: DATA-ACQUISITION-GUIDE.md
    └─> Output: Raw files in data/medical-codes/<system>/raw/

Step 2: PARSING (Not Yet Implemented)
├── Parse RxNorm RRF files → JSON
├── Parse SNOMED-CT RF2 files → JSON
├── Parse LOINC CSV → JSON
├── Parse PBS XML → JSON
├── Parse MBS CSV → JSON
└── Parse ICD-10-AM CSV → JSON
    │
    ├─> See: PARSING-STRATEGY.md
    └─> Output: Standardized JSON in data/medical-codes/<system>/processed/

Step 3: EMBEDDING GENERATION (Script Ready)
├── Load parsed JSON files
├── Call OpenAI text-embedding-3-small API
├── Generate 1536-dimensional vectors
└── Save embeddings back to JSON files
    │
    ├─> Script: generate-embeddings.ts
    ├─> Guide: EMBEDDING-GENERATION-GUIDE.md
    └─> Cost: ~$0.05 for all 228K codes

Step 4: DATABASE POPULATION (Script Ready)
├── Load embedded JSON files
├── Insert into universal_medical_codes table (RxNorm, SNOMED, LOINC)
├── Insert into regional_medical_codes table (PBS, MBS, ICD-10-AM)
└── Verify vector indexes active
    │
    ├─> Script: populate-database.ts
    ├─> Guide: DATABASE-POPULATION-GUIDE.md
    └─> Time: ~5-15 minutes
```

---

## Files in This Directory

### Documentation
1. **README.md** (this file) - Overview and workflow summary
2. **DATA-ACQUISITION-GUIDE.md** - Step-by-step instructions for downloading medical code libraries
3. **PARSING-STRATEGY.md** - Parsing logic for each code system format
4. **EMBEDDING-GENERATION-GUIDE.md** - Instructions for generating OpenAI embeddings
5. **DATABASE-POPULATION-GUIDE.md** - Instructions for loading codes into Supabase

### Scripts
1. **generate-embeddings.ts** - TypeScript script for embedding generation
2. **populate-database.ts** - TypeScript script for database population

### Future Files (Not Yet Created)
- **parse-rxnorm.ts** - RxNorm RRF parser
- **parse-snomed.ts** - SNOMED-CT RF2 parser
- **parse-loinc.ts** - LOINC CSV parser
- **parse-pbs.ts** - PBS XML parser
- **parse-mbs.ts** - MBS CSV parser
- **parse-icd10am.ts** - ICD-10-AM CSV parser

---

## Quick Start Guide

### Prerequisites
- Node.js 18+ and pnpm installed
- OpenAI API key
- Supabase service role key
- Medical code library files downloaded

### Step 1: Data Acquisition (User Task)
```bash
# Follow instructions in DATA-ACQUISITION-GUIDE.md
# Register for UMLS account
# Download RxNorm, SNOMED-CT, LOINC
# Download PBS and MBS from Australian government
# (Optional) Acquire ICD-10-AM license
```

### Step 2: Parsing (Not Yet Implemented)
```bash
# TODO: Implement parser scripts based on PARSING-STRATEGY.md
# npx tsx parse-rxnorm.ts
# npx tsx parse-snomed.ts
# npx tsx parse-loinc.ts
# npx tsx parse-pbs.ts
# npx tsx parse-mbs.ts
# npx tsx parse-icd10am.ts
```

### Step 3: Embedding Generation
```bash
# Set OpenAI API key
export OPENAI_API_KEY="sk-..."

# Generate embeddings for all code systems
npx tsx generate-embeddings.ts --code-system=all

# Or generate for specific code system
npx tsx generate-embeddings.ts --code-system=rxnorm
```

### Step 4: Database Population
```bash
# Set Supabase credentials
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Dry run first (recommended)
npx tsx populate-database.ts --code-system=all --dry-run

# Populate database
npx tsx populate-database.ts --code-system=all
```

---

## Data Flow

### Input: Raw Medical Code Libraries
```
data/medical-codes/
├── rxnorm/raw/
│   ├── RXNCONSO.RRF              # ~500 MB
│   └── RXNSAT.RRF
├── snomed/raw/
│   ├── sct2_Concept_Snapshot_INT.txt    # ~1 GB
│   └── sct2_Description_Snapshot_INT.txt
├── loinc/raw/
│   └── Loinc.csv                 # ~100 MB
├── pbs/raw/
│   └── pbs-xml-YYYY-MM.zip       # ~10 MB
├── mbs/raw/
│   └── MBS_Items_YYYYMMDD.xlsx   # ~5 MB
└── icd10am/raw/
    └── ICD-10-AM-Tabular-List.xlsx  # ~50 MB (optional)
```

### Intermediate: Parsed JSON Files
```
data/medical-codes/
├── rxnorm/processed/
│   └── rxnorm_codes.json         # ~5 MB, 50,000 records
├── snomed/processed/
│   └── snomed_codes.json         # ~10 MB, 100,000 records
├── loinc/processed/
│   └── loinc_codes.json          # ~5 MB, 50,000 records
├── pbs/processed/
│   └── pbs_codes.json            # ~300 KB, 3,000 records
├── mbs/processed/
│   └── mbs_codes.json            # ~500 KB, 5,000 records
└── icd10am/processed/
    └── icd10am_codes.json        # ~2 MB, 20,000 records
```

**JSON Structure (Standardized):**
```json
[
  {
    "code_system": "rxnorm",
    "code_value": "205923",
    "display_name": "Atorvastatin 20 MG Oral Tablet",
    "entity_type": "medication",
    "search_text": "Atorvastatin 20 MG Oral Tablet",
    "library_version": "v2025Q1",
    "country_code": null,
    "region_specific_data": {}
  },
  ...
]
```

### Intermediate: Embedded JSON Files
Same files as above, but with `embedding` field added:

```json
[
  {
    "code_system": "rxnorm",
    "code_value": "205923",
    "display_name": "Atorvastatin 20 MG Oral Tablet",
    "entity_type": "medication",
    "search_text": "Atorvastatin 20 MG Oral Tablet",
    "library_version": "v2025Q1",
    "country_code": null,
    "region_specific_data": {},
    "embedding": [0.0234, -0.0456, 0.0123, ...] // 1536 numbers
  },
  ...
]
```

### Output: Supabase Database Tables

**universal_medical_codes** (RxNorm, SNOMED, LOINC):
```sql
SELECT code_system, COUNT(*) FROM universal_medical_codes GROUP BY code_system;
-- rxnorm  | 50,000
-- snomed  | 100,000
-- loinc   | 50,000
```

**regional_medical_codes** (PBS, MBS, ICD-10-AM):
```sql
SELECT code_system, country_code, COUNT(*) FROM regional_medical_codes GROUP BY code_system, country_code;
-- pbs       | AUS | 3,000
-- mbs       | AUS | 5,000
-- icd10_am  | AUS | 20,000
```

---

## Cost Estimates

### OpenAI Embedding Generation
- **Model:** text-embedding-3-small
- **Rate:** $0.02 per 1M tokens
- **Estimated tokens:** ~2.2M (for all 228K codes)
- **Estimated cost:** ~$0.05 USD

### Supabase Database Storage
- **Embeddings:** ~300 MB (228K codes × 1536 dimensions × 4 bytes)
- **Metadata:** ~50 MB (JSON, text fields)
- **Total storage:** ~350 MB
- **Cost:** Free tier includes 500 MB

---

## Time Estimates

| Step | Time |
|------|------|
| Data Acquisition (user) | 2-4 hours (registration + downloads) |
| Parsing (not yet implemented) | 1-2 hours (once scripts written) |
| Embedding Generation | 15-30 minutes (API calls) |
| Database Population | 5-15 minutes (batch inserts) |
| **Total** | **4-7 hours** |

---

## Current Status

### Completed ✅
- [X] Data acquisition guide written
- [X] Parsing strategy documented
- [X] Embedding generation script written
- [X] Embedding generation guide written
- [X] Database population script written
- [X] Database population guide written
- [X] Directory structure created (all 6 code systems)
- [X] PBS data downloaded and organized (32 CSV files, primary: items.csv 7.6 MB)
- [X] MBS data downloaded and saved (MBS-XML-20251101.XML, 7.8 MB)
- [X] UMLS account registration submitted

### In Progress ⏳
- [⏳] UMLS account approval (1-2 business days expected)
- [ ] User will download RxNorm, SNOMED, LOINC after UMLS approval

### Not Started ⏸️
- [ ] Parser script implementation (6 parsers needed - can start PBS/MBS immediately)
- [ ] Embedding generation execution (requires parsed data)
- [ ] Database population execution (requires embedded data)
- [ ] Vector search testing and validation

### Ready to Start
- **PBS parser** - Data available in `data/medical-codes/pbs/raw/2025-10-01-PBS-API-CSV-files/tables_as_csv/`
- **MBS parser** - Data available in `data/medical-codes/mbs/raw/MBS-XML-20251101.XML`

---

## Next Steps

### For User (Data Acquisition)
1. Register for UMLS account at https://uts.nlm.nih.gov/uts/signup-login
2. Download RxNorm, SNOMED-CT, LOINC after approval
3. Download PBS from https://www.pbs.gov.au/
4. Download MBS from http://www.mbsonline.gov.au/
5. (Optional) Research ICD-10-AM licensing

### For Development Team (Parser Implementation)
1. Implement 6 parser scripts based on PARSING-STRATEGY.md
2. Test parsers with sample data
3. Run parsers on full datasets
4. Validate standardized JSON output

### For Both (Embedding + Population)
1. Run embedding generation script (15-30 minutes)
2. Verify embeddings generated correctly
3. Run database population script (5-15 minutes)
4. Validate data loaded into Supabase
5. Test vector similarity search

---

## Troubleshooting

### Common Issues

**Problem: UMLS account not approved**
- Solution: Check spam folder, wait 48 hours, contact help@nlm.nih.gov

**Problem: PBS/MBS data format changed**
- Solution: Check official documentation, parse headers dynamically

**Problem: OpenAI rate limits**
- Solution: Script has automatic retry with exponential backoff

**Problem: Supabase timeout errors**
- Solution: Reduce batch size in populate-database.ts

**Problem: Duplicate codes on re-run**
- Solution: Duplicates are automatically skipped (by design)

---

## Support and Resources

### Official Documentation
- **UMLS:** https://www.nlm.nih.gov/research/umls/
- **OpenAI Embeddings:** https://platform.openai.com/docs/guides/embeddings
- **Supabase pgvector:** https://supabase.com/docs/guides/ai/vector-embeddings

### Contact Support
- **UMLS:** help@nlm.nih.gov
- **PBS:** pbs@health.gov.au
- **MBS:** mbsonline@health.gov.au
- **OpenAI:** https://help.openai.com
- **Supabase:** https://supabase.com/support

---

## Related Documentation

### Pass 1.5 Implementation Plan
- **Main Plan:** `../PASS-1.5-IMPLEMENTATION-PLAN.md`
- **Phase 1 (Complete):** Database setup and migration
- **Phase 2 (In Progress):** Data acquisition and preparation
- **Phase 3 (Pending):** Runtime integration

### Database Schema
- **03_clinical_core.sql** - Medical code table definitions
- **04_ai_processing.sql** - pass15_code_candidates audit table
- **Migration 26** - Pass 1.5 versioning and RPC functions

---

**Last Updated:** 2025-10-15
**Status:** Phase 2 in progress - User acquiring data
**Next Milestone:** Complete data acquisition, implement parsers
