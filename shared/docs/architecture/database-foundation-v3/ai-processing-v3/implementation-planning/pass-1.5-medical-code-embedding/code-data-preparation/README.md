# Pass 1.5 Medical Code Data Preparation

**Status:** Updated for universal vs regional two-table architecture (2025-11-22)

**Created:** 2025-10-15
**Last Major Update:** 2025-11-22 (Consolidated documentation, universal vs regional strategy)

---

## Overview

This directory contains documentation for Pass 1.5 Medical Code Embedding System data preparation using a two-table architecture.

## Strategic Documents (Start Here)

### 1. MEDICAL-CODE-LIBRARY-STRATEGY-AUDIT.md (PRIMARY STRATEGY)
**Purpose:** Complete strategic analysis of universal vs regional code library architecture

**Key Decisions:**
- SNOMED CORE subset (6,820 codes) in `universal_medical_codes` for primary matching
- SNOMED AU edition (706k codes) in `regional_medical_codes` for rare disease fallback
- LOINC needs migration from regional to universal table
- RxNorm + PBS dual-tier approach for medications

**When to read:** Before implementing any code library work

### 2. medical-code-sources.md
**Purpose:** Classification of medical code libraries (universal vs regional)

**Contents:**
- Universal libraries: SNOMED CORE, LOINC, RxNorm
- Regional libraries: SNOMED AU, PBS
- Brand name handling strategies
- Update schedules

**When to read:** When deciding which library to use for a specific entity type

### 3. DATA-ACQUISITION-GUIDE.md
**Purpose:** Step-by-step download instructions for all medical code libraries

**Contents:**
- UMLS account setup
- SNOMED CORE subset download (PRIORITY)
- SNOMED International/AU edition downloads
- RxNorm, LOINC, PBS download instructions
- Table destination mappings

**When to read:** When acquiring new medical code data

### 4. PARSING-STRATEGY.md
**Purpose:** Parser implementation specifications for all code libraries

**Contents:**
- Library-agnostic standardized JSON schema
- Parser specs for SNOMED CORE, SNOMED AU, RxNorm, LOINC, PBS
- Table destination routing
- Brand name preservation logic

**When to read:** When implementing parser scripts

---

## Current Architecture

### Two-Table System

**universal_medical_codes:**
- Purpose: Globally recognized medical code standards
- Libraries: SNOMED CORE (6,820), LOINC (102,891), RxNorm (~50k)
- Indexing: Full HNSW vector indexes
- Performance: 5-50ms queries (primary matching, 90%+ coverage)

**regional_medical_codes:**
- Purpose: Country/region-specific medical codes
- Libraries: SNOMED AU (706,544), PBS (14,382)
- Indexing: Selective (PBS vector, SNOMED AU lexical)
- Performance: 10-500ms queries (fallback matching, rare diseases)

### Why AU Edition is Bigger Than International

SNOMED CT Australian edition (706,544 codes) is a **SUPERSET** of International edition (527,304 codes):
- Includes ALL 527k international concepts
- PLUS ~179k Australian-specific extensions
- Used for rare disease fallback in two-tier search

### Two-Tier Search Strategy

**Tier 1 (Universal):**
- Lab results → LOINC
- Medications → RxNorm
- Clinical terms → SNOMED CORE
- Fast queries (5-50ms)

**Tier 2 (Regional fallback):**
- Australian medications → PBS (for AU brands)
- Rare diseases → SNOMED AU (lexical search)
- Slower queries (10-500ms)

---

## Implementation Status

### Completed
- UMLS access acquired (2025-11-08)
- SNOMED CORE subset downloaded and parsed (6,820 codes, 100% match to AU edition)
- SNOMED AU edition in database (706,544 codes)
- LOINC in database (102,891 codes, needs migration to universal table)
- PBS in database (14,382 codes)
- RxNorm downloaded (not yet parsed)
- SNOMED International downloaded (not yet parsed, optional for reference)

### In Progress
- Strategy documentation updates
- Parser script updates for universal vs regional

### Not Started
- Migrate LOINC from regional_medical_codes to universal_medical_codes
- Parse and load SNOMED CORE to universal_medical_codes
- Parse and load RxNorm to universal_medical_codes
- Create indexes (universal: CORE + LOINC + RxNorm, regional: PBS vector + SNOMED AU lexical)
- Implement two-tier search in Pass 1.5 runtime

