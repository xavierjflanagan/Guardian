# job_queue Table - Column Audit Analysis

**Audit Date:** 2025-10-09
**Sample Job ID:** 042c94ab-a707-43d3-b035-35807ab3075d
**Job Type:** ai_processing
**Job Status:** failed
**Purpose:** Comprehensive column-by-column audit of job_queue table to understand role, NULL handling, and data correctness

---

## Sample Job Data Summary

```
Job Name: "Pass 1: BP2025060246784 - first 2 page version V4.jpeg"
Status: failed
Created: 2025-10-05 23:13:27
Started: 2025-10-05 23:13:30
Completed: 2025-10-05 23:15:40
Worker: render-${RENDER_SERVICE_ID}
Error: "Pass 1 processing failed: OpenAI returned empty response"
Reason: finish_reason = "length" (response truncated due to token limit)
```

---

## Column-by-Column Analysis

### PRIMARY KEY & IDENTITY

**id** (UUID, PRIMARY KEY, NOT NULL)
- **Role**: Unique identifier for each job in the queue
- **NULL Status**: NOT NULL (system-generated via gen_random_uuid())
- **Sample Value**: `042c94ab-a707-43d3-b035-35807ab3075d`
- **Correctness**: ✅ Correct - Every job must have unique ID for tracking and RPC function references

---

### JOB CLASSIFICATION (Two-Column Architecture)

**job_type** (TEXT, NOT NULL)
- **Role**: High-level job category that determines which worker processes claim it
- **NULL Status**: NOT NULL (required for job routing)
- **Sample Value**: `ai_processing`
- **Allowed Values**: 'shell_file_processing', 'ai_processing', 'data_migration', 'audit_cleanup', 'notification_delivery', 'report_generation', 'backup_operation', 'system_maintenance', 'semantic_processing', 'consent_verification', 'provider_verification'
- **Correctness**: ✅ Correct - Worker coordination requires explicit job type for claim_next_job_v3() filtering

**job_lane** (TEXT, NULLABLE)
- **Role**: Fine-grained routing within job_type for load balancing and prioritization
- **NULL Status**: NULLABLE (only required for specific job_types)
- **Sample Value**: `ai_queue_simple`
- **Lane Rules**:
  - `shell_file_processing` → MUST be 'fast_queue' or 'standard_queue'
  - `ai_processing` → MUST be 'ai_queue_simple' or 'ai_queue_complex'
  - Other job types → MUST be NULL
- **Correctness**: ✅ Correct - This job is ai_processing with ai_queue_simple, which matches the constraint

**job_category** (TEXT, NOT NULL)
- **Role**: Priority classification for scheduling logic (not currently used in claim_next_job_v3, but available for future use)
- **NULL Status**: NOT NULL (system default: 'standard')
- **Sample Value**: 'standard'
- **Allowed Values**: 'critical', 'high_priority', 'standard', 'background', 'maintenance'
- **Correctness**: ✅ Correct - Standard category appropriate for regular AI processing

---

### JOB PAYLOAD & CONFIGURATION

**job_name** (TEXT, NOT NULL)
- **Role**: Human-readable description of the job for logging, monitoring, and debugging
- **NULL Status**: NOT NULL (required for job identification)
- **Sample Value**: `"Pass 1: BP2025060246784 - first 2 page version V4.jpeg"`
- **Correctness**: ✅ Correct - Descriptive name helps with debugging (clearly shows Pass 1 + file name)

**job_description** (TEXT, NULLABLE)
- **Role**: Extended description for complex jobs (not currently used)
- **NULL Status**: NULLABLE (optional field)
- **Sample Value**: NULL
- **Correctness**: ✅ Correct - NULL is fine; job_name provides sufficient context for most jobs

**job_payload** (JSONB, NOT NULL)
- **Role**: Complete job execution parameters (shell_file_id, patient_id, OCR data, etc.)
- **NULL Status**: NOT NULL (worker MUST have execution parameters)
- **Sample Keys**: job_lane, raw_file, patient_id, shell_file_id, correlation_id, estimated_tokens, ocr_spatial_data, document_metadata, processing_session_id
- **Size**: ~82KB (too large to display - contains base64 image data in raw_file)
- **Correctness**: ✅ Correct - Contains all necessary data for Pass 1 processing (file data, OCR, IDs for correlation)

**job_config** (JSONB, DEFAULT '{}')
- **Role**: Job-specific configuration overrides (timeouts, retry policies, etc.)
- **NULL Status**: Defaults to '{}' if not provided
- **Sample Value**: Not queried (likely '{}' default)
- **Correctness**: ✅ Correct - Configuration overrides are optional

