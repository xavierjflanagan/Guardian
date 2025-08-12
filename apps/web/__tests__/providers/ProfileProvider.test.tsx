import { render, screen, waitFor, act } from '@testing-library/react'
import { ProfileProvider, useProfile } from '@/app/providers/ProfileProvider'

// Suppress React 19 act() warnings for async operations in tests
const originalConsoleError = console.error
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('An update to ProfileProvider inside a test was not wrapped in act') ||
       args[0].includes('act(...)')
      )
    ) {
      return // Suppress these warnings - they're expected for async provider operations
    }
    originalConsoleError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalConsoleError
})

// Test component to use the ProfileProvider
function TestComponent() {
  const { currentProfile, profiles, isLoading, error } = useProfile()
  
  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>
  
  return (
    <div>
      <div data-testid="current-profile">
        {currentProfile?.display_name || 'No profile'}
      </div>
      <div data-testid="profiles-count">
        {profiles.length}
      </div>
    </div>
  )
}

// Mock Supabase auth user
const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
}

const mockProfiles = [
  {
    id: 'profile-1',
    account_owner_id: 'test-user-id',
    profile_type: 'self',
    display_name: 'John Doe',
    archived: false,
    created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: 'profile-2', 
    account_owner_id: 'test-user-id',
    profile_type: 'child',
    display_name: 'Jane Doe',
    archived: false,
    created_at: '2023-01-02T00:00:00Z',
  }
]

// Mock Supabase operations
const mockSupabaseClient = {
  auth: {
    getUser: jest.fn().mockResolvedValue({
      data: { user: mockUser },
      error: null,
    }),
  },
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({
      data: mockProfiles,
      error: null,
    }),
  })),
  rpc: jest.fn().mockResolvedValue({
    data: [{ patient_id: 'profile-1', access_type: 'owner', relationship: 'self' }],
    error: null,
  }),
}

jest.mock('@/lib/supabaseClientSSR', () => ({
  createClient: () => mockSupabaseClient,
}))

describe('ProfileProvider', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should provide profile context to children', async () => {
    render(
      <ProfileProvider>
        <TestComponent />
      </ProfileProvider>
    )

    // Wait for initial load state (might start with loading or go directly to loaded)
    await waitFor(() => {
      expect(screen.getByTestId('current-profile')).toBeInTheDocument()
    })

    // Should select 'self' profile by default after loading
    await waitFor(() => {
      expect(screen.getByTestId('current-profile')).toHaveTextContent('John Doe')
      expect(screen.getByTestId('profiles-count')).toHaveTextContent('2')
    })
  })

  it('should handle authentication errors gracefully', async () => {
    // Mock auth error
    mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Auth error' },
    })

    render(
      <ProfileProvider>
        <TestComponent />
      </ProfileProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('current-profile')).toHaveTextContent('No profile')
      expect(screen.getByTestId('profiles-count')).toHaveTextContent('0')
    })
  })

  it('should handle database errors gracefully', async () => {
    // Mock database error
    mockSupabaseClient.from.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      }),
    }))

    render(
      <ProfileProvider>
        <TestComponent />
      </ProfileProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument()
    })
  })

  it('should throw error when useProfile is used outside provider', () => {
    // Mock console.error to avoid noise in test output
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

    expect(() => {
      render(<TestComponent />)
    }).toThrow('useProfile must be used within a ProfileProvider')

    consoleSpy.mockRestore()
  })

  it('should prioritize self profile as default', async () => {
    const profilesWithChildFirst = [
      mockProfiles[1], // child profile first
      mockProfiles[0], // self profile second
    ]

    mockSupabaseClient.from.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(), 
      order: jest.fn().mockResolvedValue({
        data: profilesWithChildFirst,
        error: null,
      }),
    }))

    render(
      <ProfileProvider>
        <TestComponent />
      </ProfileProvider>
    )

    await waitFor(() => {
      // Should still select 'self' profile despite order
      expect(screen.getByTestId('current-profile')).toHaveTextContent('John Doe')
    })
  })
})

describe('Healthcare-specific ProfileProvider behavior', () => {
  it('should handle patient access resolution for healthcare data', async () => {
    const mockAllowedPatients = [
      { patient_id: 'profile-1', access_type: 'owner', relationship: 'self' },
      { patient_id: 'profile-2', access_type: 'guardian', relationship: 'child' },
    ]

    mockSupabaseClient.rpc.mockResolvedValueOnce({
      data: mockAllowedPatients,
      error: null,
    })

    render(
      <ProfileProvider>
        <TestComponent />
      </ProfileProvider>
    )

    await waitFor(() => {
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_allowed_patient_ids', {
        p_profile_id: 'profile-1', // Should call for the default profile
      })
    })
  })
})