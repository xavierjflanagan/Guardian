# Hierarchical Observability System for AI Processing Pipeline

**Created:** 2025-11-29
**Status:** Design Phase
**Scope:** AI Processing Pipeline (Pass 0.5 through Pass 3)

> **Implementation Tracking:** All implementation tasks are tracked in `PASS1-STRATEGY-A-MASTER.md` Phase 1-2. This document serves as the detailed design reference for table schemas, SQL migrations, error codes, and code patterns.

---

## 1. Scope and Boundaries

### What This Document Covers

This document defines the observability architecture for the **AI Processing Pipeline**:

```
AI Processing Pipeline (IN SCOPE):
├── Pass 0.5: Encounter Discovery
├── Pass 1: Entity Detection
├── Pass 1.5: Code Shortlisting
├── Pass 2: Clinical Enrichment
└── Pass 3: Narrative Generation
```

### What This Document Does NOT Cover

**Pre-AI Processing Stages** are intentionally omitted from this design:

```
Pre-AI Processing (OUT OF SCOPE - Future Work):
├── File Upload (shell_file creation, storage)
├── Format Processing (PDF/TIFF page extraction)
├── Image Optimization (downscaling, compression)
└── OCR Processing (Google Cloud Vision batching)
```

These stages have their own performance characteristics and failure modes. A future `file_pipeline_*` table family may be created to track them, along with a `master_pipeline_summary` table that aggregates across both pre-AI and AI stages.

### Future Expansion Path

```
FUTURE HIERARCHY (not implemented now):
master_pipeline_summary (1 per shell_file)
  ├── file_pipeline_summary (pre-AI stages)
  │     ├── upload_metrics
  │     ├── format_processing_metrics
  │     └── ocr_processing_metrics
  │
  └── ai_processing_summary (AI stages) ← CURRENT FOCUS
        ├── pass05_encounter_metrics
        ├── pass1_entity_metrics + pass1_batch_results + pass1_encounter_results
        ├── pass2_clinical_metrics
        └── pass3_narrative_metrics
```

---

## 2. Current State Analysis

### Pass 0.5 Tables (Well-Designed - Use as Pattern)

Pass 0.5 has excellent hierarchical observability:

| Table | Level | Purpose |
|-------|-------|---------|
| `pass05_progressive_sessions` | Session | Root tracking, token metrics, timestamps |
| `pass05_chunk_results` | Chunk | Per-chunk metrics, `error_message`, `error_details` |
| `pass05_pending_encounters` | Encounter | Temporary encounter tracking with full lifecycle |
| `pass05_page_assignments` | Page | Page-to-encounter mapping |
| `pass05_encounter_metrics` | Summary | Final aggregated metrics |
| `pass05_cascade_chains` | Cascade | Cross-chunk encounter tracking |
| `pass05_reconciliation_log` | Audit | Reconciliation decision audit trail |

**Key Pattern:** Pass 0.5 tracks at multiple granularities (session → chunk → encounter → page) with error tracking at the chunk level.

### Pass 1/2/3 Tables (Gaps Identified)

| Table | Level | Gap |
|-------|-------|-----|
| `pass1_entity_metrics` | Session only | No batch-level or encounter-level tracking |
| `pass2_clinical_metrics` | Session only | No zone-level tracking |
| `pass3_narrative_metrics` | Session only | Limited granularity |
| `ai_processing_summary` | Shell file | Only shows WHAT failed, not WHY |

**Key Gap:** No batch-level or encounter-level tracking for Pass 1+. Cannot drill down into failures.

### Existing Cross-Pipeline Tables

| Table | Purpose | Keep/Modify |
|-------|---------|-------------|
| `ai_processing_sessions` | Root session tracking | KEEP - add columns (see Section 5.3) |
| `ai_processing_summary` | Final report card | KEEP - add columns (see Section 5.1) |
| `job_queue` | Job execution tracking | KEEP - no changes needed (see Section 5.2) |

---

## 3. Architecture Design

### 3.1 Table Naming Convention

All AI processing observability tables use the `ai_processing_` or `pass{N}_` prefix:

| Prefix | Scope | Examples |
|--------|-------|----------|
| `ai_processing_*` | Cross-pass tracking | `ai_processing_sessions`, `ai_processing_summary` |
| `pass05_*` | Pass 0.5 specific | `pass05_chunk_results`, `pass05_encounter_metrics` |
| `pass1_*` | Pass 1 specific | `pass1_entity_metrics`, `pass1_batch_results` |
| `pass2_*` | Pass 2 specific | `pass2_clinical_metrics` |
| `pass3_*` | Pass 3 specific | `pass3_narrative_metrics` |

