import { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { ProfileProvider } from '@/app/providers/ProfileProvider'

// Healthcare-specific test data factories
export const createMockProfile = (overrides = {}) => ({
  id: 'test-profile-id',
  account_owner_id: 'test-user-id',
  profile_type: 'self',
  display_name: 'Test User',
  archived: false,
  created_at: '2023-01-01T00:00:00Z',
  ...overrides,
})

export const createMockDocument = (overrides = {}) => ({
  id: 'test-doc-id',
  filename: 'test-document.pdf',
  file_size: 1024000,
  mime_type: 'application/pdf',
  upload_date: '2023-01-01T00:00:00Z',
  processing_status: 'completed',
  patient_id: 'test-profile-id',
  confidence_score: 95,
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  ...overrides,
})

export const createMockMedicalData = (overrides = {}) => ({
  medications: [
    {
      name: 'Lisinopril',
      dosage: '10mg',
      frequency: 'Daily',
      start_date: '2023-01-01',
    },
  ],
  allergies: [
    {
      allergen: 'Peanuts',
      severity: 'severe',
      reaction: 'Anaphylaxis',
    },
  ],
  conditions: [
    {
      name: 'Hypertension',
      diagnosis_date: '2023-01-01',
      status: 'active',
    },
  ],
  vitals: [
    {
      type: 'blood_pressure',
      value: '120/80',
      unit: 'mmHg',
      date: '2023-01-01',
    },
  ],
  ...overrides,
})

export const createMockUserEvent = (overrides = {}) => ({
  id: 'test-event-id',
  action: 'navigation.page_view',
  metadata: {
    page: '/dashboard',
    timestamp: '2023-01-01T00:00:00Z',
  },
  profile_id: 'test-profile-id',
  session_id: 'test-session-id',
  privacy_level: 'internal' as const,
  created_at: '2023-01-01T00:00:00Z',
  ...overrides,
})

// Custom render with healthcare providers
interface CustomRenderOptions extends RenderOptions {
  profileProviderProps?: {
    initialProfile?: any
    initialProfiles?: any[]
    mockError?: string | null
  }
}

export function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {}
) {
  const { profileProviderProps, ...renderOptions } = options

  // Mock ProfileProvider if props are provided
  if (profileProviderProps) {
    const MockProfileProvider = ({ children }: { children: React.ReactNode }) => {
      // This would be a mock implementation for testing
      return <div data-testid="mock-profile-provider">{children}</div>
    }

    return render(ui, {
      wrapper: MockProfileProvider,
      ...renderOptions,
    })
  }

  // Default wrapper with real providers (for integration tests)
  function AllProviders({ children }: { children: React.ReactNode }) {
    return (
      <ProfileProvider>
        {children}
      </ProfileProvider>
    )
  }

  return render(ui, { wrapper: AllProviders, ...renderOptions })
}

// Healthcare-specific assertion helpers
export const expectHealthcareDataToBeValid = (data: any) => {
  expect(data).toHaveProperty('id')
  expect(data).toHaveProperty('created_at')
  expect(data.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
}

export const expectProfileToBeValid = (profile: any) => {
  expect(profile).toHaveProperty('id')
  expect(profile).toHaveProperty('display_name')
  expect(profile).toHaveProperty('profile_type')
  expect(profile).toHaveProperty('account_owner_id')
  expect(profile.archived).toBeDefined()
}

export const expectDocumentToBeValid = (document: any) => {
  expectHealthcareDataToBeValid(document)
  expect(document).toHaveProperty('filename')
  expect(document).toHaveProperty('patient_id')
  expect(document).toHaveProperty('processing_status')
  expect(['uploaded', 'processing', 'completed', 'failed']).toContain(document.processing_status)
}

export const expectEventToBeValid = (event: any) => {
  expectHealthcareDataToBeValid(event)
  expect(event).toHaveProperty('action')
  expect(event).toHaveProperty('profile_id')
  expect(event).toHaveProperty('session_id')
  expect(event).toHaveProperty('privacy_level')
  expect(['public', 'internal', 'sensitive']).toContain(event.privacy_level)
}

// Mock Supabase client factory
export const createMockSupabaseClient = (overrides = {}) => ({
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
    signOut: jest.fn().mockResolvedValue({ error: null }),
  },
  rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
  channel: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
    unsubscribe: jest.fn(),
  })),
  ...overrides,
})

// Privacy and compliance test helpers
export const expectNoPIIInObject = (obj: any) => {
  const piiFields = ['email', 'phone', 'ssn', 'medical_record_number', 'name', 'address']
  
  piiFields.forEach(field => {
    expect(obj).not.toHaveProperty(field)
  })
}

export const expectEventPrivacyLevel = (event: any, expectedLevel: string) => {
  expect(event.privacy_level).toBe(expectedLevel)
}

// Healthcare workflow test scenarios
export const simulateDocumentUpload = () => ({
  file: new File(['test content'], 'test-document.pdf', { type: 'application/pdf' }),
  metadata: {
    patient_id: 'test-profile-id',
    upload_date: new Date().toISOString(),
  },
})

export const simulateProfileSwitch = (fromProfile: any, toProfile: any) => ({
  from: fromProfile,
  to: toProfile,
  timestamp: new Date().toISOString(),
})

export const simulateHealthcareDataAccess = (dataType: string, profileId: string) => ({
  data_type: dataType,
  profile_id: profileId,
  access_timestamp: new Date().toISOString(),
  access_level: 'read',
})

// Error simulation helpers for resilience testing
export const simulateNetworkError = () => {
  throw new Error('Network request failed')
}

export const simulateAuthError = () => ({
  data: null,
  error: { message: 'Authentication failed', code: 'AUTH_ERROR' },
})

export const simulateDatabaseError = () => ({
  data: null,
  error: { message: 'Database connection failed', code: 'DB_ERROR' },
})

// Re-export testing-library utilities for convenience
export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'

// Dummy test to satisfy Jest (utils file shouldn't need tests)
if (process.env.NODE_ENV === 'test') {
  describe('Healthcare Test Utils', () => {
    it('should export utilities', () => {
      expect(createMockProfile).toBeDefined()
      expect(createMockDocument).toBeDefined()
      expect(createMockMedicalData).toBeDefined()
    })
  })
}