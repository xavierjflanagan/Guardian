# Pass 1.5 Session Plan - October 21, 2025

## Quick Context

**Previous Session (2025-10-20):** Completed Phase 0 validation and discovered pure vector search is insufficient for medical code matching. Pivoting to hybrid retrieval (lexical + vector) architecture.

**Session Goal:** Implement hybrid search RPC functions and begin extended validation

## Where We Left Off

### Completed ✅
- 100% of medical codes normalized (20,382 codes)
- 100% of embeddings generated ($0.01 cost)
- Validation tests for medications (5 cases) and procedures (5 cases)
- Comprehensive documentation of findings

### Critical Discovery ✅
Pure vector embeddings cluster by semantic class (drug class + dose + form) rather than specific ingredient/anatomy:
- **Medications:** "Amoxicillin 500mg" returns Dicloxacillin instead (wrong antibiotic)
- **Procedures:** "Skin biopsy" returns lymph node biopsies instead (wrong anatomy)
- **Success rate:** 40% (unacceptable for production)

### Decision ✅
PIVOT to hybrid retrieval: 70% lexical matching + 30% vector reranking

## Session Objectives

### Primary Goals
1. Implement hybrid search RPC function for medications
2. Create comprehensive medication test set (100 cases)
3. Validate hybrid approach achieves >95% accuracy

### Secondary Goals
4. Implement hybrid search for procedures
5. Begin performance optimization
6. Update Pass 1.5 implementation plan

## Implementation Plan

### Step 1: Hybrid Search RPC Function (Medications)

**Database Function:** `search_medications_hybrid()`

```sql
CREATE OR REPLACE FUNCTION search_medications_hybrid(
    query_text TEXT,
    max_results INTEGER DEFAULT 20,
    min_lexical_score REAL DEFAULT 0.3,
    min_vector_score REAL DEFAULT 0.3,
    lexical_weight REAL DEFAULT 0.7,
    vector_weight REAL DEFAULT 0.3
) RETURNS TABLE (
    code_system VARCHAR(20),
    code_value VARCHAR(50),
    display_name TEXT,
    normalized_text TEXT,
    lexical_score REAL,
    vector_score REAL,
    combined_score REAL,
    match_type TEXT  -- 'exact_code', 'ingredient_match', 'fuzzy_match', 'semantic_match'
) AS $$
DECLARE
    query_embedding VECTOR(1536);
    extracted_ingredient TEXT;
    extracted_dose TEXT;
    extracted_form TEXT;
BEGIN
    -- Step 1: Extract key terms from query
    extracted_ingredient := extract_ingredient(query_text);  -- e.g., "amoxicillin"
    extracted_dose := extract_dose(query_text);              -- e.g., "500mg"
    extracted_form := extract_form(query_text);              -- e.g., "capsule"

    -- Step 2: Lexical filtering and scoring
    WITH lexical_candidates AS (
        SELECT
            rmc.code_system,
            rmc.code_value,
            rmc.display_name,
            rmc.normalized_embedding_text as normalized_text,
            rmc.normalized_embedding,
            -- Lexical scoring components
            CASE
                -- Exact PBS code match
                WHEN rmc.code_value = query_text THEN 1.0
                -- Exact ingredient + dose match
                WHEN rmc.normalized_embedding_text ILIKE '%' || extracted_ingredient || '%'
                     AND rmc.normalized_embedding_text ILIKE '%' || extracted_dose || '%' THEN 0.9
                -- Ingredient match only
                WHEN rmc.normalized_embedding_text ILIKE '%' || extracted_ingredient || '%' THEN 0.7
                -- Fuzzy text similarity
                ELSE similarity(rmc.normalized_embedding_text, query_text)
            END as base_lexical_score,
            -- Boost standalone formulations
            CASE
                WHEN rmc.display_name NOT LIKE '%+%' THEN 0.1
                ELSE 0.0
            END as standalone_boost,
            -- Boost exact dose matches
            CASE
                WHEN rmc.normalized_embedding_text ILIKE '%' || extracted_dose || '%' THEN 0.05
                ELSE 0.0
            END as dose_boost
        FROM regional_medical_codes rmc
        WHERE rmc.active = TRUE
            AND rmc.entity_type = 'medication'
            AND rmc.country_code = 'AUS'
            AND rmc.code_system = 'pbs'
            AND rmc.normalized_embedding IS NOT NULL
            -- Lexical pre-filter (performance optimization)
            AND (
                rmc.code_value = query_text  -- Exact code match
                OR rmc.normalized_embedding_text ILIKE '%' || extracted_ingredient || '%'
                OR similarity(rmc.normalized_embedding_text, query_text) > min_lexical_score
            )
    ),
    scored_candidates AS (
        SELECT
            *,
            (base_lexical_score + standalone_boost + dose_boost) as lexical_score
        FROM lexical_candidates
        WHERE (base_lexical_score + standalone_boost + dose_boost) >= min_lexical_score
    )

    -- Step 3: Vector reranking on filtered subset
    SELECT
        sc.code_system,
        sc.code_value,
        sc.display_name,
        sc.normalized_text,
        sc.lexical_score,
        -- Vector similarity (only if embedding provided)
        COALESCE(
            1 - (sc.normalized_embedding <=> query_embedding),
            0.0
        ) as vector_score,
        -- Combined score
        (lexical_weight * sc.lexical_score) +
        (vector_weight * COALESCE(1 - (sc.normalized_embedding <=> query_embedding), 0.0))
            as combined_score,
        -- Match type classification
        CASE
            WHEN sc.code_value = query_text THEN 'exact_code'
            WHEN sc.base_lexical_score >= 0.9 THEN 'ingredient_match'
            WHEN sc.base_lexical_score >= 0.7 THEN 'fuzzy_match'
            ELSE 'semantic_match'
        END as match_type
    FROM scored_candidates sc
    ORDER BY combined_score DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;
```

