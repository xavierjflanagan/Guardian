# Guardian Frontend Development Guides

**Purpose:** Best practices, patterns, and practical guidance for Guardian frontend development  
**Audience:** Developers implementing Guardian components and features  
**Status:** Living documentation - updated with implementation learnings

---

## Development Guides

### [Getting Started Guide](./getting-started.md)
Complete setup guide for new developers joining the Guardian frontend project.

### [Component Development Guide](./component-development.md)
Best practices for creating new Guardian components following the standardized patterns.

### [State Management Guide](./state-management.md)
Complete guide to TanStack Query, React Context patterns, and healthcare-optimized data fetching strategies.

### [Testing Guide](./testing.md)
Comprehensive testing strategies for components, hooks, and integration scenarios.

### [Performance Guide](./performance.md)
Performance optimization techniques specific to healthcare data visualization.

### [Accessibility Guide](./accessibility.md)
Healthcare-specific accessibility requirements and implementation patterns.

### [Security Best Practices](./security.md)
Security considerations for healthcare data handling in frontend code.

### [Mobile Development Guide](./mobile.md)
Patterns for responsive design and mobile-specific features.

---

## Quick Reference

### Component Checklist (Unified Standards)
- [ ] Implements `GuardianComponentProps` with `componentContext` pattern
- [ ] Uses TanStack Query hooks with `profile_id` scoping
- [ ] Co-located Storybook story created
- [ ] Playwright test for critical flows included
- [ ] Uses capability detection where appropriate
- [ ] Includes proper error boundaries
- [ ] Has loading and empty states
- [ ] Includes accessibility attributes (WCAG 2.1 AA)
- [ ] Logs significant user events (PII-safe)
- [ ] Responsive design implemented
- [ ] Performance budget compliance verified

### Code Quality Checklist
- [ ] TypeScript strict mode compliance
- [ ] ESLint passes with no warnings
- [ ] Prettier formatting applied
- [ ] JSDoc comments for public APIs
- [ ] Unit tests with >80% coverage
- [ ] Integration tests for key flows
- [ ] Performance benchmarks met
- [ ] Accessibility audit passes

### Performance Checklist
- [ ] Bundle size within limits (<1MB initial)
- [ ] Lazy loading for non-critical components
- [ ] Virtual scrolling for large data sets
- [ ] Image optimization and loading
- [ ] Caching strategy implemented
- [ ] Real-time updates optimized
- [ ] Memory leaks prevented
- [ ] Mobile performance validated

---

## Development Patterns

### Standard Component Structure
```tsx
// components/[component-name]/index.tsx
import { ComponentProps } from './types';
import { useComponent } from './hooks';
import { ComponentView } from './view';

export function ComponentName(props: ComponentProps) {
  const state = useComponent(props);
  return <ComponentView {...props} {...state} />;
}

export type { ComponentProps };
export { useComponent };
```

### TanStack Query Hook Pattern (Healthcare-Optimized)
```typescript
// hooks/useHealthData.ts
export function useHealthData(profileId: string) {
  const query = useQuery({
    queryKey: ['health-data', profileId],
    queryFn: () => fetchHealthData(profileId),
    enabled: !!profileId,
    // Healthcare-specific defaults
    staleTime: 5 * 60 * 1000, // 5min (clinical data changes slowly)
    gcTime: 30 * 60 * 1000,   // 30min (preserve for offline)
    retry: 3,                 // Critical reliability
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const { logEvent } = useEventLogging();

  useEffect(() => {
    if (query.data) {
      logEvent('health_data_loaded', {
        // Never log PII - only metadata
        recordCount: query.data.length,
        queryTime: query.dataUpdatedAt,
        cacheStatus: query.status
      });
    }
  }, [query.data, profileId, logEvent]);

  return query;
}
```

### Error Handling Pattern
```tsx
// components/error-wrapper.tsx
export function withErrorBoundary<T>(
  Component: React.ComponentType<T>
) {
  return function WrappedComponent(props: T) {
    return (
      <ErrorBoundary
        fallback={<ComponentError />}
        onError={(error, errorInfo) => {
          logUserEvent('component_error', {
            component: Component.name,
            error: error.message,
            errorInfo
          });
        }}
      >
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
```

