# V3 Phase 2 Consensus Implementation Plan v3

**Date:** August 31, 2025  
**Purpose:** Production-ready implementation plan with verified V3 schema integration  
**Status:** North Star Architecture - Implementation Ready  
**Contributors:** Claude Code + GPT-5 collaborative analysis + V3 schema verification  
**Version:** 3.0 - All critical issues addressed with schema-verified updates

---

## Executive Summary

**CONSENSUS ACHIEVED:** **MEDIUM-HIGH risk V3 deployment** with Render.com + Supabase hybrid architecture for 1000+ concurrent user scalability.

**Key Architecture Decisions:**
- ✅ **Hybrid Processing:** Supabase (job coordination, data) + Render.com (OCR/AI workers)
- ✅ **Scope:** Clean slate approach - Delete 12 legacy Edge Functions, build V3-native functions
- ✅ **Timeline:** 4-5 weeks implementation with Render.com worker integration  
- ✅ **Schema Verified:** All table references validated against actual V3 SQL files
- ✅ **API Rate Limiting:** Comprehensive framework for 1000+ concurrent processing

**Critical Success Factors:**
1. Render.com worker services with API rate limiting for long-running OCR/AI processing
2. Enhanced Supabase job_queue table with heartbeat detection and dead letter queues
3. V3-native Edge Functions built specifically for existing `shell_files` schema
4. Vendor-agnostic rate limiting framework with backpressure management

---

## Technical Architecture: Supabase + Render.com Hybrid (Schema Verified)

### **1. V3 Schema Reality (Verified Against Actual SQL Files)**

**V3 Uses `shell_files` Table (03_clinical_core.sql:123-140):**
```sql
-- EXISTING in V3 schema
CREATE TABLE IF NOT EXISTS shell_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    -- ... existing fields ...
    processing_error TEXT,  -- EXISTING (needs JSONB conversion)
    -- ... other existing fields ...
);

-- REQUIRED ADDITIONS to shell_files
ALTER TABLE shell_files ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE shell_files ALTER COLUMN processing_error TYPE JSONB USING 
    CASE 
        WHEN processing_error IS NULL THEN NULL
        ELSE jsonb_build_object('legacy_error', processing_error)
    END;
```

**Enhanced Job Queue Architecture (07_optimization.sql:37-101 + additions):**
```sql
-- EXISTING job_queue table structure (already comprehensive)
-- REQUIRED ADDITIONS for Render.com worker coordination:
ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;
ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS dead_letter_at TIMESTAMPTZ;

-- UPDATE existing job_type CHECK constraint for Render architecture
ALTER TABLE job_queue DROP CONSTRAINT IF EXISTS job_queue_job_type_check;
ALTER TABLE job_queue ADD CONSTRAINT job_queue_job_type_check CHECK (job_type IN (
    'fast_queue_security', 'fast_queue_ocr', 'fast_queue_spatial',
    'ai_queue_pass1', 'ai_queue_pass2', 'ai_queue_pass3',
    'audit_cleanup', 'notification_delivery', 'report_generation', 
    'backup_operation', 'system_maintenance', 'consent_verification'
));
```

### **2. API Rate Limiting Framework (Critical Missing Piece)**

