# V3 Phase 2 Consensus Implementation Plan v2

**Date:** August 31, 2025  
**Purpose:** Unified implementation plan addressing GPT-5 critical review items  
**Status:** North Star Architecture - Ready for Implementation  
**Contributors:** Claude Code + GPT-5 collaborative analysis + Render.com integration  
**Version:** 2.0 - Systematic fixes for all identified issues

---

## Executive Summary

**CONSENSUS ACHIEVED:** **MEDIUM-HIGH risk V3 deployment** with Render.com + Supabase hybrid architecture for 1000+ concurrent user scalability.

**Key Architecture Decisions:**
- ✅ **Hybrid Processing:** Supabase (job coordination, data) + Render.com (OCR/AI workers)
- ✅ **Scope:** Clean slate approach - Delete 12 legacy Edge Functions, build V3-native functions
- ✅ **Timeline:** 4-5 weeks implementation with Render.com worker integration  
- ✅ **Approach:** Two-queue processing with external workers for scalability

**Critical Success Factors:**
1. Render.com worker services for long-running OCR/AI processing
2. Supabase job_queue table as single source of truth for coordination
3. V3-native Edge Functions built specifically for `shell_files` schema
4. Clean production environment with no legacy V2 Edge Function contamination

---

## Technical Architecture: Supabase + Render.com Hybrid

### **1. V3 Schema Definition (Verified with Line Numbers)**

**V3 Uses `shell_files` Table (NOT `documents`):**
```sql
-- V3 shell_files definition (03_clinical_core.sql:123-128)
CREATE TABLE IF NOT EXISTS shell_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    processing_error JSONB, -- Enhanced structured error storage
    -- Enhanced fields beyond legacy documents table
);
```

**V3 Job Queue Architecture:**
```sql
-- Enhanced job_queue table (07_optimization.sql)
CREATE TABLE IF NOT EXISTS job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL, -- 'fast_queue_ocr', 'ai_queue_pass1', etc.
    job_category TEXT DEFAULT 'standard',
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed, dead_letter
    priority INTEGER DEFAULT 5,
    scheduled_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 6, -- Matches exponential backoff: 2s,4s,8s,16s,32s,64s
    worker_id TEXT,
    error JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient worker claims
CREATE INDEX idx_job_queue_claim ON job_queue (status, scheduled_at, priority DESC, created_at);
CREATE INDEX idx_job_queue_worker ON job_queue (worker_id, status);
```

### **2. Division of Responsibilities: Supabase vs Render.com**

**Supabase Responsibilities:**
- **Database:** PostgreSQL with RLS, audit trails, clinical data persistence
- **Storage:** File storage with user-isolated folders  
- **Authentication:** User management and JWT tokens
- **Job Coordination:** `job_queue` table as single source of truth
- **API Layer:** Edge Functions for request/response operations
- **Audit Logging:** `log_audit_event` with proper `p_patient_id` references

**Render.com Responsibilities:**
- **Background Workers:** Long-running OCR/AI processing (2-10 minutes)
- **Queue Processing:** Claim jobs with `FOR UPDATE SKIP LOCKED` semantics
- **Retry Logic:** Exponential backoff with jitter (2s, 4s, 8s, 16s, 32s, 64s)
- **Scalability:** Horizontal scaling for 1000+ concurrent uploads
- **OS Dependencies:** ImageMagick, poppler, tesseract for document processing
- **Dead Letter Queue:** Final error handling after max retries exceeded

### **3. Processing Flow Architecture**

