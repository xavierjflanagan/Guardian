# Pass 1.5 CORE Subset Pivot - Implementation Plan

**Created:** 2025-11-08
**Status:** In Progress - Phase 1
**Type:** Architectural Evolution
**Impact:** Storage reduction (96%), Performance improvement (10x), Cost savings ($21/year)

---

## Executive Summary

### The Pivot

**From:** Full SNOMED CT dataset (706,544 codes) with full vector indexing
**To:** Two-tier architecture - CORE subset (5,182 codes) + Fallback full dataset

### Why This Matters

**Problem:**
- Full SNOMED indexing requires 15GB disk space (current: 18GB total)
- Would need 32GB disk upgrade (+$21/year permanent cost)
- 99.3% of codes likely unused
- Index build time: 30-75 minutes
- Query time degradation with large indexes

**Solution:**
- Use NLM's validated CORE subset (5,182 codes from 7 major institutions)
- Vector index ONLY the CORE codes
- Lexical search fallback for rare codes
- Results: 96% storage reduction, 10x faster queries, no disk upgrade

---

## Current State Analysis

### Database Reality (as of 2025-11-08)

**Tables:**
```
universal_medical_codes:    0 rows (empty, not used)
regional_medical_codes:     823,817 rows (ALL codes with AUS tag)
  - snomed_ct:   706,544 codes (full Australian edition)
  - loinc:       102,891 codes
  - pbs:          14,382 codes
```

**Key Insight:** Using `regional_medical_codes` for all code systems (pragmatic for AUS-only launch).

**Pass 1 Status:**
- Entities detected: 1,000+ across 34 documents
- Pass 1.5 has NOT been run yet
- No code shortlists generated yet
- Cannot validate CORE coverage against real usage (chicken-egg problem)

**Decision:** Trust NLM's validated CORE subset data from 7 major healthcare institutions rather than wait for our own usage data.

---

## Architecture Design

### Approach: Column Classifier with Partial Index

**Why this approach:**
1. Keeps existing single-table architecture
2. No data duplication
3. Simple boolean flag classification
4. PostgreSQL partial indexes are highly efficient
5. Easy to promote codes to CORE later

### Schema Changes

```sql
-- Add to existing regional_medical_codes table
ALTER TABLE regional_medical_codes
ADD COLUMN is_core_subset BOOLEAN DEFAULT FALSE,
ADD COLUMN core_occurrence INTEGER,  -- 1-8 institutions using this code
ADD COLUMN core_usage NUMERIC;       -- Average usage percentage from NLM data

-- Update CORE codes
UPDATE regional_medical_codes
SET
  is_core_subset = TRUE,
  core_occurrence = <from_nlm_data>,
  core_usage = <from_nlm_data>
WHERE code_system = 'snomed_ct'
  AND code_value IN (SELECT code FROM core_subset_mapping);
-- Expected: 5,182 rows updated

-- Create partial HNSW index on CORE codes only
CREATE INDEX idx_snomed_core_hnsw
ON regional_medical_codes
USING hnsw (embedding vector_cosine_ops)
WHERE code_system = 'snomed_ct'
  AND is_core_subset = TRUE
WITH (m = 16, ef_construction = 64);
-- Index size: ~50 MB (vs 6+ GB for full dataset)
-- Build time: <1 minute (vs 30-75 minutes)
```

### Two-Tier Search Strategy

**Tier 1: CORE Subset (Primary)**
```sql
-- Fast vector search on CORE codes
SELECT code_value, display_name, embedding <=> $1 AS similarity
FROM regional_medical_codes
WHERE code_system = 'snomed_ct'
  AND is_core_subset = TRUE
  AND entity_type = $2
ORDER BY embedding <=> $1
LIMIT 10;
-- Performance: 5-20ms per query
```

**Tier 2: Full Dataset Fallback (Rare Disease)**
```sql
-- Lexical search on non-CORE codes
SELECT code_value, display_name,
       similarity(display_name, $1) AS score
FROM regional_medical_codes
WHERE code_system = 'snomed_ct'
  AND is_core_subset = FALSE
  AND entity_type = $2
  AND display_name % $1  -- trigram similarity
ORDER BY score DESC
LIMIT 5;
-- Performance: 200-500ms per query (acceptable for rare cases)
```

---

