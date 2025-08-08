# Phase 1: Foundation & Shell Implementation

**Duration:** Weeks 1-2  
**Status:** Next Priority ⚡  
**Goal:** Create the platform-ready foundation and application shell

## 📋 Phase 1 Progress Tracker

### **Phase 0: Critical Fixes** ✅ COMPLETE
- [x] Database migrations (user_events, get_allowed_patient_ids)
- [x] ProfileProvider implementation  
- [x] ID semantics fixes (dashboard, flagEngine)
- [x] TypeScript branded types
- [x] Documentation updates

### **Week 1: Core Infrastructure**
**Task 1.1: Provider Hierarchy**
- [x] ProfileProvider (done in Phase 0)
- [ ] Install TanStack Query dependencies
- [x] ⚠️ Create unified Providers wrapper (INCOMPLETE - missing TanStack Query, other providers)
- [ ] Configure healthcare-optimized Query client
- [ ] TypeScript interfaces for all contexts

**Task 1.2: Application Shell**  
- [ ] Responsive shell layout (CSS Grid)
- [x] ⚠️ Header component with profile switcher placeholder (BASIC - needs dedicated component)
- [ ] Sidebar with tab navigation
- [ ] Main content area setup
- [ ] Mobile responsiveness

**Task 1.3: Profile Switching UI**
- [x] ✅ ProfileSwitcher component (COMPLETE - well implemented)
- [ ] Avatar and dropdown menu
- [ ] Profile switching animations
- [ ] Add profile functionality
- [x] ✅ Profile context integration (COMPLETE)

### **Week 2: Integration & Events**
**Task 2.1: Real-time Integration**
- [ ] Document subscription setup
- [ ] Timeline event subscriptions  
- [ ] Profile-filtered real-time updates
- [ ] Connection status monitoring
- [ ] Error handling for subscriptions

**Task 2.2: Event Logging**
- [x] user_events table created (Phase 0)
- [ ] Event logging hooks implementation
- [ ] Privacy-aware event capture
- [ ] Client-side rate limiting
- [ ] Event categories standardization

**Task 2.3: Error Boundaries**
- [ ] ErrorBoundary components
- [ ] Graceful error recovery
- [ ] Error logging integration
- [ ] User-friendly error messages
- [ ] Error reporting system

**Task 2.4: CI/CD Quality Gates**
- [ ] GitHub Actions workflow
- [ ] Performance budgets setup
- [ ] Bundle size monitoring
- [ ] Accessibility testing automation
- [ ] Lighthouse CI integration

### **Testing & Quality**
- [ ] Unit tests for providers
- [ ] Integration tests for real-time
- [ ] Performance benchmarks
- [ ] Accessibility audit passing
- [x] TypeScript zero errors

---

## Overview

Phase 1 establishes the architectural foundation that enables all future platform capabilities while using pragmatic Next.js patterns. This phase focuses on the "invisible" infrastructure that makes everything else possible.

## Week 1: Core Infrastructure

### Task 1.1: Hierarchical Context Architecture

Create the provider hierarchy that manages global application state:

```tsx
// app/providers.tsx
'use client';

import { createContext, useContext, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { Profile, Permissions, PrivacySettings } from '@/types';

// Auth Provider - Authentication state
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Implementation details...
  return (
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>
  );
}

// Profile Provider - Multi-profile management
interface ProfileContextType {
  currentProfile: Profile | null;
  profiles: Profile[];
  switchProfile: (profileId: string) => Promise<void>;
  permissions: Permissions;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  // Implementation details...
  return (
    <ProfileContext.Provider value={profileValue}>
      {children}
    </ProfileContext.Provider>
  );
}

// Privacy Provider - Data protection controls
interface PrivacyContextType {
  encryptionLevel: 'standard' | 'enhanced' | 'zero-knowledge';
  auditLog: boolean;
  dataRetention: 'user-controlled' | 'minimal' | 'comprehensive';
  upgradeToZeroKnowledge: () => Promise<void>;
}

// Continue pattern for DataProvider, NotificationProvider, CapabilityProvider...

// Single Providers wrapper - CORRECTED PATTERN
export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ProfileProvider>
        <PrivacyProvider>
          <QueryClientProvider client={queryClient}>
            <NotificationProvider>
              {children}
            </NotificationProvider>
          </QueryClientProvider>
        </PrivacyProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}
```

