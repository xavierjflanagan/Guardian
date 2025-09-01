# TEMPORARY: v3 phase 2 v5 review Issues 3 & 4 Analysis and Proposed Fixes

**Context**: Pre-launch repository - no migrations needed, direct codebase updates only

## Issue 3: Job Type/Lane Architecture Design

### **Problem Analysis**
Current V5 implementation has conflicting job type definitions that lose lane-level observability and create CHECK constraint violations.

**Current Broken State in v5:**
- `job_queue` CHECK constraint allows: `fast_queue_document`, `ai_queue_complex`, etc.
- `enqueue_job_v3()` tries to use generic types: `document_processing`, `ai_processing`
- **Result**: CHECK constraint violations when enqueueing jobs

### **Root Cause**
Mixed architecture combining lane-specific types (`fast_queue_*`) with generic categories (`document_processing`) in the same constraint.

### **Proposed Solution: Two-Column Architecture**

#### **Database Schema Changes Required:**

**File: `shared/docs/architecture/database-foundation-v3/implementation/database/07_optimization.sql`**

**REMOVE these lines (around line 46):**
```sql
ALTER TABLE job_queue ADD CONSTRAINT job_queue_job_type_check CHECK (job_type IN (
    'fast_queue_document', 'ai_queue_complex', 'ai_queue_simple', 'fast_queue_entity',
    'document_processing', 'ai_processing', 'data_migration', 'audit_cleanup',
    'system_maintenance', 'notification_dispatch'
));
```

**REPLACE with:**
```sql
-- Two-column architecture: job_type (category) + job_lane (routing)
ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS job_lane TEXT;

-- Job type constraint (coarse categories)
ALTER TABLE job_queue ADD CONSTRAINT job_queue_job_type_check CHECK (job_type IN (
    'shell_file_processing', 'ai_processing', 'data_migration', 'audit_cleanup',
    'system_maintenance', 'notification_dispatch'
));

-- Job lane constraint (fine-grained routing)
ALTER TABLE job_queue ADD CONSTRAINT job_queue_job_lane_check CHECK (
    (job_type = 'shell_file_processing' AND job_lane IN ('fast_queue', 'standard_queue')) OR
    (job_type = 'ai_processing' AND job_lane IN ('ai_queue_simple', 'ai_queue_complex')) OR
    (job_type IN ('data_migration', 'audit_cleanup', 'system_maintenance', 'notification_dispatch') AND job_lane IS NULL)
);

-- Index for worker lane-specific queries
CREATE INDEX IF NOT EXISTS idx_job_queue_type_lane_status ON job_queue(job_type, job_lane, status, priority DESC, scheduled_at ASC)
WHERE status IN ('pending', 'processing');
```

#### **Function Updates Required:**

**File: `shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v5.md`**

**Update `enqueue_job_v3()` function (around line 1135):**

**REPLACE the job_type validation section:**
```sql
-- Current broken validation
IF NOT (job_type = ANY(allowed_types)) THEN
    RAISE EXCEPTION 'Invalid job_type. Allowed: %', allowed_types;
END IF;
```

**WITH:**
```sql
-- Two-column validation
DECLARE
    allowed_types text[] := ARRAY['shell_file_processing', 'ai_processing', 'data_migration', 'audit_cleanup', 'system_maintenance', 'notification_dispatch'];
    p_job_lane text := job_payload->>'job_lane';
BEGIN
    -- Validate job_type
    IF NOT (job_type = ANY(allowed_types)) THEN
        RAISE EXCEPTION 'Invalid job_type. Allowed: %', allowed_types;
    END IF;
    
    -- Validate job_lane combinations
    IF job_type = 'shell_file_processing' AND p_job_lane NOT IN ('fast_queue', 'standard_queue') THEN
        RAISE EXCEPTION 'shell_file_processing requires job_lane: fast_queue or standard_queue';
    ELSIF job_type = 'ai_processing' AND p_job_lane NOT IN ('ai_queue_simple', 'ai_queue_complex') THEN
        RAISE EXCEPTION 'ai_processing requires job_lane: ai_queue_simple or ai_queue_complex';
    ELSIF job_type IN ('data_migration', 'audit_cleanup', 'system_maintenance', 'notification_dispatch') AND p_job_lane IS NOT NULL THEN
        RAISE EXCEPTION 'job_type % should not have job_lane', job_type;
    END IF;

    -- Insert with both columns
    INSERT INTO job_queue (job_type, job_lane, job_name, job_payload, job_category, priority, scheduled_at)
    VALUES (job_type, p_job_lane, job_name, job_payload, job_category, priority, scheduled_at)
    RETURNING id, scheduled_at INTO job_id, scheduled_at;
```

**Update `dequeue_jobs_v3()` function (around line 1160):**

**REPLACE the WHERE clause:**
```sql
WHERE status = 'pending' 
    AND scheduled_at <= NOW()
    AND (job_types IS NULL OR job_type = ANY(job_types))
```

**WITH:**
```sql
WHERE status = 'pending' 
    AND scheduled_at <= NOW()
    AND (job_types IS NULL OR job_type = ANY(job_types))
    AND (job_lanes IS NULL OR job_lane = ANY(job_lanes))
```

