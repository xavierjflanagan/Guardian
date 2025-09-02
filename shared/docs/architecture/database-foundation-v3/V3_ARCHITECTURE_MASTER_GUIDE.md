# Exora V3 Architecture Master Guide

**Purpose:** Single source of truth for complete V3 system architecture  
**Target Audience:** AI assistants, future engineers, technical onboarding  
**Status:** Pre-launch development framework  
**Last Updated:** August 31, 2025

---

## Executive Summary

This guide establishes the **definitive architecture documentation strategy** for Exora's V3 healthcare platform. It defines where all code lives, how components integrate, and provides AI assistants with clear guidance on understanding and modifying the system.

**Core Principle:** **Single Source of Truth** - All current architecture is documented in `docs/current_*` folders, with deployment artifacts maintained separately.

---

## Complete System Architecture

### **System Components Overview**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Frontend  │    │  Edge Functions │    │ Render Workers  │
│  (Next.js App)  │───▶│   (Supabase)    │───▶│   (Background   │
│                 │    │                 │    │   Processing)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         └───────────────────────▼───────────────────────┘
                    ┌─────────────────────────┐
                    │  Supabase Database      │
                    │  (PostgreSQL + RLS)     │
                    │                         │
                    └─────────────────────────┘
```

### **Data Flow Architecture**
```
1. User uploads document → Web Frontend
2. Frontend calls → shell-file-processor-v3 (Edge Function)
3. Edge Function creates shell_file record → Database
4. Edge Function enqueues job → Database (job_queue table)
5. Render Worker claims job → Database (claim_next_job_v3 RPC)
6. Worker processes document → OpenAI/Google Vision APIs
7. Worker updates results → Database (complete_job RPC)
8. Frontend displays processed data → Database queries
```

---

## Documentation Structure (Single Source of Truth)

### **Master Documentation Layout**
```
shared/docs/architecture/database-foundation-v3/
├── V3_ARCHITECTURE_MASTER_GUIDE.md    # This file - complete overview
├── current_schema/                     # 📁 DATABASE SOURCE OF TRUTH
│   ├── 01_foundations.sql             # Extensions, auth, audit logging
│   ├── 02_profiles.sql                # User profiles, access control
│   ├── 03_clinical_core.sql           # Shell files, clinical data, medical coding
│   ├── 04_ai_processing.sql           # AI pipeline, semantic processing
│   ├── 05_healthcare_journey.sql      # Provider relationships, care coordination
│   ├── 06_security.sql                # RLS policies, consent management
│   ├── 07_optimization.sql            # Performance indexes, monitoring
│   └── 08_job_coordination.sql        # V3 job queue, worker coordination
├── current_functions/                  # 📁 EDGE FUNCTIONS SOURCE OF TRUTH
│   ├── shell-file-processor-v3/       # Document upload processing
│   │   ├── index.ts                   # Main function logic
│   │   ├── deno.json                  # Deno runtime configuration
│   │   ├── import_map.json            # Dependencies
│   │   └── README.md                  # Function documentation
│   ├── audit-logger-v3/              # Audit event correlation
│   │   ├── index.ts                   # Audit logging logic
│   │   ├── deno.json                  # Runtime configuration
│   │   └── README.md                  # Audit documentation
│   └── _shared/                       # Shared utilities
│       ├── cors.ts                    # CORS handling
│       ├── types.ts                   # TypeScript definitions
│       ├── supabase-client.ts         # Database client setup
│       └── error-handling.ts          # Standardized error responses
├── current_workers/                    # 📁 RENDER WORKERS SOURCE OF TRUTH
│   └── exora-v3-worker/              # Background job processing
│       ├── src/
│       │   ├── worker.ts              # Main worker orchestration
│       │   ├── job-processors/        # Job type handlers
│       │   │   ├── shell-file-processor.ts
│       │   │   ├── ai-document-processor.ts
│       │   │   └── audit-processor.ts
│       │   ├── api-clients/           # External API integrations
│       │   │   ├── openai-client.ts   # GPT-4o Mini integration
│       │   │   ├── google-vision-client.ts
│       │   │   └── rate-limiter.ts    # API quota management
│       │   ├── database/              # Database interaction layer
│       │   │   ├── job-coordinator.ts # V3 RPC function calls
│       │   │   ├── shell-file-manager.ts
│       │   │   └── audit-logger.ts
│       │   └── utils/                 # Shared utilities
│       │       ├── logger.ts          # Structured logging
│       │       ├── health-monitor.ts  # Health check endpoint
│       │       └── error-handler.ts   # Error processing
│       ├── package.json               # Node.js dependencies
│       ├── tsconfig.json              # TypeScript configuration
│       ├── Dockerfile                 # Render.com deployment
│       ├── .env.example               # Environment variables template
│       └── README.md                  # Worker documentation
├── deployment/                        # 📁 DEPLOYMENT TRACKING
│   ├── deployed_status.md             # What's currently deployed where
│   ├── pending_changes.md             # Changes ready for deployment
│   ├── deployment_log.md              # Historical deployment record
│   └── rollback_procedures.md         # Emergency rollback steps
└── migration_history/                 # 📁 SCHEMA EVOLUTION HISTORY
    ├── v1.0_initial_schema.sql        # Historical snapshots
    ├── v1.1_added_retry_config.sql    # Schema evolution record
    └── changelog.md                   # Summary of all changes
