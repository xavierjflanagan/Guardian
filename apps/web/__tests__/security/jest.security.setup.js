/**
 * Jest Security Test Setup - Guardian Healthcare Platform
 * 
 * Global setup for RLS policy security testing
 * Configures test environment for healthcare compliance validation
 */

// Extend Jest matchers for security testing
expect.extend({
  toBeSecurelyIsolated(received, expected) {
    const pass = received.passed === true && received.testType === 'data_isolation'
    
    if (pass) {
      return {
        message: () => `Expected data access to not be securely isolated`,
        pass: true,
      }
    } else {
      return {
        message: () => `Expected data access to be securely isolated, but ${received.error || 'test failed'}`,
        pass: false,
      }
    }
  },
  
  toMeetComplianceRequirements(received, standard) {
    const pass = received.every(result => 
      result.passed === true && result.testType === 'compliance'
    )
    
    if (pass) {
      return {
        message: () => `Expected tests to not meet ${standard} compliance requirements`,
        pass: true,
      }
    } else {
      const failures = received.filter(r => !r.passed)
      return {
        message: () => `Expected all tests to meet ${standard} compliance requirements. Failed tests: ${failures.map(f => f.policyName).join(', ')}`,
        pass: false,
      }
    }
  },
  
  toHaveAcceptablePerformance(received, maxTimeMs = 100) {
    const executionTime = received.executionTimeMs || 0
    const pass = executionTime <= maxTimeMs
    
    if (pass) {
      return {
        message: () => `Expected execution time ${executionTime}ms to exceed ${maxTimeMs}ms`,
        pass: true,
      }
    } else {
      return {
        message: () => `Expected execution time ${executionTime}ms to be under ${maxTimeMs}ms for healthcare responsiveness`,
        pass: false,
      }
    }
  }
})

// Global test utilities
global.createSecurityTestTimeout = (minutes = 5) => {
  return minutes * 60 * 1000 // Convert to milliseconds
}

// Mock console methods for cleaner test output
const originalConsole = { ...console }

beforeAll(() => {
  // Suppress verbose Supabase logs during testing
  console.log = jest.fn()
  console.info = jest.fn()
  console.debug = jest.fn()
  
  // Keep important logs
  console.error = originalConsole.error
  console.warn = originalConsole.warn
})

afterAll(() => {
  // Restore console methods
  console.log = originalConsole.log
  console.info = originalConsole.info
  console.debug = originalConsole.debug
})

// Global test configuration
process.env.NODE_ENV = 'test'

// Increase timeout for database operations
jest.setTimeout(30000)

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit process during tests
})

// Faker.js seed for consistent test data
const { faker } = require('@faker-js/faker')
faker.seed(12345) // Consistent seed for reproducible tests

// Healthcare compliance constants
global.HEALTHCARE_COMPLIANCE = {
  AUSTRALIAN_PRIVACY_ACT: {
    PRINCIPLES: [
      'open_transparent_management',
      'anonymity_pseudonymity', 
      'collection_solicited',
      'dealing_unsolicited',
      'notification',
      'use_disclosure',
      'direct_marketing',
      'cross_border_disclosure',
      'government_related_identifiers',
      'data_quality',
      'security',
      'access_correction',
      'correction'
    ]
  },
  HIPAA: {
    TECHNICAL_SAFEGUARDS: [
      'access_control',
      'audit_controls', 
      'integrity',
      'person_authentication',
      'transmission_security'
    ],
    ADMINISTRATIVE_SAFEGUARDS: [
      'security_officer',
      'workforce_training',
      'information_access_management',
      'security_awareness',
      'security_incident_procedures',
      'contingency_plan',
      'evaluation'
    ]
  }
}

// Performance benchmarks for healthcare applications
global.PERFORMANCE_BENCHMARKS = {
  DATABASE_QUERY_MAX_MS: 100,
  RLS_POLICY_OVERHEAD_MAX_PERCENT: 10,
  CONCURRENT_USER_TARGET: 10,
  AUDIT_LOG_MAX_MS: 50
}

// Test data limits for healthcare compliance
global.TEST_DATA_LIMITS = {
  MAX_PATIENTS_PER_TEST: 10,
  MAX_DOCUMENTS_PER_PATIENT: 20,
  MAX_CONDITIONS_PER_PATIENT: 10,
  DATA_RETENTION_DAYS: 1 // Test data cleanup
}