**Note:** The `ai_pipeline_*` prefix was considered but rejected to avoid migration complexity. Existing table names are retained.

### 3.2 Table Hierarchy

```
shell_files
  └── job_queue (1 row per processing job)
        │
        └── ai_processing_sessions (1 row - root AI session)
              │
              ├── ai_processing_summary (1 row - final report card)
              │
              ├── pass05_progressive_sessions (1 row)
              │     ├── pass05_chunk_results (N rows - 1 per chunk)
              │     ├── pass05_pending_encounters (N rows - temporary)
              │     └── pass05_encounter_metrics (1 row - summary)
              │
              ├── pass1_entity_metrics (1 row - summary) [MODIFIED]
              │     ├── pass1_encounter_results (N rows - 1 per encounter) [NEW]
              │     │     └── pass1_batch_results (N rows - 1 per batch) [NEW]
              │     └── pass1_entity_detections (N rows - entities)
              │
              ├── pass2_clinical_metrics (1 row - summary)
              │     └── pass2_zone_results (N rows - 1 per zone) [FUTURE]
              │
              └── pass3_narrative_metrics (1 row - summary)
```

### 3.3 Design Principles

1. **Structured over Event-Sourced**: Use dedicated tables with clear schemas, not a generic event log
2. **Match Pass 0.5 Pattern**: Bring Pass 1+ observability to the same standard as Pass 0.5
3. **Error Details at Granular Level**: Store `error_code`, `error_message` at batch level, not just session level
4. **Aggregation Flows Upward**: Batch results → Encounter results → Pass metrics → Pipeline summary
5. **Healthcare Compliance**: Immutable audit trail, no PII in error messages

---

## 4. New Table Schemas

### 4.1 pass1_batch_results (NEW)

Tracks each batch within an encounter's Pass 1 processing.

```sql
CREATE TABLE pass1_batch_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Hierarchy
  healthcare_encounter_id UUID NOT NULL REFERENCES healthcare_encounters(id) ON DELETE CASCADE,
  pass1_encounter_result_id UUID NOT NULL REFERENCES pass1_encounter_results(id) ON DELETE CASCADE,
  processing_session_id UUID REFERENCES ai_processing_sessions(id),

  -- Batch identification
  batch_index INTEGER NOT NULL,  -- 0-based index within encounter
  page_range_start INTEGER NOT NULL,
  page_range_end INTEGER NOT NULL,

  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'succeeded', 'failed'
  )),

  -- Retry tracking
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- AI metrics
  ai_model_used TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,

  -- Error tracking (populated on failure)
  error_code TEXT,  -- Standardized error code (see Section 6)
  error_message TEXT,  -- Human-readable message
  error_context JSONB,  -- Additional context (no PII)

  -- Transient failure tracking (populated even on success if retries occurred)
  had_transient_failure BOOLEAN DEFAULT FALSE,
  transient_error_history JSONB,  -- Array of {attempt, error_code, error_message, timestamp}

  -- Output metrics (populated on success)
  entities_detected INTEGER,
  zones_detected INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_pass1_batch_encounter ON pass1_batch_results(healthcare_encounter_id);
CREATE INDEX idx_pass1_batch_status ON pass1_batch_results(status) WHERE status IN ('pending', 'processing', 'failed');
CREATE INDEX idx_pass1_batch_failed ON pass1_batch_results(healthcare_encounter_id) WHERE status = 'failed';
CREATE INDEX idx_pass1_batch_stale ON pass1_batch_results(started_at) WHERE status = 'processing';  -- For stale batch detection
CREATE INDEX idx_pass1_batch_transient ON pass1_batch_results(healthcare_encounter_id) WHERE had_transient_failure = TRUE;

-- Unique constraint: one row per batch per encounter
CREATE UNIQUE INDEX idx_pass1_batch_unique ON pass1_batch_results(healthcare_encounter_id, batch_index);

COMMENT ON TABLE pass1_batch_results IS
  'Per-batch processing results for Pass 1 entity detection. Tracks retry attempts, errors, and metrics at batch granularity.';
```

### 4.2 pass1_encounter_results (NEW)

Tracks each encounter's Pass 1 processing status and aggregated batch metrics.

