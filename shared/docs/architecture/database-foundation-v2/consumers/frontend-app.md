# Frontend Application Consumer Guide

**Purpose:** Database integration guide for Guardian frontend developers  
**Target:** Next.js/React developers building Guardian's user interface  
**Reference:** [Database Foundation Core](../core/)

---

## Overview

This guide provides frontend developers with clear patterns for accessing Guardian's clinical database through API layers, focusing on user experience optimization and performance.

## Frontend Component → Database Mapping

### Profile Management UI

```yaml
profile_switcher_component:
  database_tables: ["user_profiles"]
  api_endpoints: ["/api/profiles", "/api/profiles/switch"]
  features:
    - Profile selection dropdown
    - Profile type indicators (self/child/pet badges)
    - Quick profile creation
  data_flow: "user_profiles → ProfileProvider → ProfileSwitcher"

profile_management_page:
  database_tables: ["user_profiles", "profile_access_permissions"]
  api_endpoints: ["/api/profiles/manage"]
  features:
    - Profile CRUD operations
    - Family member invitations
    - Profile archiving/activation
  reference: "../features/user-experience.md#profile-management"
```

### Healthcare Timeline UI

```yaml
timeline_component:
  database_tables: ["healthcare_timeline_events", "patient_clinical_events"]
  api_endpoints: ["/api/timeline", "/api/timeline/events"]
  features:
    - Chronological event display
    - Event categorization and filtering
    - Click-to-zoom document view
  performance_considerations:
    - Virtualized scrolling for large timelines
    - Lazy loading of event details
    - Optimistic updates for new events

timeline_filters:
  database_tables: ["healthcare_timeline_events"]
  api_endpoints: ["/api/timeline/filters"]
  filter_types:
    - Date ranges
    - Event categories (visit/test_result/treatment)
    - Healthcare providers
    - Event tags
```

### Clinical Data Display

```yaml
clinical_summary_component:
  database_tables: ["patient_clinical_events", "patient_observations", "patient_interventions"]
  api_endpoints: ["/api/clinical-summary"]
  features:
    - Latest results dashboard
    - Trending analysis (blood pressure, weight)
    - Alert indicators for abnormal values
  data_aggregation:
    - Most recent observations by type
    - Medication adherence tracking
    - Condition status summaries

health_records_page:
  database_tables: ["patient_clinical_events", "healthcare_encounters"]
  api_endpoints: ["/api/health-records"]
  features:
    - Comprehensive medical history
    - Provider visit summaries
    - Downloadable health reports
  performance: "Server-side pagination with 50 events per page"
```

### Smart Features UI

```yaml
smart_features_panel:
  database_tables: ["smart_health_features", "feature_activation_logs"]
  api_endpoints: ["/api/smart-features"]
  feature_types:
    pregnancy_panel:
      triggers: "Pregnancy-related clinical events"
      ui_elements: ["Prenatal appointment tracking", "Pregnancy timeline", "Care provider directory"]
    
    pediatric_panel:
      triggers: "Age < 18 or pediatric provider visits"
      ui_elements: ["Growth chart", "Immunization tracking", "School health forms"]
    
    veterinary_panel:
      triggers: "Animal species detected"
      ui_elements: ["Vet appointment scheduling", "Pet medication tracking", "Vaccination records"]

feature_activation_ui:
  database_tables: ["smart_health_features"]
  user_controls:
    - Manual feature activation/deactivation
    - Feature suggestion acceptance
    - Privacy controls for auto-activation
```

## API Integration Patterns

### Profile-Aware Data Fetching

```typescript
// Multi-profile data access pattern
import { useProfile } from '@/contexts/ProfileProvider';
import { useAllowedPatients } from '@/hooks/useAllowedPatients';

function ClinicalDataComponent() {
  const { currentProfile } = useProfile();
  const { patientIds, loading } = useAllowedPatients();
  
  // Fetch data for all accessible patients
  const { data: clinicalEvents } = useSWR(
    patientIds ? `/api/clinical-events?patient_ids=${patientIds.join(',')}` : null,
    fetcher
  );
  
  // Filter and display data specific to current profile
  const profileEvents = clinicalEvents?.filter(
    event => event.patient_id === currentProfile?.patient_id
  );
  
  return (
    <div>
      <ProfileBadge profile={currentProfile} />
      <EventsList events={profileEvents} />
    </div>
  );
}
```

### Optimistic Updates

