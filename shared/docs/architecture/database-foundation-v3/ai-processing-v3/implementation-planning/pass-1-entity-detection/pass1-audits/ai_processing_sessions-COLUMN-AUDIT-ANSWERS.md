# ai_processing_sessions Table - Column Audit Analysis

**Audit Date:** 2025-10-09
**Sample Record ID:** 05fc9450-d8c6-4ec7-aebb-a3d24bdd6610
**Patient ID:** d1dbe18c-afc2-421f-bd58-145ddb48cbca
**Shell File:** c3f7ba3e-1816-455a-bd28-f6eea235bd28
**Session Type:** entity_extraction
**Session Status:** completed
**Purpose:** Comprehensive column-by-column audit of ai_processing_sessions table - the master coordination table for Pass 1-3 AI processing pipeline

---

## Sample Record Data Summary

```
Session ID: 05fc9450-d8c6-4ec7-aebb-a3d24bdd6610
Session Type: entity_extraction
Session Status: completed
AI Model: gpt-5-mini (v3)
Processing Mode: automated
Workflow Step: entity_detection (step 1 of 2)
Overall Confidence: 0.940 (94.0%)
Quality Score: 0.950 (95.0%)
Requires Human Review: false
Processing Duration: 00:04:55.084 (4 minutes 55 seconds)
Started: 2025-10-08 05:31:54.694+00
Completed: 2025-10-08 05:36:49.779+00
Retry Count: 0 (max: 3)
Error Status: None
```

---

## Column-by-Column Analysis

### PRIMARY KEY & FOREIGN KEYS

**id** (UUID, PRIMARY KEY, NOT NULL)
- **Role**: Unique identifier for AI processing session; used as FK by entity_processing_audit, profile_classification_audit, pass1_entity_metrics
- **NULL Status**: NOT NULL (system-generated via gen_random_uuid())
- **Sample Value**: `05fc9450-d8c6-4ec7-aebb-a3d24bdd6610`
- **AI Processing**: Not AI-generated (database auto-generated)
- **Correctness**: ✅ Correct - Serves as central join key across all Pass 1 audit tables
- **Join Tables**: entity_processing_audit, profile_classification_audit, pass1_entity_metrics, manual_review_queue, ai_confidence_scoring
- **Analytics Use**: "Show all Pass 1 entities, metrics, and classifications for this processing session"

**patient_id** (UUID, NOT NULL, FK → user_profiles)
- **Role**: Links session to patient profile; enables profile-based RLS security and patient-centric queries
- **NULL Status**: NOT NULL (every session must be for a specific patient profile)
- **Sample Value**: `d1dbe18c-afc2-421f-bd58-145ddb48cbca`
- **Foreign Key**: References user_profiles(id) ON DELETE CASCADE
- **AI Processing**: Not AI-generated (system context from authenticated user)
- **Purpose**: Security boundary for RLS policies (users can only see their own processing sessions)
- **Correctness**: ✅ Correct - Links to valid user profile
- **RLS Policy**: `has_profile_access(auth.uid(), patient_id)` controls access
- **Cascade Behavior**: Deleting profile deletes all associated processing sessions (intentional data cleanup)

**shell_file_id** (UUID, NOT NULL, FK → shell_files)
- **Role**: Links session to specific document being processed; enables document-centric analytics
- **NULL Status**: NOT NULL (every session processes a specific file)
- **Sample Value**: `c3f7ba3e-1816-455a-bd28-f6eea235bd28`
- **Foreign Key**: References shell_files(id) ON DELETE CASCADE
- **AI Processing**: Not AI-generated (system context)
- **Purpose**: Document traceability and efficient queries for "show all processing sessions for this file"
- **Correctness**: ✅ Correct - Links to BP2025060246784 document
- **Query Optimization**: Indexed (idx_ai_sessions_shell_file) for fast lookups
- **Use Case**: "Show processing history for this medical document"

---

### SESSION METADATA (SYSTEM CONFIGURATION)

