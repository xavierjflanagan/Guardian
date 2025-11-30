# ai_processing_sessions Bridge Schema (Source) - Pass 1 CREATE Version

**Status:** ✅ Created from Database Schema
**Database Source:** /current_schema/04_ai_processing.sql (lines 99-145)
**Last Updated:** 1 October 2025
**Priority:** CRITICAL - Session coordination across passes, multi-pass table

## Multi-Pass Context

- **This is the Pass 1 CREATE version of ai_processing_sessions**
- Pass 1 creates session record and tracks entity detection progress
- Pass 2 will UPDATE with clinical enrichment status and completion
- Referenced by all metrics tables via processing_session_id (cross-pass join key)

## Database Table Structure (Pass 1 CREATE Fields)

```sql
CREATE TABLE IF NOT EXISTS ai_processing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,

    -- Session metadata (Pass 1 CREATE)
    session_type TEXT NOT NULL CHECK (session_type IN (
        'shell_file_processing', 'entity_extraction', 'clinical_validation',
        'profile_classification', 'decision_support', 'semantic_processing'
    )),
    session_status TEXT NOT NULL DEFAULT 'initiated' CHECK (session_status IN (
        'initiated', 'processing', 'completed', 'failed', 'cancelled'
    )),

    -- AI model configuration (Pass 1 CREATE)
    ai_model_version TEXT NOT NULL DEFAULT 'v3',
    model_config JSONB DEFAULT '{}',
    processing_mode TEXT CHECK (processing_mode IN ('automated', 'human_guided', 'validation_only')),

    -- Processing workflow (Pass 1 CREATE initializes, Pass 2 updates)
    workflow_step TEXT NOT NULL DEFAULT 'entity_detection' CHECK (workflow_step IN (
        'entity_detection', 'profile_classification', 'clinical_extraction',
        'semantic_processing', 'validation', 'decision_support', 'completed'
    )),
    total_steps INTEGER DEFAULT 5,
    completed_steps INTEGER DEFAULT 0,

    -- Quality metrics (Pass 1 initializes, Pass 2 may update)
    overall_confidence NUMERIC(4,3) CHECK (overall_confidence BETWEEN 0 AND 1),
    requires_human_review BOOLEAN DEFAULT FALSE,
    quality_score NUMERIC(4,3) CHECK (quality_score BETWEEN 0 AND 1),

    -- Processing times (Pass 1 sets started_at, Pass 2 sets completed_at)
    processing_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_completed_at TIMESTAMPTZ,
    total_processing_time INTERVAL,

    -- Error handling (Pass 1 or Pass 2 populates on failure)
    error_message TEXT,
    error_context JSONB,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## AI Extraction Requirements for Pass 1 CREATE

This table coordinates multi-pass processing. Pass 1 CREATES the session and tracks entity detection progress.

### Required Fields (Pass 1 CREATE)

```typescript
interface AIProcessingSessionsPass1CreateExtraction {
  // REQUIRED FIELDS
  patient_id: string;                      // UUID - which patient this session processes
  shell_file_id: string;                   // UUID - which file is being processed
  session_type: 'shell_file_processing' | 'entity_extraction' | 'clinical_validation' |
                'profile_classification' | 'decision_support' | 'semantic_processing';

  // SESSION STATUS (Pass 1 initializes)
  session_status?: 'initiated' | 'processing' | 'completed' | 'failed' | 'cancelled';  // Default: 'initiated'

  // AI MODEL CONFIGURATION (Pass 1 sets)
  ai_model_version?: string;               // Default: 'v3'
  model_config?: object;                   // JSONB - model parameters
  processing_mode?: 'automated' | 'human_guided' | 'validation_only';

  // WORKFLOW TRACKING (Pass 1 initializes)
  workflow_step?: 'entity_detection' | 'profile_classification' | 'clinical_extraction' |
                  'semantic_processing' | 'validation' | 'decision_support' | 'completed';  // Default: 'entity_detection'
  total_steps?: number;                    // Default: 5
  completed_steps?: number;                // Default: 0

  // QUALITY METRICS (Pass 1 may set initial values)
  overall_confidence?: number;             // NUMERIC(4,3) - 0.000-1.000
  requires_human_review?: boolean;         // Default: false
  quality_score?: number;                  // NUMERIC(4,3) - 0.000-1.000

