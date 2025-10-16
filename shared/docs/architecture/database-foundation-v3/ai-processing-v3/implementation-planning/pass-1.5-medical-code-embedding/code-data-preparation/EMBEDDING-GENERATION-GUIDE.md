# Pass 1.5 Embedding Generation Guide

**Purpose:** Instructions for generating OpenAI embeddings for all medical codes

**Status:** Active - Phase 2 in progress

**Created:** 2025-10-15

---

## Overview

This guide explains how to use the `generate-embeddings.ts` script to create vector embeddings for all parsed medical codes.

### Prerequisites
1. ✅ Parsed JSON files exist in `data/medical-codes/<system>/processed/`
2. ✅ OpenAI API key available
3. ✅ Node.js and pnpm installed

### Expected Outcome
- All medical codes have 1536-dimensional embeddings
- Embeddings saved back to JSON files
- Cost estimate and statistics logged

---

## 1. Setup

### Install Dependencies
```bash
# From repository root
cd shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/code-data-preparation

# Install required packages
pnpm add openai fs-extra
pnpm add -D @types/node @types/fs-extra tsx
```

### Set OpenAI API Key
```bash
# Option 1: Environment variable
export OPENAI_API_KEY="sk-..."

# Option 2: .env file
echo "OPENAI_API_KEY=sk-..." > .env
```

---

## 2. Usage

### Generate Embeddings for Single Code System
```bash
# RxNorm only
npx tsx generate-embeddings.ts --code-system=rxnorm

# SNOMED-CT only
npx tsx generate-embeddings.ts --code-system=snomed

# LOINC only
npx tsx generate-embeddings.ts --code-system=loinc

# PBS only
npx tsx generate-embeddings.ts --code-system=pbs

# MBS only
npx tsx generate-embeddings.ts --code-system=mbs

# ICD-10-AM only
npx tsx generate-embeddings.ts --code-system=icd10am
```

### Generate Embeddings for All Code Systems
```bash
npx tsx generate-embeddings.ts --code-system=all
```

---

## 3. Expected Output

### Console Output Example
```
🚀 Starting Pass 1.5 Medical Code Embedding Generation
📊 Model: text-embedding-3-small (1536 dimensions)
💲 Pricing: $0.02 per 1M tokens

📂 Loaded 50000 rxnorm codes
  🔄 Processing 500 batches (100 codes per batch)
  ⏳ Progress: 100.0% (50000/50000 codes)
  ✅ Successfully embedded 50000 new codes
  💰 Estimated cost: $0.0025
  ⏱️  Processing time: 120.5s

📂 Loaded 100000 snomed codes
  ℹ️  25000 codes already have embeddings (skipping)
  🔄 Processing 750 batches (100 codes per batch)
  ⏳ Progress: 100.0% (75000/75000 codes)
  ✅ Successfully embedded 75000 new codes
  💰 Estimated cost: $0.0038
  ⏱️  Processing time: 180.2s

... (remaining code systems)

================================================================================
📊 FINAL EMBEDDING GENERATION SUMMARY
================================================================================

Per-System Breakdown:
--------------------------------------------------------------------------------
  rxnorm       |  50000 /  50000 codes (100.0%) | $0.0025
  snomed       | 100000 / 100000 codes (100.0%) | $0.0050
  loinc        |  50000 /  50000 codes (100.0%) | $0.0025
  pbs          |   3000 /   3000 codes (100.0%) | $0.0001
  mbs          |   5000 /   5000 codes (100.0%) | $0.0002
  icd10am      |  20000 /  20000 codes (100.0%) | $0.0010
--------------------------------------------------------------------------------
  TOTAL        | 228000 / 228000 codes (100.0%)
  Total Cost   | $0.0113
  Total Tokens | 570000
  Total Time   | 15.2 minutes
================================================================================
✅ Embedding generation complete!
```

### File Changes
```
data/medical-codes/
├── rxnorm/processed/rxnorm_codes.json      # Embeddings added
├── snomed/processed/snomed_codes.json      # Embeddings added
├── loinc/processed/loinc_codes.json        # Embeddings added
├── pbs/processed/pbs_codes.json            # Embeddings added
├── mbs/processed/mbs_codes.json            # Embeddings added
└── icd10am/processed/icd10am_codes.json    # Embeddings added
```