```sql
CREATE TABLE pass1_encounter_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Hierarchy
  shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
  healthcare_encounter_id UUID NOT NULL REFERENCES healthcare_encounters(id) ON DELETE CASCADE,
  processing_session_id UUID REFERENCES ai_processing_sessions(id),
  patient_id UUID NOT NULL REFERENCES user_profiles(id),

  -- Encounter scope
  page_count INTEGER NOT NULL,

  -- Batching info
  batching_used BOOLEAN DEFAULT FALSE,
  batches_total INTEGER DEFAULT 1,

  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'succeeded', 'failed'
  )),

  -- Batch aggregates (updated as batches complete)
  batches_succeeded INTEGER DEFAULT 0,
  batches_failed INTEGER DEFAULT 0,
  total_retries_used INTEGER DEFAULT 0,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_duration_ms INTEGER,

  -- AI metrics (aggregated from batches)
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,

  -- Output metrics (aggregated from batches)
  total_entities_detected INTEGER DEFAULT 0,
  total_zones_detected INTEGER DEFAULT 0,

  -- Error summary (populated if any batch failed permanently)
  failure_batch_index INTEGER,  -- Which batch caused the failure
  error_code TEXT,
  error_summary TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_pass1_encounter_shell ON pass1_encounter_results(shell_file_id);
CREATE INDEX idx_pass1_encounter_status ON pass1_encounter_results(status);
CREATE INDEX idx_pass1_encounter_failed ON pass1_encounter_results(shell_file_id) WHERE status = 'failed';

-- Unique constraint: one row per encounter
CREATE UNIQUE INDEX idx_pass1_encounter_unique ON pass1_encounter_results(healthcare_encounter_id);

COMMENT ON TABLE pass1_encounter_results IS
  'Per-encounter processing results for Pass 1. Aggregates batch results and provides encounter-level status tracking.';
```

### 4.3 pass1_entity_metrics (MODIFIED)

**Current Schema (Live in DB):**
```sql
-- EXISTING COLUMNS (verified via Supabase MCP 2025-11-29)
pass1_entity_metrics (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL,
  shell_file_id UUID NOT NULL,
  processing_session_id UUID NOT NULL,
  entities_detected INTEGER NOT NULL,
  processing_time_ms INTEGER NOT NULL,
  processing_time_minutes NUMERIC GENERATED,
  vision_model_used TEXT NOT NULL,      -- LEGACY: Strategy-A is OCR-only
  ocr_model_used TEXT,
  ocr_agreement_average NUMERIC,        -- LEGACY: No cross-validation in Strategy-A
  confidence_distribution JSONB,        -- LEGACY: No confidence scores in Strategy-A
  entity_types_found TEXT[],
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  ocr_pages_processed INTEGER,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ
)
```

**Proposed Migration:**
```sql
-- Add new columns for batch/encounter tracking
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS ai_model_used TEXT;  -- Replaces vision_model_used
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS encounters_total INTEGER;
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS encounters_succeeded INTEGER;
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS encounters_failed INTEGER;
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS batches_total INTEGER;
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS batches_succeeded INTEGER;
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS total_retries_used INTEGER;
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS failure_encounter_id UUID REFERENCES healthcare_encounters(id);
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE pass1_entity_metrics ADD COLUMN IF NOT EXISTS error_summary TEXT;

-- Legacy columns to STOP WRITING (leave in schema for backward compatibility):
-- vision_model_used, ocr_agreement_average, confidence_distribution
-- Strategy-A writes to ai_model_used instead of vision_model_used
```

---

## 5. Modifications to Existing Tables

### 5.1 ai_processing_summary (ADD COLUMNS)

**Current Schema (Live in DB):**
```sql
-- EXISTING COLUMNS (verified via Supabase MCP 2025-11-29)
ai_processing_summary (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL,
  shell_file_id UUID NOT NULL,
  processing_status TEXT NOT NULL,          -- CHECK: 'initialized', 'pass1_only', 'pass1_pass2', 'complete_pipeline', 'failed'
  overall_success BOOLEAN NOT NULL,
  failure_stage TEXT,                        -- 'pass1', 'pass2', 'pass3'
  total_processing_time_ms INTEGER NOT NULL,
  total_tokens_used INTEGER NOT NULL,
  total_cost_usd NUMERIC NOT NULL,
  overall_confidence_score NUMERIC,          -- LEGACY: No confidence in Strategy-A
  entities_extracted_total INTEGER,
  manual_review_required BOOLEAN DEFAULT FALSE,
  pass1_metrics_id UUID,                     -- FK to pass1_entity_metrics
  pass2_metrics_id UUID,                     -- FK to pass2_clinical_metrics
  pass3_metrics_id UUID,                     -- FK to pass3_narrative_metrics
  business_events JSONB DEFAULT '[]',
  user_agent TEXT,
  ip_address INET,
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
```