### Step 2: Term Extraction Helper Functions

**Ingredient Extraction:**
```sql
CREATE OR REPLACE FUNCTION extract_ingredient(query TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Remove common dose patterns
    query := regexp_replace(query, '\d+\s*(mg|g|ml|mcg|micrograms?)', '', 'gi');
    -- Remove common form patterns
    query := regexp_replace(query, '\b(tablet|capsule|injection|syrup|cream|ointment)\b', '', 'gi');
    -- Trim and lowercase
    RETURN TRIM(LOWER(query));
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

**Dose Extraction:**
```sql
CREATE OR REPLACE FUNCTION extract_dose(query TEXT)
RETURNS TEXT AS $$
DECLARE
    dose_match TEXT;
BEGIN
    -- Extract dose pattern (e.g., "500mg", "2.5g")
    dose_match := (regexp_matches(query, '(\d+(?:\.\d+)?)\s*(mg|g|ml|mcg|micrograms?)', 'i'))[1];
    IF dose_match IS NOT NULL THEN
        RETURN dose_match;
    END IF;
    RETURN '';
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### Step 3: Enable pg_trgm Extension

```sql
-- Enable fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index on normalized_embedding_text for fast similarity searches
CREATE INDEX IF NOT EXISTS idx_regional_codes_normalized_text_trgm
ON regional_medical_codes
USING gin (normalized_embedding_text gin_trgm_ops)
WHERE entity_type = 'medication';
```

### Step 4: Create Comprehensive Test Set

**Medication Test Set (100 cases):**