```typescript
// Timeline event creation with optimistic updates
async function createTimelineEvent(eventData: TimelineEvent) {
  // Optimistically add to UI
  mutate('/api/timeline', 
    (data) => [...(data || []), { ...eventData, id: 'temp-' + Date.now() }], 
    false
  );
  
  try {
    // Submit to API
    const response = await fetch('/api/timeline', {
      method: 'POST',
      body: JSON.stringify(eventData)
    });
    
    // Revalidate with server data
    mutate('/api/timeline');
  } catch (error) {
    // Revert optimistic update on failure
    mutate('/api/timeline');
    throw error;
  }
}
```

### Real-time Updates

```typescript
// Real-time clinical event notifications
import { useRealtimeSubscription } from '@/hooks/useRealtime';

function ClinicalDashboard() {
  const { currentProfile } = useProfile();
  
  // Subscribe to real-time updates for current profile
  useRealtimeSubscription(
    'patient_clinical_events',
    {
      event: 'INSERT',
      schema: 'public',
      filter: `patient_id=eq.${currentProfile?.patient_id}`
    },
    (payload) => {
      // Show notification for new clinical event
      toast.success(`New ${payload.new.activity_type} added to your timeline`);
      
      // Update timeline cache
      mutate('/api/timeline');
    }
  );
  
  return <Dashboard />;
}
```

## Performance Optimization

### Data Loading Strategies

```yaml
timeline_loading:
  strategy: "Progressive loading with virtualization"
  initial_load: "50 most recent events"
  scroll_trigger: "Load 25 more events when 10 remaining"
  prefetch: "Next 25 events in background"

clinical_summary:
  strategy: "Cached aggregations with stale-while-revalidate"
  cache_duration: "5 minutes for clinical data"
  revalidation: "On profile switch or manual refresh"
  background_sync: "Every 30 minutes"

search_functionality:
  strategy: "Client-side search with server fallback"
  client_search_limit: "500 cached events"
  server_search: "Full-text search for larger datasets"
  debounce: "300ms for search input"
```

### Component Architecture

```typescript
// Efficient clinical data display with memoization
import React, { memo, useMemo } from 'react';

const ClinicalEventCard = memo(({ event }: { event: ClinicalEvent }) => {
  const eventIcon = useMemo(() => getEventIcon(event.activity_type), [event.activity_type]);
  const formattedDate = useMemo(() => formatEventDate(event.event_date), [event.event_date]);
  
  return (
    <div className="clinical-event-card">
      <div className="event-icon">{eventIcon}</div>
      <div className="event-content">
        <h3>{event.event_name}</h3>
        <p>{formattedDate}</p>
      </div>
    </div>
  );
});

// Virtualized timeline for large datasets
import { FixedSizeList as List } from 'react-window';

function VirtualizedTimeline({ events }: { events: TimelineEvent[] }) {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>
      <TimelineEventCard event={events[index]} />
    </div>
  );
  
  return (
    <List
      height={600}
      itemCount={events.length}
      itemSize={120}
      overscanCount={5}
    >
      {Row}
    </List>
  );
}
```

## State Management Patterns

### Profile Context Management

```typescript
// ProfileProvider for multi-profile state management
interface ProfileContextType {
  currentProfile: UserProfile | null;
  allProfiles: UserProfile[];
  switchProfile: (profileId: string) => Promise<void>;
  createProfile: (profileData: Partial<UserProfile>) => Promise<UserProfile>;
  loading: boolean;
  error: string | null;
}

export const ProfileProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  
  const switchProfile = useCallback(async (profileId: string) => {
    // Update current profile with optimistic UI update
    const newProfile = allProfiles.find(p => p.id === profileId);
    setCurrentProfile(newProfile || null);
    
    // Persist to server and update session
    await fetch('/api/profiles/switch', {
      method: 'POST',
      body: JSON.stringify({ profileId })
    });
    
    // Clear cached data for previous profile
    mutate(key => typeof key === 'string' && key.startsWith('/api/'));
  }, [allProfiles]);
  
  return (
    <ProfileContext.Provider value={{
      currentProfile,
      allProfiles,
      switchProfile,
      createProfile,
      loading,
      error
    }}>
      {children}
    </ProfileContext.Provider>
  );
};
```

### Clinical Data State

```typescript
// Custom hooks for clinical data management
export function useClinicalEvents(profileId?: string) {
  return useSWR(
    profileId ? `/api/clinical-events?profile_id=${profileId}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 60000 // 1 minute
    }
  );
}