**Proposed Migration:**
```sql
-- Add Pass 0.5 reference (currently missing from schema)
ALTER TABLE ai_processing_summary ADD COLUMN IF NOT EXISTS pass05_metrics_id UUID REFERENCES pass05_encounter_metrics(id);

-- Add failure drill-down columns
ALTER TABLE ai_processing_summary ADD COLUMN IF NOT EXISTS failure_encounter_id UUID REFERENCES healthcare_encounters(id);
ALTER TABLE ai_processing_summary ADD COLUMN IF NOT EXISTS failure_batch_index INTEGER;
ALTER TABLE ai_processing_summary ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE ai_processing_summary ADD COLUMN IF NOT EXISTS error_drill_down JSONB;  -- Quick summary for UI

-- Legacy columns to STOP WRITING (leave in schema for backward compatibility):
-- overall_confidence_score
-- Strategy-A has no confidence scores; quality signal comes from Pass 1.5/Pass 2

-- NOTE: Table name kept as ai_processing_summary (no rename needed)
-- The ai_pipeline_* naming was considered but adds migration complexity for minimal benefit
```

### 5.2 job_queue (NO CHANGES REQUIRED)

**Current Schema (Live in DB - verified via Supabase MCP 2025-11-29):**

The `job_queue` table already has comprehensive error tracking:

| Column | Type | Purpose |
|--------|------|---------|
| `status` | text | Includes 'failed', 'completed', 'processing', etc. |
| `retry_count` | integer | Current retry attempt (default 0) |
| `max_retries` | integer | Maximum allowed retries (default 3) |
| `retry_delay` | interval | Delay between retries (default 5 min) |
| `last_error` | text | Human-readable error message |
| `error_details` | jsonb | Structured error context |
| `heartbeat_at` | timestamptz | Worker heartbeat for stale detection |
| `dead_letter_at` | timestamptz | When job moved to dead letter queue |

**Compatibility Assessment:**

Pass 1 failures integrate naturally with existing schema:

```typescript
// When Pass 1 fails, propagate to job_queue
await supabase
  .from('job_queue')
  .update({
    status: 'failed',
    last_error: 'Pass 1 failed: batch 3 exhausted retries',
    error_details: {
      stage: 'pass1',
      error_code: 'MAX_RETRIES_EXCEEDED',
      failure_encounter_id: 'enc-uuid',
      failure_batch_index: 3,
      underlying_error: 'RATE_LIMIT',
      attempt_history: [...]
    }
  })
  .eq('id', jobId);
```

**Verdict: No schema changes needed.** The existing `error_details` JSONB field can store our standardized error structure.

### 5.3 ai_processing_sessions (ADD COLUMNS)