```

---

## Deployment Artifacts (NOT Source of Truth)

### **Supabase Deployment Structure**
```
supabase/
├── functions/                          # DEPLOYED ARTIFACTS (may be outdated)
│   ├── shell-file-processor-v3/        # Deployed Edge Function
│   ├── audit-logger-v3/               # Deployed Edge Function
│   └── _shared/                       # Deployed shared utilities
├── migrations/                         # APPLIED MIGRATIONS (historical record)
│   ├── 20250831120000_initial_job_coordination.sql
│   ├── 20250901143000_add_retry_config.sql
│   ├── 20250905091500_update_rate_limits.sql
│   └── ...                           # Additional ALTER statements
├── config.toml                        # Supabase project configuration
└── README.md                          # Points to docs/current_* folders
```

### **Application Deployment Structure**  
```
apps/
└── render-worker/                      # DEPLOYED ARTIFACTS (may be outdated)
    ├── src/                           # Deployed worker code
    ├── package.json                   # Deployed dependencies
    ├── Dockerfile                     # Deployed container config
    └── README.md                      # Points to docs/current_workers/
```

### **Critical: Source vs Deployment Relationship**

| Location | Purpose | Status | AI Should Read |
|----------|---------|--------|----------------|
| `docs/current_schema/` | **SOURCE** Complete database schema | Always current | ✅ **YES** |
| `supabase/migrations/` | **ARTIFACT** Applied deployment history | Historical record | ❌ **NO** |
| `docs/current_functions/` | **SOURCE** Complete Edge Function code | Always current | ✅ **YES** |
| `supabase/functions/` | **ARTIFACT** Deployed function code | May be outdated | ❌ **NO** |
| `docs/current_workers/` | **SOURCE** Complete worker implementation | Always current | ✅ **YES** |
| `apps/render-worker/` | **ARTIFACT** Deployed worker code | May be outdated | ❌ **NO** |

---

## Database Architecture (V3 Schema)

### **Schema Documentation Approach**

Each SQL file contains **enhanced header comments** that provide complete context without separate README files:

```sql
-- =============================================================================
-- [FILE_NAME].SQL - [PURPOSE_TITLE]
-- =============================================================================
-- Purpose: [One-line purpose]
-- Architecture: [Key architectural pattern]
-- Dependencies: [What this file requires]
-- 
-- DESIGN DECISIONS:
-- - [Key decision 1]: [Why this choice]
-- - [Key decision 2]: [Why this choice]
-- 
-- TABLES CREATED ([number] tables):
-- [Category 1]: [table1], [table2], [table3]
-- [Category 2]: [table4], [table5]
-- 
-- KEY FUNCTIONS: [function1()], [function2()]
-- INTEGRATION POINTS: [How components use this]
-- =============================================================================
```

**Benefits:** Context at source, no maintenance overhead, AI-friendly, version control integrated.

### **Core Database Components**

#### **1. Foundation Layer (01-02)**
```sql
-- 01_foundations.sql: System Infrastructure
- PostgreSQL extensions (uuid-ossp, etc.)
- Audit logging framework (audit_log table)
- System configuration management
- Base security infrastructure

