# RLS Policy Testing Framework - Guardian Healthcare Platform

**Issue:** [GitHub Issue #28](https://github.com/xavierjflanagan/Guardian/issues/28)  
**Priority:** CRITICAL  
**Healthcare Impact:** CRITICAL - 84 untested RLS policies represent highest data security risk  
**Created:** August 18, 2025  

## Executive Summary

Guardian Healthcare Platform currently has **84 Row Level Security (RLS) policies** across **13 migration files** that are completely untested. This represents a critical vulnerability in patient data isolation and healthcare compliance, potentially violating Australian Privacy Act and HIPAA requirements.

## RLS Policy Analysis Results

### Policy Distribution by Migration File

| Migration File | Policy Count | Primary Focus |
|---|---|---|
| `003_multi_profile_management.sql` | 12 | Profile access control |
| `004_core_clinical_tables.sql` | 4 | Core patient data isolation |
| `005_clinical_events_core.sql` | 8 | Clinical event access |
| `006_healthcare_journey.sql` | 6 | Journey and timeline data |
| `008_provider_registry.sql` | 3 | Provider access control |
| `009_patient_provider_access.sql` | 11 | Provider-patient relationships |
| `010_clinical_decision_support.sql` | 7 | Clinical decision data |
| `011_job_queue.sql` | 2 | Background job isolation |
| `012_final_policies_and_triggers.sql` | 15 | Enhanced provider policies |
| `013_enhanced_consent.sql` | 8 | Consent management |
| `020_phase0_critical_fixes.sql` | 2 | User events audit |
| `000_system_infrastructure.sql` | 3 | System-level access |
| `002_feature_flags.sql` | 3 | Feature flag access |

### Critical Policy Categories

#### 1. Patient Data Isolation Policies (HIGHEST RISK)
- **documents** table: Patient medical records
- **patient_conditions** table: Medical conditions
- **patient_allergies** table: Allergy information  
- **patient_vitals** table: Vital signs data

#### 2. Multi-Profile Access Control (HIGH RISK)
- **user_profiles** table: Profile management
- **profile_access_permissions** table: Cross-profile access
- **profile_auth_progression** table: Authentication levels

#### 3. Provider Access Control (HIGH RISK)
- **provider_registry** table: Healthcare provider data
- **patient_provider_access** table: Provider-patient relationships
- **patient_consents** table: Healthcare consent management

## Testing Framework Architecture

### Framework Components

```typescript
interface RLSTestFramework {
  // Core testing utilities
  testRunner: RLSTestRunner;
  policyAnalyzer: PolicyAnalyzer;
  
  // Test data management
  testDataFactory: HealthcareTestDataFactory;
  userContextManager: UserContextManager;
  
  // Compliance validation
  complianceValidator: HealthcareComplianceValidator;
  auditLogger: SecurityAuditLogger;
  
  // Reporting and metrics
  reportGenerator: RLSTestReportGenerator;
  metricsCollector: PolicyCoverageMetrics;
}
```

### Test Category Structure

```typescript
interface RLSTestSuite {
  // Core access control tests
  patientDataIsolation: PatientDataIsolationTests;
  multiProfileAccess: MultiProfileAccessTests;
  providerAccess: ProviderAccessTests;
  
  // Healthcare-specific compliance tests
  hipaaCompliance: HIPAAComplianceTests;
  privacyActCompliance: AustralianPrivacyActTests;
  
  // Security boundary tests
  crossTenantLeakage: CrossTenantLeakageTests;
  privilegeEscalation: PrivilegeEscalationTests;
  
  // Performance and reliability tests
  performanceImpact: RLSPerformanceTests;
  concurrencyTests: ConcurrentAccessTests;
}
```

## Implementation Plan

### Phase 1: Foundation Infrastructure (Week 1)

#### Day 1-2: Core Test Utilities
- Create `RLSTestRunner` class with Supabase integration
- Implement `HealthcareTestDataFactory` for realistic test data
- Set up `UserContextManager` for multi-user test scenarios

#### Day 3-4: Policy Analysis Engine
- Build `PolicyAnalyzer` to extract policies from migration files
- Create policy dependency mapping system
- Implement automated policy discovery and categorization

#### Day 5-7: Basic Test Framework
- Create foundational test patterns for RLS validation
- Implement core assertion helpers for healthcare data access
- Set up test database isolation and cleanup utilities

### Phase 2: Core Policy Testing (Week 2)

#### Day 8-10: Patient Data Isolation Tests
- Test `documents` table policies for patient data isolation
- Validate `patient_conditions` access control
- Test `patient_allergies` and `patient_vitals` policies

#### Day 11-12: Multi-Profile Access Tests
- Test `user_profiles` access control across profile types
- Validate `profile_access_permissions` enforcement
- Test profile switching and authentication level policies

#### Day 13-14: Provider Access Control Tests
- Test `provider_registry` self-access policies
- Validate `patient_provider_access` relationship enforcement
- Test enhanced consent-based provider access

### Phase 3: Compliance and Security Validation (Week 3)

#### Day 15-17: Healthcare Compliance Testing
- Implement HIPAA Technical Safeguards validation
- Create Australian Privacy Act compliance test suite
- Test breach detection and audit trail requirements

#### Day 18-19: Security Boundary Testing
- Test cross-tenant data leakage prevention
- Validate privilege escalation prevention
- Test malicious query injection prevention

#### Day 20-21: Performance and Reporting
- Implement RLS performance impact testing
- Create comprehensive test reporting dashboard
- Generate compliance certification documentation

## Test Implementation Patterns

### Healthcare Data Access Test Pattern

```typescript
class HealthcareDataAccessTest {
  async testPatientDataIsolation() {
    // Create test patients
    const patient1 = await this.createTestPatient();
    const patient2 = await this.createTestPatient();
    
    // Create test documents
    const doc1 = await this.createTestDocument(patient1.id);
    const doc2 = await this.createTestDocument(patient2.id);
    
    // Test Patient 1 can only access their own data
    await this.assertCanAccess(patient1, doc1);
    await this.assertCannotAccess(patient1, doc2);
    
    // Test Patient 2 can only access their own data  
    await this.assertCanAccess(patient2, doc2);
    await this.assertCannotAccess(patient2, doc1);
  }
}
```

### Multi-Profile Access Test Pattern

```typescript
class MultiProfileAccessTest {
  async testParentChildAccess() {
    // Create parent account with child profile
    const parent = await this.createTestUser();
    const childProfile = await this.createChildProfile(parent.id);
    
    // Create test data for child
    const childDocument = await this.createTestDocument(childProfile.patient_id);
    
    // Test parent can access child data via profile relationship
    await this.switchToProfile(parent, childProfile.id);
    await this.assertCanAccess(parent, childDocument);
    
    // Test direct child profile access is blocked
    await this.assertCannotDirectAccess(childProfile.patient_id, childDocument);
  }
}
```

## Compliance Validation Framework

### Australian Privacy Act Requirements

```typescript
class AustralianPrivacyActValidator {
  async validatePrinciple6_UseAndDisclosure() {
    // Test that personal information is only accessible for healthcare purposes
    // Validate that cross-profile access requires explicit consent
    // Test that provider access is limited to treatment purposes
  }
  
  async validatePrinciple11_SecuritySafeguards() {
    // Test that RLS policies prevent unauthorized access
    // Validate that data isolation is maintained under load
    // Test that audit trails capture all access attempts
  }
}
```

### HIPAA Technical Safeguards

```typescript
class HIPAAComplianceValidator {
  async validateAccessControl(policy: RLSPolicy) {
    // Test unique user identification per policy
    // Validate access control based on user roles
    // Test that access is limited to minimum necessary
  }
  
  async validateAuditControls(policy: RLSPolicy) {
    // Test that all data access is logged
    // Validate that audit logs are tamper-resistant
    // Test that policy violations trigger alerts
  }
}
```

## Expected Test Coverage

### Primary Test Scenarios (Must Pass)

| Scenario | Description | Risk Level |
|---|---|---|
| Patient Data Isolation | Patients can only access their own medical data | CRITICAL |
| Profile Switching Security | Profile switching maintains proper data access boundaries | CRITICAL |
| Provider Consent Enforcement | Providers can only access data with valid consent | CRITICAL |
| Cross-Tenant Prevention | User A cannot access User B's data under any circumstance | CRITICAL |

### Secondary Test Scenarios (Should Pass)

| Scenario | Description | Risk Level |
|---|---|---|
| Performance Under Load | RLS policies don't degrade performance significantly | HIGH |
| Concurrent Access Safety | Multiple users can access data safely simultaneously | HIGH |
| Audit Trail Completeness | All data access is properly logged for compliance | HIGH |
| Policy Migration Safety | Database migrations don't create security gaps | MEDIUM |

## Success Criteria

### Technical Success Metrics
- ✅ 100% of 84 RLS policies have automated tests
- ✅ All patient data isolation tests pass
- ✅ All provider access control tests pass
- ✅ Zero cross-tenant data leakage detected
- ✅ Performance impact < 10% overhead

### Compliance Success Metrics
- ✅ Australian Privacy Act compliance validation passes
- ✅ HIPAA Technical Safeguards requirements met
- ✅ Security audit generates clean compliance report
- ✅ Documentation ready for compliance certification

## Risk Mitigation

### Current Risk Assessment
- **CRITICAL**: Untested RLS policies in production healthcare system
- **HIGH**: Potential compliance violations with patient data
- **MEDIUM**: Performance impact of comprehensive policy testing

### Mitigation Strategies
1. **Immediate**: Implement this testing framework in test environment
2. **Short-term**: Validate all critical patient data policies first
3. **Long-term**: Integrate RLS testing into CI/CD pipeline
4. **Ongoing**: Regular compliance audits and policy reviews

## File Structure

```
/Users/xflanagan/Documents/GitHub/Guardian-Cursor/
├── apps/web/__tests__/
│   └── security/
│       ├── rls-policies/
│       │   ├── core-clinical-data.test.ts
│       │   ├── multi-profile-access.test.ts
│       │   ├── provider-access.test.ts
│       │   └── compliance-validation.test.ts
│       ├── utils/
│       │   ├── rls-test-runner.ts
│       │   ├── healthcare-test-data-factory.ts
│       │   └── compliance-validators.ts
│       └── fixtures/
│           ├── test-patients.json
│           ├── test-providers.json
│           └── test-scenarios.json
└── shared/docs/security/
    ├── rls-policy-testing-framework.md (this file)
    ├── compliance-requirements.md
    └── security-audit-procedures.md
```

---

**Next Steps**: Begin Phase 1 implementation with core test utilities and policy analysis engine.

**Document Version**: 1.0  
**Last Updated**: August 18, 2025  
**Responsible**: Guardian Security Team + Healthcare Compliance  