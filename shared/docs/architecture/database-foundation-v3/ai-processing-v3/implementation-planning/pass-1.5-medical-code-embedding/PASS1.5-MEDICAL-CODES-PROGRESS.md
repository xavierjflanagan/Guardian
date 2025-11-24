# Pass 1.5 Medical Code Migration Progress Tracker

**Last Updated:** 2025-11-24 15:35 AEDT

## Overview

Tracking the migration of medical code libraries to `universal_medical_codes` table for Pass 1.5 two-tier semantic search architecture.

**Architecture:** Two-tier search system
- **Tier 1:** Vector search on curated subsets (fast, 5-20ms)
- **Tier 2:** Lexical fallback on full datasets (slower, 200-500ms)

---

## Current Status Summary

| Code System | Records | Migration | Embeddings | HNSW Index | Status |
|-------------|---------|-----------|------------|------------|--------|
| LOINC | 102,891 | ✅ Complete | ✅ Complete | 🔄 In Progress | Active |
| SNOMED CORE | 6,820 | ✅ Complete | 🔄 In Progress | ⏳ Pending | Active |
| RxNorm | TBD | ⏳ Pending | ⏳ Pending | ⏳ Pending | Not Started |
| SNOMED Full | ~700k | ❌ Skip | ❌ Skip | ❌ Skip | Tier 2 Fallback |

---

## Detailed Progress

### 1. LOINC (Lab Tests & Observations)

**Purpose:** Universal lab test and observation codes for semantic medical record matching

#### Migration to universal_medical_codes
- ✅ **Status:** Complete
- ✅ **Records Migrated:** 102,891 codes
- ✅ **Date Completed:** 2025-11-23
- ✅ **Script:** `scripts/medical-codes/migrate-loinc-upsert.ts`
- ✅ **Source Table:** `regional_medical_codes` (country_code='AUS')
- ✅ **Target Table:** `universal_medical_codes` (code_system='loinc')
- ✅ **Verification:** All records confirmed in database

#### Embedding Generation
- ✅ **Status:** Complete
- ✅ **Records Embedded:** 102,891 codes
- ✅ **Model:** OpenAI text-embedding-3-small (1536 dimensions)
- ✅ **Date Completed:** 2025-11-23
- ✅ **Script:** `scripts/medical-codes/loinc/generate-loinc-embeddings.ts`
- ✅ **Cost:** ~$0.04 USD
- ✅ **Time:** ~90 minutes
- ✅ **Text Source:** `display_name` (clean clinical terminology)

#### HNSW Index Creation
- 🔄 **Status:** In Progress (Started 2025-11-24 14:47 AEDT)
- 🔄 **Index Name:** `idx_universal_codes_loinc_embedding_hnsw`
- 🔄 **Index Type:** HNSW with vector_cosine_ops
- 🔄 **Parameters:** Default (m=16, ef_construction=64)
- 🔄 **Script:** `scripts/medical-codes/create-index-single-session.sh`
- 🔄 **Connection:** Session Pooler (IPv4) - `aws-0-ap-southeast-1.pooler.supabase.com:5432`
- 🔄 **Process IDs:** 58441, 58369
- 🔄 **Estimated Time:** 3-5 minutes (taking longer due to memory constraints)
- 🔄 **Notice:** "hnsw graph no longer fits into maintenance_work_mem after 9218 tuples"
- ⏳ **Next:** Monitor completion, verify index size and performance

---

### 2. SNOMED CT CORE Subset (Common Conditions)

**Purpose:** Tier 1 vector search on 6,820 most common medical condition codes (96% clinical coverage)

#### Migration to universal_medical_codes
- ✅ **Status:** Complete
- ✅ **Records Migrated:** 6,820 codes
- ✅ **Date Completed:** 2025-11-24 15:15 AEDT
- ✅ **Script:** `scripts/medical-codes/migrate-snomed-core.ts`
- ✅ **Source File:** `data/medical-codes/snomed/core-subset/SNOMEDCT_CORE_SUBSET_202506.txt`
- ✅ **Target Table:** `universal_medical_codes` (code_system='snomed')
- ✅ **Active Codes:** 6,183 current
- ✅ **Retired Codes:** 637 retired
- ✅ **UMLS Mapping:** 100% (all 6,820 codes)
- ✅ **Verification:** Confirmed via SQL query

#### Embedding Generation
- 🔄 **Status:** In Progress (Started 2025-11-24 15:33 AEDT)
- 🔄 **Records to Embed:** 6,820 codes
- 🔄 **Model:** OpenAI text-embedding-3-small (1536 dimensions)
- 🔄 **Script:** `scripts/medical-codes/generate-snomed-embeddings.ts`
- 🔄 **Progress:** Fetching codes (5000/6820)
- 🔄 **Estimated Cost:** ~$0.01 USD
- 🔄 **Estimated Time:** 5-10 minutes
- 🔄 **Batch Size:** 100 codes per batch
- 🔄 **Text Source:** `display_name` (SNOMED Fully Specified Names)
- ⏳ **Next:** Monitor completion, verify embeddings