**Current Schema (Live in DB - verified via Supabase MCP 2025-11-29):**
```sql
ai_processing_sessions (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL,
  shell_file_id UUID NOT NULL,
  session_type TEXT NOT NULL,
  session_status TEXT NOT NULL DEFAULT 'initiated',
  ai_model_name TEXT NOT NULL DEFAULT 'v3',
  model_config JSONB DEFAULT '{}',
  processing_mode TEXT,
  workflow_step TEXT NOT NULL DEFAULT 'entity_detection',
  total_steps INTEGER DEFAULT 5,
  completed_steps INTEGER DEFAULT 0,
  overall_confidence NUMERIC,              -- LEGACY: No confidence in Strategy-A
  requires_human_review BOOLEAN DEFAULT FALSE,
  quality_score NUMERIC,                   -- LEGACY: No quality score in Strategy-A
  processing_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_completed_at TIMESTAMPTZ,
  total_processing_time INTERVAL,
  error_message TEXT,
  error_context JSONB,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Assessment:**

The table already has good error tracking:
- `error_message` TEXT - human-readable error
- `error_context` JSONB - structured error details
- `retry_count` / `max_retries` - retry tracking
- `workflow_step` - tracks which pass is active

**Proposed Migration:**
```sql
-- Add pass-specific status fields for quick visibility
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS pass05_status TEXT
  CHECK (pass05_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS pass1_status TEXT
  CHECK (pass1_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS pass1_5_status TEXT
  CHECK (pass1_5_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS pass2_status TEXT
  CHECK (pass2_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS pass3_status TEXT
  CHECK (pass3_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));

-- Add failure drill-down reference
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS failure_pass TEXT;  -- Which pass failed
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS failure_encounter_id UUID REFERENCES healthcare_encounters(id);
ALTER TABLE ai_processing_sessions ADD COLUMN IF NOT EXISTS error_code TEXT;  -- Standardized error code

-- Legacy columns to STOP WRITING (leave in schema for backward compatibility):
-- overall_confidence, quality_score
-- Strategy-A has no confidence/quality scores at session level
```

**Rationale for pass-specific status columns:**
- Currently `workflow_step` only shows the CURRENT step, not the status of each
- Adding `pass{N}_status` columns allows quick visibility: "Pass 0.5 completed, Pass 1 failed, Pass 2 not started"
- Avoids need to query 5 different metrics tables to determine pipeline state

---

## 6. Error Code Taxonomy

Standardized error codes across all AI processing passes:

### 6.1 API Errors

| Code | Description | Retryable |
|------|-------------|-----------|
| `RATE_LIMIT` | API rate limit exceeded (429) | Yes |
| `API_TIMEOUT` | Request timed out | Yes |
| `API_5XX` | Provider server error (500-599) | Yes |
| `API_4XX` | Client error (400-499, not 429) | No |
| `API_AUTH` | Authentication/authorization error | No |

### 6.2 Processing Errors

| Code | Description | Retryable |
|------|-------------|-----------|
| `PARSE_JSON` | AI response not valid JSON | Yes (retry may get valid response) |
| `PARSE_SCHEMA` | AI response doesn't match expected schema | Yes |
| `CONTEXT_TOO_LARGE` | Input exceeds model context limit | No |
| `EMPTY_RESPONSE` | AI returned empty/null response | Yes |

### 6.3 Data Errors

| Code | Description | Retryable |
|------|-------------|-----------|
| `OCR_QUALITY_LOW` | OCR confidence below threshold | No |
| `NO_ENTITIES_FOUND` | No entities detected (may be valid) | No |
| `ENCOUNTER_NOT_FOUND` | Referenced encounter doesn't exist | No |

### 6.4 System Errors

| Code | Description | Retryable |
|------|-------------|-----------|
| `DB_ERROR` | Database operation failed | Yes |
| `INTERNAL_ERROR` | Unexpected system error | No |
| `MAX_RETRIES_EXCEEDED` | Batch exhausted all retry attempts | No |

### 6.5 Preserving Root Cause on Retry Exhaustion

When a batch exhausts all retries, `MAX_RETRIES_EXCEEDED` alone is not actionable. The `error_context` JSONB field MUST preserve the underlying cause:

```typescript
// When recording MAX_RETRIES_EXCEEDED, preserve attempt history
await supabase
  .from('pass1_batch_results')
  .update({
    status: 'failed',
    error_code: 'MAX_RETRIES_EXCEEDED',
    error_message: `Batch failed after ${maxRetries} attempts`,
    error_context: {
      final_underlying_error: lastError.code,  // e.g., 'RATE_LIMIT'
      final_underlying_message: lastError.message,
      attempt_history: attemptLog.map(a => ({
        attempt: a.attemptNumber,
        error_code: a.errorCode,
        error_message: a.message,
        timestamp: a.timestamp,
        retry_delay_ms: a.delayBeforeRetry
      }))
    }
  })
  .eq('id', batchResultId);
```

**Required `error_context` Fields for `MAX_RETRIES_EXCEEDED`:**

| Field | Type | Purpose |
|-------|------|---------|
| `final_underlying_error` | string | The error code from the last attempt |
| `final_underlying_message` | string | The error message from the last attempt |
| `attempt_history` | array | Full history of all retry attempts |

**Example `error_context` Value:**

```json
{
  "final_underlying_error": "RATE_LIMIT",
  "final_underlying_message": "429 Too Many Requests",
  "attempt_history": [
    { "attempt": 1, "error_code": "RATE_LIMIT", "timestamp": "2025-11-29T10:00:00Z", "retry_delay_ms": 1000 },
    { "attempt": 2, "error_code": "RATE_LIMIT", "timestamp": "2025-11-29T10:00:02Z", "retry_delay_ms": 2000 },
    { "attempt": 3, "error_code": "RATE_LIMIT", "timestamp": "2025-11-29T10:00:06Z", "retry_delay_ms": null }
  ]
}
```

This enables operators to identify patterns (e.g., "most retry exhaustions are due to rate limits, not server errors") and take corrective action.

---

## 7. Drill-Down Query Patterns

### 7.1 "Why did this shell_file fail?"

```sql
-- Step 1: Check pipeline summary
SELECT
  processing_status,
  failure_stage,
  error_code,
  overall_success
FROM ai_processing_summary
WHERE shell_file_id = 'X';

-- Result: { status: 'failed', failure_stage: 'pass1', error_code: 'MAX_RETRIES_EXCEEDED' }
```

### 7.2 "Which encounter failed in Pass 1?"

```sql
-- Step 2: Check encounter results
SELECT
  healthcare_encounter_id,
  status,
  batches_total,
  batches_succeeded,
  batches_failed,
  failure_batch_index,
  error_code,
  error_summary
FROM pass1_encounter_results
WHERE shell_file_id = 'X' AND status = 'failed';

-- Result: { encounter_id: 'enc-1', batches_total: 5, failed: 1, failure_batch_index: 3, error_code: 'RATE_LIMIT' }
```

### 7.3 "What happened to the failed batch?"

```sql
-- Step 3: Check batch results
SELECT
  batch_index,
  page_range_start,
  page_range_end,
  attempt_count,
  error_code,
  error_message,
  error_context
FROM pass1_batch_results
WHERE healthcare_encounter_id = 'enc-1' AND status = 'failed';

-- Result: { batch_index: 3, pages: 21-30, attempts: 3, error_code: 'RATE_LIMIT', message: '429 Too Many Requests after 3 retries' }
```

### 7.4 "Show me the full failure path"

```sql
-- Combined drill-down query
SELECT
  'shell_file' as level,
  s.id::text as id,
  aps.processing_status as status,
  aps.failure_stage as detail,
  aps.error_code
FROM shell_files s
JOIN ai_processing_summary aps ON aps.shell_file_id = s.id
WHERE s.id = 'X'

UNION ALL

SELECT
  'encounter' as level,
  per.healthcare_encounter_id::text as id,
  per.status,
  format('batches: %s/%s succeeded', per.batches_succeeded, per.batches_total) as detail,
  per.error_code
FROM pass1_encounter_results per
WHERE per.shell_file_id = 'X'

UNION ALL

SELECT
  'batch' as level,
  format('batch_%s', pbr.batch_index) as id,
  pbr.status,
  format('pages %s-%s, %s attempts', pbr.page_range_start, pbr.page_range_end, pbr.attempt_count) as detail,
  pbr.error_code
FROM pass1_batch_results pbr
JOIN pass1_encounter_results per ON per.id = pbr.pass1_encounter_result_id
WHERE per.shell_file_id = 'X'

ORDER BY level, id;
```

---

## 8. Integration with Retry Logic

### 8.1 Batch Processing Flow

```typescript
async function processPass1Batch(batch: Batch, encounterResultId: string): Promise<void> {
  // Create batch result record
  const batchResult = await supabase
    .from('pass1_batch_results')
    .insert({
      healthcare_encounter_id: batch.encounterId,
      pass1_encounter_result_id: encounterResultId,
      batch_index: batch.index,
      page_range_start: batch.pageStart,
      page_range_end: batch.pageEnd,
      status: 'processing',
      started_at: new Date().toISOString()
    })
    .select('id')
    .single();

  try {
    const result = await callOpenAI(batch);

    // Update on success
    await supabase
      .from('pass1_batch_results')
      .update({
        status: 'succeeded',
        completed_at: new Date().toISOString(),
        duration_ms: calculateDuration(),
        entities_detected: result.entities.length,
        zones_detected: result.zones.length,
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens
      })
      .eq('id', batchResult.id);

  } catch (error) {
    // Update on failure
    await supabase
      .from('pass1_batch_results')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        attempt_count: currentAttempt,
        error_code: classifyError(error),
        error_message: error.message,
        error_context: { statusCode: error.status, retryable: isRetryable(error) }
      })
      .eq('id', batchResult.id);

    throw error;  // Propagate for retry logic
  }
}
```

### 8.2 Retry-Until-Complete with Tracking

```typescript
async function processEncounterWithTracking(
  encounter: Encounter,
  encounterResultId: string
): Promise<void> {
  const batches = splitIntoBatches(encounter);

  // Update encounter result with batch count
  await supabase
    .from('pass1_encounter_results')
    .update({ batches_total: batches.length, batching_used: batches.length > 1 })
    .eq('id', encounterResultId);

  // ... retry-until-complete logic from PASS1-STRATEGY-A-MASTER.md ...

  // On completion, aggregate batch results
  const batchAggregates = await supabase
    .from('pass1_batch_results')
    .select('status, attempt_count, entities_detected, zones_detected, input_tokens, output_tokens')
    .eq('pass1_encounter_result_id', encounterResultId);

  await supabase
    .from('pass1_encounter_results')
    .update({
      status: allSucceeded ? 'succeeded' : 'failed',
      batches_succeeded: countSucceeded(batchAggregates),
      batches_failed: countFailed(batchAggregates),
      total_retries_used: sumRetries(batchAggregates),
      total_entities_detected: sumEntities(batchAggregates),
      total_input_tokens: sumInputTokens(batchAggregates),
      // ... etc
    })
    .eq('id', encounterResultId);
}
```

---

## 9. Edge Case Handling

### 9.1 Transient Failure Tracking

When a batch fails but succeeds on retry, we preserve the failure history:

```typescript
// Track errors during retry loop
const attemptLog: AttemptRecord[] = [];

for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    const result = await callOpenAI(batch);

    // Success - but did we have transient failures?
    if (attemptLog.length > 0) {
      await supabase
        .from('pass1_batch_results')
        .update({
          status: 'succeeded',
          had_transient_failure: true,
          transient_error_history: attemptLog,
          attempt_count: attempt,
          // ... other success fields
        })
        .eq('id', batchResultId);
    } else {
      // Clean success on first attempt
      await supabase
        .from('pass1_batch_results')
        .update({
          status: 'succeeded',
          had_transient_failure: false,
          attempt_count: 1,
          // ... other success fields
        })
        .eq('id', batchResultId);
    }
    return result;

  } catch (error) {
    attemptLog.push({
      attempt,
      error_code: classifyError(error),
      error_message: error.message,
      timestamp: new Date().toISOString()
    });

    if (attempt === maxRetries) {
      // Final failure - use MAX_RETRIES_EXCEEDED pattern from Section 6.5
      throw error;
    }

    await sleep(backoffDelay(attempt));
  }
}
```

**Query for batches with transient failures:**
```sql
SELECT
  healthcare_encounter_id,
  batch_index,
  attempt_count,
  transient_error_history