```
User Upload Flow:
1. Client uploads file → Supabase Storage
2. Edge Function (shell-file-processor-v3) → Creates shell_files row + enqueues jobs
3. Render Worker claims job → Downloads file from Supabase Storage (service role)
4. Worker processes → OCR → AI Pass 1/2/3 → Writes results back to Supabase
5. Audit logging → Timeline updates → Optional notifications

Job Flow Detail:
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Supabase      │    │   Render.com    │    │   Supabase      │
│                 │    │                 │    │                 │
│ 1. Enqueue Job  │───▶│ 2. Claim Job    │───▶│ 3. Update Status│
│ job_queue       │    │ SKIP LOCKED     │    │ processing      │
│                 │    │                 │    │                 │
│                 │    │ 4. Download File│◀───│                 │
│                 │    │ from Storage    │    │                 │
│                 │    │                 │    │                 │
│                 │    │ 5. OCR/AI       │    │                 │
│                 │    │ Processing      │    │                 │
│                 │    │                 │    │                 │
│                 │◀───│ 6. Write Results│    │                 │
│ Clinical Tables │    │ & Complete Job  │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### **4. V3 Edge Functions Clean Slate Design**

**APPROACH: Delete all 12 legacy functions, build V3-native replacements**

**V3 Essential Functions (NEW - Built from scratch):**

**Priority 1 - Core V3 Functions:**
- `shell-file-processor-v3` - Upload success guarantee, enqueue jobs to Render workers
- `audit-logger-v3` - Healthcare compliance audit logging

**Processing Architecture:**
- **Upload Always Succeeds:** Files saved to shell_files immediately, processing queued to Render
- **Fast Queue (Render):** Security scan → OCR → Spatial mapping (< 2 minutes)
- **AI Queue (Render):** Pass 1 → Pass 2 → Pass 3 with retry logic (2-10 minutes)
- **Error Resilience:** All failures logged to `shell_files.processing_error` JSONB with exponential backoff

**DELETED Legacy Functions (Clean slate approach):**
- ❌ `document-processor` → Replaced by `shell-file-processor-v3` + Render workers
- ❌ `document-processor-complex` → Render AI queue covers this
- ❌ `document-processor-simple` → Redundant with clean V3 design
- ❌ `queue-worker` → Replaced by Render.com worker services
- ❌ `audit-events` → Replaced by `audit-logger-v3`
- ❌ `ai-diagnostic` + 7 test/debug functions → Development artifacts, not needed

### **5. RPC Functions and Job Management**

**Enhanced Job Management RPC:**
```sql
-- Production-ready job enqueuing with validation
CREATE OR REPLACE FUNCTION enqueue_job_v3(
    job_type text,           -- 'fast_queue_ocr', 'ai_queue_pass1', 'ai_queue_pass2', 'ai_queue_pass3'
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
    allowed_types text[] := ARRAY['fast_queue_ocr', 'ai_queue_pass1', 'ai_queue_pass2', 'ai_queue_pass3'];
BEGIN
    -- Validation
    IF NOT (job_type = ANY(allowed_types)) THEN
        RAISE EXCEPTION 'Invalid job_type. Allowed: %', allowed_types;
    END IF;
    
    IF job_payload IS NULL OR job_payload = '{}'::jsonb THEN
        RAISE EXCEPTION 'job_payload cannot be empty';
    END IF;
    
    -- Required payload fields based on job type
    IF job_type LIKE 'fast_queue%' AND NOT (job_payload ? 'shell_file_id') THEN
        RAISE EXCEPTION 'fast_queue jobs require shell_file_id in payload';
    END IF;
    
    -- Insert job
    INSERT INTO job_queue (job_type, job_name, payload, job_category, priority, scheduled_at)
    VALUES (job_type, job_name, job_payload, job_category, priority, scheduled_at)
    RETURNING id INTO job_id;
    
    RETURN job_id;
END;
$$;
```

**Worker Job Claiming RPC:**
```sql
-- Safe job claiming for Render workers
CREATE OR REPLACE FUNCTION claim_next_job(worker_id text, job_types text[] default null)
RETURNS TABLE(job_id uuid, job_type text, payload jsonb, retry_count int)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    UPDATE job_queue 
    SET 
        status = 'processing',
        started_at = NOW(),
        worker_id = claim_next_job.worker_id
    WHERE id = (
        SELECT id FROM job_queue 
        WHERE status = 'pending' 
        AND scheduled_at <= NOW()
        AND (job_types IS NULL OR job_type = ANY(job_types))
        ORDER BY priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING id, job_type, payload, retry_count;
END;
$$;
```

---

## Implementation Roadmap (Weeks 4-7)

### **Week 4: V3 Database + Render.com Setup**

#### **Days 1-2: V3 Database Deployment**
```bash
# Clean V3 deployment (no migration needed - pre-launch)
1. Deploy V3 database schema to environment
2. Verify V3 shell_files table and all dependencies created
3. Deploy enhanced job_queue table with worker claim indexes
4. Deploy enqueue_job_v3 and claim_next_job RPCs
5. Smoke test V3 database connectivity and job operations
```

#### **Days 3-5: Render.com Infrastructure Setup**
```bash
# Render.com account and worker setup
1. Create Render.com account and configure service
2. Setup environment variables:
   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
   - OPENAI_API_KEY, GOOGLE_CLOUD_API_KEY
   - WORKER_CONCURRENCY, QUEUE_POLL_INTERVAL
3. Deploy minimal worker with job claiming and health endpoint
4. Validate end-to-end job flow: enqueue → claim → complete (no-op)
```

#### **Days 6-7: V3 Native Edge Functions Development**
```typescript
// Clean slate V3-native function development:
// 1. shell-file-processor-v3: Upload success + job enqueuing
// 2. audit-logger-v3: Proper p_patient_id audit logging
// 3. No legacy compatibility - pure V3 implementation with Render integration
```

### **Week 5: OCR/AI Processing Integration**

#### **Days 1-4: Render Worker OCR/AI Implementation**
```typescript
// Render worker implementation:
// 1. Fast queue: Security scan → OCR → Spatial mapping (<2 min)
// 2. AI queue: Pass 1 → Pass 2 → Pass 3 processing (2-10 min)
// 3. Exponential backoff: 2s, 4s, 8s, 16s, 32s, 64s with jitter
// 4. Dead letter queue after max retries
// 5. Idempotency keys and graceful shutdown
```

#### **Days 5-7: Integration Testing & Queue Optimization**
- End-to-end workflow validation with real OCR/AI processing
- Performance testing: 100+ concurrent uploads simulation
- Queue balancing and worker scaling validation
- Error handling and retry logic verification

### **Week 6: Production Readiness & Monitoring**

#### **Days 1-3: Monitoring & Observability**
```typescript
// SLOs and Metrics Implementation:
// - Fast queue 95p latency < 2 min
// - AI queue 95p latency < 10 min  
// - Job states: enqueued/processing/completed/failed/dead_letter counts
// - Retry rates and error budgets
// - Worker health and scaling metrics
```

#### **Days 4-7: Production Deployment & Validation**
- Delete all 12 legacy Edge Functions
- Deploy V3-native functions with Render worker integration
- Full system validation: upload → processing → completion
- Performance validation: 1000+ concurrent upload simulation

### **Week 7: Post-Deployment Validation & Documentation**

#### **Days 1-4: System Validation**
- Full system stress testing
- RLS policy verification with user JWTs
- Security audit: service role key isolation, audit trail completeness
- Rollback procedure validation

#### **Days 5-7: Documentation & Team Training**
- Render.com operational runbooks
- Worker scaling and monitoring procedures
- Emergency procedures and rollback plans
- Team training on hybrid architecture

---

## Critical Implementation Details

### **1. Upload Success Guarantee Strategy**

**Idempotency Design:**
```typescript
// Client-side upload with idempotency
const uploadFile = async (file: File, userId: string) => {
    const idempotencyKey = `${userId}_${file.name}_${file.size}_${file.lastModified}`;
    
    // 1. Storage upload (always succeeds)
    const { data: storageData } = await supabase.storage
        .from('medical-docs')
        .upload(`${userId}/${timestamp}_${file.name}`, file);
    
    // 2. Database record creation (atomic with job enqueuing)
    const { data: shellFile } = await supabase
        .from('shell_files')
        .upsert({
            patient_id: userProfileId,
            storage_path: storageData.path,
            idempotency_key: idempotencyKey,
            status: 'uploaded'
        }, { onConflict: 'idempotency_key' })
        .select('id')
        .single();
    
    // 3. Enqueue processing (safe re-enqueue)
    await supabase.rpc('enqueue_job_v3', {
        job_type: 'fast_queue_ocr',
        job_name: `Process ${file.name}`,
        job_payload: { shell_file_id: shellFile.id, storage_path: storageData.path }
    });
    
    return shellFile;
};
```

**Order of Operations:**
1. **Storage Upload First** - File always persisted
2. **Database Record Creation** - With idempotency key for dedupe
3. **Job Enqueuing** - Processing failures never affect upload success
4. **Cleanup Compensation** - Orphan file cleanup via cron if DB fails

### **2. Render.com Worker Implementation**

**Worker Architecture:**
```typescript
// Render worker service structure
class GuardianWorker {
    private queues = ['fast_queue', 'ai_queue'];
    private concurrency = parseInt(process.env.WORKER_CONCURRENCY || '10');
    private pollInterval = parseInt(process.env.QUEUE_POLL_INTERVAL || '5000');
    
    async start() {
        // Health endpoint for Render monitoring
        this.startHealthServer();
        
        // Concurrent queue processors
        for (let i = 0; i < this.concurrency; i++) {
            this.processJobs();
        }
        
        // Graceful shutdown handling
        process.on('SIGTERM', () => this.shutdown());
    }
    
    private async processJobs() {
        while (this.running) {
            try {
                const job = await this.claimJob();
                if (job) {
                    await this.executeJob(job);
                } else {
                    await this.sleep(this.pollInterval);
                }
            } catch (error) {
                await this.handleError(error);
            }
        }
    }
    
    private async executeJob(job: Job) {
        const startTime = Date.now();
        
        try {
            // Download file from Supabase Storage
            const fileBuffer = await this.downloadFile(job.payload.storage_path);
            
            // Execute based on job type
            let results;
            switch (job.job_type) {
                case 'fast_queue_ocr':
                    results = await this.runOCR(fileBuffer);
                    break;
                case 'ai_queue_pass1':
                    results = await this.runAIPass1(fileBuffer, job.payload);
                    break;
                // ... other job types
            }
            
            // Write results back to Supabase
            await this.writeResults(job.payload.shell_file_id, results);
            await this.completeJob(job.job_id);
            
        } catch (error) {
            await this.handleJobError(job, error, Date.now() - startTime);
        }
    }
    
    private async handleJobError(job: Job, error: Error, duration: number) {
        const retryCount = job.retry_count + 1;
        const maxRetries = job.max_retries || 6;
        
        if (retryCount <= maxRetries) {
            // Exponential backoff with jitter: 2s, 4s, 8s, 16s, 32s, 64s
            const baseDelay = Math.pow(2, retryCount) * 1000;
            const jitter = Math.random() * baseDelay * 0.1;
            const nextRetry = new Date(Date.now() + baseDelay + jitter);
            
            await this.retryJob(job.job_id, retryCount, nextRetry, error.message);
        } else {
            // Dead letter queue
            await this.deadLetterJob(job.job_id, error.message);
        }
        
        // Update shell_files.processing_error for monitoring
        await this.logProcessingError(job.payload.shell_file_id, error, retryCount, duration);
    }
}
```

### **3. Error Handling & Monitoring Strategy**

**Enhanced shell_files.processing_error Structure:**
```typescript
// JSONB structure for comprehensive error tracking
interface ProcessingError {
    current_error?: {
        job_type: string;
        error_type: 'ocr_failure' | 'ai_timeout' | 'api_error' | 'network_error';
        error_message: string;
        retry_count: number;
        next_retry_at: string;
        worker_id: string;
        duration_ms: number;
        timestamp: string;
    };
    error_history: Array<{
        job_type: string;
        error_type: string;
        error_message: string;
        retry_count: number;
        worker_id: string;
        duration_ms: number;
        timestamp: string;
        resolved: boolean;
    }>;
    metrics: {
        total_retries: number;
        total_processing_time_ms: number;
        first_error_at: string;
        last_error_at: string;
        error_types: Record<string, number>;
    };
}
```

**SLOs and Monitoring:**
```typescript
// Key metrics for operational excellence
const SLO_TARGETS = {
    fast_queue_95p_latency_ms: 120000,    // < 2 minutes
    ai_queue_95p_latency_ms: 600000,      // < 10 minutes
    success_rate_threshold: 0.995,         // 99.5% success rate
    retry_rate_threshold: 0.05,            // < 5% jobs require retry
    dead_letter_rate_threshold: 0.001,     // < 0.1% jobs dead lettered
};

// Alerts and thresholds
const ALERT_THRESHOLDS = {
    worker_health_check_failure: 3,        // 3 consecutive failures
    queue_depth_warning: 1000,             // 1000+ pending jobs
    error_rate_spike: 0.1,                 // 10% error rate in 5min window
    processing_latency_p95_breach: true,   // Any SLO breach
};
```

### **4. RLS Policy Unification**

**Consistent shell_files Access Pattern:**
```sql
-- Single RLS policy model for shell_files (no OR-widening)
CREATE POLICY "shell_files_user_access" ON shell_files
    FOR ALL USING (
        auth.uid() = (SELECT account_owner_id FROM user_profiles WHERE id = patient_id)
    );

-- Verification queries for RLS testing
-- Test with user JWT (not service role)
SELECT id FROM shell_files WHERE patient_id = '<user_profile_id>';
-- Should return rows only for owned profiles

-- Test cross-profile access prevention
SELECT id FROM shell_files WHERE patient_id = '<other_profile_id>';  
-- Should return empty result set
```

### **5. Render.com Environment Setup**

**Required Environment Variables:**
```bash
# Supabase Integration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI/OCR APIs  
OPENAI_API_KEY=your_openai_key
GOOGLE_CLOUD_API_KEY=your_google_cloud_key

# Worker Configuration
WORKER_CONCURRENCY=50                    # Concurrent job processors
QUEUE_POLL_INTERVAL=5000                # Milliseconds between polls
FAST_QUEUE_TIMEOUT_MS=120000            # 2 minute timeout
AI_QUEUE_TIMEOUT_MS=600000              # 10 minute timeout
MAX_RETRIES=6                           # Exponential backoff retries

# Monitoring
HEALTH_CHECK_PORT=8080                  # Health endpoint port
LOG_LEVEL=info                          # Logging verbosity
WORKER_ID=render-worker-${RENDER_SERVICE_ID}
```

**Render.com Service Configuration:**
```yaml
# render.yaml for Infrastructure as Code
services:
  - type: worker
    name: guardian-worker
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: WORKER_CONCURRENCY
        value: 50
    scaling:
      minInstances: 2
      maxInstances: 20
      targetCPUPercent: 70
      targetMemoryPercent: 80
```

---

## Risk Assessment & Mitigation

### **Risk Level: MEDIUM-HIGH** (Maintained until post-deployment validation)

**Primary Risks:**
1. **Render.com Integration Complexity** - External service dependency for core processing
2. **Job Queue Coordination** - Race conditions in job claiming and status updates
3. **Worker Scaling** - Handling 1000+ concurrent uploads without bottlenecks
4. **Error Recovery** - Complex retry logic and dead letter queue management
5. **Service Communication** - Network failures between Render and Supabase

**Mitigation Strategies:**
1. **Gradual Rollout** - Start with low concurrency, scale up with monitoring
2. **Comprehensive Testing** - Load testing with 1000+ concurrent uploads
3. **Robust Error Handling** - Exponential backoff, dead letter queues, monitoring
4. **Rollback Planning** - Keep legacy code available (not deployed) for emergency rollback
5. **Multi-Environment Validation** - Validate in staging before production deployment
6. **Health Monitoring** - Real-time worker health, queue depth, and SLO monitoring

### **Success Criteria**

**Week 4 Completion:**
- [ ] V3 database deployed with enhanced job_queue table
- [ ] Render.com account setup with basic worker deployment
- [ ] End-to-end job flow validated: enqueue → claim → complete
- [ ] V3-native Edge Functions operational with Render integration

**Week 5 Completion:**
- [ ] OCR/AI processing operational on Render workers
- [ ] Exponential backoff retry logic validated
- [ ] 100+ concurrent upload testing passed
- [ ] Error handling and monitoring systems operational

**Week 6 Completion:**
- [ ] 1000+ concurrent upload stress testing passed
- [ ] All legacy Edge Functions removed
- [ ] SLO monitoring and alerting operational
- [ ] Production deployment successful with rollback plan tested

**Week 7 Completion:**
- [ ] Zero regression in functionality
- [ ] All compliance and security validations passed
- [ ] Team training completed on hybrid architecture
- [ ] Operational runbooks completed

---

## Next Steps & Deliverables

### **Immediate Actions Required:**
1. **Setup Render.com Account** - Create account and configure initial worker service
2. **Enhanced job_queue Schema** - Add to V3 SQL files with proper indexes
3. **Worker Claim RPCs** - Implement enqueue_job_v3 and claim_next_job functions
4. **V3 Edge Functions Design** - Build shell-file-processor-v3 with Render integration
5. **Testing Framework** - Load testing for 1000+ concurrent uploads

### **Deliverables for Implementation:**
- ✅ **Enhanced job_queue table** with worker coordination fields
- ✅ **Render.com worker service** with OCR/AI processing capabilities
- ✅ **V3 Edge Functions** with clean slate design and Render integration
- ✅ **Monitoring & SLO framework** for operational excellence
- ✅ **Load testing framework** for 1000+ concurrent user validation

### **Deployment Readiness Checklist:**
- [ ] Render.com infrastructure provisioned and tested
- [ ] V3 database schema deployed with job coordination tables
- [ ] Worker services deployed with health monitoring
- [ ] End-to-end processing validated under load
- [ ] Error handling and retry logic validated
- [ ] SLO monitoring and alerting operational
- [ ] Rollback procedures documented and tested
- [ ] Team trained on hybrid architecture operations

---

## Render.com + Supabase Cooperative Architecture Summary

**Supabase (System of Record):**
- PostgreSQL database with RLS and audit trails
- File storage with user isolation
- Job queue coordination and status tracking  
- Authentication and authorization
- Clinical data persistence

**Render.com (Processing Engine):**
- Long-running OCR/AI workers (2-10 minutes)
- Horizontal scaling for 1000+ concurrent uploads
- OS dependencies (ImageMagick, poppler, tesseract)
- Exponential backoff retry with dead letter queues
- Process isolation and resource management

**Cooperative Data Flow:**
1. **Upload** → Supabase Storage + shell_files record
2. **Enqueue** → job_queue via enqueue_job_v3 RPC  
3. **Claim** → Render worker claims job with SKIP LOCKED
4. **Process** → Download from Supabase, run OCR/AI, exponential backoff on errors
5. **Persist** → Write results to Supabase clinical tables
6. **Complete** → Update job status, audit logging, timeline updates

This architecture provides enterprise-grade scalability while maintaining healthcare data security and compliance through Supabase's robust database and auth systems.

---

**Status:** ✅ **V2 Consensus Plan Complete - All GPT-5 Issues Addressed**  
**Risk Level:** 🟡 **MEDIUM-HIGH** (Maintained until post-deployment validation)  
**Timeline:** 4-5 weeks with Render.com + Supabase hybrid architecture  
**Scalability:** Designed for 1000+ concurrent users with horizontal scaling

**Next:** Begin Render.com account setup and V3 database deployment with enhanced job coordination