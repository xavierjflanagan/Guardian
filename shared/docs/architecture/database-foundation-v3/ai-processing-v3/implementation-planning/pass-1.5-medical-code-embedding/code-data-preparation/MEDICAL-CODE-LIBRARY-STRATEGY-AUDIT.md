# Medical Code Library Strategy Audit (2025-11-22)

**Created:** 2025-11-22
**Trigger:** UMLS access acquired - need to reevaluate universal vs regional strategy
**Decision Owner:** Xavier Flanagan
**Note:** This document consolidates and supersedes ARCHITECTURAL-REVIEW-2025.md (now archived)

---

## Executive Summary

**Problem:**
- Previously only had Australian code libraries → pragmatically used `regional_medical_codes` for everything
- Now have UMLS access → universal libraries (RxNorm, SNOMED International, LOINC, CORE subset) available
- Current state: 823,817 codes all in `regional_medical_codes`, including universal LOINC codes (wrong table)
- Need strategic decision: What goes in `universal_medical_codes` vs `regional_medical_codes`?

**Recommendation:**
- **Universal table:** SNOMED CORE subset (6,820), LOINC (102,891), RxNorm (~50k when parsed)
- **Regional table:** SNOMED AU edition (706,544 fallback), PBS (14,382), MBS (if needed)
- **Rationale:** Universal codes for primary matching, regional codes for Australian-specific clinical detail

---

## Current State (2025-11-22)

### Database Tables

**universal_medical_codes:**
```
Rows: 0 (empty, never populated)
Status: Ready to use
```

**regional_medical_codes:**
```
Total rows: 823,817
Breakdown:
  - snomed_ct: 706,544 (SNOMED AU edition - regional)
  - loinc:     102,891 (LOINC - WRONG, should be universal)
  - pbs:        14,382 (PBS - correct, regional)

Disk usage: 441 MB data
Embeddings: Only LOINC has embeddings (from previous work)
```

### Available Code Libraries (Post-UMLS Access)

**Universal (UMLS Libraries):**
- SNOMED CT International Edition: 527,304 concepts (downloaded, not parsed)
- SNOMED CT CORE subset: 6,820 codes (downloaded, parsed, 100% matched to AU edition)
- RxNorm: ~50k medication codes (downloaded, not parsed)
- LOINC: 102,891 codes (already have, but in wrong table)

**Regional (Australian Government):**
- SNOMED CT AU Edition: 706,544 codes (already in database)
  - Note: AU edition is SUPERSET of International (527k base + 179k AU extensions)
- PBS: 14,382 codes (already in database)
- MBS: Deleted (billing codes deemed not clinically useful)

---

## Strategic Analysis by Code System

### 1. SNOMED CT (Clinical Terms)

**Options:**

**Option A: CORE Subset Only (Recommended)**
- **Universal table:** SNOMED CORE subset (6,820 codes)
- **Regional table:** SNOMED AU edition (706,544 codes) as fallback
- **Rationale:**
  - CORE subset validated by 7 major healthcare institutions (NLM)
  - 96% storage reduction vs full dataset
  - Two-tier search: Fast CORE (5-20ms), Fallback AU (200-500ms)
  - CORE coverage expected 90%+ for common clinical scenarios
  - AU edition provides Australian-specific extensions when needed

**Option B: International Edition**
- **Universal table:** SNOMED International (~400k codes)
- **Rationale:** Comprehensive but massive storage overhead
- **Rejected:** Same storage problem as AU edition, CORE subset sufficient

**Option C: AU Edition Only**
- **Regional table:** SNOMED AU edition (706,544 codes)
- **Rationale:** Pragmatic, what we have now
- **Rejected:** Misses opportunity to use validated CORE subset

**DECISION:** Option A - CORE subset in universal, AU edition in regional as fallback

### 2. LOINC (Lab/Observation Codes)

**Current State:**
- 102,891 codes in `regional_medical_codes` (WRONG table)
- Embeddings already generated
- Working well for lab result matching

**Options:**

**Option A: Move to Universal (Recommended)**
- **Universal table:** All 102,891 LOINC codes
- **Rationale:**
  - LOINC is THE universal standard for lab codes
  - Used globally, not Australian-specific
  - No regional variants exist
  - Already have embeddings, just need to move

