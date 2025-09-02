# V3 Database Critical Bug Fix Plan

**Created:** August 29, 2025  
**Updated:** August 29, 2025 - ✅ **IMPLEMENTATION COMPLETE**  
**Priority:** CRITICAL - Security Issues in Source Files  
**Status:** ✅ **ALL FIXES IMPLEMENTED - READY FOR DEPLOYMENT**  

---

## **🔧 DEPLOYMENT CONTEXT: PRE-LAUNCH**

**CRITICAL UPDATE**: Exora is **pre-launch with no users** and the V3 database has **NOT been deployed yet**. The source SQL files (01-07.sql) contain the critical bugs identified by GPT-5.

**This changes our approach completely:**
- ❌ **NOT creating migration scripts** (no existing database to migrate)
- ✅ **FIXING source files directly** before initial deployment  
- ✅ **Deploy clean, bug-free V3 database** from day one
- ✅ **No migration complexity** - just correct implementation

## **Executive Summary**

GPT-5 review identified **critical security vulnerabilities** in the V3 database **source files** that must be fixed before initial deployment to Supabase. These are not design issues - they are **actual bugs** in the implementation files that would prevent core functionality and create security risks if deployed as-is.

---

## **PHASE 0: CRITICAL SECURITY FIXES (Immediate - Week 1)**

### **🚨 Issue #1: RLS Provider Identity Mismatch (SEVERE)**

**Problem**: Multiple RLS policies incorrectly compare domain entity IDs to auth user IDs:

```sql
-- CURRENT BROKEN POLICIES (06_security.sql):
CREATE POLICY provider_registry_self_access ON provider_registry
    FOR ALL USING (
        id = auth.uid() -- ❌ WRONG: provider_registry.id ≠ auth.users.id
        ...
    );

CREATE POLICY patient_provider_access_patient_view ON patient_provider_access
    FOR ALL USING (
        ...
        OR provider_id = auth.uid() -- ❌ WRONG: provider_id ≠ auth.users.id
        ...
    );
```

**Impact**: 
- Providers cannot access their own records
- Provider-patient relationships broken
- Potential data leaks if UUIDs collide by chance
- **Complete failure of provider access controls**

**Fix Required**:
```sql
-- CORRECTED POLICIES:
CREATE POLICY provider_registry_self_access ON provider_registry
    FOR ALL USING (
        user_id = auth.uid() -- ✅ CORRECT: auth user comparison
        OR verification_status = 'full_verified' 
        OR is_admin()
    );

-- All affected policies require similar fixes:
CREATE POLICY patient_provider_access_patient_view ON patient_provider_access
    FOR ALL USING (
        has_profile_access(auth.uid(), patient_id)
        OR EXISTS (
            SELECT 1 FROM provider_registry pr 
            WHERE pr.id = patient_provider_access.provider_id 
            AND pr.user_id = auth.uid()
        ) -- ✅ CORRECT: proper join to auth user
        OR is_admin()
    );

CREATE POLICY provider_access_log_patient_provider_access ON provider_access_log
    FOR SELECT USING (
        has_profile_access(auth.uid(), patient_id)
        OR EXISTS (
            SELECT 1 FROM provider_registry pr 
            WHERE pr.id = provider_access_log.provider_id 
            AND pr.user_id = auth.uid()
        )
        OR is_admin()
    );

CREATE POLICY provider_action_items_access ON provider_action_items
    FOR ALL USING (
        has_profile_access(auth.uid(), patient_id)
        OR EXISTS (
            SELECT 1 FROM provider_registry pr 
            WHERE pr.id = provider_action_items.provider_id 
            AND pr.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM provider_registry pr 
            WHERE pr.id = provider_action_items.assigned_to 
            AND pr.user_id = auth.uid()
        )
        OR is_admin()
    );

CREATE POLICY provider_clinical_notes_access ON provider_clinical_notes
    FOR ALL USING (
        has_profile_access(auth.uid(), patient_id)
        OR EXISTS (
            SELECT 1 FROM provider_registry pr 
            WHERE pr.id = provider_clinical_notes.provider_id 
            AND pr.user_id = auth.uid()
        )
        OR is_admin()
    );

CREATE POLICY clinical_alert_rules_provider_read ON clinical_alert_rules
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM provider_registry pr 
            WHERE pr.user_id = auth.uid() AND pr.active = TRUE
        )
        OR is_admin()
    );

CREATE POLICY healthcare_provider_context_self_access ON healthcare_provider_context
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM provider_registry pr 
            WHERE pr.id = healthcare_provider_context.provider_id 
            AND pr.user_id = auth.uid()
        )
        OR is_admin()
    );
```

