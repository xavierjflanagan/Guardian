# 05b - Pass 1 Observability Tables Audit

**Date:** 2025-12-01
**Status:** Complete
**Reference:** 05-hierarchical-observability-system.md

---

## Context

**Important:** This audit was conducted with the understanding that:

1. **Pass 1 is NOT the end of the pipeline** - The full AI processing pipeline is:
   - Pass 0.5: Encounter Discovery (implemented)
   - Pass 1: Entity Detection (implemented) <-- Current audit scope
   - Pass 1.5: Code Shortlisting (not yet built)
   - Pass 2: Clinical Enrichment (not yet built)
   - Pass 3: Narrative Generation (not yet built)

2. **Pre-launch status** - We are pre-users and pre-launch, so observability gaps are acceptable to note but not urgent to fix.

3. **Session vs Pass completion** - A "session" spans the entire pipeline (Pass 0.5 through Pass 3). Pass 1 completing does NOT mean the session is complete.

---

## Overview

This document audits the Pass 1 hierarchical observability tables against the design document (05-hierarchical-observability-system.md), comparing:
- Schema (expected vs actual columns)
- Values written by the worker code
- Presence vs absence of data
- Legacy columns vs actively used columns

---

## Hierarchy Reference (Section 3.2)

```
shell_files
  --> job_queue (1 row per processing job)
        --> ai_processing_sessions (1 row - root AI session)
              --> pass1_entity_metrics (1 row - summary)
                    --> pass1_encounter_results (N rows - 1 per encounter)
                          --> pass1_batch_results (N rows - 1 per batch)
                    --> pass1_entity_detections (N rows - entities)
```

---

## 1. pass1_entity_metrics Audit

### Schema Comparison

| Column | Design Doc | Actual DB | Code Writes | Verdict |
|--------|------------|-----------|-------------|---------|
| `id` | UUID PK | YES | Auto-generated | OK |
| `profile_id` | UUID NOT NULL | YES | context.patient_id | OK |
| `shell_file_id` | UUID NOT NULL | YES | context.shell_file_id | OK |
| `processing_session_id` | UUID NOT NULL | YES | context.processing_session_id | OK |
| `entities_detected` | INTEGER NOT NULL | YES | metrics.entities_detected | OK |
| `processing_time_ms` | INTEGER NOT NULL | YES | metrics.processing_time_ms | OK |
| `processing_time_minutes` | NUMERIC (generated) | YES | Auto-calculated | OK |
| `vision_model_used` | TEXT NOT NULL (LEGACY) | YES | `'none'` hardcoded | OK - Legacy |
| `ocr_model_used` | TEXT (LEGACY) | YES | NOT written (NULL) | OK - Legacy |
| `ocr_agreement_average` | NUMERIC (LEGACY) | YES | NOT written (NULL) | OK - Legacy |
| `confidence_distribution` | JSONB (LEGACY) | YES | NOT written (NULL) | OK - Legacy |
| `entity_types_found` | TEXT[] | YES | NOT written (NULL) | ISSUE |
| `input_tokens` | INTEGER | YES | metrics.input_tokens | OK (writes 0) |
| `output_tokens` | INTEGER | YES | metrics.output_tokens | OK (writes 0) |
| `total_tokens` | INTEGER | YES | metrics.total_tokens | OK (writes 0) |
| `ocr_pages_processed` | INTEGER | YES | NOT written (NULL) | Legacy |
| `user_agent` | TEXT | YES | NOT written (NULL) | OK - Not applicable |
| `ip_address` | INET | YES | NOT written (NULL) | OK - Not applicable |
| `created_at` | TIMESTAMPTZ | YES | Auto NOW() | OK |
| `ai_model_used` | TEXT (NEW) | YES | metrics.ai_model_used | OK |
| `encounters_total` | INTEGER (NEW) | YES | metrics.encounters_total | OK |
| `encounters_succeeded` | INTEGER (NEW) | YES | metrics.encounters_succeeded | OK |
| `encounters_failed` | INTEGER (NEW) | YES | metrics.encounters_failed | OK |
| `batches_total` | INTEGER (NEW) | YES | metrics.batches_total | OK |
| `batches_succeeded` | INTEGER (NEW) | YES | metrics.batches_succeeded | OK |
| `total_retries_used` | INTEGER (NEW) | YES | metrics.total_retries_used | OK |
| `failure_encounter_id` | UUID (NEW) | YES | metrics.failure_encounter_id | OK |
| `error_code` | TEXT (NEW) | YES | metrics.error_code | OK |
| `error_summary` | TEXT (NEW) | YES | metrics.error_summary | OK |