**Option B: Keep in Regional**
- **Rationale:** "If it ain't broke don't fix it"
- **Rejected:** Semantically incorrect, confuses future architecture

**DECISION:** Option A - Move LOINC to universal_medical_codes

### 3. RxNorm (Medications)

**Current State:**
- Downloaded, not yet parsed
- ~50k medication codes expected
- Includes both generic (SCD) and branded (SBD) drugs

**Options:**

**Option A: RxNorm in Universal + PBS in Regional (Recommended)**
- **Universal table:** RxNorm (~50k codes)
- **Regional table:** PBS (14,382 codes)
- **Rationale:**
  - RxNorm is US-centric but globally recognized standard
  - PBS provides Australian-specific subsidized medications
  - Complementary: RxNorm for standard terms, PBS for Australian brands
  - Two-tier search: RxNorm primary, PBS for AU-specific matches

**Option B: PBS Only**
- **Regional table:** PBS (14,382 codes)
- **Rationale:** Australia-focused, simpler
- **Rejected:** Limited to Australian subsidized drugs, misses many medications

**Option C: RxNorm Only**
- **Universal table:** RxNorm (~50k codes)
- **Rejected:** Misses Australian-specific medications and brands

**DECISION:** Option A - Both RxNorm (universal) and PBS (regional)

### 4. PBS (Australian Medications)

**Current State:**
- 14,382 codes in `regional_medical_codes` (correct)
- Parsed, not yet embedded
- Australian Pharmaceutical Benefits Scheme

**DECISION:** Keep in regional_medical_codes (already correct)

### 5. MBS (Australian Medicare Services)

**Current State:**
- Deleted from database (6,001 codes removed)
- Deemed "billing codes not clinically useful"

**Options:**

**Option A: Leave Deleted (Recommended)**
- **Rationale:** Billing codes, not clinical codes
- **Use case:** Patient care doesn't need MBS item numbers

**Option B: Re-add for Billing Context**
- **Rationale:** Could help understand what services were provided
- **Rejected:** Out of scope for clinical data extraction

**DECISION:** Option A - Leave deleted

---

## Proposed Architecture

### Universal Medical Codes Table

**Purpose:** Globally recognized medical code standards

**Contents:**
```
Code System          | Codes   | Status      | Storage
---------------------|---------|-------------|--------
snomed_ct_core       | 6,820   | Parsed      | ~20 MB
loinc                | 102,891 | To migrate  | ~60 MB
rxnorm               | ~50,000 | To parse    | ~30 MB
---------------------|---------|-------------|--------
TOTAL                | ~160k   |             | ~110 MB
```

**Indexing Strategy:**
- SNOMED CORE: Full HNSW vector index (fast, 5-20ms queries)
- LOINC: Full HNSW vector index (existing, migrate from regional)
- RxNorm: Full HNSW vector index (after parsing)

**Query Performance:**
- Target: 5-50ms per entity
- Method: Direct vector similarity search
- Use case: Primary code matching for 90%+ of entities

### Regional Medical Codes Table

**Purpose:** Australian-specific medical codes and extensions

**Contents:**
```
Code System          | Codes    | Status      | Storage
---------------------|----------|-------------|--------
snomed_ct_au         | 706,544  | Existing    | ~426 MB
pbs                  | 14,382   | Existing    | ~8 MB
---------------------|----------|-------------|--------
TOTAL                | ~721k    |             | ~434 MB
```

**Indexing Strategy:**
- SNOMED AU: Minimal indexing (lexical only, no vector)
- PBS: HNSW vector index (small, ~50 MB)

**Query Performance:**
- SNOMED AU fallback: 200-500ms (rare diseases)
- PBS: 10-50ms (medications)
- Method: Two-tier search (CORE first, AU fallback)
- Use case: Australian-specific codes, rare diseases

---

## Two-Tier Search Strategy (Updated)

### Tier 1: Universal Codes (Primary)

**Lab Results:**
```
Input: "Hemoglobin A1c"
Search: LOINC in universal_medical_codes
Method: Vector similarity
Performance: 5-20ms
Output: Top 10 LOINC codes
```