**Vendor-Agnostic Rate Limiting Architecture:**
```sql
-- NEW: API rate limiting table for 1000+ concurrent user scalability
CREATE TABLE IF NOT EXISTS api_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Provider Configuration
    provider_name TEXT NOT NULL, -- 'openai', 'google_vision', 'anthropic', etc.
    api_endpoint TEXT NOT NULL,
    
    -- Rate Limit Configuration
    requests_per_minute INTEGER NOT NULL DEFAULT 60,
    requests_per_hour INTEGER,
    tokens_per_minute INTEGER, -- For token-based APIs
    tokens_per_hour INTEGER,
    concurrent_requests INTEGER DEFAULT 10,
    
    -- Current Usage Tracking (reset periodically)
    current_requests_minute INTEGER DEFAULT 0,
    current_requests_hour INTEGER DEFAULT 0,
    current_tokens_minute INTEGER DEFAULT 0,
    current_tokens_hour INTEGER DEFAULT 0,
    active_requests INTEGER DEFAULT 0,
    
    -- Reset Timestamps
    minute_reset_at TIMESTAMPTZ DEFAULT NOW(),
    hour_reset_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Backpressure Configuration
    backpressure_threshold NUMERIC(3,2) DEFAULT 0.8, -- At 80% capacity
    backpressure_delay_seconds INTEGER DEFAULT 5,
    queue_depth_limit INTEGER DEFAULT 1000,
    
    -- Status and Monitoring
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'maintenance')),
    last_rate_limit_hit TIMESTAMPTZ,
    rate_limit_violations INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(provider_name, api_endpoint)
);

-- Insert default API rate limits for scale-ready deployment
INSERT INTO api_rate_limits (provider_name, api_endpoint, requests_per_minute, tokens_per_minute, concurrent_requests) VALUES
('openai', 'gpt-4o-mini', 500, 200000, 50),     -- OpenAI GPT-4o Mini
('openai', 'gpt-4-vision', 100, 20000, 20),     -- OpenAI Vision API
('google', 'vision-api', 1800, NULL, 100),      -- Google Vision API (per minute)
('anthropic', 'claude-3', 400, 100000, 25)      -- Anthropic Claude
ON CONFLICT (provider_name, api_endpoint) DO NOTHING;
```

**Rate Limiting Coordination Functions:**
```sql
-- Rate limiting coordination for Render workers
CREATE OR REPLACE FUNCTION acquire_api_capacity(
    p_provider_name TEXT,
    p_api_endpoint TEXT,
    p_estimated_tokens INTEGER DEFAULT 1000
) RETURNS BOOLEAN AS $$
DECLARE
    rate_limit_record RECORD;
    current_time TIMESTAMPTZ := NOW();
BEGIN
    -- Get current rate limit status
    SELECT * INTO rate_limit_record 
    FROM api_rate_limits 
    WHERE provider_name = p_provider_name 
    AND api_endpoint = p_api_endpoint 
    AND status = 'active';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active rate limit configuration for %:%', p_provider_name, p_api_endpoint;
    END IF;
    
    -- Reset counters if minute boundary crossed
    IF current_time - rate_limit_record.minute_reset_at > INTERVAL '1 minute' THEN
        UPDATE api_rate_limits SET
            current_requests_minute = 0,
            current_tokens_minute = 0,
            minute_reset_at = current_time
        WHERE id = rate_limit_record.id;
        rate_limit_record.current_requests_minute = 0;
        rate_limit_record.current_tokens_minute = 0;
    END IF;
    
    -- Check if we can process this request
    IF (rate_limit_record.current_requests_minute + 1 > rate_limit_record.requests_per_minute) OR
       (rate_limit_record.current_tokens_minute + p_estimated_tokens > rate_limit_record.tokens_per_minute) OR
       (rate_limit_record.active_requests >= rate_limit_record.concurrent_requests) THEN
        -- Rate limit exceeded
        UPDATE api_rate_limits SET 
            last_rate_limit_hit = current_time,
            rate_limit_violations = rate_limit_violations + 1
        WHERE id = rate_limit_record.id;
        RETURN FALSE;
    END IF;
    
    -- Acquire capacity
    UPDATE api_rate_limits SET
        current_requests_minute = current_requests_minute + 1,
        current_tokens_minute = current_tokens_minute + p_estimated_tokens,
        active_requests = active_requests + 1
    WHERE id = rate_limit_record.id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION release_api_capacity(
    p_provider_name TEXT,
    p_api_endpoint TEXT,
    p_actual_tokens INTEGER DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE api_rate_limits SET
        active_requests = GREATEST(0, active_requests - 1),
        -- Adjust token usage if actual differs from estimate
        current_tokens_minute = CASE 
            WHEN p_actual_tokens IS NOT NULL 
            THEN GREATEST(0, current_tokens_minute - 1000 + p_actual_tokens)
            ELSE current_tokens_minute
        END
    WHERE provider_name = p_provider_name 
    AND api_endpoint = p_api_endpoint;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### **3. Division of Responsibilities: Supabase vs Render.com**

**Supabase Responsibilities:**
- **Database:** PostgreSQL with RLS using existing `has_profile_access()` functions
- **Storage:** File storage with user-isolated folders  
- **Authentication:** User management and JWT tokens
- **Job Coordination:** Enhanced `job_queue` table with heartbeat detection
- **API Rate Limiting:** Centralized rate limit coordination and backpressure
- **Audit Logging:** Existing `log_audit_event` system

**Render.com Responsibilities:**
- **Background Workers:** Long-running OCR/AI processing with API rate limiting
- **Queue Processing:** Claim jobs with heartbeat updates and timeout detection
- **Retry Logic:** Exponential backoff with jitter (2s, 4s, 8s, 16s, 32s, 64s)
- **Scalability:** Horizontal scaling with API capacity coordination
- **OS Dependencies:** ImageMagick, poppler, tesseract for document processing
- **Dead Letter Queue:** Final error handling with structured error logging

### **4. Processing Flow Architecture with Rate Limiting**

```
Enhanced User Upload Flow with Rate Limiting:
1. Client uploads file → Supabase Storage
2. Edge Function (shell-file-processor-v3) → Creates shell_files + enqueues jobs
3. Render Worker claims job → acquire_api_capacity() check
4. If capacity available → Download file + process
5. If no capacity → Backpressure delay + re-queue with scheduled_at
6. Process → OCR/AI with rate limiting → release_api_capacity()
7. Write results → Complete job with heartbeat cleanup

