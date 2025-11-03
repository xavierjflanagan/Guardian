# Test-07: Regression Tests for Pass 0.5 v2.3

## Purpose

This folder houses regression tests for Pass 0.5 v2.3 (page-by-page assignment with justifications). These tests validate that the system continues to work correctly with:
- Previously successful documents (frankenstein file, 142-page PDF)
- Edge cases (large TIFF files, multi-encounter documents)
- Auto-retry mechanism and timeout handling

## Test Files

### Test 1: Frankenstein Re-upload (20-page PDF)
**Status:** SUCCESS
**Date:** 2025-11-03
**Result:** 2 encounters correctly detected
**Notes:** Re-uploaded previously successful frankenstein file to validate v2.3 consistency

### Test 2: Single Encounter (13-page PDF)
**Status:** SUCCESS
**Date:** 2025-11-03
**Result:** 1 encounter correctly detected
**Notes:**
- Extracted from frankenstein file (made up half of original file)
- Longer processing time and more output tokens than expected
- Encounter type listed as "outpatient" (ambiguity with "specialist_consultation")
- Provider detail: "Mara Ehret, PA-C (supervising: David W. Neckman, MD)"

### Test 3: Large TIFF (2-page, 21MB)
**Status:** SUCCESS (after manual reset)
**Date:** 2025-11-03
**Issues Found:**
- Initially stuck with dead heartbeat after ~7 minutes
- Auto-retry didn't work due to 30-minute timeout threshold
- Required manual reset to complete

**Resolution:**
- Updated `system_configuration.worker.timeout_seconds` from 1800s (30min) to 300s (5min)
- Job completed successfully on retry

### Test 4: 142-Page PDF Re-upload
**Status:** IN PROGRESS
**Date:** 2025-11-03
**Job ID:** 2fab2212-366b-44e7-b662-b09979f1d4a8
**Issues Found:**
- Initially stuck with dead heartbeat after ~5 minutes
- Auto-retry didn't work due to 30-minute timeout threshold
- Required manual reset to retry

**Resolution:**
- Same fix as Test 3 (reduced timeout from 30min to 5min)
- Currently processing on retry (8+ minutes, healthy heartbeats)

## Critical Findings

### Auto-Retry Mechanism Issue (RESOLVED)
**Problem:** Jobs with dead heartbeats remained stuck in "processing" status instead of being auto-reset

**Root Cause:** Timeout threshold set to 30 minutes in `system_configuration` table
- Function: `claim_next_job_v3()` at shared/docs/architecture/database-foundation-v3/current_schema/08_job_coordination.sql:807
- Config key: `worker.timeout_seconds`
- Original value: 1800 seconds (30 minutes)
- New value: 300 seconds (5 minutes)

**Impact:**
- Stuck jobs now auto-reset after 5 minutes instead of 30 minutes
- Prevents long-running stuck jobs from blocking the queue
- Patients will experience faster recovery from worker crashes

### Large File Processing Pattern
**Pattern:** Large files (21MB TIFF, 142-page PDF) may cause worker crashes
**Symptoms:** Heartbeat stops abruptly without error logging
**Status:** Monitoring for recurrence

## Configuration Changes

### System Configuration Updates
```sql
-- Reduced timeout threshold for faster auto-retry
UPDATE system_configuration
SET config_value = '300'::jsonb
WHERE config_key = 'worker.timeout_seconds';
-- Previous value: 1800 (30 minutes)
-- New value: 300 (5 minutes)
```

## Next Steps

1. Monitor 142-page PDF completion
2. Document final results for all 4 regression tests
3. Investigate large file processing crashes (if pattern continues)
4. Consider memory/timeout optimizations for Render worker