**Deliverable 1.1:**
- [ ] Context hierarchy implemented and tested
- [ ] TypeScript interfaces defined for all contexts
- [ ] Provider composition working in app layout
- [ ] TanStack Query client configured with healthcare defaults

### Task 1.1.1: TanStack Query Configuration

Set up TanStack Query with healthcare-optimized defaults:

```tsx
// lib/queryClient.ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// Healthcare-optimized query client configuration
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Clinical data changes slowly - longer cache times appropriate
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000,   // 30 minutes (preserve for offline scenarios)
      retry: 3,                 // Critical for healthcare reliability
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false, // Prevent excessive API calls
      refetchOnReconnect: true,    // Sync when connection restored
    },
    mutations: {
      retry: 2, // Retry failed mutations
      onError: (error) => {
        // Global error handling for mutations
        console.error('Mutation failed:', error);
        // Log to monitoring service
      }
    }
  }
});

// SSR-compatible hydration setup
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}

// Profile-scoped hooks that internally resolve data access patterns
export function useDocuments(profileId: string) {
  // Documents are owned by profiles
  return useQuery({
    queryKey: ['documents', profileId],
    queryFn: () => fetchDocuments(profileId), // Queries by profile_id
    enabled: !!profileId,
  });
}

export function useTimeline(profileId: string, options?: { dateRange?: DateRange }) {
  // Timeline data belongs to patients - hook resolves to allowed patient_id(s)
  return useQuery({
    queryKey: ['timeline', profileId, options],
    queryFn: () => fetchTimeline(profileId, options), // Internally resolves patient_id(s)
    enabled: !!profileId,
  });
}

// Profile→Patient Resolution Architecture Decision
// TODO: Choose implementation approach before Phase 2

/**
 * PROFILE→PATIENT ACCESS HELPER: Database Function Implementation
 * 
 * Implementation: Database helper function that centralizes profile→patient access logic
 * Location: See docs/architecture/database-foundation/core/profile-patient-access.md
 * 
 * Database Function:
 * CREATE FUNCTION get_allowed_patient_ids(p_profile_id uuid)
 * RETURNS TABLE(patient_id uuid, relationship text, consent_scope text, valid_until timestamptz)
 * 
 * Benefits:
 * - Single source of truth for access rules
 * - Security: Server-side logic prevents client-side bypass
 * - Performance: Optimized joins and caching
 * - Maintainability: Update access rules in one place
 * - Future-proof: Handles adolescent privacy, emergency access, custody arrangements
 * 
 * Frontend Integration:
 */

// Profile-Patient access hook using database helper
export function useAllowedPatients(profileId: string) {
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
    staleTime: 5 * 60 * 1000, // 5min cache (access doesn't change frequently)
    retry: 3,
  });
}

// Updated timeline hook using the helper
export function useTimeline(profileId: string, options?: { dateRange?: DateRange }) {
  const { data: allowedPatients } = useAllowedPatients(profileId);
  const patientIds = allowedPatients?.map(p => p.patient_id) || [];
  
  return useQuery({
    queryKey: ['timeline', profileId, patientIds, options],
    queryFn: () => fetchTimelineForPatients(patientIds, options),
    enabled: !!profileId && patientIds.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 3,
  });
}
```

### Task 1.2: Application Shell Structure

Create the main layout with navigation and content areas:

```tsx
// app/layout.tsx
import { Providers } from './providers';
import { Shell } from '@/components/shell';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Shell>
            {children}
          </Shell>
        </Providers>
      </body>
    </html>
  );
}

// components/shell/index.tsx
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="guardian-shell">
      <Header />
      <Sidebar />
      <MainContent>
        {children}
      </MainContent>
    </div>
  );
}
```