Rate Limiting Flow Detail:
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Render.com    │    │   Supabase      │    │   API Provider  │
│   Worker        │    │   Rate Limiter  │    │   (OpenAI/etc)  │
│                 │    │                 │    │                 │
│ 1. Claim Job    │───▶│ 2. Check Rate   │    │                 │
│                 │    │ Limits          │    │                 │
│                 │◀───│ 3. Grant/Deny   │    │                 │
│                 │    │ Capacity        │    │                 │
│                 │    │                 │    │                 │
│ 4. Process      │────┼─────────────────┼───▶│ 5. API Call     │
│ (if granted)    │    │                 │    │                 │
│                 │◀───┼─────────────────┼────│ 6. Response     │
│                 │    │                 │    │                 │
│ 7. Release      │───▶│ 8. Update       │    │                 │
│ Capacity        │    │ Counters        │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### **5. V3 Edge Functions Clean Slate Design (Schema Verified)**

**APPROACH: Delete all 12 legacy functions, build V3-native replacements**

**V3 Essential Functions (NEW - Built from scratch for existing schema):**

**Priority 1 - Core V3 Functions:**
- `shell-file-processor-v3` - Upload success guarantee, enqueue with idempotency
- `audit-logger-v3` - Healthcare compliance using existing audit infrastructure

**Processing Architecture with Existing V3 Schema:**
- **Upload Always Succeeds:** Files saved to existing `shell_files` table with idempotency_key
- **Fast Queue (Render):** Security scan → OCR → Spatial mapping (< 2 minutes) with rate limiting
- **AI Queue (Render):** Pass 1 → Pass 2 → Pass 3 with retry logic and API capacity management
- **Error Resilience:** All failures logged to enhanced `shell_files.processing_error` JSONB

**DELETED Legacy Functions (Clean slate approach):**
- ❌ `document-processor` → Replaced by `shell-file-processor-v3` + Render workers
- ❌ `document-processor-complex` → Render AI queue covers this
- ❌ `document-processor-simple` → Redundant with clean V3 design
- ❌ `queue-worker` → Replaced by Render.com worker services with API rate limiting
- ❌ `audit-events` → Replaced by `audit-logger-v3`
- ❌ `ai-diagnostic` + 7 test/debug functions → Development artifacts, not needed

