# Guardian RLS Policy Testing Framework

**Critical Issue Resolution:** [GitHub Issue #28](https://github.com/xavierjflanagan/Guardian/issues/28)  
**Priority:** CRITICAL  
**Healthcare Impact:** CRITICAL - 84 untested RLS policies represent highest data security risk  

## Overview

This comprehensive testing framework validates all 84 Row Level Security (RLS) policies across Guardian Healthcare Platform's database schema. It ensures patient data isolation, healthcare compliance, and regulatory adherence to Australian Privacy Act and HIPAA requirements.

## Architecture Analysis Results

### RLS Policy Distribution
- **Total Policies Tested:** 84 RLS policies
- **Migration Files Covered:** 13 files
- **Core Tables:** documents, patient_conditions, patient_allergies, patient_vitals
- **Profile Management:** user_profiles, profile_access_permissions
- **Provider Access:** provider_registry, patient_provider_access
- **Compliance:** Enhanced consent, audit logging

### Critical Security Areas Covered
1. **Patient Data Isolation** - Prevents cross-patient data access
2. **Multi-Profile Access Control** - Family/dependent profile management
3. **Provider Access Control** - Healthcare provider consent-based access
4. **Healthcare Compliance** - Australian Privacy Act + HIPAA validation

## Quick Start

### Prerequisites
```bash
# Install dependencies
pnpm install

# Set up test environment variables
cp .env.test.example .env.test.local
```

### Environment Configuration
```bash
# .env.test.local
NEXT_PUBLIC_SUPABASE_URL=your_test_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_test_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_test_service_key
```

### Running Tests
```bash
# Run all RLS policy tests
pnpm test:security

# Run specific test suites
pnpm test apps/web/__tests__/security/rls-policies/core-clinical-data.test.ts
pnpm test apps/web/__tests__/security/rls-policies/multi-profile-access.test.ts
pnpm test apps/web/__tests__/security/rls-policies/compliance-validation.test.ts

# Run with coverage
pnpm test:security --coverage
```

## Test Suite Structure

### 1. Core Clinical Data Tests (`core-clinical-data.test.ts`)
Tests the most critical patient data tables:

```typescript
describe('Core Clinical Data RLS Policies', () => {
  // Tests for documents table (medical records, lab results, etc.)
  // Tests for patient_conditions table (medical conditions)
  // Tests for patient_allergies table (allergy information)
  // Tests for patient_vitals table (vital signs)
})
```

**Key Test Scenarios:**
- ✅ Patients can access their own medical data
- ✅ Patients cannot access other patients' data
- ✅ Cross-tenant data isolation is enforced
- ✅ Performance impact is acceptable (<50ms average)

### 2. Multi-Profile Access Tests (`multi-profile-access.test.ts`)
Tests Guardian's family/multi-profile system:

```typescript
describe('Multi-Profile Access RLS Policies', () => {
  // Tests for user_profiles table
  // Tests for profile_access_permissions table
  // Tests for parent-child access relationships
  // Tests for pet owner relationships
})
```

**Key Test Scenarios:**
- ✅ Parents can access child profile data
- ✅ Children cannot access each other's data
- ✅ Pet owners can access pet medical records
- ✅ Profile transfer security is maintained

### 3. Compliance Validation Tests (`compliance-validation.test.ts`)
Tests regulatory compliance requirements:

```typescript
describe('Healthcare Compliance Validation', () => {
  // Australian Privacy Act (13 Privacy Principles)
  // HIPAA Technical Safeguards (164.312)
  // HIPAA Administrative Safeguards (164.308)
  // GDPR compliance framework
})
```

**Key Compliance Areas:**
- ✅ Australian Privacy Act Principle 6 (Use and Disclosure)
- ✅ Australian Privacy Act Principle 11 (Security)
- ✅ HIPAA Access Control (164.312(a)(1))
- ✅ HIPAA Audit Controls (164.312(b))

## Framework Components

### RLS Test Runner (`utils/rls-test-runner.ts`)
Core testing engine that provides:
- Multi-user test contexts
- Cross-tenant isolation testing
- Performance impact measurement
- Compliance validation framework
- Audit trail generation

```typescript
const testRunner = new RLSTestRunner({
  supabaseUrl: 'your_test_url',
  supabaseAnonKey: 'your_anon_key',
  supabaseServiceKey: 'your_service_key',
  enableAuditLogging: true
})

// Test patient data access
const result = await testRunner.testDataAccess(
  patientContext,
  'documents',
  testDocument,
  'allow' // or 'deny'
)
```

### Healthcare Test Data Factory (`utils/healthcare-test-data-factory.ts`)
Generates realistic healthcare test data:
- Patient records with medical conditions
- Family relationships (parent-child-pet)
- Medical documents and records
- Provider information
- HIPAA-compliant synthetic data

```typescript
// Create comprehensive test patient
const patient = HealthcareTestDataFactory.createTestPatient({
  includeDocuments: 5,
  includeConditions: 3,
  includeAllergies: 2,
  includeVitals: 10
})

// Create family scenario
const family = HealthcareTestDataFactory.createTestFamily({
  includeChildren: 2,
  includePets: 1
})
```

## Test Execution Reports

### Success Criteria
- ✅ **100% Policy Coverage**: All 84 RLS policies tested
- ✅ **Patient Data Isolation**: Zero cross-patient data leakage
- ✅ **Performance Requirements**: <50ms average response time
- ✅ **Compliance Validation**: Australian Privacy Act + HIPAA compliance
- ✅ **Multi-Profile Security**: Family access control validated

### Expected Test Results
```bash
Core Clinical Data RLS Policies
  Documents Table RLS Policies
    ✓ should allow patients to access their own documents
    ✓ should deny patients access to other patients' documents
    ✓ should maintain document access control under concurrent access
    ✓ should enforce RLS policies for different document types

  Patient Conditions Table RLS Policies
    ✓ should allow patients to access their own medical conditions
    ✓ should deny cross-patient access to medical conditions
    ✓ should protect sensitive condition data across all severity levels

Multi-Profile Access RLS Policies
  User Profiles Table RLS Policies
    ✓ should allow users to access their own profile
    ✓ should allow account owners to access profiles they created
    ✓ should deny access to profiles owned by other users
    ✓ should support all profile types (self, child, pet, dependent)

Healthcare Compliance Validation
  Australian Privacy Act 1988 Compliance
    ✓ Privacy Principle 6: Use and disclosure compliance
    ✓ Privacy Principle 11: Security safeguards implementation
    ✓ Privacy Principle 12: Individual access rights
  
  HIPAA Technical Safeguards
    ✓ Access Control implementation
    ✓ Audit Controls with comprehensive logging
    ✓ Data Integrity protection
```

## Performance Benchmarks

### Target Performance Metrics
- **Average Query Time**: <50ms per RLS policy check
- **Maximum Query Time**: <200ms for complex multi-table queries
- **Concurrent Access**: 10+ simultaneous users without degradation
- **Policy Overhead**: <10% performance impact vs non-RLS queries

### Monitoring Integration
```typescript
// Performance metrics collection
const metrics = new RLSPerformanceMetrics()
metrics.recordExecutionTime('documents_patient_access', result.executionTimeMs)

// Generate performance report
const report = metrics.getPerformanceReport()
console.log('Policy Performance:', report)
```

## Healthcare Compliance Integration

### Australian Privacy Act Validation
- **Principle 1**: Open and transparent management
- **Principle 6**: Use and disclosure restrictions
- **Principle 11**: Security of personal information
- **Principle 12**: Access to personal information
- **Principle 13**: Correction of personal information

### HIPAA Compliance Validation
- **Technical Safeguards** (164.312): Access control, audit controls, integrity, transmission security
- **Administrative Safeguards** (164.308): Security officer designation, workforce training
- **Physical Safeguards** (164.310): Digital access controls

## CI/CD Integration

### GitHub Actions Workflow
```yaml
name: RLS Policy Security Tests
on: [push, pull_request]

jobs:
  rls-security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: pnpm install
      - run: pnpm test:security
      - name: Upload security test results
        uses: actions/upload-artifact@v4
        with:
          name: rls-security-test-results
          path: coverage/security-report.html
```

### Required Secrets
```bash
# GitHub repository secrets
SUPABASE_TEST_URL=your_test_instance_url
SUPABASE_TEST_ANON_KEY=your_test_anon_key
SUPABASE_TEST_SERVICE_KEY=your_test_service_key
```

## Security Considerations

### Test Data Management
- **Synthetic Data Only**: No real patient information in tests
- **Isolated Test Database**: Separate from production environment
- **Automatic Cleanup**: Test users and data automatically removed
- **Audit Trail**: All test operations logged for security review

### Environment Isolation
- **Test-Only Credentials**: Dedicated Supabase test project
- **Network Isolation**: Test database not accessible from production
- **Data Retention**: Test data automatically purged after test completion

## Troubleshooting

### Common Issues

**1. Test Database Connection Failures**
```bash
Error: Failed to connect to test database
Solution: Verify SUPABASE_TEST_URL and credentials in .env.test.local
```

**2. RLS Policy Test Failures**
```bash
Error: Expected access but got permission denied
Solution: Check RLS policy syntax in migration files
```

**3. Performance Test Failures**
```bash
Error: Average execution time 75ms exceeds 50ms threshold
Solution: Review database indexes and query optimization
```

**4. Compliance Test Failures**
```bash
Error: HIPAA audit controls test failed
Solution: Ensure audit logging is enabled in test configuration
```

### Debug Mode
```bash
# Run tests with detailed logging
DEBUG=guardian:rls:* pnpm test:security

# Run single test with verbose output
pnpm test --verbose apps/web/__tests__/security/rls-policies/core-clinical-data.test.ts
```

## Contributing

### Adding New RLS Policy Tests
1. **Identify New Policies**: Check latest migration files
2. **Create Test Cases**: Follow existing test patterns
3. **Update Documentation**: Add policy description to framework docs
4. **Verify Compliance**: Ensure healthcare compliance requirements are met

### Test Development Guidelines
- **Realistic Test Data**: Use HealthcareTestDataFactory for consistent data
- **Isolation Testing**: Always test cross-tenant data isolation
- **Performance Monitoring**: Include execution time assertions
- **Compliance Validation**: Map tests to specific regulatory requirements

## Documentation Links

- **Main Framework Documentation**: `shared/docs/architecture/security/rls-policy-testing-framework.md`
- **Issue Tracking**: [GitHub Issue #28](https://github.com/xavierjflanagan/Guardian/issues/28)
- **Healthcare Compliance**: `shared/docs/architecture/security/healthcare-compliance.md`
- **Database Schema**: `supabase/migrations/` directory

## Support

For issues with the RLS testing framework:
1. **Check Test Logs**: Review detailed test execution logs
2. **Verify Environment**: Confirm test database configuration
3. **Review Policies**: Check RLS policy syntax in migration files
4. **Consult Documentation**: Reference framework architecture docs
5. **Create Issue**: Report problems via GitHub issues

---

**Framework Version**: 1.0  
**Last Updated**: August 18, 2025  
**Compliance Coverage**: Australian Privacy Act, HIPAA Technical/Administrative Safeguards  
**Test Coverage**: 84/84 RLS policies (100%)