**Medications:**
```
Input: "Atorvastatin 20mg"
Search: RxNorm in universal_medical_codes
Method: Vector similarity
Performance: 5-20ms
Output: Top 10 RxNorm codes
Fallback: PBS in regional_medical_codes (if AU brand)
```

**Clinical Terms:**
```
Input: "Type 2 Diabetes Mellitus"
Search: SNOMED CORE in universal_medical_codes
Method: Vector similarity
Performance: 5-20ms
Output: Top 10 CORE codes
```

### Tier 2: Regional Codes (Fallback)

**Rare Diseases:**
```
Input: "Hereditary angioedema type III"
Primary: SNOMED CORE in universal_medical_codes (gets "Hereditary angioedema")
Fallback: SNOMED AU in regional_medical_codes (gets specific type III subtype)
Method: Lexical search + trigram matching
Performance: 200-500ms
Output: Top 5 rare disease codes
```

**Australian Medications:**
```
Input: "Xifaxan" (Australian brand name)
Primary: RxNorm in universal_medical_codes (may match generic)
Fallback: PBS in regional_medical_codes (matches exact AU brand)
Method: Vector similarity
Performance: 10-50ms
Output: PBS code with Australian pricing/subsidy info
```

---

## Migration Plan

### Phase 1: Populate Universal Table (4-6 hours)

**Step 1.1: Migrate LOINC from Regional to Universal**
```sql
-- Copy LOINC codes to universal_medical_codes
INSERT INTO universal_medical_codes (
  code_value,
  code_system,
  display_name,
  entity_type,
  search_text,
  embedding,
  library_version,
  country_code,
  created_at
)
SELECT
  code_value,
  'loinc' AS code_system,
  display_name,
  entity_type,
  search_text,
  embedding,
  library_version,
  NULL AS country_code,  -- Universal, no country
  created_at
FROM regional_medical_codes
WHERE code_system = 'loinc';

-- Verify migration
SELECT COUNT(*) FROM universal_medical_codes WHERE code_system = 'loinc';
-- Expected: 102,891

-- Delete from regional (after verification)
DELETE FROM regional_medical_codes WHERE code_system = 'loinc';
```

**Step 1.2: Add SNOMED CORE to Universal**
```sql
-- Insert CORE subset codes (from parse-core-subset.ts output)
INSERT INTO universal_medical_codes (
  code_value,
  code_system,
  display_name,
  entity_type,
  search_text,
  library_version,
  country_code,
  region_specific_data
)
SELECT
  code_value,
  'snomed_ct_core' AS code_system,
  display_name,
  entity_type,
  search_text,
  'CORE_202506' AS library_version,
  NULL AS country_code,
  jsonb_build_object(
    'core_occurrence', core_occurrence,
    'core_usage', core_usage,
    'nlm_validated', true
  ) AS region_specific_data
FROM (
  -- Data from core_mapping.json
  VALUES
    ('60728008', 'Swollen abdomen (finding)', 'physical_finding', 4, 0.0055),
    -- ... (6,820 rows from core_mapping.json)
) AS core_codes(code_value, display_name, entity_type, occurrence, usage);
```

**Step 1.3: Generate Embeddings for CORE Subset**
```bash
# Run embedding generation script
npx tsx scripts/medical-codes/snomed/generate-snomed-embeddings.ts --table=universal --core-only

# Cost: ~$0.01 USD (6,820 codes)
# Time: 5-10 minutes
```

**Step 1.4: Parse and Load RxNorm (Future)**
```bash
# Create parser script
npx tsx scripts/medical-codes/rxnorm/parse-rxnorm.ts

# Generate embeddings
npx tsx scripts/medical-codes/rxnorm/generate-rxnorm-embeddings.ts

# Load to universal_medical_codes
npx tsx scripts/medical-codes/rxnorm/populate-rxnorm.ts --table=universal
```

### Phase 2: Update Regional Table (2-3 hours)