---

### JOB STATUS & LIFECYCLE

**status** (TEXT, NOT NULL, DEFAULT 'pending')
- **Role**: Current state of job in processing lifecycle
- **NULL Status**: NOT NULL (system MUST know job state)
- **Sample Value**: `failed`
- **Allowed Values**: 'pending', 'processing', 'completed', 'failed', 'cancelled', 'retrying', 'deferred'
- **Lifecycle Flow**: pending → processing → (completed | failed)
- **Correctness**: ✅ Correct - Failed status is correct given error_details shows OpenAI API failure

**scheduled_at** (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- **Role**: When job becomes eligible for processing (supports backpressure delays)
- **NULL Status**: NOT NULL (required for claim_next_job_v3 sorting)
- **Sample Value**: `2025-10-05 23:13:26.873+00`
- **Correctness**: ✅ Correct - Scheduled immediately after creation (normal for ai_processing jobs)

**started_at** (TIMESTAMPTZ, NULLABLE)
- **Role**: When worker claimed and began processing the job
- **NULL Status**: NULLABLE (NULL until claim_next_job_v3 claims it)
- **Sample Value**: `2025-10-05 23:13:30.998418+00` (4 seconds after scheduling)
- **Correctness**: ✅ Correct - Set when worker claimed job (fast pickup time is good)

**completed_at** (TIMESTAMPTZ, NULLABLE)
- **Role**: When job finished (success or failure)
- **NULL Status**: NULLABLE (NULL until complete_job or failure)
- **Sample Value**: `2025-10-05 23:15:40.417+00` (2 minutes 9 seconds processing time)
- **Correctness**: ✅ Correct - Timestamp shows when job failed (reasonable processing time for GPT-5 vision)

---

### RESOURCE & PERFORMANCE TRACKING

**priority** (INTEGER, DEFAULT 5, CHECK 1-10)
- **Role**: Job priority for scheduling (1 = highest, 10 = lowest). Currently hardcoded to 5 by Edge Function shell-file-processor-v3/index.ts when calling enqueue_job_v3(). While enqueue_job_v3 accepts priority parameter with default 5, all current jobs receive standard priority regardless of job characteristics.
- **NULL Status**: NOT NULL (defaults to 5)
- **Sample Value**: `5`
- **Correctness**: ✅ Correct - Standard priority for regular AI processing jobs
- **Code Location**: shell-file-processor-v3/index.ts:73-80 hardcodes `priority: 5`
- **Future Enhancement**: Could make priority dynamic based on user plan type (premium users → priority 3), job urgency, or document complexity

**estimated_duration** (INTERVAL, NULLABLE)
- **Role**: Expected job processing time (not currently used)
- **NULL Status**: NULLABLE (optional prediction field)
- **Sample Value**: Not queried (likely NULL)
- **Correctness**: ✅ Correct - NULL is fine; actual_duration captures real measurements

**actual_duration** (INTERVAL, NULLABLE)
- **Role**: Actual processing time (should be calculated from started_at → completed_at)
- **NULL Status**: NULLABLE (NULL until job completes)
- **Sample Value**: NULL (verified on job b283b966-194c-4de5-a33e-89950f162516)
- **Correctness**: ❌ BUG - Should be populated on completion but is NULL
- **Root Cause**: Worker's completeJob() function (apps/render-worker/src/worker.ts) doesn't pass actual_duration to complete_job RPC. The complete_job function also doesn't calculate it from timestamps.
- **Impact**: Missing duration metrics prevents performance analysis, capacity planning, and cost estimation
- **Fix Options**:
  - **Option A (Recommended)**: Modify complete_job() RPC to auto-calculate: `actual_duration = completed_at - started_at`
  - **Option B**: Update worker to track start time and pass duration explicitly
- **Evidence**: Query of recent job shows NULL despite having valid started_at (05:36:35) and completed_at (05:36:50) timestamps (~15 seconds duration)

**memory_usage_mb** (INTEGER, NULLABLE)
- **Role**: Memory consumed by job processing (not currently tracked by worker)
- **NULL Status**: NULLABLE (optional monitoring field)
- **Sample Value**: NULL (not implemented)
- **Correctness**: ✅ Correct - NULL is acceptable for MVP; future enhancement for capacity planning
- **Implementation Complexity**: Moderate - requires worker instrumentation with Node.js process.memoryUsage() API
- **Future Implementation**: Worker would track RSS memory during job execution, calculate peak or average usage, pass to complete_job
- **Use Cases**: Capacity planning, worker resource allocation, detecting memory leaks, autoscaling decisions
- **Recommendation**: Keep NULL for now; implement when scaling beyond single worker instance or encountering memory issues

**cpu_usage_percent** (NUMERIC(5,2), NULLABLE)
- **Role**: CPU utilization during processing (not currently tracked)
- **NULL Status**: NULLABLE (optional monitoring field)
- **Sample Value**: NULL (not implemented)
- **Correctness**: ✅ Correct - NULL is acceptable for MVP; future enhancement for capacity planning
- **Implementation Complexity**: Moderate-to-Hard - requires periodic CPU sampling via process.cpuUsage() and time-based averaging
- **Future Implementation**: Worker would sample CPU usage at intervals during job execution, calculate average percentage, pass to complete_job
- **Use Cases**: Identifying CPU-intensive jobs, worker capacity planning, detecting processing bottlenecks, autoscaling rules
- **Recommendation**: Keep NULL for now; implement when optimizing worker performance or scaling to multiple instances

---

### ERROR HANDLING & RETRY LOGIC

**retry_count** (INTEGER, DEFAULT 0)
- **Role**: How many times this job has been retried after failure
- **NULL Status**: NOT NULL (defaults to 0)
- **Sample Value**: `0`
- **Correctness**: ⚠️ QUESTION - Why 0 for a failed job? Was this the first attempt that failed, or should retry logic have kicked in?
- **Expected Behavior**: claim_next_job_v3 should increment retry_count when reclaiming timed-out jobs; 0 suggests this was first attempt that failed without timeout

**max_retries** (INTEGER, DEFAULT 3)
- **Role**: Maximum retry attempts before moving to dead letter queue (DLQ)
- **NULL Status**: NOT NULL (defaults to 3)
- **Sample Value**: `3`
- **Correctness**: ✅ Correct - Standard 3 retries matches system default
- **Dead Letter Queue Implementation**: Fully implemented in claim_next_job_v3 (08_job_coordination.sql:534-545)
- **Retry Behavior**:
  - **retry_count < max_retries (3)**: Job moved back to 'pending' status with retry_count incremented and jitter-delayed scheduling
  - **retry_count >= max_retries (3)**: Job status → 'failed', dead_letter_at timestamp set, error_details logged with dead_letter_reason
- **DLQ Query**: `SELECT * FROM job_queue WHERE dead_letter_at IS NOT NULL ORDER BY dead_letter_at DESC`
- **Manual Intervention**: Dead-lettered jobs require admin investigation, fix root cause, then manual retry (no automatic retry after DLQ to prevent infinite failure loops)
- **Recommendation**: Build admin dashboard to monitor and manually retry dead-lettered jobs

**retry_delay** (INTERVAL, DEFAULT '5 minutes')
- **Role**: How long to wait before retrying failed job (not currently used by claim_next_job_v3)
- **NULL Status**: NOT NULL (has default)
- **Sample Value**: Not queried (likely '5 minutes' default)
- **Correctness**: ✅ Correct - Default delay is reasonable for rate-limited API failures

**last_error** (TEXT, NULLABLE)
- **Role**: Simple error message (legacy field, superseded by error_details JSONB)
- **NULL Status**: NULLABLE (optional, error_details preferred)
- **Sample Value**: Not queried (likely NULL since error_details is populated)
- **Correctness**: ✅ Correct - NULL is fine; error_details provides structured error information

**error_details** (JSONB, NULLABLE)
- **Role**: Structured error information for debugging and retry logic
- **NULL Status**: NULLABLE (NULL for successful jobs, populated on failure)
- **Sample Value**:
  ```json
  {
    "failed_at": "2025-10-05T23:15:40.417Z",
    "worker_id": "render-${RENDER_SERVICE_ID}",
    "error_message": "Pass 1 processing failed: OpenAI returned empty response. Details: {\"finish_reason\":\"length\",\"choices_length\":1,\"has_refusal\":false,\"refusal_text\":null,\"model\":\"gpt-5\"}"
  }
  ```
- **Correctness**: ✅ Correct - Structured error clearly shows:
  - Root cause: OpenAI finish_reason "length" (response truncated due to token limit)
  - Model: gpt-5 (GPT-5 vision API)
  - Worker identification for debugging

---

### DEPENDENCIES & SEQUENCING

**depends_on** (UUID[], NULLABLE)
- **Role**: Array of job IDs that must complete before this job can run
- **NULL Status**: NULLABLE (NULL if no dependencies)
- **Sample Value**: Not queried (likely NULL for independent AI processing jobs)
- **Correctness**: ✅ Correct - Pass 1 jobs are independent and don't depend on other jobs

**blocks_jobs** (UUID[], NULLABLE)
- **Role**: Array of job IDs waiting for this job to complete
- **NULL Status**: NULLABLE (NULL if no downstream jobs)
- **Sample Value**: Not queried (likely NULL)
- **Correctness**: ✅ Correct - Typically populated by dependent jobs, not the blocking job itself

**job_group** (TEXT, NULLABLE)
- **Role**: Logical grouping for related jobs (batch processing, multi-stage workflows)
- **NULL Status**: NULLABLE (optional organizational field)
- **Sample Value**: Not queried (likely NULL)
- **Correctness**: ✅ Correct - NULL is fine for single-document processing jobs

---

### WORKER & PROCESSING CONTEXT

**worker_id** (TEXT, NULLABLE)
- **Role**: Identifier of worker process handling this job (set by claim_next_job_v3)
- **NULL Status**: NULLABLE (NULL until claimed)
- **Sample Value**: `render-${RENDER_SERVICE_ID}` (verified on jobs 042c94ab and b283b966)
- **Correctness**: ❌ BUG - Literal string instead of actual Render service ID
- **Root Cause**: Environment variable RENDER_SERVICE_ID not expanded in worker initialization code (apps/render-worker/src/worker.ts)
- **Impact**: Cannot identify which specific Render instance processed jobs, hinders observability and debugging for distributed worker deployments
- **Security Assessment**: No security concern - job_queue table has RLS policy restricting access to service_role only (08_job_coordination.sql:963-979), users cannot read this data
- **Fix Required**: Update worker constructor to properly expand environment variable:
  ```typescript
  // Current (broken): this.workerId = `render-${process.env.RENDER_SERVICE_ID}`;
  // Fixed: this.workerId = `render-${process.env.RENDER_SERVICE_ID || 'local-dev'}`;
  ```
- **Verification**: In Render.com environment, RENDER_SERVICE_ID should be auto-populated by Render platform
- **Priority**: HIGH - This fix improves observability for worker health monitoring and load distribution analysis

**processing_node** (TEXT, NULLABLE)
- **Role**: Server/container identifier for distributed processing (not currently used)
- **NULL Status**: NULLABLE (optional field)
- **Sample Value**: Not queried (likely NULL)
- **Correctness**: ✅ Correct - NULL is fine; worker_id provides sufficient identification

**lock_acquired_at** (TIMESTAMPTZ, NULLABLE)
- **Role**: Legacy distributed locking timestamp (NOT currently used in V3 architecture)
- **NULL Status**: NULLABLE (optional field)
- **Sample Value**: NULL (not used)
- **Correctness**: ✅ Correct - NULL is expected; V3 uses PostgreSQL native row-level locking instead
- **V3 Locking Strategy**: claim_next_job_v3 uses `FOR UPDATE SKIP LOCKED` (08_job_coordination.sql:562) for atomic job claiming
- **Why V3 Doesn't Need This**:
  - PostgreSQL row-level locks provide database-enforced atomicity (no two workers can claim same job)
  - `SKIP LOCKED` prevents workers from waiting (they grab next available job instead of blocking)
  - heartbeat_at serves the timeout/expiration role that lock_expires_at would have provided
- **Historical Context**: This field was designed for distributed systems using non-PostgreSQL job queues (Redis, MongoDB) where application-level locking is required
- **Future Use**: Reserved for potential migration to Redis-based job queue or other non-PostgreSQL distributed systems
- **Recommendation**: Keep NULL; PostgreSQL row locking + heartbeat monitoring is superior for current architecture

**lock_expires_at** (TIMESTAMPTZ, NULLABLE)
- **Role**: Legacy lock expiration timestamp for distributed systems (NOT currently used in V3 architecture)
- **NULL Status**: NULLABLE (optional field)
- **Sample Value**: NULL (not used)
- **Correctness**: ✅ Correct - NULL is expected; V3 uses heartbeat_at for timeout detection
- **V3 Timeout Strategy**: heartbeat_at serves the lock expiration role - claim_next_job_v3 reclaims jobs where `heartbeat_at < timeout_threshold` (08_job_coordination.sql:516-532)
- **Why V3 Doesn't Need This**: PostgreSQL row locking doesn't require expiration timestamps; worker health is tracked via heartbeat_at updates every 30 seconds
- **Historical Context**: Designed for application-level locking in distributed systems without database-enforced locks
- **Future Use**: Reserved for potential non-PostgreSQL distributed job queue implementations
- **Recommendation**: Keep NULL; heartbeat-based timeout detection is more flexible and health-monitoring-aware than fixed lock expiration

**heartbeat_at** (TIMESTAMPTZ, NULLABLE)
- **Role**: Worker health monitoring timestamp (updated every 30 seconds via update_job_heartbeat RPC)
- **NULL Status**: NULLABLE (NULL until job starts processing)
- **Sample Value**: `2025-10-08 05:37:05.932359+00` (verified 15 seconds AFTER completed_at on job b283b966)
- **Correctness**: ❌ BUG - heartbeat_at should be NULL or <= completed_at, not AFTER completion
- **Root Cause**: complete_job() function (08_job_coordination.sql:636-668) doesn't clear heartbeat_at when marking job complete
- **Impact**: Can cause false timeout reclaims if claim_next_job_v3 runs before heartbeat_at naturally expires; confuses job lifecycle tracking
- **Evidence**: Job b283b966 shows completed_at: 05:36:50, heartbeat_at: 05:37:05 (15 seconds later)
- **Fix Required**: Modify complete_job() to clear heartbeat:
  ```sql
  UPDATE job_queue SET
      status = 'completed',
      completed_at = NOW(),
      heartbeat_at = NULL,  -- ADD THIS LINE
      job_result = p_job_result,
      updated_at = NOW()
  ```
- **Worker-Side Verification**: Ensure worker stops heartbeat interval when job completes (clearInterval on heartbeat timer)
- **Priority**: HIGH - Prevents potential race conditions and incorrect timeout reclaims

**dead_letter_at** (TIMESTAMPTZ, NULLABLE)
- **Role**: When job was moved to dead letter queue (after exceeding max_retries)
- **NULL Status**: NULLABLE (NULL unless job permanently failed)
- **Sample Value**: `NULL`
- **Correctness**: ✅ Correct - NULL is correct; job failed on first attempt (retry_count=0), hasn't exceeded max_retries (3) yet

---

### PATIENT & PROFILE CONTEXT (Healthcare Jobs)

**patient_id** (UUID, NULLABLE, FK → user_profiles)
- **Role**: Links job to specific patient for RLS, audit trails, and efficient patient-specific queries
- **NULL Status**: NULLABLE (NULL for system-wide jobs like backups, data migrations)
- **Sample Value**: NULL (verified on jobs 042c94ab and b283b966 - data exists in job_payload but not extracted to column)
- **Correctness**: ⚠️ SHOULD POPULATE - Currently NULL but should be populated for ai_processing jobs
- **Impact**: Inefficient queries must parse JSONB job_payload instead of using indexed patient_id column; prevents efficient patient-specific job tracking
- **Patient Assignment Safety**: Concern about assigning patient_id before AI confirms document ownership is ALREADY HANDLED by profile_classification_audit table (shared/docs/.../pass-1/profile_classification_audit.md:318-332)
- **Safety System**:
  1. job_queue.patient_id set from shell_files.patient_id at upload (user's stated intent)
  2. Pass 1 AI analyzes document, populates profile_classification_audit with contamination_risk_score
  3. Pass 2 gating: IF manual_review_required OR cross_profile_risk_detected, PAUSE for human verification
  4. Only proceeds with clinical data assignment if AI confirms match or human approves override
- **Fix Required**: Extract patient_id from job_payload during enqueue_job_v3 or in Edge Function before enqueueing
- **Code Location**: shell-file-processor-v3/index.ts or enqueue_job_v3 function should extract job_payload.patient_id → table column
- **Priority**: MEDIUM - Improves query performance and enables patient-filtered job dashboards

**shell_file_id** (UUID, NULLABLE, FK → shell_files)
- **Role**: Links job to specific document being processed; enables document-centric job tracking and shell_files table joins
- **NULL Status**: NULLABLE (NULL for non-document jobs like data_migration, audit_cleanup)
- **Sample Value**: NULL (verified on jobs 042c94ab and b283b966 - data exists in job_payload but not extracted to column)
- **Correctness**: ⚠️ SHOULD POPULATE - Currently NULL but should be populated for ai_processing and shell_file_processing jobs
- **Impact**:
  - Inefficient queries must parse JSONB job_payload instead of using indexed shell_file_id column
  - Cannot easily JOIN job_queue with shell_files table for document processing dashboards
  - Prevents efficient "show all jobs for this document" queries
  - Makes it difficult to track document processing lifecycle (pending → processing → completed)
- **Fix Required**: Extract shell_file_id from job_payload during enqueue_job_v3 or in Edge Function before enqueueing
- **Code Location**: shell-file-processor-v3/index.ts or enqueue_job_v3 function should extract job_payload.shell_file_id → table column
- **Query Benefit**: Enables `SELECT * FROM job_queue WHERE shell_file_id = ? ORDER BY created_at` without JSONB parsing
- **Priority**: MEDIUM - Improves query performance and enables document-centric monitoring dashboards

**narrative_id** (UUID, NULLABLE, FK → clinical_narratives)
- **Role**: Links job to narrative creation/update (Pass 3 jobs)
- **NULL Status**: NULLABLE (NULL for Pass 1/Pass 2 jobs)
- **Sample Value**: Not queried (likely NULL for Pass 1 job)
- **Correctness**: ✅ Correct - NULL is correct for Pass 1 entity detection jobs

---

### RESULT & OUTPUT

**job_result** (JSONB, NULLABLE)
- **Role**: Structured results from successful job execution
- **NULL Status**: NULLABLE (NULL for failed jobs)
- **Sample Value**: `null`
- **Correctness**: ✅ Correct - NULL is correct for failed job (no results produced)

**output_files** (TEXT[], NULLABLE)
- **Role**: Array of file paths generated by job (exports, reports, generated artifacts)
- **NULL Status**: NULLABLE (NULL if no files generated)
- **Sample Value**: NULL (not used in V3 architecture)
- **Correctness**: ✅ Correct - NULL is expected; V3 AI processing results go to database tables, not output files
- **V3 Architecture Context**:
  - Pass 1-3 AI processing stores results in database tables (pass1_entity_metrics, patient_conditions, patient_medications, etc.)
  - Reports/exports would go to Supabase Storage with URLs returned in job_result JSONB, not output_files array
  - File cleanup/lifecycle would be tracked in separate table, not job_queue
- **Legacy Field**: Inherited from generic job queue patterns where jobs produce file artifacts (PDF generation, CSV exports, image processing)
- **Not Needed for Exora**: All AI processing output is structured data stored in PostgreSQL tables
- **Future Use Cases** (if ever needed):
  - PDF report generation jobs → store Supabase Storage URLs here
  - Excel export jobs → track generated file paths
  - Image processing jobs → list of processed image URLs
- **Recommendation**: Keep column (removing requires migration) but never populate; provides flexibility for future file-generating job types without schema changes
- **Priority**: N/A - No action needed; harmless as NULL

---

### AUDIT & MONITORING

**created_at** (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- **Role**: When job was enqueued
- **NULL Status**: NOT NULL (audit trail requirement)
- **Sample Value**: `2025-10-05 23:13:27.123784+00`
- **Correctness**: ✅ Correct - Timestamp shows job creation (1 second before scheduled_at)

**updated_at** (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- **Role**: Last modification time (updated on status changes)
- **NULL Status**: NOT NULL (audit trail requirement)
- **Sample Value**: `2025-10-05 23:15:11.942877+00`
- **Correctness**: ⚠️ QUESTION - Why updated_at is before completed_at (23:15:11 vs 23:15:40)?
- **Possible Explanation**: Last heartbeat update before final failure detection

---

## Key Findings & Issues

### 🔴 Critical Bugs (High Priority)

1. **worker_id Environment Variable Not Expanded**
   - **Current State**: Literal string `"render-${RENDER_SERVICE_ID}"` instead of actual service ID
   - **Impact**: Cannot identify which Render worker instance processed jobs; hinders observability and debugging
   - **Root Cause**: Environment variable not expanded in apps/render-worker/src/worker.ts
   - **Verified On**: Jobs 042c94ab and b283b966

2. **heartbeat_at After Completion**
   - **Current State**: heartbeat_at timestamp occurs 15 seconds AFTER completed_at
   - **Impact**: Can cause false timeout reclaims; confuses job lifecycle tracking
   - **Root Cause**: complete_job() function doesn't clear heartbeat_at when marking job complete
   - **Verified On**: Job b283b966 (completed_at: 05:36:50, heartbeat_at: 05:37:05)

3. **actual_duration Always NULL**
   - **Current State**: actual_duration not populated on job completion
   - **Impact**: Missing duration metrics prevents performance analysis, capacity planning, cost estimation
   - **Root Cause**: Worker's completeJob() doesn't pass duration; complete_job() doesn't calculate from timestamps
   - **Verified On**: Job b283b966 (should be ~15 seconds based on timestamps)

### ⚠️ Performance & Query Optimization Issues (Medium Priority)

4. **patient_id Not Populated**
   - **Current State**: patient_id column is NULL; data exists in job_payload JSONB
   - **Impact**: Inefficient queries must parse JSONB; prevents indexed patient-specific job lookups
   - **Verified On**: Jobs 042c94ab and b283b966
   - **Safety Note**: Patient assignment concern is ALREADY HANDLED by profile_classification_audit contamination detection system

5. **shell_file_id Not Populated**
   - **Current State**: shell_file_id column is NULL; data exists in job_payload JSONB
   - **Impact**: Cannot JOIN with shell_files table; prevents efficient document processing tracking
   - **Verified On**: Jobs 042c94ab and b283b966

### ✅ Correct Behaviors (No Action Needed)

6. **Dead Letter Queue Fully Implemented**
   - max_retries (3) properly enforced by claim_next_job_v3
   - Jobs exceeding retry limit moved to DLQ with dead_letter_at timestamp
   - Requires manual admin intervention (prevents infinite failure loops)

7. **NULL Handling Generally Correct**
   - Optional fields (job_description, estimated_duration, memory_usage_mb, cpu_usage_percent, output_files) correctly NULL
   - Required fields (job_type, job_payload, status, priority) correctly NOT NULL
   - Lifecycle fields (started_at, completed_at) correctly NULL until state changes

8. **Legacy Lock Fields Appropriately NULL**
   - lock_acquired_at and lock_expires_at not used (V3 uses PostgreSQL FOR UPDATE SKIP LOCKED)
   - heartbeat_at serves timeout detection role
   - No action needed; fields reserved for potential non-PostgreSQL implementations

9. **Priority Hardcoded Intentionally**
   - All jobs receive priority 5 (standard) via Edge Function
   - enqueue_job_v3 accepts priority parameter (available for future dynamic prioritization)

10. **Error Details Properly Structured**
    - JSONB error_details provides clear root cause, debugging context, retry decision support
    - Verified on job 042c94ab (OpenAI finish_reason: "length")

---

## Action Items

| Priority | Issue | Fix Location | Specific Action Required |
|----------|-------|--------------|--------------------------|
| 🔴 **HIGH** | worker_id not expanded | `apps/render-worker/src/worker.ts` | Update worker constructor: `this.workerId = \`render-${process.env.RENDER_SERVICE_ID \|\| 'local-dev'}\`` |
| 🔴 **HIGH** | heartbeat_at after completion | `complete_job()` function in `08_job_coordination.sql:636-668` | Add `heartbeat_at = NULL` to UPDATE statement; verify worker clearInterval on job completion |
| 🔴 **HIGH** | actual_duration NULL | `complete_job()` function in `08_job_coordination.sql:636-668` | Add auto-calculation: `actual_duration = completed_at - started_at` (Option A - recommended) |
| 🟡 **MEDIUM** | patient_id not populated | `enqueue_job_v3()` function OR `shell-file-processor-v3/index.ts` | Extract `job_payload.patient_id` to table column during job enqueue |
| 🟡 **MEDIUM** | shell_file_id not populated | `enqueue_job_v3()` function OR `shell-file-processor-v3/index.ts` | Extract `job_payload.shell_file_id` to table column during job enqueue |
| 🟢 **LOW** | memory_usage_mb tracking | Worker instrumentation (future) | Implement Node.js `process.memoryUsage()` tracking when scaling beyond single worker |
| 🟢 **LOW** | cpu_usage_percent tracking | Worker instrumentation (future) | Implement `process.cpuUsage()` sampling when optimizing worker performance |
| 🟢 **LOW** | Dynamic priority | `shell-file-processor-v3/index.ts` (future) | Make priority dynamic based on user plan type or job urgency |
| N/A | output_files column | No action | Keep NULL; harmless legacy field, provides flexibility for future file-generating jobs |
| N/A | Dead letter queue monitoring | Admin dashboard (future) | Build interface to view/retry dead-lettered jobs |

---

## Implementation Notes

### Fix 1: worker_id Environment Variable (HIGH)

**File**: `apps/render-worker/src/worker.ts`

**Current Code**:
```typescript
this.workerId = `render-${process.env.RENDER_SERVICE_ID}`;
```

**Fixed Code**:
```typescript
this.workerId = `render-${process.env.RENDER_SERVICE_ID || 'local-dev'}`;
```

**Verification**: Check Render.com logs to confirm RENDER_SERVICE_ID is auto-populated by platform

---

### Fix 2: heartbeat_at After Completion (HIGH)

**File**: `shared/docs/architecture/database-foundation-v3/current_schema/08_job_coordination.sql:636-668`

**Current Code**:
```sql
UPDATE job_queue SET
    status = 'completed',
    completed_at = NOW(),
    job_result = p_job_result,
    updated_at = NOW()
WHERE id = p_job_id AND worker_id = p_worker_id AND status = 'processing';
```

**Fixed Code**:
```sql
UPDATE job_queue SET
    status = 'completed',
    completed_at = NOW(),
    heartbeat_at = NULL,  -- CLEAR HEARTBEAT ON COMPLETION
    job_result = p_job_result,
    updated_at = NOW()
WHERE id = p_job_id AND worker_id = p_worker_id AND status = 'processing';
```

**Worker-Side Verification**: Ensure heartbeat interval is cleared when job completes (`clearInterval(this.heartbeatInterval)`)

---

### Fix 3: actual_duration NULL (HIGH)

**File**: `shared/docs/architecture/database-foundation-v3/current_schema/08_job_coordination.sql:636-668`

**Option A (Recommended - Database-side calculation)**:
```sql
UPDATE job_queue SET
    status = 'completed',
    completed_at = NOW(),
    heartbeat_at = NULL,
    actual_duration = NOW() - started_at,  -- AUTO-CALCULATE DURATION
    job_result = p_job_result,
    updated_at = NOW()
WHERE id = p_job_id AND worker_id = p_worker_id AND status = 'processing';
```

**Option B (Worker-side calculation)**: Modify worker to track start time and pass duration to complete_job RPC (more complex, not recommended)

---

### Fix 4 & 5: patient_id and shell_file_id Population (MEDIUM)

**Option A (Database-side - enqueue_job_v3 function)**:

Add to `enqueue_job_v3()` after INSERT:
```sql
-- Extract patient_id and shell_file_id from job_payload
INSERT INTO job_queue (
    job_type, job_lane, job_name, job_payload, job_category, priority, scheduled_at,
    patient_id, shell_file_id  -- ADD THESE COLUMNS
) VALUES (
    job_type, p_job_lane, job_name, job_payload, job_category, priority, p_scheduled_at,
    (job_payload->>'patient_id')::uuid,     -- EXTRACT FROM JSONB
    (job_payload->>'shell_file_id')::uuid   -- EXTRACT FROM JSONB
)
```

**Option B (Edge Function - shell-file-processor-v3/index.ts)**:

Pass explicit parameters to enqueue_job_v3:
```typescript
const { data: jobResponse, error: enqueueError } = await supabase
  .rpc('enqueue_job_v3', {
    job_type: 'shell_file_processing',
    job_name: `Process ${data.filename}`,
    job_payload: jobPayload,
    job_category: 'document_processing',
    priority: 5,
    patient_id: jobPayload.patient_id,      // ADD THIS
    shell_file_id: jobPayload.shell_file_id  // ADD THIS
  });
```

Then update enqueue_job_v3 signature to accept these parameters.

---

## SQL Queries for Verification

```sql
-- Check if patient_id and shell_file_id are populated
SELECT
  id,
  job_type,
  patient_id,
  shell_file_id,
  job_payload->>'patient_id' as payload_patient_id,
  job_payload->>'shell_file_id' as payload_shell_file_id
FROM job_queue
WHERE job_type = 'ai_processing'
LIMIT 5;

-- Check retry patterns
SELECT
  status,
  retry_count,
  max_retries,
  dead_letter_at IS NOT NULL as is_dead_lettered,
  COUNT(*) as job_count
FROM job_queue
GROUP BY status, retry_count, max_retries, dead_letter_at IS NOT NULL
ORDER BY status, retry_count;

-- Check worker_id patterns
SELECT
  DISTINCT worker_id,
  COUNT(*) as job_count
FROM job_queue
WHERE worker_id IS NOT NULL
GROUP BY worker_id;

-- Check timestamp consistency
SELECT
  id,
  created_at,
  scheduled_at,
  started_at,
  completed_at,
  updated_at,
  heartbeat_at,
  EXTRACT(EPOCH FROM (completed_at - started_at)) as processing_seconds
FROM job_queue
WHERE status IN ('completed', 'failed')
ORDER BY created_at DESC
LIMIT 10;
```
