# SNOMED CT Vector Index Strategy
## Entity-Specific HNSW Index Implementation Plan

**Created:** 2025-11-06
**Status:** Planning
**Priority:** High - Performance optimization for medical code search

---

## Executive Summary

**Problem:** Creating a single HNSW vector index for all 706,544 SNOMED CT codes fails due to:
- Memory exhaustion (maintenance_work_mem overflow)
- Connection timeouts (30-60 minute builds exceed pooler limits)
- Disk IO budget depletion (Supabase resource constraints)

**Solution:** Build 5 entity-specific partial indexes instead of one monolithic index.

**Expected Improvement:**
- Current performance: 2.8 seconds per vector search
- Target performance: 10-50 milliseconds per vector search
- Performance gain: 50-100x faster

---

## Current State

### What We Have

1. **Complete SNOMED CT Dataset**
   - 706,544 codes with embeddings (100% coverage)
   - Text-embedding-3-small (OpenAI, 1536 dimensions)
   - All codes in `regional_medical_codes` table

2. **Existing Global Vector Index**
   ```sql
   idx_regional_codes_vector (IVFFlat, 1000 clusters)
   ```
   - Covers ALL medical codes (SNOMED + LOINC + MBS + PBS)
   - Works but slow for SNOMED-specific queries
   - Filter applied AFTER vector scan (inefficient)

3. **Infrastructure**
   - Supabase Pro plan ($25/month)
   - pgvector 0.8.0 (latest, with parallel build support)
   - Session pooler access (port 5432)

### Why Single Index Fails

**Attempts Made:**
1. Via Supabase SQL Editor → 2 minute timeout
2. Via MCP execute_sql → API timeout
3. Via psql Session pooler → Connection timeout after 30-60 minutes

**Root Causes:**
```
NOTICE: hnsw graph no longer fits into maintenance_work_mem after 4876 tuples
DETAIL: Building will take significantly more time.
```
- Index exceeds available RAM
- Build switches to disk-based operations (very slow)
- Connection drops before completion

---

## Strategy: Entity-Specific Partial Indexes

### Core Concept

Instead of one index for all 706k codes, create **5 smaller indexes** - one per entity type.

**Key Insight:** Indexes are metadata structures, NOT data copies
- ✅ Data stays unified in `regional_medical_codes`
- ✅ Each index is 5-6x smaller
- ✅ PostgreSQL automatically selects the right index
- ✅ No data duplication

### Entity Distribution

| Entity Type       | Count    | % of Total | Expected Build Time |
|------------------|----------|------------|---------------------|
| observation      | 323,478  | 45.8%      | 15-30 minutes       |
| condition        | 130,948  | 18.5%      | 5-15 minutes        |
| physical_finding | 113,711  | 16.1%      | 5-15 minutes        |
| procedure        | 93,561   | 13.2%      | 3-10 minutes        |
| medication       | 44,846   | 6.3%       | 2-5 minutes         |
| **TOTAL**        | **706,544** | **100%** | **30-75 minutes**   |

### Why This Works

1. **Memory Fits:** Each index is 5-6x smaller than full SNOMED index
2. **Build Speed:** Smaller graphs build faster (sub-linear growth)
3. **No Timeout:** Each individual build completes within connection limits
4. **Auto-Selection:** PostgreSQL query planner picks the optimal index

---

## Implementation Plan

### Phase 1: Pre-Flight Checks (5 minutes)

**Verify Current State:**
```sql
-- 1. Check pgvector version (need 0.6.0+)
SELECT * FROM pg_available_extensions WHERE name = 'vector';

-- 2. Verify entity type distribution
SELECT
    entity_type,
    COUNT(*) as code_count,
    COUNT(embedding) as with_embeddings,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percent
FROM regional_medical_codes
WHERE code_system = 'snomed_ct' AND country_code = 'AUS'
GROUP BY entity_type
ORDER BY code_count DESC;

-- 3. Check existing indexes
SELECT
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as size
FROM pg_indexes
WHERE tablename = 'regional_medical_codes'
  AND indexname LIKE '%snomed%';
```

**Expected Results:**
- pgvector version: 0.8.0 ✅
- All 706,544 codes have embeddings ✅
- No existing SNOMED-specific indexes

