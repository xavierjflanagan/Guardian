# LOINC Migration - Execution Summary

## Ready for Execution (When Supabase Maintenance Completes)

**Created:** 2025-11-22
**Status:** Scripts ready, awaiting Supabase maintenance completion
**Maintenance Window:** Nov 21 23:00 UTC → Nov 23 23:00 UTC

## Production Files Created

```
scripts/medical-codes/
├── migrate-loinc-final.ts           (7.8K) - Production migration script
├── verify-loinc-final.ts            (3.7K) - Production verification script
└── LOINC-MIGRATION-README.md        (4.2K) - Complete documentation
```

## Quick Start (After Maintenance)

### 1. Execute Migration

```bash
cd /Users/xflanagan/Documents/GitHub/Guardian-Windsurf

SUPABASE_URL=https://napoydbbuvbpyciwjdci.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hcG95ZGJidXZicHljaXdqZGNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTY3Nzk4NCwiZXhwIjoyMDY3MjUzOTg0fQ.EgNVgaVfhAdH4AvPFBGfuqRzRPTvvF83c_6cdSY7oFI \
npx tsx scripts/medical-codes/migrate-loinc-final.ts
```

**Expected Time:** ~11.5 minutes (206 batches × 500 records)

### 2. Verify Migration

```bash
SUPABASE_URL=https://napoydbbuvbpyciwjdci.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hcG95ZGJidXZicHljaXdqZGNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTY3Nzk4NCwiZXhwIjoyMDY3MjUzOTg0fQ.EgNVgaVfhAdH4AvPFBGfuqRzRPTvvF83c_6cdSY7oFI \
npx tsx scripts/medical-codes/verify-loinc-final.ts
```

**Expected Output:**
```
✓ Counts match!
✓ All Migration 60 columns present
✓ All embeddings preserved!
✓ Migration SUCCESSFUL - All checks passed!
```

## Migration Details

**What Will Happen:**
1. Delete 2,500 incomplete LOINC records from universal_medical_codes
2. Migrate all 102,891 LOINC records with complete schema (including Migration 60 columns)
3. Verify counts, schema, and embeddings
4. Display sample records

**Safety Features:**
- Ultra-small batches (500 records) to avoid timeout
- 2-second delays between batches to prevent database overload
- Retry logic for transient failures
- Resume capability via START_OFFSET environment variable
- Memory-efficient streaming (no out-of-memory errors)
- Comprehensive logging with progress tracking

**Resume on Failure:**
If migration fails mid-way, resume from last successful offset:
```bash
START_OFFSET=50000 npx tsx scripts/medical-codes/migrate-loinc-final.ts
```

## What Was Fixed

### Problem Identified
- **Root Cause:** 2,500 LOINC records were migrated before Migration 60
- **Issue:** Missing 4 columns (authority_required, sapbert_embedding, sapbert_embedding_generated_at, active_embedding_model)
- **Impact:** Schema mismatch preventing proper data usage

### Migration 60 (Executed 2025-11-22)
Added 4 columns to universal_medical_codes:
```sql
ALTER TABLE universal_medical_codes
ADD COLUMN authority_required BOOLEAN DEFAULT FALSE;
ADD COLUMN sapbert_embedding VECTOR(768);
ADD COLUMN sapbert_embedding_generated_at TIMESTAMPTZ;
ADD COLUMN active_embedding_model VARCHAR(20) DEFAULT 'openai';
```

### Previous Failed Attempts
1. Single transaction (102,891 records) → Timeout
2. Batched SQL (10,000 records/batch) → Timeout
3. Streaming all records → Out of memory (2GB heap)
4. Streaming batches → Cloudflare 520 (Supabase maintenance)

### Final Solution
- Ultra-conservative 500-record batches
- Memory-efficient streaming
- Retry logic for transient errors
- Resume capability for interruptions

## Next Steps After Successful Migration

1. Delete LOINC from regional_medical_codes (frees up space)
2. Create HNSW vector index on universal_medical_codes
3. Populate SNOMED CORE (6,820 codes) to universal_medical_codes
4. Parse and populate RxNorm to universal_medical_codes
5. Implement two-tier search in Pass 1.5 worker

## Troubleshooting

**Check Supabase Status:**
https://status.supabase.com/

**Check Database Connectivity:**
```bash
SUPABASE_URL=https://napoydbbuvbpyciwjdci.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<your-key> \
npx tsx -e "import {createClient} from '@supabase/supabase-js'; const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); s.from('regional_medical_codes').select('count').limit(1).then(r => console.log(r.error ? 'ERROR: ' + r.error.message : 'CONNECTED'))"
```

**Common Issues:**
- "Could not query database" → Maintenance still in progress
- "Timeout" → Should not happen with 500-record batches
- "Out of memory" → Should not happen with streaming approach

## Files Cleaned Up

Deleted obsolete migration attempts:
- batched-migrate-loinc.sql (11K) - Timed out
- check-loinc-direct.ts (1.7K) - Temporary diagnostic
- check-loinc-status.ts (1.3K) - Temporary diagnostic
- clean-migrate-loinc.sql (2.8K) - Timed out
- execute-loinc-migration.ts (4.8K) - Wrong RPC function
- migrate-loinc-sql.sql (2.8K) - Timed out
- verify-loinc-migration.ts (3.2K) - Superseded

## Success Criteria

Migration is successful when:
- ✓ Regional count = Universal count (102,891 = 102,891)
- ✓ All Migration 60 columns present in sample records
- ✓ 100% embedding preservation
- ✓ No errors in verification output

---

**Ready to execute when Supabase maintenance completes!**