**JSON Structure (After Embedding):**
```json
[
  {
    "code_system": "rxnorm",
    "code_value": "205923",
    "display_name": "Atorvastatin 20 MG Oral Tablet",
    "entity_type": "medication",
    "search_text": "Atorvastatin 20 MG Oral Tablet",
    "library_version": "v2025Q1",
    "country_code": null,
    "region_specific_data": {},
    "embedding": [0.0234, -0.0456, 0.0123, ...] // 1536 numbers
  },
  ...
]
```

---

## 4. Configuration Options

### Modify Embedding Dimensions
Edit `generate-embeddings.ts` line 26:

```typescript
const CONFIG = {
  openai: {
    model: 'text-embedding-3-small',
    dimensions: 1024, // Change from 1536 to 1024 or 512
    batchSize: 100,
    maxRetries: 3,
    retryDelay: 1000,
  },
  // ...
};
```

**Trade-offs:**
- **1536 dimensions (default):** Best accuracy, 100% storage
- **1024 dimensions:** Minimal accuracy loss, 67% storage
- **512 dimensions:** Moderate accuracy loss, 33% storage

**Recommendation:** Start with 1536, benchmark 1024 in Phase 7

### Modify Batch Size
Edit `generate-embeddings.ts` line 28:

```typescript
batchSize: 50, // Reduce from 100 if hitting rate limits
```

**When to reduce:**
- Rate limit errors (429)
- API timeout errors
- Slower API responses

---

## 5. Cost Estimation

### OpenAI text-embedding-3-small Pricing (2025)
- **Rate:** $0.02 per 1 million tokens
- **Token approximation:** 1 token ≈ 4 characters

### Estimated Costs by Code System

| Code System | Records | Avg Text Length | Est. Tokens | Est. Cost |
|-------------|---------|-----------------|-------------|-----------|
| RxNorm | 50,000 | 40 chars | 500K | $0.01 |
| SNOMED | 100,000 | 30 chars | 750K | $0.015 |
| LOINC | 50,000 | 50 chars | 625K | $0.0125 |
| PBS | 3,000 | 35 chars | 26K | $0.0005 |
| MBS | 5,000 | 60 chars | 75K | $0.0015 |
| ICD-10-AM | 20,000 | 40 chars | 200K | $0.004 |
| **TOTAL** | **228,000** | - | **~2.2M** | **$0.044** |

**Expected total cost: ~$0.05 USD** (less than 5 cents!)

### Real-World Cost Example
From OpenAI API response:
```json
{
  "usage": {
    "prompt_tokens": 570000,
    "total_tokens": 570000
  }
}
```

Cost calculation: 570,000 tokens × $0.02 / 1,000,000 = **$0.0114 USD**

---

## 6. Resume Capability

The script automatically skips codes that already have embeddings.

### Use Case: Failed Batch
If the script crashes midway:
```bash
# Simply re-run the command
npx tsx generate-embeddings.ts --code-system=all

# Output will show:
#   ℹ️  25000 codes already have embeddings (skipping)
```

### Use Case: Add New Codes
After updating parsed JSON with new codes:
```bash
# Re-run embedding generation
npx tsx generate-embeddings.ts --code-system=rxnorm

# Only new codes without embeddings will be processed
```

---

## 7. Error Handling

### Rate Limit Errors (429)
**Error message:**
```
⚠️  Rate limit exceeded - Retrying in 2000ms (attempt 2/3)
```

**Solution:** Script automatically retries with exponential backoff (1s, 2s, 4s)

**If persistent:**
1. Reduce batch size in config
2. Check OpenAI API usage limits
3. Wait and retry later

### API Timeout Errors (500-599)
**Error message:**
```
⚠️  Internal server error - Retrying in 2000ms (attempt 2/3)
```

**Solution:** Script automatically retries

**If persistent:**
1. Check OpenAI status page: https://status.openai.com
2. Wait for service recovery
3. Resume using resume capability

### Invalid API Key
**Error message:**
```
❌ Error: OPENAI_API_KEY environment variable not set
```

**Solution:**
```bash
export OPENAI_API_KEY="sk-..."
```

### Missing Parsed Files
**Error message:**
```
❌ Parsed codes not found: data/medical-codes/rxnorm/processed/rxnorm_codes.json
```

