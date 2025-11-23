# LOINC Migration: Regional → Universal

## Current Status (2025-11-22)

**Supabase Maintenance Window:** Nov 21 23:00 UTC → Nov 23 23:00 UTC

**Database State:**
- Regional table: 102,891 LOINC records (complete, all columns)
- Universal table: 2,500 LOINC records (INCOMPLETE - missing Migration 60 columns)
- **Action required:** Delete incomplete records, re-migrate with complete schema

**Migration 60 Columns (added 2025-11-22):**
- `authority_required` - Generic prescription authority flag
- `sapbert_embedding` - VECTOR(768) for biomedical embeddings
- `sapbert_embedding_generated_at` - Timestamp
- `active_embedding_model` - 'openai' or 'sapbert'

## Migration Script: `migrate-loinc-final.ts`

**Features:**
- Ultra-conservative batch size: 500 records/batch
- 2-second delay between batches to avoid timeout
- Retry logic for transient failures
- Resume capability via START_OFFSET environment variable
- Memory-efficient streaming (no out-of-memory errors)
- Progress tracking with ETA
- Comprehensive verification

**Estimated Time:** ~690 seconds (~11.5 minutes) for 102,891 records

## Execution Steps

### 1. Wait for Supabase Maintenance to Complete

Check status: https://status.supabase.com/

Expected completion: **Nov 23, 2025 at 23:00 UTC**

### 2. Test Connectivity

```bash
SUPABASE_URL=https://napoydbbuvbpyciwjdci.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<your-key> \
npx tsx scripts/medical-codes/check-loinc-status.ts
```

### 3. Run Migration

```bash
cd /Users/xflanagan/Documents/GitHub/Guardian-Windsurf

SUPABASE_URL=https://napoydbbuvbpyciwjdci.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<your-key> \
npx tsx scripts/medical-codes/migrate-loinc-final.ts
```

**If migration fails mid-way**, resume from last successful offset:

```bash
START_OFFSET=50000 \
SUPABASE_URL=https://napoydbbuvbpyciwjdci.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<your-key> \
npx tsx scripts/medical-codes/migrate-loinc-final.ts
```

### 4. Verify Migration

```bash
SUPABASE_URL=https://napoydbbuvbpyciwjdci.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<your-key> \
npx tsx scripts/medical-codes/verify-loinc-final.ts
```

Expected output:
```
✓ Counts match!
✓ All Migration 60 columns present
✓ All embeddings preserved!
✓ Migration SUCCESSFUL - All checks passed!
```

### 5. Delete from Regional Table (AFTER VERIFICATION)

```sql
-- ONLY run after successful verification!
DELETE FROM regional_medical_codes WHERE code_system = 'loinc';
```

### 6. Create HNSW Vector Index

```sql
-- Create HNSW index for fast vector similarity search
CREATE INDEX IF NOT EXISTS idx_universal_codes_loinc_embedding_hnsw
ON universal_medical_codes
USING hnsw (embedding vector_cosine_ops)
WHERE code_system = 'loinc' AND embedding IS NOT NULL;
```

## Troubleshooting

### Issue: "Could not query the database for the schema cache"
**Cause:** Supabase is still in maintenance mode
**Solution:** Wait for maintenance window to complete

### Issue: "SQL query ran into an upstream timeout"
**Cause:** Batch size too large or database under load
**Solution:** Script already uses 500-record batches - should not timeout

### Issue: "JavaScript heap out of memory"
**Cause:** Trying to load too many records at once
**Solution:** Script uses streaming approach - should not happen

### Issue: Count mismatch after migration
**Cause:** Partial failure or duplicate prevention
**Solution:** Check logs for failed batches, re-run with START_OFFSET

## Migration History

**Previous Attempts:**
1. Single transaction INSERT (102,891 records) - ❌ Timeout
2. Batched INSERT (10,000 records/batch) - ❌ Timeout
3. Streaming API (fetch all, insert batches) - ❌ Out of memory (2GB heap limit)
4. Streaming API (500 records/batch) - ❌ Cloudflare 520 (Supabase maintenance)

**Current Approach:**
- Ultra-small batches (500 records)
- Memory-efficient streaming (fetch → insert → release)
- Retry logic for transient failures
- Resume capability
- **Status:** Ready to execute when Supabase is back online

## Next Steps After Migration

1. SNOMED CORE: Populate 6,820 codes to universal_medical_codes
2. RxNorm: Parse and populate to universal_medical_codes
3. SNOMED AU: Rename code_system, create lexical indexes
4. PBS: Generate embeddings, populate to regional_medical_codes
5. Pass 1.5: Implement two-tier search in worker
