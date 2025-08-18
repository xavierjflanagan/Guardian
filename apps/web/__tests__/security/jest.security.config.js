/**
 * Jest Configuration for Guardian RLS Policy Security Tests
 * 
 * Specialized test configuration for Row Level Security policy validation
 * Includes healthcare compliance testing and performance benchmarking
 */

const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './../../', // Point to web app root
})

const customJestConfig = {
  displayName: 'Guardian RLS Security Tests',
  testEnvironment: 'node', // Use Node environment for database testing
  
  // Test file patterns
  testMatch: [
    '<rootDir>/__tests__/security/**/*.test.ts',
    '<rootDir>/__tests__/security/**/*.test.js'
  ],
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/__tests__/security/jest.security.setup.js'
  ],
  
  // Module name mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@guardian/ui$': '<rootDir>/__mocks__/@guardian/ui.js'
  },
  
  // Coverage configuration for security testing
  collectCoverage: true,
  collectCoverageFrom: [
    // Include RLS-related code
    'lib/supabaseClientSSR.ts',
    'lib/supabaseServerClient.ts',
    'lib/hooks/useEventLogging.ts',
    'app/providers/ProfileProvider.tsx',
    
    // Include security test utilities
    '__tests__/security/utils/**/*.ts',
    
    // Exclude non-security files
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**'
  ],
  
  // Coverage thresholds for security tests
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,  
      lines: 80,
      statements: 80
    },
    // Specific thresholds for critical security utilities
    '__tests__/security/utils/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  
  // Coverage reporters
  coverageReporters: [
    'text',
    'lcov', 
    'html',
    'json'
  ],
  
  // Coverage directory
  coverageDirectory: '<rootDir>/coverage/security',
  
  // Test timeout for database operations
  testTimeout: 30000, // 30 seconds for database setup/teardown
  
  // Verbose output for detailed test results
  verbose: true,
  
  // Fail fast on first test failure for security validation
  bail: false, // Continue all tests for comprehensive security validation
  
  // Transform configuration
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        compilerOptions: {
          target: 'es2020',
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          skipLibCheck: true,
          strict: true
        }
      }
    }]
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Global test setup
  globalSetup: '<rootDir>/__tests__/security/globalSetup.js',
  globalTeardown: '<rootDir>/__tests__/security/globalTeardown.js',
  
  // Test environment options
  testEnvironmentOptions: {
    // Node.js environment options for database testing
    node: {
      global: true
    }
  },
  
  // Reporter configuration for security test results
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: '<rootDir>/coverage/security',
      filename: 'security-test-report.html',
      expand: true,
      hideIcon: false,
      pageTitle: 'Guardian RLS Security Test Report'
    }],
    ['jest-junit', {
      outputDirectory: '<rootDir>/coverage/security',
      outputName: 'security-test-results.xml',
      suiteName: 'Guardian RLS Policy Security Tests'
    }]
  ],
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Maximum number of concurrent workers (limit for database testing)
  maxWorkers: 4,
  
  // Retry failed tests once (for database connectivity issues)
  retry: 1,
  
  // Test result processor for healthcare compliance reporting
  testResultsProcessor: '<rootDir>/__tests__/security/complianceReportProcessor.js'
}

module.exports = createJestConfig(customJestConfig)