### Actual Data Sample (Latest Row)

```
id: ddf235c4-8f53-497a-bc15-b27e12d22709
profile_id: d1dbe18c-afc2-421f-bd58-145ddb48cbca
shell_file_id: 43af751b-89cc-42ab-9956-7d505c81b9f2
processing_session_id: de7240e2-aa2b-476f-b170-9414673598af
entities_detected: 165
processing_time_ms: 13162
vision_model_used: 'none'
ocr_model_used: NULL
ocr_agreement_average: NULL
confidence_distribution: NULL
entity_types_found: NULL                  <-- NOT WRITTEN
ocr_pages_processed: NULL
user_agent: NULL
ip_address: NULL
input_tokens: 0                           <-- Always 0
output_tokens: 0                          <-- Always 0
total_tokens: 0                           <-- Always 0
processing_time_minutes: 0.22
ai_model_used: 'gemini-2.5-flash-lite'    <-- CORRECT
encounters_total: 7
encounters_succeeded: 7
encounters_failed: 0
batches_total: 7
batches_succeeded: 7
total_retries_used: 0
failure_encounter_id: NULL
error_code: NULL
error_summary: NULL
```

### Minor Observations

1. **`entity_types_found` is never populated**
   - Design: Should contain array of unique entity types found
   - Actual: Always NULL
   - Impact: Very low - derivable from pass1_entity_detections
   - Priority: Optional future improvement

2. **Token counts always 0 at metrics level**
   - Design: Could track aggregated input/output/total tokens
   - Actual: Worker passes 0 (tokens tracked per-batch instead)
   - See Pass1Detector.ts lines 177-178: "Note: remains 0 (pre-existing behavior - tokens tracked per batch in DB)"
   - Impact: Low - detailed token data IS available in `pass1_batch_results`
   - Priority: Optional future improvement (sum from batch level)

### Legacy Columns (Correctly Not Written)

