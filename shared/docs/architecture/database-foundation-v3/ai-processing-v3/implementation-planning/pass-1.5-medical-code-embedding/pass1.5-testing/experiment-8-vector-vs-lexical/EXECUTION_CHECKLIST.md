# Experiment 8: Execution Checklist

**PURPOSE**: Prevent shortcuts, assumptions, and fabricated data

**INSTRUCTIONS**: Check off each item as you complete it. DO NOT skip any steps.

---

## Phase 1: Pre-Execution Verification

### Environment Checks

- [ ] Verify LOINC codes exist in database
  ```sql
  SELECT COUNT(*) FROM regional_medical_codes
  WHERE code_system = 'loinc' AND embedding IS NOT NULL;
  ```
  **Expected**: 102891
  **Actual**: ___________

- [ ] Verify OpenAI API key configured
  ```bash
  echo $OPENAI_API_KEY | head -c 20
  ```
  **Shows**: ___________

- [ ] Verify Supabase credentials configured
  ```bash
  echo $SUPABASE_SERVICE_ROLE_KEY | head -c 20
  ```
  **Shows**: ___________

### Function Verification

- [ ] Test vector search RPC function
  ```sql
  SELECT COUNT(*) FROM search_regional_codes(
    (SELECT embedding FROM regional_medical_codes WHERE code_value = '2345-7' LIMIT 1),
    NULL, 'AUS', 10, 0.0
  );
  ```
  **Expected**: 10
  **Actual**: ___________

### File Verification

- [ ] Test entities file exists
  ```bash
  test -f shared/docs/.../experiment-8-vector-vs-lexical/test-data/test-entities.json && echo "EXISTS"
  ```
  **Result**: ___________

- [ ] Test entities file has 6 entities
  ```bash
  jq '.total_entities' shared/docs/.../experiment-8-vector-vs-lexical/test-data/test-entities.json
  ```
  **Expected**: 6
  **Actual**: ___________

- [ ] Test entities file has 18 queries
  ```bash
  jq '.total_queries' shared/docs/.../experiment-8-vector-vs-lexical/test-data/test-entities.json
  ```
  **Expected**: 18
  **Actual**: ___________

---

## Phase 2: Vector Search Execution

**CRITICAL**: You MUST generate ACTUAL OpenAI embeddings and ACTUAL database queries for EVERY query. NO MOCKING. NO SHORTCUTS.

### Entity 1: Blood glucose measurement

- [ ] Run vector search for variant "clinical"
  - [ ] Generated OpenAI embedding (API call made)
  - [ ] Executed database search (RPC call made)
  - [ ] Saved result file: `vector-entity-1-clinical.json`
  - [ ] Verified file has 20 results
  ```bash
  jq '.results | length' results/vector-entity-1-clinical.json
  ```
  **Result**: ___________

- [ ] Run vector search for variant "layperson"
  - [ ] Generated embedding
  - [ ] Executed search
  - [ ] Saved result file: `vector-entity-1-layperson.json`
  - [ ] Verified 20 results

- [ ] Run vector search for variant "abbreviation"
  - [ ] Generated embedding
  - [ ] Executed search
  - [ ] Saved result file: `vector-entity-1-abbreviation.json`
  - [ ] Verified 20 results

### Entity 2: Hemoglobin A1c test

- [ ] Clinical variant complete (`vector-entity-2-clinical.json`)
- [ ] Layperson variant complete (`vector-entity-2-layperson.json`)
- [ ] Abbreviation variant complete (`vector-entity-2-abbreviation.json`)

### Entity 3: Blood pressure measurement

- [ ] Clinical variant complete (`vector-entity-3-clinical.json`)
- [ ] Layperson variant complete (`vector-entity-3-layperson.json`)
- [ ] Abbreviation variant complete (`vector-entity-3-abbreviation.json`)

### Entity 4: Total cholesterol test

- [ ] Clinical variant complete (`vector-entity-4-clinical.json`)
- [ ] Layperson variant complete (`vector-entity-4-layperson.json`)
- [ ] Abbreviation variant complete (`vector-entity-4-abbreviation.json`)

### Entity 5: Pregnancy test

- [ ] Clinical variant complete (`vector-entity-5-clinical.json`)
- [ ] Layperson variant complete (`vector-entity-5-layperson.json`)
- [ ] Abbreviation variant complete (`vector-entity-5-abbreviation.json`)

### Entity 6: ECG findings

- [ ] Clinical variant complete (`vector-entity-6-clinical.json`)
- [ ] Layperson variant complete (`vector-entity-6-layperson.json`)
- [ ] Abbreviation variant complete (`vector-entity-6-abbreviation.json`)

### Vector Search Validation

- [ ] Verify 18 result files exist
  ```bash
  ls -1 results/vector-*.json | wc -l
  ```
  **Expected**: 18
  **Actual**: ___________

- [ ] Verify aggregated results file exists
  ```bash
  test -f results/vector-all-results.json && echo "EXISTS"
  ```
  **Result**: ___________

- [ ] Verify each file has exactly 20 results
  ```bash
  for f in results/vector-*.json; do jq '.results | length' "$f"; done | sort -u
  ```
  **Expected**: 20 (single line)
  **Actual**: ___________

- [ ] Verify similarity scores are present
  ```bash
  jq '.results[0].similarity_score' results/vector-entity-1-clinical.json
  ```
  **Expected**: Number between 0.0 and 1.0
  **Actual**: ___________

---

## Phase 3: Lexical Search Execution

**CRITICAL**: You MUST execute ACTUAL PostgreSQL full-text searches for EVERY query. NO MOCKING. NO SHORTCUTS.

### Entity 1: Blood glucose measurement

