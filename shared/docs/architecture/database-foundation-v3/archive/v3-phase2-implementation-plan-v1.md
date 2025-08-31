# V3 Phase 2 Consensus Implementation Plan

**Date:** August 31, 2025  
**Purpose:** Unified implementation plan combining Claude and GPT-5 technical analyses  
**Status:** Consensus plan ready for GPT-5 final review and implementation  
**Contributors:** Claude Code + GPT-5 collaborative analysis

---

## Executive Summary

**CONSENSUS ACHIEVED:** Both analyses converge on a **MEDIUM-HIGH risk V3 deployment** requiring systematic approach with proper testing and rollback procedures.

**Key Agreement Points:**
- ✅ **Deployment Complexity:** V3 database uses `shell_files` table (not `documents`)
- ✅ **Scope:** Clean slate approach - Delete 12 legacy Edge Functions, build 2-3 V3-native functions
- ✅ **Timeline:** 1-2 weeks implementation with clean V3-native Edge Functions  
- ✅ **Approach:** Clean slate V3 deployment with purpose-built Edge Functions

**Critical Success Factors:**
1. V3 database deployment coordination with clean slate Edge Functions
2. Production data handling during V3 deployment (existing `documents` → V3 `shell_files`)
3. V3-native Edge Functions built specifically for `shell_files` schema
4. Clean production environment with no legacy V2 Edge Function contamination

---

## Technical Architecture Consensus

### **1. V3 Schema Definition (Verified with Line Numbers)**

**V3 Uses `shell_files` Table (NOT `documents`):**
```sql
-- V3 shell_files definition (03_clinical_core.sql:123-128)
CREATE TABLE IF NOT EXISTS shell_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    -- Enhanced fields beyond legacy documents table
```

**V3 Edge Functions Design Requirements:**
- **Legacy Edge Functions:** Will be deleted (12 functions with V2 anti-patterns)
- **V3 Native Functions:** Built from scratch targeting `.from('shell_files')` only

**Production Data Handling:** 
- **Current:** Production `documents` table with `patient_id` → `auth.users(id)`
- **V3 Deployment:** Must handle existing data during V3 `shell_files` deployment

**V3 Indexes Available (03_clinical_core.sql:956-961):**
- `idx_shell_files_patient`, `idx_shell_files_status`, `idx_shell_files_type`, `idx_shell_files_processing`

### **2. V3 Edge Functions Clean Slate Design**

**APPROACH: Delete all 12 legacy functions, build V3-native replacements**

**V3 Essential Functions (NEW - Built from scratch with Error Resilience):**

**Priority 1 - Core V3 Functions:**
- `shell-file-processor-v3` - Upload success guarantee, fast queue processing, error tracking
- `ai-processor-v3` - AI queue processing with exponential backoff retry
- `audit-logger-v3` - Healthcare compliance audit logging

**Processing Architecture:**
- **Upload Always Succeeds:** Files saved to shell_files immediately, processing queued separately
- **Fast Queue:** Security → OCR → Spatial mapping (< 2 minutes)
- **AI Queue:** Pass 1 → Pass 2 → Pass 3 with retry logic (2-10 minutes)
- **Error Resilience:** All failures logged to processing_errors table with exponential backoff

**DELETED Legacy Functions (Clean slate approach):**
- ❌ `document-processor` → Replaced by `shell-file-processor-v3`
- ❌ `document-processor-complex` → V3 AI processing architecture covers this
- ❌ `document-processor-simple` → Redundant with clean V3 design
- ❌ `queue-worker` → V3 job system integration built into new functions
- ❌ `audit-events` → Replaced by `audit-logger-v3`
- ❌ `ai-diagnostic` + 7 test/debug functions → Development artifacts, not needed

### **3. RPC Functions Resolution**

**Agreed Solution:** Create `enqueue_job_v3` RPC wrapper
```sql
-- Recommended signature (GPT-5 specification)
CREATE OR REPLACE FUNCTION enqueue_job_v3(
    job_type text, 
    job_name text, 
    job_payload jsonb, 
    job_category text default 'standard', 
    priority int default 5, 
    scheduled_at timestamptz default now()
) RETURNS uuid
```