FROM pass1_batch_results
WHERE had_transient_failure = TRUE
  AND status = 'succeeded';
```

### 9.2 Stale Batch Detection

If a worker crashes mid-processing, batches remain stuck in `status: 'processing'`. Detect and reset stale batches:

```sql
-- Find stale batches (processing for > 10 minutes)
UPDATE pass1_batch_results
SET
  status = 'pending',
  attempt_count = attempt_count  -- Don't reset attempt count
WHERE status = 'processing'
  AND started_at < NOW() - INTERVAL '10 minutes'
RETURNING id, healthcare_encounter_id, batch_index;
```

**Implementation notes:**
- Run as periodic cleanup job (every 5 minutes)
- Log reset batches for monitoring
- Preserved `attempt_count` means batch won't get unlimited retries

### 9.3 Provider Outage Pattern Detection

When all batches fail with the same root cause, it likely indicates a provider outage rather than document-specific issues:

```sql
-- Detect outage pattern for a shell_file
WITH batch_errors AS (
  SELECT
    error_context->>'final_underlying_error' as root_cause,
    COUNT(*) as failed_count
  FROM pass1_batch_results pbr
  JOIN pass1_encounter_results per ON per.id = pbr.pass1_encounter_result_id
  WHERE per.shell_file_id = 'X'
    AND pbr.status = 'failed'
  GROUP BY error_context->>'final_underlying_error'
)
SELECT
  root_cause,
  failed_count,
  CASE
    WHEN failed_count > 5 AND root_cause IN ('API_5XX', 'API_TIMEOUT', 'RATE_LIMIT')
    THEN 'LIKELY_OUTAGE'
    ELSE 'INDIVIDUAL_FAILURES'
  END as assessment