## Phase 1: Download & Parse CORE Subset

**Duration:** 2-4 hours
**Status:** Starting

### Step 1.1: Download CORE Subset

**Source:** https://www.nlm.nih.gov/research/umls/Snomed/core_subset.html
**File:** `SNOMEDCT_CORE_SUBSET_<YYYYMM>.txt` (latest: September 2024 or later)
**Size:** ~500 KB text file

**UMLS Account Required:**
- If don't have account: Register at https://uts.nlm.nih.gov/uts/signup-login
- Approval time: 1-2 business days
- Free for research/healthcare use

**Download Location:** `data/medical-codes/snomed/core-subset/`

### Step 1.2: Parse CORE Subset File

**File Structure (10 columns):**
```
SNOMED_CID                  - Concept identifier (the SNOMED code)
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

**Key Fields:**
- `SNOMED_CID`: Match this against our `code_value` column
- `OCCURRENCE`: Higher = more universally relevant (7-8 = best)
- `USAGE`: Average usage % across institutions

**Parser Output:**
- JSON/CSV mapping: SNOMED code → CORE metadata
- Location: `data/medical-codes/snomed/core-subset/core_mapping.json`

### Step 1.3: Cross-Reference with Australian Edition

**Challenge:** CORE subset is from US/International edition, we have Australian edition
**Solution:**
- Most CORE codes are universal (clinical findings, procedures)
- Cross-reference by SNOMED_CID
- Log any CORE codes not in our AU edition
- Expected match rate: 95%+ (clinical concepts are universal)

**Script:** `scripts/medical-codes/snomed/parse-core-subset.ts`

**Output:**
```json
{
  "total_core_codes": 5182,
  "matched_in_aus_edition": 4923,
  "not_found_in_aus": 259,
  "match_rate": 0.95
}
```

---

## Phase 2: Add CORE Classification Schema

**Duration:** 1 hour
**Dependencies:** Phase 1 complete

### Step 2.1: Database Migration

**Migration:** Create migration file in `migration_history/`

```sql
-- Migration: Add CORE subset classification to regional_medical_codes
-- Created: 2025-11-08
-- Author: Pass 1.5 CORE Subset Pivot

-- Add columns
ALTER TABLE regional_medical_codes
ADD COLUMN IF NOT EXISTS is_core_subset BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS core_occurrence INTEGER,
ADD COLUMN IF NOT EXISTS core_usage NUMERIC;

-- Add index for CORE filtering
CREATE INDEX IF NOT EXISTS idx_regional_medical_codes_core
ON regional_medical_codes(code_system, is_core_subset)
WHERE code_system = 'snomed_ct';

-- Add comment
COMMENT ON COLUMN regional_medical_codes.is_core_subset IS
  'TRUE if code is in NLM SNOMED CT CORE subset (validated by 7 major healthcare institutions)';
COMMENT ON COLUMN regional_medical_codes.core_occurrence IS
  'Number of institutions (1-8) using this code in CORE subset';
COMMENT ON COLUMN regional_medical_codes.core_usage IS
  'Average usage percentage across CORE subset institutions';
```

### Step 2.2: Mark CORE Codes

**Script:** `scripts/medical-codes/snomed/mark-core-codes.ts`

```typescript
// Read core_mapping.json from Phase 1
const coreMapping = JSON.parse(fs.readFileSync('data/medical-codes/snomed/core-subset/core_mapping.json'));

// Update database
for (const coreCode of coreMapping.matched_codes) {
  await supabase
    .from('regional_medical_codes')
    .update({
      is_core_subset: true,
      core_occurrence: coreCode.occurrence,
      core_usage: coreCode.usage
    })
    .eq('code_system', 'snomed_ct')
    .eq('code_value', coreCode.snomed_cid);
}

console.log(`Marked ${coreMapping.matched_in_aus_edition} codes as CORE`);
```

**Expected Result:**
- ~4,900-5,000 SNOMED codes marked as CORE
- 700k+ codes remain as non-CORE (fallback)

### Step 2.3: Generate Embeddings for CORE Codes

**Script:** `scripts/medical-codes/snomed/generate-snomed-embeddings.ts`
**Add flag:** `--core-only`

```typescript
// Only generate embeddings for CORE codes
const { data: coreCodes } = await supabase
  .from('regional_medical_codes')
  .select('id, code_value, display_name, search_text')
  .eq('code_system', 'snomed_ct')
  .eq('is_core_subset', true)
  .is('embedding', null);