---

## Files in This Directory

### Active Documentation
- **README.md** (this file) - Directory overview and navigation
- **MEDICAL-CODE-LIBRARY-STRATEGY-AUDIT.md** - Strategic decisions (consolidates previous ARCHITECTURAL-REVIEW-2025.md)
- **medical-code-sources.md** - Universal vs regional library classification
- **DATA-ACQUISITION-GUIDE.md** - Download instructions
- **PARSING-STRATEGY.md** - Parser implementation specs

### Archive
- **archive/v1-full-dataset/** - Full 706k SNOMED approach (superseded by CORE subset)
- **archive/v1-entity-specific-indexes/** - Entity-specific vector indexes (superseded by unified approach)
- **archive/ARCHITECTURAL-REVIEW-2025.md** - Original CORE subset analysis (consolidated into STRATEGY-AUDIT)
- **archive/licenses/** - UMLS license agreement
- **archive/test-files/** - Test scripts and sample data

---

## Related Scripts

Scripts are located in `/scripts/medical-codes/`:

### SNOMED Scripts
- `parse-core-subset.ts` - Parse NLM CORE subset file
- `mark-core-codes.ts` - Mark CORE codes in database
- `parse-snomed.ts` - Parse SNOMED AU edition (already run)
- `generate-snomed-embeddings.ts` - Generate embeddings (needs --core-only flag)

### LOINC Scripts
- `parse-loinc.ts` - Parse LOINC CSV (already run)
- `populate-loinc-no-embeddings.ts` - Database population (already run)
- `generate-loinc-embeddings.ts` - Generate embeddings (already run)
- Migration script needed: Move LOINC from regional to universal table

### RxNorm Scripts (To be created)
- `parse-rxnorm.ts` - Parse RxNorm RRF files
- `generate-rxnorm-embeddings.ts` - Generate embeddings
- `populate-rxnorm.ts` - Populate universal_medical_codes

### PBS Scripts
- `parse-pbs.ts` - Parse PBS CSV (already run)
- Embeddings and indexing pending

---

## Next Steps (Priority Order)

1. **Migrate LOINC** from regional_medical_codes to universal_medical_codes
   - Copy data with table change
   - Verify embeddings preserved
   - Delete from regional table
   - Rebuild indexes

2. **Populate SNOMED CORE** to universal_medical_codes
   - Use core_mapping.json from parse-core-subset.ts output
   - Generate embeddings for 6,820 codes (~$0.01 cost, 5-10 minutes)
   - Create HNSW index (~20-30 MB, <1 minute build time)

3. **Parse and Populate RxNorm**
   - Implement parse-rxnorm.ts parser
   - Generate embeddings for ~50k codes (~$0.05 cost, 15-20 minutes)
   - Load to universal_medical_codes
   - Create HNSW index (~150 MB)

4. **Update SNOMED AU in regional table**
   - Rename code_system from 'snomed_ct' to 'snomed_ct_au'
   - Remove embeddings (not needed for lexical fallback)
   - Create trigram indexes for lexical search

5. **Generate PBS embeddings and indexes**
   - Generate embeddings for 14,382 codes (~$0.01 cost)
   - Create HNSW index (~50 MB, <1 minute)

6. **Implement two-tier search** in Pass 1.5 worker

---

## Success Metrics

**Storage Efficiency:**
- Universal table: ~710 MB (data + indexes)
- Regional table: ~684 MB (data + indexes)
- Total: ~1.4 GB (93% reduction vs full SNOMED indexing)
- No disk upgrade needed (stays within 18 GB tier)

**Performance:**
- Universal queries: <50ms per entity
- Regional fallback: <1000ms per entity
- CORE coverage: >90% of entities

**Cost:**
- No ongoing cost increase
- One-time embedding generation: ~$0.10 total
- Monthly savings: $21/year (no disk upgrade)

---

**Last Updated:** 2025-11-22
**Status:** Documentation consolidated and updated for two-table architecture
**Decision Owner:** Xavier Flanagan
**Next Milestone:** Migrate LOINC to universal table