**Source Files Requiring Fixes**:
- `shared/docs/architecture/database-foundation-v3/implementation/database/06_security.sql`:
  - `provider_registry_self_access` (Line ~392)
  - `patient_provider_access_patient_view` (Line ~400) 
  - `provider_access_log_patient_provider_access` (Line ~408)
  - `provider_action_items_access` (Line ~416)
  - `provider_clinical_notes_access` (Line ~425)
  - `clinical_alert_rules_provider_read` (Line ~433)
  - `healthcare_provider_context_self_access` (Line ~443)
- `shared/docs/architecture/database-foundation-v3/implementation/database/02_profiles.sql`:
  - `has_profile_access_level()` function (ENUM vs TEXT comparison)
  - `profile_access_permissions` table (missing UNIQUE constraint)

---

### **🚨 Issue #2: Function Type Mismatch (BLOCKING)**

**Problem**: `has_profile_access_level()` function compares ENUM to TEXT without proper casting:

```sql
-- CURRENT BROKEN FUNCTION (02_profiles.sql):
... AND pap.permission_level >= p_required_level -- ENUM ≥ TEXT fails
```

**Impact**: 
- Function compilation errors
- Profile access checks completely broken
- All permission-dependent features fail

**Fix Required - Safer Whitelist Approach**:
```sql
-- TEMPORARY FIX (until attribute migration) - Using explicit whitelist
CREATE OR REPLACE FUNCTION has_profile_access_level(
    p_user_id UUID, 
    p_profile_id UUID, 
    p_required_level TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    allowed_levels TEXT[];
BEGIN
    -- Define allowed levels per required level (avoids enum ordering hazards)
    CASE p_required_level
        WHEN 'emergency' THEN 
            allowed_levels := ARRAY['emergency', 'read_only', 'read_write', 'full_access', 'owner'];
        WHEN 'read_only' THEN 
            allowed_levels := ARRAY['read_only', 'read_write', 'full_access', 'owner'];
        WHEN 'read_write' THEN 
            allowed_levels := ARRAY['read_write', 'full_access', 'owner'];
        WHEN 'full_access' THEN 
            allowed_levels := ARRAY['full_access', 'owner'];
        WHEN 'owner' THEN 
            allowed_levels := ARRAY['owner'];
        ELSE
            RETURN FALSE; -- Invalid required level
    END CASE;

    RETURN EXISTS (
        SELECT 1 FROM profile_access_permissions pap
        WHERE pap.profile_id = p_profile_id
        AND pap.user_id = p_user_id
        AND pap.revoked_at IS NULL
        AND pap.permission_level::TEXT = ANY(allowed_levels)
        AND (pap.access_end_date IS NULL OR pap.access_end_date > NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### **🚨 Issue #3: Missing UNIQUE Constraints (DATA INTEGRITY)**

**Problem**: `profile_access_permissions` allows duplicate permissions for same user/profile:

```sql
-- CURRENT PROBLEM:
INSERT INTO profile_access_permissions (profile_id, user_id, permission_level) 
VALUES (uuid1, uuid2, 'read_only');
INSERT INTO profile_access_permissions (profile_id, user_id, permission_level) 
VALUES (uuid1, uuid2, 'read_write'); -- ❌ Creates conflicting permissions
```

**Impact**:
- Data inconsistency
- Unpredictable permission behavior
- Potential security bypass

**Fix Required - With Pre-flight De-duplication**:
```sql
-- STEP 1: Clean up existing duplicates (keep most recent active permission)
WITH duplicates AS (
    SELECT profile_id, user_id, 
           ROW_NUMBER() OVER (PARTITION BY profile_id, user_id ORDER BY 
               CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END,  -- Active first
               granted_at DESC  -- Then most recent
           ) as rn,
           id
    FROM profile_access_permissions
),
to_delete AS (
    SELECT id FROM duplicates WHERE rn > 1
)
DELETE FROM profile_access_permissions 
WHERE id IN (SELECT id FROM to_delete);

-- STEP 2: Create unique index concurrently (minimizes lock time)
CREATE UNIQUE INDEX CONCURRENTLY uk_profile_access_user_idx 
ON profile_access_permissions(profile_id, user_id);