console.log(`Generating embeddings for ${coreCodes.length} CORE codes...`);

// Generate in batches
for (const batch of chunks(coreCodes, 100)) {
  const embeddings = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: batch.map(c => c.search_text || c.display_name)
  });

  // Update database
  for (let i = 0; i < batch.length; i++) {
    await supabase
      .from('regional_medical_codes')
      .update({ embedding: embeddings.data[i].embedding })
      .eq('id', batch[i].id);
  }
}
```

**Cost:** ~$0.01 USD (5,000 codes × 20 tokens avg × $0.02 per 1M tokens)
**Time:** 5-15 minutes

---

## Phase 3: Create Partial Vector Index

**Duration:** 30 minutes
**Dependencies:** Phase 2 complete (embeddings generated)

### Step 3.1: Drop Existing SNOMED Indexes (if any)

```sql
-- Check for existing SNOMED vector indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'regional_medical_codes'
  AND indexdef LIKE '%hnsw%'
  AND indexdef LIKE '%snomed%';

-- Drop them if they exist
DROP INDEX IF EXISTS idx_snomed_medication_hnsw;
DROP INDEX IF EXISTS idx_snomed_condition_hnsw;
DROP INDEX IF EXISTS idx_snomed_procedure_hnsw;
-- etc.
```

### Step 3.2: Create Partial HNSW Index on CORE Subset

```sql
-- Partial index: Only indexes CORE codes
CREATE INDEX idx_snomed_core_hnsw
ON regional_medical_codes
USING hnsw (embedding vector_cosine_ops)
WHERE code_system = 'snomed_ct'
  AND is_core_subset = TRUE
  AND embedding IS NOT NULL
WITH (
  m = 16,              -- Good balance of speed vs recall
  ef_construction = 64 -- Higher = better quality, slower build
);

-- Monitor index creation
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE indexname = 'idx_snomed_core_hnsw';
```

**Expected:**
- Index size: ~50-100 MB (vs 6+ GB for full dataset)
- Build time: <1 minute (vs 30-75 minutes)
- No compute upgrade needed

### Step 3.3: Vacuum and Analyze

```sql
-- Reclaim space from dropped indexes
VACUUM FULL regional_medical_codes;

-- Update query planner statistics
ANALYZE regional_medical_codes;
```

---

## Phase 4: Implement Two-Tier Search

**Duration:** 4-8 hours
**Dependencies:** Phase 3 complete

### Step 4.1: Create RPC Function for Two-Tier Search

**Location:** Create in database or Edge Function

```sql
CREATE OR REPLACE FUNCTION search_snomed_two_tier(
  p_search_text TEXT,
  p_entity_type TEXT,
  p_embedding VECTOR(1536),
  p_core_limit INTEGER DEFAULT 10,
  p_fallback_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  code_value TEXT,
  display_name TEXT,
  is_core BOOLEAN,
  similarity_score FLOAT,
  core_occurrence INTEGER,
  core_usage NUMERIC
) AS $$
BEGIN
  -- Stage 1: CORE subset vector search
  RETURN QUERY
  SELECT
    rmc.code_value,
    rmc.display_name,
    TRUE AS is_core,
    1 - (rmc.embedding <=> p_embedding) AS similarity_score,
    rmc.core_occurrence,
    rmc.core_usage
  FROM regional_medical_codes rmc
  WHERE rmc.code_system = 'snomed_ct'
    AND rmc.is_core_subset = TRUE
    AND rmc.entity_type = p_entity_type
    AND rmc.embedding IS NOT NULL
  ORDER BY rmc.embedding <=> p_embedding
  LIMIT p_core_limit;

  -- Stage 2: Fallback lexical search (optional, for rare diseases)
  -- Only if CORE results have low confidence
  RETURN QUERY
  SELECT
    rmc.code_value,
    rmc.display_name,
    FALSE AS is_core,
    similarity(rmc.display_name, p_search_text) AS similarity_score,
    NULL::INTEGER AS core_occurrence,
    NULL::NUMERIC AS core_usage
  FROM regional_medical_codes rmc
  WHERE rmc.code_system = 'snomed_ct'
    AND rmc.is_core_subset = FALSE
    AND rmc.entity_type = p_entity_type
    AND rmc.display_name % p_search_text  -- Trigram similarity operator
  ORDER BY similarity(rmc.display_name, p_search_text) DESC
  LIMIT p_fallback_limit;
