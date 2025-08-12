import { renderHook, act, waitFor } from '@testing-library/react'
import { useEventLogging } from '@/lib/hooks/useEventLogging'
import { ProfileProvider } from '@/app/providers/ProfileProvider'
import { ReactNode } from 'react'

// Mock profile data
const mockProfile = {
  id: 'test-profile-id',
  account_owner_id: 'test-user-id',
  profile_type: 'self',
  display_name: 'Test User',
  archived: false,
  created_at: '2023-01-01T00:00:00Z',
}

// Mock crypto.randomUUID for consistent session IDs
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn().mockReturnValue('test-session-id'),
  },
})

// Mock navigator.userAgent for consistent test results
Object.defineProperty(global.navigator, 'userAgent', {
  value: 'Mozilla/5.0 (Test Environment)',
  configurable: true,
})

// Create persistent mock functions
const mockInsert = jest.fn().mockResolvedValue({ data: null, error: null })
const mockFromReturn = {
  insert: mockInsert,
}
const mockFrom = jest.fn().mockReturnValue(mockFromReturn)

const mockSupabaseClient = {
  from: mockFrom,
}

jest.mock('@/lib/supabaseClientSSR', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}))

// Create a mock useProfile hook that can be controlled per test
let mockUseProfile: jest.Mock

jest.mock('@/app/providers/ProfileProvider', () => ({
  ...jest.requireActual('@/app/providers/ProfileProvider'),
  useProfile: () => mockUseProfile(),
}))

describe('useEventLogging', () => {
  beforeEach(() => {
    // Clear all mocks including the persistent ones
    jest.clearAllMocks()
    mockInsert.mockClear()
    mockFrom.mockClear()
    
    // Initialize mock function
    mockUseProfile = jest.fn().mockReturnValue({
      currentProfile: mockProfile,
      profiles: [mockProfile],
      allowedPatients: [],
      switchProfile: jest.fn(),
      refreshProfiles: jest.fn(),
      isLoading: false,
      error: null,
    })
    ;(global.crypto.randomUUID as jest.Mock).mockReturnValue('test-session-id')
  })

  it('should log events with correct structure', async () => {
    const { result } = renderHook(() => useEventLogging())

    await act(async () => {
      await result.current.logEvent('navigation', 'page_view', { page: '/dashboard' })
    })

    expect(mockFrom).toHaveBeenCalledWith('user_events')
    expect(mockInsert).toHaveBeenCalledWith({
      action: 'navigation.page_view',
      metadata: {
        page: '/dashboard',
        category: 'navigation',
        user_agent: 'Mozilla/5.0 (Test Environment)',
        timestamp: expect.any(String),
      },
      profile_id: mockProfile.id,
      session_id: 'test-session-id',
      privacy_level: 'internal',
    })
  })

  it('should sanitize PII from metadata', async () => {
    const { result } = renderHook(() => useEventLogging())

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
    const { result } = renderHook(() => useEventLogging())

    const longString = 'A'.repeat(300) // 300 characters
    
    await act(async () => {
      await result.current.logEvent('system', 'error', { long_field: longString })
    })

    const insertCall = mockInsert.mock.calls[0][0]
    expect(insertCall.metadata.long_field).toHaveLength(214) // 200 + "...[truncated]"
    expect(insertCall.metadata.long_field).toContain('...[truncated]')
  })

  it('should provide convenience methods for different event categories', async () => {
    const { result } = renderHook(() => useEventLogging())

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

    // Test data access logging (should be sensitive)
    await act(async () => {
      await result.current.logDataAccess('document_view', { document_id: 'doc-123' })
    })

    expect(mockInsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'data_access.document_view',
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
    const { result } = renderHook(() => useEventLogging())

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
    const { result } = renderHook(() => useEventLogging())

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
    // Mock useProfile to return no current profile
    mockUseProfile.mockReturnValue({
      currentProfile: null,
      profiles: [],
      allowedPatients: [],
      switchProfile: jest.fn(),
      refreshProfiles: jest.fn(),
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useEventLogging())

    await act(async () => {
      await result.current.logEvent('system', 'no_profile_event', {})
    })

    // Should not attempt to insert
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('Healthcare compliance for event logging', () => {
  beforeEach(() => {
    // Clear all mocks and reset
    jest.clearAllMocks()
    mockInsert.mockClear()
    mockFrom.mockClear()
    
    // Ensure we have a valid profile for healthcare tests
    mockUseProfile = jest.fn().mockReturnValue({
      currentProfile: mockProfile,
      profiles: [mockProfile],
      allowedPatients: [],
      switchProfile: jest.fn(),
      refreshProfiles: jest.fn(),
      isLoading: false,
      error: null,
    })
    ;(global.crypto.randomUUID as jest.Mock).mockReturnValue('test-session-id')
  })

  it('should maintain session consistency for audit trails', async () => {
    const { result } = renderHook(() => useEventLogging())

    // Log multiple events in same session
    await act(async () => {
      await result.current.logDataAccess('document_view', { document_id: 'doc-1' })
      await result.current.logDataAccess('document_download', { document_id: 'doc-1' })
    })

    const calls = mockInsert.mock.calls
    
    // Should have 2 successful calls
    expect(calls).toHaveLength(2)
    
    // Both events should have same session ID for audit trail
    expect(calls[0][0].session_id).toBe(calls[1][0].session_id)
    expect(calls[0][0].session_id).toBe('test-session-id')
  })

  it('should categorize healthcare events with appropriate privacy levels', async () => {
    const { result } = renderHook(() => useEventLogging())

    const testCases = [
      { method: 'logNavigation', expectedPrivacy: 'internal', params: ['tab_switch', {}] },
      { method: 'logInteraction', expectedPrivacy: 'internal', params: ['button_click', {}] },
      { method: 'logDataAccess', expectedPrivacy: 'sensitive', params: ['document_view', {}] },
      { method: 'logProfile', expectedPrivacy: 'internal', params: ['profile_switch', {}] },
      { method: 'logSystem', expectedPrivacy: 'public', params: ['app_start', {}] },
    ]

    for (let i = 0; i < testCases.length; i++) {
      const { method, expectedPrivacy, params } = testCases[i]
      
      await act(async () => {
        await (result.current as any)[method](...params)
      })
    }

    // Should have 5 calls, one for each method
    expect(mockInsert.mock.calls).toHaveLength(5)
    
    // Check each call's privacy level
    for (let i = 0; i < testCases.length; i++) {
      const { expectedPrivacy } = testCases[i]
      const currentCall = mockInsert.mock.calls[i][0]
      expect(currentCall.privacy_level).toBe(expectedPrivacy)
    }
  })
})