**Audit Function Standardization:**
- **Use:** `log_audit_event(..., p_patient_id := <profile_id>)` from V3 `02_profiles.sql`
- **Avoid:** Legacy `log_profile_audit_event` or `get_allowed_patient_ids` workarounds

---

## Implementation Roadmap (Weeks 4-6)

### **Week 4: V3 Database Deployment & Edge Function Updates**

#### **Days 1-2: V3 Database Deployment**
```bash
# Staging deployment sequence
1. Deploy V3 database schema to staging environment
2. Handle existing production data (if any) during V3 deployment
3. Verify V3 shell_files table and all dependencies created
4. Smoke test V3 database connectivity and basic operations
```

#### **Days 3-4: V3 RPC Functions & Edge Function Prep**
```sql
-- V3 deployment includes:
CREATE OR REPLACE FUNCTION enqueue_job_v3(...) -- Add to V3 SQL files
-- V3 already has: shell_files table, user_profiles, log_audit_event, etc.
```

#### **Days 5-7: V3 Native Edge Functions Development**
```typescript
// Clean slate V3-native function development:
// 1. shell-file-processor-v3: Built specifically for .from('shell_files')
// 2. V3 patient_id semantics (user_profiles.id) from the start
// 3. Native V3 log_audit_event(...) integration
// 4. Direct V3 job_queue table access or enqueue_job_v3
// 5. No legacy compatibility - pure V3 implementation
```

### **Week 5: Advanced V3 Functions & Integration**

#### **Days 1-3: Advanced V3 Functions Development**
- Complete `ai-coordinator-v3` development (V3 AI processing workflows)
- Remove all legacy Edge Functions from production
- Implement V3 enhanced features (processing metadata, narrative context)

#### **Days 4-7: Integration Testing & Optimization**
- End-to-end workflow validation  
- Performance testing and optimization
- Security and compliance verification

### **Week 6: Production Deployment & Validation**

#### **Days 1-4: Production Migration**
- Production database V3 deployment
- Edge Functions atomic deployment with feature flags
- Gradual rollout with monitoring and rollback readiness

#### **Days 5-7: Post-Deployment Validation**
- Full system validation
- Performance monitoring
- Documentation updates and team training

---

## Critical Implementation Details

### **1. Production Data Handling Strategy**

**Current State:** 
- V3 database schema is **design-only** (not yet deployed)
- **PRE-LAUNCH ENVIRONMENT:** No production users or existing data requiring migration
- V3 schema uses `shell_files` table with clean slate deployment

**V3 Deployment Strategy (Clean Slate - No Migration):**
```sql
-- Clean V3 deployment with no existing data migration needed
-- Deploy V3 database schema including:
-- 1. shell_files table (replacing documents concept)
-- 2. processing_errors table for comprehensive error tracking
-- 3. Enhanced job_queue with exponential backoff retry support
-- 4. All V3 user_profiles, clinical tables, and RPC functions

-- V3 processing_errors table design (planning):
CREATE TABLE processing_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shell_file_id UUID REFERENCES shell_files(id),
    error_type TEXT NOT NULL, -- 'ocr_failure', 'ai_timeout', 'api_error'
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **2. Clean Slate Deployment Strategy with Two-Queue Architecture**

**Approach:** Pure V3-native functions with resilient processing (no legacy compatibility)
```typescript
// V3 Native Edge Function pattern - no feature flags needed
// Always uses shell_files table, no legacy documents references
await supabase.from('shell_files').select('*').eq('patient_id', profileId);
```

**Two-Queue Processing Architecture:**
1. **Fast Queue (< 2 minutes):** Security scan → OCR → Spatial mapping
2. **AI Queue (2-10 minutes):** Pass 1 → Pass 2 → Pass 3 processing
3. **Upload Success Guarantee:** File always saved, processing errors never affect upload success
4. **Exponential Backoff Retry:** 2s, 4s, 8s, 16s, 32s, 64s for all pipeline errors

**Deployment Strategy:**
1. Delete all 12 legacy Edge Functions 
2. Deploy V3 database schema with processing_errors table
3. Deploy V3-native Edge Functions (built for shell_files from day 1)
4. No backwards compatibility needed - clean slate approach

### **3. Testing & Validation Framework**

**Critical Test Scenarios:**
```typescript
// 1. ID System Validation
- Document upload with correct user_profiles.id assignment
- Cross-profile access prevention verification
- Audit trail patient_id correctness