-- STEP 3: Attach index as constraint
ALTER TABLE profile_access_permissions 
ADD CONSTRAINT uk_profile_access_user UNIQUE USING INDEX uk_profile_access_user_idx;
```

---

## **PHASE 1: FOUNDATION STABILIZATION (Weeks 2-3)**

### **Issue #4: Semantic Data Access Function Updates**

**Problem**: `has_semantic_data_access()` depends on the broken `has_profile_access_level()` function.

**Fix Required**: Update function to handle type casting and provider identity properly.

### **Issue #5: Provider Access Log RLS**

**Problem**: Similar provider identity mismatch in audit log policies.

**Fix Required**: Update all provider access log policies to use proper joins.

---

## **PHASE 2: ARCHITECTURE MIGRATION PREP (Week 4)**

### **Issue #6: Capability-Based Function Framework**

**Objective**: Prepare migration from enum-based to attribute-based permissions.

**New Function Required**:
```sql
CREATE OR REPLACE FUNCTION has_profile_capability(
    p_user_id UUID,
    p_profile_id UUID, 
    p_capability TEXT -- 'read', 'write', 'manage_care', 'break_glass', 'quiet_view'
) RETURNS BOOLEAN;
```

### **Issue #7: State Machine for Emergency Access**

**Objective**: Implement proper state transitions for emergency requests.

**Requirements**:
- Constrained state machine for `approval_status`
- Triggers for automatic expiration
- Audit trail for all state changes

---

## **TESTING STRATEGY**

### **Critical Test Cases**:

1. **Provider Self-Access**:
   ```sql
   -- Test: Provider can access their own registry record
   SET LOCAL ROLE authenticated;
   SET LOCAL "request.jwt.claims" = '{"sub":"provider_user_id"}';
   SELECT * FROM provider_registry WHERE user_id = auth.uid();
   ```

2. **Provider-Patient Relationships**:
   ```sql
   -- Test: Provider can access their patient relationships
   SELECT * FROM patient_provider_access ppa
   JOIN provider_registry pr ON pr.id = ppa.provider_id
   WHERE pr.user_id = auth.uid();
   ```

3. **Permission Uniqueness**:
   ```sql
   -- Test: Duplicate permission insertion fails
   INSERT INTO profile_access_permissions (profile_id, user_id, permission_level)
   VALUES (uuid1, uuid2, 'read_only');
   -- This should fail:
   INSERT INTO profile_access_permissions (profile_id, user_id, permission_level)
   VALUES (uuid1, uuid2, 'read_write');
   ```

---

## **RISK ASSESSMENT**

### **Current State Risks**:
- **🔥 CRITICAL**: Complete provider access failure
- **🔥 CRITICAL**: Data integrity compromised by duplicate permissions
- **⚠️ HIGH**: Function compilation errors blocking core features
- **⚠️ HIGH**: Inconsistent permission behavior

### **Migration Risks**:
- **⚠️ MEDIUM**: Downtime during RLS policy updates
- **⚠️ MEDIUM**: Need for data migration scripts
- **⚠️ LOW**: Performance impact during transition

---

## **ROLLOUT PLAN**

### **Pre-Deployment**:
1. **Backup Production Database**
2. **Test fixes in staging environment**
3. **Validate all RLS policies work correctly**
4. **Performance test with realistic data volumes**

### **SOURCE FILE FIX SEQUENCE** (Pre-Deployment):
1. **Fix 06_security.sql**: Update all RLS policies with proper provider joins
2. **Fix 02_profiles.sql**: Add UNIQUE constraint + update has_profile_access_level function  
3. **Validate all source files**: Ensure no syntax errors or remaining issues
4. **Deploy clean V3 database to Supabase**: Run 01-07.sql in sequence
5. **Run comprehensive test suite**: Validate all functionality works correctly
6. **No migration complexity**: Clean deployment from corrected source files

### **Rollback Plan**:
- All changes are additive or corrections
- Can rollback RLS policies if issues arise
- UNIQUE constraint may need cleanup if rollback required

---

## **SUCCESS METRICS**

### **Phase 0 Complete When**:
- ✅ All providers can access their registry records
- ✅ Provider-patient relationships work correctly  
- ✅ No duplicate permission records possible
- ✅ All permission functions execute without errors
- ✅ Core provider workflows functional

### **Validation Queries**:
```sql
-- Test 1: Provider self-access works
SELECT COUNT(*) FROM provider_registry WHERE user_id = auth.uid();