```typescript
// test-hybrid-retrieval-medications.ts
interface MedicationTestCase {
  query: string;
  expectedIngredient: string;
  expectedCode?: string;  // PBS code if known
  expectedFormulation: 'standalone' | 'combination' | 'any';
  expectedDose?: string;
  category: 'common' | 'typo' | 'abbreviation' | 'edge_case' | 'exact_code';
}

const MEDICATION_TEST_CASES: MedicationTestCase[] = [
  // Common medications (40 cases)
  { query: 'Paracetamol 500mg', expectedIngredient: 'paracetamol', expectedFormulation: 'standalone', expectedDose: '500mg', category: 'common' },
  { query: 'Amoxicillin 500mg', expectedIngredient: 'amoxicillin', expectedFormulation: 'standalone', expectedDose: '500mg', category: 'common' },
  { query: 'Metformin 500mg', expectedIngredient: 'metformin', expectedFormulation: 'standalone', expectedDose: '500mg', category: 'common' },
  { query: 'Atorvastatin 40mg', expectedIngredient: 'atorvastatin', expectedFormulation: 'standalone', expectedDose: '40mg', category: 'common' },
  // ... 36 more common cases

  // Typos and variations (20 cases)
  { query: 'Paracetomol 500mg', expectedIngredient: 'paracetamol', expectedFormulation: 'standalone', category: 'typo' },
  { query: 'Amoxycillin 500mg', expectedIngredient: 'amoxicillin', expectedFormulation: 'standalone', category: 'typo' },
  // ... 18 more typo cases

  // Abbreviations (15 cases)
  { query: 'ACE inhibitor 10mg', expectedIngredient: 'perindopril', expectedFormulation: 'any', category: 'abbreviation' },
  { query: 'PPI 40mg', expectedIngredient: 'pantoprazole', expectedFormulation: 'any', category: 'abbreviation' },
  // ... 13 more abbreviation cases

  // Edge cases (15 cases)
  { query: 'Insulin', expectedIngredient: 'insulin', expectedFormulation: 'any', category: 'edge_case' },
  { query: 'Vitamin D high dose', expectedIngredient: 'cholecalciferol', expectedFormulation: 'any', category: 'edge_case' },
  // ... 13 more edge cases

  // Exact PBS codes (10 cases)
  { query: '10582Y_7030_485_2862_9558', expectedCode: '10582Y_7030_485_2862_9558', expectedIngredient: 'paracetamol', category: 'exact_code' },
  // ... 9 more exact code cases
];
```

### Step 5: Validation Script

```typescript
// Run hybrid retrieval validation
async function validateHybridRetrieval() {
  const results = [];

  for (const testCase of MEDICATION_TEST_CASES) {
    const { data, error } = await supabase.rpc('search_medications_hybrid', {
      query_text: testCase.query,
      max_results: 20
    });

    // Check if expected ingredient in top 20
    const found = data?.some(result =>
      result.normalized_text.toLowerCase().includes(testCase.expectedIngredient.toLowerCase())
    );

    // Check position of correct result
    const position = data?.findIndex(result =>
      result.normalized_text.toLowerCase().includes(testCase.expectedIngredient.toLowerCase())
    ) + 1;

    // Check formulation preference (standalone vs combo)
    const isStandalone = data?.[0]?.match_type !== 'combination';

    results.push({
      testCase,
      found,
      position,
      topResult: data?.[0],
      formulation: isStandalone ? 'standalone' : 'combination',
      passed: found && position <= 5  // Top 5 threshold
    });
  }

  // Calculate metrics
  const passRate = results.filter(r => r.passed).length / results.length;
  const avgPosition = results.filter(r => r.found).reduce((sum, r) => sum + r.position, 0) / results.filter(r => r.found).length;

  console.log(`Pass Rate: ${(passRate * 100).toFixed(1)}%`);
  console.log(`Average Position: ${avgPosition.toFixed(1)}`);

  return { results, passRate, avgPosition };
}
```

## Success Criteria

### Phase 1: Medication Hybrid Search
- ✅ Correct ingredient in top 20: >99%
- ✅ Correct ingredient in top 5: >95%
- ✅ Standalone preferred over combo: >90%
- ✅ Exact PBS code match: 100%
- ✅ Typo tolerance: >80%
- ✅ Search latency: <500ms

### Phase 2: Procedure Hybrid Search
- ✅ Correct procedure in top 10: >95%
- ✅ Correct anatomy: >90%
- ✅ MBS code exact match: 100%
- ✅ Search latency: <500ms