---

## Common Patterns

### Data Fetching with Profile Context
```typescript
// Profile-scoped data fetching that resolves appropriate ID types
function useProfileAwareData<T>(
  queryFn: (profileId: string) => Promise<T>,
  dependencies: any[] = []
) {
  const { currentProfile } = useProfile();
  
  return useQuery({
    queryKey: ['profile-data', currentProfile?.id, ...dependencies],
    queryFn: () => queryFn(currentProfile!.id), // Hook resolves patient_id(s) internally
    enabled: !!currentProfile,
  });
}

// Standardized helper: Database function for secure patient access
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
    staleTime: 5 * 60 * 1000, // Access rules change infrequently
    retry: 3,
  });
}

// Example: Clinical data using the secure helper
function useClinicalData(profileId: string) {
  const { data: allowedPatients } = useAllowedPatients(profileId);
  const patientIds = allowedPatients?.map(p => p.patient_id) || [];
  
  return useQuery({
    queryKey: ['clinical-data', profileId, patientIds],
    queryFn: () => fetchClinicalData(patientIds), // Secure: server-resolved patient_ids
    enabled: !!profileId && patientIds.length > 0,
    staleTime: 5 * 60 * 1000, // Healthcare defaults
    retry: 3,
  });
}

// Example: Profile-owned data (documents, settings, etc.)
function useProfileData(profileId: string) {
  return useQuery({
    queryKey: ['profile-data', profileId],
    queryFn: () => fetchProfileData(profileId), // Queries by profile_id
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000,
    retry: 3,
  });
}
```

### Real-time Subscription Pattern (Documents-First Strategy)
```typescript
// Real-time for document processing status only initially
function useDocumentProcessingUpdates(profileId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profileId) return;

    const subscription = supabase
      .channel(`documents-${profileId}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'documents',
          filter: `profile_id=eq.${profileId}`
        },
        (payload) => {
          // Update TanStack Query cache for real-time sync
          queryClient.setQueryData(
            ['documents', profileId], 
            (oldData: any) => updateDocumentInList(oldData, payload)
          );
          
          // Log processing events (no PII)
          logUserEvent('document_status_updated', {
            status: payload.new?.status,
            processingMethod: payload.new?.processing_method,
            confidenceScore: payload.new?.overall_confidence
          }, payload.new?.active_patient_id); // Include patient context
        }
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, [profileId, queryClient]);
}

// Other data uses fetch-first with TanStack Query caching
function useTimelineData(profileId: string) {
  return useQuery({
    queryKey: ['timeline', profileId],
    queryFn: () => fetchTimelineEvents(profileId),
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000, // 5min cache is sufficient
  });
}
```

### Event Logging Pattern
```typescript
function useTrackableAction<T extends any[]>(
  actionName: string,
  action: (...args: T) => void | Promise<void>
) {
  const { logEvent } = useEventLogging();

  return useCallback(async (...args: T) => {
    const startTime = performance.now();
    
    try {
      await action(...args);
      
      logEvent(`${actionName}_success`, {
        duration: performance.now() - startTime,
        args: sanitizeArgs(args)
      });
    } catch (error) {
      logEvent(`${actionName}_error`, {
        duration: performance.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        args: sanitizeArgs(args)
      });
      throw error;
    }
  }, [actionName, action, logEvent]);
}
```

---

## Troubleshooting

### Common Issues

#### Profile Context Not Updating
**Symptoms:** Components not re-rendering when profile switches
**Solution:** 
```tsx
// Ensure useProfile is used correctly
const { currentProfile } = useProfile();

// For clinical data, use the standardized helper
const { data: allowedPatients } = useAllowedPatients(currentProfile?.id);
const patientIds = allowedPatients?.map(p => p.patient_id) || [];

// Add both profile and patient dependencies to useEffect
useEffect(() => {
  // Your logic here
}, [currentProfile, patientIds]);