FROM batch_errors;
```

### 9.4 Job Timeout vs Retry Backoff

Ensure job timeout exceeds maximum possible retry duration:

```
Max retry time = 3 attempts x 60s max backoff = 180 seconds
Recommended job timeout = 300 seconds (5 minutes) minimum
```

If backoff would exceed remaining job time, skip retry and fail immediately with context:

```typescript
const remainingJobTime = jobDeadline - Date.now();
const nextBackoffDelay = calculateBackoff(attempt);

if (nextBackoffDelay > remainingJobTime) {
  // Would exceed job timeout - fail now with context
  throw new Error(`Retry backoff (${nextBackoffDelay}ms) exceeds remaining job time (${remainingJobTime}ms)`);
}
```

---

## 10. Implementation Tasks

> **Note:** Implementation progress is tracked in `PASS1-STRATEGY-A-MASTER.md`. The sections below map this document's designs to MASTER tasks.

### Phase 1: Database Schema (MASTER Phase 1)

| Task | This Document Reference |
|------|------------------------|
| Create `pass1_batch_results` table | Section 4.1 |
| Create `pass1_encounter_results` table | Section 4.2 |
| Add columns to `pass1_entity_metrics` | Section 4.3 |
| Add columns to `ai_processing_summary` | Section 5.1 |
| Add columns to `ai_processing_sessions` | Section 5.3 |
| Verify `job_queue` compatibility | Section 5.2 (no changes needed) |
| Add RLS policies for new tables | Service role write, user read |

### Phase 2: Worker Integration (MASTER Phase 2)

| Task | This Document Reference |
|------|------------------------|
| Create encounter result record at start | Section 8.2 |
| Create batch result record per batch | Section 8.1 |
| Update batch result on success/failure | Section 8.1 |
| Preserve transient error history on success | Section 9.1 |
| Aggregate batch results to encounter | Section 8.2 |
| Propagate failure info to pipeline summary | Section 7.1-7.4 (drill-down queries) |

### Phase 3: Error Handling (MASTER Phase 2)

| Task | This Document Reference |
|------|------------------------|
| Implement `classifyError()` function | Section 6.1-6.4 (error taxonomy) |
| Implement `isRetryable()` function | Section 6.1-6.4 (retryable flags) |
| Preserve root cause on retry exhaustion | Section 6.5 |
| Implement stale batch detection | Section 9.2 |
| Implement job timeout vs backoff check | Section 9.4 |

---

## 11. Relationship to PASS1-STRATEGY-A-MASTER.md

This document extends the Pass 1 Strategy-A design with observability infrastructure:

| MASTER.md Section | This Document |
|-------------------|---------------|
| Section 8.3: Retry-Until-Complete | Section 8: Integration with tracking |
| Section 8.4: Status Updates | Section 5: Pipeline summary updates |
| Section 4.5: TypeScript Types | Add `BatchResult`, `EncounterResult` types |
| Phase 2: Core Implementation | Phase 2: Worker Integration tasks |

**Dependency:** The `pass1_batch_results` and `pass1_encounter_results` tables must be created before implementing the retry-until-complete logic with proper tracking.

---

## 12. Design Decisions Log

| Decision | Date | Rationale |
|----------|------|-----------|
| Structured tables over event log | 2025-11-29 | Easier to query, clearer schema, same information with better ergonomics |
| Match Pass 0.5 hierarchy pattern | 2025-11-29 | Pass 0.5 has proven design with session → chunk → encounter granularity |
| Error codes at batch level | 2025-11-29 | Most granular failure point; aggregates upward to encounter → pass → pipeline |
| Scope to AI pipeline only | 2025-11-29 | Pre-AI stages (upload, OCR) have different characteristics; future `file_pipeline_*` tables |
| Use `ai_processing_*` prefix for cross-pass tables | 2025-11-29 | Existing naming convention (`ai_processing_sessions`, `ai_processing_summary`). Distinguishes from future `file_pipeline_*` and `master_pipeline_*` tables |
| Preserve root cause on retry exhaustion | 2025-11-29 | `MAX_RETRIES_EXCEEDED` alone is not actionable; `error_context` must contain attempt history and final underlying error |
| No Pass 1.5 metrics table needed | 2025-11-29 | Pass 1.5 is a pgvector search (no AI API calls), not an AI processing pass; existing session status fields suffice |
| Entity-to-batch FK not required | 2025-11-29 | Batch membership derivable via page_number + page_range overlap; avoids unnecessary coupling |
| Retention policy deferred | 2025-11-29 | Valid concern but premature; schema includes created_at for future retention implementation |
| Track transient failures even on success | 2025-11-29 | `had_transient_failure` + `transient_error_history` preserved even when batch eventually succeeds, enabling visibility into retry patterns |
| Stale batch detection via started_at | 2025-11-29 | Batches stuck in `processing` for >10 min are reset to `pending` (preserving attempt_count). Handles worker crash scenarios |
| Job timeout > max retry duration | 2025-11-29 | Job timeout must exceed 3 retries x 60s max backoff = 180s. Recommended: 300s (5 min) minimum |
| Transaction per batch (not per entity) | 2025-11-29 | If any entity in a batch fails to insert, entire batch rolls back and retries. Simpler to reason about than entity-level error handling |
| Keep table name `ai_processing_summary` | 2025-11-29 | Originally considered renaming to `ai_pipeline_summary` but adds migration complexity for minimal semantic benefit. Keep existing name. |
| Legacy columns left in schema | 2025-11-29 | `vision_model_used`, `ocr_agreement_average`, `confidence_distribution` remain in `pass1_entity_metrics` but Strategy-A stops writing to them. Avoids breaking existing queries/reports. |
| `job_queue` schema unchanged | 2025-11-29 | Existing `error_details` JSONB field can store our standardized error structure. No new columns needed. |
| Keep table names (no renames) | 2025-11-29 | `ai_processing_sessions` and `ai_processing_summary` kept as-is. `ai_pipeline_*` naming rejected to avoid migration complexity. |
| Add pass-specific status columns to sessions | 2025-11-29 | `pass05_status`, `pass1_status`, etc. columns added to `ai_processing_sessions` for quick pipeline state visibility without querying 5 metrics tables. |