-- 02_profiles.sql: User & Profile Management  
- user_profiles table (patient/profile data subjects)
- profile_access_permissions (granular access control)
- user_profile_context (profile switching)
- RLS helper functions: has_profile_access()
```

#### **2. Clinical Data Layer (03-05)**
```sql
-- 03_clinical_core.sql: V3 Semantic Architecture
- shell_files table (physical document containers)
- clinical_narratives table (AI-generated medical storylines)
- patient_clinical_events (central clinical event hub)
- Medical coding reference tables (ICD-10, SNOMED-CT)
- Medication reference database (RxNorm, PBS codes)

-- 04_ai_processing.sql: AI Pipeline Infrastructure
- entity_processing_audit_v2 (AI processing audit trail)
- semantic_processing_sessions (Pass 3 narrative creation)
- dual_lens_user_preferences (document vs narrative views)
- AI confidence scoring and validation framework

-- 05_healthcare_journey.sql: Provider Integration
- provider_registry (healthcare provider directory)
- patient_provider_access (provider permissions)
- provider_clinical_notes (clinical assessments)
- healthcare_encounters (visit context)
```

#### **3. Infrastructure Layer (06-08)**
```sql
-- 06_security.sql: Security & Compliance
- RLS policies for all clinical tables
- patient_consents (GDPR-compliant consent management)
- Enhanced security functions: has_semantic_data_access()
- Healthcare data protection policies

-- 07_optimization.sql: Performance & Monitoring
- job_queue table (background job management)
- Performance indexes for all V3 tables
- Database health monitoring functions
- User event tracking (user_events table)

-- 08_job_coordination.sql: V3 Worker Integration
- Enhanced job coordination RPCs (enqueue_job_v3, claim_next_job_v3)
- API rate limiting system (api_rate_limits table)
- Worker heartbeat monitoring and dead letter queues
- User analytics framework (usage tracking, billing foundation)
```

### **Key Database Functions (RPC Interface)**

#### **Job Coordination Functions**
```typescript
// Edge Functions → Database
await supabase.rpc('enqueue_job_v3', {
  job_type: 'shell_file_processing',
  job_name: 'Process medical document',
  job_payload: { shell_file_id, patient_id, file_path },
  priority: 5
});

// Workers → Database
await supabase.rpc('claim_next_job_v3', {
  worker_id: 'exora-v3-worker-12345',
  job_types: ['shell_file_processing', 'ai_processing']
});

await supabase.rpc('update_job_heartbeat', {
  p_job_id: jobId,
  p_worker_id: workerId
});

await supabase.rpc('complete_job', {
  p_job_id: jobId,
  p_worker_id: workerId,
  p_job_result: processingResults
});
```

#### **API Rate Limiting Functions**
```typescript
// Workers → Rate Limiting
await supabase.rpc('acquire_api_capacity', {
  p_provider_name: 'openai',
  p_api_endpoint: 'gpt-4o-mini',
  p_estimated_tokens: 2000
});

await supabase.rpc('release_api_capacity', {
  p_provider_name: 'openai',
  p_api_endpoint: 'gpt-4o-mini',
  p_estimated_tokens: 2000,
  p_actual_tokens: 1847
});
```

#### **Analytics Functions**
```typescript
// Edge Functions → Usage Tracking
await supabase.rpc('track_shell_file_upload_usage', {
  p_profile_id: profileId,
  p_shell_file_id: shellFileId,
  p_file_size_bytes: fileSize,
  p_estimated_pages: estimatedPages
});
```

---

## Edge Functions Architecture

### **Function Overview**
```
Edge Functions (Supabase Deno Runtime)
├── shell-file-processor-v3     # Document upload & job enqueuing
├── audit-logger-v3            # Correlation logging & audit events
└── _shared                    # Common utilities & types
```

### **shell-file-processor-v3 Responsibilities**
```typescript
// Core functionality:
1. Validate uploaded document metadata
2. Create/update shell_files table record
3. Implement idempotency via idempotency_key
4. Enqueue V3 job via enqueue_job_v3() RPC
5. Track usage analytics via track_shell_file_upload_usage() RPC
6. Handle CORS and security validation