### **6. Enhanced Job Management RPCs (Production Ready)**

**Production-Ready Job Enqueuing with Schema Verification:**
```sql
-- Enhanced enqueue_job_v3 with rate limiting awareness
CREATE OR REPLACE FUNCTION enqueue_job_v3(
    job_type text,           
    job_name text,
    job_payload jsonb,
    job_category text default 'standard',
    priority int default 5,
    scheduled_at timestamptz default now()
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    job_id uuid;
    allowed_types text[] := ARRAY['fast_queue_security', 'fast_queue_ocr', 'fast_queue_spatial', 
                                  'ai_queue_pass1', 'ai_queue_pass2', 'ai_queue_pass3'];
    backpressure_delay INTEGER := 0;
BEGIN
    -- Validation
    IF NOT (job_type = ANY(allowed_types)) THEN
        RAISE EXCEPTION 'Invalid job_type. Allowed: %', allowed_types;
    END IF;
    
    IF job_payload IS NULL OR job_payload = '{}'::jsonb THEN
        RAISE EXCEPTION 'job_payload cannot be empty';
    END IF;
    
    -- Check for API rate limiting backpressure
    IF job_type LIKE 'ai_queue%' THEN
        SELECT backpressure_delay_seconds INTO backpressure_delay
        FROM api_rate_limits 
        WHERE provider_name = 'openai' 
        AND (current_requests_minute::float / requests_per_minute) > backpressure_threshold;
        
        IF FOUND AND backpressure_delay > 0 THEN
            scheduled_at := scheduled_at + (backpressure_delay || ' seconds')::INTERVAL;
        END IF;
    END IF;
    
    -- Insert job with potential backpressure delay
    INSERT INTO job_queue (job_type, job_name, job_payload, job_category, priority, scheduled_at)
    VALUES (job_type, job_name, job_payload, job_category, priority, scheduled_at)
    RETURNING id INTO job_id;
    
    RETURN job_id;
END;
$$;
```

**Enhanced Worker Job Claiming with Heartbeat:**
```sql
-- Production-ready job claiming with heartbeat and timeout detection
CREATE OR REPLACE FUNCTION claim_next_job_v3(
    worker_id text, 
    job_types text[] default null,
    heartbeat_interval_seconds integer default 30
)
RETURNS TABLE(job_id uuid, job_type text, job_payload jsonb, retry_count int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    timeout_threshold TIMESTAMPTZ := NOW() - INTERVAL '5 minutes';
    heartbeat_expiry TIMESTAMPTZ := NOW() + (heartbeat_interval_seconds || ' seconds')::INTERVAL;
BEGIN
    -- First, reclaim timed-out jobs (heartbeat expired)
    UPDATE job_queue SET
        status = 'pending',
        worker_id = NULL,
        started_at = NULL,
        heartbeat_at = NULL,
        retry_count = retry_count + 1,
        error_details = jsonb_build_object(
            'error_type', 'worker_timeout',
            'original_worker', worker_id,
            'timeout_at', NOW()
        )
    WHERE status = 'running' 
    AND heartbeat_at < timeout_threshold
    AND retry_count < max_retries;
    
    -- Move permanently failed jobs to dead letter queue
    UPDATE job_queue SET
        status = 'failed',
        dead_letter_at = NOW(),
        error_details = jsonb_set(
            COALESCE(error_details, '{}'),
            '{dead_letter_reason}',
            '"exceeded_max_retries_after_timeout"'
        )
    WHERE status = 'running'
    AND heartbeat_at < timeout_threshold
    AND retry_count >= max_retries;
    
    -- Claim next available job
    RETURN QUERY
    UPDATE job_queue 
    SET 
        status = 'running',
        started_at = NOW(),
        worker_id = claim_next_job_v3.worker_id,
        heartbeat_at = heartbeat_expiry
    WHERE id = (
        SELECT id FROM job_queue 
        WHERE status = 'pending' 
        AND scheduled_at <= NOW()
        AND (job_types IS NULL OR job_type = ANY(job_types))
        ORDER BY priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING id, job_type, job_payload, retry_count;
END;
$$;

-- Heartbeat update function for worker health monitoring
CREATE OR REPLACE FUNCTION update_job_heartbeat(
    p_job_id uuid,
    p_worker_id text,
    heartbeat_interval_seconds integer default 30
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE job_queue SET
        heartbeat_at = NOW() + (heartbeat_interval_seconds || ' seconds')::INTERVAL,
        updated_at = NOW()
    WHERE id = p_job_id 
    AND worker_id = p_worker_id 
    AND status = 'running';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### **7. RLS Security (Using Existing V3 Functions)**

**Consistent shell_files Access (Using V3 has_profile_access):**
```sql
-- Use existing V3 RLS functions instead of creating new ones
-- shell_files already has proper RLS in 03_clinical_core.sql
-- job_queue access restricted to service role only

