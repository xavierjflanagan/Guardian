import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { useEventLogging } from '@/lib/hooks/useEventLogging'
import { ProfileContext } from '@/app/providers/ProfileProvider'
import type { ProfileContextValue } from '@/app/providers/ProfileProvider'
import { setupGlobalMocks, createMockSupabaseClient } from '../../test-utils/supabase-mocks'

// Mock profile data
const mockProfile = {
  id: 'test-profile-id',
  account_owner_id: 'test-user-id',
  profile_type: 'self',
  display_name: 'Test User',
  archived: false,
  created_at: '2023-01-01T00:00:00Z',
}

// Setup global mocks using centralized utilities (without fetch - now in jest.setup.js)
setupGlobalMocks()

// Create persistent mock functions for tracking calls
const mockInsert = jest.fn().mockResolvedValue({ data: null, error: null })
const mockFrom = jest.fn().mockReturnValue({ insert: mockInsert })

// Create Supabase client with our custom insert tracking
const mockSupabaseClient = createMockSupabaseClient({
  from: mockFrom,
})

// Mock useProfile hook before any imports
jest.mock('@/app/providers/ProfileProvider', () => ({
  ...jest.requireActual('@/app/providers/ProfileProvider'),
  useProfile: jest.fn(),
}))

// Get reference to the mocked function
import { useProfile } from '@/app/providers/ProfileProvider'
const mockUseProfile = useProfile as jest.MockedFunction<typeof useProfile>

jest.mock('@/lib/supabaseClientSSR', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}))

// Helper function to create ProfileContextValue with all required properties
const createMockProfileContextValue = (overrides?: Partial<ProfileContextValue>): ProfileContextValue => ({
  currentProfile: mockProfile,
  profiles: [mockProfile],
  allowedPatients: [],
  switchProfile: jest.fn(),
  refreshProfiles: jest.fn(),
  isLoading: false,
  error: null,
  isSwitchingProfile: false,
  lastSwitchTime: null,
  switchPerformance: { averageSwitchTime: 0, totalSwitches: 0 },
  prefetchAllowedPatients: jest.fn(),
  ...overrides,
})

// Helper function to create a test wrapper with ProfileContext
const createTestWrapper = (contextValue?: Partial<ProfileContextValue>) => {
  const value = createMockProfileContextValue(contextValue)
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(ProfileContext.Provider, { value }, children)
}

// Helper function to render hook with profile context and reset rate limit
const renderHookWithContext = (contextOverrides?: Partial<ProfileContextValue>) => {
  const Wrapper = createTestWrapper(contextOverrides)
  const { result } = renderHook(() => useEventLogging(), { wrapper: Wrapper })
  
  // Reset rate limiter for clean slate - use synchronous act
  act(() => {
    result.current.resetRateLimit()
  })
  
  return { result }
}

