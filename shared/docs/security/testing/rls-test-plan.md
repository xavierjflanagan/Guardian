# Row Level Security (RLS) Testing Plan

**Purpose:** Comprehensive testing strategy for database Row Level Security policies  
**Scope:** All user data tables with RLS policies in Guardian healthcare platform  
**Last Updated:** 2025-08-13  
**Critical Requirement:** Healthcare data isolation and privacy protection

---

## **RLS Testing Overview**

Row Level Security (RLS) is Guardian's primary mechanism for ensuring healthcare data privacy and preventing unauthorized access between user profiles. This testing plan validates that all RLS policies correctly enforce data isolation.

### **Testing Objectives**
1. **Data Isolation:** Verify users can only access their own data
2. **Profile Separation:** Prevent cross-profile data leakage
3. **Provider Access:** Validate healthcare provider access controls
4. **Audit Integrity:** Ensure audit logs cannot be tampered with
5. **Emergency Access:** Test emergency access procedures

### **Compliance Requirements**
- **Australian Privacy Act:** Data security and access controls
- **HIPAA Readiness:** Minimum necessary standard and access controls
- **Healthcare Standards:** Patient data confidentiality

---

## **RLS Policy Inventory**

### **Current RLS-Protected Tables**
Based on migration analysis, Guardian has 50+ RLS policies across 13 files. Key tables include:

#### **Core User Data Tables**
- `documents` - Medical document storage
- `user_profiles` - Profile management
- `user_events` - Activity logging
- `audit_log` - System audit trail

#### **Healthcare Data Tables**
- `clinical_events` - Medical events and timeline
- `healthcare_timeline_events` - Healthcare journey
- `patient_medications` - Medication records
- `patient_lab_results` - Laboratory results
- `patient_conditions` - Medical conditions
- `patient_allergies` - Allergy information

#### **Provider Access Tables**
- `patient_provider_access` - Provider permissions
- `provider_registry` - Healthcare provider directory
- `patient_consents` - Consent management

#### **System Tables**
- `feature_flags` - User-specific features
- `system_notifications` - User notifications

---

## **Testing Methodology**

### **Test Environment Setup**
```sql
-- Create test users and profiles
INSERT INTO auth.users (id, email) VALUES 
  ('user-1-uuid', 'test1@example.com'),
  ('user-2-uuid', 'test2@example.com'),
  ('provider-1-uuid', 'provider1@example.com');

INSERT INTO user_profiles (id, user_id, display_name, profile_type) VALUES
  ('profile-1-uuid', 'user-1-uuid', 'Test Patient 1', 'self'),
  ('profile-2-uuid', 'user-2-uuid', 'Test Patient 2', 'self'),
  ('profile-3-uuid', 'user-1-uuid', 'Test Child Profile', 'child');

-- Create test documents for isolation testing
INSERT INTO documents (id, patient_id, filename, original_name) VALUES
  ('doc-1-uuid', 'user-1-uuid', 'patient1-doc.pdf', 'Medical Record 1'),
  ('doc-2-uuid', 'user-2-uuid', 'patient2-doc.pdf', 'Medical Record 2');
```

### **Authentication Context Setup**
```sql
-- Set authentication context for testing
-- Test as User 1
SET role authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "user-1-uuid", "role": "authenticated"}', true);

-- Test as User 2  
SET role authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "user-2-uuid", "role": "authenticated"}', true);

-- Test as Provider
SET role authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "provider-1-uuid", "role": "authenticated"}', true);
```

---

## **Test Cases**

### **Test Category 1: Basic Data Isolation**

#### **TC-001: Document Access Isolation**
**Objective:** Verify users can only access their own documents

```sql
-- Test setup
SET role authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "user-1-uuid"}', true);

-- Expected: Returns only user-1's documents
SELECT * FROM documents;
-- Should return: doc-1-uuid only

-- Test cross-user access attempt
SELECT * FROM documents WHERE patient_id = 'user-2-uuid';
-- Expected: Empty result set

-- Reset and test as user-2
RESET role;
SET role authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "user-2-uuid"}', true);

SELECT * FROM documents;
-- Should return: doc-2-uuid only
```

**Success Criteria:**
- [ ] User 1 sees only their documents
- [ ] User 2 sees only their documents
- [ ] No cross-user document access possible

#### **TC-002: Profile Access Isolation**
**Objective:** Verify profile access restrictions

```sql
-- Test as user-1 (has profile-1 and profile-3)
SET role authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "user-1-uuid"}', true);

SELECT * FROM user_profiles;
-- Should return: profile-1-uuid and profile-3-uuid

-- Test as user-2 (has profile-2 only)
RESET role;
SET role authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "user-2-uuid"}', true);

SELECT * FROM user_profiles;
-- Should return: profile-2-uuid only
```

**Success Criteria:**
- [ ] Users see only their profiles
- [ ] Multi-profile users see all their profiles
- [ ] No access to other users' profiles