CREATE POLICY "job_queue_service_role_only" ON job_queue
    FOR ALL USING (
        current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
        OR is_service_role()
    );

-- api_rate_limits table security
CREATE POLICY "api_rate_limits_service_role_only" ON api_rate_limits
    FOR ALL USING (
        current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
        OR is_service_role()
    );

-- Enable RLS on new tables
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
```

---

## Implementation Roadmap (Weeks 4-7)

### **Week 4: V3 Database Enhancement + Render.com Setup**

#### **Days 1-2: V3 Database Schema Updates**
```sql
-- Execute schema enhancements on existing V3 database:
-- 1. Add idempotency_key to shell_files
-- 2. Convert processing_error to JSONB
-- 3. Add heartbeat_at and dead_letter_at to job_queue  
-- 4. Create api_rate_limits table with default providers
-- 5. Deploy enhanced RPCs (enqueue_job_v3, claim_next_job_v3)
```

#### **Days 3-5: Render.com Infrastructure Setup**
```bash
# Render.com account and worker setup with API rate limiting
1. Create Render.com account and configure service
2. Setup environment variables:
   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
   - OPENAI_API_KEY, GOOGLE_CLOUD_API_KEY
   - WORKER_CONCURRENCY=50, HEARTBEAT_INTERVAL_SECONDS=30
   - API_RATE_LIMIT_CHECK_ENABLED=true