END;
$$ LANGUAGE plpgsql;
```

### Step 4.2: Update Pass 1.5 Worker Code

**File:** `apps/render-worker/src/pass15/code-shortlisting.ts` (or wherever Pass 1.5 will live)

```typescript
async function generateCodeShortlist(
  entityText: string,
  entityType: string,
  entityCategory: string
): Promise<CodeShortlist> {

  // Route by category
  if (entityCategory === 'lab_result') {
    return await searchLOINC(entityText, entityType);
  }

  if (entityCategory === 'medication') {
    return await searchPBS(entityText, entityType);
  }

  // Clinical entities: Two-tier SNOMED search

  // Generate embedding for entity text
  const embedding = await generateEmbedding(entityText);

  // Call two-tier search RPC
  const { data, error } = await supabase.rpc('search_snomed_two_tier', {
    p_search_text: entityText,
    p_entity_type: entityType,
    p_embedding: embedding,
    p_core_limit: 10,
    p_fallback_limit: 5
  });

  if (error) throw error;

  // Separate CORE and fallback results
  const coreCodes = data.filter(r => r.is_core);
  const fallbackCodes = data.filter(r => !r.is_core);

  return {
    entity_text: entityText,
    entity_type: entityType,
    core_codes: coreCodes,
    fallback_codes: fallbackCodes,
    routing: 'snomed_two_tier'
  };
}
```

### Step 4.3: Pass 2 AI Prompt Update

**File:** `apps/render-worker/src/pass2/code-selection.ts` (or wherever Pass 2 will live)

```typescript
const prompt = `
You are assigning medical codes to this entity: "${entityText}"

You have been provided with a shortlist from two sources:

CORE CODES (standard terminology from NLM - used by major institutions):
${formatCodes(shortlist.core_codes)}

FALLBACK CODES (specialized terminology for rare conditions):
${formatCodes(shortlist.fallback_codes)}

REQUIREMENTS:
1. MANDATORY: Select at least ONE code from the CORE list as the primary code
2. OPTIONAL: Select ONE code from FALLBACK list as secondary IF:
   - The fallback code captures clinically significant detail not in CORE
   - The specificity is relevant for patient care
   - The rare diagnosis is supported by clinical evidence

Return JSON format:
{
  "primary_code": "<code_value>",  // MUST be from CORE
  "primary_source": "CORE",
  "secondary_code": "<code_value>",  // Optional, from FALLBACK
  "secondary_source": "FALLBACK",
  "justification": "<why this coding is appropriate>"
}
`;
```

---

## Phase 5: Testing & Validation

**Duration:** 2-4 hours
**Dependencies:** Phase 4 complete

### Step 5.1: Unit Tests

**Test CORE search:**
```typescript
describe('CORE Subset Search', () => {
  it('should return only CORE codes for common condition', async () => {
    const result = await searchSNOMEDCore('Type 2 Diabetes', 'condition');
    expect(result.every(r => r.is_core_subset)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should have fast query time', async () => {
    const start = Date.now();
    await searchSNOMEDCore('Hypertension', 'condition');
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(50); // <50ms target
  });
});
```

**Test two-tier search:**
```typescript
describe('Two-Tier Search', () => {
  it('should return CORE + fallback for rare disease', async () => {
    const result = await generateCodeShortlist(
      'Hereditary angioedema type III',
      'condition',
      'clinical_event'
    );
    expect(result.core_codes.length).toBeGreaterThan(0);
    expect(result.fallback_codes.length).toBeGreaterThan(0);
  });
});
```

### Step 5.2: Integration Testing

**Test with real entities:**
- Use the 1,000 entities detected from Pass 1
- Run Pass 1.5 two-tier search on all entities
- Measure:
  - CORE coverage: % of entities with at least one CORE match
  - Average query time
  - Fallback usage rate

**Target Metrics:**
- CORE coverage: >90%
- CORE query time: <50ms per entity
- Fallback query time: <1000ms per entity
- Fallback usage: <10% of entities

### Step 5.3: Performance Monitoring

```sql
-- Monitor index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexname LIKE '%snomed%';

-- Monitor disk usage
SELECT
  pg_size_pretty(pg_database_size(current_database())) AS db_size,
  pg_size_pretty(pg_relation_size('regional_medical_codes')) AS table_size,
  pg_size_pretty(pg_total_relation_size('regional_medical_codes')) AS total_size;
```

**Success Criteria:**
- Total disk usage: <5 GB (including indexes)
- No disk upgrade needed (stays under 18 GB)
- Query performance: Consistent under load

---

## Success Metrics

### Storage Efficiency
- [x] Index size reduction: 96% (6 GB → 50 MB)
- [ ] Total disk usage: <5 GB
- [ ] No disk tier upgrade needed

### Performance
- [ ] CORE query time: <50ms per entity (target: 10-20ms)
- [ ] CORE coverage: >90% of entities match at least one CORE code
- [ ] Fallback query time: <1000ms per entity (target: 200-500ms)
- [ ] Fallback usage: <10% of entities need fallback

### Cost
- [ ] No disk upgrade: $0 additional cost
- [ ] Embedding generation: ~$0.01 one-time
- [ ] Monthly savings: $1.75 (no disk upgrade)

### Quality
- [ ] Pass 1.5 successfully generates code shortlists
- [ ] Pass 2 successfully selects final codes
- [ ] AI justifications are clinically sound
- [ ] No data loss or corruption

---

## Rollback Plan

### If CORE Coverage Insufficient (<80%)

**Option A: Expand CORE Dynamically**
```sql
-- Promote frequently selected fallback codes to CORE
WITH fallback_usage AS (
  SELECT
    rmc.code_value,
    COUNT(*) as selection_count
  FROM pass2_final_codes p2
  JOIN regional_medical_codes rmc ON p2.secondary_code = rmc.code_value
  WHERE rmc.is_core_subset = FALSE
  GROUP BY rmc.code_value
  HAVING COUNT(*) > 10  -- Selected in 10+ documents
)
UPDATE regional_medical_codes rmc
SET is_core_subset = TRUE
FROM fallback_usage fu
WHERE rmc.code_value = fu.code_value;

-- Rebuild partial index (fast, since CORE is still small)
REINDEX INDEX idx_snomed_core_hnsw;
```

**Option B: Full Rollback**
```sql
-- Remove CORE classification
UPDATE regional_medical_codes
SET is_core_subset = FALSE
WHERE code_system = 'snomed_ct';

-- Drop partial index
DROP INDEX idx_snomed_core_hnsw;

-- Create full index (requires disk upgrade)
-- This brings us back to the original full-dataset approach
```

### If Performance Issues

**Monitor queries:**
```sql
-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%regional_medical_codes%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**Tune index:**
```sql
-- Increase ef_construction for better recall
DROP INDEX idx_snomed_core_hnsw;
CREATE INDEX idx_snomed_core_hnsw
ON regional_medical_codes
USING hnsw (embedding vector_cosine_ops)
WHERE code_system = 'snomed_ct' AND is_core_subset = TRUE
WITH (m = 16, ef_construction = 128);  -- Higher = better quality
```

---

## Timeline

**Phase 1:** 2-4 hours (Download + Parse CORE subset)
**Phase 2:** 1 hour (Schema migration + mark CORE codes + generate embeddings)
**Phase 3:** 30 minutes (Create partial index)
**Phase 4:** 4-8 hours (Implement two-tier search logic)
**Phase 5:** 2-4 hours (Testing + validation)

**Total:** 10-18 hours engineering time

---

## References

- **SNOMED CT CORE Subset:** https://www.nlm.nih.gov/research/umls/Snomed/core_subset.html
- **NLM Technical Bulletin:** SNOMED CT CORE subset release notes
- **ARCHITECTURAL-REVIEW-2025.md:** Strategic rationale for CORE subset pivot
- **pgvector documentation:** https://github.com/pgvector/pgvector
- **PostgreSQL partial indexes:** https://www.postgresql.org/docs/current/indexes-partial.html

---

**Status:** Ready to begin Phase 1
**Next Action:** Download SNOMED CT CORE subset from NLM
**Estimated Completion:** 2025-11-10 (assuming 2-3 work sessions)
