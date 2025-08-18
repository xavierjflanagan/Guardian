/**
 * Centralized Supabase test mocking utilities
 * Provides consistent, typed mocks for all test files
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// Base mock functions that can be reused
export const createMockSupabaseResponse = <T>(data: T | null = null, error: any = null) => ({
  data,
  error,
})

export const createMockQueryBuilder = () => ({
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue(createMockSupabaseResponse(null)),
})

// Standard Supabase client mock with all methods
export const createMockSupabaseClient = (overrides?: Partial<SupabaseClient>) => ({
  from: jest.fn(() => createMockQueryBuilder()),
  auth: {
    getUser: jest.fn().mockResolvedValue(createMockSupabaseResponse({ user: null })),
    getSession: jest.fn().mockResolvedValue(createMockSupabaseResponse({ 
      session: { 
        access_token: 'mock-access-token',
        user: { id: 'test-user-id' }
      } 
    })),
    signOut: jest.fn().mockResolvedValue(createMockSupabaseResponse(null)),
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe: jest.fn() } }
    })),
  },
  rpc: jest.fn().mockResolvedValue(createMockSupabaseResponse([])),
  channel: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
    unsubscribe: jest.fn(),
  })),
  storage: {
    from: jest.fn(() => ({
      upload: jest.fn().mockResolvedValue(createMockSupabaseResponse({ path: 'test-path' })),
      download: jest.fn().mockResolvedValue(createMockSupabaseResponse(new Blob())),
      remove: jest.fn().mockResolvedValue(createMockSupabaseResponse(null)),
    })),
  },
  ...overrides,
})

// Mock fetch for server-side operations
export const createMockFetch = (responseData: any = { audit_id: 'mock-audit-id' }) => 
  jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(responseData),
  })

// Helper to setup global mocks (fetch now in jest.setup.js)
export const setupGlobalMocks = () => {
  // Mock crypto for consistent UUIDs
  Object.defineProperty(global, 'crypto', {
    value: {
      randomUUID: jest.fn(() => 'test-session-id'),
      subtle: {}
    }
  })
  
  // Mock navigator for consistent user agent
  Object.defineProperty(global.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Test Environment)',
    configurable: true,
  })
}

// Default mock client instance
export const mockSupabaseClient = createMockSupabaseClient()