// Key integration points:
- Uses shell_files table (NOT legacy documents table)
- References patient_id → user_profiles(id) correctly
- Integrates with V3 job coordination system
- Includes analytics for early adopter insights
```

### **audit-logger-v3 Responsibilities**
```typescript
// Core functionality:
1. Correlation ID tracking for all operations
2. Job ID correlation in audit events
3. Profile-aware audit logging
4. Healthcare compliance audit trail

// Key integration points:
- Calls log_audit_event with proper patient_id correlation
- Includes job_id in all audit events for tracing
- Supports cross-service correlation tracking
```

### **Edge Function Integration Pattern**
```typescript
// Edge Function → Database → Worker flow:
1. Edge Function processes request
2. Edge Function calls database RPC functions
3. Database enqueues job for worker processing
4. Worker claims job and processes asynchronously
5. Worker updates job status via RPC functions
6. Frontend polls or gets notified of completion
```

---

## Render.com Worker Architecture

### **Worker Service Overview**
```
exora-v3-worker (Render.com Service)
├── Service Name: exora-v3-worker
├── Branch: staging (development) | main (production)
├── Root Directory: apps/render-worker
├── Environment: NODE_ENV=production, APP_ENV=staging
└── Public URL: https://exora-health.onrender.com (health checks)
```

### **Worker Responsibilities**
```typescript
// Core job processing:
1. Claim jobs from database via claim_next_job_v3() RPC
2. Process shell files with AI services (OpenAI, Google Vision)
3. Manage API rate limiting via acquire/release_api_capacity RPCs
4. Update heartbeat via update_job_heartbeat() RPC
5. Complete jobs via complete_job() RPC with results
6. Handle errors with retry logic and dead letter queue

// Key integrations:
- Supabase database (service role key access)
- OpenAI GPT-4o Mini API (document analysis)
- Google Cloud Vision API (OCR processing)
- Internal health check endpoint for monitoring
```

### **Worker Environment Configuration**
```bash
# Core Infrastructure
SUPABASE_URL=<project_url>
SUPABASE_SERVICE_ROLE_KEY=<service_key>  # CRITICAL: Service role only
OPENAI_API_KEY=<openai_key>
GOOGLE_CLOUD_API_KEY=<google_key>

# Worker Configuration
NODE_ENV=production                      # Always production (even staging)
APP_ENV=staging                         # Environment identification
WORKER_CONCURRENCY=50
WORKER_ID=render-${RENDER_SERVICE_ID}

# Enhanced Debugging (Staging)
LOG_LEVEL=debug                         # Verbose logging
DEBUG=*                                 # Library debug output
NODE_DEBUG=*                           # Node.js internal debugging
VERBOSE=true                           # Application verbosity
DEBUG_QUERIES=true                     # Database query logging

# Service Configuration
RENDER_SERVICE_NAME=exora-v3-worker
HEALTH_CHECK_PORT=10000
```

### **Worker Processing Flow**
```typescript
// Complete job processing cycle:
1. Worker starts → Connects to Supabase with service role
2. Claim job → claim_next_job_v3(worker_id, job_types)
3. Start heartbeat → update_job_heartbeat() every 30 seconds
4. Check API capacity → acquire_api_capacity(provider, endpoint, tokens)
5. Process document → Call OpenAI/Google Vision APIs
6. Store results → Update shell_files and clinical tables
7. Complete job → complete_job(job_id, worker_id, results)
8. Release API capacity → release_api_capacity(actual_token_usage)
9. Track analytics → track_ai_processing_usage() for metrics
10. Repeat → Claim next job in queue
```

---

## Development Workflow

### **Pre-Launch Development Process**

#### **Phase 1: Database Schema Changes**
```bash
# 1. Update source files directly (pre-launch advantage)
vim shared/docs/architecture/database-foundation-v3/current_schema/08_job_coordination.sql

# 2. Save version to history
cp current_schema/08_job_coordination.sql migration_history/v1.1_$(date +%Y%m%d).sql