**Shell Layout Structure:**
```css
/* styles/shell.css - CSS Grid for flexible layouts */
.guardian-shell {
  display: grid;
  grid-template-areas: 
    "header header"
    "sidebar main";
  grid-template-rows: auto 1fr;
  grid-template-columns: 280px 1fr;
  min-height: 100vh;
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .guardian-shell {
    grid-template-areas:
      "header"
      "main"
      "nav";
    grid-template-rows: auto 1fr auto;
    grid-template-columns: 1fr;
  }
}
```

**Deliverable 1.2:**
- [ ] Responsive shell layout implemented
- [ ] Header with profile switcher placeholder
- [ ] Sidebar with tab navigation
- [ ] Main content area ready for tabs

### Task 1.3: Profile Switching Infrastructure

Implement the core multi-profile management:

```tsx
// components/profile-switcher.tsx
import { useProfile } from '@/hooks/useProfile';
import { Profile } from '@/types';

export function ProfileSwitcher() {
  const { currentProfile, profiles, switchProfile, isLoading } = useProfile();

  return (
    <div className="profile-switcher">
      <button className="current-profile">
        <Avatar profile={currentProfile} />
        <span>{currentProfile?.name}</span>
      </button>
      
      <DropdownMenu>
        {profiles.map(profile => (
          <ProfileOption
            key={profile.id}
            profile={profile}
            isActive={profile.id === currentProfile?.id}
            onClick={() => switchProfile(profile.id)}
          />
        ))}
        <AddProfileOption />
      </DropdownMenu>
    </div>
  );
}

// hooks/useProfile.ts
export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider');
  }
  return context;
}
```

**Deliverable 1.3:**
- [ ] Profile switcher component functional
- [ ] Profile context updates properly
- [ ] Database queries filtered by profile
- [ ] Profile relationships handled correctly

## Week 2: Integration & Events

### Task 2.1: Supabase Real-time Integration

Set up real-time subscriptions for live data updates:

```tsx
// hooks/useRealtime.ts
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useProfile } from './useProfile';

export function useRealtime() {
  const { currentProfile } = useProfile();

  useEffect(() => {
    if (!currentProfile) return;

    // Subscribe to document processing updates
    const documentsSubscription = supabase
      .channel('documents')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'documents',
          filter: `profile_id=eq.${currentProfile.id}`
        },
        (payload) => {
          // Handle document updates
          handleDocumentUpdate(payload);
        }
      )
      .subscribe();

    // Subscribe to timeline events
    const timelineSubscription = supabase
      .channel('timeline')
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'healthcare_timeline_events',
          filter: `patient_id=eq.${currentProfile.id}`
        },
        (payload) => {
          handleTimelineUpdate(payload);
        }
      )
      .subscribe();

    return () => {
      documentsSubscription.unsubscribe();
      timelineSubscription.unsubscribe();
    };
  }, [currentProfile]);
}
```

**Deliverable 2.1:**
- [ ] Real-time subscriptions working for documents
- [ ] Timeline updates in real-time
- [ ] Profile-filtered subscriptions
- [ ] Connection status monitoring

### Task 2.2: Event Logging System

Implement user event tracking for future AI features:

```tsx
// lib/analytics.ts
interface UserEvent {
  id: string;
  action: string;
  metadata: JsonValue; // No PII ever
  profile_id: string;
  active_patient_id?: string; // Which patient context (for mother-child flows)
  session_id: string;
  timestamp: string;
  privacy_level: 'public' | 'internal' | 'sensitive';
  user_agent_hash?: string; // For security monitoring
  created_at: string; // For retention management
}

export async function logUserEvent(
  action: string, 
  metadata: Record<string, any>
) {
  const { currentProfile } = useProfile();
  const { privacySettings } = usePrivacy();
  
  if (!privacySettings.eventLogging) return;

  const event: UserEvent = {
    action,
    metadata: sanitizeMetadata(metadata),
    profile_id: currentProfile.id,
    session_id: getCurrentSession().id,
    timestamp: new Date(),
    privacy_level: privacySettings.encryptionLevel
  };

  // Client-side rate limiting
  if (!eventLogger.canLog(currentProfile.id)) {
    return; // Skip if rate limited
  }

  await supabase.from('user_events').insert(event);
}

// Client-side rate limiting implementation
class EventLogger {
  private eventCounts = new Map<string, { count: number; resetTime: number }>();
  private readonly RATE_LIMIT = 100; // events per minute
  private readonly WINDOW_MS = 60000; // 1 minute

  canLog(profileId: string): boolean {
    const now = Date.now();
    const key = profileId;
    const bucket = this.eventCounts.get(key) || { count: 0, resetTime: now + this.WINDOW_MS };
    
    if (now > bucket.resetTime) {
      bucket.count = 0;
      bucket.resetTime = now + this.WINDOW_MS;
    }
    
    if (bucket.count >= this.RATE_LIMIT) {
      console.warn(`Event logging rate limit exceeded for profile ${profileId}`);
      return false;
    }
    
    bucket.count++;
    this.eventCounts.set(key, bucket);
    return true;
  }
}

const eventLogger = new EventLogger();

// Usage throughout application
export function useEventLogging() {
  return { logUserEvent };
}

/**
 * DATABASE SCHEMA: user_events table with retention and RLS
 * 
 * CREATE TABLE user_events (
 *   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   action text NOT NULL,
 *   metadata jsonb DEFAULT '{}',
 *   profile_id uuid NOT NULL REFERENCES auth.users(id),
 *   active_patient_id uuid REFERENCES auth.users(id),
 *   session_id text NOT NULL,
 *   timestamp timestamptz NOT NULL DEFAULT now(),
 *   privacy_level text NOT NULL CHECK (privacy_level IN ('public', 'internal', 'sensitive')),
 *   user_agent_hash text,
 *   created_at timestamptz NOT NULL DEFAULT now()
 * );
 * 
 * -- Retention: Auto-delete after 90 days
 * SELECT cron.schedule('cleanup-user-events', '0 2 * * *', 
 *   'DELETE FROM user_events WHERE created_at < now() - interval ''90 days''');
 * 
 * -- RLS: Events readable only by owning profile
 * ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;
 * 
 * CREATE POLICY "Users can view own events" ON user_events
 *   FOR SELECT USING (profile_id = auth.uid());
 * 
 * CREATE POLICY "Users can insert own events" ON user_events  
 *   FOR INSERT WITH CHECK (profile_id = auth.uid());
 * 
 * -- Index for efficient queries and cleanup
 * CREATE INDEX user_events_profile_created_idx ON user_events(profile_id, created_at);
 * CREATE INDEX user_events_cleanup_idx ON user_events(created_at) WHERE created_at < now() - interval '60 days';
 */
```

**Event Categories:**
- `navigation` - Tab switches, page views
- `interaction` - Clicks, form submissions, selections
- `data_access` - Document views, timeline filters
- `profile` - Profile switches, permission changes

**Deliverable 2.2:**
- [ ] Event logging system operational
- [ ] Privacy-aware event capture
- [ ] Event categories standardized
- [ ] Database table for events created

### Task 2.3: Error Boundaries & Fallbacks

Implement comprehensive error handling:

```tsx
// components/error-boundary.tsx
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }: any) {
  return (
    <div className="error-fallback">
      <h2>Something went wrong</h2>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>
        Try again
      </button>
    </div>
  );
}

export function GuardianErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, errorInfo) => {
        logUserEvent('error_boundary_triggered', {
          error: error.message,
          stack: error.stack,
          errorInfo
        });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
```

**Deliverable 2.3:**
- [ ] Error boundaries at key levels
- [ ] Graceful error recovery
- [ ] Error logging and reporting
- [ ] User-friendly error messages

### Task 2.4: CI/CD Quality Gates