- `vision_model_used`: Written as `'none'` (legacy - Strategy-A uses OCR not Vision)
- `ocr_model_used`: NULL (Strategy-A doesn't use separate OCR model selection)
- `ocr_agreement_average`: NULL (no cross-validation in Strategy-A)
- `confidence_distribution`: NULL (no confidence scores in Strategy-A)
- `ocr_pages_processed`: NULL (not tracked at this level)
- `user_agent`/`ip_address`: NULL (not applicable for background worker)

### Verdict: CORRECT

All Strategy-A columns are properly populated. Legacy columns correctly ignored.
Two very minor observations noted above (entity_types_found, token aggregation) - both have the data available elsewhere and are optional future improvements.

---

## 2. ai_processing_sessions Audit

### Schema Comparison

| Column | Design Doc | Actual DB | Code Writes | Verdict |
|--------|------------|-----------|-------------|---------|
| `id` | UUID PK | YES | Created upstream | OK |
| `patient_id` | UUID NOT NULL | YES | Created upstream | OK |
| `shell_file_id` | UUID NOT NULL | YES | Created upstream | OK |
| `session_type` | TEXT NOT NULL | YES | Created upstream | OK |
| `session_status` | TEXT NOT NULL | YES | NOT updated by Pass1 | ISSUE |
| `ai_model_name` | TEXT NOT NULL | YES | NOT updated | Note |
| `model_config` | JSONB | YES | NOT updated | OK |
| `processing_mode` | TEXT | YES | NOT updated (NULL) | OK |
| `workflow_step` | TEXT NOT NULL | YES | Updated by Pass1 | OK |
| `total_steps` | INTEGER | YES | NOT updated (5) | OK |
| `completed_steps` | INTEGER | YES | NOT updated (0) | ISSUE |
| `overall_confidence` | NUMERIC (LEGACY) | YES | NOT written (NULL) | OK - Legacy |
| `requires_human_review` | BOOLEAN | YES | NOT updated | OK |
| `quality_score` | NUMERIC (LEGACY) | YES | NOT written (NULL) | OK - Legacy |
| `processing_started_at` | TIMESTAMPTZ NOT NULL | YES | Created upstream | OK |
| `processing_completed_at` | TIMESTAMPTZ | YES | NOT updated (NULL) | ISSUE |
| `total_processing_time` | INTERVAL | YES | NOT updated (NULL) | ISSUE |
| `error_message` | TEXT | YES | NOT updated (NULL) | Note |
| `error_context` | JSONB | YES | NOT updated (NULL) | Note |
| `retry_count` | INTEGER | YES | NOT updated (0) | OK |
| `max_retries` | INTEGER | YES | Default 3 | OK |
| `created_at` | TIMESTAMPTZ | YES | Auto NOW() | OK |
| `updated_at` | TIMESTAMPTZ | YES | Updated by Pass1 | OK |
| `pass05_status` | TEXT (NEW) | YES | NOT written (NULL) | Note |
| `pass1_status` | TEXT (NEW) | YES | Updated: 'completed' | OK |
| `pass1_5_status` | TEXT (NEW) | YES | NOT written (NULL) | OK |
| `pass2_status` | TEXT (NEW) | YES | NOT written (NULL) | OK |
| `pass3_status` | TEXT (NEW) | YES | NOT written (NULL) | OK |
| `failure_pass` | TEXT (NEW) | YES | NOT written (NULL) | OK |
| `failure_encounter_id` | UUID (NEW) | YES | NOT written (NULL) | Note |
| `error_code_v2` | TEXT (NEW) | YES | NOT written (NULL) | Note |

### Actual Data Sample (Latest Row)

```
id: de7240e2-aa2b-476f-b170-9414673598af
patient_id: d1dbe18c-afc2-421f-bd58-145ddb48cbca
shell_file_id: 43af751b-89cc-42ab-9956-7d505c81b9f2
session_type: 'shell_file_processing'
session_status: 'processing'              <-- NEVER UPDATED TO 'completed'
ai_model_name: 'gpt-5-mini'               <-- OUTDATED (created before Pass1)
workflow_step: 'entity_detection'
total_steps: 5
completed_steps: 0                        <-- NEVER INCREMENTED
overall_confidence: NULL
requires_human_review: false
quality_score: NULL
processing_started_at: 2025-12-01T09:56:08Z
processing_completed_at: NULL             <-- NEVER SET
total_processing_time: NULL               <-- NEVER SET
error_message: NULL
error_context: NULL
retry_count: 0
max_retries: 3
pass05_status: NULL                       <-- Pass 0.5 doesn't set this
pass1_status: 'completed'                 <-- CORRECTLY SET
pass1_5_status: NULL
pass2_status: NULL
pass3_status: NULL
failure_pass: NULL
failure_encounter_id: NULL
error_code_v2: NULL
```

### Analysis (With Pipeline Context)

Given that Pass 1 is just one stage of a 5-pass pipeline:

1. **`session_status` stays 'processing'** - CORRECT BEHAVIOR
   - The session IS still processing (Pass 1.5, 2, 3 haven't run yet)
   - Should only become 'completed' after Pass 3 finishes
   - No issue here

2. **`completed_steps` stays at 0** - MINOR
   - Could increment to 1 after Pass 1, 2 after Pass 1.5, etc.
   - Not critical - `pass1_status` = 'completed' is the real indicator
   - Future improvement when Pass 2/3 are built

3. **`processing_completed_at` stays NULL** - CORRECT BEHAVIOR
   - Should only be set when entire pipeline completes (after Pass 3)
   - No issue here

4. **`total_processing_time` stays NULL** - CORRECT BEHAVIOR
   - Should only be calculated when entire pipeline completes
   - No issue here

5. **`ai_model_name` shows 'gpt-5-mini'** - MINOR
   - Set at session creation, before actual model selection
   - Pass 1 model correctly stored in `pass1_entity_metrics.ai_model_used`
   - Each pass may use different models - session-level model name is ambiguous anyway

6. **`pass05_status` not set by Pass 0.5** - NOTE
   - Pass 0.5 predates the pass-specific status columns
   - Could be backfilled when Pass 0.5 code is updated
   - Not a Pass 1 issue

7. **`failure_pass`/`failure_encounter_id`/`error_code_v2` not populated** - MINOR
   - Pass 1 writes error info to `pass1_entity_metrics`
   - These session-level columns would be useful for quick error identification
   - Future improvement

### What Pass 1 Correctly Updates

- `pass1_status`: Set to 'completed' or 'failed'
- `workflow_step`: Updated during processing
- `updated_at`: Timestamp updated

### Code Reference

```typescript
// pass1-v2-database.ts lines 465-482
export async function updateSessionPass1Status(
  supabase: SupabaseClient,
  sessionId: string,
  status: Pass1SessionStatus
): Promise<void> {
  const { error } = await supabase
    .from('ai_processing_sessions')
    .update({
      pass1_status: status,
      workflow_step: status === 'processing' ? 'entity_detection' : undefined,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId);
  // ... error handling
}
```

### Verdict: CORRECT FOR CURRENT STAGE

The `pass1_status` column is correctly updated. Session-level fields (`session_status`, `processing_completed_at`) appropriately remain in "processing" state because the pipeline isn't complete yet.

---

## 3. ai_processing_summary Audit

### Schema Comparison

| Column | Design Doc | Actual DB | Code Writes | Verdict |
|--------|------------|-----------|-------------|---------|
| `id` | UUID PK | YES | - | - |
| `profile_id` | UUID NOT NULL | YES | - | - |
| `shell_file_id` | UUID NOT NULL | YES | - | - |
| `processing_status` | TEXT NOT NULL | YES | - | - |
| `overall_success` | BOOLEAN NOT NULL | YES | - | - |
| `failure_stage` | TEXT | YES | - | - |
| `total_processing_time_ms` | INTEGER NOT NULL | YES | - | - |
| `total_tokens_used` | INTEGER NOT NULL | YES | - | - |
| `total_cost_usd` | NUMERIC NOT NULL | YES | - | - |
| `overall_confidence_score` | NUMERIC (LEGACY) | YES | - | - |
| `entities_extracted_total` | INTEGER | YES | - | - |
| `manual_review_required` | BOOLEAN | YES | - | - |
| `pass1_metrics_id` | UUID FK | YES | - | - |
| `pass2_metrics_id` | UUID FK | YES | - | - |
| `pass3_metrics_id` | UUID FK | YES | - | - |
| `pass05_metrics_id` | UUID FK (NEW) | YES | - | - |
| `failure_encounter_id` | UUID FK (NEW) | YES | - | - |
| `failure_batch_index` | INTEGER (NEW) | YES | - | - |
| `error_code` | TEXT (NEW) | YES | - | - |
| `error_drill_down` | JSONB (NEW) | YES | - | - |
| `business_events` | JSONB | YES | - | - |
| `user_agent` | TEXT | YES | - | - |
| `ip_address` | INET | YES | - | - |
| `processing_started_at` | TIMESTAMPTZ | YES | - | - |
| `processing_completed_at` | TIMESTAMPTZ | YES | - | - |
| `created_at` | TIMESTAMPTZ | YES | - | - |

### Actual Data

```
Result: [] (empty)
```

### Analysis (With Pipeline Context)

**NO ROWS IN TABLE** - The `ai_processing_summary` table is not being written to.

### Why This Is Expected

The `ai_processing_summary` table is the **"final report card"** for the entire pipeline. Per the design document, it should be written **after the pipeline completes** (after Pass 3), not after each individual pass.

Since Pass 1.5, Pass 2, and Pass 3 are not yet implemented, there is no code to write the final summary. This is expected behavior.

### What Each Pass Should Do

| Pass | Writes to ai_processing_summary? |
|------|----------------------------------|
| Pass 0.5 | No |
| Pass 1 | No |
| Pass 1.5 | No |
| Pass 2 | No |
| Pass 3 | **Yes** - writes final summary after pipeline completes |

### Current Data Flow

Pass 1 correctly writes to its own tables:
- `pass1_entity_metrics` - Pass 1 summary metrics
- `pass1_encounter_results` - Per-encounter tracking
- `pass1_batch_results` - Per-batch tracking
- `pass1_entity_detections` - Detected entities
- `pass1_bridge_schema_zones` - Y-coordinate zones

The `ai_processing_summary` will be populated when Pass 3 is implemented and completes the pipeline.

### Verdict: NOT YET APPLICABLE

The table schema is ready. It will be written to when Pass 3 is implemented. This is not a Pass 1 issue.

---

## 4. job_queue Audit

### Schema Comparison

| Column | Design Doc | Actual DB | Code Writes | Verdict |
|--------|------------|-----------|-------------|---------|
| `id` | UUID PK | YES | Created upstream | OK |
| `job_type` | TEXT NOT NULL | YES | 'ai_processing' | OK |
| `job_lane` | TEXT | YES | 'ai_queue_simple' | OK |
| `job_category` | TEXT NOT NULL | YES | 'standard' | OK |
| `job_name` | TEXT NOT NULL | YES | Set upstream | OK |
| `job_description` | TEXT | YES | NULL | OK |
| `job_payload` | JSONB NOT NULL | YES | Contains shell_file_id etc | OK |
| `job_config` | JSONB | YES | {} | OK |
| `status` | TEXT NOT NULL | YES | Updated to 'completed' | OK |
| `scheduled_at` | TIMESTAMPTZ NOT NULL | YES | Set upstream | OK |
| `started_at` | TIMESTAMPTZ | YES | Updated | OK |
| `completed_at` | TIMESTAMPTZ | YES | Updated | OK |
| `priority` | INTEGER | YES | 5 | OK |
| `estimated_duration` | INTERVAL | YES | NULL | OK |
| `actual_duration` | INTERVAL | YES | Updated | OK |
| `memory_usage_mb` | INTEGER | YES | NULL | Note |
| `cpu_usage_percent` | NUMERIC | YES | NULL | Note |
| `retry_count` | INTEGER | YES | 0 | OK |
| `max_retries` | INTEGER | YES | 3 | OK |
| `retry_delay` | INTERVAL | YES | 5 min | OK |
| `last_error` | TEXT | YES | NULL (on success) | OK |
| `error_details` | JSONB | YES | NULL (on success) | OK |
| `depends_on` | UUID[] | YES | NULL | OK |
| `blocks_jobs` | UUID[] | YES | NULL | OK |
| `job_group` | TEXT | YES | NULL | OK |
| `worker_id` | TEXT | YES | Updated | OK |
| `processing_node` | TEXT | YES | NULL | OK |
| `lock_acquired_at` | TIMESTAMPTZ | YES | NULL | Note |
| `lock_expires_at` | TIMESTAMPTZ | YES | NULL | Note |
| `heartbeat_at` | TIMESTAMPTZ | YES | NULL | Note |
| `dead_letter_at` | TIMESTAMPTZ | YES | NULL | OK |
| `patient_id` | UUID FK | YES | NULL | Note |
| `shell_file_id` | UUID FK | YES | NULL | Note |
| `narrative_id` | UUID FK | YES | NULL | OK |
| `job_result` | JSONB | YES | Updated with results | OK |
| `output_files` | TEXT[] | YES | NULL | OK |
| `created_at` | TIMESTAMPTZ NOT NULL | YES | Auto NOW() | OK |
| `updated_at` | TIMESTAMPTZ NOT NULL | YES | Updated | OK |

### Actual Data Sample (Latest Row)

```
id: dbd14255-69bd-41a7-850e-e76bc5ddc3ba
job_type: 'ai_processing'
job_lane: 'ai_queue_simple'
job_category: 'standard'
job_name: 'Pass 1: Vincent_Cheers_pages_75-79_lab_results.pdf'
job_payload: {
  mime_type: 'application/pdf',
  patient_id: 'd1dbe18c-...',
  storage_path: '...',
  shell_file_id: '43af751b-...',
  correlation_id: '3dfc2ae5-...',
  file_size_bytes: 144357,
  estimated_tokens: 1000,
  uploaded_filename: 'Vincent_Cheers_pages_75-79_lab_results.pdf'
}
status: 'completed'
started_at: 2025-12-01T09:55:58Z
completed_at: 2025-12-01T09:57:12Z
actual_duration: '00:01:14.673632'
retry_count: 0
worker_id: 'render-srv-d2qkja56ubrc73dh13q0-1764580682441'
job_result: {
  message: 'Pass 0.5 and Pass 1 completed successfully',
  success: true,
  pass_1_result: {
    success: true,
    sessionId: 'de7240e2-...',
    totalZones: 0,
    shellFileId: '43af751b-...',
    totalEntities: 165,
    totalDurationMs: 13162,
    encountersFailed: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    encountersProcessed: 7,
    encountersSucceeded: 7
  },
  pass_05_result: { ... }
}
memory_usage_mb: NULL
cpu_usage_percent: NULL
patient_id: NULL                          <-- In job_payload instead
shell_file_id: NULL                       <-- In job_payload instead
```

### Observations

1. **Direct FK columns NULL, data in job_payload**
   - `patient_id` and `shell_file_id` columns are NULL
   - Actual values stored in `job_payload` JSONB
   - Impact: Low - data is available, just requires JSONB extraction
   - Per design doc Section 5.2: "No changes needed"

2. **Resource metrics not captured**
   - `memory_usage_mb`, `cpu_usage_percent` always NULL
   - Impact: Low - resource monitoring done at Render level

3. **Locking columns not used**
   - `lock_acquired_at`, `lock_expires_at`, `heartbeat_at` always NULL
   - The worker uses different locking mechanism (Supabase RPC)
   - Impact: None - design doc says "no changes needed"

4. **job_result contains comprehensive Pass 1 results**
   - Success/failure, entity counts, timing all properly captured
   - This is the primary success indicator

### Verdict: CORRECT

Job queue is working as designed. Per Section 5.2: "Existing `error_details` JSONB field can store our standardized error structure. No new columns needed."

---

## 5. shell_files Audit

### Relevant Columns for Pass 1

| Column | Purpose | Code Writes | Actual Value |
|--------|---------|-------------|--------------|
| `status` | Processing stage | Updated to 'pass1_complete' | 'pass1_complete' |
| `updated_at` | Last modification | Updated | Timestamp |

### Code Reference

```typescript
// pass1-v2-database.ts lines 722-738
export async function updateShellFileStatus(
  supabase: SupabaseClient,
  shellFileId: string,
  status: string = 'pass1_complete'
): Promise<void> {
  const { error } = await supabase
    .from('shell_files')
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', shellFileId);
  // ... error handling
}
```

### Verdict: CORRECT

The shell_files.status is properly updated to 'pass1_complete' on success or 'failed' on failure.

---

## Summary

### What Works Correctly

| Table | Status | Notes |
|-------|--------|-------|
| `pass1_entity_metrics` | CORRECT | All Strategy-A columns populated |
| `ai_processing_sessions` | CORRECT | `pass1_status` updated; session stays 'processing' (expected) |
| `ai_processing_summary` | N/A | Will be written by Pass 3, not Pass 1 |
| `job_queue` | CORRECT | Comprehensive results in `job_result` |
| `shell_files` | CORRECT | Status updated to 'pass1_complete' |

### Minor Future Improvements (Not Urgent)

These are nice-to-haves for when Pass 2/3 are built:

1. **Token aggregation in `pass1_entity_metrics`**
   - Currently: Tokens tracked per-batch, metrics-level shows 0
   - Data IS available in `pass1_batch_results`, just not summarized
   - Impact: Low - detailed data exists

2. **`entity_types_found` in `pass1_entity_metrics`**
   - Currently: Always NULL
   - Impact: Very low - derivable from `pass1_entity_detections`

3. **`completed_steps` in `ai_processing_sessions`**
   - Could increment after each pass completes
   - Impact: Very low - individual `pass{N}_status` columns are more useful

4. **Session-level error columns**
   - `failure_pass`, `failure_encounter_id`, `error_code_v2` could be populated on failure
   - Error info currently in `pass1_entity_metrics` - works fine

### NOT Issues (Clarification)

These were initially flagged but are actually correct behavior:

| Item | Why It's Correct |
|------|------------------|
| `ai_processing_summary` empty | Written by Pass 3, not Pass 1 |
| `session_status` stays 'processing' | Session isn't complete until Pass 3 |
| `processing_completed_at` stays NULL | Only set when full pipeline completes |

---

## Recommendations

### For Pass 1 (Now)

No changes needed. Pass 1 observability is working correctly.

### For Pass 3 (Future)

When Pass 3 is implemented, it should:
1. Write to `ai_processing_summary` with final pipeline results
2. Set `ai_processing_sessions.session_status` to 'completed' or 'failed'
3. Set `ai_processing_sessions.processing_completed_at`
4. Calculate and set `total_processing_time`

### Optional Improvements (Low Priority)

1. Aggregate tokens from batch level to metrics level
2. Populate `entity_types_found` array
3. Increment `completed_steps` after each pass

---

## Appendix: Code Locations

### Pass 1 Database Functions

| Function | File | Lines | Tables Written |
|----------|------|-------|----------------|
| `updatePass1Metrics()` | pass1-v2-database.ts | 499-531 | pass1_entity_metrics |
| `updateSessionPass1Status()` | pass1-v2-database.ts | 465-482 | ai_processing_sessions |
| `updateShellFileStatus()` | pass1-v2-database.ts | 722-738 | shell_files |
| `createEncounterResult()` | pass1-v2-database.ts | 43-75 | pass1_encounter_results |
| `updateEncounterResult()` | pass1-v2-database.ts | 84-100 | pass1_encounter_results |
| `createBatchResult()` | pass1-v2-database.ts | 176-202 | pass1_batch_results |
| `markBatchSucceeded()` | pass1-v2-database.ts | 252-283 | pass1_batch_results |
| `markBatchFailed()` | pass1-v2-database.ts | 294-310 | pass1_batch_results |
| `insertEntityDetections()` | pass1-v2-database.ts | 322-337 | pass1_entity_detections |
| `insertBridgeSchemaZones()` | pass1-v2-database.ts | 357-375 | pass1_bridge_schema_zones |

### Future Functions (To Be Created for Pass 3)

| Function (TBD) | Table | Purpose |
|----------------|-------|---------|
| `createProcessingSummary()` | ai_processing_summary | Final pipeline report card |
| `completeSession()` | ai_processing_sessions | Set session_status, completed_at |