3. Deploy minimal worker with job claiming, heartbeat, and rate limiting
4. Validate end-to-end flow: enqueue → claim → heartbeat → complete
```

#### **Days 6-7: V3 Native Edge Functions Development**
```typescript
// Clean slate V3-native function development for existing schema:
// 1. shell-file-processor-v3: Upload success + job enqueuing with idempotency
// 2. audit-logger-v3: Proper audit logging using existing infrastructure
// 3. No legacy compatibility - pure V3 implementation with Render + rate limiting
```

### **Week 5: OCR/AI Processing with Rate Limiting**

#### **Days 1-4: Render Worker Implementation with API Limits**
```typescript
// Render worker with comprehensive rate limiting:
// 1. Fast queue: Security → OCR → Spatial (rate limited per provider)
// 2. AI queue: Pass 1 → Pass 2 → Pass 3 with API capacity coordination
// 3. Exponential backoff + API rate limit backpressure
// 4. Dead letter queue with structured error logging
// 5. Heartbeat updates every 30 seconds
```

#### **Days 5-7: Integration Testing & Rate Limit Validation**
- End-to-end workflow with rate limiting under load
- 100+ concurrent upload testing with API throttling
- Rate limit enforcement and backpressure validation  
- Worker heartbeat and timeout recovery testing

### **Week 6: Production Readiness & Monitoring**

#### **Days 1-3: Monitoring & Rate Limit SLOs**
```typescript
// Enhanced SLOs with rate limiting metrics:
// - Fast queue 95p latency < 2 min (including rate limit delays)
// - AI queue 95p latency < 10 min (including backpressure)
// - API rate limit violations < 1% of requests
// - Worker heartbeat failures < 0.1%
// - Successful job completion rate > 99%
```

#### **Days 4-7: Production Deployment & Validation**
- Delete all 12 legacy Edge Functions
- Deploy V3-native functions with Render worker integration
- Full system validation: upload → rate limited processing → completion
- 1000+ concurrent upload stress testing with API limits

### **Week 7: Post-Deployment Validation & Documentation**

#### **Days 1-4: System Validation & Rate Limit Monitoring**
- Full system stress testing with rate limit coordination
- RLS policy verification using existing `has_profile_access()` functions
- API rate limit effectiveness validation
- Worker scaling and timeout recovery testing

#### **Days 5-7: Documentation & Operational Readiness**
- Render.com + API rate limiting operational runbooks
- Worker scaling procedures and rate limit adjustment guides
- Emergency procedures and rollback plans
- Team training on hybrid architecture with rate limiting

---

## Critical Implementation Details

### **1. Upload Success Guarantee with Idempotency (Schema Verified)**

**Enhanced Idempotency Using Existing V3 Schema:**
```typescript
// Client-side upload with existing shell_files table
const uploadFile = async (file: File, userId: string, profileId: string) => {
    const idempotencyKey = `${profileId}_${file.name}_${file.size}_${file.lastModified}`;
    
    // 1. Storage upload (always succeeds)
    const { data: storageData } = await supabase.storage
        .from('medical-docs')
        .upload(`${userId}/${Date.now()}_${file.name}`, file);
    
    // 2. Database record with idempotency (using existing schema + new column)
    const { data: shellFile } = await supabase
        .from('shell_files')
        .upsert({
            patient_id: profileId,  // Existing column references user_profiles(id)
            filename: file.name,
            original_filename: file.name,
            file_size_bytes: file.size,
            mime_type: file.type,
            storage_path: storageData.path,
            idempotency_key: idempotencyKey,  // New column for deduplication
            status: 'uploaded'
        }, { onConflict: 'idempotency_key' })
        .select('id')
        .single();
    
    // 3. Enqueue processing with rate limit awareness
    await supabase.rpc('enqueue_job_v3', {
        job_type: 'fast_queue_security',
        job_name: `Process ${file.name}`,
        job_payload: { shell_file_id: shellFile.id, storage_path: storageData.path }
    });
    
    return shellFile;
};
```

### **2. Render.com Worker Implementation with API Rate Limiting**

**Production-Ready Worker with Rate Limiting:**
```typescript
// Enhanced Render worker with comprehensive rate limiting
class GuardianWorkerV3 {
    private queues = ['fast_queue', 'ai_queue'];
    private concurrency = parseInt(process.env.WORKER_CONCURRENCY || '50');
    private heartbeatInterval = parseInt(process.env.HEARTBEAT_INTERVAL_SECONDS || '30') * 1000;
    
    async processJob(job: Job) {
        const startTime = Date.now();
        let apiCapacityAcquired = false;
        
        try {
            // Heartbeat update
            await this.updateHeartbeat(job.job_id);
            
            // API rate limiting for AI jobs
            if (job.job_type.startsWith('ai_queue')) {
                const hasCapacity = await this.acquireAPICapacity(
                    'openai', 
                    'gpt-4o-mini', 
                    this.estimateTokens(job.payload)
                );
                
                if (!hasCapacity) {
                    // Backpressure - reschedule job
                    await this.rescheduleWithBackpressure(job);
                    return;
                }
                apiCapacityAcquired = true;
            }
            
            // Download file and process
            const fileBuffer = await this.downloadFile(job.payload.storage_path);
            let results;
            
            switch (job.job_type) {
                case 'fast_queue_security':
                    results = await this.runSecurityScan(fileBuffer);
                    break;
                case 'fast_queue_ocr':
                    results = await this.runOCRWithRateLimit(fileBuffer);
                    break;
                case 'ai_queue_pass1':
                    results = await this.runAIPass1WithRateLimit(fileBuffer, job.payload);
                    break;
                // ... other job types
            }
            
            // Write results back
            await this.writeResults(job.payload.shell_file_id, results);
            await this.completeJob(job.job_id);
            
        } catch (error) {
            await this.handleJobError(job, error, Date.now() - startTime);
        } finally {
            // Always release API capacity
            if (apiCapacityAcquired) {
                await this.releaseAPICapacity('openai', 'gpt-4o-mini');
            }
        }
    }
    