**Add job_lanes parameter to function signature:**
```sql
CREATE OR REPLACE FUNCTION dequeue_jobs_v3(
    worker_id text,
    batch_size integer default 1,
    job_types text[] default null,
    job_lanes text[] default null  -- NEW PARAMETER
)
```

#### **Worker Code Updates Required:**

**File: `shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v5.md`**

**Update worker logic (around line 2400):**
```typescript
// Worker configuration with lane awareness
const workerConfig = {
    // Fast queue worker (documents/files)
    fast_worker: {
        job_types: ['shell_file_processing'],
        job_lanes: ['fast_queue'],
        batch_size: 5
    },
    // AI processing worker (complex)
    ai_complex_worker: {
        job_types: ['ai_processing'],  
        job_lanes: ['ai_queue_complex'],
        batch_size: 2
    },
    // AI processing worker (simple)
    ai_simple_worker: {
        job_types: ['ai_processing'],
        job_lanes: ['ai_queue_simple'], 
        batch_size: 3
    }
};

// Updated dequeue call
const jobs = await supabase.rpc('dequeue_jobs_v3', {
    worker_id: this.workerId,
    batch_size: config.batch_size,
    job_types: config.job_types,
    job_lanes: config.job_lanes  // NEW
});
```

---

## Issue 4: Document → Shell File Terminology Migration

### **Problem Analysis**
V3 semantic architecture uses `shell_files` but legacy `document_processing` terminology remains in job types and session types, creating conceptual inconsistency.

**Current Inconsistent State:**
- Database tables: `shell_files` ✅ (correct)
- Job types: `document_processing` ❌ (legacy)
- Session types: `document_processing` ❌ (legacy)
- Function names: mixed terminology

### **Proposed Solution: Complete Terminology Migration**

#### **Database Schema Changes Required:**

**File: `shared/docs/architecture/database-foundation-v3/implementation/database/04_ai_processing.sql`**

**Line 46 - REPLACE:**
```sql
CHECK (p_session_type IN (
    'document_processing', 'entity_extraction', 'clinical_validation',
    'narrative_synthesis', 'quality_assurance'
))
```

**WITH:**
```sql
CHECK (p_session_type IN (
    'shell_file_processing', 'entity_extraction', 'clinical_validation',
    'narrative_synthesis', 'quality_assurance'  
))
```

**File: `shared/docs/architecture/database-foundation-v3/implementation/database/07_optimization.sql`**

**Update job_type constraint (combining with Issue 3 fix):**
```sql
-- Already fixed above in Issue 3 solution
ALTER TABLE job_queue ADD CONSTRAINT job_queue_job_type_check CHECK (job_type IN (
    'shell_file_processing',  -- CHANGED from 'document_processing'
    'ai_processing', 'data_migration', 'audit_cleanup',
    'system_maintenance', 'notification_dispatch'
));
```

#### **Function Updates Required:**

**File: `shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v5.md`**

**Update `create_semantic_processing_session()` default parameter (around line 1700):**

**REPLACE:**
```sql
p_session_type TEXT DEFAULT 'document_processing',
```

**WITH:**
```sql
p_session_type TEXT DEFAULT 'shell_file_processing',
```

**Update all function calls and references:**

**Search and replace in v5 file:**
- `'document_processing'` → `'shell_file_processing'`
- `document_processor` → `shell_file_processor` (in comments/names)

#### **Edge Function Updates Required:**

**File: `shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v5.md`**

**Update Edge Function names and references (around line 2200):**

**REPLACE function names:**
- `shell-file-processor-v3` ✅ (already correct)
- Update internal job enqueuing to use `'shell_file_processing'`

**Update enqueue calls:**
```typescript
// Inside Edge Functions
await supabase.rpc('enqueue_job_v3', {
    job_type: 'shell_file_processing',  // CHANGED from 'document_processing' 
    job_name: 'process_uploaded_file',
    job_payload: {
        shell_file_id: fileRecord.id,
        job_lane: 'fast_queue'  // NEW: Add lane specification
    }
});
```

---

## **Summary of Required Changes**

### **Files to Update:**

1. **`shared/docs/architecture/database-foundation-v3/implementation/database/04_ai_processing.sql`**
   - Line 46: Update session type constraint

2. **`shared/docs/architecture/database-foundation-v3/implementation/database/07_optimization.sql`** 
   - Add job_lane column and constraints
   - Update job_type constraint  
   - Add lane-specific index

3. **`shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v5.md`**
   - Update `enqueue_job_v3()` function with two-column validation
   - Update `dequeue_jobs_v3()` function with job_lanes parameter
   - Update `create_semantic_processing_session()` default parameter
   - Update worker configuration examples
   - Update Edge Function enqueue calls
   - Global find/replace: `'document_processing'` → `'shell_file_processing'`

### **Expected Benefits:**
1. **Issue 3**: Maintains lane-level observability while fixing CHECK constraint violations
2. **Issue 4**: Consistent V3 semantic architecture terminology throughout
3. **Combined**: Clean, maintainable job queue architecture ready for production

### **Testing Required:**
- Verify job enqueue/dequeue cycle works with new two-column architecture
- Confirm all CHECK constraints pass with new terminology  
- Test worker lane-specific job claiming
- Validate Edge Function integration with updated job types

**Ready for implementation - no migration concerns since pre-launch!**