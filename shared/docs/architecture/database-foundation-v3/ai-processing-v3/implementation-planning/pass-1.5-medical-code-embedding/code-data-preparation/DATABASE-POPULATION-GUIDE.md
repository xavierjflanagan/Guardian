# Pass 1.5 Database Population Guide

**Purpose:** Instructions for loading embedded medical codes into Supabase

**Status:** Active - Phase 2 in progress

**Created:** 2025-10-15

---

## Overview

This guide explains how to use the `populate-database.ts` script to load embedded medical codes into the Supabase database.

### Prerequisites
1. ✅ Embedded JSON files exist in `data/medical-codes/<system>/processed/`
2. ✅ Migration 26 executed (versioning fields and pass15_code_candidates table)
3. ✅ pgvector extension installed (v0.8.0+)
4. ✅ Supabase service role key available

### Expected Outcome
- All 228,000 medical codes loaded into database
- Vector indexes automatically used for similarity search
- Ready for Pass 1.5 runtime queries

---

## 1. Setup

### Install Dependencies
```bash
# From repository root
cd shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/code-data-preparation

# Install required packages
pnpm add @supabase/supabase-js fs-extra
pnpm add -D @types/node @types/fs-extra tsx
```

### Set Environment Variables
```bash
# Option 1: Environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Option 2: .env file
echo "SUPABASE_URL=https://your-project.supabase.co" > .env
echo "SUPABASE_SERVICE_ROLE_KEY=your-service-role-key" >> .env
```

**IMPORTANT:** Use **service role key**, not anon key (bypasses RLS for bulk operations)

---

## 2. Usage

### Dry Run (Recommended First)
Test without making database changes:

```bash
# Test all code systems
npx tsx populate-database.ts --code-system=all --dry-run

# Test single code system
npx tsx populate-database.ts --code-system=rxnorm --dry-run
```

### Populate Single Code System
```bash
# RxNorm only
npx tsx populate-database.ts --code-system=rxnorm

# SNOMED-CT only
npx tsx populate-database.ts --code-system=snomed

# LOINC only
npx tsx populate-database.ts --code-system=loinc

# PBS only
npx tsx populate-database.ts --code-system=pbs

# MBS only
npx tsx populate-database.ts --code-system=mbs

# ICD-10-AM only
npx tsx populate-database.ts --code-system=icd10am
```

### Populate All Code Systems
```bash
npx tsx populate-database.ts --code-system=all
```

---

## 3. Expected Output

### Console Output Example
```
🚀 Starting Pass 1.5 Medical Code Database Population
📊 Database: https://your-project.supabase.co

================================================================================
📚 UNIVERSAL MEDICAL CODES (RxNorm, SNOMED, LOINC)
================================================================================

📂 Loaded 50000 rxnorm codes
  🔄 Inserting 50 batches (1000 codes per batch)
  ⏳ Progress: 100.0% (50000/50000 codes)
  ✅ Successfully inserted 50000 codes
  ⏱️  Processing time: 45.2s

📂 Loaded 100000 snomed codes
  ℹ️  25000 codes already exist (skipped duplicates)
  🔄 Inserting 100 batches (1000 codes per batch)
  ⏳ Progress: 100.0% (100000/100000 codes)
  ✅ Successfully inserted 75000 codes
  ℹ️  Skipped 25000 duplicates
  ⏱️  Processing time: 90.5s

... (remaining code systems)

================================================================================
🌏 REGIONAL MEDICAL CODES (PBS, MBS, ICD-10-AM)
================================================================================

📂 Loaded 3000 pbs codes
  🔄 Inserting 3 batches (1000 codes per batch)
  ⏳ Progress: 100.0% (3000/3000 codes)
  ✅ Successfully inserted 3000 codes
  ⏱️  Processing time: 2.1s

... (remaining regional systems)

================================================================================
📊 FINAL DATABASE POPULATION SUMMARY
================================================================================

Per-System Breakdown:
--------------------------------------------------------------------------------
  rxnorm       |  50000 /  50000 codes (100.0%)
  snomed       |  75000 / 100000 codes (75.0%)
                 | 25000 duplicates skipped
  loinc        |  50000 /  50000 codes (100.0%)
  pbs          |   3000 /   3000 codes (100.0%)
  mbs          |   5000 /   5000 codes (100.0%)
  icd10am      |  20000 /  20000 codes (100.0%)
--------------------------------------------------------------------------------
  TOTAL        | 203000 / 228000 codes (89.0%)
  Duplicates   | 25000
  Total Time   | 5.2 minutes
================================================================================
✅ Database population complete!
```

---

## 4. Database Tables

### Universal Medical Codes Table
Stores RxNorm, SNOMED-CT, and LOINC codes:

```sql
SELECT
  code_system,
  COUNT(*) as total_codes
FROM universal_medical_codes
GROUP BY code_system;

-- Expected output:
-- rxnorm  | 50000
-- snomed  | 100000
-- loinc   | 50000
```

### Regional Medical Codes Table
Stores PBS, MBS, and ICD-10-AM codes:

```sql
SELECT
  code_system,
  country_code,
  COUNT(*) as total_codes
FROM regional_medical_codes
GROUP BY code_system, country_code;

-- Expected output:
-- pbs       | AUS | 3000
-- mbs       | AUS | 5000
-- icd10_am  | AUS | 20000
```

---

## 5. Verify Data Loaded

### Check Total Record Counts
```sql
-- Universal codes
SELECT COUNT(*) FROM universal_medical_codes;
-- Expected: ~200,000

-- Regional codes
SELECT COUNT(*) FROM regional_medical_codes;
-- Expected: ~28,000
```

### Verify Embeddings Stored Correctly
```sql
-- Check embedding dimensions
SELECT
  code_system,
  vector_dims(embedding) as dimensions
FROM universal_medical_codes
LIMIT 1;

-- Expected: 1536 dimensions
```

### Verify Vector Indexes Active
```sql
-- Check indexes on universal_medical_codes
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'universal_medical_codes'
  AND indexname LIKE '%embedding%';

-- Expected: idx_universal_codes_embedding (IVFFlat)
```

### Test Vector Similarity Search
```sql
-- Test search function (requires an embedding vector)
SELECT * FROM search_universal_codes(
  '[0.1, 0.2, ...]'::vector(1536),  -- Sample embedding
  'medication'::text,
  20
);

-- Should return 20 medication codes sorted by similarity
```

---

## 6. Handling Duplicates

### Duplicate Detection Strategy
The script handles duplicates via unique constraints:

```sql
-- Universal codes unique constraint
UNIQUE(code_system, code_value)

-- Regional codes unique constraint
UNIQUE(code_system, code_value, country_code)
```

### Re-running Population
Safe to re-run the script - duplicates are automatically skipped:

```bash
# First run: Inserts 50,000 codes
npx tsx populate-database.ts --code-system=rxnorm

# Second run: Skips 50,000 duplicates
npx tsx populate-database.ts --code-system=rxnorm
# Output: "ℹ️  Skipped 50000 duplicates"
```

### Updating Existing Codes
To update codes (e.g., new library version):

```sql
-- Option 1: Delete and re-populate
DELETE FROM universal_medical_codes WHERE code_system = 'rxnorm';
-- Then re-run populate script

-- Option 2: Update specific fields
UPDATE universal_medical_codes
SET library_version = 'v2025Q2'
WHERE code_system = 'rxnorm' AND library_version = 'v2025Q1';
```

---

## 7. Performance Optimization

### Batch Size Tuning
Edit `populate-database.ts` line 29:

```typescript
batch: {
  size: 500,   // Reduce from 1000 if timeouts occur
  delayMs: 100,
},
```

**When to reduce batch size:**
- Supabase timeout errors
- Network instability
- Large embedding dimensions

### Disable Indexes During Bulk Insert (Advanced)
For faster initial population, temporarily drop indexes:

```sql
-- Drop vector index
DROP INDEX IF EXISTS idx_universal_codes_embedding;
DROP INDEX IF EXISTS idx_regional_codes_embedding;

-- Run populate-database.ts

-- Recreate vector index
CREATE INDEX idx_universal_codes_embedding
ON universal_medical_codes
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX idx_regional_codes_embedding
ON regional_medical_codes
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

**Warning:** Only do this on initial population, not production updates.

---

## 8. Error Handling

### Missing Embeddings Error
```
❌ Error: 1000 codes missing embeddings. Run generate-embeddings.ts first.
```

**Solution:**
```bash
# Generate embeddings first
npx tsx generate-embeddings.ts --code-system=rxnorm

# Then populate database
npx tsx populate-database.ts --code-system=rxnorm
```

### Supabase Connection Error
```
❌ Error: Failed to connect to Supabase
```

**Solution:**
1. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct
2. Check Supabase project status: https://supabase.com/dashboard
3. Test connection: `curl https://your-project.supabase.co/rest/v1/`

### Timeout Errors
```
❌ Batch insert failed: Request timeout
```

**Solution:**
1. Reduce batch size (see Performance Optimization)
2. Increase timeout in Supabase settings
3. Retry with smaller code system chunks

### Duplicate Key Violation (Expected)
```
ℹ️  Skipped 25000 duplicates
```

**Solution:** No action needed - this is expected behavior on re-runs

---

## 9. Validation Queries

### Check Code Distribution by Entity Type
```sql
SELECT
  entity_type,
  COUNT(*) as total_codes
FROM universal_medical_codes
GROUP BY entity_type
ORDER BY total_codes DESC;

-- Expected:
-- condition    | 100,000  (mostly SNOMED)
-- medication   | 50,000   (mostly RxNorm)
-- observation  | 50,000   (LOINC)
```

