# Pass 1.5 Medical Code Data Preparation

**Current Strategy:** CORE Subset Two-Tier Architecture (see ARCHITECTURAL-REVIEW-2025.md)

**Status:** Strategy pivot in progress - transitioning to CORE subset approach

**Created:** 2025-10-15
**Last Major Update:** 2025-11-07 (CORE subset pivot)

---

## Overview

This directory contains documentation for Pass 1.5 Medical Code Embedding System data preparation.

**IMPORTANT:** We are transitioning from the full-dataset approach (706k SNOMED codes) to a **CORE subset two-tier architecture** (~10-15k curated codes).

### Current Strategy (November 2025)

See **ARCHITECTURAL-REVIEW-2025.md** for the complete strategy document.

**Key Concept:** Two-tier architecture
1. **CORE Codes (~10-15k):** Curated subset of most clinically relevant codes with high-performance vector search
2. **Fallback Codes (remaining ~700k):** Exact-match lookup without vector embeddings

**Benefits:**
- 98% reduction in vector index size
- Instant index builds (<1 second vs 8+ hours)
- Maintain comprehensive code coverage through exact-match fallback
- Focus AI processing quality on most common clinical scenarios

### Previous Approach (Archived)

The full-dataset approach documentation has been moved to `archive/v1-full-dataset/`. This includes:
- DATABASE-POPULATION-GUIDE.md
- EMBEDDING-GENERATION-GUIDE.md
- LOINC-POPULATION-STEPS.md

Vector index experiments have been moved to `archive/v1-entity-specific-indexes/`.

---

## Files in This Directory

### Current Strategy Documentation
1. **README.md** (this file) - Overview and directory index
2. **ARCHITECTURAL-REVIEW-2025.md** - PRIMARY STRATEGY DOCUMENT (CORE subset two-tier architecture)
3. **DATA-ACQUISITION-GUIDE.md** - How to download medical code datasets
4. **PARSING-STRATEGY.md** - Code parsing logic and standardized JSON format
5. **medical-code-sources.md** - Official source references for medical code libraries

### Archived Documentation
- **archive/v1-full-dataset/** - Full 706k code approach documentation (superseded)
- **archive/v1-entity-specific-indexes/** - Vector index experiments (superseded)

### Related Scripts
Scripts are located in `/scripts/medical-codes/` (see Phase 2 for scripts reorganization):
- **SNOMED parsing:** parse-snomed.ts, populate-snomed-no-embeddings.ts, generate-snomed-embeddings.ts
- **LOINC parsing:** parse-loinc.ts, populate-loinc-no-embeddings.ts, generate-loinc-embeddings.ts

---

## Implementation Status

### CORE Subset Approach (Current)
- [ ] Identify clinically relevant CORE subset from SNOMED CT (~10-15k codes)
- [ ] Create CORE vs Fallback classification logic
- [ ] Generate embeddings for CORE subset only
- [ ] Implement two-tier search strategy in Pass 1.5 runtime
- [ ] Validate coverage with real patient documents

### Data Available (From Previous Work)
- Full SNOMED CT dataset parsed (706,823 codes) - stored in database
- Full LOINC dataset parsed (102,891 codes) - stored in database
- Parsing scripts operational for both datasets

See `archive/v1-full-dataset/` for historical full-dataset population documentation.

---

## Next Steps

1. **Read ARCHITECTURAL-REVIEW-2025.md** - Understand the CORE subset strategy
2. **Define CORE subset criteria** - Clinical relevance, frequency, entity types
3. **Extract CORE subset** - Filter existing SNOMED data to CORE codes
4. **Generate embeddings** - Only for CORE subset (~10-15k codes)
5. **Implement two-tier search** - Vector search CORE, exact match fallback

---

## Data Locations

### Raw Data
- SNOMED CT: `data/medical-codes/snomed/raw/`
- LOINC: `data/medical-codes/loinc/raw/`
- PBS: `data/medical-codes/pbs/raw/`

### Processed Data
- SNOMED CT: `data/medical-codes/snomed/processed/`
- LOINC: `data/medical-codes/loinc/processed/`
- PBS: `data/medical-codes/pbs/processed/`

### Database Tables
- SNOMED codes: `universal_medical_codes` (code_system='snomed')
- LOINC codes: `universal_medical_codes` (code_system='loinc')
- Current embeddings: Only LOINC has embeddings (from previous work)

---

**Last Updated:** 2025-11-07
**Status:** Strategy pivot to CORE subset two-tier architecture
**Next Milestone:** Define and extract CORE subset from existing SNOMED data
