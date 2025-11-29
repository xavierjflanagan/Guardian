# LOINC Embedding Generation Instructions

**Date:** 2025-11-01
**Status:** Ready to execute

## Overview

Generate OpenAI embeddings for 102,891 LOINC codes in the database.

**Architecture Decision:**
- **Model:** OpenAI text-embedding-3-small (1536 dimensions)
- **Rationale:** LOINC codes are observations/lab results, not medications
- **Research:** Experiment 2 showed OpenAI performs equally to SapBERT for non-medication entities
- **Strategy:** Simple vector search (no hybrid lexical+semantic needed)

## Prerequisites

1. LOINC codes populated in database (102,891 codes)
2. Supabase credentials in `.env.local`
3. OpenAI API key in `.env.local`

## Setup

### 1. Add OpenAI API Key

If you don't have an OpenAI API key yet:
1. Visit: https://platform.openai.com/api-keys
2. Create a new API key
3. Copy the key (starts with `sk-`)

Add to `.env.local`:
```bash
OPENAI_API_KEY=sk-your-key-here
```

### 2. Verify Dependencies

Dependencies are already installed:
- `openai` v4.20.1
- `@supabase/supabase-js` v2.78.0

## Execution

Run the script:
```bash
pnpm exec tsx scripts/generate-loinc-embeddings.ts
```

## Expected Output

```
LOINC Embedding Generation Script
==================================

Model: text-embedding-3-small
Dimensions: 1536
Batch size: 100
Pricing: $0.02 per 1M tokens

Fetching LOINC codes from database...
[OK] Found 102891 LOINC codes without embeddings

Entity type distribution:
   observation: 61043 (59.3%)
   lab_result: 39943 (38.8%)
   physical_finding: 1444 (1.4%)
   vital_sign: 461 (0.4%)

Processing 1029 batches...

   Batch 1/1029 (0.1%) - 100 codes... [OK] Updated 100/100
   Batch 2/1029 (0.2%) - 100 codes... [OK] Updated 100/100
   ...
   Batch 1029/1029 (100.0%) - 91 codes... [OK] Updated 91/91

============================================================
EMBEDDING GENERATION SUMMARY
============================================================
Total codes processed:       102891
Successfully updated:        102891
Failed:                      0
Total tokens used:           257,228
Estimated cost:              $0.0051 USD
Processing time:             987s (16m 27s)
============================================================

LOINC embeddings generated successfully!

Next Steps:
1. Verify embeddings in Supabase dashboard
2. Test vector search with sample LOINC queries
3. Create vector index for performance:
   CREATE INDEX ON regional_medical_codes
   USING ivfflat (openai_embedding vector_cosine_ops)
   WHERE code_system = 'loinc';
```

## Cost & Time Estimates

**Cost:** ~$0.04 USD (102,891 codes × ~25 chars avg)
**Time:** 15-20 minutes (depending on OpenAI API response times)

## Error Handling

The script handles:
- **Rate limits (429):** Automatic exponential backoff (2s, 4s, 8s)
- **Server errors (5xx):** Automatic retry with 2s delay
- **Network failures:** Graceful error messages

## Resume Capability

The script is idempotent:
- Only processes codes without embeddings (`openai_embedding IS NULL`)
- Re-running the script will skip already-processed codes
- Safe to run multiple times

## Verification

After completion, verify in Supabase:

```sql
-- Check completion status
SELECT
  COUNT(*) as total_codes,
  COUNT(openai_embedding) as with_embeddings,
  COUNT(*) - COUNT(openai_embedding) as missing_embeddings
FROM regional_medical_codes
WHERE code_system = 'loinc'
  AND country_code = 'AUS';

-- Expected result: 102,891 total, 102,891 with embeddings, 0 missing
```

## Next Steps After Embedding Generation

1. **Create vector index** for performance:
   ```sql
   CREATE INDEX regional_medical_codes_loinc_openai_embedding_idx
   ON regional_medical_codes
   USING ivfflat (openai_embedding vector_cosine_ops)
   WHERE code_system = 'loinc';
   ```

2. **Test vector search** with sample queries:
   ```sql
   SELECT
     code_value,
     display_name,
     entity_type,
     1 - (openai_embedding <=> '[your query embedding]'::vector) as similarity
   FROM regional_medical_codes
   WHERE code_system = 'loinc'
     AND country_code = 'AUS'
   ORDER BY openai_embedding <=> '[your query embedding]'::vector
   LIMIT 20;
   ```

3. **Update Pass 1.5 master plan** to mark LOINC as VALIDATED

4. **Document findings** in experiment log

## Architecture References

- **Master Plan:** `shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/PASS-1.5-MASTER-PLAN.md`
- **Experiment 2:** `pass1.5-testing/experiment-2/COMPREHENSIVE_ANALYSIS.md`
- **Embedding Guide:** `code-data-preparation/EMBEDDING-GENERATION-GUIDE.md`

## Troubleshooting

**Script hangs:**
- Check OpenAI status: https://status.openai.com
- Verify API key is valid
- Check network connection

**Rate limit errors persist:**
- Reduce `BATCH_SIZE` in script (currently 100)
- Check OpenAI API usage limits in dashboard
- Wait for quota reset (typically hourly)

**Database connection errors:**
- Verify Supabase credentials in `.env.local`
- Check Supabase project is running
- Verify service role key has write permissions

## Support

- **OpenAI API Docs:** https://platform.openai.com/docs/api-reference/embeddings
- **Pricing:** https://openai.com/pricing
- **Status:** https://status.openai.com