### Verify Active Codes
```sql
SELECT
  code_system,
  COUNT(*) FILTER (WHERE active = true) as active_codes,
  COUNT(*) FILTER (WHERE active = false) as inactive_codes
FROM universal_medical_codes
GROUP BY code_system;

-- All should be active (inactive_codes = 0)
```

### Check Library Versions
```sql
SELECT
  code_system,
  library_version,
  COUNT(*) as total_codes
FROM universal_medical_codes
GROUP BY code_system, library_version;

-- Expected: All codes have same version (e.g., v2025Q1)
```

---

## 10. Next Steps

After database population completes:

1. **Verify data integrity:**
   - Run validation queries above
   - Check record counts match expectations
   - Test vector similarity search functions

2. **Update Pass 1.5 Implementation Plan:**
   - Mark Phase 2 complete
   - Update cost estimates based on actual usage
   - Document any issues encountered

3. **Proceed to Phase 3 (Runtime Integration):**
   - Update Pass 1.5 worker code to use vector search
   - Test embedding text → vector search → code retrieval
   - Validate Pass 1.5 audit trail (pass15_code_candidates)

4. **Performance Testing:**
   - Benchmark vector search latency
   - Test concurrent search queries
   - Monitor pgvector index performance

---

## 11. Troubleshooting

### Problem: Database Population Takes Too Long
**Symptoms:** > 30 minutes for all codes

**Possible causes:**
- Large batch size
- Network latency
- Supabase free tier limits

**Solution:**
1. Reduce batch size to 500 or 250
2. Run on server closer to Supabase region
3. Upgrade Supabase plan for higher throughput

### Problem: Partial Population
**Symptoms:** Some code systems loaded, others failed

**Solution:**
1. Check console logs for specific error messages
2. Re-run with specific code system:
   ```bash
   npx tsx populate-database.ts --code-system=snomed
   ```
3. Duplicates are automatically skipped, safe to retry

### Problem: Vector Search Not Working After Population
**Symptoms:** `search_universal_codes()` returns no results

**Possible causes:**
- Vector index not created
- Wrong embedding dimensions
- RPC function not created

**Solution:**
```sql
-- 1. Verify vector index exists
SELECT * FROM pg_indexes
WHERE tablename = 'universal_medical_codes'
  AND indexname LIKE '%embedding%';

-- 2. Verify RPC function exists
SELECT proname FROM pg_proc
WHERE proname = 'search_universal_codes';

-- 3. Test manual vector search
SELECT code_system, code_value, display_name
FROM universal_medical_codes
ORDER BY embedding <=> '[0.1,0.2,...]'::vector(1536)
LIMIT 10;
```

---

## 12. Maintenance

### Quarterly Updates (RxNorm, SNOMED, LOINC)
When new medical code library versions are released:

1. **Mark old codes as deprecated:**
   ```sql
   UPDATE universal_medical_codes
   SET active = false,
       valid_to = CURRENT_DATE
   WHERE code_system = 'rxnorm'
     AND library_version = 'v2025Q1';
   ```

2. **Download new library version** (see DATA-ACQUISITION-GUIDE.md)

3. **Parse and embed new codes** with updated `library_version = 'v2025Q2'`

4. **Populate database** with new codes:
   ```bash
   npx tsx populate-database.ts --code-system=rxnorm
   ```

### Monthly Updates (PBS, MBS)
Same process as quarterly updates, but more frequent.

### Code Superseding
When a code is replaced by a newer code:

```sql
-- Mark old code as superseded
UPDATE universal_medical_codes
SET active = false,
    valid_to = CURRENT_DATE,
    superseded_by = '<new_code_uuid>'
WHERE code_value = '12345' AND code_system = 'rxnorm';
```

---

## 13. Support and Resources

### Supabase Documentation
- **PostgreSQL Functions:** https://supabase.com/docs/guides/database/functions
- **pgvector Guide:** https://supabase.com/docs/guides/ai/vector-embeddings
- **Service Role Key:** https://supabase.com/docs/guides/api/api-keys

### Database Schema Files
- **03_clinical_core.sql** - Medical code table definitions
- **04_ai_processing.sql** - pass15_code_candidates audit table
- **Migration 26** - Pass 1.5 versioning and RPC functions

### Debugging SQL
```sql
-- Enable query logging
SET log_statement = 'all';

-- Monitor long queries
SELECT pid, query_start, state, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;

-- Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE tablename IN ('universal_medical_codes', 'regional_medical_codes');
```

---

**Last Updated:** 2025-10-15
**Status:** Ready for database population
**Estimated Time:** 5-15 minutes for all 228K codes
**Database Size Impact:** ~300 MB (codes + embeddings)