// 2. Migration Integrity  
- All legacy documents accessible post-migration
- No data loss during documents → shell_files transition
- Backwards compatibility during feature flag transition

// 3. V3 Edge Function Integration
- Shell file processing end-to-end workflow (V3 native)
- V3 job queue functionality 
- V3 error handling and status updates
- V3 AI processing integration (Pass 1/2/3 workflows)

// 4. Rollback Procedures
- V3 database rollback to pre-deployment state
- V3 Edge Function revert to empty state (clean slate)
```

---

## Risk Assessment & Mitigation

### **Risk Level: MEDIUM-HIGH** (Consensus)

**Primary Risks:**
1. **V3 Deployment Coordination** - Database and Edge Functions must deploy together
2. **Production Data Handling** - Existing documents data during V3 shell_files deployment  
3. **Clean Slate Function Gaps** - Missing functionality from deleted legacy functions
4. **V3 RLS Policy Misconfigurations** - Security vulnerabilities in new schema

**Mitigation Strategies:**
1. **Coordinated Deployment** - V3 database and Edge Functions deployed atomically
2. **Clean Slate Testing** - Comprehensive V3-native function validation
3. **Production Data Backup** - Point-in-time restore before V3 deployment
4. **Functionality Mapping** - Verify all essential features covered by V3 functions
5. **V3 Monitoring** - Real-time shell_files processing health checks

### **Success Criteria**

**Week 4 Completion:**
- [ ] V3 database deployed and validated in staging
- [ ] Data migration script executed successfully  
- [ ] V3-native Edge Functions operational with shell_files schema
- [ ] Legacy Edge Functions completely removed from production
- [ ] Rollback procedures tested and verified

**Week 5 Completion:**  
- [ ] All V3-native Edge Functions deployed and operational
- [ ] Zero legacy Edge Function dependencies
- [ ] V3 enhanced features accessible
- [ ] Performance benchmarks met or exceeded

**Week 6 Completion:**
- [ ] Production deployment successful
- [ ] Zero regression in functionality
- [ ] All compliance and security validations passed
- [ ] Team training completed
- [ ] Documentation updated

---

## Next Steps & Deliverables

### **Immediate Actions Required:**
1. **Delete Legacy Edge Functions** - Remove all 12 V2 functions (preserve _shared/cors.ts only)
2. **V3 Deployment Script** - Handle production data during V3 database deployment
3. **enqueue_job_v3 RPC** - Add to V3 SQL files for new Edge Function compatibility
4. **V3 Edge Functions Design** - Build shell-file-processor-v3 and audit-logger-v3 from scratch
5. **Testing Framework** - V3 deployment and clean slate Edge Function validation

### **GPT-5 Deliverables Requested:**
As offered in GPT-5's response, please provide:
- ✅ **One-page implementation timeline** with estimates and owners
- ✅ **V3 deployment script** handling existing production data  
- ✅ **V3 Edge Functions specification** for shell-file-processor-v3 and audit-logger-v3 (clean slate design)

### **Deployment Readiness Checklist:**
- [ ] All V3 SQL files validated and deployment-ready
- [ ] V3-native Edge Functions development complete
- [ ] Clean slate deployment infrastructure implemented
- [ ] Testing framework operational  
- [ ] Rollback procedures documented and tested
- [ ] Team trained on migration procedures

---

## Consensus Statement

**Both Claude and GPT-5 agree:**
- V3 deployment requires clean slate approach for Edge Functions
- Deleting legacy functions eliminates V2 technical debt and contamination
- Production data handling during V3 deployment is the critical path item
- V3-native functions built specifically for shell_files schema ensure clean architecture

**Combined expertise provides:**
- GPT-5's deep technical V3 database schema knowledge
- Claude's broader scope analysis and project management framework
- Clean slate approach eliminating legacy technical debt while maintaining essential functionality

---

**Status:** ✅ **Consensus Plan Updated - Ready for Final GPT-5 Review**  
**Risk Level:** 🟢 **MEDIUM** (Clean slate approach reduces complexity)  
**Timeline:** 3 weeks (Weeks 4-6) with clean V3 deployment and Edge Functions  
**Success Probability:** High with clean slate elimination of legacy technical debt

**Next:** GPT-5 final review and delivery of V3 deployment implementation deliverables