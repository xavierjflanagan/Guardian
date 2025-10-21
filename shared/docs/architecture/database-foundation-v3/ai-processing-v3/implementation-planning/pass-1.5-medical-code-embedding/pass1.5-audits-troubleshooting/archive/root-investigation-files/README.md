# Root-Level Investigation Files Archive

**Date Archived:** 2025-10-19
**Reason:** Pass 1.5 investigation complete - files moved from repository root to archive

## Archived Contents

### Embedding Generation Scripts
These scripts were used to initially populate the database with embeddings:

- `embed-and-populate-mbs.ts` - Original MBS (Medicare Benefits Schedule) embedding script
- `embed-and-populate-pbs.ts` - Original PBS (Pharmaceutical Benefits Scheme) embedding script
- `parse-mbs.ts` - MBS data parser
- `parse-pbs.ts` - PBS data parser

**Note:** These scripts embedded using `search_text` field, which is the root cause of semantic mismatch. Phase 2 will regenerate using normalized text.

### Debug & Investigation Scripts
Scripts created during the investigation to diagnose issues:

- `debug-pass15-pipeline.ts` - Pipeline debugging
- `debug-rpc-call.ts` - RPC call debugging (found char(3) truncation bug)
- `debug_vector_search_core_issue.ts` - Core issue investigation
- `test-cholecystectomy-via-rpc.ts` - Procedure RPC testing (found zero results issue)
- `test-mbs-cholecystectomy-vector-search.ts` - MBS vector search testing
- `test-real-pass1-entities.ts` - Real Pass 1 entity testing (Metformin, Perindopril, Cholecystectomy)
- `generate-embeddings-for-pass1-entities.ts` - Generated embeddings for testing
- `verify-real-search-results.ts` - Results verification

### Test Data Files
Generated during investigation:

- `pass1-entity-embeddings.json` - Embeddings for Metformin and Perindopril from real Pass 1 output
- `metformin-embedding.json` - Metformin test embedding (1536 dimensions)
- `perindopril-embedding.json` - Perindopril test embedding (1536 dimensions)
- `test-embedding-vector.txt` - Test vector data in PostgreSQL array format
- `test-pbs-output.json` - PBS output sample

### Documentation
- `TODAYS_PLAN_2025-10-03.md` - Daily plan from early October

## Key Findings from These Files

**Root Cause Identified:**
The embedding scripts (`embed-and-populate-*.ts`) used `search_text` field which includes:
- Brand names ("Diaformin XR 1000")
- Billing codes ("MBS 20706 T10")
- Regulatory prose

This caused semantic mismatch with clinical queries from Pass 1 ("Metformin 500mg twice daily").

**Test Results:**
- Real Pass 1 entity tests: All failed (wrong results or zero results)
- Metformin query returned Felodipine (44.1% similarity)
- Perindopril query returned Oxybutynin (34.4% similarity)
- Cholecystectomy query returned zero results

## Current Status

**Investigation:** Complete - Root cause confirmed
**Solution:** PASS15_ROOT_CAUSE_AND_SOLUTION_PLAN.md
**Next Step:** Phase 1 Fast Validation Loop (test normalized embeddings with 20 medications)

## Still in Root (Active Files)

These files remain in root for Phase 1 execution:
- `test-rpc-truth-test.ts` - Validates RPC function works correctly
- `test-pass15-rpc-call.ts` - Tests RPC with real Pass 1 entities

## Related Documentation

- **Consolidated Plan:** `../PASS15_ROOT_CAUSE_AND_SOLUTION_PLAN.md`
- **Archived Investigations:**
  - `../CRITICAL_VECTOR_SEARCH_FAILURE_ANALYSIS_2025-10-19.md`
  - `../PASS15_RPC_INVESTIGATION_FINDINGS_2025-10-19.md`
- **Migration:** `../../../../../../migration_history/2025-10-19_29_fix_search_regional_codes_char_type_bug.sql`
- **Test Documentation:** `../../pass1.5-testing/test_04_char_type_truncation_fix.md`