#### HNSW Index Creation
- ⏳ **Status:** Pending (waiting for embeddings)
- ⏳ **Index Name:** `idx_universal_codes_snomed_embedding_hnsw` (TBD)
- ⏳ **Estimated Time:** 30 seconds - 2 minutes (small dataset)
- ⏳ **Next:** Create index after embedding generation completes

---

### 3. RxNorm (Medications)

**Purpose:** Universal medication codes for drug identification and matching

#### Status
- ⏳ **Migration:** Not started
- ⏳ **Embeddings:** Not started
- ⏳ **Index:** Not started

#### Raw Data Available
- 📁 **Directory:** `data/medical-codes/rxnorm/raw/`
- ❓ **File Count:** Unknown (gitignored)
- ❓ **Record Count:** Unknown
- ⏳ **Next:** Assess dataset size and structure

#### Considerations
- RxNorm may require special handling (ingredients vs. branded medications)
- Check if existing LOINC embedding script patterns apply
- Verify if RxNorm should use hybrid search (OpenAI + SapBERT)

---

### 4. SNOMED CT International Full (700k+ Codes)

**Purpose:** Tier 2 lexical search fallback for rare conditions

#### Status
- ❌ **Migration to universal_medical_codes:** Not planned
- ❌ **Embeddings:** Not planned (too expensive)
- ❌ **Vector Index:** Not planned

#### Architecture Decision
- Full SNOMED (~700k codes) will use **lexical search only** (Tier 2)
- SNOMED CORE subset (~6,820 codes) provides 96% coverage via vector search (Tier 1)
- Rare conditions fall back to slower but comprehensive lexical search

---

## Database Schema

### universal_medical_codes Table Structure

```sql
CREATE TABLE universal_medical_codes (
    id UUID PRIMARY KEY,

    -- Code identification
    code_system VARCHAR(20) CHECK (code_system IN ('rxnorm', 'snomed', 'loinc')),
    code_value VARCHAR(50) NOT NULL,
    display_name TEXT NOT NULL,

    -- Vector embedding (1536 dimensions)
    embedding VECTOR(1536),

    -- Classification
    entity_type VARCHAR(20) CHECK (entity_type IN (
        'medication', 'condition', 'procedure', 'observation',
        'allergy', 'lab_result', 'vital_sign', 'physical_finding'
    )),
    search_text TEXT NOT NULL,
    synonyms TEXT[],

    -- Versioning
    library_version VARCHAR(20) DEFAULT 'v1.0',
    valid_from DATE DEFAULT CURRENT_DATE,
    valid_to DATE,
    superseded_by UUID REFERENCES universal_medical_codes(id),

    -- Metadata
    usage_frequency INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Embedding tracking (Migration 28)
    embedding_batch_id UUID REFERENCES embedding_batches(id),
    clinical_specificity VARCHAR(20),
    typical_setting VARCHAR(30),

    -- Normalized embeddings (Migration 30)
    normalized_embedding_text TEXT,
    normalized_embedding VECTOR(1536),

    -- Embedding flexibility (Migration 60)
    authority_required BOOLEAN DEFAULT FALSE,
    sapbert_embedding VECTOR(768),
    sapbert_embedding_generated_at TIMESTAMPTZ,
    active_embedding_model VARCHAR(20) DEFAULT 'openai',

    UNIQUE(code_system, code_value)
);
```

---

## Key Scripts

### Migration Scripts
- `scripts/medical-codes/migrate-loinc-upsert.ts` - LOINC migration ✅
- `scripts/medical-codes/migrate-snomed-core.ts` - SNOMED CORE migration ✅
- `scripts/medical-codes/migrate-rxnorm.ts` - RxNorm migration ⏳

### Embedding Generation Scripts
- `scripts/medical-codes/loinc/generate-loinc-embeddings.ts` - LOINC embeddings ✅
- `scripts/medical-codes/generate-snomed-embeddings.ts` - SNOMED CORE embeddings 🔄
- `scripts/medical-codes/generate-rxnorm-embeddings.ts` - RxNorm embeddings ⏳

### Index Creation Scripts
- `scripts/medical-codes/create-index-single-session.sh` - LOINC HNSW index 🔄
- Shell script for SNOMED CORE index ⏳
- Shell script for RxNorm index ⏳

### Verification Scripts
- `scripts/medical-codes/verify-loinc-final.ts` - LOINC verification ✅