    private async acquireAPICapacity(provider: string, endpoint: string, estimatedTokens: number): Promise<boolean> {
        const { data } = await this.supabase.rpc('acquire_api_capacity', {
            p_provider_name: provider,
            p_api_endpoint: endpoint,
            p_estimated_tokens: estimatedTokens
        });
        return data;
    }
    
    private async updateHeartbeat(jobId: string): Promise<void> {
        await this.supabase.rpc('update_job_heartbeat', {
            p_job_id: jobId,
            p_worker_id: this.workerId
        });
    }
    
    private async rescheduleWithBackpressure(job: Job): Promise<void> {
        const backpressureDelay = 30; // 30 seconds
        const nextScheduled = new Date(Date.now() + backpressureDelay * 1000);
        
        await this.supabase
            .from('job_queue')
            .update({
                status: 'pending',
                scheduled_at: nextScheduled.toISOString(),
                worker_id: null,
                started_at: null,
                heartbeat_at: null
            })
            .eq('id', job.job_id);
    }
}
```

### **3. Enhanced Error Handling with Structured Logging**

**JSONB Processing Error Structure (Using Enhanced V3 Schema):**
```typescript
interface ProcessingErrorV3 {
    current_error?: {
        error_type: 'api_rate_limit' | 'ocr_failure' | 'ai_timeout' | 'network_error' | 'worker_timeout';
        error_message: string;
        retry_count: number;
        next_retry_at: string;
        worker_id: string;
        api_provider?: string;
        rate_limit_hit?: boolean;
        heartbeat_expired?: boolean;
        duration_ms: number;
        timestamp: string;
    };
    error_history: Array<{
        error_type: string;
        error_message: string;
        retry_count: number;
        worker_id: string;
        api_provider?: string;
        duration_ms: number;
        timestamp: string;
        resolved: boolean;
    }>;
    api_metrics: {
        total_api_calls: number;
        rate_limit_hits: number;
        backpressure_delays: number;
        successful_api_calls: number;
        failed_api_calls: number;
        total_tokens_used: number;
    };
}
```

---

## Risk Assessment & Mitigation

### **Risk Level: MEDIUM-HIGH** (Maintained until post-deployment validation)

**Primary Risks:**
1. **API Rate Limiting Complexity** - Multiple providers with different limits and behaviors
2. **Worker Coordination at Scale** - Heartbeat failures and job timeouts with 1000+ uploads
3. **Backpressure Management** - Proper queue depth control under API rate limits
4. **Schema Migration Complexity** - Converting existing TEXT to JSONB without data loss
5. **Service Coordination** - Network failures between Render and Supabase with API dependencies

**Mitigation Strategies:**
1. **Comprehensive Rate Limiting** - Vendor-agnostic framework with backpressure and monitoring
2. **Robust Worker Health** - Heartbeat monitoring with automatic job reclaiming
3. **Gradual Rollout** - Start with low API limits, scale up with monitoring
4. **Schema Safety** - Non-destructive migrations with fallback support
5. **Multi-Layer Monitoring** - API limits, worker health, job completion, and error rates

### **Success Criteria**

**Week 4 Completion:**
- [ ] V3 database enhanced with idempotency_key, JSONB processing_error, heartbeat fields
- [ ] API rate limiting table deployed with provider configurations
- [ ] Render.com worker deployed with rate limiting and heartbeat capabilities
- [ ] End-to-end flow validated: upload → rate check → process → complete

**Week 5 Completion:**
- [ ] OCR/AI processing with API rate limiting operational
- [ ] Heartbeat monitoring and timeout recovery validated
- [ ] 100+ concurrent upload testing with rate limiting passed
- [ ] Backpressure and dead letter queue systems operational

**Week 6 Completion:**
- [ ] 1000+ concurrent upload stress testing with API coordination passed
- [ ] All legacy Edge Functions removed
- [ ] Rate limiting SLOs met: <1% API violations, >99% job completion
- [ ] Production deployment with comprehensive monitoring

**Week 7 Completion:**
- [ ] Zero regression in functionality with enhanced reliability
- [ ] All compliance and security validations passed
- [ ] Rate limiting effectiveness validated under peak load
- [ ] Operational runbooks complete for hybrid architecture

---

## Next Steps & Deliverables

### **Immediate Actions Required (Schema Verified):**
1. **Execute V3 Schema Enhancements** - Add idempotency_key, convert processing_error to JSONB, add heartbeat fields
2. **Deploy API Rate Limiting Framework** - Create api_rate_limits table with provider configurations  
3. **Setup Render.com Account** - Configure worker service with rate limiting capabilities
4. **Enhanced RPCs Deployment** - Deploy production-ready job coordination functions
5. **V3 Edge Functions Development** - Build for existing verified schema with clean slate approach

### **Deliverables for Implementation:**
- ✅ **Enhanced V3 schema** with idempotency, JSONB errors, and heartbeat monitoring
- ✅ **API Rate Limiting Framework** with vendor-agnostic capacity management
- ✅ **Render.com worker services** with rate limiting and heartbeat health monitoring
- ✅ **V3 Edge Functions** built for existing schema with clean slate design
- ✅ **Monitoring & SLO framework** including API rate limiting metrics

### **Deployment Readiness Checklist:**
- [ ] V3 database schema enhancements completed and tested
- [ ] API rate limiting framework deployed with all major providers configured
- [ ] Render.com infrastructure provisioned with rate limiting integration
- [ ] Worker services deployed with heartbeat health monitoring
- [ ] End-to-end processing validated under API rate limits
- [ ] 1000+ concurrent upload load testing passed
- [ ] RLS policies validated using existing V3 access functions
- [ ] Rollback procedures documented and tested
- [ ] Team trained on hybrid architecture with API rate limiting

---

## Render.com + Supabase Cooperative Architecture Summary

**Supabase (System of Record + Rate Limiting Coordinator):**
- Enhanced V3 database schema with idempotency and structured error logging
- API rate limiting coordination with capacity management and backpressure
- Job queue with heartbeat monitoring and dead letter queue management
- Authentication, authorization using existing `has_profile_access()` functions
- Clinical data persistence with audit trail

**Render.com (Processing Engine with Rate Limiting):**
- Long-running OCR/AI workers with API capacity coordination
- Horizontal scaling for 1000+ concurrent uploads with rate limiting
- Heartbeat health monitoring with automatic job reclaiming
- Exponential backoff retry with API rate limit awareness
- OS dependencies and process isolation

**Enhanced Cooperative Data Flow:**
1. **Upload** → Supabase Storage + shell_files record with idempotency_key
2. **Enqueue** → job_queue via enhanced enqueue_job_v3 with backpressure awareness
3. **Claim** → Render worker claims job + starts heartbeat
4. **Rate Check** → acquire_api_capacity() before API calls
5. **Process** → Download, OCR/AI with rate limiting, structured error logging
6. **Persist** → Write results, release API capacity, complete job with heartbeat cleanup

This architecture provides enterprise-grade scalability with comprehensive API rate limiting while maintaining healthcare data security and compliance through Supabase's robust database and auth systems.

---

**Status:** ✅ **V3 Consensus Plan Complete - All Critical Issues Addressed**  
**Risk Level:** 🟡 **MEDIUM-HIGH** (Maintained until post-deployment validation)  
**Timeline:** 4-5 weeks with Render.com + Supabase hybrid architecture + API rate limiting  
**Scalability:** Designed for 1000+ concurrent users with comprehensive rate limiting

**Next:** Execute V3 schema enhancements and begin Render.com setup with API rate limiting