### **Test Category 2: Healthcare Data Isolation**

#### **TC-003: Clinical Events Access**
**Objective:** Verify clinical events are properly isolated

```sql
-- Insert test clinical events
INSERT INTO clinical_events (id, patient_id, event_type, description) VALUES
  ('event-1-uuid', 'user-1-uuid', 'appointment', 'Cardiology consultation'),
  ('event-2-uuid', 'user-2-uuid', 'appointment', 'General checkup');

-- Test as user-1
SET role authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "user-1-uuid"}', true);

SELECT * FROM clinical_events;
-- Should return: event-1-uuid only

-- Attempt to access specific event from user-2
SELECT * FROM clinical_events WHERE id = 'event-2-uuid';
-- Expected: Empty result set
```

**Success Criteria:**
- [ ] Users see only their clinical events
- [ ] No access to other patients' clinical data
- [ ] Event details properly isolated

#### **TC-004: Medication Records Isolation**
**Objective:** Verify medication records are properly protected

```sql
-- Insert test medication records
INSERT INTO patient_medications (id, patient_id, medication_name, dosage) VALUES
  ('med-1-uuid', 'user-1-uuid', 'Test Medication A', '10mg'),
  ('med-2-uuid', 'user-2-uuid', 'Test Medication B', '20mg');

-- Test isolation
SET role authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "user-1-uuid"}', true);

SELECT * FROM patient_medications;
-- Should return: med-1-uuid only

-- Test unauthorized access
SELECT medication_name FROM patient_medications WHERE patient_id = 'user-2-uuid';
-- Expected: Empty result set
```

### **Test Category 3: Provider Access Controls**

#### **TC-005: Provider Access Permissions**
**Objective:** Verify providers can only access authorized patients

```sql
-- Grant provider access to user-1 only
INSERT INTO patient_provider_access (
  id, patient_id, provider_id, status, valid_from, valid_until
) VALUES (
  'access-1-uuid', 'user-1-uuid', 'provider-1-uuid', 'active', 
  NOW(), NOW() + INTERVAL '1 year'
);

-- Test as provider
SET role authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "provider-1-uuid"}', true);

-- Should see user-1's data (with proper provider policies)
SELECT * FROM documents WHERE patient_id = 'user-1-uuid';
-- Expected: Access granted

-- Should NOT see user-2's data
SELECT * FROM documents WHERE patient_id = 'user-2-uuid';
-- Expected: Empty result set or access denied
```

**Success Criteria:**
- [ ] Providers see only authorized patients' data
- [ ] No access to unauthorized patients
- [ ] Access permissions properly enforced

### **Test Category 4: Audit Log Protection**

#### **TC-006: Audit Log Immutability**
**Objective:** Verify audit logs cannot be modified by users

```sql
-- Create test audit entry
INSERT INTO audit_log (id, table_name, record_id, operation, changed_by) VALUES
  ('audit-1-uuid', 'documents', 'doc-1-uuid', 'SELECT', 'user-1-uuid');

-- Test as user-1 (should not be able to modify)
SET role authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "user-1-uuid"}', true);

-- Attempt to modify audit log
UPDATE audit_log SET operation = 'MODIFIED' WHERE id = 'audit-1-uuid';
-- Expected: Permission denied or policy violation

-- Attempt to delete audit log
DELETE FROM audit_log WHERE id = 'audit-1-uuid';
-- Expected: Permission denied or policy violation
```

**Success Criteria:**
- [ ] Users cannot modify audit logs
- [ ] Users cannot delete audit logs
- [ ] Audit log integrity maintained

### **Test Category 5: Edge Cases and Attack Scenarios**

#### **TC-007: SQL Injection Bypass Attempts**
**Objective:** Verify RLS policies cannot be bypassed via SQL injection

```sql
-- Test malicious input scenarios
SET role authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "user-1-uuid"}', true);

-- Attempt injection in WHERE clause
SELECT * FROM documents WHERE patient_id = 'user-1-uuid' OR '1'='1';
-- Expected: RLS policy still enforces access control

-- Attempt UNION injection
SELECT * FROM documents UNION SELECT * FROM documents WHERE patient_id = 'user-2-uuid';
-- Expected: RLS policy prevents unauthorized data
```

#### **TC-008: Role Escalation Attempts**
**Objective:** Verify users cannot escalate privileges

```sql
-- Attempt to set admin role
SET role postgres;
-- Expected: Permission denied

-- Attempt to modify JWT claims
SELECT set_config('request.jwt.claims', '{"sub": "user-1-uuid", "role": "admin"}', true);
-- Expected: Should not bypass RLS policies

-- Test unauthorized role usage
SET role service_role;
-- Expected: Permission denied for normal users
```

---

## **Automated Testing Framework**