Set up automated performance and accessibility monitoring:

```yaml
# .github/workflows/frontend-quality.yml
name: Frontend Quality Gates

on: [push, pull_request]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: npm run build
      
      # Next.js bundle analysis
      - name: Analyze bundle size
        run: ANALYZE=true npm run build
        
      # Lighthouse CI for performance
      - name: Lighthouse CI
        run: |
          npm install -g @lhci/cli
          lhci autorun --collect.numberOfRuns=3 --assert.preset=lighthouse:recommended
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}

  quality:
    runs-on: ubuntu-latest  
    steps:
      - uses: actions/checkout@v4
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:coverage
      
      # Accessibility testing
      - name: Accessibility audit
        run: npx @axe-core/cli build/ --tags wcag2a,wcag2aa
```

**Performance Budgets:**
- Initial bundle size: <1MB
- Page load time: <500ms (3G)
- UI updates: <100ms
- Lighthouse scores: >90 across all metrics
- Bundle analysis reports on size increases >10%

**Quality Gates:**
- TypeScript: Zero compilation errors
- ESLint: Zero errors, warnings allowed
- Test coverage: >80% for new code
- Accessibility: WCAG 2.1 AA compliance

**Deliverable 2.4:**
- [ ] CI pipeline configured with quality gates
- [ ] Performance budgets enforced
- [ ] Bundle size monitoring active
- [ ] Accessibility testing automated

## Capability Detection System

Implement device/browser capability detection for cross-platform support:

```tsx
// hooks/useCapabilities.ts
export function useCapabilities() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);

  useEffect(() => {
    const detected: Capability[] = [];

    // Camera access
    if (navigator.mediaDevices?.getUserMedia) {
      detected.push('camera');
    }

    // Drag and drop
    if ('ondrop' in window) {
      detected.push('drag-drop');
    }

    // Touch interface
    if ('ontouchstart' in window) {
      detected.push('touch');
    }

    // File system access
    if ('showOpenFilePicker' in window) {
      detected.push('file-system-access');
    }

    // Push notifications
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      detected.push('push-notifications');
    }

    setCapabilities(detected);
  }, []);

  return capabilities;
}
```

---

## Testing Requirements

### Unit Tests
- [ ] Context providers function correctly
- [ ] Profile switching updates state
- [ ] Error boundaries catch errors
- [ ] Event logging captures events

### Integration Tests
- [ ] Real-time subscriptions receive updates
- [ ] Profile context filters data correctly
- [ ] Navigation between tabs works
- [ ] Error recovery functions properly

### Performance Tests
- [ ] Initial page load <500ms
- [ ] Profile switching <200ms
- [ ] Real-time updates <100ms latency
- [ ] Bundle size within limits

---

## Success Criteria

**Week 1 Complete:**
- ✅ Context hierarchy implemented and tested
- ✅ Application shell responsive and functional
- ✅ Profile switching infrastructure working
- ✅ Basic navigation between tabs operational

**Week 2 Complete:**
- ✅ Real-time Supabase integration functional
- ✅ Event logging capturing user interactions
- ✅ Error boundaries protecting application
- ✅ Capability detection system operational
- ✅ Ready for component library development

**Quality Gates:**
- All TypeScript compilation errors resolved
- Test coverage >80% for new code
- Lighthouse performance score >90
- Accessibility audit passes (basic level)
- Real-time updates working reliably

---

## Common Issues & Solutions

**Issue:** Profile context not updating components
**Solution:** Ensure useProfile hook is used correctly and components are wrapped in ProfileProvider

**Issue:** Real-time subscriptions not receiving updates
**Solution:** Check RLS policies and ensure profile filtering is correct

**Issue:** Event logging not capturing events
**Solution:** Verify privacy settings allow event logging and database permissions

**Issue:** Layout breaking on mobile
**Solution:** Test responsive CSS Grid configuration and viewport meta tag

---

**Next Phase:** [Phase 2: Component Library](./phase-2-components.md)