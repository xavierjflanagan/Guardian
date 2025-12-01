# Experiment 8: Quick Start Guide

**Purpose**: Compare vector search vs lexical search for LOINC code matching

**Time Required**: ~1.5 hours for full execution

---

## Prerequisites

1. **Database**: 102,891 LOINC codes with embeddings
2. **Environment variables** in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
3. **Node.js + PNPM** installed

---

## Execution Steps

### Step 1: Navigate to project root

```bash
cd /Users/xflanagan/Documents/GitHub/Guardian-Windsurf
```

### Step 2: Run vector searches (45 minutes)

```bash
pnpm exec tsx shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/pass1.5-testing/experiment-8-vector-vs-lexical/scripts/run-vector-searches.ts
```

**What this does**:
- Generates 18 OpenAI embeddings (one per query)
- Executes 18 vector similarity searches
- Saves 18 individual result files + 1 aggregated file
- Each result contains top 20 codes with similarity scores

**Expected output**:
```
Experiment 8: Vector Search Execution
=====================================
...
Query 18/18 (abbreviation): "EKG ECG"
   Generating embedding for: "EKG ECG"
   ✓ Embedding generated (1536 dimensions)
   Executing vector search (top 20)...
   ✓ Found 20 LOINC codes
   ✓ Saved: vector-entity-6-abbreviation.json
   Top 3 results:
     1. [92.5%] 8601-7: EKG impression
     2. [89.3%] 18844-1: EKG impression Narrative
     3. [87.1%] 28010-7: Heart rate EKG

✓ Vector search execution complete
Next step: Run lexical search script
```

### Step 3: Run lexical searches (15 minutes)

```bash
pnpm exec tsx shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/pass1.5-testing/experiment-8-vector-vs-lexical/scripts/run-lexical-searches.ts
```

**What this does**:
- Executes 18 PostgreSQL full-text searches
- Saves 18 individual result files + 1 aggregated file
- Each result contains top 20 codes with relevance scores

**Expected output**:
```
Experiment 8: Lexical Search Execution
======================================
...
Query 18/18 (abbreviation): "EKG ECG"
   Executing lexical search (top 20)...
   Search terms: "ekg & ecg"
   ✓ Found 20 matching codes
   ✓ Saved: lexical-entity-6-abbreviation.json
   Top 3 results:
     1. [0.85] 8601-7: EKG impression
     2. [0.82] 18844-1: EKG impression Narrative
     3. [0.79] 9866-5: EKG Atrial rate

✓ Lexical search execution complete
Next step: Run comparison report script
```

### Step 4: Generate comparison report (5 minutes)

```bash
pnpm exec tsx shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/pass1.5-testing/experiment-8-vector-vs-lexical/scripts/generate-comparison-report.ts
```

**What this does**:
- Loads vector and lexical results
- Compares them side-by-side
- Calculates overlap, entity type accuracy
- Generates summary statistics

**Expected output**:
```
Experiment 8: Comparison Report Generation
==========================================

Entity 1 (clinical): "glucose serum plasma blood measurement"
  Overlap: 15/20 (75.0%)
  Vector only: 5, Lexical only: 5
  Entity type match: Vector=18/20, Lexical=19/20

...

COMPARISON SUMMARY
============================================================
Total queries analyzed:           18
Average overlap:                  68.5%
Avg entity type match (vector):   17.2/20
Avg entity type match (lexical):  18.3/20

By query type:
  Clinical:      75.2% overlap
  Layperson:     62.8% overlap
  Abbreviation:  67.5% overlap
============================================================

✓ Comparison report complete
Next step: Manual review by user
```

### Step 5: Manual review

Review the generated files:

1. **Vector results**: `results/vector-all-results.json`
2. **Lexical results**: `results/lexical-all-results.json`
3. **Comparison**: `analysis/comparison-report.json`
4. **Statistics**: `analysis/summary-stats.json`

For each query, identify which codes (from either vector or lexical) are clinically relevant.

---

## Output Files

After execution, you'll have:

```
experiment-8-vector-vs-lexical/
├── results/
│   ├── vector-entity-1-clinical.json      (20 codes, similarity scores)
│   ├── vector-entity-1-layperson.json
│   ├── vector-entity-1-abbreviation.json
│   ├── ... (18 vector files total)
│   ├── lexical-entity-1-clinical.json     (up to 20 codes, relevance scores)
│   ├── ... (18 lexical files total)
│   ├── vector-all-results.json            (aggregated vector)
│   └── lexical-all-results.json           (aggregated lexical)
└── analysis/
    ├── comparison-report.json             (side-by-side comparison)
    └── summary-stats.json                 (aggregate metrics)
```

---

## Validation Commands

**Verify all files created**:
```bash
cd shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/pass1.5-testing/experiment-8-vector-vs-lexical

# Should show 18
ls -1 results/vector-*.json | grep -v "all-results" | wc -l

# Should show 18
ls -1 results/lexical-*.json | grep -v "all-results" | wc -l

# Should all show 20
for f in results/vector-entity-*.json; do jq '.results | length' "$f"; done | sort -u

# Should show 2
ls -1 analysis/*.json | wc -l
```

**Sample a result**:
```bash
# Show top 5 vector results for glucose query
jq '.results[0:5] | .[] | {rank, code_value, display_name, similarity_score}' results/vector-entity-1-clinical.json

# Show top 5 lexical results for glucose query
jq '.results[0:5] | .[] | {rank, code_value, display_name, relevance_score}' results/lexical-entity-1-clinical.json
```

**Check overlap**:
```bash
# Show overlap for first query
jq '.[0] | {query, overlap_count, overlap_percentage, vector_only_count: (.analysis.vector_only_codes | length), lexical_only_count: (.analysis.lexical_only_codes | length)}' analysis/comparison-report.json
```

---

## Troubleshooting

### Error: "Missing OpenAI API key"

Add to `.env.local`:
```
OPENAI_API_KEY=sk-proj-...
```

### Error: "No LOINC codes with embeddings found"

Verify embeddings exist:
```sql
SELECT COUNT(*) FROM regional_medical_codes
WHERE code_system = 'loinc' AND embedding IS NOT NULL;
-- Should return: 102891
```

If 0, run embedding generation first.

### Error: "No matching codes found" (lexical search)

Some queries may be too specific or use terms not in LOINC. This is expected - the lexical result file will have fewer than 20 codes.

### Error: "Rate limit exceeded" (OpenAI)

Increase delay in `run-vector-searches.ts` line 280:
```typescript
await new Promise(resolve => setTimeout(resolve, 200)); // Was 100
```

---

## Cost Estimate

- **OpenAI embeddings**: 18 queries × ~15 tokens = ~270 tokens × $0.02/1M = $0.0000054 (~0.5 cents)
- **Database queries**: Free (using existing Supabase plan)

**Total cost**: < 1 cent

---

## Timeline

- Vector searches: 45 min (18 queries × ~2.5 min each)
- Lexical searches: 15 min (18 queries × ~0.5 min each)
- Comparison report: 5 min
- Manual review: 30-60 min (user dependent)

**Total**: ~1.5-2 hours

---

## Success Criteria

**Experiment succeeds when**:
- All 36 search result files created (18 vector + 18 lexical)
- Comparison report shows meaningful overlap analysis
- User completes manual review identifying relevant codes

**This experiment does NOT test absolute accuracy** - it compares two methods to determine which finds better results.

