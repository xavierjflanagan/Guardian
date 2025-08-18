/**
 * Core Clinical Data RLS Policy Tests - Guardian Healthcare Platform
 * 
 * Tests Row Level Security policies for core clinical tables:
 * - documents (medical records, lab results, etc.)
 * - patient_conditions (medical conditions)
 * - patient_allergies (allergy information)
 * - patient_vitals (vital signs data)
 * 
 * These tests ensure patient data isolation and healthcare compliance
 * as required by Australian Privacy Act and HIPAA regulations.
 * 
 * @see shared/docs/architecture/security/rls-policy-testing-framework.md
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { RLSTestRunner } from '../utils/rls-test-runner'
import { HealthcareTestDataFactory, type TestPatientData } from '../utils/healthcare-test-data-factory'

describe('Core Clinical Data RLS Policies', () => {
  let testRunner: RLSTestRunner
  let patient1: TestPatientData
  let patient2: TestPatientData
  
  // Test configuration
  const testConfig = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key',
    enableAuditLogging: true
  }

  beforeAll(async () => {
    testRunner = new RLSTestRunner(testConfig)
    
    // Create two separate test patients for isolation testing
    patient1 = HealthcareTestDataFactory.createTestPatient({
      includeDocuments: 3,
      includeConditions: 2,
      includeAllergies: 2,
      includeVitals: 5
    })
    
    patient2 = HealthcareTestDataFactory.createTestPatient({
      includeDocuments: 3,
      includeConditions: 2,
      includeAllergies: 2,
      includeVitals: 5
    })
  })

  afterAll(async () => {
    await testRunner.cleanup()
  })

  describe('Documents Table RLS Policies', () => {
    let patient1Context: any
    let patient2Context: any

    beforeEach(async () => {
      // Create authenticated user contexts
      patient1Context = await testRunner.createTestUser({
        email: patient1.email,
        password: 'test-password-123',
        profile_type: 'self',
        display_name: patient1.profile.display_name
      })

      patient2Context = await testRunner.createTestUser({
        email: patient2.email,
        password: 'test-password-456',
        profile_type: 'self',
        display_name: patient2.profile.display_name
      })
    })

    it('should allow patients to access their own documents', async () => {
      // Insert test document for patient 1
      const testDoc = patient1.documents[0]
      testDoc.patient_id = patient1Context.user.id

      const result = await testRunner.testDataAccess(
        patient1Context,
        'documents',
        testDoc,
        'allow'
      )

      expect(result.passed).toBe(true)
      expect(result.error).toBeUndefined()
      expect(result.testType).toBe('access_control')
    })

    it('should deny patients access to other patients\' documents', async () => {
      // Patient 1 tries to access Patient 2's document
      const testDoc = patient2.documents[0]
      testDoc.patient_id = patient2Context.user.id

      const result = await testRunner.testCrossTenantIsolation(
        patient1Context,
        patient2Context,
        'documents',
        testDoc
      )

      expect(result.passed).toBe(true)
      expect(result.testType).toBe('data_isolation')
    })

    it('should maintain document access control under concurrent access', async () => {
      const testDoc1 = patient1.documents[1]
      testDoc1.patient_id = patient1Context.user.id

      const testDoc2 = patient2.documents[1]
      testDoc2.patient_id = patient2Context.user.id

      // Concurrent access test
      const [result1, result2] = await Promise.all([
        testRunner.testDataAccess(patient1Context, 'documents', testDoc1, 'allow'),
        testRunner.testDataAccess(patient2Context, 'documents', testDoc2, 'allow')
      ])

      expect(result1.passed).toBe(true)
      expect(result2.passed).toBe(true)
    })

    it('should enforce RLS policies for different document types', async () => {
      const documentTypes = ['medical_record', 'lab_result', 'prescription', 'imaging_report']
      
      for (const docType of documentTypes) {
        const testDoc = {
          ...patient1.documents[0],
          id: `test-${docType}-${Date.now()}`,
          patient_id: patient1Context.user.id,
          document_type: docType
        }

        const result = await testRunner.testDataAccess(
          patient1Context,
          'documents',
          testDoc,
          'allow'
        )

        expect(result.passed).toBe(true)
        expect(result.error).toBeUndefined()
      }
    })
  })

  describe('Patient Conditions Table RLS Policies', () => {
    let patient1Context: any
    let patient2Context: any

    beforeEach(async () => {
      patient1Context = await testRunner.createTestUser({
        email: `conditions1-${Date.now()}@test.com`,
        password: 'test-password-123'
      })

      patient2Context = await testRunner.createTestUser({
        email: `conditions2-${Date.now()}@test.com`,
        password: 'test-password-456'
      })
    })

    it('should allow patients to access their own medical conditions', async () => {
      const testCondition = patient1.conditions[0]
      testCondition.patient_id = patient1Context.user.id

      const result = await testRunner.testDataAccess(
        patient1Context,
        'patient_conditions',
        testCondition,
        'allow'
      )

      expect(result.passed).toBe(true)
      expect(result.tableName).toBe('patient_conditions')
    })

    it('should deny cross-patient access to medical conditions', async () => {
      const testCondition = patient1.conditions[0]
      testCondition.patient_id = patient1Context.user.id

      const result = await testRunner.testCrossTenantIsolation(
        patient1Context,
        patient2Context,
        'patient_conditions',
        testCondition
      )

      expect(result.passed).toBe(true)
      expect(result.testType).toBe('data_isolation')
    })

    it('should protect sensitive condition data across all severity levels', async () => {
      const severityLevels = ['mild', 'moderate', 'severe', 'critical']
      
      for (const severity of severityLevels) {
        const testCondition = {
          ...patient1.conditions[0],
          id: `test-condition-${severity}-${Date.now()}`,
          patient_id: patient1Context.user.id,
          severity: severity as any
        }

        const result = await testRunner.testDataAccess(
          patient1Context,
          'patient_conditions',
          testCondition,
          'allow'
        )

        expect(result.passed).toBe(true)
        expect(result.error).toBeUndefined()
      }
    })
  })

  describe('Patient Allergies Table RLS Policies', () => {
    let patient1Context: any
    let patient2Context: any

    beforeEach(async () => {
      patient1Context = await testRunner.createTestUser({
        email: `allergies1-${Date.now()}@test.com`,
        password: 'test-password-123'
      })

      patient2Context = await testRunner.createTestUser({
        email: `allergies2-${Date.now()}@test.com`,
        password: 'test-password-456'
      })
    })

    it('should allow patients to access their own allergy information', async () => {
      const testAllergy = patient1.allergies[0]
      testAllergy.patient_id = patient1Context.user.id

      const result = await testRunner.testDataAccess(
        patient1Context,
        'patient_allergies',
        testAllergy,
        'allow'
      )

      expect(result.passed).toBe(true)
    })

    it('should prevent unauthorized access to allergy data', async () => {
      const testAllergy = patient1.allergies[0]
      testAllergy.patient_id = patient1Context.user.id

      const result = await testRunner.testCrossTenantIsolation(
        patient1Context,
        patient2Context,
        'patient_allergies',
        testAllergy
      )

      expect(result.passed).toBe(true)
      expect(result.testType).toBe('data_isolation')
    })

    it('should protect critical allergy information for all categories', async () => {
      const allergyCategories = ['medication', 'food', 'environmental']
      
      for (const category of allergyCategories) {
        const testAllergy = {
          ...patient1.allergies[0],
          id: `test-allergy-${category}-${Date.now()}`,
          patient_id: patient1Context.user.id,
          allergen_category: category
        }

        const result = await testRunner.testDataAccess(
          patient1Context,
          'patient_allergies',
          testAllergy,
          'allow'
        )

        expect(result.passed).toBe(true)
      }
    })
  })

  describe('Patient Vitals Table RLS Policies', () => {
    let patient1Context: any
    let patient2Context: any

    beforeEach(async () => {
      patient1Context = await testRunner.createTestUser({
        email: `vitals1-${Date.now()}@test.com`,
        password: 'test-password-123'
      })

      patient2Context = await testRunner.createTestUser({
        email: `vitals2-${Date.now()}@test.com`,
        password: 'test-password-456'
      })
    })

    it('should allow patients to access their own vital signs', async () => {
      const testVital = patient1.vitals[0]
      testVital.patient_id = patient1Context.user.id

      const result = await testRunner.testDataAccess(
        patient1Context,
        'patient_vitals',
        testVital,
        'allow'
      )

      expect(result.passed).toBe(true)
    })

    it('should prevent cross-patient access to vital signs', async () => {
      const testVital = patient1.vitals[0]
      testVital.patient_id = patient1Context.user.id

      const result = await testRunner.testCrossTenantIsolation(
        patient1Context,
        patient2Context,
        'patient_vitals',
        testVital
      )

      expect(result.passed).toBe(true)
    })

    it('should maintain access control for all vital sign types', async () => {
      const vitalTypes = ['blood_pressure_systolic', 'heart_rate', 'temperature', 'weight']
      
      for (const vitalType of vitalTypes) {
        const testVital = {
          ...patient1.vitals[0],
          id: `test-vital-${vitalType}-${Date.now()}`,
          patient_id: patient1Context.user.id,
          vital_type: vitalType
        }

        const result = await testRunner.testDataAccess(
          patient1Context,
          'patient_vitals',
          testVital,
          'allow'
        )

        expect(result.passed).toBe(true)
      }
    })
  })

  describe('Performance Impact Assessment', () => {
    let patient1Context: any

    beforeEach(async () => {
      patient1Context = await testRunner.createTestUser({
        email: `performance-${Date.now()}@test.com`,
        password: 'test-password-123'
      })
    })

    it('should maintain acceptable performance with RLS policies enabled', async () => {
      const testDoc = patient1.documents[0]
      testDoc.patient_id = patient1Context.user.id

      // Run multiple iterations to get average performance
      const iterations = 10
      const results = []

      for (let i = 0; i < iterations; i++) {
        const result = await testRunner.testDataAccess(
          patient1Context,
          'documents',
          testDoc,
          'allow'
        )
        results.push(result)
      }

      // Calculate average execution time
      const avgExecutionTime = results.reduce((sum, result) => {
        return sum + (result.executionTimeMs || 0)
      }, 0) / iterations

      // Performance should be under 100ms average for healthcare responsiveness
      expect(avgExecutionTime).toBeLessThan(100)
      expect(results.every(r => r.passed)).toBe(true)
    })
  })

  describe('Healthcare Compliance Validation', () => {
    let patient1Context: any
    let patient2Context: any

    beforeEach(async () => {
      patient1Context = await testRunner.createTestUser({
        email: `compliance1-${Date.now()}@test.com`,
        password: 'test-password-123'
      })

      patient2Context = await testRunner.createTestUser({
        email: `compliance2-${Date.now()}@test.com`,
        password: 'test-password-456'
      })
    })

    it('should meet Australian Privacy Act Principle 6 (Use and Disclosure)', async () => {
      const results = await testRunner.runComplianceTests(
        'australian_privacy_act',
        [patient1Context, patient2Context]
      )

      const principle6Results = results.filter(r => 
        r.policyName.includes('privacy_act_principle_6')
      )

      expect(principle6Results.length).toBeGreaterThan(0)
      expect(principle6Results.every(r => r.passed)).toBe(true)
    })

    it('should meet Australian Privacy Act Principle 11 (Security)', async () => {
      const results = await testRunner.runComplianceTests(
        'australian_privacy_act',
        [patient1Context, patient2Context]
      )

      const principle11Results = results.filter(r => 
        r.policyName.includes('privacy_act_principle_11')
      )

      expect(principle11Results.length).toBeGreaterThan(0)
      expect(principle11Results.every(r => r.passed)).toBe(true)
    })

    it('should meet HIPAA Technical Safeguards (Access Control)', async () => {
      const results = await testRunner.runComplianceTests(
        'hipaa_technical',
        [patient1Context, patient2Context]
      )

      const accessControlResults = results.filter(r => 
        r.policyName.includes('hipaa_technical_access_control')
      )

      expect(accessControlResults.length).toBeGreaterThan(0)
      expect(accessControlResults.every(r => r.passed)).toBe(true)
    })

    it('should maintain audit trail for compliance reporting', async () => {
      const results = await testRunner.runComplianceTests(
        'hipaa_technical',
        [patient1Context]
      )

      const auditResults = results.filter(r => 
        r.policyName.includes('hipaa_technical_audit_controls')
      )

      expect(auditResults.length).toBeGreaterThan(0)
      // Audit logging should be enabled for healthcare compliance
      expect(auditResults[0].passed).toBe(true)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    let patient1Context: any

    beforeEach(async () => {
      patient1Context = await testRunner.createTestUser({
        email: `edge-cases-${Date.now()}@test.com`,
        password: 'test-password-123'
      })
    })

    it('should handle null patient_id gracefully', async () => {
      const testDoc = {
        ...patient1.documents[0],
        patient_id: null as any
      }

      const result = await testRunner.testDataAccess(
        patient1Context,
        'documents',
        testDoc,
        'deny'
      )

      expect(result.passed).toBe(true)
    })

    it('should handle non-existent document access attempts', async () => {
      const nonExistentDoc = {
        id: 'non-existent-document-id',
        patient_id: patient1Context.user.id
      }

      const result = await testRunner.testDataAccess(
        patient1Context,
        'documents',
        nonExistentDoc,
        'deny'
      )

      expect(result.passed).toBe(true)
    })

    it('should prevent SQL injection attempts through RLS policies', async () => {
      const maliciousDoc = {
        id: "'; DROP TABLE documents; --",
        patient_id: patient1Context.user.id
      }

      // This should be blocked by RLS and parameter sanitization
      const result = await testRunner.testDataAccess(
        patient1Context,
        'documents',
        maliciousDoc,
        'deny'
      )

      expect(result.passed).toBe(true)
    })
  })
})