- [ ] Run lexical search for variant "clinical"
  - [ ] Executed PostgreSQL full-text search
  - [ ] Saved result file: `lexical-entity-1-clinical.json`
  - [ ] Verified file exists with results
  ```bash
  jq '.results | length' results/lexical-entity-1-clinical.json
  ```
  **Result**: ___________

- [ ] Clinical variant complete
- [ ] Layperson variant complete
- [ ] Abbreviation variant complete

### Entity 2: Hemoglobin A1c test

- [ ] Clinical variant complete (`lexical-entity-2-clinical.json`)
- [ ] Layperson variant complete (`lexical-entity-2-layperson.json`)
- [ ] Abbreviation variant complete (`lexical-entity-2-abbreviation.json`)

### Entity 3: Blood pressure measurement

- [ ] Clinical variant complete (`lexical-entity-3-clinical.json`)
- [ ] Layperson variant complete (`lexical-entity-3-layperson.json`)
- [ ] Abbreviation variant complete (`lexical-entity-3-abbreviation.json`)

### Entity 4: Total cholesterol test

- [ ] Clinical variant complete (`lexical-entity-4-clinical.json`)
- [ ] Layperson variant complete (`lexical-entity-4-layperson.json`)
- [ ] Abbreviation variant complete (`lexical-entity-4-abbreviation.json`)

### Entity 5: Pregnancy test

- [ ] Clinical variant complete (`lexical-entity-5-clinical.json`)
- [ ] Layperson variant complete (`lexical-entity-5-layperson.json`)
- [ ] Abbreviation variant complete (`lexical-entity-5-abbreviation.json`)

### Entity 6: ECG findings

- [ ] Clinical variant complete (`lexical-entity-6-clinical.json`)
- [ ] Layperson variant complete (`lexical-entity-6-layperson.json`)
- [ ] Abbreviation variant complete (`lexical-entity-6-abbreviation.json`)

### Lexical Search Validation

- [ ] Verify 18 result files exist
  ```bash
  ls -1 results/lexical-*.json | wc -l
  ```
  **Expected**: 18
  **Actual**: ___________

- [ ] Verify aggregated results file exists
  ```bash
  test -f results/lexical-all-results.json && echo "EXISTS"
  ```
  **Result**: ___________

- [ ] Verify relevance scores are present
  ```bash
  jq '.results[0].relevance_score' results/lexical-entity-1-clinical.json
  ```
  **Expected**: Number >= 0
  **Actual**: ___________

---

## Phase 4: Comparison Report Generation

- [ ] Run comparison script
  ```bash
  pnpm exec tsx shared/docs/.../experiment-8-vector-vs-lexical/scripts/generate-comparison-report.ts
  ```
  **Exit code**: ___________

- [ ] Verify comparison report exists
  ```bash
  test -f analysis/comparison-report.json && echo "EXISTS"
  ```
  **Result**: ___________

- [ ] Verify summary stats exist
  ```bash
  test -f analysis/summary-stats.json && echo "EXISTS"
  ```
  **Result**: ___________

- [ ] Check comparison report has 18 entries
  ```bash
  jq 'length' analysis/comparison-report.json
  ```
  **Expected**: 18
  **Actual**: ___________

- [ ] Review average overlap percentage
  ```bash
  jq '.average_overlap_percentage' analysis/summary-stats.json
  ```
  **Result**: ___________%

---

## Phase 5: Manual Review Preparation

- [ ] Create manual review template
  - [ ] Template lists all 18 queries
  - [ ] Template shows vector top 20
  - [ ] Template shows lexical top 20
  - [ ] Template has checkboxes for relevant/not relevant
  - [ ] Template saved as `analysis/manual-review-template.md`

- [ ] Verify template file exists
  ```bash
  test -f analysis/manual-review-template.md && echo "EXISTS"
  ```
  **Result**: ___________

---

## Final Validation

### Data Existence Check

- [ ] Vector results directory has 18 JSON files
- [ ] Lexical results directory has 18 JSON files
- [ ] Aggregated vector results file exists
- [ ] Aggregated lexical results file exists
- [ ] Comparison report exists
- [ ] Summary statistics exist
- [ ] Manual review template exists

### Data Quality Check

- [ ] All vector results have 20 codes each
- [ ] All vector results have similarity_score field
- [ ] All lexical results have relevance_score field
- [ ] No duplicate codes within any single result file
  ```bash
  for f in results/vector-*.json; do
    duplicates=$(jq '.results[].code_value' "$f" | sort | uniq -d | wc -l)
    if [ "$duplicates" -gt 0 ]; then echo "DUPLICATES FOUND IN $f"; fi
  done
  ```
  **Result**: ___________

- [ ] All results are for LOINC codes (code_system = "loinc")
  ```bash
  jq '.results[].code_system | unique' results/vector-entity-1-clinical.json
  ```
  **Expected**: ["loinc"]
  **Actual**: ___________

### Integrity Check

- [ ] Vector and lexical results match same queries
  ```bash
  diff <(jq -r '.entity_id, .variant_type' results/vector-all-results.json | paste -d' ' - -) \
       <(jq -r '.entity_id, .variant_type' results/lexical-all-results.json | paste -d' ' - -)
  ```
  **Result**: (should be empty if matching)

---

## Sign-Off

**Date completed**: ___________

**Executed by**: ___________

**All data files verified**: [ ] YES / [ ] NO

**Ready for manual review**: [ ] YES / [ ] NO

**Notes/Issues encountered**:
_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________

---

## Failure Recovery

If any check fails:

1. **STOP IMMEDIATELY** - Do not proceed to next phase
2. Investigate the failure cause
3. Fix the issue
4. Re-run the failed phase
5. Re-verify all checks for that phase
6. Only then proceed to next phase

**NEVER skip a failed check**. **NEVER fabricate data to pass a check**.