---

## Connection Issues Resolved

### IPv6 Requirement (2025-11-24)
- **Issue:** Supabase direct connections require IPv6 since January 2024
- **Error:** `could not translate host name "db.napoydbbuvbpyciwjdci.supabase.co"`
- **Solution:** Use Session Pooler instead (IPv4 compatible)
  - Direct: `db.napoydbbuvbpyciwjdci.supabase.co:5432` ❌
  - Session Pooler: `aws-0-ap-southeast-1.pooler.supabase.com:5432` ✅

### Password Special Characters
- **Issue:** Password with `!` character causing escaping issues
- **Solution:** User reset password, use .pgpass file format

---

## Environment Variables Required

```bash
# Supabase
SUPABASE_URL=https://napoydbbuvbpyciwjdci.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Database (for direct psql connections)
PGHOST=aws-0-ap-southeast-1.pooler.supabase.com
PGPORT=5432
PGDATABASE=postgres
PGUSER=postgres.napoydbbuvbpyciwjdci
PGPASSWORD=<your-password>
```

---

## Cost Tracking

| Task | Tokens | Cost (USD) | Status |
|------|--------|------------|--------|
| LOINC embeddings (102,891) | ~2M | $0.04 | ✅ Complete |
| SNOMED CORE embeddings (6,820) | ~50K | $0.01 | 🔄 In Progress |
| RxNorm embeddings (TBD) | TBD | TBD | ⏳ Pending |
| **Total Estimated** | ~2.05M | **$0.05** | - |

OpenAI Pricing: $0.02 per 1M tokens (text-embedding-3-small)

---

## Next Steps

### Immediate (In Progress)
1. 🔄 Monitor LOINC HNSW index creation completion
2. 🔄 Monitor SNOMED CORE embedding generation completion
3. ⏳ Create HNSW index for SNOMED CORE (~2 minutes)

### Short Term (Today)
4. ⏳ Verify LOINC index performance via test queries
5. ⏳ Verify SNOMED CORE embeddings and index
6. ⏳ Assess RxNorm dataset size and structure
7. ⏳ Create RxNorm migration script (if needed)

### Medium Term (This Week)
8. ⏳ RxNorm migration to universal_medical_codes
9. ⏳ RxNorm embedding generation
10. ⏳ RxNorm HNSW index creation
11. ⏳ Test two-tier search architecture end-to-end
12. ⏳ Document search API patterns

### Optional (Future)
- Consider 8x compute upgrade if index creation times are problematic
- Implement normalized embeddings for improved search accuracy
- Add SapBERT embeddings for medication-specific hybrid search
- Clean up LOINC from regional_medical_codes (if no longer needed)

---

## Background Processes

### Currently Running

**Process 1: LOINC HNSW Index**
- Command: `./scripts/medical-codes/create-index-single-session.sh`
- PIDs: 58441, 58369
- Started: 2025-11-24 14:47 AEDT
- Elapsed: ~48 minutes
- Status: Still building (slower than expected)

**Process 2: SNOMED CORE Embeddings**
- Command: `npx tsx scripts/medical-codes/generate-snomed-embeddings.ts`
- Bash ID: ba31d9
- Started: 2025-11-24 15:33 AEDT
- Elapsed: ~2 minutes
- Progress: Fetching codes (5000/6820)
- Status: Running smoothly

---

## Troubleshooting Notes

### HNSW Index Taking Longer Than Expected
- **Notice:** "hnsw graph no longer fits into maintenance_work_mem"
- **Cause:** Default PostgreSQL memory settings insufficient for 102,891 vectors
- **Impact:** Index still being created, just slower
- **Options:**
  1. Wait for current process to complete
  2. Temporarily upgrade to 8x compute (user mentioned this option)
  3. Increase `maintenance_work_mem` setting

### Schema Field Names
- **Correct:** `code_value` (not `code`)
- **Correct:** `code_system,code_value` for conflict resolution
- **Entity Type:** Required field in universal_medical_codes

---

## Session Continuity

**If this session crashes:**
1. Check this file for current progress
2. Verify database state with SQL queries:
   ```sql
   SELECT code_system, COUNT(*) FROM universal_medical_codes GROUP BY code_system;
   SELECT code_system, COUNT(*) FROM universal_medical_codes WHERE embedding IS NOT NULL GROUP BY code_system;
   ```
3. Check for running background processes:
   ```bash
   ps aux | grep "create-index\|generate.*embeddings"
   ```
4. Resume from last incomplete task in "Next Steps" section

---

**Generated by:** Claude Code
**Session:** Pass 1.5 Medical Code Migration
**Date Range:** 2025-11-23 to 2025-11-24
