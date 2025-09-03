# Render.com Deployment Guide for Exora V3 Worker

**Service:** exora-v3-worker  
**Purpose:** V3 background job processing with Supabase + Render.com hybrid architecture  
**Updated:** August 31, 2025  
**Environment:** Staging (staging branch) → Production (main branch)

---

## Service Configuration

### **Basic Setup**
```bash
Service Name: exora-v3-worker
Service Type: Web Service
Repository: Guardian-Cursor
Branch: staging (development/testing) | main (production)
Root Directory: apps/render-worker
Runtime: Node.js
```

### **Build & Start Commands**
```bash
# Build Command (auto-detected)
apps/render-worker/ $ pnpm install --frozen-lockfile; pnpm run build

# Start Command (auto-detected)  
apps/render-worker/ $ pnpm run start
```

---

## Environment Variables Configuration

### **Core Infrastructure**
```bash
# Supabase Backend
SUPABASE_URL=<your_supabase_project_url>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key_only>  # ⚠️ CRITICAL: Service role only, never anon key

# AI Processing Services
OPENAI_API_KEY=<your_openai_api_key>              # GPT-4o Mini for document analysis
GOOGLE_CLOUD_API_KEY=<your_google_cloud_api_key>  # Vision API for OCR processing
```

### **Worker Configuration**
```bash
# Core Environment (RESEARCH-VALIDATED CONFIGURATION)
NODE_ENV=production              # ✅ ALWAYS production (even for staging)
APP_ENV=staging                  # ✅ Environment identification (staging/production)
WORKER_CONCURRENCY=50            # Number of concurrent job processors
WORKER_ID=render-${RENDER_SERVICE_ID}  # Unique worker identification
```

### **Enhanced Debugging (Staging Best Practice)**
```bash
# Logging & Debugging (2025 Best Practices)
LOG_LEVEL=debug                  # Enhanced logging for staging
DEBUG=*                          # Detailed debug output from all libraries
NODE_DEBUG=*                     # Node.js internal debugging
VERBOSE=true                     # Additional verbosity for troubleshooting
DEBUG_QUERIES=true               # Database query debugging
```

### **Service Settings**
```bash
# Render.com Configuration
RENDER_SERVICE_NAME=exora-v3-worker
HEALTH_CHECK_PORT=10000          # Port for health check endpoint

# Optional Monitoring
SENTRY_DSN=<your_sentry_dsn>     # Error monitoring (if configured)
```

---

## Critical Configuration Notes

### **Why NODE_ENV=production for Staging?**

**🚨 CRITICAL DECISION:** Based on industry research (2025 best practices), always use `NODE_ENV=production` for staging environments.

#### **Benefits:**
- ✅ **3x Performance Improvement:** Express runs in production mode
- ✅ **Production-Like Behavior:** Same caching, security, and optimization as production
- ✅ **Correct Dependencies:** Only installs production npm packages (not dev dependencies)
- ✅ **Reliable Testing:** Staging mirrors production behavior exactly
- ✅ **Security:** Production security settings enabled

#### **For Enhanced Debugging:**
Use **separate environment variables** instead of changing NODE_ENV:
- `LOG_LEVEL=debug` for verbose logging
- `DEBUG=*` for detailed library debug output
- `NODE_DEBUG=*` for Node.js internal debugging
- `VERBOSE=true` for additional troubleshooting info
- `DEBUG_QUERIES=true` for database query debugging

### **Environment Variable Security**

#### **Service Role Key Usage:**
```bash
# ✅ CORRECT: Service role for worker operations
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# ❌ NEVER: Don't use anon key for workers
SUPABASE_ANON_KEY=<anon_key>  # Wrong for background workers
```

#### **Why Service Role for Workers:**
- Workers need to bypass RLS policies for job coordination
- Workers perform system-level operations (job claiming, heartbeat updates)  
- Workers access `job_queue` table which requires service role permissions
- Edge Functions use anon keys with RLS; Workers use service role keys

---

## Deployment Workflow

### **Staging Environment (Current)**
```bash
Branch: staging
Environment Variables: Use staging-specific values
APP_ENV: staging
Purpose: Development, testing, iterative building
```

### **Production Environment (Future)**  
```bash
Branch: main  
Environment Variables: Use production values
APP_ENV: production
Purpose: Live healthcare data processing
```

### **Environment Promotion Process**
1. **Develop & Test:** Work on staging branch with staging environment variables
2. **Validate:** Ensure all V3 job coordination works end-to-end  
3. **Promote:** Merge staging → main and update APP_ENV to production
4. **Monitor:** Use enhanced logging to validate production deployment

---

## V3 Job Coordination Integration