# 3. Deploy via clean rebuild (no production data to lose)
cp current_schema/*.sql supabase/migrations/
supabase db reset --linked && supabase db push

# 4. Update deployment status
echo "v1.1 deployed $(date)" >> deployment/deployed_status.md
```

#### **Phase 2: Edge Function Development**
```bash
# 1. Update source function
vim shared/docs/architecture/database-foundation-v3/current_functions/shell-file-processor-v3/index.ts

# 2. Copy to deployment location
cp -r current_functions/* supabase/functions/

# 3. Deploy to Supabase
supabase functions deploy shell-file-processor-v3

# 4. Test integration
curl -X POST https://your-project.supabase.co/functions/v1/shell-file-processor-v3
```

#### **Phase 3: Worker Development**
```bash
# 1. Update source worker code
vim shared/docs/architecture/database-foundation-v3/current_workers/exora-v3-worker/src/worker.ts

# 2. Copy to deployment location
cp -r current_workers/exora-v3-worker/* apps/render-worker/

# 3. Test locally with staging environment
cd apps/render-worker
APP_ENV=staging NODE_ENV=production pnpm start

# 4. Deploy to Render.com (auto-deploy on git push to staging branch)
git add . && git commit -m "Update worker logic" && git push origin staging
```

### **Post-Launch Migration Process**
```bash
# 1. Update source files (same as pre-launch)
vim current_schema/08_job_coordination.sql

# 2. Create ALTER migration (preserve production data)
cat > supabase/migrations/$(date +%Y%m%d%H%M%S)_add_new_feature.sql << EOF
-- Add new feature without breaking existing data
ALTER TABLE job_queue ADD COLUMN new_feature JSONB;
-- Update source reflects final state, migration shows the change
EOF

# 3. Deploy migration only (no reset)
supabase db push

# 4. Update deployment tracking
echo "Added new feature $(date)" >> deployment/deployment_log.md
```

---

## AI Assistant Guidelines

### **For Understanding Current Architecture**

#### **Database Questions:**
- ✅ **READ:** `current_schema/*.sql` files for complete database structure
- ✅ **REFERENCE:** All tables, functions, relationships in schema files
- ❌ **DON'T READ:** `supabase/migrations/` (historical deployment artifacts)

#### **Edge Function Questions:**
- ✅ **READ:** `current_functions/*/index.ts` for complete function logic
- ✅ **REFERENCE:** Function integration with database RPCs
- ❌ **DON'T READ:** `supabase/functions/` (deployed artifacts, may be outdated)

#### **Worker Questions:**
- ✅ **READ:** `current_workers/exora-v3-worker/src/` for complete worker logic
- ✅ **REFERENCE:** Worker job processing and API integration
- ❌ **DON'T READ:** `apps/render-worker/` (deployed artifacts, may be outdated)

### **For Making Changes**

#### **Change Process:**
1. **UPDATE SOURCE:** Modify files in `current_*` directories first
2. **DOCUMENT CHANGE:** Update `deployment/pending_changes.md`
3. **TEST LOCALLY:** Use source files for local development
4. **DEPLOY:** Copy to deployment locations and deploy
5. **TRACK STATUS:** Update `deployment/deployed_status.md`

#### **Integration Tracing:**
```typescript
// To understand data flow, trace these integration points:

// 1. Frontend → Edge Function
fetch('/functions/v1/shell-file-processor-v3', { ... })

// 2. Edge Function → Database
await supabase.rpc('enqueue_job_v3', { ... })

// 3. Worker → Database
await supabase.rpc('claim_next_job_v3', { ... })

// 4. Worker → External APIs
await openai.chat.completions.create({ ... })