**session_type** (TEXT, NOT NULL, CHECK constraint)
- **Role**: Categorizes the type of AI processing being performed
- **NULL Status**: NOT NULL (must specify session purpose)
- **Sample Value**: `"entity_extraction"`
- **Allowed Values**: 'shell_file_processing', 'entity_extraction', 'clinical_validation', 'profile_classification', 'decision_support', 'semantic_processing'
- **AI Processing**: Not AI-generated (worker specifies at session start)
- **Correctness**: ✅ Correct - "entity_extraction" is Pass 1 entity detection processing
- **Purpose**: Categorizes session type for analytics and filtering
- **Analytics Use**: "Show all entity extraction sessions" or "Count sessions by type"
- **Pass Mapping**:
  - Pass 1: 'entity_extraction', 'profile_classification'
  - Pass 2: 'clinical_validation'
  - Pass 3: 'semantic_processing'

**session_status** (TEXT, NOT NULL, CHECK constraint)
- **Role**: Tracks current state of processing session lifecycle
- **NULL Status**: NOT NULL (defaults to 'initiated')
- **Sample Value**: `"completed"`
- **Allowed Values**: 'initiated', 'processing', 'completed', 'failed', 'cancelled'
- **AI Processing**: Not AI-generated (worker updates during lifecycle)
- **Purpose**: Workflow state tracking and monitoring
- **Correctness**: ✅ Correct - "completed" matches processing_completed_at being populated
- **State Transitions**:
  - initiated → processing (when worker starts)
  - processing → completed (successful finish)
  - processing → failed (error encountered)
  - initiated/processing → cancelled (manual intervention)
- **Indexed**: idx_ai_sessions_status for fast filtering
- **Use Case**: "Show all failed sessions for debugging" or "Monitor active processing sessions"

**ai_model_version** (TEXT, NOT NULL, DEFAULT 'v3')
- **Role**: Tracks which version of AI processing pipeline was used
- **NULL Status**: NOT NULL (defaults to 'v3')
- **Sample Value**: `"gpt-5-mini"`
- **AI Processing**: Not AI-generated (system configuration)
- **Correctness**: ⚠️ **CONFUSING** - Column name says "version" but value is model name
- **Purpose**: Version tracking for A/B testing and performance comparison
- **Naming Issue**: Should be named `ai_model_name` or split into `ai_model_name` and `pipeline_version`
- **Current Usage**: Appears to store model name ("gpt-5-mini") not pipeline version ("v3")
- **Analytics Use**: "Compare entity detection quality across GPT-4o vs GPT-5"
- **Recommendation**: Clarify whether this tracks model name or pipeline version

**model_config** (JSONB, DEFAULT '{}')
- **Role**: Stores AI model configuration parameters (temperature, max_tokens, vision settings)
- **NULL Status**: Defaults to '{}' if not provided
- **Sample Value**: `{"max_tokens": 4000, "temperature": 0.1, "vision_enabled": true, "ocr_cross_validation": true}`
- **AI Processing**: Not AI-generated (worker configuration)
- **Purpose**: Complete audit trail of AI model settings for reproducibility
- **Correctness**: ✅ Correct - Captures key configuration:
  - **max_tokens**: 4000 (output limit)
  - **temperature**: 0.1 (low temperature for consistency)
  - **vision_enabled**: true (GPT-4o vision processing)
  - **ocr_cross_validation**: true (dual-input validation enabled)
- **JSONB Flexibility**: Allows different models to have different config parameters
- **Analytics Use**: "Find sessions with vision_enabled=false" or "Compare quality at different temperatures"
- **Debugging Value**: Essential for reproducing AI processing results

**processing_mode** (TEXT, CHECK constraint)
- **Role**: How the session was initiated and executed
- **NULL Status**: NULLABLE (optional workflow classification)
- **Sample Value**: `"automated"`
- **Allowed Values**: 'automated', 'human_guided', 'validation_only'
- **AI Processing**: Not AI-generated (workflow tracking)
- **Purpose**: Distinguishes batch processing from interactive sessions
- **Correctness**: ✅ Correct - "automated" matches background worker processing
- **Processing Modes**:
  - **automated**: Worker processes without human intervention
  - **human_guided**: User provides hints/corrections during processing
  - **validation_only**: Re-validate existing results without re-processing
- **Use Case**: "Show all human-guided sessions" (higher quality expected)

---

### WORKFLOW TRACKING (PASS 1-3 PIPELINE COORDINATION)