export function useTimelineEvents(profileId?: string, filters?: TimelineFilters) {
  const filterString = filters ? new URLSearchParams(filters).toString() : '';
  
  return useSWR(
    profileId ? `/api/timeline?profile_id=${profileId}&${filterString}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      keepPreviousData: true
    }
  );
}
```

## Security & Access Control

### Profile Isolation

```typescript
// Ensure profile data isolation in components
function useProfileAccess() {
  const { currentProfile } = useProfile();
  const { user } = useAuth();
  
  const canAccessProfile = useCallback((profileId: string) => {
    // Only account owner can access their profiles
    return currentProfile?.account_owner_id === user?.id;
  }, [currentProfile, user]);
  
  const ensureProfileAccess = useCallback((profileId: string) => {
    if (!canAccessProfile(profileId)) {
      throw new Error('Unauthorized profile access');
    }
  }, [canAccessProfile]);
  
  return { canAccessProfile, ensureProfileAccess };
}
```

### Data Sanitization

```typescript
// Sanitize clinical data for display
function sanitizeClinicalData(event: ClinicalEvent): ClinicalEvent {
  return {
    ...event,
    // Remove any potential PII from AI extraction errors
    event_name: sanitizeString(event.event_name),
    // Ensure numeric values are properly formatted
    confidence_score: Math.round(event.confidence_score * 100) / 100
  };
}
```

## Error Handling & Fallbacks

### Graceful Degradation

```typescript
// Fallback UI for data loading failures
function ClinicalSummary() {
  const { currentProfile } = useProfile();
  const { data, error, loading } = useClinicalEvents(currentProfile?.id);
  
  if (loading) {
    return <ClinicalSummarySkeleton />;
  }
  
  if (error) {
    return (
      <ErrorBoundary fallback={
        <div className="clinical-summary-error">
          <h3>Unable to load clinical data</h3>
          <p>Please check your connection and try again.</p>
          <Button onClick={() => mutate(`/api/clinical-events?profile_id=${currentProfile?.id}`)}>
            Retry
          </Button>
        </div>
      }>
        <ClinicalSummaryContent data={[]} />
      </ErrorBoundary>
    );
  }
  
  return <ClinicalSummaryContent data={data} />;
}
```

### Offline Support

```typescript
// Offline-first clinical data access
export function useOfflineClinicalData(profileId?: string) {
  const { data, error } = useSWR(
    profileId ? `/api/clinical-events?profile_id=${profileId}` : null,
    fetcher,
    {
      fallbackData: getOfflineData(profileId), // From IndexedDB
      revalidateOnMount: true,
      onSuccess: (data) => {
        // Cache data offline
        setOfflineData(profileId, data);
      }
    }
  );
  
  return {
    data: data || getOfflineData(profileId),
    error,
    isOffline: !data && !!getOfflineData(profileId)
  };
}
```

## Testing Patterns

### Component Testing

```typescript
// Test profile-aware components
import { render, screen } from '@testing-library/react';
import { ProfileProvider } from '@/contexts/ProfileProvider';

const mockProfile: UserProfile = {
  id: 'profile-1',
  profile_type: 'self',
  display_name: 'John Doe',
  account_owner_id: 'user-1'
};

function renderWithProfile(component: React.ReactElement, profile = mockProfile) {
  return render(
    <ProfileProvider value={{ currentProfile: profile, /* ... */ }}>
      {component}
    </ProfileProvider>
  );
}

test('displays clinical events for current profile', async () => {
  // Mock API response
  fetchMock.mockResponseOnce(JSON.stringify([
    { id: '1', event_name: 'Blood Pressure Check', patient_id: 'user-1' }
  ]));
  
  renderWithProfile(<ClinicalSummary />);
  
  expect(await screen.findByText('Blood Pressure Check')).toBeInTheDocument();
});
```

### Integration Testing

```typescript
// Test profile switching flows
test('switches profiles and updates data', async () => {
  const { user } = renderWithProfile(<App />);
  
  // Switch to child profile
  await user.click(screen.getByText('Emma (Child)'));
  
  // Wait for profile switch and data reload
  await waitFor(() => {
    expect(screen.getByText('Emma\'s Health Timeline')).toBeInTheDocument();
  });
  
  // Verify child-specific data is displayed
  expect(screen.getByText('Pediatric Checkup')).toBeInTheDocument();
});
```

---

*This guide provides comprehensive frontend integration patterns for Guardian's database foundation, ensuring optimal user experience and performance.*