// 5. Worker → Database (completion)
await supabase.rpc('complete_job', { ... })
```

### **Common AI Tasks**

#### **"How does document processing work?"**
1. Read `current_functions/shell-file-processor-v3/index.ts`
2. Read `current_workers/exora-v3-worker/src/job-processors/shell-file-processor.ts`
3. Read `current_schema/08_job_coordination.sql` for RPC functions
4. Trace the integration flow between components

#### **"What database functions are available?"**
1. Read all `current_schema/*.sql` files
2. Look for `CREATE FUNCTION` statements
3. Note RPC security (service_role vs authenticated access)
4. Check function parameters and return types

#### **"How do I add a new job type?"**
1. Update `current_schema/08_job_coordination.sql` (job_type constraints)
2. Update `current_functions/shell-file-processor-v3/index.ts` (enqueue logic)
3. Update `current_workers/exora-v3-worker/src/job-processors/` (add processor)
4. Follow deployment process to apply changes

---

## Deployment Tracking

### **Current Deployment Status**
```markdown
# Check deployment/deployed_status.md for:
- Database schema version deployed to Supabase
- Edge Functions deployed to Supabase Functions
- Worker version deployed to Render.com
- Environment variables configured in each service
- Last deployment date and who deployed
```

### **Pending Changes**
```markdown
# Check deployment/pending_changes.md for:
- Schema changes ready for deployment
- Function updates ready for deployment  
- Worker updates ready for deployment
- Breaking changes that require coordination
- Rollback procedures if deployment fails
```

---

## Security Considerations

### **Access Control Patterns**

#### **Database Access:**
```sql
-- Edge Functions: Use anon keys with RLS protection
-- Workers: Use service role keys for system operations
-- Frontend: Use anon keys with RLS protection

-- All clinical data protected by RLS policies:
SELECT * FROM shell_files WHERE patient_id IN (
  SELECT patient_id FROM user_profiles 
  WHERE has_profile_access(auth.uid(), id)
);
```

#### **API Key Management:**
```bash
# Environment Variable Security:
✅ Store all secrets in Render.com/Supabase environment variables
✅ Never commit API keys to repository
✅ Use separate keys for staging vs production
✅ Rotate keys regularly and update services

# Service Role Key Usage:
✅ Workers: Service role (bypass RLS for system operations)
✅ Edge Functions: Anon key (RLS protection for user operations)
✅ Frontend: Anon key (RLS protection for user operations)
```

### **Healthcare Data Protection**
```typescript
// All medical data processing follows these patterns:
1. User data isolated by RLS policies
2. Cross-profile data contamination prevented
3. All clinical operations logged with audit trails
4. Patient ID correlation maintained throughout processing
5. Data processed in memory only (never stored to disk)
6. API calls use official SDKs with proper authentication
```

---

## Monitoring & Health Checks

### **Worker Health Monitoring**
```bash
# Worker exposes health check at public URL:
GET https://exora-health.onrender.com/health

# Response includes:
{
  "status": "healthy",
  "worker_id": "exora-v3-worker-srv-xxx-timestamp",
  "active_jobs": 3,
  "last_heartbeat": "2025-08-31T10:30:00Z",
  "api_capacity": {
    "openai": "available",
    "google_vision": "rate_limited"
  },
  "environment": "staging",
  "version": "v1.2.0"
}
```

### **Database Monitoring**
```sql
-- Monitor job queue health:
SELECT status, COUNT(*) FROM job_queue GROUP BY status;

-- Monitor API rate limiting:
SELECT provider_name, current_requests_minute, requests_per_minute 
FROM api_rate_limits WHERE status = 'active';

-- Monitor worker heartbeats:
SELECT worker_id, MAX(heartbeat_at) as last_seen 
FROM job_queue WHERE status = 'processing' 
GROUP BY worker_id;
```

---

## Future Architecture Evolution

### **Post-Launch Migration Strategy**
When moving from pre-launch to production:

1. **Database:** Switch from direct file updates to ALTER-based migrations
2. **Functions:** Maintain source files, use proper CI/CD for deployment
3. **Workers:** Implement blue-green deployment for zero-downtime updates
4. **Monitoring:** Add comprehensive logging and alerting
5. **Documentation:** Maintain single source of truth approach

### **Scalability Considerations**
- **Database:** Ready for horizontal scaling with proper indexes
- **Workers:** Render.com auto-scaling with API rate limiting coordination
- **Functions:** Supabase Edge Functions scale automatically
- **Rate Limiting:** Vendor-agnostic system supports multiple API providers

---

## Related Documentation

- **V3 Implementation Plan:** [v3-phase2-implementation-plan-v5.md](v3-phase2-implementation-plan-v5.md)
- **Render.com Deployment:** [render-com-deployment-guide.md](render-com-deployment-guide.md)
- **V3 Fresh Start Blueprint:** [V3_FRESH_START_BLUEPRINT.md](V3_FRESH_START_BLUEPRINT.md)
- **Database Schema Files:** [current_schema/](current_schema/)

---

**Status:** ✅ **Architecture Foundation Complete**  
**Next Phase:** Begin V3 database deployment → Edge Function development → Worker implementation  
**Maintained by:** Exora Development Team  
**AI Context Ready:** This guide provides complete system understanding for AI assistance

---

*This document serves as the definitive architecture reference for Exora's V3 healthcare platform. All current system understanding should derive from the `docs/current_*` folders referenced in this guide.*