**Solution:**
1. Run parsing scripts first (see `PARSING-STRATEGY.md`)
2. Verify file path is correct

---

## 8. Performance Optimization

### Parallel Processing (Future Enhancement)
Currently processes code systems sequentially. Can be parallelized:

```bash
# Terminal 1
npx tsx generate-embeddings.ts --code-system=rxnorm &

# Terminal 2
npx tsx generate-embeddings.ts --code-system=snomed &

# Terminal 3
npx tsx generate-embeddings.ts --code-system=loinc &
```

**Caveat:** Monitor OpenAI rate limits

### Batch Size Tuning
- **Larger batches (100):** Faster, but more likely to hit rate limits
- **Smaller batches (25-50):** Slower, but more reliable

### Network Optimization
- Run on server with stable connection
- Use AWS/GCP compute in same region as OpenAI API

---

## 9. Validation

### Verify Embeddings Generated
```bash
# Check file size increased
ls -lh data/medical-codes/rxnorm/processed/rxnorm_codes.json

# Before: ~5 MB
# After:  ~80 MB (embeddings add ~1.5 KB per code)
```

### Inspect Sample Embedding
```bash
# Use jq to inspect first code's embedding
cat data/medical-codes/rxnorm/processed/rxnorm_codes.json | jq '.[0].embedding'

# Expected output:
# [0.0234, -0.0456, 0.0123, ..., 0.0789]  (1536 numbers)
```

### Verify All Codes Have Embeddings
```typescript
// validation-script.ts
import * as fs from 'fs-extra';

const codes = await fs.readJson('data/medical-codes/rxnorm/processed/rxnorm_codes.json');
const missingEmbeddings = codes.filter(code => !code.embedding);

console.log(`Total codes: ${codes.length}`);
console.log(`Missing embeddings: ${missingEmbeddings.length}`);

if (missingEmbeddings.length > 0) {
  console.log('Codes missing embeddings:', missingEmbeddings.map(c => c.code_value));
}
```

---

## 10. Next Steps

After embedding generation completes:

1. **Verify embeddings:**
   - Check all JSON files have embeddings
   - Validate embedding dimensions (1536)
   - Confirm cost matches estimate

2. **Run database population:**
   - See `DATABASE-POPULATION.md`
   - Load codes into `universal_medical_codes` and `regional_medical_codes` tables
   - Create pgvector indexes

3. **Test vector search:**
   - Query sample medical codes
   - Verify similarity scores
   - Benchmark search performance

---

## 11. Troubleshooting

### Problem: Script Hangs
**Symptoms:** No progress for 5+ minutes

**Possible causes:**
- OpenAI API timeout
- Network connectivity issue
- Rate limit exceeded silently

**Solution:**
1. Cancel script (Ctrl+C)
2. Check OpenAI status: https://status.openai.com
3. Test API key: `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`
4. Resume with same command

### Problem: Embedding Dimensions Mismatch
**Error:** Database expects 1536 dimensions, got 1024

**Solution:**
1. Check `generate-embeddings.ts` config (line 26)
2. Ensure `dimensions: 1536` matches database schema
3. If changed, re-run embedding generation for consistency

### Problem: Cost Higher Than Expected
**Symptom:** Cost > $0.10 for all codes

**Possible causes:**
- Using wrong OpenAI model (text-embedding-ada-002 is 5x more expensive)
- Re-processing codes that already have embeddings
- Unusually long search_text fields

**Solution:**
1. Verify model: `text-embedding-3-small`
2. Check resume capability is working (should skip existing embeddings)
3. Inspect search_text lengths in parsed JSON

---

## 12. Support and Resources

### OpenAI Documentation
- **Embeddings Guide:** https://platform.openai.com/docs/guides/embeddings
- **API Reference:** https://platform.openai.com/docs/api-reference/embeddings
- **Pricing:** https://openai.com/pricing

### OpenAI Status
- **Status Page:** https://status.openai.com

### Contact
For issues with this script:
1. Check console error messages
2. Review OpenAI API logs in dashboard
3. Test with single code system before running `--code-system=all`

---

**Last Updated:** 2025-10-15
**Status:** Ready for embedding generation
**Estimated Time:** 15-30 minutes for all 228K codes
**Estimated Cost:** $0.05 USD