describe('useEventLogging', () => {
  beforeEach(() => {
    // Clear database mocks
    mockInsert.mockClear()
    mockFrom.mockClear()
    
    // Set up mock useProfile return value
    mockUseProfile.mockReturnValue(createMockProfileContextValue())
    
    // Ensure consistent session ID
    ;(global.crypto.randomUUID as jest.Mock).mockReturnValue('test-session-id')
    
    // Silence expected console outputs for clean test logs
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    // Restore console methods
    jest.restoreAllMocks()
  })

  it('should log events with correct structure', async () => {
    const { result } = renderHookWithContext()

    await act(async () => {
      await result.current.logEvent('navigation', 'page_view', { page: '/dashboard' })
    })

    expect(mockFrom).toHaveBeenCalledWith('user_events')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'navigation.page_view',
        privacy_level: 'internal',
        profile_id: mockProfile.id,
        session_id: 'test-session-id',
        metadata: expect.objectContaining({
          page: '/dashboard',
          category: 'navigation',
          user_agent: 'Mozilla/5.0 (Test Environment)',
          timestamp: expect.any(String),
        }),
      })
    )
  })

  it('should sanitize PII from metadata', async () => {
    const { result } = renderHookWithContext()

    const metadataWithPII = {
      page: '/dashboard',
      email: 'sensitive@example.com',
      phone: '555-1234',
      ssn: '123-45-6789',
      name: 'John Doe',
      safe_data: 'this is fine',
    }

    await act(async () => {
      await result.current.logEvent('interaction', 'form_submit', metadataWithPII)
    })

    const insertCall = mockInsert.mock.calls[0][0]
    
    // PII fields should be removed
    expect(insertCall.metadata).not.toHaveProperty('email')
    expect(insertCall.metadata).not.toHaveProperty('phone')
    expect(insertCall.metadata).not.toHaveProperty('ssn')
    expect(insertCall.metadata).not.toHaveProperty('name')
    
    // Safe data should remain
    expect(insertCall.metadata.safe_data).toBe('this is fine')
  })

  it('should truncate long strings to prevent data leaks', async () => {
    const { result } = renderHookWithContext()

    const longString = 'A'.repeat(300) // 300 characters
    
    await act(async () => {
      await result.current.logEvent('system', 'error', { long_field: longString })
    })

    const insertCall = mockInsert.mock.calls[0][0]
    expect(insertCall.metadata.long_field).toHaveLength(214) // 200 + "...[truncated]"
    expect(insertCall.metadata.long_field).toContain('...[truncated]')
  })

  it('should provide convenience methods for different event categories', async () => {
    const { result } = renderHookWithContext()

    // Test navigation logging
    await act(async () => {
      await result.current.logNavigation('tab_switch', { from: 'dashboard', to: 'documents' })
    })

    expect(mockInsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'navigation.tab_switch',
        privacy_level: 'internal',
      })
    )

    // Test data access logging with non-critical event (should be sensitive and use client-side)
    await act(async () => {
      await result.current.logDataAccess('search', { query: 'test' })
    })

    expect(mockInsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'data_access.search',
        privacy_level: 'sensitive',
      })
    )

    // Test system logging (should be public)
    await act(async () => {
      await result.current.logSystem('app_start', { version: '1.0.0' })
    })

    expect(mockInsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'system.app_start',
        privacy_level: 'public',
      })
    )
  })

  it('should implement rate limiting', async () => {
    const { result } = renderHookWithContext()

    // Should allow logging initially
    expect(result.current.canLog()).toBe(true)

    // Simulate rapid event logging (over rate limit of 100/minute)
    for (let i = 0; i < 101; i++) {
      await act(async () => {
        await result.current.logEvent('system', 'rapid_event', { count: i })
      })
    }

    // After rate limit, should not allow more logging
    expect(result.current.canLog()).toBe(false)
    
    // Should have logged less than or equal to 100 events (rate limit enforced)
    expect(mockInsert.mock.calls.length).toBeLessThanOrEqual(100)
    expect(mockInsert.mock.calls.length).toBeGreaterThan(0)
  })

  it('should handle database errors gracefully', async () => {
    const { result } = renderHookWithContext()

    // Mock database error
    mockInsert.mockRejectedValueOnce(new Error('DB Error'))

    // Should not throw error
    await act(async () => {
      await expect(
        result.current.logEvent('system', 'failing_event', {})
      ).resolves.not.toThrow()
    })
  })

  it('should not log when no current profile', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    // Override the mockUseProfile to return null currentProfile
    mockUseProfile.mockReturnValueOnce(createMockProfileContextValue({ currentProfile: null }))
    
    const { result } = renderHook(() => useEventLogging())

    await act(async () => {
      await result.current.logEvent('system', 'no_profile_event', {})
    })

    // Should not attempt to insert
    expect(mockInsert).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('Healthcare compliance for event logging', () => {
  beforeEach(() => {
    // Clear database mocks
    mockInsert.mockClear()
    mockFrom.mockClear()
    
    // Set up mock useProfile return value
    mockUseProfile.mockReturnValue(createMockProfileContextValue())
    
    // Ensure consistent session ID
    ;(global.crypto.randomUUID as jest.Mock).mockReturnValue('test-session-id')
  })

  it('should maintain session consistency for audit trails', async () => {
    const { result } = renderHookWithContext()

    // Log multiple non-critical events in same session (critical events go to server-side)
    await act(async () => {
      await result.current.logDataAccess('search', { query: 'test-1' })
      await result.current.logDataAccess('filter', { type: 'medical' })
    })

    const calls = mockInsert.mock.calls
    
    // Should have 2 successful calls
    expect(calls).toHaveLength(2)
    
    // Both events should have same session ID for audit trail
    expect(calls[0][0].session_id).toBe(calls[1][0].session_id)
    expect(calls[0][0].session_id).toBe('test-session-id')
  })

  it('should categorize healthcare events with appropriate privacy levels', async () => {
    const { result } = renderHookWithContext()

    const testCases = [
      { method: 'logNavigation', expectedPrivacy: 'internal', params: ['tab_switch', {}] },
      { method: 'logInteraction', expectedPrivacy: 'internal', params: ['button_click', {}] },
      { method: 'logDataAccess', expectedPrivacy: 'sensitive', params: ['search', {}] }, // Use non-critical event
      { method: 'logProfile', expectedPrivacy: 'internal', params: ['view_profile', {}] }, // Use non-critical event
      { method: 'logSystem', expectedPrivacy: 'public', params: ['app_start', {}] },
    ]

    for (const { method, params } of testCases) {
      await act(async () => {
        await (result.current as any)[method](...params)
      })
    }

    // Should have 5 calls, one for each method
    expect(mockInsert.mock.calls).toHaveLength(5)
    
    // Check each call's privacy level
    testCases.forEach(({ expectedPrivacy }, index) => {
      const currentCall = mockInsert.mock.calls[index][0]
      expect(currentCall.privacy_level).toBe(expectedPrivacy)
    })
  })
})