// For queries, include profile and resolved patient IDs in query key
const queryKey = ['clinical-data', currentProfile?.id, patientIds];
```

#### Real-time Subscriptions Not Working
**Symptoms:** Components not updating with live data
**Solution:**
```typescript
// Check RLS policies allow subscription
// Verify channel naming is unique
// Ensure proper cleanup
useEffect(() => {
  const subscription = supabase.channel(`unique-${Date.now()}`);
  // ... subscription setup
  return () => subscription.unsubscribe();
}, [dependency]);
```

#### Performance Issues with Large Data Sets
**Symptoms:** Slow rendering, high memory usage
**Solution:**
```tsx
// Use virtual scrolling
import { FixedSizeList as List } from 'react-window';

// Implement pagination
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['large-dataset'],
  queryFn: ({ pageParam = 0 }) => fetchPage(pageParam),
  getNextPageParam: (lastPage, pages) => lastPage.nextCursor,
});

// Use React.memo for expensive components
const ExpensiveComponent = React.memo(({ data }) => {
  // Expensive rendering logic
});
```

### Debugging Tips

#### Component Props Debugging
```tsx
// Add prop validation in development
if (process.env.NODE_ENV === 'development') {
  ComponentName.displayName = 'ComponentName';
  
  // Log props for debugging
  console.group(`${ComponentName.displayName} props:`);
  console.log(props);
  console.groupEnd();
}
```

#### State Debugging
```tsx
// Use React DevTools Profiler
// Add custom hooks for debugging
function useDebugValue(value: any, label: string) {
  React.useDebugValue(value, (val) => `${label}: ${JSON.stringify(val)}`);
  return value;
}
```

#### Performance Debugging
```tsx
// Add performance marks
function usePerformanceMarks(componentName: string) {
  useEffect(() => {
    performance.mark(`${componentName}-render-start`);
    return () => {
      performance.mark(`${componentName}-render-end`);
      performance.measure(
        `${componentName}-render`,
        `${componentName}-render-start`,
        `${componentName}-render-end`
      );
    };
  });
}
```

---

## Code Review Guidelines

### Review Checklist
- [ ] Component follows standardized interface pattern
- [ ] Error handling is comprehensive
- [ ] Performance considerations addressed
- [ ] Accessibility requirements met
- [ ] Security best practices followed
- [ ] Tests are comprehensive and meaningful
- [ ] Documentation is clear and complete
- [ ] Mobile responsiveness validated

### Review Process
1. **Automated Checks** - Linting, type checking, tests pass
2. **Functional Review** - Logic correctness, edge cases
3. **Design Review** - UI/UX consistency, accessibility
4. **Performance Review** - Bundle size, rendering performance
5. **Security Review** - Data handling, authentication
6. **Documentation Review** - Code comments, guides updated

---

## Deployment Guidelines

### Pre-deployment Checklist (Automated Quality Gates)
- [ ] All tests passing (unit, integration, e2e, Storybook)
- [ ] Lighthouse CI scores >90 across all metrics
- [ ] Bundle size <1MB (enforced by CI)
- [ ] TanStack Query cache performance verified
- [ ] WCAG 2.1 AA accessibility compliance (automated)
- [ ] Security review completed (healthcare data handling)
- [ ] Browser compatibility verified (modern browsers + mobile)
- [ ] Profile scoping consistency validated (`profile_id` only)
- [ ] Event logging PII-safety confirmed
- [ ] Error tracking configured
- [ ] Healthcare analytics implemented

### Deployment Process
1. **Staging Deployment** - Deploy to staging environment
2. **Integration Testing** - Run full test suite on staging
3. **User Acceptance Testing** - Validate with test users
4. **Performance Validation** - Confirm metrics on staging
5. **Production Deployment** - Deploy to production
6. **Smoke Testing** - Basic functionality verification
7. **Monitoring** - Watch for errors and performance issues

---

*These guides are living documents. Please update them as you discover new patterns, solve problems, or implement new features.*