  // PROCESSING TIMES (Pass 1 sets started_at)
  processing_started_at?: string;          // TIMESTAMPTZ - defaults to NOW()
  processing_completed_at?: null;          // Pass 1 leaves null, Pass 2 sets
  total_processing_time?: null;            // Pass 1 leaves null, Pass 2 calculates

  // ERROR HANDLING (Pass 1 populates if entity detection fails)
  error_message?: string;
  error_context?: object;                  // JSONB
  retry_count?: number;                    // Default: 0
  max_retries?: number;                    // Default: 3
}
```

## Example Extractions (Pass 1 CREATE)

### Example 1: Shell File Processing Session
```json
{
  "patient_id": "uuid-of-patient",
  "shell_file_id": "uuid-of-shell-file",
  "session_type": "shell_file_processing",
  "session_status": "processing",
  "ai_model_version": "v3",
  "model_config": {
    "vision_model": "gpt-4o",
    "ocr_provider": "google-cloud-vision",
    "enable_spatial_mapping": true
  },
  "processing_mode": "automated",
  "workflow_step": "entity_detection",
  "total_steps": 5,
  "completed_steps": 1,
  "overall_confidence": 0.850,
  "requires_human_review": false,
  "processing_started_at": "2025-01-01T12:34:56Z",
  "retry_count": 0,
  "max_retries": 3
}
```

### Example 2: Profile Classification Session
```json
{
  "patient_id": "uuid-of-patient",
  "shell_file_id": "uuid-of-shell-file",
  "session_type": "profile_classification",
  "session_status": "processing",
  "ai_model_version": "v3",
  "processing_mode": "automated",
  "workflow_step": "profile_classification",
  "total_steps": 3,
  "completed_steps": 1,
  "overall_confidence": 0.920,
  "requires_human_review": false,
  "processing_started_at": "2025-01-15T09:30:22Z"
}
```

### Example 3: Processing Failed During Pass 1
```json
{
  "patient_id": "uuid-of-patient",
  "shell_file_id": "uuid-of-shell-file",
  "session_type": "entity_extraction",
  "session_status": "failed",
  "ai_model_version": "v3",
  "processing_mode": "automated",
  "workflow_step": "entity_detection",
  "total_steps": 5,
  "completed_steps": 0,
  "overall_confidence": 0.350,
  "requires_human_review": true,
  "processing_started_at": "2025-01-20T14:05:12Z",
  "processing_completed_at": "2025-01-20T14:06:45Z",
  "total_processing_time": "00:01:33",
  "error_message": "Entity detection failed - document quality too low",
  "error_context": {
    "ocr_confidence": 0.35,
    "entities_detected": 0,
    "pass": "pass-1"
  },
  "retry_count": 2,
  "max_retries": 3
}
```
**Note:** `total_processing_time` is PostgreSQL INTERVAL type. String format shown ("00:01:33" for 1 minute 33 seconds) is JSON-compatible representation.

## Critical Notes (Pass 1 CREATE)

1. **Multi-Pass Coordination Table**: Session tracks progress across Pass 1, Pass 2, and Pass 3.

2. **Three Required NOT NULL Fields**: patient_id, shell_file_id, session_type.

3. **Session Type Enum**: 6 allowed values (including 'semantic_processing' for Pass 3).

4. **Session Status**: Defaults to 'initiated'. Pass 1 updates to 'processing', then Pass 2 updates to 'completed' or 'failed'.

5. **Workflow Step**: Defaults to 'entity_detection'. Pass 1 uses entity_detection and profile_classification. Pass 2 uses clinical_extraction.

6. **Progress Tracking**: total_steps and completed_steps track workflow progress. Pass 1 increments completed_steps during entity detection.

7. **Numeric Precision**: overall_confidence and quality_score use NUMERIC(4,3) - 0.000-1.000 with 3 decimal places.

8. **Processing Timestamps**: Pass 1 sets processing_started_at (defaults to NOW()). Pass 2 sets processing_completed_at.

9. **INTERVAL Type**: total_processing_time is PostgreSQL INTERVAL type (e.g., "00:01:33" for 1 minute 33 seconds).

10. **Error Handling**: If Pass 1 fails, populate error_message and error_context JSONB with pass='pass-1'.

11. **Foreign Key Cascade**: Both patient_id and shell_file_id use ON DELETE CASCADE.

12. **Referenced By**: All metrics tables reference this via processing_session_id (cross-pass join key).

13. **Model Config JSONB**: Flexible configuration object for AI model parameters.

14. **Human Review Flag**: requires_human_review can be set during Pass 1 if contamination risk detected.

15. **Retry Logic**: retry_count tracks attempts, max_retries defaults to 3.

## Schema Validation Checklist (Pass 1 CREATE)

- [ ] `patient_id` is a valid UUID (from context, NOT NULL)
- [ ] `shell_file_id` is a valid UUID (from context, NOT NULL)
- [ ] `session_type` is one of 6 enum values (NOT NULL)
- [ ] `session_status` is one of 5 enum values (defaults to 'initiated')
- [ ] `ai_model_version` defaults to 'v3' if not provided
- [ ] `model_config` (if provided) is valid JSONB object
- [ ] `processing_mode` (if provided) is one of 3 enum values
- [ ] `workflow_step` is one of 7 enum values (defaults to 'entity_detection')
- [ ] `total_steps` is positive integer (defaults to 5)
- [ ] `completed_steps` is non-negative integer (defaults to 0)
- [ ] `overall_confidence` (if provided) is between 0.000 and 1.000
- [ ] `quality_score` (if provided) is between 0.000 and 1.000
- [ ] `processing_started_at` defaults to NOW() if not provided
- [ ] `processing_completed_at` and `total_processing_time` are NULL in Pass 1 (unless session failed)
- [ ] `error_context` (if provided) is valid JSONB with pass='pass-1'
- [ ] `retry_count` defaults to 0
- [ ] `max_retries` defaults to 3

## Database Constraint Notes

- **NOT NULL constraints**: patient_id, shell_file_id, session_type, session_status, workflow_step, ai_model_version, processing_started_at
- **CHECK constraints**: session_type (6 values), session_status (5 values), processing_mode (3 values), workflow_step (7 values), overall_confidence (0-1), quality_score (0-1)
- **DEFAULT values**: session_status ('initiated'), ai_model_version ('v3'), model_config ('{}'), workflow_step ('entity_detection'), total_steps (5), completed_steps (0), requires_human_review (FALSE), processing_started_at (NOW()), retry_count (0), max_retries (3), created_at (NOW()), updated_at (NOW())
- **NUMERIC precision**: overall_confidence (4,3), quality_score (4,3)
- **JSONB objects**: model_config, error_context
- **INTERVAL type**: total_processing_time
- **FK references with CASCADE**: patient_id → user_profiles(id), shell_file_id → shell_files(id)
- **TIMESTAMPTZ fields**: processing_started_at, processing_completed_at, created_at, updated_at

## Pass 1 vs Pass 2 Field Ownership

**Pass 1 CREATE populates:**
- All session metadata (patient_id, shell_file_id, session_type)
- Session status (session_status='initiated' or 'processing')
- AI model configuration (ai_model_version, model_config, processing_mode)
- Initial workflow tracking (workflow_step='entity_detection', total_steps, completed_steps)
- Initial quality metrics (overall_confidence, requires_human_review, quality_score from Pass 1 entity detection)
- Processing start time (processing_started_at=NOW())
- Error handling (if Pass 1 fails: error_message, error_context with pass='pass-1', retry_count)

**Pass 2 UPDATE modifies:**
- session_status (update to 'completed' or 'failed')
- workflow_step (advance to 'clinical_extraction' then 'completed')
- completed_steps (increment as Pass 2 progresses)
- overall_confidence (may update with Pass 2 clinical confidence)
- quality_score (may update with Pass 2 quality metrics)
- processing_completed_at (set when Pass 2 finishes)
- total_processing_time (calculate from processing_started_at to processing_completed_at)
- error_message/error_context (if Pass 2 fails, populate with pass='pass-2')
- retry_count (increment if retrying)

**Pass 3 may use:**
- workflow_step='semantic_processing' for narrative generation
- session_type='semantic_processing' for Pass 3 sessions