**Step 2.1: Rename SNOMED System in Regional**
```sql
-- Clarify that regional SNOMED is AU edition
UPDATE regional_medical_codes
SET code_system = 'snomed_ct_au'
WHERE code_system = 'snomed_ct';

-- Verify
SELECT code_system, COUNT(*)
FROM regional_medical_codes
GROUP BY code_system;
-- Expected:
--   snomed_ct_au: 706,544
--   pbs:          14,382
```

**Step 2.2: Remove Embeddings from AU Edition**
```sql
-- Optional: Remove embeddings from SNOMED AU to save space
-- Only needed for fallback lexical search
UPDATE regional_medical_codes
SET embedding = NULL
WHERE code_system = 'snomed_ct_au';

-- Reclaim space
VACUUM FULL regional_medical_codes;
```

**Step 2.3: Generate PBS Embeddings**
```bash
# Generate embeddings for PBS (if not already done)
npx tsx scripts/medical-codes/pbs/generate-pbs-embeddings.ts

# Cost: ~$0.01 USD (14,382 codes)
# Time: 3-5 minutes
```

### Phase 3: Create Indexes (1-2 hours)

**Step 3.1: Universal Table Indexes**
```sql
-- SNOMED CORE: Full HNSW index
CREATE INDEX idx_universal_snomed_core_hnsw
ON universal_medical_codes
USING hnsw (embedding vector_cosine_ops)
WHERE code_system = 'snomed_ct_core'
  AND embedding IS NOT NULL
WITH (m = 16, ef_construction = 64);
-- Expected: ~20-30 MB index, <1 minute build time

-- LOINC: Full HNSW index (already exists, just verify)
CREATE INDEX IF NOT EXISTS idx_universal_loinc_hnsw
ON universal_medical_codes
USING hnsw (embedding vector_cosine_ops)
WHERE code_system = 'loinc'
  AND embedding IS NOT NULL
WITH (m = 16, ef_construction = 64);
-- Expected: ~400 MB index (existing size)

-- RxNorm: Full HNSW index (future, after parsing)
CREATE INDEX idx_universal_rxnorm_hnsw
ON universal_medical_codes
USING hnsw (embedding vector_cosine_ops)
WHERE code_system = 'rxnorm'
  AND embedding IS NOT NULL
WITH (m = 16, ef_construction = 64);
-- Expected: ~150 MB index
```

**Step 3.2: Regional Table Indexes**
```sql
-- PBS: Full HNSW index (small dataset)
CREATE INDEX idx_regional_pbs_hnsw
ON regional_medical_codes
USING hnsw (embedding vector_cosine_ops)
WHERE code_system = 'pbs'
  AND embedding IS NOT NULL
WITH (m = 16, ef_construction = 64);
-- Expected: ~50 MB index, <1 minute build time

-- SNOMED AU: Lexical only (no vector index)
CREATE INDEX idx_regional_snomed_au_display
ON regional_medical_codes
USING gin (to_tsvector('english', display_name))
WHERE code_system = 'snomed_ct_au';

CREATE INDEX idx_regional_snomed_au_trigram
ON regional_medical_codes
USING gin (display_name gin_trgm_ops)
WHERE code_system = 'snomed_ct_au';
-- Expected: ~100-200 MB trigram index
```

### Phase 4: Update Pass 1.5 Logic (4-6 hours)

**Routing Strategy:**
```typescript
function routeEntityToCodeSystem(
  entityText: string,
  entityType: string,
  entityCategory: string
): SearchStrategy {

  // Lab results → LOINC (universal)
  if (entityCategory === 'lab_result' || entityCategory === 'observation') {
    return {
      primary: 'universal_medical_codes',
      codeSystem: 'loinc',
      method: 'vector',
      fallback: null
    };
  }

  // Medications → RxNorm + PBS
  if (entityCategory === 'medication') {
    return {
      primary: 'universal_medical_codes',
      codeSystem: 'rxnorm',
      method: 'vector',
      fallback: {
        table: 'regional_medical_codes',
        codeSystem: 'pbs',
        method: 'vector'
      }
    };
  }

  // Clinical terms → SNOMED CORE + AU fallback
  // (conditions, procedures, physical findings, etc.)
  return {
    primary: 'universal_medical_codes',
    codeSystem: 'snomed_ct_core',
    method: 'vector',
    fallback: {
      table: 'regional_medical_codes',
      codeSystem: 'snomed_ct_au',
      method: 'lexical'  // No vector index on AU
    }
  };
}
```

