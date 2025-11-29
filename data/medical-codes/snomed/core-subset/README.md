# SNOMED CT CORE Subset

**Purpose:** NLM's curated subset of most commonly used SNOMED CT codes

**Source:** https://www.nlm.nih.gov/research/umls/Snomed/core_subset.html

**Status:** UMLS license pending (applied 2025-11-08, approval within 3 business days)

---

## What Goes Here

**Expected file from NLM:**
- Filename: `SNOMEDCT_CORE_SUBSET_<YYYYMM>.txt`
- Size: ~500 KB
- Format: Tab-delimited text file
- Codes: ~5,182 SNOMED CT concepts

**File Structure (10 columns):**
```
SNOMED_CID                  - SNOMED CT Concept ID (the code)
SNOMED_FSN                  - Fully Specified Name
SNOMED_CONCEPT_STATUS       - Active/Inactive
UMLS_CUI                    - UMLS Concept Unique Identifier
OCCURRENCE                  - Number of institutions (1-8) using this code
USAGE                       - Average usage percentage
FIRST_IN_SUBSET            - Date code was added to CORE
IS_RETIRED_FROM_SUBSET     - Retirement flag
LAST_IN_SUBSET             - Last version containing this code
REPLACED_BY_SNOMED_CID     - Replacement code if retired
```

**Generated files (by parser):**
- `core_mapping.json` - Parsed CORE subset data
- `core_stats.json` - Statistics about CORE subset
- `au_crossref.json` - Cross-reference with Australian edition

---

## Download Instructions

**When UMLS license is approved:**

1. Go to: https://www.nlm.nih.gov/research/umls/Snomed/core_subset.html
2. Sign in with UMLS credentials
3. Download latest CORE subset file
4. Place file in this directory
5. Run parser: `npx tsx scripts/medical-codes/snomed/parse-core-subset.ts`

**Expected timeline:**
- UMLS approval: 3 business days from 2025-11-08
- Download: 5 minutes
- Parse: 1-2 minutes

---

## What This Enables

The CORE subset is used for the **two-tier Pass 1.5 architecture:**

**Tier 1 (CORE):** Vector search on 5,182 validated codes
- Fast queries (5-20ms)
- High precision for common conditions
- 96% storage reduction vs full dataset

**Tier 2 (Fallback):** Lexical search on remaining 701k codes
- Slower queries (200-500ms)
- Captures rare diseases
- No vector index needed

See `CORE-SUBSET-PIVOT-IMPLEMENTATION-PLAN.md` for complete strategy.