-- Test 2: No duplicate permissions exist
SELECT profile_id, user_id, COUNT(*) as duplicates
FROM profile_access_permissions 
WHERE revoked_at IS NULL
GROUP BY profile_id, user_id
HAVING COUNT(*) > 1;

-- Test 3: Function executes successfully
SELECT has_profile_access_level(
    'test_user_id'::UUID, 
    'test_profile_id'::UUID, 
    'read_only'
);
```

---

## **ADDITIONAL RECOMMENDATIONS (PHASE 1/2)**

### **Performance Optimizations**:
```sql
-- Partial unique index for historical grants (if needed)
CREATE UNIQUE INDEX uk_profile_access_active 
ON profile_access_permissions(profile_id, user_id) 
WHERE revoked_at IS NULL;

-- Performance indexes for active permissions
CREATE INDEX idx_profile_access_active 
ON profile_access_permissions(profile_id) 
WHERE revoked_at IS NULL;

CREATE INDEX idx_profile_access_quiet_viewer 
ON profile_access_permissions(is_quiet_viewer) 
WHERE is_quiet_viewer = TRUE;

-- Emergency workflow indexes  
CREATE INDEX idx_emergency_access_expiry 
ON active_emergency_access(patient_id, access_expires_at) 
WHERE access_revoked_at IS NULL;

CREATE INDEX idx_emergency_requests_patient 
ON emergency_access_requests(patient_id, approval_status);
```

### **Enhanced Security Measures**:
- Add partial unique indexes to prevent overlapping active emergency sessions
- Implement state machine constraints for emergency request transitions
- Add triggers for automatic cleanup of expired emergency access

---

---

## **CURRENT STATUS & NEXT STEPS**

### **Updated Context (Pre-Deployment)**:
- ✅ **Critical bugs identified** in source files before deployment
- ✅ **Comprehensive fix plan created** with GPT-5 expert review  
- ✅ **Clean deployment approach** - fix source files, then deploy
- 🎯 **Ready to fix source files** and deploy bug-free V3 database

### **Source Files to Modify**:
```
shared/docs/architecture/database-foundation-v3/implementation/database/
├── 02_profiles.sql          (Function + UNIQUE constraint fixes)
├── 06_security.sql          (All provider RLS policy fixes)
└── [01,03-05,07].sql       (Validation only - should be clean)
```

### **Deployment Advantage**:
- **No users affected** (pre-launch)
- **No data migration needed** (clean deployment)  
- **No downtime concerns** (initial deployment)
- **Can test thoroughly** before going live

---

**Document Status**: ✅ **IMPLEMENTATION COMPLETE - SUPERSEDED BY COMPREHENSIVE PLAN**  
**Implementation Date**: August 29, 2025  
**Final Status**: All issues resolved in comprehensive 10-issue fix implementation  
**Successor Document**: `v3-comprehensive-review-report.md` (contains complete fix details)

---

## ✅ **IMPLEMENTATION COMPLETE**

**This plan has been fully implemented as part of a comprehensive 10-issue fix:**

### **Original 3 Issues (This Plan):**
✅ **Issue #1**: RLS Provider Identity Mismatch → **RESOLVED**  
✅ **Issue #2**: Function Type Mismatch → **RESOLVED**  
✅ **Issue #3**: Missing UNIQUE Constraints → **RESOLVED**  

### **Extended Implementation:**
- **Additional 7 critical issues** discovered during comprehensive review
- **All 10 issues systematically resolved** in `v3-comprehensive-review-report.md`
- **All 7 SQL files updated** with fixes applied
- **Ready for Supabase deployment**: 01→02→03→04→05→06→07

### **Files Modified:**
✅ `02_profiles.sql` - UNIQUE constraint + function fixes  
✅ `06_security.sql` - Provider RLS policy fixes (already completed in previous session)  
✅ `01_foundations.sql` - Provider function schema alignment  
✅ `03_clinical_core.sql` - Document/shell_files schema consistency  
✅ `04_ai_processing.sql` - Complete ID alignment + cross-file dependency fixes  
✅ `05_healthcare_journey.sql` - Compatibility fixes + moved provider elements  
✅ `07_optimization.sql` - Column name corrections + undefined reference removal

**Status**: Ready to archive alongside comprehensive plan