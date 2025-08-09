# Guardian Component Library Specifications

**Purpose:** Detailed specifications for all Guardian frontend components  
**Status:** Implementation Ready  
**Component Standard:** Platform-aware with standardized interfaces

---

## Component Architecture Overview

All Guardian components follow the standardized interface pattern that enables platform thinking while maintaining pragmatic implementation.

### Unified Component Interface (Production Pattern)

```typescript
// Component Context Pattern - Prevents prop explosion
interface ComponentContext {
  user: User;
  permissions: Permission[];
  auditLog: boolean;
  encryptionLevel: 'standard' | 'enhanced' | 'zero-knowledge';
  privacyLevel: 'public' | 'internal' | 'sensitive';
}

interface GuardianComponentProps {
  profileId: string; // Always profile_id, never patient_id
  componentContext: ComponentContext; // Grouped context
  capabilities: Capability[];
  dateRange?: DateRange;
  onEvent?: (event: UserEvent) => void;
}

// TanStack Query Hook Pattern - Profile-scoped with patient resolution
function useComponentData<T>(
  profileId: string, 
  queryKey: string[], 
  fetcher: (profileId: string) => Promise<T>
) {
  return useQuery({
    queryKey: [queryKey, profileId],
    queryFn: () => fetcher(profileId), // Internally resolves patient_id(s) for clinical data
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000, // Healthcare defaults
    retry: 3,
  });
}

// Standardized profile-patient access hook (uses database helper)
function useAllowedPatients(profileId: string) {
  return useQuery({
    queryKey: ['allowed-patients', profileId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_allowed_patient_ids', { 
        p_profile_id: profileId 
      });
      if (error) throw error;
      return data;
    },
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000, // Access rules don't change frequently
    retry: 3,
  });
}

// Example: Clinical data hook using the standardized helper
function usePatientTimeline(profileId: string) {
  const { data: allowedPatients } = useAllowedPatients(profileId);
  const patientIds = allowedPatients?.map(p => p.patient_id) || [];
  
  return useQuery({
    queryKey: ['timeline', profileId, patientIds],
    queryFn: () => fetchTimelineForPatients(patientIds), // Secure: uses resolved patient_ids
    enabled: !!profileId && patientIds.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 3,
  });
}

// Example: Document data hook (owned by profile)
function useProfileDocuments(profileId: string) {
  return useQuery({
    queryKey: ['documents', profileId],
    queryFn: () => fetchDocumentsByProfile(profileId), // Queries by profile_id
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000,
    retry: 3,
  });
}

// Usage pattern for all components
<ComponentName
  profileId={currentProfile.id}
  componentContext={{
    user,
    permissions,
    auditLog,
    encryptionLevel,
    privacyLevel
  }}
  capabilities={deviceCapabilities}
  dateRange={selectedRange}
  onEvent={logUserEvent}
  {...specificProps}
/>
```

### Component Categories

- **[Data Display Components](./data-display.md)** - Health information visualization
- **[Input & Processing Components](./input-processing.md)** - Document upload and processing
- **[Profile & Family Components](./profile-family.md)** - Multi-profile management
- **[Intelligence Components](./intelligence.md)** - AI-powered insights and analysis
- **[System Components](./system.md)** - Utility and infrastructure components

### Development Guidelines

#### ✅ Do This
- Implement `componentContext` pattern to prevent prop explosion
- Use TanStack Query hooks with `profile_id` scoping in all data components
- Co-locate Storybook stories with components for documentation
- Include Playwright tests for critical user flows  
- Use capability detection for cross-platform features
- Include event logging for significant user interactions
- Design with multi-profile awareness from day one
- Implement proper loading and error states
- Add accessibility attributes (ARIA labels, roles)

#### ❌ Don't Do This
- Create components without standard interface
- Query clinical data directly by `patient_id` without profile resolution
- Skip Storybook stories for new components
- Hardcode single-profile assumptions
- Bypass privacy/audit logging
- Ignore mobile responsiveness
- Skip TypeScript interface definitions
- Create tight coupling between components

### Testing & Documentation Requirements

#### Storybook Stories (Co-located)
```typescript
// components/MedicationList/MedicationList.stories.tsx
export default {
  title: 'Components/MedicationList',
  component: MedicationList,
  parameters: {
    docs: {
      description: {
        component: 'Displays current medications with source attribution and confidence scores.'
      }
    }
  }
};

export const Default = {
  args: {
    profileId: 'test-profile-id',
    componentContext: mockComponentContext,
    capabilities: ['read', 'edit'],
  }
};
```

#### Component Testing Pattern
```typescript
// components/MedicationList/MedicationList.test.tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MedicationList } from './MedicationList';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

test('renders medications for given profile', async () => {
  // Mock the database helper function
  mockSupabaseRpc.mockResolvedValue({
    data: [
      { patient_id: 'patient-123', relationship: 'self', consent_scope: 'full' },
      { patient_id: 'patient-456', relationship: 'child', consent_scope: 'guardian' }
    ],
    error: null
  });

  render(
    <MedicationList 
      profileId="test-profile" 
      componentContext={mockContext}
      capabilities={['read']}
    />, 
    { wrapper: createWrapper() }
  );
  
  expect(await screen.findByText('Lisinopril 10mg')).toBeInTheDocument();
});
```

---

## Component Specifications

*Individual component specifications will be added as implementation progresses.*

### Core Priority Components (Week 3-4)
- [ ] HealthTimeline - Healthcare journey visualization
- [ ] MedicationList - Current medications display
- [ ] DocumentUploader - File upload with capability detection
- [ ] ProfileSwitcher - Family member navigation
- [ ] ProcessingStatus - Real-time job queue updates

### Extended Components (Week 5-6)
- [ ] AllergyPanel - Critical allergy information
- [ ] LabResultsChart - Trending lab values
- [ ] HealthInsights - AI-powered analysis
- [ ] CareGapDetector - Missing healthcare activities
- [ ] PrivacyIndicator - Data protection level display

### System Components (Week 7-8)
- [ ] SourceTracker - Document origin linking
- [ ] AuditTrail - Activity history
- [ ] ConfidenceScore - AI extraction confidence
- [ ] ErrorBoundary - Graceful failure handling
- [ ] LoadingState - Consistent loading experiences