### **Required Database Functions**
The worker depends on these V3 database functions (from 08_job_coordination.sql):
```sql
- enqueue_job_v3()           # Job enqueuing with backpressure
- claim_next_job_v3()        # Worker job claiming with heartbeat
- update_job_heartbeat()     # Heartbeat monitoring
- complete_job()             # Job completion with audit logging
- reschedule_job()           # Retry handling with exponential backoff
- acquire_api_capacity()     # API rate limiting
- release_api_capacity()     # API capacity management
```

### **Job Processing Flow**
```
1. Worker starts → Connects to Supabase with service role
2. Claim job → claim_next_job_v3() 
3. Check API capacity → acquire_api_capacity()
4. Process document → OpenAI/Google Vision APIs
5. Update heartbeat → update_job_heartbeat() (every 30s)
6. Complete job → complete_job() + release_api_capacity()
7. Repeat → Next job in queue
```

---

## Health Monitoring

### **Health Check Endpoint**
```typescript
// Worker exposes health check on HEALTH_CHECK_PORT
GET http://exora-v3-worker.onrender.com:10000/health

// Response:
{
  "status": "healthy",
  "worker_id": "exora-v3-worker-srv-12345-1693123456789",
  "active_jobs": 3,
  "last_heartbeat": "2025-08-31T10:30:00Z",
  "api_capacity": {
    "openai": "available",
    "google_vision": "rate_limited"
  }
}
```

### **Monitoring Metrics**
- Job processing rate
- API rate limiting status  
- Heartbeat monitoring
- Error rates and dead letter queue
- Memory/CPU usage

---

## Troubleshooting

### **Common Issues**

#### **Worker Not Claiming Jobs**
```bash
# Check database connection
DEBUG=supabase:* pnpm start

# Verify service role permissions
# Ensure 08_job_coordination.sql deployed correctly
```

#### **API Rate Limiting Issues**
```bash
# Check API capacity status
LOG_LEVEL=debug DEBUG=api:* pnpm start

# Monitor rate limit backpressure
# Verify API keys are valid and have quota
```

#### **Heartbeat Failures**  
```bash
# Check network connectivity
# Verify heartbeat_at timestamps in job_queue table
# Monitor worker timeout detection
```

### **Debug Commands**
```bash
# Local testing with all debug variables enabled (matches Render.com staging)
APP_ENV=staging NODE_ENV=production LOG_LEVEL=debug DEBUG=* NODE_DEBUG=* VERBOSE=true DEBUG_QUERIES=true pnpm start

# Database connection and query debugging  
DEBUG=supabase:* DEBUG_QUERIES=true pnpm run test:connection

# API integration testing with detailed output
DEBUG=api:* VERBOSE=true pnpm run test:apis

# Node.js internal debugging (for low-level issues)
NODE_DEBUG=* pnpm start

# Specific library debugging (Supabase client)
DEBUG=supabase:client,supabase:auth pnpm start
```

### **Debug Variable Usage Guide**
```bash
# LOG_LEVEL=debug
# → Application logs: info, warn, error, debug levels
# → Useful for: Application logic debugging

# DEBUG=*
# → Library debug output: All libraries with debug() calls
# → Useful for: Third-party library issues, API calls

# NODE_DEBUG=*  
# → Node.js internal debugging: fs, net, tls, http modules
# → Useful for: Network issues, file system problems, TLS/SSL issues

# VERBOSE=true
# → Application-specific verbose output
# → Useful for: Custom application debugging

# DEBUG_QUERIES=true
# → Database query logging (Supabase/PostgreSQL)
# → Useful for: SQL query debugging, performance issues
```

---

## Security Considerations

### **Environment Variable Security**
- ✅ Store all secrets in Render.com environment variables (encrypted)
- ✅ Never commit API keys or service role keys to repository
- ✅ Use separate keys for staging vs production environments
- ✅ Rotate keys regularly and update in Render.com dashboard

### **Network Security**
- ✅ Worker communicates over HTTPS only
- ✅ Supabase connection uses SSL/TLS encryption
- ✅ API calls to OpenAI/Google use official SDKs with proper authentication

### **Data Protection**
- ✅ All healthcare data processed in memory only (not stored to disk)
- ✅ Job payloads contain references (IDs) not actual medical content  
- ✅ Audit logging tracks all data access with correlation IDs
- ✅ Worker isolation prevents cross-patient data contamination

---

## Related Documentation

- **Main Implementation Plan:** [v3-phase2-implementation-plan-v5.md](v3-phase2-implementation-plan-v5.md)
- **Database Schema:** [08_job_coordination.sql](implementation/temp_v3_migrations/08_job_coordination.sql)  
- **V3 Architecture:** [V3_FRESH_START_BLUEPRINT.md](V3_FRESH_START_BLUEPRINT.md)

---

**Status:** ✅ **Staging Environment Configured**  
**Next:** Deploy V3 database schema → Implement worker service → Deploy V3 Edge Functions  
**Maintained by:** Exora Development Team