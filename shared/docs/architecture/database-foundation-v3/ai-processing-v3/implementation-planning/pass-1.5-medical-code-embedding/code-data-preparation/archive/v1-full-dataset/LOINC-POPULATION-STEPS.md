# LOINC Population Steps

## Prerequisites
- LOINC codes parsed: `data/medical-codes/loinc/processed/loinc_codes.json` (102,891 codes)
- Supabase credentials in `.env.local` (auto-loaded by script)

## Step 1: Update Database Constraint

The `regional_medical_codes` table needs to allow 'loinc' and 'snomed_ct' code systems.

### Option A: Run SQL in Supabase SQL Editor

1. Open Supabase dashboard
2. Go to SQL Editor
3. Copy and paste from `scripts/add-loinc-to-regional-codes.sql`:

```sql
-- Drop existing constraint
ALTER TABLE regional_medical_codes
DROP CONSTRAINT IF EXISTS regional_medical_codes_code_system_check;

-- Add comprehensive constraint with all code systems
ALTER TABLE regional_medical_codes
ADD CONSTRAINT regional_medical_codes_code_system_check
CHECK (code_system IN (
  -- Australian
  'pbs', 'mbs', 'icd10_am', 'loinc', 'snomed_ct', 'tga',
  -- UK
  'nhs_dmd', 'bnf',
  -- US
  'ndc', 'cpt', 'rxnorm', 'hcpcs', 'cvx', 'npi',
  -- Germany
  'pzn', 'icd10_gm',
  -- Canada
  'din',
  -- France
  'cip', 'ansm',
  -- International/WHO
  'atc', 'icd10', 'icd11', 'ucum'
));
```

4. Click "Run"
5. Verify: Should see "Success. No rows returned"

## Step 2: Populate LOINC Codes

Run the population script (no embeddings yet):

```bash
cd /Users/xflanagan/Documents/GitHub/Guardian-Windsurf
pnpm exec tsx scripts/populate-loinc-no-embeddings.ts
```

### Expected Output:
```
[OK] Loaded credentials from .env.local

LOINC Population Script (No Embeddings)
==========================================

Loading LOINC codes from: .../loinc_codes.json
[OK] Loaded 102891 LOINC codes

Transforming to database format...
[OK] Transformed 102891 rows

Inserting into Supabase (batch size: 500)...
   Batch 1/206 (500 codes)... [OK] Upserted 500
   Batch 2/206 (500 codes)... [OK] Upserted 500
   ...
   Batch 206/206 (391 codes)... [OK] Upserted 391

============================================================
POPULATION SUMMARY
============================================================
Total codes processed:  102891
Successfully upserted:  102891
Failed:                 0
============================================================
Note: Upsert updates existing rows, so re-runs are safe.

LOINC codes populated successfully!

Next Steps:
1. Open Supabase dashboard and inspect regional_medical_codes table
2. Filter by code_system = "loinc" AND country_code = "AUS"
3. Verify columns: search_text, entity_type, region_specific_data
4. Confirm what you want embedded (search_text field)
5. Run: npx tsx generate-embeddings.ts --code-system=loinc
6. Embeddings will be added via UPDATE statements
```

### Expected Time:
- ~5-10 minutes for 102,891 codes
- 206 batches of 500 codes each

## Step 3: Inspect in Supabase

1. Open Supabase dashboard
2. Table Editor → regional_medical_codes
3. Add filters:
   - `code_system` equals `loinc`
   - `country_code` equals `AUS`
4. Check sample rows:
   - `search_text` - What will be embedded
   - `entity_type` - vital_sign, lab_result, observation, physical_finding
   - `region_specific_data` → `synonyms` - Array of synonyms
   - `embedding` - Should be NULL (will add later)

## Step 4: Generate Embeddings - COMPLETED 2025-11-01

Embeddings generated successfully using OpenAI text-embedding-3-small (1536 dimensions).

```bash
# Run the embedding generation script
pnpm exec tsx scripts/generate-loinc-embeddings.ts
```

### Completion Statistics:
- Total LOINC codes: 102,891
- Successfully embedded: 102,891 (100%)
- Model: text-embedding-3-small
- Text source: display_name (clean clinical terminology)
- Processing time: 5 hours 51 minutes
- Actual cost: $0.0307 USD
- Tokens used: 1,534,304

### Architecture Decision:
Used `display_name` field instead of `search_text` for embeddings because:
- LOINC codes are observations/lab results (not medications)
- Experiment 2 showed: OpenAI performs equally to SapBERT for non-medication entities
- Clean, normalized text produces better embeddings than verbose text with repetitions
- display_name provides focused semantic signal without noise

### Vector Index:
The existing `idx_regional_codes_vector` index covers all code systems including LOINC.
No additional index needed - vector similarity search is production-ready.

## Troubleshooting

### Error: "violates check constraint"
- Step 1 SQL not run yet. Run the ALTER TABLE command first.

### Error: "duplicate key value"
- LOINC codes already exist. The script now uses **upsert** which automatically handles duplicates.
- Simply re-run the script - it will update existing rows safely.

**DANGER - Only if you need to completely remove LOINC and start fresh:**
```sql
-- WARNING: DESTRUCTIVE! This permanently deletes ALL LOINC data!
-- Only run in dev/testing environments!
-- Cannot be undone!
DELETE FROM regional_medical_codes WHERE code_system = 'loinc';
```

**Safer approach:** Just re-run the population script - upsert will update existing rows.

### Error: "Missing Supabase credentials"
- Check `.env.local` exists and contains:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
