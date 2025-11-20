# v10.0 Validation Plan

## Test Objectives

Validate that v10 universal prompt:
1. Correctly handles single-chunk documents (<100 pages)
2. Successfully processes multi-chunk documents (≥100 pages)
3. Maintains encounter continuity across chunk boundaries
4. Prevents duplicate encounter creation
5. Achieves target confidence scores

## Test Files

### Phase 1: Basic Validation

#### Test 1: Small Document (3 pages)
- **File**: Any 3-page medical record
- **Expected**:
  - Standard mode processing (no chunks)
  - All encounters extracted
  - No progressive fields in output
- **Pass Criteria**:
  - No errors
  - Encounters match manual count

#### Test 2: Medium Document (50 pages)
- **File**: 50-page patient history
- **Expected**:
  - Standard mode processing (single chunk)
  - All encounters extracted
  - Page assignments with citations
- **Pass Criteria**:
  - All pages assigned
  - Citations include key phrases

### Phase 2: Progressive Mode Validation

#### Test 3: Minimal Progressive (120 pages)
- **File**: 120-page document
- **Expected**:
  - 3 chunks of 40-50 pages
  - Handoff between chunks
  - No duplicate encounters
- **Pass Criteria**:
  - Chunks process successfully
  - pendingEncounter tracked in database
  - Final encounter count correct

#### Test 4: Known Problematic Case (142 pages)
- **File**: 006_Emma_Thompson_Hospital_Encounter_Summary.pdf
- **Previous Issue**: Created 3 separate encounters instead of 1
- **Expected with v10**:
  - 3 chunks
  - 1 continuous hospital admission
  - Proper handoff between chunks
- **Pass Criteria**:
  - Single encounter spanning all chunks
  - Status="continuing" in chunks 1-2
  - Status="complete" in chunk 3

#### Test 5: Large Document (220+ pages)
- **File**: Complete medical history
- **Expected**:
  - 5+ chunks
  - Multiple encounters
  - Some encounters span chunks
- **Pass Criteria**:
  - All handoffs successful
  - No duplicate encounters
  - Memory usage stable

## Validation Queries

### Pre-Test Setup
```sql
-- Record baseline
SELECT COUNT(*) as existing_encounters
FROM healthcare_encounters
WHERE patient_id = ?;
```

### During Test Monitoring
```sql
-- Watch chunk progress
SELECT
  chunk_number,
  processing_status,
  encounters_completed,
  encounters_continued,
  handoff_generated->>'pendingEncounter' IS NOT NULL as has_pending
FROM pass05_chunk_results
WHERE session_id = ?
ORDER BY chunk_number;

-- Check pending encounters
SELECT
  temp_encounter_id,
  chunk_started,
  chunk_last_seen,
  status,
  confidence
FROM pass05_pending_encounters
WHERE session_id = ?;
```

### Post-Test Validation
```sql
-- Verify no duplicates
SELECT
  encounter_type,
  encounter_start_date,
  COUNT(*) as count
FROM healthcare_encounters
WHERE primary_shell_file_id = ?
GROUP BY encounter_type, encounter_start_date
HAVING COUNT(*) > 1;

-- Check confidence distribution
SELECT
  CASE
    WHEN pass_0_5_confidence >= 0.9 THEN '0.90-1.00'
    WHEN pass_0_5_confidence >= 0.7 THEN '0.70-0.89'
    WHEN pass_0_5_confidence >= 0.5 THEN '0.50-0.69'
    ELSE 'Below 0.50'
  END as confidence_band,
  COUNT(*) as encounters
FROM healthcare_encounters
WHERE primary_shell_file_id = ?
GROUP BY confidence_band
ORDER BY confidence_band DESC;

-- Verify page coverage
SELECT
  COUNT(DISTINCT page_num) as pages_assigned,
  MIN(page_num) as first_page,
  MAX(page_num) as last_page
FROM pass05_page_assignments
WHERE shell_file_id = ?;
```

## Success Metrics

### Critical (Must Pass)
- [ ] No TypeScript compilation errors
- [ ] No runtime errors during processing
- [ ] 142-page test creates single encounter (not 3)
- [ ] All pages assigned to encounters

### Important (Should Pass)
- [ ] Handoff success rate >95%
- [ ] Average confidence >0.75
- [ ] Processing time <10 seconds per chunk
- [ ] Citations present in page assignments

### Nice to Have
- [ ] Post-processor rarely needed (AI provides status)
- [ ] Memory usage <500MB per session
- [ ] Clear error messages for failures

## Test Execution Log

| Test # | File | Pages | Chunks | Expected Encounters | Actual Encounters | Handoffs | Status | Notes |
|--------|------|-------|--------|-------------------|-------------------|----------|--------|-------|
| 1 | | 3 | 1 | | | 0 | | |
| 2 | | 50 | 1 | | | 0 | | |
| 3 | | 120 | 3 | | | | | |
| 4 | Emma_Thompson | 142 | 3 | 1 | | | | |
| 5 | | 220+ | 5+ | | | | | |

## Rollback Criteria

Rollback to v2.9 if:
- More than 10% of documents fail processing
- Duplicate rate increases above 5%
- Average confidence drops below 0.5
- Memory usage exceeds 1GB per session
- Processing time doubles from baseline

## Sign-off

- [ ] All critical metrics pass
- [ ] Performance acceptable
- [ ] No regression from v2.9
- [ ] Ready for production