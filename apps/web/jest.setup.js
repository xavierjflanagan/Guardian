// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Used for __tests__/testing-library.js
// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Healthcare-specific test utilities and mocks
// Track suppressed warnings for testing validation
const suppressedWarnings = [];
const originalWarn = console.warn;

global.console = {
  ...console,
  // uncomment to ignore specific log levels
  // log: jest.fn(),
  debug: jest.fn(),
  // info: jest.fn(),
  warn: (...args) => {
    if (
      args[0]?.includes?.('Event logging rate limit exceeded') ||
      args[0]?.includes?.('Rate limit') ||
      args[0]?.includes?.('HIPAA audit') ||
      args[0]?.includes?.('rate limiting')
    ) {
      suppressedWarnings.push(args[0]);
      return; // Suppress expected healthcare warnings
    }
    originalWarn.apply(console, args);
  },
  // error: jest.fn(),
}

// Expose for testing validation
global.getSuppressedWarnings = () => suppressedWarnings;

// Mock IntersectionObserver for components that might use it
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
  root: null,
  rootMargin: '',
  thresholds: []
}))

// Mock ResizeObserver 
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

// Mock crypto.randomUUID for session IDs and event logging
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn(() => 'mock-uuid-for-testing'),
    subtle: {}
  }
})

// Mock window.matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Global fetch polyfill for server-side operations
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ audit_id: 'mock-audit-id' }),
})

// Healthcare-specific mocks
const mockSupabaseClient = {
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  })),
  auth: {
    getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
  },
  rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
  channel: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
    unsubscribe: jest.fn(),
  })),
}

// Mock Supabase client
jest.mock('@/lib/supabaseClientSSR', () => ({
  createClient: () => mockSupabaseClient,
}))

jest.mock('@/lib/supabaseServerClient', () => ({
  createClient: () => mockSupabaseClient,
}))