**workflow_step** (TEXT, NOT NULL, CHECK constraint)
- **Role**: Current step in multi-pass AI processing pipeline
- **NULL Status**: NOT NULL (defaults to 'entity_detection')
- **Sample Value**: `"entity_detection"`
- **Allowed Values**: 'entity_detection', 'profile_classification', 'clinical_extraction', 'semantic_processing', 'validation', 'decision_support', 'completed'
- **AI Processing**: Not AI-generated (worker updates as pipeline progresses)
- **Purpose**: Tracks progress through Pass 1 → Pass 2 → Pass 3 pipeline
- **Correctness**: ✅ Correct - "entity_detection" is step 1 of Pass 1
- **Pipeline Mapping**:
  - **Pass 1**: entity_detection → profile_classification
  - **Pass 2**: clinical_extraction
  - **Pass 3**: semantic_processing
  - **Final**: validation → decision_support → completed
- **Use Case**: "Show sessions stuck at profile_classification step" (potential bottleneck)

**total_steps** (INTEGER, DEFAULT 5)
- **Role**: Total number of steps expected in this processing workflow
- **NULL Status**: Defaults to 5 if not specified
- **Sample Value**: `2`
- **AI Processing**: Not AI-generated (worker specifies at session start)
- **Purpose**: Progress tracking for UI progress bars
- **Correctness**: ⚠️ **UNEXPECTED** - Shows 2 steps but default is 5
- **Pass 1 Reality**: For entity_extraction session, 2 steps makes sense:
  1. Entity detection
  2. Profile classification
- **Full Pipeline**: Complete Pass 1-3 would be ~5 steps (entity → profile → clinical → semantic → validation)
- **Use Case**: Progress percentage = (completed_steps / total_steps) × 100
- **UI Display**: "Processing... Step 1 of 2 (50%)"

**completed_steps** (INTEGER, DEFAULT 0)
- **Role**: Number of workflow steps completed so far
- **NULL Status**: Defaults to 0 at session start
- **Sample Value**: `1`
- **AI Processing**: Not AI-generated (worker increments after each step)
- **Purpose**: Real-time progress tracking
- **Correctness**: ✅ Correct - 1 step completed (entity detection) out of 2 total
- **Progress**: 1/2 = 50% complete
- **Worker Logic**: Worker increments after successful step completion
- **Use Case**: "Show sessions with low completion rate" (may indicate failures)

---

### QUALITY METRICS (AI-GENERATED)

**overall_confidence** (NUMERIC(4,3), CHECK 0-1)
- **Role**: Aggregate confidence score across all AI processing in this session
- **NULL Status**: NULLABLE (optional quality metric)
- **Sample Value**: `0.940` (94.0% confidence)
- **AI Processing**: ✅ AI-GENERATED - Aggregated from individual entity confidences
- **Purpose**: Session-level quality metric for filtering and monitoring
- **Correctness**: ✅ Correct - 0.940 is reasonable for 48 entities detected with varying confidences
- **Calculation**: Likely average or weighted average of all entity-level confidence scores
- **Threshold Logic**: Typically requires_human_review if < 0.700
- **Indexed**: Not directly, but used in requires_human_review filter
- **Analytics Use**: "Show high-confidence sessions (>0.90)" or "Average confidence by AI model"

**requires_human_review** (BOOLEAN, DEFAULT FALSE)
- **Role**: Flag indicating session needs manual validation before proceeding
- **NULL Status**: NOT NULL (defaults to FALSE)
- **Sample Value**: `false`
- **AI Processing**: ✅ AI-GENERATED - AI sets based on confidence thresholds and risk scores
- **Purpose**: Triggers manual review queue insertion for quality assurance
- **Correctness**: ✅ Correct - FALSE matches high overall_confidence (0.940)
- **Trigger Conditions**:
  - overall_confidence < 0.700
  - Individual entity confidence < 0.500
  - Profile classification contamination risk > 0.300
  - AI flags safety concerns
- **Indexed**: idx_ai_sessions_review WHERE requires_human_review = true
- **Workflow**: IF TRUE, insert into manual_review_queue before Pass 2
- **Use Case**: "Show all sessions requiring manual review"