### **TypeScript Test Implementation**
```typescript
// RLS testing utilities
import { createClient } from '@supabase/supabase-js';

class RLSTestFramework {
  private supabase: SupabaseClient;

  async testDataIsolation(userId1: string, userId2: string) {
    // Test as user 1
    const { data: user1Data } = await this.queryAsUser(userId1, 'documents');
    
    // Test as user 2
    const { data: user2Data } = await this.queryAsUser(userId2, 'documents');
    
    // Verify no overlap
    const user1Ids = user1Data?.map(d => d.id) || [];
    const user2Ids = user2Data?.map(d => d.id) || [];
    const overlap = user1Ids.filter(id => user2Ids.includes(id));
    
    expect(overlap).toHaveLength(0);
  }

  private async queryAsUser(userId: string, table: string) {
    // Create session for specific user
    const userClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false
        }
      }
    );

    // Simulate user authentication
    await userClient.auth.setSession({
      access_token: this.generateTestToken(userId),
      refresh_token: 'test-refresh'
    });

    return userClient.from(table).select('*');
  }
}

// Jest test suite
describe('RLS Policy Tests', () => {
  let testFramework: RLSTestFramework;

  beforeEach(() => {
    testFramework = new RLSTestFramework();
  });

  test('TC-001: Document access isolation', async () => {
    await testFramework.testDataIsolation('user-1-uuid', 'user-2-uuid');
  });

  test('TC-003: Clinical events isolation', async () => {
    await testFramework.testTableIsolation('clinical_events', 'user-1-uuid', 'user-2-uuid');
  });

  test('TC-006: Audit log immutability', async () => {
    await testFramework.testAuditLogProtection('user-1-uuid');
  });
});
```

### **Database Testing Functions**
```sql
-- Create RLS testing functions
CREATE OR REPLACE FUNCTION test_rls_isolation(
  user1_id UUID,
  user2_id UUID,
  table_name TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  user1_count INTEGER;
  user2_count INTEGER;
  overlap_count INTEGER;
BEGIN
  -- Test as user 1
  SET role authenticated;
  PERFORM set_config('request.jwt.claims', format('{"sub": "%s"}', user1_id), true);
  EXECUTE format('SELECT COUNT(*) FROM %I', table_name) INTO user1_count;
  
  -- Test as user 2
  PERFORM set_config('request.jwt.claims', format('{"sub": "%s"}', user2_id), true);
  EXECUTE format('SELECT COUNT(*) FROM %I', table_name) INTO user2_count;
  
  -- Reset context
  RESET role;
  
  -- Verify no unauthorized access occurred
  -- Implementation depends on specific table structure
  RETURN TRUE; -- Simplified for example
END;
$$ LANGUAGE plpgsql;
```

---

## 📊 **Test Execution and Reporting**

### **Test Execution Schedule**
- **Development:** Every database migration
- **Pre-Production:** Before each release
- **Production:** Monthly validation
- **Post-Incident:** After any security event

### **Test Reporting**
```typescript
interface RLSTestReport {
  test_date: Date;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  tables_tested: string[];
  policy_coverage: number; // Percentage
  critical_failures: string[];
  recommendations: string[];
}

const generateRLSTestReport = (): RLSTestReport => {
  return {
    test_date: new Date(),
    total_tests: 15,
    passed_tests: 14,
    failed_tests: 1,
    tables_tested: ['documents', 'user_profiles', 'clinical_events'],
    policy_coverage: 93.3,
    critical_failures: ['TC-006: Audit log test failed'],
    recommendations: ['Review audit log RLS policy']
  };
};
```

### **Failure Response Procedures**
1. **Immediate:** Stop deployment if critical RLS test fails
2. **Investigation:** Analyze root cause of policy failure
3. **Remediation:** Fix RLS policy and retest
4. **Validation:** Comprehensive retest before proceeding
5. **Documentation:** Update test cases based on findings

---

## **Success Criteria**

### **Test Completion Requirements**
- [ ] **100% Policy Coverage:** All RLS policies tested
- [ ] **100% Test Pass Rate:** All critical tests must pass
- [ ] **Cross-User Isolation:** No data leakage between users
- [ ] **Provider Access Control:** Proper healthcare provider permissions
- [ ] **Audit Protection:** Audit logs cannot be tampered with

### **Performance Requirements**
- [ ] **Query Performance:** RLS policies don't significantly impact performance
- [ ] **Index Optimization:** Proper indexes support RLS queries
- [ ] **Scalability:** RLS policies work with large datasets

### **Compliance Validation**
- [ ] **Healthcare Privacy:** Patient data properly isolated
- [ ] **Audit Requirements:** Complete audit trail protection
- [ ] **Emergency Access:** Emergency procedures work correctly
- [ ] **Provider Controls:** Healthcare provider access properly managed

---

**Review Schedule:** Monthly or after any RLS policy changes  
**Approval Required:** Security officer and database administrator  
**Emergency Contact:** [Database security specialist]