## Database Changes Required

### New Functions
1. `search_medications_hybrid()` - Main hybrid search for medications
2. `search_procedures_hybrid()` - Main hybrid search for procedures
3. `extract_ingredient()` - Helper for ingredient extraction
4. `extract_dose()` - Helper for dose extraction
5. `extract_form()` - Helper for form extraction
6. `extract_anatomy()` - Helper for anatomy extraction (procedures)
7. `extract_procedure_type()` - Helper for procedure type extraction

### New Indexes
1. GIN index on `normalized_embedding_text` (pg_trgm)
2. Keep existing indexes on entity_type, country_code, active

### Extensions Required
- `pg_trgm` - Already available in Supabase PostgreSQL

## Files to Create

### Implementation
- `migration_history/2025-10-21_31_hybrid_search_functions.sql` - RPC functions
- `test-hybrid-retrieval-medications.ts` - Medication test suite (100 cases)
- `test-hybrid-retrieval-procedures.ts` - Procedure test suite (50 cases)

### Documentation
- Update `PASS-1.5-IMPLEMENTATION-PLAN.md` with hybrid approach
- Create `HYBRID-RETRIEVAL-DESIGN.md` with technical details
- Update bridge schemas if needed

## Timeline

### Day 1 (Today)
- Morning: Implement helper functions (extract_ingredient, extract_dose, extract_form)
- Afternoon: Implement search_medications_hybrid() RPC
- Evening: Create medication test set (100 cases)

### Day 2
- Morning: Run validation, debug issues, tune weights
- Afternoon: Implement search_procedures_hybrid() RPC
- Evening: Create procedure test set (50 cases)

### Day 3
- Morning: Run procedure validation
- Afternoon: Performance optimization, indexing
- Evening: Update documentation

## Key Questions to Resolve

1. **Lexical/Vector Weight Ratio:** Start with 70/30, tune based on validation results
2. **Standalone Boost Value:** Start with 0.1, adjust if too many combos slip through
3. **Minimum Similarity Thresholds:** Start with 0.3 for both lexical and vector
4. **Index Strategy:** GIN for text, IVFFLAT for vectors, or combined?
5. **Embedding Generation:** Generate query embedding every time, or cache common queries?

## Risks and Mitigations

### Risk 1: Performance Degradation
- **Mitigation:** Lexical pre-filtering reduces vector comparisons by 90%+
- **Monitoring:** Benchmark latency across 1000 queries

### Risk 2: Tuning Complexity
- **Mitigation:** Make weights configurable, not hardcoded
- **Monitoring:** A/B test different weight combinations

### Risk 3: Edge Case Handling
- **Mitigation:** Comprehensive test set with known edge cases
- **Monitoring:** Track failure patterns across categories

## Resources

### Documentation to Reference
- `CRITICAL-FINDING-PURE-VECTOR-INSUFFICIENT.md` - Why we need hybrid
- `MBS-PROCEDURE-VALIDATION-RESULTS.md` - Procedure validation findings
- `SESSION-SUMMARY-2025-10-20.md` - Complete context from previous session

### Code to Reference
- `test-pass15-validation-FIXED.ts` - Cosine similarity calculation
- `populate-normalized-text.ts` - Normalization logic
- `current_schema/03_clinical_core.sql` - Table structure

### PostgreSQL Documentation
- pg_trgm: https://www.postgresql.org/docs/current/pgtrgm.html
- Full-text search: https://www.postgresql.org/docs/current/textsearch.html
- pgvector operators: https://github.com/pgvector/pgvector#querying

## Next Session Handoff

After completing this session, create:
1. `SESSION-SUMMARY-2025-10-21.md` - What was accomplished
2. `SESSION-PLAN-2025-10-22.md` - Next steps (procedures, optimization)
3. Update `PASS-1.5-IMPLEMENTATION-PLAN.md` with progress

---

**Session start:** Ready to begin implementation
**Estimated completion:** 3 days (Oct 21-23)
**Target accuracy:** >95% for medications, >90% for procedures