---

### Phase 2: Build Entity-Specific Indexes (30-75 minutes)

**IMPORTANT:** Build indexes **ONE AT A TIME** (not in parallel)

#### Connection Setup
```bash
# Use psql with Session pooler (port 5432)
# NOT Transaction pooler (port 6543)

psql "postgresql://postgres.napoydbbuvbpyciwjdci@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

#### Index Creation Script

**Create script:** `scripts/create-snomed-entity-indexes.sh`

```bash
#!/bin/bash

# Create Entity-Specific HNSW Indexes for SNOMED CT
# Must be run with Session pooler connection

echo "SNOMED CT Entity-Specific Index Creation"
echo "=========================================="
echo ""

# Prompt for password
echo "Enter your Supabase database password:"
read -s DB_PASSWORD
echo ""

# Connection details
DB_HOST="aws-0-ap-southeast-1.pooler.supabase.com"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres.napoydbbuvbpyciwjdci"

export PGPASSWORD="$DB_PASSWORD"

# Entity types in order (smallest to largest for testing)
ENTITIES=("medication" "procedure" "physical_finding" "condition" "observation")
COUNTS=("44846" "93561" "113711" "130948" "323478")

for i in "${!ENTITIES[@]}"; do
    ENTITY="${ENTITIES[$i]}"
    COUNT="${COUNTS[$i]}"

    echo ""
    echo "=========================================="
    echo "Building Index $((i+1))/5: $ENTITY ($COUNT codes)"
    echo "=========================================="
    echo ""

    START_TIME=$(date +%s)

    psql "postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME" <<SQL
-- Set 2 hour timeout (generous for largest index)
SET statement_timeout = '2h';

-- Enable parallel index build (pgvector 0.8.0)
SET max_parallel_maintenance_workers = 7;

-- Create entity-specific HNSW index
CREATE INDEX idx_snomed_${ENTITY}_hnsw
ON regional_medical_codes
USING hnsw (embedding vector_cosine_ops)
WHERE code_system = 'snomed_ct'
  AND country_code = 'AUS'
  AND entity_type = '${ENTITY}';

-- Verify index was created
SELECT
    indexname,
    pg_index.indisvalid as is_valid,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as size,
    CASE
        WHEN pg_index.indisvalid THEN 'VALID'
        ELSE 'INVALID - Build failed'
    END as status
FROM pg_indexes
JOIN pg_class ON pg_class.relname = pg_indexes.indexname
JOIN pg_index ON pg_index.indexrelid = pg_class.oid
WHERE tablename = 'regional_medical_codes'
  AND indexname = 'idx_snomed_${ENTITY}_hnsw';
SQL

    END_TIME=$(date +%s)
    ELAPSED=$((END_TIME - START_TIME))

    echo ""
    echo "Completed in ${ELAPSED}s ($((ELAPSED / 60))m $((ELAPSED % 60))s)"
    echo ""
done

unset PGPASSWORD

echo ""
echo "=========================================="
echo "ALL INDEXES CREATED"
echo "=========================================="
echo ""
echo "Verify all indexes:"

psql "postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME" <<SQL
SELECT
    indexname,
    pg_index.indisvalid as is_valid,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as size
FROM pg_indexes
JOIN pg_class ON pg_class.relname = pg_indexes.indexname
JOIN pg_index ON pg_index.indexrelid = pg_class.oid
WHERE tablename = 'regional_medical_codes'
  AND indexname LIKE 'idx_snomed_%_hnsw'
ORDER BY indexname;
SQL

echo ""
echo "Next Steps:"
echo "1. Test vector search performance"
echo "2. Verify query planner uses correct index"
echo "3. Monitor query times (should be 10-50ms)"
```

---

### Phase 3: Testing & Validation (10 minutes)

**Test Query Performance:**

```sql
-- Test observation entity (largest index)
EXPLAIN (ANALYZE, BUFFERS)
SELECT
    code_value,
    display_name,
    entity_type,
    embedding <=> (
        SELECT embedding
        FROM regional_medical_codes
        WHERE code_value = '38341003'
        LIMIT 1
    ) AS distance