---

## Cost-Benefit Analysis

### Storage Comparison

**Before (All in Regional):**
```
Table: regional_medical_codes
Data: 441 MB
Indexes: 14.5 GB (attempted full SNOMED indexing)
Total: ~15 GB
Issue: Needed 32 GB disk (+$21/year)
```

**After (Universal + Regional Split):**
```
Table: universal_medical_codes
  Data: ~110 MB
  Indexes: ~600 MB (CORE + LOINC + RxNorm)
  Subtotal: ~710 MB

Table: regional_medical_codes
  Data: ~434 MB
  Indexes: ~250 MB (PBS vector + SNOMED AU lexical)
  Subtotal: ~684 MB

Grand Total: ~1.4 GB
Savings: 93% reduction vs full indexing
Disk Tier: Stays at 18 GB (no upgrade needed)
Cost: $25/month (no change)
```

### Performance Comparison

**Before (Full SNOMED Indexing):**
- Query time: 2,800ms (with massive index)
- Index build: 30-75 minutes
- Coverage: 100% (all 706k codes)

**After (Universal Primary + Regional Fallback):**
- Universal query: 5-50ms (CORE/LOINC/RxNorm)
- Regional fallback: 200-500ms (rare diseases)
- Index build: <5 minutes total
- Coverage: 90%+ universal, 100% with fallback

---

## Decision Matrix

| Code System | Library | Table | Justification |
|-------------|---------|-------|---------------|
| SNOMED CORE | 6,820 codes | Universal | NLM-validated, 90%+ coverage, fast queries |
| SNOMED AU | 706,544 codes | Regional | AU-specific extensions, rare disease fallback |
| SNOMED International | ~400k codes | Not used | Redundant with CORE + AU |
| LOINC | 102,891 codes | Universal | Global standard for labs |
| RxNorm | ~50k codes | Universal | Global standard for meds |
| PBS | 14,382 codes | Regional | AU-specific medications |
| MBS | Deleted | Neither | Billing codes, not clinical |
| ICD-10-AM | Not acquired | N/A | Optional, not prioritized |

---

## Success Criteria

**Storage Efficiency:**
- Total disk usage: <2 GB (including all indexes)
- No disk upgrade needed
- 93% reduction vs full SNOMED indexing

**Performance:**
- Universal queries: <50ms per entity
- Regional fallback: <1000ms per entity
- CORE coverage: >90% of entities

**Architecture Clarity:**
- Universal codes in universal_medical_codes
- Regional codes in regional_medical_codes
- Clear semantic separation

**Clinical Quality:**
- Pass 1.5 generates accurate shortlists
- Pass 2 selects clinically appropriate codes
- No loss of coverage vs previous approach

---

## Risks and Mitigations

**Risk 1: CORE Coverage Insufficient**
- **Mitigation:** Two-tier search with AU fallback
- **Monitoring:** Track fallback usage rate
- **Action:** Promote frequently-used fallback codes to CORE

**Risk 2: RxNorm Doesn't Cover Australian Medications**
- **Mitigation:** PBS as regional fallback for AU brands
- **Monitoring:** Track PBS match rate
- **Action:** Prioritize PBS for Australian documents

**Risk 3: Migration Breaks Existing Functionality**
- **Mitigation:** Keep both tables during transition
- **Rollback:** Can revert LOINC to regional if issues
- **Testing:** Validate with existing 134 processed documents

---

## Next Steps

1. Get user approval on strategy
2. Update documentation (medical-code-sources.md, DATA-ACQUISITION-GUIDE.md, ARCHITECTURAL-REVIEW-2025.md)
3. Execute Phase 1: Populate universal_medical_codes
4. Execute Phase 2: Update regional_medical_codes
5. Execute Phase 3: Create indexes
6. Execute Phase 4: Update Pass 1.5 logic
7. Test with existing documents
8. Monitor performance and coverage

---

**Last Updated:** 2025-11-22
**Status:** Awaiting approval
**Decision Owner:** Xavier Flanagan
