/**
 * Multi-Profile Access RLS Policy Tests - Guardian Healthcare Platform
 * 
 * Tests Row Level Security policies for Guardian's multi-profile system:
 * - user_profiles (profile management)
 * - profile_access_permissions (cross-profile access)
 * - profile relationships (parent-child, pet owner, etc.)
 * 
 * Ensures proper access control across different profile types while
 * maintaining healthcare data isolation and compliance.
 * 
 * @see shared/docs/architecture/security/rls-policy-testing-framework.md
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { RLSTestRunner } from '../utils/rls-test-runner'
import { HealthcareTestDataFactory, HealthcareTestScenarios } from '../utils/healthcare-test-data-factory'
import type { TestPatientData } from '../utils/healthcare-test-data-factory'

describe('Multi-Profile Access RLS Policies', () => {
  let testRunner: RLSTestRunner
  
  const testConfig = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key',
    enableAuditLogging: true
  }

  beforeAll(async () => {
    testRunner = new RLSTestRunner(testConfig)
  })

  afterAll(async () => {
    await testRunner.cleanup()
  })

  describe('User Profiles Table RLS Policies', () => {
    let parentContext: any
    let testFamily: TestPatientData[]

    beforeEach(async () => {
      // Generate test family
      testFamily = HealthcareTestScenarios.generateMultiProfileScenario().family
      
      // Create parent user context
      const parent = testFamily.find(member => member.profile.profile_type === 'self')!
      parentContext = await testRunner.createTestUser({
        email: parent.email,
        password: 'test-password-123',
        profile_type: 'self',
        display_name: parent.profile.display_name
      })
    })

    it('should allow users to access their own profile', async () => {
      const parentProfile = testFamily[0].profile
      parentProfile.account_owner_id = parentContext.user.id

      const result = await testRunner.testDataAccess(
        parentContext,
        'user_profiles',
        parentProfile,
        'allow'
      )

      expect(result.passed).toBe(true)
      expect(result.tableName).toBe('user_profiles')
      expect(result.testType).toBe('access_control')
    })

    it('should allow account owners to access profiles they created', async () => {
      const childProfile = testFamily.find(m => m.profile.profile_type === 'child')!.profile
      childProfile.account_owner_id = parentContext.user.id

      const result = await testRunner.testDataAccess(
        parentContext,
        'user_profiles',
        childProfile,
        'allow'
      )

      expect(result.passed).toBe(true)
    })

    it('should deny access to profiles owned by other users', async () => {
      // Create another user's profile
      const otherUser = await testRunner.createTestUser({
        email: 'other-user@test.com',
        password: 'test-password-456'
      })

      const otherProfile = {
        id: 'other-profile-id',
        account_owner_id: otherUser.user.id,
        profile_type: 'self' as const,
        display_name: 'Other User',
        patient_id: otherUser.user.id
      }

      const result = await testRunner.testDataAccess(
        parentContext,
        'user_profiles',
        otherProfile,
        'deny'
      )

      expect(result.passed).toBe(true)
    })

    it('should not return archived profiles', async () => {
      const archivedProfile = {
        ...testFamily[0].profile,
        account_owner_id: parentContext.user.id,
        archived: true
      }

      const result = await testRunner.testDataAccess(
        parentContext,
        'user_profiles',
        archivedProfile,
        'deny'
      )

      expect(result.passed).toBe(true)
    })

    it('should support all profile types (self, child, pet, dependent)', async () => {
      const profileTypes = ['self', 'child', 'pet', 'dependent'] as const

      for (const profileType of profileTypes) {
        const testProfile = {
          id: `test-${profileType}-profile`,
          account_owner_id: parentContext.user.id,
          profile_type: profileType,
          display_name: `Test ${profileType} Profile`,
          patient_id: parentContext.user.id,
          archived: false
        }

        const result = await testRunner.testDataAccess(
          parentContext,
          'user_profiles',
          testProfile,
          'allow'
        )

        expect(result.passed).toBe(true)
        expect(result.error).toBeUndefined()
      }
    })
  })

  describe('Profile Access Permissions RLS Policies', () => {
    let parentContext: any
    let childContext: any

    beforeEach(async () => {
      parentContext = await testRunner.createTestUser({
        email: `parent-${Date.now()}@test.com`,
        password: 'test-password-123',
        profile_type: 'self',
        display_name: 'Test Parent'
      })

      childContext = await testRunner.createTestUser({
        email: `child-${Date.now()}@test.com`,
        password: 'test-password-456',
        profile_type: 'child',
        display_name: 'Test Child'
      })
    })

    it('should allow profile owners to manage access permissions', async () => {
      const accessPermission = {
        id: 'test-permission-id',
        granting_profile_id: parentContext.profiles?.[0]?.id || parentContext.user.id,
        granted_to_profile_id: childContext.user.id,
        permission_type: 'read_medical_data',
        granted_at: new Date().toISOString(),
        expires_at: null,
        revoked: false
      }

      // Test that the profile owner can access their permission grants
      const result = await testRunner.testDataAccess(
        parentContext,
        'profile_access_permissions',
        accessPermission,
        'allow'
      )

      expect(result.passed).toBe(true)
    })

    it('should prevent unauthorized access to permission records', async () => {
      const unauthorizedUser = await testRunner.createTestUser({
        email: `unauthorized-${Date.now()}@test.com`,
        password: 'test-password-789'
      })

      const accessPermission = {
        id: 'private-permission-id',
        granting_profile_id: parentContext.user.id,
        granted_to_profile_id: childContext.user.id,
        permission_type: 'read_medical_data'
      }

      const result = await testRunner.testDataAccess(
        unauthorizedUser,
        'profile_access_permissions',
        accessPermission,
        'deny'
      )

      expect(result.passed).toBe(true)
    })
  })

  describe('Cross-Profile Data Access Scenarios', () => {
    let testFamily: TestPatientData[]
    let parentContext: any
    let childContexts: any[]

    beforeEach(async () => {
      testFamily = HealthcareTestScenarios.generateMultiProfileScenario().family
      
      const parent = testFamily.find(member => member.profile.profile_type === 'self')!
      parentContext = await testRunner.createTestUser({
        email: parent.email,
        password: 'parent-password-123',
        profile_type: 'self',
        display_name: parent.profile.display_name
      })

      // Create contexts for children
      childContexts = []
      const children = testFamily.filter(member => member.profile.profile_type === 'child')
      
      for (const child of children) {
        const childContext = await testRunner.createTestUser({
          email: child.email,
          password: 'child-password-123',
          profile_type: 'child',
          display_name: child.profile.display_name
        })
        childContexts.push(childContext)
      }
    })

    it('should allow parents to access child medical data', async () => {
      if (childContexts.length === 0) return

      const childProfile = testFamily.find(m => m.profile.profile_type === 'child')!.profile
      childProfile.account_owner_id = parentContext.user.id

      // Create child document data
      const childDocument = {
        ...testFamily.find(m => m.profile.profile_type === 'child')!.documents[0],
        patient_id: childProfile.patient_id
      }

      const result = await testRunner.testMultiProfileAccess(
        parentContext,
        childProfile,
        'documents',
        childDocument
      )

      expect(result.passed).toBe(true)
      expect(result.policyName).toBe('documents_multi_profile_access')
    })

    it('should prevent children from accessing each other\'s data', async () => {
      if (childContexts.length < 2) return

      const child1Context = childContexts[0]
      const child2Data = testFamily.find(m => m.profile.profile_type === 'child')!

      const child2Document = {
        ...child2Data.documents[0],
        patient_id: childContexts[1].user.id
      }

      const result = await testRunner.testCrossTenantIsolation(
        child1Context,
        childContexts[1],
        'documents',
        child2Document
      )

      expect(result.passed).toBe(true)
      expect(result.testType).toBe('data_isolation')
    })

    it('should handle pet profile access correctly', async () => {
      const petMember = testFamily.find(member => member.profile.profile_type === 'pet')
      if (!petMember) return

      const petProfile = petMember.profile
      petProfile.account_owner_id = parentContext.user.id

      const petDocument = {
        ...petMember.documents[0],
        patient_id: petProfile.patient_id
      }

      const result = await testRunner.testMultiProfileAccess(
        parentContext,
        petProfile,
        'documents',
        petDocument
      )

      expect(result.passed).toBe(true)
    })
  })

  describe('Profile Relationship Validation', () => {
    let parentContext: any

    beforeEach(async () => {
      parentContext = await testRunner.createTestUser({
        email: `relationship-parent-${Date.now()}@test.com`,
        password: 'test-password-123',
        profile_type: 'self',
        display_name: 'Relationship Test Parent'
      })
    })

    it('should validate parent-child relationships', async () => {
      const childProfile = await testRunner.createTestProfile(parentContext, {
        profile_type: 'child',
        display_name: 'Test Child',
        relationship: 'daughter',
        date_of_birth: '2010-05-15'
      })

      expect(childProfile.account_owner_id).toBe(parentContext.user.id)
      expect(childProfile.profile_type).toBe('child')

      // Verify parent can access child profile
      const result = await testRunner.testDataAccess(
        parentContext,
        'user_profiles',
        childProfile,
        'allow'
      )

      expect(result.passed).toBe(true)
    })

    it('should validate pet owner relationships', async () => {
      const petProfile = await testRunner.createTestProfile(parentContext, {
        profile_type: 'pet',
        display_name: 'Fluffy',
        relationship: 'dog'
      })

      expect(petProfile.profile_type).toBe('pet')
      expect(petProfile.account_owner_id).toBe(parentContext.user.id)

      const result = await testRunner.testDataAccess(
        parentContext,
        'user_profiles',
        petProfile,
        'allow'
      )

      expect(result.passed).toBe(true)
    })

    it('should validate dependent relationships', async () => {
      const dependentProfile = await testRunner.createTestProfile(parentContext, {
        profile_type: 'dependent',
        display_name: 'Elderly Parent',
        relationship: 'parent'
      })

      expect(dependentProfile.profile_type).toBe('dependent')
      expect(dependentProfile.account_owner_id).toBe(parentContext.user.id)

      const result = await testRunner.testDataAccess(
        parentContext,
        'user_profiles',
        dependentProfile,
        'allow'
      )

      expect(result.passed).toBe(true)
    })
  })

  describe('Profile Authentication Levels', () => {
    let userContext: any

    beforeEach(async () => {
      userContext = await testRunner.createTestUser({
        email: `auth-levels-${Date.now()}@test.com`,
        password: 'test-password-123'
      })
    })

    it('should respect different authentication levels', async () => {
      const authLevels = ['none', 'soft', 'hard'] as const

      for (const authLevel of authLevels) {
        const testProfile = {
          id: `test-${authLevel}-auth`,
          account_owner_id: userContext.user.id,
          profile_type: 'self' as const,
          display_name: `Test ${authLevel} Auth`,
          auth_level: authLevel,
          patient_id: userContext.user.id,
          archived: false
        }

        const result = await testRunner.testDataAccess(
          userContext,
          'user_profiles',
          testProfile,
          'allow'
        )

        expect(result.passed).toBe(true)
      }
    })
  })

  describe('Profile Transfer Security', () => {
    let originalOwnerContext: any
    let newOwnerContext: any

    beforeEach(async () => {
      originalOwnerContext = await testRunner.createTestUser({
        email: `original-${Date.now()}@test.com`,
        password: 'test-password-123'
      })

      newOwnerContext = await testRunner.createTestUser({
        email: `new-${Date.now()}@test.com`,
        password: 'test-password-456'
      })
    })

    it('should handle profile transfer scenarios securely', async () => {
      // Create profile under original owner
      const transferredProfile = {
        id: 'transferred-profile-id',
        account_owner_id: originalOwnerContext.user.id,
        profile_type: 'child' as const,
        display_name: 'Transferred Child',
        transferred_from: null,
        transferred_to: newOwnerContext.user.id,
        patient_id: originalOwnerContext.user.id,
        archived: false
      }

      // Original owner should still have access during transfer
      const originalAccess = await testRunner.testDataAccess(
        originalOwnerContext,
        'user_profiles',
        transferredProfile,
        'allow'
      )

      expect(originalAccess.passed).toBe(true)

      // New owner should not have access until transfer is complete
      const newOwnerAccess = await testRunner.testDataAccess(
        newOwnerContext,
        'user_profiles',
        transferredProfile,
        'deny'
      )

      expect(newOwnerAccess.passed).toBe(true)
    })
  })

  describe('Healthcare Compliance for Multi-Profile Access', () => {
    let familyContexts: any[]

    beforeEach(async () => {
      const family = HealthcareTestScenarios.generateMultiProfileScenario().family
      familyContexts = []

      for (const member of family) {
        const context = await testRunner.createTestUser({
          email: member.email,
          password: 'family-password-123',
          profile_type: member.profile.profile_type,
          display_name: member.profile.display_name
        })
        familyContexts.push(context)
      }
    })

    it('should maintain HIPAA compliance across profile relationships', async () => {
      const results = await testRunner.runComplianceTests(
        'hipaa_technical',
        familyContexts
      )

      const accessControlResults = results.filter(r => 
        r.policyName.includes('access_control')
      )

      expect(accessControlResults.length).toBeGreaterThan(0)
      expect(accessControlResults.every(r => r.passed)).toBe(true)
    })

    it('should meet Australian Privacy Act requirements for family data', async () => {
      const results = await testRunner.runComplianceTests(
        'australian_privacy_act',
        familyContexts.slice(0, 2) // Test with 2 family members
      )

      expect(results.length).toBeGreaterThan(0)
      expect(results.every(r => r.passed)).toBe(true)
    })
  })

  describe('Concurrent Multi-Profile Access', () => {
    let parentContext: any
    let childProfiles: any[]

    beforeEach(async () => {
      parentContext = await testRunner.createTestUser({
        email: `concurrent-parent-${Date.now()}@test.com`,
        password: 'test-password-123'
      })

      // Create multiple child profiles
      childProfiles = []
      for (let i = 0; i < 3; i++) {
        const childProfile = await testRunner.createTestProfile(parentContext, {
          profile_type: 'child',
          display_name: `Child ${i + 1}`,
          relationship: 'child'
        })
        childProfiles.push(childProfile)
      }
    })

    it('should handle concurrent access to multiple profiles safely', async () => {
      // Concurrent access to all child profiles
      const concurrentResults = await Promise.all(
        childProfiles.map(profile => 
          testRunner.testDataAccess(
            parentContext,
            'user_profiles',
            profile,
            'allow'
          )
        )
      )

      expect(concurrentResults.every(result => result.passed)).toBe(true)
      expect(concurrentResults.every(result => result.error === undefined)).toBe(true)
    })
  })
})