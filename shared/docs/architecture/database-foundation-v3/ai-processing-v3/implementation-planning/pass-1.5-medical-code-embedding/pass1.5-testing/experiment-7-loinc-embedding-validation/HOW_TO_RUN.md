# How to Run Experiment 7: LOINC Embedding Validation

## Prerequisites

### Environment Setup
1. Supabase credentials in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. OpenAI API key in `.env.local`:
   - `OPENAI_API_KEY` (for query embedding generation)
3. Node/PNPM installed
4. LOINC codes populated in database (102,891 codes with embeddings)

### Verify LOINC Data
```bash
# Check LOINC code count
psql -h your-supabase-host -d postgres -c \
  "SELECT COUNT(*) FROM regional_medical_codes WHERE code_system = 'loinc' AND embedding IS NOT NULL;"

# Expected: 102891
```

---

## Phase 1: Establish Ground Truth

**Goal:** Manually identify correct LOINC codes for 40 test entities

### Step 1.1: Create Test Entity List

Navigate to project root:
```bash
cd /Users/xflanagan/Documents/GitHub/Guardian-Windsurf
```

Create test data file structure:
```bash
mkdir -p shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/pass1.5-testing/experiment-7-loinc-embedding-validation/test-data
```

### Step 1.2: Manual LOINC Review

For each of the 40 test entities, use Supabase SQL Editor to find correct matches:

Example (Blood glucose):
```sql
SELECT
  code_value,
  display_name,
  entity_type,
  search_text
FROM regional_medical_codes
WHERE code_system = 'loinc'
  AND country_code = 'AUS'
  AND (
    display_name ILIKE '%glucose%'
    AND (
      display_name ILIKE '%blood%'
      OR display_name ILIKE '%serum%'
      OR display_name ILIKE '%plasma%'
    )
  )
ORDER BY display_name
LIMIT 20;
```

Document findings in `test-data/ground-truth.json`:
```json
{
  "entities": [
    {
      "id": 1,
      "entity_text": "Blood glucose measurement",
      "category": "lab_test",
      "search_variants": [
        {
          "variant_type": "clinical",
          "query": "glucose serum plasma blood",
          "expected_entity_type": "lab_result"
        },
        {
          "variant_type": "layperson",
          "query": "blood sugar level test",
          "expected_entity_type": "lab_result"
        },
        {
          "variant_type": "abbreviation",
          "query": "BG BSL",
          "expected_entity_type": "lab_result"
        }
      ],
      "ground_truth_matches": [
        {
          "rank": "perfect",
          "loinc_codes": ["2345-7", "2339-0", "14743-9"],
          "rationale": "Direct glucose measurement in blood/serum/plasma"
        },
        {
          "rank": "good",
          "loinc_codes": ["1558-6", "32016-8"],
          "rationale": "Fasting glucose, random glucose"
        },
        {
          "rank": "acceptable",
          "loinc_codes": ["20436-2"],
          "rationale": "Glucose tolerance test related"
        }
      ]
    }
  ]
}
```

**Estimated time:** 2-3 hours for 40 entities

---

## Phase 2: Develop Test Scripts

### Step 2.1: Create Test Script

Create `scripts/test-loinc-vector-search.ts`:

```typescript
import * as fs from 'fs-extra';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface SearchResult {
  entityId: number;
  entityText: string;
  variantType: string;
  query: string;
  results: Array<{
    rank: number;
    code_value: string;
    display_name: string;
    entity_type: string;
    similarity: number;
  }>;
  topKAccuracy: {
    top1: boolean;
    top5: boolean;
    top10: boolean;
  };
}

async function generateQueryEmbedding(query: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
    dimensions: 1536,
  });
  return response.data[0].embedding;
}

async function searchLOINC(query: string, limit: number = 10): Promise<any[]> {
  // Generate embedding
  const embedding = await generateQueryEmbedding(query);

  // Vector search
  const { data, error } = await supabase
    .from('regional_medical_codes')
    .select('code_value, display_name, entity_type')
    .eq('code_system', 'loinc')
    .eq('country_code', 'AUS')
    .order('embedding <=> $1', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data;
}

async function main() {
  // Load ground truth
  const groundTruth = await fs.readJSON('test-data/ground-truth.json');

  const results: SearchResult[] = [];

  for (const entity of groundTruth.entities) {
    for (const variant of entity.search_variants) {
      console.log(`Testing: ${entity.entity_text} (${variant.variant_type})`);

      const searchResults = await searchLOINC(variant.query, 10);

      // Calculate accuracy
      const perfectMatches = entity.ground_truth_matches
        .find(m => m.rank === 'perfect')?.loinc_codes || [];

      const top1Match = perfectMatches.includes(searchResults[0]?.code_value);
      const top5Match = searchResults.slice(0, 5)
        .some(r => perfectMatches.includes(r.code_value));
      const top10Match = searchResults.slice(0, 10)
        .some(r => perfectMatches.includes(r.code_value));

      results.push({
        entityId: entity.id,
        entityText: entity.entity_text,
        variantType: variant.variant_type,
        query: variant.query,
        results: searchResults.map((r, i) => ({ rank: i + 1, ...r })),
        topKAccuracy: {
          top1: top1Match,
          top5: top5Match,
          top10: top10Match,
        },
      });

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Save results
  await fs.writeJSON('results/search-results-raw.json', results, { spaces: 2 });

  // Calculate aggregate metrics
  const metrics = {
    totalQueries: results.length,
    top1Accuracy: results.filter(r => r.topKAccuracy.top1).length / results.length,
    top5Accuracy: results.filter(r => r.topKAccuracy.top5).length / results.length,
    top10Accuracy: results.filter(r => r.topKAccuracy.top10).length / results.length,
  };

  await fs.writeJSON('results/accuracy-metrics.json', metrics, { spaces: 2 });

  console.log('\\nMetrics:');
  console.log(`Top-1 accuracy: ${(metrics.top1Accuracy * 100).toFixed(1)}%`);
  console.log(`Top-5 accuracy: ${(metrics.top5Accuracy * 100).toFixed(1)}%`);
  console.log(`Top-10 accuracy: ${(metrics.top10Accuracy * 100).toFixed(1)}%`);
}

main().catch(console.error);
```

**Estimated time:** 3-4 hours

---

## Phase 3: Execute Experiment

### Step 3.1: Run Test Script

```bash
cd /Users/xflanagan/Documents/GitHub/Guardian-Windsurf
pnpm exec tsx shared/docs/.../experiment-7-loinc-embedding-validation/scripts/test-loinc-vector-search.ts
```

Expected output:
```
Testing: Blood glucose measurement (clinical)
Testing: Blood glucose measurement (layperson)
Testing: Blood glucose measurement (abbreviation)
...
Testing: MRI brain findings (abbreviation)

Metrics:
Top-1 accuracy: 65.0%
Top-5 accuracy: 78.3%
Top-10 accuracy: 87.5%
```

**Estimated time:** 30 minutes (120 queries × ~15 seconds)

---

## Phase 4: Analyze Results

### Step 4.1: Review Failures

Manually inspect `results/search-results-raw.json` for failures:
- Which entities failed?
- Which query types (clinical/layperson/abbreviation) struggled?
- Are failures due to:
  - Missing ground truth codes?
  - Embedding quality issues?
  - LOINC data ambiguity?

### Step 4.2: Generate Reports

Create analysis scripts:
- `scripts/analyze-entity-distribution.ts` - Entity type precision
- `scripts/generate-confusion-matrix.ts` - Cross-category confusion
- `scripts/failure-analysis.ts` - Detailed failure patterns

### Step 4.3: Write Summary

Document findings in `RESULTS_SUMMARY.md`:
- Overall metrics
- Success patterns
- Failure patterns
- Recommendations
- Go/no-go decision for SNOMED CT

**Estimated time:** 2-3 hours

---

## Success Criteria

Target metrics:
- Top-1 accuracy: ≥60%
- Top-5 accuracy: ≥75%
- **Top-10 accuracy: ≥85%** (primary target)
- Entity type precision: ≥90%
- Layperson within 10% of clinical

If targets met: LOINC semantic search validated for Pass 1.5 integration.

---

## Troubleshooting

### Error: "Missing OpenAI API key"
Add to `.env.local`:
```
OPENAI_API_KEY=sk-...
```

### Error: "No LOINC codes found"
Verify LOINC population:
```sql
SELECT COUNT(*) FROM regional_medical_codes
WHERE code_system = 'loinc' AND embedding IS NOT NULL;
```

### Error: "Rate limit exceeded"
Increase delay between queries in script (line with `setTimeout`).

---

## Next Steps

After completion:
1. Review results with team
2. Make go/no-go decision on SNOMED CT
3. If successful: Proceed with SNOMED CT implementation
4. If unsuccessful: Investigate alternative strategies (hybrid search, different embedding model)