FROM regional_medical_codes
WHERE code_system = 'snomed_ct'
  AND country_code = 'AUS'
  AND entity_type = 'observation'
ORDER BY embedding <=> (
    SELECT embedding
    FROM regional_medical_codes
    WHERE code_value = '38341003'
    LIMIT 1
)
LIMIT 10;
```

**Expected Output:**
```
Index Scan using idx_snomed_observation_hnsw  ← Correct index used
Execution Time: 15.234 ms                      ← Fast! (vs 2800ms before)
```

**Validation Checklist:**
- [ ] Query uses entity-specific index (not global `idx_regional_codes_vector`)
- [ ] Execution time < 100ms (target: 10-50ms)
- [ ] All 5 entity types tested
- [ ] Index size reasonable (~100-500MB per index)

---

### Phase 4: Cleanup (Optional)

**Drop Global IVFFlat Index** (if no longer needed):
```sql
-- Only do this if entity-specific indexes work perfectly
-- The global index is still used by other code systems (LOINC, MBS, PBS)

-- DO NOT DROP unless you're certain!
-- DROP INDEX IF EXISTS idx_regional_codes_vector;
```

**Recommendation:** Keep the global index for now. It's useful for:
- LOINC searches
- MBS searches
- PBS searches
- Multi-code-system queries

---

## Alternative: Compute Upgrade Path

**If entity-specific indexes still fail** (unlikely), upgrade compute temporarily.

### Step-by-Step Compute Upgrade

1. **Go to Supabase Dashboard**
   - Navigate to: Project Settings → Compute & Disk
   - Current tier: Small or Medium (estimated)

2. **Upgrade Compute Size**
   - Select: **Large** (recommended starting point)
   - Alternative: **XL** or **2XL** (if Large fails)
   - Click "Update Compute"

3. **Pricing Impact**
   - Pro plan includes $10/month compute credits
   - Large tier: ~$50-100/month (prorated)
   - **For 1 day:** ~$2-3 additional charge
   - **For 1 week:** ~$10-15 additional charge

4. **Build Indexes**
   - Run Phase 2 script with upgraded compute
   - Indexes build faster with more RAM/CPU
   - Expected time: 15-30 minutes total

5. **Downgrade After Completion**
   - Return to: Project Settings → Compute & Disk
   - Select original tier
   - Click "Update Compute"
   - **Indexes persist after downgrade** (they're permanent once built)

### When to Upgrade

**Upgrade if:**
- Entity-specific index builds still timeout on current tier
- You see repeated "maintenance_work_mem" warnings
- Builds take longer than 30 minutes per index

**Don't upgrade if:**
- Builds complete successfully (even if slow)
- You can wait 75 minutes for sequential builds
- Budget is tight

---

## Query Patterns

### How PostgreSQL Selects Indexes

**Automatic Selection:**
```sql
-- Query includes entity_type filter
SELECT ...
WHERE code_system = 'snomed_ct'
  AND entity_type = 'condition'  ← Index selector
ORDER BY embedding <=> $1;

→ Uses: idx_snomed_condition_hnsw
```

**Manual Index Hint** (if needed):
```sql
-- Force specific index (rarely needed)
SELECT ...
FROM regional_medical_codes
WHERE code_system = 'snomed_ct'
  AND entity_type = 'medication'
ORDER BY embedding <=> $1
LIMIT 10;

→ PostgreSQL automatically picks idx_snomed_medication_hnsw
```

### Multi-Entity Searches

**If you need to search across multiple entity types:**
```sql
-- Search conditions AND procedures
SELECT * FROM (
    SELECT ...
    FROM regional_medical_codes
    WHERE entity_type = 'condition'
    ORDER BY embedding <=> $1
    LIMIT 5

    UNION ALL

    SELECT ...
    FROM regional_medical_codes
    WHERE entity_type = 'procedure'
    ORDER BY embedding <=> $1
    LIMIT 5
) combined
ORDER BY distance
LIMIT 10;
```

Each subquery uses its own optimized index.

---

## Maintenance

### Monitoring Index Health

```sql
-- Check index sizes
SELECT
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as size,
    pg_size_pretty(pg_total_relation_size(indexname::regclass)) as total_size