**quality_score** (NUMERIC(4,3), CHECK 0-1)
- **Role**: Overall quality assessment of processing results (distinct from confidence)
- **NULL Status**: NULLABLE (optional quality metric)
- **Sample Value**: `0.950` (95.0% quality)
- **AI Processing**: ✅ AI-GENERATED - Composite quality metric
- **Purpose**: Quality vs confidence distinction (can be confident but low quality)
- **Correctness**: ✅ Correct - 0.950 quality with 0.940 confidence shows high-quality processing
- **Quality Factors**:
  - **Confidence**: How certain AI is about its answers
  - **Quality**: How good/complete the answers are
  - Example: High confidence (0.95) extracting wrong data = low quality (0.60)
- **Use Case**: "Show sessions with high confidence but low quality" (AI is wrong but certain)
- **Analytics**: Track quality degradation over time or by model version

---

### PROCESSING TIMES (SYSTEM TRACKING)

**processing_started_at** (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- **Role**: When AI processing actually began (worker started job)
- **NULL Status**: NOT NULL (audit trail requirement)
- **Sample Value**: `2025-10-08 05:31:54.694+00`
- **AI Processing**: Not AI-generated (system timestamp)
- **Purpose**: Performance tracking and SLA monitoring
- **Correctness**: ✅ Correct - Started 3.6 minutes after session created (05:36:49.773858 created, 05:31:54.694 started)
- **Timing Gap**: ⚠️ **UNEXPECTED** - processing_started_at is BEFORE created_at by 4m55s
- **Analysis**: This suggests worker started job at 05:31:54, session record created at completion 05:36:49
- **Pattern**: Session record created retroactively after processing completes (not at start)
- **Use Case**: "Average processing time by document type"

**processing_completed_at** (TIMESTAMPTZ, NULLABLE)
- **Role**: When AI processing finished (success or failure)
- **NULL Status**: NULLABLE (NULL until session completes)
- **Sample Value**: `2025-10-08 05:36:49.779+00`
- **AI Processing**: Not AI-generated (system timestamp)
- **Purpose**: Completion tracking and duration calculation
- **Correctness**: ✅ Correct - Matches created_at (session created upon completion)
- **Duration**: processing_completed_at - processing_started_at = 00:04:55.084
- **State Correlation**: Should be NULL if session_status != 'completed'
- **Use Case**: "Show completed sessions in last 24 hours"

**total_processing_time** (INTERVAL, NULLABLE)
- **Role**: Calculated duration of AI processing (completed_at - started_at)
- **NULL Status**: NULLABLE (NULL until processing completes)
- **Sample Value**: `00:04:55.084` (4 minutes 55 seconds)
- **AI Processing**: Not AI-generated (database-calculated or worker-calculated)
- **Purpose**: Performance analytics and cost estimation
- **Correctness**: ✅ Correct - Matches calculation: 05:36:49.779 - 05:31:54.694 = 00:04:55.085
- **Processing Breakdown**: For 48 entities, ~6.1 seconds per entity average
- **Cost Correlation**: Longer processing = more tokens used (vision API charges per second of inference)
- **Performance**: ~5 minutes for 2-page document with vision + OCR is reasonable
- **Analytics Use**: "Average processing time by page count" or "Processing time trend over time"

---

### ERROR HANDLING (SYSTEM TRACKING)

**error_message** (TEXT, NULLABLE)
- **Role**: Human-readable error message if session failed
- **NULL Status**: NULLABLE (NULL for successful sessions)
- **Sample Value**: `null`
- **AI Processing**: Not AI-generated (system error tracking)
- **Purpose**: Debugging failed sessions
- **Correctness**: ✅ Correct - NULL matches session_status = 'completed' (no error)
- **Population Logic**: Worker sets when session_status changes to 'failed'
- **Example Values**: "AI timeout after 30 minutes", "Invalid document format", "Rate limit exceeded"
- **Use Case**: "Show all failed sessions with error messages for debugging"

**error_context** (JSONB, NULLABLE)
- **Role**: Structured error details (stack trace, API response, retry info)
- **NULL Status**: NULLABLE (NULL for successful sessions)
- **Sample Value**: `null`
- **AI Processing**: Not AI-generated (system error tracking)
- **Purpose**: Detailed debugging information
- **Correctness**: ✅ Correct - NULL matches no error
- **JSONB Structure**:
  ```json
  {
    "error_type": "timeout",
    "api_response": { "status": 504, "message": "Gateway timeout" },
    "stack_trace": "...",
    "retry_attempt": 2,
    "timestamp": "2025-10-08T05:35:00Z"
  }
  ```
- **Use Case**: "Debug why OpenAI API calls are timing out"

**retry_count** (INTEGER, DEFAULT 0)
- **Role**: Number of times this session has been retried after failures
- **NULL Status**: NOT NULL (defaults to 0)
- **Sample Value**: `0`
- **AI Processing**: Not AI-generated (worker increments on retry)
- **Purpose**: Track retry attempts before giving up
- **Correctness**: ✅ Correct - 0 retries (successful on first attempt)
- **Retry Logic**: Worker retries session if transient failure (API timeout, rate limit)
- **Max Retries**: Compared against max_retries to determine if session should fail permanently
- **Use Case**: "Show sessions with high retry counts" (indicates infrastructure issues)

**max_retries** (INTEGER, DEFAULT 3)
- **Role**: Maximum retry attempts allowed before permanent failure
- **NULL Status**: NOT NULL (defaults to 3)
- **Sample Value**: `3`
- **AI Processing**: Not AI-generated (configuration)
- **Purpose**: Retry policy configuration
- **Correctness**: ✅ Correct - Standard 3 retry limit is reasonable
- **Failure Condition**: IF retry_count >= max_retries, mark session as 'failed' permanently
- **Retry Strategy**: Exponential backoff recommended (1s, 2s, 4s delays)
- **Use Case**: "Identify sessions that exhausted all retries"

---

### TIMESTAMPS (AUDIT TRAIL)

**created_at** (TIMESTAMPTZ, DEFAULT NOW())
- **Role**: When session record was created in database
- **NULL Status**: NOT NULL (audit trail requirement)
- **Sample Value**: `2025-10-08 05:36:49.773858+00`
- **AI Processing**: Not AI-generated (system timestamp)
- **Purpose**: Audit trail and record creation tracking
- **Correctness**: ⚠️ **INTERESTING** - Created AFTER processing completed
- **Pattern**: Worker creates session record upon completion, not at start
- **Timing**: created_at ≈ processing_completed_at (5ms difference)
- **Alternative Pattern**: Some systems create session at start, others at completion
- **Use Case**: "Show all sessions created in last 24 hours"

**updated_at** (TIMESTAMPTZ, DEFAULT NOW())
- **Role**: Last modification timestamp (updates when session status changes)
- **NULL Status**: NOT NULL (audit trail requirement)
- **Sample Value**: `2025-10-08 05:36:49.773858+00`
- **AI Processing**: Not AI-generated (system timestamp)
- **Purpose**: Track when session was last modified
- **Correctness**: ✅ Correct - Matches created_at (no updates since creation)
- **Update Scenarios**:
  - session_status change (processing → completed)
  - workflow_step advancement
  - completed_steps increment
  - quality score updates
- **Use Case**: "Find stale sessions (updated_at > 24 hours ago and status = 'processing')"

---

## Key Findings & Issues

### ✅ Correct Behaviors (No Action Needed)

1. **Session Coordination Working Correctly**
   - Links to patient profile, shell file, and all Pass 1 audit tables via FK relationships
   - Session completed successfully with high confidence (0.940) and quality (0.950)
   - No errors encountered (error_message = NULL, retry_count = 0)
   - Proper workflow tracking (step 1 of 2 completed)

2. **Quality Metrics Populated**
   - overall_confidence = 0.940 (reasonable aggregate of 48 entity confidences)
   - quality_score = 0.950 (high quality processing)
   - requires_human_review = FALSE (high confidence, no manual review needed)

3. **Foreign Key Relationships Valid**
   - patient_id links to valid user_profile
   - shell_file_id links to uploaded document
   - Serves as FK target for entity_processing_audit, profile_classification_audit, pass1_entity_metrics

4. **Configuration Tracking Complete**
   - model_config captures all key settings (temperature, max_tokens, vision, OCR)
   - ai_model_version tracks model used (though naming is confusing)
   - processing_mode = 'automated' correctly reflects background processing

5. **Processing Time Metrics Accurate**
   - total_processing_time = 00:04:55.084 (accurate calculation)
   - ~5 minutes for 2-page document with vision + OCR is reasonable performance
   - ~6 seconds per entity (48 entities) is efficient

### ⚠️ Naming and Schema Inconsistencies (Medium Priority)

6. **ai_model_version Column Name Confusing**
   - **Current State**: Column named `ai_model_version` but contains model name "gpt-5-mini"
   - **Expected**: Column should be named `ai_model_name` OR should store pipeline version "v3"
   - **Impact**: Confusing for developers and analytics queries
   - **Recommendation**: Either:
     - Rename to `ai_model_name` (simpler)
     - Add separate `pipeline_version` column (more complete)
   - **SQL Fix**:
     ```sql
     -- Option A: Rename column
     ALTER TABLE ai_processing_sessions RENAME COLUMN ai_model_version TO ai_model_name;

     -- Option B: Add separate column
     ALTER TABLE ai_processing_sessions ADD COLUMN pipeline_version TEXT DEFAULT 'v3';
     ```

7. **Session Creation Pattern Unexpected**
   - **Current State**: processing_started_at (05:31:54) is BEFORE created_at (05:36:49)
   - **Observed Pattern**: Worker creates session record upon completion, not at start
   - **Expected Pattern**: Session created when processing starts, updated when completes
   - **Impact**: Can't query "sessions currently processing" by filtering created_at
   - **Analysis**: This may be intentional (atomic insert of complete session) or a bug
   - **Recommendation**: Verify intended behavior:
     - **If intentional**: Document pattern clearly (retroactive session creation)
     - **If bug**: Create session at start, update at completion

### 💡 Enhancement Opportunities (Low Priority)

8. **workflow_step Could Be More Granular**
   - **Current**: workflow_step = "entity_detection" (high-level step)
   - **Enhancement**: Add sub-steps for better progress tracking:
     - entity_detection_vision
     - entity_detection_ocr
     - entity_detection_validation
     - profile_classification_analysis
   - **Benefit**: More granular progress bars in UI
   - **Trade-off**: More complexity vs better UX

9. **session_type Values Could Map to Passes**
   - **Current**: 'entity_extraction', 'clinical_validation', 'semantic_processing'
   - **Clarity Enhancement**: Add pass number to session_type:
     - 'pass1_entity_extraction'
     - 'pass2_clinical_validation'
     - 'pass3_semantic_processing'
   - **Benefit**: Clearer analytics ("Show all Pass 1 sessions")
   - **Trade-off**: Longer enum values

10. **total_steps Default (5) vs Actual (2) Mismatch**
    - **Current**: Default is 5, but Pass 1-only session uses 2
    - **Observation**: Default may be for full Pass 1-3 pipeline
    - **Recommendation**: No action needed - worker correctly sets total_steps based on workflow
    - **Documentation**: Clarify that default 5 is for complete pipeline, workers override

---

## Analytics Queries & Use Cases

### Session Performance Analytics

```sql
-- Average processing time by AI model
SELECT
  ai_model_version,
  COUNT(*) as session_count,
  AVG(EXTRACT(EPOCH FROM total_processing_time)) as avg_seconds,
  MIN(EXTRACT(EPOCH FROM total_processing_time)) as min_seconds,
  MAX(EXTRACT(EPOCH FROM total_processing_time)) as max_seconds,
  AVG(overall_confidence) as avg_confidence,
  AVG(quality_score) as avg_quality
FROM ai_processing_sessions
WHERE session_status = 'completed'
GROUP BY ai_model_version
ORDER BY avg_confidence DESC;

-- Processing time by page count
SELECT
  sf.page_count,
  COUNT(*) as session_count,
  AVG(EXTRACT(EPOCH FROM aps.total_processing_time)) as avg_seconds,
  AVG(EXTRACT(EPOCH FROM aps.total_processing_time) / NULLIF(sf.page_count, 0)) as seconds_per_page,
  AVG(aps.overall_confidence) as avg_confidence
FROM ai_processing_sessions aps
JOIN shell_files sf ON aps.shell_file_id = sf.id
WHERE aps.session_status = 'completed'
GROUP BY sf.page_count
ORDER BY sf.page_count;

-- Session success rate by model configuration
SELECT
  model_config->>'temperature' as temperature,
  model_config->>'vision_enabled' as vision_enabled,
  COUNT(*) as total_sessions,
  COUNT(*) FILTER (WHERE session_status = 'completed') as completed,
  COUNT(*) FILTER (WHERE session_status = 'failed') as failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE session_status = 'completed') / COUNT(*), 2) as success_rate_pct,
  AVG(overall_confidence) FILTER (WHERE session_status = 'completed') as avg_confidence
FROM ai_processing_sessions
GROUP BY model_config->>'temperature', model_config->>'vision_enabled'
ORDER BY success_rate_pct DESC;
```

### Quality & Review Analytics

```sql
-- Sessions requiring human review
SELECT
  session_type,
  COUNT(*) as total_requiring_review,
  AVG(overall_confidence) as avg_confidence,
  AVG(quality_score) as avg_quality
FROM ai_processing_sessions
WHERE requires_human_review = true
GROUP BY session_type
ORDER BY total_requiring_review DESC;

-- Quality score distribution
SELECT
  CASE
    WHEN quality_score >= 0.900 THEN 'Excellent (90-100%)'
    WHEN quality_score >= 0.700 THEN 'Good (70-89%)'
    WHEN quality_score >= 0.500 THEN 'Moderate (50-69%)'
    ELSE 'Low (<50%)'
  END as quality_category,
  COUNT(*) as session_count,
  AVG(overall_confidence) as avg_confidence,
  COUNT(*) FILTER (WHERE requires_human_review = true) as requiring_review
FROM ai_processing_sessions
WHERE session_status = 'completed'
GROUP BY quality_category
ORDER BY MIN(quality_score) DESC;

-- Confidence vs quality correlation
SELECT
  CASE
    WHEN overall_confidence >= 0.900 THEN 'High Conf (90-100%)'
    WHEN overall_confidence >= 0.700 THEN 'Med Conf (70-89%)'
    ELSE 'Low Conf (<70%)'
  END as confidence_category,
  CASE
    WHEN quality_score >= 0.900 THEN 'High Quality'
    WHEN quality_score >= 0.700 THEN 'Med Quality'
    ELSE 'Low Quality'
  END as quality_category,
  COUNT(*) as session_count
FROM ai_processing_sessions
WHERE session_status = 'completed'
  AND overall_confidence IS NOT NULL
  AND quality_score IS NOT NULL
GROUP BY confidence_category, quality_category
ORDER BY MIN(overall_confidence) DESC, MIN(quality_score) DESC;
```

### Error & Retry Analytics

```sql
-- Error analysis
SELECT
  error_message,
  COUNT(*) as occurrence_count,
  AVG(retry_count) as avg_retry_count,
  MAX(retry_count) as max_retry_count
FROM ai_processing_sessions
WHERE session_status = 'failed'
  AND error_message IS NOT NULL
GROUP BY error_message
ORDER BY occurrence_count DESC
LIMIT 10;

-- Retry exhaustion analysis
SELECT
  session_type,
  COUNT(*) FILTER (WHERE retry_count >= max_retries) as exhausted_retries,
  COUNT(*) FILTER (WHERE retry_count > 0 AND retry_count < max_retries) as recovered_after_retry,
  COUNT(*) FILTER (WHERE retry_count = 0) as succeeded_first_attempt,
  ROUND(100.0 * COUNT(*) FILTER (WHERE retry_count >= max_retries) / COUNT(*), 2) as exhaustion_rate_pct
FROM ai_processing_sessions
WHERE session_status IN ('completed', 'failed')
GROUP BY session_type
ORDER BY exhaustion_rate_pct DESC;
```

### Workflow Progress Analytics

```sql
-- Workflow completion analysis
SELECT
  workflow_step,
  session_status,
  COUNT(*) as session_count,
  AVG(100.0 * completed_steps / NULLIF(total_steps, 0)) as avg_completion_pct,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at))) as avg_age_seconds
FROM ai_processing_sessions
GROUP BY workflow_step, session_status
ORDER BY workflow_step, session_status;

-- Stuck sessions (processing for too long)
SELECT
  id,
  session_type,
  workflow_step,
  completed_steps || ' of ' || total_steps as progress,
  EXTRACT(EPOCH FROM (NOW() - processing_started_at)) / 60 as minutes_processing,
  overall_confidence,
  retry_count
FROM ai_processing_sessions
WHERE session_status = 'processing'
  AND processing_started_at < NOW() - INTERVAL '30 minutes'
ORDER BY processing_started_at ASC;
```

---

## Action Items

| Priority | Issue | Type | Action Required |
|----------|-------|------|-----------------|
| 🟡 **MEDIUM** | ai_model_version column naming | Schema Clarity | Rename to `ai_model_name` OR add separate `pipeline_version` column |
| 🟡 **MEDIUM** | Session creation timing | Behavior Verification | Verify if retroactive session creation (after completion) is intentional or bug |
| 🟢 **LOW** | workflow_step granularity | Enhancement | Consider adding sub-steps for better progress tracking (optional) |
| 🟢 **LOW** | session_type pass mapping | Clarity | Consider prefixing with pass number (e.g., 'pass1_entity_extraction') for clearer analytics |
| N/A | All other columns | No action | Working as designed; session coordination, quality tracking, and error handling functioning correctly |

---

## Implementation Notes

### Fix 1: Rename ai_model_version to ai_model_name (MEDIUM)

**Current Confusion:**
```sql
-- Column name suggests "version" but contains model name
ai_model_version TEXT NOT NULL DEFAULT 'v3'
-- Sample value: "gpt-5-mini" (this is a model name, not a version)
```

**Option A: Simple Rename (Recommended)**
```sql
ALTER TABLE ai_processing_sessions
RENAME COLUMN ai_model_version TO ai_model_name;

-- Update default to reflect model name
ALTER TABLE ai_processing_sessions
ALTER COLUMN ai_model_name SET DEFAULT 'gpt-4o-mini';
```

**Option B: Add Separate Pipeline Version Column**
```sql
-- Keep ai_model_version for pipeline version, add ai_model_name
ALTER TABLE ai_processing_sessions
ADD COLUMN ai_model_name TEXT NOT NULL DEFAULT 'gpt-4o-mini';

-- Migrate existing data
UPDATE ai_processing_sessions
SET ai_model_name = ai_model_version;

-- Update ai_model_version to store pipeline version
UPDATE ai_processing_sessions
SET ai_model_version = 'v3';
```

---

### Fix 2: Verify Session Creation Timing Pattern (MEDIUM)

**Observed Behavior:**
```sql
-- Sample data shows:
processing_started_at: 2025-10-08 05:31:54.694+00  -- Worker started
created_at:           2025-10-08 05:36:49.773858+00 -- Record created (4m55s later)
processing_completed_at: 2025-10-08 05:36:49.779+00 -- Processing finished
```

**Pattern Analysis:**
- Session record created AFTER processing completes
- created_at ≈ processing_completed_at
- processing_started_at is earlier timestamp

**Verification Questions:**
1. Is this intentional (retroactive session creation for atomicity)?
2. Or should session be created when processing starts?

**If Intentional (Retroactive):**
- ✅ Pro: Atomic insert of complete session
- ✅ Pro: No incomplete session records
- ❌ Con: Can't query "sessions currently processing" by created_at

**If Bug (Should Create at Start):**
```typescript
// Expected pattern:
async function startProcessingSession() {
  // Create session when starting
  const session = await db.ai_processing_sessions.insert({
    patient_id,
    shell_file_id,
    session_type: 'entity_extraction',
    session_status: 'processing',
    processing_started_at: NOW(),
    workflow_step: 'entity_detection',
    total_steps: 2,
    completed_steps: 0
  });

  // Update when completing
  await db.ai_processing_sessions.update(session.id, {
    session_status: 'completed',
    processing_completed_at: NOW(),
    total_processing_time: NOW() - processing_started_at,
    overall_confidence: calculatedConfidence,
    quality_score: calculatedQuality
  });
}
```

**Recommendation:** Check worker code to confirm intended pattern, document clearly

---

**Audit Complete:** 2025-10-09
**Overall Assessment:** ✅ Table functioning correctly with minor naming inconsistencies to address. Session coordination, quality tracking, and error handling all working as designed.