FROM pg_indexes
WHERE tablename = 'regional_medical_codes'
  AND indexname LIKE 'idx_snomed_%_hnsw'
ORDER BY pg_relation_size(indexname::regclass) DESC;

-- Check index usage statistics
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as times_used,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE indexname LIKE 'idx_snomed_%_hnsw'
ORDER BY idx_scan DESC;
```

### When to Rebuild

**Rebuild indexes if:**
- Index becomes invalid (indisvalid = false)
- Performance degrades significantly
- After bulk data updates (rare for SNOMED)

**Rebuild command:**
```sql
REINDEX INDEX CONCURRENTLY idx_snomed_observation_hnsw;
```

---

## Cost-Benefit Analysis

### Current State (No Entity Indexes)
- **Query Time:** 2.8 seconds
- **User Experience:** Poor (noticeable lag)
- **Cost:** $0 (using existing global index)

### With Entity Indexes
- **Query Time:** 10-50 milliseconds (50-100x faster)
- **User Experience:** Excellent (instant results)
- **Implementation Cost:**
  - Time: 1-2 hours (setup + build + test)
  - Money: $0-3 (if temporary compute upgrade needed)
- **Ongoing Cost:** $0 (indexes are free after creation)

### ROI
- **One-time investment:** 1-2 hours + $0-3
- **Permanent benefit:** 50-100x faster SNOMED searches
- **Impact:** Critical for production usability

**Recommendation:** Implement immediately. The performance gain is essential.

---

## Success Criteria

**Phase 2 Complete When:**
- [ ] All 5 entity-specific indexes created
- [ ] All indexes show `indisvalid = true`
- [ ] Total index size < 5GB (reasonable)
- [ ] Build completed in < 90 minutes total

**Phase 3 Complete When:**
- [ ] Test queries use entity-specific indexes
- [ ] Execution time < 100ms (target: 10-50ms)
- [ ] Performance improvement: 20-50x vs current
- [ ] No query planner issues

**Ready for Production When:**
- [ ] All tests pass
- [ ] Query times consistently fast
- [ ] Index monitoring shows healthy usage
- [ ] No degradation after 24-48 hours

---

## Rollback Plan

**If entity indexes cause problems:**

1. **Drop New Indexes:**
   ```sql
   DROP INDEX IF EXISTS idx_snomed_observation_hnsw;
   DROP INDEX IF EXISTS idx_snomed_condition_hnsw;
   DROP INDEX IF EXISTS idx_snomed_physical_finding_hnsw;
   DROP INDEX IF EXISTS idx_snomed_procedure_hnsw;
   DROP INDEX IF EXISTS idx_snomed_medication_hnsw;
   ```

2. **Verify Global Index Still Works:**
   ```sql
   SELECT indexname
   FROM pg_indexes
   WHERE indexname = 'idx_regional_codes_vector';
   ```

3. **Return to 2.8s Query Times:**
   - Not ideal, but functional
   - No data loss
   - Can retry later with different approach

---

## References

- **Research Summary:** See session notes 2025-11-06
- **Supabase Docs:** https://supabase.com/docs/guides/ai/vector-indexes
- **pgvector Docs:** https://github.com/pgvector/pgvector
- **Related Files:**
  - `EMBEDDING-GENERATION-GUIDE.md` (how embeddings were created)
  - `DATABASE-POPULATION-GUIDE.md` (how codes were populated)

---

## Execution Timeline

**Recommended Schedule:**

**Day 1 (1-2 hours):**
- Phase 1: Pre-flight checks (5 min)
- Phase 2: Build entity indexes (30-75 min)
- Phase 3: Testing (10 min)

**Day 2 (Optional):**
- Monitor production queries
- Verify performance improvement
- Adjust if needed

**Day 3+:**
- Normal operations
- Monitor index usage
- Document learnings

---

## Notes

- Created after multiple failed attempts at single SNOMED index
- Research shows this is a common pattern for large vector datasets
- Entity-specific indexes are a standard PostgreSQL optimization technique
- Indexes are permanent - they persist across compute downgrades
- This strategy is recommended by Supabase for datasets > 500k vectors

**Last Updated:** 2025-11-06
**Next Review:** After Phase 3 completion
